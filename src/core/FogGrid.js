/**
 * Lógica pura da névoa de guerra (F1-05) — sem three.js e sem DOM, testável no Vitest.
 *
 * - `FogGrid`: grade lógica N×N (padrão 128²) com dois bits por célula:
 *   `explored` (permanente) e `activeVision` (visão atual, recalculada a cada tick de 10 Hz).
 *   Estados: 0 = não explorado, 1 = memória (explorado sem visão), 2 = visível agora.
 *   Também gera os dados da textura de visibilidade (R = explorado, G = visível, com blur opcional)
 *   e a camada RGBA do minimapa.
 * - `BuildingMemory`: "fantasmas" de construções inimigas (como no Warcraft II): uma construção já vista
 *   continua na memória; se for destruída fora da visão, o fantasma fica até a área ser revista.
 */

export const FOG_UNEXPLORED = 0;
export const FOG_MEMORY = 1;
export const FOG_VISIBLE = 2;

export class FogGrid {
  /**
   * @param {number} worldWidth  largura do mundo coberto (centrado na origem)
   * @param {number} worldDepth  profundidade do mundo coberto
   * @param {number} [gridSize=128]
   */
  constructor(worldWidth, worldDepth, gridSize = 128) {
    this.worldWidth = worldWidth;
    this.worldDepth = worldDepth;
    this.gridSize = gridSize;
    this.cellSize = worldWidth / gridSize;
    this.explored = new Uint8Array(gridSize * gridSize);
    this.activeVision = new Uint8Array(gridSize * gridSize);
    this._lastVision = new Uint8Array(gridSize * gridSize);
    /** Nº de células exploradas contadas por `revealArea` (detecta `explored.fill(0)` feito por fora). */
    this.exploredCount = 0;
    /** true quando algo mudou desde a última geração da textura (explorado novo, reset externo…) */
    this.needsUpdate = true;
    // buffers de trabalho do blur (alocados sob demanda)
    this._tmp = null;
  }

  /** Índice da célula que contém (wx, wz), com clamp nas bordas. */
  cellIndex(wx, wz) {
    const n = this.gridSize;
    let gx = Math.floor(((wx + this.worldWidth / 2) / this.worldWidth) * n);
    let gz = Math.floor(((wz + this.worldDepth / 2) / this.worldDepth) * n);
    if (gx < 0) gx = 0; else if (gx >= n) gx = n - 1;
    if (gz < 0) gz = 0; else if (gz >= n) gz = n - 1;
    return gz * n + gx;
  }

  /** Coordenadas de grade (compatibilidade com a API antiga). */
  worldToGrid(wx, wz) {
    const idx = this.cellIndex(wx, wz);
    return { gx: idx % this.gridSize, gz: (idx / this.gridSize) | 0 };
  }

  isExplored(wx, wz) {
    return this.explored[this.cellIndex(wx, wz)] === 1;
  }

  isVisible(wx, wz) {
    return this.activeVision[this.cellIndex(wx, wz)] === 1;
  }

  /** @returns {0|1|2} FOG_UNEXPLORED | FOG_MEMORY | FOG_VISIBLE */
  stateAt(wx, wz) {
    const i = this.cellIndex(wx, wz);
    if (this.activeVision[i] === 1) return FOG_VISIBLE;
    return this.explored[i] === 1 ? FOG_MEMORY : FOG_UNEXPLORED;
  }

  /**
   * Alguma célula de uma área circular está visível agora? Amostra o centro e 8 pontos no raio×0,7
   * (suficiente para prédios: basta ver uma parte da construção).
   */
  isAreaVisible(wx, wz, radius = 0) {
    if (this.isVisible(wx, wz)) return true;
    if (radius <= 0) return false;
    const r = radius * 0.7;
    const d = r * Math.SQRT1_2;
    return this.isVisible(wx + r, wz) || this.isVisible(wx - r, wz) ||
      this.isVisible(wx, wz + r) || this.isVisible(wx, wz - r) ||
      this.isVisible(wx + d, wz + d) || this.isVisible(wx - d, wz - d) ||
      this.isVisible(wx + d, wz - d) || this.isVisible(wx - d, wz + d);
  }

