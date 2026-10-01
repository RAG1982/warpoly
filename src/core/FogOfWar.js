import * as THREE from 'three';
import { VISION_RADII, DEFAULT_UNIT, DEFAULT_BUILDING } from '../data/index.js';
import { FogGrid, BuildingMemory } from './FogGrid.js';
import { fogUniforms, excludeFromFog, markFogGround, resetFogTexture } from '../render/fogOfWarShader.js';
import { QualitySettings } from './QualitySettings.js';
import { ModelFactory } from '../entities/ModelFactory.js';

/**
 * Configuração da textura de visibilidade por preset de qualidade (F1-04).
 * `scale`: resolução da textura = grade lógica (128²) × scale; `blur`: raio do blur de caixa em texels.
 */
export const FOG_QUALITY = {
  low: { scale: 1, blur: 0 },
  med: { scale: 2, blur: 2 },
  high: { scale: 2, blur: 2 },
  ultra: { scale: 2, blur: 3 }
};

/**
 * Névoa de guerra no estilo Warcraft II (F1-05).
 *
 * Três estados por célula da grade lógica 128² (atualizada a 10 Hz):
 *   não explorado (preto) · memória (explorado sem visão: dessaturado/escuro) · visível agora (claro).
 * O mundo é escurecido no próprio shader dos materiais (`src/render/fogOfWarShader.js`), sem plano sobreposto:
 * nada "atravessa" a névoa. A textura de visibilidade só é reenviada à GPU quando a visão/exploração muda.
 *
 * Entidades inimigas:
 *   - unidades só são desenhadas (e aparecem no minimapa) com visão atual; barras de vida idem;
 *   - construções já vistas ficam na memória; se destruídas fora da visão, um fantasma permanece
 *     até a área ser revista (como no WC2).
 * Recursos e árvores exploradas seguem visíveis (escurecidos) na memória.
 *
 * API pública: `update(dt, playerUnits, playerBuildings, enemyUnits, enemyBuildings)`, `isExplored(x,z)`,
 * `isVisible(x,z)`, `revealArea(x,z,r)`, `isBuildingKnown(b)`, `forEachGhostBuilding(cb)`, `drawMinimapFog(ctx,w,h)`,
 * `reset()`, `dispose()`.
 */
export class FogOfWar {
  /** Raio (u) a partir do qual uma malha é tratada como chão pela névoa. */
  static GROUND_MIN_RADIUS = 25;
  /** F4-04b: máximo de revelações temporárias simultâneas (a mais antiga é substituída). */
  static MAX_TIMED_REVEALS = 16;

  constructor(scene, worldWidth = 140, worldDepth = 140) {
    this.scene = scene;
    this.worldWidth = worldWidth;
    this.worldDepth = worldDepth;

    // Grade lógica (128² cobre 160×160 com 1,25 u por célula)
    this.grid = new FogGrid(worldWidth, worldDepth, 128);
    this.gridSize = this.grid.gridSize;
    this.cellSize = this.grid.cellSize;

    // Vision radii by entity type — src/data (units.js / buildings.js)
    this.visionRadii = { ...VISION_RADII };

    this.buildingMemory = new BuildingMemory();
    /** Construções inimigas destruídas fora da visão, ainda lembradas */
    this.ghostGroup = new THREE.Group();
    this.ghostGroup.name = 'FogOfWarGhosts';
    this.scene.add(this.ghostGroup);

    this.updateTimer = 0;
    this.enabled = true;
    /** F4-04b: revelações temporárias (Vista Sagrada) — pool fixo, sem alocar por quadro. */
    this._timedReveals = [];
    for (let i = 0; i < FogOfWar.MAX_TIMED_REVEALS; i++) this._timedReveals.push({ x: 0, z: 0, r: 0, ttl: 0 });

    // Camada do minimapa (128², 3 estados)
    this.canvas = null;
    this.ctx = null;
    this._minimapImage = null;
    this._minimapDirty = true;
    if (typeof document !== 'undefined') {
      this.canvas = document.createElement('canvas');
      this.canvas.width = this.gridSize;
      this.canvas.height = this.gridSize;
      this.ctx = this.canvas.getContext('2d');
      this._minimapImage = this.ctx.createImageData(this.gridSize, this.gridSize);
    }

    // Textura de visibilidade (RG: explorado / visível com blur; BA: os mesmos sem blur)
    this.fogTexture = null;
    this._quality = null;
    this.applyQuality(QualitySettings.current);

    // Fantasma de posicionamento de construção nunca recebe névoa
    excludeFromFog(ModelFactory.ghostValidMat);
    excludeFromFog(ModelFactory.ghostInvalidMat);
    // Terreno e água (malhas enormes centradas na origem) só escurecem por fragmento
    this.markGroundMeshes(scene);

    fogUniforms.fowParams.value.set(1 / worldWidth, 1 / worldDepth, 1, 0.5);
  }

