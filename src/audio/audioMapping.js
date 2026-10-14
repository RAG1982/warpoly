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
 *   - `margin`    (opcional) margem de tela extra para o recorte pela cena visível (explosão, desabamento e cerco são grandes)
 *   - `variant`   (opcional) estilo da receita (ex.: `iron` = golpe de metal da Horda; `size` em explosões)
 *
 * `info`: `{ own: o evento é do jogador local, visible: a posição está visível na névoa, vfxKind?: tipo do VFX da habilidade,
 * faction?: facção do dono do evento }`.
 * Sons de unidades alheias só tocam se a posição está visível (como o VFX): não se ouve a IA cortando madeira no escuro.
 */
import { EVT } from '../sim/events.js';
import { NEUTRAL_OWNER_ID } from '../sim/EntityIds.js';
import { UNITS } from '../data/units.js';

const NONE = Object.freeze([]);

/** Projétil disparado -> receita do disparo. */
export const FIRE_SFX = Object.freeze({ arrow: 'bow', axe: 'axeThrow', bolt: 'bolt', boulder: 'catapult' });
/** Projétil que acerta -> receita do impacto (flecha = carne/madeira, machado = crava, cerco = pedra). */
export const HIT_SFX = Object.freeze({ arrow: 'arrowHit', axe: 'axeHit', bolt: 'stoneHit', boulder: 'stoneHit' });
/** Margem de tela extra (fração) para o que é grande: o centro pode estar fora e o estrondo ainda ser visível. */
const BIG_MARGIN = 0.25;

/** Eventos que o `AudioEvents` registra para efeitos (a ordem não importa). */
export const SFX_EVENTS = Object.freeze([
  EVT.WORKER_CHOP, EVT.WORKER_MINE, EVT.WORKER_HAMMER, EVT.BUILDING_VFX,
  EVT.PROJECTILE_FIRED, EVT.PROJECTILE_HIT, EVT.MELEE_HIT, EVT.EXPLOSION,
  EVT.UNIT_DIED, EVT.BUILDING_DESTROYED, EVT.RESOURCE_DEPLETED, EVT.ABILITY_CAST,
  EVT.BUILDING_PLACED, EVT.BUILDING_COMPLETED, EVT.UNIT_TRAINED, EVT.RESEARCH_DONE, EVT.RESOURCE_GATHERED,
  EVT.UNDER_ATTACK, EVT.MATCH_WON, EVT.MATCH_LOST
]);

/** Eventos que alimentam a intensidade de combate da música adaptativa. */
export const COMBAT_EVENTS = Object.freeze([EVT.UNIT_DAMAGED, EVT.BUILDING_DAMAGED, EVT.UNIT_DIED, EVT.BUILDING_DESTROYED, EVT.EXPLOSION]);

/**
 * Eventos do catálogo que NÃO viram efeito sonoro aqui, com o motivo (o teste exige que todo `EVT.*` esteja em
 * `SFX_EVENTS`, em `COMBAT_EVENTS` ou aqui — nenhum evento fica sem destino).
 */
export const SILENT_EVENTS = Object.freeze({
  [EVT.UNIT_DAMAGED]: 'só intensidade de combate; o som do golpe vem de MELEE_HIT/PROJECTILE_HIT',
  [EVT.BUILDING_DAMAGED]: 'só intensidade de combate; o som vem do golpe/projétil',
  [EVT.BUILDING_CANCELLED]: 'cancelar obra não tem som próprio (o clique de ordem já tocou)',
  [EVT.HQ_TIER_CHANGED]: 'o fim da obra/pesquisa já toca o marco (buildComplete)',
  [EVT.RESOURCES_SPENT]: 'sem som próprio (a HUD mostra)',
  [EVT.NOTIFY]: 'aviso de texto da HUD',
  [EVT.CAMP_CLEARED]: 'o combate e o RESOURCE_GATHERED já soam',
  [EVT.ABILITY_EFFECT]: 'o som da magia sai em ABILITY_CAST',
  [EVT.MANA_CHANGED]: 'sem som',
  [EVT.HAZARD_SPAWNED]: 'sem som próprio; a detonação sai em EXPLOSION',
  [EVT.HAZARD_REMOVED]: 'sem som próprio; a detonação sai em EXPLOSION',
  [EVT.SELECTED]: 'tratado em AudioEvents (clique)',
  [EVT.ORDER_ISSUED]: 'tratado em AudioEvents (clique)',
  [EVT.PLAYER_DEFEATED]: 'o fim da partida soa em MATCH_WON/MATCH_LOST',
  [EVT.MISSION_OBJECTIVE]: 'painel da HUD (sem som)',
  [EVT.MISSION_DIALOG]: 'painel da HUD (sem som)',
  [EVT.MISSION_MESSAGE]: 'painel da HUD (sem som)',
  [EVT.MISSION_CAMERA]: 'movimento de câmera (sem som)',
  [EVT.MISSION_CUTSCENE]: 'movimento de câmera (sem som)',
  [EVT.MISSION_MUSIC]: 'tratado pelo MissionController (liga/desliga a música)',
  [EVT.MISSION_SOUND]: 'tratado pelo MissionController (SoundManager)',
  [EVT.MISSION_ENDED]: 'o fim da partida soa em MATCH_WON/MATCH_LOST'
});

