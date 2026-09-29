/**
 * rng.js — RNG determinístico de simulação (F2-03).
 *
 * `mulberry32`: gerador rápido de 32 bits, mesma seed → mesma sequência em qualquer máquina
 * (JS é IEEE-754 determinístico no mesmo motor). Usado por TUDO que altera estado de jogo
 * (`gm.rng` e seus forks); RNG visual (partículas, som, decoração, animação) continua livre em
 * `Math.random`.
 *
 * `fork(label)`: cria um sub-RNG cuja seed é derivada por hash (FNV-1a) da seed do pai + `label`,
 * para que, por exemplo, a geração do mapa (`rngMap`) não consuma a sequência usada pela IA
 * (`rng.fork('ai:'+playerId)`), e vice-versa.
 */

/** Hash FNV-1a de 32 bits de uma string (usado para derivar seeds de fork). */
export function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Gerador mulberry32: `state` (32 bits) → sequência determinística.
 * @param {number} seed
 * @returns {{ next: () => number, int: (n: number) => number, range: (a: number, b: number) => number, pick: (arr: any[]) => any, fork: (label: string) => object }}
 */
export function mulberry32(seed) {
  let a = seed >>> 0;

  /** Próximo float em [0, 1). */
  function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Inteiro em [0, n). */
  function int(n) {
    return Math.floor(next() * n);
  }

  /** Float em [a, b). */
  function range(a2, b) {
    return a2 + next() * (b - a2);
  }

  /** Elemento aleatório de `arr` (ou `undefined` se vazio). */
  function pick(arr) {
    if (!arr || arr.length === 0) return undefined;
    return arr[int(arr.length)];
  }

  /** Sub-RNG determinístico derivado desta seed + `label` (não consome `next()` do pai). */
  function fork(label) {
    // Mistura a seed atual (estado interno `a`, ainda não avançado) com o hash do label.
    return mulberry32((fnv1a(String(label)) ^ Math.imul(a >>> 0, 0x2545f491)) >>> 0);
  }

  return { next, int, range, pick, fork };
}

/** Fábrica nomeada usada pelo GameManager (`createRng(seed)` = `mulberry32(seed)`). */
export function createRng(seed) {
  return mulberry32(seed);
}
