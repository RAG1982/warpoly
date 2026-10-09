/**
 * musicDirector.js (F7-08) — decisão PURA da música adaptativa: paz × combate, por facção. Sem Web Audio.
 *
 * O combate "recente" é uma intensidade que decai exponencialmente (meia-vida `halfLife`) e cresce com o peso dos
 * eventos de combate (dano, morte, explosão...; ver `combatWeight` em `audioMapping.js`). Histerese: entra em combate
 * acima de `enter`, só volta à paz abaixo de `exit`, e cada estado dura no mínimo `minCombat`/`minPeace` segundos, para
 * a música não ficar trocando a cada golpe isolado. O tempo é injetado (`now`, segundos).
 */

export const MUSIC_STATES = Object.freeze(['peace', 'combat']);
export const MUSIC_FACTIONS = Object.freeze(['human', 'orc']);

export const DIRECTOR_DEFAULTS = Object.freeze({
  enter: 3, // intensidade para começar o combate (um golpe solto pesa 1)
  exit: 0.9, // intensidade abaixo da qual o combate pode acabar
  halfLife: 5, // s para a intensidade cair pela metade
  minCombat: 10, // s mínimos em combate antes de voltar à paz
  minPeace: 6 // s mínimos em paz antes de entrar em combate
});

/** Id da faixa para (facção, estado). Facção desconhecida (neutra) usa a humana. */
export function trackIdFor(faction, state) {
  const f = MUSIC_FACTIONS.includes(faction) ? faction : 'human';
  const s = state === 'combat' ? 'combat' : 'peace';
  return `${f}_${s}`;
}

export class MusicDirector {
  constructor(cfg = {}) {
    this.cfg = { ...DIRECTOR_DEFAULTS, ...cfg };
    this.reset(0);
  }

  reset(now = 0) {
    this._level = 0;
    this._t = now;
    this.state = 'peace';
    this._since = -Infinity; // há quanto tempo está no estado atual (começa livre para mudar)
  }

  _decayTo(now) {
    const dt = now - this._t;
    if (dt > 0) {
      this._level *= Math.pow(0.5, dt / this.cfg.halfLife);
      this._t = now;
    }
  }

  /** Intensidade de combate em `now` (já decaída). */
  level(now) {
    this._decayTo(now);
    return this._level;
  }

  /** Registra um evento de combate de `weight` em `now`. */
  add(weight, now) {
    if (!(weight > 0)) return;
    this._decayTo(now);
    this._level += weight;
  }

  /** Reavalia o estado em `now` e o devolve. */
  update(now) {
    this._decayTo(now);
    const c = this.cfg;
    if (this.state === 'peace') {
      if (this._level >= c.enter && now - this._since >= c.minPeace) {
        this.state = 'combat';
        this._since = now;
      }
    } else if (this._level <= c.exit && now - this._since >= c.minCombat) {
      this.state = 'peace';
      this._since = now;
    }
    return this.state;
  }
}
