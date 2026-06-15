// GET /api/creation-cover?id=<id> -> a player creation's cover (PNG screenshot
// captured by the relay's quality-smoke). Stored base64 at creationcover:<id>.
// Access-gated like /g/<id>: published creations are public, private ones are
// owner-only (Codex review 2026-06-15). Tim 2026-06-15.

import { readSession } from './_session.js';

const ID_RE = /^[0-9a-z]{8,40}$/;

export async function onRequestGet({ request, env }) {
  const id = String(new URL(request.url).searchParams.get('id') || '').toLowerCase();
  if (!ID_RE.test(id)) return new Response('bad id', { status: 400 });

  const rec = await env.VOTES.get(`upload:${id}`, 'json');
  if (rec && !rec.published) {
    const s = await readSession(request, env);
    if (!s || s.uid !== rec.uid) return new Response('not found', { status: 404 });
  }

  let b64 = await env.VOTES.get(`creationcover:${id}`);
  if (!b64) return new Response('no cover', { status: 404 });
  b64 = b64.replace(/^data:image\/\w+;base64,/, '');

  let bytes;
  try { bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0)); }
  catch (e) { return new Response('bad cover', { status: 500 }); }
  // Must be a real PNG (magic bytes) -- never serve arbitrary bytes as an image.
  if (!(bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47)) {
    return new Response('not png', { status: 415 });
  }

  return new Response(bytes, {
    headers: {
      'content-type': 'image/png',
      'x-content-type-options': 'nosniff',
      'cache-control': 'private, max-age=300',
    },
  });
}
