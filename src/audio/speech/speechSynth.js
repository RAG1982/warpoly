/**
 * speechSynth.js (F7-08) — sintetizador de fala estilizada por formantes (PURO: Float32Array in/out, sem Web Audio).
 *
 * Modelo fonte-filtro à la Klatt, bem reduzido:
 *   fonte glotal (pulso de Rosenberg derivado) + ruído de aspiração -> cascata de 4 ressonadores (F1..F4) [+ polo nasal]
 *   ruído de fricção -> ressonador próprio (paralelo)  ->  soma  ->  normalização de volume.
 * O texto vem em notação fonética (`phonemes.js`); cada fonema vira segmentos com parâmetros-alvo que se interpolam
 * (coarticulação). A entonação (f0) tem declinação, acentos nas sílabas tônicas e contorno final (`?` sobe, `. !` descem).
 *
 * É propositalmente estilizado/robótico (vozes de jogo), mas determinístico: mesma notação + voz + semente => mesmas
 * amostras (RNG de render próprio, nunca Math.random). Roda em ~1–3 ms por fala; o resultado é cacheado como AudioBuffer.
 *
 * Voz (`voice`): f0 (Hz), range (profundidade da entonação), fs (escala dos formantes: <1 = trato vocal maior),
 * speed, oq (quociente de abertura glotal), breath (ruído de sopro), rough (rouquidão/diplofonia), vib (vibrato),
 * whisper (0..1 sussurro), comb (ms: eco curto "oco" de morto-vivo), tilt (0..1 abafado).
 */
import { createAudioRng } from '../audioConfig.js';
import { parsePhonemes, VOWELS, PLACES, isVowelSym, isNasalVowel, plosiveOf } from './phonemes.js';

export const SPEECH_SR = 22050;
const FRAME = 110; // amostras por quadro de controle (5 ms a 22,05 kHz)

const BASE = Object.freeze({
  av: 0, ah: 0, af: 0, f1: 500, f2: 1500, f3: 2500, b1: 80, b2: 110, b3: 170, nas: 0, ffc: 3000, ffb: 2000, gain: 1
});
const KEYS = Object.freeze(['av', 'ah', 'af', 'f1', 'f2', 'f3', 'b1', 'b2', 'b3', 'nas', 'ffc', 'ffb', 'gain']);

/** Ganho do ramo de fricção em relação ao vozeado (calibrado medindo o RMS de /s/ contra /a/). */
const FRIC_GAIN = 1.3;
/** Ganho do ramo vozeado (a cascata amplifica as ressonâncias). */
const VOICE_GAIN = 1.0;

const mk = (o) => ({ ...BASE, ...o });

/** Parâmetros de uma vogal (oral ou nasal) numa voz. */
function vowelParams(sym, voice) {
  const nasal = isNasalVowel(sym);
  const v = VOWELS[sym[0]];
  const fs = voice.fs || 1;
  return mk({
    av: 1,
    ah: voice.breath ?? 0.05,
    f1: v.f[0] * fs * (nasal ? 0.9 : 1),
    f2: v.f[1] * fs,
    f3: v.f[2] * fs,
    b1: nasal ? 110 : 70,
    b2: 100,
    b3: 160,
    nas: nasal ? 0.85 : 0,
    gain: 1
  });
}

/**
 * Monta o plano da fala: segmentos { t0, dur, tr, P, tag } + acentos de entonação + contornos finais.
 * Pura e testável (duração total = `total`).
 */
