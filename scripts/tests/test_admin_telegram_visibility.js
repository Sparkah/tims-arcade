// Browser regression harness for the unified website + Telegram visibility admin.
// All APIs are local stubs. This test never reads or mutates production data.
const path = require('path');
const http = require('http');
const fs = require('fs');

const WT = path.resolve(__dirname, '..', '..');
const PUPPETEER_REL = 'Shared/skills/game-factory/tools/node_modules/puppeteer';

function findPuppeteer(start) {
  let dir = start;
  for (let i = 0; i < 8; i += 1) {
    const candidate = path.join(dir, PUPPETEER_REL);
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`could not find ${PUPPETEER_REL} above ${start}`);
}

const puppeteer = require(findPuppeteer(WT));
const GAMES = [
  { slug: 'alpha', title: 'Alpha Run', hook: 'Play leader', num: 1, published: true },
  { slug: 'bravo', title: 'Bravo Blocked', hook: 'Like leader', num: 2, published: true },
  { slug: 'charlie', title: 'Charlie Chat', hook: 'Comment leader', num: 3, published: true },
  { slug: 'delta', title: 'Delta Drop', hook: 'Visible everywhere', num: 4, published: true },
  { slug: 'external_game', title: 'External Game', hook: 'Website only', num: 5, published: true, external: true },
  { slug: 'draft_game', title: 'Draft Game', hook: 'Not published', num: 6, published: false },
];
const COUNTS = {
  alpha: { plays: 100, likes: 2, comments: 1 },
  bravo: { plays: 20, likes: 90, comments: 2 },
  charlie: { plays: 30, likes: 3, comments: 80 },
  delta: { plays: 60, likes: 50, comments: 10 },
};

let hidden = new Set(['bravo']);
let failHiddenOnce = false;
let countsAvailable = true;
let telegramDelayMs = 0;
const hiddenResponseDelays = new Map();
let config = {
  version: 7,
  updatedAt: '2026-08-01T10:00:00.000Z',
  start: {
    headline: 'Welcome', body: '', showMegaton: true, showLibrary: true,
    gameSlugs: Array.from({ length: 20 }, (_, index) => `stale_start_${index + 1}`),
    primaryAction: { type: 'library', slug: '', label: 'Browse' },
  },
  top: { title: 'Hot', maxGames: 5, gameSlugs: ['delta'] },
  library: {
    mode: 'all', subtitle: 'Pick a game', includeSlugs: [], excludeSlugs: ['charlie'],
    pinnedSlugs: ['bravo'], maxGames: 180, hotLabel: 'Hot', pinnedLabel: 'Featured',
  },
  composer: { chatId: '@gamefactorytech', botProfile: 'prod', text: '', buttonText: '', buttonUrl: '', photoUrl: '' },
  relay: { enabled: false, broadcastUsers: false, sourceChatId: '', targetChatIds: [] },
};
const writes = { hidden: [], telegram: [] };

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); } catch (error) { reject(error); }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname === '/api/admin/catalogue') return json(res, 200, GAMES);
    if (url.pathname === '/api/counts') {
      return countsAvailable ? json(res, 200, COUNTS) : json(res, 503, { error: 'counts_unavailable' });
    }
    if (url.pathname === '/api/trending') return json(res, 200, { games: {} });
    if (url.pathname === '/api/admin/hidden' && req.method === 'GET') {
      return json(res, 200, { hidden: [...hidden], count: hidden.size });
    }
    if (url.pathname === '/api/admin/hidden' && req.method === 'POST') {
      const body = await readBody(req);
      if (failHiddenOnce) {
        failHiddenOnce = false;
        return json(res, 503, { error: 'curation_store_unavailable' });
      }
      body.hide ? hidden.add(body.slug) : hidden.delete(body.slug);
      writes.hidden.push(body);
      const response = { hidden: [...hidden], slug: body.slug, hidden_now: body.hide, count: hidden.size };
      const delay = hiddenResponseDelays.get(body.slug) || 0;
      hiddenResponseDelays.delete(body.slug);
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
      return json(res, 200, response);
    }
    if (url.pathname === '/api/admin/telegram-bot' && req.method === 'GET') {
      return json(res, 200, { ok: true, config });
    }
    if (url.pathname === '/api/admin/telegram-bot' && req.method === 'POST') {
      const body = await readBody(req);
      writes.telegram.push(body);
      if (body.expectedVersion !== config.version) {
        return json(res, 409, { error: 'telegram_bot_config_conflict' });
      }
      const delay = telegramDelayMs;
      telegramDelayMs = 0;
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
      config = { ...body.config, version: config.version + 1, updatedAt: new Date().toISOString() };
      return json(res, 200, { ok: true, config });
    }
    if (url.pathname === '/__force-conflict' && req.method === 'POST') {
      config = { ...config, version: config.version + 1 };
      return json(res, 200, { ok: true, version: config.version });
    }
    if (url.pathname === '/__fail-hidden-once' && req.method === 'POST') {
      failHiddenOnce = true;
      return json(res, 200, { ok: true });
    }
    if (url.pathname === '/__set-counts' && req.method === 'POST') {
      countsAvailable = url.searchParams.get('available') !== '0';
      return json(res, 200, { ok: true, countsAvailable });
    }
    if (url.pathname === '/__delay-telegram' && req.method === 'POST') {
      telegramDelayMs = Number(url.searchParams.get('ms')) || 250;
      return json(res, 200, { ok: true, telegramDelayMs });
    }
    if (url.pathname === '/__delay-hidden' && req.method === 'POST') {
      const slug = url.searchParams.get('slug') || '';
      const delay = Number(url.searchParams.get('ms')) || 250;
      hiddenResponseDelays.set(slug, delay);
      return json(res, 200, { ok: true, slug, delay });
    }
    if (url.pathname.startsWith('/api/')) return json(res, 200, {});

    const requested = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    const file = path.resolve(WT, requested);
    if (!file.startsWith(`${WT}${path.sep}`) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404);
      return res.end('not found');
    }
    const ext = path.extname(file);
    const type = ext === '.html' ? 'text/html' : ext === '.css' ? 'text/css' : ext === '.js' ? 'text/javascript' : 'application/octet-stream';
    res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' });
    return res.end(fs.readFileSync(file));
  } catch (error) {
    return json(res, 500, { error: error.message });
  }
});

