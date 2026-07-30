// The canonical authoring manifest contains hidden and unpublished entries.
// Admins can read it through the authenticated /api/admin/catalogue endpoint;
// it must never fall through to the public static asset.
export async function onRequest() {
  return new Response('Not found\n', {
    status: 404,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'x-robots-tag': 'noindex, nofollow, noarchive',
    },
  });
}
