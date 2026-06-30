#!/usr/bin/env node
/**
 * Security P0 regression checks:
 * - admin URL bearer tokens are rejected
 * - human admin auth uses allowed signed-in email sessions
 * - relay endpoints use a scoped relay token, not browser admin auth
 */

const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

const GALLERY = path.resolve(__dirname, '..');

function makeKv(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    store,
    async get(key, type) {
      const value = store.get(key);
      if (value == null) return null;
      return type === 'json' ? JSON.parse(value) : value;
    },
    async put(key, value) {
      store.set(key, String(value));
    },
    async delete(key) {
      store.delete(key);
    },
  };
}

function makeEnv(extra = {}) {
  return {
    AUTH_SECRET: 'auth-secret',
    ADMIN_EMAILS: 'tim@example.com,ops@example.com',
    ADMIN_TOKEN: 'old-admin-token',
    GAME_FACTORY_ADMIN_PASSWORD: 'admin-password',
    GAME_FACTORY_ADMIN_SESSION_SECRET: 'admin-session-secret',
    GAME_FACTORY_RELAY_TOKEN: 'relay-secret',
    VOTES: makeKv(),
    ...extra,
  };
}

function req(url, { headers = {}, method = 'GET', body = null } = {}) {
  return new Request(url, { method, headers, body });
}

async function signedSessionCookie(email, uid = 'session-uid') {
  const body = b64url(new TextEncoder().encode(JSON.stringify({
    email,
    uid,
    exp_ts: Date.now() + 60_000,
  })));
  const sig = await hmacSign(body, 'auth-secret');
  return `tgl_session=${body}.${sig}`;
}

async function hmacSign(message, secret) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return b64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))));
}

