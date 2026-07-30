import { readPublicCatalogue, unavailableResponse } from './_lib/publicCatalogue.js';
import { buildRss } from './_lib/seoSurface.js';

export async function onRequest({ request, env }) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed\n', {
      status: 405,
      headers: { allow: 'GET, HEAD', 'content-type': 'text/plain; charset=utf-8' },
    });
  }
  try {
    const { publicGames, discoveryUpdatedAt } = await readPublicCatalogue(env);
    const body = request.method === 'HEAD' ? null : buildRss(publicGames, discoveryUpdatedAt);
    return new Response(body, {
      headers: {
        'content-type': 'application/rss+xml; charset=utf-8',
        'cache-control': 'public, max-age=0, must-revalidate',
        'x-content-type-options': 'nosniff',
      },
    });
  } catch (_) {
    return unavailableResponse('text');
  }
}
