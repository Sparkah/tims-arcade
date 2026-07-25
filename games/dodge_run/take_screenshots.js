#!/usr/bin/env node
/**
 * Daily Dodge has a low early-game spawn rate, so the generic factory
 * screenshot tool catches a sparse arena. This script waits 8–14s into a run
 * (where the difficulty curve has bullets on screen) and lets the player
 * dodge a bit so the action is visible.
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

async function dodgeFor(page, ms) {
  const dirs = ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'];
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const d = dirs[Math.floor(Math.random() * 4)];
    await page.keyboard.down(d);
    await new Promise(r => setTimeout(r, 200 + Math.random() * 200));
    await page.keyboard.up(d);
  }
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
    await page.evaluate((l) => { window._setLang(l); }, c.lang);

    // Enable invincibility so the screenshot run can't end mid-capture, then start the run
    await page.evaluate(() => { window._invincible = true; window._jumpLevel(1); });

    // Dodge for ~9 seconds — bullets should be filling the screen by then
    await dodgeFor(page, 9000);
    await shoot(page, `${c.name}_1`);

    // Continue dodging for another 4 seconds (~mid-difficulty)
    await dodgeFor(page, 4000);
    await shoot(page, `${c.name}_2`);

    await page.close();
  }

  await browser.close();

  console.log('\nDone:');
  fs.readdirSync(OUT).filter(f => f.endsWith('.png')).sort().forEach(f => console.log('  ' + path.join(OUT, f)));
}

run().catch(err => { console.error(err); process.exit(1); });
