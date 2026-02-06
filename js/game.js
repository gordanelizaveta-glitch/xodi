// ===== DESIGN SIZES =====
const DESIGN_LANDSCAPE = { w: 1920, h: 1080 };
// ===== I18N  =====
(function () {
  window.APP = window.APP || {};

  function detectLang() {
    const fromApp = window.APP.lang;
    const fromPlatform = window.Platform && window.Platform.lang;
    const lang = (fromApp || fromPlatform || 'ru').toString().toLowerCase();

    return lang;
  }

  // store detected language (even if only ru is supported)
  window.APP.lang = window.APP.lang || detectLang();
  try { document.documentElement.lang = window.APP.lang; } catch (e) {}

  // minimal dictionary (extend later if you add more languages)
  const RU = {
    menu_new_game: 'НОВАЯ ИГРА',
    menu_tutorial: 'ОБУЧЕНИЕ',
    menu_settings: 'НАСТРОЙКИ'
  };

  if (!window.APP.i18n) {
    window.APP.i18n = {
      t: function (key) {
        // game supports only Russian сейчас; keep deterministic output
        return RU[key] || key;
      }
    };
  }
})();


// ===== CARD & PADDING (дизайн-значения) =====
const CARD_W = 90;
const CARD_H = 130;
const PADDING = 16;

// ===== WIN AUDIO VOLUMES =====
const WIN_MUSIC_VOLUME = 0.30;
const WIN_VOICE_VOLUME = 0.60;

// ===== ORIENTATION =====
function isPortrait(scene) {
  return false;
}

function getOrientation(scene) {
  return 'landscape';
}



// ===== SCALE (FIT) =====
function getFitScale(scene) {
  return Math.min(
    scene.scale.width / DESIGN_LANDSCAPE.w,
    scene.scale.height / DESIGN_LANDSCAPE.h
  );
}

function getLayout(scene) {
  const design = DESIGN_LANDSCAPE;

  const sw = scene.scale.width;
  const sh = scene.scale.height;

  const s = Math.min(sw / design.w, sh / design.h);
  const vw = design.w * s;
  const vh = design.h * s;

  const ox = (sw - vw) * 0.5;
  const oy = (sh - vh) * 0.5;

  return {
    DW: design.w,
    DH: design.h,
    s,
    ox,
    oy,
    vw,
    vh
  };
}

function dxy(L, x, y) {
  return { x: L.ox + x * L.s, y: L.oy + y * L.s };
}


// ===== UI ICON SIZE (через дизайн + масштаб) =====
function getUIIconSize(scene) {
  const scale = getFitScale(scene);

  // В портрете делаем базу больше, чтобы на телефоне иконки не были мелкими
  const baseDesign = 100;

  // +20% и масштаб
  const size = Math.round(baseDesign * 1.20 * scale);

  // поднимаем минималку, чтобы на мобилках не было "крошек"
  return Phaser.Math.Clamp(size, 78, 170);
}

function getScreenMode(scene) {
  
  const W = scene.scale.width;
  const H = scene.scale.height;

  const longSide = Math.max(W, H);
  const shortSide = Math.min(W, H);
  const aspect = longSide / shortSide;

  const orientation = 'landscape';
  const isSquare = aspect <= 1.25;

  // телефон: короткая сторона реально маленькая
  // 600 - безопасно: не заденет 1080/1920, но поймает реальные телефоны
  const isPhone = shortSide <= 600;

  return { W, H, shortSide, longSide, aspect, orientation, isSquare, isPhone };

}


// Увеличивает область нажатия (важно на мобилке) и фиксирует размер
// Увеличивает область нажатия и фиксирует размер (правильно для Phaser)
function applyRoundIcon(scene, img, sizePx, hitMul = 1.7) {
  // Визуальный размер на экране
  img.setDisplaySize(sizePx, sizePx);

  // hitArea задаем в ЛОКАЛЬНЫХ координатах (размеры текстуры)
  const w = img.width;
  const h = img.height;

  const cx = w * 0.5;
  const cy = h * 0.5;

  // Радиус в локальных единицах (масштаб учтется трансформом автоматически)
  const r = (Math.min(w, h) * 0.5) * hitMul;

  img.setInteractive(new Phaser.Geom.Circle(cx, cy, r), Phaser.Geom.Circle.Contains);

  // Сохраняем базовый scale для анимаций hover/press
  img._baseScaleX = img.scaleX;
  img._baseScaleY = img.scaleY;

  return img;
}


function readSettingsSafe() {
  // 1) Яндекс / внешний Storage
  try {
    if (
      window.Storage &&
      typeof window.Storage.getSettings === 'function'
    ) {
      const data = window.Storage.getSettings();
      return (data && typeof data === 'object') ? data : {};
    }
  } catch (e) {
    // игнорируем и идем дальше
  }

  // 2) localStorage (запасной вариант)
  try {
    const raw = localStorage.getItem('solitaire-settings');
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return (parsed && typeof parsed === 'object') ? parsed : {};
  } catch (e) {
    return {};
  }
}

function writeSettingsSafe(partial) {
  const current = readSettingsSafe();
  const next = { ...current, ...partial };

  // 1) Яндекс / внешний Storage
  try {
    if (
      window.Storage &&
      typeof window.Storage.saveSettings === 'function'
    ) {
      window.Storage.saveSettings(next);
      return next;
    }
  } catch (e) {
    // если упало - пробуем localStorage
  }

  // 2) localStorage (запасной вариант)
  try {
    localStorage.setItem(
      'solitaire-settings',
      JSON.stringify(next)
    );
  } catch (e) {
    // даже если не сохранилось - игру не роняем
  }

  return next;
}


const config = {
  type: Phaser.AUTO,
  parent: 'game-container',
  transparent: true,
backgroundColor: 'rgba(0,0,0,0)',

  scale: {
    mode: Phaser.Scale.NONE,
    autoCenter: Phaser.Scale.NO_CENTER,

    // базовый размер, дальше Phaser сам ресайзит
    width: 1920,
    height: 1080
  },
  scene: []
};


// ===== Rewards (HTML overlay) helpers =====
window.__rewardsPrevScene = null;

function getUnlockedSet() {
  try {
    const raw = localStorage.getItem('solitaire-achievements-unlocked');
    if (!raw) return new Set();

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();

    return new Set(parsed);
  } catch (e) {
    return new Set();
  }
}

class Boot extends Phaser.Scene {
  constructor() {
    super({ key: 'Boot' });
  }

  preload() {
    // Минимум, чтобы лоудер мог отрисоваться
    this.load.image('loader_bg', 'assets/backgrounds/loader.jpeg');
  }

  create() {

    // Все тяжелые ассеты грузим через LoadingScene
    this.scene.start('LoadingScene', {
      next: 'MenuScene',
      load: (loader) => {
        // Карты
        const suits = ['s', 'h', 'd', 'c'];
        const ranks = ['a','2','3','4','5','6','7','8','9','10','j','q','k'];

        for (let i = 0; i < suits.length; i++) {
          for (let j = 0; j < ranks.length; j++) {
            const key = `${ranks[j]}${suits[i]}`; // "as", "10h"
            loader.image(key, `assets/cards/faces/${key}.png`);
          }
        }

        // UI иконки
        loader.image('icon_home', 'assets/buttonmenuscene/bthome.png');
        loader.image('icon_undo', 'assets/buttonmenuscene/cdes.png');
        loader.image('icon_restart', 'assets/buttonmenuscene/restart.png');
        loader.image('icon_stats', 'assets/buttonmenuscene/btstats.png');
        loader.image('popup_stats_bg', 'assets/ui/popupstats.png');
        loader.image('popup_exit_icon', 'assets/buttonmenuscene/exiticon.png');
        loader.image('icon_rewards', 'assets/buttonmenuscene/rewik.png');

        // Звуки
        loader.audio('theme', 'assets/sounds/theme1.mp3');
        loader.audio('klikcard', 'assets/sounds/klikcard.mp3');
        loader.audio('klakcard', 'assets/sounds/klakcard.mp3');
        loader.audio('klats', 'assets/sounds/klats.mp3');
        loader.audio('winmusic', 'assets/sounds/winmusic.mp3');
        loader.audio('winvoice', 'assets/sounds/winvoice.mp3');
      }
    });
  }
}

class LoadingScene extends Phaser.Scene {
  constructor() {
    super('LoadingScene');

    this.nextKey = 'MenuScene';
    this.nextData = {};
    this.customLoad = null;

    this._onResize = null;
  }

  init(data) {
    this.nextKey = data?.next || 'MenuScene';
    this.nextData = data?.data || {};     // <-- ВАЖНО: пробрасываем data дальше
    this.customLoad = data?.load;
  }

  create() {
    const { width: w, height: h } = this.scale;

    // ФОН — ТОЛЬКО картинка
    const bg = this.add.image(w / 2, h / 2, 'loader_bg');
    this._cover(bg, w, h);

    // ПАРАМЕТРЫ ПОЛОСЫ
    const barW = Math.min(1200, w * 0.78);
    const barH = Math.max(90, Math.floor(h * 0.12));
    const x = (w - barW) / 2;
    const y = h * 0.58;

    const frameThickness = Math.max(6, Math.floor(barH * 0.08));
    const innerPad = frameThickness + Math.max(10, Math.floor(barH * 0.18));

    // РАМКА (белая)
    const frame = this.add.graphics();
    frame.lineStyle(frameThickness, 0xffffff, 1);
    frame.strokeRect(x, y, barW, barH);

    // ЗАЛИВКА (белый прямоугольник)
    const fill = this.add.rectangle(
      x + innerPad,
      y + innerPad,
      0,
      barH - innerPad * 2,
      0xffffff,
      1
    ).setOrigin(0, 0);

    // ТЕКСТ ПРОЦЕНТОВ ("2 0 %")
    const pctText = this.add.text(w / 2, y - barH * 0.55, '0 %', {
      fontFamily: 'Arial',
      fontSize: `${Math.max(36, Math.floor(barH * 0.55))}px`,
      color: '#ffffff'
    }).setOrigin(0.5);

    const setPercent = (p) => {
      const percent = Math.floor(p * 100);
      const spaced = String(percent).split('').join(' ');
      pctText.setText(`${spaced} %`);
    };

    // ПРОГРЕСС ЗАГРУЗКИ
    this.load.on('progress', (p) => {
      setPercent(p);
      const maxW = barW - innerPad * 2;
      fill.width = Math.floor(maxW * p);
    });

    const goNext = () => {
      this._cleanup();
       // важное: ассеты уже в кэше, теперь можно поднимать звук
  if (!this.scene.isActive('MusicScene')) this.scene.launch('MusicScene');
  if (!this.scene.isActive('SfxScene')) this.scene.launch('SfxScene');
      this.scene.start(this.nextKey, this.nextData); // <-- ВАЖНО: передаем nextData
    };

    this.load.once('complete', () => {
      setPercent(1);
      fill.width = barW - innerPad * 2;
      goNext();
    });

    // СТАВИМ АССЕТЫ В ОЧЕРЕДЬ
    if (typeof this.customLoad === 'function') {
      this.customLoad(this.load);

      // если очередь пустая, progress/complete могут не дать видимого эффекта
      // но это ок: load.start() отработает мгновенно
      this.load.start();
    } else {
      goNext();
    }
    
    this._onResize = () => {
  // пока грузим - НЕ перезапускаем сцену, иначе загрузка будет сбрасываться
  if (this.load && this.load.isLoading()) return;

  // если не грузим - можно перестроить UI (проще: рестарт)
  this.scene.restart({
    next: this.nextKey,
    data: this.nextData,
    load: this.customLoad
  });
};

this.scale.on('resize', this._onResize);


    this.scale.on('resize', this._onResize);

    // чтобы shutdown точно вызывался
    this.events.once('shutdown', this.shutdown, this);
    this.events.once('destroy', this.shutdown, this);
  }

  shutdown() {
    this._cleanup();
  }

  _cleanup() {
    this.load.off('progress');
    this.load.off('complete');

    if (this._onResize) {
      this.scale.off('resize', this._onResize);
      this._onResize = null;
    }
  }

  _cover(img, w, h) {
    // cover: без искажений, но может обрезать края
    const scale = Math.max(w / img.width, h / img.height);
    img.setScale(scale);
  }
}


function enqueueTutorialAssets(loader) {
  loader.image('tutorial_pic1', 'assets/tutorial/pic1.png');
  loader.image('tutorial_pic2', 'assets/tutorial/pic2.png');
  loader.image('tutorial_pic3', 'assets/tutorial/pic3.png');
  loader.image('tutorial_pic4', 'assets/tutorial/pic4.png');
  loader.image('tutorial_pic5', 'assets/tutorial/pic5.png');

  loader.image('btn_next', 'assets/buttonmenuscene/next.png');
  loader.image('btn_nextback', 'assets/buttonmenuscene/nextback.png');
}

// Заполни позже под GameScene, когда решишь что грузить перед входом в игру
function enqueueGameAssets(loader) {
  const tex = loader.textureManager;

  const ensureImage = (key, url) => {
    if (!tex.exists(key)) loader.image(key, url);
  };

  const ensureVideo = (key, url) => {
    // Phaser обычно сам не падает на дублях видео, но на всякий случай можно грузить всегда
    loader.video(key, url, 'loadeddata', false);
  };

  // background
  ensureImage('bggame', 'assets/backgrounds/bggame.png');

  // win popup
  ensureImage('winpopup_bg', 'assets/ui/winpopup.png');

  // buttons - New Game
  ensureImage('btn_ng_normal', 'assets/ui/normalngpopup.png');
  ensureImage('btn_ng_hover', 'assets/ui/hoverngpopup.png');
  ensureImage('btn_ng_pressed', 'assets/ui/pressedngpopup.png');

  // buttons - Main Menu
  ensureImage('btn_mm_normal', 'assets/ui/normalmmpopup.png');
  ensureImage('btn_mm_hover', 'assets/ui/hovermmpopup.png');
  ensureImage('btn_mm_pressed', 'assets/ui/pressedmmpopup.png');

  // stickers
  ensureImage('win_cool', 'assets/ui/cool.png');
  ensureImage('win_goodgirl', 'assets/ui/goodgirl.png');
  ensureImage('win_goodjob', 'assets/ui/goodjob.png');
  ensureImage('win_wow', 'assets/ui/wow.png');

  // card back
  ensureImage('card_back', 'assets/cards/back4.png');

  // faces (assets/cards/<rank><suit>.png)
  const suits = ['s', 'h', 'd', 'c'];
  const ranks = ['a', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'j', 'q', 'k'];
  for (const s of suits) {
    for (const r of ranks) {
      const key = `${r}${s}`;
      ensureImage(key, `assets/cards/${key}.png`);
    }
  }

  // buttons (some are already in Boot, but safe to keep)
  ensureImage('icon_home', 'assets/buttonmenuscene/bthome.png');
  ensureImage('icon_undo', 'assets/buttonmenuscene/cdes.png');
  ensureImage('icon_restart', 'assets/buttonmenuscene/restart.png');
  ensureImage('icon_settings', 'assets/buttonmenuscene/btsettings.png');

  // quick sound popup (in game)
  ensureImage('icon_sound', 'assets/buttonmenuscene/soundicon.png');
  ensureImage('popup_sounds_bg', 'assets/ui/popapsounds.png');
  ensureImage('popup_exit_icon', 'assets/buttonmenuscene/exiticon.png');

  // toggles (same as SettingsScene)
  ensureImage('tmdl_on', 'assets/ui/tmdlron.png');
  ensureImage('tmdl_off', 'assets/ui/tmdlroff.png');

  // win video
  ensureVideo('winvid', 'assets/backgrounds/winvid.mp4');
}

function enqueueSettingsAssets(loader) {
  loader.image('bg_settings1', 'assets/backgrounds/bgsettings1.png');
  loader.image('tmdl_on', 'assets/ui/tmdlron.png');
  loader.image('tmdl_off', 'assets/ui/tmdlroff.png');
  loader.image('draw1_off', 'assets/settings/1off.png');
  loader.image('draw1_on', 'assets/settings/1on.png');
  loader.image('draw3_off', 'assets/settings/3off.png');
  loader.image('draw3_on', 'assets/settings/3on.png');
  loader.image('icon_home', 'assets/buttonmenuscene/bthome.png');
}


class MenuScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MenuScene' });

    this.uiContainer = null;

    this.ui = {
      rewardsIcon: null,
      statsIcon: null,
      badge: null,
      footerText: null,
      onNewHandler: null,
      pulseTween: null
    };

    this.buttons = [];

    this.bgVideo = null;
    this._bgVideoKey = null;
    this._videoToken = 0;

    this._onResize = null;
    this._domResizeHandler = null;
    this._relayoutToken = 0;

    this._switching = false;

    this._statsPopupOpen = false;
    this._statsPopup = null;
  }

  preload() {
    this.load.image('btn_normal', 'assets/buttonmenuscene/Normal1.png');
    this.load.image('btn_hover', 'assets/buttonmenuscene/Hover1.png');
    this.load.image('btn_pressed', 'assets/buttonmenuscene/Pressed1.png');

    // Menu background video (Phaser Video, not DOM)
    this.load.video('menu_bg_vid', 'assets/backgrounds/bgvid1.mp4', 'loadeddata', false, true);
  }

  create() {
    this._switching = false;
    if (this.input) this.input.enabled = true;
  
// === AUTO RESUME (no UI change) ===
var hasSave = false;
if (window.SaveGame && window.SaveGame.load) {
  hasSave = !!window.SaveGame.load();
}

// если пользователь явно попросил меню - не делаем auto-resume
var forceMenu = false;
try { forceMenu = sessionStorage.getItem('force_menu') === '1'; } catch (e) {}

if (forceMenu) {
  try { sessionStorage.removeItem('force_menu'); } catch (e) {}
} else {
  var ctx = 'menu';
  try { ctx = sessionStorage.getItem('resume_context') || 'menu'; } catch (e) {}

  if (ctx === 'game_active' && hasSave) {
    this.safeStartWithLoader('GameScene', {}, enqueueGameAssets);
    return;
  }
}

    // фон + UI
    this.createBackgroundVideo();
    this.createUI();
    window.Platform?.gameReady?.();

    // на некоторых девайсах фон/размеры применяются с задержкой
    this.requestRelayout(true);

    // Phaser resize + fullscreen
    this._onResize = () => this.requestRelayout(true);
    this.scale.on('resize', this._onResize);
    this.scale.on('enterfullscreen', this._onResize);
    this.scale.on('leavefullscreen', this._onResize);

    // DOM resize (бывает полезно на Яндекс Играх)
    this._domResizeHandler = () => this.requestRelayout(true);
    window.addEventListener('resize', this._domResizeHandler);

    this.events.once('shutdown', this.shutdown, this);
    this.events.once('destroy', this.shutdown, this);
  }

  // Догоняющий релэйаут: чтобы при "квадрат -> фуллскрин" UI не зависал
  requestRelayout(forceVideo = true) {
    if (this._switching) return;

    const token = ++this._relayoutToken;

    const doIt = () => {
      if (!this.sys || !this.sys.isActive()) return;
      if (this._switching) return;
      if (token !== this._relayoutToken) return;

      if (forceVideo) this.createBackgroundVideo(true);
      this.relayout();
    };

    this.time.delayedCall(0, doIt);
    this.time.delayedCall(60, doIt);
    this.time.delayedCall(180, doIt);
  }

  // Переход без лоудера (оставил на всякий случай)
  safeStartScene(key, data) {
    if (this._switching) return;
    this._switching = true;

    if (this.input) this.input.enabled = false;

    const list = (this.children && this.children.list) ? this.children.list : [];
    for (let i = 0; i < list.length; i++) {
      const obj = list[i];
      if (!obj) continue;

      if (obj.input) {
        try { obj.disableInteractive(); } catch (e) {}
      }
      if (typeof obj.removeAllListeners === 'function') {
        try { obj.removeAllListeners(); } catch (e) {}
      }
    }

    this.events.once(Phaser.Scenes.Events.POST_UPDATE, () => {
      this.scene.start(key, data);
    });
  }

  // Переход через LoadingScene (лоудер между сценами)
