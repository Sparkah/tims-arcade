import { BALANCE_SCHEMA_VERSION, BALANCE_STORAGE_KEY, DEFAULT_CROP_DEFS, cloneBalance } from "./balance-data.js";

const seasons = ["Spring", "Summer", "Autumn", "Winter"];
const cropOrder = Object.keys(DEFAULT_CROP_DEFS);
const rowsEl = document.getElementById("crop-rows");
const labelEl = document.getElementById("draft-label");
const seasonEl = document.getElementById("preview-season");
const previewEl = document.getElementById("crop-preview");
const selectedTitleEl = document.getElementById("selected-title");
const payloadEl = document.getElementById("payload-json");
const importEl = document.getElementById("import-json");
const shareUrlEl = document.getElementById("share-url");
const frameEl = document.getElementById("game-preview");

let crops = cloneBalance(DEFAULT_CROP_DEFS);
let selectedKey = "carrot";
let reloadTimer = 0;

loadStoredDraft();
renderTable();
renderPreview();
persistDraft(false);

rowsEl.addEventListener("input", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  updateCropFromInput(target);
  selectedKey = target.dataset.key || selectedKey;
  renderPreview();
  persistDraft(true);
});

rowsEl.addEventListener("change", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  updateCropFromInput(target);
  selectedKey = target.dataset.key || selectedKey;
  renderTable();
  renderPreview();
  persistDraft(true);
});

rowsEl.addEventListener("click", (event) => {
  const row = event.target instanceof Element ? event.target.closest("tr[data-key]") : null;
  if (!row) return;
  selectedKey = row.dataset.key || selectedKey;
  renderPreview();
});

labelEl.addEventListener("input", () => {
  renderPreview();
  persistDraft(false);
});

seasonEl.addEventListener("change", renderPreview);

document.getElementById("reset-defaults").addEventListener("click", () => {
  crops = cloneBalance(DEFAULT_CROP_DEFS);
  localStorage.removeItem(BALANCE_STORAGE_KEY);
  renderTable();
  renderPreview();
  persistDraft(true);
});

document.getElementById("copy-json").addEventListener("click", async () => {
  payloadEl.select();
  try {
    await navigator.clipboard.writeText(payloadEl.value);
  } catch (_) {
    document.execCommand("copy");
  }
});

document.getElementById("apply-preview").addEventListener("click", () => {
  persistDraft(true);
  refreshGamePreview();
});

document.getElementById("import-draft").addEventListener("click", () => {
  try {
    const payload = JSON.parse(importEl.value);
    applyPayload(payload);
    labelEl.value = typeof payload.label === "string" ? payload.label.slice(0, 60) : labelEl.value;
    renderTable();
    renderPreview();
    persistDraft(true);
  } catch (_) {
    importEl.focus();
  }
});

function loadStoredDraft() {
  try {
    const raw = localStorage.getItem(BALANCE_STORAGE_KEY);
    if (!raw) return;
    const payload = JSON.parse(raw);
    applyPayload(payload);
    if (typeof payload.label === "string") labelEl.value = payload.label.slice(0, 60);
  } catch (_) {
    crops = cloneBalance(DEFAULT_CROP_DEFS);
  }
}

function applyPayload(payload) {
  if (!payload || typeof payload !== "object" || !payload.crops) return;
  const next = cloneBalance(DEFAULT_CROP_DEFS);
  for (const [key, crop] of Object.entries(payload.crops)) {
    if (!next[key] || !crop || typeof crop !== "object") continue;
    next[key] = normaliseCrop({ ...next[key], ...crop });
  }
  crops = next;
}

function normaliseCrop(crop) {
  const clean = { ...crop };
  clean.growDays = clampInt(clean.growDays, 1, 720);
  clean.seedCost = clampInt(clean.seedCost, 0, 9999);
  clean.saleBase = clampInt(clean.saleBase, 1, 99999);
  clean.saplingLoad = clampInt(clean.saplingLoad, 1, 99999);
  clean.rootRadius = clampInt(clean.rootRadius, 4, 160);
  clean.harvestLoad = clampInt(clean.harvestLoad, 1, 99999);
  clean.shelfLife = clampInt(clean.shelfLife, 1, 3650);
  if (clean.fruitLoad !== undefined) clean.fruitLoad = clampInt(clean.fruitLoad, 0, 99999);
  if (clean.fruitInterval !== undefined) clean.fruitInterval = clampInt(clean.fruitInterval, 0, 365);
  clean.seasons = Array.isArray(clean.seasons) && clean.seasons.length
    ? clean.seasons.filter((season) => seasons.includes(season))
    : ["Spring"];
  if (!clean.seasons.length) clean.seasons = ["Spring"];
  return clean;
}

