import * as THREE from 'three';

/**
 * Durations (in seconds) for each unit animation
 */
export const ANIMATION_DURATIONS = {
  idle: 2.0,
  walk: 0.8,
  fight: 1.0,
  gather: 0.9,
  hurt: 0.5,
  die: 1.4
};

/**
 * Class representing a modular animation controller for WarPoly units
 */
export class UnitAnimator {
  constructor(model = null, unitType = 'knight') {
    this.model = null;
    this.unitType = unitType;
    this.currentAnim = 'idle';
    this.time = 0;
    this.playbackSpeed = 1.0;
    this.isPlaying = true;
    this.loop = true;

    // Track original transforms of all movable components
    this.baseTransforms = new Map();
    this.meshParts = {};

    // Flash / Damage tint state
    this.isHurtFlashing = false;
    this.originalColors = new Map();

    if (model) {
      this.bindModel(model, unitType);
    }
  }

  /**
   * Bind a 3D unit model to this animator
   * @param {THREE.Group} model
   * @param {string} unitType - 'knight' | 'archer' | 'villager' | 'bandit'
   */
  bindModel(model, unitType) {
    this.reset();
    this.model = model;
    this.unitType = (unitType || model.name || 'knight').toLowerCase();
    this.baseTransforms.clear();
    this.meshParts = {};
    this.originalColors.clear();

    // Cache components from userData if available or search children
    const ud = model.userData || {};
    this.meshParts = {
      torso: ud.torso || model.getObjectByName('Torso') || this.findFirstMesh(model, ['torso', 'body']),
      head: ud.head || model.getObjectByName('Head') || this.findFirstMesh(model, ['head']),
      armL: ud.armL || model.getObjectByName('ArmL') || this.findFirstMesh(model, ['arml', 'arm_l']),
      armR: ud.armR || model.getObjectByName('ArmR') || this.findFirstMesh(model, ['armr', 'arm_r']),
      legL: ud.legL || model.getObjectByName('LegL') || this.findFirstMesh(model, ['legl', 'leg_l']),
      legR: ud.legR || model.getObjectByName('LegR') || this.findFirstMesh(model, ['legr', 'leg_r']),
      sword: ud.sword,
      shieldGroup: ud.shieldGroup,
      bow: ud.bow,
      weapon: ud.weapon,
      toolGroup: ud.toolGroup,
      axe: ud.axe,
      pickaxe: ud.pickaxe,
      hammer: ud.hammer,
      pack: ud.pack,
      woodBundle: ud.woodBundle,
      goldSack: ud.goldSack,
      plume: ud.plume,
      updateBowString: ud.updateBowString || (ud.bow && ud.bow.userData && ud.bow.userData.updateBowString) || null,
      drawnArrow: ud.drawnArrow || (ud.bow && ud.bow.getObjectByName('DrawnArrow')) || null
    };

    // Clone model materials to isolate this unit so flashing never leaks to other units or buildings
    this.cloneMaterials(model);

    // Store base transforms for all limbs (model position and heading belong to world/game)
    for (const [key, obj] of Object.entries(this.meshParts)) {
      if (obj) {
        this.storeBaseTransform(key, obj);
      }
    }

    // Cache original material colors for damage flash
    model.traverse(child => {
      if (child.isMesh && child.material) {
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        mats.forEach(m => {
          if (m && !this.originalColors.has(m)) {
            this.originalColors.set(m, {
              color: m.color ? m.color.clone() : null,
              emissive: m.emissive ? m.emissive.clone() : null
            });
          }
        });
      }
    });

    this.setTime(0);
  }

  findFirstMesh(group, keywords) {
    let found = null;
    group.traverse(child => {
      if (!found && child.isMesh) {
        const name = (child.name || '').toLowerCase();
        if (keywords.some(k => name.includes(k))) {
          found = child;
        }
      }
    });
    return found;
  }

  storeBaseTransform(key, obj) {
    if (!obj || typeof obj !== 'object' || !obj.position) return;
    this.baseTransforms.set(key, {
      pos: obj.position.clone(),
      rot: obj.rotation.clone(),
      scale: obj.scale.clone()
    });
  }

