(() => {
  "use strict";

  const WORLD_W = 1280;
  const WORLD_H = 720;
  const FLOOR_Y = 644;
  const GRAVITY = 1320;
  const AIR = 0.996;
  const RESTITUTION = 0.38;
  const FRICTION = 0.82;

  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d", { alpha: false });
  const shell = document.getElementById("gameShell");
  const toolPanel = document.getElementById("toolPanel");
  const releaseBtn = document.getElementById("releaseBtn");
  const resetBtn = document.getElementById("resetBtn");
  const nextBtn = document.getElementById("nextBtn");
  const levelLabel = document.getElementById("levelLabel");
  const contractText = document.getElementById("contractText");
  const scorePill = document.getElementById("scorePill");
  const comboPill = document.getElementById("comboPill");
  const tokenPill = document.getElementById("tokenPill");
  const goalPill = document.getElementById("goalPill");
  const accessibleState = document.getElementById("accessibleState");
  const upgradeButtons = {
    mass: document.getElementById("massUpgrade"),
    pulse: document.getElementById("pulseUpgrade"),
    spring: document.getElementById("springUpgrade"),
  };

  const TOOLS = [
    { id: "pulse", label: "Bomb", icon: "!", color: "#e94f37", title: "Explodes when the dummy hits it" },
    { id: "spring", label: "Spring", icon: "^", color: "#4a9f4f", title: "Launches bodies upward" },
    { id: "ramp", label: "Chute", icon: "/", color: "#137c8b", title: "Redirects the crash path" },
    { id: "magnet", label: "Hammer", icon: "T", color: "#6653b6", title: "Spins debris back into the chain" },
    { id: "drop", label: "Anvil", icon: "v", color: "#f7b32b", title: "Drops a heavy anvil after launch" },
  ];

  const LEVELS = [
    {
      name: "Lobby Trap Test",
      contract: "Launch the dummy, break 70%, and hit a x2.5 combo with six toys.",
      threshold: 0.7,
      comboGoal: 2.5,
      budget: { pulse: 2, spring: 1, ramp: 2, magnet: 1, drop: 0 },
      blocks: [
        ...wall(735, 518, 5, 3, 58, 38, "glass"),
        ...tower(940, 500, 3, 4, 48, 42, "crate"),
        block(820, 390, 216, 26, "beam"),
        block(780, 318, 132, 22, "glass"),
        block(920, 310, 90, 22, "target"),
      ],
      dummies: [
        { x: 905, y: 430 },
        { x: 1015, y: 440 },
      ],
    },
    {
      name: "Office Wreck Test",
      contract: "Clear the red cores by folding the office tower into itself.",
      threshold: 0.76,
      comboGoal: 3.0,
      budget: { pulse: 2, spring: 2, ramp: 1, magnet: 1, drop: 1 },
      blocks: [
        ...tower(770, 504, 4, 5, 52, 36, "crate"),
        ...tower(1010, 504, 3, 5, 58, 36, "glass"),
        block(742, 296, 282, 26, "beam"),
        block(890, 252, 144, 24, "target"),
        block(1030, 214, 80, 24, "target"),
      ],
      dummies: [
        { x: 870, y: 430 },
        { x: 1085, y: 424 },
      ],
    },
    {
      name: "Hammer Yard",
      contract: "Use the spinning hammer and falling anvils to make a long debris chain.",
      threshold: 0.82,
      comboGoal: 3.5,
      budget: { pulse: 1, spring: 1, ramp: 2, magnet: 2, drop: 2 },
      blocks: [
        ...wall(690, 540, 4, 3, 56, 34, "metal"),
        ...wall(930, 498, 5, 4, 52, 36, "metal"),
        block(722, 386, 138, 24, "beam"),
        block(940, 318, 210, 24, "beam"),
        block(1044, 266, 82, 24, "target"),
        block(820, 450, 72, 28, "target"),
      ],
      dummies: [
        { x: 755, y: 462 },
        { x: 1000, y: 404 },
        { x: 1105, y: 392 },
      ],
    },
  ];

  const MATERIALS = {
    glass: { hp: 26, mass: 0.9, color: "#92d6e7", edge: "#3a8ea0", score: 18 },
    crate: { hp: 42, mass: 1.2, color: "#c88b53", edge: "#875333", score: 22 },
    beam: { hp: 70, mass: 1.8, color: "#596d79", edge: "#263742", score: 34 },
    metal: { hp: 58, mass: 1.5, color: "#8c9aa7", edge: "#43505b", score: 28 },
    target: { hp: 46, mass: 1.1, color: "#e94f37", edge: "#8f2f22", score: 90 },
  };

  const FX_TIERS = [
    { name: "common", weight: 16, burst: 1 },
    { name: "uncommon", weight: 8, burst: 1.2 },
    { name: "rare", weight: 4, burst: 1.45 },
    { name: "epic", weight: 2, burst: 1.8 },
    { name: "legendary", weight: 1, burst: 2.25 },
  ];
  const FX_TOTAL = FX_TIERS.reduce((sum, tier) => sum + tier.weight, 0);

  let rect = { width: Math.max(1, window.innerWidth), height: Math.max(1, window.innerHeight) };
  let rafId = 0;
  let lastNow = 0;
  let runningLoop = true;
  let pointer = { x: 0, y: 0, active: false, valid: false };
  let audioCtx = null;

  const state = {
    mode: "build",
    levelIndex: 0,
    selectedTool: "pulse",
    blocks: [],
    bodies: [],
    gadgets: [],
    particles: [],
    floaters: [],
    ball: null,
    score: 0,
    bestCombo: 1,
    combo: 1,
    comboTimer: 0,
    elapsed: 0,
    cleared: false,
    runSettled: false,
    tokens: 0,
    upgrades: { mass: 0, pulse: 0, spring: 0 },
    budget: {},
    placed: {},
    brokenBlocks: 0,
    totalBlocks: 0,
    targetBroken: 0,
    totalTargets: 0,
    message: "Build a dummy trap chain.",
  };

  loadSave();
  setupTools();
  bindEvents();
  resetLevel();
  resize();
  requestAnimationFrame(loop);

  function block(x, y, w, h, material) {
    return { x, y, w, h, material };
  }

  function wall(x, y, cols, rows, w, h, material) {
    const arr = [];
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const offset = r % 2 ? w * 0.34 : 0;
        arr.push(block(x + c * (w + 4) + offset, y - r * (h + 4), w, h, material));
      }
    }
    return arr;
  }

  function tower(x, y, cols, rows, w, h, material) {
    const arr = [];
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        arr.push(block(x + c * (w + 5), y - r * (h + 5), w, h, material));
      }
    }
    return arr;
  }

  function setupTools() {
    const frag = document.createDocumentFragment();
    for (const tool of TOOLS) {
      const btn = document.createElement("button");
      btn.className = "toolBtn";
      btn.type = "button";
      btn.dataset.tool = tool.id;
      btn.title = tool.title;
      btn.innerHTML = `<span class="icon">${tool.icon}</span><span class="label">${tool.label}</span><span class="count">0 left</span>`;
      btn.addEventListener("click", () => {
        state.selectedTool = tool.id;
        updateHud();
      });
      frag.appendChild(btn);
    }
    toolPanel.appendChild(frag);
  }

  function bindEvents() {
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", () => {
      runningLoop = !document.hidden;
      if (runningLoop) {
        lastNow = performance.now();
        requestAnimationFrame(loop);
      }
    });
    shell.addEventListener("contentvisibilityautostatechange", (event) => {
      runningLoop = !event.skipped;
      if (runningLoop) {
        lastNow = performance.now();
        requestAnimationFrame(loop);
      }
    });
    canvas.addEventListener("contextmenu", (event) => event.preventDefault());
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    releaseBtn.addEventListener("click", releaseRun);
    resetBtn.addEventListener("click", resetLevel);
    nextBtn.addEventListener("click", nextLevel);
    upgradeButtons.mass.addEventListener("click", () => buyUpgrade("mass"));
    upgradeButtons.pulse.addEventListener("click", () => buyUpgrade("pulse"));
    upgradeButtons.spring.addEventListener("click", () => buyUpgrade("spring"));
    window.addEventListener("keydown", (event) => {
      if (event.repeat) return;
      const key = event.key.toLowerCase();
      if (key === " ") {
        event.preventDefault();
        releaseRun();
      } else if (key === "r") {
        resetLevel();
      } else if (key === "n") {
        nextLevel();
      } else if (key === "f") {
        toggleFullscreen();
      } else if (["1", "2", "3", "4", "5"].includes(key)) {
        state.selectedTool = TOOLS[Number(key) - 1].id;
        updateHud();
      }
    });
  }

  function resize() {
    rect = canvas.getBoundingClientRect();
    const dpr = Math.max(1, Math.min(2.5, window.devicePixelRatio || 1));
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    render();
  }

  function worldScale() {
    return Math.min(rect.width / WORLD_W, rect.height / WORLD_H);
  }

  function viewOffset() {
    const portrait = rect.width < 720 && rect.height > rect.width * 1.2;
    const s = portrait ? Math.max(worldScale(), Math.min(rect.width / 1000, rect.height / 760)) : worldScale();
    const cameraX = portrait ? 560 : WORLD_W * 0.5;
    return {
      s,
      ox: portrait ? rect.width * 0.5 - cameraX * s : (rect.width - WORLD_W * s) * 0.5,
      oy: portrait ? (rect.height - WORLD_H * s) * 0.52 : (rect.height - WORLD_H * s) * 0.5,
    };
  }

  function screenToWorld(event) {
    const box = canvas.getBoundingClientRect();
    const v = viewOffset();
    return {
      x: (event.clientX - box.left - v.ox) / v.s,
      y: (event.clientY - box.top - v.oy) / v.s,
    };
  }

  function onPointerDown(event) {
    event.preventDefault();
    resumeAudio();
    const p = screenToWorld(event);
    pointer = { x: p.x, y: p.y, active: true, valid: inBuildArea(p.x, p.y) };
    if (state.mode === "build" && pointer.valid) {
      placeGadget(p.x, p.y);
    }
  }

  function onPointerMove(event) {
    const p = screenToWorld(event);
    pointer = { x: p.x, y: p.y, active: pointer.active, valid: inBuildArea(p.x, p.y) };
  }

  function onPointerUp() {
    pointer.active = false;
  }

  function inBuildArea(x, y) {
    return x > 250 && x < 1180 && y > 140 && y < FLOOR_Y - 22;
  }

  function resetLevel() {
    const level = LEVELS[state.levelIndex];
    state.mode = "build";
    state.blocks = level.blocks.map((src, i) => makeBlock(src, i));
    state.bodies = level.dummies.flatMap((src, i) => makeDummy(src.x, src.y, i));
    state.gadgets = [];
    state.particles = [];
    state.floaters = [];
    state.ball = null;
    state.score = 0;
    state.bestCombo = 1;
    state.combo = 1;
    state.comboTimer = 0;
    state.elapsed = 0;
    state.cleared = false;
    state.runSettled = false;
    state.message = "Place trap toys around the dummy course.";
    state.budget = { ...level.budget };
    state.placed = { pulse: 0, spring: 0, ramp: 0, magnet: 0, drop: 0 };
    state.brokenBlocks = 0;
    state.totalBlocks = state.blocks.length;
    state.totalTargets = state.blocks.filter((b) => b.material === "target").length;
    state.targetBroken = 0;
    updateHud();
    render();
  }

  function makeBlock(src, id) {
    const mat = MATERIALS[src.material];
    return {
      id,
      kind: "block",
      material: src.material,
      x: src.x,
      y: src.y,
      w: src.w,
      h: src.h,
      vx: 0,
      vy: 0,
      angle: 0,
      va: 0,
      hp: mat.hp,
      maxHp: mat.hp,
      mass: mat.mass,
      alive: true,
      dynamic: false,
      settled: false,
      hitFlash: 0,
    };
  }

  function makeDummy(x, y, id) {
    const parts = [
      { name: "head", x, y: y - 64, r: 15, hp: 40, color: "#f7d6ad" },
      { name: "torso", x, y: y - 32, r: 20, hp: 60, color: "#5aa9e6" },
      { name: "hip", x, y: y + 4, r: 17, hp: 55, color: "#546a7b" },
      { name: "leftArm", x: x - 28, y: y - 32, r: 11, hp: 35, color: "#f7d6ad" },
      { name: "rightArm", x: x + 28, y: y - 32, r: 11, hp: 35, color: "#f7d6ad" },
      { name: "leftLeg", x: x - 16, y: y + 40, r: 12, hp: 38, color: "#30343f" },
      { name: "rightLeg", x: x + 16, y: y + 40, r: 12, hp: 38, color: "#30343f" },
    ];
    return parts.map((part) => ({
      ...part,
      id: `d${id}-${part.name}`,
      kind: "dummy",
      dummyId: id,
      vx: 0,
      vy: 0,
      mass: part.r / 11,
      alive: true,
      grabbed: false,
      hitFlash: 0,
    }));
  }

  function placeGadget(x, y) {
    const tool = state.selectedTool;
    const left = (state.budget[tool] || 0) - (state.placed[tool] || 0);
    if (left <= 0) {
      state.message = "No more " + tool + " gadgets in this contract.";
      updateHud();
      return;
    }
    const snap = tool === "ramp" || tool === "spring" ? 10 : 1;
    const gadget = {
      id: `g${state.gadgets.length}`,
      tool,
      x: Math.round(x / snap) * snap,
      y: Math.round(y / snap) * snap,
      age: 0,
      armed: true,
      used: false,
      angle: tool === "ramp" && x > WORLD_W * 0.64 ? -1 : 1,
    };
    if (tool === "drop") {
      gadget.y = Math.min(gadget.y, 230);
    }
    state.gadgets.push(gadget);
    state.placed[tool] = (state.placed[tool] || 0) + 1;
    state.message = TOOLS.find((t) => t.id === tool).label + " placed.";
    updateHud();
  }

  function releaseRun() {
    if (state.mode !== "build") return;
    resumeAudio();
    const massBoost = state.upgrades.mass * 0.24;
    state.ball = {
      kind: "ball",
      x: 126,
      y: 382,
      r: 28 + state.upgrades.mass * 2,
      vx: 920 + state.upgrades.mass * 56,
      vy: -120,
      mass: 4.2 + massBoost,
      alive: true,
      trail: [],
    };
    state.mode = "running";
    state.elapsed = 0;
    state.message = "Dummy launched.";
    updateHud();
  }

  function nextLevel() {
    state.levelIndex = (state.levelIndex + 1) % LEVELS.length;
    resetLevel();
  }

  function buyUpgrade(type) {
    const cost = 3 + state.upgrades[type] * 2;
    if (state.tokens < cost) {
      state.message = "Need " + cost + " coins.";
      updateHud();
      return;
    }
    state.tokens -= cost;
    state.upgrades[type] += 1;
    state.message = type[0].toUpperCase() + type.slice(1) + " upgraded.";
    saveGame();
    updateHud();
  }

  function update(dt) {
    dt = Math.min(dt, 1 / 30);
    state.elapsed += dt;
    state.comboTimer -= dt;
    if (state.comboTimer <= 0) {
      state.combo = Math.max(1, state.combo - dt * 1.8);
    }
    if (state.mode === "running") {
      updateGadgets(dt);
      if (state.ball && state.ball.alive) updateBall(state.ball, dt);
      updateBlocks(dt);
      updateDummies(dt);
      resolveCollisions(dt);
      checkClearState();
    } else {
      updateIdleDummies(dt);
    }
    updateParticles(dt);
    updateFloaters(dt);
    updateHud();
  }

  function updateGadgets(dt) {
    for (const gadget of state.gadgets) {
      gadget.age += dt;
      if (gadget.tool === "magnet" && !gadget.used) {
        applyMagnet(gadget, dt);
      }
      if (gadget.tool === "drop" && state.elapsed > 0.55 && gadget.armed) {
        gadget.armed = false;
        const puck = makeBlock({ x: gadget.x - 28, y: gadget.y, w: 56, h: 56, material: "metal" }, state.blocks.length);
        puck.dynamic = true;
        puck.vy = 420;
        puck.va = 2.2;
        state.blocks.push(puck);
        state.totalBlocks += 1;
        spawnFloater(gadget.x, gadget.y, "DROP", "#a16b00");
      }
    }
  }

  function updateBall(ball, dt) {
    ball.trail.push({ x: ball.x, y: ball.y });
    if (ball.trail.length > 16) ball.trail.shift();
    ball.vy += GRAVITY * dt;
    ball.vx *= AIR;
    ball.vy *= AIR;
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    collideCircleWorld(ball);
    if (ball.x > WORLD_W + 100 || ball.y > WORLD_H + 220) {
      ball.alive = false;
    }
  }

  function updateBlocks(dt) {
    for (const b of state.blocks) {
      if (!b.alive || !b.dynamic) continue;
      b.vy += GRAVITY * dt;
      b.vx *= AIR;
      b.vy *= AIR;
      b.va *= 0.992;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.angle += b.va * dt;
      collideRectWorld(b);
      b.hitFlash = Math.max(0, b.hitFlash - dt * 5);
    }
  }

  function updateDummies(dt) {
    for (const p of state.bodies) {
      if (!p.alive) continue;
      p.vy += GRAVITY * dt;
      p.vx *= 0.993;
      p.vy *= 0.993;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      collideCircleWorld(p);
      p.hitFlash = Math.max(0, p.hitFlash - dt * 5);
    }
    for (let i = 0; i < 5; i += 1) constrainDummies();
  }

  function updateIdleDummies(dt) {
    const t = performance.now() * 0.001;
    for (const p of state.bodies) {
      if (!p.alive) continue;
      if (p.name === "head") p.y += Math.sin(t * 2 + p.dummyId) * dt * 2;
    }
  }

  function constrainDummies() {
    const pairs = [
      ["head", "torso", 34],
      ["torso", "hip", 38],
      ["torso", "leftArm", 32],
      ["torso", "rightArm", 32],
      ["hip", "leftLeg", 38],
      ["hip", "rightLeg", 38],
    ];
    const byDummy = new Map();
    for (const p of state.bodies) {
      if (!p.alive) continue;
      if (!byDummy.has(p.dummyId)) byDummy.set(p.dummyId, new Map());
      byDummy.get(p.dummyId).set(p.name, p);
    }
    for (const parts of byDummy.values()) {
      for (const [aName, bName, dist] of pairs) {
        const a = parts.get(aName);
        const b = parts.get(bName);
        if (!a || !b) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.max(0.001, Math.hypot(dx, dy));
        const diff = (d - dist) / d;
        const push = diff * 0.5;
        a.x += dx * push;
        a.y += dy * push;
        b.x -= dx * push;
        b.y -= dy * push;
      }
    }
  }

  function resolveCollisions(dt) {
    const movers = allMovers();
    for (const gadget of state.gadgets) {
      if (gadget.used && gadget.tool !== "spring" && gadget.tool !== "ramp" && gadget.tool !== "magnet") continue;
      for (const mover of movers) {
        if (gadget.tool === "pulse" && gadget.armed && dist(mover.x, mover.y, gadget.x, gadget.y) < (mover.r || 32) + 24) {
          gadget.armed = false;
          gadget.used = true;
          explode(gadget.x, gadget.y, 145 + state.upgrades.pulse * 24, 760 + state.upgrades.pulse * 80, "pulse");
        } else if (gadget.tool === "spring") {
          springCollide(gadget, mover);
        } else if (gadget.tool === "ramp") {
          rampCollide(gadget, mover);
        }
      }
    }

    if (state.ball && state.ball.alive) {
      for (const b of state.blocks) {
        if (b.alive) circleRectImpact(state.ball, b, dt);
      }
      for (const part of state.bodies) {
        if (part.alive) circleCircleImpact(state.ball, part, 1.05);
      }
    }

    for (const b of state.blocks) {
      if (!b.alive || !b.dynamic) continue;
      for (const other of state.blocks) {
        if (b === other || !other.alive) continue;
        rectRectImpact(b, other);
      }
      for (const part of state.bodies) {
        if (part.alive) circleRectImpact(part, b, dt);
      }
    }
  }

  function allMovers() {
    const movers = [];
    if (state.ball && state.ball.alive) movers.push(state.ball);
    for (const b of state.blocks) {
      if (b.alive && b.dynamic) {
        movers.push({
          kind: "blockMover",
          x: b.x + b.w * 0.5,
          y: b.y + b.h * 0.5,
          r: Math.max(b.w, b.h) * 0.5,
          vx: b.vx,
          vy: b.vy,
          mass: b.mass,
          source: b,
        });
      }
    }
    for (const p of state.bodies) {
      if (p.alive) movers.push(p);
    }
    return movers;
  }

  function springCollide(gadget, mover) {
    if (Math.abs(mover.x - gadget.x) > 68 || Math.abs(mover.y - gadget.y) > 28) return;
    if (mover.vy < -80 && mover.y < gadget.y) return;
    const impulse = 760 + state.upgrades.spring * 90;
    mover.vy = -impulse;
    mover.vx += (mover.x < gadget.x ? -1 : 1) * 140;
    if (mover.source) {
      mover.source.vy = mover.vy;
      mover.source.vx += mover.vx * 0.25;
      mover.source.dynamic = true;
    }
    gadget.used = true;
    addCombo(0.28, gadget.x, gadget.y - 18, "SPRING", "#4a9f4f");
    burst(gadget.x, gadget.y - 8, "#a3d977", 10, 1.2);
  }

  function rampCollide(gadget, mover) {
    if (Math.abs(mover.x - gadget.x) > 70 || Math.abs(mover.y - gadget.y) > 55) return;
    const dir = gadget.angle;
    const speed = Math.hypot(mover.vx, mover.vy);
    if (speed < 70) return;
    mover.vx = Math.max(260, Math.abs(mover.vx)) * dir;
    mover.vy = -Math.max(220, Math.abs(mover.vy) * 0.62);
    if (mover.source) {
      mover.source.vx = mover.vx;
      mover.source.vy = mover.vy;
      mover.source.dynamic = true;
    }
    gadget.used = true;
    burst(gadget.x, gadget.y, "#4fb3bf", 8, 1);
  }

  function circleRectImpact(circle, rectObj, dt) {
    if (!rectObj.alive) return;
    const cx = clamp(circle.x, rectObj.x, rectObj.x + rectObj.w);
    const cy = clamp(circle.y, rectObj.y, rectObj.y + rectObj.h);
    const dx = circle.x - cx;
    const dy = circle.y - cy;
    const rr = (circle.r || 14) * (circle.r || 14);
    if (dx * dx + dy * dy > rr) return;
    const speed = Math.hypot(circle.vx, circle.vy);
    const impact = speed * (circle.mass || 1) * 0.028;
    if (impact < 4) return;
    rectObj.dynamic = true;
    rectObj.vx += circle.vx * 0.13 / rectObj.mass;
    rectObj.vy += circle.vy * 0.1 / rectObj.mass - 44 * dt;
    rectObj.va += (circle.x < rectObj.x + rectObj.w * 0.5 ? 1 : -1) * impact * 0.02;
    if (circle.kind === "ball") {
      circle.vx *= 0.78;
      circle.vy *= 0.72;
    } else {
      circle.vx *= -0.18;
      circle.vy *= -0.12;
    }
    damageBlock(rectObj, impact, cx, cy);
  }

  function rectRectImpact(a, b) {
    if (!a.alive || !b.alive) return;
    if (a.x > b.x + b.w || a.x + a.w < b.x || a.y > b.y + b.h || a.y + a.h < b.y) return;
    const speed = Math.hypot(a.vx - b.vx, a.vy - b.vy);
    const impact = speed * a.mass * 0.018;
    if (impact < 6) return;
    b.dynamic = true;
    b.vx += a.vx * 0.08 / b.mass;
    b.vy += a.vy * 0.06 / b.mass;
    a.vx *= -0.2;
    damageBlock(b, impact, (a.x + b.x) * 0.5, (a.y + b.y) * 0.5);
  }

  function circleCircleImpact(a, b, multiplier) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const minD = (a.r || 12) + (b.r || 12);
    const d2 = dx * dx + dy * dy;
    if (d2 > minD * minD || d2 < 0.001) return;
    const d = Math.sqrt(d2);
    const nx = dx / d;
    const ny = dy / d;
    const overlap = minD - d;
    a.x -= nx * overlap * 0.35;
    a.y -= ny * overlap * 0.35;
    b.x += nx * overlap * 0.65;
    b.y += ny * overlap * 0.65;
    const rvx = a.vx - b.vx;
    const rvy = a.vy - b.vy;
    const closing = rvx * nx + rvy * ny;
    if (closing < 0) return;
    const impulse = closing * 0.74 * multiplier;
    a.vx -= nx * impulse * 0.42;
    a.vy -= ny * impulse * 0.42;
    b.vx += nx * impulse * 0.75;
    b.vy += ny * impulse * 0.75;
    const hit = impulse * 0.08;
    if (b.kind === "dummy" && hit > 5) damageDummy(b, hit, b.x, b.y);
  }

  function damageBlock(b, amount, x, y) {
    if (!b.alive) return;
    b.hp -= amount;
    b.hitFlash = 1;
    burst(x, y, MATERIALS[b.material].edge, Math.ceil(amount * 0.35), 0.65);
    addCombo(0.08 + amount * 0.002, x, y, "+" + Math.round(amount), MATERIALS[b.material].edge);
    if (b.hp <= 0) breakBlock(b, x, y);
  }

  function damageDummy(part, amount, x, y) {
    part.hp -= amount;
    part.hitFlash = 1;
    addScore(Math.round(amount * 1.7), x, y, "BOT");
    burst(x, y, "#5aa9e6", Math.ceil(amount * 0.35), 0.7);
    if (part.hp <= 0 && part.alive) {
      part.alive = false;
      addCombo(0.22, x, y, "JOINT", "#5aa9e6");
    }
  }

  function breakBlock(b, x, y) {
    b.alive = false;
    state.brokenBlocks += 1;
    if (b.material === "target") state.targetBroken += 1;
    const mat = MATERIALS[b.material];
    const tier = rollFxTier();
    const burstScale = tier.burst;
    burst(x, y, mat.color, 18, burstScale);
    burst(x, y, mat.edge, 14, burstScale);
    addScore(Math.round(mat.score * state.combo), x, y, b.material === "target" ? "CORE" : "BREAK");
    if (tier.name === "rare" || tier.name === "epic" || tier.name === "legendary") {
      spawnFloater(x, y - 24, tier.name.toUpperCase(), "#f7b32b");
    }
    playPop(tier);
  }

  function explode(x, y, radius, force, label) {
    burst(x, y, "#e94f37", 40, 1.6);
    burst(x, y, "#f7b32b", 24, 1.4);
    for (const b of state.blocks) {
      if (!b.alive) continue;
      const cx = b.x + b.w * 0.5;
      const cy = b.y + b.h * 0.5;
      const dx = cx - x;
      const dy = cy - y;
      const d = Math.max(1, Math.hypot(dx, dy));
      if (d < radius) {
        const f = (1 - d / radius) * force;
        b.dynamic = true;
        b.vx += (dx / d) * f / b.mass;
        b.vy += (dy / d) * f / b.mass - f * 0.22;
        damageBlock(b, f * 0.027, cx, cy);
      }
    }
    for (const p of state.bodies) {
      if (!p.alive) continue;
      const dx = p.x - x;
      const dy = p.y - y;
      const d = Math.max(1, Math.hypot(dx, dy));
      if (d < radius) {
        const f = (1 - d / radius) * force;
        p.vx += (dx / d) * f / p.mass;
        p.vy += (dy / d) * f / p.mass - f * 0.16;
        damageDummy(p, f * 0.014, p.x, p.y);
      }
    }
    if (state.ball && state.ball.alive) {
      const dx = state.ball.x - x;
      const dy = state.ball.y - y;
      const d = Math.max(1, Math.hypot(dx, dy));
      if (d < radius) {
        const f = (1 - d / radius) * force;
        state.ball.vx += (dx / d) * f / state.ball.mass;
        state.ball.vy += (dy / d) * f / state.ball.mass;
      }
    }
    addCombo(0.44, x, y, label.toUpperCase(), "#e94f37");
    playPop({ name: "epic", burst: 1.5 });
  }

  function addScore(points, x, y, label) {
    state.score += Math.max(0, Math.round(points));
    addCombo(0.16, x, y, label, "#17212b");
  }

  function addCombo(amount, x, y, label, color) {
    state.combo = clamp(state.combo + amount, 1, 9.9);
    state.bestCombo = Math.max(state.bestCombo, state.combo);
    state.comboTimer = 1.25;
    spawnFloater(x, y, label, color);
  }

  function applyMagnet(gadget, dt) {
    const pullMover = (body, x, y, scale) => {
      const dx = gadget.x - x;
      const dy = gadget.y - y;
      const d2 = dx * dx + dy * dy;
      const radius = 178;
      if (d2 <= 1 || d2 >= radius * radius) return null;
      const d = Math.sqrt(d2);
      const pull = (1 - d / radius) * 440 * scale;
      body.vx += (dx / d) * pull * dt;
      body.vy += (dy / d) * pull * dt;
      return pull;
    };
    if (state.ball && state.ball.alive) pullMover(state.ball, state.ball.x, state.ball.y, 1.2);
    for (const b of state.blocks) {
      if (!b.alive || !b.dynamic) continue;
      const pulled = pullMover(b, b.x + b.w * 0.5, b.y + b.h * 0.5, 0.9 / b.mass);
      if (pulled && pulled > 70) b.va += (gadget.x > b.x ? 1 : -1) * pulled * 0.0008;
    }
    for (const p of state.bodies) {
      if (p.alive) pullMover(p, p.x, p.y, 0.8 / p.mass);
    }
  }

  function checkClearState() {
    const level = LEVELS[state.levelIndex];
    const breakRatio = state.brokenBlocks / Math.max(1, state.totalBlocks);
    const targetsClear = state.targetBroken >= state.totalTargets;
    const contractClear = breakRatio >= level.threshold && state.bestCombo >= level.comboGoal && targetsClear;
    const moving = activeMotion();
    if (contractClear && !state.cleared) {
      state.cleared = true;
      const earned = 2 + Math.ceil(state.bestCombo) + Math.ceil(breakRatio * 3);
      state.tokens += earned;
      state.message = "Contract clear. +" + earned + " coins.";
      saveGame();
      spawnFloater(WORLD_W * 0.55, 176, "CLEAR +" + earned, "#137c8b");
    } else if (!state.runSettled && state.mode === "running" && state.elapsed > 5.2 && moving < 80) {
      state.runSettled = true;
      state.message = state.cleared ? "Contract clear. Upgrade or go next." : "Dummy stopped. Move toys and retry.";
    }
  }

  function activeMotion() {
    let motion = 0;
    if (state.ball && state.ball.alive) motion += Math.hypot(state.ball.vx, state.ball.vy);
    for (const b of state.blocks) {
      if (b.alive && b.dynamic) motion += Math.hypot(b.vx, b.vy) * 0.12;
    }
    for (const p of state.bodies) {
      if (p.alive) motion += Math.hypot(p.vx, p.vy) * 0.08;
    }
    return motion;
  }

  function collideCircleWorld(obj) {
    if (obj.x - obj.r < 40) {
      obj.x = 40 + obj.r;
      obj.vx = Math.abs(obj.vx) * RESTITUTION;
    }
    if (obj.x + obj.r > WORLD_W - 28) {
      obj.x = WORLD_W - 28 - obj.r;
      obj.vx = -Math.abs(obj.vx) * RESTITUTION;
    }
    if (obj.y + obj.r > FLOOR_Y) {
      obj.y = FLOOR_Y - obj.r;
      obj.vy = -Math.abs(obj.vy) * RESTITUTION;
      obj.vx *= FRICTION;
    }
  }

  function collideRectWorld(b) {
    if (b.y + b.h > FLOOR_Y) {
      b.y = FLOOR_Y - b.h;
      b.vy = -Math.abs(b.vy) * 0.24;
      b.vx *= FRICTION;
      if (Math.abs(b.vy) < 30) b.vy = 0;
    }
    if (b.x < 42) {
      b.x = 42;
      b.vx = Math.abs(b.vx) * 0.32;
    }
    if (b.x + b.w > WORLD_W - 30) {
      b.x = WORLD_W - 30 - b.w;
      b.vx = -Math.abs(b.vx) * 0.32;
    }
  }

  function updateParticles(dt) {
    for (const p of state.particles) {
      p.life -= dt;
      p.vy += GRAVITY * 0.38 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.988;
      p.vy *= 0.988;
    }
    state.particles = state.particles.filter((p) => p.life > 0);
  }

  function updateFloaters(dt) {
    for (const f of state.floaters) {
      f.life -= dt;
      f.y -= 36 * dt;
    }
    state.floaters = state.floaters.filter((f) => f.life > 0);
  }

  function burst(x, y, color, count, scale) {
    const n = Math.min(46, Math.max(3, Math.round(count * scale)));
    for (let i = 0; i < n; i += 1) {
      const a = Math.random() * Math.PI * 2;
      const speed = (80 + Math.random() * 260) * scale;
      state.particles.push({
        x,
        y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed - Math.random() * 80,
        size: 2 + Math.random() * 5 * scale,
        color,
        life: 0.45 + Math.random() * 0.55,
      });
    }
  }

  function spawnFloater(x, y, text, color) {
    state.floaters.push({ x, y, text, color, life: 0.85 });
  }

  function render() {
    const v = viewOffset();
    ctx.fillStyle = "#dde4eb";
    ctx.fillRect(0, 0, rect.width, rect.height);
    ctx.save();
    ctx.translate(v.ox, v.oy);
    ctx.scale(v.s, v.s);
    drawBackground();
    drawAimLane();
    drawReadyDummy();
    drawGadgets();
    drawBlocks();
    drawDummies();
    drawBall();
    drawParticles();
    drawFloaters();
    drawBuildPreview();
    ctx.restore();
  }

  function drawBackground() {
    const grad = ctx.createLinearGradient(0, 0, 0, WORLD_H);
    grad.addColorStop(0, "#edf4f8");
    grad.addColorStop(0.58, "#d9e5ec");
    grad.addColorStop(1, "#c2ccd4");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);

    ctx.fillStyle = "#b5c1c9";
    ctx.fillRect(0, FLOOR_Y, WORLD_W, WORLD_H - FLOOR_Y);
    ctx.fillStyle = "#9aa8b3";
    ctx.fillRect(0, FLOOR_Y, WORLD_W, 8);

    ctx.strokeStyle = "rgba(23,33,43,0.08)";
    ctx.lineWidth = 1;
    for (let x = 80; x < WORLD_W; x += 80) {
      ctx.beginPath();
      ctx.moveTo(x, 118);
      ctx.lineTo(x, FLOOR_Y);
      ctx.stroke();
    }
    for (let y = 168; y < FLOOR_Y; y += 80) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(WORLD_W, y);
      ctx.stroke();
    }

    ctx.fillStyle = "rgba(23,33,43,0.1)";
    roundRect(64, 430, 132, 104, 12, true);
    ctx.fillStyle = "#ecf0f3";
    roundRect(74, 440, 112, 82, 8, true);
    ctx.fillStyle = "#17212b";
    ctx.font = "900 14px ui-sans-serif, system-ui";
    ctx.fillText("DUMMY", 101, 482);
  }

  function drawAimLane() {
    ctx.save();
    ctx.strokeStyle = "rgba(233,79,55,0.35)";
    ctx.setLineDash([8, 10]);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(126, 382);
    ctx.bezierCurveTo(316, 292, 520, 444, 728, 482);
    ctx.stroke();
    ctx.restore();
  }

  function drawReadyDummy() {
    if (state.mode !== "build") return;
    ctx.save();
    ctx.translate(126, 382);
    ctx.strokeStyle = "rgba(39,49,60,0.55)";
    ctx.lineWidth = 7;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-24, 8);
    ctx.lineTo(22, 8);
    ctx.moveTo(-13, 36);
    ctx.lineTo(16, 58);
    ctx.moveTo(13, 36);
    ctx.lineTo(-18, 58);
    ctx.stroke();
    ctx.fillStyle = "rgba(247,179,43,0.78)";
    ctx.strokeStyle = "rgba(123,42,33,0.68)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 20, 24, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "rgba(247,214,173,0.92)";
    ctx.strokeStyle = "rgba(39,49,60,0.68)";
    ctx.beginPath();
    ctx.arc(0, -18, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "rgba(39,49,60,0.74)";
    ctx.beginPath();
    ctx.arc(-5, -22, 2, 0, Math.PI * 2);
    ctx.arc(5, -22, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawGadgets() {
    for (const g of state.gadgets) {
      const tool = TOOLS.find((t) => t.id === g.tool);
      ctx.save();
      ctx.globalAlpha = g.used && g.tool !== "magnet" ? 0.5 : 1;
      if (g.tool === "pulse") {
        ctx.fillStyle = "#2b2f36";
        ctx.strokeStyle = "#7b2a21";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(g.x, g.y, 22, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = "#f7b32b";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(g.x + 10, g.y - 18);
        ctx.quadraticCurveTo(g.x + 24, g.y - 34, g.x + 36, g.y - 20);
        ctx.stroke();
        ctx.fillStyle = tool.color;
        ctx.beginPath();
        ctx.arc(g.x + 38, g.y - 18, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#fff5d6";
        ctx.beginPath();
        ctx.arc(g.x - 6, g.y - 7, 5, 0, Math.PI * 2);
        ctx.fill();
      } else if (g.tool === "spring") {
        ctx.fillStyle = "#dff4d8";
        ctx.strokeStyle = tool.color;
        ctx.lineWidth = 5;
        roundRect(g.x - 48, g.y - 14, 96, 28, 8, true, true);
        ctx.beginPath();
        for (let i = -34; i <= 34; i += 17) {
          ctx.moveTo(g.x + i, g.y + 12);
          ctx.lineTo(g.x + i + 8, g.y - 12);
        }
        ctx.stroke();
      } else if (g.tool === "ramp") {
        ctx.fillStyle = "#cceaf0";
        ctx.strokeStyle = tool.color;
        ctx.lineWidth = 4;
        ctx.beginPath();
        if (g.angle > 0) {
          ctx.moveTo(g.x - 55, g.y + 36);
          ctx.lineTo(g.x + 55, g.y + 36);
          ctx.lineTo(g.x + 55, g.y - 38);
        } else {
          ctx.moveTo(g.x + 55, g.y + 36);
          ctx.lineTo(g.x - 55, g.y + 36);
          ctx.lineTo(g.x - 55, g.y - 38);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else if (g.tool === "magnet") {
        ctx.strokeStyle = "rgba(102,83,182,0.18)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(g.x, g.y, 178, 0, Math.PI * 2);
        ctx.stroke();
        ctx.translate(g.x, g.y);
        ctx.rotate(g.age * 3.2);
        ctx.strokeStyle = tool.color;
        ctx.lineWidth = 12;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(-54, 0);
        ctx.lineTo(44, 0);
        ctx.stroke();
        ctx.fillStyle = "#d7d2ff";
        ctx.strokeStyle = tool.color;
        ctx.lineWidth = 5;
        roundRect(34, -24, 58, 48, 8, true, true);
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(0, 0, 12, 0, Math.PI * 2);
        ctx.fill();
      } else if (g.tool === "drop") {
        ctx.fillStyle = tool.color;
        ctx.strokeStyle = "#956600";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(g.x - 34, g.y + 22);
        ctx.lineTo(g.x + 34, g.y + 22);
        ctx.lineTo(g.x + 24, g.y - 4);
        ctx.lineTo(g.x + 10, g.y - 4);
        ctx.lineTo(g.x + 2, g.y - 28);
        ctx.lineTo(g.x - 22, g.y - 28);
        ctx.lineTo(g.x - 30, g.y - 4);
        ctx.lineTo(g.x - 42, g.y - 4);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = "rgba(149,102,0,0.35)";
        ctx.beginPath();
        ctx.moveTo(g.x, g.y + 28);
        ctx.lineTo(g.x, FLOOR_Y);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  function drawBlocks() {
    for (const b of state.blocks) {
      if (!b.alive) continue;
      const mat = MATERIALS[b.material];
      ctx.save();
      ctx.translate(b.x + b.w * 0.5, b.y + b.h * 0.5);
      ctx.rotate(b.angle);
      ctx.fillStyle = lerpColor(mat.color, "#ffffff", b.hitFlash * 0.45);
      ctx.strokeStyle = mat.edge;
      ctx.lineWidth = b.material === "target" ? 5 : 3;
      roundRect(-b.w * 0.5, -b.h * 0.5, b.w, b.h, 5, true, true);
      const crack = 1 - b.hp / b.maxHp;
      if (crack > 0.28) {
        ctx.strokeStyle = "rgba(23,33,43,0.46)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-b.w * 0.28, -b.h * 0.18);
        ctx.lineTo(-b.w * 0.05, b.h * 0.08);
        ctx.lineTo(b.w * 0.18, -b.h * 0.08);
        if (crack > 0.62) ctx.lineTo(b.w * 0.34, b.h * 0.26);
        ctx.stroke();
      }
      if (b.material === "target") {
        ctx.fillStyle = "#fff6df";
        ctx.beginPath();
        ctx.arc(0, 0, Math.min(b.w, b.h) * 0.25, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  function drawDummies() {
    const groups = new Map();
    for (const p of state.bodies) {
      if (!p.alive) continue;
      if (!groups.has(p.dummyId)) groups.set(p.dummyId, []);
      groups.get(p.dummyId).push(p);
    }
    ctx.strokeStyle = "#27313c";
    ctx.lineWidth = 8;
    ctx.lineCap = "round";
    for (const parts of groups.values()) {
      const byName = new Map(parts.map((p) => [p.name, p]));
      const links = [
        ["head", "torso"],
        ["torso", "hip"],
        ["torso", "leftArm"],
        ["torso", "rightArm"],
        ["hip", "leftLeg"],
        ["hip", "rightLeg"],
      ];
      for (const [a, b] of links) {
        if (byName.has(a) && byName.has(b)) {
          ctx.beginPath();
          ctx.moveTo(byName.get(a).x, byName.get(a).y);
          ctx.lineTo(byName.get(b).x, byName.get(b).y);
          ctx.stroke();
        }
      }
    }
    for (const p of state.bodies) {
      if (!p.alive) continue;
      ctx.fillStyle = lerpColor(p.color, "#ffffff", p.hitFlash * 0.5);
      ctx.strokeStyle = "#27313c";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      if (p.name === "head") {
        ctx.fillStyle = "#27313c";
        ctx.beginPath();
        ctx.arc(p.x - 5, p.y - 3, 2.4, 0, Math.PI * 2);
        ctx.arc(p.x + 5, p.y - 3, 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawBall() {
    const b = state.ball;
    if (!b || !b.alive) return;
    ctx.save();
    for (let i = 0; i < b.trail.length; i += 1) {
      const t = b.trail[i];
      ctx.globalAlpha = i / b.trail.length * 0.22;
      ctx.fillStyle = "#e94f37";
      ctx.beginPath();
      ctx.arc(t.x, t.y, b.r * (i / b.trail.length), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.translate(b.x, b.y);
    ctx.rotate(Math.atan2(b.vy, b.vx || 1) * 0.35 + state.elapsed * 4.2);

    ctx.strokeStyle = "#27313c";
    ctx.lineWidth = 8;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-b.r * 0.72, -b.r * 0.12);
    ctx.lineTo(b.r * 0.68, b.r * 0.1);
    ctx.moveTo(-b.r * 0.3, b.r * 0.62);
    ctx.lineTo(b.r * 0.5, b.r * 0.88);
    ctx.moveTo(b.r * 0.18, b.r * 0.62);
    ctx.lineTo(-b.r * 0.58, b.r * 0.9);
    ctx.stroke();

    const grad = ctx.createRadialGradient(-b.r * 0.22, -b.r * 0.22, 4, 0, 0, b.r);
    grad.addColorStop(0, "#fff0d2");
    grad.addColorStop(0.44, "#f7b32b");
    grad.addColorStop(1, "#e94f37");
    ctx.fillStyle = grad;
    ctx.strokeStyle = "#7b2a21";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(0, b.r * 0.18, b.r * 0.82, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#f7d6ad";
    ctx.strokeStyle = "#27313c";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, -b.r * 0.78, b.r * 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#27313c";
    ctx.beginPath();
    ctx.arc(-b.r * 0.13, -b.r * 0.84, 2.4, 0, Math.PI * 2);
    ctx.arc(b.r * 0.13, -b.r * 0.84, 2.4, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#fff6df";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-b.r * 0.36, b.r * 0.08);
    ctx.lineTo(b.r * 0.36, b.r * 0.08);
    ctx.moveTo(0, -b.r * 0.38);
    ctx.lineTo(0, b.r * 0.58);
    ctx.stroke();
    ctx.restore();
  }

  function drawParticles() {
    for (const p of state.particles) {
      ctx.globalAlpha = clamp(p.life * 1.6, 0, 1);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size * 0.5, p.y - p.size * 0.5, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  function drawFloaters() {
    ctx.font = "900 18px ui-sans-serif, system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const f of state.floaters) {
      ctx.globalAlpha = clamp(f.life, 0, 1);
      ctx.fillStyle = "rgba(255,255,255,0.82)";
      roundRect(f.x - 42, f.y - 14, 84, 28, 14, true);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y + 1);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = "left";
  }

  function drawBuildPreview() {
    if (state.mode !== "build" || !pointer.valid) return;
    const tool = TOOLS.find((t) => t.id === state.selectedTool);
    ctx.save();
    ctx.globalAlpha = 0.6;
    ctx.strokeStyle = tool.color;
    ctx.fillStyle = tool.color;
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 8]);
    ctx.beginPath();
    ctx.arc(pointer.x, pointer.y, state.selectedTool === "magnet" ? 178 : 42, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 0.18;
    ctx.beginPath();
    ctx.arc(pointer.x, pointer.y, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function updateHud() {
    const level = LEVELS[state.levelIndex];
    levelLabel.textContent = `Level ${state.levelIndex + 1}: ${level.name}`;
    contractText.textContent = `${level.contract} ${state.message}`;
    scorePill.textContent = `Score ${Math.round(state.score)}`;
    comboPill.textContent = `Combo x${state.bestCombo.toFixed(1)}`;
    tokenPill.textContent = `Coins ${state.tokens}`;
    const percent = Math.round((state.brokenBlocks / Math.max(1, state.totalBlocks)) * 100);
    goalPill.textContent = `Break ${percent}%  Cores ${state.targetBroken}/${state.totalTargets}`;
    releaseBtn.disabled = state.mode !== "build";
    nextBtn.disabled = state.mode === "running" && !state.runSettled && !state.cleared;
    for (const btn of toolPanel.querySelectorAll(".toolBtn")) {
      const tool = btn.dataset.tool;
      const left = Math.max(0, (state.budget[tool] || 0) - (state.placed[tool] || 0));
      btn.dataset.selected = String(tool === state.selectedTool);
      btn.disabled = state.mode !== "build" || left <= 0;
      const count = btn.querySelector(".count");
      count.textContent = `${left} left`;
    }
    for (const [type, btn] of Object.entries(upgradeButtons)) {
      const cost = 3 + state.upgrades[type] * 2;
      const label = type === "mass" ? "dummy" : type === "pulse" ? "bomb" : "spring";
      btn.innerHTML = `${label}<br />${cost}`;
      btn.disabled = state.tokens < cost || state.mode === "running";
    }
    accessibleState.textContent = `Mode ${state.mode}. Score ${Math.round(state.score)}. Break ${percent} percent. Best combo ${state.bestCombo.toFixed(1)}.`;
  }

  function renderGameToText() {
    const visibleBlocks = state.blocks
      .filter((b) => b.alive)
      .slice(0, 24)
      .map((b) => ({
        id: b.id,
        material: b.material,
        x: Math.round(b.x),
        y: Math.round(b.y),
        hp: Math.max(0, Math.round(b.hp)),
        dynamic: b.dynamic,
      }));
    const gadgets = state.gadgets.map((g) => ({
      tool: g.tool,
      x: Math.round(g.x),
      y: Math.round(g.y),
      armed: g.armed,
      used: g.used,
    }));
    const ball = state.ball && state.ball.alive
      ? {
          x: Math.round(state.ball.x),
          y: Math.round(state.ball.y),
          vx: Math.round(state.ball.vx),
          vy: Math.round(state.ball.vy),
        }
      : null;
    return JSON.stringify({
      coordinateSystem: "world 1280x720, origin top-left, y increases downward",
      mode: state.mode,
      level: LEVELS[state.levelIndex].name,
      selectedTool: state.selectedTool,
      score: Math.round(state.score),
      bestCombo: Number(state.bestCombo.toFixed(2)),
      tokens: state.tokens,
      brokenBlocks: state.brokenBlocks,
      totalBlocks: state.totalBlocks,
      targetBroken: state.targetBroken,
      totalTargets: state.totalTargets,
      cleared: state.cleared,
      budgetLeft: Object.fromEntries(
        Object.keys(state.budget).map((k) => [k, Math.max(0, (state.budget[k] || 0) - (state.placed[k] || 0))]),
      ),
      ball,
      gadgets,
      visibleBlocks,
      livingDummyParts: state.bodies.filter((p) => p.alive).length,
      message: state.message,
    });
  }

  function loop(now) {
    if (!runningLoop) return;
    if (!lastNow) lastNow = now;
    const dt = Math.min(0.05, (now - lastNow) / 1000);
    lastNow = now;
    update(dt);
    render();
    rafId = requestAnimationFrame(loop);
  }

  function deterministicAdvance(ms) {
    const steps = Math.max(1, Math.round(ms / (1000 / 60)));
    for (let i = 0; i < steps; i += 1) update(1 / 60);
    render();
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement && shell.requestFullscreen) {
      shell.requestFullscreen().catch(() => {});
    } else if (document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    }
  }

  function resumeAudio() {
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      audioCtx = new Ctx();
    }
    if (audioCtx.state === "suspended") audioCtx.resume();
  }

  function playPop(tier) {
    if (!audioCtx) return;
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const pitch = 130 + Math.random() * 80 + (tier.burst - 1) * 70;
    osc.type = tier.name === "legendary" || tier.name === "epic" ? "triangle" : "square";
    osc.frequency.setValueAtTime(pitch, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(42, pitch * 0.42), now + 0.08);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.055 * tier.burst, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + 0.13);
  }

  function saveGame() {
    try {
      localStorage.setItem(
        "chain-crash-lab-v1",
        JSON.stringify({ tokens: state.tokens, upgrades: state.upgrades }),
      );
    } catch {
      // Storage can be unavailable in private browsing.
    }
  }

  function loadSave() {
    try {
      const saved = JSON.parse(localStorage.getItem("chain-crash-lab-v1") || "null");
      if (saved && saved.upgrades) {
        state.tokens = Number(saved.tokens) || 0;
        state.upgrades = {
          mass: Number(saved.upgrades.mass) || 0,
          pulse: Number(saved.upgrades.pulse) || 0,
          spring: Number(saved.upgrades.spring) || 0,
        };
      }
    } catch {
      state.tokens = 0;
    }
  }

  function rollFxTier() {
    let r = Math.random() * FX_TOTAL;
    for (const tier of FX_TIERS) {
      r -= tier.weight;
      if (r <= 0) return tier;
    }
    return FX_TIERS[0];
  }

  function dist(x1, y1, x2, y2) {
    return Math.hypot(x2 - x1, y2 - y1);
  }

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function roundRect(x, y, w, h, r, fill, stroke) {
    const rr = Math.min(r, w * 0.5, h * 0.5);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.lineTo(x + w - rr, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
    ctx.lineTo(x + w, y + h - rr);
    ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    ctx.lineTo(x + rr, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
    ctx.lineTo(x, y + rr);
    ctx.quadraticCurveTo(x, y, x + rr, y);
    if (fill) ctx.fill();
    if (stroke) ctx.stroke();
  }

  function lerpColor(a, b, t) {
    const ca = hexToRgb(a);
    const cb = hexToRgb(b);
    const mix = ca.map((v, i) => Math.round(v + (cb[i] - v) * clamp(t, 0, 1)));
    return `rgb(${mix[0]}, ${mix[1]}, ${mix[2]})`;
  }

  function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  window.render_game_to_text = renderGameToText;
  window.advanceTime = deterministicAdvance;
  window.ChainCrashLab = {
    resetLevel,
    releaseRun,
    nextLevel,
    placeGadget,
    selectTool(tool) {
      if (TOOLS.some((t) => t.id === tool)) {
        state.selectedTool = tool;
        updateHud();
      }
    },
    getState: () => JSON.parse(renderGameToText()),
  };
})();
