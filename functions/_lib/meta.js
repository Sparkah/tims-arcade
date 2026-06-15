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

export function emptyMeta() {
  return {
    tokens: 0, lifetime: 0, streak: 0, bestStreak: 0, lastLogin: null, unlocked: [],
    // Vibe-coder economy (Tim 2026-06-15). On meta:<sessionUid> records:
    //   prompts      — spendable game-generation credits
    //   freeGranted  — has the one-time free prompt been given (per email)
    //   playProgress — active seconds banked toward the next earned prompt
    //   lastPlayTs   — last heartbeat ts, for the wall-clock anti-farm cap
    prompts: 0, freeGranted: false, playProgress: 0, lastPlayTs: 0,
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
export async function accruePlay(env, uid, seconds, { secondsPerPrompt = 1800, cap = 5, now = Date.now() } = {}) {
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
