// GET/POST /api/bandlings-chat
//
// Tiny moderated chat endpoint for Bandlings. It intentionally keeps only
// short-lived room messages in KV; no accounts, no private messages, no
// external links, no contact data.

import { json } from '../_lib/response.js';
import { checkRate } from '../_lib/rateLimit.js';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
};
const ROOM_RE = /^[a-z0-9_-]{1,32}$/;
const ID_RE = /^[0-9a-z]{8,24}$/;
const RETENTION_SECONDS = 2 * 60 * 60;
const MAX_TEXT = 80;
const MAX_NAME = 18;
const MAX_MESSAGES = 60;

export function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const room = cleanRoom(url.searchParams.get('room') || 'global');
  const since = String(url.searchParams.get('since') || '').trim().toLowerCase();
  let limit = parseInt(url.searchParams.get('limit') || '40', 10);
  if (!Number.isFinite(limit) || limit < 1) limit = 40;
  limit = Math.min(limit, MAX_MESSAGES);

  if (!room) return corsJson({ error: 'bad_room' }, 400);
  if (since && !ID_RE.test(since)) return corsJson({ error: 'bad_since' }, 400);

  const messages = await readRoom(env, room, limit, since);
  return corsJson({ room, messages, now: Date.now() }, 200);
}

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); }
  catch { return corsJson({ error: 'bad_json' }, 400); }

  const room = cleanRoom(body.room || 'global');
  const name = cleanName(body.name || '');
  const filtered = filterText(body.text || '');
  const band = cleanBand(body.band || '');
  if (!room) return corsJson({ error: 'bad_room' }, 400);
  if (!filtered.ok) return corsJson({ error: filtered.reason || 'blocked' }, 400);

  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const minute = Math.floor(Date.now() / 60000);
  if (!await checkRate(env, `chatrate:bandlings:${room}:${ip}:${minute}`, 6, 120)) {
    return corsJson({ error: 'rate_limit' }, 429);
  }
  const coolKey = `chatcool:bandlings:${room}:${ip}`;
  const lastPost = parseInt(await env.VOTES.get(coolKey)) || 0;
  if (Date.now() - lastPost < 3000) {
    return corsJson({ error: 'rate_limit' }, 429);
  }
  await env.VOTES.put(coolKey, String(Date.now()), { expirationTtl: 60 });

  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const message = {
    id,
    room,
    name,
    text: filtered.text,
    ts: Date.now(),
    ...(band ? { band } : {}),
  };
  await env.VOTES.put(chatKey(room, id), JSON.stringify(message), {
    expirationTtl: RETENTION_SECONDS,
  });
  await appendRoomTail(env, room, message);
  return corsJson({ ok: true, message }, 200);
}

async function readRoom(env, room, limit, since) {
  const tail = await readRoomTail(env, room, limit, since);
  if (tail.length) return tail;

  const prefix = chatPrefix(room);
  let cursor;
  const names = [];
  do {
    const page = await env.VOTES.list({ prefix, cursor, limit: 1000 });
    cursor = page.list_complete ? null : page.cursor;
    for (const k of page.keys) {
      const id = k.name.slice(prefix.length);
      if (!since || id > since) names.push(k.name);
    }
  } while (cursor);

  const tailKeys = names.slice(-limit * 2);
  const rows = await Promise.all(tailKeys.map(async (key) => {
    try { return await env.VOTES.get(key, 'json'); }
    catch { return null; }
  }));
  return rows
    .filter(Boolean)
    .filter(m => m.id && m.text)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))
    .slice(-limit)
    .map(m => ({
      id: String(m.id).slice(0, 24),
      name: cleanName(m.name || ''),
      text: String(m.text || '').slice(0, MAX_TEXT),
      ts: Number.isFinite(m.ts) ? m.ts : 0,
      band: cleanBand(m.band || ''),
    }));
}

async function readRoomTail(env, room, limit, since) {
  let rows = [];
  try { rows = (await env.VOTES.get(tailKey(room), 'json')) || []; }
  catch { rows = []; }
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
      band: cleanBand(m.band || ''),
    }));
}

