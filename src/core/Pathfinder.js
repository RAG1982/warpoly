/**
 * Pathfinder.js (Sistema de Navegação e Pathfinding da Grade de Terreno)
 * 
 * Garante que unidades terrestres NÃO possam atravessar rios ou oceanos e encontrem
 * rotas seguras através dos vãos e pontes de terra (North Ford, Center Ford, South Ford).
 * 
 * Características:
 * 1. Grade 2D estática de navegação baseada na elevação do terreno (área jogável [-58, 58]).
 * 2. Barreira estrita de água: qualquer ponto com altura < 0.65 é considerado água intransponível.
 * 3. Teste rápido de Linha de Visada (Line of Sight - LOS) para movimentos diretos em O(1).
 * 4. A* otimizado com arrays tipados para desvio inteligente de rios através das travessias.
 * 5. String-pulling (suavização de caminho) para remover zig-zag e criar trajetos naturais.
 */

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

    // 0 = Impassable (Water / Outer Abyss), 1 = Walkable Dry Land
    this.grid = new Uint8Array(this.numCells);

    // Pre-allocated A* buffers to eliminate GC churn during path queries
    this.gScore = new Float32Array(this.numCells);
    this.fScore = new Float32Array(this.numCells);
    this.cameFrom = new Int32Array(this.numCells);
    this.closedSet = new Uint8Array(this.numCells);
    this.openSet = [];

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
          this.grid[r * this.cols + c] = 1;
        } else {
          this.grid[r * this.cols + c] = 0;
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
   * Verifies if a cell is walkable dry land
   * @param {number} c 
   * @param {number} r 
   * @returns {boolean}
   */
  isWalkable(c, r) {
    if (c < 0 || c >= this.cols || r < 0 || r >= this.rows) return false;
    return this.grid[r * this.cols + c] === 1;
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
   * @param {number} x0 
   * @param {number} z0 
   * @param {number} x1 
   * @param {number} z1 
   * @returns {boolean}
   */
  hasLineOfSight(x0, z0, x1, z1) {
    const dist = Math.hypot(x1 - x0, z1 - z0);
    const stepSize = this.cellSize * 0.45;
    const steps = Math.ceil(dist / stepSize);

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = x0 + (x1 - x0) * t;
      const z = z0 + (z1 - z0) * t;

      // 1. Direct height check
      if (this.isWater(x, z)) return false;

      // 2. Grid cell check
      const { c, r } = this.toGrid(x, z);
      if (!this.isWalkable(c, r)) return false;
    }

    return true;
  }

  /**
   * Computes an optimal, smoothed path of waypoints avoiding water obstacles
   * @param {number} startX 
   * @param {number} startZ 
   * @param {number} destX 
   * @param {number} destZ 
   * @returns {Array<{ x: number, z: number }>}
   */
  findPath(startX, startZ, destX, destZ) {
    // Snap destination to nearest land if clicked in water
    if (this.isWater(destX, destZ)) {
      const snapped = this.findNearestWalkable(destX, destZ);
      destX = snapped.x;
      destZ = snapped.z;
    }

    // Fast-path: Direct Line of Sight without crossing water
    if (this.hasLineOfSight(startX, startZ, destX, destZ)) {
      return [{ x: destX, z: destZ }];
    }

    const start = this.toGrid(startX, startZ);
    let dest = this.toGrid(destX, destZ);

    if (!this.isWalkable(dest.c, dest.r)) {
      const snapped = this.findNearestWalkable(destX, destZ);
      dest = this.toGrid(snapped.x, snapped.z);
    }

    const startIndex = start.r * this.cols + start.c;
    const destIndex = dest.r * this.cols + dest.c;

    if (startIndex === destIndex) {
      return [{ x: destX, z: destZ }];
    }

    // Reset A* arrays
    this.gScore.fill(Infinity);
    this.fScore.fill(Infinity);
    this.cameFrom.fill(-1);
    this.closedSet.fill(0);
    this.openSet.length = 0;

    this.gScore[startIndex] = 0;
    const h = (c, r) => Math.hypot(c - dest.c, r - dest.r);
    this.fScore[startIndex] = h(start.c, start.r);
    this.openSet.push(startIndex);

    // 8-direction movement deltas: [dc, dr, cost]
    const dirs = [
      [-1, 0, 1.0], [1, 0, 1.0], [0, -1, 1.0], [0, 1, 1.0],
      [-1, -1, 1.414], [-1, 1, 1.414], [1, -1, 1.414], [1, 1, 1.414]
    ];

    let foundDest = false;
    let iterations = 0;
    const maxIterations = 3200;

    while (this.openSet.length > 0 && iterations < maxIterations) {
      iterations++;

      // Pop lowest fScore
      let bestIdx = 0;
      let bestF = this.fScore[this.openSet[0]];
      for (let i = 1; i < this.openSet.length; i++) {
        const f = this.fScore[this.openSet[i]];
        if (f < bestF) {
          bestF = f;
          bestIdx = i;
        }
      }

      const current = this.openSet[bestIdx];
      if (current === destIndex) {
        foundDest = true;
        break;
      }

      this.openSet.splice(bestIdx, 1);
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

        // Diagonal corner-cutting prevention across water boundaries
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

          if (!this.openSet.includes(neighbor)) {
            this.openSet.push(neighbor);
          }
        }
      }
    }

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

    // Replace final waypoint with exact destination coordinates
    smoothPath[smoothPath.length - 1] = { x: destX, z: destZ };
    return smoothPath;
  }
}
