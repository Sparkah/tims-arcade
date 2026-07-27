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

export async function onRequest(context) {
  const { request, env } = context;
  const res = await env.ASSETS.fetch(request); // the static index.html

  if (request.method !== 'GET') return res;
  const lang = String(new URL(request.url).searchParams.get('lang') || '')
    .toLowerCase().slice(0, 2);
  if (!LOCALES.has(lang)) return res; // EN / default: untouched

  let html = await res.text();
  const self = `${SITE}/?lang=${lang}`;
  html = html
    .replace(`<link rel="canonical" href="${SITE}/">`,
             `<link rel="canonical" href="${self}">`)
    .replace(`<meta property="og:url" content="${SITE}/">`,
             `<meta property="og:url" content="${self}">`)
    .replace('<html lang="en"',
             `<html lang="${lang}"${RTL.has(lang) ? ' dir="rtl"' : ''}`);

  const headers = new Headers(res.headers);
  headers.set('content-type', 'text/html; charset=utf-8');
  headers.delete('content-length'); // body length changed
  if (!headers.has('cache-control')) headers.set('cache-control', 'public, max-age=300');
  return new Response(html, { status: res.status, statusText: res.statusText, headers });
}
