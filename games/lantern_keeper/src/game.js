const WIDTH = 1280;
const HEIGHT = 720;

const PHASE_LENGTHS = {
  dusk: 40,
  night: 60,
};

const RESOURCE_CAP = 12;
const FUEL_CAP = { 1: 8, 2: 6, 3: 4 };
const FUEL_STATS = {
  1: { radius: 85, duration: 18 },
  2: { radius: 120, duration: 28 },
  3: { radius: 165, duration: 42 },
};

const SPAWN_INTERVALS = [10, 8, 6];
const SPIRIT_SPEED = 44;
const INTERACT_RANGE = 44;

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
canvas.width = WIDTH;
canvas.height = HEIGHT;

const ui = {
  nightLabel: document.getElementById("nightLabel"),
  phaseLabel: document.getElementById("phaseLabel"),
  timerLabel: document.getElementById("timerLabel"),
  healthLabel: document.getElementById("healthLabel"),
  spiritsLabel: document.getElementById("spiritsLabel"),
  waxCount: document.getElementById("waxCount"),
  herbCount: document.getElementById("herbCount"),
  emberCount: document.getElementById("emberCount"),
  fuel1Count: document.getElementById("fuel1Count"),
  fuel2Count: document.getElementById("fuel2Count"),
  fuel3Count: document.getElementById("fuel3Count"),
  selFuel1: document.getElementById("selFuel1"),
  selFuel2: document.getElementById("selFuel2"),
  selFuel3: document.getElementById("selFuel3"),
  craftT1: document.getElementById("craftT1"),
  craftT2: document.getElementById("craftT2"),
  craftT3: document.getElementById("craftT3"),
  overlay: document.getElementById("overlay"),
  overlayCard: document.getElementById("overlayCard"),
  startBtn: document.getElementById("startBtn"),
  toast: document.getElementById("toast"),
  touchInteract: document.getElementById("touchInteract"),
  touchCraft1: document.getElementById("touchCraft1"),
  touchCraft2: document.getElementById("touchCraft2"),
  touchCraft3: document.getElementById("touchCraft3"),
};

const world = {
  resources: [
    { type: "wax", x: 220, y: 220, cooldown: 0 },
    { type: "herb", x: 1060, y: 200, cooldown: 0 },
    { type: "ember", x: 660, y: 580, cooldown: 0 },
  ],
  mergeStation: { x: 640, y: 360, r: 32 },
  lanterns: [
    { x: 320, y: 290, tier: 0, fuel: 0 },
    { x: 500, y: 240, tier: 0, fuel: 0 },
    { x: 760, y: 250, tier: 0, fuel: 0 },
    { x: 940, y: 340, tier: 0, fuel: 0 },
    { x: 680, y: 460, tier: 0, fuel: 0 },
  ],
  graves: [
    { x: 250, y: 360, litTime: 0 },
    { x: 400, y: 440, litTime: 0 },
    { x: 560, y: 520, litTime: 0 },
    { x: 760, y: 520, litTime: 0 },
    { x: 920, y: 430, litTime: 0 },
    { x: 1040, y: 310, litTime: 0 },
  ],
  routes: [
    [
      { x: 100, y: 620 },
      { x: 340, y: 460 },
      { x: 620, y: 360 },
      { x: 980, y: 250 },
      { x: 1160, y: 110 },
    ],
    [
      { x: 100, y: 620 },
      { x: 240, y: 380 },
      { x: 520, y: 250 },
      { x: 860, y: 320 },
      { x: 1160, y: 110 },
    ],
  ],
};

const state = {
  mode: "start",
  phase: "start",
  night: 1,
  phaseTime: 0,
  health: 60,
  guided: 0,
  lost: 0,
  tended: 0,
  nightScore: 0,
  totalScore: 0,
  player: { x: 630, y: 420, r: 14, speed: 195 },
  spirits: [],
  spawnTimer: SPAWN_INTERVALS[0],
  inventory: {
    wax: 0,
    herb: 0,
    ember: 0,
    fuel1: 0,
    fuel2: 0,
    fuel3: 0,
  },
  selectedFuel: 1,
  interactPressed: false,
  keys: new Set(),
  touchDirs: new Set(),
  message: "",
  messageUntil: 0,
  time: 0,
};

