import { describe, it, expect } from 'vitest';
import { Terrain } from '../../src/sim/Terrain.js';
import { Pathfinder } from '../../src/sim/Pathfinder.js';
import { encodeLavaGrid, decodeLavaGrid, isLavaAt } from '../../src/data/maps/lava.js';
import { encodeHeights, paintedNodes } from '../../src/data/maps/painted.js';
import { validateMapDef } from '../../src/data/maps/validate.js';
import { generateIrregularCoast, bakeToMapDef } from '../../tools/lib/irregularCoast.mjs';

describe('Lava: dados e codificação (MUNDO-TERRENO-MAPAS §3.5)', () => {
  it('encodeLavaGrid e decodeLavaGrid preservam os bytes exatamente', () => {
    const orig = new Uint8Array([0, 1, 1, 0, 1, 0, 0, 1]);
    const b64 = encodeLavaGrid(orig);
    const dec = decodeLavaGrid(b64);
    expect(dec).toEqual(orig);
  });

  it('isLavaAt consulta corretamente as coordenadas do mapa', () => {
    const size = 64;
    const cell = 1;
    const nodes = paintedNodes(size, cell); // 65
    const data = new Uint8Array(nodes * nodes);
    // marca nó central (x=0, z=0) -> i=32, j=32
    const mid = 32;
    data[mid * nodes + mid] = 1;

    const mapDef = {
      size,
      lavaGrid: { cell, nodes, data: encodeLavaGrid(data) }
    };

    expect(isLavaAt(mapDef, 0, 0)).toBe(true);
    expect(isLavaAt(mapDef, 10, 10)).toBe(false);
  });
});

describe('Lava: Terrain e regras de caminhabilidade / água', () => {
  function makeLavaMapDef() {
    const size = 64;
    const cell = 1;
    const nodes = paintedNodes(size, cell);
    const h = new Int8Array(nodes * nodes);
    // terra plana a 2.5
    h.fill(25);
    const lava = new Uint8Array(nodes * nodes);
    // linha de lava em z = 0 (j = 32) de x = -20 a +20
    const jMid = 32;
    for (let i = 12; i <= 52; i++) {
      lava[jMid * nodes + i] = 1;
      h[jMid * nodes + i] = 4; // 0.4 h
    }
    // passagem de rocha resfriada no centro (x = 0, i = 32)
    lava[jMid * nodes + 32] = 0;
    h[jMid * nodes + 32] = 25; // 2.5 h

    return {
      id: 'test-lava-map',
      name: 'Mapa Teste Lava',
      size,
      playable: 60,
      waterLevel: 0.5,
      tileset: 'vulcanico',
      terrain: { generator: 'painted', params: { cell, nodes, data: encodeHeights(h) } },
      lavaGrid: { cell, nodes, data: encodeLavaGrid(lava) },
      startSlots: [{ x: 0, z: -15 }, { x: 0, z: 15 }],
      resources: [
        { type: 'gold', x: 5, z: -15, amount: 10000 },
        { type: 'gold', x: 5, z: 15, amount: 10000 }
      ],
      forests: [
        { species: 'oak', x: -5, z: -15, count: 10, radius: 4 },
        { species: 'oak', x: -5, z: 15, count: 10, radius: 4 }
      ],
      fords: []
    };
  }

  it('Terrain.isLava identifica a célula de lava e a passagem de rocha', () => {
    const mapDef = makeLavaMapDef();
    const terrain = new Terrain(mapDef);

    expect(terrain.isLava(10, 0)).toBe(true);
    expect(terrain.isLava(0, 0)).toBe(false); // passagem de rocha
    expect(terrain.isLava(0, 10)).toBe(false); // terra comum
  });

  it('Terrain.isWater é falso na lava (lava NÃO é água navegável)', () => {
    const mapDef = makeLavaMapDef();
    const terrain = new Terrain(mapDef);

    expect(terrain.isLava(10, 0)).toBe(true);
    expect(terrain.isWater(10, 0)).toBe(false);
  });

  it('Terrain.isWalkable é falso na lava e verdadeiro na passagem e na terra', () => {
    const mapDef = makeLavaMapDef();
    const terrain = new Terrain(mapDef);

    expect(terrain.isWalkable(10, 0)).toBe(false); // lava bloqueia
    expect(terrain.isWalkable(0, 0)).toBe(true);  // passagem de rocha
    expect(terrain.isWalkable(0, 10)).toBe(true); // terra comum
  });
});

