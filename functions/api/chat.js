// GET/POST /api/chat -- the global gallery "lounge". A tiny moderated room where
// ANY visitor (signed-in or anonymous) can chat. Text only + shared GALLERY games
// (rendered as a thumb+title card client-side); no external links, no images, no
// DMs, no accounts. Tim 2026-06-15.
//
// Single hard-coded room. Same-origin POST only. Poster IP is stored server-side
// (for moderation via /api/admin/chat) and STRIPPED from the public GET. Banned
// IPs (chatban:<ip>) are rejected. Moderation lives in _lib/chatmod.js.
//
// KV budget: 2 writes per message (rate counter + the hot tail key), +1 read for
// the ban check. Reads (the 5s poll) are cheap. Tail key is the source of truth.

import { json, sameOriginOk } from '../_lib/response.js';
import { checkRate } from '../_lib/rateLimit.js';
import { cleanName, filterText } from '../_lib/chatmod.js';
import { isValidSlug } from '../_lib/validate.js';

const ROOM = 'lounge';
const ID_RE = /^[0-9a-z]{8,24}$/;
const RETENTION_SECONDS = 2 * 60 * 60;
const MAX_MESSAGES = 60;
const MAX_TEXT = 200;
const MAX_TITLE = 60;

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

  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  if (await isBanned(env, ip)) return nostore(json({ error: 'banned' }, 403));

  let body;
  try { body = await request.json(); }
  catch { return nostore(json({ error: 'bad_json' }, 400)); }

  const name = cleanName(body.name || '');

  // Optional shared game (internal gallery slug -> rendered as a card client-side).
  let game = null;
  if (body.game && body.game.slug) {
    const slug = String(body.game.slug);
    if (!isValidSlug(slug)) return nostore(json({ error: 'bad_game' }, 400));
    const tf = filterText(body.game.title || slug, MAX_TITLE);
    game = { slug, title: tf.ok ? tf.text : slug.replace(/[_-]+/g, ' ') };
  }

  // Text is required UNLESS a game is being shared.
  let text = '';
  if (body.text != null && String(body.text).trim()) {
    const f = filterText(body.text, MAX_TEXT);
    if (!f.ok) return nostore(json({ error: f.reason || 'blocked' }, 400));
    text = f.text;
  } else if (!game) {
    return nostore(json({ error: 'empty' }, 400));
  }

  // Anti-flood: 6 messages / IP / minute.
  const minute = Math.floor(Date.now() / 60000);
  if (!await checkRate(env, `chatrate:lounge:${ip}:${minute}`, 6, 120)) {
    return nostore(json({ error: 'rate_limit' }, 429));
  }

  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const message = { id, name, text, ts: Date.now() };
  if (game) message.game = game;
  // Store with the IP for moderation; it is never returned by the public GET.
  await appendRoomTail(env, { ...message, ip });
  return nostore(json({ ok: true, message }));
}

async function isBanned(env, ip) {
  if (!ip || ip === 'unknown') return false;
  try { return !!(await env.VOTES.get(`chatban:${ip}`)); } catch { return false; }
}

function publicView(m) {
  const out = {
    id: String(m.id).slice(0, 24),
    name: cleanName(m.name || ''),
    text: String(m.text || '').slice(0, MAX_TEXT),
    ts: Number.isFinite(m.ts) ? m.ts : 0,
  };
  if (m.game && m.game.slug && isValidSlug(String(m.game.slug))) {
    out.game = { slug: String(m.game.slug), title: String(m.game.title || m.game.slug).slice(0, MAX_TITLE) };
  }
  return out;
}

async function readRoom(env, limit, since) {
  let rows = [];
  try { rows = (await env.VOTES.get(tailKey(), 'json')) || []; } catch { rows = []; }
  const minTs = Date.now() - RETENTION_SECONDS * 1000;
  return rows
    .filter(Boolean)
    .filter(m => m.id && (m.text || m.game) && (!since || String(m.id) > since))
    .filter(m => !m.ts || m.ts >= minTs)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))
    .slice(-limit)
    .map(publicView);
}

async function appendRoomTail(env, message) {
  let rows = [];
  try { rows = (await env.VOTES.get(tailKey(), 'json')) || []; } catch { rows = []; }
  const minTs = Date.now() - RETENTION_SECONDS * 1000;
  rows = rows
    .filter(Boolean)
    .filter(m => m.id && (m.text || m.game) && (!m.ts || m.ts >= minTs))
    .slice(-MAX_MESSAGES + 1);
  rows.push(message);
  await env.VOTES.put(tailKey(), JSON.stringify(rows), { expirationTtl: RETENTION_SECONDS });
}

function nostore(r) { r.headers.set('cache-control', 'no-store'); return r; }
function tailKey() { return `chat:lounge:${ROOM}:tail`; }
