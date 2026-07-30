import { readPublicCatalogue, unavailableResponse } from '../_lib/publicCatalogue.js';
import { renderGenrePage } from '../_lib/genrePages.js';

export async function onRequest({ request, env, params }) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed\n', {
      status: 405,
      headers: { allow: 'GET, HEAD', 'content-type': 'text/plain; charset=utf-8' },
    });
  }
  try {
    const { publicGames } = await readPublicCatalogue(env);
    const genre = String(params.genre || '').toLowerCase();
    const html = renderGenrePage(publicGames, genre);
    if (!html) {
      return new Response(
        '<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex"><title>Collection not found</title><p>This genre collection is not available. <a href="/genres">Browse genres</a>.</p>',
        {
          status: 404,
          headers: {
            'content-type': 'text/html; charset=utf-8',
            'x-robots-tag': 'noindex, follow',
          },
        },
      );
    }
    return new Response(request.method === 'HEAD' ? null : html, {
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'public, max-age=0, must-revalidate',
      },
    });
  } catch (_) {
    return unavailableResponse('html');
  }
}
