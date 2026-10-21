import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { getRegionMap } from '../../src/data/biomeRegions.js';
import { planProps, propKeysOfMap, PROP_KEYS } from '../../src/data/decorPlan.js';
import { PROP_RULES, propCountFor } from '../../src/data/biomeStyles.js';
import { buildLavaInfo } from '../../src/data/lavaRender.js';
import { GLB_MODELS } from '../../src/entities/glbModels.js';
import { Terrain } from '../../src/sim/Terrain.js';
import { makeRegionalMap } from './helpers/regionalMap.js';

describe('props .glb por bioma (PROP_RULES / planProps)', () => {
  const map = makeRegionalMap({ id: 'fixture-props' });
  const rm = getRegionMap(map);
  const terrain = new Terrain(map);
  const lava = buildLavaInfo(map);
  const run = () => planProps({ regions: rm, getHeight: (x, z) => terrain.getHeight(x, z), mapDef: map, lava, waterLevel: 0.5 });
  const plan = run();

  it('cada regra aponta para um .glb lazy registrado que existe em public/models', () => {
    for (const key of PROP_KEYS) {
      expect(GLB_MODELS[key], `${key} em GLB_MODELS`).toBeTruthy();
      expect(GLB_MODELS[key].lazy, `${key} é lazy`).toBe(true);
      expect(existsSync(resolve('public/models', `${key}.glb`)), `${key}.glb`).toBe(true);
    }
  });

  it('é determinístico e só devolve chaves de PROP_RULES com instâncias', () => {
    expect(run()).toEqual(plan);
    for (const key of Object.keys(plan)) {
      expect(PROP_KEYS).toContain(key);
      expect(plan[key].length).toBeGreaterThan(0);
      expect(plan[key].length).toBeLessThanOrEqual(propCountFor(key, map.size));
    }
  });

  it('cada instância fica no bioma permitido, na faixa de altura, longe de lava/bases/jazidas e espaçada', () => {
    for (const [key, items] of Object.entries(plan)) {
      const rule = PROP_RULES[key];
      for (const it of items) {
        const h = terrain.getHeight(it.x, it.z);
        if (rule.water) {
          expect(0.5 - h, `${key} profundidade`).toBeGreaterThanOrEqual(rule.minDepth);
          expect(0.5 - h).toBeLessThanOrEqual(rule.maxDepth);
        } else {
          expect(rule.weights[rm.biomeAt(it.x, it.z)] || 0, `${key} no bioma ${rm.biomeAt(it.x, it.z)}`).toBeGreaterThan(0);
          expect(h).toBeGreaterThanOrEqual(rule.minH);
          expect(h).toBeLessThanOrEqual(rule.maxH);
        }
        expect(lava.distAt(it.x, it.z), `${key} perto da lava`).toBeGreaterThanOrEqual(2.2);
        for (const s of map.startSlots) expect(Math.hypot(s.x - it.x, s.z - it.z)).toBeGreaterThanOrEqual(10);
        for (const r of map.resources) expect(Math.hypot(r.x - it.x, r.z - it.z)).toBeGreaterThanOrEqual(4.5);
        expect(it.scale).toBeGreaterThanOrEqual(rule.scale[0]);
        expect(it.scale).toBeLessThanOrEqual(rule.scale[1]);
      }
      if (rule.spacing) {
        for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
          expect(Math.hypot(items[i].x - items[j].x, items[i].z - items[j].z), `${key} espaçamento`).toBeGreaterThanOrEqual(rule.spacing);
        }
      }
    }
  });

  it('o deserto do mapa de teste recebe arenito e arbusto rolante', () => {
    expect(plan.rock_sandstone_a.length + plan.rock_sandstone_b.length).toBeGreaterThan(0);
    expect(plan.tumbleweed.length).toBeGreaterThan(0);
  });

  it('a ilha vulcânica do mapa de teste recebe props vulcânicos (M2-14), nunca no deserto', () => {
    const volcanic = ['rock_basalt_a', 'rock_basalt_b', 'volcano_cone', 'tree_burnt', 'fumarole', 'obsidian'];
    const n = volcanic.reduce((acc, k) => acc + (plan[k] ? plan[k].length : 0), 0);
    expect(n).toBeGreaterThan(0);
    for (const k of volcanic) for (const it of plan[k] || []) expect(rm.biomeAt(it.x, it.z)).not.toBe(4);
  });

  it('propKeysOfMap lista só props de biomas presentes; mapa sem biomeGrid = nenhum', () => {
    const keys = propKeysOfMap(map);
    expect(keys).toContain('rock_sandstone_a');
    expect(keys).toContain('tumbleweed');
    expect(propKeysOfMap({ id: 'velho' })).toEqual([]);
    expect(propKeysOfMap(null)).toEqual([]);
  });

  it('a contagem cresce com a área, nunca abaixo da base', () => {
    for (const key of PROP_KEYS) {
      expect(propCountFor(key, 140)).toBe(PROP_RULES[key].legacyCount);
      expect(propCountFor(key, 224)).toBeGreaterThan(PROP_RULES[key].legacyCount);
    }
    expect(propCountFor('inexistente', 192)).toBe(0);
  });
});
