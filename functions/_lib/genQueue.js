const PENDING_KEY = 'genqueue:pending';
const INFLIGHT_KEY = 'genqueue:inflight';
const SIGNAL_KEY = 'genjob:signal';
const INDEX_TTL = 60 * 60 * 24 * 30;
const MAX_INDEX_ITEMS = 500;
const ID_RE = /^[0-9a-z]{8,40}$/;

export async function addPendingJob(env, jobRec) {
  const item = queueItem(jobRec, { readyTs: jobRec && (jobRec.retryAfter || jobRec.ts) });
  if (!item) return;
  await removeFromIndex(env, INFLIGHT_KEY, item.id);
  await upsertIndex(env, PENDING_KEY, item, comparePending);
  await touchQueueSignal(env, item.readyTs || item.ts || Date.now());
}

export async function markJobBuilding(env, jobRec) {
  const item = queueItem(jobRec, { updatedTs: jobRec && (jobRec.updatedTs || Date.now()) });
  if (!item) return;
  await removeFromIndex(env, PENDING_KEY, item.id);
  await upsertIndex(env, INFLIGHT_KEY, item, compareInflight);
}

export async function requeueJob(env, jobRec) {
  const item = queueItem(jobRec, { readyTs: jobRec && (jobRec.retryAfter || jobRec.updatedTs || Date.now()) });
  if (!item) return;
  await removeFromIndex(env, INFLIGHT_KEY, item.id);
  await upsertIndex(env, PENDING_KEY, item, comparePending);
  await touchQueueSignal(env, item.readyTs || item.ts || Date.now());
}

export async function removeJobFromQueue(env, jobRecOrId) {
  const id = typeof jobRecOrId === 'string' ? jobRecOrId : jobRecOrId && jobRecOrId.id;
  if (!validId(id)) return;
  await removeFromIndex(env, PENDING_KEY, id);
  await removeFromIndex(env, INFLIGHT_KEY, id);
}

export async function queueCandidateIds(env, { limit = 5, stuckMs = 10 * 60 * 1000, now = Date.now(), lane = '' } = {}) {
  const [pending, inflight] = await Promise.all([
    readIndex(env, PENDING_KEY),
    readIndex(env, INFLIGHT_KEY),
  ]);
  // Keep this boundary safe even if a caller or future index migration bypasses
  // readIndex's queueItem normalization: missing/unknown lanes are legacy public,
  // and only the exact trusted marker may enter the partner worker.
  const laneMatches = item => {
    const itemLane = item && item.generatorLane === 'trusted-codex' ? 'trusted-codex' : 'public';
    return !lane || itemLane === lane;
  };
  const readyPending = pending
    .filter(laneMatches)
    .filter(item => !item.readyTs || item.readyTs <= now)
    .sort(comparePending)
    .slice(0, Math.max(limit * 4, limit));
  const stuckInflight = inflight
    .filter(laneMatches)
    .filter(item => now - (item.updatedTs || item.ts || 0) > stuckMs)
    .sort(compareInflight)
    .slice(0, Math.max(limit * 4, limit));

  const seen = new Set();
  const out = [];
  for (const item of [...readyPending, ...stuckInflight]) {
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item.id);
  }
  return out;
}

export async function touchQueueSignal(env, value = Date.now()) {
  await env.VOTES.put(SIGNAL_KEY, String(value));
}

async function upsertIndex(env, key, item, compare) {
  const current = await readIndex(env, key);
  const next = [item, ...current.filter(existing => existing.id !== item.id)]
    .sort(compare)
    .slice(0, MAX_INDEX_ITEMS);
  await env.VOTES.put(key, JSON.stringify(next), { expirationTtl: INDEX_TTL });
}

async function removeFromIndex(env, key, id) {
  const current = await readIndex(env, key);
  if (!current.some(item => item.id === id)) return;
  await env.VOTES.put(key, JSON.stringify(current.filter(item => item.id !== id)), { expirationTtl: INDEX_TTL });
}

async function readIndex(env, key) {
  const raw = await env.VOTES.get(key, 'json');
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const item of raw) {
    const normalized = queueItem(item, item);
    if (normalized) out.push(normalized);
  }
  return out;
}

function queueItem(jobRec, extra = {}) {
  const id = String(jobRec && jobRec.id || '').toLowerCase();
  if (!validId(id)) return null;
  const ts = finiteMs(jobRec.ts) || finiteMs(extra.ts) || Date.now();
  const item = { id, ts };
  const readyTs = finiteMs(extra.readyTs);
  const updatedTs = finiteMs(extra.updatedTs);
  if (readyTs) item.readyTs = readyTs;
  if (updatedTs) item.updatedTs = updatedTs;
  if (jobRec.baseId && validId(jobRec.baseId)) item.baseId = String(jobRec.baseId).toLowerCase();
  // Jobs created before lane routing existed belong to the legacy public lane.
  // Only an explicit trusted marker can enter the Codex partner lane.
  item.generatorLane = jobRec.generatorLane === 'trusted-codex' ? 'trusted-codex' : 'public';
  return item;
}

function comparePending(a, b) {
  return (a.readyTs || a.ts || 0) - (b.readyTs || b.ts || 0);
}

function compareInflight(a, b) {
  return (a.updatedTs || a.ts || 0) - (b.updatedTs || b.ts || 0);
}

function validId(id) {
  return ID_RE.test(String(id || ''));
}

function finiteMs(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}
