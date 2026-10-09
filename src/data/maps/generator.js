/**
 * src/data/maps/generator.js (F8-02 · gerador procedural de mapas)
 *
 * `generateMap({ seed, players, size, naval, theme, forestDensity, symmetry })` → mapa JSON no mesmo formato de
 * `src/data/maps/*.json` (ver README.md desta pasta). Puro e determinístico: sem DOM, sem `Math.random`
 * (PRNG `mulberry32` do `src/sim/rng.js`) — mesma entrada ⇒ mesmo JSON.
 *
 * Desenho: N bases num círculo (simetria rotacional de N dobras; `symmetry: 'mirror'` espelha bases vizinhas, só para N par).
 * O terreno usa o gerador `islands` já existente: um disco de terra por base, um disco central (hub) ligado a cada base
 * por "pontes" de terra (espinhas), mais — em mapas terrestres — platôs de expansão neutros entre as bases e, às vezes,
 * um anel de pontes ligando bases vizinhas. Tudo o que se posiciona (minas, florestas, acampamentos, poços) é gerado
 * UMA vez em coordenadas locais e replicado por rotação/espelho, então as distâncias e quantidades por jogador são iguais.
 *
 * `naval: true`: bases em ilhas pequenas com costa para o Estaleiro, hub central de terra, mar entre as ilhas com poços de
 * petróleo (um "próprio" por base, voltado ao mar aberto, e um ou dois por vão entre bases) e ilhotas de acampamento nas espinhas.
 *
 * Garantias (verificadas antes de devolver; `Error` se violadas): bases/recursos/acampamentos/florestas em terra seca e
 * conectados por terra (flood fill na grade do `Pathfinder` terrestre); poços em água navegável e alcançáveis por mar
 * (grade naval) a partir da costa de cada base.
 */
import { mulberry32 } from '../../sim/rng.js';
import { getHeightForMap } from '../../sim/terrainGenerators.js';
import { Pathfinder } from '../../sim/Pathfinder.js';
import { NAVAL_MAX_HEIGHT } from '../combat.js';

export const GEN_LIMITS = Object.freeze({ minPlayers: 2, maxPlayers: 8, minSize: 96, maxSize: 192 });
export const GEN_THEMES = Object.freeze(['verdejante', 'ilhas']);
export const GEN_SYMMETRIES = Object.freeze(['rotational', 'mirror']);

/** Perfis geométricos: `rb` raio da ilha da base, `edge` folga entre a borda jogável e o centro da base, `sep` distância mínima entre bases vizinhas. */
const PROFILES = Object.freeze({
  land: { rb: 26, edge: 22, sep: 32, falloff: 10, baseHeight: 2.6 },
  naval: { rb: 17, edge: 27, sep: 48, falloff: 6, baseHeight: 2.6 }
});

const DRY_MIN = 1.95; // altura mínima exigida de terra seca para bases/recursos (o jogo aceita ≥ 1,8)
const OIL_MAX = NAVAL_MAX_HEIGHT - 0.05;
const r2 = (v) => Math.round(v * 100) / 100 + 0;

/** Menor lado de mapa que comporta `players` jogadores (bases afastadas o suficiente); no mínimo 96. */
export function minMapSize(players, naval = false) {
  const p = naval ? PROFILES.naval : PROFILES.land;
  const half = p.edge + p.sep / (2 * Math.sin(Math.PI / players));
  return Math.max(GEN_LIMITS.minSize, 2 * Math.ceil(half + 4));
}

function normalizeOptions(opts = {}) {
  const o = {
    seed: opts.seed ?? 1,
    players: opts.players ?? 2,
    size: opts.size ?? 128,
    naval: !!opts.naval,
    theme: opts.theme ?? (opts.naval ? 'ilhas' : 'verdejante'),
    forestDensity: opts.forestDensity ?? 1,
    symmetry: opts.symmetry ?? 'rotational'
  };
  if (!Number.isFinite(Number(o.seed))) throw new Error('generateMap: seed inválida');
  o.seed = Number(o.seed) >>> 0;
  if (!Number.isInteger(o.players) || o.players < GEN_LIMITS.minPlayers || o.players > GEN_LIMITS.maxPlayers) {
    throw new Error(`generateMap: players deve ser um inteiro ${GEN_LIMITS.minPlayers}..${GEN_LIMITS.maxPlayers}`);
  }
  if (!Number.isFinite(o.size) || o.size > GEN_LIMITS.maxSize) throw new Error(`generateMap: size máximo ${GEN_LIMITS.maxSize}`);
  if (!GEN_THEMES.includes(o.theme)) throw new Error(`generateMap: tema desconhecido "${o.theme}" (${GEN_THEMES.join(', ')})`);
  if (!GEN_SYMMETRIES.includes(o.symmetry)) throw new Error(`generateMap: simetria desconhecida "${o.symmetry}"`);
  if (!(o.forestDensity >= 0 && o.forestDensity <= 3)) throw new Error('generateMap: forestDensity deve estar em 0..3');
  const min = minMapSize(o.players, o.naval);
  if (min > GEN_LIMITS.maxSize) throw new Error(`generateMap: ${o.players} jogadores${o.naval ? ' (naval)' : ''} não cabem em ${GEN_LIMITS.maxSize}`);
  o.sizeRequested = o.size;
  o.size = Math.max(min, Math.round(o.size / 2) * 2); // o tamanho é elevado ao mínimo que comporta os jogadores
  if (o.symmetry === 'mirror' && o.players % 2 !== 0) o.symmetry = 'rotational'; // espelho exige N par
  return o;
}