export function planUtterance(ph, voice = {}) {
  const items = parsePhonemes(ph);
  const sp = 1 / (voice.speed || 1);
  const fs = voice.fs || 1;
  const segs = [];
  const accents = [];
  const finals = [];
  let t = 0;
  const add = (dur, tr, P, tag) => {
    const s = { t0: t, dur, tr: Math.min(tr, dur), P, tag };
    segs.push(s);
    t += dur;
    return s;
  };

  // Última vogal de cada frase (sílaba final alonga).
  const lastOfPhrase = new Set();
  let lastV = -1;
  items.forEach((it, i) => {
    if (it.k === 'ph' && isVowelSym(it.s)) lastV = i;
    else if (it.k === 'punct') { if (lastV >= 0) lastOfPhrase.add(lastV); lastV = -1; }
  });
  if (lastV >= 0) lastOfPhrase.add(lastV);

  let prev = vowelParams('a', voice); // última configuração vozeada (formantes herdados por h/pausas)
  const nextVowel = (i) => {
    const n = items[i + 1];
    return n && n.k === 'ph' && isVowelSym(n.s) ? vowelParams(n.s, voice) : null;
  };
  const formantsOf = (P) => ({ f1: P.f1, f2: P.f2, f3: P.f3, b1: P.b1, b2: P.b2, b3: P.b3 });

  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (it.k === 'gap') {
      add(0.016 * sp, 0.008, mk({ ...formantsOf(prev), av: 0.5, ah: 0.01, gain: 0.35 }), 'gap');
      continue;
    }
    if (it.k === 'punct') {
      finals.push({ t0: t, m: it.m });
      add((it.m === ',' ? 0.12 : 0.17) * sp, 0.035, mk({ ...formantsOf(prev), gain: 0 }), 'pause');
      continue;
    }

    const s = it.s;
    if (isVowelSym(s)) {
      const P = vowelParams(s, voice);
      let d = (VOWELS[s[0]].d / 1000) * (it.stress ? 1.3 : 0.9) * (isNasalVowel(s) ? 1.15 : 1);
      if (lastOfPhrase.has(i)) d *= 1.3;
      d *= sp;
      const seg = add(d, Math.min(0.03, d * 0.5), P, 'v');
      if (it.stress) accents.push({ t: seg.t0 + seg.dur * 0.45, h: 1 });
      prev = P;
      continue;
    }
    if (s === 'j' || s === 'w') {
      const f = s === 'j' ? VOWELS.i.f : VOWELS.u.f;
      const P = mk({ av: 0.9, ah: 0.03, f1: f[0] * fs, f2: f[1] * fs, f3: f[2] * fs, b1: 80, b2: 110, b3: 170 });
      add(0.052 * sp, 0.022, P, 'glide');
      prev = P;
      continue;
    }

    const pl = plosiveOf(s);
    if (pl) {
      const place = PLACES[pl.place];
      const loc = { f1: place.f[0] * fs, f2: place.f[1] * fs, f3: place.f[2] * fs, b1: 120, b2: 140, b3: 200 };
      const nx = nextVowel(i);
      if (pl.voiced) {
        add(0.04 * sp, 0.02, mk({ ...loc, av: 0.3, gain: 0.35, ah: 0 }), 'closure'); // barra de vozeamento
        add(0.006, 0.001, mk({ ...loc, av: 0.3, af: place.burst.amp * 0.75, ffc: place.burst.c, ffb: place.burst.bw, gain: 0.8 }), 'burst');
        if (nx) add(0.006, 0.003, mk({ ...formantsOf(nx), av: 0.7, gain: 1 }), 'vot');
      } else {
        add(0.046 * sp, 0.022, mk({ ...loc, av: 0, gain: 0 }), 'closure');
        add(0.009, 0.001, mk({ ...loc, af: place.burst.amp, ffc: place.burst.c, ffb: place.burst.bw, gain: 1 }), 'burst');
        add(pl.place === 'lab' ? 0.012 : 0.02, 0.004, mk({ ...(nx ? formantsOf(nx) : formantsOf(prev)), ah: 0.21, av: 0.05, gain: 1 }), 'asp');
      }
      continue;
    }

    switch (s) {
      case 'f': case 'v': {
        const vd = s === 'v';
        add(0.08 * sp, 0.015, mk({ af: vd ? 0.25 : 0.19, ffc: 4800, ffb: 6500, av: vd ? 0.3 : 0, f1: 260 * fs, f2: 1100 * fs, f3: 2300 * fs }), 'fric');
        break;
      }
      case 's': case 'z': {
        const vd = s === 'z';
        add(0.095 * sp, 0.016, mk({ af: vd ? 0.45 : 0.85, ffc: 6200, ffb: 3600, av: vd ? 0.45 : 0, f1: 260 * fs, f2: 1500 * fs, f3: 2500 * fs }), 'fric');
        break;
      }
      case 'S': case 'Z': {
        const vd = s === 'Z';
        add(0.1 * sp, 0.016, mk({ af: vd ? 0.9 : 1.32, ffc: 3300, ffb: 1900, av: vd ? 0.45 : 0, f1: 280 * fs, f2: 1700 * fs, f3: 2500 * fs }), 'fric');
        break;
      }
      case 'tS': {
        add(0.03 * sp, 0.015, mk({ f1: 250 * fs, f2: 1800 * fs, f3: 2600 * fs, gain: 0 }), 'closure');
        add(0.07 * sp, 0.004, mk({ af: 1.19, ffc: 3500, ffb: 2100, f1: 280 * fs, f2: 1800 * fs, f3: 2600 * fs }), 'fric');
        break;
      }
      case 'dZ': {
        add(0.028 * sp, 0.015, mk({ f1: 250 * fs, f2: 1800 * fs, f3: 2600 * fs, av: 0.3, gain: 0.35 }), 'closure');
        add(0.065 * sp, 0.004, mk({ af: 0.8, ffc: 3300, ffb: 2000, av: 0.4, f1: 280 * fs, f2: 1800 * fs, f3: 2600 * fs }), 'fric');
        break;
      }
      case 'h': {
        const nx = nextVowel(i);
        const F = formantsOf(nx || prev);
        add((nx ? 0.05 : 0.046) * sp, 0.012, mk({ ...F, ah: nx ? 0.35 : 0.25, av: 0.1, gain: nx ? 1 : 0.7 }), 'h');
        break;
      }
      case 'R': {
        const nx = nextVowel(i);
        const F = formantsOf(nx || prev);
        add(0.075 * sp, 0.014, mk({ ...F, ah: 0.21, af: 1.4, ffc: 1700, ffb: 1700, av: 0.25 }), 'R');
        break;
      }
      case 'm': case 'n': case 'J': {
        const f2 = s === 'm' ? 1000 : s === 'n' ? 1600 : 2000;
        add(0.068 * sp, 0.016, mk({ av: 0.5, ah: 0.01, f1: 260 * fs, f2: f2 * fs, f3: 2500 * fs, b1: 120, b2: 160, b3: 240, nas: 1, gain: 0.85 }), 'nasal');
        break;
      }
      case 'l': {
        add(0.062 * sp, 0.016, mk({ av: 0.85, ah: 0.02, f1: 350 * fs, f2: 1250 * fs, f3: 2700 * fs, b1: 90 }), 'liquid');
        break;
      }
      case 'L': {
        add(0.075 * sp, 0.018, mk({ av: 0.85, ah: 0.02, f1: 300 * fs, f2: 2050 * fs, f3: 2900 * fs, b1: 90 }), 'liquid');
        break;
      }
      case 'r': {
        add(0.032 * sp, 0.012, mk({ av: 0.65, ah: 0.02, f1: 430 * fs, f2: 1400 * fs, f3: 2150 * fs, b1: 110, gain: 0.55 }), 'tap');
        break;
      }
      default:
        break;
    }
  }

  add(0.04, 0.02, mk({ ...formantsOf(prev), gain: 0 }), 'tail');
  return { segs, accents, finals, total: t, voice };
}

