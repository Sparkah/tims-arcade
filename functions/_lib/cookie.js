// Shared cookie parser. Imported by endpoints that read `uid` (anonymous
// identity) without going through the full HMAC session check.

export function parseCookie(headerVal, name) {
  if (!headerVal) return null;
  const parts = headerVal.split(/;\s*/);
  for (const p of parts) {
    const eq = p.indexOf('=');
    if (eq < 0) continue;
    if (p.slice(0, eq) === name) return p.slice(eq + 1);
  }
  return null;
}