/** Distância assinada (negativa = dentro) até a união de discos e pontes; mesma geometria do gerador `islands`. */
function makeSignedDistance(discs, bridges) {
  return (x, z) => {
    let d = Infinity;
    for (const c of discs) d = Math.min(d, Math.hypot(x - c.x, z - c.z) - c.r);
    for (const b of bridges) {
      const dx = b.x2 - b.x1;
      const dz = b.z2 - b.z1;
      const lenSq = dx * dx + dz * dz || 1e-6;
      const u = Math.max(0, Math.min(1, ((x - b.x1) * dx + (z - b.z1) * dz) / lenSq));
      d = Math.min(d, Math.hypot(x - (b.x1 + u * dx), z - (b.z1 + u * dz)) - b.w / 2);
    }
    return d;
  };
}

/** Pathfinder (terrestre ou naval) sobre um mapa gerado, sem `Terrain`/DOM. */
export function buildPathfinder(mapDef, mode = 'land') {
  const terrain = { mapDef, getHeight: (x, z) => getHeightForMap(mapDef, x, z) };
  return new Pathfinder(terrain, mapDef.playable / 2, 1.5, mode);
}

/** Flood fill 4-vizinhos na grade estática; devolve `Uint8Array` (1 = alcançado) a partir da célula de (x, z). */
export function floodFill(pf, x, z) {
  const seen = new Uint8Array(pf.numCells);
  const { c, r } = pf.toGrid(x, z);
  const start = r * pf.cols + c;
  if (pf.staticGrid[start] !== 1) return seen;
  const stack = [start];
  seen[start] = 1;
  while (stack.length) {
    const i = stack.pop();
    const cc = i % pf.cols;
    const rr = (i - cc) / pf.cols;
    if (cc > 0 && !seen[i - 1] && pf.staticGrid[i - 1] === 1) { seen[i - 1] = 1; stack.push(i - 1); }
    if (cc < pf.cols - 1 && !seen[i + 1] && pf.staticGrid[i + 1] === 1) { seen[i + 1] = 1; stack.push(i + 1); }
    if (rr > 0 && !seen[i - pf.cols] && pf.staticGrid[i - pf.cols] === 1) { seen[i - pf.cols] = 1; stack.push(i - pf.cols); }
    if (rr < pf.rows - 1 && !seen[i + pf.cols] && pf.staticGrid[i + pf.cols] === 1) { seen[i + pf.cols] = 1; stack.push(i + pf.cols); }
  }
  return seen;
}

/** `true` se (x, z) cai numa célula marcada em `seen` (resultado de `floodFill`). */
export function isReached(pf, seen, x, z) {
  const { c, r } = pf.toGrid(x, z);
  return seen[r * pf.cols + c] === 1;
}

/**
 * Gera o mapa. Veja o cabeçalho do arquivo. Opções: `seed` (0 .. 2^32−1), `players` (2..8), `size` (96..192; elevado ao mínimo
 * `minMapSize` quando pequeno demais), `naval`, `theme` ('verdejante'|'ilhas'), `forestDensity` (0..3, padrão 1),
 * `symmetry` ('rotational'|'mirror').
 * @returns {object} mapa no formato de `src/data/maps/README.md` (+ `generated: true` e `generator` com as opções efetivas)
 */
