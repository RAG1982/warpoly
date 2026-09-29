import { describe, it, expect } from 'vitest';
import { listMaps, getMap, DEFAULT_MAP_ID } from '../../src/data/maps/index.js';
import { getHeightForMap } from '../../src/world/terrainGenerators.js';

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

      it('todo recurso (gold/stone) fica em terra seca', () => {
        for (const r of mapDef.resources) {
          expect(['gold', 'stone']).toContain(r.type);
          const h = getHeightForMap(mapDef, r.x, r.z);
          expect(h, `recurso ${r.type} (${r.x}, ${r.z}) altura=${h}`).toBeGreaterThanOrEqual(DRY);
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
          expect(['oak', 'pine', 'autumn']).toContain(f.species);
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
