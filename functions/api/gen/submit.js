// POST /api/gen/submit  { prompt: string }
// The player describes a game in one sentence. Requires sign-in (magic-link).
// Spends 1 prompt (first is free per email; more are earned by 30 min of ACTIVE
// play -- see heartbeat.js -- or "bought" via the placeholder pay button). Enqueues
// an async build job that Tim's Mac relay (Shared/tools/vibe-relay) picks up,
// generates with claude --print, and posts back to /api/admin/gen-result.
// Tim 2026-06-15.

import { readSession } from '../_session.js';
import { json, jsonError, sameOriginOk } from '../../_lib/response.js';
import { checkRate } from '../../_lib/rateLimit.js';
import { filterText } from '../../_lib/chatmod.js';
import { parseCookie } from '../../_lib/cookie.js';
import { spendTokens, refundTokens, readMeta, GENERATION_COST } from '../../_lib/meta.js';

const MIN_PROMPT = 3;
const MAX_PROMPT = 500;
const JOB_TTL = 60 * 60 * 24 * 7;   // 7 days
const DAILY_GEN_CAP = 20;           // successful generations / uid / day
const HOURLY_ATTEMPTS = 60;         // total submit attempts / IP / hour (anti-hammer)

export async function onRequestPost({ request, env }) {
  // CSRF defense-in-depth (on top of the SameSite=Lax session cookie): this is
  // the highest-value mutating endpoint -- it spends a prompt and queues a build.
  if (!sameOriginOk(request)) return jsonError('forbidden', 403);
  const session = await readSession(request, env);
  if (!session || !session.uid) return jsonError('sign_in_required', 401);

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

  // Generation is priced in tokens -- the same balance the player earns by
  // play/like/login and sees in the pill. The FIRST generation per account is
  // free, gated on the SESSION (per-email) so clearing the anon cookie can't
  // re-mint it. Subsequent generations spend GENERATION_COST tokens from the
  // COOKIE uid's balance (where tokens accrue + are displayed). Tim 2026-06-16.
  const cookieUid = parseCookie(request.headers.get('Cookie') || '', 'uid');
  const sessionMeta = await readMeta(env, session.uid);
  const freeKey = `freegen:${session.uid}`;
  // "Free" only if NEITHER the new freegen key NOR the legacy prompt-era
  // freeGranted flag is set, so an account that already used the old free prompt
  // does NOT get a second free generation across the migration (Codex review 2026-06-16).
  const isFree = !sessionMeta.freeGranted && !(await env.VOTES.get(freeKey));
  // Accepted-risk: KV has no atomic compare-and-set, so two concurrent submits for
  // one account can both see freegen missing (double free) or race the same 60-token
  // balance (double spend). Same documented meta:<uid> read-modify-write race the
  // gallery already tolerates; bounded by the 20/day cap + the IP rate limit above.
  if (isFree) {
    await env.VOTES.put(freeKey, '1');          // one-time free generation, claimed
  } else {
    const paid = cookieUid && await spendTokens(env, cookieUid, GENERATION_COST);
    if (!paid) return jsonError('need_tokens', 402);
  }

  // Daily cap counts only accepted generations -- so it never burns on rejects.
  const day = new Date().toISOString().slice(0, 10);
  if (!await checkRate(env, `genrate:${session.uid}:${day}`, DAILY_GEN_CAP, 60 * 60 * 26)) {
    if (isFree) await env.VOTES.delete(freeKey);                             // restore free gen
    else if (cookieUid) await refundTokens(env, cookieUid, GENERATION_COST); // refund tokens (not lifetime)
    return jsonError('daily_limit_reached', 429);
  }

  // Strong, unguessable id (128-bit) so the private /g/<id> link can't be
  // enumerated (Codex review 2026-06-15).
  const id = crypto.randomUUID().replace(/-/g, '');
  const ts = Date.now();
  const displayName = sessionMeta.displayName || (session.email || '').split('@')[0] || 'player';
  const jobRec = {
    id, uid: session.uid, email: session.email, prompt, displayName,
    status: 'pending', slug: null, title: null, error: null,
    // What this job was charged, so a terminal build failure refunds the EXACT
    // charge once (admin/gen-result.js): restore the free generation, or 60
    // cookie-uid tokens. cookieUid may be null (no cookie) -> nothing to refund.
    charge: isFree ? { kind: 'free', freeKey } : { kind: 'tokens', uid: cookieUid, amount: GENERATION_COST },
    ts, updatedTs: ts,
  };
  try {
    await env.VOTES.put(`genjob:${id}`, JSON.stringify(jobRec), { expirationTtl: JOB_TTL });
  } catch (e) {
    if (isFree) await env.VOTES.delete(freeKey);                             // restore free gen
    else if (cookieUid) await refundTokens(env, cookieUid, GENERATION_COST); // refund tokens (not lifetime)
    return jsonError('enqueue_failed', 500);
  }
  // Signal new work so the vibe-relay detects it with a cheap GET (gen-queue
  // ?signal=1, 1 read) instead of a per-poll KV LIST. Without this the relay's
  // 15s poll did a genjob: LIST every time = ~5760 list ops/day, over the free
  // 1000/day cap by itself (2026-06-16). Best-effort; relay also stuck-sweeps.
  try { await env.VOTES.put('genjob:signal', String(ts)); } catch (e) { /* non-fatal */ }

  return json({ ok: true, id, status: 'pending' });
}
