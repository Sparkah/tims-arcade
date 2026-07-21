#!/usr/bin/env node
/**
 * Hard mobile-containment gate for the dissertation participant player.
 *
 * This opens the real participant shell in local preview mode, intercepts only
 * pool.json, and supplies 56 copies of one opaque game assignment. That keeps
 * the production app/session path intact while making the first game
 * deterministic. Every public game is checked across the supported portrait
 * and phone-landscape viewport set.
 *
 * With no base URL, the gate serves the checked-out Gallery tree on an
 * ephemeral loopback port. An existing local server can be supplied instead:
 *
 *   node scripts/check_dissertation_mobile.js
 *   node scripts/check_dissertation_mobile.js --id g562eeaa0ad6a
 *   node scripts/check_dissertation_mobile.js --base-url http://127.0.0.1:8788/dissertation/?preview=1
 *
 * A positional base URL is also accepted. Failures write a viewport PNG and a
 * JSON receipt to /tmp/dissertation-mobile-qa.
 *
 * Exit codes: 0 pass, 1 infrastructure/configuration error, 2 containment fail.
 */

const fs = require('fs');
const http = require('http');
const path = require('path');
const childProcess = require('child_process');

const GALLERY = path.resolve(process.env.GALLERY_ROOT || path.resolve(__dirname, '..'));
const ARTIFACT_DIR = '/tmp/dissertation-mobile-qa';
const CONCURRENCY = 2;
const NAVIGATION_TIMEOUT_MS = 30_000;
const GAME_READY_TIMEOUT_MS = 35_000;
// A few frozen canvas documents expose 2-4 CSS px of baseline overflow even
// with `scrolling="no"`; that strip is not user-scrollable and contains no UI.
// Anything beyond it is a real containment failure.
const TOLERANCE_PX = 4;

const VIEWPORTS = [
  { name: 'mobile-small-320x568', width: 320, height: 568 },
  { name: 'mobile-393x852', width: 393, height: 852 },
  { name: 'mobile-360x640', width: 360, height: 640 },
  { name: 'mobile-landscape-844x390', width: 844, height: 390 },
  { name: 'mobile-large-landscape-932x430', width: 932, height: 430 },
];

function hasPuppeteer(root) {
  return fs.existsSync(path.join(
    root,
    'Shared',
    'skills',
    'game-factory',
    'tools',
    'node_modules',
    'puppeteer',
  ));
}

