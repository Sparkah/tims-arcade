function supabaseUrl(env) {
  return String(env.SUPABASE_URL || env.SUPABASE_PROJECT_URL || '').replace(/\/+$/, '');
}

function serviceRoleKey(env) {
  return String(env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY || '');
}

function jsonSafe(value) {
  return JSON.parse(JSON.stringify(value || null));
}

export function normalizeNanotons(value) {
  try {
    const n = BigInt(String(value || '0'));
    return n > 0n ? n : 0n;
  } catch {
    return 0n;
  }
}

export function formatTon(nanotons) {
  const n = normalizeNanotons(nanotons);
  if (!n) return '0';
  const whole = n / 1000000000n;
  const frac = String(n % 1000000000n).padStart(9, '0').replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : String(whole);
}

export function ensureServerBlock(state) {
  return state.__server && typeof state.__server === 'object' ? state.__server : (state.__server = {});
}

export function creditTonBalance(server, nanotons) {
  const add = normalizeNanotons(nanotons);
  const balance = normalizeNanotons(server.tonCreditNanotons) + add;
  server.tonCreditNanotons = balance.toString();
  server.tonCreditUpdatedAt = new Date().toISOString();
  return server.tonCreditNanotons;
}

export function supabaseIsConfigured(env) {
  return Boolean(supabaseUrl(env) && serviceRoleKey(env));
}

function cleanSourceTag(value) {
  return String(value || '').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 64);
}

function telegramPlayerPath(telegramUserId, filters = {}) {
  const params = new URLSearchParams({
    telegram_user_id: `eq.${String(telegramUserId)}`,
  });
  Object.entries(filters).forEach(([key, value]) => {
    params.set(key, value);
  });
  return `telegram_players?${params.toString()}`;
}

function missingAttributionColumn(error) {
  const text = JSON.stringify(error && error.body || {});
  return /source|first_source|last_start_param|source_updated_at/i.test(text)
    && /column|schema cache|PGRST204/i.test(text);
}

export function missingSupabaseRelation(error, relationPattern) {
  const text = `${error && error.message || ''} ${JSON.stringify(error && error.body || {})}`;
  return /relation .* does not exist|schema cache|PGRST(116|204|205)/i.test(text)
    && (!relationPattern || relationPattern.test(text));
}

export async function supabaseRequest(env, path, options = {}) {
  const base = supabaseUrl(env);
  const key = serviceRoleKey(env);
  if (!base || !key) {
    const error = new Error('Supabase is not configured');
    error.code = 'supabase_not_configured';
    throw error;
  }

  const headers = {
    apikey: key,
    authorization: `Bearer ${key}`,
    ...options.headers,
  };
  if (options.body !== undefined && !headers['content-type']) {
    headers['content-type'] = 'application/json';
  }

  const response = await fetch(`${base}/rest/v1/${path}`, {
    ...options,
    headers,
  });
  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text };
    }
  }

  if (!response.ok) {
    const error = new Error(`Supabase request failed: ${response.status}`);
    error.status = response.status;
    error.body = data;
    throw error;
  }

  return data;
}

