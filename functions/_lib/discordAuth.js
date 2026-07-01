const DEFAULT_CLIENT_ID = '1521607835513917621';
const DISCORD_API = 'https://discord.com/api/v10';
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
const RUN_TTL_SECONDS = 4 * 60 * 60;

function textEncoder() {
  return new TextEncoder();
}

function base64UrlEncode(input) {
  const bytes = typeof input === 'string' ? textEncoder().encode(input) : input;
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(value) {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function hmac(secret, message) {
  const key = await crypto.subtle.importKey(
    'raw',
    textEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, textEncoder().encode(message)));
}

function safeEqual(a, b) {
  const left = String(a || '');
  const right = String(b || '');
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
}

function sessionSecret(env) {
  return String(env.DISCORD_SESSION_SECRET || env.DISCORD_CLIENT_SECRET || env.DISCORD_ACTIVITY_CLIENT_SECRET || '').trim();
}

export function discordClientId(env) {
  return String(env.DISCORD_CLIENT_ID || env.VITE_DISCORD_CLIENT_ID || env.DISCORD_APPLICATION_ID || DEFAULT_CLIENT_ID).trim();
}

export function discordClientSecret(env) {
  return String(env.DISCORD_CLIENT_SECRET || env.DISCORD_ACTIVITY_CLIENT_SECRET || '').trim();
}

export function cleanDiscordContext(value) {
  const out = {};
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  ['instanceId', 'channelId', 'guildId', 'locationId', 'platform'].forEach((key) => {
    const clean = String(input[key] || '').replace(/[^A-Za-z0-9_.:-]/g, '').slice(0, 128);
    if (clean) out[key] = clean;
  });
  return out;
}

export function normalizeDiscordUser(user) {
  if (!user || !user.id) return null;
  const username = typeof user.username === 'string' ? user.username.slice(0, 64) : '';
  const globalName = typeof user.global_name === 'string' ? user.global_name.slice(0, 128) : '';
  return {
    id: String(user.id),
    username,
    globalName,
    displayName: globalName || username || `Player ${String(user.id).slice(-4)}`,
    avatar: typeof user.avatar === 'string' ? user.avatar.slice(0, 128) : '',
    discriminator: typeof user.discriminator === 'string' ? user.discriminator.slice(0, 8) : '',
    raw: user,
  };
}

export async function exchangeDiscordCode(env, code) {
  const clientId = discordClientId(env);
  const clientSecret = discordClientSecret(env);
  if (!clientSecret) {
    const error = new Error('Discord client secret is not configured');
    error.code = 'discord_secret_not_configured';
    throw error;
  }

  const response = await fetch(`${DISCORD_API}/oauth2/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'authorization_code',
      code,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    const error = new Error('Discord token exchange failed');
    error.status = response.status;
    error.body = data;
    throw error;
  }
  return {
    access_token: data.access_token,
    token_type: data.token_type || 'Bearer',
    expires_in: Number(data.expires_in || 0),
    scope: data.scope || '',
  };
}

export async function fetchDiscordUser(accessToken) {
  const token = String(accessToken || '').trim();
  if (!token) {
    const error = new Error('Missing Discord access token');
    error.code = 'missing_access_token';
    throw error;
  }

  const response = await fetch(`${DISCORD_API}/users/@me`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error('Discord user fetch failed');
    error.status = response.status;
    error.body = data;
    throw error;
  }
  const user = normalizeDiscordUser(data);
  if (!user) {
    const error = new Error('Discord user response missing id');
    error.code = 'missing_discord_user';
    throw error;
  }
  return user;
}

export async function signDiscordSession(env, user, context = {}) {
  const secret = sessionSecret(env);
  if (!secret) {
    const error = new Error('Discord session secret is not configured');
    error.code = 'discord_session_secret_not_configured';
    throw error;
  }
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    uid: String(user.id),
    username: user.username || '',
    globalName: user.globalName || '',
    avatar: user.avatar || '',
    iat: now,
    exp: now + SESSION_TTL_SECONDS,
    ctx: cleanDiscordContext(context),
  };
  const encoded = base64UrlEncode(JSON.stringify(payload));
  const signature = base64UrlEncode(await hmac(secret, encoded));
  return `${encoded}.${signature}`;
}

export async function verifyDiscordSession(env, token) {
  const secret = sessionSecret(env);
  if (!secret) return { ok: false, error: 'discord_session_secret_not_configured' };
  const [encoded, signature] = String(token || '').split('.');
  if (!encoded || !signature) return { ok: false, error: 'bad_session' };
  const expected = base64UrlEncode(await hmac(secret, encoded));
  if (!safeEqual(expected, signature)) return { ok: false, error: 'bad_session_signature' };
  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(encoded)));
  } catch {
    return { ok: false, error: 'bad_session_payload' };
  }
  if (!payload || !payload.uid || Number(payload.exp || 0) < Math.floor(Date.now() / 1000)) {
    return { ok: false, error: 'expired_session' };
  }
  return {
    ok: true,
    user: normalizeDiscordUser({
      id: payload.uid,
      username: payload.username,
      global_name: payload.globalName,
      avatar: payload.avatar,
    }),
    context: cleanDiscordContext(payload.ctx),
  };
}

export async function signDiscordRun(env, user, game) {
  const secret = sessionSecret(env);
  if (!secret) {
    const error = new Error('Discord session secret is not configured');
    error.code = 'discord_session_secret_not_configured';
    throw error;
  }
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    uid: String(user && user.id || ''),
    game: String(game || ''),
    iat: now,
    exp: now + RUN_TTL_SECONDS,
    rid: crypto.randomUUID ? crypto.randomUUID() : base64UrlEncode(crypto.getRandomValues(new Uint8Array(16))),
  };
  if (!payload.uid || !payload.game) {
    const error = new Error('Incomplete Discord run');
    error.code = 'incomplete_discord_run';
    throw error;
  }
  const encoded = base64UrlEncode(JSON.stringify(payload));
  const signature = base64UrlEncode(await hmac(secret, encoded));
  return `${encoded}.${signature}`;
}

export async function verifyDiscordRun(env, token) {
  const secret = sessionSecret(env);
  if (!secret) return { ok: false, error: 'discord_session_secret_not_configured' };
  const [encoded, signature] = String(token || '').split('.');
  if (!encoded || !signature) return { ok: false, error: 'bad_run' };
  const expected = base64UrlEncode(await hmac(secret, encoded));
  if (!safeEqual(expected, signature)) return { ok: false, error: 'bad_run_signature' };
  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(encoded)));
  } catch {
    return { ok: false, error: 'bad_run_payload' };
  }
  const now = Math.floor(Date.now() / 1000);
  if (!payload || !payload.uid || !payload.game || Number(payload.exp || 0) < now) {
    return { ok: false, error: 'expired_run' };
  }
  return {
    ok: true,
    userId: String(payload.uid),
    game: String(payload.game),
    runId: String(payload.rid || ''),
    issuedAt: Number(payload.iat || now),
    ageSeconds: Math.max(0, now - Number(payload.iat || now)),
  };
}

export function publicDiscordUser(user) {
  if (!user) return null;
  return {
    idHash: shortHash(String(user.id)),
    displayName: user.displayName || user.globalName || user.username || `Player ${String(user.id).slice(-4)}`,
    username: user.username || '',
    avatar: user.avatar || '',
  };
}

export function shortHash(value) {
  let h = 0x811c9dc5;
  const s = String(value || '');
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return (`00000000${h.toString(16)}`).slice(-8);
}
