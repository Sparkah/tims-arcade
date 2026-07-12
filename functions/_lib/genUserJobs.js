const INDEX_TTL = 60 * 60 * 24 * 30;
// Partner creators may use the 20/day safety allowance. Keep the full 30-day
// log window discoverable in Recent Builds instead of retaining records that
// disappear from the index after only ~1.5 busy days.
const MAX_JOBS = 600;
const ID_RE = /^[0-9a-z]{8,40}$/;
const UID_RE = /^[0-9a-f]{16}$/;

function key(uid) {
  return `genjobs:user:${uid}`;
}

export async function addUserJob(env, uid, jobRec) {
  uid = String(uid || '').toLowerCase();
  const id = String(jobRec && jobRec.id || '').toLowerCase();
  if (!UID_RE.test(uid) || !ID_RE.test(id)) return;
  const current = await readUserJobIds(env, uid);
  const next = [{ id, ts: Math.max(0, Math.floor(Number(jobRec.ts) || Date.now())) }, ...current.filter(item => item.id !== id)]
    .sort((a, b) => b.ts - a.ts)
    .slice(0, MAX_JOBS);
  await env.VOTES.put(key(uid), JSON.stringify(next), { expirationTtl: INDEX_TTL });
}

export async function readUserJobIds(env, uid) {
  uid = String(uid || '').toLowerCase();
  if (!UID_RE.test(uid)) return [];
  const stored = await env.VOTES.get(key(uid), 'json');
  if (!Array.isArray(stored)) return [];
  return stored.map(item => ({
    id: String(item && item.id || '').toLowerCase(),
    ts: Math.max(0, Math.floor(Number(item && item.ts) || 0)),
  })).filter(item => ID_RE.test(item.id)).slice(0, MAX_JOBS);
}

export async function removeUserJob(env, uid, id) {
  uid = String(uid || '').toLowerCase();
  id = String(id || '').toLowerCase();
  if (!UID_RE.test(uid) || !ID_RE.test(id)) return;
  const current = await readUserJobIds(env, uid);
  if (!current.some(item => item.id === id)) return;
  await env.VOTES.put(key(uid), JSON.stringify(current.filter(item => item.id !== id)), { expirationTtl: INDEX_TTL });
}
