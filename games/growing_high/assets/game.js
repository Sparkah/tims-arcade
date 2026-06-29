(() => {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d", { alpha: false });

  const STORAGE_KEY = "growing-high-v1";
  const COLS = 14;
  const ROWS = 9;
  const CELL_SOIL_LOAD = 8;
  const CELL_WATER_LOAD = 3;
  const SPRINKLER_LOAD = 18;
  const PEOPLE_LOAD = 44;
  const TOOL_LOAD = 18;
  const DAY_MINUTES = 1440;

  const cropDefs = {
    carrot: {
      key: "carrot",
      name: "Carrot",
      short: "Carrot",
      growDays: 21,
      seedCost: 8,
      saleBase: 35,
      saplingLoad: 4,
      harvestLoad: 16,
      shelfLife: 14,
      seasons: ["Spring", "Autumn"],
      color: "#e26d3f",
      leaf: "#3e8f42",
    },
    bokChoy: {
      key: "bokChoy",
      name: "Bok Choy",
      short: "Bok",
      growDays: 14,
      seedCost: 12,
      saleBase: 80,
      saplingLoad: 7,
      harvestLoad: 26,
      shelfLife: 7,
      seasons: ["Spring", "Autumn"],
      color: "#f2f7d8",
      leaf: "#55a95d",
    },
    cilantro: {
      key: "cilantro",
      name: "Cilantro",
      short: "Cilantro",
      growDays: 14,
      seedCost: 6,
      saleBase: 30,
      saplingLoad: 3,
      harvestLoad: 9,
      shelfLife: 7,
      seasons: ["Spring", "Autumn"],
      color: "#6fbf5f",
      leaf: "#2e8740",
    },
    parsnip: {
      key: "parsnip",
      name: "Parsnip",
      short: "Parsnip",
      growDays: 35,
      seedCost: 8,
      saleBase: 35,
      saplingLoad: 5,
      harvestLoad: 25,
      shelfLife: 14,
      seasons: ["Spring", "Summer", "Autumn", "Winter"],
      color: "#ead9a8",
      leaf: "#4c9d46",
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
      inventory: [],
      compost: 0,
      favour: {
        restaurant: 0,
        carpenter: 0,
        social: 0,
      },
      volunteers: [
        { name: "Maya", task: "idle", x: 0.35, y: 0.44, bob: 0 },
        { name: "Jun", task: "idle", x: 0.68, y: 0.58, bob: 1.5 },
      ],
      prices: {},
      rng: 12891,
      stats: {
        harvested: 0,
        sold: 0,
        collapses: 0,
        donated: 0,
      },
    };
  }

  function startNewGame() {
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
    if (!Array.isArray(state.inventory)) state.inventory = [];
    if (!Array.isArray(state.volunteers)) state.volunteers = createInitialState().volunteers;
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
    for (const def of Object.values(cropDefs)) {
      const inSeason = def.seasons.includes(season);
      const min = inSeason ? 0.9 : 0.5;
      const max = inSeason ? 1.5 : 1.2;
      prices[def.key] = Math.max(1, Math.round(def.saleBase * randomBetween(min, max)));
    }
    return prices;
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
        if (!cell.soil || cell.sprinkler || plantAt(c, r)) return false;
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

  function plantLoad(plant) {
    const def = cropDefs[plant.crop];
    if (!def) return 0;
    const t = Math.max(0, Math.min(1, plant.growthDays / def.growDays));
    if (t < 0.35) return 2 + def.saplingLoad * t;
    return def.saplingLoad + (def.harvestLoad - def.saplingLoad) * t;
  }

  function plantStage(plant) {
    const def = cropDefs[plant.crop];
    if (!def) return "unknown";
    const t = plant.growthDays / def.growDays;
    if (t >= 1) return "harvestable";
    if (t >= 0.35) return "sprout";
    return "seed";
  }

  function roofLoad() {
    let load = PEOPLE_LOAD + TOOL_LOAD;
    for (const cell of state.grid) {
      if (cell.soil) load += CELL_SOIL_LOAD;
      if (cell.watered || cell.sprinkler) load += CELL_WATER_LOAD;
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

  function wateredCount() {
    return state.grid.filter((cell) => cell.watered || cell.sprinkler).length;
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
    if (state.phase === "market") return "Market Day";
    if (state.phase === "repair") return "Roof Repair";
    return state.phase;
  }

  function passPlanning() {
    if (state.phase !== "planning") return;
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
    state.phase = "market";
    state.day = 7;
    state.minutes = 9 * 60;
    state.fast = false;
    state.message = "Market day. Sell produce for cash or gift a box to build useful favour.";
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
      if (volunteer.task === "water") {
        for (const plant of state.plants) {
          for (const cell of rootCells(plant)) {
            cellAt(cell.col, cell.row).watered = true;
          }
        }
      }
      if (volunteer.task === "harvest") {
        const ready = state.plants.filter((plant) => plantStage(plant) === "harvestable");
        for (const plant of ready) {
          harvestPlant(plant, "volunteer");
        }
      }
    }
  }

  function growPlants() {
    for (const plant of state.plants) {
      if (isPlantWatered(plant)) {
        const bonus = rootCells(plant).reduce((sum, cell) => sum + cellAt(cell.col, cell.row).compost, 0);
        plant.growthDays += 1 + Math.min(0.5, bonus * 0.08);
        plant.thirst = 0;
        absorbSoil(plant, 0.08);
      } else {
        plant.thirst = (plant.thirst || 0) + 1;
      }
    }
  }

  function absorbSoil(plant, amount) {
    for (const cell of rootCells(plant)) {
      const target = cellAt(cell.col, cell.row);
      if (target.soil > 0) {
        target.soil = Math.max(0.35, target.soil - amount);
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
    growPlants();
    checkRoofLoad();
    saveTimer = 0;
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
    state.message = `Roof collapse. ${lost} crop${lost === 1 ? "" : "s"} withered while the construction crew repairs the building.`;
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
      if (item.age > item.shelfLife) {
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
      thirst: 0,
    });
    state.message = `${def.name} planted. Keep every root tile irrigated so it grows.`;
    saveGame();
    return true;
  }

  function placeSprinkler(col, row) {
    if (!inBounds(col, row)) return false;
    const cell = cellAt(col, row);
    if (cell.sprinkler || plantAt(col, row)) {
      state.message = "Sprinklers need an empty grid tile.";
      return false;
    }
    if (state.money < 25) {
      state.message = "Need 25p to add another sprinkler.";
      return false;
    }
    state.money -= 25;
    cell.sprinkler = true;
    waterRadius(col, row, 1);
    state.message = "Sprinkler added. It waters nearby soil at the start of each day.";
    saveGame();
    return true;
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
    state.plants = state.plants.filter((item) => item.id !== plant.id);
    state.stats.harvested += 1;
    state.message = source === "volunteer"
      ? `${def.name} harvested by a volunteer and moved to storage.`
      : `${def.name} harvested into storage.`;
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
    for (const item of state.inventory) {
      if (item.spoiled) {
        keep.push(item);
        continue;
      }
      const price = state.prices[item.crop] || cropDefs[item.crop].saleBase;
      earned += price * item.qty;
      sold += item.qty;
    }
    state.inventory = keep;
    state.money += earned;
    state.stats.sold += sold;
    state.message = sold > 0 ? `Sold ${sold} box${sold === 1 ? "" : "es"} for ${formatMoney(earned)}.` : "No fresh produce ready to sell.";
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
    const def = cropDefs[item.crop];
    if (npc === "restaurant") {
      state.compost += 5 + state.favour[npc] * 2;
      state.message = `Restaurant owner liked the ${def.name}. Food scraps added compost.`;
    } else if (npc === "carpenter") {
      state.roofLimit += 24;
      state.message = "Carpenter strengthened the roof edge. Weight limit improved.";
    } else {
      const volunteerName = state.favour.social > 2 ? "Sam" : "Ari";
      if (state.volunteers.length < 3) {
        state.volunteers.push({ name: volunteerName, task: "idle", x: 0.5, y: 0.5, bob: 0.4 });
      }
      state.message = "Social worker referred another volunteer for future weeks.";
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

  function setVolunteerTask(index, task) {
    const volunteer = state.volunteers[index];
    if (!volunteer) return;
    volunteer.task = task;
    state.message = `${volunteer.name} assigned to ${task === "idle" ? "wander" : task}.`;
    saveGame();
  }

  function cycleVolunteerTask(index) {
    const volunteer = state.volunteers[index];
    if (!volunteer) return;
    const order = ["idle", "water", "harvest"];
    const next = order[(order.indexOf(volunteer.task) + 1) % order.length] || "idle";
    setVolunteerTask(index, next);
  }

  function cycleSelectedSeed() {
    const keys = Object.keys(cropDefs);
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
      state.minutes += dt * speed * (night ? 1.55 : 1);
      while (state.minutes >= DAY_MINUTES && state.phase === "midweek") {
        endDay();
      }
    } else if (state.phase === "repair") {
      updateRepair(dt);
    }

    for (let i = 0; i < state.volunteers.length; i += 1) {
      const volunteer = state.volunteers[i];
      volunteer.bob += dt * (volunteer.task === "idle" ? 1.4 : 2.2);
      if (volunteer.task === "idle") {
        volunteer.x += Math.sin(volunteer.bob * 0.8 + i) * dt * 0.015;
        volunteer.y += Math.cos(volunteer.bob * 0.7 + i) * dt * 0.012;
      } else if (volunteer.task === "water") {
        volunteer.x += (0.28 + i * 0.12 - volunteer.x) * dt * 0.8;
        volunteer.y += (0.52 - volunteer.y) * dt * 0.8;
      } else if (volunteer.task === "harvest") {
        volunteer.x += (0.64 - i * 0.1 - volunteer.x) * dt * 0.8;
        volunteer.y += (0.48 - volunteer.y) * dt * 0.8;
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

  function draw() {
    layout();
    view.buttons = [];
    ctx.clearRect(0, 0, view.width, view.height);

    if (state.mode === "title") {
      drawTitle();
      return;
    }

    if (state.phase === "market") {
      drawMarket();
    } else {
      drawCity();
      drawRooftop();
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
      const radius = stage === "harvestable" ? roof.cell * 0.52 : stage === "sprout" ? roof.cell * 0.38 : roof.cell * 0.22;
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
      if (stage === "harvestable") {
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
    const buttonW = (p.w - 42) / 2;
    const seedKeys = Object.keys(cropDefs);
    for (let i = 0; i < seedKeys.length; i += 1) {
      const key = seedKeys[i];
      const def = cropDefs[key];
      const bx = p.x + 16 + (i % 2) * (buttonW + 10);
      const by = y + Math.floor(i / 2) * 46;
      const price = state.prices[key] || def.saleBase;
      addButton(`seed-${key}`, bx, by, buttonW, 38, `${def.short} ${price}p`, () => {
        state.selectedSeed = key;
        state.selectedTool = "seed";
        state.message = `${def.name} selected. Click a 2 by 2 soil patch to plant.`;
      }, { selected: state.selectedSeed === key });
    }
    y += 100;

    ctx.font = "700 13px ui-sans-serif, system-ui";
    ctx.fillStyle = "#253331";
    ctx.fillText("Volunteers", p.x + 16, y);
    y += 20;
    for (let i = 0; i < state.volunteers.length; i += 1) {
      const volunteer = state.volunteers[i];
      ctx.font = "12px ui-sans-serif, system-ui";
      ctx.fillStyle = "#53625d";
      ctx.fillText(`${volunteer.name}: ${volunteer.task}`, p.x + 16, y + 4);
      addButton(`vol-${i}-water`, p.x + 112, y, 54, 30, "Water", () => setVolunteerTask(i, "water"), { selected: volunteer.task === "water", enabled: state.phase !== "market" });
      addButton(`vol-${i}-harvest`, p.x + 172, y, 62, 30, "Harvest", () => setVolunteerTask(i, "harvest"), { selected: volunteer.task === "harvest", enabled: state.phase !== "market" });
      addButton(`vol-${i}-idle`, p.x + 240, y, 48, 30, "Idle", () => setVolunteerTask(i, "idle"), { selected: volunteer.task === "idle", enabled: state.phase !== "market" });
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
    y += 38;
    ctx.font = "700 13px ui-sans-serif, system-ui";
    ctx.fillStyle = "#253331";
    ctx.fillText("Rooftop", x, y);
    y += 20;
    ctx.font = "12px ui-sans-serif, system-ui";
    ctx.fillStyle = "#53625d";
    drawWrappedText(`Soil cells ${soilCount()}, sprinklers ${sprinklerCount()}, plants ${state.plants.length}, watered cells ${wateredCount()}.`, x, y, w, 16);
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
    if (tool === "seed") return "Click a clear 2 by 2 soil patch to plant the selected seed.";
    if (tool === "irrigation") return "Click an empty tile to add a sprinkler for 25p.";
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
    const cardY = compact ? 282 : view.height * 0.25;
    const cardW = compact ? view.width - 36 : Math.min(420, view.width * 0.37);
    drawMarketCard(cardX, cardY, cardW);
    drawBottomMarketControls();
    drawWeightGauge();
  }

  function drawMarketCard(x, y, w) {
    ctx.fillStyle = "rgba(251, 248, 238, 0.94)";
    ctx.strokeStyle = "rgba(35, 49, 46, 0.35)";
    ctx.lineWidth = 1.5;
    roundRect(x, y, w, 300, 8);
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

    addButton("sell-all", x + 16, y + 66, w - 32, 42, "Sell all fresh produce", () => sellAll(), { selected: true });
    addButton("gift-restaurant", x + 16, y + 122, w - 32, 38, `Gift restaurant - favour ${state.favour.restaurant}`, () => giftToNpc("restaurant"));
    addButton("gift-carpenter", x + 16, y + 168, w - 32, 38, `Gift carpenter - favour ${state.favour.carpenter}`, () => giftToNpc("carpenter"));
    addButton("gift-social", x + 16, y + 214, w - 32, 38, `Gift social worker - favour ${state.favour.social}`, () => giftToNpc("social"));
    addButton("compost-spoiled", x + 16, y + 260, (w - 42) / 2, 32, "Compost spoiled", () => compostSpoiled(), { subtle: true });
    addButton("strengthen-roof", x + 26 + (w - 42) / 2, y + 260, (w - 42) / 2, 32, "Strengthen roof", () => strengthenRoof(), { subtle: true });
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

  function gridFromPoint(x, y) {
    const roof = view.roof;
    const col = Math.floor((x - roof.x) / roof.cell);
    const row = Math.floor((y - roof.y) / roof.cell);
    if (!inBounds(col, row)) return null;
    return { col, row };
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
      if (!plantAt(cell.col, cell.row) && !target.sprinkler) {
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

  window.addEventListener("resize", resize);
  window.addEventListener("keydown", handleKey);
  canvas.addEventListener("pointerdown", handlePointerDown);
  canvas.addEventListener("pointermove", handlePointerMove);
  canvas.addEventListener("pointerup", handlePointerUp);
  canvas.addEventListener("pointercancel", handlePointerUp);
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());

  hydrateState();
  state.prices = generatePrices();
  resize();
  requestAnimationFrame((now) => {
    lastFrame = now;
    requestAnimationFrame(loop);
  });
})();
