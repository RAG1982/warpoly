/**
 * Pathfinder.js (Sistema de Navegação e Pathfinding da Grade de Terreno)
 *
 * Garante que unidades terrestres NÃO possam atravessar rios ou oceanos e encontrem
 * rotas seguras através dos vãos e pontes de terra (North Ford, Center Ford, South Ford).
 *
 * Características:
 * 1. Grade 2D estática de navegação baseada na elevação do terreno (área jogável [-58, 58]).
 * 2. Barreira estrita de água: qualquer ponto com altura < 0.65 é considerado água intransponível.
 * 3. Camada dinâmica (`dynamicBlock`): contador de bloqueios por célula (construções, árvores vivas)
 *    somado à camada estática — uma célula só é caminhável se as duas permitirem (F1-07).
 * 4. Teste rápido de Linha de Visada (Line of Sight - LOS) para movimentos diretos em O(1).
 * 5. A* com heap binário e arrays tipados para desvio inteligente de rios/obstáculos (F1-07).
 * 6. String-pulling (suavização de caminho) para remover zig-zag e criar trajetos naturais.
 * 7. Fila de pedidos com orçamento por frame (`requestPath`/`processQueue`) e cache de caminhos
 *    recentes (por par de células + versão da camada dinâmica).
 */

/** Heap binário mínimo, com arrays tipados, usado pelo A* (chave = prioridade/fScore). */
export class MinHeap {
  constructor(capacity) {
    this.priorities = new Float32Array(capacity);
    this.items = new Int32Array(capacity);
    this.size = 0;
  }

  clear() {
    this.size = 0;
  }

  push(item, priority) {
    let i = this.size++;
    this.items[i] = item;
    this.priorities[i] = priority;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.priorities[parent] <= this.priorities[i]) break;
      this._swap(parent, i);
      i = parent;
    }
  }

  pop() {
    const top = this.items[0];
    this.size--;
    if (this.size > 0) {
      this.items[0] = this.items[this.size];
      this.priorities[0] = this.priorities[this.size];
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let smallest = i;
        if (l < this.size && this.priorities[l] < this.priorities[smallest]) smallest = l;
        if (r < this.size && this.priorities[r] < this.priorities[smallest]) smallest = r;
        if (smallest === i) break;
        this._swap(smallest, i);
        i = smallest;
      }
    }
    return top;
  }

  _swap(a, b) {
    const ti = this.items[a]; this.items[a] = this.items[b]; this.items[b] = ti;
    const tp = this.priorities[a]; this.priorities[a] = this.priorities[b]; this.priorities[b] = tp;
  }
}

const PATH_CACHE_LIMIT = 256;

export class Pathfinder {
  /**
   * @param {import('../world/Terrain.js').Terrain} terrain
   * @param {number} bounds Half-width of navigable territory
   * @param {number} cellSize Size of each navigation grid tile in world units
   */
  constructor(terrain, bounds = 58, cellSize = 1.5) {
    this.terrain = terrain;
    this.cellSize = cellSize;
    this.bounds = bounds;
    this.minCoord = -bounds;
    this.maxCoord = bounds;
    this.cols = Math.round((this.maxCoord - this.minCoord) / cellSize);
    this.rows = this.cols;
    this.numCells = this.cols * this.rows;

    // 0 = Impassable (Water / Outer Abyss), 1 = Walkable Dry Land (camada estática, do terreno)
    this.staticGrid = new Uint8Array(this.numCells);
    // Contador de bloqueios dinâmicos (construções, árvores vivas) por célula (F1-07).
    this.dynamicBlock = new Uint16Array(this.numCells);
    // Incrementada a cada mudança na camada dinâmica; invalida o cache de caminhos.
    this.version = 0;

    // Pre-allocated A* buffers to eliminate GC churn during path queries
    this.gScore = new Float32Array(this.numCells);
    this.fScore = new Float32Array(this.numCells);
    this.cameFrom = new Int32Array(this.numCells);
    this.closedSet = new Uint8Array(this.numCells);
    // Capacidade generosa: uma célula pode ser empurrada de novo a cada relaxamento (até 8
    // vizinhos por nó expandido); entradas obsoletas são descartadas na hora do pop (ver closedSet).
    this._heap = new MinHeap(this.numCells * 8 + 8);

    /** Cache de caminhos recentes: chave "startIdx|destIdx|version" → waypoints (limite 256). */
    this._pathCache = new Map();
    /** Fila de pedidos de caminho pendentes (`requestPath`), resolvidos por `processQueue`. */
    this._queue = [];
    // F2-03: nós expandidos pela última `_searchAStar` (0 nos caminhos rápidos: LOS direto,
    // mesma célula, cache) — usado por `processQueue` para um orçamento por nós, não por relógio.
    this._lastNodesExpanded = 0;

    this.buildGrid();
  }

