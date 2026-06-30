const MAX_INDEXED_COMMENTS = 50;
const COMMENT_INDEX_TTL = 60 * 60 * 24 * 180;

export async function addPublicComment(env, slug, row) {
  const item = normalizeComment(row);
  if (!item) return;
  const current = await readPublicCommentIndex(env, slug) || [];
  const next = [item, ...current.filter(existing => existing.id !== item.id)]
    .sort((a, b) => (b.ts || 0) - (a.ts || 0))
    .slice(0, MAX_INDEXED_COMMENTS);
  await writePublicCommentIndex(env, slug, next);
}

export async function readPublicCommentIndex(env, slug) {
  const raw = await env.VOTES.get(indexKey(slug), 'json');
  if (!Array.isArray(raw)) return null;
  return raw.map(normalizeComment).filter(Boolean);
}

export async function writePublicCommentIndex(env, slug, rows) {
  const clean = (Array.isArray(rows) ? rows : [])
    .map(normalizeComment)
    .filter(Boolean)
    .sort((a, b) => (b.ts || 0) - (a.ts || 0))
    .slice(0, MAX_INDEXED_COMMENTS);
  await env.VOTES.put(indexKey(slug), JSON.stringify(clean), { expirationTtl: COMMENT_INDEX_TTL });
}

function normalizeComment(row) {
  const comment = String(row && row.comment || '').slice(0, 500).trim();
  if (!comment) return null;
  const id = String(row.id || '').slice(0, 48).replace(/[^a-z0-9:-]/gi, '');
  const vote = row.vote === 'like' || row.vote === 'dislike' || row.vote === 'neutral' || row.vote === 'empty'
    ? row.vote
    : null;
  const ts = Number(row.ts);
  return {
    id: id || String(ts || Date.now()),
    vote,
    comment,
    ts: Number.isFinite(ts) && ts > 0 ? Math.floor(ts) : Date.now(),
  };
}

function indexKey(slug) {
  return `commentidx:${slug}`;
}
