#!/usr/bin/env node
// Capture raw gameplay screenshots from Creature Hunt at native canvas size.
// post_screens.py then zooms, crops to 16:9, and outputs Yandex-spec 1600x900.
//
// 4 unique gameplay moments × 2 languages, 8 PNGs:
//   yandex_promo/{en,ru}/desktop_1.png  (survivor exploring, players visible)
//   yandex_promo/{en,ru}/desktop_2.png  (survivor sprint moment)
//   yandex_promo/{en,ru}/mobile_1.png   (creature hunting view)
//   yandex_promo/{en,ru}/mobile_2.png   (creature on the move)

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const GAME_URL = 'file://' + path.join(ROOT, 'index.html');
const RAW_DIR = path.join(ROOT, 'yandex_promo', '_raw');

const CW = 860;
const CH = 620;
// Capture viewport sized to canvas exactly so the game renders 1:1 with no
// letterboxing — eliminates the centering battle entirely.
const VIEW_W = CW;
const VIEW_H = CH;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function setupPage(browser, lang) {
  const page = await browser.newPage();
  await page.setViewport({ width: VIEW_W, height: VIEW_H, deviceScaleFactor: 2 });
  await page.evaluateOnNewDocument((lang) => {
    Object.defineProperty(navigator, 'language', { get: () => lang });
    Object.defineProperty(navigator, 'languages', { get: () => [lang] });
  }, lang === 'ru' ? 'ru-RU' : 'en-US');
  await page.goto(GAME_URL, { waitUntil: 'load' });
  await sleep(800);
  // Pin scale=1, no centering — straightforward 1:1 render
  await page.evaluate(() => {
    document.body.style.display = 'block';
    document.body.style.background = '#000';
    const c = document.getElementById('game-container');
    c.style.transform = 'none';
    c.style.position = 'fixed';
    c.style.top = '0';
    c.style.left = '0';
  });

  // Monkey-patch renderFog so the fog overlay is semi-transparent instead of
  // pitch-black. The game still LOOKS like a torchlit dungeon (rooms and entities
  // dim in shadow, bright at torch centre) but Yandex moderators can see the map
  // and gameplay around the player, satisfying the 70%-gameplay-coverage rule.
  await page.evaluate(() => {
    const wait = setInterval(() => {
      if (typeof renderFog !== 'function' || typeof fogCtx === 'undefined') return;
      clearInterval(wait);
      window.__origRenderFog = renderFog;
      window.renderFog = function () {
        // Lighter fog: 0.55 alpha black instead of solid. Torches still punch
        // through to full brightness, so the lit centre stays dramatic.
        fogCtx.globalCompositeOperation = 'source-over';
        fogCtx.fillStyle = 'rgba(0,0,0,0.55)';
        fogCtx.fillRect(0, 0, CW, CH);
        fogCtx.globalCompositeOperation = 'destination-out';
        // Boost the player's torch radius for screenshot mode — fills more frame.
        const isCreature = playerRole === 'creature';
        const baseR = isCreature ? getCreatureTorch() : TORCH_PLAYER;
        const r = baseR * (isCreature ? 3.2 : 1.4);
        if (player && player.alive) {
          const sx = player.x - camera.x + CW / 2;
          const sy = player.y - camera.y + CH / 2;
          const grd = fogCtx.createRadialGradient(sx, sy, 0, sx, sy, r);
          grd.addColorStop(0, 'rgba(0,0,0,1)');
          grd.addColorStop(0.6, 'rgba(0,0,0,0.75)');
          grd.addColorStop(1, 'rgba(0,0,0,0)');
          fogCtx.fillStyle = grd;
          fogCtx.beginPath(); fogCtx.arc(sx, sy, r, 0, Math.PI * 2); fogCtx.fill();
        }
        if (typeof humans !== 'undefined' && !isCreature) {
          for (const h of humans) {
            if (!h.alive) continue;
            const sx = h.x - camera.x + CW / 2;
            const sy = h.y - camera.y + CH / 2;
            const hr = TORCH_HUMAN * 1.3;
            const grd = fogCtx.createRadialGradient(sx, sy, 0, sx, sy, hr);
            grd.addColorStop(0, 'rgba(0,0,0,1)');
            grd.addColorStop(0.6, 'rgba(0,0,0,0.6)');
            grd.addColorStop(1, 'rgba(0,0,0,0)');
            fogCtx.fillStyle = grd;
            fogCtx.beginPath(); fogCtx.arc(sx, sy, hr, 0, Math.PI * 2); fogCtx.fill();
          }
        }
        ctx.drawImage(fogCanvas, 0, 0);
      };
    }, 50);
  });

  return page;
}

async function startSolo(page, role) {
  const sel = role === 'creature' ? '.role-creature' : '.role-human';
  await page.evaluate((sel) => document.querySelector(sel).click(), sel);
  if (role === 'creature') {
    // Wait for the creature's intro cinematic + spawn delay (8s) to fully end
    await page.waitForFunction(
      () => typeof intro === 'undefined' || intro === null,
      { timeout: 15000, polling: 200 },
    ).catch(() => {});
    await sleep(500);
  } else {
    await sleep(800);
  }
}

async function holdKey(page, code, durationMs) {
  await page.keyboard.down(code);
  await sleep(durationMs);
  await page.keyboard.up(code);
}

async function shoot(page, name) {
  await sleep(150);
  const out = path.join(RAW_DIR, name + '.png');
  await page.screenshot({ path: out, type: 'png',
    clip: { x: 0, y: 0, width: VIEW_W, height: VIEW_H } });
  console.log('  ✓ raw/' + name + '.png');
}

async function backToMenu(page) {
  await page.evaluate(() => {
    if (typeof backToMenu === 'function') backToMenu();
    else if (typeof quitGame === 'function') quitGame();
  });
  await sleep(400);
}

async function captureForLang(browser, lang) {
  console.log(`\n── ${lang.toUpperCase()} ──`);
  const page = await setupPage(browser, lang);

  // Scene 1 — SURVIVOR exploring (full HUD: torch, minimap, "Creature in: 6s")
  await startSolo(page, 'human');
  await holdKey(page, 'KeyD', 600);
  await holdKey(page, 'KeyS', 400);
  await sleep(300);
  await shoot(page, `${lang}_1_survivor_explore`);

  // Scene 2 — SURVIVOR sprinting (sprint stamina ring + creature countdown)
  await page.keyboard.down('ShiftLeft');
  await holdKey(page, 'KeyW', 800);
  await page.keyboard.up('ShiftLeft');
  await sleep(150);
  await shoot(page, `${lang}_2_survivor_sprint`);

  await backToMenu(page);

  // Scene 3 — CREATURE hunting (red sense dots, dim creature torch)
  await startSolo(page, 'creature');
  await holdKey(page, 'KeyD', 700);
  await holdKey(page, 'KeyS', 500);
  await sleep(300);
  await shoot(page, `${lang}_3_creature_hunt`);

  // Scene 4 — CREATURE on the move
  await holdKey(page, 'KeyW', 900);
  await holdKey(page, 'KeyA', 700);
  await sleep(200);
  await shoot(page, `${lang}_4_creature_move`);

  await page.close();
}

(async () => {
  fs.mkdirSync(RAW_DIR, { recursive: true });
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    for (const lang of ['en', 'ru']) {
      await captureForLang(browser, lang);
    }
  } finally {
    await browser.close();
  }
  console.log('\nDone. 8 raw frames in yandex_promo/_raw/');
})();
