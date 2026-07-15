// POST /api/admin/gen-result   (auth: X-Relay-Token header == env.GAME_FACTORY_RELAY_TOKEN)
// The vibe-relay posts build outcomes here. Actions via "status":
//   building -> claim a pending job (so a relay restart won't double-build it)
//   heartbeat -> renew a long-running claim without adding a visible log row
//   event    -> persist a sanitized generation/polish/validation/smoke event
//   requeue  -> return a transient failure to the bounded retry queue
//   ready    -> store the generated HTML, mark ready, surface it in the creator's
//               "My games" (reusing the upload: schema), and email the player
//   failed   -> mark failed, refund the EXACT charge ONCE (free gen or 60 tokens), email
// Terminal states are idempotent: a job only ever goes pending -> building ->
// ready|failed, refunds happen exactly once, and duplicate/late posts are no-ops
// (Codex review 2026-06-15). Tim 2026-06-15.

import { json, jsonError } from '../../_lib/response.js';
import { refundTokens } from '../../_lib/meta.js';
import { requireRelay } from '../../_lib/adminAuth.js';
import { makeReadablePassword } from '../../_lib/crypto.js';
import { makeEditorPasswordRecord } from '../../_lib/gameEditorAuth.js';
import { extractEmbeddedLevelSeed, readCreationLevels, seedCreationLevelsFromHtml, shouldPreserveCreationLevels } from '../../_lib/creationLevels.js';
import { appendCreationHistoryEvent, buildFailureSummary, buildResultSummary, makeVersionName } from '../../_lib/creationHistory.js';
import { markJobBuilding, requeueJob, removeJobFromQueue } from '../../_lib/genQueue.js';
import { appendBuildEvent, classifyBuildError } from '../../_lib/genJobLog.js';
import { addUserJob } from '../../_lib/genUserJobs.js';
import { deleteReferenceImage } from '../../_lib/genReferenceImage.js';

const ID_RE = /^[0-9a-z]{8,40}$/;
const BLOB_TTL = 60 * 60 * 24 * 30;   // generated game lives 30 days
const JOB_TTL = 60 * 60 * 24 * 30;
const MAX_HTML = 600 * 1024;          // 600 KB cap for a single-file game
const QUEUE_MAX_MS = 5 * 24 * 60 * 60 * 1000;   // keep retrying for up to 5 days (Tim 2026-06-15)
const MAX_ATTEMPTS = 30;                         // safety cap so a truly-unbuildable prompt can't loop forever
const TRUSTED_CODEX_MAX_ATTEMPTS = 3;             // Studio Max can spend two model calls per attempt
const RELAY_EVENT_STAGES = new Set(['generation', 'polish', 'validation', 'smoke']);
const RELAY_EVENT_STATES = new Set(['started', 'passed', 'failed', 'skipped']);

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
  return {
    type: 'gameFactoryLevels',
    schema: canonical.schema,
    id: String(creationId || '').toLowerCase(),
    levels: canonical.levels,
  };
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value || '')));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

async function qaReceiptError(receipt, html, creationId, runtimeLevelPayload) {
  if (!receipt || receipt.schema !== 'game-factory-runtime-smoke-v3') return 'qa_receipt_required';
  if (receipt.htmlSha256 !== await sha256Hex(html)) return 'qa_receipt_html_mismatch';
  const messageHash = await sha256Hex(JSON.stringify(runtimeLevelMessage(creationId, runtimeLevelPayload)));
  if (receipt.levelMessageSha256 !== messageHash) return 'qa_receipt_levels_mismatch';
  const requiredViewports = {
    mobile: { width:393, height:808, hasTouch:true },
    desktop: { width:1280, height:676, hasTouch:false },
  };
  for (const [name, required] of Object.entries(requiredViewports)) {
    const result = receipt.viewports && receipt.viewports[name];
    if (!result
      || result.boot !== true
      || result.rendered !== true
      || result.levelBridge !== true
      || result.firstAction !== true
      || result.aliveAfterSettle !== true
      || result.width !== required.width
      || result.height !== required.height
      || result.hasTouch !== required.hasTouch) {
      return `qa_receipt_${name}_incomplete`;
    }
  }
  return '';
}

