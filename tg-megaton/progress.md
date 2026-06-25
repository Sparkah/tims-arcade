Original prompt: Work on Megaton Telegram infrastructure/integrations while Claude continues platform-agnostic game work. Add DB saving, Telegram SDK adapter, ads/shop/payment hooks, and keep the interface contract clear for the other agent.

2026-06-25:
- Added Cloudflare Pages Functions for Supabase-backed Telegram state and purchase receipt sync.
- Added `window.__tg` adapter surface in the Telegram wrapper: buy, showAd, saveState, loadState, getProducts.
- Bot payment receipts now post to the Cloudflare purchase endpoint when `TG_BACKEND_SECRET` is configured.
- Verified locally with Wrangler Pages dev and Playwright: wrapper boots the game, iframe receives `window.__tg`, shop renders all four Stars buttons on mobile, and console/page errors were empty.
- TON remains intentionally disabled until wallet/contract/chain verification details are decided.
- Next: configure Supabase env vars, set AdsGram block ID, restart bot, and test a real paid invoice inside Telegram.
- Added AdsGram form values, Monetag zone wiring, `?adsgram=<blockId>` iframe forwarding, AdsGram-to-Monetag rewarded fallback, and the static TonConnect manifest. Monetag still needs the dashboard SDK tag `src` before live ads can load; TON still needs TonConnect UI plus server-side chain verification before granting items.
- Set AdsGram production reward UnitID/block ID `36240` in `config.js`; keep `?adsgram=<blockId>` as a test override for alternate blocks.