safeStartWithLoader(nextKey, nextData, enqueueFn) {
  if (this._switching) return;
  this._switching = true;

  if (this.input) this.input.enabled = false;

  const list = (this.children && this.children.list) ? this.children.list : [];
  for (let i = 0; i < list.length; i++) {
    const obj = list[i];
    if (!obj) continue;

    if (obj.input) {
      try { obj.disableInteractive(); } catch (e) {}
    }
    if (typeof obj.removeAllListeners === 'function') {
      try { obj.removeAllListeners(); } catch (e) {}
    }
  }

  // Даем браузеру кадр, чтобы все "успокоилось" и лоадер появился сразу
  requestAnimationFrame(() => {
    // и еще один микрокадр на всякий случай (на мобилках это реально помогает)
    requestAnimationFrame(() => {
      this.scene.start('LoadingScene', {
        next: nextKey,
        data: nextData || {},
        load: (loader) => {
          if (typeof enqueueFn === 'function') enqueueFn(loader);
        }
      });
    });
  });
}

  // ---------- background video (DOM) ----------


  createBackgroundVideo(forceRecreate = false) {
    const w = this.scale.width;
    const h = this.scale.height;

    if (this.bgVideo) {
      try { this.bgVideo.stop(); } catch (e) {}
      this.bgVideo.destroy();
      this.bgVideo = null;
    }

    // Video is rendered by Phaser (inside canvas), not added to DOM.
    this.bgVideo = this.add.video(w / 2, h / 2, 'menu_bg_vid');
    this.bgVideo.setOrigin(0.5, 0.5);
    this.bgVideo.setDepth(-1000);

    // cover screen
    this.bgVideo.setDisplaySize(w, h);

    // autoplay loop (ignore autoplay errors silently)
    try { this.bgVideo.setLoop(true); } catch (e) {}
    try { this.bgVideo.play(true); } catch (e) {}
  }

  // ---------- UI ----------
  createUI() {
  this.destroyButtons();

  // очистка старых обработчиков наград
  if (this.ui && this.ui.onNewHandler) {
    try { window.removeEventListener('achievements:new', this.ui.onNewHandler); } catch (e) {}
    this.ui.onNewHandler = null;
  }
  if (this.ui && this.ui.pulseTween) {
    try { this.ui.pulseTween.stop(); } catch (e) {}
    this.ui.pulseTween = null;
  }

  if (this.ui && this.ui.badge) { try { this.ui.badge.destroy(); } catch (e) {} this.ui.badge = null; }
  if (this.ui && this.ui.rewardsIcon) { try { this.ui.rewardsIcon.destroy(); } catch (e) {} this.ui.rewardsIcon = null; }
  if (this.ui && this.ui.statsIcon) { try { this.ui.statsIcon.destroy(); } catch (e) {} this.ui.statsIcon = null; }

  const W = this.scale.width;
  const H = this.scale.height;
  const cx = this.cameras.main.centerX;

  const isSmallScreen = (Math.min(W, H) <= 600);

  // "квадратность"
  const aspect = Math.max(W, H) / Math.min(W, H);
  const isSquarish = (aspect <= 1.25);
  const useVerticalButtons = isSquarish;

  const L = getLayout(this);

  const minSide = Math.min(W, H);
  const S = minSide;

  const isMobile = this.sys.game.device.os.android || this.sys.game.device.os.iOS;

  let btnScale = Phaser.Math.Clamp(S / 900, 0.55, 0.80);
  if (isMobile && isSmallScreen) btnScale = Phaser.Math.Clamp(S / 820, 0.70, 0.95);
  if (isSquarish) btnScale *= 1.05;

  const menuBtnMul = 1.25; // сделай 1.15 / 1.25 / 1.35 как нравится
const menuBtnScale = btnScale * menuBtnMul;


  // ---------- 3 кнопки ----------
  const t = (k, fallback) =>
    (window.APP && window.APP.i18n && window.APP.i18n.t ? window.APP.i18n.t(k) : fallback);

  if (useVerticalButtons) {
    const spacingBase = isSquarish ? 200 : 80;
    const spacing = Math.round(spacingBase * L.s);

    let startY = Math.round(H * 0.66);

    const bottomLimit = Math.round(H * 0.88);
    const lastY = startY + spacing * 2;
    if (lastY > bottomLimit) startY -= (lastY - bottomLimit);

    const topLimit = Math.round(H * 0.34);
    if (startY < topLimit) startY = topLimit;

    this.createButton(cx, startY, t('menu.new_game', 'НОВАЯ ИГРА'), () => {
      if (window.SaveGame && window.SaveGame.clear) window.SaveGame.clear();

      // НЕ показываем рекламу на первую партию за запуск
      if (!window.__ad_skip_first_party_done) {
        window.__ad_skip_first_party_done = true;
        this.safeStartWithLoader('GameScene', {}, enqueueGameAssets);
        return;
      }

      if (this.input) this.input.enabled = false;

      const doStart = () => {
        if (this.input) this.input.enabled = true;
        this.safeStartWithLoader('GameScene', {}, enqueueGameAssets);
      };

      if (window.Platform && typeof window.Platform.showInterstitial === 'function') {
        window.Platform.showInterstitial('party_start').finally(doStart);
      } else {
        doStart();
      }
    }, menuBtnScale);


    this.createButton(cx, startY + spacing, t('menu.tutorial', 'ОБУЧЕНИЕ'), () => {
      this.safeStartWithLoader('TutorialScene', { index: 0 }, enqueueTutorialAssets);
    }, menuBtnScale);


    this.createButton(cx, startY + spacing * 2, t('menu.settings', 'НАСТРОЙКИ'), () => {
      this.safeStartWithLoader('SettingsScene', {}, enqueueSettingsAssets);
    }, menuBtnScale);

  } else {
    const spacingX = Math.round(Phaser.Math.Clamp(W * 0.28, 260, 420));

    let y = Math.round(H * 0.70);
    if (y > Math.round(H * 0.82)) y = Math.round(H * 0.78);

    this.createButton(cx - spacingX, y, t('menu.tutorial', 'ОБУЧЕНИЕ'), () => {
      this.safeStartWithLoader('TutorialScene', { index: 0 }, enqueueTutorialAssets);
    }, btnScale);

    this.createButton(cx, y, t('menu.new_game', 'НОВАЯ ИГРА'), () => {
      if (window.SaveGame && window.SaveGame.clear) window.SaveGame.clear();

      // НЕ показываем рекламу на первую партию за запуск
      if (!window.__ad_skip_first_party_done) {
        window.__ad_skip_first_party_done = true;
        this.safeStartWithLoader('GameScene', {}, enqueueGameAssets);
        return;
      }

      if (this.input) this.input.enabled = false;

      const doStart = () => {
        if (this.input) this.input.enabled = true;
        this.safeStartWithLoader('GameScene', {}, enqueueGameAssets);
      };

      if (window.Platform && typeof window.Platform.showInterstitial === 'function') {
        window.Platform.showInterstitial('party_start').finally(doStart);
      } else {
        doStart();
      }
    }, btnScale);

    this.createButton(cx + spacingX, y, t('menu.settings', 'НАСТРОЙКИ'), () => {
      this.safeStartWithLoader('SettingsScene', {}, enqueueSettingsAssets);
    }, btnScale);
  }

  // ---------- Иконки "Награды" и "Статистика" ----------
  const iconSize = getUIIconSize(this);

  let xDesign, yDesign;
  if (isSquarish) {
    const padX = Math.round(Phaser.Math.Clamp(L.DW * 0.06, 40, 70));
    const padY = 480;
    xDesign = L.DW - padX;
    yDesign = padY;
  } else {
    const padX = 92;
    const padY = 92;
    xDesign = L.DW - padX;
    yDesign = padY;
  }

  const p = dxy(L, xDesign, yDesign);

  const rewardsIcon = this.add.image(p.x, p.y, 'icon_rewards')
    .setOrigin(0.5)
    .setDepth(50)
    .setScrollFactor(0);

  applyRoundIcon(this, rewardsIcon, iconSize, 1.35);
  rewardsIcon.input.useHandCursor = true;
  this.ui.rewardsIcon = rewardsIcon;

  let restScale = rewardsIcon._baseScale || rewardsIcon.scale;

  const badgeR = Math.round(iconSize * 0.14);
  const badge = this.add.circle(
    rewardsIcon.x + Math.round(iconSize * 0.40),
    rewardsIcon.y - Math.round(iconSize * 0.34),
    badgeR,
    0xB93A3A
  )
    .setDepth(60)
    .setScrollFactor(0)
    .setVisible(false);

  this.ui.badge = badge;

  let pulseTween = null;
  let isHovering = false;

  const stopPulse = () => {
    if (pulseTween) {
      pulseTween.stop();
      pulseTween = null;
    }
    this.ui.pulseTween = null;
  };

  const startPulse = () => {
    if (isHovering) return;

    stopPulse();
    this.tweens.killTweensOf(rewardsIcon);
    rewardsIcon.setScale(restScale);

    pulseTween = this.tweens.add({
      targets: rewardsIcon,
      scale: restScale * 1.08,
      duration: 520,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    this.ui.pulseTween = pulseTween;
  };

  const applyRest = () => {
    stopPulse();
    this.tweens.killTweensOf(rewardsIcon);
    rewardsIcon.setScale(restScale);
  };

  const updateBadgeAndPulse = () => {
    const hasNew = (window.Storage && typeof window.Storage.hasNewAchievements === 'function')
      ? window.Storage.hasNewAchievements()
      : false;

    badge.setVisible(!!hasNew);
    if (hasNew) startPulse();
    else applyRest();
  };

  updateBadgeAndPulse();

  const onNew = () => {
    restScale = rewardsIcon.scale;
    updateBadgeAndPulse();
  };
  this.ui.onNewHandler = onNew;
  window.addEventListener('achievements:new', onNew);

  this.events.once('shutdown', () => {
    if (this.ui && this.ui.onNewHandler) {
      try { window.removeEventListener('achievements:new', this.ui.onNewHandler); } catch (e) {}
      this.ui.onNewHandler = null;
    }
    stopPulse();
  });

  rewardsIcon.on('pointerup', () => {
    this.game.events.emit('ui:click');
    window.openRewardsOverlay('MenuScene');
  });

  rewardsIcon.on('pointerover', () => {
    isHovering = true;
    stopPulse();
    this.tweens.killTweensOf(rewardsIcon);
    this.tweens.add({
      targets: rewardsIcon,
      scale: restScale * 1.08,
      duration: 140,
      ease: 'Power1'
    });
  });

  rewardsIcon.on('pointerout', () => {
    isHovering = false;
    this.tweens.killTweensOf(rewardsIcon);
    this.tweens.add({
      targets: rewardsIcon,
      scale: restScale,
      duration: 140,
      ease: 'Power1',
      onComplete: () => updateBadgeAndPulse()
    });
  });

  rewardsIcon.on('pointerdown', () => {
    this.game.events.emit('ui:click');
    stopPulse();
    this.tweens.killTweensOf(rewardsIcon);
    this.tweens.add({
      targets: rewardsIcon,
      scale: restScale * 0.92,
      duration: 90,
      ease: 'Power1'
    });
  });

  // Статистика под наградами
  const gap = isSmallScreen ? 1.10 : 1.25;
  const statsY = rewardsIcon.y + Math.round(iconSize * gap);

  const statsIcon = this.add.image(rewardsIcon.x, statsY, 'icon_stats')
    .setOrigin(0.5)
    .setDepth(50)
    .setScrollFactor(0);

  applyRoundIcon(this, statsIcon, iconSize, 1.35);
  statsIcon.input.useHandCursor = true;
  this.ui.statsIcon = statsIcon;

  const statsRestScale = statsIcon.scale;

  statsIcon.on('pointerup', () => {
    this.game.events.emit('ui:click');
    try { sessionStorage.setItem('skip_auto_resume', '1'); } catch (e) {}
    this.openStatsPopup();
  });

  statsIcon.on('pointerover', () => {
    this.tweens.killTweensOf(statsIcon);
    this.tweens.add({ targets: statsIcon, scale: statsRestScale * 1.08, duration: 140, ease: 'Power1' });
  });

  statsIcon.on('pointerout', () => {
    this.tweens.killTweensOf(statsIcon);
    this.tweens.add({ targets: statsIcon, scale: statsRestScale, duration: 140, ease: 'Power1' });
  });

  statsIcon.on('pointerdown', () => {
    this.game.events.emit('ui:click');
    this.tweens.killTweensOf(statsIcon);
    this.tweens.add({ targets: statsIcon, scale: statsRestScale * 0.92, duration: 90, ease: 'Power1' });
  });
}

  openStatsPopup() {
    if (this._statsPopupOpen) return;
    this._statsPopupOpen = true;

    const W = this.scale.width;
    const H = this.scale.height;

    const overlay = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.15)
      .setDepth(98000)
      .setInteractive();

    const container = this.add.container(W / 2, H / 2).setDepth(99000);

    const bg = this.add.image(0, 0, 'popup_stats_bg').setOrigin(0.5);
    const targetW = Math.min(W * 0.80, 720);
    const src = bg.texture.getSourceImage();
    const s = targetW / (src.width || 1);
    bg.setScale(s);
    container.add(bg);

    const color = '#4FA341';

    const bestTimeText = this.add.text(0, -bg.displayHeight * 0.22, '00:00', {
      fontFamily: '"Cygre ExtraBold", Arial, sans-serif',
      fontSize: Math.round(bg.displayHeight * 0.10) + 'px',
      color
    }).setOrigin(0.5);

    const rewardsText = this.add.text(0, bg.displayHeight * 0.10, '0/0', {
      fontFamily: '"Cygre ExtraBold", Arial, sans-serif',
      fontSize: Math.round(bg.displayHeight * 0.09) + 'px',
      color
    }).setOrigin(0.5);

    container.add(bestTimeText);
    container.add(rewardsText);

    const closeBtn = this.add.image(
      bg.displayWidth * 0.42,
      -bg.displayHeight * 0.44,
      'popup_exit_icon'
    ).setOrigin(0.5).setInteractive({ useHandCursor: true });

    const closeTargetW = bg.displayWidth * 0.12;
    const closeSrc = closeBtn.texture.getSourceImage();
    closeBtn.setScale(closeTargetW / (closeSrc.width || 1));

    const cx = closeBtn.scaleX;
    const cy = closeBtn.scaleY;

    closeBtn.on('pointerover', () => {
      this.tweens.killTweensOf(closeBtn);
      this.tweens.add({ targets: closeBtn, scaleX: cx * 1.08, scaleY: cy * 1.08, duration: 140, ease: 'Power1' });
    });

    closeBtn.on('pointerout', () => {
      this.tweens.killTweensOf(closeBtn);
      this.tweens.add({ targets: closeBtn, scaleX: cx, scaleY: cy, duration: 140, ease: 'Power1' });
    });

    closeBtn.on('pointerdown', () => {
      this.game.events.emit('ui:click');
      this.tweens.killTweensOf(closeBtn);
      this.tweens.add({ targets: closeBtn, scaleX: cx * 0.92, scaleY: cy * 0.92, duration: 90, ease: 'Power1' });
    });

    closeBtn.on('pointerup', () => {
      this.game.events.emit('ui:click');
      this.closeStatsPopup();
    });

    container.add(closeBtn);

    const fmt = (sec) => {
      if (typeof sec !== 'number') return '00:00';
      const m = Math.floor(sec / 60);
      const ss = sec % 60;
      return String(m).padStart(2, '0') + ':' + String(ss).padStart(2, '0');
    };

    const update = () => {
      const s = window.Stats?.load ? window.Stats.load() : null;
      const best = s?.records?.bestWinSec ?? null;
      bestTimeText.setText(fmt(best));

      const got = window.Storage?.getUnlockedSet ? window.Storage.getUnlockedSet().size : 0;
      const total = window.ACHIEVEMENTS ? window.ACHIEVEMENTS.length : 0;
      rewardsText.setText(`${got}/${total}`);
    };

    update();

    const onChanged = () => update();
    window.addEventListener('stats:changed', onChanged);
    window.addEventListener('achievements:new', onChanged);

    this._statsPopup = { overlay, container, onChanged };

    overlay.on('pointerdown', () => {
      this.game.events.emit('ui:click');
      this.closeStatsPopup();
    });
  }

  closeStatsPopup() {
    if (!this._statsPopupOpen) return;
    this._statsPopupOpen = false;

    const p = this._statsPopup;
    if (p?.onChanged) {
      window.removeEventListener('stats:changed', p.onChanged);
      window.removeEventListener('achievements:new', p.onChanged);
    }

    p?.overlay?.destroy();
    p?.container?.destroy();

    this._statsPopup = null;
  }

  createButton(x, y, label, callback, scale = 1) {
    const baseScale = scale;

    const btn = this.add.image(x, y, 'btn_normal')
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .setDepth(10);

    btn.setScale(baseScale);

    const txt = this.add.text(x, y - 6, label, {
      fontSize: '22px',
      color: '#FF8B16',
      fontFamily: 'Cygre ExtraBold'
    }).setOrigin(0.5).setDepth(10);

    txt.setScale(baseScale);

    let pressed = false;

    const killTweens = () => this.tweens.killTweensOf(btn);

    btn.on('pointerover', () => {
      if (pressed || this._switching) return;
      killTweens();
      btn.setTexture('btn_hover');
      this.tweens.add({ targets: btn, scale: baseScale * 1.05, duration: 100, ease: 'Power1' });
    });

    btn.on('pointerout', () => {
      if (pressed || this._switching) return;
      killTweens();
      btn.setTexture('btn_normal');
      this.tweens.add({ targets: btn, scale: baseScale, duration: 100, ease: 'Power1' });
    });

    btn.on('pointerdown', () => {
      this.game.events.emit('ui:click');
      if (this._switching) return;
      pressed = true;
      killTweens();
      btn.setTexture('btn_pressed');
      this.tweens.add({ targets: btn, scale: baseScale * 0.95, duration: 80, ease: 'Power1' });
    });

    btn.on('pointerupoutside', () => {
      if (this._switching) return;
      pressed = false;
      killTweens();
      btn.setTexture('btn_normal');
      this.tweens.add({ targets: btn, scale: baseScale, duration: 80, ease: 'Power1' });
    });

    btn.on('pointerup', () => {
      if (this._switching) return;
      if (!pressed) return;
      pressed = false;

      if (btn.input) btn.disableInteractive();
      btn.removeAllListeners();

      killTweens();
      this.tweens.add({
        targets: btn,
        scale: baseScale,
        duration: 60,
        ease: 'Power1',
        onComplete: () => {
          callback && callback();
        }
      });
    });

    this.buttons.push({ btn, txt });
  }

  destroyButtons() {
    if (this.buttons && this.buttons.length) {
      this.buttons.forEach(b => {
        if (b.btn) {
          this.tweens.killTweensOf(b.btn);
          if (b.btn.input) b.btn.disableInteractive();
          b.btn.removeAllListeners();
          b.btn.destroy();
        }
        if (b.txt) {
          this.tweens.killTweensOf(b.txt);
          b.txt.destroy();
        }
      });
    }
    this.buttons = [];

    if (this.footerText) {
      this.footerText.destroy();
      this.footerText = null;
    }
  }

  relayout() {
    this.createBackgroundVideo(true);
    this.createUI();
  }

  shutdown() {
    if (this._onResize) {
      this.scale.off('resize', this._onResize);
      this.scale.off('enterfullscreen', this._onResize);
      this.scale.off('leavefullscreen', this._onResize);
      this._onResize = null;
    }

    if (this._domResizeHandler) {
      window.removeEventListener('resize', this._domResizeHandler);
      this._domResizeHandler = null;
    }

    this.destroyButtons();

    // выключаем DOM видео, чтобы не висело поверх других сцен

    // стопаем твины этой сцены
    this.tweens.getAllTweens().forEach(t => t.stop());
  }
}

