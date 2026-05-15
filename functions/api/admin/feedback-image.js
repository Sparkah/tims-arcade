// GET /api/admin/feedback-image?token=<ADMIN_TOKEN>&slug=<slug>&id=<id>
// Returns the binary image attached to a player comment.
//
// Admin-only — players see comments via /api/comments which strips
// imageId (images aren't surfaced in the public comments panel).

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token') || '';
  if (!env.ADMIN_TOKEN || token !== env.ADMIN_TOKEN) {
    return new Response('forbidden', { status: 403 });
  }

  const slug = url.searchParams.get('slug') || '';
  const id   = url.searchParams.get('id') || '';
  if (!/^[a-z0-9_-]{1,40}$/i.test(slug)) return new Response('bad_slug', { status: 400 });
  if (!/^[a-z0-9]{4,32}$/.test(id))      return new Response('bad_id', { status: 400 });

  const raw = await env.VOTES.get(`feedbackimg:${slug}:${id}`);
  if (!raw) return new Response('not_found', { status: 404 });

  let data;
  try { data = JSON.parse(raw); } catch { return new Response('bad_payload', { status: 500 }); }
  if (!data || !data.mime || !data.data) return new Response('bad_payload', { status: 500 });

  const bytes = Uint8Array.from(atob(data.data), c => c.charCodeAt(0));
  return new Response(bytes, {
    status: 200,
    headers: {
      'content-type': data.mime,
      'cache-control': 'private, max-age=3600',
    },
  });
}
