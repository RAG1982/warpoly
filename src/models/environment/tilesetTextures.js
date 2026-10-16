import * as THREE from 'three';
import { createScaledCanvas, toTexture } from '../textureQuality.js';
import { rgb, paintSplat } from './splatPaint.js';

/**
 * F7-04 · textura de terreno por splat map (grama, terra, areia, pedra, neve, lama) para os tilesets não-legados.
 * UMA textura (≤ 2048² lógicos; o preset `?texq=` reduz o canvas físico: low 256, med 512…) cobre o mapa inteiro e é
 * pintada pixel a pixel a partir de altura/declive/ruído (`splatWeights`, puro e testado) + máscaras opcionais do mapa
 * (`splatMasks`, bases em `startSlots`) + estradas (`roads`). Determinística (sem Math.random).
 *
 * MUNDO-5: a pintura dos pixels vive em `splatPaint.js` (pura, testada em Node). Com `regions` (mapa com `biomeGrid`) cada pixel
 * mistura os estilos das regiões de bioma e a lava ganha borda incandescente; sem `regions` é a conta da F7-04, byte a byte.
 */

const LOGICAL = 2048;
const cache = new Map();

/**
 * Estradas/trilhas: `roads = [{ points: [[x, z], ...], width?: 2.2 }]` (coordenadas de mundo). Desenha no contexto lógico 2048².
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array} roads
 * @param {number} size  lado do mundo
 * @param {number} hex   cor base da estrada
 */
export function paintRoads(ctx, roads, size, hex) {
  if (!roads || !roads.length) return;
  const k = LOGICAL / size;
  const [r, g, b] = rgb(hex);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const road of roads) {
    const pts = road.points || [];
    if (pts.length < 2) continue;
    const w = (road.width ?? 2.2) * k;
    const trace = () => {
      ctx.beginPath();
      pts.forEach((p, i) => {
        const x = (p[0] + size / 2) * k, y = (p[1] + size / 2) * k;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
    };
    // borda suave escura, miolo claro e sulcos de roda
    trace(); ctx.strokeStyle = `rgba(${r * 0.6 | 0}, ${g * 0.6 | 0}, ${b * 0.6 | 0}, 0.35)`; ctx.lineWidth = w * 1.35; ctx.stroke();
    trace(); ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.92)`; ctx.lineWidth = w; ctx.stroke();
    trace(); ctx.strokeStyle = `rgba(${r * 0.72 | 0}, ${g * 0.72 | 0}, ${b * 0.72 | 0}, 0.30)`; ctx.lineWidth = w * 0.12;
    ctx.save(); ctx.translate(-w * 0.2, 0); ctx.stroke(); ctx.translate(w * 0.4, 0); ctx.stroke(); ctx.restore();
  }
  ctx.restore();
}

/**
 * Copia a textura legada (cacheada, compartilhada) e pinta estradas por cima. Devolve `{ map, roughnessMap, bumpMap }` novo.
 */
export function withRoads(baseTex, roads, size, roadHex) {
  const src = baseTex.map && baseTex.map.image;
  if (typeof document === 'undefined' || !src || !roads || !roads.length) return baseTex;
  const { canvas, ctx } = createScaledCanvas(LOGICAL, LOGICAL, { sideMultiplier: 2, minSide: 1024, maxSide: 2048 });
  ctx.drawImage(src, 0, 0);
  paintRoads(ctx, roads, size, roadHex);
  return { map: toTexture(canvas, true, { wrapS: THREE.ClampToEdgeWrapping }), roughnessMap: baseTex.roughnessMap, bumpMap: baseTex.bumpMap };
}

/**
 * @param {object} cfg
 * @param {object} cfg.def         tileset (`src/data/tilesets.js`)
 * @param {string} cfg.id          id do mapa (cache)
 * @param {number} cfg.size
 * @param {(x:number,z:number)=>number} cfg.getHeight
 * @param {number} cfg.waterLevel
 * @param {Array}  [cfg.startSlots]  manchas de terra batida sob as bases
 * @param {Array}  [cfg.roads]
 * @param {Array}  [cfg.masks]       `splatMasks`: `{ layer: 'dirt'|'sand'|'rock'|'snow'|'mud'|'grass'|'road', x, z, r, strength? }`
 * @param {import('../../data/biomeRegions.js').RegionMap|null} [cfg.regions]  MUNDO-5: regiões de bioma (mapa com `biomeGrid`); `null` = caminho antigo
 * @param {import('../../data/lavaRender.js').LavaInfo|null} [cfg.lava]  MUNDO-5: lava (borda incandescente no terreno vizinho); `null` = sem lava
 * @returns {{map: THREE.Texture|null, roughnessMap: null, bumpMap: null}}
 */
export function getTilesetTerrainTexture({ def, id, size, getHeight, waterLevel, startSlots = [], roads = [], masks = [], regions = null, lava = null }) {
  // A chave do caminho antigo não muda; o regional e a lava somam a assinatura do `biomeGrid`/da `lavaGrid` (o mesmo id de mapa pode ter outro conteúdo).
  const key = `tileset_${def.id}_${id}_${size}${regions ? `_r${regions.signature}` : ''}${lava ? `_l${lava.signature}` : ''}`;
  if (cache.has(key)) return cache.get(key);
  if (typeof document === 'undefined') return { map: null, roughnessMap: null, bumpMap: null };

  const { canvas, ctx } = createScaledCanvas(LOGICAL, LOGICAL, { sideMultiplier: 2, minSide: 1024, maxSide: 2048 });
  const pw = canvas.width, ph = canvas.height;

  const img = ctx.createImageData(pw, ph);
  paintSplat(img.data, pw, ph, { def, size, getHeight, waterLevel, startSlots, masks, regions, lava });
  ctx.putImageData(img, 0, 0);
  paintRoads(ctx, roads, size, def.palette.road);

  const result = { map: toTexture(canvas, true, { wrapS: THREE.ClampToEdgeWrapping }), roughnessMap: null, bumpMap: null };
  cache.set(key, result);
  return result;
}
