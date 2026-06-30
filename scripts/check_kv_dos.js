#!/usr/bin/env node
/**
 * Regression checks for the KV LIST/WRITE DoS fixes:
 * - generation queue uses maintained pending/inflight indexes, not VOTES.list()
 * - public comments use commentidx:<slug> and do not list for unknown slugs
 */

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const GALLERY = path.resolve(__dirname, '..');

function makeKv(initial = {}, { listImpl = null } = {}) {
  const store = new Map(Object.entries(initial));
  const kv = {
    store,
    listCalls: 0,
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
    async list(opts) {
      kv.listCalls += 1;
      if (listImpl) return listImpl(opts);
      throw new Error(`unexpected VOTES.list(${JSON.stringify(opts)})`);
    },
  };
  return kv;
}

function makeEnv(initial = {}, opts = {}) {
  return {
    AUTH_SECRET: 'auth-secret',
    GAME_FACTORY_RELAY_TOKEN: 'relay-secret',
    VOTES: makeKv(initial, opts),
  };
}

function req(url, { headers = {}, method = 'GET', body = null } = {}) {
  return new Request(url, { method, headers, body });
}

async function signedSessionCookie(email, uid = 'session-uid', name = '__Host-tgl_session') {
  const body = b64url(new TextEncoder().encode(JSON.stringify({
    email,
    uid,
    exp_ts: Date.now() + 60_000,
  })));
  const sig = await hmacSign(body, 'auth-secret');
  return `${name}=${body}.${sig}`;
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

async function assertStatus(res, status, label) {
  if (res.status === status) return;
  throw new Error(`${label} failed: ${res.status} ${await res.text()}`);
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

async function testGenQueueIndexes() {
  const submit = await import(pathToFileURL(path.join(GALLERY, 'functions/api/gen/submit.js')).href);
  const queue = await import(pathToFileURL(path.join(GALLERY, 'functions/api/admin/gen-queue.js')).href);
  const result = await import(pathToFileURL(path.join(GALLERY, 'functions/api/admin/gen-result.js')).href);
  const env = makeEnv({
    'meta:anon1': JSON.stringify({ tokens: 120, lifetime: 120, played: {} }),
  });
  const session = await signedSessionCookie('tim@example.com', 'u1');
  const cookie = `${session}; uid=anon1`;

  let res = await postJson(submit, 'https://game-factory.test/api/gen/submit', {
    prompt: 'make a tiny puzzle game',
  }, env, { cookie, 'cf-connecting-ip': '203.0.113.20' });
  await assertStatus(res, 200, 'submit');
  const submitted = await res.json();
  assert(submitted.id, 'submit did not return a job id');
  let pending = JSON.parse(env.VOTES.store.get('genqueue:pending'));
  assert(pending.some(item => item.id === submitted.id), 'submit did not add job to pending index');
  assert(env.VOTES.listCalls === 0, 'submit unexpectedly listed KV');

  res = await queue.onRequestGet({
    request: req('https://game-factory.test/api/admin/gen-queue?limit=3', {
      headers: { 'x-relay-token': 'relay-secret' },
    }),
    env,
  });
  await assertStatus(res, 200, 'queue');
  let body = await res.json();
  assert(body.jobs.length === 1 && body.jobs[0].id === submitted.id, 'queue did not return indexed pending job');
  assert(env.VOTES.listCalls === 0, 'gen-queue listed KV for pending job');

  res = await postJson(result, 'https://game-factory.test/api/admin/gen-result', {
    id: submitted.id,
    status: 'building',
  }, env, { 'x-relay-token': 'relay-secret' });
  await assertStatus(res, 200, 'building claim');
  pending = JSON.parse(env.VOTES.store.get('genqueue:pending'));
  const inflight = JSON.parse(env.VOTES.store.get('genqueue:inflight'));
  assert(!pending.some(item => item.id === submitted.id), 'building job stayed in pending index');
  assert(inflight.some(item => item.id === submitted.id), 'building job was not added to inflight index');

  const job = JSON.parse(env.VOTES.store.get(`genjob:${submitted.id}`));
  job.updatedTs = Date.now() - 11 * 60 * 1000;
  env.VOTES.store.set(`genjob:${submitted.id}`, JSON.stringify(job));
  env.VOTES.store.set('genqueue:inflight', JSON.stringify([{ id: submitted.id, ts: job.ts, updatedTs: job.updatedTs }]));
  res = await queue.onRequestGet({
    request: req('https://game-factory.test/api/admin/gen-queue?limit=3', {
      headers: { 'x-relay-token': 'relay-secret' },
    }),
    env,
  });
  body = await res.json();
  assert(body.jobs.length === 1 && body.jobs[0].id === submitted.id, 'queue did not return stuck inflight job');
  assert(env.VOTES.listCalls === 0, 'gen-queue listed KV for stuck job');

  res = await postJson(result, 'https://game-factory.test/api/admin/gen-result', {
    id: submitted.id,
    status: 'failed',
    error: 'test failure',
  }, env, { 'x-relay-token': 'relay-secret' });
  await assertStatus(res, 200, 'failed transition');
  pending = JSON.parse(env.VOTES.store.get('genqueue:pending'));
  const inflightAfterFail = JSON.parse(env.VOTES.store.get('genqueue:inflight'));
  assert(!pending.some(item => item.id === submitted.id), 'failed job stayed in pending index');
  assert(!inflightAfterFail.some(item => item.id === submitted.id), 'failed job stayed in inflight index');
}

async function testCommentsIndexAvoidsList() {
  global.caches = global.caches || {
    default: {
      async match() { return null; },
      async put() {},
    },
  };

  const feedback = await import(pathToFileURL(path.join(GALLERY, 'functions/api/feedback.js')).href);
  const comments = await import(pathToFileURL(path.join(GALLERY, 'functions/api/comments.js')).href);
  const env = makeEnv();

  let res = await postJson(feedback, 'https://game-factory.test/api/feedback', {
    slug: 'comment_slug',
    vote: 'neutral',
    comment: 'tight controls',
  }, env, { 'cf-connecting-ip': '203.0.113.21' });
  await assertStatus(res, 204, 'feedback comment');
  assert(env.VOTES.store.has('commentidx:comment_slug'), 'feedback did not write public comment index');

  res = await comments.onRequestGet({
    request: req('https://game-factory.test/api/comments?slug=comment_slug&limit=10'),
    env,
  });
  await assertStatus(res, 200, 'comments index read');
  let body = await res.json();
  assert(body.count === 1 && body.comments[0].comment === 'tight controls', 'comments endpoint did not read indexed comment');
  assert(env.VOTES.listCalls === 0, 'comments endpoint listed KV despite index');

  const oldFetch = global.fetch;
  global.fetch = async () => new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
  try {
    res = await comments.onRequestGet({
      request: req('https://game-factory.test/api/comments?slug=unknown_slug&limit=10'),
      env,
    });
    body = await res.json();
    assert(body.count === 0, 'unknown slug comments should be empty');
    assert(env.VOTES.listCalls === 0, 'comments endpoint listed KV for unknown slug');
  } finally {
    global.fetch = oldFetch;
  }
}

function testNoGenQueueListCall() {
  const text = fs.readFileSync(path.join(GALLERY, 'functions/api/admin/gen-queue.js'), 'utf8');
  assert(!/\.list\s*\(/.test(text), 'gen-queue still contains a KV list call');
}

async function main() {
  testNoGenQueueListCall();
  await testGenQueueIndexes();
  await testCommentsIndexAvoidsList();
  console.log('PASS KV DoS regressions');
}

main().catch((err) => {
  console.error('FAIL KV DoS regressions:', err && err.stack || err);
  process.exit(1);
});