/** Avalia os parâmetros interpolados em `t` (ponteiro monotônico: use um por renderização). */
function makeTrack(segs) {
  let idx = 0;
  return function at(t, out) {
    while (idx < segs.length - 1 && t >= segs[idx + 1].t0) idx++;
    const s = segs[idx];
    const pp = idx > 0 ? segs[idx - 1].P : s.P;
    const u = s.tr > 0 ? Math.min(1, Math.max(0, (t - s.t0) / s.tr)) : 1;
    for (let k = 0; k < KEYS.length; k++) {
      const key = KEYS[k];
      out[key] = pp[key] + (s.P[key] - pp[key]) * u;
    }
  };
}

/** f0(t): declinação + acentos nas tônicas + contorno da pausa/pontuação final. */
function makeF0(plan, voice) {
  const f0 = voice.f0 || 120;
  const range = voice.range ?? 0.22;
  const total = Math.max(0.3, plan.total);
  const { accents, finals } = plan;
  return (t) => {
    let f = f0 * (1.05 - 0.12 * (t / total));
    for (let i = 0; i < accents.length; i++) {
      const x = (t - accents[i].t) / 0.11;
      if (x > -1 && x < 1) f *= 1 + range * 0.55 * accents[i].h * (0.5 + 0.5 * Math.cos(Math.PI * x));
    }
    for (let i = 0; i < finals.length; i++) {
      const fin = finals[i];
      const u = (t - (fin.t0 - 0.28)) / 0.28;
      if (u > 0 && u <= 1.08) {
        const c = u > 1 ? 1 : u;
        const sm = c * c * (3 - 2 * c);
        if (fin.m === '?') f *= 1 + range * 1.1 * sm;
        else if (fin.m === ',') f *= 1 + range * 0.3 * sm;
        else f *= 1 - range * 0.75 * sm;
      }
    }
    return f > 40 ? f : 40;
  };
}