class TutorialScene extends Phaser.Scene {
  constructor() {
    super({ key: 'TutorialScene' });

    this.index = 0;
    this.total = 5;

    this.bg = null;
    this.homeBtn = null;
    this.backBtn = null;
    this.nextBtn = null;

    this._onResize = null;
  }

  init(data) {
    this.index = (data && typeof data.index === 'number') ? data.index : 0;
  }

  create() {
    this.buildTutorial();

    this._onResize = () => this.buildTutorial();
    this.scale.on('resize', this._onResize);

    this.events.once('shutdown', this.shutdown, this);
    this.events.once('destroy', this.shutdown, this);
  }

  shutdown() {
    if (this._onResize) {
      this.scale.off('resize', this._onResize);
      this._onResize = null;
    }
  }

  buildTutorial() {
    // чистим предыдущие элементы (важно при resize / повороте)
    this.children.removeAll(true);

    const iconSize = getUIIconSize(this);
    const W = this.scale.width;
    const H = this.scale.height;

    const cx = this.cameras.main.centerX;
    const cy = this.cameras.main.centerY;

    const i = this.index || 0;
    const isLast = i === this.total - 1;
    const isFirst = i === 0;

    const key = `tutorial_pic${i + 1}`;

    this.bg = this.add.image(cx, cy, key).setOrigin(0.5);
    // ВАЖНО: сохраняем пропорции (без растягивания в ширь)
// делаем почти "cover", но ограничиваем, чтобы не было заметных искажений
const src = this.bg.texture.getSourceImage();
const sx = W / (src.width || 1);
const sy = H / (src.height || 1);

// cover (чтобы закрыть экран без полос), но без заметного "пережатия"
let s = Math.max(sx, sy);

// если картинку пришлось бы растянуть слишком неравномерно, лучше взять contain
// это убирает заметное растягивание
const aspectScreen = W / H;
const aspectImg = (src.width || 1) / (src.height || 1);
const aspectDiff = Math.abs(Math.log(aspectScreen / aspectImg)); // 0 = совпадает

// порог можно крутить: 0.20-0.35 обычно норм
if (aspectDiff > 0.30) {
  s = Math.min(sx, sy); // contain
}

this.bg.setDisplaySize(
  Math.round((src.width || 1) * s),
  Math.round((src.height || 1) * s)
);


    // ===== параметры кнопок =====
    const padX = Math.round(W * 0.08);

// верхний отступ - для кнопки "Домой" (не меняем)
const topPadY = Math.round(H * 0.12);

// нижний отступ - для кнопок вперед/назад (в портрете поднимаем выше)
// нижний отступ - для кнопок вперед/назад
let bottomPadY = Math.round(H * 0.10);

// маленький экран + ЛАНДШАФТ: опускаем кнопки чуть ниже (ближе к низу)
const m = getScreenMode(this);

    const addHoverPress = (btn, baseScale) => {
      btn.on('pointerover', () => {
        this.tweens.killTweensOf(btn);
        this.tweens.add({ targets: btn, scale: baseScale * 1.08, duration: 140, ease: 'Power1' });
      });

      btn.on('pointerout', () => {
        this.tweens.killTweensOf(btn);
        this.tweens.add({ targets: btn, scale: baseScale, duration: 140, ease: 'Power1' });
      });

      btn.on('pointerdown', () => {
        this.game.events.emit('ui:click');
        this.tweens.killTweensOf(btn);
        this.tweens.add({ targets: btn, scale: baseScale * 0.92, duration: 90, ease: 'Power1' });
      });

      btn.on('pointerup', () => {
        const target = (btn.input && btn.input.over) ? baseScale * 1.08 : baseScale;
        this.tweens.killTweensOf(btn);
        this.tweens.add({ targets: btn, scale: target, duration: 120, ease: 'Power1' });
      });
    };

    // ===== Домой (сверху справа как у тебя сейчас) =====
    this.homeBtn = this.add.image(padX, topPadY, 'icon_home').setOrigin(0.5);
    applyRoundIcon(this, this.homeBtn, iconSize, 1.35);
    this.homeBtn.input.useHandCursor = true;

    addHoverPress(this.homeBtn, this.homeBtn._baseScale || this.homeBtn.scale);
    this.homeBtn.on('pointerup', () => {
  try { sessionStorage.setItem('skip_auto_resume', '1'); } catch (e) {}
  this.scene.start('MenuScene');
});


    // ===== Назад (если не первый) — снизу слева =====
    if (!isFirst) {
      this.backBtn = this.add.image(padX, H - bottomPadY, 'btn_nextback').setOrigin(0.5);
      applyRoundIcon(this, this.backBtn, iconSize, 1.35);
      this.backBtn.input.useHandCursor = true;

      addHoverPress(this.backBtn, this.backBtn._baseScale || this.backBtn.scale);
      this.backBtn.on('pointerup', () => this.scene.start('TutorialScene', { index: i - 1 }));
    }

    // ===== Вперед (если не последний) — снизу справа =====
    if (!isLast) {
      this.nextBtn = this.add.image(W - padX, H - bottomPadY, 'btn_next').setOrigin(0.5);
      applyRoundIcon(this, this.nextBtn, iconSize, 1.35);
      this.nextBtn.input.useHandCursor = true;

      addHoverPress(this.nextBtn, this.nextBtn._baseScale || this.nextBtn.scale);
      this.nextBtn.on('pointerup', () => this.scene.start('TutorialScene', { index: i + 1 }));
    }

    // ===== горячие клавиши =====
    // (важно: removeAll(true) выше сносит старые слушатели, поэтому тут можно навешивать заново)
    this.input.keyboard.on('keydown-LEFT', () => {
      if (this.index > 0) this.scene.start('TutorialScene', { index: this.index - 1 });
    });

    this.input.keyboard.on('keydown-RIGHT', () => {
      if (this.index < this.total - 1) this.scene.start('TutorialScene', { index: this.index + 1 });
    });
  }
}


class SettingsScene extends Phaser.Scene {
  constructor() {
    super({ key: 'SettingsScene' });

    this.winPopup = {
      overlay: null,
      container: null,
      bg: null,
      sticker: null,
      btnNewGame: null,
      btnMenu: null
    };

    this._onResize = null;
  }

 create() {
  // важные поля сцены
  this._onResize = null;

  const build = () => {
    // 1) чистим старое при ресайзе/повороте
    this.children.removeAll(true);
    if (this.input) {
      this.input.enabled = true;
      this.input.setTopOnly(true);
    }
    this.tweens.killAll();

    const iconSize = getUIIconSize(this);

    const W = this.scale.width;
    const H = this.scale.height;
    const S = Math.min(W, H);

    const cx = this.cameras.main.centerX;
    const cy = this.cameras.main.centerY;

    const aspect = Math.max(W, H) / Math.min(W, H); // всегда >= 1
    const isSquarish = (aspect <= 1.25);


    const dev = this.sys.game.device;
    const isMobile = !!(dev && dev.os && (dev.os.android || dev.os.iOS));

    // ===== ФОН =====
  
    const bgKey = 'bg_settings1';


    const bg = this.add.image(cx, cy, bgKey).setOrigin(0.5);

    // cover (без растяжения)
    {
      const src = bg.texture.getSourceImage();
      const iw = src.width || 1;
      const ih = src.height || 1;
      const sc = Math.max(W / iw, H / ih);
      bg.setDisplaySize(iw * sc, ih * sc);
      bg.setPosition(cx, cy);
    }

    // ===== настройки =====
    const saved = readSettingsSafe();
    this.musicOn = saved.musicOn !== undefined ? saved.musicOn : true;
    this.soundOn = saved.soundOn !== undefined ? saved.soundOn : true;
    this.draw3 = saved.draw3 !== undefined ? saved.draw3 : false;

    // ===== режим раскладки =====
    let layoutMode = isSquarish ? 'square' : 'landscape';

    // ===== размеры/позиции =====
    let toggleW, toggleMusicPos, toggleSoundPos;
    let drawBtnW, draw1Pos, draw3Pos;
    let homePos;

    if (layoutMode === 'landscape') {
      toggleW = W * 0.10;
      toggleMusicPos = { x: W * 0.62, y: H * 0.31 };
      toggleSoundPos = { x: W * 0.62, y: H * 0.48 };

      drawBtnW = W * 0.08;
      draw1Pos = { x: W * 0.35, y: H * 0.77 };
      draw3Pos = { x: W * 0.65, y: H * 0.77 };

      homePos = { x: W * 0.08, y: H * 0.85 };

    } else if (layoutMode === 'square') {
      toggleW = S * 0.20 * 0.95;
      toggleMusicPos = { x: W * 0.70, y: H * 0.32 };
      toggleSoundPos = { x: W * 0.70, y: H * 0.48 };

      drawBtnW = S * 0.13 * 0.95;
      draw1Pos = { x: W * 0.35, y: H * 0.765 };
      draw3Pos = { x: W * 0.65, y: H * 0.765 };

      homePos = { x: W * 0.10, y: H * 0.88 };

  drawBtnW = S * 0.11;

  // кнопки 1 и 3 ниже примерно на свою высоту
  const drawDown = drawBtnW * 1.0;

  draw1Pos = {
    x: W * 0.33,
    y: H * 0.625 + drawDown
  };

  draw3Pos = {
    x: W * 0.67,
    y: H * 0.625 + drawDown
  };

  homePos = {
    x: W * 0.12,
    y: H * 0.90
  };
}


    // --- helper: большая зона для удобных кликов ---
    const addBigZone = (x, y, w, h, onTap) => {
      const z = this.add.zone(x, y, w, h)
        .setOrigin(0.5)
        .setDepth(30000)
        .setInteractive({ useHandCursor: true });

      z.on('pointerdown', () => {
        this.game.events.emit('ui:click');
        if (onTap) onTap();
      });

      return z;
    };

    // =========================
    // ТУМБЛЕРЫ
    // =========================
    this.musicToggle = this.createImageToggle(
      toggleMusicPos.x,
      toggleMusicPos.y,
      toggleW,
      this.musicOn,
      (v) => {
        this.game.events.emit('ui:click');
        this.musicOn = v;
        this.game.events.emit('music:setEnabled', v);

        const s = JSON.parse(localStorage.getItem('solitaire-settings') || '{}');
        s.musicOn = v;
        localStorage.setItem('solitaire-settings', JSON.stringify(s));
      }
    );

    this.soundToggle = this.createImageToggle(
      toggleSoundPos.x,
      toggleSoundPos.y,
      toggleW,
      this.soundOn,
      (v) => {
        this.game.events.emit('ui:click');
        this.soundOn = v;
        this.game.events.emit('sfx:setEnabled', v);

        const s = JSON.parse(localStorage.getItem('solitaire-settings') || '{}');
        s.soundOn = v;
        localStorage.setItem('solitaire-settings', JSON.stringify(s));
      }
    );

    // =========================
    // ВЫБОР СДАЧИ: 1 или 3
    // =========================
    this.draw1Btn = this.createChoiceButton(
      draw1Pos.x,
      draw1Pos.y,
      drawBtnW,
      'draw1_on',
      'draw1_off',
      !this.draw3,
      () => this.setDrawMode(false)
    );

    this.draw3Btn = this.createChoiceButton(
      draw3Pos.x,
      draw3Pos.y,
      drawBtnW,
      'draw3_on',
      'draw3_off',
      this.draw3,
      () => this.setDrawMode(true)
    );

    // делаем зоны клика больше (не меняя картинки)
    const hitW = drawBtnW * 1.8;
    const hitH = drawBtnW * 1.2;
    addBigZone(draw1Pos.x, draw1Pos.y, hitW, hitH, () => this.setDrawMode(false));
    addBigZone(draw3Pos.x, draw3Pos.y, hitW, hitH, () => this.setDrawMode(true));

    this.draw1Btn.setDepth(20000);
    this.draw3Btn.setDepth(20000);

    // =========================
    // ДОМ
    // =========================
    this.homeBtn = this.add.image(homePos.x, homePos.y, 'icon_home').setOrigin(0.5);
    applyRoundIcon(this, this.homeBtn, iconSize, 2.35);
    this.homeBtn.setDepth(20000);

    // большая зона клика для домика
    addBigZone(homePos.x, homePos.y, iconSize * 1.8, iconSize * 1.8, () => {
      this.saveAndExit();
      this.scene.start('MenuScene');
    });

    // ВАЖНО: базовый scale берём не из замыкания (он устаревает на ресайзе),
    // а из текущего homeBtn.scaleX/scaleY
    const tweenHomeTo = (sx, sy, dur) => {
      this.tweens.killTweensOf(this.homeBtn);
      this.tweens.add({
        targets: this.homeBtn,
        scaleX: sx,
        scaleY: sy,
        duration: dur,
        ease: 'Power2'
      });
    };

    this.homeBtn.setInteractive({ useHandCursor: true });

    this.homeBtn.on('pointerover', () => {
      const sx = this.homeBtn.scaleX;
      const sy = this.homeBtn.scaleY;
      tweenHomeTo(sx * 1.06, sy * 1.06, 140);
    });

    this.homeBtn.on('pointerout', () => {
      // вернем к "базе" = текущей базе после build
      // тут важно: на pointerout возвращаем не к старым значениям, а к тем, что выставлены build-ом
      // поэтому просто пересчитаем базу как текущую "не-ховер" базу:
      // проще: сбросить к scale, которое было при build, храним его:
      const base = this._homeBase;
      if (base) tweenHomeTo(base.sx, base.sy, 120);
    });

    this.homeBtn.on('pointerdown', () => {
      this.game.events.emit('ui:click');
      const base = this._homeBase;
      if (!base) return;

      this.tweens.killTweensOf(this.homeBtn);
      this.tweens.add({
        targets: this.homeBtn,
        scaleX: base.sx * 0.92,
        scaleY: base.sy * 0.92,
        duration: 90,
        ease: 'Power2',
        yoyo: true,
        onComplete: () => {
          this.saveAndExit();
          this.scene.start('MenuScene');
        }
      });
    });

    // сохраняем базу домика после того как он создан/отмасштабирован
    this._homeBase = { sx: this.homeBtn.scaleX, sy: this.homeBtn.scaleY, angle: this.homeBtn.angle };
  };

  // 1) первый билд
  build();

  // 2) ресайз: просто билд заново
  this._onResize = () => build();
  this.scale.on('resize', this._onResize);

  // 3) уборка подписок
  this.events.once('shutdown', () => {
    if (this._onResize) this.scale.off('resize', this._onResize);
    this._onResize = null;
  });
  this.events.once('destroy', () => {
    if (this._onResize) this.scale.off('resize', this._onResize);
    this._onResize = null;
  });
}

  // ---------- helpers ----------

  createImageToggle(x, y, widthPx, initialOn, onChange) {
    const key = initialOn ? 'tmdl_on' : 'tmdl_off';

    const img = this.add.image(x, y, key)
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .setDepth(10000);

    // фиксируем ширину, высота по пропорциям
    const src = this.textures.get(key).getSourceImage();
    const scale = widthPx / (src.width || 1);
    img.setScale(scale);

    img.isOn = !!initialOn;

    img.on('pointerdown', () => {
      img.isOn = !img.isOn;
      img.setTexture(img.isOn ? 'tmdl_on' : 'tmdl_off');

      const newKey = img.isOn ? 'tmdl_on' : 'tmdl_off';
      const newSrc = this.textures.get(newKey).getSourceImage();
      img.setScale(widthPx / (newSrc.width || 1));

      if (onChange) onChange(img.isOn);
    });

    return img;
  }

