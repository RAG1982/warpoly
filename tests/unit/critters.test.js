import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import '../../src/ai/registerAI.js';
import { Critter, CRITTER_HP, CRITTER_SPECIES } from '../../src/sim/Critter.js';
import {
  CRITTER_SPECIES as DATA_CRITTER_SPECIES,
  CRITTER_SPECIES_LIST,
  VALID_CRITTER_SPECIES,
  normalizeCritterSpecies,
  getCritterForBiome
} from '../../src/data/critters.js';
import { getMap, registerMap, unregisterMap } from '../../src/data/maps/index.js';
import { createMatchConfig, validateNeutrals, CRITTER_SPECIES as MATCH_CRITTER_SPECIES } from '../../src/sim/MatchConfig.js';
import { validateNeutrals as dataValidateNeutrals } from '../../src/data/matchConfig.js';
import { GameManager } from '../../src/sim/GameManager.js';
import { Terrain } from '../../src/sim/Terrain.js';
import { NEUTRAL_OWNER_ID } from '../../src/sim/EntityIds.js';
import { EVT } from '../../src/sim/events.js';
import { BUILDINGS } from '../../src/data/buildings.js';
import { buildingName, critterName, setLanguage, getLanguage, t } from '../../src/i18n/index.js';

function makeMockGm() {
  const terrain = {
    getHeight: () => 1.0
  };
  const pathfinder = {
    isWater: () => false
  };
  const entitiesById = new Map();
  const critters = [];
  return {
    terrain,
    pathfinder,
    fogOfWar: null,
    entitiesById,
    critters,
    registerEntity(e, ownerId) {
      e.id = entitiesById.size + 1;
      e.ownerId = ownerId;
      entitiesById.set(e.id, e);
    }
  };
}

let mapSeq = 0;
function makeRealGm(neutrals = [], seed = 42) {
  const baseMap = getMap('continental-1v1');
  const mapId = `test-critters-map-${mapSeq++}`;
  const mapDef = {
    ...baseMap,
    id: mapId,
    neutrals
  };
  registerMap(mapDef);
  const cfg = createMatchConfig({ seed, headless: true, mapId });
  const terrain = new Terrain(mapDef);
  const gm = new GameManager(terrain, null, null, cfg);
  unregisterMap(mapId);
  return gm;
}

describe('Tabela CRITTER_SPECIES e biomas (MUNDO-TERRENO-MAPAS §5)', () => {
  it('registra tabela CRITTER_SPECIES em src/sim/Critter.js e src/data/critters.js', () => {
    expect(CRITTER_SPECIES).toBeDefined();
    expect(DATA_CRITTER_SPECIES).toBeDefined();
    expect(CRITTER_SPECIES.sheep).toBeDefined();
    expect(CRITTER_SPECIES.boar).toBeDefined();
    expect(CRITTER_SPECIES.pig).toBeDefined();
  });

  it('mapeia sheep para biomas exuberante/temperado e boar para deserto/savana/pântano', () => {
    const sheepBiomes = CRITTER_SPECIES.sheep.biomes;
    const boarBiomes = CRITTER_SPECIES.boar.biomes;

    expect(sheepBiomes).toEqual(expect.arrayContaining(['lush', 'temperate']));
    expect(boarBiomes).toEqual(expect.arrayContaining(['desert', 'savanna', 'swamp']));
  });

  it('getCritterForBiome resolve espécies corretamente com fallback seguro', () => {
    expect(getCritterForBiome('lush')).toBe('sheep');
    expect(getCritterForBiome('temperate')).toBe('sheep');
    expect(getCritterForBiome('exuberante')).toBe('sheep');
    expect(getCritterForBiome('desert')).toBe('boar');
    expect(getCritterForBiome('deserto')).toBe('boar');
    expect(getCritterForBiome('savanna')).toBe('boar');
    expect(getCritterForBiome('swamp')).toBe('boar');
    expect(getCritterForBiome('pantano')).toBe('boar');
    expect(getCritterForBiome('unknown_biome')).toBe('sheep');
  });

  it('exporta listas de espécies ativas e válidas', () => {
    expect(CRITTER_SPECIES_LIST).toEqual(['sheep', 'boar']);
    expect(VALID_CRITTER_SPECIES).toEqual(['sheep', 'boar', 'pig']);
  });
});