function setRes(r, f, bw, sr) {
  const ff = Math.min(f, sr * 0.45);
  const e = Math.exp(-Math.PI * bw / sr);
  r.c = -e * e;
  r.b = 2 * e * Math.cos(2 * Math.PI * ff / sr);
  r.a = 1 - r.b - r.c;
}
const newRes = () => ({ a: 0, b: 0, c: 0, s1: 0, s2: 0 });

/** Passa-faixa biquad (RBJ, pico 0 dB) para a fricção: encosta nas duas pontas, ao contrário do ressonador normalizado em DC. */
function setBand(bq, f, bw, sr) {
  const fc = Math.min(Math.max(f, 200), sr * 0.45);
  const q = Math.max(0.35, (1.5 * fc) / Math.max(bw, 50)); // dois estágios iguais: Q maior para a banda somada bater com `bw`
  const w0 = (2 * Math.PI * fc) / sr;
  const alpha = Math.sin(w0) / (2 * q);
  const a0 = 1 + alpha;
  bq.b0 = alpha / a0;
  bq.b2 = -alpha / a0;
  bq.a1 = (-2 * Math.cos(w0)) / a0;
  bq.a2 = (1 - alpha) / a0;
}
const newBand = () => ({ b0: 0, b2: 0, a1: 0, a2: 0, x1: 0, x2: 0, y1: 0, y2: 0 });
function runBand(bq, x) {
  const y = bq.b0 * x + bq.b2 * bq.x2 - bq.a1 * bq.y1 - bq.a2 * bq.y2;
  bq.x2 = bq.x1; bq.x1 = x; bq.y2 = bq.y1; bq.y1 = y;
  return y;
}

/**
 * Renderiza a fala. Devolve amostras mono em [-1, 1] (pico <= 0,95), volume nivelado por RMS (todas as falas soam
 * com loudness parecido, independente de ter muita ou pouca vogal).
 * @param {string} ph     notação fonética
 * @param {object} voice  perfil de voz (ver cabeçalho)
 * @param {{sampleRate?:number, seed?:number, targetRms?:number}} [opts]
 * @returns {Float32Array}
 */
