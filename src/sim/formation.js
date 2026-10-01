/**
 * formation.js — F3-02: formação de grupo (lógica pura, sem three.js/DOM; testável em Node).
 *
 * `planFormation` distribui N unidades em linhas (frente → trás) voltadas para a direção do
 * deslocamento (do centro do grupo ao destino) e atribui cada unidade a um lugar mantendo a
 * ordem relativa em que ela já está (ordena por projeção ao longo da marcha e, dentro de cada
 * linha, por posição lateral) — assim os caminhos não se cruzam e a forma do grupo é preservada.
 * `groupSpeed` é a velocidade efetiva da unidade mais lenta (o grupo anda nela).
 *
 * Determinístico: só aritmética sobre os dados de entrada, desempates por `id`.
 */

/** Espaço mínimo entre unidades vizinhas na formação (mantém o visual do antigo grid de 1,6). */
export const MIN_SPACING = 1.6;
/** Proporção largura/profundidade da formação (mais larga que funda, como o WC2). */
export const FORMATION_ASPECT = 1.6;

/**
 * Menor velocidade efetiva do grupo (u/s). `members`: `[{speed}]` com a velocidade já multiplicada
 * pelos modificadores. Grupo vazio → 0 (= sem limite).
 */
export function groupSpeed(members) {
  let min = Infinity;
  for (let i = 0; i < members.length; i++) {
    const s = members[i].speed;
    if (s > 0 && s < min) min = s;
  }
  return min === Infinity ? 0 : min;
}

/**
 * @param {{id:number,x:number,z:number,radius:number}[]} members
 * @param {{x:number,z:number}} dest  centro da formação
 * @returns {Map<number,{x:number,z:number}>} id → lugar na formação
 */
export function planFormation(members, dest) {
  const out = new Map();
  const n = members.length;
  if (n === 0) return out;
  if (n === 1) {
    out.set(members[0].id, { x: dest.x, z: dest.z });
    return out;
  }

  let cx = 0;
  let cz = 0;
  let rSum = 0;
  for (let i = 0; i < n; i++) {
    cx += members[i].x;
    cz += members[i].z;
    rSum += members[i].radius || 0.6;
  }
  cx /= n;
  cz /= n;
  const spacing = Math.max(MIN_SPACING, 2 * (rSum / n) + 0.5);

  // Direção da marcha (frente) e lateral (direita da marcha).
  let fx = dest.x - cx;
  let fz = dest.z - cz;
  const len = Math.hypot(fx, fz);
  if (len < 1e-6) {
    fx = 0;
    fz = 1;
  } else {
    fx /= len;
    fz /= len;
  }
  const lx = -fz;
  const lz = fx;

  const cols = Math.max(1, Math.ceil(Math.sqrt(n * FORMATION_ASPECT)));
  const rows = Math.ceil(n / cols);

  // Unidades: da frente para trás (maior projeção em f primeiro), desempate por id.
  const sorted = members
    .map(m => ({ m, along: (m.x - cx) * fx + (m.z - cz) * fz, lat: (m.x - cx) * lx + (m.z - cz) * lz }))
    .sort((a, b) => (b.along - a.along) || (a.m.id - b.m.id));

  let idx = 0;
  for (let r = 0; r < rows; r++) {
    const inRow = Math.min(cols, n - idx);
    const row = sorted.slice(idx, idx + inRow).sort((a, b) => (a.lat - b.lat) || (a.m.id - b.m.id));
    idx += inRow;
    // linha 0 = frente: mais perto do destino no eixo da marcha (offset positivo)
    const along = ((rows - 1) / 2 - r) * spacing;
    for (let c = 0; c < inRow; c++) {
      const lat = (c - (inRow - 1) / 2) * spacing;
      out.set(row[c].m.id, { x: dest.x + fx * along + lx * lat, z: dest.z + fz * along + lz * lat });
    }
  }
  return out;
}
