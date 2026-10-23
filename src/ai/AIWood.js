import { fhypot } from '../sim/fmath.js';
import { isDropoffFor } from '../data/index.js';

/**
 * AIWood — NEW-44: leitura da oferta de madeira para a economia da IA (puro, sem three.js/DOM, determinístico).
 *
 * A madeira do mapa é finita (árvores não renascem) e quase toda unidade/construção a consome. Sem esta leitura a IA
 * seguia mandando peões para árvores inalcançáveis (outra ilha, além da borda jogável), nunca expandia a serraria quando
 * as árvores perto da base acabavam e, sem nenhuma árvore, acumulava ouro e peões ociosos esperando um reforço impossível.
 *
 * `analyzeWood(director)` devolve:
 *   - count/wood   árvores vivas ALCANÇÁVEIS por terra a partir da base da IA (e a madeira nelas);
 *   - nearest      menor distância de uma dessas árvores a um ponto de entrega de madeira (Centro/serraria concluídos);
 *   - none         nenhuma árvore alcançável: madeira nova é impossível (só o estoque em caixa vale);
 *   - far          há árvores, mas a mais próxima fica a mais de `FAR_TREE_DIST` de qualquer entrega (trajeto longo);
 *   - low          o que resta é menos que `LOW_WOOD` (cerca de 3 árvores).
 */

/** Distância árvore→entrega acima da qual vale erguer uma serraria avançada. */
export const FAR_TREE_DIST = 20;
/** Madeira alcançável abaixo disto = "acabando". */
export const LOW_WOOD = 360;
/** Folga mínima (u) entre a nova serraria e as entregas existentes (senão ela serve as mesmas árvores). */
export const MIN_DROP_GAP = 12;
/** Alcance (u) das árvores que contam para um local de serraria, passo da grade de busca e valor mínimo (≈ 2 árvores cheias a ~7 u). */
export const SITE_REACH = 14;
export const SITE_STEP = 1.5;
export const MIN_SITE_VALUE = 120;

/** Cache das regiões conexas da camada estática do Pathfinder terrestre (a grade estática nunca muda depois de criada). */
const regionCache = new WeakMap();

/**
 * Componentes conexos (4 vizinhos) da camada estática do `Pathfinder` terrestre. Equivale à alcançabilidade do A*
 * (que só anda na diagonal quando as duas células ortogonais estão livres). Ignora construções e árvores (camada dinâmica);
 * água e a borda da área jogável já estão na camada estática. `comp[i] = −1` = célula não caminhável.
 * @param {import('../sim/Pathfinder.js').Pathfinder} pf
 * @returns {{comp: Int32Array, count: number}}
 */
export function landRegions(pf) {
  let cached = regionCache.get(pf);
  if (cached) return cached;
  const { cols, rows, staticGrid } = pf;
  const n = cols * rows;
  const comp = new Int32Array(n).fill(-1);
  const stack = new Int32Array(n);
  let count = 0;
  for (let s = 0; s < n; s++) {
    if (staticGrid[s] !== 1 || comp[s] !== -1) continue;
    let sp = 0;
    stack[sp++] = s;
    comp[s] = count;
    while (sp > 0) {
      const cur = stack[--sp];
      const c = cur % cols;
      const nb = [c > 0 ? cur - 1 : -1, c < cols - 1 ? cur + 1 : -1, cur >= cols ? cur - cols : -1, cur < n - cols ? cur + cols : -1];
      for (let k = 0; k < 4; k++) {
        const j = nb[k];
        if (j < 0 || staticGrid[j] !== 1 || comp[j] !== -1) continue;
        comp[j] = count;
        stack[sp++] = j;
      }
    }
    count++;
  }
  cached = { comp, count };
  regionCache.set(pf, cached);
  return cached;
}

/** Região (id ≥ 0) da célula de (x, z), ou −1 se não caminhável. */
export function regionAt(pf, x, z) {
  const { comp } = landRegions(pf);
  const g = pf.toGrid(x, z);
  return comp[g.r * pf.cols + g.c];
}

/**
 * A árvore (ou qualquer ponto de coleta) em (x, z) está encostada na região `region`? Basta a célula dela ou uma das 8
 * vizinhas pertencer à região: o peão corta de fora, a até ~1,6 u do tronco.
 */
export function pointReachable(pf, region, x, z) {
  if (region < 0) return false;
  const { comp } = landRegions(pf);
  const g = pf.toGrid(x, z);
  for (let dr = -1; dr <= 1; dr++) {
    const r = g.r + dr;
    if (r < 0 || r >= pf.rows) continue;
    for (let dc = -1; dc <= 1; dc++) {
      const c = g.c + dc;
      if (c < 0 || c >= pf.cols) continue;
      if (comp[r * pf.cols + c] === region) return true;
    }
  }
  return false;
}

