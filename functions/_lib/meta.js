// Shared helpers for the gallery meta-layer (tokens, streaks, lifetime
// leaderboard). Imported by every endpoint that reads or credits
// `meta:<uid>` so we don't have three drifting copies of the same logic.
//
// NOTE on the read-modify-write race: heartbeat / vote / feedback / me-meta
// all do non-atomic updates on the `meta:<uid>` key. Concurrent requests
// for the same uid can lose token credits (typical race window ~50ms).
// Acceptable for a casual gallery with single-tab visitors; if multi-tab
// heavy users start losing visible balance, migrate to per-shard counter
// keys (`meta:<uid>:tokens` as an integer-only counter) and recompose on
// read.

// Unified token economy (Tim 2026-06-16): generation is priced in the SAME
// tokens the player earns by play (1/min), like (+5), and daily login (+10) and
// sees in the pill -- so every earn path feeds one visible goal. Replaces the
// old hidden "prompt" credit (30 min of play = 1 prompt), which is being retired.
// New accounts get SIGNUP_BONUS tokens on first signed-in load (gated per-email),
// which covers their first generation -- so there is no separate "free" path.
export const GENERATION_COST = 60;

// One-time signup bonus, granted on the first signed-in load (per email) and
// credited to the COOKIE-uid balance (the visible/spendable pill balance) so a
// new player can make a game right away. Idempotent per email. Tim 2026-06-16.
export const SIGNUP_BONUS = 60;

// Fairness/anti-farm vote gate (Tim 2026-06-16): a player must accumulate this
// many seconds of ACTIVE play on a game before they may like/dislike it. Active
// seconds are banked per (cookie uid, slug) into meta.played by the heartbeat and
// checked by /api/vote; the play page shows a countdown until rating unlocks.
export const VOTE_GATE_SECONDS = 300;

// Server-enforced gate MINIMUM, a few seconds below VOTE_GATE_SECONDS. The play
// page counts active seconds locally and unlocks rating at VOTE_GATE_SECONDS, but
// the server banks slightly less (per-flush wall-clock floor + network latency,
// ~1s/flush), so it enforces the gate a touch lower to avoid 403-ing a player who
// legitimately reached 5 min locally. The wall-clock clamp still requires real
// elapsed time, so this grace does not help farmers. Tim 2026-06-16.
export const VOTE_GATE_MIN = 285;

export function emptyMeta() {
  return {
    tokens: 0, lifetime: 0, streak: 0, bestStreak: 0, lastLogin: null, unlocked: [],
    // played: { <slug>: activeSeconds } banked by the heartbeat (capped at the
    // vote gate) -- the cookie-uid record's per-game timer for the rating gate.
    played: {},
    // lastPlayTs: last credited heartbeat ts (wall-clock anti-farm clamp).
    // displayName: public creator name shown on published creations.
    lastPlayTs: 0, displayName: null,
  };
}

export async function readMeta(env, uid) {
  if (!uid) return emptyMeta();
  const raw = await env.VOTES.get(`meta:${uid}`, 'json');
  if (!raw) return emptyMeta();
  return Object.assign(emptyMeta(), raw);
}

export async function writeMeta(env, uid, meta) {
  if (!uid) return;
  await env.VOTES.put(`meta:${uid}`, JSON.stringify(meta));
}

// Credit `amount` tokens to a uid. No-op when uid is falsy or amount <= 0.
// Increments both the spendable balance (tokens) and the leaderboard
// score (lifetime).
export async function creditTokens(env, uid, amount) {
  if (!uid || !amount || amount <= 0) return;
  const m = await readMeta(env, uid);
  m.tokens   += amount;
  m.lifetime += amount;
  await writeMeta(env, uid, m);
}

// Spend `n` tokens from a uid's visible balance (the pill / leaderboard
// currency). Returns true if the balance covered it (and was debited), false
// otherwise -- callers gate generation on the boolean. Debits `tokens` ONLY,
// never `lifetime`: lifetime is total-ever-earned (the leaderboard score) and
// must not fall when a player spends. Tim 2026-06-16.
export async function spendTokens(env, uid, n) {
  if (!uid || !n || n <= 0) return false;
  const m = await readMeta(env, uid);
  if ((m.tokens || 0) < n) return false;
  m.tokens -= n;
  await writeMeta(env, uid, m);
  return true;
}

// Refund `n` spendable tokens WITHOUT touching lifetime (the leaderboard score),
// so a spendTokens()+refund round-trip is net-zero on both the balance and the
// leaderboard. Used for generation refunds (daily-cap / enqueue / build failure).
export async function refundTokens(env, uid, n) {
  if (!uid || !n || n <= 0) return;
  const m = await readMeta(env, uid);
  m.tokens += n;
  await writeMeta(env, uid, m);
}

