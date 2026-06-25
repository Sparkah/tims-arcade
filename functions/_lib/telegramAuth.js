const WEBAPP_AUTH_MAX_AGE_SECONDS = 2 * 24 * 60 * 60;

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
async function hmacBytes(keyBytes, message) {
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message)));
}

function safeEqualHex(a, b) {
  const left = String(a || '').toLowerCase();
  const right = String(b || '').toLowerCase();
  if (left.length !== right.length) return false;

  let diff = 0;
  for (let i = 0; i < left.length; i += 1) {
    diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return diff === 0;
}

function parseTelegramUser(value) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    if (!parsed || parsed.id === undefined || parsed.id === null) return null;
    return {
      id: String(parsed.id),
      username: typeof parsed.username === 'string' ? parsed.username.slice(0, 64) : null,
      first_name: typeof parsed.first_name === 'string' ? parsed.first_name.slice(0, 128) : null,
      last_name: typeof parsed.last_name === 'string' ? parsed.last_name.slice(0, 128) : null,
      language_code: typeof parsed.language_code === 'string' ? parsed.language_code.slice(0, 16) : null,
      is_premium: Boolean(parsed.is_premium),
    };
  } catch {
    return null;
  }
}

export async function verifyTelegramInitData(initData, botToken) {
  if (!initData || typeof initData !== 'string') {
    return { ok: false, error: 'missing_init_data' };
  }
  if (!botToken) {
    return { ok: false, error: 'missing_bot_token' };
  }

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return { ok: false, error: 'missing_hash' };

  params.delete('hash');
  const authDate = Number(params.get('auth_date') || 0);
  if (!authDate) return { ok: false, error: 'missing_auth_date' };

  const now = Math.floor(Date.now() / 1000);
  if (now - authDate > WEBAPP_AUTH_MAX_AGE_SECONDS) {
    return { ok: false, error: 'expired_init_data' };
  }

  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secretKey = await hmacBytes(new TextEncoder().encode('WebAppData'), botToken);
  const calculated = bytesToHex(await hmacBytes(secretKey, dataCheckString));
  if (!safeEqualHex(calculated, hash)) {
    return { ok: false, error: 'bad_signature' };
  }

  const user = parseTelegramUser(params.get('user'));
  if (!user) return { ok: false, error: 'missing_user' };

  return {
    ok: true,
    user,
    authDate,
    queryId: params.get('query_id') || null,
    raw: Object.fromEntries(params.entries()),
  };
}
