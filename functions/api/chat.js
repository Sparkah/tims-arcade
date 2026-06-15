// GET/POST /api/chat -- the global gallery "lounge". A tiny moderated room where
// ANY visitor (signed-in or anonymous) can chat to each other. No links, no
// images, no DMs, no accounts -- just short-lived text. Tim 2026-06-15: "players
// can open it and chat freely; no links (they get blocked), no images; works
// logged-in or not." Moderation is shared with bandlings-chat.js via _lib/chatmod.js.
//
// Single hard-coded room ("lounge"): the client can't pick arbitrary rooms, which
// would otherwise let one IP dodge the per-minute limit by rotating room names and
// spawn unbounded KV keys (Codex review 2026-06-15).
//
// Same-origin only: POST is rejected when an Origin header from another site is
// present, so a third-party page can't drive visitors' browsers to spam the lounge.
//
// KV budget: 2 writes per posted message (the per-minute rate counter + the hot
// tail key). The tail key alone is the source of truth (no per-message keys),
// halving the write cost on the ~1k/day free tier. Reads (the 5s poll) are cheap.
// If the lounge gets busy, migrate chat+heartbeat+meta to D1 (the documented path).
//
// Concurrency: the tail key is a non-atomic read-modify-write, so two posts within
// ~50ms can drop one. Rare at gallery volume; D1 would make it atomic.

import { json, sameOriginOk } from '../_lib/response.js';
import { checkRate } from '../_lib/rateLimit.js';
import { cleanName, filterText } from '../_lib/chatmod.js';

const ROOM = 'lounge';                   // fixed single room
const ID_RE = /^[0-9a-z]{8,24}$/;
const RETENTION_SECONDS = 2 * 60 * 60;   // messages live 2h
const MAX_MESSAGES = 60;                 // tail depth
const MAX_TEXT = 200;

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const since = String(url.searchParams.get('since') || '').trim().toLowerCase();
  let limit = parseInt(url.searchParams.get('limit') || '40', 10);
  if (!Number.isFinite(limit) || limit < 1) limit = 40;
  limit = Math.min(limit, MAX_MESSAGES);
  if (since && !ID_RE.test(since)) return nostore(json({ error: 'bad_since' }, 400));

  const messages = await readRoom(env, limit, since);
  return nostore(json({ room: 'global', messages, now: Date.now() }));
}

export async function onRequestPost({ request, env }) {
  if (!sameOriginOk(request)) return nostore(json({ error: 'forbidden' }, 403));

  let body;
  try { body = await request.json(); }
  catch { return nostore(json({ error: 'bad_json' }, 400)); }

  const name = cleanName(body.name || '');
  const filtered = filterText(body.text || '', MAX_TEXT);
  if (!filtered.ok) return nostore(json({ error: filtered.reason || 'blocked' }, 400));

  // Anti-flood: 6 messages / IP / minute. (A client-side 3s cooldown handles
  // rapid-fire UX without spending a KV write on a cooldown key.)
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const minute = Math.floor(Date.now() / 60000);
  if (!await checkRate(env, `chatrate:lounge:${ip}:${minute}`, 6, 120)) {
    return nostore(json({ error: 'rate_limit' }, 429));
  }

  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const message = { id, name, text: filtered.text, ts: Date.now() };
  await appendRoomTail(env, message);
  return nostore(json({ ok: true, message }));
}

async function readRoom(env, limit, since) {
  let rows = [];
  try { rows = (await env.VOTES.get(tailKey(), 'json')) || []; } catch { rows = []; }
  const minTs = Date.now() - RETENTION_SECONDS * 1000;
  return rows
    .filter(Boolean)
    .filter(m => m.id && m.text && (!since || String(m.id) > since))
    .filter(m => !m.ts || m.ts >= minTs)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))
    .slice(-limit)
    .map(m => ({
      id: String(m.id).slice(0, 24),
      name: cleanName(m.name || ''),
      text: String(m.text || '').slice(0, MAX_TEXT),
      ts: Number.isFinite(m.ts) ? m.ts : 0,
    }));
}

async function appendRoomTail(env, message) {
  let rows = [];
  try { rows = (await env.VOTES.get(tailKey(), 'json')) || []; } catch { rows = []; }
  const minTs = Date.now() - RETENTION_SECONDS * 1000;
  rows = rows
    .filter(Boolean)
    .filter(m => m.id && m.text && (!m.ts || m.ts >= minTs))
    .slice(-MAX_MESSAGES + 1);
  rows.push(message);
  await env.VOTES.put(tailKey(), JSON.stringify(rows), { expirationTtl: RETENTION_SECONDS });
}

function nostore(r) { r.headers.set('cache-control', 'no-store'); return r; }

function tailKey() { return `chat:lounge:${ROOM}:tail`; }
