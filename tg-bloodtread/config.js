// Public, non-secret Mini App config for the Bloodtread Telegram Mini App.

// Shop enabled only with server-authoritative grants. Stars/TON receipts are verified by Cloudflare/Supabase
// and applied to telegram_player_states before the wrapper refreshes the game state.
window.BLOODTREAD_SHOP_ENABLED = true;

// AdsGram rewarded block for Bloodtread (LIVE, production, Tim 2026-06-30). Rewarded-only: powers the
// revive prompt + the daily-crate rewarded prompt (input.js -> window.__tg.showAd('rewarded')). Its own
// block, separate from Megaton's 36240. Test override still works via ?adsgram=<blockId>.
window.BLOODTREAD_ADSGRAM_BLOCK_ID = "36740";
try {
  var _adsgramTestBlock = (location.search.match(/[?&]adsgram=([0-9]+)/) || [])[1];
  if (_adsgramTestBlock) window.BLOODTREAD_ADSGRAM_BLOCK_ID = _adsgramTestBlock;
} catch (e) {}

// Monetag INTENTIONALLY OFF (Tim 2026-06-30: "no interstitial ads for now"). Blank zone => the Monetag SDK
// never loads (loader is gated on zone+src) and the interstitial path no-ops; the game never requests
// interstitials anyway, and rewarded ads run through AdsGram above. To enable later, paste a NEW Bloodtread
// zone id here (do NOT reuse Megaton's 11200728).
window.BLOODTREAD_MONETAG_ZONE_ID = "";
window.BLOODTREAD_MONETAG_SDK_SRC = "https://libtl.com/sdk.js";
window.BLOODTREAD_MONETAG_INAPP_SETTINGS = {
  frequency: 2,
  capping: 0.1,
  interval: 30,
  timeout: 5,
  everyPage: false
};

// TON: same recipient wallet as the other Game Factory Mini Apps (Tim's wallet).
window.BLOODTREAD_TON_RECIPIENT = "UQCAFJyUz0GmYZmtiDz21WXGzOfWPQaBI6T5fPjIjhBn_i6Q";
window.BLOODTREAD_TON_MANIFEST_URL = "https://game-factory.tech/tg-bloodtread/tonconnect-manifest.json";
// Must match the nanotons in functions/_lib/tgProducts.js bloodtread catalog.
window.BLOODTREAD_TON_PRICES = {
  starter:     { ton: "0.20", nanotons: "200000000" },
  blood_cache: { ton: "0.40", nanotons: "400000000" },
  hull_kit:    { ton: "0.60", nanotons: "600000000" },
  arsenal:     { ton: "0.80", nanotons: "800000000" },
  ad_free:     { ton: "1.20", nanotons: "1200000000" },
  bloodgod:    { ton: "20.00", nanotons: "20000000000" }
};
