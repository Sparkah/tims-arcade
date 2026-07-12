#!/usr/bin/env node
/**
 * Regression coverage for the comped creator lane and owner build log.
 *
 * Run with a local test identity (never committed):
 *   PARTNER_TEST_EMAIL=<verified-email> PARTNER_TEST_UID=<emailToUid result> node scripts/check_partner_creator.js
 */

const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');
const TEST_EMAIL = String(process.env.PARTNER_TEST_EMAIL || 'partner-regression@example.invalid').trim().toLowerCase();
let TEST_UID = String(process.env.PARTNER_TEST_UID || '').trim().toLowerCase();
const AUTH_SECRET = 'partner-test-auth-secret';
const RELAY_TOKEN = 'partner-test-relay-token';

function assert(value, message) {
  if (!value) throw new Error(message);
}

function makeKv(initial = {}) {
  const store = new Map(Object.entries(initial));
  const puts = [];
  return {
    store,
    puts,
    async get(key, type) {
      const value = store.get(key);
      if (value == null) return null;
      return type === 'json' ? JSON.parse(value) : value;
    },
    async put(key, value) {
      puts.push(key);
      store.set(key, String(value));
    },
    async delete(key) {
      store.delete(key);
    },
  };
}

function makeEnv(kv, extra = {}) {
  return {
    AUTH_SECRET,
    GAME_FACTORY_RELAY_TOKEN: RELAY_TOKEN,
    VOTES: kv,
    ...extra,
  };
}

function b64url(bytes) {
  return Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function sessionCookie(email, uid) {
  const body = b64url(new TextEncoder().encode(JSON.stringify({
    email, uid, exp_ts: Date.now() + 60_000,
  })));
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(AUTH_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = b64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))));
  return `tgl_session=${body}.${sig}`;
}

