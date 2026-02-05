// js/storage.js
(function () {

    // Профиль сохранений: guest (по умолчанию) или platform
  let CURRENT_PROFILE = 'guest';

  function setProfile(profile) {
    CURRENT_PROFILE = profile || 'guest';
  }

  function getProfile() {
    return CURRENT_PROFILE;
  }

  // Собираем ключ с учетом профиля
  function key(k) {
    return `solitaire-${CURRENT_PROFILE}-${k}`;
  }

    // --- Редирект старых ключей на профильные ---
  (function patchLegacyLocalStorageKeys() {
    const _getItem = localStorage.getItem.bind(localStorage);
    const _setItem = localStorage.setItem.bind(localStorage);
    const _removeItem = localStorage.removeItem.bind(localStorage);

    function mapLegacyKey(k) {
      // старый общий ключ настроек -> новый профильный
      if (k === 'solitaire-settings') return key('settings');

      // (опционально) старый общий ключ статистики -> новый профильный
      if (k === 'solitaire-stats-v1') return key('stats-v1');
      

      return k;
    }

    localStorage.getItem = (k) => _getItem(mapLegacyKey(k));
    localStorage.setItem = (k, v) => _setItem(mapLegacyKey(k), v);
    localStorage.removeItem = (k) => _removeItem(mapLegacyKey(k));
  })();


    const KEY_SETTINGS = () => key('settings');
    const KEY_UNLOCKED = () => key('achievements-unlocked');
    const KEY_NEW = () => key('achievements-new');
    const KEY_SAVEGAME = () => key('save-v1');


  function hasNewAchievements() {
    return localStorage.getItem(KEY_NEW()) === '1';
}

function setHasNewAchievements(v) {
    localStorage.setItem(KEY_NEW(), v ? '1' : '0');
}



  function safeJsonParse(raw, fallback) {
    try {
      return JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }

  function getSettings() {
        const saved = safeJsonParse(localStorage.getItem(KEY_SETTINGS()) || '{}', {});
    return {
      musicOn: saved.musicOn !== undefined ? !!saved.musicOn : true,
      soundOn: saved.soundOn !== undefined ? !!saved.soundOn : true,
      draw3: saved.draw3 !== undefined ? !!saved.draw3 : false
    };
  }

  function saveSettings(partial) {
    const current = getSettings();
    const next = { ...current, ...partial };
    localStorage.setItem(KEY_SETTINGS(), JSON.stringify(next));

    return next;
  }

  function getUnlockedSet() {
    const raw = localStorage.getItem(KEY_UNLOCKED());
    const arr = safeJsonParse(raw || '[]', []);
    return new Set(Array.isArray(arr) ? arr : []);
  }

  function saveUnlockedSet(set) {
        localStorage.setItem(KEY_UNLOCKED(), JSON.stringify(Array.from(set)));
  }

  function isUnlocked(id) {
    return getUnlockedSet().has(id);
  }

  function unlock(id) {
    const set = getUnlockedSet();
    if (set.has(id)) return false;
    set.add(id);
    saveUnlockedSet(set);
    setHasNewAchievements(true);
    try {
    window.dispatchEvent(new CustomEvent('achievements:new'));
    } catch (e) {}
    return true;
  }

  function exportCloudData() {
  return {
    settings: safeJsonParse(localStorage.getItem(KEY_SETTINGS()) || '{}', {}),
    unlocked: safeJsonParse(localStorage.getItem(KEY_UNLOCKED()) || '[]', []),
    hasNewAchievements: localStorage.getItem(KEY_NEW()) === '1',
    savegame: safeJsonParse(localStorage.getItem(KEY_SAVEGAME()) || 'null', null),
    ts: Date.now()
  };
}

function applyCloudData(cloud) {
  if (!cloud || typeof cloud !== 'object') return;

  if (cloud.settings) {
    localStorage.setItem(KEY_SETTINGS(), JSON.stringify(cloud.settings));
  }

  if (Array.isArray(cloud.unlocked)) {
    localStorage.setItem(KEY_UNLOCKED(), JSON.stringify(cloud.unlocked));
  }

  if (typeof cloud.hasNewAchievements === 'boolean') {
    localStorage.setItem(KEY_NEW(), cloud.hasNewAchievements ? '1' : '0');
  }

    if (cloud.savegame !== undefined) {
    localStorage.setItem(KEY_SAVEGAME(), JSON.stringify(cloud.savegame));
  }

}

  // Экспортируем в window, чтобы было просто
  window.Storage = {
    setProfile,
    getProfile,
    getSettings,
    saveSettings,
    getUnlockedSet,
    isUnlocked,
    unlock,
    hasNewAchievements,
    setHasNewAchievements,
    exportCloudData,
    applyCloudData

  };
})();
