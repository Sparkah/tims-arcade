// GET /api/auth/verify?token=<magic-link-token>
//
// Consumes a magic-link token from KV. On success, sets an HMAC-signed
// HTTP-only session cookie (`tgl_session`) and redirects to "/".
// On failure, redirects to "/login?err=expired".
//
// Cookie format: <base64url(payload)>.<base64url(hmac-sha256(payload, AUTH_SECRET))>
// payload = JSON: { email, uid, exp_ts }
// 30-day TTL. uid = first 16 hex chars of sha256(email) — stable, not reversible.

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const token = String(url.searchParams.get('token') || '');
  if (!token || !/^[A-Za-z0-9_-]{16,32}$/.test(token)) {
    return Response.redirect(`${url.origin}/login?err=bad_token`, 302);
  }

  const k = `magiclink:${token}`;
  const data = await env.VOTES.get(k, 'json');
  if (!data || !data.email) {
    return Response.redirect(`${url.origin}/login?err=expired`, 302);
  }
  // One-shot: delete the token immediately so it can't be reused.
  await env.VOTES.delete(k);

  const email = String(data.email).toLowerCase();
  const uid = await emailToUid(email);

  // Persist user record (idempotent — only set if absent)
  const userKey = `user:${email}`;
  if (!(await env.VOTES.get(userKey))) {
    await env.VOTES.put(userKey, JSON.stringify({ uid, created_ts: Date.now() }));
  }

  if (!env.AUTH_SECRET) {
    return new Response('AUTH_SECRET not configured (CF Pages env var)', { status: 500 });
  }

  const expTs = Date.now() + 30 * 24 * 60 * 60 * 1000;   // 30 days
  const payload = { email, uid, exp_ts: expTs };
  const cookie = await signSessionCookie(payload, env.AUTH_SECRET);

  return new Response(null, {
    status: 302,
    headers: {
      'Location': `${url.origin}/`,
      'Set-Cookie': `tgl_session=${cookie}; Path=/; Expires=${new Date(expTs).toUTCString()}; HttpOnly; Secure; SameSite=Lax`,
    },
  });
}

// ── helpers (also used by other auth endpoints) ─────────────────────────────

async function emailToUid(email) {
  const enc = new TextEncoder().encode(email);
  const h = await crypto.subtle.digest('SHA-256', enc);
  const bytes = Array.from(new Uint8Array(h));
  return bytes.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function signSessionCookie(payload, secret) {
  const body = b64url(new TextEncoder().encode(JSON.stringify(payload)));
  const sig  = await hmacSign(body, secret);
  return `${body}.${sig}`;
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
  const s = btoa(String.fromCharCode(...bytes));
  return s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}