  createChoiceButton(x, y, widthPx, keyOn, keyOff, isActive, onSelect) {
    const key = isActive ? keyOn : keyOff;

    const img = this.add.image(x, y, key)
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .setDepth(10000);

    // ширину фиксируем, высота по пропорциям
    const src = this.textures.get(key).getSourceImage();
    img.setScale(widthPx / src.width);

    // hover/press
    const baseSX = img.scaleX;
    const baseSY = img.scaleY;

    img.on('pointerover', () => {
      this.tweens.killTweensOf(img);
      this.tweens.add({
        targets: img,
        scaleX: baseSX * 1.04,
        scaleY: baseSY * 1.04,
        duration: 120,
        ease: 'Power2'
      });
    });

    img.on('pointerout', () => {
      this.tweens.killTweensOf(img);
      this.tweens.add({
        targets: img,
        scaleX: baseSX,
        scaleY: baseSY,
        duration: 120,
        ease: 'Power2'
      });
    });

    img.on('pointerdown', () => {
      this.game.events.emit('ui:click');
      this.tweens.killTweensOf(img);
      this.tweens.add({
        targets: img,
        scaleX: baseSX * 0.96,
        scaleY: baseSY * 0.96,
        duration: 80,
        ease: 'Power2',
        yoyo: true,
        onComplete: () => onSelect && onSelect()
      });
    });

    // чтобы можно было обновлять состояние
    img._keyOn = keyOn;
    img._keyOff = keyOff;
    img._widthPx = widthPx;
    img.setActiveState = (active) => {
      const newKey = active ? keyOn : keyOff;
      img.setTexture(newKey);
      const newSrc = this.textures.get(newKey).getSourceImage();
      const newScale = widthPx / newSrc.width;
      img.setScale(newScale);
    };

    return img;
  }

  setDrawMode(draw3Enabled) {
    this.draw3 = !!draw3Enabled;

    // обновляем обе кнопки (активна только одна)
    if (this.draw1Btn) this.draw1Btn.setActiveState(!this.draw3);
    if (this.draw3Btn) this.draw3Btn.setActiveState(this.draw3);
  }

  saveAndExit() {
    const data = {
      musicOn: this.musicOn,
      soundOn: this.soundOn,
      draw3: this.draw3
    };
    localStorage.setItem('solitaire-settings', JSON.stringify(data));
  }
}

class GameScene extends Phaser.Scene {
  constructor() {
  super({ key: 'GameScene' });

  // состояние партии
  this._isGameActive = false;      // true только во время активной партии

  // ===== UI таймер партии =====
  this.gameTimerText = null;
  this._gameTimerEvent = null;
  this._timerStartMs = 0;
  this._timerPausedAtMs = null;
  this._timerPausedTotalMs = 0;
  this._finalGameSec = null;       // итоговое время (сек), когда остановили
  this._lastWinSec = null;         // чтобы показать в win popup
  this._onVisibilityChange = null;

  // piles
  this.stock = [];
  this.waste = [];
  this.foundations = [[], [], [], []];
  this.tableau = [[], [], [], [], [], [], []];

  this.cards = new Map();

  // layout
  this.CARD_W = 90;
  this.CARD_H = 130;
  this.TABLEAU_STEP_DOWN = 18;
  this.TABLEAU_STEP_UP = 22;
  this.PADDING = 12;
  this.COL_GAP = 12;
  this.SLOT_INSET = 6;
  this.SLOT_LINE = 2;
  this.SLOT_RADIUS = 20;

  // positions
  this.pos = {
    topY: 0,
    tableauY: 0,
    stockX: 0,
    wasteX: 0,
    foundationX: [0, 0, 0, 0],
    tableauX: [0, 0, 0, 0, 0, 0, 0]
  };

  // settings
  this.draw3 = false;

  // drag state
  this.drag = null;

  // undo
  this.undoStack = [];

  // ui
  this.bg = null;
  this.slotGfx = null;
  this.ui = { home: null, settings: null, undo: null, restart: null };
  this._uiBase = new Map();

  // win
  this.winVideo = null;
  this.winOverlay = null;
  this.isWinPlaying = false;
  // win audio
  this.winMusic = null;
  this.winVoice = null;


  // quick sound popup
  this.soundPopup = null;
  this.isSoundPopupOpen = false;
}

  // ====== required by you ======
computeLayoutParams() {
  const W = this.scale.width;
  const H = this.scale.height;

  // Паддинги и зазор берем заранее, чтобы карты точно влезали по ширине
  this.PADDING = Math.round(Math.max(8, W * 0.02));

  // базовый gap (не привязываем к cardW, чтобы не раздувать на мобилке)
  const gapBase = Math.round(Math.max(6, W * 0.01));
  this.COL_GAP = gapBase;

  // считаем cardW так, чтобы 7 колонок гарантированно влезли
  const availableW = W - this.PADDING * 2 - this.COL_GAP * 6;
  let cardW = Math.floor(availableW / 7);

  // страховочные границы
  cardW = Phaser.Math.Clamp(cardW, 48, 110);

  this.CARD_W = cardW;
  this.CARD_H = Math.round(this.CARD_W * 1.44);

  // шаги всегда одни и те же (никаких портретных коэффициентов)
  const downMul = 0.15;
  const upMul   = 0.18;

  this.TABLEAU_STEP_DOWN = Math.round(Math.max(10, this.CARD_H * downMul));
  this.TABLEAU_STEP_UP   = Math.round(Math.max(12, this.CARD_H * upMul));

  // слоты (без портретных правок)
  this.SLOT_INSET = 6;
  this.SLOT_LINE = 2;
  this.SLOT_RADIUS = 20;
}

  // ====== create ======
create() {
  try { sessionStorage.setItem('last_scene', 'game'); } catch (e) {}


  this.cameras.main.roundPixels = true;

// ===== ПАУЗА ТАЙМЕРА ПРИ СВОРАЧИВАНИИ ОКНА =====

const pauseIfActive = () => {
  if (window.Session && typeof window.Session.pause === 'function') window.Session.pause();
  this.pauseGameTimerUI();
};

const resumeIfActive = () => {
  if (!this._isGameActive) return;
  if (window.Session && typeof window.Session.resume === 'function') window.Session.resume();
  this.resumeGameTimerUI();
};

this._onVisibilityChange = () => {
  if (document.hidden) pauseIfActive();
  else resumeIfActive();
};

this._onBlur = () => pauseIfActive();
this._onFocus = () => resumeIfActive();

this._onPageHide = () => pauseIfActive();
this._onPageShow = () => resumeIfActive();

this._onFreeze = () => pauseIfActive();
this._onResume = () => resumeIfActive();

document.addEventListener('visibilitychange', this._onVisibilityChange);
window.addEventListener('blur', this._onBlur);
window.addEventListener('focus', this._onFocus);
window.addEventListener('pagehide', this._onPageHide);
window.addEventListener('pageshow', this._onPageShow);
document.addEventListener('freeze', this._onFreeze);
document.addEventListener('resume', this._onResume);

this.events.once('shutdown', () => {
  document.removeEventListener('visibilitychange', this._onVisibilityChange);
  window.removeEventListener('blur', this._onBlur);
  window.removeEventListener('focus', this._onFocus);
  window.removeEventListener('pagehide', this._onPageHide);
  window.removeEventListener('pageshow', this._onPageShow);
  document.removeEventListener('freeze', this._onFreeze);
  document.removeEventListener('resume', this._onResume);
});

// если раньше где-то поставили запрет авто-resume - снимаем его при входе в игру
try { sessionStorage.removeItem('skip_auto_resume'); } catch (e) {}


    this.loadSettings();
    this.computeLayoutParams();
    this.buildLayout();

    this.createBackground();
    this.createSlotsGraphics();
    this.createUIButtons();
    this.createGameTimerUI();

    this.createInputHandlers();
    this.input.setTopOnly(true);

var saved = null;
if (window.SaveGame && window.SaveGame.load) {
  saved = window.SaveGame.load();
}

// Разрешаем восстановление ТОЛЬКО если перезагрузка была из "живой игры"
var ctx = 'menu';
try { ctx = sessionStorage.getItem('resume_context') || 'menu'; } catch (e) {}
if (ctx !== 'game_active') {
  saved = null;
}


if (saved && window.SaveGame && window.SaveGame.applyStateToScene) {
  // Нужно создать структуру карт/колоды, но НЕ затирать сохранение
  this.__restoring = true;
  this.newGame(); // создаст карты/мапы/спрайты
  window.SaveGame.applyStateToScene(this, saved);
  this.__restoring = false;

  // на всякий случай сразу пересохраним уже восстановленное
  if (window.SaveGame && window.SaveGame.save) window.SaveGame.save(this);
} else {
  // если сохранения нет - обычная новая игра
  this.newGame();
}

try { sessionStorage.setItem('resume_context', 'game_active'); } catch (e) {}


// === SAVE ON PAGE RELOAD/CLOSE (once) ===
if (!window.__savegame_beforeunload_added) {
  window.__savegame_beforeunload_added = true;

  window.addEventListener('beforeunload', () => {
    if (window.SaveGame && window.SaveGame.save && window.__phaserGameScene) {
      window.SaveGame.save(window.__phaserGameScene);
    }
  });
}

// keep pointer to current scene for beforeunload
window.__phaserGameScene = this;


    this.scale.on('resize', this.onResize, this);

const fixAfterFullscreen = () => {
  // обновить размеры/позицию canvas в DOM
  if (this.scale && typeof this.scale.refresh === 'function') {
    this.scale.refresh();
  }

  // ВАЖНО: updateBounds находится в ScaleManager
  if (this.scale && typeof this.scale.updateBounds === 'function') {
    this.scale.updateBounds();
  }

  // пересчет лейаута + хитбоксов
  this.onResize();
  this.updateStockHitArea?.();
};


this.scale.on('enterfullscreen', () => {
  this.time.delayedCall(150, fixAfterFullscreen);
});

    this.scale.on('enterfullscreen', () => {
    this.time.delayedCall(0, () => this.updateStockHitArea());
    });

    this.scale.on('leavefullscreen', () => {
    this.time.delayedCall(0, () => this.updateStockHitArea());
    });


    this.events.once('shutdown', this.onShutdown, this);
    this.events.once('destroy', this.onShutdown, this);

    // --- Card SFX state ---
    const sfxSettings = JSON.parse(localStorage.getItem('solitaire-settings') || '{}');
    this.sfxEnabled = sfxSettings.soundOn !== undefined ? sfxSettings.soundOn : true;


    // разлочено ли аудио (после первого клика)
    this.audioUnlocked = !!this.game.audioUnlocked;

    // создаем звуки (но играть будем только если enabled + unlocked)
    this.sndCardPick = this.sound.add('klikcard', { volume: 0.6 });
    this.sndCardPlace = this.sound.add('klakcard', { volume: 0.6 });

    // слушаем смену тумблера Sounds из настроек
    this.game.events.on('sfx:setEnabled', (v) => {
    this.sfxEnabled = !!v;

    if (typeof attachDebugKeys === 'function') attachDebugKeys();

  });

  

// слушаем глобальную разлочку от первого клика (MusicScene эмитит)
this.game.events.on('audio:unlocked', () => {
  this.audioUnlocked = true;
});

// ---- win audio objects (создаем один раз) ----
if (!this.winMusic) {
  this.winMusic = this.sound.add('winmusic', { loop: false, volume: WIN_MUSIC_VOLUME });
}
if (!this.winVoice) {
  this.winVoice = this.sound.add('winvoice', { loop: false, volume: WIN_VOICE_VOLUME });
}
  }

  getAudioSettings() {
  // берем настройки единообразно
  if (window.Storage && typeof window.Storage.getSettings === 'function') {
    return window.Storage.getSettings();
  }
  // fallback (как у тебя в других местах)
  const saved = JSON.parse(localStorage.getItem('solitaire-settings') || '{}');
  return {
    musicOn: saved.musicOn !== undefined ? !!saved.musicOn : true,
    soundOn: saved.soundOn !== undefined ? !!saved.soundOn : true
  };
}

tryStartWinAudio() {
  // нельзя играть до первого жеста пользователя (у тебя это флаг audioUnlocked)
  if (!this.game.audioUnlocked) return;

  const { musicOn, soundOn } = this.getAudioSettings();

  // обновлять громкость на лету (если поменяешь константы)
  if (this.winMusic) this.winMusic.setVolume(WIN_MUSIC_VOLUME);
  if (this.winVoice) this.winVoice.setVolume(WIN_VOICE_VOLUME);

  if (musicOn && this.winMusic && !this.winMusic.isPlaying) {
    this.winMusic.play();
  }
  if (soundOn && this.winVoice && !this.winVoice.isPlaying) {
    this.winVoice.play();
  }
}

stopWinAudio() {
  if (this.winMusic && this.winMusic.isPlaying) this.winMusic.stop();
  if (this.winVoice && this.winVoice.isPlaying) this.winVoice.stop();
}


  playCardSfx(type) {
  if (!this.sfxEnabled) return;
  if (!this.audioUnlocked) return;

  if (type === 'pick') {
    if (this.sndCardPick) this.sndCardPick.play();
  } else if (type === 'place') {
    if (this.sndCardPlace) this.sndCardPlace.play();
  }

}

  onShutdown() {
    this.scale.off('resize', this.onResize, this);
    this.input.off('pointermove', this.onPointerMove, this);
    this.input.off('pointerup', this.onPointerUp, this);
    this.input.off('pointerupoutside', this.onPointerUp, this);

    // stop video if any
    if (this.winVideo) {
      try { this.winVideo.stop(); } catch (e) {}
    }
  }

  // ====== settings ======
  loadSettings() {
    const saved = JSON.parse(localStorage.getItem('solitaire-settings') || '{}');
    this.draw3 = !!saved.draw3; // true = draw 3
  }

  // ====== layout ======
buildLayout() {
  const W = this.scale.width;
  const H = this.scale.height;

  const totalTableauW = 7 * this.CARD_W + 6 * this.COL_GAP;
  const leftX = Math.round((W - totalTableauW) / 2);

  for (let i = 0; i < 7; i++) {
    this.pos.tableauX[i] = leftX + i * (this.CARD_W + this.COL_GAP);
  }

  this.pos.stockX = this.pos.tableauX[0];
  this.pos.wasteX = this.pos.stockX + (this.CARD_W + this.COL_GAP);

  const rightEdgeTableau = this.pos.tableauX[6] + this.CARD_W;
  const totalFoundationW = 4 * this.CARD_W + 3 * this.COL_GAP;
  const foundationLeftX = rightEdgeTableau - totalFoundationW;

  for (let i = 0; i < 4; i++) {
    this.pos.foundationX[i] = foundationLeftX + i * (this.CARD_W + this.COL_GAP);
  }

  // НИКАКИХ портретных сдвигов
  const topRowDown = 0;
  const tableauMoreDown = 0;

  // верхняя линия (stock/waste/foundation)
  this.pos.topY = this.PADDING + Math.round(this.CARD_H / 2) + topRowDown;

  // поле (tableau)
  const TABLEAU_EXTRA_DOWN = Math.round(H * 0.08) + tableauMoreDown;

  this.pos.tableauY =
    this.pos.topY +
    this.CARD_H +
    this.PADDING +
    Math.round(this.CARD_H / 2) +
    TABLEAU_EXTRA_DOWN;

  // фиксированный ограничитель (без isMobilePortrait)
  const clampK = 0.35;

  this.pos.tableauY = Math.min(
    this.pos.tableauY,
    Math.round(H * clampK) + TABLEAU_EXTRA_DOWN
  );
}


  onResize() {
    this.computeLayoutParams();
    this.buildLayout();

    this.updateStockHitArea();

    // resize background + slots + ui + re-layout cards
    if (this.bg) this.fitCover(this.bg);

    this.redrawSlots();
    this.layoutUI();
    this.layoutGameTimerUI();
    this.relayoutAllCards(true);

    // if win video is playing, refit
    if (this.winVideo && this.isWinPlaying) {
    this.fitCoverVideo(this.winVideo);
    }

    if (this.winOverlay) this.winOverlay.setSize(this.scale.width, this.scale.height);
  }

  fitCoverVideo(videoGO) {
  if (!videoGO) return;

  const sw = this.scale.width;
  const sh = this.scale.height;

  const htmlVideo =
    videoGO.getVideo?.() || videoGO.video || null;

  const vw = htmlVideo?.videoWidth || 1920;
  const vh = htmlVideo?.videoHeight || 1080;

  const s = Math.max(sw / vw, sh / vh);

  videoGO.setDisplaySize(vw * s, vh * s);
  videoGO.setPosition(
    this.cameras.main.centerX,
    this.cameras.main.centerY
  );
}


  // ====== background ======
  createBackground() {
    const cx = this.cameras.main.centerX;
    const cy = this.cameras.main.centerY;

    if (this.bg) this.bg.destroy();
    this.bg = this.add.image(cx, cy, 'bggame').setOrigin(0.5).setDepth(-1000);
    this.fitCover(this.bg);
  }

  fitCover(go) {
    const W = this.scale.width;
    const H = this.scale.height;
    const src = go.texture.getSourceImage();
    const iw = src.width || 1;
    const ih = src.height || 1;

    const s = Math.max(W / iw, H / ih);
    go.setDisplaySize(iw * s, ih * s);
    go.setPosition(this.cameras.main.centerX, this.cameras.main.centerY);
  }

  // ====== slot outlines ======
  createSlotsGraphics() {
    if (this.slotGfx) this.slotGfx.destroy();
    this.slotGfx = this.add.graphics().setDepth(-500);
    this.redrawSlots();
  }

  redrawSlots() {
    if (!this.slotGfx) return;

    this.slotGfx.clear();
    this.slotGfx.lineStyle(this.SLOT_LINE, 0xffffff, 0.45);

    const r = Math.min(this.SLOT_RADIUS, Math.round(this.CARD_W * 0.22));
    const drawSlot = (xCenter, yCenter) => {
      const x = Math.round(xCenter - this.CARD_W / 2);
      const y = Math.round(yCenter - this.CARD_H / 2);
      this.slotGfx.strokeRoundedRect(
        x + this.SLOT_INSET,
        y + this.SLOT_INSET,
        this.CARD_W - this.SLOT_INSET * 2,
        this.CARD_H - this.SLOT_INSET * 2,
        r
      );
    };

    const y = this.pos.topY;

    // stock + waste slots
    drawSlot(this.pos.stockX + this.CARD_W / 2, y);
    drawSlot(this.pos.wasteX + this.CARD_W / 2, y);

    // foundations
    for (let i = 0; i < 4; i++) {
      drawSlot(this.pos.foundationX[i] + this.CARD_W / 2, y);
    }

    // tableau "bases"
    const ty = this.pos.tableauY;
    for (let i = 0; i < 7; i++) {
      drawSlot(this.pos.tableauX[i] + this.CARD_W / 2, ty);
    }
  }

