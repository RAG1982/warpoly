/**
 * sfxLibrary.js — biblioteca de efeitos "de guerra e de trabalho" (feedback do dono, 2026-10-11): metal contra metal,
 * impacto de pedra, explosão com cauda, desabamento, afundamento de navio, flecha (corda + assobio + impacto),
 * machado arremessado, machado do lenhador, queda de árvore, picareta, martelo e bigorna. 100% sintetizada
 * (osciladores, ruído filtrado e parciais inarmônicos de "barra de metal"); nenhum sample de terceiros.
 *
 * Mesmo contrato de `sfxRecipes.js` (`{ dur, priority?, play(c, p) }`; `c` = construtor de voz do `AudioEngine`):
 * os atrasos abaixo são RELATIVOS a `c.t`. A aleatoriedade usa SEMPRE `c.rng` (o RNG de áudio de render) — nunca o da
 * simulação, nunca Math.random —, então o som varia entre golpes sem tocar o checksum. `p.v` (0..3) força uma das
 * 3–4 variantes (testes); sem ele, a variante sai do RNG de áudio.
 *
 * Níveis calibrados para pico < 1 por receita ANTES do limitador do mixer (verificado em tests/unit/sfxLibrary.test.js
 * com o renderizador offline).
 */

const decay = (g, t, from, to, d) => {
  g.gain.setValueAtTime(from, t);
  g.gain.exponentialRampToValueAtTime(to, t + d);
};
const sweep = (o, t, f0, f1, d) => {
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + d);
};
const rr = (c, a, b) => a + c.rng() * (b - a);
/** Variante 0..n-1: a pedida em `p.v` ou sorteada pelo RNG de áudio. */
const pickV = (c, p, n) => (p && Number.isInteger(p.v) ? ((p.v % n) + n) % n : Math.floor(c.rng() * n));

/** Tom puro com decaimento exponencial. `d` = atraso (s) a partir de `c.t`. */
function ping(c, d, f, dur, level, type = 'sine') {
  const t = c.t + d;
  const g = c.gain(0);
  decay(g, t, level, 0.001, dur);
  const o = c.osc(type, f);
  o.connect(g);
  o.start(t);
  o.stop(t + dur + 0.02);
  return o;
}

/** Pancada grave: oscilador que cai de `f0` a `f1`. */
function thump(c, d, f0, f1, dur, level, type = 'sine') {
  const t = c.t + d;
  const g = c.gain(0);
  decay(g, t, level, 0.001, dur);
  const o = c.osc(type, 0);
  sweep(o, t, f0, f1, dur * 0.85);
  o.connect(g);
  o.start(t);
  o.stop(t + dur + 0.02);
  return o;
}

/** Rajada de ruído filtrado (clique, estalo, farelo). */
function hiss(c, d, type, f, q, dur, level) {
  const flt = c.filter(type, f, q);
  c.burst(dur, level, d).connect(flt);
  flt.connect(c.gain(1));
  return flt;
}

/** Barra de metal golpeada: soma de parciais [razão, amplitude, decaimento s] sobre a fundamental `f`. */
function modal(c, d, f, parts, level, scale = 1) {
  for (let i = 0; i < parts.length; i++) {
    const [ratio, amp, dec] = parts[i];
    const fr = f * ratio;
    if (fr < 18000) ping(c, d, fr, dec * scale, level * amp);
  }
}

// parciais de lâmina e metal de guerra (aço: firme e cortante; ferro: mais pesado e fosco)
const STEEL = [[1, 1, 0.18], [2.15, 0.65, 0.13], [3.8, 0.38, 0.09], [6.2, 0.16, 0.05]];
const IRON = [[1, 1, 0.14], [1.85, 0.7, 0.1], [3.1, 0.42, 0.07], [4.9, 0.2, 0.04]];

const BLADE_BASES = [420, 480, 550, 620];
const SHIELD_BASES = [320, 380, 440, 500];
const ARMOR_BASES = [260, 310, 360, 420];

/** Tipos de golpe de metal: lâmina, escudo, armadura (sorteados quando `p.kind` falta). */
export const METAL_KINDS = Object.freeze(['blade', 'shield', 'armor']);

