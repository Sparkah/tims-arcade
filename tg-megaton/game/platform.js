(function (global) {
  'use strict';

  function parentWindow() {
    try {
      return global.parent && global.parent !== global ? global.parent : null;
    } catch (e) {
      return null;
    }
  }

  function sharedValue(name) {
    try {
      if (global[name] != null) return global[name];
    } catch (e) {}
    var parent = parentWindow();
    try {
      return parent && parent[name] != null ? parent[name] : null;
    } catch (e) {
      return null;
    }
  }

  function post(message) {
    var parent = parentWindow();
    if (!parent || typeof parent.postMessage !== 'function') return false;
    try {
      parent.postMessage(message, '*');
      return true;
    } catch (e) {
      return false;
    }
  }

  function explicitPlatformId() {
    var configured = sharedValue('__GF_PLATFORM');
    if (configured) return String(configured).toLowerCase();
    try {
      var query = new URLSearchParams(global.location.search || '');
      var value = query.get('platform');
      if (value) return String(value).toLowerCase();
    } catch (e) {}
    return '';
  }

  function detectPlatformId() {
    var explicit = explicitPlatformId();
    if (explicit) return explicit;
    if (sharedValue('__tg')) return 'telegram';
    var telegram = sharedValue('Telegram');
    if (telegram && telegram.WebApp) return 'telegram';
    return 'web';
  }

  function isLocalHost() {
    try {
      return /^(localhost|127\.0\.0\.1|\[::1\]|::1)$/.test(global.location.hostname || '');
    } catch (e) {
      return false;
    }
  }

  function telegramBridge() {
    return sharedValue('__tg');
  }

  function languageHint() {
    try {
      var telegram = sharedValue('Telegram');
      var webApp = telegram && telegram.WebApp;
      var user = webApp && webApp.initDataUnsafe && webApp.initDataUnsafe.user;
      var code = String(user && user.language_code || '').toLowerCase();
      return code.indexOf('ru') === 0 ? 'ru' : '';
    } catch (e) {
      return '';
    }
  }

  function analyticsProgression(name, payload) {
    var analytics = sharedValue('__megatonAnalytics');
    if (!analytics || typeof analytics.progression !== 'function') return false;
    try {
      analytics.progression(name, payload);
      return true;
    } catch (e) {
      return false;
    }
  }

  function saveState(state) {
    var bridge = telegramBridge();
    if (!bridge || typeof bridge.saveState !== 'function') return false;
    try {
      return bridge.saveState(state) !== false;
    } catch (e) {
      return false;
    }
  }

  function buy(productId, currency, callback) {
    var bridge = telegramBridge();
    if (!bridge || typeof bridge.buy !== 'function') return null;
    return bridge.buy(productId, currency, callback);
  }

  function openSupport() {
    var bridge = telegramBridge();
    try {
      if (bridge && typeof bridge.openSupport === 'function') {
        bridge.openSupport();
        return true;
      }
    } catch (e) {}
    return post({ type: 'megaton_support' });
  }

  function skinById(id) {
    var lookup = sharedValue('__megatonSkinById');
    if (typeof lookup !== 'function') return null;
    try {
      return lookup(id) || null;
    } catch (e) {
      return null;
    }
  }

  function openMissions() {
    var open = sharedValue('__megatonOpenMissions');
    if (typeof open !== 'function') return false;
    try {
      open();
      return true;
    } catch (e) {
      return false;
    }
  }

  function openShop(tab, options) {
    var open = sharedValue('__megatonOpenShop');
    if (typeof open === 'function') {
      try {
        open(tab || 'boxes', options || null);
        return true;
      } catch (e) {}
    }
    return post({
      type: 'megaton_open_shop',
      tab: tab || 'boxes',
      tutorialClose: !!(options && options.tutorialClose)
    });
  }

  var adapter = global.MegatonPlatform || {};
  if (!adapter.id) adapter.id = detectPlatformId();
  if (adapter.id === 'yandex' && global.__GF_DISABLE_MEDIA_ELEMENT == null) global.__GF_DISABLE_MEDIA_ELEMENT = true;
  if (typeof adapter.allowsTestHooks !== 'function') adapter.allowsTestHooks = isLocalHost;
  if (typeof adapter.languageHint !== 'function') adapter.languageHint = languageHint;
  if (typeof adapter.languageChanged !== 'function') adapter.languageChanged = function (lang) { return post({ type: 'megaton_language', lang: lang }); };
  if (typeof adapter.analyticsProgression !== 'function') adapter.analyticsProgression = analyticsProgression;
  if (typeof adapter.saveState !== 'function') adapter.saveState = saveState;
  if (typeof adapter.buy !== 'function') adapter.buy = buy;
  if (typeof adapter.openSupport !== 'function') adapter.openSupport = openSupport;
  if (typeof adapter.skinById !== 'function') adapter.skinById = skinById;
  if (typeof adapter.openMissions !== 'function') adapter.openMissions = openMissions;
  if (typeof adapter.openShop !== 'function') adapter.openShop = openShop;
  global.MegatonPlatform = adapter;
})(window);
