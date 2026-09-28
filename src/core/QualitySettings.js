import * as THREE from 'three';
import { shadowOptions } from '../models/materials.js';

/**
 * Presets de qualidade do renderer (F1-04).
 *
 * Ordem de escolha do preset: `?quality=` na URL > `localStorage['warpoly.quality']` > detecção de GPU.
 * A UI de opções (F6-08) deve usar só `QualitySettings.set(preset)` e ler `QualitySettings.current`.
 *
 * Também grava `localStorage['warpoly.textureQuality']` (low|med|high|ultra), lida pela F1-01 ao gerar texturas.
 * Isso acontece na avaliação deste módulo, que é importado pelo SceneManager antes dos modelos.
 */

const STORAGE_KEY = 'warpoly.quality';
const TEXTURE_KEY = 'warpoly.textureQuality';

/**
 * @typedef {Object} QualityPreset
 * @property {string} name
 * @property {number} maxPixelRatio   teto do devicePixelRatio
 * @property {boolean} antialias      MSAA do contexto (só muda com recarga)
 * @property {boolean} shadows        sombras ligadas
 * @property {'basic'|'pcf'|'vsm'} shadowType
 * @property {number} shadowMapSize
 * @property {number} shadowRadius    suavização do PCF (texels)
 * @property {number} shadowUpdateInterval  1 = todo frame; N = a cada N frames (ou quando o frustum da luz muda)
 * @property {number} maxShadowDistance     raio máximo (u) coberto pela shadow camera
 * @property {boolean} pointLightShadows    PointLights dos modelos projetam sombra (6 passadas cada)
 * @property {'aces'|'agx'|'neutral'|'none'} toneMapping
 * @property {'low'|'med'|'high'|'ultra'} textureQuality
 * @property {boolean} dynamicResolution
 * @property {number} targetFps
 * @property {number} minPixelRatio
 */

/** @type {Record<string, QualityPreset>} */
export const QUALITY_PRESETS = {
  low: {
    name: 'low',
    maxPixelRatio: 1,
    antialias: false,
    shadows: true,
    shadowType: 'pcf',
    shadowMapSize: 1024,
    shadowRadius: 1,
    shadowUpdateInterval: 3,
    maxShadowDistance: 40,
    pointLightShadows: false,
    toneMapping: 'aces',
    textureQuality: 'low',
    dynamicResolution: true,
    targetFps: 30,
    minPixelRatio: 0.6
  },
  med: {
    name: 'med',
    maxPixelRatio: 1.25,
    antialias: true,
    shadows: true,
    shadowType: 'pcf',
    shadowMapSize: 2048,
    shadowRadius: 1.5,
    shadowUpdateInterval: 2,
    maxShadowDistance: 60,
    pointLightShadows: false,
    toneMapping: 'aces',
    textureQuality: 'med',
    dynamicResolution: true,
    targetFps: 45,
    minPixelRatio: 0.75
  },
  high: {
    name: 'high',
    maxPixelRatio: 1.5,
    antialias: true,
    shadows: true,
    shadowType: 'pcf',
    shadowMapSize: 2048,
    shadowRadius: 2,
    shadowUpdateInterval: 1,
    maxShadowDistance: 80,
    pointLightShadows: false,
    toneMapping: 'aces',
    textureQuality: 'high',
    dynamicResolution: true,
    targetFps: 55,
    minPixelRatio: 0.85
  },
  ultra: {
    name: 'ultra',
    maxPixelRatio: 2,
    antialias: true,
    shadows: true,
    shadowType: 'pcf',
    shadowMapSize: 4096,
    shadowRadius: 2.5,
    shadowUpdateInterval: 1,
    maxShadowDistance: 110,
    pointLightShadows: false,
    toneMapping: 'aces',
    textureQuality: 'ultra',
    dynamicResolution: false,
    targetFps: 55,
    minPixelRatio: 1
  }
};

const SHADOW_TYPES = {
  basic: THREE.BasicShadowMap,
  pcf: THREE.PCFShadowMap,
  vsm: THREE.VSMShadowMap
};

const TONE_MAPPINGS = {
  none: THREE.NoToneMapping,
  aces: THREE.ACESFilmicToneMapping,
  agx: THREE.AgXToneMapping,
  neutral: THREE.NeutralToneMapping
};

function safeGet(key) {
  try { return window.localStorage.getItem(key); } catch { return null; }
}

function safeSet(key, value) {
  try { window.localStorage.setItem(key, value); } catch { /* storage bloqueado */ }
}

