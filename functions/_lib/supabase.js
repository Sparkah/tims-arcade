function supabaseUrl(env) {
  return String(env.SUPABASE_URL || env.SUPABASE_PROJECT_URL || '').replace(/\/+$/, '');
}

function serviceRoleKey(env) {
  return String(env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY || '');
}

function jsonSafe(value) {
  return JSON.parse(JSON.stringify(value || null));
}

export function supabaseIsConfigured(env) {
  return Boolean(supabaseUrl(env) && serviceRoleKey(env));
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

export async function upsertTelegramPlayer(env, user) {
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

  return supabaseRequest(env, 'telegram_players?on_conflict=telegram_user_id', {
    method: 'POST',
    headers: {
      prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify([row]),
  });
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
    select: 'payload,game,product_id,telegram_user_id,currency,total_amount,status,paid_at,created_at',
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
