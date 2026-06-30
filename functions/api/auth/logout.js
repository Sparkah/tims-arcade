// POST /api/auth/logout
// Clears the session cookie. Returns 302.

export async function onRequestPost({ request }) {
  const url = new URL(request.url);
  const headers = new Headers({
    'Location': sanitizeReturn(url.searchParams.get('return'), url.origin),
  });
  headers.append('Set-Cookie', `__Host-tgl_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax`);
  headers.append('Set-Cookie', `tgl_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax`);
  return new Response(null, {
    status: 302,
    headers,
  });
}
// GET works too — easier from a plain anchor link
export const onRequestGet = onRequestPost;

function sanitizeReturn(value, origin) {
  const path = String(value || '/');
  if (path.length < 1 || path.length > 200) return `${origin}/`;
  if (path[0] !== '/' || path[1] === '/' || path[1] === '\\') return `${origin}/`;
  if (/[\x00-\x1f\s]/.test(path)) return `${origin}/`;
  return `${origin}${path}`;
}
