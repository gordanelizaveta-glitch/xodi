// js/stats.js
(function () {
  const KEY = 'solitaire-stats-v1';

  function safeParse(raw, fallback) {
    try { return JSON.parse(raw); } catch (e) { return fallback; }
  }

  function dayKey(d = new Date()) {
    // локальный календарный день игрока
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  }

  function defaultState() {
    return {
      totals: {
        gamesStarted: 0,
        wins: 0,
        abandons: 0
      },
      streaks: {
        win: 0,
        abandon: 0,
        winNoUndo: 0,
        gamesNoMenu: 0
      },
      play: {
        // серия "сыграть хотя бы одну игру N дней подряд" (не просто визит)
        streak: 0,
        lastDayKey: null
      },
      today: {
        key: dayKey(),
        wins: 0,
        gamesStarted: 0,
        firstWinHour: null
      },
      last: {
        abandonAtMs: null,
        playedAtMs: null
      },
      records: {
        bestWinSec: null,      // лучшее время победы в секундах
        bestWinUpdates: 0      // сколько раз улучшала рекорд (без первой фиксации)
      }
    };
  }

  function load() {
    const saved = safeParse(localStorage.getItem(KEY) || '{}', {});
    const s = { ...defaultState(), ...saved };

    // глубокая “подстраховка”, чтобы поля точно были
    s.totals = { ...defaultState().totals, ...(saved.totals || {}) };
    s.streaks = { ...defaultState().streaks, ...(saved.streaks || {}) };
    s.play = { ...defaultState().play, ...(saved.play || {}) };
    s.today = { ...defaultState().today, ...(saved.today || {}) };
    s.last = { ...defaultState().last, ...(saved.last || {}) };
    s.records = { ...defaultState().records, ...(saved.records || {}) };

    return s;
  }

  function save(state) {
    localStorage.setItem(KEY, JSON.stringify(state));
  }

  function ensureToday(state) {
    const k = dayKey();
    if (state.today.key !== k) {
      state.today.key = k;
      state.today.wins = 0;
      state.today.gamesStarted = 0;
      state.today.firstWinHour = null;
    }
  }

  // Экспорт
  window.Stats = {
    load,
    save,
    ensureToday,
    dayKey
  };
})();
