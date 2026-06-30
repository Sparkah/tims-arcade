// Chat moderation (token-gated). Tim 2026-06-15.
//   GET  /api/admin/chat   (header X-Admin-Token)     -> recent lounge messages WITH poster IPs
//   POST /api/admin/chat   (header X-Admin-Token, same-origin) {action}:
//      clear            -> wipe all messages
//      delete  {id}     -> remove one message
//      ban     {ip}     -> block an IP from posting (90-day TTL)
//      unban   {ip}     -> lift a ban
// UI: /chat-mod (chat-mod.html).
//
// Auth is HEADER-ONLY (no ?token= -> no querystring leak to logs/history) and POST
// is same-origin only (Codex review 2026-06-15). Reads/deletes PRUNE rows older
// than RETENTION and never extend a non-edit's TTL, so poster IPs can't be kept
// alive past the 24h window by repeated moderation.

import { json, jsonError, sameOriginOk } from '../../_lib/response.js';
import { requireAdmin } from '../../_lib/adminAuth.js';

const TAIL = 'chat:lounge:lounge:tail';
const RETENTION = 24 * 60 * 60;   // match chat.js: 24h rolling window (Tim 2026-06-15)
const BAN_TTL = 60 * 60 * 24 * 90;

async function readPruned(env) {
  let rows = [];
  try { rows = (await env.VOTES.get(TAIL, 'json')) || []; } catch { rows = []; }
  const minTs = Date.now() - RETENTION * 1000;
  return rows.filter(m => m && m.id && Number.isFinite(m.ts) && m.ts >= minTs);
}

export async function onRequestGet({ request, env }) {
  const guard = await requireAdmin(request, env); if (guard) return guard;
  const rows = (await readPruned(env)).sort((x, y) => String(x.id).localeCompare(String(y.id)));
  return ns(json({ ok: true, messages: rows }));
}

export async function onRequestPost({ request, env }) {
  const guard = await requireAdmin(request, env); if (guard) return guard;
  if (!sameOriginOk(request)) return jsonError('forbidden', 403);

  let body;
  try { body = await request.json(); } catch { return jsonError('bad_json', 400); }
  const action = String(body.action || '');

  if (action === 'clear') {
    await env.VOTES.delete(TAIL);
    return ns(json({ ok: true, cleared: true }));
  }
  if (action === 'delete') {
    const id = String(body.id || '');
    const rows = await readPruned(env);
    const kept = rows.filter(m => String(m.id) !== id);
    const removed = rows.length - kept.length;
    if (removed === 0) return ns(json({ ok: true, removed: 0 }));   // no-op -> don't reset the TTL
    if (kept.length === 0) await env.VOTES.delete(TAIL);
    else await env.VOTES.put(TAIL, JSON.stringify(kept), { expirationTtl: RETENTION });
    return ns(json({ ok: true, removed }));
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
function ns(r) { r.headers.set('cache-control', 'no-store'); return r; }
