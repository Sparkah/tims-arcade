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

const DISSERTATION_SHELL_CSP = [
  "default-src 'self'",
  "base-uri 'none'",
  "object-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-src 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join('; ');

// Frozen study games are single-file HTML documents with inline JS/CSS. Their
// iframe sandbox prevents navigation, and this policy removes every external
// network destination while preserving the local instrumentation bridge.
const DISSERTATION_GAME_CSP = [
  "default-src 'none'",
  "base-uri 'none'",
  "object-src 'none'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "media-src 'self' data: blob:",
  "connect-src 'none'",
  "worker-src blob:",
  "form-action 'none'",
  "frame-ancestors 'self'",
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
  const pathname = context.request ? new URL(context.request.url).pathname : '';
  if (pathname === '/migrations' || pathname.startsWith('/migrations/')) {
    return new Response('Not found', {
      status: 404,
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Content-Type-Options': 'nosniff',
        'X-Robots-Tag': 'noindex, nofollow, noarchive',
      },
    });
  }
  const response = await context.next();
  const headers = new Headers(response.headers);
  headers.set('Strict-Transport-Security', HSTS);
  if (pathname === '/dissertation' || pathname.startsWith('/dissertation/')
      || pathname.startsWith('/api/dissertation/')) {
    headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
    headers.set('Referrer-Policy', 'no-referrer');
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
    if (isHtml(headers)) {
      // Cloudflare Web Analytics otherwise rewrites valid HTML to inject its
      // beacon. The study must deliver frozen games byte-for-byte and must not
      // add a second analytics stream.
      headers.set('Cache-Control', 'public, max-age=0, must-revalidate, no-transform');
    }
  }
  if (pathname.startsWith('/api/dissertation/')) {
    headers.set('Cache-Control', 'no-store');
  }
  if (shouldApplyCsp(context, headers)) {
    const isCplay = pathname === '/cplay' || pathname === '/cplay.html';
    if (pathname.startsWith('/dissertation/g/')) {
      headers.set('Content-Security-Policy', DISSERTATION_GAME_CSP);
    } else if (pathname === '/dissertation' || pathname.startsWith('/dissertation/')) {
      headers.set('Content-Security-Policy', DISSERTATION_SHELL_CSP);
    } else {
      headers.set('Content-Security-Policy', isCplay ? CPLAY_CSP : APP_CSP);
    }
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
