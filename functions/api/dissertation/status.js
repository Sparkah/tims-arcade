import {
  STUDY_ELIGIBLE_FALLBACK,
  STUDY_SESSION_SIZE,
  readActiveGamePool,
  studyAbuseProtectionReady,
  studyConfiguration,
  studyJson,
} from '../../_lib/dissertationStudy.js';

export async function onRequestGet({ env }) {
  const config = studyConfiguration(env);
  let eligibleGames = STUDY_ELIGIBLE_FALLBACK;
  let databaseReady = false;
  let abuseProtectionReady = false;

  if (config.db) {
    try {
      const [pool, protectionReady] = await Promise.all([
        readActiveGamePool(config.db),
        studyAbuseProtectionReady(config.db),
      ]);
      eligibleGames = pool.length;
      databaseReady = eligibleGames === STUDY_ELIGIBLE_FALLBACK;
      abuseProtectionReady = protectionReady;
    } catch {
      databaseReady = false;
      abuseProtectionReady = false;
      eligibleGames = STUDY_ELIGIBLE_FALLBACK;
    }
  }

  const open = config.open
    && databaseReady
    && abuseProtectionReady
    && eligibleGames === STUDY_ELIGIBLE_FALLBACK;
  return studyJson({
    open,
    databaseReady,
    abuseProtectionReady,
    sessionSize: STUDY_SESSION_SIZE,
    eligibleGames,
    consentVersion: open ? config.consentVersion : null,
  });
}
