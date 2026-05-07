// GET /api/admin/user-digests?token=<ADMIN_TOKEN>[&nocache=1]
//
// Pulls each known PostHog Person + their recent events, then asks Claude
// (via Workers AI) to summarize each into a short profile: who they look
// like, what they engaged with, what to build for them.
//
// Auth: same ADMIN_TOKEN gate as /api/admin/stats.
//
// Cache: 1 hour (Cloudflare Cache API, doesn't hit KV). PostHog API has
// rate limits and Claude calls have $$ — caching at 1h means the panel can
// be hit freely without burning quota. ?nocache=1 forces a regenerate.
//
// Response shape:
// {
//   generated_at: "2026-05-07T20:45:00Z",
//   total_users: <int>,
//   anonymous: <int>,
//   identified: <int>,
//   users: [
//     {
//       id: "<distinct_id or uid>",
//       email: "<if known>",
//       first_seen: "...",
//       last_seen: "...",
//       event_count: <int>,
//       top_events: { game_card_clicked: 5, ... },
//       digest: "Claude-generated 2-3 sentence profile",
//     },
//     ...
//   ]
// }

const POSTHOG_HOST = "https://eu.posthog.com";

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token') || request.headers.get('x-admin-token') || '';

  if (!env.ADMIN_TOKEN) return jsonError('admin_token_not_configured', 500);
  if (token !== env.ADMIN_TOKEN) return jsonError('forbidden', 403);
  if (!env.POSTHOG_PERSONAL_KEY) return jsonError('posthog_personal_key_not_configured', 500);
  if (!env.PUBLIC_POSTHOG_KEY) return jsonError('public_posthog_key_not_configured', 500);

  // ── 1-hour edge cache, token-keyed ───────────────────────────────────
  const cache = caches.default;
  const cacheKey = new Request(`https://cache.tims-arcade/admin-user-digests?t=${token}`, { method: 'GET' });
  const noCache = url.searchParams.get('nocache') === '1';
  if (!noCache) {
    const cached = await cache.match(cacheKey);
    if (cached) return cached;
  }

  // ── Resolve project id from the public token ─────────────────────────
  // Require an EXACT api_token match. Falling back to projects[0] could
  // silently mix data from a different project on a multi-project key.
  const projectId = await getProjectId(env);
  if (!projectId) return jsonError('could_not_resolve_posthog_project (need exact api_token match)', 502);

  // ── Pull recent persons ──────────────────────────────────────────────
  const persons = await fetchPersons(env, projectId);

  // ── Pick the latest USERS_TO_DIGEST users by recency ─────────────────
  // CF Pages Functions have bounded wall-clock; 50 sequential fetches +
  // LLM calls will time out. Cap to a small batch on cold load and
  // parallelize the per-user pulls.
  const USERS_TO_DIGEST = 12;
  const sorted = persons
    .sort((a, b) => new Date(b.last_seen || 0) - new Date(a.last_seen || 0))
    .slice(0, USERS_TO_DIGEST);

  // Per-user enrichment in parallel (bounded fan-out — 12 concurrent
  // fetches is well within CF's subrequest limit of 50).
  const enriched = await Promise.all(sorted.map(async (p) => {
    const distinctId = p.distinct_ids?.[0] || p.id;
    const events = await fetchPersonEvents(env, projectId, distinctId);
    return {
      id: distinctId,
      email: p.properties?.email || null,
      first_seen: p.created_at,
      last_seen: p.last_seen,
      event_count: events.length,
      top_events: bucketEvents(events),
      digest: await summarize(env, p, events),
      _person: p,
    };
  }));

  // Drop users with zero events post-fetch — pre-filtering on persons.event_count
  // doesn't work because PostHog often omits that field on the persons endpoint.
  const usersWithEvents = enriched.filter(u => u.event_count > 0);

  const body = {
    generated_at: new Date().toISOString(),
    total_users: persons.length,
    anonymous: persons.filter(p => !p.properties?.email).length,
    identified: persons.filter(p => !!p.properties?.email).length,
    showing: usersWithEvents.length,
    cap: USERS_TO_DIGEST,
    users: usersWithEvents.map(u => { const { _person, ...rest } = u; return rest; }),
  };

  const response = new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'public, max-age=3600',
    },
  });
  await cache.put(cacheKey, response.clone());
  return response;
}

// ─────────────────────────────────────────────────────────────────────────

