#!/usr/bin/env node
/**
 * Regression test for /api/admin/gen-result level seeding.
 *
 * The accept endpoint must reject generated games with no static level seed
 * before writing genblob, seed fresh games into creation-levels:<id>, and avoid
 * clobbering levels the creator already saved during a later iteration.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const GALLERY = path.resolve(__dirname, '..');

function findAgentsRoot(start) {
  let current = path.resolve(start);
  while (current !== path.dirname(current)) {
    if (fs.existsSync(path.join(current, 'Shared', 'tools', 'vibe-relay', 'relay.js'))) return current;
    current = path.dirname(current);
  }
  throw new Error('Could not locate Agents workspace root');
}

function makeEnv(initial) {
  const store = new Map(Object.entries(initial || {}));
  return {
    GAME_FACTORY_RELAY_TOKEN: 'test-token',
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

function canonicalRuntimeLevelPayload(payload) {
  return {
    schema: payload && payload.schema || 'game-factory-generic-levels-v1',
    levels: (payload && Array.isArray(payload.levels) ? payload.levels : []).map(level => ({
      name: level && level.name || '',
      width: level && level.width,
      height: level && level.height,
      player: { x: level && level.player && level.player.x, y: level && level.player && level.player.y },
      goal: { x: level && level.goal && level.goal.x, y: level && level.goal && level.goal.y },
      objects: (level && Array.isArray(level.objects) ? level.objects : []).map(object => ({
        id: object && object.id || '',
        type: object && object.type,
        x: object && object.x,
        y: object && object.y,
        w: object && object.w,
        h: object && object.h,
        value: object && object.value,
        label: object && object.label || '',
      })),
      notes: level && level.notes || '',
    })),
  };
}

function runtimeLevelMessage(creationId, payload) {
  const canonical = canonicalRuntimeLevelPayload(payload);
  return { type:'gameFactoryLevels', schema:canonical.schema, id:String(creationId || '').toLowerCase(), levels:canonical.levels };
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function qaReceiptFor(html, creationId, runtimeLevelPayload) {
  const pass = { boot: true, rendered: true, levelBridge: true, firstAction: true, aliveAfterSettle: true };
  return {
    schema: 'game-factory-runtime-smoke-v3',
    htmlSha256: sha256(html),
    levelMessageSha256: sha256(JSON.stringify(runtimeLevelMessage(creationId, runtimeLevelPayload))),
    viewports: {
      mobile: { width:393, height:808, hasTouch:true, ...pass },
      desktop: { width:1280, height:676, hasTouch:false, ...pass },
    },
  };
}

function readyRequest(id, html, qaReceipt) {
  const body = { id, status: 'ready', html, title: 'Seeded Game', quality: 'ok' };
  if (qaReceipt) body.qaReceipt = qaReceipt;
  return new Request('https://game-factory.test/api/admin/gen-result', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-relay-token': 'test-token',
    },
    body: JSON.stringify(body),
  });
}

async function sendReady(mod, env, id, html, receipt) {
  const res = await mod.onRequestPost({ request: readyRequest(id, html, receipt), env });
  const text = await res.text();
  let body = null;
  try { body = JSON.parse(text); } catch {}
  return { status: res.status, body, text };
}

async function postReady(mod, levelsMod, env, id, html, { withReceipt = true } = {}) {
  let receipt;
  if (withReceipt) {
    let runtimeLevelPayload = levelsMod.extractEmbeddedLevelSeed(html);
    const job = JSON.parse(env.store.get(`genjob:${id}`) || '{}');
    if (job.baseId) {
      const saved = await levelsMod.readCreationLevels(env, job.baseId);
      if (levelsMod.shouldPreserveCreationLevels(saved)) runtimeLevelPayload = saved;
    }
    receipt = qaReceiptFor(html, job.baseId || id, runtimeLevelPayload);
  }
  return sendReady(mod, env, id, html, receipt);
}

async function main() {
  const mod = await import(path.join(GALLERY, 'functions/api/admin/gen-result.js'));
  const levelsMod = await import(path.join(GALLERY, 'functions/_lib/creationLevels.js'));
  const relay = require(path.join(findAgentsRoot(GALLERY), 'Shared', 'tools', 'vibe-relay', 'relay.js'));

  const missingId = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const missingEnv = makeEnv({
    [`genjob:${missingId}`]: JSON.stringify({ status: 'building', uid: 'u1', prompt: 'missing seed', ts: 1 }),
  });
  const missing = await postReady(
    mod,
    levelsMod,
    missingEnv,
    missingId,
    '<!DOCTYPE html><html><head><title>No Seed</title></head><body><canvas></canvas></body></html>',
  );
  if (missing.status !== 400 || !missing.body || missing.body.error !== 'missing_level_seed') {
    throw new Error(`expected missing_level_seed 400, got ${missing.status} ${missing.text}`);
  }
  if (missingEnv.store.has(`genblob:${missingId}`)) throw new Error('missing seed wrote genblob');

  const receiptId = 'abababababababababababababababab';
  const receiptEnv = makeEnv({
    [`genjob:${receiptId}`]: JSON.stringify({ status: 'building', uid: 'u1', prompt: 'receipt required', ts: 1 }),
  });
  const receiptHtml = htmlWithSeed('Receipt Required', [
    { name: 'Level 1', player: { x: 20, y: 500 }, goal: { x: 320, y: 90 }, objects: [] },
  ]);
  const noReceipt = await postReady(mod, levelsMod, receiptEnv, receiptId, receiptHtml, { withReceipt: false });
  if (noReceipt.status !== 400 || !noReceipt.body || noReceipt.body.error !== 'qa_receipt_required') {
    throw new Error(`expected qa_receipt_required 400, got ${noReceipt.status} ${noReceipt.text}`);
  }
  if (receiptEnv.store.has(`genblob:${receiptId}`)) throw new Error('missing QA receipt wrote genblob');

  const wrongId = 'acacacacacacacacacacacacacacacac';
  const wrongIdEnv = makeEnv({
    [`genjob:${wrongId}`]: JSON.stringify({ status:'building', uid:'u1', prompt:'wrong receipt id', ts:1 }),
  });
  const receiptPayload = levelsMod.extractEmbeddedLevelSeed(receiptHtml);
  const wrongIdResult = await sendReady(mod, wrongIdEnv, wrongId, receiptHtml, qaReceiptFor(receiptHtml, 'adadadadadadadadadadadadadadadad', receiptPayload));
  if (wrongIdResult.status !== 400 || !wrongIdResult.body || wrongIdResult.body.error !== 'qa_receipt_levels_mismatch') {
    throw new Error(`expected wrong-id receipt rejection, got ${wrongIdResult.status} ${wrongIdResult.text}`);
  }

  const wrongViewportId = 'aeaeaeaeaeaeaeaeaeaeaeaeaeaeaeae';
  const wrongViewportEnv = makeEnv({
    [`genjob:${wrongViewportId}`]: JSON.stringify({ status:'building', uid:'u1', prompt:'wrong viewport', ts:1 }),
  });
  const wrongViewportReceipt = qaReceiptFor(receiptHtml, wrongViewportId, receiptPayload);
  wrongViewportReceipt.viewports.mobile.width = 390;
  const wrongViewport = await sendReady(mod, wrongViewportEnv, wrongViewportId, receiptHtml, wrongViewportReceipt);
  if (wrongViewport.status !== 400 || !wrongViewport.body || wrongViewport.body.error !== 'qa_receipt_mobile_incomplete') {
    throw new Error(`expected wrong-viewport receipt rejection, got ${wrongViewport.status} ${wrongViewport.text}`);
  }

  const freshId = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
  const freshEnv = makeEnv({
    [`genjob:${freshId}`]: JSON.stringify({ status: 'building', uid: 'u1', email: '', prompt: 'seeded game', ts: 2 }),
  });
  const freshHtml = htmlWithSeed('Seeded Game', [
    { name: 'Built In 1', width: 1520, height: 720, player: { x: 90, y: 620 }, goal: { x: 1435, y: 620 }, objects: [{ type: 'climate', x: 0, y: 0, w: 1520, h: 720, value: 18 }, { type: 'camera', x: 720, y: 140, w: 430, h: 28, value: -0.35 }] },
    { name: 'Built In 2', player: { x: 80, y: 520 }, goal: { x: 260, y: 120 }, objects: [{ type: 'coin', x: 180, y: 220 }] },
  ]);
  const relayProjection = relay.runtimeLevelProjection(freshHtml);
  if (!relayProjection.ok) throw new Error(`relay projection failed: ${relayProjection.reason}`);
  const relayReceipt = qaReceiptFor(freshHtml, freshId, relayProjection);
  relayReceipt.levelMessageSha256 = sha256(JSON.stringify(relay.runtimeLevelMessage(freshId, relayProjection)));
  const fresh = await sendReady(mod, freshEnv, freshId, freshHtml, relayReceipt);
  if (fresh.status !== 200 || !fresh.body || fresh.body.status !== 'ready') {
    throw new Error(`fresh ready failed: ${fresh.status} ${fresh.text}`);
  }
  const freshLevels = JSON.parse(freshEnv.store.get(`creation-levels:${freshId}`));
  if (freshLevels.source !== 'embedded-seed' || freshLevels.levels.length !== 2) {
    throw new Error('fresh build did not seed levels');
  }
  if (freshLevels.levels[0].width !== 1520 || freshLevels.levels[0].objects[0].type !== 'climate' || freshLevels.levels[0].objects[1].value !== -0.35) {
    throw new Error('fresh build destructively projected custom level data');
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
  const iter = await postReady(mod, levelsMod, iterEnv, jobId, htmlWithSeed('Iterated Game', [
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
  const defaultIter = await postReady(mod, levelsMod, defaultEnv, defaultJobId, htmlWithSeed('Recovered Game', [
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