function b64url(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function testTimingSafeCompare() {
  const mod = await import(pathToFileURL(path.join(GALLERY, 'functions/_lib/adminAuth.js')).href);

  assert(mod.safeEqual('secret-token', 'secret-token'), 'safeEqual rejected equal strings');
  assert(!mod.safeEqual('secret-token', 'secret-xxxxx'), 'safeEqual accepted unequal same-length strings');
  assert(!mod.safeEqual('secret-token', 'secret-token-extra'), 'safeEqual accepted length-mismatch strings');
  assert(!mod.safeEqual('', 'secret-token'), 'safeEqual accepted missing supplied token');
}

function testNoDirectAdminTokenComparisons() {
  const adminDir = path.join(GALLERY, 'functions/api/admin');
  const files = fs.readdirSync(adminDir, { recursive: true })
    .filter(name => name.endsWith('.js'))
    .map(name => path.join('functions/api/admin', name));
  files.push('functions/api/least-attention.js');
  const banned = [
    /token\s*!==\s*(expected|env\.ADMIN_TOKEN)/,
    /(expected|env\.ADMIN_TOKEN)\s*!==\s*token/,
    /request\.headers\.get\(['"]x-admin-token['"]\)/,
    /searchParams\.get\(['"]token['"]\)/,
  ];
  for (const rel of files) {
    const text = fs.readFileSync(path.join(GALLERY, rel), 'utf8');
    for (const pattern of banned) {
      assert(!pattern.test(text), `${rel} still has direct token auth pattern: ${pattern}`);
    }
  }
}

function testAdminPageDoesNotAcceptUrlToken() {
  const text = fs.readFileSync(path.join(GALLERY, 'admin.html'), 'utf8');
  const banned = [
    /URLSearchParams\(location\.search\)/,
    /\.get\(['"]token['"]\)/,
    /[?&]token=/,
  ];
  for (const pattern of banned) {
    assert(!pattern.test(text), `admin.html still accepts or emits URL token auth: ${pattern}`);
  }
}

async function testHstsMiddleware() {
  const mod = await import(pathToFileURL(path.join(GALLERY, 'functions/_middleware.js')).href);
  const res = await mod.onRequest({
    next: async () => new Response('ok', {
      status: 201,
      headers: { 'x-test': '1' },
    }),
  });
  assert(res.status === 201, `middleware changed response status: ${res.status}`);
  assert(res.headers.get('x-test') === '1', 'middleware dropped existing headers');
  assert(res.headers.get('strict-transport-security') === 'max-age=31536000', 'middleware did not add HSTS');
}

async function testAdminAuth() {
  const mod = await import(pathToFileURL(path.join(GALLERY, 'functions/_lib/adminAuth.js')).href);
  const env = makeEnv();
  const adminCookie = await signedSessionCookie('tim@example.com', 'tim-uid');
  const otherCookie = await signedSessionCookie('player@example.com', 'player-uid');

  assert(await mod.isAdminRequest(req('https://game-factory.test/api/admin/stats', {
    headers: { cookie: adminCookie },
  }), env), 'allowed admin email session was rejected');

  assert(!await mod.isAdminRequest(req('https://game-factory.test/api/admin/stats', {
    headers: { cookie: otherCookie },
  }), env), 'non-allowlisted email session was accepted');

  const passwordCookie = (await mod.createAdminCookie(req('https://game-factory.test/api/admin/login'), env)).split(';', 1)[0];
  assert(!await mod.isAdminRequest(req('https://game-factory.test/api/admin/stats', {
    headers: { cookie: passwordCookie },
  }), env), 'password admin cookie was accepted while ADMIN_EMAILS allowlist is configured');

  assert(await mod.isAdminRequest(req('https://game-factory.test/api/admin/stats', {
    headers: { 'x-admin-token': 'old-admin-token' },
  }), env), 'timing-safe admin header was rejected for legacy admin page');

  assert(!await mod.isAdminRequest(req('https://game-factory.test/api/admin/stats', {
    headers: { 'x-admin-token': 'wrong-admin-token' },
  }), env), 'wrong admin header was accepted');

  const urlToken = await mod.requireAdmin(req('https://game-factory.test/api/admin/stats?token=old-admin-token', {
    headers: { cookie: adminCookie },
  }), env);
  assert(urlToken && urlToken.status === 400, 'URL admin token was not rejected before auth');

  assert(await mod.isRelayRequest(req('https://game-factory.test/api/admin/gen-queue', {
    headers: { 'x-relay-token': 'relay-secret' },
  }), env), 'valid relay token was rejected');

  assert(!await mod.isRelayRequest(req('https://game-factory.test/api/admin/gen-queue', {
    headers: { cookie: adminCookie },
  }), env), 'browser admin session was accepted for relay endpoint');

  assert(!await mod.isRelayRequest(req('https://game-factory.test/api/admin/gen-queue', {
    headers: { 'x-admin-token': 'old-admin-token' },
  }), env), 'legacy admin token header was accepted for relay endpoint');

  const relayUrlToken = await mod.requireRelay(req('https://game-factory.test/api/admin/gen-queue?token=relay-secret', {
    headers: { 'x-relay-token': 'relay-secret' },
  }), env);
  assert(relayUrlToken && relayUrlToken.status === 400, 'relay URL token was not rejected before auth');

  const missingRelay = await mod.requireRelay(req('https://game-factory.test/api/admin/gen-queue', {
    headers: { 'x-relay-token': 'relay-secret' },
  }), { ...env, GAME_FACTORY_RELAY_TOKEN: '', RELAY_TOKEN: '' });
  assert(missingRelay && missingRelay.status === 500, 'missing relay token config did not fail loud');
}

async function testRelayEndpoints() {
  const genResult = await import(pathToFileURL(path.join(GALLERY, 'functions/api/admin/gen-result.js')).href);
  const env = makeEnv();

  const allowed = await genResult.onRequestPost({
    request: req('https://game-factory.test/api/admin/gen-result', {
      method: 'POST',
      headers: { 'x-relay-token': 'relay-secret' },
      body: 'not-json',
    }),
    env,
  });
  assert(allowed.status === 400, `relay token should pass auth and fail at JSON parse, got ${allowed.status}`);

  const denied = await genResult.onRequestPost({
    request: req('https://game-factory.test/api/admin/gen-result', {
      method: 'POST',
      headers: { 'x-admin-token': 'old-admin-token' },
      body: 'not-json',
    }),
    env,
  });
  assert(denied.status === 403, `admin token should not complete relay jobs, got ${denied.status}`);
}

async function main() {
  await testTimingSafeCompare();
  testNoDirectAdminTokenComparisons();
  testAdminPageDoesNotAcceptUrlToken();
  await testHstsMiddleware();
  await testAdminAuth();
  await testRelayEndpoints();
  console.log('PASS security P0 regressions');
}

main().catch((err) => {
  console.error('FAIL security P0 regressions:', err && err.stack || err);
  process.exit(1);
});
