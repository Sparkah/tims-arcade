# Megaton Telegram Integration Contract

`Gallery/tg-megaton/index.html` is the Telegram adapter. The game iframe should stay platform-agnostic and use this surface when it needs platform services:

```js
window.__tg = {
  buy(productId, currency, cb),
  showAd(type, cb),
  saveState(state),
  loadState(),
  getProducts()
};
```

## Methods

- `buy(productId, "XTR", cb)` creates a Telegram Stars invoice through `/api/tg-invoice`, opens it with `Telegram.WebApp.openInvoice`, then applies the item after Telegram returns `paid`. The adapter also polls `/api/tg-purchase` so server-recorded receipts can become the entitlement source.
- `showAd("rewarded" | "interstitial", cb)` forwards to `GF.ads.rewarded()` or `GF.ads.interstitial()` inside the iframe.
- `saveState(state)` writes `megaton_v5` and syncs it to Supabase through `/api/tg-state`.
- `loadState()` loads the Supabase state for the Telegram user and returns the local `megaton_v5` object.
- `getProducts()` returns the currently visible wrapper shop catalog.

## Products

Current visible Megaton Stars products:

| ID | Price | Delivery |
| --- | ---: | --- |
| `starter` | 25 XTR | 1500 caps, Yield level 2, +1 Luck |
| `caps_pack` | 49 XTR | 5000 caps |
| `warhead_tuning` | 75 XTR | +4 Yield, +2 Luck, 1200 caps |
| `mirv_kit` | 99 XTR | +1 MIRV, +2 Penetrator, +2 Flares, 1800 caps |

`early_beta` is present in the backend catalog at 1000 XTR, but it is not shown in the wrapper shop until the game has a final fulfillment path for it.

## Supabase

Run `Gallery/supabase/telegram-schema.sql` in the Supabase SQL editor. The tables use RLS with no public policies; Cloudflare accesses them only with the server-side service-role key.

Cloudflare Pages environment variables:

```bash
TELEGRAM_GAMEBOT_TOKEN=...
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
TG_BACKEND_SECRET=<random shared secret>
```

Bot environment variables in `Shared/tools/telegram-digest/.env`:

```bash
TG_BACKEND_SECRET=<same random shared secret>
TG_PURCHASE_ENDPOINT=https://game-factory.tech/api/tg-purchase
TG_MEGATON_APP=<BotFather short name, after /newapp>
```

## Ads

AdsGram is already routed inside `Gallery/tg-megaton/game/gf-lib.js`. Set `window.MEGATON_ADSGRAM_BLOCK_ID` in `Gallery/tg-megaton/config.js` or pass `?adsgram=<blockId>` while testing. Without a block ID, rewarded ads resolve as no-fill and do not grant rewards.

AdsGram platform values:

| Field | Value |
| --- | --- |
| App name | `Megaton` |
| Telegram direct link | `https://t.me/gamesfactorybot/megaton` |
| Web app URL | `https://game-factory.tech/tg-megaton/` |
| Bot ID | `8628009479` |
| Reward block ID / UnitID | `36240` |

Monetag zone `11200728` is configured in `Gallery/tg-megaton/config.js`. Paste the dashboard SDK tag's `src` into `window.MEGATON_MONETAG_SDK_SRC`; the wrapper will create the tag with `data-zone="11200728"` and `data-sdk="show_11200728"`. The game ad adapter will call `show_11200728()` for rewarded ads and `show_11200728({ type: "inApp", ... })` for interstitials when the SDK is loaded.

## TON

TON is not yet granting items. The static TonConnect manifest is hosted at `https://game-factory.tech/tg-megaton/tonconnect-manifest.json`, and the recipient wallet plus provisional TON prices are in `Gallery/tg-megaton/config.js`.

Provisional TON prices are mapped from Stars using roughly USD 0.013 per Star and TON around USD 1.56 on 2026-06-25:

| ID | Stars | TON |
| --- | ---: | ---: |
| `starter` | 25 | 0.20 |
| `caps_pack` | 49 | 0.40 |
| `warhead_tuning` | 75 | 0.60 |
| `mirv_kit` | 99 | 0.80 |
| `early_beta` | 1000 | 8.00 |

The remaining TON lane still needs TonConnect UI, transaction memo format, and server-side chain verification before any item is granted.
