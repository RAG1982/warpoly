/**
 * victory.js — F3-09: regras puras de derrota por modo de vitória (sem three.js/DOM).
 *
 * - `conquest` (Destruir tudo, padrão): derrotado quando não resta nenhuma construção viva do
 *   jogador (em obra contam; muralhas `role:'wall'` não contam). Unidades sem construção não salvam.
 * - `regicide`: derrotado quando não resta Centro (`role:'hq'`) vivo.
 */
import { normalizeVictoryMode } from './MatchConfig.js';

/** Papéis que não contam para a regra "Destruir tudo". Papel desconhecido conta normalmente. */
const NON_COUNTING_ROLES = new Set(['wall']);

/**
 * @param {'conquest'|'regicide'} mode
 * @param {Array<{role: string, isDead?: boolean}>} ownedBuildings  construções do jogador
 *   (o chamador informa o `role` da definição de cada uma).
 */
export function isPlayerDefeated(mode, ownedBuildings) {
  const m = normalizeVictoryMode(mode);
  for (let i = 0; i < ownedBuildings.length; i++) {
    const b = ownedBuildings[i];
    if (b.isDead) continue;
    if (m === 'regicide') {
      if (b.role === 'hq') return false;
    } else if (!NON_COUNTING_ROLES.has(b.role)) {
      return false;
    }
  }
  return true;
}

/** Texto PT-BR da vitória, conforme o modo. */
export function victoryMessage(mode) {
  return normalizeVictoryMode(mode) === 'regicide'
    ? 'O Centro inimigo caiu!'
    : 'Todas as construções inimigas foram destruídas!';
}

/** Texto PT-BR da derrota, conforme o modo. */
export function defeatMessage(mode) {
  return normalizeVictoryMode(mode) === 'regicide'
    ? 'Seu Centro caiu diante dos invasores...'
    : 'Todas as suas construções foram destruídas...';
}
