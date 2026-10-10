import { describe, it, expect } from 'vitest';
import { listMaps, getMap, DEFAULT_MAP_ID } from '../../src/data/maps/index.js';
import { getHeightForMap } from '../../src/world/terrainGenerators.js';
import { NAVAL_MAX_HEIGHT } from '../../src/data/combat.js';
import { FOREST_SPECIES } from '../../src/data/maps/validate.js';

const DRY = 1.8; // mesmo limiar de "terra seca" usado por GameManager.canPlaceBuilding

describe('mapas (src/data/maps/*.json)', () => {
  it('DEFAULT_MAP_ID aponta para um mapa registrado', () => {
    expect(getMap(DEFAULT_MAP_ID)).toBeTruthy();
  });

  it('listMaps devolve pelo menos os 2 mapas da F2-05', () => {
    const ids = listMaps().map((m) => m.id);
    expect(ids).toContain('continental-1v1');
    expect(ids).toContain('ilhas-4p');
  });

  it('NEW-43: ilhas-4p tem madeira suficiente (>= 8 árvores planejadas por jogador; antes só 12 nasciam e a economia travava)', () => {
    const planned = getMap('ilhas-4p').forests.reduce((n, f) => n + f.count, 0);
    expect(planned).toBeGreaterThanOrEqual(8 * getMap('ilhas-4p').maxPlayers);
  });

  it('NEW-45: estreito-1v1 tem madeira suficiente e nenhum bosque colado nos pátios das bases (raio 26 rejeita as árvores)', () => {
    const m = getMap('estreito-1v1');
    expect(m.forests.reduce((n, f) => n + f.count, 0)).toBeGreaterThanOrEqual(60);
    const slots = [{ x: -34, z: -16 }, { x: 34, z: 16 }];
    for (const f of m.forests) {
      for (const s of slots) expect(Math.hypot(f.x - s.x, f.z - s.z)).toBeGreaterThan(26);
    }
  });

  it('NEW-46: continental-1v1 tem bosques alcançáveis (centro + raio dentro da área jogável; árvores na costa eram inalcançáveis e esgotavam a madeira)', () => {
    const m = getMap('continental-1v1');
    const half = m.playable / 2;
    for (const f of m.forests) expect(Math.max(Math.abs(f.x), Math.abs(f.z)) + f.radius).toBeLessThanOrEqual(half - 1);
    expect(m.forests.reduce((n, f) => n + f.count, 0)).toBeGreaterThanOrEqual(8 * m.maxPlayers);
  });

  it('F4-07a: estreito-1v1 está registrado e tem 2 poços de petróleo; ilhas-4p ganhou 1 por margem', () => {
    expect(listMaps().map((m) => m.id)).toContain('estreito-1v1');
    const oil = (id) => getMap(id).resources.filter((r) => r.type === 'oil');
    expect(oil('estreito-1v1').length).toBe(2);
    expect(oil('ilhas-4p').length).toBe(2);
    expect(getMap('estreito-1v1')).toMatchObject({ size: 140, maxPlayers: 2 });
    expect(getMap('estreito-1v1').terrain.generator).toBe('islands');
  });

  for (const mapDef of listMaps()) {
    describe(`${mapDef.id} ("${mapDef.name}")`, () => {
      it('tem os campos obrigatórios do formato', () => {
        expect(typeof mapDef.id).toBe('string');
        expect(typeof mapDef.name).toBe('string');
        expect(mapDef.size).toBeGreaterThan(0);
        expect(mapDef.playable).toBeGreaterThan(0);
        expect(mapDef.playable).toBeLessThanOrEqual(mapDef.size);
        expect(typeof mapDef.waterLevel).toBe('number');
        expect(mapDef.maxPlayers).toBeGreaterThanOrEqual(2);
        expect(mapDef.terrain?.generator).toBeTruthy();
        expect(Array.isArray(mapDef.fords)).toBe(true);
        expect(Array.isArray(mapDef.startSlots)).toBe(true);
        expect(Array.isArray(mapDef.resources)).toBe(true);
        expect(Array.isArray(mapDef.forests)).toBe(true);
      });

      it('maxPlayers é compatível com o número de startSlots', () => {
        expect(mapDef.maxPlayers).toBeLessThanOrEqual(mapDef.startSlots.length);
      });

      it('todo startSlot fica dentro da área jogável e em terra seca', () => {
        const half = mapDef.playable / 2;
        for (const slot of mapDef.startSlots) {
          expect(Math.abs(slot.x)).toBeLessThan(half);
          expect(Math.abs(slot.z)).toBeLessThan(half);
          const h = getHeightForMap(mapDef, slot.x, slot.z);
          expect(h, `slot (${slot.x}, ${slot.z}) altura=${h}`).toBeGreaterThanOrEqual(DRY);
        }
      });

      it('todo recurso (gold/stone) fica em terra seca e todo poço (oil) em água navegável (F4-07a)', () => {
        const half = mapDef.playable / 2;
        for (const r of mapDef.resources) {
          expect(['gold', 'stone', 'oil']).toContain(r.type);
          const h = getHeightForMap(mapDef, r.x, r.z);
          if (r.type === 'oil') {
            expect(h, `poço (${r.x}, ${r.z}) altura=${h}`).toBeLessThan(mapDef.waterLevel);
            expect(h, `poço (${r.x}, ${r.z}) precisa de profundidade navegável`).toBeLessThanOrEqual(NAVAL_MAX_HEIGHT);
            expect(Math.abs(r.x)).toBeLessThan(half);
            expect(Math.abs(r.z)).toBeLessThan(half);
            if (r.amount !== undefined) expect(r.amount).toBeGreaterThan(0);
          } else {
            expect(h, `recurso ${r.type} (${r.x}, ${r.z}) altura=${h}`).toBeGreaterThanOrEqual(DRY);
          }
        }
      });

      it('recursos com "slot" referenciam um startSlot existente', () => {
        for (const r of mapDef.resources) {
          if (r.slot === undefined) continue;
          expect(mapDef.startSlots[r.slot]).toBeTruthy();
        }
      });

      it('todo cluster de floresta (forests) tem terra seca disponível dentro do raio', () => {
        // O centro do cluster pode cair no rio (ex.: "Central Wilderness & Riverbanks", de
        // propósito perto da água) — GameManager.spawnWoodlands já evita a água ao espalhar as
        // árvores num anel em volta do centro; aqui só confirmamos que existe terra seca
        // alcançável nesse anel (senão o cluster nunca conseguiria plantar nenhuma árvore).
        for (const f of mapDef.forests) {
          expect(f.count).toBeGreaterThan(0);
          expect(f.radius).toBeGreaterThan(0);
          expect(FOREST_SPECIES).toContain(f.species);
          let foundDry = false;
          for (let i = 0; i < 16 && !foundDry; i++) {
            const ang = (i / 16) * Math.PI * 2;
            const x = f.x + Math.cos(ang) * f.radius * 0.6;
            const z = f.z + Math.sin(ang) * f.radius * 0.6;
            if (getHeightForMap(mapDef, x, z) >= DRY) foundDry = true;
          }
          expect(foundDry, `floresta (${f.x}, ${f.z}) raio=${f.radius}: nenhum ponto seco no anel`).toBe(true);
        }
      });

      it('todo vau (fords) fica sobre terra seca', () => {
        for (const ford of mapDef.fords) {
          const h = getHeightForMap(mapDef, ford.x, ford.z);
          expect(h, `vau (${ford.x}, ${ford.z}) altura=${h}`).toBeGreaterThanOrEqual(DRY);
        }
      });
    });
  }
});
