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
  try {
    const hidden = await env.VOTES.get('hidden:set', 'json');
    if (
      !Array.isArray(hidden)
      || hidden.some(slug => typeof slug !== 'string' || !/^[a-z0-9_-]{1,64}$/.test(slug))
      || JSON.stringify(hidden) !== JSON.stringify([...new Set(hidden)].sort())
    ) {
      throw new Error('legacy curation set is malformed');
    }
    return new Response(JSON.stringify({ hidden, count: hidden.length }), {
      headers: {
        'content-type': 'application/json',
        'cache-control': 'public, max-age=30',
        'x-gallery-curation': 'legacy-v2',
      },
    });
  } catch (_) {
    return new Response(JSON.stringify({ error: 'curation_store_unavailable' }), {
      status: 503,
      headers: {
        'content-type': 'application/json',
        'cache-control': 'no-store',
        'x-robots-tag': 'noindex, nofollow, noarchive',
        'x-gallery-curation': 'legacy-v2',
      },
    });
  }
}
