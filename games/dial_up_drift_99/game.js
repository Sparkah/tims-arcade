(() => {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
  const shell = document.getElementById("game-shell");

  const ui = {
    speed: document.getElementById("speed-value"),
    stage: document.getElementById("stage-label"),
    position: document.getElementById("position-label"),
    checkpoint: document.getElementById("checkpoint-label"),
    progress: document.getElementById("progress-fill"),
    signal: document.getElementById("signal-track"),
    pauseButton: document.getElementById("pause-button"),
    muteButton: document.getElementById("mute-button"),
    fullscreenButton: document.getElementById("fullscreen-button"),
    radio: document.getElementById("radio-caption"),
    cursePanel: document.getElementById("curse-panel"),
    curseName: document.getElementById("curse-name"),
    curseTime: document.getElementById("curse-time"),
    ready: document.getElementById("ready-card"),
    garageButton: document.getElementById("garage-button"),
    controlsButton: document.getElementById("controls-button"),
    upgradeScreen: document.getElementById("upgrade-screen"),
    upgradeTitle: document.getElementById("upgrade-title"),
    upgradeCopy: document.getElementById("upgrade-copy"),
    upgradeChoices: document.getElementById("upgrade-choices"),
    resultScreen: document.getElementById("result-screen"),
    resultTitle: document.getElementById("result-title"),
    resultStamp: document.getElementById("result-stamp"),
    resultCopy: document.getElementById("result-copy"),
    resultStats: document.getElementById("result-stats"),
    retryButton: document.getElementById("retry-button"),
    newCupButton: document.getElementById("new-cup-button"),
    resultGarageButton: document.getElementById("result-garage-button"),
    pauseScreen: document.getElementById("pause-screen"),
    resumeButton: document.getElementById("resume-button"),
    restartButton: document.getElementById("restart-button"),
    garageDialog: document.getElementById("garage-dialog"),
    garageClose: document.getElementById("garage-close"),
    carList: document.getElementById("car-list"),
    bankLine: document.getElementById("bank-line"),
    controlsDialog: document.getElementById("controls-dialog"),
    controlsClose: document.getElementById("controls-close"),
    popup: document.getElementById("web-popup"),
    popupClose: document.getElementById("close-popup"),
    toast: document.getElementById("toast"),
    announcer: document.getElementById("announcer"),
    touchLeft: document.getElementById("touch-left"),
    touchRight: document.getElementById("touch-right"),
    touchBrake: document.getElementById("touch-brake"),
    touchGas: document.getElementById("touch-gas")
  };

  const SAVE_KEY = "dial_up_drift_99_save_v1";
  const SAVE_VERSION = 1;
  const TAU = Math.PI * 2;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (t) => t * t * (3 - 2 * t);
  const round = (value, places = 1) => {
    const scale = 10 ** places;
    return Math.round(value * scale) / scale;
  };

  const STAGES = [
    {
      name: "BOOT COUNTY",
      subtitle: "Warm asphalt / cold modem",
      length: 5200,
      timeLimit: 118,
      rivalSpeed: 48.5,
      sky: "#7bc7d2",
      horizon: "#f3d39d",
      ground: "#55714c",
      road: "#51535c",
      accent: "#ffdf66",
      fog: "#d7dccb"
    },
    {
      name: "POP-UP PIKE",
      subtitle: "Close buttons optional",
      length: 5350,
      timeLimit: 116,
      rivalSpeed: 51.5,
      sky: "#cd8a88",
      horizon: "#ffd6a2",
      ground: "#715b50",
      road: "#55505a",
      accent: "#62f0df",
      fog: "#d8c7ba"
    },
    {
      name: "BUFFER BADLANDS",
      subtitle: "Road may arrive later",
      length: 5500,
      timeLimit: 114,
      rivalSpeed: 54.5,
      sky: "#a888c8",
      horizon: "#efb4a7",
      ground: "#574b64",
      road: "#484954",
      accent: "#d7ff55",
      fog: "#c7b8ca"
    },
    {
      name: "CHAIR FORCE ONE",
      subtitle: "Ergonomic pursuit unit",
      length: 5650,
      timeLimit: 112,
      rivalSpeed: 57.2,
      sky: "#6b8cae",
      horizon: "#f4b47a",
      ground: "#3f594f",
      road: "#454a51",
      accent: "#ff7e63",
      fog: "#b6bdba"
    },
    {
      name: "FINAL_DOWNLOAD.EXE",
      subtitle: "One rival / zero retries left online",
      length: 5800,
      timeLimit: 110,
      rivalSpeed: 60.3,
      sky: "#2e315e",
      horizon: "#ee775a",
      ground: "#283642",
      road: "#3e414b",
      accent: "#ffef62",
      fog: "#746f84"
    }
  ];

  const CARS = {
    packet: {
      id: "packet",
      name: "PACKET COMPACT",
      copy: "Balanced grip, speed and signal shielding.",
      cost: 0,
      maxSpeed: 242,
      acceleration: 61,
      grip: 6.9,
      steering: 1,
      firewall: 1,
      color: "#ff784e",
      trim: "#fff06a"
    },
    marauder: {
      id: "marauder",
      name: "MODEM MARAUDER",
      copy: "Higher top speed, looser rear end, louder boost.",
      cost: 120,
      maxSpeed: 259,
      acceleration: 66,
      grip: 5.45,
      steering: 1.08,
      firewall: .82,
      color: "#8f72ff",
      trim: "#4df4ff"
    },
    firewall: {
      id: "firewall",
      name: "FIREWALL WAGON",
      copy: "Heavy but stable. Crashes corrupt less signal.",
      cost: 210,
      maxSpeed: 230,
      acceleration: 55,
      grip: 7.8,
      steering: .9,
      firewall: 1.42,
      color: "#72d98f",
      trim: "#f4f0d6"
    }
  };

  const UPGRADES = [
    { id: "engine", name: "OVERCLOCK ENGINE", copy: "+9 km/h top speed and stronger acceleration.", tag: "HOTTER PACKETS" },
    { id: "grip", name: "MOUSE-MAT TYRES", copy: "More lateral grip and a tighter drift recovery.", tag: "CURSOR PRECISION" },
    { id: "firewall", name: "FIREWALL FOAM", copy: "Reduce crash and off-road signal corruption.", tag: "BLOCK BAD INPUT" },
    { id: "boost", name: "TURBO CACHE", copy: "Longer boost burst with faster recharge.", tag: "STORE MORE FAST" }
  ];

  const CURSES = [
    { id: "carts", name: "CART TRAFFIC", duration: 10, radio: "SHOPPING CART PROTOCOL: traffic has lost its engines and its dignity." },
    { id: "gps", name: "LYING GPS", duration: 10, radio: "GPS: Trust the large arrow. Pirate radio: absolutely do not trust the arrow." },
    { id: "buffer", name: "ROAD BUFFERING", duration: 11, radio: "The road is loading in chunks. Green lanes have received their packets." },
    { id: "gravity", name: "LOW GRAVITY PATCH", duration: 10, radio: "Moon physics installed. Steering floats, but obstacles pass underneath." },
    { id: "chair", name: "OFFICE-CHAIR PURSUIT", duration: 11, radio: "An ergonomic enforcement unit is gaining from behind. Keep moving." },
    { id: "popup", name: "POP-UP BLOCKER", duration: 12, radio: "A helpful window has occupied both your screen and one lane. Close or dodge." },
    { id: "invert", name: "NEGATIVE MODE", duration: 9, radio: "Display colors inverted. Controls remain normal. Your eyes filed the complaint." }
  ];

  function defaultSave() {
    return {
      version: SAVE_VERSION,
      bytes: 0,
      selectedCar: "packet",
      unlocked: ["packet"],
      cupsWon: 0,
      bestStage: 0,
      totalDistance: 0
    };
  }

  function loadSave() {
    const fallback = defaultSave();
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.version !== SAVE_VERSION) return fallback;
      const unlocked = Array.isArray(parsed.unlocked) ? parsed.unlocked.filter((id) => CARS[id]) : ["packet"];
      if (!unlocked.includes("packet")) unlocked.unshift("packet");
      return {
        version: SAVE_VERSION,
        bytes: Math.max(0, Math.floor(Number(parsed.bytes) || 0)),
        selectedCar: CARS[parsed.selectedCar] && unlocked.includes(parsed.selectedCar) ? parsed.selectedCar : "packet",
        unlocked,
        cupsWon: Math.max(0, Math.floor(Number(parsed.cupsWon) || 0)),
        bestStage: clamp(Math.floor(Number(parsed.bestStage) || 0), 0, STAGES.length),
        totalDistance: Math.max(0, Number(parsed.totalDistance) || 0)
      };
    } catch (_) {
      return fallback;
    }
  }

  let save = loadSave();
  let width = 1280;
  let height = 720;
  let dpr = 1;
  let lastFrame = performance.now();
  let frameHandle = 0;
  let audioContext = null;
  let engineOscillator = null;
  let engineGain = null;
  let audioMuted = false;
  let manualStepping = false;

  const input = {
    left: false,
    right: false,
    throttle: false,
    brake: false,
    boost: false,
    touchBoost: false
  };

  const state = {
    mode: "ready",
    outcome: null,
    failureReason: "",
    stageIndex: 0,
    stageTime: 0,
    stageDistance: 0,
    totalRaceTime: 0,
    attractTime: 0,
    speed: 0,
    x: 0,
    lateralVelocity: 0,
    drift: 0,
    integrity: 100,
    boost: 100,
    boosting: false,
    air: 0,
    checkpoints: 0,
    checkpointSerial: 0,
    nextCheckpoint: 1,
    position: 8,
    rivalDistance: 120,
    rivalGap: 120,
    rivalFinished: false,
    traffic: [],
    upgrades: { engine: 0, grip: 0, firewall: 0, boost: 0 },
    cupBytes: 0,
    stagesCleared: 0,
    curse: null,
    curseSerial: 0,
    cursesSeen: 0,
    nextCurseAt: 17,
    warningId: "",
    collisions: 0,
    collisionFlash: 0,
    shake: 0,
    offroadTime: 0,
    radioText: "",
    radioTime: 0,
    toastText: "",
    toastTime: 0,
    popupClosed: false,
    gapHits: {},
    raceSerial: 0,
    stageResultSerial: 0,
    lastAward: 0
  };

  function persistSave() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(save));
    } catch (_) {
      // Storage is optional; the live run remains playable.
    }
  }

  function hashNumber(value) {
    let x = Math.imul(value ^ 0x9e3779b9, 0x85ebca6b);
    x ^= x >>> 13;
    x = Math.imul(x, 0xc2b2ae35);
    return (x ^ (x >>> 16)) >>> 0;
  }

  function seededUnit(value) {
    return hashNumber(value) / 4294967295;
  }

  function makeTraffic(stageIndex) {
    const stage = STAGES[stageIndex];
    const traffic = [];
    const lanes = [-.68, .68, -.18, .2];
    let z = 360;
    let index = 0;
    while (z < stage.length - 220) {
      const a = seededUnit(stageIndex * 9001 + index * 47 + 3);
      const b = seededUnit(stageIndex * 811 + index * 97 + 19);
      const lane = lanes[Math.floor(a * lanes.length) % lanes.length];
      traffic.push({
        id: `t${stageIndex}-${index}`,
        startZ: z,
        lane,
        speed: 24 + b * 25,
        color: ["#f05d5e", "#4fc5d2", "#f4bd4b", "#b57bea", "#e7e1c9"][index % 5],
        hit: false,
        kind: index % 4
      });
      z += 340 + a * 235;
      index += 1;
    }
    return traffic;
  }

  function currentCar() {
    return CARS[save.selectedCar] || CARS.packet;
  }

  function resetInput() {
    input.left = false;
    input.right = false;
    input.throttle = false;
    input.brake = false;
    input.boost = false;
    input.touchBoost = false;
    [ui.touchLeft, ui.touchRight, ui.touchBrake, ui.touchGas].forEach((button) => button.classList.remove("pressed"));
  }

  function loadStage(index, readyState) {
    const stage = STAGES[index];
    state.stageIndex = index;
    state.mode = readyState ? "ready" : "race";
    state.outcome = null;
    state.failureReason = "";
    state.stageTime = 0;
    state.stageDistance = 0;
    state.speed = readyState ? 0 : 72;
    state.x = 0;
    state.lateralVelocity = 0;
    state.drift = 0;
    state.integrity = 100;
    state.boost = 100;
    state.boosting = false;
    state.air = 0;
    state.checkpoints = 0;
    state.nextCheckpoint = 1;
    state.position = 8;
    state.rivalDistance = 170 + index * 28;
    state.rivalGap = state.rivalDistance;
    state.rivalFinished = false;
    state.traffic = makeTraffic(index);
    state.curse = null;
    state.nextCurseAt = 17 + (index % 2) * 2;
    state.warningId = "";
    state.offroadTime = 0;
    state.gapHits = {};
    state.popupClosed = false;
    state.stageResultSerial += 1;
    resetInput();
    hideTransientScreens();
    ui.ready.classList.toggle("hidden", !readyState);
    ui.popup.classList.add("hidden");
    if (!readyState) {
      state.raceSerial += 1;
      showRadio(`${stage.name}: ${stage.subtitle}`, 3.4);
      announce(`Stage ${index + 1}, ${stage.name}`);
    }
    updateHud();
    render();
  }

  function startNewCup() {
    state.upgrades = { engine: 0, grip: 0, firewall: 0, boost: 0 };
    state.cupBytes = 0;
    state.stagesCleared = 0;
    state.totalRaceTime = 0;
    state.curseSerial = 0;
    state.cursesSeen = 0;
    state.collisions = 0;
    loadStage(0, true);
    showRadio("Pirate packet radio online. Touch the throttle whenever you are ready.", 4.2);
  }

  function beginRace() {
    if (state.mode !== "ready") return;
    state.mode = "race";
    state.raceSerial += 1;
    ui.ready.classList.add("hidden");
    showRadio(`${STAGES[state.stageIndex].name}: ${STAGES[state.stageIndex].subtitle}`, 3.2);
    announce(`Race started on ${STAGES[state.stageIndex].name}`);
    tone("start");
  }

  function hideTransientScreens() {
    ui.upgradeScreen.classList.add("hidden");
    ui.resultScreen.classList.add("hidden");
    ui.pauseScreen.classList.add("hidden");
  }

  function restartCurrentStage() {
    const index = state.stageIndex;
    loadStage(index, true);
    showRadio("Stage reconnected. First driving input launches immediately.", 3.2);
  }

  function awardBytes(amount, label) {
    const clean = Math.max(0, Math.floor(amount));
    if (!clean) return;
    save.bytes += clean;
    state.cupBytes += clean;
    state.lastAward = clean;
    persistSave();
    showToast(`+${clean} BYTES // ${label}`, 2.2);
  }

  function stageSuccess() {
    if (state.mode !== "race") return;
    const stage = STAGES[state.stageIndex];
    const finalStage = state.stageIndex === STAGES.length - 1;
    state.speed = Math.max(70, state.speed * .7);
    if (finalStage) {
      if (state.rivalFinished || state.rivalDistance >= stage.length) {
        failCup("The final rival completed the download first.");
      } else {
        state.stagesCleared = STAGES.length;
        awardBytes(150, "CUP WIN");
        save.cupsWon += 1;
        save.bestStage = STAGES.length;
        persistSave();
        finishCup(true, "You beat the final rival and kept enough signal to upload the trophy.");
      }
      return;
    }
    state.stagesCleared = Math.max(state.stagesCleared, state.stageIndex + 1);
    save.bestStage = Math.max(save.bestStage, state.stagesCleared);
    awardBytes(45 + state.stageIndex * 10, "STAGE CLEAR");
    persistSave();
    state.mode = "upgrade";
    state.curse = null;
    ui.popup.classList.add("hidden");
    resetInput();
    showUpgrade(stage);
    tone("finish");
  }

  function showUpgrade(stage) {
    ui.upgradeTitle.textContent = `${stage.name} // DOWNLOAD COMPLETE`;
    ui.upgradeCopy.textContent = `Stage ${state.stageIndex + 1} cleared in ${state.stageTime.toFixed(1)}s. Choose one patch for the remaining cup.`;
    ui.upgradeChoices.replaceChildren();
    UPGRADES.forEach((upgrade) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "choice";
      button.dataset.upgrade = upgrade.id;
      const level = state.upgrades[upgrade.id];
      const strong = document.createElement("strong");
      strong.textContent = upgrade.name;
      const small = document.createElement("small");
      small.textContent = upgrade.copy;
      const em = document.createElement("em");
      em.textContent = `${upgrade.tag} // CURRENT LEVEL ${level}`;
      button.append(strong, small, em);
      button.addEventListener("click", () => chooseUpgrade(upgrade.id), { once: true });
      ui.upgradeChoices.append(button);
    });
    ui.upgradeScreen.classList.remove("hidden");
    ui.upgradeChoices.querySelector("button")?.focus();
    announce("Stage cleared. Choose a pit-lane upgrade.");
  }

  function chooseUpgrade(id) {
    if (state.mode !== "upgrade" || !(id in state.upgrades)) return;
    state.upgrades[id] += 1;
    tone("upgrade");
    const next = state.stageIndex + 1;
    loadStage(next, false);
  }

  function failCup(reason) {
    if (state.mode !== "race") return;
    state.failureReason = reason;
    finishCup(false, reason);
  }

  function finishCup(won, copy) {
    state.mode = "result";
    state.outcome = won ? "win" : "fail";
    state.curse = null;
    state.boosting = false;
    ui.popup.classList.add("hidden");
    resetInput();
    ui.resultTitle.textContent = won ? "CUP UPLOADED" : "CONNECTION CLOSED";
    ui.resultStamp.textContent = won ? "CUP WIN" : "CUP FAILED";
    ui.resultStamp.classList.toggle("fail", !won);
    ui.resultCopy.textContent = copy;
    ui.resultStats.textContent = `STAGES ${state.stagesCleared}/${STAGES.length} · CUP BYTES ${state.cupBytes} · CRASHES ${state.collisions} · BANK ${save.bytes}`;
    ui.retryButton.classList.toggle("hidden", won);
    ui.resultScreen.classList.remove("hidden");
    (won ? ui.newCupButton : ui.retryButton).focus();
    announce(won ? "Cup win" : `Cup failed. ${copy}`);
    tone(won ? "finish" : "fail");
  }

  function pauseGame(fromVisibility = false) {
    if (state.mode !== "race") return;
    state.mode = "paused";
    resetInput();
    ui.pauseScreen.classList.remove("hidden");
    ui.pauseButton.textContent = "P PLAY";
    if (!fromVisibility) ui.resumeButton.focus();
    setEngineAudio();
  }

  function resumeGame() {
    if (state.mode !== "paused") return;
    state.mode = "race";
    ui.pauseScreen.classList.add("hidden");
    ui.pauseButton.textContent = "P PAUSE";
    lastFrame = performance.now();
    shell.focus({ preventScroll: true });
  }

  function togglePause() {
    if (state.mode === "race") pauseGame();
    else if (state.mode === "paused") resumeGame();
  }

  function showRadio(text, seconds) {
    state.radioText = text;
    state.radioTime = seconds;
    ui.radio.textContent = text;
    ui.radio.classList.remove("off");
  }

  function showToast(text, seconds) {
    state.toastText = text;
    state.toastTime = seconds;
    ui.toast.textContent = text;
    ui.toast.classList.remove("hidden");
  }

  function announce(text) {
    ui.announcer.textContent = "";
    window.setTimeout(() => { ui.announcer.textContent = text; }, 20);
  }

  function ensureAudio() {
    if (audioContext) {
      if (audioContext.state === "suspended") audioContext.resume().catch(() => {});
      return;
    }
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return;
    try {
      audioContext = new AudioCtor();
      engineOscillator = audioContext.createOscillator();
      engineGain = audioContext.createGain();
      engineOscillator.type = "sawtooth";
      engineOscillator.frequency.value = 42;
      engineGain.gain.value = 0;
      engineOscillator.connect(engineGain).connect(audioContext.destination);
      engineOscillator.start();
    } catch (_) {
      audioContext = null;
      engineOscillator = null;
      engineGain = null;
    }
  }

  function setEngineAudio() {
    if (!audioContext || !engineOscillator || !engineGain) return;
    const live = !audioMuted && state.mode === "race";
    const now = audioContext.currentTime;
    const pitch = 38 + state.speed * .48 + (state.boosting ? 28 : 0);
    engineOscillator.frequency.setTargetAtTime(pitch, now, .045);
    engineGain.gain.setTargetAtTime(live ? .018 + state.speed / 18000 : 0, now, .06);
  }

  function tone(kind) {
    ensureAudio();
    if (!audioContext || audioMuted) return;
    const definitions = {
      start: [130, 220, .18, "square"],
      checkpoint: [420, 690, .13, "square"],
      collision: [88, 45, .21, "sawtooth"],
      curse: [210, 118, .24, "square"],
      finish: [390, 780, .34, "triangle"],
      fail: [150, 48, .4, "sawtooth"],
      upgrade: [300, 560, .18, "triangle"],
      boost: [180, 270, .1, "sawtooth"]
    };
    const spec = definitions[kind] || definitions.start;
    try {
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      const tier = seededUnit(state.checkpointSerial * 71 + state.collisions * 29 + state.curseSerial * 13 + kind.length);
      const jitter = .94 + tier * .13;
      const now = audioContext.currentTime;
      osc.type = spec[3];
      osc.frequency.setValueAtTime(spec[0] * jitter, now);
      osc.frequency.exponentialRampToValueAtTime(Math.max(30, spec[1] * jitter), now + spec[2]);
      gain.gain.setValueAtTime(.0001, now);
      gain.gain.exponentialRampToValueAtTime(kind === "collision" ? .075 : .045, now + .014);
      gain.gain.exponentialRampToValueAtTime(.0001, now + spec[2]);
      osc.connect(gain).connect(audioContext.destination);
      osc.start(now);
      osc.stop(now + spec[2] + .03);
    } catch (_) {
      // Audio feedback is optional.
    }
  }

  function trackCurve(z, stageIndex = state.stageIndex) {
    const phase = stageIndex * .79;
    return Math.sin(z / 560 + phase) * .64 + Math.sin(z / 1420 - phase * .6) * .88 + Math.sin(z / 230 + phase * 2) * .16;
  }

  function trackHill(z, stageIndex = state.stageIndex) {
    const phase = stageIndex * 1.31;
    return Math.sin(z / 760 + phase) * .72 + Math.sin(z / 2500 - phase) * .55;
  }

  function activateCurse() {
    const curseDef = CURSES[(state.curseSerial + state.stageIndex * 2) % CURSES.length];
    state.curseSerial += 1;
    state.cursesSeen += 1;
    const curse = {
      id: curseDef.id,
      name: curseDef.name,
      duration: curseDef.duration,
      remaining: curseDef.duration,
      elapsed: 0,
      serial: state.curseSerial,
      meta: {}
    };
    if (curse.id === "carts") {
      curse.meta.objects = [0, 1, 2].map((value) => ({
        id: `cart-${curse.serial}-${value}`,
        z: state.stageDistance + 410 + value * 290,
        lane: [-.68, .65, -.08][value],
        hit: false
      }));
    }
    if (curse.id === "gps") {
      curse.meta.lane = seededUnit(curse.serial * 91 + state.stageIndex) > .5 ? .66 : -.66;
      curse.meta.z = state.stageDistance + 560;
      curse.meta.hit = false;
    }
    if (curse.id === "buffer") {
      const lanes = [-.66, 0, .66];
      curse.meta.gaps = [0, 1, 2].map((value) => ({
        id: `gap-${curse.serial}-${value}`,
        z: state.stageDistance + 470 + value * 360,
        safe: lanes[(value + curse.serial) % lanes.length],
        hit: false
      }));
    }
    if (curse.id === "chair") curse.meta.distance = 390;
    if (curse.id === "popup") {
      curse.meta.lane = seededUnit(curse.serial * 233) > .5 ? .67 : -.67;
      curse.meta.z = state.stageDistance + 620;
      curse.meta.hit = false;
      state.popupClosed = false;
      ui.popup.classList.remove("hidden");
    }
    state.curse = curse;
    state.warningId = "";
    ui.cursePanel.classList.remove("hidden");
    showRadio(curseDef.radio, 4.4);
    announce(`${curseDef.name} active for ${curseDef.duration} seconds`);
    tone("curse");
  }

  function endCurse() {
    if (!state.curse) return;
    if (state.curse.id === "popup") ui.popup.classList.add("hidden");
    state.curse = null;
    state.nextCurseAt = state.stageTime + 19 + ((state.curseSerial + state.stageIndex) % 5);
    state.air = 0;
    ui.cursePanel.classList.add("hidden");
    showToast("CONNECTION NORMALIZED", 1.5);
  }

  function closePopup() {
    if (!state.curse || state.curse.id !== "popup" || state.popupClosed) return;
    state.popupClosed = true;
    state.curse.meta.closed = true;
    state.integrity = Math.min(100, state.integrity + 5);
    ui.popup.classList.add("hidden");
    showToast("POP-UP CLOSED // +5 SIGNAL", 2);
    tone("checkpoint");
  }

  function hitObstacle(damage, push, label) {
    const car = currentCar();
    const protection = car.firewall * (1 + state.upgrades.firewall * .18);
    state.integrity = Math.max(0, state.integrity - damage / protection);
    state.speed *= .5;
    state.lateralVelocity += push;
    state.collisions += 1;
    state.collisionFlash = 1;
    state.shake = Math.min(1.4, state.shake + .75);
    showToast(label, 1.35);
    tone("collision");
  }

  function updateTrafficCollisions() {
    const playerZ = state.stageDistance;
    const carAirborne = state.air > .35;
    state.traffic.forEach((traffic) => {
      const worldZ = traffic.startZ + state.stageTime * traffic.speed;
      const delta = worldZ - playerZ;
      if (!traffic.hit && !carAirborne && delta > -2 && delta < 10 && Math.abs(state.x - traffic.lane) < .33) {
        traffic.hit = true;
        hitObstacle(15, state.x <= traffic.lane ? -.7 : .7, "TRAFFIC PACKET COLLISION");
      }
    });

    const curse = state.curse;
    if (!curse || carAirborne) return;
    if (curse.id === "carts") {
      curse.meta.objects.forEach((cart) => {
        const delta = cart.z - playerZ;
        if (!cart.hit && delta > -2 && delta < 11 && Math.abs(state.x - cart.lane) < .38) {
          cart.hit = true;
          hitObstacle(17, state.x <= cart.lane ? -.85 : .85, "CART CHECKOUT COLLISION");
        }
      });
    }
    if (curse.id === "gps") {
      const delta = curse.meta.z - playerZ;
      if (!curse.meta.hit && delta > -2 && delta < 12 && Math.abs(state.x - curse.meta.lane) < .42) {
        curse.meta.hit = true;
        hitObstacle(19, state.x <= curse.meta.lane ? -.9 : .9, "GPS ROUTED INTO BLOCKER");
      }
    }
    if (curse.id === "popup" && !curse.meta.closed) {
      const delta = curse.meta.z - playerZ;
      if (!curse.meta.hit && delta > -2 && delta < 12 && Math.abs(state.x - curse.meta.lane) < .42) {
        curse.meta.hit = true;
        hitObstacle(18, state.x <= curse.meta.lane ? -.9 : .9, "WINDOW NOT RESPONDING");
      }
    }
    if (curse.id === "buffer") {
      curse.meta.gaps.forEach((gap) => {
        const delta = gap.z - playerZ;
        if (!gap.hit && delta > -1 && delta < 14 && Math.abs(state.x - gap.safe) > .34) {
          gap.hit = true;
          hitObstacle(13, state.x < gap.safe ? -.45 : .45, "ROAD PACKET MISSING");
        }
      });
    }
  }

  function updateRivals(dt) {
    const stage = STAGES[state.stageIndex];
    const rubber = clamp((state.stageDistance - state.rivalDistance) / 900, -.11, .11);
    const pace = stage.rivalSpeed * (1 + rubber);
    state.rivalDistance = Math.min(stage.length + 80, state.rivalDistance + pace * dt);
    state.rivalGap = state.rivalDistance - state.stageDistance;
    state.rivalFinished = state.rivalDistance >= stage.length;

    let ahead = state.rivalDistance > state.stageDistance ? 1 : 0;
    for (let i = 1; i < 7; i += 1) {
      const rivalDistance = 80 + i * 72 + state.stageTime * Math.max(41, stage.rivalSpeed - i * 1.65);
      if (rivalDistance > state.stageDistance) ahead += 1;
    }
    state.position = clamp(ahead + 1, 1, 8);
  }

  function updateCheckpoints() {
    const stage = STAGES[state.stageIndex];
    while (state.nextCheckpoint <= 4 && state.stageDistance >= stage.length * state.nextCheckpoint / 4) {
      state.checkpoints = state.nextCheckpoint;
      state.nextCheckpoint += 1;
      state.checkpointSerial += 1;
      state.integrity = Math.min(100, state.integrity + 8);
      awardBytes(12, `CHECKPOINT ${state.checkpoints}`);
      showRadio(`Checkpoint ${state.checkpoints}/4 received. Signal repaired.`, 2.5);
      tone("checkpoint");
    }
  }

  function updateCurse(dt) {
    if (!state.curse) {
      const remaining = state.nextCurseAt - state.stageTime;
      if (remaining <= 3.2 && remaining > 0) {
        const next = CURSES[(state.curseSerial + state.stageIndex * 2) % CURSES.length];
        if (state.warningId !== next.id) {
          state.warningId = next.id;
          showRadio(`INCOMING IN 3s: ${next.name}. Watch the road.`, 2.6);
        }
      }
      if (remaining <= 0) activateCurse();
      return;
    }
    const curse = state.curse;
    curse.elapsed += dt;
    curse.remaining -= dt;

    if (curse.id === "gravity") {
      state.air = .25 + Math.max(0, Math.sin(curse.elapsed * 2.7)) * .85;
    }
    if (curse.id === "chair") {
      const speedMps = state.speed / 3.6;
      curse.meta.distance -= Math.max(5, 59 - speedMps) * dt;
      if (curse.meta.distance <= 0) {
        curse.meta.distance = 220;
        hitObstacle(12, state.x > 0 ? -.95 : .95, "ERGONOMIC ENFORCEMENT BUMP");
      }
    }
    if (curse.remaining <= 0) endCurse();
  }

  function updateRace(dt) {
    const stage = STAGES[state.stageIndex];
    const car = currentCar();
    const steer = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const maxSpeed = car.maxSpeed + state.upgrades.engine * 9;
    const boostMax = maxSpeed + 45 + state.upgrades.boost * 7;
    const automaticAssist = state.speed < 74 ? 20 : 0;
    const engineAccel = input.throttle ? car.acceleration + state.upgrades.engine * 4.5 : automaticAssist;
    const wantsBoost = (input.boost || input.touchBoost) && input.throttle && state.boost > 1 && state.speed > 85;
    state.boosting = wantsBoost;

    if (input.brake) state.speed -= 105 * dt;
    else state.speed += engineAccel * dt;

    if (state.boosting) {
      state.speed += (54 + state.upgrades.boost * 7) * dt;
      state.boost = Math.max(0, state.boost - (28 - state.upgrades.boost * 2.4) * dt);
      if (state.boost <= 0) state.boosting = false;
    } else {
      state.boost = Math.min(100 + state.upgrades.boost * 15, state.boost + (9 + state.upgrades.boost * 2.2) * dt);
    }

    const speedCeiling = state.boosting ? boostMax : maxSpeed;
    const drag = 3.2 + state.speed * .011;
    state.speed -= drag * dt;
    state.speed = clamp(state.speed, 0, speedCeiling);

    const speedFactor = clamp(state.speed / 185, 0, 1.25);
    let steerScale = (.48 + speedFactor * .72) * car.steering;
    let grip = car.grip + state.upgrades.grip * .78;
    if (state.curse?.id === "gravity") {
      steerScale *= .78;
      grip *= .48;
    }
    const targetLateral = steer * steerScale;
    state.lateralVelocity += (targetLateral - state.lateralVelocity) * Math.min(1, grip * dt);
    if (!steer) state.lateralVelocity *= Math.max(0, 1 - grip * .56 * dt);
    const curvePull = (trackCurve(state.stageDistance + 25) - trackCurve(state.stageDistance)) * speedFactor * .085;
    state.x += (state.lateralVelocity - curvePull) * dt;
    state.drift = lerp(state.drift, Math.abs(state.lateralVelocity - targetLateral * .58) * speedFactor, Math.min(1, dt * 7));

    if (Math.abs(state.x) > 1.04) {
      state.offroadTime += dt;
      state.speed -= (15 + state.speed * .16) * dt;
      const protection = car.firewall * (1 + state.upgrades.firewall * .18);
      state.integrity -= (12 + state.speed * .024) * dt / protection;
      state.shake = Math.min(1, state.shake + dt * .8);
    } else {
      state.offroadTime = Math.max(0, state.offroadTime - dt * 2);
      if (state.speed > 95) state.integrity = Math.min(100, state.integrity + .42 * dt);
    }
    if (Math.abs(state.x) > 1.72) {
      state.x = Math.sign(state.x) * 1.72;
      state.lateralVelocity *= -.3;
    }
    state.speed = Math.max(0, state.speed);
    state.integrity = clamp(state.integrity, 0, 100);

    state.stageTime += dt;
    state.totalRaceTime += dt;
    const deltaDistance = state.speed / 3.6 * dt;
    state.stageDistance += deltaDistance;
    save.totalDistance += deltaDistance;
    state.collisionFlash = Math.max(0, state.collisionFlash - dt * 3.8);
    state.shake = Math.max(0, state.shake - dt * 2.2);

    updateRivals(dt);
    updateCurse(dt);
    updateTrafficCollisions();
    updateCheckpoints();

    if (state.integrity <= 0) {
      failCup("Your signal was corrupted. Stay on the bright road and avoid direct collisions.");
      return;
    }
    if (state.stageTime >= stage.timeLimit) {
      failCup("The stage server timed out before your car reached the upload gate.");
      return;
    }
    if (state.stageDistance >= stage.length) {
      state.stageDistance = stage.length;
      stageSuccess();
    }
  }

  function update(dt) {
    const safeDt = clamp(dt, 0, .05);
    state.attractTime += safeDt;
    if (state.mode === "race") updateRace(safeDt);
    if (state.radioTime > 0) {
      state.radioTime -= safeDt;
      if (state.radioTime <= 0) ui.radio.classList.add("off");
    }
    if (state.toastTime > 0) {
      state.toastTime -= safeDt;
      if (state.toastTime <= 0) ui.toast.classList.add("hidden");
    }
    updateHud();
    setEngineAudio();
  }

  function updateHud() {
    const stage = STAGES[state.stageIndex];
    ui.speed.textContent = String(Math.round(state.speed)).padStart(3, "0");
    ui.stage.textContent = `STAGE ${state.stageIndex + 1}/${STAGES.length}`;
    ui.position.textContent = `POS ${state.position}/8`;
    ui.checkpoint.textContent = `CP ${state.checkpoints}/4`;
    ui.progress.style.width = `${clamp(state.stageDistance / stage.length * 100, 0, 100).toFixed(2)}%`;
    const bars = ui.signal.children;
    const liveBars = Math.ceil(state.integrity / 10);
    for (let i = 0; i < bars.length; i += 1) {
      bars[i].classList.toggle("on", i < liveBars);
      bars[i].classList.toggle("warn", i < liveBars && liveBars <= 3);
    }
    if (state.curse) {
      ui.curseName.textContent = state.curse.name;
      ui.curseTime.textContent = `${Math.max(0, state.curse.remaining).toFixed(1)}s // ${curseHelp(state.curse.id)}`;
      ui.cursePanel.classList.remove("hidden");
    } else {
      ui.cursePanel.classList.add("hidden");
    }
    ui.muteButton.setAttribute("aria-pressed", String(audioMuted));
    ui.muteButton.textContent = audioMuted ? "M MUTED" : "M SOUND";
  }

  function curseHelp(id) {
    return {
      carts: "SLOW TRAFFIC",
      gps: "ARROW LIES",
      buffer: "USE GREEN LANE",
      gravity: "FLOATY GRIP",
      chair: "KEEP SPEED",
      popup: "CLOSE OR DODGE",
      invert: "CONTROLS NORMAL"
    }[id] || "SURVIVE";
  }

  function roadDistanceForRender() {
    return state.stageDistance + (state.mode === "ready" ? state.attractTime * 18 : 0);
  }

  function geometryAt(distance) {
    const renderDistance = roadDistanceForRender();
    const drawDistance = 1450;
    const p = clamp(1 - distance / drawDistance, 0, 1);
    const horizon = height * (height > width ? .27 : .32);
    const yBase = horizon + Math.pow(p, 1.58) * (height - horizon);
    const hillDiff = trackHill(renderDistance + distance) - trackHill(renderDistance);
    const y = yBase - hillDiff * height * .055 * (1 - p * .32);
    const half = lerp(7, width * .47, Math.pow(p, 1.08));
    const curveDiff = trackCurve(renderDistance + distance) - trackCurve(renderDistance);
    const cameraX = state.mode === "ready" ? 0 : state.x;
    const center = width * .5 + curveDiff * width * .17 - cameraX * half * .78;
    return { p, y, half, center };
  }

  function projectObject(distance, lane) {
    if (distance <= 0 || distance >= 1450) return null;
    const g = geometryAt(distance);
    return { x: g.center + lane * g.half, y: g.y, scale: .12 + g.p * 1.35, p: g.p };
  }

  function fillQuad(color, a, b, c, d) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(c.x, c.y);
    ctx.lineTo(d.x, d.y);
    ctx.closePath();
    ctx.fill();
  }

  function drawSky(stage) {
    const horizon = height * (height > width ? .27 : .32);
    ctx.fillStyle = stage.sky;
    ctx.fillRect(0, 0, width, horizon + 2);
    ctx.fillStyle = stage.horizon;
    ctx.fillRect(0, horizon * .58, width, horizon * .44);

    const sunX = width * (.76 - state.stageIndex * .055);
    const sunY = horizon * .42;
    const sunR = Math.max(24, Math.min(width, height) * .075);
    ctx.fillStyle = stage.accent;
    ctx.beginPath();
    ctx.arc(sunX, sunY, sunR, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(sunX - sunR, sunY, sunR * 2, 4);
    for (let i = 1; i < 5; i += 1) {
      ctx.fillRect(sunX - sunR + i * 4, sunY + i * 7, sunR * 2 - i * 8, Math.max(2, 6 - i));
    }

    ctx.fillStyle = state.stageIndex >= 3 ? "#293149" : "#6f6c79";
    ctx.beginPath();
    ctx.moveTo(0, horizon);
    for (let x = 0; x <= width; x += Math.max(28, width / 22)) {
      const h = horizon * (.1 + seededUnit(Math.floor(x) + state.stageIndex * 77) * .27);
      ctx.lineTo(x, horizon - h);
    }
    ctx.lineTo(width, horizon);
    ctx.closePath();
    ctx.fill();

    if (state.stageIndex >= 3) {
      ctx.fillStyle = "rgba(255,255,220,.72)";
      for (let i = 0; i < 28; i += 1) {
        const hx = seededUnit(i * 33 + 9) * width;
        const hy = seededUnit(i * 97 + 11) * horizon * .65;
        ctx.fillRect(Math.round(hx), Math.round(hy), i % 5 === 0 ? 2 : 1, 1);
      }
    }
  }

  function drawRoad(stage) {
    const segments = 70;
    const drawDistance = 1450;
    for (let i = 0; i < segments; i += 1) {
      const p0 = i / segments;
      const p1 = (i + 1) / segments;
      const d0 = drawDistance * (1 - p0);
      const d1 = drawDistance * (1 - p1);
      const g0 = geometryAt(d0);
      const g1 = geometryAt(d1);
      const worldBand = Math.floor((roadDistanceForRender() + d1) / 72);
      const alt = worldBand % 2 === 0;
      ctx.fillStyle = alt ? stage.ground : shadeHex(stage.ground, -.08);
      ctx.fillRect(0, Math.floor(g0.y), width, Math.max(1, Math.ceil(g1.y - g0.y + 1)));

      const shoulder = alt ? stage.accent : "#f0ead7";
      fillQuad(shoulder,
        { x: g0.center - g0.half * 1.13, y: g0.y },
        { x: g0.center + g0.half * 1.13, y: g0.y },
        { x: g1.center + g1.half * 1.13, y: g1.y },
        { x: g1.center - g1.half * 1.13, y: g1.y });
      fillQuad(alt ? stage.road : shadeHex(stage.road, -.055),
        { x: g0.center - g0.half, y: g0.y },
        { x: g0.center + g0.half, y: g0.y },
        { x: g1.center + g1.half, y: g1.y },
        { x: g1.center - g1.half, y: g1.y });

      if (worldBand % 4 < 2 && g1.half > 12) {
        [-1 / 3, 1 / 3].forEach((lane) => {
          const w0 = Math.max(.6, g0.half * .009);
          const w1 = Math.max(.7, g1.half * .009);
          fillQuad("rgba(255,248,214,.74)",
            { x: g0.center + lane * g0.half - w0, y: g0.y },
            { x: g0.center + lane * g0.half + w0, y: g0.y },
            { x: g1.center + lane * g1.half + w1, y: g1.y },
            { x: g1.center + lane * g1.half - w1, y: g1.y });
        });
      }
      drawGapBand(d0, d1, g0, g1);
    }
  }

  function shadeHex(hex, amount) {
    const clean = hex.replace("#", "");
    const number = parseInt(clean, 16);
    const r = clamp(Math.round((number >> 16) * (1 + amount)), 0, 255);
    const g = clamp(Math.round(((number >> 8) & 255) * (1 + amount)), 0, 255);
    const b = clamp(Math.round((number & 255) * (1 + amount)), 0, 255);
    return `rgb(${r},${g},${b})`;
  }

  function drawGapBand(d0, d1, g0, g1) {
    const curse = state.curse;
    if (!curse || curse.id !== "buffer") return;
    const minWorld = roadDistanceForRender() + Math.min(d0, d1);
    const maxWorld = roadDistanceForRender() + Math.max(d0, d1);
    curse.meta.gaps.forEach((gap) => {
      if (gap.z + 58 < minWorld || gap.z > maxWorld) return;
      const lanes = [-.66, 0, .66];
      lanes.forEach((lane) => {
        if (Math.abs(lane - gap.safe) < .1) return;
        const left = lane - .25;
        const right = lane + .25;
        fillQuad("#10121a",
          { x: g0.center + left * g0.half, y: g0.y },
          { x: g0.center + right * g0.half, y: g0.y },
          { x: g1.center + right * g1.half, y: g1.y },
          { x: g1.center + left * g1.half, y: g1.y });
      });
      const safeX = g1.center + gap.safe * g1.half;
      ctx.fillStyle = "#d7ff55";
      ctx.fillRect(safeX - Math.max(1, g1.half * .03), g1.y - Math.max(1, g1.half * .02), Math.max(2, g1.half * .06), Math.max(2, g1.half * .04));
    });
  }

  function drawRoadsideProps() {
    const start = Math.floor(roadDistanceForRender() / 175);
    const end = Math.ceil((roadDistanceForRender() + 1450) / 175);
    const props = [];
    for (let i = start; i <= end; i += 1) {
      const z = i * 175 + seededUnit(i * 41 + state.stageIndex * 601) * 78;
      const distance = z - roadDistanceForRender();
      if (distance <= 15 || distance >= 1450) continue;
      const side = seededUnit(i * 83 + 4) > .5 ? 1 : -1;
      props.push({ distance, side, kind: hashNumber(i * 17 + state.stageIndex) % 6, seed: i });
    }
    props.sort((a, b) => b.distance - a.distance);
    props.forEach((prop) => {
      const projection = projectObject(prop.distance, prop.side * 1.35);
      if (!projection) return;
      drawProp(projection.x, projection.y, projection.scale, prop.kind, prop.side, prop.seed);
    });
  }

  function drawProp(x, y, scale, kind, side, seed) {
    const s = Math.max(.2, scale);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    if (kind === 0) {
      ctx.fillStyle = "#232830";
      ctx.fillRect(-3, -41, 6, 41);
      ctx.fillStyle = seed % 2 ? "#e8e1c9" : "#75e1d0";
      ctx.fillRect(side > 0 ? -5 : -29, -44, 34, 21);
      ctx.fillStyle = "#242732";
      ctx.font = "bold 8px monospace";
      ctx.fillText(seed % 3 === 0 ? "WWW" : "56K", side > 0 ? -1 : -25, -31);
    } else if (kind === 1) {
      ctx.fillStyle = "#5c3b2a";
      ctx.fillRect(-4, -34, 8, 34);
      ctx.fillStyle = "#2f7651";
      ctx.fillRect(-17, -54, 34, 24);
      ctx.fillStyle = "#62b978";
      ctx.fillRect(-12, -62, 24, 16);
    } else if (kind === 2) {
      ctx.strokeStyle = "#2f333b";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -48);
      ctx.stroke();
      ctx.fillStyle = "#d9d2be";
      ctx.fillRect(-18, -62, 36, 20);
      ctx.fillStyle = "#647080";
      ctx.fillRect(-13, -58, 26, 12);
    } else if (kind === 3) {
      ctx.fillStyle = "#d8cfb8";
      ctx.fillRect(-21, -37, 42, 32);
      ctx.fillStyle = "#5d6873";
      ctx.fillRect(-15, -32, 30, 18);
      ctx.fillStyle = "#20252d";
      ctx.fillRect(-8, -4, 16, 5);
    } else if (kind === 4) {
      ctx.strokeStyle = "#ddd7c5";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, -30, 18, .2, Math.PI * 1.3);
      ctx.stroke();
      ctx.fillStyle = "#404752";
      ctx.fillRect(-2, -31, 4, 31);
    } else {
      ctx.fillStyle = "#c43f56";
      ctx.fillRect(-15, -35, 30, 25);
      ctx.fillStyle = "#f4e8d0";
      ctx.fillRect(-10, -30, 20, 8);
      ctx.fillStyle = "#444";
      ctx.fillRect(-3, -10, 6, 10);
    }
    ctx.restore();
  }

  function visibleTrafficObjects() {
    const objects = [];
    state.traffic.forEach((traffic) => {
      const worldZ = traffic.startZ + state.stageTime * traffic.speed;
      const distance = worldZ - state.stageDistance;
      if (distance > 6 && distance < 1450) {
        objects.push({ distance, lane: traffic.lane, color: traffic.color, kind: state.curse?.id === "carts" ? "cart" : "traffic", id: traffic.id });
      }
    });
    const rivalGap = state.rivalDistance - state.stageDistance;
    if (rivalGap > 7 && rivalGap < 1450) objects.push({ distance: rivalGap, lane: -.12 + Math.sin(state.stageTime * .38) * .34, color: "#ffec5e", kind: "rival", id: "final-rival" });
    const curse = state.curse;
    if (curse?.id === "carts") curse.meta.objects.forEach((cart) => {
      const distance = cart.z - state.stageDistance;
      if (distance > 5 && distance < 1450) objects.push({ distance, lane: cart.lane, color: "#ded8c4", kind: "cart", id: cart.id });
    });
    if (curse?.id === "gps") {
      const distance = curse.meta.z - state.stageDistance;
      if (distance > 5 && distance < 1450) objects.push({ distance, lane: curse.meta.lane, color: "#ff5a5f", kind: "gps-blocker", id: "gps-blocker" });
    }
    if (curse?.id === "popup" && !curse.meta.closed) {
      const distance = curse.meta.z - state.stageDistance;
      if (distance > 5 && distance < 1450) objects.push({ distance, lane: curse.meta.lane, color: "#6d78dc", kind: "popup-blocker", id: "popup-blocker" });
    }
    objects.sort((a, b) => b.distance - a.distance);
    return objects;
  }

  function drawTraffic() {
    visibleTrafficObjects().forEach((object) => {
      const p = projectObject(object.distance, object.lane);
      if (!p) return;
      if (object.kind === "cart") drawCart(p.x, p.y, p.scale);
      else if (object.kind === "gps-blocker") drawBlocker(p.x, p.y, p.scale, "GPS", "#ff5a5f");
      else if (object.kind === "popup-blocker") drawBlocker(p.x, p.y, p.scale, "X", "#6d78dc");
      else drawCar(p.x, p.y, p.scale * .78, object.color, object.kind === "rival", 0, .98);
    });
  }

  function drawCar(x, y, scale, color, rival, tilt, alpha = 1) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.rotate(tilt);
    ctx.scale(scale, scale);
    ctx.fillStyle = "rgba(0,0,0,.34)";
    ctx.beginPath();
    ctx.ellipse(0, 4, 28, 8, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#191c23";
    ctx.fillRect(-27, -6, 8, 15);
    ctx.fillRect(19, -6, 8, 15);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(-24, 3);
    ctx.lineTo(-20, -17);
    ctx.lineTo(-11, -29);
    ctx.lineTo(12, -29);
    ctx.lineTo(22, -15);
    ctx.lineTo(27, 4);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = rival ? "#242238" : "#283a45";
    ctx.beginPath();
    ctx.moveTo(-10, -26);
    ctx.lineTo(10, -26);
    ctx.lineTo(16, -15);
    ctx.lineTo(-16, -15);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = rival ? "#ff4e7b" : "#ffef72";
    ctx.fillRect(-18, -5, 7, 5);
    ctx.fillRect(11, -5, 7, 5);
    ctx.fillStyle = "#15171d";
    ctx.fillRect(-8, 1, 16, 4);
    if (rival) {
      ctx.fillStyle = "#ffec5e";
      ctx.fillRect(-27, -35, 54, 5);
      ctx.fillStyle = "#201d35";
      ctx.fillRect(-20, -39, 40, 4);
    }
    ctx.restore();
  }

  function drawCart(x, y, scale) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.strokeStyle = "#e8e1ca";
    ctx.lineWidth = 3;
    ctx.strokeRect(-18, -23, 32, 23);
    for (let i = -12; i <= 8; i += 7) {
      ctx.beginPath();
      ctx.moveTo(i, -21);
      ctx.lineTo(i + 3, -2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(14, -22);
    ctx.lineTo(23, -31);
    ctx.lineTo(29, -31);
    ctx.stroke();
    ctx.fillStyle = "#272a32";
    ctx.beginPath(); ctx.arc(-10, 4, 4, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(12, 4, 4, 0, TAU); ctx.fill();
    ctx.restore();
  }

  function drawBlocker(x, y, scale, label, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.fillStyle = "rgba(0,0,0,.35)";
    ctx.fillRect(-25, -4, 50, 9);
    ctx.fillStyle = color;
    ctx.fillRect(-24, -42, 48, 40);
    ctx.fillStyle = "#f8f1db";
    ctx.fillRect(-20, -37, 40, 8);
    ctx.fillStyle = "#17191e";
    ctx.font = "bold 15px monospace";
    ctx.textAlign = "center";
    ctx.fillText(label, 0, -11);
    ctx.restore();
  }

  function drawPlayer() {
    const car = currentCar();
    const baseY = height * .84 - state.air * Math.min(82, height * .11);
    const scale = clamp(Math.min(width, height) / 520, .72, 1.38);
    const steer = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const tilt = clamp(-state.lateralVelocity * .09 - steer * .025, -.16, .16);

    if (state.boosting) {
      ctx.save();
      ctx.globalAlpha = .45 + seededUnit(Math.floor(state.stageTime * 50)) * .25;
      ctx.fillStyle = "#43f2ff";
      ctx.beginPath();
      ctx.moveTo(width * .5 - 24 * scale, baseY + 21 * scale);
      ctx.lineTo(width * .5 - 9 * scale, baseY + (60 + state.speed * .08) * scale);
      ctx.lineTo(width * .5 - 2 * scale, baseY + 22 * scale);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(width * .5 + 24 * scale, baseY + 21 * scale);
      ctx.lineTo(width * .5 + 9 * scale, baseY + (60 + state.speed * .08) * scale);
      ctx.lineTo(width * .5 + 2 * scale, baseY + 22 * scale);
      ctx.fill();
      ctx.restore();
    }
    drawCar(width * .5, baseY, scale * 1.42, car.color, false, tilt, 1);
    ctx.save();
    ctx.translate(width * .5, baseY);
    ctx.rotate(tilt);
    ctx.fillStyle = car.trim;
    ctx.fillRect(-19 * scale, -8 * scale, 38 * scale, 4 * scale);
    ctx.restore();

    if (state.air > .35) {
      ctx.fillStyle = "rgba(255,255,255,.7)";
      ctx.font = `bold ${Math.round(11 * scale)}px monospace`;
      ctx.textAlign = "center";
      ctx.fillText("FLOAT", width * .5, baseY - 55 * scale);
    }
  }

  function drawChairPursuit() {
    const curse = state.curse;
    if (!curse || curse.id !== "chair") return;
    const proximity = clamp(1 - curse.meta.distance / 400, 0, 1);
    const x = width * (.12 + proximity * .19);
    const y = height * (.78 - proximity * .05);
    const s = .65 + proximity * .65;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.strokeStyle = "#f0ead7";
    ctx.lineWidth = 5;
    ctx.strokeRect(-18, -47, 36, 35);
    ctx.beginPath();
    ctx.moveTo(0, -12); ctx.lineTo(0, 11);
    ctx.moveTo(0, 11); ctx.lineTo(-20, 22);
    ctx.moveTo(0, 11); ctx.lineTo(20, 22);
    ctx.stroke();
    ctx.fillStyle = "#252a34";
    ctx.beginPath(); ctx.arc(-20, 24, 5, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(20, 24, 5, 0, TAU); ctx.fill();
    ctx.fillStyle = "#ff5a5f";
    ctx.fillRect(-13, -39, 26, 7);
    ctx.restore();
    ctx.fillStyle = "#fff";
    ctx.font = "bold 10px monospace";
    ctx.textAlign = "left";
    ctx.fillText(`${Math.round(curse.meta.distance)}m BEHIND`, x - 32, y + 43);
  }

  function drawGpsLie() {
    const curse = state.curse;
    if (!curse || curse.id !== "gps") return;
    const direction = curse.meta.lane > 0 ? "→" : "←";
    ctx.save();
    ctx.translate(width * .5, height * .19);
    ctx.fillStyle = "rgba(24,28,35,.88)";
    ctx.fillRect(-63, -24, 126, 48);
    ctx.fillStyle = "#d7ff55";
    ctx.font = `900 ${Math.round(clamp(width * .035, 22, 42))}px monospace`;
    ctx.textAlign = "center";
    ctx.fillText(`${direction} EXIT`, 0, 12);
    ctx.restore();
  }

  function drawSpeedEffects(stage) {
    const amount = clamp((state.speed - 135) / 130, 0, 1);
    if (amount <= 0) return;
    ctx.save();
    ctx.globalAlpha = amount * .24;
    ctx.strokeStyle = stage.accent;
    ctx.lineWidth = 1.5;
    const count = Math.floor(18 * amount);
    for (let i = 0; i < count; i += 1) {
      const seed = hashNumber(i * 41 + Math.floor(state.stageTime * 24));
      const x = seededUnit(seed) * width;
      const y = height * (.34 + seededUnit(seed + 3) * .58);
      const dx = (x - width * .5) * .065;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + dx, y + 12 + amount * 25);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawBoostMeter() {
    const meterWidth = clamp(width * .18, 90, 210);
    const x = width * .5 - meterWidth * .5;
    const y = height - (height > width ? 126 : 24);
    const maxBoost = 100 + state.upgrades.boost * 15;
    ctx.fillStyle = "rgba(13,16,22,.82)";
    ctx.fillRect(x - 3, y - 3, meterWidth + 6, 12);
    ctx.fillStyle = state.boosting ? "#fff06a" : "#43f2ff";
    ctx.fillRect(x, y, meterWidth * clamp(state.boost / maxBoost, 0, 1), 6);
    ctx.fillStyle = "#fff8d6";
    ctx.font = "bold 9px monospace";
    ctx.textAlign = "center";
    ctx.fillText("BOOST CACHE", width * .5, y - 7);
  }

  function render() {
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const stage = STAGES[state.stageIndex];
    const shakeX = state.shake > 0 ? (seededUnit(Math.floor(state.attractTime * 80) + 9) - .5) * state.shake * 11 : 0;
    const shakeY = state.shake > 0 ? (seededUnit(Math.floor(state.attractTime * 90) + 21) - .5) * state.shake * 7 : 0;
    ctx.save();
    ctx.translate(shakeX, shakeY);
    drawSky(stage);
    drawRoad(stage);
    drawRoadsideProps();
    drawTraffic();
    drawChairPursuit();
    drawSpeedEffects(stage);
    drawPlayer();
    drawGpsLie();
    drawBoostMeter();
    ctx.restore();

    if (state.collisionFlash > 0) {
      ctx.fillStyle = `rgba(255,70,82,${state.collisionFlash * .22})`;
      ctx.fillRect(0, 0, width, height);
    }
    if (state.curse?.id === "invert") {
      ctx.save();
      ctx.globalCompositeOperation = "difference";
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    }
  }

  function frame(now) {
    const elapsed = Math.min(.05, Math.max(0, (now - lastFrame) / 1000));
    lastFrame = now;
    if (!manualStepping) update(elapsed);
    render();
    frameHandle = requestAnimationFrame(frame);
  }

  function resizeCanvas() {
    const rect = shell.getBoundingClientRect();
    width = Math.max(320, rect.width || window.innerWidth || 320);
    height = Math.max(320, rect.height || window.innerHeight || 320);
    dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    const pixelWidth = Math.round(width * dpr);
    const pixelHeight = Math.round(height * dpr);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    render();
  }

  function toggleFullscreen() {
    try {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      else shell.requestFullscreen?.().catch(() => {});
    } catch (_) {
      // Fullscreen is platform-controlled and optional.
    }
  }

  function toggleMute() {
    audioMuted = !audioMuted;
    ensureAudio();
    updateHud();
    setEngineAudio();
  }

  function renderGarage() {
    ui.bankLine.textContent = `BANK: ${save.bytes} BYTES · CUPS WON: ${save.cupsWon}`;
    ui.carList.replaceChildren();
    Object.values(CARS).forEach((car) => {
      const unlocked = save.unlocked.includes(car.id);
      const selected = save.selectedCar === car.id;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "car-option";
      button.dataset.car = car.id;
      button.setAttribute("aria-pressed", String(selected));
      const swatch = document.createElement("span");
      swatch.className = "car-swatch";
      const strong = document.createElement("strong");
      strong.textContent = car.name;
      const small = document.createElement("small");
      small.textContent = `${car.copy} ${unlocked ? (selected ? "SELECTED" : "SELECT") : `UNLOCK ${car.cost} BYTES`}`;
      button.append(swatch, strong, small);
      if (!unlocked && save.bytes < car.cost) {
        button.disabled = true;
        small.textContent += ` · NEED ${car.cost - save.bytes}`;
      }
      button.addEventListener("click", () => selectOrBuyCar(car.id));
      ui.carList.append(button);
    });
  }

  function selectOrBuyCar(id) {
    const car = CARS[id];
    if (!car) return;
    if (!save.unlocked.includes(id)) {
      if (save.bytes < car.cost) return;
      save.bytes -= car.cost;
      save.unlocked.push(id);
      showToast(`${car.name} UNLOCKED`, 2.4);
      tone("upgrade");
    }
    save.selectedCar = id;
    persistSave();
    renderGarage();
    render();
  }

  function openDialog(dialog) {
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  }

  function closeDialog(dialog) {
    if (typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
    shell.focus({ preventScroll: true });
  }

  function garageOpen() {
    renderGarage();
    openDialog(ui.garageDialog);
  }

  function drivingKey(key) {
    return ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "a", "d", "w", "s", "A", "D", "W", "S", " ", "Shift"].includes(key);
  }

  function setKey(key, pressed) {
    if (key === "ArrowLeft" || key === "a" || key === "A") input.left = pressed;
    if (key === "ArrowRight" || key === "d" || key === "D") input.right = pressed;
    if (key === "ArrowUp" || key === "w" || key === "W") input.throttle = pressed;
    if (key === "ArrowDown" || key === "s" || key === "S") input.brake = pressed;
    if (key === " " || key === "Shift") input.boost = pressed;
  }

  document.addEventListener("keydown", (event) => {
    const dialogOpen = ui.garageDialog.open || ui.controlsDialog.open;
    if (drivingKey(event.key)) {
      if (dialogOpen || state.mode === "upgrade" || state.mode === "result" || state.mode === "paused") return;
      event.preventDefault();
      ensureAudio();
      beginRace();
      setKey(event.key, true);
    }
    if (event.repeat && ["p", "P", "r", "R", "m", "M", "f", "F"].includes(event.key)) return;
    if (event.key === "p" || event.key === "P") { event.preventDefault(); togglePause(); }
    if (event.key === "r" || event.key === "R") { event.preventDefault(); if (["race", "ready", "paused"].includes(state.mode)) restartCurrentStage(); }
    if (event.key === "m" || event.key === "M") { event.preventDefault(); toggleMute(); }
    if (event.key === "f" || event.key === "F") { event.preventDefault(); toggleFullscreen(); }
  });

  document.addEventListener("keyup", (event) => {
    if (drivingKey(event.key)) {
      event.preventDefault();
      setKey(event.key, false);
    }
  });

  function bindHold(button, property, touchBoost = false) {
    const release = (event) => {
      if (event) event.preventDefault();
      input[property] = false;
      if (touchBoost) input.touchBoost = false;
      button.classList.remove("pressed");
      if (event?.pointerId !== undefined && button.hasPointerCapture?.(event.pointerId)) button.releasePointerCapture(event.pointerId);
    };
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      ensureAudio();
      beginRace();
      input[property] = true;
      if (touchBoost) input.touchBoost = true;
      button.classList.add("pressed");
      button.setPointerCapture?.(event.pointerId);
    });
    button.addEventListener("pointerup", release);
    button.addEventListener("pointercancel", release);
    button.addEventListener("lostpointercapture", release);
  }

  bindHold(ui.touchLeft, "left");
  bindHold(ui.touchRight, "right");
  bindHold(ui.touchBrake, "brake");
  bindHold(ui.touchGas, "throttle", true);

  ui.pauseButton.addEventListener("click", () => { ensureAudio(); togglePause(); });
  ui.muteButton.addEventListener("click", toggleMute);
  ui.fullscreenButton.addEventListener("click", toggleFullscreen);
  ui.resumeButton.addEventListener("click", resumeGame);
  ui.restartButton.addEventListener("click", restartCurrentStage);
  ui.retryButton.addEventListener("click", restartCurrentStage);
  ui.newCupButton.addEventListener("click", startNewCup);
  ui.garageButton.addEventListener("click", garageOpen);
  ui.resultGarageButton.addEventListener("click", garageOpen);
  ui.garageClose.addEventListener("click", () => closeDialog(ui.garageDialog));
  ui.controlsButton.addEventListener("click", () => openDialog(ui.controlsDialog));
  ui.controlsClose.addEventListener("click", () => closeDialog(ui.controlsDialog));
  ui.popupClose.addEventListener("click", closePopup);

  shell.addEventListener("contextmenu", (event) => event.preventDefault());
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && state.mode === "race") pauseGame(true);
    lastFrame = performance.now();
  });
  document.addEventListener("fullscreenchange", resizeCanvas);

  const resizeObserver = typeof ResizeObserver === "function" ? new ResizeObserver(resizeCanvas) : null;
  if (resizeObserver) resizeObserver.observe(shell);
  else window.addEventListener("resize", resizeCanvas);

  for (let i = 0; i < 10; i += 1) ui.signal.append(document.createElement("i"));

  window.render_game_to_text = () => {
    const stage = STAGES[state.stageIndex];
    const visible = visibleTrafficObjects().slice(0, 8).map((object) => ({
      id: object.id,
      type: object.kind,
      ahead_m: round(object.distance, 0),
      lane_x: round(object.lane, 2)
    }));
    return JSON.stringify({
      coordinate_system: "Road coordinates: longitudinal distance_m increases toward finish; lateral_x 0 is lane center, -1 left edge, +1 right edge; visible object ahead_m is positive in front of player.",
      mode: state.mode,
      outcome: state.outcome,
      failure_reason: state.failureReason || null,
      player: {
        distance_m: round(state.stageDistance, 1),
        speed_kmh: round(state.speed, 1),
        lateral_x: round(state.x, 3),
        lateral_velocity: round(state.lateralVelocity, 3),
        drift: round(state.drift, 2),
        signal: round(state.integrity, 1),
        boost: round(state.boost, 1),
        airborne: state.air > .35,
        offroad: Math.abs(state.x) > 1.04
      },
      road: {
        stage_name: stage.name,
        length_m: stage.length,
        progress: round(state.stageDistance / stage.length, 4),
        time_s: round(state.stageTime, 1),
        time_limit_s: stage.timeLimit,
        curve: round(trackCurve(state.stageDistance), 2),
        checkpoints: state.checkpoints
      },
      traffic: visible,
      rival: {
        gap_m: round(state.rivalGap, 1),
        finished: state.rivalFinished,
        position: state.position
      },
      curse: state.curse ? {
        id: state.curse.id,
        name: state.curse.name,
        remaining_s: round(state.curse.remaining, 1),
        serial: state.curse.serial,
        resolved_popup: state.curse.id === "popup" ? state.popupClosed : null
      } : {
        id: null,
        name: null,
        remaining_s: 0,
        serial: state.curseSerial,
        next_in_s: round(Math.max(0, state.nextCurseAt - state.stageTime), 1)
      },
      stage: {
        number: state.stageIndex + 1,
        total: STAGES.length,
        checkpoints: state.checkpoints,
        stages_cleared: state.stagesCleared,
        result_serial: state.stageResultSerial
      },
      cup: {
        bytes_earned: state.cupBytes,
        race_time_s: round(state.totalRaceTime, 1),
        upgrades: { ...state.upgrades },
        curses_seen: state.cursesSeen,
        collisions: state.collisions
      },
      progression: {
        bank_bytes: save.bytes,
        selected_car: save.selectedCar,
        unlocked_cars: save.unlocked.slice(),
        cups_won: save.cupsWon,
        best_stage: save.bestStage
      },
      controls: "Arrows/WASD drive; Space/Shift boost; P pause; R restart; M mute; F fullscreen. Touch: #touch-left, #touch-right, #touch-brake, #touch-gas."
    });
  };

  window.advanceTime = (ms) => {
    const bounded = clamp(Number(ms) || 0, 0, 600000);
    const steps = Math.max(1, Math.ceil(bounded / (1000 / 60)));
    const dt = bounded / 1000 / steps;
    manualStepping = true;
    for (let i = 0; i < steps; i += 1) update(dt);
    manualStepping = false;
    render();
    return window.render_game_to_text();
  };

  resizeCanvas();
  startNewCup();
  cancelAnimationFrame(frameHandle);
  frameHandle = requestAnimationFrame(frame);
})();
