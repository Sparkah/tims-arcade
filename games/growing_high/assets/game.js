import * as THREE from "./three.module.js";
import { BALANCE_STORAGE_KEY, DEFAULT_CROP_DEFS, DEFAULT_GAME_SETTINGS, cloneBalance } from "./balance-data.js?v=20260708_irrigation_grid";

(() => {
  "use strict";

  const canvas = document.getElementById("game");
  const sceneCanvas = document.getElementById("scene3d");
  const ctx = canvas.getContext("2d");

  const STORAGE_KEY = "growing-high-prototype-v2";
  const COLS = 56;
  const ROWS = 36;
  const ROOF_PIXEL_WIDTH = 560;
  const ROOF_PIXEL_HEIGHT = 360;
  const ROOT_PIXEL_SCALE = ROOF_PIXEL_WIDTH / COLS;
  const CELL_SOIL_LOAD = 0.8;
  const CELL_WATER_LOAD = 0.25;
  const SPRINKLER_LOAD = 18;
  const PEOPLE_LOAD = 44;
  const TOOL_LOAD = 18;
  const DAY_MINUTES = 1440;
  const CLOCK_STEP_MINUTES = 10;
  const DAY_START_MINUTES = 7 * 60;
  const DAY_END_MINUTES = 17 * 60;
  const SOIL_BRUSH_RADIUS = 24;
  const ERASER_RADIUS = 26;
  const WATER_RADIUS = 42;
  const WEED_SPAWN_CHANCE = 0.22;
  const IRRIGATION_GRID_STEP = 4;
  const IRRIGATION_SNAP_DISTANCE = 3.15;
  const IRRIGATION_SOCKET_COLS = irrigationAxisValues(COLS);
  const IRRIGATION_SOCKET_ROWS = irrigationAxisValues(ROWS);

  const cropDefs = cloneBalance(DEFAULT_CROP_DEFS);
  const gameSettings = cloneBalance(DEFAULT_GAME_SETTINGS);
  let balanceSource = "defaults";
  let balanceLabel = "Default Section 3 table";
  applyBalanceOverrides();

  const toolDefs = [
    { id: "soil", label: "Soil", key: "S" },
    { id: "erase", label: "Erase", key: "E" },
    { id: "seed", label: "Seed", key: "P" },
    { id: "irrigation", label: "Irrigate", key: "I" },
    { id: "harvest", label: "Harvest", key: "H" },
  ];

  const seasons = ["Spring", "Summer", "Autumn", "Winter"];
  const seasonMonths = {
    Spring: [1, 2, 3],
    Summer: [4, 5, 6],
    Autumn: [7, 8, 9],
    Winter: [10, 11, 12],
  };

  const state = createInitialState();
  const input = {
    pointerDown: false,
    lastCellKey: "",
    x: 0,
    y: 0,
  };

  const view = {
    width: 0,
    height: 0,
    dpr: 1,
    roof: { x: 0, y: 0, w: 0, h: 0, cell: 1 },
    panel: { x: 0, y: 0, w: 0, h: 0 },
    buttons: [],
  };

  let lastFrame = performance.now();
  let saveTimer = 0;
  const CELL_3D = 0.145;
  const PICK_PLANE_Y = 0.08;
  const three = {
    initialized: false,
    renderer: null,
    scene: null,
    camera: null,
    world: null,
    mat: {},
    geo: {},
    colorMats: new Map(),
    yAxis: new THREE.Vector3(0, 1, 0),
    raycaster: new THREE.Raycaster(),
    pointer: new THREE.Vector2(),
    pickPlane: new THREE.Plane(new THREE.Vector3(0, 1, 0), -PICK_PLANE_Y),
    pickHit: new THREE.Vector3(),
    screenPoint: new THREE.Vector3(),
  };
  const audio = {
    ctx: null,
    master: null,
    musicTimer: 0,
    musicStep: 0,
    muted: false,
  };

  function ensureAudio() {
    if (audio.muted) return null;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    if (!audio.ctx) {
      audio.ctx = new AudioContextClass();
      audio.master = audio.ctx.createGain();
      audio.master.gain.value = 0.18;
      audio.master.connect(audio.ctx.destination);
    }
    if (audio.ctx.state === "suspended") {
      audio.ctx.resume().catch(() => {});
    }
    startMusic();
    return audio.ctx;
  }

  function playTone(freq, duration = 0.12, type = "sine", gain = 0.04) {
    const actx = ensureAudio();
    if (!actx || !audio.master) return;
    const osc = actx.createOscillator();
    const amp = actx.createGain();
    const now = actx.currentTime;
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    amp.gain.setValueAtTime(0.0001, now);
    amp.gain.exponentialRampToValueAtTime(gain, now + 0.015);
    amp.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(amp).connect(audio.master);
    osc.start(now);
    osc.stop(now + duration + 0.03);
  }

  function playUiSound(kind = "tap") {
    if (kind === "plant") playTone(440, 0.11, "triangle", 0.05);
    else if (kind === "water") playTone(660, 0.08, "sine", 0.035);
    else if (kind === "market") playTone(520, 0.18, "triangle", 0.045);
    else playTone(330, 0.08, "square", 0.025);
  }

  function startMusic() {
    if (audio.musicTimer || !audio.ctx || !audio.master) return;
    // Guard before the first background music note so playTone() cannot re-enter startup.
    audio.musicTimer = -1;
    const notes = [196, 247, 294, 330, 247, 220, 262, 330];
    const scheduleMusic = () => {
      if (!audio.ctx || audio.ctx.state !== "running") return;
      const note = notes[audio.musicStep % notes.length];
      audio.musicStep += 1;
      playTone(note, 0.22, "sine", 0.018);
    };
    audio.musicTimer = window.setInterval(scheduleMusic, 1500) || -1;
    scheduleMusic();
  }

  function pauseAudio() {
    if (audio.ctx && audio.ctx.state === "running") {
      audio.ctx.suspend().catch(() => {});
    }
  }

  function resumeAudio() {
    if (!document.hidden && audio.ctx && audio.ctx.state === "suspended") {
      audio.ctx.resume().catch(() => {});
    }
  }

  function registerPlatformAudioPause() {
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) pauseAudio();
      else resumeAudio();
    });
    try {
      window.ysdk?.on?.("game_api_pause", pauseAudio);
      window.ysdk?.on?.("game_api_resume", resumeAudio);
    } catch (_) {
      // Platform SDK events are optional outside Yandex.
    }
  }

  function signalPlatformReady() {
    try {
      const loadingApi = window.ysdk?.features?.LoadingAPI || window.LoadingAPI;
      if (loadingApi && typeof loadingApi.ready === "function") loadingApi.ready();
    } catch (_) {
      // LoadingAPI is absent on the gallery site.
    }
  }

  function maybeAutostart() {
    const params = new URLSearchParams(window.location.search);
    const previewAutostart = params.has("adminPreview");
    if ((window.__GF_AUTOSTART || previewAutostart) && !window._silent && state.mode === "title") {
      startNewGame();
    }
  }

  function initThree() {
    if (three.initialized || !sceneCanvas) return;
    three.renderer = new THREE.WebGLRenderer({
      canvas: sceneCanvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    three.renderer.shadowMap.enabled = true;
    three.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    three.renderer.outputColorSpace = THREE.SRGBColorSpace;
    three.scene = new THREE.Scene();
    three.scene.background = new THREE.Color(0xb9e6f4);
    three.scene.fog = new THREE.Fog(0xb9e6f4, 10, 28);
    three.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 60);
    three.world = new THREE.Group();
    three.scene.add(three.world);

    three.geo.box = new THREE.BoxGeometry(1, 1, 1);
    three.geo.cylinder = new THREE.CylinderGeometry(1, 1, 1, 18);
    three.geo.sphere = new THREE.SphereGeometry(1, 18, 12);
    three.geo.cone = new THREE.ConeGeometry(1, 1, 18);
    three.geo.torus = new THREE.TorusGeometry(1, 0.035, 8, 42);
    three.geo.plane = new THREE.PlaneGeometry(1, 1);

    three.mat.roof = standardMat(0xd8d0bc, 0.76, 0.02);
    three.mat.roofEdge = standardMat(0xa88b63, 0.82, 0.03);
    three.mat.tile = standardMat(0xcfc9b8, 0.9, 0.01);
    three.mat.soil = standardMat(0x694427, 0.96, 0.0);
    three.mat.soilWet = standardMat(0x4e3826, 0.92, 0.0);
    three.mat.water = transparentMat(0x3da7bd, 0.3, 0.18);
    three.mat.compost = transparentMat(0x609142, 0.62, 0.18);
    three.mat.gridLine = standardMat(0x45524e, 0.75, 0.0);
    three.mat.pipe = standardMat(0xcfd9db, 0.32, 0.55);
    three.mat.pipeDark = standardMat(0x71898d, 0.38, 0.45);
    three.mat.pipeWater = transparentMat(0x48c9e2, 0.58, 0.1);
    three.mat.irrigationGrid = transparentMat(0x2b7478, 0.22, 0.0);
    three.mat.irrigationSocketDim = transparentMat(0x405955, 0.34, 0.0);
    three.mat.irrigationSocketValid = standardMat(0x24a9bd, 0.38, 0.16);
    three.mat.irrigationSocketHot = standardMat(0x0f86a0, 0.3, 0.2);
    three.mat.irrigationSocketBad = standardMat(0xb95543, 0.48, 0.08);
    three.mat.rootGood = transparentMat(0x69c674, 0.34, 0.0);
    three.mat.rootBad = transparentMat(0xd95f4d, 0.36, 0.0);
    three.mat.weed = standardMat(0x3c783d, 0.88, 0.0);
    three.mat.harvest = standardMat(0xf6c75f, 0.42, 0.15);
    three.mat.shadow = transparentMat(0x24302e, 0.2, 0.0);
    three.mat.glass = transparentMat(0xeaf8ff, 0.4, 0.12);
    three.mat.volunteerA = standardMat(0x4f7ecb, 0.68, 0.08);
    three.mat.volunteerB = standardMat(0xd98845, 0.7, 0.08);
    three.mat.volunteerC = standardMat(0x6f9f59, 0.7, 0.08);

    const hemi = new THREE.HemisphereLight(0xeaf7ff, 0x82684f, 2.4);
    three.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff1bf, 2.8);
    sun.position.set(-4.5, 9.5, 6.5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 24;
    sun.shadow.camera.left = -8;
    sun.shadow.camera.right = 8;
    sun.shadow.camera.top = 8;
    sun.shadow.camera.bottom = -8;
    three.scene.add(sun);
    three.initialized = true;
  }

  function standardMat(color, roughness = 0.74, metalness = 0.02) {
    return new THREE.MeshStandardMaterial({ color, roughness, metalness });
  }

  function transparentMat(color, opacity, metalness = 0.0) {
    return new THREE.MeshStandardMaterial({
      color,
      opacity,
      transparent: true,
      depthWrite: false,
      roughness: 0.48,
      metalness,
    });
  }

  function colorMat(color, roughness = 0.74) {
    const key = `${color}:${roughness}`;
    if (!three.colorMats.has(key)) {
      three.colorMats.set(key, standardMat(new THREE.Color(color), roughness, 0.02));
    }
    return three.colorMats.get(key);
  }

  function boardX(col) {
    return (col - (COLS - 1) / 2) * CELL_3D;
  }

  function boardZ(row) {
    return (row - (ROWS - 1) / 2) * CELL_3D;
  }

  function sync3DCamera() {
    if (!three.initialized) return;
    const compact = view.width < 820;
    three.camera.aspect = view.width / Math.max(1, view.height);
    three.camera.fov = compact ? 78 : 46;
    three.camera.updateProjectionMatrix();

    const worldX = compact ? 0 : -1.25;
    const lookX = compact ? 0 : 0;
    three.world.position.set(worldX, 0, compact ? 0.15 : 0);
    three.camera.position.set(lookX + (compact ? 0.08 : 0.45), compact ? 8.7 : 6.9, compact ? 10.2 : 7.4);
    three.camera.lookAt(lookX, 0.05, 0);
    three.camera.updateMatrixWorld(true);
    three.world.updateMatrixWorld(true);
  }

  function clearThreeGroup(group) {
    while (group.children.length) {
      group.remove(group.children[group.children.length - 1]);
    }
  }

  function meshBox(group, x, y, z, sx, sy, sz, material, cast = false, receive = true) {
    const mesh = new THREE.Mesh(three.geo.box, material);
    mesh.position.set(x, y, z);
    mesh.scale.set(sx, sy, sz);
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
    group.add(mesh);
    return mesh;
  }

  function meshSphere(group, x, y, z, scale, material, cast = true) {
    const mesh = new THREE.Mesh(three.geo.sphere, material);
    mesh.position.set(x, y, z);
    mesh.scale.set(scale, scale, scale);
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }

  function meshCylinder(group, x, y, z, radius, height, material, cast = true) {
    const mesh = new THREE.Mesh(three.geo.cylinder, material);
    mesh.position.set(x, y, z);
    mesh.scale.set(radius, height, radius);
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }

  function cylinderBetween(group, from, to, radius, material) {
    const start = new THREE.Vector3(from.x, from.y, from.z);
    const end = new THREE.Vector3(to.x, to.y, to.z);
    const mid = start.clone().add(end).multiplyScalar(0.5);
    const dir = end.clone().sub(start);
    const length = dir.length();
    if (length <= 0.001) return null;
    const mesh = new THREE.Mesh(three.geo.cylinder, material);
    mesh.position.copy(mid);
    mesh.scale.set(radius, length, radius);
    mesh.quaternion.setFromUnitVectors(three.yAxis, dir.normalize());
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }

  function createInitialState() {
    const grid = [];
    for (let r = 0; r < ROWS; r += 1) {
      for (let c = 0; c < COLS; c += 1) {
        grid.push({ soil: 0, watered: false, sprinkler: false, compost: 0 });
      }
    }

    return {
      mode: "title",
      phase: "planning",
      year: 1,
      month: 1,
      weekInMonth: 1,
      absoluteWeek: 1,
      day: 0,
      minutes: DAY_START_MINUTES,
      clockAccumulator: 0,
      money: 260,
      roofLimit: 980,
      overloadDays: 0,
      collapseCount: 0,
      repairDaysLeft: 0,
      selectedTool: "soil",
      selectedSeed: "carrot",
      showForecast: false,
      balanceSource,
      balanceLabel,
      fast: false,
      weather: "Bright start, light rain later",
      marketMood: "Local demand favours quick greens",
      message: "Paint soil in broad strokes, plant inside circular root space, then pass the week.",
      grid,
      plants: [],
      weeds: [],
      inventory: [],
      marketOffers: [],
      compost: 0,
      toolDiscount: 0,
      pollinatorBonus: 0,
      soilBonus: 0,
      mulchBonus: 0,
      hubReputation: 0,
      favour: {
        restaurant: 0,
        carpenter: 0,
        social: 0,
        engineer: 0,
        mushroom: 0,
        beekeeper: 0,
      },
      volunteers: [
        { name: "Maya", task: "idle", x: 0.35, y: 0.44, bob: 0, actionTimer: 0 },
        { name: "Jun", task: "idle", x: 0.68, y: 0.58, bob: 1.5, actionTimer: 0 },
      ],
      prices: {},
      priceMemory: {},
      rng: 12891,
      stats: {
        harvested: 0,
        sold: 0,
        collapses: 0,
        donated: 0,
        watered: 0,
        weeded: 0,
        volunteerHarvested: 0,
        npcGifts: 0,
        stallSales: 0,
        consultedFarms: 0,
      },
    };
  }

  function startNewGame() {
    playUiSound("plant");
    const fresh = createInitialState();
    for (const key of Object.keys(state)) {
      delete state[key];
    }
    Object.assign(state, fresh);
    state.mode = "game";
    state.prices = generatePrices();
    saveGame();
  }

  function continueGame() {
    const loaded = loadGame();
    if (loaded) {
      for (const key of Object.keys(state)) {
        delete state[key];
      }
      Object.assign(state, loaded);
      state.mode = "game";
      hydrateState();
    } else {
      startNewGame();
    }
  }

  function hydrateState() {
    if (!Array.isArray(state.grid) || state.grid.length !== COLS * ROWS) {
      state.grid = createInitialState().grid;
    }
    if (!state.prices || Object.keys(state.prices).length === 0) {
      state.prices = generatePrices();
    }
    if (!Array.isArray(state.plants)) state.plants = [];
    if (!Array.isArray(state.weeds)) state.weeds = [];
    if (!Array.isArray(state.inventory)) state.inventory = [];
    if (!Array.isArray(state.marketOffers)) state.marketOffers = [];
    if (!Array.isArray(state.volunteers)) state.volunteers = createInitialState().volunteers;
    const defaults = createInitialState();
    state.favour = { ...defaults.favour, ...(state.favour || {}) };
    state.stats = { ...defaults.stats, ...(state.stats || {}) };
    state.toolDiscount = state.toolDiscount || 0;
    state.pollinatorBonus = state.pollinatorBonus || 0;
    state.soilBonus = state.soilBonus || 0;
    state.mulchBonus = state.mulchBonus || 0;
    state.hubReputation = state.hubReputation || 0;
    state.priceMemory = state.priceMemory || {};
    state.showForecast = Boolean(state.showForecast);
    state.clockAccumulator = Number.isFinite(state.clockAccumulator) ? state.clockAccumulator : 0;
    const irrigationMigrated = normalizeIrrigationPipes();
    if (state.balanceSource !== balanceSource) {
      state.priceMemory = {};
      state.prices = generatePrices();
    }
    state.balanceSource = balanceSource;
    state.balanceLabel = balanceLabel;
    for (let i = 0; i < state.volunteers.length; i += 1) {
      const fallback = defaults.volunteers[i % defaults.volunteers.length];
      state.volunteers[i] = {
        ...fallback,
        ...state.volunteers[i],
        actionTimer: state.volunteers[i].actionTimer || 0,
      };
    }
    for (const plant of state.plants) {
      if (!Number.isFinite(plant.col) || !Number.isFinite(plant.row)) {
        plant.col = Math.max(0, Math.min(COLS - 1, Number(plant.col) || COLS / 2));
        plant.row = Math.max(0, Math.min(ROWS - 1, Number(plant.row) || ROWS / 2));
      }
    }
    normalizeSelectedSeed();
    state.message = state.message || "Keep the rooftop productive without overloading the roof.";
    if (irrigationMigrated) saveGame();
  }

  function saveGame() {
    try {
      const payload = JSON.stringify(state);
      localStorage.setItem(STORAGE_KEY, payload);
    } catch (_) {
      // Storage can be unavailable in private sessions; the game remains playable.
    }
  }

  function loadGame() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function hasSave() {
    try {
      return Boolean(localStorage.getItem(STORAGE_KEY));
    } catch (_) {
      return false;
    }
  }

  function applyBalanceOverrides() {
    const urlPayload = readBalanceUrlPayload();
    const storedPayload = readStoredBalancePayload();
    if (urlPayload && applyBalancePayload(urlPayload, "url")) return;
    if (storedPayload) applyBalancePayload(storedPayload, "localStorage");
  }

  function readStoredBalancePayload() {
    try {
      const raw = localStorage.getItem(BALANCE_STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function readBalanceUrlPayload() {
    try {
      const params = new URLSearchParams(window.location.search);
      const encoded = params.get("balance");
      if (!encoded) return null;
      const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(encoded.length / 4) * 4, "=");
      const binary = atob(base64);
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      return JSON.parse(new TextDecoder().decode(bytes));
    } catch (_) {
      return null;
    }
  }

  function applyBalancePayload(payload, source) {
    if (!payload || typeof payload !== "object") return false;
    let applied = 0;
    if (payload.crops && typeof payload.crops === "object") {
      for (const [key, override] of Object.entries(payload.crops)) {
        if (!cropDefs[key] || !override || typeof override !== "object") continue;
        const target = cropDefs[key];
        for (const field of ["growDays", "seedCost", "saleBase", "saplingLoad", "rootRadius", "harvestLoad", "fruitLoad", "fruitInterval", "shelfLife"]) {
          if (override[field] === undefined || override[field] === "") continue;
          const value = Number(override[field]);
          if (!Number.isFinite(value) || value < 0) continue;
          if (field === "fruitLoad" && value === 0) {
            delete target.fruitLoad;
            continue;
          }
          if (field === "fruitInterval" && value === 0) {
            delete target.fruitInterval;
            continue;
          }
          target[field] = Math.max(field === "seedCost" ? 0 : 1, Math.round(value));
        }
        if (Array.isArray(override.seasons)) {
          const cleanSeasons = override.seasons.filter((season) => ["Spring", "Summer", "Autumn", "Winter"].includes(season));
          if (cleanSeasons.length) target.seasons = cleanSeasons;
        }
        if (typeof override.name === "string" && override.name.trim()) target.name = override.name.trim().slice(0, 32);
        if (typeof override.short === "string" && override.short.trim()) target.short = override.short.trim().slice(0, 16);
        applied += 1;
      }
    }

    const settingsApplied = applySettingsPayload(payload.settings);
    if (settingsApplied) applied += 1;
    if (!applied) return false;
    balanceSource = source;
    balanceLabel = typeof payload.label === "string" && payload.label.trim()
      ? payload.label.trim().slice(0, 60)
      : source === "url" ? "Shared balance draft" : "Browser balance draft";
    return true;
  }

  function applySettingsPayload(settings) {
    if (!settings || typeof settings !== "object") return false;
    let applied = false;
    for (const [key, fallback] of Object.entries(DEFAULT_GAME_SETTINGS)) {
      if (settings[key] === undefined || settings[key] === "") continue;
      const value = Number(settings[key]);
      if (!Number.isFinite(value)) continue;
      if (key === "midweekDays") gameSettings[key] = clampNumber(Math.round(value), 1, 6);
      else if (key === "volunteerMoveSpeed") gameSettings[key] = clampNumber(value, 0.15, 2.5);
      else gameSettings[key] = clampNumber(value, 0.1, Math.max(30, fallback * 8));
      applied = true;
    }
    return applied;
  }

  function clampNumber(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function rand() {
    state.rng = (state.rng * 1664525 + 1013904223) >>> 0;
    return state.rng / 4294967296;
  }

  function randomBetween(min, max) {
    return min + (max - min) * rand();
  }

  function currentSeason() {
    for (const season of seasons) {
      if (seasonMonths[season].includes(state.month)) return season;
    }
    return "Spring";
  }

  function generatePrices() {
    const season = currentSeason();
    const prices = {};
    const nextMemory = {};
    for (const def of Object.values(cropDefs)) {
      const inSeason = def.seasons.includes(season);
      const min = inSeason ? 0.9 : 0.5;
      const max = inSeason ? 1.5 : 1.2;
      const rawMultiplier = randomBetween(min, max);
      const previous = state.priceMemory?.[def.key] || 1;
      const multiplier = previous * 0.62 + rawMultiplier * 0.38;
      nextMemory[def.key] = multiplier;
      prices[def.key] = Math.max(1, Math.round(def.saleBase * multiplier));
    }
    state.priceMemory = nextMemory;
    return prices;
  }

  function priceBandFor(def, season = currentSeason()) {
    const inSeason = def.seasons.includes(season);
    return {
      inSeason,
      min: inSeason ? 0.9 : 0.5,
      max: inSeason ? 1.5 : 1.2,
    };
  }

  function priceForecastRows(keys = availableCropKeys()) {
    return keys
      .filter((key) => cropDefs[key])
      .map((key) => {
        const def = cropDefs[key];
        const price = state.prices[key] || def.saleBase;
        const band = priceBandFor(def);
        const percent = def.saleBase > 0 ? price / def.saleBase : 1;
        return {
          key,
          name: def.name,
          short: def.short,
          price,
          basePrice: def.saleBase,
          percent,
          percentLabel: `${Math.round(percent * 100)}%`,
          rangeLabel: `${Math.round(band.min * 100)}-${Math.round(band.max * 100)}%`,
          seasonLabel: band.inSeason ? "in season" : "off season",
          seasons: def.seasons.join("/"),
          growDays: def.growDays,
          rootRadius: def.rootRadius || 12,
          shelfDays: def.shelfLife,
        };
      });
  }

  function availableCropKeys() {
    const keys = ["carrot", "bokChoy", "cilantro", "parsnip"];
    if (state.absoluteWeek >= 4) keys.push("onion", "redCabbage", "potato", "lettuce");
    if (state.absoluteWeek >= 12) keys.push("pumpkin", "vigna", "tomato", "cucumber", "pepper", "eggplant");
    if (state.absoluteWeek >= 16) keys.push("leek", "garlic");
    return keys.filter((key) => cropDefs[key]);
  }

  function normalizeSelectedSeed() {
    const keys = availableCropKeys();
    if (!keys.includes(state.selectedSeed)) {
      state.selectedSeed = keys[0] || "carrot";
    }
  }

  function resize() {
    const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(320, Math.round(rect.width));
    const height = Math.max(420, Math.round(rect.height));
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    view.width = width;
    view.height = height;
    view.dpr = dpr;
  }

  function cellAt(col, row) {
    return state.grid[row * COLS + col];
  }

  function inBounds(col, row) {
    return col >= 0 && row >= 0 && col < COLS && row < ROWS;
  }

  function sampleKey(col, row) {
    return `${Math.round(col)}:${Math.round(row)}`;
  }

  function clampSamplePoint(col, row) {
    return {
      col: Math.max(0, Math.min(COLS - 1, col)),
      row: Math.max(0, Math.min(ROWS - 1, row)),
    };
  }

  function sampleRadiusForPixels(px) {
    return Math.max(1, (px || 12) / ROOT_PIXEL_SCALE);
  }

  function cropRootRadiusSamples(cropKey) {
    return sampleRadiusForPixels(cropDefs[cropKey]?.rootRadius || 12);
  }

  function sampleDistance(aCol, aRow, bCol, bRow) {
    return Math.hypot(aCol - bCol, aRow - bRow);
  }

  function samplesInCircle(col, row, radiusSamples) {
    const cells = [];
    const minCol = Math.floor(col - radiusSamples);
    const maxCol = Math.ceil(col + radiusSamples);
    const minRow = Math.floor(row - radiusSamples);
    const maxRow = Math.ceil(row + radiusSamples);
    for (let r = minRow; r <= maxRow; r += 1) {
      for (let c = minCol; c <= maxCol; c += 1) {
        if (!inBounds(c, r)) continue;
        if (sampleDistance(c + 0.5, r + 0.5, col, row) <= radiusSamples) {
          cells.push({ col: c, row: r });
        }
      }
    }
    return cells;
  }

  function rootCells(plant) {
    return samplesInCircle(plant.col, plant.row, cropRootRadiusSamples(plant.crop));
  }

  function plantAt(col, row) {
    return state.plants.find((plant) => {
      return sampleDistance(col, row, plant.col, plant.row) <= cropRootRadiusSamples(plant.crop);
    }) || null;
  }

  function canPlantAt(col, row) {
    if (!inBounds(Math.round(col), Math.round(row))) return false;
    const radius = cropRootRadiusSamples(state.selectedSeed);
    const root = samplesInCircle(col, row, radius);
    if (!root.length) return false;
    for (const sample of root) {
      const cell = cellAt(sample.col, sample.row);
      if (!cell.soil || hasWeed(sample.col, sample.row)) return false;
    }
    for (const plant of state.plants) {
      const otherRadius = cropRootRadiusSamples(plant.crop);
      if (sampleDistance(col, row, plant.col, plant.row) < radius + otherRadius) return false;
    }
    return true;
  }

  function isCellIrrigated(col, row) {
    const cell = cellAt(col, row);
    if (cell.watered) return true;
    const radius = sampleRadiusForPixels(WATER_RADIUS);
    const minCol = Math.floor(col - radius);
    const maxCol = Math.ceil(col + radius);
    const minRow = Math.floor(row - radius);
    const maxRow = Math.ceil(row + radius);
    for (let r = minRow; r <= maxRow; r += 1) {
      for (let c = minCol; c <= maxCol; c += 1) {
        if (inBounds(c, r) && cellAt(c, r).sprinkler && sampleDistance(c, r, col, row) <= radius) return true;
      }
    }
    return false;
  }

  function isPlantWatered(plant) {
    return rootCells(plant).every((cell) => isCellIrrigated(cell.col, cell.row));
  }

  function weedAt(col, row) {
    return state.weeds.find((weed) => weed.col === col && weed.row === row) || null;
  }

  function hasWeed(col, row) {
    return Boolean(weedAt(col, row));
  }

  function removeWeedAt(col, row, source = "player") {
    const before = state.weeds.length;
    state.weeds = state.weeds.filter((weed) => weed.col !== col || weed.row !== row);
    if (state.weeds.length === before) return false;
    state.stats.weeded += 1;
    state.compost += source === "volunteer" ? 1 : 0;
    state.message = source === "volunteer" ? "Volunteer cleared weeds before they slowed growth." : "Weeds cleared from the bed.";
    saveGame();
    return true;
  }

  function plantHasWeeds(plant) {
    return rootCells(plant).some((cell) => hasWeed(cell.col, cell.row));
  }

  function plantLoad(plant) {
    const def = cropDefs[plant.crop];
    if (!def) return 0;
    const t = Math.max(0, Math.min(1, plant.growthDays / def.growDays));
    let load = t < 0.35 ? 2 + def.saplingLoad * t : def.saplingLoad + (def.harvestLoad - def.saplingLoad) * t;
    if (def.fruitLoad && plant.fruitReady) load += def.fruitLoad;
    return load / 10;
  }

  function plantStage(plant) {
    const def = cropDefs[plant.crop];
    if (!def) return "unknown";
    if (def.fruitLoad && plant.growthDays >= def.growDays) {
      return plant.fruitReady ? "harvestable" : "mature";
    }
    const t = plant.growthDays / def.growDays;
    if (t >= 1) return "harvestable";
    if (t >= 0.35) return "sprout";
    return "seed";
  }

  function roofLoad() {
    let load = PEOPLE_LOAD + TOOL_LOAD;
    for (const cell of state.grid) {
      if (cell.soil) load += CELL_SOIL_LOAD;
      if (cell.watered) load += CELL_WATER_LOAD;
      if (cell.sprinkler) load += SPRINKLER_LOAD;
      if (cell.compost) load += 1.5;
    }
    for (const plant of state.plants) {
      load += plantLoad(plant);
    }
    return load;
  }

  function soilCount() {
    return state.grid.filter((cell) => cell.soil).length;
  }

  function sprinklerCount() {
    return state.grid.filter((cell) => cell.sprinkler).length;
  }

  function irrigationAxisValues(max) {
    const values = [];
    for (let value = 0; value < max; value += IRRIGATION_GRID_STEP) {
      values.push(value);
    }
    if (values[values.length - 1] !== max - 1) values.push(max - 1);
    return values;
  }

  function nearestAxisValue(value, values) {
    let best = values[0];
    let bestDistance = Math.abs(value - best);
    for (const candidate of values) {
      const distance = Math.abs(value - candidate);
      if (distance < bestDistance) {
        best = candidate;
        bestDistance = distance;
      }
    }
    return best;
  }

  function adjacentAxisValues(value, values) {
    const index = values.indexOf(value);
    if (index < 0) return [];
    const adjacent = [];
    if (index > 0) adjacent.push(values[index - 1]);
    if (index < values.length - 1) adjacent.push(values[index + 1]);
    return adjacent;
  }

  function isIrrigationSocket(col, row) {
    return IRRIGATION_SOCKET_COLS.includes(col) && IRRIGATION_SOCKET_ROWS.includes(row);
  }

  function nearestIrrigationSocket(col, row) {
    if (!Number.isFinite(col) || !Number.isFinite(row)) return null;
    const point = clampSamplePoint(col, row);
    const socket = {
      col: nearestAxisValue(point.col, IRRIGATION_SOCKET_COLS),
      row: nearestAxisValue(point.row, IRRIGATION_SOCKET_ROWS),
    };
    const distance = sampleDistance(point.col, point.row, socket.col, socket.row);
    return {
      ...socket,
      distance,
      inRange: distance <= IRRIGATION_SNAP_DISTANCE,
    };
  }

  function pipeNeighbourCandidates(col, row) {
    const candidates = [];
    for (const nextCol of adjacentAxisValues(col, IRRIGATION_SOCKET_COLS)) {
      candidates.push({ col: nextCol, row });
    }
    for (const nextRow of adjacentAxisValues(row, IRRIGATION_SOCKET_ROWS)) {
      candidates.push({ col, row: nextRow });
    }
    return candidates;
  }

  function pipeKey(col, row) {
    return `${col}:${row}`;
  }

  function oldPipeNeighbours(col, row, legacySet) {
    return [
      { col: col - 1, row },
      { col: col + 1, row },
      { col, row: row - 1 },
      { col, row: row + 1 },
    ].filter((cell) => legacySet.has(pipeKey(cell.col, cell.row)));
  }

  function edgeDistance(col, row) {
    return Math.min(col, row, COLS - 1 - col, ROWS - 1 - row);
  }

  function nearestAvailableSocket(col, row, used, edgeOnly = false) {
    const sockets = [];
    for (const socketRow of IRRIGATION_SOCKET_ROWS) {
      for (const socketCol of IRRIGATION_SOCKET_COLS) {
        if (used.has(pipeKey(socketCol, socketRow))) continue;
        if (edgeOnly && !isRoofEdgePipeStart(socketCol, socketRow)) continue;
        sockets.push({
          col: socketCol,
          row: socketRow,
          distance: sampleDistance(col, row, socketCol, socketRow),
          edge: edgeDistance(socketCol, socketRow),
        });
      }
    }
    sockets.sort((a, b) => a.distance - b.distance || a.edge - b.edge || a.row - b.row || a.col - b.col);
    return sockets[0] || null;
  }

  function axisStep(value, values, direction) {
    const index = values.indexOf(value);
    if (index < 0) return null;
    const next = values[index + Math.sign(direction)];
    return next === undefined ? null : next;
  }

  function preferredAdjacentSocket(parentSocket, legacyFrom, legacyTo, used) {
    const dx = legacyTo.col - legacyFrom.col;
    const dy = legacyTo.row - legacyFrom.row;
    let preferred = null;
    if (Math.abs(dx) >= Math.abs(dy) && dx !== 0) {
      const nextCol = axisStep(parentSocket.col, IRRIGATION_SOCKET_COLS, dx);
      if (nextCol !== null) preferred = { col: nextCol, row: parentSocket.row };
    } else if (dy !== 0) {
      const nextRow = axisStep(parentSocket.row, IRRIGATION_SOCKET_ROWS, dy);
      if (nextRow !== null) preferred = { col: parentSocket.col, row: nextRow };
    }
    if (preferred && !used.has(pipeKey(preferred.col, preferred.row))) return preferred;

    const candidates = pipeNeighbourCandidates(parentSocket.col, parentSocket.row)
      .filter((socket) => !used.has(pipeKey(socket.col, socket.row)))
      .map((socket) => ({
        ...socket,
        distance: sampleDistance(legacyTo.col, legacyTo.row, socket.col, socket.row),
      }));
    candidates.sort((a, b) => a.distance - b.distance || a.row - b.row || a.col - b.col);
    return candidates[0] || null;
  }

  function normalizeIrrigationPipes() {
    const legacyPipes = [];
    for (let row = 0; row < ROWS; row += 1) {
      for (let col = 0; col < COLS; col += 1) {
        if (cellAt(col, row).sprinkler) legacyPipes.push({ col, row });
      }
    }
    if (!legacyPipes.some((pipe) => !isIrrigationSocket(pipe.col, pipe.row))) return false;

    const legacySet = new Set(legacyPipes.map((pipe) => pipeKey(pipe.col, pipe.row)));
    for (const pipe of legacyPipes) {
      cellAt(pipe.col, pipe.row).sprinkler = false;
    }

    const used = new Set();
    const assigned = new Map();
    const roots = [...legacyPipes].sort((a, b) => edgeDistance(a.col, a.row) - edgeDistance(b.col, b.row)
      || sampleDistance(a.col, a.row, 0, 0) - sampleDistance(b.col, b.row, 0, 0));

    const placeMigratedPipe = (legacyPipe, socket) => {
      if (!socket || !inBounds(socket.col, socket.row)) return false;
      const key = pipeKey(socket.col, socket.row);
      if (used.has(key)) return false;
      used.add(key);
      assigned.set(pipeKey(legacyPipe.col, legacyPipe.row), socket);
      cellAt(socket.col, socket.row).sprinkler = true;
      waterRadius(socket.col, socket.row, sampleRadiusForPixels(WATER_RADIUS));
      return true;
    };

    for (const root of roots) {
      const rootKey = pipeKey(root.col, root.row);
      if (assigned.has(rootKey)) continue;
      const rootSocket = nearestAvailableSocket(root.col, root.row, used, true)
        || nearestAvailableSocket(root.col, root.row, used, false);
      if (!placeMigratedPipe(root, rootSocket)) continue;

      const queue = [root];
      for (let i = 0; i < queue.length; i += 1) {
        const current = queue[i];
        const currentSocket = assigned.get(pipeKey(current.col, current.row));
        for (const next of oldPipeNeighbours(current.col, current.row, legacySet)) {
          const nextKey = pipeKey(next.col, next.row);
          if (assigned.has(nextKey)) continue;
          const socket = preferredAdjacentSocket(currentSocket, current, next, used)
            || nearestAvailableSocket(next.col, next.row, used, false);
          if (placeMigratedPipe(next, socket)) queue.push(next);
        }
      }
    }
    return true;
  }

  function pipeNeighbours(col, row) {
    return pipeNeighbourCandidates(col, row)
      .filter((cell) => inBounds(cell.col, cell.row) && cellAt(cell.col, cell.row).sprinkler);
  }

  function isRoofEdgePipeStart(col, row) {
    return col === 0 || row === 0 || col === COLS - 1 || row === ROWS - 1;
  }

  function canPlaceIrrigationPipe(col, row, hasPipes = sprinklerCount() > 0) {
    if (!inBounds(col, row) || !isIrrigationSocket(col, row)) {
      return { ok: false, message: "Click one of the highlighted irrigation pipe sockets." };
    }
    if (!hasPipes) {
      return isRoofEdgePipeStart(col, row)
        ? { ok: true }
        : { ok: false, message: "Start the irrigation pipe on a highlighted roof edge socket first." };
    }
    const neighbours = pipeNeighbours(col, row);
    if (neighbours.length !== 1) {
      return {
        ok: false,
        message: neighbours.length === 0
          ? "New irrigation pipes must snap to a highlighted open socket on the existing pipe."
          : "Place pipes one segment at a time so the network does not cross-connect.",
      };
    }
    const junction = neighbours[0];
    if (pipeNeighbours(junction.col, junction.row).length >= 3) {
      return { ok: false, message: "That junction already branches in three directions." };
    }
    return { ok: true };
  }

  function irrigationSocketSummary(limit = 48) {
    const hasPipes = sprinklerCount() > 0;
    const validSockets = [];
    const existingSockets = [];
    const edgeStartSockets = [];
    for (const row of IRRIGATION_SOCKET_ROWS) {
      for (const col of IRRIGATION_SOCKET_COLS) {
        if (cellAt(col, row).sprinkler) {
          existingSockets.push({ col, row });
          continue;
        }
        if (!hasPipes && isRoofEdgePipeStart(col, row)) {
          edgeStartSockets.push({ col, row });
        }
        if (canPlaceIrrigationPipe(col, row, hasPipes).ok) {
          validSockets.push({ col, row });
        }
      }
    }
    return {
      visible: state.mode === "game" && state.phase === "planning" && state.selectedTool === "irrigation",
      socketStepSamples: IRRIGATION_GRID_STEP,
      snapDistanceSamples: IRRIGATION_SNAP_DISTANCE,
      columns: IRRIGATION_SOCKET_COLS.length,
      rows: IRRIGATION_SOCKET_ROWS.length,
      totalSockets: IRRIGATION_SOCKET_COLS.length * IRRIGATION_SOCKET_ROWS.length,
      validSockets: validSockets.slice(0, limit),
      validSocketCount: validSockets.length,
      existingSockets,
      edgeStartSockets: edgeStartSockets.slice(0, limit),
    };
  }

  function wateredCount() {
    let count = 0;
    for (let row = 0; row < ROWS; row += 1) {
      for (let col = 0; col < COLS; col += 1) {
        if (cellAt(col, row).soil && isCellIrrigated(col, row)) count += 1;
      }
    }
    return count;
  }

  function formatMoney(value) {
    return `${Math.round(value)}p`;
  }

  function formatTime(minutes) {
    const normalized = ((Math.floor(minutes) % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
    const hour = Math.floor(normalized / 60);
    const minute = normalized % 60;
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }

  function isDaytime(minutes = state.minutes) {
    return minutes >= DAY_START_MINUTES && minutes < DAY_END_MINUTES;
  }

  function midweekDays() {
    return clampNumber(Math.round(gameSettings.midweekDays || DEFAULT_GAME_SETTINGS.midweekDays), 1, 6);
  }

  function clockStepSeconds(phase = state.phase, minutes = state.minutes) {
    if (phase === "repair") return Math.max(0.1, gameSettings.repairStepSeconds || DEFAULT_GAME_SETTINGS.repairStepSeconds);
    const hourSeconds = isDaytime(minutes)
      ? gameSettings.dayHourSeconds || DEFAULT_GAME_SETTINGS.dayHourSeconds
      : gameSettings.nightHourSeconds || DEFAULT_GAME_SETTINGS.nightHourSeconds;
    return Math.max(0.05, (hourSeconds * CLOCK_STEP_MINUTES) / 60);
  }

  function volunteerActionSeconds() {
    return Math.max(0.1, gameSettings.volunteerActionSeconds || DEFAULT_GAME_SETTINGS.volunteerActionSeconds);
  }

  function volunteerMoveSpeed() {
    return Math.max(0.15, gameSettings.volunteerMoveSpeed || DEFAULT_GAME_SETTINGS.volunteerMoveSpeed);
  }

  function advanceTenMinuteClock(realSeconds, onTick, onDayEnd) {
    if (realSeconds <= 0) return;
    state.clockAccumulator = (state.clockAccumulator || 0) + realSeconds;
    const startingPhase = state.phase;
    let guard = 0;
    while (guard < 2000) {
      const stepSeconds = clockStepSeconds(state.phase, state.minutes);
      if (state.clockAccumulator < stepSeconds) break;
      state.clockAccumulator -= stepSeconds;
      state.minutes += CLOCK_STEP_MINUTES;
      onTick?.(CLOCK_STEP_MINUTES);
      guard += 1;
      if (state.minutes >= DAY_MINUTES) {
        state.minutes -= DAY_MINUTES;
        const shouldContinue = onDayEnd?.();
        if (shouldContinue === false || state.phase !== startingPhase) break;
      }
    }
  }

  function phaseLabel() {
    if (state.phase === "planning") return "Planning";
    if (state.phase === "midweek") return `Day ${state.day}/${midweekDays()}`;
    if (state.phase === "market") return `Market Day ${state.day}`;
    if (state.phase === "repair") return "Roof Repair";
    return state.phase;
  }

  function passPlanning() {
    if (state.phase !== "planning") return;
    playUiSound("water");
    state.phase = "midweek";
    state.day = 1;
    state.minutes = DAY_START_MINUTES;
    state.clockAccumulator = 0;
    state.fast = false;
    state.message = `The week has started. Mid-week runs for ${midweekDays()} days before market day.`;
    clearWater();
    applySprinklers();
    saveGame();
  }

  function enterMarket() {
    playUiSound("market");
    state.phase = "market";
    state.day = 6;
    state.minutes = 9 * 60;
    state.clockAccumulator = 0;
    state.fast = false;
    state.message = "Market days. Shoppers walk up to the produce stall with offers.";
    state.prices = generatePrices();
    state.marketOffers = generateMarketOffers();
    saveGame();
  }

  function endMarketWeek() {
    ageInventory(7);
    advanceCalendarWeek();
    spoilOutOfSeasonPlants();
    state.phase = "planning";
    state.day = 0;
    state.minutes = DAY_START_MINUTES;
    state.clockAccumulator = 0;
    state.fast = false;
    state.overloadDays = 0;
    state.weather = generateWeather();
    state.marketMood = generateMarketMood();
    state.prices = generatePrices();
    normalizeSelectedSeed();
    state.message = "New planning phase. Check prices, expand carefully, and keep the roof load safe.";
    saveGame();
  }

  function advanceCalendarWeek() {
    state.absoluteWeek += 1;
    state.weekInMonth += 1;
    if (state.weekInMonth > 4) {
      state.weekInMonth = 1;
      state.month += 1;
      if (state.month > 12) {
        state.month = 1;
        state.year += 1;
      }
    }
  }

  function generateWeather() {
    const options = [
      "Bright start, light rain later",
      "Dry week, watering matters",
      "Humid evenings help greens",
      "Windy roof, volunteers tire fast",
      "Cloud cover keeps soil damp",
    ];
    return options[Math.floor(randomBetween(0, options.length)) % options.length];
  }

  function generateMarketMood() {
    const options = [
      "Restaurants want quick greens",
      "Families are buying roots",
      "Chefs ask for fresh herbs",
      "Bulk buyers watch prices",
      "Neighbourhood interest is rising",
    ];
    return options[Math.floor(randomBetween(0, options.length)) % options.length];
  }

  function clearWater() {
    for (const cell of state.grid) {
      cell.watered = false;
    }
  }

  function applySprinklers() {
    for (let row = 0; row < ROWS; row += 1) {
      for (let col = 0; col < COLS; col += 1) {
        if (cellAt(col, row).sprinkler) {
          waterRadius(col, row, sampleRadiusForPixels(WATER_RADIUS));
        }
      }
    }
  }

  function waterRadius(col, row, radius) {
    for (let r = row - radius; r <= row + radius; r += 1) {
      for (let c = col - radius; c <= col + radius; c += 1) {
        const sampleCol = Math.round(c);
        const sampleRow = Math.round(r);
        if (inBounds(sampleCol, sampleRow) && sampleDistance(sampleCol, sampleRow, col, row) <= radius && cellAt(sampleCol, sampleRow).soil) {
          cellAt(sampleCol, sampleRow).watered = true;
        }
      }
    }
  }

  function applyVolunteerTasks() {
    for (const volunteer of state.volunteers) {
      performVolunteerTask(volunteer, false);
    }
  }

  function growPlants() {
    growPlantsByMinutes(DAY_MINUTES);
  }

  function growPlantsByMinutes(minutes) {
    if (minutes <= 0) return;
    const days = minutes / DAY_MINUTES;
    for (const plant of state.plants) {
      if (isPlantWatered(plant)) {
        const root = rootCells(plant);
        const bonus = root.reduce((sum, cell) => sum + cellAt(cell.col, cell.row).compost, 0);
        const compostCoverage = root.length ? bonus / root.length : 0;
        const compostBonus = Math.min(0.5, compostCoverage * 0.65);
        const serviceBonus = Math.min(0.35, (state.pollinatorBonus || 0) + (state.soilBonus || 0));
        const weedPenalty = plantHasWeeds(plant) ? 0.55 : 1;
        const oldGrowth = plant.growthDays;
        plant.growthDays += days * (1 + compostBonus + serviceBonus) * weedPenalty;
        const def = cropDefs[plant.crop];
        if (def?.fruitLoad && plant.growthDays >= def.growDays) {
          const fruitDays = oldGrowth < def.growDays ? Math.max(0, plant.growthDays - def.growDays) : days;
          plant.fruitDays = (plant.fruitDays || 0) + fruitDays * (1 + serviceBonus) * weedPenalty;
          if (plant.fruitDays >= def.fruitInterval) {
            plant.fruitReady = true;
          }
        }
        plant.thirst = 0;
        absorbSoil(plant, 0.08 * days);
      } else {
        plant.thirst = (plant.thirst || 0) + days;
      }
    }
  }

  function advanceMidweekMinutes(totalMinutes) {
    let remaining = totalMinutes;
    while (remaining > 0 && state.phase === "midweek") {
      const untilEnd = DAY_MINUTES - state.minutes;
      const step = Math.min(remaining, untilEnd);
      state.minutes += step;
      growPlantsByMinutes(step);
      remaining -= step;
      if (state.minutes >= DAY_MINUTES && state.phase === "midweek") {
        endDay();
      }
    }
  }

  function updateMidweekClock(dt) {
    advanceTenMinuteClock(dt, (minutes) => {
      growPlantsByMinutes(minutes);
    }, endDay);
  }

  function absorbSoil(plant, amount) {
    const adjusted = amount * Math.max(0.45, 1 - (state.mulchBonus || 0));
    const root = rootCells(plant);
    for (const cell of root) {
      const target = cellAt(cell.col, cell.row);
      if (target.soil > 0) {
        target.soil = Math.max(0.35, target.soil - adjusted / Math.max(1, root.length * 0.22));
      }
    }
  }

  function endDay() {
    state.minutes = state.minutes % DAY_MINUTES;
    applyDailyCycle();
    state.day += 1;
    if (state.day > midweekDays() && state.phase === "midweek") {
      enterMarket();
    }
    saveGame();
  }

  function applyDailyCycle() {
    clearWater();
    applySprinklers();
    applyVolunteerTasks();
    spawnWeeds();
    checkRoofLoad();
    saveTimer = 0;
  }

  function spawnWeeds() {
    if (!Array.isArray(state.weeds)) state.weeds = [];
    for (const weed of state.weeds) {
      weed.age = (weed.age || 0) + 1;
    }
    if (state.weeds.length >= 14) return;
    const candidates = [];
    for (let row = 0; row < ROWS; row += 1) {
      for (let col = 0; col < COLS; col += 1) {
        const cell = cellAt(col, row);
        if (cell.soil && !hasWeed(col, row)) {
          candidates.push({ col, row, planted: Boolean(plantAt(col, row)) });
        }
      }
    }
    if (!candidates.length) return;
    const attempts = Math.min(4, Math.max(1, Math.floor(candidates.length / 120)));
    let spawned = 0;
    for (let i = 0; i < attempts && state.weeds.length < 14; i += 1) {
      const chance = WEED_SPAWN_CHANCE + (state.weather.includes("Humid") ? 0.1 : 0);
      if (rand() > chance) continue;
      const planted = candidates.filter((candidate) => candidate.planted);
      const pool = planted.length && rand() < 0.65 ? planted : candidates;
      const target = pool[Math.floor(randomBetween(0, pool.length)) % pool.length];
      if (!target || hasWeed(target.col, target.row)) continue;
      state.weeds.push({ col: target.col, row: target.row, age: 0 });
      spawned += 1;
    }
    if (spawned > 0) {
      state.message = `${spawned} weed patch${spawned === 1 ? "" : "es"} appeared. Assign a volunteer to weed before growth slows.`;
    }
  }

  function checkRoofLoad() {
    const load = roofLoad();
    if (load > state.roofLimit) {
      state.overloadDays += 1;
      state.message = `The roof has been overloaded for ${state.overloadDays} day${state.overloadDays === 1 ? "" : "s"}.`;
      if (state.overloadDays > 2) {
        triggerCollapse();
      }
    } else {
      state.overloadDays = Math.max(0, state.overloadDays - 0.5);
    }
  }

  function triggerCollapse() {
    const lost = state.plants.length;
    state.stats.collapses += 1;
    state.collapseCount += 1;
    for (const plant of state.plants) {
      state.compost += Math.max(1, Math.round(plantLoad(plant) * 0.6));
    }
    state.plants = [];
    for (const cell of state.grid) {
      cell.watered = false;
      cell.soil = Math.max(0, cell.soil - 0.2);
    }
    state.phase = "repair";
    state.day = 1;
    state.minutes = DAY_START_MINUTES;
    state.clockAccumulator = 0;
    state.repairDaysLeft = 7;
    state.overloadDays = 0;
    state.message = `Crew leader scolds you at 07:00 after a roof collapse. ${lost} crop${lost === 1 ? "" : "s"} withered while scaffolding goes up for repairs.`;
    saveGame();
  }

  function updateRepair(dt) {
    advanceTenMinuteClock(dt, () => {}, () => {
      state.repairDaysLeft -= 1;
      state.day += 1;
    });
    if (state.repairDaysLeft <= 0) {
      advanceCalendarWeek();
      state.phase = "planning";
      state.day = 0;
      state.minutes = DAY_START_MINUTES;
      state.clockAccumulator = 0;
      state.message = "Repairs are complete. The crew warns you to respect the roof gauge.";
      saveGame();
    }
  }

  function updateMarket(dt) {
    advanceTenMinuteClock(dt, () => {
      if (!state.marketOffers.length || Math.floor(state.minutes / 60) % 3 === 0) {
        state.marketOffers = generateMarketOffers();
      }
    }, () => {
      state.day += 1;
      ageInventory(1);
      if (state.day > 7) {
        state.day = 7;
        state.minutes = 20 * 60;
        state.clockAccumulator = 0;
        state.message = "The market weekend is ending. Press End Week when you are done with contacts.";
        return false;
      }
      return true;
    });
  }

  function spoilOutOfSeasonPlants() {
    const season = currentSeason();
    const keep = [];
    let spoiled = 0;
    for (const plant of state.plants) {
      const def = cropDefs[plant.crop];
      if (def && def.seasons.includes(season)) {
        keep.push(plant);
      } else {
        state.compost += Math.max(1, Math.round(plantLoad(plant) * 0.5));
        spoiled += 1;
      }
    }
    state.plants = keep;
    if (spoiled > 0) {
      state.message = `${spoiled} out-of-season crop${spoiled === 1 ? "" : "s"} spoiled into compost.`;
    }
  }

  function ageInventory(days) {
    for (const item of state.inventory) {
      item.age += days;
      if (item.age >= item.shelfLife) {
        item.spoiled = true;
      }
    }
  }

  function plantSeed(col, row) {
    const def = cropDefs[state.selectedSeed];
    if (!def) return false;
    if (state.money < def.seedCost) {
      state.message = `Need ${formatMoney(def.seedCost)} for ${def.name} seed.`;
      return false;
    }
    if (!canPlantAt(col, row)) {
      state.message = `${def.name} needs a clear ${def.rootRadius || 12}px root radius fully covered with soil.`;
      return false;
    }
    state.money -= def.seedCost;
    const point = clampSamplePoint(col, row);
    state.plants.push({
      id: `${def.key}-${Date.now()}-${Math.floor(rand() * 10000)}`,
      crop: def.key,
      col: point.col,
      row: point.row,
      growthDays: 0,
      fruitDays: 0,
      fruitReady: false,
      thirst: 0,
    });
    state.message = `${def.name} planted. Keep its circular root space irrigated so it grows.`;
    saveGame();
    return true;
  }

  function placeSprinkler(col, row) {
    const socket = nearestIrrigationSocket(col, row);
    if (!socket || !socket.inRange) {
      state.message = "Click one of the highlighted irrigation pipe sockets.";
      return false;
    }
    const { col: socketCol, row: socketRow } = socket;
    const cell = cellAt(socketCol, socketRow);
    if (cell.sprinkler) {
      state.message = "A pipe nozzle already hangs above this roof spot.";
      return false;
    }
    const pipeCheck = canPlaceIrrigationPipe(socketCol, socketRow);
    if (!pipeCheck.ok) {
      state.message = pipeCheck.message;
      return false;
    }
    const cost = sprinklerCost();
    if (state.money < cost) {
      state.message = `Need ${formatMoney(cost)} to add another sprinkler.`;
      return false;
    }
    state.money -= cost;
    cell.sprinkler = true;
    waterRadius(socketCol, socketRow, sampleRadiusForPixels(WATER_RADIUS));
    state.message = sprinklerCount() === 1
      ? `Edge pipe started for ${formatMoney(cost)}. Continue from a highlighted socket to branch irrigation.`
      : `Pipe segment added for ${formatMoney(cost)}. It waters nearby soil without taking root space.`;
    saveGame();
    return true;
  }

  function sprinklerCost() {
    return Math.max(12, 25 - Math.floor(state.toolDiscount || 0));
  }

  function harvestPlant(plant, source) {
    const def = cropDefs[plant.crop];
    if (!def || plantStage(plant) !== "harvestable") return false;
    state.inventory.push({
      crop: def.key,
      qty: 1,
      age: 0,
      shelfLife: def.shelfLife,
      spoiled: false,
    });
    if (def.fruitLoad) {
      plant.fruitDays = 0;
      plant.fruitReady = false;
    } else {
      state.plants = state.plants.filter((item) => item.id !== plant.id);
    }
    state.stats.harvested += 1;
    state.message = source === "volunteer"
      ? `${def.name} ${def.fruitLoad ? "fruit" : ""} harvested by a volunteer and moved to storage.`
      : `${def.name} ${def.fruitLoad ? "fruit" : ""} harvested into storage.`;
    return true;
  }

  function removePlant(plant) {
    state.compost += Math.max(1, Math.round(plantLoad(plant) * 0.5));
    state.plants = state.plants.filter((item) => item.id !== plant.id);
    state.message = "Removed crop was added to the compost pile.";
    saveGame();
  }

  function sellAll() {
    let earned = 0;
    let sold = 0;
    const keep = [];
    const stallHelpers = stallVolunteerCount();
    const stallMultiplier = 1 + stallHelpers * 0.08;
    for (const item of state.inventory) {
      if (item.spoiled) {
        keep.push(item);
        continue;
      }
      const price = state.prices[item.crop] || cropDefs[item.crop].saleBase;
      earned += Math.round(price * stallMultiplier) * item.qty;
      sold += item.qty;
    }
    state.inventory = keep;
    state.money += earned;
    state.stats.sold += sold;
    state.stats.stallSales += stallHelpers && sold ? sold : 0;
    state.message = sold > 0
      ? `Sold ${sold} box${sold === 1 ? "" : "es"} for ${formatMoney(earned)}${stallHelpers ? " with volunteer stall help" : ""}.`
      : "No fresh produce ready to sell.";
    saveGame();
  }

  function freshInventoryByCrop() {
    const counts = {};
    for (const item of state.inventory) {
      if (item.spoiled) continue;
      counts[item.crop] = (counts[item.crop] || 0) + item.qty;
    }
    return counts;
  }

  function generateMarketOffers() {
    const counts = freshInventoryByCrop();
    const crops = Object.keys(counts).filter((key) => counts[key] > 0 && cropDefs[key]);
    if (!crops.length) return [];
    const names = ["Mina", "Ollie", "Rae"];
    const offers = [];
    for (let i = 0; i < Math.min(3, crops.length); i += 1) {
      const crop = crops[(Math.floor(randomBetween(0, crops.length)) + i) % crops.length];
      const base = state.prices[crop] || cropDefs[crop].saleBase;
      const premium = 1 + randomBetween(-0.08, 0.22);
      offers.push({
        id: `${crop}-${state.day}-${Math.round(state.minutes)}-${i}`,
        npc: names[i],
        crop,
        qty: 1,
        price: Math.max(1, Math.round(base * premium)),
        patience: 1 - i * 0.18,
      });
    }
    return offers;
  }

  function acceptMarketOffer(index) {
    const offer = state.marketOffers[index];
    if (!offer) {
      state.message = "No shopper offer selected.";
      return false;
    }
    const itemIndex = state.inventory.findIndex((item) => !item.spoiled && item.crop === offer.crop);
    if (itemIndex < 0) {
      state.message = `${offer.npc} wanted ${cropDefs[offer.crop]?.name || "produce"}, but storage is out.`;
      state.marketOffers.splice(index, 1);
      return false;
    }
    const item = state.inventory[itemIndex];
    item.qty -= offer.qty;
    if (item.qty <= 0) state.inventory.splice(itemIndex, 1);
    state.money += offer.price;
    state.stats.sold += offer.qty;
    state.stats.stallSales += offer.qty;
    state.message = `Bagged ${cropDefs[offer.crop]?.name || offer.crop} for ${offer.npc} and collected ${formatMoney(offer.price)}.`;
    state.marketOffers.splice(index, 1);
    if (!state.marketOffers.length) state.marketOffers = generateMarketOffers();
    saveGame();
    return true;
  }

  function stallVolunteerCount() {
    return state.volunteers.filter((volunteer) => volunteer.task === "stall").length;
  }

  function assignStallVolunteer() {
    if (state.phase !== "market") {
      state.message = "Stall duty is only useful during market days.";
      return;
    }
    const volunteer = state.volunteers.find((item) => item.task === "idle") || state.volunteers[0];
    if (!volunteer) {
      state.message = "No volunteers are available for stall duty.";
      return;
    }
    volunteer.task = "stall";
    volunteer.targetX = 0.5;
    volunteer.targetY = 0.5;
    state.message = `${volunteer.name} is manning the stall so you can work the market crowd.`;
    saveGame();
  }

  function compostSpoiled() {
    let added = 0;
    const keep = [];
    for (const item of state.inventory) {
      if (item.spoiled) {
        const def = cropDefs[item.crop];
        added += Math.max(1, Math.round((def ? def.harvestLoad : 8) * 0.8));
      } else {
        keep.push(item);
      }
    }
    state.inventory = keep;
    state.compost += added;
    state.message = added > 0 ? `Spoiled produce became ${added} compost units.` : "No spoiled produce in storage.";
    saveGame();
  }

  function giftToNpc(npc) {
    const index = state.inventory.findIndex((item) => !item.spoiled);
    if (index === -1) {
      state.message = "You need fresh produce to gift a useful sample.";
      return;
    }
    const [item] = state.inventory.splice(index, 1);
    state.favour[npc] = (state.favour[npc] || 0) + 1;
    state.stats.donated += 1;
    state.stats.npcGifts += 1;
    const def = cropDefs[item.crop];
    if (npc === "restaurant") {
      state.compost += 5 + state.favour[npc] * 2;
      state.message = `Restaurant owner liked the ${def.name}. Food scraps added compost.`;
    } else if (npc === "carpenter") {
      state.compost += 3;
      state.mulchBonus = Math.min(0.35, (state.mulchBonus || 0) + 0.06);
      state.message = "Carpenter delivered wood shavings for mulch. Soil mass depletes more slowly.";
    } else if (npc === "social") {
      const volunteerName = state.favour.social > 2 ? "Sam" : "Ari";
      if (state.volunteers.length < 3) {
        state.volunteers.push({ name: volunteerName, task: "idle", x: 0.5, y: 0.5, bob: 0.4, actionTimer: 0 });
      }
      state.message = "Social worker referred another volunteer for future weeks.";
    } else if (npc === "engineer") {
      state.toolDiscount = Math.min(13, (state.toolDiscount || 0) + 3);
      state.message = `Engineer tuned your irrigation kit. Sprinklers now cost ${formatMoney(sprinklerCost())}.`;
    } else if (npc === "mushroom") {
      state.compost += 8;
      state.soilBonus = Math.min(0.18, (state.soilBonus || 0) + 0.04);
      state.message = "Mushroom grower traded rich soil and compost for your produce.";
    } else if (npc === "beekeeper") {
      state.pollinatorBonus = Math.min(0.18, (state.pollinatorBonus || 0) + 0.05);
      state.message = "Beekeeper placed pollinator boxes. Watered crops grow faster.";
    }
    saveGame();
  }

  function strengthenRoof() {
    const cost = 160 + state.collapseCount * 40;
    if (state.money < cost) {
      state.message = `Roof upgrade costs ${formatMoney(cost)}.`;
      return;
    }
    state.money -= cost;
    state.roofLimit += 120;
    state.message = "Construction crew strengthened the roof before the next expansion.";
    saveGame();
  }

  function canConsultOtherFarm() {
    const favourTotal = Object.values(state.favour).reduce((sum, value) => sum + value, 0);
    return currentSeason() === "Winter" && state.absoluteWeek >= 16 && favourTotal >= 3 && state.roofLimit >= 900;
  }

  function consultOtherFarm() {
    if (!canConsultOtherFarm()) {
      state.message = "Winter consulting unlocks after week 16 with stronger roof work and at least 3 total NPC favour.";
      return;
    }
    const fee = 90 + Math.min(160, state.hubReputation * 20);
    state.money += fee;
    state.hubReputation += 1;
    state.stats.consultedFarms += 1;
    state.message = `You consulted on another winter rooftop farm for ${formatMoney(fee)}. The community hub reputation grew.`;
    saveGame();
  }

  function applyCompost(col, row) {
    if (state.compost <= 0 || !inBounds(col, row)) {
      state.message = "No compost available yet.";
      return false;
    }
    const plant = plantAt(col, row);
    if (!plant) {
      state.message = "Apply compost to a planted root space.";
      return false;
    }
    for (const cell of rootCells(plant)) {
      if (cellAt(cell.col, cell.row).soil) cellAt(cell.col, cell.row).compost += 1;
    }
    state.compost -= 1;
    state.message = "Compost applied. Growth gets a small daily boost.";
    saveGame();
    return true;
  }

  function paintSoilAt(col, row) {
    let painted = 0;
    for (const sample of samplesInCircle(col, row, sampleRadiusForPixels(SOIL_BRUSH_RADIUS))) {
      if (plantAt(sample.col, sample.row)) continue;
      const target = cellAt(sample.col, sample.row);
      if (!target.soil) painted += 1;
      target.soil = Math.max(target.soil, 1);
      target.watered = false;
    }
    if (painted > 0) {
      state.message = "Soil painted like a brush stroke. Existing soil is not stacked.";
      saveGame();
    }
    return painted;
  }

  function eraseAt(col, row) {
    let cleared = 0;
    const touchedPlants = new Set();
    for (const sample of samplesInCircle(col, row, sampleRadiusForPixels(ERASER_RADIUS))) {
      const plant = plantAt(sample.col, sample.row);
      if (plant) touchedPlants.add(plant);
      const target = cellAt(sample.col, sample.row);
      if (target.soil || target.watered || target.sprinkler || target.compost) cleared += 1;
      target.soil = 0;
      target.watered = false;
      target.sprinkler = false;
      target.compost = 0;
      state.weeds = state.weeds.filter((weed) => weed.col !== sample.col || weed.row !== sample.row);
    }
    for (const plant of touchedPlants) removePlant(plant);
    if (cleared > 0 && touchedPlants.size === 0) {
      state.message = "Eraser cleared an analog patch of soil and fixtures.";
      saveGame();
    }
    return cleared + touchedPlants.size;
  }

  function aimVolunteerAtCell(volunteer, col, row) {
    volunteer.targetX = Math.max(0.08, Math.min(0.92, col / COLS));
    volunteer.targetY = Math.max(0.12, Math.min(0.9, row / ROWS));
  }

  function performVolunteerWater(volunteer, announceNoWork) {
    const targetPlant = state.plants.find((plant) => {
      return rootCells(plant).some((cell) => cellAt(cell.col, cell.row).soil && !isCellIrrigated(cell.col, cell.row));
    });
    if (!targetPlant) {
      if (announceNoWork) state.message = "No dry crop roots need watering right now.";
      return false;
    }
    let newlyWatered = 0;
    for (const cell of rootCells(targetPlant)) {
      const target = cellAt(cell.col, cell.row);
      if (target.soil && !target.watered) {
        newlyWatered += 1;
        target.watered = true;
      }
    }
    aimVolunteerAtCell(volunteer, targetPlant.col, targetPlant.row);
    state.stats.watered += newlyWatered;
    state.message = `${volunteer.name} watered ${cropDefs[targetPlant.crop]?.name || "crop"} root space.`;
    saveGame();
    return true;
  }

  function performVolunteerWeed(volunteer, announceNoWork) {
    const weed = state.weeds[0];
    if (!weed) {
      if (announceNoWork) state.message = "No weeds need clearing right now.";
      return false;
    }
    aimVolunteerAtCell(volunteer, weed.col, weed.row);
    removeWeedAt(weed.col, weed.row, "volunteer");
    state.message = `${volunteer.name} weeded a bed and added scraps to compost.`;
    return true;
  }

  function performVolunteerHarvest(volunteer, announceNoWork) {
    const ready = state.plants.find((plant) => plantStage(plant) === "harvestable");
    if (!ready) {
      if (announceNoWork) state.message = "No harvest-ready crops yet.";
      return false;
    }
    aimVolunteerAtCell(volunteer, ready.col, ready.row);
    if (harvestPlant(ready, "volunteer")) {
      state.stats.volunteerHarvested += 1;
      saveGame();
      return true;
    }
    return false;
  }

  function performVolunteerTask(volunteer, announceNoWork) {
    if (!volunteer || volunteer.task === "idle") return false;
    if (volunteer.task === "water") return performVolunteerWater(volunteer, announceNoWork);
    if (volunteer.task === "weed") return performVolunteerWeed(volunteer, announceNoWork);
    if (volunteer.task === "harvest") return performVolunteerHarvest(volunteer, announceNoWork);
    return false;
  }

  function updateVolunteerActions(dt) {
    if (state.phase !== "midweek") return;
    for (const volunteer of state.volunteers) {
      if (volunteer.task === "idle") continue;
      volunteer.actionTimer = Math.max(0, (volunteer.actionTimer || 0) - dt);
      if (volunteer.actionTimer <= 0) {
        const acted = performVolunteerTask(volunteer, false);
        const actionDelay = volunteerActionSeconds();
        volunteer.actionTimer = acted ? actionDelay : actionDelay * 3;
      }
    }
  }

  function setVolunteerTask(index, task) {
    const volunteer = state.volunteers[index];
    if (!volunteer) return;
    volunteer.task = task;
    volunteer.actionTimer = 0;
    state.message = `${volunteer.name} assigned to ${task === "idle" ? "wander" : task}.`;
    if (state.phase === "midweek" && task !== "idle") {
      performVolunteerTask(volunteer, true);
      volunteer.actionTimer = volunteerActionSeconds();
    }
    saveGame();
  }

  function cycleVolunteerTask(index) {
    const volunteer = state.volunteers[index];
    if (!volunteer) return;
    const order = ["idle", "water", "weed", "harvest"];
    const next = order[(order.indexOf(volunteer.task) + 1) % order.length] || "idle";
    setVolunteerTask(index, next);
  }

  function cycleSelectedSeed() {
    const keys = availableCropKeys();
    const next = keys[(keys.indexOf(state.selectedSeed) + 1) % keys.length] || keys[0];
    state.selectedSeed = next;
    state.selectedTool = "seed";
    state.message = `${cropDefs[next].name} selected. Click painted soil with a clear circular root space.`;
    saveGame();
  }

  function update(dt) {
    if (state.mode !== "game") return;

    if (state.phase === "midweek") {
      updateVolunteerActions(dt);
      updateMidweekClock(dt);
    } else if (state.phase === "repair") {
      updateRepair(dt);
    } else if (state.phase === "market") {
      updateMarket(dt);
    }

    for (let i = 0; i < state.volunteers.length; i += 1) {
      const volunteer = state.volunteers[i];
      volunteer.bob += dt * (volunteer.task === "idle" ? 1.4 : 2.2);
      if (volunteer.task === "idle") {
        volunteer.x += Math.sin(volunteer.bob * 0.8 + i) * dt * 0.008 * volunteerMoveSpeed();
        volunteer.y += Math.cos(volunteer.bob * 0.7 + i) * dt * 0.007 * volunteerMoveSpeed();
      } else {
        const targetX = volunteer.targetX ?? (volunteer.task === "water" ? 0.28 + i * 0.12 : 0.64 - i * 0.1);
        const targetY = volunteer.targetY ?? (volunteer.task === "weed" ? 0.58 : 0.5);
        const move = dt * volunteerMoveSpeed();
        volunteer.x += (targetX - volunteer.x) * move;
        volunteer.y += (targetY - volunteer.y) * move;
      }
      volunteer.x = Math.max(0.08, Math.min(0.92, volunteer.x));
      volunteer.y = Math.max(0.12, Math.min(0.9, volunteer.y));
    }

    saveTimer += dt;
    if (saveTimer > 12) {
      saveTimer = 0;
      saveGame();
    }
  }

  function rootPreview() {
    if (state.mode !== "game" || state.phase !== "planning" || state.selectedTool !== "seed") return null;
    const cell = gridFromPoint(input.x, input.y);
    if (!cell) return null;
    const radiusPx = cropDefs[state.selectedSeed]?.rootRadius || 12;
    const radiusSamples = sampleRadiusForPixels(radiusPx);
    const cells = samplesInCircle(cell.col, cell.row, radiusSamples)
      .map((sample) => ({ ...sample, inBounds: true }));
    return {
      col: cell.col,
      row: cell.row,
      radiusPx,
      radiusSamples,
      valid: canPlantAt(cell.col, cell.row),
      cells,
    };
  }

  function irrigationPlacementPreview() {
    if (state.mode !== "game" || state.phase !== "planning" || state.selectedTool !== "irrigation") return null;
    const cell = gridFromPoint(input.x, input.y);
    if (!cell) return null;
    const socket = nearestIrrigationSocket(cell.col, cell.row);
    if (!socket) return null;
    const pipeCheck = canPlaceIrrigationPipe(socket.col, socket.row);
    const occupied = cellAt(socket.col, socket.row).sprinkler;
    return {
      col: socket.col,
      row: socket.row,
      distanceSamples: Math.round(socket.distance * 10) / 10,
      inRange: socket.inRange,
      valid: socket.inRange && !occupied && pipeCheck.ok,
      occupied,
      message: occupied ? "A pipe nozzle already hangs above this roof spot." : pipeCheck.message || "Pipe socket can be placed here.",
    };
  }

  function render3DScene() {
    initThree();
    if (!three.initialized) return;
    sceneCanvas.style.visibility = state.mode === "game" && state.phase !== "market" ? "visible" : "hidden";
    if (sceneCanvas.style.visibility === "hidden") return;

    three.renderer.setPixelRatio(view.dpr);
    three.renderer.setSize(view.width, view.height, false);
    sync3DCamera();

    clearThreeGroup(three.world);
    draw3DEnvironment(three.world);
    draw3DRooftop(three.world);
    draw3DCells(three.world);
    draw3DIrrigationPlacementGrid(three.world);
    draw3DRootPreview(three.world);
    draw3DPlants(three.world);
    draw3DWeeds(three.world);
    draw3DSprinklerNetwork(three.world);
    draw3DVolunteers(three.world);
    draw3DStorage(three.world);
    three.renderer.render(three.scene, three.camera);
  }

  function draw3DEnvironment(group) {
    meshBox(group, 0, -0.34, 0, COLS * CELL_3D + 1.35, 0.18, ROWS * CELL_3D + 1.15, three.mat.roofEdge, false, true);
    meshBox(group, 0, -0.18, 0, COLS * CELL_3D + 0.92, 0.26, ROWS * CELL_3D + 0.72, three.mat.roof, false, true);
    meshBox(group, -5.6, -1.05, -4.5, 1.1, 2.2, 1.0, colorMat("#8eb1b5"), false, false);
    meshBox(group, -3.8, -1.15, -5.2, 1.25, 2.7, 1.0, colorMat("#739598"), false, false);
    meshBox(group, 4.7, -1.2, -4.6, 1.4, 2.5, 1.0, colorMat("#d5a85f"), false, false);
    meshBox(group, 6.0, -1.1, -5.4, 1.0, 2.1, 1.0, colorMat("#b78062"), false, false);
  }

  function draw3DRooftop(group) {
    const frameW = COLS * CELL_3D;
    const frameD = ROWS * CELL_3D;
    meshBox(group, 0, 0.02, -frameD / 2 - 0.15, frameW + 0.08, 0.08, 0.08, three.mat.roofEdge, false, true);
    meshBox(group, 0, 0.02, frameD / 2 + 0.15, frameW + 0.08, 0.08, 0.08, three.mat.roofEdge, false, true);
    meshBox(group, -frameW / 2 - 0.15, 0.02, 0, 0.08, 0.08, frameD + 0.38, three.mat.roofEdge, false, true);
    meshBox(group, frameW / 2 + 0.15, 0.02, 0, 0.08, 0.08, frameD + 0.38, three.mat.roofEdge, false, true);
  }

  function draw3DCells(group) {
    for (let row = 0; row < ROWS; row += 1) {
      for (let col = 0; col < COLS; col += 1) {
        const cell = cellAt(col, row);
        const x = boardX(col);
        const z = boardZ(row);
        if (cell.soil) {
          const mat = isCellIrrigated(col, row) ? three.mat.soilWet : three.mat.soil;
          const h = 0.07 + Math.min(0.05, cell.soil * 0.014);
          meshCylinder(group, x, 0.08 + h * 0.5, z, CELL_3D * 0.82, h, mat, false);
          if (isCellIrrigated(col, row)) {
            meshCylinder(group, x, 0.17 + h, z, CELL_3D * 0.72, 0.012, three.mat.water, false);
          }
          if (cell.compost > 0) {
            meshCylinder(group, x, 0.19 + h, z, CELL_3D * 0.58, 0.018, three.mat.compost, false);
          }
        }
      }
    }
  }

  function draw3DRootPreview(group) {
    const preview = rootPreview();
    if (!preview) return;
    const mat = preview.valid ? three.mat.rootGood : three.mat.rootBad;
    meshCylinder(group, boardX(preview.col), 0.34, boardZ(preview.row), preview.radiusSamples * CELL_3D, 0.018, mat, false);
  }

  function draw3DIrrigationPlacementGrid(group) {
    if (state.mode !== "game" || state.phase !== "planning" || state.selectedTool !== "irrigation") return;
    const y = 0.3;
    const hasPipes = sprinklerCount() > 0;
    const preview = irrigationPlacementPreview();

    for (const row of IRRIGATION_SOCKET_ROWS) {
      cylinderBetween(group, { x: boardX(0), y, z: boardZ(row) }, { x: boardX(COLS - 1), y, z: boardZ(row) }, 0.006, three.mat.irrigationGrid);
    }
    for (const col of IRRIGATION_SOCKET_COLS) {
      cylinderBetween(group, { x: boardX(col), y, z: boardZ(0) }, { x: boardX(col), y, z: boardZ(ROWS - 1) }, 0.006, three.mat.irrigationGrid);
    }

    for (const row of IRRIGATION_SOCKET_ROWS) {
      for (const col of IRRIGATION_SOCKET_COLS) {
        const occupied = cellAt(col, row).sprinkler;
        const valid = !occupied && canPlaceIrrigationPipe(col, row, hasPipes).ok;
        let material = occupied ? three.mat.pipeDark : valid ? three.mat.irrigationSocketValid : three.mat.irrigationSocketDim;
        let scale = valid ? 0.055 : 0.033;
        if (!hasPipes && isRoofEdgePipeStart(col, row)) scale = Math.max(scale, 0.047);
        if (preview && preview.col === col && preview.row === row) {
          material = preview.valid ? three.mat.irrigationSocketHot : three.mat.irrigationSocketBad;
          scale = preview.valid ? 0.095 : 0.075;
        }
        meshSphere(group, boardX(col), y + 0.035, boardZ(row), scale, material, false);
      }
    }
  }

  function draw3DPlants(group) {
    for (const plant of state.plants) {
      const def = cropDefs[plant.crop];
      if (!def) continue;
      const stage = plantStage(plant);
      const centerX = boardX(plant.col);
      const centerZ = boardZ(plant.row);
      const watered = isPlantWatered(plant);
      const leafMat = colorMat(watered ? def.leaf : "#7b895a", 0.84);
      const cropMat = colorMat(def.color, 0.68);
      const stemHeight = stage === "seed" ? 0.16 : stage === "sprout" ? 0.34 : 0.54;
      meshCylinder(group, centerX, 0.31 + stemHeight / 2, centerZ, 0.035, stemHeight, leafMat, true);
      const leafY = 0.34 + stemHeight;
      for (let i = 0; i < 4; i += 1) {
        const angle = i * Math.PI * 0.5 + plant.col * 0.17;
        const leaf = meshSphere(group, centerX + Math.cos(angle) * 0.13, leafY, centerZ + Math.sin(angle) * 0.13, stage === "seed" ? 0.07 : 0.13, leafMat, true);
        leaf.scale.y *= 0.42;
      }
      if (stage === "mature" || stage === "harvestable") {
        meshSphere(group, centerX, leafY + 0.1, centerZ, stage === "harvestable" ? 0.2 : 0.16, cropMat, true);
      }
      if (stage === "harvestable") {
        meshSphere(group, centerX + 0.21, leafY + 0.18, centerZ - 0.16, 0.055, three.mat.harvest, true);
      }
    }
  }

  function draw3DWeeds(group) {
    for (const weed of state.weeds) {
      if (!inBounds(weed.col, weed.row)) continue;
      const x = boardX(weed.col);
      const z = boardZ(weed.row);
      for (let i = -2; i <= 2; i += 1) {
        const stem = meshCylinder(group, x + i * 0.045, 0.28, z + Math.abs(i) * 0.025, 0.018, 0.34 + Math.abs(i) * 0.035, three.mat.weed, true);
        stem.rotation.z = i * 0.18;
      }
    }
  }

  function draw3DSprinklerNetwork(group) {
    const pipeY = 1.18;
    for (let row = 0; row < ROWS; row += 1) {
      for (let col = 0; col < COLS; col += 1) {
        if (!cellAt(col, row).sprinkler) continue;
        const x = boardX(col);
        const z = boardZ(row);
        meshSphere(group, x, pipeY, z, 0.085, three.mat.pipe, true);
        cylinderBetween(group, { x, y: pipeY, z }, { x, y: 0.73, z }, 0.022, three.mat.pipeDark);
        meshCylinder(group, x, 0.69, z, 0.1, 0.07, three.mat.pipe, true);
        const ring = new THREE.Mesh(three.geo.torus, three.mat.pipeWater);
        ring.position.set(x, 0.46, z);
        ring.rotation.x = Math.PI / 2;
        ring.scale.set(0.46, 0.46, 0.46);
        group.add(ring);
        for (let i = 0; i < 6; i += 1) {
          const angle = i * Math.PI / 3;
          meshSphere(group, x + Math.cos(angle) * 0.26, 0.48 + Math.sin(i + state.minutes * 0.02) * 0.025, z + Math.sin(angle) * 0.26, 0.025, three.mat.pipeWater, false);
        }
        for (const neighbour of pipeNeighbourCandidates(col, row)) {
          if (!inBounds(neighbour.col, neighbour.row) || !cellAt(neighbour.col, neighbour.row).sprinkler) continue;
          if (neighbour.col < col || neighbour.row < row) continue;
          cylinderBetween(group, { x, y: pipeY, z }, { x: boardX(neighbour.col), y: pipeY, z: boardZ(neighbour.row) }, 0.035, three.mat.pipe);
        }
        if (isRoofEdgePipeStart(col, row) && pipeNeighbours(col, row).length <= 1) {
          const edgeX = col <= 1 ? boardX(-1.35) : col >= COLS - 2 ? boardX(COLS + 0.35) : x;
          const edgeZ = row <= 1 ? boardZ(-1.35) : row >= ROWS - 2 ? boardZ(ROWS + 0.35) : z;
          cylinderBetween(group, { x: edgeX, y: pipeY, z: edgeZ }, { x, y: pipeY, z }, 0.035, three.mat.pipe);
        }
      }
    }
  }

  function draw3DVolunteers(group) {
    for (let i = 0; i < state.volunteers.length; i += 1) {
      const volunteer = state.volunteers[i];
      const mat = i === 0 ? three.mat.volunteerA : i === 1 ? three.mat.volunteerB : three.mat.volunteerC;
      const x = (volunteer.x - 0.5) * COLS * CELL_3D;
      const z = (volunteer.y - 0.5) * ROWS * CELL_3D;
      meshSphere(group, x, 0.19, z, 0.17, three.mat.shadow, false);
      meshCylinder(group, x, 0.43, z, 0.11, 0.34, mat, true);
      meshSphere(group, x, 0.7 + Math.sin(volunteer.bob * 4) * 0.025, z, 0.12, colorMat("#f2d1aa", 0.7), true);
      if (volunteer.task === "water") {
        cylinderBetween(group, { x: x + 0.1, y: 0.5, z }, { x: x + 0.36, y: 0.66, z: z - 0.08 }, 0.025, three.mat.pipeWater);
      } else if (volunteer.task === "weed") {
        cylinderBetween(group, { x: x + 0.1, y: 0.45, z }, { x: x + 0.32, y: 0.36, z: z - 0.16 }, 0.025, three.mat.weed);
      } else if (volunteer.task === "harvest") {
        meshBox(group, x + 0.26, 0.38, z - 0.05, 0.22, 0.12, 0.18, three.mat.roofEdge, true, true);
      }
    }
  }

  function draw3DStorage(group) {
    const x = boardX(COLS - 1.2);
    const z = boardZ(0.8);
    meshBox(group, x, 0.32, z, 0.8, 0.5, 0.55, colorMat("#b9b4a4"), true, true);
    meshBox(group, x, 0.62, z - 0.03, 0.72, 0.08, 0.5, three.mat.roofEdge, true, true);
    meshBox(group, x - 0.18, 0.35, z - 0.28, 0.12, 0.2, 0.04, three.mat.glass, false, false);
    meshBox(group, x + 0.18, 0.35, z - 0.28, 0.12, 0.2, 0.04, three.mat.glass, false, false);
  }

  function draw() {
    layout();
    view.buttons = [];
    ctx.clearRect(0, 0, view.width, view.height);

    if (state.mode === "title") {
      if (sceneCanvas) sceneCanvas.style.visibility = "hidden";
      drawTitle();
      return;
    }

    if (state.phase === "market") {
      if (sceneCanvas) sceneCanvas.style.visibility = "hidden";
      drawMarket();
    } else {
      render3DScene();
      drawTopHud();
      drawPanel();
      drawBottomToolbar();
      drawWeightGauge();
      if (state.phase === "repair") drawRepairOverlay();
      if (state.showForecast) drawForecastOverlay();
    }
  }

  function layout() {
    const w = view.width;
    const h = view.height;
    const compact = w < 820;
    const top = compact ? 72 : 84;
    const bottom = compact ? 186 : 116;
    const panelW = compact ? 0 : Math.min(330, Math.max(280, w * 0.25));
    const margin = compact ? 14 : 28;
    const roofW = w - panelW - margin * 3;
    const roofH = h - top - bottom - margin;
    const cell = Math.max(4, Math.min(roofW / COLS, roofH / ROWS));
    const gridW = cell * COLS;
    const gridH = cell * ROWS;
    view.roof = {
      x: margin + Math.max(0, (roofW - gridW) * 0.5),
      y: top + Math.max(0, (roofH - gridH) * 0.48),
      w: gridW,
      h: gridH,
      cell,
    };
    view.panel = {
      x: w - panelW - margin,
      y: top,
      w: panelW,
      h: h - top - bottom,
    };
  }

  function addButton(id, x, y, w, h, label, action, options = {}) {
    const button = {
      id,
      x,
      y,
      w,
      h,
      label,
      action,
      enabled: options.enabled !== false,
      selected: Boolean(options.selected),
      danger: Boolean(options.danger),
      subtle: Boolean(options.subtle),
    };
    view.buttons.push(button);
    drawButton(button);
    return button;
  }

  function drawButton(button) {
    const radius = Math.min(8, button.h * 0.22);
    ctx.save();
    ctx.globalAlpha = button.enabled ? 1 : 0.45;
    const fill = button.selected ? "#f8c45d" : button.danger ? "#d8664f" : button.subtle ? "#edf1e7" : "#fbf8ee";
    const stroke = button.selected ? "#6a4f18" : button.danger ? "#8b3022" : "#283432";
    roundRect(button.x, button.y, button.w, button.h, radius);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = button.selected ? 3 : 1.5;
    ctx.strokeStyle = stroke;
    ctx.stroke();
    ctx.fillStyle = button.danger ? "#fff8ef" : "#1e2b29";
    ctx.font = `${Math.max(11, Math.min(15, button.h * 0.34))}px ui-sans-serif, system-ui`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    wrapButtonText(button.label, button.x + button.w / 2, button.y + button.h / 2, button.w - 12, button.h);
    ctx.restore();
  }

  function wrapButtonText(text, cx, cy, maxWidth, height) {
    const words = String(text).split(" ");
    const lines = [];
    let current = "";
    for (const word of words) {
      const test = current ? `${current} ${word}` : word;
      if (ctx.measureText(test).width <= maxWidth || !current) {
        current = test;
      } else {
        lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
    const limited = lines.slice(0, 2);
    const lineHeight = Math.min(17, height * 0.32);
    const start = cy - ((limited.length - 1) * lineHeight) / 2;
    for (let i = 0; i < limited.length; i += 1) {
      ctx.fillText(limited[i], cx, start + i * lineHeight);
    }
  }

  function drawTitle() {
    const w = view.width;
    const h = view.height;
    const compact = w < 640;
    drawSkyGradient();
    drawSkyline(h * 0.58);
    ctx.fillStyle = "#d9d3bd";
    ctx.fillRect(0, h * 0.66, w, h * 0.34);
    drawRoofPerspective(w * (compact ? 0.2 : 0.18), h * (compact ? 0.56 : 0.55), w * (compact ? 0.62 : 0.64), h * (compact ? 0.2 : 0.23));

    ctx.fillStyle = "#162624";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `${compact ? 38 : 60}px ui-serif, Georgia, serif`;
    ctx.fillText("Growing High", w / 2, h * 0.24);
    ctx.font = `${compact ? 16 : 18}px ui-sans-serif, system-ui`;
    ctx.fillStyle = "#31423f";
    ctx.fillText("Rooftop farming strategy", w / 2, h * 0.32);
    drawCenteredWrappedText("Paint soil, plant crops, keep weight under control, then sell at market.", w / 2, h * 0.37, Math.min(w - 36, 620), compact ? 18 : 20);

    const buttonW = Math.min(compact ? 220 : 250, w - 48);
    addButton("start-new", w / 2 - buttonW / 2, h * (compact ? 0.48 : 0.46), buttonW, 54, "New rooftop", () => startNewGame(), { selected: true });
    if (hasSave()) {
      addButton("continue", w / 2 - buttonW / 2, h * (compact ? 0.57 : 0.55), buttonW, 48, "Continue", () => continueGame());
    }

    ctx.font = `${compact ? 12 : 13}px ui-sans-serif, system-ui`;
    ctx.fillStyle = "#4c5a55";
    drawCenteredWrappedText("Shortcuts: S soil, E erase, P seed, I irrigation, H harvest, Space pass/wait, F fullscreen", w / 2, h * 0.86, Math.min(w - 32, 680), compact ? 16 : 18);
  }

  function drawCity() {
    drawSkyGradient();
    drawSkyline(view.height * 0.42);
    const groundY = view.roof.y + view.roof.h + 48;
    ctx.fillStyle = "#d8d1bb";
    ctx.fillRect(0, groundY, view.width, view.height - groundY);
    ctx.fillStyle = "#ae8c63";
    ctx.fillRect(0, groundY + 8, view.width, 8);
  }

  function drawSkyGradient() {
    const gradient = ctx.createLinearGradient(0, 0, 0, view.height);
    gradient.addColorStop(0, "#b9e6f4");
    gradient.addColorStop(0.52, "#e9f4e3");
    gradient.addColorStop(1, "#f1e3c5");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, view.width, view.height);
  }

  function drawSkyline(baseY) {
    const w = view.width;
    const palette = ["#8eb1b5", "#739598", "#9bb589", "#d5a85f", "#b78062"];
    for (let i = 0; i < 12; i += 1) {
      const bw = w / 10 + (i % 3) * 18;
      const bh = 72 + (i * 37) % 110;
      const x = i * (w / 11) - 36;
      const y = baseY - bh;
      ctx.fillStyle = palette[i % palette.length];
      ctx.fillRect(x, y, bw, bh);
      ctx.fillStyle = "rgba(255, 239, 177, 0.55)";
      for (let wy = y + 18; wy < baseY - 12; wy += 24) {
        for (let wx = x + 14; wx < x + bw - 14; wx += 26) {
          if ((wx + wy + i) % 3 === 0) ctx.fillRect(wx, wy, 9, 10);
        }
      }
    }
  }

  function drawRoofPerspective(x, y, w, h) {
    ctx.save();
    ctx.fillStyle = "#ebe3cd";
    ctx.strokeStyle = "#22302d";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x + w * 0.08, y);
    ctx.lineTo(x + w, y + h * 0.1);
    ctx.lineTo(x + w * 0.88, y + h);
    ctx.lineTo(x, y + h * 0.88);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function drawRooftop() {
    const roof = view.roof;
    ctx.save();
    ctx.shadowColor = "rgba(24, 35, 34, 0.22)";
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 10;
    roundRect(roof.x - 18, roof.y - 18, roof.w + 36, roof.h + 36, 10);
    ctx.fillStyle = "#d7d0bd";
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = "#e7dfca";
    ctx.strokeStyle = "#273734";
    ctx.lineWidth = 3;
    roundRect(roof.x - 12, roof.y - 12, roof.w + 24, roof.h + 24, 8);
    ctx.fill();
    ctx.stroke();

    for (let row = 0; row < ROWS; row += 1) {
      for (let col = 0; col < COLS; col += 1) {
        drawCell(col, row);
      }
    }
    drawIrrigationPlacementGrid();
    drawPlants();
    drawWeeds();
    drawSprinklers();
    drawVolunteers();
    drawRoofDetails();
  }

  function drawCell(col, row) {
    const roof = view.roof;
    const cell = cellAt(col, row);
    const x = roof.x + col * roof.cell;
    const y = roof.y + row * roof.cell;
    if (cell.soil) {
      const soilAlpha = 0.68 + Math.min(0.25, cell.soil * 0.05);
      ctx.fillStyle = `rgba(103, 69, 38, ${soilAlpha})`;
      const daubRadius = roof.cell * (0.68 + ((col * 17 + row * 11) % 5) * 0.025);
      ctx.beginPath();
      ctx.ellipse(x + roof.cell * 0.5, y + roof.cell * 0.5, daubRadius, daubRadius * 0.82, ((col - row) % 4) * 0.25, 0, Math.PI * 2);
      ctx.fill();
      if (cell.compost > 0) {
        ctx.fillStyle = "rgba(72, 118, 42, 0.35)";
        ctx.beginPath();
        ctx.arc(x + roof.cell * 0.5, y + roof.cell * 0.5, roof.cell * 0.48, 0, Math.PI * 2);
        ctx.fill();
      }
      if (isCellIrrigated(col, row)) {
        ctx.fillStyle = "rgba(53, 160, 183, 0.28)";
        ctx.beginPath();
        ctx.arc(x + roof.cell * 0.5, y + roof.cell * 0.5, roof.cell * 0.62, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function roughRect(x, y, w, h, inset) {
    ctx.beginPath();
    ctx.moveTo(x + inset, y);
    ctx.lineTo(x + w - inset, y + 1);
    ctx.lineTo(x + w, y + h - inset);
    ctx.lineTo(x + inset, y + h);
    ctx.lineTo(x, y + inset);
    ctx.closePath();
    ctx.fill();
  }

  function drawIrrigationPlacementGrid() {
    if (state.mode !== "game" || state.phase !== "planning" || state.selectedTool !== "irrigation") return;
    const roof = view.roof;
    const hasPipes = sprinklerCount() > 0;
    const preview = irrigationPlacementPreview();

    ctx.save();
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(40, 84, 89, 0.18)";
    for (const row of IRRIGATION_SOCKET_ROWS) {
      const y = roof.y + (row + 0.5) * roof.cell;
      ctx.beginPath();
      ctx.moveTo(roof.x + 0.5 * roof.cell, y);
      ctx.lineTo(roof.x + (COLS - 0.5) * roof.cell, y);
      ctx.stroke();
    }
    for (const col of IRRIGATION_SOCKET_COLS) {
      const x = roof.x + (col + 0.5) * roof.cell;
      ctx.beginPath();
      ctx.moveTo(x, roof.y + 0.5 * roof.cell);
      ctx.lineTo(x, roof.y + (ROWS - 0.5) * roof.cell);
      ctx.stroke();
    }

    for (const row of IRRIGATION_SOCKET_ROWS) {
      for (const col of IRRIGATION_SOCKET_COLS) {
        const x = roof.x + (col + 0.5) * roof.cell;
        const y = roof.y + (row + 0.5) * roof.cell;
        const occupied = cellAt(col, row).sprinkler;
        const valid = !occupied && canPlaceIrrigationPipe(col, row, hasPipes).ok;
        const edgeStart = !hasPipes && isRoofEdgePipeStart(col, row);
        let radius = valid ? 4.8 : edgeStart ? 4.2 : 2.3;
        let fill = valid ? "rgba(41, 167, 189, 0.92)" : edgeStart ? "rgba(41, 167, 189, 0.62)" : "rgba(50, 67, 64, 0.22)";
        let stroke = valid ? "rgba(246, 252, 252, 0.92)" : "rgba(35, 49, 46, 0.14)";
        if (occupied) {
          radius = 5.2;
          fill = "rgba(92, 108, 111, 0.92)";
          stroke = "rgba(232, 238, 240, 0.9)";
        }
        if (preview && preview.col === col && preview.row === row) {
          radius = preview.valid ? 8 : 6;
          fill = preview.valid ? "rgba(18, 132, 157, 0.96)" : "rgba(185, 82, 62, 0.84)";
          stroke = "rgba(255, 255, 255, 0.96)";
        }
        ctx.fillStyle = fill;
        ctx.strokeStyle = stroke;
        ctx.lineWidth = preview && preview.col === col && preview.row === row ? 2 : 1;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawPlants() {
    const roof = view.roof;
    for (const plant of state.plants) {
      const def = cropDefs[plant.crop];
      const x = roof.x + plant.col * roof.cell;
      const y = roof.y + plant.row * roof.cell;
      const stage = plantStage(plant);
      const watered = isPlantWatered(plant);
      const rootRadius = sampleRadiusForPixels(def.rootRadius || 12) * roof.cell;
      const radius = Math.max(5, rootRadius * (stage === "harvestable" ? 0.42 : stage === "mature" ? 0.36 : stage === "sprout" ? 0.28 : 0.16));
      ctx.save();
      ctx.translate(x, y);
      ctx.strokeStyle = watered ? "rgba(45, 145, 160, 0.34)" : "rgba(65, 78, 73, 0.24)";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 5]);
      ctx.beginPath();
      ctx.arc(0, 0, rootRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = watered ? def.leaf : "#7a8a5a";
      ctx.strokeStyle = "#1e3d25";
      ctx.lineWidth = 2;
      for (let i = 0; i < 3; i += 1) {
        ctx.beginPath();
        ctx.ellipse((i - 1) * radius * 0.28, -radius * 0.15, radius * 0.24, radius * 0.58, (i - 1) * 0.75, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      if (stage === "harvestable" || stage === "mature") {
        ctx.fillStyle = def.color;
        ctx.beginPath();
        ctx.ellipse(0, radius * 0.36, radius * 0.38, radius * 0.3, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(30, 43, 41, 0.35)";
        ctx.stroke();
      } else if (stage === "seed") {
        ctx.fillStyle = def.color;
        ctx.beginPath();
        ctx.ellipse(0, radius * 0.25, radius * 0.22, radius * 0.3, 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
      if (plant.thirst > 0) {
        ctx.strokeStyle = "#c55f4e";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(radius * 0.7, -radius * 0.7, 4, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (stage === "harvestable") {
        ctx.fillStyle = "#f8c45d";
        ctx.beginPath();
        ctx.arc(radius * 0.72, -radius * 0.72, 6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  function drawWeeds() {
    const roof = view.roof;
    for (const weed of state.weeds) {
      if (!inBounds(weed.col, weed.row)) continue;
      const x = roof.x + (weed.col + 0.5) * roof.cell;
      const y = roof.y + (weed.row + 0.66) * roof.cell;
      ctx.save();
      ctx.strokeStyle = "#315f35";
      ctx.lineWidth = Math.max(2, roof.cell * 0.08);
      ctx.lineCap = "round";
      for (let i = -2; i <= 2; i += 1) {
        ctx.beginPath();
        ctx.moveTo(x + i * roof.cell * 0.08, y);
        ctx.lineTo(x + i * roof.cell * 0.08 + Math.sin(i) * roof.cell * 0.12, y - roof.cell * (0.26 + Math.abs(i) * 0.03));
        ctx.stroke();
      }
      ctx.fillStyle = "#79a54a";
      ctx.beginPath();
      ctx.ellipse(x + roof.cell * 0.12, y - roof.cell * 0.22, roof.cell * 0.09, roof.cell * 0.05, -0.6, 0, Math.PI * 2);
      ctx.ellipse(x - roof.cell * 0.1, y - roof.cell * 0.18, roof.cell * 0.08, roof.cell * 0.05, 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawSprinklers() {
    const roof = view.roof;
    ctx.save();
    ctx.strokeStyle = "#71898d";
    ctx.lineWidth = Math.max(3, roof.cell * 0.34);
    ctx.lineCap = "round";
    for (let row = 0; row < ROWS; row += 1) {
      for (let col = 0; col < COLS; col += 1) {
        if (!cellAt(col, row).sprinkler) continue;
        const x = roof.x + (col + 0.5) * roof.cell;
        const y = roof.y + (row + 0.5) * roof.cell;
        if (isRoofEdgePipeStart(col, row) && pipeNeighbours(col, row).length <= 1) {
          const edgeX = col <= 1 ? roof.x - 10 : col >= COLS - 2 ? roof.x + roof.w + 10 : x;
          const edgeY = row <= 1 ? roof.y - 10 : row >= ROWS - 2 ? roof.y + roof.h + 10 : y;
          ctx.beginPath();
          ctx.moveTo(edgeX, edgeY);
          ctx.lineTo(x, y);
          ctx.stroke();
        }
        for (const neighbour of pipeNeighbourCandidates(col, row)) {
          if (!inBounds(neighbour.col, neighbour.row) || !cellAt(neighbour.col, neighbour.row).sprinkler) continue;
          if (neighbour.col < col || neighbour.row < row) continue;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(roof.x + (neighbour.col + 0.5) * roof.cell, roof.y + (neighbour.row + 0.5) * roof.cell);
          ctx.stroke();
        }
      }
    }
    ctx.restore();

    for (let row = 0; row < ROWS; row += 1) {
      for (let col = 0; col < COLS; col += 1) {
        if (!cellAt(col, row).sprinkler) continue;
        const x = roof.x + (col + 0.5) * roof.cell;
        const y = roof.y + (row + 0.5) * roof.cell;
        ctx.strokeStyle = "rgba(41, 147, 169, 0.35)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, sampleRadiusForPixels(WATER_RADIUS) * roof.cell, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = "#e8eef0";
        ctx.strokeStyle = "#243331";
        ctx.lineWidth = 2;
        ctx.fillRect(x - 5, y - 5, 10, 12);
        ctx.strokeRect(x - 5, y - 5, 10, 12);
        ctx.beginPath();
        ctx.moveTo(x, y - 5);
        ctx.lineTo(x, y - 15);
        ctx.stroke();
        ctx.fillStyle = "#35a0b7";
        for (let i = 0; i < 5; i += 1) {
          const angle = -Math.PI * 0.85 + i * Math.PI * 0.42;
          ctx.beginPath();
          ctx.arc(x + Math.cos(angle) * 18, y - 12 + Math.sin(angle) * 10, 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  function drawVolunteers() {
    const roof = view.roof;
    for (let i = 0; i < state.volunteers.length; i += 1) {
      const volunteer = state.volunteers[i];
      const x = roof.x + volunteer.x * roof.w;
      const y = roof.y + volunteer.y * roof.h + Math.sin(volunteer.bob * 4) * 2;
      const color = i === 0 ? "#4f7ecb" : i === 1 ? "#d98845" : "#6f9f59";
      ctx.save();
      ctx.translate(x, y);
      ctx.fillStyle = "rgba(32, 45, 42, 0.18)";
      ctx.beginPath();
      ctx.ellipse(0, 16, 16, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(0, -4, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(-8, 6, 16, 18);
      ctx.fillStyle = "#f2d1aa";
      ctx.beginPath();
      ctx.arc(0, -19, 8, 0, Math.PI * 2);
      ctx.fill();
      if (volunteer.task === "water") {
        ctx.strokeStyle = "#35a0b7";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(9, 4);
        ctx.lineTo(22, -6);
        ctx.stroke();
      } else if (volunteer.task === "harvest") {
        ctx.strokeStyle = "#3f612f";
        ctx.lineWidth = 3;
        ctx.strokeRect(10, 4, 14, 12);
      } else if (volunteer.task === "weed") {
        ctx.strokeStyle = "#315f35";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(11, 5);
        ctx.lineTo(22, -8);
        ctx.lineTo(27, -4);
        ctx.stroke();
      }
      if (volunteer.task !== "idle") {
        ctx.fillStyle = "rgba(251, 248, 238, 0.92)";
        ctx.strokeStyle = "rgba(35, 49, 46, 0.28)";
        ctx.lineWidth = 1;
        roundRect(-24, -44, 48, 16, 5);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#253331";
        ctx.font = "10px ui-sans-serif, system-ui";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(volunteer.task, 0, -36);
      }
      ctx.restore();
    }
  }

  function drawRoofDetails() {
    const roof = view.roof;
    const unit = Math.max(18, roof.w / 14);
    ctx.fillStyle = "#b9b4a4";
    ctx.strokeStyle = "#273734";
    ctx.lineWidth = 2;
    roundRect(roof.x + roof.w - unit * 2.7, roof.y + unit * 0.3, unit * 2, unit * 1.4, 5);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#8b998f";
    ctx.fillRect(roof.x + roof.w - unit * 2.45, roof.y + unit * 0.58, unit * 1.5, unit * 0.28);
    ctx.fillStyle = "#374743";
    ctx.font = `${Math.max(10, unit * 0.24)}px ui-sans-serif, system-ui`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("storage", roof.x + roof.w - unit * 1.72, roof.y + unit * 1.18);
  }

  function drawTopHud() {
    const pad = view.width < 820 ? 12 : 24;
    const y = 14;
    ctx.fillStyle = "rgba(251, 248, 238, 0.9)";
    ctx.strokeStyle = "rgba(35, 49, 46, 0.28)";
    ctx.lineWidth = 1.5;
    roundRect(pad, y, view.width - pad * 2, 54, 8);
    ctx.fill();
    ctx.stroke();

    const season = currentSeason();
    ctx.fillStyle = "#1e2b29";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.font = "700 17px ui-sans-serif, system-ui";
    ctx.fillText(`Year ${state.year} ${season}`, pad + 16, y + 18);
    ctx.font = "13px ui-sans-serif, system-ui";
    ctx.fillStyle = "#4b5b56";
    ctx.fillText(`Week ${state.absoluteWeek} - ${phaseLabel()} - ${formatTime(state.minutes)}`, pad + 16, y + 38);

    ctx.textAlign = "right";
    ctx.fillStyle = "#1e2b29";
    ctx.font = "700 17px ui-sans-serif, system-ui";
    ctx.fillText(formatMoney(state.money), view.width - pad - 18, y + 18);
    ctx.font = "13px ui-sans-serif, system-ui";
    ctx.fillStyle = "#4b5b56";
    const loadPercent = Math.round((roofLoad() / state.roofLimit) * 100);
    ctx.fillText(`Roof load ${loadPercent}%`, view.width - pad - 18, y + 38);
  }

  function drawPanel() {
    if (view.panel.w <= 0) return;
    const p = view.panel;
    ctx.fillStyle = "rgba(251, 248, 238, 0.92)";
    ctx.strokeStyle = "rgba(35, 49, 46, 0.28)";
    ctx.lineWidth = 1.5;
    roundRect(p.x, p.y, p.w, p.h, 8);
    ctx.fill();
    ctx.stroke();

    let y = p.y + 22;
    ctx.fillStyle = "#1e2b29";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.font = "700 16px ui-sans-serif, system-ui";
    ctx.fillText("Planning board", p.x + 16, y);
    y += 28;
    ctx.font = "12px ui-sans-serif, system-ui";
    ctx.fillStyle = "#53625d";
    drawWrappedText(state.weather, p.x + 16, y, p.w - 32, 16);
    y += 38;
    drawWrappedText(state.marketMood, p.x + 16, y, p.w - 32, 16);
    y += 34;

    y = drawForecastPreview(p.x + 16, y, p.w - 32);
    y += 12;

    ctx.font = "700 13px ui-sans-serif, system-ui";
    ctx.fillStyle = "#253331";
    ctx.fillText("Seeds and prices", p.x + 16, y);
    y += 20;
    const seedKeys = availableCropKeys();
    const seedCols = seedKeys.length > 6 ? 3 : 2;
    const seedGap = 8;
    const seedButtonW = (p.w - 32 - seedGap * (seedCols - 1)) / seedCols;
    const seedButtonH = 36;
    const seedRowH = 42;
    for (let i = 0; i < seedKeys.length; i += 1) {
      const key = seedKeys[i];
      const def = cropDefs[key];
      const bx = p.x + 16 + (i % seedCols) * (seedButtonW + seedGap);
      const by = y + Math.floor(i / seedCols) * seedRowH;
      const price = state.prices[key] || def.saleBase;
      addButton(`seed-${key}`, bx, by, seedButtonW, seedButtonH, `${def.short} ${price}p`, () => {
        state.selectedSeed = key;
        state.selectedTool = "seed";
        state.message = `${def.name} selected. Click painted soil with a clear ${def.rootRadius || 12}px root radius.`;
      }, { selected: state.selectedSeed === key });
    }
    y += Math.ceil(seedKeys.length / seedCols) * seedRowH + 12;

    ctx.font = "700 13px ui-sans-serif, system-ui";
    ctx.fillStyle = "#253331";
    ctx.fillText("Volunteers", p.x + 16, y);
    y += 20;
    for (let i = 0; i < state.volunteers.length; i += 1) {
      const volunteer = state.volunteers[i];
      ctx.font = "12px ui-sans-serif, system-ui";
      ctx.fillStyle = "#53625d";
      ctx.fillText(`${volunteer.name}: ${volunteer.task}`, p.x + 16, y + 4);
      const taskX = p.x + 104;
      const taskGap = 6;
      const taskW = Math.max(38, (p.w - 120 - taskGap * 3) / 4);
      addButton(`vol-${i}-water`, taskX, y, taskW, 30, "Water", () => setVolunteerTask(i, "water"), { selected: volunteer.task === "water", enabled: state.phase !== "market" });
      addButton(`vol-${i}-weed`, taskX + (taskW + taskGap), y, taskW, 30, "Weed", () => setVolunteerTask(i, "weed"), { selected: volunteer.task === "weed", enabled: state.phase !== "market" });
      addButton(`vol-${i}-harvest`, taskX + (taskW + taskGap) * 2, y, taskW, 30, "Pick", () => setVolunteerTask(i, "harvest"), { selected: volunteer.task === "harvest", enabled: state.phase !== "market" });
      addButton(`vol-${i}-idle`, taskX + (taskW + taskGap) * 3, y, taskW, 30, "Idle", () => setVolunteerTask(i, "idle"), { selected: volunteer.task === "idle", enabled: state.phase !== "market" });
      y += 40;
    }

    y += 8;
    drawInventorySummary(p.x + 16, y, p.w - 32, p.y + p.h - 16);
  }

  function drawForecastPreview(x, y, w) {
    const rows = priceForecastRows();
    ctx.font = "700 13px ui-sans-serif, system-ui";
    ctx.fillStyle = "#253331";
    ctx.fillText("Weekly price forecast", x, y);
    addButton("forecast-open", x + w - 92, y - 6, 92, 26, "Open table", () => {
      state.showForecast = true;
      state.message = "Forecast table shows every unlocked crop price for this planning week.";
    }, { selected: state.showForecast });
    y += 24;

    ctx.font = "11px ui-sans-serif, system-ui";
    const previewRows = rows.slice(0, Math.min(4, rows.length));
    for (const row of previewRows) {
      const high = row.percent >= 1.15;
      const low = row.percent <= 0.85;
      ctx.fillStyle = high ? "#24663f" : low ? "#9b4638" : "#53625d";
      ctx.fillText(row.short, x, y);
      ctx.textAlign = "right";
      ctx.fillText(`${row.price}p`, x + w * 0.48, y);
      ctx.fillText(row.percentLabel, x + w * 0.72, y);
      ctx.fillText(row.seasonLabel, x + w, y);
      ctx.textAlign = "left";
      y += 15;
    }
    if (rows.length > previewRows.length) {
      ctx.fillStyle = "#53625d";
      ctx.fillText(`+${rows.length - previewRows.length} more crops in table`, x, y);
      y += 15;
    }
    return y;
  }

  function drawForecastOverlay() {
    const rows = priceForecastRows();
    const compact = view.width < 820;
    const w = Math.min(view.width - 28, compact ? 370 : 760);
    const h = Math.min(view.height - 86, 94 + rows.length * (compact ? 28 : 30));
    const x = (view.width - w) / 2;
    const y = Math.max(76, (view.height - h) / 2);

    ctx.save();
    ctx.fillStyle = "rgba(20, 31, 29, 0.42)";
    ctx.fillRect(0, 0, view.width, view.height);
    ctx.fillStyle = "rgba(251, 248, 238, 0.98)";
    ctx.strokeStyle = "rgba(35, 49, 46, 0.38)";
    ctx.lineWidth = 1.5;
    roundRect(x, y, w, h, 8);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#1e2b29";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.font = compact ? "700 17px ui-sans-serif, system-ui" : "700 20px ui-sans-serif, system-ui";
    ctx.fillText("Weekly Price Forecast", x + 18, y + 16);
    ctx.font = "12px ui-sans-serif, system-ui";
    ctx.fillStyle = "#53625d";
    ctx.fillText(`${currentSeason()} - ${rows.length} available crops - ${balanceLabel}`, x + 18, y + 42);
    addButton("forecast-close", x + w - 86, y + 14, 66, 30, "Close", () => {
      state.showForecast = false;
    });

    const tableX = x + 18;
    let rowY = y + 76;
    const cols = compact
      ? { crop: tableX, price: x + w * 0.42, trend: x + w * 0.62, grow: x + w * 0.81 }
      : { crop: tableX, price: x + w * 0.30, trend: x + w * 0.43, season: x + w * 0.56, grow: x + w * 0.72, shelf: x + w * 0.86 };

    ctx.font = "700 11px ui-sans-serif, system-ui";
    ctx.fillStyle = "#253331";
    ctx.fillText("Crop", cols.crop, rowY);
    ctx.fillText("Price", cols.price, rowY);
    ctx.fillText("Vs base", cols.trend, rowY);
    if (!compact) ctx.fillText("Season", cols.season, rowY);
    ctx.fillText("Grow", cols.grow, rowY);
    if (!compact) ctx.fillText("Shelf", cols.shelf, rowY);
    rowY += 18;

    for (const row of rows) {
      const bandFill = row.percent >= 1.15 ? "rgba(70, 145, 92, 0.12)" : row.percent <= 0.85 ? "rgba(210, 92, 72, 0.12)" : "rgba(96, 112, 106, 0.08)";
      ctx.fillStyle = bandFill;
      roundRect(tableX - 8, rowY - 7, w - 36, compact ? 24 : 26, 5);
      ctx.fill();
      ctx.font = "12px ui-sans-serif, system-ui";
      ctx.fillStyle = "#1e2b29";
      ctx.fillText(compact ? row.short : row.name, cols.crop, rowY);
      ctx.fillText(`${row.price}p`, cols.price, rowY);
      ctx.fillStyle = row.percent >= 1.15 ? "#24663f" : row.percent <= 0.85 ? "#9b4638" : "#53625d";
      ctx.fillText(row.percentLabel, cols.trend, rowY);
      ctx.fillStyle = "#53625d";
      if (!compact) ctx.fillText(`${row.seasonLabel} ${row.rangeLabel}`, cols.season, rowY);
      ctx.fillText(`${row.growDays}d`, cols.grow, rowY);
      if (!compact) ctx.fillText(`${row.shelfDays}d`, cols.shelf, rowY);
      rowY += compact ? 28 : 30;
    }
    ctx.restore();
  }

  function drawInventorySummary(x, y, w, bottomY = Infinity) {
    const compact = y + 98 > bottomY;
    ctx.font = "700 13px ui-sans-serif, system-ui";
    ctx.fillStyle = "#253331";
    ctx.fillText(compact ? "Storage / roof" : "Storage", x, y);
    y += compact ? 18 : 20;
    ctx.font = "12px ui-sans-serif, system-ui";
    ctx.fillStyle = "#53625d";
    const fresh = state.inventory.filter((item) => !item.spoiled).length;
    const spoiled = state.inventory.filter((item) => item.spoiled).length;
    drawWrappedText(compact ? `Fresh ${fresh}, spoiled ${spoiled}, compost ${state.compost}` : `Fresh boxes: ${fresh}  Spoiled: ${spoiled}  Compost: ${state.compost}`, x, y, w, 16);
    y += compact ? 18 : 20;
    const expiring = state.inventory
      .slice()
      .sort((a, b) => (a.shelfLife - a.age) - (b.shelfLife - b.age))
      .slice(0, 3)
      .map((item) => `${cropDefs[item.crop]?.short || item.crop} ${item.spoiled ? "spoiled" : `${Math.max(0, item.shelfLife - item.age)}d`}`);
    ctx.fillStyle = "#53625d";
    if (!compact) {
      drawWrappedText(expiring.length ? `Shelf life: ${expiring.join(", ")}` : "Shelf life: storage empty", x, y, w, 16);
      y += 34;
      ctx.font = "700 13px ui-sans-serif, system-ui";
      ctx.fillStyle = "#253331";
      ctx.fillText("Rooftop", x, y);
      y += 20;
    }
    ctx.font = "12px ui-sans-serif, system-ui";
    ctx.fillStyle = "#53625d";
    const roofText = compact
      ? `Roof: soil ${soilCount()}, water ${wateredCount()}, weeds ${state.weeds.length}, sprinklers ${sprinklerCount()}, plants ${state.plants.length}.`
      : `Soil ${soilCount()}, water ${wateredCount()}, weeds ${state.weeds.length}, sprinklers ${sprinklerCount()} (${formatMoney(sprinklerCost())}), plants ${state.plants.length}.`;
    drawWrappedText(roofText, x, y, w, 16);
  }

  function drawBottomToolbar() {
    const compact = view.width < 820;
    const y = view.height - (compact ? 170 : 96);
    const pad = compact ? 10 : 24;
    const h = compact ? 38 : 54;
    const gap = compact ? 6 : 10;
    const maxButtons = toolDefs.length + 4;
    const columns = compact ? 4 : maxButtons;
    const bw = compact
      ? (view.width - pad * 2 - gap * (columns - 1)) / columns
      : Math.max(64, Math.min(112, (view.width - pad * 2 - gap * (maxButtons - 1)) / maxButtons));
    const buttonItems = toolDefs.map((tool) => ({
      id: `tool-${tool.id}`,
      label: compact ? tool.label : `${tool.label} ${tool.key}`,
      enabled: state.phase === "planning" || tool.id === "harvest",
      selected: state.selectedTool === tool.id,
      action: () => {
        state.selectedTool = tool.id;
        state.message = toolMessage(tool.id);
      },
    }));

    if (compact) {
      buttonItems.push({
        id: "compact-seed-cycle",
        label: `Seed: ${cropDefs[state.selectedSeed]?.short || state.selectedSeed}`,
        enabled: state.phase === "planning",
        selected: state.selectedTool === "seed",
        action: () => cycleSelectedSeed(),
      });
      for (let i = 0; i < Math.min(2, state.volunteers.length); i += 1) {
        const volunteer = state.volunteers[i];
        buttonItems.push({
          id: `compact-vol-${i}`,
          label: `${volunteer.name}: ${volunteer.task}`,
          enabled: state.phase !== "market" && state.phase !== "repair",
          selected: volunteer.task !== "idle",
          action: () => cycleVolunteerTask(i),
        });
      }
    }

    buttonItems.push({
      id: "speed",
      label: `1h ${gameSettings.dayHourSeconds}s/${gameSettings.nightHourSeconds}s`,
      enabled: false,
      selected: state.phase === "midweek",
      action: () => {
        state.message = "The clock simulates 10-minute ticks using the level-maker day and night hour speeds.";
      },
    });

    const passLabel = state.phase === "planning" ? "Pass" : state.phase === "market" ? "End Week" : "Wait 10m";
    buttonItems.push({
      id: "primary-phase",
      label: passLabel,
      enabled: state.phase !== "repair",
      selected: state.phase === "planning" || state.phase === "market",
      action: () => {
        if (state.phase === "planning") passPlanning();
        else if (state.phase === "market") endMarketWeek();
        else if (state.phase === "midweek") {
          advanceMidweekMinutes(CLOCK_STEP_MINUTES);
          state.clockAccumulator = 0;
          state.message = "Ten in-game minutes passed; crop growth and roof state were simulated.";
          saveGame();
        }
      },
    });

    buttonItems.push({
      id: "compost",
      label: `Compost ${state.compost}`,
      enabled: state.compost > 0,
      selected: state.selectedTool === "compost",
      action: () => {
        state.selectedTool = "compost";
        state.message = "Click a planted crop to add compost to its root space.";
      },
    });

    buttonItems.push({
      id: "forecast",
      label: compact ? "Prices" : "Forecast",
      enabled: state.phase === "planning",
      selected: state.showForecast,
      action: () => {
        state.showForecast = true;
        state.message = "Forecast table shows every unlocked crop price for this planning week.";
      },
    });

    for (let i = 0; i < buttonItems.length; i += 1) {
      const item = buttonItems[i];
      const row = compact ? Math.floor(i / columns) : 0;
      const col = compact ? i % columns : i;
      const x = pad + col * (bw + gap);
      const by = y + row * (h + gap);
      addButton(item.id, x, by, bw, h, item.label, item.action, {
        selected: item.selected,
        enabled: item.enabled,
      });
    }

    const msgY = y - 38;
    ctx.fillStyle = "rgba(251, 248, 238, 0.88)";
    ctx.strokeStyle = "rgba(35, 49, 46, 0.25)";
    const msgMaxW = view.panel.w > 0 ? Math.max(360, view.panel.x - pad - 12) : view.width - pad * 2;
    const msgW = Math.min(msgMaxW, 920);
    roundRect(pad, msgY, msgW, 28, 7);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#253331";
    ctx.font = "13px ui-sans-serif, system-ui";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    drawWrappedText(state.message, pad + 12, msgY + 8, msgW - 24, 14);
  }

  function toolMessage(tool) {
    if (tool === "soil") return "Drag across the rooftop to paint soil mass.";
    if (tool === "erase") return "Drag to remove soil, sprinklers, or crops. Removed crops become compost.";
    if (tool === "seed") return "Move over painted soil to preview the circular root radius; click green space to plant.";
    if (tool === "irrigation") return `Click highlighted pipe sockets. First start on a roof edge for ${formatMoney(sprinklerCost())}; then extend from open sockets.`;
    if (tool === "harvest") return "Click harvestable crops, or assign a volunteer to harvest.";
    return "Select a tool and work the rooftop.";
  }

  function drawWeightGauge() {
    const compact = view.width < 820;
    const pad = compact ? 10 : 24;
    const x = pad;
    const y = view.height - (compact ? 24 : 34);
    const w = view.width - pad * 2;
    const h = compact ? 14 : 16;
    const load = roofLoad();
    const t = Math.max(0, Math.min(1.35, load / state.roofLimit));
    if (!compact && state.phase !== "market") {
      ctx.fillStyle = "#253331";
      ctx.font = "12px ui-sans-serif, system-ui";
      ctx.textAlign = "left";
      ctx.textBaseline = "bottom";
      ctx.fillText("Roof weight", x, y - 5);
    }
    roundRect(x, y, w, h, 8);
    ctx.fillStyle = "#e8e1cd";
    ctx.fill();
    ctx.strokeStyle = "#253331";
    ctx.stroke();
    const fillW = Math.min(w, w * t);
    const color = t > 1 ? "#c94f3d" : t > 0.82 ? "#d89a35" : "#5e9f61";
    roundRect(x, y, fillW, h, 8);
    ctx.fillStyle = color;
    ctx.fill();
    if (t > 1) {
      ctx.fillStyle = "#fff8ed";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "700 11px ui-sans-serif, system-ui";
      ctx.fillText(`OVERLOAD DAY ${Math.ceil(state.overloadDays)}`, x + w * 0.5, y + h * 0.52);
    }
  }

  function drawMarket() {
    const compact = view.width < 820;
    drawSkyGradient();
    drawSkyline(view.height * 0.42);
    const tableY = view.height * 0.64;
    ctx.fillStyle = "#d9be83";
    ctx.fillRect(0, tableY, view.width, view.height - tableY);
    ctx.fillStyle = "#9f6d43";
    ctx.fillRect(0, tableY, view.width, 14);

    drawTopHud();

    const stallX = compact ? 18 : view.width * 0.08;
    const stallY = compact ? 92 : view.height * 0.28;
    const stallW = compact ? view.width - 36 : view.width * 0.42;
    const stallH = compact ? 168 : view.height * 0.34;
    drawProduceStall(stallX, stallY, stallW, stallH, compact);
    drawMarketShoppers(stallX, stallY, stallW, stallH, compact);

    const cardX = compact ? 18 : view.width * 0.55;
    const cardY = compact ? 258 : view.height * 0.25;
    const cardW = compact ? view.width - 36 : Math.min(420, view.width * 0.37);
    drawMarketCard(cardX, cardY, cardW);
    drawBottomMarketControls();
    drawWeightGauge();
  }

  function drawProduceStall(x, y, w, h, compact) {
    ctx.fillStyle = "#fbf8ee";
    ctx.strokeStyle = "#253331";
    ctx.lineWidth = 3;
    roundRect(x, y, w, h, 8);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#1e2b29";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.font = `${compact ? 20 : 24}px ui-sans-serif, system-ui`;
    ctx.fillText("Market Stall", x + 24, y + 22);
    ctx.font = `${compact ? 12 : 14}px ui-sans-serif, system-ui`;
    ctx.fillStyle = "#4c5b55";
    drawWrappedText("You man the counter while patrons stop with produce requests.", x + 24, y + 58, w - 48, compact ? 15 : 18);

    const counterY = y + h - (compact ? 70 : 88);
    ctx.fillStyle = "#d79f49";
    ctx.beginPath();
    ctx.moveTo(x + 22, y + 92);
    ctx.lineTo(x + w - 22, y + 92);
    ctx.lineTo(x + w - 38, y + 126);
    ctx.lineTo(x + 38, y + 126);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(35, 49, 46, 0.22)";
    ctx.lineWidth = 1.2;
    for (let stripe = 0; stripe < 6; stripe += 1) {
      const sx = x + 40 + stripe * ((w - 80) / 5);
      ctx.beginPath();
      ctx.moveTo(sx, y + 92);
      ctx.lineTo(sx - 10, y + 126);
      ctx.stroke();
    }

    ctx.fillStyle = "#5e9f61";
    roundRect(x + 20, counterY, w - 40, 24, 8);
    ctx.fill();
    ctx.fillStyle = "#9f6d43";
    ctx.fillRect(x + 20, counterY + 18, w - 40, compact ? 34 : 48);

    const playerX = x + w * 0.22;
    const playerY = counterY + (compact ? 8 : 2);
    drawPerson(playerX, playerY, "#6f9f59", 0.2);
    ctx.fillStyle = "rgba(251, 248, 238, 0.94)";
    ctx.strokeStyle = "rgba(35, 49, 46, 0.25)";
    ctx.lineWidth = 1.2;
    roundRect(playerX - 34, playerY - 66, 68, 24, 7);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#1e2b29";
    ctx.font = "700 11px ui-sans-serif, system-ui";
    ctx.textAlign = "center";
    ctx.fillText("you", playerX, playerY - 52);

    const counts = freshInventoryByCrop();
    const crops = Object.keys(counts).filter((key) => cropDefs[key]);
    if (!crops.length) {
      ctx.fillStyle = "#53625d";
      ctx.font = "13px ui-sans-serif, system-ui";
      ctx.fillText("The stall is empty. Harvest produce before market day.", x + 28, counterY - 28);
      return;
    }
    const totalFresh = crops.reduce((sum, key) => sum + counts[key], 0);
    const pileSlots = Math.min(compact ? 5 : 8, Math.max(crops.length, Math.min(8, totalFresh + 2)));
    for (let i = 0; i < pileSlots; i += 1) {
      const key = crops[i % crops.length];
      const def = cropDefs[key];
      const cx = x + 44 + i * ((w - 88) / Math.max(1, pileSlots - 1));
      const cy = counterY - 18 - (i % 2) * 13 + Math.sin(state.minutes * 0.018 + i) * 2;
      const qty = counts[key];
      ctx.fillStyle = "#c68d52";
      roundRect(cx - 24, cy + 12, 48, 28, 5);
      ctx.fill();
      ctx.strokeStyle = "rgba(35, 49, 46, 0.22)";
      ctx.stroke();
      ctx.fillStyle = def.color;
      for (let j = 0; j < Math.min(10, qty + 4); j += 1) {
        ctx.beginPath();
        ctx.ellipse(cx + (j % 5) * 7 - 15, cy + Math.floor(j / 5) * 7, 12, 8, (j % 3) * 0.35, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = def.leaf;
      ctx.font = "700 11px ui-sans-serif, system-ui";
      ctx.textAlign = "center";
	      ctx.fillText(i < crops.length ? `${def.short} x${qty}` : def.short, cx, cy + 43);
    }
  }

  function drawMarketShoppers(stallX, stallY, stallW, stallH, compact) {
    const offers = state.marketOffers.length ? state.marketOffers : generateMarketOffers();
    const baseY = stallY + stallH + (compact ? 52 : 76);
    for (let i = 0; i < Math.max(2, offers.length); i += 1) {
      const offer = offers[i];
      const progress = (Math.sin(state.minutes * 0.012 + i * 1.7) + 1) / 2;
      const x = compact
        ? stallX + stallW * (0.66 + i * 0.12) - progress * 64
        : stallX + stallW - 34 + i * 78 - progress * 96;
      const y = baseY + (i % 2) * 22;
      const color = i === 0 ? "#d98845" : i === 1 ? "#4f7ecb" : "#6f9f59";
      drawPerson(x, y, color, 1 + i * 0.12);
      if (offer) drawOfferBubble(x + 18, y - 72, offer, compact);
    }
  }

  function drawPerson(x, y, color, bob) {
    ctx.save();
    ctx.translate(x, y + Math.sin(state.minutes * 0.06 + bob) * 2);
    ctx.fillStyle = "rgba(32, 45, 42, 0.18)";
    ctx.beginPath();
    ctx.ellipse(0, 20, 18, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(0, -8, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(-10, 6, 20, 26);
    ctx.fillStyle = "#f2d1aa";
    ctx.beginPath();
    ctx.arc(0, -27, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawOfferBubble(x, y, offer, compact) {
    const w = compact ? 104 : 126;
    const h = compact ? 44 : 52;
    const def = cropDefs[offer.crop];
    ctx.fillStyle = "rgba(251, 248, 238, 0.96)";
    ctx.strokeStyle = "rgba(35, 49, 46, 0.35)";
    ctx.lineWidth = 1.5;
    roundRect(x, y, w, h, 10);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = def?.color || "#70a95f";
    ctx.beginPath();
    ctx.ellipse(x + 18, y + h / 2, 12, 9, -0.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#1e2b29";
    ctx.font = "700 12px ui-sans-serif, system-ui";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(`${def?.short || offer.crop} x${offer.qty}`, x + 36, y + h * 0.38);
    ctx.fillStyle = "#53625d";
    ctx.font = "12px ui-sans-serif, system-ui";
    ctx.fillText(`${offer.price}p`, x + 36, y + h * 0.68);
  }

  function drawNeighbourhoodContacts(compact) {
    const labels = [
      ["restaurant", "Chef"],
      ["carpenter", "Carp"],
      ["engineer", "Eng"],
      ["social", "Social"],
      ["mushroom", "Mush"],
      ["beekeeper", "Bee"],
    ];
    const startX = compact ? 18 : view.width * 0.08;
    const y = compact ? 198 : 104;
    const w = compact ? Math.max(48, (view.width - 48) / 3) : 78;
    const h = compact ? 24 : 26;
    for (let i = 0; i < labels.length; i += 1) {
      const [key, label] = labels[i];
      const col = compact ? i % 3 : i;
      const row = compact ? Math.floor(i / 3) : 0;
      const x = startX + col * (w + 8);
      addButton(`street-${key}`, x, y + row * (h + 7), w, h, label, () => {
        state.message = `${label} spotted in the neighbourhood. Use a fresh produce gift to build favour.`;
        if (state.inventory.some((item) => !item.spoiled)) giftToNpc(key);
      }, { subtle: true });
    }
  }

  function drawMarketCard(x, y, w) {
    ctx.fillStyle = "rgba(251, 248, 238, 0.94)";
    ctx.strokeStyle = "rgba(35, 49, 46, 0.35)";
    ctx.lineWidth = 1.5;
    roundRect(x, y, w, 300, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#1e2b29";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.font = "700 16px ui-sans-serif, system-ui";
    ctx.fillText("Shopper requests", x + 16, y + 16);
    ctx.font = "12px ui-sans-serif, system-ui";
    ctx.fillStyle = "#53625d";
    ctx.fillText(`Fresh produce boxes: ${state.inventory.filter((item) => !item.spoiled).length}`, x + 16, y + 40);

    if (!state.marketOffers.length) state.marketOffers = generateMarketOffers();
    let rowY = y + 66;
    if (!state.marketOffers.length) {
      ctx.fillStyle = "#53625d";
      drawWrappedText("No shoppers are making offers because the stall has no fresh produce.", x + 16, rowY, w - 32, 17);
      rowY += 54;
    }
    for (let i = 0; i < Math.min(3, state.marketOffers.length); i += 1) {
      const offer = state.marketOffers[i];
      const def = cropDefs[offer.crop];
      ctx.fillStyle = "rgba(96, 112, 106, 0.08)";
      roundRect(x + 16, rowY, w - 32, 42, 8);
      ctx.fill();
      ctx.fillStyle = def?.color || "#70a95f";
      ctx.beginPath();
      ctx.ellipse(x + 36, rowY + 21, 12, 8, -0.25, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#1e2b29";
      ctx.font = "700 12px ui-sans-serif, system-ui";
      ctx.fillText(`${offer.npc} asks for ${def?.name || offer.crop} x${offer.qty}`, x + 56, rowY + 8);
      ctx.fillStyle = "#53625d";
      ctx.font = "12px ui-sans-serif, system-ui";
      ctx.fillText(`${formatMoney(offer.price)} offer`, x + 56, rowY + 24);
      addButton(`accept-offer-${i}`, x + w - 96, rowY + 7, 72, 28, "Bag", () => acceptMarketOffer(i), { selected: i === 0 });
      rowY += 50;
    }

    const half = (w - 42) / 2;
    addButton("sell-all", x + 16, y + 220, half, 34, "Clear stall", () => sellAll(), { subtle: true });
    addButton("compost-spoiled", x + 26 + half, y + 220, half, 34, "Compost spoiled", () => compostSpoiled(), { subtle: true });
    addButton("refresh-offers", x + 16, y + 262, w - 32, 28, "Next patrons", () => {
      state.marketOffers = generateMarketOffers();
      state.message = state.marketOffers.length ? "New patrons step up to the stall." : "No fresh produce for shoppers to buy.";
    }, { selected: true });
  }

  function drawBottomMarketControls() {
    const y = view.height - 96;
    const pad = view.width < 820 ? 10 : 24;
    addButton("market-end-week", pad, y, 150, 54, "End Week", () => endMarketWeek(), { selected: true });
    const x = pad + 166;
    ctx.fillStyle = "rgba(251, 248, 238, 0.88)";
    ctx.strokeStyle = "rgba(35, 49, 46, 0.25)";
    roundRect(x, y, Math.min(780, view.width - x - pad), 54, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#253331";
    ctx.font = "13px ui-sans-serif, system-ui";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    drawWrappedText(state.message, x + 14, y + 15, Math.min(740, view.width - x - pad - 28), 17);
  }

  function drawRepairOverlay() {
    const roof = view.roof;
    ctx.save();
    ctx.fillStyle = "rgba(221, 207, 171, 0.72)";
    ctx.fillRect(roof.x - 16, roof.y - 16, roof.w + 32, roof.h + 32);
    ctx.strokeStyle = "#c05d39";
    ctx.lineWidth = 4;
    for (let x = roof.x - 10; x < roof.x + roof.w + 20; x += 38) {
      ctx.beginPath();
      ctx.moveTo(x, roof.y - 14);
      ctx.lineTo(x + 44, roof.y + roof.h + 16);
      ctx.stroke();
    }
    ctx.fillStyle = "#253331";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "700 26px ui-sans-serif, system-ui";
    ctx.fillText("Construction crew on site", roof.x + roof.w / 2, roof.y + roof.h / 2 - 18);
    ctx.font = "15px ui-sans-serif, system-ui";
    ctx.fillText(`${state.repairDaysLeft} repair day${state.repairDaysLeft === 1 ? "" : "s"} left`, roof.x + roof.w / 2, roof.y + roof.h / 2 + 18);
    ctx.restore();
  }

  function drawWrappedText(text, x, y, maxWidth, lineHeight) {
    const words = String(text).split(" ");
    let line = "";
    let cursorY = y;
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        ctx.fillText(line, x, cursorY);
        line = word;
        cursorY += lineHeight;
      } else {
        line = test;
      }
    }
    if (line) ctx.fillText(line, x, cursorY);
  }

  function drawCenteredWrappedText(text, cx, y, maxWidth, lineHeight) {
    const words = String(text).split(" ");
    const lines = [];
    let line = "";
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let i = 0; i < lines.length; i += 1) {
      ctx.fillText(lines[i], cx, y + i * lineHeight);
    }
  }

  function gridFromPoint2D(x, y) {
    const roof = view.roof;
    const col = Math.floor((x - roof.x) / roof.cell);
    const row = Math.floor((y - roof.y) / roof.cell);
    if (!inBounds(col, row)) return null;
    return { col, row };
  }

  function pick3DCellFromPoint(x, y) {
    if (!sceneCanvas || state.mode !== "game" || state.phase === "market") return null;
    initThree();
    if (!three.initialized) return null;
    sync3DCamera();
    const rect = sceneCanvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;

    three.pointer.set((x / rect.width) * 2 - 1, -((y / rect.height) * 2 - 1));
    three.raycaster.setFromCamera(three.pointer, three.camera);
    const hit = three.raycaster.ray.intersectPlane(three.pickPlane, three.pickHit);
    if (!hit) return null;

    const localX = hit.x - three.world.position.x;
    const localZ = hit.z - three.world.position.z;
    const col = Math.floor(localX / CELL_3D + COLS / 2);
    const row = Math.floor(localZ / CELL_3D + ROWS / 2);
    if (!inBounds(col, row)) return null;
    return { col, row };
  }

  function gridFromPoint(x, y) {
    return pick3DCellFromPoint(x, y) || gridFromPoint2D(x, y);
  }

  function cellScreenPoint(col, row) {
    if (!sceneCanvas || !inBounds(col, row)) return null;
    initThree();
    if (!three.initialized) return null;
    sync3DCamera();
    const rect = sceneCanvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    three.screenPoint
      .set(boardX(col), PICK_PLANE_Y, boardZ(row))
      .add(three.world.position)
      .project(three.camera);
    return {
      x: rect.left + (three.screenPoint.x + 1) * 0.5 * rect.width,
      y: rect.top + (1 - (three.screenPoint.y + 1) * 0.5) * rect.height,
    };
  }

  function handleCanvasAction(x, y, dragging) {
    if (state.mode !== "game") return;
    if (state.phase !== "planning" && state.selectedTool !== "harvest" && state.selectedTool !== "erase" && state.selectedTool !== "compost") {
      return;
    }
    const cell = gridFromPoint(x, y);
    if (!cell) return;
    const key = `${cell.col}:${cell.row}:${state.selectedTool}`;
    if (dragging && key === input.lastCellKey) return;
    input.lastCellKey = key;

    if (state.selectedTool === "soil") {
      if (state.phase !== "planning") return;
      paintSoilAt(cell.col, cell.row);
    } else if (state.selectedTool === "erase") {
      if (state.phase !== "planning") return;
      eraseAt(cell.col, cell.row);
    } else if (state.selectedTool === "seed" && !dragging) {
      if (state.phase !== "planning") return;
      plantSeed(cell.col, cell.row);
    } else if (state.selectedTool === "irrigation" && !dragging) {
      if (state.phase !== "planning") return;
      placeSprinkler(cell.col, cell.row);
    } else if (state.selectedTool === "harvest" && !dragging) {
      const plant = plantAt(cell.col, cell.row);
      if (plant && harvestPlant(plant, "player")) {
        saveGame();
      } else {
        state.message = "That crop is not ready to harvest yet.";
      }
    } else if (state.selectedTool === "compost" && !dragging) {
      applyCompost(cell.col, cell.row);
    }
  }

  function handlePointerDown(event) {
    const point = eventPoint(event);
    ensureAudio();
    playUiSound("tap");
    input.pointerDown = true;
    input.x = point.x;
    input.y = point.y;
    input.lastCellKey = "";
    canvas.setPointerCapture?.(event.pointerId);

    for (let i = view.buttons.length - 1; i >= 0; i -= 1) {
      const button = view.buttons[i];
      if (!button.enabled) continue;
      if (point.x >= button.x && point.x <= button.x + button.w && point.y >= button.y && point.y <= button.y + button.h) {
        button.action();
        input.pointerDown = false;
        event.preventDefault();
        return;
      }
    }

    if (state.showForecast) {
      state.showForecast = false;
      event.preventDefault();
      return;
    }

    handleCanvasAction(point.x, point.y, false);
    event.preventDefault();
  }

  function handlePointerMove(event) {
    const point = eventPoint(event);
    input.x = point.x;
    input.y = point.y;
    if (input.pointerDown) {
      handleCanvasAction(point.x, point.y, true);
    }
    event.preventDefault();
  }

  function handlePointerUp(event) {
    input.pointerDown = false;
    input.lastCellKey = "";
    canvas.releasePointerCapture?.(event.pointerId);
    event.preventDefault();
  }

  function eventPoint(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }

  function handleKey(event) {
    if (event.key === "f" || event.key === "F") {
      toggleFullscreen();
      return;
    }
    if (state.mode === "title") {
      if (event.key === "Enter" || event.key === " ") {
        startNewGame();
        event.preventDefault();
      }
      return;
    }
    const key = event.key.toLowerCase();
    if (key === "s") state.selectedTool = "soil";
    if (key === "e") state.selectedTool = "erase";
    if (key === "p") state.selectedTool = "seed";
    if (key === "i") state.selectedTool = "irrigation";
    if (key === "h") state.selectedTool = "harvest";
    if (event.key === " ") {
      if (state.phase === "planning") passPlanning();
      else if (state.phase === "midweek") {
        advanceMidweekMinutes(CLOCK_STEP_MINUTES);
        state.clockAccumulator = 0;
        state.message = "Ten in-game minutes passed; crop growth and roof state were simulated.";
        saveGame();
      }
      else if (state.phase === "market") endMarketWeek();
      event.preventDefault();
    }
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen?.();
    } else {
      canvas.requestFullscreen?.();
    }
  }

  function roundRect(x, y, w, h, r) {
    const radius = Math.max(0, Math.min(r, Math.min(w, h) / 2));
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

  function loop(now) {
    const dt = Math.min(0.1, (now - lastFrame) / 1000);
    lastFrame = now;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  function gameTextPayload() {
    const visiblePlants = state.plants.map((plant) => {
      const def = cropDefs[plant.crop];
      return {
        crop: def ? def.name : plant.crop,
        key: plant.crop,
        col: plant.col,
        row: plant.row,
        rootRadiusPx: def?.rootRadius || 12,
        rootSamples: rootCells(plant).length,
        stage: plantStage(plant),
        watered: isPlantWatered(plant),
        weeded: !plantHasWeeds(plant),
        growthDays: Math.round(plant.growthDays * 10) / 10,
        growDays: def ? def.growDays : 0,
        recurrent: Boolean(def?.fruitLoad),
        fruitReady: Boolean(plant.fruitReady),
        fruitDays: Math.round((plant.fruitDays || 0) * 10) / 10,
        fruitInterval: def?.fruitInterval || 0,
        thirst: Math.round((plant.thirst || 0) * 10) / 10,
      };
    });
    const inventory = {};
    for (const item of state.inventory) {
      const key = `${item.spoiled ? "spoiled " : "fresh "}${cropDefs[item.crop]?.name || item.crop}`;
      inventory[key] = (inventory[key] || 0) + item.qty;
    }
    return {
      coordinateSystem: "analog roof samples: origin top-left, col increases right, row increases down; soil simulation grid is hidden, irrigation sockets become visible when the Irrigate tool is selected",
      visualMode: "3d rooftop scene with 2d HUD overlay",
      mode: state.mode,
      phase: state.phase,
      year: state.year,
      month: state.month,
      week: state.absoluteWeek,
      weekInMonth: state.weekInMonth,
      day: state.day,
      time: formatTime(state.minutes),
      clock: {
        stepMinutes: CLOCK_STEP_MINUTES,
        dayHourSeconds: gameSettings.dayHourSeconds,
        nightHourSeconds: gameSettings.nightHourSeconds,
        daytimeStepSeconds: clockStepSeconds("midweek", DAY_START_MINUTES),
        nightStepSeconds: clockStepSeconds("midweek", 18 * 60),
        repairStepSeconds: gameSettings.repairStepSeconds,
        midweekDays: midweekDays(),
        accumulator: Math.round((state.clockAccumulator || 0) * 10) / 10,
      },
      season: currentSeason(),
      money: Math.round(state.money),
      selectedTool: state.selectedTool,
      selectedSeed: cropDefs[state.selectedSeed]?.name || state.selectedSeed,
      unlockedSeeds: availableCropKeys().map((key) => cropDefs[key].name),
      forecastOpen: state.showForecast,
      balance: {
        source: balanceSource,
        label: balanceLabel,
        adminUrl: "./balance-admin.html",
        settings: { ...gameSettings },
      },
      priceForecast: priceForecastRows(),
      roof: {
        load: Math.round(roofLoad()),
        limit: Math.round(state.roofLimit),
        loadPercent: Math.round((roofLoad() / state.roofLimit) * 100),
        overloadDays: state.overloadDays,
      },
      rooftop: {
        soilSamples: soilCount(),
        wateredSamples: wateredCount(),
        sprinklers: sprinklerCount(),
        irrigationModel: "edge-started overhead pipe network; visible pipe sockets snap orthogonally to one open side and nozzles do not consume root space",
        irrigationGrid: irrigationSocketSummary(),
        sprinklerCost: sprinklerCost(),
        compost: state.compost,
        weeds: state.weeds.length,
        stallHelpers: stallVolunteerCount(),
      },
      rootPreview: rootPreview(),
      irrigationPreview: irrigationPlacementPreview(),
      services: {
        toolDiscount: state.toolDiscount || 0,
        pollinatorBonus: state.pollinatorBonus || 0,
        soilBonus: state.soilBonus || 0,
        mulchBonus: state.mulchBonus || 0,
        hubReputation: state.hubReputation || 0,
      },
      repairDaysLeft: state.repairDaysLeft,
      collapseCount: state.collapseCount,
      favour: { ...state.favour },
      plants: visiblePlants,
      weeds: state.weeds.map((weed) => ({ col: weed.col, row: weed.row, age: weed.age || 0 })),
      inventory,
      inventoryDetails: state.inventory.map((item) => ({
        crop: cropDefs[item.crop]?.name || item.crop,
        age: item.age,
        shelfLife: item.shelfLife,
        remainingShelfLife: Math.max(0, item.shelfLife - item.age),
        spoiled: item.spoiled,
      })),
      marketOffers: state.marketOffers.map((offer) => ({
        npc: offer.npc,
        crop: cropDefs[offer.crop]?.name || offer.crop,
        qty: offer.qty,
        price: offer.price,
      })),
      volunteers: state.volunteers.map((volunteer) => ({
        name: volunteer.name,
        task: volunteer.task,
        x: Math.round(volunteer.x * 100) / 100,
        y: Math.round(volunteer.y * 100) / 100,
        actionTimer: Math.round((volunteer.actionTimer || 0) * 10) / 10,
      })),
      stats: { ...state.stats },
      message: state.message,
    };
  }

  function reachPayload() {
    layout();
    const items = view.buttons
      .filter((button) => button.enabled)
      .map((button) => ({
        id: button.id,
        label: button.label,
        x: Math.round(button.x),
        y: Math.round(button.y),
        w: Math.round(button.w),
        h: Math.round(button.h),
      }));
    if (state.mode !== "title") {
      items.push({
        id: "roof-paint-area",
        x: Math.round(view.roof.x),
        y: Math.round(view.roof.y),
        w: Math.round(view.roof.w),
        h: Math.round(view.roof.h),
      });
      items.push({
        id: "roof-grid",
        x: Math.round(view.roof.x),
        y: Math.round(view.roof.y),
        w: Math.round(view.roof.w),
        h: Math.round(view.roof.h),
      });
      if (state.phase === "planning" && state.selectedTool === "irrigation") {
        const sockets = irrigationSocketSummary(24).validSockets;
        for (const socket of sockets) {
          const x = view.roof.x + (socket.col + 0.5) * view.roof.cell;
          const y = view.roof.y + (socket.row + 0.5) * view.roof.cell;
          items.push({
            id: `irrigation-socket-${socket.col}-${socket.row}`,
            x: Math.round(x - 8),
            y: Math.round(y - 8),
            w: 16,
            h: 16,
          });
        }
      }
      for (const plant of state.plants.slice(0, 12)) {
        const def = cropDefs[plant.crop];
        const radius = sampleRadiusForPixels(def?.rootRadius || 12) * view.roof.cell;
        items.push({
          id: `plant-${plant.col}-${plant.row}`,
          x: Math.round(view.roof.x + plant.col * view.roof.cell - radius),
          y: Math.round(view.roof.y + plant.row * view.roof.cell - radius),
          w: Math.round(radius * 2),
          h: Math.round(radius * 2),
        });
      }
    }
    return {
      screen: state.mode === "title" ? "title" : state.phase,
      viewportH: view.height,
      screenH: view.height,
      items,
    };
  }

  window.render_game_to_text = () => JSON.stringify(gameTextPayload());
  window.__growingHighReach = reachPayload;
  window.__growingHighCellToScreen = cellScreenPoint;
  window.__growingHighPickCell = gridFromPoint;
  window.advanceTime = (ms) => {
    const steps = Math.max(1, Math.ceil(ms / (1000 / 30)));
    const dt = ms / steps / 1000;
    for (let i = 0; i < steps; i += 1) {
      update(dt);
    }
    draw();
  };

  window.addEventListener("resize", resize);
  window.addEventListener("keydown", handleKey);
  canvas.addEventListener("pointerdown", handlePointerDown);
  canvas.addEventListener("pointermove", handlePointerMove);
  canvas.addEventListener("pointerup", handlePointerUp);
  canvas.addEventListener("pointercancel", handlePointerUp);
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());

  registerPlatformAudioPause();
  hydrateState();
  state.prices = generatePrices();
  maybeAutostart();
  resize();
  signalPlatformReady();
  requestAnimationFrame((now) => {
    lastFrame = now;
    requestAnimationFrame(loop);
  });
})();