function findAgentsRoot() {
  if (process.env.AGENTS_ROOT) return process.env.AGENTS_ROOT;
  let dir = GALLERY;
  for (let depth = 0; depth < 6; depth += 1) {
    if (hasPuppeteer(dir)) return dir;
    dir = path.dirname(dir);
  }
  try {
    const commonDir = childProcess.execFileSync(
      'git',
      ['-C', GALLERY, 'rev-parse', '--path-format=absolute', '--git-common-dir'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim();
    const agentsRoot = path.resolve(commonDir, '..', '..');
    if (hasPuppeteer(agentsRoot)) return agentsRoot;
  } catch (_) {
    // Fall through to the workspace default.
  }
  return path.resolve(GALLERY, '..');
}

const AGENTS_ROOT = findAgentsRoot();
const puppeteer = require(path.join(
  AGENTS_ROOT,
  'Shared',
  'skills',
  'game-factory',
  'tools',
  'node_modules',
  'puppeteer',
));

function usage() {
  console.log(`Usage: node scripts/check_dissertation_mobile.js [base-url] [options]

Options:
  --base-url <url>  Existing local participant URL (default: built-in server)
  --id <opaque-id>  Check only one public game ID
  --quiet           Print only failures and the final summary
  --help            Show this help

The target must expose local preview mode. The built-in server binds only to 127.0.0.1.`);
}

function readValue(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`);
  return value;
}

function parseArgs(argv) {
  let baseUrl = null;
  let onlyId = null;
  let quiet = false;
  let positionalSeen = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') return { help: true };
    if (arg === '--quiet') {
      quiet = true;
      continue;
    }
    if (arg === '--base-url') {
      baseUrl = readValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--id') {
      onlyId = readValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (!arg.startsWith('--') && !positionalSeen) {
      baseUrl = arg;
      positionalSeen = true;
      continue;
    }
    throw new Error(`unknown argument: ${arg}`);
  }

  if (baseUrl) {
    const parsed = new URL(baseUrl);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)) {
      throw new Error(
        'preview mode is localhost-only; point --base-url at a local server, not production',
      );
    }
    parsed.searchParams.set('preview', '1');
    baseUrl = parsed.toString();
  }
  return { help: false, baseUrl, onlyId, quiet };
}

function contentType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  return {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.woff2': 'font/woff2',
  }[extension] || 'application/octet-stream';
}

async function startStaticServer() {
  const server = http.createServer((request, response) => {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
    } catch (_) {
      response.writeHead(400).end('Bad request');
      return;
    }
    let filePath = path.resolve(GALLERY, `.${pathname}`);
    const relative = path.relative(GALLERY, filePath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      response.writeHead(403).end('Forbidden');
      return;
    }
    try {
      if (fs.statSync(filePath).isDirectory()) filePath = path.join(filePath, 'index.html');
    } catch (_) {
      response.writeHead(404).end('Not found');
      return;
    }
    response.writeHead(200, {
      'content-type': contentType(filePath),
      'cache-control': 'no-store',
    });
    fs.createReadStream(filePath)
      .on('error', () => response.destroy())
      .pipe(response);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}/dissertation/?preview=1`,
  };
}

function loadPool() {
  const pool = JSON.parse(fs.readFileSync(path.join(GALLERY, 'dissertation', 'pool.json'), 'utf8'));
  if (!pool || !Array.isArray(pool.games) || pool.games.length !== 56) {
    throw new Error(`expected exactly 56 games in dissertation/pool.json; found ${pool?.games?.length ?? 'none'}`);
  }
  return pool;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function preflightBaseUrl(baseUrl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch(baseUrl, {
      cache: 'no-store',
      redirect: 'follow',
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`participant page returned HTTP ${response.status}`);
  } catch (error) {
    if (error.name === 'AbortError') throw new Error(`participant page did not respond within 5 seconds: ${baseUrl}`);
    throw new Error(`participant page is unavailable at ${baseUrl}: ${error.message}`);
  } finally {
    clearTimeout(timeout);
  }
}

function safeFilePart(value) {
  return String(value).replace(/[^a-zA-Z0-9_.-]+/g, '-');
}

function deterministicPool(pool, game) {
  return {
    studyVersion: pool.studyVersion,
    sessionSize: 56,
    games: Array.from({ length: 56 }, () => ({ id: game.id, path: game.path })),
  };
}

async function installInstrumentation(page) {
  await page.evaluateOnNewDocument(() => {
    const state = { inputs: [], messages: [] };
    Object.defineProperty(window, '__dissertationMobileQa', {
      configurable: true,
      enumerable: false,
      value: state,
    });

    const recordInput = (event) => {
      const point = event.touches?.[0] || event.changedTouches?.[0] || event;
      state.inputs.push({
        type: event.type,
        pointerType: event.pointerType || (event.type.startsWith('touch') ? 'touch' : 'unknown'),
        isTrusted: event.isTrusted === true,
        clientX: Number.isFinite(point.clientX) ? point.clientX : null,
        clientY: Number.isFinite(point.clientY) ? point.clientY : null,
        time: performance.now(),
      });
    };
    window.addEventListener('pointerdown', recordInput, { capture: true, passive: true });
    window.addEventListener('touchstart', recordInput, { capture: true, passive: true });

    if (window === window.top) {
      window.addEventListener('message', (event) => {
        const data = event.data;
        if (!data || data.source !== 'dissertation-game') return;
        state.messages.push({
          type: data.type,
          inputMethod: data.inputMethod,
          loadToken: data.loadToken,
          isTrusted: event.isTrusted === true,
          time: performance.now(),
        });
      }, { capture: true });
    }
  });
}

function rectSnapshot(rect) {
  if (!rect) return null;
  return {
    x: rect.x,
    y: rect.y,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  };
}

async function inspectOuter(page, viewport) {
  return page.evaluate(({ viewport, tolerance }) => {
    const errors = [];
    const selectors = {
      player: '#player-view',
      frame: '#game-frame',
      heading: '#response-heading',
      like: '#like-button',
      dislike: '#dislike-button',
      skip: '#skip-toggle',
    };
    const nodes = {};
    const rects = {};

    function plainRect(rect) {
      return {
        x: rect.x,
        y: rect.y,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      };
    }

    function describe(node) {
      if (!node) return 'null';
      const id = node.id ? `#${node.id}` : '';
      const classes = node.classList?.length ? `.${Array.from(node.classList).join('.')}` : '';
      return `${node.tagName?.toLowerCase() || 'node'}${id}${classes}`;
    }

    for (const [name, selector] of Object.entries(selectors)) {
      const node = document.querySelector(selector);
      nodes[name] = node;
      if (!node) {
        errors.push(`outer: missing ${selector}`);
        continue;
      }
      const rect = node.getBoundingClientRect();
      rects[name] = plainRect(rect);
      if (rect.width <= 0 || rect.height <= 0) {
        errors.push(`outer: ${name} is collapsed (${rect.width.toFixed(1)}x${rect.height.toFixed(1)})`);
        continue;
      }
      if (rect.left < -tolerance || rect.top < -tolerance
          || rect.right > viewport.width + tolerance
          || rect.bottom > viewport.height + tolerance) {
        errors.push(
          `outer: ${name} leaves viewport `
          + `(l=${rect.left.toFixed(1)}, t=${rect.top.toFixed(1)}, `
          + `r=${rect.right.toFixed(1)}, b=${rect.bottom.toFixed(1)})`,
        );
      }
    }

    for (const name of ['like', 'dislike', 'skip']) {
      const rect = rects[name];
      if (rect && (rect.width < 44 || rect.height < 44)) {
        errors.push(
          `outer: ${name} touch target is ${rect.width.toFixed(1)}x${rect.height.toFixed(1)}; minimum is 44x44`,
        );
      }
    }

    function isCovered(name) {
      const node = nodes[name];
      const rect = rects[name];
      if (!node || !rect || rect.width <= 0 || rect.height <= 0) return;
      const x = Math.min(viewport.width - 1, Math.max(0, rect.left + rect.width / 2));
      const y = Math.min(viewport.height - 1, Math.max(0, rect.top + rect.height / 2));
      const hit = document.elementFromPoint(x, y);
      if (!hit || !(hit === node || node.contains(hit) || hit.contains(node))) {
        errors.push(`outer: ${name} center is covered by ${describe(hit)}`);
      }
    }
    for (const name of Object.keys(selectors)) isCovered(name);

    function overlap(a, b) {
      const first = rects[a];
      const second = rects[b];
      if (!first || !second) return;
      const width = Math.min(first.right, second.right) - Math.max(first.left, second.left);
      const height = Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top);
      if (width > tolerance && height > tolerance) {
        errors.push(`outer: ${a} overlaps ${b} by ${width.toFixed(1)}x${height.toFixed(1)}`);
      }
    }
    for (const pair of [
      ['frame', 'heading'],
      ['frame', 'like'],
      ['frame', 'dislike'],
      ['frame', 'skip'],
      ['heading', 'like'],
      ['heading', 'dislike'],
      ['heading', 'skip'],
      ['like', 'dislike'],
      ['like', 'skip'],
      ['dislike', 'skip'],
    ]) overlap(pair[0], pair[1]);

    if (nodes.player && nodes.frame && !nodes.player.contains(nodes.frame)) {
      errors.push('outer: game frame is not contained by player view');
    }

    const root = document.documentElement;
    const body = document.body;
    const dimensions = {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      htmlScrollWidth: root.scrollWidth,
      htmlScrollHeight: root.scrollHeight,
      bodyScrollWidth: body.scrollWidth,
      bodyScrollHeight: body.scrollHeight,
    };
    if (Math.abs(window.scrollX) > tolerance || Math.abs(window.scrollY) > tolerance) {
      errors.push(`outer: page scroll is (${window.scrollX.toFixed(1)}, ${window.scrollY.toFixed(1)})`);
    }
    for (const [label, actual, expected] of [
      ['html width', root.scrollWidth, window.innerWidth],
      ['body width', body.scrollWidth, window.innerWidth],
      ['html height', root.scrollHeight, window.innerHeight],
      ['body height', body.scrollHeight, window.innerHeight],
    ]) {
      if (actual > expected + tolerance) {
        errors.push(`outer: ${label} ${actual.toFixed(1)} exceeds viewport ${expected.toFixed(1)}`);
      }
    }

    return { errors, rects, dimensions };
  }, { viewport, tolerance: TOLERANCE_PX });
}

async function inspectChild(frame, requireVisible = true) {
  return frame.evaluate(({ tolerance, requireVisible }) => {
    const root = document.documentElement;
    const body = document.body;
    const errors = [];
    const candidateSelector = [
      'canvas',
      'button',
      'input:not([type="hidden"])',
      'select',
      'textarea',
      'a[href]',
      '[role="button"]',
      '[onclick]',
    ].join(',');

    function label(node) {
      if (node.id) return `${node.tagName.toLowerCase()}#${node.id}`;
      if (node.classList.length) {
        return `${node.tagName.toLowerCase()}.${Array.from(node.classList).slice(0, 2).join('.')}`;
      }
      return node.tagName.toLowerCase();
    }

    function plainRect(rect) {
      return {
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      };
    }

    const candidates = Array.from(document.querySelectorAll(candidateSelector));
    const visible = [];
    for (const node of candidates) {
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      const rendered = !node.hidden
        && style.display !== 'none'
        && style.visibility !== 'hidden'
        && style.visibility !== 'collapse'
        && Number(style.opacity || 1) > 0.01
        && rect.width > 1
        && rect.height > 1;
      const intersects = rect.right > 0
        && rect.bottom > 0
        && rect.left < window.innerWidth
        && rect.top < window.innerHeight;
      if (!rendered) continue;
      if (intersects) visible.push({ label: label(node), rect: plainRect(rect) });
      if (rect.left < -tolerance || rect.top < -tolerance
          || rect.right > window.innerWidth + tolerance
          || rect.bottom > window.innerHeight + tolerance) {
        errors.push(
          `child: ${label(node)} leaves iframe `
          + `(l=${rect.left.toFixed(1)}, t=${rect.top.toFixed(1)}, `
          + `r=${rect.right.toFixed(1)}, b=${rect.bottom.toFixed(1)})`,
        );
      }
      if (node instanceof HTMLCanvasElement && (node.width <= 0 || node.height <= 0)) {
        errors.push(`child: ${label(node)} has an empty ${node.width}x${node.height} backing buffer`);
      }
    }
    if (requireVisible && visible.length === 0) {
      errors.push('child: no visible canvas or interactive game UI found');
    }

    const dimensions = {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      htmlScrollWidth: root.scrollWidth,
      htmlScrollHeight: root.scrollHeight,
      bodyScrollWidth: body.scrollWidth,
      bodyScrollHeight: body.scrollHeight,
    };
    if (Math.abs(window.scrollX) > tolerance || Math.abs(window.scrollY) > tolerance) {
      errors.push(`child: scroll is (${window.scrollX.toFixed(1)}, ${window.scrollY.toFixed(1)})`);
    }
    for (const [labelText, actual, expected] of [
      ['html width', root.scrollWidth, window.innerWidth],
      ['body width', body.scrollWidth, window.innerWidth],
      ['html height', root.scrollHeight, window.innerHeight],
      ['body height', body.scrollHeight, window.innerHeight],
    ]) {
      if (actual > expected + tolerance) {
        errors.push(`child: ${labelText} ${actual.toFixed(1)} exceeds iframe ${expected.toFixed(1)}`);
      }
    }

    return {
      errors,
      dimensions,
      visibleCount: visible.length,
      visible: visible.slice(0, 30),
    };
  }, { tolerance: TOLERANCE_PX, requireVisible });
}

async function findGameFrame(page, game) {
  const deadline = Date.now() + GAME_READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const frame = page.frames().find((candidate) => {
      try {
        return new URL(candidate.url()).pathname.startsWith(game.path);
      } catch (_) {
        return false;
      }
    });
    if (frame) return frame;
    await sleep(100);
  }
  throw new Error(`game iframe did not navigate to ${game.path}`);
}

