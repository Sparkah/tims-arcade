(function () {
  'use strict';

  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d', { alpha: false });
  var dpr = 1;
  var view = { w: 0, h: 0 };
  var now = performance.now();
  var buttons = [];
  var tutorialButton = null;
  var lastPointer = { x: 0, y: 0 };
  var backgroundReady = false;

  var bg = new Image();
  bg.onload = function () {
    backgroundReady = true;
  };
  bg.src = './art/bee_rpg_visual_target_v1.png';

  var C = {
    ink: '#22313a',
    muted: '#6a5e47',
    paper: '#f6edcf',
    paper2: '#fff7de',
    line: '#5c4a2c',
    honey: '#f5b833',
    honeyDark: '#ba7619',
    leaf: '#4b9d5c',
    leafDark: '#2f6f42',
    water: '#75a9cc',
    dark: '#17222a',
    red: '#a94c32',
    locked: '#c9bb92',
    shadow: 'rgba(31, 28, 18, 0.18)'
  };

  var regions = [
    {
      id: 'clover',
      name: 'Clover Patch',
      short: 'Clover',
      bees: 1,
      time: 2600,
      open: function () { return state.routeOpen; },
      reward: { nectar: 3, wax: 1, pollen: 2, twigs: 1 },
      note: 'First safe loop: nectar, wax, and pollen.'
    },
    {
      id: 'patio',
      name: 'Patio Cracks',
      short: 'Patio',
      bees: 2,
      time: 3200,
      open: function () { return state.patioOpen; },
      reward: { nectar: 2, wax: 2, paper: 1, caps: 1 },
      note: 'A wider search for paper scraps and bottle caps.'
    },
    {
      id: 'hose',
      name: 'Hose Coil',
      short: 'Hose',
      bees: 3,
      time: 4200,
      open: function () { return state.trips >= 3; },
      reward: { nectar: 2, wax: 1, dew: 2, twigs: 2 },
      note: 'Needs a bigger camp and calmer bees.'
    },
    {
      id: 'shed',
      name: 'Shed Door',
      short: 'Shed',
      bees: 4,
      time: 5200,
      open: function () { return state.trips >= 5; },
      reward: { nectar: 1, wax: 3, paper: 2, caps: 2 },
      note: 'Late route with better craft materials.'
    }
  ];

  var state = null;
  resetGame();

  function resetGame() {
    state = {
      nectar: 6,
      wax: 1,
      pollen: 0,
      twigs: 2,
      paper: 0,
      caps: 0,
      dew: 0,
      bees: 1,
      capacity: 4,
      beesOut: 0,
      comb: 0,
      perch: 0,
      routeOpen: false,
      workshopOpen: false,
      patioOpen: false,
      selected: 'clover',
      mode: 'hub',
      expedition: null,
      lastLoot: null,
      trips: 0,
      cloverSent: false,
      patioSent: false,
      tutorialStep: 0,
      tutorialDone: false,
      message: 'Everything is closed. Follow the first card.',
      messageUntil: performance.now() + 2600,
      pulse: 0
    };
    advanceTutorial();
  }

  function resize() {
    dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    view.w = Math.max(320, Math.floor(window.innerWidth));
    view.h = Math.max(520, Math.floor(window.innerHeight));
    canvas.width = Math.floor(view.w * dpr);
    canvas.height = Math.floor(view.h * dpr);
    canvas.style.width = view.w + 'px';
    canvas.style.height = view.h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  window.addEventListener('resize', resize);
  resize();

  function region(id) {
    for (var i = 0; i < regions.length; i += 1) {
      if (regions[i].id === id) return regions[i];
    }
    return regions[0];
  }

  function currentRegion() {
    return region(state.selected);
  }

  function availableBees() {
    return Math.max(0, state.bees - state.beesOut);
  }

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function has(cost) {
    var keys = Object.keys(cost);
    for (var i = 0; i < keys.length; i += 1) {
      if ((state[keys[i]] || 0) < cost[keys[i]]) return false;
    }
    return true;
  }

  function pay(cost) {
    if (!has(cost)) return false;
    var keys = Object.keys(cost);
    for (var i = 0; i < keys.length; i += 1) {
      state[keys[i]] -= cost[keys[i]];
    }
    return true;
  }

  function addLoot(loot) {
    var keys = Object.keys(loot);
    for (var i = 0; i < keys.length; i += 1) {
      state[keys[i]] = (state[keys[i]] || 0) + loot[keys[i]];
    }
  }

  function setMessage(text, ms) {
    state.message = text;
    state.messageUntil = now + (ms || 2200);
  }

  function lureBee() {
    if (state.bees >= state.capacity) {
      setMessage('The jar is full. Build comb before luring more bees.');
      return false;
    }
    var cost = state.tutorialDone ? Math.max(2, state.bees) : (state.bees === 1 ? 1 : 2);
    if (state.nectar < cost) {
      setMessage('Need more nectar before another bee follows the jar.');
      return false;
    }
    state.nectar -= cost;
    state.bees += 1;
    if (state.bees >= 2) state.routeOpen = true;
    setMessage('A bee joins the jar camp.');
    return true;
  }

  function sendExpedition(regionId) {
    var r = region(regionId);
    if (!r.open()) {
      setMessage('That route is still closed.');
      return false;
    }
    if (state.mode !== 'hub') {
      setMessage('The current expedition must finish first.');
      return false;
    }
    if (availableBees() < r.bees) {
      setMessage('Not enough bees are free for that route.');
      return false;
    }
    state.selected = r.id;
    state.mode = 'exploring';
    state.beesOut = r.bees;
    state.expedition = {
      region: r.id,
      timer: r.time,
      total: r.time
    };
    state.lastLoot = null;
    if (r.id === 'clover') state.cloverSent = true;
    if (r.id === 'patio') state.patioSent = true;
    setMessage(r.short + ' team is outside.');
    return true;
  }

  function prepareLoot() {
    if (!state.expedition || state.lastLoot) return;
    var r = region(state.expedition.region);
    state.lastLoot = {
      region: r.id,
      label: r.short,
      loot: Object.assign({}, r.reward)
    };
  }

  function returnLoot() {
    if (state.mode !== 'return' || !state.lastLoot) {
      setMessage('No bees are back yet.');
      return false;
    }
    addLoot(state.lastLoot.loot);
    state.trips += 1;
    state.mode = 'hub';
    state.beesOut = 0;
    state.expedition = null;
    if (state.trips >= 1) state.workshopOpen = true;
    if (state.trips >= 2) {
      state.patioOpen = true;
      state.routeOpen = true;
    }
    setMessage('Loot returned from ' + state.lastLoot.label + '.');
    state.lastLoot = null;
    return true;
  }

  function buildComb() {
    if (!state.workshopOpen) {
      setMessage('Workshop is still closed.');
      return false;
    }
    if (state.comb > 0) {
      setMessage('Comb is already built.');
      return false;
    }
    if (!pay({ wax: 1, pollen: 2, twigs: 1 })) {
      setMessage('Comb needs 1 wax, 2 pollen, and 1 twig.');
      return false;
    }
    state.comb = 1;
    state.capacity = 6;
    state.patioOpen = true;
    setMessage('Comb built. The jar can hold six bees.');
    return true;
  }

  function buildPerch() {
    if (!state.workshopOpen || state.perch > 0) return false;
    if (!pay({ wax: 2, paper: 1, caps: 1 })) {
      setMessage('Perch needs 2 wax, 1 paper, and 1 cap.');
      return false;
    }
    state.perch = 1;
    state.capacity += 2;
    setMessage('Perch built. More bees can rest.');
    return true;
  }

  function selectRegion(id) {
    var r = region(id);
    if (!r.open()) {
      setMessage(r.short + ' is still closed.');
      return false;
    }
    state.selected = id;
    setMessage(r.short + ' selected.');
    return true;
  }

  var TUTORIAL_TOTAL = 8;

  function stepDone(step) {
    if (step === 0) return state.bees >= 2;
    if (step === 1) return state.cloverSent || state.trips >= 1;
    if (step === 2) return state.trips >= 1;
    if (step === 3) return state.comb > 0;
    if (step === 4) return state.bees >= 3;
    if (step === 5) return state.selected === 'patio' || state.patioSent || state.trips >= 2;
    if (step === 6) return state.patioSent || state.trips >= 2;
    if (step === 7) return state.trips >= 2;
    return true;
  }

  function advanceTutorial() {
    var guard = 0;
    while (state.tutorialStep < TUTORIAL_TOTAL && stepDone(state.tutorialStep) && guard < 12) {
      state.tutorialStep += 1;
      guard += 1;
    }
    if (state.tutorialStep >= TUTORIAL_TOTAL && !state.tutorialDone) {
      state.tutorialDone = true;
      state.routeOpen = true;
      state.workshopOpen = true;
      state.patioOpen = true;
      setMessage('Tutorial complete. The camp is open.');
    }
  }

  function currentTutorial() {
    if (state.tutorialDone) return null;
    var step = state.tutorialStep;
    if (step === 0) {
      return {
        title: 'Lure second bee',
        body: 'The whole camp is closed. Spend one nectar so a second bee follows the jar.',
        cta: 'LURE BEE',
        action: 'lure',
        opens: 'Route book opens after this.'
      };
    }
    if (step === 1) {
      return {
        title: 'Send Clover',
        body: 'The route book is the only open panel. Send one bee to the clover patch.',
        cta: 'SEND CLOVER',
        action: 'sendClover',
        opens: 'Return loot before anything else opens.'
      };
    }
    if (step === 2) {
      if (state.mode === 'exploring') {
        return {
          title: 'Wait for return',
          body: 'Bees are outside. The modal keeps control until they come back with materials.',
          cta: 'WAIT ' + Math.ceil((state.expedition ? state.expedition.timer : 0) / 1000) + 'S',
          action: null,
          disabled: true,
          opens: 'Return button appears automatically.'
        };
      }
      return {
        title: 'Bring loot home',
        body: 'The bees are back. Take their clover loot to unlock the workshop.',
        cta: 'RETURN LOOT',
        action: 'returnLoot',
        disabled: state.mode !== 'return',
        opens: 'Workshop opens after this.'
      };
    }
    if (step === 3) {
      return {
        title: 'Build comb',
        body: 'Use the first loot to build a comb. This is the first nest upgrade.',
        cta: 'BUILD COMB',
        action: 'buildComb',
        disabled: !has({ wax: 1, pollen: 2, twigs: 1 }),
        opens: 'Bee capacity grows to six.'
      };
    }
    if (step === 4) {
      return {
        title: 'Lure a third bee',
        body: 'The nest is larger now. Add one more bee so the next route can work.',
        cta: 'LURE THIRD BEE',
        action: 'lure',
        disabled: state.bees >= state.capacity,
        opens: 'Two-bee routes become possible.'
      };
    }
    if (step === 5) {
      return {
        title: 'Open Patio route',
        body: 'A new backyard route is visible. Select Patio Cracks before sending bees.',
        cta: 'OPEN PATIO',
        action: 'openPatio',
        opens: 'Patio card becomes the active route.'
      };
    }
    if (step === 6) {
      return {
        title: 'Send Patio team',
        body: 'Patio needs two bees. Send them to look for paper scraps and bottle caps.',
        cta: 'SEND PATIO',
        action: 'sendPatio',
        disabled: availableBees() < 2 || state.mode !== 'hub',
        opens: 'Second return finishes the onboarding.'
      };
    }
    if (state.mode === 'exploring') {
      return {
        title: 'Wait for Patio',
        body: 'The two-bee team is searching the patio. Input stays blocked until return.',
        cta: 'WAIT ' + Math.ceil((state.expedition ? state.expedition.timer : 0) / 1000) + 'S',
        action: null,
        disabled: true,
        opens: 'Return loot when they come back.'
      };
    }
    return {
      title: 'Claim Patio loot',
      body: 'Return the second loot bundle. After this the full camp controls are yours.',
      cta: 'RETURN LOOT',
      action: 'returnLoot',
      disabled: state.mode !== 'return',
      opens: 'Tutorial disappears.'
    };
  }

  function performTutorialAction() {
    var t = currentTutorial();
    var ok = false;
    if (!t || t.disabled || !t.action) {
      setMessage('Wait for this tutorial step to become ready.');
      return;
    }
    if (t.action === 'lure') ok = lureBee();
    if (t.action === 'sendClover') ok = sendExpedition('clover');
    if (t.action === 'returnLoot') ok = returnLoot();
    if (t.action === 'buildComb') ok = buildComb();
    if (t.action === 'openPatio') {
      state.patioOpen = true;
      ok = selectRegion('patio');
    }
    if (t.action === 'sendPatio') ok = sendExpedition('patio');
    if (ok) advanceTutorial();
  }

  function normalPrimaryAction() {
    if (state.mode === 'return') {
      returnLoot();
    } else if (state.mode === 'exploring') {
      setMessage('The expedition is still out.');
    } else if (availableBees() >= currentRegion().bees && currentRegion().open()) {
      sendExpedition(state.selected);
    } else {
      lureBee();
    }
    advanceTutorial();
  }

  function normalPrimaryLabel() {
    if (state.mode === 'return') return 'RETURN LOOT';
    if (state.mode === 'exploring') {
      return 'WAIT ' + Math.ceil((state.expedition ? state.expedition.timer : 0) / 1000) + 'S';
    }
    if (availableBees() >= currentRegion().bees && currentRegion().open()) {
      return 'SEND ' + currentRegion().short.toUpperCase();
    }
    if (state.bees < state.capacity) return 'LURE BEE';
    return 'BUILD MORE SPACE';
  }

  function update(dt) {
    state.pulse += dt / 1000;
    if (state.mode === 'exploring' && state.expedition) {
      state.expedition.timer = Math.max(0, state.expedition.timer - dt);
      if (state.expedition.timer <= 0) {
        state.mode = 'return';
        prepareLoot();
        setMessage('Bees are back. Return the loot.');
      }
    }
    advanceTutorial();
  }

  function layout() {
    var mobile = view.w < 720;
    var gap = mobile ? 8 : 14;
    var top = mobile ? 100 : 108;
    var bottom = 70;
    if (mobile) {
      var remaining = view.h - top - bottom - gap * 3;
      var stageH = clamp(Math.floor(remaining * 0.38), 142, 230);
      var panelH = Math.max(96, Math.floor((remaining - stageH - gap * 2) / 2));
      return {
        mobile: true,
        header: { x: 0, y: 0, w: view.w, h: 94 },
        stage: { x: 10, y: top, w: view.w - 20, h: stageH },
        route: { x: 10, y: top + stageH + gap, w: view.w - 20, h: panelH },
        workshop: { x: 10, y: top + stageH + gap + panelH + gap, w: view.w - 20, h: panelH },
        primary: { x: 12, y: view.h - 62, w: view.w - 24, h: 52 }
      };
    }
    var panelW = clamp(Math.floor(view.w * 0.34), 320, 430);
    var stageW = view.w - panelW - 56;
    var stageHDesktop = view.h - top - bottom - 10;
    return {
      mobile: false,
      header: { x: 0, y: 0, w: view.w, h: 100 },
      stage: { x: 20, y: top, w: stageW, h: stageHDesktop },
      route: { x: 34 + stageW, y: top, w: panelW, h: Math.floor((stageHDesktop - gap) * 0.55) },
      workshop: {
        x: 34 + stageW,
        y: top + Math.floor((stageHDesktop - gap) * 0.55) + gap,
        w: panelW,
        h: Math.ceil((stageHDesktop - gap) * 0.45)
      },
      primary: { x: 20, y: view.h - 62, w: stageW, h: 48 }
    };
  }

  function rr(x, y, w, h, r) {
    var radius = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  function fillRound(x, y, w, h, r, fill, stroke) {
    rr(x, y, w, h, r);
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  function drawText(text, x, y, size, weight, color, align) {
    ctx.fillStyle = color || C.ink;
    ctx.font = (weight || 600) + ' ' + size + 'px system-ui, -apple-system, Segoe UI, sans-serif';
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(text, x, y);
  }

  function drawWrap(text, x, y, maxW, lineH, size, weight, color, maxLines) {
    ctx.fillStyle = color || C.ink;
    ctx.font = (weight || 500) + ' ' + size + 'px system-ui, -apple-system, Segoe UI, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    var words = String(text).split(' ');
    var line = '';
    var lines = 0;
    for (var i = 0; i < words.length; i += 1) {
      var test = line ? line + ' ' + words[i] : words[i];
      if (ctx.measureText(test).width > maxW && line) {
        ctx.fillText(line, x, y + lines * lineH);
        lines += 1;
        line = words[i];
        if (maxLines && lines >= maxLines - 1) break;
      } else {
        line = test;
      }
    }
    if (line && (!maxLines || lines < maxLines)) {
      ctx.fillText(line, x, y + lines * lineH);
      lines += 1;
    }
    return lines;
  }

  function textWidth(text, size, weight) {
    ctx.font = (weight || 600) + ' ' + size + 'px system-ui, -apple-system, Segoe UI, sans-serif';
    return ctx.measureText(text).width;
  }

  function addButton(id, rect, label, disabled, onClick) {
    buttons.push({
      id: id,
      rect: rect,
      label: label,
      disabled: !!disabled,
      onClick: onClick
    });
  }

  function inside(rect, x, y) {
    return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
  }

  function drawButton(rect, label, fill, disabled) {
    fillRound(rect.x, rect.y, rect.w, rect.h, 8, disabled ? '#b9ad8c' : fill, disabled ? '#8d846f' : C.line);
    drawText(label, rect.x + rect.w / 2, rect.y + rect.h / 2 + 6, rect.h > 46 ? 17 : 14, 800, disabled ? '#f1ead6' : C.dark, 'center');
  }

  function drawHeader(l) {
    fillRound(0, 0, view.w, l.header.h, 0, C.paper2);
    ctx.fillStyle = 'rgba(92, 74, 44, 0.12)';
    ctx.fillRect(0, l.header.h - 2, view.w, 2);
    drawText('Bee Jar Camp', 18, 30, view.w < 520 ? 21 : 26, 850, C.ink);
    drawText('closed camp -> routes -> nest upgrades', 18, 52, view.w < 520 ? 11 : 13, 650, C.muted);

    var resetW = view.w < 440 ? 68 : 82;
    var resetRect = { x: view.w - resetW - 12, y: 16, w: resetW, h: 34 };
    fillRound(resetRect.x, resetRect.y, resetRect.w, resetRect.h, 8, '#eadfbf', C.line);
    drawText('RESET', resetRect.x + resetRect.w / 2, resetRect.y + 23, 12, 800, C.ink, 'center');
    addButton('reset', resetRect, 'RESET', false, function () { resetGame(); });
  }

  function drawResourceStrip(l) {
    var items = [
      ['bees', availableBees() + '/' + state.bees],
      ['nectar', state.nectar]
    ];
    if (state.workshopOpen) {
      items.push(['wax', state.wax]);
      items.push(['pollen', state.pollen]);
    }
    if (state.comb > 0 || state.trips >= 2) {
      items.push(['twigs', state.twigs]);
      items.push(['paper', state.paper]);
      items.push(['caps', state.caps]);
    }
    var x = l.mobile ? 10 : 20;
    var y = l.mobile ? 64 : 72;
    for (var i = 0; i < items.length; i += 1) {
      var label = items[i][0] + ' ' + items[i][1];
      var w = Math.max(64, textWidth(label, 12, 800) + 18);
      if (x + w > view.w - 10) break;
      fillRound(x, y, w, 24, 8, '#fff4d4', 'rgba(92, 74, 44, 0.28)');
      drawText(label, x + 9, y + 16, 12, 800, C.ink);
      x += w + 6;
    }
  }

  function drawCoverImage(rect) {
    if (!backgroundReady) {
      var grad = ctx.createLinearGradient(rect.x, rect.y, rect.x, rect.y + rect.h);
      grad.addColorStop(0, '#b7d98f');
      grad.addColorStop(0.5, '#e4cc7d');
      grad.addColorStop(1, '#947e4d');
      fillRound(rect.x, rect.y, rect.w, rect.h, 8, grad, C.line);
      return;
    }
    rr(rect.x, rect.y, rect.w, rect.h, 8);
    ctx.save();
    ctx.clip();
    var iw = bg.naturalWidth || bg.width;
    var ih = bg.naturalHeight || bg.height;
    var scale = Math.max(rect.w / iw, rect.h / ih);
    var dw = iw * scale;
    var dh = ih * scale;
    var dx = rect.x + (rect.w - dw) / 2;
    var dy = rect.y + (rect.h - dh) / 2;
    ctx.drawImage(bg, dx, dy, dw, dh);
    ctx.fillStyle = 'rgba(255, 246, 209, 0.08)';
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.restore();
    rr(rect.x, rect.y, rect.w, rect.h, 8);
    ctx.strokeStyle = C.line;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  function drawBee(x, y, s, angle) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.globalAlpha = 0.82;
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath();
    ctx.ellipse(-s * 0.35, -s * 0.55, s * 0.45, s * 0.25, -0.6, 0, Math.PI * 2);
    ctx.ellipse(s * 0.35, -s * 0.55, s * 0.45, s * 0.25, 0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#f0c93c';
    ctx.beginPath();
    ctx.ellipse(0, 0, s * 0.55, s * 0.38, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = C.dark;
    ctx.fillRect(-s * 0.12, -s * 0.34, s * 0.12, s * 0.68);
    ctx.fillRect(s * 0.17, -s * 0.28, s * 0.1, s * 0.56);
    ctx.restore();
  }

  function drawJarScene(rect) {
    drawCoverImage(rect);
    ctx.save();
    rr(rect.x, rect.y, rect.w, rect.h, 8);
    ctx.clip();
    var cx = rect.x + rect.w * 0.48;
    var cy = rect.y + rect.h * 0.58;
    var jarW = clamp(rect.w * 0.22, 72, 150);
    var jarH = clamp(rect.h * 0.28, 86, 150);

    ctx.fillStyle = 'rgba(255, 247, 221, 0.72)';
    ctx.strokeStyle = 'rgba(45, 53, 47, 0.7)';
    ctx.lineWidth = 3;
    fillRound(cx - jarW / 2, cy - jarH / 2, jarW, jarH, 18, 'rgba(255, 250, 226, 0.58)', 'rgba(45, 53, 47, 0.7)');
    fillRound(cx - jarW * 0.33, cy - jarH * 0.6, jarW * 0.66, jarH * 0.18, 10, '#c6b077', '#5f553d');
    drawText('JAR', cx, cy + jarH * 0.09, Math.max(14, jarW * 0.13), 900, 'rgba(34,49,58,0.6)', 'center');

    var combRows = state.comb > 0 ? 2 : 1;
    for (var r = 0; r < combRows; r += 1) {
      for (var c = 0; c < 4; c += 1) {
        var hx = cx - jarW * 0.28 + c * jarW * 0.18 + (r % 2) * jarW * 0.08;
        var hy = cy - jarH * 0.14 + r * jarH * 0.18;
        ctx.fillStyle = '#e6a936';
        ctx.beginPath();
        for (var k = 0; k < 6; k += 1) {
          var a = Math.PI / 3 * k + Math.PI / 6;
          var px = hx + Math.cos(a) * jarW * 0.07;
          var py = hy + Math.sin(a) * jarW * 0.07;
          if (k === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
      }
    }

    var total = state.bees;
    for (var i = 0; i < total; i += 1) {
      var out = i >= availableBees();
      var orbit = 0.75 + i * 0.2 + state.pulse * (out ? 1.1 : 0.7);
      var bx = cx + Math.cos(orbit) * (jarW * (out ? 0.75 : 0.47));
      var by = cy - jarH * 0.32 + Math.sin(orbit * 1.3) * (jarH * (out ? 0.36 : 0.25));
      if (out) {
        bx = rect.x + rect.w * (0.18 + (i % 3) * 0.22) + Math.cos(state.pulse + i) * 7;
        by = rect.y + rect.h * (0.24 + (i % 2) * 0.2) + Math.sin(state.pulse * 1.4 + i) * 7;
      }
      drawBee(bx, by, clamp(rect.w * 0.018, 9, 14), out ? -0.2 : 0.2);
    }

    if (!state.routeOpen) {
      fillRound(rect.x + 14, rect.y + 14, clamp(rect.w * 0.34, 120, 210), 48, 8, 'rgba(34, 49, 58, 0.72)');
      drawText('camp closed', rect.x + 28, rect.y + 43, 17, 850, '#fff2c4');
    } else {
      fillRound(rect.x + 14, rect.y + 14, clamp(rect.w * 0.42, 150, 260), 56, 8, 'rgba(255, 247, 222, 0.86)', C.line);
      drawText('route book open', rect.x + 28, rect.y + 42, 17, 850, C.ink);
      drawText(state.mode === 'hub' ? 'choose a place to search' : 'team is outside', rect.x + 28, rect.y + 61, 12, 700, C.muted);
    }

    if (state.mode === 'exploring' && state.expedition) {
      var prog = 1 - state.expedition.timer / state.expedition.total;
      var bar = { x: rect.x + 18, y: rect.y + rect.h - 38, w: rect.w - 36, h: 16 };
      fillRound(bar.x, bar.y, bar.w, bar.h, 8, 'rgba(255, 247, 222, 0.78)', C.line);
      fillRound(bar.x + 2, bar.y + 2, (bar.w - 4) * prog, bar.h - 4, 7, C.honey);
    }
    ctx.restore();
  }

  function drawPanel(rect, title, subtitle, isClosed) {
    fillRound(rect.x, rect.y, rect.w, rect.h, 8, isClosed ? '#d8cca8' : C.paper2, C.line);
    drawText(title, rect.x + 14, rect.y + 26, 17, 850, C.ink);
    if (subtitle) drawText(subtitle, rect.x + 14, rect.y + 45, 12, 700, C.muted);
    if (isClosed) {
      fillRound(rect.x + rect.w - 70, rect.y + 14, 52, 26, 8, '#b7a879', C.line);
      drawText('CLOSED', rect.x + rect.w - 44, rect.y + 32, 10, 900, C.dark, 'center');
    }
  }

  function drawRoutePanel(rect) {
    drawPanel(rect, 'Route Book', state.routeOpen ? 'Open routes appear one by one.' : 'Locked until a second bee joins.', !state.routeOpen);
    var gap = 8;
    var top = rect.y + 58;
    var cardH = Math.max(42, Math.floor((rect.h - 68 - gap) / 2));
    var cardW = Math.floor((rect.w - 28 - gap) / 2);
    for (var i = 0; i < regions.length; i += 1) {
      var r = regions[i];
      var col = i % 2;
      var row = Math.floor(i / 2);
      var cr = {
        x: rect.x + 14 + col * (cardW + gap),
        y: top + row * (cardH + gap),
        w: cardW,
        h: cardH
      };
      var open = !!r.open();
      var active = state.selected === r.id && open;
      fillRound(cr.x, cr.y, cr.w, cr.h, 8, open ? (active ? '#f8d470' : '#fff0c4') : '#c7bb95', active ? C.honeyDark : 'rgba(92,74,44,0.45)');
      drawText(open ? r.short : 'Closed', cr.x + 10, cr.y + 22, 13, 850, open ? C.ink : '#70674f');
      drawText(open ? r.bees + ' bee' + (r.bees > 1 ? 's' : '') : 'later', cr.x + 10, cr.y + 40, 11, 750, C.muted);
      if (state.routeOpen) {
        addButton('region:' + r.id, cr, r.short, !open, function (id) {
          return function () { selectRegion(id); };
        }(r.id));
      }
    }
  }

  function drawUpgradeCard(rect, title, subtitle, cost, built, disabled, click) {
    fillRound(rect.x, rect.y, rect.w, rect.h, 8, built ? '#d8efc2' : (disabled ? '#c7bb95' : '#fff0c4'), built ? C.leafDark : 'rgba(92,74,44,0.45)');
    drawText(title, rect.x + 10, rect.y + 22, 13, 850, disabled ? '#70674f' : C.ink);
    drawWrap(subtitle, rect.x + 10, rect.y + 41, rect.w - 20, 14, 11, 650, C.muted, 2);
    drawText(built ? 'BUILT' : cost, rect.x + rect.w - 10, rect.y + rect.h - 10, 10, 900, built ? C.leafDark : C.honeyDark, 'right');
    addButton('upgrade:' + title, rect, title, disabled || built, click);
  }

  function drawWorkshop(rect) {
    drawPanel(rect, 'Nest Workshop', state.workshopOpen ? 'Build physical changes to the jar.' : 'Locked until first loot returns.', !state.workshopOpen);
    var gap = 8;
    var top = rect.y + 58;
    var cardH = Math.max(45, Math.floor((rect.h - 68 - gap) / 2));
    var cardW = Math.floor((rect.w - 28 - gap) / 2);
    var cards = [
      {
        title: 'Comb',
        subtitle: '+2 capacity',
        cost: '1 wax 2 pollen 1 twig',
        built: state.comb > 0,
        disabled: !state.workshopOpen || !has({ wax: 1, pollen: 2, twigs: 1 }),
        click: buildComb
      },
      {
        title: 'Perch',
        subtitle: '+2 capacity',
        cost: '2 wax 1 paper 1 cap',
        built: state.perch > 0,
        disabled: !state.workshopOpen || state.trips < 2 || !has({ wax: 2, paper: 1, caps: 1 }),
        click: buildPerch
      },
      {
        title: 'Wax Gate',
        subtitle: 'future route',
        cost: 'closed',
        built: false,
        disabled: true,
        click: function () {}
      },
      {
        title: 'Scout Map',
        subtitle: 'future route',
        cost: 'closed',
        built: false,
        disabled: true,
        click: function () {}
      }
    ];
    for (var i = 0; i < cards.length; i += 1) {
      var col = i % 2;
      var row = Math.floor(i / 2);
      drawUpgradeCard({
        x: rect.x + 14 + col * (cardW + gap),
        y: top + row * (cardH + gap),
        w: cardW,
        h: cardH
      }, cards[i].title, cards[i].subtitle, cards[i].cost, cards[i].built, cards[i].disabled, cards[i].click);
    }
  }

  function drawPrimary(rect) {
    if (!state.tutorialDone) return;
    var disabled = state.mode === 'exploring';
    drawButton(rect, normalPrimaryLabel(), disabled ? '#c6b98f' : C.honey, disabled);
    addButton('primary', rect, normalPrimaryLabel(), disabled, normalPrimaryAction);

    var msg = state.messageUntil > now ? state.message : currentRegion().note;
    var shown = msg.length > 58 ? msg.slice(0, 55) + '...' : msg;
    var chipW = Math.min(rect.w, textWidth(shown, 12, 750) + 18);
    fillRound(rect.x, rect.y - 32, chipW, 23, 8, 'rgba(255, 247, 222, 0.92)', 'rgba(92, 74, 44, 0.22)');
    drawText(shown, rect.x + 9, rect.y - 16, view.w < 520 ? 11 : 12, 750, C.muted);
  }

  function drawLootToast() {
    if (state.mode !== 'return' || !state.lastLoot) return;
    var keys = Object.keys(state.lastLoot.loot);
    var text = state.lastLoot.label + ': ';
    for (var i = 0; i < keys.length; i += 1) {
      text += (i ? ', ' : '') + '+' + state.lastLoot.loot[keys[i]] + ' ' + keys[i];
    }
    var w = Math.min(view.w - 28, textWidth(text, 13, 800) + 28);
    var x = (view.w - w) / 2;
    fillRound(x, 84, w, 36, 8, '#fff0c4', C.line);
    drawText(text, x + w / 2, 107, 13, 850, C.ink, 'center');
  }

  function drawTutorialOverlay() {
    var t = currentTutorial();
    if (!t) return;
    ctx.fillStyle = 'rgba(23, 34, 42, 0.68)';
    ctx.fillRect(0, 0, view.w, view.h);

    var cardW = Math.min(view.w - 32, view.w < 560 ? view.w - 28 : 520);
    var cardH = view.w < 560 ? 286 : 268;
    var x = (view.w - cardW) / 2;
    var y = view.w < 560 ? Math.max(116, view.h - cardH - 24) : Math.floor((view.h - cardH) / 2);
    if (y + cardH > view.h - 12) y = view.h - cardH - 12;

    fillRound(x + 4, y + 8, cardW, cardH, 8, 'rgba(0, 0, 0, 0.18)');
    fillRound(x, y, cardW, cardH, 8, C.paper2, '#2e2416');

    var stepLabel = 'STEP ' + (state.tutorialStep + 1) + ' / ' + TUTORIAL_TOTAL;
    fillRound(x + 18, y + 18, 96, 26, 8, '#e7d4a2', C.line);
    drawText(stepLabel, x + 66, y + 36, 11, 900, C.ink, 'center');
    drawText('BLOCKING TUTORIAL', x + cardW - 18, y + 36, 11, 900, C.honeyDark, 'right');

    drawText(t.title, x + 18, y + 78, view.w < 420 ? 24 : 28, 900, C.ink);
    drawWrap(t.body, x + 18, y + 108, cardW - 36, 20, view.w < 420 ? 14 : 15, 650, C.ink, 3);

    var infoY = y + cardH - 102;
    fillRound(x + 18, infoY, cardW - 36, 34, 8, '#f4e2af', 'rgba(92,74,44,0.38)');
    drawText(t.opens, x + 30, infoY + 22, view.w < 420 ? 12 : 13, 750, C.muted);

    var bar = { x: x + 18, y: y + cardH - 58, w: cardW - 36, h: 8 };
    fillRound(bar.x, bar.y, bar.w, bar.h, 4, '#dfd2ac');
    fillRound(bar.x, bar.y, bar.w * ((state.tutorialStep + 1) / TUTORIAL_TOTAL), bar.h, 4, C.honey);

    var btn = { x: x + 18, y: y + cardH - 42, w: cardW - 36, h: 34 };
    tutorialButton = {
      rect: btn,
      label: t.cta,
      disabled: !!t.disabled
    };
    drawButton(btn, t.cta, C.honey, !!t.disabled);

  }

  function render() {
    buttons = [];
    tutorialButton = null;
    var l = layout();

    ctx.fillStyle = C.paper;
    ctx.fillRect(0, 0, view.w, view.h);
    drawHeader(l);
    drawResourceStrip(l);
    drawJarScene(l.stage);
    drawRoutePanel(l.route);
    drawWorkshop(l.workshop);
    drawPrimary(l.primary);
    drawLootToast();
    drawTutorialOverlay();
  }

  function pointerPos(ev) {
    var rect = canvas.getBoundingClientRect();
    return {
      x: ev.clientX - rect.left,
      y: ev.clientY - rect.top
    };
  }

  canvas.addEventListener('pointerdown', function (ev) {
    ev.preventDefault();
    var p = pointerPos(ev);
    lastPointer = p;

    if (!state.tutorialDone) {
      if (tutorialButton && inside(tutorialButton.rect, p.x, p.y)) {
        if (!tutorialButton.disabled) performTutorialAction();
        else setMessage('Wait for the bees to come back.');
      } else {
        setMessage('Tutorial is blocking the camp. Use the large button.');
      }
      render();
      return;
    }

    for (var i = buttons.length - 1; i >= 0; i -= 1) {
      var b = buttons[i];
      if (inside(b.rect, p.x, p.y)) {
        if (!b.disabled && b.onClick) b.onClick();
        else setMessage('That control is not ready yet.');
        render();
        return;
      }
    }
  }, { passive: false });

  window.addEventListener('keydown', function (ev) {
    if (!state.tutorialDone && (ev.key === 'Enter' || ev.key === ' ')) {
      ev.preventDefault();
      if (tutorialButton && !tutorialButton.disabled) performTutorialAction();
      return;
    }
    if (state.tutorialDone && ev.key.toLowerCase() === 'r') resetGame();
  });

  function frame(t) {
    var dt = Math.min(80, t - now);
    now = t;
    update(dt);
    render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  window.render_game_to_text = function () {
    var t = currentTutorial();
    return {
      title: 'Bee Jar Camp',
      mode: state.mode,
      tutorial: t ? {
        active: true,
        blocksInput: true,
        step: state.tutorialStep + 1,
        total: TUTORIAL_TOTAL,
        title: t.title,
        cta: t.cta,
        disabled: !!t.disabled,
        button: tutorialButton ? tutorialButton.rect : null
      } : {
        active: false,
        blocksInput: false,
        complete: true
      },
      resources: {
        bees: state.bees,
        freeBees: availableBees(),
        capacity: state.capacity,
        nectar: state.nectar,
        wax: state.wax,
        pollen: state.pollen,
        twigs: state.twigs,
        paper: state.paper,
        caps: state.caps
      },
      opened: {
        routeBook: state.routeOpen,
        workshop: state.workshopOpen,
        patio: state.patioOpen,
        combBuilt: state.comb > 0
      },
      selectedRoute: state.selected,
      trips: state.trips,
      lastLoot: state.lastLoot,
      message: state.messageUntil > now ? state.message : '',
      buttons: buttons.map(function (b) {
        return {
          id: b.id,
          label: b.label,
          disabled: b.disabled,
          rect: b.rect
        };
      })
    };
  };
}());
