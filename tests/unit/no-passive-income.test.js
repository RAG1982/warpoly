import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { GameManager } from '../../src/core/GameManager.js';
import { Terrain } from '../../src/world/Terrain.js';
import { createMatchConfig } from '../../src/sim/MatchConfig.js';
import { SIM_DT } from '../../src/sim/constants.js';
import { BUILDINGS } from '../../src/data/index.js';

/**
 * no-passive-income.test.js — F3-04: Fazenda/Chiqueiro não geram mais ouro sozinhos
 * (`passiveIncome: null`); `Building.simUpdate` mantém o bloco de produção passiva como
 * código morto (guardado por `passive &&`), mas nunca executa para nenhuma construção.
 */
describe('sem ouro passivo (F3-04)', () => {
  it('farm e pig_farm têm passiveIncome: null no schema', () => {
    expect(BUILDINGS.farm.passiveIncome).toBeNull();
    expect(BUILDINGS.pig_farm.passiveIncome).toBeNull();
  });

  it('Fazenda pronta por 60s simulados: ouro do jogador não muda (sem trabalhador coletando)', () => {
    const scene = new THREE.Scene();
    const terrain = new Terrain(scene);
    const cfg = createMatchConfig({ seed: 5, headless: true });
    const gm = new GameManager(scene, terrain, null, null, cfg);

    const owner = gm.getPlayer(0);
    const pos = owner.startPos;
    const farm = gm.createBuilding('farm', pos.x + 10, pos.z + 10, true, 0);
    gm.buildings.push(farm);
    const goldBefore = owner.resources.gold;

    const ticks = Math.round(60 / SIM_DT);
    for (let i = 0; i < ticks; i++) {
      farm.simUpdate(SIM_DT, gm, gm.arrows, gm.allUnits, gm.allUnits);
    }

    expect(owner.resources.gold).toBe(goldBefore);
  });

  it('nenhuma construção do catálogo ainda declara passiveIncome', () => {
    Object.values(BUILDINGS).forEach(b => {
      expect(b.passiveIncome).toBeNull();
    });
  });
});