// One-time signup bonus: gated PER EMAIL (sessionUid flag) but credited to the
// COOKIE uid -- the visible/spendable balance the pill shows. Idempotent: grants
// at most once per email, even across cookie resets or repeat sign-ins (the
// per-email flag survives; clearing the cookie just forfeits the credited tokens,
// so it can't be farmed). creditTokens bumps lifetime too, which is intended --
// the bonus counts toward the leaderboard. Returns true only on the grant. Tim 2026-06-16.
export async function grantSignupBonus(env, sessionUid, cookieUid, amount = SIGNUP_BONUS) {
  if (!sessionUid || !cookieUid) return false;
  const flagKey = `bonus60:${sessionUid}`;
  if (await env.VOTES.get(flagKey)) return false;
  // Set the flag BEFORE crediting so the common case is at-most-once. Residual KV
  // race (Codex 2026-06-16): two concurrent first-loads (me/meta + quota) can both
  // read the flag missing and double-grant -- the same non-atomic meta:<uid> race the
  // whole economy already documents; the true fix is a D1 / Durable-Object atomic
  // claim, planned before real traffic. If the credit itself fails, roll the flag
  // back so the bonus isn't permanently lost (a later load retries).
  await env.VOTES.put(flagKey, '1');
  try {
    await creditTokens(env, cookieUid, amount);
  } catch (e) {
    try { await env.VOTES.delete(flagKey); } catch (_) { /* best effort */ }
    return false;
  }
  return true;
}

// Heartbeat meta update in ONE read-modify-write: credit play tokens AND bank
// `seconds` of active play on `slug` toward the vote gate. Anti-farm (Codex
// 2026-06-16): credit no more than the real wall-clock seconds elapsed since this
// uid's last CREDITED heartbeat, so repeatedly POSTing a big `seconds` cannot mint
// tokens or gate-time faster than time actually passes. The FIRST beat for a uid
// stamps lastPlayTs and credits nothing (a fresh cookie can't claim time it never
// spent -- that previously ~halved the vote gate); that baseline stamp is exactly
// ONE extra KV write per new uid (bounded, negligible vs the 1000/day budget).
// Every LATER beat writes only on a full credited minute (minutes>0) -- as the old
// token-only credit did -- so steady-state play adds no new writes. `featuredMult` (2x on the featured game)
// scales tokens only; gate time banks REAL seconds, capped at `gateSeconds`. Tim 2026-06-16.
export async function creditPlayAndTokens(env, uid, { slug, seconds = 0, featuredMult = 1, gateSeconds = VOTE_GATE_SECONDS, now } = {}) {
  if (!uid || !seconds || seconds <= 0) return null;
  const m = await readMeta(env, uid);
  const ts = now || Date.now();
  const last = m.lastPlayTs || 0;
  if (!last) {
    // FIRST observed beat for this uid: establish the baseline timestamp WITHOUT
    // crediting. Trusting the first beat let a fresh cookie claim up to ~130s it
    // never spent, which ~halved the 5-min vote gate (Codex 2026-06-16). Later
    // beats credit only real elapsed, so play/gate time can't outrun the clock.
    m.lastPlayTs = ts;
    await writeMeta(env, uid, m);
    return { tokens: m.tokens, playedSlug: (m.played || {})[slug] || 0 };
  }
  // Credit no more than the real wall-clock seconds since this uid's last credited
  // beat, so rapid re-posts can't mint tokens or gate-time faster than time passes.
  const effective = Math.min(seconds, Math.max(0, Math.floor((ts - last) / 1000)));
  if (effective <= 0) return { tokens: m.tokens, playedSlug: (m.played || {})[slug] || 0 };
  const mult = featuredMult > 0 ? featuredMult : 1;
  const minutes = Math.floor(effective / 60) * mult;

  // Gate-time banking (real seconds, capped). We normally WRITE only when a full
  // minute of tokens lands (write budget), but we MUST also persist a sub-minute
  // flush that CROSSES the vote gate -- otherwise the play page unlocks locally
  // while the server still 403s (the split-session boundary Codex flagged: e.g.
  // 245s banked + a 55s flush). `effective` is wall-clock clamped, so this
  // near-gate write cannot help farmers. Tim 2026-06-16.
  const cur = slug ? ((m.played || {})[slug] || 0) : 0;
  const nextPlayed = (slug && cur < gateSeconds) ? Math.min(gateSeconds, cur + effective) : cur;
  const crossesGate = slug && cur < VOTE_GATE_MIN && nextPlayed >= VOTE_GATE_MIN;

  if (minutes <= 0 && !crossesGate) return { tokens: m.tokens, playedSlug: cur };
  if (minutes > 0) { m.tokens += minutes; m.lifetime += minutes; }
  if (slug && nextPlayed !== cur) { const played = m.played || {}; played[slug] = nextPlayed; m.played = played; }
  m.lastPlayTs = ts;
  await writeMeta(env, uid, m);
  return { tokens: m.tokens, playedSlug: (m.played || {})[slug] || cur };
}

// One-shot grant — credits `amount` only if `dedupKey` hasn't been seen.
// Used by the +5 upvote bonus so a player can't farm a single slug by
// toggling votes. Caller passes the exact dedup key so existing schemas
// stay stable. Returns true if a credit was made.
export async function grantOnce(env, uid, dedupKey, amount, ttlSeconds = 60 * 60 * 24 * 365) {
  if (!uid || !amount || amount <= 0) return false;
  const already = await env.VOTES.get(dedupKey);
  if (already) return false;
  await env.VOTES.put(dedupKey, '1', { expirationTtl: ttlSeconds });
  await creditTokens(env, uid, amount);
  return true;
}

// (The legacy "prompt" generation economy -- grantFreePrompt / creditPrompts /
// spendPrompts / accruePlay + SECONDS_PER_PROMPT / PROMPT_BANK_CAP -- was retired
// 2026-06-16 when generation moved to the unified token economy above. Removed as
// dead code; in-flight pre-migration jobs still refund via gen-result.js.)
