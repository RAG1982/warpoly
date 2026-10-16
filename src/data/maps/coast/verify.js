/**
 * src/data/maps/coast/verify.js (MUNDO-TERRENO-MAPAS §2.2 passo 6 e §7 · MUNDO-1)
 *
 * Verificações do mapa gerado. `verifyCoastMap` confere a GEOGRAFIA (cada massa de terra conectada, lagoas, rota naval, altura coerente
 * com as máscaras, lava e rios); `verifyCoastWorld` confere o MAPA ASSADO com bases, jazidas, florestas e poços (base em terra seca,
 * conectividade terrestre no `Pathfinder` real, madeira por jogador e rota naval). Ambas devolvem `{ ok, failures, checks }`:
 * `failures` são mensagens curtas (`<código>: <detalhe>`), vazias quando tudo passa.
 */
import { labelComponents } from './grid.js';
import { LAND_HEIGHT, LAVA_HEIGHT, FORD_HEIGHT, WOOD_TARGET } from './constants.js';
import { walkableMask } from './rivers.js';
import { rotateIndex } from './rotate.js';
import { estimateWood, BASE_CLEARANCE } from './layout.js';
import { buildPathfinder, floodFill, isReached } from '../generator.js';
import { NAVAL_MAX_HEIGHT } from '../../combat.js';

/** Faixa de terra aceita por padrão (proporção da grade): protótipo 25–50 %. */
export const DEFAULT_LAND_RANGE = Object.freeze([0.25, 0.5]);

/**
 * Verifica a geografia de um mapa gerado.
 * @param {object} map  saída de `generateCoast`/`generateIrregularCoast`
 * @param {{ landRange?: number[], minRivers?: number, requireLava?: boolean }} [opts]
 */
