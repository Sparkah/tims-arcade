import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  CatalogueUnavailableError,
  readHiddenState,
  readPublicCatalogue,
} from '../../functions/_lib/publicCatalogue.js';
import {
  PLATFORM_SPECS,
  buildHomepageJsonLd,
  buildHomepageCards,
  buildLlms,
  buildRss,
  buildSitemap,
  platformEntries,
} from '../../functions/_lib/seoSurface.js';
import { onRequest as gamePage } from '../../functions/p/[slug].js';
import { onRequest as publicManifest } from '../../functions/games.json.js';
import { onRequest as rawSourceManifest } from '../../functions/games.source.json.js';
import { onRequest as homepage } from '../../functions/index.js';
import { onRequest as middleware } from '../../functions/_middleware.js';
import { onRequestGet as leastAttention } from '../../functions/api/least-attention.js';
import { onRequestGet as publicHidden } from '../../functions/api/hidden.js';
import { onRequestPost as adminHiddenPost } from '../../functions/api/admin/hidden.js';
import { onRequestGet as adminCatalogue } from '../../functions/api/admin/catalogue.js';
import {
  renderGenreDirectory,
  renderGenrePage,
} from '../../functions/_lib/genrePages.js';

const games = [
  {
    slug: 'visible_arcade',
    title: 'Visible Arcade',
    hook: 'A visible test game.',
    genre: 'arcade',
    addedDate: '2026-07-01',
    updatedDate: '2026-07-20',
    published: true,
  },
  {
    slug: 'hidden_game',
    title: 'Hidden Game',
    hook: 'Must never leak.',
    genre: 'puzzle',
    addedDate: '2026-07-02',
    published: true,
  },
  {
    slug: 'unpublished_game',
    title: 'Unpublished Game',
    hook: 'Must never leak either.',
    genre: 'puzzle',
    addedDate: '2026-07-03',
    published: false,
  },
  {
    slug: 'biz_tycoon',
    title: 'Biz Tycoon',
    hook: 'Build a business empire.',
    genre: 'tycoon',
    addedDate: '2026-07-30',
    published: true,
    external: true,
    platforms: {
      crazygames: 'https://www.crazygames.com/game/biz-tycoon-vqm',
    },
  },
];

function assetsFor(value = games) {
  return {
    fetch: async () => new Response(JSON.stringify(value), {
      headers: { 'content-type': 'application/json' },
    }),
  };
}

function galleryDbFor(
  initialHidden = ['hidden_game'],
  initialUpdatedAt = '2026-07-30T12:00:00.000Z',
) {
  const state = {
    hidden: new Set(initialHidden),
    updatedAt: initialUpdatedAt,
    revision: 1,
    writeEnabled: 1,
  };
  const batches = [];
  const statement = (sql, args = []) => ({
    sql,
    args,
    bind: (...nextArgs) => statement(sql, nextArgs),
    all: async () => ({
      results: [{
        hidden_json: JSON.stringify([...state.hidden].sort()),
        updated_at: state.updatedAt,
        revision: state.revision,
        ready: 1,
        write_enabled: state.writeEnabled,
      }],
    }),
  });
  return {
    state,
    batches,
    prepare: sql => statement(String(sql)),
    batch: async (statements) => {
      batches.push(statements);
      for (const item of statements) {
        if (/INSERT INTO gallery_hidden_games/.test(item.sql)) {
          state.hidden.add(item.args[0]);
        } else if (/DELETE FROM gallery_hidden_games/.test(item.sql)) {
          state.hidden.delete(item.args[0]);
        } else if (/UPDATE gallery_curation_state/.test(item.sql)) {
          state.updatedAt = [state.updatedAt, item.args[0]].sort().pop();
          state.revision += 1;
        }
      }
      return statements.map(item => (
        /SELECT hidden_json/.test(item.sql)
          ? {
              success: true,
              results: [{
                hidden_json: JSON.stringify([...state.hidden].sort()),
                updated_at: state.updatedAt,
                revision: state.revision,
                ready: 1,
                write_enabled: state.writeEnabled,
              }],
            }
          : { success: true }
      ));
    },
  };
}

function galleryDbReturning(results) {
  return {
    prepare: () => ({ all: async () => ({ results }) }),
    batch: async () => [],
  };
}

