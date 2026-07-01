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

// The Bloodtread Mini App CODE (ES module graph + the wrapper HTML/config) must never serve stale after a
// deploy. CF Pages defaults .js to `max-age=14400` and IGNORES a _headers Cache-Control override for .js, so a
// returning player caches the game modules for hours. The Function layer CAN override the header, so force a
// conditional revalidation (no-cache = 304 when unchanged; cheap, no re-download) on bloodtread's js/html only -
// media keeps the default cache. This removes the need to version every ES import by hand on each deploy.
function isBloodtreadCode(pathname) {
  if (!(pathname.startsWith('/games/bloodtread_mobile/') || pathname.startsWith('/tg-bloodtread/'))) return false;
  return pathname.endsWith('/') || pathname.endsWith('.js') || pathname.endsWith('.mjs') || pathname.endsWith('.html');
}

export async function onRequest(context) {
  const response = await context.next();
  const headers = new Headers(response.headers);
  headers.set('Strict-Transport-Security', HSTS);
  const pathname = context.request ? new URL(context.request.url).pathname : '';
  if (shouldApplyCsp(context, headers)) headers.set('Content-Security-Policy', APP_CSP);
  if (isBloodtreadCode(pathname)) headers.set('Cache-Control', 'no-cache');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
