#!/usr/bin/env node
/**
 * Regression test for /api/admin/gen-result level seeding.
 *
 * The accept endpoint must reject generated games with no static level seed
 * before writing genblob, seed fresh games into creation-levels:<id>, and avoid
 * clobbering levels the creator already saved during a later iteration.
 */

const path = require('path');

const GALLERY = path.resolve(__dirname, '..');

function makeEnv(initial) {
  const store = new Map(Object.entries(initial || {}));
  return {
    ADMIN_TOKEN: 'test-token',
    store,
    VOTES: {
      async get(key, type) {
        const value = store.get(key);
        if (value == null) return null;
        return type === 'json' ? JSON.parse(value) : value;
      },
      async put(key, value) {
        store.set(key, value);
      },
      async delete(key) {
        store.delete(key);
      },
    },
  };
}

function htmlWithSeed(title, levels) {
  const seed = JSON.stringify({
    schema: 'game-factory-generic-levels-v1',
    levels,
  }).replace(/</g, '\\u003c');
  return `<!DOCTYPE html><html><head><title>${title}</title></head><body>
    <script id="gameFactoryLevelSeed" type="application/json">${seed}</script>
    <script>window.__gameFactoryLevelState={source:"built-in",count:${levels.length},current:0};</script>
  </body></html>`;
}

function readyRequest(id, html) {
  return new Request('https://game-factory.test/api/admin/gen-result', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-admin-token': 'test-token',
    },
    body: JSON.stringify({ id, status: 'ready', html, title: 'Seeded Game', quality: 'ok' }),
  });
}

async function postReady(mod, env, id, html) {
  const res = await mod.onRequestPost({ request: readyRequest(id, html), env });
  const text = await res.text();
  let body = null;
  try { body = JSON.parse(text); } catch {}
  return { status: res.status, body, text };
}