  // ====== UI buttons ======
  createUIButtons() {
  const UI_ICON_SCALE = 0.65; // крути это число

  // --- destroy old ---
  this.ui = this.ui || {};
  this._uiBase = this._uiBase || new Map();

  for (const k of Object.keys(this.ui)) {
    const obj = this.ui[k];
    if (!obj) continue;

    try {
      // Phaser GameObjects usually have removeAllListeners when interactive
      if (typeof obj.removeAllListeners === 'function') obj.removeAllListeners();
    } catch (e) {}

    try { obj.destroy(); } catch (e) {}
    this.ui[k] = null;
  }
  this._uiBase.clear();

  // --- create ---
  this.ui.home = this.add.image(0, 0, 'icon_home')
    .setOrigin(0.5)
    .setScale(UI_ICON_SCALE * 0.85)
    .setInteractive({ useHandCursor: true })
    .setDepth(5000);

  this.ui.settings = this.add.image(0, 0, 'icon_sound')
    .setOrigin(0.5)
    .setScale(UI_ICON_SCALE * 0.85)
    .setInteractive({ useHandCursor: true })
    .setDepth(5000);

  this.ui.undo = this.add.image(0, 0, 'icon_undo')
    .setOrigin(0.5)
    .setScale(UI_ICON_SCALE * 0.85)
    .setInteractive({ useHandCursor: true })
    .setDepth(5000);

  this.ui.restart = this.add.image(0, 0, 'icon_restart')
    .setOrigin(0.5)
    .setScale(UI_ICON_SCALE * 0.85)
    .setInteractive({ useHandCursor: true })
    .setDepth(5000);

  // layout positions
  this.layoutUI();

  // --- common hover/press scaling ---
  const attachCommon = (btn) => {
    if (!btn) return;

    const saveBase = () => {
      this._uiBase.set(btn, {
        sx: btn.scaleX,
        sy: btn.scaleY,
        angle: btn.angle,
        x: btn.x,
        y: btn.y
      });
    };

    // save base right now (after layout)
    saveBase();

    const getBase = () => this._uiBase.get(btn) || { sx: btn.scaleX, sy: btn.scaleY, angle: btn.angle };

    const tweenTo = (sx, sy, dur = 120) => {
      this.tweens.killTweensOf(btn);
      this.tweens.add({ targets: btn, scaleX: sx, scaleY: sy, duration: dur, ease: 'Power2' });
    };

    btn.on('pointerover', () => {
      const base = getBase();
      tweenTo(base.sx * 1.10, base.sy * 1.10, 140);
    });

    btn.on('pointerout', () => {
      const base = getBase();
      tweenTo(base.sx, base.sy, 140);
    });

    btn.on('pointerdown', () => {
      this.game.events.emit('ui:click');
      const base = getBase();
      tweenTo(base.sx * 0.92, base.sy * 0.92, 80);
    });

    btn.on('pointerup', () => {
      const base = getBase();
      const over = btn.input && btn.input.over;
      const mul = over ? 1.10 : 1.0;
      tweenTo(base.sx * mul, base.sy * mul, 100);
    });

    // allow refresh after layout/resize
    btn.__saveBase = saveBase;
  };

  // --- special hover animations ---
  const attachSettingsSpin180 = (btn) => {
    if (!btn) return;

    btn.on('pointerover', () => {
      const base = this._uiBase.get(btn) || { angle: btn.angle };
      this.tweens.killTweensOf(btn);
      this.tweens.add({ targets: btn, angle: base.angle + 180, duration: 260, ease: 'Power2' });
    });

    btn.on('pointerout', () => {
      const base = this._uiBase.get(btn) || { angle: btn.angle };
      this.tweens.killTweensOf(btn);
      this.tweens.add({ targets: btn, angle: base.angle, duration: 220, ease: 'Power2' });
    });
  };

  const attachHomeVibrate = (btn) => {
    if (!btn) return;

    btn.on('pointerover', () => {
      const base = this._uiBase.get(btn) || { angle: btn.angle };
      this.tweens.killTweensOf(btn);
      this.tweens.timeline({
        targets: btn,
        tweens: [
          { angle: -90, duration: 70, ease: 'Sine.easeOut' },
          { angle: 90, duration: 90, ease: 'Sine.easeInOut' },
          { angle: -45, duration: 70, ease: 'Sine.easeInOut' },
          { angle: base.angle, duration: 70, ease: 'Sine.easeIn' }
        ]
      });
    });

    btn.on('pointerout', () => {
      const base = this._uiBase.get(btn) || { angle: btn.angle };
      this.tweens.killTweensOf(btn);
      this.tweens.add({ targets: btn, angle: base.angle, duration: 140, ease: 'Power2' });
    });
  };

  const attachUndoSpin360 = (btn) => {
    if (!btn) return;

    btn.on('pointerover', () => {
      const base = this._uiBase.get(btn) || { angle: btn.angle };
      this.tweens.killTweensOf(btn);
      this.tweens.add({ targets: btn, angle: base.angle + 360, duration: 650, ease: 'Sine.easeInOut' });
    });

    btn.on('pointerout', () => {
      const base = this._uiBase.get(btn) || { angle: btn.angle };
      this.tweens.killTweensOf(btn);
      this.tweens.add({ targets: btn, angle: base.angle, duration: 180, ease: 'Power2' });
    });
  };

  // apply common + specials
  attachCommon(this.ui.home);
  attachCommon(this.ui.settings);
  attachCommon(this.ui.undo);
  attachCommon(this.ui.restart);

  attachSettingsSpin180(this.ui.settings);
  attachHomeVibrate(this.ui.home);
  attachUndoSpin360(this.ui.undo);

  // после layout база меняется -> обновляем базовые значения и снимаем "залипший hover"
  for (const k of ['home', 'settings', 'undo', 'restart']) {
    const btn = this.ui[k];
    if (!btn) continue;

    if (btn.__saveBase) btn.__saveBase();

    const base = this._uiBase.get(btn);
    if (base) {
      this.tweens.killTweensOf(btn);
      btn.setScale(base.sx, base.sy);
      btn.setAngle(base.angle || 0);
    }
  }

  // --- actions ---
  this.ui.home.on('pointerup', () => {
    this._isGameActive = false;
    if (this.isWinPlaying) return;

    this.stopGameTimerUI();

    const payload = Session.abandon('home');
    AchievementRules.onAbandon(payload);

    if (AchievementRules.onExitToMenu) AchievementRules.onExitToMenu();

    try { sessionStorage.setItem('force_menu', '1'); } catch (e) {}
    try { sessionStorage.setItem('resume_context', 'menu'); } catch (e) {}

    this.scene.start('MenuScene');
  });

  this.ui.settings.on('pointerup', () => {
    if (this.isWinPlaying) return;
    try { sessionStorage.setItem('skip_auto_resume', '1'); } catch (e) {}
    this.openSoundPopup();
  });

  this.ui.restart.on('pointerup', () => {
    this._isGameActive = false;
    if (this.isWinPlaying) return;

    if (this.input) this.input.enabled = false;

    this.stopGameTimerUI();

    const payload = Session.abandon('restart');
    AchievementRules.onAbandon(payload);

    const doRestart = () => {
      if (this.input) this.input.enabled = true;
      this.newGame();
    };

    if (window.Platform && typeof window.Platform.showInterstitial === 'function') {
      // finally гарантирует, что doRestart вызовется даже при ошибке/отказе/оффлайне
      window.Platform.showInterstitial('restart').finally(doRestart);
    } else {
      doRestart();
    }
  });

  this.ui.undo.on('pointerup', () => {
    if (this.isWinPlaying) return;
    if (!this.undoStack || this.undoStack.length === 0) return;

    Session.addUndo();
    this.undo();
  });
}

layoutUI() {
  const W = this.scale.width;
  const H = this.scale.height;
  const pad = Math.round(Math.max(10, Math.min(W, H) * 0.03));

  const dev = this.sys.game.device;

  // ===== РАЗМЕР КНОПОК =====
  let baseSize = Math.round(Math.min(105, W * 0.09));

   let sizeMul = 1.0;

// опционально: чуть крупнее на реально маленьких экранах, но не портрет
   const isSmallScreen = (Math.min(W, H) <= 600);
   if (isSmallScreen) sizeMul = 1.15;

   const btnSize = Math.round(baseSize * sizeMul);



  // аккуратный ресайз без искажения пропорций
  const setBtnHeight = (img, hPx) => {
    if (!img) return;
    const tex = img.texture && img.texture.getSourceImage ? img.texture.getSourceImage() : null;
    const iw = (tex && tex.width) ? tex.width : (img.width || 1);
    const ih = (tex && tex.height) ? tex.height : (img.height || 1);

    const sc = hPx / ih;
    img.setDisplaySize(Math.round(iw * sc), Math.round(ih * sc));
  };

  // обычные кнопки: высота = btnSize, ширина по пропорциям
  setBtnHeight(this.ui && this.ui.home, btnSize);
  setBtnHeight(this.ui && this.ui.settings, btnSize);
  setBtnHeight(this.ui && this.ui.undo, btnSize);

  // restart - вытянутая
  if (this.ui && this.ui.restart) {
  const h = Math.round(btnSize * 0.85);
  const w = Math.round(btnSize * 1.25);
  this.ui.restart.setDisplaySize(w, h);
  }


  // актуальные размеры после ресайза
  const homeW = (this.ui && this.ui.home) ? this.ui.home.displayWidth : btnSize;
  const homeH = (this.ui && this.ui.home) ? this.ui.home.displayHeight : btnSize;

  const settingsW = (this.ui && this.ui.settings) ? this.ui.settings.displayWidth : btnSize;
  const settingsH = (this.ui && this.ui.settings) ? this.ui.settings.displayHeight : btnSize;

  const undoW = (this.ui && this.ui.undo) ? this.ui.undo.displayWidth : btnSize;
  const undoH = (this.ui && this.ui.undo) ? this.ui.undo.displayHeight : btnSize;

  const restartW = (this.ui && this.ui.restart) ? this.ui.restart.displayWidth : Math.round(btnSize * 1.6);
  const restartH = (this.ui && this.ui.restart) ? this.ui.restart.displayHeight : btnSize;

  const gap = Math.round(btnSize * 0.25);

  // ===== ПОЗИЦИИ =====

// кнопки
const btnHome = this.ui && this.ui.home;
const btnSound = this.ui && this.ui.settings; // это звук
const btnUndo = this.ui && this.ui.undo;
const btnRestart = this.ui && this.ui.restart;

const topY = pad;
const rightX = W - pad;

const bottomY = H - pad;
const leftX = pad;

// Справа сверху: HOME
if (btnHome) {
  btnHome.setPosition(
    rightX - homeW * 0.5,
    topY + homeH * 0.5
  );
}

// Под HOME: SOUND
if (btnSound) {
  btnSound.setPosition(
    rightX - settingsW * 0.5,
    topY + homeH + gap + settingsH * 0.5
  );
}

// Слева снизу: RESTART
if (btnRestart) {
  btnRestart.setPosition(
    leftX + restartW * 0.5,
    bottomY - restartH * 0.5
  );
}

// Справа от RESTART, на той же высоте: UNDO
if (btnUndo) {
  btnUndo.setPosition(
    leftX + restartW + gap + undoW * 0.5,
    bottomY - undoH * 0.5
  );
}
}


  
   formatMMSS(totalSec) {
  const sec = Math.max(0, Math.floor(totalSec || 0));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

createGameTimerUI() {
  if (this.gameTimerText) {
    this.gameTimerText.destroy();
    this.gameTimerText = null;
  }

  const W = this.scale.width;
  const pad = Math.round(Math.max(10, W * 0.09));

  this.gameTimerText = this.add.text(
    pad,
    pad,
    '00:00',
    {
      fontFamily: '"Cygre ExtraBold", Arial, sans-serif',
      fontSize: '48px',
      color: '#4FA341'
    }
  ).setDepth(95000).setScrollFactor(0);

  this.layoutGameTimerUI();
}

layoutGameTimerUI() {
  if (!this.gameTimerText) return;

  const W = this.scale.width;
  const pad = Math.round(Math.max(10, W * 0.02));

  if (this._bottomUiY) {
    this.gameTimerText.setOrigin(0, 0.5);
    this.gameTimerText.setPosition(pad, this._bottomUiY);
  } else {
    this.gameTimerText.setOrigin(0, 0);
    this.gameTimerText.setPosition(pad, pad);
  }
}


startGameTimerUI() {
    this._timerPaused = false;
  // сброс финального значения
  this._finalGameSec = null;

  // прибить старый эвент (если был)
  if (this._gameTimerEvent) {
    this._gameTimerEvent.remove(false);
    this._gameTimerEvent = null;
  }

  // сразу обновим
  this.updateGameTimerUI();

  // обновляем раз в 250мс (выглядит живее)
  this._gameTimerEvent = this.time.addEvent({
    delay: 250,
    loop: true,
    callback: () => this.updateGameTimerUI()
  });
}



updateGameTimerUI() {
  if (!this.gameTimerText) return;

  // если мы уже остановили таймер - показываем финальное
  if (typeof this._finalGameSec === 'number') {
    this.gameTimerText.setText(this.formatMMSS(this._finalGameSec));
    return;
  }

  // берем время из Session (так совпадает с тем, что идет в payload)
  const p = window.Session && Session.getPayload ? Session.getPayload() : null;
  const sec = p && typeof p.durationSec === 'number' ? p.durationSec : 0;

  this.gameTimerText.setText(this.formatMMSS(sec));
}

stopGameTimerUI() {
  // зафиксируем финальное значение (чтобы и на экране осталось, и для win popup)
  this._timerPaused = false;
  const p = window.Session && Session.getPayload ? Session.getPayload() : null;
  this._finalGameSec = p && typeof p.durationSec === 'number' ? p.durationSec : 0;

  if (this._gameTimerEvent) {
    this._gameTimerEvent.remove(false);
    this._gameTimerEvent = null;
  }

  this.updateGameTimerUI();
}

pauseGameTimerUI() {
  // если таймер уже на паузе или игра уже закончена - ничего не делаем
  if (this._timerPaused) return;
  if (typeof this._finalGameSec === 'number') return;

  this._timerPaused = true;

  // остановим Phaser event, который дергает update
  if (this._gameTimerEvent) {
    this._gameTimerEvent.remove(false);
    this._gameTimerEvent = null;
  }

  // если у Session есть пауза - тоже поставим (безопасно, если методов нет)
  if (window.Session && typeof Session.pause === 'function') {
    Session.pause();
  }

  // обновим UI один раз, чтобы показал актуальное перед паузой
  this.updateGameTimerUI();
}

resumeGameTimerUI() {
  if (!this._timerPaused) return;
  if (typeof this._finalGameSec === 'number') return;

  this._timerPaused = false;

  // если у Session есть resume - дернем
  if (window.Session && typeof Session.resume === 'function') {
    Session.resume();
  }

  // защита от дублей
  if (this._gameTimerEvent) return;

  this._gameTimerEvent = this.time.addEvent({
    delay: 250,
    loop: true,
    callback: () => this.updateGameTimerUI()
  });

  this.updateGameTimerUI();
}

hideGameTimerUI() {
  if (this.gameTimerText) this.gameTimerText.setVisible(false);
}

showGameTimerUI() {
  if (this.gameTimerText) this.gameTimerText.setVisible(true);
}

  hideUI(hide) {
    for (const k of Object.keys(this.ui)) {
      if (this.ui[k]) this.ui[k].setVisible(!hide);
    }
  }

  // ====== cards model ======
  makeDeck() {
    const suits = ['s', 'h', 'd', 'c'];
    const ranks = ['a', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'j', 'q', 'k'];

    const deck = [];
    let id = 0;

    const rankToValue = (r) => {
      if (r === 'a') return 1;
      if (r === 'j') return 11;
      if (r === 'q') return 12;
      if (r === 'k') return 13;
      return parseInt(r, 10);
    };
    const suitColor = (s) => (s === 'h' || s === 'd') ? 'red' : 'black';

    for (const s of suits) {
      for (const r of ranks) {
        const key = `${r}${s}`;
        const card = {
          id: id++,
          r,
          s,
          key,
          value: rankToValue(r),
          color: suitColor(s),
          faceUp: false,
          sprite: null
        };
        deck.push(card);
      }
    }
    return deck;
  }

  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // ====== new game / deal ======
  newGame() {
  this._isGameActive = true;

  // 1) подгружаем актуальный режим (1 карта / 3 карты)
  this.loadSettings();

  // 2) стартуем сессию и передаем draw3 в meta
  Session.start('game', { draw3: this.draw3 });

  // 3) achievement onStart
  AchievementRules.onStart?.(Session.getPayload?.() || null);

  this.startGameTimerUI();

    this.showGameTimerUI();
    this.stopWinSequence(false);

    // cleanup sprites
    this.clearAllCardSprites();

    this.cards.clear();
    this.stock = [];
    this.waste = [];
    this.foundations = [[], [], [], []];
    this.tableau = [[], [], [], [], [], [], []];
    this.undoStack = [];

    // create & shuffle deck
    const deck = this.shuffle(this.makeDeck());
    for (const c of deck) this.cards.set(c.id, c);

    // deal tableau (Klondike): col 0..6 with 1..7 cards; top faceUp
    let idx = 0;
    for (let col = 0; col < 7; col++) {
      this.tableau[col] = [];
      for (let k = 0; k <= col; k++) {
        const card = deck[idx++];
        this.tableau[col].push(card.id);
        card.faceUp = (k === col);
      }
    }

    // rest into stock faceDown
    this.stock = [];
    while (idx < deck.length) {
      const card = deck[idx++];
      card.faceUp = false;
      this.stock.push(card.id);
    }

    // create sprites
    for (const card of this.cards.values()) {
      this.createCardSprite(card);
    }

    this.redrawSlots();
    this.relayoutAllCards(true);
  }



  clearAllCardSprites() {
    if (!this.cards || this.cards.size === 0) return;
    for (const card of this.cards.values()) {
      if (card.sprite) {
        card.sprite.removeAllListeners();
        card.sprite.destroy();
        card.sprite = null;
      }
    }
  }

  // ====== INPUT / HITAREA FIX HELPERS ======
getPointerWorld(pointer) {
  // самый стабильный способ получить координаты относительно камеры
  const p = pointer.positionToCamera(this.cameras.main);
  return { x: p.x, y: p.y };
}

applyCardHitArea(sprite) {
  sprite.setInteractive({ useHandCursor: true });
}


// ====== create / update card sprite ======
createCardSprite(card) {
  const tex = card.faceUp ? card.key : 'card_back';
  const spr = this.add.image(0, 0, tex).setOrigin(0.5);

  // размер
  spr.setDisplaySize(this.CARD_W, this.CARD_H);

  // store
  card.sprite = spr;

  // интерактив с фиксированным hitArea
  this.applyCardHitArea(spr);

  // pointerdown
  spr.on('pointerdown', (pointer) => {
    if (this.isWinPlaying) return;
    this.onCardPointerDown(pointer, card.id);
  });
}

updateCardSprite(card) {
  if (!card || !card.sprite) return;

  const texKey = card.faceUp ? card.key : 'card_back';

  if (card.sprite.texture?.key !== texKey) {
    card.sprite.setTexture(texKey);
  }

  // Важно: размер задается так, как он реально отображается
  card.sprite.setDisplaySize(
  Math.round(this.CARD_W),
  Math.round(this.CARD_H)
);

  // Важно: после setDisplaySize пересобираем хитбокс
  this.applyCardHitArea(card.sprite);
}


// ====== DRAG ======
beginDrag(pointer, fromLoc, movingIds) {
  const topId = movingIds[0];
  const topCard = this.getCard(topId);
  const topSpr = topCard.sprite;

  const wp = this.getPointerWorld(pointer);

  // запоминаем позиции для snapback
  const startPositions = movingIds.map((id) => {
    const c = this.getCard(id);
    return { id, x: c.sprite.x, y: c.sprite.y, depth: c.sprite.depth };
  });

  // запоминаем карту под переносимой (если она была закрыта на момент начала перетаскивания)
  let revealCandidate = null;
  if (fromLoc && fromLoc.pileType === 'tableau') {
    const pile = this.tableau[fromLoc.index];
    const underIndex = fromLoc.pos - 1;

    if (underIndex >= 0 && pile && pile[underIndex] != null) {
      const underId = pile[underIndex];
      const underCard = this.getCard(underId);
      if (underCard && !underCard.faceUp) {
        revealCandidate = underId;
      }
    }
  }

  // поднимаем depth "лесенкой"
  const baseDepth = 20000;
  for (let i = 0; i < movingIds.length; i++) {
    const c = this.getCard(movingIds[i]);
    c.sprite.setDepth(baseDepth + i);
  }

  // точный оффсет курсора относительно верхней карты
  const pointerOffset = { x: topSpr.x - wp.x, y: topSpr.y - wp.y };

  this.drag = {
    from: fromLoc,
    ids: movingIds.slice(),
    pointerOffset,
    startPositions,
    offsetY: Math.max(14, Math.round(this.CARD_H * 0.16)),
    revealCandidate
  };

  // легкая анимация "поднятия"
  for (const id of movingIds) {
    const c = this.getCard(id);
    this.tweens.killTweensOf(c.sprite);
    this.tweens.add({
      targets: c.sprite,
      scaleX: c.sprite.scaleX * 1.02,
      scaleY: c.sprite.scaleY * 1.02,
      duration: 70,
      ease: 'Power2'
    });
  }
}


onPointerMove(pointer) {
  if (!this.drag) return;

  const wp = this.getPointerWorld(pointer);

  const baseX = wp.x + this.drag.pointerOffset.x;
  const baseY = wp.y + this.drag.pointerOffset.y;

  const ids = this.drag.ids;
  for (let i = 0; i < ids.length; i++) {
    const c = this.getCard(ids[i]);
    const tx = baseX;
    const ty = baseY + i * this.drag.offsetY;

    // плавное следование без "дрожи"
    c.sprite.x = Phaser.Math.Linear(c.sprite.x, tx, 0.45);
    c.sprite.y = Phaser.Math.Linear(c.sprite.y, ty, 0.45);
  }
}

onPointerUp(pointer) {
  if (!this.drag) return;

  this.playCardSfx('place');

  const drag = this.drag;
  this.drag = null;

  const wp = this.getPointerWorld(pointer);

  const ids = drag.ids;

  // цель дропа считаем по координатам камеры
  const drop = this.getDropTarget(wp.x, wp.y);

  if (!drop) {
    this.snapBack(drag);
    return;
  }

  const ok = this.tryMove(drag.from, ids, drop);

  if (!ok) {
    this.snapBack(drag);
    return;
  }

  // вернуть масштаб и переложить
  for (const id of ids) {
    const c = this.getCard(id);
    c.sprite.setDisplaySize(this.CARD_W, this.CARD_H);
    this.applyCardHitArea(c.sprite);
  }

  this.relayoutAllCards(false);
  window.SaveGame && window.SaveGame.save && window.SaveGame.save(this);

  this.checkWin();
}

snapBack(drag) {
  // вернуть карты на стартовые позиции
  for (const p of drag.startPositions) {
    const c = this.getCard(p.id);
    if (!c || !c.sprite) continue;

    this.tweens.killTweensOf(c.sprite);
    this.tweens.add({
      targets: c.sprite,
      x: p.x,
      y: p.y,
      duration: 170,
      ease: 'Power2'
    });

    c.sprite.setDepth(p.depth);
    c.sprite.setDisplaySize(this.CARD_W, this.CARD_H);
    this.applyCardHitArea(c.sprite);
  }

  // убрать "поднятый" масштаб (чтобы не залипало)
  for (const id of drag.ids) {
    const c = this.getCard(id);
    if (!c || !c.sprite) continue;

    this.tweens.killTweensOf(c.sprite);
    this.tweens.add({
      targets: c.sprite,
      scaleX: c.sprite.scaleX / 1.02,
      scaleY: c.sprite.scaleY / 1.02,
      duration: 70,
      ease: 'Power2'
    });
  }

  // откат переворота карты под переносимой (если во время drag она была раскрыта)
  if (drag.revealCandidate != null) {
    const under = this.getCard(drag.revealCandidate);
    if (under && under.faceUp) {
      under.faceUp = false;
      this.updateCardSprite(under);
    }
  }

  // привести расклад обратно (текстуры/позиции)
  this.relayoutAllCards(false);
  window.SaveGame && window.SaveGame.save && window.SaveGame.save(this);

}


  // ====== helpers ======
  isRedSuit(s) { return s === 'h' || s === 'd'; }
  isOppColor(a, b) { return this.isRedSuit(a) !== this.isRedSuit(b); }

  findCardLocation(cardId) {
    // returns { pileType: 'stock'|'waste'|'foundation'|'tableau', index: number, pos: number }
    // index: pile index (foundation/tableau), pos: position in pile
    let pos = this.stock.indexOf(cardId);
    if (pos >= 0) return { pileType: 'stock', index: 0, pos };

    pos = this.waste.indexOf(cardId);
    if (pos >= 0) return { pileType: 'waste', index: 0, pos };

    for (let i = 0; i < 4; i++) {
      pos = this.foundations[i].indexOf(cardId);
      if (pos >= 0) return { pileType: 'foundation', index: i, pos };
    }

    for (let i = 0; i < 7; i++) {
      pos = this.tableau[i].indexOf(cardId);
      if (pos >= 0) return { pileType: 'tableau', index: i, pos };
    }
    return null;
  }

  getCard(cardId) { return this.cards.get(cardId); }

  topOf(pile) { return pile.length ? pile[pile.length - 1] : null; }

  // ====== input handlers ======
 createInputHandlers() {
  this.input.mouse?.disableContextMenu();
  this.input.setPollAlways?.();
  this.input.setTopOnly(true);

  // --- STOCK HIT AREA (единая зона клика по колоде) ---
  if (this.stockHit) {
    // важно: убрать слушатели и интерактив перед destroy
    this.stockHit.removeAllListeners?.();
    this.stockHit.disableInteractive?.();
    this.stockHit.destroy();
    this.stockHit = null;
  }

  const x = this.pos.stockX + this.CARD_W / 2;
  const y = this.pos.topY;


  this.stockHit = this.add.zone(x, y, this.CARD_W, this.CARD_H)
    .setOrigin(0.5)
    .setScrollFactor(0)
    .setDepth(1000)
    .setInteractive({ useHandCursor: true });

    this.updateStockHitArea();

  this.stockHit.on('pointerup', () => {
    if (this.isWinPlaying) return;

    // звук как при клике по карте
    this.playCardSfx('pick');

    this.onStockClicked();
  });

  // Синхронизация позиции/размера зоны клика (если layout уже пересчитан)
  // Безопасно оставлять даже если updateStockHitArea() пока не существует.
  if (typeof this.updateStockHitArea === 'function') {
    this.updateStockHitArea();
  }

  // --- Global input handlers (движение/отпускание) ---
  // На всякий случай: если метод может вызываться повторно, старые подписки лучше снять
  this.input.off('pointermove', this.onPointerMove, this);
  this.input.off('pointerup', this.onPointerUp, this);
  this.input.off('pointerupoutside', this.onPointerUp, this);

  this.input.on('pointermove', this.onPointerMove, this);
  this.input.on('pointerup', this.onPointerUp, this);
  this.input.on('pointerupoutside', this.onPointerUp, this);
}

 updateStockHitArea() {
  if (!this.stockHit) return;

  const x = this.pos.stockX + this.CARD_W / 2;
  const y = this.pos.topY;

  this.stockHit.setPosition(x, y);
  this.stockHit.setSize(this.CARD_W, this.CARD_H);

  // Иногда после setSize у Zone нужно обновить hitArea вручную (редко, но полезно в RESIZE)
  if (this.stockHit.input && this.stockHit.input.hitArea) {
    this.stockHit.input.hitArea.width = this.CARD_W;
    this.stockHit.input.hitArea.height = this.CARD_H;
  }
}


  onStockClicked() {
    if (this.drag) return;
    this.loadSettings();

    // If stock has cards, draw 1 or 3 to waste (only last is playable when draw3)
    if (this.stock.length > 0) {
      const n = this.draw3 ? 3 : 1;
      const drawn = [];
      for (let i = 0; i < n; i++) {
        if (!this.stock.length) break;
        const id = this.stock.pop();
        const c = this.getCard(id);
        c.faceUp = true;
        this.updateCardSprite(c);
        this.waste.push(id);
        drawn.push(id);
      }

      this.pushUndo({
        type: 'draw',
        fromStockToWaste: drawn.slice(),
        draw3: this.draw3
      });

      // animate: move last drawn to waste slot, others are hidden behind (since you said previous waste not visible)
      this.relayoutAllCards(false);
      window.SaveGame && window.SaveGame.save && window.SaveGame.save(this);
      return;
    }

    // If stock empty: recycle waste back to stock (face down)
    if (this.waste.length > 0) {
      const moved = this.waste.slice();
      this.waste.length = 0;
      // move back to stock in same order so the first drawn becomes top last again
      for (let i = moved.length - 1; i >= 0; i--) {
        const id = moved[i];
        const c = this.getCard(id);
        c.faceUp = false;
        this.updateCardSprite(c);
        this.stock.push(id);
      }

      this.pushUndo({
        type: 'recycle',
        moved: moved.slice()
      });

      this.relayoutAllCards(false);
      window.SaveGame && window.SaveGame.save && window.SaveGame.save(this);

    }
  }

  onCardPointerDown(pointer, cardId) {
    if (this.drag) return;

    const loc = this.findCardLocation(cardId);
    if (!loc) return;

    this.playCardSfx('pick');

    // Stock cards are not draggable (only click stock area)
    // Click on stock should draw cards
    


    // Waste: only top is draggable
    if (loc.pileType === 'waste') {
      if (this.topOf(this.waste) !== cardId) return;
      const c = this.getCard(cardId);
      if (!c.faceUp) return;
      this.beginDrag(pointer, loc, [cardId]);
      return;
    }

    // Foundation: only top is draggable
    if (loc.pileType === 'foundation') {
      const pile = this.foundations[loc.index];
      if (this.topOf(pile) !== cardId) return;
      const c = this.getCard(cardId);
      if (!c.faceUp) return;
      this.beginDrag(pointer, loc, [cardId]);
      return;
    }

    // Tableau: can drag a faceUp run starting from this card
    if (loc.pileType === 'tableau') {
      const pile = this.tableau[loc.index];
      const ids = pile.slice(loc.pos);
      if (!ids.length) return;

      // all must be faceUp
      for (const id of ids) {
        const c = this.getCard(id);
        if (!c.faceUp) return;
      }

      // validate run itself: descending by 1, alternating colors
      for (let i = 0; i < ids.length - 1; i++) {
        const a = this.getCard(ids[i]);
        const b = this.getCard(ids[i + 1]);
        if (b.value !== a.value - 1) return;
        if (!this.isOppColor(a.s, b.s)) return;
      }

      this.beginDrag(pointer, loc, ids);
      return;
    }
  }

  getDropTarget(x, y) {
    // foundations first (top row right), then tableau columns
    const cyTop = this.pos.topY;

    // foundation hitboxes
    for (let i = 0; i < 4; i++) {
      const cx = this.pos.foundationX[i] + this.CARD_W / 2;
      if (Math.abs(x - cx) <= this.CARD_W / 2 && Math.abs(y - cyTop) <= this.CARD_H / 2) {
        return { type: 'foundation', index: i };
      }
    }

    // tableau hitboxes (use a tall region so it's easy)
    const ty = this.pos.tableauY;
    for (let i = 0; i < 7; i++) {
      const cx = this.pos.tableauX[i] + this.CARD_W / 2;
      if (Math.abs(x - cx) <= this.CARD_W / 2 && y >= ty - this.CARD_H / 2 && y <= this.scale.height) {
        return { type: 'tableau', index: i };
      }
    }

    // waste (allow dropping to tableau/foundation only, but no harm returning waste)
    const wasteCx = this.pos.wasteX + this.CARD_W / 2;
    if (Math.abs(x - wasteCx) <= this.CARD_W / 2 && Math.abs(y - cyTop) <= this.CARD_H / 2) {
      return { type: 'waste' };
    }

    // stock
    const stockCx = this.pos.stockX + this.CARD_W / 2;
    if (Math.abs(x - stockCx) <= this.CARD_W / 2 && Math.abs(y - cyTop) <= this.CARD_H / 2) {
      return { type: 'stock' };
    }

    return null;
  }

  // ====== move rules ======
  tryMove(fromLoc, movingIds, dropTarget) {
    const movingTop = this.getCard(movingIds[0]);
    if (!movingTop.faceUp) return false;

    // cannot drop a stack to foundation (only single)
    if (dropTarget.type === 'foundation' && movingIds.length !== 1) return false;

    // also, from waste when draw3: only top is draggable already ok
    // remove movingIds from source pile (temporarily)
    const source = this.getPileRef(fromLoc);
    if (!source) return false;

    // verify those ids are on top (except tableau where it can be mid -> we cut from that point)
    if (fromLoc.pileType === 'waste' || fromLoc.pileType === 'foundation') {
      if (this.topOf(source) !== movingIds[0]) return false;
    }
    // destination pile
if (dropTarget.type === 'foundation') {
  const dest = this.foundations[dropTarget.index];
  if (!this.canPlaceOnFoundation(movingTop, dest)) return false;

  const action = { type: 'move', from: fromLoc, to: dropTarget, ids: movingIds.slice() };

  // commit move
  this.cutFromSource(fromLoc, movingIds.length);
  dest.push(movingIds[0]);

  this.afterTableauReveal(fromLoc, action);
  this.pushUndo(action);

  window.SaveGame && window.SaveGame.save && window.SaveGame.save(this);

  return true;
}

if (dropTarget.type === 'tableau') {
  const dest = this.tableau[dropTarget.index];
  if (!this.canPlaceOnTableau(movingTop, dest)) return false;

  const action = { type: 'move', from: fromLoc, to: dropTarget, ids: movingIds.slice() };

  this.cutFromSource(fromLoc, movingIds.length);
  for (const id of movingIds) dest.push(id);

  this.afterTableauReveal(fromLoc, action);
  this.pushUndo(action);

  window.SaveGame && window.SaveGame.save && window.SaveGame.save(this);

  return true;
}


    if (dropTarget.type === 'tableau') {
  const dest = this.tableau[dropTarget.index];
  if (!this.canPlaceOnTableau(movingTop, dest)) return false;

  const action = { type: 'move', from: fromLoc, to: dropTarget, ids: movingIds.slice() };

  this.cutFromSource(fromLoc, movingIds.length);
  for (const id of movingIds) dest.push(id);

  this.afterTableauReveal(fromLoc, action); // <-- теперь reveal записывает action.revealed
  this.pushUndo(action);                   // <-- undo получит revealed

  window.SaveGame && window.SaveGame.save && window.SaveGame.save(this);

  return true;
}

    return false;
  }

  getPileRef(loc) {
    if (!loc) return null;
    if (loc.pileType === 'waste') return this.waste;
    if (loc.pileType === 'stock') return this.stock;
    if (loc.pileType === 'foundation') return this.foundations[loc.index];
    if (loc.pileType === 'tableau') return this.tableau[loc.index];
    return null;
  }

  cutFromSource(loc, countFromTail) {
    const pile = this.getPileRef(loc);
    if (!pile) return;

    if (loc.pileType === 'tableau') {
      pile.splice(loc.pos, countFromTail);
    } else {
      // remove from end
      for (let i = 0; i < countFromTail; i++) pile.pop();
    }
  }

  afterTableauReveal(fromLoc, action) {
  // Железное правило: верх каждой НЕпустой колонны tableau должна быть открыта.
  // Если пришлось что-то открыть, записываем в action.revealed (массив),
  // чтобы undo мог откатить обратно.

  const flipped = [];

  for (let col = 0; col < 7; col++) {
    const pile = this.tableau[col];
    if (!pile || pile.length === 0) continue;

    const topId = pile[pile.length - 1];
    const c = this.getCard(topId);
    if (c && !c.faceUp) {
      c.faceUp = true;
      this.updateCardSprite(c);
      flipped.push(topId);
    }
  }

  if (action && action.type === 'move' && flipped.length) {
    action.revealed = flipped; // важно: именно массив
  }
}


  canPlaceOnFoundation(card, foundationPile) {
    if (!foundationPile.length) {
      return card.value === 1; // Ace
    }
    const top = this.getCard(this.topOf(foundationPile));
    return card.s === top.s && card.value === top.value + 1;
  }

  canPlaceOnTableau(card, tableauPile) {
    if (!tableauPile.length) {
      return card.value === 13; // King
    }
    const top = this.getCard(this.topOf(tableauPile));
    if (!top.faceUp) return false;
    return this.isOppColor(card.s, top.s) && card.value === top.value - 1;
  }

  // ====== undo ======
  pushUndo(action) {
    this.undoStack.push(action);
    while (this.undoStack.length > 10) this.undoStack.shift();
  }

  undo() {
    if (this.drag) return;
    if (!this.undoStack.length) return;

    const action = this.undoStack.pop();

    if (action.type === 'draw') {
      // move drawn back from waste to stock
      const ids = action.fromStockToWaste;
      // ensure waste ends with these ids (they were appended)
      for (let i = ids.length - 1; i >= 0; i--) {
        const id = ids[i];
        // remove that id from waste (should be at end but be safe)
        const pos = this.waste.lastIndexOf(id);
        if (pos >= 0) this.waste.splice(pos, 1);
        const c = this.getCard(id);
        c.faceUp = false;
        this.updateCardSprite(c);
        this.stock.push(id);
      }
      this.relayoutAllCards(false);
      window.SaveGame && window.SaveGame.save && window.SaveGame.save(this);

      return;
    }

    if (action.type === 'recycle') {
      // move from stock back to waste (reverse of recycle)
      const moved = action.moved.slice(); // original waste order
      // remove from stock in the same count
      for (let i = 0; i < moved.length; i++) {
        // stock top should match but be safe:
        const id = this.stock.pop();
        const c = this.getCard(id);
        c.faceUp = true;
        this.updateCardSprite(c);
        this.waste.push(id);
      }
      this.relayoutAllCards(false);
      window.SaveGame && window.SaveGame.save && window.SaveGame.save(this);

      return;
    }

    if (action.type === 'move') {
      // move ids back from destination to source
      const ids = action.ids.slice();
      const to = action.to;
      const from = action.from;

      // undo any revealed flip
if (action.revealed != null) {
  const revIds = Array.isArray(action.revealed) ? action.revealed : [action.revealed];
  for (const rid of revIds) {
    const c = this.getCard(rid);
    if (c) {
      c.faceUp = false;
      this.updateCardSprite(c);
    }
  }
}

      // pull from dest
      if (to.type === 'foundation') {
        const dest = this.foundations[to.index];
        for (let i = 0; i < ids.length; i++) dest.pop();
      } else if (to.type === 'tableau') {
        const dest = this.tableau[to.index];
        for (let i = 0; i < ids.length; i++) dest.pop();
      }

      // push to source
      const src = this.getPileRef(from);
      if (from.pileType === 'tableau') {
        // insert back at original position
        src.splice(from.pos, 0, ...ids);
      } else {
        // append back
        for (const id of ids) src.push(id);
      }

      this.relayoutAllCards(false);
      window.SaveGame && window.SaveGame.save && window.SaveGame.save(this);

      return;
    }
  }

  // ====== layout cards (incl. dense stacks near bottom) ======
  relayoutAllCards(instant) {
    // stock: only show top card back (if any)
    for (let i = 0; i < this.stock.length; i++) {
      const id = this.stock[i];
      const c = this.getCard(id);
      if (!c.sprite) continue;
      c.sprite.setVisible(i === this.stock.length - 1);
      // stock карты не должны быть интерактивными (кликаем только по stockHit)
      if (c.sprite.input) c.sprite.disableInteractive();
      c.sprite.setDepth(100);
      c.faceUp = false;
      this.updateCardSprite(c);

      const x = this.pos.stockX + this.CARD_W / 2;
      const y = this.pos.topY;
      this.placeSprite(c.sprite, x, y, instant);
    }

    // waste: show only top card (you asked that previous waste not visible)
    // waste: show 1 (draw1) or up to 3 (draw3); only top is playable
const wasteX = this.pos.wasteX + this.CARD_W / 2;
const wasteY = this.pos.topY;

const showCount = this.draw3 ? 3 : 1;
const start = Math.max(0, this.waste.length - showCount);
const visible = this.waste.slice(start); // последние 1 или 3

for (let i = 0; i < this.waste.length; i++) {
  const id = this.waste[i];
  const c = this.getCard(id);
  if (!c.sprite) continue;

  const idx = visible.indexOf(id);
  const isVisible = idx !== -1;

  c.sprite.setVisible(isVisible);
  // stock: карты НЕ интерактивные, кликаем только по stockHit
// waste: скрытые карты не должны ловить клики, видимые - должны
if (!isVisible) {
  if (c.sprite.input) c.sprite.disableInteractive();
} else {
  this.applyCardHitArea(c.sprite); // включит интерактив и обновит hitArea
}



  // все карты в waste лицом вверх
  c.faceUp = true;
  this.updateCardSprite(c);

  if (!isVisible) continue;

  // маленький "веер" по X для 3 карт
  const dx = this.draw3 ? Math.round(this.CARD_W * 0.18) : 0;

  const x = wasteX + idx * dx;
  const y = wasteY;

  // верхняя карта (idx=visible.length-1) будет над остальными
  c.sprite.setDepth(120 + idx);

  this.placeSprite(c.sprite, x, y, instant);
}


    // foundations: show only top (stacked)
    for (let f = 0; f < 4; f++) {
      const pile = this.foundations[f];
      for (let i = 0; i < pile.length; i++) {
        const id = pile[i];
        const c = this.getCard(id);
        if (!c.sprite) continue;
        c.sprite.setVisible(i === pile.length - 1);
        c.sprite.setDepth(200 + i);
        c.faceUp = true;
        this.updateCardSprite(c);

        const x = this.pos.foundationX[f] + this.CARD_W / 2;
        const y = this.pos.topY;
        this.placeSprite(c.sprite, x, y, instant);
      }
    }

    // tableau: show all, with dynamic step if near bottom
    const H = this.scale.height;
    const bottomPad = Math.round(Math.max(12, this.PADDING));
    const ty0 = this.pos.tableauY;

    for (let col = 0; col < 7; col++) {
      
      const pile = this.tableau[col];
      const x = this.pos.tableauX[col] + this.CARD_W / 2;
      const colBase = 1000 + col * 200;


      // compute needed height with default step
      const faceUpStart = pile.findIndex((id) => this.getCard(id).faceUp);
      const faceUpCount = faceUpStart >= 0 ? (pile.length - faceUpStart) : 0;
      const faceDownCount = pile.length - faceUpCount;

      const defaultHeight =
        (faceDownCount > 0 ? (faceDownCount - 1) * this.TABLEAU_STEP_DOWN : 0) +
        (faceUpCount > 0 ? (faceUpCount - 1) * this.TABLEAU_STEP_UP : 0) +
        this.CARD_H;

      const available = (H - bottomPad) - (ty0 - this.CARD_H / 2);
      let stepDown = this.TABLEAU_STEP_DOWN;
      let stepUp = this.TABLEAU_STEP_UP;

      if (defaultHeight > available && pile.length > 1) {
        // squeeze only the faceUp spacing primarily, but also faceDown a bit
        const overflow = defaultHeight - available;
        const upSlots = Math.max(1, faceUpCount - 1);
        const downSlots = Math.max(1, faceDownCount - 1);

        const reduceUp = Math.min(this.TABLEAU_STEP_UP - 8, Math.ceil(overflow / (upSlots + 0.5 * downSlots)));
        stepUp = Math.max(8, this.TABLEAU_STEP_UP - reduceUp);

        const reduceDown = Math.min(this.TABLEAU_STEP_DOWN - 6, Math.ceil(reduceUp * 0.6));
        stepDown = Math.max(6, this.TABLEAU_STEP_DOWN - reduceDown);
      }

      let y = ty0;
      for (let i = 0; i < pile.length; i++) {
        const id = pile[i];
        const c = this.getCard(id);
        if (!c.sprite) continue;

        c.sprite.setVisible(true);
        c.sprite.setDepth(colBase + i);

        // texture by faceUp
        this.updateCardSprite(c);

        this.placeSprite(c.sprite, x, y, instant);

        // next y
        if (i < pile.length - 1) {
          y += c.faceUp ? stepUp : stepDown;
        }
      }
    }
  }

  fitContainVideo(video) {
  const W = this.scale.width;
  const H = this.scale.height;

  const src = video.getVideoElement();
  if (!src) return;

  const iw = src.videoWidth || 1;
  const ih = src.videoHeight || 1;

  const scale = Math.min(W / iw, H / ih);

  video.setDisplaySize(iw * scale, ih * scale);
  video.setPosition(this.cameras.main.centerX, this.cameras.main.centerY);
}

  placeSprite(sprite, x, y, instant) {
    if (!sprite) return;
    if (instant) {
      sprite.x = x;
      sprite.y = y;
      return;
    }
    this.tweens.add({
      targets: sprite,
      x,
      y,
      duration: 160,
      ease: 'Power2'
    });
  }

  // ====== win check / video ======
  checkWin() {
    const allComplete = this.foundations.every((p) => p.length === 13);
    if (allComplete) this.startWinSequence();
  }

  startWinSequence() {
     this._isGameActive = false;
     this.hideGameTimerUI();
     this.stopGameTimerUI();

     const payload = Session.win();
     AchievementRules.onWin(payload);

  if (this.isWinPlaying) return;
  this.isWinPlaying = true;

  this.fitCoverVideo(this.winVideo);

  // hide UI and stop interactions
  this.hideUI(true);
  if (this.stockHit) this.stockHit.setVisible(false);

  // overlay to catch clicks (skip OR first user gesture to allow playback)
  if (this.winOverlay) this.winOverlay.destroy();
  this.winOverlay = this.add.rectangle(
    this.cameras.main.centerX,
    this.cameras.main.centerY,
    this.scale.width,
    this.scale.height,
    0x000000,
    0.001
  ).setDepth(90000).setInteractive();

  // video
  if (this.winVideo) {
    try { this.winVideo.stop(); } catch (e) {}
    this.winVideo.destroy();
    this.winVideo = null;
  }
  
  this.game.events.emit('music:pauseForWin');

  this.winVideo = this.add.video(this.cameras.main.centerX, this.cameras.main.centerY, 'winvid')
    .setDepth(80000)
    .setOrigin(0.5);

// после создания this.winVideo
const htmlVideo =
  this.winVideo.getVideo?.() || this.winVideo.video || null;

const refit = () => this.fitCoverVideo(this.winVideo);

// 1) пробуем сразу
refit();

// 2) гарантированно после появления реальных размеров
if (htmlVideo) {
  htmlVideo.addEventListener('loadedmetadata', refit, { once: true });
  htmlVideo.addEventListener('loadeddata', refit, { once: true });

  // 3) на всякий случай еще пару раз (как у тебя в меню)
  this.time.delayedCall(0, refit);
  this.time.delayedCall(100, refit);
}


  // ключ: чтобы браузер разрешил autoplay
  this.winVideo.setMute(true);

  // подгоняем размер после загрузки метаданных, иначе videoWidth/videoHeight могут быть 0
  this.winVideo.once('metadata', () => {
    this.fitContainVideo(this.winVideo);
  });

  // попробуем стартануть сразу (на десктопе обычно ок)
  const tryPlay = () => {
    // ВАЖНО: false = не лупим, иначе complete не сработает как надо
    const ok = this.winVideo.play(false);

    // если браузер заблокировал - стартанем по клику по экрану
    // (ok может быть undefined в некоторых версиях Phaser, поэтому просто оставляем fallback по клику ниже)
  };

  tryPlay();
  this.tryStartWinAudio();

  // клик по экрану:
  // - если видео не стартовало из-за политики, этот клик станет "gesture" и видео начнет играть
  // - если уже играет, клик = "пропустить"
  this.winOverlay.on('pointerup', () => {
    if (!this.winVideo) return;

    // если еще не играет - пытаемся запустить по жесту
    if (!this.winVideo.isPlaying()) {
      this.winVideo.play(false);
      return;
    }
     if (this.winOverlay) {
    this.winOverlay.destroy();
    this.winOverlay = null;
}

    // если играет - пропуск: ставим на последний кадр и показываем попап
     this.showWinPopup();
  });

// когда видео дошло до конца: замираем на последнем кадре и показываем попап
this.winVideo.once('complete', () => {
  try { sessionStorage.setItem('skip_auto_resume', '1'); } catch (e) {}
this.showWinPopup();
});

  }


  finishWinSequence() {
    if (!this.isWinPlaying) return;

    // stop video
    if (this.winVideo) {
      try { this.winVideo.stop(); } catch (e) {}
      this.winVideo.destroy();
      this.winVideo = null;
    }

    if (this.winOverlay) {
      this.winOverlay.destroy();
      this.winOverlay = null;
    }

    // show popup (placeholder)
    this.showWinPopup();

    // NOTE: buttons должны появиться только после попапа по твоему описанию.
    // Пока: попап сам решит, закрывать ли и возвращать UI.
  }

  stopWinSequence(restoreUI) {
    if (!this.isWinPlaying) return;
    this.isWinPlaying = false;

    if (this.winVideo) {
      try { this.winVideo.stop(); } catch (e) {}
      this.winVideo.destroy();
      this.winVideo = null;
    }
    if (this.winOverlay) {
      this.winOverlay.destroy();
      this.winOverlay = null;
    }

    if (restoreUI) {
      this.hideUI(false);
      if (this.stockHit) this.stockHit.setVisible(true);
    }
  }

createWinPopupButton({ normalKey, hoverKey, pressedKey, onClick }) {
  const btn = this.add.image(0, 0, normalKey).setOrigin(0.5);
  btn.setInteractive({ useHandCursor: true });

  let isOver = false;
  let isDown = false;

  // базовый scale (потом обновим через __setBaseScale)
  const baseScale = { x: btn.scaleX, y: btn.scaleY };

  const applyScale = (mul, dur = 90) => {
    this.tweens.killTweensOf(btn);
    this.tweens.add({
      targets: btn,
      scaleX: baseScale.x * mul,
      scaleY: baseScale.y * mul,
      duration: dur,
      ease: 'Power2'
    });
  };

  btn.on('pointerover', () => {
    isOver = true;
    if (!isDown) {
      btn.setTexture(hoverKey);
      applyScale(1.05, 120);
    }
  });

  btn.on('pointerout', () => {
    isOver = false;
    if (!isDown) {
      btn.setTexture(normalKey);
      applyScale(1.0, 120);
    }
  });

  btn.on('pointerdown', (pointer, localX, localY, event) => {
  if (event && event.stopPropagation) event.stopPropagation();

  this.game.events.emit('ui:click');
  isDown = true;
  btn.setTexture(pressedKey);
  applyScale(0.96, 60);
});


  // важно: когда отпускаем - решаем по нашему флагу isOver
  btn.on('pointerup', (pointer, localX, localY, event) => {
  if (event && event.stopPropagation) event.stopPropagation();

  if (!isDown) return;
  isDown = false;

  btn.setTexture(isOver ? hoverKey : normalKey);
  applyScale(isOver ? 1.05 : 1.0, 80);

  if (isOver && typeof onClick === 'function') onClick(pointer, event);
});


  // если отпустили вне кнопки (например увели мышь) - сбрасываем
  btn.on('pointerupoutside', () => {
    isDown = false;
    btn.setTexture(isOver ? hoverKey : normalKey);
    applyScale(isOver ? 1.05 : 1.0, 80);
  });

  // чтобы после setScale снаружи пересчитать базу
  btn.__setBaseScale = () => {
    baseScale.x = btn.scaleX;
    baseScale.y = btn.scaleY;
  };

  return btn;
}
  showWinPopup() {
    this.hideGameTimerUI();
    this.stopWinAudio();
    this.game.events.emit('music:resumeAfterWin');

    // ВАЖНО: если overlay победы еще жив - он перехватывает клики и блокирует попап
if (this.winOverlay) {
  try { this.winOverlay.disableInteractive(); } catch (e) {}
  this.winOverlay.destroy();
  this.winOverlay = null;
}

  // если попап уже открыт - не создаем второй
   if (!this.winPopup) {
    this.winPopup = { overlay: null, container: null, bg: null, sticker: null, btnNewGame: null, btnMenu: null };
  }

  if (this.winPopup && this.winPopup.container) return;

  const W = this.scale.width;
  const H = this.scale.height;

  // затемнение (можешь сделать 0.0 если не нужно)
  const overlay = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.15)
    .setDepth(98000)

  // контейнер попапа
  const container = this.add.container(W / 2, H + 10).setDepth(99000);

  // фон попапа
  const bg = this.add.image(0, 0, 'winpopup_bg').setOrigin(0.5);

  // ---------- НАСТРОЙКА РАЗМЕРА ПОПАПА ----------
  // Тут можешь менять размер попапа: popupScale
  const popupTargetW = Math.min(W * 0.78, 720); // <-- можно править
  const bgSrc = bg.texture.getSourceImage();
  const popupScale = popupTargetW / (bgSrc.width || 1);
  bg.setScale(popupScale);

  container.add(bg);

  // ---------- РАНДОМНАЯ КАРТИНКА (СТИКЕР) ----------
  const stickers = ['win_cool', 'win_goodgirl', 'win_goodjob', 'win_wow'];
  const stickerKey = Phaser.Utils.Array.GetRandom(stickers);

  const sticker = this.add.image(0, 0, stickerKey).setOrigin(0.5);

  // ---------- НАСТРОЙКА РАЗМЕРА/ПОЗИЦИИ СТИКЕРА ----------
  // 1) stickerY - двигает выше/ниже внутри попапа
  // 2) stickerScaleMul - множитель размера
  const stickerY = -bg.displayHeight * 0.38;      // <-- ДВИГАТЬ ВЕРТИКАЛЬ СТИКЕРА
  const stickerScaleMul = 1;                  // <-- МЕНЯТЬ РАЗМЕР СТИКЕРА

  sticker.setPosition(0, stickerY);
  sticker.setScale(popupScale * stickerScaleMul);

  container.add(sticker);

  // ---------- КНОПКИ ----------
  const btnNewGame = this.createWinPopupButton({
    normalKey: 'btn_ng_normal',
    hoverKey: 'btn_ng_hover',
    pressedKey: 'btn_ng_pressed',
    onClick: (pointer, event) => {
    event?.stopPropagation?.();

  // временно выключаем клики, чтобы не было двойных нажатий
  this.input.enabled = false;

  const doAction = () => {
    this.input.enabled = true;

    this.exitWinMode();
    Session.start('win_popup');
    this.newGame();
  };

  if (window.Platform && window.Platform.showInterstitial) {
    window.Platform.showInterstitial('win_new_game').finally(doAction);
  } else {
    doAction();
  }
}


  });

  const btnMenu = this.createWinPopupButton({
    normalKey: 'btn_mm_normal',
    hoverKey: 'btn_mm_hover',
    pressedKey: 'btn_mm_pressed',
    onClick: (pointer, event) => {
    event?.stopPropagation?.();

  // чтобы не было двойных нажатий
  this.input.enabled = false;

  const doAction = () => {
  this.input.enabled = true;

  this.exitWinMode();

  try { window.AchievementRules?.onExitToMenu?.(); } catch (e) {}

  // ВАЖНО: запретить auto-resume при заходе в меню
  try { sessionStorage.setItem('force_menu', '1'); } catch (e) {}
  try { sessionStorage.setItem('resume_context', 'menu'); } catch (e) {}

  this.time.delayedCall(0, () => {
    this.scene.start('MenuScene');
  });
};

  // сначала реклама, потом действие
  if (window.Platform && window.Platform.showInterstitial) {
    window.Platform.showInterstitial('win_main_menu').finally(doAction);
  } else {
    doAction();
  }
}


  });

  btnNewGame.setDepth(99500);
  btnMenu.setDepth(99500);

  // ---------- НАСТРОЙКА РАСПОЛОЖЕНИЯ КНОПОК ----------
 // ---------- КНОПКИ ДРУГ ПОД ДРУГОМ ----------

// БАЗОВАЯ вертикаль первой кнопки
const firstButtonY = bg.displayHeight * 0.003; // <-- двигай ВЫШЕ / НИЖЕ

// расстояние между кнопками
const buttonVerticalGap = bg.displayHeight * 0.25; // <-- расстояние между кнопками

// центрируем по X внутри попапа
btnNewGame.setPosition(0, firstButtonY);
btnMenu.setPosition(0, firstButtonY + buttonVerticalGap);

// ===== итоговое время игры над кнопкой "Новая игра" =====
const winSec = (typeof this._lastWinSec === 'number')
  ? this._lastWinSec
  : (typeof this._finalGameSec === 'number' ? this._finalGameSec : 0);

const winTimeText = this.add.text(
  0,
  firstButtonY - bg.displayHeight * 0.57, // двигай выше/ниже при желании
  this.formatMMSS(winSec),
  {
    fontFamily: '"Cygre ExtraBold", Arial, sans-serif',
    fontSize: Math.round(bg.displayHeight * 0.12) + 'px',
    color: '#4FA341'
  }
).setOrigin(0.5).setDepth(99500);

container.add(winTimeText);



  // Размер кнопок: подгоняем под ширину попапа
  const btnTargetW = bg.displayWidth * 0.7;    // <-- ШИРИНА КНОПОК
  btnNewGame.setScale(btnTargetW / btnNewGame.texture.getSourceImage().width);
  btnMenu.setScale(btnTargetW / btnMenu.texture.getSourceImage().width);

  btnNewGame.__setBaseScale();
  btnMenu.__setBaseScale();

  container.add(btnNewGame);
  container.add(btnMenu);

  // сохраняем ссылки
  this.winPopup.overlay = overlay;
  this.winPopup.container = container;
  this.winPopup.bg = bg;
  this.winPopup.sticker = sticker;
  this.winPopup.btnNewGame = btnNewGame;
  this.winPopup.btnMenu = btnMenu;

  // ---------- АНИМАЦИЯ: POPUP СНИЗУ В ЦЕНТР ----------
  const targetY = H / 2;

  this.tweens.add({
    targets: container,
    y: targetY,
    duration: 420,
    ease: 'Back.Out'
  });

  // overlay кликом НЕ закрываем (по твоему описанию это не нужно),
  // но если захочешь закрывать по клику по фону - раскомментируй:
  /*
  overlay.on('pointerup', () => {
    // ничего не делаем или закрываем:
    // this.closeWinPopup(true);
  });
  */

  // при ресайзе нужно перестроить (если у тебя есть onResize)
  // сделаем просто: на resize закрыть и снова открыть можно позже,
  // но лучше аккуратно обновлять. Пока оставим как есть.
}

closeWinPopup(stopVideoToo) {
  // убрать попап
  if (this.winPopup) {
    if (this.winPopup.btnNewGame) this.winPopup.btnNewGame.destroy();
    if (this.winPopup.btnMenu) this.winPopup.btnMenu.destroy();
    if (this.winPopup.sticker) this.winPopup.sticker.destroy();
    if (this.winPopup.bg) this.winPopup.bg.destroy();
    if (this.winPopup.container) this.winPopup.container.destroy();
    if (this.winPopup.overlay) this.winPopup.overlay.destroy();

    this.winPopup.btnNewGame = null;
    this.winPopup.btnMenu = null;
    this.winPopup.sticker = null;
    this.winPopup.bg = null;
    this.winPopup.container = null;
    this.winPopup.overlay = null;
  }

  // убрать видео (если хочешь)
  if (stopVideoToo) {
    if (this.winVideo) {
      try { this.winVideo.stop(); } catch (e) {}
      this.winVideo.destroy();
      this.winVideo = null;
    }
    this.isWinPlaying = false;
  }
}

exitWinMode() {
  // закрыть попап (не трогая UI)
  this.closeWinPopup(false);
  this.stopWinAudio();

  // убрать win overlay (если был)
  if (this.winOverlay) {
    try { this.winOverlay.disableInteractive(); } catch (e) {}
    this.winOverlay.destroy();
    this.winOverlay = null;
  }

  // остановить и убрать видео
  if (this.winVideo) {
    try { this.winVideo.stop(); } catch (e) {}
    this.winVideo.destroy();
    this.winVideo = null;
  }

  // сбросить win-режим
  this.isWinPlaying = false;

  // вернуть кнопки игры
  this.hideUI(false);

  // вернуть клик по колоде
  if (this.stockHit) this.stockHit.setVisible(true);
}

// =========================
// QUICK POPUP: MUSIC / SOUNDS
// =========================
openSoundPopup() {
  if (this.isWinPlaying) return;
  if (this.isSoundPopupOpen) return;
  this.isSoundPopupOpen = true;

  if (!this.soundPopup) {
    this.soundPopup = { overlay: null, container: null, bg: null, toggleMusic: null, toggleSound: null, btnExit: null };
  }

  const W = this.scale.width;
  const H = this.scale.height;

  // затемнение + блок всех кликов по игре (прогресс не сбрасываем)
  const overlay = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.15)
    .setDepth(98000)
    .setInteractive();

