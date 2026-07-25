const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const BASE = 'http://localhost:8095/arms.html';
const OUT  = path.join(__dirname, 'screenshots');
fs.mkdirSync(OUT, { recursive: true });

const DESKTOP = { width: 1600, height: 900 };
// Yandex upload validator requires 16:9 for ALL screenshot slots — 9:16 is rejected

async function shot(page, name) {
  await page.screenshot({ path: path.join(OUT, name), type: 'png' });
  console.log('saved', name);
}

async function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

async function makePage(browser, viewport) {
  const page = await browser.newPage();
  await page.setViewport(viewport);
  await page.setRequestInterception(true);
  page.on('request', req => {
    if (req.url().includes('sdk.js')) req.respond({ status: 200, contentType: 'text/javascript', body: '' });
    else req.continue();
  });
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('arms_tips', JSON.stringify({
      partshop: true, build: true, deploy: true, upgrades: true
    }));
  });
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await wait(800);
  return page;
}

async function run() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    protocolTimeout: 120000,
  });

  // ── DESKTOP 1: Build screen ────────────────────────────────────────────────
  {
    const page = await makePage(browser, DESKTOP);
    await page.evaluate(() => {
      partsStash = { barrel:3, trigger:2, stock:2, scope:1, magazine:1, silencer:1, blueprint:2 };
      buildOrders[0].filled = [buildOrders[0].parts[0]];
      coins = 480; tutActive = false; selectedPart = null;
    });
    await wait(200);
    await shot(page, 'desktop_1_build.png');
    await page.close();
  }

  // ── DESKTOP 2: Battle with multiple enemies ────────────────────────────────
  {
    const page = await makePage(browser, DESKTOP);
    await page.evaluate(() => {
      builtWeapons = ['SNIPER', 'RIFLE', 'SHOTGUN'];
      initDeploy();
      deployGrid = [
        { weapon: 'SNIPER',  nx: 0.40, ny: 0.25 },
        { weapon: 'RIFLE',   nx: 0.32, ny: 0.50 },
        { weapon: 'SHOTGUN', nx: 0.22, ny: 0.75 },
      ];
      deployPool = [];
      startBattle();
      // Force-spawn a wave of enemies immediately
      zombiesToSpawn = 6; zombiesSpawned = 0; spawnTimer = 0; spawnInterval = 0.15;
    });
    await wait(3000); // let combat develop
    await shot(page, 'desktop_2_battle.png');
    await page.close();
  }

  // ── DESKTOP 3: Deploy screen ──────────────────────────────────────────────
  {
    const page = await makePage(browser, DESKTOP);
    await page.evaluate(() => {
      builtWeapons = ['SHOTGUN', 'SMG', 'RIFLE', 'SNIPER'];
      initDeploy();
      deployGrid = [
        { weapon: 'SHOTGUN', nx: 0.18, ny: 0.30 },
        { weapon: 'RIFLE',   nx: 0.30, ny: 0.60 },
        { weapon: 'SNIPER',  nx: 0.22, ny: 0.80 },
      ];
      deployPool = ['SMG'];
      deploySel = null;
    });
    await wait(200);
    await shot(page, 'desktop_3_deploy.png');
    await page.close();
  }

  // ── DESKTOP 4: Shop upgrades tab ─────────────────────────────────────────
  {
    const page = await makePage(browser, DESKTOP);
    await page.evaluate(() => {
      level = 3; coins = 350;
      upgrades = { scavenge: true };
      isDefeatShop = false;
      shopTab = 'upgrades';
      STATE = 'partshop';
    });
    await wait(200);
    await shot(page, 'desktop_4_upgrades.png');
    await page.close();
  }

  await browser.close();
  console.log('Done →', OUT);
}

run().catch(e => { console.error(e); process.exit(1); });