  resetTransforms() {
    if (!this.model) return;
    // Reset any death tilt on the model root without touching world position or heading:
    this.model.rotation.x = 0;
    this.model.rotation.z = 0;

    // Restore limbs to their rest transforms
    for (const [key, obj] of Object.entries(this.meshParts)) {
      if (obj && this.baseTransforms.has(key)) {
        const b = this.baseTransforms.get(key);
        obj.position.copy(b.pos);
        obj.rotation.copy(b.rot);
        obj.scale.copy(b.scale);
      }
    }
    if (this.meshParts.updateBowString) {
      this.meshParts.updateBowString(0);
    }
    this.setDamageFlash(false);
  }

  setAnimation(name, forceRestart = false) {
    if (!ANIMATION_DURATIONS[name]) return;
    if (this.currentAnim === name && !forceRestart) return;

    this.currentAnim = name;
    this.time = 0;
    this.loop = (name !== 'die');
    this.resetTransforms();
    this.applyPose(0);
  }

  play() {
    this.isPlaying = true;
  }

  pause() {
    this.isPlaying = false;
  }

  togglePlay() {
    this.isPlaying = !this.isPlaying;
    return this.isPlaying;
  }

  setSpeed(speed) {
    this.playbackSpeed = Math.max(0.05, Math.min(5.0, speed));
  }

  getDuration() {
    return ANIMATION_DURATIONS[this.currentAnim] || 1.0;
  }

  setTime(time) {
    const dur = this.getDuration();
    if (this.loop) {
      this.time = ((time % dur) + dur) % dur;
    } else {
      this.time = Math.max(0, Math.min(dur, time));
    }
    this.applyPose(this.time);
  }

  step(dt) {
    this.setTime(this.time + dt);
  }

  update(dt) {
    if (!this.isPlaying || !this.model) return;
    const dur = this.getDuration();
    const nextTime = this.time + dt * this.playbackSpeed;

    if (this.loop) {
      this.time = nextTime % dur;
    } else {
      if (nextTime >= dur) {
        this.time = dur;
        this.isPlaying = false;
      } else {
        this.time = nextTime;
      }
    }

    this.applyPose(this.time);
  }

  reset() {
    this.resetTransforms();
    this.time = 0;
    this.isPlaying = true;
  }

  /**
   * Applies the calculated pose transforms to the 3D meshes for the current time
   */
  applyPose(time) {
    if (!this.model) return;
    this.resetTransforms();

    const parts = this.meshParts;
    const dur = this.getDuration();
    const progress = Math.min(1.0, Math.max(0.0, time / dur));
    const uType = this.unitType;

    switch (this.currentAnim) {
      case 'idle':
        this.applyIdle(time, parts, uType);
        break;
      case 'walk':
        this.applyWalk(time, parts, uType);
        break;
      case 'fight':
        this.applyFight(time, progress, parts, uType);
        break;
      case 'gather':
        this.applyGather(time, progress, parts, uType);
        break;
      case 'hurt':
        this.applyHurt(time, progress, parts, uType);
        break;
      case 'die':
        this.applyDie(time, progress, parts, uType);
        break;
    }
  }

  // --- 1. IDLE ANIMATION ---
  applyIdle(time, parts, uType) {
    const breath = Math.sin(time * Math.PI); // 1.0 cycle per second
    const lookSway = Math.sin(time * 1.5) * 0.05;

    // Torso gentle breathing bob & scale
    if (parts.torso) {
      parts.torso.position.y += breath * 0.025;
      parts.torso.scale.y = 1.0 + breath * 0.02;
    }

    // Head breathing look
    if (parts.head) {
      parts.head.position.y += breath * 0.02;
      parts.head.rotation.y = lookSway;
      parts.head.rotation.x = Math.cos(time * 2.0) * 0.02;
    }

    // Arm resting breathing sways
    if (parts.armL) {
      parts.armL.rotation.z = Math.sin(time * 2.5) * 0.04 - 0.02;
      parts.armL.rotation.x = breath * 0.03;
    }
    if (parts.armR) {
      parts.armR.rotation.z = -Math.sin(time * 2.5) * 0.04 + 0.02;
      parts.armR.rotation.x = breath * 0.03;
    }

    // Unit-specific idle nuances
    if (uType === 'knight') {
      if (parts.shieldGroup) {
        parts.shieldGroup.rotation.y = -0.3 + breath * 0.04;
        parts.shieldGroup.position.y += breath * 0.015;
      }
      if (parts.sword) {
        parts.sword.rotation.x = 0.5 + breath * 0.05;
        parts.sword.rotation.z = -0.1 + breath * 0.02;
      }
      if (parts.plume) {
        parts.plume.rotation.z = Math.sin(time * 3.0) * 0.06;
      }
    } else if (uType === 'archer') {
      if (parts.bow) {
        parts.bow.rotation.x = 0;
        parts.bow.rotation.y = breath * 0.03;
        parts.bow.position.y += breath * 0.02;
      }
    } else if (uType === 'bandit') {
      // Menacing slight hunch forward & club rest
      if (parts.torso) {
        parts.torso.rotation.x = 0.08 + breath * 0.03;
      }
      if (parts.weapon) {
        parts.weapon.rotation.x = 0.55 + breath * 0.04;
      }
    }
  }

