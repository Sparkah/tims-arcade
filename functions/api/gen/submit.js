// POST /api/gen/submit
//   JSON:      { prompt: string, iterateId?: string }
//   multipart: prompt, iterateId?, referenceImage? (trusted partner lane only)
// The player describes a game in one sentence. Requires sign-in (magic-link).
// Normally spends GENERATION_COST tokens (new accounts get a 60-token signup
// bonus). Stable verified UIDs in GAME_FACTORY_COMPED_CREATOR_UIDS use the
// isolated trusted-codex lane without token mutation. Tim's Mac relay posts
// sanitized stage events and results back through /api/admin/gen-result.

import { readSession } from '../_session.js';
import { json, jsonError, sameOriginOk } from '../../_lib/response.js';
import { checkRate } from '../../_lib/rateLimit.js';
import { filterText } from '../../_lib/chatmod.js';
import { parseCookie } from '../../_lib/cookie.js';
import { spendTokens, refundTokens, readMeta, grantSignupBonus, GENERATION_COST } from '../../_lib/meta.js';
import { appendCreationHistoryEvent, makeVersionName } from '../../_lib/creationHistory.js';
import { addPendingJob } from '../../_lib/genQueue.js';
import { isCompedCreatorSession } from '../../_lib/creatorEntitlement.js';
import { appendBuildEvent } from '../../_lib/genJobLog.js';
import { addUserJob, removeUserJob } from '../../_lib/genUserJobs.js';
import {
  deleteReferenceImage,
  MAX_REFERENCE_IMAGE_BYTES,
  storeReferenceImage,
  validateReferenceImage,
} from '../../_lib/genReferenceImage.js';

const MIN_PROMPT = 3;
const MAX_PROMPT = 500;
const JOB_TTL = 60 * 60 * 24 * 30;  // owner-visible build record retention
const DAILY_GEN_CAP = 20;           // successful generations / uid / day
const HOURLY_ATTEMPTS = 60;         // total submit attempts / IP / hour (anti-hammer)
const MAX_MULTIPART_BYTES = MAX_REFERENCE_IMAGE_BYTES + 128 * 1024;

