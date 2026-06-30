import * as THREE from "./three.module.js";

(() => {
  "use strict";

  const canvas = document.getElementById("game");
  const sceneCanvas = document.getElementById("scene3d");
  const ctx = canvas.getContext("2d");

  const STORAGE_KEY = "growing-high-v1";
  const COLS = 14;
  const ROWS = 9;
  const CELL_SOIL_LOAD = 8;
  const CELL_WATER_LOAD = 3;
  const SPRINKLER_LOAD = 18;
  const PEOPLE_LOAD = 44;
  const TOOL_LOAD = 18;
  const DAY_MINUTES = 1440;
  const VOLUNTEER_ACTION_SECONDS = 0.85;
  const WEED_SPAWN_CHANCE = 0.22;

  const cropDefs = {
    carrot: {
      key: "carrot",
      name: "Carrot",
      short: "Carrot",
      growDays: 18,
      seedCost: 8,
      saleBase: 35,
      saplingLoad: 4,
      harvestLoad: 15,
      shelfLife: 14,
      seasons: ["Spring", "Autumn"],
      color: "#e26d3f",
      leaf: "#3e8f42",
    },
    bokChoy: {
      key: "bokChoy",
      name: "Bok Choy",
      short: "Bok",
      growDays: 12,
      seedCost: 12,
      saleBase: 80,
      saplingLoad: 20,
      harvestLoad: 40,
      shelfLife: 7,
      seasons: ["Spring", "Autumn"],
      color: "#f2f7d8",
      leaf: "#55a95d",
    },
    cilantro: {
      key: "cilantro",
      name: "Cilantro",
      short: "Cilantro",
      growDays: 12,
      seedCost: 6,
      saleBase: 30,
      saplingLoad: 4,
      harvestLoad: 8,
      shelfLife: 7,
      seasons: ["Spring", "Autumn"],
      color: "#6fbf5f",
      leaf: "#2e8740",
    },
    parsnip: {
      key: "parsnip",
      name: "Parsnip",
      short: "Parsnip",
      growDays: 30,
      seedCost: 8,
      saleBase: 35,
      saplingLoad: 6,
      harvestLoad: 30,
      shelfLife: 14,
      seasons: ["Spring", "Summer", "Autumn", "Winter"],
      color: "#ead9a8",
      leaf: "#4c9d46",
    },
    onion: {
      key: "onion",
      name: "Onion",
      short: "Onion",
      growDays: 30,
      seedCost: 20,
      saleBase: 100,
      saplingLoad: 7,
      harvestLoad: 20,
      shelfLife: 28,
      seasons: ["Spring", "Autumn"],
      color: "#d4b47a",
      leaf: "#5d9d55",
    },
    redCabbage: {
      key: "redCabbage",
      name: "Red Cabbage",
      short: "Cabbage",
      growDays: 24,
      seedCost: 24,
      saleBase: 90,
      saplingLoad: 75,
      harvestLoad: 150,
      shelfLife: 14,
      seasons: ["Spring", "Autumn"],
      color: "#9b4f9e",
      leaf: "#6b9b5a",
    },
    potato: {
      key: "potato",
      name: "Potato",
      short: "Potato",
      growDays: 24,
      seedCost: 18,
      saleBase: 80,
      saplingLoad: 30,
      harvestLoad: 150,
      shelfLife: 84,
      seasons: ["Spring", "Summer"],
      color: "#b98e58",
      leaf: "#4f8b49",
    },
    lettuce: {
      key: "lettuce",
      name: "Lettuce",
      short: "Lettuce",
      growDays: 18,
      seedCost: 16,
      saleBase: 70,
      saplingLoad: 15,
      harvestLoad: 30,
      shelfLife: 7,
      seasons: ["Spring", "Autumn"],
      color: "#9ed66a",
      leaf: "#65a84d",
    },
    tomato: {
      key: "tomato",
      name: "Tomato",
      short: "Tomato",
      growDays: 18,
      seedCost: 20,
      saleBase: 60,
      saplingLoad: 70,
      harvestLoad: 230,
      fruitLoad: 20,
      fruitInterval: 5,
      shelfLife: 7,
      seasons: ["Summer"],
      color: "#d95346",
      leaf: "#3f8b4a",
    },
    pumpkin: {
      key: "pumpkin",
      name: "Pumpkin",
      short: "Pumpkin",
      growDays: 24,
      seedCost: 60,
      saleBase: 320,
      saplingLoad: 300,
      harvestLoad: 800,
      fruitLoad: 600,
      fruitInterval: 10,
      shelfLife: 28,
      seasons: ["Summer", "Autumn"],
      color: "#dc8a2c",
      leaf: "#4f8d3d",
    },
    leek: {
      key: "leek",
      name: "Leek",
      short: "Leek",
      growDays: 24,
      seedCost: 22,
      saleBase: 110,
      saplingLoad: 13,
      harvestLoad: 30,
      shelfLife: 7,
      seasons: ["Autumn", "Winter"],
      color: "#d7e6ce",
      leaf: "#4b9551",
    },
    garlic: {
      key: "garlic",
      name: "Garlic",
      short: "Garlic",
      growDays: 54,
      seedCost: 14,
      saleBase: 60,
      saplingLoad: 5,
      harvestLoad: 13,
      shelfLife: 56,
      seasons: ["Autumn", "Winter", "Spring"],
      color: "#efe6d3",
      leaf: "#6f9b5f",
    },
    vigna: {
      key: "vigna",
      name: "Vigna",
      short: "Vigna",
      growDays: 18,
      seedCost: 16,
      saleBase: 40,
      saplingLoad: 40,
      harvestLoad: 120,
      fruitLoad: 10,
      fruitInterval: 4,
      shelfLife: 7,
      seasons: ["Summer"],
      color: "#6c9b4e",
      leaf: "#3f8d43",
    },
    cucumber: {
      key: "cucumber",
      name: "Cucumber",
      short: "Cuke",
      growDays: 18,
      seedCost: 18,
      saleBase: 50,
      saplingLoad: 50,
      harvestLoad: 130,
      fruitLoad: 50,
      fruitInterval: 5,
      shelfLife: 7,
      seasons: ["Summer"],
      color: "#5da35f",
      leaf: "#3e8545",
    },
    pepper: {
      key: "pepper",
      name: "Pepper",
      short: "Pepper",
      growDays: 24,
      seedCost: 18,
      saleBase: 40,
      saplingLoad: 30,
      harvestLoad: 70,
      fruitLoad: 10,
      fruitInterval: 5,
      shelfLife: 14,
      seasons: ["Summer"],
      color: "#c84036",
      leaf: "#3f8b4a",
    },
    eggplant: {
      key: "eggplant",
      name: "Eggplant",
      short: "Eggplant",
      growDays: 30,
      seedCost: 24,
      saleBase: 60,
      saplingLoad: 60,
      harvestLoad: 160,
      fruitLoad: 40,
      fruitInterval: 6,
      shelfLife: 7,
      seasons: ["Summer"],
      color: "#5a3f8f",
      leaf: "#477f45",
    },
  };

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
  const CELL_3D = 0.58;
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
    if (window.__GF_AUTOSTART && !window._silent && state.mode === "title") {
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
      minutes: 7 * 60,
      money: 260,
      roofLimit: 840,
      overloadDays: 0,
      collapseCount: 0,
      repairDaysLeft: 0,
      selectedTool: "soil",
      selectedSeed: "carrot",
      fast: false,
      weather: "Bright start, light rain later",
      marketMood: "Local demand favours quick greens",
      message: "Paint soil, plant seeds, add irrigation, then pass the week.",
      grid,
      plants: [],
      weeds: [],
      inventory: [],
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
    for (let i = 0; i < state.volunteers.length; i += 1) {
      const fallback = defaults.volunteers[i % defaults.volunteers.length];
      state.volunteers[i] = {
        ...fallback,
        ...state.volunteers[i],
        actionTimer: state.volunteers[i].actionTimer || 0,
      };
    }
    normalizeSelectedSeed();
    state.message = state.message || "Keep the rooftop productive without overloading the roof.";
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

  function rootCells(plant) {
    const cells = [];
    for (let r = plant.row; r < plant.row + 2; r += 1) {
      for (let c = plant.col; c < plant.col + 2; c += 1) {
        if (inBounds(c, r)) cells.push({ col: c, row: r });
      }
    }
    return cells;
  }

  function plantAt(col, row) {
    return state.plants.find((plant) => {
      return col >= plant.col && col < plant.col + 2 && row >= plant.row && row < plant.row + 2;
    }) || null;
  }

  function canPlantAt(col, row) {
    if (!inBounds(col, row) || !inBounds(col + 1, row + 1)) return false;
    for (let r = row; r < row + 2; r += 1) {
      for (let c = col; c < col + 2; c += 1) {
        const cell = cellAt(c, r);
        if (!cell.soil || plantAt(c, r) || hasWeed(c, r)) return false;
      }
    }
    return true;
  }

  function isCellIrrigated(col, row) {
    const cell = cellAt(col, row);
    if (cell.watered) return true;
    for (let r = row - 1; r <= row + 1; r += 1) {
      for (let c = col - 1; c <= col + 1; c += 1) {
        if (inBounds(c, r) && cellAt(c, r).sprinkler) return true;
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
    return load;
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

  function hasAdjacentSprinkler(col, row) {
    const neighbours = [
      { col: col + 1, row },
      { col: col - 1, row },
      { col, row: row + 1 },
      { col, row: row - 1 },
    ];
    return neighbours.some((cell) => inBounds(cell.col, cell.row) && cellAt(cell.col, cell.row).sprinkler);
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

  function phaseLabel() {
    if (state.phase === "planning") return "Planning";
    if (state.phase === "midweek") return `Day ${state.day}`;
    if (state.phase === "market") return `Market Day ${state.day}`;
    if (state.phase === "repair") return "Roof Repair";
    return state.phase;
  }

  function passPlanning() {
    if (state.phase !== "planning") return;
    playUiSound("water");
    state.phase = "midweek";
    state.day = 1;
    state.minutes = 7 * 60;
    state.fast = true;
    state.message = "The week has started. Assign volunteers or let irrigation handle the crops.";
    clearWater();
    applySprinklers();
    saveGame();
  }

  function enterMarket() {
    playUiSound("market");
    state.phase = "market";
    state.day = 6;
    state.minutes = 9 * 60;
    state.fast = false;
    state.message = "Market days. Sell produce, gift samples, or assign a volunteer to man the stall.";
    state.prices = generatePrices();
    saveGame();
  }

  function endMarketWeek() {
    ageInventory(7);
    advanceCalendarWeek();
    spoilOutOfSeasonPlants();
    state.phase = "planning";
    state.day = 0;
    state.minutes = 7 * 60;
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
          waterRadius(col, row, 1);
        }
      }
    }
  }

  function waterRadius(col, row, radius) {
    for (let r = row - radius; r <= row + radius; r += 1) {
      for (let c = col - radius; c <= col + radius; c += 1) {
        if (inBounds(c, r) && cellAt(c, r).soil) {
          cellAt(c, r).watered = true;
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
        const bonus = rootCells(plant).reduce((sum, cell) => sum + cellAt(cell.col, cell.row).compost, 0);
        const compostBonus = Math.min(0.5, bonus * 0.08);
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

  function absorbSoil(plant, amount) {
    const adjusted = amount * Math.max(0.45, 1 - (state.mulchBonus || 0));
    for (const cell of rootCells(plant)) {
      const target = cellAt(cell.col, cell.row);
      if (target.soil > 0) {
        target.soil = Math.max(0.35, target.soil - adjusted);
      }
    }
  }

  function endDay() {
    state.minutes = state.minutes % DAY_MINUTES;
    applyDailyCycle();
    state.day += 1;
    if (state.day >= 7 && state.phase === "midweek") {
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
    const attempts = Math.max(1, Math.floor(candidates.length / 18));
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
    state.minutes = 7 * 60;
    state.repairDaysLeft = 7;
    state.overloadDays = 0;
    state.message = `Crew leader scolds you at 07:00 after a roof collapse. ${lost} crop${lost === 1 ? "" : "s"} withered while scaffolding goes up for repairs.`;
    saveGame();
  }

  function updateRepair(dt) {
    state.minutes += dt * 900;
    while (state.minutes >= DAY_MINUTES) {
      state.minutes -= DAY_MINUTES;
      state.repairDaysLeft -= 1;
      state.day += 1;
      if (state.repairDaysLeft <= 0) {
        advanceCalendarWeek();
        state.phase = "planning";
        state.day = 0;
        state.minutes = 7 * 60;
        state.message = "Repairs are complete. The crew warns you to respect the roof gauge.";
        saveGame();
        break;
      }
    }
  }

  function updateMarket(dt) {
    const night = state.minutes < 6 * 60 || state.minutes > 20 * 60;
    const speed = state.fast ? 960 : 240;
    state.minutes += dt * speed * (night ? 1.55 : 1);
    while (state.minutes >= DAY_MINUTES && state.phase === "market") {
      state.minutes -= DAY_MINUTES;
      state.day += 1;
      ageInventory(1);
      if (state.day > 7) {
        state.day = 7;
        state.minutes = 20 * 60;
        state.message = "The market weekend is ending. Press End Week when you are done with contacts.";
        break;
      }
    }
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
      state.message = "Seeds need a clear 2 by 2 root space fully covered with soil.";
      return false;
    }
    state.money -= def.seedCost;
    state.plants.push({
      id: `${def.key}-${Date.now()}-${Math.floor(rand() * 10000)}`,
      crop: def.key,
      col,
      row,
      growthDays: 0,
      fruitDays: 0,
      fruitReady: false,
      thirst: 0,
    });
    state.message = `${def.name} planted. Keep every root tile irrigated so it grows.`;
    saveGame();
    return true;
  }

  function placeSprinkler(col, row) {
    if (!inBounds(col, row)) return false;
    const cell = cellAt(col, row);
    if (cell.sprinkler) {
      state.message = "A pipe nozzle already hangs above this grid point.";
      return false;
    }
    if (sprinklerCount() > 0 && !hasAdjacentSprinkler(col, row)) {
      state.message = "New sprinklers must snap beside the existing pipe network.";
      return false;
    }
    const cost = sprinklerCost();
    if (state.money < cost) {
      state.message = `Need ${formatMoney(cost)} to add another sprinkler.`;
      return false;
    }
    state.money -= cost;
    cell.sprinkler = true;
    waterRadius(col, row, 1);
    state.message = `Overhead pipe nozzle added for ${formatMoney(cost)}. It waters nearby soil without taking root space.`;
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
      cellAt(cell.col, cell.row).compost += 1;
    }
    state.compost -= 1;
    state.message = "Compost applied. Growth gets a small daily boost.";
    saveGame();
    return true;
  }

  function aimVolunteerAtCell(volunteer, col, row) {
    volunteer.targetX = Math.max(0.08, Math.min(0.92, (col + 0.5) / COLS));
    volunteer.targetY = Math.max(0.12, Math.min(0.9, (row + 0.5) / ROWS));
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
    aimVolunteerAtCell(volunteer, targetPlant.col + 1, targetPlant.row + 1);
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
    aimVolunteerAtCell(volunteer, ready.col + 1, ready.row + 1);
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
        volunteer.actionTimer = acted ? VOLUNTEER_ACTION_SECONDS : VOLUNTEER_ACTION_SECONDS * 3;
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
      volunteer.actionTimer = VOLUNTEER_ACTION_SECONDS;
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
    state.message = `${cropDefs[next].name} selected. Click a 2 by 2 soil patch to plant.`;
    saveGame();
  }

  function update(dt) {
    if (state.mode !== "game") return;

    if (state.phase === "midweek") {
      const night = state.minutes < 6 * 60 || state.minutes > 20 * 60;
      const speed = state.fast ? 960 : 240;
      updateVolunteerActions(dt);
      advanceMidweekMinutes(dt * speed * (night ? 1.55 : 1));
    } else if (state.phase === "repair") {
      updateRepair(dt);
    } else if (state.phase === "market") {
      updateMarket(dt);
    }

    for (let i = 0; i < state.volunteers.length; i += 1) {
      const volunteer = state.volunteers[i];
      volunteer.bob += dt * (volunteer.task === "idle" ? 1.4 : 2.2);
      if (volunteer.task === "idle") {
        volunteer.x += Math.sin(volunteer.bob * 0.8 + i) * dt * 0.015;
        volunteer.y += Math.cos(volunteer.bob * 0.7 + i) * dt * 0.012;
      } else {
        const targetX = volunteer.targetX ?? (volunteer.task === "water" ? 0.28 + i * 0.12 : 0.64 - i * 0.1);
        const targetY = volunteer.targetY ?? (volunteer.task === "weed" ? 0.58 : 0.5);
        volunteer.x += (targetX - volunteer.x) * dt * 1.4;
        volunteer.y += (targetY - volunteer.y) * dt * 1.4;
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
    const cells = [];
    for (let r = cell.row; r < cell.row + 2; r += 1) {
      for (let c = cell.col; c < cell.col + 2; c += 1) {
        cells.push({ col: c, row: r, inBounds: inBounds(c, r) });
      }
    }
    return {
      col: cell.col,
      row: cell.row,
      valid: canPlantAt(cell.col, cell.row),
      cells,
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
        meshBox(group, x, 0.04, z, CELL_3D * 0.93, 0.035, CELL_3D * 0.93, three.mat.tile, false, true);
        if (cell.soil) {
          const mat = isCellIrrigated(col, row) ? three.mat.soilWet : three.mat.soil;
          const h = 0.07 + Math.min(0.05, cell.soil * 0.014);
          meshBox(group, x, 0.08 + h * 0.5, z, CELL_3D * 0.78, h, CELL_3D * 0.78, mat, false, true);
          if (isCellIrrigated(col, row)) {
            meshBox(group, x, 0.17 + h, z, CELL_3D * 0.68, 0.012, CELL_3D * 0.68, three.mat.water, false, false);
          }
          if (cell.compost > 0) {
            meshBox(group, x, 0.19 + h, z, CELL_3D * 0.48, 0.018, CELL_3D * 0.48, three.mat.compost, false, false);
          }
        }
      }
    }
  }

  function draw3DRootPreview(group) {
    const preview = rootPreview();
    if (!preview) return;
    const mat = preview.valid ? three.mat.rootGood : three.mat.rootBad;
    for (const cell of preview.cells) {
      if (!cell.inBounds) continue;
      meshBox(group, boardX(cell.col), 0.32, boardZ(cell.row), CELL_3D * 0.86, 0.032, CELL_3D * 0.86, mat, false, false);
    }
  }

  function draw3DPlants(group) {
    for (const plant of state.plants) {
      const def = cropDefs[plant.crop];
      if (!def) continue;
      const stage = plantStage(plant);
      const centerX = boardX(plant.col + 0.5);
      const centerZ = boardZ(plant.row + 0.5);
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
        if (inBounds(col + 1, row) && cellAt(col + 1, row).sprinkler) {
          cylinderBetween(group, { x, y: pipeY, z }, { x: boardX(col + 1), y: pipeY, z }, 0.035, three.mat.pipe);
        }
        if (inBounds(col, row + 1) && cellAt(col, row + 1).sprinkler) {
          cylinderBetween(group, { x, y: pipeY, z }, { x, y: pipeY, z: boardZ(row + 1) }, 0.035, three.mat.pipe);
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
    const cell = Math.max(20, Math.min(roofW / COLS, roofH / ROWS));
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
    drawCenteredWrappedText("Shortcuts: S soil, E erase, P seed, I irrigation, H harvest, Space pass, F fullscreen", w / 2, h * 0.86, Math.min(w - 32, 680), compact ? 16 : 18);
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
    ctx.fillStyle = "#d5d0c2";
    ctx.fillRect(x, y, roof.cell, roof.cell);
    if (cell.soil) {
      const soilAlpha = 0.68 + Math.min(0.25, cell.soil * 0.05);
      ctx.fillStyle = `rgba(103, 69, 38, ${soilAlpha})`;
      roughRect(x + 2, y + 2, roof.cell - 4, roof.cell - 4, 4);
      if (cell.compost > 0) {
        ctx.fillStyle = "rgba(72, 118, 42, 0.35)";
        ctx.fillRect(x + 5, y + 5, roof.cell - 10, roof.cell - 10);
      }
      if (isCellIrrigated(col, row)) {
        ctx.fillStyle = "rgba(53, 160, 183, 0.28)";
        ctx.beginPath();
        ctx.arc(x + roof.cell * 0.5, y + roof.cell * 0.5, roof.cell * 0.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.strokeStyle = "rgba(35, 49, 46, 0.18)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, roof.cell, roof.cell);
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

  function drawPlants() {
    const roof = view.roof;
    for (const plant of state.plants) {
      const def = cropDefs[plant.crop];
      const x = roof.x + (plant.col + 1) * roof.cell;
      const y = roof.y + (plant.row + 1) * roof.cell;
      const stage = plantStage(plant);
      const watered = isPlantWatered(plant);
      const radius = stage === "harvestable" ? roof.cell * 0.52 : stage === "mature" ? roof.cell * 0.46 : stage === "sprout" ? roof.cell * 0.38 : roof.cell * 0.22;
      ctx.save();
      ctx.translate(x, y);
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
    for (let row = 0; row < ROWS; row += 1) {
      for (let col = 0; col < COLS; col += 1) {
        if (!cellAt(col, row).sprinkler) continue;
        const x = roof.x + (col + 0.5) * roof.cell;
        const y = roof.y + (row + 0.5) * roof.cell;
        ctx.strokeStyle = "rgba(41, 147, 169, 0.35)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, roof.cell * 1.45, 0, Math.PI * 2);
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
    ctx.fillStyle = "#b9b4a4";
    ctx.strokeStyle = "#273734";
    ctx.lineWidth = 2;
    roundRect(roof.x + roof.w - roof.cell * 2.7, roof.y + roof.cell * 0.3, roof.cell * 2, roof.cell * 1.4, 5);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#8b998f";
    ctx.fillRect(roof.x + roof.w - roof.cell * 2.45, roof.y + roof.cell * 0.58, roof.cell * 1.5, roof.cell * 0.28);
    ctx.fillStyle = "#374743";
    ctx.font = `${Math.max(10, roof.cell * 0.24)}px ui-sans-serif, system-ui`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("storage", roof.x + roof.w - roof.cell * 1.72, roof.y + roof.cell * 1.18);
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
    y += 42;

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
        state.message = `${def.name} selected. Click a 2 by 2 soil patch to plant.`;
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
    drawInventorySummary(p.x + 16, y, p.w - 32);
  }

  function drawInventorySummary(x, y, w) {
    ctx.font = "700 13px ui-sans-serif, system-ui";
    ctx.fillStyle = "#253331";
    ctx.fillText("Storage", x, y);
    y += 20;
    ctx.font = "12px ui-sans-serif, system-ui";
    ctx.fillStyle = "#53625d";
    const fresh = state.inventory.filter((item) => !item.spoiled).length;
    const spoiled = state.inventory.filter((item) => item.spoiled).length;
    drawWrappedText(`Fresh boxes: ${fresh}  Spoiled: ${spoiled}  Compost: ${state.compost}`, x, y, w, 16);
    y += 20;
    const expiring = state.inventory
      .slice()
      .sort((a, b) => (a.shelfLife - a.age) - (b.shelfLife - b.age))
      .slice(0, 3)
      .map((item) => `${cropDefs[item.crop]?.short || item.crop} ${item.spoiled ? "spoiled" : `${Math.max(0, item.shelfLife - item.age)}d`}`);
    ctx.fillStyle = "#53625d";
    drawWrappedText(expiring.length ? `Shelf life: ${expiring.join(", ")}` : "Shelf life: storage empty", x, y, w, 16);
    y += 34;
    ctx.font = "700 13px ui-sans-serif, system-ui";
    ctx.fillStyle = "#253331";
    ctx.fillText("Rooftop", x, y);
    y += 20;
    ctx.font = "12px ui-sans-serif, system-ui";
    ctx.fillStyle = "#53625d";
    drawWrappedText(`Soil ${soilCount()}, water ${wateredCount()}, weeds ${state.weeds.length}, sprinklers ${sprinklerCount()} (${formatMoney(sprinklerCost())}), plants ${state.plants.length}.`, x, y, w, 16);
  }

  function drawBottomToolbar() {
    const compact = view.width < 820;
    const y = view.height - (compact ? 170 : 96);
    const pad = compact ? 10 : 24;
    const h = compact ? 38 : 54;
    const gap = compact ? 6 : 10;
    const maxButtons = toolDefs.length + 3;
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
      label: state.fast ? "Speed x1" : "Speed x4",
      enabled: state.phase === "midweek",
      selected: state.fast,
      action: () => {
        state.fast = !state.fast;
      },
    });

    const passLabel = state.phase === "planning" ? "Pass Week" : state.phase === "market" ? "End Week" : "Next";
    buttonItems.push({
      id: "primary-phase",
      label: passLabel,
      enabled: state.phase !== "repair",
      selected: state.phase === "planning" || state.phase === "market",
      action: () => {
        if (state.phase === "planning") passPlanning();
        else if (state.phase === "market") endMarketWeek();
        else if (state.phase === "midweek") {
          state.minutes = DAY_MINUTES - 2;
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
    roundRect(pad, msgY, Math.min(view.width - pad * 2, 920), 28, 7);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#253331";
    ctx.font = "13px ui-sans-serif, system-ui";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(state.message, pad + 12, msgY + 14);
  }

  function toolMessage(tool) {
    if (tool === "soil") return "Drag across the rooftop to paint soil mass.";
    if (tool === "erase") return "Drag to remove soil, sprinklers, or crops. Removed crops become compost.";
    if (tool === "seed") return "Move over the rooftop to preview the 2 by 2 root filter; click green space to plant.";
    if (tool === "irrigation") return `Click a grid point to hang an overhead pipe nozzle for ${formatMoney(sprinklerCost())}; after the first, place beside the network.`;
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
    drawNeighbourhoodContacts(compact);

    const stallX = compact ? 18 : view.width * 0.08;
    const stallY = compact ? 92 : view.height * 0.28;
    const stallW = compact ? view.width - 36 : view.width * 0.42;
    const stallH = compact ? 168 : view.height * 0.34;
    ctx.fillStyle = "#fbf8ee";
    ctx.strokeStyle = "#253331";
    ctx.lineWidth = 3;
    roundRect(stallX, stallY, stallW, stallH, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#5e9f61";
    ctx.fillRect(stallX + 20, stallY + stallH - 78, stallW - 40, 18);
    ctx.fillStyle = "#e26d3f";
    ctx.beginPath();
    ctx.arc(stallX + stallW * 0.24, stallY + stallH - 112, compact ? 17 : 28, 0, Math.PI * 2);
    ctx.arc(stallX + stallW * 0.47, stallY + stallH - 116, compact ? 15 : 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ead9a8";
    ctx.beginPath();
    ctx.ellipse(stallX + stallW * 0.72, stallY + stallH - 112, compact ? 24 : 34, compact ? 12 : 17, -0.3, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#1e2b29";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.font = `${compact ? 20 : 24}px ui-sans-serif, system-ui`;
    ctx.fillText("Farmer's Market", stallX + 24, stallY + 22);
    ctx.font = `${compact ? 12 : 14}px ui-sans-serif, system-ui`;
    ctx.fillStyle = "#4c5b55";
    drawWrappedText("Sell for cash or gift one fresh box to a useful contact. Favour unlocks compost, roof work, and volunteers.", stallX + 24, stallY + 58, stallW - 48, compact ? 15 : 18);

    const cardX = compact ? 18 : view.width * 0.55;
    const cardY = compact ? 258 : view.height * 0.25;
    const cardW = compact ? view.width - 36 : Math.min(420, view.width * 0.37);
    drawMarketCard(cardX, cardY, cardW);
    drawBottomMarketControls();
    drawWeightGauge();
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
    roundRect(x, y, w, 360, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#1e2b29";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.font = "700 16px ui-sans-serif, system-ui";
    ctx.fillText("Contacts", x + 16, y + 16);
    ctx.font = "12px ui-sans-serif, system-ui";
    ctx.fillStyle = "#53625d";
    ctx.fillText(`Fresh produce boxes: ${state.inventory.filter((item) => !item.spoiled).length}`, x + 16, y + 40);

    addButton("sell-all", x + 16, y + 62, w - 32, 36, "Sell all fresh produce", () => sellAll(), { selected: true });
    addButton("stall-volunteer", x + 16, y + 106, w - 32, 32, `Assign stall helper (${stallVolunteerCount()})`, () => assignStallVolunteer(), { subtle: true });

    const contacts = [
      ["restaurant", "Restaurant"],
      ["carpenter", "Carpenter"],
      ["social", "Social worker"],
      ["engineer", "Engineer"],
      ["mushroom", "Mushroom grower"],
      ["beekeeper", "Beekeeper"],
    ];
    const contactW = (w - 42) / 2;
    for (let i = 0; i < contacts.length; i += 1) {
      const [key, label] = contacts[i];
      const bx = x + 16 + (i % 2) * (contactW + 10);
      const by = y + 150 + Math.floor(i / 2) * 40;
      addButton(`gift-${key}`, bx, by, contactW, 34, `${label} ${state.favour[key] || 0}`, () => giftToNpc(key));
    }

    addButton("compost-spoiled", x + 16, y + 278, contactW, 30, "Compost spoiled", () => compostSpoiled(), { subtle: true });
    addButton("strengthen-roof", x + 26 + contactW, y + 278, contactW, 30, "Crew roof work", () => strengthenRoof(), { subtle: true });
    addButton("consult-farms", x + 16, y + 318, w - 32, 28, "Winter farm consult", () => consultOtherFarm(), { subtle: !canConsultOtherFarm(), selected: canConsultOtherFarm() });
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
      const target = cellAt(cell.col, cell.row);
      if (!plantAt(cell.col, cell.row)) {
        target.soil = Math.max(target.soil, 1);
        target.watered = false;
        state.message = "Soil painted. Each tile adds mass to the roof.";
      }
    } else if (state.selectedTool === "erase") {
      if (state.phase !== "planning") return;
      const plant = plantAt(cell.col, cell.row);
      if (plant) {
        removePlant(plant);
      } else {
        const target = cellAt(cell.col, cell.row);
        target.soil = 0;
        target.watered = false;
        target.sprinkler = false;
        target.compost = 0;
        state.weeds = state.weeds.filter((weed) => weed.col !== cell.col || weed.row !== cell.row);
        state.message = "Tile cleared.";
      }
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
      else if (state.phase === "midweek") state.fast = !state.fast;
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
        rootCells: rootCells(plant),
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
      coordinateSystem: "grid origin top-left, col increases right, row increases down",
      visualMode: "3d rooftop scene with 2d HUD overlay",
      mode: state.mode,
      phase: state.phase,
      year: state.year,
      month: state.month,
      week: state.absoluteWeek,
      weekInMonth: state.weekInMonth,
      day: state.day,
      time: formatTime(state.minutes),
      season: currentSeason(),
      money: Math.round(state.money),
      selectedTool: state.selectedTool,
      selectedSeed: cropDefs[state.selectedSeed]?.name || state.selectedSeed,
      unlockedSeeds: availableCropKeys().map((key) => cropDefs[key].name),
      roof: {
        load: Math.round(roofLoad()),
        limit: Math.round(state.roofLimit),
        loadPercent: Math.round((roofLoad() / state.roofLimit) * 100),
        overloadDays: state.overloadDays,
      },
      rooftop: {
        soilCells: soilCount(),
        wateredCells: wateredCount(),
        sprinklers: sprinklerCount(),
        irrigationModel: "overhead pipe network; nozzles do not consume root grid cells",
        sprinklerCost: sprinklerCost(),
        compost: state.compost,
        weeds: state.weeds.length,
        stallHelpers: stallVolunteerCount(),
      },
      rootPreview: rootPreview(),
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
        id: "roof-grid",
        x: Math.round(view.roof.x),
        y: Math.round(view.roof.y),
        w: Math.round(view.roof.w),
        h: Math.round(view.roof.h),
      });
      for (const plant of state.plants.slice(0, 12)) {
        items.push({
          id: `plant-${plant.col}-${plant.row}`,
          x: Math.round(view.roof.x + plant.col * view.roof.cell),
          y: Math.round(view.roof.y + plant.row * view.roof.cell),
          w: Math.round(view.roof.cell * 2),
          h: Math.round(view.roof.cell * 2),
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
