#!/usr/bin/env node
/**
 * check_play_visible.js — HARD gate: the Play button on every /p/<slug>
 * landing page must be FULLY visible WITHOUT scrolling, on desktop AND mobile.
 *
 * Born 2026-06-10 (crash_buggy): mobile-first games ship PORTRAIT thumbs
 * (1080x1920). The /p/ page rendered the cover at width:100% in a 560px
 * column, so a portrait thumb became ~1000px tall and pushed "▶ Play now"
 * below the fold on EVERY desktop window. Desktop visitors saw a giant
 * phone screenshot and no way to play — 19 games were broken this way.
 * Tim has flagged this class of bug repeatedly: a game whose play button
 * is invisible at desktop resolution must NOT deploy.
 *
 * WHAT IT DOES
 *   1. Imports the REAL Pages function (functions/p/[slug].js) — no parallel
 *      re-implementation that could drift — with fetch stubbed to the local
 *      games.json, and renders the HTML for every published game.
 *   2. Loads each page in headless Chrome via a staged file:// copy whose
 *      thumb URLs point at the local Gallery/thumbs/ dir (what will deploy).
 *   3. At scroll position 0, asserts `a.btn` (the Play link) is fully inside
 *      the viewport, has nonzero size, and is not covered by another element:
 *        - desktop 1280x720
 *        - desktop-short 1280x600 (browser chrome on a 768px laptop screen)
 *        - mobile  393x852
 *
 * USAGE
 *   node scripts/check_play_visible.js              # all published games
 *   node scripts/check_play_visible.js --slug crash_buggy
 *   node scripts/check_play_visible.js --quiet      # only failures + summary
 *
 * Exit codes: 0 PASS, 1 infrastructure error, 2 FAIL (play button hidden).
 * Wired as a stage of scripts/hooks/pre-push — a FAIL blocks the push.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const GALLERY = path.resolve(__dirname, '..');
const puppeteer = require(path.join(
  GALLERY, '..', 'Shared', 'skills', 'game-factory', 'tools', 'node_modules', 'puppeteer'
));

const VIEWPORTS = [
  { w: 1280, h: 720, name: 'desktop-1280x720',       isMobile: false },
  // Real browser chrome eats ~100-150px: a 768px laptop screen leaves ~600px
  // of page. Same short-desktop case the in-game reachability gate tests.
  { w: 1280, h: 600, name: 'desktop-short-1280x600', isMobile: false },
  { w: 393,  h: 852, name: 'mobile-393x852',         isMobile: true  },
];
// Low concurrency on purpose: 4 tabs serving multi-MB PNGs through
// request-interception hit protocol timeouts when run inside the pre-push
// hook (2026-06-10). Thumbs are now loaded via file:// instead, but keep
// the page count conservative — the gate must never flake a push.
const CONCURRENCY = 2;

const onlySlug = (() => { const i = process.argv.indexOf('--slug'); return i > -1 ? process.argv[i + 1] : null; })();
const quiet = process.argv.includes('--quiet');
const log = (...a) => { if (!quiet) console.log(...a); };

async function loadPageFunction() {
  // functions/ has no package.json, so the ESM source can't be import()ed
  // under its .js name — stage a temp .mjs copy and import that.
  const src = fs.readFileSync(path.join(GALLERY, 'functions', 'p', '[slug].js'), 'utf8');
  const tmp = path.join(os.tmpdir(), `p_slug_gate_${process.pid}.mjs`);
  fs.writeFileSync(tmp, src);
  const mod = await import('file://' + tmp);
  fs.unlinkSync(tmp);
  if (typeof mod.onRequest !== 'function') throw new Error('functions/p/[slug].js exports no onRequest');
  return mod.onRequest;
}

// NB: the caller installs the games.json fetch stub ONCE around the whole
// worker pool (a per-call swap/restore interleaves across concurrent workers
// and can leave the stub installed process-wide).
async function renderPage(onRequest, slug) {
  const request = {
    url: `https://game-factory.tech/p/${slug}`,
    headers: new Headers({ 'Accept-Language': 'en-US,en;q=0.9' }),
  };
  const res = await onRequest({ params: { slug }, env: {}, request });
  if (res.status !== 200) return { error: `function returned ${res.status}` };
  return { html: await res.text() };
}

// Stage the rendered HTML as a temp file with thumb URLs rewritten to the
// local Gallery/thumbs/ dir, and load it via file:// — images come straight
// off disk. (v1 served thumbs through request-interception req.respond();
// multi-MB PNG bodies across concurrent tabs caused protocol timeouts when
// the gate ran inside the pre-push hook.)
let stageSeq = 0;
function stageHtml(html, slug) {
  const staged = html
    .replace(/https:\/\/game-factory\.tech\/thumbs\//g, 'file://' + path.join(GALLERY, 'thumbs') + '/')
    // no other external fetches should run during the check
    .replace(/<script src="https?:\/\/[^"]+"[^>]*><\/script>/g, '');
  // Unique name per ATTEMPT: a retry re-staging under the same name raced the
  // previous attempt's async unlink → ERR_FILE_NOT_FOUND (tier1_hook, 2026-06-10).
  const f = path.join(os.tmpdir(), `p_gate_${process.pid}_${slug}_${stageSeq++}.html`);
  fs.writeFileSync(f, staged);
  return f;
}

async function checkOne(browser, html, slug) {
  const fails = [];
  const stagedFile = stageHtml(html, slug);
  const page = await browser.newPage();
  try {
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      if (/^https?:/.test(req.url())) return req.abort();
      req.continue();
    });

    for (const vp of VIEWPORTS) {
      await page.setViewport({ width: vp.w, height: vp.h, isMobile: vp.isMobile, hasTouch: vp.isMobile });
      await page.goto('file://' + stagedFile, { waitUntil: 'load', timeout: 30000 });
      await page.evaluate(() => Promise.all(
        Array.from(document.images).map(im => im.complete ? null : new Promise(r => { im.onload = im.onerror = r; setTimeout(r, 5000); }))
      ));
      const verdict = await page.evaluate(() => {
        window.scrollTo(0, 0);
        // The cover MUST have actually loaded: a missing/broken image
        // collapses to 0px tall, the button floats up, and the gate would
        // false-PASS a page that breaks once the real thumb loads in prod.
        const cover = document.querySelector('.wrap > img');
        if (cover && !(cover.complete && cover.naturalWidth > 0))
          return { ok: false, why: 'cover image failed to load in gate — layout not trustworthy' };
        const btn = document.querySelector('a.btn[href^="/play.html"]') || document.querySelector('a.btn');
        if (!btn) return { ok: false, why: 'no a.btn play link in DOM' };
        const r = btn.getBoundingClientRect();
        if (r.width < 10 || r.height < 10) return { ok: false, why: `btn collapsed (${Math.round(r.width)}x${Math.round(r.height)})` };
        if (r.top < 0 || r.bottom > window.innerHeight)
          return { ok: false, why: `btn outside fold: top=${Math.round(r.top)} bottom=${Math.round(r.bottom)} viewportH=${window.innerHeight}` };
        if (r.left < 0 || r.right > window.innerWidth)
          return { ok: false, why: `btn outside horizontally: left=${Math.round(r.left)} right=${Math.round(r.right)} viewportW=${window.innerWidth}` };
        const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        if (el !== btn && !btn.contains(el) && !(el && el.contains(btn)) && (!el || el.closest('a.btn') !== btn))
          return { ok: false, why: `btn covered by <${el ? el.tagName.toLowerCase() : 'null'}>` };
        return { ok: true };
      });
      if (!verdict.ok) fails.push(`${slug} @${vp.name}: ${verdict.why}`);
    }
  } finally {
    await page.close().catch(() => {});
    fs.unlink(stagedFile, () => {});
  }
  return fails;
}

(async () => {
  const gamesJson = fs.readFileSync(path.join(GALLERY, 'games.json'), 'utf8');
  const games = JSON.parse(gamesJson).filter(g => g.published !== false);
  const slugs = onlySlug ? [onlySlug] : games.map(g => g.slug);

  const onRequest = await loadPageFunction();
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'], protocolTimeout: 120000 });

  const allFails = [];   // confirmed visibility failures → exit 2
  const infraFails = []; // render/check errors after retry → exit 1 (fail closed)
  let done = 0;
  const queue = slugs.slice();
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => String(url).includes('/games.json')
    ? new Response(gamesJson, { status: 200, headers: { 'content-type': 'application/json' } })
    : new Response('not found', { status: 404 });
  try {
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      while (queue.length) {
        const slug = queue.shift();
        const { html, error } = await renderPage(onRequest, slug);
        if (error) { infraFails.push(`${slug}: render error — ${error}`); done++; continue; }
        // Retry once on infrastructure errors (page crash, protocol hiccup) so a
        // transient flake can't abort a push; a REAL visibility fail is
        // deterministic and survives the retry.
        try {
          allFails.push(...await checkOne(browser, html, slug));
        } catch (e1) {
          try {
            allFails.push(...await checkOne(browser, html, slug));
          } catch (e2) {
            infraFails.push(`${slug}: check error after retry — ${e2.message}`);
          }
        }
        done++;
        if (!quiet && done % 25 === 0) log(`  …${done}/${slugs.length} checked`);
      }
    }));
  } finally {
    globalThis.fetch = realFetch;
    await browser.close();
  }

  if (allFails.length) {
    console.error(`\n🚫 PLAY-VISIBILITY GATE: ${allFails.length} failure(s) across ${slugs.length} game page(s):`);
    for (const f of allFails.sort()) console.error(`   ✗ ${f}`);
    console.error('\n   Rule: /p/<slug> must show the full Play button WITHOUT scrolling');
    console.error('   at 1280x720 + 1280x600 desktop and 393x852 mobile. Fix the page');
    console.error('   layout or the offending thumb before pushing.');
    process.exit(2);
  }
  if (infraFails.length) {
    console.error(`\n⚠️  PLAY-VISIBILITY GATE: ${infraFails.length} page(s) could not be checked (no visibility verdict):`);
    for (const f of infraFails.sort()) console.error(`   ✗ ${f}`);
    process.exit(1);
  }
  console.log(`✅ play-visibility gate: ${slugs.length} page(s) × ${VIEWPORTS.length} viewports — Play button above the fold everywhere`);
  process.exit(0);
})().catch(e => { console.error('check_play_visible: infrastructure error:', e.message); process.exit(1); });