async function getProjectId(env) {
  const r = await fetch(`${POSTHOG_HOST}/api/projects/`, {
    headers: { 'authorization': `Bearer ${env.POSTHOG_PERSONAL_KEY}` },
  });
  if (!r.ok) return null;
  const data = await r.json();
  const projects = data.results || data || [];
  // EXACT match only — picking a different project would silently mix data.
  const match = projects.find(p => p.api_token === env.PUBLIC_POSTHOG_KEY);
  return match ? match.id : null;
}

async function fetchPersons(env, projectId) {
  const r = await fetch(
    `${POSTHOG_HOST}/api/projects/${projectId}/persons/?limit=200`,
    { headers: { 'authorization': `Bearer ${env.POSTHOG_PERSONAL_KEY}` } }
  );
  if (!r.ok) return [];
  const data = await r.json();
  return data.results || [];
}

async function fetchPersonEvents(env, projectId, distinctId) {
  // Last 50 events per person, ordered most-recent first
  const url = `${POSTHOG_HOST}/api/projects/${projectId}/events/?distinct_id=${encodeURIComponent(distinctId)}&limit=50`;
  const r = await fetch(url, {
    headers: { 'authorization': `Bearer ${env.POSTHOG_PERSONAL_KEY}` },
  });
  if (!r.ok) return [];
  const data = await r.json();
  return data.results || [];
}

function bucketEvents(events) {
  const buckets = {};
  for (const e of events) {
    const name = e.event || 'unknown';
    buckets[name] = (buckets[name] || 0) + 1;
  }
  return buckets;
}

async function summarize(env, person, events) {
  // Compress the event stream so the prompt fits cheaply
  const last = events.slice(0, 25).map(e => ({
    event: e.event,
    ts: e.timestamp,
    props: pickProps(e.properties),
  }));
  const persona = {
    email: person.properties?.email || null,
    created_at: person.created_at,
    last_seen: person.last_seen,
    geoip_country_name: person.properties?.$geoip_country_name || null,
    browser: person.properties?.$browser || null,
    os: person.properties?.$os || null,
  };
  const prompt = `You're profiling a single visitor of game-factory.tech (a HTML5 indie casual game gallery). Summarize this user in 2-3 sentences. Cover: which games they engaged with, behavior pattern (browser/skim/play, vote, comment), apparent preferences. Be concrete; cite events when useful.

PERSON METADATA:
${JSON.stringify(persona, null, 2)}

LAST 25 EVENTS (most recent first):
${JSON.stringify(last, null, 2)}

Output ONLY the 2-3 sentence summary, no preamble.`;

  // Use Cloudflare Workers AI (free tier inside Functions runtime). If that
  // isn't bound, fall back to a deterministic synthetic summary so the
  // panel never breaks.
  if (env.AI && typeof env.AI.run === 'function') {
    try {
      const out = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
        messages: [
          { role: 'system', content: 'You write tight user-behavior summaries for product owners. Be concrete and brief.' },
          { role: 'user', content: prompt },
        ],
        max_tokens: 220,
      });
      const text = (out && (out.response || out.result)) || '';
      if (text && text.length > 20) return String(text).trim();
    } catch (_) { /* fall through */ }
  }
  return synthFallback(person, events);
}

function pickProps(p) {
  if (!p) return {};
  const keep = ['slug', 'game_title', 'tab', 'genre', 'action', 'method', 'has_comment', 'seconds_played', 'query_length'];
  const out = {};
  for (const k of keep) if (p[k] !== undefined) out[k] = p[k];
  return out;
}

function synthFallback(person, events) {
  const slugs = new Set();
  let votes = 0, plays = 0, comments = 0;
  for (const e of events) {
    const s = e.properties && e.properties.slug;
    if (s) slugs.add(s);
    if (e.event === 'game_play_started') plays++;
    if (e.event === 'gallery_vote_cast' || e.event === 'game_voted') votes++;
    if (e.event === 'game_feedback_submitted' || e.event === 'comment_posted_inline') comments++;
  }
  const country = person.properties?.$geoip_country_name || 'unknown country';
  const id = person.properties?.email || person.distinct_ids?.[0]?.slice(0, 8) || 'anon';
  const games = [...slugs].slice(0, 4).join(', ') || 'no games yet';
  return `${id} from ${country}: ${plays} play(s), ${votes} vote(s), ${comments} comment(s) across ${slugs.size} game(s) (${games}).`;
}

function jsonError(msg, status) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