const env = { ASSETS: assetsFor(), GALLERY_DB: galleryDbFor() };
const publicHiddenResponse = await publicHidden({ env });
assert.equal(publicHiddenResponse.status, 200);
assert.equal(publicHiddenResponse.headers.get('x-gallery-curation'), 'd1-v1');
assert.deepEqual((await publicHiddenResponse.json()).hidden, ['hidden_game']);
const catalogue = await readPublicCatalogue(env);
assert.deepEqual(catalogue.publicGames.map(game => game.slug), ['visible_arcade', 'biz_tycoon']);
assert.equal(catalogue.curationUpdatedAt, '2026-07-30T12:00:00.000Z');

for (const invalidRows of [
  [],
  [
    {
      hidden_json: '[]',
      updated_at: '2026-07-30T12:00:00.000Z',
      revision: 1,
      ready: 1,
    },
    {
      hidden_json: '[]',
      updated_at: '2026-07-30T12:00:00.000Z',
      revision: 1,
      ready: 1,
    },
  ],
  [{
    hidden_json: 'not-json',
    updated_at: '2026-07-30T12:00:00.000Z',
    revision: 1,
    ready: 1,
  }],
  [{
    hidden_json: '["Bad Slug"]',
    updated_at: '2026-07-30T12:00:00.000Z',
    revision: 1,
    ready: 1,
  }],
  [{
    hidden_json: '["z_game","a_game"]',
    updated_at: '2026-07-30T12:00:00.000Z',
    revision: 1,
    ready: 1,
  }],
  [{
    hidden_json: '[]',
    updated_at: 'bad-date',
    revision: 1,
    ready: 1,
  }],
  [{
    hidden_json: '[]',
    updated_at: '2026-07-30T12:00:00.000Z',
    revision: 1,
    ready: 0,
  }],
]) {
  await assert.rejects(
    () => readHiddenState({ GALLERY_DB: galleryDbReturning(invalidRows) }),
    CatalogueUnavailableError,
  );
}

// A warm successful request must not create a stale fallback. If the
// authoritative D1 read then fails, every public catalogue reader fails.
await readPublicCatalogue(env);
const transientEnv = {
  ASSETS: assetsFor(),
  GALLERY_DB: {
    prepare: () => ({
      all: async () => { throw new Error('temporary D1 outage'); },
    }),
    batch: async () => { throw new Error('temporary D1 outage'); },
  },
};
await assert.rejects(() => readPublicCatalogue(transientEnv), CatalogueUnavailableError);

for (const output of [
  buildHomepageJsonLd(catalogue.publicGames),
  buildHomepageCards(catalogue.publicGames),
  buildLlms(catalogue.publicGames),
  buildRss(catalogue.publicGames, catalogue.curationUpdatedAt),
  buildSitemap(catalogue.publicGames, catalogue.curationUpdatedAt),
]) {
  assert.doesNotMatch(output, /hidden_game|Hidden Game|unpublished_game|Unpublished Game/);
  assert.match(output, /biz_tycoon|Biz Tycoon/);
}

const indexTemplate = await readFile(new URL('../../index.html', import.meta.url), 'utf8');
const degradedAssets = {
  fetch: async request => new URL(request.url).hostname === 'assets.local'
    ? new Response(JSON.stringify(games), { headers: { 'content-type': 'application/json' } })
    : new Response(indexTemplate, { headers: { 'content-type': 'text/html' } }),
};
const degradedHomepage = await homepage({
  request: new Request('https://game-factory.tech/'),
  env: { ASSETS: degradedAssets, GALLERY_DB: transientEnv.GALLERY_DB },
});
assert.equal(degradedHomepage.status, 200);
assert.equal(degradedHomepage.headers.get('x-gallery-catalogue'), 'unavailable');
assert.match(degradedHomepage.headers.get('x-robots-tag') || '', /noindex/);
const degradedHtml = await degradedHomepage.text();
assert.match(degradedHtml, /data-catalogue-degraded="true"/);
assert.match(degradedHtml, /Catalogue temporarily unavailable/);
assert.doesNotMatch(degradedHtml, /Hidden Game|hidden_game|Unpublished Game|unpublished_game/);
assert.match(degradedHtml, /"numberOfItems":0/);

const malformedHomepage = await homepage({
  request: new Request('https://game-factory.tech/'),
  env: { ASSETS: degradedAssets, GALLERY_DB: galleryDbReturning([]) },
});
assert.equal(malformedHomepage.status, 503);
assert.match(malformedHomepage.headers.get('x-robots-tag') || '', /noindex/);

