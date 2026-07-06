# Megaton Project Map

Status on 2026-07-06: Megaton is being refactored back toward one understandable project folder. This folder is the project map and guardrail for that work. The current live files are still split because Telegram and Itch were built as separate packages:

- Itch package: `Agents/Itch/megaton/`
- older game source: `Agents/Games/211_megaton/`
- Telegram package: `Gallery/tg-megaton/`

Branches are only for work isolation and deployment safety. Branches must not be the way Itch and Telegram stay different. The platform wrapper should carry the difference, and gameplay should come from one source.

## Folder Intent

This `megaton/` folder is the single control folder for Megaton work:

- `README.md` explains ownership and the allowed platform differences.
- `source/game/` is the canonical gameplay seed, copied from the newer Itch package.
- `platforms/telegram/patches/` is the current Telegram overlay. It is intentionally too large today and must shrink until it contains only shop/ad/save/Stars differences. As of 2026-07-06, `gf-lib.js`, `audio.js`, and `levels.json` are shared again; the remaining overlay is `game/index.html`.
- `build.mjs` generates Itch and Telegram packages into `megaton/dist/`.
- `source-report.mjs` compares the current Itch and Telegram packages and fails when known gameplay markers drift.

The live deploy packages remain outside this folder for now because moving them directly would break existing publish paths:

- `tg-megaton/` is the Cloudflare/Telegram deploy path.
- `../../Itch/megaton/` is the Itch package path in the Agents repo.

Next migration step: shrink the Telegram patch by moving Telegram-only shop/ad/save/shop-bonus hooks behind explicit platform calls, then remove the remaining gameplay edits from the patch.

## Rule

Only these areas may differ by platform:

- Telegram: Telegram SDK boot, Supabase save/load, AdsGram/Monetag, Stars/TON, paid products, missions, leaderboards, Telegram-only local tester gates.
- Itch: no ads/IAP, free daily chest ladder, Itch metadata, Itch GameAnalytics build string.

These must be shared:

- balance constants and economy math
- level data and authored city progression
- perk list, caps, costs, and descriptions
- weakpoints, effects, target rules, and core visuals
- tutorial gameplay sequence, except for a platform-specific shop/ad/chest prompt
- nuke behavior, save schema, audio, and core UI rendering

## Workflow

1. Make gameplay changes in `megaton/source/game/`, not directly inside `tg-megaton/game/index.html`.
2. Generate both platform packages from that source:

   ```bash
   node megaton/build.mjs
   ```

3. Run the drift report:

   ```bash
   node megaton/source-report.mjs
   ```

4. If gameplay markers differ, shrink `megaton/platforms/telegram/patches/` first. Do not hand-patch Telegram from Itch after deployment.
5. Test both generated packages:
   - Itch local package: wrapper + game, no ads/IAP visible.
   - Telegram wrapper: mocked Telegram WebApp, mocked invoice/purchase/ad calls, real product ids rejected without init data.

## Current Migration Target

Use `megaton/source/game/` as the newer gameplay/balance reference, then re-apply Telegram monetization as a platform adapter. Do not replace Telegram with the raw Itch game in one step: the current Telegram game also owns live gacha visuals, remote save hooks, Stars grants, God Power, and tutorial gift wiring. Those currently live in the Telegram patch and must become explicit platform hooks/config before the final source collapse.

2026-07-06 progress:

- `gf-lib.js` now exposes a generic `window.__gfPlatformAds` provider so Telegram AdsGram/Monetag live in the wrapper instead of the shared runtime.
- `audio.js` and `levels.json` are identical across source, Itch, and Telegram.
- Telegram now parses and renders the newer Itch district symbols/effects. The remaining `game/index.html` overlay should be treated as Telegram platform work, not a place to add new shared gameplay.

## Target Shape

```text
megaton/
  README.md
  build.mjs               # generator for Itch + Telegram packages
  source-report.mjs       # drift report
  source/game/            # canonical gameplay, balance, levels, shared game code
  platforms/telegram/     # current Telegram overlay patches

megaton/dist/telegram/    # generated Telegram package
megaton/dist/itch/        # generated Itch package
tg-megaton/               # current Telegram deploy package, do not hand-edit gameplay
../../Itch/megaton/       # current Itch package, do not hand-edit gameplay
```

Until the Telegram patch is shrunk, `megaton/dist/telegram/` should match the current live Telegram package and `node megaton/source-report.mjs --check` should pass. Any new report failure means shared gameplay drift has been reintroduced.
