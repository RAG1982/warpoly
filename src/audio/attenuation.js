/**
 * attenuation.js (F7-08) — áudio posicional PURO e barato: distância à câmera -> ganho, e posição lateral -> panorama.
 * Sem PannerNode (HRTF custa caro): o ganho é calculado aqui e aplicado num GainNode por voz, com no máximo um
 * StereoPannerNode. Testado em Node (tests/unit/audio.test.js).
 *
 * O "ouvinte" é o alvo da câmera no chão (`sceneManager.cameraTarget`); o raio audível cresce com o zoom (câmera
 * afastada vê/ouve uma área maior), como a área visível.
 */

/** Ganho abaixo disso é inaudível: a voz nem é criada. */
export const MIN_AUDIBLE = 0.02;

/** Parâmetros do ouvinte: raio de ganho cheio e raio onde o som some, por unidade de zoom (SceneManager.zoomLevel 0,5..1,8). */
export const LISTENER_TUNING = Object.freeze({ refPerZoom: 26, maxPerZoom: 100, minZoom: 0.4, maxZoom: 2.2, maxPan: 0.7 });

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

/** Raios (ref = ganho cheio, max = silêncio) para um zoom de câmera. */
export function listenerRanges(zoom) {
  const T = LISTENER_TUNING;
  const z = typeof zoom === 'number' && Number.isFinite(zoom) ? Math.min(T.maxZoom, Math.max(T.minZoom, zoom)) : 1;
  return { ref: T.refPerZoom * z, max: T.maxPerZoom * z };
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
 * Sem `pos` (som de interface) o resultado é ganho 1, centro. Não aloca além do objeto de retorno.
 * @returns {{gain:number, pan:number, distance:number, audible:boolean}}
 */
export function positionalMix(listener, pos) {
  if (!pos || !listener) return { gain: 1, pan: 0, distance: 0, audible: true };
  const dx = pos.x - listener.x;
  const dz = pos.z - listener.z;
  const distance = Math.sqrt(dx * dx + dz * dz);
  const { ref, max } = listenerRanges(listener.zoom);
  const gain = distanceGain(distance, ref, max);
  const pan = panFor(dx, dz, listener.rightX ?? 1, listener.rightZ ?? 0, ref);
  return { gain, pan, distance, audible: gain >= MIN_AUDIBLE };
}
