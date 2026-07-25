const SAVE_KEY = "scrapline_defense_save_v1";

export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

export function saveGame(data, platform = null) {
  try {
    const raw = JSON.stringify(data);
    localStorage.setItem(SAVE_KEY, raw);
    platform?.saveData?.("save_v1", raw);
  } catch (_) {}
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch (_) {}
}