async function main() {
  const mod = await import(path.join(GALLERY, 'functions/api/admin/gen-result.js'));

  const missingId = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const missingEnv = makeEnv({
    [`genjob:${missingId}`]: JSON.stringify({ status: 'building', uid: 'u1', prompt: 'missing seed', ts: 1 }),
  });
  const missing = await postReady(
    mod,
    missingEnv,
    missingId,
    '<!DOCTYPE html><html><head><title>No Seed</title></head><body><canvas></canvas></body></html>',
  );
  if (missing.status !== 400 || !missing.body || missing.body.error !== 'missing_level_seed') {
    throw new Error(`expected missing_level_seed 400, got ${missing.status} ${missing.text}`);
  }
  if (missingEnv.store.has(`genblob:${missingId}`)) throw new Error('missing seed wrote genblob');

  const freshId = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
  const freshEnv = makeEnv({
    [`genjob:${freshId}`]: JSON.stringify({ status: 'building', uid: 'u1', email: '', prompt: 'seeded game', ts: 2 }),
  });
  const freshHtml = htmlWithSeed('Seeded Game', [
    { name: 'Built In 1', player: { x: 40, y: 500 }, goal: { x: 320, y: 100 }, objects: [] },
    { name: 'Built In 2', player: { x: 80, y: 520 }, goal: { x: 260, y: 120 }, objects: [{ type: 'coin', x: 180, y: 220 }] },
  ]);
  const fresh = await postReady(mod, freshEnv, freshId, freshHtml);
  if (fresh.status !== 200 || !fresh.body || fresh.body.status !== 'ready') {
    throw new Error(`fresh ready failed: ${fresh.status} ${fresh.text}`);
  }
  const freshLevels = JSON.parse(freshEnv.store.get(`creation-levels:${freshId}`));
  if (freshLevels.source !== 'embedded-seed' || freshLevels.levels.length !== 2) {
    throw new Error('fresh build did not seed levels');
  }
  if (!freshEnv.store.has(`upload:${freshId}`) || !freshEnv.store.has(`genblob:${freshId}`)) {
    throw new Error('fresh build did not store upload/genblob');
  }
  const freshUpload = JSON.parse(freshEnv.store.get(`upload:${freshId}`));
  if (freshUpload.versionNumber !== 1 || freshUpload.versionName !== 'Seeded Game v1') {
    throw new Error(`fresh build did not stamp version metadata: ${JSON.stringify({ versionNumber: freshUpload.versionNumber, versionName: freshUpload.versionName })}`);
  }
  if (!/Editable levels imported: 2/.test(freshUpload.lastUpdateSummary || '')) {
    throw new Error(`fresh build summary did not mention seeded levels: ${freshUpload.lastUpdateSummary}`);
  }
  const freshHistory = JSON.parse(freshEnv.store.get(`creation-history:${freshId}`));
  if (!freshHistory.events || freshHistory.events.length !== 2 || freshHistory.events[0].id !== `request:${freshId}` || freshHistory.events[1].id !== `result:${freshId}`) {
    throw new Error('fresh build did not write request/result history');
  }
  if (freshHistory.events[0].versionName !== 'Seeded Game v1') {
    throw new Error(`fresh request history did not get final version name: ${freshHistory.events[0].versionName}`);
  }

  const baseId = 'cccccccccccccccccccccccccccccccc';
  const jobId = 'dddddddddddddddddddddddddddddddd';
  const iterEnv = makeEnv({
    [`upload:${baseId}`]: JSON.stringify({ source: 'vibe', uid: 'u2', slug: 'seeded-game-cccc', title: 'Seeded Game', published: false, ts: 3 }),
    [`genjob:${jobId}`]: JSON.stringify({ status: 'building', uid: 'u2', baseId, email: '', prompt: 'iterate', ts: 4 }),
    [`creation-levels:${baseId}`]: JSON.stringify({
      schema: 'game-factory-generic-levels-v1',
      source: 'creator-admin',
      updatedTs: 5,
      levels: [{ name: 'Creator Edit', player: { x: 180, y: 560 }, goal: { x: 180, y: 100 }, objects: [] }],
    }),
  });
  const iter = await postReady(mod, iterEnv, jobId, htmlWithSeed('Iterated Game', [
    { name: 'New Built In', player: { x: 10, y: 500 }, goal: { x: 330, y: 80 }, objects: [] },
  ]));
  if (iter.status !== 200 || !iter.body || iter.body.status !== 'ready') {
    throw new Error(`iterate ready failed: ${iter.status} ${iter.text}`);
  }
  const preserved = JSON.parse(iterEnv.store.get(`creation-levels:${baseId}`));
  if (preserved.source !== 'creator-admin' || preserved.levels[0].name !== 'Creator Edit') {
    throw new Error('iterate clobbered creator-saved levels');
  }
  const iterJob = JSON.parse(iterEnv.store.get(`genjob:${jobId}`));
  if (!iterJob.levelSeed || iterJob.levelSeed.seeded !== false || iterJob.levelSeed.reason !== 'existing_creator-admin') {
    throw new Error(`unexpected iterate levelSeed metadata: ${JSON.stringify(iterJob.levelSeed)}`);
  }
  const iterUpload = JSON.parse(iterEnv.store.get(`upload:${baseId}`));
  if (iterUpload.versionNumber !== 2 || iterUpload.versionName !== 'Seeded Game v2') {
    throw new Error(`iterate did not increment version metadata: ${JSON.stringify({ versionNumber: iterUpload.versionNumber, versionName: iterUpload.versionName })}`);
  }
  if (!/Saved editable levels preserved: 1/.test(iterUpload.lastUpdateSummary || '')) {
    throw new Error(`iterate summary did not mention preserved creator levels: ${iterUpload.lastUpdateSummary}`);
  }
  const iterHistory = JSON.parse(iterEnv.store.get(`creation-history:${baseId}`));
  if (!iterHistory.events || iterHistory.events.length !== 2 || iterHistory.events[0].id !== `request:${jobId}` || iterHistory.events[1].id !== `result:${jobId}`) {
    throw new Error('iterate did not write request/result history');
  }

  const defaultBaseId = 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
  const defaultJobId = 'ffffffffffffffffffffffffffffffff';
  const defaultEnv = makeEnv({
    [`upload:${defaultBaseId}`]: JSON.stringify({ source: 'vibe', uid: 'u3', slug: 'default-game-eeee', title: 'Default Game', published: false, ts: 6 }),
    [`genjob:${defaultJobId}`]: JSON.stringify({ status: 'building', uid: 'u3', baseId: defaultBaseId, email: '', prompt: 'iterate default', ts: 7 }),
    [`creation-levels:${defaultBaseId}`]: JSON.stringify({
      schema: 'game-factory-generic-levels-v1',
      source: 'creator-admin',
      updatedTs: 8,
      levels: [{ name: 'Level 1', width: 360, height: 640, player: { x: 180, y: 560 }, goal: { x: 180, y: 100 }, objects: [], notes: '' }],
    }),
  });
  const defaultIter = await postReady(mod, defaultEnv, defaultJobId, htmlWithSeed('Recovered Game', [
    { name: 'Recovered Built In', player: { x: 20, y: 500 }, goal: { x: 320, y: 90 }, objects: [] },
  ]));
  if (defaultIter.status !== 200 || !defaultIter.body || defaultIter.body.status !== 'ready') {
    throw new Error(`default iterate ready failed: ${defaultIter.status} ${defaultIter.text}`);
  }
  const recovered = JSON.parse(defaultEnv.store.get(`creation-levels:${defaultBaseId}`));
  if (recovered.source !== 'embedded-seed' || recovered.levels[0].name !== 'Recovered Built In') {
    throw new Error('saved generic fallback was not replaced by embedded seed');
  }

  console.log('PASS creation-level acceptance');
}

main().catch((err) => {
  console.error('FAIL creation-level acceptance:', err.message);
  process.exit(1);
});
