/**
 * SpatialGrid.js — grade espacial (spatial hash) uniforme para consultas de vizinhança
 * da simulação (F1-06). Lógica pura, sem three.js/DOM: testável em Node.
 *
 * Cada entidade é indexada por UMA célula (a que contém seu centro x/z, clampada aos
 * limites da grade); o raio da entidade só entra nas comparações de distância das
 * consultas (`queryRadius`, que inclui a entidade quando `distância-centro ≤ r + raio`),
 * não na inserção. As consultas expandem a busca por células vizinhas usando o maior
 * raio já inserido na grade (`maxRadius`), garantindo que nenhuma entidade "larga"
 * (ex.: um castelo) seja perdida mesmo estando a mais de uma célula de distância.
 *
 * Entidades precisam de um `id` numérico estável (F2-01, `EntityIds.js`) para o
 * desempate determinístico exigido pela spec (menor id vence).
 */
export class SpatialGrid {
  constructor({ minX = -70, minZ = -70, maxX = 70, maxZ = 70, cellSize = 4 } = {}) {
    this.minX = minX;
    this.minZ = minZ;
    this.maxX = maxX;
    this.maxZ = maxZ;
    this.cellSize = cellSize;
    this.cols = Math.max(1, Math.ceil((maxX - minX) / cellSize));
    this.rows = Math.max(1, Math.ceil((maxZ - minZ) / cellSize));

    /** @type {Map<number, Set<object>>} índice de célula (cz*cols+cx) → entidades nela */
    this._cells = new Map();
    /** @type {WeakMap<object, {cx:number, cz:number, x:number, z:number, radius:number}>} */
    this._entries = new WeakMap();
    /** Maior raio já inserido/atualizado (nunca diminui); usado para alargar a busca por células. */
    this._maxRadius = 0;
  }

  /** Maior raio de entidade já visto pela grade (ver comentário da classe). */
  get maxRadius() {
    return this._maxRadius;
  }

  _clampCol(cx) {
    return cx < 0 ? 0 : cx > this.cols - 1 ? this.cols - 1 : cx;
  }

  _clampRow(cz) {
    return cz < 0 ? 0 : cz > this.rows - 1 ? this.rows - 1 : cz;
  }

  _colOf(x) {
    return this._clampCol(Math.floor((x - this.minX) / this.cellSize));
  }

  _rowOf(z) {
    return this._clampRow(Math.floor((z - this.minZ) / this.cellSize));
  }

  /** Clampa uma posição aos limites da grade — entidade fora do mapa "cola" na borda. */
  _clampPos(x, z) {
    const cx = x < this.minX ? this.minX : x > this.maxX ? this.maxX : x;
    const cz = z < this.minZ ? this.minZ : z > this.maxZ ? this.maxZ : z;
    return [cx, cz];
  }

  _cellKey(cx, cz) {
    return cz * this.cols + cx;
  }

  _cellSet(key, create) {
    let set = this._cells.get(key);
    if (!set && create) {
      set = new Set();
      this._cells.set(key, set);
    }
    return set;
  }

  /**
   * Insere (ou reinsere, se já presente) `entity` na célula de `(x, z)`. Uma posição fora dos
   * limites da grade é clampada à borda (célula E coordenada armazenada), então tanto a busca
   * por célula quanto a distância usada nas consultas ficam consistentes com a borda.
   */
  insert(entity, x, z, radius = 0) {
    if (!entity) return;
    if (this._entries.has(entity)) this.remove(entity);

    const [px, pz] = this._clampPos(x, z);
    const cx = this._colOf(px);
    const cz = this._rowOf(pz);
    this._cellSet(this._cellKey(cx, cz), true).add(entity);
    this._entries.set(entity, { cx, cz, x: px, z: pz, radius });
    if (radius > this._maxRadius) this._maxRadius = radius;
  }

  /** Move `entity` para `(x, z)` (clampado à borda, ver `insert`), trocando de célula só se necessário. */
  update(entity, x, z, radius = 0) {
    const entry = this._entries.get(entity);
    if (!entry) {
      this.insert(entity, x, z, radius);
      return;
    }
    const [px, pz] = this._clampPos(x, z);
    entry.x = px;
    entry.z = pz;
    entry.radius = radius;
    if (radius > this._maxRadius) this._maxRadius = radius;

    const cx = this._colOf(px);
    const cz = this._rowOf(pz);
    if (cx === entry.cx && cz === entry.cz) return;

    const oldSet = this._cells.get(this._cellKey(entry.cx, entry.cz));
    if (oldSet) {
      oldSet.delete(entity);
      if (oldSet.size === 0) this._cells.delete(this._cellKey(entry.cx, entry.cz));
    }
    entry.cx = cx;
    entry.cz = cz;
    this._cellSet(this._cellKey(cx, cz), true).add(entity);
  }

