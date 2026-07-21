import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { runInNewContext } from 'node:vm';


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
const responseApiModule = await import(
  new URL('../functions/api/dissertation/response.js', import.meta.url)
);


function validSummary(overrides = {}) {
  return {
    activeScheduleCount: 1,
    version: study.STUDY_SCHEDULE_VERSION,
    scheduleHash: study.STUDY_SCHEDULE_HASH,
    computedScheduleHash: study.STUDY_SCHEDULE_HASH,
    guardTriggersReady: true,
    guardTriggerCount: study.STUDY_SCHEDULE_GUARD_TRIGGERS.length,
    targetSequences: 56,
    sessionSize: 56,
    activeGames: 56,
    sequenceCount: 56,
    slotCount: 3136,
    badSequenceCount: 0,
    badGameCount: 0,
    inactiveItemCount: 0,
    ...overrides,
  };
}


test('accepts only the complete frozen 56 × 56 schedule structure', () => {
  assert.equal(study.validateScheduleStructure(validSummary()), true);

  for (const [field, value] of [
    ['activeScheduleCount', 2],
    ['scheduleHash', 'b'.repeat(64)],
    ['computedScheduleHash', 'b'.repeat(64)],
    ['guardTriggersReady', false],
    ['guardTriggerCount', study.STUDY_SCHEDULE_GUARD_TRIGGERS.length - 1],
    ['targetSequences', 55],
    ['sessionSize', 55],
    ['activeGames', 55],
    ['sequenceCount', 55],
    ['slotCount', 3135],
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
    for (let position = 1; position <= 56; position += 1) {
      const gameNumber = ((sequenceNumber - 1 + position - 1) % 56) + 1;
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
  assert.deepEqual(
    parsed.rows[0],
    Array.from({ length: 56 }, (_, index) => `game${String(index + 1).padStart(4, '0')}`),
  );

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
  const studyCss = await readFile(new URL('../dissertation/study.css', import.meta.url), 'utf8');
  const prePushHook = await readFile(new URL('../scripts/hooks/pre-push', import.meta.url), 'utf8');
  const responseApi = await readFile(
    new URL('../functions/api/dissertation/response.js', import.meta.url),
    'utf8',
  );
  const sessionApi = await readFile(
    new URL('../functions/api/dissertation/session.js', import.meta.url),
    'utf8',
  );
  const bridge = await readFile(
    new URL('../dissertation/study-bridge.js', import.meta.url),
    'utf8',
  );
  const pool = JSON.parse(await readFile(
    new URL('../dissertation/pool.json', import.meta.url),
    'utf8',
  ));
  const gameLayouts = JSON.parse(await readFile(
    new URL('../dissertation/game-layouts.json', import.meta.url),
    'utf8',
  ));
  const gameDocuments = await Promise.all(pool.games.map(game => readFile(
    new URL(`../dissertation/g/${game.id}/index.html`, import.meta.url),
    'utf8',
  )));
  const inlineReadyTag = [
    '<script>(()=>{const loadToken=new URLSearchParams(window.location.search)',
    '.get("studyLoad");const sendReady=()=>window.parent.postMessage({source:',
    '"dissertation-game",type:"ready",inputMethod:"unknown",loadToken},"*");',
    'if(document.readyState==="complete"){sendReady();}else{window.addEventListener(',
    '"load",sendReady,{once:true});}})();</script>',
  ].join('');

  assert.match(app, /informationVersion: state\.status\.informationVersion/);
  assert.match(app, /creationId: state\.creationId/);
  assert.match(app, /\/api\/dissertation\/resume/);
  assert.match(app, /localStorage\.setItem\(STORAGE_KEY/);
  assert.doesNotMatch(app, /\bconsent\b|consentVersion|acknowledgement/);
  assert.match(app, /performance\.now\(\)/);
  assert.match(app, /pauseVisibleGameTiming\(\)/);
  assert.match(app, /likeButton\.disabled = state\.submitting \|\| !ratingAvailable/);
  assert.match(app, /dislikeButton\.disabled = state\.submitting \|\| !ratingAvailable/);
  assert.match(app, /resumeVisibleGameTiming\(\)/);
  assert.doesNotMatch(app, /Date\.now\(\) - state\.gameStartedAt/);
  assert.match(app, /status\.collectionEnabled && status\.scheduleReady/);
  assert.match(app, /width < 640 \? "mobile" : width < 1100 \? "tablet"/);
  assert.match(app, /LOCAL_PREVIEW_HOSTS\.has\(window\.location\.hostname\)/);
  assert.match(app, /PLAYER_LAYOUT_VERSION = "mobile-fit-v1"/);
  assert.match(app, /fetch\("\/dissertation\/game-layouts\.json\?v=mobile-fit-v1"/);
  assert.match(app, /elements\.frame\.style\.transform = `scale\(\$\{scale\}\)`/);
  assert.doesNotMatch(app, /scrollIntoView/);
  assert.match(studyCss, /body\.study-playing \.study-shell/);
  assert.match(studyCss, /height: 100dvh/);
  assert.match(studyCss, /grid-template-rows: minmax\(0, 1fr\) auto/);
  assert.match(studyCss, /overflow: clip/);
  assert.match(prePushHook, /check_dissertation_mobile\.js/);
  assert.equal(study.DEVICE_CLASSES.has('tablet'), true);
  assert.match(responseApi, /DEVICE_CLASSES\.has\(deviceClass\)/);
  assert.match(sessionApi, /const MAX_CLAIM_ATTEMPTS = 6/);
  assert.match(bridge, /addEventListener\("load".*\{ once: true \}/);
  assert.match(bridge, /URLSearchParams\(window\.location\.search\)\.get\("studyLoad"\)/);
  assert.match(bridge, /loadToken,/);
  for (const gameDocument of gameDocuments) {
    assert.equal(gameDocument.split(inlineReadyTag).length - 1, 1);
    assert.equal(
      gameDocument.split(
        '<script src="/dissertation/study-bridge.js?v=token-ready-v2"></script>',
      ).length - 1,
      1,
    );
    assert.ok(
      gameDocument.indexOf('study-bridge.js?v=token-ready-v2')
        < gameDocument.indexOf(inlineReadyTag),
    );
  }
  const readyMessages = [];
  let readyListener = null;
  let readyListenerOptions = null;
  runInNewContext(
    inlineReadyTag.slice('<script>'.length, -'</script>'.length),
    {
      document: { readyState: 'loading' },
      URLSearchParams,
      window: {
        location: { search: '?studyLoad=37' },
        addEventListener: (type, listener, options) => {
          assert.equal(type, 'load');
          readyListener = listener;
          readyListenerOptions = options;
        },
        parent: {
          postMessage: (message, targetOrigin) => {
            readyMessages.push({ message, targetOrigin });
          },
        },
      },
    },
  );
  assert.equal(readyMessages.length, 0);
  assert.equal(typeof readyListener, 'function');
  assert.equal(readyListenerOptions.once, true);
  readyListener();
  assert.equal(JSON.stringify(readyMessages), JSON.stringify([{
    message: {
      source: 'dissertation-game',
      type: 'ready',
      inputMethod: 'unknown',
      loadToken: '37',
    },
    targetOrigin: '*',
  }]));

  assert.match(html, /id="data-notice"/);
  assert.match(html, /Please complete one session only\./);
  assert.match(html, /No evaluation record is created until/);
  assert.match(html, /Choosing Begin creates an anonymous 56-game evaluation session/);
  assert.match(html, /random session key/);
  assert.match(html, /current-game timing/);
  assert.match(html, /data-copy-version="minimal-entry-v4"/);
  assert.match(html, /data-player-layout-version="mobile-fit-v1"/);
  assert.match(html, /study\.css\?v=mobile-fit-v1/);
  assert.match(html, /app\.js\?v=mobile-fit-v1/);
  assert.match(html, /<h1 class="visually-hidden" id="study-title">Evaluation<\/h1>/);
  assert.doesNotMatch(html, /Information version:/);
  assert.doesNotMatch(html, /Anonymous browser-game service evaluation/);
  assert.doesNotMatch(html, /Play all 56 games\. Rate what works\./);
  assert.doesNotMatch(html, /Allow about two hours/);
  assert.doesNotMatch(html, /Stay anonymous/);
  assert.doesNotMatch(html, /What is recorded/);
  assert.doesNotMatch(app, /Evaluation open/);
  assert.doesNotMatch(app, /Begin all 56 games/);
  assert.doesNotMatch(app, /Your progress is saved after every response\./);
  assert.match(app, /classList\.toggle\("is-hidden", !label\)/);
  assert.match(app, /buttonNote\.classList\.toggle\("is-hidden", !note\)/);
  assert.match(app, /setStatus\("open", ""\)/);
  assert.match(app, /setStartState\(\s*true,\s*"Begin",\s*"",\s*\)/);
  assert.match(app, /matchMedia\("\(max-width: 64rem\)"\)/);
  assert.match(app, /frameLoading\.setAttribute\("aria-hidden", "true"\)/);
  assert.match(app, /\?studyLoad=\$\{token\}/);
  assert.match(app, /waitForGameReady\(token\)/);
  assert.doesNotMatch(app, /isVerifiedGameDocument|onFrameLoad/);
  assert.match(app, /loadToken === state\.readyWait\.token/);
  assert.match(app, /setStatus\("preview", "Preview complete"\)/);
  assert.match(app, /Preview only · responses discarded/);
  assert.match(html, /<h2 id="response-heading">Rate your experience<\/h2>/);
  assert.match(html, /role="group" aria-labelledby="response-heading" aria-describedby="rating-help"/);
  assert.match(html, /id="rating-help" class="visually-hidden" aria-live="polite"/);
  assert.match(html, />\s*Like\s*<\/span>/);
  assert.match(html, />\s*Dislike\s*<\/span>/);
  assert.match(html, /id="skip-toggle"[^>]*>[\s\S]*?Skip\s*<\/button>/);
  assert.match(app, /elements\.ratingHelp\.textContent = "Rating is available\."/);
  assert.doesNotMatch(html, /Your response|Would you keep playing\?|I need to skip this game|[↑↓]/);
  assert.doesNotMatch(app, /Try the game first|Choose based on the game you just played|played for at least 90 seconds/);
  assert.match(html, /sandbox="allow-scripts"/);
  assert.match(html, /scrolling="no"/);
  assert.doesNotMatch(html, /allow-same-origin/);
  assert.match(html, /All 56 anonymous service-evaluation responses were recorded/);
  assert.doesNotMatch(html, /type="checkbox"|want to take part/);
  assert.equal(gameLayouts.playerLayoutVersion, 'mobile-fit-v1');
  assert.deepEqual(
    Object.keys(gameLayouts.games).sort(),
    pool.games.map(game => game.id).sort(),
  );
  assert.equal(
    Object.values(gameLayouts.games).filter(layout => layout.mode === 'fixed').length,
    55,
  );
  assert.equal(
    Object.values(gameLayouts.games).filter(layout => layout.mode === 'fluid').length,
    1,
  );
});


test('schema migration stays trigger-free and separate guards are complete', async () => {
  const migration = await readFile(
    new URL('../migrations/0004_dissertation_service_evaluation_schedule.sql', import.meta.url),
    'utf8',
  );
  const allGamesMigration = await readFile(
    new URL('../migrations/0005_dissertation_all_games_protocol.sql', import.meta.url),
    'utf8',
  );
  const playerLayoutMigration = await readFile(
    new URL('../migrations/0006_dissertation_player_layout_version.sql', import.meta.url),
    'utf8',
  );
  const guards = await readFile(
    new URL('../scripts/dissertation_schedule_guards.sql', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(migration, /CREATE\s+TRIGGER/i);
  assert.doesNotMatch(allGamesMigration, /CREATE\s+TRIGGER/i);
  assert.match(allGamesMigration, /order_position BETWEEN 1 AND 56/);
  assert.match(allGamesMigration, /session_size = 56/);
  assert.match(allGamesMigration, /playtime_censored/);
  assert.match(allGamesMigration, /_study_all_games_empty_guard/);
  assert.match(playerLayoutMigration, /ADD COLUMN player_layout_version TEXT/);
  assert.match(playerLayoutMigration, /length\(player_layout_version\) BETWEEN 1 AND 64/);
  assert.match(guards, new RegExp(study.STUDY_SCHEDULE_HASH));
  for (const trigger of study.STUDY_SCHEDULE_GUARD_TRIGGERS) {
    assert.match(guards, new RegExp(`CREATE TRIGGER IF NOT EXISTS ${trigger}\\b`));
  }
  assert.equal(
    (guards.match(/CREATE TRIGGER IF NOT EXISTS/g) || []).length,
    study.STUDY_SCHEDULE_GUARD_TRIGGERS.length,
  );
});


test('playtime over one hour is capped and explicitly marked, never rejected', () => {
  assert.deepEqual(responseApiModule.normalizePlaytimeForStorage(7200), {
    rawSeconds: 7200,
    recordedSeconds: 3600,
    censored: true,
  });
  assert.deepEqual(responseApiModule.normalizePlaytimeForStorage(42.26), {
    rawSeconds: 42.26,
    recordedSeconds: 42.3,
    censored: false,
  });
  assert.equal(responseApiModule.normalizePlaytimeForStorage(-1), null);
});


test('long-session protocol uses 24-hour activity-based reissue', () => {
  assert.equal(study.STUDY_SESSION_SIZE, 56);
  assert.equal(study.SCHEDULE_REISSUE_AFTER_MS, 24 * 60 * 60 * 1000);
  assert.equal(study.STUDY_RECORD_VERSION, 2);
  assert.match(librarySource, /MAX\(COALESCE\(s\.last_activity_at, c\.claimed_at\)\)/);
  assert.doesNotMatch(librarySource, /30 \* 60 \* 1000/);
});


test('responses preserve the participant player intervention boundary', async () => {
  const app = await readFile(new URL('../dissertation/app.js', import.meta.url), 'utf8');
  const responseApi = await readFile(
    new URL('../functions/api/dissertation/response.js', import.meta.url),
    'utf8',
  );
  const exportApi = await readFile(
    new URL('../functions/api/admin/dissertation-export.js', import.meta.url),
    'utf8',
  );
  assert.equal(responseApiModule.CURRENT_PLAYER_LAYOUT_VERSION, 'mobile-fit-v1');
  assert.match(app, /playerLayoutVersion: PLAYER_LAYOUT_VERSION/);
  assert.match(responseApi, /field !== 'playerLayoutVersion'/);
  assert.match(responseApi, /playerLayoutVersion \?\? null/);
  assert.match(responseApi, /invalid_player_layout_version/);
  assert.match(exportApi, /r\.player_layout_version/);
  assert.match(exportApi, /'player_layout_version'/);

  const legacyPayload = {
    sessionId: '11111111-1111-4111-8111-111111111111',
    publicId: 'g1e195684dedf',
    playtimeSeconds: 0,
    rating: null,
    skipReason: 'voluntary_skip',
    deviceClass: 'mobile',
    viewportClass: 'narrow',
    inputMethod: 'touch',
    visibilityLossCount: 0,
  };
  const env = {
    DISSERTATION_STUDY_OPEN: '1',
    DISSERTATION_SERVICE_EVALUATION_BASIS: 'test-basis',
    DISSERTATION_INFORMATION_VERSION: 'test-notice',
    DISSERTATION_DB: {
      prepare() {
        throw new Error('stop after request validation');
      },
    },
  };
  const submit = payload => responseApiModule.onRequestPost({
    request: new Request('https://game-factory.tech/api/dissertation/response', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'https://game-factory.tech',
        'sec-fetch-site': 'same-origin',
      },
      body: JSON.stringify(payload),
    }),
    env,
  });

  const legacyResponse = await submit(legacyPayload);
  assert.equal(legacyResponse.status, 503, 'pre-deploy tabs remain request-compatible');
  assert.deepEqual(await legacyResponse.json(), { error: 'study_database_error' });

  const currentResponse = await submit({
    ...legacyPayload,
    playerLayoutVersion: 'mobile-fit-v1',
  });
  assert.equal(currentResponse.status, 503, 'current fitted-player payload is accepted');

  const unknownResponse = await submit({
    ...legacyPayload,
    playerLayoutVersion: 'unknown-layout',
  });
  assert.equal(unknownResponse.status, 400);
  assert.deepEqual(await unknownResponse.json(), {
    error: 'invalid_player_layout_version',
  });
});
