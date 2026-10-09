/**
 * vfxMapping.js (F7-05) — mapeamento PURO evento da sim → lista de descritores de efeito (sem three, sem DOM).
 * `VfxEvents` coleta o contexto (flags da unidade, raio da construção, definição da habilidade) e chama
 * `effectsForEvent`; quem desenha (`VfxLayer.play`) só consome os descritores. Descritores são objetos simples:
 * `{ fx, pos:{x,y,z}, ... }`.
 */
import { EVT } from '../../sim/events.js';

/** Estágios da obra (0..3) conforme o progresso 0..100; concluída = 4. */
export const CONSTRUCTION_STAGES = 4;
export function constructionStage(progress, complete = false) {
  if (complete) return CONSTRUCTION_STAGES;
  const p = Math.max(0, Math.min(99.999, +progress || 0));
  return Math.floor(p / (100 / CONSTRUCTION_STAGES));
}

/** Tempos do cadáver visual: cai (espera), permanece e decai (afunda e encolhe). */
export const CORPSE = Object.freeze({ delay: 0.9, linger: 9, decay: 5 });

/**
 * Estado do cadáver visual na idade `age` (s desde a morte). `age < delay` = ainda não aparece.
 * @returns {{visible:boolean, scale:number, sink:number, done:boolean}}
 */
export function corpseDecay(age, c = CORPSE) {
  if (!(age >= c.delay)) return { visible: false, scale: 0, sink: 0, done: false };
  const a = age - c.delay;
  if (a <= c.linger) return { visible: true, scale: 1, sink: 0, done: false };
  const k = Math.min(1, (a - c.linger) / c.decay);
  if (k >= 1) return { visible: false, scale: 0, sink: 1, done: true };
  const e = k * k * (3 - 2 * k);
  return { visible: true, scale: 1 - 0.55 * e, sink: e * 0.22, done: false };
}

const at = (pos) => ({ x: pos.x, y: pos.y || 0, z: pos.z });

/**
 * @param {string} type  um `EVT.*`
 * @param {object} p     payload do evento
 * @param {object} [info] contexto já resolvido por quem chama:
 *   `{ unit:{undead,siege,corpseless}, radius (construção), vfx (definição da habilidade), teamColor, visible }`
 * @returns {object[]}   descritores (vazio = nada a desenhar)
 */
export function effectsForEvent(type, p, info = {}) {
  if (info.visible === false) return [];
  switch (type) {
    case EVT.UNIT_DAMAGED: {
      const u = info.unit || {};
      const amount = p.amount || 0;
      if (u.undead || u.siege) return [{ fx: 'hit_spark', pos: at(p.pos), amount, bone: !!u.undead }];
      return [{ fx: 'blood', pos: at(p.pos), amount }];
    }
    case EVT.BUILDING_DAMAGED:
      return [{ fx: 'hit_spark', pos: at(p.pos), amount: p.amount || 0, wood: true }];
    case EVT.UNIT_DIED: {
      const u = info.unit || {};
      const out = [{ fx: 'unit_death', pos: at(p.pos), undead: !!u.undead, siege: !!u.siege }];
      if (!p.expired && !u.corpseless && !u.undead && !u.siege) {
        out.push({ fx: 'corpse', pos: at(p.pos), ownerId: p.ownerId, color: info.teamColor || null });
      }
      return out;
    }
    case EVT.BUILDING_DESTROYED:
      return [{ fx: 'building_collapse', pos: at(p.pos), radius: info.radius || 2, buildingType: p.buildingType }];
    case EVT.BUILDING_PLACED:
      return [{ fx: 'construction', pos: at(p.pos), radius: info.radius || 2, stage: 0, placed: true }];
    case EVT.BUILDING_COMPLETED:
      return [{ fx: 'construction', pos: at(p.pos), radius: info.radius || 2, stage: CONSTRUCTION_STAGES, done: true }];
    case EVT.EXPLOSION:
      return [{ fx: 'explosion', pos: at(p.pos), radius: p.radius || 2 }];
    case EVT.ABILITY_EFFECT: {
      const v = info.vfx;
      if (!v) return [];
      return [{
        fx: 'magic', pos: at(p.pos), kind: v.kind || 'burst', color: v.color || '#ffffff',
        radius: p.radius || v.radius || 2, duration: v.duration || 1
      }];
    }
    default:
      return [];
  }
}

/** Descritor de pegada de obra ao mudar de estágio (chamado pelo rastreador por frame, não por evento). */
export function constructionStageEffect(pos, radius, stage) {
  return { fx: 'construction', pos: at(pos), radius, stage };
}
