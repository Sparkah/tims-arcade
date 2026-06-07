// Anonymous-cohort RETENTION instrument (D1/D7/...).
//
// Per anonymous `uid` we store: first-seen date + the set of ACTIVE DAYS (a day on
// which they returned and played). Dn retention is computed at READ time in the
// admin endpoint. Write-efficient by design: ~1 KV write per user per active day
// (recordActiveDay no-ops the write once a uid is already logged for `today`).
//
// HONEST CAVEAT (bake into the dashboard): at low traffic this is directional
// plumbing + a smoke test, NOT decision-grade — real D1/D7 come from the platforms
// once games are live. Migrate the per-uid keys to D1 (SQL, 100k writes/day free)
// when daily uniques start to pressure the KV write budget (see Gallery CLAUDE.md).
//
// KV shape: `cohort:<uid>` -> {"f":"YYYY-MM-DD","d":["YYYY-MM-DD",...]}  (d capped to 90)

const DAY = 86400000;

export function dateUtc(ts) { return new Date(ts).toISOString().slice(0, 10); }
export function addDays(dateStr, n) {
  return new Date(Date.parse(dateStr + 'T00:00:00Z') + n * DAY).toISOString().slice(0, 10);
}
export function daysBetween(a, b) {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / DAY);
}

// CAPTURE. Call from heartbeat with the anonymous uid + today's UTC date. Writes
// only when `today` is a NEW active day for this uid (so cost ~= 1 write/uid/day).
export async function recordActiveDay(env, uid, today) {
  if (!uid || !today) return;
  try {
    const key = `cohort:${uid}`;
    let c = null;
    try { c = JSON.parse((await env.VOTES.get(key)) || 'null'); } catch { c = null; }
    if (!c || typeof c !== 'object' || !c.f) {
      await env.VOTES.put(key, JSON.stringify({ f: today, d: [today] }));
      return;
    }
    if (!Array.isArray(c.d)) c.d = [c.f];
    if (c.d.includes(today)) return;            // already counted today -> NO write
    c.d.push(today);
    if (c.d.length > 90) c.d = c.d.slice(-90);  // bound the stored value
    await env.VOTES.put(key, JSON.stringify(c));
  } catch { /* capture is best-effort; a KV failure must NEVER break the heartbeat */ }
}

// COMPUTE. Pure aggregation over cohort entries — unit-testable, no KV.
// entries: [{ uid, f, d:[...] }].  opts: { today, internal:Set, horizons, confidentN }
// A cohort's Dn is `null` until the cohort is at least n days old (not yet mature).
export function computeCohorts(entries, opts = {}) {
  const today = opts.today || dateUtc(Date.now());
  const internal = opts.internal || new Set();
  const horizons = opts.horizons || [1, 3, 7, 14, 30];
  const confidentN = opts.confidentN || 10;

  const byCohort = new Map();
  let totalUsers = 0;
  for (const e of entries) {
    if (!e || !e.f || internal.has(e.uid)) continue;
    totalUsers++;
    if (!byCohort.has(e.f)) byCohort.set(e.f, []);
    byCohort.get(e.f).push(new Set(Array.isArray(e.d) ? e.d : []));
  }

  const cohorts = [];
  for (const [date, users] of [...byCohort.entries()].sort()) {
    const n = users.length;
    const age = daysBetween(date, today);
    const retention = {};
    for (const h of horizons) {
      if (age < h) { retention['d' + h] = null; continue; } // not mature yet
      const target = addDays(date, h);
      let ret = 0;
      for (const set of users) if (set.has(target)) ret++;
      const p = n ? ret / n : 0;
      const se = n ? Math.sqrt(p * (1 - p) / n) : 0;
      retention['d' + h] = {
        pct: +(p * 100).toFixed(1), returned: ret,
        ciHalf: +(1.96 * se * 100).toFixed(1), lowSample: n < confidentN,
      };
    }
    cohorts.push({ date, n, ageDays: age, retention });
  }

  // Sample-weighted overall per horizon (mature cohorts only).
  const summary = { totalUsers, byHorizon: {} };
  for (const h of horizons) {
    let num = 0, den = 0;
    for (const row of cohorts) {
      const r = row.retention['d' + h];
      if (r) { num += r.returned; den += row.n; }
    }
    summary.byHorizon['d' + h] = den
      ? { pct: +(num / den * 100).toFixed(1), users: den, returned: num, lowSample: den < confidentN }
      : null;
  }
  return { cohorts, summary };
}
