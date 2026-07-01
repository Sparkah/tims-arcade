#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const FREE_DAILY_CAPS = {
  read: 100000,
  write: 1000,
  list: 1000,
  delete: 1000,
};

function parseArgs(argv) {
  const out = { days: 4, hourly: false, json: false, account: process.env.CLOUDFLARE_ACCOUNT_ID || '' };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--hourly') out.hourly = true;
    else if (arg === '--json') out.json = true;
    else if (arg === '--account') out.account = argv[++i] || '';
    else if (arg === '--days') out.days = Math.max(1, parseInt(argv[++i], 10) || out.days);
    else if (arg === '--start') out.start = argv[++i] || '';
    else if (arg === '--end') out.end = argv[++i] || '';
    else if (arg === '-h' || arg === '--help') out.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return out;
}

function usage() {
  return [
    'Usage: CLOUDFLARE_ACCOUNT_ID=<account> node scripts/kv_usage_report.mjs [--days 4] [--hourly] [--json]',
    '',
    'Options:',
    '  --account <id>   Cloudflare account id. Overrides CLOUDFLARE_ACCOUNT_ID.',
    '  --days <n>       UTC days to include when --start is omitted. Default: 4.',
    '  --start <date>   Inclusive UTC date, YYYY-MM-DD.',
    '  --end <date>     Inclusive UTC date, YYYY-MM-DD. Default: today UTC.',
    '  --hourly         Also include hourly rows for the same date range.',
    '  --json           Print machine-readable JSON instead of tables.',
    '',
    'Auth: uses CLOUDFLARE_API_TOKEN / CF_API_TOKEN first, then Wrangler OAuth config.',
  ].join('\n');
}

function utcDateString(date) {
  return date.toISOString().slice(0, 10);
}

