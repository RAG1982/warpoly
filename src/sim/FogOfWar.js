import { VISION_RADII, DEFAULT_UNIT, DEFAULT_BUILDING } from '../data/index.js';
import { FogGrid, BuildingMemory } from './FogGrid.js';

/**
 * Névoa de guerra — parte de SIMULAÇÃO (F1-05 / F2-08b). Só dados: sem three.js, sem DOM.
 *
 * Três estados por célula da grade lógica 128² (atualizada a 10 Hz):
 *   não explorado · memória (explorado sem visão) · visível agora.
 * A textura/shader, o minimapa, os fantasmas de construções destruídas e o esconder/mostrar malhas inimigas
 * ficam em `src/render/FogView.js`, que lê esta classe a cada quadro (flags `textureDirty`, filas de fantasmas).
 *
 * API: `update(dt, playerUnits, playerBuildings, enemyUnits, enemyBuildings)`, `isExplored(x,z)`, `isVisible(x,z)`,
 * `revealArea(x,z,r,ttl?)`, `isBuildingKnown(b)`, `forEachGhostBuilding(cb)`, `setEnabled(on)`, `reset()`.
 */
export class FogOfWar {
  /** F4-04b: máximo de revelações temporárias simultâneas (a mais antiga é substituída). */
  static MAX_TIMED_REVEALS = 16;

  constructor(worldWidth = 140, worldDepth = 140) {
    this.worldWidth = worldWidth;
    this.worldDepth = worldDepth;

    // Grade lógica (128² cobre 160×160 com 1,25 u por célula)
    this.grid = new FogGrid(worldWidth, worldDepth, 128);
    this.gridSize = this.grid.gridSize;
    this.cellSize = this.grid.cellSize;

    // Vision radii by entity type — src/data (units.js / buildings.js)
    this.visionRadii = { ...VISION_RADII };

    this.buildingMemory = new BuildingMemory();

    this.updateTimer = 0;
    this.enabled = true;
    /** F4-04b: revelações temporárias (Vista Sagrada) — pool fixo, sem alocar por quadro. */
    this._timedReveals = [];
    for (let i = 0; i < FogOfWar.MAX_TIMED_REVEALS; i++) this._timedReveals.push({ x: 0, z: 0, r: 0, ttl: 0 });

    // Sinais para a view (consumidos e zerados por `FogView.update`).
    /** A grade mudou: reenviar a textura de visibilidade à GPU. */
    this.textureDirty = false;
    /** O minimapa precisa ser redesenhado. */
    this.minimapDirty = true;
    /** Construções inimigas recém-destruídas fora da visão (a view guarda o modelo como lembrança). */
    this.newGhosts = [];
    /** Fantasmas a remover (área revista ou memória apagada). */
    this.removedGhosts = [];
  }

  // --- Compatibilidade: campos que o GameManager manipula diretamente -----------------------------
  get explored() { return this.grid.explored; }
  get activeVision() { return this.grid.activeVision; }
  get needsUpdate() { return this.grid.needsUpdate; }
  set needsUpdate(v) {
    this.grid.needsUpdate = !!v;
    if (v) this.minimapDirty = true;
  }

  /** Liga/desliga a névoa (debug: `game.gameManager.fogOfWar.setEnabled(false)`). */
  setEnabled(on) {
    this.enabled = !!on;
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
    if (this.grid.revealArea(wx, wz, radius)) this.minimapDirty = true;
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

  /** Construção inimiga visível agora (não só lembrada)? */
  isBuildingVisibleNow(b) {
    return this.buildingMemory.isVisibleNow(b);
  }

  /** Itera sobre fantasmas de construções destruídas fora da visão: cb(building, {x,z}). */
  forEachGhostBuilding(cb) {
    this.buildingMemory.forEachGhost(cb);
  }

  _dropMemory() {
    for (const b of this.buildingMemory.clear()) this.removedGhosts.push(b);
  }

  /** Esquece exploração, visão e memória (novo mapa). */
  reset() {
    this.grid.reset();
    this._dropMemory();
    this.minimapDirty = true;
  }

  /**
   * Tick de simulação. A grade é recalculada a 10 Hz (acumulando `delta`); só números e sinais para a view.
   * `enemyUnits` é aceito por compatibilidade (o esconder de malhas inimigas é da `FogView`).
   */
  update(delta, playerUnits, playerBuildings, enemyUnits = [], enemyBuildings = []) {
    for (let i = 0; i < this._timedReveals.length; i++) {
      const t = this._timedReveals[i];
      if (t.ttl > 0) t.ttl -= delta;
    }
    this.updateTimer += delta;
    if (this.updateTimer >= 0.1) {
      this.updateTimer = 0;
      this._tickGrid(playerUnits, playerBuildings, enemyBuildings);
    }
  }

  _tickGrid(playerUnits, playerBuildings, enemyBuildings) {
    const grid = this.grid;
    // Reset externo (GameManager.resetMap zera `explored` direto): esquece a memória também
    if (grid.needsUpdate && grid.detectExternalReset()) this._dropMemory();

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
    if (grid.endVision()) this.textureDirty = true;

    // Memória de construções inimigas + fantasmas
    const { newGhosts, removedGhosts } = this.buildingMemory.update(grid, enemyBuildings);
    for (let i = 0; i < newGhosts.length; i++) this.newGhosts.push(newGhosts[i]);
    for (let i = 0; i < removedGhosts.length; i++) this.removedGhosts.push(removedGhosts[i]);
  }

  /** Nada a liberar na simulação (a textura e a cena são da `FogView`). */
  dispose() {
    this.buildingMemory.clear();
    this.newGhosts.length = 0;
    this.removedGhosts.length = 0;
  }
}