  // --- 2. WALK ANIMATION ---
  applyWalk(time, parts, uType) {
    const cycleFreq = (Math.PI * 2) / 0.8; // full walk cycle in 0.8s
    const phase = time * cycleFreq;

    const legSwing = Math.sin(phase) * 0.65;
    const armSwing = Math.sin(phase) * 0.55;
    const verticalBounce = Math.abs(Math.sin(phase)) * 0.07;
    const hipSway = Math.sin(phase) * 0.08;
    const rollSway = Math.cos(phase) * 0.04;

    // Legs full alternating stride with foot lift
    if (parts.legL) {
      parts.legL.rotation.x = legSwing;
      // Slight leg lift during forward swing
      parts.legL.position.y += Math.max(0, -Math.sin(phase)) * 0.05;
    }
    if (parts.legR) {
      parts.legR.rotation.x = -legSwing;
      parts.legR.position.y += Math.max(0, Math.sin(phase)) * 0.05;
    }

    // Torso vertical bounce (two bounces per full stride cycle!) and hip sway
    if (parts.torso) {
      parts.torso.position.y += verticalBounce - 0.02;
      parts.torso.rotation.y = hipSway;
      parts.torso.rotation.z = rollSway;
      parts.torso.rotation.x = 0.05; // slight forward travel tilt
    }

    // Head counter-bobbing
    if (parts.head) {
      parts.head.position.y += verticalBounce;
      parts.head.rotation.x = 0.04 + Math.sin(phase * 2) * 0.03;
      parts.head.rotation.y = -hipSway * 0.5;
    }

    // Arms counter-swinging naturally
    if (parts.armL) {
      parts.armL.rotation.x = -armSwing;
      parts.armL.rotation.z = -0.05 + rollSway;
    }
    if (parts.armR) {
      parts.armR.rotation.x = armSwing;
      parts.armR.rotation.z = 0.05 + rollSway;
    }

    // Held items motion during walking
    if (uType === 'knight') {
      if (parts.shieldGroup) {
        parts.shieldGroup.rotation.y = -0.3 + armSwing * 0.3;
        parts.shieldGroup.position.y += verticalBounce;
      }
      if (parts.sword) {
        parts.sword.rotation.x = 0.5 + armSwing * 0.4;
        parts.sword.position.y += verticalBounce;
      }
    } else if (uType === 'archer') {
      if (parts.bow) {
        parts.bow.rotation.x = 0;
        parts.bow.rotation.y = -armSwing * 0.1;
        parts.bow.position.y += verticalBounce;
      }
    } else if (uType === 'villager') {
      if (parts.toolGroup) {
        parts.toolGroup.rotation.x = armSwing * 0.5;
        parts.toolGroup.position.y += verticalBounce;
      }
    } else if (uType === 'bandit') {
      if (parts.weapon) {
        parts.weapon.rotation.x = 0.5 + armSwing * 0.4;
        parts.weapon.position.y += verticalBounce;
      }
    }
  }

  // --- 3. FIGHT / ATTACK ANIMATION ---
  applyFight(time, progress, parts, uType) {
    if (uType === 'archer') {
      this.applyArcherFight(progress, parts);
    } else if (uType === 'knight') {
      this.applyKnightFight(progress, parts);
    } else if (uType === 'villager') {
      this.applyVillagerFight(progress, parts);
    } else if (uType === 'bandit') {
      this.applyBanditFight(progress, parts);
    }
  }

