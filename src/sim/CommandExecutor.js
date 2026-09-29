/**
 * CommandExecutor.js — F2-02: aplica um comando (ver `commands.js`) num GameManager.
 *
 * Resolve os ids do comando via `gm.entitiesById`, verifica autoria (a unidade/construção
 * precisa pertencer a `cmd.playerId`) e chama os métodos já existentes das entidades.
 * Comandos para entidades mortas/inexistentes ou de outro dono são descartados
 * silenciosamente (autoria só gera `console.warn` em dev — ver `_warnForeign`).
 */
import { CMD } from './commands.js';

/** `console.warn` (sem gate de build — ver `_COMUM.md`: mais simples, sem custo em produção). */
function warnForeign(cmd, kind, id) {
  console.warn(`[CommandExecutor] comando '${cmd.type}' do jogador ${cmd.playerId} ignorado: ${kind} ${id} não é seu.`);
}

/** Unidades vivas de `cmd.unitIds` que pertencem a `cmd.playerId`. */
function resolveOwnedUnits(gm, cmd) {
  const out = [];
  const ids = cmd.unitIds || [];
  for (let i = 0; i < ids.length; i++) {
    const u = gm.entitiesById.get(ids[i]);
    if (!u || u.isDead) continue;
    if (u.ownerId !== cmd.playerId) {
      warnForeign(cmd, 'unidade', ids[i]);
      continue;
    }
    out.push(u);
  }
  return out;
}

/** Construção viva de `id` pertencente a `cmd.playerId` (ou `null`). */
function resolveOwnedBuilding(gm, cmd, id) {
  const b = gm.entitiesById.get(id);
  if (!b || b.isDead) return null;
  if (b.ownerId !== cmd.playerId) {
    warnForeign(cmd, 'construção', id);
    return null;
  }
  return b;
}

/**
 * Aplica uma ordem resolvida (`order.type` reaproveita os valores de `CMD`) numa unidade:
 * imediatamente, ou (se `queued`) empilhada em `unit.orderQueue` para rodar quando a
 * unidade ficar `idle` (ver `Unit.updateIdle`). `queued` só existe para MOVE/ATTACK_MOVE/
 * GATHER/BUILD (item 4 da spec F2-02).
 */
function dispatchOrder(unit, order, queued) {
  if (queued) {
    if (!unit.orderQueue) unit.orderQueue = [];
    unit.orderQueue.push(order);
  } else {
    unit.orderQueue = null;
    unit.runQueuedOrder(order);
  }
}

/** Formação em grade (mesmo cálculo do antigo `GameManager.issueOrder`), uma unidade por vez. */
function moveInFormation(gm, units, x, z, queued) {
  let cx = x;
  let cz = z;
  if (gm.pathfinder && gm.pathfinder.isWater(cx, cz)) {
    const snapped = gm.pathfinder.findNearestWalkable(cx, cz);
    cx = snapped.x;
    cz = snapped.z;
  }

  const count = units.length;
  const cols = Math.ceil(Math.sqrt(count));
  const spacing = 1.6;

  for (let idx = 0; idx < count; idx++) {
    const row = Math.floor(idx / cols);
    const col = idx % cols;
    const offsetX = (col - (cols - 1) / 2) * spacing;
    const offsetZ = (row - (cols - 1) / 2) * spacing;
    let destX = cx + offsetX;
    let destZ = cz + offsetZ;
    if (gm.pathfinder && gm.pathfinder.isWater(destX, destZ)) {
      destX = cx;
      destZ = cz;
    }
    dispatchOrder(units[idx], { type: CMD.MOVE, x: destX, z: destZ }, queued);
  }
}

export const CommandExecutor = {
  execute(gm, cmd) {
    switch (cmd.type) {
      case CMD.MOVE: {
        const units = resolveOwnedUnits(gm, cmd);
        if (units.length > 0) moveInFormation(gm, units, cmd.x, cmd.z, !!cmd.queued);
        break;
      }

      case CMD.ATTACK_MOVE: {
        const units = resolveOwnedUnits(gm, cmd);
        for (let i = 0; i < units.length; i++) {
          dispatchOrder(units[i], { type: CMD.ATTACK_MOVE, x: cmd.x, z: cmd.z }, !!cmd.queued);
        }
        break;
      }

      case CMD.PATROL: {
        const units = resolveOwnedUnits(gm, cmd);
        for (let i = 0; i < units.length; i++) {
          units[i].orderQueue = null;
          units[i].orderPatrol(cmd.x, cmd.z, gm);
        }
        break;
      }

      case CMD.ATTACK: {
        const target = gm.entitiesById.get(cmd.targetId);
        if (!target || target.isDead) break;
        const units = resolveOwnedUnits(gm, cmd);
        for (let i = 0; i < units.length; i++) {
          units[i].orderQueue = null;
          units[i].orderAttack(target);
        }
        break;
      }

      case CMD.GATHER: {
        const target = gm.entitiesById.get(cmd.targetId);
        if (!target || target.isDead) break;
        const units = resolveOwnedUnits(gm, cmd);
        for (let i = 0; i < units.length; i++) {
          dispatchOrder(units[i], { type: CMD.GATHER, target }, !!cmd.queued);
        }
        break;
      }

      case CMD.BUILD: {
        const building = resolveOwnedBuilding(gm, cmd, cmd.buildingId);
        if (!building) break;
        const units = resolveOwnedUnits(gm, cmd);
        for (let i = 0; i < units.length; i++) {
          dispatchOrder(units[i], { type: CMD.BUILD, target: building }, !!cmd.queued);
        }
        break;
      }

      case CMD.PLACE_BUILDING: {
        gm.placeBuilding(cmd.buildingType, cmd.x, cmd.z, cmd.unitIds || [], cmd.playerId);
        break;
      }

      case CMD.TRAIN: {
        const building = resolveOwnedBuilding(gm, cmd, cmd.buildingId);
        if (!building) break;
        building.queueUnit(cmd.unitType, gm);
        break;
      }

      case CMD.CANCEL_TRAIN: {
        const building = resolveOwnedBuilding(gm, cmd, cmd.buildingId);
        if (!building) break;
        building.cancelQueuedUnit(cmd.slot, gm);
        break;
      }

      case CMD.RESEARCH: {
        const building = resolveOwnedBuilding(gm, cmd, cmd.buildingId);
        if (!building) break;
        building.startResearch(cmd.upgradeId, gm);
        break;
      }

      case CMD.CANCEL_RESEARCH: {
        const building = resolveOwnedBuilding(gm, cmd, cmd.buildingId);
        if (!building) break;
        building.cancelResearch(gm);
        break;
      }

      case CMD.RALLY: {
        const building = resolveOwnedBuilding(gm, cmd, cmd.buildingId);
        if (!building) break;
        building.setRallyPoint({ x: cmd.x, y: 0, z: cmd.z });
        break;
      }

      case CMD.STOP: {
        const units = resolveOwnedUnits(gm, cmd);
        for (let i = 0; i < units.length; i++) {
          units[i].orderQueue = null;
          units[i].stop();
        }
        break;
      }

      case CMD.HOLD: {
        const units = resolveOwnedUnits(gm, cmd);
        for (let i = 0; i < units.length; i++) {
          units[i].orderQueue = null;
          units[i].hold();
        }
        break;
      }

      default:
        break;
    }
  }
};