function dist(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function setToast(text) {
  state.message = text;
  state.messageUntil = state.time + 1.6;
  ui.toast.textContent = text;
  ui.toast.classList.add("show");
}

function updateToast() {
  if (state.time > state.messageUntil) {
    ui.toast.classList.remove("show");
  }
}

function resetNightCounters() {
  state.guided = 0;
  state.lost = 0;
  state.tended = 0;
  state.nightScore = 0;
  state.spirits = [];
  world.graves.forEach((g) => {
    g.litTime = 0;
  });
}

function startRun() {
  state.mode = "running";
  state.night = 1;
  state.health = 60;
  state.totalScore = 0;
  state.inventory = { wax: 0, herb: 0, ember: 0, fuel1: 0, fuel2: 0, fuel3: 0 };
  world.lanterns.forEach((l) => {
    l.tier = 0;
    l.fuel = 0;
  });
  beginPhase("dusk");
  ui.overlay.classList.add("hidden");
}

function beginPhase(nextPhase) {
  state.phase = nextPhase;
  if (nextPhase === "dusk") {
    resetNightCounters();
    state.phaseTime = PHASE_LENGTHS.dusk;
    state.spawnTimer = SPAWN_INTERVALS[state.night - 1];
    setToast(`Night ${state.night}: Gather and craft fuel.`);
  }
  if (nextPhase === "night") {
    state.phaseTime = PHASE_LENGTHS.night;
    state.spawnTimer = 0;
    setToast("Nightfall: Keep the paths lit.");
  }
}

function endNight() {
  const ratioThreshold = PHASE_LENGTHS.night * 0.55;
  state.tended = world.graves.reduce((sum, grave) => sum + (grave.litTime >= ratioThreshold ? 1 : 0), 0);

  state.nightScore = state.guided * 10 - state.lost * 8 + state.tended * 6;
  state.totalScore += state.nightScore;
  state.health = clamp(state.health + Math.round(state.guided * 1.5 + state.tended - state.lost * 2), 0, 100);

  state.phase = "dawn";
  state.phaseTime = 10;

  const pass = state.guided >= state.lost;
  const canContinue = pass && state.health > 0 && state.night < 3;

  ui.overlay.classList.remove("hidden");
  ui.overlayCard.innerHTML = `
    <h1>Dawn ${state.night}</h1>
    <p>Guided: <strong>${state.guided}</strong> | Lost: <strong>${state.lost}</strong></p>
    <p>Tended Graves: <strong>${state.tended}</strong> / ${world.graves.length}</p>
    <p>Night Score: <strong>${state.nightScore}</strong></p>
    <p>Garden Health: <strong>${state.health}</strong></p>
    <button id="continueBtn">${canContinue ? "Next Night" : "View Final"}</button>
  `;

  const continueBtn = document.getElementById("continueBtn");
  continueBtn?.addEventListener("click", advanceAfterDawn);
}

function advanceAfterDawn() {
  ui.overlay.classList.add("hidden");
  if (state.health <= 0 || state.night >= 3) {
    finishRun();
    return;
  }
  state.night += 1;
  beginPhase("dusk");
}

function finishRun() {
  state.phase = "final";
  state.mode = "final";
  ui.overlay.classList.remove("hidden");
  const success = state.health > 0 && state.night >= 3;
  ui.overlayCard.innerHTML = `
    <h1>${success ? "Lanterns Kept" : "Garden Faded"}</h1>
    <p>Total Score: <strong>${state.totalScore}</strong></p>
    <p>Final Health: <strong>${state.health}</strong></p>
    <p>${success ? "The spirits found their paths." : "Too many spirits were lost."}</p>
    <button id="restartBtn">Restart Run</button>
  `;
  document.getElementById("restartBtn")?.addEventListener("click", startRun);
}

function nearMergeStation() {
  return dist(state.player, world.mergeStation) <= world.mergeStation.r + 24;
}

function craftTier1() {
  if (!nearMergeStation()) {
    setToast("Craft at the merge station.");
    return;
  }
  if (state.inventory.fuel1 >= FUEL_CAP[1]) {
    setToast("Tier 1 fuel full.");
    return;
  }
  if (state.inventory.wax < 1 || state.inventory.herb < 1 || state.inventory.ember < 1) {
    setToast("Need wax + herb + ember.");
    return;
  }
  state.inventory.wax -= 1;
  state.inventory.herb -= 1;
  state.inventory.ember -= 1;
  state.inventory.fuel1 += 1;
  setToast("Crafted Tier 1 fuel.");
}

function craftTier2() {
  if (!nearMergeStation()) {
    setToast("Craft at the merge station.");
    return;
  }
  if (state.inventory.fuel2 >= FUEL_CAP[2]) {
    setToast("Tier 2 fuel full.");
    return;
  }
  if (state.inventory.fuel1 < 2) {
    setToast("Need 2x Tier 1 fuel.");
    return;
  }
  state.inventory.fuel1 -= 2;
  state.inventory.fuel2 += 1;
  setToast("Merged Tier 2 fuel.");
}

function craftTier3() {
  if (!nearMergeStation()) {
    setToast("Craft at the merge station.");
    return;
  }
  if (state.inventory.fuel3 >= FUEL_CAP[3]) {
    setToast("Tier 3 fuel full.");
    return;
  }
  if (state.inventory.fuel2 < 2) {
    setToast("Need 2x Tier 2 fuel.");
    return;
  }
  state.inventory.fuel2 -= 2;
  state.inventory.fuel3 += 1;
  setToast("Merged Tier 3 fuel.");
}

function gatherResource() {
  for (const node of world.resources) {
    if (dist(state.player, node) <= INTERACT_RANGE && node.cooldown <= 0) {
      if (state.inventory[node.type] >= RESOURCE_CAP) {
        setToast(`${node.type} bag is full.`);
        return true;
      }
      node.cooldown = 4;
      state.inventory[node.type] += 1;
      setToast(`Collected ${node.type}.`);
      return true;
    }
  }
  return false;
}

function placeFuel() {
  const fuelKey = `fuel${state.selectedFuel}`;
  if (state.inventory[fuelKey] < 1) {
    setToast("No selected fuel available.");
    return false;
  }
  for (const lantern of world.lanterns) {
    if (dist(state.player, lantern) <= INTERACT_RANGE) {
      lantern.tier = state.selectedFuel;
      lantern.fuel = FUEL_STATS[state.selectedFuel].duration;
      state.inventory[fuelKey] -= 1;
      setToast(`Lantern fueled (T${state.selectedFuel}).`);
      return true;
    }
  }
  return false;
}

function attemptInteract() {
  if (state.mode === "start") {
    startRun();
    return;
  }
  if (state.phase === "dawn") {
    advanceAfterDawn();
    return;
  }
  if (state.mode === "final") {
    startRun();
    return;
  }
  if (placeFuel()) {
    return;
  }
  if (gatherResource()) {
    return;
  }
  if (nearMergeStation()) {
    setToast("Use craft buttons or 1/2/3 to craft.");
    return;
  }
  setToast("Nothing to interact with here.");
}

function spawnSpirit() {
  const routeIndex = Math.random() > 0.5 ? 1 : 0;
  const route = world.routes[routeIndex];
  state.spirits.push({
    routeIndex,
    segment: 0,
    t: 0,
    x: route[0].x,
    y: route[0].y,
    stress: 10,
    bob: Math.random() * Math.PI,
  });
}

function updateSpirit(spirit, dt) {
  const route = world.routes[spirit.routeIndex];
  const start = route[spirit.segment];
  const end = route[spirit.segment + 1];
  if (!end) {
    return "guided";
  }

  const segDist = Math.hypot(end.x - start.x, end.y - start.y);
  const segTime = segDist / SPIRIT_SPEED;
  spirit.t += dt / segTime;

  if (spirit.t >= 1) {
    spirit.segment += 1;
    spirit.t = 0;
    if (spirit.segment >= route.length - 1) {
      return "guided";
    }
  }

  const a = route[spirit.segment];
  const b = route[spirit.segment + 1];
  spirit.x = a.x + (b.x - a.x) * spirit.t;
  spirit.y = a.y + (b.y - a.y) * spirit.t;

  const inLight = world.lanterns.some((lantern) => {
    if (lantern.fuel <= 0 || lantern.tier === 0) {
      return false;
    }
    return Math.hypot(spirit.x - lantern.x, spirit.y - lantern.y) <= FUEL_STATS[lantern.tier].radius;
  });

  spirit.stress += inLight ? -26 * dt : 34 * dt;
  spirit.stress = clamp(spirit.stress, 0, 120);

  if (spirit.stress >= 100) {
    return "lost";
  }
  spirit.bob += dt * 2;
  return "active";
}

function updateGraves(dt) {
  for (const grave of world.graves) {
    const lit = world.lanterns.some((lantern) => {
      if (lantern.fuel <= 0 || lantern.tier === 0) {
        return false;
      }
      return Math.hypot(grave.x - lantern.x, grave.y - lantern.y) <= FUEL_STATS[lantern.tier].radius;
    });
    if (lit) {
      grave.litTime += dt;
    }
  }
}

function updatePlayer(dt) {
  const move = { x: 0, y: 0 };
  if (state.keys.has("arrowup") || state.keys.has("w") || state.touchDirs.has("up")) {
    move.y -= 1;
  }
  if (state.keys.has("arrowdown") || state.keys.has("s") || state.touchDirs.has("down")) {
    move.y += 1;
  }
  if (state.keys.has("arrowleft") || state.keys.has("a") || state.touchDirs.has("left")) {
    move.x -= 1;
  }
  if (state.keys.has("arrowright") || state.keys.has("d") || state.touchDirs.has("right")) {
    move.x += 1;
  }
  if (move.x !== 0 || move.y !== 0) {
    const n = Math.hypot(move.x, move.y);
    move.x /= n;
    move.y /= n;
    state.player.x += move.x * state.player.speed * dt;
    state.player.y += move.y * state.player.speed * dt;
  }
  state.player.x = clamp(state.player.x, 24, WIDTH - 24);
  state.player.y = clamp(state.player.y, 24, HEIGHT - 24);
}

function update(dt) {
  state.time += dt;
  updateToast();

  world.resources.forEach((node) => {
    node.cooldown = Math.max(0, node.cooldown - dt);
  });

  world.lanterns.forEach((lantern) => {
    lantern.fuel = Math.max(0, lantern.fuel - dt);
    if (lantern.fuel <= 0) {
      lantern.tier = 0;
    }
  });

  if (state.mode !== "running") {
    return;
  }

  updatePlayer(dt);

  if (state.phase === "dusk" || state.phase === "night") {
    state.phaseTime = Math.max(0, state.phaseTime - dt);
  }

  if (state.phase === "night") {
    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0) {
      spawnSpirit();
      state.spawnTimer = SPAWN_INTERVALS[state.night - 1];
    }

    const nextSpirits = [];
    for (const spirit of state.spirits) {
      const result = updateSpirit(spirit, dt);
      if (result === "guided") {
        state.guided += 1;
      } else if (result === "lost") {
        state.lost += 1;
      } else {
        nextSpirits.push(spirit);
      }
    }
    state.spirits = nextSpirits;
    updateGraves(dt);
  }

  if (state.phase === "dusk" && state.phaseTime <= 0) {
    beginPhase("night");
  }

  if (state.phase === "night" && state.phaseTime <= 0) {
    endNight();
  }

  if (state.phase === "dawn") {
    state.phaseTime = Math.max(0, state.phaseTime - dt);
    if (state.phaseTime <= 0) {
      advanceAfterDawn();
    }
  }
}

