import {
  STUDY_ELIGIBLE_FALLBACK,
  STUDY_SESSION_SIZE,
  readActiveGamePool,
  studyConfiguration,
  studyJson,
} from '../../_lib/dissertationStudy.js';

export async function onRequestGet({ env }) {
  const config = studyConfiguration(env);
  let eligibleGames = STUDY_ELIGIBLE_FALLBACK;
  let databaseReady = false;

  if (config.db) {
    try {
      const pool = await readActiveGamePool(config.db);
      eligibleGames = pool.length;
      databaseReady = eligibleGames === STUDY_ELIGIBLE_FALLBACK;
    } catch {
      databaseReady = false;
      eligibleGames = STUDY_ELIGIBLE_FALLBACK;
    }
  }

  const open = config.open
    && databaseReady
    && eligibleGames === STUDY_ELIGIBLE_FALLBACK;
  return studyJson({
    open,
    databaseReady,
    abuseProtectionReady: config.abuseProtectionReady,
    sessionSize: STUDY_SESSION_SIZE,
    eligibleGames,
    consentVersion: open ? config.consentVersion : null,
  });
}