describe('Compatibilidade de alias pig -> boar e suporte nativo a boar', () => {
  it('normalizeCritterSpecies mapeia pig e boar para boar, e outros para sheep', () => {
    expect(normalizeCritterSpecies('pig')).toBe('boar');
    expect(normalizeCritterSpecies('boar')).toBe('boar');
    expect(normalizeCritterSpecies('sheep')).toBe('sheep');
    expect(normalizeCritterSpecies(undefined)).toBe('sheep');
  });

  it('instanciação com boar cria animal nativo com name Javali e type critter_boar', () => {
    const gm = makeMockGm();
    const rng = { next: () => 0.5 };
    const c = new Critter(gm, 'boar', 10, 10, rng, 5);

    expect(c.species).toBe('boar');
    expect(c.type).toBe('critter_boar');
    expect(c.name).toBe('Javali');
    expect(c.hp).toBe(CRITTER_HP);
  });

  it('instanciação com pig converte de forma retrocompatível para boar', () => {
    const gm = makeMockGm();
    const rng = { next: () => 0.5 };
    const c = new Critter(gm, 'pig', 10, 10, rng, 5);

    expect(c.species).toBe('boar');
    expect(c.type).toBe('critter_boar');
    expect(c.name).toBe('Javali');
    expect(c.hp).toBe(CRITTER_HP);
  });

  it('instanciação com sheep preserva ovelha', () => {
    const gm = makeMockGm();
    const rng = { next: () => 0.5 };
    const c = new Critter(gm, 'sheep', 5, 5, rng, 5);

    expect(c.species).toBe('sheep');
    expect(c.type).toBe('critter_sheep');
    expect(c.name).toBe('Ovelha');
  });
});

describe('Validação em validateNeutrals (MatchConfig.js & data/matchConfig.js)', () => {
  const baseMap = {
    id: 'test-map',
    size: 64,
    playable: 56,
    neutrals: []
  };

  it('aceita boar ao lado de sheep e pig', () => {
    const mapWithBoar = {
      ...baseMap,
      neutrals: [
        { kind: 'critters', species: 'boar', x: 0, z: 0, count: 4, radius: 5 },
        { kind: 'critters', species: 'sheep', x: 10, z: 10, count: 4, radius: 5 },
        { kind: 'critters', species: 'pig', x: -10, z: -10, count: 4, radius: 5 }
      ]
    };
    expect(() => validateNeutrals(mapWithBoar)).not.toThrow();
    expect(() => dataValidateNeutrals(mapWithBoar)).not.toThrow();
  });

  it('MATCH_CRITTER_SPECIES contém sheep, boar e pig', () => {
    expect(MATCH_CRITTER_SPECIES).toContain('sheep');
    expect(MATCH_CRITTER_SPECIES).toContain('boar');
    expect(MATCH_CRITTER_SPECIES).toContain('pig');
  });

  it('rejeita espécies não cadastradas', () => {
    const invalidMap = {
      ...baseMap,
      neutrals: [
        { kind: 'critters', species: 'lobo', x: 0, z: 0, count: 2, radius: 5 }
      ]
    };
    expect(() => validateNeutrals(invalidMap)).toThrow(/espécie/);
  });

  it('rejeita quantidade de critters acima do limite (40)', () => {
    const overLimitMap = {
      ...baseMap,
      neutrals: [
        { kind: 'critters', species: 'boar', x: 0, z: 0, count: 41, radius: 5 }
      ]
    };
    expect(() => validateNeutrals(overLimitMap)).toThrow(/count/);
  });
});

