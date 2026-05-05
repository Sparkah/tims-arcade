// Stub Yandex Games SDK for the gallery host.
// Real games shipped to Yandex include this from /sdk.js on Yandex's CDN. When
// played here, we provide a minimal no-op so the boot fast-path runs immediately
// instead of waiting for the games' 3s SDK timeout fallback.
window.YaGames = {
  init: function () {
    return Promise.resolve({
      environment: { i18n: { lang: (navigator.language || 'en').slice(0, 2) } },
      features: { LoadingAPI: { ready: function () {} } },
      adv: {
        showFullscreenAdv: function () {},
        showRewardedVideo: function () {},
      },
      getStorage: function () { return Promise.resolve({ getItem: function () {}, setItem: function () {} }); },
    });
  },
};
