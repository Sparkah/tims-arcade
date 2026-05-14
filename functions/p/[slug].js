// GET /p/<slug>
//
// Per-game share + landing page. Renders proper Open Graph + Twitter Card
// meta tags so when the URL is shared on Twitter/Telegram/Slack/Discord/
// Facebook, the link unfurls with the game's title, hook, and thumbnail.
//
// Visitors see a card with cover + title + hook + a Play button that takes
// them to /play.html?slug=X. We previously meta-refreshed straight into the
// game, but that made Google index it as "Page with redirect" and skip the
// /p/<slug> URLs entirely — defeating the sitemap. One extra click is fine.
//
// Why a Pages Function and not a static file:
//   The OG image and description must reflect the specific game. Generating
//   one HTML per game at sync time would also work, but a function lets us
//   reuse the same code for new games without a build step.

export async function onRequest({ params, env, request }) {
  const slug = String(params.slug || '').replace(/[^a-z0-9_-]/gi, '');
  if (!slug) return new Response('not found', { status: 404 });

  // Fetch games.json from the same deployment via ASSETS binding (works
  // regardless of which preview/production we're on).
  const gamesUrl = new URL('/games.json', request.url);
  let games = [];
  try {
    const r = await fetch(gamesUrl);
    if (r.ok) games = await r.json();
  } catch (e) { /* fall through to 404 */ }

  const game = games.find(g => g.slug === slug);
  if (!game) {
    return new Response(
      `<!DOCTYPE html><meta charset="utf-8"><title>Not found</title>
       <p>Game "${escapeHtml(slug)}" not found. <a href="/">Back to gallery →</a></p>`,
      { status: 404, headers: { 'content-type': 'text/html; charset=utf-8' } }
    );
  }

  // Pick language from Accept-Language; ru-* gets Russian copy, else English.
  // Yandex's crawlers honour Accept-Language so this gives clean per-language
  // OG meta when shared in Russian / English contexts.
  const acceptLang = (request.headers.get('Accept-Language') || '').toLowerCase();
  const lang = acceptLang.split(',')[0].startsWith('ru') ? 'ru' : 'en';

  const site  = new URL('/', request.url).origin;
  const titleEn = game.title;
  const titleRu = game.title_ru || game.title;
  const hookEn  = game.hook || 'A small browser game from Tim\'s Game Lab.';
  const hookRu  = game.hook_ru || game.hook || 'Маленькая браузерная игра.';

  const ogTitle = lang === 'ru' ? titleRu : titleEn;
  const ogHook  = lang === 'ru' ? hookRu : hookEn;
  const pageTitle = `${ogTitle} — Tim's Game Lab`;

  const img   = `${site}/thumbs/${slug}.png`;
  const url   = `${site}/p/${slug}`;
  const playUrl = `/play.html?slug=${encodeURIComponent(slug)}`;

  const html = `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(pageTitle)}</title>
<meta name="description" content="${escapeHtml(ogHook)}">
<link rel="canonical" href="${url}">
<link rel="alternate" hreflang="en" href="${url}">
<link rel="alternate" hreflang="ru" href="${url}?lang=ru">
<link rel="alternate" hreflang="x-default" href="${url}">

<!-- Open Graph (language-aware) -->
<meta property="og:type" content="website">
<meta property="og:url" content="${url}">
<meta property="og:title" content="${escapeHtml(ogTitle)}">
<meta property="og:description" content="${escapeHtml(ogHook)}">
<meta property="og:image" content="${img}">
<meta property="og:image:width" content="1600">
<meta property="og:image:height" content="900">
<meta property="og:site_name" content="Tim's Game Lab">
<meta property="og:locale" content="${lang === 'ru' ? 'ru_RU' : 'en_US'}">
<meta property="og:locale:alternate" content="${lang === 'ru' ? 'en_US' : 'ru_RU'}">

<!-- Twitter Card -->
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(ogTitle)}">
<meta name="twitter:description" content="${escapeHtml(ogHook)}">
<meta name="twitter:image" content="${img}">

<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html,body{background:#0a0a14;color:#e7e7ee;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",Roboto,sans-serif;height:100%;display:flex;align-items:center;justify-content:center;text-align:center}
.wrap{max-width:560px;padding:32px 20px}
img{max-width:100%;border-radius:12px;margin-bottom:18px;box-shadow:0 8px 32px rgba(0,0,0,0.5)}
h1{font-size:24px;margin-bottom:6px;color:#f7f7fa}
p{color:#8a8aa0;font-size:15px;line-height:1.5;margin-bottom:18px}
a.btn{display:inline-block;background:#4dd0e1;color:#0a0a14;padding:10px 22px;border-radius:999px;font-weight:700;text-decoration:none;font-size:15px}
a.btn:hover{filter:brightness(1.1)}
small{display:block;color:#5a5a72;margin-top:24px;font-size:12px}
.alt{margin-top:8px;font-size:13px;color:#6a6a82}
.alt p{font-size:13px;margin-bottom:0}
</style>
</head>
<body>
<div class="wrap">
  <img src="${img}" alt="${escapeHtml(ogTitle)}">
  <h1>${escapeHtml(ogTitle)}</h1>
  <p>${escapeHtml(ogHook)}</p>
  <a class="btn" href="${playUrl}">${lang === 'ru' ? '▶ Играть' : '▶ Play now'}</a>
  <div class="alt">
    <p><strong>${lang === 'ru' ? titleEn : titleRu}</strong></p>
    <p>${escapeHtml(lang === 'ru' ? hookEn : hookRu)}</p>
  </div>
  <small><a href="/" style="color:#8a8aa0">${lang === 'ru' ? '← все игры' : '← browse all games'}</a></small>
</div>
</body>
</html>`;

  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=300',
    },
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
