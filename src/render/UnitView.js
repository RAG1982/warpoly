/**
 * UnitView.js — F2-08c: malha de uma unidade (`src/sim/Unit.js`, entidade pura). Segura o `THREE.Object3D` do modelo,
 * o `UnitAnimator`, o anel de seleção, as barras de vida/mana (billboard), a cor do time, a ferramenta/carga do
 * trabalhador, o visual fantasma da invisibilidade e a interpolação visual `prev → sim` do tick fixo.
 * Criada/removida pela `EntityViews`; lê o estado da simulação a cada quadro (`update`) e nunca escreve nela.
 */
import * as THREE from 'three';
import { ModelFactory } from '../entities/ModelFactory.js';
import { UnitAnimator } from '../animation/UnitAnimator.js';
import { stableVariant, deathStyleFor } from '../animation/animMath.js';
import { getUnitDef } from '../data/index.js';
import { HERO_BAR_SCALE } from '../data/heroes.js';
import { syncOutline, resetOutline } from './postfx/outlineLayer.js';
import { isDetectedBy } from '../sim/detection.js';
import { SIM_DT, lerpAngle, animationLodStep } from '../sim/constants.js';

const _wakePos = new THREE.Vector3();

// Shared Selection Ring Geometry & Materials
const unitRingGeo = new THREE.RingGeometry(0.85, 1.05, 24);
unitRingGeo.rotateX(-Math.PI / 2);

const playerRingMat = new THREE.MeshBasicMaterial({
  color: 0xdeb841,
  side: THREE.DoubleSide,
  transparent: true,
  opacity: 0.85
});
const enemyRingMat = new THREE.MeshBasicMaterial({
  color: 0xef4444,
  side: THREE.DoubleSide,
  transparent: true,
  opacity: 0.85
});

// Shared 3D Health Bar Geometries & Materials (Zero Canvas, zero texture uploads)
const hpBgGeo = new THREE.PlaneGeometry(1.34, 0.22);
const hpFillGeo = new THREE.PlaneGeometry(1.28, 0.16);
hpFillGeo.translate(0.64, 0, 0); // pivot at left edge so scale.x scales neatly

