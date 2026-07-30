const SLUG_RE = /^[a-z0-9_-]{1,64}$/;
const CURATION_SELECT = `
  SELECT hidden_json, updated_at, revision, ready, write_enabled
  FROM gallery_curation_state
  WHERE singleton = 1 AND ready = 1
`;

export class CatalogueUnavailableError extends Error {
  constructor(message, cause, transient = false) {
    super(message);
    this.name = 'CatalogueUnavailableError';
    this.transient = transient;
    if (cause) this.cause = cause;
  }
}

export async function readGamesJson(env) {
  if (!env || !env.ASSETS || typeof env.ASSETS.fetch !== 'function') {
    throw new CatalogueUnavailableError('Static catalogue binding is unavailable');
  }

  let response;
  try {
    response = await env.ASSETS.fetch(new Request('https://assets.local/games.json'));
  } catch (error) {
    throw new CatalogueUnavailableError('Static catalogue could not be read', error, true);
  }
  if (!response.ok) {
    throw new CatalogueUnavailableError(
      `Static catalogue returned HTTP ${response.status}`,
      null,
      response.status >= 500,
    );
  }

  let games;
  try {
    games = await response.json();
  } catch (error) {
    throw new CatalogueUnavailableError('Static catalogue is not valid JSON', error);
  }
  if (!Array.isArray(games)) {
    throw new CatalogueUnavailableError('Static catalogue is not an array');
  }
  return games;
}

export async function readHiddenState(env) {
  if (!env || !env.GALLERY_DB || typeof env.GALLERY_DB.prepare !== 'function') {
    throw new CatalogueUnavailableError('Curation store is unavailable');
  }

  let result;
  try {
    result = await env.GALLERY_DB.prepare(CURATION_SELECT).all();
  } catch (error) {
    throw new CatalogueUnavailableError('Curation store could not be read', error, true);
  }

  return parseHiddenState(result);
}

function parseHiddenState(result) {
  const rows = result && result.results;
  if (!Array.isArray(rows) || rows.length !== 1) {
    throw new CatalogueUnavailableError('Curation store contains malformed hidden state');
  }
  const row = rows[0];
  const updatedAt = row && row.updated_at;
  const revision = row && row.revision;
  const ready = row && row.ready;
  const writeEnabled = row && row.write_enabled;
  let hidden;
  try {
    hidden = JSON.parse(row.hidden_json);
  } catch (_) {
    throw new CatalogueUnavailableError('Curation store contains malformed hidden state');
  }
  if (
    typeof updatedAt !== 'string'
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(updatedAt)
    || !Number.isInteger(revision)
    || revision < 1
    || ready !== 1
    || (writeEnabled !== 0 && writeEnabled !== 1)
    || !Array.isArray(hidden)
    || hidden.some(slug => typeof slug !== 'string' || !SLUG_RE.test(slug))
  ) {
    throw new CatalogueUnavailableError('Curation store contains malformed hidden state');
  }

  const normalized = [...new Set(hidden)].sort();
  if (JSON.stringify(hidden) !== JSON.stringify(normalized)) {
    throw new CatalogueUnavailableError('Curation store contains malformed hidden state');
  }
  return {
    hidden: normalized,
    hiddenSet: new Set(normalized),
    updatedAt,
    revision,
    writeEnabled,
  };
}

export async function mutateHiddenState(env, slug, hide, updatedAt) {
  if (
    !env
    || !env.GALLERY_DB
    || typeof env.GALLERY_DB.prepare !== 'function'
    || typeof env.GALLERY_DB.batch !== 'function'
  ) {
    throw new CatalogueUnavailableError('Curation store is unavailable');
  }
  if (!SLUG_RE.test(slug)) {
    throw new CatalogueUnavailableError('Invalid curation slug');
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(updatedAt)) {
    throw new CatalogueUnavailableError('Invalid curation timestamp');
  }

  // Refuse mutations until the seed has been verified and marked ready. This
  // read is a guard only; individual row operations remain race-free.
  const current = await readHiddenState(env);
  if (current.writeEnabled !== 1) {
    throw new CatalogueUnavailableError('Curation writes are frozen');
  }

  const mutation = hide
    ? env.GALLERY_DB.prepare(`
        INSERT INTO gallery_hidden_games (slug, updated_at)
        VALUES (?, ?)
        ON CONFLICT(slug) DO UPDATE SET
          updated_at = MAX(gallery_hidden_games.updated_at, excluded.updated_at)
      `).bind(slug, updatedAt)
    : env.GALLERY_DB.prepare(
        'DELETE FROM gallery_hidden_games WHERE slug = ?',
      ).bind(slug);
  const advanceState = env.GALLERY_DB.prepare(`
    UPDATE gallery_curation_state
    SET
      updated_at = MAX(updated_at, ?),
      revision = revision + 1,
      hidden_json = (
        SELECT json_group_array(slug)
        FROM (
          SELECT slug
          FROM gallery_hidden_games
          ORDER BY slug
        )
      )
    WHERE singleton = 1 AND ready = 1 AND write_enabled = 1
  `).bind(updatedAt);
  const snapshot = env.GALLERY_DB.prepare(CURATION_SELECT);

  try {
    // D1 executes a batch transactionally. Per-slug rows mean two dashboards
    // can mutate different games without rewriting or losing the complete set.
    const results = await env.GALLERY_DB.batch([mutation, advanceState, snapshot]);
    return parseHiddenState(results && results[2]);
  } catch (error) {
    throw new CatalogueUnavailableError('Curation store could not be updated', error, true);
  }
}

export async function readPublicCatalogue(env) {
  const [games, curation] = await Promise.all([
    readGamesJson(env),
    readHiddenState(env),
  ]);
  const publicGames = games.filter(game => (
    game
    && typeof game.slug === 'string'
    && SLUG_RE.test(game.slug)
    && game.published !== false
    && !curation.hiddenSet.has(game.slug)
  ));
  const catalogueUpdatedAt = games
    .map(game => String(game && (game.updatedDate || game.addedDate) || ''))
    .filter(date => /^\d{4}-\d{2}-\d{2}$/.test(date))
    .sort()
    .pop() || '';
  const curationDate = String(curation.updatedAt || '').slice(0, 10);
  return {
    games,
    publicGames,
    hidden: curation.hidden,
    hiddenSet: curation.hiddenSet,
    curationUpdatedAt: curation.updatedAt,
    discoveryUpdatedAt: [catalogueUpdatedAt, curationDate].filter(Boolean).sort().pop() || '',
  };
}

export function unavailableResponse(kind = 'text') {
  const headers = {
    'cache-control': 'no-store',
    'x-robots-tag': 'noindex, nofollow, noarchive',
  };
  if (kind === 'json') {
    headers['content-type'] = 'application/json; charset=utf-8';
    return new Response(JSON.stringify({ error: 'catalogue_unavailable' }), {
      status: 503,
      headers,
    });
  }
  if (kind === 'html') {
    headers['content-type'] = 'text/html; charset=utf-8';
    return new Response(
      '<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><title>Temporarily unavailable</title><p>The game catalogue is temporarily unavailable. Please try again shortly.</p>',
      { status: 503, headers },
    );
  }
  headers['content-type'] = 'text/plain; charset=utf-8';
  return new Response('Catalogue temporarily unavailable.\n', { status: 503, headers });
}
