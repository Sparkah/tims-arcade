// First-party PostHog reverse-proxy.
//
// Why: privacy browsers + ad-blockers (Brave Shields, uBlock, etc.) block
// requests to PostHog's third-party domains (eu.i.posthog.com), so events from
// those visitors never land and PostHog shows ~0 users — even though the
// gallery's own first-party playtime (heartbeat -> KV) is unaffected. Routing
// PostHog through the gallery's OWN origin makes it first-party, so it isn't
// blocked. posthog-init.js sets api_host to <origin>/ingest, which lands here.
//
//   /ingest/static/*  -> eu-assets.i.posthog.com/static/*  (library assets)
//   /ingest/*         -> eu.i.posthog.com/*                (capture, flags, decide)
//
// Project is on PostHog EU (see functions/api/admin/user-digests.js POSTHOG_HOST).

const API_HOST = 'eu.i.posthog.com';
const ASSETS_HOST = 'eu-assets.i.posthog.com';

export async function onRequest({ request }) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/ingest/, '') || '/';
  const upstreamHost = path.startsWith('/static/') ? ASSETS_HOST : API_HOST;
  const target = `https://${upstreamHost}${path}${url.search}`;

  const headers = new Headers(request.headers);
  headers.delete('host'); // let fetch set the Host for the upstream from `target`
  headers.delete('cookie'); // never forward the gallery's tgl_session auth cookie to PostHog

  const method = request.method;
  const body = method === 'GET' || method === 'HEAD'
    ? undefined
    : await request.arrayBuffer();

  const upstream = await fetch(target, { method, headers, body, redirect: 'manual' });
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: upstream.headers,
  });
}
