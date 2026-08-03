export const PUBLIC_HOOK_NAMES = Object.freeze([
  '__gfAddCaps',
  '__gfSpendCaps',
  '__gfEquipSkin',
  '__gfSkinState',
  '__gfDbg',
  'render_game_to_text',
  'advanceTime',
]);

export const TEST_HOOK_NAMES = Object.freeze([
  '_jumpLevel', '_jumpTier', '_setMirv', '_setShock', '_kickZoom',
  '__ships', '__world', '__aim', '_spawnPlane', '__planes',
  '__zombies', '__spawnZombie', '__zombiePos', '__detonateAt',
  '__gfBlastAtForTest', '_setupForScreenshot', '_setLang', '_getI18N',
  '__gfSettings', '__gfOpenSettings', '__gfPress', '__gfRect', '__gfRectAll',
  '__gfTutTarget', '__gfGive', '__gfNuke', '__gfEye', '__gfCam',
  '__gfWeakpoints', '__gfTutReset', '__gfSkipTut', '__gfTutorialDaily',
  '__gfTutorialGift', '__gfReturnTest', '__gfDailyTest', '__gfOpenStats',
]);

export function installHookSurface({ target, hooks, allowTestHooks }) {
  const allowedNames = PUBLIC_HOOK_NAMES.concat(allowTestHooks ? TEST_HOOK_NAMES : []);
  const allowed = new Set(allowedNames);

  for (const name of PUBLIC_HOOK_NAMES) {
    if (typeof hooks[name] !== 'function') throw new Error('Missing required Megaton hook: ' + name);
  }

  if (allowTestHooks) {
    for (const name of TEST_HOOK_NAMES) {
      if (typeof hooks[name] !== 'function') throw new Error('Missing local Megaton test hook: ' + name);
    }
  }

  for (const name of Object.keys(hooks)) {
    if (!allowed.has(name)) throw new Error('Undeclared Megaton hook: ' + name);
    if (typeof hooks[name] !== 'function') throw new TypeError('Megaton hook must be a function: ' + name);
    target[name] = hooks[name];
  }

  if (!allowTestHooks) {
    for (const name of TEST_HOOK_NAMES) {
      try { delete target[name]; } catch (error) {}
    }
  }

  return Object.freeze({
    public: PUBLIC_HOOK_NAMES.slice(),
    test: allowTestHooks ? TEST_HOOK_NAMES.slice() : [],
  });
}
