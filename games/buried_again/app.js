import * as THREE from './vendor/three.module.js';
import {
  BODY_RADIUS_METERS,
  COFFIN_TRAVEL_DEPTH,
  MAX_BLOCKER_RATIO,
  SoilWorld,
  evaluateDiscClearance,
} from './soil-world.js';
import { createTownWorld } from './town-world.js';

/* ============================================================================
   BURIED AGAIN  -  clawing out of the grave, one breath at a time.
   Rebuilt from scratch: first-person 3D, a real carved displacement surface
   (no voxel grid), headlamp lighting, layered descent, heavy juice.
   ========================================================================== */

/* ----------------------------- localisation ------------------------------ */
const LANG = (navigator.language || 'en').toLowerCase().startsWith('ru') ? 'ru' : 'en';
const STR = {
  en: {
    coffin: 'COFFIN LID', soil: 'PACKED SOIL', widen: 'CLEAR THE TIGHT EDGES', metal: 'STEEL PLATE', air: 'AIR', energy: 'ENERGY',
    tutTap: 'tap the lid to claw it', tutAir: 'keep clawing - the whole lid will give', tutDig: 'Lid gone. Tap or hold for small bites, then crawl.',
    clawLid: 'claw at the lid', digUp: 'dig and crawl up', almost: 'light, just above you',
    metalPlate: 'steel layer exposed - scratch through it!',
    lidBroken: 'lid broken - the coffin stays until you move',
    metalBroken: 'steel broken - dig, then move forward',
    buriedDeep: (f) => `buried ${f} ft down... claw your way up`,
    deeperLevel: (n) => `${n} more levels of soil`,
    boardsAbove: 'old boards - light through the cracks. break them!',
    breakThrough: 'opening clear - squeeze through',
    souls: (n) => `${n} souls`, ftDown: (g, f) => `grave ${g} - ${f} ft down`,
    ftLeft: (f) => `${f} ft to the surface`, surfaceClose: 'almost at the surface',
    deadTitle: 'You black out', deadCopy: (d, s) => `Day ${d} in the dark. The hole stays dug. <b>+${s} souls.</b>`,
    escTitle: 'Sky. Alive.', escCopy: (n) => `You crawl out gasping. <b>+${n} souls</b> - they bury you deeper next time.`,
    resume: 'Back in the dirt', escMore: 'Dig the next grave',
    freeSouls: (n) => `kept digging: +${n} souls`,
  },
  ru: {
    coffin: 'КРЫШКА ГРОБА', soil: 'ПЛОТНЫЙ ГРУНТ', widen: 'РАСЧИСТИ УЗКИЕ КРАЯ', metal: 'СТАЛЬНАЯ ПЛИТА', air: 'ВОЗДУХ', energy: 'ЭНЕРГИЯ',
    tutTap: 'нажимай на крышку, чтобы царапать', tutAir: 'продолжай - крышка сломается целиком', tutDig: 'Крышки нет. Нажимай или удерживай, затем ползи.',
    clawLid: 'царапай крышку', digUp: 'копай и ползи вверх', almost: 'свет, прямо над тобой',
    metalPlate: 'слой стали открыт - процарапай его!',
    lidBroken: 'крышка сломана - гроб виден, пока не поползёшь',
    metalBroken: 'сталь сломана - копай и ползи вперёд',
    buriedDeep: (f) => `похоронен на ${f} фт... прокопай наверх`,
    deeperLevel: (n) => `ещё ${n} слоёв земли`,
    boardsAbove: 'старые доски - свет сквозь щели. ломай их!',
    breakThrough: 'проход свободен - протискивайся',
    souls: (n) => `душ: ${n}`, ftDown: (g, f) => `могила ${g} - глубина ${f} фт`,
    ftLeft: (f) => `${f} фт до поверхности`, surfaceClose: 'почти у поверхности',
    deadTitle: 'Ты теряешь сознание', deadCopy: (d, s) => `День ${d} во тьме. Яма остаётся. <b>+${s} душ.</b>`,
    escTitle: 'Небо. Жив.', escCopy: (n) => `Ты выбираешься наружу. <b>+${n} душ</b> - в следующий раз закопают глубже.`,
    resume: 'Обратно в землю', escMore: 'Копать новую могилу',
    freeSouls: (n) => `за упорство: +${n} душ`,
  },
};
const t = (k, ...a) => { const v = STR[LANG][k] ?? STR.en[k] ?? k; return typeof v === 'function' ? v(...a) : v; };

/* ------------------------------- tools ----------------------------------- */
// coffin tools chew through wood; dig tools scoop soil. Each has a distinct mesh.
// coffin tools: scratch / pry / cut through wood - and the metal reinforcing that shows up deeper
const COFFIN_TOOLS = [
  { name: 'Fingernail',   cost: 0,    power: 1.0,  mesh: 'hand',    desc: 'bare keratin on oak' },
  { name: 'Thick Nail',   cost: 16,   power: 1.9,  mesh: 'nail',    desc: 'a rusted coffin nail' },
  { name: 'Rusty Fork',   cost: 55,   power: 3.1,  mesh: 'fork',    desc: 'tears long splinters' },
  { name: 'Bone Chisel',  cost: 150,  power: 4.6,  mesh: 'chisel',  desc: 'splits the planks open' },
  { name: 'Iron Pry Bar', cost: 380,  power: 6.8,  mesh: 'prybar',  desc: 'pops wood and metal' },
  { name: 'Pocket Knife', cost: 900,  power: 9.6,  mesh: 'knife',   desc: 'carves the lid apart' },
  { name: 'Hacksaw',      cost: 2100, power: 13.5, mesh: 'saw',     desc: 'saws through wood and steel' },
  { name: 'Grave Auger',  cost: 4800, power: 19.0, mesh: 'auger',   desc: 'bores the lid to dust' },
];
const DIG_TOOLS = [
  { name: 'Bare Hands',   cost: 0,    power: 1.0,  mesh: 'hand',    desc: 'panic clawing in clay' },
  { name: 'Bent Spoon',   cost: 22,   power: 2.0,  mesh: 'spoon',   desc: 'first real scoop' },
  { name: 'Tin Cup',      cost: 80,   power: 3.2,  mesh: 'cup',     desc: 'moves loose soil fast' },
  { name: 'Rib Shovel',   cost: 220,  power: 4.8,  mesh: 'shovel',  desc: 'grim leverage' },
  { name: 'Hand Trowel',  cost: 560,  power: 7.0,  mesh: 'trowel',  desc: 'clean upward cuts' },
  { name: 'Folding Spade',cost: 1400, power: 10.0, mesh: 'spade',   desc: 'wide heavy scoops' },
  { name: 'Burrow Drill', cost: 3200, power: 14.0, mesh: 'drill',   desc: 'opens a throat in soil' },
  { name: 'Grave Claw',   cost: 7800, power: 20.0, mesh: 'claw',    desc: 'digs like a curse' },
];
const BODY = [
  { key: 'lungs', name: 'Tunnel Focus', base: 45, step: 40, per: 2,    max: 20, desc: (lv) => `legacy stamina slot (lvl ${lv})` },
  { key: 'grit',  name: 'Grave Grit',   base: 30, step: 34, per: 0.16, max: 12, desc: (lv) => `+16% claw power per level (lvl ${lv})` },
  { key: 'calm',  name: 'Scavenger',    base: 40, step: 46, per: 0.15, max: 8,  desc: (lv) => `+15% souls per level (lvl ${lv})` },
];

/* ------------------------- cemetery / residents ------------------------- */
// Each grave is an authored character dungeon. The numeric tier deliberately
// feeds the existing depth, coffin and steel equations so the excavation
// engine stays authoritative while the player gets a meaningful choice.
const GRAVE_CATALOG = [
  {
    id: 'jonah-vale', tutorial: true, tier: 1,
    name: 'Jonah Vale', profession: 'The first to wake', difficulty: 'First escape',
    epitaph: 'No kin claimed him. Buried before sunrise.',
    clue: 'His watch stopped at 12:17 - the same minute as every clock in town.',
    emergence: 'The bell woke me before the soil could forget my name.',
    rewardLabel: 'Cemetery ledger + Thick Nail',
    reward: { type: 'tutorial' },
    portrait: './assets/zombie/z1.png', initials: 'JV', accent: '#d7b078',
    materials: ['pine lid', 'packed soil'], recommended: 'Fingernail',
  },
  {
    id: 'mara-reed', tier: 1,
    name: 'Mara Reed', profession: 'Groundskeeper', difficulty: 'Shallow',
    epitaph: 'She tended every grave except her own.',
    clue: 'The mayor paid Mara to mark reinforced plots before anybody died.',
    emergence: 'Those graves were ordered early. Every name was already written.',
    rewardLabel: 'Bent Spoon + Soil Sense',
    reward: { type: 'groundskeeper' },
    portrait: './assets/zombie/z2.png', initials: 'MR', accent: '#9fb879',
    materials: ['pine lid', 'loose soil'], recommended: 'Fingernail',
  },
  {
    id: 'elias-bell', tier: 3,
    name: 'Elias Bell', profession: 'Undertaker', difficulty: 'Standard',
    epitaph: 'He knew every name before the bell rang.',
    clue: 'The coffins arrived engraved, lined with steel and warm on the inside.',
    emergence: 'I was ordered to keep the dead down. I hid tools with them instead.',
    rewardLabel: 'Thick Nail + Rib Shovel',
    reward: { type: 'undertaker' },
    portrait: './assets/zombie/z4.png', initials: 'EB', accent: '#b28a72',
    materials: ['oak lid', '5 cm steel', 'packed soil'], recommended: 'Bent Spoon',
  },
  {
    id: 'vera-kern', tier: 4,
    name: 'Vera Kern', profession: 'Pump Engineer', difficulty: 'Hardcore',
    epitaph: 'She heard something breathing below the pumps.',
    clue: 'The old pump opened into a sealed chamber directly beneath the cemetery.',
    emergence: 'Give me a workshop. I can make a gun that drinks the ground itself.',
    rewardLabel: 'Ground Sucker blueprint',
    reward: { type: 'ground-sucker' },
    portrait: './assets/zombie/z5.png', initials: 'VK', accent: '#78a8b8',
    materials: ['ironbound oak', '6 cm steel', 'deep soil'], recommended: 'Rib Shovel',
  },
];
const GRAVE_BY_ID = Object.fromEntries(GRAVE_CATALOG.map((grave) => [grave.id, grave]));
const TUTORIAL_GRAVE_ID = GRAVE_CATALOG.find((grave) => grave.tutorial).id;

function blankGraveProgress() {
  return { run: null, day: 1, deaths: 0, escaped: false, escapedAt: null, clueSeen: false, rewardClaimed: false };
}
function blankGraveProgressMap() {
  return Object.fromEntries(GRAVE_CATALOG.map((grave) => [grave.id, blankGraveProgress()]));
}

/* ------------------------------- save ------------------------------------ */
const SAVE_KEY = 'buried_again_v9';
const PREVIOUS_SAVE_KEY = 'buried_again_v8';
const LEGACY_SAVE_KEYS = ['buried_again_v7', 'buried_again_v6'];
const DEFAULT_META = () => ({
  metaVersion: 9,
  souls: 0, coffinTool: 0, digTool: 0, coffinLvl: 0, digLvl: 0, lungs: 0, grit: 0, calm: 0, gachaOpens: 0,
  grave: 1, day: 1, deaths: 0, playSec: 0, freebies: 0, seenTutorial: false, muted: false, sfxOff: {},
  activeGraveId: TUTORIAL_GRAVE_ID,
  totalDeaths: 0,
  lastRescuedId: null,
  storyFlags: { cemeteryUnlocked: false, townIntroSeen: false, groundSuckerBlueprint: false },
  graveProgress: blankGraveProgressMap(),
  level: null, // custom grave built in the level builder (null = default soil layers)
});

function normalizeMeta(raw) {
  const meta = Object.assign(DEFAULT_META(), raw || {});
  meta.storyFlags = Object.assign(DEFAULT_META().storyFlags, raw?.storyFlags || {});
  const oldProgress = raw?.graveProgress || {};
  meta.graveProgress = blankGraveProgressMap();
  GRAVE_CATALOG.forEach((grave) => {
    meta.graveProgress[grave.id] = Object.assign(blankGraveProgress(), oldProgress[grave.id] || {});
  });
  if (!GRAVE_BY_ID[meta.activeGraveId]) meta.activeGraveId = TUTORIAL_GRAVE_ID;
  meta.totalDeaths = Number.isFinite(raw?.totalDeaths) ? raw.totalDeaths : Math.max(0, Number(raw?.deaths) || 0);
  return meta;
}

function migrateLegacyMeta(old) {
  const meta = normalizeMeta(old);
  const oldTier = Math.max(1, Number(old?.grave) || 1);
  const tutorial = meta.graveProgress[TUTORIAL_GRAVE_ID];
  if (oldTier > 1) {
    tutorial.escaped = true;
    tutorial.clueSeen = true;
    tutorial.rewardClaimed = true;
    meta.storyFlags.cemeteryUnlocked = true;
    meta.coffinTool = Math.max(meta.coffinTool, 1);
  }
  let targetId = TUTORIAL_GRAVE_ID;
  if (oldTier >= 4) targetId = 'vera-kern';
  else if (oldTier >= 3) targetId = 'elias-bell';
  else if (oldTier >= 2) targetId = 'mara-reed';
  meta.activeGraveId = targetId;
  const target = meta.graveProgress[targetId];
  target.day = Math.max(1, old?.day || 1);
  target.deaths = Math.max(0, old?.deaths || 0);
  if (old?.run) target.run = Object.assign({}, old.run, { graveId: targetId, graveTier: oldTier });
  return meta;
}

function loadMeta() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) return normalizeMeta(JSON.parse(raw));
    const previousRaw = localStorage.getItem(PREVIOUS_SAVE_KEY);
    if (previousRaw) {
      const migrated = migrateLegacyMeta(JSON.parse(previousRaw));
      localStorage.setItem(SAVE_KEY, JSON.stringify(migrated));
      return migrated;
    }
    for (const key of LEGACY_SAVE_KEYS) {
      const legacyRaw = localStorage.getItem(key);
      if (!legacyRaw) continue;
      const old = JSON.parse(legacyRaw);
      if (old.run?.phase === 'coffin') old.run = null; // pre-v8 lid masks are not body-width collision fields
      if (old.run?.phase === 'dirt' && !old.run.soilWorld) old.run = null;
      const migrated = migrateLegacyMeta(old);
      localStorage.setItem(SAVE_KEY, JSON.stringify(migrated));
      return migrated;
    }
  } catch (e) {}
  return DEFAULT_META();
}
function saveMeta() {
  M.playSec = Math.round(G.totalPlay);
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(M)); } catch (e) {}
}
const M = loadMeta();

function activeGrave() { return GRAVE_BY_ID[M.activeGraveId] || GRAVE_BY_ID[TUTORIAL_GRAVE_ID]; }
function activeProgress() { return M.graveProgress[activeGrave().id]; }
function currentRun() { return activeProgress().run; }
function activeTier() { return currentRun()?.graveTier || activeGrave().tier; }
function graveStatus(grave) {
  const progress = M.graveProgress[grave.id];
  if (!grave.tutorial && !M.storyFlags.cemeteryUnlocked) return 'locked';
  if (progress.escaped) return 'rescued';
  if (progress.run) return 'resume';
  return 'available';
}

/* ----------------------------- progression ------------------------------- */
const AIR_ENABLED = false;
const BASE_AIR = 26;
const BREAK_FRAC = 0.4;       // (visual) how much of the lid is carved away when it breaks
const METAL_FRAC = 0.34;      // (visual) steel plate carve target
const DIRT_FRAC = 0.15;
function dirtNeed() { return Math.min(0.5, 0.11 + (activeTier() - 1) * 0.045); } // visual reveal target for soil
const hasMetal = (grave) => grave >= 3; // steel plate only from grave 3 (keep the first graves easy)
function metalThicknessFor(grave) {
  if (!hasMetal(grave)) return 0;
  // A separate, visibly thin reinforcing sheet. It grows with grave level but
  // never becomes a chunky slab that could be mistaken for another coffin.
  return Math.min(0.12, 0.05 + Math.max(0, grave - 3) * 0.012);
}
const SOUL_RATE = 26;

// ENERGY / TAP economy: each run is a fixed budget of taps; break-throughs are tap-costed, not timed.
const BASE_ENERGY = 20;       // starting air pool (~20 taps); Bigger Lungs adds more
const AIR_DRAIN = 0.15;       // air also leaks slowly on its own (suffocation) - tapping spends it faster
const AIR_REFILL = 0.75;      // once there's a hole (soil phase) air seeps back in, faster the bigger the hole
const TAP_AIR = 1;            // air spent per tap
const UPGRADE_STEP = 0.25;    // +25% tool power per upgrade level
const SOUL_PER_POWER = 1.4;   // souls banked per unit of tool power, each tap
function energyMax() {
  const early = Math.max(0, 22 - (activeTier() - 1) * 5); // generous air on the first graves so the coffin is EASY to smash, tightens by ~grave 6
  return BASE_ENERGY + early + M.lungs * BODY[0].per;
}
function soilDepthForTier(tier) { return 2.9 + (tier - 1) * 1.3; }
function soilDepth() { return soilDepthForTier(activeTier()); } // 3D soil volume (shallow tutorial, deeper authored graves)
function strataCount() { return Math.max(3, Math.round(soilDepth())); } // soil layers stacked in ONE face - you dig through ALL of them at once
const SOIL_PER_LAYER = 9;
const DIRT_CAMERA_TAPS = 20;      // first dirt face should feel like ~20 committed same-spot digs
const DIRT_LOCAL_RADIUS = 0.055;  // UV radius: scattered nearby taps widen; repeated local taps deepen
const SOIL_STEP_TRAVEL = 0.24;    // physical camera/body travel gained by one deepest-hole dig
const SOIL_LAYER_SPACING = 0.52;  // visible distance between dirt slabs as you move through the ground
const SOIL_VIEW_FOLLOW = 0.48;    // how much the body/camera shifts sideways into the active hole
const SOIL_CRAWL_RADIUS = 0.19;   // UV radius around the deep tunnel that counts as widening it
const SOIL_CRAWL_SPREAD = 0.115;  // required nearby spread before a body can crawl through
function layerCost() {
  if (G.phase === 'coffin') return Math.round(12 + (activeTier() - 1) * 4); // tutorial = thin 12-strike lid; tougher authored graves
  if (G.phase === 'metal') return 40;
  return strataCount() * SOIL_PER_LAYER; // ONE continuous dig through the whole stack: N layers = N*9 taps
}
const depthLayersFor = (grave) => 4 + Math.floor(grave * 1.2); // ~5 soil levels of depth at grave 1, deeper later
const feetFor = (grave) => 6 + (grave - 1) * 4;

// what a dig layer can be made of (paint fns are hoisted). The level builder arranges these.
const MATERIALS = {
  coffin:      { name: 'Coffin lid',     paint: (x, R) => paintWood(x, R),                    wood: true,  light: false, sw: '#6b4224' },
  soil:        { name: 'Packed soil',    paint: (x, R, i, n) => paintSoil(x, R, i, n),        wood: false, light: false, sw: '#6a4426' },
  clay:        { name: 'Hard clay',      paint: (x, R, i, n) => paintSoil(x, R, i, n, 'clay'),  wood: false, light: false, sw: '#95573a' },
  roots:       { name: 'Rooty earth',    paint: (x, R, i, n) => paintSoil(x, R, i, n, 'roots'), wood: false, light: false, sw: '#4c3a1e' },
  soilwood:    { name: 'Soil & boards',  paint: (x, R, i, n) => paintSoilWood(x, R, i, n),    wood: false, light: false, sw: '#5a3f28' },
  boards:      { name: 'Wooden boards',  paint: (x, R) => paintWood(x, R),                    wood: true,  light: false, sw: '#5e3a23' },
  lightboards: { name: 'Boards + light', paint: (x, R) => paintWoodLight(x, R),               wood: true,  light: true,  sw: '#9a7a34' },
};
const MAT_KEYS = ['soil', 'clay', 'roots', 'soilwood', 'boards', 'lightboards']; // builder palette (coffin is fixed)
// one continuous dig; the soil face itself is painted 5 strata thick (see paintSoilStrata).
function groundLayers() { return ['soil']; } // ONE continuous dig; the face itself is painted as a thick stack of strata (strataCount)
const SOIL_STRATA = 5;
function matProps(key) { return MATERIALS[key] || MATERIALS.soil; }

function toolFor(phase) { return phase === 'dirt' ? DIG_TOOLS[M.digTool] : COFFIN_TOOLS[M.coffinTool]; }
function toolLvl(phase) { return phase === 'dirt' ? M.digLvl : M.coffinLvl; }
function clawPower(phase) {
  return toolFor(phase).power * (1 + toolLvl(phase) * UPGRADE_STEP) * (1 + M.grit * BODY[1].per); // base x upgrades x grit
}
function toolPower(phase) { return toolFor(phase).power * (1 + toolLvl(phase) * UPGRADE_STEP); } // the shown "power" stat
const REVEAL_FLESH = ['finger', 'hand', 'bare'];
function toolIcon(mesh) { return REVEAL_FLESH.includes(mesh) ? `./assets/${mesh}_clean.png` : `./assets/${mesh}.png`; }
function upgradeCost(phase) { const lvl = toolLvl(phase); return Math.round(14 + lvl * 12 + toolFor(phase).power * 4); }

// Per-resident rot replaces the old anonymous global portrait. A resident's
// failed attempts belong to their own grave and never alter another card.
const ZOMBIE_THRESH = [4, 10, 20, 34, 52]; // black-outs are frequent now (tap budget), so rot slower
const ZOMBIE_MAX = 5;
const ZOMBIE_LABEL = ['Still human', 'Turning', 'Half-dead', 'Rotting', 'Ghoul', 'Full zombie'];
function zombieStage() { let s = 0; for (const th of ZOMBIE_THRESH) if ((activeProgress().deaths || 0) >= th) s++; return s; }
function updateAvatar() {
  const grave = activeGrave();
  const st = zombieStage();
  const humanity = Math.max(0, Math.round(100 - (st / ZOMBIE_MAX) * 100));
  const label = `<b>${grave.name}</b> · ${grave.profession}<br>${ZOMBIE_LABEL[st]} · humanity ${humanity}%`;
  ['menu-avatar', 'shop-avatar'].forEach((id) => { if (dom[id] && dom[id].getAttribute('src') !== grave.portrait) dom[id].src = grave.portrait; });
  ['menu-humanity', 'shop-humanity'].forEach((id) => { if (dom[id]) dom[id].innerHTML = label; });
}

/* ============================================================================
   AUDIO  -  pure WebAudio, no media elements. Lazy, gesture-started.
   ========================================================================== */
const Sound = (() => {
  let ctx = null, master = null, noiseBuf = null;
  let ambientSource = null, ambientGain = null;
  let sceneActive = false, outputMuted = !!M.muted;
  let onPlay = null;
  const ALLOWED_KEYS = ['dig', 'grave_ambient'];
  // The only recorded sound retained is the low background wind. Digging keeps
  // the existing short procedural tap that Tim approved.
  const SFX = {}, SFX_NAMES = ['grave_wind'];
  let sfxLoaded = false;
  function loadSFX() {
    if (!ctx || sfxLoaded) return; sfxLoaded = true;
    SFX_NAMES.forEach((name) => {
      fetch(`./assets/sfx/${name}.mp3`)
        .then((r) => r.arrayBuffer())
        .then((a) => ctx.decodeAudioData(a))
        .then((buf) => { SFX[name] = buf; syncAmbient(); })
        .catch(() => {});
    });
  }
  function playSample(name, gain = 0.7, rate = 1) {
    if (!ctx || !SFX[name]) return false;
    const s = ctx.createBufferSource(); s.buffer = SFX[name]; s.playbackRate.value = rate;
    const g = ctx.createGain(); g.gain.value = gain; s.connect(g); g.connect(master); s.start();
    return true;
  }
  function categoryMuted(key) { return !!(M.sfxOff && M.sfxOff[key]); }
  function stopAmbient() {
    if (ambientSource) {
      try { ambientSource.stop(); } catch (_) {}
      try { ambientSource.disconnect(); } catch (_) {}
    }
    if (ambientGain) {
      try { ambientGain.disconnect(); } catch (_) {}
    }
    ambientSource = null;
    ambientGain = null;
  }
  function syncAmbient() {
    const shouldLoop = !!(
      ctx && master && SFX.grave_wind && sceneActive && !outputMuted && !categoryMuted('grave_ambient')
    );
    if (!shouldLoop) { stopAmbient(); return; }
    if (ambientSource) return;
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    source.buffer = SFX.grave_wind;
    source.loop = true;
    gain.gain.value = 0.22;
    source.connect(gain); gain.connect(master); source.start();
    ambientSource = source;
    ambientGain = gain;
    if (onPlay) onPlay('grave_ambient');
  }
  function ensure() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = outputMuted ? 0 : 0.9;
    master.connect(ctx.destination);
    const n = ctx.sampleRate * 1.2; noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    loadSFX();
  }
  function resume() {
    ensure();
    if (ctx && ctx.state === 'suspended') ctx.resume();
    syncAmbient();
  }
  function noise(dur, type, freq, q, gain, attack = 0.002) {
    if (!ctx) return; const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); const tN = ctx.currentTime;
    g.gain.setValueAtTime(0.0001, tN); g.gain.exponentialRampToValueAtTime(gain, tN + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, tN + dur);
    s.connect(f); f.connect(g); g.connect(master); s.start(tN); s.stop(tN + dur + 0.02);
  }
  function tone(freq, dur, type, gain, slideTo) {
    if (!ctx) return; const o = ctx.createOscillator(); o.type = type; const g = ctx.createGain();
    const tN = ctx.currentTime; o.frequency.setValueAtTime(freq, tN);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, tN + dur);
    g.gain.setValueAtTime(0.0001, tN); g.gain.exponentialRampToValueAtTime(gain, tN + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, tN + dur);
    o.connect(g); g.connect(master); o.start(tN); o.stop(tN + dur + 0.02);
  }
  function playDig(power = 1) {
    if (!ctx) return false;
    // A short earthy crunch and body thud: this is the one approved dig sound.
    noise(0.1 + Math.random() * 0.06, 'lowpass', 360 + Math.random() * 170, 0.8, 0.18);
    tone(58 + Math.random() * 26, 0.09, 'sine', 0.05);
    return true;
  }
  const S = {
    resume, get ready() { return !!ctx; },
    setMuted(m) {
      outputMuted = !!m;
      ensure();
      if (master) master.gain.value = outputMuted ? 0 : 0.9;
      syncAmbient();
    },
    setSceneActive(active) { sceneActive = !!active; syncAmbient(); },
    setCategoryMuted(key, muted) {
      if (!ALLOWED_KEYS.includes(key)) return;
      M.sfxOff = M.sfxOff || {};
      if (muted) M.sfxOff[key] = 1;
      else delete M.sfxOff[key];
      syncAmbient();
    },
    dig(power) {
      if (categoryMuted('dig')) return;
      ensure();
      if (playDig(power) && onPlay) onPlay('dig');
    },
    onSfx(fn) { onPlay = fn; },
    audition(key) {
      resume();
      if (key === 'dig') {
        if (playDig(3) && onPlay) onPlay('dig');
      } else if (key === 'grave_ambient') {
        // Audition is deliberately one-shot; it never creates a second loop.
        if (playSample('grave_wind', 0.26) && onPlay) onPlay('grave_ambient');
      }
    },
    state() {
      return {
        allowedKeys: [...ALLOWED_KEYS],
        ambientLooping: !!ambientSource,
        sceneActive,
        outputMuted,
        categoryMuted: {
          dig: categoryMuted('dig'),
          grave_ambient: categoryMuted('grave_ambient'),
        },
      };
    },
    SOUND_KEYS: [...ALLOWED_KEYS],
  };
  return S;
})();