  applyKnightFight(p, parts) {
    // Knight: Windup, explosive diagonal/horizontal slash with body torque, shield brace, recovery
    // Pure torso twist/rotation: Torso stays rock-solid at waist height with NO vertical dipping!
    if (p < 0.35) {
      // Windup (0.0 -> 0.35) - body winds up to the right
      const t = p / 0.35;
      const ease = t * t;
      if (parts.torso) {
        parts.torso.rotation.y = ease * 0.45;
      }
      if (parts.armR) {
        parts.armR.rotation.x = -ease * 1.35;
        parts.armR.rotation.y = ease * 0.3;
        parts.armR.rotation.z = ease * 0.2;
      }
      if (parts.sword) {
        parts.sword.rotation.x = 0.5 - ease * 0.8;
      }
      if (parts.shieldGroup) {
        parts.shieldGroup.rotation.y = -0.3 + ease * 0.55;
      }
      if (parts.head) {
        parts.head.rotation.y = -ease * 0.2;
      }
    } else if (p < 0.60) {
      // Explosive Slash (0.35 -> 0.60) - body twists powerfully through strike
      const t = (p - 0.35) / 0.25;
      const ease = Math.sin((t * Math.PI) / 2);
      if (parts.torso) {
        parts.torso.rotation.y = 0.45 - ease * 0.95; // Full torso torque to -0.5
      }
      if (parts.armR) {
        parts.armR.rotation.x = -1.35 + ease * 2.5; // swings forward to +1.15
        parts.armR.rotation.y = 0.3 - ease * 0.7;
        parts.armR.rotation.z = 0.2 - ease * 0.5;
      }
      if (parts.sword) {
        parts.sword.rotation.x = -0.3 + ease * 1.6;
      }
      if (parts.shieldGroup) {
        parts.shieldGroup.rotation.y = 0.25 - ease * 0.75; // Brace backward
      }
      if (parts.head) {
        parts.head.rotation.y = -0.2 + ease * 0.4;
      }
    } else if (p < 0.78) {
      // Impact hold & deceleration (0.60 -> 0.78)
      if (parts.torso) {
        parts.torso.rotation.y = -0.5;
      }
      if (parts.armR) {
        parts.armR.rotation.x = 1.15;
        parts.armR.rotation.y = -0.4;
      }
      if (parts.sword) {
        parts.sword.rotation.x = 1.3;
      }
      if (parts.shieldGroup) {
        parts.shieldGroup.rotation.y = -0.5;
      }
    } else {
      // Recovery (0.78 -> 1.0) - smooth return to neutral stance
      const t = (p - 0.78) / 0.22;
      const ease = t * (2 - t);
      if (parts.torso) {
        parts.torso.rotation.y = -0.5 + ease * 0.5;
      }
      if (parts.armR) {
        parts.armR.rotation.x = 1.15 - ease * 1.15;
        parts.armR.rotation.y = -0.4 + ease * 0.4;
      }
      if (parts.sword) {
        parts.sword.rotation.x = 1.3 - ease * 0.8;
      }
      if (parts.shieldGroup) {
        parts.shieldGroup.rotation.y = -0.5 + ease * 0.2;
      }
    }
  }

