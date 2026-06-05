// GET /api/hidden
// Slugs curated OUT of the public gallery grid (admin "hide" / low-quality).
// Public + lightweight: app.js fetches this and filters the catalogue so a
// hidden game stops showing on the homepage. Not sensitive — the slugs are
// already in the public games.json; hiding only removes the card from the UI.
//
// Source of truth: KV key `hidden:set` in the VOTES namespace (same store the
// votes/featured endpoints use). Toggled by /api/admin/hidden.
//
//   { hidden: ["slug", ...], count: N }

export async function onRequestGet({ env }) {
  let hidden = [];
  try {
    hidden = (await env.VOTES.get('hidden:set', 'json')) || [];
    if (!Array.isArray(hidden)) hidden = [];
  } catch (e) {
    hidden = [];
  }
  return new Response(JSON.stringify({ hidden, count: hidden.length }), {
    headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=30' },
  });
}
