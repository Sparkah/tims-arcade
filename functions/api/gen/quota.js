// GET /api/gen/quota
// The player's generation budget for the creator UI: current TOKEN balance, the
// per-generation cost (GENERATION_COST), whether the one-time free generation is
// still available, and how many more tokens are needed. { signed_in:false } when
// not logged in (generation requires an account) but still reports the cost +
// anon token balance so the UI can show progress and prompt sign-in. Tim 2026-06-16.

import { readSession } from '../_session.js';
import { parseCookie } from '../../_lib/cookie.js';
import { json } from '../../_lib/response.js';
import { readMeta, emptyMeta, GENERATION_COST } from '../../_lib/meta.js';

export async function onRequestGet({ request, env }) {
  const session = await readSession(request, env);
  // Tokens (the spendable balance) live on the anon COOKIE uid -- the same one
  // the pill shows and every earn path feeds. The first-generation-free flag and
  // displayName live on the SESSION (per-email) record. Tim 2026-06-16.
  const cookieUid = parseCookie(request.headers.get('Cookie') || '', 'uid');
  const m = cookieUid ? await readMeta(env, cookieUid) : emptyMeta();   // null-safe + matches vote.js/feedback.js
  const tokens = m.tokens || 0;

  if (!session || !session.uid) {
    // Not signed in: generation needs an account, but report cost + the anon
    // balance so the UI can show progress and prompt sign-in at the right moment.
    return nostore(json({ signed_in: false, tokens, generationCost: GENERATION_COST }));
  }

  const sm = await readMeta(env, session.uid);
  // Match gen/submit.js exactly: free only if NEITHER the new freegen key NOR the
  // legacy prompt-era freeGranted flag is set -- so the UI never shows "first game
  // free" to a legacy user whose generation would then be rejected. Tim 2026-06-16.
  const freeAvailable = !sm.freeGranted && !(await env.VOTES.get(`freegen:${session.uid}`));

  return nostore(json({
    signed_in: true,
    email: session.email,
    tokens,
    generationCost: GENERATION_COST,
    freeAvailable,
    canGenerate: freeAvailable || tokens >= GENERATION_COST,
    tokensToNext: freeAvailable ? 0 : Math.max(0, GENERATION_COST - tokens),
    displayName: sm.displayName || (session.email || '').split('@')[0] || 'player',
  }));
}

function nostore(r) { r.headers.set('cache-control', 'no-store'); return r; }