export function renderUtterance(ph, voice = {}, opts = {}) {
  const sr = opts.sampleRate || SPEECH_SR;
  const targetRms = opts.targetRms ?? 0.12;
  const plan = planUtterance(ph, voice);
  const rng = createAudioRng(opts.seed ?? 1);
  const N = Math.max(1, Math.ceil((plan.total + 0.03) * sr));
  const out = new Float32Array(N);

  const at = makeTrack(plan.segs);
  const f0Fn = makeF0(plan, voice);
  const fs = voice.fs || 1;
  const oq = Math.min(0.9, Math.max(0.35, voice.oq ?? 0.6));
  const tp = 0.4 * (oq / 0.6);
  const tn = 0.16 * (oq / 0.6);
  const KG = (0.5 * tn * sr) / (Math.PI / 2);
  const rough = voice.rough || 0;
  const wh = Math.min(1, Math.max(0, voice.whisper || 0));
  const vib = voice.vib || 0;
  const tilt = Math.min(0.95, Math.max(0, voice.tilt || 0));

  const P = { ...BASE };
  const R = [newRes(), newRes(), newRes(), newRes()];
  const NR = newRes();
  const FR1 = newBand();
  const FR2 = newBand();
  let phase = 0, gPrev = 0, alt = 1;
  let avS = 0, ahS = 0, afS = 0, gS = 0, lp = 0;
  const smooth = 1 - Math.exp(-1 / (0.0025 * sr));

  for (let i0 = 0; i0 < N; i0 += FRAME) {
    const tMid = (i0 + FRAME / 2) / sr;
    at(tMid, P);
    let f0 = f0Fn(tMid);
    if (vib) f0 *= 1 + vib * Math.sin(2 * Math.PI * 5.3 * tMid);
    if (rough) f0 *= 1 + rough * 0.03 * (rng() * 2 - 1);
    setRes(R[0], P.f1, P.b1, sr);
    setRes(R[1], P.f2, P.b2, sr);
    setRes(R[2], P.f3, P.b3, sr);
    setRes(R[3], 3400 * fs, 260, sr);
    setRes(NR, 270, 160, sr);
    setBand(FR1, P.ffc, P.ffb, sr);
    setBand(FR2, P.ffc, P.ffb, sr);
    const tAv = P.av, tAh = P.ah, tAf = P.af, tG = P.gain, nas = P.nas;
    const n = Math.min(FRAME, N - i0);
    for (let k = 0; k < n; k++) {
      avS += (tAv - avS) * smooth;
      ahS += (tAh - ahS) * smooth;
      afS += (tAf - afS) * smooth;
      gS += (tG - gS) * smooth;

      phase += f0 / sr;
      if (phase >= 1) { phase -= 1; alt = -alt; }
      let g;
      if (phase < tp) g = 0.5 * (1 - Math.cos(Math.PI * phase / tp));
      else if (phase < tp + tn) g = Math.cos(Math.PI * 0.5 * (phase - tp) / tn);
      else g = 0;
      let pulse = ((g - gPrev) * KG) / f0;
      gPrev = g;
      if (rough) pulse *= alt > 0 ? 1 : 1 - 0.5 * rough;

      const noise = rng() * 2 - 1;
      let x = pulse * avS * (1 - wh) + noise * (ahS * 0.35 + wh * avS * 0.5);

      let y = x;
      for (let q = 0; q < 4; q++) {
        const r = R[q];
        y = r.a * y + r.b * r.s1 + r.c * r.s2;
        r.s2 = r.s1;
        r.s1 = y;
      }
      if (nas > 0.001) {
        const ny = NR.a * y + NR.b * NR.s1 + NR.c * NR.s2;
        NR.s2 = NR.s1;
        NR.s1 = ny;
        y = y * (1 - 0.45 * nas) + ny * 0.9 * nas;
      }

      let fy = 0;
      if (afS > 0.001) {
        fy = runBand(FR2, runBand(FR1, (rng() * 2 - 1) * afS));
      } else {
        FR1.x1 = FR1.x2 = FR1.y1 = FR1.y2 = FR2.x1 = FR2.x2 = FR2.y1 = FR2.y2 = 0;
      }

      let v = (y * VOICE_GAIN + fy * FRIC_GAIN) * gS;
      if (tilt) { lp += (1 - tilt) * (v - lp); v = lp; }
      out[i0 + k] = v;
    }
  }

  if (voice.comb) {
    const d = Math.max(1, Math.round((voice.comb / 1000) * sr));
    for (let i = N - 1; i >= d; i--) out[i] += 0.55 * out[i - d];
  }

  if (opts.raw) return out; // sem nivelamento (calibração dos ganhos relativos entre fonemas)

  // Nivelamento por RMS (sobre as amostras audíveis) com teto de pico, e fades curtos para não estalar.
  let peak = 0, sum = 0, cnt = 0;
  for (let i = 0; i < N; i++) {
    const a = Math.abs(out[i]);
    if (a > peak) peak = a;
    if (a > peak * 0.02 + 1e-6) { sum += out[i] * out[i]; cnt++; }
  }
  if (peak > 0) {
    const rms = Math.sqrt(sum / Math.max(1, cnt));
    const scale = Math.min(0.95 / peak, rms > 0 ? targetRms / rms : 1);
    const fade = Math.min(N >> 1, Math.round(0.004 * sr));
    for (let i = 0; i < N; i++) {
      let f = 1;
      if (i < fade) f = i / fade;
      else if (i > N - fade) f = (N - i) / fade;
      out[i] *= scale * f;
    }
  }
  return out;
}
