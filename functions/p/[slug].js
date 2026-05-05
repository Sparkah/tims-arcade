// GET /p/<slug>
//
// Per-game share landing page. Renders proper Open Graph + Twitter Card meta
// tags so when the URL is shared on Twitter/Telegram/Slack/Discord/Facebook,
// the link unfurls with the game's title, hook, and thumbnail.
//
// Crawlers see the OG tags. Humans see a brief "loading…" splash then get
// auto-redirected to /play.html?slug=X via meta refresh. The redirect is
// instant on browsers, but we keep it visible for a moment so direct visitors
// understand they're entering the game (and so the URL is screenshotable).
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

  const site  = new URL('/', request.url).origin;
  const title = `${game.title} — Tim's Game Lab`;
  const hook  = game.hook || 'A small browser game from Tim\'s Game Lab.';
  const img   = `${site}/thumbs/${slug}.png`;
  const url   = `${site}/p/${slug}`;
  const playUrl = `/play.html?slug=${encodeURIComponent(slug)}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(hook)}">
<link rel="canonical" href="${url}">

<!-- Open Graph -->
<meta property="og:type" content="website">
<meta property="og:url" content="${url}">
<meta property="og:title" content="${escapeHtml(game.title)}">
<meta property="og:description" content="${escapeHtml(hook)}">
<meta property="og:image" content="${img}">
<meta property="og:image:width" content="1600">
<meta property="og:image:height" content="900">
<meta property="og:site_name" content="Tim's Game Lab">

<!-- Twitter Card -->
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(game.title)}">
<meta name="twitter:description" content="${escapeHtml(hook)}">
<meta name="twitter:image" content="${img}">

<!-- Redirect humans into the game after the meta is parsed -->
<meta http-equiv="refresh" content="0; url=${playUrl}">

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
</style>
</head>
<body>
<div class="wrap">
  <img src="${img}" alt="${escapeHtml(game.title)}">
  <h1>${escapeHtml(game.title)}</h1>
  <p>${escapeHtml(hook)}</p>
  <a class="btn" href="${playUrl}">▶ Play now</a>
  <small>Loading the game… or <a href="/" style="color:#8a8aa0">browse all games</a></small>
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
