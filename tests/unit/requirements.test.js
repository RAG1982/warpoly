import { describe, it, expect } from 'vitest';
import { missingRequirements, evalRequirements, formatRequirement } from '../../src/sim/requirements.js';

/**
 * requirements.test.js — F3-04: `missingRequirements` (módulo puro) e a validação em
 * `GameManager.placeBuilding` (Quartel exige Fazenda concluída / Quartel da Horda exige
 * Chiqueiro concluído — `BUILDINGS[type].requires`, `src/data/buildings.js`).
 */
describe('missingRequirements (puro)', () => {
  it('sem requires: sempre []', () => {
    expect(missingRequirements(0, 'cottage', { buildings: [] })).toEqual([]);
  });

  it('barracks sem Fazenda concluída: recusado', () => {
    const gm = { buildings: [] };
    expect(missingRequirements(0, 'barracks', gm)).toEqual(['farm']);
  });

  it('barracks com Fazenda em construção (não concluída): ainda recusado', () => {
    const gm = { buildings: [{ ownerId: 0, type: 'farm', isConstructed: false, isDead: false }] };
    expect(missingRequirements(0, 'barracks', gm)).toEqual(['farm']);
  });

  it('barracks com Fazenda concluída: aceito', () => {
    const gm = { buildings: [{ ownerId: 0, type: 'farm', isConstructed: true, isDead: false }] };
    expect(missingRequirements(0, 'barracks', gm)).toEqual([]);
  });

  it('Fazenda destruída não conta', () => {
    const gm = { buildings: [{ ownerId: 0, type: 'farm', isConstructed: true, isDead: true }] };
    expect(missingRequirements(0, 'barracks', gm)).toEqual(['farm']);
  });

  it('Fazenda de outro jogador não conta', () => {
    const gm = { buildings: [{ ownerId: 1, type: 'farm', isConstructed: true, isDead: false }] };
    expect(missingRequirements(0, 'barracks', gm)).toEqual(['farm']);
  });

  it('orc_barracks usa pig_farm (facção orc)', () => {
    const noFarm = { buildings: [{ ownerId: 0, type: 'farm', isConstructed: true, isDead: false }] };
    expect(missingRequirements(0, 'orc_barracks', noFarm)).toEqual(['pig_farm']);
    const withPigFarm = { buildings: [{ ownerId: 0, type: 'pig_farm', isConstructed: true, isDead: false }] };
    expect(missingRequirements(0, 'orc_barracks', withPigFarm)).toEqual([]);
  });
});

describe('evalRequirements com {hq:N} (F3-06, tipo fictício)', () => {
  it('sem Centro nenhum: {hq:2} falta', () => {
    const gm = { buildings: [] };
    expect(evalRequirements([{ hq: 2 }], 0, gm)).toEqual([{ hq: 2 }]);
  });

  it('Centro tier 1: {hq:2} ainda falta', () => {
    const gm = { buildings: [{ ownerId: 0, type: 'castle', isConstructed: true, isDead: false, tier: 1 }] };
    expect(evalRequirements([{ hq: 2 }], 0, gm)).toEqual([{ hq: 2 }]);
  });

  it('Centro tier 2: {hq:2} satisfeito', () => {
    const gm = { buildings: [{ ownerId: 0, type: 'castle', isConstructed: true, isDead: false, tier: 2 }] };
    expect(evalRequirements([{ hq: 2 }], 0, gm)).toEqual([]);
  });

  it('Centro tier 2 de outro jogador não conta', () => {
    const gm = { buildings: [{ ownerId: 1, type: 'castle', isConstructed: true, isDead: false, tier: 2 }] };
    expect(evalRequirements([{ hq: 2 }], 0, gm)).toEqual([{ hq: 2 }]);
  });

  it('mistura de tipo de construção + {hq:2}: só o que falta volta', () => {
    const gm = {
      buildings: [
        { ownerId: 0, type: 'farm', isConstructed: true, isDead: false },
        { ownerId: 0, type: 'castle', isConstructed: true, isDead: false, tier: 1 }
      ]
    };
    expect(evalRequirements(['farm', { hq: 2 }], 0, gm)).toEqual([{ hq: 2 }]);
  });

  it('formatRequirement: texto amigável para string e {hq:N}', () => {
    expect(formatRequirement('farm')).toBe('Fazenda de Trigo');
    expect(formatRequirement({ hq: 2 })).toBe('Centro nível 2');
  });

  it('missingRequirements (fachada de construção) aceita {hq:N} em `requires` sem quebrar', () => {
    // Tipo fictício com requires misto (construção real de teste F3-06, ver spec item 5).
    const gm = { buildings: [{ ownerId: 0, type: 'castle', isConstructed: true, isDead: false, tier: 1 }] };
    // getBuildingDef de um tipo inexistente cai no DEFAULT_BUILDING (requires ausente) → [].
    expect(missingRequirements(0, 'tipo_ficticio_inexistente', gm)).toEqual([]);
  });
});

describe('GameManager.placeBuilding valida requisitos (integração leve)', () => {
  it('recusa Quartel sem Fazenda concluída e não debita recursos', async () => {
    const THREE = await import('three');
    const { GameManager } = await import('../../src/core/GameManager.js');
    const { Terrain } = await import('../../src/world/Terrain.js');
    const { createMatchConfig } = await import('../../src/sim/MatchConfig.js');

    const scene = new THREE.Scene();
    const terrain = new Terrain(scene);
    const cfg = createMatchConfig({ seed: 3, headless: true });
    const gm = new GameManager(scene, terrain, null, null, cfg);

    const owner = gm.getPlayer(0);
    owner.resources.wood = 500;
    owner.resources.stone = 500;
    const before = { ...owner.resources };

    const pos = owner.startPos;
    const b = gm.placeBuilding('barracks', pos.x + 20, pos.z + 20, [], 0);

    expect(b).toBeNull();
    expect(owner.resources).toEqual(before);
  });

  it('aceita Quartel após Fazenda concluída', async () => {
    const THREE = await import('three');
    const { GameManager } = await import('../../src/core/GameManager.js');
    const { Terrain } = await import('../../src/world/Terrain.js');
    const { createMatchConfig } = await import('../../src/sim/MatchConfig.js');

    const scene = new THREE.Scene();
    const terrain = new Terrain(scene);
    const cfg = createMatchConfig({ seed: 3, headless: true });
    const gm = new GameManager(scene, terrain, null, null, cfg);

    const owner = gm.getPlayer(0);
    owner.resources.wood = 500;
    owner.resources.stone = 500;

    const pos = owner.startPos;
    const farm = gm.createBuilding('farm', pos.x + 10, pos.z + 10, true, 0);
    gm.buildings.push(farm); // mesma lista que `placeBuilding`/`missingRequirements` leem
    expect(farm.isConstructed).toBe(true);

    const b = gm.placeBuilding('barracks', pos.x + 20, pos.z + 20, [], 0);
    expect(b).not.toBeNull();
    expect(b.type).toBe('barracks');
  });
});
