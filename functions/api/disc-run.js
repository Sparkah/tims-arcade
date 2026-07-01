import { corsForbidden, corsHeaders, corsPreflight } from '../_lib/cors.js';
import { signDiscordRun, verifyDiscordSession } from '../_lib/discordAuth.js';
import { checkUserRate } from '../_lib/rateLimit.js';
import { json, jsonError } from '../_lib/response.js';
import { SLUG_RE } from '../_lib/validate.js';

async function readBody(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function cleanGame(value) {
  const game = String(value || '').trim();
  return SLUG_RE.test(game) ? game : '';
}

function jsonCors(request, body, status = 200) {
  return json(body, status, corsHeaders(request, { 'cache-control': 'no-store' }));
}

function errorCors(request, message, status) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: corsHeaders(request, { 'content-type': 'application/json', 'cache-control': 'no-store' }),
  });
}

async function withinRate(env, scope, identity, limits) {
  if (!env.VOTES) return true;
  try {
    return await checkUserRate(env, scope, identity, limits);
  } catch {
    return true;
  }
}

export async function onRequestOptions({ request }) {
  return corsPreflight(request, 'POST,OPTIONS');
}

export async function onRequestPost({ request, env }) {
  if (corsForbidden(request)) return jsonError('Forbidden', 403);
  const body = await readBody(request);
  const game = cleanGame(body && body.game);
  const sessionToken = String(body && body.sessionToken || '').trim();
  if (!game) return errorCors(request, 'bad game', 400);

  const session = await verifyDiscordSession(env, sessionToken);
  if (!session.ok) return errorCors(request, session.error || 'bad session', 401);

  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  if (!await withinRate(env, 'disc-run', `u:${session.user.id}:ip:${ip}`, { perSec: 2, perMin: 40 })) {
    return errorCors(request, 'rate limit', 429);
  }

  try {
    const runToken = await signDiscordRun(env, session.user, game);
    return jsonCors(request, { ok: true, game, runToken });
  } catch (error) {
    if (error.code === 'discord_session_secret_not_configured') {
      return errorCors(request, 'discord_session_secret_not_configured', 503);
    }
    return errorCors(request, 'run_start_failed', 503);
  }
}