/** Lê o nome da GPU via WEBGL_debug_renderer_info num contexto descartável. */
export function detectGpuName() {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return '';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    const lose = gl.getExtension('WEBGL_lose_context');
    if (lose) lose.loseContext();
    return String(name || '');
  } catch {
    return '';
  }
}

/** Escolhe o preset padrão a partir da GPU e do tipo de dispositivo. */
export function detectDefaultPreset(gpuName = detectGpuName()) {
  const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
  const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(ua) ||
    (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1 && /Macintosh/.test(ua)); // iPadOS
  const gpu = gpuName.toLowerCase();

  // Renderizador por software: o mínimo possível
  if (/swiftshader|llvmpipe|software|basic render/.test(gpu)) return 'low';
  if (isMobile) {
    // Apple GPU recente e Adreno 7xx aguentam o médio; o resto fica no baixo
    if (/apple gpu|adreno.*7\d\d/.test(gpu)) return 'med';
    return 'low';
  }
  // Integradas de desktop/notebook
  if (/iris.*xe|arc/.test(gpu) && /intel/.test(gpu)) return 'med';
  if (/intel|uhd|hd graphics|mali|adreno|powervr/.test(gpu)) return 'low';
  if (/radeon\(tm\) graphics|radeon graphics|vega \d\b|vega\d\b/.test(gpu)) return 'low'; // APUs AMD
  if (/apple (gpu|m\d)/.test(gpu)) return 'med';
  return 'high';
}

function resolveInitialPreset() {
  let fromUrl = null;
  try { fromUrl = new URLSearchParams(window.location.search).get('quality'); } catch { /* sem window */ }
  if (fromUrl && QUALITY_PRESETS[fromUrl]) return { name: fromUrl, source: 'url' };
  const stored = safeGet(STORAGE_KEY);
  if (stored && QUALITY_PRESETS[stored]) return { name: stored, source: 'storage' };
  return { name: detectDefaultPreset(), source: 'detect' };
}

const initial = resolveInitialPreset();

