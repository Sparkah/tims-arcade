#!/usr/bin/env node
/**
 * check_creation_level_bridge.js
 *
 * Verifies the player-created game wrapper (/cplay) fetches saved creator-admin
 * levels and delivers them into the sandboxed /g/<id> iframe by postMessage.
 *
 * This is intentionally local and deterministic: it serves cplay.html from disk,
 * stubs /api/creation-levels, and serves a tiny generated-game fixture that
 * listens for the same gameFactoryLevels payload the relay prompts require.
 */

const fs = require('fs');
const http = require('http');
const path = require('path');
const { pathToFileURL } = require('url');

const GALLERY = path.resolve(__dirname, '..');
// Worktrees may live under Agents/.worktrees rather than directly under Agents.
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
const puppeteer = require(path.join(
  AGENTS_ROOT,
  'Shared',
  'skills',
  'game-factory',
  'tools',
  'node_modules',
  'puppeteer'
));

const ID = '0123456789abcdef0123456789abcdef';
const DENIED_ID = 'fedcba9876543210fedcba9876543210';
const MALICIOUS_ID = 'badc0ffee0ddf00dbadc0ffee0ddf00d';
const LEVELS = [
  {
    name: 'Bridge Test Level',
    width: 360,
    height: 640,
    player: { x: 42, y: 500 },
    goal: { x: 300, y: 90 },
    objects: [{ type: 'coin', x: 180, y: 240, w: 28, h: 28, value: 7, label: 'test' }],
    notes: 'sent from wrapper',
  },
];

function serve(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, {
    'content-type': type,
    'cache-control': 'no-store',
  });
  res.end(body);
}

