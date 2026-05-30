// Stable user id derived from an email: first 8 bytes of sha256(lowercased
// email) as hex (16 chars). Not reversible, no PII stored.
//
// Shared on purpose: auth/verify.js derives it at login and admin/uploads.js
// derives it when reassigning an upload's owner. If those two ever drift, a
// reassigned game would silently fail to show up in its owner's account — so
// the derivation lives in exactly one place.
export async function emailToUid(email) {
  const norm = String(email == null ? '' : email).toLowerCase();
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(norm));
  return Array.from(new Uint8Array(h)).slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');
}
