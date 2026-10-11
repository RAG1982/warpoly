/**
 * trackKit.js — pequenos construtores de camadas para escrever faixas com pouco texto (usados por `tracksHuman.js` e
 * `tracksOrc.js`). PURO. Cada função devolve um objeto de camada do `musicEngine.js`.
 *
 *   P(inst, oct, vel, steps, extra)   camada `pattern`; `steps` pode ser texto "passo:grau:duração[@vel]" separado por espaços
 *   H(inst, oct, vel, extra)          camada `hold` (o acorde inteiro sustentado no compasso)
 *   DR(inst, steps, extra)            camada `drum` (texto de percussão de `dr()` ou lista de velocidades)
 *   LN(inst, oct, vel, line, extra)   camada `line` (melodia escrita em graus da escala)
 *   each(spb, every, fn)              um passo a cada `every` passos; `fn(passo, k)` devolve {n, dur, vel?} ou nada
 *   peace(faction, spb, layers)       camadas de uma faixa de paz + a evolução pelo tempo de partida
 */
import { evolutionLayers } from './musicEngine.js';

/** "0:0:3 8:2:2@0.8" -> [{i:0,n:0,dur:3},{i:8,n:2,dur:2,vel:0.8}] (passo:grau do acorde:duração). */
export function st(str) {
  return str.trim().split(/\s+/).filter(Boolean).map((tok) => {
    const [head, v] = tok.split('@');
    const [i, n, dur] = head.split(':').map(Number);
    if (![i, n, dur].every(Number.isFinite)) throw new Error(`passo inválido: ${tok}`);
    return v ? { i, n, dur, vel: Number(v) } : { i, n, dur };
  });
}

export const P = (inst, oct, vel, steps, extra = {}) => ({ kind: 'pattern', inst, oct, vel, steps: typeof steps === 'string' ? st(steps) : steps, ...extra });
export const H = (inst, oct, vel, extra = {}) => ({ kind: 'hold', inst, oct, vel, ...extra });
export const DR = (inst, steps, extra = {}) => ({ kind: 'drum', inst, steps, ...extra });
export const LN = (inst, oct, vel, line, extra = {}) => ({ kind: 'line', inst, oct, vel, line, ...extra });

export function each(spb, every, fn) {
  const out = [];
  for (let i = 0, k = 0; i < spb; i += every, k++) {
    const r = fn(i, k);
    if (r) out.push({ i, ...r });
  }
  return out;
}

/** Faixa de paz = camadas próprias + camadas de evolução pelo tempo (ver `evolutionLayers`). */
export const peace = (faction, spb, layers) => [...layers, ...evolutionLayers(spb, faction)];

/** Registro que sobe em intensidade alta (a camada principal da melodia). */
export const LIFT = Object.freeze({ at: 0.75, oct: 1 });
