(() => {
  "use strict";

  const LEVELS = [
    {
      code: "INCIDENT 01",
      name: "Split the load",
      brief: "Restore the hospital and homes. The old feeder can carry one district, not both.",
      hint: "Select the relay, then the hospital. Give the homes a direct line.",
      target: 2,
      cables: 2,
      nodes: [
        { id: "g1", type: "generator", label: "NORTH GEN", x: 0.16, y: 0.62, supply: 8 },
        { id: "s1", type: "substation", label: "OLD RELAY", x: 0.48, y: 0.58 },
        { id: "hospital", type: "district", label: "HOSPITAL", x: 0.79, y: 0.43, demand: 3, critical: true },
        { id: "homes", type: "district", label: "RIVER HOMES", x: 0.81, y: 0.76, demand: 4 }
      ],
      existing: [{ a: "g1", b: "s1", cap: 5 }],
      allowed: [
        { a: "s1", b: "hospital", cap: 4 },
        { a: "s1", b: "homes", cap: 4 },
        { a: "g1", b: "homes", cap: 4 }
      ]
    },
    {
      code: "INCIDENT 02",
      name: "Morning rail",
      brief: "The metro and clinic both need power before commuters arrive. Keep their routes separate.",
      hint: "Use the east spur for the metro. The clinic belongs on the central relay.",
      target: 2,
      cables: 2,
      nodes: [
        { id: "g2", type: "generator", label: "TURBINE 4", x: 0.15, y: 0.58, supply: 10 },
        { id: "s2", type: "substation", label: "CENTRAL", x: 0.47, y: 0.55 },
        { id: "clinic2", type: "district", label: "CLINIC", x: 0.78, y: 0.39, demand: 4, critical: true },
        { id: "metro2", type: "district", label: "METRO", x: 0.81, y: 0.74, demand: 4 }
      ],
      existing: [{ a: "g2", b: "s2", cap: 6 }],
      allowed: [
        { a: "s2", b: "clinic2", cap: 4 },
        { a: "s2", b: "metro2", cap: 4 },
        { a: "g2", b: "metro2", cap: 5 }
      ]
    },
    {
      code: "INCIDENT 03",
      name: "Bank the reserve",
      brief: "Generation is short. Bring the hill battery online and share its stored charge.",
      hint: "Both sources must reach the relay before you feed water and tram districts.",
      target: 2,
      cables: 3,
      nodes: [
        { id: "g3", type: "generator", label: "EAST GEN", x: 0.13, y: 0.46, supply: 4 },
        { id: "b3", type: "battery", label: "HILL BAT", x: 0.15, y: 0.78, supply: 4 },
        { id: "s3", type: "substation", label: "MARKET BUS", x: 0.47, y: 0.59 },
        { id: "water3", type: "district", label: "WATER", x: 0.79, y: 0.42, demand: 4, critical: true },
        { id: "tram3", type: "district", label: "TRAM", x: 0.81, y: 0.75, demand: 4 }
      ],
      existing: [{ a: "g3", b: "s3", cap: 4 }],
      allowed: [
        { a: "b3", b: "s3", cap: 5 },
        { a: "s3", b: "water3", cap: 4 },
        { a: "s3", b: "tram3", cap: 4 }
      ]
    },
    {
      code: "INCIDENT 04",
      name: "Triage protocol",
      brief: "Supply is capped. Restore both critical services; decorative tower lights may stay dark.",
      hint: "Critical orange nodes count first. Do not spend a crew on the tower.",
      target: 2,
      cables: 2,
      nodes: [
        { id: "g4", type: "generator", label: "DOCK GEN", x: 0.14, y: 0.61, supply: 8 },
        { id: "s4", type: "substation", label: "DOCK BUS", x: 0.43, y: 0.6 },
        { id: "fire4", type: "district", label: "FIRE CTRL", x: 0.74, y: 0.35, demand: 4, critical: true },
        { id: "pumps4", type: "district", label: "FLOOD PUMPS", x: 0.8, y: 0.61, demand: 4, critical: true },
        { id: "tower4", type: "district", label: "SKY TOWER", x: 0.72, y: 0.82, demand: 3 }
      ],
      existing: [{ a: "g4", b: "s4", cap: 8 }],
      allowed: [
        { a: "s4", b: "fire4", cap: 4 },
        { a: "s4", b: "pumps4", cap: 4 },
        { a: "s4", b: "tower4", cap: 3 }
      ]
    },
    {
      code: "INCIDENT 05",
      name: "Storm bypass",
      brief: "Lightning will sever the marked river feeder when you run the grid. Build around it.",
      hint: "The storm line is red-dashed. Route the hospital through the battery bypass.",
      target: 1,
      cables: 2,
      faultEdge: ["g5", "s5"],
      nodes: [
        { id: "g5", type: "generator", label: "WEST GEN", x: 0.12, y: 0.55, supply: 8 },
        { id: "s5", type: "substation", label: "RIVER BUS", x: 0.46, y: 0.48 },
        { id: "b5", type: "battery", label: "STORM BAT", x: 0.42, y: 0.78, supply: 5 },
        { id: "hospital5", type: "district", label: "TRAUMA", x: 0.8, y: 0.58, demand: 5, critical: true }
      ],
      existing: [{ a: "g5", b: "s5", cap: 7 }],
      allowed: [
        { a: "b5", b: "s5", cap: 5 },
        { a: "s5", b: "hospital5", cap: 5 }
      ]
    },
    {
      code: "INCIDENT 06",
      name: "Close the loop",
      brief: "A maintenance crew left the workshop tie-switch open. Close it before restoring the data centre.",
      hint: "Tap the TIE switch to close it, then connect the data centre.",
      target: 2,
      cables: 1,
      nodes: [
        { id: "g6", type: "generator", label: "SOUTH GEN", x: 0.12, y: 0.56, supply: 10 },
        { id: "s6", type: "substation", label: "SOUTH BUS", x: 0.37, y: 0.52 },
        { id: "tie6", type: "switch", label: "TIE SW", x: 0.57, y: 0.7, closed: false },
        { id: "data6", type: "district", label: "DATA CORE", x: 0.82, y: 0.4, demand: 5, critical: true },
        { id: "works6", type: "district", label: "WORKS", x: 0.82, y: 0.75, demand: 4 }
      ],
      existing: [
        { a: "g6", b: "s6", cap: 9 },
        { a: "s6", b: "tie6", cap: 4 },
        { a: "tie6", b: "works6", cap: 4 }
      ],
      allowed: [{ a: "s6", b: "data6", cap: 5 }]
    },
    {
      code: "INCIDENT 07",
      name: "Two islands",
      brief: "Synchronise two generators without pushing either intertie beyond its limit.",
      hint: "Keep one district on each island; use the battery for the harbour.",
      target: 3,
      cables: 4,
      nodes: [
        { id: "g7a", type: "generator", label: "NORTH GEN", x: 0.1, y: 0.38, supply: 6 },
        { id: "g7b", type: "generator", label: "SOUTH GEN", x: 0.11, y: 0.78, supply: 6 },
        { id: "b7", type: "battery", label: "PORT BAT", x: 0.42, y: 0.82, supply: 3 },
        { id: "school7", type: "district", label: "SCHOOL", x: 0.78, y: 0.32, demand: 5, critical: true },
        { id: "foundry7", type: "district", label: "FOUNDRY", x: 0.79, y: 0.59, demand: 5 },
        { id: "port7", type: "district", label: "HARBOUR", x: 0.76, y: 0.82, demand: 3 }
      ],
      existing: [],
      allowed: [
        { a: "g7a", b: "school7", cap: 5 },
        { a: "g7b", b: "foundry7", cap: 5 },
        { a: "b7", b: "port7", cap: 3 },
        { a: "g7a", b: "foundry7", cap: 4 },
        { a: "g7b", b: "school7", cap: 4 }
      ]
    },
    {
      code: "INCIDENT 08",
      name: "Black start",
      brief: "Rebuild the city backbone. Protect emergency control, then bring every district online.",
      hint: "Use both sources and split the three loads across the twin buses.",
      target: 3,
      cables: 5,
      nodes: [
        { id: "g8", type: "generator", label: "BLACKSTART", x: 0.1, y: 0.48, supply: 10 },
        { id: "b8", type: "battery", label: "CITY RESERVE", x: 0.12, y: 0.8, supply: 6 },
        { id: "s8a", type: "substation", label: "NORTH BUS", x: 0.4, y: 0.42 },
        { id: "s8b", type: "substation", label: "SOUTH BUS", x: 0.42, y: 0.74 },
        { id: "control8", type: "district", label: "GRID CTRL", x: 0.76, y: 0.29, demand: 4, critical: true },
        { id: "city8", type: "district", label: "OLD CITY", x: 0.82, y: 0.58, demand: 6 },
        { id: "port8", type: "district", label: "PORT", x: 0.75, y: 0.83, demand: 5 }
      ],
      existing: [],
      allowed: [
        { a: "g8", b: "s8a", cap: 10 },
        { a: "b8", b: "s8b", cap: 6 },
        { a: "s8a", b: "control8", cap: 4 },
        { a: "s8a", b: "city8", cap: 6 },
        { a: "s8b", b: "port8", cap: 5 },
        { a: "s8b", b: "city8", cap: 5 }
      ]
    }
  ];

  const SAVE_KEY = "blackout-architect-save-v1";
  const SAVE_VERSION = 1;
  const canvas = document.querySelector("#game-canvas");
  const ctx = canvas.getContext("2d", { alpha: false });
  const shell = document.querySelector("#game-shell");
  const nodeLayer = document.querySelector("#node-layer");
  const elements = {
    stage: document.querySelector("#stage-value"),
    ops: document.querySelector("#ops-value"),
    missionCode: document.querySelector("#mission-code"),
    missionTitle: document.querySelector("#mission-title"),
    missionBrief: document.querySelector("#mission-brief"),
    supplyRule: document.querySelector("#supply-rule"),
    targetRule: document.querySelector("#target-rule"),
    budgetRule: document.querySelector("#budget-rule"),
    cableCount: document.querySelector("#cable-count"),
    cableMeter: document.querySelector("#cable-meter"),
    liveStatus: document.querySelector("#live-status"),
    run: document.querySelector("#run-btn"),
    undo: document.querySelector("#undo-btn"),
    sound: document.querySelector("#sound-btn"),
    panel: document.querySelector("#result-panel"),
    resultKicker: document.querySelector("#result-kicker"),
    resultTitle: document.querySelector("#result-title"),
    resultCopy: document.querySelector("#result-copy"),
    impact: document.querySelector("#impact-report"),
    retry: document.querySelector("#retry-btn"),
    next: document.querySelector("#next-btn"),
    upgradePanel: document.querySelector("#upgrade-panel")
  };

  const state = {
    current: 0,
    mode: "playing",
    selected: null,
    added: [],
    switches: {},
    result: null,
    status: "",
    actionCount: 0,
    runCount: 0,
    simTime: 0,
    width: 1,
    height: 1,
    dprX: 1,
    dprY: 1,
    muted: false,
    dragStart: null,
    suppressClickUntil: 0,
    lastFrame: performance.now()
  };

  let audioContext = null;
  let save = loadSave();

  function loadSave() {
    const fallback = {
      version: SAVE_VERSION,
      unlocked: 1,
      ops: 0,
      rewarded: [],
      upgrades: { harden: 0, crew: 0, storage: 0 }
    };
    try {
      const parsed = JSON.parse(localStorage.getItem(SAVE_KEY) || "null");
      if (!parsed || parsed.version !== SAVE_VERSION) return fallback;
      return {
        ...fallback,
        ...parsed,
        upgrades: { ...fallback.upgrades, ...(parsed.upgrades || {}) },
        rewarded: Array.isArray(parsed.rewarded) ? parsed.rewarded : []
      };
    } catch (_) {
      return fallback;
    }
  }

  function persistSave() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(save));
    } catch (_) {
      state.status = "Progress is session-only in this browser.";
    }
  }

  function ensureAudio() {
    if (state.muted) return;
    if (!audioContext) {
      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtor) return;
      audioContext = new AudioCtor();
    }
    if (audioContext.state === "suspended") audioContext.resume();
  }

  function tone(frequency, duration = 0.08, type = "sine", volume = 0.035) {
    if (state.muted || !audioContext) return;
    const now = audioContext.currentTime;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.015);
  }

  function playCableSound() {
    const variants = [318, 335, 356, 392, 426];
    tone(variants[state.actionCount % variants.length], 0.09, "triangle", 0.035);
  }

  function playResultSound(success) {
    if (success) {
      tone(420, 0.12, "sine", 0.045);
      window.setTimeout(() => tone(630, 0.16, "sine", 0.04), 95);
    } else {
      tone(118, 0.2, "sawtooth", 0.05);
      window.setTimeout(() => tone(84, 0.24, "square", 0.035), 105);
    }
  }

  function currentLevel() {
    return LEVELS[state.current];
  }

  function edgeKey(a, b) {
    return [a, b].sort().join("::");
  }

  function nodeById(id) {
    return currentLevel().nodes.find((node) => node.id === id);
  }

  function effectiveCableBudget() {
    return currentLevel().cables + save.upgrades.crew;
  }

  function effectiveCapacity(edge) {
    return edge.cap + save.upgrades.harden;
  }

  function effectiveSupply(node) {
    return (node.supply || 0) + (node.type === "battery" ? save.upgrades.storage * 2 : 0);
  }

  function allEdges() {
    return [...currentLevel().existing, ...state.added];
  }

  function activeEdges(forRun = false) {
    const level = currentLevel();
    const faultKey = forRun && level.faultEdge ? edgeKey(level.faultEdge[0], level.faultEdge[1]) : null;
    return allEdges().filter((edge) => {
      if (edgeKey(edge.a, edge.b) === faultKey) return false;
      const nodeA = nodeById(edge.a);
      const nodeB = nodeById(edge.b);
      if (nodeA?.type === "switch" && state.switches[nodeA.id] === false) return false;
      if (nodeB?.type === "switch" && state.switches[nodeB.id] === false) return false;
      return true;
    });
  }

  function totalSupply() {
    return currentLevel().nodes.reduce((sum, node) => sum + effectiveSupply(node), 0);
  }

  function lineName(key) {
    const [a, b] = key.split("::");
    return `${nodeById(a)?.label || a} / ${nodeById(b)?.label || b}`;
  }

  function setStatus(message) {
    state.status = message;
    elements.liveStatus.textContent = message;
  }

  function createNodeButtons() {
    nodeLayer.replaceChildren();
    currentLevel().nodes.forEach((node) => {
      const button = document.createElement("button");
      button.type = "button";
      button.id = `node-${node.id}`;
      button.className = "grid-node";
      button.dataset.nodeId = node.id;
      button.dataset.type = node.type;
      button.dataset.critical = String(Boolean(node.critical));
      button.style.left = `${node.x * 100}%`;
      button.style.top = `${node.y * 100}%`;
      button.setAttribute("aria-describedby", "screen-reader-rules");
      button.innerHTML = `
        <span class="node-code">${node.type === "district" ? (node.critical ? "CRITICAL" : "LOAD") : node.type.toUpperCase()}</span>
        <strong>${node.label}</strong>
        <small>${node.supply ? `${effectiveSupply(node)} MW OUT` : node.demand ? `${node.demand} MW NEED` : node.type === "switch" ? "CLOSED" : "RELAY"}</small>
      `;
      button.setAttribute("aria-label", nodeAriaLabel(node));
      button.addEventListener("click", () => {
        if (performance.now() < state.suppressClickUntil) return;
        ensureAudio();
        activateNode(node.id);
      });
      button.addEventListener("pointerdown", (event) => {
        if (state.mode !== "playing") return;
        state.dragStart = { id: node.id, x: event.clientX, y: event.clientY };
      });
      button.addEventListener("pointerup", (event) => {
        if (!state.dragStart || state.mode !== "playing") return;
        const distance = Math.hypot(event.clientX - state.dragStart.x, event.clientY - state.dragStart.y);
        const targetButton = document.elementFromPoint(event.clientX, event.clientY)?.closest(".grid-node");
        if (distance > 12 && targetButton && targetButton.dataset.nodeId !== state.dragStart.id) {
          ensureAudio();
          connectNodes(state.dragStart.id, targetButton.dataset.nodeId);
          state.suppressClickUntil = performance.now() + 350;
        }
        state.dragStart = null;
      });
      nodeLayer.append(button);
    });
  }

  function nodeAriaLabel(node) {
    if (node.type === "generator") return `${node.label}, generator, ${effectiveSupply(node)} megawatts available`;
    if (node.type === "battery") return `${node.label}, battery reserve, ${effectiveSupply(node)} megawatts available`;
    if (node.type === "district") return `${node.label}, ${node.critical ? "critical " : ""}district, needs ${node.demand} megawatts`;
    if (node.type === "switch") return `${node.label}, tie switch, ${state.switches[node.id] === false ? "open" : "closed"}`;
    return `${node.label}, substation relay`;
  }

  function activateNode(id) {
    if (state.mode !== "playing") return;
    const node = nodeById(id);
    if (node.type === "switch") {
      state.switches[id] = !state.switches[id];
      state.actionCount += 1;
      setStatus(`${node.label} is now ${state.switches[id] ? "CLOSED" : "OPEN"}.`);
      tone(state.switches[id] ? 260 : 190, 0.08, "square", 0.03);
      updateHud();
      render();
      return;
    }
    if (!state.selected) {
      state.selected = id;
      state.actionCount += 1;
      setStatus(`${node.label} selected. Choose a connected node.`);
      tone(245, 0.05, "sine", 0.025);
    } else if (state.selected === id) {
      state.selected = null;
      setStatus("Selection cleared.");
    } else {
      connectNodes(state.selected, id);
    }
    updateHud();
    render();
  }

  function connectNodes(a, b) {
    const level = currentLevel();
    const key = edgeKey(a, b);
    const allowed = level.allowed.find((edge) => edgeKey(edge.a, edge.b) === key);
    const existing = allEdges().some((edge) => edgeKey(edge.a, edge.b) === key);
    state.selected = null;
    state.actionCount += 1;
    if (existing) {
      setStatus(`${lineName(key)} is already connected.`);
      tone(150, 0.06, "square", 0.02);
    } else if (!allowed) {
      setStatus("No surveyed cable route between those nodes.");
      tone(112, 0.1, "square", 0.025);
    } else if (state.added.length >= effectiveCableBudget()) {
      setStatus("All cable crews are committed. Undo a line to reroute.");
      tone(112, 0.1, "square", 0.025);
    } else {
      state.added.push({ ...allowed });
      setStatus(`Built ${lineName(key)}. Capacity ${effectiveCapacity(allowed)} MW.`);
      playCableSound();
    }
    updateHud();
    render();
  }

  function undoLine() {
    if (state.mode !== "playing" || state.added.length === 0) return;
    ensureAudio();
    const edge = state.added.pop();
    state.selected = null;
    state.actionCount += 1;
    setStatus(`Crew released from ${lineName(edgeKey(edge.a, edge.b))}.`);
    tone(175, 0.07, "triangle", 0.03);
    updateHud();
    render();
  }

  function solveGrid() {
    const level = currentLevel();
    const edges = activeEdges(true);
    const adjacency = new Map(level.nodes.map((node) => [node.id, []]));
    edges.forEach((edge) => {
      adjacency.get(edge.a)?.push({ node: edge.b, edge });
      adjacency.get(edge.b)?.push({ node: edge.a, edge });
    });
    adjacency.forEach((list) => list.sort((left, right) => left.node.localeCompare(right.node)));

    const remaining = {};
    level.nodes.forEach((node) => {
      if (node.type === "generator" || node.type === "battery") remaining[node.id] = effectiveSupply(node);
    });
    const flows = {};
    edges.forEach((edge) => { flows[edgeKey(edge.a, edge.b)] = 0; });
    const paths = {};
    const served = [];
    const unserved = [];
    const districts = level.nodes
      .filter((node) => node.type === "district")
      .sort((a, b) => Number(Boolean(b.critical)) - Number(Boolean(a.critical)) || a.id.localeCompare(b.id));

    districts.forEach((district) => {
      const queue = [{ id: district.id, path: [] }];
      const visited = new Set([district.id]);
      let solution = null;
      while (queue.length && !solution) {
        const entry = queue.shift();
        if (remaining[entry.id] >= district.demand) {
          solution = entry;
          break;
        }
        (adjacency.get(entry.id) || []).forEach((neighbor) => {
          if (visited.has(neighbor.node)) return;
          visited.add(neighbor.node);
          queue.push({ id: neighbor.node, path: [...entry.path, neighbor.edge] });
        });
      }
      if (!solution) {
        unserved.push(district.id);
        return;
      }
      remaining[solution.id] -= district.demand;
      paths[district.id] = solution.path.map((edge) => edgeKey(edge.a, edge.b));
      solution.path.forEach((edge) => {
        const key = edgeKey(edge.a, edge.b);
        flows[key] = (flows[key] || 0) + district.demand;
      });
      served.push(district.id);
    });

    const overloadKeys = edges
      .filter((edge) => (flows[edgeKey(edge.a, edge.b)] || 0) > effectiveCapacity(edge))
      .map((edge) => edgeKey(edge.a, edge.b));
    const firstOverload = overloadKeys[0] || "";
    const impacted = firstOverload
      ? served.filter((districtId) => (paths[districtId] || []).includes(firstOverload))
      : [];
    const criticalUnserved = districts.filter((district) => district.critical && !served.includes(district.id));
    const success = !firstOverload && criticalUnserved.length === 0 && served.length >= level.target;
    let failureReason = "";
    if (firstOverload) {
      const edge = edges.find((item) => edgeKey(item.a, item.b) === firstOverload);
      failureReason = `${lineName(firstOverload)} carried ${flows[firstOverload]} MW through a ${effectiveCapacity(edge)} MW line.`;
    } else if (level.faultEdge && !success) {
      failureReason = `${lineName(edgeKey(level.faultEdge[0], level.faultEdge[1]))} failed in the storm. No complete bypass remained.`;
    } else if (criticalUnserved.length) {
      failureReason = `${criticalUnserved[0].label} remained dark. Critical loads must be restored first.`;
    } else {
      failureReason = `Only ${served.length} of ${level.target} required districts received power.`;
    }

    return {
      success,
      flows,
      served,
      unserved,
      paths,
      firstOverload,
      overloadKeys,
      impacted,
      failureReason,
      faultKey: level.faultEdge ? edgeKey(level.faultEdge[0], level.faultEdge[1]) : ""
    };
  }

  function runGrid() {
    if (state.mode !== "playing") return;
    ensureAudio();
    state.selected = null;
    state.runCount += 1;
    state.actionCount += 1;
    state.result = solveGrid();
    if (state.result.success) {
      state.mode = "success";
      rewardLevel();
      showSuccess();
      setStatus(`Sector ${state.current + 1} stable. ${state.result.served.length} districts restored.`);
      playResultSound(true);
    } else {
      state.mode = "failure";
      showFailure();
      setStatus(state.result.failureReason);
      playResultSound(false);
    }
    updateHud();
    render();
  }

  function rewardLevel() {
    const levelNumber = state.current + 1;
    if (!save.rewarded.includes(levelNumber)) {
      save.rewarded.push(levelNumber);
      save.ops += 1;
    }
    save.unlocked = Math.max(save.unlocked, Math.min(LEVELS.length, levelNumber + 1));
    persistSave();
  }

  function showSuccess() {
    elements.panel.hidden = false;
    elements.panel.classList.remove("failure");
    elements.resultKicker.textContent = state.current === LEVELS.length - 1 ? "CITY ONLINE" : "GRID STABLE";
    elements.resultTitle.textContent = state.current === LEVELS.length - 1 ? "Black start complete" : "Lights restored";
    elements.resultCopy.textContent = `${state.result.served.length} districts are stable with no line above its rated capacity. ${save.ops > 0 ? "You earned an OPS credit." : "This sector was already credited."}`;
    elements.impact.hidden = true;
    elements.retry.hidden = true;
    elements.next.hidden = false;
    elements.next.textContent = state.current === LEVELS.length - 1 ? "REPLAY CAMPAIGN" : "NEXT SECTOR";
    elements.upgradePanel.hidden = save.ops < 1;
    updateUpgradeButtons();
    window.setTimeout(() => elements.next.focus({ preventScroll: true }), 80);
  }

  function showFailure() {
    const impactLabels = state.result.impacted.map((id) => nodeById(id)?.label || id);
    elements.panel.hidden = false;
    elements.panel.classList.add("failure");
    elements.resultKicker.textContent = state.result.firstOverload ? "CASCADE TRIP" : "RESTORE FAILED";
    elements.resultTitle.textContent = state.result.firstOverload ? "The feeder blew" : "The grid stayed dark";
    elements.resultCopy.textContent = state.result.failureReason;
    elements.impact.hidden = false;
    elements.impact.textContent = state.result.firstOverload
      ? `FIRST TRIP: ${lineName(state.result.firstOverload)}. Downstream impact: ${impactLabels.join(", ") || "no district load"}.`
      : `UNSERVED: ${state.result.unserved.map((id) => nodeById(id)?.label || id).join(", ") || "required load"}.`;
    elements.retry.hidden = false;
    elements.next.hidden = true;
    elements.upgradePanel.hidden = true;
    window.setTimeout(() => elements.retry.focus({ preventScroll: true }), 80);
  }

  function retryLevel() {
    ensureAudio();
    state.mode = "playing";
    state.selected = null;
    state.added = [];
    state.result = null;
    state.actionCount += 1;
    resetSwitches();
    elements.panel.hidden = true;
    setStatus(currentLevel().hint);
    tone(220, 0.08, "triangle", 0.03);
    updateHud();
    render();
    elements.run.focus({ preventScroll: true });
  }

  function nextLevel() {
    ensureAudio();
    state.current = state.current === LEVELS.length - 1 ? 0 : state.current + 1;
    loadLevel();
  }

  function buyUpgrade(kind) {
    if (state.mode !== "success" || save.ops < 1 || !Object.hasOwn(save.upgrades, kind)) return;
    ensureAudio();
    save.ops -= 1;
    save.upgrades[kind] += 1;
    persistSave();
    setStatus(`${kind.toUpperCase()} dispatch perk installed.`);
    tone(520, 0.13, "triangle", 0.04);
    createNodeButtons();
    updateUpgradeButtons();
    updateHud();
    render();
  }

  function updateUpgradeButtons() {
    document.querySelectorAll(".upgrade-btn").forEach((button) => {
      const kind = button.dataset.upgrade;
      button.disabled = save.ops < 1 || save.upgrades[kind] >= 2;
      const strong = button.querySelector("strong");
      strong.textContent = `${kind === "storage" ? "RESERVE" : kind.toUpperCase()} · ${save.upgrades[kind]}/2`;
    });
    elements.upgradePanel.hidden = state.mode !== "success" || save.ops < 1;
  }

  function resetSwitches() {
    state.switches = {};
    currentLevel().nodes.forEach((node) => {
      if (node.type === "switch") state.switches[node.id] = node.closed !== false;
    });
  }

  function loadLevel() {
    const level = currentLevel();
    state.mode = "playing";
    state.selected = null;
    state.added = [];
    state.result = null;
    state.status = level.hint;
    resetSwitches();
    elements.panel.hidden = true;
    elements.missionCode.textContent = level.code;
    elements.missionTitle.textContent = level.name;
    elements.missionBrief.textContent = level.brief;
    elements.supplyRule.textContent = `${totalSupply()} MW available`;
    elements.targetRule.textContent = `${level.target} district${level.target === 1 ? "" : "s"} required`;
    elements.budgetRule.textContent = `${effectiveCableBudget()} cable crew${effectiveCableBudget() === 1 ? "" : "s"}`;
    createNodeButtons();
    updateHud();
    render();
  }

  function updateHud() {
    const level = currentLevel();
    elements.stage.textContent = `${String(state.current + 1).padStart(2, "0")} / ${String(LEVELS.length).padStart(2, "0")}`;
    elements.ops.textContent = String(save.ops);
    elements.cableCount.textContent = `${state.added.length} / ${effectiveCableBudget()}`;
    elements.liveStatus.textContent = state.status;
    elements.undo.disabled = state.mode !== "playing" || state.added.length === 0;
    elements.run.disabled = state.mode !== "playing";
    elements.cableMeter.replaceChildren();
    for (let index = 0; index < effectiveCableBudget(); index += 1) {
      const pip = document.createElement("span");
      pip.className = `meter-pip${index < state.added.length ? " used" : ""}`;
      elements.cableMeter.append(pip);
    }
    document.querySelectorAll(".grid-node").forEach((button) => {
      const id = button.dataset.nodeId;
      const node = nodeById(id);
      button.classList.toggle("selected", state.selected === id);
      button.classList.toggle("powered", Boolean(state.result?.served.includes(id)));
      button.classList.toggle("switch-open", node?.type === "switch" && state.switches[id] === false);
      button.setAttribute("aria-pressed", String(state.selected === id || (node?.type === "switch" && state.switches[id])));
      button.setAttribute("aria-label", nodeAriaLabel(node));
      if (node?.type === "switch") button.querySelector("small").textContent = state.switches[id] ? "CLOSED" : "OPEN";
    });
  }

  function roundedRect(context, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    context.beginPath();
    context.moveTo(x + r, y);
    context.lineTo(x + width - r, y);
    context.quadraticCurveTo(x + width, y, x + width, y + r);
    context.lineTo(x + width, y + height - r);
    context.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    context.lineTo(x + r, y + height);
    context.quadraticCurveTo(x, y + height, x, y + height - r);
    context.lineTo(x, y + r);
    context.quadraticCurveTo(x, y, x + r, y);
    context.closePath();
  }

  function nodePosition(id) {
    const node = nodeById(id);
    return { x: node.x * state.width, y: node.y * state.height };
  }

  function renderBackground() {
    const gradient = ctx.createLinearGradient(0, 0, 0, state.height);
    gradient.addColorStop(0, "#091a23");
    gradient.addColorStop(0.55, "#07151d");
    gradient.addColorStop(1, "#050d13");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, state.width, state.height);

    const gridSize = Math.max(30, Math.min(56, state.width / 18));
    ctx.strokeStyle = "rgba(110, 187, 183, 0.06)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= state.width; x += gridSize) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, state.height);
    }
    for (let y = 0; y <= state.height; y += gridSize) {
      ctx.moveTo(0, y);
      ctx.lineTo(state.width, y);
    }
    ctx.stroke();

    const buildingWidth = Math.max(14, Math.min(28, state.width / 48));
    const buildingHeight = Math.max(10, Math.min(23, state.height / 25));
    const cols = Math.ceil(state.width / (buildingWidth + 13));
    const rows = Math.ceil(state.height / (buildingHeight + 17));
    for (let row = 1; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const seed = (row * 37 + col * 53 + state.current * 19) % 17;
        const x = col * (buildingWidth + 13) + (row % 2) * 7;
        const y = row * (buildingHeight + 17);
        const lit = state.result?.success && seed % 3 !== 0;
        ctx.fillStyle = lit ? "rgba(255, 205, 93, 0.14)" : "rgba(43, 72, 78, 0.25)";
        ctx.fillRect(x, y, buildingWidth + (seed % 7), buildingHeight + (seed % 5));
        if (lit) {
          ctx.fillStyle = "rgba(255, 220, 122, 0.42)";
          ctx.fillRect(x + 4, y + 4, 3, 3);
          ctx.fillRect(x + 11, y + 4, 3, 3);
        }
      }
    }

    ctx.fillStyle = "rgba(104, 245, 219, 0.028)";
    ctx.beginPath();
    ctx.arc(state.width * 0.72, state.height * 0.58, Math.min(state.width, state.height) * 0.42, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawLine(edge, style) {
    const start = nodePosition(edge.a);
    const end = nodePosition(edge.b);
    ctx.save();
    ctx.strokeStyle = style.color;
    ctx.lineWidth = style.width;
    ctx.setLineDash(style.dash || []);
    ctx.shadowColor = style.shadow || "transparent";
    ctx.shadowBlur = style.blur || 0;
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
    ctx.restore();
  }

  function drawCandidateEdges() {
    const existingKeys = new Set(allEdges().map((edge) => edgeKey(edge.a, edge.b)));
    currentLevel().allowed.forEach((edge) => {
      if (existingKeys.has(edgeKey(edge.a, edge.b))) return;
      drawLine(edge, {
        color: "rgba(100, 143, 145, 0.34)",
        width: 2,
        dash: [6, 8]
      });
      drawCapacity(edge, 0, true);
    });
  }

  function drawActiveEdges() {
    const level = currentLevel();
    allEdges().forEach((edge) => {
      const key = edgeKey(edge.a, edge.b);
      const isOverload = state.result?.overloadKeys.includes(key);
      const isFault = state.result?.faultKey === key && level.faultEdge;
      const flow = state.result?.flows[key] || 0;
      const isAdded = state.added.some((item) => edgeKey(item.a, item.b) === key);
      let color = isAdded ? "rgba(255, 199, 90, 0.9)" : "rgba(100, 160, 162, 0.66)";
      let shadow = isAdded ? "rgba(255, 199, 90, 0.55)" : "transparent";
      let width = isAdded ? 3 : 4;
      let dash = [];
      if (flow > 0) {
        color = "rgba(86, 226, 255, 0.95)";
        shadow = "rgba(79, 200, 255, 0.75)";
        width = 5;
      }
      if (isFault || isOverload) {
        color = `rgba(255, 93, 108, ${0.72 + Math.sin(state.simTime * 9) * 0.2})`;
        shadow = "rgba(255, 93, 108, 0.9)";
        width = 6;
        dash = isFault ? [9, 7] : [];
      }
      drawLine(edge, { color, shadow, width, blur: flow > 0 || isOverload ? 14 : 5, dash });
      drawCapacity(edge, flow, false);
      if (flow > 0 && !isOverload && !isFault) drawParticles(edge, flow);
    });
  }

  function drawCapacity(edge, flow, candidate) {
    const start = nodePosition(edge.a);
    const end = nodePosition(edge.b);
    const x = (start.x + end.x) / 2;
    const y = (start.y + end.y) / 2;
    const label = candidate ? `${effectiveCapacity(edge)} MW` : `${flow || 0} / ${effectiveCapacity(edge)}`;
    ctx.save();
    ctx.font = "800 9px Arial";
    const width = ctx.measureText(label).width + 12;
    roundedRect(ctx, x - width / 2, y - 9, width, 18, 6);
    ctx.fillStyle = candidate ? "rgba(7, 20, 27, 0.68)" : "rgba(7, 20, 27, 0.92)";
    ctx.fill();
    ctx.strokeStyle = candidate ? "rgba(100, 143, 145, 0.22)" : "rgba(104, 245, 219, 0.24)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = candidate ? "rgba(132, 163, 163, 0.75)" : "#ccf6f0";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, x, y);
    ctx.restore();
  }

  function drawParticles(edge, flow) {
    const start = nodePosition(edge.a);
    const end = nodePosition(edge.b);
    const count = Math.min(4, Math.max(1, Math.ceil(flow / 2)));
    for (let index = 0; index < count; index += 1) {
      const phase = (state.simTime * 0.34 + index / count) % 1;
      const x = start.x + (end.x - start.x) * phase;
      const y = start.y + (end.y - start.y) * phase;
      ctx.beginPath();
      ctx.arc(x, y, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = "#eafff9";
      ctx.shadowColor = "#68f5db";
      ctx.shadowBlur = 11;
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  function drawNodeHalos() {
    currentLevel().nodes.forEach((node) => {
      const position = nodePosition(node.id);
      const powered = state.result?.served.includes(node.id);
      const source = node.type === "generator" || node.type === "battery";
      const radius = powered ? 62 + Math.sin(state.simTime * 4) * 4 : source ? 44 : 34;
      const glow = ctx.createRadialGradient(position.x, position.y, 3, position.x, position.y, radius);
      glow.addColorStop(0, powered ? "rgba(104, 245, 219, 0.34)" : source ? "rgba(255, 199, 90, 0.15)" : "rgba(65, 113, 119, 0.08)");
      glow.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(position.x, position.y, radius, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function drawFailureFlash() {
    if (state.mode !== "failure") return;
    const alpha = 0.035 + (Math.sin(state.simTime * 7) + 1) * 0.025;
    ctx.fillStyle = `rgba(255, 38, 66, ${alpha})`;
    ctx.fillRect(0, 0, state.width, state.height);
    if (!state.result?.firstOverload) return;
    const [a, b] = state.result.firstOverload.split("::");
    const start = nodePosition(a);
    const end = nodePosition(b);
    const midX = (start.x + end.x) / 2;
    const midY = (start.y + end.y) / 2;
    ctx.strokeStyle = "#fff0c7";
    ctx.lineWidth = 2;
    ctx.shadowColor = "#ff5d6c";
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.moveTo(midX - 11, midY - 17);
    ctx.lineTo(midX + 1, midY - 4);
    ctx.lineTo(midX - 5, midY + 2);
    ctx.lineTo(midX + 13, midY + 18);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  function render() {
    if (!ctx || state.width <= 1 || state.height <= 1) return;
    ctx.setTransform(state.dprX, 0, 0, state.dprY, 0, 0);
    renderBackground();
    drawNodeHalos();
    drawCandidateEdges();
    drawActiveEdges();
    drawFailureFlash();
  }

  function resizeCanvas(entry) {
    const rect = shell.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    let pixelWidth = Math.round(rect.width * Math.min(window.devicePixelRatio || 1, 2));
    let pixelHeight = Math.round(rect.height * Math.min(window.devicePixelRatio || 1, 2));
    const box = entry?.devicePixelContentBoxSize;
    const physical = Array.isArray(box) ? box[0] : box;
    if (physical?.inlineSize && physical?.blockSize) {
      pixelWidth = Math.round(physical.inlineSize);
      pixelHeight = Math.round(physical.blockSize);
    }
    canvas.width = Math.max(1, pixelWidth);
    canvas.height = Math.max(1, pixelHeight);
    state.width = rect.width;
    state.height = rect.height;
    state.dprX = canvas.width / rect.width;
    state.dprY = canvas.height / rect.height;
    render();
  }

  function animationLoop(now) {
    if (!document.hidden) {
      const delta = Math.min(100, Math.max(0, now - state.lastFrame));
      state.simTime += delta / 1000;
      render();
    }
    state.lastFrame = now;
    requestAnimationFrame(animationLoop);
  }

  function renderGameToText() {
    const level = currentLevel();
    return JSON.stringify({
      coordinate_system: "Canvas origin top-left; x increases right; y increases down. Node positions are normalized 0..1.",
      mode: state.mode,
      level: state.current + 1,
      level_name: level.name,
      action_count: state.actionCount,
      run_count: state.runCount,
      selected_node: state.selected || "",
      cables_built: state.added.length,
      cable_budget: effectiveCableBudget(),
      powered_count: state.result?.served.length || 0,
      powered_districts: state.result?.served || [],
      target_count: level.target,
      first_overload: state.result?.firstOverload || "",
      downstream_impact: state.result?.impacted || [],
      ops: save.ops,
      upgrades_total: Object.values(save.upgrades).reduce((sum, value) => sum + value, 0),
      status: state.status,
      nodes: level.nodes.map((node) => ({
        id: node.id,
        type: node.type,
        label: node.label,
        x: node.x,
        y: node.y,
        demand: node.demand || 0,
        supply: effectiveSupply(node),
        critical: Boolean(node.critical),
        switch_closed: node.type === "switch" ? state.switches[node.id] : null
      })),
      lines: allEdges().map((edge) => ({
        from: edge.a,
        to: edge.b,
        capacity: effectiveCapacity(edge),
        flow: state.result?.flows[edgeKey(edge.a, edge.b)] || 0,
        player_built: state.added.some((item) => edgeKey(item.a, item.b) === edgeKey(edge.a, edge.b))
      }))
    });
  }

  elements.run.addEventListener("click", runGrid);
  elements.undo.addEventListener("click", undoLine);
  elements.retry.addEventListener("click", retryLevel);
  elements.next.addEventListener("click", nextLevel);
  elements.sound.addEventListener("click", () => {
    if (!state.muted) ensureAudio();
    state.muted = !state.muted;
    elements.sound.textContent = state.muted ? "MUTED" : "SOUND";
    elements.sound.setAttribute("aria-pressed", String(state.muted));
    elements.sound.setAttribute("aria-label", state.muted ? "Unmute sound" : "Mute sound");
    if (!state.muted) {
      ensureAudio();
      tone(330, 0.08, "sine", 0.025);
    }
  });
  document.querySelectorAll(".upgrade-btn").forEach((button) => {
    button.addEventListener("click", () => buyUpgrade(button.dataset.upgrade));
  });
  shell.addEventListener("contextmenu", (event) => event.preventDefault());
  shell.addEventListener("touchmove", (event) => event.preventDefault(), { passive: false });
  window.addEventListener("keydown", (event) => {
    if (event.key.toLowerCase() === "f" && !event.repeat) {
      if (document.fullscreenElement) document.exitFullscreen?.();
      else document.documentElement.requestFullscreen?.();
    }
  });
  document.addEventListener("fullscreenchange", () => resizeCanvas());
  document.addEventListener("visibilitychange", () => {
    state.lastFrame = performance.now();
  });

  const observer = new ResizeObserver((entries) => resizeCanvas(entries[0]));
  try {
    observer.observe(shell, { box: "device-pixel-content-box" });
  } catch (_) {
    observer.observe(shell);
  }

  window.render_game_to_text = renderGameToText;
  window.advanceTime = (milliseconds) => {
    state.simTime += Math.max(0, milliseconds) / 1000;
    render();
  };

  loadLevel();
  resizeCanvas();
  requestAnimationFrame(animationLoop);
})();