const sitemap = buildSitemap(catalogue.publicGames, catalogue.curationUpdatedAt);
assert.match(sitemap, /<lastmod>2026-07-20<\/lastmod>/);
assert.doesNotMatch(sitemap, /T00:00:00Z/);
const homeLd = JSON.parse(buildHomepageJsonLd(catalogue.publicGames));
const bizLd = homeLd.mainEntity.itemListElement.find(item => item.item.name === 'Biz Tycoon').item;
assert.deepEqual(bizLd.sameAs, ['https://www.crazygames.com/game/biz-tycoon-vqm']);
assert.equal(bizLd.potentialAction.target, 'https://www.crazygames.com/game/biz-tycoon-vqm');
const genreDirectory = renderGenreDirectory(catalogue.publicGames);
const arcadePage = renderGenrePage(catalogue.publicGames, 'arcade');
const simulationPage = renderGenrePage(catalogue.publicGames, 'simulation');
assert.match(genreDirectory, /href="\/genre\/arcade"/);
assert.match(genreDirectory, /href="\/genre\/simulation"/);
assert.match(simulationPage, /No public games in this collection yet/);
assert.match(arcadePage, /Visible Arcade/);
assert.doesNotMatch(`${genreDirectory}${arcadePage}`, /Hidden Game|hidden_game/);
assert.match(sitemap, /<loc>https:\/\/game-factory\.tech\/genres<\/loc>/);

const hiddenResponse = await gamePage({
  params: { slug: 'hidden_game' },
  env,
  request: new Request('https://game-factory.tech/p/hidden_game'),
});
assert.equal(hiddenResponse.status, 404);
assert.equal(hiddenResponse.headers.get('x-robots-tag'), 'noindex, nofollow, noarchive');
assert.doesNotMatch(await hiddenResponse.text(), /Hidden Game|Must never leak/);

const bizResponse = await gamePage({
  params: { slug: 'biz_tycoon' },
  env,
  request: new Request('https://game-factory.tech/p/biz_tycoon'),
});
assert.equal(bizResponse.status, 200);
const bizHtml = await bizResponse.text();
assert.match(bizHtml, /href="https:\/\/www\.crazygames\.com\/game\/biz-tycoon-vqm"/);
assert.match(bizHtml, /Play on CrazyGames/);
assert.doesNotMatch(bizHtml, /play\.html\?slug=biz_tycoon/);
const ldMatch = bizHtml.match(/<script type="application\/ld\+json">(.+?)<\/script>/s);
assert.ok(ldMatch);
const shareLd = JSON.parse(ldMatch[1]);
assert.equal(shareLd.url, 'https://game-factory.tech/p/biz_tycoon');
assert.equal(shareLd.potentialAction.target, 'https://www.crazygames.com/game/biz-tycoon-vqm');
assert.deepEqual(shareLd.sameAs, ['https://www.crazygames.com/game/biz-tycoon-vqm']);

const manifestResponse = await publicManifest({
  request: new Request('https://game-factory.tech/games.json'),
  env,
});
assert.equal(manifestResponse.status, 200);
assert.deepEqual(
  (await manifestResponse.json()).map(game => game.slug),
  ['visible_arcade', 'biz_tycoon'],
);

const rawSourceResponse = await rawSourceManifest();
assert.equal(rawSourceResponse.status, 404);
assert.equal(rawSourceResponse.headers.get('x-robots-tag'), 'noindex, nofollow, noarchive');
assert.doesNotMatch(await rawSourceResponse.text(), /hidden_game|Hidden Game|unpublished_game/);

for (const path of [
  '/games.source.json',
  '/games%2esource%2ejson',
  '/games.source%2ejson',
  '/%67ames.source.json',
  '//games.source.json',
  '/%2fgames.source.json',
  '/%252fgames.source.json',
  '/folder/%2e%2e/games.source.json',
]) {
  let fellThrough = false;
  const response = await middleware({
    request: new Request(`https://game-factory.tech${path}`),
    env,
    next: async () => {
      fellThrough = true;
      return new Response(JSON.stringify(games));
    },
  });
  assert.equal(response.status, 404, path);
  assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow, noarchive', path);
  assert.equal(fellThrough, false, path);
  assert.doesNotMatch(await response.text(), /hidden_game|Hidden Game|unpublished_game/, path);
}

