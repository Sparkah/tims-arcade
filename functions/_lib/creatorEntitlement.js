import { emailToUid } from './uid.js';

const UID_RE = /^[0-9a-f]{16}$/;

// Comped creator access is deliberately separate from admin access. The value is
// a comma-separated list of the stable, non-reversible UIDs produced by
// emailToUid() after a user verifies their email through the normal magic-link
// flow. No email addresses or privileges live in source control.
export function getCompedCreatorUids(env = {}) {
  return String(env.GAME_FACTORY_COMPED_CREATOR_UIDS || '')
    .split(',')
    .map(value => value.trim().toLowerCase())
    .filter(value => UID_RE.test(value));
}

export async function isCompedCreatorSession(session, env = {}) {
  const uid = String(session && session.uid || '').trim().toLowerCase();
  const email = String(session && session.email || '').trim().toLowerCase();
  if (!UID_RE.test(uid) || !email) return false;

  // Bind the allowlisted UID back to the verified email carried by the signed
  // session. This prevents a malformed/legacy session with someone else's UID
  // from inheriting partner access.
  if (await emailToUid(email) !== uid) return false;
  return getCompedCreatorUids(env).includes(uid);
}