export async function onRequestPost({ request, env }) {
  const guard = await requireRelay(request, env);
  if (guard) return guard;

  let body;
  try { body = await request.json(); } catch { return jsonError('bad_json', 400); }
  const id = String(body.id || '').toLowerCase();
  const status = String(body.status || '');
  if (!ID_RE.test(id)) return jsonError('bad_id', 400);

  const jobRec = await env.VOTES.get(`genjob:${id}`, 'json');
  if (!jobRec) return jsonError('not_found', 404);
  if (!jobRec.id) jobRec.id = id;
  const terminal = jobRec.status === 'ready' || jobRec.status === 'failed';
  // Retry cleanup on duplicate/late terminal calls too. The normal transition
  // deletes through persistTerminalJob below; this closes a transient KV-delete
  // failure without ever exposing the reference to a browser response.
  if (terminal) await deleteReferenceImage(env, jobRec);
  if (terminal && status === 'ready' && jobRec.status === 'ready') {
    try { await appendRequestHistory(env, jobRec.targetCreationId || jobRec.baseId || id, jobRec); } catch (e) { /* best effort */ }
    try { await appendReadyHistory(env, jobRec.targetCreationId || jobRec.baseId || id, jobRec, jobRec.updatedTs || Date.now()); } catch (e) { /* best effort */ }
  } else if (terminal && (status === 'failed' || status === 'requeue') && jobRec.status === 'failed') {
    try { await appendFailedHistory(env, jobRec, jobRec.error, jobRec.updatedTs || Date.now()); } catch (e) { /* best effort */ }
  }

  // Studio Max calls can legitimately outlive the 10-minute stuck threshold.
  // A relay-only heartbeat renews the claim without adding noisy build-log rows.
  if (status === 'heartbeat') {
    if (terminal) return json({ ok: true, status: jobRec.status, noop: true });
    if (jobRec.status !== 'building') return jsonError('not_building', 409);
    jobRec.updatedTs = Date.now();
    await env.VOTES.put(`genjob:${id}`, JSON.stringify(jobRec), { expirationTtl: JOB_TTL });
    try { await markJobBuilding(env, jobRec); } catch (e) { /* next heartbeat/stuck sweep repairs it */ }
    return json({ ok: true, status: 'building', heartbeatAt: jobRec.updatedTs });
  }

  // Optional fine-grained relay events. The server accepts only a small stage /
  // state vocabulary and derives any failure message from a normalized code, so
  // raw model stderr, local paths, prompts, or secrets can never enter KV/client.
  if (status === 'event') {
    if (terminal) return json({ ok: true, status: jobRec.status, noop: true });
    const stage = String(body.stage || '');
    const state = String(body.state || '');
    if (!RELAY_EVENT_STAGES.has(stage) || !RELAY_EVENT_STATES.has(state)) return jsonError('bad_event', 400);
    const failure = state === 'failed' ? classifyBuildError(body.error) : null;
    appendBuildEvent(jobRec, {
      stage,
      state,
      code: failure && failure.code,
      attempt: (jobRec.attempts || 0) + 1,
      ...relayEventTelemetry(body),
    });
    await env.VOTES.put(`genjob:${id}`, JSON.stringify(jobRec), { expirationTtl: JOB_TTL });
    return json({ ok: true, status: jobRec.status, event: { stage, state } });
  }

  if (status === 'building') {
    if (terminal) return json({ ok: true, status: jobRec.status, noop: true });  // don't revert a finished job
    const now = Date.now();
    // Enforce the original five-day promise at claim time too. This closes the
    // crash/offline hole where a stale job could otherwise be reclaimed forever
    // because only caught `requeue` transitions checked its age.
    if (now - (jobRec.ts || now) > QUEUE_MAX_MS) {
      jobRec.status = 'failed';
      jobRec.error = 'expired_after_5d';
      jobRec.attempts = (jobRec.attempts || 0) + 1;
      jobRec.updatedTs = now;
      appendBuildEvent(jobRec, { stage: 'failed', state: 'failed', code: 'expired', attempt: jobRec.attempts, ts: now });
      await persistTerminalJob(env, id, jobRec, JOB_TTL);
      try { await removeJobFromQueue(env, jobRec); } catch (e) { /* best effort */ }
      try { await refundCharge(env, jobRec); } catch (e) { /* best effort */ }
      try { await clearIterLock(env, jobRec); } catch (e) { /* best effort */ }
      try { await appendFailedHistory(env, jobRec, jobRec.error, now); } catch (e) { /* best effort */ }
      try { await emailUser(env, jobRec, null); } catch (e) { /* best effort */ }
      return json({ ok: true, status: 'failed', reason: jobRec.error });
    }
    jobRec.status = 'building';
    jobRec.updatedTs = now;
    jobRec.buildStartedTs = now;
    appendBuildEvent(jobRec, { stage: 'claimed', state: 'passed', attempt: (jobRec.attempts || 0) + 1, ts: jobRec.updatedTs });
    appendBuildEvent(jobRec, { stage: 'generation', state: 'started', attempt: (jobRec.attempts || 0) + 1, ts: jobRec.updatedTs });
    await env.VOTES.put(`genjob:${id}`, JSON.stringify(jobRec), { expirationTtl: JOB_TTL });
    try { await markJobBuilding(env, jobRec); } catch (e) { /* stale pending index is cleaned by gen-queue */ }
    return json({ ok: true, status: 'building' });
  }

  // Transient failure (relay timeout / claude error / bad output): DON'T fail the
  // job -- re-queue it so it retries when the machine is less loaded (Tim 2026-06-15:
  // "should just queue for up to 5 days and fail only if the laptop is offline that
  // long"). Only hard-fail (+refund) once the job is older than QUEUE_MAX_MS or has
  // exhausted MAX_ATTEMPTS. Backoff spaces retries so we don't hammer under load.
  if (status === 'requeue') {
    if (terminal) return json({ ok: true, status: jobRec.status, noop: true });
    const now = Date.now();
    const ageMs = now - (jobRec.ts || now);
    const attempts = (jobRec.attempts || 0) + 1;
    const failure = classifyBuildError(body.error);
    jobRec.error = failure.code;
    appendBuildEvent(jobRec, { stage: failure.stage, state: 'failed', code: failure.code, attempt: attempts, ts: now });
    const maxed = jobRec.generatorLane === 'trusted-codex'
      ? attempts >= TRUSTED_CODEX_MAX_ATTEMPTS
      : attempts > MAX_ATTEMPTS;
    if (ageMs > QUEUE_MAX_MS || maxed) {
      jobRec.status = 'failed';
      jobRec.error = ageMs > QUEUE_MAX_MS ? 'expired_after_5d' : 'max_attempts';
      jobRec.attempts = attempts;
      jobRec.updatedTs = now;
      appendBuildEvent(jobRec, {
        stage: 'failed', state: 'failed',
        code: ageMs > QUEUE_MAX_MS ? 'expired' : 'max_attempts',
        attempt: attempts, ts: now,
      });
      await persistTerminalJob(env, id, jobRec, JOB_TTL);
      try { await removeJobFromQueue(env, jobRec); } catch (e) { /* best effort */ }
      try { await refundCharge(env, jobRec); } catch (e) { /* best effort */ }   // reverse the exact charge, once
      try { await clearIterLock(env, jobRec); } catch (e) { /* best effort */ }
      try { await appendFailedHistory(env, jobRec, jobRec.error, now); } catch (e) { /* best effort */ }
      try { await emailUser(env, jobRec, null); } catch (e) { /* best effort */ }
      return json({ ok: true, status: 'failed', reason: jobRec.error });
    }
    jobRec.status = 'pending';
    jobRec.attempts = attempts;
    jobRec.retryAfter = now + Math.min(attempts * 120, 1800) * 1000;   // 2min..30min backoff
    jobRec.updatedTs = now;
    appendBuildEvent(jobRec, { stage: 'retry', state: 'scheduled', code: failure.code, attempt: attempts, ts: now });
    // Keep the owner-visible failure/retry record for 30 days even though the
    // worker stops retrying after five days.
    await env.VOTES.put(`genjob:${id}`, JSON.stringify(jobRec), { expirationTtl: JOB_TTL });
    await requeueJob(env, jobRec);
    return json({ ok: true, status: 'pending', attempts, retryAfter: jobRec.retryAfter });
  }

  if (status === 'failed') {
    if (terminal) return json({ ok: true, status: jobRec.status, noop: true });  // refund/email already done (or job succeeded)
    const failure = classifyBuildError(body.error);
    jobRec.status = 'failed';
    jobRec.error = failure.code;
    jobRec.updatedTs = Date.now();
    appendBuildEvent(jobRec, { stage: failure.stage, state: 'failed', code: failure.code, attempt: (jobRec.attempts || 0) + 1, ts: jobRec.updatedTs });
    appendBuildEvent(jobRec, { stage: 'failed', state: 'failed', code: failure.code, attempt: (jobRec.attempts || 0) + 1, ts: jobRec.updatedTs });
    await persistTerminalJob(env, id, jobRec, JOB_TTL);
    try { await removeJobFromQueue(env, jobRec); } catch (e) { /* best effort */ }
    try { await refundCharge(env, jobRec); } catch (e) { /* best effort */ }   // reverse the exact charge, once
    try { await clearIterLock(env, jobRec); } catch (e) { /* best effort */ }
    try { await appendFailedHistory(env, jobRec, jobRec.error, jobRec.updatedTs); } catch (e) { /* best effort */ }
    try { await emailUser(env, jobRec, null); } catch (e) { /* best effort */ }
    return json({ ok: true, status: 'failed' });
  }

  if (status === 'ready') {
    if (terminal) return json({ ok: true, status: jobRec.status, noop: true });  // already ready, or failed+refunded -- don't resurrect
    const html = String(body.html || '');
    const attempt = (jobRec.attempts || 0) + 1;
    appendBuildEvent(jobRec, { stage: 'validation', state: 'started', attempt });
    if (html.length < 64) return rejectReadyValidation(env, id, jobRec, 'empty_html', 400, attempt);
    if (html.length > MAX_HTML) return rejectReadyValidation(env, id, jobRec, 'html_too_large', 413, attempt);
    const embeddedLevelPayload = extractEmbeddedLevelSeed(html);
    if (!embeddedLevelPayload) return rejectReadyValidation(env, id, jobRec, 'missing_level_seed', 400, attempt);
    let runtimeLevelPayload = embeddedLevelPayload;
    if (jobRec.baseId) {
      const savedLevelPayload = await readCreationLevels(env, jobRec.baseId);
      if (shouldPreserveCreationLevels(savedLevelPayload)) runtimeLevelPayload = savedLevelPayload;
    }
    const receiptError = await qaReceiptError(body.qaReceipt, html, jobRec.baseId || id, runtimeLevelPayload);
    if (receiptError) return rejectReadyValidation(env, id, jobRec, receiptError, 400, attempt);
    appendBuildEvent(jobRec, { stage: 'validation', state: 'passed', attempt });
    // Cover screenshot (base64 PNG from the relay's quality-smoke). Stored as-is;
    // /api/creation-cover decodes + serves it. Capped so a giant shot can't bust KV.
    const coverB64 = String(body.cover || '');
    const quality = String(body.quality || 'unverified').slice(0, 16);
    const now = Date.now();
    appendBuildEvent(jobRec, {
      stage: 'smoke', state: quality === 'ok' ? 'passed' : 'skipped', attempt, ts: now,
    });

    // ---- In-place UPGRADE: overwrite the base game, keep its slug / link / plays /
    // likes / published state. A FAILED iterate never reaches here, so the original
    // stays intact + its 60 tokens are refunded (Tim 2026-06-17). ----
    if (jobRec.baseId) {
      const baseId = jobRec.baseId;
      const base = await env.VOTES.get(`upload:${baseId}`, 'json');
      if (!base) {
        // Base deleted/expired mid-build: don't orphan the result -- fail + refund once.
        jobRec.status = 'failed'; jobRec.error = 'base_gone'; jobRec.updatedTs = now;
        appendBuildEvent(jobRec, { stage: 'failed', state: 'failed', code: 'base_unavailable', attempt, ts: now });
        await persistTerminalJob(env, id, jobRec, JOB_TTL);
        try { await removeJobFromQueue(env, jobRec); } catch (e) { /* best effort */ }
        try { await refundCharge(env, jobRec); } catch (e) { /* best effort */ }
        await clearIterLock(env, jobRec);
        try { await appendFailedHistory(env, jobRec, jobRec.error, now); } catch (e) { /* best effort */ }
        return json({ ok: true, status: 'failed', reason: 'base_gone' });
      }
      if (base.uid !== jobRec.uid) {
        // Ownership mismatch (anomalous -- submit verified it). Terminal fail + refund,
        // NOT a 403: a 403 is not an accepted ack, so the relay would retry it forever.
        jobRec.status = 'failed'; jobRec.error = 'ownership_mismatch'; jobRec.updatedTs = now;
        appendBuildEvent(jobRec, { stage: 'failed', state: 'failed', code: 'ownership_mismatch', attempt, ts: now });
        await persistTerminalJob(env, id, jobRec, JOB_TTL);
        try { await removeJobFromQueue(env, jobRec); } catch (e) { /* best effort */ }
        try { await refundCharge(env, jobRec); } catch (e) { /* best effort */ }
        await clearIterLock(env, jobRec);
        try { await appendFailedHistory(env, jobRec, jobRec.error, now); } catch (e) { /* best effort */ }
        return json({ ok: true, status: 'failed', reason: 'ownership_mismatch' });
      }

      // genblob:<baseId> is overwritten BEFORE the upload/genjob writes below. A KV
      // failure after this point leaves a VALID (smoke-tested) improved game in place
      // but the job unmarked -> the relay re-applies the change on retry: a benign
      // double-apply, never a lost/garbage original (accepted, Codex 2026-06-17).
      await env.VOTES.put(`genblob:${baseId}`, html, { expirationTtl: BLOB_TTL });   // overwrite + refresh 30-day life
      const levelSeed = await seedCreationLevelsFromHtml(env, baseId, html, { updatedTs: now });
      let hasCover = !!base.hasCover;
      if (coverB64 && coverB64.length < 700 * 1024) {
        try { await env.VOTES.put(`creationcover:${baseId}`, coverB64, { expirationTtl: BLOB_TTL }); hasCover = true; } catch (e) { /* best effort */ }
      }
      let adminPassword = null;
      if (!base.adminPasswordHash) {
        adminPassword = makeReadablePassword();
        base.adminPasswordHash = await makeEditorPasswordRecord(adminPassword);
        base.adminPasswordSetAt = now;
      }
      // Keep slug / title / published / visibility / created-ts / author / uid
      // (stable link + stats);
      // refresh quality + cover + updatedTs.
      const baseVersion = Math.max(1, Math.floor(Number(base.versionNumber) || 1));
      const plannedVersion = Math.floor(Number(jobRec.versionNumber));
      const versionNumber = Math.max(baseVersion + 1, Number.isFinite(plannedVersion) && plannedVersion > 0 ? plannedVersion : 1);
      const versionName = makeVersionName(base.title || base.slug, versionNumber);
      const summary = buildResultSummary({ prompt: jobRec.prompt, html, levelSeed, isUpdate: true });
      base.quality = quality; base.hasCover = hasCover; base.status = 'live'; base.updatedTs = now;
      base.versionNumber = versionNumber; base.versionName = versionName; base.lastUpdateSummary = summary;
      try { await env.VOTES.put(`upload:${baseId}`, JSON.stringify(base), { expirationTtl: BLOB_TTL }); } catch (e) { /* best effort */ }
      try { await env.VOTES.put(`creationslug:${base.slug}`, baseId, { expirationTtl: BLOB_TTL }); } catch (e) { /* best effort */ }

      jobRec.status = 'ready'; jobRec.title = base.title; jobRec.slug = base.slug; jobRec.quality = quality; jobRec.updatedTs = now; jobRec.levelSeed = levelSeed;
      jobRec.targetCreationId = baseId; jobRec.versionNumber = versionNumber; jobRec.versionName = versionName; jobRec.summary = summary;
      appendBuildEvent(jobRec, { stage: 'ready', state: 'ready', attempt, ts: now });
      await persistTerminalJob(env, id, jobRec, BLOB_TTL);
      try { await removeJobFromQueue(env, jobRec); } catch (e) { /* best effort */ }
      await clearIterLock(env, jobRec);
      try { await appendRequestHistory(env, baseId, jobRec); } catch (e) { /* best effort */ }
      try { await appendReadyHistory(env, baseId, jobRec, now); } catch (e) { /* best effort */ }
      try { await emailUser(env, jobRec, `/g/${baseId}`, true, { adminPath: `/creator-admin?id=${baseId}`, adminPassword, versionName, summary }); } catch (e) { /* best effort */ }
      return json({ ok: true, status: 'ready', slug: base.slug, playUrl: `/g/${baseId}`, versionNumber, versionName, summary });
    }

    // ---- Fresh build (new creation) ----
    const title = (String(body.title || jobRec.prompt || 'My Game').trim() || 'My Game').slice(0, 80);
    const slug = `${slugify(title)}-${id.slice(-4)}`;

    await env.VOTES.put(`genblob:${id}`, html, { expirationTtl: BLOB_TTL });
    const levelSeed = await seedCreationLevelsFromHtml(env, id, html, { updatedTs: now });
    const adminPassword = makeReadablePassword();
    const adminPasswordHash = await makeEditorPasswordRecord(adminPassword);
    const plannedVersion = Math.floor(Number(jobRec.versionNumber));
    const versionNumber = Number.isFinite(plannedVersion) && plannedVersion > 0 ? plannedVersion : 1;
    const versionName = makeVersionName(title, versionNumber);
    const summary = buildResultSummary({ prompt: jobRec.prompt, html, levelSeed, isUpdate: false });

    let hasCover = false;
    if (coverB64 && coverB64.length < 700 * 1024) {
      try { await env.VOTES.put(`creationcover:${id}`, coverB64, { expirationTtl: BLOB_TTL }); hasCover = true; } catch (e) { /* best effort */ }
    }

    jobRec.status = 'ready';
    jobRec.title = title;
    jobRec.slug = slug;
    jobRec.quality = quality;
    jobRec.updatedTs = now;
    jobRec.levelSeed = levelSeed;
    jobRec.targetCreationId = id;
    jobRec.versionNumber = versionNumber;
    jobRec.versionName = versionName;
    jobRec.summary = summary;
    appendBuildEvent(jobRec, { stage: 'ready', state: 'ready', attempt, ts: now });
    await persistTerminalJob(env, id, jobRec, BLOB_TTL);
    try { await removeJobFromQueue(env, jobRec); } catch (e) { /* best effort */ }

    // Surface in the creator's "My games" via the existing upload: schema.
    // Studio games are unlisted by default: the opaque link works immediately,
    // while the creator separately opts into public gallery discovery.
    const rec = {
      id, slug, title,
      hook: String(jobRec.prompt || '').slice(0, 200),
      genre: 'vibe',
      author: jobRec.displayName || (jobRec.email || '').split('@')[0] || 'player',
      contact: jobRec.email || '',
      uid: jobRec.uid, email: jobRec.email,
      status: 'live', sandboxUrl: `/g/${id}`, source: 'vibe', ts: jobRec.ts,
      published: false, visibility: 'unlisted', quality, hasCover,
      adminPasswordHash, adminPasswordSetAt: now,
      versionNumber, versionName, lastUpdateSummary: summary,
    };
    try { await env.VOTES.put(`upload:${id}`, JSON.stringify(rec), { expirationTtl: BLOB_TTL }); } catch (e) { /* best effort */ }
    // Server-side "this slug is a creation" index so heartbeat can refuse to accrue
    // prompts for creation plays even if the client omits kind (Codex review 2026-06-15).
    try { await env.VOTES.put(`creationslug:${slug}`, id, { expirationTtl: BLOB_TTL }); } catch (e) { /* best effort */ }

    try { await appendRequestHistory(env, id, jobRec); } catch (e) { /* best effort */ }
    try { await appendReadyHistory(env, id, jobRec, now); } catch (e) { /* best effort */ }
    try { await emailUser(env, jobRec, `/g/${id}`, false, { adminPath: `/creator-admin?id=${id}`, adminPassword, versionName, summary }); } catch (e) { /* best effort */ }
    return json({ ok: true, status: 'ready', slug, playUrl: `/g/${id}`, versionNumber, versionName, summary });
  }

  return jsonError('bad_status', 400);
}

