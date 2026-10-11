/**
 * sfxRecipes.js (F7-08) — receitas dos efeitos sonoros, 100% sintetizadas (osciladores, ruído e filtros; sem arquivos).
 * Os sons antigos do `SoundManager` foram portados com os MESMOS picos (o volume agora é o do barramento "Efeitos");
 * entraram `throw`, `bolt`, `catapult`, `stoneHit`, `explosion`, `death`, `collapse`, `cast`, `chime`, `gather`, `defeat`.
 *
 * Uma receita é `{ dur, priority?, play(c, p) }`:
 *   dur       duração máxima em segundos (o `VoicePool` usa para saber quando a voz acaba)
 *   priority  prioridade padrão no limite de vozes (padrão 1; interface 3,5-4, alarme 5, fim de jogo 6)
 *   play  monta os nós a partir do tempo `c.t`; `c.out` é o destino (ganho da voz -> panorama -> barramento)
 * `c` (construtor de voz, ver `AudioEngine`): `ctx`, `t`, `rng` (RNG de render), `gain(v)`, `osc(tipo, f)`, `filter(tipo, f, q)`,
 * `burst(dur, pico, atraso)` (rajada de ruído branco com decaimento). Fontes criadas por `c.osc`/`c.burst` são
 * registradas: o motor as para se a voz for roubada por outra de prioridade maior.
 */

const decay = (g, t, from, to, d) => {
  g.gain.setValueAtTime(from, t);
  g.gain.exponentialRampToValueAtTime(to, t + d);
};

const sweep = (o, t, f0, f1, d) => {
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + d);
};

