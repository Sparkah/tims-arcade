// POST /api/gen/submit  { prompt: string }
// The player describes a game in one sentence. Requires sign-in (magic-link).
// Spends 1 prompt (first is free per email; more are earned by 30 min of ACTIVE
// play -- see heartbeat.js -- or "bought" via the placeholder pay button). Enqueues
// an async build job that Tim's Mac relay (Shared/tools/vibe-relay) picks up,
// generates with claude --print, and posts back to /api/admin/gen-result.
// Tim 2026-06-15.

import { readSession } from '../_session.js';
import { json, jsonError } from '../../_lib/response.js';
import { checkRate } from '../../_lib/rateLimit.js';
import { filterText } from '../../_lib/chatmod.js';
import { grantFreePrompt, spendPrompts, creditPrompts } from '../../_lib/meta.js';

const MIN_PROMPT = 3;
const MAX_PROMPT = 500;
const JOB_TTL = 60 * 60 * 24 * 7;   // 7 days
const DAILY_GEN_CAP = 20;           // successful generations / uid / day
const HOURLY_ATTEMPTS = 60;         // total submit attempts / IP / hour (anti-hammer)

export async function onRequestPost({ request, env }) {
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
  const filtered = filterText(rawPrompt, MAX_PROMPT);
  if (!filtered.ok) return jsonError('prompt_' + (filtered.reason || 'blocked'), 400);
  const prompt = filtered.text;

  // First-ever submit gets the free prompt (idempotent), then spend one.
  await grantFreePrompt(env, session.uid);
  const paid = await spendPrompts(env, session.uid, 1);
  if (!paid) return jsonError('no_prompts', 402);

  // Daily cap counts only paid generations -- so it never burns on no_prompts.
  const day = new Date().toISOString().slice(0, 10);
  if (!await checkRate(env, `genrate:${session.uid}:${day}`, DAILY_GEN_CAP, 60 * 60 * 26)) {
    await creditPrompts(env, session.uid, 1);   // refund -- nothing was enqueued
    return jsonError('daily_limit_reached', 429);
  }

  // Strong, unguessable id (128-bit) so the private /g/<id> link can't be
  // enumerated (Codex review 2026-06-15).
  const id = crypto.randomUUID().replace(/-/g, '');
  const ts = Date.now();
  const jobRec = {
    id, uid: session.uid, email: session.email, prompt,
    status: 'pending', slug: null, title: null, error: null,
    ts, updatedTs: ts,
  };
  try {
    await env.VOTES.put(`genjob:${id}`, JSON.stringify(jobRec), { expirationTtl: JOB_TTL });
  } catch (e) {
    await creditPrompts(env, session.uid, 1);   // refund -- the job wasn't enqueued
    return jsonError('enqueue_failed', 500);
  }

  return json({ ok: true, id, status: 'pending' });
}