const hpBgMat = new THREE.MeshBasicMaterial({
  color: 0x0f172a,
  side: THREE.DoubleSide,
  depthTest: false,
  depthWrite: false,
  transparent: false
});
const hpGreenMat = new THREE.MeshBasicMaterial({ color: 0x22c55e, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
const hpYellowMat = new THREE.MeshBasicMaterial({ color: 0xfacc15, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
const hpRedMat = new THREE.MeshBasicMaterial({ color: 0xef4444, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
// F4-03: barra de mana azul (mesma geometria/fundo da barra de vida; só o material do preenchimento é novo)
const manaBlueMat = new THREE.MeshBasicMaterial({ color: 0x3b82f6, depthTest: false, depthWrite: false, side: THREE.DoubleSide });


const _lodSphere = new THREE.Sphere(new THREE.Vector3(), 3);

export class UnitView {
  /**
   * @param {import('../sim/Unit.js').Unit} unit
   * @param {import('three').Scene|null} scene
   */
  constructor(unit, scene) {
    this.entity = unit;
    this.scene = scene;
    /** Escrito pela `FogView`: inimigo fora da visão atual não é desenhado. */
    this.fogHidden = false;
    /** Invisibilidade (F4-04): inimigo não detectado não é desenhado. */
    this._invHidden = false;
    this._ghost = false;
    this._animAcc = 0; // delta de animação acumulado enquanto fora do frustum/invisível (LOD)
    this._deathSinkOffset = 0; // afundamento visual pós-morte
    this._hpPct = -1;
    this._manaPct = -1;

    this._buildModel();
    this._modelSeq = unit.modelSeq;

    this.selectionRing = new THREE.Mesh(unitRingGeo, unit.faction === 'player' ? playerRingMat : enemyRingMat);
    this.selectionRing.name = 'SelectionRing';
    this.selectionRing.position.y = 0.05 - (unit.flyHeight || 0) / 1.62; // F4-06: aéreo — anel no chão, sob a unidade
    this.selectionRing.visible = false;
    this.root.add(this.selectionRing);

    this._createHealthBar();
    if (unit.maxMana > 0) this._ensureManaBar();

    scene.add(this.root);
  }

  /** Alias da raiz 3D (compatível com o antigo `Unit.mesh`). */
  get mesh() { return this.root; }

  /** (Re)cria o modelo 3D, o animador e aplica cor do time, posição, escala e rotação atuais da simulação. */
  _buildModel() {
    const u = this.entity;
    const base = u.visualBase;
    const def = getUnitDef(base);
    const gm = u.gameManager;
    const owner = gm && gm.getPlayer ? gm.getPlayer(u.ownerId) : null;
    const root = ModelFactory.createUnit(ModelFactory.visualType(base, def), owner && owner.factionId);
    if (owner && owner.color) ModelFactory.setTeamColor(root, owner.color); // F7-02: no-op para modelos procedurais
    const p = u.mesh.position;
    root.position.set(p.x, p.y, p.z);
    root.rotation.y = u.mesh.rotation.y;
    root.scale.set(u.mesh.scale.x, u.mesh.scale.y, u.mesh.scale.z);
    root.userData.entity = u;
    this.root = root;
    this.animator = new UnitAnimator(root, def.modelOf || base);
    this.animator.setSeed(u.id | 0); // F7-06: rng de render do idle variado + variante estável do ataque
    this.animator.setAttackVariant(stableVariant(u.id | 0, 2, 1));
    this._ghost = false;
    this._tool = null; // ferramenta aplicada (null = padrão do modelo)
    this._carryKey = '#'; // carga aplicada ('#' = padrão do modelo)
    this._poseSeq = u.poseResetSeq;
    this._walkSeq = u.walkResetSeq;
    this._restartSeq = u.animRestartSeq;
    this._resetSeq = u.animResetSeq;
  }

  /** F4-04: troca o modelo 3D (Transmutação): mantém o anel de seleção e a visibilidade. */
  _swapModel() {
    const old = this.root;
    resetOutline(this);
    const ring = this.selectionRing;
    const visible = old.visible;
    this._buildModel();
    this.root.visible = visible;
    old.remove(ring);
    this.root.add(ring);
    if (this.scene) {
      this.scene.remove(old);
      this.scene.add(this.root);
    }
    this._modelSeq = this.entity.modelSeq;
  }

  _createHealthBar() {
    const u = this.entity;
    this.hpGroup = new THREE.Group();
    this.hpGroup.name = 'HealthBar';
    const p = this.root.position;
    this.hpGroup.position.set(p.x, p.y + this.getHealthBarHeight(), p.z);

    const bgMesh = new THREE.Mesh(hpBgGeo, hpBgMat);
    bgMesh.name = 'HealthBg';
    bgMesh.renderOrder = 1100;
    this.hpGroup.add(bgMesh);

    this.hpFillMesh = new THREE.Mesh(hpFillGeo, hpGreenMat);
    this.hpFillMesh.name = 'HealthFill';
    this.hpFillMesh.position.set(-0.64, 0, 0.005);
    this.hpFillMesh.renderOrder = 1101;
    this.hpGroup.add(this.hpFillMesh);

    if (getUnitDef(u.type).isHero) this.hpGroup.scale.setScalar(HERO_BAR_SCALE); // F4-08: barra maior para heróis
    this.hpGroup.visible = false;
    this.hpSprite = this.hpGroup; // backward compatibility alias
    if (this.scene) this.scene.add(this.hpGroup);
    this._updateHealthFill(u);
  }

  /** F4-03: cria a barra de mana (filhos do `hpGroup`, geometria e fundo compartilhados). */
  _ensureManaBar() {
    if (this.manaFillMesh || !this.hpGroup) return;
    this.manaBgMesh = new THREE.Mesh(hpBgGeo, hpBgMat);
    this.manaBgMesh.name = 'ManaBg';
    this.manaBgMesh.position.set(0, -0.26, 0);
    this.manaBgMesh.renderOrder = 1100;
    this.hpGroup.add(this.manaBgMesh);
    this.manaFillMesh = new THREE.Mesh(hpFillGeo, manaBlueMat);
    this.manaFillMesh.name = 'ManaFill';
    this.manaFillMesh.position.set(-0.64, -0.26, 0.005);
    this.manaFillMesh.renderOrder = 1101;
    this.hpGroup.add(this.manaFillMesh);
    this._manaPct = -1;
  }

  getHealthBarHeight() {
    return getUnitDef(this.entity.type).healthBarHeight;
  }

  _updateHealthFill(u) {
    const pct = Math.max(0, Math.min(1, u.hp / u.maxHp));
    this._hpPct = pct;
    this.hpFillMesh.scale.x = Math.max(0.001, pct);
    this.hpFillMesh.material = pct > 0.5 ? hpGreenMat : (pct > 0.25 ? hpYellowMat : hpRedMat);
  }

  _updateManaFill(u) {
    const pct = u.maxMana > 0 ? Math.max(0, Math.min(1, u.mana / u.maxMana)) : 0;
    this._manaPct = Math.round(pct * 200);
    this.manaFillMesh.scale.x = Math.max(0.001, pct);
  }

  /** Mostra só a ferramenta de `unit.tool` (machado/picareta/martelo) nos modelos que as têm. */
  _applyTool(tool) {
    const ud = this.root.userData;
    if (tool === 'hammer') {
      if (ud.hammer) {
        ud.hammer.visible = true;
        if (ud.axe) ud.axe.visible = false;
        if (ud.pickaxe) ud.pickaxe.visible = false;
      }
    } else if (ud.axe && ud.pickaxe) {
      const isTree = tool === 'axe';
      ud.axe.visible = isTree;
      ud.pickaxe.visible = !isTree;
      if (ud.hammer) ud.hammer.visible = false;
    }
  }

  _applyCarry(visible, type) {
    const ud = this.root.userData;
    if (ud.pack) {
      ud.pack.visible = visible;
      if (ud.woodBundle) ud.woodBundle.visible = visible && type === 'wood';
      if (ud.goldSack) ud.goldSack.visible = visible && (type === 'gold' || type === 'stone');
    }
  }

  _resetWalkPose() {
    const ud = this.root.userData;
    if (ud.legL) ud.legL.rotation.x = 0;
    if (ud.legR) ud.legR.rotation.x = 0;
    if (ud.armL) ud.armL.rotation.x = 0;
    if (ud.armR) ud.armR.rotation.x = 0;
  }

  _resetPose() {
    this._resetWalkPose();
    const ud = this.root.userData;
    if (ud.toolGroup) ud.toolGroup.rotation.x = 0;
    if (ud.sword) ud.sword.rotation.x = 0.5;
    if (ud.weapon) ud.weapon.rotation.x = 0.5;
  }

  /** F4-04: invisibilidade — aliados do jogador local veem a unidade semi-transparente; inimigos não detectados, nada. */
  _updateInvisible(u) {
    const gm = u.gameManager;
    const localId = gm && typeof gm.localPlayerId === 'number' ? gm.localPlayerId : 0;
    const inv = u.mods.invisible && !u.isDead;
    const seen = !inv || isDetectedBy(gm, u, localId);
    const own = inv && (u.ownerId === localId || (gm && gm.isAlly && gm.isAlly(localId, u.ownerId)));
    this._invHidden = !!inv && !seen;
    const ghost = !!own || (inv && seen);
    if (ghost !== !!this._ghost) {
      this._ghost = ghost;
      this.animator.setGhost(ghost);
    }
  }

  /** Visível agora (simulação: fora da mina/explosão; render: névoa e invisibilidade)? */
  _shown() {
    return this.entity.mesh.visible !== false && !this.fogHidden && !this._invHidden;
  }

  /**
   * F1-09: parte visual, uma vez por quadro renderizado. Interpola a pose `prev → sim` (`alpha`), atualiza o billboard
   * das barras, aplica o LOD de animação por distância/frustum e reproduz a animação pedida pela simulação.
   * @param {number} frameDelta  segundos reais desde o último quadro (0 = pausado)
   * @param {import('./EntityViews.js').EntityViews} ctx  `gm`, `camera`, `alpha` e o frustum de LOD do quadro
   */
  update(frameDelta, ctx) {
    const u = this.entity;
    if (u.canRemove) return;
    const alpha = ctx.alpha;
    if (u.modelSeq !== this._modelSeq) this._swapModel();
    const root = this.root;

    // LOD de animação (F1-09 item 4): frustum + distância à câmera-alvo (sobre a pose do quadro anterior).
    let animDelta = frameDelta;
    let lodStep = 1;
    const frustum = ctx.lodFrustum;
    if (frustum) {
      const visible = this._shown();
      _lodSphere.center.copy(root.position);
      const inView = visible && frustum.intersectsSphere(_lodSphere);
      if (!visible || !inView) {
        // Fora de tela/névoa: não anima; acumula o delta perdido (até 0,5s) para não "saltar" quando reaparecer.
        this._animAcc = Math.min(0.5, (this._animAcc || 0) + frameDelta);
        animDelta = 0;
        lodStep = 0;
      } else if (this._animAcc) {
        animDelta = frameDelta + this._animAcc;
        this._animAcc = 0;
        lodStep = 1;
      } else {
        const dist = ctx.lodTarget.distanceTo(root.position);
        lodStep = animationLodStep(dist, ctx.frameIndex, u.id);
        if (lodStep && dist > 60) {
          // Anima só a cada k frames (k=2 até 100, k=4 acima) — entrega de uma vez o delta de k frames.
          animDelta = frameDelta * (dist <= 100 ? 2 : 4);
        } else if (!lodStep) {
          animDelta = 0;
        }
      }
    }

    // Interpolação de transform (F1-09 item 2): a simulação escreve em `mesh.position`/`rotation.y`; aqui só
    // suavizamos a exibição entre a pose anterior e a atual do tick fixo.
    root.position.lerpVectors(u._prevPos, u._simPos, alpha);
    root.rotation.y = lerpAngle(u._prevRotY, u._simRotY, alpha);

    // F4-04: invisibilidade.
    if (this._ghost || u.mods.invisible) this._updateInvisible(u);
    else this._invHidden = false;
    root.visible = this._shown();

    const gone = u.isDead || u.isDying || u.state === 'dying';

    // Anel de seleção e barras (billboard voltado para a câmera).
    this.selectionRing.visible = !!u.isSelected && !gone;
    syncOutline(this, root, this.selectionRing.visible && root.visible); // F7-03: contorno de seleção (máscara)
    if (gone || !root.visible) {
      this.hpGroup.visible = false;
    } else {
      const barsVisible = u._barsVisible();
      this.hpGroup.visible = barsVisible;
      if (barsVisible) {
        const pct = Math.max(0, Math.min(1, u.hp / u.maxHp));
        if (pct !== this._hpPct) this._updateHealthFill(u);
        if (u.maxMana > 0) {
          this._ensureManaBar();
          this.manaFillMesh.visible = this.manaBgMesh.visible = true;
          if (Math.round(u.mana / u.maxMana * 200) !== this._manaPct) this._updateManaFill(u);
        } else if (this.manaFillMesh) {
          this.manaFillMesh.visible = this.manaBgMesh.visible = false;
        }
        const camera = ctx.camera;
        if (camera) {
          this.hpGroup.position.set(root.position.x, root.position.y + this.getHealthBarHeight(), root.position.z);
          this.hpGroup.quaternion.copy(camera.quaternion);
        }
      }
    }

    // Ferramenta, carga e pose pedidas pela simulação.
    if (u.tool !== this._tool) {
      this._tool = u.tool;
      if (u.tool) this._applyTool(u.tool);
    }
    const carryKey = u.carryVisible ? (u.carrying.type || '') : '#';
    if (carryKey !== this._carryKey) {
      this._carryKey = carryKey;
      this._applyCarry(u.carryVisible, u.carrying.type);
      this.animator.setCarrying(u.carryVisible);
    }
    if (u.poseResetSeq !== this._poseSeq) {
      this._poseSeq = u.poseResetSeq;
      this._resetPose();
    }
    if (u.walkResetSeq !== this._walkSeq) {
      this._walkSeq = u.walkResetSeq;
      this._resetWalkPose();
    }
    const animator = this.animator;
    const restart = u.animRestartSeq !== this._restartSeq;
    this._restartSeq = u.animRestartSeq;
    if (restart || u.anim !== animator.currentAnim) animator.setAnimation(u.anim, restart);
    if (u.animResetSeq !== this._resetSeq) {
      this._resetSeq = u.animResetSeq;
      animator.reset();
    }

    // F4-07b: navios — rampa da barcaça (visual) e esteira de espuma enquanto navega.
    if (u.layer === 'naval') {
      animator.rampOpen = u.rampT > 0 ? 1 : 0;
      if (ctx.particles && u.anim === 'walk' && !u.isDying && this._shown() && frameDelta > 0) {
        this._wakeT = (this._wakeT || 0) - frameDelta;
        if (this._wakeT <= 0) {
          this._wakeT = 0.16;
          const dx = Math.sin(root.rotation.y);
          const dz = Math.cos(root.rotation.y);
          const back = (u.collisionRadius || 1.5) * 1.1;
          _wakePos.set(root.position.x - dx * back, root.position.y + 0.1, root.position.z - dz * back);
          ctx.particles.spawnWake(_wakePos, dx, dz);
        }
      }
    }

    if (u.isDying) {
      animator.setDeathStyle(deathStyleFor(u.lastHitTag), stableVariant(u.id | 0, 2, 7) ? 1 : -1);
      // Afundamento visual pós-colapso (y), com o delta real do quadro (LOD) — não o tick fixo.
      if (u.deathTimer >= 1.0) {
        this._deathSinkOffset += animDelta * 0.35;
        root.position.y -= this._deathSinkOffset;
      }
      if (lodStep > 0) animator.update(animDelta);
      return;
    }

    if (lodStep <= 0) return;

    if (u.state === 'attacking' && u.hurtTimer <= 0 && animator.currentAnim === 'fight') {
      // Progresso contínuo do ataque (attackTimer do último tick + fração do próximo ainda não
      // simulada) — evita o "degrau" de 20 Hz na animação de ataque.
      const t = Math.min(1, (u.attackTimer + alpha * SIM_DT) / u.effAttackCooldown);
      animator.advanceBlend(animDelta);
      animator.setTime(t);
    } else {
      animator.update(animDelta * lodStep);
    }
  }

  /** Tira as malhas da cena. */
  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    resetOutline(this);
    if (this.scene) {
      this.scene.remove(this.root);
      this.scene.remove(this.hpGroup);
    }
  }
}
