import { corsForbidden, corsHeaders, corsPreflight } from '../_lib/cors.js';
import {
  cleanDiscordContext,
  fetchDiscordUser,
  publicDiscordUser,
  signDiscordSession,
} from '../_lib/discordAuth.js';
import { checkUserRate } from '../_lib/rateLimit.js';
import { json, jsonError } from '../_lib/response.js';
import {
  missingSupabaseRelation,
  supabaseIsConfigured,
  upsertDiscordPlayer,
} from '../_lib/supabase.js';

async function readBody(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function bearerToken(request, body) {
  const header = request.headers.get('authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return String((match && match[1]) || (body && body.accessToken) || '').trim();
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
  const accessToken = bearerToken(request, body);
  if (!accessToken) return errorCors(request, 'missing access token', 400);

  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  if (!await withinRate(env, 'disc-auth', `ip:${ip}`, { perSec: 2, perMin: 30 })) {
    return errorCors(request, 'rate limit', 429);
  }

  try {
    const user = await fetchDiscordUser(accessToken);
    if (!await withinRate(env, 'disc-auth-user', `u:${user.id}`, { perSec: 2, perMin: 60 })) {
      return errorCors(request, 'rate limit', 429);
    }

    const context = cleanDiscordContext(body && body.context);
    let persisted = false;
    let persistence = 'skipped';
    if (supabaseIsConfigured(env)) {
      try {
        await upsertDiscordPlayer(env, user, context);
        persisted = true;
        persistence = 'supabase';
      } catch (error) {
        if (!missingSupabaseRelation(error, /discord_players/i)) throw error;
        persistence = 'missing_schema';
      }
    }

    const sessionToken = await signDiscordSession(env, user, context);
    return jsonCors(request, {
      ok: true,
      user: publicDiscordUser(user),
      sessionToken,
      persisted,
      persistence,
    });
  } catch (error) {
    if (error.code === 'discord_session_secret_not_configured') {
      return errorCors(request, 'discord_session_secret_not_configured', 503);
    }
    if (error.status === 401 || error.status === 403) return errorCors(request, 'discord_auth_failed', 401);
    return errorCors(request, 'discord_auth_failed', 502);
  }
}
