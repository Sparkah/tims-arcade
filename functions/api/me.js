// GET /api/me
// Returns { email, uid, exp_ts } if signed in, or { signed_in: false } if not.
// Used by the gallery's "Sign in" pill to decide whether to show "Sign in"
// or the user's identifier.

import { readSession } from './_session.js';

export async function onRequestGet({ request, env }) {
  const session = await readSession(request, env);
  if (!session) {
    return new Response(JSON.stringify({ signed_in: false }), {
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  }
  return new Response(JSON.stringify({
    signed_in: true,
    email: session.email,
    uid: session.uid,
    exp_ts: session.exp_ts,
  }), {
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
