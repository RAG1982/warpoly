/**
 * Cor de time (F7-02).
 *
 * Convenção de máscara: a "máscara" de team color de um modelo é o conjunto de malhas cujo material se chama
 * `TeamColor` (estandartes, capas, escudos, faixas, velas...). A textura do atlas (cinza/AO) permanece
 * compartilhada e o `color` do material multiplica a textura (máscara = 1 nessas malhas; 0 nas demais, que
 * nunca são tocadas). Materiais de time são cacheados por (material de origem, cor): N unidades do mesmo
 * jogador compartilham o mesmo material, nada é criado por frame e não há draw call extra por jogador.
 */
import * as THREE from 'three';
import { PLAYER_COLORS } from '../sim/MatchConfig.js';

export const TEAM_MATERIAL_NAME = 'TeamColor';
/** Paleta de 8 cores de time (a mesma das partidas: `PLAYER_COLORS`). */
export const TEAM_PALETTE = PLAYER_COLORS;

/**
 * Função de tingimento: cor final de um texel, dada a cor-base, a máscara (0..1) e a cor de time.
 * Máscara 0 mantém a base; 1 = base * time (multiplicação, como o `color` do material faz com a textura).
 * Entradas e saída: [r,g,b] em 0..1.
 */
export function teamTint(base, mask, team) {
  const m = Math.min(1, Math.max(0, mask));
  return [0, 1, 2].map(i => base[i] * (1 - m) + base[i] * team[i] * m);
}

const teamMatCache = new Map(); // material de origem -> Map(hex -> material tintado)

/** Material tintado (cacheado) para `src` na cor `color` (qualquer entrada aceita por THREE.Color). */
export function getTeamMaterial(src, color) {
  const c = new THREE.Color(color);
  const key = c.getHexString();
  let byColor = teamMatCache.get(src);
  if (!byColor) { byColor = new Map(); teamMatCache.set(src, byColor); }
  let m = byColor.get(key);
  if (!m) {
    m = src.clone();
    m.name = TEAM_MATERIAL_NAME;
    m.color.copy(c);
    byColor.set(key, m);
  }
  return m;
}

export function teamMaterialCacheSize() {
  let n = 0;
  for (const m of teamMatCache.values()) n += m.size;
  return n;
}

export function clearTeamMaterialCache() { teamMatCache.clear(); }

/**
 * Troca o material `TeamColor` de cada malha de `obj` (inclusive em arrays de materiais) pela variante na cor
 * do dono. Modelos sem máscara passam intactos. Idempotente; pode ser chamada de novo com outra cor.
 */
export function setTeamColor(obj, color) {
  if (!obj || color === undefined || color === null) return obj;
  obj.traverse(child => {
    if (!child.isMesh || !child.material) return;
    const ud = child.userData;
    if (Array.isArray(child.material)) {
      if (!child.material.some(m => m && m.name === TEAM_MATERIAL_NAME)) return;
      const srcs = ud.teamSrcMaterials || child.material.slice();
      ud.teamSrcMaterials = srcs;
      child.material = srcs.map(s => (s && s.name === TEAM_MATERIAL_NAME ? getTeamMaterial(s, color) : s));
      return;
    }
    if (child.material.name !== TEAM_MATERIAL_NAME) return;
    const src = ud.teamSrcMaterial || ud.origMaterial || child.material;
    ud.teamSrcMaterial = src;
    const m = getTeamMaterial(src, color);
    child.material = m;
    if (ud.origMaterial) ud.origMaterial = m;
  });
  return obj;
}

/** Há alguma malha com máscara de time em `obj`? */
export function hasTeamMask(obj) {
  let found = false;
  obj.traverse(c => {
    if (found || !c.isMesh || !c.material) return;
    const ms = Array.isArray(c.material) ? c.material : [c.material];
    if (ms.some(m => m && m.name === TEAM_MATERIAL_NAME)) found = true;
  });
  return found;
}