for (const path of [
  '/games.json',
  '/games%2ejson',
  '/%67ames.json',
  '//games.json',
  '/%2fgames.json',
  '/%252fgames.json',
  '/folder/%2e%2e/games.json',
]) {
  let fellThrough = false;
  const response = await middleware({
    request: new Request(`https://game-factory.tech${path}`),
    env,
    next: async () => {
      fellThrough = true;
      return new Response(JSON.stringify(games));
    },
  });
  assert.equal(response.status, 200, path);
  assert.equal(fellThrough, false, path);
  assert.deepEqual(
    (await response.json()).map(game => game.slug),
    ['visible_arcade', 'biz_tycoon'],
    path,
  );
}

for (const path of [
  '/migrations/0006_dissertation_player_layout_version.sql',
  '/m%69grations/0006_dissertation_player_layout_version.sql',
  '/%6digrations/0006_dissertation_player_layout_version.sql',
  '//migrations/0006_dissertation_player_layout_version.sql',
  '/%2fmigrations/0006_dissertation_player_layout_version.sql',
  '/%252fmigrations/0006_dissertation_player_layout_version.sql',
]) {
  let fellThrough = false;
  const response = await middleware({
    request: new Request(`https://game-factory.tech${path}`),
    env,
    next: async () => {
      fellThrough = true;
      return new Response('CREATE TABLE leaked_secret;');
    },
  });
  assert.equal(response.status, 404, path);
  assert.equal(fellThrough, false, path);
  assert.doesNotMatch(await response.text(), /CREATE TABLE|leaked_secret/, path);
}

for (const path of [
  '/dissertation/',
  '/diss%65rtation/',
  '//dissertation/',
  '/%2fdissertation/',
]) {
  const response = await middleware({
    request: new Request(`https://game-factory.tech${path}`),
    env,
    next: async () => new Response('<!doctype html><title>Study</title>', {
      headers: { 'content-type': 'text/html; charset=utf-8' },
    }),
  });
  assert.match(response.headers.get('x-robots-tag') || '', /noindex/, path);
  assert.match(response.headers.get('content-security-policy') || '', /frame-src 'self'/, path);
}

const adminCatalogueResponse = await adminCatalogue({
  request: new Request('https://game-factory.tech/api/admin/catalogue', {
    headers: { 'x-admin-token': 'test-token' },
  }),
  env: { ASSETS: assetsFor(), ADMIN_TOKEN: 'test-token' },
});
assert.equal(adminCatalogueResponse.status, 200);
assert.deepEqual(
  (await adminCatalogueResponse.json()).map(game => game.slug),
  games.map(game => game.slug),
);

assert.deepEqual(platformEntries({
  crazygames: 'https://www.crazygames.com/game/good',
  yandex: 'https://yandex.com/games/app/good',
}).map(entry => entry.key), ['yandex', 'crazygames']);

// The browser and Worker necessarily execute in different module systems.
// Parse the browser's literal and compare the complete security boundary so a
// new platform or hostname cannot ship on only one surface.
const appSource = await readFile(new URL('../../app.js', import.meta.url), 'utf8');
const clientSpecsBlock = appSource.match(
  /const GF_PLATFORM_SPECS = Object\.freeze\(\[([\s\S]*?)\n\]\);/,
);
assert.ok(clientSpecsBlock, 'client platform specs block must remain machine-readable');
const clientSpecs = [...clientSpecsBlock[1].matchAll(
  /\{\s*key:\s*'([^']+)'[\s\S]*?hosts:\s*\[([^\]]*)\]\s*\}/g,
)].map(match => ({
  key: match[1],
  hosts: [...match[2].matchAll(/'([^']+)'/g)].map(hostMatch => hostMatch[1]),
}));
assert.deepEqual(
  clientSpecs.map(spec => ({ key: spec.key, hosts: spec.hosts })),
  PLATFORM_SPECS.map(spec => ({ key: spec.key, hosts: [...spec.hosts] })),
  'browser and Worker platform host allowlists must have exact parity',
);
for (const spec of PLATFORM_SPECS) {
  for (const host of spec.hosts) {
    assert.equal(
      platformEntries({ [spec.key]: `https://${host}/game/test` }).length,
      1,
      `${spec.key} must accept its declared host ${host}`,
    );
  }
}
for (const bad of [
  'http://www.crazygames.com/game/bad',
  'https://www.crazygames.com.evil.test/game/bad',
  'https://user@www.crazygames.com/game/bad',
  'https://www.crazygames.com:444/game/bad',
  'javascript:alert(1)',
  '/relative',
  'https://example.com/game/bad',
]) {
  assert.deepEqual(platformEntries({ crazygames: bad }), []);
}