/** Região terrestre da base da IA (célula do Centro; cai para o centro de base se o Centro não existe mais). */
export function baseRegion(director) {
  const pf = director.gm.pathfinder;
  if (!pf) return -1;
  const bs = director.gm.buildings;
  for (let i = 0; i < bs.length; i++) {
    const b = bs[i];
    if (b.ownerId === director.playerId && !b.isDead && b.type === director.hqType) {
      const r = regionAt(pf, b.mesh.position.x, b.mesh.position.z);
      if (r >= 0) return r;
    }
  }
  return regionAt(pf, director.baseCenter.x, director.baseCenter.y);
}

/** Posições {x, z} dos pontos de entrega de madeira concluídos e vivos do jogador (Centro e serrarias). */
export function woodDropoffs(gm, ownerId, out = []) {
  out.length = 0;
  const bs = gm.buildings;
  for (let i = 0; i < bs.length; i++) {
    const b = bs[i];
    if (b.ownerId !== ownerId || b.isDead || !b.isConstructed || !isDropoffFor(b.type, 'wood')) continue;
    out.push({ x: b.mesh.position.x, z: b.mesh.position.z });
  }
  return out;
}

const dropBuf = [];

/**
 * Oferta de madeira para a IA do `director` (ver o cabeçalho do arquivo). `trees` (mesma ordem de `gm.trees`) guarda as
 * árvores alcançáveis vivas — usado por `findGrove` e por quem precisa escolher árvore.
 * @param {import('./AIDirector.js').AIDirector} director
 */
export function analyzeWood(director) {
  const gm = director.gm;
  const pf = gm.pathfinder;
  const region = baseRegion(director);
  const drops = woodDropoffs(gm, director.playerId, dropBuf);
  const trees = [];
  let wood = 0;
  let nearest = Infinity;
  const all = gm.trees;
  for (let i = 0; i < all.length; i++) {
    const t = all[i];
    if (t.isDead || !(t.woodRemaining > 0)) continue;
    const p = t.mesh.position;
    if (pf && !pointReachable(pf, region, p.x, p.z)) continue;
    trees.push(t);
    wood += t.woodRemaining;
    for (let k = 0; k < drops.length; k++) {
      const d = fhypot(p.x - drops[k].x, p.z - drops[k].z);
      if (d < nearest) nearest = d;
    }
  }
  const count = trees.length;
  return {
    region,
    trees,
    count,
    wood,
    nearest,
    none: count === 0,
    far: count > 0 && nearest > FAR_TREE_DIST,
    low: wood < LOW_WOOD
  };
}

/**
 * Melhor local para uma serraria avançada: percorre a grade de 1,5 u sobre a região alcançável e pontua cada ponto pela madeira
 * das árvores a até `SITE_REACH` dele (peso linear: 1 colado, 0 no limite), descontando um pouco a distância à base. Só entram
 * pontos a ≥ `MIN_DROP_GAP` de qualquer entrega existente e com `canPlace(x, z)` verdadeiro (o chamador injeta
 * `gm.canPlaceBuilding` + alcançabilidade). Exige `MIN_SITE_VALUE` (≈ 2 árvores cheias a ~7 u). Ordem de varredura fixa e
 * empate pelo primeiro ponto: determinístico.
 * @returns {{x:number, z:number, value:number}|null}
 */
export function findLumberSite(director, outlook, canPlace) {
  const trees = outlook.trees;
  if (trees.length === 0) return null;
  const drops = woodDropoffs(director.gm, director.playerId, dropBuf);
  const base = director.baseCenter;
  let minX = Infinity; let maxX = -Infinity; let minZ = Infinity; let maxZ = -Infinity;
  for (let i = 0; i < trees.length; i++) {
    const p = trees[i].mesh.position;
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }
  const x0 = Math.floor((minX - SITE_REACH) / SITE_STEP) * SITE_STEP;
  const x1 = maxX + SITE_REACH;
  const z0 = Math.floor((minZ - SITE_REACH) / SITE_STEP) * SITE_STEP;
  const z1 = maxZ + SITE_REACH;
  const reachSq = SITE_REACH * SITE_REACH;
  let best = null;
  let bestScore = -Infinity;
  for (let x = x0; x <= x1; x += SITE_STEP) {
    for (let z = z0; z <= z1; z += SITE_STEP) {
      let value = 0;
      for (let i = 0; i < trees.length; i++) {
        const p = trees[i].mesh.position;
        const dx = p.x - x;
        const dz = p.z - z;
        const dSq = dx * dx + dz * dz;
        if (dSq < reachSq) value += trees[i].woodRemaining * (1 - Math.sqrt(dSq) / SITE_REACH);
      }
      if (value < MIN_SITE_VALUE) continue;
      const score = value - 0.5 * fhypot(x - base.x, z - base.y);
      if (score <= bestScore) continue;
      let tooClose = false;
      for (let k = 0; k < drops.length; k++) {
        if (fhypot(x - drops[k].x, z - drops[k].z) < MIN_DROP_GAP) { tooClose = true; break; }
      }
      if (tooClose || !canPlace(x, z)) continue;
      bestScore = score;
      best = { x, z, value };
    }
  }
  return best;
}