function createServer(cplayCsp, externalReceiverUrl, observations) {
  const cplay = fs.readFileSync(path.join(GALLERY, 'cplay.html'), 'utf8');
  const game = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Bridge Probe</title></head>
    <body><div id="out">waiting</div><script>
      window.__gameFactoryLevelState = { source: 'built-in', count: 1, current: 0 };
      window.addEventListener('message', function (event) {
        var data = event.data || {};
        if (data.type !== 'gameFactoryLevels' || !Array.isArray(data.levels)) return;
        window.__gameFactoryLevelState = {
          source: 'gameFactoryLevels',
          count: data.levels.length,
          current: 0,
          firstName: data.levels[0] && data.levels[0].name,
          hasUpdatedTs: Object.prototype.hasOwnProperty.call(data, 'updatedTs')
        };
        document.getElementById('out').textContent = [
          window.__gameFactoryLevelState.source,
          window.__gameFactoryLevelState.count,
          window.__gameFactoryLevelState.firstName
        ].join(':');
      });
    </script></body></html>`;
  const maliciousFirst = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Navigation Probe</title></head>
    <body><div id="out">waiting</div><script>
      var messageCount = 0;
      window.addEventListener('message', function (event) {
        var data = event.data || {};
        if (data.type !== 'gameFactoryLevels' || !Array.isArray(data.levels)) return;
        messageCount++;
        var hasUpdatedTs = Object.prototype.hasOwnProperty.call(data, 'updatedTs');
        location.replace('/g/${MALICIOUS_ID}?phase=2&first=' + messageCount + '&updated=' + (hasUpdatedTs ? '1' : '0'));
      });
    </script></body></html>`;
  const maliciousSecond = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Receiver Probe</title></head>
    <body><div id="out">second document</div><script>
      window.addEventListener('message', function (event) {
        var data = event.data || {};
        if (data.type === 'gameFactoryLevels' && Array.isArray(data.levels)) {
          location.href = '/second-private-receiver?name=' + encodeURIComponent((data.levels[0] || {}).name || 'missing');
        }
      });
      setTimeout(function () {
        location.href = ${JSON.stringify(externalReceiverUrl)} + '?source=malicious-frame';
      }, 80);
    </script></body></html>`;

  return http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname === '/cplay') {
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        // Loopback tests run over HTTP. Remove only the upgrade directive so
        // Chromium can exercise the production frame-src rule locally.
        'content-security-policy': cplayCsp.replace(/;\s*upgrade-insecure-requests\b/, ''),
      });
      return res.end(cplay);
    }
    if (url.pathname === `/g/${ID}`) return serve(res, 200, game, 'text/html; charset=utf-8');
    if (url.pathname === `/g/${MALICIOUS_ID}`) {
      if (url.searchParams.get('phase') === '2') {
        observations.phaseTwoLoads++;
        observations.firstMessageCount = Number(url.searchParams.get('first') || 0);
        observations.firstMessageHadUpdatedTs = url.searchParams.get('updated') === '1';
        return serve(res, 200, maliciousSecond, 'text/html; charset=utf-8');
      }
      return serve(res, 200, maliciousFirst, 'text/html; charset=utf-8');
    }
    if (url.pathname === '/second-private-receiver') {
      observations.secondPrivatePayloads++;
      return serve(res, 200, 'second private payload observed');
    }
    if (url.pathname === '/api/creation-levels') {
      if (url.searchParams.get('id') === DENIED_ID) return serve(res, 404, '{"ok":false,"error":"not_found"}', 'application/json');
      if (![ID, MALICIOUS_ID].includes(url.searchParams.get('id'))) return serve(res, 400, '{"ok":false}', 'application/json');
      return serve(res, 200, JSON.stringify({
        ok: true,
        id: ID,
        slug: url.searchParams.get('id') === MALICIOUS_ID ? 'malicious-bridge' : 'bridge-test',
        schema: 'game-factory-generic-levels-v1',
        levels: LEVELS,
        updatedTs: 123456,
      }), 'application/json');
    }
    if ((url.pathname === '/api/play' || url.pathname === '/api/heartbeat') && req.method === 'POST') {
      let body = '';
      req.setEncoding('utf8');
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        observations.metricPosts.push({ path: url.pathname, body, referer: req.headers.referer || '' });
        serve(res, 200, '{"ok":true}', 'application/json');
      });
      return;
    }
    if (url.pathname === '/identity.js') return serve(res, 200, '', 'application/javascript; charset=utf-8');
    return serve(res, 404, 'not found');
  });
}

async function assertMiddlewareCsp() {
  const middlewareUrl = pathToFileURL(path.join(GALLERY, 'functions', '_middleware.js')).href + `?bridge=${Date.now()}`;
  const middleware = await import(middlewareUrl);
  async function cspFor(pathname) {
    const response = await middleware.onRequest({
      request: new Request(`https://game-factory.test${pathname}`),
      next: async () => new Response('<!doctype html>', {
        headers: { 'content-type': 'text/html; charset=utf-8' },
      }),
    });
    return response.headers.get('content-security-policy') || '';
  }
  const cplayCsp = await cspFor('/cplay');
  if (!/(?:^|;\s*)frame-src\s+'self'(?:\s*;|$)/.test(cplayCsp)) {
    throw new Error(`cplay CSP is not same-origin-only: ${cplayCsp}`);
  }
  if (/\bframe-src\b[^;]*https:/.test(cplayCsp)) {
    throw new Error(`cplay CSP still permits external HTTPS frames: ${cplayCsp}`);
  }
  const cplayHtmlCsp = await cspFor('/cplay.html');
  if (cplayHtmlCsp !== cplayCsp) {
    throw new Error('/cplay.html did not receive the restrictive /cplay CSP');
  }
  const ordinaryCsp = await cspFor('/');
  if (!ordinaryCsp.includes("frame-src 'self' https:")) {
    throw new Error('ordinary app CSP frame-src behavior changed');
  }
  return cplayCsp;
}

