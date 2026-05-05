// Quick visual smoke-test for the gallery: capture homepage and play page screenshots.
// Usage: NODE_PATH=$(npm root -g) node Gallery/scripts/screenshot_gallery.js

const puppeteer = require('puppeteer');
const path = require('path');
const { execSync, spawn } = require('child_process');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const OUT  = path.join(ROOT, 'preview');
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  // Start a local static server
  const server = spawn('python3', ['-m', 'http.server', '8766'], { cwd: ROOT, stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1000));

  try {
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 900 });

    await page.goto('http://localhost:8766/', { waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 600));
    await page.screenshot({ path: path.join(OUT, 'home.png'), type: 'png' });
    console.log('captured home');

    await page.click('[data-tab="recent"]');
    await new Promise(r => setTimeout(r, 200));
    await page.screenshot({ path: path.join(OUT, 'recent.png'), type: 'png' });
    console.log('captured recent');

    await page.click('[data-tab="liked"]');
    await new Promise(r => setTimeout(r, 200));
    await page.screenshot({ path: path.join(OUT, 'liked-empty.png'), type: 'png' });
    console.log('captured liked-empty');

    // Like the first card by clicking the like button
    await page.click('[data-tab="all"]');
    await new Promise(r => setTimeout(r, 200));
    const likeBtn = await page.$('.card .vote.like');
    if (likeBtn) await likeBtn.click();
    await new Promise(r => setTimeout(r, 200));

    await page.click('[data-tab="liked"]');
    await new Promise(r => setTimeout(r, 200));
    await page.screenshot({ path: path.join(OUT, 'liked-with-one.png'), type: 'png' });
    console.log('captured liked-with-one');

    // Play page
    await page.goto('http://localhost:8766/play.html?slug=clean_sweep', { waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 1500));
    await page.screenshot({ path: path.join(OUT, 'play.png'), type: 'png' });
    console.log('captured play');

    await browser.close();
  } finally {
    server.kill();
  }

  console.log('\nScreenshots in', OUT);
})().catch(err => { console.error(err); process.exit(1); });
