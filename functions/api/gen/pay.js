// POST /api/gen/pay
// Placeholder "buy prompts" button -- real payment isn't wired yet (Tim 2026-06-15:
// "unavailable for now, just a button to see how many times it gets pressed").
// Increments a global click counter so we can measure purchase intent. The client
// also fires a PostHog event. Requires a signed-in session + same-origin POST so
// the metric can't be inflated cross-site (Codex review 2026-06-15).

import { readSession } from '../_session.js';
import { json, jsonError } from '../../_lib/response.js';
import { checkRate } from '../../_lib/rateLimit.js';

export async function onRequestPost({ request, env }) {
  if (!sameOriginOk(request)) return jsonError('forbidden', 403);
  const session = await readSession(request, env);
  if (!session || !session.uid) return jsonError('sign_in_required', 401);

  // One counted click / uid / minute (the button is informational).
  const minute = Math.floor(Date.now() / 60000);
  if (!await checkRate(env, `genpayrate:${session.uid}:${minute}`, 3, 120)) {
    const cur = parseInt(await env.VOTES.get('genpay:clicks')) || 0;
    return nostore(json({ ok: true, clicks: cur, throttled: true }));
  }

  const cur = parseInt(await env.VOTES.get('genpay:clicks')) || 0;
  const next = cur + 1;
  await env.VOTES.put('genpay:clicks', String(next));
  return nostore(json({ ok: true, clicks: next }));
}

function sameOriginOk(request) {
  const origin = request.headers.get('Origin');
  if (!origin) return true;
  try {
    const o = new URL(origin), u = new URL(request.url);
    return o.host === u.host || o.hostname === 'localhost' || o.hostname === '127.0.0.1';
  } catch { return false; }
}

function nostore(r) { r.headers.set('cache-control', 'no-store'); return r; }