export function verifyCoastMap(map, opts = {}) {
  const { grid: G, land, owner, entities, height, cell } = map;
  const o = map.options;
  const N = G * G;
  const failures = [];
  const fail = (code, detail) => failures.push(`${code}: ${detail}`);
  const st = map.stats;
  const lv = map.lava, rv = map.rivers;

  // 1. cada entidade é UMA massa de terra e não há fragmentos soltos
  if (st.landComponents !== entities.length) fail('componentes', `${st.landComponents} massas de terra para ${entities.length} entidades`);
  st.entityComponents.forEach((n, k) => { if (n !== 1) fail('entidade-partida', `${entities[k].id} tem ${n} pedaços`); });
  for (const e of entities) if (!(e.area > 10)) fail('entidade-minuscula', `${e.id} com ${e.area.toFixed(1)} u²`);

  // 2. lagoas: recontagem independente (toda água que não toca o oceano tem >= minLake células)
  const water = new Uint8Array(N);
  for (let c = 0; c < N; c++) water[c] = land[c] ? 0 : 1;
  const wl = labelComponents(water, G, 1);
  const ocean = wl.labels[0];
  wl.sizes.forEach((n, id) => { if (id !== ocean && n < o.minLake) fail('lagoa-pequena', `lagoa de ${n} células (< ${o.minLake})`); });
  if (water[0] !== 1) fail('borda', 'a célula [0,0] não é mar');
  for (let i = 0; i < G; i++) if (land[i] || land[(G - 1) * G + i] || land[i * G] || land[i * G + G - 1]) { fail('borda', 'terra encostada na borda do mapa'); break; }

  // 3. rota naval: o mar a >= 2 células da terra é quase todo um componente só e toca todas as entidades
  if (!(st.seaMainFraction > 0.95)) fail('rota-naval', `mar principal com ${(st.seaMainFraction * 100).toFixed(1)} % (< 95 %)`);
  if (!st.allEntitiesReachableBySea) fail('rota-naval', 'alguma entidade não toca o mar principal');

  // 4. proporção de terra
  const [lo, hi] = opts.landRange ?? DEFAULT_LAND_RANGE;
  if (!(st.landFraction > lo && st.landFraction < hi)) fail('terra', `${(st.landFraction * 100).toFixed(1)} % fora de ${lo * 100}–${hi * 100} %`);

  // 5. altura coerente com as máscaras (lava = 0,4; água de rio < 0,65; vau >= 2,3; terra seca >= 0,65; mar < 0,65)
  let badH = 0;
  for (let c = 0; c < N && badH < 3; c++) {
    const isLava = lv && lv.mask[c], isRiver = rv && rv.mask[c], isFord = rv && rv.ford[c];
    const h = height[c];
    let ok;
    if (!land[c]) ok = h < LAND_HEIGHT;
    else if (isLava) ok = Math.abs(h - LAVA_HEIGHT) < 1e-5;
    else if (isRiver) ok = h < LAND_HEIGHT;
    else if (isFord) ok = h >= FORD_HEIGHT - 0.06;
    else ok = h >= LAND_HEIGHT;
    if (!ok) { badH++; fail('altura', `célula ${c} (${c % G},${(c - (c % G)) / G}) com h=${h.toFixed(2)} incoerente com a máscara`); }
  }

  // 6. lava (ilha vulcânica): válida, com >= 2 áreas
  if (o.lava && entities.some((e) => e.biome === 'volcanic' && e.area > 200 * cell * cell)) {
    if (!lv) fail('lava', 'ilha vulcânica sem divisor de lava');
    else if (lv.areaCount < 2) fail('lava', `lava com ${lv.areaCount} área`);
  }

  // 7. rios: nascem e chegam ao mar, têm vaus e não partem a terra caminhável
  if (o.rivers > 0) {
    const want = (opts.minRivers ?? 1) * (o.symmetry === 'rotate' ? 2 : 1);
    if (!rv || rv.count < want) fail('rios', `${rv ? rv.count : 0} rios (< ${want})`);
    if (rv) {
      for (const s of rv.streams) {
        if (s.length < 20) fail('rio-curto', `rio de ${s.length} u (< 20)`);
        if (s.length > 28 && s.fords < 1) fail('rio-sem-vau', `rio de ${s.length} u sem vau`);
        if (s.width < o.riverWidth[0] - 0.01 || s.width > o.riverWidth[1] + 0.01) fail('rio-largura', `${s.width} u fora de ${o.riverWidth.join('–')}`);
      }
      const walk = walkableMask(map);
      const wc = labelComponents(walk, G, 1);
      const walkPerEntity = new Map();
      for (let c = 0; c < N; c++) if (walk[c] && owner[c] >= 0) { const set = walkPerEntity.get(owner[c]) ?? new Set(); set.add(wc.labels[c]); walkPerEntity.set(owner[c], set); }
      for (const [idx, set] of walkPerEntity) if (set.size !== 1 && !lv?.mask) fail('rio-parte-terra', `${entities[idx]?.id} partido em ${set.size} regiões caminháveis`);
      for (let c = 0; c < N; c++) if (rv.mask[c] && rv.ford[c]) { fail('rio-vau', 'célula de água que também é vau'); break; }
      // a água de cada rio toca o oceano (a foz)
      const rl = labelComponents(rv.mask, G, 1);
      const touches = new Set();
      for (let c = 0; c < N; c++) {
        if (!rv.mask[c]) continue;
        const i = c % G;
        if ((i > 0 && wl.labels[c - 1] === ocean) || (i < G - 1 && wl.labels[c + 1] === ocean) || (c >= G && wl.labels[c - G] === ocean) || (c < N - G && wl.labels[c + G] === ocean)) touches.add(rl.labels[c]);
      }
      if (touches.size < 1) fail('rio-foz', 'nenhum rio chega ao mar');
    }
  }

  // 8. simetria 'rotate': terra, altura e bioma exatamente simétricos
  if (o.symmetry === 'rotate') {
    let asym = 0;
    for (let c = 0; c < N && asym < 3; c++) {
      const r = rotateIndex(c, G);
      if (land[c] !== land[r] || height[c] !== height[r] || map.biome[c] !== map.biome[r]) { asym++; fail('simetria', `célula ${c} difere da girada ${r}`); }
    }
  }
  return { ok: failures.length === 0, failures, checks: { components: st.landComponents, entities: entities.length, landFraction: st.landFraction, seaMainFraction: st.seaMainFraction, lakes: map.lakes.length, rivers: rv ? rv.count : 0, lavaAreas: lv ? lv.areaCount : 0 } };
}

// ---------------------------------------------------------------------------------------------
// Mundo assado (mapDef com bases, jazidas, florestas e poços)
// ---------------------------------------------------------------------------------------------
const hyp = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

/**
 * Verifica o mapa jogável assado (`mapDef`) contra o `Pathfinder` real e as regras de §2.4.
 * @param {object} mapDef  saída de `bakeToMapDef`/`buildCoastMapDef`
 * @param {{ naval?: boolean, woodTarget?: number, woodSeeds?: number[], field?: object }} [opts]
 * @returns {{ ok: boolean, failures: string[], checks: object }}
 */
