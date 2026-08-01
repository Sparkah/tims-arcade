// Headless test for the two admin.html fixes (Tim 2026-07-27):
//   1. Hidden panel Hidden/Visible sub-tabs (switch, counts, persistence)
//   2. Focus-refresh keeps your scroll position + active tab
//
// Serves the worktree over http and stubs every /api/* response, so it never
// touches prod KV and needs no admin session.
const path = require('path');
const http = require('http');
const fs = require('fs');

// Gallery root = two levels up from scripts/tests/. Works from any checkout or
// worktree; ADMIN_HTML can point the /admin.html route at a different build.
const WT = path.resolve(__dirname, '..', '..');

// Walk up for the shared puppeteer install — a worktree under .worktrees/ is
// two levels deeper than a normal Gallery/ checkout, so a fixed ../ is wrong.
const PUPPETEER_REL = 'Shared/skills/game-factory/tools/node_modules/puppeteer';
function findPuppeteer(start) {
  let dir = start;
  for (let i = 0; i < 8; i++) {
    const candidate = path.join(dir, PUPPETEER_REL);
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  console.error(`could not find ${PUPPETEER_REL} above ${start}`);
  process.exit(2);
}
const puppeteer = require(findPuppeteer(WT));

// 60 games: 3 hidden, 57 visible. Deliberately many, so the Games tab is far
// taller than the viewport and the scroll-preservation check is meaningful.
const TOTAL = 60;
const GAMES = Array.from({ length: TOTAL }, (_, i) => ({
  slug: `game_${i + 1}`, title: `Game ${i + 1}`, num: i + 1, published: true, thumbCount: 1,
}));
const HIDDEN = ['game_2', 'game_5', 'game_9'];
const VISIBLE_COUNT = TOTAL - HIDDEN.length;

const STUBS = {
  '/games.json': GAMES,
  '/api/admin/catalogue': GAMES,
  '/api/admin/hidden': { hidden: HIDDEN },
  '/api/admin/publish-status': { games: {}, core_platforms: [] },
  '/api/admin/stats': {
    totals: { plays: 10, seconds: 100, likes: 2, dislikes: 1 },
    perDay: {}, highlights: {}, comments: [],
    perGame: GAMES.map(g => ({ slug: g.slug, plays: 1, seconds: 10, likes: 0, dislikes: 0 })),
  },
  '/api/admin/uploads': { uploads: [] },
  '/api/admin/suggestions': { suggestions: [] },
  '/api/admin/user-digests': { users: [] },
  '/api/admin/cohorts': { cohorts: [] },
  '/api/least-attention': { games: [] },
  '/api/admin/funnel': { steps: [] },
};

// Real API latency matters here. With instant localhost stubs the whole reload
// finishes inside one frame, so the browser never lays out the collapsed page
// and scrollY never clamps — the bug hides and the test proves nothing. 250ms
// is still far faster than the real /api/admin/stats KV walk (~10s cold).
const API_LATENCY_MS = 250;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const stubKey = Object.keys(STUBS).find(k => url.pathname === k || url.pathname.startsWith(k + '/'));
  if (stubKey) {
    return setTimeout(() => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(STUBS[stubKey]));
    }, API_LATENCY_MS);
  }
  if (url.pathname.startsWith('/api/')) {
    return setTimeout(() => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{}');
    }, API_LATENCY_MS);
  }
  // ADMIN_HTML lets the same harness run against a different build of the page
  // (used to confirm these checks actually FAIL on the pre-fix admin.html).
  if (url.pathname === '/admin.html' && process.env.ADMIN_HTML) {
    res.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store' });
    return res.end(fs.readFileSync(process.env.ADMIN_HTML));
  }
  const file = path.join(WT, url.pathname === '/' ? 'index.html' : url.pathname.slice(1));
  if (!file.startsWith(WT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); return res.end('nf');
  }
  const ext = path.extname(file);
  const type = ext === '.html' ? 'text/html' : ext === '.css' ? 'text/css' : ext === '.js' ? 'text/javascript' : 'application/octet-stream';
  res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(fs.readFileSync(file));
});

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