async function waitForStableFrame(page, frame) {
  let previous = null;
  let stableCount = 0;
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline && stableCount < 3) {
    const outer = await page.$eval('#game-frame', node => {
      const rect = node.getBoundingClientRect();
      return [rect.left, rect.top, rect.width, rect.height].map(value => Math.round(value * 10) / 10);
    });
    const inner = await frame.evaluate(() => [window.innerWidth, window.innerHeight]);
    const current = JSON.stringify([outer, inner]);
    if (current === previous) stableCount += 1;
    else stableCount = 0;
    previous = current;
    await sleep(100);
  }
}

async function tapGame(page, frame, viewport) {
  const outerRect = await page.$eval('#game-frame', node => {
    const rect = node.getBoundingClientRect();
    return {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    };
  });
  const target = await frame.evaluate(() => {
    const candidates = Array.from(document.querySelectorAll([
      'button:not([disabled])',
      'input:not([type="hidden"]):not([disabled])',
      '[role="button"]:not([aria-disabled="true"])',
      '[onclick]',
    ].join(',')));
    const visible = candidates.filter((node) => {
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return !node.hidden
        && style.display !== 'none'
        && style.visibility !== 'hidden'
        && Number(style.opacity || 1) > 0.01
        && style.pointerEvents !== 'none'
        && rect.width > 1
        && rect.height > 1
        && rect.left >= 0
        && rect.top >= 0
        && rect.right <= window.innerWidth
        && rect.bottom <= window.innerHeight;
    });
    const startPattern = /\b(start|play|begin|launch|new game|tap to start)\b/i;
    const start = visible.find(node => startPattern.test(
      `${node.textContent || ''} ${node.getAttribute('aria-label') || ''} ${node.id || ''}`,
    ));
    const node = start || visible[0] || document.querySelector('canvas');
    if (!node) {
      return {
        label: 'iframe-center',
        kind: 'fallback',
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      };
    }
    const rect = node.getBoundingClientRect();
    return {
      label: node.id ? `${node.tagName.toLowerCase()}#${node.id}` : node.tagName.toLowerCase(),
      kind: start ? 'start-control' : node instanceof HTMLCanvasElement ? 'canvas' : 'control',
      x: Math.max(1, Math.min(window.innerWidth - 1, rect.left + rect.width / 2)),
      y: Math.max(1, Math.min(window.innerHeight - 1, rect.top + rect.height / 2)),
    };
  });
  const inner = await frame.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));
  if (inner.width <= 0 || inner.height <= 0 || outerRect.width <= 0 || outerRect.height <= 0) {
    throw new Error('cannot tap a collapsed game iframe');
  }
  const scaleX = outerRect.width / inner.width;
  const scaleY = outerRect.height / inner.height;
  const x = Math.max(2, Math.min(viewport.width - 2, outerRect.left + target.x * scaleX));
  const y = Math.max(2, Math.min(viewport.height - 2, outerRect.top + target.y * scaleY));
  await page.touchscreen.tap(x, y);
  return { x, y, scaleX, scaleY, outerRect, inner, target };
}

