import * as THREE from 'three';
import { GLTFLoader } from './vendor/GLTFLoader.js';

const shell = document.querySelector('#game-shell');
const canvas = document.querySelector('#game');
const liveStatus = document.querySelector('#game-status');
const ui = {
  sample: document.querySelector('#sample-label'),
  collection: document.querySelector('#collection-label'),
  coins: document.querySelector('#coins-label'),
  strikes: document.querySelector('#strike-lamps'),
  steps: [...document.querySelectorAll('.process-step')],
  phase: document.querySelector('#phase-label'),
  instruction: document.querySelector('#instruction-label'),
  progressDock: document.querySelector('#progress-dock'),
  progressLabel: document.querySelector('#progress-label'),
  progressValue: document.querySelector('#progress-value'),
  progressFill: document.querySelector('#progress-fill'),
  bins: document.querySelector('#bin-shelf'),
  binButtons: [...document.querySelectorAll('.sort-bin')],
  callout: document.querySelector('#find-callout'),
  findName: document.querySelector('#find-name'),
  findCategory: document.querySelector('#find-category'),
  feedback: document.querySelector('#feedback'),
  help: document.querySelector('#help-button'),
  collectionButton: document.querySelector('#collection-button'),
  mute: document.querySelector('#mute-button'),
  boot: document.querySelector('#boot-panel'),
  bootCopy: document.querySelector('#boot-copy'),
  dialog: document.querySelector('#game-dialog'),
  dialogTitle: document.querySelector('#dialog-title'),
  dialogSubtitle: document.querySelector('#dialog-subtitle'),
  dialogBody: document.querySelector('#dialog-body'),
  dialogActions: document.querySelector('#dialog-actions'),
  dialogClose: document.querySelector('#dialog-close')
};

const STORAGE_KEY = 'shit-sifter-save-v1';
const SAVE_VERSION = 1;
const SHIFT_SAMPLES = 4;
const SAMPLE_COUNTS = [3, 6, 7, 8];
const UPGRADE_COSTS = [8, 18, 36];
const MAX_STRIKES = 3;
const FIRST_DISCOVERY_BONUS = 2;
const REDUCED_MOTION = matchMedia('(prefers-reduced-motion: reduce)').matches;

const CATEGORY = {
  fruit: { label: 'FRUIT', color: 0xc74739 },
  vegetable: { label: 'VEGETABLE', color: 0x3f8f58 },
  odd: { label: 'ODD OBJECT', color: 0x7358a2 }
};

const ITEMS = [
  { id: 'apple', label: 'APPLE', category: 'fruit', value: 1, rarity: 'common', color: 0xc43d32, model: './assets/realistic/food_apple_01.glb', displaySize: 1.05 },
  { id: 'banana', label: 'BANANA', category: 'fruit', value: 1, rarity: 'common', color: 0xd8ad28, model: './assets/realistic/bananas.glb', displaySize: 1.25 },
  { id: 'kiwi', label: 'KIWI', category: 'fruit', value: 1, rarity: 'common', color: 0x7c7338, model: './assets/realistic/food_kiwi_01.glb', displaySize: 1.0 },
  { id: 'lime', label: 'LIME', category: 'fruit', value: 1, rarity: 'common', color: 0x5e9b42, model: './assets/realistic/food_lime_01.glb', displaySize: 1.0 },
  { id: 'carrot', label: 'CARROT', category: 'vegetable', value: 1, rarity: 'common', color: 0xd86c21 },
  { id: 'sweet_potato', label: 'SWEET POTATO', category: 'vegetable', value: 1, rarity: 'common', color: 0x9a4f2f, model: './assets/realistic/sweet_potato.glb', displaySize: 1.15 },
  { id: 'onion', label: 'YELLOW ONION', category: 'vegetable', value: 1, rarity: 'common', color: 0xc9a16a, model: './assets/realistic/yellow_onion.glb', displaySize: 1.05 },
  { id: 'beet', label: 'BEETROOT', category: 'vegetable', value: 1, rarity: 'common', color: 0x813b4e },
  { id: 'coin', label: 'OLD COIN', category: 'odd', value: 3, rarity: 'uncommon', color: 0xc49b37 },
  { id: 'key', label: 'BRASS KEY', category: 'odd', value: 3, rarity: 'uncommon', color: 0xb49346 },
  { id: 'ring', label: 'GOLD RING', category: 'odd', value: 5, rarity: 'rare', color: 0xe0b845 },
  { id: 'duck', label: 'RUBBER DUCK', category: 'odd', value: 5, rarity: 'rare', color: 0xe3b82d, model: './assets/realistic/rubber_duck_toy.glb', displaySize: 1.08 }
];
const ITEM_BY_ID = Object.fromEntries(ITEMS.map((item) => [item.id, item]));

const SAMPLE_NAMES = [
  'CAFETERIA CLASSIC',
  'MOVIE NIGHT MYSTERY',
  'GARDEN FEAST',
  'MYSTERY MUNCHER'
];

const PHASES = [
  { id: 'BREAK', rail: 'BREAK', label: 'Procedure 1 · Break', instruction: 'Strike or drag the masher through the specimen.', progress: 'Integrity broken' },
  { id: 'RINSE', rail: 'RINSE', label: 'Procedure 2 · Rinse', instruction: 'Hold and move the pressure nozzle across every clump.', progress: 'Surface washed' },
  { id: 'FILTER', rail: 'FILTER', label: 'Procedure 3 · Sieve', instruction: 'Drag left and right to shake the slurry through the mesh.', progress: 'Slurry removed' },
  { id: 'REVEAL', rail: 'REVEAL', label: 'Procedure 4 · Reveal', instruction: 'Tap each mud-coated find to identify it.', progress: 'Finds identified' },
  { id: 'FILE', rail: 'FILE', label: 'Procedure 5 · File', instruction: 'Drag each clean find into the correct recovery bin.', progress: 'Finds filed' }
];

const UPGRADE_DEFS = {
  masher: { title: 'HEAVY MASHER', subtitle: 'Break force +22% per level' },
  jet: { title: 'PRESSURE JET', subtitle: 'Rinse rate +35% per level' },
  mesh: { title: 'FINE MESH', subtitle: '+1 recovered find per sample' },
  scanner: { title: 'LABEL SCANNER', subtitle: '+1 pre-identified find' }
};

function defaultSave() {
  return {
    version: SAVE_VERSION,
    coins: 0,
    collection: {},
    upgrades: { masher: 0, jet: 0, mesh: 0, scanner: 0 },
    bestAccuracy: 0,
    completedShifts: 0,
    shift: 1,
    sampleIndex: 0,
    shiftCoins: 0,
    shiftAccuracySum: 0,
    shiftSamplesPassed: 0,
    pendingShiftComplete: false,
    tutorialDone: false,
    muted: false
  };
}

function loadSave() {
  const fallback = defaultSave();
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!parsed || parsed.version !== SAVE_VERSION) return fallback;
    const collection = { ...(parsed.collection || {}) };
    if (collection.pea && !collection.beet) collection.beet = true;
    delete collection.pea;
    return {
      ...fallback,
      ...parsed,
      collection,
      upgrades: { ...fallback.upgrades, ...(parsed.upgrades || {}) }
    };
  } catch {
    return fallback;
  }
}

let save = loadSave();

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(save));
  } catch {
    // The game remains playable when storage is unavailable.
  }
}

const state = {
  gs: 'BREAK',
  modal: null,
  shift: Math.max(1, save.shift || 1),
  sampleIndex: clamp(Number(save.sampleIndex) || 0, 0, SHIFT_SAMPLES - 1),
  sampleName: SAMPLE_NAMES[0],
  currentItemIds: [],
  tokens: [],
  breakProgress: 0,
  rinseProgress: 0,
  filterProgress: 0,
  strikes: 0,
  attempts: 0,
  correctAttempts: 0,
  roundCoins: 0,
  bankedThisSample: 0,
  sortedCount: 0,
  elapsed: 0,
  totalElapsed: 0,
  idleTime: 0,
  feedback: '',
  feedbackTone: 'neutral',
  feedbackTimer: 0,
  newDiscoveries: [],
  pendingCollection: new Set(),
  upgradeOffers: [],
  upgradeNotice: '',
  upgradeNoticeTone: 'success',
  retryCount: 0,
  shiftCoins: Math.max(0, Number(save.shiftCoins) || 0),
  shiftAccuracySum: Math.max(0, Number(save.shiftAccuracySum) || 0),
  shiftSamplesPassed: clamp(Number(save.shiftSamplesPassed) || 0, 0, SHIFT_SAMPLES),
  paused: false,
  lastAnnounced: '',
  trayShake: 0,
  filterDirection: 1,
  phaseChangedAt: 0,
  webglReady: false
};

const pointer = {
  cssX: 0,
  cssY: 0,
  down: false,
  id: null,
  mode: '',
  lastX: 0,
  lastY: 0,
  moved: 0,
  dragTokenId: null,
  world: new THREE.Vector3(),
  local: new THREE.Vector3()
};

const view = {
  width: 1,
  height: 1,
  dpr: 1,
  portrait: false,
  stage: { x: 8, y: 156, w: 100, h: 100 },
  bins: {}
};

let rngState = 1;
function seedRng(seed) { rngState = (seed >>> 0) || 1; }
function seededRandom() {
  rngState += 0x6d2b79f5;
  let value = rngState;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function lerp(a, b, amount) { return a + (b - a) * amount; }
function shuffle(values) {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const other = Math.floor(seededRandom() * (index + 1));
    [values[index], values[other]] = [values[other], values[index]];
  }
  return values;
}
function itemCount() { return ITEMS.reduce((count, item) => count + (save.collection[item.id] ? 1 : 0), 0); }
function currentAccuracy() { return state.attempts ? state.correctAttempts / state.attempts : 1; }

function announce(message) {
  if (!message || message === state.lastAnnounced) return;
  state.lastAnnounced = message;
  liveStatus.textContent = message;
}

function showFeedback(message, tone = 'neutral', duration = 1.2) {
  state.feedback = message;
  state.feedbackTone = tone;
  state.feedbackTimer = duration;
  ui.feedback.textContent = message;
  ui.feedback.style.color = tone === 'error' ? 'var(--color-error)' : tone === 'success' ? 'var(--color-accent)' : 'var(--color-on-dark)';
  ui.feedback.classList.add('is-visible');
}

// --- Audio -----------------------------------------------------------------

const audio = { context: null, master: null, muted: Boolean(save.muted) };

function ensureAudio() {
  if (audio.context) {
    if (audio.context.state === 'suspended') audio.context.resume().catch(() => {});
    return;
  }
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;
  try {
    audio.context = new AudioContextClass();
    audio.master = audio.context.createGain();
    audio.master.gain.value = audio.muted ? 0 : 0.14;
    audio.master.connect(audio.context.destination);
  } catch {
    audio.context = null;
    audio.master = null;
  }
}

function synth(frequency, duration, type = 'sine', gainValue = 0.08, slide = 1, delay = 0) {
  if (!audio.context || !audio.master || audio.muted) return;
  const now = audio.context.currentTime + delay;
  const oscillator = audio.context.createOscillator();
  const gain = audio.context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, now);
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(35, frequency * slide), now + duration);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(gainValue, now + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  oscillator.connect(gain);
  gain.connect(audio.master);
  oscillator.start(now);
  oscillator.stop(now + duration + 0.03);
}

function tone(kind) {
  if (!audio.context || audio.muted) return;
  if (kind === 'crack') {
    synth(145, 0.11, 'square', 0.07, 0.46);
    synth(74, 0.14, 'triangle', 0.07, 0.72, 0.025);
  } else if (kind === 'rinse') {
    synth(475, 0.13, 'sine', 0.05, 1.35);
  } else if (kind === 'sieve') {
    synth(118, 0.08, 'triangle', 0.045, 0.82);
  } else if (kind === 'reveal') {
    synth(510, 0.11, 'triangle', 0.08, 1.28);
    synth(790, 0.15, 'sine', 0.055, 1.06, 0.045);
  } else if (kind === 'correct') {
    synth(430, 0.1, 'triangle', 0.08, 1.18);
    synth(680, 0.16, 'sine', 0.065, 1.06, 0.055);
  } else if (kind === 'wrong') {
    synth(168, 0.22, 'sawtooth', 0.075, 0.55);
  } else if (kind === 'complete') {
    [430, 560, 720].forEach((frequency, index) => synth(frequency, 0.2, 'triangle', 0.065, 1.08, index * 0.075));
  } else if (kind === 'upgrade') {
    synth(360, 0.12, 'square', 0.05, 1.4);
    synth(660, 0.2, 'triangle', 0.07, 1.1, 0.06);
  } else if (kind === 'fail') {
    synth(205, 0.38, 'sawtooth', 0.075, 0.34);
  }
}

function toggleMute() {
  audio.muted = !audio.muted;
  save.muted = audio.muted;
  if (audio.master) audio.master.gain.value = audio.muted ? 0 : 0.14;
  persist();
  updateUI();
}