/** @type {Record<string, {dur:number, priority?:number, play:(c:object, p?:object)=>void}>} */
export const SFX = {
  // --- trabalho -----------------------------------------------------------------------------------------
  chop: {
    dur: 0.15,
    play(c) {
      const g = c.gain(0); decay(g, c.t, 0.4, 0.001, 0.12);
      const o = c.osc('triangle', 0); sweep(o, c.t, 110 + c.rng() * 30, 40, 0.08);
      const bp = c.filter('bandpass', 1400);
      c.burst(0.05, 1).connect(bp); bp.connect(g); o.connect(g);
      o.start(c.t); o.stop(c.t + 0.12);
    }
  },
  mineGold: {
    dur: 0.3,
    play(c) {
      const f = [1200, 1440, 1680, 1920][Math.floor(c.rng() * 4)];
      const g = c.gain(0); decay(g, c.t, 0.3, 0.001, 0.25);
      const o1 = c.osc('sine', f), o2 = c.osc('triangle', f * 1.5);
      o1.connect(g); o2.connect(g);
      o1.start(c.t); o2.start(c.t); o1.stop(c.t + 0.25); o2.stop(c.t + 0.25);
    }
  },
  mineStone: {
    dur: 0.18,
    play(c) {
      const g = c.gain(0); decay(g, c.t, 0.35, 0.001, 0.14);
      const o = c.osc('sawtooth', 0); sweep(o, c.t, 180, 60, 0.1);
      const lp = c.filter('lowpass', 800);
      o.connect(lp); lp.connect(g);
      o.start(c.t); o.stop(c.t + 0.14);
    }
  },
  hammer: {
    dur: 0.12,
    play(c) {
      const g = c.gain(0); decay(g, c.t, 0.3, 0.001, 0.09);
      const o = c.osc('sine', 0); sweep(o, c.t, 750 + c.rng() * 80, 250, 0.08);
      o.connect(g);
      o.start(c.t); o.stop(c.t + 0.09);
    }
  },

  // --- combate ------------------------------------------------------------------------------------------
  sword: {
    dur: 0.22,
    play(c) {
      const g = c.gain(0); decay(g, c.t, 0.35, 0.001, 0.18);
      const o1 = c.osc('triangle', 0); sweep(o1, c.t, 950, 450, 0.12);
      const o2 = c.osc('sawtooth', 0); sweep(o2, c.t, 600, 180, 0.15);
      o1.connect(g); o2.connect(g);
      o1.start(c.t); o2.start(c.t); o1.stop(c.t + 0.18); o2.stop(c.t + 0.18);
    }
  },
  bow: {
    dur: 0.16,
    play(c) {
      const g = c.gain(0); decay(g, c.t, 0.3, 0.001, 0.12);
      const o = c.osc('triangle', 0); sweep(o, c.t, 480, 120, 0.1);
      o.connect(g);
      o.start(c.t); o.stop(c.t + 0.12);
    }
  },
  arrowHit: {
    dur: 0.12,
    play(c) {
      const g = c.gain(0); decay(g, c.t, 0.3, 0.001, 0.08);
      const o = c.osc('sine', 0); sweep(o, c.t, 320, 90, 0.07);
      o.connect(g);
      o.start(c.t); o.stop(c.t + 0.08);
    }
  },
  throw: {
    dur: 0.2,
    play(c) {
      const g = c.gain(1);
      const bp = c.filter('bandpass', 700, 1.2); sweep(bp, c.t, 700, 2200, 0.14);
      c.burst(0.16, 0.35).connect(bp); bp.connect(g);
      const o = c.osc('triangle', 0); sweep(o, c.t, 280, 180, 0.12);
      const og = c.gain(0); decay(og, c.t, 0.12, 0.001, 0.12);
      o.connect(og);
      o.start(c.t); o.stop(c.t + 0.13);
    }
  },
  bolt: {
    dur: 0.24,
    priority: 1.2,
    play(c) {
      const g = c.gain(0); decay(g, c.t, 0.32, 0.001, 0.2);
      const o = c.osc('sawtooth', 0); sweep(o, c.t, 300, 80, 0.18);
      const lp = c.filter('lowpass', 1200);
      o.connect(lp); lp.connect(g);
      const hp = c.filter('highpass', 2000);
      c.burst(0.03, 0.3).connect(hp); hp.connect(c.gain(1));
      o.start(c.t); o.stop(c.t + 0.2);
    }
  },
  catapult: {
    dur: 0.4,
    priority: 1.5,
    play(c) {
      const g = c.gain(0); decay(g, c.t, 0.45, 0.001, 0.35);
      const o = c.osc('sine', 0); sweep(o, c.t, 120, 38, 0.3);
      o.connect(g);
      const lp = c.filter('lowpass', 500);
      c.burst(0.25, 0.3).connect(lp); lp.connect(c.gain(1));
      o.start(c.t); o.stop(c.t + 0.36);
    }
  },
  stoneHit: {
    dur: 0.26,
    priority: 1.5,
    play(c) {
      const g = c.gain(0); decay(g, c.t, 0.38, 0.001, 0.2);
      const o = c.osc('sawtooth', 0); sweep(o, c.t, 170, 50, 0.14);
      const lp = c.filter('lowpass', 700);
      o.connect(lp); lp.connect(g);
      const bp = c.filter('bandpass', 900);
      c.burst(0.1, 0.35).connect(bp); bp.connect(c.gain(1));
      o.start(c.t); o.stop(c.t + 0.2);
    }
  },
  explosion: {
    dur: 0.9,
    priority: 3,
    play(c) {
      const lp = c.filter('lowpass', 1800); sweep(lp, c.t, 1800, 160, 0.6);
      c.burst(0.7, 0.8).connect(lp); lp.connect(c.gain(1));
      const g = c.gain(0); decay(g, c.t, 0.7, 0.001, 0.7);
      const o = c.osc('sine', 0); sweep(o, c.t, 95, 34, 0.6);
      o.connect(g);
      o.start(c.t); o.stop(c.t + 0.72);
    }
  },
  death: {
    dur: 0.32,
    priority: 1.2,
    play(c) {
      const g = c.gain(0); decay(g, c.t, 0.3, 0.001, 0.25);
      const o = c.osc('sawtooth', 0); sweep(o, c.t, 170, 70, 0.2);
      const lp = c.filter('lowpass', 650);
      o.connect(lp); lp.connect(g);
      const lp2 = c.filter('lowpass', 400);
      c.burst(0.1, 0.25).connect(lp2); lp2.connect(c.gain(1));
      o.start(c.t); o.stop(c.t + 0.26);
    }
  },
  collapse: {
    dur: 1.3,
    priority: 2.8,
    play(c) {
      const lp = c.filter('lowpass', 380);
      c.burst(1.1, 0.6).connect(lp); lp.connect(c.gain(1));
      const g = c.gain(0); decay(g, c.t, 0.5, 0.001, 1.1);
      const o = c.osc('sine', 0); sweep(o, c.t, 60, 30, 0.9);
      o.connect(g);
      o.start(c.t); o.stop(c.t + 1.12);
      const hp = c.filter('bandpass', 1100);
      const cg = c.gain(1);
      hp.connect(cg);
      for (const dt of [0.1, 0.35, 0.6]) c.burst(0.14, 0.3, dt).connect(hp); // pedras caindo
    }
  },
  cast: {
    dur: 0.75,
    priority: 1.8,
    play(c, p = {}) {
      const g = c.gain(0);
      switch (p.variant) {
        case 'ring': {
          decay(g, c.t, 0.25, 0.001, 0.6);
          const o1 = c.osc('sine', 0); sweep(o1, c.t, 330, 220, 0.5);
          const o2 = c.osc('triangle', 0); sweep(o2, c.t, 660, 440, 0.5);
          o1.connect(g); o2.connect(g);
          o1.start(c.t); o2.start(c.t); o1.stop(c.t + 0.6); o2.stop(c.t + 0.6);
          break;
        }
        case 'beam': {
          decay(g, c.t, 0.22, 0.001, 0.5);
          const o = c.osc('sawtooth', 0); sweep(o, c.t, 220, 440, 0.4);
          const lp = c.filter('lowpass', 600); sweep(lp, c.t, 600, 3000, 0.4);
          o.connect(lp); lp.connect(g);
          o.start(c.t); o.stop(c.t + 0.5);
          break;
        }
        case 'aura': {
          decay(g, c.t, 0.2, 0.001, 0.7);
          [440, 554.37, 659.25].forEach((f, i) => {
            const o = c.osc('sine', f);
            o.connect(g);
            o.start(c.t + i * 0.08); o.stop(c.t + 0.7);
          });
          break;
        }
        default: { // burst
          decay(g, c.t, 0.25, 0.001, 0.4);
          const o1 = c.osc('sine', 0); sweep(o1, c.t, 500, 1400, 0.25);
          const o2 = c.osc('sine', 0); sweep(o2, c.t, 1000, 2800, 0.25);
          const g2 = c.gain(0); decay(g2, c.t, 0.1, 0.001, 0.3);
          o1.connect(g); o2.connect(g2);
          o1.start(c.t); o2.start(c.t); o1.stop(c.t + 0.4); o2.stop(c.t + 0.32);
        }
      }
    }
  },

  // --- interface e marcos -------------------------------------------------------------------------------
  select: {
    dur: 0.16,
    priority: 4,
    play(c) {
      const g = c.gain(0); decay(g, c.t, 0.2, 0.001, 0.14);
      const o = c.osc('sine', 523.25);
      o.frequency.setValueAtTime(659.25, c.t + 0.05);
      o.connect(g);
      o.start(c.t); o.stop(c.t + 0.14);
    }
  },
  order: {
    dur: 0.2,
    priority: 3.5,
    play(c) {
      const g = c.gain(0); decay(g, c.t, 0.22, 0.001, 0.18);
      const o = c.osc('triangle', 440);
      o.frequency.setValueAtTime(554.37, c.t + 0.04);
      o.frequency.setValueAtTime(659.25, c.t + 0.08);
      o.connect(g);
      o.start(c.t); o.stop(c.t + 0.18);
    }
  },
  chime: {
    dur: 0.35,
    priority: 2.5,
    play(c) {
      const g = c.gain(0); decay(g, c.t, 0.2, 0.001, 0.3);
      const o = c.osc('sine', 659.25);
      o.frequency.setValueAtTime(880, c.t + 0.07);
      o.connect(g);
      o.start(c.t); o.stop(c.t + 0.3);
    }
  },
  gather: {
    dur: 0.15,
    priority: 0.8,
    play(c) {
      const g = c.gain(0); decay(g, c.t, 0.12, 0.001, 0.1);
      const o = c.osc('sine', 1320);
      o.frequency.setValueAtTime(1760, c.t + 0.05);
      o.connect(g);
      o.start(c.t); o.stop(c.t + 0.11);
    }
  },
  buildPlace: {
    dur: 0.22,
    priority: 2.5,
    play(c) {
      const g = c.gain(0); decay(g, c.t, 0.4, 0.001, 0.2);
      const o = c.osc('triangle', 0); sweep(o, c.t, 140, 45, 0.15);
      o.connect(g);
      o.start(c.t); o.stop(c.t + 0.2);
    }
  },
  buildComplete: {
    dur: 0.7,
    priority: 3,
    play(c) {
      const g = c.gain(0); decay(g, c.t, 0.3, 0.001, 0.65);
      [392.0, 493.88, 587.33, 783.99].forEach((f, i) => {
        const o = c.osc('sine', f);
        o.connect(g);
        o.start(c.t + i * 0.06); o.stop(c.t + 0.6);
      });
    }
  },
  error: {
    dur: 0.26,
    priority: 4,
    play(c) {
      const g = c.gain(0); decay(g, c.t, 0.2, 0.001, 0.22);
      const o = c.osc('square', 190);
      o.frequency.setValueAtTime(140, c.t + 0.09);
      o.connect(g);
      o.start(c.t); o.stop(c.t + 0.24);
    }
  },
  alarm: {
    dur: 0.5,
    priority: 5,
    play(c) {
      const g = c.gain(0); decay(g, c.t, 0.35, 0.001, 0.45);
      const o = c.osc('sawtooth', 220);
      o.frequency.linearRampToValueAtTime(246.94, c.t + 0.2);
      const lp = c.filter('lowpass', 650);
      o.connect(lp); lp.connect(g);
      o.start(c.t); o.stop(c.t + 0.45);
    }
  },
  victory: {
    dur: 1.3,
    priority: 6,
    play(c) {
      const g = c.gain(0); decay(g, c.t, 0.4, 0.001, 1.2);
      [261.63, 329.63, 392.0, 523.25].forEach((f, i) => {
        const o = c.osc('triangle', f);
        o.connect(g);
        o.start(c.t + i * 0.15); o.stop(c.t + i * 0.15 + 0.4);
      });
    }
  },
  defeat: {
    dur: 1.6,
    priority: 6,
    play(c) {
      const g = c.gain(0); decay(g, c.t, 0.35, 0.001, 1.5);
      const lp = c.filter('lowpass', 900);
      lp.connect(g);
      [392.0, 349.23, 329.63, 261.63].forEach((f, i) => {
        const o = c.osc('triangle', f);
        o.connect(lp);
        o.start(c.t + i * 0.28); o.stop(c.t + i * 0.28 + 0.5);
      });
    }
  }
};

/** Teto de vozes simultâneas por som e intervalo mínimo entre recomeços (anti-"metralhadora"; ver `VoicePool`). */
export const SFX_LIMITS = Object.freeze({
  perKey: Object.freeze({
    chop: 3, mineGold: 2, mineStone: 3, hammer: 3, sword: 5, bow: 5, arrowHit: 4, throw: 3, bolt: 3, catapult: 2,
    stoneHit: 3, death: 4, explosion: 3, collapse: 2, cast: 3, chime: 2, gather: 2
  }),
  minGap: Object.freeze({
    chop: 0.05, mineGold: 0.08, mineStone: 0.06, hammer: 0.05, sword: 0.035, bow: 0.035, arrowHit: 0.03, throw: 0.05,
    bolt: 0.05, stoneHit: 0.05, death: 0.06, gather: 0.12, chime: 0.1
  })
});
