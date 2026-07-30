// GET /api/hidden
// Slugs curated OUT of the public gallery grid (admin "hide" / low-quality).
// Public + lightweight: useful to operators and verification tooling. Browser
// discovery reads the already-filtered /games.json route instead of duplicating
// this D1 request.
//
// Source of truth: per-slug rows in the GALLERY_DB D1 binding. Toggled by
// /api/admin/hidden.
//
//   { hidden: ["slug", ...], count: N }

import { readHiddenState, unavailableResponse } from '../_lib/publicCatalogue.js';

export async function onRequestGet({ env }) {
  try {
    const { hidden } = await readHiddenState(env);
    return new Response(JSON.stringify({ hidden, count: hidden.length }), {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'public, max-age=0, must-revalidate',
        'x-gallery-curation': 'd1-v1',
      },
    });
  } catch (_) {
    return unavailableResponse('json');
  }
}
