export const SAVE_KEY = 'megaton_v5';
export const CURRENT_TUTORIAL_VERSION = 3;

export const SAVE_SCHEMA = Object.freeze([
  'money', 'totalEarned', 'best', 'cityTier',
  'powerLvl', 'flareLvl', 'penLvl', 'mirvLvl', 'shockLvl', 'luckLvl',
  'empLvl', 'orbitalLvl', 'clusterLvl', 'firestormLvl', 'chainLvl',
  'glassLvl', 'seismicLvl', 'infernoLvl', 'toppleLvl', 'meltdownLvl',
  'tidalLvl', 'fireworksLvl', 'eyeLvl',
  'citiesRazed', 'maxTier', 'tutDone', 'starterGiven', 'upgDone', 'godPower',
  'lastSeen', 'dailyStreak', 'lastClaimDay',
  'activeNuke', 'nukeOwned', 'nukeAmmo',
  'tutorialV', 'tutStep', 'tutorialDailyClaimed', 'tutorialGiftClaimed',
  'ownedSkins', 'skinCopies', 'equippedSkin', 'skinBoosts', 'gachaStats',
]);

export function createSaveStore({ storage, platform }) {
  function read() {
    try {
      const raw = storage.getItem(SAVE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (error) {
      return null;
    }
  }

  function mirror(value) {
    try {
      if (value && typeof platform.saveState === 'function') return platform.saveState(value) !== false;
    } catch (error) {}
    return false;
  }

  function write(snapshot) {
    try {
      const raw = JSON.stringify(snapshot);
      const clean = JSON.parse(raw);
      const telegram = platform && platform.id === 'telegram';
      // Telegram's wrapper owns the authoritative shared localStorage copy.
      // Ask it first so a conflict guard can reject a stale iframe snapshot
      // before those bytes overwrite the state the server just returned.
      if (telegram && !mirror(clean)) return false;
      storage.setItem(SAVE_KEY, raw);
      if (!telegram) mirror(clean);
      return true;
    } catch (error) {
      return false;
    }
  }

  function mirrorStored() {
    const stored = read();
    if (stored) mirror(stored);
  }

  return Object.freeze({ key: SAVE_KEY, schema: SAVE_SCHEMA, read, write, mirrorStored });
}

export function migrateTutorialStep(save, { currentVersion, doneStep, clamp }) {
  if (save.tutStep == null) return save.upgDone ? doneStep : (save.tutDone ? 1 : 0);
  const rawStep = Number(save.tutStep) || 0;
  const savedVersion = Number(save.tutorialV || 1);
  if (savedVersion < 2) return rawStep >= 3 || save.upgDone ? doneStep : rawStep;
  if (savedVersion < currentVersion) return rawStep >= 10 || save.upgDone ? doneStep : rawStep;
  return clamp(rawStep, 0, doneStep);
}
