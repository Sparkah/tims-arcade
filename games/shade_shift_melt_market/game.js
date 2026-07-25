(() => {
  "use strict";

  const canvas = document.querySelector("#game-canvas");
  const ctx = canvas.getContext("2d", { alpha: false });
  const shell = document.querySelector("#game-shell");
  const overlay = document.querySelector("#game-overlay");
  const overlayTitle = document.querySelector("#overlay-title");
  const overlayCopy = document.querySelector("#overlay-copy");
  const startButton = document.querySelector("#start-btn");
  const restartButton = document.querySelector("#restart-btn");
  const muteButton = document.querySelector("#mute-btn");
  const liveStatus = document.querySelector("#game-status");

  const ROUND_SECONDS = 60;
  const MESSAGE_HOLD_SECONDS = 0.9;
  const MELT_RATES = {
    sun: 0.05,
    shade: 0.006,
  };
  const STATE_BANDS = [
    { key: "frozen", label: "FROZEN", min: 0, max: 0.32 },
    { key: "soft", label: "SOFT", min: 0.32, max: 0.68 },
    { key: "drippy", label: "DRIPPY", min: 0.68, max: 1 },
  ];
  const TREATS = [
    { name: "MANGO POP", short: "MANGO", color: "#f28a45", accent: "#e84f68", speed: 0.92, shape: "pop" },
    { name: "LEMON POP", short: "LEMON", color: "#f6d452", accent: "#f49d37", speed: 1, shape: "pop" },
    { name: "BERRY CUP", short: "BERRY", color: "#a66bd5", accent: "#ed6f9f", speed: 0.84, shape: "cup" },
    { name: "COCONUT SCOOP", short: "COCONUT", color: "#f4f0dc", accent: "#68bca3", speed: 1.08, shape: "scoop" },
  ];
  const ORDER_SEQUENCE = [
    { slot: 1, target: "soft" },
    { slot: 3, target: "drippy" },
    { slot: 0, target: "drippy" },
    { slot: 2, target: "drippy" },
    { slot: 1, target: "drippy" },
    { slot: 3, target: "drippy" },
    { slot: 2, target: "drippy" },
    { slot: 0, target: "drippy" },
  ];

  const initialMelts = [0.08, 0.02, 0.16, 0.1];
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  const state = {
    mode: "ready",
    simulatedMs: 0,
    score: 0,
    misses: 0,
    timeLeft: ROUND_SECONDS,
    orderIndex: 0,
    umbrellaX: 0,
    draggingUmbrella: false,
    pointerId: null,
    treats: [],
    message: "MOVE SHADE OFF LEMON",
    messageTone: "neutral",
    messageAge: 0,
    particles: [],
    shakes: [],
    muted: false,
    pausedByHost: false,
    lastFrame: performance.now(),
  };

  const view = {
    width: 0,
    height: 0,
    dpr: 1,
    hudY: 0,
    counterY: 0,
    treatY: 0,
    umbrellaY: 0,
    treatRadius: 38,
    treatPositions: [],
    shadeRx: 90,
    shadeRy: 56,
    umbrellaMinX: 0,
    umbrellaMaxX: 0,
  };

  let audioContext = null;
  let manualClock = false;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function lerp(a, b, amount) {
    return a + (b - a) * amount;
  }

  function roundedRect(context, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    context.beginPath();
    context.roundRect(x, y, width, height, r);
  }

  function currentOrder() {
    return ORDER_SEQUENCE[state.orderIndex % ORDER_SEQUENCE.length];
  }

  function bandForMelt(melt) {
    if (melt >= 1) {
      return { key: "puddle", label: "PUDDLE", min: 1, max: Infinity };
    }
    return STATE_BANDS.find((band) => melt >= band.min && melt < band.max) || STATE_BANDS[0];
  }

  function resetTreats() {
    state.treats = TREATS.map((definition, index) => ({
      ...definition,
      slot: index,
      melt: initialMelts[index],
      shaded: false,
      flash: 0,
      wobble: 0,
    }));
  }

  function setMessage(text, tone = "neutral", announce = true) {
    state.message = text;
    state.messageTone = tone;
    state.messageAge = 0;
    if (announce) {
      liveStatus.textContent = text;
    }
  }

  function resizeCanvas() {
    const rect = shell.getBoundingClientRect();
    const width = Math.max(320, rect.width);
    const height = Math.max(320, rect.height);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const previousMinX = view.umbrellaMinX;
    const previousMaxX = view.umbrellaMaxX;
    const previousUmbrellaX = state.umbrellaX;
    const hadPreviousLayout = previousMaxX > previousMinX && previousUmbrellaX > 0;

    view.width = width;
    view.height = height;
    view.dpr = dpr;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const sidePadding = clamp(width * 0.065, 22, 78);
    const available = width - sidePadding * 2;
    const spacing = available / 4;
    view.treatRadius = clamp(Math.min(spacing * 0.34, height * 0.066), 27, 48);
    view.counterY = clamp(height * 0.68, height - 255, height - 145);
    view.treatY = view.counterY + clamp(height * 0.025, 13, 24);
    const umbrellaOffset =
      height < 500 ? clamp(height * 0.18, 68, 82) : clamp(height * 0.23, 115, 190);
    view.umbrellaY = view.counterY - umbrellaOffset;
    view.shadeRx = clamp(spacing * 0.7, 55, 112);
    view.shadeRy = clamp(height * 0.078, 38, 66);
    view.treatPositions = TREATS.map((_, index) => ({
      x: sidePadding + spacing * (index + 0.5),
      y: view.treatY,
    }));
    view.umbrellaMinX = view.treatPositions[0].x;
    view.umbrellaMaxX = view.treatPositions[3].x;

    if (!state.umbrellaX) {
      state.umbrellaX = view.treatPositions[1].x;
    } else if (hadPreviousLayout) {
      const relativeX = clamp(
        (previousUmbrellaX - previousMinX) / (previousMaxX - previousMinX),
        0,
        1,
      );
      state.umbrellaX = lerp(view.umbrellaMinX, view.umbrellaMaxX, relativeX);
    } else {
      state.umbrellaX = clamp(state.umbrellaX, view.umbrellaMinX, view.umbrellaMaxX);
    }
    render();
  }

  function resetGame() {
    state.mode = "playing";
    state.simulatedMs = 0;
    state.score = 0;
    state.misses = 0;
    state.timeLeft = ROUND_SECONDS;
    state.orderIndex = 0;
    state.draggingUmbrella = false;
    state.pointerId = null;
    state.particles.length = 0;
    state.shakes.length = 0;
    resetTreats();
    state.umbrellaX = view.treatPositions[1]?.x || view.width / 2;
    state.lastFrame = performance.now();
    setMessage("MOVE SHADE OFF LEMON");
    hideOverlay();
    canvas.focus({ preventScroll: true });
    render();
  }

  function showStartOverlay() {
    overlayTitle.textContent = "SHADE SHIFT";
    overlayCopy.textContent = "Move the umbrella. Serve each frozen treat at exactly the requested melt.";
    startButton.textContent = "START MELTING";
    overlay.hidden = false;
  }

  function showResultOverlay() {
    overlayTitle.textContent = `${state.score} SERVED`;
    overlayCopy.textContent =
      state.score === 1
        ? "One perfect summer order. Try another shift?"
        : `${state.score} summer orders in one shift. Try to beat it.`;
    startButton.textContent = "TRY AGAIN";
    overlay.hidden = false;
    startButton.focus({ preventScroll: true });
  }

  function hideOverlay() {
    overlay.hidden = true;
  }

  function ensureAudio() {
    if (!audioContext) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        audioContext = new AudioContextClass();
      }
    }
    if (audioContext?.state === "suspended") {
      audioContext.resume().catch(() => {});
    }
  }

  function playTone(frequency, duration, type = "sine", volume = 0.04, delay = 0) {
    if (state.muted || !audioContext) {
      return;
    }
    const start = audioContext.currentTime + delay;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }

  function playSuccess() {
    playTone(520, 0.12, "triangle", 0.055);
    playTone(760, 0.18, "triangle", 0.045, 0.09);
  }

  function playMiss() {
    playTone(145, 0.14, "square", 0.025);
  }

  function playPuddle() {
    playTone(190, 0.18, "sine", 0.03);
    playTone(110, 0.22, "sine", 0.02, 0.06);
  }

  function updateShadeFlags() {
    for (let index = 0; index < state.treats.length; index += 1) {
      const position = view.treatPositions[index];
      if (!position) {
        continue;
      }
      const dx = (position.x - state.umbrellaX) / view.shadeRx;
      const dy = (position.y - view.treatY) / view.shadeRy;
      state.treats[index].shaded = dx * dx + dy * dy <= 1;
    }
  }

  function spawnServeParticles(slot) {
    if (reduceMotion.matches) {
      return;
    }
    const position = view.treatPositions[slot];
    const colors = ["#fff4b8", "#ffb85c", "#f26f73", "#6dcbb7"];
    for (let index = 0; index < 18; index += 1) {
      const angle = (Math.PI * 2 * index) / 18 + Math.random() * 0.18;
      const speed = 55 + Math.random() * 95;
      state.particles.push({
        x: position.x,
        y: position.y - 15,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 40,
        age: 0,
        life: 0.65 + Math.random() * 0.25,
        color: colors[index % colors.length],
        size: 3 + Math.random() * 4,
      });
    }
  }

  function updateParticles(dt) {
    for (const particle of state.particles) {
      particle.age += dt;
      particle.vy += 130 * dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
    }
    state.particles = state.particles.filter((particle) => particle.age < particle.life);
  }

  function handlePuddle(treat) {
    treat.melt = 0;
    treat.wobble = 0.45;
    state.misses += 1;
    if (currentOrder().slot === treat.slot) {
      setMessage("MELTED AWAY — TRY THE FRESH ONE", "bad");
    } else {
      setMessage(`${treat.short} MELTED — FRESH ONE ADDED`, "bad", false);
    }
    playPuddle();
  }

  function contextualGuidance() {
    const order = currentOrder();
    const treat = state.treats[order.slot];
    const targetBand = STATE_BANDS.find((band) => band.key === order.target);
    const actualBand = bandForMelt(treat.melt);

    if (actualBand.key === order.target) {
      return {
        text: `TAP ${treat.short} NOW`,
        tone: "good",
        announce: true,
      };
    }
    if (treat.melt < targetBand.min) {
      return {
        text: `MOVE SHADE OFF ${treat.short}`,
        tone: "neutral",
        announce: false,
      };
    }
    return {
      text: `TOO LATE — LET ${treat.short} RESET`,
      tone: "bad",
      announce: false,
    };
  }

  function updateContextualGuidance() {
    const isTransient =
      state.message.startsWith("PERFECT") ||
      state.messageTone === "bad" ||
      state.message === "SHADE SLOWS THE MELT";
    if (isTransient && state.messageAge < MESSAGE_HOLD_SECONDS) {
      return;
    }

    const guidance = contextualGuidance();
    if (guidance.text !== state.message) {
      setMessage(guidance.text, guidance.tone, guidance.announce);
    }
  }

  function update(dt) {
    if (state.mode !== "playing" || state.pausedByHost) {
      updateParticles(dt);
      return;
    }

    const safeDt = clamp(dt, 0, 0.1);
    state.simulatedMs += safeDt * 1000;
    state.timeLeft = Math.max(0, state.timeLeft - safeDt);
    state.messageAge += safeDt;
    updateShadeFlags();

    for (const treat of state.treats) {
      const rate = treat.shaded ? MELT_RATES.shade : MELT_RATES.sun;
      treat.melt += rate * treat.speed * safeDt;
      treat.flash = Math.max(0, treat.flash - safeDt * 2.8);
      treat.wobble = Math.max(0, treat.wobble - safeDt);
      if (treat.melt >= 1.04) {
        handlePuddle(treat);
      }
    }

    updateParticles(safeDt);
    updateContextualGuidance();

    if (state.timeLeft <= 0) {
      state.mode = "result";
      setMessage("SHIFT OVER", "neutral");
      showResultOverlay();
    }
  }

  function serveTreat(slot) {
    if (state.mode !== "playing") {
      return;
    }
    ensureAudio();
    const order = currentOrder();
    const treat = state.treats[slot];
    if (!treat) {
      return;
    }

    if (slot !== order.slot) {
      setMessage(`ORDER IS ${state.treats[order.slot].short}`, "bad");
      treat.wobble = 0.28;
      playMiss();
      return;
    }

    const actual = bandForMelt(treat.melt);
    if (actual.key !== order.target) {
      const targetBand = STATE_BANDS.find((band) => band.key === order.target);
      if (treat.melt < targetBand.min) {
        setMessage("NEEDS MORE SUN", "bad");
      } else {
        setMessage("TOO MELTY — SHADE THE FRESH ONE", "bad");
      }
      state.misses += 1;
      treat.wobble = 0.4;
      playMiss();
      return;
    }

    state.score += 1;
    treat.flash = 1;
    spawnServeParticles(slot);
    playSuccess();
    setMessage(`PERFECT ${treat.short}`, "good");
    treat.melt = 0;
    state.orderIndex += 1;
  }

  function pointerPosition(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * view.width,
      y: ((event.clientY - rect.top) / rect.height) * view.height,
    };
  }

  function umbrellaHit(position) {
    const canopyRadius = clamp(view.treatRadius * 1.5, 46, 68);
    const dx = position.x - state.umbrellaX;
    const dy = position.y - view.umbrellaY;
    const canopy = dx * dx + dy * dy <= canopyRadius * canopyRadius;
    const pole =
      Math.abs(dx) <= 24 &&
      position.y >= view.umbrellaY &&
      position.y <= view.treatY - view.treatRadius;
    return canopy || pole;
  }

  function hitTreat(position) {
    for (let index = 0; index < view.treatPositions.length; index += 1) {
      const treatPosition = view.treatPositions[index];
      const dx = position.x - treatPosition.x;
      const dy = position.y - treatPosition.y;
      const hitRadius = Math.max(34, view.treatRadius * 1.25);
      if (dx * dx + dy * dy <= hitRadius * hitRadius) {
        return index;
      }
    }
    return -1;
  }

  function onPointerDown(event) {
    if (state.mode !== "playing") {
      return;
    }
    const position = pointerPosition(event);
    if (umbrellaHit(position)) {
      state.draggingUmbrella = true;
      state.pointerId = event.pointerId;
      canvas.setPointerCapture(event.pointerId);
      state.umbrellaX = clamp(position.x, view.umbrellaMinX, view.umbrellaMaxX);
      setMessage("SHADE SLOWS THE MELT", "neutral", false);
      event.preventDefault();
      return;
    }
    const slot = hitTreat(position);
    if (slot >= 0) {
      serveTreat(slot);
      event.preventDefault();
    }
  }

  function onPointerMove(event) {
    if (!state.draggingUmbrella || event.pointerId !== state.pointerId) {
      return;
    }
    const position = pointerPosition(event);
    state.umbrellaX = clamp(position.x, view.umbrellaMinX, view.umbrellaMaxX);
    updateShadeFlags();
    event.preventDefault();
  }

  function endPointer(event) {
    if (event.pointerId !== state.pointerId) {
      return;
    }
    state.draggingUmbrella = false;
    state.pointerId = null;
    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
  }

  function onKeyDown(event) {
    if (event.code === "KeyM") {
      toggleMute();
      return;
    }
    if (event.code === "KeyR") {
      resetGame();
      return;
    }
    if (event.code === "KeyF") {
      toggleFullscreen();
      return;
    }
    if (state.mode !== "playing") {
      return;
    }
    if (event.code === "ArrowLeft" || event.code === "ArrowRight") {
      const direction = event.code === "ArrowLeft" ? -1 : 1;
      state.umbrellaX = clamp(
        state.umbrellaX + direction * Math.max(24, view.width * 0.035),
        view.umbrellaMinX,
        view.umbrellaMaxX,
      );
      setMessage("SHADE SLOWS THE MELT", "neutral", false);
      event.preventDefault();
      return;
    }
    if (/^Digit[1-4]$/.test(event.code)) {
      serveTreat(Number(event.code.slice(-1)) - 1);
      event.preventDefault();
    }
  }

  function toggleMute() {
    state.muted = !state.muted;
    muteButton.textContent = state.muted ? "SOUND OFF" : "SOUND ON";
    muteButton.setAttribute("aria-pressed", String(state.muted));
    if (!state.muted) {
      ensureAudio();
      playTone(440, 0.09, "sine", 0.035);
    }
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      shell.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  }

  function drawBeach() {
    const sky = ctx.createLinearGradient(0, 0, 0, view.counterY);
    sky.addColorStop(0, "#78d6eb");
    sky.addColorStop(0.62, "#bfeaf0");
    sky.addColorStop(1, "#f6dda1");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, view.width, view.height);

    const horizon = view.counterY * 0.56;
    ctx.fillStyle = "#53bdd0";
    ctx.fillRect(0, horizon, view.width, Math.max(65, view.counterY - horizon));

    ctx.strokeStyle = "rgba(255,255,255,0.7)";
    ctx.lineWidth = 3;
    for (let row = 0; row < 4; row += 1) {
      const y = horizon + 18 + row * 18;
      ctx.beginPath();
      for (let x = -30; x <= view.width + 30; x += 50) {
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + 12, y - 5, x + 24, y);
      }
      ctx.stroke();
    }

    ctx.fillStyle = "#f2d588";
    ctx.fillRect(0, view.counterY - 52, view.width, view.height - view.counterY + 52);

    ctx.fillStyle = "rgba(255,255,255,0.34)";
    for (let index = 0; index < 14; index += 1) {
      const x = ((index * 97) % Math.max(1, view.width - 20)) + 10;
      const y = view.counterY - 38 + ((index * 31) % 44);
      ctx.beginPath();
      ctx.arc(x, y, 2 + (index % 3), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawCounter() {
    const topHeight = clamp(view.height * 0.13, 82, 116);
    ctx.fillStyle = "#fff6d7";
    ctx.fillRect(0, view.counterY - 34, view.width, topHeight);

    ctx.fillStyle = "#47a9ad";
    ctx.fillRect(0, view.counterY + topHeight - 34, view.width, view.height);

    const stripeWidth = clamp(view.width / 12, 44, 92);
    for (let x = 0; x < view.width; x += stripeWidth) {
      ctx.fillStyle = Math.floor(x / stripeWidth) % 2 === 0 ? "#3d949b" : "#58b6b3";
      ctx.fillRect(x, view.counterY + topHeight - 34, stripeWidth, view.height);
    }

    ctx.fillStyle = "#255f68";
    ctx.fillRect(0, view.counterY + topHeight - 34, view.width, 7);
  }

  function drawShade() {
    const shadeY = view.treatY + view.treatRadius * 0.45;
    const shadeGradient = ctx.createRadialGradient(
      state.umbrellaX,
      shadeY,
      8,
      state.umbrellaX,
      shadeY,
      view.shadeRx,
    );
    shadeGradient.addColorStop(0, "rgba(42,78,112,0.35)");
    shadeGradient.addColorStop(1, "rgba(42,78,112,0.08)");
    ctx.save();
    ctx.translate(state.umbrellaX, shadeY);
    ctx.scale(1, view.shadeRy / view.shadeRx);
    ctx.fillStyle = shadeGradient;
    ctx.beginPath();
    ctx.arc(0, 0, view.shadeRx, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawUmbrella() {
    const radius = clamp(view.treatRadius * 1.5, 46, 68);
    const x = state.umbrellaX;
    const y = view.umbrellaY;

    ctx.save();
    ctx.strokeStyle = "#244c5b";
    ctx.lineWidth = 7;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x, y + radius * 0.22);
    ctx.lineTo(x, view.treatY - view.treatRadius * 0.65);
    ctx.stroke();

    ctx.fillStyle = "#f36e61";
    ctx.beginPath();
    ctx.arc(x, y, radius, Math.PI, Math.PI * 2);
    ctx.lineTo(x + radius, y + 4);
    for (let segment = 4; segment >= 0; segment -= 1) {
      const sx = x - radius + (segment * radius * 2) / 4;
      ctx.quadraticCurveTo(sx - radius * 0.16, y + radius * 0.24, sx, y + 4);
    }
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#ffd45b";
    ctx.beginPath();
    ctx.moveTo(x, y - radius);
    ctx.arc(x, y, radius, Math.PI * 1.25, Math.PI * 1.75);
    ctx.lineTo(x, y + 4);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#244c5b";
    ctx.beginPath();
    ctx.arc(x, y - radius, 6, 0, Math.PI * 2);
    ctx.fill();

    ctx.font = `800 ${clamp(view.width * 0.018, 13, 18)}px "Trebuchet MS", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#203947";
    ctx.fillText(state.draggingUmbrella ? "MOVING" : "DRAG", x, y - radius * 0.36);
    ctx.restore();
  }

  function drawPop(treat, x, y, radius, melt) {
    const bodyHeight = radius * lerp(1.65, 1.3, melt);
    const bodyWidth = radius * 1.2;
    ctx.fillStyle = "#ba8151";
    roundedRect(ctx, x - radius * 0.13, y + radius * 0.34, radius * 0.26, radius * 0.86, 5);
    ctx.fill();

    const gradient = ctx.createLinearGradient(x - bodyWidth / 2, y - bodyHeight, x + bodyWidth / 2, y);
    gradient.addColorStop(0, treat.color);
    gradient.addColorStop(1, treat.accent);
    ctx.fillStyle = gradient;
    roundedRect(ctx, x - bodyWidth / 2, y - bodyHeight * 0.72, bodyWidth, bodyHeight, radius * 0.34);
    ctx.fill();

    if (melt > 0.55) {
      ctx.fillStyle = treat.accent;
      const drip = radius * (0.18 + melt * 0.28);
      ctx.beginPath();
      ctx.ellipse(x + radius * 0.31, y + radius * 0.2, radius * 0.11, drip, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawCup(treat, x, y, radius, melt) {
    const cupHeight = radius * 1.24;
    ctx.fillStyle = "#fff1dc";
    ctx.beginPath();
    ctx.moveTo(x - radius * 0.68, y - cupHeight * 0.5);
    ctx.lineTo(x + radius * 0.68, y - cupHeight * 0.5);
    ctx.lineTo(x + radius * 0.5, y + cupHeight * 0.58);
    ctx.lineTo(x - radius * 0.5, y + cupHeight * 0.58);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#6f3d79";
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = treat.color;
    ctx.beginPath();
    ctx.ellipse(x, y - cupHeight * 0.5, radius * 0.68, radius * lerp(0.25, 0.12, melt), 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = treat.accent;
    ctx.beginPath();
    ctx.arc(x - radius * 0.18, y - cupHeight * 0.62, radius * 0.27, 0, Math.PI * 2);
    ctx.arc(x + radius * 0.18, y - cupHeight * 0.65, radius * 0.24, 0, Math.PI * 2);
    ctx.fill();

    if (melt > 0.65) {
      ctx.fillStyle = treat.accent;
      ctx.fillRect(x + radius * 0.52, y - radius * 0.25, radius * 0.11, radius * melt);
    }
  }

  function drawScoop(treat, x, y, radius, melt) {
    ctx.fillStyle = "#8a5736";
    ctx.beginPath();
    ctx.arc(x, y + radius * 0.18, radius * 0.72, 0, Math.PI);
    ctx.lineTo(x - radius * 0.72, y + radius * 0.18);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = treat.color;
    ctx.beginPath();
    ctx.ellipse(x, y - radius * 0.35, radius * lerp(0.68, 0.8, melt), radius * lerp(0.62, 0.34, melt), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#d1c8aa";
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = treat.accent;
    ctx.beginPath();
    ctx.arc(x + radius * 0.15, y - radius * 0.48, radius * 0.1, 0, Math.PI * 2);
    ctx.fill();

    if (melt > 0.62) {
      ctx.fillStyle = "#e9e3c9";
      ctx.beginPath();
      ctx.ellipse(x - radius * 0.42, y + radius * 0.25, radius * 0.2, radius * 0.42 * melt, 0.15, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawTreat(treat, position, index) {
    const band = bandForMelt(treat.melt);
    const order = currentOrder();
    const isTarget = order.slot === index;
    const radius = view.treatRadius;
    const wobble = reduceMotion.matches ? 0 : Math.sin(treat.wobble * 35) * treat.wobble * 10;

    ctx.save();
    ctx.translate(position.x + wobble, position.y);

    if (isTarget) {
      ctx.strokeStyle = "#243c55";
      ctx.lineWidth = 5;
      ctx.setLineDash([8, 7]);
      ctx.beginPath();
      ctx.arc(0, -radius * 0.2, radius * 1.16, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = "#243c55";
      ctx.font = `900 ${clamp(radius * 0.34, 12, 16)}px "Trebuchet MS", sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText("ORDER", 0, -radius * 1.55);
    }

    if (treat.flash > 0) {
      ctx.globalAlpha = 0.25 + treat.flash * 0.5;
      ctx.fillStyle = "#fff8b5";
      ctx.beginPath();
      ctx.arc(0, -radius * 0.25, radius * (1.25 + treat.flash * 0.25), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    if (treat.shape === "pop") {
      drawPop(treat, 0, 0, radius, treat.melt);
    } else if (treat.shape === "cup") {
      drawCup(treat, 0, 0, radius, treat.melt);
    } else {
      drawScoop(treat, 0, 0, radius, treat.melt);
    }

    const ringY = radius * 1.43;
    ctx.strokeStyle = "rgba(36,60,85,0.18)";
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(0, ringY, radius * 0.31, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle =
      band.key === "frozen" ? "#4ebbd0" : band.key === "soft" ? "#f0a23a" : "#e85e72";
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(0, ringY, radius * 0.31, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp(treat.melt, 0.02, 1));
    ctx.stroke();

    ctx.fillStyle = "#203947";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `900 ${clamp(radius * 0.32, 11, 15)}px "Trebuchet MS", sans-serif`;
    ctx.fillText(band.label, 0, ringY + radius * 0.75);

    if (treat.shaded) {
      ctx.fillStyle = "#325f78";
      ctx.font = `800 ${clamp(radius * 0.28, 10, 13)}px "Trebuchet MS", sans-serif`;
      ctx.fillText("SHADED", 0, ringY + radius * 1.12);
    }
    ctx.restore();
  }

  function drawHud() {
    const order = currentOrder();
    const targetTreat = state.treats[order.slot];
    const targetBand = STATE_BANDS.find((band) => band.key === order.target);
    const compact = view.width < 560;
    const panelWidth = Math.min(view.width - 32, 620);
    const panelHeight = compact ? 112 : clamp(view.height * 0.115, 76, 96);
    const panelX = (view.width - panelWidth) / 2;
    const panelY = clamp(view.height * 0.035, 18, 32);

    ctx.fillStyle = "rgba(255,250,225,0.94)";
    roundedRect(ctx, panelX, panelY, panelWidth, panelHeight, 18);
    ctx.fill();
    ctx.strokeStyle = "#243c55";
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = "#d65348";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `900 ${clamp(view.width * 0.018, 13, 19)}px "Trebuchet MS", sans-serif`;
    ctx.fillText("SERVE", view.width / 2, panelY + panelHeight * (compact ? 0.2 : 0.26));

    const orderFont = clamp(Math.min(view.width * 0.04, panelHeight * 0.4), 23, 38);
    ctx.fillStyle = "#203947";
    ctx.font = `900 ${orderFont}px "Arial Black", "Trebuchet MS", sans-serif`;
    ctx.fillText(
      `${targetBand.label} ${targetTreat.name}`,
      view.width / 2,
      panelY + panelHeight * (compact ? 0.5 : 0.66),
      panelWidth - 34,
    );

    ctx.fillStyle = "#203947";
    if (compact) {
      ctx.font = `900 12px "Trebuchet MS", sans-serif`;
      ctx.textAlign = "left";
      ctx.fillText(`${state.score} SERVED`, panelX + 16, panelY + panelHeight * 0.82);
      ctx.textAlign = "right";
      ctx.fillText(`${Math.ceil(state.timeLeft)} SECONDS`, panelX + panelWidth - 16, panelY + panelHeight * 0.82);
    } else {
      ctx.font = `900 ${clamp(view.width * 0.025, 18, 29)}px "Arial Black", "Trebuchet MS", sans-serif`;
      ctx.textAlign = "left";
      ctx.fillText(`${state.score}`, clamp(view.width * 0.035, 14, 40), panelY + panelHeight * 0.58);
      ctx.font = `800 ${clamp(view.width * 0.012, 10, 14)}px "Trebuchet MS", sans-serif`;
      ctx.fillText("SERVED", clamp(view.width * 0.035, 14, 40), panelY + panelHeight * 0.83);

      ctx.textAlign = "right";
      ctx.font = `900 ${clamp(view.width * 0.025, 18, 29)}px "Arial Black", "Trebuchet MS", sans-serif`;
      ctx.fillText(`${Math.ceil(state.timeLeft)}`, view.width - clamp(view.width * 0.035, 14, 40), panelY + panelHeight * 0.58);
      ctx.font = `800 ${clamp(view.width * 0.012, 10, 14)}px "Trebuchet MS", sans-serif`;
      ctx.fillText("SECONDS", view.width - clamp(view.width * 0.035, 14, 40), panelY + panelHeight * 0.83);
    }

    const messageY = panelY + panelHeight + clamp(view.height * 0.03, 18, 28);
    ctx.textAlign = "center";
    ctx.font = `900 ${clamp(view.width * 0.02, 14, 21)}px "Trebuchet MS", sans-serif`;
    ctx.fillStyle =
      state.messageTone === "good" ? "#16754f" : state.messageTone === "bad" ? "#b6383c" : "#203947";
    ctx.fillText(state.message, view.width / 2, messageY);
  }

  function drawParticles() {
    for (const particle of state.particles) {
      const progress = particle.age / particle.life;
      ctx.globalAlpha = 1 - progress;
      ctx.fillStyle = particle.color;
      ctx.save();
      ctx.translate(particle.x, particle.y);
      ctx.rotate(progress * 2.4);
      ctx.fillRect(-particle.size / 2, -particle.size / 2, particle.size, particle.size * 1.6);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  function render() {
    if (!view.width || !view.height) {
      return;
    }
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.clearRect(0, 0, view.width, view.height);
    drawBeach();
    drawCounter();
    drawShade();
    for (let index = 0; index < state.treats.length; index += 1) {
      drawTreat(state.treats[index], view.treatPositions[index], index);
    }
    drawUmbrella();
    drawParticles();
    drawHud();
  }

  function frame(timestamp) {
    const dt = Math.min(0.1, (timestamp - state.lastFrame) / 1000 || 0);
    state.lastFrame = timestamp;
    if (!manualClock) {
      update(dt);
    }
    render();
    requestAnimationFrame(frame);
  }

  function renderGameToText() {
    const order = currentOrder();
    const payload = {
      coordinateSystem: "Canvas CSS pixels; origin top-left; x right; y down.",
      mode: state.pausedByHost ? "paused" : state.mode,
      simulatedMs: Math.round(state.simulatedMs),
      viewport: {
        width: Number(view.width.toFixed(1)),
        height: Number(view.height.toFixed(1)),
      },
      timeLeft: Number(state.timeLeft.toFixed(2)),
      score: state.score,
      misses: state.misses,
      message: state.message,
      order: {
        slot: order.slot,
        numberKey: order.slot + 1,
        treat: state.treats[order.slot]?.name || TREATS[order.slot].name,
        targetState: order.target,
      },
      umbrella: {
        x: Number(state.umbrellaX.toFixed(1)),
        y: Number(view.umbrellaY.toFixed(1)),
        shadeRadiusX: Number(view.shadeRx.toFixed(1)),
        dragging: state.draggingUmbrella,
      },
      treats: state.treats.map((treat, index) => ({
        slot: index,
        numberKey: index + 1,
        name: treat.name,
        x: Number((view.treatPositions[index]?.x || 0).toFixed(1)),
        y: Number((view.treatPositions[index]?.y || 0).toFixed(1)),
        melt: Number(treat.melt.toFixed(3)),
        state: bandForMelt(treat.melt).key,
        shaded: treat.shaded,
      })),
    };
    return JSON.stringify(payload, null, 2);
  }

  function advanceTime(ms) {
    manualClock = true;
    const steps = Math.max(1, Math.ceil(ms / (1000 / 60)));
    const stepSeconds = ms / 1000 / steps;
    for (let index = 0; index < steps; index += 1) {
      update(stepSeconds);
    }
    state.lastFrame = performance.now();
    render();
    return Promise.resolve();
  }

  function onVisibilityChange() {
    state.pausedByHost = document.hidden;
    if (document.hidden) {
      audioContext?.suspend().catch(() => {});
    } else if (!state.muted) {
      audioContext?.resume().catch(() => {});
    }
    state.lastFrame = performance.now();
  }

  startButton.addEventListener("click", () => {
    ensureAudio();
    resetGame();
  });
  restartButton.addEventListener("click", () => {
    ensureAudio();
    resetGame();
  });
  muteButton.addEventListener("click", toggleMute);
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("resize", resizeCanvas);
  document.addEventListener("fullscreenchange", resizeCanvas);
  document.addEventListener("visibilitychange", onVisibilityChange);

  window.render_game_to_text = renderGameToText;
  window.advanceTime = advanceTime;
  window.__shadeShift = {
    getLayout: () => ({
      width: view.width,
      height: view.height,
      umbrella: { x: state.umbrellaX, y: view.umbrellaY },
      treats: view.treatPositions.map((position) => ({ ...position })),
    }),
    start: resetGame,
  };

  resetTreats();
  resizeCanvas();
  updateShadeFlags();
  showStartOverlay();
  requestAnimationFrame(frame);
})();
