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

const GALLERY = path.resolve(__dirname, '..');
// Worktrees may live under Agents/.worktrees rather than directly under Agents.
// Let the caller provide the canonical workspace root so the shared Puppeteer
// install resolves consistently in both layouts.
const AGENTS_ROOT = path.resolve(process.env.AGENTS_ROOT || path.join(GALLERY, '..'));
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

function createServer() {
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
          firstName: data.levels[0] && data.levels[0].name
        };
        document.getElementById('out').textContent = [
          window.__gameFactoryLevelState.source,
          window.__gameFactoryLevelState.count,
          window.__gameFactoryLevelState.firstName
        ].join(':');
      });
    </script></body></html>`;

  return http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname === '/cplay') return serve(res, 200, cplay, 'text/html; charset=utf-8');
    if (url.pathname === `/g/${ID}`) return serve(res, 200, game, 'text/html; charset=utf-8');
    if (url.pathname === '/api/creation-levels') {
      if (url.searchParams.get('id') !== ID) return serve(res, 400, '{"ok":false}', 'application/json');
      return serve(res, 200, JSON.stringify({
        ok: true,
        id: ID,
        schema: 'game-factory-generic-levels-v1',
        levels: LEVELS,
        updatedTs: 123456,
      }), 'application/json');
    }
    if (url.pathname === '/identity.js') return serve(res, 200, '', 'application/javascript; charset=utf-8');
    return serve(res, 404, 'not found');
  });
}

async function main() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  let browser;
  try {
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'], protocolTimeout: 120000 });
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${port}/cplay?id=${ID}&slug=bridge-test&title=Bridge%20Test`, {
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
    console.log('PASS creation-level bridge:', JSON.stringify(state));
  } finally {
    if (browser) await browser.close().catch(() => {});
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((err) => {
  console.error('FAIL creation-level bridge:', err.message);
  process.exit(1);
});