const invalidExternalEnv = {
  ASSETS: assetsFor([{ ...games[3], platforms: { crazygames: 'https://example.com/bad' } }]),
  GALLERY_DB: galleryDbFor([]),
};
const invalidExternalResponse = await gamePage({
  params: { slug: 'biz_tycoon' },
  env: invalidExternalEnv,
  request: new Request('https://game-factory.tech/p/biz_tycoon'),
});
assert.equal(invalidExternalResponse.status, 503);
assert.equal(invalidExternalResponse.headers.get('x-robots-tag'), 'noindex, nofollow, noarchive');

await assert.rejects(
  () => readPublicCatalogue({
    ASSETS: assetsFor(),
    GALLERY_DB: galleryDbReturning([{ slug: 'Bad Slug', updated_at: 'bad' }]),
  }),
  CatalogueUnavailableError,
);

let batchCount = 0;
const brokenAdminEnv = {
  ADMIN_TOKEN: 'test-token',
  GALLERY_DB: {
    prepare: sql => ({
      bind: () => ({ sql, args: [] }),
      all: async () => { throw new Error('D1 down'); },
    }),
    batch: async () => {
      batchCount += 1;
      throw new Error('D1 down');
    },
  },
};
const adminResponse = await adminHiddenPost({
  request: new Request('https://game-factory.tech/api/admin/hidden', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-admin-token': 'test-token',
    },
    body: JSON.stringify({ slug: 'visible_arcade', hide: true }),
  }),
  env: brokenAdminEnv,
  waitUntil: () => {},
});
assert.equal(adminResponse.status, 503);
assert.equal(batchCount, 0);

const previewDb = galleryDbFor();
const previewMutation = await adminHiddenPost({
  request: new Request('https://preview-id.tims-arcade.pages.dev/api/admin/hidden', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-admin-token': 'test-token',
    },
    body: JSON.stringify({ slug: 'visible_arcade', hide: true }),
  }),
  env: { ADMIN_TOKEN: 'test-token', GALLERY_DB: previewDb },
  waitUntil: () => {},
});
assert.equal(previewMutation.status, 403);
assert.equal(previewDb.batches.length, 0);

const frozenDb = galleryDbFor();
frozenDb.state.writeEnabled = 0;
assert.deepEqual((await readHiddenState({ GALLERY_DB: frozenDb })).hidden, ['hidden_game']);
const frozenMutation = await adminHiddenPost({
  request: new Request('https://game-factory.tech/api/admin/hidden', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-admin-token': 'test-token',
    },
    body: JSON.stringify({ slug: 'visible_arcade', hide: true }),
  }),
  env: { ADMIN_TOKEN: 'test-token', GALLERY_DB: frozenDb },
  waitUntil: () => {},
});
assert.equal(frozenMutation.status, 503);
assert.equal(frozenDb.batches.length, 0);

const atomicDb = galleryDbFor();
const atomicAdminEnv = {
  ADMIN_TOKEN: 'test-token',
  GALLERY_DB: atomicDb,
};
const atomicAdminResponse = await adminHiddenPost({
  request: new Request('https://game-factory.tech/api/admin/hidden', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-admin-token': 'test-token',
    },
    body: JSON.stringify({ slug: 'visible_arcade', hide: true }),
  }),
  env: atomicAdminEnv,
  waitUntil: () => {},
});
assert.equal(atomicAdminResponse.status, 200);
const atomicBody = await atomicAdminResponse.json();
assert.equal(atomicDb.batches.length, 1);
assert.equal(atomicDb.batches[0].length, 3);
assert.deepEqual([...atomicDb.state.hidden].sort(), ['hidden_game', 'visible_arcade']);
assert.deepEqual(atomicBody.hidden, ['hidden_game', 'visible_arcade']);
assert.equal(atomicDb.state.updatedAt, atomicBody.updated_at);
assert.equal(atomicDb.state.revision, 2);

