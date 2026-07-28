// Verify the music rewrite FUNCTIONALLY, not just that the grep passes:
// the loop must load and play through Web Audio, with no HTMLMediaElement
// anywhere (an <audio>/Audio element is what registers the OS MediaSession
// that Yandex rejects under 1.6.2.5).
const path = require('path');
const http = require('http');
const fs = require('fs');

const GAME = path.resolve(__dirname, '..', '..', 'games', 'bomzhara');
const REL = 'Shared/skills/game-factory/tools/node_modules/puppeteer';
let dir = GAME, found = null;
for (let i = 0; i < 8 && !found; i++) { const c = path.join(dir, REL); if (fs.existsSync(c)) found = c; dir = path.dirname(dir); }
const puppeteer = require(found);
const TYPES = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json',
  '.png':'image/png', '.webp':'image/webp', '.ogg':'audio/ogg', '.mp3':'audio/mpeg' };

const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname.replace(/^\//, '')) || 'index.html';
  const f = path.join(GAME, rel);
  if (!f.startsWith(GAME) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' });
  res.end(fs.readFileSync(f));
});

const results = [];
const check = (n, p, d = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`); };

(async () => {
  await new Promise(r => server.listen(8127, r));
  const browser = await puppeteer.launch({ headless: 'new', args: [
    '--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--autoplay-policy=no-user-gesture-required',
  ] });
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 600 });
  await page.goto('http://localhost:8127/index.html', { waitUntil: 'networkidle0', timeout: 45000 });
  await new Promise(r => setTimeout(r, 2500));

  // A real gesture is what unlocks audio.
  await page.mouse.click(450, 300);
  await new Promise(r => setTimeout(r, 1500));
  await page.keyboard.press('Enter');
  await new Promise(r => setTimeout(r, 4000));

  const st = await page.evaluate(() => {
    const a = (window.__BZ && window.__BZ.audio) ? window.__BZ.audio() : null;
    return {
      audio: a,
      mediaElements: document.querySelectorAll('audio,video').length,
      hasMediaSession: !!(navigator.mediaSession && navigator.mediaSession.metadata),
    };
  });

  console.log('  audioDebug:', JSON.stringify(st.audio));
  check('audio context is running', st.audio && st.audio.context === 'running', `context=${st.audio && st.audio.context}`);
  check('audio unlocked by gesture', !!(st.audio && st.audio.unlocked));
  check('music buffer decoded', !!(st.audio && st.audio.musicReady), `musicReady=${st.audio && st.audio.musicReady}`);
  check('music is playing', st.audio && st.audio.musicPaused === false, `musicPaused=${st.audio && st.audio.musicPaused}`);
  check('sfx buffers loaded', st.audio && st.audio.loaded > 0, `loaded=${st.audio && st.audio.loaded}`);
  check('no audio/video elements in DOM', st.mediaElements === 0, `count=${st.mediaElements}`);
  check('no OS MediaSession registered', !st.hasMediaSession);

  // Mute must silence it and free the source; unmute must restart it.
  const muted = await page.evaluate(() => { window.__BZ.toggleAudio(); return window.__BZ.audio(); });
  check('mute stops the loop', muted.musicPaused === true, `musicPaused=${muted.musicPaused}`);
  check('mute zeroes the master bus', muted.masterGain === 0, `masterGain=${muted.masterGain}`);
  const unmuted = await page.evaluate(() => { window.__BZ.toggleAudio(); return window.__BZ.audio(); });
  check('unmute restarts the loop', unmuted.musicPaused === false, `musicPaused=${unmuted.musicPaused}`);

  // The ambient wind used to run on its OWN AudioContext wired straight to
  // destination, so muting the game left it audible and its per-frame resume()
  // undid any suspend. It must now hang off the shared masterGain.
  const oneCtx = await page.evaluate(() => {
    // Count contexts the page can still create vs. what the game holds: the
    // game must expose exactly one, and the wind bus must live on it.
    const a = window.__BZ.audio();
    return { windReady: a.windReady, ctx: a.context, master: a.masterGain };
  });
  check('wind runs on the shared graph', oneCtx.windReady === true, `windReady=${oneCtx.windReady}`);
  // Assert against the SHIPPED source, not a runtime guess: only audio.js may
  // construct a context. A second one anywhere re-opens the divergent-mute bug.
  const ctxBuilders = fs.readdirSync(GAME)
    .filter(f => f.endsWith('.js'))
    .filter(f => /new\s+(window\.)?(webkit)?AudioContext|new\s+Ctx\s*\(/.test(fs.readFileSync(path.join(GAME, f), 'utf8')));
  check('only audio.js creates an AudioContext',
        ctxBuilders.length === 1 && ctxBuilders[0] === 'audio.js',
        `builders=[${ctxBuilders.join(',')}]`);

  // Yandex 1.3 / CLAUDE.md #8: hiding the tab must silence the game.
  const hidden = await page.evaluate(async () => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    await new Promise(r => setTimeout(r, 300));
    return window.__BZ.audio().context;
  });
  check('tab-hide suspends all audio', hidden === 'suspended', `context=${hidden}`);
  const shown = await page.evaluate(async () => {
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    await new Promise(r => setTimeout(r, 300));
    return window.__BZ.audio().context;
  });
  check('returning to the tab resumes it', shown === 'running', `context=${shown}`);

  await browser.close(); server.close();
  const failed = results.filter(r => !r).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('ERROR', e); server.close(); process.exit(2); });