  /** Zera a visão atual (início do tick). */
  beginVision() {
    this.activeVision.fill(0);
  }

  /**
   * Revela um círculo centrado em (wx, wz): marca visão atual e exploração permanente.
   * Pode ser chamado fora de um tick (revelação inicial da base).
   */
  revealArea(wx, wz, radius) {
    const n = this.gridSize;
    const center = this.cellIndex(wx, wz);
    const cgx = center % n;
    const cgz = (center / n) | 0;
    const gr = Math.ceil(radius / this.cellSize);
    const gr2 = gr * gr;
    const minX = Math.max(0, cgx - gr);
    const maxX = Math.min(n - 1, cgx + gr);
    const minZ = Math.max(0, cgz - gr);
    const maxZ = Math.min(n - 1, cgz + gr);
    const explored = this.explored;
    const vision = this.activeVision;
    let newlyExplored = false;
    for (let gz = minZ; gz <= maxZ; gz++) {
      const dz = gz - cgz;
      const dz2 = dz * dz;
      const row = gz * n;
      for (let gx = minX; gx <= maxX; gx++) {
        const dx = gx - cgx;
        if (dx * dx + dz2 <= gr2) {
          const idx = row + gx;
          vision[idx] = 1;
          if (explored[idx] === 0) {
            explored[idx] = 1;
            this.exploredCount++;
            newlyExplored = true;
          }
        }
      }
    }
    if (newlyExplored) this.needsUpdate = true;
    return newlyExplored;
  }

