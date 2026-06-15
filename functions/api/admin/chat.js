// Chat moderation (token-gated, mirrors admin/stats.js auth). Tim 2026-06-15.
//   GET  /api/admin/chat?token=         -> recent lounge messages WITH poster IPs
//   POST /api/admin/chat?token= {action}:
//      clear            -> wipe all messages
//      delete  {id}     -> remove one message
//      ban     {ip}     -> block an IP from posting (90-day TTL)
//      unban   {ip}     -> lift a ban
// UI: /chat-mod (chat-mod.html).

import { json, jsonError } from '../../_lib/response.js';

const TAIL = 'chat:lounge:lounge:tail';
const RETENTION = 2 * 60 * 60;
const BAN_TTL = 60 * 60 * 24 * 90;

export async function onRequestGet({ request, env }) {
  const a = auth(request, env); if (a !== true) return a;
  let rows = [];
  try { rows = (await env.VOTES.get(TAIL, 'json')) || []; } catch { rows = []; }
  rows.sort((x, y) => String(x.id).localeCompare(String(y.id)));
  return ns(json({ ok: true, messages: rows }));
}

export async function onRequestPost({ request, env }) {
  const a = auth(request, env); if (a !== true) return a;
  let body;
  try { body = await request.json(); } catch { return jsonError('bad_json', 400); }
  const action = String(body.action || '');

  if (action === 'clear') {
    await env.VOTES.delete(TAIL);
    return ns(json({ ok: true, cleared: true }));
  }
  if (action === 'delete') {
    const id = String(body.id || '');
    let rows = [];
    try { rows = (await env.VOTES.get(TAIL, 'json')) || []; } catch { rows = []; }
    const before = rows.length;
    rows = rows.filter(m => String(m.id) !== id);
    await env.VOTES.put(TAIL, JSON.stringify(rows), { expirationTtl: RETENTION });
    return ns(json({ ok: true, removed: before - rows.length }));
  }
  if (action === 'ban' || action === 'unban') {
    const ip = String(body.ip || '').trim();
    if (!ip) return jsonError('bad_ip', 400);
    if (action === 'ban') await env.VOTES.put(`chatban:${ip}`, '1', { expirationTtl: BAN_TTL });
    else await env.VOTES.delete(`chatban:${ip}`);
    return ns(json({ ok: true, [action === 'ban' ? 'banned' : 'unbanned']: ip }));
  }
  return jsonError('bad_action', 400);
}

function auth(request, env) {
  const tok = request.headers.get('x-admin-token') || new URL(request.url).searchParams.get('token') || '';
  if (!env.ADMIN_TOKEN) return jsonError('admin_token_not_configured', 500);
  if (tok !== env.ADMIN_TOKEN) return jsonError('forbidden', 403);
  return true;
}
function ns(r) { r.headers.set('cache-control', 'no-store'); return r; }