describe('Spawn de critters na partida e determinismo', () => {
  it('GameManager spawns boar e pig (como boar) registrando em gm.critters', () => {
    const neutrals = [
      { kind: 'critters', species: 'boar', x: 5, z: 5, count: 3, radius: 4 },
      { kind: 'critters', species: 'pig', x: -5, z: -5, count: 2, radius: 4 }
    ];
    const gm = makeRealGm(neutrals, 123);

    expect(gm.critters.length).toBe(5);
    for (const c of gm.critters) {
      expect(c.species).toBe('boar');
      expect(c.type).toBe('critter_boar');
      expect(c.name).toBe('Javali');
      expect(c.ownerId).toBe(NEUTRAL_OWNER_ID);
      expect(gm.entitiesById.get(c.id)).toBe(c);
      // Critters não pertencem às listas regulares de unidades dos jogadores
      expect(gm.allUnits.includes(c)).toBe(false);
      expect(gm.getUnitsOf(0).includes(c)).toBe(false);
      expect(gm.getUnitsOf(1).includes(c)).toBe(false);
    }
  });

  it('duas simulações com mesma semente produzem trajetória idêntica de critters (determinismo)', () => {
    const neutrals = [
      { kind: 'critters', species: 'boar', x: 2, z: 2, count: 2, radius: 5 },
      { kind: 'critters', species: 'sheep', x: -2, z: -2, count: 2, radius: 5 }
    ];
    const gm1 = makeRealGm(neutrals, 777);
    const gm2 = makeRealGm(neutrals, 777);

    for (let tick = 0; tick < 100; tick++) {
      gm1.simStep(0.05);
      gm2.simStep(0.05);
    }

    expect(gm1.critters.length).toBe(gm2.critters.length);
    for (let i = 0; i < gm1.critters.length; i++) {
      const c1 = gm1.critters[i];
      const c2 = gm2.critters[i];
      expect(c1.position.x).toBeCloseTo(c2.position.x, 8);
      expect(c1.position.z).toBeCloseTo(c2.position.z, 8);
      expect(c1.state).toBe(c2.state);
      expect(c1.stepTimer).toBeCloseTo(c2.stepTimer, 8);
    }
  });

  it('comportamento de fuga ao tomar dano e morte após CARCASS_TIME', () => {
    const neutrals = [
      { kind: 'critters', species: 'boar', x: 0, z: 0, count: 1, radius: 4 }
    ];
    const gm = makeRealGm(neutrals, 999);
    const boar = gm.critters[0];
    const attacker = { mesh: { position: new THREE.Vector3(5, 0, 0) }, ownerId: 0 };

    const diedEvents = [];
    gm.events.on(EVT.UNIT_DIED, (e) => diedEvents.push(e));

    boar.takeDamage(2, attacker);
    expect(boar.state).toBe('fleeing');
    expect(boar.hp).toBe(CRITTER_HP - 2);

    boar.takeDamage(100, attacker);
    expect(boar.isDead).toBe(true);
    expect(boar.state).toBe('dead');

    // Avança simulação para expirar tempo de carcaça (3s = 60 ticks a 0.05s)
    for (let i = 0; i < 70; i++) {
      gm.simStep(0.05);
    }

    expect(gm.critters.includes(boar)).toBe(false);
    expect(gm.entitiesById.has(boar.id)).toBe(false);
    expect(diedEvents.length).toBe(0);
  });
});

describe('Construção pig_farm e Internacionalização', () => {
  it('preserva ID pig_farm intacto em BUILDINGS e define facção orc', () => {
    expect(BUILDINGS.pig_farm).toBeDefined();
    expect(BUILDINGS.pig_farm.type).toBe('pig_farm');
    expect(BUILDINGS.pig_farm.faction).toBe('orc');
  });

  it('exibe Cercado de Javalis na facção Orc em pt-BR', () => {
    const prevLang = getLanguage();
    try {
      setLanguage('pt-BR');
      expect(buildingName('pig_farm', BUILDINGS.pig_farm)).toBe('Cercado de Javalis');
      expect(critterName('boar')).toBe('Javali');
      expect(critterName('sheep')).toBe('Ovelha');
      expect(t('building.pig_farm.name_orc')).toBe('Cercado de Javalis');
      expect(t('editor.species.boar')).toBe('Javalis');
    } finally {
      setLanguage(prevLang);
    }
  });

  it('exibe Boar Pen na facção Orc em en sem termos Blizzard', () => {
    const prevLang = getLanguage();
    try {
      setLanguage('en');
      expect(buildingName('pig_farm', BUILDINGS.pig_farm)).toBe('Boar Pen');
      expect(critterName('boar')).toBe('Wild Boar');
      expect(critterName('sheep')).toBe('Sheep');
      expect(t('building.pig_farm.name_orc')).toBe('Boar Pen');
      expect(t('editor.species.boar')).toBe('Wild Boars');
    } finally {
      setLanguage(prevLang);
    }
  });
});