  applyArcherFight(p, parts) {
    // Archer: Raise bow forward, draw string to cheek, aim, release arrow with snap recoil & recovery
    if (p < 0.25) {
      // Bow Raise & Sideways Archer Posture (0.0 -> 0.25)
      const t = p / 0.25;
      const ease = t * (2 - t);
      if (parts.updateBowString) {
        parts.updateBowString(0);
      }
      if (parts.torso) {
        parts.torso.rotation.y = ease * 0.55; // turn sideways
        parts.torso.rotation.x = ease * 0.05;
      }
      if (parts.head) {
        parts.head.rotation.y = -ease * 0.45; // aim head forward along shot line
      }
      if (parts.armL) {
        parts.armL.rotation.x = -ease * 1.45; // raise bow arm forward towards target
        parts.armL.rotation.y = ease * 0.18;
        parts.armL.rotation.z = -ease * 0.05;
      }
      if (parts.bow) {
        // Wrist counter-rotation: keeps bow upright vertical perpendicular to shot!
        parts.bow.rotation.x = ease * 1.45;
        parts.bow.rotation.y = -ease * 0.18;
        parts.bow.rotation.z = -ease * 0.15; // natural slight archer cant
      }
      if (parts.armR) {
        parts.armR.rotation.x = -ease * 1.25; // raise draw arm forward towards string
        parts.armR.rotation.y = -ease * 0.55;
        parts.armR.rotation.z = ease * 0.50;
        parts.armR.position.z -= ease * 0.16;
      }
    } else if (p < 0.65) {
      // Draw String back to ear/cheek (0.25 -> 0.65)
      const t = (p - 0.25) / 0.4;
      const ease = t * t * (3 - 2 * t);
      const drawDist = ease * 0.32; // Draws taut triangle apex back to 0.32
      if (parts.updateBowString) {
        parts.updateBowString(drawDist);
      }
      if (parts.torso) {
        parts.torso.rotation.y = 0.55 + ease * 0.08;
      }
      if (parts.head) {
        parts.head.rotation.y = -0.45;
      }
      if (parts.armL) {
        // Steady bow arm with slight tension vibration
        const tensionJitter = Math.sin(t * 30) * 0.008 * ease;
        parts.armL.rotation.x = -1.45 + tensionJitter;
        parts.armL.rotation.y = 0.18;
        parts.armL.rotation.z = -0.05;
      }
      if (parts.bow) {
        // Solid upright vertical bow pose
        parts.bow.rotation.x = 1.45;
        parts.bow.rotation.y = -0.18;
        parts.bow.rotation.z = -0.15;
      }
      if (parts.armR) {
        // Hand pulls right up to cheek / string draw
        parts.armR.rotation.x = -1.25 - ease * 0.15;
        parts.armR.rotation.y = -0.55 - ease * 0.15;
        parts.armR.rotation.z = 0.50 + ease * 0.20;
        parts.armR.position.z -= (0.16 + ease * 0.12);
      }
    } else if (p < 0.75) {
      // Arrow Release Snap & Recoil (0.65 -> 0.75) - string returns to straight, arrow shoots
      const t = (p - 0.65) / 0.1;
      if (parts.updateBowString) {
        parts.updateBowString(0);
      }
      if (parts.armR) {
        // Fingers release forward snap!
        parts.armR.rotation.x = -1.40 + t * 0.40;
        parts.armR.rotation.y = -0.70 + t * 0.25;
        parts.armR.rotation.z = 0.70 - t * 0.30;
        parts.armR.position.z = -0.28 + t * 0.15;
      }
      if (parts.armL) {
        // Bow kicks upward/backward from string snap
        parts.armL.rotation.x = -1.45 - (1 - t) * 0.15;
      }
      if (parts.bow) {
        // Bow tip kicks back from string release
        parts.bow.rotation.x = 1.45 + (1 - t) * 0.20;
        parts.bow.rotation.y = -0.18;
        parts.bow.rotation.z = -0.15;
      }
      if (parts.torso) {
        parts.torso.rotation.y = 0.63 - t * 0.10;
        parts.torso.position.z -= (1 - t) * 0.03;
      }
    } else {
      // Lower bow & Recover (0.75 -> 1.0)
      const t = (p - 0.75) / 0.25;
      const ease = t * t;
      if (parts.updateBowString) {
        parts.updateBowString(0);
      }
      if (parts.torso) {
        parts.torso.rotation.y = 0.53 * (1 - ease);
      }
      if (parts.head) {
        parts.head.rotation.y = -0.45 * (1 - ease);
      }
      if (parts.armL) {
        parts.armL.rotation.x = -1.45 * (1 - ease);
        parts.armL.rotation.y = 0.18 * (1 - ease);
        parts.armL.rotation.z = -0.05 * (1 - ease);
      }
      if (parts.bow) {
        parts.bow.rotation.x = 1.45 * (1 - ease);
        parts.bow.rotation.y = -0.18 * (1 - ease);
        parts.bow.rotation.z = -0.15 * (1 - ease);
      }
      if (parts.armR) {
        parts.armR.rotation.x = -1.0 * (1 - ease);
        parts.armR.rotation.y = -0.45 * (1 - ease);
        parts.armR.rotation.z = 0.35 * (1 - ease);
        parts.armR.position.z = -0.12 * (1 - ease);
      }
    }
  }

