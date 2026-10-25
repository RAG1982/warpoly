/**
 * vfxMapping.js (F7-05) — mapeamento PURO evento da sim → lista de descritores de efeito (sem three, sem DOM).
 * `VfxEvents` coleta o contexto (flags da unidade, raio da construção, definição da habilidade) e chama
 * `effectsForEvent`; quem desenha (`VfxLayer.play`) só consome os descritores. Descritores são objetos simples:
 * `{ fx, pos:{x,y,z}, ... }`.
 */
import { EVT } from '../../sim/events.js';
import { HQ_TIER_VIEW } from '../../data/tiers.js';

/** Estágios da obra (0..3) conforme o progresso 0..100; concluída = 4. */
export const CONSTRUCTION_STAGES = 4;
export function constructionStage(progress, complete = false) {
  if (complete) return CONSTRUCTION_STAGES;
  const p = Math.max(0, Math.min(99.999, +progress || 0));
  return Math.floor(p / (100 / CONSTRUCTION_STAGES));
}

/** Tempos do cadáver visual: cai (espera), permanece e decai (afunda e encolhe). */
export const CORPSE = Object.freeze({ delay: 0.9, linger: 9, decay: 5 });

function setDecay(r, visible, scale, sink, done) {
  r.visible = visible;
  r.scale = scale;
  r.sink = sink;
  r.done = done;
  return r;
}

/**
 * Estado do cadáver visual na idade `age` (s desde a morte). `age < delay` = ainda não aparece.
 * `out` (opcional) é preenchido e devolvido em vez de criar um objeto novo: `CorpseDecals.update` chama isto por
 * cadáver a cada quadro e passa um objeto fixo (sem alocação por quadro).
 * @returns {{visible:boolean, scale:number, sink:number, done:boolean}}
 */
export function corpseDecay(age, c = CORPSE, out = null) {
  const r = out || { visible: false, scale: 0, sink: 0, done: false };
  if (!(age >= c.delay)) return setDecay(r, false, 0, 0, false);
  const a = age - c.delay;
  if (a <= c.linger) return setDecay(r, true, 1, 0, false);
  const k = Math.min(1, (a - c.linger) / c.decay);
  if (k >= 1) return setDecay(r, false, 0, 1, true);
  const e = k * k * (3 - 2 * k);
  return setDecay(r, true, 1 - 0.55 * e, e * 0.22, false);
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
    case EVT.RESOURCE_DEPLETED:
      if (p.resourceType === 'wood') return [];
      return [{ fx: 'building_collapse', pos: at(p.pos), radius: info.radius || 3.4, buildingType: 'mine' }];
    case EVT.BUILDING_PLACED:
      return [{ fx: 'construction', pos: at(p.pos), radius: info.radius || 2, stage: 0, placed: true }];
    case EVT.BUILDING_COMPLETED:
      return [{ fx: 'construction', pos: at(p.pos), radius: info.radius || 2, stage: CONSTRUCTION_STAGES, done: true }];
    case EVT.EXPLOSION:
      return [{ fx: 'explosion', pos: at(p.pos), radius: p.radius || 2 }];
    case EVT.HQ_TIER_CHANGED: { // M3-03a: Centro subiu de nível => fogos sobre o prédio (altura do modelo do nível)
      const v = HQ_TIER_VIEW[p.tier] || HQ_TIER_VIEW[1];
      return [{ fx: 'fireworks', pos: at(p.pos), height: v.height }];
    }
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
