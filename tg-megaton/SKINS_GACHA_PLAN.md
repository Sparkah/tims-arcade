# Megaton Skins + Gacha Plan

Goal: add collectible mob/commander skins with small boosts, obtained through loot boxes, without destabilizing the current Telegram production build.

## Product Shape

- `daily_box`: one free box per local day, saved server-side.
- `caps_box`: paid with in-game caps.
- `premium_box_x1`: paid with Telegram Stars / TON.
- `premium_box_x10`: paid with Telegram Stars / TON, guarantees at least one rare-or-better drop.
- `god_power`: keeps all current perks and additionally grants ad-free gacha opening speed / bulk-open.

## Skin Catalog

Start with 100 skins in `tg-megaton/game/skins.json`.

Fields:

```json
{
  "id": "vault_rat_001",
  "name": "Vault Rat",
  "rarity": "common",
  "family": "mob",
  "boost": { "kind": "caps_mult", "value": 0.01 },
  "color": "#54ff96",
  "silhouette": "rat"
}
```

Rarity:

- Common: 55 skins, tiny boosts around 0.5-1%.
- Rare: 25 skins, boosts around 1.5-2%.
- Epic: 14 skins, boosts around 3%.
- Legendary: 5 skins, boosts around 5% or unique utility.
- Mythic: 1 skin, trophy-level, boost capped so it does not break balance.

Only the equipped skin boost applies. Collection bonuses can come later, but should be capped.

## Supabase Tables

Add tables:

- `megaton_skin_catalog`: skin metadata, rarity, boost JSON, active flag.
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

- Collection grid: 100 slots, rarity filter, equipped marker.
- Skin detail: name, rarity, boost, duplicate count, equip button.
- Gacha screen: daily free, caps box, premium x1, premium x10.
- Opening animation: fast, skippable, no fake paid rewards.
- Leaderboard: boxes opened + collection count.

## Save JSON

Extend `megaton_v5` with:

```json
{
  "equippedSkin": "vault_rat_001",
  "ownedSkins": ["vault_rat_001"],
  "skinBoosts": { "caps_mult": 0.01 },
  "gachaStats": { "boxesOpened": 0, "dailyLastDay": -1 }
}
```

Server state is authoritative for paid/free box limits. Local save mirrors only for fast boot.

## Integration Order

1. Add schema + Cloudflare APIs.
2. Add `skins.json` with 100 generated entries and balanced boost caps.
3. Add client collection/equip UI.
4. Add daily free and caps boxes.
5. Add paid Stars/TON box products.
6. Add leaderboard endpoints and admin funnel cards.
7. Update Terms with odds, duplicate handling, and no cash-out language.
8. Run production Telegram purchase tests before advertising paid gacha.
