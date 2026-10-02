/**
 * AIStrategy — F5-04: estratégias / build orders por facção e adaptação à composição do inimigo.
 * Dados puros (sem three.js/DOM). Escolha determinística: `pickStrategy(rng, ...)` usa só o RNG do diretor.
 *
 * Campos de `STRATEGIES[id]`:
 * - workers        alvo de trabalhadores (somado a `profile.workerBonus`; `richWorkers` quando sobra recurso)
 * - barracks       nº de quartéis desejados
 * - firstWave      tamanho mínimo da 1ª onda (mín. com `profile.attackBase`)
 * - waveStep       aumento por onda
 * - towers         torres de defesa desejadas
 * - hqUpgradeAt    nº de trabalhadores vivos que libera a evolução do Centro
 * - tech           constrói Torre Arcana/conjuradores (só com `profile.casters`)
 * - siegeAt        nº de combatentes de linha vivos que libera o cerco
 * - mix            fração de atiradores no exército (resto = corpo a corpo)
 * - cavalryRatio   1 montaria para cada N combatentes de linha (0 = não usa)
 * - requiresFeature   estratégia só existe com a flag ligada (`AI_FEATURES`)
 */

/** Flags de recursos de jogo que a IA só pode usar quando existirem. F4-06 (unidades aéreas) liga `air`. */
export const AI_FEATURES = { air: false };

export const STRATEGIES = Object.freeze({
  rush: Object.freeze({
    id: 'rush', workers: 6, richWorkers: 8, barracks: 2, firstWave: 6, waveStep: 1, towers: 0,
    hqUpgradeAt: 99, tech: false, siegeAt: 99, mix: 0.3, cavalryRatio: 4
  }),
  boom: Object.freeze({
    id: 'boom', workers: 8, richWorkers: 13, barracks: 1, firstWave: 6, waveStep: 1, towers: 1,
    hqUpgradeAt: 8, tech: true, siegeAt: 6, mix: 0.4, cavalryRatio: 3
  }),
  turtle: Object.freeze({
    id: 'turtle', workers: 8, richWorkers: 10, barracks: 1, firstWave: 8, waveStep: 1, towers: 4,
    hqUpgradeAt: 9, tech: true, siegeAt: 5, mix: 0.45, cavalryRatio: 5
  }),
  air: Object.freeze({
    id: 'air', workers: 8, richWorkers: 12, barracks: 1, firstWave: 7, waveStep: 1, towers: 2,
    hqUpgradeAt: 8, tech: true, siegeAt: 99, mix: 0.5, cavalryRatio: 0,
    requiresFeature: 'air'
  })
});

/** Ajustes por facção (Horda: mais corpo a corpo e cavalaria; Aliança: mais atiradores). */
export const FACTION_TWEAKS = Object.freeze({
  human: Object.freeze({ mixDelta: +0.1, cavalryDelta: 0 }),
  orc: Object.freeze({ mixDelta: -0.1, cavalryDelta: -1 })
});

/** Estratégias sorteáveis para a dificuldade (pesos de `profile.strategies`, descartando flags desligadas). */
export function availableStrategies(profile, features = AI_FEATURES) {
  const out = [];
  const ids = Object.keys(profile.strategies);
  for (let i = 0; i < ids.length; i++) {
    const s = STRATEGIES[ids[i]];
    if (!s) continue;
    if (s.requiresFeature && !features[s.requiresFeature]) continue;
    out.push({ id: s.id, weight: profile.strategies[ids[i]] });
  }
  return out;
}

/** Sorteia uma estratégia usando exclusivamente `rng` (determinístico por seed + playerId). */
export function pickStrategy(rng, profile, features = AI_FEATURES) {
  const list = availableStrategies(profile, features);
  if (list.length === 0) return STRATEGIES.boom;
  let total = 0;
  for (let i = 0; i < list.length; i++) total += list[i].weight;
  let r = (rng ? rng.next() : 0) * total;
  for (let i = 0; i < list.length; i++) {
    r -= list[i].weight;
    if (r < 0) return STRATEGIES[list[i].id];
  }
  return STRATEGIES[list[list.length - 1].id];
}

/**
 * Contra-unidades: devolve a mistura efetiva do exército dado o que se sabe do inimigo.
 * @returns {{ranged:number, cavalryRatio:number, siegeBonus:number}}
 */
export function adaptMix(strategy, factionId, comp) {
  const tweak = FACTION_TWEAKS[factionId] || FACTION_TWEAKS.human;
  let ranged = strategy.mix + tweak.mixDelta;
  let cavalryRatio = strategy.cavalryRatio > 0 ? Math.max(2, strategy.cavalryRatio + tweak.cavalryDelta) : 0;
  let siegeBonus = 0;
  if (comp && comp.total >= 4) {
    const rangedShare = (comp.ranged + comp.caster) / comp.total;
    const meleeShare = (comp.melee + comp.cavalry) / comp.total;
    if (meleeShare >= 0.6) ranged += 0.2; // atiradores contra corpo a corpo
    if (rangedShare >= 0.5) {
      ranged -= 0.2; // corpo a corpo e montarias contra atiradores
      cavalryRatio = cavalryRatio > 0 ? 2 : 3;
    }
    if (comp.cavalry / comp.total >= 0.35) ranged += 0.1; // atiradores por trás da infantaria contra montarias
  }
  if (comp && (comp.towers >= 2 || comp.walls >= 3 || comp.hqTier2)) siegeBonus = 1;
  ranged = Math.max(0.1, Math.min(0.8, ranged));
  return { ranged, cavalryRatio, siegeBonus };
}
