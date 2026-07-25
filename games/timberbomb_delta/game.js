(function () {
  'use strict';

  const canvas = document.getElementById('game-canvas');
  const frame = document.getElementById('canvas-frame');
  const boardAccess = document.getElementById('board-access');
  const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: true });

  const dom = {
    hudStorm: document.getElementById('hud-storm'),
    hudPhase: document.getElementById('hud-phase'),
    hudScore: document.getElementById('hud-score'),
    hudCombo: document.getElementById('hud-combo'),
    hudIntegrity: document.getElementById('hud-integrity'),
    hudTokens: document.getElementById('hud-tokens'),
    phaseRibbon: document.getElementById('phase-ribbon'),
    phaseLabel: document.getElementById('phase-label'),
    coach: document.getElementById('coach-card'),
    toast: document.getElementById('toast'),
    contractName: document.getElementById('contract-name'),
    timerValue: document.getElementById('timer-value'),
    valueCurrent: document.getElementById('value-current'),
    valueTarget: document.getElementById('value-target'),
    contractFill: document.getElementById('contract-fill'),
    placementsValue: document.getElementById('placements-value'),
    tntValue: document.getElementById('tnt-value'),
    rotationValue: document.getElementById('rotation-value'),
    workshopTokens: document.getElementById('workshop-tokens'),
    handButtons: [document.getElementById('hand-1'), document.getElementById('hand-2'), document.getElementById('hand-3')],
    rotateButton: document.getElementById('rotate-btn'),
    tntButton: document.getElementById('tnt-btn'),
    previewButton: document.getElementById('preview-btn'),
    releaseButton: document.getElementById('release-btn'),
    helpButton: document.getElementById('help-btn'),
    muteButton: document.getElementById('mute-btn'),
    pauseButton: document.getElementById('pause-btn'),
    fullscreenButton: document.getElementById('fullscreen-btn'),
    workshopButton: document.getElementById('workshop-btn'),
    resultOverlay: document.getElementById('result-overlay'),
    resultKicker: document.getElementById('result-kicker'),
    resultTitle: document.getElementById('result-title'),
    resultCopy: document.getElementById('result-copy'),
    resultValue: document.getElementById('result-value'),
    resultTarget: document.getElementById('result-target'),
    resultTokens: document.getElementById('result-tokens'),
    continueButton: document.getElementById('continue-btn'),
    retryButton: document.getElementById('retry-btn'),
    upgradeButtons: Array.from(document.querySelectorAll('[data-upgrade]')),
    pauseOverlay: document.getElementById('pause-overlay'),
    restartButton: document.getElementById('restart-btn'),
    resumeButton: document.getElementById('resume-btn'),
    helpOverlay: document.getElementById('help-overlay'),
    helpCloseButton: document.getElementById('help-close-btn')
  };

  const SAVE_KEY = 'timberbomb_delta_meta_v1';
  const SAVE_VERSION = 1;
  const GRID_RADIUS = 3;
  const MAX_STORMS = 8;
  const PLAN_SECONDS = 60;
  const DIRS = [
    { q: 1, r: 0, label: 'east' },
    { q: 0, r: 1, label: 'southeast' },
    { q: -1, r: 1, label: 'southwest' },
    { q: -1, r: 0, label: 'west' },
    { q: 0, r: -1, label: 'northwest' },
    { q: 1, r: -1, label: 'northeast' }
  ];
  const FLOW_DIRECTION_PRIORITY = [1, 2, 0, 3, 5, 4];
  const CONTRACTS = [
    { name: 'Wharf braces', target: 2 },
    { name: 'Footbridge beams', target: 3 },
    { name: 'Ferry ramp', target: 5 },
    { name: 'Market pilings', target: 7 },
    { name: 'Canal lock', target: 9 },
    { name: 'Granary frame', target: 11 },
    { name: 'Delta viaduct', target: 14 },
    { name: 'Town restoration', target: 18 }
  ];
  const TILE_TYPES = {
    forest: { name: 'Forest', icon: '🌲', effect: '+2 logs', height: 0, color: '#638a48' },
    mill: { name: 'Mill', icon: '⚙', effect: 'Build chain', height: 0, color: '#d3a855' },
    slope: { name: 'Slope', icon: '⬢', effect: 'Stack + steer', height: 1, color: '#d68b43', directional: true },
    gate: { name: 'Gate', icon: '▥', effect: 'Dam + outlet', height: 2, color: '#ad7041', directional: true }
  };
  const UPGRADE_DEFS = {
    survey: { label: 'Survey Stakes', baseCost: 3, max: 3 },
    powder: { label: 'Powder Shed', baseCost: 5, max: 3 },
    wheel: { label: 'Wheelwright', baseCost: 7, max: 3 }
  };
  const FX_TIERS = [16, 8, 4, 2, 1];
  const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

  let meta = loadMeta();
  let state = null;
  let audioContext = null;
  let animationFrame = 0;
  let previousFrameTime = 0;
  let canvasDpr = 1;
  let accessDirty = true;
  let hiddenByDocument = document.hidden;
  let resizeObserver = null;
  let resizeQueued = false;
  const view = { width: 0, height: 0, size: 34, stackStep: 4, originX: 0, originY: 0, centers: new Map() };

  function keyFor(q, r) {
    return q + ',' + r;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function easeOutCubic(t) {
    const n = 1 - clamp(t, 0, 1);
    return 1 - n * n * n;
  }

  function loadMeta() {
    const fallback = { version: SAVE_VERSION, tokens: 0, upgrades: { survey: 0, powder: 0, wheel: 0 }, tutorialDone: false };
    try {
      const raw = window.localStorage.getItem(SAVE_KEY);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.version !== SAVE_VERSION || typeof parsed.tokens !== 'number') return fallback;
      return {
        version: SAVE_VERSION,
        tokens: Math.max(0, Math.floor(parsed.tokens)),
        upgrades: {
          survey: clamp(Math.floor(parsed.upgrades && parsed.upgrades.survey || 0), 0, UPGRADE_DEFS.survey.max),
          powder: clamp(Math.floor(parsed.upgrades && parsed.upgrades.powder || 0), 0, UPGRADE_DEFS.powder.max),
          wheel: clamp(Math.floor(parsed.upgrades && parsed.upgrades.wheel || 0), 0, UPGRADE_DEFS.wheel.max)
        },
        tutorialDone: Boolean(parsed.tutorialDone)
      };
    } catch (error) {
      return fallback;
    }
  }

  function saveMeta() {
    try {
      window.localStorage.setItem(SAVE_KEY, JSON.stringify(meta));
    } catch (error) {
      /* Storage is an optional enhancement. */
    }
  }

  function createBoard() {
    const board = new Map();
    for (let q = -GRID_RADIUS; q <= GRID_RADIUS; q += 1) {
      const rMin = Math.max(-GRID_RADIUS, -q - GRID_RADIUS);
      const rMax = Math.min(GRID_RADIUS, -q + GRID_RADIUS);
      for (let r = rMin; r <= rMax; r += 1) {
        const baseHeight = clamp(3 - r, 0, 6);
        const key = keyFor(q, r);
        board.set(key, {
          key,
          q,
          r,
          baseHeight,
          height: baseHeight,
          kind: 'plain',
          rotation: 0,
          placed: 0,
          flash: 0
        });
      }
    }
    const spring = board.get(keyFor(0, -3));
    spring.kind = 'spring';
    const delta = board.get(keyFor(0, 3));
    delta.kind = 'delta';
    return board;
  }

  function random() {
    let x = state.rngSeed | 0;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    state.rngSeed = x | 0;
    return ((x >>> 0) % 1000000) / 1000000;
  }

  function rollFxTier() {
    const total = FX_TIERS.reduce(function (sum, value) { return sum + value; }, 0);
    let value = random() * total;
    for (let index = 0; index < FX_TIERS.length; index += 1) {
      value -= FX_TIERS[index];
      if (value < 0) return index;
    }
    return 0;
  }

  function drawTile() {
    const roll = random();
    if (roll < 0.31) return 'forest';
    if (roll < 0.57) return 'mill';
    if (roll < 0.82) return 'slope';
    return 'gate';
  }

  function makeHand(stormIndex) {
    if (stormIndex === 1) return ['forest', 'mill', 'slope'];
    return ['forest', 'mill', drawTile()];
  }

  function startRun() {
    state = {
      mode: 'BUILD',
      paused: false,
      helpOpen: false,
      workshopOpen: false,
      muted: false,
      previewVisible: true,
      tool: 'place',
      selectedSlot: 0,
      rotation: 0,
      hoverKey: null,
      rngSeed: 0x6d2b79f5,
      board: createBoard(),
      hand: ['forest', 'mill', 'slope'],
      preview: { path: [], reachedDelta: false },
      flow: null,
      particles: [],
      popups: [],
      toastTime: 0,
      uiTick: 0,
      coachStep: meta.tutorialDone ? 4 : 0,
      score: 0,
      combo: 0,
      placementsLeft: 3 + meta.upgrades.survey,
      tntLeft: 2 + meta.upgrades.powder,
      integrity: 3,
      storm: {
        index: 1,
        target: CONTRACTS[0].target,
        name: CONTRACTS[0].name,
        value: 0,
        timeLeft: PLAN_SECONDS,
        outcome: null
      },
      stats: {
        tilesPlaced: 0,
        tntUsed: 0,
        releaseCount: 0,
        successfulStorms: 0,
        failedStorms: 0,
        totalValue: 0
      },
      run: {
        gameOver: false,
        complete: false,
        reason: ''
      }
    };

    dom.resultOverlay.hidden = true;
    dom.pauseOverlay.hidden = true;
    dom.helpOverlay.hidden = true;
    setupStorm(1, true);
    rebuildBoardAccess();
    showToast('Storm one is live — place a Forest on the cyan route.');
    syncDom(true);
    render();
  }

  function setupStorm(index, firstRun) {
    const contract = CONTRACTS[index - 1];
    state.mode = 'BUILD';
    state.tool = 'place';
    state.selectedSlot = 0;
    state.rotation = 0;
    state.previewVisible = true;
    state.flow = null;
    state.combo = 0;
    state.placementsLeft = 3 + meta.upgrades.survey;
    state.storm = {
      index,
      target: contract.target,
      name: contract.name,
      value: 0,
      timeLeft: PLAN_SECONDS,
      outcome: null
    };
    state.hand = makeHand(index);
    if (firstRun) state.hand = ['forest', 'mill', 'slope'];
    computePreview();
    accessDirty = true;
    syncDom(true);
  }

  function getCell(q, r) {
    return state.board.get(keyFor(q, r));
  }

  function getNeighbor(cell, direction) {
    const dir = DIRS[direction];
    return getCell(cell.q + dir.q, cell.r + dir.r);
  }

  function computePreview() {
    const start = getCell(0, -3);
    const path = [];
    const visited = new Set();
    let current = start;
    let reachedDelta = false;

    while (current && path.length < state.board.size) {
      path.push(current.key);
      visited.add(current.key);
      if (current.kind === 'delta') {
        reachedDelta = true;
        break;
      }

      let next = null;
      const type = TILE_TYPES[current.kind];
      if (type && type.directional) {
        const forced = getNeighbor(current, current.rotation);
        if (forced && !visited.has(forced.key) && forced.height <= current.height) next = forced;
      }

      if (!next) {
        const candidates = [];
        for (let priorityIndex = 0; priorityIndex < FLOW_DIRECTION_PRIORITY.length; priorityIndex += 1) {
          const direction = FLOW_DIRECTION_PRIORITY[priorityIndex];
          const neighbor = getNeighbor(current, direction);
          if (!neighbor || visited.has(neighbor.key) || neighbor.height > current.height) continue;
          const deltaBias = Math.abs(neighbor.q) * 0.05;
          candidates.push({ cell: neighbor, score: neighbor.height * 10 + priorityIndex * 0.1 + deltaBias });
        }
        candidates.sort(function (a, b) { return a.score - b.score; });
        next = candidates.length ? candidates[0].cell : null;
      }
      current = next;
    }

    state.preview = { path, reachedDelta };
  }

  function isInteractionBlocked() {
    return state.paused || state.helpOpen || state.workshopOpen || hiddenByDocument;
  }

  function handleCellAction(cellKey) {
    ensureAudio();
    if (state.mode !== 'BUILD' || isInteractionBlocked()) return;
    const cell = state.board.get(cellKey);
    if (!cell) return;
    if (cell.kind === 'spring' || cell.kind === 'delta') {
      showToast('The spring and delta anchors cannot be changed.');
      playSound('deny');
      return;
    }

    if (state.tool === 'tnt') {
      blastCell(cell);
      return;
    }

    if (state.placementsLeft <= 0) {
      showToast('No placements left — release the storm.');
      playSound('deny');
      return;
    }

    const tileKind = state.hand[state.selectedSlot];
    const tile = TILE_TYPES[tileKind];
    if (!tile) return;
    if (cell.height + tile.height > 9) {
      showToast('That stack is already too tall.');
      playSound('deny');
      return;
    }

    cell.height += tile.height;
    cell.kind = tileKind;
    cell.rotation = state.rotation;
    cell.placed += 1;
    cell.flash = 1;
    state.placementsLeft -= 1;
    state.stats.tilesPlaced += 1;
    state.hand[state.selectedSlot] = drawTile();
    state.tool = 'place';
    computePreview();
    accessDirty = true;

    const center = centerForCell(cell);
    spawnParticles(center.x, center.y, tile.color, 7 + rollFxTier() * 2);
    playSound('place');

    if (state.coachStep === 0) {
      state.coachStep = 1;
      showToast('Forest ready. Select the Mill and place it downstream.');
    } else if (state.coachStep === 1) {
      state.coachStep = 2;
      showToast('Route updated. Rotate terrain or release the storm.');
    } else {
      showToast(tile.name + ' placed. Cyan arrows recalculated.');
    }
    syncDom(true);
    render();
  }

  function blastCell(cell) {
    if (state.tntLeft <= 0) {
      state.tool = 'place';
      showToast('The powder crate is empty.');
      playSound('deny');
      syncDom(true);
      return;
    }

    const changedStructure = cell.kind !== 'plain';
    const changedHeight = cell.height > 0;
    if (!changedStructure && !changedHeight) {
      showToast('Nothing left to blast on that hex.');
      playSound('deny');
      return;
    }

    cell.kind = 'plain';
    cell.rotation = 0;
    cell.height = Math.max(0, cell.height - 1);
    cell.flash = 1.4;
    state.tntLeft -= 1;
    state.stats.tntUsed += 1;
    state.tool = state.tntLeft > 0 ? 'tnt' : 'place';
    computePreview();
    accessDirty = true;

    const center = centerForCell(cell);
    spawnParticles(center.x, center.y, '#f57b32', 18);
    spawnPopup(center.x, center.y - view.size * .4, '−1 HEIGHT', '#ffcf72');
    playSound('blast');
    showToast('Timberbomb! Terrain lowered and flow recalculated.');
    syncDom(true);
    render();
  }

  function selectHand(slot) {
    ensureAudio();
    if (state.mode !== 'BUILD' || isInteractionBlocked()) return;
    state.selectedSlot = clamp(slot, 0, 2);
    state.tool = 'place';
    state.rotation = 0;
    playSound('select');
    syncDom(true);
    render();
  }

  function rotateSelection() {
    ensureAudio();
    if (state.mode !== 'BUILD' || isInteractionBlocked()) return;
    state.rotation = (state.rotation + 1) % 6;
    state.tool = 'place';
    playSound('rotate');
    showToast('Direction: ' + DIRS[state.rotation].label + '.');
    syncDom(true);
    render();
  }

  function toggleTnt() {
    ensureAudio();
    if (state.mode !== 'BUILD' || isInteractionBlocked()) return;
    if (state.tntLeft <= 0) {
      showToast('No TNT charges remain this run.');
      playSound('deny');
      return;
    }
    state.tool = state.tool === 'tnt' ? 'place' : 'tnt';
    playSound('select');
    showToast(state.tool === 'tnt' ? 'TNT armed. Tap terrain to lower it.' : 'TNT safely stowed.');
    syncDom(true);
    render();
  }

  function releaseStorm() {
    ensureAudio();
    if (state.mode !== 'BUILD' || isInteractionBlocked()) return;
    computePreview();
    state.mode = 'FLOW';
    state.stats.releaseCount += 1;
    state.tool = 'place';
    state.flow = {
      path: state.preview.path.slice(),
      elapsed: 0,
      progress: 0,
      crossedIndex: -1,
      durationPerCell: reducedMotionQuery.matches ? .24 : .42,
      carried: 0,
      combo: 0,
      logTokens: [],
      processedMills: 0
    };
    if (state.coachStep < 3) state.coachStep = 3;
    playSound('release');
    showToast(state.preview.reachedDelta ? 'Storm released — follow the log chain.' : 'Storm released — the route currently runs dry.');
    syncDom(true);
    render();
  }

  function processFlowCell(index) {
    const flow = state.flow;
    const cell = state.board.get(flow.path[index]);
    if (!cell) return;
    const center = centerForCell(cell);

    if (cell.kind === 'forest') {
      flow.carried += 2;
      flow.logTokens.push({ pathProgress: index, count: 2, wobble: random() * Math.PI * 2 });
      spawnParticles(center.x, center.y, '#b9df7b', 6);
      spawnPopup(center.x, center.y - view.size * .6, '+2 LOGS', '#fff0a2');
      playSound('logs');
    }

    if (cell.kind === 'mill' && flow.carried > 0) {
      flow.combo += 1;
      flow.processedMills += 1;
      const multiplier = flow.combo + meta.upgrades.wheel;
      const gained = flow.carried * multiplier;
      state.storm.value += gained;
      state.stats.totalValue += gained;
      state.score += gained * 100;
      state.combo = multiplier;
      spawnParticles(center.x, center.y, '#ffe47a', 10 + flow.combo * 2);
      spawnPopup(center.x, center.y - view.size * .7, '+' + gained + '  CHAIN ×' + multiplier, '#fff5a3');
      playSound('mill', flow.combo);
    }
  }

  function updateFlow(deltaSeconds) {
    const flow = state.flow;
    if (!flow) return;
    flow.elapsed += deltaSeconds;
    flow.progress = flow.elapsed / flow.durationPerCell;
    const maxCrossed = Math.min(flow.path.length - 1, Math.floor(flow.progress));
    while (flow.crossedIndex < maxCrossed) {
      flow.crossedIndex += 1;
      processFlowCell(flow.crossedIndex);
    }

    for (let index = 0; index < flow.logTokens.length; index += 1) {
      const log = flow.logTokens[index];
      const waterLimit = Math.max(log.pathProgress, flow.progress - .22);
      log.pathProgress = Math.min(waterLimit, log.pathProgress + deltaSeconds / flow.durationPerCell * .82);
    }

    if (flow.elapsed >= flow.path.length * flow.durationPerCell + .7) finalizeStorm();
  }

  function finalizeStorm() {
    if (state.mode !== 'FLOW') return;
    const success = state.storm.value >= state.storm.target;
    state.storm.outcome = success ? 'success' : 'miss';
    if (success) {
      state.stats.successfulStorms += 1;
      meta.tokens += 2 + Math.floor((state.storm.index - 1) / 3);
    } else {
      state.stats.failedStorms += 1;
      state.integrity -= 1;
      meta.tokens += 1;
    }
    meta.tutorialDone = true;
    state.coachStep = 4;
    saveMeta();

    if (state.integrity <= 0) {
      state.mode = 'GAMEOVER';
      state.run.gameOver = true;
      state.run.reason = 'The levee failed after three missed timber contracts.';
    } else if (state.storm.index >= MAX_STORMS) {
      state.mode = 'COMPLETE';
      state.run.complete = true;
      state.run.reason = 'All eight restoration contracts survived the delta storms.';
    } else {
      state.mode = 'RESULT';
    }

    configureResultOverlay();
    dom.resultOverlay.hidden = false;
    accessDirty = true;
    playSound(success ? 'success' : 'fail');
    syncDom(true);
    render();
  }

  function continueFromResult() {
    ensureAudio();
    if (state.workshopOpen) {
      state.workshopOpen = false;
      dom.resultOverlay.hidden = true;
      syncDom(true);
      return;
    }
    if (state.mode !== 'RESULT') return;
    dom.resultOverlay.hidden = true;
    setupStorm(state.storm.index + 1, false);
    showToast('Storm ' + state.storm.index + ' rolling in. Build the next chain.');
    playSound('select');
    render();
  }

  function openWorkshop() {
    ensureAudio();
    if (state.mode === 'FLOW' || state.mode === 'GAMEOVER' || state.mode === 'COMPLETE') return;
    state.workshopOpen = true;
    dom.resultKicker.textContent = 'Riverside workshop';
    dom.resultTitle.textContent = 'Restore tools for the next run';
    dom.resultCopy.textContent = 'Spend rivets banked from storm contracts. Every upgrade is saved locally and changes future runs.';
    dom.resultValue.textContent = state.stats.totalValue;
    dom.resultTarget.textContent = state.storm.index + '/' + MAX_STORMS;
    dom.resultTokens.textContent = meta.tokens;
    dom.continueButton.textContent = 'Close workshop';
    dom.continueButton.hidden = false;
    dom.retryButton.hidden = true;
    syncUpgradeButtons();
    dom.resultOverlay.hidden = false;
    syncDom(true);
  }

  function configureResultOverlay() {
    const success = state.storm.outcome === 'success';
    dom.resultValue.textContent = state.storm.value;
    dom.resultTarget.textContent = state.storm.target;
    dom.resultTokens.textContent = meta.tokens;
    dom.continueButton.hidden = state.mode !== 'RESULT';
    dom.retryButton.hidden = state.mode === 'RESULT';

    if (state.mode === 'GAMEOVER') {
      dom.resultKicker.textContent = 'Levee lost · restoration continues';
      dom.resultTitle.textContent = 'The town took the flood';
      dom.resultCopy.textContent = state.run.reason + ' Rivets and workshop upgrades remain for the next attempt.';
      dom.retryButton.textContent = 'Rebuild the delta';
    } else if (state.mode === 'COMPLETE') {
      dom.resultKicker.textContent = 'Eight storms cleared';
      dom.resultTitle.textContent = 'Delta restored';
      dom.resultCopy.textContent = 'The timber chain rebuilt every crossing. Spend the final rivets, then shape a stronger watershed.';
      dom.retryButton.textContent = 'Start a new contract';
    } else if (success) {
      dom.resultKicker.textContent = 'Contract complete';
      dom.resultTitle.textContent = 'Mill chain delivered';
      dom.resultCopy.textContent = 'Value ' + state.storm.value + ' cleared the ' + state.storm.target + '-point contract. The next storm asks more of the same river.';
      dom.continueButton.textContent = 'Next storm';
    } else {
      dom.resultKicker.textContent = 'Contract missed · levee damaged';
      dom.resultTitle.textContent = 'The logs ran thin';
      dom.resultCopy.textContent = 'Value ' + state.storm.value + ' missed the ' + state.storm.target + '-point contract. ' + state.integrity + ' levee sections remain.';
      dom.continueButton.textContent = 'Brace for next storm';
    }
    syncUpgradeButtons();
  }

  function upgradeCost(id) {
    const level = meta.upgrades[id];
    return UPGRADE_DEFS[id].baseCost + level * UPGRADE_DEFS[id].baseCost;
  }

  function buyUpgrade(id) {
    ensureAudio();
    const definition = UPGRADE_DEFS[id];
    if (!definition) return;
    const level = meta.upgrades[id];
    const cost = upgradeCost(id);
    if (level >= definition.max) {
      showToast(definition.label + ' is fully restored.');
      playSound('deny');
      return;
    }
    if (meta.tokens < cost) {
      showToast('Need ' + cost + ' rivets for ' + definition.label + '.');
      playSound('deny');
      return;
    }
    meta.tokens -= cost;
    meta.upgrades[id] += 1;
    saveMeta();
    playSound('upgrade');
    showToast(definition.label + ' restored to level ' + meta.upgrades[id] + '.');
    syncUpgradeButtons();
    syncDom(true);
  }

  function syncUpgradeButtons() {
    dom.upgradeButtons.forEach(function (button) {
      const id = button.dataset.upgrade;
      const definition = UPGRADE_DEFS[id];
      const level = meta.upgrades[id];
      const cost = upgradeCost(id);
      const effect = button.querySelector('.upgrade-effect');
      const costNode = button.querySelector('.upgrade-cost');
      effect.textContent = id === 'survey' ? '+' + (level + 1) + ' total extra placement' : id === 'powder' ? '+' + (level + 1) + ' total extra TNT' : '+' + (level + 1) + ' value per mill';
      costNode.textContent = level >= definition.max ? 'Restored · level ' + level : cost + ' rivets · level ' + level;
      button.disabled = level >= definition.max || meta.tokens < cost;
      button.setAttribute('aria-label', definition.label + ', level ' + level + (level >= definition.max ? ', fully restored' : ', costs ' + cost + ' rivets'));
    });
  }

  function showToast(message) {
    dom.toast.textContent = message;
    dom.toast.classList.add('is-visible');
    state.toastTime = 1.9;
  }

  function spawnParticles(x, y, color, count) {
    const amount = reducedMotionQuery.matches ? Math.min(4, count) : count;
    for (let index = 0; index < amount; index += 1) {
      const angle = random() * Math.PI * 2;
      const speed = 22 + random() * 58;
      state.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 16,
        life: .45 + random() * .5,
        maxLife: .95,
        size: 2 + random() * 4,
        color
      });
    }
  }

  function spawnPopup(x, y, text, color) {
    state.popups.push({ x, y, text, color, life: 1.1, maxLife: 1.1 });
  }

  function updateEffects(deltaSeconds) {
    for (let index = state.particles.length - 1; index >= 0; index -= 1) {
      const particle = state.particles[index];
      particle.life -= deltaSeconds;
      if (particle.life <= 0) {
        state.particles.splice(index, 1);
        continue;
      }
      particle.x += particle.vx * deltaSeconds;
      particle.y += particle.vy * deltaSeconds;
      particle.vy += 86 * deltaSeconds;
      particle.vx *= Math.pow(.18, deltaSeconds);
    }
    for (let index = state.popups.length - 1; index >= 0; index -= 1) {
      const popup = state.popups[index];
      popup.life -= deltaSeconds;
      popup.y -= deltaSeconds * 20;
      if (popup.life <= 0) state.popups.splice(index, 1);
    }
    state.board.forEach(function (cell) {
      cell.flash = Math.max(0, cell.flash - deltaSeconds * 2.8);
    });
  }

  function update(deltaSeconds) {
    if (!state || isInteractionBlocked()) return;
    const delta = clamp(deltaSeconds, 0, .1);
    if (state.mode === 'BUILD') {
      state.storm.timeLeft = Math.max(0, state.storm.timeLeft - delta);
      if (state.storm.timeLeft <= 0) releaseStorm();
    } else if (state.mode === 'FLOW') {
      updateFlow(delta);
    }
    updateEffects(delta);
    if (state.toastTime > 0) {
      state.toastTime -= delta;
      if (state.toastTime <= 0) dom.toast.classList.remove('is-visible');
    }
    state.uiTick += delta;
    if (state.uiTick >= .1) {
      state.uiTick = 0;
      syncDom(false);
    }
  }

  function formatTimer(seconds) {
    const total = Math.max(0, Math.ceil(seconds));
    const minutes = Math.floor(total / 60);
    return String(minutes).padStart(2, '0') + ':' + String(total % 60).padStart(2, '0');
  }

  function syncDom(force) {
    if (!state) return;
    const phaseNames = { BUILD: 'Plan', FLOW: 'Storm', RESULT: 'Result', GAMEOVER: 'Failed', COMPLETE: 'Complete' };
    dom.hudStorm.textContent = state.storm.index + '/' + MAX_STORMS;
    dom.hudPhase.textContent = phaseNames[state.mode] || state.mode;
    dom.hudScore.textContent = String(state.score).padStart(4, '0');
    dom.hudCombo.textContent = 'Chain ×' + Math.max(1, state.combo);
    dom.hudIntegrity.textContent = '♥ '.repeat(state.integrity).trim() || '—';
    dom.hudTokens.textContent = meta.tokens + ' rivets';
    dom.contractName.textContent = state.storm.name;
    dom.timerValue.textContent = formatTimer(state.storm.timeLeft);
    dom.valueCurrent.textContent = state.storm.value;
    dom.valueTarget.textContent = state.storm.target;
    dom.contractFill.style.inlineSize = clamp(state.storm.value / state.storm.target * 100, 0, 100) + '%';
    dom.placementsValue.textContent = state.placementsLeft;
    dom.tntValue.textContent = state.tntLeft;
    dom.rotationValue.textContent = state.rotation * 60 + '°';
    dom.workshopTokens.textContent = meta.tokens + ' ◆';

    dom.phaseRibbon.dataset.phase = state.mode;
    if (state.mode === 'BUILD') dom.phaseLabel.textContent = state.tool === 'tnt' ? 'TNT armed · choose terrain' : state.preview.reachedDelta ? 'Flow preview reaches delta' : 'Flow preview runs dry';
    if (state.mode === 'FLOW') dom.phaseLabel.textContent = 'Stormwater in motion';
    if (state.mode === 'RESULT') dom.phaseLabel.textContent = 'Contract result';
    if (state.mode === 'GAMEOVER') dom.phaseLabel.textContent = 'Levee failed';
    if (state.mode === 'COMPLETE') dom.phaseLabel.textContent = 'Delta restored';

    dom.tntButton.setAttribute('aria-pressed', String(state.tool === 'tnt'));
    dom.previewButton.setAttribute('aria-pressed', String(state.previewVisible));
    dom.muteButton.setAttribute('aria-pressed', String(state.muted));
    dom.rotateButton.disabled = state.mode !== 'BUILD' || isInteractionBlocked();
    dom.tntButton.disabled = state.mode !== 'BUILD' || state.tntLeft <= 0 || isInteractionBlocked();
    dom.previewButton.disabled = state.mode === 'FLOW' || isInteractionBlocked();
    dom.releaseButton.disabled = state.mode !== 'BUILD' || isInteractionBlocked();

    dom.handButtons.forEach(function (button, index) {
      const tile = TILE_TYPES[state.hand[index]];
      if (force) {
        button.querySelector('.tile-icon').textContent = tile.icon;
        button.querySelector('.tile-name').textContent = tile.name;
        button.querySelector('.tile-effect').textContent = tile.effect;
        button.setAttribute('aria-label', 'Slot ' + (index + 1) + ': ' + tile.name + '. ' + tile.effect);
      }
      button.setAttribute('aria-pressed', String(state.selectedSlot === index && state.tool === 'place'));
      button.disabled = state.mode !== 'BUILD' || state.placementsLeft <= 0 || isInteractionBlocked();
    });

    if (state.coachStep === 0 && state.mode === 'BUILD') {
      dom.coach.hidden = false;
      dom.coach.innerHTML = '<strong>1 · Place Forest.</strong> Tap the pulsing hex in the preview path.';
    } else if (state.coachStep === 1 && state.mode === 'BUILD') {
      dom.coach.hidden = false;
      dom.coach.innerHTML = '<strong>2 · Add a Mill.</strong> Choose slot 2 and place it farther down the cyan route.';
    } else if (state.coachStep === 2 && state.mode === 'BUILD') {
      dom.coach.hidden = false;
      dom.coach.innerHTML = '<strong>3 · Read the arrows.</strong> Rotate with R or release with Space when the chain is ready.';
    } else if (state.coachStep === 3 && state.mode === 'FLOW') {
      dom.coach.hidden = false;
      dom.coach.innerHTML = '<strong>Storm live.</strong> Forests load timber; every downstream mill raises the visible combo.';
    } else {
      dom.coach.hidden = true;
    }

    syncUpgradeButtons();
    if (accessDirty) positionBoardAccess();
  }

  function rebuildBoardAccess() {
    while (boardAccess.firstChild) boardAccess.removeChild(boardAccess.firstChild);
    state.board.forEach(function (cell) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'hex-hit';
      button.dataset.cell = cell.key;
      button.setAttribute('aria-describedby', 'board-description');
      button.addEventListener('pointerenter', function () {
        state.hoverKey = cell.key;
        render();
      });
      button.addEventListener('pointerleave', function () {
        if (state.hoverKey === cell.key) state.hoverKey = null;
        render();
      });
      button.addEventListener('focus', function () {
        state.hoverKey = cell.key;
        render();
      });
      button.addEventListener('blur', function () {
        if (state.hoverKey === cell.key) state.hoverKey = null;
        render();
      });
      button.addEventListener('click', function (event) {
        event.preventDefault();
        handleCellAction(cell.key);
      });
      boardAccess.appendChild(button);
    });
    accessDirty = true;
  }

  function positionBoardAccess() {
    if (!state || !view.centers.size) return;
    const buttons = boardAccess.querySelectorAll('.hex-hit');
    buttons.forEach(function (button) {
      const cell = state.board.get(button.dataset.cell);
      const center = centerForCell(cell);
      button.style.left = center.x + 'px';
      button.style.top = center.y + 'px';
      button.disabled = state.mode !== 'BUILD' || isInteractionBlocked();
      const action = state.tool === 'tnt' ? 'Blast' : 'Place ' + TILE_TYPES[state.hand[state.selectedSlot]].name + ' on';
      const kind = cell.kind === 'plain' ? 'empty terrain' : cell.kind;
      button.setAttribute('aria-label', action + ' axial hex q ' + cell.q + ', r ' + cell.r + ', height ' + cell.height + ', ' + kind);
    });
    accessDirty = false;
  }

  function centerForCell(cell) {
    const cached = view.centers.get(cell.key);
    if (cached) return cached;
    return {
      x: view.originX + Math.sqrt(3) * view.size * (cell.q + cell.r / 2),
      y: view.originY + 1.5 * view.size * cell.r - cell.height * view.stackStep
    };
  }

  function computeLayout() {
    view.centers.clear();
    view.size = clamp(Math.min(view.width / 12.1, (view.height - 70) / 11.5), 21, 57);
    view.stackStep = view.size * .115;
    view.originX = view.width * .5;
    view.originY = view.height * .5 + view.size * .1;
    state.board.forEach(function (cell) {
      view.centers.set(cell.key, {
        x: view.originX + Math.sqrt(3) * view.size * (cell.q + cell.r / 2),
        y: view.originY + 1.5 * view.size * cell.r - cell.height * view.stackStep
      });
    });
    accessDirty = true;
  }

  function resizeCanvas() {
    resizeQueued = false;
    const rect = frame.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    const nextDpr = clamp(window.devicePixelRatio || 1, 1, 2);
    const pixelWidth = Math.max(1, Math.round(rect.width * nextDpr));
    const pixelHeight = Math.max(1, Math.round(rect.height * nextDpr));
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    canvasDpr = nextDpr;
    view.width = rect.width;
    view.height = rect.height;
    computeLayout();
    render();
    positionBoardAccess();
  }

  function queueResize() {
    if (resizeQueued) return;
    resizeQueued = true;
    window.requestAnimationFrame(resizeCanvas);
  }

  function drawRoundedRect(context, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    context.beginPath();
    context.moveTo(x + r, y);
    context.lineTo(x + width - r, y);
    context.quadraticCurveTo(x + width, y, x + width, y + r);
    context.lineTo(x + width, y + height - r);
    context.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    context.lineTo(x + r, y + height);
    context.quadraticCurveTo(x, y + height, x, y + height - r);
    context.lineTo(x, y + r);
    context.quadraticCurveTo(x, y, x + r, y);
    context.closePath();
  }

  function hexPoints(x, y, size) {
    const points = [];
    for (let index = 0; index < 6; index += 1) {
      const angle = (-30 + index * 60) * Math.PI / 180;
      points.push({ x: x + Math.cos(angle) * size, y: y + Math.sin(angle) * size });
    }
    return points;
  }

  function tracePolygon(points) {
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let index = 1; index < points.length; index += 1) ctx.lineTo(points[index].x, points[index].y);
    ctx.closePath();
  }

  function colorForCell(cell) {
    if (cell.kind === 'spring') return '#55d7d5';
    if (cell.kind === 'delta') return '#69c9a4';
    if (TILE_TYPES[cell.kind]) return TILE_TYPES[cell.kind].color;
    const options = ['#ae814c', '#a47643', '#b38a55', '#9c7243'];
    const index = Math.abs(cell.q * 7 + cell.r * 11) % options.length;
    return options[index];
  }

  function shadeColor(hex, amount) {
    const value = parseInt(hex.slice(1), 16);
    const r = clamp((value >> 16) + amount, 0, 255);
    const g = clamp(((value >> 8) & 255) + amount, 0, 255);
    const b = clamp((value & 255) + amount, 0, 255);
    return '#' + ((1 << 24) + (Math.round(r) << 16) + (Math.round(g) << 8) + Math.round(b)).toString(16).slice(1);
  }

  function drawBackground() {
    ctx.fillStyle = '#825331';
    ctx.fillRect(0, 0, view.width, view.height);
    const plankHeight = Math.max(58, view.height / 7);
    for (let row = 0; row < Math.ceil(view.height / plankHeight); row += 1) {
      const y = row * plankHeight;
      ctx.fillStyle = row % 2 ? 'rgba(255,229,177,.028)' : 'rgba(45,24,14,.035)';
      ctx.fillRect(0, y, view.width, plankHeight);
      ctx.strokeStyle = 'rgba(47,25,15,.22)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(view.width, y);
      ctx.stroke();
    }
    ctx.lineWidth = 1;
    for (let index = 0; index < 18; index += 1) {
      const y = (index * 47 + 23) % Math.max(1, view.height);
      const bend = 5 + index % 4 * 2;
      ctx.strokeStyle = 'rgba(255,225,173,.055)';
      ctx.beginPath();
      ctx.moveTo(-20, y);
      ctx.bezierCurveTo(view.width * .28, y - bend, view.width * .7, y + bend, view.width + 20, y - 2);
      ctx.stroke();
    }

    ctx.save();
    ctx.translate(view.width / 2, view.height / 2 + view.size * .65);
    ctx.scale(1, .56);
    ctx.fillStyle = 'rgba(39,22,14,.3)';
    ctx.beginPath();
    ctx.arc(0, view.size * .4, view.size * 5.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawPrism(cell) {
    const center = centerForCell(cell);
    const size = view.size * .93;
    const top = hexPoints(center.x, center.y, size);
    const depth = Math.max(view.stackStep * .6, cell.height * view.stackStep + view.stackStep * .8);
    const baseColor = colorForCell(cell);

    ctx.fillStyle = shadeColor(baseColor, -38);
    tracePolygon([top[0], top[1], { x: top[1].x, y: top[1].y + depth }, { x: top[0].x, y: top[0].y + depth }]);
    ctx.fill();
    ctx.fillStyle = shadeColor(baseColor, -24);
    tracePolygon([top[1], top[2], { x: top[2].x, y: top[2].y + depth }, { x: top[1].x, y: top[1].y + depth }]);
    ctx.fill();
    ctx.fillStyle = shadeColor(baseColor, -30);
    tracePolygon([top[2], top[3], { x: top[3].x, y: top[3].y + depth }, { x: top[2].x, y: top[2].y + depth }]);
    ctx.fill();

    if (cell.height > 0) {
      ctx.strokeStyle = 'rgba(55,31,18,.22)';
      ctx.lineWidth = Math.max(1, view.size * .025);
      for (let level = 1; level <= cell.height; level += 1) {
        const yOffset = level * view.stackStep;
        ctx.beginPath();
        ctx.moveTo(top[0].x, top[0].y + yOffset);
        ctx.lineTo(top[1].x, top[1].y + yOffset);
        ctx.lineTo(top[2].x, top[2].y + yOffset);
        ctx.lineTo(top[3].x, top[3].y + yOffset);
        ctx.stroke();
      }
    }

    ctx.fillStyle = cell.flash > 0 ? shadeColor(baseColor, 24 * Math.min(1, cell.flash)) : baseColor;
    tracePolygon(top);
    ctx.fill();
    ctx.strokeStyle = 'rgba(51,30,18,.58)';
    ctx.lineWidth = Math.max(1, view.size * .045);
    ctx.stroke();

    const inset = hexPoints(center.x, center.y, size * .78);
    ctx.strokeStyle = 'rgba(255,239,199,.12)';
    ctx.lineWidth = 1;
    tracePolygon(inset);
    ctx.stroke();

    drawHeightPeg(cell, center, size);
  }

  function drawHeightPeg(cell, center, size) {
    const x = center.x - size * .62;
    const y = center.y + size * .27;
    ctx.fillStyle = 'rgba(51,30,18,.7)';
    ctx.beginPath();
    ctx.arc(x, y, Math.max(5, view.size * .14), 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff0c7';
    ctx.font = '800 ' + Math.max(8, view.size * .19) + 'px ui-rounded, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(cell.height, x, y + .4);
  }

  function drawTree(center, scale, variant) {
    ctx.save();
    ctx.translate(center.x, center.y - scale * .08);
    const offset = (variant - 1) * scale * .22;
    ctx.translate(offset, variant % 2 ? -scale * .06 : scale * .04);
    ctx.fillStyle = '#5b3922';
    drawRoundedRect(ctx, -scale * .055, scale * .05, scale * .11, scale * .3, scale * .03);
    ctx.fill();
    ctx.fillStyle = variant === 0 ? '#345e35' : variant === 1 ? '#477a3d' : '#5c8c45';
    ctx.beginPath();
    ctx.arc(0, -scale * .12, scale * .24, 0, Math.PI * 2);
    ctx.arc(-scale * .13, scale * .01, scale * .2, 0, Math.PI * 2);
    ctx.arc(scale * .14, scale * .02, scale * .19, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(225,244,169,.25)';
    ctx.beginPath();
    ctx.arc(-scale * .07, -scale * .18, scale * .09, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawMill(cell, center) {
    const scale = view.size;
    ctx.save();
    ctx.translate(center.x, center.y - scale * .12);
    ctx.fillStyle = '#f0cf83';
    drawRoundedRect(ctx, -scale * .27, -scale * .16, scale * .48, scale * .42, scale * .05);
    ctx.fill();
    ctx.fillStyle = '#75472a';
    ctx.beginPath();
    ctx.moveTo(-scale * .33, -scale * .15);
    ctx.lineTo(-scale * .03, -scale * .43);
    ctx.lineTo(scale * .28, -scale * .15);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#56331f';
    drawRoundedRect(ctx, -scale * .08, scale * .04, scale * .16, scale * .22, scale * .025);
    ctx.fill();

    const wheelX = scale * .28;
    const wheelY = scale * .05;
    const rotation = state.mode === 'FLOW' ? state.flow.elapsed * 4 : 0;
    ctx.translate(wheelX, wheelY);
    ctx.rotate(rotation);
    ctx.strokeStyle = '#75472a';
    ctx.lineWidth = Math.max(2, scale * .06);
    ctx.beginPath();
    ctx.arc(0, 0, scale * .23, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = Math.max(1, scale * .035);
    for (let index = 0; index < 6; index += 1) {
      const angle = index * Math.PI / 3;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(angle) * scale * .23, Math.sin(angle) * scale * .23);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawDirectionArrow(center, direction, color, lengthScale) {
    const angle = direction * Math.PI / 3;
    const length = view.size * lengthScale;
    const startX = center.x - Math.cos(angle) * length * .16;
    const startY = center.y - Math.sin(angle) * length * .16;
    const endX = center.x + Math.cos(angle) * length;
    const endY = center.y + Math.sin(angle) * length;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = Math.max(2, view.size * .055);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();
    ctx.save();
    ctx.translate(endX, endY);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(view.size * .16, 0);
    ctx.lineTo(-view.size * .08, -view.size * .1);
    ctx.lineTo(-view.size * .08, view.size * .1);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawStructure(cell) {
    const center = centerForCell(cell);
    const scale = view.size;
    if (cell.kind === 'forest') {
      drawTree(center, scale, 0);
      drawTree(center, scale * .82, 1);
      drawTree(center, scale * .74, 2);
    } else if (cell.kind === 'mill') {
      drawMill(cell, center);
    } else if (cell.kind === 'slope') {
      ctx.strokeStyle = 'rgba(92,48,24,.48)';
      ctx.lineWidth = Math.max(1, scale * .035);
      for (let index = 0; index < 3; index += 1) {
        ctx.beginPath();
        ctx.arc(center.x, center.y + scale * .2, scale * (.25 + index * .13), Math.PI * 1.15, Math.PI * 1.85);
        ctx.stroke();
      }
      drawDirectionArrow(center, cell.rotation, '#6f3823', .46);
    } else if (cell.kind === 'gate') {
      ctx.save();
      ctx.translate(center.x, center.y - scale * .05);
      ctx.rotate(cell.rotation * Math.PI / 3);
      ctx.fillStyle = '#754529';
      drawRoundedRect(ctx, -scale * .43, -scale * .1, scale * .86, scale * .2, scale * .04);
      ctx.fill();
      ctx.fillStyle = '#d69442';
      drawRoundedRect(ctx, -scale * .09, -scale * .18, scale * .18, scale * .36, scale * .035);
      ctx.fill();
      ctx.restore();
      drawDirectionArrow(center, cell.rotation, '#ffe1a0', .4);
    } else if (cell.kind === 'spring') {
      ctx.fillStyle = 'rgba(220,255,246,.72)';
      ctx.beginPath();
      ctx.ellipse(center.x, center.y, scale * .46, scale * .28, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#177e88';
      ctx.lineWidth = Math.max(2, scale * .05);
      ctx.stroke();
      ctx.fillStyle = '#f5d794';
      ctx.beginPath();
      ctx.moveTo(center.x - scale * .2, center.y - scale * .1);
      ctx.lineTo(center.x, center.y - scale * .58);
      ctx.lineTo(center.x + scale * .2, center.y - scale * .1);
      ctx.closePath();
      ctx.fill();
      drawCanvasLabel('SPRING', center.x, center.y - scale * .8, scale * .18, '#fff3c9');
    } else if (cell.kind === 'delta') {
      ctx.fillStyle = '#f4d889';
      for (let index = -1; index <= 1; index += 1) {
        const x = center.x + index * scale * .27;
        const y = center.y + Math.abs(index) * scale * .06;
        drawRoundedRect(ctx, x - scale * .11, y - scale * .17, scale * .22, scale * .28, scale * .035);
        ctx.fill();
        ctx.fillStyle = index === 0 ? '#9e4d35' : '#6e6f3e';
        ctx.beginPath();
        ctx.moveTo(x - scale * .15, y - scale * .16);
        ctx.lineTo(x, y - scale * .35);
        ctx.lineTo(x + scale * .15, y - scale * .16);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#f4d889';
      }
      drawCanvasLabel('DELTA', center.x, center.y + scale * .65, scale * .18, '#fff3c9');
    }
  }

  function drawCanvasLabel(text, x, y, size, color) {
    ctx.font = '900 ' + Math.max(8, size) + 'px ui-rounded, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = Math.max(2, size * .25);
    ctx.strokeStyle = 'rgba(45,27,18,.72)';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  function drawRoute() {
    if (!state.previewVisible && state.mode === 'BUILD') return;
    const path = state.mode === 'FLOW' && state.flow ? state.flow.path : state.preview.path;
    if (!path || path.length < 1) return;
    const actualProgress = state.mode === 'FLOW' && state.flow ? clamp(state.flow.progress, 0, path.length - 1) : path.length - 1;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const waterGradient = ctx.createLinearGradient(0, 0, view.width, view.height);
    waterGradient.addColorStop(0, state.mode === 'FLOW' ? '#74f4eb' : 'rgba(111,239,232,.72)');
    waterGradient.addColorStop(1, state.mode === 'FLOW' ? '#2ac1d0' : 'rgba(42,193,208,.58)');
    ctx.strokeStyle = waterGradient;
    ctx.lineWidth = Math.max(5, view.size * (state.mode === 'FLOW' ? .24 : .14));
    if (state.mode === 'BUILD') ctx.setLineDash([view.size * .3, view.size * .2]);
    ctx.beginPath();
    for (let index = 0; index <= Math.floor(actualProgress); index += 1) {
      const cell = state.board.get(path[index]);
      const center = centerForCell(cell);
      if (index === 0) ctx.moveTo(center.x, center.y);
      else ctx.lineTo(center.x, center.y);
    }
    const whole = Math.floor(actualProgress);
    const fraction = actualProgress - whole;
    if (fraction > 0 && whole < path.length - 1) {
      const from = centerForCell(state.board.get(path[whole]));
      const to = centerForCell(state.board.get(path[whole + 1]));
      ctx.lineTo(lerp(from.x, to.x, fraction), lerp(from.y, to.y, fraction));
    }
    ctx.stroke();
    ctx.setLineDash([]);

    const wetCount = state.mode === 'FLOW' ? Math.min(path.length, Math.floor(actualProgress) + 1) : path.length;
    for (let index = 0; index < wetCount; index += 1) {
      const center = centerForCell(state.board.get(path[index]));
      const points = hexPoints(center.x, center.y, view.size * .76);
      ctx.fillStyle = state.mode === 'FLOW' ? 'rgba(92,235,232,.34)' : 'rgba(85,219,216,.16)';
      tracePolygon(points);
      ctx.fill();
    }

    if (state.mode === 'BUILD') {
      for (let index = 0; index < path.length - 1; index += 1) {
        const from = centerForCell(state.board.get(path[index]));
        const to = centerForCell(state.board.get(path[index + 1]));
        const x = lerp(from.x, to.x, .55);
        const y = lerp(from.y, to.y, .55);
        const angle = Math.atan2(to.y - from.y, to.x - from.x);
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);
        ctx.fillStyle = '#e7ffff';
        ctx.beginPath();
        ctx.moveTo(view.size * .13, 0);
        ctx.lineTo(-view.size * .09, -view.size * .09);
        ctx.lineTo(-view.size * .09, view.size * .09);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }
    ctx.restore();
  }

  function interpolatePath(path, progress) {
    if (!path.length) return { x: 0, y: 0, angle: 0 };
    const bounded = clamp(progress, 0, path.length - 1);
    const index = Math.min(path.length - 1, Math.floor(bounded));
    const nextIndex = Math.min(path.length - 1, index + 1);
    const fraction = bounded - index;
    const from = centerForCell(state.board.get(path[index]));
    const to = centerForCell(state.board.get(path[nextIndex]));
    return { x: lerp(from.x, to.x, fraction), y: lerp(from.y, to.y, fraction), angle: Math.atan2(to.y - from.y, to.x - from.x) };
  }

  function drawLogs() {
    if (state.mode !== 'FLOW' || !state.flow) return;
    state.flow.logTokens.forEach(function (log, index) {
      const point = interpolatePath(state.flow.path, log.pathProgress - index * .06);
      ctx.save();
      ctx.translate(point.x, point.y - view.size * .04 + Math.sin(log.wobble + state.flow.elapsed * 6) * view.size * .035);
      ctx.rotate(point.angle + .14 * Math.sin(log.wobble));
      ctx.fillStyle = '#774329';
      drawRoundedRect(ctx, -view.size * .26, -view.size * .08, view.size * .52, view.size * .16, view.size * .07);
      ctx.fill();
      ctx.strokeStyle = '#d39150';
      ctx.lineWidth = Math.max(1, view.size * .025);
      ctx.beginPath();
      ctx.arc(-view.size * .2, 0, view.size * .055, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#fff1b0';
      ctx.beginPath();
      ctx.arc(view.size * .22, -view.size * .12, view.size * .12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#3f2718';
      ctx.font = '900 ' + Math.max(8, view.size * .16) + 'px ui-rounded, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(log.count, view.size * .22, -view.size * .115);
      ctx.restore();
    });
  }

  function drawHover() {
    if (!state.hoverKey || state.mode !== 'BUILD') return;
    const cell = state.board.get(state.hoverKey);
    if (!cell) return;
    const center = centerForCell(cell);
    ctx.save();
    ctx.strokeStyle = state.tool === 'tnt' ? '#ff8b39' : '#fff4a2';
    ctx.lineWidth = Math.max(2, view.size * .075);
    ctx.setLineDash(state.tool === 'tnt' ? [view.size * .16, view.size * .11] : []);
    tracePolygon(hexPoints(center.x, center.y, view.size * 1.01));
    ctx.stroke();
    if (state.tool === 'tnt' && cell.kind !== 'spring' && cell.kind !== 'delta') {
      ctx.fillStyle = '#f36b2d';
      drawRoundedRect(ctx, center.x - view.size * .13, center.y - view.size * .2, view.size * .26, view.size * .4, view.size * .05);
      ctx.fill();
      ctx.strokeStyle = '#ffe28c';
      ctx.lineWidth = Math.max(1, view.size * .035);
      ctx.beginPath();
      ctx.moveTo(center.x, center.y - view.size * .2);
      ctx.quadraticCurveTo(center.x + view.size * .2, center.y - view.size * .34, center.x + view.size * .25, center.y - view.size * .22);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawRecommendedPulse() {
    if (state.coachStep > 1 || state.mode !== 'BUILD') return;
    const key = state.coachStep === 0 ? keyFor(0, -2) : keyFor(0, -1);
    const cell = state.board.get(key);
    if (!cell) return;
    const center = centerForCell(cell);
    const pulse = reducedMotionQuery.matches ? .35 : (Math.sin(performance.now() / 260) + 1) / 2;
    ctx.strokeStyle = 'rgba(255,247,153,' + (.55 + pulse * .4) + ')';
    ctx.lineWidth = Math.max(2, view.size * .07);
    ctx.beginPath();
    ctx.arc(center.x, center.y, view.size * (.76 + pulse * .12), 0, Math.PI * 2);
    ctx.stroke();
  }

  function drawEffects() {
    state.particles.forEach(function (particle) {
      ctx.globalAlpha = clamp(particle.life / particle.maxLife, 0, 1);
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
    state.popups.forEach(function (popup) {
      ctx.globalAlpha = clamp(popup.life / popup.maxLife, 0, 1);
      drawCanvasLabel(popup.text, popup.x, popup.y, clamp(view.size * .22, 9, 15), popup.color);
    });
    ctx.globalAlpha = 1;
  }

  function render() {
    if (!state || view.width <= 0 || view.height <= 0) return;
    ctx.setTransform(canvasDpr, 0, 0, canvasDpr, 0, 0);
    ctx.clearRect(0, 0, view.width, view.height);
    drawBackground();

    const cells = Array.from(state.board.values()).sort(function (a, b) {
      const ay = centerForCell(a).y + a.height * view.stackStep;
      const by = centerForCell(b).y + b.height * view.stackStep;
      return ay - by || a.q - b.q;
    });
    cells.forEach(drawPrism);
    drawRoute();
    cells.forEach(drawStructure);
    drawLogs();
    drawHover();
    drawRecommendedPulse();
    drawEffects();
  }

  function ensureAudio() {
    if (state && state.muted) return;
    const AudioConstructor = window.AudioContext || window.webkitAudioContext;
    if (!AudioConstructor) return;
    if (!audioContext) audioContext = new AudioConstructor();
    if (audioContext.state === 'suspended') audioContext.resume().catch(function () {});
  }

  function playSound(kind, combo) {
    if (!state || state.muted) return;
    ensureAudio();
    if (!audioContext) return;
    const settings = {
      select: [330, .04, 'sine', .025],
      rotate: [420, .06, 'triangle', .03],
      place: [250, .09, 'triangle', .045],
      blast: [95, .18, 'sawtooth', .065],
      release: [180, .2, 'sine', .045],
      logs: [390, .08, 'triangle', .04],
      mill: [520 + (combo || 0) * 90, .12, 'triangle', .05],
      success: [690, .28, 'sine', .055],
      fail: [145, .24, 'sawtooth', .045],
      deny: [120, .06, 'square', .025],
      upgrade: [780, .24, 'sine', .055]
    };
    const values = settings[kind] || settings.select;
    const tier = rollFxTier();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const now = audioContext.currentTime;
    oscillator.type = values[2];
    oscillator.frequency.setValueAtTime(values[0] * (1 + (random() - .5) * .035 + tier * .008), now);
    if (kind === 'blast') oscillator.frequency.exponentialRampToValueAtTime(48, now + values[1]);
    if (kind === 'success' || kind === 'upgrade') oscillator.frequency.exponentialRampToValueAtTime(values[0] * 1.5, now + values[1]);
    gain.gain.setValueAtTime(.0001, now);
    gain.gain.exponentialRampToValueAtTime(values[3], now + .01);
    gain.gain.exponentialRampToValueAtTime(.0001, now + values[1]);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + values[1] + .02);
  }

  function togglePause(forceOpen) {
    ensureAudio();
    if (state.mode === 'GAMEOVER' || state.mode === 'COMPLETE' || state.helpOpen || state.workshopOpen) return;
    const shouldPause = typeof forceOpen === 'boolean' ? forceOpen : !state.paused;
    state.paused = shouldPause;
    dom.pauseOverlay.hidden = !shouldPause;
    dom.pauseButton.setAttribute('aria-label', shouldPause ? 'Resume game' : 'Pause game');
    accessDirty = true;
    syncDom(true);
    render();
  }

  function openHelp() {
    ensureAudio();
    if (state.helpOpen) return;
    state.helpOpen = true;
    dom.helpOverlay.hidden = false;
    accessDirty = true;
    syncDom(true);
  }

  function closeHelp() {
    state.helpOpen = false;
    dom.helpOverlay.hidden = true;
    accessDirty = true;
    syncDom(true);
    render();
  }

  function toggleMute() {
    state.muted = !state.muted;
    dom.muteButton.setAttribute('aria-label', state.muted ? 'Unmute sound' : 'Mute sound');
    syncDom(true);
    if (!state.muted) playSound('select');
  }

  function toggleFullscreen() {
    ensureAudio();
    const promise = document.fullscreenElement ? document.exitFullscreen() : frame.requestFullscreen();
    if (promise && typeof promise.catch === 'function') promise.catch(function () {});
  }

  function handleKeydown(event) {
    if (event.repeat) return;
    const target = event.target;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
    ensureAudio();
    const key = event.key.toLowerCase();
    if (key === 'f') {
      event.preventDefault();
      toggleFullscreen();
      return;
    }
    if (key === 'm') {
      event.preventDefault();
      toggleMute();
      return;
    }
    if (key === 'p') {
      event.preventDefault();
      togglePause();
      return;
    }
    if (key === 'h' || key === '?') {
      event.preventDefault();
      if (state.helpOpen) closeHelp(); else openHelp();
      return;
    }
    if (state.helpOpen || state.paused || state.workshopOpen) return;
    if (key === '1' || key === '2' || key === '3') {
      event.preventDefault();
      selectHand(Number(key) - 1);
    } else if (key === 'r') {
      event.preventDefault();
      rotateSelection();
    } else if (key === 'b') {
      event.preventDefault();
      toggleTnt();
    } else if (event.code === 'Space') {
      event.preventDefault();
      releaseStorm();
    } else if (key === 'enter' && state.mode === 'RESULT') {
      event.preventDefault();
      continueFromResult();
    }
  }

  function renderGameToText() {
    const selectedTile = TILE_TYPES[state.hand[state.selectedSlot]];
    const boardState = Array.from(state.board.values()).map(function (cell) {
      return {
        q: cell.q,
        r: cell.r,
        height: cell.height,
        kind: cell.kind,
        rotation: TILE_TYPES[cell.kind] && TILE_TYPES[cell.kind].directional ? cell.rotation : null,
        wetPreview: state.preview.path.indexOf(cell.key) >= 0
      };
    });
    return JSON.stringify({
      coordinateSystem: 'Axial hex coordinates: q increases east, r increases southeast. Spring is (0,-3), delta is (0,3). Canvas x increases right and y increases down. Rotation 0=east then clockwise in 60 degree steps.',
      mode: state.mode,
      paused: state.paused,
      storm: {
        index: state.storm.index,
        max: MAX_STORMS,
        name: state.storm.name,
        target: state.storm.target,
        value: state.storm.value,
        timeLeftSeconds: Number(state.storm.timeLeft.toFixed(2)),
        outcome: state.storm.outcome
      },
      resources: {
        placementsLeft: state.placementsLeft,
        tntLeft: state.tntLeft,
        score: state.score,
        workshopRivets: meta.tokens
      },
      selection: {
        slot: state.selectedSlot,
        tile: selectedTile.name,
        tileKind: state.hand[state.selectedSlot],
        rotation: state.rotation,
        rotationDirection: DIRS[state.rotation].label,
        tool: state.tool,
        previewVisible: state.previewVisible
      },
      hand: state.hand.map(function (kind, index) { return { slot: index, kind, name: TILE_TYPES[kind].name }; }),
      preview: {
        path: state.preview.path,
        predictedWetCells: state.preview.path.length,
        reachedDelta: state.preview.reachedDelta
      },
      flow: state.flow ? {
        active: state.mode === 'FLOW',
        progress: Number(state.flow.progress.toFixed(2)),
        carriedLogs: state.flow.carried,
        millCombo: state.flow.combo,
        processedMills: state.flow.processedMills
      } : { active: false, progress: 0, carriedLogs: 0, millCombo: 0, processedMills: 0 },
      run: {
        integrity: state.integrity,
        gameOver: state.run.gameOver,
        complete: state.run.complete,
        reason: state.run.reason
      },
      stats: {
        tilesPlaced: state.stats.tilesPlaced,
        tntUsed: state.stats.tntUsed,
        releaseCount: state.stats.releaseCount,
        successfulStorms: state.stats.successfulStorms,
        failedStorms: state.stats.failedStorms,
        totalValue: state.stats.totalValue
      },
      meta: {
        saveVersion: meta.version,
        tokens: meta.tokens,
        upgrades: meta.upgrades
      },
      board: boardState,
      controls: 'Tap/click a tile then a hex. Keyboard 1-3 select, R rotates, B arms TNT, Space releases, P pauses, M mutes, F fullscreen, H help.'
    });
  }

  function advanceTime(milliseconds) {
    const total = clamp(Number(milliseconds) || 0, 0, 600000);
    const step = 1 / 60;
    const steps = Math.ceil(total / (1000 / 60));
    for (let index = 0; index < steps; index += 1) update(step);
    syncDom(true);
    render();
    return renderGameToText();
  }

  function frameLoop(timestamp) {
    if (hiddenByDocument) return;
    if (!previousFrameTime) previousFrameTime = timestamp;
    const deltaSeconds = Math.min(.1, (timestamp - previousFrameTime) / 1000);
    previousFrameTime = timestamp;
    update(deltaSeconds);
    render();
    animationFrame = window.requestAnimationFrame(frameLoop);
  }

  dom.handButtons.forEach(function (button, index) {
    button.addEventListener('click', function () { selectHand(index); });
  });
  dom.rotateButton.addEventListener('click', rotateSelection);
  dom.tntButton.addEventListener('click', toggleTnt);
  dom.previewButton.addEventListener('click', function () {
    ensureAudio();
    state.previewVisible = !state.previewVisible;
    playSound('select');
    syncDom(true);
    render();
  });
  dom.releaseButton.addEventListener('click', releaseStorm);
  dom.helpButton.addEventListener('click', openHelp);
  dom.helpCloseButton.addEventListener('click', closeHelp);
  dom.muteButton.addEventListener('click', toggleMute);
  dom.pauseButton.addEventListener('click', function () { togglePause(); });
  dom.resumeButton.addEventListener('click', function () { togglePause(false); });
  dom.restartButton.addEventListener('click', startRun);
  dom.fullscreenButton.addEventListener('click', toggleFullscreen);
  dom.workshopButton.addEventListener('click', openWorkshop);
  dom.continueButton.addEventListener('click', continueFromResult);
  dom.retryButton.addEventListener('click', startRun);
  dom.upgradeButtons.forEach(function (button) {
    button.addEventListener('click', function () { buyUpgrade(button.dataset.upgrade); });
  });
  canvas.addEventListener('contextmenu', function (event) { event.preventDefault(); });
  document.addEventListener('keydown', handleKeydown);
  document.addEventListener('fullscreenchange', queueResize);
  document.addEventListener('visibilitychange', function () {
    hiddenByDocument = document.hidden;
    if (hiddenByDocument) {
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      animationFrame = 0;
      previousFrameTime = 0;
    } else if (!animationFrame) {
      previousFrameTime = 0;
      animationFrame = window.requestAnimationFrame(frameLoop);
    }
  });
  window.addEventListener('resize', queueResize, { passive: true });
  reducedMotionQuery.addEventListener('change', render);

  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(queueResize);
    const supportsDevicePixels = typeof ResizeObserverEntry !== 'undefined' && 'devicePixelContentBoxSize' in ResizeObserverEntry.prototype;
    try {
      resizeObserver.observe(frame, supportsDevicePixels ? { box: 'device-pixel-content-box' } : undefined);
    } catch (error) {
      resizeObserver.observe(frame);
    }
  }

  window.render_game_to_text = renderGameToText;
  window.advanceTime = advanceTime;

  startRun();
  resizeCanvas();
  animationFrame = window.requestAnimationFrame(frameLoop);
}());
