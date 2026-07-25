#!/usr/bin/env node
/**
 * Custom screenshot pipeline for Satisfying Spill — drag-only game means
 * keyboard actions don't apply. We seed the board via _setupForScreenshot
 * which lands directly in PLAYING with a partially-mopped puddle layout.
 *
 * Output: 8 PNGs at 1600x900 in yandex_promo/:
 *   desktop_en_1.png, desktop_en_2.png, desktop_ru_1.png, desktop_ru_2.png,
 *   mobile_en_1.png,  mobile_en_2.png,  mobile_ru_1.png,  mobile_ru_2.png
 */

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const gameDir = path.resolve(process.argv[2] || '.');
const GAME = path.resolve(gameDir, 'index.html');
const OUT  = path.resolve(gameDir, 'yandex_promo');
if (!fs.existsSync(GAME)) { console.error('Not found: ' + GAME); process.exit(1); }
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

async function shoot(page, name) {
  const gs = await page.evaluate(() => {
    try { return (window.__gfState && window.__gfState().gs) || null; } catch { return null; }
  });
  const FORBIDDEN = ['MENU', 'GAMEOVER', 'WIN', 'WON', 'LEVELEND', 'ROUNDEND', 'INTRO', 'TITLE'];
  if (gs && FORBIDDEN.includes(String(gs).toUpperCase())) {
    console.warn(`  skipping ${name} - gs="${gs}" violates Yandex 5.1.1`);
    return false;
  }
  await page.screenshot({ path: path.join(OUT, `${name}.png`), type: 'png' });
  console.log(`  captured ${name} (gs=${gs})`);
  return true;
}

async function dragPath(page, cells) {
  // cells: array of {x,y} viewport coords; performs a smooth mouse drag through them
  if (cells.length === 0) return;
  await page.mouse.move(cells[0].x, cells[0].y);
  await page.mouse.down();
  for (let i = 1; i < cells.length; i++) {
    await page.mouse.move(cells[i].x, cells[i].y, { steps: 4 });
    await new Promise(r => setTimeout(r, 40));
  }
  await page.mouse.up();
}

async function run() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-web-security', '--allow-file-access-from-files'],
  });

  const cases = [
    { name: 'desktop_en', lang: 'en' },
    { name: 'desktop_ru', lang: 'ru' },
    { name: 'mobile_en',  lang: 'en' },
    { name: 'mobile_ru',  lang: 'ru' },
  ];

  for (const c of cases) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1 });
    await page.evaluateOnNewDocument((l) => {
      Object.defineProperty(navigator, 'language',  { get: () => l === 'ru' ? 'ru-RU' : 'en-US' });
      Object.defineProperty(navigator, 'languages', { get: () => l === 'ru' ? ['ru-RU','ru'] : ['en-US','en'] });
    }, c.lang);

    page.on('pageerror', err => console.error(`[page error] ${c.name}:`, err.message));

    await page.goto(`file://${GAME}`, { waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 3500));

    await page.evaluate((l) => {
      if (typeof window._setLang === 'function') window._setLang(l);
      if (typeof window._setupForScreenshot === 'function') {
        window._setupForScreenshot(1);
      } else if (typeof window._jumpLevel === 'function') {
        window._jumpLevel(2);
      }
    }, c.lang);
    await new Promise(r => setTimeout(r, 600));

    // Shot 1: setup state captured fresh
    await shoot(page, `${c.name}_1`);

    // Re-setup for variant 2 (different round seed) and do a partial drag
    // before capture so the trail/score moves.
    await page.evaluate(() => {
      if (typeof window._setupForScreenshot === 'function') window._setupForScreenshot(2);
    });
    await new Promise(r => setTimeout(r, 400));

    // Perform a drag through several center cells to leave a trail.
    await dragPath(page, [
      { x: 600, y: 470 },
      { x: 700, y: 470 },
      { x: 800, y: 470 },
      { x: 900, y: 470 },
    ]);
    await new Promise(r => setTimeout(r, 600));
    // _setupForScreenshot may have ended after tickWorld -> ROUNDEND/GAMEOVER.
    // Re-seed if so.
    const gsNow = await page.evaluate(() => (window.__gfState && window.__gfState().gs) || null);
    if (gsNow !== 'PLAYING') {
      await page.evaluate(() => { if (typeof window._setupForScreenshot === 'function') window._setupForScreenshot(3); });
      await new Promise(r => setTimeout(r, 500));
    }
    await shoot(page, `${c.name}_2`);

    await page.close();
  }

  await browser.close();

  console.log('\nDone:');
  fs.readdirSync(OUT)
    .filter(f => f.endsWith('.png') && f.match(/_(desktop|mobile)_/))
    .sort()
    .forEach(f => console.log('  ' + path.join(OUT, f)));
}

run().catch(err => { console.error(err); process.exit(1); });
