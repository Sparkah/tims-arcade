#!/usr/bin/env node
/**
 * Security P0 regression checks:
 * - admin URL bearer tokens are rejected
 * - human admin auth uses allowed signed-in email sessions
 * - relay endpoints use a scoped relay token, not browser admin auth
 */

const path = require('path');
const fs = require('fs');
const childProcess = require('child_process');
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

async function signedSessionCookie(email, uid = 'session-uid', name = 'tgl_session') {
  const body = b64url(new TextEncoder().encode(JSON.stringify({
    email,
    uid,
    exp_ts: Date.now() + 60_000,
  })));
  const sig = await hmacSign(body, 'auth-secret');
  return `${name}=${body}.${sig}`;
}

function getSetCookieText(headers) {
  if (typeof headers.getSetCookie === 'function') return headers.getSetCookie().join('\n');
  return headers.get('set-cookie') || '';
}

function cookiePairFromSetCookie(headers, name) {
  const text = getSetCookieText(headers);
  const start = text.indexOf(`${name}=`);
  if (start < 0) return null;
  const rest = text.slice(start);
  const semi = rest.indexOf(';');
  return semi >= 0 ? rest.slice(0, semi) : rest;
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

function testAdminRoutesUseCentralGuard() {
  const adminDir = path.join(GALLERY, 'functions/api/admin');
  const files = fs.readdirSync(adminDir, { recursive: true })
    .filter(name => name.endsWith('.js'))
    .map(name => path.join('functions/api/admin', name));
  for (const rel of files) {
    const text = fs.readFileSync(path.join(GALLERY, rel), 'utf8');
    if (!/export\s+async\s+function\s+onRequest/.test(text)) continue;
    assert(/require(Admin|Relay)\s*\(/.test(text), `${rel} has an admin route without requireAdmin/requireRelay`);
  }
}

function testAdminPiiResponsesAreNotPublicCacheable() {
  const text = fs.readFileSync(path.join(GALLERY, 'functions/api/admin/creations.js'), 'utf8');
  assert(!/cache-control['"],\s*['"]public/i.test(text), 'admin creations PII response is public-cacheable');
  assert(!/s-maxage/i.test(text), 'admin creations PII response uses shared-cache TTL');
}

function testAdminPageDoesNotAcceptUrlToken() {
  const pages = ['admin.html', 'chat-mod.html'];
  const banned = [
    /URLSearchParams\(location\.search\)/,
    /\.get\(['"]token['"]\)/,
    /[?&]token=/,
    /sessionStorage\.(getItem|setItem)\(['"]adminToken['"]\)/,
    /x-admin-token/i,
    /ADMIN_TOKEN/,
  ];
  for (const page of pages) {
    const text = fs.readFileSync(path.join(GALLERY, page), 'utf8');
    for (const pattern of banned) {
      assert(!pattern.test(text), `${page} still accepts or emits browser admin token auth: ${pattern}`);
    }
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

async function testAppCspMiddleware() {
  const mod = await import(pathToFileURL(path.join(GALLERY, 'functions/_middleware.js')).href);
  const html = await mod.onRequest({
    request: req('https://game-factory.test/'),
    next: async () => new Response('<!doctype html>', {
      headers: { 'content-type': 'text/html; charset=utf-8' },
    }),
  });
  const csp = html.headers.get('content-security-policy') || '';
  assert(csp.includes("default-src 'self'"), 'app CSP is missing default-src fallback');
  assert(csp.includes("script-src 'self' 'unsafe-inline' 'report-sample' https://static.cloudflareinsights.com"), 'app CSP is missing script-src');
  assert(csp.includes("connect-src 'self' https://cloudflareinsights.com"), 'app CSP is missing Cloudflare analytics connect-src');
  assert(!csp.includes('unsafe-eval'), 'app CSP still allows unsafe-eval');

  const json = await mod.onRequest({
    request: req('https://game-factory.test/api/boot'),
    next: async () => new Response('{}', {
      headers: { 'content-type': 'application/json; charset=utf-8' },
    }),
  });
  assert(!json.headers.has('content-security-policy'), 'middleware added CSP to non-HTML response');

  const game = await mod.onRequest({
    request: req('https://game-factory.test/games/example/'),
    next: async () => new Response('<!doctype html>', {
      headers: { 'content-type': 'text/html; charset=utf-8' },
    }),
  });
  assert(!game.headers.has('content-security-policy'), 'middleware added app CSP to game runtime path');

  const telegram = await mod.onRequest({
    request: req('https://game-factory.test/tg-megaton/'),
    next: async () => new Response('<!doctype html>', {
      headers: { 'content-type': 'text/html; charset=utf-8' },
    }),
  });
  assert(!telegram.headers.has('content-security-policy'), 'middleware added app CSP to Telegram app path');

  const existing = await mod.onRequest({
    request: req('https://game-factory.test/g/abc123def'),
    next: async () => new Response('<!doctype html>', {
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'content-security-policy': "default-src 'none'",
      },
    }),
  });
  assert(existing.headers.get('content-security-policy') === "default-src 'none'", 'middleware overwrote route-specific CSP');
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

  assert(!await mod.isAdminRequest(req('https://game-factory.test/api/admin/stats', {
    headers: { 'x-admin-token': 'old-admin-token', 'sec-fetch-site': 'same-origin' },
  }), env), 'browser-like admin header was accepted while ADMIN_EMAILS allowlist is configured');

  assert(await mod.isAdminRequest(req('https://game-factory.test/api/admin/stats', {
    headers: { 'x-admin-token': 'old-admin-token' },
  }), env), 'timing-safe admin header was rejected for legacy non-browser CLI path');

  assert(await mod.isAdminRequest(req('https://game-factory.test/api/admin/stats', {
    headers: { 'x-admin-token': 'old-admin-token', 'sec-fetch-site': 'same-origin' },
  }), { ...env, ALLOW_BROWSER_ADMIN_TOKEN: '1' }), 'explicit legacy browser-token override did not work');

  assert(!await mod.isAdminRequest(req('https://game-factory.test/api/admin/stats', {
    headers: { 'x-admin-token': 'wrong-admin-token' },
  }), env), 'wrong admin header was accepted');

  const urlToken = await mod.requireAdmin(req('https://game-factory.test/api/admin/stats?token=old-admin-token', {
    headers: { cookie: adminCookie },
  }), env);
  assert(urlToken && urlToken.status === 400, 'URL admin token was not rejected before auth');

  const badOriginPost = await mod.requireAdmin(req('https://game-factory.test/api/admin/hidden', {
    method: 'POST',
    headers: { cookie: adminCookie, origin: 'https://evil.test' },
    body: '{}',
  }), env);
  assert(badOriginPost && badOriginPost.status === 403, 'cross-origin admin mutation was not rejected');

  const sameOriginPost = await mod.requireAdmin(req('https://game-factory.test/api/admin/hidden', {
    method: 'POST',
    headers: { cookie: adminCookie, origin: 'https://game-factory.test' },
    body: '{}',
  }), env);
  assert(sameOriginPost === null, 'same-origin admin mutation was rejected');

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

async function testLogoutReturnSanitization() {
  const mod = await import(pathToFileURL(path.join(GALLERY, 'functions/api/auth/logout.js')).href);
  const external = await mod.onRequestGet({
    request: req('https://game-factory.test/api/auth/logout?return=https://evil.test/x'),
  });
  assert(external.headers.get('location') === 'https://game-factory.test/', 'logout accepted external return URL');
  const externalCookies = getSetCookieText(external.headers);
  assert(externalCookies.includes('__Host-tgl_session=;'), 'logout did not clear __Host session cookie');
  assert(externalCookies.includes('tgl_session=;'), 'logout did not clear legacy session cookie');

  const sameOrigin = await mod.onRequestGet({
    request: req('https://game-factory.test/api/auth/logout?return=/admin.html'),
  });
  assert(sameOrigin.headers.get('location') === 'https://game-factory.test/admin.html', 'logout rejected safe local return URL');
}

async function testSessionCookieMigration() {
  const verify = await import(pathToFileURL(path.join(GALLERY, 'functions/api/auth/verify.js')).href);
  const sessionMod = await import(pathToFileURL(path.join(GALLERY, 'functions/api/_session.js')).href);
  const token = 'abcdefghijklmnop';
  const env = makeEnv({
    VOTES: makeKv({
      [`magiclink:${token}`]: JSON.stringify({ email: 'tim@example.com', next: '/admin.html' }),
    }),
  });

  const verified = await verify.onRequestGet({
    request: req(`https://game-factory.test/api/auth/verify?token=${token}`),
    env,
  });
  assert(verified.status === 302, `auth verify did not redirect on success: ${verified.status}`);
  assert(verified.headers.get('location') === 'https://game-factory.test/admin.html', 'auth verify lost safe next path');
  const setCookies = getSetCookieText(verified.headers);
  assert(setCookies.includes('__Host-tgl_session='), 'auth verify did not set __Host session cookie');
  assert(setCookies.includes('tgl_session=;'), 'auth verify did not expire legacy session cookie');

  const hostPair = cookiePairFromSetCookie(verified.headers, '__Host-tgl_session');
  assert(hostPair, 'could not extract __Host session cookie');
  const hostSession = await sessionMod.readSession(req('https://game-factory.test/api/me', {
    headers: { cookie: hostPair },
  }), env);
  assert(hostSession && hostSession.email === 'tim@example.com', 'readSession rejected __Host session cookie');

  const legacyPair = await signedSessionCookie('ops@example.com', 'ops-uid');
  const legacySession = await sessionMod.readSession(req('https://game-factory.test/api/me', {
    headers: { cookie: legacyPair },
  }), env);
  assert(legacySession && legacySession.email === 'ops@example.com', 'readSession rejected legacy session cookie fallback');
}

async function testAuthDevModeDoesNotLeakProductionMagicLinks() {
  const mod = await import(pathToFileURL(path.join(GALLERY, 'functions/api/auth/request.js')).href);
  const env = {
    AUTH_DEV_MODE: '1',
    RESEND_API_KEY: '',
    VOTES: makeKv(),
  };
  const prod = await mod.onRequestPost({
    request: req('https://game-factory.test/api/auth/request', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'tim@example.com', next: '/admin.html' }),
    }),
    env,
  });
  const prodText = await prod.text();
  assert(prod.status === 502, `production-like AUTH_DEV_MODE request should not return a link, got ${prod.status}`);
  assert(!prodText.includes('devMagicLink') && !prodText.includes('/api/auth/verify?token='), 'production-like AUTH_DEV_MODE leaked magic link');

  const local = await mod.onRequestPost({
    request: req('http://localhost:8788/api/auth/request', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'tim@example.com', next: '/admin.html' }),
    }),
    env,
  });
  const localText = await local.text();
  assert(local.status === 200 && localText.includes('devMagicLink'), 'localhost AUTH_DEV_MODE did not return dev magic link');
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

async function postJson(mod, url, body, env, headers = {}) {
  return mod.onRequestPost({
    request: req(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    }),
    env,
  });
}

async function testAnonymousVoteDedupe() {
  const mod = await import(pathToFileURL(path.join(GALLERY, 'functions/api/vote.js')).href);
  const env = makeEnv({
    VOTES: makeKv({
      'meta:anon1': JSON.stringify({ played: { vote_slug: 300 } }),
      'meta:anon2': JSON.stringify({ played: { legacy_slug: 300 } }),
    }),
  });

  const headers = { cookie: 'uid=anon1', 'cf-connecting-ip': '203.0.113.10' };
  let res = await postJson(mod, 'https://game-factory.test/api/vote', { slug: 'vote_slug', vote: 'like' }, env, headers);
  assert(res.status === 200, `anonymous like was rejected: ${res.status}`);
  let body = await res.json();
  assert(body.likes === 1 && body.dislikes === 0 && body.myVote === 'like', 'first anonymous like did not count once');

  res = await postJson(mod, 'https://game-factory.test/api/vote', { slug: 'vote_slug', vote: 'like' }, env, headers);
  body = await res.json();
  assert(body.likes === 1 && body.dislikes === 0 && body.myVote === 'like', 'replayed anonymous like inflated count');

  res = await postJson(mod, 'https://game-factory.test/api/vote', { slug: 'vote_slug', vote: 'dislike' }, env, headers);
  body = await res.json();
  assert(body.likes === 0 && body.dislikes === 1 && body.myVote === 'dislike', 'anonymous vote switch did not reverse prior vote');

  const legacyHeaders = { cookie: 'uid=anon2', 'cf-connecting-ip': '203.0.113.11' };
  res = await postJson(mod, 'https://game-factory.test/api/vote', { slug: 'legacy_slug', deltaLike: 1, deltaDislike: 0 }, env, legacyHeaders);
  assert(res.status === 200, `legacy delta like was rejected: ${res.status}`);
  body = await res.json();
  assert(body.likes === 1 && body.dislikes === 0 && body.myVote === 'like', 'legacy delta was not mapped to vote state');

  res = await postJson(mod, 'https://game-factory.test/api/vote', { slug: 'legacy_slug', deltaLike: 1, deltaDislike: 0 }, env, legacyHeaders);
  body = await res.json();
  assert(body.likes === 1 && body.dislikes === 0, 'replayed legacy delta inflated count');
}

async function testFeedbackVoteDedupe() {
  const mod = await import(pathToFileURL(path.join(GALLERY, 'functions/api/feedback.js')).href);
  const env = makeEnv({
    VOTES: makeKv({
      'meta:anon3': JSON.stringify({ played: { feedback_slug: 300 } }),
      'meta:anon4': JSON.stringify({ played: { gated_slug: 30 } }),
    }),
  });

  const headers = { cookie: 'uid=anon3', 'cf-connecting-ip': '203.0.113.12' };
  let res = await postJson(mod, 'https://game-factory.test/api/feedback', { slug: 'feedback_slug', vote: 'like' }, env, headers);
  assert(res.status === 204, `feedback like failed: ${res.status}`);
  res = await postJson(mod, 'https://game-factory.test/api/feedback', { slug: 'feedback_slug', vote: 'like' }, env, headers);
  assert(res.status === 204, `replayed feedback like failed: ${res.status}`);
  let votes = JSON.parse(env.VOTES.store.get('votes:feedback_slug'));
  assert(votes.likes === 1 && votes.dislikes === 0, 'replayed feedback like inflated count');

  res = await postJson(mod, 'https://game-factory.test/api/feedback', { slug: 'feedback_slug', vote: 'dislike' }, env, headers);
  assert(res.status === 204, `feedback dislike failed: ${res.status}`);
  votes = JSON.parse(env.VOTES.store.get('votes:feedback_slug'));
  assert(votes.likes === 0 && votes.dislikes === 1, 'feedback vote switch did not reverse prior vote');

  const gatedHeaders = { cookie: 'uid=anon4', 'cf-connecting-ip': '203.0.113.13' };
  res = await postJson(mod, 'https://game-factory.test/api/feedback', { slug: 'gated_slug', vote: 'like' }, env, gatedHeaders);
  assert(res.status === 204, `below-gate feedback should still store non-vote payload path: ${res.status}`);
  assert(!env.VOTES.store.has('votes:gated_slug'), 'below-gate feedback vote was tallied');
}

function testClientsUseVoteStateShape() {
  for (const file of ['app.js', 'play.html']) {
    const text = fs.readFileSync(path.join(GALLERY, file), 'utf8');
    assert(!/deltaLike|deltaDislike/.test(text), `${file} still sends raw vote deltas`);
  }
}

function testPublicDomSinksAvoidCatalogHtml() {
  const play = fs.readFileSync(path.join(GALLERY, 'play.html'), 'utf8');
  assert(!/row\.innerHTML\s*=\s*picks\.map/.test(play), 'play more-games rail builds catalog HTML with innerHTML');
  assert(!/background-image:\s*url\(['"]\/thumbs\/\$\{g\.slug\}/.test(play), 'play more-games rail interpolates slug into inline style HTML');

  const login = fs.readFileSync(path.join(GALLERY, 'login.html'), 'utf8');
  assert(!/innerHTML\s*\+?=.*devMagicLink/.test(login), 'login dev magic-link uses innerHTML');
  assert(/u\.origin\s*===\s*location\.origin/.test(login), 'login dev magic-link does not enforce same-origin URL');
}

function testNoCommittedPostHogToken() {
  const restore = fs.readFileSync(path.join(GALLERY, 'scripts/restore_secrets.sh'), 'utf8');
  assert(!/phc_[A-Za-z0-9]+/.test(restore), 'restore_secrets.sh contains a committed PostHog project token');
  assert(/PUBLIC_POSTHOG_KEY must be provided/.test(restore), 'restore_secrets.sh does not require runtime PUBLIC_POSTHOG_KEY');

  const tmpPath = fs.mkdtempSync(path.join(require('os').tmpdir(), 'gf-no-wrangler-'));
  try {
    const missingWrangler = childProcess.spawnSync('/bin/bash', ['scripts/restore_secrets.sh'], {
      cwd: GALLERY,
      env: {
        PATH: tmpPath,
        PROJECT: 'security-regression-test',
        PUBLIC_POSTHOG_KEY: 'test-posthog-key',
        PUBLIC_POSTHOG_HOST: 'https://eu.i.posthog.com',
      },
      encoding: 'utf8',
    });
    assert(missingWrangler.status !== 0, 'restore_secrets.sh swallowed wrangler failures');
    assert(/wrangler CLI is not available/.test(missingWrangler.stderr), 'restore_secrets.sh missing-wrangler failure is not explicit');
  } finally {
    fs.rmSync(tmpPath, { recursive: true, force: true });
  }
}

async function testSharePageCatalogueFetchIsHostAllowlisted() {
  const mod = await import(pathToFileURL(path.join(GALLERY, 'functions/p/[slug].js')).href);
  const games = [{
    slug: 'safe_game',
    title: 'Safe Game',
    hook: 'A safe test game.',
    addedDate: '2026-06-30',
    builtWith: {
      url: 'javascript:alert(1)',
      label: 'Unsafe Builder',
    },
  }];
  const gamesResponse = () => new Response(JSON.stringify(games), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });

  const oldFetch = globalThis.fetch;
  try {
    let networkCalled = false;
    const assetEnv = {
      ASSETS: {
        fetch: async (request) => {
          const url = new URL(request.url);
          assert(url.pathname === '/games.json', `share page requested unexpected ASSETS path: ${url.pathname}`);
          return gamesResponse();
        },
      },
    };
    globalThis.fetch = async () => {
      networkCalled = true;
      return new Response('unexpected network fetch', { status: 500 });
    };
    let res = await mod.onRequest({
      params: { slug: 'safe_game' },
      env: assetEnv,
      request: req('https://attacker.invalid/p/safe_game'),
    });
    assert(res.status === 200, `share page rejected ASSETS catalogue: ${res.status}`);
    assert(!networkCalled, 'share page fetched network catalogue while ASSETS binding was available');
    let html = await res.text();
    assert(html.includes('https://game-factory.tech/p/safe_game'), 'share page used untrusted request host in metadata');
    assert(!html.includes('javascript:alert'), 'share page emitted unsafe builtWith URL');
    assert(res.headers.get('vary') === 'Accept-Language', 'share page does not vary language-switched response by Accept-Language');

    let fetchedUrl = '';
    globalThis.fetch = async (url) => {
      fetchedUrl = String(url);
      return gamesResponse();
    };
    res = await mod.onRequest({
      params: { slug: 'safe_game' },
      env: {},
      request: req('https://attacker.invalid/p/safe_game'),
    });
    assert(res.status === 200, `share page rejected allowlisted fallback catalogue: ${res.status}`);
    assert(fetchedUrl === 'https://game-factory.tech/games.json', `share page fetched untrusted catalogue URL: ${fetchedUrl}`);
    html = await res.text();
    assert(html.includes('https://game-factory.tech/p/safe_game'), 'share page fallback metadata used untrusted host');

    globalThis.fetch = async (url) => {
      fetchedUrl = String(url);
      return gamesResponse();
    };
    res = await mod.onRequest({
      params: { slug: 'safe_game' },
      env: {},
      request: req('https://aa716bef.tims-arcade.pages.dev/p/safe_game'),
    });
    assert(res.status === 200, `share page rejected Pages preview catalogue: ${res.status}`);
    assert(fetchedUrl === 'https://aa716bef.tims-arcade.pages.dev/games.json', `share page did not preserve trusted Pages preview URL: ${fetchedUrl}`);
  } finally {
    globalThis.fetch = oldFetch;
  }
}

async function main() {
  await testTimingSafeCompare();
  testNoDirectAdminTokenComparisons();
  testAdminRoutesUseCentralGuard();
  testAdminPiiResponsesAreNotPublicCacheable();
  testAdminPageDoesNotAcceptUrlToken();
  await testHstsMiddleware();
  await testAppCspMiddleware();
  await testAdminAuth();
  await testLogoutReturnSanitization();
  await testSessionCookieMigration();
  await testAuthDevModeDoesNotLeakProductionMagicLinks();
  await testRelayEndpoints();
  await testAnonymousVoteDedupe();
  await testFeedbackVoteDedupe();
  testClientsUseVoteStateShape();
  testPublicDomSinksAvoidCatalogHtml();
  testNoCommittedPostHogToken();
  await testSharePageCatalogueFetchIsHostAllowlisted();
  console.log('PASS security P0 regressions');
}

main().catch((err) => {
  console.error('FAIL security P0 regressions:', err && err.stack || err);
  process.exit(1);
});
