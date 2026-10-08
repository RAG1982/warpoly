import { GameManager } from '../../../src/core/GameManager.js';
import { Terrain } from '../../../src/world/Terrain.js';
import { getMap } from '../../../src/data/maps/index.js';
import { createMissionConfig } from '../../../src/data/missions/index.js';
import { SIM_DT } from '../../../src/sim/constants.js';
import { EVT } from '../../../src/sim/events.js';

/** Missão mínima válida no mapa `tutorial` (jogador 0 humano local × rival passivo 1). Sobrescreva campos com `over`. */
export function baseMission(over = {}) {
  return {
    format: 'warpolymission',
    version: 1,
    id: 't-mission',
    title: 'Teste',
    briefing: { text: 'Briefing de teste' },
    mapId: 'tutorial',
    seed: 5,
    players: [
      { id: 0, name: 'Você', factionId: 'human', team: 0, isLocal: true, startSlot: 0 },
      { id: 1, name: 'Rival', factionId: 'orc', team: 1, isAI: false, startSlot: 1 }
    ],
    objectives: [{ id: 'o1', type: 'survive', priority: 'primary', seconds: 5, title: 'Sobreviver' }],
    ...over
  };
}

/** GameManager headless de uma missão (definição embutida na config, como num save/replay autocontido). */
export function makeMissionGm(def, { seed = null } = {}) {
  const cfg = createMissionConfig(def, { inline: true, seed });
  cfg.headless = true;
  return new GameManager(new Terrain(getMap(cfg.mapId)), null, null, cfg);
}

export function runTicks(gm, n) {
  for (let i = 0; i < n && !gm.isGameOver; i++) gm.simStep(SIM_DT);
}

/** Registra os eventos (não-apresentação) de certos tipos emitidos pela sim. */
export function recordEvents(gm, types) {
  const log = [];
  for (const type of types) gm.events.on(type, (p) => log.push({ type, ...p }));
  return log;
}

export { EVT };

/** Teleporta uma unidade (mantém a grade espacial coerente). */
export function teleport(gm, unit, x, z) {
  unit.mesh.position.set(x, unit.mesh.position.y, z);
  gm.unitGrid.update(unit, x, z, unit.collisionRadius || 0);
}

export const statusOf = (gm, id) => gm.mission.objectives.get(id).status;