export async function onRequestPost({ request, env }) {
  // CSRF defense-in-depth (on top of the SameSite=Lax session cookie): this is
  // the highest-value mutating endpoint -- it spends a prompt and queues a build.
  if (!sameOriginOk(request)) return jsonError('forbidden', 403);
  const session = await readSession(request, env);
  if (!session || !session.uid) return jsonError('sign_in_required', 401);
  const partnerAccess = await isCompedCreatorSession(session, env);
  // The Codex pilot runs only for explicitly allowlisted trusted accounts. Do
  // not charge or queue ordinary/public users while no isolated public worker
  // exists. Enabling public submission later is an explicit deploy setting.
  if (!partnerAccess && String(env.GAME_FACTORY_PUBLIC_BUILDER_ENABLED || '') !== '1') {
    return jsonError('builder_unavailable', 503);
  }

  // Anti-hammer (counts every attempt, balance or not) so the endpoint can't be
  // pounded; the real per-day generation cap below only counts SUCCESSES, so a
  // string of no_prompts attempts never locks a user out (Codex review 2026-06-15).
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const hour = Math.floor(Date.now() / 3600000);
  if (!await checkRate(env, `gensubip:${ip}:${hour}`, HOURLY_ATTEMPTS, 3600))
    return jsonError('rate_limit', 429);

  let body;
  let referenceFile = null;
  const contentType = String(request.headers.get('content-type') || '').toLowerCase();
  if (contentType.startsWith('multipart/form-data')) {
    const declaredLength = Number(request.headers.get('content-length') || 0);
    if (declaredLength > MAX_MULTIPART_BYTES) return jsonError('image_too_large', 413);
    const multipartBytes = await readRequestBodyCapped(request, MAX_MULTIPART_BYTES);
    if (!multipartBytes) return jsonError('image_too_large', 413);
    let form;
    try {
      form = await new Request(request.url, {
        method: 'POST', headers: request.headers, body: multipartBytes,
      }).formData();
    } catch { return jsonError('bad_form', 400); }
    body = {
      prompt: form.get('prompt'),
      iterateId: form.get('iterateId'),
      requestId: form.get('requestId'),
    };
    const referenceFiles = form.getAll('referenceImage').filter(value => !(typeof value === 'string' && !value));
    if (referenceFiles.length > 1) return jsonError('image_count', 400);
    referenceFile = referenceFiles[0] || null;
  } else {
    try { body = await request.json(); } catch { return jsonError('bad_json', 400); }
  }
  if (!body || typeof body !== 'object') body = {};
  const rawPrompt = String(body.prompt || '').trim();
  if (rawPrompt.length < MIN_PROMPT) return jsonError('prompt_too_short', 400);

  // Sanitize + block links/contacts/profanity (kid-safe gallery; the prompt is
  // fed to a generator). filterText caps length too.
  const filtered = filterText(rawPrompt, MAX_PROMPT, { phone: false });   // allow big numbers in game ideas
  if (!filtered.ok) return jsonError('prompt_' + (filtered.reason || 'blocked'), 400);
  const prompt = filtered.text;

  const suppliedRequestId = String(body.requestId || '').toLowerCase();
  if (suppliedRequestId && !/^[0-9a-f]{32}$/.test(suppliedRequestId)) return jsonError('bad_request_id', 400);
  // KV has no atomic conditional reservation. Keep retry deduplication inside
  // the comped partner pilot, where an overlapping request cannot double-charge
  // a player. Any future paid/public idempotency path must use a strongly
  // consistent reservation (for example a Durable Object) before charging.
  const requestId = partnerAccess ? suppliedRequestId : '';
  const iterateId = String(body.iterateId || '').toLowerCase();
  if (iterateId && !/^[0-9a-z]{8,40}$/.test(iterateId)) return jsonError('bad_id', 400);
  // Reject a public image before any idempotent replay lookup. A reused nonce
  // must never turn a forbidden image-bearing request into a successful text
  // response, even though the image itself would not be stored.
  if (referenceFile && !partnerAccess) return jsonError('image_not_available', 403);
  const id = requestId
    ? await idempotentJobId(env, session.uid, requestId)
    : crypto.randomUUID().replace(/-/g, '');

  // The partner browser keeps one cryptographically random id across an
  // ambiguous network retry. Replaying that id returns the already-accepted
  // owner job, so a lost private multipart response cannot queue/store twice.
  if (requestId) {
    const existing = await env.VOTES.get(`genjob:${id}`, 'json');
    if (existing) {
      if (existing.uid !== session.uid) return jsonError('request_conflict', 409);
      if (String(existing.prompt || '') !== prompt || String(existing.baseId || '') !== iterateId) {
        return jsonError('request_conflict', 409);
      }
      return acceptedJob(existing);
    }
    // Defense against an expired/missing job record or an astronomically
    // unlikely hash collision: never reuse an existing creation namespace.
    const [occupiedUpload, occupiedBlob] = await Promise.all([
      env.VOTES.get(`upload:${id}`),
      env.VOTES.get(`genblob:${id}`),
    ]);
    if (occupiedUpload || occupiedBlob) return jsonError('request_conflict', 409);
  }

  // Image references are deliberately limited to the allowlisted private
  // Studio pilot. Validate every byte before acquiring an iterate lock, charging
  // tokens, incrementing the daily success cap, or writing anything to KV.
  let referenceImage = null;
  if (referenceFile) {
    const checked = await validateReferenceImage(referenceFile);
    if (!checked.ok) return jsonError(checked.error, checked.status);
    referenceImage = checked;
  }
  // Strong, unguessable 128-bit id (random for legacy clients, or a
  // server-secret HMAC of uid+client nonce for idempotent multipart retry).
  const ts = Date.now();

  // Optional in-place ITERATE: evolve an EXISTING creation instead of building fresh.
  // The change instruction IS `prompt`; iterateId names the game to upgrade. Must be
  // the caller's OWN vibe creation. Checked BEFORE charging so a bad target never
  // costs tokens. (Tim 2026-06-17: "upgrade button ... prompt further and iterate".)
  let baseId = null;
  let baseRec = null;
  if (iterateId) {
    const base = await env.VOTES.get(`upload:${iterateId}`, 'json');
    if (!base || base.source !== 'vibe') return jsonError('iterate_not_found', 404);
    if (base.uid !== session.uid) return jsonError('forbidden', 403);
    // One in-flight improvement per game: a second concurrent iterate would carry the
    // same stale base HTML and clobber the first (Codex review 2026-06-17). Released
    // when the job goes terminal in gen-result; the TTL backstops a stuck build.
    if (await env.VOTES.get(`iteratelock:${iterateId}`)) return jsonError('already_improving', 409);
    baseId = iterateId;
    baseRec = base;
  }
  let lockHeld = false;
  if (baseId) {
    try {
      await env.VOTES.put(`iteratelock:${baseId}`, id, { expirationTtl: 7200 });
      const currentLock = await env.VOTES.get(`iteratelock:${baseId}`);
      if (currentLock && currentLock !== id) return jsonError('already_improving', 409);
      lockHeld = true;
    } catch (e) {
      return jsonError('enqueue_failed', 500);
    }
  }

  // Generation normally costs GENERATION_COST tokens from the COOKIE uid balance --
  // the visible/spendable pill balance. New accounts get a 60-token signup bonus on
  // their first signed-in load (grantSignupBonus), which covers the first game, so
  // there is no separate "free" path. Accepted-risk: KV has no compare-and-set, so
  // two concurrent submits for one balance can race a double-spend -- the same
  // documented meta:<uid> read-modify-write race, bounded by the 20/day cap + the IP
  // rate limit above. Tim 2026-06-16.
  const cookieUid = parseCookie(request.headers.get('Cookie') || '', 'uid');
  const sessionMeta = await readMeta(env, session.uid);   // for displayName
  // Ensure a newly-signed-in account has its one-time signup bonus BEFORE spending,
  // so a direct / stale-tab / API submit (that never hit /quota or /me/meta first)
  // isn't wrongly rejected with need_tokens (Codex 2026-06-16). Idempotent per email.
  // Best-effort like the quota/me-meta call sites: a KV hiccup in the grant must not
  // 500 the submit -- spendTokens below still gates the actual charge.
  if (!partnerAccess) {
    try { await grantSignupBonus(env, session.uid, cookieUid); } catch (e) { /* never block submit */ }
  }
  const paid = partnerAccess || (cookieUid && await spendTokens(env, cookieUid, GENERATION_COST));
  if (!paid) {
    if (lockHeld) await releaseIterLock(env, baseId, id);
    return jsonError('need_tokens', 402);
  }

  // Daily cap counts only accepted generations -- so it never burns on rejects.
  const day = new Date().toISOString().slice(0, 10);
  const dailyRateKey = `genrate:${session.uid}:${day}`;
  const dailyRateTtl = 60 * 60 * 26;
  if (!await checkRate(env, dailyRateKey, DAILY_GEN_CAP, dailyRateTtl)) {
    if (!partnerAccess && cookieUid) await refundTokens(env, cookieUid, GENERATION_COST);   // refund tokens (not lifetime)
    if (lockHeld) await releaseIterLock(env, baseId, id);
    return jsonError('daily_limit_reached', 429);
  }

  const displayName = sessionMeta.displayName || (session.email || '').split('@')[0] || 'player';
  const targetCreationId = baseId || id;
  const currentVersion = Math.max(1, Math.floor(Number(baseRec && baseRec.versionNumber) || 1));
  const versionNumber = baseId ? currentVersion + 1 : 1;
  const versionName = makeVersionName(baseRec && (baseRec.title || baseRec.slug), versionNumber);
  const charge = partnerAccess
    ? { kind: 'comped', amount: 0 }
    : { kind: 'tokens', uid: cookieUid, amount: GENERATION_COST };
  const jobRec = {
    id, uid: session.uid, email: session.email, prompt, displayName,
    status: 'pending', slug: null, title: null, error: null,
    baseId,   // non-null => in-place upgrade of that creation (gen-result overwrites it)
    targetCreationId, versionNumber, versionName,
    generatorLane: partnerAccess ? 'trusted-codex' : 'public',
    // Safe metadata only. The pixels live separately at genref:<job id>, never
    // in a heartbeat-rewritten job record, queue response, history, or log.
    referenceImage: referenceImage ? referenceImage.metadata : null,
    clientRequestId: requestId || null,
    // What this job was charged, so a terminal build failure refunds the EXACT
    // charge once (admin/gen-result.js): 60 cookie-uid tokens. cookieUid may be
    // null (no cookie) -> nothing to refund.
    charge,
    ts, updatedTs: ts,
  };
  appendBuildEvent(jobRec, { stage: 'queued', state: 'queued', attempt: 1, ts });
  if (referenceImage) {
    try {
      await storeReferenceImage(env, id, referenceImage);
    } catch (e) {
      await deleteReferenceImage(env, jobRec);
      await releaseDailyRateSlot(env, dailyRateKey, dailyRateTtl);
      if (charge.kind === 'tokens' && cookieUid) await refundTokens(env, cookieUid, GENERATION_COST);
      if (lockHeld) await releaseIterLock(env, baseId, id);
      return jsonError('enqueue_failed', 500);
    }
  }
  try {
    await env.VOTES.put(`genjob:${id}`, JSON.stringify(jobRec), { expirationTtl: JOB_TTL });
  } catch (e) {
    try { await env.VOTES.delete(`genjob:${id}`); } catch (_) { /* commit-then-error defense */ }
    await deleteReferenceImage(env, jobRec);
    await releaseDailyRateSlot(env, dailyRateKey, dailyRateTtl);
    if (charge.kind === 'tokens' && cookieUid) await refundTokens(env, cookieUid, GENERATION_COST);   // refund tokens (not lifetime)
    if (lockHeld) await releaseIterLock(env, baseId, id);
    return jsonError('enqueue_failed', 500);
  }
  try {
    await addUserJob(env, session.uid, jobRec);
  } catch (e) {
    try { await env.VOTES.delete(`genjob:${id}`); } catch (_) { /* best effort */ }
    try { await removeUserJob(env, session.uid, id); } catch (_) { /* commit-then-error defense */ }
    await deleteReferenceImage(env, jobRec);
    await releaseDailyRateSlot(env, dailyRateKey, dailyRateTtl);
    if (charge.kind === 'tokens' && cookieUid) await refundTokens(env, cookieUid, GENERATION_COST);
    if (lockHeld) await releaseIterLock(env, baseId, id);
    return jsonError('enqueue_failed', 500);
  }
  try {
    await addPendingJob(env, jobRec);
  } catch (e) {
    try { await env.VOTES.delete(`genjob:${id}`); } catch (_) { /* best effort */ }
    try { await removeUserJob(env, session.uid, id); } catch (_) { /* best effort */ }
    await deleteReferenceImage(env, jobRec);
    await releaseDailyRateSlot(env, dailyRateKey, dailyRateTtl);
    if (charge.kind === 'tokens' && cookieUid) await refundTokens(env, cookieUid, GENERATION_COST);
    if (lockHeld) await releaseIterLock(env, baseId, id);
    return jsonError('enqueue_failed', 500);
  }
  try {
    await appendCreationHistoryEvent(env, targetCreationId, {
      id: `request:${id}`,
      role: 'player',
      type: 'request',
      status: 'queued',
      versionNumber,
      versionName,
      text: prompt,
      summary: '',
      ts,
      jobId: id,
    });
  } catch (e) { /* non-fatal: the job is already queued */ }

  return acceptedJob(jobRec);
}