/* ============================================================================
   THREE  -  scene, camera, headlamp, shaft.
   ========================================================================== */
const canvas = document.getElementById('scene-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
renderer.setClearColor(0x04050a, 1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x05060b, 0.10);

const CAM_Z = 3.4;
const SOIL_BODY_CAMERA_OFFSET = 0.34;
const SOIL_START_Z = SOIL_BODY_CAMERA_OFFSET + COFFIN_TRAVEL_DEPTH;
// Real adult coffin interiors are about 1.93-1.96m long, 0.57-0.61m
// shoulder-wide, and roughly 0.30-0.36m deep. These dimensions remain the
// physical return space after the active lid has released as one whole barrier.
const COFFIN_INTERIOR_LENGTH = 1.95;
const COFFIN_INTERIOR_WIDTH = 0.60;
const COFFIN_CENTER_Y = 0;
const COFFIN_WALL_THICKNESS = 0.08;
const COFFIN_OUTER_WIDTH = COFFIN_INTERIOR_WIDTH + COFFIN_WALL_THICKNESS * 2;
const coffinHeadY = COFFIN_CENTER_Y + COFFIN_INTERIOR_LENGTH / 2;
const coffinFootY = COFFIN_CENTER_Y - COFFIN_INTERIOR_LENGTH / 2;
const coffinShoulderY = COFFIN_CENTER_Y + COFFIN_INTERIOR_LENGTH * 0.24;
// The construction plan is long on local Y. First-person presentation rotates
// it 90 degrees, so its long axis is screen/world X and its shallow axis is Y.
const coffinOuterPlan = [
  [-0.20 - COFFIN_WALL_THICKNESS, coffinHeadY + COFFIN_WALL_THICKNESS],
  [0.20 + COFFIN_WALL_THICKNESS, coffinHeadY + COFFIN_WALL_THICKNESS],
  [COFFIN_OUTER_WIDTH / 2, coffinShoulderY],
  [0.19 + COFFIN_WALL_THICKNESS, coffinFootY - COFFIN_WALL_THICKNESS],
  [-0.19 - COFFIN_WALL_THICKNESS, coffinFootY - COFFIN_WALL_THICKNESS],
  [-COFFIN_OUTER_WIDTH / 2, coffinShoulderY],
];
const coffinHorizontalPlan = coffinOuterPlan.map(([x, y]) => [-y, x]);
const shapeFromPoints = (points) => {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) shape.lineTo(points[i][0], points[i][1]);
  shape.closePath();
  return shape;
};
function pointInPolygon(x, y, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    const crosses = (yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}
function coffinSurfaceContainsWorld(x, y) {
  return pointInPolygon(x, y, coffinHorizontalPlan);
}
function drawCoffinSurfaceMask(context, size, spanMeters) {
  context.beginPath();
  coffinHorizontalPlan.forEach(([x, y], index) => {
    const px = (x / spanMeters + 0.5) * size;
    const py = (0.5 - y / spanMeters) * size;
    if (index === 0) context.moveTo(px, py);
    else context.lineTo(px, py);
  });
  context.closePath();
  context.fill();
}
const camera = new THREE.PerspectiveCamera(60, 1, 0.04, 100);
camera.position.set(0, 0, CAM_Z);
camera.lookAt(0, 0, 0);
scene.add(camera);

const ambient = new THREE.AmbientLight(0x223047, 0.5);
scene.add(ambient);

// headlamp - a warm spot from the player's eyes onto the surface
const lamp = new THREE.SpotLight(0xffd9a3, 26, 14, Math.PI / 4.2, 0.55, 1.6);
lamp.position.set(0, 0.15, CAM_Z - 0.2);
lamp.target.position.set(0, 0, 0);
scene.add(lamp); scene.add(lamp.target);

// faint cool fill so shadows aren't dead black
const fill = new THREE.PointLight(0x3a5170, 6, 10, 2);
fill.position.set(-1.2, 1.0, CAM_Z + 0.5);
scene.add(fill);

// the daylight that grows as you near the surface (from behind the dirt)
const sky = new THREE.DirectionalLight(0xfff2cf, 0.0);
sky.position.set(0.2, 0.4, -4);
sky.target.position.set(0, 0, 0);
scene.add(sky); scene.add(sky.target);

// THE LIGHT AT THE END OF THE TUNNEL: a warm point light sitting at the far end of the pit. It
// shines back up toward the player and lights the pit walls from within, so the tunnel glows from
// inside instead of a flat flickering disc. Its intensity grows as you dig near the surface.
const tunnelLight = new THREE.PointLight(0xffdf9e, 0, 3.4, 1.5);
tunnelLight.position.set(0, 0, -0.85);
scene.add(tunnelLight);

// white disc in FRONT of the pit for the final escape flood only (opacity stays 0 during the dig)
const skyGlowMat = new THREE.MeshBasicMaterial({ color: 0xbfe4ff, transparent: true, opacity: 0, fog: false });
const skyGlow = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), skyGlowMat);
skyGlow.position.set(0, 0, -0.5);
scene.add(skyGlow);

// a warm bloom that spills OUT of the hole toward the player as the light breaks through (shimmers)
function radialGlowTex() {
  const c = mkCanvas(128), x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,246,220,1)'); g.addColorStop(0.4, 'rgba(255,240,200,0.45)'); g.addColorStop(1, 'rgba(255,240,200,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const bloomMat = new THREE.SpriteMaterial({ map: radialGlowTex(), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
const bloom = new THREE.Sprite(bloomMat);
bloom.position.set(0, 0, -0.3); bloom.scale.set(1.6, 1.6, 1);
scene.add(bloom);

/* --------- the shaft: a dark tube the player sits at the bottom of -------- */
function wallTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
  x.fillStyle = '#0a0805'; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1400; i++) {
    const v = 6 + Math.random() * 26; x.fillStyle = `rgba(${v + 10},${v},${v - 4},0.5)`;
    x.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
  const tx = new THREE.CanvasTexture(c); tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.repeat.set(2, 3);
  tx.colorSpace = THREE.SRGBColorSpace; return tx;
}
const shaftMat = new THREE.MeshStandardMaterial({ map: wallTexture(), roughness: 1, metalness: 0, side: THREE.BackSide });
const SHAFT_LEN = 7.6;
const shaft = new THREE.Mesh(new THREE.BoxGeometry(3.9, 3.9, SHAFT_LEN), shaftMat);
shaft.position.set(0, 0, CAM_Z - SHAFT_LEN / 2 + 0.6); // extended to enclose the deep pit
scene.add(shaft);

const digTunnel = new THREE.Group();
const digTunnelWallMat = new THREE.MeshStandardMaterial({
  map: wallTexture(), roughness: 1, metalness: 0, side: THREE.BackSide, transparent: true, opacity: 0,
});
digTunnelWallMat.map.repeat.set(1.3, 4.4);
const digTunnelRingMat = new THREE.MeshStandardMaterial({
  color: 0x4b2712, roughness: 1, metalness: 0, transparent: true, opacity: 0,
  depthWrite: false,
});
const digTunnelClodMat = new THREE.MeshStandardMaterial({
  color: 0x3f2110, roughness: 1, metalness: 0, transparent: true, opacity: 0,
  depthWrite: false,
});
const digTunnelMouthMat = new THREE.MeshStandardMaterial({
  map: wallTexture(), roughness: 1, metalness: 0, side: THREE.DoubleSide, transparent: true, opacity: 0,
  depthWrite: false,
});
digTunnelMouthMat.map.repeat.set(3.2, 1.2);
const digTunnelTube = new THREE.Mesh(new THREE.CylinderGeometry(1.52, 1.66, 4.4, 48, 12, true), digTunnelWallMat);
digTunnelTube.rotation.x = Math.PI / 2;
digTunnelTube.position.z = 1.96;
digTunnelTube.renderOrder = -2;
digTunnel.add(digTunnelTube);
const digTunnelRings = [];
for (let i = 0; i < 12; i++) {
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.38 + Math.sin(i * 1.7) * 0.06, 0.012, 5, 36), digTunnelRingMat);
  ring.position.z = 0.18 + i * 0.31;
  ring.rotation.z = i * 0.71;
  ring.userData.baseZ = ring.position.z;
  ring.userData.tunnelRing = true;
  digTunnel.add(ring); digTunnelRings.push(ring);
}
for (let i = 0; i < 34; i++) {
  const a = Math.random() * Math.PI * 2;
  const r = 1.28 + Math.random() * 0.18;
  const clod = new THREE.Mesh(new THREE.IcosahedronGeometry(0.025 + Math.random() * 0.045, 0), digTunnelClodMat);
  clod.position.set(Math.cos(a) * r, Math.sin(a) * r, 0.25 + Math.random() * 3.15);
  clod.scale.set(1 + Math.random(), 0.55 + Math.random(), 0.7 + Math.random() * 1.2);
  clod.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
  clod.userData.baseZ = clod.position.z;
  digTunnel.add(clod);
}
digTunnel.visible = false;
scene.add(digTunnel);

const digTunnelMouth = new THREE.Group();
const digTunnelMouthRims = [];
for (let i = 0; i < 6; i++) {
  const inner = 0.92 + i * 0.075;
  const outer = 2.25 + i * 0.36;
  const rim = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 96, 3), digTunnelMouthMat);
  rim.position.z = 0.14 + i * 0.36;
  rim.rotation.z = i * 0.39;
  rim.userData.baseZ = rim.position.z;
  rim.renderOrder = -1;
  digTunnelMouth.add(rim);
  digTunnelMouthRims.push(rim);
}
digTunnelMouth.visible = false;
scene.add(digTunnelMouth);

function soilLayerTexture(seed) {
  const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
  const base = [
    [95, 57, 30],
    [78, 45, 24],
    [58, 35, 21],
    [104, 66, 38],
  ][seed % 4];
  const g = x.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, `rgb(${base[0] + 22},${base[1] + 18},${base[2] + 12})`);
  g.addColorStop(0.52, `rgb(${base[0]},${base[1]},${base[2]})`);
  g.addColorStop(1, `rgb(${Math.max(20, base[0] - 28)},${Math.max(14, base[1] - 22)},${Math.max(10, base[2] - 14)})`);
  x.fillStyle = g; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) {
    const v = (Math.random() - 0.5) * 34;
    x.fillStyle = `rgba(${base[0] + v},${base[1] + v * 0.8},${base[2] + v * 0.5},0.55)`;
    const s = 1 + Math.random() * 3;
    x.fillRect(Math.random() * 256, Math.random() * 256, s, s);
  }
  for (let i = 0; i < 20; i++) {
    x.fillStyle = `rgba(${30 + Math.random() * 35},${26 + Math.random() * 26},${20 + Math.random() * 18},0.65)`;
    x.beginPath(); x.ellipse(Math.random() * 256, Math.random() * 256, 3 + Math.random() * 9, 2 + Math.random() * 5, Math.random() * 3, 0, Math.PI * 2); x.fill();
  }
  const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; return tx;
}

const soilLayerGroup = new THREE.Group();
const soilLayerSlices = [];
for (let i = 0; i < 9; i++) {
  const mat = new THREE.MeshStandardMaterial({
    map: soilLayerTexture(i), roughness: 1, metalness: 0, side: THREE.DoubleSide,
    transparent: true, opacity: 0, depthWrite: false,
  });
  const inner = 0.46 + (i % 3) * 0.045;
  const outer = 2.18 + (i % 4) * 0.12;
  const slice = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 96, 8), mat);
  slice.position.z = 0.28 + i * SOIL_LAYER_SPACING;
  slice.rotation.z = i * 0.51;
  slice.userData.baseZ = i * SOIL_LAYER_SPACING;
  slice.userData.baseScale = 0.92 + (i % 4) * 0.035;
  slice.renderOrder = -1;
  soilLayerGroup.add(slice);
  soilLayerSlices.push(slice);
}
soilLayerGroup.visible = false;
scene.add(soilLayerGroup);

const localHoleVisualGroup = new THREE.Group();
const localHoleVisuals = [];
const holeShadowMat = new THREE.MeshBasicMaterial({
  color: 0x030201, transparent: true, opacity: 0, depthWrite: false, depthTest: false,
});
const holeRimMat = new THREE.MeshStandardMaterial({
  color: 0x7a4320, roughness: 1, metalness: 0, transparent: true, opacity: 0, depthWrite: false, depthTest: false,
});
const holeLayerMat = new THREE.MeshStandardMaterial({
  color: 0x3f2413, roughness: 1, metalness: 0, transparent: true, opacity: 0, depthWrite: false, depthTest: false,
});
const holeShadowGeo = new THREE.CircleGeometry(0.26, 42);
const holeRimGeo = new THREE.RingGeometry(0.21, 0.32, 42, 4);
const holeLayerGeo = new THREE.RingGeometry(0.17, 0.24, 36, 3);
for (let i = 0; i < 10; i++) {
  const group = new THREE.Group();
  const shadow = new THREE.Mesh(holeShadowGeo, holeShadowMat.clone());
  shadow.position.z = 0.022;
  shadow.renderOrder = 8;
  group.add(shadow);
  const rim = new THREE.Mesh(holeRimGeo, holeRimMat.clone());
  rim.position.z = 0.034;
  rim.renderOrder = 9;
  group.add(rim);
  const layers = [];
  for (let j = 0; j < 4; j++) {
    const layer = new THREE.Mesh(holeLayerGeo, holeLayerMat.clone());
    layer.position.z = 0.046 + j * 0.012;
    layer.scale.setScalar(1 + j * 0.22);
    layer.renderOrder = 10 + j;
    group.add(layer);
    layers.push(layer);
  }
  group.visible = false;
  group.userData = { shadow, rim, layers, wobble: 0.85 + Math.random() * 0.3 };
  localHoleVisualGroup.add(group);
  localHoleVisuals.push(group);
}
localHoleVisualGroup.visible = false;
scene.add(localHoleVisualGroup);

function updateDigTunnel(now, dt = 1 / 60) {
  const active = G.mode === 'play' && G.phase === 'dirt';
  if (!active) {
    digTunnel.visible = false; digTunnelMouth.visible = false; soilLayerGroup.visible = false; localHoleVisualGroup.visible = false;
    G.soilTravelVel = 0;
    return;
  }
  const t = Math.min(1, Math.max(0, (G.soilDeepestStep || 0) / DIRT_CAMERA_TAPS));
  G.soilTravelTarget = Math.max(G.soilTravelTarget || 0, (G.soilDeepestStep || 0) * SOIL_STEP_TRAVEL);
  const beforeTravel = G.soilTravel || 0;
  const delta = Math.max(0, (G.soilTravelTarget || 0) - beforeTravel);
  const step = delta * Math.min(1, dt * 7.5);
  G.soilTravel = Math.min(G.soilTravelTarget || 0, beforeTravel + step);
  G.soilTravelVel = dt > 0 ? (G.soilTravel - beforeTravel) / dt : 0;
  const maxViewDepth = Math.max(0, G.soilTravel || 0);
  if (!G.soilViewDepthManual) G.soilViewDepthTarget = maxViewDepth;
  G.soilViewDepthTarget = Math.max(0, Math.min(maxViewDepth, G.soilViewDepthTarget || 0));
  const beforeViewDepth = G.soilViewDepth || 0;
  G.soilViewDepth = beforeViewDepth + (G.soilViewDepthTarget - beforeViewDepth) * Math.min(1, dt * 6);

  const opacity = 0.24 + t * 0.18;
  digTunnel.visible = false;
  digTunnelMouth.visible = false;
  soilLayerGroup.visible = false;
  localHoleVisualGroup.visible = false;
  for (const hole of localHoleVisuals) hole.visible = false;
  digTunnelWallMat.opacity = opacity;
  digTunnelRingMat.opacity = Math.min(0.22, 0.08 + t * 0.12);
  digTunnelClodMat.opacity = Math.min(0.32, opacity + 0.06);
  digTunnelMouthMat.opacity = 0;
  const lurch = G.depthLurch || 0;
  digTunnelTube.scale.setScalar(1.08 + t * 0.08 + lurch * 0.018);
  const travel = (G.soilViewDepth || 0) + lurch * 0.28;
  for (const ring of digTunnelRings) {
    let z = ring.userData.baseZ + travel;
    while (z > 3.55) z -= 3.55;
    ring.position.z = z;
    ring.rotation.z += 0.0003 * (1 + t) * Math.sin(now * 0.001 + ring.userData.baseZ);
  }
  for (const clod of digTunnel.children) {
    if (!clod.userData || clod.userData.baseZ == null || clod.userData.tunnelRing) continue;
    let z = clod.userData.baseZ + travel * 0.75;
    while (z > 3.45) z -= 3.3;
    clod.position.z = z;
  }
  G.soilViewX = (G.soilViewX || 0) + ((G.soilViewTargetX || 0) - (G.soilViewX || 0)) * Math.min(1, dt * 7);
  G.soilViewY = (G.soilViewY || 0) + ((G.soilViewTargetY || 0) - (G.soilViewY || 0)) * Math.min(1, dt * 7);
}

/* ============================================================================
   CARVE SURFACE  -  a subdivided plane displaced + bump-shaded by a depth
   canvas. Drag to carve; material recesses organically (no grid).
   ========================================================================== */
const DEPTH_RES = 256, COLOR_RES = 512, SURF_W = 3.4;
function mkCanvas(n) { const c = document.createElement('canvas'); c.width = c.height = n; return c; }

class PlanarOpening {
  constructor(size = 128, spanMeters = SURF_W) {
    this.size = size;
    this.spanMeters = spanMeters;
    this.cellMeters = spanMeters / size;
    this.requiredRadius = BODY_RADIUS_METERS;
    this.damage = new Uint8Array(size * size);
    this.component = new Uint8Array(size * size);
  }

  reset() {
    this.damage.fill(0);
    this.component.fill(0);
  }

  stamp(sourceX, sourceY, sourceRadius, strength, sourceSize = DEPTH_RES) {
    const scale = this.size / sourceSize;
    const cx = sourceX * scale;
    const cy = sourceY * scale;
    const radius = Math.max(0.75, sourceRadius * scale);
    const minX = Math.max(0, Math.floor(cx - radius));
    const maxX = Math.min(this.size - 1, Math.ceil(cx + radius));
    const minY = Math.max(0, Math.floor(cy - radius));
    const maxY = Math.min(this.size - 1, Math.ceil(cy + radius));
    let changedCells = 0;
    let newlySevered = 0;

    for (let iy = minY; iy <= maxY; iy++) {
      for (let ix = minX; ix <= maxX; ix++) {
        const distance = Math.hypot(ix + 0.5 - cx, iy + 0.5 - cy) / radius;
        if (distance >= 1) continue;
        const falloff = distance <= 0.6
          ? 1 - distance / 1.2
          : 0.5 * (1 - (distance - 0.6) / 0.4);
        const index = ix + this.size * iy;
        const before = this.damage[index];
        const after = Math.min(255, before + Math.max(1, Math.round(strength * 255 * falloff)));
        if (after === before) continue;
        this.damage[index] = after;
        changedCells++;
        if (before < 128 && after >= 128) newlySevered++;
      }
    }
    return { changedCells, newlySevered };
  }

  rebuildComponent() {
    this.component.fill(0);
    const center = (this.size - 1) / 2;
    const bodyRadiusCells = this.requiredRadius / this.cellMeters;
    const coreRadiusCells = 0.09 / this.cellMeters;
    const labels = new Uint16Array(this.damage.length);
    const queue = new Int32Array(this.damage.length);
    let label = 0;
    let bestLabel = 0;
    let bestBodyCoverage = -1;
    let bestCoreCoverage = -1;
    let bestCenterDistance = Infinity;
    let bestCellCount = -1;
    let severedCells = 0;
    for (let start = 0; start < this.damage.length; start++) {
      if (this.damage[start] < 128) continue;
      severedCells++;
      if (labels[start]) continue;

      label++;
      let head = 0;
      let tail = 0;
      let bodyCoverage = 0;
      let coreCoverage = 0;
      let centerDistance = Infinity;
      queue[tail++] = start;
      labels[start] = label;
      while (head < tail) {
        const index = queue[head++];
        const iy = Math.floor(index / this.size);
        const ix = index - iy * this.size;
        const distance = Math.hypot(ix - center, iy - center);
        if (distance <= bodyRadiusCells) bodyCoverage++;
        if (distance <= coreRadiusCells) coreCoverage++;
        centerDistance = Math.min(centerDistance, distance);
        const neighbors = [[ix + 1, iy], [ix - 1, iy], [ix, iy + 1], [ix, iy - 1]];
        for (const [nx, ny] of neighbors) {
          if (nx < 0 || nx >= this.size || ny < 0 || ny >= this.size) continue;
          const next = nx + this.size * ny;
          if (labels[next] || this.damage[next] < 128) continue;
          labels[next] = label;
          queue[tail++] = next;
        }
      }

      const isBetter = bodyCoverage > bestBodyCoverage ||
        (bodyCoverage === bestBodyCoverage && coreCoverage > bestCoreCoverage) ||
        (bodyCoverage === bestBodyCoverage && coreCoverage === bestCoreCoverage && centerDistance < bestCenterDistance) ||
        (bodyCoverage === bestBodyCoverage && coreCoverage === bestCoreCoverage && centerDistance === bestCenterDistance && tail > bestCellCount);
      if (isBetter) {
        bestLabel = label;
        bestBodyCoverage = bodyCoverage;
        bestCoreCoverage = coreCoverage;
        bestCenterDistance = centerDistance;
        bestCellCount = tail;
      }
    }

    if (bestLabel) {
      for (let index = 0; index < labels.length; index++) {
        if (labels[index] === bestLabel) this.component[index] = 1;
      }
    }
    return severedCells;
  }

  evaluate() {
    const severedCells = this.rebuildComponent();
    const origin = -this.spanMeters / 2;
    const clearance = evaluateDiscClearance({
      centerX: 0,
      centerY: 0,
      radius: this.requiredRadius,
      columns: this.size,
      rows: this.size,
      cellWidth: this.cellMeters,
      cellHeight: this.cellMeters,
      originX: origin,
      originY: origin,
      isBlocked: (ix, iy) => this.component[ix + this.size * iy] === 0,
      isConnected: (ix, iy) => this.component[ix + this.size * iy] === 1,
    });
    const core = evaluateDiscClearance({
      centerX: 0,
      centerY: 0,
      radius: 0.09,
      columns: this.size,
      rows: this.size,
      cellWidth: this.cellMeters,
      cellHeight: this.cellMeters,
      originX: origin,
      originY: origin,
      isBlocked: (ix, iy) => this.component[ix + this.size * iy] === 0,
      isConnected: (ix, iy) => this.component[ix + this.size * iy] === 1,
    });

    const sides = {
      left: { checked: 0, blockers: 0 },
      right: { checked: 0, blockers: 0 },
      top: { checked: 0, blockers: 0 },
      bottom: { checked: 0, blockers: 0 },
    };
    for (let iy = 0; iy < this.size; iy++) {
      for (let ix = 0; ix < this.size; ix++) {
        const x = origin + (ix + 0.5) * this.cellMeters;
        const y = origin + (iy + 0.5) * this.cellMeters;
        if (Math.hypot(x, y) > this.requiredRadius) continue;
        const side = Math.abs(x) >= Math.abs(y)
          ? (x < 0 ? 'left' : 'right')
          : (y < 0 ? 'top' : 'bottom');
        sides[side].checked++;
        if (!this.component[ix + this.size * iy]) sides[side].blockers++;
      }
    }
    const sideOpenRatios = {};
    const blockedSides = [];
    for (const [side, values] of Object.entries(sides)) {
      const limit = Math.max(1, Math.floor(values.checked * MAX_BLOCKER_RATIO));
      sideOpenRatios[side] = values.checked ? 1 - values.blockers / values.checked : 0;
      if (values.blockers > limit) blockedSides.push(side);
    }
    const requiredOpenRatio = 1 - MAX_BLOCKER_RATIO;
    const progress = Math.min(1, clearance.openRatio / requiredOpenRatio);
    return {
      version: 1,
      requiredDiameter: this.requiredRadius * 2,
      openRatio: clearance.openRatio,
      blockers: clearance.blockers,
      blockerLimit: clearance.blockerLimit,
      checked: clearance.checked,
      depthReady: core.passable,
      passable: clearance.passable,
      progress,
      blockedSides,
      sideOpenRatios,
      severedCells,
    };
  }

  drawAlpha(context) {
    context.clearRect(0, 0, this.size, this.size);
    context.fillStyle = '#fff';
    drawCoffinSurfaceMask(context, this.size, this.spanMeters);
    context.fillStyle = '#000';
    for (let iy = 0; iy < this.size; iy++) {
      for (let ix = 0; ix < this.size; ix++) {
        if (this.damage[ix + this.size * iy] >= 128) context.fillRect(ix, iy, 1, 1);
      }
    }
  }

  drawCutGuide(context, opening, halo = false) {
    context.clearRect(0, 0, this.size, this.size);
    // Do not flood a fresh lid with instructions. Once there is a meaningful
    // opening, every *real* solid cell that still blocks the body disc is red.
    // The guide therefore cannot disagree with the pass/fail geometry.
    if (!opening || opening.passable || !opening.severedCells || opening.progress < 0.42) return 0;

    const origin = -this.spanMeters / 2;
    let guideCells = 0;
    context.fillStyle = '#fff';
    for (let iy = 0; iy < this.size; iy++) {
      for (let ix = 0; ix < this.size; ix++) {
        const index = ix + this.size * iy;
        if (this.damage[index] >= 128 || this.component[index]) continue;
        const x = origin + (ix + 0.5) * this.cellMeters;
        const y = origin + (iy + 0.5) * this.cellMeters;
        if (Math.hypot(x, y) > this.requiredRadius) continue;
        if (halo) context.fillRect(ix - 3, iy - 3, 7, 7);
        else context.fillRect(ix, iy, 1, 1);
        guideCells++;
      }
    }
    return guideCells;
  }

  serialize() {
    let binary = '';
    for (let offset = 0; offset < this.damage.length; offset += 0x4000) {
      binary += String.fromCharCode(...this.damage.subarray(offset, offset + 0x4000));
    }
    return { version: 1, size: this.size, damage: btoa(binary) };
  }

  restore(snapshot) {
    if (!snapshot || snapshot.version !== 1 || snapshot.size !== this.size || typeof snapshot.damage !== 'string') return false;
    try {
      const binary = atob(snapshot.damage);
      if (binary.length !== this.damage.length) return false;
      for (let index = 0; index < binary.length; index++) this.damage[index] = binary.charCodeAt(index);
      return true;
    } catch (_) {
      return false;
    }
  }
}

