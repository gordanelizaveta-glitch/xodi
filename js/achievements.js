// js/achievements.js
(function () {
  // 1) ДАННЫЕ НАГРАД
  // Перенеси сюда весь твой массив (как сейчас в index.html)
  // (я оставляю начало/конец, а ты вставишь целиком)
  const ACHIEVEMENTS = [
    { id: 1, title: 'АКЕЛА ПРОМАХНУЛСЯ', desc: 'Проиграть первую игру' },
    { id: 2, title: 'НА СТАРТ!', desc: 'Сыграть первую игру' },
     { id: 3,  title: 'ПЕРВАЯ ПОБЕДА', desc: 'Выиграть первую игру' },
  { id: 4,  title: 'ТАКТИЧЕСКИЙ ГЕНИЙ', desc: 'Выиграть игру без единой отмены хода в режиме 1 карта' },
  { id: 5,  title: 'ЭТО МНОГО ИЛИ МАЛО?', desc: 'Выиграть игру за 5 минут или быстрее' },
  { id: 6,  title: 'МОЛНИЕНОСНЫЙ УМ', desc: 'Выиграть игру за 3 минуты или быстрее' },
  { id: 7,  title: 'ХЕТ-ТРИК', desc: 'Выиграть 3 игры подряд' },
  { id: 8,  title: 'НА КУРАЖЕ', desc: 'Выиграть 5 игр подряд' },
  { id: 9,  title: 'ДОНТ СТАП МИ НАУ', desc: 'Выиграть 10 игр подряд' },
  { id: 10, title: 'САДИСЬ, ПЯТЬ', desc: 'Выиграть 5 игр за один календарный день' },
  { id: 11, title: 'ДЕСЯТЬ ОЧКОВ ГРИФФЕНДОРУ', desc: 'Выиграть 10 игр за один календарный день' },
  { id: 12, title: 'Я КАЛЕНДАРЬ ПЕРЕВЕРНУ', desc: 'Выиграть 3 игры за один календарный день' },
  { id: 13, title: 'ПОБЕЖДЕН, НО НЕ СЛОМЛЕН', desc: 'Проиграть игру и затем выиграть следующую' },
  { id: 14, title: 'ВОЛЯ К ПОБЕДЕ', desc: 'Проиграть 3 игры подряд и затем выиграть следующую' },
  { id: 15, title: 'УДАЧА В НЕУДАЧАХ', desc: 'Проиграть 10 игр подряд' },
  { id: 16, title: 'ЧИСТАЯ ПОБЕДА', desc: 'Выиграть игру без отмен хода в режиме 3 карты' },
  { id: 17, title: 'У МЕНЯ ЕСТЬ ПЛАН', desc: 'Выиграть игру, сделав не более 120 ходов' },
  { id: 18, title: 'СПРИНТЕР', desc: 'Сыграть 20 игр всего' },
  { id: 19, title: 'МАРАФОНЕЦ', desc: 'Сыграть 50 игр всего' },
  { id: 20, title: 'И ЕЩЕ ПО ПЯТЬДЕСЯТ', desc: 'Сыграть 100 игр всего' },
  { id: 21, title: 'ПОЛТОРАШКА', desc: 'Сыграть 150 игр всего' },
  { id: 22, title: 'ТРАКТОР', desc: 'Сыграть 300 игр всего' },
  { id: 23, title: 'ИГРА С САМИМ СОБОЮ', desc: 'Побить собственный рекорд по времени 5 раз' },
  { id: 24, title: 'НАБИРАЕМ ОБОРОТЫ', desc: 'Установить лучший личный результат по времени быстрее чем 5 минут' },
  { id: 25, title: 'БЕЗ ПАНИКИ', desc: 'Выиграть игру, использовав только 1 отмену' },
  { id: 26, title: 'ОТХОДЧИВЫЙ', desc: 'Начать новую игру в течение 10 секунд после поражения' },
  { id: 27, title: 'ПРИВЫЧКА ИГРАТЬ', desc: 'Заходить в игру 3 календарных дня подряд' },
  { id: 28, title: 'СЕВЕН ЭЛЕВЕН', desc: 'Заходить в игру 7 календарных дней подряд' },
  { id: 29, title: 'ВСЯ ЖИЗНЬ ИГРА', desc: 'Сыграть хотя бы одну игру 5 дней подряд' },
  { id: 30, title: 'БЛУДНЫЙ СЫН', desc: 'Не заходить в игру 30 дней и затем снова сыграть' },
  { id: 31, title: 'ОТПУСКНОЙ', desc: 'Не заходить в игру 14 дней и затем снова сыграть' },
  { id: 32, title: 'РАБОТА НАД ОШИБКАМИ', desc: 'Выиграть, использовав отмену хода не менее 5 раз за одну игру' },
  { id: 33, title: 'ЧИТТЕР', desc: 'Выиграть, использовав отмену хода 10 раз и более за одну игру' },
  { id: 34, title: 'ЧЕРЕПАШКА НИНДЗЯ', desc: 'Выиграть игру, играя дольше 30 минут' },
  { id: 35, title: 'ПОЛУНОЧНИК', desc: 'Выиграть первую игру дня после 23:00' },
  { id: 36, title: 'РАННЯЯ ПТАШКА', desc: 'Выиграть первую игру дня до 7:00' },
  { id: 37, title: 'НАСТОЙЧИВЫЙ', desc: 'Сыграть 10 игр подряд без выхода в меню' },
  { id: 38, title: 'БЕЗ ПРАВА НА ОШИБКУ', desc: 'Выиграть 3 игры подряд без отмен' },
  { id: 39, title: 'В СВОЕ ВРЕМЯ', desc: 'Выиграть игру ровно за 4 минуты 56 секунд' }
  ];

  window.ACHIEVEMENTS = ACHIEVEMENTS;

  // 2) ОТРИСОВКА СПИСКА
  function renderRewardsList() {
    const listEl = document.getElementById('rewards-list');
    if (!listEl) return;

    const unlocked = window.Storage ? window.Storage.getUnlockedSet() : new Set();

    const rows = ACHIEVEMENTS
     .filter(a => !a.hidden)
     .map(a => {
      const isOpen = unlocked.has(a.id);

      // пути как у тебя сейчас:
      const medalSrc = isOpen ? `./assets/revards/r${a.id}.png` : './assets/revards/nor.png';
      const cls = isOpen ? 'reward-row reward-open' : 'reward-row reward-locked';

      return `
        <div class="${cls}">
          <img class="reward-medal" src="${medalSrc}" alt="">
          <div class="reward-text">
            <div class="reward-title">${a.title}</div>
            <div class="reward-desc">${a.desc}</div>
          </div>
        </div>
      `;
    }).join('');

    listEl.innerHTML = rows;
  }

  // 3) ОТКРЫТЬ/ЗАКРЫТЬ ОВЕРЛЕЙ
  window.__rewardsPrevScene = null;

  window.openRewardsOverlay = function (sceneKey) {
    renderRewardsList();

    // ✅ считаем, что игрок увидел новые награды
    if (window.Storage && window.Storage.setHasNewAchievements) {
    window.Storage.setHasNewAchievements(false);
    try { window.dispatchEvent(new CustomEvent('achievements:new')); } catch (e) {}
}


    const overlay = document.getElementById('rewards-overlay');
    if (!overlay) return;

    overlay.classList.add('rewards-show');
    overlay.setAttribute('aria-hidden', 'false');

    // блокируем ввод Phaser
    if (window.__phaserGame && window.__phaserGame.input) {
      window.__phaserGame.input.enabled = false;
    }

    window.__rewardsPrevScene = sceneKey || null;
  };

  window.closeRewardsOverlay = function () {
    const overlay = document.getElementById('rewards-overlay');
    if (!overlay) return;

    overlay.classList.remove('rewards-show');
    overlay.setAttribute('aria-hidden', 'true');

    // возвращаем ввод Phaser
    if (window.__phaserGame && window.__phaserGame.input) {
      window.__phaserGame.input.enabled = true;
    }
  };

  // 4) КНОПКА "ДОМОЙ" НА ЭКРАНЕ НАГРАД
  document.addEventListener('DOMContentLoaded', () => {
    const homeBtn = document.getElementById('rewards-home');
    if (!homeBtn) return;

    homeBtn.addEventListener('click', () => {
      // звук клика через events (у тебя это уже сделано)
      try {
        if (window.__phaserGame) {
          window.__phaserGame.events?.emit('ui:click');
          const scenes = window.__phaserGame.scene?.getScenes(true) || [];
          const topScene = scenes[scenes.length - 1];
          topScene?.events?.emit('ui:click');
        }
      } catch (e) {}

      window.closeRewardsOverlay();

      try {
        window.__phaserGame?.scene?.start('MenuScene');
      } catch (e) {}
    });
  });
  
  window.renderRewardsList = renderRewardsList;

})();