  // контейнер попапа
  const container = this.add.container(W / 2, H + 10).setDepth(99000);

  // фон попапа
  const bg = this.add.image(0, 0, 'popup_sounds_bg').setOrigin(0.5);

  // ---------- РАЗМЕР ПОПАПА ----------
  const popupTargetW = Math.min(W * 0.78, 720);
  const bgSrc = bg.texture.getSourceImage();
  const popupScale = popupTargetW / (bgSrc.width || 1);
  bg.setScale(popupScale);
  container.add(bg);

  // читаем текущие настройки
  const saved = JSON.parse(localStorage.getItem('solitaire-settings') || '{}');
  const musicOn = saved.musicOn !== undefined ? saved.musicOn : true;
  const soundOn = saved.soundOn !== undefined ? saved.soundOn : true;

  // ---------- ТУМБЛЕРЫ ----------
  // Позиции внутри попапа: если нужно - подправь проценты.
  const toggleW = bg.displayWidth * 0.22;
  const toggleX = bg.displayWidth * 0.18;
  const toggleMusicY = -bg.displayHeight * 0.2;
  const toggleSoundY = bg.displayHeight * 0.15;

  const makePopupToggle = (x, y, widthPx, initialOn, onChange) => {
    const key = initialOn ? 'tmdl_on' : 'tmdl_off';
    const img = this.add.image(x, y, key)
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    const src = this.textures.get(key).getSourceImage();
    img.setScale(widthPx / (src.width || 1));

    img.isOn = !!initialOn;

    img.on('pointerdown', () => {
      // звук клика как у остальных кнопок
      this.game.events.emit('ui:click');

      img.isOn = !img.isOn;
      const newKey = img.isOn ? 'tmdl_on' : 'tmdl_off';
      img.setTexture(newKey);

      const newSrc = this.textures.get(newKey).getSourceImage();
      img.setScale(widthPx / (newSrc.width || 1));

      if (onChange) onChange(img.isOn);
    });

    return img;
  };

