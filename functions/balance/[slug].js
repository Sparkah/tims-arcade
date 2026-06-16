// Live game-balance endpoint, sourced from a Google Sheet.
//
//   GET /balance/<slug>(.json)  -> 200 balance JSON | 204 (game uses baked-in)
//
// Fetches a PUBLISHED Google Sheet (CSV) for the slug and converts it to the
// game's balance schema { ascension:{...}, nodes:[{key,costs,baseCap,per}] },
// edge-cached ~60s. DATA ONLY - the game merges this over its baked-in
// #balance-data block with a per-game allowlist + clamps, and falls back to the
// baked-in values on any non-200 / failure, so a bad sheet can NEVER break a
// game. No KV (so this is off the write/list budget). CORS * for cross-origin
// Yandex / CrazyGames iframes; Yandex ALSO needs game-factory.tech in
// Console -> Settings -> External hosts at submission time (until then the
// game-side fetch times out and baked defaults apply - the required failure mode).
//
// To wire a game: publish a Google Sheet to the web as CSV (File -> Share ->
// Publish to web -> choose the tab -> CSV) and add its URL below. Sheet layout
// is a flat two-column table (see functions/balance/merge_conquest.sample.csv):
//   path,value
//   ascension.enemyMult,1.5
//   recruitHp.costs,2|4
//   recruitHp.baseCap,2

const SHEET_CSV = {
  // slug -> a CSV URL for the game's balance sheet. We fetch SERVER-SIDE, so the
  // sheet only needs "anyone with the link can view" (no publish-to-web needed);
  // the /export endpoint returns raw cells (gviz mis-types the "2|4" cost cells,
  // so do NOT use gviz here). Tim's sheet, 2026-06-16:
  merge_conquest: 'https://docs.google.com/spreadsheets/d/1IeBqoruXP7INus9Mc88n-0FIq13epAjJuzk-MOZ1XzQ/export?format=csv',
};

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, OPTIONS',
  'access-control-allow-headers': 'content-type',
};

export function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

function parseCsvLine(line) {
  const out = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += c;
    } else {
      if (c === '"') q = true;
      else if (c === ',') { out.push(cur); cur = ''; }
      else cur += c;
    }
  }
  out.push(cur);
  return out;
}

// Flat key/value sheet -> balance JSON. Keys are dotted: `ascension.<field>` or
// `<nodeKey>.<field>` where field is costs (pipe-separated, e.g. "2|4"), baseCap
// or per. Unknown / malformed rows are skipped; the client allowlists + clamps.
export function csvToBalance(csv) {
  const ascension = {}, nodes = {};
  const lines = String(csv || '').split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim()) continue;
    const cols = parseCsvLine(line);
    if (cols.length < 2) continue;
    const path = (cols[0] || '').trim();
    const raw = (cols[1] || '').trim();
    if (!path || /^path$/i.test(path)) continue;
    const dot = path.indexOf('.');
    if (dot < 0) continue;
    const head = path.slice(0, dot), field = path.slice(dot + 1);
    if (head === 'ascension') {
      const n = Number(raw);
      if (Number.isFinite(n)) ascension[field] = n;
    } else {
      nodes[head] = nodes[head] || { key: head };
      if (field === 'costs') {
        const arr = raw.split('|').map(x => Number(x.trim())).filter(x => Number.isFinite(x) && x > 0);
        if (arr.length) nodes[head].costs = arr;
      } else {
        const n = Number(raw);
        if (Number.isFinite(n)) nodes[head][field] = n;
      }
    }
  }
  // Drop nodes that ended up with only a key (no usable field) so the payload
  // stays clean; the client would ignore them anyway.
  const usable = Object.values(nodes).filter((n) => 'costs' in n || 'baseCap' in n || 'per' in n);
  return { ascension, nodes: usable };
}

export async function onRequestGet({ params }) {
  const slug = String(params.slug || '').replace(/\.json$/i, '').trim().toLowerCase();
  const noContent = (maxAge) => new Response(null, { status: 204, headers: { ...CORS, 'cache-control': 'public, max-age=' + maxAge } });
  if (!/^[a-z0-9_-]{1,64}$/.test(slug)) return noContent(60);
  const csvUrl = SHEET_CSV[slug];
  if (!csvUrl) return noContent(60); // no sheet wired yet -> game uses baked-in
  try {
    const r = await fetch(csvUrl, { cf: { cacheTtl: 60, cacheEverything: true }, redirect: 'follow' });
    if (!r.ok) return noContent(30);
    const csv = await r.text();
    const bal = csvToBalance(csv);
    if (!bal.nodes.length && !Object.keys(bal.ascension).length) return noContent(30);
    return new Response(JSON.stringify(bal), {
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8', ...CORS, 'cache-control': 'public, max-age=60' },
    });
  } catch (e) {
    return noContent(30);
  }
}