// --- Three.js scene ---------------------------------------------------------

let renderer;
let scene;
let camera;
let labRoot;
let sieveRig;
let specimenIntact;
let specimenClumps;
let findsRoot;
let masher;
let nozzle;
let waterJet;
let slurry;
let bins3DRoot;
let clockTime = 0;
const binMeshes = {};
const raycaster = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.34);
const gltfLoader = new GLTFLoader();
const modelTemplates = new Map();
const modelPromises = new Map();

const MAT = {};

function material(color, options = {}) {
  return new THREE.MeshStandardMaterial({ color, ...options });
}

function mesh(geometry, meshMaterial, { cast = true, receive = false } = {}) {
  const object = new THREE.Mesh(geometry, meshMaterial);
  object.castShadow = cast;
  object.receiveShadow = receive;
  return object;
}

function createMaterials() {
  MAT.bench = material(0x173f35, { roughness: 0.72, metalness: 0.08 });
  MAT.benchEdge = material(0x0d241f, { roughness: 0.62, metalness: 0.18 });
  MAT.steel = material(0xa4b2ae, { roughness: 0.28, metalness: 0.82 });
  MAT.steelDark = material(0x65746f, { roughness: 0.37, metalness: 0.75 });
  MAT.rubber = material(0x1d2523, { roughness: 0.76, metalness: 0.03 });
  MAT.hose = material(0x31554b, { roughness: 0.58, metalness: 0.02 });
  MAT.specimen = new THREE.MeshPhysicalMaterial({
    color: 0x55301f,
    roughness: 0.64,
    metalness: 0,
    clearcoat: 0.045,
    clearcoatRoughness: 0.62,
    ior: 1.34,
    specularIntensity: 0.42,
    sheen: 0.035,
    sheenColor: new THREE.Color(0x7a4329)
  });
  MAT.specimenDark = new THREE.MeshPhysicalMaterial({
    color: 0x3e2117,
    roughness: 0.72,
    clearcoat: 0.025,
    clearcoatRoughness: 0.72
  });
  MAT.slurry = new THREE.MeshPhysicalMaterial({
    color: 0x4a291b,
    transparent: true,
    opacity: 0.72,
    roughness: 0.4,
    clearcoat: 0.18,
    clearcoatRoughness: 0.38,
    depthWrite: false
  });
  MAT.mudShell = new THREE.MeshPhysicalMaterial({
    color: 0x52301e,
    transparent: true,
    opacity: 0.96,
    roughness: 0.7,
    clearcoat: 0.04,
    clearcoatRoughness: 0.65,
    depthWrite: true
  });
  MAT.accent = material(0xe3b637, { roughness: 0.42, metalness: 0.08 });
}

function createBox(width, height, depth, meshMaterial, x, y, z, options = {}) {
  const object = mesh(new THREE.BoxGeometry(width, height, depth), meshMaterial, options);
  object.position.set(x, y, z);
  return object;
}

function buildLab() {
  labRoot = new THREE.Group();
  labRoot.name = 'LabRoot';
  scene.add(labRoot);

  const bench = createBox(9.2, 0.45, 6.3, MAT.bench, 0, -0.37, 0, { cast: false, receive: true });
  labRoot.add(bench);
  labRoot.add(createBox(9.35, 0.24, 6.45, MAT.benchEdge, 0, -0.63, 0, { cast: false, receive: true }));

  const backsplash = createBox(9.2, 4.2, 0.18, material(0xd1d8d2, { roughness: 0.86 }), 0, 1.6, -3.05, { cast: false, receive: true });
  labRoot.add(backsplash);
  const tileGrid = new THREE.GridHelper(9, 18, 0x879792, 0xaab4af);
  tileGrid.rotation.x = Math.PI / 2;
  tileGrid.position.set(0, 1.58, -2.94);
  tileGrid.material.transparent = true;
  tileGrid.material.opacity = 0.33;
  labRoot.add(tileGrid);

  sieveRig = new THREE.Group();
  sieveRig.name = 'SieveRig';
  labRoot.add(sieveRig);

  const trayFloor = createBox(7.25, 0.12, 3.55, MAT.steelDark, 0, 0.02, 0, { cast: false, receive: true });
  sieveRig.add(trayFloor);
  sieveRig.add(createBox(7.55, 0.38, 0.18, MAT.steel, 0, 0.18, -1.86));
  sieveRig.add(createBox(7.55, 0.38, 0.18, MAT.steel, 0, 0.18, 1.86));
  sieveRig.add(createBox(0.18, 0.38, 3.55, MAT.steel, -3.69, 0.18, 0));
  sieveRig.add(createBox(0.18, 0.38, 3.55, MAT.steel, 3.69, 0.18, 0));
  sieveRig.add(createBox(1.05, 0.16, 0.42, MAT.rubber, -4.18, 0.15, 0));
  sieveRig.add(createBox(1.05, 0.16, 0.42, MAT.rubber, 4.18, 0.15, 0));

  const barGeometry = new THREE.BoxGeometry(0.025, 0.025, 3.4);
  const crossGeometry = new THREE.BoxGeometry(7.1, 0.025, 0.025);
  const lengthBars = new THREE.InstancedMesh(barGeometry, MAT.steel, 27);
  const crossBars = new THREE.InstancedMesh(crossGeometry, MAT.steel, 13);
  const dummy = new THREE.Object3D();
  for (let index = 0; index < 27; index += 1) {
    dummy.position.set(-3.4 + index * (6.8 / 26), 0.095, 0);
    dummy.updateMatrix();
    lengthBars.setMatrixAt(index, dummy.matrix);
  }
  for (let index = 0; index < 13; index += 1) {
    dummy.position.set(0, 0.1, -1.55 + index * (3.1 / 12));
    dummy.updateMatrix();
    crossBars.setMatrixAt(index, dummy.matrix);
  }
  lengthBars.receiveShadow = true;
  crossBars.receiveShadow = true;
  sieveRig.add(lengthBars, crossBars);

  slurry = mesh(new THREE.PlaneGeometry(6.8, 3.05, 28, 12), MAT.slurry, { cast: false, receive: true });
  slurry.rotation.x = -Math.PI / 2;
  slurry.position.y = 0.15;
  sieveRig.add(slurry);

  const drain = mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.05, 32), MAT.steelDark, { cast: false, receive: true });
  drain.position.set(2.9, 0.19, 1.18);
  sieveRig.add(drain);
  const drainHole = mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.055, 32), material(0x14211e, { roughness: 0.8 }), { cast: false });
  drainHole.position.set(2.9, 0.225, 1.18);
  sieveRig.add(drainHole);

  specimenIntact = new THREE.Group();
  specimenIntact.name = 'SpecimenIntact';
  specimenIntact.position.y = 0.18;
  sieveRig.add(specimenIntact);
  specimenClumps = new THREE.Group();
  specimenClumps.name = 'SpecimenClumps';
  specimenClumps.position.y = 0.18;
  sieveRig.add(specimenClumps);
  buildFallbackSpecimen(specimenIntact, false);
  buildFallbackSpecimen(specimenClumps, true);

  findsRoot = new THREE.Group();
  findsRoot.name = 'FindsRoot';
  sieveRig.add(findsRoot);

  masher = buildMasher();
  nozzle = buildNozzle();
  labRoot.add(masher, nozzle);

  bins3DRoot = new THREE.Group();
  bins3DRoot.name = 'SortBins3D';
  scene.add(bins3DRoot);
  Object.keys(CATEGORY).forEach((category) => {
    const group = buildBin3D(CATEGORY[category].color);
    group.name = `${category}Bin3D`;
    group.visible = false;
    bins3DRoot.add(group);
    binMeshes[category] = group;
  });
}

function buildFallbackSpecimen(parent, clumps) {
  if (clumps) {
    const specs = [
      [-1.8, 0.36, -0.2, 0.72, 0.47, 0.5],
      [-0.85, 0.32, 0.3, 0.5, 0.43, 0.42],
      [0.1, 0.4, -0.1, 0.68, 0.51, 0.57],
      [1.1, 0.31, 0.33, 0.48, 0.38, 0.42],
      [1.75, 0.25, -0.26, 0.35, 0.31, 0.32],
      [-1.25, 0.18, 0.58, 0.28, 0.22, 0.24],
      [0.78, 0.16, -0.62, 0.23, 0.19, 0.2]
    ];
    specs.forEach(([x, y, z, sx, sy, sz], index) => {
      const clump = mesh(new THREE.IcosahedronGeometry(0.62, 3), index % 2 ? MAT.specimen : MAT.specimenDark);
      clump.scale.set(sx, sy, sz);
      clump.position.set(x, y, z);
      clump.rotation.set(index * 0.23, index * 0.43, index * 0.17);
      parent.add(clump);
    });
    return;
  }

  const curveA = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-2.25, 0.38, 0.05),
    new THREE.Vector3(-1.05, 0.58, -0.22),
    new THREE.Vector3(0.15, 0.44, 0.18),
    new THREE.Vector3(1.28, 0.63, -0.08),
    new THREE.Vector3(2.2, 0.35, 0.22)
  ]);
  const curveB = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-1.55, 0.35, 0.46),
    new THREE.Vector3(-0.45, 0.74, 0.1),
    new THREE.Vector3(0.66, 0.52, 0.5),
    new THREE.Vector3(1.5, 0.34, 0.12)
  ]);
  const tubeA = mesh(new THREE.TubeGeometry(curveA, 72, 0.48, 18, false), MAT.specimen);
  const tubeB = mesh(new THREE.TubeGeometry(curveB, 58, 0.41, 18, false), MAT.specimenDark);
  parent.add(tubeA, tubeB);
  for (let index = 0; index < 7; index += 1) {
    const fleck = mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.11, 7), material(0x8c5b2e, { roughness: 0.85 }));
    fleck.position.set(-1.7 + index * 0.56, 0.83 + (index % 2) * 0.08, (index % 3 - 1) * 0.24);
    fleck.rotation.set(Math.PI * 0.44, index * 0.8, index * 0.41);
    parent.add(fleck);
  }
}

function buildMasher() {
  const group = new THREE.Group();
  group.name = 'MasherRoot';
  const head = mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.14, 36), MAT.steelDark);
  head.position.y = 0.12;
  group.add(head);
  const holes = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.045, 0.045, 0.03, 12), MAT.rubber, 9);
  const dummy = new THREE.Object3D();
  let holeIndex = 0;
  for (let z = -1; z <= 1; z += 1) {
    for (let x = -1; x <= 1; x += 1) {
      dummy.position.set(x * 0.19, 0.198, z * 0.19);
      dummy.updateMatrix();
      holes.setMatrixAt(holeIndex++, dummy.matrix);
    }
  }
  group.add(holes);
  const shaft = mesh(new THREE.CylinderGeometry(0.09, 0.12, 1.55, 24), MAT.steel);
  shaft.position.y = 0.91;
  group.add(shaft);
  const grip = mesh(new THREE.CylinderGeometry(0.17, 0.17, 1.0, 24), MAT.rubber);
  grip.position.y = 2.0;
  group.add(grip);
  group.position.set(0.2, 1.15, 0.2);
  return group;
}

function buildNozzle() {
  const group = new THREE.Group();
  group.name = 'NozzleRoot';
  const body = mesh(new THREE.CylinderGeometry(0.13, 0.19, 1.15, 24), MAT.steelDark);
  body.rotation.z = Math.PI / 2;
  body.position.set(0.45, 0.6, 0);
  group.add(body);
  const nose = mesh(new THREE.ConeGeometry(0.18, 0.48, 24), MAT.steel);
  nose.rotation.z = -Math.PI / 2;
  nose.position.set(-0.32, 0.6, 0);
  group.add(nose);
  waterJet = mesh(
    new THREE.ConeGeometry(0.2, 0.82, 24, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xa8e9f1, transparent: true, opacity: 0.24, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }),
    { cast: false, receive: false }
  );
  waterJet.rotation.z = -Math.PI / 2;
  waterJet.position.set(-0.78, 0.6, 0);
  waterJet.visible = false;
  group.add(waterJet);
  const grip = mesh(new THREE.BoxGeometry(0.22, 0.72, 0.27), MAT.rubber);
  grip.position.set(0.62, 0.17, 0);
  grip.rotation.z = -0.24;
  group.add(grip);
  const hoseCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(1.0, 0.62, 0),
    new THREE.Vector3(1.5, 0.5, 0.3),
    new THREE.Vector3(1.8, -0.25, 0.65)
  ]);
  group.add(mesh(new THREE.TubeGeometry(hoseCurve, 24, 0.09, 12, false), MAT.hose));
  group.position.set(0, 1.05, 0);
  return group;
}

