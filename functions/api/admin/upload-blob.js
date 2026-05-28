// GET /api/admin/upload-blob?id=<id>&token=<ADMIN_TOKEN>
// Returns the raw uploaded zip bytes so the local review/publish pipeline can
// fetch a pending bundle over HTTP (binary-safe) against local dev or prod.
// Token-gated; the metadata listing lives in admin/uploads.js.

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token') || request.headers.get('x-admin-token') || '';
  if (!env.ADMIN_TOKEN) return err('admin_token_not_configured', 500);
  if (token !== env.ADMIN_TOKEN) return err('forbidden', 403);

  const id = (url.searchParams.get('id') || '').replace(/[^a-z0-9]/gi, '');
  if (!id) return err('bad_id', 400);

  const kind = url.searchParams.get('kind') === 'cover' ? 'cover' : 'game';
  const buf = await env.VOTES.get(`${kind === 'cover' ? 'uploadcover' : 'uploadblob'}:${id}`, { type: 'arrayBuffer' });
  if (!buf) return err('not_found', 404);

  return new Response(buf, {
    headers: { 'content-type': kind === 'cover' ? 'image/png' : 'application/zip' },
  });
}

function err(msg, status) {
  return new Response(JSON.stringify({ error: msg }), { status, headers: { 'content-type': 'application/json' } });
}
