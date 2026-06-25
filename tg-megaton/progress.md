Original prompt: Work on Megaton Telegram infrastructure/integrations while Claude continues platform-agnostic game work. Add DB saving, Telegram SDK adapter, ads/shop/payment hooks, and keep the interface contract clear for the other agent.

2026-06-25:
- Added Cloudflare Pages Functions for Supabase-backed Telegram state and purchase receipt sync.
- Added `window.__tg` adapter surface in the Telegram wrapper: buy, showAd, saveState, loadState, getProducts.
- Bot payment receipts now post to the Cloudflare purchase endpoint when `TG_BACKEND_SECRET` is configured.
- Verified locally with Wrangler Pages dev and Playwright: wrapper boots the game, iframe receives `window.__tg`, shop renders all four Stars buttons on mobile, and console/page errors were empty.
- TON Stars and TON Connect lanes are both wired; final TON validation still needs a real wallet transaction inside Telegram after deployment.
- Next: test a real paid Stars invoice and a real TON wallet transfer inside Telegram.
- Added AdsGram form values, Monetag zone wiring, `?adsgram=<blockId>` iframe forwarding, AdsGram-to-Monetag rewarded fallback, and the static TonConnect manifest.
- Set AdsGram production reward UnitID/block ID `36240` in `config.js`; keep `?adsgram=<blockId>` as a test override for alternate blocks.
- Set Monetag SDK source to `https://libtl.com/sdk.js`. Current game code uses Monetag Rewarded Interstitial (`show_11200728()`) and In-app Interstitial (`show_11200728({ type: "inApp", ... })`); Rewarded Popup is not active unless the call changes to `show_11200728("pop")`.
- Added TonConnect UI checkout in the Telegram wrapper, `/api/tg-ton-order`, `/api/tg-ton-verify`, TonAPI recipient-wallet verification, TON prices beside Stars, and the 20 TON `god_power` bundle. `god_power` persists as ad-free/max-warhead state and grants 250,000 caps.
- Added a context-only `welcome_x8` product: the welcome-back reactor modal now offers normal collect, x2 via rewarded ad/God Power, or x8 after a 10 Stars invoice returns `paid`.
- Production cleanup: removed the `?` help button and `RST` reset button from Megaton, moved Daily/Stats/Mute into a right rail below the top HUD, enabled first-60s funnel collection on `/tg-megaton/`, and added first-party level-funnel start/fail/complete events for city drop-off analysis under slug `megaton`.
- Fixed rewarded-ad routing for Telegram: the game iframe now asks the top Mini App wrapper to show rewarded ads first. The wrapper loads AdsGram + Monetag at top level, tries AdsGram block `36240`, falls back to Monetag zone `11200728`, and shows an "Ad not ready" toast on no-fill/missing SDK without granting fake rewards.