const d = (sfx, pos, priority, gain = 1) => ({ sfx, pos: pos || null, priority, gain });
const dm = (sfx, pos, priority, gain, margin, extra) => ({ ...d(sfx, pos, priority, gain), margin, ...extra });

/** A unidade é naval (afunda em vez de cair)? */
const isNavalUnit = (type) => !!(type && UNITS[type] && UNITS[type].layer === 'naval');

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
      // dono neutro = a árvore terminou de cair (Tree.update); senão é o golpe do machado do lenhador
      if (p.ownerId === NEUTRAL_OWNER_ID) return audible ? [d('treeFall', p.pos, 1.0)] : NONE;
      return audible ? [d('chop', p.pos, own ? 1.2 : 0.8)] : NONE;
    case EVT.WORKER_MINE:
      return audible ? [d(p.resource === 'gold' ? 'mineGold' : 'mineStone', p.pos, own ? 1.2 : 0.8)] : NONE;
    case EVT.WORKER_HAMMER:
      return audible ? [d('hammer', p.pos, own ? 1.2 : 0.8)] : NONE;
    case EVT.BUILDING_VFX: // só as faíscas da bigorna da forja tilintam; fumaça, serragem etc. são mudas
      return audible && p.kind === 'anvil_spark' ? [d('anvil', p.pos, 0.7, own ? 0.8 : 0.6)] : NONE;

    case EVT.PROJECTILE_FIRED:
      return audible ? [d(FIRE_SFX[p.kind] || 'bow', p.from, own ? 1.6 : 1.1)] : NONE;
    case EVT.PROJECTILE_HIT: {
      if (!audible) return NONE;
      const siege = p.kind === 'bolt' || p.kind === 'boulder';
      const hit = d(HIT_SFX[p.kind] || 'arrowHit', p.pos, siege ? 2 : own ? 1.4 : 1.0);
      if (siege) hit.margin = BIG_MARGIN / 2;
      return [hit];
    }
    case EVT.MELEE_HIT:
      // metal contra metal: aço da Aliança × ferro da Horda (a receita sorteia lâmina/escudo/armadura e a variante no RNG de áudio)
      return audible ? [dm('metalHit', p.pos, own ? 1.6 : 1.1, 1, undefined, { variant: info.faction === 'orc' ? 'iron' : 'steel' })] : NONE;
    case EVT.EXPLOSION: {
      const size = typeof p.radius === 'number' && Number.isFinite(p.radius) ? Math.min(1, Math.max(0.2, (p.radius - 1) / 5)) : 0.7;
      return audible ? [dm('explosion', p.pos, 3, 1, BIG_MARGIN, { size })] : NONE;
    }

    case EVT.UNIT_DIED:
      if (p.expired || !audible) return NONE;
      if (isNavalUnit(p.unitType)) return [dm('shipSink', p.pos, own ? 2.4 : 2.0, 1, BIG_MARGIN)];
      return [d('death', p.pos, own ? 1.8 : 1.2)];
    case EVT.BUILDING_DESTROYED:
      return audible ? [dm('collapse', p.pos, 2.8, 1, BIG_MARGIN)] : NONE;
    case EVT.RESOURCE_DEPLETED: {
      const rt = p.resourceType || p.resource || 'gold';
      if (!audible || rt === 'wood') return NONE;
      return [dm('collapse', p.pos, 2.8, 1, BIG_MARGIN)];
    }
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
