/**
 * AIProfile.js — F5-03: níveis de dificuldade da IA (dados puros, sem three.js/DOM).
 *
 * Campos:
 * - maxApm         comandos por minuto que a IA pode emitir (balde de fichas em `AIDirector.issue`).
 * - tickInterval   atraso de reação (s): intervalo entre decisões do diretor.
 * - micro          0 nenhum · 1 recuar feridos · 2 + focar fogo, kiting (contra alvos mais lentos), escolta de cerco,
 *                  assédio a trabalhadores, magias, reação total à invasão (recall), guarda de casa maior ·
 *                  3 + flanquear.
 * - resourceBonus  fração extra de cada coleta (só Brutal).
 * - cheatVision    enxerga o mapa inteiro (só Brutal; desliga a névoa da percepção).
 * - attackBase     tamanho base da onda de ataque (ciclo: base + 0..3).
 * - assess        razão mínima (valor do exército / valor do inimigo conhecido) para lançar uma onda (0 = ataca às cegas).
 * - assumeEnemy   fração do exército inimigo esperado pelo tempo de partida quando a percepção não vê nada.
 * - armyCap        máximo de combatentes vivos que a IA treina (0 = sem limite; Fácil).
 * - research      ouro mínimo em caixa para pesquisar na Forja/Serraria (Difícil+ pesquisa mais cedo).
 * - startDelay     segundos de partida antes da 1ª expedição.
 * - workerBonus    trabalhadores extras além do alvo da estratégia.
 * - scout          envia explorador.
 * - walls          constrói linha de muralha (F3-08).
 * - strategies     estratégias sorteáveis (F5-04) com pesos.
 */
export const DIFFICULTY_PROFILES = Object.freeze({
  easy: Object.freeze({
    id: 'easy', maxApm: 20, tickInterval: 2.5, micro: 0, resourceBonus: 0, cheatVision: false,
    attackBase: 3, assess: 0, assumeEnemy: 0, armyCap: 10, research: 400, startDelay: 420, workerBonus: -2, scout: false, walls: false, casters: false,
    strategies: Object.freeze({ boom: 2, turtle: 2 })
  }),
  normal: Object.freeze({
    id: 'normal', maxApm: 60, tickInterval: 1.0, micro: 1, resourceBonus: 0, cheatVision: false,
    attackBase: 6, assess: 1.0, assumeEnemy: 0.8, armyCap: 0, research: 400, startDelay: 150, workerBonus: 0, scout: true, walls: true, casters: false,
    strategies: Object.freeze({ rush: 1, boom: 2, turtle: 1 })
  }),
  hard: Object.freeze({
    id: 'hard', maxApm: 120, tickInterval: 0.75, micro: 2, resourceBonus: 0, cheatVision: false,
    attackBase: 6, assess: 1.2, assumeEnemy: 0.9, armyCap: 0, research: 120, startDelay: 90, workerBonus: 2, scout: true, walls: true, casters: true,
    strategies: Object.freeze({ rush: 2, boom: 2, turtle: 1, air: 1 })
  }),
  brutal: Object.freeze({
    id: 'brutal', maxApm: 240, tickInterval: 0.5, micro: 3, resourceBonus: 0.25, cheatVision: true,
    attackBase: 7, assess: 1.2, assumeEnemy: 0, armyCap: 0, research: 60, startDelay: 0, workerBonus: 4, scout: true, walls: true, casters: true,
    strategies: Object.freeze({ rush: 2, boom: 2, turtle: 1, air: 1 })
  })
});

export const DEFAULT_AI_DIFFICULTY = 'normal';

/** Ajustes de ferramentas de calibragem (`tools/ai-ladder.mjs --tune`): nunca usado pelo jogo. */
const overrides = {};

/** Sobrepõe campos de um perfil (só para ajuste fino em ferramentas; `null` limpa). */
export function overrideAIProfile(id, patch) {
  if (patch === null) delete overrides[id]; else overrides[id] = patch;
}

/** Perfil da dificuldade `id` (cai em `normal` se desconhecida). */
export function getAIProfile(id) {
  const base = DIFFICULTY_PROFILES[id] || DIFFICULTY_PROFILES[DEFAULT_AI_DIFFICULTY];
  return overrides[base.id] ? { ...base, ...overrides[base.id] } : base;
}
