// Ice Sweeper must produce audible MUSIC from the FIRST gesture, whatever the
// network does. Four fault modes, because the first implementation only handled
// two of them:
//
//   404            -> settles, fallback fired          (was already fine)
//   corrupt bytes  -> settles, fallback fired          (was already fine)
//   stalled fetch  -> NEVER settles, so neither branch ran: silent for the whole
//                     session, and MUS.on was already true so no gesture retried
//   slow (200 OK)  -> succeeded eventually, but measured 13.7s of silence first
//
// The fix starts the procedural bed immediately and swaps to the file on decode,
// so "time to first sound" is ~0 in every mode.
//
// Attributing the sound is the whole difficulty. An earlier version of this test
// counted every oscillator on every AudioContext, which the click that unlocks
// audio satisfies on its own: it would have passed with the music completely
// broken. The game gives us two clean discriminators:
//
//   * SFX builds its OWN AudioContext, separate from MUS.ctx.
//   * The music file source sets `loop = true`; SFX one-shots never do.
//   * The procedural bed keeps scheduling notes; SFX only fires on events.
//
// So we tag every node with the context that made it, then identify the music
// context as the one holding a looping buffer source (file took over) or the one
// still creating oscillators during a quiet window with no input (bed running).
// "First sound" is then measured on THAT context only. MUS lives inside the
// page's IIFE, so its state cannot simply be read off window.
const fs = require('fs');
const path = require('path');
const http = require('http');

const GALLERY = path.resolve(__dirname, '..', '..');
const GAME = path.join(GALLERY, 'games', 'ice_sweeper');

const REL = 'Shared/skills/game-factory/tools/node_modules/puppeteer';
let dir = GALLERY, found = null;
for (let i = 0; i < 8 && !found; i++) {
  const c = path.join(dir, REL);
  if (fs.existsSync(c)) found = c;
  dir = path.dirname(dir);
}
const puppeteer = require(found);

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.mp3': 'audio/mpeg', '.png': 'image/png', '.css': 'text/css' };

// mode: ok | 404 | corrupt | stall
function makeServer(mode) {
  return http.createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname.replace(/^\//, '')) || 'index.html';
    if (rel === 'sdk.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); return res.end('window.GameFactorySDK={};'); }

    if (rel.endsWith('bg_loop.mp3')) {
      if (mode === '404') { res.writeHead(404); return res.end('nope'); }
      if (mode === 'corrupt') { res.writeHead(200, { 'content-type': 'audio/mpeg' }); return res.end(Buffer.from('not an mp3 at all')); }
      if (mode === 'stall') { res.writeHead(200, { 'content-type': 'audio/mpeg' }); return; }  // headers, then nothing, forever
    }

    const f = path.join(GAME, rel);
    if (!f.startsWith(GAME) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('nf'); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(fs.readFileSync(f));
  });
}

const results = [];
const check = (n, p, d = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`); };

async function run(mode, port) {
  const server = makeServer(mode);
  await new Promise(r => server.listen(port, r));
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 600 });

  // Tag every source node with the context that created it, so sound can be
  // attributed to an engine rather than merely detected.
  await page.evaluateOnNewDocument(() => {
    window.__a = { ctxSeq: 0, events: [], bufNodes: [], gestureAt: null };
    const OrigCtx = window.AudioContext || window.webkitAudioContext;
    const W = function (...a) {
      const c = new OrigCtx(...a);
      const id = ++window.__a.ctxSeq;
      const oo = c.createOscillator.bind(c), ob = c.createBufferSource.bind(c);
      c.createOscillator = function () {
        window.__a.events.push({ ctx: id, kind: 'osc', t: Date.now() });
        return oo();
      };
      c.createBufferSource = function () {
        const n = ob();
        window.__a.events.push({ ctx: id, kind: 'buf', t: Date.now() });
        window.__a.bufNodes.push({ ctx: id, node: n });   // .loop is set right after creation
        return n;
      };
      return c;
    };
    W.prototype = OrigCtx.prototype;
    window.AudioContext = W; window.webkitAudioContext = W;

    // Which context is the music? The one with a looping buffer source (the file
    // took over), else the one still creating nodes after `since` (the bed is
    // running while nothing is triggering SFX).
    window.__musicCtx = (since) => {
      const looping = window.__a.bufNodes.find(b => { try { return b.node.loop === true; } catch (e) { return false; } });
      if (looping) return { id: looping.ctx, why: 'looping buffer source' };
      const tally = {};
      for (const e of window.__a.events) if (e.t >= since) tally[e.ctx] = (tally[e.ctx] || 0) + 1;
      const best = Object.entries(tally).sort((a, b) => b[1] - a[1])[0];
      return best && best[1] >= 4 ? { id: +best[0], why: `${best[1]} nodes in the quiet window` } : null;
    };
  });

  await page.goto(`http://localhost:${port}/index.html`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await new Promise(r => setTimeout(r, 1200));

  await page.evaluate(() => { window.__a.gestureAt = Date.now(); });
  await page.mouse.click(450, 300);                      // first gesture unlocks audio
  await new Promise(r => setTimeout(r, 2500));

  // Quiet window: no further input, so anything still being created is music.
  const quietFrom = await page.evaluate(() => Date.now());
  await new Promise(r => setTimeout(r, 4000));

  const out = await page.evaluate((qf) => {
    const m = window.__musicCtx(qf);
    if (!m) return { music: null };
    const mine = window.__a.events.filter(e => e.ctx === m.id);
    const first = mine.length ? Math.min(...mine.map(e => e.t)) : null;
    const looping = window.__a.bufNodes.some(b => { try { return b.ctx === m.id && b.node.loop === true; } catch (e) { return false; } });
    return {
      music: m.why,
      ms: first === null ? null : first - window.__a.gestureAt,
      total: mine.length,
      quiet: mine.filter(e => e.t >= qf).length,
      looping,
      otherCtxNodes: window.__a.events.filter(e => e.ctx !== m.id).length,
    };
  }, quietFrom);

  await browser.close();
  await new Promise(r => server.close(r));
  return out;
}

(async () => {
  for (const [mode, port, expectFile] of [['ok', 8141, true], ['404', 8142, false], ['corrupt', 8143, false], ['stall', 8144, false]]) {
    const r = await run(mode, port);

    check(`[${mode}] the music engine actually ran`, r.music !== null,
          r.music ? `identified by ${r.music}` : 'no context produced music — only one-shot SFX was heard');
    if (r.music === null) { check(`[${mode}] audible within 2s of the first gesture`, false, 'no music context'); continue; }

    check(`[${mode}] music audible within 2s of the first gesture`, r.ms !== null && r.ms < 2000,
          `first music node ${r.ms}ms after gesture (SFX ctx made ${r.otherCtxNodes} nodes, not counted)`);

    if (expectFile) {
      check(`[${mode}] real track takes over`, r.looping === true, `looping source: ${r.looping}`);
    } else {
      // The bed must still be scheduling with no input at all — a stuck or
      // one-shot engine cannot fake this.
      check(`[${mode}] procedural bed keeps playing with no input`, r.quiet >= 4,
            `${r.quiet} music nodes during the 4s quiet window`);
    }
  }
  const failed = results.filter(x => !x).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('ERROR', String(e).slice(0, 300)); process.exit(2); });