function buildBin3D(color) {
  const group = new THREE.Group();
  const binMaterial = material(color, { roughness: 0.52, metalness: 0.08 });
  group.add(createBox(1.7, 0.12, 1.05, binMaterial, 0, 0.06, 0, { cast: true, receive: true }));
  group.add(createBox(1.7, 0.55, 0.1, binMaterial, 0, 0.31, -0.53));
  group.add(createBox(0.1, 0.55, 1.05, binMaterial, -0.85, 0.31, 0));
  group.add(createBox(0.1, 0.55, 1.05, binMaterial, 0.85, 0.31, 0));
  group.rotation.x = -0.06;
  return group;
}

class ParticleField {
  constructor(max, color, size, gravity) {
    this.max = max;
    this.gravity = gravity;
    this.cursor = 0;
    this.positions = new Float32Array(max * 3);
    this.velocities = Array.from({ length: max }, () => new THREE.Vector3());
    this.life = new Float32Array(max);
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.material = new THREE.PointsMaterial({ color, size, transparent: true, opacity: 0.9, depthWrite: false, sizeAttenuation: true });
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    for (let index = 0; index < max; index += 1) this.setPosition(index, 0, -50, 0);
    scene.add(this.points);
  }

  setPosition(index, x, y, z) {
    this.positions[index * 3] = x;
    this.positions[index * 3 + 1] = y;
    this.positions[index * 3 + 2] = z;
  }

  emit(origin, count, speed = 1, life = 0.6, spread = 0.65, downward = false) {
    for (let emitted = 0; emitted < count; emitted += 1) {
      const index = this.cursor++ % this.max;
      this.setPosition(index, origin.x, origin.y, origin.z);
      this.velocities[index].set(
        (Math.random() - 0.5) * spread * speed,
        (downward ? -0.45 : 0.3 + Math.random() * 0.8) * speed,
        (Math.random() - 0.5) * spread * speed
      );
      this.life[index] = life * (0.7 + Math.random() * 0.6);
    }
    this.geometry.attributes.position.needsUpdate = true;
  }

  update(dt) {
    for (let index = 0; index < this.max; index += 1) {
      if (this.life[index] <= 0) continue;
      this.life[index] -= dt;
      if (this.life[index] <= 0) {
        this.setPosition(index, 0, -50, 0);
        continue;
      }
      const velocity = this.velocities[index];
      velocity.y += this.gravity * dt;
      this.positions[index * 3] += velocity.x * dt;
      this.positions[index * 3 + 1] += velocity.y * dt;
      this.positions[index * 3 + 2] += velocity.z * dt;
    }
    this.geometry.attributes.position.needsUpdate = true;
  }
}

let waterParticles;
let crumbParticles;
let sparkleParticles;

function initScene() {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x102a24);
  scene.fog = new THREE.FogExp2(0x102a24, 0.035);
  camera = new THREE.OrthographicCamera(-4, 4, 3, -3, 0.1, 60);

  createMaterials();
  buildLab();

  const hemisphere = new THREE.HemisphereLight(0xcde4e2, 0x28170f, 1.45);
  scene.add(hemisphere);
  const key = new THREE.DirectionalLight(0xffe1b6, 3.1);
  key.position.set(-5, 9, 6);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -7;
  key.shadow.camera.right = 7;
  key.shadow.camera.top = 7;
  key.shadow.camera.bottom = -7;
  key.shadow.bias = -0.0008;
  scene.add(key);
  const inspectionFill = new THREE.DirectionalLight(0xbcd8d3, 0.9);
  inspectionFill.position.set(3, 5, 7);
  inspectionFill.target.position.set(0, 0.4, 0);
  scene.add(inspectionFill, inspectionFill.target);
  const rim = new THREE.SpotLight(0x8bd9e5, 40, 24, Math.PI / 5, 0.45, 1.8);
  rim.position.set(5, 6, -5);
  rim.target.position.set(0, 0, 0);
  scene.add(rim, rim.target);

  waterParticles = new ParticleField(190, 0x80dff1, 0.075, -2.2);
  crumbParticles = new ParticleField(130, 0x6a3b24, 0.065, -3.8);
  sparkleParticles = new ParticleField(90, 0xf4d762, 0.085, -0.8);
  state.webglReady = true;
}

function normalizeModel(source, targetSize = 0.8) {
  const wrapper = new THREE.Group();
  const object = source.clone(true);
  wrapper.add(object);
  object.updateMatrixWorld(true);
  let bounds = new THREE.Box3().setFromObject(object);
  const size = bounds.getSize(new THREE.Vector3());
  const longest = Math.max(size.x, size.y, size.z) || 1;
  const scale = targetSize / longest;
  object.scale.multiplyScalar(scale);
  object.updateMatrixWorld(true);
  bounds = new THREE.Box3().setFromObject(object);
  const center = bounds.getCenter(new THREE.Vector3());
  object.position.x -= center.x;
  object.position.z -= center.z;
  object.position.y -= bounds.min.y;
  object.traverse((child) => {
    if (!child.isMesh) return;
    child.castShadow = true;
    child.receiveShadow = true;
  });
  return wrapper;
}

function loadTemplate(item) {
  if (!item.model) return Promise.resolve(null);
  if (modelPromises.has(item.id)) return modelPromises.get(item.id);
  const promise = gltfLoader.loadAsync(item.model)
    .then((gltf) => {
      const template = normalizeModel(gltf.scene, item.displaySize || 0.9);
      modelTemplates.set(item.id, template);
      refreshActiveTokenModels(item.id);
      return template;
    })
    .catch((error) => {
      console.warn(`Using procedural fallback for ${item.id}:`, error.message);
      return null;
    });
  modelPromises.set(item.id, promise);
  return promise;
}

function refreshActiveTokenModels(itemId) {
  state.tokens.filter((token) => token.id === itemId).forEach((token) => {
    if (!token.object3d) return;
    const old = token.visual;
    const replacement = createFindVisual(ITEM_BY_ID[itemId]);
    replacement.scale.copy(old?.scale || new THREE.Vector3(1, 1, 1));
    if (old) token.object3d.remove(old);
    token.visual = replacement;
    token.object3d.add(replacement);
  });
}

function loadSpecimenAsset(path, holder, targetSize) {
  return gltfLoader.loadAsync(path).then((gltf) => {
    const normalized = normalizeModel(gltf.scene, targetSize);
    normalized.traverse((child) => {
      if (!child.isMesh) return;
      if (child.name.includes('fiber')) child.material = MAT.specimenDark;
      else applySpecimenSurface(child);
    });
    holder.clear();
    holder.add(normalized);
    return normalized;
  }).catch((error) => {
    console.warn(`Specimen asset fallback retained for ${path}:`, error.message);
    return null;
  });
}

function applySpecimenSurface(object) {
  const positions = object.geometry?.attributes?.position;
  if (!positions) {
    object.material = MAT.specimen;
    return;
  }
  const colors = new Float32Array(positions.count * 3);
  const point = new THREE.Vector3();
  const trough = new THREE.Color(0x341b12);
  const body = new THREE.Color(0x623823);
  const ridge = new THREE.Color(0x865238);
  const color = new THREE.Color();
  for (let index = 0; index < positions.count; index += 1) {
    point.fromBufferAttribute(positions, index);
    const broad = Math.sin(point.x * 2.7 + point.z * 1.8) * 0.5
      + Math.sin(point.y * 5.1 - point.x * 1.3) * 0.3;
    const pores = Math.sin(point.x * 14.3 + point.y * 9.7 + point.z * 12.1) * 0.2;
    const amount = clamp(0.5 + broad * 0.28 + pores * 0.16, 0, 1);
    if (amount < 0.52) color.copy(trough).lerp(body, amount / 0.52);
    else color.copy(body).lerp(ridge, (amount - 0.52) / 0.48);
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
  }
  object.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const detailedMaterial = MAT.specimen.clone();
  detailedMaterial.color.set(0xffffff);
  detailedMaterial.vertexColors = true;
  object.material = detailedMaterial;
}

function buildCarrot() {
  const group = new THREE.Group();
  const segments = 32;
  const rings = 38;
  const vertices = [];
  const colors = [];
  const indices = [];
  const darkOrange = new THREE.Color(0xa94116);
  const lightOrange = new THREE.Color(0xe9802e);
  const vertexColor = new THREE.Color();
  for (let ring = 0; ring <= rings; ring += 1) {
    const t = ring / rings;
    const x = -0.55 + t * 1.18;
    const centreY = Math.sin(t * Math.PI * 1.65) * 0.028;
    const centreZ = Math.sin(t * Math.PI) * 0.035;
    const baseRadius = 0.026 + 0.225 * Math.pow(1 - t, 0.72);
    for (let segment = 0; segment < segments; segment += 1) {
      const theta = segment / segments * Math.PI * 2;
      const irregularity = 1
        + Math.sin(theta * 3 + t * 13) * 0.035
        + Math.sin(theta * 7 - t * 19) * 0.018;
      const radius = baseRadius * irregularity;
      vertices.push(x, centreY + Math.cos(theta) * radius * 0.92, centreZ + Math.sin(theta) * radius);
      const shade = clamp(0.48 + Math.sin(theta - 0.6) * 0.17 + Math.sin(t * 17 + theta * 4) * 0.07, 0, 1);
      vertexColor.copy(darkOrange).lerp(lightOrange, shade);
      colors.push(vertexColor.r, vertexColor.g, vertexColor.b);
    }
  }
  for (let ring = 0; ring < rings; ring += 1) {
    for (let segment = 0; segment < segments; segment += 1) {
      const next = (segment + 1) % segments;
      const a = ring * segments + segment;
      const b = ring * segments + next;
      const c = (ring + 1) * segments + next;
      const d = (ring + 1) * segments + segment;
      indices.push(a, b, d, b, c, d);
    }
  }
  const carrotGeometry = new THREE.BufferGeometry();
  carrotGeometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  carrotGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  carrotGeometry.setIndex(indices);
  carrotGeometry.computeVertexNormals();
  const rootMat = material(0xffffff, { roughness: 0.76, vertexColors: true });
  group.add(mesh(carrotGeometry, rootMat));

  const scarMaterial = material(0x98421d, { roughness: 0.82 });
  for (let index = 0; index < 7; index += 1) {
    const t = 0.12 + index * 0.105;
    const radius = 0.026 + 0.225 * Math.pow(1 - t, 0.72);
    const ridge = mesh(new THREE.TorusGeometry(radius * 0.91, 0.005, 6, 28), scarMaterial);
    ridge.rotation.y = Math.PI / 2;
    ridge.position.set(-0.55 + t * 1.18, Math.sin(t * Math.PI * 1.65) * 0.028, Math.sin(t * Math.PI) * 0.035);
    ridge.scale.y = 0.9;
    group.add(ridge);
  }
  const leafMat = material(0x315f36, { roughness: 0.82 });
  for (let index = 0; index < 6; index += 1) {
    const spread = (index - 2.5) * 0.065;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.56, 0.05, spread * 0.5),
      new THREE.Vector3(-0.66 - Math.abs(spread), 0.26, spread),
      new THREE.Vector3(-0.78 - Math.abs(spread) * 0.8, 0.48 + (index % 2) * 0.08, spread * 1.5)
    ]);
    group.add(mesh(new THREE.TubeGeometry(curve, 16, 0.014 + (index % 2) * 0.003, 7, false), leafMat));
  }
  const rootHair = mesh(new THREE.ConeGeometry(0.018, 0.23, 10), material(0xbf5b28, { roughness: 0.9 }));
  rootHair.rotation.z = -Math.PI / 2;
  rootHair.position.set(0.73, 0.01, 0.035);
  group.add(rootHair);
  group.scale.setScalar(0.86);
  return group;
}

