import * as THREE from 'three';

/**
 * F1-08: pool de sprites de texto flutuante + cache de texturas por "texto|cor" (LRU).
 *
 * Isolado de canvas/DOM: quem cria a textura de fato (canvas + CanvasTexture) é injetado via
 * `createTexture`, o que permite testar a lógica de pool/cache em Node (sem `document`).
 *
 * - `poolSize` sprites/materiais são criados uma única vez e reutilizados (nunca criados por spawn).
 * - Cache de textura por chave `texto|cor`, limitada a `cacheLimit` entradas; ao exceder, descarta a
 *   entrada menos recentemente usada (LRU) chamando `disposeTexture`.
 * - Pool esgotado (todos os slots ativos): reutiliza o slot mais antigo (menor `order`).
 */
export class FloatingTextPool {
  constructor({ poolSize = 64, cacheLimit = 128, createTexture, disposeTexture, scale = [3.2, 0.8, 1] } = {}) {
    this.poolSize = poolSize;
    this.cacheLimit = cacheLimit;
    this.createTexture = createTexture;
    this.disposeTexture = disposeTexture || (tex => tex?.dispose && tex.dispose());

    this.cache = new Map(); // key -> texture (Map preserva ordem de inserção; usado para LRU)
    this.slots = [];
    this._order = 0;

    for (let i = 0; i < poolSize; i++) {
      const material = new THREE.SpriteMaterial({ transparent: true, depthTest: false, opacity: 0 });
      const sprite = new THREE.Sprite(material);
      sprite.scale.set(scale[0], scale[1], scale[2]);
      sprite.visible = false;
      this.slots.push({ sprite, material, key: null, active: false, life: 0, maxLife: 0, order: 0 });
    }
  }

  _getTexture(key, text, color) {
    let tex = this.cache.get(key);
    if (tex !== undefined) {
      // Refresca a posição no Map (mais recentemente usado)
      this.cache.delete(key);
      this.cache.set(key, tex);
      return tex;
    }
    tex = this.createTexture(text, color);
    this.cache.set(key, tex);
    if (this.cache.size > this.cacheLimit) {
      const oldestKey = this.cache.keys().next().value;
      const oldestTex = this.cache.get(oldestKey);
      this.cache.delete(oldestKey);
      this.disposeTexture(oldestTex);
    }
    return tex;
  }

  _acquireSlot() {
    let slot = this.slots.find(s => !s.active);
    if (!slot) {
      slot = this.slots[0];
      for (const s of this.slots) {
        if (s.order < slot.order) slot = s;
      }
    }
    slot.active = true;
    slot.order = ++this._order;
    return slot;
  }

  /** Número de slots atualmente ativos (nunca excede `poolSize`). */
  activeCount() {
    let n = 0;
    for (const s of this.slots) if (s.active) n++;
    return n;
  }

  /** Aloca (ou reutiliza) um slot para exibir `text` na cor `color`, na posição `pos` (+ offsetY). */
  spawn(text, pos, color, life = 1.4, offsetY = 1.8) {
    const key = `${text}|${color}`;
    const texture = this._getTexture(key, text, color);
    const slot = this._acquireSlot();
    slot.key = key;
    slot.material.map = texture;
    slot.material.opacity = 1;
    slot.material.needsUpdate = true;
    slot.sprite.position.copy(pos);
    slot.sprite.position.y += offsetY;
    slot.sprite.visible = true;
    slot.life = life;
    slot.maxLife = life;
    return slot;
  }

  /** Avança a vida dos slots ativos; libera (visible=false) os que expiraram. */
  update(delta) {
    for (const slot of this.slots) {
      if (!slot.active) continue;
      slot.life -= delta;
      slot.sprite.position.y += delta * 1.2;
      slot.material.opacity = Math.min(1.0, slot.life / 0.5);
      if (slot.life <= 0) {
        slot.active = false;
        slot.sprite.visible = false;
        slot.material.opacity = 0;
      }
    }
  }

  /** Desativa todos os slots (sem descartar texturas do cache). */
  clear() {
    for (const slot of this.slots) {
      slot.active = false;
      slot.sprite.visible = false;
      slot.material.opacity = 0;
    }
  }

  /** Desativa slots e descarta todas as texturas em cache. */
  dispose() {
    this.clear();
    for (const tex of this.cache.values()) this.disposeTexture(tex);
    this.cache.clear();
  }
}