  applyVillagerFight(p, parts) {
    // Villager: Heavy two-handed tool hoist overhead and massive downward slam
    if (p < 0.45) {
      // Hoist Overhead (0.0 -> 0.45)
      const t = p / 0.45;
      const ease = t * t;
      if (parts.torso) {
        parts.torso.rotation.x = -ease * 0.25; // arch back
      }
      if (parts.head) {
        parts.head.rotation.x = -ease * 0.2;
      }
      if (parts.armR) {
        parts.armR.rotation.x = -ease * 1.55;
        parts.armR.rotation.z = -ease * 0.2;
      }
      if (parts.armL) {
        parts.armL.rotation.x = -ease * 1.35;
        parts.armL.rotation.z = ease * 0.2;
      }
      if (parts.toolGroup) {
        parts.toolGroup.rotation.x = -ease * 0.6;
      }
    } else if (p < 0.65) {
      // Downward Strike (0.45 -> 0.65)
      const t = (p - 0.45) / 0.2;
      const ease = Math.sin((t * Math.PI) / 2);
      if (parts.torso) {
        parts.torso.rotation.x = -0.25 + ease * 0.65; // snap forward to 0.4
      }
      if (parts.head) {
        parts.head.rotation.x = -0.2 + ease * 0.5;
      }
      if (parts.armR) {
        parts.armR.rotation.x = -1.55 + ease * 2.85; // slam forward to 1.3
      }
      if (parts.armL) {
        parts.armL.rotation.x = -1.35 + ease * 2.45;
      }
      if (parts.toolGroup) {
        parts.toolGroup.rotation.x = -0.6 + ease * 1.6;
      }
    } else if (p < 0.80) {
      // Impact shudder (0.65 -> 0.80)
      const shudder = Math.sin((p - 0.65) * 40) * 0.03;
      if (parts.torso) {
        parts.torso.rotation.x = 0.4 + shudder;
      }
      if (parts.armR) parts.armR.rotation.x = 1.3;
      if (parts.armL) parts.armL.rotation.x = 1.1;
      if (parts.toolGroup) parts.toolGroup.rotation.x = 1.0;
    } else {
      // Recovery (0.80 -> 1.0)
      const t = (p - 0.80) / 0.2;
      const ease = t * (2 - t);
      if (parts.torso) {
        parts.torso.rotation.x = 0.4 * (1 - ease);
      }
      if (parts.head) {
        parts.head.rotation.x = 0.3 * (1 - ease);
      }
      if (parts.armR) {
        parts.armR.rotation.x = 1.3 * (1 - ease);
      }
      if (parts.armL) {
        parts.armL.rotation.x = 1.1 * (1 - ease);
      }
      if (parts.toolGroup) {
        parts.toolGroup.rotation.x = 1.0 * (1 - ease);
      }
    }
  }

  applyBanditFight(p, parts) {
    // Bandit: Savage windup with spiky club, leaping lunge, brutal ground smash
    if (p < 0.40) {
      // Savage Windup (0.0 -> 0.40)
      const t = p / 0.40;
      const ease = t * t;
      if (parts.torso) {
        parts.torso.rotation.y = ease * 0.55;
        parts.torso.rotation.x = -ease * 0.2;
      }
      if (parts.armR) {
        parts.armR.rotation.x = -ease * 1.65;
        parts.armR.rotation.y = ease * 0.35;
      }
      if (parts.weapon) {
        parts.weapon.rotation.x = 0.5 - ease * 0.7;
      }
      if (parts.armL) {
        parts.armL.rotation.x = ease * 0.4;
        parts.armL.rotation.z = -ease * 0.35; // claw balance
      }
      if (parts.head) {
        parts.head.rotation.x = -ease * 0.15;
      }
    } else if (p < 0.65) {
      // Brutal Jump & Slam Down (0.40 -> 0.65)
      const t = (p - 0.40) / 0.25;
      const ease = Math.sin((t * Math.PI) / 2);

      if (parts.torso) {
        parts.torso.rotation.y = 0.55 - ease * 0.85;
        parts.torso.rotation.x = -0.2 + ease * 0.65;
      }
      if (parts.armR) {
        parts.armR.rotation.x = -1.65 + ease * 3.0; // slam club down to +1.35
        parts.armR.rotation.y = 0.35 - ease * 0.5;
      }
      if (parts.weapon) {
        parts.weapon.rotation.x = -0.2 + ease * 1.5;
      }
      if (parts.armL) {
        parts.armL.rotation.x = 0.4 - ease * 0.7;
      }
      if (parts.head) {
        parts.head.rotation.x = -0.15 + ease * 0.5;
      }
    } else if (p < 0.80) {
      // Ground Shudder & Hold (0.65 -> 0.80)
      const shudder = Math.sin((p - 0.65) * 45) * 0.025;
      if (parts.torso) {
        parts.torso.rotation.x = 0.45 + shudder;
      }
      if (parts.armR) parts.armR.rotation.x = 1.35;
      if (parts.weapon) parts.weapon.rotation.x = 1.3;
      if (parts.head) parts.head.rotation.x = 0.35;
    } else {
      // Menacing recovery back to aggressive stance (0.80 -> 1.0)
      const t = (p - 0.80) / 0.2;
      const ease = t * (2 - t);
      if (parts.torso) {
        parts.torso.rotation.y = -0.3 * (1 - ease);
        parts.torso.rotation.x = 0.45 * (1 - ease) + 0.08 * ease;
      }
      if (parts.armR) {
        parts.armR.rotation.x = 1.35 * (1 - ease);
      }
      if (parts.weapon) {
        parts.weapon.rotation.x = 1.3 * (1 - ease) + 0.5 * ease;
      }
      if (parts.head) {
        parts.head.rotation.x = 0.35 * (1 - ease);
      }
    }
  }

