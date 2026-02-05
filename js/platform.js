// platform.js (VK version)

(function () {
  const Platform = {
    name: 'web', // vk | web
    lang: 'ru', // ISO 639-1, set on init
    isReady: false,

    vkBridge: null,
    user: null, // optional: VKWebAppGetUserInfo result

    // =============== cloud ===============
    _cloudEnabled: false,
    _cloudSaveTimer: null,
    _cloudLastPayloadJSON: '',

    _initPromise: null,
    _loadingReadySent: false,

    // VK Storage chunking (safe approach)
    _cloudKeyPrefix: 'cloud_v1_', // keys: cloud_v1_meta, cloud_v1_0, cloud_v1_1...
    _cloudMetaKey: 'cloud_v1_meta',
    _cloudChunkBytes: 3500, // keep under typical per-value limits (VK Storage has practical limits) :contentReference[oaicite:2]{index=2}

    // =============== helpers ===============

    _sleep(ms) {
      return new Promise((r) => setTimeout(r, ms));
    },

    async _withTimeout(promise, ms, label = 'timeout') {
      let t;
      const timeout = new Promise((_, reject) => {
        t = setTimeout(() => reject(new Error(label)), ms);
      });

      try {
        return await Promise.race([promise, timeout]);
      } finally {
        clearTimeout(t);
      }
    },

    _hasVKBridge() {
      return !!(window.vkBridge && typeof window.vkBridge.send === 'function');
    },

    _detectPlatform() {
      return this._hasVKBridge() ? 'vk' : 'web';
    },

    _parseQueryParams() {
      // VK launch params могут быть в search и в hash, берем оба
      const out = {};

      const parse = (s) => {
        if (!s) return;
        const str = s.startsWith('?') || s.startsWith('#') ? s.slice(1) : s;
        str.split('&').forEach((pair) => {
          if (!pair) return;
          const [k, v] = pair.split('=');
          const key = decodeURIComponent(k || '').trim();
          if (!key) return;
          out[key] = decodeURIComponent((v || '').replace(/\+/g, ' '));
        });
      };

      parse(window.location.search);
      // hash может быть вида "#/?vk_..."; вытащим часть после "?"
      const h = window.location.hash || '';
      if (h.includes('?')) {
        parse(h.slice(h.indexOf('?')));
      } else {
        parse(h);
      }

      return out;
    },

    _detectLang() {
      const p = this._parseQueryParams();
      const raw =
        (p.vk_language || p.lang || p.language || '').toString().toLowerCase() ||
        (navigator.language || 'ru').toLowerCase();

      // нормализуем до 2 символов, если пришло типа "ru_RU"
      const short = raw.replace('-', '_').split('_')[0];
      return short || 'ru';
    },

    // =============== VK BRIDGE SAFE SEND ===============

    async _vkSend(method, params = {}, timeoutMs = 8000) {
      if (!this.vkBridge) throw new Error('vkBridge is not available');
      return await this._withTimeout(this.vkBridge.send(method, params), timeoutMs, `${method} timeout`);
    },

    // =============== CLOUD API (VK Storage) ===============
    // Реализуем "cloud" на VK Storage, потому что это per-user storage внутри VK Mini Apps.

    _cloudCanUse() {
      return this.name === 'vk' && !!this.vkBridge;
    },

    _utf8ByteLength(str) {
      // надежно считаем байты
      try {
        return new TextEncoder().encode(str).length;
      } catch {
        // fallback грубый
        return (str || '').length * 2;
      }
    },

    _splitToChunksByBytes(str, chunkBytes) {
      // делим строку на куски, чтобы каждый кусок был <= chunkBytes
      // (без экзотики, достаточно для JSON)
      const chunks = [];
      let cur = '';

      for (let i = 0; i < str.length; i++) {
        const next = cur + str[i];
        if (this._utf8ByteLength(next) > chunkBytes) {
          if (cur) chunks.push(cur);
          cur = str[i];
        } else {
          cur = next;
        }
      }
      if (cur) chunks.push(cur);
      return chunks;
    },

    async cloudLoad() {
      if (!this._cloudCanUse()) return null;

      try {
        // meta: {"n": <count>}
        const metaResp = await this._vkSend('VKWebAppStorageGet', { keys: [this._cloudMetaKey] }, 8000);
        const metaItem = (metaResp?.keys || []).find((x) => x.key === this._cloudMetaKey);
        const metaVal = metaItem?.value || '';
        if (!metaVal) return {};

        let meta = null;
        try {
          meta = JSON.parse(metaVal);
        } catch {
          return {};
        }

        const n = Math.max(0, Math.min(50, Number(meta?.n || 0))); // safety cap
        if (!n) return {};

        const keys = [];
        for (let i = 0; i < n; i++) keys.push(`${this._cloudKeyPrefix}${i}`);

        const dataResp = await this._vkSend('VKWebAppStorageGet', { keys }, 8000);
        const items = dataResp?.keys || [];
        const parts = [];

        for (let i = 0; i < n; i++) {
          const k = `${this._cloudKeyPrefix}${i}`;
          const it = items.find((x) => x.key === k);
          parts.push(it?.value || '');
        }

        const jsonStr = parts.join('');
        if (!jsonStr) return {};

        try {
          const payload = JSON.parse(jsonStr);
          return payload && typeof payload === 'object' ? payload : {};
        } catch (e) {
          console.warn('[Cloud] JSON parse failed', e);
          return {};
        }
      } catch (e) {
        console.warn('[Cloud] load failed', e);
        return null;
      }
    },

    async cloudSave(payload) {
      if (!this._cloudCanUse()) return false;

      let json = '';
      try {
        json = JSON.stringify(payload || {});
      } catch (e) {
        console.warn('[Cloud] stringify failed', e);
        return false;
      }

      try {
        const chunks = this._splitToChunksByBytes(json, this._cloudChunkBytes);

        // 1) записываем куски
        // VKWebAppStorageSet принимает { key, value } по одному вызову
        // поэтому делаем последовательные вызовы, чтобы не словить ограничение/гонки
        for (let i = 0; i < chunks.length; i++) {
          await this._vkSend('VKWebAppStorageSet', { key: `${this._cloudKeyPrefix}${i}`, value: chunks[i] }, 8000);
        }

        // 2) meta (кол-во кусков)
        await this._vkSend('VKWebAppStorageSet', { key: this._cloudMetaKey, value: JSON.stringify({ n: chunks.length }) }, 8000);

        // 3) (опционально) если раньше было больше кусков - старые останутся, но meta их больше не читает.
        // Можно чистить, но это лишние запросы. Если захочешь - добавим уборку.

        return true;
      } catch (e) {
        console.warn('[Cloud] save failed', e);
        return false;
      }
    },

    _scheduleCloudSave(payloadBuilder) {
      if (!this._cloudCanUse()) return;
      if (this._cloudSaveTimer) clearTimeout(this._cloudSaveTimer);

      this._cloudSaveTimer = setTimeout(async () => {
        this._cloudSaveTimer = null;

        let payload = null;
        try {
          payload = payloadBuilder();
        } catch (e) {
          console.warn('[Cloud] payloadBuilder failed', e);
          return;
        }

        // защита от частых одинаковых сохранений
        let json = '';
        try {
          json = JSON.stringify(payload || {});
        } catch (e) {
          json = '';
        }

        if (json && json === this._cloudLastPayloadJSON) return;
        this._cloudLastPayloadJSON = json;

        await this.cloudSave(payload || {});
      }, 1200);
    },

    // ================= INIT =================

    init() {
      if (this._initPromise) return this._initPromise;

      this._initPromise = (async () => {
        const detected = this._detectPlatform();
        this.name = detected;

        // важно: ставим профиль ДО любых обращений к Stats/Storage
        if (window.Storage?.setProfile) {
          window.Storage.setProfile(detected === 'vk' ? 'platform' : 'guest');
        }

        try {
          if (detected === 'vk') {
            await this._initVKSafe();
          } else {
            this._initWeb();
          }
        } catch (e) {
          console.warn('[Platform] init failed, fallback to web', e);
          this.name = 'web';
          this._initWeb();
        }

        if (window.APP) window.APP.platform = this.name;

        this.isReady = true;
        return this.name;
      })();

      return this._initPromise;
    },

    // ================= AUDIO (ads) =================

    _adAudioPaused: false,
    _adPrevMusicOn: true,
    _adPrevSoundOn: true,

    _pauseAudioForAd() {
      if (this._adAudioPaused) return;

      const game = window.__phaserGame;
      const s = window.Storage?.getSettings?.() || {};
      this._adPrevMusicOn = s.musicOn !== false;
      this._adPrevSoundOn = s.soundOn !== false;

      try {
        game?.sound?.pauseAll?.();
      } catch (e) {}

      this._adAudioPaused = true;
    },

    _resumeAudioAfterAd() {
      if (!this._adAudioPaused) return;

      const game = window.__phaserGame;

      let musicOn = this._adPrevMusicOn;
      let soundOn = this._adPrevSoundOn;

      if (typeof musicOn !== 'boolean' || typeof soundOn !== 'boolean') {
        const s = window.Storage?.getSettings?.() || {};
        musicOn = s.musicOn !== false;
        soundOn = s.soundOn !== false;
      }

      if (musicOn || soundOn) {
        try {
          game?.sound?.resumeAll?.();
        } catch (e) {}
      }

      this._adAudioPaused = false;
    },

    // Call once when game is fully loaded (assets ready, first screen shown)
    async gameReady() {
      if (this._loadingReadySent) return;

      try {
        await this.init();
      } catch {
        return;
      }

      this._loadingReadySent = true;
    },

    // ================= ADS API (VK Native Ads) =================
    // Важно: эти методы НИЧЕГО не показывают автоматически.
    // Вызывай их только после явного действия/логического события в игре.

    async showInterstitial(place = '') {
      await this.init();
      if (this.name === 'vk') return this._vkShowNativeAds('interstitial', place);
      return false;
    },

    async showRewarded(place = '') {
      await this.init();
      if (this.name === 'vk') return this._vkShowNativeAds('reward', place);
      return false;
    },

    async _vkCheckNativeAds(ad_format) {
      // optional: можно проверять наличие рекламы, чтобы не показывать кнопку rewarded
      try {
        const res = await this._vkSend('VKWebAppCheckNativeAds', { ad_format }, 8000);
        return !!res?.result;
      } catch (e) {
        return false;
      }
    },

    async _vkShowNativeAds(ad_format, place) {
      if (!this._cloudCanUse()) return false;

      // ad_format: 'interstitial' | 'reward'
      // Это тот же подход, который используют разработчики в bridge-экосистеме (ad_format = reward/interstitial) :contentReference[oaicite:3]{index=3}
      let rewarded = false;

      // (Опционально) можно включить проверку доступности перед показом:
      // const ok = await this._vkCheckNativeAds(ad_format);
      // if (!ok) return false;

      try {
        this._pauseAudioForAd();

        const res = await this._vkSend('VKWebAppShowNativeAds', { ad_format }, 20000);

        // Для reward обычно достаточно result=true, но на всякий случай:
        if (ad_format === 'reward') rewarded = !!res?.result;

        this._resumeAudioAfterAd();
        return ad_format === 'reward' ? rewarded : !!res?.result;
      } catch (e) {
        this._resumeAudioAfterAd();
        console.warn('[VK Ads] failed', ad_format, place, e);
        return false;
      }
    },

    // ================= VK =================

    async _initVKSafe() {
      if (!this._hasVKBridge()) throw new Error('vkBridge is not available');

      this.vkBridge = window.vkBridge;

      // MUST: init bridge (иначе на iOS/Android часть методов может не работать) :contentReference[oaicite:4]{index=4}
      await this._vkSend('VKWebAppInit', {}, 8000);

      // language
      this.lang = this._detectLang();
      window.APP = window.APP || {};
      window.APP.lang = this.lang;
      if (document && document.documentElement) document.documentElement.lang = this.lang;

      // user info (не критично)
      try {
        this.user = await this._vkSend('VKWebAppGetUserInfo', {}, 8000);
      } catch (e) {
        this.user = null;
      }

      // ======= CLOUD: load on start and apply to Storage =======
      if (this._cloudCanUse()) {
        const cloud = await this.cloudLoad();
        if (cloud && window.Storage?.applyCloudData) {
          try {
            window.Storage.applyCloudData(cloud);
            console.log('[Cloud] applied to Storage');
          } catch (e) {
            console.warn('[Cloud] applyCloudData failed', e);
          }
        }

        if (cloud && !window.Storage?.applyCloudData) {
          console.warn('[Cloud] Storage.applyCloudData() not found - cloud load will not be applied');
        }
      }

      // ======= CLOUD: subscribe Storage -> cloud saves =======
      if (this._cloudCanUse()) {
        this._bindStorageToCloud();
      }
    },

    _bindStorageToCloud() {
      if (this._cloudEnabled) return;
      this._cloudEnabled = true;

      if (window.Storage?.onChange) {
        window.Storage.onChange(() => {
          this._scheduleCloudSave(() => window.Storage.exportCloudData());
        });
        return;
      }

      const s = window.Storage;
      if (!s) return;

      const patch = (methodName) => {
        if (typeof s[methodName] !== 'function') return;
        const orig = s[methodName].bind(s);
        s[methodName] = (...args) => {
          const res = orig(...args);
          if (typeof s.exportCloudData === 'function') {
            this._scheduleCloudSave(() => s.exportCloudData());
          }
          return res;
        };
      };

      patch('saveSettings');
      patch('setSettings');
      patch('unlock');
      patch('setHasNew');
      patch('save');

      if (typeof s.exportCloudData !== 'function') {
        console.warn('[Cloud] Storage.exportCloudData() not found - cloud save will not work');
      }
    },

    // ================= WEB =================

    _initWeb() {
      if (window.Storage?.getProfile?.() !== 'platform') {
        window.Storage?.setProfile?.('guest');
      }
      this.vkBridge = null;
      this.user = null;
    }
  };

  window.Platform = Platform;

  // Авто-init. Это безопасно: при ошибках будет fallback.
  Platform.init();
})();
