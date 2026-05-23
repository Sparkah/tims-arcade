// Shared JSON response helpers for the API functions.
//
// `jsonError` is the canonical error envelope ({ error: msg }) that was
// copy-pasted into ~8 endpoints. `json` is the generic body helper that
// comments.js defined locally. Endpoints with a bespoke 429/204 shape
// (heartbeat, click, leaderboard) keep building those inline — these two
// only cover the shapes that were genuinely identical.

export function jsonError(msg, status) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
