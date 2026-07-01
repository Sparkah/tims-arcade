import { corsForbidden, corsHeaders, corsPreflight } from '../_lib/cors.js';
import { exchangeDiscordCode } from '../_lib/discordAuth.js';
import { checkUserRate } from '../_lib/rateLimit.js';
import { json, jsonError } from '../_lib/response.js';

async function readBody(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

async function withinRate(env, scope, identity, limits) {
  if (!env.VOTES) return true;
  try {
    return await checkUserRate(env, scope, identity, limits);
  } catch {
    return true;
  }
}

function jsonCors(request, body, status = 200, headers = {}) {
  return json(body, status, corsHeaders(request, { 'cache-control': 'no-store', ...headers }));
}

function errorCors(request, message, status) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: corsHeaders(request, { 'content-type': 'application/json', 'cache-control': 'no-store' }),
  });
}

export async function onRequestOptions({ request }) {
  return corsPreflight(request, 'POST,OPTIONS');
}

export async function onRequestPost({ request, env }) {
  if (corsForbidden(request)) return jsonError('Forbidden', 403);

  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  if (!await withinRate(env, 'disc-token', `ip:${ip}`, { perSec: 2, perMin: 20 })) {
    return errorCors(request, 'rate limit', 429);
  }

  const body = await readBody(request);
  const code = String(body && body.code || '').trim();
  if (!/^[A-Za-z0-9._-]{8,512}$/.test(code)) return errorCors(request, 'bad code', 400);

  try {
    const token = await exchangeDiscordCode(env, code);
    return jsonCors(request, { ok: true, ...token });
  } catch (error) {
    if (error.code === 'discord_secret_not_configured') {
      return errorCors(request, 'discord_secret_not_configured', 503);
    }
    return errorCors(request, 'discord_token_exchange_failed', error.status === 400 ? 401 : 502);
  }
}