class Surface {
  constructor() {
    this.depthCanvas = mkCanvas(DEPTH_RES);
    this.colorCanvas = mkCanvas(COLOR_RES);
    this.dc = this.depthCanvas.getContext('2d');
    this.cc = this.colorCanvas.getContext('2d');
    this.sample = mkCanvas(40); this.sx = this.sample.getContext('2d');
    this.strataCache = mkCanvas(COLOR_RES); this.scc = this.strataCache.getContext('2d'); this.dug = 0; // cached soil strata + how far the tunnel has eaten up through them

    this.depthTex = new THREE.CanvasTexture(this.depthCanvas); this.depthTex.colorSpace = THREE.NoColorSpace;
    this.colorTex = new THREE.CanvasTexture(this.colorCanvas); this.colorTex.colorSpace = THREE.SRGBColorSpace;
    this.barrier = new PlanarOpening(128, SURF_W);
    this.barrierAlphaCanvas = mkCanvas(this.barrier.size);
    this.barrierAlphaContext = this.barrierAlphaCanvas.getContext('2d');
    this.barrierAlphaTex = new THREE.CanvasTexture(this.barrierAlphaCanvas);
    this.barrierAlphaTex.colorSpace = THREE.NoColorSpace;
    this.barrierAlphaTex.minFilter = THREE.NearestFilter;
    this.barrierAlphaTex.magFilter = THREE.NearestFilter;
    this.cutGuideCanvas = mkCanvas(this.barrier.size);
    this.cutGuideContext = this.cutGuideCanvas.getContext('2d');
    this.cutGuideTex = new THREE.CanvasTexture(this.cutGuideCanvas);
    this.cutGuideTex.colorSpace = THREE.NoColorSpace;
    this.cutGuideTex.minFilter = THREE.NearestFilter;
    this.cutGuideTex.magFilter = THREE.NearestFilter;
    this.cutGuideTex.generateMipmaps = false;
    this.cutGuideHaloCanvas = mkCanvas(this.barrier.size);
    this.cutGuideHaloContext = this.cutGuideHaloCanvas.getContext('2d');
    this.cutGuideHaloTex = new THREE.CanvasTexture(this.cutGuideHaloCanvas);
    this.cutGuideHaloTex.colorSpace = THREE.NoColorSpace;
    this.cutGuideHaloTex.minFilter = THREE.LinearFilter;
    this.cutGuideHaloTex.magFilter = THREE.LinearFilter;
    this.cutGuideHaloTex.generateMipmaps = false;
    this.cutGuideCells = 0;
    this.opening = this.barrier.evaluate();

    this.mat = new THREE.MeshStandardMaterial({
      map: this.colorTex, bumpMap: this.depthTex, bumpScale: -2.2,
      displacementMap: this.depthTex, displacementScale: -1.0, displacementBias: 0, // pit depth (~2 layers for testing)
      emissiveMap: this.colorTex,
      emissive: 0x321609,
      emissiveIntensity: 0.34,
      roughness: 0.95, metalness: 0,
    });
    this.geo = new THREE.PlaneGeometry(3.4, 3.4, 200, 200);
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.position.set(0, 0, 0);
    scene.add(this.mesh);

    this.cutGuideMaterial = new THREE.MeshBasicMaterial({
      color: 0xff2418,
      alphaMap: this.cutGuideTex,
      alphaTest: 0.05,
      transparent: true,
      opacity: 0.94,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.cutGuideHaloMaterial = new THREE.MeshBasicMaterial({
      color: 0xff1208,
      alphaMap: this.cutGuideHaloTex,
      alphaTest: 0.01,
      transparent: true,
      opacity: 0.28,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.cutGuideGroup = new THREE.Group();
    this.cutGuideGroup.name = 'coffin-width-cut-guides';
    this.cutGuideHaloMesh = new THREE.Mesh(this.geo, this.cutGuideHaloMaterial);
    this.cutGuideHaloMesh.name = 'coffin-blocker-visibility-halo';
    this.cutGuideHaloMesh.position.z = 0.016;
    // These cells are authoritative collision, not decoration. Keep them above
    // the working hand so even tiny centre blockers remain visible.
    this.cutGuideHaloMesh.renderOrder = 111;
    this.cutGuideHaloMesh.visible = false;
    this.cutGuideMesh = new THREE.Mesh(this.geo, this.cutGuideMaterial);
    this.cutGuideMesh.name = 'coffin-authoritative-width-blocks';
    this.cutGuideMesh.position.z = 0.02;
    this.cutGuideMesh.renderOrder = 112;
    this.cutGuideMesh.visible = false;
    this.cutGuideGroup.add(this.cutGuideHaloMesh);
    this.cutGuideGroup.add(this.cutGuideMesh);
    this.cutGuideGroup.visible = false;
    scene.add(this.cutGuideGroup);

    // backing: the material *behind* what you carve - revealed through the hole,
    // brightens toward sky as you near the surface (the light at the end).
    this.backCanvas = mkCanvas(256); this.bc = this.backCanvas.getContext('2d');
    this.backTex = new THREE.CanvasTexture(this.backCanvas); this.backTex.colorSpace = THREE.SRGBColorSpace;
    // polygonOffset lets this bright "end" plane win the depth test cleanly against the pit floor
    // near the same z, so the reveal doesn't z-fight/flicker as you dig down onto it. emissiveMap =
    // the same canvas so the SKY (blue + clouds + sun) self-illuminates and glows through the hole.
    this.backMat = new THREE.MeshBasicMaterial({ map: this.backTex, color: 0x808080, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }); // backing plane for coffin/metal holes only
    this.backMesh = new THREE.Mesh(new THREE.PlaneGeometry(7, 7), this.backMat);
    this.backMesh.position.set(0, 0, -0.85);  // sits just in front of the deepest dig: revealed as you tunnel down to it
    scene.add(this.backMesh);

    this.frac = 0; this._frameCount = 0; this.kind = 'coffin'; this.material = 'coffin';
  }
  reset(kind, layer, grave, snap) {
    this.kind = kind; this.frac = 0; this.dug = 0;
    this.material = kind === 'coffin' ? 'coffin' : kind === 'metal' ? 'metal' : 'soil';
    const metalThickness = metalThicknessFor(grave);
    const faceZ = kind === 'coffin'
      ? metalThickness + 0.045
      : (kind === 'metal' ? metalThickness + 0.003 : 0);
    this.mesh.position.z = faceZ;
    this.cutGuideGroup.position.z = faceZ;
    this.mat.displacementScale = kind === 'dirt' ? -1.85 : -1.0;
    this.mat.bumpScale = kind === 'dirt' ? -3.6 : -2.2;
    this.mat.emissive.setHex(kind === 'metal' ? 0x29313a : 0x321609);
    this.mat.emissiveIntensity = kind === 'metal' ? 0.28 : 0.34;
    this.barrier.reset();
    const restoredBarrier = kind === 'coffin' && this.barrier.restore(snap?.barrier);
    // The active coffin/steel barrier is one continuous full-screen face.
    // Scratches deform it, but no circular alpha-cut opening is carved.
    this.mat.alphaMap = null;
    this.mat.alphaTest = 0;
    this.mat.needsUpdate = true;
    this.backMesh.visible = this.mesh.visible && this.material !== 'soil';
    // Dirt has more packed soil behind the carved face. Sky appears only on actual breakthrough.
    if (kind === 'dirt') { paintSoilStrata(this.bc, 256); paintSoilStrata(this.scc, COLOR_RES); } else paintBacking(this.bc, 256, 'coffin', 0); // cache the strata stack for this grave
    this.backTex.needsUpdate = true;
    this.dc.fillStyle = '#000'; this.dc.fillRect(0, 0, DEPTH_RES, DEPTH_RES);
    this.depthTex.needsUpdate = true;
    if (kind === 'coffin') paintWood(this.cc, COLOR_RES);
    else if (kind === 'metal') paintMetal(this.cc, COLOR_RES);
    else this.cc.drawImage(this.strataCache, 0, 0, COLOR_RES, COLOR_RES); // the full stack of strata (setDug carves the tunnel up through them)
    this.colorTex.needsUpdate = true;
    if (snap && snap.d && (kind !== 'coffin' || restoredBarrier)) this.restore(snap);
    this.opening = this.barrier.evaluate();
    this.syncBarrierAlpha();
    this.updateOpeningGuides();
    configureBurialStack(grave, kind);
    fitBarrierSurfaceToViewport();
  }
  // dig the escape shaft UP through the whole stack of strata: frac (0..1) = progress through ALL the layers.
  setDug(frac) {
    frac = Math.max(0, Math.min(1, frac)); this.dug = frac; this.frac = frac;
    this.cc.drawImage(this.strataCache, 0, 0, COLOR_RES, COLOR_RES);
    if (frac > 0.002) { // a dark shaft eats up from the bottom through the layers you've cleared
      const dy = (1 - frac) * COLOR_RES;
      const g = this.cc.createLinearGradient(0, dy, 0, COLOR_RES);
      g.addColorStop(0, 'rgba(12,7,4,0.12)'); g.addColorStop(0.14, 'rgba(6,4,2,0.88)'); g.addColorStop(1, 'rgba(1,1,1,0.98)');
      this.cc.fillStyle = g; this.cc.fillRect(0, dy - 3, COLOR_RES, COLOR_RES - dy + 6);
      this.cc.fillStyle = 'rgba(255,222,165,0.14)'; this.cc.fillRect(0, Math.max(0, dy - 3), COLOR_RES, 5); // glowing dig face at the top of the tunnel
    }
    this.colorTex.needsUpdate = true;
    this.dc.fillStyle = '#000'; this.dc.fillRect(0, 0, DEPTH_RES, DEPTH_RES);
    if (frac > 0.002) { const dy = (1 - frac) * DEPTH_RES; this.dc.fillStyle = 'rgba(255,255,255,0.5)'; this.dc.fillRect(0, dy, DEPTH_RES, DEPTH_RES - dy); } // dug shaft recedes (never past the sky backing)
    this.depthTex.needsUpdate = true;
  }
  snapshot() {
    return {
      d: this.depthCanvas.toDataURL('image/png'),
      c: this.colorCanvas.toDataURL('image/png'),
      barrier: this.material === 'coffin' ? this.barrier.serialize() : null,
    };
  }
  restore(snap) {
    const di = new Image();
    di.onload = () => { this.dc.clearRect(0, 0, DEPTH_RES, DEPTH_RES); this.dc.drawImage(di, 0, 0, DEPTH_RES, DEPTH_RES); this.depthTex.needsUpdate = true; this.measure(); G.lastFrac = this.frac; if (G.mode === 'play') growLight(); };
    di.src = snap.d;
    if (snap.c) { const ci = new Image(); ci.onload = () => { this.cc.clearRect(0, 0, COLOR_RES, COLOR_RES); this.cc.drawImage(ci, 0, 0, COLOR_RES, COLOR_RES); this.colorTex.needsUpdate = true; }; ci.src = snap.c; }
  }
  syncBarrierAlpha() {
    // Kept as an empty compatibility texture for old snapshots. It is not
    // attached to the material and cannot form a circular opening.
    this.barrierAlphaContext.clearRect(0, 0, this.barrier.size, this.barrier.size);
    this.barrierAlphaTex.needsUpdate = true;
  }
  updateOpeningGuides() {
    // Coffin widening is no longer a gameplay step. Soil can still expose its
    // own real collision blockers later, but the lid never draws a red circle.
    this.cutGuideCells = 0;
    this.cutGuideContext.clearRect(0, 0, this.barrier.size, this.barrier.size);
    this.cutGuideHaloContext.clearRect(0, 0, this.barrier.size, this.barrier.size);
    this.cutGuideTex.needsUpdate = true;
    this.cutGuideHaloTex.needsUpdate = true;
    this.cutGuideGroup.visible = false;
    this.cutGuideMesh.visible = false;
    this.cutGuideHaloMesh.visible = false;
  }
  // pre-dig to a target fraction (restoring a persisted hole - the dug hole stays)
  preDig(target) {
    if (target <= 0) { this.measure(); return; }
    let guard = 0;
    while (this.measure() < target && guard++ < 500) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * DEPTH_RES * 0.34;
      this.stampDepth(DEPTH_RES / 2 + Math.cos(a) * r, DEPTH_RES / 2 + Math.sin(a) * r, 20 + Math.random() * 12, 0.85);
    }
    this.depthTex.needsUpdate = true;
  }
  stampDepth(px, py, rad, strength) {
    const g = this.dc.createRadialGradient(px, py, 0, px, py, rad);
    const a = Math.min(0.95, strength);
    g.addColorStop(0, `rgba(255,255,255,${a})`);
    g.addColorStop(0.6, `rgba(255,255,255,${a * 0.5})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    this.dc.globalCompositeOperation = 'lighter'; this.dc.fillStyle = g;
    this.dc.beginPath(); this.dc.arc(px, py, rad, 0, Math.PI * 2); this.dc.fill();
    this.dc.globalCompositeOperation = 'source-over';
  }
  stampColor(px, py, rad) {
    const sx = px / DEPTH_RES * COLOR_RES, sy = py / DEPTH_RES * COLOR_RES, sr = rad / DEPTH_RES * COLOR_RES;
    const g = this.cc.createRadialGradient(sx, sy, 0, sx, sy, sr);
    g.addColorStop(0, 'rgba(0,0,0,0.22)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    this.cc.fillStyle = g; this.cc.beginPath(); this.cc.arc(sx, sy, sr, 0, Math.PI * 2); this.cc.fill();
  }
  // one tap = one claw: several finger gouges raked across the spot
  carve(u, v, power, wood, style) {
    const px = u * DEPTH_RES, py = (1 - v) * DEPTH_RES;
    const soil = this.material === 'soil' && !wood;
    const rad = (wood ? 10 : soil ? 20 : 12) + power * (soil ? 2.25 : 1.3);
    const strength = ((wood ? 0.2 : soil ? 0.052 : 0.24) + power * (soil ? 0.018 : 0.06)) * (this.material === 'metal' ? 0.5 : 1); // steel resists
    const barrierStrength = this.material === 'coffin' ? strength * 1.65 * (12 / layerCost()) : 0;
    let changedCells = 0;
    let newlySevered = 0;
    const applyStamp = (x, y, radius, stampStrength) => {
      this.stampDepth(x, y, radius, stampStrength);
      if (!barrierStrength) return;
      const changed = this.barrier.stamp(x, y, radius, barrierStrength);
      changedCells += changed.changedCells;
      newlySevered += changed.newlySevered;
    };
    if (style === 'scratch') {
      // dragging a tool across wood/steel: 1-3 THIN parallel scratch grooves (rake/claw marks),
      // mostly along the tool's axis with a little wander - reads as scratches, not round digs
      const ang = -Math.PI / 2 + (Math.random() - 0.5) * 1.15;
      this.lastScratchAng = ang;
      const len = rad * (2.8 + Math.random() * 1.6), nr = rad * 0.4, steps = 7;
      const perp = ang + Math.PI / 2, lines = 1 + Math.floor(Math.random() * 3);
      for (let L = 0; L < lines; L++) {
        const off = (L - (lines - 1) / 2) * rad * 0.7, ox = Math.cos(perp) * off, oy = Math.sin(perp) * off;
        for (let i = 0; i < steps; i++) {
          const tt = i / (steps - 1) - 0.5;
          applyStamp(
            px + ox + Math.cos(ang) * tt * len,
            py + oy + Math.sin(ang) * tt * len,
            nr * (0.8 + Math.random() * 0.3),
            strength,
          );
        }
      }
      this.stampColor(px, py, len * 0.5);
    } else {
      const fingers = 4, spread = rad * 1.7;
      for (let f = 0; f < fingers; f++) {
          const off = (f - (fingers - 1) / 2) * (spread / fingers);
          for (let s = 0; s < 2; s++) { // each finger rakes a short gouge
            const jx = px + off + (Math.random() - 0.5) * rad * 0.4;
            const jy = py + (s - 0.5) * rad * 0.9 + (Math.random() - 0.5) * rad * 0.3;
            applyStamp(jx, jy, rad * (0.7 + Math.random() * 0.3), strength);
          }
      }
      this.stampColor(px, py, spread * 0.9);
    }
    this.depthTex.needsUpdate = true; this.colorTex.needsUpdate = true;
    if (this.material === 'coffin') {
      this.opening = this.barrier.evaluate();
      this.syncBarrierAlpha();
      this.updateOpeningGuides();
    }
    return { changedCells, newlySevered, opening: this.opening };
  }
  // dark jagged cracks spreading from the strike point; severity (0..1 = dig progress) grows them,
  // so the coffin lid visibly shatters up as you punch it instead of breaking with no warning.
  crack(u, v, severity) {
    const cc = this.cc, S = COLOR_RES, k = S / 512;
    const cx = u * S, cy = (1 - v) * S;
    cc.lineCap = 'round';
    const branches = 2 + Math.floor(severity * 5);
    for (let b = 0; b < branches; b++) {
      cc.strokeStyle = `rgba(8,5,3,${0.35 + severity * 0.5})`;
      cc.lineWidth = k * (1.4 + severity * 3 + Math.random() * 1.5);
      let x = cx, y = cy, ang = Math.random() * Math.PI * 2;
      const segs = 3 + Math.floor(Math.random() * 4), step = k * (10 + severity * 26);
      cc.beginPath(); cc.moveTo(x, y);
      for (let s = 0; s < segs; s++) { ang += (Math.random() - 0.5) * 1.1; x += Math.cos(ang) * step; y += Math.sin(ang) * step; cc.lineTo(x, y); }
      cc.stroke();
    }
    const g = cc.createRadialGradient(cx, cy, 0, cx, cy, k * 26); // dark impact bruise
    g.addColorStop(0, `rgba(6,4,2,${0.3 + severity * 0.3})`); g.addColorStop(1, 'rgba(6,4,2,0)');
    cc.fillStyle = g; cc.beginPath(); cc.arc(cx, cy, k * 26, 0, 6.2832); cc.fill();
    this.colorTex.needsUpdate = true;
  }
  measure() {
    this.sx.clearRect(0, 0, 40, 40);
    this.sx.drawImage(this.depthCanvas, 0, 0, 40, 40);
    const d = this.sx.getImageData(0, 0, 40, 40).data; let s = 0;
    for (let i = 0; i < d.length; i += 4) s += d[i];
    this.frac = s / (40 * 40 * 255);
    return this.frac;
  }
  tick() {
    if ((this._frameCount++ % 6) === 0) this.measure();
    if (this.cutGuideGroup.visible) {
      const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.008);
      this.cutGuideMaterial.opacity = 0.9 + pulse * 0.1;
      this.cutGuideHaloMaterial.opacity = 0.16 + pulse * 0.26;
    }
  }
  setVisible(v) {
    this.mesh.visible = v;
    this.backMesh.visible = v && this.material !== 'soil';
    this.updateOpeningGuides();
  }
}

function paintWood(x, R) {
  x.fillStyle = '#5e3a23'; x.fillRect(0, 0, R, R);
  const planks = 5, ph = R / planks;
  for (let p = 0; p < planks; p++) {
    const base = 88 + Math.random() * 26;
    const grd = x.createLinearGradient(0, p * ph, 0, (p + 1) * ph);
    grd.addColorStop(0, `rgb(${base - 26},${base - 48},${base - 64})`);
    grd.addColorStop(0.5, `rgb(${base},${base - 30},${base - 46})`);
    grd.addColorStop(1, `rgb(${base - 30},${base - 52},${base - 66})`);
    x.fillStyle = grd; x.fillRect(0, p * ph, R, ph);
    x.strokeStyle = 'rgba(30,16,8,0.35)'; x.lineWidth = 1;
    for (let i = 0; i < 26; i++) {
      x.beginPath(); const gy = p * ph + Math.random() * ph; x.moveTo(0, gy);
      for (let px = 0; px <= R; px += 24) x.lineTo(px, gy + Math.sin(px * 0.05 + p) * 3);
      x.stroke();
    }
    x.fillStyle = 'rgba(10,5,2,0.85)'; x.fillRect(0, p * ph - 2, R, 3); // plank seam
  }
  for (let i = 0; i < 6; i++) { // iron nails
    const nx = Math.random() * R, ny = Math.random() * R;
    x.fillStyle = '#2a2622'; x.beginPath(); x.arc(nx, ny, 4, 0, Math.PI * 2); x.fill();
    x.fillStyle = 'rgba(120,120,130,0.5)'; x.beginPath(); x.arc(nx - 1, ny - 1, 1.4, 0, Math.PI * 2); x.fill();
  }
}
// the soil face is 5 visible strata deep (surface-tone at top -> dark deep at bottom), one
// continuous dig - you carve through all of them at once, no level to clear before the next shows.
// the whole soil face as a THICK STACK of distinct strata (strataCount bands), all visible at once -
// you dig through the entire stack in one continuous dig.
function paintSoilStrata(x, R) {
  const bands = strataCount(), bh = R / bands;
  for (let bd = 0; bd < bands; bd++) {
    const depthT = 1 - bd / (bands - 1);         // bd 0 = top (shallow, light) -> bottom = deep (dark)
    const r = 30 + depthT * 74, g = 20 + depthT * 54, b = 13 + depthT * 32; // strong contrast so each layer reads distinctly
    const y0 = bd * bh;
    x.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`; x.fillRect(0, y0, R, bh + 1);
    const stamps = Math.max(120, Math.round(bh * 2.4));
    for (let i = 0; i < stamps; i++) { const v = (Math.random() - 0.5) * 34; x.fillStyle = `rgba(${(r + v) | 0},${(g + v * 0.8) | 0},${(b + v * 0.6) | 0},0.5)`; const s = 1 + Math.random() * 3; x.fillRect(Math.random() * R, y0 + Math.random() * bh, s, s); }
    if (bd <= Math.floor(bands * 0.25)) { // topsoil: roots
      x.strokeStyle = 'rgba(58,40,20,0.5)'; x.lineWidth = 2;
      for (let i = 0; i < 6; i++) { x.beginPath(); let rx = Math.random() * R, ry = y0 + Math.random() * bh; x.moveTo(rx, ry); for (let k = 0; k < 4; k++) { rx += (Math.random() - 0.5) * 36; ry += (Math.random() - 0.5) * 22; x.lineTo(rx, ry); } x.stroke(); }
    } else if (bd >= Math.floor(bands * 0.62)) { // deep: pebbles / rock
      for (let i = 0; i < 12; i++) { x.fillStyle = `rgba(${30 + Math.random() * 26 | 0},${28 + Math.random() * 22 | 0},${26 + Math.random() * 18 | 0},0.85)`; x.beginPath(); x.ellipse(Math.random() * R, y0 + Math.random() * bh, 3 + Math.random() * 8, 2 + Math.random() * 5, Math.random() * 3, 0, Math.PI * 2); x.fill(); }
    }
    if (bd > 0) { x.fillStyle = 'rgba(6,3,1,0.8)'; x.fillRect(0, y0 - 2, R, 5); } // BOLD seam between layers
  }
}
function paintSoil(x, R, layer, layers, variant) {
  const depthT = layers > 1 ? layer / (layers - 1) : 1; // 0 deep -> 1 near surface
  let r = 54 + depthT * 26, g = 36 + depthT * 22, b = 24 + depthT * 12;
  if (variant === 'clay') { r += 26; g += 6; b -= 4; }        // redder, warmer
  else if (variant === 'roots') { r -= 12; g -= 6; b -= 8; }  // darker earth
  x.fillStyle = `rgb(${r},${g},${b})`; x.fillRect(0, 0, R, R);
  for (let i = 0; i < 5200; i++) {
    const v = (Math.random() - 0.5) * 46;
    x.fillStyle = `rgba(${r + v},${g + v * 0.8},${b + v * 0.6},0.55)`;
    const s = 1 + Math.random() * 3; x.fillRect(Math.random() * R, Math.random() * R, s, s);
  }
  for (let i = 0; i < 26; i++) { // pebbles
    x.fillStyle = `rgba(${30 + Math.random() * 40},${28 + Math.random() * 30},${26 + Math.random() * 24},0.8)`;
    x.beginPath(); x.ellipse(Math.random() * R, Math.random() * R, 3 + Math.random() * 7, 2 + Math.random() * 5, Math.random() * 3, 0, Math.PI * 2); x.fill();
  }
  const rootCount = variant === 'roots' ? 16 : (depthT > 0.5 ? 6 * depthT : 0);
  if (rootCount > 0) { // roots threading through the earth
    x.strokeStyle = 'rgba(60,42,22,0.55)'; x.lineWidth = 2;
    for (let i = 0; i < rootCount; i++) { x.beginPath(); let rx = Math.random() * R, ry = Math.random() * R; x.moveTo(rx, ry); for (let k = 0; k < 6; k++) { rx += (Math.random() - 0.5) * 40; ry += (Math.random() - 0.5) * 40; x.lineTo(rx, ry); } x.stroke(); }
  }
}
// soil with buried wooden boards + holes (the two layers before the surface)
function paintSoilWood(x, R, layer, layers) {
  paintSoil(x, R, layer, layers);
  const boards = 3 + Math.floor(Math.random() * 3);
  for (let i = 0; i < boards; i++) {
    x.save();
    const bw = R * (0.28 + Math.random() * 0.3), bh = R * (0.09 + Math.random() * 0.07);
    x.translate(Math.random() * R, Math.random() * R); x.rotate((Math.random() - 0.5) * 1.3);
    const g = x.createLinearGradient(-bw / 2, 0, bw / 2, 0);
    g.addColorStop(0, '#3a2414'); g.addColorStop(0.5, '#5a3a22'); g.addColorStop(1, '#33200f');
    x.fillStyle = g; x.fillRect(-bw / 2, -bh / 2, bw, bh);
    x.strokeStyle = 'rgba(18,9,3,0.5)'; x.lineWidth = 1;
    for (let k = 1; k < 6; k++) { x.beginPath(); x.moveTo(-bw / 2, -bh / 2 + k * bh / 6); x.lineTo(bw / 2, -bh / 2 + k * bh / 6 + (Math.random() - 0.5) * 4); x.stroke(); }
    for (let h = 0; h < 2; h++) { x.fillStyle = 'rgba(0,0,0,0.72)'; x.beginPath(); x.ellipse((Math.random() - 0.5) * bw * 0.7, (Math.random() - 0.5) * bh * 0.4, 3 + Math.random() * 6, 2 + Math.random() * 4, 0, 0, Math.PI * 2); x.fill(); }
    x.restore();
  }
}
// old boards with daylight streaming through the seams (the final barrier)
function paintWoodLight(x, R) {
  x.fillStyle = '#2c1c0f'; x.fillRect(0, 0, R, R);
  const planks = 5, pw = R / planks;
  for (let p = 0; p < planks; p++) {
    const base = 52 + Math.random() * 20;
    const g = x.createLinearGradient(p * pw, 0, (p + 1) * pw, 0);
    g.addColorStop(0, `rgb(${base - 18},${base - 30},${base - 40})`);
    g.addColorStop(0.5, `rgb(${base},${base - 22},${base - 32})`);
    g.addColorStop(1, `rgb(${base - 20},${base - 32},${base - 42})`);
    x.fillStyle = g; x.fillRect(p * pw, 0, pw, R);
    x.strokeStyle = 'rgba(12,6,2,0.5)'; x.lineWidth = 1;
    for (let i = 0; i < 18; i++) { x.beginPath(); const gx = p * pw + Math.random() * pw; x.moveTo(gx, 0); for (let y = 0; y <= R; y += 26) x.lineTo(gx + Math.sin(y * 0.05 + p) * 2, y); x.stroke(); }
    const grd = x.createLinearGradient(p * pw - 5, 0, p * pw + 5, 0); // light in the seam
    grd.addColorStop(0, 'rgba(255,246,214,0)'); grd.addColorStop(0.5, 'rgba(255,250,228,0.95)'); grd.addColorStop(1, 'rgba(255,246,214,0)');
    x.fillStyle = grd; x.fillRect(p * pw - 5, 0, 10, R);
  }
  for (let i = 0; i < 4; i++) { // glowing knot-holes / cracks
    const cx = Math.random() * R, cy = Math.random() * R, rg = x.createRadialGradient(cx, cy, 0, cx, cy, 12 + Math.random() * 14);
    rg.addColorStop(0, 'rgba(255,251,232,0.95)'); rg.addColorStop(1, 'rgba(255,251,232,0)');
    x.fillStyle = rg; x.beginPath(); x.arc(cx, cy, 24, 0, Math.PI * 2); x.fill();
  }
}
// a riveted STEEL PLATE reinforcing the coffin in deeper graves - the new obstacle after wood
function paintMetal(x, R) {
  const g = x.createLinearGradient(0, 0, R, R);
  g.addColorStop(0, '#3a3f47'); g.addColorStop(0.5, '#565c66'); g.addColorStop(1, '#31363d');
  x.fillStyle = g; x.fillRect(0, 0, R, R);
  x.strokeStyle = 'rgba(120,128,140,0.22)'; x.lineWidth = 1;
  for (let i = 0; i < 130; i++) { const y = Math.random() * R; x.beginPath(); x.moveTo(0, y); x.lineTo(R, y + (Math.random() - 0.5) * 22); x.stroke(); } // brushed grain
  for (let i = 0; i < 22; i++) { x.fillStyle = `rgba(${95 + Math.random() * 45},${52 + Math.random() * 22},${26 + Math.random() * 16},0.14)`; x.fillRect(Math.random() * R, Math.random() * R, 2 + Math.random() * 6, 12 + Math.random() * 46); } // rust streaks
  const n = 6; // rivets around the border
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    if (i > 0 && i < n - 1 && j > 0 && j < n - 1) continue;
    const rx = (i / (n - 1)) * (R - 20) + 10, ry = (j / (n - 1)) * (R - 20) + 10;
    x.fillStyle = '#21252b'; x.beginPath(); x.arc(rx, ry, R * 0.022, 0, 6.2832); x.fill();
    x.fillStyle = 'rgba(190,198,210,0.5)'; x.beginPath(); x.arc(rx - R * 0.006, ry - R * 0.006, R * 0.009, 0, 6.2832); x.fill();
  }
}
// the light at the end of the tunnel is the daytime SKY you're digging up toward: blue + sun + clouds
function paintSky(x, R) {
  const g = x.createLinearGradient(0, 0, 0, R);
  g.addColorStop(0.0, '#1f6fad');
  g.addColorStop(0.58, '#5ba9da');
  g.addColorStop(1.0, '#9bd1ee');
  x.fillStyle = g; x.fillRect(0, 0, R, R);
  // A small off-axis sun reads as sky without turning the breach into white fog.
  const sx = R * 0.53, sy = R * 0.49, sr = R * 0.036;
  const halo = x.createRadialGradient(sx, sy, 0, sx, sy, sr * 5.5);
  halo.addColorStop(0, 'rgba(255,249,220,0.8)');
  halo.addColorStop(0.35, 'rgba(255,238,185,0.28)');
  halo.addColorStop(1, 'rgba(255,247,214,0)');
  x.fillStyle = halo; x.beginPath(); x.arc(sx, sy, sr * 5.5, 0, 6.2832); x.fill();
  x.fillStyle = '#fff4ca'; x.beginPath(); x.arc(sx, sy, sr, 0, 6.2832); x.fill();
  x.fillStyle = 'rgba(238,248,255,0.32)';
  for (const [cx, cy, cw, ch] of [[0.18, 0.28, 0.22, 0.045], [0.46, 0.58, 0.17, 0.035], [0.74, 0.68, 0.24, 0.05]]) {
    for (let i = 0; i < 4; i++) {
      x.beginPath();
      x.ellipse(R * cx + (Math.random() - 0.5) * R * cw, R * cy + (Math.random() - 0.5) * R * ch * 0.5, R * cw * 0.3 * (0.6 + Math.random() * 0.6), R * ch * (0.7 + Math.random() * 0.5), 0, 0, 6.2832);
      x.fill();
    }
  }
}
function paintBacking(x, R, mat, tNear) {
  let r, g, b;
  if (mat === 'coffin') { r = 30; g = 20; b = 13; }          // dark soil behind the lid
  else if (mat === 'woodlight') { r = 208; g = 224; b = 246; } // bright daylight behind the boards
  else { r = 30 + tNear * 16; g = 21 + tNear * 13; b = 14 + tNear * 9; } // soil / soilwood
  x.fillStyle = `rgb(${r},${g},${b})`; x.fillRect(0, 0, R, R);
  for (let i = 0; i < 1600; i++) { const v = (Math.random() - 0.5) * 18; x.fillStyle = `rgba(${r + v},${g + v},${b + v},0.5)`; x.fillRect(Math.random() * R, Math.random() * R, 2, 2); }
}
const surface = new Surface();

function fitBarrierSurfaceToViewport() {
  // Match the active plane to the gameplay frustum instead of showing the
  // outside silhouette. A small overdraw margin absorbs shake at every aspect.
  const aspect = Math.max(0.2, window.innerWidth / Math.max(1, window.innerHeight));
  const distance = Math.max(0.1, CAM_Z - surface.mesh.position.z);
  const verticalFov = THREE.MathUtils.degToRad(gameplayCameraFov(false));
  const viewHeight = 2 * distance * Math.tan(verticalFov / 2);
  const viewWidth = viewHeight * aspect;
  const overdraw = 1.06;
  const scaleX = viewWidth / SURF_W * overdraw;
  const scaleY = viewHeight / SURF_W * overdraw;
  surface.mesh.scale.set(scaleX, scaleY, 1);
  surface.cutGuideGroup.scale.set(scaleX, scaleY, 1);
  surface.viewportCoverage = { x: overdraw, y: overdraw };
}

const coffinReturnCanvas = mkCanvas(512);
paintWood(coffinReturnCanvas.getContext('2d'), 512);
const coffinReturnTexture = new THREE.CanvasTexture(coffinReturnCanvas);
coffinReturnTexture.colorSpace = THREE.SRGBColorSpace;
const coffinReturn = new THREE.Group();
coffinReturn.name = 'continuous-coffin-to-soil-connection';
const coffinReturnMaterial = new THREE.MeshBasicMaterial({
  map: coffinReturnTexture,
  side: THREE.DoubleSide,
  toneMapped: true,
});
const coffinBack = new THREE.Mesh(new THREE.ShapeGeometry(shapeFromPoints(coffinOuterPlan)), coffinReturnMaterial);
coffinBack.position.z = 1.25;
coffinBack.rotation.y = Math.PI;
coffinBack.name = 'long-coffin-back-panel';
coffinReturn.add(coffinBack);

// Tapered side/end walls follow the six-sided plan. They remain continuous
// from the lid at world z=0 to the rear panel, preserving the no-gap invariant.
const coffinWallDepth = 0.82;
for (let i = 0; i < coffinOuterPlan.length; i++) {
  const a = coffinOuterPlan[i];
  const b = coffinOuterPlan[(i + 1) % coffinOuterPlan.length];
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const length = Math.hypot(dx, dy);
  const wall = new THREE.Mesh(
    new THREE.BoxGeometry(length, COFFIN_WALL_THICKNESS, coffinWallDepth),
    coffinReturnMaterial,
  );
  wall.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 0.84);
  wall.rotation.z = Math.atan2(dy, dx);
  // Keep the full shell after the lid breaks. The unlit wood gives side-look
  // rays a readable coffin wall instead of letting them escape into black.
  wall.visible = true;
  coffinReturn.add(wall);
}
coffinReturn.position.z = -0.43;
coffinReturn.rotation.z = Math.PI / 2;
coffinReturn.visible = false;
scene.add(coffinReturn);

// The reinforcing steel is its own physical sheet, not a repaint of the wood.
// From the player toward the exit the contiguous stack is:
// coffin wood -> metal (when present) -> soil at z=0.
const metalLayerCanvas = mkCanvas(512);
paintMetal(metalLayerCanvas.getContext('2d'), 512);
const metalLayerTexture = new THREE.CanvasTexture(metalLayerCanvas);
metalLayerTexture.colorSpace = THREE.SRGBColorSpace;
const metalLayerMaterial = new THREE.MeshStandardMaterial({
  map: metalLayerTexture,
  emissiveMap: metalLayerTexture,
  emissive: 0x242a33,
  emissiveIntensity: 0.48,
  roughness: 0.52,
  metalness: 0.68,
  side: THREE.DoubleSide,
});
// A few centimetres of steel remain a separate physical layer behind the wood.
const metalOuterPlan = coffinHorizontalPlan.map(([x, y]) => [x * 1.04, y * 1.04]);
const metalPlateShape = shapeFromPoints(metalOuterPlan);
const metalLayerPlate = new THREE.Mesh(new THREE.ExtrudeGeometry(metalPlateShape, {
  depth: 1,
  bevelEnabled: false,
  curveSegments: 1,
}), metalLayerMaterial);
metalLayerPlate.name = 'separate-level-scaled-metal-plate';
metalLayerPlate.visible = false;
scene.add(metalLayerPlate);

let currentMetalThickness = 0;
function configureBurialStack(grave, phase = 'coffin') {
  currentMetalThickness = metalThicknessFor(grave);
  coffinReturn.position.z = -0.43 + currentMetalThickness;
  const visibleScale = Math.max(0.001, currentMetalThickness);
  metalLayerPlate.scale.z = visibleScale;
  metalLayerPlate.visible = hasMetal(grave) && (phase === 'coffin' || phase === 'metal');
}
const soilSkyCanvas = mkCanvas(512);
paintSky(soilSkyCanvas.getContext('2d'), 512);
const soilSkyTexture = new THREE.CanvasTexture(soilSkyCanvas);
soilSkyTexture.colorSpace = THREE.SRGBColorSpace;
const soilWorld = new SoilWorld({ THREE, scene, skyTexture: soilSkyTexture });

/* ============================================================================
   PARTICLES  -  splinters/clods toward the camera + drifting dust motes.
   ========================================================================== */
const debris = [];
const DEBRIS_MAX = 140;
const debrisGeo = new THREE.TetrahedronGeometry(0.05);
const splinterGeo = new THREE.BoxGeometry(0.018, 0.018, 0.14); // (legacy) long thin shard
// real splintered-wood fragments (generated, cut out) used as tumbling debris billboards
const woodLoader = new THREE.TextureLoader();
const woodTex = ['w1', 'w2', 'w3', 'w4'].map((n) => { const t = woodLoader.load(`assets/wood/${n}.png`); t.colorSpace = THREE.SRGBColorSpace; return t; });
const woodChipGeo = new THREE.PlaneGeometry(1, 1);
function woodChipMesh(size) {
  const tex = woodTex[Math.floor(Math.random() * woodTex.length)];
  const m = new THREE.Mesh(woodChipGeo, new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.85 }));
  m.scale.setScalar(size); m.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
  return m;
}
function spawnDebris(localX, localY, kind, n, localZ = 0.05) {
  const metal = kind === 'metal', wood = !!kind && !metal;
  for (let i = 0; i < n && debris.length < DEBRIS_MAX; i++) {
    let m, base;
    if (metal) { // bright sparks fly off the steel
      m = new THREE.Mesh(debrisGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color().setHSL(0.11, 1, 0.72 + Math.random() * 0.28) }));
    } else if (wood) { // WOOD: tiny splinters (shchepki) flick off the coffin
      base = 0.05 + Math.random() * 0.055; m = woodChipMesh(base); // base = real world size (updateDebris scales by it)
    } else { // SOIL: crumbly chunks (the dig look Tim likes)
      base = 0.19 + Math.random() * 0.12;
      const soilColor = new THREE.Color().setHSL(0.07, 0.45, 0.12 + Math.random() * 0.1);
      m = new THREE.Mesh(debrisGeo, new THREE.MeshStandardMaterial({
        color: soilColor,
        emissive: soilColor,
        emissiveIntensity: 0.24,
        roughness: 1,
      }));
    }
    m.position.set(localX, localY, localZ);
    // wood splinters flick out + fall with only a gentle push toward camera (no perspective balloon)
    const v = wood
      ? new THREE.Vector3((Math.random() - 0.5) * 1.7, (Math.random() - 0.5) * 1.1 + 0.5, 0.15 + Math.random() * 0.6)
      : metal
        ? new THREE.Vector3((Math.random() - 0.5) * 3.4, (Math.random() - 0.5) * 3.4 + 0.4, 3.2 + Math.random() * 2.4)
        : new THREE.Vector3((Math.random() - 0.5) * 0.42, (Math.random() - 0.5) * 0.42 + 0.16, 0.2 + Math.random() * 0.46);
    m.userData = {
      v, rot: new THREE.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8), life: 0,
      max: metal ? 0.28 + Math.random() * 0.22 : (wood ? 0.55 + Math.random() * 0.5 : 0.38 + Math.random() * 0.28),
      base,
      kind: metal ? 'metal' : (wood ? 'wood' : 'soil'),
    };
    scene.add(m); debris.push(m);
  }
}
function clearDebris() {
  for (let i = debris.length - 1; i >= 0; i--) {
    const m = debris[i];
    scene.remove(m);
    m.material.dispose();
    debris.splice(i, 1);
  }
}
// the final barrier: big wooden boards punched loose, tumbling toward + past the camera
const plankGeo = new THREE.BoxGeometry(0.62, 0.16, 0.06);
function spawnPlanks() {
  for (let i = 0; i < 22 && debris.length < DEBRIS_MAX; i++) {
    const sz = 0.06 + Math.random() * 0.08; // a burst of small splinters, not giant boards
    const m = woodChipMesh(sz);
    m.position.set((Math.random() - 0.5) * 2.0, (Math.random() - 0.5) * 1.4 + 0.2, 0.1);
    m.userData = { v: new THREE.Vector3((Math.random() - 0.5) * 2.2, (Math.random() - 0.5) * 1.6 + 0.9, 0.3 + Math.random() * 1.2), rot: new THREE.Vector3(Math.random() * 9, Math.random() * 9, Math.random() * 9), life: 0, max: 0.9 + Math.random() * 0.5, base: sz };
    scene.add(m); debris.push(m);
  }
}
function updateDebris(dt) {
  for (let i = debris.length - 1; i >= 0; i--) {
    const m = debris[i], u = m.userData; u.life += dt;
    // Up through the grave is -Z, so loose material falls back toward the
    // coffin on +Z rather than sliding down the screen as if the wall were flat.
    u.v.z += (u.kind === 'soil' ? 3.2 : 4.6) * dt;
    m.position.addScaledVector(u.v, dt);
    m.rotation.x += u.rot.x * dt; m.rotation.y += u.rot.y * dt;
    const k = 1 - u.life / u.max; m.scale.setScalar(Math.max(0.001, (u.base || 1.1) * k));
    const crossedDirtCamera = G.phase === 'dirt' && m.position.z > camera.position.z - 0.06;
    if (u.life >= u.max || crossedDirtCamera || m.position.z > CAM_Z + 1) { scene.remove(m); m.material.dispose(); debris.splice(i, 1); }
  }
}
// dust motes drifting in the lamp beam
const DUST_N = 260;
const dustGeo = new THREE.BufferGeometry();
{
  const pos = new Float32Array(DUST_N * 3);
  for (let i = 0; i < DUST_N; i++) { pos[i * 3] = (Math.random() - 0.5) * 3.2; pos[i * 3 + 1] = (Math.random() - 0.5) * 3.2; pos[i * 3 + 2] = Math.random() * CAM_Z; }
  dustGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
}
const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: 0xffe6bf, size: 0.018, transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending }));
scene.add(dust);

