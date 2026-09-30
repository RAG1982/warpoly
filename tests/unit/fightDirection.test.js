import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { UnitAnimator, ANIMATION_DURATIONS } from '../../src/animation/UnitAnimator';

/**
 * Test suite for NEW-10: Verify arm/weapon mirroring produces forward strikes.
 */
describe('FightDirection - NEW-10', () => {
  function createFakeModel(unitType) {
    const group = new THREE.Group();
    group.name = unitType;
    group.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.Material()));
    group.children[0].name = 'Torso';
    group.add(new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), new THREE.Material()));
    group.children[1].name = 'Head';
    group.add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 1, 0.3), new THREE.Material()));
    group.children[2].name = 'ArmL';
    group.add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 1, 0.3), new THREE.Material()));
    group.children[3].name = 'ArmR';
    group.add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 1, 0.3), new THREE.Material()));
    group.children[4].name = 'LegL';
    group.add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 1, 0.3), new THREE.Material()));
    group.children[5].name = 'LegR';

    if (unitType === 'knight') {
      const sword = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2, 0.1), new THREE.Material());
      sword.name = 'Sword';
      group.add(sword);
    } else if (unitType === 'villager') {
      const toolGroup = new THREE.Group();
      toolGroup.name = 'ToolGroup';
      group.add(toolGroup);
    } else if (['bandit', 'grunt', 'ogre'].includes(unitType)) {
      const weapon = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1, 0.3), new THREE.Material());
      weapon.name = 'Weapon';
      group.add(weapon);
    } else if (unitType === 'axethrower') {
      const weaponR = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.6, 0.4), new THREE.Material());
      weaponR.name = 'WeaponR';
      group.add(weaponR);
    }

    return group;
  }

  const units = ['knight', 'villager', 'bandit', 'grunt', 'axethrower', 'ogre'];

  units.forEach(unitType => {
    describe(`${unitType}`, () => {
      let animator, model;

      beforeEach(() => {
        model = createFakeModel(unitType);
        animator = new UnitAnimator(model, unitType);
        animator.setAnimation('fight');
      });

      it('should have armR near 0 at p=0', () => {
        animator.setTime(0);
        expect(Math.abs(model.getObjectByName('ArmR').rotation.x)).toBeLessThan(0.05);
      });

      it('should have armR near 0 at p=1', () => {
        animator.setTime(ANIMATION_DURATIONS.fight);
        expect(Math.abs(model.getObjectByName('ArmR').rotation.x)).toBeLessThan(0.05);
      });

      it('should have hand forward at impact (negative rotation)', () => {
        // Test roughly at impact phase (middle-to-late)
        animator.setTime(0.65 * ANIMATION_DURATIONS.fight);
        const armR = model.getObjectByName('ArmR');
        // When X rotation is negative, hand goes forward (+Z direction)
        // This is the key fix: -sin(negative) = positive
        const handZ = -Math.sin(armR.rotation.x);
        expect(handZ).toBeGreaterThan(0.2);
      });
    });
  });

  describe('gather animation', () => {
    let animator, model;

    beforeEach(() => {
      model = createFakeModel('villager');
      animator = new UnitAnimator(model, 'villager');
      animator.setAnimation('gather');
    });

    it('should swing tool forward during gather', () => {
      animator.setTime(0.08 * ANIMATION_DURATIONS.gather);
      const armR = model.getObjectByName('ArmR');
      const handZ = -Math.sin(armR.rotation.x);
      expect(handZ).toBeGreaterThan(0.28);
    });
  });
});
