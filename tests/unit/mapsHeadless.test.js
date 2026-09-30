import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { GameManager } from '../../src/core/GameManager.js';
import { Terrain } from '../../src/world/Terrain.js';
import { PLAYER_COLORS, validateMatchConfig } from '../../src/sim/MatchConfig.js';
import { getMap } from '../../src/data/maps/index.js';
import { SIM_DT } from '../../src/sim/constants.js';

/**
 * F2-05 — "Testes": partida FFA de 4 jogadores no novo mapa `ilhas-4p` (4 slots, 2 ilhas ligadas
 * por pontes), 2000 ticks headless, sem exceção e com as IAs crescendo (mais unidades no fim do
 * que no início). `createMatchConfig` só monta partidas de 2-3 jogadores (F2-01/F2-04); para 4
 * jogadores a MatchConfig é montada à mão e validada por `validateMatchConfig`.
 */
function ffaConfig(seed) {
  const cfg = {
    mapId: 'ilhas-4p',
    seed,
    difficulty: 'normal',
    headless: true,
    players: [
      { id: 0, name: 'Você', factionId: 'human', team: 0, color: PLAYER_COLORS[0], isAI: false, isLocal: true, startSlot: 0 },
      { id: 1, name: 'IA 1', factionId: 'orc', team: 1, color: PLAYER_COLORS[1], isAI: true, isLocal: false, startSlot: 1 },
      { id: 2, name: 'IA 2', factionId: 'human', team: 2, color: PLAYER_COLORS[2], isAI: true, isLocal: false, startSlot: 2 },
      { id: 3, name: 'IA 3', factionId: 'orc', team: 3, color: PLAYER_COLORS[3], isAI: true, isLocal: false, startSlot: 3 }
    ]
  };
  return validateMatchConfig(cfg);
}

describe('mapa ilhas-4p (F2-05, headless)', () => {
  it('aceita 4 jogadores (maxPlayers do mapa)', () => {
    const mapDef = getMap('ilhas-4p');
    expect(mapDef.maxPlayers).toBe(4);
    expect(mapDef.startSlots.length).toBe(4);
    expect(() => ffaConfig(7)).not.toThrow();
  });

  it('FFA de 4 jogadores roda 2000 ticks sem exceção e as IAs crescem', () => {
    const scene = new THREE.Scene();
    const terrain = new Terrain(scene, getMap('ilhas-4p'));
    const cfg = ffaConfig(7);
    const gm = new GameManager(scene, terrain, null, null, cfg);

    const initialUnits = gm.allUnits.length;
    expect(initialUnits).toBe(4 * 5 + 8); // 2 workers + 2 melee + 1 ranged por jogador (START_LAYOUT) + 8 bandidos (F3-10: 2 acampamentos × 4)

    expect(() => {
      for (let i = 0; i < 2000; i++) gm.simStep(SIM_DT);
    }).not.toThrow();

    // "IAs crescendo": mais unidades vivas no fim do que no início (novas tropas treinadas).
    const aliveAtEnd = gm.allUnits.filter((u) => !u.isDead).length;
    expect(aliveAtEnd).toBeGreaterThan(initialUnits);

    // Todos os 4 jogadores têm ao menos uma construção viva (a base inicial: HQ, serraria, casa).
    for (const p of gm.players) {
      const hasBuilding = gm.buildings.some((b) => b.ownerId === p.id);
      expect(hasBuilding).toBe(true);
    }
  }, 30000);
});