function request(url, { method = 'GET', cookie = '', ip = '203.0.113.20', body } = {}) {
  const headers = { origin: 'https://game-factory.test', 'cf-connecting-ip': ip };
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers['content-type'] = 'application/json';
  return new Request(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function jsonResponse(response) {
  const text = await response.text();
  let body = null;
  try { body = JSON.parse(text); } catch {}
  return { status: response.status, body, text };
}

async function main() {
  const uidMod = await import(pathToFileURL(path.join(ROOT, 'functions/_lib/uid.js')).href);
  if (!TEST_UID) TEST_UID = await uidMod.emailToUid(TEST_EMAIL);
  assert(/^[0-9a-f]{16}$/.test(TEST_UID), 'PARTNER_TEST_UID must be a 16-character emailToUid value');
  assert(await uidMod.emailToUid(TEST_EMAIL) === TEST_UID, 'PARTNER_TEST_UID does not match PARTNER_TEST_EMAIL');

  const quota = await import(pathToFileURL(path.join(ROOT, 'functions/api/gen/quota.js')).href);
  const submit = await import(pathToFileURL(path.join(ROOT, 'functions/api/gen/submit.js')).href);
  const status = await import(pathToFileURL(path.join(ROOT, 'functions/api/gen/status.js')).href);
  const jobs = await import(pathToFileURL(path.join(ROOT, 'functions/api/gen/jobs.js')).href);
  const result = await import(pathToFileURL(path.join(ROOT, 'functions/api/admin/gen-result.js')).href);
  const adminAuth = await import(pathToFileURL(path.join(ROOT, 'functions/_lib/adminAuth.js')).href);
  const queueLib = await import(pathToFileURL(path.join(ROOT, 'functions/_lib/genQueue.js')).href);
  const queueApi = await import(pathToFileURL(path.join(ROOT, 'functions/api/admin/gen-queue.js')).href);
  const adminJobApi = await import(pathToFileURL(path.join(ROOT, 'functions/api/admin/gen-job.js')).href);
  const history = await import(pathToFileURL(path.join(ROOT, 'functions/_lib/creationHistory.js')).href);
  const jobLog = await import(pathToFileURL(path.join(ROOT, 'functions/_lib/genJobLog.js')).href);

  const partnerCookieUid = 'partner-browser-cookie';
  const partnerCookie = `${await sessionCookie(TEST_EMAIL, TEST_UID)}; uid=${partnerCookieUid}`;
  const partnerMeta = JSON.stringify({ tokens: 0, lifetime: 0, streak: 0, bestStreak: 0 });
  const partnerKv = makeKv({ [`meta:${partnerCookieUid}`]: partnerMeta });
  const partnerEnv = makeEnv(partnerKv, { GAME_FACTORY_COMPED_CREATOR_UIDS: TEST_UID });

  // Quota identifies the partner without granting the signup bonus or touching
  // the cookie-bound token record.
  let response = await quota.onRequestGet({
    request: request('https://game-factory.test/api/gen/quota', { cookie: partnerCookie }),
    env: partnerEnv,
  });
  let parsed = await jsonResponse(response);
  assert(parsed.status === 200 && parsed.body.partnerAccess === true, 'partner quota did not expose Partner access');
  assert(parsed.body.uid === TEST_UID && parsed.body.builderAvailable === true, 'partner quota lost UID-scoped resume/build availability');
  assert(parsed.body.canGenerate === true && parsed.body.generationCharge === 0, 'partner quota was not comped');
  assert(partnerKv.store.get(`meta:${partnerCookieUid}`) === partnerMeta, 'partner quota mutated token balance');
  assert(!partnerKv.store.has(`bonus60:${TEST_UID}`), 'partner quota granted signup bonus');

  // An ordinary signed-in account whose one-time bonus is already consumed and
  // whose balance is zero still receives the existing 402.
  const ordinaryEmail = 'ordinary-test@example.invalid';
  const ordinaryUid = await uidMod.emailToUid(ordinaryEmail);
  const ordinaryCookieUid = 'ordinary-browser-cookie';
  const ordinaryMeta = JSON.stringify({ tokens: 0, lifetime: 0 });
  const ordinaryKv = makeKv({
    [`meta:${ordinaryCookieUid}`]: ordinaryMeta,
    [`bonus60:${ordinaryUid}`]: '1',
  });
  const pausedEnv = makeEnv(ordinaryKv, { GAME_FACTORY_COMPED_CREATOR_UIDS: TEST_UID });
  const ordinaryCookie = `${await sessionCookie(ordinaryEmail, ordinaryUid)}; uid=${ordinaryCookieUid}`;
  response = await submit.onRequestPost({
    request: request('https://game-factory.test/api/gen/submit', {
      method: 'POST', cookie: ordinaryCookie, ip: '203.0.113.20',
      body: { prompt: 'A friendly puzzle while the public builder is paused' },
    }),
    env: pausedEnv,
  });
  parsed = await jsonResponse(response);
  assert(parsed.status === 503 && parsed.body.error === 'builder_unavailable', 'paused public builder accepted an ordinary job');
  assert(ordinaryKv.store.get(`meta:${ordinaryCookieUid}`) === ordinaryMeta, 'paused public submit mutated token balance');

  const ordinaryEnv = makeEnv(ordinaryKv, {
    GAME_FACTORY_COMPED_CREATOR_UIDS: TEST_UID,
    GAME_FACTORY_PUBLIC_BUILDER_ENABLED: '1',
  });
  response = await submit.onRequestPost({
    request: request('https://game-factory.test/api/gen/submit', {
      method: 'POST', cookie: ordinaryCookie, ip: '203.0.113.21',
      body: { prompt: 'A friendly puzzle with falling stars' },
    }),
    env: ordinaryEnv,
  });
  parsed = await jsonResponse(response);
  assert(parsed.status === 402 && parsed.body.error === 'need_tokens', 'ordinary zero-balance submit did not return 402');

  // The allowlisted, verified account is accepted at zero balance, routed only to
  // the trusted Codex lane, and keeps its player-token record byte-identical.
  response = await submit.onRequestPost({
    request: request('https://game-factory.test/api/gen/submit', {
      method: 'POST', cookie: partnerCookie, ip: '203.0.113.22',
      body: { prompt: 'A one-button garden game with growing crystal flowers' },
    }),
    env: partnerEnv,
  });
  parsed = await jsonResponse(response);
  assert(parsed.status === 200 && parsed.body.id, `comped submit failed: ${parsed.status} ${parsed.text}`);
  const jobId = parsed.body.id;
  let job = JSON.parse(partnerKv.store.get(`genjob:${jobId}`));
  assert(job.charge && job.charge.kind === 'comped', 'comped job recorded a token charge');
  assert(job.generatorLane === 'trusted-codex', 'comped job did not enter trusted-codex lane');
  assert(job.buildEvents[0].stage === 'queued', 'queued event was not persisted');
  assert(partnerKv.store.get(`meta:${partnerCookieUid}`) === partnerMeta, 'comped submit mutated token balance');
  assert(!partnerKv.store.has(`bonus60:${TEST_UID}`), 'comped submit granted signup bonus');

  // Partner allowlisting must never imply Gallery operator/admin access.
  const isAdmin = await adminAuth.isAdminRequest(request('https://game-factory.test/api/admin/stats', {
    cookie: partnerCookie,
  }), { ...partnerEnv, ADMIN_EMAILS: 'operator-test@example.invalid' });
  assert(isAdmin === false, 'comped creator inherited admin privileges');

  // Owner-only log: the owning session can read it; another valid session gets a
  // non-enumerating 404 and an unsigned request gets 401.
  response = await status.onRequestGet({
    request: request(`https://game-factory.test/api/gen/status?id=${jobId}`, { cookie: partnerCookie }),
    env: partnerEnv,
  });
  parsed = await jsonResponse(response);
  assert(parsed.status === 200 && parsed.body.events[0].message === 'Build queued.', 'owner could not read queued log');
  assert(parsed.body.billingMode === 'comped', 'owner status lost comped billing mode');
  response = await status.onRequestGet({
    request: request(`https://game-factory.test/api/gen/status?id=${jobId}`, { cookie: ordinaryCookie }),
    env: partnerEnv,
  });
  assert(response.status === 404, 'another signed-in user could read owner build log');
  response = await status.onRequestGet({
    request: request(`https://game-factory.test/api/gen/status?id=${jobId}`),
    env: partnerEnv,
  });
  assert(response.status === 401, 'unsigned request could read owner build log');

  // Raw relay errors are normalized before KV. Duplicate fine-grained and requeue
  // reports collapse to one stage failure for the attempt, while retry persists.
  const relayHeaders = { 'x-relay-token': RELAY_TOKEN, 'content-type': 'application/json' };
  async function postResult(body) {
    return result.onRequestPost({
      request: new Request('https://game-factory.test/api/admin/gen-result', {
        method: 'POST', headers: relayHeaders, body: JSON.stringify({ id: jobId, ...body }),
      }),
      env: partnerEnv,
    });
  }
  assert((await postResult({ status: 'building' })).status === 200, 'relay could not claim comped job');
  job = JSON.parse(partnerKv.store.get(`genjob:${jobId}`));
  const firstBuildStartedTs = job.buildStartedTs;
  assert(Number.isFinite(firstBuildStartedTs) && firstBuildStartedTs > 0, 'claim did not record a stable build start');
  // Simulate an apparently stale in-flight index, then renew it. A long Max
  // pass must not be offered to a second worker after the 10-minute sweep.
  job.updatedTs = Date.now() - 11 * 60 * 1000;
  partnerKv.store.set(`genjob:${jobId}`, JSON.stringify(job));
  await queueLib.markJobBuilding(partnerEnv, job);
  assert((await postResult({ status: 'heartbeat' })).status === 200, 'Studio Max lease heartbeat failed');
  job = JSON.parse(partnerKv.store.get(`genjob:${jobId}`));
  assert(job.buildStartedTs === firstBuildStartedTs, 'heartbeat reset elapsed build time');
  const duplicateCandidates = await queueLib.queueCandidateIds(partnerEnv, {
    limit: 3, lane: 'trusted-codex', now: Date.now(), stuckMs: 10 * 60 * 1000,
  });
  assert(!duplicateCandidates.includes(jobId), 'heartbeat-renewed build was offered to a second worker');

  assert((await postResult({
    status: 'event', stage: 'generation', state: 'started', pass: 1,
    model: 'gpt-5.6-sol', reasoningEffort: 'max',
  })).status === 200, 'configured-model event failed');
  assert((await postResult({
    status: 'event', stage: 'generation', state: 'passed', pass: 1,
    model: 'gpt-5.6-sol', reasoningEffort: 'max', durationMs: 123456,
    inputTokens: 7752, outputTokens: 5625, reasoningTokens: 1400,
  })).status === 200, 'generation token event failed');
  assert((await postResult({
    status: 'event', stage: 'polish', state: 'started', pass: 2,
    model: 'gpt-5.6-sol', reasoningEffort: 'max',
  })).status === 200, 'polish event failed');
  const rawFailure = 'smoke_failed: ReferenceError at /private/tmp/secret-path token=do-not-store';
  assert((await postResult({ status: 'event', stage: 'smoke', state: 'failed', error: rawFailure })).status === 200, 'relay event failed');
  assert((await postResult({ status: 'requeue', error: rawFailure })).status === 200, 'relay requeue failed');
  job = JSON.parse(partnerKv.store.get(`genjob:${jobId}`));
  const storedJob = JSON.stringify(job);
  assert(job.error === 'smoke_failed', 'requeue did not persist normalized body.error');
  assert(!storedJob.includes('/private/tmp') && !storedJob.includes('do-not-store'), 'raw relay error leaked into KV');
  assert(job.buildEvents.filter(event => event.stage === 'smoke' && event.state === 'failed').length === 1, 'duplicate smoke failure was stored');
  assert(job.buildEvents.some(event => event.stage === 'retry' && event.state === 'scheduled'), 'retry event was not stored');
  const generationDone = job.buildEvents.find(event => event.stage === 'generation' && event.state === 'passed');
  assert(generationDone && generationDone.model === 'gpt-5.6-sol' && generationDone.reasoningEffort === 'max', 'model/effort telemetry was not persisted');
  assert(generationDone.pass === 1 && generationDone.outputTokens === 5625 && generationDone.reasoningTokens === 1400, 'per-pass token telemetry was not persisted');
  assert(job.buildEvents.some(event => event.stage === 'polish' && event.pass === 2), 'polish pass was not distinguishable in the build log');
  assert(partnerKv.store.get(`meta:${partnerCookieUid}`) === partnerMeta, 'comped requeue/refund mutated token balance');

  // Make it a terminal first-build failure. It must remain listable by the owner
  // without an upload record, and the response must not expose prompt/email/raw data.
  assert((await postResult({ status: 'failed', error: 'generation timeout at /tmp/private' })).status === 200, 'terminal failure post failed');
  assert(!partnerKv.store.has(`upload:${jobId}`), 'failed first build unexpectedly created an upload');
  response = await jobs.onRequestGet({
    request: request('https://game-factory.test/api/gen/jobs', { cookie: partnerCookie }),
    env: partnerEnv,
  });
  parsed = await jsonResponse(response);
  assert(parsed.status === 200 && parsed.body.jobs.some(item => item.id === jobId && item.status === 'failed'), 'failed first build was not owner-listable');
  assert(!parsed.text.includes(TEST_EMAIL) && !parsed.text.includes('crystal flowers') && !parsed.text.includes('/tmp/private'), 'owner job list leaked private/raw fields');
  assert(partnerKv.store.get(`meta:${partnerCookieUid}`) === partnerMeta, 'comped terminal failure mutated token balance');

  response = await adminJobApi.onRequestGet({
    request: new Request(`https://game-factory.test/api/admin/gen-job?id=${jobId}`, { headers: { 'x-relay-token': RELAY_TOKEN } }),
    env: partnerEnv,
  });
  parsed = await jsonResponse(response);
  assert(parsed.status === 200 && parsed.body.job.id === jobId, 'relay watcher could not read sanitized operator job status');
  assert(!parsed.text.includes(TEST_EMAIL) && !parsed.text.includes('crystal flowers') && !parsed.text.includes('/tmp/private'), 'operator job status leaked private/raw fields');

  // A relay coming back after five days must terminal-fail a stale job at claim
  // time instead of rebuilding forever. Comped expiry still cannot mutate tokens.
  const expiredId = 'dddddddddddddddddddddddddddddddd';
  partnerKv.store.set(`genjob:${expiredId}`, JSON.stringify({
    id: expiredId, uid: TEST_UID, email: TEST_EMAIL, prompt: 'expired test', status: 'pending',
    generatorLane: 'trusted-codex', charge: { kind: 'comped', amount: 0 },
    ts: Date.now() - 6 * 24 * 60 * 60 * 1000, updatedTs: Date.now() - 6 * 24 * 60 * 60 * 1000,
  }));
  response = await result.onRequestPost({
    request: new Request('https://game-factory.test/api/admin/gen-result', {
      method: 'POST', headers: relayHeaders, body: JSON.stringify({ id: expiredId, status: 'building' }),
    }),
    env: partnerEnv,
  });
  parsed = await jsonResponse(response);
  assert(parsed.status === 200 && parsed.body.status === 'failed', 'five-day-old job was still claimed for generation');
  const expiredJob = JSON.parse(partnerKv.store.get(`genjob:${expiredId}`));
  assert(expiredJob.buildEvents.some(event => event.stage === 'failed' && event.code === 'expired'), 'expired claim did not persist a terminal log event');
  const retainedRefs = JSON.parse(partnerKv.store.get(`genjobs:user:${TEST_UID}`) || '[]');
  assert(retainedRefs.some(item => item.id === expiredId), 'terminal failure did not refresh the owner log index retention');
  assert(partnerKv.store.get(`meta:${partnerCookieUid}`) === partnerMeta, 'comped expiry mutated token balance');

  // Trusted two-pass jobs stop after three failed attempts. This bounds one bad
  // prompt to at most six Sol Max calls instead of the legacy 30-attempt loop.
  const cappedId = 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
  partnerKv.store.set(`genjob:${cappedId}`, JSON.stringify({
    id: cappedId, uid: TEST_UID, email: TEST_EMAIL, prompt: 'retry cap test', status: 'building',
    generatorLane: 'trusted-codex', charge: { kind: 'comped', amount: 0 }, attempts: 2,
    ts: Date.now(), updatedTs: Date.now(),
  }));
  response = await result.onRequestPost({
    request: new Request('https://game-factory.test/api/admin/gen-result', {
      method: 'POST', headers: relayHeaders,
      body: JSON.stringify({ id: cappedId, status: 'requeue', error: 'rate_limited' }),
    }),
    env: partnerEnv,
  });
  parsed = await jsonResponse(response);
  assert(parsed.status === 200 && parsed.body.status === 'failed' && parsed.body.reason === 'max_attempts', 'trusted Studio Max retry cap exceeded three attempts');

  // Every retained log must be reachable, not merely present in KV. Exercise
  // both pages so a high-volume partner can inspect more than one day's jobs.
  const pageRefs = Array.from({ length: 25 }, (_, index) => ({
    id: (1000 + index).toString(16).padStart(32, '0'),
    ts: Date.now() - index,
  }));
  partnerKv.store.set(`genjobs:user:${TEST_UID}`, JSON.stringify(pageRefs));
  pageRefs.forEach((ref, index) => partnerKv.store.set(`genjob:${ref.id}`, JSON.stringify({
    id: ref.id, uid: TEST_UID, status: index % 2 ? 'failed' : 'ready', ts: ref.ts, updatedTs: ref.ts,
  })));
  response = await jobs.onRequestGet({
    request: request('https://game-factory.test/api/gen/jobs?limit=20&offset=0', { cookie: partnerCookie }),
    env: partnerEnv,
  });
  parsed = await jsonResponse(response);
  assert(parsed.status === 200 && parsed.body.jobs.length === 20 && parsed.body.hasMore === true && parsed.body.nextOffset === 20, 'first owner-log page is not reachable');
  response = await jobs.onRequestGet({
    request: request(`https://game-factory.test/api/gen/jobs?limit=20&offset=${parsed.body.nextOffset}`, { cookie: partnerCookie }),
    env: partnerEnv,
  });
  parsed = await jsonResponse(response);
  assert(parsed.status === 200 && parsed.body.jobs.length === 5 && parsed.body.hasMore === false && parsed.body.nextOffset === 25, 'older owner-log page is not reachable');

  // Charge-aware player copy.
  assert(/No tokens were charged/.test(history.buildFailureSummary('generation_failed', { comped: true })), 'comped failure copy claims a refund');
  assert(/Tokens were refunded/.test(history.buildFailureSummary('generation_failed')), 'paid failure copy lost refund wording');
  assert(jobLog.classifyBuildError('invalid_html').code === 'invalid_html', 'stored invalid_html code was not idempotent');
  assert(jobLog.classifyBuildError('expired').code === 'expired', 'stored expired code was not idempotent');

  // Lane filtering happens before limit slicing, so old public jobs cannot starve
  // a newer trusted job. Missing lane defaults to public at the API boundary.
  const laneKv = makeKv();
  const laneEnv = makeEnv(laneKv);
  for (let i = 0; i < 30; i++) {
    const id = `aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa${String(i).padStart(2, '0')}`;
    const rec = { id, uid: ordinaryUid, prompt: `public ${i}`, status: 'pending', generatorLane: 'public', ts: i + 1 };
    laneKv.store.set(`genjob:${id}`, JSON.stringify(rec));
    await queueLib.addPendingJob(laneEnv, rec);
  }
  const trustedId = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
  const trusted = { id: trustedId, uid: TEST_UID, prompt: 'trusted', status: 'pending', generatorLane: 'trusted-codex', ts: 100 };
  laneKv.store.set(`genjob:${trustedId}`, JSON.stringify(trusted));
  await queueLib.addPendingJob(laneEnv, trusted);
  const candidates = await queueLib.queueCandidateIds(laneEnv, { limit: 1, lane: 'trusted-codex', now: 200 });
  assert(candidates.length === 1 && candidates[0] === trustedId, 'public queue entries starved trusted lane');
  response = await queueApi.onRequestGet({
    request: new Request('https://game-factory.test/api/admin/gen-queue?limit=1', { headers: { 'x-relay-token': RELAY_TOKEN } }),
    env: laneEnv,
  });
  parsed = await jsonResponse(response);
  assert(parsed.body.jobs[0].generatorLane === 'public', 'missing queue lane did not fail closed to public');
  response = await queueApi.onRequestGet({
    request: new Request('https://game-factory.test/api/admin/gen-queue?limit=1&lane=trusted-codex', { headers: { 'x-relay-token': RELAY_TOKEN } }),
    env: laneEnv,
  });
  parsed = await jsonResponse(response);
  assert(parsed.body.jobs.length === 1 && parsed.body.jobs[0].id === trustedId, 'trusted queue API did not isolate trusted lane');

  // Pre-lane records must remain processable by a legacy/public worker, but can
  // never leak into the trusted Codex partner lane.
  const legacyKv = makeKv();
  const legacyEnv = makeEnv(legacyKv);
  const legacyId = 'cccccccccccccccccccccccccccccccc';
  const legacy = { id: legacyId, uid: ordinaryUid, prompt: 'legacy public', status: 'pending', ts: 50 };
  legacyKv.store.set(`genjob:${legacyId}`, JSON.stringify(legacy));
  legacyKv.store.set('genqueue:pending', JSON.stringify([{ id: legacyId, ts: 50 }]));
  response = await queueApi.onRequestGet({
    request: new Request('https://game-factory.test/api/admin/gen-queue?limit=1', { headers: { 'x-relay-token': RELAY_TOKEN } }),
    env: legacyEnv,
  });
  parsed = await jsonResponse(response);
  assert(parsed.body.jobs.length === 1 && parsed.body.jobs[0].generatorLane === 'public', 'legacy job was stranded instead of defaulting public');
  response = await queueApi.onRequestGet({
    request: new Request('https://game-factory.test/api/admin/gen-queue?limit=1&lane=trusted-codex', { headers: { 'x-relay-token': RELAY_TOKEN } }),
    env: legacyEnv,
  });
  parsed = await jsonResponse(response);
  assert(parsed.body.jobs.length === 0, 'legacy unlabeled job entered trusted Codex lane');

  // Static accessibility and reviewer safety assertions.
  const createHtml = fs.readFileSync(path.join(ROOT, 'create.html'), 'utf8');
  const vibeJs = fs.readFileSync(path.join(ROOT, 'vibe.js'), 'utf8');
  const styleCss = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');
  const userJobsLib = fs.readFileSync(path.join(ROOT, 'functions/_lib/genUserJobs.js'), 'utf8');
  const creatorAdminHtml = fs.readFileSync(path.join(ROOT, 'creator-admin.html'), 'utf8');
  assert(/<ol[^>]+id="create-build-events"/.test(createHtml), 'build log is not a semantic ordered list');
  assert(/id="create-build-log-live"[^>]+aria-live="polite"[^>]+aria-atomic="true"/.test(createHtml), 'build log has no centralized polite live region');
  assert(/id="create-recent-list"[^>]+role="list"/.test(createHtml), 'CSS-reset recent jobs list does not restore list semantics');
  assert(/id="create-recent-more"[^>]+type="button"[^>]+hidden/.test(createHtml), 'older build logs have no discoverable pagination control');
  assert(/\.create-recent-more:not\(\[hidden\]\)/.test(styleCss), 'hidden older-build control is forced visible by author CSS');
  assert(/const MAX_JOBS = 600;/.test(userJobsLib), 'owner log index cannot cover 30 days at the partner daily limit');
  assert(/id="create-build-log"[^>]+role="region"[^>]+aria-labelledby=/.test(createHtml), 'build log label is not attached to a semantic region');
  assert(/id="create-status"[^>]+tabindex="-1"/.test(createHtml), 'build status cannot receive programmatic focus');
  assert(!/\.innerHTML\s*=/.test(vibeJs), 'creator UI writes build data through innerHTML');
  assert(/JOB_KEY \+ ':' \+ currentUid/.test(vibeJs), 'saved job key is not scoped to the signed-in UID');
  assert(/r\.status === 401 \|\| r\.status === 404[\s\S]+dropInaccessibleJob/.test(vibeJs), 'owner-only status errors do not clear stale resume state');
  assert(/api\/gen\/jobs\?limit=20&offset=[^\n]+recentOffset/.test(vibeJs), 'creator UI cannot page through retained build logs');
  assert(/latest\.stage === 'polish'[\s\S]+Polishing and QA in Studio Max/.test(vibeJs), 'creator UI does not surface the second quality pass');
  assert(/s\.billingMode === 'comped'[\s\S]+No tokens were charged\./.test(creatorAdminHtml), 'creator admin failure copy is not charge-aware');

  const reviewScript = fs.readFileSync(path.join(ROOT, 'scripts/pre_push_review.sh'), 'utf8');
  assert(/codex_bin,[\s\S]*?"-a", "never"[\s\S]*?"exec", "--ephemeral", "--ignore-user-config"/.test(reviewScript), 'pre-push review is not non-interactive Codex');
  assert(/"--sandbox", "read-only"/.test(reviewScript), 'pre-push Codex review is not read-only');
  assert(/"--output-schema"/.test(reviewScript), 'pre-push Codex review lacks deterministic schema output');
  assert(/"--disable", "shell_tool"/.test(reviewScript), 'pre-push Codex review can still execute shell commands');
  assert(/cwd=review_workspace/.test(reviewScript), 'pre-push Codex review still runs inside the repository');
  assert(!/"--ignore-rules"/.test(reviewScript), 'pre-push Codex review disables its deny policy');
  assert(!/head -c 60000|DIFF_TRUNCATED/.test(reviewScript), 'pre-push Codex review silently truncates the deploy diff');
  assert(/Complete diff \([^\n]+no truncation\)/.test(reviewScript) && /prompt = sys\.stdin\.read\(\)/.test(reviewScript), 'pre-push Codex review does not receive the complete diff');
  assert(!/CLAUDE_BIN|dangerously-skip-permissions|REVIEW_FAIL_OPEN/.test(reviewScript), 'pre-push review retains unsafe/stale Claude bypass');
  const syntax = childProcess.spawnSync('bash', ['-n', path.join(ROOT, 'scripts/pre_push_review.sh')]);
  assert(syntax.status === 0, `pre-push review shell syntax failed: ${String(syntax.stderr || '')}`);

  console.log('PASS partner-creator lane, owner logs, queue isolation, accessible UI, Codex review gate');
}

main().catch((error) => {
  console.error('FAIL partner-creator:', error.message);
  process.exit(1);
});