  // --- 4. GATHER ANIMATION ---
  applyGather(time, progress, parts, uType) {
    // Fast rhythmic chopping / mining strikes
    const cycle = (time * 5.0) % (Math.PI * 2);
    const strike = Math.sin(cycle);
    const forwardLean = 0.18;

    if (parts.torso) {
      parts.torso.rotation.x = forwardLean + strike * 0.12;
      parts.torso.position.y -= Math.max(0, strike) * 0.06;
    }

    if (parts.head) {
      parts.head.rotation.x = forwardLean + strike * 0.15;
    }

    if (parts.armR) {
      // Swings forward and back in rhythm
      parts.armR.rotation.x = strike * 0.85;
    }
    if (parts.armL) {
      parts.armL.rotation.x = -strike * 0.35;
    }

    if (parts.toolGroup) {
      parts.toolGroup.rotation.x = strike * 0.9;
    }
    if (parts.sword) {
      parts.sword.rotation.x = strike * 0.8;
    }
    if (parts.weapon) {
      parts.weapon.rotation.x = strike * 0.8;
    }
  }

  // --- 5. HURT / HIT ANIMATION ---
  applyHurt(time, progress, parts, uType) {
    // 0.0 -> 0.25: Violent recoil backward, head reels, arms flail outward
    // 0.25 -> 0.65: Stagger recovery wobble
    // 0.65 -> 1.0: Smooth return to center
    // Torso stays firmly at waist height on feet with NO falling to the ground!
    if (progress < 0.25) {
      const t = progress / 0.25;
      const ease = Math.sin((t * Math.PI) / 2);
      if (parts.torso) {
        parts.torso.rotation.x = -ease * 0.35; // snap backward in flinch
      }
      if (parts.head) {
        parts.head.rotation.x = -ease * 0.40; // head reels back
        parts.head.rotation.y = ease * 0.20;
      }
      if (parts.armL) {
        parts.armL.rotation.z = -ease * 0.55; // defensive flail out
        parts.armL.rotation.x = -ease * 0.45;
      }
      if (parts.armR) {
        parts.armR.rotation.z = ease * 0.55;
        parts.armR.rotation.x = -ease * 0.45;
      }
      if (parts.legL) parts.legL.rotation.x = ease * 0.20;
      if (parts.legR) parts.legR.rotation.x = -ease * 0.15;

      this.setDamageFlash(true);
    } else if (progress < 0.65) {
      const t = (progress - 0.25) / 0.4;
      const stagger = Math.sin(t * 18) * (1 - t) * 0.10;

      if (parts.torso) {
        parts.torso.rotation.x = -0.35 * (1 - t);
        parts.torso.rotation.z = stagger;
      }
      if (parts.head) {
        parts.head.rotation.x = -0.40 * (1 - t);
        parts.head.rotation.y = 0.20 * (1 - t) - stagger * 0.5;
      }
      if (parts.armL) {
        parts.armL.rotation.z = -0.55 * (1 - t);
        parts.armL.rotation.x = -0.45 * (1 - t);
      }
      if (parts.armR) {
        parts.armR.rotation.z = 0.55 * (1 - t);
        parts.armR.rotation.x = -0.45 * (1 - t);
      }

      this.setDamageFlash(t < 0.4);
    } else {
      this.setDamageFlash(false);
      // Smooth rest
    }
  }

