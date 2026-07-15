import { readSession } from '../api/_session.js';
import { isAllowedAdminSession } from './adminAuth.js';

// Private player creations remain hidden from anonymous/unrelated accounts, but
// the site admin must be able to open the play link exposed by moderation tools.
// Keep this shared so the raw iframe document and its level payload cannot drift
// into different authorization decisions.
export async function canReadPrivateCreation(request, env, ownerUid) {
  let session = null;
  try { session = await readSession(request, env); } catch (_) {}
  if (session && session.uid && session.uid === ownerUid) return true;
  // Browser playback needs only the signed, allowlisted admin identity. Do not
  // widen private game access to operational bearer tokens or legacy cookies.
  return isAllowedAdminSession(request, env);
}
