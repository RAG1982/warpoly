/**
 * commands.js — F2-02: contrato de comandos, a única forma de alterar o estado do jogo.
 *
 * Lógica pura (sem three.js/DOM), testável em Node. Um comando é um objeto JSON puro
 * (só números/strings/arrays — nunca referências a entidades/objetos) que descreve UMA
 * intenção de um jogador (`playerId`) num tick de simulação (`tick`). `CommandQueue`
 * enfileira, ordena e drena por tick; `CommandExecutor` resolve os ids em entidades reais
 * e aplica os efeitos.
 */

import { WALL_MAX_POINTS } from '../data/buildings.js';

/** Tipos de comando suportados. */
export const CMD = Object.freeze({
  MOVE: 'move',
  ATTACK: 'attack',
  ATTACK_MOVE: 'attackMove',
  GATHER: 'gather',
  BUILD: 'build',
  REPAIR: 'repair',
  CANCEL_CONSTRUCTION: 'cancelConstruction',
  PLACE_BUILDING: 'placeBuilding',
  PLACE_WALL: 'placeWall',
  TRAIN: 'train',
  CANCEL_TRAIN: 'cancelTrain',
  RESEARCH: 'research',
  CANCEL_RESEARCH: 'cancelResearch',
  UPGRADE_HQ: 'upgradeHq',
  CANCEL_UPGRADE_HQ: 'cancelUpgradeHq',
  RALLY: 'rally',
  STOP: 'stop',
  HOLD: 'hold',
  PATROL: 'patrol'
});

const ALL_TYPES = new Set(Object.values(CMD));

/**
 * Campos (além de `type`/`playerId`, sempre obrigatórios) exigidos por tipo de comando.
 * `tick` é preenchido por `GameManager.issue` antes de `makeCommand` ser chamado por ele,
 * mas não é exigido aqui para permitir testar `makeCommand` isoladamente.
 */
const REQUIRED_FIELDS = {
  [CMD.MOVE]: ['unitIds', 'x', 'z'],
  [CMD.ATTACK]: ['unitIds', 'targetId'],
  [CMD.ATTACK_MOVE]: ['unitIds', 'x', 'z'],
  [CMD.GATHER]: ['unitIds', 'targetId'],
  [CMD.BUILD]: ['unitIds', 'buildingId'],
  [CMD.REPAIR]: ['unitIds', 'buildingId'],
  [CMD.CANCEL_CONSTRUCTION]: ['buildingId'],
  [CMD.PLACE_BUILDING]: ['buildingType', 'x', 'z', 'unitIds'],
  [CMD.PLACE_WALL]: ['buildingType', 'points', 'unitIds'],
  [CMD.TRAIN]: ['buildingId', 'unitType'],
  [CMD.CANCEL_TRAIN]: ['buildingId', 'slot'],
  [CMD.RESEARCH]: ['buildingId', 'upgradeId'],
  [CMD.CANCEL_RESEARCH]: ['buildingId'],
  [CMD.UPGRADE_HQ]: ['buildingId'],
  [CMD.CANCEL_UPGRADE_HQ]: ['buildingId'],
  [CMD.RALLY]: ['buildingId', 'x', 'z'],
  [CMD.STOP]: ['unitIds'],
  [CMD.HOLD]: ['unitIds'],
  [CMD.PATROL]: ['unitIds', 'x', 'z']
};

/**
 * Verifica se `fields` tem os campos obrigatórios de `type` (e `type`/`playerId` válidos).
 * Não lança: use para validar comandos vindos de fora (rede/replay) sem try/catch.
 * @returns {{ok: boolean, reason?: string}}
 */
export function validateCommand(fields) {
  if (!fields || typeof fields !== 'object') return { ok: false, reason: 'comando não é um objeto' };
  if (!ALL_TYPES.has(fields.type)) return { ok: false, reason: `tipo de comando inválido: ${fields.type}` };
  if (typeof fields.playerId !== 'number') return { ok: false, reason: 'playerId numérico obrigatório' };

  const required = REQUIRED_FIELDS[fields.type] || [];
  for (const key of required) {
    if (fields[key] === undefined) {
      return { ok: false, reason: `campo obrigatório '${key}' faltando para o comando '${fields.type}'` };
    }
  }

  if (fields.type === CMD.PLACE_WALL) {
    // F3-08: `points` = [{x, z}, ...] com 1..WALL_MAX_POINTS pontos numéricos.
    const pts = fields.points;
    if (!Array.isArray(pts) || pts.length === 0) return { ok: false, reason: "'points' precisa ser um array não vazio" };
    if (pts.length > WALL_MAX_POINTS) return { ok: false, reason: `'points' excede o limite de ${WALL_MAX_POINTS} pontos` };
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      if (!p || typeof p.x !== 'number' || typeof p.z !== 'number') return { ok: false, reason: `ponto ${i} inválido em 'points'` };
    }
  }
  return { ok: true };
}

/**
 * Constrói um comando congelado a partir de `fields` (deve conter `type` e `playerId`,
 * mais os campos obrigatórios do tipo — ver `REQUIRED_FIELDS`). Lança `Error` se inválido.
 * `GameManager.issue` é quem preenche `tick`; chame com o campo já incluso quando disponível.
 */
export function makeCommand(fields) {
  const check = validateCommand(fields);
  if (!check.ok) throw new Error(`makeCommand: ${check.reason}`);
  return Object.freeze({ ...fields });
}

/** Comando → string JSON (só dados simples: sempre serializável). */
export function serialize(cmd) {
  return JSON.stringify(cmd);
}

/** String JSON → objeto comando (plano, não congelado; use `makeCommand`/`validateCommand` se precisar validar). */
export function deserialize(str) {
  return JSON.parse(str);
}
