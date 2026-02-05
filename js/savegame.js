// savegame.js

function getSaveKey() {
  const profile = (window.Storage && typeof window.Storage.getProfile === 'function')
    ? window.Storage.getProfile()
    : 'guest';
  return `solitaire-${profile}-save-v1`;
}

const LEGACY_SAVE_KEY = 'solitaire-save-v1';

// перенос старого общего сейва в новый профильный (один раз)
function migrateLegacySaveIfNeeded() {
  try {
    const newKey = getSaveKey();

    // если новый сейв уже есть - ничего не делаем
    if (localStorage.getItem(newKey)) return;

    // если есть старый - переносим
    const legacy = localStorage.getItem(LEGACY_SAVE_KEY);
    if (!legacy) return;

    localStorage.setItem(newKey, legacy);
    localStorage.removeItem(LEGACY_SAVE_KEY);
  } catch (e) {}
}


function serializePileIds(scene, pileIds) {
  // pileIds: [cardId, cardId, ...]
  return pileIds.map((id) => {
    const c = scene.getCard(id);
    return {
      key: c.key,           // "as", "10h" ...
      faceUp: !!c.faceUp
    };
  });
}

function buildStateFromScene(scene) {
  return {
    v: 1,
    draw3: !!scene.draw3,

    stock: serializePileIds(scene, scene.stock),
    waste: serializePileIds(scene, scene.waste),

    foundations: scene.foundations.map((pile) => serializePileIds(scene, pile)),
    tableau: scene.tableau.map((pile) => serializePileIds(scene, pile))
  };
}

function safeParse(raw) {
  try {
    const data = JSON.parse(raw);
    return data && typeof data === 'object' ? data : null;
  } catch (e) {
    return null;
  }
}

function load() {
   migrateLegacySaveIfNeeded();
   
  const raw = localStorage.getItem(getSaveKey());
  if (!raw) return null;
  return safeParse(raw);
}

function save(scene) {
  const state = buildStateFromScene(scene);
  localStorage.setItem(getSaveKey(), JSON.stringify(state));
}

function clear() {
  localStorage.removeItem(getSaveKey());
}

function applyStateToScene(scene, state) {
  if (!state) return false;

  // 1) применим draw3 в настройки, чтобы UI/логика совпали
 try {
  if (window.Storage && typeof window.Storage.saveSettings === 'function') {
    window.Storage.saveSettings({ draw3: !!state.draw3 });
  } else {
    // fallback на старый ключ, если Storage внезапно недоступен
    const s = JSON.parse(localStorage.getItem('solitaire-settings') || '{}');
    s.draw3 = !!state.draw3;
    localStorage.setItem('solitaire-settings', JSON.stringify(s));
  }
} catch (e) {}

  // 2) перечитаем настройки в сцену
  if (typeof scene.loadSettings === 'function') scene.loadSettings();

  // 3) строим мапу key -> id из текущей колоды
  const keyToId = new Map();
  for (const c of scene.cards.values()) {
    keyToId.set(c.key, c.id);
  }

  // 4) очищаем текущие кучи
  scene.stock = [];
  scene.waste = [];
  scene.foundations = [[], [], [], []];
  scene.tableau = [[], [], [], [], [], [], []];

  // helper: кладет карты в pile по key и выставляет faceUp
  const fillPile = (targetPile, savedPile) => {
    for (const item of savedPile || []) {
      const id = keyToId.get(item.key);
      if (id == null) continue;

      targetPile.push(id);

      const c = scene.getCard(id);
      c.faceUp = !!item.faceUp;
      scene.updateCardSprite(c);
    }
  };

  fillPile(scene.stock, state.stock);
  fillPile(scene.waste, state.waste);

  for (let i = 0; i < 4; i++) fillPile(scene.foundations[i], state.foundations?.[i] || []);
  for (let i = 0; i < 7; i++) fillPile(scene.tableau[i], state.tableau?.[i] || []);

  // 5) перерисовка
  scene.redrawSlots();
  scene.relayoutAllCards(true);

  return true;
}

window.SaveGame = {
  save,
  load,
  applyStateToScene,

  clear: function () {
  try { localStorage.removeItem(getSaveKey()); } catch (e) {}
}
};
