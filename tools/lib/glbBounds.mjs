// Medição de .glb em Node puro (sem three/GPU): bounding box do nó raiz a partir do JSON do glTF
// (matrizes dos nós + min/max dos acessores POSITION, que existem mesmo em arquivos meshopt).
import fs from 'node:fs';

function readJson(file) {
  const buf = fs.readFileSync(file);
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error(`${file}: não é .glb`);
  const len = buf.readUInt32LE(12);
  return JSON.parse(buf.toString('utf8', 20, 20 + len));
}

const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const mul = (a, b) => { // matrizes 4x4 column-major
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
};
function local(n, noTranslation = false) {
  if (n.matrix) {
    const m = n.matrix.slice();
    if (noTranslation) { m[12] = 0; m[13] = 0; m[14] = 0; }
    return m;
  }
  const [x, y, z, w] = n.rotation || [0, 0, 0, 1];
  const [sx, sy, sz] = n.scale || [1, 1, 1];
  const [tx, ty, tz] = noTranslation ? [0, 0, 0] : (n.translation || [0, 0, 0]);
  return [
    (1 - 2 * (y * y + z * z)) * sx, (2 * (x * y + z * w)) * sx, (2 * (x * z - y * w)) * sx, 0,
    (2 * (x * y - z * w)) * sy, (1 - 2 * (x * x + z * z)) * sy, (2 * (y * z + x * w)) * sy, 0,
    (2 * (x * z + y * w)) * sz, (2 * (y * z - x * w)) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    tx, ty, tz, 1
  ];
}

/**
 * Bounding box das malhas do .glb no espaço do jogo: a raiz `rootName` fica em (0,0,0) (como em `glbModels.loadOne`),
 * mantendo a escala/rotação dela. Sem `rootName`, mede a cena inteira.
 * @returns {{min:number[],max:number[],size:number[]}}
 */
export function glbBounds(file, rootName = null) {
  const g = readJson(file);
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  const visit = (i, parent, root = false) => {
    const n = g.nodes[i];
    const m = mul(parent, local(n, root));
    if (n.mesh !== undefined) {
      for (const p of g.meshes[n.mesh].primitives) {
        const a = g.accessors[p.attributes.POSITION];
        for (let c = 0; c < 8; c++) {
          const v = [c & 1 ? a.max[0] : a.min[0], c & 2 ? a.max[1] : a.min[1], c & 4 ? a.max[2] : a.min[2]];
          for (let k = 0; k < 3; k++) {
            const w = m[k] * v[0] + m[4 + k] * v[1] + m[8 + k] * v[2] + m[12 + k];
            min[k] = Math.min(min[k], w);
            max[k] = Math.max(max[k], w);
          }
        }
      }
    }
    for (const c of n.children || []) visit(c, m);
  };
  const scene = g.scenes[g.scene || 0];
  const find = (i, parent) => {
    const m = mul(parent, local(g.nodes[i]));
    if (g.nodes[i].name === rootName) return { i, parent };
    for (const c of g.nodes[i].children || []) { const r = find(c, m); if (r) return r; }
    return null;
  };
  let hit = null;
  if (rootName) for (const r of scene.nodes) { hit = find(r, I); if (hit) break; }
  // O jogo remove a raiz do pai (`root.parent.remove`): as transformações dos ancestrais não contam.
  if (hit) visit(hit.i, I, true);
  else for (const r of scene.nodes) visit(r, I);
  return { min, max, size: max.map((v, i) => v - min[i]) };
}
