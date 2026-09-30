/**
 * AudioEvents.js — F2-07: ouvinte de apresentação que traduz eventos de `gm.events`
 * (`src/sim/events.js`) em chamadas ao `SoundManager`. Criado pela `MatchSession`; nunca em modo
 * headless (`MatchConfig.headless`), já que não há `SoundManager`/Web Audio em Node.
 *
 * Preserva exatamente os gatilhos e condições de antes da F2-07 (comentados por evento);
 * a única mudança é onde a decisão é tomada — no ouvinte, a partir do payload (`ownerId`),
 * em vez de na simulação.
 */
import { EVT } from '../sim/events.js';

/**
 * @param {import('../core/GameManager.js').GameManager} gm
 * @param {*} soundManager
 * @returns {() => void} `dispose` — remove todos os ouvintes registrados.
 */
export function createAudioEvents(gm, soundManager) {
  const offs = [];
  const on = (type, fn) => offs.push(gm.events.on(type, fn));
  const isLocal = ownerId => ownerId === gm.localPlayerId;

  // Coleta de recursos: som só quando é o próprio jogador local que entrega (era `isLocal`).
  on(EVT.RESOURCE_GATHERED, ({ ownerId }) => {
    if (isLocal(ownerId)) soundManager.playOrder();
  });

  // Corte de madeira / mineração / martelo: sempre tocava, sem checar dono.
  on(EVT.WORKER_CHOP, () => soundManager.playChop());
  on(EVT.WORKER_MINE, ({ resource }) => {
    if (resource === 'gold') soundManager.playMineGold();
    else soundManager.playMineStone();
  });
  on(EVT.WORKER_HAMMER, () => soundManager.playHammer());

  // Projéteis e golpes corpo-a-corpo: sempre tocava.
  on(EVT.PROJECTILE_FIRED, ({ kind }) => {
    if (kind === 'axe') soundManager.playSword();
    else soundManager.playBow();
  });
  // F4-02: impacto do cerco (bolt/boulder) soa como pedra/ferro em vez do estalo de flecha.
  on(EVT.PROJECTILE_HIT, ({ kind }) => {
    if (kind === 'bolt' || kind === 'boulder') soundManager.playMineStone();
    else soundManager.playArrowHit();
  });
  on(EVT.MELEE_HIT, () => soundManager.playSword());
  // F4-05: explosão de sapador = impacto pesado (reaproveita o som do cerco)
  on(EVT.EXPLOSION, () => soundManager.playMineStone());

  // Construção: colocação só se local; treino e conclusão sempre tocavam.
  on(EVT.BUILDING_PLACED, ({ ownerId }) => {
    if (isLocal(ownerId)) soundManager.playBuildPlace();
  });
  on(EVT.UNIT_TRAINED, () => soundManager.playOrder());
  on(EVT.BUILDING_COMPLETED, () => soundManager.playBuildComplete());
  on(EVT.RESEARCH_DONE, () => soundManager.playBuildComplete());

  // Alarme de ataque da IA: só quando o alvo é o jogador local.
  on(EVT.UNDER_ATTACK, ({ ownerId }) => {
    if (isLocal(ownerId)) soundManager.playAlarm();
  });

  // Vitória: só chega a acontecer quando o time do jogador local venceu (ver
  // `GameManager._updateVictoryConditions`) — sempre tocava.
  on(EVT.MATCH_WON, () => soundManager.playVictory());

  return function dispose() {
    offs.forEach(off => off());
    offs.length = 0;
  };
}