function addUtcDays(dateString, delta) {
  const d = new Date(`${dateString}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return utcDateString(d);
}

function dateRange(opts) {
  const end = opts.end || utcDateString(new Date());
  const start = opts.start || addUtcDays(end, -(opts.days - 1));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
    throw new Error('Dates must be YYYY-MM-DD');
  }
  return { start, end };
}

function readWranglerToken() {
  const candidates = [
    path.join(os.homedir(), 'Library/Preferences/.wrangler/config/default.toml'),
    path.join(os.homedir(), '.wrangler/config/default.toml'),
    path.join(os.homedir(), '.config/.wrangler/config/default.toml'),
  ];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, 'utf8');
    const token = text.match(/^\s*(?:oauth_token|api_token)\s*=\s*"([^"]+)"/m)?.[1];
    if (token) return token;
  }
  return '';
}

function readNamespaceLabels() {
  const labels = {};
  if (!fs.existsSync('wrangler.toml')) return labels;
  const text = fs.readFileSync('wrangler.toml', 'utf8');
  const blocks = text.matchAll(/\[\[kv_namespaces\]\]([\s\S]*?)(?=\n\[\[|\n\[|$)/g);
  for (const [, block] of blocks) {
    const binding = block.match(/^\s*binding\s*=\s*"([^"]+)"/m)?.[1];
    const id = block.match(/^\s*id\s*=\s*"([^"]+)"/m)?.[1];
    if (binding && id) labels[id] = binding;
  }
  return labels;
}

async function graphql(token, query, variables) {
  const res = await fetch('https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });
  const body = await res.json();
  if (!res.ok || body.errors) {
    const messages = (body.errors || []).map((err) => err.message).join('; ') || `HTTP ${res.status}`;
    throw new Error(`Cloudflare GraphQL failed: ${messages}`);
  }
  return body.data;
}

function pct(requests, action) {
  const cap = FREE_DAILY_CAPS[action];
  return cap ? Number(((requests / cap) * 100).toFixed(1)) : null;
}

function todayProjection(date, requests, action) {
  const cap = FREE_DAILY_CAPS[action];
  const today = utcDateString(new Date());
  if (!cap || date !== today) return null;
  const now = new Date();
  const secondsElapsed = now.getUTCHours() * 3600 + now.getUTCMinutes() * 60 + now.getUTCSeconds();
  const dayFraction = Math.max(secondsElapsed / 86400, 1 / 1440);
  return Math.round(requests / dayFraction);
}

function formatRows(groups, labels) {
  const byKey = new Map();
  for (const row of groups) {
    const d = row.dimensions;
    const key = `${d.date}\t${d.namespaceId}\t${d.actionType}`;
    const current = byKey.get(key) || {
      date: d.date,
      namespace: labels[d.namespaceId] || d.namespaceId,
      action: d.actionType,
      requests: 0,
    };
    current.requests += row.sum.requests;
    byKey.set(key, current);
  }
  return [...byKey.values()]
    .map((row) => {
      const projected = todayProjection(row.date, row.requests, row.action);
      return {
        ...row,
        pctOfFreeCap: pct(row.requests, row.action),
        projectedToday: projected,
        projectedPctOfFreeCap: projected == null ? null : pct(projected, row.action),
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date)
      || a.namespace.localeCompare(b.namespace)
      || a.action.localeCompare(b.action));
}

function formatHourly(groups, labels) {
  const byKey = new Map();
  for (const row of groups) {
    const d = row.dimensions;
    const key = `${d.datetimeHour}\t${d.namespaceId}`;
    const current = byKey.get(key) || {
      hour: d.datetimeHour,
      namespace: labels[d.namespaceId] || d.namespaceId,
      read: 0,
      write: 0,
      list: 0,
      delete: 0,
    };
    current[d.actionType] = (current[d.actionType] || 0) + row.sum.requests;
    byKey.set(key, current);
  }
  return [...byKey.values()].sort((a, b) => a.hour.localeCompare(b.hour) || a.namespace.localeCompare(b.namespace));
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(usage());
    return;
  }
  if (!opts.account) {
    throw new Error('Missing Cloudflare account id. Set CLOUDFLARE_ACCOUNT_ID or pass --account.');
  }
  const token = process.env.CLOUDFLARE_API_TOKEN || process.env.CF_API_TOKEN || readWranglerToken();
  if (!token) {
    throw new Error('Missing Cloudflare token. Set CLOUDFLARE_API_TOKEN or run wrangler login.');
  }

  const { start, end } = dateRange(opts);
  const labels = readNamespaceLabels();
  const dailyQuery = `query KvDaily($accountTag: string, $start: Date, $end: Date) {
    viewer {
      accounts(filter: {accountTag: $accountTag}) {
        kvOperationsAdaptiveGroups(
          limit: 1000
          filter: {date_geq: $start, date_leq: $end}
          orderBy: [date_ASC, namespaceId_ASC, actionType_ASC]
        ) {
          dimensions { date namespaceId actionType }
          sum { requests }
        }
      }
    }
  }`;
  const variables = { accountTag: opts.account, start, end };
  const dailyData = await graphql(token, dailyQuery, variables);
  const dailyGroups = dailyData.viewer.accounts.flatMap((account) => account.kvOperationsAdaptiveGroups);
  const daily = formatRows(dailyGroups, labels);

  let hourly = [];
  if (opts.hourly) {
    const hourlyQuery = `query KvHourly($accountTag: string, $start: Time, $end: Time) {
      viewer {
        accounts(filter: {accountTag: $accountTag}) {
          kvOperationsAdaptiveGroups(
            limit: 1000
            filter: {datetimeHour_geq: $start, datetimeHour_leq: $end}
            orderBy: [datetimeHour_ASC, namespaceId_ASC, actionType_ASC]
          ) {
            dimensions { datetimeHour namespaceId actionType }
            sum { requests }
          }
        }
      }
    }`;
    const hourlyData = await graphql(token, hourlyQuery, {
      accountTag: opts.account,
      start: `${start}T00:00:00Z`,
      end: `${end}T23:59:59Z`,
    });
    hourly = formatHourly(hourlyData.viewer.accounts.flatMap((account) => account.kvOperationsAdaptiveGroups), labels);
  }

  if (opts.json) {
    console.log(JSON.stringify({ start, end, daily, hourly }, null, 2));
    return;
  }

  console.log(`Workers KV usage, UTC dates ${start} through ${end}`);
  console.log('Free daily caps: read 100000, write/list/delete 1000. Paid plan uses monthly allowances.');
  console.table(daily);
  if (opts.hourly) console.table(hourly);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
