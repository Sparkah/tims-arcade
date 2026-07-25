(() => {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d", { alpha: false });
  const shell = document.getElementById("game-shell");
  const airspace = document.getElementById("airspace");
  const retryButton = document.getElementById("retry-button");
  const screenReaderStatus = document.getElementById("screen-reader-status");

  const SAVE_KEY = "airspace-stack-save-v2";
  const TUTORIAL_KEY = "airspace-stack-tutorial-v1";
  const SAVE_VERSION = 2;
  const TUTORIAL_VERSION = 1;
  const TAU = Math.PI * 2;
  const RUNWAY = {
    threshold: { x: 0.725, y: 0.71 },
    end: { x: 0.965, y: 0.71 },
    captureRadius: 0.105
  };
  const ALTITUDE_COLORS = ["#8cf6c7", "#6edcf2", "#ffb65c"];

  // Only the route / altitude / separation system remains. Later waves vary
  // traffic count, timing, entry geometry, and starting layers.
  const STAGES = [
    [
      { id: "SKY 21", x: 0.14, y: 0.23, altitude: 1, spawn: 0, speed: 0.205 }
    ],
    [
      { id: "JET 08", x: 0.14, y: 0.52, altitude: 1, spawn: 0, speed: 0.19 },
      { id: "NOVA 62", x: 0.14, y: 0.90, altitude: 1, spawn: 0, speed: 0.19 }
    ],
    [
      { id: "ARC 17", x: 0.10, y: 0.18, altitude: 2, spawn: 0, speed: 0.19 },
      { id: "KITE 44", x: 0.12, y: 0.50, altitude: 2, spawn: 2.2, speed: 0.20 },
      { id: "MESA 03", x: 0.16, y: 0.84, altitude: 1, spawn: 4.8, speed: 0.18 }
    ],
    [
      { id: "ECHO 90", x: 0.09, y: 0.25, altitude: 1, spawn: 0, speed: 0.19 },
      { id: "LUX 35", x: 0.20, y: 0.84, altitude: 2, spawn: 2.6, speed: 0.19 },
      { id: "PAX 12", x: 0.46, y: 0.09, altitude: 1, spawn: 5.2, speed: 0.185 }
    ],
    [
      { id: "VALE 71", x: 0.08, y: 0.18, altitude: 2, spawn: 0, speed: 0.20 },
      { id: "ONYX 26", x: 0.55, y: 0.08, altitude: 2, spawn: 1.7, speed: 0.19 },
      { id: "BLUE 04", x: 0.10, y: 0.84, altitude: 1, spawn: 4.2, speed: 0.185 }
    ],
    [
      { id: "RUNE 56", x: 0.12, y: 0.14, altitude: 1, spawn: 0, speed: 0.205 },
      { id: "TIDE 18", x: 0.11, y: 0.53, altitude: 1, spawn: 1.9, speed: 0.205 },
      { id: "SOL 73", x: 0.18, y: 0.86, altitude: 2, spawn: 4.0, speed: 0.195 }
    ],
    [
      { id: "WREN 09", x: 0.08, y: 0.17, altitude: 1, spawn: 0, speed: 0.20 },
      { id: "HALO 40", x: 0.11, y: 0.56, altitude: 2, spawn: 1.8, speed: 0.195 },
      { id: "APEX 88", x: 0.45, y: 0.08, altitude: 2, spawn: 3.6, speed: 0.19 },
      { id: "MINT 31", x: 0.13, y: 0.86, altitude: 3, spawn: 5.8, speed: 0.185 }
    ],
    [
      { id: "MOON 11", x: 0.07, y: 0.16, altitude: 2, spawn: 0, speed: 0.20 },
      { id: "EMBER 67", x: 0.52, y: 0.08, altitude: 2, spawn: 1.4, speed: 0.195 },
      { id: "CROWN 24", x: 0.08, y: 0.58, altitude: 1, spawn: 3.2, speed: 0.20 },
      { id: "FROST 82", x: 0.18, y: 0.88, altitude: 3, spawn: 5.2, speed: 0.19 }
    ]
  ];

  const view = { width: 1, height: 1, dpr: 1 };
  const pointer = {
    active: false,
    id: null,
    planeId: null,
    startX: 0,
    startY: 0,
    startClientX: 0,
    startClientY: 0,
    x: 0,
    y: 0,
    moved: false
  };

  const state = {
    mode: "playing",
    stage: 1,
    elapsed: 0,
    visualTime: 0,
    planes: [],
    selectedId: null,
    landedStage: 0,
    routeCommands: 0,
    altitudeChanges: 0,
    retryCount: 0,
    failureReason: "",
    conflict: null,
    transitionTime: 0,
    particles: [],
    fxSerial: 0,
    muted: false,
    pausedForVisibility: false
  };

  const tutorial = {
    active: false,
    done: false,
    step: "route_solo",
    blockedTime: 0,
    celebrateTime: 0
  };

  let audioContext = null;
  let lastFrame = performance.now();

  function defaultSave() {
    return {
      version: SAVE_VERSION,
      bestStage: 1,
      totalLanded: 0,
      shiftsCompleted: 0
    };
  }

  function loadSave() {
    try {
      const parsed = JSON.parse(localStorage.getItem(SAVE_KEY) || "null");
      if (!parsed || typeof parsed !== "object") return defaultSave();
      return {
        version: SAVE_VERSION,
        bestStage: Number.isFinite(parsed.bestStage) ? Math.max(1, Math.min(8, parsed.bestStage)) : 1,
        totalLanded: Number.isFinite(parsed.totalLanded) ? Math.max(0, parsed.totalLanded) : 0,
        shiftsCompleted: Number.isFinite(parsed.shiftsCompleted) ? Math.max(0, parsed.shiftsCompleted) : 0
      };
    } catch (_) {
      return defaultSave();
    }
  }

  function loadTutorialDone() {
    try {
      const parsed = JSON.parse(localStorage.getItem(TUTORIAL_KEY) || "null");
      return Boolean(parsed && parsed.version === TUTORIAL_VERSION && parsed.done);
    } catch (_) {
      return false;
    }
  }

  const save = loadSave();
  tutorial.done = loadTutorialDone();
  tutorial.active = !tutorial.done;
  if (tutorial.done) tutorial.step = "done";

  function persistSave() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(save));
    } catch (_) {
      // Persistence is optional; the core game remains playable.
    }
  }

  function persistTutorial() {
    try {
      localStorage.setItem(
        TUTORIAL_KEY,
        JSON.stringify({ version: TUTORIAL_VERSION, done: tutorial.done })
      );
    } catch (_) {
      // The tutorial can still complete for the current session.
    }
  }

  function ensureAudio() {
    if (state.muted) return null;
    if (!audioContext) {
      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtor) return null;
      audioContext = new AudioCtor();
    }
    if (audioContext.state === "suspended") audioContext.resume();
    return audioContext;
  }

  function tone(frequency, duration, type = "sine", gain = 0.03, delay = 0) {
    const audio = ensureAudio();
    if (!audio || state.muted) return;
    const start = audio.currentTime + delay;
    const oscillator = audio.createOscillator();
    const volume = audio.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    volume.gain.setValueAtTime(0.0001, start);
    volume.gain.exponentialRampToValueAtTime(gain, start + 0.012);
    volume.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(volume);
    volume.connect(audio.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }

  function announce(text) {
    screenReaderStatus.textContent = "";
    requestAnimationFrame(() => {
      screenReaderStatus.textContent = text;
    });
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function activePlanes() {
    return state.planes.filter((plane) => plane.status !== "queued" && plane.status !== "landed");
  }

  function selectedPlane() {
    return state.planes.find(
      (plane) => plane.id === state.selectedId && plane.status !== "queued" && plane.status !== "landed"
    ) || null;
  }

  function makePlane(definition) {
    return {
      ...definition,
      status: definition.spawn <= 0 ? "holding" : "queued",
      route: null,
      heading: 0,
      landedAt: null
    };
  }

  function initStage(stageNumber) {
    state.mode = "playing";
    state.stage = stageNumber;
    state.elapsed = 0;
    state.planes = STAGES[stageNumber - 1].map(makePlane);
    state.selectedId = state.planes.find((plane) => plane.status !== "queued").id;
    state.landedStage = 0;
    state.routeCommands = 0;
    state.altitudeChanges = 0;
    state.failureReason = "";
    state.conflict = null;
    state.transitionTime = 0;
    state.particles.length = 0;
    pointer.active = false;
    pointer.id = null;
    pointer.planeId = null;
    retryButton.hidden = true;

    if (tutorial.active && stageNumber === 1 && tutorial.step !== "route_solo") {
      tutorial.step = "route_solo";
    }
    if (tutorial.active && stageNumber === 2 && tutorial.step === "wait_solo_land") {
      tutorial.step = "route_pair_a";
      for (const plane of state.planes) {
        plane.spawn = 0;
        plane.status = "holding";
      }
      state.selectedId = state.planes[0].id;
      announce("Drag the highlighted aircraft to the runway.");
    }
    draw();
  }

  function routeCurve(start, end, kind) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const direct = Math.max(0.001, Math.hypot(dx, dy));
    const sign = start.y <= end.y ? -1 : 1;
    const bend = kind === "approach" ? 0.012 : Math.min(0.065, direct * 0.095) * sign;
    const cx = (start.x + end.x) * 0.5 - (dy / direct) * bend;
    const cy = (start.y + end.y) * 0.5 + (dx / direct) * bend;
    return {
      sx: start.x,
      sy: start.y,
      cx,
      cy,
      ex: end.x,
      ey: end.y,
      t: 0,
      length: direct * (1 + Math.abs(bend) * 1.7),
      kind
    };
  }

  function curvePoint(route, progress) {
    const t = clamp(progress, 0, 1);
    const inv = 1 - t;
    return {
      x: inv * inv * route.sx + 2 * inv * t * route.cx + t * t * route.ex,
      y: inv * inv * route.sy + 2 * inv * t * route.cy + t * t * route.ey
    };
  }

  function curveHeading(route, progress) {
    const t = clamp(progress, 0, 1);
    const dx = 2 * (1 - t) * (route.cx - route.sx) + 2 * t * (route.ex - route.cx);
    const dy = 2 * (1 - t) * (route.cy - route.sy) + 2 * t * (route.ey - route.cy);
    return Math.atan2(dy, dx);
  }

  function tutorialExpectedPlane() {
    if (!tutorial.active) return null;
    if (tutorial.step === "route_solo") return state.planes[0] || null;
    if (tutorial.step === "route_pair_a") return state.planes[0] || null;
    if (tutorial.step === "route_pair_b") return state.planes[1] || null;
    if (tutorial.step === "separate") {
      if (state.conflict) {
        return state.planes.find((plane) => plane.id === state.conflict.b) || state.planes[1] || null;
      }
      return state.planes[1] || null;
    }
    return null;
  }

  function tutorialFreezesTraffic() {
    return tutorial.active && (
      tutorial.step === "route_pair_a" ||
      tutorial.step === "route_pair_b" ||
      tutorial.step === "separate"
    );
  }

  function tutorialBlocked() {
    tutorial.blockedTime = 0.42;
    tone(125, 0.08, "square", 0.014);
    draw();
  }

  function finishTutorial() {
    tutorial.active = false;
    tutorial.done = true;
    tutorial.step = "done";
    tutorial.celebrateTime = 0.75;
    persistTutorial();
    tone(520, 0.12, "triangle", 0.026);
    tone(780, 0.18, "sine", 0.02, 0.08);
    announce("Tutorial complete.");
  }

  function tutorialRecord(action) {
    if (!tutorial.active) return;
    if (tutorial.step === "route_solo" && action === "route") {
      tutorial.step = "wait_solo_land";
      announce("Route set. Watch the aircraft land.");
      return;
    }
    if (tutorial.step === "route_pair_a" && action === "route") {
      tutorial.step = "route_pair_b";
      state.selectedId = state.planes[1].id;
      announce("Drag the second aircraft to the runway.");
      return;
    }
    if (tutorial.step === "route_pair_b" && action === "route") {
      updateConflict();
      if (state.conflict) {
        tutorial.step = "separate";
        const target = tutorialExpectedPlane();
        if (target) state.selectedId = target.id;
        announce("Tap a red aircraft to change altitude.");
      } else {
        tutorialBlocked();
      }
      return;
    }
    if (tutorial.step === "separate" && action === "altitude" && !state.conflict) {
      finishTutorial();
    }
  }

  function assignRoute(plane, point, source = "drag") {
    if (!plane || state.mode !== "playing" || plane.status === "queued" || plane.status === "landed") {
      return false;
    }
    const target = {
      x: clamp(point.x, 0.055, 0.95),
      y: clamp(point.y, 0.08, 0.92)
    };
    const captured = distance(target, RUNWAY.threshold) <= RUNWAY.captureRadius;

    if (tutorial.active) {
      const routeStep = tutorial.step === "route_solo" ||
        tutorial.step === "route_pair_a" ||
        tutorial.step === "route_pair_b";
      const expected = tutorialExpectedPlane();
      if (!routeStep || !expected || expected.id !== plane.id || !captured) {
        tutorialBlocked();
        return false;
      }
    }

    const end = captured ? RUNWAY.threshold : target;
    plane.route = routeCurve(plane, end, "vector");
    plane.status = "vector";
    state.selectedId = plane.id;
    state.routeCommands += 1;
    state.fxSerial += 1;
    const pitch = 430 + (state.fxSerial % 4) * 17;
    tone(pitch, 0.08, "triangle", 0.024);
    tone(pitch * 1.5, 0.1, "sine", 0.016, 0.06);
    announce(captured ? `${plane.id} cleared to runway.` : `${plane.id} route set.`);
    updateConflict();
    tutorialRecord("route");
    if (source === "keyboard") canvas.focus({ preventScroll: true });
    draw();
    return true;
  }

  function clearSelected(source = "keyboard") {
    ensureAudio();
    const plane = selectedPlane();
    if (!plane) {
      tutorialBlocked();
      return false;
    }
    return assignRoute(plane, RUNWAY.threshold, source);
  }

  function cycleAltitude(targetPlane = selectedPlane()) {
    ensureAudio();
    const plane = targetPlane;
    if (!plane || plane.status === "queued" || plane.status === "landed" || plane.status === "approach") {
      tutorialBlocked();
      return false;
    }
    if (tutorial.active) {
      const expected = tutorialExpectedPlane();
      if (tutorial.step !== "separate" || !expected || expected.id !== plane.id) {
        tutorialBlocked();
        return false;
      }
    }

    plane.altitude = (plane.altitude % 3) + 1;
    state.selectedId = plane.id;
    state.altitudeChanges += 1;
    tone(280 + plane.altitude * 105, 0.12, "sine", 0.028);
    updateConflict();
    announce(`${plane.id}, altitude ${plane.altitude}.`);
    tutorialRecord("altitude");
    draw();
    return true;
  }

  function updatePlane(plane, dt) {
    if (plane.status === "queued") {
      if (state.elapsed >= plane.spawn) {
        plane.status = "holding";
        if (!selectedPlane()) state.selectedId = plane.id;
        tone(330, 0.1, "triangle", 0.018);
        announce("Aircraft entering.");
      }
      return;
    }
    if (plane.status === "landed" || !plane.route) return;

    const speed = plane.route.kind === "approach" ? plane.speed * 0.78 : plane.speed;
    plane.route.t += (speed * dt) / Math.max(0.001, plane.route.length);
    const next = curvePoint(plane.route, plane.route.t);
    plane.x = next.x;
    plane.y = next.y;
    plane.heading = curveHeading(plane.route, plane.route.t);

    if (plane.route.t < 1) return;
    if (plane.route.kind === "vector") {
      if (distance(plane, RUNWAY.threshold) <= 0.018) {
        plane.x = RUNWAY.threshold.x;
        plane.y = RUNWAY.threshold.y;
        plane.route = routeCurve(plane, RUNWAY.end, "approach");
        plane.status = "approach";
        tone(510, 0.08, "sine", 0.018);
      } else {
        plane.route = null;
        plane.status = "holding";
        announce("Route complete. Draw another route.");
      }
      return;
    }
    landPlane(plane);
  }

  function landPlane(plane) {
    plane.x = RUNWAY.end.x;
    plane.y = RUNWAY.end.y;
    plane.status = "landed";
    plane.route = null;
    plane.landedAt = state.elapsed;
    state.landedStage += 1;
    save.totalLanded += 1;
    save.bestStage = Math.max(save.bestStage, state.stage);
    persistSave();
    spawnLandingParticles(plane);
    state.fxSerial += 1;
    const variant = state.fxSerial % 5;
    tone(420 + variant * 18, 0.1, "triangle", 0.028);
    tone(630 + variant * 22, 0.15, "sine", 0.026, 0.07);
    tone(840 + variant * 25, 0.2, "sine", 0.018, 0.16);
    announce("Aircraft landed.");

    const next = activePlanes()[0];
    if (next) state.selectedId = next.id;
    if (state.planes.every((item) => item.status === "landed")) completeStage();
  }

  function spawnLandingParticles(plane) {
    const colors = ["#8cf6c7", "#6edcf2", "#ffffff"];
    for (let i = 0; i < 24; i += 1) {
      const angle = (i / 24) * TAU + (state.fxSerial % 7) * 0.11;
      const speed = 0.025 + (i % 6) * 0.008;
      state.particles.push({
        x: plane.x,
        y: plane.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.72 + (i % 5) * 0.07,
        maxLife: 1,
        color: colors[i % colors.length]
      });
    }
  }

  function completeStage() {
    state.mode = "stage_complete";
    state.conflict = null;
    state.transitionTime = state.stage === STAGES.length ? 1.45 : 0.95;
    save.bestStage = Math.max(save.bestStage, Math.min(8, state.stage + 1));
    if (state.stage === STAGES.length) {
      save.shiftsCompleted += 1;
    }
    persistSave();
    tone(392, 0.12, "triangle", 0.024);
    tone(523, 0.16, "triangle", 0.028, 0.1);
    tone(784, 0.26, "sine", 0.026, 0.24);
    announce("Wave clear.");
  }

  function failStage() {
    if (state.mode !== "playing") return;
    state.mode = "failure";
    state.failureReason = "SEPARATION LOST";
    state.conflict = null;
    pointer.active = false;
    retryButton.hidden = false;
    tone(170, 0.18, "sawtooth", 0.036);
    tone(112, 0.36, "square", 0.022, 0.15);
    announce("Separation lost. Tap to retry.");
  }

  function projectedPoint(plane, seconds) {
    if (!plane.route) return { x: plane.x, y: plane.y };
    const speed = plane.route.kind === "approach" ? plane.speed * 0.78 : plane.speed;
    const projectedT = plane.route.t + (speed * seconds) / Math.max(0.001, plane.route.length);
    if (projectedT <= 1) return curvePoint(plane.route, projectedT);
    if (
      plane.route.kind === "vector" &&
      distance({ x: plane.route.ex, y: plane.route.ey }, RUNWAY.threshold) <= 0.02
    ) {
      const remaining = (projectedT - 1) * plane.route.length / Math.max(0.001, speed);
      const approachDistance = distance(RUNWAY.threshold, RUNWAY.end);
      const approachT = (plane.speed * 0.78 * remaining) / approachDistance;
      return {
        x: RUNWAY.threshold.x + (RUNWAY.end.x - RUNWAY.threshold.x) * clamp(approachT, 0, 1),
        y: RUNWAY.threshold.y
      };
    }
    return { x: plane.route.ex, y: plane.route.ey };
  }

  function updateConflict() {
    if (state.mode !== "playing") {
      state.conflict = null;
      return;
    }
    const planes = activePlanes();
    let earliest = null;

    for (let i = 0; i < planes.length; i += 1) {
      for (let j = i + 1; j < planes.length; j += 1) {
        const a = planes[i];
        const b = planes[j];
        if (a.altitude !== b.altitude || (!a.route && !b.route)) continue;
        if (distance(a, b) < 0.038 && !tutorialFreezesTraffic()) {
          failStage();
          return;
        }
        for (let seconds = 0.5; seconds <= 7; seconds += 0.5) {
          if (distance(projectedPoint(a, seconds), projectedPoint(b, seconds)) < 0.078) {
            if (!earliest || seconds < earliest.seconds) {
              earliest = { a: a.id, b: b.id, altitude: a.altitude, seconds };
            }
            break;
          }
        }
      }
    }
    state.conflict = earliest;
  }

  function updateParticles(dt) {
    for (const particle of state.particles) {
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += 0.015 * dt;
      particle.life -= dt;
    }
    state.particles = state.particles.filter((particle) => particle.life > 0);
  }

  function update(dt) {
    state.visualTime += dt;
    tutorial.blockedTime = Math.max(0, tutorial.blockedTime - dt);
    tutorial.celebrateTime = Math.max(0, tutorial.celebrateTime - dt);
    updateParticles(dt);

    if (state.mode === "stage_complete") {
      state.transitionTime -= dt;
      if (state.transitionTime <= 0) {
        initStage(state.stage < STAGES.length ? state.stage + 1 : 1);
      }
      return;
    }
    if (state.mode !== "playing" || state.pausedForVisibility) return;
    if (tutorialFreezesTraffic()) {
      updateConflict();
      return;
    }

    state.elapsed += dt;
    for (const plane of state.planes) {
      updatePlane(plane, dt);
      if (state.mode !== "playing") break;
    }
    updateConflict();
  }

  function drawBackground(width, height) {
    const gradient = ctx.createRadialGradient(
      width * 0.52,
      height * 0.48,
      0,
      width * 0.52,
      height * 0.48,
      Math.max(width, height) * 0.72
    );
    gradient.addColorStop(0, "#102a31");
    gradient.addColorStop(0.52, "#0a1c24");
    gradient.addColorStop(1, "#050d13");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    ctx.lineWidth = 1;
    for (let ring = 1; ring <= 5; ring += 1) {
      ctx.beginPath();
      ctx.strokeStyle = `rgba(130, 211, 207, ${0.045 + ring * 0.007})`;
      ctx.arc(width * 0.52, height * 0.5, Math.min(width, height) * ring * 0.11, 0, TAU);
      ctx.stroke();
    }

    const spacing = Math.max(48, Math.min(width, height) * 0.13);
    ctx.strokeStyle = "rgba(156, 219, 215, 0.042)";
    for (let x = (width * 0.52) % spacing; x < width; x += spacing) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = (height * 0.5) % spacing; y < height; y += spacing) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
  }

  function toScreen(point) {
    return { x: point.x * view.width, y: point.y * view.height };
  }

  function drawRunway(width, height) {
    const x = width * 0.69;
    const y = height * RUNWAY.threshold.y;
    const runwayWidth = width * 0.295;
    const runwayHeight = clamp(height * 0.074, 28, 58);
    const pulse = 0.65 + Math.sin(state.visualTime * 3.2) * 0.15;

    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.55)";
    ctx.shadowBlur = 22;
    ctx.fillStyle = "#17252a";
    ctx.fillRect(x, y - runwayHeight / 2, runwayWidth, runwayHeight);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(232, 239, 225, 0.48)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y - runwayHeight / 2, runwayWidth, runwayHeight);

    ctx.strokeStyle = "rgba(244, 245, 229, 0.58)";
    ctx.lineWidth = 2;
    ctx.setLineDash([14, 16]);
    ctx.beginPath();
    ctx.moveTo(x + runwayHeight * 1.1, y);
    ctx.lineTo(x + runwayWidth - 8, y);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = "rgba(241, 244, 228, 0.84)";
    for (let stripe = 0; stripe < 5; stripe += 1) {
      ctx.fillRect(
        x + 8,
        y - runwayHeight * 0.38 + stripe * runwayHeight * 0.18,
        runwayHeight * 0.36,
        runwayHeight * 0.07
      );
    }

    for (let lamp = 0; lamp < 13; lamp += 1) {
      const lampX = x + 6 + (lamp / 12) * (runwayWidth - 12);
      ctx.fillStyle = lamp % 3 === 0 ? "#8cf6c7" : "rgba(226, 242, 221, 0.72)";
      ctx.beginPath();
      ctx.arc(lampX, y - runwayHeight * 0.57, 1.8, 0, TAU);
      ctx.arc(lampX, y + runwayHeight * 0.57, 1.8, 0, TAU);
      ctx.fill();
    }

    const threshold = toScreen(RUNWAY.threshold);
    const capture = Math.min(width, height) * RUNWAY.captureRadius;
    ctx.strokeStyle = `rgba(140, 246, 199, ${pulse})`;
    ctx.lineWidth = 2.4;
    ctx.setLineDash([5, 7]);
    ctx.beginPath();
    ctx.arc(threshold.x, threshold.y, capture, Math.PI * 0.8, Math.PI * 1.2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  function drawRoute(plane, route, color, alpha = 1) {
    const start = toScreen({ x: route.sx, y: route.sy });
    const control = toScreen({ x: route.cx, y: route.cy });
    const end = toScreen({ x: route.ex, y: route.ey });
    ctx.save();
    ctx.strokeStyle = color;
    ctx.globalAlpha = alpha * 0.15;
    ctx.lineWidth = clamp(view.width * 0.011, 8, 16);
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.quadraticCurveTo(control.x, control.y, end.x, end.y);
    ctx.stroke();

    ctx.globalAlpha = alpha * 0.9;
    ctx.lineWidth = 2.3;
    ctx.setLineDash([7, 8]);
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.quadraticCurveTo(control.x, control.y, end.x, end.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  function drawPreview() {
    if (!pointer.active || !pointer.moved) return;
    const plane = state.planes.find((item) => item.id === pointer.planeId);
    if (!plane) return;
    const end = { x: pointer.x, y: pointer.y };
    const captured = distance(end, RUNWAY.threshold) <= RUNWAY.captureRadius;
    const route = routeCurve(plane, captured ? RUNWAY.threshold : end, "vector");
    drawRoute(plane, route, captured ? "#8cf6c7" : "#f5f7e8", 0.9);
    const screen = toScreen(captured ? RUNWAY.threshold : end);
    ctx.strokeStyle = captured ? "#8cf6c7" : "rgba(245, 247, 232, 0.78)";
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, 12, 0, TAU);
    ctx.stroke();
  }

  function drawQueuedPlane(plane) {
    const remaining = plane.spawn - state.elapsed;
    if (remaining > 3.5) return;
    const progress = clamp(1 - remaining / 3.5, 0, 1);
    const x = plane.x * view.width;
    const y = plane.y * view.height;
    ctx.save();
    ctx.strokeStyle = "rgba(110, 220, 242, 0.18)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 24, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = "rgba(110, 220, 242, 0.72)";
    ctx.beginPath();
    ctx.arc(x, y, 24, -Math.PI / 2, -Math.PI / 2 + TAU * progress);
    ctx.stroke();
    ctx.restore();
  }

  function drawPlane(plane) {
    if (plane.status === "queued") {
      drawQueuedPlane(plane);
      return;
    }
    if (plane.status === "landed") return;

    const position = toScreen(plane);
    const selected = plane.id === state.selectedId;
    const conflicted = state.conflict && (
      state.conflict.a === plane.id || state.conflict.b === plane.id
    );
    const color = conflicted ? "#ff6d63" : ALTITUDE_COLORS[plane.altitude - 1];
    const unit = clamp(Math.min(view.width, view.height) * 0.024, 13, 23);
    const ring = clamp(Math.min(view.width, view.height) * 0.066, 32, 58);
    const target = tutorialExpectedPlane();
    const tutorialTarget = tutorial.active && target && target.id === plane.id;
    const targetPulse = 1 + Math.sin(state.visualTime * 5) * 0.06;

    ctx.save();
    ctx.translate(position.x, position.y);
    ctx.strokeStyle = color;
    ctx.globalAlpha = selected ? 1 : 0.58;
    ctx.lineWidth = selected ? 2.6 : 1.25;
    ctx.setLineDash(selected ? [] : [5, 7]);
    ctx.beginPath();
    ctx.arc(0, 0, ring, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    if (tutorialTarget) {
      ctx.strokeStyle = tutorial.blockedTime > 0 ? "#ff6d63" : "#ffffff";
      ctx.globalAlpha = 0.38;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, ring * 1.32 * targetPulse, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    ctx.rotate(plane.heading);
    ctx.shadowColor = color;
    ctx.shadowBlur = selected ? 18 : 8;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(unit * 1.15, 0);
    ctx.lineTo(unit * 0.16, -unit * 0.19);
    ctx.lineTo(-unit * 0.5, -unit * 0.78);
    ctx.lineTo(-unit * 0.73, -unit * 0.71);
    ctx.lineTo(-unit * 0.37, -unit * 0.12);
    ctx.lineTo(-unit * 0.82, -unit * 0.08);
    ctx.lineTo(-unit * 1.02, -unit * 0.34);
    ctx.lineTo(-unit * 1.1, -unit * 0.31);
    ctx.lineTo(-unit * 0.96, 0);
    ctx.lineTo(-unit * 1.1, unit * 0.31);
    ctx.lineTo(-unit * 1.02, unit * 0.34);
    ctx.lineTo(-unit * 0.82, unit * 0.08);
    ctx.lineTo(-unit * 0.37, unit * 0.12);
    ctx.lineTo(-unit * 0.73, unit * 0.71);
    ctx.lineTo(-unit * 0.5, unit * 0.78);
    ctx.lineTo(unit * 0.16, unit * 0.19);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    drawAltitudePips(plane, position, color);
  }

  function drawAltitudePips(plane, position, color) {
    const y = position.y + clamp(Math.min(view.width, view.height) * 0.082, 42, 68);
    ctx.save();
    for (let index = 0; index < 3; index += 1) {
      const x = position.x + (index - 1) * 10;
      ctx.fillStyle = index < plane.altitude ? color : "rgba(220, 240, 236, 0.15)";
      ctx.beginPath();
      ctx.arc(x, y, index === plane.altitude - 1 ? 3.5 : 2.6, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawParticles() {
    for (const particle of state.particles) {
      ctx.globalAlpha = clamp(particle.life / particle.maxLife, 0, 1);
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(particle.x * view.width, particle.y * view.height, 2.5, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawConflictMarker() {
    if (!state.conflict) return;
    const a = state.planes.find((plane) => plane.id === state.conflict.a);
    const b = state.planes.find((plane) => plane.id === state.conflict.b);
    if (!a || !b) return;
    const aPoint = toScreen(projectedPoint(a, state.conflict.seconds));
    const bPoint = toScreen(projectedPoint(b, state.conflict.seconds));
    const x = (aPoint.x + bPoint.x) * 0.5;
    const y = (aPoint.y + bPoint.y) * 0.5;
    const pulse = 1 + Math.sin(state.visualTime * 7) * 0.1;
    const radius = 16 * pulse;
    ctx.save();
    ctx.fillStyle = "rgba(255, 109, 99, 0.16)";
    ctx.strokeStyle = "#ff6d63";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y - radius);
    ctx.lineTo(x + radius * 0.86, y + radius * 0.55);
    ctx.lineTo(x - radius * 0.86, y + radius * 0.55);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function drawTutorial() {
    if (!tutorial.active) return;
    const target = tutorialExpectedPlane();
    if (!target) return;
    const position = toScreen(target);
    const ring = clamp(Math.min(view.width, view.height) * 0.09, 48, 76);
    const routeStep = tutorial.step === "route_solo" ||
      tutorial.step === "route_pair_a" ||
      tutorial.step === "route_pair_b";

    ctx.save();
    ctx.fillStyle = tutorial.blockedTime > 0
      ? "rgba(48, 7, 10, 0.48)"
      : "rgba(1, 7, 11, 0.46)";
    ctx.beginPath();
    ctx.rect(0, 0, view.width, view.height);
    ctx.arc(position.x, position.y, ring, 0, TAU);
    if (routeStep) {
      const threshold = toScreen(RUNWAY.threshold);
      ctx.arc(threshold.x, threshold.y, ring * 1.05, 0, TAU);
    }
    ctx.fill("evenodd");

    if (routeStep) {
      const threshold = toScreen(RUNWAY.threshold);
      const progress = (state.visualTime * 0.42) % 1;
      const x = position.x + (threshold.x - position.x) * progress;
      const y = position.y + (threshold.y - position.y) * progress;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.46)";
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 9]);
      ctx.beginPath();
      ctx.moveTo(position.x, position.y);
      ctx.lineTo(threshold.x, threshold.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#ffffff";
      ctx.shadowColor = "#ffffff";
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.arc(x, y, 7, 0, TAU);
      ctx.fill();
    } else if (tutorial.step === "separate") {
      const pulse = 1 + Math.sin(state.visualTime * 6) * 0.12;
      ctx.strokeStyle = "#ffffff";
      ctx.globalAlpha = 0.7;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(position.x, position.y, ring * pulse, 0, TAU);
      ctx.stroke();
    }

    ctx.globalAlpha = 1;
    ctx.shadowColor = "rgba(0, 0, 0, 0.6)";
    ctx.shadowBlur = 16;
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `950 ${clamp(Math.min(view.width, view.height) * 0.072, 30, 58)}px ui-sans-serif, system-ui`;
    ctx.fillText(routeStep ? "DRAG" : "TAP", view.width * 0.5, view.height * 0.87);
    ctx.restore();
  }

  function drawModeOverlay() {
    if (state.mode === "playing" && tutorial.celebrateTime <= 0) return;
    ctx.save();
    if (state.mode === "failure") {
      ctx.fillStyle = "rgba(34, 2, 5, 0.62)";
      ctx.fillRect(0, 0, view.width, view.height);
      const size = clamp(Math.min(view.width, view.height) * 0.13, 58, 104);
      const x = view.width * 0.5;
      const y = view.height * 0.5;
      ctx.strokeStyle = "#ff6d63";
      ctx.lineWidth = clamp(size * 0.08, 5, 9);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(x - size * 0.32, y - size * 0.32);
      ctx.lineTo(x + size * 0.32, y + size * 0.32);
      ctx.moveTo(x + size * 0.32, y - size * 0.32);
      ctx.lineTo(x - size * 0.32, y + size * 0.32);
      ctx.stroke();
      ctx.globalAlpha = 0.78;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y + size * 1.05, size * 0.28, -Math.PI * 0.25, Math.PI * 1.35);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x - size * 0.32, y + size * 0.88);
      ctx.lineTo(x - size * 0.08, y + size * 0.82);
      ctx.lineTo(x - size * 0.13, y + size * 1.05);
      ctx.closePath();
      ctx.fillStyle = "#ff6d63";
      ctx.fill();
    } else {
      ctx.fillStyle = "rgba(2, 14, 16, 0.34)";
      ctx.fillRect(0, 0, view.width, view.height);
      const scale = clamp(Math.min(view.width, view.height) * 0.12, 52, 92);
      const x = view.width * 0.5;
      const y = view.height * 0.5;
      ctx.strokeStyle = "#8cf6c7";
      ctx.lineWidth = clamp(scale * 0.09, 5, 9);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(x - scale * 0.45, y);
      ctx.lineTo(x - scale * 0.08, y + scale * 0.35);
      ctx.lineTo(x + scale * 0.52, y - scale * 0.38);
      ctx.stroke();
    }
    ctx.restore();
  }

  function draw() {
    if (view.width <= 1 || view.height <= 1) return;
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.clearRect(0, 0, view.width, view.height);
    drawBackground(view.width, view.height);
    drawRunway(view.width, view.height);
    for (const plane of state.planes) {
      if (plane.route && plane.status !== "landed") {
        const conflicted = state.conflict && (
          state.conflict.a === plane.id || state.conflict.b === plane.id
        );
        drawRoute(
          plane,
          plane.route,
          conflicted ? "#ff6d63" : ALTITUDE_COLORS[plane.altitude - 1],
          plane.id === state.selectedId ? 1 : 0.55
        );
      }
    }
    drawPreview();
    for (const plane of state.planes) drawPlane(plane);
    drawConflictMarker();
    drawParticles();
    drawTutorial();
    drawModeOverlay();
  }

  function canvasPoint(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: clamp((event.clientX - rect.left) / rect.width, 0, 1),
      y: clamp((event.clientY - rect.top) / rect.height, 0, 1)
    };
  }

  function nearestPlane(point) {
    let nearest = null;
    let best = Infinity;
    const radiusX = clamp(64 / Math.max(1, view.width), 0.07, 0.18);
    const radiusY = clamp(64 / Math.max(1, view.height), 0.08, 0.2);
    for (const plane of activePlanes()) {
      const scaled = Math.hypot(
        (plane.x - point.x) / radiusX,
        (plane.y - point.y) / radiusY
      );
      if (scaled < 1.25 && scaled < best) {
        best = scaled;
        nearest = plane;
      }
    }
    return nearest;
  }

  function resetPointer() {
    pointer.active = false;
    pointer.id = null;
    pointer.planeId = null;
    pointer.moved = false;
  }

  function retryStage() {
    if (state.mode !== "failure") return;
    state.retryCount += 1;
    initStage(state.stage);
    announce("Stage reset.");
  }

  function onPointerDown(event) {
    ensureAudio();
    if (state.mode === "failure") {
      event.preventDefault();
      retryStage();
      return;
    }
    if (state.mode !== "playing") return;
    const point = canvasPoint(event);
    const plane = nearestPlane(point);
    if (!plane) {
      if (tutorial.active) tutorialBlocked();
      return;
    }
    const expected = tutorialExpectedPlane();
    if (tutorial.active && expected && expected.id !== plane.id) {
      tutorialBlocked();
      return;
    }
    event.preventDefault();
    canvas.setPointerCapture(event.pointerId);
    state.selectedId = plane.id;
    pointer.active = true;
    pointer.id = event.pointerId;
    pointer.planeId = plane.id;
    pointer.startX = point.x;
    pointer.startY = point.y;
    pointer.startClientX = event.clientX;
    pointer.startClientY = event.clientY;
    pointer.x = point.x;
    pointer.y = point.y;
    pointer.moved = false;
    draw();
  }

  function onPointerMove(event) {
    if (!pointer.active || event.pointerId !== pointer.id) return;
    event.preventDefault();
    const point = canvasPoint(event);
    pointer.x = point.x;
    pointer.y = point.y;
    pointer.moved = Math.hypot(
      event.clientX - pointer.startClientX,
      event.clientY - pointer.startClientY
    ) >= 11;
    draw();
  }

  function onPointerUp(event) {
    if (!pointer.active || event.pointerId !== pointer.id) return;
    event.preventDefault();
    const plane = state.planes.find((item) => item.id === pointer.planeId);
    const point = canvasPoint(event);
    if (pointer.moved && plane) {
      assignRoute(plane, point);
    } else if (plane) {
      cycleAltitude(plane);
    }
    resetPointer();
    draw();
  }

  function onPointerCancel(event) {
    if (!pointer.active || event.pointerId !== pointer.id) return;
    resetPointer();
    draw();
  }

  function selectNext() {
    if (tutorial.active) {
      tutorialBlocked();
      return;
    }
    const planes = activePlanes();
    if (!planes.length) return;
    const index = planes.findIndex((plane) => plane.id === state.selectedId);
    const next = planes[(index + 1 + planes.length) % planes.length];
    state.selectedId = next.id;
    announce("Aircraft selected.");
    draw();
  }

  function toggleMute() {
    state.muted = !state.muted;
    if (!state.muted) {
      ensureAudio();
      tone(520, 0.08, "sine", 0.02);
    }
    announce(state.muted ? "Sound off." : "Sound on.");
  }

  async function toggleFullscreen() {
    try {
      if (!document.fullscreenElement) await shell.requestFullscreen();
      else await document.exitFullscreen();
    } catch (_) {
      announce("Fullscreen unavailable.");
    }
  }

  function resizeCanvas(entry) {
    const rect = canvas.getBoundingClientRect();
    const dpr = clamp(window.devicePixelRatio || 1, 1, 2.5);
    const deviceSize = entry && entry.devicePixelContentBoxSize
      ? entry.devicePixelContentBoxSize[0]
      : null;
    const pixelWidth = Math.max(
      1,
      deviceSize ? deviceSize.inlineSize : Math.round(rect.width * dpr)
    );
    const pixelHeight = Math.max(
      1,
      deviceSize ? deviceSize.blockSize : Math.round(rect.height * dpr)
    );
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    view.width = Math.max(1, rect.width);
    view.height = Math.max(1, rect.height);
    view.dpr = deviceSize ? pixelWidth / view.width : dpr;
    draw();
  }

  function gameLoop(now) {
    const dt = clamp((now - lastFrame) / 1000, 0, 0.05);
    lastFrame = now;
    update(dt);
    draw();
    requestAnimationFrame(gameLoop);
  }

  function tutorialTargetInfo() {
    const plane = tutorialExpectedPlane();
    if (!plane) return null;
    return {
      plane_id: plane.id,
      plane: { x: Number(plane.x.toFixed(3)), y: Number(plane.y.toFixed(3)) },
      runway: { x: RUNWAY.threshold.x, y: RUNWAY.threshold.y }
    };
  }

  function tutorialInfo() {
    return {
      active: tutorial.active,
      done: tutorial.done,
      step: tutorial.step,
      blocked: tutorial.blockedTime > 0,
      target: tutorialTargetInfo()
    };
  }

  function renderGameToText() {
    const plane = selectedPlane();
    return JSON.stringify({
      coordinate_system: "normalized canvas coordinates; origin top-left; x right; y down; runway threshold at (0.725, 0.710)",
      mode: state.mode,
      stage: state.stage,
      elapsed_seconds: Number(state.elapsed.toFixed(2)),
      selected_callsign: plane ? plane.id : null,
      selected_altitude: plane ? plane.altitude : null,
      route_commands: state.routeCommands,
      altitude_changes: state.altitudeChanges,
      landed_stage: state.landedStage,
      landed_total: save.totalLanded,
      stage_planes: state.planes.length,
      failure_reason: state.failureReason || null,
      retry_count: state.retryCount,
      best_stage: save.bestStage,
      shifts_completed: save.shiftsCompleted,
      transition_seconds: Number(Math.max(0, state.transitionTime).toFixed(2)),
      conflict: state.conflict
        ? {
            callsigns: `${state.conflict.a} + ${state.conflict.b}`,
            seconds: state.conflict.seconds,
            altitude: state.conflict.altitude
          }
        : null,
      tutorial: tutorialInfo(),
      planes: state.planes.map((item) => ({
        id: item.id,
        x: Number(item.x.toFixed(3)),
        y: Number(item.y.toFixed(3)),
        altitude: item.altitude,
        status: item.status,
        route_set: Boolean(item.route),
        spawns_in: item.status === "queued"
          ? Number(Math.max(0, item.spawn - state.elapsed).toFixed(1))
          : 0
      }))
    });
  }

  window.render_game_to_text = renderGameToText;
  window.advanceTime = (milliseconds) => {
    const total = clamp(Number(milliseconds) || 0, 0, 600000) / 1000;
    const step = 1 / 60;
    let remaining = total;
    while (remaining > 0) {
      const dt = Math.min(step, remaining);
      update(dt);
      remaining -= dt;
    }
    draw();
    return renderGameToText();
  };

  window.__tutorialInfo = tutorialInfo;
  window.__tutorialReset = () => {
    try {
      localStorage.removeItem(TUTORIAL_KEY);
    } catch (_) {
      // Session reset still works without storage.
    }
    tutorial.active = true;
    tutorial.done = false;
    tutorial.step = "route_solo";
    tutorial.blockedTime = 0;
    tutorial.celebrateTime = 0;
    initStage(1);
    announce("Drag the highlighted aircraft to the runway.");
    return tutorialInfo();
  };
  window.__tutorialSkip = () => {
    tutorial.active = false;
    tutorial.done = true;
    tutorial.step = "done";
    tutorial.blockedTime = 0;
    persistTutorial();
    draw();
    return tutorialInfo();
  };

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerCancel);
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  retryButton.addEventListener("click", retryStage);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Tab" && state.mode === "playing") {
      event.preventDefault();
      selectNext();
    } else if (event.key === "Enter" && state.mode === "playing") {
      event.preventDefault();
      clearSelected("keyboard");
    } else if ((event.key === "a" || event.key === "A") && state.mode === "playing") {
      event.preventDefault();
      cycleAltitude();
    } else if ((event.key === "r" || event.key === "R") && state.mode === "failure") {
      event.preventDefault();
      retryStage();
    } else if (event.key === "m" || event.key === "M") {
      toggleMute();
    } else if (event.key === "f" || event.key === "F") {
      toggleFullscreen();
    }
  });

  document.addEventListener("visibilitychange", () => {
    state.pausedForVisibility = document.hidden;
    lastFrame = performance.now();
  });
  document.addEventListener("fullscreenchange", () => resizeCanvas());
  window.addEventListener("resize", () => resizeCanvas());

  if (window.ResizeObserver) {
    const supportsDevicePixels = typeof ResizeObserverEntry !== "undefined" &&
      "devicePixelContentBoxSize" in ResizeObserverEntry.prototype;
    const resizeObserver = new ResizeObserver(([entry]) => resizeCanvas(entry));
    resizeObserver.observe(
      airspace,
      supportsDevicePixels ? { box: "device-pixel-content-box" } : undefined
    );
  }

  initStage(1);
  resizeCanvas();
  if (tutorial.active) announce("Drag the highlighted aircraft to the runway.");
  requestAnimationFrame(gameLoop);
})();
