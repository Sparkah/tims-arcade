const DEFAULT_ALLOWED_HOSTS = new Set([
  'game-factory.tech',
  'www.game-factory.tech',
  'gfa-discord.pages.dev',
]);

function isLocalHost(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

function isAllowedDiscordProxy(hostname) {
  return hostname === 'discordsays.com' || hostname.endsWith('.discordsays.com');
}

export function allowedOrigin(request, extraHosts = []) {
  const origin = request.headers.get('Origin');
  if (!origin) return '';
  try {
    const url = new URL(origin);
    const hosts = new Set([...DEFAULT_ALLOWED_HOSTS, ...extraHosts]);
    if (hosts.has(url.hostname) || isLocalHost(url.hostname) || isAllowedDiscordProxy(url.hostname)) {
      return origin;
    }
  } catch {}
  return null;
}

export function corsHeaders(request, extraHeaders = {}) {
  const origin = allowedOrigin(request);
  const headers = {
    vary: 'Origin',
    ...extraHeaders,
  };
  if (origin) headers['access-control-allow-origin'] = origin;
  return headers;
}

export function corsPreflight(request, methods = 'GET,POST,OPTIONS') {
  const origin = allowedOrigin(request);
  if (origin === null) return new Response(null, { status: 403 });
  return new Response(null, {
    status: 204,
    headers: {
      'access-control-allow-origin': origin || '*',
      'access-control-allow-methods': methods,
      'access-control-allow-headers': 'content-type, authorization',
      'access-control-max-age': '86400',
      vary: 'Origin',
    },
  });
}

export function corsForbidden(request) {
  return allowedOrigin(request) === null;
}
