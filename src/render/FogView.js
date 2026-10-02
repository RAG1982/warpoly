import * as THREE from 'three';
import { fogUniforms, excludeFromFog, markFogGround, resetFogTexture } from './fogOfWarShader.js';
import { QualitySettings } from '../core/QualitySettings.js';
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
 * FogView (F2-08b): parte visual da névoa de guerra (F1-05). A lógica (grade 128², memória de construções,
 * revelações) vive em `src/sim/FogOfWar.js`; aqui ficam a textura de visibilidade + shader, o minimapa,
 * os fantasmas de construções destruídas e o esconder/mostrar das malhas inimigas.
 *
 * O mundo é escurecido no próprio shader dos materiais (`fogOfWarShader.js`), sem plano sobreposto.
 * A textura só é reenviada à GPU quando a sim sinaliza `fog.textureDirty`.
 *
 * Entidades inimigas: unidades só são desenhadas (e aparecem no minimapa) com visão atual; barras de vida idem;
 * construções já vistas ficam na memória; se destruídas fora da visão, um fantasma permanece até a área ser
 * revista (como no WC2). Recursos e árvores exploradas seguem visíveis (escurecidos) na memória.
 */
export class FogView {
  /** Raio (u) a partir do qual uma malha é tratada como chão pela névoa. */
  static GROUND_MIN_RADIUS = 25;

  /**
   * @param {import('../sim/FogOfWar.js').FogOfWar} fog
   * @param {THREE.Scene} scene
   */
  constructor(fog, scene) {
    this.fog = fog;
    this.scene = scene;
    this.gridSize = fog.gridSize;

    /** Construções destruídas fora da visão, ainda lembradas */
    this.ghostGroup = new THREE.Group();
    this.ghostGroup.name = 'FogOfWarGhosts';
    this.scene.add(this.ghostGroup);

    // Camada do minimapa (128², 3 estados)
    this.canvas = null;
    this.ctx = null;
    this._minimapImage = null;
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

    fogUniforms.fowParams.value.set(1 / fog.worldWidth, 1 / fog.worldDepth, 1, 0.5);
  }

  /**
   * Marca como "chão" as malhas não instanciadas cuja esfera envolvente é maior que `minRadius`
   * (terreno, água, fundo do mar): a origem delas não representa a posição, então não podem ser recolhidas.
   */
  markGroundMeshes(root, minRadius = FogView.GROUND_MIN_RADIUS) {
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

  /** (Re)cria a textura conforme o preset de qualidade (resolução e blur). */
  applyQuality(preset) {
    const cfg = FOG_QUALITY[preset && preset.name] || FOG_QUALITY.high;
    this._quality = preset;
    this._scale = cfg.scale;
    this._blur = cfg.blur;
    const size = this.gridSize * cfg.scale;
    if (this.fogTexture && this.fogTexture.image.width === size) {
      this.fog.grid.needsUpdate = true;
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
    this.fog.grid.needsUpdate = true;
    this._uploadTexture();
  }

  _uploadTexture() {
    this.fog.grid.writeTexture(this.texData, this._scale, this._blur);
    this.fogTexture.needsUpdate = true;
    this.fog.minimapDirty = true;
  }

  /**
   * Um quadro: qualidade, upload da textura se a grade mudou, fantasmas, anéis de seleção e visibilidade das
   * entidades inimigas (aplicada todo quadro, para as barras de vida não piscarem).
   */
  update(playerUnits, playerBuildings, enemyUnits = [], enemyBuildings = []) {
    const fog = this.fog;
    if (this._quality !== QualitySettings.current) this.applyQuality(QualitySettings.current);
    fogUniforms.fowParams.value.z = fog.enabled ? 1 : 0;
    if (fog.textureDirty) {
      fog.textureDirty = false;
      this._uploadTexture();
    }
    if (fog.removedGhosts.length > 0) {
      for (let i = 0; i < fog.removedGhosts.length; i++) this._removeGhost(fog.removedGhosts[i]);
      fog.removedGhosts.length = 0;
    }
    if (fog.newGhosts.length > 0) {
      for (let i = 0; i < fog.newGhosts.length; i++) this._addGhost(fog.newGhosts[i]);
      fog.newGhosts.length = 0;
    }
    this._excludeSelectionRingsFromFog(playerUnits, enemyUnits, playerBuildings, enemyBuildings);
    this.cullHiddenEnemies(enemyUnits, enemyBuildings);
  }

  /**
   * Anéis de seleção (materiais compartilhados de `Unit`/`Building`, não exportados) não devem
   * escurecer com a névoa: marcamos os materiais a partir de uma instância viva (`excludeFromFog` é
   * idempotente e barato — `userData.noFog`).
   */
  _excludeSelectionRingsFromFog(playerUnits, enemyUnits, playerBuildings, enemyBuildings) {
    if (playerUnits[0]?.selectionRing) excludeFromFog(playerUnits[0].selectionRing);
    if (enemyUnits[0]?.selectionRing) excludeFromFog(enemyUnits[0].selectionRing);
    if (playerBuildings[0]?.selectionRing) excludeFromFog(playerBuildings[0].selectionRing);
    if (enemyBuildings[0]?.selectionRing) excludeFromFog(enemyBuildings[0].selectionRing);
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
    const fog = this.fog;
    const on = fog.enabled;
    for (let i = 0; i < enemyUnits.length; i++) {
      const u = enemyUnits[i];
      if (!u || !u.mesh) continue;
      const visible = !on || fog.grid.isVisible(u.mesh.position.x, u.mesh.position.z);
      u.mesh.visible = visible;
      if (!visible && u.hpGroup) u.hpGroup.visible = false;
    }
    for (let i = 0; i < enemyBuildings.length; i++) {
      const b = enemyBuildings[i];
      if (!b || !b.mesh || b.isDead) continue;
      const known = !on || fog.buildingMemory.isKnown(b);
      b.mesh.visible = known;
      if (b.hpGroup && on && !fog.isBuildingVisibleNow(b)) b.hpGroup.visible = false;
    }
  }

  /** Desenha a camada de névoa (3 estados) sobre o minimapa. */
  drawMinimapFog(minimapCtx, mapWidth, mapHeight) {
    if (!this.canvas || !this.fog.enabled) return;
    if (this.fog.minimapDirty) {
      this.fog.grid.writeMinimap(this._minimapImage.data);
      this.ctx.putImageData(this._minimapImage, 0, 0);
      this.fog.minimapDirty = false;
    }
    minimapCtx.save();
    minimapCtx.imageSmoothingEnabled = true;
    minimapCtx.drawImage(this.canvas, 0, 0, this.gridSize, this.gridSize, 0, 0, mapWidth, mapHeight);
    minimapCtx.restore();
  }

  dispose() {
    for (const b of this.fog.buildingMemory.clear()) this._removeGhost(b);
    if (this.ghostGroup.parent) this.ghostGroup.parent.remove(this.ghostGroup);
    if (this.fogTexture) this.fogTexture.dispose();
    this.fogTexture = null;
    // O uniform é compartilhado por todos os materiais com névoa (patch global): sem isto, a
    // próxima partida (2ª MatchSession) herdaria a textura já descartada desta.
    resetFogTexture();
    fogUniforms.fowParams.value.z = 0;
  }
}
