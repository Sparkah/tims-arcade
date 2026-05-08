# Yandex Rejections — Vowel Hold'em

> Stub. Append every rejection note here and bubble lessons up to `Shared/skills/yandex-publish/SKILL.md`.

## v1 — Initial submission YYYY-MM-DD

(none yet — submitted)

---

## Pattern checklist before re-submit

- [ ] No `console.log` / `console.error` / `console.warn` in dist
- [ ] Game boots straight into MENU then PLAY click (no auto-skip needed)
- [ ] Localised UI — both `en` and `ru` strings present and switching via `navigator.language`
- [ ] Cover and icon are branded art (NOT in-game screenshots) — Yandex 5.6
- [ ] Cover/icon contain ZERO rendered text (no title/words from Flux output) — Yandex 5.6.4
- [ ] Screenshots show gameplay (≥70% canvas), not menu/gameover overlays — Yandex 5.1.1.2
- [ ] Resize-clean: no clipping when window resized
- [ ] No external script loads other than `/sdk.js`
- [ ] All assets bundled into the zip (gf-lib + wordlist inlined into index.html)