  const toggleMusic = makePopupToggle(toggleX, toggleMusicY, toggleW, musicOn, (v) => {
    // как в настройках: сразу сообщаем MusicScene и сохраняем
    this.game.events.emit('music:setEnabled', v);
    const s = JSON.parse(localStorage.getItem('solitaire-settings') || '{}');
    s.musicOn = v;
    localStorage.setItem('solitaire-settings', JSON.stringify(s));
  });

  const toggleSound = makePopupToggle(toggleX, toggleSoundY, toggleW, soundOn, (v) => {
    // как в настройках: сразу сообщаем SfxScene/GameScene и сохраняем
    this.game.events.emit('sfx:setEnabled', v);
    const s = JSON.parse(localStorage.getItem('solitaire-settings') || '{}');
    s.soundOn = v;
    localStorage.setItem('solitaire-settings', JSON.stringify(s));
  });

  container.add(toggleMusic);
  container.add(toggleSound);

  // ---------- КНОПКА EXIT ----------
  const exitIcon = this.add.image(0, 0, 'popup_exit_icon').setOrigin(0.5);
  exitIcon.setInteractive({ useHandCursor: true });

  // позиция внутри попапа (правый верх)
  exitIcon.setPosition(bg.displayWidth * 0.42, -bg.displayHeight * 0.44);
  const exitTargetW = bg.displayWidth * 0.12;
  const exitSrc = exitIcon.texture.getSourceImage();
  const exitScale = exitTargetW / (exitSrc.width || 1);
  exitIcon.setScale(exitScale);

