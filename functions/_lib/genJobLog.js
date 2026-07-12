const MAX_EVENTS = 40;

const STAGES = new Set([
  'queued', 'claimed', 'generation', 'polish', 'validation', 'smoke', 'retry', 'ready', 'failed',
]);
const STATES = new Set([
  'queued', 'started', 'passed', 'failed', 'scheduled', 'skipped', 'ready',
]);

const ERROR_RULES = [
  [/timeout/i, 'generation_timeout', 'generation'],
  [/limit|usage|quota|exhaust|rate|overloaded|capacity|generator_busy/i, 'generator_busy', 'generation'],
  [/invalid_html|no_output|output_not_html|empty_html|doctype/i, 'invalid_html', 'validation'],
  [/too_large|html_too_large/i, 'output_too_large', 'validation'],
  [/level_seed|level_count|distinct_levels/i, 'invalid_level_seed', 'validation'],
  [/level_message|debug_state|creator_support/i, 'missing_creator_support', 'validation'],
  [/smoke|pageerror|blank_render/i, 'smoke_failed', 'smoke'],
  [/base_unavailable|base_gone/i, 'base_unavailable', 'generation'],
  [/ownership_mismatch/i, 'ownership_mismatch', 'validation'],
  [/expired(?:_after)?/i, 'expired', 'failed'],
  [/max_attempts/i, 'max_attempts', 'failed'],
  [/post_ready_rejected|delivery/i, 'delivery_failed', 'ready'],
];

const ERROR_MESSAGES = {
  generation_timeout: 'The generator timed out before producing a game file.',
  generator_busy: 'The generator was temporarily unavailable.',
  invalid_html: 'The generated output was not a complete game file.',
  output_too_large: 'The generated game file exceeded the size limit.',
  invalid_level_seed: 'The generated game was missing valid editable level data.',
  missing_creator_support: 'The generated game did not include the required creator tools hook.',
  smoke_failed: 'The generated game failed its browser smoke test.',
  base_unavailable: 'The existing game could not be loaded for this update.',
  ownership_mismatch: 'The update could not be matched to the game owner.',
  expired: 'The build expired before the studio could complete it.',
  max_attempts: 'The build stopped after reaching the retry limit.',
  delivery_failed: 'The finished game could not be saved.',
  generation_failed: 'The build hit an unexpected generation error.',
};

export function classifyBuildError(value) {
  const raw = String(value || 'generation_failed').slice(0, 240);
  for (const [pattern, code, stage] of ERROR_RULES) {
    if (pattern.test(raw)) return { code, stage, message: ERROR_MESSAGES[code] };
  }
  return { code: 'generation_failed', stage: 'generation', message: ERROR_MESSAGES.generation_failed };
}

export function appendBuildEvent(jobRec, event = {}) {
  if (!jobRec || typeof jobRec !== 'object') return jobRec;
  const current = normalizeBuildEvents(jobRec.buildEvents);
  const stage = STAGES.has(event.stage) ? event.stage : 'generation';
  const state = STATES.has(event.state) ? event.state : 'started';
  const attempt = Math.max(1, Math.floor(Number(event.attempt) || ((jobRec.attempts || 0) + 1)));
  const ts = Math.max(0, Math.floor(Number(event.ts) || Date.now()));
  const code = cleanCode(event.code);
  const signature = `${stage}:${state}:${code}:${attempt}`;
  // Relay result POSTs retry on transport errors and the server synthesizes
  // fallback stage events for older relays. De-dupe the full bounded attempt,
  // not just adjacent rows, so those two paths cannot repeat validation/smoke.
  const existingIndex = current.findIndex(existing =>
    `${existing.stage}:${existing.state}:${existing.code}:${existing.attempt}` === signature
  );
  const normalized = {
    stage, state, code, attempt, ts,
    ...normalizeTelemetry(event),
  };
  if (existingIndex >= 0) {
    // The claim endpoint may synthesize generation:started before the relay
    // sends its richer configured-model event. Merge the safe telemetry into
    // the existing row instead of duplicating it or discarding observability.
    current[existingIndex] = { ...current[existingIndex], ...normalized, ts: current[existingIndex].ts || ts };
  } else {
    current.push(normalized);
  }
  jobRec.buildEvents = current.slice(-MAX_EVENTS);
  return jobRec;
}

export function normalizeBuildEvents(events) {
  if (!Array.isArray(events)) return [];
  return events.map((event) => ({
    stage: STAGES.has(event && event.stage) ? event.stage : 'generation',
    state: STATES.has(event && event.state) ? event.state : 'started',
    code: cleanCode(event && event.code),
    attempt: Math.max(1, Math.floor(Number(event && event.attempt) || 1)),
    ts: Math.max(0, Math.floor(Number(event && event.ts) || 0)),
    ...normalizeTelemetry(event),
  })).slice(-MAX_EVENTS);
}

export function publicBuildEvents(events) {
  return normalizeBuildEvents(events).map((event) => ({
    ...event,
    message: eventMessage(event),
  }));
}

function cleanCode(value) {
  const code = String(value || '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 48);
  return Object.prototype.hasOwnProperty.call(ERROR_MESSAGES, code) ? code : '';
}

function normalizeTelemetry(event) {
  const source = event && typeof event === 'object' ? event : {};
  const out = {};
  const model = String(source.model || '').toLowerCase().replace(/[^a-z0-9_.-]/g, '').slice(0, 48);
  const reasoningEffort = String(source.reasoningEffort || '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 16);
  if (model) out.model = model;
  if (reasoningEffort) out.reasoningEffort = reasoningEffort;
  const pass = Math.floor(Number(source.pass));
  if (Number.isFinite(pass) && pass >= 1 && pass <= 2) out.pass = pass;
  for (const field of ['durationMs', 'inputTokens', 'outputTokens', 'reasoningTokens']) {
    const value = Math.floor(Number(source[field]));
    if (Number.isFinite(value) && value >= 0) out[field] = Math.min(value, Number.MAX_SAFE_INTEGER);
  }
  return out;
}

function eventMessage(event) {
  if (event.state === 'failed' && event.code) return ERROR_MESSAGES[event.code];
  if (event.stage === 'queued') return 'Build queued.';
  if (event.stage === 'claimed') return 'Studio worker claimed the build.';
  if (event.stage === 'generation') return event.state === 'passed'
    ? 'First game draft generated.'
    : 'Studio Max generation started.';
  if (event.stage === 'polish') return event.state === 'passed'
    ? 'Studio polish and QA pass completed.'
    : 'Studio polish and QA pass started.';
  if (event.stage === 'validation') return event.state === 'passed'
    ? 'Game file passed validation.'
    : 'Checking the game file and creator tools.';
  if (event.stage === 'smoke') {
    if (event.state === 'passed') return 'Browser smoke test passed.';
    if (event.state === 'skipped') return 'Browser smoke test was unavailable; server validation passed.';
    return 'Running the browser smoke test.';
  }
  if (event.stage === 'retry') {
    const reason = event.code ? ` ${ERROR_MESSAGES[event.code]}` : '';
    return `Retry ${event.attempt + 1} scheduled.${reason}`;
  }
  if (event.stage === 'ready') return 'Build finished and is ready to play.';
  if (event.stage === 'failed') return event.code
    ? `Build stopped and will not retry. ${ERROR_MESSAGES[event.code]}`
    : 'Build stopped and will not retry.';
  return 'Build updated.';
}
