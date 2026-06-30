const HSTS = 'max-age=31536000';

export async function onRequest(context) {
  const response = await context.next();
  const headers = new Headers(response.headers);
  headers.set('Strict-Transport-Security', HSTS);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