async function main() {
  const cplayCsp = await assertMiddlewareCsp();
  const receiverObservations = { requests: 0 };
  const receiver = http.createServer((req, res) => {
    receiverObservations.requests++;
    serve(res, 200, 'external receiver reached');
  });
  await new Promise((resolve) => receiver.listen(0, '127.0.0.1', resolve));
  const receiverUrl = `http://127.0.0.1:${receiver.address().port}/receiver`;
  const observations = {
    phaseTwoLoads: 0,
    firstMessageCount: 0,
    firstMessageHadUpdatedTs: null,
    secondPrivatePayloads: 0,
    metricPosts: [],
  };
  const server = createServer(cplayCsp, receiverUrl, observations);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  let browser;
  try {
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'], protocolTimeout: 120000 });
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${port}/cplay?id=${ID}&slug=attacker-controlled&title=Bridge%20Test`, {
      waitUntil: 'load',
      timeout: 30000,
    });
    await page.waitForFunction(() => {
      const frame = document.querySelector('iframe');
      return !!(frame && frame.contentWindow);
    }, { timeout: 5000 });
    const frame = await page.waitForFrame((f) => f.url().includes(`/g/${ID}`), { timeout: 10000 });
    await frame.waitForFunction(() => {
      return window.__gameFactoryLevelState
        && window.__gameFactoryLevelState.source === 'gameFactoryLevels'
        && window.__gameFactoryLevelState.count === 1;
    }, { timeout: 10000 });
    const state = await frame.evaluate(() => window.__gameFactoryLevelState);
    if (state.firstName !== 'Bridge Test Level') {
      throw new Error(`wrong level payload: ${JSON.stringify(state)}`);
    }
    if (state.hasUpdatedTs) throw new Error('runtime message leaked updatedTs');
    for (let i = 0; i < 50 && !observations.metricPosts.some((post) => post.path === '/api/play'); i++) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    const firstPlay = observations.metricPosts.find((post) => post.path === '/api/play');
    if (!firstPlay || JSON.parse(firstPlay.body).slug !== 'bridge-test') {
      throw new Error(`metrics did not use the server-returned slug: ${JSON.stringify(firstPlay)}`);
    }

    await page.goto(`http://127.0.0.1:${port}/cplay?id=${MALICIOUS_ID}`, { waitUntil:'load', timeout:30000 });
    const maliciousFrame = await page.waitForFrame((candidate) => candidate.url().includes(`/g/${MALICIOUS_ID}?phase=2`), { timeout:10000 });
    await new Promise((resolve) => setTimeout(resolve, 500));
    const maliciousFrameUrl = maliciousFrame.url();
    if (observations.phaseTwoLoads !== 1 || observations.firstMessageCount !== 1) {
      throw new Error(`malicious navigation did not follow one first payload: ${JSON.stringify(observations)}`);
    }
    if (observations.firstMessageHadUpdatedTs) throw new Error('malicious first document received updatedTs');
    if (observations.secondPrivatePayloads !== 0) {
      throw new Error(`private levels were posted after iframe navigation (${observations.secondPrivatePayloads})`);
    }
    if (receiverObservations.requests !== 0) throw new Error('external receiver was reached despite cplay frame-src');

    const deniedPage = await browser.newPage();
    await deniedPage.goto(`http://127.0.0.1:${port}/cplay?id=${DENIED_ID}&slug=should-never-post`, { waitUntil:'load', timeout:30000 });
    await deniedPage.waitForFunction(() => {
      const error = document.querySelector('.cerr');
      return !!(error && /private or unavailable/i.test(error.textContent || ''));
    }, { timeout:5000 });
    await new Promise((resolve) => setTimeout(resolve, 200));
    const denied = await deniedPage.evaluate(() => ({ message:document.querySelector('.cerr').textContent, iframe:!!document.querySelector('iframe') }));
    await deniedPage.close();
    if (denied.iframe) throw new Error('denied creation still embedded an iframe');
    const deniedMetricPosts = observations.metricPosts.filter((post) => post.referer.includes(DENIED_ID));
    if (deniedMetricPosts.length) throw new Error(`denied creation emitted metrics: ${JSON.stringify(deniedMetricPosts)}`);
    console.log('PASS creation-level bridge:', JSON.stringify({
      state,
      malicious: { observations, maliciousFrameUrl, externalReceiverRequests: receiverObservations.requests },
      denied,
    }));
  } finally {
    if (browser) await browser.close().catch(() => {});
    await new Promise((resolve) => server.close(resolve));
    await new Promise((resolve) => receiver.close(resolve));
  }
}

main().catch((err) => {
  console.error('FAIL creation-level bridge:', err.message);
  process.exit(1);
});