function renderTable() {
  rowsEl.textContent = "";
  for (const key of cropOrder) {
    const crop = crops[key];
    const row = document.createElement("tr");
    row.dataset.key = key;
    row.innerHTML = `
      <td>${escapeHtml(crop.name)}</td>
      <td>${numberInput(key, "growDays", crop.growDays, "1")}</td>
      <td>${numberInput(key, "saleBase", crop.saleBase, "1")}</td>
      <td>${numberInput(key, "seedCost", crop.seedCost || 0, "1")}</td>
      <td>${numberInput(key, "saplingLoad", crop.saplingLoad, "10")}</td>
      <td>${numberInput(key, "rootRadius", crop.rootRadius || 12, "1")}</td>
      <td>${numberInput(key, "harvestLoad", crop.harvestLoad, "10")}</td>
      <td>${numberInput(key, "fruitLoad", crop.fruitLoad || 0, "10")}</td>
      <td>${numberInput(key, "fruitInterval", crop.fruitInterval || 0, "1")}</td>
      <td>${numberInput(key, "shelfLife", crop.shelfLife, "1")}</td>
      <td><div class="season-set">${seasonInputs(key, crop.seasons)}</div></td>
    `;
    rowsEl.append(row);
  }
}

function numberInput(key, field, value, step) {
  return `<input type="number" min="0" step="${step}" data-key="${key}" data-field="${field}" value="${formatInput(value)}" />`;
}

function seasonInputs(key, activeSeasons) {
  return seasons
    .map((season) => `<label><input type="checkbox" data-key="${key}" data-field="season" value="${season}" ${activeSeasons.includes(season) ? "checked" : ""} />${season.slice(0, 3)}</label>`)
    .join("");
}

function updateCropFromInput(input) {
  const key = input.dataset.key;
  const field = input.dataset.field;
  if (!key || !field || !crops[key]) return;
  const crop = crops[key];
  if (field === "season") {
    const checked = [...rowsEl.querySelectorAll(`input[data-key="${cssEscape(key)}"][data-field="season"]:checked`)].map((item) => item.value);
    crop.seasons = checked.length ? checked : [input.value];
    return;
  }
  const value = Number(input.value);
  if (!Number.isFinite(value)) return;
  if (field === "fruitLoad") {
    const load = Math.max(0, Math.round(value));
    if (load > 0) crop.fruitLoad = load;
    else delete crop.fruitLoad;
  } else if (field === "fruitInterval") {
    const interval = Math.max(0, Math.round(value));
    if (interval > 0) crop.fruitInterval = interval;
    else delete crop.fruitInterval;
  } else {
    crop[field] = Math.max(field === "seedCost" ? 0 : 1, Math.round(value));
  }
}

function renderPreview() {
  const crop = crops[selectedKey] || crops.carrot;
  const season = seasonEl.value;
  const inSeason = crop.seasons.includes(season);
  const min = inSeason ? 0.9 : 0.5;
  const max = inSeason ? 1.5 : 1.2;
  const minPrice = Math.max(1, Math.round(crop.saleBase * min));
  const maxPrice = Math.max(1, Math.round(crop.saleBase * max));
  const fruitText = crop.fruitLoad ? `${crop.fruitLoad}g every ${crop.fruitInterval || 1}d` : "none";
  selectedTitleEl.textContent = crop.name;
  previewEl.innerHTML = "";
  for (const [label, value] of [
    ["Grow time", `${crop.growDays} in-game days`],
    ["Season price range", `${minPrice}-${maxPrice}p (${inSeason ? "in season" : "off season"})`],
    ["Seed cost", `${crop.seedCost || 0}p`],
    ["Root space", `${crop.rootRadius || 12}px radius`],
    ["Harvest weight", `${crop.harvestLoad}g`],
    ["Fruit cycle", fruitText],
    ["Shelf life", `${crop.shelfLife} days`],
    ["Seasons", crop.seasons.join(", ")],
  ]) {
    const dt = document.createElement("dt");
    const dd = document.createElement("dd");
    dt.textContent = label;
    dd.textContent = value;
    previewEl.append(dt, dd);
  }
}

function persistDraft(shouldReload) {
  const payload = buildPayload();
  const json = JSON.stringify(payload, null, 2);
  payloadEl.value = json;
  shareUrlEl.value = `${new URL("./", window.location.href).href}?balance=${encodePayload(payload)}`;
  localStorage.setItem(BALANCE_STORAGE_KEY, json);
  if (shouldReload) schedulePreviewReload();
}

function buildPayload() {
  return {
    schemaVersion: BALANCE_SCHEMA_VERSION,
    label: labelEl.value.trim() || "Growing High balance draft",
    updatedAt: new Date().toISOString(),
    crops,
  };
}

function encodePayload(payload) {
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function schedulePreviewReload() {
  window.clearTimeout(reloadTimer);
  reloadTimer = window.setTimeout(refreshGamePreview, 650);
}

function refreshGamePreview() {
  frameEl.src = `./?adminPreview=1&t=${Date.now()}`;
}

function clampInt(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, Math.round(number)));
}

function formatInput(value) {
  const rounded = Math.round(Number(value) * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  }[char]));
}

function cssEscape(value) {
  if (window.CSS?.escape) return CSS.escape(value);
  return String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}
