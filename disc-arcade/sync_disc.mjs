// sync_disc.mjs - mirror the live Telegram library into the Discord Arcade hub.
// Reads the SAME curation the Telegram mini-app uses (/api/tg-bot-config + games.json
// + hidden + trending), replicates curateLibrary(), copies each self-contained game in
// Discord-safe (strip /sdk.js -> __GF_AUTOSTART), skips games that can't run in an
// Activity (multiplayer / external servers), and writes disc-arcade/games.json for the hub.
//
// Run:  node Gallery/disc-arcade/sync_disc.mjs        (from ~/Agents)
// Then: cd Gallery && npx wrangler pages deploy disc-arcade --project-name gfa-discord --branch main --commit-dirty=true
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('Gallery');
const SRC_GAMES = path.join(ROOT, 'games');
const THUMBS = path.join(ROOT, 'thumbs');
const DISC = path.join(ROOT, 'disc-arcade');
const DISC_GAMES = path.join(DISC, 'games');
const DISC_THUMBS = path.join(DISC, 'thumbs');
const ORIGIN = 'https://game-factory.tech';

// games that can't run as a same-origin copy inside a Discord Activity (external live server / multiplayer)
const RED_FLAG = /(wss?:\/\/|new WebSocket|socket\.io|\.onrender\.com|\.fly\.dev|PARTYKIT|colyseus|multiplayer\b)/i;

const j = async (u) => { try { const r = await fetch(ORIGIN + u); return await r.json(); } catch { return null; } };

function curate(all, cfg, hidden, trending) {
  const lib = (cfg && cfg.library) || {};
  const mode = lib.mode === 'selected' ? 'selected' : 'all';
  const inc = lib.includeSlugs || [], exc = new Set(lib.excludeSlugs || []), pin = lib.pinnedSlugs || [];
  const maxG = Math.max(1, Math.min(Number(lib.maxGames) || 180, 240));
  const tr = (trending && trending.games) || {};
  let playable = all.filter(g => !g.external && g.published !== false && g.slug);
  playable.forEach(g => { g._score = (tr[g.slug] && tr[g.slug].score) || 0; });
  const bySlug = Object.fromEntries(playable.map(g => [g.slug, g]));
  let vis = playable.filter(g => !hidden.has(g.slug));
  if (mode === 'selected' && inc.length) vis = inc.map(s => bySlug[s]).filter(g => g && !hidden.has(g.slug));
  else vis = vis.filter(g => !exc.has(g.slug));
  const pr = Object.fromEntries(pin.map((s, i) => [s, i]));
  vis.sort((a, b) => {
    const ap = pr[a.slug], bp = pr[b.slug];
    if (ap !== undefined || bp !== undefined) return (ap ?? 9999) - (bp ?? 9999);
    return (b._score - a._score) || ((Number(b.num) || 0) - (Number(a.num) || 0));
  });
  return vis.slice(0, maxG);
}

function discordify(gameDir) {
  const idx = path.join(gameDir, 'index.html');
  if (!fs.existsSync(idx)) return false;
  let html = fs.readFileSync(idx, 'utf8');
  // strip the platform SDK stub (404s on Pages) and force autostart
  html = html.replace(/<script src="\/sdk\.js"><\/script>/, '<script>window.__GF_AUTOSTART=1;</script>');
  // if no autostart got injected (some games differ), prepend one before gf-lib
  if (!/__GF_AUTOSTART\s*=\s*1/.test(html)) html = html.replace(/<script src="\.\/gf-lib\.js">/, '<script>window.__GF_AUTOSTART=1;</script>\n<script src="./gf-lib.js">');
  fs.writeFileSync(idx, html);
  const log = path.join(gameDir, 'iterations.log'); if (fs.existsSync(log)) fs.rmSync(log);
  return true;
}

(async () => {
  const [all, cfg, hiddenRaw, trending] = await Promise.all([j('/games.json'), j('/api/tg-bot-config'), j('/api/hidden'), j('/api/trending')]);
  if (!Array.isArray(all)) { console.error('games.json fetch failed'); process.exit(1); }
  const hidden = new Set((hiddenRaw && hiddenRaw.hidden) || []);
  const curated = curate(all, cfg, hidden, trending);
  console.log(`live library: ${curated.length} games (mode=${cfg?.library?.mode} v${cfg?.version})`);

  fs.mkdirSync(DISC_GAMES, { recursive: true });
  fs.mkdirSync(DISC_THUMBS, { recursive: true });
  const included = [], excluded = [];

  for (const g of curated) {
    const slug = g.slug;
    const src = path.join(SRC_GAMES, slug);
    if (!fs.existsSync(path.join(src, 'index.html'))) { excluded.push([slug, 'no source']); continue; }
    // red-flag scan (multiplayer / external server)
    let blob = '';
    for (const f of ['index.html', 'gf-lib.js', 'app.js', 'game.js']) { const p = path.join(src, f); if (fs.existsSync(p)) blob += fs.readFileSync(p, 'utf8'); }
    if (RED_FLAG.test(blob)) { excluded.push([slug, 'external/multiplayer']); continue; }
    // copy + discordify
    const dst = path.join(DISC_GAMES, slug);
    fs.rmSync(dst, { recursive: true, force: true });
    fs.cpSync(src, dst, { recursive: true });
    discordify(dst);
    // thumb
    let thumb = null;
    for (const ext of ['webp', 'png']) { const tp = path.join(THUMBS, `${slug}.${ext}`); if (fs.existsSync(tp)) { fs.copyFileSync(tp, path.join(DISC_THUMBS, `${slug}.${ext}`)); thumb = `./thumbs/${slug}.${ext}`; break; } }
    included.push({ slug, title: g.title || slug, genre: g.genre || '', thumb });
  }

  fs.writeFileSync(path.join(DISC, 'games.json'), JSON.stringify(included, null, 2));
  console.log(`\nINCLUDED (${included.length}):`);
  included.forEach(g => console.log('  +', g.slug, g.thumb ? '' : '(no thumb)'));
  console.log(`\nEXCLUDED (${excluded.length}):`);
  excluded.forEach(([s, r]) => console.log('  -', s, '::', r));
})();
