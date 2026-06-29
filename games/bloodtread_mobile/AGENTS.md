# BLOODTREAD - THE ONE AND ONLY (read this first)

**This folder, `Gallery/games/bloodtread_mobile/`, IS Bloodtread. The whole game. The source.**

There is no other. On 2026-06-26 every other bloodtread folder was DELETED on Tim's order
(the `_refactor` / `bloodtread_rebuild` modular experiment + its `game.js` baseline, the
`bloodtread_rebuild_art` fork, `Games/198_bloodtread` gf-lib build, the `Codex/bloodtread-art-port*`
forks, and a pile of `output/*bloodtread*`). They caused a week of "which folder?" confusion and an
agent shipping a gacha onto the wrong (v0) build. Do NOT recreate any of them. Do NOT make a
"rebuild" or "refactor" copy. **Edit THIS folder directly.**

## What this is
- The LIVE game. Web: `tims-arcade.pages.dev/games/bloodtread_mobile/` + `game-factory.tech/games/bloodtread_mobile/`.
  Telegram Mini App: the wrapper `Gallery/tg-bloodtread/` iframes this folder (`../games/bloodtread_mobile/?tg=1`).
- A modular vanilla ES build (WebGL2 top-down survivors): `main.js` boots -> `core/loop.js` -> `update.js`
  + `render/world.js` (WebGL) + `render/hud.js` (2D HUD) + `ui/screens.js` (menus/vault). State in `state.js`.
- This folder IS the source now. There is NO build/deploy step and NO upstream `_refactor`. Commit to the
  Gallery repo (-> `Sparkah/tims-arcade` -> Cloudflare auto-deploy on push) and it's live.

## It renders POLISHED only with sprites on
`flags.js`: `PUBLIC_BUILD = !!window.__BT_PUBLIC`, and `OLD_SPRITES = ?sprites || PUBLIC_BUILD`. The shipped
`index.html` sets `window.__BT_PUBLIC` so sprites load and the game looks polished (the layered tank, gore
sheets, creature art) and AUTOSTARTS into gameplay. **If you serve it some other way and see flat grey
primitives / no real art, that is the no-sprite dev path - NOT a broken game. Don't judge it by that, and
don't "fix" it by rebuilding.** To see the menu/vault, pause in-game (or load with `?sprites=1` and no autostart).

## The Gore Cache gacha (added 2026-06-26) lives here
- `data/loot.js` (rarities, drop pool, skins, relics, consumables, odds + pity)
- `systems/loot.js` (openCache atomic-before-reveal, pity, dupe->shards, equip, applyEquippedRelics, daily + elite drops)
- `ui/screens.js` (`drawVault` + `drawReveal` - real art: tinted tank for skins, sprite icons for relics, gore-sheet reveal)
- `state.js` `econ` (caches/pity/shards/ownedSkins/equipSkin/ownedRelics/equipRelics/consumables/lastDaily/streak)
- `persistence.js` (serializes the loot fields) + `tg.js` (cloud-syncs them across devices in Telegram)

## Telegram payments are OFF on purpose
`tg.js PAYMENTS_ENABLED=false`: Stars/TON grants are client-authoritative (a player could self-grant paid
products). Needs a SERVER-SIDE claim endpoint (verify `telegram_purchases.status='paid'`, apply the delta
server-side) before enabling. The soft/free gacha (daily + elite caches, soft-currency, no real money) is
fine and shippable as-is. No paid-random boxes (Telegram Stars-only + FTC loot-box hazard).
