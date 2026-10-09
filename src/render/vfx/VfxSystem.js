/**
 * VfxSystem.js (F7-05) — fachada dos VFX de partículas GPU: pools (VfxLayer), cadáveres que decaem (CorpseDecals) e
 * rastreador de estágios de obra. Criada pela `MatchSession` (nunca em headless) e alimentada por `VfxEvents`
 * (descritores de `vfxMapping.js`). 100% apresentação: lê a sim (posições, progresso de obra) mas não escreve nela.
 */
import { VfxLayer } from './VfxLayer.js';
import { CorpseDecals } from './CorpseDecals.js';
import { playFx } from './vfxEmitters.js';
import { VFX_CAPS, createRenderRng } from './vfxConfig.js';
import { constructionStage, constructionStageEffect } from './vfxMapping.js';
import { getBuildingDef } from '../../data/index.js';

export class VfxSystem {
  /**
   * @param {THREE.Scene} scene
   * @param {'off'|'low'|'med'|'high'} level
   * @param {object|null} [gm] simulação (opcional; só leitura) — habilita as pegadas de obra por estágio
   */
  constructor(scene, level, gm = null) {
    this.level = level;
    this.gm = gm;
    this.rng = createRenderRng();
    this.layer = new VfxLayer(scene, level);
    this.corpses = new CorpseDecals(scene, VFX_CAPS[level] ? VFX_CAPS[level].corpses : 0);
    this._stages = new Map(); // buildingId -> último estágio visto (só obras em andamento)
    this._acc = 0;
  }

  get enabled() { return this.layer.enabled; }

  /** Executa um descritor de `effectsForEvent`. */
  play(d) {
    if (!this.layer.enabled) return;
    if (d.fx === 'corpse') {
      this.corpses.add(d.pos.x, d.pos.y, d.pos.z, this.rng() * 6.283, d.color);
      return;
    }
    playFx(this.layer, this.rng, d);
  }

  update(delta) {
    if (!this.layer.enabled) return;
    this.layer.update(delta);
    this.corpses.update(delta);
    this._acc += delta;
    if (this._acc >= 0.25) { // rastreia obras 4x por segundo
      this._acc = 0;
      this._trackConstruction();
    }
  }

  _trackConstruction() {
    const gm = this.gm;
    if (!gm || !gm.buildings) return;
    const list = gm.buildings;
    const fog = gm.fogOfWar;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (b.isConstructed || b.isDead || !b.mesh) {
        if (this._stages.size && this._stages.has(b.id)) this._stages.delete(b.id);
        continue;
      }
      const st = constructionStage(b.buildProgress);
      const prev = this._stages.get(b.id);
      this._stages.set(b.id, st);
      if (prev === undefined || st <= prev) continue;
      const p = b.mesh.position;
      if (b.ownerId !== gm.localPlayerId && fog && !fog.isVisible(p.x, p.z)) continue;
      const def = getBuildingDef(b.type);
      this.play(constructionStageEffect(p, (def && def.collisionRadius) || 2, st));
    }
  }

  stats() {
    const s = this.layer.stats();
    s.corpses = this.corpses.count;
    return s;
  }

  clear() {
    this.layer.clear();
    this.corpses.clear();
    this._stages.clear();
  }

  dispose() {
    this.layer.dispose();
    this.corpses.dispose();
    this._stages.clear();
  }
}