const concurrentDb = galleryDbFor(['hidden_game']);
await Promise.all(['visible_arcade', 'biz_tycoon'].map(slug => adminHiddenPost({
  request: new Request('https://game-factory.tech/api/admin/hidden', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-admin-token': 'test-token',
    },
    body: JSON.stringify({ slug, hide: true }),
  }),
  env: { ADMIN_TOKEN: 'test-token', GALLERY_DB: concurrentDb },
  waitUntil: () => {},
})));
assert.deepEqual(
  [...concurrentDb.state.hidden].sort(),
  ['biz_tycoon', 'hidden_game', 'visible_arcade'],
);
assert.equal(concurrentDb.state.revision, 3);

let failedWriteSchedules = 0;
const failedWriteDb = galleryDbFor();
failedWriteDb.batch = async () => { throw new Error('D1 write unavailable'); };
const failedWriteResponse = await adminHiddenPost({
  request: new Request('https://game-factory.tech/api/admin/hidden', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-admin-token': 'test-token',
    },
    body: JSON.stringify({ slug: 'visible_arcade', hide: true }),
  }),
  env: {
    ADMIN_TOKEN: 'test-token',
    GALLERY_DB: failedWriteDb,
  },
  waitUntil: () => { failedWriteSchedules += 1; },
});
assert.equal(failedWriteResponse.status, 503);
assert.equal(failedWriteSchedules, 0);

const leastAttentionUnavailable = await leastAttention({
  request: new Request('https://game-factory.tech/api/least-attention'),
  env: { GALLERY_DB: transientEnv.GALLERY_DB },
});
assert.equal(leastAttentionUnavailable.status, 503);
assert.match(leastAttentionUnavailable.headers.get('x-robots-tag') || '', /noindex/);

