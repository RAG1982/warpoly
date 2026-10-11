/**
 * sfxRecipes.js (F7-08) — receitas dos efeitos sonoros, 100% sintetizadas (osciladores, ruído e filtros; sem arquivos).
 * Os sons de interface e magia foram portados do `SoundManager` antigo com os MESMOS picos (o volume agora é o do barramento
 * "Efeitos"). Os efeitos de guerra e de trabalho (metal, pedra, explosão, desabamento, afundamento, flecha, machados,
 * picareta, martelo, bigorna) moram em `sfxLibrary.js` e entram aqui por espalhamento (`...LIBRARY`).
 *
 * Uma receita é `{ dur, priority?, play(c, p) }`:
 *   dur       duração máxima em segundos (o `VoicePool` usa para saber quando a voz acaba)
 *   priority  prioridade padrão no limite de vozes (padrão 1; interface 3,5-4, alarme 5, fim de jogo 6)
 *   play  monta os nós a partir do tempo `c.t`; `c.out` é o destino (ganho da voz -> panorama -> barramento)
 * `c` (construtor de voz, ver `AudioEngine`): `ctx`, `t`, `rng` (RNG de render), `gain(v)`, `osc(tipo, f)`, `filter(tipo, f, q)`,
 * `burst(dur, pico, atraso)` (rajada de ruído branco com decaimento). Fontes criadas por `c.osc`/`c.burst` são
 * registradas: o motor as para se a voz for roubada por outra de prioridade maior.
 */

import { LIBRARY } from './sfxLibrary.js';

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
  ...LIBRARY, // metal, pedra, explosão, desabamento, afundamento, flecha, machado, picareta, martelo… (sfxLibrary.js)

  // --- combate ------------------------------------------------------------------------------------------
  sword: {
    dur: 0.5,
    priority: 1.1,
    play(c, p = {}) { LIBRARY.metalHit.play(c, { ...p, kind: 'blade' }); } // compat: `playSword` e a ação `sound: sword` das missões
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
    chop: 3, treeFall: 2, mineGold: 2, mineStone: 3, hammer: 3, anvil: 2, sword: 5, metalHit: 6, bow: 5, arrowHit: 4,
    axeThrow: 3, axeHit: 3, bolt: 3, catapult: 2, stoneHit: 3, death: 4, explosion: 3, collapse: 2, shipSink: 2, cast: 3,
    chime: 2, gather: 2
  }),
  minGap: Object.freeze({
    chop: 0.05, treeFall: 0.2, mineGold: 0.08, mineStone: 0.06, hammer: 0.05, anvil: 0.3, sword: 0.035, metalHit: 0.035,
    bow: 0.035, arrowHit: 0.03, axeThrow: 0.05, axeHit: 0.04, bolt: 0.05, stoneHit: 0.05, death: 0.06, shipSink: 0.3,
    gather: 0.12, chime: 0.1
  })
});
