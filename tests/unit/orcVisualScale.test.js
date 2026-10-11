import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { glbBounds } from '../../tools/lib/glbBounds.mjs';
import { VISUAL_SCALE, VISUAL_SCALE_REFERENCE, visualScaleOf } from '../../src/data/visualScale.js';
import { UNITS } from '../../src/data/units.js';

const MODELS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public/models');
const ROOT = { villager: 'Villager', peon: 'Peon', knight: 'Knight', grunt: 'Grunt', archer: 'Archer', axethrower: 'Axethrower' };
const height = (key) => glbBounds(path.join(MODELS, `${key}.glb`), ROOT[key]).size[1];
const MESH_BASE = 1.62; // Unit.js: escala base das unidades terrestres

describe('orcs com o tamanho das unidades humanas (visualScale)', () => {
  it('alturas medidas nos .glb (fixture: se o arte mudar, recalcule VISUAL_SCALE)', () => {
    expect(height('villager')).toBeCloseTo(1.946, 2);
    expect(height('peon')).toBeCloseTo(2.285, 2);
    expect(height('knight')).toBeCloseTo(2.074, 2);
    expect(height('grunt')).toBeCloseTo(2.832, 2);
    expect(height('archer')).toBeCloseTo(1.974, 2);
    expect(height('axethrower')).toBeCloseTo(2.743, 2);
  });

  for (const [orc, human] of Object.entries(VISUAL_SCALE_REFERENCE)) {
    it(`${orc} × ${human}: altura final igual (≤ 3 %)`, () => {
      const hOrc = height(orc) * MESH_BASE * (UNITS[orc].scaleMul || 1) * visualScaleOf(orc);
      const hHuman = height(human) * MESH_BASE * (UNITS[human].scaleMul || 1) * visualScaleOf(human);
      expect(Math.abs(hOrc / hHuman - 1)).toBeLessThanOrEqual(0.03);
    });
  }

  it('só peon, grunt e axethrower são ajustados; ogro, cerco e humanos ficam em 1', () => {
    expect(Object.keys(VISUAL_SCALE).sort()).toEqual(['axethrower', 'grunt', 'peon']);
    for (const t of ['villager', 'knight', 'archer', 'ogre', 'catapult', 'ballista', 'cavalier']) expect(visualScaleOf(t)).toBe(1);
  });

  it('não altera valores de simulação: raios/alcances iguais aos do balanceamento', () => {
    expect(UNITS.peon.collisionRadius).toBe(0.66);
    expect(UNITS.grunt.collisionRadius).toBe(0.86);
    expect(UNITS.axethrower.collisionRadius).toBe(0.66);
    expect(UNITS.peon.healthBarHeight).toBe(UNITS.villager.healthBarHeight);
    expect(UNITS.grunt.healthBarHeight).toBe(UNITS.knight.healthBarHeight);
    expect(UNITS.axethrower.healthBarHeight).toBe(UNITS.archer.healthBarHeight);
  });
});
