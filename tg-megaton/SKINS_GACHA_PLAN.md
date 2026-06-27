# Megaton Collectibles + Gacha Plan

Goal: add collectible payload cosmetics with visible launch/fall/trail/impact changes plus one small capped equipped stat bonus, obtained through loot boxes, without destabilizing the current Telegram production build. These are not limited to missile skins: the catalog can include missiles, bombs, drones, mascots, mutants, mobs, satellites, delivery vehicles, and explosion spirits as long as the equipped item is obvious during the core nuke loop.

Current state: `Gallery/tg-megaton/index.html` already has a local `SKINS` prototype with boxes, collection, equip, local odds, duplicate shards, and `window.__gfEquipSkin()` sync into the game iframe. `Gallery/tg-megaton/game/index.html` already persists `ownedSkins`, `equippedSkin`, `skinBoosts`, and `gachaStats`, and reads boosts for caps, yield, crit, upgrade costs, nuke costs, offline reactor, daily ration, and ship payout. This is not production-safe yet: free/caps rolls are client-owned, paid boxes are preview-only, and the art/names are still "raider" character skins.

Art direction: the base game is mostly monochrome Pip-Boy green, so gacha items should be deliberately colorful and juicy. Use saturated candy/toxic/fire/neon palettes that pop against the green city: orange-red fire cores, cyan plasma, magenta mutant slime, yellow hazard stripes, violet cosmic trails, cobalt EMP arcs. The collectible should feel like the reward, not just a tiny stat card.

Detailed art-direction brief: `Gallery/tg-megaton/ART_DIRECTOR_GACHA.md`.
First generated concept sheet: `Gallery/tg-megaton/art_refs/gacha_collectibles_concept_01.png`.

## Product Shape

- `daily_box`: one free box per server day.
- `caps_box`: paid with in-game caps.
- `premium_box_x1`: paid with Telegram Stars / TON.
- `premium_box_x10`: paid with Telegram Stars / TON, guarantees at least one rare-or-better drop.
- `god_power`: keeps all current perks and additionally grants ad-free gacha opening speed / bulk-open.

## Collectible Catalog

Start with 100 collectibles in `tg-megaton/game/skins.json` or a renamed `collectibles.json`.

Fields:

```json
{
  "id": "rust_warhead_001",
  "name": "Rust Warhead",
  "rarity": "common",
  "family": "missile",
  "boost": { "kind": "caps_mult", "value": 0.01 },
  "visual": {
    "body": "classic",
    "nose": "needle",
    "fins": "short",
    "trail": "smoke",
    "impact": "orange_core",
    "mushroomTint": "#ff9f3d",
    "primary": "#54ff96",
    "accent": "#ffd24a"
  }
}
```

Recommended families:

- `missile`: classic rockets, needle-nose nukes, MIRV pods, fat bombs, striped test missiles.
- `drone`: delivery drones, orbital rods, toy quadcopters, black-market bomber bots.
- `mob`: tiny mutants/mascots riding the payload or waving from a falling capsule.
- `satellite`: orbital drop packages, comet rods, space-junk warheads, moon-laser beacons.
- `vehicle`: bomber planes, shopping carts, refinery barrels, subway cars, delivery vans.
- `anomaly`: glowing eggs, slime comets, cursed cores, plasma crystals, dimensional rifts.
- `explosion`: items whose main identity is the blast style: flower burst, plasma ring, skull cloud, candy-firework, chain lightning, oil inferno.
- `seasonal`: limited-time visual jokes or event payloads, only if they do not break the Fallout-green read.

Rarity:

- Common: 55 skins, tiny boosts around 0.5-1%.
- Rare: 25 skins, boosts around 1.5-2%.
- Epic: 14 skins, boosts around 3%.
- Legendary: 5 skins, boosts around 5% or unique utility.
- Mythic: 1 skin, trophy-level, boost capped so it does not break balance.

Only the equipped collectible boost applies. Collection bonuses can come later, but should be capped. The main value should be visual identity: the falling payload, companion/mob cameo, contrail, impact flash, explosion shape, particle colors, and mushroom tint should make equipped items obvious during the core nuke loop.

