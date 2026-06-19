import { parseCookie } from './cookie.js';
import { jsonError } from './response.js';

const DEFAULT_PASSWORD = 'Electronic123';
const COOKIE_NAME = 'gf_admin_session';
const SESSION_SECONDS = 7 * 24 * 60 * 60;

export function getAdminPassword(env) {
  return env.GAME_FACTORY_ADMIN_PASSWORD
    || env.ADMIN_PASSWORD
    || DEFAULT_PASSWORD;
}

export function getSessionSecret(env) {
  return env.GAME_FACTORY_ADMIN_SESSION_SECRET
    || env.ADMIN_SESSION_SECRET
    || env.ADMIN_TOKEN
    || getAdminPassword(env);
}

function base64url(bytes) {
  let bin = '';
  for (const b of new Uint8Array(bytes)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function hmac(payload, secret) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return base64url(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload)));
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
  return safeEqual(String(password || ''), getAdminPassword(env));
}

export async function createAdminCookie(request, env) {
  const expires = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  const nonce = crypto.randomUUID().replace(/-/g, '');
  const payload = `v1.${expires}.${nonce}`;
  const sig = await hmac(payload, getSessionSecret(env));
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${COOKIE_NAME}=${payload}.${sig}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_SECONDS}${secure}`;
}

export function clearAdminCookie(request) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

export async function isAdminRequest(request, env) {
  const url = new URL(request.url);
  const legacyToken = url.searchParams.get('token') || request.headers.get('x-admin-token') || '';
  if (legacyToken && env.ADMIN_TOKEN && legacyToken === env.ADMIN_TOKEN) return true;

  const value = parseCookie(request.headers.get('Cookie') || '', COOKIE_NAME);
  if (!value) return false;
  const parts = value.split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') return false;
  const expires = Number(parts[1]);
  if (!Number.isFinite(expires) || expires < Math.floor(Date.now() / 1000)) return false;
  const payload = parts.slice(0, 3).join('.');
  const expected = await hmac(payload, getSessionSecret(env));
  return safeEqual(parts[3], expected);
}

export async function requireAdmin(request, env) {
  if (await isAdminRequest(request, env)) return null;
  return jsonError('forbidden', 403);
}
