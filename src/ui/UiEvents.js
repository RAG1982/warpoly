/**
 * UiEvents.js — F2-07: ouvinte de apresentação que traduz eventos de `gm.events`
 * (`src/sim/events.js`) em `UIManager.showNotification`. Criado pela `MatchSession`; nunca em
 * modo headless.
 */
import { EVT } from '../sim/events.js';
import { UPGRADE_CONFIG } from '../core/UpgradeConfig.js';

/**
 * @param {import('../core/GameManager.js').GameManager} gm
 * @param {import('./UIManager.js').UIManager} uiManager
 * @returns {() => void} `dispose` — remove todos os ouvintes registrados.
 */
export function createUiEvents(gm, uiManager) {
  const offs = [];
  const on = (type, fn) => offs.push(gm.events.on(type, fn));
  const isLocal = ownerId => ownerId === gm.localPlayerId;

  // Notificações genéricas (recursos insuficientes ao colocar construção, esquadrão de ataque
  // da IA…) — sempre restritas ao jogador local, como antes.
  on(EVT.NOTIFY, ({ ownerId, text }) => {
    if (isLocal(ownerId)) uiManager.showNotification(text);
  });

  // Melhoria forjada: mesma mensagem/condição de `GameManager.completeUpgrade` antes da F2-07.
  on(EVT.RESEARCH_DONE, ({ ownerId, upgradeId }) => {
    if (!isLocal(ownerId)) return;
    const player = gm.getPlayer(ownerId);
    const cfg = UPGRADE_CONFIG[upgradeId];
    const factionType = player && player.factionId === 'orc' ? 'orc' : 'human';
    const upgName = cfg?.name?.[factionType] || upgradeId;
    uiManager.showNotification(`🔥 Melhoria forjada: ${upgName}!`);
  });

  // Jogador derrotado: mostrado para qualquer jogador (era assim antes — sem filtro de dono).
  on(EVT.PLAYER_DEFEATED, ({ name }) => {
    uiManager.showNotification(`☠️ ${name} foi derrotado!`);
  });

  return function dispose() {
    offs.forEach(off => off());
    offs.length = 0;
  };
}
