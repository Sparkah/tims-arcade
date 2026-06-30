// POST /api/funnel
//
// Deprecated: game-level analytics now belong in GameAnalytics only. Keep this
// endpoint as a no-op so cached older game builds can still POST without retrying
// or spending Workers KV writes.

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
  'access-control-max-age': '86400',
  'cache-control': 'no-store',
};

const silent = (status = 204) => new Response(null, { status, headers: CORS });

export function onRequestOptions() {
  return silent(204);
}

export function onRequestPost() {
  return silent(204);
}
