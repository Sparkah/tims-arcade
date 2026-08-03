const SUPPORTED_LANGS = new Set(['en', 'ru']);

export function createLanguageController({ game, platform, storage, locationRef }) {
  function queryLanguage() {
    try {
      const match = locationRef.search.match(/[?&]lang=(ru|en)\b/i);
      return match ? match[1].toLowerCase() : '';
    } catch (error) {
      return '';
    }
  }

  function platformLanguage() {
    try {
      return typeof platform.languageHint === 'function' ? platform.languageHint() : '';
    } catch (error) {
      return '';
    }
  }

  function storedLanguage() {
    try {
      const language = storage.getItem('megaton_lang');
      return SUPPORTED_LANGS.has(language) ? language : '';
    } catch (error) {
      return '';
    }
  }

  function set(language, manual = false) {
    game.lang = language === 'ru' ? 'ru' : 'en';
    try {
      storage.setItem('megaton_lang', game.lang);
      if (manual) storage.setItem('megaton_lang_manual', '1');
      if (manual && typeof platform.languageChanged === 'function') {
        platform.languageChanged(game.lang);
      }
    } catch (error) {}
    return game.lang;
  }

  function initialize() {
    let manual = false;
    try {
      manual = storage.getItem('megaton_lang_manual') === '1';
    } catch (error) {}
    return set(
      (manual && storedLanguage()) || storedLanguage() || queryLanguage() || platformLanguage() || 'en',
      false
    );
  }

  return Object.freeze({ initialize, set, storedLanguage });
}