  // --- 6. FALL / DIE ANIMATION ---
  applyDie(time, progress, parts, uType) {
    // 0.0 -> 0.25: Knees buckle, arms go limp, head drops forward
    // 0.25 -> 0.80: Tumble and collapse to the floor (model rotates onto back)
    // 0.80 -> 1.05: Ground impact bounce & limp settle
    // 1.05+: Still death pose
    // Pure pitch/roll rotation around ground pivot: NEVER modifies world position coordinates!

    if (progress < 0.25) {
      // Fatal reaction: knees buckle
      const t = progress / 0.25;
      const ease = t * t;
      if (parts.torso) {
        parts.torso.rotation.x = ease * 0.2;
      }
      if (parts.head) {
        parts.head.rotation.x = ease * 0.45; // head droops
      }
      if (parts.legL) parts.legL.rotation.x = ease * 0.55;
      if (parts.legR) parts.legR.rotation.x = ease * 0.45;
      if (parts.armL) {
        parts.armL.rotation.x = ease * 0.2;
        parts.armL.rotation.z = -ease * 0.15;
      }
      if (parts.armR) {
        parts.armR.rotation.x = ease * 0.2;
        parts.armR.rotation.z = ease * 0.15;
      }
    } else if (progress < 0.80) {
      // Dramatic collapse onto the floor!
      const t = (progress - 0.25) / 0.55;
      const fallEase = t * t;

      if (this.model) {
        // Fall backwards onto back - purely pitch and slight roll
        this.model.rotation.x = -fallEase * (Math.PI / 2);
        this.model.rotation.z = fallEase * 0.25;
      }
      if (parts.head) {
        parts.head.rotation.x = 0.45 - fallEase * 0.25;
        parts.head.rotation.z = fallEase * 0.3;
      }
      if (parts.armL) {
        parts.armL.rotation.z = -0.15 - fallEase * 0.7; // splayed limp on ground
      }
      if (parts.armR) {
        parts.armR.rotation.z = 0.15 + fallEase * 0.7;
      }
    } else if (progress < 1.05) {
      // Ground bounce & settle
      const t = (progress - 0.80) / 0.25;
      const bounce = Math.sin(t * Math.PI) * 0.05 * (1 - t);

      if (this.model) {
        this.model.rotation.x = -Math.PI / 2 + bounce;
        this.model.rotation.z = 0.25;
      }
      if (parts.armL) parts.armL.rotation.z = -0.85;
      if (parts.armR) parts.armR.rotation.z = 0.85;
      if (parts.head) parts.head.rotation.z = 0.3;
    } else {
      // Permanent death pose
      if (this.model) {
        this.model.rotation.x = -Math.PI / 2;
        this.model.rotation.z = 0.25;
      }
      if (parts.armL) parts.armL.rotation.z = -0.85;
      if (parts.armR) parts.armR.rotation.z = 0.85;
      if (parts.head) parts.head.rotation.z = 0.3;
    }
  }

  cloneMaterials(model) {
    if (!model) return;
    const matMap = new Map();
    model.traverse(child => {
      if (child.isMesh && child.material) {
        if (Array.isArray(child.material)) {
          child.material = child.material.map(m => {
            if (!matMap.has(m)) matMap.set(m, m.clone());
            return matMap.get(m);
          });
        } else {
          if (!matMap.has(child.material)) {
            matMap.set(child.material, child.material.clone());
          }
          child.material = matMap.get(child.material);
        }
      }
    });
  }

  // --- DAMAGE FLASH VISUAL ---
  setDamageFlash(flash) {
    if (this.isHurtFlashing === flash) return;
    this.isHurtFlashing = flash;

    if (!this.model) return;
    this.model.traverse(child => {
      if (child.isMesh && child.material) {
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        mats.forEach(mat => {
          if (!mat || !mat.emissive) return;
          const orig = this.originalColors.get(mat);
          if (flash) {
            mat.emissive.setHex(0xc53030); // Vibrant red flash isolated to this unit
          } else {
            if (orig && orig.emissive) {
              mat.emissive.copy(orig.emissive);
            } else {
              mat.emissive.setHex(0x000000);
            }
          }
        });
      }
    });
  }

  // --- VILLAGER CUSTOMIZATIONS ---
  setVillagerTool(toolType) {
    const p = this.meshParts;
    if (p.axe) p.axe.visible = (toolType === 'axe');
    if (p.pickaxe) p.pickaxe.visible = (toolType === 'pickaxe');
    if (p.hammer) p.hammer.visible = (toolType === 'hammer');
  }

  setVillagerCargo(cargoType) {
    const p = this.meshParts;
    if (!p.pack) return;

    if (cargoType === 'wood') {
      p.pack.visible = true;
      if (p.woodBundle) p.woodBundle.visible = true;
      if (p.goldSack) p.goldSack.visible = false;
    } else if (cargoType === 'gold') {
      p.pack.visible = true;
      if (p.woodBundle) p.woodBundle.visible = false;
      if (p.goldSack) p.goldSack.visible = true;
    } else {
      p.pack.visible = false;
      if (p.woodBundle) p.woodBundle.visible = false;
      if (p.goldSack) p.goldSack.visible = false;
    }
  }
}
