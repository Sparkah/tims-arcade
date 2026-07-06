#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const scriptDir = dirname(fileURLToPath(import.meta.url));

function findGalleryRoot() {
  let cur = scriptDir;
  for (let i = 0; i < 8; i += 1) {
    if (existsSync(resolve(cur, 'tg-megaton/index.html'))) return cur;
    const next = dirname(cur);
    if (next === cur) break;
    cur = next;
  }
  return resolve(scriptDir, '../..');
}

const galleryRoot = findGalleryRoot();

function findAgentsRoot() {
  if (process.env.AGENTS_ROOT && existsSync(resolve(process.env.AGENTS_ROOT, 'Itch/megaton'))) {
    return resolve(process.env.AGENTS_ROOT);
  }
  let cur = galleryRoot;
  for (let i = 0; i < 6; i += 1) {
    if (existsSync(resolve(cur, 'Itch/megaton')) && existsSync(resolve(cur, 'Games/211_megaton'))) return cur;
    const next = dirname(cur);
    if (next === cur) break;
    cur = next;
  }
  const fallback = '/Users/timmarkin/Agents';
  if (existsSync(resolve(fallback, 'Itch/megaton'))) return fallback;
  return dirname(galleryRoot);
}

const agentsRoot = findAgentsRoot();
const sourceRoot = resolve(scriptDir, 'source/game');
const paths = {
  sourceGame: resolve(sourceRoot, 'index.html'),
  sourceGfLib: resolve(sourceRoot, 'gf-lib.js'),
  sourceAudio: resolve(sourceRoot, 'audio.js'),
  sourceLevels: resolve(sourceRoot, 'levels.json'),
  itchWrapper: resolve(agentsRoot, 'Itch/megaton/index.html'),
  itchGame: resolve(agentsRoot, 'Itch/megaton/game/index.html'),
  itchLevels: resolve(agentsRoot, 'Itch/megaton/game/levels.json'),
  legacyGame: resolve(agentsRoot, 'Games/211_megaton/index.html'),
  telegramWrapper: resolve(galleryRoot, 'tg-megaton/index.html'),
  telegramGame: resolve(galleryRoot, 'tg-megaton/game/index.html'),
  telegramGfLib: resolve(galleryRoot, 'tg-megaton/game/gf-lib.js'),
  telegramAudio: resolve(galleryRoot, 'tg-megaton/game/audio.js'),
  telegramLevels: resolve(galleryRoot, 'tg-megaton/game/levels.json'),
  itchGfLib: resolve(agentsRoot, 'Itch/megaton/game/gf-lib.js'),
  itchAudio: resolve(agentsRoot, 'Itch/megaton/game/audio.js'),
};

const markers = [
  'TELEGRAM_BUILD',
  'ITCH_GAME',
  'ITCH_BUILD',
  'HAS_TG',
  'PUBLIC_WEB_BUILD',
  'window.__tg',
  '__tgApplyMegatonProduct',
  'pushTelegramState',
  'godPower',
  'skinBoost',
  'equippedSkin',
  'GACHA_',
  'ITCH_DAILY_TRACK',
  'Adsgram',
  'Monetag',
  'TON_CONNECT_UI',
  'openInvoice',
  'u_topple',
  'u_meltdown',
  'u_tidal',
  'u_fireworks',
  'u_eye',
  'hasSkyscraper',
  'hasPowerplant',
  'hasPort',
  'hasPark',
  'hasCathedral',
  'skyscraper',
  'powerplant',
  'port',
  'park',
  'cathedral',
  'toppleLvl',
  'meltdownLvl',
  'tidalLvl',
  'fireworksLvl',
  'eyeLvl',
  'function topple',
  'function meltdown',
  'function tidal',
  'function fireworks',
  'meltZones',
  'fireworkBursts',
  "lvl + '/' + mx",
];

function read(file) {
  return existsSync(file) ? readFileSync(file, 'utf8') : '';
}

function sha(text) {
  return createHash('sha256').update(text).digest('hex').slice(0, 12);
}

function lineCount(text) {
  return text ? text.split(/\r?\n/).length - (text.endsWith('\n') ? 1 : 0) : 0;
}

function markerMap(text) {
  return Object.fromEntries(markers.map((marker) => [marker, text.includes(marker)]));
}

function diffStat(a, b) {
  if (!existsSync(a) || !existsSync(b)) return 'missing file';
  const result = spawnSync('git', ['diff', '--no-index', '--shortstat', a, b], { encoding: 'utf8' });
  const out = `${result.stdout || ''}${result.stderr || ''}`.trim();
  return out || 'identical';
}

function summarizeFile(label, file) {
  const text = read(file);
  return {
    label,
    path: file,
    rel: file.startsWith(galleryRoot) ? relative(galleryRoot, file) : relative(agentsRoot, file),
    exists: Boolean(text),
    lines: lineCount(text),
    sha: text ? sha(text) : '',
    markers: markerMap(text),
  };
}