/* ============================================================================
   TOOL MESH  -  distinct foreground geometry per tool. Stabs on input.
   ========================================================================== */
let toolGroup = null;
const metalMat = (c = 0x9aa3ad, r = 0.4, m = 0.85) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
const rustMat = () => new THREE.MeshStandardMaterial({ color: 0x7a5236, roughness: 0.85, metalness: 0.5 });
const woodHandle = () => new THREE.MeshStandardMaterial({ color: 0x5b3a22, roughness: 0.9, metalness: 0 });
const fleshMat = () => new THREE.MeshStandardMaterial({ color: 0xd9a07a, roughness: 0.8, metalness: 0 });
function makeToolForeground(group) {
  group.traverse((o) => {
    if (!o.isMesh) return;
    o.renderOrder = 100;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const mat of mats) {
      if (!mat) continue;
      mat.depthTest = false;
      mat.depthWrite = false;
      mat.fog = false;
      mat.needsUpdate = true;
    }
  });
}

/* bare-tool sprites (locally generated art): a single finger for the coffin, a hand for the
   ground. They go clean -> scraped as you claw, and heal when you wake up again. */
const BARE_SPRITES = ['clean', 'scraped'];
const FLESH_SPRITES = ['finger', 'hand'];   // these wear + bleed; other sprites are static (metal)
// every tool is a generated sprite (assets/<key>.png), flesh ones use 3 wear states
const SPRITE_TOOLS = ['finger', 'hand', 'spoon', 'fork', 'chisel', 'prybar', 'knife', 'saw', 'auger', 'cup', 'shovel', 'trowel', 'spade', 'drill', 'claw']; // nail is a real 3D model, not a sprite
const spriteTex = {}; SPRITE_TOOLS.forEach((k) => { spriteTex[k] = {}; });
function smooth(a, b, x) { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
function processToolImage(img) {
  // pre-cut (birefnet) alpha, finger already points up (nail at top) - just draw it
  const S = 256, c = mkCanvas(S), x = c.getContext('2d');
  x.clearRect(0, 0, S, S);
  x.drawImage(img, 0, 0, S, S);
  return c;
}
function loadOneSprite(kind, key, url) {
  // placeholder must match the final image size (256): if the tool is built before the art loads
  // (straight-to-play boot), a texture whose dimensions later CHANGE won't re-upload to the GPU.
  const tex = new THREE.CanvasTexture(mkCanvas(256)); tex.colorSpace = THREE.SRGBColorSpace; spriteTex[kind][key] = tex;
  const img = new Image();
  img.onload = () => { tex.image = processToolImage(img); tex.needsUpdate = true; if (toolGroup && toolGroup.userData.isSprite) refreshToolSprite(); };
  img.src = url;
}
function loadSpriteSet(kind) {
  if (FLESH_SPRITES.includes(kind)) BARE_SPRITES.forEach((st) => loadOneSprite(kind, st, `./assets/${kind}_${st}.png`));
  else loadOneSprite(kind, 'tex', `./assets/${kind}.png`);   // static metal sprite
}
function loadBareSprites() { SPRITE_TOOLS.forEach((k) => loadSpriteSet(k)); }
function wearState() { return G.toolWear >= 0.3 ? 'scraped' : 'clean'; }
function spriteTexFor(kind) {
  const set = spriteTex[kind]; if (!set) return null;
  return FLESH_SPRITES.includes(kind) ? set[wearState()] : set.tex;
}
function refreshToolSprite() {
  if (!toolGroup || !toolGroup.userData.isSprite) return;
  const tex = spriteTexFor(toolGroup.userData.spriteKind);
  if (tex) { toolGroup.userData.quad.material.map = tex; toolGroup.userData.quad.material.needsUpdate = true; }
}

function buildTool(mesh) {
  const g = new THREE.Group();
  g.userData.meshKey = mesh;
  // bare hand / fingernail = a camera-facing sprite from local-model art (with damage states)
  if (SPRITE_TOOLS.includes(mesh)) {
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: spriteTexFor(mesh) || null, transparent: true, depthWrite: false, depthTest: false, fog: false, color: 0xcfcfcf }));
    g.add(quad); g.userData.isSprite = true; g.userData.quad = quad; g.userData.spriteKind = mesh;
    g.userData.isFlesh = FLESH_SPRITES.includes(mesh);
    return g;
  }
  const add = (geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); g.add(o); return o; };
  switch (mesh) {
    case 'finger': {
      const flesh = fleshMat();
      // a real fingertip: tip points +y (the contact end), knuckle trails -y toward the hand
      add(new THREE.CapsuleGeometry(0.12, 0.34, 8, 14), flesh, 0, -0.04, 0);   // finger, long axis +y
      add(new THREE.SphereGeometry(0.125, 16, 12), flesh, 0, 0.22, 0);          // rounded pad
      add(new THREE.TorusGeometry(0.12, 0.018, 8, 16), flesh, 0, -0.02, 0, Math.PI / 2); // knuckle crease
      const nail = add(new THREE.SphereGeometry(0.09, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: 0xf1e6d2, roughness: 0.35 }), 0, 0.235, 0.05);
      nail.scale.set(1, 0.45, 1.25); nail.rotation.x = -0.45;                   // nail plate hugging the tip
      break; }
    case 'hand': {
      const flesh = fleshMat();
      const palm = add(new THREE.SphereGeometry(0.2, 16, 12), flesh, 0, -0.06, 0); palm.scale.set(1.15, 0.5, 1);
      for (let i = 0; i < 4; i++) { // four fingers clawing forward (+y)
        const fx = -0.13 + i * 0.087;
        add(new THREE.CapsuleGeometry(0.04, 0.16, 4, 8), flesh, fx, 0.12, 0.02);
        add(new THREE.SphereGeometry(0.045, 10, 8), flesh, fx, 0.21, 0.03);
      }
      add(new THREE.CapsuleGeometry(0.045, 0.12, 4, 8), flesh, 0.18, -0.02, 0.02, 0, 0, -0.7); // thumb
      break; }
    case 'nail': { // a real 3D forged iron spike, point at +y (the scratching end)
      const iron = new THREE.MeshStandardMaterial({ color: 0x4b453e, roughness: 0.55, metalness: 0.75 }); // dark forged iron
      add(new THREE.CylinderGeometry(0.038, 0.08, 0.6, 6), iron, 0, -0.06, 0);   // tapered hex shaft, wide at the base
      add(new THREE.ConeGeometry(0.042, 0.36, 6), iron, 0, 0.42, 0);             // sharp faceted point
      add(new THREE.CylinderGeometry(0.1, 0.075, 0.06, 6), iron, 0, -0.39, 0);   // forged head/burr at the base
      break; }
    case 'spoon': {
      add(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 8), metalMat(), -0.15, -0.18, 0, Math.PI / 2.4);
      const bowl = add(new THREE.SphereGeometry(0.17, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), metalMat(0xb7bfc8), 0.12, 0.08, 0.06, Math.PI);
      bowl.scale.set(1, 0.5, 1.3); break; }
    case 'cup': {
      add(new THREE.CylinderGeometry(0.18, 0.13, 0.26, 14, 1, true), metalMat(0x9fa6ad, 0.5, 0.7), 0.08, 0.05, 0.05, Math.PI / 2.6);
      add(new THREE.TorusGeometry(0.08, 0.02, 6, 10), metalMat(), -0.16, -0.02, 0, 0, Math.PI / 2); break; }
    case 'fork': {
      add(new THREE.CylinderGeometry(0.03, 0.03, 0.46, 8), rustMat(), -0.14, -0.16, 0, Math.PI / 2.4);
      for (let i = 0; i < 3; i++) add(new THREE.BoxGeometry(0.025, 0.28, 0.025), rustMat(), 0.06 + i * 0.06, 0.12, 0, 0.5); break; }
    case 'chisel': {
      add(new THREE.BoxGeometry(0.07, 0.4, 0.07), woodHandle(), -0.12, -0.14, 0, 0, 0, 0.5);
      add(new THREE.BoxGeometry(0.18, 0.3, 0.03), metalMat(0xc2c9d0), 0.1, 0.12, 0, 0, 0, 0.5); break; }
    case 'knife': {
      add(new THREE.BoxGeometry(0.06, 0.26, 0.06), woodHandle(), -0.14, -0.14, 0, 0, 0, 0.5);
      const bl = add(new THREE.BoxGeometry(0.1, 0.42, 0.012), metalMat(0xd2d8de, 0.25), 0.12, 0.14, 0, 0, 0, 0.5); bl.geometry.translate(0, 0.05, 0); break; }
    case 'saw': {
      add(new THREE.BoxGeometry(0.07, 0.3, 0.05), woodHandle(), -0.16, -0.12, 0, 0, 0, 0.4);
      add(new THREE.BoxGeometry(0.5, 0.12, 0.01), metalMat(0xcfd5db, 0.3), 0.12, 0.1, 0, 0, 0, 0.4);
      for (let i = 0; i < 9; i++) add(new THREE.ConeGeometry(0.018, 0.05, 4), metalMat(0xcfd5db), -0.08 + i * 0.05, 0.0, 0, Math.PI); break; }
    case 'auger': case 'drill': {
      add(new THREE.CylinderGeometry(0.05, 0.05, 0.3, 10), metalMat(0x3a3f45, 0.6, 0.8), -0.16, -0.14, 0, Math.PI / 2.4);
      add(new THREE.ConeGeometry(0.1, 0.5, 12), metalMat(0xb9c0c8, 0.35), 0.12, 0.06, 0.05, -Math.PI / 2.4);
      for (let i = 0; i < 5; i++) add(new THREE.TorusGeometry(0.08 - i * 0.012, 0.012, 4, 8), metalMat(0x8a929b), 0.04 + i * 0.05, 0.06, 0.05, Math.PI / 2.4);
      break; }
    case 'shovel': case 'spade': case 'trowel': {
      const big = mesh === 'spade' ? 1.25 : mesh === 'trowel' ? 0.8 : 1;
      add(new THREE.CylinderGeometry(0.035, 0.035, 0.5, 8), woodHandle(), -0.14, -0.18, 0, Math.PI / 2.5);
      const blade = add(new THREE.BoxGeometry(0.3 * big, 0.34 * big, 0.02), metalMat(0x8b939b, 0.5, 0.7), 0.16, 0.12, 0, 0, 0, 0.2);
      blade.geometry.translate(0, -0.05, 0); break; }
    case 'claw': {
      add(new THREE.BoxGeometry(0.16, 0.12, 0.3), metalMat(0x2f343a, 0.6, 0.85), -0.06, -0.1, 0);
      for (let i = 0; i < 4; i++) { const c = add(new THREE.ConeGeometry(0.03, 0.34, 6), metalMat(0xc7ced5, 0.3), -0.12 + i * 0.08, 0.16, 0.06, Math.PI); c.rotation.z = (i - 1.5) * 0.18; } break; }
    default: add(new THREE.BoxGeometry(0.2, 0.2, 0.2), metalMat());
  }
  g.scale.setScalar(0.95);
  return g;
}
function equipToolMesh() {
  if (toolGroup) { if (toolGroup.parent) toolGroup.parent.remove(toolGroup); toolGroup.traverse(o => { if (o.geometry && o.geometry !== debrisGeo) o.geometry.dispose && o.geometry.dispose(); if (o.material && o.material.dispose) o.material.dispose(); }); }
  const meshKey = G.phase === 'dirt' ? DIG_TOOLS[M.digTool].mesh : COFFIN_TOOLS[M.coffinTool].mesh;
  const startY = G.phase === 'dirt' ? -0.72 : -0.42;
  toolGroup = buildTool(meshKey);
  makeToolForeground(toolGroup);
  if (toolGroup.userData.isSprite) {
    // The first coffin tool is a full hand entering naturally from below. It
    // preserves first-person context without putting a detached body in view.
    toolGroup.userData.baseScale = G.phase !== 'dirt' && meshKey === 'hand' ? 0.9 : 0.44;
    toolGroup.scale.setScalar(toolGroup.userData.baseScale);
    toolGroup.rotation.set(0, 0, 0);
    toolGroup.position.set(0, startY, -1.18);
    refreshToolSprite();
  } else if (meshKey === 'nail') {
    toolGroup.userData.baseScale = 0.48;
    toolGroup.scale.setScalar(toolGroup.userData.baseScale);
    toolGroup.rotation.set(-1.45, 0.08, 0);    // point tilted into the lid along the escape axis
    toolGroup.position.set(0, startY, -1.15);
  } else {
    toolGroup.userData.baseScale = 0.5;
    toolGroup.scale.setScalar(toolGroup.userData.baseScale);
    toolGroup.rotation.set(-0.8, -0.15, -0.5); // working end angled down into the surface
    toolGroup.position.set(0, startY, -1.12);
  }
  camera.add(toolGroup);
}
let toolStab = 0;

