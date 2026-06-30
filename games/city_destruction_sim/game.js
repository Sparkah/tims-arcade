(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const clearStat = document.getElementById('clearStat');
  const scoreStat = document.getElementById('scoreStat');
  const energyStat = document.getElementById('energyStat');
  const clearBar = document.getElementById('clearBar');
  const resetBtn = document.getElementById('resetBtn');
  const mapSelect = document.getElementById('mapSelect');
  const cashStat = document.getElementById('cashStat');
  const scrapStat = document.getElementById('scrapStat');
  const repStat = document.getElementById('repStat');
  const blueprintStat = document.getElementById('blueprintStat');
  const contractName = document.getElementById('contractName');
  const contractObjective = document.getElementById('contractObjective');
  const contractReward = document.getElementById('contractReward');
  const contractBar = document.getElementById('contractBar');
  const contractProgress = document.getElementById('contractProgress');
  const dailyStat = document.getElementById('dailyStat');
  const licenseStat = document.getElementById('licenseStat');
  const shopList = document.getElementById('shopList');
  const workshopDetails = document.getElementById('workshopDetails');
  const toolButtons = Array.from(document.querySelectorAll('[data-tool]'));

  const TAU = Math.PI * 2;
  const TOOL_KEYS = ['ram', 'charge', 'cut', 'quake', 'wreck', 'missile'];
  const MAX_DEBRIS = 360;
  const MAX_PARTICLES = 520;
  const SAVE_KEY = 'city-destruction-meta-v1';
  const DAY_MS = 86400000;
  const LOCAL_BUILD = ['localhost', '127.0.0.1', '[::1]', ''].includes(window.location.hostname) || window.location.protocol === 'file:';
  let ysdk = null;
  let loadingReadySent = false;
  let gameplayActive = false;
  let gameStarted = false;

  const AudioManager = {
    ctx: null,
    master: null,
    sfx: null,
    music: null,
    ambient: null,
    initialized: false,
    userEnabled: false,
    muted: false,

    init() {
      if (this.initialized) return;
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      this.master = this.ctx.createGain();
      this.sfx = this.ctx.createGain();
      this.music = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.62;
      this.sfx.gain.value = 0.72;
      this.music.gain.value = 0.18;
      this.sfx.connect(this.master);
      this.music.connect(this.master);
      this.master.connect(this.ctx.destination);
      this.initialized = true;
    },

    ensure() {
      this.userEnabled = true;
      this.init();
      if (!this.ctx) return;
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      this.startAmbient();
    },

    startAmbient() {
      if (!this.ctx || this.ambient) return;
      const osc = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = 56;
      filter.type = 'lowpass';
      filter.frequency.value = 180;
      gain.gain.value = 0.22;
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.music);
      osc.start();
      this.ambient = { osc, gain };
    },

    setMuted(muted) {
      this.muted = muted;
      if (!this.master || !this.ctx) return;
      this.master.gain.setTargetAtTime(muted ? 0 : 0.62, this.ctx.currentTime, 0.03);
    },

    pause() {
      if (!this.ctx) return;
      this.ctx.suspend().catch(() => {});
    },

    resume() {
      if (!this.userEnabled || document.hidden || state.paused) return;
      this.ensure();
      this.setMuted(false);
    },

    tone(freq, duration = 0.08, type = 'sine', volume = 0.12, dest = this.sfx) {
      if (!this.ctx || this.muted) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(volume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
      osc.connect(gain);
      gain.connect(dest);
      osc.start(now);
      osc.stop(now + duration + 0.02);
    },

    noise(duration = 0.12, volume = 0.12, cutoff = 900) {
      if (!this.ctx || this.muted) return;
      const now = this.ctx.currentTime;
      const len = Math.max(1, Math.floor(this.ctx.sampleRate * duration));
      const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = this.ctx.createBufferSource();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();
      src.buffer = buffer;
      filter.type = 'lowpass';
      filter.frequency.value = cutoff;
      gain.gain.setValueAtTime(volume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.sfx);
      src.start(now);
    },

    ui() {
      this.tone(720, 0.035, 'sine', 0.055);
    },

    place() {
      this.tone(420, 0.06, 'square', 0.07);
      this.tone(760, 0.05, 'sine', 0.045);
    },

    hit(type, hits, radius) {
      if (!hits) return;
      const power = clamp(hits / 16, 0.25, 1);
      const base = type === 'cut' ? 920 : type === 'quake' ? 82 : 160;
      this.tone(base + Math.min(180, radius), type === 'cut' ? 0.035 : 0.075, type === 'cut' ? 'sawtooth' : 'triangle', 0.05 + power * 0.08);
      if (type !== 'cut') this.noise(0.07 + power * 0.08, 0.04 + power * 0.08, type === 'quake' ? 320 : 760);
    },

    blast(type, radius) {
      this.noise(0.22, type === 'gas' ? 0.24 : 0.18, type === 'gas' ? 1200 : 820);
      this.tone(type === 'gas' ? 74 : 94, 0.18, 'sawtooth', Math.min(0.22, 0.09 + radius / 1400));
    },

    quake() {
      this.tone(46, 0.42, 'sawtooth', 0.18);
      this.noise(0.28, 0.16, 260);
    },

    missile() {
      this.tone(260, 0.12, 'sawtooth', 0.08);
      this.tone(540, 0.09, 'triangle', 0.05);
    },

    reward(daily) {
      this.tone(daily ? 880 : 620, 0.08, 'sine', 0.08);
      setTimeout(() => this.tone(daily ? 1180 : 820, 0.1, 'sine', 0.075), 90);
    },
  };
  const INDUSTRIAL_PALETTE = [
    { wall: '#384553', dark: '#25303b', trim: '#657383', window: '#f4c76b' },
    { wall: '#53606a', dark: '#323b43', trim: '#7e8d99', window: '#89d7ff' },
    { wall: '#706255', dark: '#3f3732', trim: '#998a79', window: '#ffd38a' },
    { wall: '#424c66', dark: '#293246', trim: '#6e7da4', window: '#a5e7ff' },
    { wall: '#5d504a', dark: '#332d2b', trim: '#8b756a', window: '#ffe0a0' },
  ];
  const MAPS = [
    {
      id: 'downtown',
      name: 'Downtown Core',
      seed: 22001,
      spacing: 155,
      minCount: 5,
      maxCount: 9,
      rows: [9, 20],
      cols: [4, 7],
      gasChance: 0.028,
      coreHp: [76, 112],
      wallHp: [46, 74],
      groundRatio: 0.78,
      skyline: 'mixed',
      sky: ['#142235', '#344051', '#151317'],
      sun: ['rgba(255, 186, 97, 0.58)', 'rgba(255, 111, 71, 0.18)', 'rgba(255, 111, 71, 0)'],
      ground: '#171316',
      road: '#282126',
      palette: INDUSTRIAL_PALETTE,
    },
    {
      id: 'oldtown',
      name: 'Old Town',
      seed: 22019,
      spacing: 122,
      minCount: 6,
      maxCount: 11,
      rows: [5, 12],
      cols: [3, 5],
      gasChance: 0.018,
      coreHp: [64, 92],
      wallHp: [38, 62],
      groundRatio: 0.76,
      skyline: 'stepped',
      sky: ['#1a2331', '#42404a', '#181315'],
      sun: ['rgba(255, 202, 129, 0.48)', 'rgba(190, 95, 70, 0.16)', 'rgba(190, 95, 70, 0)'],
      ground: '#181313',
      road: '#302522',
      palette: [
        { wall: '#7a6656', dark: '#4b3d34', trim: '#a58a72', window: '#ffd58b' },
        { wall: '#64584d', dark: '#3d352f', trim: '#927e6a', window: '#ffe2a3' },
        { wall: '#6e5149', dark: '#42302c', trim: '#a27970', window: '#ffc77d' },
        { wall: '#5b5d59', dark: '#373a36', trim: '#85877e', window: '#f7d59b' },
      ],
    },
    {
      id: 'megablocks',
      name: 'Megablocks',
      seed: 22037,
      spacing: 205,
      minCount: 4,
      maxCount: 6,
      rows: [17, 27],
      cols: [7, 10],
      gasChance: 0.014,
      coreHp: [96, 138],
      wallHp: [58, 88],
      groundRatio: 0.8,
      skyline: 'towers',
      sky: ['#101a2d', '#283552', '#101017'],
      sun: ['rgba(113, 190, 255, 0.38)', 'rgba(85, 123, 255, 0.16)', 'rgba(85, 123, 255, 0)'],
      ground: '#101116',
      road: '#242635',
      palette: [
        { wall: '#3d4d69', dark: '#253047', trim: '#6b7da6', window: '#9ee4ff' },
        { wall: '#4d5968', dark: '#2b3440', trim: '#8091a4', window: '#b9efff' },
        { wall: '#35415c', dark: '#20283b', trim: '#66779d', window: '#ffd778' },
      ],
    },
    {
      id: 'waterfront',
      name: 'Waterfront',
      seed: 22051,
      spacing: 165,
      minCount: 4,
      maxCount: 8,
      rows: [7, 17],
      cols: [4, 7],
      gasChance: 0.034,
      coreHp: [70, 104],
      wallHp: [42, 70],
      groundRatio: 0.72,
      skyline: 'gapped',
      sky: ['#153243', '#3c6270', '#15181b'],
      sun: ['rgba(126, 232, 255, 0.38)', 'rgba(252, 178, 94, 0.15)', 'rgba(252, 178, 94, 0)'],
      ground: '#11171a',
      road: '#233037',
      palette: [
        { wall: '#47606a', dark: '#2b3a40', trim: '#73909a', window: '#a9ecff' },
        { wall: '#596a66', dark: '#343f3d', trim: '#849b94', window: '#f8d580' },
        { wall: '#45596f', dark: '#2a3545', trim: '#7189a6', window: '#98dfff' },
      ],
    },
    {
      id: 'gasworks',
      name: 'Gasworks',
      seed: 22073,
      spacing: 132,
      minCount: 5,
      maxCount: 9,
      rows: [6, 15],
      cols: [3, 6],
      gasChance: 0.082,
      coreHp: [68, 98],
      wallHp: [40, 68],
      groundRatio: 0.77,
      skyline: 'ragged',
      sky: ['#161b23', '#3d3836', '#17110f'],
      sun: ['rgba(255, 135, 60, 0.42)', 'rgba(255, 75, 55, 0.18)', 'rgba(255, 75, 55, 0)'],
      ground: '#17110f',
      road: '#2c1f1b',
      palette: [
        { wall: '#69584f', dark: '#3f342f', trim: '#93796a', window: '#ffd369' },
        { wall: '#444b46', dark: '#2b302c', trim: '#6c746d', window: '#fbaf52' },
        { wall: '#5b4b47', dark: '#352c2a', trim: '#846c63', window: '#ffdb8b' },
        { wall: '#334047', dark: '#20292e', trim: '#61727a', window: '#a5e8ff' },
      ],
    },
  ];

  const state = {
    w: 1280,
    h: 720,
    dpr: 1,
    groundY: 560,
    time: 0,
    lastTs: 0,
    paused: false,
    tool: 'ram',
    mapId: 'downtown',
    score: 0,
    clearPct: 0,
    energy: 100,
    quakeCooldown: 0,
    destroyedCells: 0,
    totalCells: 0,
    contractDone: false,
    cityClearBonusDone: false,
    contract: null,
    session: { propsDestroyed: 0, missilesUsed: 0 },
    buildings: [],
    scenery: { back: [], front: [], vehicles: [], lamps: [] },
    debris: [],
    particles: [],
    blasts: [],
    charges: [],
    missiles: [],
    impacts: [],
    sparks: [],
    pointer: {
      active: false,
      x: 0,
      y: 0,
      lastX: 0,
      lastY: 0,
      lastHit: 0,
    },
    shake: 0,
    flash: 0,
    message: '',
    messageTime: 0,
  };

  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function chance(p) {
    return Math.random() < p;
  }

  function format(n) {
    return Math.round(n).toLocaleString('en-US');
  }

  function defaultProfile() {
    return {
      version: 1,
      cash: 0,
      scrap: 0,
      rep: 0,
      blueprints: 0,
      streak: 0,
      lastDaily: '',
      unlocked: { ram: true, charge: true, cut: true, quake: true, wreck: false, missile: false },
      upgrades: { ram: 0, charge: 0, cut: 0, quake: 0, energy: 0 },
    };
  }

  function loadProfile() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return defaultProfile();
      const parsed = JSON.parse(raw);
      const base = defaultProfile();
      return {
        ...base,
        ...parsed,
        unlocked: { ...base.unlocked, ...(parsed.unlocked || {}) },
        upgrades: { ...base.upgrades, ...(parsed.upgrades || {}) },
      };
    } catch (_) {
      return defaultProfile();
    }
  }

  function saveProfile() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(profile));
    } catch (_) {}
  }

  let profile = loadProfile();
  let shopDirty = true;

  const SHOP_ITEMS = [
    {
      id: 'ram',
      title: 'Ram Radius',
      max: 4,
      cost: (lvl) => ({ cash: 160 + lvl * 130, scrap: 18 + lvl * 12 }),
      buy: () => { profile.upgrades.ram++; },
      level: () => profile.upgrades.ram,
    },
    {
      id: 'charge',
      title: 'Charge Yield',
      max: 4,
      cost: (lvl) => ({ cash: 220 + lvl * 170, scrap: 26 + lvl * 16 }),
      buy: () => { profile.upgrades.charge++; },
      level: () => profile.upgrades.charge,
    },
    {
      id: 'cut',
      title: 'Cutter Beam',
      max: 4,
      cost: (lvl) => ({ cash: 180 + lvl * 145, scrap: 22 + lvl * 14 }),
      buy: () => { profile.upgrades.cut++; },
      level: () => profile.upgrades.cut,
    },
    {
      id: 'quake',
      title: 'Quake Core',
      max: 3,
      cost: (lvl) => ({ cash: 260 + lvl * 220, scrap: 34 + lvl * 22, rep: lvl >= 1 ? 1 : 0 }),
      buy: () => { profile.upgrades.quake++; },
      level: () => profile.upgrades.quake,
    },
    {
      id: 'energy',
      title: 'Capacitors',
      max: 4,
      cost: (lvl) => ({ cash: 190 + lvl * 155, scrap: 20 + lvl * 12 }),
      buy: () => {
        profile.upgrades.energy++;
        state.energy = Math.min(maxEnergy(), state.energy + 12);
      },
      level: () => profile.upgrades.energy,
    },
    {
      id: 'wreck',
      title: 'Wreck Ball',
      unlock: 'wreck',
      cost: () => ({ cash: 520, scrap: 80, rep: 1 }),
      buy: () => { profile.unlocked.wreck = true; },
      level: () => profile.unlocked.wreck ? 1 : 0,
    },
    {
      id: 'missile',
      title: 'Missile License',
      unlock: 'missile',
      cost: () => ({ cash: 900, scrap: 130, rep: 3, blueprints: 7 }),
      buy: () => {
        profile.unlocked.missile = true;
      },
      level: () => profile.unlocked.missile ? 1 : 0,
    },
  ];

  function todayKey() {
    return new Date().toISOString().slice(0, 10);
  }

  function yesterdayKey() {
    return new Date(Date.now() - DAY_MS).toISOString().slice(0, 10);
  }

  function maxEnergy() {
    return 100 + profile.upgrades.energy * 16;
  }

  function toolLabel(tool) {
    const button = toolButtons.find((btn) => btn.dataset.tool === tool);
    return button ? button.dataset.label || button.textContent : tool;
  }

  function isToolUnlocked(tool) {
    return Boolean(profile.unlocked[tool]);
  }

  function canAfford(cost) {
    return (!cost.cash || profile.cash >= cost.cash)
      && (!cost.scrap || profile.scrap >= cost.scrap)
      && (!cost.rep || profile.rep >= cost.rep)
      && (!cost.blueprints || profile.blueprints >= cost.blueprints);
  }

  function spendCost(cost) {
    profile.cash -= cost.cash || 0;
    profile.scrap -= cost.scrap || 0;
    profile.rep -= cost.rep || 0;
    profile.blueprints -= cost.blueprints || 0;
  }

  function costText(cost) {
    const parts = [];
    if (cost.cash) parts.push(`$${format(cost.cash)}`);
    if (cost.scrap) parts.push(`${format(cost.scrap)} scrap`);
    if (cost.rep) parts.push(`${format(cost.rep)} rep`);
    if (cost.blueprints) parts.push(`${format(cost.blueprints)} bp`);
    return parts.join(' / ');
  }

  function mapById(id) {
    return MAPS.find((m) => m.id === id) || MAPS[0];
  }

  function currentMap() {
    return mapById(state.mapId);
  }

  function renderProfileHud() {
    if (cashStat) cashStat.textContent = `$${format(profile.cash)}`;
    if (scrapStat) scrapStat.textContent = format(profile.scrap);
    if (repStat) repStat.textContent = format(profile.rep);
    if (blueprintStat) blueprintStat.textContent = `${Math.min(7, profile.blueprints)}/7`;
    if (dailyStat) {
      const doneToday = profile.lastDaily === todayKey();
      dailyStat.textContent = doneToday ? `Daily done ${profile.streak}d` : `Daily ${Math.min(7, profile.blueprints)}/7`;
    }
    if (licenseStat) licenseStat.textContent = `License ${format(profile.rep)}`;
  }

  function updateToolButtons() {
    for (const btn of toolButtons) {
      const tool = btn.dataset.tool;
      const unlocked = isToolUnlocked(tool);
      const active = state.tool === tool;
      btn.dataset.active = String(active);
      btn.textContent = unlocked ? (btn.dataset.label || tool) : 'Locked';
      btn.disabled = !unlocked;
      if (tool === 'quake' && unlocked) {
        btn.disabled = state.quakeCooldown > 0 || state.energy < quakeCost();
        btn.textContent = state.quakeCooldown > 0 ? `${Math.ceil(state.quakeCooldown)}s` : 'Quake';
      }
      if (tool === 'missile' && unlocked) {
        btn.disabled = !active && state.energy < missileCost();
      }
      if (tool === 'wreck' && unlocked) {
        btn.disabled = !active && state.energy < wreckCost();
      }
    }
  }

  function renderWorkshop(force) {
    if (!shopList || (!shopDirty && !force)) return;
    shopDirty = false;
    shopList.innerHTML = '';
    for (const item of SHOP_ITEMS) {
      const level = item.level();
      const owned = item.unlock && profile.unlocked[item.unlock];
      const maxed = item.max ? level >= item.max : owned;
      const cost = item.cost(level);
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.shopId = item.id;
      button.disabled = maxed || !canAfford(cost);
      const label = maxed ? `${item.title} Max` : item.max ? `${item.title} ${level}/${item.max}` : item.title;
      button.innerHTML = `${label}<span>${maxed ? 'Owned' : costText(cost)}</span>`;
      shopList.appendChild(button);
    }
    renderProfileHud();
    updateToolButtons();
  }

  function buyShopItem(id) {
    const item = SHOP_ITEMS.find((candidate) => candidate.id === id);
    if (!item) return;
    const level = item.level();
    const owned = item.unlock && profile.unlocked[item.unlock];
    if ((item.max && level >= item.max) || owned) return;
    const cost = item.cost(level);
    if (!canAfford(cost)) {
      state.message = 'MORE SCRAP';
      state.messageTime = 0.9;
      return;
    }
    spendCost(cost);
    item.buy();
    if (!isToolUnlocked(state.tool)) state.tool = 'ram';
    saveProfile();
    shopDirty = true;
    renderWorkshop(true);
    state.message = item.unlock ? `${item.title} READY` : 'UPGRADE BOUGHT';
    state.messageTime = 1.2;
  }

  function makeRng(seed) {
    let t = seed >>> 0;
    return () => {
      t += 0x6D2B79F5;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }

  function randFrom(rng, min, max) {
    return min + rng() * (max - min);
  }

  function chanceFrom(rng, p) {
    return rng() < p;
  }

  function intFrom(rng, min, max) {
    return Math.floor(randFrom(rng, min, max + 1));
  }

  function rowsForMap(map, index, count, rng) {
    const low = map.rows[0];
    const high = map.rows[1];
    const t = count <= 1 ? 0 : index / (count - 1);
    if (map.skyline === 'towers') {
      return Math.round(lerp(high, low + 3, Math.abs(t - 0.5) * 1.4)) + intFrom(rng, -2, 2);
    }
    if (map.skyline === 'stepped') {
      return Math.round(lerp(low + 2, high, (index % 4) / 3)) + intFrom(rng, -1, 1);
    }
    if (map.skyline === 'gapped') {
      return Math.round(lerp(low, high, 0.3 + Math.sin(index * 1.7) * 0.25 + rng() * 0.35));
    }
    if (map.skyline === 'ragged') {
      return intFrom(rng, low, high) + (index % 3 === 1 ? 3 : 0);
    }
    return intFrom(rng, low, high);
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    state.w = Math.max(320, rect.width || window.innerWidth);
    state.h = Math.max(320, rect.height || window.innerHeight);
    state.dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.floor(state.w * state.dpr);
    canvas.height = Math.floor(state.h * state.dpr);
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    const map = currentMap();
    state.groundY = Math.round(state.h * (state.h > state.w ? Math.min(0.78, map.groundRatio + 0.02) : map.groundRatio));
    if (state.buildings.length) {
      fitCityToViewport();
      rebuildScenery();
    }
  }

  function fitCityToViewport() {
    const map = currentMap();
    const minX = state.w * 0.04;
    const maxX = state.w * 0.96;
    const span = maxX - minX;
    const count = state.buildings.length;
    const skylineTop = clamp(state.h * (state.w < 740 ? 0.26 : 0.31), 170, state.h * 0.42);
    let x = minX;
    for (let i = 0; i < count; i++) {
      const b = state.buildings[i];
      const gutter = clamp(state.w * 0.01, 5, 14);
      const share = span / count;
      b.x = x;
      const gapBoost = map.skyline === 'gapped' && i % 3 === 1 ? 1.45 : 1;
      b.w = Math.max(48, share - gutter * gapBoost);
      b.cellW = b.w / b.cols;
      b.cellH = clamp((state.groundY - skylineTop) / Math.max(10, b.rows + 1), 9, 24);
      x += share;
    }
  }

  function createBuilding(index, count, map, rng) {
    const cols = intFrom(rng, map.cols[0], map.cols[1]);
    const rows = clamp(rowsForMap(map, index, count, rng), map.rows[0], map.rows[1]);
    const palette = map.palette[index % map.palette.length];

    const cells = [];
    for (let row = 0; row < rows; row++) {
      const line = [];
      for (let col = 0; col < cols; col++) {
        const edge = col === 0 || col === cols - 1;
        const core = row < 2 || edge;
        const gas = row > 1 && row < rows - 2 && chanceFrom(rng, map.gasChance);
        const hp = gas ? randFrom(rng, 32, 46) : core ? randFrom(rng, map.coreHp[0], map.coreHp[1]) : randFrom(rng, map.wallHp[0], map.wallHp[1]);
        line.push({
          alive: true,
          hp,
          maxHp: hp,
          support: 1,
          fall: 0,
          fallV: 0,
          unsupported: 0,
          gas,
          windowLit: chanceFrom(rng, row > 1 ? 0.62 : 0.25),
        });
      }
      cells.push(line);
    }

    return {
      id: index,
      x: 0,
      w: 80,
      cols,
      rows,
      cellW: 14,
      cellH: 18,
      lean: rand(-0.05, 0.05),
      leanV: 0,
      palette,
      cells,
      name: `BLOCK-${index + 1}`,
    };
  }

  function buildingTop(b) {
    return state.groundY - b.rows * b.cellH;
  }

  function pickBuilding(rng, minRows) {
    const candidates = state.buildings.filter((b) => b.rows >= minRows);
    if (!candidates.length) return state.buildings[intFrom(rng, 0, Math.max(0, state.buildings.length - 1))];
    return candidates[intFrom(rng, 0, candidates.length - 1)];
  }

  function addRooftopObject(rng, type, minRows, w, h, extra) {
    const b = pickBuilding(rng, minRows);
    if (!b) return;
    const x = b.x + randFrom(rng, b.w * 0.12, Math.max(b.w * 0.14, b.w - w - b.w * 0.12));
    const y = buildingTop(b) - h;
    state.scenery.back.push(Object.assign({ type, x, y, w, h, buildingId: b.id }, extra || {}));
  }

  function rebuildScenery() {
    const map = currentMap();
    const rng = makeRng(map.seed + Math.round(state.w) * 31 + Math.round(state.h) * 23 + 9001);
    state.scenery = { back: [], front: [], vehicles: [], lamps: [] };
    if (!state.buildings.length) return;

    const roadY = state.groundY + 14;
    const vehicleCount = clamp(Math.round(state.w / 270), 2, 6);
    for (let i = 0; i < vehicleCount; i++) {
      state.scenery.vehicles.push({
        type: i % 3 === 0 ? 'truck' : 'car',
        x: randFrom(rng, state.w * 0.04, state.w * 0.93),
        y: state.groundY + randFrom(rng, 26, 58),
        w: randFrom(rng, 34, 62),
        color: ['#5f7486', '#8a634f', '#9a8b61', '#3c5669', '#786b74'][i % 5],
      });
    }

    for (let x = state.w * 0.06; x < state.w * 0.96; x += clamp(state.w / 8, 112, 190)) {
      state.scenery.lamps.push({ type: 'lamp', x: x + randFrom(rng, -22, 22), y: state.groundY + 3, h: randFrom(rng, 46, 66) });
    }

    if (map.id === 'downtown') {
      addRooftopObject(rng, 'billboard', 12, 76, 34, { color: '#f0a23b', accent: '#8edcff' });
      addRooftopObject(rng, 'waterTower', 10, 44, 42, { color: '#8b7761' });
      addRooftopObject(rng, 'antenna', 12, 18, 74, { color: '#9fb5c2' });
      state.scenery.back.push({ type: 'crane', x: state.w * 0.62, y: state.groundY - 270, w: 210, h: 210, color: '#8d7961' });
    } else if (map.id === 'oldtown') {
      addRooftopObject(rng, 'clockTower', 8, 42, 92, { color: '#8c735f' });
      for (let i = 0; i < 5; i++) {
        state.scenery.front.push({ type: 'awning', x: randFrom(rng, state.w * 0.08, state.w * 0.88), y: state.groundY - randFrom(rng, 28, 54), w: randFrom(rng, 34, 54), color: i % 2 ? '#c37a5b' : '#d8b16b' });
      }
      for (let i = 0; i < 7; i++) {
        state.scenery.front.push({ type: 'streetTree', x: randFrom(rng, state.w * 0.04, state.w * 0.96), y: state.groundY + 2, h: randFrom(rng, 34, 52), color: '#4d6d54' });
      }
    } else if (map.id === 'megablocks') {
      for (let i = 0; i < Math.min(3, state.buildings.length - 1); i++) {
        const a = state.buildings[i + 1];
        const b = state.buildings[i + 2];
        if (!a || !b) continue;
        const y = Math.max(buildingTop(a), buildingTop(b)) + Math.min(a.rows, b.rows) * a.cellH * 0.32;
        state.scenery.back.push({ type: 'skybridge', x: a.x + a.w * 0.72, y, w: b.x - (a.x + a.w * 0.72), h: 18, color: '#61728d' });
      }
      for (let i = 0; i < 4; i++) addRooftopObject(rng, 'antenna', 18, 18, randFrom(rng, 58, 94), { color: '#92a8c7' });
      addRooftopObject(rng, 'helipad', 20, 70, 14, { color: '#45536b' });
    } else if (map.id === 'waterfront') {
      state.scenery.back.push({ type: 'water', x: 0, y: state.groundY + 66, w: state.w, h: state.h - state.groundY - 66, color: '#183b45' });
      state.scenery.front.push({ type: 'dockCrane', x: state.w * 0.1, y: state.groundY - 118, w: 112, h: 122, color: '#a27c4a' });
      state.scenery.front.push({ type: 'dockCrane', x: state.w * 0.77, y: state.groundY - 112, w: 104, h: 116, color: '#8fa0a0' });
      for (let i = 0; i < 7; i++) {
        state.scenery.front.push({ type: 'container', x: randFrom(rng, state.w * 0.06, state.w * 0.9), y: roadY + randFrom(rng, -8, 20), w: randFrom(rng, 42, 70), h: 20, color: ['#8f5b4d', '#4d6f85', '#a2854d', '#596070'][i % 4] });
      }
    } else if (map.id === 'gasworks') {
      const tankXs = [0.1, 0.38, 0.67, 0.84];
      for (let i = 0; i < tankXs.length; i++) {
        state.scenery.front.push({ type: 'tank', x: state.w * tankXs[i] + randFrom(rng, -22, 22), y: state.groundY - randFrom(rng, 58, 86), w: randFrom(rng, 54, 82), h: randFrom(rng, 42, 62), color: i % 2 ? '#6c756d' : '#5f5550' });
      }
      for (let i = 0; i < 3; i++) {
        const h = randFrom(rng, 88, 138);
        state.scenery.front.push({ type: 'flare', x: state.w * (0.22 + i * 0.26) + randFrom(rng, -20, 20), y: state.groundY - h - randFrom(rng, 22, 52), h, color: '#665a52' });
      }
      state.scenery.front.push({ type: 'pipeRun', x: state.w * 0.05, y: state.groundY + 18, w: state.w * 0.9, h: 26, color: '#6e5d54' });
    }
    forEachScenery((obj) => ensureSceneryStats(obj));
  }

  function scaledReward(cash, scrap, rep) {
    const scale = Math.min(12, Math.floor(profile.rep / 2));
    return { cash: cash + scale * 32, scrap: scrap + scale * 4, rep };
  }

  function buildContract() {
    const map = currentMap();
    if (map.id === 'gasworks') {
      return {
        name: 'Hazmat Contract',
        objective: 'Destroy 4 tanks, pipes, or flares.',
        kind: 'industrial',
        target: 4,
        reward: scaledReward(360, 46, 1),
        progress: 0,
        done: false,
      };
    }
    if (map.id === 'waterfront') {
      return {
        name: 'Port Contract',
        objective: 'Destroy 5 cranes, containers, or vehicles.',
        kind: 'port',
        target: 5,
        reward: scaledReward(330, 42, 1),
        progress: 0,
        done: false,
      };
    }
    if (map.id === 'megablocks') {
      return {
        name: 'Drop Contract',
        objective: 'Drop 45 live cells into fallen rubble.',
        kind: 'fallen',
        target: 45,
        reward: scaledReward(390, 34, 1),
        progress: 0,
        done: false,
      };
    }
    if (map.id === 'oldtown') {
      return {
        name: 'Salvage Contract',
        objective: 'Destroy 8 street props.',
        kind: 'props',
        target: 8,
        reward: scaledReward(300, 54, 1),
        progress: 0,
        done: false,
      };
    }
    return {
      name: 'Clearance Contract',
      objective: 'Clear 58% of the district.',
      kind: 'clear',
      target: 58,
      reward: scaledReward(320, 36, 1),
      progress: 0,
      done: false,
    };
  }

  function rewardText(reward) {
    return `$${format(reward.cash)} / ${format(reward.scrap)} scrap / ${format(reward.rep)} rep`;
  }

  function countFallenCells() {
    let fallen = 0;
    for (const b of state.buildings) {
      for (const row of b.cells) {
        for (const cell of row) {
          if (cell.alive && cell.fall > b.cellH * 0.55) fallen++;
        }
      }
    }
    return fallen;
  }

  function countDestroyedScenery(types) {
    let destroyed = 0;
    forEachScenery((obj) => {
      if (obj.type === 'water' || obj.alive !== false) return;
      if (!types || types.includes(obj.type)) destroyed++;
    });
    return destroyed;
  }

  function contractProgressValue(contract) {
    if (!contract) return 0;
    if (contract.kind === 'clear') return Math.floor(state.clearPct);
    if (contract.kind === 'fallen') return countFallenCells();
    if (contract.kind === 'industrial') return countDestroyedScenery(['tank', 'flare', 'pipeRun']);
    if (contract.kind === 'port') return countDestroyedScenery(['dockCrane', 'container', 'truck', 'car']);
    if (contract.kind === 'props') return countDestroyedScenery();
    return 0;
  }

  function contractProgressLabel(contract) {
    if (!contract) return '0/0';
    const progress = Math.min(contract.target, Math.floor(contract.progress));
    const suffix = contract.kind === 'clear' ? '%' : '';
    return `${progress}${suffix}/${contract.target}${suffix}`;
  }

  function grantDailyBlueprint() {
    const today = todayKey();
    if (profile.lastDaily === today) return false;
    profile.streak = profile.lastDaily === yesterdayKey() ? profile.streak + 1 : 1;
    profile.lastDaily = today;
    profile.blueprints = Math.min(99, profile.blueprints + 1);
    return true;
  }

  function completeContract(contract) {
    contract.done = true;
    state.contractDone = true;
    const daily = grantDailyBlueprint();
    profile.cash += contract.reward.cash;
    profile.scrap += contract.reward.scrap;
    profile.rep += contract.reward.rep;
    state.score += 1200 + contract.reward.cash;
    saveProfile();
    shopDirty = true;
    renderWorkshop(true);
    state.message = daily ? 'DAILY BLUEPRINT' : 'CONTRACT PAID';
    state.messageTime = 1.6;
    spawnSpark(state.w / 2, state.h * 0.22, daily ? '#9cecff' : '#a9ff9f', daily ? 54 : 34);
    AudioManager.reward(daily);
  }

  function updateContract() {
    const contract = state.contract;
    if (!contract || contract.done) return;
    contract.progress = contractProgressValue(contract);
    if (contract.progress >= contract.target) completeContract(contract);
  }

  function newCity() {
    const map = currentMap();
    const rng = makeRng(map.seed + Math.round(state.w) * 13 + Math.round(state.h) * 17);
    state.time = 0;
    state.score = 0;
    state.clearPct = 0;
    state.energy = maxEnergy();
    state.quakeCooldown = 0;
    state.destroyedCells = 0;
    state.totalCells = 0;
    state.contractDone = false;
    state.cityClearBonusDone = false;
    state.session = { propsDestroyed: 0, missilesUsed: 0 };
    state.debris.length = 0;
    state.particles.length = 0;
    state.blasts.length = 0;
    state.charges.length = 0;
    state.missiles.length = 0;
    state.impacts.length = 0;
    state.sparks.length = 0;
    state.shake = 0;
    state.flash = 0;
    state.message = '';
    state.messageTime = 0;
    if (mapSelect) mapSelect.value = map.id;
    state.groundY = Math.round(state.h * (state.h > state.w ? Math.min(0.78, map.groundRatio + 0.02) : map.groundRatio));

    const count = clamp(Math.round(state.w / map.spacing), map.minCount, map.maxCount);
    state.buildings = [];
    for (let i = 0; i < count; i++) state.buildings.push(createBuilding(i, count, map, rng));
    fitCityToViewport();
    rebuildScenery();
    state.contract = buildContract();
    for (const b of state.buildings) state.totalCells += b.rows * b.cols;
    updateHud();
  }

  function buildingCellRect(b, row, col) {
    const cw = b.cellW;
    const ch = b.cellH;
    const baseX = b.x + col * cw;
    const y = state.groundY - (row + 1) * ch + b.cells[row][col].fall;
    const leanOffset = (row / Math.max(1, b.rows - 1)) * b.lean * b.w;
    return {
      x: baseX + leanOffset,
      y,
      w: cw + 0.7,
      h: ch + 0.7,
      cx: baseX + leanOffset + cw / 2,
      cy: y + ch / 2,
    };
  }

  function cellAtPoint(x, y) {
    for (const b of state.buildings) {
      if (x < b.x - 30 || x > b.x + b.w + 30) continue;
      for (let row = 0; row < b.rows; row++) {
        for (let col = 0; col < b.cols; col++) {
          const cell = b.cells[row][col];
          if (!cell.alive) continue;
          const r = buildingCellRect(b, row, col);
          if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
            return { b, row, col, cell, rect: r };
          }
        }
      }
    }
    return null;
  }

  function forEachScenery(fn) {
    for (const obj of state.scenery.back) fn(obj);
    for (const obj of state.scenery.front) fn(obj);
    for (const obj of state.scenery.vehicles) fn(obj);
    for (const obj of state.scenery.lamps) fn(obj);
  }

  function sceneryMaxHp(obj) {
    if (obj.type === 'water') return 0;
    if (obj.type === 'car') return 32;
    if (obj.type === 'truck') return 48;
    if (obj.type === 'lamp') return 18;
    if (obj.type === 'awning') return 22;
    if (obj.type === 'streetTree') return 26;
    if (obj.type === 'antenna') return 28;
    if (obj.type === 'billboard') return 44;
    if (obj.type === 'helipad') return 48;
    if (obj.type === 'container') return 52;
    if (obj.type === 'waterTower') return 58;
    if (obj.type === 'clockTower') return 64;
    if (obj.type === 'pipeRun') return 70;
    if (obj.type === 'flare') return 72;
    if (obj.type === 'tank') return 82;
    if (obj.type === 'skybridge') return 86;
    if (obj.type === 'dockCrane') return 98;
    if (obj.type === 'crane') return 112;
    return 42;
  }

  function ensureSceneryStats(obj) {
    if (obj.type === 'water') return false;
    if (obj.alive === undefined) obj.alive = true;
    if (!obj.maxHp) {
      obj.maxHp = sceneryMaxHp(obj);
      obj.hp = obj.maxHp;
      obj.hitFlash = 0;
    }
    return obj.alive !== false;
  }

  function normalizeBounds(x, y, w, h) {
    if (w < 0) {
      x += w;
      w = Math.abs(w);
    }
    if (h < 0) {
      y += h;
      h = Math.abs(h);
    }
    return { x, y, w, h, cx: x + w / 2, cy: y + h / 2 };
  }

  function sceneryBounds(obj) {
    if (obj.type === 'water') return normalizeBounds(obj.x, obj.y, obj.w, obj.h);
    if (obj.type === 'car' || obj.type === 'truck') {
      const h = obj.type === 'truck' ? 34 : 25;
      return normalizeBounds(obj.x - 2, obj.y - h - 2, obj.w + 4, h + 10);
    }
    if (obj.type === 'lamp') return normalizeBounds(obj.x - 7, obj.y - obj.h - 12, 45, obj.h + 18);
    if (obj.type === 'streetTree') return normalizeBounds(obj.x - obj.h * 0.44, obj.y - obj.h, obj.h * 0.88, obj.h);
    if (obj.type === 'flare') return normalizeBounds(obj.x - 22, obj.y - 24, 44, obj.h + 32);
    if (obj.type === 'pipeRun') return normalizeBounds(obj.x, obj.y - obj.h * 0.75, obj.w, obj.h * 1.45);
    if (obj.type === 'awning') return normalizeBounds(obj.x, obj.y, obj.w, 18);
    if (obj.type === 'crane') return normalizeBounds(obj.x - 22, obj.y + 10, obj.w + 46, obj.h + 8);
    if (obj.type === 'dockCrane') return normalizeBounds(obj.x - 8, obj.y - 4, obj.w + 18, obj.h + 12);
    if (obj.type === 'billboard') return normalizeBounds(obj.x, obj.y, obj.w, obj.h + 24);
    if (obj.type === 'antenna') return normalizeBounds(obj.x - 12, obj.y, obj.w + 24, obj.h);
    return normalizeBounds(obj.x, obj.y, obj.w || 36, obj.h || 36);
  }

  function sceneryAtPoint(x, y) {
    const layers = [state.scenery.lamps, state.scenery.vehicles, state.scenery.front, state.scenery.back];
    for (const layer of layers) {
      for (let i = layer.length - 1; i >= 0; i--) {
        const obj = layer[i];
        if (!ensureSceneryStats(obj)) continue;
        const b = sceneryBounds(obj);
        if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return { obj, rect: b };
      }
    }
    return null;
  }

  function damageSceneryAt(x, y, radius, power, type) {
    let hits = 0;
    forEachScenery((obj) => {
      if (!ensureSceneryStats(obj)) return;
      const b = sceneryBounds(obj);
      const nearestX = clamp(x, b.x, b.x + b.w);
      const nearestY = clamp(y, b.y, b.y + b.h);
      const dx = nearestX - x;
      const dy = nearestY - y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > radius) return;

      const falloff = 1 - dist / radius;
      const materialBias = (obj.type === 'lamp' || obj.type === 'antenna' || obj.type === 'awning') ? 1.25 : 1;
      const explosiveBias = type === 'gas' && (obj.type === 'tank' || obj.type === 'flare' || obj.type === 'pipeRun') ? 1.35 : 1;
      const cutBias = type === 'cut' && (obj.type === 'pipeRun' || obj.type === 'skybridge' || obj.type === 'crane' || obj.type === 'dockCrane') ? 1.3 : 1;
      const dmg = power * (0.38 + falloff * 0.88) * materialBias * explosiveBias * cutBias;
      obj.hp -= dmg;
      obj.hitFlash = 0.18;
      hits++;
      if (obj.hp <= 0) destroyScenery(obj, type, b, x - b.cx, y - b.cy);
    });
    return hits;
  }

  function damageAt(x, y, radius, power, type) {
    let hits = 0;
    for (const b of state.buildings) {
      const bx0 = b.x - radius;
      const bx1 = b.x + b.w + radius;
      if (x < bx0 || x > bx1) continue;
      let localHits = 0;
      for (let row = 0; row < b.rows; row++) {
        for (let col = 0; col < b.cols; col++) {
          const cell = b.cells[row][col];
          if (!cell.alive) continue;
          const r = buildingCellRect(b, row, col);
          const dx = r.cx - x;
          const dy = r.cy - y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > radius) continue;
          const falloff = 1 - dist / radius;
          const verticalBias = type === 'quake' && row < 4 ? 1.7 : 1;
          const gasBias = cell.gas && type === 'charge' ? 2.2 : 1;
          const dmg = power * (0.28 + falloff * falloff) * verticalBias * gasBias;
          cell.hp -= dmg;
          cell.support = clamp(cell.hp / cell.maxHp, 0, 1);
          localHits++;
          hits++;
          if (cell.gas && cell.hp < cell.maxHp * 0.35) {
            cell.gas = false;
            queueImpact(0.01, r.cx, r.cy, 92, 78, 'gas');
          }
          if (cell.hp <= 0) destroyCell(b, row, col, type, dx, dy);
        }
      }
      if (localHits > 0) {
        b.leanV += clamp((x - (b.x + b.w / 2)) / Math.max(1, b.w), -1, 1) * power * 0.00006;
      }
    }

    hits += damageSceneryAt(x, y, radius, power, type);

    if (hits > 0) {
      spawnDust(x, y, radius * 0.22, type === 'cut' ? 5 : 12);
      state.shake = Math.min(22, state.shake + radius * power * 0.00034);
      AudioManager.hit(type, hits, radius);
    }
    return hits;
  }

  function destroyCell(b, row, col, cause, dx, dy) {
    const cell = b.cells[row][col];
    if (!cell.alive) return;
    cell.alive = false;
    state.destroyedCells++;
    state.score += Math.round(14 + row * 1.6 + (cause === 'charge' ? 18 : 0));
    const r = buildingCellRect(b, row, col);
    const angle = Math.atan2(dy || rand(-1, 1), dx || rand(-1, 1)) + Math.PI;
    const chunks = cause === 'cut' ? 1 : cause === 'quake' ? 2 : 3;
    for (let i = 0; i < chunks; i++) {
      spawnDebris(
        r.cx + rand(-r.w * 0.2, r.w * 0.2),
        r.cy + rand(-r.h * 0.2, r.h * 0.2),
        r.w * rand(0.34, 0.72),
        r.h * rand(0.28, 0.64),
        angle + rand(-0.9, 0.9),
        cause,
        b.palette.wall
      );
    }
    spawnDust(r.cx, r.cy, Math.max(r.w, r.h) * 0.55, 7);
    updateHud();
  }

  function spawnDebris(x, y, w, h, angle, cause, color) {
    if (state.debris.length > MAX_DEBRIS) state.debris.splice(0, state.debris.length - MAX_DEBRIS);
    const speed = cause === 'charge' || cause === 'gas' ? rand(140, 340) : cause === 'quake' ? rand(50, 180) : rand(90, 230);
    state.debris.push({
      x,
      y,
      w,
      h,
      vx: Math.cos(angle) * speed + rand(-70, 70),
      vy: Math.sin(angle) * speed - rand(40, 160),
      rot: rand(-Math.PI, Math.PI),
      vr: rand(-6, 6),
      life: rand(2.4, 4.8),
      color,
    });
  }

  function spawnDust(x, y, scale, count) {
    if (state.particles.length > MAX_PARTICLES) state.particles.splice(0, state.particles.length - MAX_PARTICLES);
    for (let i = 0; i < count; i++) {
      const a = rand(0, TAU);
      const sp = rand(22, 130) * (0.45 + scale / 90);
      const warm = chance(0.35);
      state.particles.push({
        x: x + rand(-scale, scale),
        y: y + rand(-scale, scale),
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - rand(8, 55),
        r: rand(4, 18) * (0.55 + scale / 110),
        life: rand(0.55, 1.35),
        max: 1,
        color: warm ? 'rgba(214, 143, 72, ALPHA)' : 'rgba(174, 167, 148, ALPHA)',
      });
    }
  }

  function spawnColorDust(x, y, scale, count, color, lift) {
    if (state.particles.length > MAX_PARTICLES) state.particles.splice(0, state.particles.length - MAX_PARTICLES);
    for (let i = 0; i < count; i++) {
      const a = rand(0, TAU);
      const sp = rand(24, 150) * (0.5 + scale / 110);
      state.particles.push({
        x: x + rand(-scale, scale),
        y: y + rand(-scale, scale),
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - rand(12, lift || 65),
        r: rand(3, 15) * (0.62 + scale / 130),
        life: rand(0.45, 1.25),
        max: 1,
        color,
      });
    }
  }

  function spawnSpark(x, y, color, count) {
    for (let i = 0; i < count; i++) {
      const a = rand(0, TAU);
      const sp = rand(120, 360);
      state.sparks.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: rand(0.16, 0.42),
        color,
      });
    }
  }

  function pushBlastRing(x, y, radius, type, life) {
    state.blasts.push({ x, y, r: 0, maxR: radius, life: life || 0.42, maxLife: life || 0.42, type });
  }

  function spawnSceneryDebris(bounds, count, color, cause, angle, style) {
    for (let i = 0; i < count; i++) {
      const slender = style === 'spar' || style === 'strip';
      const wide = style === 'panel';
      spawnDebris(
        bounds.cx + rand(-bounds.w * 0.34, bounds.w * 0.34),
        bounds.cy + rand(-bounds.h * 0.34, bounds.h * 0.34),
        slender ? rand(3, 7) : wide ? rand(12, Math.max(14, bounds.w * 0.28)) : rand(5, Math.max(8, bounds.w * 0.18)),
        slender ? rand(12, Math.max(18, bounds.h * 0.32)) : wide ? rand(5, Math.max(8, bounds.h * 0.24)) : rand(5, Math.max(8, bounds.h * 0.18)),
        angle + rand(-1.35, 1.35),
        cause,
        color
      );
    }
  }

  function sceneryScore(obj) {
    if (obj.type === 'tank') return 130;
    if (obj.type === 'crane' || obj.type === 'dockCrane' || obj.type === 'skybridge') return 95;
    if (obj.type === 'truck') return 70;
    if (obj.type === 'waterTower' || obj.type === 'clockTower' || obj.type === 'pipeRun' || obj.type === 'flare') return 65;
    if (obj.type === 'container' || obj.type === 'billboard' || obj.type === 'helipad') return 50;
    if (obj.type === 'car') return 42;
    return 28;
  }

  function destroyScenery(obj, cause, bounds, dx, dy) {
    if (obj.alive === false) return;
    obj.alive = false;
    obj.hp = 0;
    state.score += sceneryScore(obj);
    state.session.propsDestroyed++;
    profile.scrap += Math.max(1, Math.round(sceneryScore(obj) / 28));
    saveProfile();
    shopDirty = true;

    const cx = bounds.cx;
    const cy = bounds.cy;
    const angle = Math.atan2(-(dy || rand(-1, 1)), -(dx || rand(-1, 1)));
    const color = obj.color || '#7b8790';

    if (obj.type === 'tank') {
      spawnSceneryDebris(bounds, 8, color, 'gas', angle, 'panel');
      spawnColorDust(cx, cy, Math.max(bounds.w, bounds.h) * 0.5, 28, 'rgba(52, 55, 55, ALPHA)', 38);
      blast(cx, cy, 94, 54, 'gas');
    } else if (obj.type === 'flare') {
      spawnSceneryDebris(bounds, 7, color, 'gas', angle, 'spar');
      spawnColorDust(cx, cy, 28, 24, 'rgba(255, 104, 37, ALPHA)', 110);
      blast(cx, cy, 78, 42, 'gas');
    } else if (obj.type === 'pipeRun') {
      spawnSceneryDebris(bounds, 9, color, 'gas', angle, 'spar');
      spawnColorDust(cx, cy, 34, 22, 'rgba(255, 120, 48, ALPHA)', 90);
      blast(cx, cy, 76, 36, 'gas');
    } else if (obj.type === 'waterTower') {
      spawnSceneryDebris(bounds, 7, color, cause, angle, 'spar');
      spawnColorDust(cx, cy + bounds.h * 0.1, bounds.w * 0.8, 34, 'rgba(86, 197, 231, ALPHA)', 120);
      spawnColorDust(cx, cy + bounds.h * 0.2, bounds.w * 0.5, 18, 'rgba(209, 241, 255, ALPHA)', 95);
      pushBlastRing(cx, cy, 58, 'water', 0.5);
      state.shake = Math.min(20, state.shake + 5);
    } else if (obj.type === 'car' || obj.type === 'truck') {
      spawnSceneryDebris(bounds, obj.type === 'truck' ? 7 : 5, color, cause, angle, 'panel');
      spawnColorDust(cx, cy, bounds.w * 0.42, 22, 'rgba(45, 48, 52, ALPHA)', 26);
      spawnSpark(cx, cy, '#ffd56f', obj.type === 'truck' ? 16 : 10);
      pushBlastRing(cx, cy, obj.type === 'truck' ? 44 : 34, 'vehicle', 0.34);
    } else if (obj.type === 'lamp' || obj.type === 'antenna') {
      spawnSceneryDebris(bounds, 5, '#778794', cause, angle, 'spar');
      spawnSpark(cx, cy, '#bdf3ff', obj.type === 'antenna' ? 24 : 18);
      pushBlastRing(cx, cy, 30, 'spark', 0.28);
    } else if (obj.type === 'streetTree') {
      spawnSceneryDebris(bounds, 4, '#5a3c2f', cause, angle, 'spar');
      spawnColorDust(cx, cy, bounds.w * 0.6, 22, 'rgba(84, 123, 75, ALPHA)', 85);
      spawnColorDust(cx, cy, bounds.w * 0.35, 8, 'rgba(103, 70, 43, ALPHA)', 55);
      pushBlastRing(cx, cy, 28, 'foliage', 0.3);
    } else if (obj.type === 'awning') {
      spawnSceneryDebris(bounds, 6, color, cause, angle, 'strip');
      spawnColorDust(cx, cy, bounds.w * 0.24, 9, 'rgba(219, 181, 126, ALPHA)', 55);
      pushBlastRing(cx, cy, 26, 'fabric', 0.25);
    } else if (obj.type === 'container') {
      spawnSceneryDebris(bounds, 7, color, cause, angle, 'panel');
      spawnSpark(cx, cy, '#ffe08c', 8);
      spawnDust(cx, cy, bounds.w * 0.22, 8);
      pushBlastRing(cx, cy, 38, 'metal', 0.32);
    } else if (obj.type === 'crane' || obj.type === 'dockCrane' || obj.type === 'skybridge' || obj.type === 'helipad') {
      spawnSceneryDebris(bounds, obj.type === 'crane' ? 13 : 10, color, cause, angle, obj.type === 'helipad' ? 'panel' : 'spar');
      spawnSpark(cx, cy, '#ffe9a3', 26);
      spawnDust(cx, cy, Math.max(bounds.w, bounds.h) * 0.14, 16);
      pushBlastRing(cx, cy, obj.type === 'crane' ? 74 : 54, 'metal', 0.38);
      state.shake = Math.min(24, state.shake + 8);
    } else if (obj.type === 'billboard') {
      spawnSceneryDebris(bounds, 8, color, cause, angle, 'panel');
      spawnSceneryDebris(bounds, 4, obj.accent || '#8edcff', cause, angle + 0.4, 'panel');
      spawnSpark(cx, cy, '#ffe08c', 8);
      pushBlastRing(cx, cy, 42, 'sign', 0.32);
    } else if (obj.type === 'clockTower') {
      spawnSceneryDebris(bounds, 9, color, cause, angle, 'panel');
      spawnDust(cx, cy, bounds.h * 0.22, 20);
      pushBlastRing(cx, cy, 46, 'masonry', 0.36);
    } else {
      spawnSceneryDebris(bounds, 6, color, cause, angle, 'panel');
      spawnDust(cx, cy, Math.max(bounds.w, bounds.h) * 0.16, 10);
      pushBlastRing(cx, cy, 36, 'metal', 0.32);
    }

    updateHud();
  }

  function chargeCost() {
    return Math.max(10, 18 - profile.upgrades.charge * 2);
  }

  function chargeRadius() {
    return 118 + profile.upgrades.charge * 16;
  }

  function chargePower() {
    return 94 + profile.upgrades.charge * 18;
  }

  function quakeCost() {
    return Math.max(30, 42 - profile.upgrades.quake * 3);
  }

  function quakePower() {
    return 26 + profile.upgrades.quake * 4;
  }

  function wreckCost() {
    return Math.max(3.2, 5.4 - profile.upgrades.ram * 0.28);
  }

  function missileCost() {
    return 58;
  }

  function blast(x, y, radius, power, type) {
    damageAt(x, y, radius, power, type || 'charge');
    state.blasts.push({ x, y, r: 0, maxR: radius, life: 0.44, maxLife: 0.44, type: type || 'charge' });
    spawnDust(x, y, radius * 0.36, type === 'gas' ? 46 : 34);
    spawnSpark(x, y, type === 'gas' ? '#ffcf66' : '#ff8a3d', type === 'gas' ? 32 : 20);
    state.flash = Math.min(1, state.flash + 0.22);
    state.shake = Math.min(30, state.shake + radius * 0.055);
    AudioManager.blast(type || 'charge', radius);
  }

  function queueImpact(delay, x, y, radius, power, type) {
    state.impacts.push({ delay, x, y, radius, power, type });
  }

  function placeCharge(x, y) {
    const cost = chargeCost();
    if (state.energy < cost) return;
    const hit = cellAtPoint(x, y);
    const prop = hit ? null : sceneryAtPoint(x, y);
    if (!hit && !prop) return;
    state.energy -= cost;
    const target = hit ? hit.rect : prop.rect;
    state.charges.push({ x: target.cx, y: target.cy, timer: 0.62, armed: true, radius: chargeRadius(), power: chargePower() });
    spawnSpark(target.cx, target.cy, '#ffd978', hit ? 8 : 12);
    AudioManager.place();
    updateHud();
  }

  function launchMissile(x, y) {
    if (!isToolUnlocked('missile') || state.energy < missileCost()) return;
    state.energy -= missileCost();
    state.session.missilesUsed++;
    state.missiles.push({
      x: state.w + 44,
      y: Math.max(60, state.h * 0.12),
      sx: state.w + 44,
      sy: Math.max(60, state.h * 0.12),
      tx: x,
      ty: y,
      t: 0,
      life: 0.72,
    });
    spawnSpark(state.w - 8, Math.max(60, state.h * 0.12), '#ffdc78', 12);
    AudioManager.missile();
    updateHud();
  }

  function quake() {
    const cost = quakeCost();
    if (state.quakeCooldown > 0 || state.energy < cost) return;
    state.energy -= cost;
    state.quakeCooldown = Math.max(3.6, 5.8 - profile.upgrades.quake * 0.42);
    state.message = 'SEISMIC LOAD';
    state.messageTime = 1.1;
    const pulses = 7 + profile.upgrades.quake;
    for (let i = 0; i < pulses; i++) {
      const x = lerp(state.w * 0.08, state.w * 0.92, i / Math.max(1, pulses - 1));
      queueImpact(i * 0.038, x, state.groundY - rand(15, 70), 120 + profile.upgrades.quake * 10, quakePower(), 'quake');
    }
    state.blasts.push({ x: state.w / 2, y: state.groundY, r: 0, maxR: state.w * 0.65, life: 0.72, maxLife: 0.72, type: 'quake' });
    state.shake = 24;
    AudioManager.quake();
    updateHud();
  }

  function setTool(tool) {
    if (!TOOL_KEYS.includes(tool)) return;
    if (!isToolUnlocked(tool)) {
      state.message = 'BUY TOOL';
      state.messageTime = 0.8;
      return;
    }
    state.tool = tool;
    AudioManager.ui();
    updateToolButtons();
    if (tool === 'quake') quake();
  }

  function bruiseCellFromImpact(b, row, col, amount, sourceRow, sourceCol) {
    const cell = b.cells[row]?.[col];
    if (!cell || !cell.alive || amount <= 0) return false;
    const capped = Math.min(amount, cell.maxHp * 0.2);
    cell.hp -= capped;
    cell.support = clamp(cell.hp / cell.maxHp, 0, 1);
    cell.impactDamage = (cell.impactDamage || 0) + capped;
    if (cell.hp <= 0) {
      const dx = (sourceCol - col) * b.cellW;
      const dy = (sourceRow - row) * b.cellH;
      destroyCell(b, row, col, 'impact', dx, dy);
    }
    return true;
  }

  function applyLandingImpactDamage(b, row, col, impactSpeed, hasVerticalSupport) {
    const fallCell = b.cells[row][col];
    const impact = Math.max(0, impactSpeed - 118);
    const selfDamage = Math.min(fallCell.maxHp * 0.18, 2.5 + impact * 0.026);
    let hits = 0;

    if (bruiseCellFromImpact(b, row, col, selfDamage, row, col)) hits++;

    if (hasVerticalSupport) {
      for (let dc = -1; dc <= 1; dc++) {
        const weight = dc === 0 ? 0.78 : 0.34;
        if (bruiseCellFromImpact(b, row - 1, col + dc, selfDamage * weight, row, col)) hits++;
      }
    } else {
      for (let dc = -1; dc <= 1; dc++) {
        const weight = dc === 0 ? 0.42 : 0.2;
        if (bruiseCellFromImpact(b, 0, col + dc, selfDamage * weight, row, col)) hits++;
      }
    }

    if (hits > 0) {
      const r = buildingCellRect(b, row, col);
      spawnDust(r.cx, r.y + r.h, b.cellW * 0.32, Math.min(5, hits + 1));
      state.shake = Math.min(18, state.shake + impactSpeed * 0.006);
    }
  }

  function updateStructuralCollapse(dt) {
    for (const b of state.buildings) {
      b.lean += b.leanV * dt * 60;
      b.leanV *= Math.pow(0.88, dt * 60);
      b.lean = clamp(b.lean, -0.18, 0.18);

      for (let row = 0; row < b.rows; row++) {
        for (let col = 0; col < b.cols; col++) {
          const cell = b.cells[row][col];
          if (!cell.alive) continue;

          if (row === 0) {
            cell.fall = 0;
            cell.fallV = 0;
            cell.unsupported = 0;
            cell.support = clamp(cell.hp / cell.maxHp, 0, 1);
            continue;
          }

          let support = 0;
          let fallSupport = 0;
          let fallWeight = 0;
          for (let dc = -1; dc <= 1; dc++) {
            const below = b.cells[row - 1][col + dc];
            if (!below || !below.alive) continue;
            const weight = dc === 0 ? 1 : 0.42;
            support += below.support * weight;
            fallSupport += below.fall * weight;
            fallWeight += weight;
          }
          const sideA = b.cells[row][col - 1];
          const sideB = b.cells[row][col + 1];
          if (sideA && sideA.alive && Math.abs(sideA.fall - cell.fall) < b.cellH * 0.75) support += 0.08;
          if (sideB && sideB.alive && Math.abs(sideB.fall - cell.fall) < b.cellH * 0.75) support += 0.08;

          const hasVerticalSupport = fallWeight > 0;
          const targetFall = hasVerticalSupport ? fallSupport / fallWeight : row * b.cellH;
          const targetDelta = targetFall - cell.fall;

          if (support < 0.34 && !hasVerticalSupport) {
            cell.unsupported += dt;
          } else {
            cell.unsupported = Math.max(0, cell.unsupported - dt * 2);
          }

          if (targetDelta > 0.5) {
            cell.fallV = Math.min(cell.fallV + 980 * dt, 760);
            cell.fall += cell.fallV * dt;
            if (cell.fall >= targetFall) {
              const impactSpeed = cell.fallV;
              cell.fall = targetFall;
              cell.fallV = 0;
              if (impactSpeed > 130) {
                const r = buildingCellRect(b, row, col);
                spawnDust(r.cx, r.y + r.h, b.cellW * 0.42, 2);
                applyLandingImpactDamage(b, row, col, impactSpeed, hasVerticalSupport);
                b.leanV += (col < b.cols / 2 ? -1 : 1) * Math.min(0.001, impactSpeed * 0.000002);
              }
            }
          } else if (targetDelta < -0.5) {
            cell.fall = lerp(cell.fall, targetFall, Math.min(1, dt * 7));
            cell.fallV = 0;
          } else {
            cell.fall = targetFall;
            cell.fallV = 0;
          }

          cell.support = clamp(cell.hp / cell.maxHp, 0, 1);
        }
      }
    }
  }

  function updateObjects(dt) {
    state.energy = Math.min(maxEnergy(), state.energy + dt * (8.5 + profile.upgrades.energy * 1.1));
    state.quakeCooldown = Math.max(0, state.quakeCooldown - dt);
    state.messageTime = Math.max(0, state.messageTime - dt);
    state.shake = Math.max(0, state.shake - dt * 18);
    state.flash = Math.max(0, state.flash - dt * 2.3);
    forEachScenery((obj) => {
      if (obj.hitFlash > 0) obj.hitFlash = Math.max(0, obj.hitFlash - dt);
    });

    for (let i = state.charges.length - 1; i >= 0; i--) {
      const c = state.charges[i];
      c.timer -= dt;
      if (c.timer <= 0) {
        blast(c.x, c.y, c.radius || chargeRadius(), c.power || chargePower(), 'charge');
        state.charges.splice(i, 1);
      }
    }

    for (let i = state.missiles.length - 1; i >= 0; i--) {
      const m = state.missiles[i];
      m.t += dt / m.life;
      const t = clamp(m.t, 0, 1);
      const arc = Math.sin(t * Math.PI) * 86;
      m.x = lerp(m.sx, m.tx, t);
      m.y = lerp(m.sy, m.ty, t) - arc;
      if (m.t >= 1) {
        blast(m.tx, m.ty, 142, 118, 'missile');
        state.missiles.splice(i, 1);
      }
    }

    for (let i = state.impacts.length - 1; i >= 0; i--) {
      const impact = state.impacts[i];
      impact.delay -= dt;
      if (impact.delay <= 0) {
        if (impact.type === 'quake') {
          damageAt(impact.x, impact.y, impact.radius, impact.power, impact.type);
        } else {
          blast(impact.x, impact.y, impact.radius, impact.power, impact.type);
        }
        state.impacts.splice(i, 1);
      }
    }

    for (let i = state.blasts.length - 1; i >= 0; i--) {
      const b = state.blasts[i];
      b.life -= dt;
      b.r = b.maxR * (1 - b.life / b.maxLife);
      if (b.life <= 0) state.blasts.splice(i, 1);
    }

    for (let i = state.particles.length - 1; i >= 0; i--) {
      const p = state.particles[i];
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.pow(0.9, dt * 60);
      p.vy += 58 * dt;
      p.r += 12 * dt;
      if (p.life <= 0) state.particles.splice(i, 1);
    }

    for (let i = state.sparks.length - 1; i >= 0; i--) {
      const s = state.sparks[i];
      s.life -= dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vx *= Math.pow(0.86, dt * 60);
      s.vy += 500 * dt;
      if (s.life <= 0) state.sparks.splice(i, 1);
    }

    for (let i = state.debris.length - 1; i >= 0; i--) {
      const d = state.debris[i];
      d.life -= dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.vy += 740 * dt;
      d.vx *= Math.pow(0.992, dt * 60);
      d.rot += d.vr * dt;
      if (d.y > state.groundY - d.h / 2) {
        d.y = state.groundY - d.h / 2;
        d.vy *= -0.23;
        d.vx *= 0.68;
        d.vr *= 0.5;
      }
      if (d.life <= 0 || d.x < -160 || d.x > state.w + 160) state.debris.splice(i, 1);
    }
  }

  function updatePointerDamage() {
    if (!state.pointer.active) return;
    const p = state.pointer;
    if (state.tool === 'ram') {
      if (state.time - p.lastHit > 0.045 && state.energy >= 2) {
        const dx = p.x - p.lastX;
        const dy = p.y - p.lastY;
        const speed = Math.sqrt(dx * dx + dy * dy);
        damageAt(
          p.x,
          p.y,
          48 + profile.upgrades.ram * 7 + Math.min(34, speed * 0.22),
          28 + profile.upgrades.ram * 5 + Math.min(30, speed * 0.25),
          'ram'
        );
        state.energy = Math.max(0, state.energy - Math.max(1.25, 2.2 - profile.upgrades.ram * 0.18));
        p.lastHit = state.time;
      }
    } else if (state.tool === 'wreck') {
      if (state.time - p.lastHit > 0.07 && state.energy >= wreckCost()) {
        const dx = p.x - p.lastX;
        const dy = p.y - p.lastY;
        const speed = Math.sqrt(dx * dx + dy * dy);
        damageAt(p.x, p.y, 78 + profile.upgrades.ram * 9 + Math.min(46, speed * 0.25), 58 + profile.upgrades.ram * 7 + Math.min(42, speed * 0.28), 'wreck');
        spawnDust(p.x, p.y, 18, 3);
        state.energy = Math.max(0, state.energy - wreckCost());
        p.lastHit = state.time;
      }
    } else if (state.tool === 'cut') {
      if (state.time - p.lastHit > 0.025 && state.energy >= 0.8) {
        damageAt(p.x, p.y, 28 + profile.upgrades.cut * 4, 17 + profile.upgrades.cut * 3.5, 'cut');
        spawnSpark(p.x, p.y, '#9cecff', 2);
        state.energy = Math.max(0, state.energy - Math.max(0.72, 1.25 - profile.upgrades.cut * 0.1));
        p.lastHit = state.time;
      }
    }
  }

  function update(dt) {
    state.time += dt;
    updatePointerDamage();
    updateStructuralCollapse(dt);
    updateObjects(dt);
    const pct = state.totalCells ? (state.destroyedCells / state.totalCells) * 100 : 0;
    state.clearPct = pct;
    updateContract();
    if (!state.cityClearBonusDone && pct >= 82) {
      state.cityClearBonusDone = true;
      state.score += 2500;
      state.message = 'DISTRICT CLEARED';
      state.messageTime = 2.4;
      spawnSpark(state.w / 2, state.h * 0.24, '#a9ff9f', 42);
    }
    updateHud();
  }

  function updateHud() {
    clearStat.textContent = `${Math.floor(state.clearPct)}%`;
    scoreStat.textContent = format(state.score);
    energyStat.textContent = `${Math.floor(state.energy)}/${maxEnergy()}`;
    clearBar.style.width = `${clamp(state.clearPct, 0, 100)}%`;
    if (state.contract) {
      const progress = Math.min(state.contract.target, Math.floor(state.contract.progress || 0));
      if (contractName) contractName.textContent = state.contract.done ? `${state.contract.name} Paid` : state.contract.name;
      if (contractObjective) contractObjective.textContent = state.contract.objective;
      if (contractReward) contractReward.textContent = rewardText(state.contract.reward);
      if (contractProgress) contractProgress.textContent = contractProgressLabel(state.contract);
      if (contractBar) contractBar.style.width = `${clamp((progress / state.contract.target) * 100, 0, 100)}%`;
    }
    renderProfileHud();
    renderWorkshop();
    updateToolButtons();
  }

  function drawBackground() {
    const map = currentMap();
    const g = ctx.createLinearGradient(0, 0, 0, state.h);
    g.addColorStop(0, map.sky[0]);
    g.addColorStop(0.52, map.sky[1]);
    g.addColorStop(1, map.sky[2]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, state.w, state.h);

    ctx.save();
    ctx.globalAlpha = 0.55;
    const sunX = state.w * 0.76;
    const sunY = state.h * 0.18;
    const rg = ctx.createRadialGradient(sunX, sunY, 4, sunX, sunY, state.w * 0.32);
    rg.addColorStop(0, map.sun[0]);
    rg.addColorStop(0.38, map.sun[1]);
    rg.addColorStop(1, map.sun[2]);
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, state.w, state.h);
    ctx.restore();

    ctx.strokeStyle = 'rgba(255,255,255,0.055)';
    ctx.lineWidth = 1;
    for (let y = Math.floor(state.groundY - 260); y < state.groundY; y += 28) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(state.w, y + Math.sin(y * 0.03 + state.time) * 6);
      ctx.stroke();
    }

    ctx.fillStyle = map.ground;
    ctx.fillRect(0, state.groundY, state.w, state.h - state.groundY);
    ctx.fillStyle = map.road;
    ctx.fillRect(0, state.groundY, state.w, 10);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    for (let x = -80; x < state.w + 80; x += 90) {
      ctx.fillRect(x + (state.time * 18) % 90, state.groundY + 24, 46, 3);
    }
  }

  function drawCrane(obj) {
    ctx.save();
    ctx.strokeStyle = obj.color;
    ctx.fillStyle = obj.color;
    ctx.lineWidth = 3;
    const x = obj.x;
    const y = obj.y;
    const h = obj.h;
    ctx.beginPath();
    ctx.moveTo(x, y + h);
    ctx.lineTo(x, y + 18);
    ctx.lineTo(x + obj.w, y + 18);
    ctx.stroke();
    for (let yy = y + 34; yy < y + h; yy += 26) {
      ctx.beginPath();
      ctx.moveTo(x - 18, yy);
      ctx.lineTo(x + 18, yy - 20);
      ctx.moveTo(x + 18, yy);
      ctx.lineTo(x - 18, yy - 20);
      ctx.stroke();
    }
    ctx.globalAlpha = 0.48;
    ctx.beginPath();
    ctx.moveTo(x + 10, y + 20);
    ctx.lineTo(x + obj.w * 0.72, y + 82);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillRect(x + obj.w - 8, y + 18, 4, 74);
    ctx.fillRect(x + obj.w - 18, y + 90, 24, 16);
    ctx.restore();
  }

  function drawBillboard(obj) {
    ctx.save();
    ctx.fillStyle = '#1c222b';
    ctx.fillRect(obj.x, obj.y, obj.w, obj.h);
    ctx.fillStyle = obj.color;
    ctx.fillRect(obj.x + 6, obj.y + 7, obj.w - 12, obj.h - 14);
    ctx.fillStyle = obj.accent || '#8edcff';
    for (let i = 0; i < 4; i++) {
      ctx.fillRect(obj.x + 12 + i * 13, obj.y + 14 + (i % 2) * 7, 8, 4);
    }
    ctx.strokeStyle = '#202631';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(obj.x + obj.w * 0.28, obj.y + obj.h);
    ctx.lineTo(obj.x + obj.w * 0.22, obj.y + obj.h + 22);
    ctx.moveTo(obj.x + obj.w * 0.72, obj.y + obj.h);
    ctx.lineTo(obj.x + obj.w * 0.78, obj.y + obj.h + 22);
    ctx.stroke();
    ctx.restore();
  }

  function drawWaterTower(obj) {
    ctx.save();
    ctx.strokeStyle = obj.color;
    ctx.fillStyle = obj.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(obj.x + obj.w / 2, obj.y + obj.h * 0.28, obj.w * 0.44, obj.h * 0.24, 0, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 0.5;
    ctx.fillRect(obj.x + obj.w * 0.12, obj.y + obj.h * 0.24, obj.w * 0.76, obj.h * 0.22);
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.moveTo(obj.x + obj.w * 0.25, obj.y + obj.h * 0.46);
    ctx.lineTo(obj.x + obj.w * 0.08, obj.y + obj.h);
    ctx.moveTo(obj.x + obj.w * 0.75, obj.y + obj.h * 0.46);
    ctx.lineTo(obj.x + obj.w * 0.92, obj.y + obj.h);
    ctx.moveTo(obj.x + obj.w * 0.25, obj.y + obj.h * 0.72);
    ctx.lineTo(obj.x + obj.w * 0.75, obj.y + obj.h * 0.72);
    ctx.stroke();
    ctx.restore();
  }

  function drawAntenna(obj) {
    ctx.save();
    ctx.strokeStyle = obj.color;
    ctx.lineWidth = 2;
    const x = obj.x + obj.w / 2;
    ctx.beginPath();
    ctx.moveTo(x, obj.y + obj.h);
    ctx.lineTo(x, obj.y);
    ctx.moveTo(x, obj.y + obj.h * 0.28);
    ctx.lineTo(x - 16, obj.y + obj.h * 0.44);
    ctx.moveTo(x, obj.y + obj.h * 0.4);
    ctx.lineTo(x + 17, obj.y + obj.h * 0.55);
    ctx.stroke();
    ctx.fillStyle = '#ffd978';
    ctx.beginPath();
    ctx.arc(x, obj.y + 5, 4 + Math.sin(state.time * 5) * 1.2, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawClockTower(obj) {
    ctx.save();
    ctx.fillStyle = obj.color;
    ctx.fillRect(obj.x + obj.w * 0.2, obj.y + obj.h * 0.28, obj.w * 0.6, obj.h * 0.72);
    ctx.beginPath();
    ctx.moveTo(obj.x + obj.w * 0.1, obj.y + obj.h * 0.28);
    ctx.lineTo(obj.x + obj.w * 0.5, obj.y);
    ctx.lineTo(obj.x + obj.w * 0.9, obj.y + obj.h * 0.28);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#e7d7ad';
    ctx.beginPath();
    ctx.arc(obj.x + obj.w * 0.5, obj.y + obj.h * 0.48, obj.w * 0.18, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#44382d';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(obj.x + obj.w * 0.5, obj.y + obj.h * 0.48);
    ctx.lineTo(obj.x + obj.w * 0.5, obj.y + obj.h * 0.38);
    ctx.moveTo(obj.x + obj.w * 0.5, obj.y + obj.h * 0.48);
    ctx.lineTo(obj.x + obj.w * 0.62, obj.y + obj.h * 0.51);
    ctx.stroke();
    ctx.restore();
  }

  function drawSkybridge(obj) {
    ctx.save();
    ctx.fillStyle = obj.color;
    ctx.fillRect(obj.x, obj.y, obj.w, obj.h);
    ctx.fillStyle = 'rgba(160,220,255,0.32)';
    for (let x = obj.x + 8; x < obj.x + obj.w - 8; x += 18) {
      ctx.fillRect(x, obj.y + 5, 9, 5);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.strokeRect(obj.x + 0.5, obj.y + 0.5, obj.w - 1, obj.h - 1);
    ctx.restore();
  }

  function drawHelipad(obj) {
    ctx.save();
    ctx.fillStyle = obj.color;
    ctx.fillRect(obj.x, obj.y, obj.w, obj.h);
    ctx.strokeStyle = '#d9e7ef';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(obj.x + obj.w / 2, obj.y + obj.h / 2, obj.h * 0.45, 0, TAU);
    ctx.moveTo(obj.x + obj.w * 0.38, obj.y + obj.h * 0.5);
    ctx.lineTo(obj.x + obj.w * 0.62, obj.y + obj.h * 0.5);
    ctx.moveTo(obj.x + obj.w * 0.5, obj.y + obj.h * 0.25);
    ctx.lineTo(obj.x + obj.w * 0.5, obj.y + obj.h * 0.75);
    ctx.stroke();
    ctx.restore();
  }

  function drawWater(obj) {
    ctx.save();
    ctx.fillStyle = obj.color;
    ctx.fillRect(obj.x, obj.y, obj.w, obj.h);
    ctx.strokeStyle = 'rgba(132, 222, 236, 0.2)';
    ctx.lineWidth = 2;
    for (let y = obj.y + 12; y < obj.y + obj.h; y += 18) {
      ctx.beginPath();
      ctx.moveTo(obj.x, y);
      for (let x = obj.x; x < obj.x + obj.w; x += 42) {
        ctx.lineTo(x + 22, y + Math.sin((x + state.time * 28) * 0.025) * 4);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawDockCrane(obj) {
    ctx.save();
    ctx.strokeStyle = obj.color;
    ctx.fillStyle = obj.color;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(obj.x, obj.y + obj.h);
    ctx.lineTo(obj.x + obj.w * 0.35, obj.y);
    ctx.lineTo(obj.x + obj.w, obj.y + obj.h * 0.18);
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(obj.x + obj.w * 0.48, obj.y + obj.h * 0.08);
    ctx.lineTo(obj.x + obj.w * 0.62, obj.y + obj.h * 0.72);
    ctx.stroke();
    ctx.fillRect(obj.x + obj.w * 0.56, obj.y + obj.h * 0.7, 18, 12);
    ctx.restore();
  }

  function drawTank(obj) {
    ctx.save();
    ctx.fillStyle = obj.color;
    ctx.fillRect(obj.x, obj.y + obj.h * 0.18, obj.w, obj.h * 0.65);
    ctx.beginPath();
    ctx.ellipse(obj.x + obj.w / 2, obj.y + obj.h * 0.18, obj.w / 2, obj.h * 0.18, 0, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(obj.x + obj.w / 2, obj.y + obj.h * 0.83, obj.w / 2, obj.h * 0.18, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.strokeRect(obj.x + 4, obj.y + obj.h * 0.26, obj.w - 8, obj.h * 0.46);
    ctx.restore();
  }

  function drawFlare(obj) {
    ctx.save();
    ctx.strokeStyle = obj.color;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(obj.x, obj.y + obj.h);
    ctx.lineTo(obj.x, obj.y + 12);
    ctx.stroke();
    const flicker = 0.7 + Math.sin(state.time * 9 + obj.x) * 0.2;
    ctx.fillStyle = `rgba(255, ${Math.round(130 + flicker * 70)}, 48, 0.72)`;
    ctx.beginPath();
    ctx.moveTo(obj.x, obj.y - 16 * flicker);
    ctx.quadraticCurveTo(obj.x - 16, obj.y + 4, obj.x, obj.y + 20);
    ctx.quadraticCurveTo(obj.x + 16, obj.y + 2, obj.x, obj.y - 16 * flicker);
    ctx.fill();
    ctx.restore();
  }

  function drawAwning(obj) {
    ctx.save();
    ctx.fillStyle = obj.color;
    ctx.fillRect(obj.x, obj.y, obj.w, 10);
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    for (let x = obj.x + 4; x < obj.x + obj.w; x += 12) ctx.fillRect(x, obj.y, 5, 10);
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(obj.x + 2, obj.y + 10, obj.w - 4, 8);
    ctx.restore();
  }

  function drawStreetTree(obj) {
    ctx.save();
    ctx.fillStyle = '#4b382c';
    ctx.fillRect(obj.x - 3, obj.y - obj.h * 0.58, 6, obj.h * 0.58);
    ctx.fillStyle = obj.color;
    ctx.beginPath();
    ctx.arc(obj.x, obj.y - obj.h * 0.76, obj.h * 0.24, 0, TAU);
    ctx.arc(obj.x - obj.h * 0.18, obj.y - obj.h * 0.63, obj.h * 0.18, 0, TAU);
    ctx.arc(obj.x + obj.h * 0.18, obj.y - obj.h * 0.62, obj.h * 0.18, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawContainer(obj) {
    ctx.save();
    ctx.fillStyle = obj.color;
    ctx.fillRect(obj.x, obj.y, obj.w, obj.h);
    ctx.strokeStyle = 'rgba(0,0,0,0.24)';
    ctx.strokeRect(obj.x + 0.5, obj.y + 0.5, obj.w - 1, obj.h - 1);
    for (let x = obj.x + 8; x < obj.x + obj.w; x += 12) {
      ctx.beginPath();
      ctx.moveTo(x, obj.y + 3);
      ctx.lineTo(x, obj.y + obj.h - 3);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawPipeRun(obj) {
    ctx.save();
    ctx.strokeStyle = obj.color;
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(obj.x, obj.y);
    ctx.lineTo(obj.x + obj.w, obj.y);
    ctx.stroke();
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath();
    ctx.moveTo(obj.x, obj.y - 5);
    ctx.lineTo(obj.x + obj.w, obj.y - 5);
    ctx.stroke();
    ctx.fillStyle = obj.color;
    for (let x = obj.x + 26; x < obj.x + obj.w; x += 86) {
      ctx.fillRect(x, obj.y - obj.h * 0.35, 12, obj.h);
    }
    ctx.restore();
  }

  function drawVehicle(obj) {
    ctx.save();
    ctx.fillStyle = obj.color;
    const h = obj.type === 'truck' ? 20 : 15;
    ctx.fillRect(obj.x, obj.y - h, obj.w, h);
    if (obj.type === 'truck') {
      ctx.fillRect(obj.x + obj.w * 0.62, obj.y - h - 12, obj.w * 0.28, 12);
    } else {
      ctx.beginPath();
      ctx.moveTo(obj.x + obj.w * 0.18, obj.y - h);
      ctx.lineTo(obj.x + obj.w * 0.34, obj.y - h - 10);
      ctx.lineTo(obj.x + obj.w * 0.68, obj.y - h - 10);
      ctx.lineTo(obj.x + obj.w * 0.84, obj.y - h);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = '#182027';
    ctx.beginPath(); ctx.arc(obj.x + obj.w * 0.22, obj.y + 1, 5, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(obj.x + obj.w * 0.78, obj.y + 1, 5, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(179,230,255,0.55)';
    ctx.fillRect(obj.x + obj.w * 0.38, obj.y - h - 7, obj.w * 0.22, 5);
    ctx.restore();
  }

  function drawLamp(obj) {
    ctx.save();
    ctx.strokeStyle = '#65727c';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(obj.x, obj.y);
    ctx.lineTo(obj.x, obj.y - obj.h);
    ctx.lineTo(obj.x + 24, obj.y - obj.h);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,212,124,0.56)';
    ctx.beginPath();
    ctx.arc(obj.x + 29, obj.y - obj.h, 7, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawSceneryDamage(obj) {
    if (obj.type === 'water' || !ensureSceneryStats(obj)) return;
    const health = clamp(obj.hp / obj.maxHp, 0, 1);
    if (health > 0.94 && obj.hitFlash <= 0) return;
    const b = sceneryBounds(obj);
    ctx.save();
    if (health < 0.72) {
      const shade = 1 - health;
      ctx.globalAlpha = Math.min(0.34, shade * 0.42);
      ctx.fillStyle = '#151313';
      ctx.fillRect(b.x, b.y + b.h * 0.58, b.w, b.h * 0.42);
      ctx.globalAlpha = Math.min(0.72, shade * 0.9);
      ctx.strokeStyle = '#1c1717';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(b.x + b.w * 0.2, b.y + b.h * 0.28);
      ctx.lineTo(b.x + b.w * 0.46, b.y + b.h * 0.54);
      ctx.lineTo(b.x + b.w * 0.38, b.y + b.h * 0.78);
      ctx.moveTo(b.x + b.w * 0.68, b.y + b.h * 0.18);
      ctx.lineTo(b.x + b.w * 0.58, b.y + b.h * 0.48);
      ctx.lineTo(b.x + b.w * 0.82, b.y + b.h * 0.7);
      ctx.stroke();
    }
    if (obj.hitFlash > 0) {
      ctx.globalAlpha = clamp(obj.hitFlash / 0.18, 0, 1) * 0.28;
      ctx.fillStyle = '#ffd46d';
      ctx.fillRect(b.x - 2, b.y - 2, b.w + 4, b.h + 4);
    }
    ctx.restore();
  }

  function drawSceneryObject(obj) {
    if (obj.type !== 'water' && !ensureSceneryStats(obj)) return;
    if (obj.type === 'water') drawWater(obj);
    else if (obj.type === 'crane') drawCrane(obj);
    else if (obj.type === 'dockCrane') drawDockCrane(obj);
    else if (obj.type === 'billboard') drawBillboard(obj);
    else if (obj.type === 'waterTower') drawWaterTower(obj);
    else if (obj.type === 'antenna') drawAntenna(obj);
    else if (obj.type === 'clockTower') drawClockTower(obj);
    else if (obj.type === 'skybridge') drawSkybridge(obj);
    else if (obj.type === 'helipad') drawHelipad(obj);
    else if (obj.type === 'tank') drawTank(obj);
    else if (obj.type === 'flare') drawFlare(obj);
    else if (obj.type === 'awning') drawAwning(obj);
    else if (obj.type === 'streetTree') drawStreetTree(obj);
    else if (obj.type === 'container') drawContainer(obj);
    else if (obj.type === 'pipeRun') drawPipeRun(obj);
    else if (obj.type === 'car' || obj.type === 'truck') drawVehicle(obj);
    else if (obj.type === 'lamp') drawLamp(obj);
    drawSceneryDamage(obj);
  }

  function drawBackScenery() {
    for (const obj of state.scenery.back) drawSceneryObject(obj);
  }

  function drawFrontScenery() {
    for (const obj of state.scenery.front) drawSceneryObject(obj);
    for (const obj of state.scenery.vehicles) drawSceneryObject(obj);
    for (const obj of state.scenery.lamps) drawSceneryObject(obj);
  }

  function drawBuilding(b) {
    const pal = b.palette;
    ctx.save();
    for (let row = 0; row < b.rows; row++) {
      for (let col = 0; col < b.cols; col++) {
        const cell = b.cells[row][col];
        if (!cell.alive) continue;
        const r = buildingCellRect(b, row, col);
        const health = clamp(cell.hp / cell.maxHp, 0, 1);
        const shade = 1 - health;
        ctx.fillStyle = shade > 0.66 ? pal.dark : pal.wall;
        ctx.fillRect(r.x, r.y, r.w, r.h);

        ctx.fillStyle = `rgba(0,0,0,${0.12 + shade * 0.34})`;
        ctx.fillRect(r.x, r.y + r.h * 0.62, r.w, r.h * 0.38);

        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);

        if (cell.gas) {
          ctx.fillStyle = '#ff6957';
          ctx.fillRect(r.x + r.w * 0.34, r.y + r.h * 0.24, r.w * 0.32, r.h * 0.5);
        } else if (cell.windowLit && r.w > 8 && r.h > 10) {
          ctx.fillStyle = health > 0.44 ? pal.window : 'rgba(255, 209, 120, 0.22)';
          ctx.fillRect(r.x + r.w * 0.32, r.y + r.h * 0.28, r.w * 0.36, r.h * 0.33);
        }

        if (shade > 0.22) {
          ctx.strokeStyle = `rgba(19, 17, 17, ${0.28 + shade * 0.58})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(r.x + r.w * 0.2, r.y + r.h * 0.2);
          ctx.lineTo(r.x + r.w * 0.55, r.y + r.h * 0.55);
          ctx.lineTo(r.x + r.w * 0.45, r.y + r.h * 0.86);
          ctx.stroke();
        }
      }
    }

    ctx.fillStyle = pal.trim;
    ctx.globalAlpha = 0.8;
    ctx.fillRect(b.x - 2, state.groundY - 3, b.w + 4, 5);
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function drawCharges() {
    for (const c of state.charges) {
      const pulse = 0.5 + 0.5 * Math.sin(state.time * 24);
      ctx.fillStyle = '#ffda69';
      ctx.beginPath();
      ctx.arc(c.x, c.y, 7 + pulse * 3, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = '#171316';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  function drawMissiles() {
    for (const m of state.missiles) {
      ctx.save();
      const angle = Math.atan2(m.ty - m.y, m.tx - m.x);
      ctx.translate(m.x, m.y);
      ctx.rotate(angle);
      ctx.fillStyle = '#d9d2bd';
      ctx.fillRect(-15, -4, 25, 8);
      ctx.fillStyle = '#ff7b3d';
      ctx.beginPath();
      ctx.moveTo(-15, -7);
      ctx.lineTo(-28, 0);
      ctx.lineTo(-15, 7);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ffcf68';
      ctx.beginPath();
      ctx.moveTo(10, -5);
      ctx.lineTo(21, 0);
      ctx.lineTo(10, 5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  function drawDebris() {
    for (const d of state.debris) {
      ctx.save();
      ctx.translate(d.x, d.y);
      ctx.rotate(d.rot);
      ctx.globalAlpha = clamp(d.life / 0.6, 0, 1);
      ctx.fillStyle = d.color;
      ctx.fillRect(-d.w / 2, -d.h / 2, d.w, d.h);
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.fillRect(-d.w / 2, 0, d.w, d.h / 2);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  function drawParticles() {
    for (const p of state.particles) {
      const alpha = clamp(p.life / 1.1, 0, 1);
      ctx.fillStyle = p.color.replace('ALPHA', String(alpha * 0.32));
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, TAU);
      ctx.fill();
    }

    ctx.lineWidth = 2;
    for (const s of state.sparks) {
      ctx.strokeStyle = s.color;
      ctx.globalAlpha = clamp(s.life / 0.34, 0, 1);
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x - s.vx * 0.025, s.y - s.vy * 0.025);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawBlasts() {
    for (const b of state.blasts) {
      const t = clamp(b.life / b.maxLife, 0, 1);
      ctx.lineWidth = b.type === 'quake' ? 5 : 4;
      if (b.type === 'quake') ctx.strokeStyle = `rgba(255, 220, 126, ${t * 0.42})`;
      else if (b.type === 'water') ctx.strokeStyle = `rgba(106, 220, 255, ${t * 0.68})`;
      else if (b.type === 'spark') ctx.strokeStyle = `rgba(196, 241, 255, ${t * 0.72})`;
      else if (b.type === 'foliage') ctx.strokeStyle = `rgba(132, 205, 104, ${t * 0.52})`;
      else if (b.type === 'fabric') ctx.strokeStyle = `rgba(235, 190, 130, ${t * 0.48})`;
      else if (b.type === 'metal' || b.type === 'vehicle') ctx.strokeStyle = `rgba(255, 213, 126, ${t * 0.58})`;
      else if (b.type === 'missile') ctx.strokeStyle = `rgba(255, 235, 160, ${t * 0.72})`;
      else if (b.type === 'sign') ctx.strokeStyle = `rgba(142, 220, 255, ${t * 0.55})`;
      else if (b.type === 'masonry') ctx.strokeStyle = `rgba(205, 183, 153, ${t * 0.52})`;
      else ctx.strokeStyle = `rgba(255, 122, 62, ${t * 0.62})`;
      ctx.beginPath();
      if (b.type === 'quake') {
        ctx.ellipse(b.x, b.y, b.r, b.r * 0.16, 0, 0, TAU);
      } else {
        ctx.arc(b.x, b.y, b.r, 0, TAU);
      }
      ctx.stroke();
    }
  }

  function drawToolPreview() {
    const p = state.pointer;
    if (!p.active) return;
    ctx.save();
    if (state.tool === 'ram') {
      ctx.strokeStyle = 'rgba(255, 207, 100, 0.55)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 50, 0, TAU);
      ctx.stroke();
    } else if (state.tool === 'cut') {
      ctx.strokeStyle = 'rgba(130, 230, 255, 0.86)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(p.lastX, p.lastY);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.46)';
      ctx.lineWidth = 1;
      ctx.stroke();
    } else if (state.tool === 'charge') {
      ctx.strokeStyle = 'rgba(255, 137, 79, 0.72)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, chargeRadius(), 0, TAU);
      ctx.stroke();
    } else if (state.tool === 'wreck') {
      ctx.strokeStyle = 'rgba(255, 207, 100, 0.68)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 84, 0, TAU);
      ctx.stroke();
    } else if (state.tool === 'missile') {
      ctx.strokeStyle = 'rgba(255, 137, 79, 0.72)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 142, 0, TAU);
      ctx.moveTo(p.x - 12, p.y);
      ctx.lineTo(p.x + 12, p.y);
      ctx.moveTo(p.x, p.y - 12);
      ctx.lineTo(p.x, p.y + 12);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawMessage() {
    if (state.messageTime <= 0) return;
    const alpha = clamp(state.messageTime, 0, 1);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 ${clamp(state.w * 0.055, 34, 84)}px Impact, Haettenschweiler, Arial Narrow Bold, sans-serif`;
    ctx.fillStyle = '#ffda69';
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 8;
    ctx.strokeText(state.message, state.w / 2, state.h * 0.34);
    ctx.fillText(state.message, state.w / 2, state.h * 0.34);
    ctx.restore();
  }

  function render() {
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    ctx.clearRect(0, 0, state.w, state.h);
    const sx = (Math.random() - 0.5) * state.shake;
    const sy = (Math.random() - 0.5) * state.shake;
    ctx.save();
    ctx.translate(sx, sy);
    drawBackground();
    drawBackScenery();
    for (const b of state.buildings) drawBuilding(b);
    drawFrontScenery();
    drawCharges();
    drawMissiles();
    drawDebris();
    drawBlasts();
    drawParticles();
    drawToolPreview();
    ctx.restore();

    if (state.flash > 0) {
      ctx.fillStyle = `rgba(255, 223, 143, ${state.flash * 0.18})`;
      ctx.fillRect(0, 0, state.w, state.h);
    }
    drawMessage();
  }

  function step(dt) {
    update(Math.min(0.05, dt));
    render();
  }

  function sendLoadingReady() {
    if (loadingReadySent) return;
    loadingReadySent = true;
    try {
      ysdk?.features?.LoadingAPI?.ready?.();
    } catch (_) {}
  }

  function setGameplayActive(active) {
    if (gameplayActive === active) return;
    gameplayActive = active;
    try {
      const api = ysdk?.features?.GameplayAPI;
      if (active) api?.start?.();
      else api?.stop?.();
    } catch (_) {}
  }

  function pausePlatform() {
    state.paused = true;
    state.pointer.active = false;
    state.lastTs = 0;
    setGameplayActive(false);
    AudioManager.setMuted(true);
    AudioManager.pause();
  }

  function resumePlatform() {
    if (!gameStarted || document.hidden) return;
    state.paused = false;
    state.lastTs = 0;
    setGameplayActive(true);
    AudioManager.setMuted(false);
    AudioManager.resume();
  }

  function registerPlatformEvents() {
    try {
      ysdk?.on?.('game_api_pause', pausePlatform);
      ysdk?.on?.('game_api_resume', resumePlatform);
    } catch (_) {}
  }

  function startGameOnce() {
    if (gameStarted) return;
    gameStarted = true;
    if (workshopDetails) workshopDetails.open = window.innerWidth > 740;
    resize();
    renderWorkshop(true);
    newCity();
    if (window.__GF_AUTOSTART && !window._silent) {
      state.message = '';
      state.messageTime = 0;
    }
    sendLoadingReady();
    if (!document.hidden) setGameplayActive(true);
    requestAnimationFrame(frame);
  }

  function initPlatform() {
    let settled = false;
    const timeout = setTimeout(() => settle(null), 3000);

    function settle(sdk) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      ysdk = sdk || null;
      if (ysdk) window.ysdk = ysdk;
      registerPlatformEvents();
      startGameOnce();
    }

    try {
      if (window.YaGames?.init) {
        window.YaGames.init().then(settle).catch(() => settle(null));
      } else {
        settle(null);
      }
    } catch (_) {
      settle(null);
    }
  }

  function frame(ts) {
    if (!state.lastTs) state.lastTs = ts;
    const dt = Math.min(0.05, (ts - state.lastTs) / 1000);
    state.lastTs = ts;
    if (!state.paused) step(dt);
    requestAnimationFrame(frame);
  }

  function pointerPosition(e) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (state.w / rect.width),
      y: (e.clientY - rect.top) * (state.h / rect.height),
    };
  }

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    AudioManager.ensure();
    const p = pointerPosition(e);
    state.pointer.active = true;
    state.pointer.x = p.x;
    state.pointer.y = p.y;
    state.pointer.lastX = p.x;
    state.pointer.lastY = p.y;
    state.pointer.lastHit = 0;
    canvas.setPointerCapture(e.pointerId);
    if (state.tool === 'charge') placeCharge(p.x, p.y);
    if (state.tool === 'missile') launchMissile(p.x, p.y);
    if (state.tool === 'ram') damageAt(p.x, p.y, 56 + profile.upgrades.ram * 8, 42 + profile.upgrades.ram * 6, 'ram');
    if (state.tool === 'wreck') damageAt(p.x, p.y, 86 + profile.upgrades.ram * 9, 66 + profile.upgrades.ram * 7, 'wreck');
  });

  canvas.addEventListener('pointermove', (e) => {
    const p = pointerPosition(e);
    state.pointer.lastX = state.pointer.x;
    state.pointer.lastY = state.pointer.y;
    state.pointer.x = p.x;
    state.pointer.y = p.y;
  });

  function releasePointer(e) {
    state.pointer.active = false;
    try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
  }

  canvas.addEventListener('pointerup', releasePointer);
  canvas.addEventListener('pointercancel', releasePointer);

  for (const btn of toolButtons) {
    btn.addEventListener('click', () => {
      AudioManager.ensure();
      setTool(btn.dataset.tool);
    });
  }

  if (shopList) {
    shopList.addEventListener('click', (e) => {
      const button = e.target.closest('button[data-shop-id]');
      if (!button) return;
      AudioManager.ensure();
      buyShopItem(button.dataset.shopId);
    });
  }

  if (mapSelect) {
    mapSelect.addEventListener('change', () => {
      AudioManager.ensure();
      AudioManager.ui();
      state.mapId = mapSelect.value;
      newCity();
    });
  }

  resetBtn.addEventListener('click', () => {
    AudioManager.ensure();
    AudioManager.ui();
    newCity();
  });

  window.addEventListener('keydown', (e) => {
    AudioManager.ensure();
    if (e.code === 'Digit1') setTool('ram');
    if (e.code === 'Digit2') setTool('charge');
    if (e.code === 'Digit3') setTool('cut');
    if (e.code === 'Digit4') setTool('quake');
    if (e.code === 'Digit5') setTool('wreck');
    if (e.code === 'Digit6') setTool('missile');
    if (e.code === 'KeyR') newCity();
    if (e.code === 'KeyF') {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    }
  });

  window.addEventListener('resize', () => {
    resize();
    render();
  });

  document.addEventListener('visibilitychange', () => {
    state.lastTs = 0;
    if (document.hidden) {
      pausePlatform();
    } else {
      resumePlatform();
    }
  });

  function scenerySummary() {
    const byType = {};
    const objects = [];
    let alive = 0;
    let damaged = 0;
    let destroyed = 0;
    forEachScenery((obj) => {
      if (obj.type === 'water') return;
      ensureSceneryStats(obj);
      if (!byType[obj.type]) byType[obj.type] = { alive: 0, damaged: 0, destroyed: 0 };
      const bounds = sceneryBounds(obj);
      objects.push({
        type: obj.type,
        alive: obj.alive !== false,
        x: Math.round(bounds.cx),
        y: Math.round(bounds.cy),
        w: Math.round(bounds.w),
        h: Math.round(bounds.h),
        hp: Math.max(0, Math.round(obj.hp)),
      });
      if (obj.alive === false) {
        destroyed++;
        byType[obj.type].destroyed++;
      } else {
        alive++;
        byType[obj.type].alive++;
        if (obj.hp < obj.maxHp * 0.82) {
          damaged++;
          byType[obj.type].damaged++;
        }
      }
    });
    return { alive, damaged, destroyed, byType, objects };
  }

  window.render_game_to_text = () => JSON.stringify({
    coordinateSystem: 'CSS pixels, origin top-left, x right, y down',
    mode: 'playing',
    map: state.mapId,
    mapName: currentMap().name,
    viewport: { w: Math.round(state.w), h: Math.round(state.h), groundY: Math.round(state.groundY) },
    tool: state.tool,
    score: state.score,
    clearPct: Math.round(state.clearPct),
    energy: Math.round(state.energy),
    maxEnergy: maxEnergy(),
    quakeCooldown: Number(state.quakeCooldown.toFixed(1)),
    contractDone: state.contractDone,
    contract: state.contract ? {
      name: state.contract.name,
      kind: state.contract.kind,
      progress: Math.floor(state.contract.progress || 0),
      target: state.contract.target,
      done: state.contract.done,
      reward: state.contract.reward,
    } : null,
    profile: {
      cash: profile.cash,
      scrap: profile.scrap,
      rep: profile.rep,
      blueprints: profile.blueprints,
      streak: profile.streak,
      lastDaily: profile.lastDaily,
      unlocked: profile.unlocked,
      upgrades: profile.upgrades,
    },
    buildings: state.buildings.map((b) => {
      let alive = 0;
      let damaged = 0;
      let fallen = 0;
      let impactDamaged = 0;
      let bottomDamaged = 0;
      let impactDamageTotal = 0;
      let bottomDamageTotal = 0;
      let rowIndex = 0;
      for (const row of b.cells) {
        for (const c of row) {
          if (c.alive) {
            alive++;
            if (c.hp < c.maxHp * 0.72) damaged++;
            if (c.fall > b.cellH * 0.55) fallen++;
            if (c.impactDamage > 0.5) {
              impactDamaged++;
              impactDamageTotal += c.impactDamage;
            }
            if (rowIndex < 2 && c.hp < c.maxHp * 0.96) {
              bottomDamaged++;
              bottomDamageTotal += c.maxHp - c.hp;
            }
          }
        }
        rowIndex++;
      }
      return {
        id: b.id,
        x: Math.round(b.x),
        w: Math.round(b.w),
        alive,
        damaged,
        fallen,
        impactDamaged,
        bottomDamaged,
        impactDamageTotal: Math.round(impactDamageTotal),
        bottomDamageTotal: Math.round(bottomDamageTotal),
        rows: b.rows,
        cols: b.cols,
      };
    }),
    scenery: scenerySummary(),
    charges: state.charges.map((c) => ({ x: Math.round(c.x), y: Math.round(c.y), timer: Number(c.timer.toFixed(2)) })),
    missiles: state.missiles.length,
    debris: state.debris.length,
    particles: state.particles.length,
  });

  window.advanceTime = (ms) => {
    const steps = Math.max(1, Math.round(ms / (1000 / 60)));
    for (let i = 0; i < steps; i++) step(1 / 60);
    return Promise.resolve(window.render_game_to_text());
  };

  if (LOCAL_BUILD) {
    window._jumpLevel = () => {
      newCity();
      for (let i = 0; i < 8; i++) {
        const x = lerp(state.w * 0.2, state.w * 0.8, i / 7);
        blast(x, state.groundY - rand(80, 260), 110, 76, 'charge');
      }
      for (let i = 0; i < 180; i++) step(1 / 60);
    };

    window._resetMeta = () => {
      profile = defaultProfile();
      saveProfile();
      shopDirty = true;
      if (!isToolUnlocked(state.tool)) state.tool = 'ram';
      renderWorkshop(true);
      updateHud();
      return window.render_game_to_text();
    };

    window._grantMeta = (cash = 0, scrap = 0, rep = 0, blueprints = 0) => {
      profile.cash += Number(cash) || 0;
      profile.scrap += Number(scrap) || 0;
      profile.rep += Number(rep) || 0;
      profile.blueprints += Number(blueprints) || 0;
      saveProfile();
      shopDirty = true;
      renderWorkshop(true);
      updateHud();
      return window.render_game_to_text();
    };
  }

  initPlatform();
})();
