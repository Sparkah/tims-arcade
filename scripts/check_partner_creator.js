#!/usr/bin/env node
/**
 * Regression coverage for the comped creator lane and owner build log.
 *
 * Run with a local test identity (never committed):
 *   PARTNER_TEST_EMAIL=<verified-email> PARTNER_TEST_UID=<emailToUid result> node scripts/check_partner_creator.js
 */

const fs = require('fs');
const nodeCrypto = require('crypto');
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
      if (type === 'json') return JSON.parse(value);
      if (type && typeof type === 'object' && type.type === 'arrayBuffer') {
        if (value instanceof ArrayBuffer) return value.slice(0);
        if (ArrayBuffer.isView(value)) return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
        return new TextEncoder().encode(String(value)).buffer;
      }
      return value;
    },
    async put(key, value, options = {}) {
      puts.push({ key, options: { ...options } });
      if (value instanceof ArrayBuffer) store.set(key, value.slice(0));
      else if (ArrayBuffer.isView(value)) store.set(key, new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength)));
      else store.set(key, String(value));
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

function request(url, { method = 'GET', cookie = '', ip = '203.0.113.20', body, form } = {}) {
  const headers = { origin: 'https://game-factory.test', 'cf-connecting-ip': ip };
  if (cookie) headers.cookie = cookie;
  if (body !== undefined && form === undefined) headers['content-type'] = 'application/json';
  return new Request(url, {
    method,
    headers,
    body: form !== undefined ? form : (body === undefined ? undefined : JSON.stringify(body)),
  });
}

const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const JPEG_B64 = '/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AKpAB//Z';
const WEBP_B64 = 'UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAgA0JaQAA3AA/vv9UAA=';

function decodedBytes(base64) {
  return new Uint8Array(Buffer.from(base64, 'base64'));
}

function referencePng(size) {
  const valid = decodedBytes(PNG_B64);
  if (!size) return valid;
  const bytes = new Uint8Array(size);
  bytes.set(valid.subarray(0, Math.min(valid.length, bytes.length)));
  return bytes;
}

function referenceJpeg() { return decodedBytes(JPEG_B64); }
function referenceWebp() { return decodedBytes(WEBP_B64); }

