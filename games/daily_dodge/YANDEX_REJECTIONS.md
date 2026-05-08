# Daily Dodge — Yandex Moderation Rejection Log

No rejections yet.

## Build origin

- Source: `Shared/data/telegram-digest/reports/daily-2026-05-05.md` Build Today #5
- Mechanic: 60-second top-down dodger. Day seed (YYYYMMDD) drives a deterministic projectile schedule, so every player on the same day faces the exact same pattern. 4 bullet types: red diamonds (normal), orange darts (fast small), purple orbs (heavy slow), teal spinners (curving). Personal best tracked per day + all-time in localStorage.
- Stack: Vanilla JS + HTML5 Canvas, single index.html
- Validation: passes all yandex-presubmit grep checks. `window._invincible` toggle for headless screenshot capture (production runs default false).

## Notes

- The deterministic seed pattern is a core marketing hook: "everyone races today's same pattern". Eventually this could integrate with the gallery's KV to show a global daily leaderboard.
- Daily best resets automatically when the date changes.
