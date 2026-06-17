// POST /api/gen/submit  { prompt: string }
// The player describes a game in one sentence. Requires sign-in (magic-link).
// Spends GENERATION_COST tokens (new accounts get a 60-token signup bonus on first
// sign-in that covers the first game; more are earned by play/rate/login). Enqueues
// an async build job that Tim's Mac relay (Shared/tools/vibe-relay) picks up,
// generates with claude --print, and posts back to /api/admin/gen-result.
// Tim 2026-06-16.

import { readSession } from '../_session.js';
import { json, jsonError, sameOriginOk } from '../../_lib/response.js';
import { checkRate } from '../../_lib/rateLimit.js';
import { filterText } from '../../_lib/chatmod.js';
import { parseCookie } from '../../_lib/cookie.js';
import { spendTokens, refundTokens, readMeta, grantSignupBonus, GENERATION_COST } from '../../_lib/meta.js';

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

  // Optional in-place ITERATE: evolve an EXISTING creation instead of building fresh.
  // The change instruction IS `prompt`; iterateId names the game to upgrade. Must be
  // the caller's OWN vibe creation. Checked BEFORE charging so a bad target never
  // costs tokens. (Tim 2026-06-17: "upgrade button ... prompt further and iterate".)
  let baseId = null;
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
  }

  // Generation always costs GENERATION_COST tokens from the COOKIE uid balance --
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
  try { await grantSignupBonus(env, session.uid, cookieUid); } catch (e) { /* never block submit */ }
  const paid = cookieUid && await spendTokens(env, cookieUid, GENERATION_COST);
  if (!paid) return jsonError('need_tokens', 402);

  // Daily cap counts only accepted generations -- so it never burns on rejects.
  const day = new Date().toISOString().slice(0, 10);
  if (!await checkRate(env, `genrate:${session.uid}:${day}`, DAILY_GEN_CAP, 60 * 60 * 26)) {
    if (cookieUid) await refundTokens(env, cookieUid, GENERATION_COST);   // refund tokens (not lifetime)
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
    baseId,   // non-null => in-place upgrade of that creation (gen-result overwrites it)
    // What this job was charged, so a terminal build failure refunds the EXACT
    // charge once (admin/gen-result.js): 60 cookie-uid tokens. cookieUid may be
    // null (no cookie) -> nothing to refund.
    charge: { kind: 'tokens', uid: cookieUid, amount: GENERATION_COST },
    ts, updatedTs: ts,
  };
  try {
    await env.VOTES.put(`genjob:${id}`, JSON.stringify(jobRec), { expirationTtl: JOB_TTL });
  } catch (e) {
    if (cookieUid) await refundTokens(env, cookieUid, GENERATION_COST);   // refund tokens (not lifetime)
    return jsonError('enqueue_failed', 500);
  }
  // Signal new work so the vibe-relay detects it with a cheap GET (gen-queue
  // ?signal=1, 1 read) instead of a per-poll KV LIST. Without this the relay's
  // 15s poll did a genjob: LIST every time = ~5760 list ops/day, over the free
  // 1000/day cap by itself (2026-06-16). Best-effort; relay also stuck-sweeps.
  try { await env.VOTES.put('genjob:signal', String(ts)); } catch (e) { /* non-fatal */ }
  // Hold the per-game improve lock while this iterate is in flight (released on the
  // job's terminal transition in gen-result; 2h TTL backstops a stuck build).
  if (baseId) { try { await env.VOTES.put(`iteratelock:${baseId}`, id, { expirationTtl: 7200 }); } catch (e) { /* non-fatal */ } }

  return json({ ok: true, id, status: 'pending' });
}
