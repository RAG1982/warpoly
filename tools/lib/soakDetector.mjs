/**
 * soakDetector.mjs (F10-02) — detectores puros do soak test IA×IA. Sem three.js/DOM: testável em
 * Vitest. `tools/soak.mjs` extrai amostras numéricas do GameManager e as passa para cá.
 */

/** Verdadeiro se algum número da lista não for finito (NaN/±Infinity/undefined). */
export function hasNonFinite(values) {
  for (let i = 0; i < values.length; i++) if (!Number.isFinite(values[i])) return true;
  return false;
}

/**
 * Travamento sem progresso: a "assinatura" de progresso (posições + recursos + HP) fica idêntica
 * por `stallTicks` ticks consecutivos.
 */
export class StallDetector {
  constructor(stallTicks = 2400) {
    this.stallTicks = stallTicks;
    this.lastSig = null;
    this.lastChangeTick = 0;
    this.stalledAt = null;
  }
  observe(tick, signature) {
    if (this.lastSig === null || signature !== this.lastSig) {
      this.lastSig = signature;
      this.lastChangeTick = tick;
    } else if (this.stalledAt === null && tick - this.lastChangeTick >= this.stallTicks) {
      this.stalledAt = this.lastChangeTick;
    }
    return this.stalledAt !== null;
  }
}

/**
 * Vazamento de entidades: a contagem total sobe em todas as últimas `window` amostras e termina
 * acima de `minCount` e de `ratio`× o início da janela.
 */
export class LeakDetector {
  constructor({ window = 10, minCount = 600, ratio = 2 } = {}) {
    this.window = window;
    this.minCount = minCount;
    this.ratio = ratio;
    this.samples = [];
    this.leaked = null;
  }
  observe(tick, count) {
    this.samples.push(count);
    const n = this.window;
    if (this.leaked || this.samples.length < n) return !!this.leaked;
    const w = this.samples.slice(-n);
    let rising = true;
    for (let i = 1; i < n; i++) {
      if (w[i] <= w[i - 1]) {
        rising = false;
        break;
      }
    }
    if (rising && w[n - 1] >= this.minCount && w[n - 1] >= this.ratio * w[0]) {
      this.leaked = { tick, from: w[0], to: w[n - 1] };
    }
    return !!this.leaked;
  }
}

/** Compara duas execuções da mesma seed; `null` se iguais, senão a descrição da divergência. */
export function determinismDiff(a, b) {
  if (a.checksum === b.checksum && a.ticks === b.ticks) return null;
  return `checksum ${a.checksum}/${b.checksum}, ticks ${a.ticks}/${b.ticks}`;
}
