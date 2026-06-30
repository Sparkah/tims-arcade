// POST /api/level-funnel
//
// Deprecated: per-game level drop-off analytics now belong in GameAnalytics
// only. Keep this endpoint as a no-op so stale cached game builds do not retry
// and do not spend Workers KV writes.

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
