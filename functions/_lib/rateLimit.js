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
