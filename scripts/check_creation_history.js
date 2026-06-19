#!/usr/bin/env node
/**
 * Regression test for creation update history:
 * - version names are stable,
 * - generated HTML can provide a player-readable build summary,
 * - KV append de-dupes by event id.
 */

const path = require('path');

const GALLERY = path.resolve(__dirname, '..');

function makeEnv(initial) {
  const store = new Map(Object.entries(initial || {}));
  return {
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
    },
  };
}

async function main() {
  const mod = await import(path.join(GALLERY, 'functions/_lib/creationHistory.js'));

  if (mod.makeVersionName('Rocket Dash v1', 2) !== 'Rocket Dash v2') {
    throw new Error('version name did not replace old suffix');
  }

  const html = `<!DOCTYPE html><html><body>
    <script id="gameFactoryBuildSummary" type="application/json">{"summary":"Added two new stages and a calmer level 3.","changes":["new stages","level 3 tuning"]}</script>
  </body></html>`;
  const embedded = mod.extractEmbeddedBuildSummary(html);
  if (!embedded || embedded.summary !== 'Added two new stages and a calmer level 3.') {
    throw new Error('embedded summary was not extracted');
  }

  const env = makeEnv();
  await mod.appendCreationHistoryEvent(env, 'abc12345', {
    id: 'request:job1',
    role: 'player',
    type: 'request',
    status: 'queued',
    versionNumber: 2,
    versionName: 'Rocket Dash v2',
    text: 'Add levels',
    ts: 10,
    jobId: 'job1',
  });
  await mod.appendCreationHistoryEvent(env, 'abc12345', {
    id: 'request:job1',
    role: 'player',
    type: 'request',
    status: 'queued',
    versionNumber: 2,
    versionName: 'Rocket Dash v2',
    text: 'Add levels please',
    ts: 10,
    jobId: 'job1',
  });
  await mod.appendCreationHistoryEvent(env, 'abc12345', {
    id: 'result:job1',
    role: 'studio',
    type: 'result',
    status: 'ready',
    versionNumber: 2,
    versionName: 'Rocket Dash v2',
    summary: mod.buildResultSummary({ prompt: 'Add levels', html, levelSeed: { seeded: true, count: 3 }, isUpdate: true }),
    ts: 20,
    jobId: 'job1',
  });

  const history = await mod.readCreationHistory(env, 'abc12345');
  if (history.events.length !== 2) throw new Error(`expected 2 deduped events, got ${history.events.length}`);
  if (history.events[0].text !== 'Add levels please') throw new Error('newer duplicate event did not replace older one');
  if (history.events[1].summary !== embedded.summary) throw new Error('result summary mismatch');

  const fallback = mod.buildResultSummary({
    prompt: 'Make level 3 easier',
    levelSeed: { seeded: false, reason: 'existing_creator-admin', count: 4 },
    isUpdate: true,
  });
  if (!/Saved editable levels preserved: 4/.test(fallback)) throw new Error('fallback did not mention preserved levels');

  console.log('PASS creation-history');
}

main().catch((err) => {
  console.error('FAIL creation-history:', err.message);
  process.exit(1);
});
