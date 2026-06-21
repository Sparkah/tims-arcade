(function () {
  'use strict';

  var qs = new URLSearchParams(location.search);
  var DEBUG = qs.has('debug');
  var NO_HUD = qs.has('noui');
  var DIAG = qs.get('diag') || '';
  var LOGIC_ONLY = DIAG === 'logic' || DIAG === 'updateonly';
  var RENDER_ONLY = DIAG === 'render' || DIAG === 'renderonly';
  var START_MIN = clamp(parseFloat(qs.get('min') || (RENDER_ONLY ? '9' : '0')), 0, 60);
  var AUTO_START = START_MIN > 0 || RENDER_ONLY || qs.has('play') || qs.has('autoplay');
  var MAX_ENEMIES = clampInt(parseInt(qs.get('maxe') || '1400', 10), 200, 1800);
  var MAX_BULLETS = 160;
  var MAX_MOTES = 720;
  var MAX_PARTS = 2400;
  var MAX_DECALS = 640;
  var MAX_GORE = clampInt(parseInt(qs.get('gorecap') || '980', 10), 0, 1400);
  var MAX_SPLATS = clampInt(parseInt(qs.get('splatcap') || '320', 10), 0, 480);
  var MAX_BOOMS = clampInt(parseInt(qs.get('boomcap') || '34', 10), 0, 90);
  var MAX_BUBBLES = clampInt(parseInt(qs.get('bubblecap') || '48', 10), 0, 96);
  var MAX_VEINS = clampInt(parseInt(qs.get('veincap') || '130', 10), 0, 260);
  var MAX_LEECHES = clampInt(parseInt(qs.get('leechcap') || '9', 10), 0, 12);
  var DETAIL_MAX = clampInt(parseInt(qs.get('detail') || '360', 10), 0, 720);
  var MAX_INST = MAX_ENEMIES * 4 + MAX_BULLETS + MAX_MOTES + MAX_PARTS + MAX_DECALS + MAX_GORE * 2 + MAX_SPLATS * 3 + MAX_BOOMS * 8 + MAX_BUBBLES * 3 + MAX_VEINS * 6 + MAX_LEECHES * 10 + 640;
  var STEP = 1 / 60;
  var MAX_STEPS = 3;
  var INV_STRIDE = 12;
  var BASE_DPR = clamp(parseFloat(qs.get('dpr') || '1.25'), 0.75, 1.5);
  var OLD_SPRITES = qs.has('sprites') || qs.has('oldsprites');
  var OLD_ENV = OLD_SPRITES && qs.get('oldenv') !== '0';
  var OLD_TANK = OLD_SPRITES && qs.get('oldtank') !== '0';
  var OLD_DEATH = OLD_SPRITES && qs.get('death') !== '0';
  var TANK_LAYERS = OLD_TANK && qs.get('tanklayers') !== '0';
  var GORE_FX = qs.get('gore') !== '0';
  var GORE_MUL = clamp(parseFloat(qs.get('goremul') || '2.65'), 0.2, 3.5);
  var ENEMY_SCALE = clamp(parseFloat(qs.get('enemysize') || '1.12'), 0.8, 1.5);
  var BREAK_ENV = OLD_ENV && qs.get('breakenv') !== '0';
  var ROCK_DENSITY = clampInt(parseInt(qs.get('rockdensity') || '24', 10), 0, 60);
  var DECAL_DENSITY = clampInt(parseInt(qs.get('decaldensity') || '48', 10), 0, 80);
  var VEIN_FX = qs.get('veins') !== '0';
  var LEECH_FX = qs.get('leeches') !== '0';
  var COLLIDERS = qs.has('colliders') && qs.get('colliders') !== '0';
  var COLLIDER_CELL = clampInt(parseInt(qs.get('collidercell') || '42', 10), 24, 72);
  var COLLIDER_PAIR_CAP = clampInt(parseInt(qs.get('colliderpairs') || '9000', 10), 0, 30000);
  var COLLIDER_PAIR_LIMIT = clampInt(parseInt(qs.get('colliderlimit') || '7', 10), 0, 24);
  var COLLIDER_PLAYER_CAP = clamp(parseFloat(qs.get('colliderpush') || '8.5'), 0, 24);
  var GOD = qs.has('god') || qs.has('nohurt');
  var SPRITE_ANIM_CAP = clampInt(parseInt(qs.get('spritecap') || '360', 10), 0, 1200);
  var SPRITE_CELL = clampInt(parseInt(qs.get('spritecell') || '112', 10), 64, 220);
  var SPRITE_LOD = qs.get('spritelod') !== '0';
  var CORPSE_CAP = clampInt(parseInt(qs.get('corpsecap') || '82', 10), 0, 180);
  var TRACK_CAP = 260;
  var TWO_PI = Math.PI * 2;
  var UNLEASH_TIME = 5;
  var TOUCH_DEVICE = (navigator.maxTouchPoints || 0) > 0 || 'ontouchstart' in window;
  var ZOOM_OVERRIDE = qs.has('zoom') ? clamp(parseFloat(qs.get('zoom') || '1'), 0.55, 1.2) : 0;
  var JOYSTICK_ALLOWED = qs.get('joystick') !== '0' && qs.get('joy') !== '0';

  var glCanvas = document.getElementById('gl');
  var hudCanvas = document.getElementById('hud');
  var fallback = document.getElementById('fallback');
  var gl = glCanvas.getContext('webgl2', {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: false
  });

  if (!gl) {
    fallback.style.display = 'grid';
    return;
  }

  var hud = hudCanvas.getContext('2d', { alpha: true });
  var cssW = 1, cssH = 1, dpr = 1;
  var cameraZoom = 1, viewWorldW = 1, viewWorldH = 1;
  var viewW = 1, viewH = 1;
  var spriteImages = Object.create(null);
  var spriteTextures = Object.create(null);
  var spriteMeta = Object.create(null);
  var spritePending = 0;
  var spriteLoaded = 0;
  var spriteReady = !OLD_SPRITES;

  var keys = new Uint8Array(256);
  var pointerDown = false;
  var pointerX = 0, pointerY = 0, pointerId = -1;
  var useJoystick = false;
  var joyActive = false, joyId = -1;
  var joyBaseX = 0, joyBaseY = 0, joyKnobX = 0, joyKnobY = 0, joyDX = 0, joyDY = 0;
  var joyRadius = 66;
  var audioMuted = qs.has('mute') || qs.get('sound') === '0';
  var audioCtx = null;
  var audioLoading = false;
  var audioBuffers = Object.create(null);
  var audioLast = Object.create(null);
  var musicEl = null;
  var hudImages = Object.create(null);

  // colour palette - mirrors the original Bloodtread COL object
  var BT_CRIM    = '#c41228';
  var BT_CRIM_HI = '#ff334a';
  var BT_BLOOD   = '#6e0a16';
  var BT_BLOOD_DK = '#3a060d';
  var BT_BONE    = '#d8cbb0';
  var BT_BONE_DIM = '#9b8f78';
  var BT_IRON    = '#3b342d';
  var BT_IRON_LO = '#241f1a';

  var SFX_FILES = {
    cannon: 'audio/sfx/cannon.mp3',
    flak: 'audio/sfx/flak.mp3',
    laser: 'audio/sfx/laser.mp3',
    missile: 'audio/sfx/missile.mp3',
    squish: 'audio/sfx/squish.mp3',
    crunch: 'audio/sfx/crunch.mp3',
    metal: 'audio/sfx/metal.mp3',
    rock: 'audio/sfx/rock.mp3',
    boom: 'audio/sfx/boom.mp3',
    hitflesh: 'audio/sfx/hitflesh.mp3'
  };

  var seed = 0x5eed1234;
  function rnd() {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  }

  function clamp(v, a, b) {
    return v < a ? a : (v > b ? b : v);
  }

  function clampInt(v, a, b) {
    if (!isFinite(v)) return a;
    return Math.max(a, Math.min(b, v | 0));
  }

  function len2(x, y) {
    return x * x + y * y;
  }

  function fmtTime(t) {
    var m = (t / 60) | 0;
    var s = (t - m * 60) | 0;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function updateCameraMetrics() {
    var portrait = cssH >= cssW;
    cameraZoom = ZOOM_OVERRIDE || (TOUCH_DEVICE || cssW < 760 ? (portrait ? 0.70 : 0.78) : 1);
    viewWorldW = cssW / cameraZoom;
    viewWorldH = cssH / cameraZoom;
    useJoystick = JOYSTICK_ALLOWED && (TOUCH_DEVICE || cssW < 760 || qs.has('joystick') || qs.has('joy'));
    joyRadius = clamp(Math.min(cssW, cssH) * 0.105, 52, 76);
  }

  function worldToScreenX(x) {
    return (x - player.x) * cameraZoom + cssW * 0.5;
  }

  function worldToScreenY(y) {
    return (y - player.y) * cameraZoom + cssH * 0.5;
  }

  function screenLen(v) {
    return v * cameraZoom;
  }

  function viewWorldMax() {
    return Math.max(viewWorldW, viewWorldH);
  }

  function tankRageLevel() {
    var sum = tankArmorTier + tankCoreTier + tankCannonTier + tankTreadsTier + tankThirstTier + tankFrenzyTier;
    return clamp(sum / 36, 0, 1);
  }

  function unlockAudio() {
    if (audioMuted) return;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!audioCtx) {
      audioCtx = new AC();
      loadAudioSamples();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    if (!musicEl) {
      musicEl = new Audio('audio/bg_track.mp3');
      musicEl.loop = true;
      musicEl.volume = 0.18;
    }
    if (qs.has('music') && qs.get('music') !== '0') {
      var p = musicEl.play();
      if (p && p.catch) p.catch(function () {});
    }
  }

  function loadAudioSamples() {
    if (!audioCtx || audioLoading) return;
    audioLoading = true;
    var names = Object.keys(SFX_FILES);
    for (var i = 0; i < names.length; i++) {
      loadOneSample(names[i]);
    }
  }

  function loadOneSample(name) {
    fetch(SFX_FILES[name]).then(function (r) {
      return r.arrayBuffer();
    }).then(function (buf) {
      return audioCtx.decodeAudioData(buf);
    }).then(function (decoded) {
      audioBuffers[name] = decoded;
    }).catch(function () {});
  }

  function playTone(freq, dur, vol) {
    if (audioMuted || !audioCtx) return;
    var now = audioCtx.currentTime;
    var osc = audioCtx.createOscillator();
    var gain = audioCtx.createGain();
    osc.frequency.value = freq;
    osc.type = 'triangle';
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, vol || 0.035), now + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + (dur || 0.06));
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + (dur || 0.06) + 0.02);
  }

  function playSfx(name, vol, minGap, rate) {
    if (audioMuted || !audioCtx) return;
    var now = audioCtx.currentTime;
    minGap = minGap == null ? 0.05 : minGap;
    if (audioLast[name] != null && now - audioLast[name] < minGap) return;
    audioLast[name] = now;
    var buf = audioBuffers[name];
    if (!buf) {
      if (name === 'hitflesh' || name === 'squish') playTone(150 + rnd() * 60, 0.055, (vol || 0.25) * 0.16);
      else if (name === 'cannon' || name === 'missile' || name === 'boom') playTone(80 + rnd() * 35, 0.08, (vol || 0.35) * 0.18);
      return;
    }
    var src = audioCtx.createBufferSource();
    var gain = audioCtx.createGain();
    src.buffer = buf;
    src.playbackRate.value = rate || (0.94 + rnd() * 0.12);
    gain.gain.value = vol == null ? 0.35 : vol;
    src.connect(gain);
    gain.connect(audioCtx.destination);
    src.start(now);
  }

  function toggleMute() {
    audioMuted = !audioMuted;
    if (musicEl) {
      if (audioMuted) musicEl.pause();
      else unlockAudio();
    }
  }

  function addHudImage(key, src) {
    var img = new Image();
    hudImages[key] = img;
    img.src = src;
  }

  function loadHudImages() {
    addHudImage('hero', 'art_refs/bloodmech_hero.png');
    addHudImage('heart', 'art_refs/heartcore_pulse.png');
    addHudImage('bloom', 'art_refs/bloodletting_bloom.png');
    addHudImage('u0', 'art_refs/icon_caliber.png');
    addHudImage('u1', 'art_refs/icon_boiler.png');
    addHudImage('u2', 'art_refs/icon_teeth.png');
    addHudImage('u3', 'art_refs/icon_thirst.png');
    addHudImage('u4', 'art_refs/icon_rapid.png');
    addHudImage('u5', 'art_refs/icon_veins.png');
    addHudImage('u6', 'art_refs/icon_plate.png');
    addHudImage('u7', 'art_refs/icon_growth.png');
    addHudImage('u8', 'art_refs/icon_lash.png');
  }

  var player = {
    x: 0, y: 0, vx: 0, vy: 0, hull: 0, turret: 0,
    r: 25, hp: 125, maxHp: 125, xp: 0, xpNext: 6, level: 1,
    speed: 255, crush: 12, crushDps: 72, dmg: 20, fireRate: 8,
    pickR: 135, thirst: 0, rangedHeal: false, barrels: 1, lashLvl: 0,
    regen: 0, frenzyMul: 1, meter: 0, unleash: 0, unleashFlash: 0, recoil: 0, hurt: 0
  };

  var state = {
    mode: 'MENU',
    t: 0,
    tick: 1,
    kills: 0,
    blood: 0,
    spawnCredit: 0,
    fireCd: 0,
    banner: '',
    bannerT: 0,
    paused: false,
    gameOverT: 0,
    runBanked: false
  };

  var ex = new Float32Array(MAX_ENEMIES);
  var ey = new Float32Array(MAX_ENEMIES);
  var evx = new Float32Array(MAX_ENEMIES);
  var evy = new Float32Array(MAX_ENEMIES);
  var ehp = new Float32Array(MAX_ENEMIES);
  var er = new Float32Array(MAX_ENEMIES);
  var espd = new Float32Array(MAX_ENEMIES);
  var ephase = new Float32Array(MAX_ENEMIES);
  var eface = new Float32Array(MAX_ENEMIES);
  var ecd = new Float32Array(MAX_ENEMIES);
  var etype = new Uint8Array(MAX_ENEMIES);
  var eN = 0;

  var bx = new Float32Array(MAX_BULLETS);
  var by = new Float32Array(MAX_BULLETS);
  var bvx = new Float32Array(MAX_BULLETS);
  var bvy = new Float32Array(MAX_BULLETS);
  var blife = new Float32Array(MAX_BULLETS);
  var bdmg = new Float32Array(MAX_BULLETS);
  var bkind = new Uint8Array(MAX_BULLETS);
  var brow = new Uint8Array(MAX_BULLETS);
  var btier = new Uint8Array(MAX_BULLETS);
  var brad = new Float32Array(MAX_BULLETS);
  var bN = 0;

  var mx = new Float32Array(MAX_MOTES);
  var my = new Float32Array(MAX_MOTES);
  var mvx = new Float32Array(MAX_MOTES);
  var mvy = new Float32Array(MAX_MOTES);
  var mval = new Float32Array(MAX_MOTES);
  var mN = 0;

  var px = new Float32Array(MAX_PARTS);
  var py = new Float32Array(MAX_PARTS);
  var pvx = new Float32Array(MAX_PARTS);
  var pvy = new Float32Array(MAX_PARTS);
  var pr = new Float32Array(MAX_PARTS);
  var plife = new Float32Array(MAX_PARTS);
  var pmax = new Float32Array(MAX_PARTS);
  var pcol = new Uint8Array(MAX_PARTS);
  var pN = 0;
  var pCursor = 0;

  var dxs = new Float32Array(MAX_DECALS);
  var dys = new Float32Array(MAX_DECALS);
  var dr = new Float32Array(MAX_DECALS);
  var da = new Float32Array(MAX_DECALS);
  var dcol = new Uint8Array(MAX_DECALS);
  var dN = 0;
  var dCursor = 0;

  var gx0 = new Float32Array(MAX_GORE || 1);
  var gy0 = new Float32Array(MAX_GORE || 1);
  var gvx = new Float32Array(MAX_GORE || 1);
  var gvy = new Float32Array(MAX_GORE || 1);
  var gr = new Float32Array(MAX_GORE || 1);
  var glife = new Float32Array(MAX_GORE || 1);
  var gmax = new Float32Array(MAX_GORE || 1);
  var ga = new Float32Array(MAX_GORE || 1);
  var gspin = new Float32Array(MAX_GORE || 1);
  var gkind = new Uint8Array(MAX_GORE || 1);
  var gN = 0;
  var gCursor = 0;

  var sx0 = new Float32Array(MAX_SPLATS || 1);
  var sy0 = new Float32Array(MAX_SPLATS || 1);
  var sr = new Float32Array(MAX_SPLATS || 1);
  var slife = new Float32Array(MAX_SPLATS || 1);
  var smax = new Float32Array(MAX_SPLATS || 1);
  var skind = new Uint8Array(MAX_SPLATS || 1);
  var sN = 0;
  var sCursor = 0;

  var boomX = new Float32Array(MAX_BOOMS || 1);
  var boomY = new Float32Array(MAX_BOOMS || 1);
  var boomR = new Float32Array(MAX_BOOMS || 1);
  var boomT = new Float32Array(MAX_BOOMS || 1);
  var boomMax = new Float32Array(MAX_BOOMS || 1);
  var boomKind = new Uint8Array(MAX_BOOMS || 1);
  var boomN = 0;
  var boomCursor = 0;

  var bubbleX = new Float32Array(MAX_BUBBLES || 1);
  var bubbleY = new Float32Array(MAX_BUBBLES || 1);
  var bubbleVX = new Float32Array(MAX_BUBBLES || 1);
  var bubbleVY = new Float32Array(MAX_BUBBLES || 1);
  var bubbleR = new Float32Array(MAX_BUBBLES || 1);
  var bubbleT = new Float32Array(MAX_BUBBLES || 1);
  var bubbleMax = new Float32Array(MAX_BUBBLES || 1);
  var bubbleN = 0;
  var bubbleCursor = 0;

  var cx = new Float32Array(CORPSE_CAP || 1);
  var cy = new Float32Array(CORPSE_CAP || 1);
  var cr = new Float32Array(CORPSE_CAP || 1);
  var ct = new Float32Array(CORPSE_CAP || 1);
  var cface = new Int8Array(CORPSE_CAP || 1);
  var ctype = new Uint8Array(CORPSE_CAP || 1);
  var cN = 0;
  var cCursor = 0;

  var txs = new Float32Array(TRACK_CAP);
  var tys = new Float32Array(TRACK_CAP);
  var ta = new Float32Array(TRACK_CAP);
  var tlife = new Float32Array(TRACK_CAP);
  var tN = 0;
  var tCursor = 0;
  var trackAcc = 0;

  var vx0 = new Float32Array(MAX_VEINS || 1);
  var vy0 = new Float32Array(MAX_VEINS || 1);
  var va0 = new Float32Array(MAX_VEINS || 1);
  var vlen = new Float32Array(MAX_VEINS || 1);
  var vcurl = new Float32Array(MAX_VEINS || 1);
  var vgrow = new Float32Array(MAX_VEINS || 1);
  var vlife = new Float32Array(MAX_VEINS || 1);
  var vb1a = new Float32Array(MAX_VEINS || 1);
  var vb1l = new Float32Array(MAX_VEINS || 1);
  var vb2a = new Float32Array(MAX_VEINS || 1);
  var vb2l = new Float32Array(MAX_VEINS || 1);
  var vN = 0;
  var vCursor = 0;
  var veinAcc = 0;
  var unleashTrailAcc = 0;

  var leechTarget = new Int32Array(MAX_LEECHES || 1);
  var leechGrab = new Float32Array(MAX_LEECHES || 1);
  var leechPhase = new Float32Array(MAX_LEECHES || 1);
  var leechMark = new Uint16Array(MAX_ENEMIES);
  var leechToken = 1;
  for (var li0 = 0; li0 < leechTarget.length; li0++) {
    leechTarget[li0] = -1;
    leechPhase[li0] = li0 * 1.731;
  }

  var COLLIDER_GRID = 80;
  var COLLIDER_HALF = COLLIDER_GRID * 0.5;
  var colliderHead = new Int32Array(COLLIDER_GRID * COLLIDER_GRID);
  var colliderNext = new Int32Array(MAX_ENEMIES);
  var colliderCell = new Int32Array(MAX_ENEMIES);
  var colliderOriginX = 0;
  var colliderOriginY = 0;

  var FX_GRID = 25;
  var FX_HALF = (FX_GRID / 2) | 0;
  var FX_CELL = 92;
  var fxStamp = new Uint32Array(FX_GRID * FX_GRID);
  var fxCount = new Uint8Array(FX_GRID * FX_GRID);

  var OB_EMPTY = -2147483648;
  var OB_STATE_CAP = 1024;
  var OB_MASK = OB_STATE_CAP - 1;
  var obKeys = new Int32Array(OB_STATE_CAP);
  var obHp = new Float32Array(OB_STATE_CAP);
  var obHitT = new Float32Array(OB_STATE_CAP);
  var obBroken = new Uint8Array(OB_STATE_CAP);
  var obCx = new Int16Array(OB_STATE_CAP);
  var obCy = new Int16Array(OB_STATE_CAP);
  var obCursor = 0;
  for (var oi0 = 0; oi0 < OB_STATE_CAP; oi0++) {
    obKeys[oi0] = OB_EMPTY;
    obHitT[oi0] = -99;
  }

  var DEC_STATE_CAP = 1024;
  var DEC_MASK = DEC_STATE_CAP - 1;
  var decKeys = new Int32Array(DEC_STATE_CAP);
  var decCursor = 0;
  for (var di0 = 0; di0 < DEC_STATE_CAP; di0++) decKeys[di0] = OB_EMPTY;

  var obTmpX = 0, obTmpY = 0, obTmpR = 0, obTmpMaxHp = 0, obTmpHp = 0, obTmpHit = -99;
  var obTmpKey = 0, obTmpCx = 0, obTmpCy = 0, obTmpV = 0, obTmpSize = 0, obTmpSlot = -1;
  var decTmpX = 0, decTmpY = 0, decTmpKind = 0, decTmpRot = 0, decTmpSize = 0, decTmpKey = 0;

  function effectAllowed(x, y, limit) {
    var cx = Math.floor((x - player.x) / FX_CELL) + FX_HALF;
    var cy = Math.floor((y - player.y) / FX_CELL) + FX_HALF;
    if (cx < 0 || cy < 0 || cx >= FX_GRID || cy >= FX_GRID) return false;
    var i = cy * FX_GRID + cx;
    if (fxStamp[i] !== state.tick) {
      fxStamp[i] = state.tick;
      fxCount[i] = 0;
    }
    if (fxCount[i] >= limit) return false;
    fxCount[i]++;
    return true;
  }

  var T_NAME = ['Husk', 'Mite', 'Brute', 'Gorehound', 'Spitter', 'Hive', 'Wisp', 'Detonator', 'Needle', 'Shellback', 'Leecher', 'Bombard'];
  var T_HP =     [12, 7, 58, 28, 38, 92, 18, 145, 22, 130, 46, 80];
  var T_SPD =    [88, 145, 55, 118, 74, 48, 98, 68, 135, 42, 82, 58];
  var T_R =      [13, 8, 23, 15, 18, 28, 13, 25, 12, 26, 16, 22];
  var T_PAY =    [1, 1, 5, 2, 3, 8, 2, 10, 3, 9, 5, 7];
  var T_UNLOCK = [0, 0, 1, 2, 3, 5, 7, 9, 4, 6, 8, 9];
  var T_WEIGHT = [56, 44, 45, 34, 34, 24, 18, 20, 28, 20, 18, 18];
  var T_COL = new Uint8Array([0, 1, 2, 1, 3, 2, 4, 3, 1, 2, 4, 3]);
  var C_R = new Float32Array([0.55, 0.92, 0.70, 0.95, 0.55, 0.88, 0.18]);
  var C_G = new Float32Array([0.035, 0.13, 0.18, 0.55, 0.28, 0.78, 0.04]);
  var C_B = new Float32Array([0.045, 0.10, 0.12, 0.18, 0.36, 0.42, 0.035]);
  var SPRITE_BASE = ['husk', 'husk_rot', 'brute', 'brute_char', 'husk', 'brute', 'husk_rot', 'brute_char', 'husk_rot', 'brute', 'husk_rot', 'brute_char'];
  var SPRITE_T_R = new Float32Array([1.00, 0.96, 1.00, 1.05, 0.96, 1.08, 0.82, 1.08, 1.05, 0.94, 0.82, 1.05]);
  var SPRITE_T_G = new Float32Array([1.00, 1.05, 1.00, 0.94, 1.08, 0.95, 1.10, 0.92, 0.98, 0.98, 1.08, 0.96]);
  var SPRITE_T_B = new Float32Array([1.00, 0.94, 1.00, 0.90, 0.92, 0.88, 1.18, 0.86, 0.90, 0.88, 1.14, 0.88]);
  var seenType = new Uint8Array(T_NAME.length);

  var upgradeNames = [
    'HEAVY CALIBER', 'BOILER PRESSURE', 'TREAD TEETH', 'THIRST', 'RELOAD GLAND',
    'VEIN NETWORK', 'ARMOR PLATING', 'OVERGROWTH', 'VEIN LASH'
  ];
  var upgradeDesc = [
    '+35% cannon damage',
    '+14% move speed',
    '+30% crush, wider bite',
    'Heal on every kill',
    '+25% fire rate',
    '+45% blood pickup range',
    '+25 max HP, patch up',
    '+1 cannon barrel',
    'Tendrils flay nearby foes'
  ];
  var upgradePick = new Int8Array(3);
  var upgradeRollPool = new Int8Array(upgradeNames.length);
  var upgradeRect = new Float32Array(12);
  var upgradeHover = -1;
  var tankArmorTier = 0;
  var tankCoreTier = 0;
  var tankCannonTier = 0;
  var tankTreadsTier = 0;
  var tankThirstTier = 0;
  var tankFrenzyTier = 0;

  function bumpTier(name, amount) {
    amount = amount || 1;
    if (name === 'armor') tankArmorTier = Math.min(6, tankArmorTier + amount);
    else if (name === 'core') tankCoreTier = Math.min(6, tankCoreTier + amount);
    else if (name === 'cannon') tankCannonTier = Math.min(6, tankCannonTier + amount);
    else if (name === 'treads') tankTreadsTier = Math.min(6, tankTreadsTier + amount);
    else if (name === 'thirst') tankThirstTier = Math.min(6, tankThirstTier + amount);
    else if (name === 'frenzy') tankFrenzyTier = Math.min(6, tankFrenzyTier + amount);
  }

  var MAXTIER = 6;
  var TIER_COST = [60, 200, 600, 1600, 4000, 9000];
  var TRACKS = [
    { id: 'armor', name: 'ARMOR PLATING', desc: 'Max HP and hull mass' },
    { id: 'core', name: 'BLOOD CORE', desc: 'Regen and pickup reach' },
    { id: 'cannon', name: 'MAW CANNON', desc: 'Damage, fire rate, barrels' },
    { id: 'treads', name: 'TREAD TEETH', desc: 'Speed and crush pressure' },
    { id: 'thirst', name: 'THIRST', desc: 'Heal from ranged kills' },
    { id: 'frenzy', name: 'BLOODLETTING', desc: 'Leech tendrils and rage' }
  ];
  var META = { armor: 0, core: 0, cannon: 0, treads: 0, thirst: 0, frenzy: 0 };
  var MA_HP = [0, 12, 30, 60, 110, 190, 320];
  var MA_REGEN = [0, 0.3, 0.7, 1.2, 2, 3, 4.5];
  var MA_DMG = [1, 1.25, 1.55, 1.9, 2.3, 2.8, 3.4];
  var MA_FIRE = [1, 1.12, 1.25, 1.4, 1.6, 1.85, 2.2];
  var MA_BARREL = [0, 0, 0, 1, 1, 2, 2];
  var MA_SPD = [1, 1.08, 1.16, 1.25, 1.35, 1.46, 1.6];
  var MA_CRUSH = [1, 1.2, 1.45, 1.75, 2.1, 2.5, 3];
  var MA_THIRST = [0, 2, 4, 6, 9, 12, 16];
  var MA_CORETH = [0, 0, 1, 1, 2, 2, 3];
  var MA_LASH = [0, 1, 1, 2, 2, 3, 3];
  var MA_FRENZY = [1, 1.1, 1.2, 1.35, 1.5, 1.7, 2];
  var WEAPONS = [
    { id: 'cannon', name: 'CANNON', cost: 0, r: 1.0, g: 0.46, b: 0.23 },
    { id: 'flak', name: 'FLAK', cost: 1400, r: 0.48, g: 0.90, b: 0.42 },
    { id: 'laser', name: 'LASER', cost: 1800, r: 1.0, g: 0.25, b: 0.36 },
    { id: 'missile', name: 'MISSILE', cost: 2400, r: 1.0, g: 0.66, b: 0.20 }
  ];
  var WEAPON_BY_ID = Object.create(null);
  for (var wi0 = 0; wi0 < WEAPONS.length; wi0++) WEAPON_BY_ID[WEAPONS[wi0].id] = WEAPONS[wi0];
  var WEAPON_ROW = { cannon: 0, flak: 1, laser: 2, missile: 3 };
  var WEAPON_TURRET_CELL = 48;
  var WEAPON_PROJECTILE_CELL = 32;
  var weaponMeta = { cannon: 0, flak: 0, laser: 0, missile: 0 };
  var equipWeapon = 'cannon';
  var ownedWeapons = { cannon: 1 };
  var bestTime = 0;
  var totalBank = 0;
  var selectedTrack = 'armor';
  var rPlay = null, rForge = null, rCheat = null, rRetry = null, rMenu = null;
  var rShopBack = null, rCheatBack = null, rCheatMax = null, rCheatMoney = null, rCheatReset = null, rCheatMin9 = null;
  var rResume = null, rQuit = null, rHudPause = null, rHudMenu = null, rPauseForge = null;
  var rShop = [];
  var rWeapons = [];
  var laserT = 0, laserX0 = 0, laserY0 = 0, laserX1 = 0, laserY1 = 0, laserBurstT = 0, laserBurstMax = 0;
  var SAVE_META = 'bloodtread_rebuild_meta';
  var SAVE_BANK = 'bloodtread_rebuild_bank';
  var SAVE_BEST = 'bloodtread_rebuild_best';

  function weaponName(id) {
    var w = WEAPON_BY_ID[id];
    return w ? w.name : 'CANNON';
  }

  function currentWeapon() {
    return WEAPON_BY_ID[equipWeapon] || WEAPON_BY_ID.cannon;
  }

  function weaponRow(id) {
    return WEAPON_ROW[id] == null ? 0 : WEAPON_ROW[id];
  }

  function weaponTier(id) {
    return clampInt(weaponMeta[id] || 0, 0, MAXTIER);
  }

  function currentWeaponTier() {
    return weaponTier(equipWeapon);
  }

  function weaponAtlasTier(id) {
    return clampInt(weaponTier(id), 0, 5);
  }

  function syncLegacyCannonMeta() {
    META.cannon = currentWeaponTier();
  }

  function trackCost(id) {
    var tier = id === 'cannon' ? currentWeaponTier() : META[id];
    return tier >= MAXTIER ? null : TIER_COST[tier];
  }

  function trackEffect(id) {
    var t = id === 'cannon' ? currentWeaponTier() : META[id];
    var n = Math.min(MAXTIER, t + 1);
    if (id === 'armor') return 'HP ' + (42 + MA_HP[t]) + (t < MAXTIER ? ' -> ' + (42 + MA_HP[n]) : '');
    if (id === 'core') return 'Regen ' + MA_REGEN[t] + '/s' + (t < MAXTIER ? ' -> ' + MA_REGEN[n] + '/s' : '');
    if (id === 'cannon') return weaponName(equipWeapon) + ' power x' + MA_DMG[t].toFixed(2) + (t < MAXTIER ? ' -> x' + MA_DMG[n].toFixed(2) : '');
    if (id === 'treads') return 'Speed +' + Math.round((MA_SPD[t] - 1) * 100) + '%' + (t < MAXTIER ? ' -> +' + Math.round((MA_SPD[n] - 1) * 100) + '%' : '');
    if (id === 'thirst') return 'Heal ' + MA_THIRST[t] + (t < MAXTIER ? ' -> ' + MA_THIRST[n] : '');
    if (id === 'frenzy') return 'Lash x' + MA_FRENZY[t].toFixed(2) + (t < MAXTIER ? ' -> x' + MA_FRENZY[n].toFixed(2) : '');
    return '';
  }

  function saveMeta() {
    try {
      syncLegacyCannonMeta();
      var m = {
        armor: META.armor, core: META.core, cannon: META.cannon,
        treads: META.treads, thirst: META.thirst, frenzy: META.frenzy,
        owned: ownedWeapons, weapon: equipWeapon,
        weaponMeta: {
          cannon: weaponMeta.cannon,
          flak: weaponMeta.flak,
          laser: weaponMeta.laser,
          missile: weaponMeta.missile
        }
      };
      localStorage.setItem(SAVE_META, JSON.stringify(m));
      localStorage.setItem(SAVE_BANK, String(Math.floor(totalBank)));
      localStorage.setItem(SAVE_BEST, String(Math.floor(bestTime)));
    } catch (err) {}
  }

  function loadMeta() {
    try {
      var m = JSON.parse(localStorage.getItem(SAVE_META) || '{}');
      for (var k in META) {
        if (typeof m[k] === 'number') META[k] = clampInt(m[k], 0, MAXTIER);
      }
      if (m.weaponMeta && typeof m.weaponMeta === 'object') {
        for (var wm = 0; wm < WEAPONS.length; wm++) {
          var wid = WEAPONS[wm].id;
          if (typeof m.weaponMeta[wid] === 'number') weaponMeta[wid] = clampInt(m.weaponMeta[wid], 0, MAXTIER);
        }
      } else {
        weaponMeta.cannon = META.cannon;
      }
      if (m.owned && typeof m.owned === 'object') ownedWeapons = m.owned;
      ownedWeapons.cannon = 1;
      if (typeof m.weapon === 'string' && ownedWeapons[m.weapon] && WEAPON_BY_ID[m.weapon]) equipWeapon = m.weapon;
      syncLegacyCannonMeta();
      totalBank = parseInt(localStorage.getItem(SAVE_BANK) || '0', 10) || 0;
      bestTime = parseInt(localStorage.getItem(SAVE_BEST) || '0', 10) || 0;
    } catch (err) {}
  }

  function syncTankTiersFromMeta() {
    syncLegacyCannonMeta();
    tankArmorTier = META.armor;
    tankCoreTier = META.core;
    tankCannonTier = currentWeaponTier();
    tankTreadsTier = META.treads;
    tankThirstTier = META.thirst;
    tankFrenzyTier = META.frenzy;
  }

  function applyMetaToPlayer() {
    var cannonTier = currentWeaponTier();
    META.cannon = cannonTier;
    player.maxHp = 42 + MA_HP[META.armor];
    player.hp = player.maxHp;
    player.speed = 205 * MA_SPD[META.treads];
    player.crush = 9 + META.treads * 4.2;
    player.crushDps = 48 * MA_CRUSH[META.treads];
    player.dmg = 11 * MA_DMG[cannonTier];
    player.fireRate = 4.8 * MA_FIRE[cannonTier];
    player.pickR = 92 + META.core * 10;
    player.thirst = MA_THIRST[META.thirst] + MA_CORETH[META.core];
    player.rangedHeal = META.thirst > 0;
    player.barrels = 1 + MA_BARREL[cannonTier];
    player.lashLvl = MA_LASH[META.frenzy];
    player.regen = MA_REGEN[META.core];
    player.frenzyMul = MA_FRENZY[META.frenzy];
    syncTankTiersFromMeta();
  }

  function buyTrack(id) {
    var cost = trackCost(id);
    selectedTrack = id;
    if (cost == null || totalBank < cost) return false;
    totalBank -= cost;
    if (id === 'cannon') {
      weaponMeta[equipWeapon] = Math.min(MAXTIER, currentWeaponTier() + 1);
      META.cannon = weaponMeta[equipWeapon];
    } else {
      META[id] = Math.min(MAXTIER, META[id] + 1);
    }
    saveMeta();
    syncTankTiersFromMeta();
    playTone(390 + (id === 'cannon' ? currentWeaponTier() : META[id]) * 35, 0.09, 0.035);
    return true;
  }

  function buyOrEquipWeapon(id) {
    var w = WEAPON_BY_ID[id];
    if (!w) return false;
    if (ownedWeapons[id]) {
      equipWeapon = id;
      saveMeta();
      syncTankTiersFromMeta();
      playTone(260, 0.055, 0.026);
      return true;
    }
    if (totalBank < w.cost) return false;
    totalBank -= w.cost;
    ownedWeapons[id] = 1;
    equipWeapon = id;
    saveMeta();
    syncTankTiersFromMeta();
    playTone(520, 0.12, 0.045);
    return true;
  }

  function cheatMoney() {
    totalBank += 50000;
    saveMeta();
    playTone(620, 0.08, 0.04);
  }

  function cheatMaxAll() {
    for (var k in META) META[k] = MAXTIER;
    for (var i = 0; i < WEAPONS.length; i++) ownedWeapons[WEAPONS[i].id] = 1;
    for (var wmi = 0; wmi < WEAPONS.length; wmi++) weaponMeta[WEAPONS[wmi].id] = MAXTIER;
    totalBank = 999999;
    equipWeapon = 'missile';
    saveMeta();
    syncTankTiersFromMeta();
    playTone(760, 0.12, 0.045);
  }

  function cheatReset() {
    for (var k in META) META[k] = 0;
    for (var wmi = 0; wmi < WEAPONS.length; wmi++) weaponMeta[WEAPONS[wmi].id] = 0;
    ownedWeapons = { cannon: 1 };
    equipWeapon = 'cannon';
    totalBank = 0;
    bestTime = 0;
    selectedTrack = 'armor';
    saveMeta();
    syncTankTiersFromMeta();
    playTone(140, 0.08, 0.035);
  }

  function nextXpForLevel(level) {
    return Math.floor(6 + level * 4 + level * level * 0.35);
  }

  function rollUpgradeDraft() {
    var len = upgradeNames.length;
    for (var i = 0; i < len; i++) upgradeRollPool[i] = i;
    for (var p = 0; p < 3; p++) {
      var j = p + ((rnd() * (len - p)) | 0);
      var tmp = upgradeRollPool[p];
      upgradeRollPool[p] = upgradeRollPool[j];
      upgradeRollPool[j] = tmp;
      upgradePick[p] = upgradeRollPool[p];
    }
  }

  function chooseType(minute) {
    var total = 0;
    for (var i = 0; i < T_NAME.length; i++) if (T_UNLOCK[i] <= minute) total += T_WEIGHT[i];
    var r = rnd() * total;
    for (var j = 0; j < T_NAME.length; j++) {
      if (T_UNLOCK[j] > minute) continue;
      r -= T_WEIGHT[j];
      if (r <= 0) return j;
    }
    return 0;
  }

  function desiredEnemies() {
    var target = 35 + state.t * 1.72;
    if (state.t > 120) target += Math.sin(state.t * 0.45) * 65 + 65;
    if (state.t > 420) target += (state.t - 420) * 0.22;
    return Math.min(MAX_ENEMIES, target | 0);
  }

  function spawnEnemy(type) {
    if (eN >= MAX_ENEMIES) return;
    var minute = state.t / 60;
    type = type == null ? chooseType(minute) : type;
    var a = rnd() * TWO_PI;
    var ring = Math.sqrt(cssW * cssW + cssH * cssH) * 0.5 + 170 + rnd() * 180;
    var i = eN++;
    ex[i] = player.x + Math.cos(a) * ring;
    ey[i] = player.y + Math.sin(a) * ring;
    evx[i] = 0;
    evy[i] = 0;
    etype[i] = type;
    ephase[i] = rnd() * TWO_PI;
    eface[i] = a + Math.PI;
    ecd[i] = 0.25 + rnd() * 1.6;
    er[i] = T_R[type] * ENEMY_SCALE;
    espd[i] = T_SPD[type] * (0.9 + rnd() * 0.22);
    ehp[i] = T_HP[type] * (1 + state.t * 0.014) * (type >= 5 ? 1.18 : 1);
    if (!seenType[type]) {
      seenType[type] = 1;
      if (state.t > 2 && state.mode === 'PLAYING') {
        state.banner = 'NEW HORROR: ' + T_NAME[type];
        state.bannerT = 1.8;
      }
    }
  }

  function removeEnemy(i) {
    var l = --eN;
    retargetLeechesAfterRemove(i, l);
    if (i === l) return;
    ex[i] = ex[l]; ey[i] = ey[l]; evx[i] = evx[l]; evy[i] = evy[l];
    ehp[i] = ehp[l]; er[i] = er[l]; espd[i] = espd[l];
    ephase[i] = ephase[l]; eface[i] = eface[l]; ecd[i] = ecd[l]; etype[i] = etype[l];
  }

  function projectileRowForKind(kind) {
    if (kind === 2) return WEAPON_ROW.flak;
    if (kind === 1) return WEAPON_ROW.missile;
    return WEAPON_ROW.cannon;
  }

  function spawnBullet(x, y, vx, vy, dmg, kind, radius, life, visualRow, visualTier) {
    var i;
    if (bN < MAX_BULLETS) i = bN++;
    else i = (state.tick + bN) % MAX_BULLETS;
    bx[i] = x; by[i] = y; bvx[i] = vx; bvy[i] = vy;
    blife[i] = life == null ? 0.95 : life;
    bdmg[i] = dmg;
    bkind[i] = kind || 0;
    brow[i] = clampInt(visualRow == null ? weaponRow(equipWeapon) : visualRow, 0, 3);
    btier[i] = clampInt(visualTier == null ? currentWeaponTier() : visualTier, 0, 5);
    brad[i] = radius || 0;
  }

  function removeBullet(i) {
    var l = --bN;
    if (i === l) return;
    bx[i] = bx[l]; by[i] = by[l]; bvx[i] = bvx[l]; bvy[i] = bvy[l]; blife[i] = blife[l]; bdmg[i] = bdmg[l]; bkind[i] = bkind[l]; brow[i] = brow[l]; btier[i] = btier[l]; brad[i] = brad[l];
  }

  function spawnMote(x, y, v) {
    var i;
    if (mN < MAX_MOTES) i = mN++;
    else i = state.tick % MAX_MOTES;
    mx[i] = x; my[i] = y;
    mvx[i] = (rnd() - 0.5) * 58;
    mvy[i] = (rnd() - 0.5) * 58;
    mval[i] = v;
  }

  function removeMote(i) {
    var l = --mN;
    if (i === l) return;
    mx[i] = mx[l]; my[i] = my[l]; mvx[i] = mvx[l]; mvy[i] = mvy[l]; mval[i] = mval[l];
  }

  function spawnParticle(x, y, vx, vy, r, life, col) {
    var i;
    if (pN < MAX_PARTS) i = pN++;
    else {
      i = pCursor;
      pCursor = (pCursor + 1) % MAX_PARTS;
    }
    px[i] = x; py[i] = y; pvx[i] = vx; pvy[i] = vy; pr[i] = r; plife[i] = life; pmax[i] = life; pcol[i] = col;
  }

  function removeParticle(i) {
    var l = --pN;
    if (i === l) return;
    px[i] = px[l]; py[i] = py[l]; pvx[i] = pvx[l]; pvy[i] = pvy[l];
    pr[i] = pr[l]; plife[i] = plife[l]; pmax[i] = pmax[l]; pcol[i] = pcol[l];
  }

  function spawnDecal(x, y, r, col, alpha) {
    var i;
    if (dN < MAX_DECALS) i = dN++;
    else {
      i = dCursor;
      dCursor = (dCursor + 1) % MAX_DECALS;
    }
    dxs[i] = x; dys[i] = y; dr[i] = r; da[i] = alpha; dcol[i] = col;
  }

  function spawnBoom(x, y, r, kind) {
    if (MAX_BOOMS <= 0) return;
    var i;
    if (boomN < MAX_BOOMS) i = boomN++;
    else {
      i = boomCursor;
      boomCursor = (boomCursor + 1) % MAX_BOOMS;
    }
    boomX[i] = x;
    boomY[i] = y;
    boomR[i] = r;
    boomT[i] = 0;
    boomMax[i] = kind === 1 ? 0.58 : 0.72;
    boomKind[i] = kind || 0;
  }

  function removeBoom(i) {
    var l = --boomN;
    if (i === l) return;
    boomX[i] = boomX[l]; boomY[i] = boomY[l]; boomR[i] = boomR[l];
    boomT[i] = boomT[l]; boomMax[i] = boomMax[l]; boomKind[i] = boomKind[l];
  }

  function spawnBubble(x, y, vx, vy, r, life) {
    if (MAX_BUBBLES <= 0) return;
    var i;
    if (bubbleN < MAX_BUBBLES) i = bubbleN++;
    else {
      i = bubbleCursor;
      bubbleCursor = (bubbleCursor + 1) % MAX_BUBBLES;
    }
    bubbleX[i] = x; bubbleY[i] = y; bubbleVX[i] = vx; bubbleVY[i] = vy;
    bubbleR[i] = r; bubbleT[i] = 0; bubbleMax[i] = life;
  }

  function removeBubble(i) {
    var l = --bubbleN;
    if (i === l) return;
    bubbleX[i] = bubbleX[l]; bubbleY[i] = bubbleY[l]; bubbleVX[i] = bubbleVX[l]; bubbleVY[i] = bubbleVY[l];
    bubbleR[i] = bubbleR[l]; bubbleT[i] = bubbleT[l]; bubbleMax[i] = bubbleMax[l];
  }

  function spawnRageBubble(rage, boost) {
    if (MAX_BUBBLES <= 0) return;
    var ba = rnd() * TWO_PI;
    var brd = 6 + rnd() * (18 + rage * 10);
    var sp = boost || 1;
    spawnBubble(
      player.x + Math.cos(ba) * brd,
      player.y + Math.sin(ba) * brd,
      (Math.cos(ba) * 22 + (rnd() - 0.5) * 34) * sp,
      (Math.sin(ba) * 17 - 38 - rnd() * 30) * sp,
      (3.2 + rnd() * 5.8 + rage * 5.2) * sp,
      0.52 + rnd() * 0.55
    );
  }

  function triggerUnleash() {
    if (player.unleash > 0) return;
    player.unleash = UNLEASH_TIME;
    player.unleashFlash = 1;
    player.meter = 0;
    player.hurt = Math.max(player.hurt, 0.5);
    state.banner = 'BLOODLETTING';
    state.bannerT = 1.05;
    playSfx('crunch', 0.32, 0.06, 0.88);
    playSfx('hitflesh', 0.42, 0.04, 0.72);
    for (var i = 0; i < 9; i++) {
      spawnVeinTrail(player.x, player.y, (i / 9) * TWO_PI + (rnd() - 0.5) * 0.18);
    }
    spawnGoreSpray(player.x, player.y, 22, null, 0, 330, 0);
    for (var b = 0; b < 18; b++) spawnRageBubble(Math.max(0.35, tankRageLevel()), 1.35);
  }

  function updateUnleash(dt) {
    if (player.unleash > 0) {
      player.unleash = Math.max(0, player.unleash - dt);
      if (player.unleash <= 0) player.meter = Math.min(player.meter, 0);
    }
    if (player.unleashFlash > 0) player.unleashFlash = Math.max(0, player.unleashFlash - dt * 2.9);
  }

  function isTechType(type) {
    return type === 4 || type === 5 || type === 6 || type === 7 || type === 8 || type === 9 || type === 11;
  }

  function goreLoadScale() {
    if (!GORE_FX || MAX_GORE <= 0) return 0;
    var scale = 1;
    if (eN > 1120 || pN > 2000) scale = 0.42;
    else if (eN > 880) scale = 0.60;
    else if (eN > 640) scale = 0.82;
    return scale * GORE_MUL;
  }

  function spawnSplat(x, y, r, kind, life) {
    if (!GORE_FX || MAX_SPLATS <= 0) return;
    var i;
    if (sN < MAX_SPLATS) i = sN++;
    else {
      i = sCursor;
      sCursor = (sCursor + 1) % MAX_SPLATS;
    }
    sx0[i] = x;
    sy0[i] = y;
    sr[i] = r;
    slife[i] = life;
    smax[i] = life;
    skind[i] = kind;
  }

  function removeSplat(i) {
    var l = --sN;
    if (i === l) return;
    sx0[i] = sx0[l]; sy0[i] = sy0[l]; sr[i] = sr[l]; slife[i] = slife[l]; smax[i] = smax[l]; skind[i] = skind[l];
  }

  function spawnGorePiece(x, y, vx, vy, r, life, kind, angle, spin) {
    if (!GORE_FX || MAX_GORE <= 0) return;
    var i;
    if (gN < MAX_GORE) i = gN++;
    else {
      i = gCursor;
      gCursor = (gCursor + 1) % MAX_GORE;
    }
    gx0[i] = x;
    gy0[i] = y;
    gvx[i] = vx;
    gvy[i] = vy;
    gr[i] = r;
    glife[i] = life;
    gmax[i] = life;
    gkind[i] = kind;
    ga[i] = angle;
    gspin[i] = spin;
  }

  function removeGorePiece(i) {
    var l = --gN;
    if (i === l) return;
    gx0[i] = gx0[l]; gy0[i] = gy0[l]; gvx[i] = gvx[l]; gvy[i] = gvy[l];
    gr[i] = gr[l]; glife[i] = glife[l]; gmax[i] = gmax[l]; ga[i] = ga[l]; gspin[i] = gspin[l]; gkind[i] = gkind[l];
  }

  function spawnGoreSpray(x, y, n, baseA, spread, speed, kindBias) {
    var scale = goreLoadScale();
    if (scale <= 0) return;
    var count = Math.max(1, Math.round(n * scale));
    for (var i = 0; i < count; i++) {
      var a = baseA == null ? rnd() * TWO_PI : baseA + (rnd() - 0.5) * (spread || 1.2);
      var sp = (speed || 210) * (0.45 + rnd() * 0.9);
      var kind = kindBias;
      if (kind == null) kind = rnd() < 0.78 ? 0 : (rnd() < 0.55 ? 1 : 2);
      var life = kind === 5 ? 0.24 + rnd() * 0.18 : (kind === 0 ? 0.42 + rnd() * 0.52 : 0.9 + rnd() * 0.75);
      var rad = kind === 0 ? 1.3 + rnd() * 2.2 : 2.2 + rnd() * 3.4;
      spawnGorePiece(x, y, Math.cos(a) * sp, Math.sin(a) * sp, rad, life, kind, a + rnd() * 0.6, (rnd() - 0.5) * 7.5);
    }
  }

  function spawnGoreBurst(x, y, type, rad, crushed) {
    if (!GORE_FX) return;
    var tech = isTechType(type);
    var big = rad >= 22 || type === 5 || type === 7 || type === 9 || type === 11;
    var load = goreLoadScale();
    if (load <= 0) return;
    var localLimit = eN > 950 ? 2 : (eN > 620 ? 3 : 5);
    if (!effectAllowed(x, y, localLimit)) {
      spawnSplat(x, y, rad * (big ? 1.75 : 1.18), tech ? 1 : 0, tech ? 6.1 : 8.4);
      if (gN < MAX_GORE * 0.92 && rnd() < 0.72) spawnGoreSpray(x, y, tech ? 3 : 5, null, 0, tech ? 190 : 245, tech ? 5 : 0);
      return;
    }
    var force = crushed ? Math.atan2(y - player.y, x - player.x) : null;
    var spread = crushed ? 1.05 : 0;
    var bloodN = tech ? (big ? 10 : 5) : (big ? 36 : 24);
    var chunkN = tech ? (big ? 14 : 7) : (big ? 13 : 7);
    if (!big && eN > 900) {
      bloodN = Math.max(4, (bloodN * 0.58) | 0);
      chunkN = Math.max(2, (chunkN * 0.48) | 0);
    }
    if (tech) {
      spawnGoreSpray(x, y, chunkN, force, spread || 1.7, crushed ? 250 : 190, null);
      for (var k = 0; k < Math.max(1, Math.round(chunkN * load)); k++) {
        var a = force == null ? rnd() * TWO_PI : force + (rnd() - 0.5) * 1.25;
        var sp = 120 + rnd() * 240;
        var kind = rnd() < 0.62 ? 3 : 4;
        spawnGorePiece(x, y, Math.cos(a) * sp, Math.sin(a) * sp, (2.6 + rnd() * 4.4) * (big ? 1.25 : 1), 1.0 + rnd() * 0.9, kind, a, (rnd() - 0.5) * 8);
      }
      spawnGoreSpray(x, y, big ? 9 : 4, force, 1.4, 310, 5);
      spawnSplat(x, y, rad * (big ? 1.9 : 1.35), 1, 7.2);
    } else {
      spawnGoreSpray(x, y, bloodN, force, spread || 0, crushed ? 310 : 230, 0);
      var deathVariant = rnd();
      if (deathVariant < 0.26) {
        spawnGoreSpray(x, y - rad * 0.55, big ? 14 : 8, -Math.PI * 0.5, 0.95, big ? 390 : 330, 0);
        spawnSplat(x, y - rad * 0.22, rad * (big ? 1.75 : 1.24), 0, 9.0);
      } else if (deathVariant < 0.56) {
        spawnGoreSpray(x, y, big ? 18 : 11, null, 0, big ? 355 : 295, 0);
        if (rnd() < 0.74) spawnSplat(x + (rnd() - 0.5) * rad, y + (rnd() - 0.5) * rad, rad * (big ? 1.48 : 1.08), 0, 7.6);
      }
      for (var j = 0; j < Math.max(1, Math.round(chunkN * load)); j++) {
        var a2 = force == null ? rnd() * TWO_PI : force + (rnd() - 0.5) * 1.2;
        var sp2 = 95 + rnd() * 190;
        var kind2 = rnd() < 0.76 ? 1 : 2;
        spawnGorePiece(x, y, Math.cos(a2) * sp2, Math.sin(a2) * sp2, (2.5 + rnd() * 4.2) * (big ? 1.18 : 1), 0.95 + rnd() * 0.85, kind2, a2, (rnd() - 0.5) * 9);
      }
      spawnSplat(x, y, rad * (crushed ? 2.35 : (big ? 2.25 : 1.65)) * (0.9 + rnd() * 0.25), 0, 8.5);
      if (big && rnd() < 0.86) spawnGoreSpray(x, y - rad * 0.45, 12, -Math.PI * 0.5, 1.15, 350, 0);
    }
  }

  function updateGore(dt) {
    var t0 = performance.now();
    for (var s = sN - 1; s >= 0; s--) {
      slife[s] -= dt * 0.055;
      if (slife[s] <= 0) removeSplat(s);
    }
    for (var i = gN - 1; i >= 0; i--) {
      glife[i] -= dt;
      if (glife[i] <= 0) {
        removeGorePiece(i);
        continue;
      }
      gx0[i] += gvx[i] * dt;
      gy0[i] += gvy[i] * dt;
      ga[i] += gspin[i] * dt;
      var damp = Math.pow(gkind[i] === 0 || gkind[i] === 5 ? 0.015 : 0.055, dt);
      gvx[i] *= damp;
      gvy[i] *= damp;
    }
    perf.goreMs = performance.now() - t0;
  }

  function updateWorldFx(dt) {
    if (laserT > 0) laserT = Math.max(0, laserT - dt * 7.0);
    if (laserBurstT > 0) laserBurstT = Math.max(0, laserBurstT - dt);
    for (var i = boomN - 1; i >= 0; i--) {
      boomT[i] += dt;
      if (boomT[i] >= boomMax[i]) removeBoom(i);
    }
    for (var b = bubbleN - 1; b >= 0; b--) {
      bubbleT[b] += dt;
      if (bubbleT[b] >= bubbleMax[b]) {
        removeBubble(b);
        continue;
      }
      bubbleX[b] += bubbleVX[b] * dt;
      bubbleY[b] += bubbleVY[b] * dt;
      bubbleVX[b] *= Math.pow(0.16, dt);
      bubbleVY[b] *= Math.pow(0.12, dt);
    }
  }

  function spawnCorpse(x, y, type, rad, face) {
    if (!OLD_DEATH || CORPSE_CAP <= 0) return;
    var i;
    if (cN < CORPSE_CAP) i = cN++;
    else {
      i = cCursor;
      cCursor = (cCursor + 1) % CORPSE_CAP;
    }
    cx[i] = x;
    cy[i] = y;
    cr[i] = rad;
    ct[i] = 0;
    ctype[i] = type;
    cface[i] = face < 0 ? -1 : 1;
  }

  function removeCorpse(i) {
    var l = --cN;
    if (i === l) return;
    cx[i] = cx[l]; cy[i] = cy[l]; cr[i] = cr[l]; ct[i] = ct[l]; ctype[i] = ctype[l]; cface[i] = cface[l];
  }

  function updateCorpses(dt) {
    for (var i = cN - 1; i >= 0; i--) {
      ct[i] += dt;
      if (ct[i] > 0.72) removeCorpse(i);
    }
  }

  function spawnVeinTrail(x, y, angle) {
    if (!VEIN_FX || MAX_VEINS <= 0) return;
    var i;
    if (vN < MAX_VEINS) i = vN++;
    else {
      i = vCursor;
      vCursor = (vCursor + 1) % MAX_VEINS;
    }
    var len = 18 + rnd() * 28;
    vx0[i] = x;
    vy0[i] = y;
    va0[i] = angle;
    vlen[i] = len;
    vcurl[i] = (rnd() - 0.5) * 0.9;
    vgrow[i] = 0;
    vlife[i] = 4.8 + rnd() * 1.5;
    vb1a[i] = angle + (rnd() - 0.5) * 1.45;
    vb1l[i] = len * (0.38 + rnd() * 0.45);
    vb2a[i] = angle + (rnd() - 0.5) * 1.9;
    vb2l[i] = rnd() < 0.55 ? len * (0.28 + rnd() * 0.34) : 0;
  }

  function removeVein(i) {
    var l = --vN;
    if (i === l) return;
    vx0[i] = vx0[l]; vy0[i] = vy0[l]; va0[i] = va0[l]; vlen[i] = vlen[l]; vcurl[i] = vcurl[l];
    vgrow[i] = vgrow[l]; vlife[i] = vlife[l]; vb1a[i] = vb1a[l]; vb1l[i] = vb1l[l]; vb2a[i] = vb2a[l]; vb2l[i] = vb2l[l];
  }

  function updateVeinTrails(dt) {
    for (var i = vN - 1; i >= 0; i--) {
      if (vgrow[i] < 1) vgrow[i] = Math.min(1, vgrow[i] + dt * 4.6);
      vlife[i] -= dt;
      if (vlife[i] <= 0) removeVein(i);
    }
  }

  function resetLeeches() {
    for (var i = 0; i < leechTarget.length; i++) {
      leechTarget[i] = -1;
      leechGrab[i] = 0;
      leechPhase[i] = i * 1.731;
    }
    leechToken = 1;
  }

  function retargetLeechesAfterRemove(removed, last) {
    if (!leechTarget || !leechTarget.length) return;
    for (var i = 0; i < leechTarget.length; i++) {
      if (leechTarget[i] === removed) {
        leechTarget[i] = -1;
        leechGrab[i] = 0;
      } else if (removed !== last && leechTarget[i] === last) {
        leechTarget[i] = removed;
      }
    }
  }

  function currentLeechLevel() {
    if (!LEECH_FX || MAX_LEECHES <= 0) return 0;
    return Math.min(8, player.lashLvl);
  }

  function updateLeeches(dt) {
    var lvl = currentLeechLevel();
    if (lvl <= 0 || eN <= 0) {
      perf.leeches = 0;
      perf.leechMs = 0;
      for (var z = 0; z < leechTarget.length; z++) {
        leechTarget[z] = -1;
        leechGrab[z] = Math.max(0, leechGrab[z] - dt * 4);
      }
      return;
    }
    var t0 = performance.now();
    var slots = Math.min(MAX_LEECHES, 2 + lvl);
    var range = 112 + lvl * 18 + Math.min(55, player.level * 1.4);
    var range2 = range * range;
    var drop2 = range2 * 1.62;
    var dps = (12 + lvl * 6) * Math.max(0.25, player.dmg / 20) * (player.unleash > 0 ? 1.35 : 1);
    var active = 0;
    var draining = 0;
    leechToken = (leechToken + 1) & 65535;
    if (leechToken === 0) {
      leechMark.fill(0);
      leechToken = 1;
    }

    for (var i = 0; i < leechTarget.length; i++) {
      if (i >= slots) {
        leechTarget[i] = -1;
        leechGrab[i] = Math.max(0, leechGrab[i] - dt * 3.4);
        continue;
      }
      var t = leechTarget[i];
      if (t >= 0) {
        if (t >= eN) {
          leechTarget[i] = -1;
        } else {
          var dx = ex[t] - player.x;
          var dy = ey[t] - player.y;
          if (dx * dx + dy * dy > drop2) {
            leechTarget[i] = -1;
          } else {
            leechMark[t] = leechToken;
            active++;
          }
        }
      }
    }

    for (var s = 0; s < slots; s++) {
      if (leechTarget[s] >= 0) continue;
      var best = -1;
      var bd = 1e30;
      var rootA = (s / slots) * TWO_PI + state.t * 0.42;
      var pref = range * (0.48 + ((s + state.tick) & 3) * 0.075);
      var pref2 = pref * pref;
      for (var e = 0; e < eN; e++) {
        if (leechMark[e] === leechToken) continue;
        var exd = ex[e] - player.x;
        var eyd = ey[e] - player.y;
        var ed2 = exd * exd + eyd * eyd;
        if (ed2 > range2) continue;
        var ad = Math.abs(angleDelta(rootA, Math.atan2(eyd, exd)));
        var score = Math.abs(ed2 - pref2) / Math.max(1, pref2) + ad * 0.18;
        if (score < bd) {
          bd = score;
          best = e;
        }
      }
      if (best >= 0) {
        leechTarget[s] = best;
        leechMark[best] = leechToken;
        active++;
      }
    }

    for (var l = 0; l < slots; l++) {
      var target = leechTarget[l];
      if (target >= 0 && target < eN) {
        leechGrab[l] = Math.min(1, leechGrab[l] + dt * 4.5);
        if (leechGrab[l] > 0.42) {
          var dmg = dps * dt * leechGrab[l];
          ehp[target] -= dmg;
          draining += dmg;
          if (player.hp < player.maxHp) player.hp = Math.min(player.maxHp, player.hp + dmg * (player.unleash > 0 ? 0.085 : 0.035));
          if (((state.tick + l) & 7) === 0 && effectAllowed(ex[target], ey[target], eN > 850 ? 1 : 2)) {
            var a = Math.atan2(player.y - ey[target], player.x - ex[target]);
            spawnParticle(ex[target], ey[target], Math.cos(a) * 45, Math.sin(a) * 45, 1.5, 0.16, 0);
          }
          if (ehp[target] <= 0) {
            killEnemy(target, false);
            leechTarget[l] = -1;
            leechGrab[l] = 0;
          }
        }
      } else {
        leechTarget[l] = -1;
        leechGrab[l] = Math.max(0, leechGrab[l] - dt * 3.2);
      }
    }
    if (draining > 0) player.hurt = Math.max(player.hurt, Math.min(0.38, draining * 0.0015));
    perf.leeches = active;
    perf.leechMs = performance.now() - t0;
  }

  function spawnTrack(x, y, angle) {
    var i;
    if (tN < TRACK_CAP) i = tN++;
    else {
      i = tCursor;
      tCursor = (tCursor + 1) % TRACK_CAP;
    }
    txs[i] = x;
    tys[i] = y;
    ta[i] = angle;
    tlife[i] = 1;
  }

  function killEnemy(i, crushed) {
    var x = ex[i], y = ey[i], type = etype[i], rad = er[i];
    var pay = T_PAY[type];
    var tech = isTechType(type);
    var big = rad >= 22 || type === 5 || type === 7 || type === 9 || type === 11;
    state.kills++;
    state.blood += pay;
    playSfx(tech ? 'metal' : 'squish', big ? 0.50 : 0.38, 0.045);
    if (crushed && !tech) playSfx('crunch', 0.34, 0.075);
    spawnCorpse(x, y, type, rad, player.x < x ? -1 : 1);
    spawnMote(x, y, Math.min(6, pay));
    if (pay > 5) spawnMote(x + rad * 0.35, y - rad * 0.2, Math.min(6, pay));
    spawnGoreBurst(x, y, type, rad, crushed);
    if (type === 7 || type === 11 || rad >= 25) spawnBoom(x, y, rad * (type === 7 || type === 11 ? 1.55 : 1.15), isTechType(type) ? 1 : 0);
    var highLoad = eN > 850 || pN > 1900;
    var limit = highLoad ? 1 : (eN > 520 ? 2 : 4);
    if (effectAllowed(x, y, limit)) {
      var burst = highLoad ? 3 : (type >= 5 ? 14 : 7);
      var base = rnd() * TWO_PI;
      for (var k = 0; k < burst; k++) {
        var a = base + (k / burst) * TWO_PI + (rnd() - 0.5) * 0.45;
        var sp = 70 + rnd() * (type >= 5 ? 160 : 110);
        spawnParticle(x, y, Math.cos(a) * sp, Math.sin(a) * sp, 1.8 + rnd() * 3.2, 0.25 + rnd() * 0.32, (type === 4 || type === 11) ? 3 : 0);
      }
    }
    if (crushed || rnd() < 0.45) spawnDecal(x, y, rad * (1.3 + rnd() * 1.5), (type === 4 || type === 11) ? 3 : 0, 0.12 + rnd() * 0.12);
    var heal = crushed ? (3 + player.thirst) : (player.rangedHeal ? player.thirst : 0);
    if (player.unleash > 0) heal *= 2.6;
    if (heal > 0) {
      player.hp = Math.min(player.maxHp, player.hp + heal);
      player.hurt = Math.max(player.hurt, 0.18);
    }
    if (crushed) {
      player.meter = Math.min(100, player.meter + 2.5 + pay * 0.8);
      if (player.meter >= 100) triggerUnleash();
    }
    if ((type === 7 || type === 11) && eN < MAX_ENEMIES - 3) {
      for (var s = 0; s < 3; s++) {
        spawnEnemy(1);
        ex[eN - 1] = x + Math.cos(s / 3 * TWO_PI) * 28;
        ey[eN - 1] = y + Math.sin(s / 3 * TWO_PI) * 28;
      }
    }
    removeEnemy(i);
  }

  function applyUpgradeId(u) {
    if (u === 0) {
      player.dmg *= 1.35;
      bumpTier('cannon');
    } else if (u === 1) {
      player.speed *= 1.14;
      bumpTier('treads');
    } else if (u === 2) {
      player.crushDps *= 1.30;
      player.crush += 7;
      bumpTier('treads');
    } else if (u === 3) {
      player.thirst += 4;
      player.rangedHeal = true;
      bumpTier('thirst');
      bumpTier('core');
    } else if (u === 4) {
      player.fireRate *= 1.25;
      bumpTier('cannon');
    } else if (u === 5) {
      player.pickR *= 1.45;
      bumpTier('core');
    } else if (u === 6) {
      player.maxHp += 25;
      player.hp = Math.min(player.maxHp, player.hp + 35);
      bumpTier('armor');
    } else if (u === 7) {
      player.barrels = Math.min(8, player.barrels + 1);
      bumpTier('cannon');
      bumpTier('core');
    } else {
      player.lashLvl = Math.min(8, player.lashLvl + 1);
      bumpTier('frenzy');
      bumpTier('thirst');
    }
  }

  function applyUpgrade() {
    var u = (state.tick + player.level * 3) % upgradeNames.length;
    applyUpgradeId(u);
    player.level++;
    player.xp -= player.xpNext;
    player.xpNext = nextXpForLevel(player.level);
    state.banner = upgradeNames[u];
    state.bannerT = 1.45;
  }

  function gainXp(v) {
    player.xp += v;
    if (state.mode === 'PLAYING' && player.xp >= player.xpNext) startLevelUp();
  }

  function startLevelUp() {
    if (state.mode === 'GAMEOVER') return;
    state.mode = 'LEVELUP';
    state.banner = '';
    state.bannerT = 0;
    rollUpgradeDraft();
  }

  function chooseUpgrade(slot) {
    if (state.mode !== 'LEVELUP' || slot < 0 || slot > 2) return false;
    var u = upgradePick[slot];
    applyUpgradeId(u);
    player.level++;
    player.xp -= player.xpNext;
    player.xpNext = nextXpForLevel(player.level);
    state.banner = upgradeNames[u];
    state.bannerT = 1.1;
    if (player.xp >= player.xpNext) startLevelUp();
    else state.mode = 'PLAYING';
    return true;
  }

  function layoutUpgradeCards() {
    var mobile = cssW < 720;
    var gap = mobile ? 10 : 16;
    var cw = mobile ? Math.min(360, cssW - 48) : Math.min(230, (cssW - 96) / 3);
    var ch = mobile ? 86 : 132;
    var startX = mobile ? (cssW - cw) * 0.5 : (cssW - (cw * 3 + gap * 2)) * 0.5;
    var startY = mobile ? Math.max(92, (cssH - (ch * 3 + gap * 2)) * 0.5) : Math.max(112, cssH * 0.5 - ch * 0.5);
    for (var i = 0; i < 3; i++) {
      var k = i * 4;
      upgradeRect[k] = mobile ? startX : startX + i * (cw + gap);
      upgradeRect[k + 1] = mobile ? startY + i * (ch + gap) : startY;
      upgradeRect[k + 2] = cw;
      upgradeRect[k + 3] = ch;
    }
  }

  function cardAt(x, y) {
    if (state.mode !== 'LEVELUP') return -1;
    layoutUpgradeCards();
    for (var i = 0; i < 3; i++) {
      var k = i * 4;
      if (x >= upgradeRect[k] && x <= upgradeRect[k] + upgradeRect[k + 2] &&
          y >= upgradeRect[k + 1] && y <= upgradeRect[k + 1] + upgradeRect[k + 3]) return i;
    }
    return -1;
  }

  function bankRun() {
    if (state.runBanked) return;
    state.runBanked = true;
    totalBank += Math.floor(state.blood);
    if (state.t > bestTime) bestTime = state.t;
    saveMeta();
  }

  function resetGame(startPlaying, startMinute) {
    endJoystick();
    pointerDown = false;
    pointerId = -1;
    if (startPlaying == null) startPlaying = AUTO_START;
    if (startMinute == null) startMinute = startPlaying ? START_MIN : 0;
    player.x = 0; player.y = 0; player.vx = 0; player.vy = 0; player.hull = 0; player.turret = 0;
    player.r = 25; player.hp = 42; player.maxHp = 42; player.xp = 0; player.xpNext = 6; player.level = 1;
    player.speed = 205; player.crush = 9; player.crushDps = 48; player.dmg = 11; player.fireRate = 4.8;
    player.pickR = 135; player.thirst = 0; player.rangedHeal = false; player.barrels = 1; player.lashLvl = 0;
    player.regen = 0; player.frenzyMul = 1; player.meter = 0; player.unleash = 0; player.unleashFlash = 0; player.recoil = 0; player.hurt = 0;
    applyMetaToPlayer();
    state.mode = startPlaying ? 'PLAYING' : 'MENU'; state.t = 0; state.tick = 1; state.kills = 0; state.blood = 0;
    state.spawnCredit = 0; state.fireCd = 0; state.banner = ''; state.bannerT = 0; state.gameOverT = 0; state.runBanked = false; state.paused = false;
    eN = 0; bN = 0; mN = 0; pN = 0; dN = 0; cN = 0; tN = 0; vN = 0; gN = 0; sN = 0; boomN = 0; bubbleN = 0;
    dCursor = 0; pCursor = 0; cCursor = 0; tCursor = 0; vCursor = 0; gCursor = 0; sCursor = 0; boomCursor = 0; bubbleCursor = 0; trackAcc = 0; veinAcc = 0; unleashTrailAcc = 0;
    laserT = 0;
    laserBurstT = 0;
    laserBurstMax = 0;
    syncTankTiersFromMeta();
    resetLeeches();
    resetEnvironmentState();
    seenType.fill(0);
    if (startPlaying && startMinute > 0) skipToMinute(startMinute);
    else resetPerfTiming();
  }

  function startRun(minute) {
    resetGame(true, minute || 0);
  }

  function skipToMinute(min) {
    state.mode = 'PLAYING';
    state.paused = false;
    upgradeHover = -1;
    boostForMinute(min);
    state.t = min * 60;
    for (var st = 0; st < seenType.length; st++) if (T_UNLOCK[st] <= min) seenType[st] = 1;
    state.spawnCredit = 0;
    var target = desiredEnemies();
    var guard = 0;
    while (eN < target && guard++ < MAX_ENEMIES + 100) spawnEnemy();
    state.banner = 'MIN ' + min;
    state.bannerT = 1.2;
    resetPerfTiming();
  }

  function boostForMinute(min) {
    var targetLevel = 1 + Math.floor(min * 4.2);
    while (player.level < targetLevel) {
      applyUpgradeId((player.level - 1) % upgradeNames.length);
      player.level++;
    }
    player.maxHp += min * 16;
    player.hp = player.maxHp;
    player.crush += min * 1.8;
    player.crushDps *= 1 + min * 0.08;
    player.dmg *= 1 + min * 0.055;
    player.fireRate *= 1 + min * 0.035;
    player.pickR += min * 7;
    player.xp = 0;
    player.xpNext = nextXpForLevel(player.level);
    player.meter = 100;
  }

  function updatePlayer(dt) {
    var ix = 0, iy = 0;
    if (keys[65] || keys[37]) ix -= 1;
    if (keys[68] || keys[39]) ix += 1;
    if (keys[87] || keys[38]) iy -= 1;
    if (keys[83] || keys[40]) iy += 1;
    if (joyActive) {
      ix += joyDX;
      iy += joyDY;
    } else if (pointerDown) {
      var dx = pointerX - cssW * 0.5;
      var dy = pointerY - cssH * 0.5;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d > 18) {
        ix += dx / d;
        iy += dy / d;
      }
    }
    var mag = Math.sqrt(ix * ix + iy * iy);
    if (mag > 0.001) {
      ix /= mag;
      iy /= mag;
      player.vx += ix * player.speed * 6.2 * dt;
      player.vy += iy * player.speed * 6.2 * dt;
    }
    var sp2 = player.vx * player.vx + player.vy * player.vy;
    var max = player.speed * (player.unleash > 0 ? 1.22 : (player.meter >= 100 ? 1.12 : 1));
    if (sp2 > max * max) {
      var inv = max / Math.sqrt(sp2);
      player.vx *= inv;
      player.vy *= inv;
      sp2 = max * max;
    }
    if (sp2 > 70 * 70) {
      var wantHull = Math.atan2(player.vy, player.vx);
      player.hull += angleDelta(player.hull, wantHull) * Math.min(0.46, dt * 8.4);
    }
    player.x += player.vx * dt;
    player.y += player.vy * dt;
    if (BREAK_ENV) {
      var breakReach = player.r + player.crush;
      crushNearbyDecals(player.x, player.y, breakReach * 0.82);
      crushNearbyRocks(player.x, player.y, breakReach);
      collidePlayerObstacles();
    }
    var rage = tankRageLevel();
    if (MAX_BUBBLES > 0 && TANK_LAYERS && rage > 0.08 && rnd() < dt * (0.28 + rage * rage * 5.4) * (player.unleash > 0 ? 2.35 : 1)) {
      spawnRageBubble(rage, player.unleash > 0 ? 1.18 : 1);
    }
    if (player.unleash > 0 && (GORE_FX || VEIN_FX)) {
      unleashTrailAcc += (Math.sqrt(sp2) + 72) * dt;
      var trailSteps = 0;
      while (unleashTrailAcc > 32 && trailSteps++ < 2) {
        unleashTrailAcc -= 32;
        var tail = player.hull + Math.PI + (rnd() - 0.5) * 0.34;
        var side = player.hull + Math.PI * 0.5;
        var tx = player.x + Math.cos(tail) * (18 + rnd() * 12) + Math.cos(side) * (rnd() - 0.5) * 16;
        var ty = player.y + Math.sin(tail) * (18 + rnd() * 12) + Math.sin(side) * (rnd() - 0.5) * 16;
        if (VEIN_FX) spawnVeinTrail(tx, ty, tail + (rnd() - 0.5) * 0.62);
        if (GORE_FX) {
          if (((state.tick + trailSteps) & 1) === 0) spawnSplat(tx, ty, 9 + rnd() * 15, 0, 4.8);
          if (rnd() < 0.26) spawnGoreSpray(tx, ty, 2, tail, 0.8, 125, 0);
        }
      }
    }
    if (VEIN_FX && (currentLeechLevel() > 0 || player.unleash > 0) && sp2 > 90 * 90) {
      veinAcc += Math.sqrt(sp2) * dt;
      var veinGap = player.unleash > 0 ? 42 : 22;
      while (veinAcc > veinGap) {
        veinAcc -= veinGap;
        spawnVeinTrail(player.x - Math.cos(player.hull) * 18, player.y - Math.sin(player.hull) * 18, player.hull + Math.PI + (rnd() - 0.5) * 0.75);
      }
    }
    if (OLD_ENV && sp2 > 120 * 120) {
      trackAcc += Math.sqrt(sp2) * dt;
      while (trackAcc > 34) {
        trackAcc -= 34;
        spawnTrack(player.x - Math.sin(player.hull) * 18, player.y + Math.cos(player.hull) * 18, player.hull);
        spawnTrack(player.x + Math.sin(player.hull) * 18, player.y - Math.cos(player.hull) * 18, player.hull);
      }
    }
    for (var ti = tN - 1; ti >= 0; ti--) {
      tlife[ti] -= dt * 0.045;
      if (tlife[ti] <= 0) {
        var l = --tN;
        if (ti !== l) {
          txs[ti] = txs[l]; tys[ti] = tys[l]; ta[ti] = ta[l]; tlife[ti] = tlife[l];
        }
      }
    }
    var damp = Math.pow(0.0009, dt);
    player.vx *= damp;
    player.vy *= damp;
    if (player.recoil > 0) player.recoil = Math.max(0, player.recoil - dt * 8);
    if (player.hurt > 0) player.hurt = Math.max(0, player.hurt - dt * 3);
  }

  function updateEnemies(dt) {
    var nearest = -1;
    var nearestD2 = 1e30;
    var crushR = player.r + player.crush;
    var dmgScale = 1 + state.t * 0.0035;
    var playerSpeed = Math.sqrt(player.vx * player.vx + player.vy * player.vy);
    var fxLimit = eN > 850 ? 1 : (eN > 520 ? 2 : 3);
    var contactDmg = 0;
    var contactDmgCap = 46 + player.level * 2.4;

    for (var i = eN - 1; i >= 0; i--) {
      var x = ex[i], y = ey[i];
      var dx = player.x - x, dy = player.y - y;
      var d2 = dx * dx + dy * dy + 0.0001;
      if (d2 < nearestD2) { nearestD2 = d2; nearest = i; }
      var inv = 1 / Math.sqrt(d2);
      var ux = dx * inv, uy = dy * inv;
      var type = etype[i];
      var sp = espd[i];
      ephase[i] += dt;
      eface[i] = Math.atan2(uy, ux);

      if (type === 3 || type === 8) {
        ecd[i] -= dt;
        if (ecd[i] <= 0) ecd[i] = 1.1 + rnd() * 0.9;
        var charge = ecd[i] < (type === 8 ? 0.42 : 0.28) ? (type === 8 ? 2.1 : 2.35) : 1;
        x += ux * sp * charge * dt;
        y += uy * sp * charge * dt;
      } else if (type === 4 || type === 6 || type === 10 || type === 11) {
        var wave = Math.sin(ephase[i] * (type === 6 || type === 10 ? 5.4 : 3.7)) * (type === 6 || type === 10 ? 0.72 : 0.48);
        x += (ux - uy * wave) * sp * dt;
        y += (uy + ux * wave) * sp * dt;
      } else if (type === 5) {
        x += ux * sp * dt;
        y += uy * sp * dt;
        ecd[i] -= dt;
        if (ecd[i] <= 0 && eN < MAX_ENEMIES - 1) {
          ecd[i] = 2.6 + rnd() * 1.5;
          spawnEnemy(1);
          ex[eN - 1] = x + (rnd() - 0.5) * 36;
          ey[eN - 1] = y + (rnd() - 0.5) * 36;
        }
      } else {
        x += ux * sp * dt;
        y += uy * sp * dt;
      }

      x += evx[i] * dt;
      y += evy[i] * dt;
      evx[i] *= 0.89;
      evy[i] *= 0.89;

      var rr = crushR + er[i];
      if (d2 < rr * rr) {
        ehp[i] -= player.crushDps * dt * (playerSpeed > 120 ? 1.45 : 1);
        var rawDmg = (5.5 + type * 1.7) * dmgScale * dt;
        if (contactDmg < contactDmgCap * dt) {
          var allowed = Math.min(rawDmg, contactDmgCap * dt - contactDmg);
          player.hp -= allowed;
          contactDmg += allowed;
        }
        player.hurt = 1;
        evx[i] -= ux * 410 * dt;
        evy[i] -= uy * 410 * dt;
        if (playerSpeed > 90 && effectAllowed(x, y, fxLimit) && ((state.tick + i) & 1) === 0) {
          var a = Math.atan2(-uy, -ux) + (rnd() - 0.5) * 0.8;
          var spv = 100 + rnd() * 120;
          spawnParticle(x, y, Math.cos(a) * spv, Math.sin(a) * spv, 1.4 + rnd() * 2.2, 0.22 + rnd() * 0.25, (type === 4 || type === 11) ? 3 : 0);
        }
        if (GORE_FX && playerSpeed > 70 && ((state.tick + i) & (eN > 850 ? 3 : 1)) === 0 && effectAllowed(x, y, eN > 850 ? 1 : 2)) {
          var techContact = isTechType(type);
          var sprayA = Math.atan2(-uy, -ux) + (rnd() - 0.5) * 0.75;
          playSfx(techContact ? 'metal' : 'hitflesh', techContact ? 0.16 : 0.20, 0.11);
          spawnGoreSpray(x, y, techContact ? 3 : 6, sprayA, 1.15, techContact ? 250 : 320, techContact ? 5 : 0);
          if (!techContact && rnd() < (eN > 850 ? 0.18 : 0.34)) spawnSplat(x, y, er[i] * (0.92 + rnd() * 0.68), 0, 5.8);
        }
      }

      ex[i] = x;
      ey[i] = y;
      if (ehp[i] <= 0) {
        killEnemy(i, d2 < rr * rr);
      }
    }
    return nearest;
  }

  function buildColliderGrid() {
    colliderOriginX = player.x - COLLIDER_HALF * COLLIDER_CELL;
    colliderOriginY = player.y - COLLIDER_HALF * COLLIDER_CELL;
    colliderHead.fill(-1);
    for (var i = 0; i < eN; i++) {
      var cx0 = ((ex[i] - colliderOriginX) / COLLIDER_CELL) | 0;
      var cy0 = ((ey[i] - colliderOriginY) / COLLIDER_CELL) | 0;
      if (cx0 < 0 || cy0 < 0 || cx0 >= COLLIDER_GRID || cy0 >= COLLIDER_GRID) {
        colliderCell[i] = -1;
        colliderNext[i] = -1;
        continue;
      }
      var cell = cy0 * COLLIDER_GRID + cx0;
      colliderCell[i] = cell;
      colliderNext[i] = colliderHead[cell];
      colliderHead[cell] = i;
    }
  }

  function resolveEnemyColliders(dt) {
    if (!COLLIDERS || eN <= 0) {
      perf.colliderMs = 0;
      perf.colliderPairs = 0;
      perf.colliderContacts = 0;
      perf.colliderSkipped = 0;
      perf.colliderPush = 0;
      return;
    }
    var t0 = performance.now();
    buildColliderGrid();
    var pairs = 0;
    var contacts = 0;
    var skipped = 0;
    var pushed = 0;

    if (COLLIDER_PAIR_CAP > 0 && COLLIDER_PAIR_LIMIT > 0) {
      outer:
      for (var i = 0; i < eN; i++) {
        var cell = colliderCell[i];
        if (cell < 0) continue;
        var cx0 = cell % COLLIDER_GRID;
        var cy0 = (cell / COLLIDER_GRID) | 0;
        var localPairs = 0;
        for (var oy0 = -1; oy0 <= 1; oy0++) {
          var yy = cy0 + oy0;
          if (yy < 0 || yy >= COLLIDER_GRID) continue;
          for (var ox0 = -1; ox0 <= 1; ox0++) {
            var xx = cx0 + ox0;
            if (xx < 0 || xx >= COLLIDER_GRID) continue;
            var j = colliderHead[yy * COLLIDER_GRID + xx];
            while (j >= 0) {
              if (j > i) {
                pairs++;
                if (pairs > COLLIDER_PAIR_CAP) {
                  skipped++;
                  break outer;
                }
                var dx = ex[i] - ex[j];
                var dy = ey[i] - ey[j];
                var minD = (er[i] + er[j]) * 0.72;
                var d2 = dx * dx + dy * dy;
                if (d2 < minD * minD) {
                  var d = Math.sqrt(d2);
                  var nx, ny;
                  if (d > 0.001) {
                    nx = dx / d;
                    ny = dy / d;
                  } else {
                    var a = (((i * 16807 + j * 48271) & 1023) / 1024) * TWO_PI;
                    nx = Math.cos(a);
                    ny = Math.sin(a);
                    d = 0.001;
                  }
                  var push = Math.min(9.5 * dt * 60, (minD - d) * 0.42);
                  var sum = er[i] + er[j] + 0.001;
                  var wi = er[j] / sum;
                  var wj = er[i] / sum;
                  ex[i] += nx * push * wi;
                  ey[i] += ny * push * wi;
                  ex[j] -= nx * push * wj;
                  ey[j] -= ny * push * wj;
                  pushed += push;
                }
                localPairs++;
                if (localPairs >= COLLIDER_PAIR_LIMIT) break;
              }
              j = colliderNext[j];
            }
            if (localPairs >= COLLIDER_PAIR_LIMIT) break;
          }
          if (localPairs >= COLLIDER_PAIR_LIMIT) break;
        }
      }
    }

    var pxPush = 0;
    var pyPush = 0;
    var solidR = player.r + 8;
    for (var e = 0; e < eN; e++) {
      var dxp = player.x - ex[e];
      var dyp = player.y - ey[e];
      var minP = solidR + er[e] * 0.82;
      var pd2 = dxp * dxp + dyp * dyp;
      if (pd2 >= minP * minP) continue;
      var pd = Math.sqrt(pd2);
      var ux, uy;
      if (pd > 0.001) {
        ux = dxp / pd;
        uy = dyp / pd;
      } else {
        var pa = ((e * 1103515245 + state.tick * 12345) & 1023) / 1024 * TWO_PI;
        ux = Math.cos(pa);
        uy = Math.sin(pa);
        pd = 0.001;
      }
      var overlap = minP - pd;
      var enemyPush = Math.min(14 * dt * 60, overlap * 0.58);
      ex[e] -= ux * enemyPush;
      ey[e] -= uy * enemyPush;
      pxPush += ux * overlap * 0.16;
      pyPush += uy * overlap * 0.16;
      evx[e] -= ux * 18 * dt;
      evy[e] -= uy * 18 * dt;
      contacts++;
    }
    var p2 = pxPush * pxPush + pyPush * pyPush;
    if (p2 > 0.0001) {
      var pm = Math.sqrt(p2);
      var cap = COLLIDER_PLAYER_CAP;
      if (pm > cap) {
        pxPush *= cap / pm;
        pyPush *= cap / pm;
        pm = cap;
      }
      player.x += pxPush;
      player.y += pyPush;
      var nxp = pxPush / pm;
      var nyp = pyPush / pm;
      var into = player.vx * nxp + player.vy * nyp;
      if (into < 0) {
        player.vx -= nxp * into * 1.35;
        player.vy -= nyp * into * 1.35;
      }
      player.vx += pxPush * 28;
      player.vy += pyPush * 28;
      player.vx *= 0.84;
      player.vy *= 0.84;
      pushed += pm;
    }

    perf.colliderMs = performance.now() - t0;
    perf.colliderPairs = pairs;
    perf.colliderContacts = contacts;
    perf.colliderSkipped = skipped;
    perf.colliderPush = pushed;
  }

  function explodeBullet(x, y, radius, damage) {
    var r2 = radius * radius;
    spawnBoom(x, y, radius * 0.75, 1);
    playSfx('boom', 0.48, 0.055);
    if (effectAllowed(x, y, eN > 850 ? 1 : 3)) {
      var burst = eN > 850 ? 4 : 9;
      for (var k = 0; k < burst; k++) {
        var a = k / burst * TWO_PI + rnd() * 0.28;
        var sp = 90 + rnd() * 120;
        spawnParticle(x, y, Math.cos(a) * sp, Math.sin(a) * sp, 2.4 + rnd() * 2.6, 0.24 + rnd() * 0.26, 2);
      }
    }
    for (var e = eN - 1; e >= 0; e--) {
      var dx = ex[e] - x;
      var dy = ey[e] - y;
      var d2 = dx * dx + dy * dy;
      if (d2 > r2) continue;
      var falloff = 1 - Math.sqrt(d2) / Math.max(1, radius);
      ehp[e] -= damage * (0.45 + falloff * 0.85);
      if (ehp[e] <= 0) killEnemy(e, false);
    }
  }

  function updateBullets(dt) {
    for (var i = bN - 1; i >= 0; i--) {
      bx[i] += bvx[i] * dt;
      by[i] += bvy[i] * dt;
      blife[i] -= dt;
      if (obstacleHitAt(bx[i], by[i])) {
        damageCurrentObstacle(bdmg[i] * 0.65);
        if (bkind[i] === 1) explodeBullet(bx[i], by[i], brad[i] || 58, bdmg[i]);
        removeBullet(i);
        continue;
      }
      var hit = -1;
      for (var e = eN - 1; e >= 0; e--) {
        var dx = ex[e] - bx[i], dy = ey[e] - by[i];
        var r = er[e] + 4;
        if (dx * dx + dy * dy < r * r) {
          hit = e;
          break;
        }
      }
      if (hit >= 0) {
        if (bkind[i] === 1) {
          explodeBullet(bx[i], by[i], brad[i] || 58, bdmg[i]);
        } else {
          ehp[hit] -= bdmg[i];
          if (effectAllowed(bx[i], by[i], eN > 850 ? 1 : 3)) {
            spawnParticle(bx[i], by[i], -bvx[i] * 0.12, -bvy[i] * 0.12, 2.2, 0.18, bkind[i] === 2 ? 3 : 2);
          }
          if (ehp[hit] <= 0) killEnemy(hit, false);
        }
        removeBullet(i);
      } else if (blife[i] <= 0) {
        if (bkind[i] === 1) explodeBullet(bx[i], by[i], brad[i] || 58, bdmg[i] * 0.72);
        removeBullet(i);
      }
    }
  }

  function updateMotes(dt) {
    var pr2 = player.pickR * player.pickR;
    for (var i = mN - 1; i >= 0; i--) {
      var dx = player.x - mx[i], dy = player.y - my[i];
      var d2 = dx * dx + dy * dy + 0.0001;
      if (d2 < pr2) {
        var inv = 1 / Math.sqrt(d2);
        mvx[i] += dx * inv * 760 * dt;
        mvy[i] += dy * inv * 760 * dt;
      }
      mx[i] += mvx[i] * dt;
      my[i] += mvy[i] * dt;
      mvx[i] *= 0.965;
      mvy[i] *= 0.965;
      if (d2 < (player.r + 14) * (player.r + 14)) {
        gainXp(mval[i]);
        playTone(190 + Math.min(5, mval[i]) * 22, 0.035, 0.018);
        removeMote(i);
      }
    }
  }

  function updateParticles(dt) {
    for (var i = pN - 1; i >= 0; i--) {
      plife[i] -= dt;
      if (plife[i] <= 0) {
        removeParticle(i);
        continue;
      }
      px[i] += pvx[i] * dt;
      py[i] += pvy[i] * dt;
      pvx[i] *= 0.945;
      pvy[i] *= 0.945;
    }
  }

  function autoFire(dt, nearest) {
    state.fireCd -= dt;
    if (nearest < 0 || nearest >= eN || eN <= 0) return;
    var dx = ex[nearest] - player.x;
    var dy = ey[nearest] - player.y;
    var d = Math.sqrt(dx * dx + dy * dy) || 1;
    var a = Math.atan2(dy, dx);
    var aimErr = angleDelta(player.turret, a);
    player.turret += aimErr * Math.min(0.5, dt * 9.6);
    var weapon = currentWeapon();
    if (weapon.id === 'laser') {
      var laserTier = currentWeaponTier();
      var laserAimOk = Math.abs(angleDelta(player.turret, a)) < 0.38 || laserBurstT > 0 || state.fireCd < -0.16;
      if (laserBurstT <= 0) {
        laserT = 0;
        if (state.fireCd > 0 || !laserAimOk) return;
        laserBurstMax = 0.17 + laserTier * 0.012;
        laserBurstT = laserBurstMax;
        state.fireCd = laserBurstMax + Math.max(0.18, 0.34 - laserTier * 0.022);
        playSfx('laser', 0.30, 0.08, 0.98 + rnd() * 0.05);
      }
      var ca = Math.cos(player.turret);
      var sa = Math.sin(player.turret);
      var range = 720;
      var width = 12 + laserTier * 1.3;
      var beamPower = Math.min(1, (laserBurstMax - laserBurstT) / 0.045) * Math.min(1, laserBurstT / 0.055);
      beamPower = Math.max(0.28, beamPower) * (0.86 + 0.14 * Math.sin(state.t * 48));
      var dps = player.dmg * player.fireRate * 2.75 * beamPower;
      for (var le = eN - 1; le >= 0; le--) {
        var rx = ex[le] - player.x;
        var ry = ey[le] - player.y;
        var along = rx * ca + ry * sa;
        if (along < 0 || along > range) continue;
        var side = Math.abs(-rx * sa + ry * ca);
        if (side > width + er[le]) continue;
        ehp[le] -= dps * dt;
        if (((state.tick + le) & 7) === 0 && effectAllowed(ex[le], ey[le], eN > 850 ? 1 : 2)) {
          spawnParticle(ex[le], ey[le], -ca * 40, -sa * 40, 1.8, 0.15, 0);
        }
        if (ehp[le] <= 0) killEnemy(le, false);
      }
      laserX0 = player.x + ca * 24;
      laserY0 = player.y + sa * 24;
      laserX1 = player.x + ca * range;
      laserY1 = player.y + sa * range;
      laserT = beamPower;
      player.recoil = Math.max(player.recoil, 0.32);
      return;
    }
    if (state.fireCd > 0) return;
    var aimed = Math.abs(angleDelta(player.turret, a)) < 0.52 || state.fireCd < -0.22;
    if (!aimed) return;
    if (weapon.id === 'flak') {
      var pellets = 5 + Math.max(0, Math.min(5, player.barrels | 0));
      for (var f = 0; f < pellets && bN < MAX_BULLETS; f++) {
        var fa = player.turret + (rnd() - 0.5) * 0.58;
        var fs = 560 + rnd() * 190;
        spawnBullet(player.x + Math.cos(fa) * 28, player.y + Math.sin(fa) * 28, Math.cos(fa) * fs, Math.sin(fa) * fs, player.dmg * 0.44, 2, 0, 0.34 + rnd() * 0.08);
      }
      state.fireCd = 2.75 / player.fireRate;
      playSfx('flak', 0.34, 0.055);
    } else if (weapon.id === 'missile') {
      var missiles = player.barrels >= 4 ? 2 : 1;
      for (var m = 0; m < missiles && bN < MAX_BULLETS; m++) {
        var ma = player.turret + (m - (missiles - 1) * 0.5) * 0.22;
        spawnBullet(player.x + Math.cos(ma) * 30, player.y + Math.sin(ma) * 30, Math.cos(ma) * 420, Math.sin(ma) * 420, player.dmg * 1.65, 1, 64 + currentWeaponTier() * 5, 1.85);
      }
      state.fireCd = 3.8 / player.fireRate;
      playSfx('missile', 0.42, 0.075);
    } else {
      var speed = 720;
      var shots = Math.max(1, Math.min(8, player.barrels | 0));
      var spread = shots > 1 ? 0.13 : 0;
      for (var s = 0; s < shots && bN < MAX_BULLETS; s++) {
        var a2 = player.turret + (s - (shots - 1) * 0.5) * spread;
        var sx = player.x + Math.cos(a2) * 28;
        var sy = player.y + Math.sin(a2) * 28;
        spawnBullet(sx, sy, Math.cos(a2) * speed, Math.sin(a2) * speed, player.dmg, 0, 0, 0.95);
      }
      state.fireCd = 1 / player.fireRate;
      playSfx('cannon', 0.34, 0.045);
    }
    player.recoil = 1;
  }

  function angleDelta(a, b) {
    var d = (b - a + Math.PI) % TWO_PI - Math.PI;
    return d < -Math.PI ? d + TWO_PI : d;
  }

  function update(dt) {
    if (state.paused || state.mode !== 'PLAYING') return;
    state.tick++;
    state.t += dt;
    perf.envContacts = 0;
    if (state.bannerT > 0) state.bannerT -= dt;
    updateUnleash(dt);
    if (player.regen > 0 && player.hp < player.maxHp) player.hp = Math.min(player.maxHp, player.hp + player.regen * dt);
    updatePlayer(dt);
    state.spawnCredit += dt * (12 + state.t / 18);
    var target = desiredEnemies();
    while (eN < target && state.spawnCredit >= 1) {
      spawnEnemy();
      state.spawnCredit -= 1;
    }
    var nearest = updateEnemies(dt);
    resolveEnemyColliders(dt);
    updateLeeches(dt);
    updateBullets(dt);
    updateMotes(dt);
    updateParticles(dt);
    updateGore(dt);
    updateWorldFx(dt);
    updateCorpses(dt);
    updateVeinTrails(dt);
    autoFire(dt, nearest);
    if (GOD && player.hp < player.maxHp) player.hp = player.maxHp;
    if (player.hp <= 0 && !GOD) {
      bankRun();
      state.mode = 'GAMEOVER';
      state.gameOverT = 0;
      state.banner = 'ENGINE STALLS - 0 RESTART';
      state.bannerT = 4;
    }
  }

  var program = makeProgram(gl, [
    '#version 300 es',
    'precision highp float;',
    'layout(location=0) in vec2 a_unit;',
    'layout(location=1) in vec4 a_posSize;',
    'layout(location=2) in vec4 a_misc;',
    'layout(location=3) in vec4 a_col2;',
    'uniform vec2 u_cam;',
    'uniform vec2 u_view;',
    'uniform float u_zoom;',
    'out vec2 v_uv;',
    'out float v_shape;',
    'out vec4 v_color;',
    'out float v_pulse;',
    'void main() {',
    '  float c = cos(a_misc.x);',
    '  float s = sin(a_misc.x);',
    '  vec2 scaled = a_unit * a_posSize.zw;',
    '  vec2 rot = vec2(scaled.x * c - scaled.y * s, scaled.x * s + scaled.y * c);',
    '  vec2 css = (a_posSize.xy + rot - u_cam) * u_zoom + u_view * 0.5;',
    '  vec2 clip = css / u_view * 2.0 - 1.0;',
    '  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);',
    '  v_uv = a_unit;',
    '  v_shape = a_misc.y;',
    '  v_color = vec4(a_misc.z, a_misc.w, a_col2.x, a_col2.y);',
    '  v_pulse = a_col2.z;',
    '}'
  ].join('\n'), [
    '#version 300 es',
    'precision highp float;',
    'in vec2 v_uv;',
    'in float v_shape;',
    'in vec4 v_color;',
    'in float v_pulse;',
    'out vec4 outColor;',
    'void main() {',
    '  float d;',
    '  if (v_shape < 0.5) {',
    '    d = length(v_uv);',
    '  } else if (v_shape < 1.5) {',
    '    d = max(abs(v_uv.x), abs(v_uv.y));',
    '  } else if (v_shape < 2.5) {',
    '    d = abs(v_uv.x) + abs(v_uv.y);',
    '  } else {',
    '    d = abs(length(v_uv) - 0.64) * 1.7;',
    '  }',
    '  float edge = smoothstep(1.0, 0.84, d);',
    '  if (edge <= 0.01) discard;',
    '  vec3 rgb = v_color.rgb + vec3(0.28, 0.06, 0.02) * v_pulse;',
    '  outColor = vec4(rgb, v_color.a * edge);',
    '}'
  ].join('\n'));

  var vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  var unit = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, unit);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, -1, 1, -1, -1, 1,
    -1, 1, 1, -1, 1, 1
  ]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  var inst = new Float32Array(MAX_INST * INV_STRIDE);
  var instBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, instBuf);
  gl.bufferData(gl.ARRAY_BUFFER, inst.byteLength, gl.DYNAMIC_DRAW);
  var strideBytes = INV_STRIDE * 4;
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 4, gl.FLOAT, false, strideBytes, 0);
  gl.vertexAttribDivisor(1, 1);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 4, gl.FLOAT, false, strideBytes, 16);
  gl.vertexAttribDivisor(2, 1);
  gl.enableVertexAttribArray(3);
  gl.vertexAttribPointer(3, 4, gl.FLOAT, false, strideBytes, 32);
  gl.vertexAttribDivisor(3, 1);
  gl.bindVertexArray(null);

  var uCam = gl.getUniformLocation(program, 'u_cam');
  var uView = gl.getUniformLocation(program, 'u_view');
  var uZoom = gl.getUniformLocation(program, 'u_zoom');

  var spriteProgram = makeProgram(gl, [
    '#version 300 es',
    'precision highp float;',
    'layout(location=0) in vec2 a_pos;',
    'layout(location=1) in vec2 a_uv;',
    'layout(location=2) in vec4 a_col;',
    'uniform vec2 u_res;',
    'out vec2 v_uv;',
    'out vec4 v_col;',
    'void main() {',
    '  vec2 clip = a_pos / u_res * 2.0 - 1.0;',
    '  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);',
    '  v_uv = a_uv;',
    '  v_col = a_col;',
    '}'
  ].join('\n'), [
    '#version 300 es',
    'precision mediump float;',
    'in vec2 v_uv;',
    'in vec4 v_col;',
    'uniform sampler2D u_tex;',
    'out vec4 outColor;',
    'void main() {',
    '  vec4 tex = texture(u_tex, v_uv);',
    '  if (tex.a < 0.02) discard;',
    '  outColor = tex * v_col;',
    '}'
  ].join('\n'));
  var spriteVao = gl.createVertexArray();
  gl.bindVertexArray(spriteVao);
  var spriteBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, spriteBuf);
  gl.bufferData(gl.ARRAY_BUFFER, 1024 * 8 * 4, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 32, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 32, 8);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 32, 16);
  gl.bindVertexArray(null);
  var uSpriteRes = gl.getUniformLocation(spriteProgram, 'u_res');
  var uSpriteTex = gl.getUniformLocation(spriteProgram, 'u_tex');
  var spriteBatches = Object.create(null);
  var spriteActiveKeys = [];
  var spriteGridCount = new Uint16Array(256);
  var spriteGridAnim = new Uint16Array(256);
  var spriteGridCols = 1;
  var spriteGridRows = 1;

  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.CULL_FACE);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  function makeProgram(gl, vsSrc, fsSrc) {
    var vs = compile(gl.VERTEX_SHADER, vsSrc);
    var fs = compile(gl.FRAGMENT_SHADER, fsSrc);
    var p = gl.createProgram();
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(p) || 'program link failed');
    }
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    return p;
  }

  function compile(type, src) {
    var sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(sh) || 'shader compile failed');
    }
    return sh;
  }

  function loadOldSpriteAssets() {
    var bases = ['husk', 'husk_rot', 'brute', 'brute_char'];
    for (var i = 0; i < bases.length; i++) {
      addSpriteAsset(bases[i] + '_idle', 'assets/' + bases[i] + '_idle.png');
      addSpriteAsset(bases[i] + '_attack', 'assets/' + bases[i] + '_attack.png');
      addSpriteAsset(bases[i] + '_death', 'assets/' + bases[i] + '_death.png');
      for (var d = 0; d < 8; d++) {
        addSpriteAsset(bases[i] + '_walk_d' + d, 'assets/' + bases[i] + '_walk_d' + d + '.png');
      }
    }
    addSpriteAsset('husk_base', 'sprites/husk.png');
    addSpriteAsset('brute_base', 'sprites/brute.png');
    addSpriteAsset('tank_body', 'sprites/tank_body.png');
    addSpriteAsset('tank_turret', 'sprites/tank_turret.png');
    addSpriteAsset('weapon_turrets', 'art_refs/turrets/weapon_turrets_arcade_bio.png');
    addSpriteAsset('weapon_projectiles', 'art_refs/turrets/weapon_projectiles_arcade_bio.png');
    var layers = ['treads', 'armor', 'thirst', 'core', 'cannon', 'frenzy'];
    for (var li = 0; li < layers.length; li++) {
      addSpriteAsset('lp_' + layers[li], 'art_refs/parts/layer_' + layers[li] + '.png');
    }
    addSpriteAsset('ground', 'art_refs/ground_biomech.png');
    var decals = ['blood', 'crack', 'bush', 'bones', 'flower', 'ribs', 'scorch', 'skull'];
    for (var j = 0; j < decals.length; j++) {
      addSpriteAsset('dec_' + decals[j], 'art_refs/decals/' + decals[j] + '.png');
    }
    for (var r = 0; r < 4; r++) addSpriteAsset('rock' + r, 'art_refs/parts/rock_' + r + '.png');
  }

  function addSpriteAsset(key, src) {
    var img = new Image();
    spritePending++;
    spriteImages[key] = img;
    spriteMeta[key] = { w: 0, h: 0, frames: 1 };
    img.onload = function () {
      spriteMeta[key].w = img.width;
      spriteMeta[key].h = img.height;
      spriteMeta[key].frames = Math.max(1, Math.floor(img.width / 160));
      spriteTextures[key] = uploadSpriteTexture(img);
      spriteLoaded++;
      spriteReady = spriteLoaded >= spritePending;
      if (spriteReady) resetPerfTiming();
    };
    img.onerror = function () {
      spriteLoaded++;
      spriteReady = spriteLoaded >= spritePending;
      if (DEBUG) console.warn('missing sprite asset', src);
    };
    img.src = src;
  }

  function uploadSpriteTexture(img) {
    var tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    return tex;
  }

  function resetSpriteBatches() {
    for (var i = 0; i < spriteActiveKeys.length; i++) {
      spriteBatches[spriteActiveKeys[i]].floats = 0;
      spriteBatches[spriteActiveKeys[i]].verts = 0;
    }
    spriteActiveKeys.length = 0;
    perf.spriteDraws = 0;
    perf.spriteAnimated = 0;
    perf.spriteStatic = 0;
    perf.spriteCulled = 0;
    perf.envSprites = 0;
    perf.corpseSprites = 0;
    perf.tankSprites = 0;
  }

  function spriteBatch(key) {
    if (!spriteTextures[key]) return null;
    var b = spriteBatches[key];
    if (!b) {
      b = { data: new Float32Array(6 * 8 * 96), floats: 0, verts: 0, active: false };
      spriteBatches[key] = b;
    }
    if (b.floats === 0) spriteActiveKeys.push(key);
    return b;
  }

  function pushSpriteVertex(b, x, y, u, v, r, g, bl, a) {
    var k = b.floats;
    if (k + 8 > b.data.length) {
      var grown = new Float32Array(b.data.length * 2);
      grown.set(b.data);
      b.data = grown;
    }
    var data = b.data;
    data[k] = x; data[k + 1] = y; data[k + 2] = u; data[k + 3] = v;
    data[k + 4] = r; data[k + 5] = g; data[k + 6] = bl; data[k + 7] = a;
    b.floats = k + 8;
    b.verts++;
  }

  function queueSprite(key, sx, sy, sw, sh, x, y, w, h, r, g, bl, a) {
    var meta = spriteMeta[key];
    var batch = spriteBatch(key);
    if (!meta || !batch) return false;
    var u0 = sx / meta.w;
    var v0 = sy / meta.h;
    var u1 = (sx + sw) / meta.w;
    var v1 = (sy + sh) / meta.h;
    var x0 = x, y0 = y, x1 = x + w, y1 = y + h;
    pushSpriteVertex(batch, x0, y0, u0, v0, r, g, bl, a);
    pushSpriteVertex(batch, x1, y0, u1, v0, r, g, bl, a);
    pushSpriteVertex(batch, x0, y1, u0, v1, r, g, bl, a);
    pushSpriteVertex(batch, x0, y1, u0, v1, r, g, bl, a);
    pushSpriteVertex(batch, x1, y0, u1, v0, r, g, bl, a);
    pushSpriteVertex(batch, x1, y1, u1, v1, r, g, bl, a);
    return true;
  }

  function queueSpriteRot(key, sx, sy, sw, sh, cx0, cy0, w, h, angle, r, g, bl, a) {
    var meta = spriteMeta[key];
    var batch = spriteBatch(key);
    if (!meta || !batch) return false;
    var u0 = sx / meta.w;
    var v0 = sy / meta.h;
    var u1 = (sx + sw) / meta.w;
    var v1 = (sy + sh) / meta.h;
    var hw = w * 0.5, hh = h * 0.5;
    var ca = Math.cos(angle), sa = Math.sin(angle);
    var x0 = -hw, y0 = -hh, x1 = hw, y1 = -hh, x2 = -hw, y2 = hh, x3 = hw, y3 = hh;
    var p0x = cx0 + x0 * ca - y0 * sa, p0y = cy0 + x0 * sa + y0 * ca;
    var p1x = cx0 + x1 * ca - y1 * sa, p1y = cy0 + x1 * sa + y1 * ca;
    var p2x = cx0 + x2 * ca - y2 * sa, p2y = cy0 + x2 * sa + y2 * ca;
    var p3x = cx0 + x3 * ca - y3 * sa, p3y = cy0 + x3 * sa + y3 * ca;
    pushSpriteVertex(batch, p0x, p0y, u0, v0, r, g, bl, a);
    pushSpriteVertex(batch, p1x, p1y, u1, v0, r, g, bl, a);
    pushSpriteVertex(batch, p2x, p2y, u0, v1, r, g, bl, a);
    pushSpriteVertex(batch, p2x, p2y, u0, v1, r, g, bl, a);
    pushSpriteVertex(batch, p1x, p1y, u1, v0, r, g, bl, a);
    pushSpriteVertex(batch, p3x, p3y, u1, v1, r, g, bl, a);
    return true;
  }

  function flushSprites() {
    if (!spriteActiveKeys.length) return;
    gl.useProgram(spriteProgram);
    gl.uniform2f(uSpriteRes, cssW, cssH);
    gl.uniform1i(uSpriteTex, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindVertexArray(spriteVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, spriteBuf);
    for (var i = 0; i < spriteActiveKeys.length; i++) {
      var key = spriteActiveKeys[i];
      var b = spriteBatches[key];
      if (!b || b.verts <= 0) continue;
      gl.bindTexture(gl.TEXTURE_2D, spriteTextures[key]);
      gl.bufferData(gl.ARRAY_BUFFER, b.data.subarray(0, b.floats), gl.DYNAMIC_DRAW);
      gl.drawArrays(gl.TRIANGLES, 0, b.verts);
      perf.spriteDraws++;
    }
    gl.bindVertexArray(null);
  }

  function ensureSpriteGrid() {
    spriteGridCols = Math.max(1, Math.ceil((cssW + 360) / SPRITE_CELL));
    spriteGridRows = Math.max(1, Math.ceil((cssH + 360) / SPRITE_CELL));
    var need = spriteGridCols * spriteGridRows;
    if (spriteGridCount.length < need) {
      spriteGridCount = new Uint16Array(need);
      spriteGridAnim = new Uint16Array(need);
    }
    spriteGridCount.fill(0, 0, need);
    spriteGridAnim.fill(0, 0, need);
  }

  function spriteCellIndex(x, y) {
    var sx = worldToScreenX(x) + 180;
    var sy = worldToScreenY(y) + 180;
    if (sx < 0 || sy < 0) return -1;
    var cx = (sx / SPRITE_CELL) | 0;
    var cy = (sy / SPRITE_CELL) | 0;
    if (cx < 0 || cy < 0 || cx >= spriteGridCols || cy >= spriteGridRows) return -1;
    return cy * spriteGridCols + cx;
  }

  function prepareSpriteDensity() {
    ensureSpriteGrid();
    for (var i = 0; i < eN; i++) {
      var cell = spriteCellIndex(ex[i], ey[i]);
      if (cell >= 0) spriteGridCount[cell]++;
      else perf.spriteCulled++;
    }
  }

  function spriteDir(face) {
    return ((Math.round(2 - face * 4 / Math.PI) % 8) + 8) % 8;
  }

  function hashCell(cx, cy) {
    var h = (Math.imul(cx, 341873128) + Math.imul(cy, 132897987)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1597334677);
    return (h ^ (h >>> 16)) >>> 0;
  }

  function hashObstacle(cx, cy) {
    var h = (Math.imul(cx, 374761393) + Math.imul(cy, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return (h ^ (h >>> 16)) >>> 0;
  }

  function cellKey(cx, cy) {
    var k = (((cx & 65535) << 16) ^ (cy & 65535)) | 0;
    return k === OB_EMPTY ? OB_EMPTY + 1 : k;
  }

  function stateIndexFor(key, create, cx, cy, hp) {
    var idx = (Math.imul(key, -1640531527) >>> 0) & OB_MASK;
    for (var p = 0; p < OB_STATE_CAP; p++) {
      var k = obKeys[idx];
      if (k === key) return idx;
      if (k === OB_EMPTY) {
        if (!create) return -1;
        obKeys[idx] = key;
        obHp[idx] = hp;
        obHitT[idx] = -99;
        obBroken[idx] = 0;
        obCx[idx] = cx;
        obCy[idx] = cy;
        return idx;
      }
      idx = (idx + 1) & OB_MASK;
    }
    if (!create) return -1;
    idx = obCursor;
    obCursor = (obCursor + 1) & OB_MASK;
    obKeys[idx] = key;
    obHp[idx] = hp;
    obHitT[idx] = -99;
    obBroken[idx] = 0;
    obCx[idx] = cx;
    obCy[idx] = cy;
    return idx;
  }

  function decStateIndexFor(key, create) {
    var idx = (Math.imul(key, -1640531527) >>> 0) & DEC_MASK;
    for (var p = 0; p < DEC_STATE_CAP; p++) {
      var k = decKeys[idx];
      if (k === key) return idx;
      if (k === OB_EMPTY) {
        if (!create) return -1;
        decKeys[idx] = key;
        return idx;
      }
      idx = (idx + 1) & DEC_MASK;
    }
    if (!create) return -1;
    idx = decCursor;
    decCursor = (decCursor + 1) & DEC_MASK;
    decKeys[idx] = key;
    return idx;
  }

  function resetEnvironmentState() {
    for (var i = 0; i < OB_STATE_CAP; i++) {
      obKeys[i] = OB_EMPTY;
      obBroken[i] = 0;
      obHitT[i] = -99;
    }
    for (var d = 0; d < DEC_STATE_CAP; d++) decKeys[d] = OB_EMPTY;
    obCursor = 0;
    decCursor = 0;
  }

  function decalAtCell(cx, cy) {
    if (!OLD_ENV || DECAL_DENSITY <= 0) return false;
    var h = hashCell(cx, cy);
    if ((h % 100) >= DECAL_DENSITY) return false;
    var key = cellKey(cx, cy);
    if (decStateIndexFor(key, false) >= 0) return false;
    var cell = 132;
    var wx = cx * cell + 12 + ((h >>> 5) % (cell - 24));
    var wy = cy * cell + 12 + ((h >>> 13) % (cell - 24));
    if (wx * wx + wy * wy < 80 * 80) return false;
    var wv = h % 20;
    decTmpKind = wv < 5 ? 0 : wv < 9 ? 1 : wv < 12 ? 2 : wv < 14 ? 3 : wv < 16 ? 4 : wv < 18 ? 5 : wv < 19 ? 6 : 7;
    decTmpX = wx;
    decTmpY = wy;
    decTmpRot = (h >>> 3) & 3;
    decTmpSize = 40 + ((h >>> 9) % 7) * 4;
    decTmpKey = key;
    return true;
  }

  function obstacleAtCell(cx, cy) {
    if (!BREAK_ENV || ROCK_DENSITY <= 0) return false;
    var h = hashObstacle(cx, cy);
    if ((h % 100) >= ROCK_DENSITY) return false;
    var key = cellKey(cx, cy);
    var slot = stateIndexFor(key, false, cx, cy, 0);
    if (slot >= 0 && obBroken[slot]) return false;
    var cell = 250;
    var wx = cx * cell + 22 + ((h >>> 6) % (cell - 44));
    var wy = cy * cell + 22 + ((h >>> 14) % (cell - 44));
    if (wx * wx + wy * wy < 210 * 210) return false;
    var sizeBits = (h >>> 3) % 24;
    var maxHp = 26 + sizeBits * 2;
    obTmpX = wx;
    obTmpY = wy;
    obTmpR = 32 + sizeBits;
    obTmpMaxHp = maxHp;
    obTmpHp = slot >= 0 ? obHp[slot] : maxHp;
    obTmpHit = slot >= 0 ? obHitT[slot] : -99;
    obTmpKey = key;
    obTmpCx = cx;
    obTmpCy = cy;
    obTmpV = h & 3;
    obTmpSize = sizeBits;
    obTmpSlot = slot;
    return true;
  }

  function damageCurrentObstacle(dmg) {
    var key = obTmpKey;
    var slot = obTmpSlot >= 0 ? obTmpSlot : stateIndexFor(key, true, obTmpCx, obTmpCy, obTmpMaxHp);
    if (slot < 0) return false;
    obHp[slot] -= dmg;
    obHitT[slot] = state.t;
    obTmpHp = obHp[slot];
    obTmpHit = state.t;
    if (obHp[slot] > 0 || obBroken[slot]) return false;
    obBroken[slot] = 1;
    perf.envBroken++;
    playSfx('rock', 0.42, 0.08);
    spawnBoom(obTmpX, obTmpY, obTmpR * 0.9, 1);
    spawnDecal(obTmpX, obTmpY, obTmpR * 1.25, 3, 0.16);
    for (var i = 0; i < 10; i++) {
      var a = rnd() * TWO_PI;
      var sp = 80 + rnd() * 180;
      spawnParticle(obTmpX, obTmpY, Math.cos(a) * sp, Math.sin(a) * sp, 2 + rnd() * 3.5, 0.35 + rnd() * 0.35, 4);
    }
    for (var m = 0; m < 3; m++) spawnMote(obTmpX + (rnd() - 0.5) * obTmpR, obTmpY + (rnd() - 0.5) * obTmpR, 2);
    return true;
  }

  function obstacleHitAt(x, y) {
    if (!BREAK_ENV) return false;
    var cell = 250;
    var cx = Math.floor(x / cell);
    var cy = Math.floor(y / cell);
    for (var gx = cx - 1; gx <= cx + 1; gx++) {
      for (var gy = cy - 1; gy <= cy + 1; gy++) {
        if (!obstacleAtCell(gx, gy)) continue;
        var dx = x - obTmpX;
        var dy = y - obTmpY;
        if (dx * dx + dy * dy < obTmpR * obTmpR) return true;
      }
    }
    return false;
  }

  function crushNearbyDecals(px0, py0, cr) {
    if (!BREAK_ENV) return;
    var cell = 132;
    var cx = Math.floor(px0 / cell);
    var cy = Math.floor(py0 / cell);
    var cr2 = cr * cr;
    for (var gx = cx - 1; gx <= cx + 1; gx++) {
      for (var gy = cy - 1; gy <= cy + 1; gy++) {
        if (!decalAtCell(gx, gy)) continue;
        if (!(decTmpKind === 2 || decTmpKind === 3 || decTmpKind === 4 || decTmpKind === 5 || decTmpKind === 7)) continue;
        var dx = px0 - decTmpX;
        var dy = py0 - decTmpY;
        if (dx * dx + dy * dy >= cr2) continue;
        decStateIndexFor(decTmpKey, true);
        if (decTmpKind === 3 || decTmpKind === 5 || decTmpKind === 7) {
          playSfx('crunch', 0.18, 0.16);
          spawnSplat(decTmpX, decTmpY, 14 + rnd() * 12, 0, 4.5);
          spawnGoreSpray(decTmpX, decTmpY, 5, null, 0, 150, 0);
        } else {
          for (var p = 0; p < 4; p++) {
            var a = rnd() * TWO_PI;
            spawnParticle(decTmpX, decTmpY, Math.cos(a) * 80, Math.sin(a) * 80, 1.6 + rnd() * 2.2, 0.22 + rnd() * 0.25, 3);
          }
        }
      }
    }
  }

  function crushNearbyRocks(px0, py0, cr) {
    if (!BREAK_ENV) return;
    var power = Math.max(1, player.crushDps / 72);
    if (power < 1.18) return;
    var cell = 250;
    var cx = Math.floor(px0 / cell);
    var cy = Math.floor(py0 / cell);
    for (var gx = cx - 1; gx <= cx + 1; gx++) {
      for (var gy = cy - 1; gy <= cy + 1; gy++) {
        if (!obstacleAtCell(gx, gy)) continue;
        if (power < 1.18 + obTmpSize * 0.075) continue;
        var dx = px0 - obTmpX;
        var dy = py0 - obTmpY;
        var rr = obTmpR + cr;
        if (dx * dx + dy * dy < rr * rr) damageCurrentObstacle(obTmpMaxHp + 999);
      }
    }
  }

  function collidePlayerObstacles() {
    if (!BREAK_ENV) return;
    var cell = 250;
    var cx = Math.floor(player.x / cell);
    var cy = Math.floor(player.y / cell);
    var contacts = 0;
    for (var pass = 0; pass < 2; pass++) {
      for (var gx = cx - 1; gx <= cx + 1; gx++) {
        for (var gy = cy - 1; gy <= cy + 1; gy++) {
          if (!obstacleAtCell(gx, gy)) continue;
          perf.envRocks++;
          var dx = player.x - obTmpX;
          var dy = player.y - obTmpY;
          var rr = obTmpR + player.r + 8;
          var d2 = dx * dx + dy * dy;
          if (d2 >= rr * rr) continue;
          contacts++;
          if (d2 > 0.001) {
            var d = Math.sqrt(d2);
            var push = rr - d;
            var nx = dx / d;
            var ny = dy / d;
            player.x += nx * push;
            player.y += ny * push;
            var into = player.vx * nx + player.vy * ny;
            if (into < 0) {
              player.vx -= nx * into * 1.35;
              player.vy -= ny * into * 1.35;
            }
          } else {
            player.x += rr;
          }
        }
      }
    }
    perf.envContacts += contacts;
  }

  function queueOldEnvironment() {
    if (!OLD_ENV || !spriteTextures.ground) return;
    var ts = 240;
    var tsS = screenLen(ts);
    var ox = -((((player.x * cameraZoom) % tsS) + tsS) % tsS);
    var oy = -((((player.y * cameraZoom) % tsS) + tsS) % tsS);
    var gm = spriteMeta.ground;
    for (var gx = ox - tsS; gx < cssW + tsS; gx += tsS) {
      for (var gy = oy - tsS; gy < cssH + tsS; gy += tsS) {
        if (queueSprite('ground', 0, 0, gm.w, gm.h, gx, gy, tsS, tsS, 0.64, 0.58, 0.54, 0.92)) perf.envSprites++;
      }
    }

    var cell = 132;
    var marginX = viewWorldW * 0.5 + 90;
    var marginY = viewWorldH * 0.5 + 90;
    var c0 = Math.floor((player.x - marginX) / cell), c1 = Math.floor((player.x + marginX) / cell);
    var r0 = Math.floor((player.y - marginY) / cell), r1 = Math.floor((player.y + marginY) / cell);
    var kinds = ['blood', 'crack', 'bush', 'bones', 'flower', 'ribs', 'scorch', 'skull'];
    for (var cx0 = c0; cx0 <= c1; cx0++) {
      for (var cy0 = r0; cy0 <= r1; cy0++) {
        if (!decalAtCell(cx0, cy0)) continue;
        var kind = kinds[decTmpKind];
        var key = 'dec_' + kind;
        var meta = spriteMeta[key];
        if (!spriteTextures[key] || !meta) continue;
        var dsize = screenLen(decTmpSize);
        var sx = worldToScreenX(decTmpX) - dsize * 0.5;
        var sy = worldToScreenY(decTmpY) - dsize * 0.5;
        if (sx < -dsize || sx > cssW + dsize || sy < -dsize || sy > cssH + dsize) continue;
        if (queueSprite(key, 0, 0, meta.w, meta.h, sx, sy, dsize, dsize, 0.86, 0.82, 0.76, 0.76)) perf.envSprites++;
      }
    }

    if (!BREAK_ENV) return;
    var rockCell = 250;
    var rockMarginX = viewWorldW * 0.5 + 160;
    var rockMarginY = viewWorldH * 0.5 + 160;
    var rc0 = Math.floor((player.x - rockMarginX) / rockCell), rc1 = Math.floor((player.x + rockMarginX) / rockCell);
    var rr0 = Math.floor((player.y - rockMarginY) / rockCell), rr1 = Math.floor((player.y + rockMarginY) / rockCell);
    for (var rx0 = rc0; rx0 <= rc1; rx0++) {
      for (var ry0 = rr0; ry0 <= rr1; ry0++) {
        if (!obstacleAtCell(rx0, ry0)) continue;
        var rkey = 'rock' + obTmpV;
        var rmeta = spriteMeta[rkey];
        if (!spriteTextures[rkey] || !rmeta) continue;
        var size = screenLen(obTmpR * 2.35);
        var rsx = worldToScreenX(obTmpX) - size * 0.5;
        var rsy = worldToScreenY(obTmpY) - size * 0.5;
        if (rsx < -size || rsx > cssW + size || rsy < -size || rsy > cssH + size) continue;
        var hurt = Math.max(0, 1 - obTmpHp / obTmpMaxHp);
        var flash = state.t - obTmpHit < 0.16 ? 0.35 : 0;
        if (queueSprite(rkey, 0, 0, rmeta.w, rmeta.h, rsx, rsy, size, size, 0.88 + flash, 0.84 - hurt * 0.12 + flash, 0.78 - hurt * 0.18 + flash, 0.98)) {
          perf.envSprites++;
          perf.envRocks++;
        }
      }
    }
  }

  function queueOldEnemySprite(i) {
    var cell = spriteCellIndex(ex[i], ey[i]);
    if (cell < 0) return true;
    var type = etype[i];
    var base = SPRITE_BASE[type] || 'husk';
    var dxp = ex[i] - player.x;
    var dyp = ey[i] - player.y;
    var rr = player.r + player.crush + er[i];
    var contact = dxp * dxp + dyp * dyp < rr * rr;
    var dir = spriteDir(eface[i]);
    var key = contact && spriteTextures[base + '_attack'] ? base + '_attack' : base + '_walk_d' + dir;
    if (!spriteTextures[key]) key = base + '_idle';
    if (!spriteTextures[key]) key = type < 2 || type === 4 || type === 6 || type === 8 || type === 10 ? 'husk_base' : 'brute_base';
    if (!spriteTextures[key]) return false;

    var count = spriteGridCount[cell] || 1;
    var perCell = count > 28 ? 1 : (count > 16 ? 2 : (count > 8 ? 3 : 6));
    var animated = !SPRITE_LOD || (perf.spriteAnimated < SPRITE_ANIM_CAP && spriteGridAnim[cell] < perCell);
    if (animated) {
      spriteGridAnim[cell]++;
      perf.spriteAnimated++;
    } else {
      perf.spriteStatic++;
    }

    var meta = spriteMeta[key];
    var frames = meta ? meta.frames : 1;
    var frame = animated
      ? ((ephase[i] * (contact ? 13 : 11) + type * 0.73) | 0) % frames
      : ((i * 7 + type * 3) % frames);
    var size = screenLen(er[i] * (type === 1 || type === 8 ? 2.55 : (type === 2 || type === 5 || type === 7 || type === 9 || type === 11 ? 2.95 : 2.75)));
    var sx = worldToScreenX(ex[i]) - size * 0.5;
    var sy = worldToScreenY(ey[i]) - size * 0.58;
    var hurt = Math.max(0, Math.min(1, 1 - ehp[i] / (T_HP[type] * (1 + state.t * 0.014) + 1)));
    return queueSprite(key, frame * 160, 0, 160, 160, sx, sy, size, size, SPRITE_T_R[type] + hurt * 0.18, SPRITE_T_G[type], SPRITE_T_B[type], 0.96);
  }

  function queueOldCorpseSprite(i) {
    if (!OLD_DEATH) return false;
    var type = ctype[i];
    var base = SPRITE_BASE[type] || 'husk';
    var key = base + '_death';
    if (!spriteTextures[key]) key = type < 2 || type === 4 || type === 6 || type === 8 || type === 10 ? 'husk_base' : 'brute_base';
    if (!spriteTextures[key]) return false;
    var meta = spriteMeta[key];
    var frames = meta ? meta.frames : 1;
    var k = Math.min(1, ct[i] / 0.7);
    var frame = key.indexOf('_death') > 0 ? Math.min(frames - 1, Math.floor(k * frames)) : 0;
    var size = screenLen(cr[i] * (type === 1 || type === 8 ? 2.85 : (type === 2 || type === 5 || type === 7 || type === 9 || type === 11 ? 3.25 : 3.1)));
    var alpha = ct[i] > 0.5 ? Math.max(0, (0.72 - ct[i]) / 0.22) : 0.92;
    var w = cface[i] < 0 ? -size : size;
    var sx = worldToScreenX(cx[i]) - (cface[i] < 0 ? -size : size) * 0.5;
    var sy = worldToScreenY(cy[i]) - size * 0.55;
    if (sx < -size * 1.5 || sx > cssW + size * 1.5 || sy < -size * 1.5 || sy > cssH + size * 1.5) return true;
    perf.corpseSprites++;
    return queueSprite(key, frame * 160, 0, Math.min(160, meta.w), Math.min(160, meta.h), sx, sy, w, size, 1, 1, 1, alpha);
  }

  function queueWeaponProjectileSprite(i, angle) {
    if (!spriteTextures.weapon_projectiles) return false;
    var row = clampInt(brow[i], 0, 3);
    var tier = clampInt(btier[i], 0, 5);
    var size = row === WEAPON_ROW.missile ? 42 : row === WEAPON_ROW.flak ? 26 : 34;
    var pxs = worldToScreenX(bx[i]);
    var pys = worldToScreenY(by[i]);
    var screenSize = screenLen(size);
    if (pxs < -screenSize || pxs > cssW + screenSize || pys < -screenSize || pys > cssH + screenSize) return true;
    return queueSpriteRot('weapon_projectiles', tier * WEAPON_PROJECTILE_CELL, row * WEAPON_PROJECTILE_CELL, WEAPON_PROJECTILE_CELL, WEAPON_PROJECTILE_CELL, pxs, pys, screenSize, screenSize, angle, 1, 1, 1, 0.96);
  }

  function queueOldTankSprite() {
    if (!OLD_TANK || !spriteTextures.tank_body || !spriteTextures.tank_turret) return false;
    var alive = tankRageLevel();
    var breathe = Math.sin(state.t * (3.4 + alive * 1.4));
    var breathAmp = (0.004 + alive * 0.012) + (player.unleash > 0 ? 0.008 : 0);
    var breathW = 1 + breathe * breathAmp;
    var breathH = 1 - breathe * breathAmp * 0.55;
    var liveBob = Math.sin(state.t * 4.2 + alive) * screenLen(alive * 0.9 + (player.unleash > 0 ? 0.6 : 0));
    var bob = Math.round(Math.sin(state.t * 8.5) * 1.15 + liveBob);
    var sx = cssW * 0.5;
    var sy = cssH * 0.5 + bob;
    var hot = Math.max(player.hurt, player.recoil * 0.5);
    if (TANK_LAYERS && spriteTextures.lp_treads && spriteTextures.lp_armor && (spriteTextures.weapon_turrets || spriteTextures.lp_cannon)) {
      var size = screenLen(92);
      var hullA = player.hull + Math.PI * 0.5;
      var turretA = player.turret + Math.PI * 0.5;
      var pulse = 0.5 + 0.5 * Math.sin(state.t * 8.0);
      var tankLayerSprites = 3;
      queueSpriteRot('lp_treads', tankTreadsTier * 64, 0, 64, 64, sx, sy, size * (1 + hot * 0.06), size, hullA, 1 + hot * 0.12, 1, 1, 0.98);
      queueSpriteRot('lp_armor', tankArmorTier * 64, 0, 64, 64, sx, sy, size * breathW, size * breathH, hullA, 1 + hot * 0.18, 1, 1, 0.98);
      if (spriteTextures.lp_thirst) {
        queueSpriteRot('lp_thirst', tankThirstTier * 64, 0, 64, 64, sx, sy + breathe * screenLen(0.6), size * (1 + (breathW - 1) * 1.35), size * (1 + (breathH - 1) * 1.2), hullA, 1, 1, 1, 0.96);
        tankLayerSprites++;
      }
      if (spriteTextures.lp_core && tankCoreTier > 0) {
        queueSpriteRot('lp_core', tankCoreTier * 64, 0, 64, 64, sx, sy + breathe * screenLen(0.8), size * (1 + (breathW - 1) * 1.7), size * (1 + (breathH - 1) * 1.7), hullA, 1 + pulse * 0.04, 1, 1, 0.9);
        tankLayerSprites++;
      }
      if (spriteTextures.weapon_turrets) {
        queueSpriteRot('weapon_turrets', weaponAtlasTier(equipWeapon) * WEAPON_TURRET_CELL, weaponRow(equipWeapon) * WEAPON_TURRET_CELL, WEAPON_TURRET_CELL, WEAPON_TURRET_CELL, sx + Math.cos(player.turret) * screenLen(player.recoil * 3), sy + Math.sin(player.turret) * screenLen(player.recoil * 3), screenLen(104), screenLen(104), player.turret, 1 + hot * 0.22, 1, 1, 1);
      } else {
        queueSpriteRot('lp_cannon', tankCannonTier * 64, 0, 64, 64, sx + Math.cos(player.turret) * screenLen(player.recoil * 3), sy + Math.sin(player.turret) * screenLen(player.recoil * 3), size, size, turretA, 1 + hot * 0.22, 1, 1, 1);
      }
      perf.tankSprites = tankLayerSprites;
      return true;
    }
    queueSpriteRot('tank_body', 0, 0, spriteMeta.tank_body.w, spriteMeta.tank_body.h, sx, sy, screenLen(68) * breathW, screenLen(68) * breathH, player.hull + Math.PI * 0.5, 1 + hot * 0.18, 1, 1, 0.98);
    queueSpriteRot('tank_turret', 0, 0, spriteMeta.tank_turret.w, spriteMeta.tank_turret.h, sx + Math.cos(player.turret) * screenLen(player.recoil * 3), sy + Math.sin(player.turret) * screenLen(player.recoil * 3), screenLen(72), screenLen(72), player.turret + Math.PI * 0.5, 1 + hot * 0.22, 1, 1, 1);
    perf.tankSprites = 2;
    return true;
  }

  if (OLD_SPRITES) loadOldSpriteAssets();

  function addInst(n, x, y, sx, sy, angle, shape, r, g, b, a, pulse) {
    if (n >= MAX_INST) return n;
    var k = n * INV_STRIDE;
    inst[k] = x; inst[k + 1] = y; inst[k + 2] = sx; inst[k + 3] = sy;
    inst[k + 4] = angle; inst[k + 5] = shape; inst[k + 6] = r; inst[k + 7] = g;
    inst[k + 8] = b; inst[k + 9] = a; inst[k + 10] = pulse || 0; inst[k + 11] = 0;
    return n + 1;
  }

  function addRot(n, ox, oy, sx, sy, angle, shape, r, g, b, a, pulse) {
    var ca = Math.cos(angle), sa = Math.sin(angle);
    return addInst(n, player.x + ox * ca - oy * sa, player.y + ox * sa + oy * ca, sx, sy, angle, shape, r, g, b, a, pulse);
  }

  function addLineInst(n, x1, y1, x2, y2, width, r, g, b, a, pulse) {
    var dx = x2 - x1;
    var dy = y2 - y1;
    var len = Math.sqrt(dx * dx + dy * dy);
    if (len < 0.5) return n;
    return addInst(n, (x1 + x2) * 0.5, (y1 + y2) * 0.5, len * 0.5, width * 0.5, Math.atan2(dy, dx), 1, r, g, b, a, pulse);
  }

  function addCurveInst(n, x0, y0, cx0, cy0, x1, y1, width, r, g, b, a, pulse, segs) {
    var px0 = x0;
    var py0 = y0;
    segs = segs || 3;
    for (var s = 1; s <= segs; s++) {
      var t = s / segs;
      var it = 1 - t;
      var qx = it * it * x0 + 2 * it * t * cx0 + t * t * x1;
      var qy = it * it * y0 + 2 * it * t * cy0 + t * t * y1;
      n = addLineInst(n, px0, py0, qx, qy, width, r, g, b, a, pulse);
      px0 = qx;
      py0 = qy;
    }
    return n;
  }

  function addVeinTrailInstances(n) {
    if (!VEIN_FX || vN <= 0) {
      perf.veins = 0;
      perf.veinInst = 0;
      return n;
    }
    var start = n;
    var margin = viewWorldMax() * 0.72;
    for (var i = 0; i < vN; i++) {
      var x = vx0[i], y = vy0[i];
      if (Math.abs(x - player.x) > margin || Math.abs(y - player.y) > margin) continue;
      var grow = vgrow[i];
      var fade = vlife[i] < 1.15 ? Math.max(0, vlife[i] / 1.15) : 1;
      var pulse = 0.25 + 0.22 * Math.sin(state.t * 7.0 + i * 1.31);
      var len = vlen[i] * grow;
      var a = va0[i];
      var ex1 = x + Math.cos(a) * len;
      var ey1 = y + Math.sin(a) * len;
      var ca = a + Math.PI * 0.5;
      var bow = vcurl[i] * len * 0.42;
      var mx0 = x + Math.cos(a) * len * 0.52 + Math.cos(ca) * bow;
      var my0 = y + Math.sin(a) * len * 0.52 + Math.sin(ca) * bow;
      n = addCurveInst(n, x, y, mx0, my0, ex1, ey1, 5.2, 0.18, 0.015, 0.025, 0.42 * fade, 0, 3);
      n = addCurveInst(n, x, y, mx0, my0, ex1, ey1, 2.0, 0.86, 0.07, 0.10, (0.32 + pulse) * fade, 0.25, 3);
      if (vb1l[i] > 0.5) {
        var b1 = vb1a[i];
        var bl1 = vb1l[i] * grow;
        var bx1 = x + Math.cos(b1) * bl1;
        var by1 = y + Math.sin(b1) * bl1;
        n = addLineInst(n, x, y, bx1, by1, 3.5, 0.18, 0.015, 0.025, 0.34 * fade, 0);
        n = addLineInst(n, x, y, bx1, by1, 1.4, 0.82, 0.055, 0.075, 0.30 * fade, 0.18);
      }
      if (vb2l[i] > 0.5) {
        var b2 = vb2a[i];
        var bl2 = vb2l[i] * grow;
        var bx2 = x + Math.cos(b2) * bl2;
        var by2 = y + Math.sin(b2) * bl2;
        n = addLineInst(n, x, y, bx2, by2, 3.0, 0.16, 0.012, 0.022, 0.26 * fade, 0);
        n = addLineInst(n, x, y, bx2, by2, 1.2, 0.82, 0.05, 0.07, 0.22 * fade, 0.15);
      }
      n = addInst(n, x, y, 3.6, 3.6, 0, 0, 0.62, 0.035, 0.055, 0.45 * fade, 0.18);
    }
    perf.veins = vN;
    perf.veinInst = n - start;
    return n;
  }

  function addGoreSplatInstances(n) {
    if (!GORE_FX || sN <= 0) {
      perf.splats = 0;
      perf.splatInst = 0;
      return n;
    }
    var start = n;
    var margin = viewWorldMax() * 0.78;
    for (var i = 0; i < sN; i++) {
      var x = sx0[i], y = sy0[i];
      if (Math.abs(x - player.x) > margin || Math.abs(y - player.y) > margin) continue;
      var fade = smax[i] > 0 ? clamp(slife[i] / smax[i], 0, 1) : 1;
      var a = 0.28 + (i * 2.399963);
      var r = sr[i];
      if (skind[i] === 1) {
        n = addInst(n, x, y, r * 0.88, r * 0.52, a, 0, 0.055, 0.047, 0.048, 0.42 * fade, 0);
        n = addInst(n, x + Math.cos(a) * r * 0.16, y + Math.sin(a) * r * 0.12, r * 0.42, r * 0.22, -a, 0, 0.28, 0.25, 0.23, 0.24 * fade, 0);
      } else {
        n = addInst(n, x, y, r, r * 0.68, a, 0, 0.14, 0.006, 0.018, 0.62 * fade, 0);
        n = addInst(n, x - Math.cos(a) * r * 0.22, y + Math.sin(a) * r * 0.16, r * 0.36, r * 0.23, a + 0.9, 0, 0.34, 0.026, 0.046, 0.34 * fade, 0);
      }
    }
    perf.splats = sN;
    perf.splatInst = n - start;
    return n;
  }

  function addGoreInstances(n) {
    if (!GORE_FX || gN <= 0) {
      perf.gorePieces = 0;
      perf.goreInst = 0;
      return n;
    }
    var start = n;
    var margin = viewWorldMax() * 0.82;
    var cheap = eN > 900 || gN > 280 || perf.renderAvg > 10;
    for (var i = 0; i < gN; i++) {
      var x = gx0[i], y = gy0[i];
      if (Math.abs(x - player.x) > margin || Math.abs(y - player.y) > margin) continue;
      var kind = gkind[i];
      var fade = glife[i] < 0.5 ? Math.max(0, glife[i] / 0.5) : 1;
      var r = gr[i];
      var a = ga[i];
      if (cheap) {
        if (kind === 3) n = addInst(n, x, y, r, r * 0.62, a, 1, 0.45, 0.45, 0.49, fade, 0);
        else if (kind === 4) n = addLineInst(n, x - Math.cos(a) * r, y - Math.sin(a) * r, x + Math.cos(a) * r, y + Math.sin(a) * r, 2.0, 0.64, 0.06, 0.09, fade, 0);
        else if (kind === 2) n = addInst(n, x, y, r * 0.55, r * 1.05, a, 1, 0.74, 0.68, 0.55, fade, 0);
        else if (kind === 5) n = addInst(n, x, y, r * 0.8, r * 0.8, 0, 0, 1.0, 0.72, 0.26, fade * 0.85, 0.4);
        else n = addInst(n, x, y, r, r, a, 1, 0.62, 0.03, 0.065, fade, 0);
        continue;
      }
      if (kind === 0) {
        var sp = Math.abs(gvx[i]) + Math.abs(gvy[i]);
        var trail = Math.min(r * 5.2, sp * 0.018);
        var ba = Math.atan2(gvy[i], gvx[i]);
        n = addInst(n, x, y, r, r * 0.82, ba, 0, 0.72, 0.025, 0.055, 0.82 * fade, 0);
        if (trail > r * 1.3) n = addLineInst(n, x, y, x - Math.cos(ba) * trail, y - Math.sin(ba) * trail, r * 1.2, 0.64, 0.02, 0.045, 0.48 * fade, 0);
      } else if (kind === 1) {
        n = addInst(n, x, y, r, r * 0.9, a, 0, 0.46, 0.018, 0.035, 0.92 * fade, 0);
        n = addInst(n, x - Math.cos(a) * r * 0.22, y - Math.sin(a) * r * 0.18, r * 0.45, r * 0.38, a, 0, 0.78, 0.06, 0.08, 0.62 * fade, 0);
      } else if (kind === 2) {
        n = addInst(n, x, y, r * 0.48, r * 1.15, a, 1, 0.78, 0.72, 0.60, 0.88 * fade, 0);
        n = addInst(n, x + Math.cos(a) * r * 0.12, y + Math.sin(a) * r * 0.12, r * 0.38, r * 0.32, a, 1, 0.52, 0.47, 0.36, 0.42 * fade, 0);
      } else if (kind === 3) {
        n = addInst(n, x, y, r * 1.15, r * 0.55, a, 1, 0.37, 0.36, 0.40, 0.95 * fade, 0);
        n = addInst(n, x - Math.sin(a) * r * 0.18, y + Math.cos(a) * r * 0.18, r * 1.0, 1.2, a, 1, 0.62, 0.64, 0.70, 0.55 * fade, 0);
      } else if (kind === 4) {
        var curl = Math.sin(state.t * 4.2 + i) * r * 0.28;
        n = addCurveInst(n, x - Math.cos(a) * r, y - Math.sin(a) * r, x + Math.sin(a) * curl, y - Math.cos(a) * curl, x + Math.cos(a) * r, y + Math.sin(a) * r, 2.1, 0.64, 0.055, 0.08, 0.86 * fade, 0, 2);
      } else {
        n = addInst(n, x, y, r * 0.78, r * 0.78, 0, 0, 1.0, 0.68, 0.23, 0.82 * fade, 0.55);
      }
    }
    perf.gorePieces = gN;
    perf.goreInst = n - start;
    return n;
  }

  function addExplosionInstances(n) {
    if (boomN <= 0) {
      perf.booms = 0;
      perf.boomInst = 0;
      return n;
    }
    var start = n;
    var margin = viewWorldMax() * 0.84;
    for (var i = 0; i < boomN; i++) {
      var x = boomX[i], y = boomY[i];
      if (Math.abs(x - player.x) > margin || Math.abs(y - player.y) > margin) continue;
      var k = boomT[i] / Math.max(0.001, boomMax[i]);
      var fade = 1 - k;
      var r = boomR[i] * (0.35 + k * 1.35);
      if (boomKind[i] === 1) {
        n = addInst(n, x, y, r * 1.05, r * 0.72, i * 0.73, 0, 0.56, 0.52, 0.56, 0.36 * fade, 0);
        n = addInst(n, x, y, r * 0.45, r * 0.34, -i * 0.55, 0, 0.96, 0.72, 0.30, 0.50 * fade, 0.45);
        for (var s = 0; s < 4; s++) {
          var a = s * Math.PI * 0.5 + i * 0.31;
          var rr = r * (0.35 + k * 0.55);
          n = addInst(n, x + Math.cos(a) * rr, y + Math.sin(a) * rr, r * 0.14, r * 0.14, 0, 1, 0.75, 0.68, 0.58, 0.38 * fade, 0);
        }
      } else {
        n = addInst(n, x, y, r, r, 0, 0, 0.95, 0.16, 0.08, 0.22 * fade, 0.3);
        n = addInst(n, x, y, r * 0.42, r * 0.42, 0, 0, 1.0, 0.43, 0.16, 0.55 * fade, 0.6);
        for (var b = 0; b < 5; b++) {
          var ba = b * TWO_PI / 5 + i * 0.41;
          var br = r * (0.30 + k * 0.65);
          n = addInst(n, x + Math.cos(ba) * br, y + Math.sin(ba) * br, r * 0.13, r * 0.13, 0, 0, 1.0, 0.28, 0.12, 0.46 * fade, 0.5);
        }
      }
    }
    perf.booms = boomN;
    perf.boomInst = n - start;
    return n;
  }

  function addBubbleInstances(n) {
    if (bubbleN <= 0) {
      perf.bubbles = 0;
      perf.bubbleInst = 0;
      return n;
    }
    var start = n;
    for (var i = 0; i < bubbleN; i++) {
      var p = bubbleT[i] / Math.max(0.001, bubbleMax[i]);
      var pop = p > 0.74 ? (p - 0.74) / 0.26 : 0;
      var grow = p < 0.3 ? p / 0.3 : 1;
      var r = bubbleR[i] * (grow + pop * 0.9);
      var a = (1 - pop) * 0.62;
      n = addInst(n, bubbleX[i], bubbleY[i], r, r, 0, 0, 0.54, 0.02, 0.055, a, 0.25);
      n = addInst(n, bubbleX[i] - r * 0.28, bubbleY[i] - r * 0.28, r * 0.28, r * 0.28, 0, 0, 1.0, 0.18, 0.20, a * 0.55, 0.4);
    }
    perf.bubbles = bubbleN;
    perf.bubbleInst = n - start;
    return n;
  }

  function addLeechInstances(n) {
    if (!LEECH_FX || MAX_LEECHES <= 0) {
      perf.leechInst = 0;
      return n;
    }
    var start = n;
    var lvl = currentLeechLevel();
    var slots = Math.min(MAX_LEECHES, lvl > 0 ? 2 + lvl : 0);
    if (slots <= 0) {
      perf.leechInst = 0;
      return n;
    }
    for (var i = 0; i < slots; i++) {
      var grab = leechGrab[i];
      var target = leechTarget[i];
      if (grab <= 0.02 && target < 0) continue;
      var rootA = (i / slots) * TWO_PI + state.t * 0.42;
      var rx = player.x + Math.cos(rootA) * 15;
      var ry = player.y + Math.sin(rootA) * 15;
      var tx, ty, latched = target >= 0 && target < eN;
      if (latched) {
        tx = ex[target];
        ty = ey[target];
      } else {
        var idle = 30 + lvl * 4;
        tx = player.x + Math.cos(rootA) * idle;
        ty = player.y + Math.sin(rootA) * idle;
      }
      var reach = Math.max(0.16, grab);
      var tipX = rx + (tx - rx) * reach;
      var tipY = ry + (ty - ry) * reach;
      var dx = tipX - rx;
      var dy = tipY - ry;
      var len = Math.sqrt(dx * dx + dy * dy) || 1;
      var nx = -dy / len;
      var ny = dx / len;
      var wob = Math.sin(state.t * 5.4 + leechPhase[i]) * Math.min(17, len * 0.16) * (0.72 + lvl * 0.055);
      var c1x = rx + dx * 0.38 + nx * wob;
      var c1y = ry + dy * 0.38 + ny * wob;
      var mx = rx + dx * 0.62 + nx * wob * 0.22;
      var my = ry + dy * 0.62 + ny * wob * 0.22;
      var c2x = rx + dx * 0.82 - nx * wob * 0.55;
      var c2y = ry + dy * 0.82 - ny * wob * 0.55;
      var bodyA = latched ? 0.68 : 0.38;
      n = addCurveInst(n, rx, ry, c1x, c1y, mx, my, 6.6 + lvl * 0.18, 0.10, 0.004, 0.015, bodyA, 0, 2);
      n = addCurveInst(n, mx, my, c2x, c2y, tipX, tipY, 6.6 + lvl * 0.18, 0.10, 0.004, 0.015, bodyA, 0, 2);
      if (latched && grab > 0.38) {
        var pulse = 0.45 + 0.25 * Math.sin(state.t * 18 + i);
        n = addCurveInst(n, rx, ry, c1x, c1y, mx, my, 2.3 + lvl * 0.1, 1.0, 0.13, 0.16, 0.72 + pulse * 0.24, 0.62, 2);
        n = addCurveInst(n, mx, my, c2x, c2y, tipX, tipY, 2.3 + lvl * 0.1, 1.0, 0.13, 0.16, 0.72 + pulse * 0.24, 0.62, 2);
        var ba = Math.atan2(tipY - c2y, tipX - c2x);
        var barb = 6.4;
        n = addLineInst(n, tipX, tipY, tipX + Math.cos(ba - 2.45) * barb, tipY + Math.sin(ba - 2.45) * barb, 2.0, 1.0, 0.16, 0.18, 0.86, 0.5);
        n = addLineInst(n, tipX, tipY, tipX + Math.cos(ba + 2.45) * barb, tipY + Math.sin(ba + 2.45) * barb, 2.0, 1.0, 0.16, 0.18, 0.86, 0.5);
      }
    }
    perf.leechInst = n - start;
    return n;
  }

  function addTankFeelInstances(n) {
    if (!TANK_LAYERS) {
      perf.tankFeelInst = 0;
      return n;
    }
    var start = n;
    var pulse = 0.5 + 0.5 * Math.sin(state.t * 8.2);
    var core = Math.max(tankCoreTier, Math.floor((tankThirstTier + tankFrenzyTier) * 0.45));
    var unleashA = Math.max(player.unleashFlash, player.unleash > 0 ? 0.22 + 0.18 * Math.sin(state.t * 10) : 0);
    if (unleashA > 0.01) {
      var burst = player.unleashFlash;
      var ring = 25 + burst * 18 + tankFrenzyTier * 1.4;
      n = addInst(n, player.x, player.y, ring, ring * 0.72, player.hull, 0, 0.45, 0.006, 0.025, 0.18 * unleashA, 0.22);
      n = addInst(n, player.x, player.y, ring * 0.42, ring * 0.28, player.hull, 0, 1.0, 0.055, 0.085, 0.22 * unleashA, 0.62);
      for (var u = 0; u < 4; u++) {
        var trail = player.hull + Math.PI + (u - 1.5) * 0.18;
        var side = player.hull + Math.PI * 0.5;
        var off = (u - 1.5) * 6;
        var dist = 18 + u * 8 + burst * 18;
        n = addInst(n, player.x + Math.cos(trail) * dist + Math.cos(side) * off, player.y + Math.sin(trail) * dist + Math.sin(side) * off, 3.0 + burst * 4.0, 2.0 + burst * 2.6, trail, 0, 0.82, 0.025, 0.05, 0.40 * unleashA, 0.25);
      }
    }
    if (core > 0) {
      var coreCount = Math.min(5, 2 + Math.floor(core * 0.45));
      for (var v = 0; v < coreCount; v++) {
        var pop = Math.max(0, Math.sin(state.t * 6.8 + v * 1.7));
        var localX = -7 + v * 3.6;
        var localY = ((v & 1) ? 5 : -5) + Math.sin(state.t * 3.2 + v) * 0.8;
        var ca = Math.cos(player.hull), sa = Math.sin(player.hull);
        var pxv = player.x + localX * ca - localY * sa;
        var pyv = player.y + localX * sa + localY * ca;
        var pr = (1.6 + pop * 2.4 + core * 0.12) * (player.unleash > 0 ? 1.22 : 1);
        n = addInst(n, pxv, pyv, pr, pr * 0.82, player.hull, 0, 0.92, 0.035, 0.065, 0.24 + pop * 0.28 + (player.unleash > 0 ? 0.10 : 0), 0.55);
      }
    }
    if (player.recoil > 0.02) {
      var mx0 = player.x + Math.cos(player.turret) * 43;
      var my0 = player.y + Math.sin(player.turret) * 43;
      var mr = 5 + player.recoil * 12;
      n = addInst(n, mx0, my0, mr, mr, 0, 0, 1.0, 0.42, 0.15, 0.55 * player.recoil, 0.8);
    }
    perf.tankFeelInst = n - start;
    return n;
  }

  function drawInstances(start, count) {
    if (count <= 0) return;
    gl.useProgram(program);
    gl.uniform2f(uCam, player.x, player.y);
    gl.uniform2f(uView, cssW, cssH);
    gl.uniform1f(uZoom, cameraZoom);
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, instBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, inst.subarray(start * INV_STRIDE, (start + count) * INV_STRIDE));
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, count);
    gl.bindVertexArray(null);
  }

  function colorForEnemy(type) {
    return T_COL[type] || 0;
  }

  function addCreatureBase(n, type, x, y, rad, face, phase, pulse) {
    var cid = colorForEnemy(type);
    var walk = Math.sin(phase * (type === 1 || type === 8 ? 10.5 : 6.5) + type);
    var breathe = Math.sin(phase * 3.1 + type * 0.7);
    var sx = rad * (1 + walk * 0.06);
    var sy = rad * (1 - walk * 0.045 + breathe * 0.025);
    var shape = 0;
    var angle = face + walk * 0.07;
    var alpha = 0.92;

    if (type === 1) { shape = 2; sx = rad * 0.95; sy = rad * (0.86 + walk * 0.07); angle = phase * 1.7; }
    else if (type === 2) { shape = 0; sx = rad * 1.12; sy = rad * (1.04 + breathe * 0.03); }
    else if (type === 3 || type === 8) { shape = 2; sx = rad * (type === 8 ? 1.75 : 1.55); sy = rad * 0.72; angle = face; }
    else if (type === 4 || type === 11) { shape = 3; sx = rad * (1.05 + breathe * 0.08); sy = rad * (1.05 + breathe * 0.08); }
    else if (type === 5) { shape = 0; sx = rad * (1.15 + breathe * 0.04); sy = rad * 1.05; }
    else if (type === 6 || type === 10) { shape = 2; sx = rad * (1.15 + breathe * 0.04); sy = rad * 0.88; angle = phase * (type === 10 ? -1.1 : 1.1); alpha = 0.84; }
    else if (type === 7) { shape = 0; sx = rad * (1.12 + breathe * 0.08); sy = rad * (1.12 + breathe * 0.08); }
    else if (type === 9) { shape = 1; sx = rad * 1.1; sy = rad * 0.95; angle = face + walk * 0.035; }

    return addInst(n, x, y, sx, sy, angle, shape, C_R[cid], C_G[cid], C_B[cid], alpha, pulse);
  }

  function addLocal(n, x, y, ox, oy, sx, sy, baseAngle, spin, shape, color, alpha, pulse) {
    var ca = Math.cos(baseAngle), sa = Math.sin(baseAngle);
    return addInst(n, x + ox * ca - oy * sa, y + ox * sa + oy * ca, sx, sy, baseAngle + spin, shape, C_R[color], C_G[color], C_B[color], alpha, pulse);
  }

  function addCreatureDetails(n, type, x, y, rad, face, phase, pulse) {
    var cid = colorForEnemy(type);
    var dark = 6;
    var hot = type === 4 || type === 11 ? 5 : cid;
    var walk = Math.sin(phase * 8.0);
    var alt = Math.sin(phase * 8.0 + Math.PI);
    var bite = Math.max(0, Math.sin(phase * 9.5));

    if (type === 0) {
      n = addLocal(n, x, y, -rad * 0.05, -rad * 0.82, rad * 0.72, rad * 0.15, face, 0.55 + walk * 0.28, 1, dark, 0.72, pulse);
      n = addLocal(n, x, y, -rad * 0.05, rad * 0.82, rad * 0.72, rad * 0.15, face, -0.55 + alt * 0.28, 1, dark, 0.72, pulse);
      n = addLocal(n, x, y, rad * 0.48, 0, rad * 0.28 + bite * 2, rad * 0.18, face, 0, 2, 5, 0.78, pulse);
    } else if (type === 1) {
      n = addLocal(n, x, y, rad * 0.55, 0, rad * 0.32, rad * 0.18, face, 0, 2, 5, 0.78, pulse);
      n = addLocal(n, x, y, -rad * 0.58, 0, rad * 0.38, rad * 0.1, face, 0, 1, dark, 0.65, pulse);
    } else if (type === 2 || type === 9) {
      n = addInst(n, x, y, rad * 0.52, rad * 0.52, face + phase * 0.25, 1, C_R[dark], C_G[dark], C_B[dark], 0.62, pulse);
      n = addLocal(n, x, y, rad * 0.55, -rad * 0.42, rad * 0.38, rad * 0.12, face, 0.25, 1, 5, 0.76, pulse);
      n = addLocal(n, x, y, rad * 0.55, rad * 0.42, rad * 0.38, rad * 0.12, face, -0.25, 1, 5, 0.76, pulse);
    } else if (type === 3 || type === 8) {
      n = addLocal(n, x, y, rad * 0.72, 0, rad * 0.36, rad * 0.32, face, 0, 0, hot, 0.84, pulse);
      n = addLocal(n, x, y, -rad * 0.72, 0, rad * 0.44, rad * 0.12, face, 0, 1, dark, 0.62, pulse);
      n = addLocal(n, x, y, 0, -rad * 0.55, rad * 0.5, rad * 0.1, face, walk * 0.36, 1, dark, 0.58, pulse);
      n = addLocal(n, x, y, 0, rad * 0.55, rad * 0.5, rad * 0.1, face, alt * 0.36, 1, dark, 0.58, pulse);
    } else if (type === 4 || type === 11) {
      n = addInst(n, x, y, rad * 0.45, rad * 0.45, phase * 1.4, 0, C_R[hot], C_G[hot], C_B[hot], 0.78, 0.35 + pulse);
      n = addLocal(n, x, y, rad * 0.78, 0, rad * 0.46, rad * 0.13, face, 0, 1, hot, 0.82, 0.45);
      if (type === 11) n = addInst(n, x, y, rad * 1.32, rad * 1.32, phase, 3, C_R[hot], C_G[hot], C_B[hot], 0.30, pulse);
    } else if (type === 5) {
      n = addInst(n, x, y, rad * 0.48, rad * 0.48, phase, 2, C_R[dark], C_G[dark], C_B[dark], 0.66, pulse);
      n = addLocal(n, x, y, rad * 0.48, 0, rad * 0.24, rad * 0.24, phase, 0, 0, 1, 0.75, pulse);
      n = addLocal(n, x, y, -rad * 0.24, rad * 0.42, rad * 0.22, rad * 0.22, phase, 0, 0, 1, 0.72, pulse);
      n = addLocal(n, x, y, -rad * 0.24, -rad * 0.42, rad * 0.22, rad * 0.22, phase, 0, 0, 1, 0.72, pulse);
    } else if (type === 6 || type === 10) {
      n = addInst(n, x, y, rad * 1.28, rad * 1.28, phase, 3, C_R[cid], C_G[cid], C_B[cid], 0.34, pulse);
      n = addLocal(n, x, y, rad * 0.42, 0, rad * (type === 10 ? 1.0 : 0.7), rad * 0.09, face, walk * 0.75, 1, cid, 0.58, pulse);
    } else {
      n = addInst(n, x, y, rad * 0.55, rad * 0.55, -phase * 1.2, 2, C_R[dark], C_G[dark], C_B[dark], 0.66, pulse);
      n = addInst(n, x, y, rad * 1.25, rad * 1.25, phase, 3, C_R[hot], C_G[hot], C_B[hot], 0.24 + pulse * 0.12, pulse);
    }
    return n;
  }

  function renderWorld() {
    var n = 0;
    var usingOldSprites = OLD_SPRITES && spriteReady;
    perf.envRocks = 0;
    if (usingOldSprites) {
      resetSpriteBatches();
      prepareSpriteDensity();
      queueOldEnvironment();
    } else {
      perf.spriteDraws = 0;
      perf.spriteAnimated = 0;
      perf.spriteStatic = 0;
      perf.spriteCulled = 0;
      perf.envSprites = 0;
      perf.corpseSprites = 0;
      perf.tankSprites = 0;
    }
    var grid = 160;
    var left = Math.floor((player.x - viewWorldW * 0.55) / grid) * grid;
    var right = player.x + viewWorldW * 0.55;
    var top = Math.floor((player.y - viewWorldH * 0.55) / grid) * grid;
    var bottom = player.y + viewWorldH * 0.55;
    if (!(usingOldSprites && OLD_ENV)) {
      for (var gx = left; gx < right; gx += grid) {
        n = addInst(n, gx, player.y, 1.2, viewWorldH * 0.62, 0, 1, 0.18, 0.11, 0.08, 0.16);
      }
      for (var gy = top; gy < bottom; gy += grid) {
        n = addInst(n, player.x, gy, viewWorldW * 0.62, 1.2, 0, 1, 0.18, 0.11, 0.08, 0.16);
      }
      for (var d = 0; d < dN; d++) {
        var dc = dcol[d];
        n = addInst(n, dxs[d], dys[d], dr[d], dr[d] * 0.72, 0, 0, C_R[dc], C_G[dc], C_B[dc], da[d]);
      }
    }
    n = addVeinTrailInstances(n);
    n = addGoreSplatInstances(n);
    n = addGoreInstances(n);
    var bgN = n;

    if (usingOldSprites) {
      for (var c = 0; c < cN; c++) queueOldCorpseSprite(c);
    }

    var detailLeft = eN > 1050 ? Math.min(DETAIL_MAX, 170) : (eN > 650 ? Math.min(DETAIL_MAX, 280) : DETAIL_MAX);
    var detailStart = detailLeft;
    var closeX = viewWorldW * 0.6;
    var closeY = viewWorldH * 0.6;
    for (var e = 0; e < eN; e++) {
      var type = etype[e];
      var pulse = Math.max(0, Math.min(1, 1 - ehp[e] / (T_HP[type] * (1 + state.t * 0.014) + 1)));
      if (usingOldSprites && queueOldEnemySprite(e)) continue;
      n = addCreatureBase(n, type, ex[e], ey[e], er[e], eface[e], ephase[e], pulse);
      var dxv = ex[e] - player.x;
      var dyv = ey[e] - player.y;
      if (detailLeft > 0 && Math.abs(dxv) < closeX && Math.abs(dyv) < closeY &&
          (er[e] > 16 || dxv * dxv + dyv * dyv < 160000 || ((e + state.tick) & 15) === 0)) {
        n = addCreatureDetails(n, type, ex[e], ey[e], er[e], eface[e], ephase[e], pulse);
        detailLeft--;
      }
    }
    perf.creatureDetails = usingOldSprites ? 0 : detailStart - detailLeft;

    for (var m = 0; m < mN; m++) {
      var pulseM = 1 + Math.sin(state.t * 8 + m) * 0.16;
      var rm = (mval[m] > 1 ? 5.4 : 3.8) * pulseM;
      n = addInst(n, mx[m], my[m], rm, rm, 0, 0, 0.95, 0.04, 0.08, 0.95, 0.45);
      n = addInst(n, mx[m] - rm * 0.32, my[m] - rm * 0.32, rm * 0.32, rm * 0.32, 0, 0, 1.0, 0.22, 0.25, 0.52, 0.55);
    }

    for (var b = 0; b < bN; b++) {
      var ba = Math.atan2(bvy[b], bvx[b]);
      if (usingOldSprites && queueWeaponProjectileSprite(b, ba)) continue;
      if (bkind[b] === 1) {
        n = addInst(n, bx[b], by[b], 17, 5.2, ba, 1, 1.0, 0.62, 0.18, 0.98, 0.56);
        n = addInst(n, bx[b] - Math.cos(ba) * 10, by[b] - Math.sin(ba) * 10, 7, 4, ba, 0, 1.0, 0.22, 0.08, 0.55, 0.55);
      } else if (bkind[b] === 2) {
        n = addInst(n, bx[b], by[b], 7, 2.8, ba, 1, 0.48, 0.95, 0.38, 0.9, 0.25);
      } else {
        n = addInst(n, bx[b], by[b], 12, 3.5, ba, 1, 1.0, 0.46, 0.23, 0.96, 0.45);
      }
    }

    if (laserT > 0) {
      var la = Math.min(1, laserT);
      var lp = 0.78 + 0.22 * Math.sin(state.t * 54);
      var lwa = Math.atan2(laserY1 - laserY0, laserX1 - laserX0);
      n = addLineInst(n, laserX0, laserY0, laserX1, laserY1, 13.0 + la * 2.2, 0.24, 0.004, 0.026, 0.36 * la, 0.35);
      n = addLineInst(n, laserX0, laserY0, laserX1, laserY1, 6.4 + lp * 1.4, 0.92, 0.055, 0.095, 0.70 * la, 0.68);
      n = addLineInst(n, laserX0, laserY0, laserX1, laserY1, 2.0 + lp * 0.9, 1.0, 0.56, 0.56, 0.86 * la, 0.78);
      n = addInst(n, laserX0 + Math.cos(lwa) * 8, laserY0 + Math.sin(lwa) * 8, 8.5 + la * 5.5, 6.0 + la * 3.2, lwa, 0, 1.0, 0.12, 0.12, 0.70 * la, 0.72);
      if (la > 0.45) {
        for (var ls = 1; ls <= 3; ls++) {
          var kls = ls * 0.22 + 0.11 * Math.sin(state.t * 18 + ls);
          n = addInst(n, laserX0 + (laserX1 - laserX0) * kls, laserY0 + (laserY1 - laserY0) * kls, 3.2, 2.0, lwa, 0, 1.0, 0.18, 0.18, 0.26 * la, 0.45);
        }
      }
    }

    for (var p = 0; p < pN; p++) {
      var pc = pcol[p];
      var alpha = Math.max(0, plife[p] / pmax[p]);
      n = addInst(n, px[p], py[p], pr[p], pr[p], 0, 0, C_R[pc], C_G[pc], C_B[pc], alpha * 0.75, 0);
    }

    n = addExplosionInstances(n);
    n = addLeechInstances(n);
    n = addTankFeelInstances(n);

    var tankQueued = usingOldSprites && queueOldTankSprite();
    if (!tankQueued) {
      var hot = player.hurt > 0 ? player.hurt : player.recoil * 0.35;
      n = addInst(n, player.x, player.y, player.r + 10, player.r + 7, 0, 0, 0.02, 0.005, 0.004, 0.5, 0);
      n = addRot(n, -1, -17, 27, 5, player.hull, 1, 0.34, 0.31, 0.27, 0.95, hot);
      n = addRot(n, -1, 17, 27, 5, player.hull, 1, 0.34, 0.31, 0.27, 0.95, hot);
      n = addInst(n, player.x, player.y, 28, 20, player.hull, 1, 0.47, 0.40, 0.34, 0.98, hot);
      n = addInst(n, player.x + Math.cos(player.turret) * 21, player.y + Math.sin(player.turret) * 21, 26, 4.2, player.turret, 1, 0.70, 0.58, 0.45, 0.98, player.recoil);
      n = addInst(n, player.x, player.y, 9, 9, 0, 0, 0.95, 0.08, 0.05, 0.85, player.meter / 100);
    }
    n = addBubbleInstances(n);

    gl.viewport(0, 0, glCanvas.width, glCanvas.height);
    gl.clearColor(0.028, 0.023, 0.019, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (usingOldSprites) {
      drawInstances(0, bgN);
      flushSprites();
      drawInstances(bgN, n - bgN);
    } else {
      drawInstances(0, n);
    }
    perf.instances = n;
  }

  var perf = {
    fps: 60, frameMs: 16.7, updateMs: 0, renderMs: 0, hudMs: 0, worstMs: 0,
    updateAvg: 0, renderAvg: 0, updateWorst: 0, renderWorst: 0,
    rafGap: 16.7, loafs: 0, loafWorst: 0, scripts: '', instances: 0,
    creatureDetails: 0, spriteDraws: 0, spriteAnimated: 0, spriteStatic: 0,
    spriteCulled: 0, envSprites: 0, corpseSprites: 0, tankSprites: 0,
    colliderMs: 0, colliderPairs: 0, colliderContacts: 0, colliderSkipped: 0, colliderPush: 0,
    leechMs: 0, leeches: 0, leechInst: 0, veins: 0, veinInst: 0, tankFeelInst: 0,
    goreMs: 0, gorePieces: 0, goreInst: 0, splats: 0, splatInst: 0,
    booms: 0, boomInst: 0, bubbles: 0, bubbleInst: 0,
    envRocks: 0, envContacts: 0, envBroken: 0,
    frames: 0, longFrames: 0
  };

  var ring = new Float32Array(120);
  var ringI = 0;
  var loafLog = [];
  var perfResetAt = 0;

  function resetPerfTiming() {
    if (!perf) return;
    perf.fps = 60;
    perf.frameMs = 16.7;
    perf.updateMs = 0;
    perf.renderMs = 0;
    perf.hudMs = 0;
    perf.worstMs = 0;
    perf.updateAvg = 0;
    perf.renderAvg = 0;
    perf.updateWorst = 0;
    perf.renderWorst = 0;
    perf.rafGap = 16.7;
    perf.loafs = 0;
    perf.loafWorst = 0;
    perf.scripts = '';
    perf.longFrames = 0;
    perf.spriteDraws = 0;
    perf.spriteAnimated = 0;
    perf.spriteStatic = 0;
    perf.spriteCulled = 0;
    perf.envSprites = 0;
    perf.corpseSprites = 0;
    perf.tankSprites = 0;
    perf.colliderMs = 0;
    perf.colliderPairs = 0;
    perf.colliderContacts = 0;
    perf.colliderSkipped = 0;
    perf.colliderPush = 0;
    perf.leechMs = 0;
    perf.leeches = 0;
    perf.leechInst = 0;
    perf.veins = 0;
    perf.veinInst = 0;
    perf.tankFeelInst = 0;
    perf.goreMs = 0;
    perf.gorePieces = 0;
    perf.goreInst = 0;
    perf.splats = 0;
    perf.splatInst = 0;
    perf.booms = 0;
    perf.boomInst = 0;
    perf.bubbles = 0;
    perf.bubbleInst = 0;
    perf.envRocks = 0;
    perf.envContacts = 0;
    perf.envBroken = 0;
    perfResetAt = performance.now() + 650;
    loafLog.length = 0;
    for (var i = 0; i < ring.length; i++) ring[i] = 0;
  }

  if ('PerformanceObserver' in window) {
    try {
      var po = new PerformanceObserver(function (list) {
        var entries = list.getEntries();
        for (var i = 0; i < entries.length; i++) {
          var e = entries[i];
          if ((e.startTime || 0) < perfResetAt) continue;
          perf.loafs++;
          perf.loafWorst = Math.max(perf.loafWorst, e.duration || 0);
          if (e.duration > 50) {
            var src = '';
            if (e.scripts && e.scripts.length) {
              var worst = e.scripts[0];
              for (var s = 1; s < e.scripts.length; s++) {
                if ((e.scripts[s].duration || 0) > (worst.duration || 0)) worst = e.scripts[s];
              }
              src = (worst.sourceFunctionName || worst.invokerType || 'script') + ' ' + Math.round(worst.duration || 0) + 'ms';
            }
            perf.scripts = src || 'browser/render';
            loafLog.push({ t: performance.now(), d: e.duration, src: perf.scripts });
            if (loafLog.length > 24) loafLog.shift();
          }
        }
      });
      po.observe({ type: 'long-animation-frame', buffered: true });
    } catch (err) {}
  }

  function inRect(x, y, r) {
    return !!r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  }

  function hudRR(x, y, w, h, r) {
    r = Math.min(r, w * 0.5, h * 0.5);
    hud.beginPath();
    hud.moveTo(x + r, y);
    hud.lineTo(x + w - r, y);
    hud.arcTo(x + w, y, x + w, y + r, r);
    hud.lineTo(x + w, y + h - r);
    hud.arcTo(x + w, y + h, x + w - r, y + h, r);
    hud.lineTo(x + r, y + h);
    hud.arcTo(x, y + h, x, y + h - r, r);
    hud.lineTo(x, y + r);
    hud.arcTo(x, y, x + r, y, r);
    hud.closePath();
  }

  function drawPanel(alpha) {
    hud.fillStyle = 'rgba(8,5,4,' + alpha + ')';
    hud.fillRect(0, 0, cssW, cssH);
    var gd = hud.createLinearGradient(0, 0, 0, cssH);
    gd.addColorStop(0, 'rgba(8,3,3,0.55)');
    gd.addColorStop(0.4, 'rgba(8,3,3,0.0)');
    gd.addColorStop(1, 'rgba(8,3,3,0.88)');
    hud.fillStyle = gd;
    hud.fillRect(0, 0, cssW, cssH);
    // blood-mechanical corner ticks
    var tk = 20, mg = 4;
    hud.strokeStyle = 'rgba(196,18,40,0.34)';
    hud.lineWidth = 1.5;
    hud.beginPath();
    hud.moveTo(mg + tk, mg); hud.lineTo(mg, mg); hud.lineTo(mg, mg + tk);
    hud.moveTo(cssW - mg - tk, mg); hud.lineTo(cssW - mg, mg); hud.lineTo(cssW - mg, mg + tk);
    hud.moveTo(mg + tk, cssH - mg); hud.lineTo(mg, cssH - mg); hud.lineTo(mg, cssH - mg - tk);
    hud.moveTo(cssW - mg - tk, cssH - mg); hud.lineTo(cssW - mg, cssH - mg); hud.lineTo(cssW - mg, cssH - mg - tk);
    hud.stroke();
  }

  function drawButton(x, y, w, h, label, primary) {
    var r = h * 0.5;
    var gr = hud.createLinearGradient(x, y, x, y + h);
    if (primary) {
      gr.addColorStop(0, BT_CRIM);
      gr.addColorStop(1, BT_BLOOD_DK);
    } else {
      gr.addColorStop(0, '#332a24');
      gr.addColorStop(1, '#1d1714');
    }
    hud.fillStyle = gr;
    hudRR(x, y, w, h, r);
    hud.fill();
    hud.strokeStyle = primary ? BT_CRIM_HI : BT_BONE_DIM;
    hud.lineWidth = primary ? 2 : 1.5;
    hudRR(x + 0.5, y + 0.5, w - 1, h - 1, Math.max(1, r - 0.5));
    hud.stroke();
    hud.fillStyle = '#fff';
    hud.font = '700 ' + Math.max(13, Math.min(21, h * 0.40)) + 'px sans-serif';
    hud.textAlign = 'center';
    hud.textBaseline = 'middle';
    hud.fillText(label, x + w * 0.5, y + h * 0.5);
    return { x: x, y: y, w: w, h: h };
  }

  function drawHudButton(x, y, w, h, label) {
    var r = h * 0.5;
    hud.fillStyle = 'rgba(10,5,4,0.80)';
    hudRR(x, y, w, h, r);
    hud.fill();
    hud.strokeStyle = 'rgba(196,18,40,0.50)';
    hud.lineWidth = 1.2;
    hudRR(x + 0.5, y + 0.5, w - 1, h - 1, Math.max(1, r - 0.5));
    hud.stroke();
    hud.fillStyle = BT_BONE;
    hud.font = '700 ' + Math.max(10, Math.min(12, h * 0.38)) + 'px sans-serif';
    hud.textAlign = 'center';
    hud.textBaseline = 'middle';
    hud.fillText(label, x + w * 0.5, y + h * 0.5);
    return { x: x, y: y, w: w, h: h };
  }

  function drawJoystick() {
    if (!useJoystick || state.mode !== 'PLAYING' || state.paused) return;
    var bx = joyActive ? joyBaseX : Math.max(66, cssW * 0.16);
    var by = joyActive ? joyBaseY : Math.max(88, cssH - 88);
    var kx = joyActive ? joyKnobX : bx;
    var ky = joyActive ? joyKnobY : by;
    hud.save();
    // outer ring - subtle when idle, visible when active
    hud.globalAlpha = joyActive ? 0.68 : 0.19;
    hud.lineWidth = joyActive ? 2 : 1;
    hud.strokeStyle = joyActive ? BT_CRIM_HI : BT_BONE_DIM;
    hud.fillStyle = joyActive ? 'rgba(18,6,5,0.34)' : 'rgba(8,4,3,0.16)';
    hud.beginPath();
    hud.arc(bx, by, joyRadius, 0, TWO_PI);
    hud.fill();
    hud.stroke();
    // cross-hair tick lines on idle ring
    if (!joyActive) {
      hud.lineWidth = 0.7;
      var t = joyRadius * 0.32;
      hud.beginPath();
      hud.moveTo(bx - t, by); hud.lineTo(bx + t, by);
      hud.moveTo(bx, by - t); hud.lineTo(bx, by + t);
      hud.stroke();
    }
    // knob
    var knobR = Math.max(14, joyRadius * 0.28);
    hud.globalAlpha = joyActive ? 0.92 : 0.38;
    if (joyActive) {
      var kg = hud.createRadialGradient(kx - knobR * 0.25, ky - knobR * 0.25, 0, kx, ky, knobR);
      kg.addColorStop(0, BT_CRIM_HI);
      kg.addColorStop(1, BT_BLOOD);
      hud.fillStyle = kg;
    } else {
      hud.fillStyle = BT_BLOOD;
    }
    hud.strokeStyle = joyActive ? 'rgba(255,180,160,0.70)' : 'rgba(150,60,50,0.36)';
    hud.lineWidth = 1;
    hud.beginPath();
    hud.arc(kx, ky, knobR, 0, TWO_PI);
    hud.fill();
    hud.stroke();
    hud.restore();
  }

  function drawHudTankPreview(cx, cy, size) {
    var layers = [
      ['lp_treads', tankTreadsTier],
      ['lp_armor', tankArmorTier],
      ['lp_thirst', tankThirstTier],
      ['lp_core', tankCoreTier]
    ];
    var drawn = false;
    hud.save();
    hud.imageSmoothingEnabled = false;
    for (var i = 0; i < layers.length; i++) {
      var img = spriteImages[layers[i][0]];
      if (!img || !img.complete || !img.naturalWidth) continue;
      var tier = clampInt(layers[i][1], 0, 6);
      var cell = Math.max(1, Math.floor(img.naturalHeight || 64));
      hud.drawImage(img, tier * cell, 0, cell, cell, Math.round(cx - size * 0.5), Math.round(cy - size * 0.5), Math.round(size), Math.round(size));
      drawn = true;
    }
    var weaponImg = spriteImages.weapon_turrets;
    if (weaponImg && weaponImg.complete && weaponImg.naturalWidth) {
      var wtSize = Math.round(size * 1.12);
      hud.drawImage(weaponImg, weaponAtlasTier(equipWeapon) * WEAPON_TURRET_CELL, weaponRow(equipWeapon) * WEAPON_TURRET_CELL, WEAPON_TURRET_CELL, WEAPON_TURRET_CELL, Math.round(cx - wtSize * 0.5), Math.round(cy - wtSize * 0.5), wtSize, wtSize);
      drawn = true;
    } else {
      var cannonImg = spriteImages.lp_cannon;
      if (cannonImg && cannonImg.complete && cannonImg.naturalWidth) {
        var cannonCell = Math.max(1, Math.floor(cannonImg.naturalHeight || 64));
        hud.drawImage(cannonImg, tankCannonTier * cannonCell, 0, cannonCell, cannonCell, Math.round(cx - size * 0.5), Math.round(cy - size * 0.5), Math.round(size), Math.round(size));
        drawn = true;
      }
    }
    hud.restore();
    if (drawn) return;
    hud.fillStyle = '#120907';
    hud.fillRect(cx - size * 0.38, cy - size * 0.26, size * 0.76, size * 0.52);
    hud.fillStyle = '#6d4c39';
    hud.fillRect(cx - size * 0.42, cy - size * 0.16, size * 0.84, size * 0.1);
    hud.fillRect(cx - size * 0.42, cy + size * 0.08, size * 0.84, size * 0.1);
    hud.fillStyle = '#9b2d25';
    hud.fillRect(cx - size * 0.12, cy - size * 0.08, size * 0.24, size * 0.16);
    hud.fillStyle = '#d9b17a';
    hud.fillRect(cx + size * 0.02, cy - size * 0.035, size * 0.44, size * 0.07);
  }

  function drawMenu() {
    var hero = hudImages.hero;
    hud.fillStyle = '#050302';
    hud.fillRect(0, 0, cssW, cssH);
    if (hero && hero.complete && hero.naturalWidth) {
      var sc = Math.max(cssW / hero.naturalWidth, cssH / hero.naturalHeight);
      var dw = hero.naturalWidth * sc;
      var dh = hero.naturalHeight * sc;
      hud.globalAlpha = 0.48;
      hud.drawImage(hero, (cssW - dw) * 0.5, (cssH - dh) * 0.5, dw, dh);
      hud.globalAlpha = 1;
      var gd = hud.createLinearGradient(0, 0, 0, cssH);
      gd.addColorStop(0, 'rgba(8,5,4,0.55)');
      gd.addColorStop(0.4, 'rgba(8,5,4,0.08)');
      gd.addColorStop(1, 'rgba(8,5,4,0.92)');
      hud.fillStyle = gd;
      hud.fillRect(0, 0, cssW, cssH);
    } else {
      drawPanel(0.90);
    }
    rShop.length = 0;
    rWeapons.length = 0;
    var w = Math.min(440, cssW - 32);
    var x = (cssW - w) * 0.5;
    var titleY = cssH * 0.44;
    // large glowing title
    hud.textAlign = 'center';
    hud.textBaseline = 'middle';
    hud.shadowColor = BT_CRIM;
    hud.shadowBlur = Math.max(16, Math.min(28, cssW * 0.05));
    hud.fillStyle = '#fff';
    hud.font = '900 ' + Math.max(30, Math.min(62, cssW * 0.115)) + 'px sans-serif';
    hud.fillText('BLOODTREAD', cssW * 0.5, titleY);
    hud.shadowBlur = 0;
    // tagline
    hud.fillStyle = BT_BONE_DIM;
    hud.font = Math.max(11, Math.min(17, cssW * 0.032)) + 'px sans-serif';
    hud.fillText('CRUSH. BLEED. EVOLVE.', cssW * 0.5, titleY + Math.max(20, cssH * 0.038));
    // buttons below title
    var by = Math.min(cssH - 185, titleY + cssH * 0.15);
    var btnH = Math.max(44, Math.min(54, cssH * 0.072));
    rPlay  = drawButton(x, by, w, btnH, 'START RUN', true);
    rForge = drawButton(x, by + btnH + 12, w, btnH - 4, 'BLOODFORGE   ' + Math.floor(totalBank), false);
    // weapon + track info
    hud.fillStyle = BT_BONE_DIM;
    hud.font = Math.max(10, Math.min(13, cssH * 0.018)) + 'px sans-serif';
    var infoY = by + btnH * 2 + 22;
    hud.fillText('weapon: ' + weaponName(equipWeapon) + '   tracks: ' + META.armor + '-' + META.core + '-' + META.cannon + '-' + META.treads + '-' + META.thirst + '-' + META.frenzy, cssW * 0.5, infoY);
    if (bestTime > 0) {
      hud.fillText('BEST ' + fmtTime(bestTime), cssW * 0.5, infoY + 18);
    }
    // CHEATS corner button (top-left, small)
    var chw = Math.max(58, Math.min(92, cssW * 0.155)), chh = Math.max(22, Math.min(30, cssH * 0.04));
    var cms = 10;
    hud.fillStyle = 'rgba(0,0,0,0.48)';
    hud.strokeStyle = '#5a2a26';
    hud.lineWidth = 1.2;
    hudRR(cms, cms, chw, chh, 5);
    hud.fill(); hud.stroke();
    hud.fillStyle = BT_BONE_DIM;
    hud.font = '700 ' + Math.max(9, Math.min(12, chh * 0.48)) + 'px sans-serif';
    hud.fillText('CHEATS', cms + chw * 0.5, cms + chh * 0.5);
    rCheat = { x: cms, y: cms, w: chw, h: chh };
    hud.textAlign = 'start';
  }

  function drawShop() {
    drawPanel(0.96);
    var w = Math.min(520, cssW - 28);
    var x = (cssW - w) * 0.5;
    var y = Math.max(16, cssH * 0.032);
    hud.textAlign = 'center';
    hud.textBaseline = 'middle';
    // BLOODFORGE title with crim glow
    hud.shadowColor = BT_CRIM;
    hud.shadowBlur = 14;
    hud.fillStyle = BT_CRIM_HI;
    hud.font = '900 ' + Math.max(18, Math.min(26, cssH * 0.038)) + 'px sans-serif';
    hud.fillText('BLOODFORGE', cssW * 0.5, y + 14);
    hud.shadowBlur = 0;
    hud.fillStyle = BT_BONE;
    hud.font = 'bold ' + Math.max(11, Math.min(14, cssH * 0.02)) + 'px sans-serif';
    hud.fillText('BLOOD: ' + Math.floor(totalBank), cssW * 0.5, y + 36);
    drawHudTankPreview(cssW * 0.5, y + 100, Math.min(104, cssH * 0.15));

    rWeapons.length = 0;
    var wy = y + 158;
    var gap = 6;
    var ww = (w - gap * 3) / 4;
    var wsH = Math.max(36, Math.min(44, cssH * 0.058));
    for (var wi = 0; wi < WEAPONS.length; wi++) {
      var W = WEAPONS[wi];
      var rx = x + wi * (ww + gap);
      var owned = !!ownedWeapons[W.id];
      var eq = equipWeapon === W.id;
      hud.fillStyle = eq ? '#2a1714' : '#140e0c';
      hud.strokeStyle = eq ? BT_CRIM_HI : (owned ? '#6a3a32' : '#3a2622');
      hud.lineWidth = eq ? 2.2 : 1.2;
      hudRR(rx, wy, ww, wsH, 7);
      hud.fill(); hud.stroke();
      // weapon colour dot
      var wdot = 'rgb(' + Math.round(W.r * 255) + ',' + Math.round(W.g * 255) + ',' + Math.round(W.b * 255) + ')';
      hud.fillStyle = wdot;
      hud.beginPath(); hud.arc(rx + 9, wy + wsH * 0.32, 3, 0, TWO_PI); hud.fill();
      hud.fillStyle = owned ? '#fff' : BT_BONE_DIM;
      hud.font = 'bold ' + Math.max(8, Math.min(10, wsH * 0.25)) + 'px sans-serif';
      hud.fillText(W.name, rx + ww * 0.5 + 4, wy + wsH * 0.34);
      hud.fillStyle = eq ? wdot : (owned ? BT_BONE_DIM : (totalBank >= W.cost ? '#fff' : '#7a5a54'));
      hud.font = 'bold ' + Math.max(7, Math.min(9, wsH * 0.22)) + 'px sans-serif';
      hud.fillText(eq ? 'EQUIPPED' : (owned ? 'EQUIP' : String(W.cost)), rx + ww * 0.5, wy + wsH * 0.74);
      rWeapons.push({ x: rx, y: wy, w: ww, h: wsH, id: W.id });
    }

    rShop.length = 0;
    var rowH = Math.max(40, Math.min(58, (cssH - wy - wsH - 96) / TRACKS.length - 4));
    var top = wy + wsH + 14;
    for (var i = 0; i < TRACKS.length; i++) {
      var tr = TRACKS[i];
      var ry = top + i * (rowH + 4);
      var tier = META[tr.id];
      var cost = trackCost(tr.id);
      var sel = selectedTrack === tr.id;
      hud.fillStyle = sel ? '#241a14' : '#16100d';
      hud.strokeStyle = sel ? BT_CRIM_HI : '#5a2a26';
      hud.lineWidth = sel ? 2.2 : 1.2;
      hudRR(x, ry, w, rowH, 9);
      hud.fill(); hud.stroke();
      // icon medallion
      var mx = x + 22, my = ry + rowH * 0.5, mr = Math.max(11, rowH * 0.32);
      hud.fillStyle = '#0d0807';
      hud.beginPath(); hud.arc(mx, my, mr, 0, TWO_PI); hud.fill();
      hud.strokeStyle = BT_CRIM; hud.lineWidth = 1.2;
      hud.beginPath(); hud.arc(mx, my, mr, 0, TWO_PI); hud.stroke();
      hud.textAlign = 'left';
      hud.fillStyle = '#fff';
      var tx = mx + mr + 8;
      hud.font = 'bold ' + Math.max(11, Math.min(16, rowH * 0.34)) + 'px sans-serif';
      hud.fillText(tr.name, tx, ry + rowH * 0.32);
      hud.fillStyle = BT_BONE_DIM;
      hud.font = Math.max(9, Math.min(11, rowH * 0.27)) + 'px sans-serif';
      hud.fillText(trackEffect(tr.id), tx, ry + rowH * 0.61);
      // tier dots
      for (var t = 0; t < MAXTIER; t++) {
        hud.fillStyle = t < tier ? BT_CRIM_HI : '#3a2a26';
        hud.beginPath(); hud.arc(tx + t * 11, ry + rowH * 0.82, 3.2, 0, TWO_PI); hud.fill();
      }
      var bw = 66, bx0 = x + w - bw - 8, by0 = ry + rowH * 0.19, bh = rowH * 0.62;
      var afford = cost != null && totalBank >= cost;
      hud.fillStyle = cost == null ? '#2a2a2a' : (afford ? BT_CRIM : '#33231f');
      hudRR(bx0, by0, bw, bh, bh * 0.5);
      hud.fill();
      hud.textAlign = 'center';
      hud.fillStyle = cost == null ? BT_BONE_DIM : (afford ? '#fff' : '#7a6a64');
      hud.font = 'bold ' + Math.max(10, Math.min(13, bh * 0.50)) + 'px sans-serif';
      hud.fillText(cost == null ? 'MAX' : String(cost), bx0 + bw * 0.5, by0 + bh * 0.5);
      rShop.push({ x: x, y: ry, w: w, h: rowH, id: tr.id, bx: bx0, by: by0, bw: bw, bh: bh });
    }
    rShopBack = drawButton(x, Math.min(cssH - 52, top + TRACKS.length * (rowH + 4) + 8), w, 42, 'BACK', false);
    hud.textAlign = 'start';
  }

  function drawCheat() {
    drawPanel(0.97);
    var w = Math.min(520, cssW - 32);
    var x = (cssW - w) * 0.5;
    var y = Math.max(28, cssH * 0.07);
    hud.textAlign = 'center';
    hud.textBaseline = 'middle';
    hud.shadowColor = BT_CRIM;
    hud.shadowBlur = 14;
    hud.fillStyle = BT_CRIM_HI;
    hud.font = '900 ' + Math.max(20, Math.min(28, cssH * 0.04)) + 'px sans-serif';
    hud.fillText('CHEATS', cssW * 0.5, y);
    hud.shadowBlur = 0;
    hud.fillStyle = BT_BONE_DIM;
    hud.font = Math.max(10, Math.min(13, cssH * 0.018)) + 'px sans-serif';
    var lines = [
      '9: jump to minute 9 extreme horde',
      '0/R: restart   P: pause   M: menu   N: mute',
      'F2 or Ctrl+D: debug overlay   1/2/3: mutation card'
    ];
    for (var i = 0; i < lines.length; i++) hud.fillText(lines[i], cssW * 0.5, y + 36 + i * 20);
    var btnH = Math.max(40, Math.min(48, cssH * 0.065));
    var by = y + 106;
    rCheatMoney = drawButton(x, by, w, btnH, 'ADD 50000 BLOOD', true);
    rCheatMax   = drawButton(x, by + btnH + 10, w, btnH, 'MAX ALL TRACKS + WEAPONS', false);
    rCheatMin9  = drawButton(x, by + (btnH + 10) * 2, w, btnH, 'START MINUTE 9 HORDE', false);
    rCheatReset = drawButton(x, by + (btnH + 10) * 3, w, btnH, 'WIPE REBUILD SAVE', false);
    rCheatBack  = drawButton(x, by + (btnH + 10) * 4, w, btnH, 'BACK', false);
  }

  function drawGameOver() {
    drawPanel(0.92);
    var w = Math.min(440, cssW - 36);
    var x = (cssW - w) * 0.5;
    var y = Math.max(52, cssH * 0.20);
    hud.textAlign = 'center';
    hud.textBaseline = 'middle';
    hud.shadowColor = BT_CRIM;
    hud.shadowBlur = 20;
    hud.fillStyle = BT_CRIM_HI;
    hud.font = '900 ' + Math.max(22, Math.min(38, cssH * 0.054)) + 'px sans-serif';
    hud.fillText('ENGINE STALLS', cssW * 0.5, y);
    hud.shadowBlur = 0;
    var timeSize = Math.max(30, Math.min(50, cssH * 0.07));
    hud.fillStyle = '#fff';
    hud.font = '700 ' + timeSize + 'px sans-serif';
    hud.fillText(fmtTime(state.t), cssW * 0.5, y + timeSize + 16);
    hud.fillStyle = BT_BONE_DIM;
    hud.font = Math.max(11, Math.min(14, cssH * 0.018)) + 'px sans-serif';
    hud.fillText('SURVIVED', cssW * 0.5, y + timeSize + 36);
    hud.fillStyle = BT_BONE;
    hud.font = Math.max(11, Math.min(14, cssH * 0.018)) + 'px sans-serif';
    hud.fillText('LV ' + player.level + '   BLOOD +' + Math.floor(state.blood) + '   KILLS ' + state.kills, cssW * 0.5, y + timeSize + 56);
    if (bestTime > 0) hud.fillText('BEST ' + fmtTime(bestTime), cssW * 0.5, y + timeSize + 74);
    var btnH = Math.max(42, Math.min(50, cssH * 0.068));
    var gob = btnH + 10;
    var by0 = Math.min(cssH - gob * 3 - 20, y + timeSize + 106);
    rRetry = drawButton(x, by0, w, btnH, 'RUN AGAIN', true);
    rForge = drawButton(x, by0 + gob, w, btnH - 2, 'BLOODFORGE', false);
    rMenu  = drawButton(x, by0 + gob * 2, w, btnH - 4, 'MENU', false);
  }

  function drawPause() {
    drawPanel(0.78);
    var w = Math.min(400, cssW - 36);
    var x = (cssW - w) * 0.5;
    var y = cssH * 0.32;
    hud.textAlign = 'center';
    hud.textBaseline = 'middle';
    hud.fillStyle = '#fff';
    hud.font = '900 ' + Math.max(24, Math.min(36, cssH * 0.05)) + 'px sans-serif';
    hud.fillText('PAUSED', cssW * 0.5, y);
    var btnH = Math.max(42, Math.min(50, cssH * 0.068));
    var gob = btnH + 10;
    rResume    = drawButton(x, y + 48, w, btnH, 'RESUME', true);
    rPauseForge = drawButton(x, y + 48 + gob, w, btnH - 2, 'BANK BLOOD + FORGE', false);
    rQuit      = drawButton(x, y + 48 + gob * 2, w, btnH - 4, 'BANK BLOOD + MENU', false);
  }

  function renderHud() {
    if (NO_HUD) return;
    var t0 = performance.now();
    hud.setTransform(dpr, 0, 0, dpr, 0, 0);
    hud.clearRect(0, 0, cssW, cssH);
    hud.globalAlpha = 1;
    rHudPause = null;
    rHudMenu = null;
    rPauseForge = null;
    if (state.mode === 'MENU') {
      drawMenu();
      perf.hudMs = performance.now() - t0;
      return;
    }
    if (state.mode === 'SHOP') {
      drawShop();
      perf.hudMs = performance.now() - t0;
      return;
    }
    if (state.mode === 'CHEAT') {
      drawCheat();
      perf.hudMs = performance.now() - t0;
      return;
    }
    if (state.mode === 'GAMEOVER') {
      drawGameOver();
      perf.hudMs = performance.now() - t0;
      return;
    }
    if (state.paused) {
      drawPause();
      perf.hudMs = performance.now() - t0;
      return;
    }
    // top-right buttons are reserved first so bars never run underneath them.
    var hbtnW = Math.max(54, Math.min(74, cssW * 0.14));
    var hbtnH = Math.max(28, Math.min(34, cssH * 0.044));
    var hbtnX = cssW - hbtnW - 10;
    var hbtnY = 10;

    // pill HP bar
    var hpad = 14, hbH = Math.max(10, Math.min(14, cssH * 0.017));
    var hbW = Math.max(150, hbtnX - hpad - 12);
    hud.fillStyle = 'rgba(0,0,0,0.55)';
    hudRR(hpad, hpad, hbW, hbH, hbH * 0.5); hud.fill();
    var hpf = clamp(player.hp / player.maxHp, 0, 1);
    var hpCrit = player.hp < player.maxHp * 0.28;
    var hpG = hud.createLinearGradient(hpad, 0, hpad + hbW, 0);
    if (hpCrit) { hpG.addColorStop(0, '#a03a00'); hpG.addColorStop(1, '#ffd050'); }
    else        { hpG.addColorStop(0, BT_BLOOD);  hpG.addColorStop(1, BT_CRIM_HI); }
    hud.fillStyle = hpG;
    hudRR(hpad, hpad, Math.max(0, hbW * hpf), hbH, hbH * 0.5); hud.fill();
    // HP text centred in bar
    hud.fillStyle = '#fff';
    hud.font = '700 ' + Math.max(8, Math.min(10, hbH * 0.75)) + 'px sans-serif';
    hud.textAlign = 'center'; hud.textBaseline = 'middle';
    hud.fillText(Math.ceil(player.hp) + ' / ' + Math.round(player.maxHp), hpad + hbW * 0.5, hpad + hbH * 0.5);
    // XP (blood) bar below
    var xbY = hpad + hbH + 4, xbH = Math.max(5, Math.min(8, cssH * 0.010));
    hud.fillStyle = 'rgba(0,0,0,0.5)';
    hudRR(hpad, xbY, hbW, xbH, xbH * 0.5); hud.fill();
    var xf = clamp(player.xp / player.xpNext, 0, 1);
    hud.fillStyle = BT_BLOOD;
    hudRR(hpad, xbY, Math.max(0, hbW * xf), xbH, xbH * 0.5); hud.fill();
    // level / timer / kills row
    var txtY = xbY + xbH + 14;
    hud.font = 'bold ' + Math.max(11, Math.min(14, cssH * 0.018)) + 'px sans-serif';
    hud.textBaseline = 'top';
    hud.fillStyle = BT_BONE; hud.textAlign = 'left';
    hud.fillText('LV ' + player.level + '  K' + state.kills, hpad, txtY);
    hud.fillStyle = '#fff'; hud.textAlign = 'center';
    hud.fillText(fmtTime(state.t), cssW * 0.5, txtY);
    hud.textBaseline = 'middle';

    // HUD buttons (top-right corner)
    rHudPause = drawHudButton(hbtnX, hbtnY, hbtnW, hbtnH, 'PAUSE');
    rHudMenu  = drawHudButton(hbtnX, hbtnY + hbtnH + 6, hbtnW, hbtnH, 'MENU');

    // blast meter ring (bottom-centre, above joystick dead-zone)
    var bmR = Math.max(18, Math.min(24, cssH * 0.032));
    var bmX = cssW * 0.5, bmY = cssH - bmR - 16;
    hud.lineWidth = Math.max(3, bmR * 0.22);
    hud.lineCap = 'round';
    hud.strokeStyle = 'rgba(255,255,255,0.10)';
    hud.beginPath(); hud.arc(bmX, bmY, bmR, 0, TWO_PI); hud.stroke();
    var meter = clamp((player.meter || 0) / 100, 0, 1);
    if (meter > 0.01) {
      hud.strokeStyle = player.unleash > 0 ? BT_CRIM_HI : BT_BLOOD;
      hud.beginPath(); hud.arc(bmX, bmY, bmR, -Math.PI * 0.5, -Math.PI * 0.5 + TWO_PI * meter); hud.stroke();
    }
    hud.lineCap = 'butt'; hud.lineWidth = 1;

    drawJoystick();

    if (state.bannerT > 0 && state.banner) {
      var ba = clamp(state.bannerT, 0, 1);
      hud.globalAlpha = ba;
      hud.shadowColor = BT_CRIM;
      hud.shadowBlur = 12;
      hud.font = '700 ' + Math.max(18, Math.min(26, cssH * 0.034)) + 'px sans-serif';
      hud.textAlign = 'center'; hud.textBaseline = 'middle';
      hud.fillStyle = BT_CRIM_HI;
      hud.fillText(state.banner, cssW * 0.5, Math.max(80, cssH * 0.18));
      hud.shadowBlur = 0;
      hud.textAlign = 'start';
      hud.globalAlpha = 1;
    }

    if (state.mode === 'LEVELUP') drawUpgradeDraft();

    if (DEBUG) {
      var x = 14, y = cssH - 268;
      hud.fillStyle = 'rgba(0,0,0,0.46)';
      hud.fillRect(x, y, 590, 254);
      hud.fillStyle = '#bfe7d2';
      hud.font = '11px ui-monospace, monospace';
      var lines = [
        'fps ' + perf.fps.toFixed(1) + ' frame ' + perf.frameMs.toFixed(2) + ' raf ' + perf.rafGap.toFixed(1) + ' worst ' + perf.worstMs.toFixed(1),
        'update ' + perf.updateAvg.toFixed(2) + ' / ' + perf.updateWorst.toFixed(1) + ' render ' + perf.renderAvg.toFixed(2) + ' / ' + perf.renderWorst.toFixed(1) + ' hud ' + perf.hudMs.toFixed(2),
        'inst ' + perf.instances + ' detail ' + perf.creatureDetails + ' E ' + eN + ' B ' + bN + ' M ' + mN + ' P ' + pN + ' D ' + dN,
        'sprites ' + (OLD_SPRITES ? (spriteReady ? 'old' : 'loading ' + spriteLoaded + '/' + spritePending) : 'off') + ' draws ' + perf.spriteDraws + ' anim ' + perf.spriteAnimated + ' static ' + perf.spriteStatic + ' culled ' + perf.spriteCulled,
        'old env ' + perf.envSprites + ' corpses ' + cN + '/' + perf.corpseSprites + ' tank ' + perf.tankSprites + ' tracks ' + tN,
        'colliders ' + (COLLIDERS ? 'on' : 'off') + ' ms ' + perf.colliderMs.toFixed(2) + ' pairs ' + perf.colliderPairs + ' contact ' + perf.colliderContacts + ' push ' + perf.colliderPush.toFixed(1),
        'veins ' + perf.veins + '/' + perf.veinInst + ' leeches ' + perf.leeches + '/' + perf.leechInst + ' tankfx ' + perf.tankFeelInst + ' ms ' + perf.leechMs.toFixed(2) + ' lvl ' + currentLeechLevel(),
        'gore ' + (GORE_FX ? 'on' : 'off') + ' pieces ' + perf.gorePieces + '/' + perf.goreInst + ' splats ' + perf.splats + '/' + perf.splatInst + ' ms ' + perf.goreMs.toFixed(2),
        'fx booms ' + perf.booms + '/' + perf.boomInst + ' bubbles ' + perf.bubbles + '/' + perf.bubbleInst + ' rocks ' + (BREAK_ENV ? 'on' : 'off') + ' vis ' + perf.envRocks + ' hit ' + perf.envContacts + ' broken ' + perf.envBroken,
        'econ dmg ' + player.dmg.toFixed(1) + ' fire ' + player.fireRate.toFixed(1) + ' barrels ' + player.barrels + ' thirst ' + player.thirst + ' lash ' + player.lashLvl,
        'target ' + desiredEnemies() + ' hp ' + Math.round(player.hp) + '/' + Math.round(player.maxHp),
        'LoAF ' + perf.loafs + ' worst ' + perf.loafWorst.toFixed(1) + ' ' + perf.scripts,
        'diag ' + (DIAG || 'normal') + '  9=min9  0=reset  P=pause'
      ];
      for (var i = 0; i < lines.length; i++) hud.fillText(lines[i], x + 10, y + 18 + i * 16);
      hud.strokeStyle = '#5b372e';
      hud.beginPath();
      for (var r = 0; r < ring.length; r++) {
        var idx = (ringI + r) % ring.length;
        var v = Math.min(70, ring[idx]);
        var px0 = x + 10 + r * 2.8;
        var py0 = y + 246 - v * 0.72;
        if (r === 0) hud.moveTo(px0, py0); else hud.lineTo(px0, py0);
      }
      hud.stroke();
    }
    perf.hudMs = performance.now() - t0;
  }

  function drawUpgradeDraft() {
    layoutUpgradeCards();
    hud.globalAlpha = 1;
    hud.fillStyle = 'rgba(8,5,4,0.74)';
    hud.fillRect(0, 0, cssW, cssH);
    hud.textAlign = 'center';
    hud.textBaseline = 'middle';
    // title with crim glow
    hud.shadowColor = BT_CRIM;
    hud.shadowBlur = 14;
    hud.fillStyle = BT_CRIM_HI;
    hud.font = '700 ' + Math.max(18, Math.min(26, cssH * 0.036)) + 'px sans-serif';
    hud.fillText('BLOOD MUTATION', cssW * 0.5, Math.max(52, upgradeRect[1] - 38));
    hud.shadowBlur = 0;
    hud.font = Math.max(10, Math.min(13, cssH * 0.018)) + 'px sans-serif';
    hud.fillStyle = BT_BONE_DIM;
    hud.fillText('Choose 1 / 2 / 3', cssW * 0.5, Math.max(70, upgradeRect[1] - 18));

    for (var i = 0; i < 3; i++) {
      var k = i * 4;
      var cx = upgradeRect[k], cy = upgradeRect[k + 1], cw = upgradeRect[k + 2], ch = upgradeRect[k + 3];
      var u = upgradePick[i];
      var hot = i === upgradeHover;
      // card background: gradient
      var cg = hud.createLinearGradient(cx, cy, cx, cy + ch);
      cg.addColorStop(0, hot ? '#2a211c' : '#1e1510');
      cg.addColorStop(1, hot ? '#17110e' : '#120c09');
      hud.fillStyle = cg;
      hudRR(cx, cy, cw, ch, 12);
      hud.fill();
      // crim stroke (stronger when hot)
      hud.strokeStyle = hot ? BT_CRIM_HI : BT_CRIM;
      hud.lineWidth = hot ? 2.2 : 1.5;
      hudRR(cx + 0.5, cy + 0.5, cw - 1, ch - 1, 11.5);
      hud.stroke();
      // icon medallion
      var mr = Math.max(16, Math.min(22, ch * 0.28));
      var mx = cx + mr + 14, my = cy + ch * 0.5;
      hud.fillStyle = '#0d0807';
      hud.beginPath(); hud.arc(mx, my, mr, 0, TWO_PI); hud.fill();
      var icon = hudImages['u' + u];
      if (icon && icon.complete && icon.naturalWidth) {
        hud.save();
        hud.beginPath(); hud.arc(mx, my, mr, 0, TWO_PI); hud.clip();
        hud.drawImage(icon, mx - mr, my - mr, mr * 2, mr * 2);
        hud.restore();
      } else {
        hud.fillStyle = BT_CRIM_HI;
        hud.shadowColor = BT_CRIM; hud.shadowBlur = 8;
        hud.beginPath(); hud.arc(mx, my, mr * 0.52, 0, TWO_PI); hud.fill();
        hud.shadowBlur = 0;
      }
      hud.strokeStyle = BT_CRIM; hud.lineWidth = 1.4;
      hud.beginPath(); hud.arc(mx, my, mr, 0, TWO_PI); hud.stroke();
      // key number badge
      hud.fillStyle = '#fff';
      hud.font = '700 ' + Math.max(8, Math.min(10, mr * 0.5)) + 'px sans-serif';
      hud.textAlign = 'center'; hud.textBaseline = 'top';
      hud.fillText(String(i + 1), mx, cy + 6);
      // card text
      hud.textAlign = 'left'; hud.textBaseline = 'middle';
      var tx = cx + mr * 2 + 22;
      hud.fillStyle = '#fff';
      hud.font = '700 ' + Math.max(13, Math.min(18, ch * 0.23)) + 'px sans-serif';
      hud.fillText(upgradeNames[u], tx, cy + ch * 0.36);
      hud.fillStyle = BT_BONE_DIM;
      hud.font = Math.max(10, Math.min(12, ch * 0.16)) + 'px sans-serif';
      hud.fillText(upgradeDesc[u], tx, cy + ch * 0.62);
      hud.fillStyle = BT_IRON;
      hud.font = Math.max(9, Math.min(11, ch * 0.14)) + 'px sans-serif';
      hud.fillText('LV ' + player.level + ' -> ' + (player.level + 1), tx, cy + ch - 14);
      hud.textAlign = 'center'; hud.textBaseline = 'middle';
    }
    hud.textAlign = 'start';
    hud.lineWidth = 1;
  }

  function resize() {
    cssW = Math.max(1, window.innerWidth || 1);
    cssH = Math.max(1, window.innerHeight || 1);
    updateCameraMetrics();
    dpr = Math.min(window.devicePixelRatio || 1, BASE_DPR);
    viewW = Math.max(1, Math.floor(cssW * dpr));
    viewH = Math.max(1, Math.floor(cssH * dpr));
    glCanvas.width = viewW;
    glCanvas.height = viewH;
    hudCanvas.width = viewW;
    hudCanvas.height = viewH;
  }

  window.addEventListener('resize', resize);

  function handleUiPointer(x, y) {
    if (state.mode === 'MENU') {
      if (inRect(x, y, rPlay)) startRun(0);
      else if (inRect(x, y, rForge)) state.mode = 'SHOP';
      else if (inRect(x, y, rCheat)) state.mode = 'CHEAT';
      else return false;
      return true;
    }
    if (state.mode === 'SHOP') {
      for (var wi = 0; wi < rWeapons.length; wi++) {
        if (inRect(x, y, rWeapons[wi])) {
          buyOrEquipWeapon(rWeapons[wi].id);
          return true;
        }
      }
      for (var si = 0; si < rShop.length; si++) {
        var row = rShop[si];
        if (inRect(x, y, { x: row.bx, y: row.by, w: row.bw, h: row.bh })) {
          buyTrack(row.id);
          return true;
        }
        if (inRect(x, y, row)) {
          selectedTrack = row.id;
          return true;
        }
      }
      if (inRect(x, y, rShopBack)) {
        state.mode = 'MENU';
        return true;
      }
      return true;
    }
    if (state.mode === 'CHEAT') {
      if (inRect(x, y, rCheatMoney)) cheatMoney();
      else if (inRect(x, y, rCheatMax)) cheatMaxAll();
      else if (inRect(x, y, rCheatMin9)) startRun(9);
      else if (inRect(x, y, rCheatReset)) cheatReset();
      else if (inRect(x, y, rCheatBack)) state.mode = 'MENU';
      return true;
    }
    if (state.mode === 'GAMEOVER') {
      if (inRect(x, y, rRetry)) startRun(0);
      else if (inRect(x, y, rForge)) state.mode = 'SHOP';
      else if (inRect(x, y, rMenu)) state.mode = 'MENU';
      return true;
    }
    if (state.paused) {
      if (inRect(x, y, rResume)) state.paused = false;
      else if (inRect(x, y, rPauseForge)) {
        bankRun();
        resetGame(false, 0);
        state.mode = 'SHOP';
      }
      else if (inRect(x, y, rQuit)) {
        bankRun();
        resetGame(false, 0);
      }
      return true;
    }
    if (state.mode === 'PLAYING') {
      if (inRect(x, y, rHudPause)) {
        state.paused = true;
        return true;
      }
      if (inRect(x, y, rHudMenu)) {
        bankRun();
        resetGame(false, 0);
        return true;
      }
    }
    return false;
  }

  window.addEventListener('keydown', function (e) {
    unlockAudio();
    var c = e.keyCode || e.which;
    if (c < 256) keys[c] = 1;
    if (e.key === '9') {
      if (state.mode === 'PLAYING') skipToMinute(9);
      else startRun(9);
    }
    else if (e.key === '0') resetGame(true, START_MIN);
    else if (e.key === 'r' || e.key === 'R') {
      if (state.mode === 'MENU' || state.mode === 'SHOP' || state.mode === 'CHEAT') resetGame(false, 0);
      else resetGame(true, START_MIN);
    }
    else if ((e.key === 'Enter' || e.key === ' ') && state.mode === 'MENU') startRun(0);
    else if ((e.key === 'f' || e.key === 'F') && state.mode === 'MENU') state.mode = 'SHOP';
    else if ((e.key === 'h' || e.key === 'H') && state.mode !== 'PLAYING') state.mode = state.mode === 'CHEAT' ? 'MENU' : 'CHEAT';
    else if ((e.key === 'm' || e.key === 'M') && state.mode !== 'MENU') {
      if (state.mode === 'PLAYING') bankRun();
      resetGame(false, 0);
    }
    else if (e.key === 'n' || e.key === 'N') toggleMute();
    else if ((e.key === 'c' || e.key === 'C') && (state.mode === 'CHEAT' || DEBUG)) cheatMoney();
    else if ((e.key === 'x' || e.key === 'X') && (state.mode === 'CHEAT' || DEBUG)) cheatMaxAll();
    else if (e.key === 'p' || e.key === 'P') {
      if (state.mode === 'PLAYING') state.paused = !state.paused;
    }
    else if (e.key === 'F2' || ((e.key === 'd' || e.key === 'D') && (e.ctrlKey || e.metaKey))) DEBUG = !DEBUG;
    else if (e.key === '1') chooseUpgrade(0);
    else if (e.key === '2') chooseUpgrade(1);
    else if (e.key === '3') chooseUpgrade(2);
  });
  window.addEventListener('keyup', function (e) {
    var c = e.keyCode || e.which;
    if (c < 256) keys[c] = 0;
  });

  function updateJoystick(e) {
    var dx = e.clientX - joyBaseX;
    var dy = e.clientY - joyBaseY;
    var d = Math.sqrt(dx * dx + dy * dy);
    var lim = joyRadius;
    if (d > lim && d > 0.001) {
      dx *= lim / d;
      dy *= lim / d;
      d = lim;
    }
    joyKnobX = joyBaseX + dx;
    joyKnobY = joyBaseY + dy;
    var dead = lim * 0.14;
    if (d < dead) {
      joyDX = 0;
      joyDY = 0;
    } else {
      joyDX = dx / lim;
      joyDY = dy / lim;
    }
  }

  function beginJoystick(e) {
    var edge = joyRadius + Math.max(8, joyRadius * 0.16);
    joyActive = true;
    joyId = e.pointerId;
    joyBaseX = clamp(e.clientX, edge, cssW - edge);
    joyBaseY = clamp(e.clientY, edge, cssH - edge);
    joyKnobX = joyBaseX;
    joyKnobY = joyBaseY;
    joyDX = 0;
    joyDY = 0;
    updateJoystick(e);
    try { glCanvas.setPointerCapture(joyId); } catch (err) {}
  }

  function endJoystick() {
    joyActive = false;
    joyId = -1;
    joyDX = 0;
    joyDY = 0;
  }

  function wantsJoystickPointer(e) {
    if (!useJoystick || state.mode !== 'PLAYING') return false;
    if (e.pointerType === 'touch' || e.pointerType === 'pen') return true;
    if ((e.pointerType || '') === '' && TOUCH_DEVICE) return true;
    return (TOUCH_DEVICE || cssW < 760 || qs.has('joystick') || qs.has('joy'))
      && e.clientX < cssW * 0.62
      && e.clientY > cssH * 0.34;
  }

  glCanvas.addEventListener('pointerdown', function (e) {
    unlockAudio();
    if (handleUiPointer(e.clientX, e.clientY)) {
      pointerDown = false;
      pointerId = -1;
      endJoystick();
      e.preventDefault();
      return;
    }
    if (state.mode === 'LEVELUP') {
      pointerDown = false;
      pointerId = -1;
      if (chooseUpgrade(cardAt(e.clientX, e.clientY))) e.preventDefault();
      return;
    }
    if (wantsJoystickPointer(e)) {
      pointerDown = false;
      pointerId = -1;
      beginJoystick(e);
      e.preventDefault();
      return;
    }
    pointerDown = true;
    pointerId = e.pointerId;
    pointerX = e.clientX;
    pointerY = e.clientY;
    glCanvas.setPointerCapture(pointerId);
  });
  glCanvas.addEventListener('pointermove', function (e) {
    if (joyActive && e.pointerId === joyId) {
      updateJoystick(e);
      e.preventDefault();
      return;
    }
    if (state.mode === 'LEVELUP') {
      upgradeHover = cardAt(e.clientX, e.clientY);
      return;
    }
    if (!pointerDown || e.pointerId !== pointerId) return;
    pointerX = e.clientX;
    pointerY = e.clientY;
  });
  glCanvas.addEventListener('pointerup', endPointer);
  glCanvas.addEventListener('pointercancel', endPointer);
  function endPointer(e) {
    if (joyActive && e.pointerId === joyId) {
      endJoystick();
      e.preventDefault();
      return;
    }
    if (e.pointerId !== pointerId) return;
    pointerDown = false;
    pointerId = -1;
  }

  window.__skipMin = skipToMinute;
  window.__startRun = startRun;
  window.__openMenu = function () { resetGame(false, 0); };
  window.__cheatMoney = cheatMoney;
  window.__cheatMaxAll = cheatMaxAll;
  window.__toggleMute = toggleMute;
  window.__triggerUnleash = triggerUnleash;
  window.__buyTrack = buyTrack;
  window.__equipWeapon = buyOrEquipWeapon;
  window.__chooseUpgrade = chooseUpgrade;
  window.__startLevelUp = startLevelUp;
  window.__addXp = gainXp;
  window.__perfStats = function () {
    var picks = state.mode === 'LEVELUP'
      ? [upgradeNames[upgradePick[0]], upgradeNames[upgradePick[1]], upgradeNames[upgradePick[2]]]
      : [];
    return {
      t: state.t, fps: perf.fps, frameMs: perf.frameMs, updateMs: perf.updateMs,
      renderMs: perf.renderMs, hudMs: perf.hudMs, worstMs: perf.worstMs,
      updateAvg: perf.updateAvg, renderAvg: perf.renderAvg,
      updateWorst: perf.updateWorst, renderWorst: perf.renderWorst,
      rafGap: perf.rafGap, loafs: perf.loafs, loafWorst: perf.loafWorst,
      enemies: eN, bullets: bN, motes: mN, particles: pN, decals: dN, instances: perf.instances,
      creatureDetails: perf.creatureDetails,
      oldSprites: OLD_SPRITES, spriteReady: spriteReady, spriteLoaded: spriteLoaded,
      spritePending: spritePending, spriteDraws: perf.spriteDraws,
      spriteAnimated: perf.spriteAnimated, spriteStatic: perf.spriteStatic,
      spriteCulled: perf.spriteCulled, oldEnv: OLD_ENV, oldTank: OLD_TANK,
      oldDeath: OLD_DEATH, envSprites: perf.envSprites, corpseSprites: perf.corpseSprites,
      corpses: cN, tankSprites: perf.tankSprites, tracks: tN,
      tankLayers: TANK_LAYERS,
      tankTiers: {
        armor: tankArmorTier, core: tankCoreTier, cannon: tankCannonTier,
        treads: tankTreadsTier, thirst: tankThirstTier, frenzy: tankFrenzyTier
      },
      colliders: COLLIDERS, colliderMs: perf.colliderMs,
      cameraZoom: cameraZoom, viewWorldW: viewWorldW, viewWorldH: viewWorldH,
      useJoystick: useJoystick, joystickActive: joyActive,
      colliderPairs: perf.colliderPairs, colliderContacts: perf.colliderContacts,
      colliderSkipped: perf.colliderSkipped, colliderPush: perf.colliderPush,
      veinsEnabled: VEIN_FX, leechesEnabled: LEECH_FX,
      veins: perf.veins, veinInst: perf.veinInst,
      leechLevel: currentLeechLevel(), leeches: perf.leeches,
      leechInst: perf.leechInst, leechMs: perf.leechMs, tankFeelInst: perf.tankFeelInst,
      goreEnabled: GORE_FX, gorePieces: perf.gorePieces, goreInst: perf.goreInst,
      splats: perf.splats, splatInst: perf.splatInst, goreMs: perf.goreMs,
      booms: perf.booms, boomInst: perf.boomInst,
      bubbles: perf.bubbles, bubbleInst: perf.bubbleInst,
      breakEnv: BREAK_ENV, envRocks: perf.envRocks,
      envContacts: perf.envContacts, envBroken: perf.envBroken,
      economy: {
        damage: player.dmg, fireRate: player.fireRate, speed: player.speed,
        crush: player.crush, crushDps: player.crushDps, pickR: player.pickR,
        barrels: player.barrels, thirst: player.thirst, rangedHeal: player.rangedHeal,
        lashLvl: player.lashLvl, regen: player.regen, frenzyMul: player.frenzyMul,
        meter: player.meter, unleash: player.unleash, rage: tankRageLevel()
      },
      meta: {
        armor: META.armor, core: META.core, cannon: META.cannon,
        treads: META.treads, thirst: META.thirst, frenzy: META.frenzy
      },
      bank: totalBank,
      bestTime: bestTime,
      weapon: equipWeapon,
      weaponMeta: {
        cannon: weaponMeta.cannon,
        flak: weaponMeta.flak,
        laser: weaponMeta.laser,
        missile: weaponMeta.missile
      },
      ownedWeapons: ownedWeapons,
      audio: {
        muted: audioMuted,
        context: audioCtx ? audioCtx.state : 'none',
        samples: Object.keys(audioBuffers).length
      },
      mode: state.mode, paused: state.paused, diag: DIAG, level: player.level, xp: player.xp,
      xpNext: player.xpNext, upgrades: picks
    };
  };
  window.__loafs = function () { return loafLog.slice(); };
  window.render_game_to_text = function () {
    return [
      'Bloodtread ECS rebuild',
      'mode=' + state.mode + (state.paused ? ' paused' : '') + ' time=' + fmtTime(state.t) + ' enemies=' + eN + ' bullets=' + bN + ' motes=' + mN + ' particles=' + pN,
      'bank=' + Math.floor(totalBank) + ' best=' + fmtTime(bestTime) + ' weapon=' + weaponName(equipWeapon) + ' owned=' + Object.keys(ownedWeapons).join(','),
      'audio=' + (audioMuted ? 'muted' : (audioCtx ? audioCtx.state : 'locked')) + ' samples=' + Object.keys(audioBuffers).length,
      'meta armor=' + META.armor + ' core=' + META.core + ' cannon=' + META.cannon + ' treads=' + META.treads + ' thirst=' + META.thirst + ' frenzy=' + META.frenzy + ' weaponTiers=' + weaponMeta.cannon + '/' + weaponMeta.flak + '/' + weaponMeta.laser + '/' + weaponMeta.missile,
      state.mode === 'LEVELUP' ? 'upgrades=1:' + upgradeNames[upgradePick[0]] + ' 2:' + upgradeNames[upgradePick[1]] + ' 3:' + upgradeNames[upgradePick[2]] : 'level=' + player.level + ' xp=' + Math.floor(player.xp) + '/' + player.xpNext,
      'fps=' + perf.fps.toFixed(1) + ' frame=' + perf.frameMs.toFixed(2) + ' update=' + perf.updateMs.toFixed(2) + ' render=' + perf.renderMs.toFixed(2) + ' detail=' + perf.creatureDetails,
      'camera zoom=' + cameraZoom.toFixed(2) + ' world=' + Math.round(viewWorldW) + 'x' + Math.round(viewWorldH) + ' joystick=' + (useJoystick ? (joyActive ? 'active' : 'ready') : 'off'),
      'sprites=' + (OLD_SPRITES ? (spriteReady ? 'old' : 'loading') : 'off') + ' draws=' + perf.spriteDraws + ' anim=' + perf.spriteAnimated + ' static=' + perf.spriteStatic,
      'oldenv=' + perf.envSprites + ' corpses=' + cN + '/' + perf.corpseSprites + ' tank=' + perf.tankSprites,
      'tanktiers a=' + tankArmorTier + ' c=' + tankCannonTier + ' tr=' + tankTreadsTier + ' core=' + tankCoreTier + ' th=' + tankThirstTier + ' fr=' + tankFrenzyTier,
      'economy dmg=' + player.dmg.toFixed(1) + ' fire=' + player.fireRate.toFixed(1) + ' barrels=' + player.barrels + ' thirst=' + player.thirst + ' lash=' + player.lashLvl + ' pick=' + Math.round(player.pickR),
      'bloodletting meter=' + Math.round(player.meter) + ' unleash=' + player.unleash.toFixed(2) + ' flash=' + player.unleashFlash.toFixed(2) + ' rage=' + tankRageLevel().toFixed(2),
      'veins=' + perf.veins + '/' + perf.veinInst + ' leeches=' + perf.leeches + '/' + perf.leechInst + ' tankfx=' + perf.tankFeelInst + ' lvl=' + currentLeechLevel() + ' ms=' + perf.leechMs.toFixed(2),
      'gore=' + (GORE_FX ? 'on' : 'off') + ' pieces=' + perf.gorePieces + '/' + perf.goreInst + ' splats=' + perf.splats + '/' + perf.splatInst + ' ms=' + perf.goreMs.toFixed(2),
      'fx booms=' + perf.booms + '/' + perf.boomInst + ' bubbles=' + perf.bubbles + '/' + perf.bubbleInst + ' rocks=' + (BREAK_ENV ? 'on' : 'off') + ' visible=' + perf.envRocks + ' contact=' + perf.envContacts + ' broken=' + perf.envBroken,
      'colliders=' + (COLLIDERS ? 'on' : 'off') + ' ms=' + perf.colliderMs.toFixed(2) + ' pairs=' + perf.colliderPairs + ' contact=' + perf.colliderContacts,
      'loaf=' + perf.loafs + ' worst=' + perf.loafWorst.toFixed(1)
    ].join('\n');
  };
  window.advanceTime = function (ms) {
    var steps = Math.max(1, Math.round(ms / 1000 / STEP));
    for (var i = 0; i < steps; i++) update(STEP);
    if (!LOGIC_ONLY) renderWorld();
    renderHud();
    return window.__perfStats();
  };

  var last = performance.now();
  var acc = 0;

  function frame(now) {
    var gap = now - last;
    last = now;
    if (gap > 250) gap = 16.7;
    perf.rafGap = gap;
    perf.frameMs = gap;
    perf.fps = perf.fps * 0.92 + (1000 / Math.max(1, gap)) * 0.08;
    if (gap > perf.worstMs) perf.worstMs = gap; else perf.worstMs += (gap - perf.worstMs) * 0.01;
    if (gap > 34) perf.longFrames++;
    ring[ringI++ % ring.length] = gap;

    var u0 = performance.now();
    if (!RENDER_ONLY) {
      acc += gap / 1000;
      var maxAcc = STEP * MAX_STEPS;
      if (acc > maxAcc) acc = maxAcc;
      var steps = 0;
      while (acc >= STEP && steps < MAX_STEPS) {
        update(STEP);
        acc -= STEP;
        steps++;
      }
    }
    perf.updateMs = performance.now() - u0;
    perf.updateAvg = perf.updateAvg * 0.94 + perf.updateMs * 0.06;
    if (perf.updateMs > perf.updateWorst) perf.updateWorst = perf.updateMs; else perf.updateWorst += (perf.updateMs - perf.updateWorst) * 0.004;

    var r0 = performance.now();
    if (!LOGIC_ONLY) renderWorld();
    perf.renderMs = performance.now() - r0;
    perf.renderAvg = perf.renderAvg * 0.94 + perf.renderMs * 0.06;
    if (perf.renderMs > perf.renderWorst) perf.renderWorst = perf.renderMs; else perf.renderWorst += (perf.renderMs - perf.renderWorst) * 0.004;
    renderHud();
    perf.frames++;

    requestAnimationFrame(frame);
  }

  resize();
  loadHudImages();
  loadMeta();
  resetGame(AUTO_START, START_MIN);
  requestAnimationFrame(frame);
})();