export function verifyCoastWorld(mapDef, opts = {}) {
  const failures = [];
  const fail = (code, detail) => failures.push(`${code}: ${detail}`);
  const { startSlots: slots, resources, forests, fords } = mapDef;
  const target = opts.woodTarget ?? WOOD_TARGET;
  const half = mapDef.playable / 2;
  const checks = { wood: [], reach: [], naval: null };

  const land = buildPathfinder(mapDef, 'land');
  const hAt = (p) => land.terrain.getHeight(p.x, p.z);

  // bases: terra seca com 14 u de folga, dentro da área jogável
  slots.forEach((s, i) => {
    if (!(Math.abs(s.x) < half && Math.abs(s.z) < half)) fail('base-fora', `base ${i} fora da área jogável`);
    let worst = Infinity;
    for (let a = 0; a < 24; a++) for (const rho of [4, 8, 12, BASE_CLEARANCE - 1]) {
      const h = land.terrain.getHeight(s.x + Math.cos((a / 24) * Math.PI * 2) * rho, s.z + Math.sin((a / 24) * Math.PI * 2) * rho);
      worst = Math.min(worst, h);
    }
    if (hAt(s) < 1.95 || worst < 1.8) fail('base-molhada', `base ${i} sem ${BASE_CLEARANCE} u de terra seca livre (pior altura ${worst.toFixed(2)})`);
  });
  for (const r of resources) {
    if (r.type === 'oil') continue;
    if (hAt(r) < 1.8) fail('jazida-molhada', `${r.type} em (${r.x}, ${r.z})`);
    if (!(Math.abs(r.x) < half && Math.abs(r.z) < half)) fail('jazida-fora', `${r.type} em (${r.x}, ${r.z}) fora da área jogável`);
  }
  for (const f of fords) if (hAt(f) < 1.8) fail('vau-molhado', `vau em (${f.x}, ${f.z})`);

  // conectividade terrestre: cada base alcança suas jazidas e seus bosques (flood fill 4-vizinhos no Pathfinder terrestre)
  const seenFrom = slots.map((s) => floodFill(land, s.x, s.z));
  const ownerOf = (p) => { let best = 0, bd = Infinity; slots.forEach((s, i) => { const d = hyp(p, s); if (d < bd) { bd = d; best = i; } }); return best; };
  for (const r of resources) {
    if (r.type === 'oil') continue;
    const b = ownerOf(r);
    if (!isReached(land, seenFrom[b], r.x, r.z)) fail('jazida-ilhada', `${r.type} (${r.x}, ${r.z}) sem caminho por terra da base ${b}`);
  }
  slots.forEach((s, i) => { checks.reach.push(slots.map((t, j) => isReached(land, seenFrom[i], t.x, t.z) ? j : -1).filter((j) => j >= 0)); });
  for (const f of forests) {
    if (!seenFrom.some((seen) => isReached(land, seen, f.x, f.z))) fail('bosque-ilhado', `bosque (${f.x}, ${f.z}) sem caminho por terra de nenhuma base`);
  }

  // madeira alcançável por jogador, estimada com sorteios independentes do planejador (as sementes de `woodSeeds`)
  const seeds = opts.woodSeeds ?? [1, 2, 3];
  const woods = slots.map(() => Infinity);
  for (const sd of seeds) {
    const est = estimateWood(mapDef, sd, (x, z) => land.terrain.getHeight(x, z), slots.map((_, i) => (x, z) => isReached(land, seenFrom[i], x, z)));
    est.forEach((w, i) => { woods[i] = Math.min(woods[i], w); });
  }
  woods.forEach((w, i) => { checks.wood.push(w); if (w < target) fail('madeira', `base ${i} alcança ${w} de madeira (< ${target})`); });
  if (slots.length >= 2) {
    const mx = Math.max(...woods), mn = Math.min(...woods);
    checks.woodRatio = mn / (mx || 1);
  }

  // rota naval (mapas navais): poços em água ligada ao oceano, cada base com costa para o Estaleiro ligada a todos os poços e às outras bases
  const wells = resources.filter((r) => r.type === 'oil');
  if (opts.naval) {
    if (wells.length < slots.length) fail('poços', `${wells.length} poços para ${slots.length} bases`);
    const sea = buildPathfinder(mapDef, 'naval');
    if (wells.length) {
      const water = floodFill(sea, wells[0].x, wells[0].z);
      for (const w of wells) if (!isReached(sea, water, w.x, w.z)) fail('poço-isolado', `poço (${w.x}, ${w.z}) fora do mar principal`);
      const dock = slots.map((s) => {
        for (let rho = 8; rho <= 60; rho += 1) {
          for (let a = 0; a < 36; a++) {
            const x = s.x + Math.cos((a / 36) * Math.PI * 2) * rho, z = s.z + Math.sin((a / 36) * Math.PI * 2) * rho;
            if (land.terrain.getHeight(x, z) < 1.8 || !sea.nearNavigable(x, z, 5.3)) continue;
            for (let dx = -6; dx <= 6; dx += 1.5) for (let dz = -6; dz <= 6; dz += 1.5) {
              if (Math.hypot(dx, dz) <= 5.3 && sea.isWalkableWorld(x + dx, z + dz) && isReached(sea, water, x + dx, z + dz)) return { x: x + dx, z: z + dz, rho };
            }
          }
        }
        return null;
      });
      dock.forEach((d, i) => { if (!d) fail('sem-costa', `base ${i} sem costa para o Estaleiro ligada ao mar dos poços`); });
      checks.naval = { wells: wells.length, docks: dock.map((d) => (d ? Math.round(d.rho) : null)) };
      // cada costa de base alcança as costas inimigas (mesmo componente de água)
      const docks = dock.filter(Boolean);
      for (const d of docks) if (!isReached(sea, water, d.x, d.z)) fail('costas-separadas', 'costas de base em componentes de água diferentes');
    }
  } else {
    for (const r of resources) if (r.type === 'oil' && hAt(r) > NAVAL_MAX_HEIGHT) fail('poço-raso', `poço (${r.x}, ${r.z}) raso`);
  }

  return { ok: failures.length === 0, failures, checks };
}

