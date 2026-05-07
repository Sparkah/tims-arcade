// POST /api/auth/logout
// Clears the session cookie. Returns 204.

export async function onRequestPost({ request }) {
  const url = new URL(request.url);
  return new Response(null, {
    status: 302,
    headers: {
      'Location': url.searchParams.get('return') || `${url.origin}/`,
      'Set-Cookie': `tgl_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax`,
    },
  });
}
// GET works too — easier from a plain anchor link
export const onRequestGet = onRequestPost;