  /**
   * Pre-computes navigable tiles based on terrain heightmap
   */
  buildGrid() {
    for (let r = 0; r < this.rows; r++) {
      const z = this.minCoord + (r + 0.5) * this.cellSize;
      for (let c = 0; c < this.cols; c++) {
        const x = this.minCoord + (c + 0.5) * this.cellSize;
        const h = this.terrain.getHeight(x, z);
        const maxCoord = Math.max(Math.abs(x), Math.abs(z));

        // Dry land above water table (water level = 0.5; dry land threshold >= 0.68)
        // and strictly within continental borders (maxCoord < 55)
        if (h >= 0.68 && maxCoord < 55) {
          this.staticGrid[r * this.cols + c] = 1;
        } else {
          this.staticGrid[r * this.cols + c] = 0;
        }
      }
    }
  }

  /**
   * Checks whether a specific world coordinate is in water
   * @param {number} x
   * @param {number} z
   * @returns {boolean}
   */
  isWater(x, z) {
    const h = this.terrain.getHeight(x, z);
    return h < 0.65;
  }

  /**
   * Maps world coordinates (x, z) to grid coordinates (c, r)
   * @param {number} x
   * @param {number} z
   * @returns {{ c: number, r: number }}
   */
  toGrid(x, z) {
    const c = Math.floor((x - this.minCoord) / this.cellSize);
    const r = Math.floor((z - this.minCoord) / this.cellSize);
    return {
      c: Math.max(0, Math.min(this.cols - 1, c)),
      r: Math.max(0, Math.min(this.rows - 1, r))
    };
  }

  /**
   * Maps grid coordinates (c, r) to center world coordinates (x, z)
   * @param {number} c
   * @param {number} r
   * @returns {{ x: number, z: number }}
   */
  toWorld(c, r) {
    return {
      x: this.minCoord + (c + 0.5) * this.cellSize,
      z: this.minCoord + (r + 0.5) * this.cellSize
    };
  }

  /**
   * Verifica se uma célula é caminhável: terreno seco (camada estática) E sem bloqueio
   * dinâmico (construção/árvore viva) por cima (F1-07).
   * @param {number} c
   * @param {number} r
   * @returns {boolean}
   */
  isWalkable(c, r) {
    if (c < 0 || c >= this.cols || r < 0 || r >= this.rows) return false;
    const i = r * this.cols + c;
    return this.staticGrid[i] === 1 && this.dynamicBlock[i] === 0;
  }

  /** Caminhável no ponto do mundo (x, z): nem água nem bloqueio dinâmico. */
  isWalkableWorld(x, z) {
    if (this.isWater(x, z)) return false;
    const { c, r } = this.toGrid(x, z);
    return this.isWalkable(c, r);
  }

