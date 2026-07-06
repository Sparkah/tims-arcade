#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const projectDir = dirname(fileURLToPath(import.meta.url));
const galleryRoot = dirname(projectDir);
const sourceGameDir = resolve(projectDir, 'source/game');
const defaultOutRoot = resolve(projectDir, 'dist');

function findAgentsRoot() {
  if (process.env.AGENTS_ROOT && existsSync(resolve(process.env.AGENTS_ROOT, 'Itch/megaton'))) {
    return resolve(process.env.AGENTS_ROOT);
  }
  let cur = galleryRoot;
  for (let i = 0; i < 8; i += 1) {
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
const platforms = {
  itch: {
    reference: resolve(agentsRoot, 'Itch/megaton'),
    patches: null,
  },
  telegram: {
    reference: resolve(galleryRoot, 'tg-megaton'),
    patches: resolve(projectDir, 'platforms/telegram/patches'),
  },
};

function parseArgs(argv) {
  const opts = { platform: 'all', outRoot: defaultOutRoot };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--platform') opts.platform = argv[++i] || '';
    else if (arg === '--out') opts.outRoot = resolve(argv[++i] || '');
    else if (arg === '--help' || arg === '-h') opts.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return opts;
}

function usage() {
  console.log(`Usage: node megaton/build.mjs [--platform itch|telegram|all] [--out DIR]

Builds generated Megaton packages from:
- megaton/source/game/                  shared gameplay source
- megaton/platforms/telegram/patches/   current Telegram overlay
- live package references               wrappers/assets copied as package shells

Default output: megaton/dist/{itch,telegram}
`);
}

function copyPackageShell(reference, outDir) {
  if (!existsSync(reference)) throw new Error(`Missing package reference: ${reference}`);
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  cpSync(reference, outDir, {
    recursive: true,
    dereference: false,
    filter(src) {
      const rel = relative(reference, src);
      if (!rel) return true;
      if (rel === 'output' || rel.startsWith(`output/`)) return false;
      if (rel === '.DS_Store' || rel.endsWith('/.DS_Store')) return false;
      return true;
    },
  });
}

function overlaySharedGame(outDir) {
  const files = ['index.html', 'gf-lib.js', 'audio.js', 'levels.json', 'CREDITS.txt'];
  const gameOut = resolve(outDir, 'game');
  mkdirSync(gameOut, { recursive: true });
  for (const file of files) {
    const src = resolve(sourceGameDir, file);
    if (!existsSync(src)) throw new Error(`Missing shared game source: ${src}`);
    cpSync(src, resolve(gameOut, file));
  }
}

function applyPatches(outDir, patchesDir) {
  if (!patchesDir || !existsSync(patchesDir)) return;
  const patches = readdirSync(patchesDir).filter((name) => name.endsWith('.patch')).sort();
  for (const patch of patches) {
    const patchPath = resolve(patchesDir, patch);
    const result = spawnSync('patch', ['-p2', '-i', patchPath], {
      cwd: outDir,
      encoding: 'utf8',
    });
    if (result.status !== 0) {
      throw new Error(`Failed to apply ${patch}\n${result.stdout || ''}${result.stderr || ''}`);
    }
  }
}

function buildPlatform(name, outRoot) {
  const cfg = platforms[name];
  if (!cfg) throw new Error(`Unknown platform: ${name}`);
  const outDir = resolve(outRoot, name);
  copyPackageShell(cfg.reference, outDir);
  overlaySharedGame(outDir);
  applyPatches(outDir, cfg.patches);
  return outDir;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    usage();
    return;
  }
  if (!existsSync(sourceGameDir)) throw new Error(`Missing shared source folder: ${sourceGameDir}`);
  const targets = opts.platform === 'all' ? Object.keys(platforms) : [opts.platform];
  for (const target of targets) {
    const out = buildPlatform(target, opts.outRoot);
    console.log(`${target.padEnd(8)} ${relative(galleryRoot, out)}`);
  }
}

try {
  main();
} catch (err) {
  console.error(err && err.message ? err.message : err);
  process.exit(1);
}