  /**
   * Fim do tick: compara a visão com a do tick anterior.
   * @returns {boolean} true se a textura precisa ser regerada (visão mudou ou `needsUpdate`)
   */
  endVision() {
    const a = this.activeVision;
    const b = this._lastVision;
    let changed = false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) { changed = true; break; }
    }
    if (changed) b.set(a);
    return changed || this.needsUpdate;
  }

  /**
   * Detecta um reset feito por fora (código legado zera `explored` diretamente): se há menos células
   * exploradas do que as contadas por `revealArea`, houve reset. Custo O(N²); chame só com `needsUpdate`.
   * @returns {boolean}
   */
  detectExternalReset() {
    let actual = 0;
    const e = this.explored;
    for (let i = 0; i < e.length; i++) actual += e[i];
    const wasReset = actual < this.exploredCount;
    this.exploredCount = actual;
    return wasReset;
  }

  /** Esquece tudo (novo mapa). */
  reset() {
    this.exploredCount = 0;
    this.explored.fill(0);
    this.activeVision.fill(0);
    this._lastVision.fill(0);
    this.needsUpdate = true;
  }

  /**
   * Escreve a textura de visibilidade em `out` (RGBA, 4 bytes por texel), resolução `gridSize × scale`:
   *   R = explorado e G = visível agora, suavizados por blur de caixa separável de raio `blur` texels
   *       (0 = sem blur; o filtro linear da GPU ainda suaviza os degraus);
   *   B = explorado e A = visível, SEM blur (coincidem com a grade lógica: decidem se um objeto existe).
   * @param {Uint8Array} out  tamanho (gridSize·scale)² · 4
   * @param {number} [scale=1] 1 ou 2
   * @param {number} [blur=0]
   */
  writeTexture(out, scale = 1, blur = 0) {
    const n = this.gridSize;
    const m = n * scale;
    const explored = this.explored;
    const vision = this.activeVision;

    // Canais duros (B, A) e, sem blur, também R e G
    for (let tz = 0; tz < m; tz++) {
      const srow = ((tz / scale) | 0) * n;
      const orow = tz * m;
      for (let tx = 0; tx < m; tx++) {
        const s = srow + ((tx / scale) | 0);
        const o = (orow + tx) * 4;
        const e = explored[s] ? 255 : 0;
        const v = vision[s] ? 255 : 0;
        out[o] = e;
        out[o + 1] = v;
        out[o + 2] = e;
        out[o + 3] = v;
      }
    }
    if (blur <= 0) {
      this.needsUpdate = false;
      return out;
    }

    // Blur de R e G: horizontal out -> tmp (16 bits, 2 canais), vertical tmp -> out
    const len = m * m * 2;
    if (!this._tmp || this._tmp.length !== len) this._tmp = new Uint16Array(len);
    const t = this._tmp;
    for (let tz = 0; tz < m; tz++) {
      const row = tz * m;
      let sr = 0;
      let sg = 0;
      for (let k = -blur; k <= blur; k++) {
        const x = k < 0 ? 0 : (k >= m ? m - 1 : k);
        sr += out[(row + x) * 4 + 2];
        sg += out[(row + x) * 4 + 3];
      }
      for (let tx = 0; tx < m; tx++) {
        const o = (row + tx) * 2;
        t[o] = sr;
        t[o + 1] = sg;
        const xOut = tx - blur < 0 ? 0 : tx - blur;
        const xIn = tx + blur + 1 >= m ? m - 1 : tx + blur + 1;
        sr += out[(row + xIn) * 4 + 2] - out[(row + xOut) * 4 + 2];
        sg += out[(row + xIn) * 4 + 3] - out[(row + xOut) * 4 + 3];
      }
    }
    const w = 2 * blur + 1;
    const norm = 1 / (w * w);
    for (let tx = 0; tx < m; tx++) {
      let sr = 0;
      let sg = 0;
      for (let k = -blur; k <= blur; k++) {
        const z = k < 0 ? 0 : (k >= m ? m - 1 : k);
        sr += t[(z * m + tx) * 2];
        sg += t[(z * m + tx) * 2 + 1];
      }
      for (let tz = 0; tz < m; tz++) {
        const o = (tz * m + tx) * 4;
        out[o] = Math.round(sr * norm);
        out[o + 1] = Math.round(sg * norm);
        const zOut = tz - blur < 0 ? 0 : tz - blur;
        const zIn = tz + blur + 1 >= m ? m - 1 : tz + blur + 1;
        sr += t[(zIn * m + tx) * 2] - t[(zOut * m + tx) * 2];
        sg += t[(zIn * m + tx) * 2 + 1] - t[(zOut * m + tx) * 2 + 1];
      }
    }
    this.needsUpdate = false;
    return out;
  }

  /**
   * Marca uma área como explorada sem dar visão (ex.: pegada de uma construção inimiga avistada pela borda,
   * para o modelo dela — cuja origem precisa estar explorada — aparecer na memória).
   */
  exploreArea(wx, wz, radius) {
    const n = this.gridSize;
    const center = this.cellIndex(wx, wz);
    const cgx = center % n;
    const cgz = (center / n) | 0;
    const gr = Math.max(0, Math.round(radius / this.cellSize));
    let changed = false;
    for (let gz = Math.max(0, cgz - gr); gz <= Math.min(n - 1, cgz + gr); gz++) {
      for (let gx = Math.max(0, cgx - gr); gx <= Math.min(n - 1, cgx + gr); gx++) {
        const idx = gz * n + gx;
        if (this.explored[idx] === 0) {
          this.explored[idx] = 1;
          this.exploredCount++;
          changed = true;
        }
      }
    }
    if (changed) this.needsUpdate = true;
    return changed;
  }

  /**
   * Camada do minimapa (RGBA gridSize²): preto opaco = não explorado, escurecido = memória, transparente = visível.
   * @param {Uint8ClampedArray|Uint8Array} out
   * @param {{r:number,g:number,b:number,unexploredAlpha:number,memoryAlpha:number}} [style]
   */
  writeMinimap(out, style = MINIMAP_STYLE) {
    const { r, g, b, unexploredAlpha, memoryAlpha } = style;
    const explored = this.explored;
    const vision = this.activeVision;
    for (let i = 0, p = 0; i < explored.length; i++, p += 4) {
      out[p] = r;
      out[p + 1] = g;
      out[p + 2] = b;
      out[p + 3] = vision[i] ? 0 : (explored[i] ? memoryAlpha : unexploredAlpha);
    }
    return out;
  }
}

export const MINIMAP_STYLE = { r: 6, g: 8, b: 12, unexploredAlpha: 255, memoryAlpha: 130 };

