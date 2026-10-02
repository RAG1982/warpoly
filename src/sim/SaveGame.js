/**
 * SaveGame.js — F2-06: salvar/carregar partida (lógica pura, sem three.js/DOM; testável em Node).
 *
 * Formato (JSON compacto): como a simulação é determinística (F2-03), o save guarda só o que é
 * necessário para reproduzir o estado — `config` (MatchConfig, com a seed), os comandos dos
 * jogadores **humanos** executados/agendados até o tick atual, e o checksum do estado naquele tick.
 * Carregar = recriar a partida com a mesma config, reenfileirar os comandos e avançar a simulação
 * (`fastForward`) até o tick salvo; o checksum é conferido ao final. As IAs não entram no log: elas
 * regeneram os próprios comandos de forma determinística.
 *
 * Vantagens: save minúsculo (alguns KB), restaura TUDO (névoa explorada, mana, status, filas, IAs,
 * RNGs) sem serializar cada máquina de estados; é o mesmo formato de um replay (F9-05).
 * Custo: o tempo de carga cresce com o tempo de jogo (~0,4 ms por tick: 5 min ≈ 2,5 s) e um save
 * só é válido para a versão do código/dados que o gerou (`SAVE_VERSION` + conferência de checksum).
 */
import { stateChecksum } from './checksum.js';
import { SIM_DT } from './constants.js';
import { validateCommand } from './commands.js';

/** Versão do formato. Suba quando o formato OU as regras da simulação mudarem de forma incompatível. */
export const SAVE_VERSION = 1;

/** Comandos de jogadores humanos (não-IA) já executados (`commands.log`) ou ainda agendados. */
export function humanCommands(gm) {
  const out = [];
  const keep = (c) => {
    const pl = gm.getPlayer(c.playerId);
    if (pl && pl.isAI) return;
    const { seqNo: _seq, ...rest } = c; // eslint-disable-line no-unused-vars
    out.push(rest);
  };
  gm.commands.log.forEach(keep);
  gm.commands.pending().forEach(keep);
  return out;
}

/**
 * Captura o estado salvável da partida. `view` (opcional) = estado de apresentação a restaurar
 * (câmera, seleção, grupos de controle) — não faz parte do checksum.
 * @returns {object} save (objeto JSON puro)
 */
export function captureSave(gm, { name = '', view = null, now = Date.now() } = {}) {
  const local = gm.localPlayer;
  return {
    version: SAVE_VERSION,
    name,
    savedAt: now,
    tick: gm.currentTick,
    gameTime: gm.gameTime,
    checksum: stateChecksum(gm),
    config: JSON.parse(JSON.stringify(gm.matchConfig)),
    commands: humanCommands(gm),
    summary: {
      mapId: gm.matchConfig.mapId,
      seconds: Math.round(gm.currentTick * SIM_DT),
      faction: local ? local.factionId : null,
      difficulty: gm.matchConfig.difficulty || null,
      units: gm.getUnitsOf(gm.localPlayerId).length,
      buildings: gm.buildings.filter(b => b.ownerId === gm.localPlayerId).length
    },
    view
  };
}

export function serializeSave(save) {
  return JSON.stringify(save);
}

/** Valida e devolve o save; lança `Error` (PT-BR) se o JSON/versão/estrutura for inválido. */
export function parseSave(json) {
  let save;
  try {
    save = typeof json === 'string' ? JSON.parse(json) : json;
  } catch {
    throw new Error('Save corrompido (JSON inválido).');
  }
  if (!save || typeof save !== 'object') throw new Error('Save inválido.');
  if (save.version !== SAVE_VERSION) throw new Error(`Versão de save incompatível (${save.version}; esperada ${SAVE_VERSION}).`);
  if (!Number.isInteger(save.tick) || save.tick < 0) throw new Error('Save inválido: tick.');
  if (!save.config || typeof save.config !== 'object' || !Array.isArray(save.config.players)) throw new Error('Save inválido: configuração da partida.');
  if (!Array.isArray(save.commands)) throw new Error('Save inválido: comandos.');
  for (const c of save.commands) {
    const check = validateCommand(c);
    if (!check.ok || !Number.isInteger(c.tick)) throw new Error(`Save inválido: ${check.reason || 'tick do comando'}.`);
  }
  return save;
}

/** Reenfileira os comandos do save na `gm` recém-criada (antes de avançar a simulação). */
export function applySaveCommands(gm, save) {
  for (const c of save.commands) {
    gm.commands.enqueue(Object.freeze({ ...c }));
    gm.matchStats.countCommand(c.playerId);
  }
}

/**
 * Avança `gm` até `save.tick`, no máximo `maxSteps` passos por chamada (para repartir em vários
 * quadros e mostrar progresso). Devolve quantos ticks faltam. Ouvintes de apresentação (áudio/VFX/UI)
 * ficam mudos durante o avanço; chame `finishFastForward` ao terminar.
 */
export function fastForward(gm, save, maxSteps = Infinity) {
  gm.events.presentationMuted = true;
  let n = 0;
  // Mesmo protocolo de `GameManager.advance`: as views interpolam de `_prevPos`/`_simPos` — essas poses precisam
  // estar em dia (F2-08c: a pose interpolada nunca é escrita no corpo de simulação, então não há o que restaurar).
  const poses = typeof gm._snapshotSimPose === 'function';
  while (gm.currentTick < save.tick && n < maxSteps) {
    if (poses) gm._snapshotPrevPose();
    gm.simStep(SIM_DT);
    if (poses) gm._snapshotSimPose();
    n++;
  }
  return save.tick - gm.currentTick;
}

/**
 * Fecha o avanço: reativa a apresentação, alinha a pose de interpolação com a pose simulada e
 * compara o checksum. @returns {{ok:boolean, expected:number, actual:number}}
 */
export function finishFastForward(gm, save) {
  gm.events.presentationMuted = false;
  gm.events.flush();
  if (typeof gm._snapshotPrevPose === 'function') {
    gm._snapshotPrevPose();
    gm._snapshotSimPose();
  }
  gm._acc = 0;
  gm._lastAlpha = 0;
  const actual = stateChecksum(gm);
  return { ok: actual === save.checksum, expected: save.checksum, actual };
}

/** Atalho síncrono (testes/headless): aplica comandos, avança até o tick e confere o checksum. */
export function restoreSync(gm, save) {
  applySaveCommands(gm, save);
  fastForward(gm, save);
  return finishFastForward(gm, save);
}
