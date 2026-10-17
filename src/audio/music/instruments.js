/**
 * instruments.js (F7-08) — instrumentos sintetizados (osciladores + filtros + envelopes) da música procedural.
 * Cada função agenda UMA nota/golpe em `t` (tempo do AudioContext) e se desfaz sozinha (`stop`): nada fica vivo depois do
 * fim. Sem arquivos de som. Níveis calibrados para a soma ficar abaixo de ~0,8 de pico antes do limitador.
 */

export const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

const FLOOR = 0.0001;

/** Envelope: sobe em `a` s até `peak`, sustenta até `dur`, cai em `r` s. */
function env(g, t, a, peak, dur, r) {
  const p = Math.max(0.0002, peak);
  const hold = Math.max(a, dur);
  g.gain.setValueAtTime(FLOOR, t);
  g.gain.exponentialRampToValueAtTime(p, t + a);
  g.gain.setValueAtTime(p, t + hold);
  g.gain.exponentialRampToValueAtTime(FLOOR, t + hold + r);
  return t + hold + r;
}

function osc(c, type, freq, detune = 0) {
  const o = c.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  if (detune) o.detune.value = detune;
  return o;
}

function noiseSrc(c, noise, t, dur, rng) {
  const n = c.createBufferSource();
  n.buffer = noise;
  n.loop = true;
  n.start(t, rng() * Math.max(0.1, noise.duration - 0.1));
  n.stop(t + dur);
  return n;
}

const filt = (c, type, f, q = 0.7) => {
  const b = c.createBiquadFilter();
  b.type = type;
  b.frequency.value = f;
  b.Q.value = q;
  return b;
};

/**
 * @param {BaseAudioContext} c
 * @param {AudioNode} dest
 * @param {AudioBuffer} noise  ruído branco compartilhado (loop)
 * @param {string} inst  pluck|pad|drone|flute|brass|horn|bass|strings|kick|tom|snare|hat|shaker
 * @param {number} midi  nota (ignorada na percussão)
 * @param {number} t  instante de início (s)
 * @param {number} dur  duração sustentada (s)
 * @param {number} vel  0..1
 * @param {() => number} rng  RNG de render
 */