export function generateMap(options = {}) {
  const o = normalizeOptions(options);
  const N = o.players;
  const prof = o.naval ? PROFILES.naval : PROFILES.land;
  const root = mulberry32(o.seed ^ 0x9e3779b9);
  const rngShape = root.fork('shape');
  const rngScatter = root.fork('scatter');

  const playable = o.size - 8;
  const half = playable / 2;
  const mirror = o.symmetry === 'mirror';
  const rb = prof.rb + (o.naval ? 0 : Math.round(rngShape.range(-1, 2)));
  const R = half - prof.edge;
  const theta0 = N <= 4 && N % 2 === 0 ? Math.PI / 4 : -Math.PI / 2;
  const U = (i) => { const a = theta0 + (2 * Math.PI * i) / N; return { x: Math.cos(a), z: Math.sin(a) }; };
  const flip = (i) => (mirror && i % 2 === 1 ? -1 : 1);
  /** Ponto do jogador `i` em coordenadas (rad = distância ao centro, tan = deslocamento lateral). */
  const at = (i, rad, tan) => {
    const u = U(i);
    const s = flip(i) * tan;
    return { x: u.x * rad - u.z * s, z: u.z * rad + u.x * s };
  };
  const images = (rad, tan) => Array.from({ length: N }, (_, i) => at(i, rad, tan));
  const gapAngle = (k) => theta0 + (2 * Math.PI * k) / N + Math.PI / N;
  const gapPoint = (k, rad) => ({ x: Math.cos(gapAngle(k)) * rad, z: Math.sin(gapAngle(k)) * rad });

  // ---------- Terreno: discos + pontes ----------
  const discs = [];
  const bridges = [];
  const slots = Array.from({ length: N }, (_, i) => at(i, R, 0));
  slots.forEach((s) => discs.push({ x: s.x, z: s.z, r: rb }));
  const hubR = o.naval ? rngShape.range(7, 10) : Math.max(9, R * rngShape.range(0.22, 0.34));
  discs.push({ x: 0, z: 0, r: hubR });
  const spokeW = o.naval ? 8 : rngShape.range(11, 14);
  slots.forEach((s) => bridges.push({ x1: 0, z1: 0, x2: s.x, z2: s.z, w: spokeW }));

  const expansions = []; // platôs neutros (terra) entre as bases
  const outposts = []; // ilhotas de acampamento nas espinhas (naval)
  if (!o.naval) {
    // raio da expansão: o maior (mais afastado do centro) que ainda fica a ≥ 26 de qualquer base e fora do hub
    let rE = R * 0.3;
    for (let f = 0.95; f >= 0.3; f -= 0.05) {
      const p = gapPoint(0, R * f);
      if (Math.hypot(p.x - slots[0].x, p.z - slots[0].z) >= 26 && Math.hypot(p.x - slots[1].x, p.z - slots[1].z) >= 26) { rE = R * f; break; }
    }
    for (let k = 0; k < N; k++) {
      const p = gapPoint(k, rE);
      expansions.push(p);
      discs.push({ x: p.x, z: p.z, r: 15 });
      bridges.push({ x1: 0, z1: 0, x2: p.x, z2: p.z, w: 10 });
    }
    if (N >= 3 && rngShape.next() < 0.5) {
      for (let i = 0; i < N; i++) bridges.push({ x1: slots[i].x, z1: slots[i].z, x2: slots[(i + 1) % N].x, z2: slots[(i + 1) % N].z, w: 9 });
    }
  } else if (R - 25 - hubR >= 16) {
    const rO = (hubR + R - 25) / 2;
    for (let i = 0; i < N; i++) {
      const p = at(i, rO, 0);
      outposts.push(p);
      discs.push({ x: p.x, z: p.z, r: 13 });
    }
  }
  const signed = makeSignedDistance(discs, bridges);
  const depth = (p) => -signed(p.x, p.z); // >0: dentro da terra

  // ---------- Recursos por jogador ----------
  const resources = [];
  const mineOffsets = o.naval
    ? { gold: [2, 10], stone: [2, -10.5] }
    : { gold: [4, 14.5], stone: [4, -16.5] };
  for (let i = 0; i < N; i++) {
    const gp = at(i, R + mineOffsets.gold[0], mineOffsets.gold[1]);
    const sp = at(i, R + mineOffsets.stone[0], mineOffsets.stone[1]);
    resources.push({ type: 'gold', x: r2(gp.x), z: r2(gp.z) });
    resources.push({ type: 'stone', x: r2(sp.x), z: r2(sp.z) });
  }
  resources.push({ type: 'gold', x: 0, z: 0 }); // ponto de disputa no centro do hub

  // ---------- Neutros ----------
  const neutrals = [];
  const guards = 3 + rngScatter.int(3);
  const campPoints = o.naval ? outposts : expansions;
  for (const p of campPoints) {
    neutrals.push({ kind: 'camp', x: r2(p.x), z: r2(p.z), guards, reward: { gold: 300 }, deposit: { type: 'gold', amount: 3000 } });
  }

  // Posições já ocupadas (para afastar florestas/critters): {x,z,d} = distância mínima exigida
  const taken = [];
  resources.forEach((r) => taken.push({ x: r.x, z: r.z, d: 8 }));
  campPoints.forEach((c) => taken.push({ x: c.x, z: c.z, d: 12 }));

  /** Tenta achar um candidato (rad, tan) tal que TODAS as N imagens fiquem válidas; devolve as imagens ou null. */
  const scatter = (radMin, radMax, minDepth, tries, minSlot) => {
    for (let t = 0; t < tries; t++) {
      const rad = rngScatter.range(radMin, radMax);
      const w = Math.min(rad * Math.tan(Math.min(Math.PI / N, 1.2)), rb + 12);
      const tan = rngScatter.range(-w, w);
      const imgs = images(rad, tan);
      let ok = true;
      for (let a = 0; a < imgs.length && ok; a++) {
        const p = imgs[a];
        if (Math.max(Math.abs(p.x), Math.abs(p.z)) > half - 7) ok = false;
        else if (depth(p) < minDepth) ok = false;
        else if (taken.some((q) => Math.hypot(p.x - q.x, p.z - q.z) < q.d)) ok = false;
        else if (minSlot && slots.some((s) => Math.hypot(p.x - s.x, p.z - s.z) < minSlot)) ok = false;
        for (let b = a + 1; b < imgs.length && ok; b++) if (Math.hypot(p.x - imgs[b].x, p.z - imgs[b].z) < 12) ok = false;
      }
      if (ok) return imgs;
    }
    return null;
  };

  // ---------- Florestas ----------
  const forests = [];
  const perSector = Math.round((o.naval ? 4 : 5) * o.forestDensity * (0.8 + rngScatter.next() * 0.5));
  const species = ['oak', 'pine', 'autumn'];
  for (let f = 0; f < perSector; f++) {
    const radius = r2(rngScatter.range(4.5, 6));
    const count = 5 + rngScatter.int(3);
    const sp = species[rngScatter.int(3)];
    // F8-01: bosque a ≥ 27 dos pátios (regra NEW-45) e raio 6 dentro da área jogável (NEW-46): minSlot 27, margem de 7
    const imgs = scatter(R * 0.15, R + rb * 0.9, 3, 300, 27);
    if (!imgs) continue;
    imgs.forEach((p) => {
      forests.push({ x: r2(p.x), z: r2(p.z), count, radius, species: sp });
      taken.push({ x: p.x, z: p.z, d: 9 });
    });
  }

  // ---------- Critters (rebanhos perto de cada base; no máximo 40 no mapa) ----------
  const flockCount = Math.min(4, Math.floor(40 / N));
  const flockSpecies = rngScatter.next() < 0.5 ? 'sheep' : 'pig';
  const flock = flockCount > 0 ? scatter(R - rb, R + rb * 0.6, 6, 80, 10) : null;
  if (flock) {
    flock.forEach((p) => neutrals.push({ kind: 'critters', species: flockSpecies, x: r2(p.x), z: r2(p.z), count: flockCount, radius: 5 }));
  }

  // ---------- Naval: poços de petróleo ----------
  if (o.naval) {
    // um poço "próprio" por base, voltado ao mar aberto
    const rOwn = R + rb + 5;
    for (let i = 0; i < N; i++) {
      const p = at(i, rOwn, 0);
      resources.push({ type: 'oil', x: r2(p.x), z: r2(p.z), amount: 5000 });
    }
    // 1–2 poços por vão entre bases, na linha de espelho: menor raio com água livre; o segundo, mais afastado
    const wellRads = [];
    for (let rad = hubR + 6; rad <= half - 5; rad += 1) {
      const p = gapPoint(0, rad);
      if (signed(p.x, p.z) >= 9 && (wellRads.length === 0 || rad - wellRads[wellRads.length - 1] >= 16)) wellRads.push(rad);
      if (wellRads.length === 2) break;
    }
    for (const rad of wellRads) {
      for (let k = 0; k < N; k++) {
        const p = gapPoint(k, rad);
        resources.push({ type: 'oil', x: r2(p.x), z: r2(p.z), amount: 5000 });
      }
    }
  }

  // ---------- Montagem ----------
  const id = `gen-${o.seed}-${N}p-${o.size}${o.naval ? '-naval' : ''}${mirror ? '-m' : ''}`;
  const mapDef = {
    id,
    name: `Gerado #${o.seed}${o.naval ? ' (naval)' : ''}`,
    size: o.size,
    playable,
    tileset: o.theme,
    waterLevel: 0.5,
    maxPlayers: N,
    generated: true,
    generator: { seed: o.seed, players: N, size: o.size, naval: o.naval, theme: o.theme, forestDensity: o.forestDensity, symmetry: o.symmetry },
    terrain: {
      generator: 'islands',
      params: {
        baseHeight: prof.baseHeight,
        coast: { falloff: prof.falloff },
        islands: discs.map((c) => ({ x: r2(c.x), z: r2(c.z), rx: r2(c.r), rz: r2(c.r) })),
        bridges: bridges.map((b) => ({ x1: r2(b.x1), z1: r2(b.z1), x2: r2(b.x2), z2: r2(b.z2), width: r2(b.w) }))
      }
    },
    fords: [],
    startSlots: slots.map((s) => ({ x: r2(s.x), z: r2(s.z), mirror: [s.x >= 0 ? 1 : -1, s.z <= 0 ? 1 : -1] })),
    resources,
    forests,
    neutrals,
    decorationDensity: 1.0
  };
  verifyMap(mapDef, o);
  return mapDef;
}

