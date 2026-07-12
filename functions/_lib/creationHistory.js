export const CREATION_HISTORY_SCHEMA = 'game-factory-creation-history-v1';
export const CREATION_HISTORY_TTL = 60 * 60 * 24 * 30;

const MAX_EVENTS = 80;
const MAX_SCRIPT_JSON = 64 * 1024;

export function historyKey(id) {
  return `creation-history:${id}`;
}

export function cleanText(value, max = 240) {
  return String(value == null ? '' : value)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function cleanId(value, fallback) {
  return cleanText(value, 80).replace(/[^0-9a-z:_-]/gi, '') || fallback;
}

function cleanVersionNumber(value) {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export function makeVersionName(title, versionNumber) {
  const base = (cleanText(title, 64).replace(/\s+v\d+$/i, '') || 'Game').trim();
  return `${base} v${cleanVersionNumber(versionNumber)}`;
}

function normalizeEvent(event, index) {
  const ts = Math.max(0, Math.floor(Number(event && event.ts) || 0));
  const role = event && event.role === 'player' ? 'player' : 'studio';
  const type = ['request', 'result', 'failed', 'system'].includes(event && event.type) ? event.type : 'system';
  const status = ['queued', 'building', 'ready', 'failed'].includes(event && event.status) ? event.status : '';
  const versionNumber = cleanVersionNumber(event && event.versionNumber);
  return {
    id: cleanId(event && event.id, `${ts || Date.now()}:${index}`),
    role,
    type,
    status,
    versionNumber,
    versionName: cleanText(event && event.versionName, 80) || makeVersionName('Game', versionNumber),
    text: cleanText(event && event.text, 500),
    summary: cleanText(event && event.summary, 500),
    ts,
    jobId: cleanText(event && event.jobId, 40),
  };
}

export function normalizeCreationHistory(stored) {
  const rawEvents = stored && Array.isArray(stored.events) ? stored.events : [];
  const byId = new Map();
  rawEvents.forEach((event, index) => {
    const clean = normalizeEvent(event, index);
    byId.set(clean.id, clean);
  });
  const events = Array.from(byId.values())
    .sort((a, b) => (a.ts || 0) - (b.ts || 0))
    .slice(-MAX_EVENTS);
  return {
    schema: CREATION_HISTORY_SCHEMA,
    events,
    updatedTs: Math.max(0, Math.floor(Number(stored && stored.updatedTs) || 0)),
  };
}

export async function readCreationHistory(env, id) {
  const stored = await env.VOTES.get(historyKey(id), 'json');
  return normalizeCreationHistory(stored);
}

export async function appendCreationHistoryEvent(env, id, event) {
  const current = await readCreationHistory(env, id);
  const clean = normalizeEvent(event, current.events.length);
  const events = current.events.filter((existing) => existing.id !== clean.id);
  events.push(clean);
  events.sort((a, b) => (a.ts || 0) - (b.ts || 0));
  const payload = {
    schema: CREATION_HISTORY_SCHEMA,
    events: events.slice(-MAX_EVENTS),
    updatedTs: Date.now(),
  };
  await env.VOTES.put(historyKey(id), JSON.stringify(payload), { expirationTtl: CREATION_HISTORY_TTL });
  return payload;
}

export function synthesizeInitialHistory(rec) {
  if (!rec) return [];
  const versionNumber = cleanVersionNumber(rec.versionNumber);
  const title = rec.title || rec.slug || 'Game';
  return [normalizeEvent({
    id: `legacy:${cleanId(rec.id || rec.slug || 'game', 'game')}`,
    role: 'studio',
    type: 'result',
    status: 'ready',
    versionNumber,
    versionName: cleanText(rec.versionName, 80) || makeVersionName(title, versionNumber),
    summary: cleanText(rec.lastUpdateSummary, 500) || 'This game was created before update chat history was added.',
    ts: Number(rec.updatedTs || rec.ts) || 0,
  }, 0)];
}

function attrValue(attrs, name) {
  const re = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i');
  const m = String(attrs || '').match(re);
  return m ? (m[2] || m[3] || m[4] || '') : '';
}

function decodeJsonScriptText(text) {
  return String(text || '')
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&#x22;/gi, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim();
}

export function extractEmbeddedBuildSummary(html) {
  const source = String(html || '');
  const scriptRe = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = scriptRe.exec(source))) {
    if (attrValue(match[1], 'id') !== 'gameFactoryBuildSummary') continue;
    const body = decodeJsonScriptText(match[2] || '');
    if (!body || body.length > MAX_SCRIPT_JSON) return null;
    try {
      const payload = JSON.parse(body);
      const summary = cleanText(payload && payload.summary, 300);
      const changes = Array.isArray(payload && payload.changes)
        ? payload.changes.map((item) => cleanText(item, 120)).filter(Boolean).slice(0, 4)
        : [];
      if (!summary && !changes.length) return null;
      return { summary: summary || changes.join(' '), changes };
    } catch {
      return null;
    }
  }
  return null;
}

export function buildResultSummary({ prompt, html, levelSeed, isUpdate } = {}) {
  const embedded = extractEmbeddedBuildSummary(html);
  if (embedded && embedded.summary) return embedded.summary;

  const action = isUpdate ? 'Updated' : 'Built the first version';
  const ask = cleanText(prompt, 180);
  let detail = ask ? `${action} from: "${ask}".` : `${action}.`;
  if (levelSeed && levelSeed.seeded && levelSeed.count) {
    detail += ` Editable levels imported: ${levelSeed.count}.`;
  } else if (levelSeed && levelSeed.count && /^existing_/.test(String(levelSeed.reason || ''))) {
    detail += ` Saved editable levels preserved: ${levelSeed.count}.`;
  }
  return cleanText(detail, 500);
}

export function buildFailureSummary(error, { comped = false } = {}) {
  const reason = cleanText(error || 'generation_failed', 140);
  return `Update failed: ${reason}. ${comped ? 'No tokens were charged.' : 'Tokens were refunded.'}`;
}