const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  - ${detail}` : ''}`);
}

async function slugs(page) {
  return page.$$eval('.game-row', (rows) => rows.map((row) => row.dataset.slug));
}

async function setSelect(page, id, value) {
  await page.select(id, value);
  await page.waitForFunction((selector, expected) => document.querySelector(selector).value === expected, {}, id, value);
}

(async () => {
  await new Promise((resolve) => server.listen(8124, resolve));
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));

  await page.goto('http://localhost:8124/admin-telegram.html', { waitUntil: 'networkidle0' });
  await page.waitForSelector('.game-row[data-slug="draft_game"]');

  let shown = await slugs(page);
  check('authenticated full catalogue includes hidden and unpublished games', shown.length === GAMES.length, shown.join(','));
  const blocked = await page.$eval('.game-row[data-slug="bravo"]', (row) => ({
    web: row.querySelector('[data-role="website"]').checked,
    library: row.querySelector('[data-role="library"]').checked,
    text: row.textContent,
  }));
  check('website-hidden Telegram preference is visible as blocked', !blocked.web && blocked.library && blocked.text.includes('TG blocked by website'));
  const unsupported = await page.$eval('.game-row[data-slug="external_game"]', (row) => row.querySelector('[data-role="library"]').disabled);
  check('unsupported Telegram games cannot be selected', unsupported);
  const accessibleName = await page.$eval('.game-row[data-slug="charlie"] [data-role="library"]', (input) => input.getAttribute('aria-label'));
  check('row toggle accessible names include the game', accessibleName.includes('Charlie Chat') && accessibleName.includes('charlie'), accessibleName);

  await page.click('.game-row[data-slug="charlie"] [data-role="start"]');
  const cappedStart = await page.$eval('.game-row[data-slug="charlie"] [data-role="start"]', (input) => input.checked);
  const capStatus = await page.$eval('#status', (el) => el.textContent);
  check('placement caps reject a misleading 21st Start choice', !cappedStart && capStatus.includes('20-game storage limit'), capStatus);

  for (const [metric, expected] of [['plays', 'alpha'], ['likes', 'bravo'], ['comments', 'charlie']]) {
    await setSelect(page, '#gameSort', metric);
    shown = await slugs(page);
    check(`sort by ${metric}`, shown[0] === expected, shown.join(','));
  }
  await setSelect(page, '#gameSort', 'plays');
  shown = await slugs(page);
  check('metric ties fall back to newest game number', shown.indexOf('draft_game') < shown.indexOf('external_game'), shown.join(','));

  await page.evaluate(() => fetch('/__set-counts?available=0', { method: 'POST' }));
  await page.click('#reloadBtn');
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('engagement counts are unavailable'));
  const unavailableMetrics = await page.evaluate(() => ({
    sort: document.querySelector('#gameSort').value,
    disabled: [...document.querySelectorAll('#gameSort option')].filter((option) => ['plays', 'likes', 'comments'].includes(option.value)).every((option) => option.disabled),
    labels: [...document.querySelectorAll('.metric b')].map((el) => el.textContent),
  }));
  check('counts failure is visible and disables metric sorting', unavailableMetrics.sort === 'newest' && unavailableMetrics.disabled && unavailableMetrics.labels.every((label) => label === 'n/a'), JSON.stringify(unavailableMetrics));
  await page.evaluate(() => fetch('/__set-counts?available=1', { method: 'POST' }));
  await page.click('#reloadBtn');
  await page.waitForFunction(() => document.querySelector('#status.good')?.textContent.includes('Loaded website visibility'));

  await setSelect(page, '#visibilityFilter', 'website-hidden');
  shown = await slugs(page);
  check('website-hidden filter includes hidden and unpublished rows', shown.includes('bravo') && shown.includes('draft_game') && !shown.includes('alpha'), shown.join(','));
  await setSelect(page, '#visibilityFilter', 'telegram-hidden');
  shown = await slugs(page);
  check('Telegram-hidden filter includes blocked and excluded games', shown.includes('bravo') && shown.includes('charlie') && !shown.includes('alpha'), shown.join(','));
  await setSelect(page, '#visibilityFilter', 'different');
  shown = await slugs(page);
  check('difference filter isolates website-visible Telegram-hidden games', shown.length === 1 && shown[0] === 'charlie', shown.join(','));

  await setSelect(page, '#visibilityFilter', 'all');
  await page.evaluate(() => fetch('/__delay-hidden?slug=alpha&ms=250', { method: 'POST' }));
  await page.evaluate(() => {
    document.querySelector('.game-row[data-slug="alpha"] [data-role="website"]').click();
    document.querySelector('.game-row[data-slug="delta"] [data-role="website"]').click();
  });
  await page.waitForFunction(() => {
    const alpha = document.querySelector('.game-row[data-slug="alpha"] [data-role="website"]');
    const delta = document.querySelector('.game-row[data-slug="delta"] [data-role="website"]');
    return alpha && delta && !alpha.checked && !delta.checked && !alpha.disabled && !delta.disabled;
  });
  check('out-of-order website saves merge per-game responses without reverting newer changes', hidden.has('alpha') && hidden.has('delta'));
  await page.evaluate(() => {
    document.querySelector('.game-row[data-slug="alpha"] [data-role="website"]').click();
    document.querySelector('.game-row[data-slug="delta"] [data-role="website"]').click();
  });
  await page.waitForFunction(() => {
    const alpha = document.querySelector('.game-row[data-slug="alpha"] [data-role="website"]');
    const delta = document.querySelector('.game-row[data-slug="delta"] [data-role="website"]');
    return alpha && delta && alpha.checked && delta.checked && !alpha.disabled && !delta.disabled;
  });

  await page.click('.game-row[data-slug="bravo"] [data-role="website"]');
  await page.waitForFunction(() => {
    const row = document.querySelector('.game-row[data-slug="bravo"]');
    return row && row.textContent.includes('Website visible') && row.textContent.includes('Telegram visible');
  });
  const bravoWrite = writes.hidden.find((write) => write.slug === 'bravo' && write.hide === false);
  check('website toggle writes desired state immediately', Boolean(bravoWrite), JSON.stringify(writes.hidden));
  const websiteFocus = await page.evaluate(() => ({ role: document.activeElement.dataset.role, slug: document.activeElement.dataset.slug }));
  check('website toggle keeps keyboard focus after its save', websiteFocus.role === 'website' && websiteFocus.slug === 'bravo', JSON.stringify(websiteFocus));
  const cleanAfterWebsite = await page.$eval('#selectionDirty', (el) => el.textContent);
  check('website save does not create an unsaved Telegram change', cleanAfterWebsite === 'Telegram changes saved');

  await page.evaluate(() => fetch('/__fail-hidden-once', { method: 'POST' }));
  await page.$eval('.game-row[data-slug="alpha"] [data-role="website"]', (input) => input.click());
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('could not be saved'));
  const failedWebsiteToggle = await page.$eval('.game-row[data-slug="alpha"]', (row) => ({
    checked: row.querySelector('[data-role="website"]').checked,
    disabled: row.querySelector('[data-role="website"]').disabled,
    saving: row.classList.contains('saving'),
  }));
  check('failed website save restores an enabled previous state', failedWebsiteToggle.checked && !failedWebsiteToggle.disabled && !failedWebsiteToggle.saving, JSON.stringify(failedWebsiteToggle));

  await page.click('.game-row[data-slug="charlie"] [data-role="library"]');
  const dirtyBeforeSave = await page.$eval('#selectionDirty', (el) => el.textContent);
  check('Telegram toggles are clearly staged', dirtyBeforeSave.includes('not saved'));
  const telegramFocus = await page.evaluate(() => ({ role: document.activeElement.dataset.role, slug: document.activeElement.dataset.slug }));
  check('Telegram toggle keeps keyboard focus after rerender', telegramFocus.role === 'library' && telegramFocus.slug === 'charlie', JSON.stringify(telegramFocus));
  await page.evaluate(() => fetch('/__delay-telegram?ms=250', { method: 'POST' }));
  await page.click('#saveSelectionBtn');
  await setSelect(page, '#gameSort', 'likes');
  const lockedDuringSave = await page.$eval('.game-row[data-slug="charlie"] [data-role="library"]', (input) => ({ checked: input.checked, disabled: input.disabled }));
  await page.$eval('.game-row[data-slug="charlie"] [data-role="library"]', (input) => input.click());
  const afterLockedClick = await page.$eval('.game-row[data-slug="charlie"] [data-role="library"]', (input) => input.checked);
  check('rerendering during a save cannot recreate editable Telegram toggles', lockedDuringSave.checked && lockedDuringSave.disabled && afterLockedClick, JSON.stringify(lockedDuringSave));
  await page.waitForSelector('#selectionDirty.clean-note');
  const firstTelegramWrite = writes.telegram[0] || {};
  check('Telegram save carries the loaded version', firstTelegramWrite.expectedVersion === 7, JSON.stringify(firstTelegramWrite));
  check('Telegram save preserves the changed library choice', !firstTelegramWrite.config.library.excludeSlugs.includes('charlie'));

  await page.$eval('.game-row[data-slug="charlie"] [data-role="library"]', (input) => input.click());
  await page.evaluate(() => fetch('/__force-conflict', { method: 'POST' }));
  await page.click('#saveSelectionBtn');
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('changed in another session'));
  const conflictState = await page.$eval('#selectionDirty', (el) => el.textContent);
  check('stale Telegram save is rejected without discarding edits', conflictState.includes('not saved'));

  if (process.env.ADMIN_TELEGRAM_DESKTOP_SCREENSHOT) {
    await page.screenshot({ path: path.resolve(process.env.ADMIN_TELEGRAM_DESKTOP_SCREENSHOT), fullPage: true });
  }
  await page.setViewport({ width: 390, height: 844 });
  await new Promise((resolve) => setTimeout(resolve, 100));
  const mobile = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, width: innerWidth }));
  check('mobile layout has no horizontal page overflow', mobile.scrollWidth <= mobile.width + 1, `${mobile.scrollWidth}/${mobile.width}`);
  const mobileLinkHeight = await page.$eval('.game-link', (link) => link.getBoundingClientRect().height);
  check('mobile game links keep a 44px touch target', mobileLinkHeight >= 44, String(mobileLinkHeight));
  if (process.env.ADMIN_TELEGRAM_SCREENSHOT) {
    await page.screenshot({ path: path.resolve(process.env.ADMIN_TELEGRAM_SCREENSHOT), fullPage: true });
  }
  check('no uncaught browser errors', pageErrors.length === 0, pageErrors.join(' | '));

  await browser.close();
  server.close();
  const failed = results.filter((result) => !result.pass);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
})().catch((error) => {
  console.error('HARNESS ERROR', error);
  server.close();
  process.exit(2);
});
