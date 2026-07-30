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

import { readPublicCatalogue, unavailableResponse } from '../_lib/publicCatalogue.js';
import { platformEntries, primaryExternalEntry } from '../_lib/seoSurface.js';

const SITE = 'https://game-factory.tech';

// Retired slugs -> the canonical entry they duplicated. The 2026-07-25 bulk
// publish keyed new manifest entries off the DIRECTORY name, so seven games
// that had been renamed since launch got a second entry pointing at the same
// gameDir (running_away + creature_hunt both = Games/10_running_away). The
// dupes are gone from games.json, but they sat in the sitemap for two days —
// 301 them to the real game so Google consolidates instead of logging a 404.
const RETIRED_SLUGS = {
  running_away: 'creature_hunt',
  apartment: 'apartment_cleaner',
  rail_sorter: 'rail_tycoon',
  dodge_run: 'daily_dodge',
  'satisfying-spill': 'satisfying_spill',
  '85_shader_chip_loadout': 'shader_chip_loadout',
  nubik_2048: 'brainrot_2048',
};

export async function onRequest({ params, env, request }) {
  const slug = String(params.slug || '').replace(/[^a-z0-9_-]/gi, '');
  if (!slug) return new Response('not found', { status: 404 });

  if (Object.prototype.hasOwnProperty.call(RETIRED_SLUGS, slug)) {
    // Carry the query string across. These pages take ?lang= (the sitemap
    // publishes ?lang=ru hreflang alternates), so dropping it would silently
    // send a Russian visitor following a retired link back to English.
    const target = new URL(`/p/${RETIRED_SLUGS[slug]}`, request.url);
    target.search = new URL(request.url).search;
    return Response.redirect(target.toString(), 301);
  }

  // Catalogue visibility comes from the same production D1 set used by every
  // discovery surface. If that state cannot be established, fail closed.
  let catalogue;
  try {
    catalogue = await readPublicCatalogue(env);
  } catch (_) {
    return unavailableResponse('html');
  }

  const game = catalogue.games.find(g => g.slug === slug);
  if (!game) {
    return new Response(
      `<!DOCTYPE html><meta charset="utf-8"><title>Not found</title>
       <p>Game "${escapeHtml(slug)}" not found. <a href="/">Back to gallery →</a></p>`,
      { status: 404, headers: { 'content-type': 'text/html; charset=utf-8' } }
    );
  }

  // Unpublished games (published:false) must NOT render a playable share card —
  // they've been pulled from the gallery (e.g. a broken/stub build). Treat like
  // not-found so /p/<slug> can't be used to reach the game. (Tim 2026-05-31:
  // critter_keep shipped as a template stub, was unpublished, but /p/ kept
  // serving it because this page rendered any slug found in games.json.)
  if (game.published === false || catalogue.hiddenSet.has(slug)) {
    return new Response(
      `<!DOCTYPE html><meta charset="utf-8"><meta name="robots" content="noindex,nofollow,noarchive"><title>Unavailable</title>
       <p>This game is not in the public gallery. <a href="/">Back to gallery →</a></p>`,
      {
        status: 404,
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-store',
          'x-robots-tag': 'noindex, nofollow, noarchive',
        },
      }
    );
  }

  // Pick language: explicit ?lang= wins (so the hreflang'd ?lang=ru URL actually
  // serves Russian to a neutral crawler - Google/Yandex fetch it with no ru
  // Accept-Language and would otherwise get English at the RU URL, breaking the
  // hreflang pair). Fall back to Accept-Language (Yandex honours it on share).
  const qLang = String(new URL(request.url).searchParams.get('lang') || '').toLowerCase().slice(0, 2);
  const acceptLang = (request.headers.get('Accept-Language') || '').toLowerCase();
  const lang = qLang === 'ru' ? 'ru'
             : qLang === 'en' ? 'en'
             : acceptLang.split(',')[0].startsWith('ru') ? 'ru' : 'en';

  const titleEn = game.title;
  const titleRu = game.title_ru || game.title;
  const hookEn  = game.hook || 'A small browser game from Tim\'s Game Lab.';
  const hookRu  = game.hook_ru || game.hook || 'Маленькая браузерная игра.';

  const ogTitle = lang === 'ru' ? titleRu : titleEn;
  const ogHook  = lang === 'ru' ? hookRu : hookEn;
  const pageTitle = `${ogTitle} — Tim's Game Lab`;

  const img   = `${SITE}/thumbs/${slug}.png`;
  const url   = `${SITE}/p/${slug}`;
  // The RU page must self-canonicalize to ?lang=ru; otherwise Google folds it
  // into the EN URL as a duplicate and the Russian page never ranks. EN (bare
  // or ?lang=en) canonicalizes to the clean param-free URL.
  const canonicalUrl = qLang === 'ru' ? `${url}?lang=ru` : url;
  // Forward the ?band=<code> share param (Bandlings view-only concert links,
  // 2026-06-11) so /p/bandlings?band=X carries through to the play surface.
  // Strictly sanitized (band codes are [0-9a-zA-Z-]); canonical/og:url stay
  // param-free so shared links don't fragment SEO.
  const bandCode = String(new URL(request.url).searchParams.get('band') || '').replace(/[^0-9a-zA-Z-]/g, '').slice(0, 80);
  const localPlayUrl = `/play.html?slug=${encodeURIComponent(slug)}${bandCode ? `&band=${bandCode}` : ''}`;
  const platforms = platformEntries(game.platforms);
  const externalPrimary = primaryExternalEntry(game);
  if (game.external === true && !externalPrimary) {
    // An external-only entry must never fall through to a nonexistent local
    // /games/<slug>/ frame when its platform URL is missing or unsafe.
    return unavailableResponse('html');
  }
  const playUrl = externalPrimary ? externalPrimary.href : localPlayUrl;
  const playLabel = externalPrimary
    ? (lang === 'ru' ? `▶ Играть на ${externalPrimary.label}` : `▶ Play on ${externalPrimary.label}`)
    : (lang === 'ru' ? '▶ Играть' : '▶ Play now');
  const builtWithUrl = safeHttpUrl(game.builtWith && game.builtWith.url);

  const genre = (game.genre || '').trim();
  const genreLabel = genre ? genre.charAt(0).toUpperCase() + genre.slice(1) : '';
  const playMode = /multi/i.test(genre) ? 'MultiPlayer' : 'SinglePlayer';

  // Pick up to 3 related games for internal linking. Same-genre first
  // (Google rewards topic clusters), then most-recent as fallback.
  const others = catalogue.publicGames.filter(g => g.slug !== slug);
  const sameGenre = others.filter(g => g.genre === genre && genre);
  const relatedPool = sameGenre.length >= 3
    ? sameGenre
    : sameGenre.concat(others.filter(g => g.genre !== genre));
  const related = relatedPool
    .sort((a, b) => (b.addedDate || '').localeCompare(a.addedDate || ''))
    .slice(0, 3);

  const ld = {
    '@context': 'https://schema.org',
    '@type': 'VideoGame',
    name: ogTitle,
    description: ogHook,
    image: img,
    url,
    inLanguage: lang === 'ru' ? 'ru' : 'en',
    datePublished: game.addedDate,
    dateModified: game.updatedDate || game.addedDate,
    genre: genreLabel || undefined,
    playMode,
    applicationCategory: 'Game',
    operatingSystem: 'Web Browser',
    browserRequirements: 'Requires JavaScript and HTML5 canvas',
    sameAs: platforms.length ? platforms.map(entry => entry.href) : undefined,
    gamePlatform: externalPrimary
      ? platforms.map(entry => entry.label)
      : ['Web Browser', ...platforms.map(entry => entry.label)],
    potentialAction: {
      '@type': 'PlayAction',
      target: externalPrimary ? externalPrimary.href : `${SITE}${localPlayUrl}`,
    },
    publisher: {
      '@type': 'Organization',
      name: "Tim's Game Lab",
      url: SITE,
    },
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
      availability: 'https://schema.org/InStock',
    },
  };
  const ldJson = JSON.stringify(ld).replace(/</g, '\\u003c');

  const html = `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(pageTitle)}</title>
<meta name="description" content="${escapeHtml(ogHook)}">
<link rel="canonical" href="${canonicalUrl}">
<link rel="alternate" hreflang="en" href="${url}">
<link rel="alternate" hreflang="ru" href="${url}?lang=ru">
<link rel="alternate" hreflang="x-default" href="${url}">

<!-- Open Graph (language-aware) -->
<meta property="og:type" content="website">
<meta property="og:url" content="${canonicalUrl}">
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

<script type="application/ld+json">${ldJson}</script>

<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
	html,body{background:#0a0a14;color:#e7e7ee;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",Roboto,sans-serif;min-height:100%;text-align:center}
	body{min-height:100dvh;display:flex;justify-content:center}
	/* margin:auto (not align-items:center) so when content overflows the
	   viewport it top-aligns and scrolls instead of clipping the top. */
	.wrap{width:min(560px,100%);padding:32px 20px;margin:auto}
	/* Cap cover height: portrait mobile-first thumbs (1080x1920) would render
	   ~1000px tall at width:100% and push the Play button below the fold on
	   desktop (crash_buggy 2026-06-10). Gate: scripts/check_play_visible.js */
	img{width:100%;max-width:100%;max-height:min(38dvh,420px);object-fit:cover;border-radius:12px;margin-bottom:18px;box-shadow:0 8px 32px rgba(0,0,0,0.5)}
h1{font-size:24px;margin-bottom:6px;color:#f7f7fa}
p{color:#8a8aa0;font-size:15px;line-height:1.5;margin-bottom:18px}
a.btn{display:inline-block;background:#4dd0e1;color:#0a0a14;padding:10px 22px;border-radius:999px;font-weight:700;text-decoration:none;font-size:15px}
a.btn:hover{filter:brightness(1.1)}
small{display:block;color:#5a5a72;margin-top:24px;font-size:12px}
.alt{margin-top:8px;font-size:13px;color:#6a6a82}
.alt p{font-size:13px;margin-bottom:0}
.meta{font-size:13px;color:#a7a7b6;margin-bottom:14px;letter-spacing:0.01em}
.related{margin-top:22px;padding-top:18px;border-top:1px solid #1f1f2c;text-align:left}
.related h2{font-size:13px;color:#8a8aa0;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:10px}
.related ul{list-style:none;display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.related li{margin:0}
.related a{display:block;color:#e7e7ee;text-decoration:none;font-size:13px;line-height:1.3;padding:8px;border-radius:8px;background:#13131f;border:1px solid #1f1f2c}
.related a:hover{background:#191928;border-color:#2a2a3a}
.related img{width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:5px;margin-bottom:6px;box-shadow:none}
@media (max-width:600px){.related ul{grid-template-columns:repeat(3,1fr);gap:6px}.related a{padding:6px;font-size:12px}}
.sg-link{background:none;border:none;color:#8a8aa0;font-size:13px;cursor:pointer;padding:0;margin-top:12px;text-decoration:underline}
.sg-link:hover{color:#e7e7ee}
.sg-modal{border:0;background:transparent;padding:20px;max-width:none;max-height:none;width:100%;height:100%;color:inherit}
.sg-modal[open]{display:grid;place-items:center}
.sg-modal::backdrop{background:rgba(0,0,0,0.65)}
.sg-panel{position:relative;background:#161622;border:1px solid #2a2a35;border-radius:10px;max-width:440px;width:100%;padding:18px;text-align:left}
.sg-panel h3{font-size:16px;margin-bottom:6px;color:#f7f7fa}
.sg-panel p{font-size:13px;color:#8a8aa0;margin-bottom:10px;line-height:1.4}
.sg-field-label{display:block;color:#c5c5d0;font-size:13px;font-weight:600;margin-bottom:6px}
.sg-panel textarea{width:100%;background:#0a0a14;color:#e7e7ee;border:1px solid #2a2a35;border-radius:6px;padding:8px 10px;font:inherit;font-size:14px;resize:vertical;min-height:80px}
.sg-actions{display:flex;justify-content:space-between;align-items:center;margin-top:10px;font-size:12px;color:#a7a7b6}
.sg-actions button{background:#4dd0e1;color:#0a0a14;border:none;border-radius:6px;padding:6px 14px;font-weight:700;cursor:pointer;font-size:13px}
.sg-actions button:disabled{opacity:0.4;cursor:not-allowed}
.sg-status{font-size:12px;margin-top:8px;min-height:16px;color:#8a8aa0}
.sg-status.ok{color:#7c7}.sg-status.err{color:#d77}
	.sg-close{position:absolute;top:8px;right:12px;background:none;border:none;color:#8a8aa0;font-size:20px;cursor:pointer;line-height:1}
	@media (max-width:600px){
	  .wrap{padding:18px 16px 22px}
	  img{max-height:36dvh;object-fit:cover;margin-bottom:14px;border-radius:10px}
	  h1{font-size:23px;line-height:1.15;margin-bottom:7px}
	  p{font-size:15px;line-height:1.35;margin-bottom:14px}
	  a.btn{padding:11px 24px}
	  small{margin-top:18px}
	}
	</style>
</head>
<body>
<main class="wrap">
  <img src="${img}" alt="${escapeHtml(ogTitle)}">
  <h1>${escapeHtml(ogTitle)}</h1>
  <p>${escapeHtml(ogHook)}</p>
  ${genreLabel || game.addedDate ? `<p class="meta">${[
    genreLabel ? `${lang === 'ru' ? 'Жанр' : 'Genre'}: ${escapeHtml(genreLabel)}` : '',
    game.addedDate ? `${lang === 'ru' ? 'Добавлено' : 'Added'} ${escapeHtml(game.addedDate)}` : '',
    externalPrimary
      ? (lang === 'ru' ? `Официальный релиз на ${escapeHtml(externalPrimary.label)}` : `Official release on ${escapeHtml(externalPrimary.label)}`)
      : (lang === 'ru' ? 'Играй в браузере, без установки' : 'Play in-browser, no install'),
  ].filter(Boolean).join(' · ')}</p>` : ''}
  <a class="btn" href="${escapeHtml(playUrl)}"${externalPrimary ? ' target="_blank" rel="noopener external"' : ''}>${escapeHtml(playLabel)}</a>
  ${!externalPrimary && platforms.length ? `<p class="alt">${lang === 'ru' ? 'Также доступно' : 'Also available'}: ${platforms.map(entry => `<a href="${escapeHtml(entry.href)}" target="_blank" rel="noopener external" style="color:#8a8aa0">${escapeHtml(entry.label)}</a>`).join(' · ')}</p>` : ''}
  ${builtWithUrl ? `<p class="alt"><a href="${escapeHtml(builtWithUrl)}" style="color:#8a8aa0">${escapeHtml((lang === 'ru' && game.builtWith.label_ru) || game.builtWith.label || 'Built with our engine')} →</a></p>` : ''}
  <small><a href="/" style="color:#8a8aa0">${lang === 'ru' ? '← все игры' : '← browse all games'}</a></small>
  ${related.length ? `<nav class="related" aria-label="${lang === 'ru' ? 'Похожие игры' : 'Related games'}">
    <h2>${lang === 'ru' ? 'Похожие игры' : 'More games'}</h2>
    <ul>${related.map(r => {
      const rTitle = lang === 'ru' ? (r.title_ru || r.title) : r.title;
      return `<li><a href="/p/${encodeURIComponent(r.slug)}"><img src="${SITE}/thumbs/${encodeURIComponent(r.slug)}.png" alt="" loading="lazy">${escapeHtml(rTitle)}</a></li>`;
    }).join('')}</ul>
  </nav>` : ''}
  <div><button class="sg-link" id="sg-open" type="button">${lang === 'ru' ? '💡 Предложить игру' : '💡 Suggest a game'}</button></div>
</main>

<dialog class="sg-modal" id="sg-modal" aria-labelledby="sg-title">
  <div class="sg-panel">
    <button class="sg-close" id="sg-close" type="button" aria-label="${lang === 'ru' ? 'Закрыть' : 'Close'}">×</button>
    <h3 id="sg-title">${lang === 'ru' ? 'Предложить игру' : 'Suggest a game'}</h3>
    <p>${lang === 'ru'
      ? 'Что должна построить фабрика дальше? Одна механика, один поворот, или описание игры, которую вы хотите.'
      : 'What should the factory build next? One mechanic, one twist, or a description of the game you want.'}</p>
    <form id="sg-form" autocomplete="off">
      <label class="sg-field-label" for="sg-text">${lang === 'ru' ? 'Ваша идея игры' : 'Your game idea'}</label>
      <textarea id="sg-text" maxlength="500" placeholder="${lang === 'ru' ? 'Физическая игра, где...' : 'A merge game where each level adds a new...'}"></textarea>
      <div class="sg-actions">
        <span id="sg-count">0 / 500</span>
        <button type="submit" id="sg-send" disabled>${lang === 'ru' ? 'Отправить' : 'Send'}</button>
      </div>
      <div class="sg-status" id="sg-status" aria-live="polite"></div>
    </form>
  </div>
</dialog>

<script>
(function(){
  var open=document.getElementById('sg-open'), modal=document.getElementById('sg-modal'),
      close=document.getElementById('sg-close'), text=document.getElementById('sg-text'),
      count=document.getElementById('sg-count'), send=document.getElementById('sg-send'),
      form=document.getElementById('sg-form'), status=document.getElementById('sg-status');
  function show(){ if(!modal.open) modal.showModal(); text.focus(); }
  function hide(){ if(modal.open) modal.close(); status.textContent=''; status.className='sg-status'; text.value=''; count.textContent='0 / 500'; send.disabled=true; send.textContent='${lang === 'ru' ? 'Отправить' : 'Send'}'; }
  open.addEventListener('click', show);
  close.addEventListener('click', hide);
  modal.addEventListener('click', function(e){ if(e.target===modal) hide(); });
  modal.addEventListener('cancel', function(e){ e.preventDefault(); hide(); });
  modal.addEventListener('close', function(){ open.focus(); });
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
      'cache-control': 'public, max-age=0, must-revalidate',
      'vary': 'Accept-Language',
    },
  });
}

function safeHttpUrl(value) {
  try {
    const u = new URL(String(value || ''));
    // Drop non-http(s) schemes so catalogue-supplied builtWith URLs cannot
    // inject script via javascript:/data: hrefs.
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : '';
  } catch (_) {
    return '';
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