async function inspectInputEvidence(page, frame, tap) {
  const [parentEvidence, childEvidence] = await Promise.all([
    page.evaluate(() => window.__dissertationMobileQa || { inputs: [], messages: [] }),
    frame.evaluate(() => window.__dissertationMobileQa || { inputs: [], messages: [] }),
  ]);
  const trustedTouch = childEvidence.inputs.some(event => event.isTrusted
    && (event.pointerType === 'touch' || event.type === 'touchstart'));
  const coordinateEvent = childEvidence.inputs.find(event => event.isTrusted
    && (event.pointerType === 'touch' || event.type === 'touchstart')
    && Number.isFinite(event.clientX)
    && Number.isFinite(event.clientY));
  const bridgeTouch = parentEvidence.messages.some(message => message.type === 'first-input'
    && message.inputMethod === 'touch');
  const errors = [];
  if (!trustedTouch) errors.push('input: real touchscreen tap produced no trusted touch/pointer event in game');
  if (!bridgeTouch) errors.push('input: game bridge did not report first-input with inputMethod=touch');
  if (!coordinateEvent) {
    errors.push('input: trusted touch had no child-frame coordinates');
  } else if (Math.abs(coordinateEvent.clientX - tap.target.x) > TOLERANCE_PX
      || Math.abs(coordinateEvent.clientY - tap.target.y) > TOLERANCE_PX) {
    errors.push(
      `input: transformed tap landed at (${coordinateEvent.clientX.toFixed(1)}, `
      + `${coordinateEvent.clientY.toFixed(1)}) instead of (${tap.target.x.toFixed(1)}, `
      + `${tap.target.y.toFixed(1)})`,
    );
  }
  return {
    errors,
    trustedTouch,
    bridgeTouch,
    coordinateEvent,
    parentEvidence,
    childEvidence,
  };
}