Recommended boost kinds:

- `caps_mult`: +0.5% to +5% caps gain.
- `yield_mult`: +0.5% to +5% blast radius, hard-capped in `powerCells()`.
- `crit_bonus`: +0.5pp to +5pp critical chance, hard-capped by `critChance()`.
- `nuke_cost_disc`: +1% to +5% discount on special warheads.
- `offline_mult`: +1% to +5% reactor gain.
- `daily_mult`: +1% to +5% daily ration payout.
- `ship_bonus`: +1% to +5% ship/plane/zombie bonus caps.

Avoid stacking multiple boost kinds on one item in the first release.

## Supabase Tables

Add tables:

- `megaton_skin_catalog`: collectible metadata, family, rarity, visual JSON, boost JSON, active flag.
- `megaton_player_skins`: `(telegram_user_id, skin_id)`, duplicate count, first unlocked time.
- `megaton_player_gacha`: aggregate counters: boxes opened, free boxes opened, paid boxes opened, pity counter, last daily claim.
- `megaton_gacha_rolls`: immutable roll receipt: user, box type, paid payload/order id, random seed hash, dropped skin, duplicate payout, created_at.

Leaderboards:

- `boxes_opened_total`
- `paid_boxes_opened`
- `legendary_skins_owned`
- `skins_collected_total`

Expose via a Cloudflare API backed by Supabase, not direct client writes.

## Roll Rules

Server owns all paid rolls.

- Client requests `/api/tg-gacha-open`.
- Backend verifies Telegram initData.
- For paid boxes, backend verifies purchase/order status first.
- Backend chooses the drop, writes `megaton_gacha_rolls`, updates ownership/counters, returns only the result.
- Duplicates convert to caps or skin shards.

Initial odds:

- Common: 68%
- Rare: 23%
- Epic: 7%
- Legendary: 1.8%
- Mythic: 0.2%

Add clear odds text in the gacha UI and Terms before enabling real-money boxes.

## Client UI

Add a `SKINS` button to the wrapper shop or game stats sheet.

Views:

- Rename UI from `SKINS` to `ARSENAL`, `PAYLOADS`, or `COLLECTION`.
- Collection grid: 100 collectibles, family/rarity filter, equipped marker.
- Detail: name, family, rarity, animated payload preview, trail/impact/explosion preview, boost, duplicate count, equip button.
- Gacha screen: daily free, caps box, premium x1, premium x10.
- Opening animation: fast, skippable, no fake paid rewards.
- Leaderboard: boxes opened + collection count.
- In-game render: `drawWarhead()` should read the equipped visual, not just `PB.hi`. It should alter body silhouette, fins, color, trail particles, and optionally draw a companion/mob rider.
- Explosion render: `detonate()`, `blastAt()`, `drawMushroom()`, and fireball particles should read the equipped visual for tint, particle palette, secondary bursts, and special silhouette overlays. Examples: cyan EMP ring, magenta slime splat, orange-red skull cloud, gold fireworks, violet cosmic shock.

## Save JSON

Extend `megaton_v5` with:

```json
{
  "equippedSkin": "rust_warhead_001",
  "ownedSkins": ["rust_warhead_001"],
  "skinBoosts": { "caps_mult": 0.01 },
  "gachaStats": { "boxesOpened": 0, "dailyLastDay": -1 }
}
```

Server state is authoritative for paid/free box limits. Local save mirrors only for fast boot.

## Integration Order

1. Rename the local prototype copy/art from raider skins to payload collectibles.
2. Add `skins.json` / `collectibles.json` with 100 generated collectibles and balanced boost caps.
3. Make `drawWarhead()` and impact/mushroom/fireball effects use the equipped visual.
4. Add schema + Cloudflare APIs so free/caps/paid rolls are server-owned.
5. Convert daily free and caps boxes from local random to `/api/tg-gacha-open`.
6. Add paid Stars/TON gacha products and grant only after verified purchase/order status.
7. Add leaderboard endpoints and admin funnel cards.
8. Update Terms with odds, duplicate handling, and no cash-out language.
9. Run production Telegram purchase tests before advertising paid gacha.
