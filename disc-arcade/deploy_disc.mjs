#!/usr/bin/env node
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

const apiFiles = [
  'functions/api/disc-token.js',
  'functions/api/disc-oauth.js',
  'functions/api/disc-auth.js',
  'functions/api/disc-score.js',
  'functions/api/disc-run.js',
  'functions/_lib/cors.js',
  'functions/_lib/discordAuth.js',
  'functions/_lib/rateLimit.js',
  'functions/_lib/response.js',
  'functions/_lib/supabase.js',
  'functions/_lib/validate.js',
];

const activityMiddleware = `const HSTS = 'max-age=31536000';
const ACTIVITY_CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "script-src 'self' 'unsafe-inline' 'report-sample' https://static.cloudflareinsights.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "media-src 'self' data: blob: https:",
  "connect-src 'self' https://cloudflareinsights.com",
  "frame-src 'self' https:",
  "worker-src 'self' blob:",
  "form-action 'self'",
  "frame-ancestors 'self' https://discord.com https://*.discord.com https://*.discordsays.com",
  'upgrade-insecure-requests',
].join('; ');

function isHtml(headers) {
  return (headers.get('content-type') || '').toLowerCase().includes('text/html');
}

export async function onRequest(context) {
  const response = await context.next();
  const headers = new Headers(response.headers);
  headers.set('Strict-Transport-Security', HSTS);
  if (isHtml(headers)) headers.set('Content-Security-Policy', ACTIVITY_CSP);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
`;

const activityHeaders = `/*
  Strict-Transport-Security: max-age=31536000
  Content-Security-Policy: default-src 'self'; base-uri 'self'; object-src 'none'; script-src 'self' 'unsafe-inline' 'report-sample' https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; media-src 'self' data: blob: https:; connect-src 'self' https://cloudflareinsights.com; frame-src 'self' https:; worker-src 'self' blob:; form-action 'self'; frame-ancestors 'self' https://discord.com https://*.discord.com https://*.discordsays.com; upgrade-insecure-requests
  Referrer-Policy: strict-origin-when-cross-origin
  X-Content-Type-Options: nosniff
`;

const wranglerConfig = `name = "gfa-discord"
compatibility_date = "2025-01-01"
pages_build_output_dir = "."

[[kv_namespaces]]
binding = "VOTES"
id = "77b47ed18e7549dcb26673a3f834619e"
`;

function run(command, args, cwd) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { cwd, stdio: 'inherit' });
    child.on('exit', (code) => {
      if (code === 0) resolveRun();
      else reject(new Error(`${command} exited ${code}`));
    });
  });
}

const temp = await mkdtemp(join(tmpdir(), 'gfa-discord-pages-'));
try {
  await cp(here, temp, {
    recursive: true,
    filter: (source) => !source.includes('/games/.git') && !source.endsWith('/deploy_disc.mjs'),
  });
  for (const rel of apiFiles) {
    const target = join(temp, rel);
    await mkdir(dirname(target), { recursive: true });
    await cp(join(root, rel), target);
  }
  const middlewareTarget = join(temp, 'functions/_middleware.js');
  await mkdir(dirname(middlewareTarget), { recursive: true });
  await writeFile(middlewareTarget, activityMiddleware);
  await writeFile(join(temp, '_headers'), activityHeaders);
  await writeFile(join(temp, 'wrangler.toml'), wranglerConfig);
  await run('npx', ['wrangler', 'pages', 'deploy', '.', '--project-name', 'gfa-discord', '--branch', 'main', '--commit-dirty=true'], temp);
} finally {
  await rm(temp, { recursive: true, force: true });
}
