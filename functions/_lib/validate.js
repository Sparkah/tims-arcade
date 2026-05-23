// Canonical input validators shared across the API functions.
//
// SLUG_RE is the slug whitelist that was duplicated inline in vote / play /
// feedback / feedback-image / click / heartbeat / comments and as a local
// `const SLUG_RE` in scores. Lowercase/upper alnum + underscore + hyphen,
// 1-40 chars. `isValidSlug` wraps it for the common `.test()` call site.

export const SLUG_RE = /^[a-z0-9_-]{1,40}$/i;

export function isValidSlug(slug) {
  return SLUG_RE.test(slug);
}
