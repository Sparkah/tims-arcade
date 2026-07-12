// POST /api/gen/submit  { prompt: string }
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

const MIN_PROMPT = 3;
const MAX_PROMPT = 500;
const JOB_TTL = 60 * 60 * 24 * 30;  // owner-visible build record retention
const DAILY_GEN_CAP = 20;           // successful generations / uid / day
const HOURLY_ATTEMPTS = 60;         // total submit attempts / IP / hour (anti-hammer)

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
  try { body = await request.json(); } catch { return jsonError('bad_json', 400); }
  const rawPrompt = String(body.prompt || '').trim();
  if (rawPrompt.length < MIN_PROMPT) return jsonError('prompt_too_short', 400);

  // Sanitize + block links/contacts/profanity (kid-safe gallery; the prompt is
  // fed to a generator). filterText caps length too.
  const filtered = filterText(rawPrompt, MAX_PROMPT, { phone: false });   // allow big numbers in game ideas
  if (!filtered.ok) return jsonError('prompt_' + (filtered.reason || 'blocked'), 400);
  const prompt = filtered.text;
  // Strong, unguessable id (128-bit) so the private /g/<id> link can't be
  // enumerated (Codex review 2026-06-15). Created before optional lock acquisition
  // so an iterate can reserve its in-flight slot before any token charge.
  const id = crypto.randomUUID().replace(/-/g, '');
  const ts = Date.now();

  // Optional in-place ITERATE: evolve an EXISTING creation instead of building fresh.
  // The change instruction IS `prompt`; iterateId names the game to upgrade. Must be
  // the caller's OWN vibe creation. Checked BEFORE charging so a bad target never
  // costs tokens. (Tim 2026-06-17: "upgrade button ... prompt further and iterate".)
  let baseId = null;
  let baseRec = null;
  const iterateId = String(body.iterateId || '').toLowerCase();
  if (iterateId) {
    if (!/^[0-9a-z]{8,40}$/.test(iterateId)) return jsonError('bad_id', 400);
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
  if (!await checkRate(env, `genrate:${session.uid}:${day}`, DAILY_GEN_CAP, 60 * 60 * 26)) {
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
    // What this job was charged, so a terminal build failure refunds the EXACT
    // charge once (admin/gen-result.js): 60 cookie-uid tokens. cookieUid may be
    // null (no cookie) -> nothing to refund.
    charge,
    ts, updatedTs: ts,
  };
  appendBuildEvent(jobRec, { stage: 'queued', state: 'queued', attempt: 1, ts });
  try {
    await env.VOTES.put(`genjob:${id}`, JSON.stringify(jobRec), { expirationTtl: JOB_TTL });
  } catch (e) {
    if (charge.kind === 'tokens' && cookieUid) await refundTokens(env, cookieUid, GENERATION_COST);   // refund tokens (not lifetime)
    if (lockHeld) await releaseIterLock(env, baseId, id);
    return jsonError('enqueue_failed', 500);
  }
  try {
    await addUserJob(env, session.uid, jobRec);
  } catch (e) {
    try { await env.VOTES.delete(`genjob:${id}`); } catch (_) { /* best effort */ }
    if (charge.kind === 'tokens' && cookieUid) await refundTokens(env, cookieUid, GENERATION_COST);
    if (lockHeld) await releaseIterLock(env, baseId, id);
    return jsonError('enqueue_failed', 500);
  }
  try {
    await addPendingJob(env, jobRec);
  } catch (e) {
    try { await env.VOTES.delete(`genjob:${id}`); } catch (_) { /* best effort */ }
    try { await removeUserJob(env, session.uid, id); } catch (_) { /* best effort */ }
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

  return json({ ok: true, id, status: 'pending', targetCreationId, versionNumber, versionName });
}

async function releaseIterLock(env, baseId, jobId) {
  if (!baseId) return;
  try {
    const key = `iteratelock:${baseId}`;
    const current = await env.VOTES.get(key);
    if (!current || current === jobId) await env.VOTES.delete(key);
  } catch (e) { /* best effort */ }
}
