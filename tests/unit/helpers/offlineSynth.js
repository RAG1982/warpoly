/**
 * offlineSynth.js — renderizador OFFLINE (Node puro) das receitas de `sfxRecipes.js`: implementa a mesma interface de
 * construtor de voz do `AudioEngine._build` (`gain/osc/filter/burst`, `t`, `rng`, `out`) e calcula as amostras, para os
 * testes poderem medir pico, duração, silêncio e valores não finitos sem Web Audio. Aproximação fiel o bastante para
 * isso (osciladores sine/triangle/sawtooth/square, biquad RBJ, ruído branco, automação set/linear/exponencial/alvo).
 */

class Param {
  constructor(value = 1) {
    this.value = value;
    this.events = []; // [tipo, valor, tempo]
    this._i = 0;
    this._v = value;
    this._t = 0;
  }
  setValueAtTime(v, t) { this.events.push(['set', v, t]); return this; }
  linearRampToValueAtTime(v, t) { this.events.push(['linear', v, t]); return this; }
  exponentialRampToValueAtTime(v, t) { this.events.push(['exp', v, t]); return this; }
  setTargetAtTime(v, t) { this.events.push(['set', v, t]); return this; }
  cancelScheduledValues() { this.events.length = 0; return this; }
  /** Valor no instante `t` (chamado com `t` crescente, uma vez por amostra). */
  at(t) {
    const ev = this.events;
    if (ev.length === 0) return this.value;
    // avança sobre os eventos já concluídos
    while (this._i < ev.length && ev[this._i][2] <= t) {
      this._v = ev[this._i][1];
      this._t = ev[this._i][2];
      this._i++;
    }
    if (this._i < ev.length) {
      const [type, v1, t1] = ev[this._i];
      if (type === 'linear' || type === 'exp') {
        if (this._t === 0 && this._i === 0) { this._v = this.value; }
        const t0 = this._t;
        const f = t1 > t0 ? (t - t0) / (t1 - t0) : 1;
        if (type === 'exp' && this._v > 0 && v1 > 0) return this._v * Math.pow(v1 / this._v, f);
        return this._v + (v1 - this._v) * f;
      }
    }
    return this._i === 0 ? this.value : this._v;
  }
}

class Node {
  constructor(kind) {
    this.kind = kind;
    this.inputs = [];
    this._i = -1;
    this._y = 0;
  }
  connect(dest) { dest.inputs.push(this); return dest; }
}

export function renderRecipe(recipe, opts = {}, { sr = 22050, seed = 1, extra = 0.4 } = {}) {
  let s = seed >>> 0;
  const rng = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const nodes = [];
  const mk = (n) => { nodes.push(n); return n; };
  const out = mk(Object.assign(new Node('gain'), { gain: new Param(1) }));

  const builder = {
    ctx: null, t: 0, rng, out,
    gain: (v) => { const g = mk(Object.assign(new Node('gain'), { gain: new Param(v) })); g.connect(out); return g; },
    osc: (type, f) => {
      const o = mk(Object.assign(new Node('osc'), { type, frequency: new Param(f || 440), start0: Infinity, stop0: Infinity, phase: 0 }));
      o.start = (t = 0) => { o.start0 = t; };
      o.stop = (t = 0) => { o.stop0 = t; };
      return o;
    },
    filter: (type, f, q = 0.7) => mk(Object.assign(new Node('filter'), { type, frequency: new Param(f), Q: new Param(q), x1: 0, x2: 0, y1: 0, y2: 0 })),
    burst: (dur, peak = 1, delay = 0) => {
      const n = mk(Object.assign(new Node('noise'), { start0: delay, stop0: delay + dur + 0.02 }));
      const g = mk(Object.assign(new Node('gain'), { gain: new Param(peak) }));
      g.gain.setValueAtTime(peak, delay);
      g.gain.exponentialRampToValueAtTime(0.001, delay + dur);
      n.connect(g);
      return g;
    }
  };
  recipe.play(builder, opts);

  const evalNode = (n, i, t) => {
    if (n._i === i) return n._y;
    n._i = i;
    let y = 0;
    switch (n.kind) {
      case 'gain': {
        let sum = 0;
        for (let k = 0; k < n.inputs.length; k++) sum += evalNode(n.inputs[k], i, t);
        y = sum * n.gain.at(t);
        break;
      }
      case 'osc': {
        if (t >= n.start0 && t < n.stop0) {
          const f = n.frequency.at(t);
          n.phase += f / sr;
          n.phase -= Math.floor(n.phase);
          const p = n.phase;
          y = n.type === 'sine' ? Math.sin(2 * Math.PI * p)
            : n.type === 'triangle' ? 4 * Math.abs(p - 0.5) - 1
              : n.type === 'sawtooth' ? 2 * p - 1
                : p < 0.5 ? 1 : -1;
        }
        break;
      }
      case 'noise':
        y = t >= n.start0 && t < n.stop0 ? rng() * 2 - 1 : 0;
        break;
      case 'filter': {
        let x = 0;
        for (let k = 0; k < n.inputs.length; k++) x += evalNode(n.inputs[k], i, t);
        const f0 = Math.min(sr * 0.45, Math.max(10, n.frequency.at(t)));
        const q = Math.max(0.05, n.Q.at(t));
        const w = 2 * Math.PI * f0 / sr;
        const cw = Math.cos(w);
        const al = Math.sin(w) / (2 * q);
        let b0, b1, b2;
        if (n.type === 'lowpass') { b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = b0; }
        else if (n.type === 'highpass') { b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = b0; }
        else { b0 = al; b1 = 0; b2 = -al; } // bandpass (ganho de pico 1)
        const a0 = 1 + al, a1 = -2 * cw, a2 = 1 - al;
        y = (b0 * x + b1 * n.x1 + b2 * n.x2 - a1 * n.y1 - a2 * n.y2) / a0;
        n.x2 = n.x1; n.x1 = x; n.y2 = n.y1; n.y1 = y;
        break;
      }
      default:
        break;
    }
    n._y = y;
    return y;
  };

  const dur = recipe.dur + extra;
  const N = Math.ceil(dur * sr);
  const data = new Float32Array(N);
  for (let i = 0; i < N; i++) data[i] = evalNode(out, i, i / sr);
  return { data, sr, seconds: N / sr };
}

/** Medidas de um buffer: pico, RMS, fim audível (último instante acima de `floor`), quantidade de não finitos. */
export function measure(data, sr, floor = 0.004) {
  let peak = 0, sum = 0, bad = 0, last = -1;
  for (let i = 0; i < data.length; i++) {
    const v = data[i];
    if (!Number.isFinite(v)) { bad++; continue; }
    const a = Math.abs(v);
    if (a > peak) peak = a;
    sum += v * v;
    if (a > floor) last = i;
  }
  return { peak, rms: Math.sqrt(sum / Math.max(1, data.length)), end: (last + 1) / sr, bad, length: data.length };
}