(async () => {
  await new Promise(r => server.listen(8123, r));
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));

  await page.goto('http://localhost:8123/admin.html', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 800));

  // --- Fix 2: Hidden panel sub-tabs -----------------------------------------
  const readPanel = () => page.evaluate(() => {
    const el = document.getElementById('hidden-panel');
    if (!el) return null;
    const buttons = [...el.querySelectorAll('button')].filter(b => !b.className.includes('hide-act'));
    return {
      buttons: buttons.map(b => ({ label: b.textContent, pressed: b.getAttribute('aria-pressed') })),
      rowSlugs: [...el.querySelectorAll('tbody tr')].map(tr => tr.children[1].textContent),
      actions: [...el.querySelectorAll('.hide-act')].map(b => b.textContent),
      summary: (el.querySelector('p') || {}).textContent || '',
    };
  });

  let panel = await readPanel();
  check('hidden panel renders', !!panel);
  const hasSubTabs = panel.buttons.length === 2;
  check('two sub-tabs exist', hasSubTabs, JSON.stringify(panel.buttons.map(b => b.label)));
  // Pre-fix builds have no sub-tabs; keep going so the scroll checks still run.
  if (!hasSubTabs) panel.buttons = [{ label: '', pressed: null }, { label: '', pressed: null }];
  check('counts are right',
        panel.buttons[0].label === `Hidden (${HIDDEN.length})` && panel.buttons[1].label === `Visible (${VISIBLE_COUNT})`,
        `${panel.buttons[0].label} / ${panel.buttons[1].label}`);
  check('defaults to Hidden tab', panel.buttons[0].pressed === 'true');
  check('Hidden tab lists only hidden games',
        panel.rowSlugs.length === 3 && panel.rowSlugs.every(s => HIDDEN.includes(s)),
        panel.rowSlugs.join(','));
  check('Hidden rows offer unhide', panel.actions.every(a => a === 'unhide'), panel.actions.join(','));

  // Switch to Visible
  await page.evaluate(() => {
    const el = document.getElementById('hidden-panel');
    const tabs = [...el.querySelectorAll('button')].filter(b => !b.className.includes('hide-act'));
    if (tabs[1]) tabs[1].click();
  });
  panel = await readPanel();
  if (!panel.buttons.length) panel.buttons = [{ label: '', pressed: null }, { label: '', pressed: null }];
  check('Visible tab lists only visible games',
        panel.rowSlugs.length === VISIBLE_COUNT && panel.rowSlugs.every(s => !HIDDEN.includes(s)),
        `${panel.rowSlugs.length} rows`);
  check('Visible rows offer hide', panel.actions.every(a => a === 'hide'));
  check('Visible tab marked active', panel.buttons[1].pressed === 'true' && panel.buttons[0].pressed === 'false');
  check('summary still shows totals',
        panel.summary.includes(String(HIDDEN.length)) && panel.summary.includes(String(TOTAL)),
        panel.summary.slice(0, 40));

  // Sub-tab choice must survive a panel reload (what hide/unhide triggers).
  await page.evaluate(() => loadHidden());
  await new Promise(r => setTimeout(r, 400));
  panel = await readPanel();
  if (!panel.buttons.length) panel.buttons = [{ label: '', pressed: null }, { label: '', pressed: null }];
  check('sub-tab survives panel reload', panel.buttons[1].pressed === 'true' && panel.rowSlugs.length === VISIBLE_COUNT);

  // --- Fix 3: focus-refresh keeps your place --------------------------------
  // Park on a non-default main tab, scroll down, then simulate tab-away/back
  // past the 30s throttle and assert nothing moved.
  const tabCount = await page.evaluate(() => document.querySelector('[data-tabbar="1"]').children.length);
  // Tab 1 = the per-game table (60 rows) — tall enough that a real scroll offset
  // survives, unlike a short panel where scrollY clamps to a few px.
  await page.evaluate(() => { document.querySelector('[data-tabbar="1"]').children[1].click(); });
  await page.evaluate(() => window.scrollTo(0, 900));
  await new Promise(r => setTimeout(r, 200));
  const reached = await page.evaluate(() => window.scrollY);
  check('test page is genuinely scrollable', reached > 300, `scrollY=${reached}`);
  const before = await page.evaluate(() => ({
    y: window.scrollY,
    tab: sessionStorage.getItem('adminTab'),
    hiddenView: sessionStorage.getItem('adminHiddenView'),
  }));

  const fired = await page.evaluate(() => {
    const before = lastLoadAt;
    lastLoadAt = 0;                       // clear the 30s throttle
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    return { before, after: lastLoadAt };
  });
  // Guard against a vacuous pass: if the refresh never ran, the checks below
  // are meaningless. lastLoadAt is re-stamped at the top of load().
  check('focus actually triggered a refresh', fired.after > 0, JSON.stringify(fired));

  // Sample mid-flight, while the (latency-bound) fetches are still open.
  await new Promise(r => setTimeout(r, 120));
  const midFlash = await page.evaluate(() => document.getElementById('content').textContent.trim());
  const midScroll = await page.evaluate(() => window.scrollY);
  await new Promise(r => setTimeout(r, 1800));

  const after = await page.evaluate(() => ({
    y: window.scrollY,
    tab: sessionStorage.getItem('adminTab'),
    hiddenView: sessionStorage.getItem('adminHiddenView'),
    tabs: document.querySelector('[data-tabbar="1"]') ? document.querySelector('[data-tabbar="1"]').children.length : 0,
  }));

  check('refresh does not blank the dashboard', midFlash !== 'Loading…', `mid-refresh content: "${midFlash.slice(0, 24)}"`);
  check('scroll held mid-refresh', midScroll > 300, `mid-refresh scrollY=${midScroll}`);
  check('scroll position preserved', Math.abs(after.y - before.y) <= 2, `${before.y} -> ${after.y}`);
  check('active main tab preserved', after.tab === before.tab, `${before.tab} -> ${after.tab}`);
  check('hidden sub-tab preserved', after.hiddenView === before.hiddenView, `${before.hiddenView} -> ${after.hiddenView}`);
  check('tab bar rebuilt intact', after.tabs === tabCount, `${tabCount} -> ${after.tabs}`);

  // --- Fix 3b: the same, on a tab whose content arrives ASYNCHRONOUSLY -------
  // The Games tab above is built synchronously by render(), so full page height
  // exists the instant the scroll is restored. The Hidden panel is fetched, so
  // at restore time it is still a "Loading…" placeholder and the document can
  // be SHORTER than the saved offset — scrollTo then clamps and the restore
  // silently fails. Caught exactly that: scrollY dipped 1200 -> 30 for half a
  // second before recovering. Sampling ACROSS the refresh, not just after it,
  // is what makes this visible; the fix pins the old height during the repaint.
  await page.evaluate(() => {
    const bar = document.querySelector('[data-tabbar="1"]');
    const i = [...bar.children].findIndex(b => /hidden/i.test(b.textContent));
    if (i >= 0) bar.children[i].click();
  });
  await new Promise(r => setTimeout(r, 400));
  await page.evaluate(() => {
    const el = document.getElementById('hidden-panel');
    const tabs = [...el.querySelectorAll('button')].filter(b => !b.className.includes('hide-act'));
    if (tabs[1]) tabs[1].click();     // Visible: 57 rows, comfortably tall
  });
  await new Promise(r => setTimeout(r, 300));
  await page.evaluate(() => window.scrollTo(0, 1200));
  await new Promise(r => setTimeout(r, 200));
  const asyncBefore = await page.evaluate(() => window.scrollY);

  await page.evaluate(() => {
    lastLoadAt = 0;
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const dips = [];
  for (const at of [150, 400, 700, 1200, 2000, 3200]) {
    await new Promise(r => setTimeout(r, at - (dips.length ? dips[dips.length - 1].at : 0)));
    dips.push({ at, y: await page.evaluate(() => window.scrollY) });
  }
  const worst = Math.min(...dips.map(d => d.y));
  check('async-tab scroll never dips mid-refresh', worst >= asyncBefore - 2,
        `saved=${asyncBefore} samples=${dips.map(d => `${d.at}ms:${d.y}`).join(' ')}`);
  check('async-tab scroll preserved', Math.abs(dips[dips.length - 1].y - asyncBefore) <= 2,
        `${asyncBefore} -> ${dips[dips.length - 1].y}`);
  // The height pin must be temporary, or the page stays padded forever.
  const pinned = await page.evaluate(() => document.getElementById('content').style.minHeight);
  check('height pin released after repaint', !pinned, `minHeight="${pinned}"`);

  check('no uncaught page errors', errors.length === 0, errors.slice(0, 2).join(' | '));

  await browser.close();
  server.close();

  const failed = results.filter(r => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); server.close(); process.exit(2); });