/* ============================================================================
   GAME STATE + FLOW
   ========================================================================== */
const G = {
  mode: 'menu', phase: 'coffin', tut: 0,
  layer: 0, layers: 0, prog: 0,
  air: 0, maxA: 0, runSouls: 0,
  shake: 0, shakeT: 0, transition: 0, lastFrac: 0,
  totalPlay: 0, lastBreathAt: 0,
  pointerDown: false, lastUV: null,
  escapeAnim: undefined, emerging: false, emergeT: 0, escapeStartCameraZ: null,
  escapeFinalized: false, lastEscaped: false,
  _shopFromMenu: false,
  carveWX: 0, carveWY: 0, toolTX: 0, toolTY: -0.42, toolWear: 0, camDip: 0,
  soilDigSpots: [], soilDeepestStep: 0, soilDepthRecords: 0, lastDepthRecord: null,
  depthLurch: 0, soilTravel: 0, soilTravelTarget: 0, soilTravelVel: 0,
  soilViewX: 0, soilViewY: 0, soilViewTargetX: 0, soilViewTargetY: 0, activeSoilSpot: null,
  soilViewDepth: 0, soilViewDepthTarget: 0, soilViewDepthManual: false,
  soilCameraZ: SOIL_START_Z, soilBlockedNotified: false, coffinExited: false,
  obsYaw: 0.6, obsPitch: 0.42, obsDist: 4.6, obsAuto: true, prevMode: 'menu',
  lastAction: { type: 'boot', status: 'ready', graveId: M.activeGraveId },
  lastBarrierTransition: null,
  collectionFocusId: null,
};

const dom = {};
['hud', 'menu', 'collection', 'shop', 'tutorial', 'reset-confirm', 'builder', 'grave-label', 'souls-label', 'air-fill', 'air-label',
 'work-fill', 'work-label', 'callout', 'tool-label', 'depth-label', 'shop-rows', 'shop-title', 'shop-copy',
 'menu-title', 'menu-copy', 'tut-list', 'flash', 'vignette', 'panic', 'observe', 'dm-fill', 'crawl-controls',
 'menu-avatar', 'menu-humanity', 'shop-avatar', 'shop-humanity', 'cemetery-copy', 'grave-list',
 'collection-title', 'town-story', 'zombie-roster', 'clue-log']
  .forEach(id => dom[id] = document.getElementById(id));

const townWorld = createTownWorld({
  THREE,
  canvas,
  graves: GRAVE_CATALOG,
});

function syncTownWorld(view = G.mode === 'collection' ? 'collection' : 'cemetery') {
  townWorld.sync({
    activeId: M.activeGraveId,
    statuses: Object.fromEntries(GRAVE_CATALOG.map((grave) => [grave.id, graveStatus(grave)])),
  });
  townWorld.setVisible(view === 'cemetery' || view === 'collection', view);
}

function show(el, on) { el.hidden = !on; }
function setMode(mode) {
  G.mode = mode;
  canvas.setAttribute(
    'aria-label',
    mode === 'menu'
      ? 'Ravenshollow cemetery. Choose a grave or drag to look around.'
      : mode === 'collection'
        ? 'Ravenshollow town. The rescued residents are standing together.'
        : 'Buried Again digging scene',
  );
  Sound.setSceneActive(mode === 'play');
  if (dom['crawl-controls']) dom['crawl-controls'].hidden = !(mode === 'play' && G.phase === 'dirt' && !G.emerging);
  if (mode !== 'play') hideTutHand(); // never leave the tutorial hand hanging over a menu/shop
  if ((mode === 'menu' || mode === 'collection' || mode === 'builder') && surface) {
    soilWorld.setVisible(false);
    surface.setVisible(true);
    // Keep saved damage as the quiet scene backdrop, but reserve the bright
    // authoritative blocker overlays for active excavation only.
    surface.cutGuideGroup.visible = false;
    surface.cutGuideMesh.visible = false;
    surface.cutGuideHaloMesh.visible = false;
    shaft.visible = false;
    renderer.setClearColor(0x04050a, 1);
  }
  if (mode === 'play') {
    const dirt = G.phase === 'dirt';
    soilWorld.setVisible(dirt);
    surface.setVisible(!dirt);
    shaft.visible = false;
  }
  if (mode === 'menu') renderCemetery();
  if (mode === 'collection') renderCollection(G.collectionFocusId || M.lastRescuedId);
  if (mode === 'menu' || mode === 'collection') syncTownWorld(mode === 'collection' ? 'collection' : 'cemetery');
  else townWorld.setVisible(false);
  if (mode === 'menu' || mode === 'shop') updateAvatar();
  show(dom.menu, mode === 'menu');
  show(dom.collection, mode === 'collection');
  show(dom.shop, mode === 'shop');
  show(dom['reset-confirm'], mode === 'reset');
  show(dom.builder, mode === 'builder');
  show(dom.observe, mode === 'observe');
  show(dom.hud, mode === 'play');
  const headingId = mode === 'menu' ? 'menu-title' : mode === 'collection' ? 'collection-title' : mode === 'shop' ? 'shop-title' : null;
  if (headingId) requestAnimationFrame(() => {
    if (G.mode !== mode) return;
    const heading = document.getElementById(headingId);
    if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
  });
}

let calloutTimer = 0;
function callout(text, hold = 2.2) { dom.callout.textContent = text; dom.callout.classList.add('show'); calloutTimer = hold; }
function openResetConfirm() {
  G.resetReturnMode = G.mode === 'play' ? 'play' : 'menu';
  if (G.mode === 'play') persistRun();
  setMode('reset');
}

function soilCameraTarget() {
  return soilWorld.depthMeters > 0 ? Math.max(0, soilWorld.bodyDepth) / soilWorld.depthMeters : 0;
}
function updateSoilProgress() {
  const state = soilWorld.state();
  const frontierProgress = state.depthMeters > 0 ? state.frontierDepth / state.depthMeters : 0;
  const clearanceProgress = state.depthMeters > 0 ? state.bodyClearDepth / state.depthMeters : 0;
  const progress = state.needsWidth ? (frontierProgress + clearanceProgress) * 0.5 : frontierProgress;
  G.prog = Math.min(layerCost(), Math.max(0, progress * layerCost()));
  G.soilDeepestStep = Math.round(state.frontierDepth / soilWorld.dz);
  G.soilTravel = state.bodyDepth;
  G.soilTravelTarget = state.bodyTargetDepth;
  G.soilViewDepth = state.bodyDepth;
  G.soilViewDepthTarget = state.bodyTargetDepth;
  G.soilViewDepthManual = !state.autoFollow;
  G.soilViewX = state.playerX;
  G.soilViewY = state.playerY;
  G.soilViewTargetX = state.playerX;
  G.soilViewTargetY = state.playerY;
  G.activeSoilSpot = soilWorld.lastHit ? {
    x: +soilWorld.lastHit.x.toFixed(3),
    y: +soilWorld.lastHit.y.toFixed(3),
    z: +soilWorld.lastHit.z.toFixed(3),
  } : null;
  G.soilTunnel = {
    ready: state.canEscape,
    depthReady: state.surfaceBreached,
    widthReady: state.bodyClearDepth >= state.depthMeters - soilWorld.dz * 0.5,
    progress,
    frontierProgress,
    clearanceProgress,
    depthWork: state.frontierDepth,
    widthWork: state.bodyClearDepth,
    needDepth: state.depthMeters,
    needWidth: state.depthMeters,
    spreadX: 0,
    spreadY: 0,
    nearby: state.removedCells,
    anchor: G.activeSoilSpot,
    needsWidth: state.needsWidth,
    widthBlockerCount: state.widthBlockerCount,
    widthBlockerSlice: state.widthBlockerSlice,
    widthTargets: state.widthTargets,
  };
  return G.soilTunnel;
}
function resetSoilDigState(saved) {
  soilWorld.reset({
    depthMeters: feetFor(activeTier()) * 0.3048,
    workSteps: strataCount() * SOIL_PER_LAYER,
    grave: activeTier(),
    snapshot: saved?.soilWorld || null,
  });
  tunnelLight.position.set(0, 0, -soilWorld.depthMeters - 0.08);
  soilWorld.setVisible(G.phase === 'dirt');
  shaft.visible = false;
  G.soilDigSpots = [];
  G.soilDeepestStep = 0;
  G.soilDepthRecords = 0;
  G.lastDepthRecord = null;
  G.soilTravelTarget = 0;
  G.soilTravel = 0;
  G.soilTravelVel = 0;
  G.soilViewDepth = 0;
  G.soilViewDepthTarget = 0;
  G.soilViewDepthManual = false;
  G.activeSoilSpot = null;
  G.soilViewX = 0; G.soilViewY = 0; G.soilViewTargetX = 0; G.soilViewTargetY = 0;
  // Camera and body share one continuous coordinate, including the coffin.
  // Do not restore the old camera-only gap from v7 saves.
  G.soilCameraZ = SOIL_BODY_CAMERA_OFFSET - soilWorld.bodyDepth;
  G.soilBlockedNotified = false;
  if (G.phase === 'dirt') updateSoilProgress();
  G.camClimb = soilCameraTarget();
}

function adjustSoilViewDepth(delta) {
  if (G.mode !== 'play' || G.phase !== 'dirt' || G.emerging) return false;
  const moved = soilWorld.traverse(delta);
  updateSoilProgress();
  return moved;
}

/* ----------------------------- run lifecycle ----------------------------- */
function captureRunState() {
  return {
    lidRuleVersion: 3,
    graveId: activeGrave().id,
    graveTier: activeTier(),
    phase: G.phase, layer: G.layer, prog: G.prog, frac: surface.frac,
    snap: G.phase === 'dirt' ? null : surface.snapshot(),
    soilWorld: G.phase === 'dirt' ? soilWorld.serialize() : null,
    soilCameraZ: G.soilCameraZ,
    coffinExited: G.coffinExited,
    soilDigSpots: G.soilDigSpots, soilDeepestStep: G.soilDeepestStep,
    soilDepthRecords: G.soilDepthRecords, lastDepthRecord: G.lastDepthRecord, soilTravel: G.soilTravel,
    soilViewDepth: G.soilViewDepth, soilViewDepthTarget: G.soilViewDepthTarget,
    soilViewX: G.soilViewX, soilViewY: G.soilViewY, soilTunnel: G.soilTunnel,
  };
}

function startRun(fresh) {
  Sound.resume();
  G.mode = 'play';
  G.maxA = AIR_ENABLED ? energyMax() : 0; G.air = G.maxA;
  G.runSouls = 0; G.transition = 0; G.shake = 0; G.escapeAnim = undefined;
  G.emerging = false; G.emergeT = 0; G.escapeStartCameraZ = null;
  G.escapeFinalized = false; G.lightT = 0; G.ambT = 6;
  G.camClimb = 0;
  G.layers = groundLayers().length;

  const r = currentRun();
  if (r && !fresh) {
    G.phase = r.phase; G.layer = r.layer || 0; G.prog = r.prog || 0; // restore tap-progress + the exact hole
    if (G.phase === 'dirt') {
      surface.setVisible(false);
      resetSoilDigState(r);
      G.coffinExited = typeof r.coffinExited === 'boolean'
        ? r.coffinExited
        : soilWorld.bodyDepth > -soilWorld.coffinDepth + 0.02;
    } else {
      G.coffinExited = false;
      soilWorld.setVisible(false);
      surface.reset(G.phase, G.layer, activeTier(), r.snap);
      // A v9 save could catch the old delayed transition after the aperture
      // was already passable but after progress had been cleared to zero.
      if (G.phase === 'coffin' && !r.lidRuleVersion && surface.opening?.passable) {
        G.prog = layerCost();
      }
      if (!r.snap) surface.preDig(r.frac || 0);
      resetSoilDigState(null);
    }
  } else {
    activeProgress().run = null; G.phase = 'coffin'; G.layer = 0; G.prog = 0;
    G.coffinExited = false;
    surface.reset('coffin', 0, activeTier());
    soilWorld.setVisible(false);
    resetSoilDigState(null);
  }
  G.lastFrac = surface.frac;
  G.lastBarrierTransition = null;
  G.toolWear = 0; G._lastWearState = 'clean'; // you wake up healed - nails regenerate
  G.carveWX = 0; G.carveWY = -1.5; G.toolTX = 0; G.toolTY = G.phase === 'dirt' ? -0.78 : -0.42; toolStab = 0;
  surface.setVisible(G.phase !== 'dirt');
  soilWorld.setVisible(G.phase === 'dirt');
  shaft.visible = false;
  renderer.setClearColor(0x04050a, 1);
  equipToolMesh();
  growLight();
  setMode('play');
  updateHud();
  if (G.phase === 'coffin' && G.prog >= layerCost()) breakLayer();
  else callout(G.phase === 'coffin' ? t('clawLid') : t('digUp'), 2.6);
  saveMeta();
}

function persistRun() {
  if (G.mode === 'play') {
    activeProgress().run = captureRunState();
    saveMeta();
  }
}

function die() {
  G.mode = 'dead';
  const progress = activeProgress();
  progress.run = captureRunState();
  const pity = 4 + progress.day; // small bonus on top of souls already banked while digging
  M.souls += pity; progress.day += 1; progress.deaths += 1; M.totalDeaths += 1;
  flash('#1a0604', 0.9, 700);
  G.lastEscaped = false;
  openShop(t('deadTitle'), t('deadCopy', progress.day - 1, Math.round(G.runSouls + pity)));
  saveMeta();
}

function grantResidentReward(grave) {
  const progress = M.graveProgress[grave.id];
  if (progress.rewardClaimed) return;
  if (grave.reward.type === 'tutorial') {
    M.storyFlags.cemeteryUnlocked = true;
    M.coffinTool = Math.max(M.coffinTool, 1);
  } else if (grave.reward.type === 'groundskeeper') {
    M.digTool = Math.max(M.digTool, 1);
    M.grit = Math.max(M.grit, 1);
  } else if (grave.reward.type === 'undertaker') {
    M.coffinTool = Math.max(M.coffinTool, 1);
    M.digTool = Math.max(M.digTool, 3);
  } else if (grave.reward.type === 'ground-sucker') {
    M.storyFlags.groundSuckerBlueprint = true;
  }
  progress.rewardClaimed = true;
}

function beginEscapeRun() {
  if (G.emerging || G.escapeFinalized || G.mode !== 'play') return;
  G.emerging = true;
  G.emergeT = 0;
  G.escapeStartCameraZ = G.soilCameraZ;
  G.prog = layerCost();
  G.layer = G.layers;
  dom['crawl-controls'].hidden = true;
  dom.callout.classList.remove('show');
  calloutTimer = 0;
}

function escapeRun() {
  if (G.escapeFinalized) return;
  const grave = activeGrave();
  const progress = activeProgress();
  G.escapeFinalized = true;
  G.emerging = false;
  G.emergeT = 1;
  G.mode = 'escaped';
  show(dom.hud, false); dom.callout.classList.remove('show'); calloutTimer = 0;
  const bonus = 40 + activeTier() * 30; // on top of souls already banked while digging
  M.souls += bonus;
  progress.escaped = true;
  progress.escapedAt = Date.now();
  progress.clueSeen = true;
  progress.run = null;
  progress.day = 1;
  M.lastRescuedId = grave.id;
  grantResidentReward(grave);
  G.lastEscaped = true;
  G.lastAction = { type: 'escape', status: 'success', graveId: grave.id };
  Sound.setSceneActive(false);
  surface.setVisible(false);
  soilWorld.setVisible(true);
  renderer.setClearColor(0x5ba9da, 1);
  skyGlowMat.opacity = 0;
  sky.intensity = 1.5;
  ambient.intensity = 1.15;
  scene.fog.density = 0.012;
  tunnelLight.intensity = 5;
  setTimeout(() => {
    if (G.mode !== 'escaped') return;
    renderCollection(grave.id);
    setMode('collection');
  }, 2800);
  saveMeta();
}

/* ------------------------------- breaking -------------------------------- */
function breakLayer() {
  const brokenPhase = G.phase;
  G.transition = 0;
  G.prog = 0; // next barrier starts fresh
  if (brokenPhase === 'coffin') {
    // The lid is already the full passage: release splinters across the face,
    // then remove the whole barrier. There is no second widening interaction.
    const halfWidth = SURF_W * surface.mesh.scale.x * 0.36;
    const halfHeight = SURF_W * surface.mesh.scale.y * 0.36;
    for (let burst = 0; burst < 4; burst++) {
      spawnDebris(
        (Math.random() - 0.5) * halfWidth * 2,
        (Math.random() - 0.5) * halfHeight * 2,
        true,
        6,
        surface.mesh.position.z + 0.05,
      );
    }
  } else {
    spawnDebris(
      (Math.random() - 0.5) * 0.24,
      (Math.random() - 0.5) * 0.24,
      brokenPhase === 'metal' ? 'metal' : false,
      34,
      surface.mesh.position.z + 0.05,
    );
  }
  G.shake = brokenPhase === 'coffin' ? 0.34 : 0.72;
  G.shakeT = brokenPhase === 'coffin' ? 0.32 : 0.55;

  if (brokenPhase === 'coffin') {
    flash('#efdbb4', 0.16, 180);
    if (G.tut === 2) { G.tut = 3; setTimeout(() => callout(t('tutDig'), 4.5), 1700); } // tutorial: point them up through the soil
    if (hasMetal(activeTier())) { // hit the reinforcing steel plate
      G.phase = 'metal'; surface.reset('metal', 0, activeTier()); G.lastFrac = 0;
      G.lastBarrierTransition = { from: 'coffin', to: 'steel', immediate: true, bodyPassable: true };
      equipToolMesh(); updateHud(); callout(t('metalPlate'), 2.6);
    } else {
      G.phase = 'dirt'; G.layer = 0; surface.setVisible(false); G.lastFrac = 0;
      G.lastBarrierTransition = { from: 'coffin', to: 'soil', immediate: true, bodyPassable: true };
      G.coffinExited = false;
      clearDebris(); // the removed lid must not become a second screen-space obstruction
      resetSoilDigState(null);
      soilWorld.setVisible(true);
      equipToolMesh(); updateHud(); callout(t('lidBroken'), 1.8);
    }
  } else if (brokenPhase === 'metal') {
    G.phase = 'dirt'; G.layer = 0; surface.setVisible(false); G.lastFrac = 0;
    G.lastBarrierTransition = { from: 'steel', to: 'soil', immediate: true, bodyPassable: true };
    G.coffinExited = false;
    clearDebris(); // reveal the contiguous soil face immediately after the plate gives way
    resetSoilDigState(null);
    soilWorld.setVisible(true);
    equipToolMesh(); updateHud(); callout(t('metalBroken'), 1.8);
  } else {
    // The physical soil volume contains every stratum. A real breach ends the run;
    // there is no fresh face or camera reset after the player has crossed it.
    beginEscapeRun();
  }
  return true;
}
function growLight() {
  let tNear = 0;
  if (G.phase === 'dirt' && soilWorld.surfaceBreached) {
    tNear = 0.18 + 0.82 * Math.min(1, soilWorld.bodyDepth / Math.max(0.01, soilWorld.depthMeters));
  }
  // ease toward the target every frame so the light NEVER flickers frame-to-frame
  G.lightT = (G.lightT || 0) + (tNear - (G.lightT || 0)) * 0.12;
  const t = G.lightT, t2 = t * t;
  sky.intensity = t2 * 0.7;
  ambient.intensity = 0.68 + t * 0.24;
  scene.fog.density = 0.045 - t * 0.012;
  tunnelLight.intensity = t2 * 3.5;                   // daylight enters only through a real surface breach
  skyGlowMat.opacity = 0;                             // the legacy flood plane remains permanently disabled
  if (surface && surface.backMat) {
    surface.backMat.color.setScalar(0.48 + t * 0.32); // deeper soil brightens, but it is not sky yet
  }
}

/* ------------------------------- carving --------------------------------- */
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const soilAimPoint = new THREE.Vector3();
const escapeLookDirection = new THREE.Vector3();
const escapeWorldUp = new THREE.Vector3(0, 0, -1);
// Raycast against the ORIGINAL flat plane (z=0), NOT the displaced mesh: r160's raycaster applies
// the displacementMap, so once a spot recedes into the deep pit the ray misses it and you could
// never dig it deeper. A fixed math-plane keeps every tap mapping to the right texel at any depth.
const carvePlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
const carveHit = new THREE.Vector3();
function pointerToUV(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(ndc, camera);
  carvePlane.constant = -surface.mesh.position.z;
  if (!raycaster.ray.intersectPlane(carvePlane, carveHit)) return null;
  const spanX = SURF_W * surface.mesh.scale.x;
  const spanY = SURF_W * surface.mesh.scale.y;
  const u = carveHit.x / spanX + 0.5, v = carveHit.y / spanY + 0.5;
  if (u < 0 || u > 1 || v < 0 || v > 1) return null;
  return { x: u, y: v, worldX: carveHit.x, worldY: carveHit.y };
}
function pointSoilRay(uv) {
  ndc.x = uv.x * 2 - 1;
  ndc.y = uv.y * 2 - 1;
  raycaster.setFromCamera(ndc, camera);
}
function doSoilCarve(uv) {
  if (G.emerging || G.escapeFinalized) return false;
  pointSoilRay(uv);
  const power = clawPower('dirt');
  const result = soilWorld.carve(raycaster, power);
  if (!result.removed) {
    if (result.reason === 'tight-passage') {
      callout(LANG === 'ru' ? 'проход узкий - копай видимые края' : 'passage is tight - dig the visible edges', 2.2);
    } else if (result.reason === 'out-of-reach') {
      callout(
        result.needsWidth
          ? (LANG === 'ru' ? 'слишком далеко - копай ближайший край' : 'too far - dig the nearest edge')
          : (LANG === 'ru' ? 'не дотянуться - ползи вперёд' : 'out of reach - crawl forward'),
        2.2,
      );
    }
    return false;
  }

  toolStab = 1;
  G.carveWX = result.hit.x;
  G.carveWY = result.hit.y;
  if (result.guidedWidthCut) {
    soilAimPoint.copy(result.hit).project(camera);
    G.toolTX = Math.max(-0.68, Math.min(0.68, soilAimPoint.x * 0.625));
    G.toolTY = Math.max(-1.12, Math.min(-0.25, soilAimPoint.y * 0.475 - 0.72));
  } else {
    G.toolTX = (uv.x - 0.5) * 1.25;
    G.toolTY = (uv.y - 0.5) * 0.95 - 0.72;
  }
  spawnDebris(result.hit.x, result.hit.y, false, Math.min(7, 2 + Math.ceil(result.removed / 3)), result.hit.z + 0.04);
  Sound.dig(power);

  if (toolGroup && toolGroup.userData.isSprite && toolGroup.userData.isFlesh) {
    G.toolWear = Math.min(1, G.toolWear + 0.005);
    const st = wearState();
    if (st !== G._lastWearState) {
      G._lastWearState = st;
      refreshToolSprite();
    }
  }

  G.shake = Math.min(1, G.shake + 0.06 + power * 0.004);
  G.shakeT = 0.12;
  G.depthLurch = Math.min(1, (G.depthLurch || 0) + 0.2);
  G.soilDepthRecords += 1;
  G.lastDepthRecord = {
    x: +result.hit.x.toFixed(3),
    y: +result.hit.y.toFixed(3),
    z: +result.hit.z.toFixed(3),
    depth: +result.frontierDepth.toFixed(3),
  };
  const soilTunnel = updateSoilProgress();

  if (G.tut === 1) tutorialTapped();
  const soulGain = Math.max(0.08, result.removedVolume * 90) * (1 + M.calm * BODY[2].per);
  M.souls += soulGain;
  G.runSouls += soulGain;

  if (soilTunnel.needsWidth && soilTunnel.widthBlockerCount > 0 && result.frontierDepth > 0.35 && !G.soilBlockedNotified) {
    G.soilBlockedNotified = true;
    callout(LANG === 'ru' ? 'проход узкий - копай землю по краям' : 'passage is tight - dig the soil around the edges', 2.2);
  } else if (!soilTunnel.needsWidth) {
    G.soilBlockedNotified = false;
  }

  updateHud();
  if (soilTunnel.ready) {
    G.prog = layerCost();
    G.layer = G.layers;
    beginEscapeRun();
  }
  return true;
}
function doCarve(uv) {
  if (G.mode !== 'play' || G.transition > 0) return;
  if (G.phase === 'dirt') return doSoilCarve(uv);
  const wood = G.phase === 'coffin';
  const isMetal = G.phase === 'metal';
  const woodSfx = wood || matProps(surface.material).wood; // wood layers chip + sound like wood
  const power = clawPower(G.phase);
  // wood + steel get scratched; loose soil gets the same persistent local dig surface as the prototype.
  const isNailTool = toolGroup && toolGroup.userData.meshKey === 'nail';
  const style = (wood || isMetal || isNailTool) ? 'scratch' : 'claw';
  surface.carve(uv.x, uv.y, power, wood, style);
  toolStab = 1;
  const lx = uv.worldX ?? (uv.x - 0.5) * SURF_W;
  const ly = uv.worldY ?? (uv.y - 0.5) * SURF_W;
  G.carveWX = lx; G.carveWY = ly; // world point on the surface the tool presses into
  G.toolTX = (uv.x - 0.5) * 1.25;
  // The hand stays anchored below the player's eyes while the actual strike
  // travels into screen depth (-Z), never down a wall.
  G.toolTY = -0.42 + (uv.y - 0.5) * 0.26;
  spawnDebris(
    lx,
    ly,
    isMetal ? 'metal' : woodSfx,
    isMetal ? 6 : (woodSfx ? 14 : 5),
    surface.mesh.position.z + 0.05,
  ); // a spray of tiny wood splinters
  // bare hand/nails wear out visually: clean -> scraped (metal never wears)
  if (toolGroup && toolGroup.userData.isSprite && toolGroup.userData.isFlesh) {
    G.toolWear = Math.min(1, G.toolWear + (wood ? 0.006 : 0.005));
    const st = wearState();
    if (st !== G._lastWearState) { G._lastWearState = st; refreshToolSprite(); }
  }
  G.shake = Math.min(1, G.shake + 0.06 + power * 0.004); G.shakeT = 0.12;

  surface.measure();
  G.lastFrac = surface.frac;
  G.prog += power;
  if (wood) {
    surface.crack(uv.x, uv.y, Math.min(1, G.prog / layerCost()));
  }
  if (G.tut === 1) tutorialTapped(); // first claw of the first run - hand off to non-blocking hints
  const soulGain = power * SOUL_PER_POWER * (1 + M.calm * BODY[2].per);
  M.souls += soulGain; G.runSouls += soulGain;
  if (AIR_ENABLED) G.air -= TAP_AIR; // optional old energy/air mode
  updateHud();
  if (G.prog >= layerCost()) {
    breakLayer(); return;
  } // broke through: reward, don't black out this tap
  if (AIR_ENABLED && G.air <= 0) { G.air = 0; die(); } // old blackout mode, currently disabled
}