function printMarkerDiff(left, right) {
  const rows = [];
  for (const marker of markers) {
    if (left.markers[marker] !== right.markers[marker]) {
      rows.push(`  ${marker}: ${left.label}=${left.markers[marker] ? 'yes' : 'no'} ${right.label}=${right.markers[marker] ? 'yes' : 'no'}`);
    }
  }
  return rows.length ? rows.join('\n') : '  none';
}

const itchWrapper = summarizeFile('itch-wrapper', paths.itchWrapper);
const telegramWrapper = summarizeFile('telegram-wrapper', paths.telegramWrapper);
const sourceGame = summarizeFile('source-game', paths.sourceGame);
const itchGame = summarizeFile('itch-game', paths.itchGame);
const telegramGame = summarizeFile('telegram-game', paths.telegramGame);
const legacyGame = summarizeFile('legacy-game', paths.legacyGame);
const sourceLevels = summarizeFile('source-levels', paths.sourceLevels);
const telegramLevels = summarizeFile('telegram-levels', paths.telegramLevels);

const report = {
  agentsRoot,
  galleryRoot,
  sourceRoot,
  files: [sourceGame, itchGame, telegramGame, legacyGame, sourceLevels, telegramLevels, itchWrapper, telegramWrapper],
  diffs: {
    wrapper: diffStat(paths.itchWrapper, paths.telegramWrapper),
    sourceToItchGame: diffStat(paths.sourceGame, paths.itchGame),
    sourceToTelegramGame: diffStat(paths.sourceGame, paths.telegramGame),
    sourceToTelegramLevels: diffStat(paths.sourceLevels, paths.telegramLevels),
    sourceToTelegramGfLib: diffStat(paths.sourceGfLib, paths.telegramGfLib),
    sourceToTelegramAudio: diffStat(paths.sourceAudio, paths.telegramAudio),
  },
  requiredCurrentException: [
    'Telegram may differ in SDK boot, Supabase save/load, AdsGram/Monetag, Stars/TON, paid products, missions, leaderboards, and Telegram-only local tester gates.',
    'Itch may differ in no-ad/no-IAP copy, free daily chest ladder, Itch metadata, and Itch GameAnalytics build string.',
    'Balance, levels, weakpoints, perk list, tutorial gameplay, core visuals, nuke behavior, and economy math should not drift.',
  ],
};

const wantsJson = process.argv.includes('--json');
const wantsCheck = process.argv.includes('--check');

if (wantsJson) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  console.log('Megaton single-source report');
  console.log(`Agents root : ${agentsRoot}`);
  console.log(`Gallery root: ${galleryRoot}`);
  console.log(`Source root : ${relative(galleryRoot, sourceRoot)}`);
  console.log('');
  for (const file of report.files) {
    console.log(`${file.label.padEnd(17)} ${String(file.lines).padStart(5)} lines  ${file.sha || 'missing'}  ${file.rel}`);
  }
  console.log('');
  console.log(`Wrapper diff : ${report.diffs.wrapper}`);
  console.log(`Source -> Itch game      : ${report.diffs.sourceToItchGame}`);
  console.log(`Source -> Telegram game  : ${report.diffs.sourceToTelegramGame}`);
  console.log(`Source -> Telegram levels: ${report.diffs.sourceToTelegramLevels}`);
  console.log(`Source -> Telegram gf-lib: ${report.diffs.sourceToTelegramGfLib}`);
  console.log(`Source -> Telegram audio : ${report.diffs.sourceToTelegramAudio}`);
  console.log('');
  console.log('Wrapper marker drift:');
  console.log(printMarkerDiff(itchWrapper, telegramWrapper));
  console.log('');
  console.log('Gameplay marker drift:');
  console.log(printMarkerDiff(sourceGame, telegramGame));
  console.log('');
  console.log('Allowed differences:');
  for (const line of report.requiredCurrentException) console.log(`- ${line}`);
}

if (wantsCheck) {
  const gameMustNotDrift = [
    'u_topple',
    'u_meltdown',
    'u_tidal',
    'u_fireworks',
    'u_eye',
    'hasSkyscraper',
    'hasPowerplant',
    'hasPort',
    'hasPark',
    'hasCathedral',
    'toppleLvl',
    'meltdownLvl',
    'tidalLvl',
    'fireworksLvl',
    'eyeLvl',
    'function topple',
    'function meltdown',
    'function tidal',
    'function fireworks',
    'meltZones',
    'fireworkBursts',
    "lvl + '/' + mx",
  ];
  const drift = gameMustNotDrift.filter((marker) => sourceGame.markers[marker] !== telegramGame.markers[marker]);
  const sharedFileDrift = [];
  if (report.diffs.sourceToTelegramLevels !== 'identical') sharedFileDrift.push('levels.json');
  if (report.diffs.sourceToTelegramGfLib !== 'identical') sharedFileDrift.push('gf-lib.js');
  if (report.diffs.sourceToTelegramAudio !== 'identical') sharedFileDrift.push('audio.js');
  if (drift.length || sharedFileDrift.length) {
    if (drift.length) console.error(`\nFAIL: gameplay markers differ: ${drift.join(', ')}`);
    if (sharedFileDrift.length) console.error(`\nFAIL: shared files differ: ${sharedFileDrift.join(', ')}`);
    process.exit(1);
  }
}
