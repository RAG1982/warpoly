/**
 * AmbiencePlayer.js (F7-08) — camadas de ambiência SINTETIZADAS (sem arquivos): vento, água, grilos, neve e estrondo.
 * Ruído rosa/branco em loop + filtros com LFOs lentos (rajadas, borbulhar); os grilos são pulsos agendados.
 * `setMix` (níveis 0..1 por camada, ver `ambience.js`) cria as camadas que passam a ser audíveis e aposenta (fade + stop +
 * disconnect) as que zeraram. `update` roda ~4×/s (agenda os grilos e os cristais de neve).
 */

/** Escala de cada camada (o nível 1 da mistura vira este ganho). */
const LAYER_SCALE = Object.freeze({ wind: 0.5, water: 0.45, crickets: 0.5, snow: 0.22, rumble: 0.9 });

export class AmbiencePlayer {
  /**
   * @param {{ctx:BaseAudioContext, out:AudioNode, noise:{white:AudioBuffer, pink:AudioBuffer}, rng:()=>number}} o
   */
  constructor({ ctx, out, noise, rng }) {
    this.ctx = ctx;
    this.out = out;
    this.noise = noise;
    this.rng = rng;
    /** @type {Map<string, {name:string, gain:GainNode, sources:AudioScheduledSourceNode[], tick?:(now:number)=>void, stopAt:number}>} */
    this.layers = new Map();
  }

  /** Camadas vivas (para depuração/testes). */
  get active() {
    return [...this.layers.keys()];
  }

  setMix(levels, ramp = 3) {
    const now = this.ctx.currentTime;
    for (const name of Object.keys(LAYER_SCALE)) {
      const level = Math.max(0, Math.min(1, Number(levels[name]) || 0));
      let layer = this.layers.get(name);
      if (level > 0.001) {
        if (!layer) layer = this._create(name);
        layer.stopAt = Infinity;
        layer.gain.gain.cancelScheduledValues(now);
        layer.gain.gain.setTargetAtTime(level * LAYER_SCALE[name], now, ramp / 3);
      } else if (layer && layer.stopAt === Infinity) {
        layer.gain.gain.cancelScheduledValues(now);
        layer.gain.gain.setTargetAtTime(0, now, ramp / 3);
        layer.stopAt = now + ramp * 1.8;
      }
    }
  }

  stop(fade = 1.5) {
    this.setMix({}, fade);
  }

  /** Agenda pulsos/cristais e recolhe camadas que terminaram o fade. */
  update() {
    const now = this.ctx.currentTime;
    for (const [name, layer] of this.layers) {
      if (now >= layer.stopAt) {
        this._destroy(layer);
        this.layers.delete(name);
      } else if (layer.tick) {
        layer.tick(now);
      }
    }
  }

  // ---------------------------------------------------------------- construção das camadas
  _loop(buffer, offsetMax = 1) {
    const s = this.ctx.createBufferSource();
    s.buffer = buffer;
    s.loop = true;
    s.start(0, this.rng() * Math.min(offsetMax, buffer.duration * 0.9));
    return s;
  }

  _filter(type, f, q = 0.7) {
    const b = this.ctx.createBiquadFilter();
    b.type = type;
    b.frequency.value = f;
    b.Q.value = q;
    return b;
  }

  /** LFO senoidal (Hz) cuja saída (±depth) soma ao parâmetro `param`. */
  _lfo(freq, depth, param, sources) {
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.value = depth;
    o.connect(g);
    g.connect(param);
    o.start();
    sources.push(o);
    return o;
  }

  _create(name) {
    const c = this.ctx;
    const gain = c.createGain();
    gain.gain.value = 0;
    gain.connect(this.out);
    const sources = [];
    const layer = { name, gain, sources, stopAt: Infinity };
    const mod = c.createGain();
    mod.connect(gain);

    switch (name) {
      case 'wind': {
        mod.gain.value = 0.7;
        const lp = this._filter('lowpass', 1500);
        const bp = this._filter('bandpass', 450, 0.6);
        const src = this._loop(this.noise.pink, 3);
        src.connect(bp); bp.connect(lp); lp.connect(mod);
        sources.push(src);
        this._lfo(0.09, 260, bp.frequency, sources); // rajadas: o centro do filtro sobe e desce
        this._lfo(0.047, 0.3, mod.gain, sources);
        break;
      }
      case 'water': {
        mod.gain.value = 0.6;
        const bp = this._filter('bandpass', 850, 0.9);
        const lp = this._filter('lowpass', 2600);
        const src = this._loop(this.noise.pink, 3);
        src.connect(bp); bp.connect(lp); lp.connect(mod);
        sources.push(src);
        this._lfo(6.7, 0.14, mod.gain, sources); // borbulhar
        this._lfo(3.1, 0.1, mod.gain, sources);
        break;
      }
      case 'snow': {
        mod.gain.value = 0.5;
        const hp = this._filter('highpass', 4200);
        const lp = this._filter('lowpass', 9500);
        const src = this._loop(this.noise.white, 1);
        src.connect(hp); hp.connect(lp); lp.connect(mod);
        sources.push(src);
        this._lfo(0.11, 0.25, mod.gain, sources);
        layer.tick = (now) => {
          if (this.rng() < 0.3) this._tink(gain, now + this.rng() * 0.25); // cristal de gelo ocasional
        };
        break;
      }
      case 'rumble': {
        mod.gain.value = 0.8;
        const lp = this._filter('lowpass', 85);
        const src = this._loop(this.noise.pink, 3);
        src.connect(lp); lp.connect(mod);
        sources.push(src);
        this._lfo(0.05, 0.35, mod.gain, sources);
        break;
      }
      case 'crickets': {
        mod.gain.value = 1;
        const voices = [0, 1].map((k) => {
          const o = c.createOscillator();
          o.type = 'sine';
          o.frequency.value = 4300;
          const g = c.createGain();
          g.gain.value = 0.0001;
          o.connect(g); g.connect(mod);
          o.start();
          sources.push(o);
          return { o, g, next: c.currentTime + this.rng() * 1.2 + k * 0.4 };
        });
        layer.tick = (now) => {
          for (const v of voices) {
            while (v.next < now + 1.2) {
              const pulses = 3 + Math.floor(this.rng() * 3);
              const amp = 0.2 + this.rng() * 0.15;
              v.o.frequency.setValueAtTime(3900 + this.rng() * 900, v.next);
              for (let k = 0; k < pulses; k++) {
                const t0 = v.next + k * 0.06;
                v.g.gain.setValueAtTime(0.0001, t0);
                v.g.gain.linearRampToValueAtTime(amp, t0 + 0.008);
                v.g.gain.linearRampToValueAtTime(0.0001, t0 + 0.032);
              }
              v.next += pulses * 0.06 + 0.5 + this.rng() * 1.6;
            }
          }
        };
        break;
      }
      default:
        break;
    }
    this.layers.set(name, layer);
    return layer;
  }

  /** Cristal de gelo: seno agudo curtíssimo. */
  _tink(dest, t) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.value = 3000 + this.rng() * 3500;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.06, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + 0.1);
  }

  _destroy(layer) {
    for (const s of layer.sources) {
      try { s.stop(); } catch { /* já parado */ }
    }
    try { layer.gain.disconnect(); } catch { /* ok */ }
  }

  dispose() {
    for (const layer of this.layers.values()) this._destroy(layer);
    this.layers.clear();
  }
}
