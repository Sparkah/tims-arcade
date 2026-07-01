import { corsForbidden, corsHeaders, corsPreflight } from '../_lib/cors.js';
import { publicDiscordUser, shortHash, verifyDiscordRun, verifyDiscordSession } from '../_lib/discordAuth.js';
import { checkUserRate } from '../_lib/rateLimit.js';
import { json, jsonError } from '../_lib/response.js';
import { SLUG_RE } from '../_lib/validate.js';
import {
  listDiscordScores,
  missingSupabaseRelation,
  supabaseIsConfigured,
  upsertDiscordPlayer,
  upsertDiscordScore,
} from '../_lib/supabase.js';

const MAX_SCORE = 10000000;
const SCORE_GRACE = 5000;
const MAX_SCORE_PER_SECOND = 250000;
const TOP_N = 20;
const KV_CAP = 100;

async function readBody(request) {
  try {
    return await request.json();
  } catch {
    return null;
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

function cleanGame(value) {
  const game = String(value || '').trim();
  return SLUG_RE.test(game) ? game : '';
}

function cleanScore(value) {
  const score = Math.floor(Number(value));
  return Number.isFinite(score) && score >= 0 && score <= MAX_SCORE ? score : null;
}

function scoreFitsRun(score, run) {
  if (!run || !run.ok) return false;
  const age = Math.max(0, Number(run.ageSeconds || 0));
  if (age < 2 && score > 1000) return false;
  return score <= Math.min(MAX_SCORE, SCORE_GRACE + age * MAX_SCORE_PER_SECOND);
}

function scoreKey(game) {
  return `disc:scores:${game}`;
}

async function withinRate(env, scope, identity, limits) {
  if (!env.VOTES) return true;
  try {
    return await checkUserRate(env, scope, identity, limits);
  } catch {
    return true;
  }
}

function rowToEntry(row, rank) {
  const displayName = String(row.display_name || row.displayName || `Player ${String(row.discord_user_id || row.discordUserId || '').slice(-4)}`).slice(0, 128);
  const rawId = String(row.discord_user_id || row.discordUserId || '');
  return {
    rank,
    user: {
      idHash: shortHash(rawId),
      displayName,
      avatar: String(row.avatar || '').slice(0, 128),
    },
    score: Math.max(0, Math.floor(Number(row.score) || 0)),
    updatedAt: row.updated_at || row.updatedAt || null,
  };
}

async function listKvScores(env, game, limit) {
  if (!env.VOTES) return [];
  const rows = (await env.VOTES.get(scoreKey(game), 'json')) || [];
  return rows.slice(0, Math.max(1, Math.min(100, limit || TOP_N))).map((row, index) => rowToEntry(row, index + 1));
}

async function upsertKvScore(env, game, user, score, context = {}) {
  if (!env.VOTES) {
    const error = new Error('kv_not_configured');
    error.code = 'kv_not_configured';
    throw error;
  }
  const key = scoreKey(game);
  const rows = (await env.VOTES.get(key, 'json')) || [];
  const now = new Date().toISOString();
  const existing = rows.findIndex((row) => String(row.discord_user_id) === String(user.id));
  if (existing >= 0) {
    if (Number(rows[existing].score || 0) >= score) return rows[existing];
    rows.splice(existing, 1);
  }
  const row = {
    game,
    discord_user_id: String(user.id),
    display_name: publicDiscordUser(user).displayName,
    avatar: user.avatar || '',
    score,
    context,
    updated_at: now,
  };
  rows.push(row);
  rows.sort((a, b) => Number(b.score || 0) - Number(a.score || 0) || String(a.updated_at || '').localeCompare(String(b.updated_at || '')));
  if (rows.length > KV_CAP) rows.length = KV_CAP;
  await env.VOTES.put(key, JSON.stringify(rows), { expirationTtl: 180 * 24 * 60 * 60 });
  return row;
}

async function listScores(env, game, limit) {
  if (supabaseIsConfigured(env)) {
    try {
      const rows = await listDiscordScores(env, game, limit);
      return {
        source: 'supabase',
        entries: rows.map((row, index) => rowToEntry(row, index + 1)),
      };
    } catch (error) {
      if (!missingSupabaseRelation(error, /discord_scores/i)) throw error;
    }
  }
  return {
    source: 'kv-fallback',
    entries: await listKvScores(env, game, limit),
  };
}

export async function onRequestOptions({ request }) {
  return corsPreflight(request, 'GET,POST,OPTIONS');
}

export async function onRequestGet({ request, env }) {
  if (corsForbidden(request)) return jsonError('Forbidden', 403);
  const url = new URL(request.url);
  const game = cleanGame(url.searchParams.get('game'));
  const limit = Math.max(1, Math.min(100, Number(url.searchParams.get('limit')) || TOP_N));
  if (!game) return errorCors(request, 'bad game', 400);

  try {
    const result = await listScores(env, game, limit);
    return jsonCors(request, { ok: true, game, ...result }, 200, { 'cache-control': 'public, max-age=20' });
  } catch {
    return errorCors(request, 'leaderboard_unavailable', 503);
  }
}

export async function onRequestPost({ request, env }) {
  if (corsForbidden(request)) return jsonError('Forbidden', 403);
  const body = await readBody(request);
  const game = cleanGame(body && body.game);
  const score = cleanScore(body && body.score);
  const sessionToken = String(body && body.sessionToken || '').trim();
  const runToken = String(body && body.runToken || '').trim();
  if (!game) return errorCors(request, 'bad game', 400);
  if (score === null) return errorCors(request, 'bad score', 400);

  const session = await verifyDiscordSession(env, sessionToken);
  if (!session.ok) return errorCors(request, session.error || 'bad session', 401);
  const run = await verifyDiscordRun(env, runToken);
  if (!run.ok) return errorCors(request, run.error || 'bad run', 401);
  if (run.userId !== String(session.user.id) || run.game !== game) return errorCors(request, 'run mismatch', 403);
  if (!scoreFitsRun(score, run)) return errorCors(request, 'score outside run policy', 400);

  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  if (!await withinRate(env, 'disc-score', `u:${session.user.id}:ip:${ip}`, { perSec: 2, perMin: 60 })) {
    return errorCors(request, 'rate limit', 429);
  }

  const context = {
    ...(session.context || {}),
    reason: String(body && body.reason || '').replace(/[^A-Za-z0-9_.:-]/g, '').slice(0, 48) || 'score',
    runId: run.runId,
    runAgeSeconds: run.ageSeconds,
  };

  let source = 'supabase';
  try {
    if (!supabaseIsConfigured(env)) throw new Error('supabase_not_configured');
    await upsertDiscordPlayer(env, session.user, session.context || {});
    await upsertDiscordScore(env, game, session.user, score, context);
  } catch (error) {
    if (supabaseIsConfigured(env) && !missingSupabaseRelation(error, /discord_scores/i)) {
      return errorCors(request, 'score_save_failed', 503);
    }
    source = 'kv-fallback';
    try {
      await upsertKvScore(env, game, session.user, score, context);
    } catch {
      return errorCors(request, 'score_save_failed', 503);
    }
  }

  const listed = await listScores(env, game, TOP_N);
  return jsonCors(request, {
    ok: true,
    game,
    source: listed.source || source,
    entries: listed.entries,
  });
}