// The browser consumes the already-curated manifest. A second hidden-set fetch
// or stale localStorage fallback could diverge from the authoritative D1 view.
assert.doesNotMatch(appSource, /fetch\(['"]\/api\/hidden/);
assert.doesNotMatch(appSource, /gf_hidden|hiddenSlugs/);

// The pre-D1 target leaks hidden games through server-visible discovery
// surfaces, so rollback must refuse that boundary. Later D1→D1 reverts prove
// both Cloudflare's exact source SHA and the live D1 marker.
const rollbackSource = await readFile(
  new URL('../../scripts/rollback.sh', import.meta.url),
  'utf8',
);
assert.match(
  rollbackSource,
  /git show HEAD\^:functions\/_lib\/publicCatalogue\.js[\s\S]*grep -q 'GALLERY_DB'/,
);
assert.match(
  rollbackSource,
  /TARGET_USES_D1" != "1"[\s\S]*cross-cutover rollback refused[\s\S]*exit 8/,
);
assert.match(
  rollbackSource,
  /pages deployment list[\s\S]*Environment == "Production"[\s\S]*marker" == "d1-v1"/,
);
assert.match(
  rollbackSource,
  /push_main_verified\(\)[\s\S]*git fetch origin main -q[\s\S]*origin\/main[\s\S]*HEAD/,
);
assert.doesNotMatch(rollbackSource, /sync_curation_to_legacy_kv|legacy-v1/);

const handoffSource = await readFile(
  new URL('../../scripts/sync_legacy_kv_to_curation_d1.sh', import.meta.url),
  'utf8',
);
assert.match(handoffSource, /--prepare\|--finalize\|--abort/);
assert.match(handoffSource, /curation:legacy-write-enabled/);
assert.match(handoffSource, /LEGACY_BRIDGE_COMMIT="fafdc26[0-9a-f]{33}"/);
assert.match(
  handoffSource,
  /prove_legacy_bridge_authoritative[\s\S]*latest_production_source[\s\S]*legacy-v2/,
);
const prepareStart = handoffSource.indexOf('if [[ "$MODE" == "--prepare" ]]');
const finalizeStart = handoffSource.indexOf(
  'if ! prove_d1_authoritative',
  prepareStart,
);
assert.ok(prepareStart >= 0 && finalizeStart > prepareStart);
const prepareSource = handoffSource.slice(prepareStart, finalizeStart);
const d1FreezePosition = prepareSource.indexOf(
  'UPDATE gallery_curation_state SET write_enabled = 0',
);
const legacyLockPosition = prepareSource.indexOf(
  'wrangler kv key put "$LEGACY_WRITE_KEY" "0"',
);
const propagationPosition = prepareSource.indexOf('sleep 33');
assert.ok(d1FreezePosition >= 0);
assert.ok(legacyLockPosition > d1FreezePosition);
assert.ok(propagationPosition > legacyLockPosition);
assert.match(prepareSource, /sleep 33[\s\S]*sleep 33/);
assert.match(
  handoffSource,
  /prove_d1_authoritative[\s\S]*origin\/main:functions\/_lib\/publicCatalogue\.js[\s\S]*d1-v1/,
);
assert.match(
  handoffSource,
  /write_enabled = 0[\s\S]*json_extract\('curation-state-changed'/,
);
assert.match(
  handoffSource,
  /read_kv_state[\s\S]*verify_exact_state 0[\s\S]*reconcile_d1 1/,
);

const prePushHookSource = await readFile(
  new URL('../../scripts/hooks/pre-push', import.meta.url),
  'utf8',
);
assert.match(
  prePushHookSource,
  /helper_target_oid\(\)[\s\S]*refs\/heads\/main\|refs\/heads\/master[\s\S]*refs\/heads\/\*[\s\S]*rev-parse "\$local_oid\^\{tree\}"[\s\S]*distinct Gallery trees[\s\S]*hook_helper_path\(\)[\s\S]*local_oid="\$\(helper_target_oid\)"[\s\S]*git -C "\$GALLERY_ROOT" diff --quiet "\$local_oid" --;[\s\S]*refusing inexact helper execution[\s\S]*printf '%s\/%s\\n' "\$GALLERY_ROOT"/,
);
assert.match(
  prePushHookSource,
  /while IFS= read -r _git_local_var[\s\S]*unset "\$_git_local_var"[\s\S]*done < <\(git -C "\$GALLERY_ROOT" rev-parse --local-env-vars[\s\S]*cd "\$GALLERY_ROOT"/,
);
assert.match(
  prePushHookSource,
  /_has_branch_ref=0[\s\S]*refs\/heads\/\*[\s\S]*tag-only push has no Pages deployment tree; release gates skipped/,
);
assert.match(
  prePushHookSource,
  /HOOK_TMP_ROOT="\$HOOK_TMP_BASE\/gallery-prepush\.\$\$\.\$RANDOM\$RANDOM[\s\S]*trap cleanup_hook_tmp_root EXIT[\s\S]*PYTHONPYCACHEPREFIX="\$PYTHON_CACHE_ROOT"[\s\S]*GALLERY_PREPUSH_TEST_INTERRUPT_AFTER_TEMP[\s\S]*is_release_gate_input\(\)[\s\S]*node_modules\/\*[\s\S]*functions\/\*\|scripts\/\*\|games\/\*\|thumbs\/\*\|previews\/\*\|migrations\/\*[\s\S]*dissertation\/\*\|fonts\/\*[\s\S]*collect_untracked_gate_inputs\(\)[\s\S]*ls-files -z --others --exclude-standard[\s\S]*ls-files -z --others --ignored --exclude-standard[\s\S]*printf '%s\\0' "\$f" >> "\$output"[\s\S]*collect_untracked_gate_inputs "\$UNTRACKED_GATE_INPUTS_FILE"[\s\S]*if \[\[ -s "\$UNTRACKED_GATE_INPUTS_FILE" \]\][\s\S]*GALLERY_PREPUSH_TEST_UNTRACKED_SAFE_MARKER[\s\S]*ART_CHECK=/,
);
assert.match(
  prePushHookSource,
  /TEMP_CLEANUP_GATE=.*test_pre_push_temp_cleanup\.sh[\s\S]*bash "\$TEMP_CLEANUP_GATE"[\s\S]*temp-cleanup regression gate/,
);
assert.match(
  prePushHookSource,
  /UNTRACKED_GATE_TEST=.*test_pre_push_untracked_gate\.sh[\s\S]*bash "\$UNTRACKED_GATE_TEST"[\s\S]*untracked-input regression gate/,
);
const hookMktempCalls = [...prePushHookSource.matchAll(/mktemp(?: -d)? "([^"]+)"/g)];
assert.ok(hookMktempCalls.length > 0);
assert.ok(
  hookMktempCalls.every(([, template]) => template.startsWith('$HOOK_TMP_ROOT/')),
  'every hook temp file must live below the parent-owned cleanup root',
);
assert.doesNotMatch(
  prePushHookSource.match(/hook_helper_path\(\) \{[\s\S]*?^\}/m)?.[0] || '',
  /pushed_path_changed|CANONICAL_GALLERY_ROOT|PUSH_REFS\[@\].*!= 1/,
);

console.log('discovery surfaces: PASS');
