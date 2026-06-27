// GET /api/admin/telegram-players[?source=<tag>][&sort=source|first_source|last_seen_at|first_seen_at|username][&dir=asc|desc][&limit=500]

import { json, jsonError } from '../../_lib/response.js';
import { requireAdmin } from '../../_lib/adminAuth.js';
import { supabaseIsConfigured, supabaseRequest } from '../../_lib/supabase.js';

const SORT_FIELDS = new Set(['source', 'first_source', 'last_seen_at', 'first_seen_at', 'username']);

function cleanSourceTag(value) {
  const cleaned = String(value || '')
    .trim()
    .replace(/[^A-Za-z0-9_-]/g, '_')
    .slice(0, 64);
  return cleaned || '';
}

export async function onRequestGet({ request, env }) {
  const guard = await requireAdmin(request, env);
  if (guard) return guard;
  if (!supabaseIsConfigured(env)) return jsonError('supabase_not_configured', 503);

  const url = new URL(request.url);
  const limit = Math.max(1, Math.min(1000, parseInt(url.searchParams.get('limit') || '500', 10) || 500));
  const sort = SORT_FIELDS.has(url.searchParams.get('sort')) ? url.searchParams.get('sort') : 'last_seen_at';
  const dir = url.searchParams.get('dir') === 'asc' ? 'asc' : 'desc';
  const source = cleanSourceTag(url.searchParams.get('source'));

  const params = new URLSearchParams({
    select: 'telegram_user_id,username,first_name,last_name,language_code,is_premium,source,first_source,last_start_param,source_updated_at,first_seen_at,last_seen_at',
    limit: String(limit),
    order: `${sort}.${dir}.nullslast`,
  });
  if (source) params.set('source', `eq.${source}`);

  const rows = await supabaseRequest(env, `telegram_players?${params.toString()}`, {
    method: 'GET',
  });
  const players = Array.isArray(rows) ? rows : [];
  const sourceCounts = {};
  for (const row of players) {
    const key = row.source || '(none)';
    sourceCounts[key] = (sourceCounts[key] || 0) + 1;
  }

  return json({
    ok: true,
    count: players.length,
    players,
    sourceCounts,
    sort,
    dir,
    source: source || null,
    limit,
  }, 200, { 'cache-control': 'no-store' });
}
