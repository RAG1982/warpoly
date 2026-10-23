import { fhypot } from './fmath.js';
/**
 * steering.js — F3-02: separação por steering (lógica pura, sem three.js/DOM; testável em Node).
 *
 * Em vez de só empurrar unidades sobrepostas depois do movimento (o que gera engarrafamento e
 * "dança" na chegada), cada unidade em marcha desvia suavemente das vizinhas: soma uma força de
 * afastamento proporcional à invasão do espaço pessoal (`raio próprio + raio do vizinho + SEP_MARGIN`)
 * à direção desejada. O avanço nunca é anulado (componente para a frente mínima), então o grupo
 * escoa por passagens estreitas em vez de travar. Vizinhas paradas pesam menos (já "chegaram").
 */

/** Folga de conforto além do contato (u). */
export const SEP_MARGIN = 0.35;
/** Ganho da força de separação sobre a direção desejada (unitária). */
export const SEP_GAIN = 1.4;
/** Peso de um vizinho parado em relação a um em movimento. */
export const STATIONARY_WEIGHT = 0.6;
/** Fração mínima da marcha preservada (evita recuar contra o fluxo). */
export const MIN_FORWARD = 0.3;

/**
 * @param {number} dx  direção desejada X (unitária)
 * @param {number} dz  direção desejada Z
 * @param {number} px  posição da unidade
 * @param {number} pz
 * @param {number} radius  raio da unidade
 * @param {{x:number,z:number,radius:number,stationary:boolean}[]} neighbors
 * @param {number} [gainScale=1]  multiplica o ganho (ex.: 0,5 perto do destino, para a unidade poder assentar)
 * @returns {{x:number,z:number}} direção unitária ajustada
 */
export function steerDirection(dx, dz, px, pz, radius, neighbors, gainScale = 1) {
  let ax = 0;
  let az = 0;
  for (let i = 0; i < neighbors.length; i++) {
    const nb = neighbors[i];
    const ox = px - nb.x;
    const oz = pz - nb.z;
    const d = fhypot(ox, oz);
    const minD = radius + nb.radius + SEP_MARGIN;
    if (d >= minD) continue;
    const push = (minD - d) / minD;
    const w = nb.stationary ? STATIONARY_WEIGHT : 1;
    if (d < 1e-4) {
      // Sobreposição exata: desvia para o lado da marcha (determinístico).
      ax += -dz * push * w;
      az += dx * push * w;
    } else {
      ax += (ox / d) * push * w;
      az += (oz / d) * push * w;
    }
  }
  if (ax === 0 && az === 0) return { x: dx, z: dz };

  let sx = dx + ax * SEP_GAIN * gainScale;
  let sz = dz + az * SEP_GAIN * gainScale;
  // Garante avanço mínimo ao longo da direção desejada.
  const fwd = sx * dx + sz * dz;
  if (fwd < MIN_FORWARD) {
    sx += dx * (MIN_FORWARD - fwd);
    sz += dz * (MIN_FORWARD - fwd);
  }
  const len = fhypot(sx, sz);
  if (len < 1e-6) return { x: dx, z: dz };
  return { x: sx / len, z: sz / len };
}
