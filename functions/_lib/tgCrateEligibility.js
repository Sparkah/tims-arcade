// eligible_v2 invariant: weeklyCratesOpened already includes the legacy cooldown floor;
// weeklyCountVersion is the idempotency guard, and new week rotation stamps v2 to avoid
// crediting stale daily/ad/caps cooldowns into a fresh week.
export function crateWeekId(date = new Date()) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export function dayToWeekId(day) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(day || ''))) return '';
  return crateWeekId(new Date(`${day}T00:00:00Z`));
}

export function timeToWeekId(value) {
  const ts = Number(value || 0);
  if (!Number.isFinite(ts) || ts <= 0) return '';
  return crateWeekId(new Date(ts));
}

export function legacyEligibleFloor(gacha, week) {
  if (gacha.weeklyCountVersion === 'eligible_v2') return 0;
  let count = 0;
  if (dayToWeekId(gacha.dailyCrateDay) === week) count += 1;
  if (timeToWeekId(gacha.adCrateLastAt) === week) count += 1;
  if (timeToWeekId(gacha.capsCrateLastAt) === week) count += 1;
  return count;
}

export function migrateLegacyEligibleCount(gacha, week) {
  if (gacha.weeklyCountVersion === 'eligible_v2') return;
  gacha.weeklyCratesOpened = Math.max(0, Math.floor(Number(gacha.weeklyCratesOpened || 0))) + legacyEligibleFloor(gacha, week);
  gacha.weeklyCountVersion = 'eligible_v2';
}
