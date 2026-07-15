// GET /api/creation-cover?id=<id> -> a player creation's cover (PNG screenshot
// captured by the relay's quality-smoke). Stored base64 at creationcover:<id>.
// Readable through the same opaque unlisted link as /g/<id>. Gallery listing is
// a separate decision; missing, non-Studio, or disabled records fail closed.

import { isPlayableStudioCreation } from '../_lib/creationVisibility.js';

const ID_RE = /^[0-9a-z]{8,40}$/;

export async function onRequestGet({ request, env }) {
  const id = String(new URL(request.url).searchParams.get('id') || '').toLowerCase();
  if (!ID_RE.test(id)) return fail('bad id', 400);

  const rec = await env.VOTES.get(`upload:${id}`, 'json');
  if (!isPlayableStudioCreation(rec)) return fail('not found', 404);

  let b64 = await env.VOTES.get(`creationcover:${id}`);
  if (!b64) return fail('no cover', 404);
  b64 = b64.replace(/^data:image\/\w+;base64,/, '');

  let bytes;
  try { bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0)); }
  catch (e) { return fail('bad cover', 500); }
  // Must be a real PNG (magic bytes) -- never serve arbitrary bytes as an image.
  if (!(bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47)) {
    return fail('not png', 415);
  }

  return new Response(bytes, {
    headers: {
      'content-type': 'image/png',
      'x-content-type-options': 'nosniff',
      // A moderation disable/delete must revoke every creation surface at once.
      'cache-control': 'no-store',
    },
  });
}

function fail(message, status) {
  return new Response(message, {
    status,
    headers: { 'content-type':'text/plain; charset=utf-8', 'cache-control':'no-store' },
  });
}