async function forceScrollAttempts(page, frame) {
  await Promise.all([
    page.evaluate(() => {
      window.scrollTo(99, 99);
      const scroller = document.scrollingElement;
      if (scroller) {
        scroller.scrollLeft = 99;
        scroller.scrollTop = 99;
      }
    }),
    frame.evaluate(() => {
      window.scrollTo(99, 99);
      const scroller = document.scrollingElement;
      if (scroller) {
        scroller.scrollLeft = 99;
        scroller.scrollTop = 99;
      }
    }),
  ]);
  await sleep(100);
}

async function writeFailureArtifacts(page, result) {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  const stem = `${safeFilePart(result.gameId)}--${safeFilePart(result.viewport.name)}`;
  const screenshotPath = path.join(ARTIFACT_DIR, `${stem}.png`);
  const jsonPath = path.join(ARTIFACT_DIR, `${stem}.json`);
  try {
    await page.screenshot({ path: screenshotPath, fullPage: false, captureBeyondViewport: false });
    result.artifacts = { screenshotPath, jsonPath };
  } catch (error) {
    result.artifacts = { screenshotPath: null, jsonPath, screenshotError: error.message };
  }
  fs.writeFileSync(jsonPath, `${JSON.stringify(result, null, 2)}\n`);
}

async function runCase(browser, baseUrl, pool, game, viewport) {
  const page = await browser.newPage();
  const result = {
    gameId: game.id,
    gamePath: game.path,
    viewport,
    baseUrl,
    startedAt: new Date().toISOString(),
    errors: [],
    console: [],
    pageErrors: [],
  };
  let frame = null;

  page.on('console', message => {
    if (result.console.length < 100) result.console.push({ type: message.type(), text: message.text() });
  });
  page.on('pageerror', error => {
    if (result.pageErrors.length < 30) result.pageErrors.push(error.message);
  });

  try {
    await page.setViewport({
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: 1,
      isMobile: true,
      hasTouch: true,
    });
    await page.setCacheEnabled(false);
    await installInstrumentation(page);
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      let pathname = '';
      try { pathname = new URL(request.url()).pathname; } catch (_) { /* continue below */ }
      if (pathname === '/dissertation/pool.json') {
        request.respond({
          status: 200,
          contentType: 'application/json; charset=utf-8',
          headers: { 'cache-control': 'no-store' },
          body: JSON.stringify(deterministicPool(pool, game)),
        }).catch(() => {});
      } else {
        request.continue().catch(() => {});
      }
    });

    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: NAVIGATION_TIMEOUT_MS });
    await page.waitForFunction(
      () => {
        const button = document.querySelector('#start-button');
        return button && !button.disabled;
      },
      { timeout: NAVIGATION_TIMEOUT_MS },
    );
    await page.click('#start-button');
    await page.waitForSelector('#player-view:not(.is-hidden)', { timeout: NAVIGATION_TIMEOUT_MS });
    await page.waitForFunction(
      () => document.querySelector('#frame-shell')?.dataset.state === 'ready',
      { timeout: GAME_READY_TIMEOUT_MS },
    );
    frame = await findGameFrame(page, game);
    await waitForStableFrame(page, frame);

    result.before = {
      outer: await inspectOuter(page, viewport),
      child: await inspectChild(frame),
    };
    result.errors.push(...result.before.outer.errors, ...result.before.child.errors);

    result.tap = await tapGame(page, frame, viewport);
    await sleep(350);
    result.input = await inspectInputEvidence(page, frame, result.tap);
    result.errors.push(...result.input.errors);

    await forceScrollAttempts(page, frame);
    result.after = {
      outer: await inspectOuter(page, viewport),
      // A successful Start tap can replace all detectable buttons/canvases
      // with a custom-rendered game surface. Containment still applies, but
      // the pre-input assertion is the one that requires a detectable target.
      child: await inspectChild(frame, false),
    };
    result.errors.push(
      ...result.after.outer.errors.map(error => `after input/scroll: ${error}`),
      ...result.after.child.errors.map(error => `after input/scroll: ${error}`),
    );
  } catch (error) {
    result.infrastructureError = error.stack || error.message;
    result.errors.push(`infrastructure: ${error.message}`);
  }

  result.finishedAt = new Date().toISOString();
  result.ok = result.errors.length === 0;
  if (!result.ok) await writeFailureArtifacts(page, result);
  await page.close().catch(() => {});
  return result;
}

