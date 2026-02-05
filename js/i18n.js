// js/i18n.js
// Minimal localization layer for platform games (VK / web).
// Uses window.APP.lang (set in platform.js) and falls back to browser language.

(function () {
  const dictionaries = {
    ru: {
      'menu.new_game': 'НОВАЯ ИГРА',
      'menu.tutorial': 'ОБУЧЕНИЕ',
      'menu.settings': 'НАСТРОЙКИ'
    }
    // Add other languages when you have translations, for example:
    // en: { 'menu.new_game': 'NEW GAME', 'menu.tutorial': 'TUTORIAL', 'menu.settings': 'SETTINGS' }
  };

  function getLang() {
    const raw = (window.APP && window.APP.lang) || (navigator.language || 'ru');
    return String(raw).slice(0, 2).toLowerCase();
  }

  function t(key) {
    const lang = getLang();
    const dict = dictionaries[lang] || dictionaries.ru || {};
    return dict[key] || (dictionaries.ru && dictionaries.ru[key]) || key;
  }

  window.APP = window.APP || {};
  window.APP.i18n = { t, getLang, dictionaries };
})();
