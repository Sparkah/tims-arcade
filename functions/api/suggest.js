// POST /api/suggest
// Body: { text: string }   max 500 chars after trim
//
// Captures a player suggestion for "what should we build next?". Anonymous
// is fine — rate-limited by identity cookie (uid) if present, falling back
// to client IP. Stored under suggestion:<ts>:<id> for the factory leader
// to read each morning and the admin dashboard to triage.
//
// Rate limit: 3 suggestions / day / (uid or IP).

import { parseCookie } from '../_lib/cookie.js';

const MAX_TEXT = 500;
const MIN_TEXT = 3;
const DAILY_CAP = 3;

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return jsonError('invalid_json', 400); }

  const text = String(body.text || '').slice(0, MAX_TEXT).trim();
  if (text.length < MIN_TEXT) return jsonError('text_too_short', 400);

  const uid = parseCookie(request.headers.get('Cookie') || '', 'uid') || '';
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const actor = uid || `ip:${ip}`;
  const day = new Date().toISOString().slice(0, 10);
  const rateKey = `sugrate:${actor}:${day}`;

  const count = parseInt(await env.VOTES.get(rateKey)) || 0;
  if (count >= DAILY_CAP) return jsonError('daily_limit_reached', 429);
  await env.VOTES.put(rateKey, String(count + 1), { expirationTtl: 60 * 60 * 26 });

  const ts = Date.now();
  const id = ts.toString(36) + Math.random().toString(36).slice(2, 6);
  const key = `suggestion:${ts}:${id}`;
  const payload = {
    text,
    uid: uid || null,
    ipHash: await hashIp(ip, env),
    ts,
    status: 'new',
  };
  await env.VOTES.put(key, JSON.stringify(payload));

  return new Response(JSON.stringify({ ok: true, id }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

async function hashIp(ip, env) {
  const salt = env.SUGGEST_SALT || 'tgl-suggest-default-salt-2026';
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(`${salt}|${ip}`));
  return Array.from(new Uint8Array(buf)).slice(0, 6).map(b => b.toString(16).padStart(2, '0')).join('');
}

function jsonError(msg, status) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
