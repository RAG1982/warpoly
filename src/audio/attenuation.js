import { AUDIO_SCENE } from './audioConfig.js';

/**
 * attenuation.js (F7-08) — áudio posicional PURO e barato: distância à câmera -> ganho, e posição lateral -> panorama.
 * Sem PannerNode (HRTF custa caro): o ganho é calculado aqui e aplicado num GainNode por voz, com no máximo um
 * StereoPannerNode. Testado em Node (tests/unit/audio.test.js).
 *
 * O "ouvinte" é o alvo da câmera no chão (`sceneManager.cameraTarget`). Só soa o que está na CENA VISÍVEL (`isAudible`:
 * frustum da câmera + margem) e, com a câmera afastada, o volume cai e o raio de audição encolhe (parâmetros em
 * `audioConfig.js`, `AUDIO_SCENE`): longe = "está distante".
 */

/** Ganho abaixo disso é inaudível: a voz nem é criada. */
export const MIN_AUDIBLE = 0.02;

/** Parâmetros do ouvinte (SceneManager.zoomLevel 0,5..1,8): vêm de `AUDIO_SCENE`; `maxPan` é o panorama máximo por voz. */
export const LISTENER_TUNING = Object.freeze({ ...AUDIO_SCENE, minZoom: 0.4, maxZoom: 2.2, maxPan: 0.7 });

const clampZoom = (zoom) => {
  const T = LISTENER_TUNING;
  return typeof zoom === 'number' && Number.isFinite(zoom) ? Math.min(T.maxZoom, Math.max(T.minZoom, zoom)) : 1;
};
/** 0 no zoom "perto" (nearZoom) … 1 no zoom "longe" (farZoom); satura fora. */
const zoomT = (zoom) => {
  const T = LISTENER_TUNING;
  const t = (clampZoom(zoom) - T.nearZoom) / (T.farZoom - T.nearZoom);
  return t < 0 ? 0 : t > 1 ? 1 : t;
};

/**
 * Ganho (0..1) por distância: 1 até `ref`, cai com `(1 - t)^power` até 0 em `max` (t = posição entre os dois raios).
 * Monótono não crescente; `max <= ref` vira degrau. Distância inválida (NaN/Infinity) = 0 (inaudível).
 */
export function distanceGain(distance, ref, max, power = 2) {
  if (typeof distance !== 'number' || !Number.isFinite(distance)) return 0;
  const d = distance < 0 ? 0 : distance;
  if (!(max > ref)) return d <= ref ? 1 : 0;
  if (d <= ref) return 1;
  if (d >= max) return 0;
  const t = (d - ref) / (max - ref);
  return Math.pow(1 - t, power);
}

/**
 * Raios (ref = ganho cheio, max = silêncio) para um zoom de câmera: DIMINUEM quando a câmera se afasta (o mundo fica
 * "longe"); a cena visível é recortada à parte pelo frustum (`isAudible`).
 */
export function listenerRanges(zoom) {
  const T = LISTENER_TUNING;
  const k = zoomT(zoom);
  return { ref: T.refNear + (T.refFar - T.refNear) * k, max: T.maxNear + (T.maxFar - T.maxNear) * k };
}

/** Multiplicador de volume dos efeitos posicionais pelo zoom: +nearDb perto … farDb (−6 dB) no zoom mais longe. */
export function zoomVolume(zoom) {
  const T = LISTENER_TUNING;
  const db = T.nearDb + (T.farDb - T.nearDb) * zoomT(zoom);
  return Math.pow(10, db / 20);
}

/** Produto de matrizes 4×4 colunas-maiores (formato do three.js): `out = a × b`. Sem alocação; `out` não pode ser `a`/`b`. */
export function mulMat4(out, a, b) {
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      out[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
  }
  return out;
}