  /**
   * Marca/desmarca um círculo de células como bloqueadas dinamicamente (construções, árvores
   * vivas). `delta` é tipicamente +1 (bloquear) ou -1 (desbloquear); o contador por célula
   * suporta sobreposição de vários bloqueadores. Usa `radius - 0.3` para não fechar passagens
   * estreitas entre construções vizinhas. Incrementa `version` (invalida o cache de caminhos).
   * @param {number} x
   * @param {number} z
   * @param {number} radius
   * @param {1|-1} delta
   */
  blockCircle(x, z, radius, delta) {
    const effRadius = radius - 0.3;
    if (effRadius <= 0) return;
    const center = this.toGrid(x, z);
    const cellRadius = Math.ceil(effRadius / this.cellSize) + 1;
    const rSq = effRadius * effRadius;

    for (let dr = -cellRadius; dr <= cellRadius; dr++) {
      const nr = center.r + dr;
      if (nr < 0 || nr >= this.rows) continue;
      for (let dc = -cellRadius; dc <= cellRadius; dc++) {
        const nc = center.c + dc;
        if (nc < 0 || nc >= this.cols) continue;
        const w = this.toWorld(nc, nr);
        const dSq = (w.x - x) ** 2 + (w.z - z) ** 2;
        if (dSq > rSq) continue;
        const i = nr * this.cols + nc;
        const next = this.dynamicBlock[i] + delta;
        this.dynamicBlock[i] = next < 0 ? 0 : next;
      }
    }
    this.version++;
  }

  /**
   * Snaps a coordinate in water to the nearest walkable land tile
   * @param {number} x
   * @param {number} z
   * @returns {{ x: number, z: number }}
   */
  findNearestWalkable(x, z) {
    const { c, r } = this.toGrid(x, z);
    if (this.isWalkable(c, r)) return { x, z };

    for (let radius = 1; radius <= 16; radius++) {
      let bestPt = null;
      let minDSq = Infinity;
      for (let dr = -radius; dr <= radius; dr++) {
        for (let dc = -radius; dc <= radius; dc++) {
          if (Math.abs(dr) !== radius && Math.abs(dc) !== radius) continue;
          const nc = c + dc;
          const nr = r + dr;
          if (this.isWalkable(nc, nr)) {
            const wpt = this.toWorld(nc, nr);
            const dSq = (wpt.x - x) ** 2 + (wpt.z - z) ** 2;
            if (dSq < minDSq) {
              minDSq = dSq;
              bestPt = wpt;
            }
          }
        }
      }
      if (bestPt) return bestPt;
    }
    return { x, z };
  }

  /**
   * Checks whether the direct line segment between two points is entirely on dry land
   * and free of dynamic obstacles.
   * @param {number} x0
   * @param {number} z0
   * @param {number} x1
   * @param {number} z1
   * @returns {boolean}
   */
  hasLineOfSight(x0, z0, x1, z1) {
    const dist = Math.hypot(x1 - x0, z1 - z0);
    // Pontos coincidentes (dist ~0): sem segmento a testar, só o próprio ponto (NEW-4).
    if (dist < 1e-6) return this.isWalkableWorld(x0, z0);

    const stepSize = this.cellSize * 0.45;
    const steps = Math.ceil(dist / stepSize);

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = x0 + (x1 - x0) * t;
      const z = z0 + (z1 - z0) * t;

      // 1. Direct height check
      if (this.isWater(x, z)) return false;

      // 2. Grid cell check (camada estática + dinâmica)
      const { c, r } = this.toGrid(x, z);
      if (!this.isWalkable(c, r)) return false;
    }

