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

// Vibe-coder economy tunables (single source of truth -- imported by heartbeat.js
// and gen/quota.js so they can't drift). Tim 2026-06-15.
//   SECONDS_PER_PROMPT: 30 min of ACTIVE play earns 1 generation prompt.
//   PROMPT_BANK_CAP:    accrual stops (and, crucially, the per-flush KV write is
//                       SKIPPED) once a player holds this many prompts -- so the
//                       only signed-in players writing meta per heartbeat are
//                       those actively grinding with an empty balance.
export const SECONDS_PER_PROMPT = 1800;
export const PROMPT_BANK_CAP = 1;

// Unified token economy (Tim 2026-06-16): generation is priced in the SAME
// tokens the player earns by play (1/min), like (+5), and daily login (+10) and
// sees in the pill -- so every earn path feeds one visible goal. Replaces the
// old hidden "prompt" credit (30 min of play = 1 prompt), which is being retired.
// First generation per account stays free (gated per-email in gen/submit.js).
export const GENERATION_COST = 60;

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
    // Vibe-coder economy (Tim 2026-06-15). On meta:<sessionUid> records:
    //   prompts      — spendable game-generation credits
    //   freeGranted  — has the one-time free prompt been given (per email)
    //   playProgress — active seconds banked toward the next earned prompt
    //   lastPlayTs   — last heartbeat ts, for the wall-clock anti-farm cap
    //   displayName  — public creator name shown on published creations
    prompts: 0, freeGranted: false, playProgress: 0, lastPlayTs: 0, displayName: null,
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

// Heartbeat meta update in ONE read-modify-write: credit play tokens AND bank
// `seconds` of active play on `slug` toward the vote gate. Anti-farm (Codex
// 2026-06-16): credit no more than the real wall-clock seconds elapsed since this
// uid's last CREDITED heartbeat, so repeatedly POSTing a big `seconds` cannot mint
// tokens or gate-time faster than time actually passes (the first call, with no
// prior ts, trusts the already-[0,300]-clamped value). We WRITE only when a full
// minute is credited (minutes>0) -- exactly when the old token-only credit wrote --
// so the vote gate adds no new KV writes. `featuredMult` (2x on the featured game)
// scales tokens only; gate time banks REAL seconds, capped at `gateSeconds`. Tim 2026-06-16.
export async function creditPlayAndTokens(env, uid, { slug, seconds = 0, featuredMult = 1, gateSeconds = VOTE_GATE_SECONDS, now } = {}) {
  if (!uid || !seconds || seconds <= 0) return null;
  const m = await readMeta(env, uid);
  const ts = now || Date.now();
  const last = m.lastPlayTs || 0;
  // Credit no more than the real wall-clock seconds since this uid's last CREDITED
  // beat. On the FIRST beat (no prior ts) trust at most one client flush window
  // (<=130s) instead of the full posted value, so a single fresh-cookie POST can't
  // claim 300s and instantly unlock a vote (Codex review 2026-06-16); every later
  // beat clamps to actual elapsed, so rapid re-posts never outrun real time.
  const effective = last
    ? Math.min(seconds, Math.max(0, Math.floor((ts - last) / 1000)))
    : Math.min(seconds, 130);
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

// ── Vibe-coder prompt economy ───────────────────────────────────────────────
// "Prompts" are the currency for player game-generation: 1 free per email, then
// 1 earned per 30 min of ACTIVE play, or buy (placeholder). These operate on the
// SESSION uid's meta record so a cleared anon cookie can't re-mint the free grant
// or the balance. Same documented read-modify-write race as the token helpers —
// acceptable at gallery volume; shard or move to D1 if multi-tab users lose credits.

// One-time free prompt per account. Idempotent: returns true only the first time.
export async function grantFreePrompt(env, uid) {
  if (!uid) return false;
  const m = await readMeta(env, uid);
  if (m.freeGranted) return false;
  m.freeGranted = true;
  m.prompts = (m.prompts || 0) + 1;
  await writeMeta(env, uid, m);
  return true;
}

// Credit `n` prompts (e.g. a purchase or an admin grant). No-op on bad input.
export async function creditPrompts(env, uid, n) {
  if (!uid || !n || n <= 0) return;
  const m = await readMeta(env, uid);
  m.prompts = (m.prompts || 0) + n;
  await writeMeta(env, uid, m);
}

// Spend `n` prompts. Returns true if the balance covered it (and was debited),
// false otherwise — callers gate generation on the boolean.
export async function spendPrompts(env, uid, n = 1) {
  if (!uid || !n || n <= 0) return false;
  const m = await readMeta(env, uid);
  if ((m.prompts || 0) < n) return false;
  m.prompts -= n;
  await writeMeta(env, uid, m);
  return true;
}

// Bank `seconds` of active play toward the next earned prompt, rolling whole
// SECONDS_PER_PROMPT chunks into +1 prompt each. Skips the write entirely once
// the bank is full (prompts >= cap) so it costs only a read in the common case —
// this is the heartbeat write-budget guard. Returns the post-state for callers
// that want to surface progress.
export async function accruePlay(env, uid, seconds, { secondsPerPrompt = SECONDS_PER_PROMPT, cap = PROMPT_BANK_CAP, now = Date.now() } = {}) {
  if (!uid || !seconds || seconds <= 0) return null;
  const m = await readMeta(env, uid);
  if ((m.prompts || 0) >= cap) return { prompts: m.prompts, playProgress: m.playProgress || 0, capped: true };
  // Anti-farm (Codex review 2026-06-15): credit no more than the real wall-clock
  // elapsed since this uid's last heartbeat, so POSTing a large `seconds` value
  // repeatedly cannot mint prompts faster than time actually passes. The first
  // call (no prior ts) trusts the already-clamped value.
  const last = m.lastPlayTs || 0;
  const elapsed = last ? Math.max(0, Math.floor((now - last) / 1000)) : seconds;
  const effective = Math.min(seconds, elapsed);
  m.lastPlayTs = now;
  if (effective > 0) {
    m.playProgress = (m.playProgress || 0) + effective;
    if (m.playProgress >= secondsPerPrompt) {
      const earned = Math.floor(m.playProgress / secondsPerPrompt);
      m.prompts = (m.prompts || 0) + earned;
      m.playProgress -= earned * secondsPerPrompt;
    }
  }
  await writeMeta(env, uid, m);
  return { prompts: m.prompts, playProgress: m.playProgress, capped: false };
}
