(() => {
  "use strict";

  const canvas = document.querySelector("#game-canvas");
  const stage = document.querySelector("#bridge-stage");
  const ctx = canvas.getContext("2d", { alpha: false });
  const nodeLayer = document.querySelector("#node-layer");
  const dispatchButton = document.querySelector("#dispatch-btn");
  const retryButton = document.querySelector("#retry-btn");
  const nextButton = document.querySelector("#next-btn");
  const resultCard = document.querySelector("#result-card");
  const liveStatus = document.querySelector("#live-status");
  const soundButton = document.querySelector("#sound-btn");
  const soundState = document.querySelector("#sound-state");
  const workshopButton = document.querySelector("#workshop-btn");
  const workshopState = document.querySelector("#workshop-state");

  const SAVE_KEY = "trussfall-save-v1";
  const SAVE_VERSION = 1;
  const SAFE_LIMIT = 1;
  const TAU = Math.PI * 2;

  const nodes = [
    { id: 1, x: 0.24, y: 0.41, label: "upper left deck joint" },
    { id: 2, x: 0.50, y: 0.41, label: "upper center deck joint" },
    { id: 3, x: 0.76, y: 0.41, label: "upper right deck joint" },
    { id: 4, x: 0.07, y: 0.62, label: "left bedrock anchor" },
    { id: 5, x: 0.93, y: 0.62, label: "right bedrock anchor" },
    { id: 6, x: 0.50, y: 0.72, label: "lower center joint" },
    { id: 7, x: 0.24, y: 0.72, label: "lower left joint" },
    { id: 8, x: 0.76, y: 0.72, label: "lower right joint" }
  ];

  const baseMembers = [
    { id: "M-01", a: 4, b: 1 },
    { id: "M-02", a: 1, b: 2 },
    { id: "M-03", a: 2, b: 3 },
    { id: "M-04", a: 3, b: 5 },
    { id: "M-05", a: 4, b: 7 },
    { id: "M-06", a: 7, b: 6 },
    { id: "M-07", a: 6, b: 8 },
    { id: "M-08", a: 8, b: 5 },
    { id: "M-09", a: 1, b: 7 },
    { id: "M-10", a: 2, b: 6 },
    { id: "M-11", a: 3, b: 8 }
  ];

  const candidates = {
    L_FWD: { id: "B-A", a: 1, b: 6, label: "left descending brace" },
    L_BACK: { id: "B-B", a: 2, b: 7, label: "left rising brace" },
    R_FWD: { id: "B-C", a: 2, b: 8, label: "right descending brace" },
    R_BACK: { id: "B-D", a: 3, b: 6, label: "right rising brace" }
  };

  const contracts = [
    {
      name: "Dockyard warm-up",
      brief: "Close the open left bay before the test truck reaches midspan.",
      field: "<strong>Joint 1 to Joint 6.</strong> Give the left deck load a diagonal route into the lower chord.",
      weight: 8,
      wind: 0,
      budget: 1,
      basePeak: 1.26,
      required: ["L_FWD"],
      effect: 0.52,
      critical: "M-02",
      failReason: "The unbraced left bay racked sideways under the front axle."
    },
    {
      name: "Eastbound steel",
      brief: "The approach shifts the peak to the right bay. Reverse the diagonal.",
      field: "<strong>Joint 3 to Joint 6.</strong> Catch the eastbound axle before it unloads into the right pier.",
      weight: 10,
      wind: 0.08,
      budget: 1,
      basePeak: 1.28,
      required: ["R_BACK"],
      effect: 0.43,
      critical: "M-03",
      failReason: "The right deck chord took the whole axle pulse without a return brace."
    },
    {
      name: "Split manifest",
      brief: "Two heavy pallets straddle midspan. Stabilise both open bays.",
      field: "<strong>Joint 2 to 7, then 2 to 8.</strong> Build opposing fans so the center joint can share its load.",
      weight: 12,
      wind: 0.14,
      budget: 2,
      basePeak: 1.44,
      required: ["L_BACK", "R_FWD"],
      effect: 0.30,
      critical: "M-10",
      failReason: "The center vertical attracted both pallet loads after one bay stayed open."
    },
    {
      name: "Saltwind local",
      brief: "A narrow truck and a west gust put the left diagonal into tension.",
      field: "<strong>Joint 1 to Joint 6.</strong> The wind arrow shows which diagonal stays useful in tension.",
      weight: 14,
      wind: -0.26,
      budget: 1,
      basePeak: 1.34,
      required: ["L_FWD"],
      effect: 0.40,
      critical: "M-09",
      failReason: "The left vertical buckled because the gust had no diagonal tension path."
    },
    {
      name: "Reefer priority",
      brief: "A tall refrigerated load catches the east wind over the right panel.",
      field: "<strong>Joint 2 to Joint 8.</strong> Send lateral load downwind instead of back through the deck.",
      weight: 16,
      wind: 0.32,
      budget: 1,
      basePeak: 1.38,
      required: ["R_FWD"],
      effect: 0.44,
      critical: "M-11",
      failReason: "The tall load pushed the right vertical beyond its lateral capacity."
    },
    {
      name: "Night double",
      brief: "Two axles and a crosswind demand a continuous zig-zag load path.",
      field: "<strong>Joint 1 to 6, then 3 to 6.</strong> Tie both deck shoulders into the center of the lower chord.",
      weight: 18,
      wind: -0.36,
      budget: 2,
      basePeak: 1.54,
      required: ["L_FWD", "R_BACK"],
      effect: 0.315,
      critical: "M-06",
      failReason: "The lower chord split because one shoulder had no route to the center joint."
    },
    {
      name: "Storm ledger",
      brief: "Repeated gusts reverse the useful diagonal in the left bay.",
      field: "<strong>Joint 2 to 7, then 3 to 6.</strong> Mirror the gust arrows with a rising brace pair.",
      weight: 21,
      wind: 0.44,
      budget: 2,
      basePeak: 1.56,
      required: ["L_BACK", "R_BACK"],
      effect: 0.305,
      critical: "M-07",
      failReason: "The lower right chord exceeded capacity after the gust reversed the load fan."
    },
    {
      name: "The last span",
      brief: "Maximum permit load. Build the final two-member fan and trust the numbers.",
      field: "<strong>Joint 1 to 6, then 2 to 8.</strong> Two descending braces keep every member below its limit.",
      weight: 24,
      wind: -0.50,
      budget: 2,
      basePeak: 1.62,
      required: ["L_FWD", "R_FWD"],
      effect: 0.35,
      critical: "M-10",
      failReason: "The center vertical carried the permit load alone after an incomplete fan."
    }
  ];

  function defaultSave() {
    return {
      version: SAVE_VERSION,
      unlocked: 0,
      cleared: [],
      bolts: 0,
      couplers: false,
      muted: false
    };
  }

  function loadSave() {
    try {
      const parsed = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (!parsed || parsed.version !== SAVE_VERSION) return defaultSave();
      return {
        ...defaultSave(),
        ...parsed,
        unlocked: Math.max(0, Math.min(contracts.length - 1, Number(parsed.unlocked) || 0)),
        cleared: Array.isArray(parsed.cleared) ? parsed.cleared.filter(Number.isInteger) : []
      };
    } catch {
      return defaultSave();
    }
  }

  function writeSave() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(save));
    } catch {
      // Local progress is optional when storage is unavailable.
    }
  }

  const save = loadSave();
  const state = {
    mode: "BUILD",
    contractIndex: save.unlocked,
    selectedNode: null,
    braces: [],
    truckProgress: 0,
    truckSpeed: 0.22,
    time: 0,
    visualTime: 0,
    lastFrame: performance.now(),
    viewWidth: 1,
    viewHeight: 1,
    dpr: 1,
    failureMember: null,
    failurePeak: 0,
    particles: [],
    dispatches: 0,
    completedThisRun: 0,
    placements: 0,
    audioContext: null,
    drag: null,
    suppressClick: false
  };

  const elements = {
    contractNumber: document.querySelector("#contract-number"),
    contractStatus: document.querySelector("#contract-status"),
    contractName: document.querySelector("#contract-name"),
    contractBrief: document.querySelector("#contract-brief"),
    instruction: document.querySelector("#instruction-copy"),
    load: document.querySelector("#load-readout"),
    wind: document.querySelector("#wind-readout"),
    budget: document.querySelector("#budget-readout"),
    peak: document.querySelector("#peak-value"),
    risk: document.querySelector("#risk-label"),
    needle: document.querySelector("#stress-needle"),
    weakest: document.querySelector("#weakest-member"),
    contractStrip: document.querySelector("#contract-strip"),
    resultKicker: document.querySelector("#result-kicker"),
    resultTitle: document.querySelector("#result-title"),
    resultCopy: document.querySelector("#result-copy")
  };

  function currentContract() {
    return contracts[state.contractIndex];
  }

  function candidateKeyForPair(a, b) {
    const low = Math.min(a, b);
    const high = Math.max(a, b);
    return Object.keys(candidates).find((key) => {
      const candidate = candidates[key];
      return Math.min(candidate.a, candidate.b) === low && Math.max(candidate.a, candidate.b) === high;
    }) || null;
  }

  function analyze() {
    const contract = currentContract();
    const correct = contract.required.filter((key) => state.braces.includes(key)).length;
    const wrong = state.braces.filter((key) => !contract.required.includes(key)).length;
    const couplerRelief = save.couplers ? 0.045 : 0;
    const peak = Math.max(
      0.45,
      contract.basePeak - correct * contract.effect - wrong * 0.035 - couplerRelief
    );
    const missing = contract.required.filter((key) => !state.braces.includes(key));
    return {
      peak,
      percent: Math.round(peak * 100),
      safe: peak < SAFE_LIMIT,
      correct,
      missing,
      wrong,
      weakest: contract.critical
    };
  }

  function announce(message) {
    liveStatus.textContent = "";
    requestAnimationFrame(() => {
      liveStatus.textContent = message;
    });
  }

  function windLabel(value) {
    if (Math.abs(value) < 0.05) return "CALM";
    const direction = value > 0 ? "E" : "W";
    return `${direction} ${Math.round(Math.abs(value) * 50)} kn`;
  }

  function soundTone(frequency, duration, type = "sine", gainValue = 0.04, delay = 0) {
    if (save.muted || !state.audioContext) return;
    const audio = state.audioContext;
    const start = audio.currentTime + delay;
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(gainValue, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain);
    gain.connect(audio.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.03);
  }

  function ensureAudio() {
    if (!state.audioContext) {
      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      if (AudioCtor) state.audioContext = new AudioCtor();
    }
    if (state.audioContext?.state === "suspended") {
      state.audioContext.resume().catch(() => {});
    }
  }

  function playPlaceSound(removed) {
    soundTone(removed ? 260 : 420, 0.09, "triangle", 0.035);
    soundTone(removed ? 190 : 620, 0.08, "sine", 0.022, 0.06);
  }

  function playDispatchSound() {
    soundTone(96, 0.42, "sawtooth", 0.025);
    soundTone(142, 0.28, "triangle", 0.02, 0.11);
  }

  function playSuccessSound() {
    soundTone(330, 0.16, "triangle", 0.035);
    soundTone(494, 0.18, "triangle", 0.038, 0.12);
    soundTone(660, 0.22, "sine", 0.03, 0.25);
  }

  function playFailureSound() {
    soundTone(150, 0.34, "sawtooth", 0.04);
    soundTone(82, 0.5, "square", 0.018, 0.08);
  }

  function setSelectedNode(id) {
    state.selectedNode = id;
    updateNodeButtons();
    if (id === null) {
      announce("Joint selection cleared.");
    } else {
      announce(`Joint ${id} selected. Choose a second joint.`);
    }
  }

  function toggleBraceBetween(first, second) {
    if (state.mode !== "BUILD" || first === second) {
      setSelectedNode(null);
      return false;
    }
    const key = candidateKeyForPair(first, second);
    if (!key) {
      announce(`Joints ${first} and ${second} are not an approved brace bay.`);
      state.selectedNode = null;
      updateNodeButtons();
      return false;
    }

    const existingIndex = state.braces.indexOf(key);
    let removed = false;
    if (existingIndex >= 0) {
      state.braces.splice(existingIndex, 1);
      removed = true;
    } else {
      const budget = currentContract().budget;
      if (state.braces.length >= budget) {
        announce(`Brace budget is full. Remove one of the ${budget} fitted braces first.`);
        state.selectedNode = null;
        updateNodeButtons();
        return false;
      }
      state.braces.push(key);
      state.placements += 1;
    }
    state.selectedNode = null;
    playPlaceSound(removed);
    const analysis = analyze();
    announce(
      removed
        ? `${candidates[key].label} removed. Predicted peak ${analysis.percent} percent.`
        : `${candidates[key].label} fitted. Predicted peak ${analysis.percent} percent.`
    );
    updateUi();
    return true;
  }

  function handleNode(id) {
    if (state.mode !== "BUILD") return;
    ensureAudio();
    if (state.suppressClick) {
      state.suppressClick = false;
      return;
    }
    if (state.selectedNode === null) {
      setSelectedNode(id);
      return;
    }
    toggleBraceBetween(state.selectedNode, id);
  }

  function resetContract(index = state.contractIndex) {
    state.contractIndex = Math.max(0, Math.min(save.unlocked, index));
    state.mode = "BUILD";
    state.selectedNode = null;
    state.braces = [];
    state.truckProgress = 0;
    state.failureMember = null;
    state.failurePeak = 0;
    state.particles.length = 0;
    state.drag = null;
    resultCard.hidden = true;
    updateUi();
    announce(`Contract ${state.contractIndex + 1}. ${currentContract().name}. Bridge ready for bracing.`);
  }

  function dispatch() {
    if (state.mode !== "BUILD") return;
    ensureAudio();
    state.selectedNode = null;
    state.mode = "TRIAL";
    state.truckProgress = 0;
    state.failureMember = null;
    state.dispatches += 1;
    resultCard.hidden = true;
    playDispatchSound();
    updateUi();
    announce(`Truck dispatched. Predicted peak ${analyze().percent} percent.`);
  }

  function completeContract() {
    if (state.mode !== "TRIAL") return;
    state.mode = "SUCCESS";
    const firstClear = !save.cleared.includes(state.contractIndex);
    if (firstClear) {
      save.cleared.push(state.contractIndex);
      save.bolts += 1;
    }
    if (state.contractIndex < contracts.length - 1) {
      save.unlocked = Math.max(save.unlocked, state.contractIndex + 1);
    }
    writeSave();
    state.completedThisRun += 1;
    playSuccessSound();

    elements.resultKicker.textContent = "LOAD TEST PASSED";
    elements.resultTitle.textContent = "Bridge held.";
    const reward = firstClear ? " One workshop bolt earned." : " Previous best confirmed.";
    elements.resultCopy.textContent = `Peak stress stayed at ${analyze().percent}% while the truck cleared the far pier.${reward}`;
    retryButton.textContent = "Replay contract";
    nextButton.hidden = state.contractIndex >= contracts.length - 1;
    nextButton.textContent = "Next contract";
    resultCard.hidden = false;
    announce(`Contract passed at ${analyze().percent} percent peak stress.${reward}`);
    updateUi();
  }

  function createFailureParticles() {
    const member = baseMembers.find((item) => item.id === currentContract().critical) || baseMembers[1];
    const a = getNode(member.a);
    const b = getNode(member.b);
    const center = {
      x: ((a.x + b.x) * 0.5) * state.viewWidth,
      y: ((a.y + b.y) * 0.5) * state.viewHeight
    };
    state.particles.length = 0;
    for (let i = 0; i < 22; i += 1) {
      const angle = (i / 22) * TAU + (i % 3) * 0.19;
      const speed = 28 + (i % 7) * 8;
      state.particles.push({
        x: center.x,
        y: center.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 26,
        life: 0.9 + (i % 5) * 0.1,
        size: 2 + (i % 3)
      });
    }
  }

  function failContract() {
    if (state.mode !== "TRIAL") return;
    const analysis = analyze();
    state.mode = "FAILURE";
    state.failureMember = currentContract().critical;
    state.failurePeak = analysis.peak;
    createFailureParticles();
    playFailureSound();

    elements.resultKicker.textContent = "LOAD TEST FAILED";
    elements.resultTitle.textContent = `${state.failureMember} snapped.`;
    elements.resultCopy.textContent = `${currentContract().failReason} It reached ${analysis.percent}% of rated capacity; the limit is 100%.`;
    retryButton.textContent = "Retry contract";
    nextButton.hidden = true;
    resultCard.hidden = false;
    announce(`${state.failureMember} failed at ${analysis.percent} percent. ${currentContract().failReason}`);
    updateUi();
  }

  function nextContract() {
    if (state.mode !== "SUCCESS") return;
    resetContract(Math.min(state.contractIndex + 1, contracts.length - 1));
  }

  function fitCouplers() {
    if (save.couplers || save.bolts < 3) return;
    save.bolts -= 3;
    save.couplers = true;
    writeSave();
    soundTone(540, 0.13, "triangle", 0.03);
    soundTone(760, 0.18, "sine", 0.027, 0.1);
    updateUi();
    announce("Precision couplers fitted. Every predicted peak is reduced by four percentage points.");
  }

  function getNode(id) {
    return nodes.find((node) => node.id === id);
  }

  function updateNodeButtons() {
    const buttons = nodeLayer.querySelectorAll(".joint-button");
    const contract = currentContract();
    const suggestedIds = new Set(
      contract.required
        .filter((key) => !state.braces.includes(key))
        .flatMap((key) => [candidates[key].a, candidates[key].b])
    );
    buttons.forEach((button) => {
      const id = Number(button.dataset.node);
      button.classList.toggle("selected", state.selectedNode === id);
      button.classList.toggle("suggested", state.mode === "BUILD" && state.braces.length === 0 && suggestedIds.has(id));
      button.disabled = state.mode !== "BUILD";
      button.setAttribute("aria-pressed", String(state.selectedNode === id));
    });
  }

  function buildNodeButtons() {
    const fragment = document.createDocumentFragment();
    for (const node of nodes) {
      const button = document.createElement("button");
      button.type = "button";
      button.id = `node-${node.id}`;
      button.className = "joint-button";
      button.dataset.node = String(node.id);
      button.textContent = String(node.id);
      button.setAttribute("aria-label", `Joint ${node.id}, ${node.label}`);
      button.setAttribute("aria-describedby", "game-instructions");
      button.addEventListener("click", () => handleNode(node.id));
      button.addEventListener("pointerdown", (event) => {
        if (state.mode !== "BUILD") return;
        ensureAudio();
        state.drag = {
          id: node.id,
          x: event.clientX,
          y: event.clientY,
          pointerId: event.pointerId
        };
      });
      fragment.append(button);
    }
    nodeLayer.append(fragment);
    updateNodeButtons();
  }

  function nearestNodeFromClient(clientX, clientY) {
    const rect = stage.getBoundingClientRect();
    let nearest = null;
    let nearestDistance = Infinity;
    for (const node of nodes) {
      const dx = clientX - (rect.left + node.x * rect.width);
      const dy = clientY - (rect.top + node.y * rect.height);
      const distance = Math.hypot(dx, dy);
      if (distance < nearestDistance) {
        nearest = node;
        nearestDistance = distance;
      }
    }
    return nearestDistance <= 58 ? nearest : null;
  }

  function handlePointerUp(event) {
    if (!state.drag || event.pointerId !== state.drag.pointerId) return;
    const distance = Math.hypot(event.clientX - state.drag.x, event.clientY - state.drag.y);
    if (distance > 14) {
      const target = nearestNodeFromClient(event.clientX, event.clientY);
      if (target && target.id !== state.drag.id) {
        state.suppressClick = true;
        toggleBraceBetween(state.drag.id, target.id);
        window.setTimeout(() => {
          state.suppressClick = false;
        }, 0);
      }
    }
    state.drag = null;
  }

  function renderContractStrip() {
    elements.contractStrip.replaceChildren();
    contracts.forEach((contract, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "contract-dot";
      button.textContent = String(index + 1).padStart(2, "0");
      button.disabled = index > save.unlocked;
      button.classList.toggle("current", index === state.contractIndex);
      button.classList.toggle("cleared", save.cleared.includes(index));
      button.setAttribute(
        "aria-label",
        `Contract ${index + 1}: ${contract.name}${save.cleared.includes(index) ? ", cleared" : ""}`
      );
      if (index === state.contractIndex) button.setAttribute("aria-current", "step");
      button.addEventListener("click", () => resetContract(index));
      elements.contractStrip.append(button);
    });
  }

  function updateUi() {
    const contract = currentContract();
    const analysis = analyze();
    elements.contractNumber.textContent = `CONTRACT ${String(state.contractIndex + 1).padStart(2, "0")} / ${String(contracts.length).padStart(2, "0")}`;
    elements.contractName.textContent = contract.name;
    elements.contractBrief.textContent = contract.brief;
    elements.instruction.innerHTML = contract.field;
    elements.load.textContent = `${contract.weight} t`;
    elements.wind.textContent = windLabel(contract.wind);
    elements.budget.textContent = `${state.braces.length} / ${contract.budget}`;
    elements.peak.textContent = `${analysis.percent}%`;
    elements.peak.style.color = analysis.safe ? "var(--safe)" : "var(--fail)";
    elements.risk.textContent = analysis.safe ? "CLEARS LIMIT" : "FAILS AT MIDSPAN";
    elements.risk.style.color = analysis.safe ? "var(--safe)" : "var(--fail)";
    elements.needle.style.left = `${Math.max(0, Math.min(100, (analysis.peak / 1.5) * 100))}%`;
    elements.weakest.textContent = `${analysis.weakest} · ${analysis.percent}%`;
    elements.contractStatus.textContent =
      state.mode === "BUILD" ? "LIVE" :
      state.mode === "TRIAL" ? "TESTING" :
      state.mode === "SUCCESS" ? "CLEARED" : "FAILED";
    elements.contractStatus.style.color =
      state.mode === "FAILURE" ? "var(--fail)" :
      state.mode === "SUCCESS" ? "var(--safe)" : "";

    dispatchButton.disabled = state.mode !== "BUILD";
    dispatchButton.querySelector("span").textContent =
      state.mode === "TRIAL" ? "TRUCK IN TRANSIT" :
      state.mode === "SUCCESS" ? "LOAD TEST PASSED" :
      state.mode === "FAILURE" ? "MEMBER FAILED" : "DISPATCH TRUCK";

    if (save.couplers) {
      workshopButton.disabled = true;
      workshopState.textContent = "FITTED · -4% PEAK";
      workshopButton.querySelector("span").textContent = "PRECISION COUPLERS";
    } else {
      workshopButton.disabled = save.bolts < 3;
      workshopState.textContent = `${save.bolts} / 3 BOLTS`;
      workshopButton.querySelector("span").textContent = save.bolts >= 3 ? "FIT PRECISION COUPLERS" : "PRECISION COUPLERS";
    }
    soundButton.setAttribute("aria-pressed", String(save.muted));
    soundState.textContent = save.muted ? "OFF" : "ON";
    soundState.style.color = save.muted ? "var(--fail)" : "var(--safe)";
    updateNodeButtons();
    renderContractStrip();
  }

  function resizeCanvas(entry) {
    const width = Math.max(1, stage.clientWidth);
    const height = Math.max(1, stage.clientHeight);
    let pixelWidth;
    let pixelHeight;
    const box = entry?.devicePixelContentBoxSize?.[0];
    if (box) {
      pixelWidth = Math.max(1, Math.round(box.inlineSize));
      pixelHeight = Math.max(1, Math.round(box.blockSize));
    } else {
      const ratio = Math.min(2.5, window.devicePixelRatio || 1);
      pixelWidth = Math.max(1, Math.round(width * ratio));
      pixelHeight = Math.max(1, Math.round(height * ratio));
    }
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    state.viewWidth = width;
    state.viewHeight = height;
    state.dpr = pixelWidth / width;
    positionNodeButtons();
    render();
  }

  function positionNodeButtons() {
    nodeLayer.querySelectorAll(".joint-button").forEach((button) => {
      const node = getNode(Number(button.dataset.node));
      button.style.left = `${node.x * state.viewWidth}px`;
      button.style.top = `${node.y * state.viewHeight}px`;
    });
  }

  function stressColor(ratio) {
    if (ratio < 0.75) return "#15977e";
    if (ratio < 1) return "#eca333";
    return "#e94f3e";
  }

  function trialWave() {
    if (state.mode === "BUILD") return 1;
    if (state.mode === "SUCCESS") return 0.56;
    if (state.mode === "FAILURE") return 1;
    return 0.28 + 0.72 * Math.sin(Math.min(1, state.truckProgress) * Math.PI);
  }

  function memberRatio(member, index) {
    const analysis = analyze();
    const contract = currentContract();
    if (member.id === contract.critical) {
      return Math.max(0.26, analysis.peak * trialWave());
    }
    const texture = ((index * 19 + state.contractIndex * 7) % 21) / 100;
    const load = 0.42 + contract.weight * 0.008 + Math.abs(contract.wind) * 0.12 + texture;
    const braceRelief = analysis.correct * 0.045;
    return Math.max(0.26, (load - braceRelief) * (0.7 + trialWave() * 0.3));
  }

  function pointFor(node) {
    return { x: node.x * state.viewWidth, y: node.y * state.viewHeight };
  }

  function drawBackground() {
    const width = state.viewWidth;
    const height = state.viewHeight;
    const horizon = height * 0.63;
    const sky = ctx.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, "#dbe5dd");
    sky.addColorStop(1, "#9fb7ae");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = "rgba(255, 251, 233, 0.34)";
    ctx.beginPath();
    ctx.arc(width * 0.79, height * 0.20, Math.min(width, height) * 0.12, 0, TAU);
    ctx.fill();

    ctx.fillStyle = "#647a72";
    ctx.beginPath();
    ctx.moveTo(0, horizon + height * 0.02);
    for (let i = 0; i <= 12; i += 1) {
      const x = (i / 12) * width;
      const y = horizon - (0.025 + ((i * 7) % 4) * 0.012) * height;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(width, height);
    ctx.lineTo(0, height);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#36524e";
    ctx.fillRect(0, horizon + height * 0.06, width, height);

    const water = ctx.createLinearGradient(0, horizon, 0, height);
    water.addColorStop(0, "#557d80");
    water.addColorStop(1, "#264c54");
    ctx.fillStyle = water;
    ctx.fillRect(0, horizon + height * 0.14, width, height);

    ctx.strokeStyle = "rgba(222, 239, 231, 0.18)";
    ctx.lineWidth = 1;
    const grid = Math.max(22, Math.min(width, height) * 0.07);
    for (let x = 0; x <= width; x += grid) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y <= height; y += grid) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    ctx.strokeStyle = "rgba(220, 240, 234, 0.25)";
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 5; i += 1) {
      const offset = ((state.visualTime * 11 + i * 97) % (width + 80)) - 40;
      ctx.beginPath();
      ctx.moveTo(offset - 70, height * (0.82 + i * 0.022));
      ctx.lineTo(offset + 70, height * (0.82 + i * 0.022));
      ctx.stroke();
    }
  }

  function drawGroundAnchors() {
    for (const id of [4, 5]) {
      const point = pointFor(getNode(id));
      ctx.fillStyle = "#24302e";
      ctx.beginPath();
      ctx.moveTo(point.x - 42, point.y + 15);
      ctx.lineTo(point.x + 42, point.y + 15);
      ctx.lineTo(point.x + 62, point.y + 48);
      ctx.lineTo(point.x - 62, point.y + 48);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = "rgba(247, 242, 229, 0.32)";
      ctx.lineWidth = 2;
      for (let offset = -34; offset <= 34; offset += 14) {
        ctx.beginPath();
        ctx.moveTo(point.x + offset, point.y + 20);
        ctx.lineTo(point.x + offset - 14, point.y + 41);
        ctx.stroke();
      }
    }
  }

  function drawMember(member, ratio, isBrace = false, key = null) {
    const a = pointFor(getNode(member.a));
    const b = pointFor(getNode(member.b));
    const failed = state.failureMember === member.id;
    const color = stressColor(ratio);
    const width = isBrace ? 8 : 10;

    if (failed) {
      const midX = (a.x + b.x) * 0.5;
      const midY = (a.y + b.y) * 0.5;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const length = Math.max(1, Math.hypot(dx, dy));
      const nx = -dy / length;
      const ny = dx / length;
      const gap = 9;
      drawMemberSegment(a.x, a.y, midX - (dx / length) * gap + nx * 7, midY - (dy / length) * gap + ny * 7, color, width);
      drawMemberSegment(midX + (dx / length) * gap - nx * 7, midY + (dy / length) * gap - ny * 7, b.x, b.y, color, width);
      return;
    }

    ctx.strokeStyle = "rgba(12, 21, 20, 0.35)";
    ctx.lineWidth = width + 5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();

    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();

    ctx.strokeStyle = "rgba(255, 255, 255, 0.28)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y - 1);
    ctx.lineTo(b.x, b.y - 1);
    ctx.stroke();

    if (isBrace) {
      const correct = currentContract().required.includes(key);
      ctx.save();
      ctx.fillStyle = correct ? "#eef7e8" : "#fff3d8";
      ctx.font = "800 10px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(member.id, (a.x + b.x) * 0.5, (a.y + b.y) * 0.5 - 11);
      ctx.restore();
    }
  }

  function drawMemberSegment(ax, ay, bx, by, color, width) {
    ctx.strokeStyle = "rgba(12, 21, 20, 0.35)";
    ctx.lineWidth = width + 5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
  }

  function drawLoadFlow() {
    if (state.braces.length === 0) return;
    const pulse = (state.visualTime * 0.36) % 1;
    for (const key of state.braces) {
      const brace = candidates[key];
      const a = pointFor(getNode(brace.a));
      const b = pointFor(getNode(brace.b));
      const correct = currentContract().required.includes(key);
      for (let i = 0; i < 4; i += 1) {
        const t = (pulse + i * 0.25) % 1;
        const x = a.x + (b.x - a.x) * t;
        const y = a.y + (b.y - a.y) * t;
        ctx.fillStyle = correct ? "rgba(238, 255, 231, 0.92)" : "rgba(255, 224, 162, 0.86)";
        ctx.beginPath();
        ctx.arc(x, y, 2.5 + Math.sin((t + state.visualTime) * TAU) * 0.5, 0, TAU);
        ctx.fill();
      }
    }
  }

  function interpolateDeck(progress) {
    const route = [4, 1, 2, 3, 5].map((id) => pointFor(getNode(id)));
    const segmentProgress = Math.max(0, Math.min(0.9999, progress)) * (route.length - 1);
    const index = Math.floor(segmentProgress);
    const local = segmentProgress - index;
    const a = route[index];
    const b = route[Math.min(route.length - 1, index + 1)];
    return {
      x: a.x + (b.x - a.x) * local,
      y: a.y + (b.y - a.y) * local
    };
  }

  function drawTruck() {
    const progress = state.mode === "BUILD" ? 0.01 : Math.min(1, state.truckProgress);
    const point = interpolateDeck(progress);
    const scale = Math.max(0.72, Math.min(1.12, state.viewWidth / 760));
    ctx.save();
    ctx.translate(point.x, point.y - 21 * scale);
    if (state.mode === "FAILURE") ctx.rotate(-0.09);
    ctx.fillStyle = "#17201f";
    ctx.fillRect(-27 * scale, -14 * scale, 38 * scale, 22 * scale);
    ctx.fillStyle = "#f0a832";
    ctx.fillRect(11 * scale, -9 * scale, 18 * scale, 17 * scale);
    ctx.fillStyle = "#bfe2dc";
    ctx.fillRect(15 * scale, -6 * scale, 9 * scale, 7 * scale);
    ctx.fillStyle = "#0f1615";
    for (const x of [-17, 19]) {
      ctx.beginPath();
      ctx.arc(x * scale, 10 * scale, 6 * scale, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "#d8d0bc";
      ctx.beginPath();
      ctx.arc(x * scale, 10 * scale, 2.3 * scale, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "#0f1615";
    }
    ctx.restore();
  }

  function drawWind() {
    const wind = currentContract().wind;
    if (Math.abs(wind) < 0.05) return;
    const direction = wind > 0 ? 1 : -1;
    const yBase = state.viewHeight * 0.23;
    ctx.save();
    ctx.strokeStyle = "rgba(30, 76, 99, 0.56)";
    ctx.fillStyle = "rgba(30, 76, 99, 0.72)";
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i += 1) {
      const length = 35 + Math.abs(wind) * 80;
      const x = state.viewWidth * (0.42 + i * 0.11) + Math.sin(state.visualTime * 1.7 + i) * 7;
      const y = yBase + i * 13;
      ctx.beginPath();
      ctx.moveTo(x - direction * length * 0.5, y);
      ctx.lineTo(x + direction * length * 0.5, y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + direction * length * 0.5, y);
      ctx.lineTo(x + direction * (length * 0.5 - 8), y - 5);
      ctx.lineTo(x + direction * (length * 0.5 - 8), y + 5);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function drawLabels() {
    const analysis = analyze();
    const member = baseMembers.find((item) => item.id === analysis.weakest);
    if (!member) return;
    const a = pointFor(getNode(member.a));
    const b = pointFor(getNode(member.b));
    const x = (a.x + b.x) * 0.5;
    const y = (a.y + b.y) * 0.5;
    const label = `${analysis.weakest}  ${analysis.percent}%`;
    ctx.save();
    ctx.font = "800 11px Arial";
    const width = ctx.measureText(label).width + 16;
    ctx.fillStyle = "rgba(247, 242, 229, 0.93)";
    ctx.fillRect(x - width / 2, y - 35, width, 21);
    ctx.fillStyle = analysis.safe ? "#0c7865" : "#c93d31";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, x, y - 24);
    ctx.restore();
  }

  function drawParticles() {
    for (const particle of state.particles) {
      ctx.fillStyle = `rgba(236, 163, 51, ${Math.max(0, particle.life)})`;
      ctx.fillRect(particle.x, particle.y, particle.size, particle.size);
    }
  }

  function render() {
    if (!state.viewWidth || !state.viewHeight) return;
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    ctx.clearRect(0, 0, state.viewWidth, state.viewHeight);
    drawBackground();
    drawWind();
    drawGroundAnchors();
    baseMembers.forEach((member, index) => drawMember(member, memberRatio(member, index)));
    state.braces.forEach((key, index) => {
      const member = candidates[key];
      const ratio = currentContract().required.includes(key)
        ? 0.54 + Math.abs(currentContract().wind) * 0.22
        : 0.88 + index * 0.03;
      drawMember(member, ratio, true, key);
    });
    drawLoadFlow();
    drawLabels();
    drawTruck();
    drawParticles();
  }

  function update(dt) {
    state.time += dt;
    state.visualTime += dt;
    if (state.mode === "TRIAL") {
      state.truckProgress += state.truckSpeed * dt;
      const analysis = analyze();
      if (!analysis.safe && state.truckProgress >= 0.52) {
        failContract();
      } else if (analysis.safe && state.truckProgress >= 1) {
        state.truckProgress = 1;
        completeContract();
      }
    }

    for (const particle of state.particles) {
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += 70 * dt;
      particle.life -= dt;
    }
    if (state.particles.some((particle) => particle.life <= 0)) {
      state.particles = state.particles.filter((particle) => particle.life > 0);
    }
  }

  function frame(now) {
    const dt = Math.min(0.1, Math.max(0, (now - state.lastFrame) / 1000));
    state.lastFrame = now;
    if (!document.hidden) update(dt);
    render();
    requestAnimationFrame(frame);
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  }

  function renderGameToText() {
    const contract = currentContract();
    const analysis = analyze();
    return JSON.stringify({
      coordinateSystem: "Canvas origin top-left; x increases right, y increases down. Joint coordinates are normalized 0..1.",
      mode: state.mode,
      contract: {
        index: state.contractIndex + 1,
        total: contracts.length,
        name: contract.name,
        loadTonnes: contract.weight,
        wind: contract.wind,
        unlocked: save.unlocked + 1,
        clearedCount: save.cleared.length
      },
      construction: {
        selectedNode: state.selectedNode,
        braces: [...state.braces],
        braceCount: state.braces.length,
        budget: contract.budget,
        placements: state.placements,
        approvedPairs: Object.fromEntries(
          Object.entries(candidates).map(([key, candidate]) => [key, [candidate.a, candidate.b]])
        )
      },
      analysis: {
        predictedPeakPercent: analysis.percent,
        safeToDispatch: analysis.safe,
        weakestMember: analysis.weakest,
        missingLoadPaths: analysis.missing,
        memberLimitPercent: 100
      },
      trial: {
        truckProgress: Number(state.truckProgress.toFixed(3)),
        dispatches: state.dispatches,
        failureMember: state.failureMember,
        failurePeakPercent: Math.round(state.failurePeak * 100)
      },
      workshop: {
        bolts: save.bolts,
        precisionCouplers: save.couplers
      },
      progress: {
        completedThisRun: state.completedThisRun
      }
    });
  }

  window.render_game_to_text = renderGameToText;
  window.advanceTime = (milliseconds) => {
    const total = Math.max(0, Math.min(600000, Number(milliseconds) || 0));
    const steps = Math.max(1, Math.ceil(total / (1000 / 60)));
    const dt = total / steps / 1000;
    for (let i = 0; i < steps; i += 1) update(dt);
    render();
  };

  dispatchButton.addEventListener("click", dispatch);
  retryButton.addEventListener("click", () => resetContract());
  nextButton.addEventListener("click", nextContract);
  workshopButton.addEventListener("click", fitCouplers);
  soundButton.addEventListener("click", () => {
    ensureAudio();
    save.muted = !save.muted;
    writeSave();
    updateUi();
    announce(`Sound ${save.muted ? "off" : "on"}.`);
  });

  window.addEventListener("pointerup", handlePointerUp);
  window.addEventListener("pointercancel", () => {
    state.drag = null;
  });
  window.addEventListener("keydown", (event) => {
    if (event.key.toLowerCase() === "f") {
      event.preventDefault();
      toggleFullscreen();
      return;
    }
    if (event.code === "Space" && state.mode === "BUILD") {
      const jointHasFocus = document.activeElement?.classList.contains("joint-button") === true;
      const completedGesture = state.selectedNode === null && state.braces.length > 0;
      if (!jointHasFocus || completedGesture) {
        event.preventDefault();
        dispatch();
      }
    }
  });
  window.addEventListener("contextmenu", (event) => event.preventDefault());
  document.addEventListener("visibilitychange", () => {
    state.lastFrame = performance.now();
  });
  document.addEventListener("fullscreenchange", () => resizeCanvas());

  buildNodeButtons();
  updateUi();

  if ("ResizeObserver" in window) {
    const observer = new ResizeObserver((entries) => resizeCanvas(entries[0]));
    try {
      observer.observe(stage, { box: "device-pixel-content-box" });
    } catch {
      observer.observe(stage);
    }
  } else {
    window.addEventListener("resize", () => resizeCanvas());
  }
  resizeCanvas();
  requestAnimationFrame(frame);
})();
