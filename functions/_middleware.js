import { onRequest as renderPublicGames } from './games.json.js';

const HSTS = 'max-age=31536000';
const CLOUDFLARE_ANALYTICS_SNIPPET = /<!--\s*Cloudflare (?:Pages|Web) Analytics\s*-->\s*<script\b[^>]*\bsrc=(['"])https:\/\/static\.cloudflareinsights\.com\/beacon\.min\.js(?:[/?][^'"]*)?\1[^>]*>\s*<\/script>\s*<!--\s*(?:End\s+)?Cloudflare (?:Pages|Web) Analytics\s*-->/giu;

export function stripCloudflareAnalytics(html) {
  return html.replace(CLOUDFLARE_ANALYTICS_SNIPPET, '');
}

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

function shouldApplyCsp(context, headers, pathname) {
  if (!context.request || !isHtml(headers) || headers.has('content-security-policy')) return false;
  return !isCspExcluded(pathname);
}

export function normalizeProtectedPathname(value) {
  let pathname = String(value || '');
  try {
    // Decode repeatedly so a double-encoded dot or slash cannot become a
    // different static-asset path after an upstream normalization pass.
    for (let pass = 0; pass < 4; pass += 1) {
      const decoded = decodeURIComponent(pathname);
      if (decoded === pathname) break;
      pathname = decoded;
    }
  } catch (_) {
    return null;
  }
  if (/%[0-9a-f]{2}/i.test(pathname) || /[\u0000-\u001f\u007f]/.test(pathname)) {
    return null;
  }
  pathname = pathname.replace(/\\/g, '/').replace(/\/+/g, '/');
  const segments = [];
  for (const segment of pathname.split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') {
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  return `/${segments.join('/')}`.toLowerCase();
}

function protectedError(status, message) {
  return new Response(`${message}\n`, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'text/plain; charset=utf-8',
      'Strict-Transport-Security': HSTS,
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex, nofollow, noarchive',
    },
  });
}

function withHsts(response) {
  const headers = new Headers(response.headers);
  headers.set('Strict-Transport-Security', HSTS);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export async function onRequest(context) {
  const pathname = context.request ? new URL(context.request.url).pathname : '';
  const normalizedPathname = normalizeProtectedPathname(pathname);
  if (normalizedPathname === null) {
    return protectedError(400, 'Bad request');
  }
  if (normalizedPathname === '/games.source.json') {
    return protectedError(404, 'Not found');
  }
  if (normalizedPathname === '/games.json') {
    return withHsts(await renderPublicGames({
      request: context.request,
      env: context.env,
    }));
  }
  if (
    normalizedPathname === '/migrations'
    || normalizedPathname.startsWith('/migrations/')
  ) {
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
  let body = response.body;
  headers.set('Strict-Transport-Security', HSTS);
  if (
    normalizedPathname === '/dissertation'
    || normalizedPathname.startsWith('/dissertation/')
    || normalizedPathname.startsWith('/api/dissertation/')
  ) {
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
  if (normalizedPathname.startsWith('/api/dissertation/')) {
    headers.set('Cache-Control', 'no-store');
  }
  if (shouldApplyCsp(context, headers, normalizedPathname)) {
    const isCplay = normalizedPathname === '/cplay' || normalizedPathname === '/cplay.html';
    if (normalizedPathname.startsWith('/dissertation/g/')) {
      headers.set('Content-Security-Policy', DISSERTATION_GAME_CSP);
    } else if (
      normalizedPathname === '/dissertation'
      || normalizedPathname.startsWith('/dissertation/')
    ) {
      headers.set('Content-Security-Policy', DISSERTATION_SHELL_CSP);
    } else {
      headers.set('Content-Security-Policy', isCplay ? CPLAY_CSP : APP_CSP);
    }
  }
  if ((normalizedPathname === '/dissertation' || normalizedPathname.startsWith('/dissertation/'))
      && isHtml(headers)) {
    // Pages one-click analytics modifies static HTML before Functions run.
    // Remove only its explicitly marked beacon; no-transform above prevents
    // a second injection later in the edge pipeline.
    body = stripCloudflareAnalytics(await response.text());
    headers.delete('Content-Length');
    headers.delete('ETag');
  }
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
