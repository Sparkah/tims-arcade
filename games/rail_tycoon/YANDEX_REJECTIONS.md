# Rail Tycoon — Yandex Moderation Rejection Log

No rejections yet.

## Build origin

- Source: `Shared/data/telegram-digest/reports/daily-2026-05-05.md` Build Today #3
- Built by: game-factory skill (manual run, 2026-05-05)
- Stack: Vanilla JS + HTML5 Canvas, single `index.html`
- Mechanic: Drag rails between colored stations; cargo spawns and routes itself via the network to a matching-color station. Profit goal per level, missed cargo counts as strikes (5 strikes = bankrupt). Tap rail to delete.
- Validation: passes all yandex-presubmit grep checks.

## Custom screenshot tool

Because the game uses click-drag to build rails (no keyboard), this folder has its own `take_screenshots.js` that programmatically simulates 6 drag gestures to build a connected pentagon + cross-link network before capturing.
