// GET /  — homepage.
//
// The homepage is a single static index.html served for every ?lang= (app.js
// swaps title_<lang>/hook_<lang> client-side). Left as-is, /?lang=ru would carry
// canonical=https://game-factory.tech/ (the bare EN URL), so Google/Yandex fold
// the localized homepage into the English one as a duplicate and ignore its
// hreflang — the Russian homepage never ranks on its own. (Codex SEO review,
// 2026-07-27; Google "consolidate duplicate URLs" guidance.)
//
// Fix: for a localized ?lang=, rewrite canonical + og:url to the self URL and
// set <html lang>. The default (English / no lang / unknown lang) is a pure
// pass-through of the static asset — zero behaviour change on the hot path.
// The per-game /p/<slug> pages already do this in functions/p/[slug].js.

const LOCALES = new Set(['ru', 'es', 'pt', 'tr', 'ar']);
const RTL = new Set(['ar']);
const SITE = 'https://game-factory.tech';

import { readPublicCatalogue, unavailableResponse } from './_lib/publicCatalogue.js';
import { injectHomepageSurfaces } from './_lib/seoSurface.js';

export async function onRequest(context) {
  const { request, env } = context;
  const res = await env.ASSETS.fetch(request); // the static index.html

  if (request.method !== 'GET') return res;
  if (!res.ok) return res;

  const lang = String(new URL(request.url).searchParams.get('lang') || '')
    .toLowerCase().slice(0, 2);

  let publicGames;
  try {
    ({ publicGames } = await readPublicCatalogue(env));
  } catch (error) {
    if (error && error.transient === true) {
      // Never serve a stale curated list: a game may have been hidden since a
      // warmed isolate last rendered. Keep the non-catalogue shell available,
      // scrub every discovery block, and let a successful client retry recover.
      return degradedHomepageResponse(res, lang);
    }
    return unavailableResponse('html');
  }

  let html;
  try {
    html = injectHomepageSurfaces(await res.text(), publicGames);
  } catch (_) {
    return unavailableResponse('html');
  }
  html = localizeHomepage(html, lang);

  const headers = new Headers(res.headers);
  headers.set('content-type', 'text/html; charset=utf-8');
  headers.delete('content-length'); // body length changed
  headers.delete('etag');
  headers.set('cache-control', 'public, max-age=0, must-revalidate');
  return new Response(html, { status: res.status, statusText: res.statusText, headers });
}

async function degradedHomepageResponse(res, lang) {
  let html;
  try {
    html = injectHomepageSurfaces(await res.text(), []);
  } catch (_) {
    return unavailableResponse('html');
  }
  html = localizeHomepage(html, lang)
    .replace('<head>', '<head><meta name="robots" content="noindex,follow,noarchive">')
    .replace('<body>', '<body data-catalogue-degraded="true">')
    .replace(
      '<main id="grid" class="grid">',
      '<section id="catalogue-status" class="empty" role="status" aria-live="polite">'
        + '<h2>Catalogue temporarily unavailable</h2>'
        + '<p>The gallery is still here. Its curated game list is retrying now.</p>'
        + '</section><main id="grid" class="grid">',
    );
  const headers = new Headers(res.headers);
  headers.set('content-type', 'text/html; charset=utf-8');
  headers.set('cache-control', 'no-store');
  headers.set('x-robots-tag', 'noindex, follow, noarchive');
  headers.set('x-gallery-catalogue', 'unavailable');
  headers.delete('content-length');
  headers.delete('etag');
  return new Response(html, { status: 200, headers });
}

function localizeHomepage(html, lang) {
  if (!LOCALES.has(lang)) return html;
  const self = `${SITE}/?lang=${lang}`;
  return html
    .replace(`<link rel="canonical" href="${SITE}/">`,
             `<link rel="canonical" href="${self}">`)
    .replace(`<meta property="og:url" content="${SITE}/">`,
             `<meta property="og:url" content="${self}">`)
    .replace('<html lang="en"',
             `<html lang="${lang}"${RTL.has(lang) ? ' dir="rtl"' : ''}`);
}
