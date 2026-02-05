// js/game_session.js
(function () {
  let current = null;

  function nowMs() { return Date.now(); }

  window.Session = {
    start(source, meta) {
      current = {
        id: String(nowMs()),
        startedAtMs: nowMs(),
        pausedAtMs: null,
        pausedTotalMs: 0,
        source: source || 'unknown',
        moves: 0,
        undos: 0,
        draw3: !!(meta && meta.draw3),
        ended: null // 'win' | 'abandon'
      };
      // На будущее: тут можно слать аналитику "game_start"
      // console.log('Session.start', current);
    },

    addMove() {
      if (!current || current.ended) return;
      current.moves += 1;
    },

    addUndo() {
      if (!current || current.ended) return;
      current.undos += 1;
    },

    win() {
      if (!current || current.ended) return null;
      current.ended = 'win';
      current.endedAtMs = nowMs();
      const payload = this.getPayload();
      // console.log('Session.win', payload);
      return payload;
    },

    abandon(reason) {
      if (!current || current.ended) return null;
      current.ended = 'abandon';
      current.abandonReason = reason || 'unknown';
      current.endedAtMs = nowMs();
      const payload = this.getPayload();
      // console.log('Session.abandon', payload);
      return payload;
    },

   pause() {
  if (!current || current.ended) return;
  if (current.pausedAtMs != null) return; // уже на паузе
  current.pausedAtMs = nowMs();
},

resume() {
  if (!current || current.ended) return;
  if (current.pausedAtMs == null) return; // не на паузе
  current.pausedTotalMs += (nowMs() - current.pausedAtMs);
  current.pausedAtMs = null;
},




    getPayload() {
      if (!current) return null;
       const endRaw = current.endedAtMs || (current.pausedAtMs || nowMs());
       const activeMs = Math.max(0, endRaw - current.startedAtMs - (current.pausedTotalMs || 0))
      return {
        id: current.id,
        source: current.source,
        ended: current.ended,
        abandonReason: current.abandonReason || null,
        durationSec: Math.round(activeMs / 1000),
        moves: current.moves,
        undos: current.undos,
        draw3: !!current.draw3
      };
    },

    isActive() {
      return !!current && !current.ended;
    }
  };
})();
