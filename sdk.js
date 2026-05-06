// Stub Yandex Games SDK for the gallery host.
// Real games shipped to Yandex include this from /sdk.js on Yandex's CDN. When
// played here, we provide a minimal no-op so the boot fast-path runs immediately
// instead of waiting for the games' 3s SDK timeout fallback.
window.YaGames = {
  init: function () {
    return Promise.resolve({
      environment: { i18n: { lang: (navigator.language || 'en').slice(0, 2) } },
      features: {
        LoadingAPI: { ready: function () {} },
        GameplayAPI: { start: function () {}, stop: function () {} },
      },
      adv: {
        // Mimic Yandex's callback contract so games waiting on onClose (to
        // restart, return to menu, etc.) keep flowing on the gallery host.
        showFullscreenAdv: function (opts) {
          var cbs = (opts && opts.callbacks) || {};
          try { cbs.onOpen && cbs.onOpen(); } catch (_) {}
          setTimeout(function () {
            try { cbs.onClose && cbs.onClose(false); } catch (_) {}
          }, 0);
        },
        showRewardedVideo: function (opts) {
          var cbs = (opts && opts.callbacks) || {};
          try { cbs.onOpen && cbs.onOpen(); } catch (_) {}
          try { cbs.onRewarded && cbs.onRewarded(); } catch (_) {}
          setTimeout(function () {
            try { cbs.onClose && cbs.onClose(); } catch (_) {}
          }, 0);
        },
      },
      feedback: {
        canReview: function () { return Promise.resolve({ value: false }); },
        requestReview: function () { return Promise.resolve({ feedbackSent: false }); },
      },
      on: function () {},
      getStorage: function () { return Promise.resolve({ getItem: function () {}, setItem: function () {} }); },
    });
  },
};
