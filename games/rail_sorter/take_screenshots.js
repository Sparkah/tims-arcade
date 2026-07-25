#!/usr/bin/env node
/**
 * Custom screenshot pipeline for Rail Tycoon — drags can't be replayed easily,
 * so we expose rails directly via the game's closure (already _jumpLevel does
 * the level setup; we additionally pre-build a connected network programmatically
 * by injecting rails after level start).
 */

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const GAME = path.resolve(__dirname, 'index.html');
const OUT  = path.resolve(__dirname, 'yandex_promo');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

async function shoot(page, name) {
  await page.screenshot({ path: path.join(OUT, `${name}.png`), type: 'png' });
  console.log(`  captured ${name}`);
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
    await new Promise(r => setTimeout(r, 3500)); // wait past SDK boot

    await page.evaluate((l) => { window._setLang(l); }, c.lang);

    // jump to level 5: nStations=5, nColors=4 — busy enough to fill the frame
    await page.evaluate(() => { window._jumpLevel(5); });
    await new Promise(r => setTimeout(r, 600));

    // The game uses an IIFE — the `rails` array is in closure. We can't push to it directly.
    // Instead, we simulate drag events from station to station via mouse.
    // Get station positions
    const stationsXY = await page.evaluate(() => {
      // Read stations from the closure: try to find them via the canvas
      // We exposed _jumpLevel which calls startLevel which populates stations.
      // To inspect them we add a debug helper post-build.
      return null; // placeholder
    });

    // Drag rail: station 0 → station 1, station 1 → station 2, station 2 → station 3, etc.
    // We use a circular pattern of station positions: angles (i / n) * 2pi - pi/2
    // Center: (W/2, HUD_pad + ah/2). Need to compute these in-page.
    const stationPositions = await page.evaluate(() => {
      const W = window.innerWidth, H = window.innerHeight;
      const HUD_H = 56, S = Math.min(W/800, H/600);
      const pad = HUD_H * S + 60*S;
      const aw = W - 80*S, ah = H - pad - 60*S;
      const cxp = W/2, cyp = pad + ah/2;
      const rx = aw * 0.42, ry = ah * 0.42;
      // level 5 → nStations = Math.min(7, 3 + Math.floor(5/2)) = 5
      const n = 5;
      const arr = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 - Math.PI/2;
        arr.push({ x: cxp + Math.cos(a) * rx, y: cyp + Math.sin(a) * ry });
      }
      return arr;
    });

    // Drag rails: 0→1, 1→2, 2→3, 3→4, 4→0 (full ring) plus 0→2 cross
    const dragPairs = [[0,1],[1,2],[2,3],[3,4],[4,0],[0,2]];
    for (const [a, b] of dragPairs) {
      const sa = stationPositions[a], sb = stationPositions[b];
      await page.mouse.move(sa.x, sa.y);
      await page.mouse.down();
      // smooth move — puppeteer's drag works via separate mousemove
      const steps = 15;
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        await page.mouse.move(sa.x + (sb.x - sa.x) * t, sa.y + (sb.y - sa.y) * t);
      }
      await page.mouse.up();
      await new Promise(r => setTimeout(r, 100));
    }

    // Wait for cargo to spawn and travel along rails (but NOT long enough to hit profit target)
    await new Promise(r => setTimeout(r, 1500));

    // Shot 1: cargo en route between stations
    await shoot(page, `${c.name}_1`);

    // Shot 2: a bit later — more cargo, mid-action, BEFORE level completes
    await new Promise(r => setTimeout(r, 700));
    await shoot(page, `${c.name}_2`);

    await page.close();
  }

  await browser.close();

  console.log('\nDone:');
  fs.readdirSync(OUT).filter(f => f.endsWith('.png')).sort().forEach(f => console.log('  ' + path.join(OUT, f)));
}

run().catch(err => { console.error(err); process.exit(1); });