/** Valida o mapa gerado (altura, conectividade terrestre, acesso naval); lança `Error` na primeira violação. */
export function verifyMap(mapDef, o = { naval: mapDef.generator?.naval }) {
  const fail = (msg) => { throw new Error(`generateMap(seed ${mapDef.generator?.seed}): ${msg}`); };
  const h = (p) => getHeightForMap(mapDef, p.x, p.z);
  mapDef.startSlots.forEach((s, i) => { if (h(s) < DRY_MIN) fail(`base ${i} fora de terra seca`); });
  for (const r of mapDef.resources) {
    if (r.type === 'oil') { if (h(r) > OIL_MAX) fail(`poço em (${r.x}, ${r.z}) sem profundidade navegável`); }
    else if (h(r) < DRY_MIN) fail(`recurso ${r.type} em (${r.x}, ${r.z}) fora de terra seca`);
  }
  for (const n of mapDef.neutrals) if (n.kind === 'camp' && h(n) < DRY_MIN) fail(`acampamento em (${n.x}, ${n.z}) fora de terra seca`);
  for (const f of mapDef.forests) if (h(f) < DRY_MIN) fail(`floresta em (${f.x}, ${f.z}) fora de terra seca`);

  const land = buildPathfinder(mapDef, 'land');
  const seen = floodFill(land, mapDef.startSlots[0].x, mapDef.startSlots[0].z);
  const mustReach = [
    ...mapDef.startSlots,
    ...mapDef.resources.filter((r) => r.type !== 'oil'),
    ...mapDef.neutrals.filter((n) => n.kind === 'camp'),
    ...mapDef.forests
  ];
  for (const p of mustReach) if (!isReached(land, seen, p.x, p.z)) fail(`ponto (${p.x}, ${p.z}) sem conexão terrestre com as bases`);

  if (o.naval) {
    const sea = buildPathfinder(mapDef, 'naval');
    const wells = mapDef.resources.filter((r) => r.type === 'oil');
    if (wells.length === 0) fail('mapa naval sem poços');
    const water = floodFill(sea, wells[0].x, wells[0].z);
    for (const w of wells) if (!isReached(sea, water, w.x, w.z)) fail(`poço (${w.x}, ${w.z}) inacessível por mar`);
    mapDef.startSlots.forEach((s, i) => {
      let coast = false;
      for (let rho = 8; rho <= 26 && !coast; rho += 1) {
        for (let a = 0; a < 24 && !coast; a++) {
          const x = s.x + Math.cos((a / 24) * Math.PI * 2) * rho;
          const z = s.z + Math.sin((a / 24) * Math.PI * 2) * rho;
          if (getHeightForMap(mapDef, x, z) >= 1.8 && sea.nearNavigable(x, z, 5.3)) {
            // alguma célula navegável alcançável pelo mar encostada no ponto
            for (let dx = -6; dx <= 6 && !coast; dx += 1.5) for (let dz = -6; dz <= 6 && !coast; dz += 1.5) {
              if (Math.hypot(dx, dz) <= 5.3 && sea.isWalkableWorld(x + dx, z + dz) && isReached(sea, water, x + dx, z + dz)) coast = true;
            }
          }
        }
      }
      if (!coast) fail(`base ${i} sem costa para Estaleiro ligada ao mar dos poços`);
    });
  }
}