export async function upsertTelegramPlayer(env, user, meta = {}) {
  if (!user || !user.id) return null;

  const now = new Date().toISOString();
  const row = {
    telegram_user_id: String(user.id),
    username: user.username || null,
    first_name: user.first_name || null,
    last_name: user.last_name || null,
    language_code: user.language_code || null,
    is_premium: Boolean(user.is_premium),
    last_seen_at: now,
  };

  const rows = await supabaseRequest(env, 'telegram_players?on_conflict=telegram_user_id', {
    method: 'POST',
    headers: {
      prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify([row]),
  });

  const source = cleanSourceTag(meta.source);
  const startParam = cleanSourceTag(meta.startParam || meta.start_param);
  const taggedSource = startParam || (source && source !== 'telegram' && source !== 'web' ? source : '');
  const fallbackSource = taggedSource ? '' : source;
  const attributionSource = taggedSource || fallbackSource;

  if (attributionSource) {
    try {
      if (taggedSource) {
        await supabaseRequest(env, telegramPlayerPath(user.id), {
          method: 'PATCH',
          headers: { prefer: 'return=minimal' },
          body: JSON.stringify({
            source: taggedSource,
            last_start_param: startParam || taggedSource,
            source_updated_at: now,
          }),
        });
      } else {
        await supabaseRequest(env, telegramPlayerPath(user.id, { source: 'is.null' }), {
          method: 'PATCH',
          headers: { prefer: 'return=minimal' },
          body: JSON.stringify({
            source: fallbackSource,
            source_updated_at: now,
          }),
        });
      }
      await supabaseRequest(env, telegramPlayerPath(user.id, { first_source: 'is.null' }), {
        method: 'PATCH',
        headers: { prefer: 'return=minimal' },
        body: JSON.stringify({ first_source: attributionSource }),
      });
    } catch (error) {
      if (!missingAttributionColumn(error)) console.warn('Telegram player attribution update failed', error.message);
    }
  }

  return rows;
}

export async function listTelegramPlayers(env, telegramUserIds) {
  const ids = Array.from(new Set((telegramUserIds || [])
    .map((id) => String(id || '').trim())
    .filter((id) => /^\d{2,32}$/.test(id))))
    .slice(0, 5000);
  if (!ids.length) return [];

  async function selectPlayers(select) {
    const params = new URLSearchParams({
      select,
      telegram_user_id: `in.(${ids.join(',')})`,
      limit: String(ids.length),
    });
    const rows = await supabaseRequest(env, `telegram_players?${params.toString()}`, {
      method: 'GET',
    });
    return Array.isArray(rows) ? rows : [];
  }

  try {
    return await selectPlayers('telegram_user_id,username,first_name,last_name,language_code,is_premium,source,first_source,last_start_param,source_updated_at,last_seen_at');
  } catch (error) {
    return selectPlayers('telegram_user_id,username,first_name,last_name,language_code,is_premium,last_seen_at');
  }
}

export async function getTelegramState(env, game, telegramUserId) {
  const params = new URLSearchParams({
    select: 'game,telegram_user_id,state,state_rev,updated_at',
    game: `eq.${game}`,
    telegram_user_id: `eq.${telegramUserId}`,
    limit: '1',
  });
  const rows = await supabaseRequest(env, `telegram_player_states?${params.toString()}`, {
    method: 'GET',
  });
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

export async function listTelegramStates(env, game, limit = 1000) {
  const params = new URLSearchParams({
    select: 'game,telegram_user_id,state,state_rev,updated_at',
    game: `eq.${game}`,
    limit: String(Math.max(1, Math.min(5000, Number(limit) || 1000))),
  });
  const rows = await supabaseRequest(env, `telegram_player_states?${params.toString()}`, {
    method: 'GET',
  });
  return Array.isArray(rows) ? rows : [];
}

export async function upsertTelegramState(env, game, telegramUserId, state) {
  const now = new Date().toISOString();
  const row = {
    game,
    telegram_user_id: String(telegramUserId),
    state: jsonSafe(state),
    state_rev: Date.now(),
    updated_at: now,
  };

  return supabaseRequest(env, 'telegram_player_states?on_conflict=game,telegram_user_id', {
    method: 'POST',
    headers: {
      prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify([row]),
  });
}

export async function updateTelegramStateIfRev(env, game, telegramUserId, stateRev, state) {
  const params = new URLSearchParams({
    game: `eq.${game}`,
    telegram_user_id: `eq.${telegramUserId}`,
    state_rev: `eq.${stateRev}`,
  });
  const rows = await supabaseRequest(env, `telegram_player_states?${params.toString()}`, {
    method: 'PATCH',
    headers: {
      prefer: 'return=representation',
    },
    body: JSON.stringify({
      state: jsonSafe(state),
      state_rev: Date.now(),
      updated_at: new Date().toISOString(),
    }),
  });
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

export async function recordTelegramPurchase(env, purchase) {
  const now = new Date().toISOString();
  const row = {
    payload: String(purchase.payload || ''),
    game: String(purchase.game || ''),
    product_id: String(purchase.product_id || purchase.productId || ''),
    telegram_user_id: String(purchase.telegram_user_id || purchase.telegramUserId || ''),
    currency: String(purchase.currency || 'XTR'),
    total_amount: Number(purchase.total_amount || purchase.totalAmount || 0),
    telegram_payment_charge_id: purchase.telegram_payment_charge_id || purchase.telegramPaymentChargeId || null,
    provider_payment_charge_id: purchase.provider_payment_charge_id || purchase.providerPaymentChargeId || null,
    status: purchase.status || 'paid',
    raw: jsonSafe(purchase.raw || purchase),
    paid_at: purchase.status === 'paid' || !purchase.status ? now : null,
  };

  if (!row.payload || !row.game || !row.product_id || !row.telegram_user_id || !row.total_amount) {
    const error = new Error('Incomplete purchase record');
    error.code = 'incomplete_purchase';
    throw error;
  }

  return supabaseRequest(env, 'telegram_purchases?on_conflict=payload', {
    method: 'POST',
    headers: {
      prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify([row]),
  });
}

export async function getTelegramPurchase(env, game, telegramUserId, payload) {
  const params = new URLSearchParams({
    select: 'payload,game,product_id,telegram_user_id,currency,total_amount,telegram_payment_charge_id,provider_payment_charge_id,status,raw,paid_at,created_at',
    game: `eq.${game}`,
    telegram_user_id: `eq.${telegramUserId}`,
    payload: `eq.${payload}`,
    limit: '1',
  });
  const rows = await supabaseRequest(env, `telegram_purchases?${params.toString()}`, {
    method: 'GET',
  });
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

function discordPlayerPath(discordUserId) {
  const params = new URLSearchParams({
    discord_user_id: `eq.${String(discordUserId)}`,
  });
  return `discord_players?${params.toString()}`;
}

function cleanDiscordText(value, max = 128) {
  return String(value || '').replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max);
}

export async function upsertDiscordPlayer(env, user, context = {}) {
  if (!user || !user.id) return null;

  const now = new Date().toISOString();
  const row = {
    discord_user_id: String(user.id),
    username: cleanDiscordText(user.username, 64) || null,
    global_name: cleanDiscordText(user.globalName, 128) || null,
    display_name: cleanDiscordText(user.displayName || user.globalName || user.username, 128) || null,
    avatar: cleanDiscordText(user.avatar, 128) || null,
    discriminator: cleanDiscordText(user.discriminator, 8) || null,
    last_context: jsonSafe(context || {}),
    last_seen_at: now,
  };

  return supabaseRequest(env, 'discord_players?on_conflict=discord_user_id', {
    method: 'POST',
    headers: {
      prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify([row]),
  });
}

export async function getDiscordScore(env, game, discordUserId) {
  const params = new URLSearchParams({
    select: 'game,discord_user_id,display_name,avatar,score,context,updated_at',
    game: `eq.${game}`,
    discord_user_id: `eq.${String(discordUserId)}`,
    limit: '1',
  });
  const rows = await supabaseRequest(env, `discord_scores?${params.toString()}`, {
    method: 'GET',
  });
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

export async function upsertDiscordScore(env, game, user, score, context = {}) {
  if (!user || !user.id) return null;
  const existing = await getDiscordScore(env, game, user.id);
  const safeScore = Math.max(0, Math.floor(Number(score) || 0));
  if (existing && Number(existing.score || 0) >= safeScore) return existing;

  const row = {
    game,
    discord_user_id: String(user.id),
    display_name: cleanDiscordText(user.displayName || user.globalName || user.username, 128) || null,
    avatar: cleanDiscordText(user.avatar, 128) || null,
    score: safeScore,
    context: jsonSafe(context || {}),
    updated_at: new Date().toISOString(),
  };

  const rows = await supabaseRequest(env, 'discord_scores?on_conflict=game,discord_user_id', {
    method: 'POST',
    headers: {
      prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify([row]),
  });
  return Array.isArray(rows) && rows.length ? rows[0] : row;
}

export async function listDiscordScores(env, game, limit = 20) {
  const params = new URLSearchParams({
    select: 'game,discord_user_id,display_name,avatar,score,updated_at',
    game: `eq.${game}`,
    order: 'score.desc,updated_at.asc',
    limit: String(Math.max(1, Math.min(100, Number(limit) || 20))),
  });
  const rows = await supabaseRequest(env, `discord_scores?${params.toString()}`, {
    method: 'GET',
  });
  return Array.isArray(rows) ? rows : [];
}