    return true;
  }

  /**
   * Computes an optimal, smoothed path of waypoints avoiding water and dynamic obstacles.
   * A origem é sempre tratada como caminhável, mesmo se um bloqueio dinâmico cobrir a célula
   * onde a unidade já está parada (encostada numa construção) — evita ficar sem caminho.
   * @param {number} startX
   * @param {number} startZ
   * @param {number} destX
   * @param {number} destZ
   * @returns {Array<{ x: number, z: number }>}
   */
  findPath(startX, startZ, destX, destZ) {
    const start = this.toGrid(startX, startZ);
    const startIndex = start.r * this.cols + start.c;

    // Trata a célula de origem como livre (unidade pode estar encostada num bloqueio dinâmico).
    const startBlockCount = this.dynamicBlock[startIndex];
    if (startBlockCount > 0) this.dynamicBlock[startIndex] = 0;
    try {
      return this._findPath(startX, startZ, destX, destZ, start, startIndex);
    } finally {
      if (startBlockCount > 0) this.dynamicBlock[startIndex] = startBlockCount;
    }
  }

  _findPath(startX, startZ, destX, destZ, start, startIndex) {
    // Snap destination to nearest land/free tile if clicked in water or sobre um bloqueio
    if (!this.isWalkableWorld(destX, destZ)) {
      const snapped = this.findNearestWalkable(destX, destZ);
      destX = snapped.x;
      destZ = snapped.z;
    }

    // Fast-path: Direct Line of Sight without crossing water/obstacles
    if (this.hasLineOfSight(startX, startZ, destX, destZ)) {
      this._lastNodesExpanded = 0;
      return [{ x: destX, z: destZ }];
    }

    let dest = this.toGrid(destX, destZ);
    if (!this.isWalkable(dest.c, dest.r)) {
      const snapped = this.findNearestWalkable(destX, destZ);
      dest = this.toGrid(snapped.x, snapped.z);
    }

    const destIndex = dest.r * this.cols + dest.c;

    if (startIndex === destIndex) {
      this._lastNodesExpanded = 0;
      return [{ x: destX, z: destZ }];
    }

    const cacheKey = `${startIndex}|${destIndex}|${this.version}`;
    const cached = this._pathCache.get(cacheKey);
    if (cached) {
      // Reordena para o fim (LRU) e devolve uma cópia com o destino exato pedido.
      this._pathCache.delete(cacheKey);
      this._pathCache.set(cacheKey, cached);
      const path = cached.map(p => ({ x: p.x, z: p.z }));
      path[path.length - 1] = { x: destX, z: destZ };
      this._lastNodesExpanded = 0;
      return path;
    }

    const smoothPath = this._searchAStar(start, dest, startIndex, destIndex, destX, destZ);

    if (this._pathCache.size >= PATH_CACHE_LIMIT) {
      const oldestKey = this._pathCache.keys().next().value;
      this._pathCache.delete(oldestKey);
    }
    this._pathCache.set(cacheKey, smoothPath.map(p => ({ x: p.x, z: p.z })));

    // Replace final waypoint with exact destination coordinates
    smoothPath[smoothPath.length - 1] = { x: destX, z: destZ };
    return smoothPath;
  }

  /** Busca A* com heap binário; devolve o caminho suavizado (string-pulling) até `dest`. */
  _searchAStar(start, dest, startIndex, destIndex, destX, destZ) {
    // Reset A* buffers
    this.gScore.fill(Infinity);
    this.fScore.fill(Infinity);
    this.cameFrom.fill(-1);
    this.closedSet.fill(0);
    this._heap.clear();

    this.gScore[startIndex] = 0;
    const h = (c, r) => Math.hypot(c - dest.c, r - dest.r);
    this.fScore[startIndex] = h(start.c, start.r);
    this._heap.push(startIndex, this.fScore[startIndex]);

    // 8-direction movement deltas: [dc, dr, cost]
    const dirs = [
      [-1, 0, 1.0], [1, 0, 1.0], [0, -1, 1.0], [0, 1, 1.0],
      [-1, -1, 1.414], [-1, 1, 1.414], [1, -1, 1.414], [1, 1, 1.414]
    ];

    let foundDest = false;
    let iterations = 0;
    const maxIterations = 3200;

    while (this._heap.size > 0 && iterations < maxIterations) {
      iterations++;

      const current = this._heap.pop();
      if (this.closedSet[current]) continue; // entrada obsoleta (chave antiga já reprocessada)

      if (current === destIndex) {
        foundDest = true;
        break;
      }

      this.closedSet[current] = 1;

      const curC = current % this.cols;
      const curR = Math.floor(current / this.cols);

      for (let d = 0; d < 8; d++) {
        const nc = curC + dirs[d][0];
        const nr = curR + dirs[d][1];
        const cost = dirs[d][2];

        if (nc < 0 || nc >= this.cols || nr < 0 || nr >= this.rows) continue;
        const neighbor = nr * this.cols + nc;
        if (this.closedSet[neighbor] || !this.isWalkable(nc, nr)) continue;

        // Diagonal corner-cutting prevention across water/obstacle boundaries
        if (d >= 4) {
          if (!this.isWalkable(curC + dirs[d][0], curR) || !this.isWalkable(curC, curR + dirs[d][1])) {
            continue;
          }
        }

        const tentativeG = this.gScore[current] + cost;
        if (tentativeG < this.gScore[neighbor]) {
          this.cameFrom[neighbor] = current;
          this.gScore[neighbor] = tentativeG;
          this.fScore[neighbor] = tentativeG + h(nc, nr);
          this._heap.push(neighbor, this.fScore[neighbor]);
        }
      }
    }

    this._lastNodesExpanded = iterations;

    if (!foundDest) {
      // Fallback: direct destination point
      return [{ x: destX, z: destZ }];
    }

    // Reconstruct raw cell path
    const rawPath = [];
    let curr = destIndex;
    while (curr !== -1) {
      const c = curr % this.cols;
      const r = Math.floor(curr / this.cols);
      rawPath.push(this.toWorld(c, r));
      curr = this.cameFrom[curr];
    }
    rawPath.reverse();

    // String-pulling (Raycast path smoothing to remove grid staircase effect)
    const smoothPath = [];
    let currentIdx = 0;

    while (currentIdx < rawPath.length - 1) {
      let furthest = currentIdx + 1;
      for (let next = rawPath.length - 1; next > currentIdx + 1; next--) {
        if (this.hasLineOfSight(rawPath[currentIdx].x, rawPath[currentIdx].z, rawPath[next].x, rawPath[next].z)) {
          furthest = next;
          break;
        }
      }
      smoothPath.push(rawPath[furthest]);
      currentIdx = furthest;
    }

    return smoothPath;
  }

  /**
   * Enfileira um pedido de caminho para ser resolvido em `processQueue` (orçamento por frame).
   * `unit` precisa expor `mesh.position.{x,z}`, lida no momento do processamento (não agora),
   * para refletir a posição atual mesmo se a unidade se mover enquanto espera na fila.
   * @param {{ mesh: { position: { x: number, z: number } }, isDead?: boolean, canRemove?: boolean }} unit
   * @param {number} destX
   * @param {number} destZ
   * @param {(path: Array<{ x: number, z: number }>) => void} callback
   */
  requestPath(unit, destX, destZ, callback) {
    this._queue.push({ unit, destX, destZ, callback });
  }

  /**
   * Resolve pedidos enfileirados em `requestPath` até estourar o orçamento `maxNodes` (soma de
   * nós de grade expandidos pelo A* nesta chamada — não por relógio: `performance.now()` varia
   * por máquina e quebraria o determinismo do F2-03); o restante fica para a próxima chamada
   * (chamado uma vez por passo de simulação). Pedidos de unidades já mortas/removidas são
   * descartados sem chamar o callback. Sempre resolve ao menos 1 pedido, mesmo que ele sozinho
   * já ultrapasse `maxNodes` (evita fila crescendo sem nunca ser atendida).
   * @param {number} maxNodes
   */
  processQueue(maxNodes = 4000) {
    let nodesUsed = 0;
    while (this._queue.length > 0 && nodesUsed < maxNodes) {
      const req = this._queue.shift();
      if (!req.unit || req.unit.isDead || req.unit.canRemove) continue;
      const pos = req.unit.mesh.position;
      const path = this.findPath(pos.x, pos.z, req.destX, req.destZ);
      nodesUsed += this._lastNodesExpanded;
      req.callback(path);
    }
  }
}
