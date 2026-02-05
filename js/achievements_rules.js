// js/achievements_rules.js
(function () {
  function unlock(id) {
    const ok = window.Storage && window.Storage.unlock ? window.Storage.unlock(id) : false;

    if (ok && typeof window.renderRewardsList === 'function') {
      window.renderRewardsList();
    }

    return ok;
  }

  function withState(fn) {
    const s = window.Stats.load();
    window.Stats.ensureToday(s);
    fn(s);
    window.Stats.save(s);
  }

  window.AchievementRules = {
    // вызывается в начале каждой новой игры (у тебя это уже дергается из GameScene.newGame)
    onStart(payload) {
      // 2: сыграть первую игру
      unlock(2);

      const now = Date.now();

      withState((s) => {
        // totals / today
        s.totals.gamesStarted = (s.totals.gamesStarted || 0) + 1;
        s.today.gamesStarted = (s.today.gamesStarted || 0) + 1;

        // 18-22: сыграть N игр всего
        const g = s.totals.gamesStarted || 0;
        if (g >= 20) unlock(18);
        if (g >= 50) unlock(19);
        if (g >= 100) unlock(20);
        if (g >= 150) unlock(21);
        if (g >= 300) unlock(22);

        // 26: начать новую игру в течение 10 секунд после поражения
        if (s.last?.abandonAtMs != null) {
          const dt = now - s.last.abandonAtMs;
          if (dt >= 0 && dt <= 10_000) unlock(26);
        }

        // 29/30/31: логика "играл по дням" и "долго не играл"
        // ВАЖНО: тут считаем именно дни, когда игрок НАЧАЛ игру (не просто открыл приложение)
        const todayKey = s.today.key;
        const lastPlayDay = s.play?.lastDayKey || null;

        if (lastPlayDay && lastPlayDay !== todayKey) {
          const lastDate = new Date(lastPlayDay + 'T00:00:00');
          const todayDate = new Date(todayKey + 'T00:00:00');
          const diffDays = Math.round((todayDate - lastDate) / 86400000);

          // 30: не играть 30 дней и затем снова сыграть
          if (diffDays >= 30) unlock(30);
          // 31: не играть 14 дней и затем снова сыграть
          if (diffDays >= 14) unlock(31);

          // 29: сыграть хотя бы одну игру 5 дней подряд
          if (diffDays === 1) s.play.streak = (s.play.streak || 0) + 1;
          else s.play.streak = 1;
        }

        // первый старт вообще
        if (!lastPlayDay) s.play.streak = 1;

        s.play.lastDayKey = todayKey;
        s.last.playedAtMs = now;

        if ((s.play.streak || 0) >= 5) unlock(29);

        // 37: 10 игр подряд без выхода в меню
        // (рестарт НЕ сбрасывает, сбрасывает только реальный выход в меню)
        s.streaks.gamesNoMenu = (s.streaks.gamesNoMenu || 0) + 1;
        if (s.streaks.gamesNoMenu >= 10) unlock(37);
      });

      try { window.dispatchEvent(new CustomEvent('stats:changed')); } catch (e) {}
    },

    onWin(payload) {
      unlock(2);
      unlock(3);

      const now = Date.now();
      const hour = new Date(now).getHours();

      withState((s) => {
        // totals / today wins
        s.totals.wins = (s.totals.wins || 0) + 1;

        // "первая победа дня" (35/36) - до увеличения today.wins
        if ((s.today.wins || 0) === 0) {
          s.today.firstWinHour = hour;
          if (hour >= 23) unlock(35);
          if (hour < 7) unlock(36);
        }

        s.today.wins = (s.today.wins || 0) + 1;

        // 10/11/12: победы за один календарный день
        const w = s.today.wins || 0;
        if (w >= 3) unlock(12);
        if (w >= 5) unlock(10);
        if (w >= 10) unlock(11);

        // 13/14: проигрышная серия -> потом победа
        if ((s.streaks?.abandon || 0) >= 1) unlock(13);
        if ((s.streaks?.abandon || 0) >= 3) unlock(14);

        // win streak
        s.streaks.win = (s.streaks.win || 0) + 1;
        s.streaks.abandon = 0;

        if (s.streaks.win >= 3) unlock(7);
        if (s.streaks.win >= 5) unlock(8);
        if (s.streaks.win >= 10) unlock(9);
      });

      // 17: выиграть, сделав не более 120 ходов
      const moves = payload?.moves ?? null;
      if (typeof moves === 'number' && moves <= 120) unlock(17);

      // --- отмены ---
      const undos = payload?.undos || 0;
      const isDraw3 = !!payload?.draw3;

      if (!isDraw3 && undos === 0) unlock(4);    // 1 карта, без отмен
      if (isDraw3 && undos === 0) unlock(16);    // 3 карты, без отмен
      if (undos === 1) unlock(25);               // ровно 1 отмена
      if (undos >= 5) unlock(32);
      if (undos >= 10) unlock(33);

      // --- серия побед без отмен (для 38) ---
      withState((s) => {
      if (undos === 0) {
      s.streaks.winNoUndo = (s.streaks.winNoUndo || 0) + 1;
      if (s.streaks.winNoUndo >= 3) unlock(38);
      } else {
       s.streaks.winNoUndo = 0;
      }
      });


      // --- время ---
      const t = payload?.durationSec;

      if (typeof t === 'number') {
        if (t <= 5 * 60) unlock(5);
        if (t <= 3 * 60) unlock(6);
        if (t >= 30 * 60) unlock(34);
        if (t === (4 * 60 + 56)) unlock(39);

        // личный рекорд + награды 23/24
        withState((s) => {
          if (!s.records) s.records = { bestWinSec: null, bestWinUpdates: 0 };
          const prev = s.records.bestWinSec;

          if (prev === null || prev === undefined) {
            s.records.bestWinSec = t;
            if (t < 5 * 60) unlock(24);
            return;
          }

          if (t < prev) {
            s.records.bestWinSec = t;
            s.records.bestWinUpdates = (s.records.bestWinUpdates || 0) + 1;

            if (t < 5 * 60) unlock(24);
            if ((s.records.bestWinUpdates || 0) >= 5) unlock(23);
          }
        });

        try { window.dispatchEvent(new CustomEvent('stats:changed')); } catch (e) {}
      }
    },

    onAbandon(payload) {
      unlock(2); // сыграть первую игру
      unlock(1); // проиграть первую игру

      const now = Date.now();

      withState((s) => {
        s.totals.abandons = (s.totals.abandons || 0) + 1;
        s.streaks.winNoUndo = 0;

        // серия проигрышей
        s.streaks.abandon = (s.streaks.abandon || 0) + 1;
        s.streaks.win = 0;
        s.streaks.winNoUndo = 0;

        if (s.streaks.abandon >= 10) unlock(15);

        // для 26 (быстрый старт после поражения)
        s.last.abandonAtMs = now;
      });

      try { window.dispatchEvent(new CustomEvent('stats:changed')); } catch (e) {}
    },

    // вызываем ТОЛЬКО когда игрок реально уходит в меню
    // (ты уточнила: рестарт НЕ считается выходом в меню)
    onExitToMenu() {
      withState((s) => {
        s.streaks.gamesNoMenu = 0;
      });
      try { window.dispatchEvent(new CustomEvent('stats:changed')); } catch (e) {}
    }
  };
})();
