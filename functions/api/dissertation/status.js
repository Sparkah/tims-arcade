import {
  STUDY_ELIGIBLE_FALLBACK,
  STUDY_SESSION_SIZE,
  STUDY_TARGET_SEQUENCES,
  readActiveScheduleState,
  studyAbuseProtectionReady,
  studyConfiguration,
  studyJson,
} from '../../_lib/dissertationStudy.js';

export async function onRequestGet({ env }) {
  const config = studyConfiguration(env);
  let eligibleGames = STUDY_ELIGIBLE_FALLBACK;
  let databaseReady = false;
  let abuseProtectionReady = false;
  let scheduleReady = false;
  let completedSequences = 0;
  let recruitmentComplete = false;
  let eligibleSequence = false;

  if (config.db) {
    try {
      const [schedule, protectionReady] = await Promise.all([
        readActiveScheduleState(config.db),
        studyAbuseProtectionReady(config.db),
      ]);
      scheduleReady = schedule.scheduleReady;
      completedSequences = schedule.completedSequences;
      recruitmentComplete = schedule.recruitmentComplete;
      eligibleSequence = Boolean(schedule.candidate);
      databaseReady = true;
      abuseProtectionReady = protectionReady;
    } catch {
      databaseReady = false;
      abuseProtectionReady = false;
      scheduleReady = false;
      completedSequences = 0;
      recruitmentComplete = false;
      eligibleSequence = false;
    }
  }

  const open = config.open
    && databaseReady
    && abuseProtectionReady
    && scheduleReady
    && !recruitmentComplete
    && eligibleSequence;
  return studyJson({
    open,
    collectionEnabled: config.open,
    databaseReady,
    abuseProtectionReady,
    scheduleReady,
    completedSequences,
    targetSequences: STUDY_TARGET_SEQUENCES,
    recruitmentComplete,
    sessionSize: STUDY_SESSION_SIZE,
    eligibleGames,
    informationVersion: open ? config.informationVersion : null,
  });
}