  // анимация как у Restart (только scale)
  const exitBaseSX = exitIcon.scaleX;
  const exitBaseSY = exitIcon.scaleY;

  exitIcon.on('pointerover', () => {
    this.tweens.killTweensOf(exitIcon);
    this.tweens.add({ targets: exitIcon, scaleX: exitBaseSX * 1.10, scaleY: exitBaseSY * 1.10, duration: 140, ease: 'Power2' });
  });
  exitIcon.on('pointerout', () => {
    this.tweens.killTweensOf(exitIcon);
    this.tweens.add({ targets: exitIcon, scaleX: exitBaseSX, scaleY: exitBaseSY, duration: 140, ease: 'Power2' });
  });
  exitIcon.on('pointerdown', () => {
    this.game.events.emit('ui:click');
    this.tweens.killTweensOf(exitIcon);
    this.tweens.add({ targets: exitIcon, scaleX: exitBaseSX * 0.92, scaleY: exitBaseSY * 0.92, duration: 80, ease: 'Power2' });
  });
  exitIcon.on('pointerup', () => {
  // звук клика как у остальных кнопок
  this.game.events.emit('ui:click');

  // вернуть размер (как после hover)
  this.tweens.killTweensOf(exitIcon);
  this.tweens.add({
    targets: exitIcon,
    scaleX: exitBaseSX,
    scaleY: exitBaseSY,
    duration: 100,
    ease: 'Power2'
  });

  // закрываем всегда, если отпустили по крестику
  this.closeSoundPopup();
});


  container.add(exitIcon);

  // сохраняем ссылки
  this.soundPopup.overlay = overlay;
  this.soundPopup.container = container;
  this.soundPopup.bg = bg;
  this.soundPopup.toggleMusic = toggleMusic;
  this.soundPopup.toggleSound = toggleSound;
  this.soundPopup.btnExit = exitIcon;

  // ---------- АНИМАЦИЯ: СНИЗУ В ЦЕНТР ----------
  const targetY = H / 2;
  this.tweens.add({
    targets: container,
    y: targetY,
    duration: 420,
    ease: 'Back.Out'
  });
}

closeSoundPopup() {
  if (!this.isSoundPopupOpen) return;
  this.isSoundPopupOpen = false;

  const popup = this.soundPopup;
  if (!popup || !popup.container) return;

  // на всякий случай сохраняем текущее состояние
  const saved = JSON.parse(localStorage.getItem('solitaire-settings') || '{}');
  if (popup.toggleMusic) saved.musicOn = !!popup.toggleMusic.isOn;
  if (popup.toggleSound) saved.soundOn = !!popup.toggleSound.isOn;
  localStorage.setItem('solitaire-settings', JSON.stringify(saved));

  // окно "уплывает" вверх
  this.tweens.add({
    targets: popup.container,
    y: -popup.bg.displayHeight,
    duration: 260,
    ease: 'Power2',
    onComplete: () => {
      if (popup.btnExit) popup.btnExit.destroy();
      if (popup.toggleMusic) popup.toggleMusic.destroy();
      if (popup.toggleSound) popup.toggleSound.destroy();
      if (popup.bg) popup.bg.destroy();
      if (popup.container) popup.container.destroy();
      if (popup.overlay) popup.overlay.destroy();

      popup.btnExit = null;
      popup.toggleMusic = null;
      popup.toggleSound = null;
      popup.bg = null;
      popup.container = null;
      popup.overlay = null;
    }
  });
}

}

class SfxScene extends Phaser.Scene {
  constructor() {
    super({ key: 'SfxScene' });
    this.enabled = true;
    this.userUnlocked = false;

    this.sndUi = null;
  }

  
  create() {
    const saved = JSON.parse(localStorage.getItem('solitaire-settings') || '{}');
    this.enabled = saved.soundOn !== undefined ? saved.soundOn : true;

    this.sndUi = this.sound.add('klats', { volume: 0.6 });

    // общий флаг разлочки (MusicScene уже выставляет game.audioUnlocked)
    this.userUnlocked = !!this.game.audioUnlocked;

    // слушаем тумблер Sounds
    this.game.events.on('sfx:setEnabled', (v) => {
      
      this.enabled = !!v;
    });

    // когда произошел первый клик (MusicScene эмитит)
    this.game.events.on('audio:unlocked', () => {
      this.userUnlocked = true;
    });

    // универсальный "клик по кнопке"
    this.game.events.on('ui:click', () => {
      this.playUiClick();
    });
  }

  playUiClick() {
    if (!this.enabled) return;
    if (!this.userUnlocked) return;
    if (this.sndUi) this.sndUi.play();
  }
}

class MusicScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MusicScene' });
    this.music = null;
    this.enabled = true;     // по умолчанию включена
    this.userUnlocked = false; // станет true после первого клика/тапа
  }

  create() {
    // читаем настройки
    const saved = JSON.parse(localStorage.getItem('solitaire-settings') || '{}');
    this.enabled = saved.musicOn !== undefined ? saved.musicOn : true;

    // создаем звук (но не запускаем до первого клика)
    this.music = this.sound.add('theme', {
      loop: true,
      volume: 0.3 // примерно 3-4 из 10
    });

    // слушаем события от других сцен
    this.game.events.on('music:setEnabled', (v) => {
      this.enabled = !!v;
      this.syncPlayback();
    });

    this.game.events.on('music:pauseForWin', () => {
      if (this.music && this.music.isPlaying) this.music.pause();
    });

    this.game.events.on('music:resumeAfterWin', () => {
      // возвращаем музыку только если включена и уже был пользовательский клик
      this.syncPlayback();
    });

    // политики площадок: запуск только после первого взаимодействия
    this.input.once('pointerdown', () => {
  this.userUnlocked = true;

  // общий флаг разлочки аудио для всех звуков (и музыки, и SFX)
  this.game.audioUnlocked = true;
  this.game.events.emit('audio:unlocked');

  this.syncPlayback();
   });

   this._onVis = () => {
  if (document.hidden) {
    try { this.sound.pauseAll(); } catch (e) {}
  } else {
    try { this.sound.resumeAll(); } catch (e) {}
    this.syncPlayback?.();
  }
};

document.addEventListener('visibilitychange', this._onVis);

this.events.once('shutdown', () => {
  document.removeEventListener('visibilitychange', this._onVis);
});
  }

  syncPlayback() {
    if (!this.music) return;

    // нельзя играть до первого клика
    if (!this.userUnlocked) {
      if (this.music.isPlaying) this.music.stop();
      return;
    }

    if (this.enabled) {
      if (!this.music.isPlaying) this.music.play();
    } else {
      if (this.music.isPlaying) this.music.stop();
    }
  }
}

// =========================
// ACHIEVEMENTS DATA (легко расширять)
// Чтобы добавить новую награду:
// 1) положи картинку assets/revards/r40.png
// 2) добавь сюда новый объект { id: 40, title: "...", desc: "..." }
// 3) (позже) добавим условие выдачи в код логики
// =========================


config.scene = [Boot, LoadingScene, MenuScene, TutorialScene, SettingsScene, GameScene, MusicScene, SfxScene];

// ===== PATCH: гасим баг Phaser Video playPromiseErrorHandler =====
(function patchPhaserVideoPlayPromise() {
  if (!window.Phaser || !Phaser.GameObjects || !Phaser.GameObjects.Video) return;

  const proto = Phaser.GameObjects.Video.prototype;
  if (proto.__patchedPlayPromiseErrorHandler) return;

  const orig = proto.playPromiseErrorHandler;
  proto.playPromiseErrorHandler = function (err) {
    // если объект или сцена уже уничтожены - просто молча выходим
    if (!this || !this.scene || !this.scene.sys) return;
    try { return orig.call(this, err); } catch (e) {}
  };

  proto.__patchedPlayPromiseErrorHandler = true;
})();


// 1) game
let game = null;

function applyLetterbox() {
  if (!window.__phaserGame || !window.__phaserGame.canvas) return;

  const DW = 1920;
  const DH = 1080;

  const container = document.getElementById('game-container') || document.body;
  const cw = container.clientWidth || window.innerWidth;
  const ch = container.clientHeight || window.innerHeight;

  const scale = Math.min(cw / DW, ch / DH);

  const displayW = Math.floor(DW * scale);
  const displayH = Math.floor(DH * scale);

  const canvas = window.__phaserGame.canvas;

  canvas.style.width = displayW + 'px';
  canvas.style.height = displayH + 'px';

  canvas.style.position = 'absolute';
  canvas.style.left = '50%';
  canvas.style.top = '50%';
  canvas.style.transform = 'translate(-50%, -50%)';
}

// делаем доступным для index.html (setVh дергает это)
window.__applyLetterbox = applyLetterbox;

// 2) letterbox / refresh (без ошибок)
function refreshBounds() {
  // если есть наша letterbox-функция - используем ее
  if (window.__applyLetterbox) {
    try { window.__applyLetterbox(); } catch (e) {}
    return;
  }

  // запасной вариант - просто refresh Phaser scale
  if (!window.__phaserGame || !window.__phaserGame.scale) return;
  try { window.__phaserGame.scale.refresh(); } catch (e) {}
}

// 3) старт Phaser
function startPhaser() {
  if (game) return;

  game = new Phaser.Game(config);
  window.__phaserGame = game;

  // убрать лоадер после первого кадра
  requestAnimationFrame(() => {
    const el = document.getElementById('boot-loader');
    if (el) el.style.display = 'none';
  });

  // вызывать только после создания canvas
  setTimeout(refreshBounds, 0);

  window.addEventListener('resize', refreshBounds);
  window.addEventListener('scroll', refreshBounds, { passive: true });
}

(async () => {
  let initPromise = null;

  try {
    initPromise = window.Platform?.init?.(); // запускаем init, но не ждем
  } catch (e) {}

  // Phaser стартует сразу
  startPhaser();

  // если нужно - дождемся платформы
  try {
    await initPromise;
  } catch (e) {}
})();