/* ------------------------------- input ----------------------------------- */
// Dirt taps remove real volume. A drag looks around from inside the retained tunnel.
let obsLast = null;
let soilPointer = null;
let townPointer = null;
const SOIL_HOLD_DELAY_MS = 230;
const SOIL_HOLD_REPEAT_MS = 90;
function screenUv(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)),
    y: Math.max(0, Math.min(1, 1 - (clientY - rect.top) / rect.height)),
  };
}
function onDown(e) {
  if (G.mode === 'intro') { finishIntro(); return; } // tap to skip the descent
  if (G.mode === 'observe') { obsLast = { x: e.clientX, y: e.clientY }; G.obsAuto = false; try { canvas.setPointerCapture(e.pointerId); } catch (_) {} return; }
  if (G.mode === 'menu' || G.mode === 'collection') {
    e.preventDefault();
    townPointer = {
      id: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      lastX: e.clientX,
      lastY: e.clientY,
      moved: false,
    };
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
    return;
  }
  const physicalLook = G.phase === 'dirt' && (G.mode === 'play' || G.mode === 'escaped');
  if (G.mode !== 'play' && !physicalLook) return;
  e.preventDefault(); Sound.resume();
  if (physicalLook) {
    const startedAt = performance.now();
    soilPointer = {
      id: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      lastX: e.clientX,
      lastY: e.clientY,
      moved: false,
      startedAt,
      holdNextAt: startedAt + SOIL_HOLD_DELAY_MS,
      heldDig: false,
    };
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
    return;
  }
  const uv = pointerToUV(e.clientX, e.clientY); if (uv) doCarve(uv);
}
function onDrag(e) {
  if (G.mode === 'observe' && obsLast) {
    const dx = e.clientX - obsLast.x, dy = e.clientY - obsLast.y; obsLast = { x: e.clientX, y: e.clientY };
    G.obsYaw -= dx * 0.008;
    G.obsPitch = Math.max(-1.35, Math.min(1.35, G.obsPitch + dy * 0.008));
    return;
  }
  if ((G.mode === 'menu' || G.mode === 'collection') && townPointer && townPointer.id === e.pointerId) {
    const dx = e.clientX - townPointer.lastX;
    const dy = e.clientY - townPointer.lastY;
    if (Math.hypot(e.clientX - townPointer.startX, e.clientY - townPointer.startY) > 8) townPointer.moved = true;
    if (townPointer.moved) townWorld.orbit(dx, dy);
    townPointer.lastX = e.clientX;
    townPointer.lastY = e.clientY;
    return;
  }
  if (G.mode === 'menu' || G.mode === 'collection') {
    townWorld.setHover(townWorld.pick(e.clientX, e.clientY));
    return;
  }
  if ((G.mode === 'play' || G.mode === 'escaped') && G.phase === 'dirt' && soilPointer && soilPointer.id === e.pointerId) {
    const total = Math.hypot(e.clientX - soilPointer.startX, e.clientY - soilPointer.startY);
    if (total > 9) soilPointer.moved = true;
    if (soilPointer.moved) {
      soilWorld.rotateLook(e.clientX - soilPointer.lastX, e.clientY - soilPointer.lastY);
      soilPointer.lastX = e.clientX;
      soilPointer.lastY = e.clientY;
    }
  }
}
function onDragEnd(e) {
  obsLast = null;
  if (townPointer && (e.pointerId == null || e.pointerId === townPointer.id)) {
    const wasTap = !townPointer.moved;
    const x = e.clientX ?? townPointer.startX;
    const y = e.clientY ?? townPointer.startY;
    townPointer = null;
    if (wasTap && (G.mode === 'menu' || G.mode === 'collection')) {
      const id = townWorld.pick(x, y);
      if (id) {
        if (G.mode === 'collection' && M.graveProgress[id]?.escaped) {
          G.collectionFocusId = id;
          renderCollection(id);
          townWorld.setHover(id);
        } else if (G.mode === 'menu') {
          selectGrave(id);
        }
      }
    }
    return;
  }
  if (!soilPointer || (e.pointerId != null && e.pointerId !== soilPointer.id)) return;
  const tap = !soilPointer.moved && !soilPointer.heldDig &&
    performance.now() - soilPointer.startedAt < 650;
  const uv = screenUv(e.clientX ?? soilPointer.startX, e.clientY ?? soilPointer.startY);
  soilPointer = null;
  if (tap && G.mode === 'play' && G.phase === 'dirt') doSoilCarve(uv);
}
canvas.addEventListener('pointerdown', onDown, { passive: false });
canvas.addEventListener('pointermove', onDrag, { passive: false });
canvas.addEventListener('pointerleave', () => {
  if (!townPointer) townWorld.setHover(null);
});
window.addEventListener('pointerup', onDragEnd);
window.addEventListener('pointercancel', () => { obsLast = null; soilPointer = null; townPointer = null; });
canvas.addEventListener('wheel', (e) => {
  if (G.mode === 'menu' || G.mode === 'collection') {
    townWorld.zoom(e.deltaY);
    e.preventDefault();
    return;
  }
  const dir = e.deltaY > 0 ? 1 : -1;
  if (adjustSoilViewDepth(dir * 0.42)) e.preventDefault();
}, { passive: false });
window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  const key = e.key.toLowerCase();
  let handled = false;
  if (key === 'w' || e.key === 'ArrowUp') handled = adjustSoilViewDepth(0.42);
  else if (key === 's' || e.key === 'ArrowDown') handled = adjustSoilViewDepth(-0.42);
  if (handled) e.preventDefault();
});

/* ============================================================================
   HUD / SHOP / TUTORIAL
   ========================================================================== */
function updateHud() {
  dom['grave-label'].textContent = `${activeGrave().name} - ${feetFor(activeTier())} ft down`;
  dom['souls-label'].textContent = t('souls', fmt(M.souls));
  dom['tool-label'].textContent = (G.phase === 'dirt' ? DIG_TOOLS[M.digTool] : COFFIN_TOOLS[M.coffinTool]).name;
  if (G.phase === 'coffin' || G.phase === 'metal') {
    dom['work-label'].textContent = G.phase === 'metal' ? t('metal') : t('coffin');
    dom['work-fill'].style.setProperty('--value', Math.min(100, G.prog / layerCost() * 100) + '%');
    dom['depth-label'].textContent = t('ftLeft', feetFor(activeTier()));
  } else {
    dom['work-label'].textContent = soilWorld.needsWidth ? t('widen') : t('soil');
    dom['work-fill'].style.setProperty('--value', Math.min(100, G.prog / layerCost() * 100) + '%');
    const bodyRatio = soilWorld.depthMeters > 0 ? Math.max(0, soilWorld.bodyDepth) / soilWorld.depthMeters : 0;
    const ftLeft = Math.max(0, Math.ceil(feetFor(activeTier()) * (1 - bodyRatio) * 10) / 10);
    const nearSurface = bodyRatio >= 0.94;
    dom['depth-label'].textContent = nearSurface ? t('surfaceClose') : t('ftLeft', ftLeft);
  }
  if (dom['crawl-controls']) dom['crawl-controls'].hidden = !(G.mode === 'play' && G.phase === 'dirt' && !G.emerging);
  const airMeter = dom['air-fill']?.closest('.meter');
  if (airMeter) airMeter.hidden = !AIR_ENABLED;
  if (AIR_ENABLED) {
    const ratio = G.maxA > 0 ? G.air / G.maxA : 0;
    dom['air-fill'].style.setProperty('--value', (ratio * 100) + '%');
    dom['air-label'].textContent = `${t('air')} ${Math.max(0, Math.ceil(G.air))}`;
    if (ratio < 0.35) { dom['air-fill'].style.setProperty('--fill-a', '#d6533d'); dom['air-fill'].style.setProperty('--fill-b', '#ff8a6a'); }
    else { dom['air-fill'].style.setProperty('--fill-a', '#5fb7e8'); dom['air-fill'].style.setProperty('--fill-b', '#aee9ff'); }
  }

  // vertical exit meter: how far up from the coffin (bottom) to the surface (top)
  const barriers = 1 + (hasMetal(activeTier()) ? 1 : 0); // coffin lid (+ steel plate)
  const totalSteps = barriers + G.layers;
  let done;
  const layerDone = Math.min(1, G.prog / layerCost());
  if (G.phase === 'coffin') done = layerDone;
  else if (G.phase === 'metal') done = 1 + layerDone;
  else done = barriers + Math.max(0, Math.min(1, soilWorld.bodyDepth / Math.max(0.01, soilWorld.depthMeters)));
  const overall = Math.max(0, Math.min(1, totalSteps > 0 ? done / totalSteps : 0));
  dom['dm-fill'].style.height = (overall * 100).toFixed(1) + '%';
  if (G.phase === 'dirt' && G.mode === 'play') growLight(); // light tracks the hole depth; escape flood owns it after
}

let shopTab = 'tools';
function openShop(title, copy) {
  dom['shop-title'].innerHTML = title; dom['shop-copy'].innerHTML = copy;
  renderShop(); setMode('shop');
  const btn = document.getElementById('dig-again-button');
  btn.textContent = G.lastEscaped ? t('escMore') : t('resume');
}
// GACHA: open a grave cache for a random tool. Rare rolls jump you several tiers at once.
const GACHA_COST = 40;
const GACHA_RARITY = [
  { name: 'Common', w: 56, jump: 1, color: '#cbcbcb' },
  { name: 'Rare', w: 28, jump: 2, color: '#5aacff' },
  { name: 'Epic', w: 12, jump: 3, color: '#c07af0' },
  { name: 'Legendary', w: 4, jump: 4, color: '#ffc44d' },
];
function gachaCost() { return GACHA_COST * Math.pow(2, M.gachaOpens || 0); } // doubles with every open, permanently
function gachaMaxed() { return M.coffinTool >= COFFIN_TOOLS.length - 1 && M.digTool >= DIG_TOOLS.length - 1; }
function rollGacha() {
  const cost = gachaCost();
  if (M.souls < cost || gachaMaxed()) return;
  M.souls -= cost; M.gachaOpens = (M.gachaOpens || 0) + 1; // next open costs double
  const tot = GACHA_RARITY.reduce((s, r) => s + r.w, 0); let r = Math.random() * tot, rar = GACHA_RARITY[0];
  for (const gg of GACHA_RARITY) { if ((r -= gg.w) < 0) { rar = gg; break; } }
  // random: coffin OR ground tool - but never roll a maxed category (so it always gives something useful)
  const coffinMax = M.coffinTool >= COFFIN_TOOLS.length - 1, digMax = M.digTool >= DIG_TOOLS.length - 1;
  let coffin = coffinMax ? false : digMax ? true : (Math.random() < 0.5);
  if (!coffinMax && !digMax && G.lastGachaCoffin === coffin && Math.random() < 0.6) coffin = !coffin; // soften streaks so both types show up
  G.lastGachaCoffin = coffin;
  const list = coffin ? COFFIN_TOOLS : DIG_TOOLS, cur = coffin ? M.coffinTool : M.digTool;
  const target = Math.min(list.length - 1, cur + rar.jump);
  let dupe = false, gained = 0;
  if (target > cur) { if (coffin) M.coffinTool = target; else M.digTool = target; }
  else { dupe = true; gained = Math.round(cost * 0.6); M.souls += gained; }
  const got = list[dupe ? cur : target];
  G.gacha = { rar, toolName: got.name, mesh: got.mesh, power: got.power, coffin, dupe, gained };
  saveMeta(); renderShop(); updateHud();
}
function renderShop() {
  document.getElementById('tab-tools').classList.toggle('active', shopTab === 'tools');
  document.getElementById('tab-body').classList.toggle('active', shopTab === 'body');
  document.getElementById('tab-cache').classList.toggle('active', shopTab === 'cache');
  const wrap = dom['shop-rows']; wrap.innerHTML = '';
  if (shopTab === 'tools') {
    toolUpgradeRow(wrap, 'Coffin tool', 'coffin');
    toolUpgradeRow(wrap, 'Digging tool', 'dirt');
    if (M.storyFlags.groundSuckerBlueprint) {
      const blueprint = document.createElement('div');
      blueprint.className = 'shop-row owned blueprint';
      blueprint.innerHTML = `<div><strong>Ground Sucker blueprint</strong><small>Vera's design for a soil-vacuum gun is recovered. The workshop can build its first prototype in the next chapter.</small></div><span class="blueprint-state">Recovered</span>`;
      wrap.appendChild(blueprint);
    }
    const hint = document.createElement('div');
    hint.style.cssText = 'color:#8f8064;font-size:.72rem;margin:.5rem .1rem 0;line-height:1.4;';
    hint.innerHTML = 'Upgrade the tools you own here. <b>New tools are dug up from the Soul Cache</b> &mdash; check the cache tab.';
    wrap.appendChild(hint);
  } else if (shopTab === 'cache') {
    const res = G.gacha;
    const box = document.createElement('div'); box.className = 'gacha';
    if (res && !res.dupe) { // a real prize: the tool you won, shining in its rarity colour
      box.innerHTML = `
        <div class="prize" style="--rc:${res.rar.color}">
          <div class="prize-rays"></div><div class="prize-glow"></div>
          <img class="prize-img" src="${toolIcon(res.mesh)}" alt="" />
        </div>
        <div class="prize-label">
          <b style="color:${res.rar.color}">${res.rar.name.toUpperCase()}!</b>
          <div class="prize-name">${res.toolName}</div>
          <small>&#9889; power ${res.power.toFixed(1)} &middot; ${res.coffin ? 'coffin tool' : 'digging tool'}</small>
        </div>`;
    } else {
      box.innerHTML = `
        <div class="gacha-box${res ? ' pop' : ''}" style="--rc:${res ? res.rar.color : 'rgba(170,150,120,0.5)'}">&#9905;</div>
        <div class="gacha-result">${res && res.dupe
          ? `<b style="color:${res.rar.color}">${res.rar.name}!</b><br>already had <b>${res.toolName}</b> &mdash; <b>+${res.gained}</b> souls back`
          : 'Dig up a random tool from the grave dirt.<br>Rare rolls jump you several tiers.'}</div>
        <div class="gacha-odds">common 56% &middot; rare 28% &middot; epic 12% &middot; legendary 4%</div>`;
    }
    wrap.appendChild(box);
    const cost = gachaCost(), maxed = gachaMaxed();
    const gb = document.createElement('button'); gb.className = 'button wide';
    gb.innerHTML = maxed ? 'All tools maxed' : (M.souls < cost ? `Need ${fmt(cost)} souls` : `Open cache &mdash; ${fmt(cost)} souls`);
    gb.disabled = maxed || M.souls < cost; gb.onclick = rollGacha;
    wrap.appendChild(gb);
    if (!maxed) { const note = document.createElement('div'); note.style.cssText = 'color:#8f8064;font-size:.7rem;text-align:center;margin-top:.35rem;'; note.textContent = 'each open costs double the last'; wrap.appendChild(note); }
  } else {
    BODY.filter(b => AIR_ENABLED || b.key !== 'lungs').forEach((b) => {
      const lv = M[b.key]; const maxed = lv >= b.max; const cost = b.base + lv * b.step;
      const row = document.createElement('div'); row.className = 'shop-row';
      row.innerHTML = `<div><strong>${b.name}</strong><small>${b.desc(lv)}</small></div>`;
      const btn = document.createElement('button'); btn.className = 'button';
      btn.textContent = maxed ? 'Max' : (M.souls < cost ? `Need ${fmt(cost)}` : `Buy ${fmt(cost)}`);
      btn.disabled = maxed || M.souls < cost;
      btn.onclick = () => { if (M.souls < cost || maxed) return; M.souls -= cost; M[b.key]++; saveMeta(); renderShop(); updateHud(); };
      row.appendChild(btn); wrap.appendChild(row);
    });
  }
}
// one row per owned tool: its name, a single POWER stat, and an Upgrade button (souls -> +power)
function toolUpgradeRow(wrap, label, phase) {
  const dirt = phase === 'dirt';
  const tool = dirt ? DIG_TOOLS[M.digTool] : COFFIN_TOOLS[M.coffinTool];
  const lvl = dirt ? M.digLvl : M.coffinLvl;
  const cost = upgradeCost(phase);
  const head = document.createElement('div'); head.style.cssText = 'color:#ab9c84;font-weight:900;font-size:.78rem;margin:.4rem 0 -.1rem;'; head.textContent = label; wrap.appendChild(head);
  const row = document.createElement('div'); row.className = 'shop-row owned equipped';
  row.innerHTML = `<div><strong>${tool.name}</strong><small>${tool.desc}</small>
    <div style="color:#f0c78a;font-weight:900;font-size:.84rem;margin-top:.15rem;">&#9889; power ${toolPower(phase).toFixed(1)}${lvl > 0 ? ` <span style="color:#9c8f79;font-weight:700;">&middot; lvl ${lvl}</span>` : ''}</div></div>`;
  const btn = document.createElement('button'); btn.className = 'button';
  btn.textContent = M.souls < cost ? `Need ${fmt(cost)}` : `Upgrade · ${fmt(cost)}`;
  btn.disabled = M.souls < cost;
  btn.onclick = () => { if (M.souls < cost) return; M.souls -= cost; if (dirt) M.digLvl++; else M.coffinLvl++; saveMeta(); renderShop(); updateHud(); };
  row.appendChild(btn); wrap.appendChild(row);
}

function renderTutorial() {
  const items = LANG === 'ru' ? [
    ['&#9995;', '<b>Крышка.</b> Сломай её; после этого весь проход открыт.'],
    ['&#9978;', '<b>Яма.</b> Нажимай или удерживай, чтобы копать понемногу; расчищай узкие края перед движением.'],
    ['&#128296;', '<b>Прокачка.</b> Улучшай инструмент (сила = меньше тапов), новые инструменты - из Кэша Душ.'],
    ['&#127774;', '<b>Победа.</b> Пробейся к небу - получи души и копай глубже.'],
  ] : [
    ['&#9995;', '<b>Lid.</b> Break it; once it gives, the whole way is open.'],
    ['&#9978;', '<b>Passage.</b> Tap or hold for small bites; inspect and clear any tight edge before crawling.'],
    ['&#128296;', '<b>Upgrade.</b> Level up your tool (more power = fewer taps). New tools come from the Soul Cache.'],
    ['&#127774;', '<b>Win.</b> Break through to the sky to bank souls and dig deeper.'],
  ];
  dom['tut-list'].innerHTML = items.map(([e, txt]) => `<div><span class="em">${e}</span><span>${txt}</span></div>`).join('');
}

/* ----------------------- cemetery / collection UI ----------------------- */
function effectiveGraveTier(grave, progress = M.graveProgress[grave.id]) {
  return Math.max(1, progress.run?.graveTier || grave.tier || 1);
}

function effectiveGraveMaterials(grave, progress = M.graveProgress[grave.id]) {
  const tier = effectiveGraveTier(grave, progress);
  if (!progress.run || tier === grave.tier) return grave.materials;
  const metal = metalThicknessFor(tier);
  return [tier <= 2 ? 'saved pine lid' : 'saved oak lid', metal ? `${(metal * 100).toFixed(0)} cm steel` : 'wood only', 'packed soil'];
}

function savedRunLabel(progress, grave = activeGrave()) {
  if (!progress.run) return '';
  const tier = effectiveGraveTier(grave, progress);
  const phase = progress.run.phase === 'coffin' ? 'lid' : progress.run.phase === 'metal' ? 'steel' : 'soil';
  const pct = progress.run.phase === 'dirt' && progress.run.soilWorld
    ? Math.round(((progress.run.soilWorld.bodyDepth || 0) / (feetFor(tier) * 0.3048)) * 100)
    : Math.round(Math.min(1, (progress.run.prog || 0) / Math.max(1, progress.run.phase === 'metal' ? 40 : 12 + (tier - 1) * 4)) * 100);
  return `${phase} ${Math.max(0, Math.min(100, pct))}% saved`;
}

function renderCemetery() {
  if (!dom['grave-list']) return;
  const rescued = GRAVE_CATALOG.filter((grave) => M.graveProgress[grave.id].escaped).length;
  dom['menu-title'].textContent = 'Ravenshollow';
  dom['menu-copy'].textContent = 'Choose a grave';
  const remaining = GRAVE_CATALOG.length - rescued;
  dom['cemetery-copy'].textContent = rescued === GRAVE_CATALOG.length
    ? 'Every resident is above ground.'
    : M.storyFlags.groundSuckerBlueprint
      ? `${remaining} ${remaining === 1 ? 'resident remains' : 'residents remain'} underground.`
      : `${rescued} of ${GRAVE_CATALOG.length} risen. Drag to look around.`;
  dom['grave-list'].innerHTML = '';

  GRAVE_CATALOG.forEach((grave) => {
    const progress = M.graveProgress[grave.id];
    const status = graveStatus(grave);
    const slot = document.createElement('div');
    slot.setAttribute('role', 'listitem');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `grave-hotspot ${status}`;
    button.dataset.status = status;
    button.dataset.graveId = grave.id;
    button.setAttribute('aria-current', grave.id === M.activeGraveId ? 'true' : 'false');
    if (status === 'locked') button.setAttribute('aria-describedby', 'cemetery-copy');
    const action = status === 'rescued' ? 'View risen' : status === 'resume' ? 'Resume' : status === 'locked' ? 'Jonah first' : 'Wake';
    const saved = savedRunLabel(progress, grave);
    const effectiveTier = effectiveGraveTier(grave, progress);
    const metal = metalThicknessFor(effectiveTier);
    const fact = status === 'locked'
      ? 'Escape Jonah to unlock'
      : status === 'resume'
        ? saved
        : status === 'rescued'
          ? 'Memory recovered'
          : `${feetFor(effectiveTier)} ft · ${metal ? `${(metal * 100).toFixed(0)} cm steel` : 'wood'}`;
    button.setAttribute('aria-label', `${grave.name}, ${grave.profession}. ${action}. ${fact}.`);
    button.innerHTML = `
      <span class="grave-hotspot-name">${grave.name}</span>
      <span class="grave-hotspot-action">${action} · ${fact}</span>`;
    button.onpointerenter = () => townWorld.setHover(grave.id);
    button.onpointerleave = () => townWorld.setHover(null);
    button.onfocus = () => townWorld.setHover(grave.id);
    button.onblur = () => townWorld.setHover(null);
    button.onclick = () => selectGrave(grave.id);
    slot.appendChild(button);
    dom['grave-list'].appendChild(slot);
  });
  updateAvatar();
}

function townStoryFor(escaped) {
  const ids = new Set(escaped.map((grave) => grave.id));
  if (!ids.size) return 'Every clock stopped at 12:17.';
  if (ids.size === GRAVE_CATALOG.length) return 'A sealed chamber waits beneath the town pump.';
  if (ids.has('vera-kern')) return 'Vera can build a machine that drinks the ground.';
  if (ids.has('elias-bell')) return 'The coffins arrived already engraved.';
  if (ids.has('mara-reed')) return 'The reinforced graves were ordered before the deaths.';
  return 'Jonah found every name in the cemetery ledger.';
}

function renderCollection(focusId = null) {
  if (!dom['zombie-roster']) return;
  const escaped = GRAVE_CATALOG.filter((grave) => M.graveProgress[grave.id].escaped);
  const focus = GRAVE_BY_ID[focusId] || GRAVE_BY_ID[G.collectionFocusId] || null;
  G.collectionFocusId = focus?.id || null;
  dom['collection-title'].textContent = 'The Risen';
  dom['town-story'].textContent = townStoryFor(escaped);
  dom['zombie-roster'].innerHTML = '';
  dom['clue-log'].innerHTML = '';

  escaped.forEach((grave) => {
    const rosterSlot = document.createElement('div');
    rosterSlot.setAttribute('role', 'listitem');
    const card = document.createElement('button');
    card.type = 'button';
    card.className = `resident-hotspot${focus?.id === grave.id ? ' current' : ''}`;
    card.dataset.residentId = grave.id;
    card.setAttribute('aria-label', `Read ${grave.name}'s recovered memory`);
    card.onclick = () => {
      G.collectionFocusId = grave.id;
      townWorld.setHover(grave.id);
      renderCollection(grave.id);
    };
    card.onpointerenter = () => townWorld.setHover(grave.id);
    card.onpointerleave = () => townWorld.setHover(null);
    card.onfocus = () => townWorld.setHover(grave.id);
    card.onblur = () => townWorld.setHover(null);
    card.innerHTML = `
      <span>${grave.name}</span>
      <small>Memory</small>`;
    rosterSlot.appendChild(card);
    dom['zombie-roster'].appendChild(rosterSlot);
  });

  const remembered = focus && M.graveProgress[focus.id].escaped ? focus : escaped[escaped.length - 1];
  const clue = document.createElement('div');
  clue.className = `clue-entry ${remembered ? 'unlocked' : 'locked'}`;
  clue.dataset.state = remembered ? 'unlocked' : 'locked';
  clue.innerHTML = remembered
    ? `<div class="clue-title"><span>${remembered.name}</span><span>remembers</span></div><div class="clue-copy">${remembered.clue}</div>`
    : '<div class="clue-title">No memory yet</div><div class="clue-copy">Bring someone home.</div>';
  dom['clue-log'].appendChild(clue);
}

function positionWorldHotspot(button, point) {
  if (!point || !point.visible) {
    button.hidden = true;
    return;
  }
  button.hidden = false;
  button.style.setProperty('--hotspot-x', `${point.x.toFixed(1)}px`);
  button.style.setProperty('--hotspot-y', `${point.y.toFixed(1)}px`);
  button.style.setProperty('--hotspot-depth', `${point.depth.toFixed(3)}`);
}

