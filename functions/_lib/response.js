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

export function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

// Same-origin guard for POST endpoints (chat, gen/pay). Allows the request when
// there is no Origin header (same-origin navigations often omit it) or the
// Origin's host matches the request host (or localhost for dev). Blocks
// cross-site POSTs, which always carry a foreign Origin. Shared so the two
// callers can't drift (Codex review 2026-06-15).
export function sameOriginOk(request) {
  const origin = request.headers.get('Origin');
  if (!origin) return true;
  try {
    const o = new URL(origin), u = new URL(request.url);
    if (o.host === u.host) return true;
    const devHost = h => h === 'localhost' || h === '127.0.0.1';
    return devHost(o.hostname) && devHost(u.hostname);
  } catch { return false; }
}
