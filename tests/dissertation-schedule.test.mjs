import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';


const libraryUrl = new URL('../functions/_lib/dissertationStudy.js', import.meta.url);
const librarySource = await readFile(libraryUrl, 'utf8');
const testableSource = librarySource.replace(
  "import { json, sameOriginOk } from './response.js';",
  [
    'const json = (body, status = 200, headers = {}) => ({ body, status, headers });',
    'const sameOriginOk = () => true;',
  ].join('\n'),
);
const study = await import(
  `data:text/javascript;base64,${Buffer.from(testableSource).toString('base64')}`
);


function validSummary(overrides = {}) {
  return {
    activeScheduleCount: 1,
    version: 'service-evaluation-schedule-v1',
    scheduleHash: study.STUDY_SCHEDULE_HASH,
    computedScheduleHash: study.STUDY_SCHEDULE_HASH,
    guardTriggersReady: true,
    guardTriggerCount: study.STUDY_SCHEDULE_GUARD_TRIGGERS.length,
    targetSequences: 56,
    sessionSize: 5,
    activeGames: 56,
    sequenceCount: 56,
    slotCount: 280,
    badSequenceCount: 0,
    badGameCount: 0,
    inactiveItemCount: 0,
    ...overrides,
  };
}


test('accepts only the complete frozen 56 × 5 schedule structure', () => {
  assert.equal(study.validateScheduleStructure(validSummary()), true);

  for (const [field, value] of [
    ['activeScheduleCount', 2],
    ['scheduleHash', 'b'.repeat(64)],
    ['computedScheduleHash', 'b'.repeat(64)],
    ['guardTriggersReady', false],
    ['guardTriggerCount', study.STUDY_SCHEDULE_GUARD_TRIGGERS.length - 1],
    ['targetSequences', 55],
    ['sessionSize', 4],
    ['activeGames', 55],
    ['sequenceCount', 55],
    ['slotCount', 279],
    ['badSequenceCount', 1],
    ['badGameCount', 1],
    ['inactiveItemCount', 1],
  ]) {
    assert.equal(
      study.validateScheduleStructure(validSummary({ [field]: value })),
      false,
      `expected ${field}=${value} to fail closed`,
    );
  }
});


test('canonical hash binds sequence order and every frozen row', async () => {
  const rows = [];
  for (let sequenceNumber = 1; sequenceNumber <= 56; sequenceNumber += 1) {
    for (let position = 1; position <= 5; position += 1) {
      const gameNumber = ((sequenceNumber - 1 + (position - 1) * 11) % 56) + 1;
      rows.push({
        sequence_number: sequenceNumber,
        issue_order: 57 - sequenceNumber,
        order_position: position,
        public_id: `game${String(gameNumber).padStart(4, '0')}`,
      });
    }
  }

  const canonical = study.canonicalScheduleJson([...rows].reverse());
  const parsed = JSON.parse(canonical);
  assert.equal(parsed.issue_order.length, 56);
  assert.deepEqual(parsed.issue_order.slice(0, 3), [56, 55, 54]);
  assert.deepEqual(parsed.rows[0], [
    'game0001',
    'game0012',
    'game0023',
    'game0034',
    'game0045',
  ]);

  const originalHash = await study.computeScheduleHash(rows);
  assert.match(originalHash, /^[0-9a-f]{64}$/);
  rows[0] = { ...rows[0], public_id: 'game0056' };
  assert.notEqual(await study.computeScheduleHash(rows), originalHash);
});


test('selector always prefers the next never-issued sequence', () => {
  const candidate = study.selectScheduleCandidate(
    { version: 'v1', sequence_number: 8, issue_order: 3 },
    { version: 'v1', sequence_number: 2, issue_order: 1, claim_number: 4 },
  );
  assert.deepEqual(candidate, {
    version: 'v1',
    sequenceNumber: 8,
    issueOrder: 3,
    claimNumber: 1,
    kind: 'initial',
  });
});


