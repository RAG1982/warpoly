/**
 * UiEvents.js — F2-07: ouvinte de apresentação que traduz eventos de `gm.events`
 * (`src/sim/events.js`) em `UIManager.showNotification`. Criado pela `MatchSession`; nunca em
 * modo headless.
 */
import { EVT } from '../sim/events.js';
import { UPGRADE_CONFIG } from '../core/UpgradeConfig.js';
import { t, researchName, tierName } from '../i18n/index.js';
import { buildingLabel, playerDisplayName } from './uiText.js';
import { AlertCenter } from './alerts.js';
import { techLock } from '../sim/techRestriction.js';
import { hqTierUnlocks, hasAnyUnlock } from './hqTierUnlocks.js';
import { HqTierPanel } from './screens/HqTierPanel.js';

const ALERT_ICON = { attack: '⚔️', depleted: '⛏️', research: '🔥', built: '🏗️', food: '🌾' };

/**
 * @param {import('../core/GameManager.js').GameManager} gm
 * @param {import('./UIManager.js').UIManager} uiManager
 * @returns {() => void} `dispose` — remove todos os ouvintes registrados.
 */
export function createUiEvents(gm, uiManager) {
  const offs = [];
  const on = (type, fn) => offs.push(gm.events.on(type, fn, true)); // true = apresentação (F2-06)
  const isLocal = ownerId => ownerId === gm.localPlayerId;
  const pos2d = (pos) => (pos ? { x: pos.x, z: pos.z } : null);
  const tierPanel = new HqTierPanel(); // M3-03a: "Centro evoluído" (só o jogador local dispara; ver HQ_TIER_CHANGED)

  // F6-05: central de alertas (anti-spam, histórico p/ Espaço, pings do minimapa). Anexada à HUD
  // (`uiManager.alerts`) para o InputManager (Espaço) e o UIManager (minimapa, comida) usarem.
  const alerts = new AlertCenter({
    onShow: (a) => {
      uiManager.showNotification(`${ALERT_ICON[a.kind] || ''} ${a.text}`.trim(), 4000, a.severity);
      if (!a.sound) return;
      // Concluídos soam pelo AudioEvents; aqui só o que não tem evento de áudio próprio.
      if (a.kind === 'attack') uiManager.sound?.playAlarm?.();
      else if (a.kind === 'food') uiManager.sound?.playError?.();
    }
  });
  uiManager.alerts = alerts;

  // Notificações genéricas (recursos insuficientes ao colocar construção, esquadrão de ataque
  // da IA…) — sempre restritas ao jogador local, como antes.
  on(EVT.NOTIFY, ({ ownerId, text }) => {
    if (isLocal(ownerId)) uiManager.showNotification(text);
  });

  // Melhoria forjada: mesma mensagem/condição de `GameManager.completeUpgrade` antes da F2-07.
  on(EVT.RESEARCH_DONE, ({ ownerId, upgradeId, level, pos }) => {
    if (!isLocal(ownerId)) return;
    const player = gm.getPlayer(ownerId);
    const cfg = UPGRADE_CONFIG[upgradeId];
    const factionType = player && player.factionId === 'orc' ? 'orc' : 'human';
    const upgName = researchName(upgradeId, factionType, cfg);
    const lvText = cfg && cfg.maxLevel > 1 && level ? ` ${level}/${cfg.maxLevel}` : '';
    alerts.raise('research', { pos: pos2d(pos), text: t('alert.researchDone', { name: `${upgName}${lvText}` }) });
  });

  // F3-06: Centro evoluiu de nível — aviso PT-BR (só para o jogador local, dono do Centro).
  on(EVT.HQ_TIER_CHANGED, ({ ownerId, tier }) => {
    if (!isLocal(ownerId)) return;
    const player = gm.getPlayer(ownerId);
    const factionType = player && player.factionId === 'orc' ? 'orc' : 'human';
    uiManager.showNotification(`🏰 ${t('alert.tierDone', { name: tierName(factionType, tier) })}`);
    // M3-03a: painel "Centro evoluído" com o que o nível libera (não pausa; `presentation` => mudo em save/replay).
    const unlocks = hqTierUnlocks(tier, factionType, (kind, id, level) => !techLock(gm, ownerId, kind, id, level));
    if (hasAnyUnlock(unlocks)) {
      tierPanel.open({ title: t('hq.tierUp.title', { name: tierName(factionType, tier) }), unlocks, factionId: factionType });
    }
  });

  // Jogador derrotado: mostrado para qualquer jogador (era assim antes — sem filtro de dono).
  on(EVT.PLAYER_DEFEATED, ({ name }) => {
    uiManager.showNotification(`☠️ ${t('alert.defeated', { name: playerDisplayName(name) })}`);
  });

  // F3-04: mina/pedreira esgotada — sem `ownerId` no payload (jazida é neutra), mostrado a
  // qualquer jogador local como as demais notificações genéricas.
  on(EVT.RESOURCE_DEPLETED, ({ resourceType, pos }) => {
    alerts.raise('depleted', { pos: pos2d(pos), text: t('alert.depletedNode', { name: t(`res.node.${resourceType === 'stone' ? 'stone' : 'gold'}`) }) });
  });

  // F6-05: construção concluída (só do jogador local).
  on(EVT.BUILDING_COMPLETED, ({ ownerId, buildingType, pos }) => {
    if (!isLocal(ownerId)) return;
    alerts.raise('built', { pos: pos2d(pos), text: t('alert.builtDone', { name: buildingLabel(buildingType) }) });
  });

  // F6-05: "Estamos sob ataque" — dano a unidade/construção do jogador local, ou o aviso da IA
  // (`UNDER_ATTACK`, cujo alarme já toca no AudioEvents). Anti-spam e Espaço no AlertCenter.
  on(EVT.UNIT_DAMAGED, ({ ownerId, pos, amount }) => {
    if (isLocal(ownerId) && amount > 0) alerts.raise('attack', { pos: pos2d(pos) });
  });
  on(EVT.BUILDING_DAMAGED, ({ ownerId, pos, amount }) => {
    if (isLocal(ownerId) && amount > 0) alerts.raise('attack', { pos: pos2d(pos) });
  });
  on(EVT.UNDER_ATTACK, ({ ownerId, pos }) => {
    if (isLocal(ownerId)) alerts.raise('attack', { pos: pos2d(pos), sound: false });
  });

  return function dispose() {
    offs.forEach(off => off());
    offs.length = 0;
    alerts.clear();
    tierPanel.close();
    if (uiManager.alerts === alerts) uiManager.alerts = null;
  };
}
