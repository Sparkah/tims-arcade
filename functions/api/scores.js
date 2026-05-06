// Daily leaderboard API.
//
// GET  /api/scores?slug=daily_dodge&date=2026-05-06
//      → { entries: [{name, score, ts}, ...], total }
//      Returns top 50 sorted by score desc.
//
// POST /api/scores
//      body: { slug, date, name, score }
//      → { rank, total }   (rank=null if not in top 50)
//
// KV key shape: scores:<slug>:<date> → JSON array of entries,
// capped at 100 (we keep more than top 50 so the cutoff has slack).
//
// Anti-abuse:
//   - slug: a-z 0-9 _ - max 40
//   - date: YYYY-MM-DD only
//   - name: 1-16 chars, alnum + space + - _ . (no HTML, no @)
//   - score: integer 0-1000000 (per-game ceiling enforced client-side anyway)
//   - per-IP: 30 submissions / day per slug (KV TTL 25h)

const NAME_RE = /^[\wÀ-￿ \-.]{1,16}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SLUG_RE = /^[a-z0-9_-]{1,40}$/i;
const TOP_N = 50;
const CAP_N = 100;

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const slug = String(url.searchParams.get('slug') || '');
  const date = String(url.searchParams.get('date') || todayUtc());

  if (!SLUG_RE.test(slug)) return jsonError('bad slug', 400);
  if (!DATE_RE.test(date)) return jsonError('bad date', 400);

  const key = `scores:${slug}:${date}`;
  const list = (await env.VOTES.get(key, 'json')) || [];
  return Response.json({
    entries: list.slice(0, TOP_N),
    total: list.length,
  }, {
    headers: { 'cache-control': 'public, max-age=15' },
  });
}

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); }
  catch { return jsonError('bad json', 400); }

  const slug  = String(body.slug || '');
  const date  = String(body.date || '');
  const name  = String(body.name || '').trim();
  const score = parseInt(body.score);

  if (!SLUG_RE.test(slug)) return jsonError('bad slug', 400);
  if (!DATE_RE.test(date)) return jsonError('bad date', 400);
  if (!NAME_RE.test(name)) return jsonError('bad name (1-16 chars, letters/digits/space/-_.)', 400);
  if (!Number.isFinite(score) || score < 0 || score > 1000000) return jsonError('bad score', 400);

  // Date guard — only accept today or yesterday (timezone slop)
  const validDates = recentValidDates();
  if (!validDates.includes(date)) return jsonError('date must be today or yesterday UTC', 400);

  // Per-IP rate limit
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const rateKey = `scoresrate:${slug}:${ip}:${date}`;
  const rate = parseInt(await env.VOTES.get(rateKey)) || 0;
  if (rate >= 30) return jsonError('rate limit', 429);
  await env.VOTES.put(rateKey, String(rate + 1), { expirationTtl: 25 * 60 * 60 });

  // Insert + sort + cap
  const key = `scores:${slug}:${date}`;
  const list = (await env.VOTES.get(key, 'json')) || [];

  // De-dupe by name: keep highest score per name (avoids spam-rerolls inflating list)
  const existing = list.findIndex(e => e.name === name);
  if (existing >= 0) {
    if (score <= list[existing].score) {
      // existing better — return current rank without updating
      const rank = list.findIndex(e => e.name === name) + 1;
      return Response.json({ rank: rank > 0 ? rank : null, total: list.length });
    }
    list.splice(existing, 1);
  }

  list.push({ name, score, ts: Date.now() });
  list.sort((a, b) => b.score - a.score || a.ts - b.ts); // ties broken by who submitted first
  if (list.length > CAP_N) list.length = CAP_N;

  await env.VOTES.put(key, JSON.stringify(list), {
    expirationTtl: 60 * 24 * 60 * 60,  // 60 days
  });

  const rank = list.findIndex(e => e.name === name && e.score === score) + 1;
  return Response.json({ rank: rank > 0 && rank <= TOP_N ? rank : null, total: list.length });
}

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}
function recentValidDates() {
  const d = new Date();
  const today = d.toISOString().slice(0, 10);
  d.setUTCDate(d.getUTCDate() - 1);
  return [today, d.toISOString().slice(0, 10)];
}
function jsonError(msg, status) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