/**
 * O ponto de mundo `pos` ({x,z,y?}) está na cena visível? Usa, nesta ordem, `listener.viewProj` (projeção × visão da
 * câmera, 16 números colunas-maiores) ou `listener.bounds` ({minX,maxX,minZ,maxZ} no chão). Sem nenhum dos dois não há
 * como recortar: devolve true (testes e modo sem câmera). `margin` = fração da tela além da borda que ainda vale.
 * Pura e sem alocação.
 */
export function inView(pos, listener, margin = LISTENER_TUNING.margin) {
  if (!pos || !listener) return true;
  const m = listener.viewProj;
  if (m && m.length >= 16) {
    const y = typeof pos.y === 'number' ? pos.y : 0;
    const w = m[3] * pos.x + m[7] * y + m[11] * pos.z + m[15];
    if (!(w > 0)) return false; // atrás da câmera
    const lim = w * (1 + 2 * margin); // NDC mede 2 de ponta a ponta: `margin` da tela = 2 × margin em NDC
    const cx = m[0] * pos.x + m[4] * y + m[8] * pos.z + m[12];
    const cy = m[1] * pos.x + m[5] * y + m[9] * pos.z + m[13];
    return Math.abs(cx) <= lim && Math.abs(cy) <= lim;
  }
  const b = listener.bounds;
  if (b) {
    const mx = (b.maxX - b.minX) * margin;
    const mz = (b.maxZ - b.minZ) * margin;
    return pos.x >= b.minX - mx && pos.x <= b.maxX + mx && pos.z >= b.minZ - mz && pos.z <= b.maxZ + mz;
  }
  return true;
}

/**
 * Ponto de decisão do áudio: a emissão em `pos` deve soar? Só se (1) está na cena visível (`inView`, com margem) e
 * (2) o ganho posicional (distância ao alvo da câmera × zoom) passa do limiar. Sem `pos` = interface/alerta global: sempre.
 */
export function isAudible(pos, listener, margin = LISTENER_TUNING.margin) {
  if (!pos || !listener) return true;
  if (!inView(pos, listener, margin)) return false;
  return positionalMix(listener, pos, margin).audible;
}

/**
 * Panorama estéreo (-1 esquerda .. +1 direita) pela componente lateral do deslocamento em relação ao vetor "direita"
 * da câmera no plano do chão. Satura em `range` unidades de afastamento lateral e nunca passa de `maxPan` (som que
 * vem de um lado, sem ficar num canal só).
 */
export function panFor(dx, dz, rightX, rightZ, range, maxPan = LISTENER_TUNING.maxPan) {
  if (!(range > 0)) return 0;
  const side = dx * rightX + dz * rightZ;
  if (!Number.isFinite(side)) return 0;
  const p = side / range;
  return (p < -1 ? -1 : p > 1 ? 1 : p) * maxPan;
}

/**
 * Mistura posicional de uma fonte em `pos` ({x,z}) para o `listener` ({x,z,zoom,rightX,rightZ}).
 * Sem `pos` (som de interface) o resultado é ganho 1, centro. Fora da cena visível = inaudível. Não aloca além do retorno.
 * @returns {{gain:number, pan:number, distance:number, audible:boolean}}
 */
export function positionalMix(listener, pos, margin = LISTENER_TUNING.margin) {
  if (!pos || !listener) return { gain: 1, pan: 0, distance: 0, audible: true };
  if (!inView(pos, listener, margin)) return { gain: 0, pan: 0, distance: 0, audible: false };
  const dx = pos.x - listener.x;
  const dz = pos.z - listener.z;
  const distance = Math.sqrt(dx * dx + dz * dz);
  const { ref, max } = listenerRanges(listener.zoom);
  const gain = distanceGain(distance, ref, max) * zoomVolume(listener.zoom);
  const pan = panFor(dx, dz, listener.rightX ?? 1, listener.rightZ ?? 0, ref);
  return { gain, pan, distance, audible: gain >= MIN_AUDIBLE };
}