test('selector reissues the exact frozen row with the next claim number', () => {
  const candidate = study.selectScheduleCandidate(
    null,
    { version: 'v1', sequence_number: 12, issue_order: 40, claim_number: 3 },
  );
  assert.deepEqual(candidate, {
    version: 'v1',
    sequenceNumber: 12,
    issueOrder: 40,
    claimNumber: 3,
    kind: 'reissue',
  });
  assert.equal(study.selectScheduleCandidate(null, null), null);
});


test('service evaluation opens only with all namespaced server gates', () => {
  const db = {};
  const open = study.studyConfiguration({
    DISSERTATION_STUDY_OPEN: '1',
    DISSERTATION_SERVICE_EVALUATION_BASIS: 'email-basis',
    DISSERTATION_INFORMATION_VERSION: 'notice-v1',
    DISSERTATION_DB: db,
  });
  assert.equal(open.open, true);
  assert.equal(open.db, db);

  assert.equal(study.studyConfiguration({
    DISSERTATION_STUDY_OPEN: '1',
    DISSERTATION_INFORMATION_VERSION: 'notice-v1',
    DISSERTATION_DB: db,
  }).open, false);
  assert.equal(study.studyConfiguration({
    DISSERTATION_STUDY_OPEN: '0',
    DISSERTATION_SERVICE_EVALUATION_BASIS: 'email-basis',
    DISSERTATION_INFORMATION_VERSION: 'notice-v1',
    DISSERTATION_DB: db,
  }).open, false);
});


test('participant flow sends information version and uses visible time', async () => {
  const app = await readFile(new URL('../dissertation/app.js', import.meta.url), 'utf8');
  const html = await readFile(new URL('../dissertation/index.html', import.meta.url), 'utf8');
  const responseApi = await readFile(
    new URL('../functions/api/dissertation/response.js', import.meta.url),
    'utf8',
  );

  assert.match(app, /informationVersion: state\.status\.informationVersion/);
  assert.doesNotMatch(app, /\bconsent\b|consentVersion|acknowledgement/);
  assert.match(app, /performance\.now\(\)/);
  assert.match(app, /pauseVisibleGameTiming\(\)/);
  assert.match(app, /resumeVisibleGameTiming\(\)/);
  assert.doesNotMatch(app, /Date\.now\(\) - state\.gameStartedAt/);
  assert.match(app, /status\.collectionEnabled && status\.scheduleReady/);
  assert.match(app, /width < 640 \? "mobile" : width < 1100 \? "tablet"/);
  assert.match(app, /LOCAL_PREVIEW_HOSTS\.has\(window\.location\.hostname\)/);
  assert.equal(study.DEVICE_CLASSES.has('tablet'), true);
  assert.match(responseApi, /DEVICE_CLASSES\.has\(deviceClass\)/);

  assert.match(html, /id="data-notice"/);
  assert.match(html, /Information version:/);
  assert.match(html, /Please complete one session only\./);
  assert.match(html, /No evaluation record is created until/);
  assert.match(html, /Choosing Begin creates an anonymous five-game evaluation session/);
  assert.doesNotMatch(html, /type="checkbox"|want to take part/);
});


test('schema migration stays trigger-free and separate guards are complete', async () => {
  const migration = await readFile(
    new URL('../migrations/0004_dissertation_service_evaluation_schedule.sql', import.meta.url),
    'utf8',
  );
  const guards = await readFile(
    new URL('../scripts/dissertation_schedule_guards.sql', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(migration, /CREATE\s+TRIGGER/i);
  assert.match(guards, new RegExp(study.STUDY_SCHEDULE_HASH));
  for (const trigger of study.STUDY_SCHEDULE_GUARD_TRIGGERS) {
    assert.match(guards, new RegExp(`CREATE TRIGGER IF NOT EXISTS ${trigger}\\b`));
  }
  assert.equal(
    (guards.match(/CREATE TRIGGER IF NOT EXISTS/g) || []).length,
    study.STUDY_SCHEDULE_GUARD_TRIGGERS.length,
  );
});
