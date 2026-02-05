// js/app_visit.js
(function () {
  const KEY = 'solitaire-visit-v1';

  function dayKey(d = new Date()) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  }

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; }
  }

  function save(v) {
    localStorage.setItem(KEY, JSON.stringify(v));
  }

  window.AppVisit = {
    onOpen() {
      const v = load();
      const today = dayKey();
      const last = v.lastDayKey || null;

      // если первый запуск или новый день
      if (last !== today) {
        // серия визитов по дням
        if (v.lastDayKey) {
          // разница дней: грубо, но норм для начала (потом улучшим)
          const lastDate = new Date(v.lastDayKey + 'T00:00:00');
          const todayDate = new Date(today + 'T00:00:00');
          const diffDays = Math.round((todayDate - lastDate) / 86400000);

          if (diffDays === 1) v.visitStreak = (v.visitStreak || 0) + 1;
          else v.visitStreak = 1;
        } else {
          v.visitStreak = 1;
        }

        v.lastDayKey = today;
      }

      v.lastOpenAtMs = Date.now();
      save(v);

      // Награды за визиты: 27 (3 дня), 28 (7 дней)
      if (window.Storage) {
        if ((v.visitStreak || 0) >= 3) window.Storage.unlock(27);
        if ((v.visitStreak || 0) >= 7) window.Storage.unlock(28);
      }
    }
  };
})();
