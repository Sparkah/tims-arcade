#!/usr/bin/env node
/** Browser regression: creator admin preserves and edits arbitrary world sizes. */

const fs = require('fs');
const http = require('http');
const path = require('path');

const GALLERY = path.resolve(__dirname, '..');
function findAgentsRoot(start) {
  if (process.env.AGENTS_ROOT) return path.resolve(process.env.AGENTS_ROOT);
  let current = path.resolve(start);
  while (current !== path.dirname(current)) {
    if (fs.existsSync(path.join(current, 'Shared', 'skills'))) return current;
    current = path.dirname(current);
  }
  throw new Error('Could not locate the Agents workspace root');
}
const AGENTS_ROOT = findAgentsRoot(GALLERY);
const puppeteer = require(path.join(AGENTS_ROOT, 'Shared', 'skills', 'game-factory', 'tools', 'node_modules', 'puppeteer'));
const ID = '41df96fb1c34af1026252b936bda6cc3';
const LEVELS = [{
  name:'Moonlit Steps', width:1520, height:720,
  player:{ x:90, y:620 }, goal:{ x:1435, y:620 },
  objects:[
    { id:'climate1', type:'climate', x:0, y:0, w:1520, h:720, value:18, label:'Cool night' },
    { id:'camera1', type:'camera', x:720, y:140, w:430, h:28, value:-0.35, label:'Iris One' },
  ],
  notes:'custom world',
}];

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'content-type':type, 'cache-control':'no-store' });
  res.end(body);
}

async function main() {
  const html = fs.readFileSync(path.join(GALLERY, 'creator-admin.html'), 'utf8');
  let resolveSave;
  const saved = new Promise(resolve => { resolveSave = resolve; });
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname === '/creator-admin') return send(res, 200, html, 'text/html; charset=utf-8');
    if (url.pathname === '/api/me/creation-admin' && req.method === 'GET') {
      return send(res, 200, JSON.stringify({
        ok:true,
        game:{ id:ID, title:'Coldscale', versionName:'Coldscale v2', owner:true, playUrl:`/cplay?id=${ID}` },
        schema:'game-factory-generic-levels-v1', levels:LEVELS, history:[], source:'embedded-seed', updatedTs:1,
      }));
    }
    if (url.pathname === '/api/me/creation-admin' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        const parsed = JSON.parse(body);
        if (parsed.action === 'save-levels') resolveSave(parsed);
        send(res, 200, JSON.stringify({ ok:true, levels:parsed.levels ? parsed.levels.length : 0, updatedTs:2 }));
      });
      return;
    }
    return send(res, 404, 'not found', 'text/plain; charset=utf-8');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));

  let browser;
  try {
    browser = await puppeteer.launch({ headless:'new', args:['--no-sandbox'], protocolTimeout:120000 });
    const page = await browser.newPage();
    await page.setViewport({ width:1280, height:900, deviceScaleFactor:1 });
    await page.goto(`http://127.0.0.1:${server.address().port}/creator-admin?id=${ID}`, { waitUntil:'load', timeout:30000 });
    await page.waitForFunction(() => document.querySelector('#status') && /Loaded 1 level/.test(document.querySelector('#status').textContent || ''), { timeout:5000 });
    const before = await page.evaluate(() => {
      const canvas = document.querySelector('#field');
      return { width:canvas.width, height:canvas.height, aspect:canvas.style.getPropertyValue('--level-aspect'), preview:JSON.parse(document.querySelector('#jsonPreview').value) };
    });
    if (before.width !== 720 || before.height !== 341 || !/1520\s*\/\s*720/.test(before.aspect)) throw new Error(`wrong canvas projection: ${JSON.stringify(before)}`);
    if (before.preview.levels[0].objects[0].type !== 'climate' || before.preview.levels[0].objects[1].value !== -0.35) throw new Error('custom data changed on load');

    await page.click('[data-tool="player"]');
    const box = await page.$eval('#field', canvas => { const r = canvas.getBoundingClientRect(); return { x:r.left, y:r.top, w:r.width, h:r.height }; });
    await page.mouse.click(box.x + box.w / 2, box.y + box.h / 2);
    await page.click('#saveLevels');
    const payload = await Promise.race([saved, new Promise((_, reject) => setTimeout(() => reject(new Error('save timeout')), 5000))]);
    const level = payload.levels[0];
    if (Math.abs(level.player.x - 760) > 2 || Math.abs(level.player.y - 360) > 2) throw new Error(`pointer/world mapping failed: ${JSON.stringify(level.player)}`);
    if (level.width !== 1520 || level.height !== 720 || level.objects[0].type !== 'climate' || level.objects[1].value !== -0.35) throw new Error('save changed custom level semantics');
    console.log('PASS creator-admin worlds:', JSON.stringify({ canvas:{ width:before.width, height:before.height, aspect:before.aspect }, player:level.player, types:level.objects.map(o => o.type) }));
  } finally {
    if (browser) await browser.close().catch(() => {});
    await new Promise(resolve => server.close(resolve));
  }
}

main().catch(err => {
  console.error('FAIL creator-admin worlds:', err.message);
  process.exit(1);
});
