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
.sg-link{background:none;border:none;color:#8a8aa0;font-size:13px;cursor:pointer;padding:0;margin-top:12px;text-decoration:underline}
.sg-link:hover{color:#e7e7ee}
.sg-modal{position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,0.65);z-index:50;padding:20px}
.sg-modal.on{display:flex}
.sg-panel{background:#161622;border:1px solid #2a2a35;border-radius:10px;max-width:440px;width:100%;padding:18px;text-align:left}
.sg-panel h3{font-size:16px;margin-bottom:6px;color:#f7f7fa}
.sg-panel p{font-size:13px;color:#8a8aa0;margin-bottom:10px;line-height:1.4}
.sg-panel textarea{width:100%;background:#0a0a14;color:#e7e7ee;border:1px solid #2a2a35;border-radius:6px;padding:8px 10px;font:inherit;font-size:14px;resize:vertical;min-height:80px}
.sg-actions{display:flex;justify-content:space-between;align-items:center;margin-top:10px;font-size:12px;color:#5a5a72}
.sg-actions button{background:#4dd0e1;color:#0a0a14;border:none;border-radius:6px;padding:6px 14px;font-weight:700;cursor:pointer;font-size:13px}
.sg-actions button:disabled{opacity:0.4;cursor:not-allowed}
.sg-status{font-size:12px;margin-top:8px;min-height:16px;color:#8a8aa0}
.sg-status.ok{color:#7c7}.sg-status.err{color:#d77}
.sg-close{position:absolute;top:8px;right:12px;background:none;border:none;color:#8a8aa0;font-size:20px;cursor:pointer;line-height:1}
</style>
</head>
<body>
<div class="wrap">
  <img src="${img}" alt="${escapeHtml(ogTitle)}">
  <h1>${escapeHtml(ogTitle)}</h1>
  <p>${escapeHtml(ogHook)}</p>
  <a class="btn" href="${playUrl}">${lang === 'ru' ? '▶ Играть' : '▶ Play now'}</a>
  <small><a href="/" style="color:#8a8aa0">${lang === 'ru' ? '← все игры' : '← browse all games'}</a></small>
  <div><button class="sg-link" id="sg-open" type="button">${lang === 'ru' ? '💡 Предложить игру' : '💡 Suggest a game'}</button></div>
</div>

<div class="sg-modal" id="sg-modal" role="dialog" aria-hidden="true">
  <div class="sg-panel" style="position:relative">
    <button class="sg-close" id="sg-close" aria-label="Close">×</button>
    <h3>${lang === 'ru' ? 'Предложить игру' : 'Suggest a game'}</h3>
    <p>${lang === 'ru'
      ? 'Что должна построить фабрика дальше? Одна механика, один поворот, или описание игры, которую вы хотите.'
      : 'What should the factory build next? One mechanic, one twist, or a description of the game you want.'}</p>
    <form id="sg-form" autocomplete="off">
      <textarea id="sg-text" maxlength="500" placeholder="${lang === 'ru' ? 'Физическая игра, где...' : 'A merge game where each level adds a new...'}"></textarea>
      <div class="sg-actions">
        <span id="sg-count">0 / 500</span>
        <button type="submit" id="sg-send" disabled>${lang === 'ru' ? 'Отправить' : 'Send'}</button>
      </div>
      <div class="sg-status" id="sg-status" aria-live="polite"></div>
    </form>
  </div>
</div>

<script>
(function(){
  var open=document.getElementById('sg-open'), modal=document.getElementById('sg-modal'),
      close=document.getElementById('sg-close'), text=document.getElementById('sg-text'),
      count=document.getElementById('sg-count'), send=document.getElementById('sg-send'),
      form=document.getElementById('sg-form'), status=document.getElementById('sg-status');
  function show(){ modal.classList.add('on'); modal.setAttribute('aria-hidden','false'); setTimeout(function(){text.focus();},50); }
  function hide(){ modal.classList.remove('on'); modal.setAttribute('aria-hidden','true'); status.textContent=''; status.className='sg-status'; text.value=''; count.textContent='0 / 500'; send.disabled=true; send.textContent='${lang === 'ru' ? 'Отправить' : 'Send'}'; }
  open.addEventListener('click', show);
  close.addEventListener('click', hide);
  modal.addEventListener('click', function(e){ if(e.target===modal) hide(); });
  document.addEventListener('keydown', function(e){ if(e.key==='Escape' && modal.classList.contains('on')) hide(); });
  text.addEventListener('input', function(){ var n=text.value.length; count.textContent=n+' / 500'; send.disabled=n<3; });
  form.addEventListener('submit', async function(e){
    e.preventDefault();
    var t=text.value.trim().slice(0,500); if(t.length<3) return;
    send.disabled=true; send.textContent='…'; status.textContent=''; status.className='sg-status';
    try {
      var r = await fetch('/api/suggest', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({text:t}) });
      if (r.ok) {
        status.textContent='${lang === 'ru' ? 'Спасибо!' : 'Thanks — Tim sees this tomorrow morning.'}';
        status.className='sg-status ok';
        send.textContent='${lang === 'ru' ? 'Отправлено' : 'Sent'}';
        setTimeout(hide, 1800);
      } else {
        var d = await r.json().catch(function(){return{};});
        status.textContent = d.error==='daily_limit_reached' ? '${lang === 'ru' ? 'Уже 3 сегодня — приходите завтра.' : "You\\'ve sent 3 today — come back tomorrow."}'
                           : d.error==='text_too_short' ? '${lang === 'ru' ? 'Чуть подробнее, пожалуйста.' : 'A bit more detail, please.'}'
                           : '${lang === 'ru' ? 'Не получилось — попробуйте снова.' : "Couldn\\'t send — try again."}';
        status.className='sg-status err';
        send.textContent='${lang === 'ru' ? 'Отправить' : 'Send'}';
        send.disabled = text.value.length<3;
      }
    } catch(_){
      status.textContent='${lang === 'ru' ? 'Сетевая ошибка.' : 'Network error — try again.'}';
      status.className='sg-status err';
      send.textContent='${lang === 'ru' ? 'Отправить' : 'Send'}';
      send.disabled = text.value.length<3;
    }
  });
})();
</script>
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
