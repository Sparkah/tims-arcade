#!/usr/bin/env node
/**
 * Browser smoke for the Gallery card renderer. It loads app.js with a malicious
 * games.json fixture and verifies game/card fields render as text/attributes,
 * not executable markup or javascript: links.
 */

const http = require('http');
const path = require('path');
const fs = require('fs');

const GALLERY = path.resolve(__dirname, '..');
const AGENTS_ROOT = process.env.AGENTS_ROOT || '/Users/timmarkin/Agents';

function requirePlaywright() {
  const candidates = [
    process.env.PLAYWRIGHT_MODULE,
    path.resolve(GALLERY, '../Shared/skills/develop-web-game/node_modules/playwright'),
    path.resolve(AGENTS_ROOT, 'Shared/skills/develop-web-game/node_modules/playwright'),
    'playwright',
  ].filter(Boolean);
  const errors = [];
  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch (e) {
      errors.push(`${candidate}: ${e && e.code ? e.code : e.message}`);
    }
  }
  throw new Error(`Unable to load Playwright. Tried ${errors.join('; ')}`);
}

const { chromium } = requirePlaywright();

const maliciousTitle = '<img src=x onerror="window.__xss=1">';
const maliciousHook = '<svg onload="window.__xss=2"></svg>';
const maliciousSlug = 'xss"><img src=x onerror=window.__xss=3>';
const maliciousGenre = '<img src=x onerror="window.__xss=5">';
const maliciousHeroTitle = '<img src=x onerror="window.__xss=77">';
const maliciousHeroHook = '<svg onload="window.__xss=78"></svg>';
const maliciousHeroSlug = 'hero"><img src=x onerror=window.__xss=79>';
const pathShapedSlug = 'folder/name?x=<script>';

const appJs = fs.readFileSync(path.join(GALLERY, 'app.js'), 'utf8');

