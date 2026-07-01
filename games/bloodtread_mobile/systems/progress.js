// Run progression + economy purchases: XP/level-up draft (rollUpgradeDraft/chooseUpgrade/applyUpgradeId),
// level-up card layout/hit-test, bankRun (cash out blood + best time), and the BloodForge buys
// (buyTrack / buyOrEquipWeapon). Part of the SCC: -> game/meta (bumpTier/currentWeaponTier/sync),
// player (syncTankTiersFromMeta), analytics, persistence, audio. Mutates econ/META/player + the draft state.
import { player, state, econ, META, upgradeCounts, upgradePick, upgradeRollPool, upgradeRect } from '../state.js?v=bm10';
import { upgradeNames } from '../data/upgrades.js?v=bm10';
import { MAXTIER } from '../data/upgrades.js?v=bm10';
import { playPrestige } from '../audio.js?v=bm10';
import { rnd } from '../lib/rng.js?v=bm10';
import { WEAPON_BY_ID } from '../data/weapons.js?v=bm10';
import { view } from '../state.js?v=bm10';
import { playTone } from '../audio.js?v=bm10';
import { bumpTier, currentWeaponTier, trackCost } from '../game/meta.js?v=bm10';
import { BALANCE } from '../balance.js?v=bm10';
import { saveMeta } from '../persistence.js?v=bm10';
import { syncTankTiersFromMeta, recomputeWeaponStats } from './player.js?v=bm10';
import { trackAnalyticsUpgradePick } from '../analytics.js?v=bm10';
import { gainHeal } from '../fx/heal.js?v=bm10';

  export function buyTrack(id) {
    var cost = trackCost(id);
    econ.selectedTrack = id;
    if (cost == null || econ.totalBank < cost) return false;
    econ.totalBank -= cost;
    if (id === 'cannon') {
      econ.weaponMeta[econ.equipWeapon] = Math.min(MAXTIER, currentWeaponTier() + 1);
      META.cannon = econ.weaponMeta[econ.equipWeapon];
    } else {
      META[id] = Math.min(MAXTIER, META[id] + 1);
    }
    saveMeta();
    syncTankTiersFromMeta();
    playTone(390 + (id === 'cannon' ? currentWeaponTier() : META[id]) * 35, 0.09, 0.035);
    return true;
  }

  export function buyOrEquipWeapon(id) {
    var w = WEAPON_BY_ID[id];
    if (!w) return false;
    if (econ.ownedWeapons[id]) {
      econ.equipWeapon = id;
      saveMeta();
      syncTankTiersFromMeta();
      playTone(260, 0.055, 0.026);
      return true;
    }
    if (econ.totalBank < w.cost) return false;
    econ.totalBank -= w.cost;
    econ.ownedWeapons[id] = 1;
    econ.equipWeapon = id;
    saveMeta();
    syncTankTiersFromMeta();
    playTone(520, 0.12, 0.045);
    return true;
  }

  // XP-to-reach-the-next-level. LINEAR + fast early per the research (xpBase + xpPerLevel*(level-1)):
  // L1->2 = 5, ->3 = 13, ->4 = 21, ... so ~6-8 picks land in the first 2-3 min and the build comes online
  // quickly. (Old: a steeper quadratic floor(6 + level*4 + level*level*0.35) that throttled the early ramp.)
  // Reads BALANCE so ?tune can retune the cadence. `level` is the level you're CURRENTLY on (1-based).
  export function nextXpForLevel(level) {
    return Math.floor(BALANCE.progression.xpBase + BALANCE.progression.xpPerLevel * (level - 1));
  }

  export function rollUpgradeDraft() {
    var len = upgradeNames.length;
    for (var i = 0; i < len; i++) upgradeRollPool[i] = i;
    for (var p = 0; p < 3; p++) {
      var j = p + ((rnd() * (len - p)) | 0);
      var tmp = upgradeRollPool[p];
      upgradeRollPool[p] = upgradeRollPool[j];
      upgradeRollPool[j] = tmp;
      upgradePick[p] = upgradeRollPool[p];
    }
  }

  // Apply a level-up card's effect. ADDITIVE, COMPOUNDING, reading BALANCE.progression magnitudes so ?tune can
  // retune every pick. The two "spray" picks (HEAVY CALIBER dmg, RELOAD GLAND fire-rate) add into the additive
  // dmgBonus/asBonus pools (recomputeWeaponStats then re-derives dmg/fireRate, clamping asBonus to the cap), so
  // picks + permanent meta compose linearly. The rest are small flat/multiplicative steps. (Old code multiplied
  // dmg/fireRate directly, which compounded geometrically and ignored the additive + capped model.)
  export function applyUpgradeId(u) {
    if (u >= 0 && u < upgradeCounts.length) upgradeCounts[u] = Math.min(65535, upgradeCounts[u] + 1);
    var G = BALANCE.progression;
    if (u === 0) {                                  // HEAVY CALIBER: +dmgBonusPerPick (additive damage)
      player.dmgBonus += BALANCE.weapon.dmgBonusPerPick;
      recomputeWeaponStats();
      bumpTier('cannon');
    } else if (u === 1) {                           // BOILER PRESSURE: +speed (multiplicative)
      player.speed *= (1 + G.speedPerPick);
      bumpTier('treads');
    } else if (u === 2) {                           // TREAD TEETH: +crush dps + reach
      player.crushDps *= (1 + G.crushDpsPerPick);
      player.crush += G.crushReachPerPick;
      bumpTier('treads');
    } else if (u === 3) {                           // THIRST: +heal-on-kill
      player.thirst += G.thirstPerPick;
      player.rangedHeal = true;
      bumpTier('thirst');
      bumpTier('core');
    } else if (u === 4) {                           // RELOAD GLAND: +asBonusPerPick (additive fire rate)
      player.asBonus += BALANCE.weapon.asBonusPerPick;
      recomputeWeaponStats();
      bumpTier('cannon');
    } else if (u === 5) {                           // VEIN NETWORK: +pickup range
      player.pickR *= (1 + G.pickRPerPick);
      bumpTier('core');
    } else if (u === 6) {                           // ARMOR PLATING: +max HP + patch up
      player.maxHp += G.maxHpPerPick;
      var patch = Math.min(player.maxHp - player.hp, G.maxHpPatchCap);
      if (patch > 0) { player.hp += patch; gainHeal(patch); }   // GREEN patch-up flush
      bumpTier('armor');
    } else if (u === 7) {                           // OVERGROWTH: +1 cannon barrel
      player.barrels = Math.min(8, player.barrels + 1);
      bumpTier('cannon');
      bumpTier('core');
    } else {                                        // VEIN LASH: +1 leech-lash level
      player.lashLvl = Math.min(8, player.lashLvl + 1);
      bumpTier('frenzy');
      bumpTier('thirst');
    }
  }

  export function applyUpgrade() {
    var u = (state.tick + player.level * 3) % upgradeNames.length;
    applyUpgradeId(u);
    player.level++;
    player.xp -= player.xpNext;
    player.xpNext = nextXpForLevel(player.level);
    state.banner = upgradeNames[u];
    state.bannerT = 1.45;
  }

  export function gainXp(v) {
    player.xp += v;
    if (state.mode === 'PLAYING' && player.xp >= player.xpNext) startLevelUp();
  }

  export function startLevelUp() {
    if (state.mode === 'GAMEOVER') return;
    state.mode = 'LEVELUP';
    state.banner = '';
    state.bannerT = 0;
    state.levelupOpenMs = (typeof performance !== 'undefined' && performance.now) ? performance.now() : 0;   // wall-clock open time for the prestige entrance (state.t is frozen during LEVELUP)
    playPrestige();   // prestige sting so the upgrade draft feels EARNED, not snapped open
    rollUpgradeDraft();
  }

  export function chooseUpgrade(slot) {
    if (state.mode !== 'LEVELUP' || slot < 0 || slot > 2) return false;
    var u = upgradePick[slot];
    applyUpgradeId(u);
    trackAnalyticsUpgradePick(u, slot);
    player.level++;
    player.xp -= player.xpNext;
    player.xpNext = nextXpForLevel(player.level);
    state.banner = upgradeNames[u];
    state.bannerT = 1.1;
    if (player.xp >= player.xpNext) startLevelUp();
    else state.mode = 'PLAYING';
    return true;
  }

  export function layoutUpgradeCards() {
    var mobile = view.cssW < 720;
    var gap = mobile ? 10 : 16;
    var cw = mobile ? Math.min(360, view.cssW - 48) : Math.min(230, (view.cssW - 96) / 3);
    var ch = mobile ? 86 : 132;
    var startX = mobile ? (view.cssW - cw) * 0.5 : (view.cssW - (cw * 3 + gap * 2)) * 0.5;
    var startY = mobile ? Math.max(92, (view.cssH - (ch * 3 + gap * 2)) * 0.5) : Math.max(112, view.cssH * 0.5 - ch * 0.5);
    for (var i = 0; i < 3; i++) {
      var k = i * 4;
      upgradeRect[k] = mobile ? startX : startX + i * (cw + gap);
      upgradeRect[k + 1] = mobile ? startY + i * (ch + gap) : startY;
      upgradeRect[k + 2] = cw;
      upgradeRect[k + 3] = ch;
    }
  }

  export function cardAt(x, y) {
    if (state.mode !== 'LEVELUP') return -1;
    layoutUpgradeCards();
    for (var i = 0; i < 3; i++) {
      var k = i * 4;
      if (x >= upgradeRect[k] && x <= upgradeRect[k] + upgradeRect[k + 2] &&
          y >= upgradeRect[k + 1] && y <= upgradeRect[k + 1] + upgradeRect[k + 3]) return i;
    }
    return -1;
  }

  export function bankRun() {
    if (state.runBanked) return;
    state.runBanked = true;
    econ.totalBank += Math.floor(state.blood);
    if (state.t > econ.bestTime) econ.bestTime = state.t;
    saveMeta();
  }