(async () => {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    usage();
    process.exit(0);
  }

  const pool = loadPool();
  let games = pool.games;
  if (options.onlyId) {
    games = games.filter(game => game.id === options.onlyId);
    if (games.length !== 1) throw new Error(`unknown dissertation game ID: ${options.onlyId}`);
  }

  const local = options.baseUrl ? null : await startStaticServer();
  const baseUrl = options.baseUrl || local.baseUrl;
  await preflightBaseUrl(baseUrl);

  const cases = games.flatMap(game => VIEWPORTS.map(viewport => ({ game, viewport })));
  const browser = await puppeteer.launch({
    headless: 'new',
    protocolTimeout: 120_000,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const queue = cases.slice();
  const results = [];
  let completed = 0;

  try {
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      while (queue.length) {
        const next = queue.shift();
        const result = await runCase(browser, baseUrl, pool, next.game, next.viewport);
        results.push(result);
        completed += 1;
        if (!result.ok) {
          console.error(`\u2717 ${result.gameId} @ ${result.viewport.name}`);
          for (const error of result.errors) console.error(`    ${error}`);
        } else if (!options.quiet && completed % 8 === 0) {
          console.log(`  \u2026${completed}/${cases.length} mobile cases passed`);
        }
      }
    }));
  } finally {
    await browser.close();
    if (local) await new Promise(resolve => local.server.close(resolve));
  }

  const failures = results.filter(result => !result.ok);
  if (failures.length) {
    fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
    fs.writeFileSync(
      path.join(ARTIFACT_DIR, 'summary.json'),
      `${JSON.stringify({
        generatedAt: new Date().toISOString(),
        baseUrl,
        cases: cases.length,
        failures: failures.map(result => ({
          gameId: result.gameId,
          viewport: result.viewport.name,
          errors: result.errors,
          artifacts: result.artifacts,
        })),
      }, null, 2)}\n`,
    );
    const infrastructureFailures = failures.filter(result => result.infrastructureError);
    if (infrastructureFailures.length) {
      console.error(
        `\n\u26a0\ufe0f dissertation mobile gate: ${infrastructureFailures.length}/${cases.length} case(s) `
        + `could not be evaluated. Artifacts: ${ARTIFACT_DIR}`,
      );
      process.exit(1);
    }
    console.error(
      `\n\ud83d\udeab dissertation mobile gate: ${failures.length}/${cases.length} case(s) failed. `
      + `Artifacts: ${ARTIFACT_DIR}`,
    );
    process.exit(2);
  }

  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(ARTIFACT_DIR, 'summary.json'),
    `${JSON.stringify({
      generatedAt: new Date().toISOString(),
      baseUrl,
      cases: cases.length,
      failures: [],
      passed: true,
    }, null, 2)}\n`,
  );

  console.log(
    `\u2705 dissertation mobile gate: ${games.length} game(s) \u00d7 ${VIEWPORTS.length} phone viewports; `
    + 'one-screen shell, contained game UI, 44px controls, and trusted touch bridge all passed',
  );
  process.exit(0);
})().catch((error) => {
  console.error(`check_dissertation_mobile: infrastructure error: ${error.message}`);
  process.exit(1);
});
