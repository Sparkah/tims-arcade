// GET  /api/admin/suggestions[?days=14]
// POST /api/admin/suggestions  body: { id, status, builtSlug? }
//
// Admin-only view of player suggestions captured via /api/suggest. Returns
// the most recent N days, newest first. POST marks a suggestion as
// 'built' / 'dismissed' (or back to 'new').
//
// Also used by the factory leader's portfolio_context step at 09:15 to
// pull all open ('new') suggestions for today's idea-ranking.
//
// The GET does a suggestion:* KV LIST, so it is edge-cached (auth verified
// first; key by params) — the free tier caps LIST at 1000/day and this is hit
// by the dashboard + the 09:15 leader. See Knowledge/Learnings/KV List Budget.

import { edgeCached } from '../../_lib/edgecache.js';
import { requireAdmin } from '../../_lib/adminAuth.js';

const MAX_DAYS = 30;

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const guard = await requireAdmin(request, env);
  if (guard) return guard;

  const days = Math.min(parseInt(url.searchParams.get('days') || '14') || 14, MAX_DAYS);
  const statusFilter = url.searchParams.get('status') || ''; // optional: new|built|dismissed
  return edgeCached(`/api-admin-suggestions?d=${days}&s=${statusFilter}`, {},
    () => buildSuggestions(env, days, statusFilter));
}

async function buildSuggestions(env, days, statusFilter) {
  const cutoff = Date.now() - days * 86400_000;

  const out = [];
  let cursor;
  do {
    const list = await env.VOTES.list({ prefix: 'suggestion:', cursor });
    for (const k of list.keys) {
      const tsStr = k.name.split(':')[1];
      const ts = parseInt(tsStr);
      if (!ts || ts < cutoff) continue;
      const raw = await env.VOTES.get(k.name);
      if (!raw) continue;
      let row;
      try { row = JSON.parse(raw); } catch { continue; }
      if (statusFilter && row.status !== statusFilter) continue;
      out.push({ key: k.name, ...row });
    }
    cursor = list.list_complete ? null : list.cursor;
  } while (cursor);

  out.sort((a, b) => b.ts - a.ts);

  return new Response(JSON.stringify({
    generated_at: new Date().toISOString(),
    days,
    count: out.length,
    new_count: out.filter(s => s.status === 'new').length,
    suggestions: out,
  }), { headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=0, s-maxage=300' } });
}

export async function onRequestPost({ request, env }) {
  const guard = await requireAdmin(request, env);
  if (guard) return guard;

  let body;
  try { body = await request.json(); } catch { return jsonError('invalid_json', 400); }
  const id = String(body.id || '');
  const status = String(body.status || '');
  const builtSlug = body.builtSlug ? String(body.builtSlug).slice(0, 40) : null;

  if (!id.startsWith('suggestion:')) return jsonError('bad_id', 400);
  if (!['new', 'built', 'dismissed'].includes(status)) return jsonError('bad_status', 400);

  const raw = await env.VOTES.get(id);
  if (!raw) return jsonError('not_found', 404);
  const row = JSON.parse(raw);
  row.status = status;
  if (status === 'built' && builtSlug) row.builtSlug = builtSlug;
  if (status === 'built') row.builtAt = Date.now();
  await env.VOTES.put(id, JSON.stringify(row));

  return new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json' } });
}

function jsonError(msg, status) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
