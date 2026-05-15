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
  return { tokens: 0, lifetime: 0, streak: 0, bestStreak: 0, lastLogin: null, unlocked: [] };
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