function metalPlay(c, p = {}) {
  const parts = p.variant === 'iron' ? IRON : STEEL;
  const v = pickV(c, p, 4);
  const kind = METAL_KINDS.includes(p.kind) ? p.kind : (() => { const r = c.rng(); return r < 0.5 ? 'blade' : r < 0.75 ? 'shield' : 'armor'; })();
  const jit = 1 + (c.rng() - 0.5) * 0.05;
  if (kind === 'shield') {
    modal(c, 0, SHIELD_BASES[v] * jit, parts, 0.22, 0.7);
    thump(c, 0, 190, 70, 0.11, 0.42, 'triangle'); // couro e madeira pesada por baixo do metal
    hiss(c, 0, 'bandpass', 1400 + v * 120, 1.1, 0.05, 0.35);
  } else if (kind === 'armor') {
    modal(c, 0, ARMOR_BASES[v] * jit, parts, 0.18, 0.55);
    thump(c, 0, 160, 65, 0.1, 0.36, 'triangle');
    hiss(c, 0, 'bandpass', 2200, 1.0, 0.05, 0.32);
    hiss(c, 0.04 + v * 0.01, 'bandpass', 2800, 1.4, 0.03, 0.2); // elos e placas chacoalhando
    hiss(c, 0.08 + v * 0.012, 'bandpass', 2400, 1.5, 0.025, 0.12);
  } else {
    modal(c, 0, BLADE_BASES[v] * jit, parts, 0.24, 0.85);
    thump(c, 0, 220 + v * 15, 60, 0.09, 0.38, 'triangle'); // peso do golpe de espada / machado
    hiss(c, 0, 'bandpass', 2400 + v * 200, 1.2, 0.045, 0.38); // corte e impacto cortante de lâmina
    hiss(c, 0, 'lowpass', 1500, 0.9, 0.04, 0.26); // choque mecânico
    if (v >= 2) modal(c, rr(c, 0.02, 0.05), BLADE_BASES[v] * 1.08 * jit, [[1, 0.45, 0.1], [2.15, 0.25, 0.06]], 0.16, 0.8); // lâminas raspando
  }
}

const cl = (x, a, b) => (x < a ? a : x > b ? b : x);

