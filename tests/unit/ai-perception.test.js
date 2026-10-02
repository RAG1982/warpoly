import { describe, it, expect } from 'vitest';
import { getMap } from '../../src/data/maps/index.js';
import { makeGm, run, place } from './helpers/aiWorld.js';

/** F5-02 — percepção sob a névoa: memória, fantasmas, scout, Brutal onisciente. */

describe('F5-02: percepção sob a névoa', () => {
  it('só conhece o Centro inimigo depois de uma unidade vê-lo; a memória persiste; o fantasma some ao rever', () => {
    const gm = makeGm({ difficulties: ['normal', 'normal'] });
    const d0 = gm.aiDirectors[0];
    const hq1 = gm.buildings.find(b => b.ownerId === 1 && b.role === 'hq');
    const tick = () => { gm.currentTick++; d0.perception.update(); };
    d0.perception.update();
    expect(d0.perception.buildings.has(hq1.id)).toBe(false);
    expect(d0.perception.hasIntel()).toBe(false);

    const scout = gm.getUnitsOf(0).find(u => u.type === d0.meleeType);
    const hp = hq1.mesh.position;
    place(gm, scout, hp.x + 6, hp.z + 6);
    tick();
    expect(d0.perception.buildings.has(hq1.id)).toBe(true);
    expect(d0.perception.visibleBuildings).toContain(hq1);

    place(gm, scout, 0, 0); // sai da visão
    tick();
    expect(d0.perception.visibleBuildings).not.toContain(hq1);
    expect(d0.perception.buildings.has(hq1.id)).toBe(true); // memória

    hq1.isDead = true; // destruída fora da visão: o fantasma fica
    tick();
    expect(d0.perception.buildings.has(hq1.id)).toBe(true);
    place(gm, scout, hp.x + 6, hp.z + 6);
    tick();
    expect(d0.perception.buildings.has(hq1.id)).toBe(false); // revista sem a construção
    hq1.isDead = false;
    gm.dispose();
  });

  it('o alvo da expedição vem só da memória; sem memória a IA marcha ao slot inimigo', () => {
    const gm = makeGm({ difficulties: ['normal', 'normal'] });
    const d0 = gm.aiDirectors[0];
    d0.perception.update();
    expect(d0.militaryManager.selectExpeditionTarget()).toBeNull();
    const slot = d0.perception.marchTarget();
    expect(slot).not.toBeNull();
    const slots = getMap(gm.matchConfig.mapId).startSlots;
    expect(slots.some(s => Math.hypot(s.x - slot.x, s.z - slot.z) < 1)).toBe(true);
    expect(Math.hypot(slot.x - d0.baseCenter.x, slot.z - d0.baseCenter.y)).toBeGreaterThan(20); // nunca a própria base
    gm.dispose();
  });

  it('Brutal enxerga tudo desde o início', () => {
    const gm = makeGm({ difficulties: ['brutal', 'normal'] });
    const d0 = gm.aiDirectors[0];
    d0.perception.update();
    const hq1 = gm.buildings.find(b => b.ownerId === 1 && b.role === 'hq');
    expect(d0.perception.buildings.has(hq1.id)).toBe(true);
    gm.dispose();
  });

  it('o explorador (scout) é reservado e sai explorando; some quando a base inimiga é conhecida', () => {
    const gm = makeGm({ difficulties: ['normal', 'normal'] });
    const d0 = gm.aiDirectors[0];
    run(gm, 20 * 40);
    expect(d0.perception.scoutId).not.toBeNull();
    expect(d0.isReserved(d0.perception.scoutId)).toBe(true);
    expect(d0.perception.exploredCount).toBeGreaterThan(0);
    gm.dispose();
  });
});

