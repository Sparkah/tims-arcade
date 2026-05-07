// POST /api/auth/request
// Body: { email: "user@example.com" }
//
// Generates a magic-link token, stores it in KV with 15-min TTL, emails the
// link to the user via Resend (or just returns it in the response when
// AUTH_DEV_MODE=1 is set — useful before Resend is configured).
//
// On success: 204 No Content (don't leak whether email exists).
// Anti-abuse: 5 requests / IP / 10 min.

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); }
  catch { return jsonError('invalid_json', 400); }

  const email = String(body.email || '').trim().toLowerCase();
  if (!isValidEmail(email)) return jsonError('bad_email', 400);

  // Rate limit by IP — soft cap, not security critical
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const rateKey = `authrate:${ip}:${Math.floor(Date.now() / 600000)}`;
  const rate = parseInt(await env.VOTES.get(rateKey)) || 0;
  if (rate >= 5) return jsonError('rate_limit', 429);
  await env.VOTES.put(rateKey, String(rate + 1), { expirationTtl: 700 });

  // Generate URL-safe token (16 random bytes → 22 chars b64)
  const tokenBytes = new Uint8Array(16);
  crypto.getRandomValues(tokenBytes);
  const token = btoa(String.fromCharCode(...tokenBytes))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

  // Stash token → email mapping with 15-min TTL.
  await env.VOTES.put(
    `magiclink:${token}`,
    JSON.stringify({ email, ts: Date.now() }),
    { expirationTtl: 900 }
  );

  const origin = new URL(request.url).origin;
  const magicLink = `${origin}/api/auth/verify?token=${encodeURIComponent(token)}`;

  // Send email via Resend if configured. Otherwise log the link
  // server-side (visible in CF dashboard) — Tim can copy it manually.
  let delivery = 'logged-server-side';
  if (env.RESEND_API_KEY) {
    try {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: env.RESEND_FROM || 'Tim\'s Game Lab <onboarding@resend.dev>',
          to: [email],
          subject: 'Your sign-in link for Tim\'s Game Lab',
          html: emailBody(magicLink),
          text: `Click to sign in: ${magicLink}\n\nLink expires in 15 minutes.\nIf you didn't request this, ignore.`,
        }),
      });
      delivery = r.ok ? 'resend-ok' : `resend-${r.status}`;
    } catch (e) { delivery = 'resend-error'; }
  }
  console.log(`auth/request: ${email} → ${magicLink} (delivery=${delivery})`);

  // Dev mode: return the magic link in the response so Tim doesn't have
  // to dig through CF logs while building/testing.
  if (env.AUTH_DEV_MODE === '1') {
    return new Response(JSON.stringify({ ok: true, devMagicLink: magicLink, delivery }), {
      headers: { 'content-type': 'application/json' },
    });
  }
  return new Response(null, { status: 204 });
}

function isValidEmail(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) && s.length <= 200;
}

function jsonError(msg, status) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function emailBody(link) {
  return `<!DOCTYPE html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 480px; margin: 40px auto; padding: 24px; color: #1a1a1a;">
  <h2 style="font-size: 22px; margin-bottom: 12px;">Sign in to Tim's Game Lab</h2>
  <p style="color: #4a4a55;">Click the link below to sign in. It expires in 15 minutes.</p>
  <p style="margin: 24px 0;">
    <a href="${link}" style="display: inline-block; background: #0747a6; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600;">Sign in</a>
  </p>
  <p style="font-size: 13px; color: #8a8a94;">If you didn't request this, ignore the email.</p>
  <p style="font-size: 12px; color: #b0b0bc; margin-top: 32px;">— game-factory.tech</p>
</body></html>`;
}