/**
 * Memória de construções inimigas.
 * Cada entrada: { x, z, radius, seen, visibleNow, ghost }.
 * - `seen`: já foi vista alguma vez (então aparece na memória).
 * - `visibleNow`: está (parcialmente) em visão atual.
 * - `ghost`: a construção morreu fora da visão; o jogador ainda vê o que lembrava até rever a área.
 */
export class BuildingMemory {
  constructor() {
    /** @type {Map<object, {x:number,z:number,radius:number,seen:boolean,visibleNow:boolean,ghost:boolean,tick:number}>} */
    this.records = new Map();
    this._tick = 0;
  }

  /** Posição do prédio (aceita `{mesh:{position}}` ou `{x,z}`). */
  static positionOf(b) {
    const p = b.mesh ? b.mesh.position : b;
    return p;
  }

  /**
   * Atualiza a memória com a lista atual de construções inimigas.
   * @param {FogGrid} grid
   * @param {Array<object>} enemyBuildings
   * @returns {{newGhosts: object[], removedGhosts: object[]}} prédios que viraram fantasma / fantasmas descartados
   */
  update(grid, enemyBuildings) {
    const tick = ++this._tick;
    const newGhosts = [];
    const removedGhosts = [];

    for (let i = 0; i < enemyBuildings.length; i++) {
      const b = enemyBuildings[i];
      if (!b) continue;
      const p = BuildingMemory.positionOf(b);
      if (!p) continue;
      let rec = this.records.get(b);
      if (b.isDead) {
        if (rec && !rec.ghost) this._onGone(b, rec, grid, true, newGhosts);
        if (rec) rec.tick = tick;
        continue;
      }
      const radius = b.collisionRadius || 3;
      const visibleNow = grid.isAreaVisible(p.x, p.z, radius);
      if (!rec) {
        if (!visibleNow) continue; // nunca visto: nem guarda
        rec = { x: p.x, z: p.z, radius, seen: false, visibleNow: false, ghost: false, tick };
        this.records.set(b, rec);
      }
      rec.x = p.x;
      rec.z = p.z;
      rec.radius = radius;
      rec.visibleNow = visibleNow;
      if (visibleNow && !rec.seen) {
        rec.seen = true;
        // Garante a origem do modelo explorada (o shader recolhe objetos com origem não explorada)
        grid.exploreArea(p.x, p.z, Math.min(radius * 0.5, 2));
      }
      rec.tick = tick;
    }

    for (const [b, rec] of this.records) {
      if (rec.ghost) {
        // Fantasma: some quando a área é revista (lá não há mais nada)
        if (grid.isAreaVisible(rec.x, rec.z, rec.radius)) {
          this.records.delete(b);
          removedGhosts.push(b);
        }
        continue;
      }
      if (rec.tick !== tick) {
        // Saiu da lista: destruída (vira fantasma) ou removida sem morrer (reset do mapa) → esquece
        this._onGone(b, rec, grid, !!b.isDead, newGhosts);
      }
    }
    return { newGhosts, removedGhosts };
  }

  _onGone(b, rec, grid, died, newGhosts) {
    if (died && rec.seen && !grid.isAreaVisible(rec.x, rec.z, rec.radius)) {
      rec.ghost = true;
      rec.visibleNow = false;
      newGhosts.push(b);
    } else {
      this.records.delete(b);
    }
  }

  /** O prédio deve ser desenhado (visível agora ou lembrado)? */
  isKnown(b) {
    const rec = this.records.get(b);
    return !!rec && (rec.visibleNow || rec.seen);
  }

  isVisibleNow(b) {
    const rec = this.records.get(b);
    return !!rec && rec.visibleNow;
  }

  /** Itera sobre os fantasmas (prédios destruídos lembrados). */
  forEachGhost(cb) {
    for (const [b, rec] of this.records) if (rec.ghost) cb(b, rec);
  }

  clear() {
    const ghosts = [];
    for (const [b, rec] of this.records) if (rec.ghost) ghosts.push(b);
    this.records.clear();
    return ghosts;
  }
}
