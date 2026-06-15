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

export function containsContact(text) {
  const raw = String(text || '').toLowerCase();
  // schemes / known contact platforms / @handles
  if (/https?:|hxxp|www\.|t\.me|discord|telegram|whatsapp|\bvk\b|@[a-z0-9_]{2,}/i.test(raw)) return true;
  // bare domains: label.tld with a real TLD and no spaces around the dot
  if (new RegExp('\\b[a-z0-9][a-z0-9-]*\\.(' + TLD + ')\\b', 'i').test(raw)) return true;
  // obfuscated dot: "example dot com", "example (dot) com"
  if (new RegExp('\\b[a-z0-9-]{2,}\\s*(?:\\(dot\\)|\\[dot\\]|\\bdot\\b)\\s*(' + TLD + ')\\b', 'i').test(raw)) return true;
  // email
  if (/\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/i.test(raw)) return true;
  // phone-ish: 7+ digits total
  return raw.replace(/\D/g, '').length >= 7;
}

export function containsBlocked(text) {
  const s = fold(text);
  const raw = String(text || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-zа-я0-9]+/g, '');
  const patterns = [
    /fuck|shit|bitch|cunt|dick|cock|pussy|porn|sex|nude|naked|anal|hentai|onlyfans|blowjob|rape|suicide|killurself|killyourself/,
    /nigg|fagg|retard/,
    /ху[йяеюи]|пизд|еба|еби|ебу|ёба|ёби|бля|сука|секс|порно|член|минет|анал|сиськ|голая|голый/,
  ];
  return patterns.some(re => re.test(s) || re.test(raw));
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
export function filterText(text, maxText = DEFAULT_MAX_TEXT) {
  text = String(text || '').normalize('NFKC');
  text = text.replace(/[\x00-\x1f\x7f<>]/g, ' ');
  text = text.replace(/\s+/g, ' ').trim();
  if (!text) return { ok: false, reason: 'empty' };
  if (text.length > maxText) text = text.slice(0, maxText).trim();
  if (containsContact(text)) return { ok: false, reason: 'contact' };
  if (containsBlocked(text)) return { ok: false, reason: 'blocked' };
  return { ok: true, text };
}