function json(res, body) {
  res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function text(res, body, contentType = 'text/html; charset=utf-8') {
  res.writeHead(200, { 'content-type': contentType });
  res.end(body);
}

function makeServer() {
  return http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname === '/') {
      text(res, `<!doctype html>
        <html lang="en">
          <body>
            <a id="auth-link"></a>
            <div id="auth-user"><span id="auth-user-initial"></span><span id="auth-user-email"></span></div>
            <button id="meta-pill-board"></button>
            <div id="lb-panel" aria-hidden="true"><button id="lb-close"></button><div id="lb-body"></div></div>
            <div id="meta-pill" hidden><span id="meta-pill-tokens"></span><span id="meta-pill-streak"></span></div>
            <div id="token-pop" hidden><button id="token-pop-x"></button><div id="token-pop-fill"></div><span id="token-pop-prog-txt"></span></div>
            <div id="token-hint" hidden></div>
            <div id="tabs"><button class="tab active" data-tab="top">Top</button></div>
            <div id="genres"></div>
            <input id="search">
            <section id="featured"></section>
            <main id="grid"></main>
            <div id="empty" class="hidden"></div>
            <nav id="pagination"></nav>
            <section id="gems" class="hidden"><div id="gems-grid"></div></section>
            <dialog id="comment-modal">
              <h2 id="comment-modal-title"></h2>
              <form id="comment-modal-form"><textarea id="comment-modal-input"></textarea><button id="comment-modal-submit"></button></form>
              <div id="comment-modal-counter"></div>
              <div id="comment-modal-list"></div>
            </dialog>
            <footer></footer>
            <script>
              window.__xss = 0;
              window.posthog = { capture(){}, identify(){}, reset(){} };
              window.wireModal = function(){ return null; };
            </script>
            <script src="/app.js"></script>
          </body>
        </html>`);
      return;
    }
    if (url.pathname === '/app.js') {
      text(res, appJs, 'application/javascript; charset=utf-8');
      return;
    }
    if (url.pathname === '/games.json') {
      json(res, [
        {
          slug: maliciousHeroSlug,
          title: maliciousHeroTitle,
          hook: maliciousHeroHook,
          genre: 'arcade',
          addedDate: '2026-06-30',
        },
        {
          slug: maliciousSlug,
          title: maliciousTitle,
          hook: maliciousHook,
          genre: maliciousGenre,
          addedDate: '2026-06-30',
          hasPreview: true,
          platforms: {
            yandex: 'javascript:window.__xss=4',
            crazygames: 'https://example.com/play?name=<script>',
          },
        },
        {
          slug: 'safe_reference',
          title: 'Safe Reference',
          hook: 'Keeps the hero candidate pool above one item.',
          genre: 'arcade',
          addedDate: '2026-06-29',
        },
        {
          slug: 'relative_platform',
          title: 'Relative Platform',
          hook: 'A relative platform URL must not become an external chip.',
          genre: 'arcade',
          addedDate: '2026-06-28',
          platforms: {
            yandex: '/admin',
          },
        },
        {
          slug: pathShapedSlug,
          title: 'Path Shaped Slug',
          hook: 'Thumbnail URLs must encode path and query characters.',
          genre: 'arcade',
          addedDate: '2026-06-27',
        },
      ]);
      return;
    }
    if (url.pathname === '/api/boot') {
      json(res, {
        counts: {
          [maliciousHeroSlug]: { likes: 9, dislikes: 0, plays: 10, comments: 1, seconds: 300 },
          [maliciousSlug]: { likes: 7, dislikes: 1, plays: 9, comments: 3, seconds: 120 },
          safe_reference: { likes: 1, dislikes: 0, plays: 1, comments: 0, seconds: 30 },
          relative_platform: { likes: 1, dislikes: 0, plays: 1, comments: 0, seconds: 20 },
          [pathShapedSlug]: { likes: 1, dislikes: 0, plays: 1, comments: 0, seconds: 10 },
        },
        trending: { games: { [maliciousHeroSlug]: { score: 999 } } },
        featured: null,
      });
      return;
    }
    if (url.pathname === '/api/hidden') return json(res, { hidden: [] });
    if (url.pathname === '/api/me') return json(res, { signed_in: false });
    if (url.pathname === '/api/me/meta') return json(res, null);
    if (url.pathname === '/api/featured') return json(res, {});
    if (url.pathname.startsWith('/thumbs/') || url.pathname.startsWith('/previews/')) {
      res.writeHead(204);
      res.end();
      return;
    }
    res.writeHead(404);
    res.end('not found');
  });
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  const server = makeServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.card', { timeout: 5000 });
    const result = await page.evaluate(() => ({
      xss: window.__xss,
      titles: Array.from(document.querySelectorAll('.card-title')).map(el => el.textContent),
      hooks: Array.from(document.querySelectorAll('.card-hook')).map(el => el.textContent),
      injectedNodes: document.querySelectorAll('.card-title img, .card-hook svg, .card script, .card [onerror], .card [onload]').length,
      heroTitle: document.querySelector('.hero-title')?.textContent,
      heroHook: document.querySelector('.hero-hook')?.textContent,
      heroInjectedNodes: document.querySelectorAll('#featured img, #featured svg, #featured script, #featured [onerror], #featured [onload]').length,
      heroJsLinks: Array.from(document.querySelectorAll('#featured a')).filter(a => /^javascript:/i.test(a.getAttribute('href') || '')).length,
      genreTexts: Array.from(document.querySelectorAll('.genre')).map(el => el.textContent),
      genreInjectedNodes: document.querySelectorAll('#genres img, #genres svg, #genres script, #genres [onerror], #genres [onload]').length,
      jsLinks: Array.from(document.querySelectorAll('.card a')).filter(a => /^javascript:/i.test(a.getAttribute('href') || '')).length,
      relativeLinks: Array.from(document.querySelectorAll('.card a')).filter(a => a.href.endsWith('/admin')).length,
      cgLinks: Array.from(document.querySelectorAll('.card a[data-plat="crazygames"]')).map(a => a.href),
      yandexLinks: document.querySelectorAll('.card a[data-plat="yandex"]').length,
      imgSrcs: Array.from(document.querySelectorAll('.card-thumb-img')).map(img => img.getAttribute('src')),
    }));
    assert(result.xss === 0, `malicious fixture executed: ${JSON.stringify(result)}`);
    assert(result.titles.includes(maliciousTitle), `title was not rendered as text: ${JSON.stringify(result)}`);
    assert(result.hooks.includes(maliciousHook), `hook was not rendered as text: ${JSON.stringify(result)}`);
    assert(result.injectedNodes === 0, `card contains injected nodes/handlers: ${JSON.stringify(result)}`);
    assert(result.heroTitle === maliciousHeroTitle, `hero title was not rendered as text: ${JSON.stringify(result)}`);
    assert(result.heroHook === maliciousHeroHook, `hero hook was not rendered as text: ${JSON.stringify(result)}`);
    assert(result.heroInjectedNodes === 0, `hero contains injected nodes/handlers: ${JSON.stringify(result)}`);
    assert(result.heroJsLinks === 0, `hero contains javascript: links: ${JSON.stringify(result)}`);
    assert(result.genreTexts.some(text => text.includes(maliciousGenre)), `genre was not rendered as text: ${JSON.stringify(result)}`);
    assert(result.genreInjectedNodes === 0, `genre row contains injected nodes/handlers: ${JSON.stringify(result)}`);
    assert(result.jsLinks === 0, `card contains javascript: links: ${JSON.stringify(result)}`);
    assert(result.relativeLinks === 0, `card contains relative platform links: ${JSON.stringify(result)}`);
    assert(result.imgSrcs.some(src => src && src.includes(encodeURIComponent(pathShapedSlug))), `path-shaped slug thumbnail was not encoded: ${JSON.stringify(result)}`);
    assert(result.yandexLinks === 0, `unsafe yandex link was retained: ${JSON.stringify(result)}`);
    assert(result.cgLinks.length === 1 && result.cgLinks[0].startsWith('https://example.com/play'), `safe external link missing: ${JSON.stringify(result)}`);
    console.log('PASS app card XSS smoke');
  } finally {
    await browser.close().catch(() => {});
    await new Promise(resolve => server.close(resolve));
  }
}

main().catch(err => {
  console.error('FAIL app card XSS smoke:', err && err.stack || err);
  process.exit(1);
});