function updateTownHotspots() {
  if (G.mode === 'menu') {
    dom['grave-list']?.querySelectorAll('[data-grave-id]').forEach((button) => {
      positionWorldHotspot(button, townWorld.projectGrave(button.dataset.graveId));
    });
  } else if (G.mode === 'collection') {
    dom['zombie-roster']?.querySelectorAll('[data-resident-id]').forEach((button) => {
      positionWorldHotspot(button, townWorld.projectResident(button.dataset.residentId));
    });
  }
}

function selectGrave(id) {
  const grave = GRAVE_BY_ID[id];
  if (!grave) return;
  const status = graveStatus(grave);
  if (status === 'locked') {
    G.lastAction = { type: 'select-grave', status: 'blocked', graveId: id, reason: 'finish-first-escape' };
    if (dom['cemetery-copy']) dom['cemetery-copy'].textContent = 'Jonah must escape before this grave can wake.';
    townWorld.setHover(id);
    return;
  }
  M.activeGraveId = grave.id;
  M.grave = grave.tier; // compatibility mirror; gameplay reads activeTier().
  saveMeta();
  if (status === 'rescued') {
    G.lastAction = { type: 'open-resident', status: 'success', graveId: id };
    G.collectionFocusId = id;
    setMode('collection');
    return;
  }
  G.lastAction = { type: 'select-grave', status: 'success', graveId: id, resume: status === 'resume' };
  beginDig(status !== 'resume');
}

function openCollection(focusId = null) {
  G.collectionFocusId = focusId || M.lastRescuedId;
  renderCollection(G.collectionFocusId);
  setMode('collection');
}

/* -------------------------- observe / 3D inspect ------------------------- */
// A 3D cross-section of the WHOLE grave for observe mode: coffin lid at the bottom, the steel plate
// (if this grave has one), the ground/soil strata above, then grass + sky at the surface - the full
// stack you dig through, so you can see every layer at once.
let diorama = null;
function dioTex(paintFn, res) { const c = mkCanvas(res); paintFn(c.getContext('2d'), res); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }
function dioSlab(w, h, d, y, tex, o) {
  o = o || {};
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ map: tex, roughness: o.rough != null ? o.rough : 0.95, metalness: o.metal || 0, emissive: o.emissive || 0x000000, emissiveIntensity: o.emi || 0 }));
  m.position.set(0, y, 0); return m;
}
// a real wraparound sky (not a flat card): a big BackSide sphere, blue+clouds+sun above the
// horizon (its equator), earth-dark below - so orbiting the diorama shows sky all around.
function buildSkydome() {
  const c = mkCanvas(512), x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0.0, '#2b74bd'); g.addColorStop(0.34, '#77baea'); g.addColorStop(0.48, '#dcefff');
  g.addColorStop(0.52, '#6a5238'); g.addColorStop(0.72, '#241a12'); g.addColorStop(1, '#080605');
  x.fillStyle = g; x.fillRect(0, 0, 512, 512);
  const sg = x.createRadialGradient(360, 120, 0, 360, 120, 95); // sun
  sg.addColorStop(0, 'rgba(255,255,246,1)'); sg.addColorStop(0.4, 'rgba(255,248,220,0.55)'); sg.addColorStop(1, 'rgba(255,248,220,0)');
  x.fillStyle = sg; x.beginPath(); x.arc(360, 120, 95, 0, 6.2832); x.fill();
  x.fillStyle = '#fffef8'; x.beginPath(); x.arc(360, 120, 26, 0, 6.2832); x.fill();
  x.fillStyle = 'rgba(255,255,255,0.9)'; // clouds in the upper band
  for (const [cx, cy, cw] of [[110, 120, 130], [300, 175, 150], [440, 95, 110], [200, 70, 95]]) {
    for (let i = 0; i < 8; i++) { x.beginPath(); x.ellipse(cx + (Math.random() - 0.5) * cw, cy + (Math.random() - 0.5) * 22, cw * 0.26 * (0.6 + Math.random() * 0.6), 13 + Math.random() * 10, 0, 0, 6.2832); x.fill(); }
  }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const dome = new THREE.Mesh(new THREE.SphereGeometry(30, 40, 28), new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false }));
  dome.position.set(0, 1.55, 0); // equator (horizon) sits at the grass line
  return dome;
}
// a proper 3D toe-pincher coffin (hexagonal body + lid + cross/nameplate + iron handles), styled
// per grave so they all look distinct: lighter pine early, dark ironbound oak deeper.
function buildCoffin(grave) {
  const g = new THREE.Group();
  const tints = [0xd8b58a, 0xba8d61, 0x926c4b, 0x6f4e39, 0x54402f];
  const tint = tints[Math.min(grave - 1, tints.length - 1)];
  const woodTex = dioTex(paintWood, 512);
  const wood = () => new THREE.MeshStandardMaterial({ map: woodTex, color: tint, roughness: 0.82, metalness: 0, emissive: 0x241606, emissiveIntensity: 0.28 }); // faint self-light so it reads at the dark bottom
  const shape = (sc) => { const s = new THREE.Shape(); const p = [[-0.95, -0.14], [-0.4, -0.31], [0.92, -0.21], [0.92, 0.21], [-0.4, 0.31], [-0.95, 0.14]].map(([a, b]) => [a * sc, b * sc]); s.moveTo(p[0][0], p[0][1]); for (let i = 1; i < p.length; i++) s.lineTo(p[i][0], p[i][1]); s.closePath(); return s; };
  const body = new THREE.Mesh(new THREE.ExtrudeGeometry(shape(1), { depth: 0.36, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.035, bevelSegments: 2 }), wood());
  body.rotation.x = -Math.PI / 2; g.add(body); // adult coffin: long plan, modest shoulder width/depth
  const lid = new THREE.Mesh(new THREE.ExtrudeGeometry(shape(0.92), { depth: 0.075, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.025, bevelSegments: 2 }), wood());
  lid.rotation.x = -Math.PI / 2; lid.position.y = 0.36; g.add(lid);
  const metalTrim = new THREE.MeshStandardMaterial({ color: 0xcdb06a, metalness: 0.75, roughness: 0.35 });
  if (grave === 2) { // nameplate
    const pl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.04, 0.19), new THREE.MeshStandardMaterial({ color: 0xc9b783, metalness: 0.6, roughness: 0.4 })); pl.position.set(0.15, 0.47, 0); g.add(pl);
  } else { // cross (vertical bar runs along the coffin length = x)
    const cv = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.05, 0.08), metalTrim); cv.position.set(-0.05, 0.47, 0); g.add(cv);
    const ch = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.05, 0.25), metalTrim); ch.position.set(-0.28, 0.47, 0); g.add(ch);
  }
  const hm = new THREE.MeshStandardMaterial({ color: 0x2b2b30, metalness: 0.7, roughness: 0.45 }); // iron handles
  for (const sz of [-1, 1]) for (const hx of [-0.5, 0.35]) { const h = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.016, 8, 14), hm); h.position.set(hx, 0.18, sz * 0.28); h.rotation.x = Math.PI / 2; g.add(h); }
  if (grave >= 3) { // iron corner straps on the deepest graves
    const bm = new THREE.MeshStandardMaterial({ color: 0x3a3a42, metalness: 0.65, roughness: 0.5 });
    for (const hx of [-0.86, 0.84]) for (const sz of [-1, 1]) { const br = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.43, 0.04), bm); br.position.set(hx, 0.18, sz * 0.2); g.add(br); }
  }
  return g;
}
// diorama layout scales with the grave: grave 1 keeps the current shallow look (soil 2.9 deep, coffin
// at -2.2), and each deeper grave adds soil volume so it FEELS deeper (and takes more digs).
function dioLayout() {
  const soilTop = 1.35;
  const depth = soilDepth();                          // grave 1 = 2.9 (unchanged); deeper each grave
  const soilBottom = soilTop - depth;                 // grave 1: -1.55
  const metal = hasMetal(activeTier());
  const metalThickness = metalThicknessFor(activeTier());
  const coffinVisualHeight = 0.49;
  const metalY = soilBottom - metalThickness / 2;
  // The coffin touches the metal, and the metal touches the soil. With no
  // metal, the coffin touches soil directly; there is never a mystery gap.
  const coffinY = soilBottom - metalThickness - coffinVisualHeight;
  const grassY = soilTop + 0.11;
  return { soilTop, soilDepth: depth, soilBottom, metal, metalThickness, metalY, coffinY, grassY,
    soilY: (soilTop + soilBottom) / 2, center: (coffinY + grassY) / 2, height: grassY - coffinY };
}
function buildDiorama(showProgress = false) {
  if (diorama) { scene.remove(diorama); diorama.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } }); }
  diorama = new THREE.Group();
  const L = dioLayout(); G.dio = L;
  // how far up the shaft you've dug (0 = at the coffin, 1 = at the surface) - shown when you press 3D mid-run
  let dugFrac = 0;
  if (showProgress && G.phase === 'dirt') dugFrac = Math.min(1, (G.layer + Math.min(1, G.prog / layerCost())) / Math.max(1, G.layers));
  const W = 2.2, D = 1.4;
  const cof = buildCoffin(activeTier()); cof.position.set(0, L.coffinY, 0); cof.scale.setScalar(1.12); diorama.add(cof); // a real 3D coffin, its lid touching the soil above
  if (L.metal) {
    const steel = dioSlab(
      2.15,
      L.metalThickness,
      0.82,
      L.metalY,
      dioTex(paintMetal, 512),
      { rough: 0.42, metal: 0.72, emissive: 0x738091, emi: 0.9 },
    );
    diorama.add(steel); // thin, level-scaled steel sheet exactly between coffin and ground
    const steelEdges = new THREE.LineSegments(
      new THREE.EdgesGeometry(steel.geometry),
      new THREE.LineBasicMaterial({ color: 0xb8cee4, transparent: true, opacity: 0.9 }),
    );
    steelEdges.position.copy(steel.position);
    steelEdges.name = 'visible-thin-steel-layer-outline';
    diorama.add(steelEdges);
  }
  const soilTex = dioTex(paintSoilStrata, 512);
  soilTex.wrapT = THREE.RepeatWrapping; soilTex.repeat.set(1, Math.max(1, L.soilDepth / 2.9)); // deeper soil tiles more strata bands = more visible volume
  diorama.add(dioSlab(W, L.soilDepth, D, L.soilY, soilTex));                               // the ground you dig through
  const gc = mkCanvas(256), gx = gc.getContext('2d');                                      // grass surface strip
  gx.fillStyle = '#4a5a2a'; gx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 600; i++) { gx.strokeStyle = `rgba(${60 + Math.random() * 55},${95 + Math.random() * 65},${30 + Math.random() * 35},0.6)`; gx.lineWidth = 1; gx.beginPath(); const x = Math.random() * 256; gx.moveTo(x, 256); gx.lineTo(x + (Math.random() - 0.5) * 12, 256 - 30 - Math.random() * 50); gx.stroke(); }
  const gt = new THREE.CanvasTexture(gc); gt.colorSpace = THREE.SRGBColorSpace;
  diorama.add(dioSlab(W + 0.12, 0.22, D + 0.12, L.grassY, gt));                            // grass at the surface
  diorama.add(buildSkydome());                                                             // real wraparound sky
  // the escape shaft: the part you've DUG glows warm, the part still ahead is a faint dark channel
  const dugTop = L.soilBottom + dugFrac * L.soilDepth;
  const dugH = dugTop - L.soilBottom;
  if (dugH > 0.04) {
    const dug = new THREE.Mesh(new THREE.BoxGeometry(0.52, dugH, 0.17), new THREE.MeshStandardMaterial({ color: 0x1c1209, roughness: 1, emissive: 0xffb257, emissiveIntensity: 0.55 }));
    dug.position.set(0, (L.soilBottom + dugTop) / 2, D / 2 + 0.03); diorama.add(dug);
  }
  const remH = L.soilTop - dugTop;
  if (remH > 0.04) {
    const rem = new THREE.Mesh(new THREE.BoxGeometry(0.5, remH, 0.14), new THREE.MeshStandardMaterial({ color: 0x0b0906, roughness: 1, transparent: true, opacity: 0.4, emissive: 0x1a1206, emissiveIntensity: 0.25 }));
    rem.position.set(0, (dugTop + L.soilTop) / 2, D / 2 + 0.03); diorama.add(rem);
  }
  if (showProgress) { // a "you are here" marker at the dig face so you SEE how far up you've climbed
    const you = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffe08a }));
    you.position.set(0, dugTop, D / 2 + 0.16); diorama.add(you);
    G.dioMarker = you;
  } else { G.dioMarker = null; }
  diorama.visible = false; scene.add(diorama);
}
function enterObserve() {
  Sound.resume();
  if (G.mode === 'play') persistRun();
  G.prevMode = (G.mode === 'play') ? 'play' : 'menu';
  G.observeLiveSoil = G.prevMode === 'play' && G.phase === 'dirt';
  if (G.observeLiveSoil) {
    if (diorama) diorama.visible = false;
    soilWorld.setVisible(true);
    soilWorld.setInspecting(true);
    G.obsTarget = new THREE.Vector3(0, 0, -soilWorld.depthMeters / 2);
    G.obsDist = Math.max(4.8, soilWorld.depthMeters * 0.78 + 3.4);
  } else {
    buildDiorama(G.prevMode === 'play');
    diorama.visible = true;
    G.obsTarget = null;
    G.obsDist = G.dio ? G.dio.height * 1.35 + 1 : 5.9;
  }
  surface.mesh.visible = false; surface.backMesh.visible = false; shaft.visible = false; skyGlow.visible = false; bloom.visible = false;
  G.obsYaw = 0.7; G.obsPitch = 0.2; G.obsAuto = true;
  G._fogSave = scene.fog.density; G._ambSave = ambient.intensity; G._lampD = lamp.distance; G._lampI = lamp.intensity;
  scene.fog.density = 0.009; ambient.intensity = 1.9;
  // the headlamp must now reach a possibly-deep pit from a zoomed-out camera: extend its range + power
  const h = G.dio ? G.dio.height : 4;
  lamp.distance = Math.max(14, G.obsDist + h + 10);
  lamp.intensity = 26 * Math.max(1, (G.obsDist / 5.9) ** 1.6);
  setMode('observe');
}
function exitObserve() {
  if (diorama) diorama.visible = false;
  soilWorld.setInspecting(false);
  const returningToDirt = (G.prevMode || 'menu') === 'play' && G.phase === 'dirt';
  soilWorld.setVisible(returningToDirt);
  surface.mesh.visible = !returningToDirt;
  surface.backMesh.visible = !returningToDirt;
  shaft.visible = false; skyGlow.visible = true; bloom.visible = true;
  if (G._fogSave != null) scene.fog.density = G._fogSave;
  if (G._ambSave != null) ambient.intensity = G._ambSave;
  if (G._lampD != null) lamp.distance = G._lampD;
  if (G._lampI != null) lamp.intensity = G._lampI;
  G.observeLiveSoil = false;
  G.obsTarget = null;
  setMode(G.prevMode || 'menu');
}

// "bury process": before a fresh grave, fly the camera DOWN through the 3D cross-section (surface ->
// soil layers -> your coffin) so you see how deep you're buried, then drop into the dig.
function graveIntro(fresh) {
  Sound.resume();
  buildDiorama(); diorama.visible = true;
  soilWorld.setVisible(false);
  surface.mesh.visible = false; surface.backMesh.visible = false; shaft.visible = false; skyGlow.visible = false; bloom.visible = false; if (toolGroup) toolGroup.visible = false;
  G._fogSave = scene.fog.density; G._ambSave = ambient.intensity;
  scene.fog.density = 0.012; ambient.intensity = 1.5;
  G.introFresh = fresh; G.introT = 0;
  setMode('intro');
  callout(`${activeGrave().name} - ${t('buriedDeep', feetFor(activeTier()))}`, 4);
}
function finishIntro() {
  if (G.mode !== 'intro') return;
  if (diorama) diorama.visible = false;
  surface.mesh.visible = true; surface.backMesh.visible = true; shaft.visible = false; skyGlow.visible = true; bloom.visible = true;
  if (G._fogSave != null) scene.fog.density = G._fogSave;
  if (G._ambSave != null) ambient.intensity = G._ambSave;
  startRun(G.introFresh);
}
function beginDig(fresh) { if (fresh) graveIntro(true); else startRun(false); }

// interactive first-run tutorial: a tapping hand, then non-blocking hints as you play (no modal).
function startTutorial() {
  G.tut = 1;
  dom.callout.classList.remove('show'); calloutTimer = 0; // let the hand caption speak, not the top pill
  const h = document.getElementById('tut-hand');
  if (h) { h.querySelector('.th-cap').textContent = t('tutTap'); h.hidden = false; }
}
function tutorialTapped() { // the first claw: drop the hand + a non-blocking air hint, don't block play
  G.tut = 2;
  const h = document.getElementById('tut-hand'); if (h) h.hidden = true;
  M.seenTutorial = true; saveMeta();
  callout(t('tutAir'), 4.5);
}
function hideTutHand() { const h = document.getElementById('tut-hand'); if (h) h.hidden = true; }

/* ------------------------------ level builder ---------------------------- */
let builderDraft = null; // edited copy of the ground layers; only committed on Play
function openBuilder() { builderDraft = groundLayers().slice(); renderBuilder(); setMode('builder'); }
function builderRow(i) {
  const key = builderDraft[i], m = matProps(key);
  const row = document.createElement('div'); row.className = 'builder-row';
  const sw = document.createElement('span'); sw.className = 'mat-swatch'; sw.style.background = m.sw;
  const btn = document.createElement('button'); btn.className = 'mat-btn';
  btn.innerHTML = `${m.name}<small>depth ${i + 1} of ${builderDraft.length} - tap to change</small>`;
  btn.onclick = () => { const idx = MAT_KEYS.indexOf(key); builderDraft[i] = MAT_KEYS[(idx + 1) % MAT_KEYS.length]; renderBuilder(); };
  const rm = document.createElement('button'); rm.className = 'mat-rm'; rm.textContent = '✕';
  rm.disabled = builderDraft.length <= 1;
  rm.onclick = () => { if (builderDraft.length > 1) { builderDraft.splice(i, 1); renderBuilder(); } };
  row.append(sw, btn, rm); return row;
}
function renderBuilder() {
  const wrap = dom['builder-rows'] || document.getElementById('builder-rows'); wrap.innerHTML = '';
  const cap = (txt) => { const d = document.createElement('div'); d.className = 'builder-cap'; d.textContent = txt; return d; };
  wrap.appendChild(cap('▲ SURFACE - climb out here'));
  for (let i = builderDraft.length - 1; i >= 0; i--) wrap.appendChild(builderRow(i));
  const cf = document.createElement('div'); cf.className = 'builder-row builder-fixed';
  cf.innerHTML = `<span class="mat-swatch" style="background:${MATERIALS.coffin.sw}"></span>` +
    `<div class="mat-btn" style="cursor:default">Coffin lid<small>you wake here (always first)</small></div><span></span>`;
  wrap.appendChild(cf);
}

/* ------------------------------- helpers --------------------------------- */
function fmt(n) { n = Math.floor(n); return n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'k' : '' + n; }
const flashEl = dom.flash; let flashT = 0, flashMax = 0, flashPeak = 0;
function flash(color, peak, ms) { flashEl.style.background = color; flashEl.style.opacity = peak; flashT = ms / 1000; flashMax = ms / 1000; flashPeak = peak; }

/* ============================================================================
   MAIN LOOP
   ========================================================================== */
