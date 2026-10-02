/**
 * alerts.js (F6-05) — fila/central de alertas da HUD (sem DOM/three.js; testável em Node).
 *
 * `AlertCenter.raise(kind, opts)` decide se um alerta vira banner (e som) ou é suprimido como
 * repetição, guarda o histórico de alertas com posição (a tecla **Espaço** percorre os mais
 * recentes) e mantém os pings do minimapa (vivem `PING_LIFE` s).
 *
 * Regra de repetição: um alerta é suprimido se já houve outro do mesmo tipo mostrado há menos de
 * `cooldown` s e (sem posição, ou a até `radius` u dele). Ao suprimir, a posição/hora do alerta
 * existente é atualizada (Espaço vai ao ponto mais novo) mas não nasce banner nem ping novo.
 */

import { t } from '../i18n/index.js';

export const PING_LIFE = 4;          // s que o ping do minimapa permanece
export const RING_SIZE = 8;          // alertas posicionais lembrados para o Espaço
export const CYCLE_WINDOW = 5;       // s: toques seguidos de Espaço percorrem os anteriores
const HISTORY_MAX = 24;

/** Tipos de alerta. `severity`: danger | warn | good. `cooldown` em s (0 = nunca suprime); `radius` em unidades de mundo. */
export const ALERT_KINDS = Object.freeze({
  attack: { textKey: 'alert.attack', severity: 'danger', cooldown: 10, radius: 20, ping: true },
  depleted: { textKey: 'alert.depleted', severity: 'warn', cooldown: 2, radius: 10, ping: true },
  research: { textKey: 'alert.research', severity: 'good', cooldown: 0, radius: 0, ping: false },
  built: { textKey: 'alert.built', severity: 'good', cooldown: 1.5, radius: 8, ping: false },
  food: { textKey: 'alert.food', severity: 'warn', cooldown: 4, radius: Infinity, ping: false }
});

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export class AlertCenter {
  /**
   * @param {object} [opts]
   * @param {(alert:{kind:string,text:string,severity:string,pos:?{x:number,z:number},sound:boolean}) => void} [opts.onShow]
   *   chamado quando um alerta NÃO é suprimido (UiEvents mostra o banner e toca o som)
   * @param {() => number} [opts.clock]  segundos (padrão: relógio real); testes injetam o seu
   */
  constructor({ onShow = null, clock = () => (typeof performance !== 'undefined' ? performance.now() / 1000 : Date.now() / 1000) } = {}) {
    this.onShow = onShow;
    this.clock = clock;
    /** @type {{kind:string,text:string,severity:string,pos:?{x:number,z:number},shownAt:number,time:number}[]} mais novo primeiro */
    this.history = [];
    /** @type {{x:number,z:number,kind:string,t0:number}[]} */
    this.pings = [];
    this._cursor = 0;
    this._lastJumpAt = -Infinity;
  }

  /**
   * @param {keyof typeof ALERT_KINDS} kind
   * @param {{pos?:{x:number,z:number}|null, text?:string, sound?:boolean, now?:number}} [opts]
   *   `text` sobrepõe o texto padrão (ex.: "Pesquisa concluída: Armadura 2/3"); `sound:false` se o
   *   som já saiu por outro caminho (AudioEvents).
   * @returns {{shown:boolean, alert:object|null}}
   */
  raise(kind, { pos = null, text = null, sound = true, now = this.clock() } = {}) {
    const def = ALERT_KINDS[kind];
    if (!def) return { shown: false, alert: null };
    const p = pos && Number.isFinite(pos.x) && Number.isFinite(pos.z) ? { x: pos.x, z: pos.z } : null;

    const dupe = def.cooldown > 0
      ? this.history.find((a) => a.kind === kind && now - a.shownAt < def.cooldown && (!p || !a.pos || dist(p, a.pos) <= def.radius))
      : null;
    if (dupe) {
      if (p) dupe.pos = p;
      dupe.time = now;
      this._promote(dupe);
      return { shown: false, alert: dupe };
    }

    const alert = { kind, text: text || t(def.textKey), severity: def.severity, pos: p, shownAt: now, time: now };
    this.history.unshift(alert);
    if (this.history.length > HISTORY_MAX) this.history.length = HISTORY_MAX;
    if (p && def.ping) this.pings.push({ x: p.x, z: p.z, kind, t0: now });
    this.onShow?.({ ...alert, sound });
    return { shown: true, alert };
  }

  _promote(a) {
    const i = this.history.indexOf(a);
    if (i > 0) { this.history.splice(i, 1); this.history.unshift(a); }
  }

  /** Alertas com posição, do mais novo para o mais antigo (até `RING_SIZE`). */
  get ring() {
    return this.history.filter((a) => a.pos).slice(0, RING_SIZE);
  }

  /**
   * Tecla Espaço: 1º toque = alerta mais novo; toques seguidos em ≤ `CYCLE_WINDOW` s percorrem os
   * anteriores (circular). Devolve o alerta ou null (sem alertas).
   */
  jump(now = this.clock()) {
    const ring = this.ring;
    if (!ring.length) return null;
    this._cursor = now - this._lastJumpAt <= CYCLE_WINDOW ? (this._cursor + 1) % ring.length : 0;
    this._lastJumpAt = now;
    return ring[this._cursor];
  }

  /** Pings ainda vivos; cada um traz `age` (0..1 da vida). Remove os expirados. */
  activePings(now = this.clock()) {
    this.pings = this.pings.filter((p) => now - p.t0 < PING_LIFE);
    return this.pings.map((p) => ({ ...p, age: (now - p.t0) / PING_LIFE }));
  }

  clear() {
    this.history.length = 0;
    this.pings.length = 0;
    this._cursor = 0;
    this._lastJumpAt = -Infinity;
  }
}
