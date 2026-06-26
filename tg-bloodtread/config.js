// Public, non-secret Mini App config for the Bloodtread Telegram Mini App.

// SHOP GATED OFF (Tim 2026-06-26, "ship core now, payments later"): the Stars/TON grant model is
// client-authoritative (Codex hard blocker). Until grant application is server-owned, the shop button + buy
// flows are disabled so no real money can flow. Cloud saves + the game itself are unaffected. Flip to true only
// once the server-side claim endpoint ships (and the game's tg.js PAYMENTS_ENABLED is flipped in lockstep).
window.BLOODTREAD_SHOP_ENABLED = false;

// AdsGram rewarded block for Bloodtread. PLACEHOLDER: ad blocks are per-app, so create a NEW AdsGram block
// for the Bloodtread Mini App and paste its id here (Megaton's block is a different app). Blank = ads no-op
// (the revive falls back to an instant revive) until set.
window.BLOODTREAD_ADSGRAM_BLOCK_ID = "";
try {
  var _adsgramTestBlock = (location.search.match(/[?&]adsgram=([0-9]+)/) || [])[1];
  if (_adsgramTestBlock) window.BLOODTREAD_ADSGRAM_BLOCK_ID = _adsgramTestBlock;
} catch (e) {}

// Monetag Telegram Mini App zone. PLACEHOLDER: create a separate Monetag zone for the Bloodtread Mini App
// (separate app = separate zone for clean fill/reporting/payouts) and paste the zone id + SDK src here.
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
