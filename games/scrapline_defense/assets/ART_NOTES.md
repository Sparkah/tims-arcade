# Scrapline Defense Procedural Art Notes

Run from the workspace root:

```bash
node Games/195_scrapline_defense/tools/make_promo_assets.js
```

All current promo art is generated procedurally by that script. It uses no copied reference assets, no screenshots, and no external packages.

## Visual Grammar

- Board density: two compact conveyor lanes with 14 defense pads. Promo compositions should show most pads occupied so the game reads as merge-defense immediately, not as an empty strategy board.
- Bot silhouettes: squat repair bots with round chassis, cyan optics, tool arms, and increasing tiers of antennas, clamps, welding rigs, and magnetic coils. High-tier bots carry cyan/magenta energy rings.
- Enemy silhouettes: three machine families - low crawlers with treads, tall scrapers with hooked arms, and bulky haulers with compactor bodies. Enemies should cluster on the right side of covers so the left-to-right defense pressure is obvious.
- Palette: charcoal and oil-black floor, oxidized teal metal, safety amber/orange, rust, cyan magnetic beam energy, and small magenta spark accents. Avoid a single-hue look.
- Cover composition: hero repair bot and dense board left/center, diagonal magnetic support beam through the frame, enemy mass on the right. Full-bleed art only; no rounded corners, borders, phone frames, platform badges, or system UI.

## Generated Slots

- Yandex: `yandex_promo/en/icon_512x512.png`, `yandex_promo/ru/icon_512x512.png`, shared and per-language `maskable_512x512.png`, and `cover_800x470.png` in both language folders.
- CrazyGames: `crazygames_promo/landscape_1920x1080.png`, `crazygames_promo/portrait_800x1200.png`, and `crazygames_promo/square_800x800.png`. These include only the game title text.
- Internal direction sheets: `assets/bot_silhouettes_sheet.png`, `assets/enemy_silhouettes_sheet.png`, and `assets/cover_composition_plan.png`.

## Screenshot Capture Plan

Gameplay screenshots are intentionally not generated yet because the current playable scene is not ready in this task lane. When core gameplay is available, capture active waves with:

- 70%+ gameplay board visible, not menu/loading/game-over/upgrade screens.
- EN and RU captured separately with the correct in-game language active.
- Dense occupied pads, moving enemies, visible support beam, HUD allowed.
- Prefer 16:9 desktop/landscape slots for Yandex validator safety; only add portrait/mobile if the build is verified to support it without clipped UI.