async function rejectReadyValidation(env, id, jobRec, error, status, attempt) {
  const failure = classifyBuildError(error);
  jobRec.error = failure.code;
  appendBuildEvent(jobRec, { stage: 'validation', state: 'failed', code: failure.code, attempt });
  await env.VOTES.put(`genjob:${id}`, JSON.stringify(jobRec), { expirationTtl: JOB_TTL });
  return jsonError(error, status);
}

// Refresh both the job record and its owner index from the terminal timestamp.
// Without the index refresh, a build that exhausts the five-day retry window is
// retained for 30 days but disappears from Recent Builds about five days early.
async function persistTerminalJob(env, id, jobRec, ttl) {
  await env.VOTES.put(`genjob:${id}`, JSON.stringify(jobRec), { expirationTtl: ttl });
  try { await addUserJob(env, jobRec.uid, { id, ts: jobRec.ts || jobRec.updatedTs || Date.now() }); } catch (e) { /* best effort */ }
  await deleteReferenceImage(env, jobRec);
}

// Reverse the exact charge recorded at submit time. Called only on the first
// transition INTO a terminal-failed state (the `terminal` guards make this run
// once), mirroring how submit.js charged: restore the free generation, or refund
// 60 cookie-uid tokens (never touching lifetime). Jobs enqueued before the
// `charge` field existed have none -> nothing to reverse.
async function refundCharge(env, jobRec) {
  const c = jobRec && jobRec.charge;
  if (!c) return;
  if (c.kind === 'free' && c.freeKey) await env.VOTES.delete(c.freeKey);
  else if (c.kind === 'tokens' && c.uid && c.amount > 0) await refundTokens(env, c.uid, c.amount);
}

