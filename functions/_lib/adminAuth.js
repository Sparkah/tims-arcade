import { parseCookie } from './cookie.js';
import { hmacSha256 } from './crypto.js';
import { jsonError, sameOriginOk } from './response.js';
import { readSession } from '../api/_session.js';

const COOKIE_NAME = 'gf_admin_session';
const SESSION_SECONDS = 7 * 24 * 60 * 60;

export function getAdminPassword(env = {}) {
  return env.GAME_FACTORY_ADMIN_PASSWORD
    || env.ADMIN_PASSWORD
    || '';
}

export function getSessionSecret(env = {}) {
  return env.GAME_FACTORY_ADMIN_SESSION_SECRET
    || env.ADMIN_SESSION_SECRET
    || env.SESSION_SECRET
    || '';
}

export function safeEqual(a, b) {
  a = String(a || '');
  b = String(b || '');
  let diff = a.length ^ b.length;
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

export async function passwordMatches(password, env) {
  const configured = getAdminPassword(env);
  return !!configured && safeEqual(String(password || ''), configured);
}

export function getAdminToken(env = {}) {
  return env.ADMIN_TOKEN || '';
}

export async function createAdminCookie(request, env) {
  const secret = getSessionSecret(env);
  if (!secret) throw new Error('admin session secret is not configured');
  const expires = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  const nonce = crypto.randomUUID().replace(/-/g, '');
  const payload = `v1.${expires}.${nonce}`;
  const sig = await hmacSha256(payload, secret);
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${COOKIE_NAME}=${payload}.${sig}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_SECONDS}${secure}`;
}

export function clearAdminCookie(request) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

export function adminUrlTokenRejected(request) {
  const url = new URL(request.url);
  return url.searchParams.has('token') || url.searchParams.has('admin_token');
}

export function getAdminEmails(env = {}) {
  return String(env.ADMIN_EMAILS || env.GAME_FACTORY_ADMIN_EMAILS || '')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
}

export function hasAdminEmailAllowlist(env = {}) {
  return getAdminEmails(env).length > 0;
}

export async function isAllowedAdminSession(request, env) {
  const allowed = getAdminEmails(env);
  if (!allowed.length) return false;
  let session;
  try { session = await readSession(request, env); } catch (_) { return false; }
  const email = String(session && session.email || '').trim().toLowerCase();
  if (!email) return false;
  for (const entry of allowed) {
    if (safeEqual(email, entry)) return true;
  }
  return false;
}

export function isAdminTokenRequest(request, env) {
  if (adminUrlTokenRejected(request)) return false;
  const configured = getAdminToken(env);
  const supplied = request.headers.get('x-admin-token') || '';
  if (isBrowserLikeRequest(request) && !browserAdminTokensAllowed(env)) return false;
  return !!configured && !!supplied && safeEqual(supplied, configured);
}

export function isAdminMutation(request) {
  const method = String(request.method || 'GET').toUpperCase();
  return !['GET', 'HEAD', 'OPTIONS'].includes(method);
}

export function isBrowserLikeRequest(request) {
  return request.headers.has('Origin')
    || request.headers.has('Sec-Fetch-Site')
    || request.headers.has('Sec-Fetch-Mode')
    || request.headers.has('Sec-Fetch-Dest');
}

export function browserAdminTokensAllowed(env = {}) {
  if (!hasAdminEmailAllowlist(env)) return true;
  return String(env.ALLOW_BROWSER_ADMIN_TOKEN || '').trim() === '1';
}

export async function isAdminRequest(request, env) {
  if (adminUrlTokenRejected(request)) return false;

  if (await isAllowedAdminSession(request, env)) return true;
  if (isAdminTokenRequest(request, env)) return true;

  // Password-issued admin cookies are a local/transitional fallback only. Once
  // ADMIN_EMAILS is configured, signed-in email sessions are the browser-admin
  // gate. Header bearer tokens remain timing-safe and URL-rejected, but browser
  // requests cannot use them unless ALLOW_BROWSER_ADMIN_TOKEN=1 is set.
  if (hasAdminEmailAllowlist(env)) return false;

  const value = parseCookie(request.headers.get('Cookie') || '', COOKIE_NAME);
  if (!value) return false;
  const secret = getSessionSecret(env);
  if (!secret) return false;
  const parts = value.split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') return false;
  const expires = Number(parts[1]);
  if (!Number.isFinite(expires) || expires < Math.floor(Date.now() / 1000)) return false;
  const payload = parts.slice(0, 3).join('.');
  const expected = await hmacSha256(payload, secret);
  return safeEqual(parts[3], expected);
}

export async function requireAdmin(request, env) {
  if (adminUrlTokenRejected(request)) return jsonError('url_admin_token_rejected', 400);
  if (isAdminMutation(request) && !sameOriginOk(request)) return jsonError('forbidden', 403);
  if (await isAdminRequest(request, env)) return null;
  return jsonError('forbidden', 403);
}

export function getRelayToken(env = {}) {
  return env.GAME_FACTORY_RELAY_TOKEN || env.RELAY_TOKEN || '';
}

export async function isRelayRequest(request, env) {
  if (adminUrlTokenRejected(request)) return false;
  const configured = getRelayToken(env);
  const supplied = request.headers.get('x-relay-token') || '';
  if (configured && supplied && safeEqual(supplied, configured)) return true;
  return false;
}

export async function requireRelay(request, env) {
  if (adminUrlTokenRejected(request)) return jsonError('url_admin_token_rejected', 400);
  const configured = getRelayToken(env);
  if (!configured) return jsonError('relay_token_not_configured', 500);
  const supplied = request.headers.get('x-relay-token') || '';
  if (supplied && safeEqual(supplied, configured)) return null;
  return jsonError('forbidden', 403);
}