function buildBeet() {
  const group = new THREE.Group();
  const bulbGeometry = new THREE.SphereGeometry(0.42, 36, 24);
  const positions = bulbGeometry.attributes.position;
  const bulbColors = new Float32Array(positions.count * 3);
  const point = new THREE.Vector3();
  const beetDark = new THREE.Color(0x4b1831);
  const beetLight = new THREE.Color(0x883953);
  const beetColor = new THREE.Color();
  for (let index = 0; index < positions.count; index += 1) {
    point.fromBufferAttribute(positions, index);
    const direction = point.clone().normalize();
    const variation = 1 + Math.sin(direction.x * 8 + direction.z * 5) * 0.045 + Math.sin(direction.y * 13) * 0.025;
    point.multiplyScalar(variation);
    positions.setXYZ(index, point.x, point.y, point.z);
    const shade = clamp(0.5 + direction.x * 0.22 + Math.sin(direction.z * 11 + direction.y * 7) * 0.08, 0, 1);
    beetColor.copy(beetDark).lerp(beetLight, shade);
    bulbColors[index * 3] = beetColor.r;
    bulbColors[index * 3 + 1] = beetColor.g;
    bulbColors[index * 3 + 2] = beetColor.b;
  }
  positions.needsUpdate = true;
  bulbGeometry.setAttribute('color', new THREE.BufferAttribute(bulbColors, 3));
  bulbGeometry.computeVertexNormals();
  const beetMat = material(0xffffff, { roughness: 0.68, vertexColors: true });
  const bulb = mesh(bulbGeometry, beetMat);
  bulb.position.y = 0.2;
  bulb.scale.set(1, 1.06, 0.96);
  group.add(bulb);
  const root = mesh(new THREE.ConeGeometry(0.11, 0.66, 18), beetMat);
  root.position.y = -0.32;
  group.add(root);
  const stemMat = material(0x6f2e43, { roughness: 0.78 });
  const leafMat = material(0x315b38, { roughness: 0.84, side: THREE.DoubleSide });
  for (let index = 0; index < 4; index += 1) {
    const stem = mesh(new THREE.CylinderGeometry(0.018, 0.032, 0.54, 10), stemMat);
    stem.position.set((index - 1.5) * 0.07, 0.68, (index % 2 - 0.5) * 0.08);
    stem.rotation.z = (index - 1.5) * 0.12;
    group.add(stem);
    const leafShape = new THREE.Shape();
    leafShape.moveTo(0, 0);
    leafShape.bezierCurveTo(-0.16, 0.08, -0.14, 0.38, 0, 0.5);
    leafShape.bezierCurveTo(0.14, 0.38, 0.16, 0.08, 0, 0);
    const leaf = mesh(new THREE.ShapeGeometry(leafShape, 12), leafMat);
    leaf.position.set((index - 1.5) * 0.1, 0.82, (index % 2 - 0.5) * 0.12);
    leaf.rotation.set(-0.35 + (index % 2) * 0.3, (index - 1.5) * 0.45, (index - 1.5) * 0.12);
    group.add(leaf);
  }
  group.scale.setScalar(0.72);
  return group;
}

function buildCoin() {
  const group = new THREE.Group();
  const gold = material(0xb98d2e, { roughness: 0.34, metalness: 0.78 });
  const coin = mesh(new THREE.CylinderGeometry(0.37, 0.37, 0.085, 40), gold);
  coin.rotation.z = Math.PI / 2;
  group.add(coin);
  const stamp = mesh(new THREE.TorusGeometry(0.25, 0.022, 8, 40), material(0x795b20, { roughness: 0.45, metalness: 0.7 }));
  stamp.rotation.y = Math.PI / 2;
  stamp.position.x = 0.048;
  group.add(stamp);
  group.rotation.y = -0.86;
  return group;
}

function buildRing() {
  const group = new THREE.Group();
  const gold = material(0xd1a63d, { roughness: 0.24, metalness: 0.86 });
  const band = mesh(new THREE.TorusGeometry(0.31, 0.075, 14, 48), gold);
  band.rotation.x = Math.PI / 2;
  group.add(band);
  const setting = mesh(new THREE.OctahedronGeometry(0.16, 1), new THREE.MeshPhysicalMaterial({ color: 0xaecfe0, roughness: 0.08, transmission: 0.28, thickness: 0.3, metalness: 0.05 }));
  setting.position.y = 0.36;
  group.add(setting);
  return group;
}

function buildKey() {
  const group = new THREE.Group();
  const brass = material(0xa98237, { roughness: 0.38, metalness: 0.74 });
  const bow = mesh(new THREE.TorusGeometry(0.28, 0.075, 12, 40), brass);
  bow.rotation.x = Math.PI / 2;
  bow.position.x = -0.46;
  group.add(bow);
  group.add(createBox(0.8, 0.12, 0.13, brass, 0.16, 0, 0));
  group.add(createBox(0.12, 0.28, 0.13, brass, 0.47, -0.09, 0));
  group.add(createBox(0.12, 0.22, 0.13, brass, 0.7, -0.06, 0));
  group.scale.setScalar(0.78);
  return group;
}

function buildFallbackProduce(item) {
  if (item.id === 'carrot') return buildCarrot();
  if (item.id === 'beet') return buildBeet();
  if (item.id === 'coin') return buildCoin();
  if (item.id === 'ring') return buildRing();
  if (item.id === 'key') return buildKey();

  const group = new THREE.Group();
  const itemMaterial = new THREE.MeshPhysicalMaterial({ color: item.color, roughness: 0.55, clearcoat: 0.04, clearcoatRoughness: 0.65 });
  if (item.id === 'banana') {
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(-0.5, 0, 0), new THREE.Vector3(0, -0.35, 0), new THREE.Vector3(0.5, 0, 0));
    group.add(mesh(new THREE.TubeGeometry(curve, 28, 0.13, 14, false), itemMaterial));
  } else if (item.id === 'duck') {
    const body = mesh(new THREE.SphereGeometry(0.38, 28, 18), itemMaterial);
    body.scale.set(1.2, 0.8, 0.85);
    group.add(body);
    const head = mesh(new THREE.SphereGeometry(0.25, 24, 16), itemMaterial);
    head.position.set(-0.22, 0.42, 0);
    group.add(head);
    const beak = mesh(new THREE.ConeGeometry(0.11, 0.28, 16), material(0xd7772a, { roughness: 0.62 }));
    beak.rotation.z = Math.PI / 2;
    beak.position.set(-0.48, 0.4, 0);
    group.add(beak);
  } else {
    const body = mesh(new THREE.IcosahedronGeometry(0.42, 4), itemMaterial);
    body.scale.set(0.95, item.id === 'onion' ? 1.1 : 0.9, 0.92);
    group.add(body);
  }
  return group;
}

function createFindVisual(item) {
  const template = modelTemplates.get(item.id);
  const visual = template ? template.clone(true) : buildFallbackProduce(item);
  const ownsResources = !template;
  visual.name = `${item.id}Visual`;
  visual.traverse((child) => {
    if (!child.isMesh) return;
    child.castShadow = true;
    child.receiveShadow = true;
    child.userData.disposeWithFind = ownsResources;
  });
  return visual;
}

