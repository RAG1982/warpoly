/**
 * TriggerEngine.js — F8-04: percorre os gatilhos da missão a cada tick, na ordem do JSON (determinístico).
 *
 * Gatilho = `{ id, when, actions, once = true, enabled = true, cooldown = 0 }`. Quando `when` é verdadeira (e o gatilho
 * está habilitado, fora do cooldown e — se `once` — ainda não disparou), as ações rodam em ordem; ações podem habilitar
 * outros gatilhos, que (se vierem depois na lista) já são avaliados no mesmo tick.
 */
import { SIM_DT } from '../constants.js';
import { evalCondition } from './conditions.js';
import { runAction } from './actions.js';

export class TriggerEngine {
  /** @param {import('./MissionRuntime.js').MissionRuntime} rt */
  constructor(rt, defs) {
    this.rt = rt;
    this.list = defs.map((def) => ({
      def,
      id: def.id,
      once: def.once !== false,
      enabled: def.enabled !== false,
      cooldownTicks: Math.round((def.cooldown ?? 0) / SIM_DT),
      fired: 0,
      lastTick: -Infinity
    }));
    for (const t of this.list) rt.triggers.set(t.id, t);
  }

  step() {
    const rt = this.rt;
    for (let i = 0; i < this.list.length; i++) {
      const t = this.list[i];
      if (!t.enabled || (t.once && t.fired > 0)) continue;
      if (t.cooldownTicks > 0 && rt.tick - t.lastTick < t.cooldownTicks) continue;
      if (!evalCondition(rt, t.def.when)) continue;
      t.fired++;
      t.lastTick = rt.tick;
      const actions = t.def.actions;
      for (let k = 0; k < actions.length; k++) {
        runAction(rt, actions[k]);
        if (rt.outcome) return; // vitória/derrota imediata encerra o tick
      }
    }
  }

  /** Texto estável do estado (checksum). */
  hashString() {
    let s = '';
    for (let i = 0; i < this.list.length; i++) {
      const t = this.list[i];
      s += `${t.id}:${t.fired}:${t.enabled ? 1 : 0}:${t.lastTick === -Infinity ? '-' : t.lastTick};`;
    }
    return s;
  }
}
