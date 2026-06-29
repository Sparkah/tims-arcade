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
- `buy(productId, "TON", cb)` creates a pending TON order through `/api/tg-ton-order`, opens TonConnect UI, sends a mainnet wallet transfer with a text-comment memo, then polls `/api/tg-ton-verify` until the recipient wallet transaction is indexed and matched before applying the item.
- `showAd("rewarded" | "interstitial", cb)` forwards to `GF.ads.rewarded()` or `GF.ads.interstitial()` inside the iframe.
- `saveState(state)` writes `megaton_v5` and syncs it to Supabase through `/api/tg-state`.
- `loadState()` loads the Supabase state for the Telegram user and returns the local `megaton_v5` object.
- `getProducts()` returns the currently visible wrapper shop catalog.

## Products

Current visible Megaton products:

| ID | Stars | TON | Delivery |
| --- | ---: | ---: | --- |
| `starter` | 25 XTR | 0.20 | 1500 caps, Yield level 2, +1 Extra Income |
| `caps_pack` | 49 XTR | 0.40 | 5000 caps |
| `warhead_tuning` | 75 XTR | 0.60 | +4 Yield, +2 Extra Income, 1200 caps |
| `mirv_kit` | 99 XTR | 0.80 | +1 MIRV, +2 Penetrator, +2 Flares, 1800 caps |
| `god_power` | - | 20.00 | Ad-free play, maxed warhead perks, and 250,000 caps |

Context-only Stars product:

| ID | Stars | Delivery |
| --- | ---: | --- |
| `welcome_x8` | 10 XTR | Multiplies the current welcome-back reactor payout by 8 after the invoice returns `paid` |

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

Monetag zone `11200728` is configured in `Gallery/tg-megaton/config.js` with SDK source `https://libtl.com/sdk.js`; the wrapper creates the tag with `data-zone="11200728"` and `data-sdk="show_11200728"`. Activate Rewarded Interstitial and In-app Interstitial in Monetag. The game ad adapter calls `show_11200728()` for rewarded ads and `show_11200728({ type: "inApp", ... })` for interstitials when the SDK is loaded. Rewarded Popup is not used unless the rewarded call is changed to `show_11200728("pop")`.

## TON

TON Connect checkout is wired in the Telegram wrapper. The static TonConnect manifest is hosted at `https://game-factory.tech/tg-megaton/tonconnect-manifest.json`, and the recipient wallet plus visible TON prices are in `Gallery/tg-megaton/config.js`.

Server endpoints:

- `/api/tg-ton-order`: requires Telegram initData, stores a pending Supabase purchase, and returns a TonConnect message with a text-comment payload.
- `/api/tg-ton-verify`: requires Telegram initData, reads the pending order, queries TonAPI for inbound transactions to the recipient wallet, and marks the purchase paid only when the memo and nanotons match.

TON mainnet config:

| Field | Value |
| --- | --- |
| Recipient | `UQCAFJyUz0GmYZmtiDz21WXGzOfWPQaBI6T5fPjIjhBn_i6Q` |
| Network | `-239` |
| Memo format | `GF:ton:<game>:<productId>:<uuid>` |
| TonConnect UI | `@tonconnect/ui@3.0.0` |

The memo is intentionally opaque and does not put the Telegram user ID on-chain. The Telegram user/order link stays in Supabase. Full end-to-end TON unlock still needs a real wallet transaction inside Telegram after deployment.
