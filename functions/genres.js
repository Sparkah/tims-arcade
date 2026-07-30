import { readPublicCatalogue, unavailableResponse } from './_lib/publicCatalogue.js';
import { renderGenreDirectory } from './_lib/genrePages.js';

export async function onRequest({ request, env }) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed\n', {
      status: 405,
      headers: { allow: 'GET, HEAD', 'content-type': 'text/plain; charset=utf-8' },
    });
  }
  try {
    const { publicGames } = await readPublicCatalogue(env);
    const html = renderGenreDirectory(publicGames);
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