  /** Remove `entity` da grade (no-op se não estiver presente). */
  remove(entity) {
    const entry = this._entries.get(entity);
    if (!entry) return;
    const key = this._cellKey(entry.cx, entry.cz);
    const set = this._cells.get(key);
    if (set) {
      set.delete(entity);
      if (set.size === 0) this._cells.delete(key);
    }
    this._entries.delete(entity);
  }

  /** Esvazia a grade (mantém limites/cellSize; `maxRadius` também zera). */
  clear() {
    this._cells.clear();
    this._entries = new WeakMap();
    this._maxRadius = 0;
  }

  /**
   * Preenche e retorna `outArray` (reutilizado, sem alocar) com as entidades cuja distância
   * centro-centro a `(x, z)` seja ≤ `r + raioDaEntidade`. `filter(entity)` opcional.
   * Resultado ORDENADO por id crescente (determinismo).
   */
  queryRadius(x, z, r, filter = null, outArray = []) {
    outArray.length = 0;
    const reach = r + this._maxRadius;
    const cx0 = this._colOf(x - reach);
    const cx1 = this._colOf(x + reach);
    const cz0 = this._rowOf(z - reach);
    const cz1 = this._rowOf(z + reach);

    for (let cz = cz0; cz <= cz1; cz++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const set = this._cells.get(this._cellKey(cx, cz));
        if (!set) continue;
        for (const entity of set) {
          if (filter && !filter(entity)) continue;
          const entry = this._entries.get(entity);
          const dx = x - entry.x;
          const dz = z - entry.z;
          const maxDist = r + entry.radius;
          if (dx * dx + dz * dz <= maxDist * maxDist) {
            outArray.push(entity);
          }
        }
      }
    }

    outArray.sort((a, b) => a.id - b.id);
    return outArray;
  }

  /**
   * Preenche e retorna `outArray` (reutilizado, sem alocar) com as entidades cujo centro
   * (x, z) esteja dentro do retângulo `[minX,maxX] x [minZ,maxZ]`. `filter(entity)` opcional.
   * Resultado ORDENADO por id crescente (determinismo).
   */
  queryRect(minX, minZ, maxX, maxZ, filter = null, outArray = []) {
    outArray.length = 0;
    const cx0 = this._colOf(minX);
    const cx1 = this._colOf(maxX);
    const cz0 = this._rowOf(minZ);
    const cz1 = this._rowOf(maxZ);

    for (let cz = cz0; cz <= cz1; cz++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const set = this._cells.get(this._cellKey(cx, cz));
        if (!set) continue;
        for (const entity of set) {
          if (filter && !filter(entity)) continue;
          const entry = this._entries.get(entity);
          if (entry.x >= minX && entry.x <= maxX && entry.z >= minZ && entry.z <= maxZ) {
            outArray.push(entity);
          }
        }
      }
    }

    outArray.sort((a, b) => a.id - b.id);
    return outArray;
  }

  /**
   * Entidade mais próxima de `(x, z)` (distância centro-centro pura, sem somar raio) que
   * passe em `predicate(entity)`, dentro de `maxR`. Desempate por menor `id`. `null` se
   * nenhuma entidade estiver dentro de `maxR`.
   */
  nearest(x, z, maxR, predicate = null) {
    let best = null;
    let bestDistSq = maxR * maxR;
    const cx0 = this._colOf(x - maxR);
    const cx1 = this._colOf(x + maxR);
    const cz0 = this._rowOf(z - maxR);
    const cz1 = this._rowOf(z + maxR);

    for (let cz = cz0; cz <= cz1; cz++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const set = this._cells.get(this._cellKey(cx, cz));
        if (!set) continue;
        for (const entity of set) {
          if (predicate && !predicate(entity)) continue;
          const entry = this._entries.get(entity);
          const dx = x - entry.x;
          const dz = z - entry.z;
          const distSq = dx * dx + dz * dz;
          if (distSq > bestDistSq) continue;
          if (!best || distSq < bestDistSq || entity.id < best.id) {
            best = entity;
            bestDistSq = distSq;
          }
        }
      }
    }

    return best;
  }
}
