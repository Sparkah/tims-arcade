const HSTS = 'max-age=31536000';

const APP_CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "script-src 'self' 'unsafe-inline' 'report-sample' https://static.cloudflareinsights.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "media-src 'self' data: blob: https:",
  "connect-src 'self' https://cloudflareinsights.com",
  "frame-src 'self' https:",
  "worker-src 'self' blob:",
  "form-action 'self'",
  "frame-ancestors 'self'",
  'upgrade-insecure-requests',
].join('; ');

// /cplay embeds only the same-origin, access-controlled /g/<id> runtime. Keep
// ordinary Gallery pages' broader iframe policy intact, while preventing a
// hostile generated game from navigating its iframe to an external receiver.
const CPLAY_CSP = APP_CSP.replace("frame-src 'self' https:", "frame-src 'self'");

function isHtml(headers) {
  return (headers.get('content-type') || '').toLowerCase().includes('text/html');
}

function isCspExcluded(pathname) {
  return pathname.startsWith('/games/')
    || pathname.startsWith('/g/')
    || pathname === '/tg'
    || pathname.startsWith('/tg/')
    || pathname.startsWith('/tg-');
}

function shouldApplyCsp(context, headers) {
  if (!context.request || !isHtml(headers) || headers.has('content-security-policy')) return false;
  const pathname = new URL(context.request.url).pathname;
  return !isCspExcluded(pathname);
}

export async function onRequest(context) {
  const response = await context.next();
  const headers = new Headers(response.headers);
  headers.set('Strict-Transport-Security', HSTS);
  if (shouldApplyCsp(context, headers)) {
    const pathname = new URL(context.request.url).pathname;
    const isCplay = pathname === '/cplay' || pathname === '/cplay.html';
    headers.set('Content-Security-Policy', isCplay ? CPLAY_CSP : APP_CSP);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
