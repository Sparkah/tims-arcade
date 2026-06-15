// GET /api/gen/quota
// The signed-in player's generation budget for the creator UI: current prompt
// balance, progress toward the next earned prompt (30 min of active play), and a
// one-time free grant on first check. { signed_in:false } when not logged in so
// the UI can prompt sign-in. Tim 2026-06-15.

import { readSession } from '../_session.js';
import { json } from '../../_lib/response.js';
import { readMeta, grantFreePrompt, SECONDS_PER_PROMPT } from '../../_lib/meta.js';

export async function onRequestGet({ request, env }) {
  const session = await readSession(request, env);
  if (!session || !session.uid) {
    return nostore(json({ signed_in: false, prompts: 0, secondsPerPrompt: SECONDS_PER_PROMPT }));
  }

  // First check of a new account grants the free prompt (idempotent).
  await grantFreePrompt(env, session.uid);
  const m = await readMeta(env, session.uid);
  const prompts = m.prompts || 0;
  const playProgress = m.playProgress || 0;

  return nostore(json({
    signed_in: true,
    email: session.email,
    prompts,
    playProgress,
    secondsPerPrompt: SECONDS_PER_PROMPT,
    secondsToNext: prompts > 0 ? 0 : Math.max(0, SECONDS_PER_PROMPT - playProgress),
    displayName: m.displayName || (session.email || '').split('@')[0] || 'player',
  }));
}

function nostore(r) { r.headers.set('cache-control', 'no-store'); return r; }
