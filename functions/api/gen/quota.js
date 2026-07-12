// GET /api/gen/quota
// The player's generation budget for the creator UI: current TOKEN balance, the
// per-generation cost (GENERATION_COST), whether they can afford one, and how many
// more tokens are needed. Also grants the one-time signup bonus on first signed-in
// load. { signed_in:false } when not logged in (generation requires an account) but
// still reports the cost + anon balance so the UI can prompt sign-in. Tim 2026-06-16.

import { readSession } from '../_session.js';
import { parseCookie } from '../../_lib/cookie.js';
import { json } from '../../_lib/response.js';
import { readMeta, emptyMeta, GENERATION_COST, grantSignupBonus } from '../../_lib/meta.js';
import { isCompedCreatorSession } from '../../_lib/creatorEntitlement.js';

const DAILY_GEN_CAP = 20;

export async function onRequestGet({ request, env }) {
  const session = await readSession(request, env);
  // Tokens (the spendable balance) live on the anon COOKIE uid -- the same one the
  // pill shows and every earn path feeds. displayName lives on the SESSION record.
  const cookieUid = parseCookie(request.headers.get('Cookie') || '', 'uid');

  // First signed-in load grants the one-time 60-token signup bonus to the cookie
  // balance (idempotent per email), BEFORE reading tokens so it's reflected here.
  const partnerAccess = await isCompedCreatorSession(session, env);
  if (session && session.uid && cookieUid && !partnerAccess) {
    try { await grantSignupBonus(env, session.uid, cookieUid); } catch (e) { /* never block quota */ }
  }

  const m = cookieUid ? await readMeta(env, cookieUid) : emptyMeta();   // null-safe + matches vote.js/feedback.js
  const tokens = m.tokens || 0;

  if (!session || !session.uid) {
    // Not signed in: generation needs an account, but report cost + the anon
    // balance so the UI can show progress and prompt sign-in at the right moment.
    return nostore(json({ signed_in: false, partnerAccess: false, tokens, generationCost: GENERATION_COST }));
  }

  const sm = await readMeta(env, session.uid);
  const builderAvailable = partnerAccess || String(env.GAME_FACTORY_PUBLIC_BUILDER_ENABLED || '') === '1';
  return nostore(json({
    signed_in: true,
    uid: session.uid,
    email: session.email,
    partnerAccess,
    builderAvailable,
    billingMode: partnerAccess ? 'comped' : 'tokens',
    tokens,
    // Already-saved economy aggregates (NOT new tracking) for the /create analytics
    // panel: total ever earned + login streak. We do NOT store a per-source breakdown
    // of where tokens came from, so the UI shows the lifetime total + the earn rates.
    lifetime: m.lifetime || 0,
    streak: m.streak || 0,
    bestStreak: m.bestStreak || 0,
    generationCost: GENERATION_COST,
    generationCharge: partnerAccess ? 0 : GENERATION_COST,
    dailyLimit: DAILY_GEN_CAP,
    canGenerate: builderAvailable && (partnerAccess || tokens >= GENERATION_COST),
    tokensToNext: partnerAccess ? 0 : Math.max(0, GENERATION_COST - tokens),
    displayName: sm.displayName || (session.email || '').split('@')[0] || 'player',
  }));
}

function nostore(r) { r.headers.set('cache-control', 'no-store'); return r; }