  /**
   * Marca como "chão" as malhas não instanciadas cuja esfera envolvente é maior que `minRadius`
   * (terreno, água, fundo do mar): a origem delas não representa a posição, então não podem ser recolhidas.
   */
  markGroundMeshes(root, minRadius = FogOfWar.GROUND_MIN_RADIUS) {
    const found = [];
    root.traverse(o => {
      if (!o.isMesh || o.isInstancedMesh || o.isBatchedMesh || !o.geometry) return;
      const g = o.geometry;
      if (!g.boundingSphere) g.computeBoundingSphere();
      const scale = Math.max(o.scale.x, o.scale.y, o.scale.z);
      if (g.boundingSphere.radius * scale >= minRadius) {
        markFogGround(o);
        found.push(o.name || o.uuid);
      }
    });
    this.groundMeshes = found;
    return found;
  }

  // --- Compatibilidade: campos que o GameManager manipula diretamente -----------------------------
  get explored() { return this.grid.explored; }
  get activeVision() { return this.grid.activeVision; }
  get needsUpdate() { return this.grid.needsUpdate; }
  set needsUpdate(v) {
    this.grid.needsUpdate = !!v;
    if (v) this._minimapDirty = true;
  }

  /** (Re)cria a textura conforme o preset de qualidade (resolução e blur). */
  applyQuality(preset) {
    const cfg = FOG_QUALITY[preset && preset.name] || FOG_QUALITY.high;
    this._quality = preset;
    this._scale = cfg.scale;
    this._blur = cfg.blur;
    const size = this.gridSize * cfg.scale;
    if (this.fogTexture && this.fogTexture.image.width === size) {
      this.grid.needsUpdate = true;
      return;
    }
    if (this.fogTexture) this.fogTexture.dispose();
    this.texData = new Uint8Array(size * size * 4);
    const tex = new THREE.DataTexture(this.texData, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.generateMipmaps = false;
    tex.name = 'FogOfWarVisibility';
    this.fogTexture = tex;
    fogUniforms.fowMap.value = tex;
    this.grid.needsUpdate = true;
    this._uploadTexture();
  }

  _uploadTexture() {
    this.grid.writeTexture(this.texData, this._scale, this._blur);
    this.fogTexture.needsUpdate = true;
    this._minimapDirty = true;
  }

  /** Liga/desliga a névoa (debug: `game.gameManager.fogOfWar.setEnabled(false)`). */
  setEnabled(on) {
    this.enabled = !!on;
    fogUniforms.fowParams.value.z = this.enabled ? 1 : 0;
  }

  worldToGrid(wx, wz) {
    return this.grid.worldToGrid(wx, wz);
  }

  /** A posição já foi explorada (visível agora ou memória)? */
  isExplored(wx, wz) {
    return !this.enabled || this.grid.isExplored(wx, wz);
  }

  /** A posição está sob visão atual do jogador? */
  isVisible(wx, wz) {
    return !this.enabled || this.grid.isVisible(wx, wz);
  }

  /**
   * Revela uma área (visão atual + exploração permanente). F4-04b: com `ttl` (s) a visão atual da área persiste
   * por esse tempo (Vista Sagrada), reaplicada a cada tick da grade; sem `ttl`, vale só até o próximo tick.
   */
  revealArea(wx, wz, radius, ttl = 0) {
    if (ttl > 0) {
      const list = this._timedReveals;
      let slot = list[0];
      for (let i = 0; i < list.length; i++) {
        if (list[i].ttl <= 0) { slot = list[i]; break; }
        if (list[i].ttl < slot.ttl) slot = list[i];
      }
      slot.x = wx; slot.z = wz; slot.r = radius; slot.ttl = ttl;
      this.grid.needsUpdate = true;
    }
    if (this.grid.revealArea(wx, wz, radius)) this._minimapDirty = true;
  }

  /** F4-04b: há revelações temporárias ativas? */
  get hasTimedReveals() {
    for (let i = 0; i < this._timedReveals.length; i++) if (this._timedReveals[i].ttl > 0) return true;
    return false;
  }

  /** Construção inimiga conhecida (visível agora ou lembrada)? */
  isBuildingKnown(b) {
    return !this.enabled || this.buildingMemory.isKnown(b);
  }

  /** Itera sobre fantasmas de construções destruídas fora da visão: cb(building, {x,z}). */
  forEachGhostBuilding(cb) {
    this.buildingMemory.forEachGhost(cb);
  }

  /** Esquece exploração, visão e memória (novo mapa). */
  reset() {
    this.grid.reset();
    for (const b of this.buildingMemory.clear()) this._removeGhost(b);
    this._minimapDirty = true;
  }

  /**
   * Tick principal (chamado pelo GameManager todo frame).
   * A grade é recalculada a 10 Hz; a visibilidade das entidades é aplicada todo frame (barato),
   * para as barras de vida não piscarem.
   */
  update(delta, playerUnits, playerBuildings, enemyUnits = [], enemyBuildings = []) {
    if (this._quality !== QualitySettings.current) this.applyQuality(QualitySettings.current);

    for (let i = 0; i < this._timedReveals.length; i++) {
      const t = this._timedReveals[i];
      if (t.ttl > 0) t.ttl -= delta;
    }
    this.updateTimer += delta;
    if (this.updateTimer >= 0.1) {
      this.updateTimer = 0;
      this._tickGrid(playerUnits, playerBuildings, enemyBuildings);
    }
    this._excludeSelectionRingsFromFog(playerUnits, enemyUnits, playerBuildings, enemyBuildings);
    this.cullHiddenEnemies(enemyUnits, enemyBuildings);
  }

  /**
   * Anéis de seleção (materiais compartilhados de `Unit`/`Building`, não exportados) não devem
   * escurecer com a névoa. Como não podemos editar `Unit.js`/`Building.js`, marcamos os materiais
   * a partir de uma instância viva; `excludeFromFog` é idempotente e barato (`userData.noFog`).
   */
  _excludeSelectionRingsFromFog(playerUnits, enemyUnits, playerBuildings, enemyBuildings) {
    if (playerUnits[0]?.selectionRing) excludeFromFog(playerUnits[0].selectionRing);
    if (enemyUnits[0]?.selectionRing) excludeFromFog(enemyUnits[0].selectionRing);
    if (playerBuildings[0]?.selectionRing) excludeFromFog(playerBuildings[0].selectionRing);
    if (enemyBuildings[0]?.selectionRing) excludeFromFog(enemyBuildings[0].selectionRing);
  }

  _tickGrid(playerUnits, playerBuildings, enemyBuildings) {
    const grid = this.grid;
    // Reset externo (GameManager.resetMap zera `explored` direto): esquece a memória também
    if (grid.needsUpdate && grid.detectExternalReset()) {
      for (const b of this.buildingMemory.clear()) this._removeGhost(b);
    }

    grid.beginVision();
    for (let i = 0; i < playerUnits.length; i++) {
      const u = playerUnits[i];
      if (!u.isDead && u.mesh) {
        grid.revealArea(u.mesh.position.x, u.mesh.position.z, (this.visionRadii[u.type] || DEFAULT_UNIT.visionRadius) + (u.sightBonus || 0));
      }
    }
    for (let i = 0; i < playerBuildings.length; i++) {
      const b = playerBuildings[i];
      if (!b.isDead && b.mesh) {
        grid.revealArea(b.mesh.position.x, b.mesh.position.z, this.visionRadii[b.type] || DEFAULT_BUILDING.visionRadius);
      }
    }
    for (let i = 0; i < this._timedReveals.length; i++) {
      const t = this._timedReveals[i];
      if (t.ttl > 0) grid.revealArea(t.x, t.z, t.r);
    }
    if (grid.endVision()) this._uploadTexture();

    // Memória de construções inimigas + fantasmas
    const { newGhosts, removedGhosts } = this.buildingMemory.update(grid, enemyBuildings);
    for (let i = 0; i < newGhosts.length; i++) this._addGhost(newGhosts[i]);
    for (let i = 0; i < removedGhosts.length; i++) this._removeGhost(removedGhosts[i]);
  }

  /** Mantém o modelo da construção destruída na cena, como lembrança (não entra em listas de seleção). */
  _addGhost(b) {
    const mesh = b.mesh;
    if (!mesh) return;
    if (!mesh.parent) this.ghostGroup.add(mesh);
    mesh.visible = true;
    if (b.hpGroup) b.hpGroup.visible = false;
    if (b.selectionRing) b.selectionRing.visible = false;
  }

  _removeGhost(b) {
    const mesh = b.mesh;
    if (mesh && mesh.parent === this.ghostGroup) this.ghostGroup.remove(mesh);
  }

  /**
   * Visibilidade das entidades inimigas (substitui o antigo `cullUnexploredEnemies`, bug B1):
   * unidades só com visão atual; construções vistas ficam na memória, sem barra de vida.
   */
  cullHiddenEnemies(enemyUnits, enemyBuildings) {
    const on = this.enabled;
    for (let i = 0; i < enemyUnits.length; i++) {
      const u = enemyUnits[i];
      if (!u || !u.mesh) continue;
      const visible = !on || this.grid.isVisible(u.mesh.position.x, u.mesh.position.z);
      u.mesh.visible = visible;
      if (!visible && u.hpGroup) u.hpGroup.visible = false;
    }
    for (let i = 0; i < enemyBuildings.length; i++) {
      const b = enemyBuildings[i];
      if (!b || !b.mesh || b.isDead) continue;
      const known = !on || this.buildingMemory.isKnown(b);
      b.mesh.visible = known;
      if (b.hpGroup && on && !this.buildingMemory.isVisibleNow(b)) b.hpGroup.visible = false;
    }
  }

  /** @deprecated nome antigo — use `cullHiddenEnemies`. */
  cullUnexploredEnemies(enemyUnits, enemyBuildings) {
    this.cullHiddenEnemies(enemyUnits, enemyBuildings);
  }

  /** Desenha a camada de névoa (3 estados) sobre o minimapa. */
  drawMinimapFog(minimapCtx, mapWidth, mapHeight) {
    if (!this.canvas || !this.enabled) return;
    if (this._minimapDirty) {
      this.grid.writeMinimap(this._minimapImage.data);
      this.ctx.putImageData(this._minimapImage, 0, 0);
      this._minimapDirty = false;
    }
    minimapCtx.save();
    minimapCtx.imageSmoothingEnabled = true;
    minimapCtx.drawImage(this.canvas, 0, 0, this.gridSize, this.gridSize, 0, 0, mapWidth, mapHeight);
    minimapCtx.restore();
  }

  dispose() {
    for (const b of this.buildingMemory.clear()) this._removeGhost(b);
    if (this.ghostGroup.parent) this.ghostGroup.parent.remove(this.ghostGroup);
    if (this.fogTexture) this.fogTexture.dispose();
    this.fogTexture = null;
    // O uniform é compartilhado por todos os materiais com névoa (patch global): sem isto, a
    // próxima partida (2ª MatchSession) herdaria a textura já descartada desta.
    resetFogTexture();
    fogUniforms.fowParams.value.z = 0;
  }
}