export const QualitySettings = {
  /** @type {QualityPreset} */
  current: QUALITY_PRESETS[initial.name],
  /** De onde veio o preset atual: 'url' | 'storage' | 'detect' | 'user' */
  source: initial.source,
  presets: QUALITY_PRESETS,

  /** Estado da resolução dinâmica (somente leitura para debug). */
  dynamic: {
    pixelRatio: 1,
    avgFps: 0,
    frames: 0,
    elapsed: 0,
    belowTime: 0,
    aboveTime: 0,
    lastStepFps: 0,
    lockedUntil: 0
  },

  _renderer: null,
  _sceneManager: null,

  get name() { return this.current.name; },

  /** Pixel ratio máximo permitido pelo preset para este dispositivo. */
  maxPixelRatio() {
    return Math.min(window.devicePixelRatio || 1, this.current.maxPixelRatio);
  },

  /**
   * Aplica o preset atual ao renderer e à cena.
   * @param {THREE.WebGLRenderer} renderer
   * @param {import('./SceneManager.js').SceneManager} [sceneManager]
   */
  apply(renderer, sceneManager) {
    const p = this.current;
    this._renderer = renderer;
    if (sceneManager) this._sceneManager = sceneManager;
    const sm = this._sceneManager;

    safeSet(TEXTURE_KEY, p.textureQuality);

    // Resolução
    this.dynamic.pixelRatio = this.maxPixelRatio();
    this.dynamic.belowTime = this.dynamic.aboveTime = 0;
    renderer.setPixelRatio(this.dynamic.pixelRatio);

    // Tone mapping
    renderer.toneMapping = TONE_MAPPINGS[p.toneMapping] ?? THREE.ACESFilmicToneMapping;

    // Sombras
    const shadowTypeChanged = renderer.shadowMap.type !== SHADOW_TYPES[p.shadowType];
    renderer.shadowMap.enabled = p.shadows;
    renderer.shadowMap.type = SHADOW_TYPES[p.shadowType] ?? THREE.PCFShadowMap;
    renderer.shadowMap.autoUpdate = p.shadowUpdateInterval <= 1;
    renderer.shadowMap.needsUpdate = true;

    if (sm && sm.sunLight) {
      const shadow = sm.sunLight.shadow;
      sm.sunLight.castShadow = p.shadows;
      if (shadow.mapSize.x !== p.shadowMapSize || shadowTypeChanged) {
        shadow.mapSize.set(p.shadowMapSize, p.shadowMapSize);
        if (shadow.map) { shadow.map.dispose(); shadow.map = null; }
      }
      shadow.radius = p.shadowRadius;
      sm.shadowUpdateInterval = Math.max(1, p.shadowUpdateInterval | 0);
      sm.maxShadowDistance = p.maxShadowDistance;
      shadowOptions.pointLightShadows = p.shadows && p.pointLightShadows;
      if (typeof sm.invalidateShadowFrustum === 'function') sm.invalidateShadowFrustum();

      // Tipo de sombra / tone mapping entram no programa: força recompilação dos materiais
      if (sm.scene) {
        sm.scene.traverse(o => {
          // Desligar vale para todas as luzes locais; religar só alcança as marcadas (clones perdem o userData:
          // o preset novo vale integralmente após recarregar, como antialias/texturas).
          if (o.isLight && !o.isDirectionalLight) {
            if (!shadowOptions.pointLightShadows) o.castShadow = false;
            else if (o.userData.wantsShadow) o.castShadow = true;
          }
          if (!o.material) return;
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          for (const m of mats) m.needsUpdate = true;
        });
      }
    }
    return p;
  },

  /**
   * Troca o preset, grava a escolha e reaplica se já houver renderer.
   * @param {'low'|'med'|'high'|'ultra'} preset
   * @returns {{preset: QualityPreset, requiresReload: boolean}} requiresReload = antialias mudou (só vale após recarregar)
   */
  set(preset) {
    const p = QUALITY_PRESETS[preset];
    if (!p) throw new Error(`Preset de qualidade desconhecido: ${preset}`);
    const requiresReload = p.antialias !== this.current.antialias || p.textureQuality !== this.current.textureQuality ||
      (p.pointLightShadows && !this.current.pointLightShadows);
    this.current = p;
    this.source = 'user';
    safeSet(STORAGE_KEY, p.name);
    safeSet(TEXTURE_KEY, p.textureQuality);
    if (this._renderer) this.apply(this._renderer, this._sceneManager);
    return { preset: p, requiresReload };
  },

  /**
   * Resolução dinâmica: chamada a cada frame com o delta real (s).
   * Se a média de FPS ficar abaixo do alvo por 2 s, reduz o pixelRatio em 0,1 (até o mínimo do preset);
   * se sobrar margem (> alvo × 1,25) por 3 s, sobe 0,1 até o máximo.
   * Se uma redução não melhorar o FPS (gargalo de CPU), desfaz e trava por 15 s.
   */
  tick(delta) {
    const p = this.current;
    const r = this._renderer;
    if (!p.dynamicResolution || !r || !(delta > 0)) return;
    const d = this.dynamic;
    d.frames++;
    d.elapsed += delta;
    if (d.elapsed < 0.5) return; // média em janelas de 0,5 s
    const fps = d.frames / d.elapsed;
    d.avgFps = d.avgFps ? d.avgFps * 0.5 + fps * 0.5 : fps;
    const window_ = d.elapsed;
    d.frames = 0;
    d.elapsed = 0;

    const now = performance.now();
    if (now < d.lockedUntil) return;

    // Avalia o último passo para baixo: sem ganho => gargalo não é GPU; desfaz.
    if (d.lastStepFps > 0 && d.aboveTime === 0 && d.belowTime === 0) {
      const gained = d.avgFps > d.lastStepFps * 1.03;
      const prev = d.lastStepFps;
      d.lastStepFps = 0;
      if (!gained && d.avgFps < p.targetFps) {
        this._setPixelRatio(Math.min(this.maxPixelRatio(), d.pixelRatio + 0.1));
        d.lockedUntil = now + 15000;
        d.avgFps = prev;
        return;
      }
    }

    if (d.avgFps < p.targetFps * 0.95) {
      d.belowTime += window_;
      d.aboveTime = 0;
      if (d.belowTime >= 2 && d.pixelRatio > p.minPixelRatio + 1e-3) {
        d.lastStepFps = d.avgFps;
        this._setPixelRatio(Math.max(p.minPixelRatio, d.pixelRatio - 0.1));
        d.belowTime = 0;
      }
    } else if (d.avgFps > p.targetFps * 1.25) {
      d.aboveTime += window_;
      d.belowTime = 0;
      if (d.aboveTime >= 3 && d.pixelRatio < this.maxPixelRatio() - 1e-3) {
        this._setPixelRatio(Math.min(this.maxPixelRatio(), d.pixelRatio + 0.1));
        d.aboveTime = 0;
      }
    } else {
      d.belowTime = 0;
      d.aboveTime = 0;
    }
  },

  _setPixelRatio(ratio) {
    const rounded = Math.round(ratio * 100) / 100;
    this.dynamic.pixelRatio = rounded;
    if (this._renderer) this._renderer.setPixelRatio(rounded);
  }
};

// Grava a qualidade de textura já na importação (antes da geração de texturas da F1-01).
safeSet(TEXTURE_KEY, QualitySettings.current.textureQuality);
