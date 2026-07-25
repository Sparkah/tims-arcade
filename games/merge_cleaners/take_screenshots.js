#!/usr/bin/env node
/**
 * Yandex screenshot capture for Merge Guns — fixes the 5.1.1 rejection
 * (gameplay area must be ≥70% of frame). The previous shots included the
 * menu screen which has ~80% empty dark space. This script:
 *
 *   1. Loads the game
 *   2. Clicks the "START AT WAVE 10" fast-start button to land directly
 *      on a populated battlefield (full grid + enemies + HUD)
 *   3. Optionally clicks BUY GUN a few times to fill more grid slots
 *   4. Captures 8 PNGs at the canonical sizes:
 *        desktop_en_{1,2}.png, desktop_ru_{1,2}.png,
 *        mobile_en_{1,2}.png,  mobile_ru_{1,2}.png
 *
 * Output replaces the *_menu.png shots which were the violation.
 *
 * Usage: node take_screenshots.js
 */

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const GAME_DIR = __dirname;
const GAME_HTML = path.join(GAME_DIR, 'index.html');
const OUT_DIR = path.join(GAME_DIR, 'yandex_promo');
if (!fs.existsSync(GAME_HTML)) { console.error('No index.html'); process.exit(1); }

// Merge Guns is landscape-locked; portrait mobile viewports give massive
// black bars top/bottom (Yandex 5.1.1 violation). All shots go in landscape;
// the "mobile" variants use a smaller landscape size that maps to mobile-
// landscape on Yandex's listing. Old `*_menu*` shots are deleted at start
// since they were the original 5.1.1 violation.
const VARIANTS = [
  { name: 'desktop_en_1', w: 1600, h: 900,  lang: 'en' },
  { name: 'desktop_en_2', w: 1600, h: 900,  lang: 'en', extraBuy: 4 },
  { name: 'desktop_ru_1', w: 1600, h: 900,  lang: 'ru' },
  { name: 'desktop_ru_2', w: 1600, h: 900,  lang: 'ru', extraBuy: 4 },
  { name: 'mobile_en_1',  w: 1280, h: 720,  lang: 'en' },
  { name: 'mobile_en_2',  w: 1280, h: 720,  lang: 'en', extraBuy: 3 },
  { name: 'mobile_ru_1',  w: 1280, h: 720,  lang: 'ru' },
  { name: 'mobile_ru_2',  w: 1280, h: 720,  lang: 'ru', extraBuy: 3 },
];

// Wipe the old non-compliant *_menu / *_grid / *_wave shots before re-shooting.
for (const f of fs.readdirSync(OUT_DIR)) {
  if (/_(menu|grid|wave)\.png$/i.test(f)) {
    try { fs.unlinkSync(path.join(OUT_DIR, f)); } catch {}
  }
}

async function captureOne(variant) {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: variant.w, height: variant.h, deviceScaleFactor: 1 });

  await page.evaluateOnNewDocument((lang) => {
    try { localStorage.setItem('lang', lang); } catch {}
  }, variant.lang);
  await page.goto('file://' + GAME_HTML, { waitUntil: 'networkidle0', timeout: 20000 });
  await new Promise(r => setTimeout(r, 1500)); // give the SDK timeout + game loop time to wire up

  // Use the screenshot escape hatch the game exposes — lands directly on
  // a populated mid-wave state. Higher wave numbers spawn more enemies
  // simultaneously, which is what the 70%-gameplay rule needs us to show.
  const waveTarget = variant.extraBuy ? 8 : 6;
  await page.evaluate((lang, wave) => {
    if (typeof window._setLang === 'function') window._setLang(lang);
    if (typeof window._setupForScreenshot === 'function') window._setupForScreenshot(wave);
  }, variant.lang, waveTarget);

  // Variant 2: buy MORE guns post-setup so both grid + battlefield are dense
  if (variant.extraBuy) {
    await new Promise(r => setTimeout(r, 300));
    for (let i = 0; i < variant.extraBuy; i++) {
      await page.evaluate(() => { if (typeof window.buyGun === 'function') window.buyGun(); });
      await new Promise(r => setTimeout(r, 80));
    }
  }

  // Wait long enough for enemy spawns to populate the right side. At wave
  // 6-8 the spawn rate is dense, so 5s gives a frame with ~4-8 enemies on
  // screen + projectile trails — that's the 70%-gameplay shot we need.
  await new Promise(r => setTimeout(r, 5500));

  const out = path.join(OUT_DIR, `${variant.name}.png`);
  await page.screenshot({ path: out, fullPage: false });
  console.log(`  ✓ ${variant.name}.png (${variant.w}×${variant.h}, lang=${variant.lang})`);
  await browser.close();
}

(async () => {
  console.log(`▶ Capturing ${VARIANTS.length} Merge Guns screenshots`);
  for (const v of VARIANTS) {
    try { await captureOne(v); }
    catch (e) { console.error(`  ✗ ${v.name}: ${e.message}`); }
  }
})();
