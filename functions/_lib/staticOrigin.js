const PROD_ORIGIN = 'https://game-factory.tech';
const PROD_HOSTS = new Set(['game-factory.tech', 'www.game-factory.tech']);

function isPagesPreviewHost(hostname) {
  return hostname.endsWith('.tims-arcade.pages.dev');
}

export function trustedStaticOrigin(request) {
  const url = new URL(request.url);
  const hostname = url.hostname.toLowerCase();
  // Trust boundary: never reflect an arbitrary Host header into server-side
  // fetches. Only production and Cloudflare Pages previews may be used as
  // same-site/static fetch targets.
  // Loopback-looking hosts are deliberately not trusted here: in production
  // request.url is derived from Host, so trusting localhost/127.0.0.1 would
  // leave a Host-header SSRF path.
  if (PROD_HOSTS.has(hostname) || isPagesPreviewHost(hostname)) return `https://${hostname}`;
  return PROD_ORIGIN;
}

export async function fetchSameSite(request, pathname, { cacheTtl = 60 } = {}) {
  const path = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return fetch(`${trustedStaticOrigin(request)}${path}`, { cf: { cacheTtl } });
}

export async function fetchStaticAsset(request, env, pathname, { cacheTtl = 60 } = {}) {
  const path = pathname.startsWith('/') ? pathname : `/${pathname}`;
  if (env && env.ASSETS && typeof env.ASSETS.fetch === 'function') {
    try {
      const response = await env.ASSETS.fetch(new Request(`https://assets.local${path}`));
      if (response && response.ok) return response;
    } catch (_) {
      // Fall through to the allowlisted same-site fetch below.
    }
  }
  return fetchSameSite(request, path, { cacheTtl });
}

export async function readGamesCatalogue(request, env, { cacheTtl = 60 } = {}) {
  const response = await fetchStaticAsset(request, env, '/games.json', { cacheTtl });
  if (!response.ok) return [];
  const json = await response.json();
  return Array.isArray(json) ? json : (json.games || []);
}