function pngCrc32(bytes, start, end) {
  let crc = 0xFFFFFFFF;
  for (let i = start; i < end; i++) {
    crc ^= bytes[i];
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xEDB88320 : 0);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function pngWithDimensions(width, height) {
  const bytes = referencePng();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  view.setUint32(16, width);
  view.setUint32(20, height);
  view.setUint32(29, pngCrc32(bytes, 12, 29));
  return bytes;
}

function submitForm(prompt, image, iterateId, requestId) {
  const form = new FormData();
  form.append('prompt', prompt);
  if (iterateId) form.append('iterateId', iterateId);
  if (requestId) form.append('requestId', requestId);
  if (image) form.append('referenceImage', image);
  return form;
}

function validGameHtml(label) {
  const levels = Array.from({ length: 5 }, (_, index) => ({
    name: `Level ${index + 1}`, width: 360 + index, height: 640,
    player: { x: 20 + index, y: 30 }, goal: { x: 300, y: 500 - index },
    objects: [{ type: 'counter', x: 40 + index * 10, y: 200, w: 40, h: 40, value: index + 1 }],
  }));
  return '<!DOCTYPE html><html><head><title>' + label + '</title></head><body><main>' + label +
    '</main><script id="gameFactoryLevelSeed" type="application/json">' +
    JSON.stringify({ schema: 'game-factory-generic-levels-v1', levels }) +
    '</script><script id="gameFactoryBuildSummary" type="application/json">' +
    JSON.stringify({ summary: label + ' ready.', changes: [label] }) +
    '</script></body></html>';
}

function canonicalRuntimeLevelPayload(payload) {
  return {
    schema: payload && payload.schema || 'game-factory-generic-levels-v1',
    levels: (payload && Array.isArray(payload.levels) ? payload.levels : []).map(level => ({
      name: level && level.name || '',
      width: level && level.width,
      height: level && level.height,
      player: { x: level && level.player && level.player.x, y: level && level.player && level.player.y },
      goal: { x: level && level.goal && level.goal.x, y: level && level.goal && level.goal.y },
      objects: (level && Array.isArray(level.objects) ? level.objects : []).map(object => ({
        id: object && object.id || '',
        type: object && object.type,
        x: object && object.x,
        y: object && object.y,
        w: object && object.w,
        h: object && object.h,
        value: object && object.value,
        label: object && object.label || '',
      })),
      notes: level && level.notes || '',
    })),
  };
}

function runtimeLevelMessage(creationId, payload) {
  const canonical = canonicalRuntimeLevelPayload(payload);
  return { type:'gameFactoryLevels', schema:canonical.schema, id:String(creationId || '').toLowerCase(), levels:canonical.levels };
}

function qaReceiptFor(html, creationId, runtimeLevelPayload) {
  const sha256 = value => nodeCrypto.createHash('sha256').update(String(value || '')).digest('hex');
  const pass = { boot: true, rendered: true, levelBridge: true, firstAction: true, aliveAfterSettle: true };
  return {
    schema: 'game-factory-runtime-smoke-v3',
    htmlSha256: sha256(html),
    levelMessageSha256: sha256(JSON.stringify(runtimeLevelMessage(creationId, runtimeLevelPayload))),
    viewports: {
      mobile: { width:393, height:808, hasTouch:true, ...pass },
      desktop: { width:1280, height:676, hasTouch:false, ...pass },
    },
  };
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
  const imageApi = await import(pathToFileURL(path.join(ROOT, 'functions/api/admin/gen-image.js')).href);
  const referenceLib = await import(pathToFileURL(path.join(ROOT, 'functions/_lib/genReferenceImage.js')).href);
  const posthogInit = await import(pathToFileURL(path.join(ROOT, 'functions/posthog-init.js')).href);
  const adminJobApi = await import(pathToFileURL(path.join(ROOT, 'functions/api/admin/gen-job.js')).href);
  const history = await import(pathToFileURL(path.join(ROOT, 'functions/_lib/creationHistory.js')).href);
  const jobLog = await import(pathToFileURL(path.join(ROOT, 'functions/_lib/genJobLog.js')).href);
  const creationLevels = await import(pathToFileURL(path.join(ROOT, 'functions/_lib/creationLevels.js')).href);

  for (const [bytes, mime] of [
    [referencePng(), 'image/png'],
    [referenceJpeg(), 'image/jpeg'],
    [referenceWebp(), 'image/webp'],
  ]) {
    const checked = await referenceLib.validateReferenceImage(new File([bytes], 'fixture', { type: mime }));
    assert(checked.ok && checked.metadata.width === 1 && checked.metadata.height === 1, `real ${mime} fixture failed structural validation`);
  }
  const truncatedPng = pngWithDimensions(1, 1).slice(0, 33);
  const truncatedCheck = await referenceLib.validateReferenceImage(new File([truncatedPng], 'truncated.png', { type: 'image/png' }));
  assert(!truncatedCheck.ok && truncatedCheck.error === 'image_unreadable', 'header-only PNG passed structural validation');

  let response = await posthogInit.onRequestGet({
    request: new Request('https://game-factory.test/posthog-init?v=private-reference-1'),
    env: { PUBLIC_POSTHOG_KEY: 'phc_test', PUBLIC_POSTHOG_HOST: 'https://eu.posthog.com' },
  });
  const posthogScript = await response.text();
  assert(/maskCapturedNetworkRequestFn/.test(posthogScript) && /\/api\/gen\/submit/.test(posthogScript) && /return null/.test(posthogScript), 'PostHog replay can capture Studio multipart bodies');

  const partnerCookieUid = 'partner-browser-cookie';
  const partnerCookie = `${await sessionCookie(TEST_EMAIL, TEST_UID)}; uid=${partnerCookieUid}`;
  const partnerMeta = JSON.stringify({ tokens: 0, lifetime: 0, streak: 0, bestStreak: 0 });
  const partnerKv = makeKv({ [`meta:${partnerCookieUid}`]: partnerMeta });
  const partnerEnv = makeEnv(partnerKv, { GAME_FACTORY_COMPED_CREATOR_UIDS: TEST_UID });

  // Quota identifies the partner without granting the signup bonus or touching
  // the cookie-bound token record.
  response = await quota.onRequestGet({
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

  // Image references remain isolated to the allowlisted private Studio lane,
  // even if the public text builder is explicitly enabled.
  const ordinaryImageForm = submitForm(
    'A public game that tries to attach a private screenshot',
    new File([referencePng()], 'not-allowed.png', { type: 'image/png' }),
  );
  response = await submit.onRequestPost({
    request: request('https://game-factory.test/api/gen/submit', {
      method: 'POST', cookie: ordinaryCookie, ip: '203.0.113.23', form: ordinaryImageForm,
    }),
    env: ordinaryEnv,
  });
  parsed = await jsonResponse(response);
  assert(parsed.status === 403 && parsed.body.error === 'image_not_available', 'ordinary creator entered the private image lane');

  // The allowlisted, verified account is accepted at zero balance, routed only to
  // the trusted Codex lane, stores reference pixels separately, and keeps its
  // player-token record byte-identical.
  const referenceBytes = referenceWebp();
  const clientRequestId = '1234567890abcdef1234567890abcdef';
  const partnerImageForm = submitForm(
    'A one-button garden game with growing crystal flowers',
    new File([referenceBytes], 'private-market-layout.webp', { type: 'image/webp' }),
    null,
    clientRequestId,
  );
  response = await submit.onRequestPost({
    request: request('https://game-factory.test/api/gen/submit', {
      method: 'POST', cookie: partnerCookie, ip: '203.0.113.22',
      form: partnerImageForm,
    }),
    env: partnerEnv,
  });
  parsed = await jsonResponse(response);
  assert(parsed.status === 200 && parsed.body.id, `comped submit failed: ${parsed.status} ${parsed.text}`);
  const jobId = parsed.body.id;
  assert(/^[0-9a-f]{32}$/.test(jobId) && jobId !== clientRequestId, 'client nonce was not converted to an opaque server-derived job id');
  let job = JSON.parse(partnerKv.store.get(`genjob:${jobId}`));
  assert(job.charge && job.charge.kind === 'comped', 'comped job recorded a token charge');
  assert(job.generatorLane === 'trusted-codex', 'comped job did not enter trusted-codex lane');
  assert(job.referenceImage && job.referenceImage.mime === 'image/webp' && job.referenceImage.sizeBytes === referenceBytes.byteLength, 'job lost safe reference metadata');
  assert(job.referenceImage.width === 1 && job.referenceImage.height === 1, 'server did not validate reference dimensions');
  assert(parsed.body.hasReferenceImage === true, 'submit response did not acknowledge the reference');
  const storedReference = partnerKv.store.get(`genref:${jobId}`);
  assert(storedReference instanceof Uint8Array && storedReference.byteLength === referenceBytes.byteLength, 'reference pixels were not stored separately');
  assert(!JSON.stringify(job).includes('private-market-layout.webp'), 'original reference filename leaked into the job');
  assert(job.buildEvents[0].stage === 'queued', 'queued event was not persisted');
  assert(partnerKv.store.get(`meta:${partnerCookieUid}`) === partnerMeta, 'comped submit mutated token balance');
  assert(!partnerKv.store.has(`bonus60:${TEST_UID}`), 'comped submit granted signup bonus');
  const referencePut = partnerKv.puts.find(entry => entry.key === `genref:${jobId}`);
  assert(referencePut && referencePut.options.expirationTtl === 7 * 24 * 60 * 60, 'private reference TTL is not seven days');

  // A lost success response can be retried with the same cryptographic request
  // id without creating a second job/blob/daily-cap reservation.
  const dailyKey = `genrate:${TEST_UID}:${new Date().toISOString().slice(0, 10)}`;
  const dailyBeforeReplay = partnerKv.store.get(dailyKey);
  response = await submit.onRequestPost({
    request: request('https://game-factory.test/api/gen/submit', {
      method: 'POST', cookie: partnerCookie, ip: '203.0.113.22',
      form: submitForm(
        'A one-button garden game with growing crystal flowers',
        new File([referenceBytes], 'private-market-layout.webp', { type: 'image/webp' }),
        null,
        clientRequestId,
      ),
    }),
    env: partnerEnv,
  });
  parsed = await jsonResponse(response);
  assert(parsed.status === 200 && parsed.body.id === jobId, 'idempotent multipart replay created a different job');
  assert(partnerKv.store.get(dailyKey) === dailyBeforeReplay, 'idempotent replay consumed another daily slot');
  assert(Array.from(partnerKv.store.keys()).filter(key => key.startsWith('genref:')).length === 1, 'idempotent replay stored a duplicate reference');

  const collisionKv = makeKv();
  const collisionEnv = makeEnv(collisionKv, { GAME_FACTORY_COMPED_CREATOR_UIDS: TEST_UID });
  const collisionNonce = '4234567890abcdef1234567890abcdef';
  const collisionPrompt = 'A text-only multipart idempotency fixture';
  response = await submit.onRequestPost({
    request: request('https://game-factory.test/api/gen/submit', {
      method: 'POST', cookie: partnerCookie, ip: '203.0.113.33',
      form: submitForm(collisionPrompt, null, null, collisionNonce),
    }),
    env: collisionEnv,
  });
  parsed = await jsonResponse(response);
  const collisionId = parsed.body && parsed.body.id;
  assert(parsed.status === 200 && /^[0-9a-f]{32}$/.test(collisionId), 'server-derived id fixture did not queue');
  collisionKv.store.delete(`genjob:${collisionId}`);
  const occupied = JSON.stringify({ id: collisionId, uid: ordinaryUid, source: 'vibe', title: 'Existing game' });
  collisionKv.store.set(`upload:${collisionId}`, occupied);
  response = await submit.onRequestPost({
    request: request('https://game-factory.test/api/gen/submit', {
      method: 'POST', cookie: partnerCookie, ip: '203.0.113.34',
      form: submitForm(collisionPrompt, null, null, collisionNonce),
    }),
    env: collisionEnv,
  });
  parsed = await jsonResponse(response);
  assert(parsed.status === 409 && parsed.body.error === 'request_conflict', 'client nonce could overwrite an occupied creation id');
  assert(collisionKv.store.get(`upload:${collisionId}`) === occupied, 'occupied creation changed during idempotency conflict');

  // Queue polling carries only a boolean. The relay downloads the bytes through
  // a separate token-gated, no-store endpoint and gets the exact validated data.
  response = await queueApi.onRequestGet({
    request: new Request('https://game-factory.test/api/admin/gen-queue?limit=1&lane=trusted-codex', { headers: { 'x-relay-token': RELAY_TOKEN } }),
    env: partnerEnv,
  });
  parsed = await jsonResponse(response);
  assert(parsed.status === 200 && parsed.body.jobs[0].id === jobId && parsed.body.jobs[0].hasReferenceImage === true, 'trusted queue lost the reference signal');
  assert(!parsed.text.includes('image/webp') && !parsed.text.includes('private-market-layout.webp'), 'queue response leaked reference metadata');
  response = await imageApi.onRequestGet({
    request: new Request(`https://game-factory.test/api/admin/gen-image?id=${jobId}`),
    env: partnerEnv,
  });
  assert(response.status === 401 || response.status === 403, 'unsigned caller downloaded a private Studio reference');
  response = await imageApi.onRequestGet({
    request: new Request(`https://game-factory.test/api/admin/gen-image?id=${jobId}`, { headers: { 'x-relay-token': RELAY_TOKEN } }),
    env: partnerEnv,
  });
  const downloadedReference = new Uint8Array(await response.arrayBuffer());
  assert(response.status === 200 && response.headers.get('content-type') === 'image/webp', 'relay reference endpoint lost the validated MIME');
  assert(/no-store/.test(response.headers.get('cache-control') || '') && response.headers.get('x-content-type-options') === 'nosniff', 'relay reference response is cacheable or sniffable');
  assert(Buffer.from(downloadedReference).equals(Buffer.from(referenceBytes)), 'relay reference bytes changed in transit');

  const mismatchedImage = new Uint8Array(96);
  response = await submit.onRequestPost({
    request: request('https://game-factory.test/api/gen/submit', {
      method: 'POST', cookie: partnerCookie, ip: '203.0.113.24',
      form: submitForm('A build with a disguised non-image file', new File([mismatchedImage], 'fake.png', { type: 'image/png' })),
    }),
    env: partnerEnv,
  });
  parsed = await jsonResponse(response);
  assert(parsed.status === 400 && parsed.body.error === 'image_mismatch', 'magic-byte mismatch passed image validation');

  const oversizedImage = referencePng(2 * 1024 * 1024 + 1);
  response = await submit.onRequestPost({
    request: request('https://game-factory.test/api/gen/submit', {
      method: 'POST', cookie: partnerCookie, ip: '203.0.113.25',
      form: submitForm('A build with an oversized screenshot', new File([oversizedImage], 'huge.png', { type: 'image/png' })),
    }),
    env: partnerEnv,
  });
  parsed = await jsonResponse(response);
  assert(parsed.status === 413 && parsed.body.error === 'image_too_large', 'oversized reference passed image validation');

  const overwideImage = pngWithDimensions(3000, 1);
  response = await submit.onRequestPost({
    request: request('https://game-factory.test/api/gen/submit', {
      method: 'POST', cookie: partnerCookie, ip: '203.0.113.27',
      form: submitForm('A build with unsafe image dimensions', new File([overwideImage], 'overwide.png', { type: 'image/png' })),
    }),
    env: partnerEnv,
  });
  parsed = await jsonResponse(response);
  assert(parsed.status === 413 && parsed.body.error === 'image_dimensions', 'unsafe reference dimensions passed validation');

  // A failure after the separate blob write must roll the blob back instead of
  // leaving an ownerless private image until TTL.
  const rollbackKv = makeKv();
  const normalRollbackPut = rollbackKv.put;
  rollbackKv.put = async function (key, value, options) {
    if (key.startsWith('genjob:') && key !== 'genjob:signal') {
      await normalRollbackPut(key, value, options);
      throw new Error('forced commit-then-error job write failure');
    }
    return normalRollbackPut(key, value, options);
  };
  const rollbackEnv = makeEnv(rollbackKv, { GAME_FACTORY_COMPED_CREATOR_UIDS: TEST_UID });
  response = await submit.onRequestPost({
    request: request('https://game-factory.test/api/gen/submit', {
      method: 'POST', cookie: partnerCookie, ip: '203.0.113.26',
      form: submitForm('A private build whose job write fails', new File([referencePng()], 'rollback.png', { type: 'image/png' })),
    }),
    env: rollbackEnv,
  });
  parsed = await jsonResponse(response);
  assert(parsed.status === 500 && parsed.body.error === 'enqueue_failed', 'forced job-write failure was not surfaced');
  assert(!Array.from(rollbackKv.store.keys()).some(key => key.startsWith('genref:')), 'failed enqueue left a private reference blob behind');
  assert(!Array.from(rollbackKv.store.keys()).some(key => key.startsWith('genjob:') && key !== 'genjob:signal'), 'commit-then-error left an orphan job record');
  const rollbackDailyKey = `genrate:${TEST_UID}:${new Date().toISOString().slice(0, 10)}`;
  assert(rollbackKv.store.get(rollbackDailyKey) === '0', 'failed enqueue consumed a successful-build daily slot');

  const blobRollbackKv = makeKv();
  const normalBlobPut = blobRollbackKv.put;
  blobRollbackKv.put = async function (key, value, options) {
    await normalBlobPut(key, value, options);
    if (key.startsWith('genref:')) throw new Error('forced commit-then-error image write failure');
  };
  const blobRollbackEnv = makeEnv(blobRollbackKv, { GAME_FACTORY_COMPED_CREATOR_UIDS: TEST_UID });
  response = await submit.onRequestPost({
    request: request('https://game-factory.test/api/gen/submit', {
      method: 'POST', cookie: partnerCookie, ip: '203.0.113.29',
      form: submitForm('A private image-store rollback', new File([referenceWebp()], 'rollback.webp', { type: 'image/webp' })),
    }),
    env: blobRollbackEnv,
  });
  parsed = await jsonResponse(response);
  assert(parsed.status === 500 && !Array.from(blobRollbackKv.store.keys()).some(key => key.startsWith('genref:')), 'commit-then-error image write left a private blob');

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
  async function postResultFor(id, body) {
    return result.onRequestPost({
      request: new Request('https://game-factory.test/api/admin/gen-result', {
        method: 'POST', headers: relayHeaders, body: JSON.stringify({ id, ...body }),
      }),
      env: partnerEnv,
    });
  }
  async function postResult(body) { return postResultFor(jobId, body); }
  assert((await postResult({ status: 'building' })).status === 200, 'relay could not claim comped job');
  response = await imageApi.onRequestGet({
    request: new Request(`https://game-factory.test/api/admin/gen-image?id=${jobId}`, { headers: { 'x-relay-token': RELAY_TOKEN } }),
    env: partnerEnv,
  });
  assert(response.status === 200, 'claimed/building image became unavailable to the relay');
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
  assert(partnerKv.store.has(`genref:${jobId}`), 'transient requeue deleted the reference needed for retry');
  response = await imageApi.onRequestGet({
    request: new Request(`https://game-factory.test/api/admin/gen-image?id=${jobId}`, { headers: { 'x-relay-token': RELAY_TOKEN } }),
    env: partnerEnv,
  });
  assert(response.status === 200, 'requeued/pending image became unavailable to the relay');

  // Make it a terminal first-build failure. It must remain listable by the owner
  // without an upload record, and the response must not expose prompt/email/raw data.
  assert((await postResult({ status: 'failed', error: 'generation timeout at /tmp/private' })).status === 200, 'terminal failure post failed');
  assert(!partnerKv.store.has(`upload:${jobId}`), 'failed first build unexpectedly created an upload');
  assert(!partnerKv.store.has(`genref:${jobId}`), 'terminal failure retained the private reference image');
  response = await imageApi.onRequestGet({
    request: new Request(`https://game-factory.test/api/admin/gen-image?id=${jobId}`, { headers: { 'x-relay-token': RELAY_TOKEN } }),
    env: partnerEnv,
  });
  assert(response.status === 404, 'terminal image endpoint still exposed a deleted reference');
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

  // Successful fresh and Improve lifecycles both delete the reference. Improve
  // keeps the same listed/unlisted creation id, carries base HTML to the relay,
  // and releases its one-in-flight lock.
  const freshRequestNonce = '2234567890abcdef1234567890abcdef';
  response = await submit.onRequestPost({
    request: request('https://game-factory.test/api/gen/submit', {
      method: 'POST', cookie: partnerCookie, ip: '203.0.113.31',
      form: submitForm(
        'A market where patrons request produce and the player bags it',
        new File([referenceWebp()], 'market-flow.webp', { type: 'image/webp' }),
        null,
        freshRequestNonce,
      ),
    }),
    env: partnerEnv,
  });
  parsed = await jsonResponse(response);
  assert(parsed.status === 200 && /^[0-9a-f]{32}$/.test(parsed.body.id) && parsed.body.id !== freshRequestNonce, 'fresh image success fixture did not queue');
  const freshId = parsed.body.id;
  assert((await postResultFor(freshId, { status: 'building' })).status === 200, 'fresh success fixture could not be claimed');
  const freshHtml = validGameHtml('Fresh Market Flow');
  response = await postResultFor(freshId, {
    status: 'ready', html: freshHtml, title: 'Fresh Market Flow', quality: 'ok',
    qaReceipt: qaReceiptFor(freshHtml, freshId, creationLevels.extractEmbeddedLevelSeed(freshHtml)),
  });
  parsed = await jsonResponse(response);
  assert(parsed.status === 200 && parsed.body.status === 'ready' && parsed.body.playUrl === `/g/${freshId}`, 'fresh image job did not finish ready');
  assert(!partnerKv.store.has(`genref:${freshId}`), 'successful fresh job retained its reference');
  const freshUpload = JSON.parse(partnerKv.store.get(`upload:${freshId}`));
  assert(freshUpload && freshUpload.source === 'vibe' && freshUpload.uid === TEST_UID && freshUpload.visibility === 'unlisted', 'fresh ready job did not create an owned unlisted game');

  // A creator edit is authoritative during Improve. The queue must send this
  // exact runtime payload and the result receipt must bind it, not the new
  // HTML's otherwise-safe embedded seed.
  partnerKv.store.set(`creation-levels:${freshId}`, JSON.stringify({
    schema:'game-factory-generic-levels-v1', source:'creator-admin', updatedTs:12345,
    levels:[{
      name:'Saved Market Layout', width:1520, height:720,
      player:{ x:90, y:620 }, goal:{ x:1435, y:620 },
      objects:[{ id:'saved-counter', type:'counterBin', x:600, y:500, w:160, h:80, value:-0.25, label:'Saved bin' }], notes:'owner edit',
    }],
  }));

  const improveRequestNonce = '3234567890abcdef1234567890abcdef';
  response = await submit.onRequestPost({
    request: request('https://game-factory.test/api/gen/submit', {
      method: 'POST', cookie: partnerCookie, ip: '203.0.113.32',
      form: submitForm(
        'Use counter bins and make bagging the requested produce the core action',
        new File([referencePng()], 'counter-sketch.png', { type: 'image/png' }),
        freshId,
        improveRequestNonce,
      ),
    }),
    env: partnerEnv,
  });
  parsed = await jsonResponse(response);
  assert(parsed.status === 200 && /^[0-9a-f]{32}$/.test(parsed.body.id) && parsed.body.targetCreationId === freshId, 'image-assisted Improve did not target the existing game');
  const improveId = parsed.body.id;
  assert(improveId !== improveRequestNonce, 'Improve exposed the client nonce as its job id');
  assert(partnerKv.store.get(`iteratelock:${freshId}`) === improveId, 'Improve did not hold the base-game lock');
  response = await queueApi.onRequestGet({
    request: new Request('https://game-factory.test/api/admin/gen-queue?limit=5&lane=trusted-codex', { headers: { 'x-relay-token': RELAY_TOKEN } }),
    env: partnerEnv,
  });
  parsed = await jsonResponse(response);
  const improveQueueJob = parsed.body.jobs.find(item => item.id === improveId);
  assert(improveQueueJob && improveQueueJob.iterate === true && improveQueueJob.hasReferenceImage === true, 'relay queue lost Improve image/base mode');
  assert(improveQueueJob.creationId === freshId, 'relay queue hashed the iteration job id instead of the persistent creation id');
  assert(improveQueueJob.runtimeLevelPayload && improveQueueJob.runtimeLevelPayload.levels[0].name === 'Saved Market Layout', 'relay queue did not attach preserved creator levels');
  assert(/Fresh Market Flow/.test(improveQueueJob.baseHtml || ''), 'relay queue did not attach current base HTML to Improve');
  assert((await postResultFor(improveId, { status: 'building' })).status === 200, 'image-assisted Improve could not be claimed');
  const improvedHtml = validGameHtml('Improved Counter Bagging');
  response = await postResultFor(improveId, {
    status: 'ready', html: improvedHtml, title: 'Ignored New Title', quality: 'ok',
    qaReceipt: qaReceiptFor(improvedHtml, freshId, improveQueueJob.runtimeLevelPayload),
  });
  parsed = await jsonResponse(response);
  assert(parsed.status === 200 && parsed.body.status === 'ready' && parsed.body.playUrl === `/g/${freshId}`, 'Improve did not preserve the creation id');
  assert(/Improved Counter Bagging/.test(partnerKv.store.get(`genblob:${freshId}`)), 'Improve did not replace the base game HTML');
  assert(!partnerKv.store.has(`iteratelock:${freshId}`), 'successful Improve retained its lock');
  assert(!partnerKv.store.has(`genref:${improveId}`), 'successful Improve retained its reference');
  const improvedUpload = JSON.parse(partnerKv.store.get(`upload:${freshId}`));
  assert(improvedUpload.versionNumber >= 2 && improvedUpload.title === freshUpload.title, 'Improve did not version the same creation');
  const improvedLevels = JSON.parse(partnerKv.store.get(`creation-levels:${freshId}`));
  assert(improvedLevels.source === 'creator-admin' && improvedLevels.levels[0].name === 'Saved Market Layout', 'Improve replaced creator levels after QA tested them');

  // A relay coming back after five days must terminal-fail a stale job at claim
  // time instead of rebuilding forever. Comped expiry still cannot mutate tokens.
  const expiredId = 'dddddddddddddddddddddddddddddddd';
  partnerKv.store.set(`genjob:${expiredId}`, JSON.stringify({
    id: expiredId, uid: TEST_UID, email: TEST_EMAIL, prompt: 'expired test', status: 'pending',
    generatorLane: 'trusted-codex', charge: { kind: 'comped', amount: 0 },
    referenceImage: { mime: 'image/png', sizeBytes: referenceBytes.byteLength },
    ts: Date.now() - 6 * 24 * 60 * 60 * 1000, updatedTs: Date.now() - 6 * 24 * 60 * 60 * 1000,
  }));
  partnerKv.store.set(`genref:${expiredId}`, referencePng());
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
  assert(!partnerKv.store.has(`genref:${expiredId}`), 'five-day expiry retained the private reference image');
  const retainedRefs = JSON.parse(partnerKv.store.get(`genjobs:user:${TEST_UID}`) || '[]');
  assert(retainedRefs.some(item => item.id === expiredId), 'terminal failure did not refresh the owner log index retention');
  assert(partnerKv.store.get(`meta:${partnerCookieUid}`) === partnerMeta, 'comped expiry mutated token balance');

  // Trusted two-pass jobs stop after three failed attempts. This bounds one bad
  // prompt to at most six Sol Max calls instead of the legacy 30-attempt loop.
  const cappedId = 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
  partnerKv.store.set(`genjob:${cappedId}`, JSON.stringify({
    id: cappedId, uid: TEST_UID, email: TEST_EMAIL, prompt: 'retry cap test', status: 'building',
    generatorLane: 'trusted-codex', charge: { kind: 'comped', amount: 0 }, attempts: 2,
    referenceImage: { mime: 'image/png', sizeBytes: referenceBytes.byteLength },
    ts: Date.now(), updatedTs: Date.now(),
  }));
  partnerKv.store.set(`genref:${cappedId}`, referencePng());
  response = await result.onRequestPost({
    request: new Request('https://game-factory.test/api/admin/gen-result', {
      method: 'POST', headers: relayHeaders,
      body: JSON.stringify({ id: cappedId, status: 'requeue', error: 'rate_limited' }),
    }),
    env: partnerEnv,
  });
  parsed = await jsonResponse(response);
  assert(parsed.status === 200 && parsed.body.status === 'failed' && parsed.body.reason === 'max_attempts', 'trusted Studio Max retry cap exceeded three attempts');
  assert(!partnerKv.store.has(`genref:${cappedId}`), 'max-attempt failure retained the private reference image');

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
  const submitJs = fs.readFileSync(path.join(ROOT, 'functions/api/gen/submit.js'), 'utf8');
  const genResultJs = fs.readFileSync(path.join(ROOT, 'functions/api/admin/gen-result.js'), 'utf8');
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
  assert(/<label[^>]+for="vibe-reference-input"/.test(createHtml) && /id="vibe-reference-input"[^>]+type="file"[^>]+accept="image\/png,image\/jpeg,image\/webp"/.test(createHtml), 'reference picker is not a labeled, constrained native file input');
  assert(/id="vibe-reference-input"[^>]+aria-describedby="vibe-reference-help vibe-reference-status"/.test(createHtml), 'reference picker help and errors are not programmatically associated');
  assert(/id="vibe-reference-status"[^>]+aria-live="polite"/.test(createHtml), 'reference validation has no polite live region');
  assert(/id="vibe-reference-remove"[^>]+type="button"/.test(createHtml), 'reference preview has no safe remove action');
  assert(/class="create-reference ph-no-capture"/.test(createHtml), 'private preview is not excluded from session replay');
  assert(/\/posthog-init\?v=private-reference-1/.test(createHtml), 'private replay policy is not cache-busted for rollout');
  assert(/new FormData\(\)[\s\S]+form\.append\('referenceImage'/.test(vibeJs), 'creator UI does not submit the normalized reference as multipart data');
  assert(/if \(partnerAccess\)[\s\S]{0,220}form\.append\('requestId', pendingRequestId\)/.test(vibeJs), 'partner multipart retries are not idempotent');
  assert(/const requestId = partnerAccess \? suppliedRequestId : ''/.test(submitJs), 'paid public submissions inherited non-atomic request-id replay');
  assert(!/window\.prompt\(/.test(vibeJs) && /els\.generate\.textContent = 'Improve game'/.test(vibeJs), 'Improve still bypasses the image-capable composer');
  assert(/saved\.iterateId = iteration\.id[\s\S]+saved\.iterateId[\s\S]+activeIteration/.test(vibeJs), 'Improve target is not restored after reload');
  assert(/onReady\(s, \{ preserveDraft: inspectingRecent \}\)/.test(vibeJs), 'historical job polling can erase an unrelated draft');
  assert(/referenceName\.textContent = 'Reference ready'[\s\S]+referenceDetail\.textContent = ''/.test(vibeJs), 'cleared reference leaves private filename text in the DOM');
  assert(/impContext\.className = 'visually-hidden'/.test(vibeJs) && /aria-describedby', 'vibe-improve-title'/.test(vibeJs), 'Improve controls do not expose their target accessibly');
  assert(/\.create-reference-meta \.create-mini-btn[^\n]+min-height: 40px/.test(styleCss), 'reference remove action has a sub-40px hit target');
  assert(/\.create-label[^\n]+color: var\(--ink-soft\)/.test(styleCss), 'new file label uses low-contrast muted text');
  assert(/async function persistTerminalJob[\s\S]+deleteReferenceImage\(env, jobRec\)/.test(genResultJs), 'terminal reference cleanup is not centralized');

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
