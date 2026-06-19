import { parseCookie } from './cookie.js';
import { hmacSha256 } from './crypto.js';
import { jsonError } from './response.js';

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
    || env.ADMIN_TOKEN
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

export async function isAdminRequest(request, env) {
  const legacyToken = request.headers.get('x-admin-token') || '';
  if (legacyToken && env.ADMIN_TOKEN && safeEqual(legacyToken, env.ADMIN_TOKEN)) return true;

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
  if (await isAdminRequest(request, env)) return null;
  return jsonError('forbidden', 403);
}
