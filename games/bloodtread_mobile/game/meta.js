// Economy / meta-progression helpers: weapon lookup + per-weapon TIER accessors + BloodForge track
// cost/effect strings + tier bumps. Reads the shared econ/META state and the meta tables; the live tank
// tier mirror lives on econ (tankArmor etc.). Cannon's track tracks the equipped weapon's tier.
import { META, econ } from '../state.js?v=bm8';
import { BALANCE } from '../balance.js?v=bm8';
import { clamp, clampInt } from '../lib/math.js?v=bm8';
import { WEAPON_BY_ID, WEAPON_ROW } from '../data/weapons.js?v=bm8';
import { MAXTIER, TIER_COST } from '../data/upgrades.js?v=bm8';
import { MA_FRENZY } from '../data/meta.js?v=bm8';

export function weaponName(id) {
  var w = WEAPON_BY_ID[id];
  return w ? w.name : 'CANNON';
}

export function currentWeapon() {
  return WEAPON_BY_ID[econ.equipWeapon] || WEAPON_BY_ID.cannon;
}

export function weaponRow(id) {
  return WEAPON_ROW[id] == null ? 0 : WEAPON_ROW[id];
}

export function weaponTier(id) {
  return clampInt(econ.weaponMeta[id] || 0, 0, MAXTIER);
}

export function currentWeaponTier() {
  return weaponTier(econ.equipWeapon);
}

export function weaponAtlasTier(id) {
  return clampInt(weaponTier(id), 0, 5);
}

export function syncLegacyCannonMeta() {
  META.cannon = currentWeaponTier();
}

export function trackCost(id) {
  var tier = id === 'cannon' ? currentWeaponTier() : META[id];
  return tier >= MAXTIER ? null : TIER_COST[tier];
}

// Shop display strings - now reflect the ADDITIVE meta model (BALANCE.player + BALANCE.progression), so the
// numbers shown match what applyMetaToPlayer actually grants. Shows the CURRENT tier t and the NEXT tier n.
export function trackEffect(id) {
  var t = id === 'cannon' ? currentWeaponTier() : META[id];
  var n = Math.min(MAXTIER, t + 1);
  var P = BALANCE.player, G = BALANCE.progression;
  if (id === 'armor') return 'HP ' + Math.round(P.baseMaxHp + G.metaHpPerTier * t) + (t < MAXTIER ? ' -> ' + Math.round(P.baseMaxHp + G.metaHpPerTier * n) : '');
  if (id === 'core') return 'Regen ' + (G.metaRegenPerTier * t).toFixed(1) + '/s' + (t < MAXTIER ? ' -> ' + (G.metaRegenPerTier * n).toFixed(1) + '/s' : '');
  if (id === 'cannon') return weaponName(econ.equipWeapon) + ' dmg +' + Math.round(G.metaDmgBonusPerTier * t * 100) + '%' + (t < MAXTIER ? ' -> +' + Math.round(G.metaDmgBonusPerTier * n * 100) + '%' : '');
  if (id === 'treads') return 'Speed +' + Math.round(G.metaSpeedPerTier * t * 100) + '%' + (t < MAXTIER ? ' -> +' + Math.round(G.metaSpeedPerTier * n * 100) + '%' : '');
  if (id === 'thirst') return 'Heal ' + (G.metaThirstPerTier * t) + (t < MAXTIER ? ' -> ' + (G.metaThirstPerTier * n) : '');
  if (id === 'frenzy') return 'Lash x' + MA_FRENZY[t].toFixed(2) + (t < MAXTIER ? ' -> x' + MA_FRENZY[n].toFixed(2) : '');
  return '';
}

export function bumpTier(name, amount) {
  amount = amount || 1;
  if (name === 'armor') econ.tankArmor = Math.min(6, econ.tankArmor + amount);
  else if (name === 'core') econ.tankCore = Math.min(6, econ.tankCore + amount);
  else if (name === 'cannon') econ.tankCannon = Math.min(6, econ.tankCannon + amount);
  else if (name === 'treads') econ.tankTreads = Math.min(6, econ.tankTreads + amount);
  else if (name === 'thirst') econ.tankThirst = Math.min(6, econ.tankThirst + amount);
  else if (name === 'frenzy') econ.tankFrenzy = Math.min(6, econ.tankFrenzy + amount);
}

// 0..1 rage fill from summed tank tiers - drives unleash bubble density + tank/render rage visuals.
export function tankRageLevel() {
  var sum = econ.tankArmor + econ.tankCore + econ.tankCannon + econ.tankTreads + econ.tankThirst + econ.tankFrenzy;
  return clamp(sum / 36, 0, 1);
}