// Release the per-game improve lock (set in submit.js) when an iterate job goes
// terminal, so the creator can improve that game again. No-op for non-iterate jobs.
async function clearIterLock(env, jobRec) {
  if (jobRec && jobRec.baseId) { try { await env.VOTES.delete(`iteratelock:${jobRec.baseId}`); } catch (e) { /* best effort */ } }
}

async function appendRequestHistory(env, creationId, jobRec) {
  if (!jobRec || !jobRec.prompt) return;
  await appendCreationHistoryEvent(env, creationId, {
    id: `request:${jobRec.id}`,
    role: 'player',
    type: 'request',
    status: 'queued',
    versionNumber: jobRec.versionNumber || 1,
    versionName: jobRec.versionName || makeVersionName(jobRec.title || 'Game', jobRec.versionNumber || 1),
    text: jobRec.prompt,
    summary: '',
    ts: jobRec.ts || Date.now(),
    jobId: jobRec.id,
  });
}

async function appendReadyHistory(env, creationId, jobRec, ts) {
  await appendCreationHistoryEvent(env, creationId, {
    id: `result:${jobRec.id}`,
    role: 'studio',
    type: 'result',
    status: 'ready',
    versionNumber: jobRec.versionNumber || 1,
    versionName: jobRec.versionName || makeVersionName(jobRec.title || 'Game', jobRec.versionNumber || 1),
    text: '',
    summary: jobRec.summary || '',
    ts,
    jobId: jobRec.id,
  });
}