/** @type {Record<string, {dur:number, priority?:number, play:(c:object, p?:object)=>void}>} */
export const LIBRARY = {
  // --- metal e pedra ----------------------------------------------------------------------------------
  metalHit: { dur: 0.5, priority: 1.1, play: metalPlay },
  stoneHit: {
    dur: 0.55,
    priority: 1.5,
    play(c, p = {}) {
      const v = pickV(c, p, 4);
      thump(c, 0, 150 + v * 12, 42, 0.22, 0.42);
      hiss(c, 0, 'lowpass', 900, 0.8, 0.14, 0.4);
      hiss(c, 0, 'bandpass', 2200, 1.4, 0.03, 0.3); // a rachadura
      const n = 3 + (v % 2);
      for (let i = 0; i < n; i++) { // lascas e cascalho ricocheteando
        const d = 0.05 + i * 0.07 + rr(c, 0, 0.04);
        hiss(c, d, 'bandpass', rr(c, 1500, 3600), 2, 0.035, rr(c, 0.1, 0.2));
        if (i % 2 === 0) ping(c, d, rr(c, 900, 1800), 0.05, 0.05);
      }
    }
  },
  explosion: {
    dur: 2.0,
    priority: 3,
    play(c, p = {}) {
      const size = cl(p.size ?? 0.7, 0.2, 1);
      const tail = 0.9 + size * 0.9;
      hiss(c, 0, 'highpass', 1200, 0.7, 0.05, 0.32); // estalo inicial (pólvora)
      thump(c, 0, 120, 26, 0.9 + size * 0.3, 0.42 * (0.6 + size * 0.5)); // o "bum"
      const lp = c.filter('lowpass', 2600, 0.8);
      const t = c.t;
      lp.frequency.setValueAtTime(2600, t);
      lp.frequency.exponentialRampToValueAtTime(130, t + 0.9);
      c.burst(tail * 0.8, 0.4, 0).connect(lp);
      lp.connect(c.gain(1));
      hiss(c, 0.05, 'lowpass', 220, 0.9, tail, 0.26); // estrondo de cauda
      const n = 4 + Math.round(size * 3);
      for (let i = 0; i < n; i++) { // detritos caindo
        const d = rr(c, 0.18, 0.4 + tail * 0.8);
        hiss(c, d, 'bandpass', rr(c, 700, 2600), 2, rr(c, 0.04, 0.1), rr(c, 0.08, 0.18));
        if (i % 3 === 0) thump(c, d, rr(c, 120, 220), 60, 0.1, 0.12);
      }
    }
  },
  collapse: {
    dur: 2.6,
    priority: 2.8,
    play(c, p = {}) {
      const v = pickV(c, p, 4);
      // grave que cresce e cai: toneladas de pedra e madeira vindo abaixo
      const lp = c.filter('lowpass', 260, 0.8);
      const t = c.t;
      const sw = c.gain(0);
      sw.gain.setValueAtTime(0.001, t);
      sw.gain.linearRampToValueAtTime(0.5, t + 0.25);
      sw.gain.exponentialRampToValueAtTime(0.001, t + 2.2);
      c.burst(2.2, 1, 0).connect(lp);
      lp.connect(sw);
      for (let i = 0; i < 3; i++) thump(c, i * (0.4 + v * 0.03), 90 - i * 10, 30, 0.35, 0.38 - i * 0.05); // blocos batendo
      for (let i = 0; i < 3; i++) { // vigas rachando
        const d = 0.04 + i * 0.26 + rr(c, 0, 0.05);
        hiss(c, d, 'highpass', 2500, 0.7, 0.012, 0.3);
        thump(c, d, rr(c, 260, 360), 110, 0.07, 0.16, 'triangle');
      }
      const stones = 11 + v;
      for (let i = 0; i < stones; i++) { // pedras rolando e quicando, cada vez mais raras
        const d = 0.15 + Math.pow(i / stones, 1.4) * 1.7 + rr(c, 0, 0.05);
        hiss(c, d, 'bandpass', rr(c, 600, 2200), 2.2, rr(c, 0.05, 0.13), rr(c, 0.1, 0.2) * (1 - 0.4 * (i / stones)));
      }
      const dust = c.gain(0); // nuvem de poeira
      dust.gain.setValueAtTime(0.001, t + 0.1);
      dust.gain.linearRampToValueAtTime(0.1, t + 0.5);
      dust.gain.exponentialRampToValueAtTime(0.001, t + 2.0);
      const hp = c.filter('highpass', 2800, 0.7);
      c.burst(1.9, 1, 0.1).connect(hp);
      hp.connect(dust);
    }
  },
  shipSink: {
    dur: 3.2,
    priority: 2.4,
    play(c, p = {}) {
      const v = pickV(c, p, 4);
      const t = c.t;
      hiss(c, 0, 'bandpass', 1500, 0.8, 0.28, 0.4); // splash do casco
      // gemido do casco: dente de serra grave que desafina
      const g = c.gain(0);
      g.gain.setValueAtTime(0.001, t + 0.1);
      g.gain.linearRampToValueAtTime(0.16, t + 0.5);
      g.gain.exponentialRampToValueAtTime(0.001, t + 1.9);
      const o = c.osc('sawtooth', 0);
      sweep(o, t + 0.1, 78 + v * 6, 42, 1.7);
      const lp = c.filter('lowpass', 280, 1);
      o.connect(lp);
      lp.connect(g);
      o.start(t + 0.1);
      o.stop(t + 2.0);
      for (let i = 0; i < 3; i++) { // madeira estalando
        const d = 0.15 + i * 0.3 + rr(c, 0, 0.1);
        hiss(c, d, 'highpass', 2200, 0.7, 0.012, 0.28);
        thump(c, d, rr(c, 200, 300), 90, 0.07, 0.14, 'triangle');
      }
      // a água entra: ruído passa-banda que desce
      const bp = c.filter('bandpass', 700, 0.9);
      bp.frequency.setValueAtTime(700, t + 0.2);
      bp.frequency.exponentialRampToValueAtTime(220, t + 2.4);
      const wg = c.gain(0);
      wg.gain.setValueAtTime(0.001, t + 0.2);
      wg.gain.linearRampToValueAtTime(0.35, t + 0.7);
      wg.gain.exponentialRampToValueAtTime(0.001, t + 2.6);
      c.burst(2.4, 1, 0.2).connect(bp);
      bp.connect(wg);
      const bubbles = 13 + v;
      for (let i = 0; i < bubbles; i++) { // bolhas: gorjeios que sobem
        const d = 0.4 + (i / bubbles) * 2.1 + rr(c, 0, 0.08);
        const f0 = rr(c, 280, 520);
        const bg = c.gain(0);
        decay(bg, t + d, rr(c, 0.07, 0.14) * (1 - 0.5 * (i / bubbles)), 0.001, 0.07);
        const bo = c.osc('sine', 0);
        sweep(bo, t + d, f0, f0 * rr(c, 1.8, 2.6), 0.06);
        bo.connect(bg);
        bo.start(t + d);
        bo.stop(t + d + 0.09);
      }
      thump(c, 1.95, 130, 55, 0.5, 0.34); // o último "glub" grande
      hiss(c, 1.95, 'lowpass', 500, 0.8, 0.4, 0.22);
    }
  },

  // --- projéteis ----------------------------------------------------------------------------------------
  bow: {
    dur: 0.55,
    priority: 1,
    play(c, p = {}) {
      const v = pickV(c, p, 3);
      thump(c, 0, 300 + v * 30, 150, 0.1, 0.28, 'triangle'); // a corda solta
      ping(c, 0, 520 + v * 40, 0.12, 0.08);
      hiss(c, 0, 'bandpass', 1600, 1.2, 0.035, 0.3); // o "tuim"
      const t = c.t + 0.04;
      const bp = c.filter('bandpass', 3400, 4); // assobio da flecha em voo
      bp.frequency.setValueAtTime(3400 + v * 200, t);
      bp.frequency.exponentialRampToValueAtTime(1700, t + 0.4);
      const g = c.gain(0);
      g.gain.setValueAtTime(0.001, t);
      g.gain.linearRampToValueAtTime(0.5, t + 0.06);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
      c.burst(0.42, 1, 0.04).connect(bp);
      bp.connect(g);
    }
  },
  arrowHit: {
    dur: 0.25,
    priority: 1,
    play(c, p = {}) {
      const wood = p.surface ? p.surface === 'wood' : c.rng() < 0.4;
      if (wood) { // cravada em madeira: estalo seco + ressonância
        hiss(c, 0, 'bandpass', 2000, 1.4, 0.03, 0.4);
        thump(c, 0, 560, 260, 0.07, 0.28, 'triangle');
        ping(c, 0.01, 880, 0.12, 0.09);
      } else { // carne: baque surdo
        thump(c, 0, 210, 70, 0.1, 0.4);
        hiss(c, 0, 'lowpass', 1100, 0.8, 0.06, 0.32);
        hiss(c, 0, 'highpass', 4000, 0.7, 0.01, 0.12);
      }
      ping(c, 0.015, rr(c, 360, 440), 0.16, 0.05); // a haste vibrando
    }
  },
  axeThrow: {
    dur: 0.6,
    priority: 1.1,
    play(c, p = {}) {
      const v = pickV(c, p, 3);
      thump(c, 0, 170, 90, 0.1, 0.28, 'triangle'); // o arremesso
      hiss(c, 0, 'bandpass', 1000, 1.1, 0.03, 0.22);
      const t = c.t + 0.03;
      const bp = c.filter('bandpass', 700, 2.5); // giro: pulsos de vento que sobem de tom
      bp.frequency.setValueAtTime(650, t);
      bp.frequency.exponentialRampToValueAtTime(1500 + v * 100, t + 0.5);
      const g = c.gain(0);
      const pulses = 8;
      g.gain.setValueAtTime(0.001, t);
      for (let i = 0; i < pulses; i++) {
        const t0 = t + i * 0.06;
        g.gain.linearRampToValueAtTime(0.28 * (0.5 + i / pulses), t0 + 0.03);
        g.gain.linearRampToValueAtTime(0.05, t0 + 0.06);
      }
      g.gain.linearRampToValueAtTime(0.001, t + pulses * 0.06 + 0.05);
      c.burst(0.6, 1, 0.03).connect(bp);
      bp.connect(g);
    }
  },
  axeHit: {
    dur: 0.35,
    priority: 1.2,
    play(c, p = {}) {
      const v = pickV(c, p, 3);
      thump(c, 0, 180, 55, 0.14, 0.45); // o machado crava
      hiss(c, 0, 'lowpass', 1000, 0.8, 0.07, 0.35);
      hiss(c, 0, 'bandpass', 1900, 1.4, 0.03, 0.3); // lasca
      modal(c, 0.01, 640 + v * 60, [[1, 1, 0.22], [2.4, 0.45, 0.12]], 0.12); // o cabo/lâmina vibra
    }
  },

  // --- trabalho -----------------------------------------------------------------------------------------
  chop: {
    dur: 0.25,
    priority: 1,
    play(c, p = {}) {
      const v = pickV(c, p, 4);
      hiss(c, 0, 'highpass', 5200, 0.7, 0.008, 0.3); // o fio morde
      thump(c, 0, 230 + v * 18, 105, 0.1, 0.4, 'triangle'); // "toc" oco de tronco
      thump(c, 0, 95, 55, 0.14, 0.3);
      hiss(c, 0.005, 'bandpass', 1100 + v * 90, 1.5, 0.07, 0.4); // fibras estalando
      ping(c, 0.01, 640 + v * 45, 0.14, 0.1); // ressonância da madeira
    }
  },
  treeFall: {
    dur: 1.5,
    priority: 1.3,
    play(c, p = {}) {
      const v = pickV(c, p, 3);
      const t = c.t;
      const n = 8 + v; // fibras rangendo e estalando, cada vez mais rápido
      for (let i = 0; i < n; i++) {
        const d = Math.pow(i / n, 1.3) * 0.55 + rr(c, 0, 0.03);
        hiss(c, d, 'bandpass', rr(c, 1200, 2600), 3, rr(c, 0.015, 0.04), 0.14 + 0.2 * (i / n));
      }
      const g = c.gain(0); // ranger grave da madeira cedendo
      g.gain.setValueAtTime(0.001, t);
      g.gain.linearRampToValueAtTime(0.12, t + 0.3);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
      const o = c.osc('sawtooth', 0);
      sweep(o, t, 85, 60, 0.7);
      const lp = c.filter('lowpass', 420, 1.2);
      o.connect(lp);
      lp.connect(g);
      o.start(t);
      o.stop(t + 0.72);
      const bp = c.filter('lowpass', 2200, 0.7); // folhagem cortando o ar
      bp.frequency.setValueAtTime(2200, t + 0.2);
      bp.frequency.exponentialRampToValueAtTime(300, t + 0.95);
      const wg = c.gain(0);
      wg.gain.setValueAtTime(0.001, t + 0.2);
      wg.gain.linearRampToValueAtTime(0.22, t + 0.6);
      wg.gain.exponentialRampToValueAtTime(0.001, t + 1.0);
      c.burst(0.85, 1, 0.2).connect(bp);
      bp.connect(wg);
      thump(c, 0.88, 100, 36, 0.4, 0.5); // o tronco bate no chão
      hiss(c, 0.88, 'lowpass', 450, 0.8, 0.3, 0.32);
      hiss(c, 0.9, 'highpass', 3000, 0.7, 0.3, 0.08); // folhas
    }
  },
  mineStone: {
    dur: 0.25,
    priority: 1,
    play(c, p = {}) {
      const v = pickV(c, p, 4);
      hiss(c, 0, 'highpass', 6500, 0.7, 0.008, 0.35); // ponta da picareta
      hiss(c, 0, 'bandpass', 2300 + v * 150, 3, 0.03, 0.4);
      ping(c, 0, 1900 + v * 170, 0.07, 0.2); // "tic" de metal na rocha
      thump(c, 0, 230, 110, 0.06, 0.3);
      for (let i = 0; i < 2; i++) hiss(c, 0.06 + i * 0.06 + rr(c, 0, 0.03), 'bandpass', rr(c, 1800, 3400), 2, 0.03, rr(c, 0.08, 0.14)); // lascas
    }
  },
  mineGold: {
    dur: 0.32,
    priority: 1,
    play(c, p = {}) {
      const v = pickV(c, p, 4);
      hiss(c, 0, 'highpass', 6000, 0.7, 0.01, 0.3);
      thump(c, 0, 240, 110, 0.06, 0.28);
      modal(c, 0, 1500 + v * 130, [[1, 1, 0.24], [2.76, 0.4, 0.12], [5.4, 0.2, 0.06]], 0.2); // aço na rocha com ouro
      ping(c, 0.03, 3100 + v * 200, 0.12, 0.07); // brilho do veio
      hiss(c, 0.07, 'bandpass', rr(c, 2000, 3200), 2, 0.03, 0.1);
    }
  },
  hammer: {
    dur: 0.2,
    priority: 1,
    play(c, p = {}) {
      const v = pickV(c, p, 3);
      thump(c, 0, 760 + v * 40, 260, 0.09, 0.3); // cabeça do martelo na viga
      hiss(c, 0, 'bandpass', 1500, 1.3, 0.03, 0.28);
      modal(c, 0, 2300 + v * 150, [[1, 1, 0.1], [2.9, 0.4, 0.05]], 0.1); // o prego tilinta
      thump(c, 0.005, 190, 90, 0.07, 0.2, 'triangle');
    }
  },
  anvil: {
    dur: 1.3,
    priority: 0.7,
    play(c, p = {}) {
      const v = pickV(c, p, 3);
      hiss(c, 0, 'highpass', 5000, 0.7, 0.012, 0.3);
      thump(c, 0, 280, 130, 0.06, 0.2, 'triangle');
      modal(c, 0, 1250 + v * 110, [[1, 1, 1.0], [2.9, 0.5, 0.55], [5.2, 0.3, 0.3], [7.7, 0.16, 0.16]], 0.14);
    }
  }
};
