// Shared per-bucket rate limiter over the VOTES KV namespace.
//
// This is the read-check-increment primitive that was copy-pasted across
// vote / play / feedback / feedback-image / heartbeat / click / scores /
// suggest / leaderboard / auth-request. Each of those built the SAME three
// lines (read int, compare to a cap, write back with a TTL) but with a
// different bucket key, cap, and TTL — and a different 429 response.
//
// To preserve every caller's exact behaviour:
//   - the CALLER builds the bucket key, so the bucket shape stays
//     caller-controlled (by IP, by uid, by slug+date, by minute/hour);
//   - the CALLER renders its own 429 (some return JSON, some plain text,
//     some a custom payload).
// checkRate only does the KV round-trip and returns whether the request is
// within budget (recording it when it is).
//
// Returns: true  → within budget (incremented), proceed.
//          false → bucket full, caller should return its 429.
export async function checkRate(env, key, limit, ttlSeconds) {
  const n = parseInt(await env.VOTES.get(key)) || 0;
  if (n >= limit) return false;
  await env.VOTES.put(key, String(n + 1), { expirationTtl: ttlSeconds });
  return true;
}

// Two-window guard for lower-volume endpoints that still accept KV write cost.
// Do not use this on Telegram Mini App save or payment polling endpoints:
// those paths can be called many times per session, and each accepted request
// spends two Workers KV writes.
//
// Buckets live in the same VOTES KV as checkRate. Each window is its own
// rotating key (…:s<second> / …:m<minute>), so the window itself comes from the
// key, not the TTL — which matters because Cloudflare KV enforces a 60s minimum
// expirationTtl (a 1-second TTL would be rejected). The TTL is therefore only
// there to reap stale keys.
//
// Returns true when within budget (both windows recorded), false when either is
// exceeded — the caller renders its own 429, same contract as checkRate.
export async function checkUserRate(env, scope, identity, { perSec = 3, perMin = 30 } = {}) {
  const now = Date.now();
  const secKey = `rl:${scope}:${identity}:s${Math.floor(now / 1000)}`;
  const minKey = `rl:${scope}:${identity}:m${Math.floor(now / 60000)}`;
  if (!await checkRate(env, secKey, perSec, 60)) return false;
  if (!await checkRate(env, minKey, perMin, 120)) return false;
  return true;
}
