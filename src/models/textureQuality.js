import * as THREE from 'three';

/**
 * Qualidade das texturas procedurais (F1-01).
 *
 * Todo o código de pintura dos arquivos `*Textures.js` foi escrito em coordenadas
 * absolutas de um canvas "lógico" (normalmente 2048×2048). Em vez de reescrever
 * milhares de chamadas, o canvas físico é criado menor e o contexto recebe um
 * `ctx.scale(fator)`; assim o desenho continua usando as mesmas coordenadas.
 *
 * Presets (lado máximo do canvas físico):
 *   low 256 · med 512 · high 1024 · ultra 2048 (= comportamento antigo)
 *
 * Ordem de leitura: `?texq=low|med|high|ultra` na URL → localStorage
 * `warpoly.textureQuality` → `med`.
 *
 * O que NÃO respeita `ctx.scale` e como é tratado aqui:
 * - `shadowBlur`, `shadowOffsetX/Y`: são em pixels do dispositivo. O contexto
 *   recebe acessores próprios que multiplicam o valor pelo fator.
 * - `drawImage(canvasEscalado, dx, dy)` (3 argumentos): usaria o tamanho físico
 *   da origem como tamanho lógico. O contexto converte para
 *   `drawImage(src, dx, dy, larguraLógica, alturaLógica)`; na forma de 9
 *   argumentos o retângulo de origem é convertido para pixels físicos.
 * - `getImageData`/`putImageData`/`createImageData` e `createPattern` com canvas
 *   escalado: NÃO são convertidos (nenhum `*Textures.js` os usa hoje). Se algum
 *   código novo precisar deles, trabalhe em pixels físicos (`canvas.width`).
 * - `lineWidth`, fontes, gradientes e `arc`/`rect` respeitam a transformação e
 *   não precisam de tratamento. Traços/pontos menores que 1 px físico viram
 *   antialias (equivale ao que o mipmap faria com a textura grande).
 * - `setTransform`/`resetTransform` descartariam o fator base: não use nos
 *   `*Textures.js` (use `save/scale/restore`).
 */

export const TEXTURE_QUALITY_SIDES = Object.freeze({
  low: 256,
  med: 512,
  high: 1024,
  ultra: 2048
});

const ANISOTROPY = Object.freeze({ low: 2, med: 4, high: 8, ultra: 8 });
const STORAGE_KEY = 'warpoly.textureQuality';
const DEFAULT_QUALITY = 'med';

let cachedQuality = null;

function normalizeQuality(value) {
  if (!value) return null;
  const v = String(value).trim().toLowerCase();
  if (v in TEXTURE_QUALITY_SIDES) return v;
  if (v === 'medium' || v === 'medio' || v === 'médio') return 'med';
  if (v === 'baixo') return 'low';
  if (v === 'alto') return 'high';
  return null;
}

/** Nome do preset atual: 'low' | 'med' | 'high' | 'ultra'. */
export function getTextureQuality() {
  if (cachedQuality) return cachedQuality;
  let q = null;
  try {
    if (typeof window !== 'undefined' && window.location) {
      q = normalizeQuality(new URLSearchParams(window.location.search).get('texq'));
    }
  } catch (_) { /* sem URL */ }
  if (!q) {
    try {
      if (typeof localStorage !== 'undefined') q = normalizeQuality(localStorage.getItem(STORAGE_KEY));
    } catch (_) { /* storage bloqueado */ }
  }
  cachedQuality = q || DEFAULT_QUALITY;
  return cachedQuality;
}

/**
 * Grava a preferência (vale a partir do próximo carregamento: as texturas são
 * pintadas uma vez e ficam em cache).
 */
export function setTextureQuality(quality) {
  const q = normalizeQuality(quality);
  if (!q) throw new Error(`Qualidade de textura inválida: ${quality}`);
  try { localStorage.setItem(STORAGE_KEY, q); } catch (_) { /* ignora */ }
  return q;
}

/** Lado máximo (px) de um canvas físico no preset atual. */
export function getMaxTextureSide() {
  return TEXTURE_QUALITY_SIDES[getTextureQuality()];
}

/** Fator de escala em relação ao canvas lógico padrão de 2048 px (ultra = 1). */
export function getTextureScale() {
  return getMaxTextureSide() / 2048;
}

/** Em `low` os bump maps não são gerados. */
export function isBumpEnabled() {
  return getTextureQuality() !== 'low';
}

// ---------------------------------------------------------------------------
// Canvas escalado
// ---------------------------------------------------------------------------

/** canvas físico → { w, h, pw, ph } (dimensões lógicas e físicas). */
const logicalInfo = new WeakMap();

const shadowProps = ['shadowBlur', 'shadowOffsetX', 'shadowOffsetY'];