function drawMap() {
  const bg = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  bg.addColorStop(0, "#121826");
  bg.addColorStop(1, "#1c2636");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.fillStyle = "#202a32";
  ctx.fillRect(30, 40, WIDTH - 60, HEIGHT - 80);

  ctx.strokeStyle = "#3a3b44";
  ctx.lineWidth = 24;
  ctx.lineCap = "round";
  world.routes.forEach((route) => {
    ctx.beginPath();
    route.forEach((p, i) => {
      if (i === 0) {
        ctx.moveTo(p.x, p.y);
      } else {
        ctx.lineTo(p.x, p.y);
      }
    });
    ctx.stroke();
  });

  ctx.fillStyle = "#4b565f";
  world.graves.forEach((grave) => {
    ctx.fillRect(grave.x - 12, grave.y - 18, 24, 24);
    ctx.fillStyle = "#343b41";
    ctx.fillRect(grave.x - 15, grave.y + 6, 30, 4);
    ctx.fillStyle = "#4b565f";
  });

  ctx.fillStyle = "#74808a";
  ctx.beginPath();
  ctx.arc(world.mergeStation.x, world.mergeStation.y, world.mergeStation.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#1f2529";
  ctx.fillRect(world.mergeStation.x - 20, world.mergeStation.y - 4, 40, 8);

  world.resources.forEach((node) => {
    const color = node.type === "wax" ? "#f5e3b8" : node.type === "herb" ? "#7bc28f" : "#e56e3d";
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(node.x, node.y, 16, 0, Math.PI * 2);
    ctx.fill();
    if (node.cooldown > 0) {
      ctx.fillStyle = "rgba(10,12,16,0.7)";
      ctx.beginPath();
      ctx.arc(node.x, node.y, 18, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

function drawLanterns() {
  world.lanterns.forEach((lantern) => {
    ctx.fillStyle = "#7f8a95";
    ctx.fillRect(lantern.x - 5, lantern.y - 16, 10, 30);
    ctx.strokeStyle = "#7f8a95";
    ctx.strokeRect(lantern.x - 10, lantern.y - 20, 20, 18);

    if (lantern.tier > 0 && lantern.fuel > 0) {
      const stats = FUEL_STATS[lantern.tier];
      const alpha = 0.2 + (Math.sin(state.time * 3 + lantern.x) + 1) * 0.05;
      const glow = ctx.createRadialGradient(lantern.x, lantern.y - 8, 0, lantern.x, lantern.y - 8, stats.radius);
      glow.addColorStop(0, `rgba(255, 214, 129, ${0.45 + alpha})`);
      glow.addColorStop(1, "rgba(255, 214, 129, 0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(lantern.x, lantern.y - 8, stats.radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#ffd27a";
      ctx.beginPath();
      ctx.arc(lantern.x, lantern.y - 10, 6, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

function drawSpirits() {
  state.spirits.forEach((spirit) => {
    const y = spirit.y + Math.sin(spirit.bob) * 3;
    ctx.fillStyle = "rgba(184, 217, 255, 0.85)";
    ctx.beginPath();
    ctx.arc(spirit.x, y, 11, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = spirit.stress > 70 ? "#e68d8d" : "rgba(230, 243, 255, 0.8)";
    ctx.beginPath();
    ctx.arc(spirit.x, y, 14, 0, Math.PI * 2);
    ctx.stroke();
  });
}

function drawPlayer() {
  ctx.fillStyle = "#8ad3a6";
  ctx.beginPath();
  ctx.arc(state.player.x, state.player.y, state.player.r, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#2b5d45";
  ctx.beginPath();
  ctx.arc(state.player.x, state.player.y, state.player.r + 2, 0, Math.PI * 2);
  ctx.stroke();
}

function drawFog() {
  const fog = ctx.createLinearGradient(0, 0, WIDTH, 0);
  const shift = (Math.sin(state.time * 0.15) + 1) * 0.04;
  fog.addColorStop(0, `rgba(210, 225, 235, ${0.05 + shift})`);
  fog.addColorStop(0.5, "rgba(210, 225, 235, 0.09)");
  fog.addColorStop(1, `rgba(210, 225, 235, ${0.06 + shift})`);
  ctx.fillStyle = fog;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.fillStyle = "rgba(5, 7, 12, 0.4)";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
}

function drawHints() {
  ctx.fillStyle = "rgba(234, 240, 246, 0.8)";
  ctx.font = "16px Verdana";

  if (nearMergeStation()) {
    ctx.fillText("Merge Station: craft with 1/2/3", world.mergeStation.x - 110, world.mergeStation.y - 40);
  }

  const nearLantern = world.lanterns.some((l) => dist(l, state.player) <= INTERACT_RANGE);
  if (nearLantern) {
    ctx.fillText(`Press E to fuel lantern (selected T${state.selectedFuel})`, state.player.x - 120, state.player.y - 22);
  }
}

function render() {
  drawMap();
  drawLanterns();
  drawSpirits();
  drawPlayer();
  drawFog();
  drawHints();

  updateUI();
}

function updateUI() {
  ui.nightLabel.textContent = `${state.night}/3`;
  ui.phaseLabel.textContent = state.phase;
  ui.timerLabel.textContent = `${Math.ceil(state.phaseTime)}`;
  ui.healthLabel.textContent = `${state.health}`;
  ui.spiritsLabel.textContent = `${state.guided} / ${state.lost}`;

  ui.waxCount.textContent = `${state.inventory.wax}`;
  ui.herbCount.textContent = `${state.inventory.herb}`;
  ui.emberCount.textContent = `${state.inventory.ember}`;
  ui.fuel1Count.textContent = `${state.inventory.fuel1}`;
  ui.fuel2Count.textContent = `${state.inventory.fuel2}`;
  ui.fuel3Count.textContent = `${state.inventory.fuel3}`;

  [ui.selFuel1, ui.selFuel2, ui.selFuel3].forEach((button, index) => {
    button.classList.toggle("active", state.selectedFuel === index + 1);
  });
}

function gameStep(dt) {
  update(dt);
  render();
}

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  gameStep(dt);
  requestAnimationFrame(loop);
}

function keyDown(e) {
  const key = e.key.toLowerCase();
  state.keys.add(key);

  if ((key === "e" || key === "enter" || key === " ") && !state.interactPressed) {
    state.interactPressed = true;
    attemptInteract();
  }
  if (key === "1" || key === "a") {
    if (nearMergeStation() && (state.phase === "dusk" || state.phase === "night")) {
      craftTier1();
    } else {
      state.selectedFuel = 1;
    }
  }
  if (key === "2" || key === "b") {
    if (nearMergeStation() && (state.phase === "dusk" || state.phase === "night")) {
      craftTier2();
    } else {
      state.selectedFuel = 2;
    }
  }
  if (key === "3") {
    if (nearMergeStation() && (state.phase === "dusk" || state.phase === "night")) {
      craftTier3();
    } else {
      state.selectedFuel = 3;
    }
  }
  if (key === "f") {
    toggleFullscreen();
  }
}

function keyUp(e) {
  state.keys.delete(e.key.toLowerCase());
  if (e.key.toLowerCase() === "e" || e.key.toLowerCase() === "enter" || e.key === " ") {
    state.interactPressed = false;
  }
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen?.();
  } else {
    document.exitFullscreen?.();
  }
}

document.addEventListener("keydown", keyDown);
document.addEventListener("keyup", keyUp);

ui.startBtn.addEventListener("click", startRun);
ui.craftT1.addEventListener("click", craftTier1);
ui.craftT2.addEventListener("click", craftTier2);
ui.craftT3.addEventListener("click", craftTier3);
ui.selFuel1.addEventListener("click", () => {
  state.selectedFuel = 1;
});
ui.selFuel2.addEventListener("click", () => {
  state.selectedFuel = 2;
});
ui.selFuel3.addEventListener("click", () => {
  state.selectedFuel = 3;
});
ui.touchInteract.addEventListener("click", attemptInteract);
ui.touchCraft1.addEventListener("click", craftTier1);
ui.touchCraft2.addEventListener("click", craftTier2);
ui.touchCraft3.addEventListener("click", craftTier3);

document.querySelectorAll(".dpad button[data-dir]").forEach((button) => {
  const dir = button.getAttribute("data-dir");
  const press = () => state.touchDirs.add(dir);
  const release = () => state.touchDirs.delete(dir);
  button.addEventListener("touchstart", (e) => {
    e.preventDefault();
    press();
  });
  button.addEventListener("touchend", (e) => {
    e.preventDefault();
    release();
  });
  button.addEventListener("mousedown", press);
  button.addEventListener("mouseup", release);
  button.addEventListener("mouseleave", release);
});

window.render_game_to_text = () => {
  const payload = {
    coordinate_system: "origin=(0,0) top-left, +x right, +y down",
    mode: state.mode,
    phase: state.phase,
    night: state.night,
    phase_time: Number(state.phaseTime.toFixed(2)),
    player: {
      x: Number(state.player.x.toFixed(1)),
      y: Number(state.player.y.toFixed(1)),
      speed: state.player.speed,
    },
    inventory: { ...state.inventory, selected_fuel: state.selectedFuel },
    lanterns: world.lanterns.map((l) => ({
      x: l.x,
      y: l.y,
      tier: l.tier,
      fuel: Number(l.fuel.toFixed(1)),
    })),
    spirits: state.spirits.map((s) => ({
      x: Number(s.x.toFixed(1)),
      y: Number(s.y.toFixed(1)),
      stress: Number(s.stress.toFixed(1)),
      route: s.routeIndex,
    })),
    guided: state.guided,
    lost: state.lost,
    health: state.health,
    score: state.totalScore,
  };
  return JSON.stringify(payload);
};

window.advanceTime = (ms) => {
  const step = 1000 / 60;
  const steps = Math.max(1, Math.round(ms / step));
  for (let i = 0; i < steps; i += 1) {
    gameStep(1 / 60);
  }
};

requestAnimationFrame(loop);
