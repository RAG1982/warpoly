/**
 * audioMapping.js (F7-08) — mapeamento PURO evento da simulação -> efeitos sonoros (espelha `render/vfx/vfxMapping.js`).
 * `AudioEvents` só coleta o contexto (dono local, visibilidade na névoa, tipo de habilidade) e executa os descritores;
 * toda a decisão "o que toca, onde, com que prioridade" mora aqui e é testada em Node.
 *
 * Descritor: `{ sfx, pos, priority, gain }`
 *   - `sfx`       nome da receita (`sfxRecipes.js`)
 *   - `pos`       ponto {x,z,...} no mundo, ou `null` = som de interface (sem atenuação, sem panorama)
 *   - `priority`  maior vence no limite de vozes (ver `VoicePool`): 0,8 trabalho alheio · 1–2 combate · 3 marcos · 5 alarme · 6 fim
 *   - `gain`      multiplicador de volume do descritor (antes da atenuação por distância)
 *
 * `info`: `{ own: o evento é do jogador local, visible: a posição está visível na névoa, vfxKind?: tipo do VFX da habilidade }`.
 * Sons de unidades alheias só tocam se a posição está visível (como o VFX): não se ouve a IA cortando madeira no escuro.
 */
import { EVT } from '../sim/events.js';

const NONE = Object.freeze([]);

/** Projétil disparado -> receita do disparo. */
export const FIRE_SFX = Object.freeze({ arrow: 'bow', axe: 'throw', bolt: 'bolt', boulder: 'catapult' });
/** Projétil que acerta -> receita do impacto (cerco = pedra). */
export const HIT_SFX = Object.freeze({ arrow: 'arrowHit', axe: 'arrowHit', bolt: 'stoneHit', boulder: 'stoneHit' });

/** Eventos que o `AudioEvents` registra para efeitos (a ordem não importa). */
export const SFX_EVENTS = Object.freeze([
  EVT.WORKER_CHOP, EVT.WORKER_MINE, EVT.WORKER_HAMMER,
  EVT.PROJECTILE_FIRED, EVT.PROJECTILE_HIT, EVT.MELEE_HIT, EVT.EXPLOSION,
  EVT.UNIT_DIED, EVT.BUILDING_DESTROYED, EVT.ABILITY_CAST,
  EVT.BUILDING_PLACED, EVT.BUILDING_COMPLETED, EVT.UNIT_TRAINED, EVT.RESEARCH_DONE, EVT.RESOURCE_GATHERED,
  EVT.UNDER_ATTACK, EVT.MATCH_WON, EVT.MATCH_LOST
]);

/** Eventos que alimentam a intensidade de combate da música adaptativa. */
export const COMBAT_EVENTS = Object.freeze([EVT.UNIT_DAMAGED, EVT.BUILDING_DAMAGED, EVT.UNIT_DIED, EVT.BUILDING_DESTROYED, EVT.EXPLOSION]);

const d = (sfx, pos, priority, gain = 1) => ({ sfx, pos: pos || null, priority, gain });

/**
 * @param {string} type  um `EVT.*`
 * @param {object} p     payload do evento
 * @param {{own?:boolean, visible?:boolean, vfxKind?:string}} [info]
 * @returns {Array<{sfx:string, pos:object|null, priority:number, gain:number}>}
 */
export function soundsForEvent(type, p, info = {}) {
  const own = !!info.own;
  const audible = own || info.visible !== false; // sem informação de névoa = audível
  switch (type) {
    case EVT.WORKER_CHOP:
      return audible ? [d('chop', p.pos, own ? 1.2 : 0.8)] : NONE;
    case EVT.WORKER_MINE:
      return audible ? [d(p.resource === 'gold' ? 'mineGold' : 'mineStone', p.pos, own ? 1.2 : 0.8)] : NONE;
    case EVT.WORKER_HAMMER:
      return audible ? [d('hammer', p.pos, own ? 1.2 : 0.8)] : NONE;

    case EVT.PROJECTILE_FIRED:
      return audible ? [d(FIRE_SFX[p.kind] || 'bow', p.from, own ? 1.6 : 1.1)] : NONE;
    case EVT.PROJECTILE_HIT: {
      if (!audible) return NONE;
      const siege = p.kind === 'bolt' || p.kind === 'boulder';
      return [d(HIT_SFX[p.kind] || 'arrowHit', p.pos, siege ? 2 : own ? 1.4 : 1.0)];
    }
    case EVT.MELEE_HIT:
      return audible ? [d('sword', p.pos, own ? 1.6 : 1.1)] : NONE;
    case EVT.EXPLOSION:
      return audible ? [d('explosion', p.pos, 3)] : NONE;

    case EVT.UNIT_DIED:
      if (p.expired || !audible) return NONE;
      return [d('death', p.pos, own ? 1.8 : 1.2)];
    case EVT.BUILDING_DESTROYED:
      return audible ? [d('collapse', p.pos, 2.8)] : NONE;
    case EVT.ABILITY_CAST: {
      if (!audible) return NONE;
      const s = d('cast', p.pos, own ? 2.2 : 1.6);
      s.variant = info.vfxKind || 'burst';
      return [s];
    }

    case EVT.BUILDING_PLACED:
      return own ? [d('buildPlace', p.pos, 2.5)] : NONE;
    case EVT.BUILDING_COMPLETED:
      if (own) return [d('buildComplete', null, 3)];
      return audible ? [d('buildComplete', p.pos, 1.5, 0.7)] : NONE;
    case EVT.UNIT_TRAINED:
      if (own) return [d('chime', null, 2.5)];
      return audible ? [d('chime', p.pos, 1, 0.5)] : NONE;
    case EVT.RESEARCH_DONE:
      return own ? [d('buildComplete', null, 3)] : NONE;
    case EVT.RESOURCE_GATHERED:
      return own ? [d('gather', null, 0.8)] : NONE;

    case EVT.UNDER_ATTACK:
      return own ? [d('alarm', null, 5)] : NONE;
    case EVT.MATCH_WON:
      return [d('victory', null, 6)];
    case EVT.MATCH_LOST:
      return [d('defeat', null, 6)];
    default:
      return NONE;
  }
}

/**
 * Peso de um evento na intensidade de combate (música adaptativa). 0 = irrelevante.
 * Dano/morte das próprias coisas pesa mais; combate alheio só conta se está perto da câmera (`info.near`).
 * @param {string} type
 * @param {object} p
 * @param {{own?:boolean, near?:boolean}} [info]
 */
export function combatWeight(type, p, info = {}) {
  const own = !!info.own;
  const near = !!info.near;
  switch (type) {
    case EVT.UNIT_DAMAGED:
      return own ? 1 : near ? 0.5 : 0;
    case EVT.BUILDING_DAMAGED:
      return own ? 1 : near ? 0.4 : 0;
    case EVT.UNIT_DIED:
      if (p && p.expired) return 0;
      return own ? 3 : near ? 1.5 : 0;
    case EVT.BUILDING_DESTROYED:
      return own ? 4 : near ? 2 : 0;
    case EVT.EXPLOSION:
      return own || near ? 2 : 0;
    default:
      return 0;
  }
}