async function appendRoomTail(env, room, message) {
  let rows = [];
  try { rows = (await env.VOTES.get(tailKey(room), 'json')) || []; }
  catch { rows = []; }
  const minTs = Date.now() - RETENTION_SECONDS * 1000;
  rows = rows
    .filter(Boolean)
    .filter(m => m.id && m.text && (!m.ts || m.ts >= minTs))
    .slice(-MAX_MESSAGES + 1);
  rows.push(message);
  try {
    await env.VOTES.put(tailKey(room), JSON.stringify(rows), { expirationTtl: RETENTION_SECONDS });
  } catch {
    // Per-message keys remain as a slower fallback if the hot tail key is busy.
  }
}

function corsJson(body, status) {
  const res = json(body, status);
  Object.entries(CORS).forEach(([k, v]) => res.headers.set(k, v));
  res.headers.set('cache-control', 'no-store');
  return res;
}

function chatPrefix(room) {
  return `chat:bandlings:${room}:`;
}

function chatKey(room, id) {
  return chatPrefix(room) + id;
}

function tailKey(room) {
  return `chat:bandlings:${room}:tail`;
}

function cleanRoom(room) {
  room = String(room || 'global').trim().toLowerCase();
  return ROOM_RE.test(room) ? room : '';
}

function cleanName(name) {
  name = String(name || '').normalize('NFKC').replace(/[\u0000-\u001f\u007f<>]/g, ' ');
  name = name.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
  if (!name || blockedName(name)) name = 'Player';
  return name;
}

function cleanBand(band) {
  band = String(band || '').trim();
  return /^B1[0-9a-z]+-[0-9a-z]{3,60}$/i.test(band) ? band.slice(0, 80) : '';
}

function filterText(text) {
  text = String(text || '').normalize('NFKC');
  text = text.replace(/[\u0000-\u001f\u007f<>]/g, ' ');
  text = text.replace(/\s+/g, ' ').trim();
  if (!text) return { ok: false, reason: 'empty' };
  if (text.length > MAX_TEXT) text = text.slice(0, MAX_TEXT).trim();
  if (containsContact(text)) return { ok: false, reason: 'contact' };
  if (containsBlocked(text)) return { ok: false, reason: 'blocked' };
  return { ok: true, text };
}

function fold(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[0@]/g, 'o')
    .replace(/[1!|]/g, 'i')
    .replace(/[3]/g, 'e')
    .replace(/[4]/g, 'a')
    .replace(/[5$]/g, 's')
    .replace(/[а@]/g, 'a')
    .replace(/[еёэ]/g, 'e')
    .replace(/[о0]/g, 'o')
    .replace(/[р]/g, 'p')
    .replace(/[с]/g, 'c')
    .replace(/[х]/g, 'x')
    .replace(/[у]/g, 'y')
    .replace(/[^a-zа-я0-9]+/g, '');
}

function containsContact(text) {
  const raw = String(text || '').toLowerCase();
  if (/https?:|www\.|\.com|\.ru|\.net|\.org|t\.me|discord|telegram|vk\.com|@[a-z0-9_]/i.test(raw)) return true;
  if (/\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/i.test(raw)) return true;
  return raw.replace(/\D/g, '').length >= 7;
}

function containsBlocked(text) {
  const s = fold(text);
  const raw = String(text || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zа-я0-9]+/g, '');
  const patterns = [
    /fuck|shit|bitch|cunt|dick|cock|pussy|porn|sex|nude|naked|anal|hentai|onlyfans|blowjob|rape|suicide|killurself|killyourself/,
    /nigg|fagg|retard/,
    /ху[йяеюи]|пизд|еба|еби|ебу|ёба|ёби|бля|сука|секс|порно|член|минет|анал|сиськ|голая|голый/,
  ];
  return patterns.some(re => re.test(s) || re.test(raw));
}

function blockedName(name) {
  return containsContact(name) || containsBlocked(name);
}
