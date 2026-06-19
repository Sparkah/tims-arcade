// GET /g/<id> -- serves a player-generated game (a single self-contained HTML
// document) from genblob:<id>. Locked down for safety:
//   * the CSP `sandbox` directive applies iframe-sandbox semantics to the
//     document ITSELF, so even a DIRECT visit runs with an opaque origin -- no
//     access to game-factory.tech cookies or localStorage (Codex review 2026-06-15);
//   * strict CSP blocks ALL network (connect-src 'none') and every external
//     resource, so an adversarial game can't phone home;
//   * the creator/play UI additionally embeds it in a sandboxed iframe.
//   * the session cookie is HttpOnly regardless.
// Tim 2026-06-15.

import { readSession } from '../api/_session.js';

const ID_RE = /^[0-9a-z]{8,40}$/;

const CSP = [
  // sandbox FIRST: opaque origin + no same-origin powers, applied to this doc.
  "sandbox allow-scripts allow-pointer-lock",
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  "img-src data: blob:",
  "media-src data: blob:",
  "font-src data:",
  "connect-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'self'",
].join('; ');

// All /g/<id> NON-serve responses are no-store + Vary: Sec-Fetch-Dest, so a cached
// iframe response (404 / deny) is never reused for a later top-level request -- that
// must hit the redirect branch instead (Codex review 2026-06-17).
function notFound(msg) {
  return new Response(msg || 'Not found', {
    status: 404,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
      'vary': 'Sec-Fetch-Dest',
    },
  });
}

export async function onRequestGet({ request, env, params }) {
  const id = String((params && params.id) || '').toLowerCase();
  if (!ID_RE.test(id)) return notFound();

  // A DIRECT top-level visit to /g/<id> (a shared / emailed / bookmarked / old link)
  // lands on the bare sandboxed host with no nav -- no way back to the gallery. Send
  // those to the wrapped /cplay player, which embeds this same host in an iframe AND
  // adds a "<- Gallery" bar. Embedded loads (the /cplay + /create-preview iframes) send
  // Sec-Fetch-Dest: iframe and fall through to the raw game; the access control below
  // still gates the iframe's own request. (Tim 2026-06-17: no back button on /g/<id>.)
  if (request.headers.get('sec-fetch-dest') === 'document') {
    return new Response(null, {
      status: 302,
      headers: {
        'location': new URL('/cplay?id=' + id, request.url).toString(),
        'cache-control': 'no-store',
        'vary': 'Sec-Fetch-Dest',
      },
    });
  }

  const html = await env.VOTES.get(`genblob:${id}`);
  if (!html) return notFound('Game not found or expired.');

  // Access control (Codex review 2026-06-15): a published creation is public; an
  // unpublished/private one is owner-only. So unpublish actually revokes the link.
  const rec = await env.VOTES.get(`upload:${id}`, 'json');
  if (!rec) {
    // Access metadata missing (e.g. the upload write failed after the blob landed):
    // default-DENY rather than serve open (Codex 2026-06-16). Fall back to the
    // genjob record so the creator can still reach their own game.
    const job = await env.VOTES.get(`genjob:${id}`, 'json');
    const s = await readSession(request, env);
    if (!job || !s || s.uid !== job.uid) return notFound();
  } else if (!rec.published) {
    const s = await readSession(request, env);
    if (!s || s.uid !== rec.uid) return notFound();
  }

  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'content-security-policy': CSP,
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      // `private` so the edge never caches it -> deleting the KV blob takes a game
      // down within ~5 min (the browser-only window), instead of up to a day.
      'cache-control': 'private, max-age=300',
      // key the cached raw response on Sec-Fetch-Dest so a browser-cached iframe load
      // isn't reused for a top-level visit (which must redirect to /cplay).
      'vary': 'Sec-Fetch-Dest',
    },
  });
}