export function playInstrument(c, dest, noise, inst, midi, t, dur, vel, rng) {
  const f = mtof(midi);
  const g = c.createGain();
  g.connect(dest);
  switch (inst) {
    case 'pluck': {
      const end = env(g, t, 0.008, vel * 0.42, 0.01, 0.9);
      const lp = filt(c, 'lowpass', Math.min(6000, f * 6));
      lp.frequency.setValueAtTime(Math.min(6000, f * 6), t);
      lp.frequency.exponentialRampToValueAtTime(Math.max(300, f * 1.5), t + 0.6);
      const o1 = osc(c, 'triangle', f);
      const o2 = osc(c, 'sine', f * 2);
      const g2 = c.createGain();
      g2.gain.value = 0.3;
      o1.connect(lp); o2.connect(g2); g2.connect(lp); lp.connect(g);
      o1.start(t); o2.start(t); o1.stop(end); o2.stop(end);
      break;
    }
    case 'pad':
    case 'drone': {
      const dark = inst === 'drone';
      const end = env(g, t, dark ? 1.2 : 0.7, vel * (dark ? 0.2 : 0.17), dur, dark ? 1.8 : 1.3);
      const lp = filt(c, 'lowpass', dark ? 420 : 1100);
      const o1 = osc(c, dark ? 'sawtooth' : 'triangle', f, -5);
      const o2 = osc(c, dark ? 'sawtooth' : 'triangle', f, 5);
      o1.connect(lp); o2.connect(lp); lp.connect(g);
      o1.start(t); o2.start(t); o1.stop(end); o2.stop(end);
      break;
    }
    case 'flute': {
      const end = env(g, t, 0.08, vel * 0.3, dur, 0.2);
      const o = osc(c, 'sine', f);
      const o2 = osc(c, 'sine', f * 2);
      const g2 = c.createGain();
      g2.gain.value = 0.12;
      const lfo = osc(c, 'sine', 5.1);
      const lg = c.createGain();
      lg.gain.value = f * 0.006;
      lfo.connect(lg); lg.connect(o.frequency);
      o.connect(g); o2.connect(g2); g2.connect(g);
      const n = noiseSrc(c, noise, t, end - t, rng);
      const bp = filt(c, 'bandpass', Math.min(5000, f * 2), 2);
      const ng = c.createGain();
      ng.gain.value = 0.05;
      n.connect(bp); bp.connect(ng); ng.connect(g);
      o.start(t); o2.start(t); lfo.start(t); o.stop(end); o2.stop(end); lfo.stop(end);
      break;
    }
    case 'brass':
    case 'horn': {
      const horn = inst === 'horn';
      const end = env(g, t, horn ? 0.3 : 0.035, vel * (horn ? 0.26 : 0.3), dur, horn ? 0.6 : 0.12);
      const lp = filt(c, 'lowpass', f * 1.4, 0.9);
      lp.frequency.setValueAtTime(f * 1.4, t);
      lp.frequency.exponentialRampToValueAtTime(Math.min(horn ? 1800 : 5500, f * (horn ? 3 : 5)), t + (horn ? 0.3 : 0.1));
      const o1 = osc(c, 'sawtooth', f, -6);
      const o2 = osc(c, 'sawtooth', f, 6);
      o1.connect(lp); o2.connect(lp); lp.connect(g);
      o1.start(t); o2.start(t); o1.stop(end); o2.stop(end);
      break;
    }
    case 'trumpet': {
      // trompete militar: ataque rápido, brilho que abre, leve vibrato tardio
      const end = env(g, t, 0.025, vel * 0.3, dur, 0.1);
      const lp = filt(c, 'lowpass', f * 2, 1.1);
      lp.frequency.setValueAtTime(f * 2, t);
      lp.frequency.exponentialRampToValueAtTime(Math.min(7000, f * 7), t + 0.06);
      const o1 = osc(c, 'sawtooth', f, -4);
      const o2 = osc(c, 'square', f, 4);
      const g2 = c.createGain();
      g2.gain.value = 0.35;
      const lfo = osc(c, 'sine', 5.5);
      const lg = c.createGain();
      lg.gain.setValueAtTime(0, t);
      lg.gain.linearRampToValueAtTime(f * 0.008, t + Math.max(0.1, dur * 0.6));
      lfo.connect(lg); lg.connect(o1.frequency); lg.connect(o2.frequency);
      o1.connect(lp); o2.connect(g2); g2.connect(lp); lp.connect(g);
      o1.start(t); o2.start(t); lfo.start(t); o1.stop(end); o2.stop(end); lfo.stop(end);
      break;
    }
    case 'fife': {
      // pífaro/piccolo: sino agudo com um sopro de borda
      const end = env(g, t, 0.02, vel * 0.26, dur, 0.1);
      const o = osc(c, 'sine', f);
      const o2 = osc(c, 'sine', f * 3);
      const g2 = c.createGain();
      g2.gain.value = 0.14;
      o.connect(g); o2.connect(g2); g2.connect(g);
      const n = noiseSrc(c, noise, t, end - t, rng);
      const bp = filt(c, 'bandpass', Math.min(7000, f * 2.5), 3);
      const ng = c.createGain();
      ng.gain.value = 0.07;
      n.connect(bp); bp.connect(ng); ng.connect(g);
      o.start(t); o2.start(t); o.stop(end); o2.stop(end);
      break;
    }
    case 'warhorn': {
      // trompa de guerra dos Clãs: grave, rouca, entra levemente abaixo do tom e sobe
      const end = env(g, t, 0.22, vel * 0.3, dur, 0.5);
      const lp = filt(c, 'lowpass', f * 2.2, 1.4);
      lp.frequency.setValueAtTime(f * 1.2, t);
      lp.frequency.exponentialRampToValueAtTime(Math.min(1500, f * 3.5), t + 0.4);
      const o1 = osc(c, 'sawtooth', f, -35);
      const o2 = osc(c, 'sawtooth', f, 9);
      const o3 = osc(c, 'square', f / 2, 0);
      o1.detune.setValueAtTime(-35, t);
      o1.detune.linearRampToValueAtTime(-6, t + 0.25);
      const g3 = c.createGain();
      g3.gain.value = 0.3;
      o1.connect(lp); o2.connect(lp); o3.connect(g3); g3.connect(lp); lp.connect(g);
      o1.start(t); o2.start(t); o3.start(t); o1.stop(end); o2.stop(end); o3.stop(end);
      break;
    }
    case 'bass': {
      const end = env(g, t, 0.012, vel * 0.5, dur * 0.9, 0.14);
      const lp = filt(c, 'lowpass', 520);
      const o1 = osc(c, 'sine', f);
      const o2 = osc(c, 'triangle', f);
      o1.connect(lp); o2.connect(lp); lp.connect(g);
      o1.start(t); o2.start(t); o1.stop(end); o2.stop(end);
      break;
    }
    case 'strings': {
      const end = env(g, t, 0.02, vel * 0.26, dur, 0.09);
      const lp = filt(c, 'lowpass', Math.min(2600, f * 3.2));
      const o1 = osc(c, 'sawtooth', f, -7);
      const o2 = osc(c, 'sawtooth', f, 7);
      o1.connect(lp); o2.connect(lp); lp.connect(g);
      o1.start(t); o2.start(t); o1.stop(end); o2.stop(end);
      break;
    }
    case 'kick': {
      g.gain.setValueAtTime(vel * 0.75, t);
      g.gain.exponentialRampToValueAtTime(FLOOR, t + 0.3);
      const o = osc(c, 'sine', 150);
      o.frequency.setValueAtTime(150, t);
      o.frequency.exponentialRampToValueAtTime(45, t + 0.14);
      o.connect(g);
      o.start(t); o.stop(t + 0.32);
      break;
    }
    case 'tom': {
      g.gain.setValueAtTime(vel * 0.7, t);
      g.gain.exponentialRampToValueAtTime(FLOOR, t + 0.42);
      const o = osc(c, 'sine', 160);
      o.frequency.setValueAtTime(160, t);
      o.frequency.exponentialRampToValueAtTime(70, t + 0.2);
      o.connect(g);
      const n = noiseSrc(c, noise, t, 0.12, rng);
      const lp = filt(c, 'lowpass', 320);
      const ng = c.createGain();
      ng.gain.value = 0.25;
      n.connect(lp); lp.connect(ng); ng.connect(g);
      o.start(t); o.stop(t + 0.44);
      break;
    }
    case 'taiko': {
      // tambor grande dos Clãs: golpe grave com cabeça de ruído
      g.gain.setValueAtTime(vel * 0.8, t);
      g.gain.exponentialRampToValueAtTime(FLOOR, t + 0.55);
      const o = osc(c, 'sine', 110);
      o.frequency.setValueAtTime(110, t);
      o.frequency.exponentialRampToValueAtTime(48, t + 0.22);
      o.connect(g);
      const n = noiseSrc(c, noise, t, 0.09, rng);
      const lp = filt(c, 'lowpass', 600);
      const ng = c.createGain();
      ng.gain.value = 0.35;
      n.connect(lp); lp.connect(ng); ng.connect(g);
      o.start(t); o.stop(t + 0.57);
      break;
    }
    case 'cymbal': {
      // prato de choque: ruído agudo que se estende
      g.gain.setValueAtTime(vel * 0.3, t);
      g.gain.exponentialRampToValueAtTime(FLOOR, t + 0.9);
      const n = noiseSrc(c, noise, t, 0.92, rng);
      const hp = filt(c, 'highpass', 5200);
      n.connect(hp); hp.connect(g);
      break;
    }
    case 'snare': {
      g.gain.setValueAtTime(vel * 0.45, t);
      g.gain.exponentialRampToValueAtTime(FLOOR, t + 0.17);
      const n = noiseSrc(c, noise, t, 0.18, rng);
      const hp = filt(c, 'highpass', 1500);
      n.connect(hp); hp.connect(g);
      const o = osc(c, 'triangle', 200);
      o.frequency.setValueAtTime(200, t);
      o.frequency.exponentialRampToValueAtTime(140, t + 0.09);
      const og = c.createGain();
      og.gain.setValueAtTime(0.5, t);
      og.gain.exponentialRampToValueAtTime(FLOOR, t + 0.1);
      o.connect(og); og.connect(g);
      o.start(t); o.stop(t + 0.12);
      break;
    }
    case 'hat':
    case 'shaker': {
      g.gain.setValueAtTime(vel * 0.3, t);
      g.gain.exponentialRampToValueAtTime(FLOOR, t + 0.06);
      const n = noiseSrc(c, noise, t, 0.07, rng);
      const hp = filt(c, 'highpass', 5500);
      n.connect(hp); hp.connect(g);
      break;
    }
    case 'harpsichord': {
      // cravo: ataque seco e brilhante, duas "ordens" de cordas (uníssono e oitava) e queda rápida
      const end = env(g, t, 0.003, vel * 0.3, 0.012, 0.5);
      const lp = filt(c, 'lowpass', Math.min(9000, f * 9));
      lp.frequency.setValueAtTime(Math.min(9000, f * 9), t);
      lp.frequency.exponentialRampToValueAtTime(Math.max(500, f * 2.5), t + 0.35);
      const o1 = osc(c, 'sawtooth', f, -3);
      const o2 = osc(c, 'square', f * 2, 4);
      const g2 = c.createGain();
      g2.gain.value = 0.22;
      o1.connect(lp); o2.connect(g2); g2.connect(lp); lp.connect(g);
      o1.start(t); o2.start(t); o1.stop(end); o2.stop(end);
      break;
    }
    case 'violin':
    case 'cello': {
      // cordas arqueadas solistas: ataque de arco, vibrato que entra depois (violino mais brilhante e agudo; violoncelo mais escuro)
      const cello = inst === 'cello';
      const end = env(g, t, cello ? 0.09 : 0.06, vel * (cello ? 0.3 : 0.24), dur, 0.14);
      const lp = filt(c, 'lowpass', Math.min(cello ? 2200 : 5200, f * (cello ? 4 : 5)), 0.8);
      const o1 = osc(c, 'sawtooth', f, -5);
      const o2 = osc(c, 'sawtooth', f, 5);
      const lfo = osc(c, 'sine', cello ? 4.6 : 5.6);
      const lg = c.createGain();
      lg.gain.setValueAtTime(0, t);
      lg.gain.linearRampToValueAtTime(f * 0.007, t + Math.max(0.12, dur * 0.5));
      lfo.connect(lg); lg.connect(o1.frequency); lg.connect(o2.frequency);
      o1.connect(lp); o2.connect(lp); lp.connect(g);
      o1.start(t); o2.start(t); lfo.start(t); o1.stop(end); o2.stop(end); lfo.stop(end);
      break;
    }
    case 'trombone': {
      // trombone/tuba: metal grave e cheio, ataque macio, brilho que abre devagar
      const end = env(g, t, 0.07, vel * 0.3, dur, 0.2);
      const lp = filt(c, 'lowpass', f * 1.5, 0.9);
      lp.frequency.setValueAtTime(f * 1.5, t);
      lp.frequency.exponentialRampToValueAtTime(Math.min(2600, f * 4.5), t + 0.18);
      const o1 = osc(c, 'sawtooth', f, -4);
      const o2 = osc(c, 'square', f, 5);
      const g2 = c.createGain();
      g2.gain.value = 0.4;
      o1.connect(lp); o2.connect(g2); g2.connect(lp); lp.connect(g);
      o1.start(t); o2.start(t); o1.stop(end); o2.stop(end);
      break;
    }
    case 'choir': {
      // coro grave (vozes masculinas em "ó/á"): dentes de serra suaves passando por duas formantes
      const end = env(g, t, 0.4, vel * 0.26, dur, 0.6);
      const body = filt(c, 'lowpass', Math.min(1400, f * 6));
      const f1 = filt(c, 'bandpass', 520, 3);
      const f2 = filt(c, 'bandpass', 980, 4);
      const fg = c.createGain();
      fg.gain.value = 1.4;
      const o1 = osc(c, 'sawtooth', f, -8);
      const o2 = osc(c, 'sawtooth', f, 8);
      o1.connect(body); o2.connect(body); body.connect(g);
      o1.connect(f1); o2.connect(f2); f1.connect(fg); f2.connect(fg); fg.connect(g);
      o1.start(t); o2.start(t); o1.stop(end); o2.stop(end);
      break;
    }
    case 'organ': {
      // órgão sombrio: harmônicos de tubo somados (8', 4', 2 2/3', 2')
      const end = env(g, t, 0.05, vel * 0.2, dur, 0.25);
      const lp = filt(c, 'lowpass', Math.min(3200, f * 6));
      lp.connect(g);
      [[1, 1], [2, 0.5], [3, 0.3], [4, 0.2]].forEach(([m, a]) => {
        const o = osc(c, 'sine', f * m);
        const og = c.createGain();
        og.gain.value = a;
        o.connect(og); og.connect(lp);
        o.start(t); o.stop(end);
      });
      break;
    }
    case 'timpani': {
      // tímpano afinado: golpe grave com queda de altura curta e ressonância longa (a nota é dobrada para a faixa 38–52)
      let m = midi;
      while (m > 52) m -= 12;
      while (m < 38) m += 12;
      const tf = mtof(m);
      g.gain.setValueAtTime(vel * 0.85, t);
      g.gain.exponentialRampToValueAtTime(FLOOR, t + 1.1);
      const o = osc(c, 'sine', tf * 1.18);
      o.frequency.setValueAtTime(tf * 1.18, t);
      o.frequency.exponentialRampToValueAtTime(tf, t + 0.09);
      o.connect(g);
      const n = noiseSrc(c, noise, t, 0.06, rng);
      const lp = filt(c, 'lowpass', 500);
      const ng = c.createGain();
      ng.gain.value = 0.3;
      n.connect(lp); lp.connect(ng); ng.connect(g);
      o.start(t); o.stop(t + 1.12);
      break;
    }
    case 'gong': {
      // gongo/tantã: parciais inarmônicos com cauda longa
      g.gain.setValueAtTime(vel * 0.4, t);
      g.gain.exponentialRampToValueAtTime(FLOOR, t + 2.6);
      [[1, 1], [1.47, 0.7], [2.09, 0.5], [2.56, 0.35]].forEach(([m, a]) => {
        const o = osc(c, 'sine', f * m);
        const og = c.createGain();
        og.gain.value = a;
        o.connect(og); og.connect(g);
        o.start(t); o.stop(t + 2.62);
      });
      break;
    }
    case 'bell': {
      // sino de bronze (dobre): parciais de sino, decaimento longo
      g.gain.setValueAtTime(vel * 0.32, t);
      g.gain.exponentialRampToValueAtTime(FLOOR, t + 2.2);
      [[1, 1], [2.0, 0.6], [2.76, 0.45], [5.4, 0.2]].forEach(([m, a]) => {
        const o = osc(c, 'sine', f * m);
        const og = c.createGain();
        og.gain.value = a;
        o.connect(og); og.connect(g);
        o.start(t); o.stop(t + 2.22);
      });
      break;
    }
    default:
      break;
  }
}