let last = performance.now();
function tick(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  G.totalPlay += dt;

  if (G.mode === 'play' && G.transition <= 0) {
    if (AIR_ENABLED) {
      G.air -= dt * AIR_DRAIN; // optional old air mode
      if (G.phase === 'dirt') {
        const hole = 0.3 + 0.7 * Math.min(1, G.prog / layerCost());
        G.air = Math.min(G.maxA, G.air + dt * AIR_REFILL * hole);
      }
      if (G.air <= 0) { G.air = 0; die(); }
    }
  }
  if (G.transition > 0) G.transition = Math.max(0, G.transition - dt);

  checkFreebies();
  surface.tick();
  if (G.mode === 'menu' || G.mode === 'collection') {
    townWorld.update(dt, now);
    updateTownHotspots();
  }
  if (G.mode === 'play' && G.phase === 'dirt') {
    soilWorld.update(dt);
    // A held pointer repeats the same small physical bite. Movement beyond the
    // drag threshold cancels this immediately and becomes head-look instead.
    if (soilPointer && !soilPointer.moved && now >= soilPointer.holdNextAt) {
      soilPointer.heldDig = true;
      doSoilCarve(screenUv(soilPointer.startX, soilPointer.startY));
      soilPointer.holdNextAt = now + SOIL_HOLD_REPEAT_MS;
    }
    const tunnel = updateSoilProgress();
    if (tunnel.ready && G.transition <= 0 && !G.emerging) {
      G.prog = layerCost();
      beginEscapeRun();
    }
    if (G.emerging) {
      G.emergeT = Math.min(1, G.emergeT + dt / 2.1);
      if (G.emergeT >= 1) escapeRun();
    }
  }
  // The lid is gone, but the player is still lying inside the coffin while
  // digging the entry. Keep its long walls around the view until a successful
  // Forward command actually starts the crawl.
  if (G.phase === 'dirt' && soilWorld.bodyDepth > -soilWorld.coffinDepth + 0.01) {
    G.coffinExited = true;
  }
  const showCoffinContext = G.mode === 'play' && G.phase === 'dirt' &&
    !G.coffinExited && !G.emerging;
  coffinReturn.visible = showCoffinContext;
  // Straight ahead remains open to the soil. The rear panel only enters view
  // when the player looks far sideways, completing the visible coffin shell.
  coffinBack.visible = showCoffinContext;
  metalLayerPlate.visible = currentMetalThickness > 0 && surface.mesh.visible &&
    (G.phase === 'coffin' || G.phase === 'metal') && G.mode !== 'intro' && G.mode !== 'observe';

  if (toolGroup) {
    toolGroup.visible = G.mode === 'play'; // in observe we show the layer diorama, not the tool
    toolStab = Math.max(0, toolStab - dt * 5);
    const press = toolStab; // 1 right after a tap, eases to 0 = stab in then pull back
    const tx = G.toolTX || 0;
    const ty = G.toolTY == null ? -0.78 : G.toolTY;
    const baseScale = toolGroup.userData.baseScale || 0.45;
    if (toolGroup.userData.isSprite) {
      // Camera-space hand: stable screen size while the dirt layers move behind it.
      toolGroup.position.x += (tx - toolGroup.position.x) * 0.5;
      toolGroup.position.y += (ty - toolGroup.position.y) * 0.5;
      const z = -1.18 - press * 0.64;
      toolGroup.position.z += (z - toolGroup.position.z) * 0.55;
      const isNail = toolGroup.userData.spriteKind === 'nail';
      toolGroup.rotation.z = (isNail ? -0.18 : 0) + press * 0.05 * Math.sin(now * 0.05);
      toolGroup.scale.setScalar(baseScale * (1 - press * 0.1)); // depth foreshortening on contact
    } else if (toolGroup.userData.meshKey === 'nail') {
      // The nail strikes upward through the lid in physical -Z. Its screen Y
      // remains fixed, so the motion cannot read as scratching a side wall.
      toolGroup.position.x += (tx - toolGroup.position.x) * 0.5;
      toolGroup.position.y += (ty - toolGroup.position.y) * 0.5;
      const z = -1.15 - press * 0.62;
      toolGroup.position.z += (z - toolGroup.position.z) * 0.55;
      toolGroup.rotation.set(-1.45 - press * 0.08, 0.08, press * 0.025 * Math.sin(now * 0.05));
      toolGroup.scale.setScalar(baseScale * (1 - press * 0.09));
    } else {
      toolGroup.position.x += (tx - toolGroup.position.x) * 0.5;
      toolGroup.position.y += (ty - toolGroup.position.y) * 0.5;
      const z = -1.12 - press * 0.22;
      toolGroup.position.z += (z - toolGroup.position.z) * 0.55;
      toolGroup.rotation.z = -0.4 + Math.sin(now * 0.001) * 0.04 - press * 0.2;
      toolGroup.scale.setScalar(baseScale * (1 + press * 0.025));
    }
  }

  updateDebris(dt);
  G.depthLurch = Math.max(0, (G.depthLurch || 0) - dt * 2.6);
  dust.rotation.z += dt * 0.02;
  const dpos = dustGeo.attributes.position.array;
  for (let i = 0; i < DUST_N; i++) { dpos[i * 3 + 1] -= dt * 0.05; if (dpos[i * 3 + 1] < -1.6) dpos[i * 3 + 1] = 1.6; }
  dustGeo.attributes.position.needsUpdate = true;

  // Keep digging and escape grounded in the physical world; no screen-space light flood.
  const lt = (G.mode === 'play' || G.mode === 'escaped') ? (G.lightT || 0) : 0;
  const shimmer = 1 + Math.sin(now * 0.005) * 0.06 + Math.sin(now * 0.013) * 0.03;
  bloomMat.opacity = 0;
  bloom.scale.setScalar((1.2 + lt * 1.3) * shimmer);
  dust.material.opacity = 0.32 + lt * 0.5; // motes glow when the daylight hits them
  dust.material.size = 0.018 + lt * 0.012;
  if (G.phase !== 'dirt') updateDigTunnel(now, dt);

  G.shakeT = Math.max(0, G.shakeT - dt);
  if (G.shakeT <= 0) G.shake *= 0.86;
  const airR = G.maxA > 0 ? G.air / G.maxA : 1;
  if (G.mode === 'intro') {
    camera.up.set(0, 1, 0);
    G.introT = Math.min(1, (G.introT || 0) + dt / (3.6 + (activeTier() - 1) * 0.6)); // deeper graves = a longer plunge
    const t = G.introT, e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; // easeInOut
    const endY = G.dio ? G.dio.coffinY : -2.2;
    const yaw = 0.4 + e * 1.15;
    const camY = 3.5 - e * (3.5 - endY);   // from above the surface all the way down to your coffin
    const d = 6.0 - e * 1.4;
    camera.position.set(Math.sin(yaw) * d, camY, Math.cos(yaw) * d);
    camera.lookAt(0, camY - 0.85, 0);
    lamp.position.set(camera.position.x, camera.position.y + 0.4, camera.position.z);
    if (t >= 1) finishIntro();
  } else if (G.mode === 'observe') {
    camera.up.set(0, 1, 0);
    if (G.obsAuto) G.obsYaw += dt * 0.3;              // gentle auto-spin until you grab it
    const L = G.dio || dioLayout();
    const d = G.obsDist, cp = Math.cos(G.obsPitch), sp = Math.sin(G.obsPitch);
    const target = G.obsTarget || new THREE.Vector3(0, L.center, 0);
    camera.position.set(target.x + Math.sin(G.obsYaw) * cp * d, target.y + sp * d, target.z + Math.cos(G.obsYaw) * cp * d);
    camera.lookAt(target);
    lamp.position.set(camera.position.x, camera.position.y + 0.2, camera.position.z);
  } else {
    const breathRate = G.mode === 'play' ? (2 + (1 - airR) * 6) : 1.5;
    const bob = Math.sin(now * 0.001 * breathRate) * (G.mode === 'play' ? 0.02 + (1 - airR) * 0.03 : 0.015);
    const lurch = G.depthLurch || 0;
    const physicalDirt = G.phase === 'dirt' && (G.mode === 'play' || G.mode === 'escaped');
    let targetFov = gameplayCameraFov(physicalDirt);
    if (physicalDirt) {
      const entryFov = soilEntryCoverFov();
      const passageFov = gameplayCameraFov(true);
      const passageBlend = smooth(0, 0.7, Math.max(0, soilWorld.bodyDepth));
      targetFov = entryFov + (passageFov - entryFov) * passageBlend;
    }
    if (Math.abs(camera.fov - targetFov) > 0.01) {
      camera.fov = targetFov;
      camera.updateProjectionMatrix();
    }
    G.camClimb = physicalDirt ? soilCameraTarget() : 0;
    let camZ = CAM_Z;
    G.camDip = Math.max(0, G.camDip - dt * 2.8);
    if (physicalDirt) {
      const emergeEase = smooth(0, 1, G.emergeT || 0);
      const approachStart = Math.max(0, soilWorld.depthMeters - 0.85);
      // The camera begins trailing only as manual movement reaches the final
      // stretch. Digging or breaching alone cannot change this target.
      const approachProgress = smooth(0, 1, (soilWorld.bodyDepth - approachStart) / 0.72);
      const approachLag = approachProgress * 0.62;
      const outsideZ = -soilWorld.depthMeters - 1.15;
      let targetZ = SOIL_BODY_CAMERA_OFFSET - soilWorld.bodyDepth + approachLag;
      if (G.emerging) {
        const startZ = Number.isFinite(G.escapeStartCameraZ) ? G.escapeStartCameraZ : targetZ;
        targetZ = startZ + (outsideZ - startZ) * emergeEase;
        // The emergence path begins at the exact previous-frame camera position,
        // so the aperture visibly grows and passes around the player without a cut.
        G.soilCameraZ = targetZ;
      } else if (G.mode === 'escaped') {
        targetZ = outsideZ;
      }
      const cameraSpeed = Math.max(0.78, soilWorld.depthMeters * 0.72);
      const cameraDelta = targetZ - G.soilCameraZ;
      if (!G.emerging) {
        G.soilCameraZ += Math.sign(cameraDelta) * Math.min(Math.abs(cameraDelta), cameraSpeed * dt);
      }
      const coffinRatio = Math.max(0, Math.min(1, G.soilCameraZ / SOIL_START_Z));
      const daylightRatio = Math.max(0, Math.min(1,
        (-G.soilCameraZ - (soilWorld.depthMeters - 0.38)) / 1.05,
      ));
      // Broad, even light keeps the tunnel walls readable. Depth comes from
      // geometry and strata, not a black screen-edge mask.
      ambient.color.setHex(0x5a4638);
      lamp.intensity = 4.2 + coffinRatio * 2.2 + daylightRatio * 2.2;
      lamp.distance = 3.6;
      lamp.angle = Math.PI / 3.15;
      fill.intensity = 1.15 + coffinRatio * 0.55 + daylightRatio * 0.9;
      renderer.toneMappingExposure = 1.02 + coffinRatio * 0.08 + daylightRatio * 0.12;
      const shakeX = (Math.random() - 0.5) * G.shake * 0.08;
      const shakeY = (Math.random() - 0.5) * G.shake * 0.08;
      const emergenceArc = Math.sin(Math.PI * (G.emergeT || 0));
      const cameraRouteDepth = Math.max(0, Math.min(
        soilWorld.depthMeters,
        SOIL_BODY_CAMERA_OFFSET - G.soilCameraZ,
      ));
      const cameraRoutePosition = soilWorld.routePositionAt(cameraRouteDepth);
      const bodyRoutePosition = soilWorld.routePositionAt(soilWorld.bodyDepth);
      const manualOffsetX = bodyRoutePosition ? soilWorld.playerX - bodyRoutePosition.x : 0;
      const manualOffsetY = bodyRoutePosition ? soilWorld.playerY - bodyRoutePosition.y : 0;
      const cameraX = (cameraRoutePosition?.x ?? soilWorld.playerX) + manualOffsetX;
      const cameraY = (cameraRoutePosition?.y ?? soilWorld.playerY) + manualOffsetY;
      camera.position.set(
        cameraX + shakeX + emergenceArc * 0.18,
        cameraY + bob + shakeY + emergenceArc * 0.055,
        G.soilCameraZ + G.camDip * 0.25,
      );
      const look = soilWorld.lookDirection(undefined, cameraRouteDepth);
      const outsideTurn = G.mode === 'escaped'
        ? 1
        : (G.emerging ? smooth(0, 1, ((G.emergeT || 0) - 0.38) / 0.52) : 0);
      const outsidePitchCos = Math.cos(soilWorld.pitch);
      escapeLookDirection.set(
        Math.cos(soilWorld.yaw) * outsidePitchCos,
        Math.sin(soilWorld.yaw) * outsidePitchCos,
        -Math.sin(soilWorld.pitch),
      ).normalize();
      look.lerp(escapeLookDirection, outsideTurn).normalize();
      camera.up.set(0, 1 - outsideTurn, -outsideTurn).normalize();
      camera.lookAt(camera.position.x + look.x * 3, camera.position.y + look.y * 3, camera.position.z + look.z * 3);
      lamp.position.set(camera.position.x, camera.position.y + 0.12, camera.position.z - 0.12);
      lamp.target.position.copy(camera.position).addScaledVector(look, 2.4);
      lamp.target.updateMatrixWorld();
      fill.position.set(camera.position.x - 0.3, camera.position.y + 0.25, camera.position.z + 0.22);
    } else {
      camera.up.set(0, 1, 0);
      ambient.color.setHex(0x223047);
      lamp.intensity = 26;
      lamp.distance = 14;
      lamp.angle = Math.PI / 4.2;
      fill.intensity = 6;
      renderer.toneMappingExposure = 1.05;
      camZ += G.camDip * 0.7;
      camera.position.x = (Math.random() - 0.5) * G.shake * 0.16;
      camera.position.y = bob - lurch * 0.08 + (Math.random() - 0.5) * G.shake * 0.16;
      camera.position.z = camZ;
      camera.lookAt(0, bob * 0.3 - lurch * 0.05, -lurch * 0.48);
      lamp.position.set(camera.position.x, camera.position.y + 0.15, camera.position.z - 0.2);
    }
  }

  if (calloutTimer > 0) { calloutTimer -= dt; if (calloutTimer <= 0) dom.callout.classList.remove('show'); }

  if (G.mode === 'play') {
    const r = 1 - airR;
    dom.vignette.style.opacity = '0';
    dom.panic.style.boxShadow = `inset 0 0 22dvh 4dvh rgba(150,14,8,${(Math.max(0, r - 0.6) * 0.9).toFixed(2)})`;
  } else { dom.vignette.style.opacity = '0.35'; dom.panic.style.boxShadow = 'inset 0 0 22dvh 4dvh rgba(150,14,8,0)'; }

  if (flashT > 0) { flashT -= dt; flashEl.style.opacity = Math.max(0, (flashT / flashMax) * flashPeak); }

  if (G.mode === 'play') updateHud();

  if (G.mode === 'menu' || G.mode === 'collection') townWorld.render(renderer);
  else renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

function checkFreebies() {
  const mins = G.totalPlay / 60; const milestones = [5, 15, 25];
  if (M.freebies < milestones.length && mins >= milestones[M.freebies]) {
    const grant = 25 + M.freebies * 35; M.souls += grant; M.freebies++;
    callout(t('freeSouls', grant), 2.6); saveMeta(); if (G.mode === 'play') updateHud();
  }
}

/* ============================================================================
   RESIZE
   ========================================================================== */
function gameplayCameraFov(physicalDirt = G.phase === 'dirt' && (G.mode === 'play' || G.mode === 'escaped')) {
  const aspect = Math.max(0.2, window.innerWidth / Math.max(1, window.innerHeight));
  if (!physicalDirt) return window.innerHeight > window.innerWidth ? 82 : 64;
  // Preserve at least a 70-degree narrow-axis view in the physical passage.
  // This reveals the long coffin panels and the obstacle ahead without using a
  // fisheye-like field of view on portrait screens.
  const horizontalFov = THREE.MathUtils.degToRad(70);
  const verticalFov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(horizontalFov / 2) / aspect));
  return Math.max(70, Math.min(114, verticalFov));
}
function soilEntryCoverFov() {
  const aspect = Math.max(0.2, window.innerWidth / Math.max(1, window.innerHeight));
  const distance = Math.max(0.1, SOIL_START_Z);
  // Keep generous side overdraw while the coffin is still around the player.
  // Marching-cubes edges taper inward, so fitting the raw 94% width exposed
  // dark wedges at the long coffin ends.
  const halfWidth = soilWorld.width * 0.42;
  const halfHeight = soilWorld.height * 0.47;
  const verticalForHeight = 2 * Math.atan(halfHeight / distance);
  const horizontalForWidth = 2 * Math.atan(halfWidth / distance);
  const verticalForWidth = 2 * Math.atan(Math.tan(horizontalForWidth / 2) / aspect);
  return THREE.MathUtils.radToDeg(Math.min(verticalForHeight, verticalForWidth));
}
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = gameplayCameraFov();
  camera.updateProjectionMatrix();
  fitBarrierSurfaceToViewport();
  townWorld.resize(w, h);
}
window.addEventListener('resize', resize);
document.addEventListener('visibilitychange', () => { if (document.hidden) { Sound.setMuted(true); persistRun(); } else if (!M.muted) Sound.setMuted(false); });

/* ============================================================================
   UI WIRING
   ========================================================================== */
// live sound panel: every game sound is a row that flashes as it plays; cross one out to mute it.
const SFX_LABELS = { dig: 'Dig', grave_ambient: 'Background ambience' };
function buildSfxPanel() {
  const rows = document.getElementById('sfx-rows'); if (!rows) return; rows.innerHTML = '';
  Object.keys(SFX_LABELS).forEach((key) => {
    const off = !!(M.sfxOff && M.sfxOff[key]);
    const row = document.createElement('div'); row.className = 'sfx-row' + (off ? ' off' : ''); row.dataset.key = key;
    row.innerHTML = `<button class="sfx-play"><span class="pi">&#9654;</span> ${SFX_LABELS[key]}</button><button class="sfx-x" aria-label="mute this sound">&#10007;</button>`;
    row.querySelector('.sfx-play').onclick = () => Sound.audition(key);
    row.querySelector('.sfx-x').onclick = () => {
      const muted = !(M.sfxOff && M.sfxOff[key]);
      Sound.setCategoryMuted(key, muted);
      saveMeta();
      row.classList.toggle('off', muted);
    };
    rows.appendChild(row);
  });
  Sound.onSfx((key) => {
    const row = rows.querySelector(`.sfx-row[data-key="${key}"]`);
    if (row) { row.classList.add('flash'); clearTimeout(row._ft); row._ft = setTimeout(() => row.classList.remove('flash'), 170); }
  });
}
function closeCemeteryMore() {
  const more = document.querySelector('.more-actions');
  if (more) more.removeAttribute('open');
}
function wire() {
  document.getElementById('collection-button').onclick = () => openCollection();
  document.getElementById('collection-back').onclick = () => {
    G.lastAction = { type: 'close-collection', status: 'success', graveId: M.activeGraveId };
    setMode('menu');
  };
  document.getElementById('shop-button').onclick = () => {
    G.lastEscaped = false; G._shopFromMenu = true;
    dom['shop-title'].innerHTML = 'Cemetery workshop'; dom['shop-copy'].innerHTML = 'The Risen share every tool. Spend souls to make the next rescue faster.';
    renderShop(); setMode('shop');
    document.getElementById('dig-again-button').textContent = 'Close';
  };
  document.getElementById('how-button').onclick = () => {
    closeCemeteryMore();
    renderTutorial();
    show(dom.tutorial, true);
    dom._afterTut = null;
  };

  // observe / 3D inspect
  document.getElementById('see3d-button').onclick = () => {
    closeCemeteryMore();
    enterObserve();
  };
  document.getElementById('inspect-btn').onclick = enterObserve;
  document.getElementById('obs-exit').onclick = exitObserve;

  // Legacy level builder stays available to local developers but no longer
  // competes with the authored cemetery in the player-facing menu.
  const buildButton = document.getElementById('build-button');
  if (buildButton) buildButton.onclick = () => { openBuilder(); };
  document.getElementById('builder-add').onclick = () => { if (builderDraft.length < 12) builderDraft.push('soil'); renderBuilder(); };
  document.getElementById('builder-reset').onclick = () => { builderDraft = Array(depthLayersFor(1)).fill('soil'); renderBuilder(); };
  document.getElementById('builder-back').onclick = () => { setMode('menu'); };
  document.getElementById('builder-play').onclick = () => { M.level = { ground: builderDraft.slice() }; activeProgress().run = null; saveMeta(); startRun(true); };
  document.getElementById('tut-close').onclick = () => { show(dom.tutorial, false); if (dom._afterTut) { const f = dom._afterTut; dom._afterTut = null; f(); } };

  document.getElementById('dig-again-button').onclick = () => {
    
    if (G._shopFromMenu) { G._shopFromMenu = false; setMode('menu'); return; }
    beginDig(G.lastEscaped || currentRun() === null);
  };
  document.getElementById('tab-tools').onclick = () => { shopTab = 'tools'; renderShop(); };
  document.getElementById('tab-body').onclick = () => { shopTab = 'body'; renderShop(); };
  document.getElementById('tab-cache').onclick = () => { shopTab = 'cache'; G.gacha = null; renderShop(); };

  document.getElementById('help-btn').onclick = () => { renderTutorial(); show(dom.tutorial, true); dom._afterTut = null; };
  document.getElementById('mute-btn').onclick = (e) => { M.muted = !M.muted; Sound.setMuted(M.muted); e.currentTarget.textContent = M.muted ? '\u{1F507}' : '\u{1F50A}'; saveMeta(); };
  document.getElementById('menu-btn').onclick = () => { persistRun(); setMode('menu'); };
  document.getElementById('sfx-btn').onclick = () => { Sound.resume(); document.getElementById('sfx-panel').classList.toggle('open'); };
  document.getElementById('sfx-close').onclick = () => document.getElementById('sfx-panel').classList.remove('open');
  document.getElementById('reset-button').onclick = () => {
    closeCemeteryMore();
    openResetConfirm();
  };
  document.getElementById('reset-hud-btn').onclick = openResetConfirm;
  document.getElementById('crawl-forward').onpointerdown = (e) => {
    e.preventDefault();
    if (!adjustSoilViewDepth(0.34) && soilWorld.needsWidth) {
      callout(LANG === 'ru' ? 'проход узкий - копай землю по краям' : 'passage is tight - dig the soil around the edges', 1.5);
    }
  };
  document.getElementById('crawl-back').onpointerdown = (e) => { e.preventDefault(); adjustSoilViewDepth(-0.34); };
  buildSfxPanel();

  document.getElementById('reset-yes').onclick = () => {
    localStorage.removeItem(SAVE_KEY);
    localStorage.removeItem(PREVIOUS_SAVE_KEY);
    LEGACY_SAVE_KEYS.forEach((key) => localStorage.removeItem(key));
    location.reload();
  };
  document.getElementById('reset-no').onclick = () => { setMode(G.resetReturnMode || 'menu'); };

  // tap the menu title 3x quickly to reach reset (hidden, avoids accidental wipes)
  let titleTaps = 0, titleTimer;
  dom['menu-title'].addEventListener('pointerdown', () => { titleTaps++; clearTimeout(titleTimer); titleTimer = setTimeout(() => titleTaps = 0, 800); if (titleTaps >= 3) { titleTaps = 0; openResetConfirm(); } });

  document.getElementById('mute-btn').textContent = M.muted ? '\u{1F507}' : '\u{1F50A}';
}

/* ============================================================================
   TEST HOOKS
   ========================================================================== */
function graveTextSummary(grave) {
  const progress = M.graveProgress[grave.id];
  const tier = effectiveGraveTier(grave, progress);
  return {
    id: grave.id,
    residentName: grave.name,
    profession: grave.profession,
    difficulty: grave.difficulty,
    depthFeet: feetFor(tier),
    materials: effectiveGraveMaterials(grave, progress),
    steelThickness: +metalThicknessFor(tier).toFixed(3),
    recommendedTool: grave.recommended,
    reward: grave.rewardLabel,
    status: graveStatus(grave),
    savedPhase: progress.run?.phase || null,
    savedProgress: savedRunLabel(progress, grave) || null,
    escaped: progress.escaped,
  };
}
window.render_game_to_text = () => JSON.stringify({
  mode: G.mode, screen: G.mode, phase: G.phase, grave: activeTier(), day: activeProgress().day,
  saveVersion: 9,
  totalDeaths: M.totalDeaths,
  activeGraveId: M.activeGraveId,
  activeResident: { id: activeGrave().id, name: activeGrave().name, profession: activeGrave().profession },
  cemetery: {
    unlocked: M.storyFlags.cemeteryUnlocked,
    selectionStatus: G.lastAction?.type === 'select-grave' ? G.lastAction.status : 'ready',
    graves: GRAVE_CATALOG.map(graveTextSummary),
  },
  collection: {
    count: GRAVE_CATALOG.filter((grave) => M.graveProgress[grave.id].escaped).length,
    rescuedIds: GRAVE_CATALOG.filter((grave) => M.graveProgress[grave.id].escaped).map((grave) => grave.id),
    clueIds: GRAVE_CATALOG.filter((grave) => M.graveProgress[grave.id].clueSeen).map((grave) => grave.id),
    groundSuckerBlueprint: M.storyFlags.groundSuckerBlueprint,
    lastRescuedId: M.lastRescuedId,
  },
  townWorld: townWorld.state(),
  savedGraveIds: GRAVE_CATALOG.filter((grave) => !!M.graveProgress[grave.id].run).map((grave) => grave.id),
  lastAction: G.lastAction,
  airEnabled: AIR_ENABLED, air: AIR_ENABLED ? +G.air.toFixed(1) : null, maxAir: AIR_ENABLED ? G.maxA : null, frac: +surface.frac.toFixed(3),
  workPct: Math.round(G.prog / layerCost() * 100), energy: AIR_ENABLED ? Math.ceil(G.air) : null, prog: +G.prog.toFixed(1), layerCost: layerCost(),
  layer: G.layer, layers: G.layers, souls: M.souls, runSouls: G.runSouls,
  coffinTool: COFFIN_TOOLS[M.coffinTool].name, digTool: DIG_TOOLS[M.digTool].name,
  dirtCarveMode: G.phase === 'dirt'
    ? 'persistent-volumetric-excavation'
    : (G.phase === 'coffin' ? 'full-screen-whole-lid-break' : 'full-screen-barrier-scratch'),
  dirtCameraMode: 'manual-button-body-inside-connected-volume',
  dirtInput: {
    tap: true,
    holdToRepeatSmallBites: true,
    holdDelayMs: SOIL_HOLD_DELAY_MS,
    repeatMs: SOIL_HOLD_REPEAT_MS,
    dragToLook: true,
  },
  movementAxes: ['forward', 'back'], sideMovement: false,
  soilDigSpots: G.soilDigSpots.length, soilDeepestStep: G.soilDeepestStep, lastDepthRecord: G.lastDepthRecord,
  activeSoilSpot: G.activeSoilSpot,
  soilSurface: surface.material === 'soil' ? 'buried-again-strata-carve' : surface.material,
  cameraX: +camera.position.x.toFixed(2), cameraY: +camera.position.y.toFixed(2), cameraZ: +camera.position.z.toFixed(2),
  cameraView: {
    verticalFov: +camera.fov.toFixed(1),
    horizontalFov: +THREE.MathUtils.radToDeg(2 * Math.atan(
      Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * camera.aspect,
    )).toFixed(1),
    near: camera.near,
    physicalPassage: G.phase === 'dirt' && (G.mode === 'play' || G.mode === 'escaped'),
    freeSideLook: G.phase === 'dirt',
    sideShadeOpacity: +(parseFloat(dom.vignette.style.opacity || '0') || 0).toFixed(2),
  },
  soilView: { x: +(G.soilViewX || 0).toFixed(2), y: +(G.soilViewY || 0).toFixed(2), tx: +(G.soilViewTargetX || 0).toFixed(2), ty: +(G.soilViewTargetY || 0).toFixed(2) },
  soilWorld: soilWorld.state(),
  soilCameraZ: +(G.soilCameraZ || 0).toFixed(2),
  emergence: {
    active: !!G.emerging,
    progress: +(G.emergeT || 0).toFixed(3),
    finalized: !!G.escapeFinalized,
    skyDomeVisible: soilWorld.sky.visible,
    groundVisible: soilWorld.ground.visible,
    legacyShaftVisible: shaft.visible,
  },
  coffinReturnVisible: coffinReturn.visible,
  coffinConnection: {
    inside: soilWorld.bodyDepth < 0,
    contextVisibleUntilFirstForward: true,
    exited: G.coffinExited,
    travelDepth: soilWorld.coffinDepth,
    screenLongAxis: 'x',
    screenShallowAxis: 'y',
    rotationZ: +coffinReturn.rotation.z.toFixed(3),
    lidOpeningShape: 'whole-lid',
    requiresLidWidening: false,
    interiorLength: COFFIN_INTERIOR_LENGTH,
    interiorWidth: COFFIN_INTERIOR_WIDTH,
    centerY: COFFIN_CENTER_Y,
    mouthZ: 0,
    frameNearZ: +(coffinReturn.position.z + 0.43).toFixed(3),
  },
  burialStack: {
    soilFrontZ: 0,
    metalPresent: currentMetalThickness > 0,
    metalThickness: +currentMetalThickness.toFixed(3),
    metalBackZ: 0,
    metalFrontZ: +currentMetalThickness.toFixed(3),
    coffinBackZ: +currentMetalThickness.toFixed(3),
    coffinFrontZ: +(currentMetalThickness + 0.045).toFixed(3),
    contiguous: true,
    fullPlateVisible: metalLayerPlate.visible,
    retainedRingVisible: false,
  },
  coffinBreak: {
    model: 'whole-lid-release',
    viewportFilling: G.phase === 'coffin' ? !!surface.viewportCoverage : null,
    viewportCoverage: G.phase === 'coffin' ? surface.viewportCoverage : null,
    requiresWidening: false,
    bodyPassableOnBreak: true,
    nextMaterial: G.phase === 'coffin'
      ? (hasMetal(activeTier()) ? 'steel' : 'soil')
      : (G.phase === 'metal' ? 'soil' : null),
    progress: G.phase === 'coffin' ? +Math.min(1, G.prog / layerCost()).toFixed(3) : null,
  },
  lastBarrierTransition: G.lastBarrierTransition,
  camClimb: +(G.camClimb || 0).toFixed(3),
  digTunnel: {
    visible: digTunnel.visible,
    centerLayerStackVisible: soilLayerGroup.visible,
    localHoleVisuals: localHoleVisuals.filter((h) => h.visible).length,
    opacity: +digTunnelWallMat.opacity.toFixed(2),
    soilTravel: +(G.soilTravel || 0).toFixed(2),
    soilTravelTarget: +(G.soilTravelTarget || 0).toFixed(2),
    soilViewDepth: +(G.soilViewDepth || 0).toFixed(2),
    soilViewDepthTarget: +(G.soilViewDepthTarget || 0).toFixed(2),
    soilViewDepthManual: !!G.soilViewDepthManual,
    soilTravelVel: +(G.soilTravelVel || 0).toFixed(2),
    depthLurch: +(G.depthLurch || 0).toFixed(2),
  },
  tool: toolGroup ? {
    cameraChild: toolGroup.parent === camera,
    scale: +toolGroup.scale.x.toFixed(3),
    x: +toolGroup.position.x.toFixed(2),
    y: +toolGroup.position.y.toFixed(2),
    z: +toolGroup.position.z.toFixed(2),
  } : null,
  firstPersonView: {
    perspective: 'eyes-inside-coffin',
    fullBodyVisible: false,
    digVector: '-z',
    toolRenderOrder: 100,
  },
  audio: Sound.state(),
  soilTunnel: G.soilTunnel ? {
    ready: !!G.soilTunnel.ready,
    depthReady: !!G.soilTunnel.depthReady,
    widthReady: !!G.soilTunnel.widthReady,
    progress: +G.soilTunnel.progress.toFixed(2),
    depthWork: +G.soilTunnel.depthWork.toFixed(1),
    widthWork: +G.soilTunnel.widthWork.toFixed(1),
    needDepth: +G.soilTunnel.needDepth.toFixed(1),
    needWidth: +G.soilTunnel.needWidth.toFixed(1),
    spreadX: +G.soilTunnel.spreadX.toFixed(3),
    spreadY: +G.soilTunnel.spreadY.toFixed(3),
    nearby: G.soilTunnel.nearby,
    anchor: G.soilTunnel.anchor,
  } : null,
  skyGlowOpacity: +skyGlowMat.opacity.toFixed(3),
  power: +clawPower(G.phase).toFixed(2), debris: debris.length, transition: +G.transition.toFixed(2),
  skyIntensity: +sky.intensity.toFixed(2), playSec: Math.round(G.totalPlay),
});
// dev-only state hooks (never exposed to players): enable with localStorage 'ba_dev' before load
try {
  if (localStorage.getItem('ba_dev')) {
    window.advanceTime = (ms) => { if (AIR_ENABLED && G.mode === 'play') G.air = Math.max(0, G.air - ms / 1000); };
    const projectSoilPoint = ({ x, y, z }) => {
      const point = new THREE.Vector3(x, y, z).project(camera);
      return { x: (point.x + 1) / 2, y: (point.y + 1) / 2 };
    };
    window.__buried = { G, M, surface, soilWorld, camera, coffinReturn, metalLayerPlate, startRun, breakLayer, COFFIN_TOOLS, DIG_TOOLS, Sound, doCarve, doSoilCarve, layerCost, clawPower, metalThicknessFor, coffinSurfaceContainsWorld, die, rollGacha, renderShop, openShop, enterObserve, dioLayout, adjustSoilViewDepth, projectSoilPoint };
  }
} catch (e) {}

/* ============================================================================
   BOOT
   ========================================================================== */
resize();
wire();
loadBareSprites(); // local-model hand/nail art (clean -> scraped)
surface.reset('coffin', 0, activeTier()); // paint the selected resident's lid so the menu and 3D preview agree
sky.intensity = 0; skyGlowMat.opacity = 0; ambient.intensity = 0.5; scene.fog.density = 0.10; tunnelLight.intensity = 0;
setMode('menu');
requestAnimationFrame(tick);

// land straight in the dig - no menu wall, no tutorial modal in your face
if (window.__GF_AUTOSTART) { M.seenTutorial = true; startRun(currentRun() ? false : true); }
else if (currentRun()) beginDig(false);                     // resume the exact resident and hole you were in
else if (!M.seenTutorial) { startRun(true); startTutorial(); } // FIRST TIME: straight to the coffin with a tap prompt + a hand
else setMode('menu');                                       // returning between graves: cemetery / collection / workshop
