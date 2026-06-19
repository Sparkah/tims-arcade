import { getAdminPassword, getSessionSecret, isAdminRequest, safeEqual } from './adminAuth.js';
import { parseCookie } from './cookie.js';
import { base64url, fromBase64url, hmacSha256 } from './crypto.js';

const COOKIE_PREFIX = 'gf_editor_';
const SESSION_SECONDS = 3 * 24 * 60 * 60;
const HASH_ITERATIONS = 100000;

export function accessKey(slug) {
  return `game-editor:${slug}:access`;
}

function cookieName(slug) {
  return COOKIE_PREFIX + String(slug || '').replace(/[^a-z0-9_-]/g, '_');
}

function secureSuffix(request) {
  return new URL(request.url).protocol === 'https:' ? '; Secure' : '';
}

async function pbkdf2(password, salt, iterations = HASH_ITERATIONS) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(String(password || '')),
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    key,
    256,
  );
  return new Uint8Array(bits);
}

export async function makeEditorPasswordRecord(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt);
  return {
    algorithm: 'PBKDF2-SHA256',
    iterations: HASH_ITERATIONS,
    salt: base64url(salt),
    hash: base64url(hash),
    updatedAt: new Date().toISOString(),
  };
}

export async function verifyPasswordRecord(password, record) {
  if (!record || record.algorithm !== 'PBKDF2-SHA256' || !record.salt || !record.hash) return false;
  const salt = fromBase64url(record.salt);
  const actual = base64url(await pbkdf2(password, salt, Number(record.iterations) || HASH_ITERATIONS));
  return safeEqual(actual, record.hash);
}

export async function readEditorAccess(env, slug) {
  try {
    return await env.VOTES.get(accessKey(slug), 'json');
  } catch {
    return null;
  }
}

export async function editorPasswordMatches(env, slug, password) {
  const stored = await readEditorAccess(env, slug);
  if (stored && stored.passwordHash) {
    return verifyPasswordRecord(password, stored.passwordHash);
  }
  if (stored && typeof stored.password === 'string') {
    return safeEqual(String(password || ''), stored.password);
  }
  const fallback = env.GAME_FACTORY_DEFAULT_EDITOR_PASSWORD || getAdminPassword(env);
  return !!fallback && safeEqual(String(password || ''), fallback);
}

export async function editorAccessInfo(env, slug) {
  const stored = await readEditorAccess(env, slug);
  return {
    usesDefaultPassword: !(stored && (stored.passwordHash || stored.password)),
    updatedAt: (stored && stored.updatedAt) || null,
  };
}

export async function setEditorPassword(env, slug, password) {
  const clean = String(password || '');
  if (clean.length < 6 || clean.length > 128) {
    throw new Error('password must be 6-128 characters');
  }
  const record = await makeEditorPasswordRecord(clean);
  const body = {
    passwordHash: record,
    updatedAt: record.updatedAt,
  };
  await env.VOTES.put(accessKey(slug), JSON.stringify(body));
  return body;
}

export async function resetEditorPassword(env, slug) {
  await env.VOTES.delete(accessKey(slug));
}

export async function createEditorCookie(request, env, slug) {
  const secret = getSessionSecret(env);
  if (!secret) throw new Error('editor session secret is not configured');
  const expires = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  const nonce = crypto.randomUUID().replace(/-/g, '');
  const payload = `v1.${slug}.${expires}.${nonce}`;
  const sig = await hmacSha256(payload, secret);
  return `${cookieName(slug)}=${payload}.${sig}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_SECONDS}${secureSuffix(request)}`;
}

export function clearEditorCookie(request, slug) {
  return `${cookieName(slug)}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureSuffix(request)}`;
}

export async function hasEditorSession(request, env, slug) {
  const value = parseCookie(request.headers.get('Cookie') || '', cookieName(slug));
  if (!value) return false;
  const secret = getSessionSecret(env);
  if (!secret) return false;
  const parts = value.split('.');
  if (parts.length !== 5 || parts[0] !== 'v1' || parts[1] !== slug) return false;
  const expires = Number(parts[2]);
  if (!Number.isFinite(expires) || expires < Math.floor(Date.now() / 1000)) return false;
  const payload = parts.slice(0, 4).join('.');
  const expected = await hmacSha256(payload, secret);
  return safeEqual(parts[4], expected);
}

export async function canEditGame(request, env, slug) {
  if (await isAdminRequest(request, env)) return true;
  return hasEditorSession(request, env, slug);
}
