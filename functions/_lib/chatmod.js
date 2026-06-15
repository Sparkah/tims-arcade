// Shared chat moderation -- link/contact blocking + EN/RU profanity + name/text
// cleaning. The canonical copy of the rules that bandlings-chat.js pioneered, so
// the per-game chat and the global gallery lounge (api/chat.js) enforce the SAME
// battle-tested filters. Server-side and non-bypassable: the client never decides
// what's allowed, it only renders the rejection reason we return.
//
// Tim's rules (2026-06-15): NO links (they get abused) -- containsContact blocks
// urls/handles/emails/phone-runs. NO images -- text-only by construction. Works
// for anonymous AND signed-in posters (name is cosmetic + user-chosen).

export const DEFAULT_MAX_TEXT = 200;
export const DEFAULT_MAX_NAME = 18;

// Lowercase + strip diacritics (\p{M} = combining marks left by NFKD) + collapse
// common leet/Cyrillic look-alikes to a latin skeleton, so spaced-out or accented
// or Cyrillic-spoofed slurs all fold toward the stem the blocklist matches.
export function fold(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[0@]/g, 'o')
    .replace(/[1!|]/g, 'i')
    .replace(/[3]/g, 'e')
    .replace(/[4]/g, 'a')
    .replace(/[5$]/g, 's')
    .replace(/[а@]/g, 'a')
    .replace(/[еёэ]/g, 'e')
    .replace(/[о0]/g, 'o')
    .replace(/[р]/g, 'p')
    .replace(/[с]/g, 'c')
    .replace(/[х]/g, 'x')
    .replace(/[у]/g, 'y')
    .replace(/[^a-zа-я0-9]+/g, '');
}

// Block anything that smells like an off-platform contact or link -- Tim's
// "no links" rule. URLs, common TLDs, chat-app names, @handles, emails, and any
// run of 7+ digits (phone numbers).
const TLD = 'com|net|org|ru|io|gg|xyz|app|co|me|tv|info|biz|online|site|link|club|dev|gl|ly|cc|to|win|live|store|shop|fun|space|press|us|uk|de|fr|it|es|pl|in|cn|jp|kr';

// `phone` defaults true (chat blocks phone numbers). Callers that validate game
// prompts pass { phone:false } so legit number-heavy ideas ("score up to 9999999")
// aren't mis-flagged as contact info (Codex/scorecard 2026-06-15).
export function containsContact(text, { phone = true } = {}) {
  const raw = String(text || '').toLowerCase();
  // schemes / known contact platforms / @handles
  if (/https?:|hxxp|www\.|t\.me|discord|telegram|whatsapp|\bvk\b|@[a-z0-9_]{2,}/i.test(raw)) return true;
  // bare domains: label.tld with a real TLD and no spaces around the dot
  if (new RegExp('\\b[a-z0-9][a-z0-9-]*\\.(' + TLD + ')\\b', 'i').test(raw)) return true;
  // obfuscated dot: "example dot com", "example (dot) com"
  if (new RegExp('\\b[a-z0-9-]{2,}\\s*(?:\\(dot\\)|\\[dot\\]|\\bdot\\b)\\s*(' + TLD + ')\\b', 'i').test(raw)) return true;
  // email
  if (/\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/i.test(raw)) return true;
  // phone-ish: 7+ digits total (chat only)
  if (phone && raw.replace(/\D/g, '').length >= 7) return true;
  return false;
}

export function containsBlocked(text) {
  const lower = String(text || '').toLowerCase().normalize('NFKD').replace(/\p{M}/gu, '');
  // Leet-normalize but KEEP word separators, so we match WHOLE words and don't
  // trip on innocent substrings (analysis, cockpit, grape, Essex) -- the
  // Scunthorpe problem the old substring filter had (Codex review 2026-06-15).
  const norm = lower
    .replace(/0/g, 'o').replace(/[1!|]/g, 'i').replace(/3/g, 'e')
    .replace(/4/g, 'a').replace(/[5$]/g, 's').replace(/7/g, 't').replace(/@/g, 'a');
  const EN = /\b(fuck\w*|shit\w*|bitch\w*|cunt\w*|dick|dicks|cock|cocks|pussy|porn\w*|sex(?:y|ual|ist)?|nude|nudes|naked|anal|hentai|onlyfans|blowjob|rape|raping|rapist|nigg(?:er|a|ers|as)|fag|fags|faggot\w*|retard\w*|slut\w*|whore\w*|cum|jerkoff|wank\w*|suicide|kill(?:urself|yourself))\b/;
  if (EN.test(norm)) return true;
  // Russian/Cyrillic stems (don't collide with common game vocabulary).
  if (/ху[йяеюи]|пизд|еб[ауеёи]|ёб[ауеи]|бля|сука|сучка|пид[оа]р|залуп|минет|порно|\bчлен|голая|голый|сиськ/.test(lower)) return true;
  return false;
}

function blockedName(name) {
  return containsContact(name) || containsBlocked(name);
}

// Sanitize a display name: strip control chars + angle brackets, collapse
// whitespace, cap length, and fall back to "Player" when empty or blocked.
export function cleanName(name, maxName = DEFAULT_MAX_NAME) {
  name = String(name || '').normalize('NFKC').replace(/[\x00-\x1f\x7f<>]/g, ' ');
  name = name.replace(/\s+/g, ' ').trim().slice(0, maxName);
  if (!name || blockedName(name)) name = 'Player';
  return name;
}

// Validate + sanitize a message. Returns { ok, text } on success or
// { ok:false, reason } where reason in empty|contact|blocked.
export function filterText(text, maxText = DEFAULT_MAX_TEXT, { phone = true } = {}) {
  text = String(text || '').normalize('NFKC');
  text = text.replace(/[\x00-\x1f\x7f<>]/g, ' ');
  text = text.replace(/\s+/g, ' ').trim();
  if (!text) return { ok: false, reason: 'empty' };
  if (text.length > maxText) text = text.slice(0, maxText).trim();
  if (containsContact(text, { phone })) return { ok: false, reason: 'contact' };
  if (containsBlocked(text)) return { ok: false, reason: 'blocked' };
  return { ok: true, text };
}