async function appendFailedHistory(env, jobRec, error, ts) {
  const creationId = jobRec && (jobRec.targetCreationId || jobRec.baseId || jobRec.id);
  if (!creationId) return;
  const failureCode = classifyBuildError(error || jobRec.error).code;
  await appendCreationHistoryEvent(env, creationId, {
    id: `failed:${jobRec.id}`,
    role: 'studio',
    type: 'failed',
    status: 'failed',
    versionNumber: jobRec.versionNumber || 1,
    versionName: jobRec.versionName || makeVersionName(jobRec.title || 'Game', jobRec.versionNumber || 1),
    text: '',
    summary: buildFailureSummary(failureCode, { comped: jobRec.charge && jobRec.charge.kind === 'comped' }),
    ts,
    jobId: jobRec.id,
  });
}

function relayEventTelemetry(body) {
  const source = body && typeof body === 'object' ? body : {};
  const out = {};
  const model = String(source.model || '').toLowerCase().replace(/[^a-z0-9_.-]/g, '').slice(0, 48);
  const reasoningEffort = String(source.reasoningEffort || '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 16);
  if (model) out.model = model;
  if (reasoningEffort) out.reasoningEffort = reasoningEffort;
  const pass = Math.floor(Number(source.pass));
  if (Number.isFinite(pass) && pass >= 1 && pass <= 2) out.pass = pass;
  for (const field of ['durationMs', 'inputTokens', 'outputTokens', 'reasoningTokens']) {
    const value = Math.floor(Number(source[field]));
    if (Number.isFinite(value) && value >= 0) out[field] = Math.min(value, Number.MAX_SAFE_INTEGER);
  }
  return out;
}

function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'game';
}