function patchContext(ctx, factor) {
  const nativeDrawImage = ctx.drawImage;
  ctx.drawImage = function patchedDrawImage(img, ...args) {
    const info = img && logicalInfo.get(img);
    if (info) {
      if (args.length === 2) {
        return nativeDrawImage.call(this, img, args[0], args[1], info.w, info.h);
      }
      if (args.length === 8) {
        const kx = info.pw / info.w;
        const ky = info.ph / info.h;
        return nativeDrawImage.call(this, img,
          args[0] * kx, args[1] * ky, args[2] * kx, args[3] * ky,
          args[4], args[5], args[6], args[7]);
      }
    }
    return nativeDrawImage.call(this, img, ...args);
  };

  if (factor === 1) return;
  const proto = Object.getPrototypeOf(ctx);
  for (const prop of shadowProps) {
    let desc = null;
    for (let p = proto; p && !desc; p = Object.getPrototypeOf(p)) {
      desc = Object.getOwnPropertyDescriptor(p, prop);
    }
    if (!desc || !desc.get || !desc.set) continue;
    Object.defineProperty(ctx, prop, {
      configurable: true,
      enumerable: true,
      get() { return desc.get.call(ctx) / factor; },
      set(v) { desc.set.call(ctx, v * factor); }
    });
  }
}

function sideFor(options) {
  let side = getMaxTextureSide() * (options.sideMultiplier ?? 1);
  if (options.minSide) side = Math.max(side, options.minSide);
  if (options.maxSide) side = Math.min(side, options.maxSide);
  return side;
}

/**
 * Cria um canvas cujo tamanho físico respeita a qualidade atual, com o contexto
 * já escalado. Retorna `{ canvas, ctx, width, height }` com width/height LÓGICOS
 * (os pedidos), porque o código de pintura usa esses valores para desenhar.
 *
 * @param {number} width  largura lógica
 * @param {number} height altura lógica
 * @param {{sideMultiplier?:number, minSide?:number, maxSide?:number}} [options]
 */
export function createScaledCanvas(width = 2048, height = 2048, options = {}) {
  if (typeof document === 'undefined') return createNullCanvas(width, height);

  const side = sideFor(options);
  const factor = Math.min(1, side / Math.max(width, height));
  const pw = Math.max(1, Math.round(width * factor));
  const ph = Math.max(1, Math.round(height * factor));

  const canvas = document.createElement('canvas');
  canvas.width = pw;
  canvas.height = ph;
  const ctx = canvas.getContext('2d', { willReadFrequently: false });
  logicalInfo.set(canvas, { w: width, h: height, pw, ph });

  if (pw !== width || ph !== height) ctx.scale(pw / width, ph / height);
  patchContext(ctx, factor);
  return { canvas, ctx, width, height };
}

/**
 * Canvas para bump map: `null` lógico em `low` (pintura vira no-op e
 * `toTexture` devolve null), metade da resolução do albedo em `med`.
 */
export function createBumpCanvas(width = 2048, height = 2048, options = {}) {
  const q = getTextureQuality();
  if (q === 'low') return createNullCanvas(width, height);
  if (q === 'med') {
    return createScaledCanvas(width, height, { ...options, sideMultiplier: (options.sideMultiplier ?? 1) * 0.5 });
  }
  return createScaledCanvas(width, height, options);
}

// ---------------------------------------------------------------------------
// Canvas nulo: aceita qualquer chamada de pintura sem custo
// ---------------------------------------------------------------------------

const NULL_CANVAS = Symbol('warpoly.nullCanvas');
const noop = () => {};
const nullGradient = Object.freeze({ addColorStop: noop });

function createNullCanvas(width, height) {
  const canvas = { width, height, [NULL_CANVAS]: true, getContext: () => ctx };
  const state = {
    canvas,
    globalAlpha: 1,
    lineWidth: 1,
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    fillStyle: '#000000',
    strokeStyle: '#000000',
    font: '10px sans-serif',
    globalCompositeOperation: 'source-over',
    createLinearGradient: () => nullGradient,
    createRadialGradient: () => nullGradient,
    createConicGradient: () => nullGradient,
    createPattern: () => null,
    measureText: () => ({ width: 0 }),
    getLineDash: () => [],
    isPointInPath: () => false,
    isPointInStroke: () => false
  };
  const ctx = new Proxy(state, {
    get(target, prop) {
      if (prop in target) return target[prop];
      return noop;
    },
    set(target, prop, value) {
      target[prop] = value;
      return true;
    }
  });
  return { canvas, ctx, width, height };
}

export function isNullCanvas(canvas) {
  return !canvas || canvas[NULL_CANVAS] === true;
}

// ---------------------------------------------------------------------------
// Textura
// ---------------------------------------------------------------------------

/**
 * CanvasTexture padronizada (mipmaps, filtro trilinear, anisotropia do preset).
 * Devolve `null` para um canvas nulo (ex.: bump em `low`).
 *
 * @param {HTMLCanvasElement} canvas
 * @param {boolean} [isSRGB=true] true para cor (albedo), false para dados
 * @param {{wrapS?:number, wrapT?:number, repeatX?:number, repeatY?:number}} [options]
 */
export function toTexture(canvas, isSRGB = true, options = {}) {
  if (isNullCanvas(canvas)) return null;
  const wrapS = options.wrapS ?? THREE.RepeatWrapping;
  const wrapT = options.wrapT ?? wrapS;

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = isSRGB ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = ANISOTROPY[getTextureQuality()];
  tex.wrapS = wrapS;
  tex.wrapT = wrapT;
  if (options.repeatX !== undefined || options.repeatY !== undefined) {
    tex.repeat.set(options.repeatX ?? 1, options.repeatY ?? 1);
  }
  tex.needsUpdate = true;
  return tex;
}
