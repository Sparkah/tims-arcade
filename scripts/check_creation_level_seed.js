#!/usr/bin/env node
/**
 * Verifies that generated single-file games can seed creator-admin levels from
 * their static gameFactoryLevelSeed JSON tag, and that creator-saved levels are
 * not overwritten by a later iterate.
 */

const path = require('path');

const GALLERY = path.resolve(__dirname, '..');

function htmlWithLevels(levels) {
  const seed = JSON.stringify({
    schema: 'game-factory-generic-levels-v1',
    levels,
  }).replace(/</g, '\\u003c');
  return `<!DOCTYPE html><html><head><title>Seed</title></head><body>
    <script id="gameFactoryLevelSeed" type="application/json">${seed}</script>
    <script>window.__gameFactoryLevelState={source:"built-in",count:${levels.length},current:0};</script>
  </body></html>`;
}

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
  const mod = await import(path.join(GALLERY, 'functions/_lib/creationLevels.js'));
  const levels = [
    {
      name: 'Seed Level A',
      width: 360,
      height: 640,
      player: { x: 10, y: 9999 },
      goal: { x: 320, y: 80 },
      objects: [{ type: 'coin', x: 160, y: 220, w: 28, h: 28, value: 5, label: 'coin' }],
      notes: 'from generated game',
    },
    { name: 'Seed Level B', player: { x: 50, y: 500 }, goal: { x: 300, y: 100 }, objects: [] },
  ];
  const html = htmlWithLevels(levels);

  const extracted = mod.extractEmbeddedLevelSeed(html);
  if (!extracted || extracted.levels.length !== 2 || extracted.levels[0].name !== 'Seed Level A') {
    throw new Error('failed to extract seed payload');
  }
  if (extracted.levels[0].player.y !== 640) {
    throw new Error('expected seed sanitizer to clamp player y');
  }

  const customHtml = htmlWithLevels([{
    name: 'Wide Custom World',
    width: 1520,
    height: 720,
    player: { x: 90, y: 620 },
    goal: { x: 1435, y: 620 },
    objects: [
      { type: 'climate', x: 0, y: 0, w: 1520, h: 720, value: 18, label: 'Cool night' },
      { type: 'coolRock', x: 400, y: 588, w: 180, h: 32, value: 18, label: 'Blue stone' },
      { type: 'camera', x: 720, y: 140, w: 430, h: 28, value: -0.35, label: 'Iris One' },
    ],
  }]);
  const custom = mod.extractEmbeddedLevelSeed(customHtml);
  if (!custom || custom.levels[0].width !== 1520 || custom.levels[0].height !== 720) throw new Error('custom world dimensions were changed');
  if (custom.levels[0].objects[1].type !== 'coolRock') throw new Error('custom object type was changed');
  if (custom.levels[0].objects[2].value !== -0.35) throw new Error('custom object value was changed');
  if (custom.levels[0].objects[0].id !== 'level-1-object-1' || custom.levels[0].objects[2].id !== 'level-1-object-3') {
    throw new Error('missing object IDs were not deterministic');
  }

  const env = makeEnv();
  const seeded = await mod.seedCreationLevelsFromHtml(env, 'abc12345', html, { updatedTs: 123 });
  if (!seeded.seeded || seeded.count !== 2) throw new Error('seed write failed');
  const stored = JSON.parse(env.store.get('creation-levels:abc12345'));
  if (stored.source !== 'embedded-seed' || stored.levels.length !== 2) throw new Error('bad stored seed');

  const replacement = await mod.seedCreationLevelsFromHtml(env, 'abc12345', htmlWithLevels([{ name: 'Replacement', objects: [] }]), { updatedTs: 456 });
  if (!replacement.seeded || replacement.count !== 1) throw new Error('embedded seed was not refreshed');

  await mod.writeCreationLevels(env, 'abc12345', [{ name: 'Creator Edit', objects: [] }], { source: 'creator-admin', updatedTs: 789 });
  const skipped = await mod.seedCreationLevelsFromHtml(env, 'abc12345', html, { updatedTs: 999 });
  if (skipped.seeded || skipped.reason !== 'existing_creator-admin') throw new Error('creator levels were not protected');
  const preserved = JSON.parse(env.store.get('creation-levels:abc12345'));
  if (preserved.levels[0].name !== 'Creator Edit') throw new Error('creator levels were overwritten');

  await mod.writeCreationLevels(env, 'defaulted', mod.defaultLevels(), { source: 'creator-admin', updatedTs: 1000 });
  const recovered = await mod.seedCreationLevelsFromHtml(env, 'defaulted', html, { updatedTs: 1001 });
  if (!recovered.seeded || recovered.count !== 2) throw new Error('saved generic default was not replaceable by seed');
  const recoveredStored = JSON.parse(env.store.get('creation-levels:defaulted'));
  if (recoveredStored.source !== 'embedded-seed' || recoveredStored.levels[0].name !== 'Seed Level A') {
    throw new Error('saved generic default did not recover to seed levels');
  }

  console.log('PASS creation-level seed');
}

main().catch((err) => {
  console.error('FAIL creation-level seed:', err.message);
  process.exit(1);
});