async function emailUser(env, jobRec, playPath, isUpdate, adminInfo = {}) {
  if (!env.RESEND_API_KEY || !jobRec.email) return;
  const origin = 'https://game-factory.tech';
  const ready = !!playPath;
  const versionName = adminInfo.versionName || jobRec.versionName || '';
  const summary = adminInfo.summary || jobRec.summary || '';
  const subject = ready
    ? (isUpdate ? `Your game was updated: ${versionName || jobRec.title || 'new version'}` : 'Your game is ready to play')
    : 'Your game could not be built';
  const link = ready ? origin + playPath : origin + '/create';
  const adminLink = ready && adminInfo.adminPath ? origin + adminInfo.adminPath : '';
  const summaryBlock = ready && summary
    ? `<p><b>${escapeHtml(versionName || 'Latest version')}</b><br>${escapeHtml(summary)}</p>`
    : '';
  const adminBlock = adminLink
    ? `<p><a href="${adminLink}">Open your game admin panel</a></p>` +
      (adminInfo.adminPassword
        ? `<p>Admin password: <code>${escapeHtml(adminInfo.adminPassword)}</code><br><small>Save this password. It lets you edit levels for this game.</small></p>`
        : `<p><small>Your existing game admin password still works.</small></p>`)
    : '';
  const failureBilling = jobRec.charge && jobRec.charge.kind === 'comped'
    ? 'No tokens were charged.'
    : 'Your tokens were refunded.';
  const html = ready
    ? `<p>Your game <b>${escapeHtml(jobRec.title || 'game')}</b> ${isUpdate ? 'was updated and is ready' : 'is ready'}.</p>` +
      summaryBlock + `<p><a href="${link}">Play it now</a></p>${adminBlock}<p>-- game-factory.tech</p>`
    : `<p>Sorry, we could not build your game this time. ${failureBilling}</p>` +
      `<p><a href="${link}">Try again</a></p><p>-- game-factory.tech</p>`;
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: env.RESEND_FROM || "Tim's Game Lab <onboarding@resend.dev>",
      to: [jobRec.email], subject, html,
    }),
  });
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