function acceptedJob(jobRec) {
  return json({
    ok: true,
    id: jobRec.id,
    status: jobRec.status || 'pending',
    targetCreationId: jobRec.targetCreationId || jobRec.baseId || jobRec.id,
    versionNumber: jobRec.versionNumber || null,
    versionName: jobRec.versionName || null,
    hasReferenceImage: !!jobRec.referenceImage,
  });
}

async function readRequestBodyCapped(request, maxBytes) {
  if (!request.body || typeof request.body.getReader !== 'function') return new Uint8Array();
  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = value instanceof Uint8Array ? value : new Uint8Array(value || 0);
      total += chunk.byteLength;
      if (total > maxBytes) {
        try { await reader.cancel(); } catch (e) {}
        return null;
      }
      chunks.push(chunk);
    }
  } finally {
    try { reader.releaseLock(); } catch (e) {}
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result;
}

async function idempotentJobId(env, uid, requestId) {
  const secret = String(env.AUTH_SECRET || '');
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const payload = new TextEncoder().encode(`game-factory-gen-v1\0${uid}\0${requestId}`);
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, payload));
  return Array.from(signature.subarray(0, 16), byte => byte.toString(16).padStart(2, '0')).join('');
}

async function releaseIterLock(env, baseId, jobId) {
  if (!baseId) return;
  try {
    const key = `iteratelock:${baseId}`;
    const current = await env.VOTES.get(key);
    if (!current || current === jobId) await env.VOTES.delete(key);
  } catch (e) { /* best effort */ }
}

// checkRate reserves the daily success slot before enqueue. If any enqueue
// stage rolls back, return that reservation so storage faults do not consume a
// player's successful-build allowance. This has the same bounded KV race as
// the existing rate primitive, but fixes the normal serial failure path.
async function releaseDailyRateSlot(env, key, ttl) {
  try {
    const current = parseInt(await env.VOTES.get(key), 10) || 0;
    if (current > 0) await env.VOTES.put(key, String(current - 1), { expirationTtl: ttl });
  } catch (e) { /* best effort */ }
}
