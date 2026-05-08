# Clean Sweep Donut — Yandex Moderation Rejection Log

No rejections yet. After each rejection, append a new section with:
- Rule violated (e.g. 1.6.2.3, 5.1.1.2)
- Root cause (what specifically in the code/promo material failed)
- Fix applied (file:line)
- Lesson for the skill: anything that should be added to `Shared/skills/yandex-publish/SKILL.md` or `Shared/skills/yandex-presubmit/SKILL.md`

---

## Build origin

- Source: `Shared/data/telegram-digest/reports/daily-2026-05-05.md` Build Today #1
- Built by: game-factory skill (first run, manual)
- Stack: Vanilla JS + HTML5 Canvas, single `index.html`
- Validation: passes all 7 yandex-presubmit grep checks (no console, SDK in head, LoadingAPI.ready, resize handler, overflow:hidden, both langs, no external CDNs)