describe('Lava: Pathfinder e bloqueio estático', () => {
  function makeLavaMapDef() {
    const size = 64;
    const cell = 1;
    const nodes = paintedNodes(size, cell);
    const h = new Int8Array(nodes * nodes);
    h.fill(25);
    const lava = new Uint8Array(nodes * nodes);
    // Rio de lava em z = 0 cortando de lado a lado
    const jMid = 32;
    for (let i = 0; i < nodes; i++) {
      lava[jMid * nodes + i] = 1;
      h[jMid * nodes + i] = 4;
    }
    // Deixa uma passagem de rocha em x = 0 (i = 32)
    lava[jMid * nodes + 32] = 0;
    h[jMid * nodes + 32] = 25;

    return {
      id: 'test-pathfinder-lava',
      name: 'Mapa Pathfinder Lava',
      size,
      playable: 60,
      waterLevel: 0.5,
      tileset: 'vulcanico',
      terrain: { generator: 'painted', params: { cell, nodes, data: encodeHeights(h) } },
      lavaGrid: { cell, nodes, data: encodeLavaGrid(lava) }
    };
  }

  it('Pathfinder terrestre e naval bloqueia células de lava na staticGrid', () => {
    const mapDef = makeLavaMapDef();
    const terrain = new Terrain(mapDef);
    const landPf = new Pathfinder(terrain, 28, 1.5, 'land');
    const navalPf = new Pathfinder(terrain, 28, 1.5, 'naval');

    // Célula na lava (x=10, z=0)
    const gLava = landPf.toGrid(10, 0);
    expect(landPf.staticGrid[gLava.r * landPf.cols + gLava.c]).toBe(0);
    expect(navalPf.staticGrid[gLava.r * navalPf.cols + gLava.c]).toBe(0);

    // Célula na passagem (x=0, z=0)
    const gPass = landPf.toGrid(0, 0);
    expect(landPf.staticGrid[gPass.r * landPf.cols + gPass.c]).toBe(1);
  });

  it('A* encontra caminho através da passagem de rocha e desvia da lava', () => {
    const mapDef = makeLavaMapDef();
    const terrain = new Terrain(mapDef);
    const landPf = new Pathfinder(terrain, 28, 1.5, 'land');

    // Origem em z = -10, destino em z = +10
    const path = landPf.findPath({ x: 0, z: -10 }, { x: 0, z: 10 });
    expect(path).not.toBeNull();
    expect(path.length).toBeGreaterThan(0);

    // Nenhum ponto do caminho deve cruzar lava
    for (const pt of path) {
      expect(terrain.isLava(pt.x, pt.z)).toBe(false);
    }
  });
});

describe('Lava: Validação de mapa (validateMapDef)', () => {
  it('detecta se startSlot ou recurso cair diretamente sobre a lava', () => {
    const size = 64;
    const cell = 1;
    const nodes = paintedNodes(size, cell);
    const h = new Int8Array(nodes * nodes);
    h.fill(25);
    const lava = new Uint8Array(nodes * nodes);
    // lava exatamente em (x = 0, z = -15)
    const jSlot = 32 - 15;
    const iSlot = 32;
    lava[jSlot * nodes + iSlot] = 1;

    const invalidMap = {
      id: 'invalid-lava-map',
      name: 'Mapa Inválido Lava',
      size,
      playable: 60,
      waterLevel: 0.5,
      tileset: 'vulcanico',
      terrain: { generator: 'painted', params: { cell, nodes, data: encodeHeights(h) } },
      lavaGrid: { cell, nodes, data: encodeLavaGrid(lava) },
      startSlots: [{ x: 0, z: -15 }, { x: 0, z: 15 }], // slot 1 sobre a lava!
      resources: [
        { type: 'gold', x: 5, z: -15, amount: 10000 },
        { type: 'gold', x: 5, z: 15, amount: 10000 }
      ],
      forests: [
        { species: 'oak', x: -10, z: -15, count: 12, radius: 5 },
        { species: 'oak', x: -10, z: 15, count: 12, radius: 5 }
      ],
      fords: []
    };

    const res = validateMapDef(invalidMap, { checkId: false, connectivity: false });
    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => e.code === 'slotLava')).toBe(true);
  });
});

describe('Lava: Integração com bakeToMapDef (irregularCoast)', () => {
  it('bakeToMapDef gera mapa com lavaGrid e altura compatível', () => {
    const coast = generateIrregularCoast({ seed: 1 });
    expect(coast.lava).toBeDefined();

    const mapDef = bakeToMapDef(coast, {
      id: 'bake-test-lava',
      name: 'Bake Test Lava',
      playable: 90
    });

    expect(mapDef.terrain.generator).toBe('painted');
    expect(mapDef.lavaGrid).toBeDefined();
    expect(mapDef.lavaGrid.data).toBeDefined();

    const terrain = new Terrain(mapDef);
    // Verifica se há alguma célula de lava no mapa
    let lavaFound = 0;
    const half = mapDef.size / 2;
    for (let x = -half; x < half; x += 3) {
      for (let z = -half; z < half; z += 3) {
        if (terrain.isLava(x, z)) lavaFound++;
      }
    }
    expect(lavaFound).toBeGreaterThan(0);
  });
});
