const HSTS = 'max-age=31536000';

const APP_CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "script-src 'self' 'unsafe-inline' 'report-sample'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "media-src 'self' data: blob: https:",
  "connect-src 'self'",
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

export async function onRequest(context) {
  const response = await context.next();
  const headers = new Headers(response.headers);
  headers.set('Strict-Transport-Security', HSTS);
  if (shouldApplyCsp(context, headers)) headers.set('Content-Security-Policy', APP_CSP);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
