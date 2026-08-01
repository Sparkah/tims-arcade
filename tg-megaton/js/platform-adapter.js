export function installTelegramAdapter(options) {
  options = options || {};

  var platformAds = {
    config: {
      minGapMs: 300000,
      startupGraceMs: 60000
    },
    showAd: options.showAd
  };

  var adapter = {
    buy: options.buyProduct,
    showAd: options.showAd,
    saveState: function (state) {
      if (typeof options.canAcceptGameState === 'function' && !options.canAcceptGameState()) return false;
      if (state && typeof state === 'object') options.writeLocalState(state);
      options.queueSave(250);
      return true;
    },
    loadState: async function () {
      await options.loadRemoteState();
      return options.readLocalState();
    },
    openSupport: options.openSupport,
    getProducts: function () {
      return JSON.parse(JSON.stringify(options.products));
    }
  };

  window.__gfPlatformAds = platformAds;
  window.__tg = adapter;

  function attachGameAdapter() {
    try {
      var child = options.game.contentWindow;
      if (child) {
        child.__tg = adapter;
        child.__gfPlatformAds = platformAds;
      }
      options.syncEquippedSkin(options.readGachaState());
    } catch (e) {}
  }

  return {
    adapter: adapter,
    platformAds: platformAds,
    attachGameAdapter: attachGameAdapter
  };
}