function createIrregularMudGeometry(seed) {
  // SphereGeometry keeps shared, smoothly shaded surface topology. The previous
  // faceted icosahedron made every find resemble a low-poly game token instead
  // of a wet, irregular clump of sediment.
  const geometry = new THREE.SphereGeometry(0.56, 32, 20);
  const positions = geometry.attributes.position;
  const point = new THREE.Vector3();
  for (let index = 0; index < positions.count; index += 1) {
    point.fromBufferAttribute(positions, index);
    const direction = point.clone().normalize();
    const variation = 1
      + Math.sin(direction.x * 7 + direction.z * 3 + seed * 0.71) * 0.052
      + Math.sin(direction.y * 11 - direction.x * 4 - seed * 0.39) * 0.031
      + Math.sin(direction.z * 17 + direction.x * 8 + seed) * 0.018;
    point.multiplyScalar(variation);
    positions.setXYZ(index, point.x, point.y, point.z);
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

function clearTokenObjects() {
  const geometries = new Set();
  const materials = new Set();
  findsRoot.traverse((child) => {
    if (!child.isMesh || !child.userData.disposeWithFind) return;
    if (child.geometry) geometries.add(child.geometry);
    const childMaterials = Array.isArray(child.material) ? child.material : [child.material];
    childMaterials.filter(Boolean).forEach((childMaterial) => materials.add(childMaterial));
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((childMaterial) => childMaterial.dispose());
  findsRoot.clear();
}

function createTokenObjects() {
  clearTokenObjects();
  const count = state.tokens.length;
  const columns = Math.min(4, Math.max(3, Math.ceil(Math.sqrt(count * 1.6))));
  const rows = Math.ceil(count / columns);
  const xGap = count > 8 ? 1.32 : 1.55;
  const zGap = count > 8 ? 0.92 : 1.08;
  state.tokens.forEach((token, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const home = new THREE.Vector3(
      (column - (Math.min(columns, count - row * columns) - 1) / 2) * xGap,
      0.35,
      (row - (rows - 1) / 2) * zGap
    );
    token.home = home;
    const root = new THREE.Group();
    root.name = `Find_${token.uid}`;
    root.position.copy(home);
    const visual = createFindVisual(ITEM_BY_ID[token.id]);
    visual.updateMatrixWorld(true);
    const visualBounds = new THREE.Box3().setFromObject(visual);
    const visualCenter = visualBounds.getCenter(new THREE.Vector3());
    const shellMaterial = MAT.mudShell.clone();
    const shell = mesh(createIrregularMudGeometry(index + state.sampleIndex * 17 + state.shift * 31), shellMaterial);
    shell.userData.disposeWithFind = true;
    shell.position.copy(visualCenter);
    shell.scale.set(1.18 + (index % 3) * 0.035, 0.92 + (index % 2) * 0.045, 1.06 - (index % 2) * 0.03);
    shell.rotation.set(index * 0.31, index * 0.47, index * 0.19);
    const colliderMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
    const hitbox = mesh(new THREE.SphereGeometry(0.62, 12, 8), colliderMaterial, { cast: false, receive: false });
    hitbox.userData.disposeWithFind = true;
    hitbox.position.copy(visualCenter);
    hitbox.userData.tokenUid = token.uid;
    root.add(visual, shell, hitbox);
    findsRoot.add(root);
    token.object3d = root;
    token.visual = visual;
    token.shell = shell;
    token.hitbox3d = hitbox;
    token.sortAnim = 0;
    token.wrongFlash = 0;
    token.revealPop = token.revealed ? 1 : 0;
  });
}

function setupPreloads() {
  const specimenLoads = [
    loadSpecimenAsset('./assets/3d/specimen_intact.glb', specimenIntact, 4.8),
    loadSpecimenAsset('./assets/3d/specimen_clumps.glb', specimenClumps, 4.2)
  ];
  const finds = ITEMS.filter((item) => item.model).map(loadTemplate);
  Promise.allSettled([...specimenLoads, ...finds]).then(() => {
    ui.bootCopy.textContent = 'Tray ready. Break the specimen to begin recovery.';
  });
}

// --- Game state -------------------------------------------------------------

function getSamplePool(sampleIndex) {
  const base = ['apple', 'banana', 'kiwi', 'lime', 'carrot', 'sweet_potato', 'onion', 'beet', 'coin'];
  if (sampleIndex >= 1 || state.shift > 1) base.push('key');
  if (sampleIndex >= 2 || state.shift > 1) base.push('ring');
  if (sampleIndex >= 3 || state.shift > 2) base.push('duck');
  return base;
}

function generateSampleItems() {
  const desired = SAMPLE_COUNTS[state.sampleIndex] + save.upgrades.mesh + Math.min(2, state.shift - 1);
  if (state.sampleIndex === 0 && state.shift === 1) {
    const tutorial = ['carrot', 'apple', 'coin'];
    if (desired > 3) tutorial.push(...shuffle(['banana', 'sweet_potato', 'kiwi', 'onion']).slice(0, desired - 3));
    return tutorial;
  }
  seedRng(state.shift * 10007 + state.sampleIndex * 379 + 241);
  const pool = shuffle(getSamplePool(state.sampleIndex).slice());
  const selected = [];
  const required = state.sampleIndex >= 1 ? ['apple', 'carrot', 'coin'] : ['apple', 'carrot'];
  if (state.sampleIndex === 3) required[2] = seededRandom() < 0.5 ? 'ring' : 'duck';
  required.forEach((id) => { if (!selected.includes(id) && ITEM_BY_ID[id]) selected.push(id); });
  for (const id of pool) {
    if (selected.length >= desired) break;
    if (!selected.includes(id)) selected.push(id);
  }
  while (selected.length < desired) selected.push(pool[selected.length % pool.length]);
  return selected;
}

function createTokens(ids) {
  return ids.map((id, index) => ({
    uid: `${id}-${index}`,
    id,
    revealed: index < save.upgrades.scanner,
    sorted: false,
    dragging: false,
    object3d: null,
    visual: null,
    shell: null,
    hitbox3d: null,
    home: new THREE.Vector3(),
    sortTarget: null,
    revealPop: index < save.upgrades.scanner ? 1 : 0,
    wrongFlash: 0,
    sortAnim: 0
  }));
}

function setGameState(next) {
  state.gs = next;
  state.idleTime = 0;
  state.phaseChangedAt = state.totalElapsed;
  pointer.down = false;
  pointer.mode = '';
  pointer.dragTokenId = null;
  syncSceneVisibility();
  updateUI();
  const phase = activePhase();
  if (phase) announce(phase.instruction);
}

function startSample({ retry = false } = {}) {
  if (!retry || state.currentItemIds.length === 0) state.currentItemIds = generateSampleItems();
  state.sampleName = SAMPLE_NAMES[state.sampleIndex] || `SHIFT ${state.shift} SAMPLE`;
  state.tokens = createTokens(state.currentItemIds);
  state.breakProgress = 0;
  state.rinseProgress = 0;
  state.filterProgress = 0;
  state.strikes = 0;
  state.attempts = 0;
  state.correctAttempts = 0;
  state.roundCoins = 0;
  state.bankedThisSample = 0;
  state.sortedCount = 0;
  state.elapsed = 0;
  state.feedback = '';
  state.feedbackTimer = 0;
  state.newDiscoveries = [];
  state.pendingCollection = new Set();
  state.upgradeNotice = '';
  state.upgradeNoticeTone = 'success';
  if (findsRoot) createTokenObjects();
  setGameState('BREAK');
  tone('crack');
}

function transitionToRinse() {
  state.breakProgress = 1;
  setGameState('RINSE');
  emitLocal(crumbParticles, new THREE.Vector3(0, 0.75, 0), 26, 1.1, 0.7, 1.2);
  tone('crack');
}

function transitionToFilter() {
  state.rinseProgress = 1;
  setGameState('FILTER');
  emitLocal(waterParticles, new THREE.Vector3(0, 0.7, 0), 30, 1.25, 0.65, 1.5, true);
  tone('rinse');
}

function transitionToSort() {
  state.filterProgress = 1;
  setGameState('SORT');
  emitLocal(sparkleParticles, new THREE.Vector3(0, 0.75, 0), 34, 1.1, 0.9, 1.5);
  tone('reveal');
}

function chooseUpgradeOffers() {
  const available = Object.keys(UPGRADE_DEFS).filter((id) => save.upgrades[id] < 3);
  if (state.shift === 1 && state.sampleIndex === 0) return ['jet', 'masher'].filter((id) => available.includes(id));
  seedRng(state.shift * 1709 + state.sampleIndex * 97 + save.coins * 3 + 11);
  return shuffle(available).slice(0, 2);
}

function completeSample() {
  state.pendingCollection.forEach((id) => { save.collection[id] = true; });
  const completionBonus = 3 + state.sampleIndex * 2;
  state.bankedThisSample = state.roundCoins + completionBonus;
  save.coins += state.bankedThisSample;
  state.shiftCoins += state.bankedThisSample;
  const accuracy = currentAccuracy();
  save.bestAccuracy = Math.max(save.bestAccuracy, accuracy);
  state.shiftAccuracySum += accuracy;
  state.shiftSamplesPassed += 1;
  save.sampleIndex = state.sampleIndex < SHIFT_SAMPLES - 1 ? state.sampleIndex + 1 : state.sampleIndex;
  save.shiftCoins = state.shiftCoins;
  save.shiftAccuracySum = state.shiftAccuracySum;
  save.shiftSamplesPassed = state.shiftSamplesPassed;
  save.pendingShiftComplete = state.sampleIndex >= SHIFT_SAMPLES - 1;
  save.tutorialDone = true;
  state.upgradeOffers = chooseUpgradeOffers();
  persist();
  setGameState('REPORT');
  announce(`Sample passed. ${state.bankedThisSample} credits banked.`);
  tone('complete');
  renderStateDialog();
}

function finishReport() {
  closeDialogDirect();
  if (state.sampleIndex >= SHIFT_SAMPLES - 1) {
    persist();
    setGameState('SHIFT_COMPLETE');
    announce(`Shift ${state.shift} complete.`);
    renderStateDialog();
    return;
  }
  state.sampleIndex += 1;
  state.currentItemIds = [];
  startSample();
}

function startNextShift() {
  closeDialogDirect();
  save.completedShifts = Math.max(save.completedShifts, state.shift);
  save.shift = state.shift + 1;
  save.sampleIndex = 0;
  save.shiftCoins = 0;
  save.shiftAccuracySum = 0;
  save.shiftSamplesPassed = 0;
  save.pendingShiftComplete = false;
  persist();
  state.shift = save.shift;
  state.sampleIndex = 0;
  state.currentItemIds = [];
  state.shiftCoins = 0;
  state.shiftAccuracySum = 0;
  state.shiftSamplesPassed = 0;
  startSample();
}

function contaminate() {
  setGameState('GAMEOVER');
  state.retryCount += 1;
  state.feedback = 'LAB CONTAMINATED';
  announce('Lab contaminated. Retry the current sample.');
  tone('fail');
  renderStateDialog();
}

function retrySample() {
  closeDialogDirect();
  startSample({ retry: true });
  announce('Sample restarted. Contamination cleared.');
}

function revealToken(token) {
  if (!token || token.sorted || token.revealed) return;
  state.feedbackTimer = 0;
  ui.feedback.classList.remove('is-visible');
  token.revealed = true;
  token.revealPop = 0;
  state.idleTime = 0;
  if (token.shell) token.shell.visible = false;
  const item = ITEM_BY_ID[token.id];
  const world = token.object3d.getWorldPosition(new THREE.Vector3());
  sparkleParticles.emit(world, 18, 0.95, 0.72, 1.15);
  showFindCallout(token);
  tone('reveal');
  announce(`${item.label} recovered. File it as ${CATEGORY[item.category].label}.`);
  updateUI();
}

function sortToken(token, category) {
  if (!token || token.sorted || !token.revealed || !CATEGORY[category]) return;
  clearTimeout(showFindCallout.timer);
  ui.callout.classList.remove('is-visible');
  ui.callout.setAttribute('aria-hidden', 'true');
  const item = ITEM_BY_ID[token.id];
  state.attempts += 1;
  if (item.category === category) {
    token.sorted = true;
    token.dragging = false;
    token.sortAnim = 0.001;
    state.sortedCount += 1;
    state.correctAttempts += 1;
    let reward = item.value;
    const isNew = !save.collection[item.id] && !state.pendingCollection.has(item.id);
    if (isNew) {
      state.pendingCollection.add(item.id);
      state.newDiscoveries.push(item.id);
      reward += FIRST_DISCOVERY_BONUS;
    }
    reward += Math.floor(Math.max(0, state.correctAttempts - 1) / 3);
    state.roundCoins += reward;
    const button = ui.binButtons.find((candidate) => candidate.dataset.category === category);
    const rect = button.getBoundingClientRect();
    const worldTarget = screenToGround(rect.left + rect.width / 2, rect.top + rect.height * 0.1) || new THREE.Vector3();
    token.sortTarget = sieveRig.worldToLocal(worldTarget.clone());
    token.sortTarget.y = 0.45;
    button.classList.add('is-success');
    setTimeout(() => button.classList.remove('is-success'), 300);
    showFeedback(isNew ? `NEW SPECIMEN  +${reward}` : `FILED  +${reward}`, 'success');
    sparkleParticles.emit(worldTarget, 18, 1.0, 0.65, 1.1);
    tone('correct');
    announce(`${item.label} filed correctly. ${state.sortedCount} of ${state.tokens.length} recovered finds filed.`);
    if (state.sortedCount >= state.tokens.length) completeSample();
  } else {
    token.dragging = false;
    token.wrongFlash = 0.8;
    token.object3d.position.copy(token.home);
    state.strikes += 1;
    const button = ui.binButtons.find((candidate) => candidate.dataset.category === category);
    button.classList.add('is-wrong');
    setTimeout(() => button.classList.remove('is-wrong'), 420);
    showFeedback(`${item.label} → ${CATEGORY[item.category].label}`, 'error', 1.5);
    tone('wrong');
    announce(`Wrong bin. ${item.label} belongs in ${CATEGORY[item.category].label}. ${state.strikes} of ${MAX_STRIKES} contamination strikes.`);
    if (state.strikes >= MAX_STRIKES) contaminate();
  }
  updateUI();
}

function purchaseUpgrade(id) {
  if (!UPGRADE_DEFS[id] || save.upgrades[id] >= 3) return;
  const cost = UPGRADE_COSTS[save.upgrades[id]];
  if (save.coins < cost) {
    state.upgradeNotice = `Need ${cost - save.coins} more credits for ${UPGRADE_DEFS[id].title}.`;
    state.upgradeNoticeTone = 'error';
    tone('wrong');
    announce(state.upgradeNotice);
    renderReportDialog();
    return;
  }
  save.coins -= cost;
  save.upgrades[id] += 1;
  persist();
  state.upgradeNotice = `${UPGRADE_DEFS[id].title} upgraded to level ${save.upgrades[id]}.`;
  state.upgradeNoticeTone = 'success';
  tone('upgrade');
  announce(state.upgradeNotice);
  updateUI();
  renderReportDialog();
  const refreshed = ui.dialogBody.querySelector(`[data-upgrade="${id}"]:not(:disabled)`)
    || ui.dialogActions.querySelector('.is-primary');
  refreshed?.focus({ preventScroll: true });
}

// --- UI and dialogs ---------------------------------------------------------

function activePhaseIndex() {
  if (state.gs === 'BREAK') return 0;
  if (state.gs === 'RINSE') return 1;
  if (state.gs === 'FILTER') return 2;
  if (state.gs === 'SORT') return state.tokens.some((token) => !token.sorted && !token.revealed) ? 3 : 4;
  return 4;
}

function activePhase() { return ['BREAK', 'RINSE', 'FILTER', 'SORT'].includes(state.gs) ? PHASES[activePhaseIndex()] : null; }

function phaseProgress() {
  if (state.gs === 'BREAK') return state.breakProgress;
  if (state.gs === 'RINSE') return state.rinseProgress;
  if (state.gs === 'FILTER') return state.filterProgress;
  if (state.gs === 'SORT') {
    if (activePhaseIndex() === 3) return state.tokens.filter((token) => token.revealed).length / Math.max(1, state.tokens.length);
    return state.sortedCount / Math.max(1, state.tokens.length);
  }
  return 1;
}

function updateUI() {
  ui.sample.textContent = `${state.shift} · ${state.sampleIndex + 1}/${SHIFT_SAMPLES}`;
  ui.collection.textContent = `${itemCount()}/${ITEMS.length}`;
  ui.coins.textContent = String(save.coins);
  ui.strikes.setAttribute('aria-label', `${state.strikes} of ${MAX_STRIKES} contamination strikes`);
  [...ui.strikes.children].forEach((lamp, index) => lamp.classList.toggle('is-on', index < state.strikes));

  const phaseIndex = activePhaseIndex();
  ui.steps.forEach((step, index) => {
    step.classList.toggle('is-active', index === phaseIndex && ['BREAK', 'RINSE', 'FILTER', 'SORT'].includes(state.gs));
    step.classList.toggle('is-complete', index < phaseIndex || ['REPORT', 'SHIFT_COMPLETE'].includes(state.gs));
  });
  const phase = activePhase();
  if (phase) {
    ui.phase.textContent = phase.label;
    ui.instruction.textContent = phase.instruction;
    ui.progressLabel.textContent = phase.progress;
  }
  const progress = clamp(phaseProgress(), 0, 1);
  ui.progressValue.textContent = `${Math.round(progress * 100)}%`;
  ui.progressFill.style.transform = `scaleX(${progress})`;
  const playing = ['BREAK', 'RINSE', 'FILTER', 'SORT'].includes(state.gs);
  ui.progressDock.hidden = !playing;
  ui.bins.classList.toggle('is-active', state.gs === 'SORT');

  ui.mute.setAttribute('aria-pressed', String(audio.muted));
  ui.mute.setAttribute('aria-label', audio.muted ? 'Unmute sound' : 'Mute sound');
  ui.mute.querySelectorAll('.sound-wave').forEach((wave) => { wave.style.display = audio.muted ? 'none' : ''; });
  if (state.feedbackTimer <= 0) ui.feedback.classList.remove('is-visible');
  updateViewRects();
}

function showFindCallout(token) {
  const item = ITEM_BY_ID[token.id];
  token.visual.updateWorldMatrix(true, true);
  const bounds = new THREE.Box3().setFromObject(token.visual);
  const anchor = bounds.getCenter(new THREE.Vector3());
  anchor.y = bounds.max.y + 0.08;
  const point = projectToScreen(anchor);
  ui.findName.textContent = item.label;
  ui.findCategory.textContent = `File as ${CATEGORY[item.category].label}`;
  ui.callout.style.left = `${point.x}px`;
  ui.callout.style.top = `${point.y}px`;
  ui.callout.classList.add('is-visible');
  ui.callout.setAttribute('aria-hidden', 'false');
  clearTimeout(showFindCallout.timer);
  showFindCallout.timer = setTimeout(() => {
    ui.callout.classList.remove('is-visible');
    ui.callout.setAttribute('aria-hidden', 'true');
  }, 1700);
}

function openDialogBase(title, subtitle = '') {
  ui.dialogTitle.textContent = title;
  ui.dialogSubtitle.textContent = subtitle;
  if (!ui.dialog.open) ui.dialog.showModal();
}

function closeDialogDirect() {
  if (ui.dialog.open) ui.dialog.close();
}

function setDialogButtons(buttons) {
  ui.dialogActions.replaceChildren();
  buttons.forEach(({ label, primary = false, action }) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `modal-button${primary ? ' is-primary' : ''}`;
    button.textContent = label;
    button.addEventListener('click', action);
    ui.dialogActions.append(button);
  });
}

function renderHelpDialog() {
  openDialogBase('Procedure guide', 'Five physical steps. Three contamination strikes. No countdown.');
  ui.dialogBody.innerHTML = `
    <ol class="help-steps">
      <li><b>1</b><div><strong>Break the sample</strong><span>Tap or swipe the steel masher across the dense specimen until it separates into fragments.</span></div></li>
      <li><b>2</b><div><strong>Rinse every clump</strong><span>Hold and move the pressure nozzle. Brown runoff drains as the embedded finds begin to show.</span></div></li>
      <li><b>3</b><div><strong>Work the sieve</strong><span>Drag sharply left and right. Fine waste falls through the steel mesh; solid finds remain.</span></div></li>
      <li><b>4</b><div><strong>Identify each find</strong><span>Tap the remaining mud shells. The clean 3D object lifts for inspection.</span></div></li>
      <li><b>5</b><div><strong>File it correctly</strong><span>Drag to Fruit, Vegetable, or Odd object. A third wrong bin contaminates this sample.</span></div></li>
    </ol>`;
  setDialogButtons([{ label: 'Resume sample', primary: true, action: closeModal }]);
}

function renderCollectionDialog() {
  openDialogBase('Specimen archive', `${itemCount()} of ${ITEMS.length} finds permanently recovered.`);
  ui.dialogBody.innerHTML = `<div class="collection-grid">${ITEMS.map((item) => {
    const found = Boolean(save.collection[item.id]);
    return `<article class="collection-entry${found ? '' : ' is-locked'}"><span>${found ? CATEGORY[item.category].label : 'UNIDENTIFIED'}</span><b>${found ? item.label : 'SEALED RECORD'}</b><span>${found ? `${item.rarity} · value ${item.value}` : 'Recover it from a future sample'}</span></article>`;
  }).join('')}</div>`;
  setDialogButtons([{ label: 'Close archive', primary: true, action: closeModal }]);
}

function renderReportDialog() {
  openDialogBase('Sample clean', `${state.sampleName} · ${state.bankedThisSample} credits banked`);
  const accuracy = Math.round(currentAccuracy() * 100);
  const newNames = state.newDiscoveries.map((id) => ITEM_BY_ID[id].label).join(', ') || 'No new archive entries';
  ui.dialogBody.innerHTML = `
    <div class="report-grid">
      <div class="report-stat"><span>Recovered</span><b>${state.sortedCount}/${state.tokens.length}</b><span>solid finds filed</span></div>
      <div class="report-stat"><span>Accuracy</span><b>${accuracy}%</b><span>${state.strikes} contamination strike${state.strikes === 1 ? '' : 's'}</span></div>
      <div class="report-stat"><span>Archive</span><b>${state.newDiscoveries.length} new</b><span>${newNames}</span></div>
    </div>
    <div class="upgrade-grid" style="margin-top: var(--space-lg)">${state.upgradeOffers.map((id) => {
      const level = save.upgrades[id];
      const maxed = level >= 3;
      const cost = maxed ? 0 : UPGRADE_COSTS[level];
      const unaffordable = !maxed && save.coins < cost;
      const availability = maxed ? 'MAXIMUM LEVEL' : unaffordable ? `NEED ${cost - save.coins} MORE · LEVEL ${level}` : `${cost} CREDITS · LEVEL ${level}`;
      return `<button class="upgrade-button" type="button" data-upgrade="${id}" ${maxed || unaffordable ? 'disabled' : ''}><span>${availability}</span><b>${UPGRADE_DEFS[id].title}</b><span>${UPGRADE_DEFS[id].subtitle}</span></button>`;
    }).join('')}</div>
    ${state.upgradeNotice ? `<p class="upgrade-notice" data-tone="${state.upgradeNoticeTone}" role="status">${state.upgradeNotice}</p>` : ''}`;
  ui.dialogBody.querySelectorAll('[data-upgrade]').forEach((button) => button.addEventListener('click', () => purchaseUpgrade(button.dataset.upgrade)));
  setDialogButtons([
    { label: 'Open archive', action: () => openModal('COLLECTION') },
    { label: state.sampleIndex >= SHIFT_SAMPLES - 1 ? 'Finish shift' : 'Next sample', primary: true, action: finishReport }
  ]);
}

function renderGameOverDialog() {
  openDialogBase('Sample contaminated', 'Three classification errors invalidated this tray. Prior recoveries and upgrades are safe.');
  ui.dialogBody.innerHTML = `
    <div class="report-grid">
      <div class="report-stat"><span>Sample retained</span><b>${state.sampleIndex + 1}/${SHIFT_SAMPLES}</b><span>same hidden find set on retry</span></div>
      <div class="report-stat"><span>Filed before failure</span><b>${state.sortedCount}</b><span>temporary results will be reprocessed</span></div>
      <div class="report-stat"><span>Permanent archive</span><b>${itemCount()}</b><span>banked records are untouched</span></div>
    </div>`;
  setDialogButtons([
    { label: 'Review procedure', action: () => openModal('HELP') },
    { label: 'Retry sample', primary: true, action: retrySample }
  ]);
}

function renderShiftDialog() {
  const average = state.shiftSamplesPassed ? Math.round((state.shiftAccuracySum / state.shiftSamplesPassed) * 100) : 100;
  openDialogBase(`Shift ${state.shift} sealed`, 'Four samples processed. The next shift carries denser specimens and rarer recoveries.');
  ui.dialogBody.innerHTML = `
    <div class="report-grid">
      <div class="report-stat"><span>Samples sealed</span><b>${SHIFT_SAMPLES}</b><span>complete laboratory shift</span></div>
      <div class="report-stat"><span>Shift credits</span><b>${state.shiftCoins}</b><span>${save.coins} available to spend</span></div>
      <div class="report-stat"><span>Mean accuracy</span><b>${average}%</b><span>best record ${Math.round(save.bestAccuracy * 100)}%</span></div>
    </div>`;
  setDialogButtons([
    { label: 'Open archive', action: () => openModal('COLLECTION') },
    { label: `Start shift ${state.shift + 1}`, primary: true, action: startNextShift }
  ]);
}

function renderStateDialog() {
  ui.feedback.classList.remove('is-visible');
  clearTimeout(showFindCallout.timer);
  ui.callout.classList.remove('is-visible');
  ui.callout.setAttribute('aria-hidden', 'true');
  ui.dialogClose.hidden = !state.modal;
  if (state.modal === 'HELP') renderHelpDialog();
  else if (state.modal === 'COLLECTION') renderCollectionDialog();
  else if (state.gs === 'REPORT') renderReportDialog();
  else if (state.gs === 'GAMEOVER') renderGameOverDialog();
  else if (state.gs === 'SHIFT_COMPLETE') renderShiftDialog();
}

function openModal(kind) {
  state.modal = kind;
  renderStateDialog();
  updateUI();
}

function closeModal() {
  state.modal = null;
  closeDialogDirect();
  if (['REPORT', 'GAMEOVER', 'SHIFT_COMPLETE'].includes(state.gs)) renderStateDialog();
  canvas.focus({ preventScroll: true });
  updateUI();
}

// --- Scene synchronisation and animation -----------------------------------

function emitLocal(field, localPoint, count, speed, life, spread, downward = false) {
  if (!field || !labRoot) return;
  const world = labRoot.localToWorld(localPoint.clone());
  field.emit(world, count, speed, life, spread, downward);
}

function syncSceneVisibility() {
  if (!specimenIntact) return;
  specimenIntact.visible = state.gs === 'BREAK';
  specimenClumps.visible = ['RINSE', 'FILTER'].includes(state.gs);
  findsRoot.visible = ['RINSE', 'FILTER', 'SORT'].includes(state.gs);
  masher.visible = state.gs === 'BREAK';
  nozzle.visible = state.gs === 'RINSE';
  Object.values(binMeshes).forEach((bin) => { bin.visible = state.gs === 'SORT'; });
  if (slurry) slurry.visible = ['BREAK', 'RINSE', 'FILTER'].includes(state.gs);
}

function updateTokenScene(dt) {
  state.tokens.forEach((token, index) => {
    if (!token.object3d) return;
    const phaseTime = state.totalElapsed - state.phaseChangedAt;
    token.object3d.visible = !token.sorted || token.sortAnim > 0;
    if (state.gs === 'RINSE') {
      const wash = state.rinseProgress;
      token.object3d.position.x = token.home.x;
      token.object3d.position.z = token.home.z;
      token.object3d.position.y = 0.22 + wash * 0.16 + Math.sin(phaseTime * 2.5 + index) * 0.018;
      token.shell.visible = !token.revealed;
      token.visual.visible = token.revealed || wash > 0.68;
      token.shell.material.opacity = 0.97 - wash * 0.32;
      const shellScale = 1.22 - wash * 0.12;
      token.shell.scale.set(1.16 * shellScale, 0.88 * shellScale, 1.02 * shellScale);
    } else if (state.gs === 'FILTER') {
      token.object3d.position.x = token.home.x + Math.sin(phaseTime * 5 + index) * state.trayShake * 0.012;
      token.object3d.position.z = token.home.z + Math.cos(phaseTime * 4 + index * 0.7) * 0.04;
      token.object3d.position.y = 0.34 + Math.abs(state.trayShake) * 0.008;
      token.shell.visible = !token.revealed;
      token.visual.visible = token.revealed;
      token.shell.material.opacity = 0.82;
    } else if (state.gs === 'SORT' && !token.dragging && !token.sorted) {
      token.object3d.position.lerp(token.home, clamp(dt * 9, 0, 1));
      token.object3d.position.y = token.home.y + Math.sin(state.totalElapsed * 2.2 + index) * 0.015;
      token.shell.visible = !token.revealed;
      token.visual.visible = token.revealed;
      token.shell.material.opacity = 0.94;
      if (token.revealed && token.id !== 'coin') token.visual.rotation.y += dt * 0.55;
    }
    if (token.revealed && token.revealPop < 1) {
      token.revealPop = clamp(token.revealPop + dt * 4.8, 0, 1);
      const lift = Math.sin(token.revealPop * Math.PI) * 0.52;
      token.object3d.position.y = token.home.y + lift;
      if (token.id !== 'coin') token.visual.rotation.y += dt * 5;
    }
    token.wrongFlash = Math.max(0, token.wrongFlash - dt);
    if (token.wrongFlash > 0) token.object3d.rotation.z = Math.sin(token.wrongFlash * 35) * 0.12;
    else token.object3d.rotation.z = lerp(token.object3d.rotation.z, 0, clamp(dt * 10, 0, 1));
    if (token.sorted && token.sortAnim > 0 && token.sortTarget) {
      token.sortAnim += dt * 2.8;
      token.object3d.position.lerp(token.sortTarget, clamp(dt * 7, 0, 1));
      token.object3d.position.y += Math.sin(Math.min(1, token.sortAnim) * Math.PI) * dt * 2.1;
      token.object3d.rotation.y += dt * 5;
      const shrink = clamp(1 - Math.max(0, token.sortAnim - 0.55) * 1.8, 0.05, 1);
      token.object3d.scale.setScalar(shrink);
      if (token.sortAnim >= 1.2) {
        token.sortAnim = 0;
        token.object3d.visible = false;
      }
    }
  });
}

function updateScene(dt) {
  if (!state.webglReady) return;
  clockTime += dt;
  const localPointer = pointer.local;
  if (masher.visible) {
    masher.position.x = lerp(masher.position.x, localPointer.x, clamp(dt * 12, 0, 1));
    masher.position.z = lerp(masher.position.z, localPointer.z, clamp(dt * 12, 0, 1));
    const impact = pointer.down && pointer.mode === 'break' ? Math.abs(Math.sin(clockTime * 18)) * 0.48 : 0;
    masher.position.y = lerp(masher.position.y, 1.18 - impact, clamp(dt * 15, 0, 1));
  }
  if (nozzle.visible) {
    nozzle.position.x = lerp(nozzle.position.x, localPointer.x + 0.45, clamp(dt * 11, 0, 1));
    nozzle.position.z = lerp(nozzle.position.z, localPointer.z, clamp(dt * 11, 0, 1));
    nozzle.position.y = 1.12;
  }
  if (waterJet) {
    waterJet.visible = state.gs === 'RINSE' && pointer.down && pointer.mode === 'rinse';
    waterJet.material.opacity = 0.2 + Math.sin(clockTime * 19) * 0.035;
  }

  specimenIntact.scale.set(1 + state.breakProgress * 0.018, 1 - state.breakProgress * 0.22, 1 + state.breakProgress * 0.025);
  specimenIntact.rotation.y = Math.sin(state.breakProgress * Math.PI * 4) * 0.025;
  specimenClumps.scale.setScalar(1 - state.rinseProgress * 0.09 - state.filterProgress * 0.28);
  specimenClumps.children.forEach((child, index) => {
    child.position.y = Math.sin(clockTime * 3 + index) * Math.abs(state.trayShake) * 0.002;
  });

  sieveRig.rotation.z = lerp(sieveRig.rotation.z, state.trayShake * 0.0017, clamp(dt * 12, 0, 1));
  sieveRig.rotation.x = lerp(sieveRig.rotation.x, Math.abs(state.trayShake) * 0.0008, clamp(dt * 10, 0, 1));
  state.trayShake = lerp(state.trayShake, 0, clamp(dt * 7, 0, 1));

  if (slurry) {
    MAT.slurry.opacity = clamp(0.75 - state.rinseProgress * 0.22 - state.filterProgress * 0.48, 0.05, 0.75);
    slurry.scale.z = clamp(1 - state.filterProgress * 0.82, 0.14, 1);
    const positions = slurry.geometry.attributes.position;
    for (let index = 0; index < positions.count; index += 1) {
      positions.setZ(index, Math.sin(clockTime * 2.1 + index * 0.43) * 0.018);
    }
    positions.needsUpdate = true;
  }

  updateTokenScene(dt);
  waterParticles.update(dt);
  crumbParticles.update(dt);
  sparkleParticles.update(dt);

  if (state.gs === 'RINSE' && pointer.down && pointer.mode === 'rinse') {
    const localOrigin = new THREE.Vector3(nozzle.position.x - 0.34, 0.9, nozzle.position.z);
    const origin = labRoot.localToWorld(localOrigin);
    if (Math.random() < dt * 52) waterParticles.emit(origin, 5, 1.2, 0.58, 0.82, true);
  }
}

function update(dt) {
  if (state.paused || state.modal) return;
  state.totalElapsed += dt;
  if (['BREAK', 'RINSE', 'FILTER', 'SORT'].includes(state.gs)) {
    state.elapsed += dt;
    state.idleTime += dt;
  }
  state.feedbackTimer = Math.max(0, state.feedbackTimer - dt);
  if (state.feedbackTimer <= 0) ui.feedback.classList.remove('is-visible');

  if (state.gs === 'RINSE' && pointer.down && pointer.mode === 'rinse') {
    const rate = 0.19 * (1 + save.upgrades.jet * 0.35);
    state.rinseProgress = clamp(state.rinseProgress + dt * rate, 0, 1);
    if (state.rinseProgress >= 1) transitionToFilter();
  }
  if (state.gs === 'BREAK' && pointer.down && pointer.mode === 'break' && pointerHitsSpecimen()) {
    state.breakProgress = clamp(state.breakProgress + dt * 0.035 * (1 + save.upgrades.masher * 0.22), 0, 1);
    if (state.breakProgress >= 1) transitionToRinse();
  }
  updateScene(dt);
  updateUI();
}

// --- Input -----------------------------------------------------------------

function screenToGround(cssX, cssY) {
  if (!camera) return null;
  const ndc = new THREE.Vector2((cssX / view.width) * 2 - 1, -(cssY / view.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const point = new THREE.Vector3();
  if (!raycaster.ray.intersectPlane(groundPlane, point)) return null;
  return point;
}

function updatePointerWorld(cssX, cssY) {
  const world = screenToGround(cssX, cssY);
  if (!world) return;
  pointer.world.copy(world);
  pointer.local.copy(labRoot.worldToLocal(world.clone()));
}

function pointerInStage(x, y) {
  return x >= view.stage.x && x <= view.stage.x + view.stage.w && y >= view.stage.y && y <= view.stage.y + view.stage.h;
}

function pointerHitsSpecimen(cssX = pointer.cssX, cssY = pointer.cssY) {
  if (!specimenIntact?.visible) return false;
  const ndc = new THREE.Vector2((cssX / view.width) * 2 - 1, -(cssY / view.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  return raycaster.intersectObject(specimenIntact, true).length > 0;
}

function beginPhasePointer(x, y) {
  if (!pointerInStage(x, y)) return;
  pointer.down = true;
  pointer.mode = state.gs.toLowerCase();
  pointer.lastX = x;
  pointer.lastY = y;
  pointer.moved = 0;
  state.idleTime = 0;
  if (state.gs === 'BREAK') {
    if (!pointerHitsSpecimen(x, y)) return;
    const power = 0.16 * (1 + save.upgrades.masher * 0.22);
    state.breakProgress = clamp(state.breakProgress + power, 0, 1);
    emitLocal(crumbParticles, pointer.local.clone().setY(0.75), 7, 0.85, 0.55, 0.8);
    tone('crack');
    if (state.breakProgress >= 1) transitionToRinse();
  } else if (state.gs === 'RINSE') {
    state.rinseProgress = clamp(state.rinseProgress + 0.035 * (1 + save.upgrades.jet * 0.35), 0, 1);
  } else if (state.gs === 'FILTER') {
    state.filterProgress = clamp(state.filterProgress + 0.04, 0, 1);
  }
}

function pickToken(cssX, cssY) {
  const ndc = new THREE.Vector2((cssX / view.width) * 2 - 1, -(cssY / view.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hitboxes = state.tokens.filter((token) => !token.sorted && token.hitbox3d).map((token) => token.hitbox3d);
  const hit = raycaster.intersectObjects(hitboxes, false)[0];
  return hit ? state.tokens.find((token) => token.uid === hit.object.userData.tokenUid) : null;
}

function onPointerDown(event) {
  event.preventDefault();
  ensureAudio();
  canvas.focus({ preventScroll: true });
  pointer.cssX = event.clientX;
  pointer.cssY = event.clientY;
  pointer.id = event.pointerId;
  updatePointerWorld(pointer.cssX, pointer.cssY);
  try { canvas.setPointerCapture(event.pointerId); } catch { /* Synthetic pointers may not capture. */ }
  if (state.modal || !['BREAK', 'RINSE', 'FILTER', 'SORT'].includes(state.gs)) return;
  if (['BREAK', 'RINSE', 'FILTER'].includes(state.gs)) {
    beginPhasePointer(pointer.cssX, pointer.cssY);
    return;
  }
  const token = pickToken(pointer.cssX, pointer.cssY);
  if (!token) return;
  if (!token.revealed) {
    revealToken(token);
    return;
  }
  token.dragging = true;
  pointer.down = true;
  pointer.mode = 'token';
  pointer.dragTokenId = token.uid;
  pointer.lastX = pointer.cssX;
  pointer.lastY = pointer.cssY;
  token.object3d.position.y = 0.86;
  state.idleTime = 0;
}

function onPointerMove(event) {
  pointer.cssX = event.clientX;
  pointer.cssY = event.clientY;
  updatePointerWorld(pointer.cssX, pointer.cssY);
  if (!pointer.down || event.pointerId !== pointer.id) return;
  const dx = pointer.cssX - pointer.lastX;
  const dy = pointer.cssY - pointer.lastY;
  const travelled = Math.hypot(dx, dy);
  pointer.moved += travelled;
  state.idleTime = 0;

  if (pointer.mode === 'break' && pointerInStage(pointer.cssX, pointer.cssY) && pointerHitsSpecimen(pointer.cssX, pointer.cssY)) {
    const multiplier = 1 + save.upgrades.masher * 0.22;
    state.breakProgress = clamp(state.breakProgress + travelled / Math.max(220, view.stage.w * 0.58) * multiplier, 0, 1);
    if (travelled > 5) emitLocal(crumbParticles, pointer.local.clone().setY(0.72), 3, 0.75, 0.46, 0.6);
    if (state.breakProgress >= 1) transitionToRinse();
  } else if (pointer.mode === 'rinse' && pointerInStage(pointer.cssX, pointer.cssY)) {
    const multiplier = 0.72 + save.upgrades.jet * 0.26;
    state.rinseProgress = clamp(state.rinseProgress + travelled / Math.max(240, view.stage.w * 0.67) * multiplier, 0, 1);
    if (state.rinseProgress >= 1) transitionToFilter();
  } else if (pointer.mode === 'filter' && pointerInStage(pointer.cssX, pointer.cssY)) {
    const horizontal = Math.abs(dx);
    state.filterProgress = clamp(state.filterProgress + horizontal / Math.max(260, view.stage.w * 1.05), 0, 1);
    state.trayShake = clamp(dx * 0.75, -32, 32);
    if (Math.sign(dx) && Math.sign(dx) !== state.filterDirection) tone('sieve');
    if (Math.sign(dx)) state.filterDirection = Math.sign(dx);
    if (horizontal > 8) emitLocal(crumbParticles, new THREE.Vector3(pointer.local.x, 0.28, pointer.local.z), 3, 0.62, 0.5, 0.65, true);
    if (state.filterProgress >= 1) transitionToSort();
  } else if (pointer.mode === 'token') {
    const token = state.tokens.find((candidate) => candidate.uid === pointer.dragTokenId);
    if (token) {
      token.object3d.position.copy(pointer.local);
      token.object3d.position.y = 0.9;
      ui.binButtons.forEach((button) => {
        const rect = button.getBoundingClientRect();
        button.classList.toggle('is-target', pointer.cssX >= rect.left && pointer.cssX <= rect.right && pointer.cssY >= rect.top && pointer.cssY <= rect.bottom);
      });
    }
  }
  pointer.lastX = pointer.cssX;
  pointer.lastY = pointer.cssY;
}

function onPointerUp(event) {
  pointer.cssX = event.clientX;
  pointer.cssY = event.clientY;
  if (pointer.mode === 'token') {
    const token = state.tokens.find((candidate) => candidate.uid === pointer.dragTokenId);
    if (token) {
      const button = ui.binButtons.find((candidate) => {
        const rect = candidate.getBoundingClientRect();
        return pointer.cssX >= rect.left && pointer.cssX <= rect.right && pointer.cssY >= rect.top && pointer.cssY <= rect.bottom;
      });
      token.dragging = false;
      if (button) sortToken(token, button.dataset.category);
      else token.object3d.position.copy(token.home);
    }
  }
  ui.binButtons.forEach((button) => button.classList.remove('is-target'));
  pointer.down = false;
  pointer.mode = '';
  pointer.dragTokenId = null;
  try { canvas.releasePointerCapture(event.pointerId); } catch { /* Pointer may already be released. */ }
}

function sortFirstWithKeyboard(category) {
  if (state.gs !== 'SORT') return;
  const token = state.tokens.find((candidate) => !candidate.sorted);
  if (!token) return;
  if (!token.revealed) revealToken(token);
  else sortToken(token, category);
}

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  else shell.requestFullscreen?.().catch(() => {});
}

function onKeyDown(event) {
  const key = event.key.toLowerCase();
  const interactiveTarget = event.target instanceof Element
    ? event.target.closest('button, a[href], input, select, textarea, [role="button"]')
    : null;
  if (interactiveTarget && (key === 'enter' || key === ' ')) return;
  if (ui.dialog.open && ['arrowleft', 'arrowright', 'arrowup', 'arrowdown', 'pageup', 'pagedown', 'home', 'end'].includes(key)) return;
  if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown', ' ', 'enter', '1', '2', '3', 'm', 'c', 'h', 'f'].includes(key)) event.preventDefault();
  ensureAudio();
  if (key === 'm') return toggleMute();
  if (key === 'f') return toggleFullscreen();
  if (key === 'escape' && state.modal) return closeModal();
  if (key === 'h') return state.modal === 'HELP' ? closeModal() : openModal('HELP');
  if (key === 'c') return state.modal === 'COLLECTION' ? closeModal() : openModal('COLLECTION');
  if (state.modal) return;
  if (state.gs === 'REPORT' && key === 'enter') return finishReport();
  if (state.gs === 'GAMEOVER' && key === 'enter') return retrySample();
  if (state.gs === 'SHIFT_COMPLETE' && key === 'enter') return startNextShift();
  if (state.gs === 'SORT' && ['1', '2', '3'].includes(key)) return sortFirstWithKeyboard(['fruit', 'vegetable', 'odd'][Number(key) - 1]);
  if (!(key === ' ' || key.startsWith('arrow'))) return;
  if (state.gs === 'BREAK') {
    state.breakProgress = clamp(state.breakProgress + 0.23 * (1 + save.upgrades.masher * 0.22), 0, 1);
    emitLocal(crumbParticles, new THREE.Vector3(0, 0.72, 0), 7, 0.82, 0.5, 0.85);
    tone('crack');
    if (state.breakProgress >= 1) transitionToRinse();
  } else if (state.gs === 'RINSE') {
    state.rinseProgress = clamp(state.rinseProgress + 0.19 * (1 + save.upgrades.jet * 0.35), 0, 1);
    emitLocal(waterParticles, new THREE.Vector3(0, 0.9, 0), 8, 0.95, 0.48, 1.0, true);
    if (state.rinseProgress >= 1) transitionToFilter();
  } else if (state.gs === 'FILTER') {
    state.filterProgress = clamp(state.filterProgress + 0.22, 0, 1);
    state.trayShake = key === 'arrowleft' ? -28 : 28;
    tone('sieve');
    if (state.filterProgress >= 1) transitionToSort();
  }
  updateUI();
}

// --- Responsive camera and debug hooks -------------------------------------

function updateViewRects() {
  const rail = document.querySelector('.process-rail').getBoundingClientRect();
  const bins = ui.bins.getBoundingClientRect();
  const bottom = state.gs === 'SORT' ? bins.top - 8 : view.height - 12;
  view.stage = { x: 8, y: rail.bottom + 4, w: Math.max(1, view.width - 16), h: Math.max(1, bottom - rail.bottom - 8) };
  view.bins = Object.fromEntries(ui.binButtons.map((button) => {
    const rect = button.getBoundingClientRect();
    return [button.dataset.category, { x: rect.left, y: rect.top, w: rect.width, h: rect.height }];
  }));
}

function resize() {
  if (!renderer || !camera) return;
  const rect = canvas.getBoundingClientRect();
  view.width = Math.max(1, rect.width);
  view.height = Math.max(1, rect.height);
  view.portrait = view.height > view.width * 1.08;
  view.dpr = Math.min(devicePixelRatio || 1, view.portrait ? 1.5 : 2);
  renderer.setPixelRatio(view.dpr);
  renderer.setSize(view.width, view.height, false);

  const aspect = view.width / view.height;
  const orthoHeight = view.portrait ? 8.7 : view.height < 620 ? 6.4 : 5.8;
  camera.left = -orthoHeight * aspect / 2;
  camera.right = orthoHeight * aspect / 2;
  camera.top = orthoHeight / 2;
  camera.bottom = -orthoHeight / 2;
  camera.near = 0.1;
  camera.far = 60;
  camera.position.set(view.portrait ? 6.8 : 7.2, view.portrait ? 9.2 : 7.7, view.portrait ? 10.2 : 8.6);
  camera.lookAt(0, view.portrait ? 0.35 : 0.15, view.portrait ? 0.05 : 0.15);
  camera.updateProjectionMatrix();
  labRoot.rotation.y = view.portrait ? Math.PI / 2 : 0;
  updateViewRects();
  update3DBinPositions();
  updatePointerWorld(view.width * 0.5, view.height * 0.5);
}

function update3DBinPositions() {
  if (!camera) return;
  ui.binButtons.forEach((button) => {
    const rect = button.getBoundingClientRect();
    const world = screenToGround(rect.left + rect.width / 2, rect.top + Math.min(12, rect.height * 0.15));
    const bin = binMeshes[button.dataset.category];
    if (world && bin) {
      bin.position.copy(world);
      bin.position.y = 0.34;
      const scale = view.portrait ? 0.58 : 0.72;
      bin.scale.setScalar(scale);
      bin.rotation.y = view.portrait ? Math.PI / 2 : 0;
    }
  });
}

function projectToScreen(world) {
  const projected = world.clone().project(camera);
  return { x: (projected.x * 0.5 + 0.5) * view.width, y: (-projected.y * 0.5 + 0.5) * view.height };
}

function rectState(rect) {
  if (!rect) return null;
  return { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.w), h: Math.round(rect.h) };
}

function tokenHitboxState(token) {
  if (!token?.object3d) return null;
  const point = projectToScreen(token.object3d.getWorldPosition(new THREE.Vector3()));
  const size = view.portrait ? 68 : 62;
  return { x: Math.round(point.x - size / 2), y: Math.round(point.y - size / 2), w: size, h: size };
}

function breakTargetState(stage) {
  if (!specimenIntact) return {
    from: { x: Math.round(stage.x + stage.w * 0.42), y: Math.round(stage.y + stage.h * 0.32) },
    to: { x: Math.round(stage.x + stage.w * 0.58), y: Math.round(stage.y + stage.h * 0.34) }
  };
  const bounds = new THREE.Box3().setFromObject(specimenIntact);
  const corners = [];
  for (const x of [bounds.min.x, bounds.max.x]) {
    for (const y of [bounds.min.y, bounds.max.y]) {
      for (const z of [bounds.min.z, bounds.max.z]) corners.push(projectToScreen(new THREE.Vector3(x, y, z)));
    }
  }
  const left = Math.max(stage.x + 8, Math.min(...corners.map((point) => point.x)));
  const right = Math.min(stage.x + stage.w - 8, Math.max(...corners.map((point) => point.x)));
  const top = Math.max(stage.y + 8, Math.min(...corners.map((point) => point.y)));
  const bottom = Math.min(stage.y + stage.h - 8, Math.max(...corners.map((point) => point.y)));
  const candidates = [];
  for (let row = 1; row <= 5; row += 1) {
    for (let column = 1; column <= 9; column += 1) {
      const x = Math.round(lerp(left, right, column / 10));
      const y = Math.round(lerp(top, bottom, row / 6));
      if (pointerHitsSpecimen(x, y)) candidates.push({ x, y });
    }
  }
  if (!candidates.length) {
    const fallback = { x: Math.round((left + right) / 2), y: Math.round((top + bottom) / 2) };
    return { from: fallback, to: fallback };
  }
  const visualCenter = { x: (left + right) / 2, y: (top + bottom) / 2 };
  const from = candidates.reduce((best, point) => (
    Math.hypot(point.x - visualCenter.x, point.y - visualCenter.y)
      < Math.hypot(best.x - visualCenter.x, best.y - visualCenter.y) ? point : best
  ));
  const to = candidates.reduce((best, point) => (
    Math.hypot(point.x - from.x, point.y - from.y)
      > Math.hypot(best.x - from.x, best.y - from.y) ? point : best
  ));
  return {
    from,
    to
  };
}

function centerOf(rect) { return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 }; }
function modeName() {
  if (state.gs === 'GAMEOVER') return 'game_over';
  if (state.gs === 'SHIFT_COMPLETE') return 'shift_complete';
  return state.gs.toLowerCase();
}

function buildTextState() {
  updateViewRects();
  const current = state.tokens.find((token) => !token.sorted) || null;
  const collection = { fruit: 0, vegetable: 0, odd: 0, total: itemCount() };
  ITEMS.forEach((item) => { if (save.collection[item.id]) collection[item.category] += 1; });
  const items = state.tokens.filter((token) => !token.sorted || token.dragging).map((token) => {
    const item = ITEM_BY_ID[token.id];
    return {
      uid: token.uid,
      id: token.revealed ? token.id : 'muddy_token',
      label: token.revealed ? item.label : 'UNKNOWN',
      category: token.revealed ? item.category : 'hidden',
      state: token.sorted ? 'sorted' : token.dragging ? 'dragging' : token.revealed ? 'revealed' : 'muddy',
      hitbox: tokenHitboxState(token)
    };
  });
  const currentItem = current ? {
    uid: current.uid,
    id: current.revealed ? current.id : 'muddy_token',
    category: current.revealed ? ITEM_BY_ID[current.id].category : 'hidden',
    revealed: current.revealed,
    dragging: current.dragging,
    hitbox: tokenHitboxState(current)
  } : null;
  const stage = view.stage;
  const breakTargets = breakTargetState(stage);
  const primary = ui.dialogActions.querySelector('.is-primary')?.getBoundingClientRect();
  const primaryCenter = primary ? centerOf({ x: primary.left, y: primary.top, w: primary.width, h: primary.height }) : { x: view.width / 2, y: view.height * 0.72 };
  const completedInCurrentShift = state.shiftSamplesPassed;
  return {
    mode: modeName(),
    phase: state.gs,
    modal: state.modal,
    renderer: 'threejs-webgl',
    coordinates: { origin: 'top-left', x_axis: 'right', y_axis: 'down', units: 'canvas CSS pixels', canvas_css: { width: Math.round(view.width), height: Math.round(view.height) } },
    timer_ms: Math.round(state.elapsed * 1000),
    shift: state.shift,
    sample: state.sampleIndex + 1,
    sample_name: state.sampleName,
    coins: save.coins,
    round_coins: state.roundCoins,
    strikes: state.strikes,
    max_strikes: MAX_STRIKES,
    retry_count: state.retryCount,
    completed_samples: save.completedShifts * SHIFT_SAMPLES + completedInCurrentShift,
    specimen: {
      break_contacts: Math.round(state.breakProgress * 100),
      break_target: 100,
      rinse: Math.round(state.rinseProgress * 100),
      filter: Math.round(state.filterProgress * 100),
      items_total: state.tokens.length,
      items_revealed: state.tokens.filter((token) => token.revealed).length,
      items_sorted: state.sortedCount
    },
    sort: { correct: state.correctAttempts, attempts: state.attempts, accuracy: Number(currentAccuracy().toFixed(3)) },
    current_item: currentItem,
    items,
    bins: {
      fruit: rectState(view.bins.fruit),
      vegetable: rectState(view.bins.vegetable),
      odd: rectState(view.bins.odd)
    },
    collection,
    upgrades: {
      masher: save.upgrades.masher,
      pressure_jet: save.upgrades.jet,
      fine_mesh: save.upgrades.mesh,
      scanner: save.upgrades.scanner
    },
    targets: {
      start: { x: Math.round(view.width / 2), y: Math.round(view.height / 2) },
      break_from: breakTargets.from,
      break_to: breakTargets.to,
      rinse_from: { x: Math.round(stage.x + stage.w * 0.22), y: Math.round(stage.y + stage.h * 0.53) },
      rinse_to: { x: Math.round(stage.x + stage.w * 0.78), y: Math.round(stage.y + stage.h * 0.53) },
      filter_left: { x: Math.round(stage.x + stage.w * 0.24), y: Math.round(stage.y + stage.h * 0.55) },
      filter_right: { x: Math.round(stage.x + stage.w * 0.76), y: Math.round(stage.y + stage.h * 0.55) },
      retry_or_next: { x: Math.round(primaryCenter.x), y: Math.round(primaryCenter.y) },
      first_token: currentItem?.hitbox ? centerOf(currentItem.hitbox) : null,
      fruit_bin: centerOf(view.bins.fruit),
      vegetable_bin: centerOf(view.bins.vegetable),
      odd_bin: centerOf(view.bins.odd)
    }
  };
}

window.render_game_to_text = () => JSON.stringify(buildTextState());
window.__gfState = () => buildTextState();
window.__gfPerf = () => ({
  calls: renderer?.info.render.calls ?? 0,
  triangles: renderer?.info.render.triangles ?? 0,
  points: renderer?.info.render.points ?? 0,
  geometries: renderer?.info.memory.geometries ?? 0,
  textures: renderer?.info.memory.textures ?? 0,
  pixel_ratio: renderer?.getPixelRatio() ?? 1
});
window.__shitSifterVersion = '1.0.0-3d';
window.advanceTime = (milliseconds) => {
  const steps = Math.max(1, Math.ceil(milliseconds / (1000 / 60)));
  const dt = milliseconds / 1000 / steps;
  for (let index = 0; index < steps; index += 1) update(dt);
  if (renderer && scene && camera) renderer.render(scene, camera);
};

// --- Boot ------------------------------------------------------------------

function installEvents() {
  canvas.addEventListener('pointerdown', onPointerDown, { passive: false });
  canvas.addEventListener('pointermove', onPointerMove, { passive: false });
  canvas.addEventListener('pointerup', onPointerUp, { passive: false });
  canvas.addEventListener('pointercancel', onPointerUp, { passive: false });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  window.addEventListener('keydown', onKeyDown, { passive: false });
  ui.help.addEventListener('click', () => openModal('HELP'));
  ui.collectionButton.addEventListener('click', () => openModal('COLLECTION'));
  ui.mute.addEventListener('click', toggleMute);
  ui.dialogClose.addEventListener('click', () => {
    if (state.modal) closeModal();
  });
  ui.dialog.addEventListener('cancel', (event) => {
    if (!state.modal) event.preventDefault();
    else closeModal();
  });
  ui.dialog.addEventListener('click', (event) => {
    if (event.target === ui.dialog && state.modal) closeModal();
  });
  ui.binButtons.forEach((button) => button.addEventListener('click', () => {
    if (state.gs === 'SORT') sortFirstWithKeyboard(button.dataset.category);
  }));
  document.addEventListener('visibilitychange', () => { state.paused = document.hidden; });
  document.addEventListener('fullscreenchange', resize);
  window.visualViewport?.addEventListener('resize', resize);
  new ResizeObserver(resize).observe(shell);
}

let previousTime = performance.now();
function frame(now) {
  const dt = Math.min(0.1, Math.max(0, (now - previousTime) / 1000));
  previousTime = now;
  if (!document.hidden) update(dt);
  if (renderer && scene && camera) renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

function hideBoot() {
  ui.boot.classList.add('is-leaving');
  setTimeout(() => { ui.boot.hidden = true; }, REDUCED_MOTION ? 150 : 440);
}

try {
  initScene();
  installEvents();
  resize();
  if (save.pendingShiftComplete) {
    state.sampleIndex = SHIFT_SAMPLES - 1;
    state.sampleName = SAMPLE_NAMES[state.sampleIndex];
    state.tokens = [];
    setGameState('SHIFT_COMPLETE');
    renderStateDialog();
  } else {
    startSample();
  }
  setupPreloads();
  syncSceneVisibility();
  updateUI();
  hideBoot();
  requestAnimationFrame(frame);
} catch (error) {
  console.error('Unable to start the 3D laboratory:', error);
  ui.bootCopy.textContent = 'This browser could not create the 3D laboratory. Enable WebGL hardware acceleration, then reload.';
  announce('Unable to start 3D rendering. WebGL is required.');
}
