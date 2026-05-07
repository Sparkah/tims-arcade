// Shared session-cookie helper for Pages Functions.
// Imported by /api/me, /api/vote (for the user-aware path), /api/feedback, etc.
//
// Verifies the `tgl_session` cookie's HMAC signature against AUTH_SECRET,
// returns the parsed payload { email, uid, exp_ts } when valid, or null.

export async function readSession(request, env) {
  if (!env.AUTH_SECRET) return null;
  const cookie = parseCookie(request.headers.get('Cookie') || '', 'tgl_session');
  if (!cookie) return null;

  const dotIdx = cookie.lastIndexOf('.');
  if (dotIdx < 0) return null;
  const body = cookie.slice(0, dotIdx);
  const sig  = cookie.slice(dotIdx + 1);

  // Constant-time compare via re-sign + equality check on derived sig.
  const expected = await hmacSign(body, env.AUTH_SECRET);
  if (!constantTimeEqual(sig, expected)) return null;

  let payload;
  try {
    const decoded = atob(body.replace(/-/g, '+').replace(/_/g, '/'));
    payload = JSON.parse(decoded);
  } catch (e) { return null; }

  if (!payload.exp_ts || payload.exp_ts < Date.now()) return null;
  return payload;
}

function parseCookie(headerVal, name) {
  if (!headerVal) return null;
  const parts = headerVal.split(/;\s*/);
  for (const p of parts) {
    const eq = p.indexOf('=');
    if (eq < 0) continue;
    if (p.slice(0, eq) === name) return p.slice(eq + 1);
  }
  return null;
}

async function hmacSign(message, secret) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return b64url(new Uint8Array(sig));
}

function b64url(bytes) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
