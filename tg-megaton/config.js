// Public, non-secret Mini App config.
// AdsGram rewarded block for Megaton.
window.MEGATON_ADSGRAM_BLOCK_ID = "36240";
try {
  var _adsgramTestBlock = (location.search.match(/[?&]adsgram=([0-9]+)/) || [])[1];
  if (_adsgramTestBlock) window.MEGATON_ADSGRAM_BLOCK_ID = _adsgramTestBlock;
} catch (e) {}

// Monetag Telegram Mini App zone. Paste the dashboard SDK tag's src into
// MEGATON_MONETAG_SDK_SRC when available; the zone ID alone is not a script URL.
window.MEGATON_MONETAG_ZONE_ID = "11200728";
window.MEGATON_MONETAG_SDK_SRC = "https://libtl.com/sdk.js";
window.MEGATON_MONETAG_INAPP_SETTINGS = {
  frequency: 2,
  capping: 0.1,
  interval: 30,
  timeout: 5,
  everyPage: false
};

window.MEGATON_TON_RECIPIENT = "UQCAFJyUz0GmYZmtiDz21WXGzOfWPQaBI6T5fPjIjhBn_i6Q";
window.MEGATON_TON_MANIFEST_URL = "https://game-factory.tech/tg-megaton/tonconnect-manifest.json";
window.MEGATON_TON_PRICES = {
  starter: { ton: "0.20", nanotons: "200000000" },
  caps_pack: { ton: "0.40", nanotons: "400000000" },
  warhead_tuning: { ton: "0.60", nanotons: "600000000" },
  mirv_kit: { ton: "0.80", nanotons: "800000000" },
  early_beta: { ton: "8.00", nanotons: "8000000000" }
};
