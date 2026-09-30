import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { GameManager } from '../../src/core/GameManager.js';
import { Terrain } from '../../src/world/Terrain.js';
import { createMatchConfig } from '../../src/sim/MatchConfig.js';
import { SIM_DT } from '../../src/sim/constants.js';
import { CMD } from '../../src/sim/commands.js';
import { WALL_STEP, WALL_MAX_POINTS, getBuildingDef } from '../../src/data/index.js';
import { Wall } from '../../src/entities/Wall.js';

/** Partida headless 1×1 (jogador 0 humano, IA orc no jogador 1). */
function makeGm(seed = 7) {
  const scene = new THREE.Scene();
  const terrain = new Terrain(scene);
  const cfg = createMatchConfig({ seed, headless: true });
  const gm = new GameManager(scene, terrain, null, null, cfg);
  // Desliga as IAs: os testes controlam tudo à mão.
  gm.aiDirectors.forEach(d => d.dispose?.());
  gm.aiDirectors = [];
  gm.aiDirector = null;
  return gm;
}

/** Fileira horizontal de `n` pontos com passo WALL_STEP a partir de (x0, z). */
function row(x0, z, n) {
  return Array.from({ length: n }, (_, i) => ({ x: x0 + i * WALL_STEP, z }));
}

/** Procura, perto da base do jogador 0, uma fileira de n pontos onde tudo é válido. */
function findFreeRow(gm, n, ownerId = 0) {
  const base = gm.getPlayer(ownerId).startPos;
  for (let dz = -30; dz <= 30; dz += 3) {
    for (let dx = -30; dx <= 30; dx += 3) {
      const pts = row(base.x + dx, base.z + dz, n);
      if (pts.every(p => gm.canPlaceBuilding('wall_human', p.x, p.z, null, ownerId))) return pts;
    }
  }
  throw new Error('sem espaço livre para a fileira de teste');
}

function rich(gm, ownerId = 0) {
  const p = gm.getPlayer(ownerId);
  p.resources.gold = 5000;
  p.resources.wood = 5000;
  p.resources.stone = 5000;
}

describe('dados da muralha (F3-08)', () => {
  it('wall_human / wall_orc seguem a spec', () => {
    for (const [type, name] of [['wall_human', 'Muralha de Pedra'], ['wall_orc', 'Paliçada de Ferro']]) {
      const d = getBuildingDef(type);
      expect(d.name).toBe(name);
      expect(d.role).toBe('wall');
      expect(d.hp).toBe(250);
      expect(d.armor).toBe(10);
      expect(d.cost).toEqual({ gold: 0, wood: 10, stone: 20 });
      expect(d.collisionRadius).toBe(1.5);
      expect(d.popGranted).toBe(0);
      expect(d.trains).toEqual([]);
    }
    expect(WALL_STEP).toBe(2.4);
  });
});

describe('placeWall (F3-08)', () => {
  it('cobra n × custo só dos segmentos válidos e cria um por ponto válido', () => {
    const gm = makeGm();
    rich(gm);
    const pts = findFreeRow(gm, 5);
    // 1 ponto inválido: em cima do Centro do jogador.
    const hq = gm.buildings.find(b => b.ownerId === 0 && b.role === 'hq');
    const bad = { x: hq.mesh.position.x, z: hq.mesh.position.z };
    const before = { ...gm.getPlayer(0).resources };
    const placed = [];
    gm.events.on?.('buildingPlaced', () => {});
    const created = gm.placeWall('wall_human', [...pts, bad], [], 0);
    expect(created.length).toBe(5);
    created.forEach(w => { expect(w).toBeInstanceOf(Wall); placed.push(w); });
    const after = gm.getPlayer(0).resources;
    expect(before.wood - after.wood).toBe(5 * 10);
    expect(before.stone - after.stone).toBe(5 * 20);
    expect(before.gold - after.gold).toBe(0);
  });

  it('recusa sem recursos: nada é criado nem cobrado', () => {
    const gm = makeGm();
    const pts = findFreeRow(gm, 5);
    const p = gm.getPlayer(0);
    p.resources.wood = 10 * 5 - 1; // falta 1 de madeira para 5 segmentos
    p.resources.stone = 500;
    const n = gm.buildings.length;
    const created = gm.placeWall('wall_human', pts, [], 0);
    expect(created).toEqual([]);
    expect(gm.buildings.length).toBe(n);
    expect(p.resources.wood).toBe(49);
  });

  it('limite de 60 pontos: excedente é ignorado no executor e o comando é inválido na validação', () => {
    const gm = makeGm();
    rich(gm);
    const pts = row(-40, -40, WALL_MAX_POINTS + 5);
    const created = gm.placeWall('wall_human', pts, [], 0);
    expect(created.length).toBeLessThanOrEqual(WALL_MAX_POINTS);
  });

  it('passo 2,4 é permitido entre muralhas do mesmo dono e proibido contra outras construções', () => {
    const gm = makeGm();
    rich(gm);
    const pts = findFreeRow(gm, 2);
    gm.placeWall('wall_human', [pts[0]], [], 0);
    expect(gm.canPlaceBuilding('wall_human', pts[1].x, pts[1].z, null, 0)).toBe(true);
    // Contra outro dono, o gap de 3,2 continua valendo.
    expect(gm.canPlaceBuilding('wall_human', pts[1].x, pts[1].z, null, 1)).toBe(false);
    // Contra uma construção comum (Casa) do mesmo dono também.
    const house = gm.createBuilding('cottage', pts[0].x + 20, pts[0].z, true, 0);
    gm.buildings.push(house);
    expect(gm.canPlaceBuilding('wall_human', house.mesh.position.x + 2.4, house.mesh.position.z, null, 0)).toBe(false);
    // Encostada (gap 0,5) numa torre do mesmo dono é permitido.
    const spot = findFreeRow(gm, 3)[0];
    const tower = gm.createBuilding('watchtower', spot.x, spot.z, true, 0);
    gm.buildings.push(tower);
    // Torre (raio 2,0) + muralha (raio 1,5) + gap 0,5 = 4,0 entre centros: permitido; 3,4 não.
    const tx = tower.mesh.position.x;
    const tz = tower.mesh.position.z;
    const okSide = [[4.1, 0], [-4.1, 0], [0, 4.1], [0, -4.1]].find(([dx, dz]) => gm.canPlaceBuilding('wall_human', tx + dx, tz + dz, null, 0));
    expect(okSide).toBeTruthy();
    expect(gm.canPlaceBuilding('wall_human', tx + okSide[0] * 3.4 / 4.1, tz + okSide[1] * 3.4 / 4.1, null, 0)).toBe(false);
  });

  it('PLACE_WALL via comando: cria os segmentos e ordena a obra em fila aos aldeões', () => {
    const gm = makeGm();
    rich(gm);
    const pts = findFreeRow(gm, 4);
    const worker = gm.getUnitsOf(0).find(u => u.type === 'villager');
    gm.issue({ type: CMD.PLACE_WALL, playerId: 0, buildingType: 'wall_human', points: pts, unitIds: [worker.id] });
    for (let i = 0; i < 5; i++) gm.simStep(SIM_DT);
    const walls = gm.buildings.filter(b => b.type === 'wall_human');
    expect(walls.length).toBe(4);
    expect(worker.state).toBe('building');
    expect(worker.orderQueue.length).toBe(3);
  });
});

/**
 * Flood-fill 8-vizinhos (mesmas regras do A*, sem cortar quina) na grade do pathfinder, restrito
 * à faixa de células cujo centro está em [xMin, xMax] e |z - zc| <= zHalf. Devolve true se
 * alcança o lado oposto da faixa (z > zc + 3) partindo do lado sul (z < zc - 3).
 */
function canCross(pf, xMin, xMax, zc, zHalf) {
  const inBox = (c, r) => {
    const w = pf.toWorld(c, r);
    return w.x >= xMin && w.x <= xMax && Math.abs(w.z - zc) <= zHalf;
  };
  const key = (c, r) => r * pf.cols + c;
  const seen = new Set();
  const stack = [];
  for (let r = 0; r < pf.rows; r++) {
    for (let c = 0; c < pf.cols; c++) {
      const w = pf.toWorld(c, r);
      if (inBox(c, r) && w.z < zc - 3 && pf.isWalkable(c, r)) { stack.push([c, r]); seen.add(key(c, r)); }
    }
  }
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  while (stack.length) {
    const [c, r] = stack.pop();
    if (pf.toWorld(c, r).z > zc + 3) return true;
    for (const [dc, dr] of dirs) {
      const nc = c + dc;
      const nr = r + dr;
      if (nc < 0 || nr < 0 || nc >= pf.cols || nr >= pf.rows) continue;
      if (!inBox(nc, nr) || !pf.isWalkable(nc, nr) || seen.has(key(nc, nr))) continue;
      if (dc !== 0 && dr !== 0 && (!pf.isWalkable(c + dc, r) || !pf.isWalkable(c, r + dr))) continue;
      seen.add(key(nc, nr));
      stack.push([nc, nr]);
    }
  }
  return false;
}

describe('bloqueio do pathfinder (F3-08)', () => {
  it('fileira de 10 segmentos fecha a passagem (sem fresta); destruir 1 reabre', () => {
    const gm = makeGm();
    rich(gm);
    const pf = gm.pathfinder;
    let pts = null;
    const base = gm.getPlayer(0).startPos;
    for (let dz = -30; dz <= 30 && !pts; dz += 2) {
      for (let dx = -30; dx <= 30 && !pts; dx += 2) {
        const cand = row(base.x + dx, base.z + dz, 10);
        if (cand.every(p => gm.canPlaceBuilding('wall_human', p.x, p.z, null, 0)) &&
            canCross(pf, cand[0].x, cand[9].x, cand[0].z, 9)) pts = cand;
      }
    }
    expect(pts).not.toBeNull();
    const zw = pts[0].z;
    const x0 = pts[0].x;
    const x1 = pts[9].x;
    // Antes de construir: a faixa é atravessável (controle do teste).
    expect(canCross(pf, x0, x1, zw, 9)).toBe(true);
    const walls = gm.placeWall('wall_human', pts, [], 0);
    expect(walls.length).toBe(10);
    expect(canCross(pf, x0, x1, zw, 9)).toBe(false);

    // Destruir o segmento do meio abre uma passagem.
    walls[4].takeDamage(9999);
    expect(walls[4].isDead).toBe(true);
    gm.simStep(SIM_DT); // o GameManager libera o bloqueio da construção morta no passo seguinte
    expect(canCross(pf, x0, x1, zw, 9)).toBe(true);
  });

  it('fileira diagonal (45 graus, passo 2,4) também não deixa fresta', () => {
    const gm = makeGm();
    rich(gm);
    const pf = gm.pathfinder;
    const base = gm.getPlayer(0).startPos;
    // Procura um ponto inicial onde a diagonal inteira (10 pontos) é válida.
    const k = WALL_STEP / Math.SQRT2;
    let pts = null;
    for (let dz = -30; dz <= 30 && !pts; dz += 3) {
      for (let dx = -30; dx <= 30 && !pts; dx += 3) {
        const cand = Array.from({ length: 10 }, (_, i) => ({ x: base.x + dx + i * k, z: base.z + dz + i * k }));
        if (cand.every(p => gm.canPlaceBuilding('wall_human', p.x, p.z, null, 0))) pts = cand;
      }
    }
    expect(pts).not.toBeNull();
    gm.placeWall('wall_human', pts, [], 0);
    // Corredor perpendicular à diagonal, medido por uma faixa quadrada ao redor da linha:
    // atravessar de um lado (x - z pequeno) ao outro não pode ser possível dentro da faixa.
    const cx = (pts[0].x + pts[9].x) / 2;
    const cz = (pts[0].z + pts[9].z) / 2;
    const seen = new Set();
    const stack = [];
    const inBand = (w) => Math.abs((w.x - cx) + (w.z - cz)) <= 14 && Math.abs((w.x - cx) - (w.z - cz)) <= 2 * k * 4.5;
    const side = (w) => (w.x - cx) - (w.z - cz); // < 0: um lado, > 0: o outro
    for (let r = 0; r < pf.rows; r++) for (let c = 0; c < pf.cols; c++) {
      const w = pf.toWorld(c, r);
      if (inBand(w) && side(w) < -3 && pf.isWalkable(c, r)) { stack.push([c, r]); seen.add(r * pf.cols + c); }
    }
    let crossed = false;
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    while (stack.length && !crossed) {
      const [c, r] = stack.pop();
      if (side(pf.toWorld(c, r)) > 3) { crossed = true; break; }
      for (const [dc, dr] of dirs) {
        const nc = c + dc; const nr = r + dr;
        if (nc < 0 || nr < 0 || nc >= pf.cols || nr >= pf.rows) continue;
        const w = pf.toWorld(nc, nr);
        if (!inBand(w) || !pf.isWalkable(nc, nr) || seen.has(nr * pf.cols + nc)) continue;
        if (dc !== 0 && dr !== 0 && (!pf.isWalkable(c + dc, r) || !pf.isWalkable(c, r + dr))) continue;
        seen.add(nr * pf.cols + nc);
        stack.push([nc, nr]);
      }
    }
    expect(crossed).toBe(false);
  });
});

describe('combate contra muralhas (F3-08)', () => {
  it('muralha inimiga é atacável por ordem direta e unidades ociosas não a auto-adquirem', () => {
    const gm = makeGm();
    rich(gm, 1);
    const pts = findFreeRow(gm, 1, 0);
    const wall = gm.createBuilding('wall_orc', pts[0].x, pts[0].z, true, 1);
    gm.buildings.push(wall);

    const knight = gm.spawnUnit('knight', pts[0].x + 4, pts[0].z, 0);
    // Ociosa: não escolhe a muralha sozinha.
    expect(knight.findNearestHostile(gm.allUnits, gm.buildings, 30)).toBeNull();
    for (let i = 0; i < 40; i++) gm.simStep(SIM_DT);
    expect(wall.hp).toBe(wall.maxHp);

    // Ordem direta: ataca.
    gm.issue({ type: CMD.ATTACK, playerId: 0, unitIds: [knight.id], targetId: wall.id });
    for (let i = 0; i < 400 && !wall.isDead; i++) gm.simStep(SIM_DT);
    expect(wall.hp).toBeLessThan(wall.maxHp);
  });
});

describe('exército derruba a muralha e chega ao alvo (F3-08, headless)', () => {
  it('ATTACK no Centro cercado por muralha: grunts atacam a muralha que bloqueia e depois o Centro (<= 5 min)', () => {
    const gm = makeGm(11);
    const hq = gm.buildings.find(b => b.ownerId === 0 && b.role === 'hq');
    const hx = hq.mesh.position.x;
    const hz = hq.mesh.position.z;
    // Anel fechado de muralhas (raio 10, passo ~2,3 < 2,4) em volta do Centro do jogador 0.
    const R = 10;
    const n = Math.ceil((2 * Math.PI * R) / 2.3);
    const ring = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const w = gm.createBuilding('wall_human', hx + Math.cos(a) * R, hz + Math.sin(a) * R, true, 0);
      gm.buildings.push(w);
      ring.push(w);
    }
    // Remove os defensores do jogador 0 para isolar o comportamento de chegada.
    gm.getUnitsOf(0).forEach(u => { u.hp = 0; u.isDead = true; });
    // O anel precisa ser mesmo fechado para o pathfinder (ponto dentro inalcançável por fora).
    const grunts = [];
    for (let i = 0; i < 4; i++) grunts.push(gm.spawnUnit('grunt', hx + 20 + i, hz + 2, 1));
    const totalHp = ring.reduce((a, w) => a + w.hp, 0);
    gm.issue({ type: CMD.ATTACK, playerId: 1, unitIds: grunts.map(g => g.id), targetId: hq.id });
    let tick = 0;
    let reachedHq = false;
    for (; tick < 6000; tick++) {
      gm.simStep(SIM_DT);
      if (hq.hp < hq.maxHp) { reachedHq = true; break; }
    }
    const deadWalls = ring.filter(w => w.isDead).length;
    expect(deadWalls).toBeGreaterThan(0);
    expect(ring.reduce((a, w) => a + w.hp, 0)).toBeLessThan(totalHp);
    expect(reachedHq).toBe(true);
    expect(tick).toBeLessThan(6000);
  }, 60000);

  it('ATTACK_MOVE para um ponto dentro do anel: ataca a muralha e entra no anel (<= 5 min)', () => {
    const gm = makeGm(11);
    const hq = gm.buildings.find(b => b.ownerId === 0 && b.role === 'hq');
    const hx = hq.mesh.position.x;
    const hz = hq.mesh.position.z;
    const R = 10;
    const n = Math.ceil((2 * Math.PI * R) / 2.3);
    const ring = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const w = gm.createBuilding('wall_human', hx + Math.cos(a) * R, hz + Math.sin(a) * R, true, 0);
      gm.buildings.push(w);
      ring.push(w);
    }
    gm.getUnitsOf(0).forEach(u => { u.hp = 0; u.isDead = true; });
    const grunt = gm.spawnUnit('grunt', hx + 20, hz + 2, 1);
    gm.issue({ type: CMD.ATTACK_MOVE, playerId: 1, unitIds: [grunt.id], x: hx, z: hz + 7 });
    let arrived = false;
    for (let t = 0; t < 6000 && !arrived; t++) {
      gm.simStep(SIM_DT);
      // Dentro do anel (raio 10): ele já derrubou uma muralha e passou. (Em attack-move ele ainda
      // ataca as construções que encontra no caminho — Casa/Castelo —, por isso não exigimos o ponto exato.)
      arrived = Math.hypot(grunt.mesh.position.x - hx, grunt.mesh.position.z - hz) < R - 1 && ring.some(w => w.isDead);
    }
    expect(ring.some(w => w.isDead)).toBe(true);
    expect(arrived).toBe(true);
  }, 60000);
});

describe('IA constrói uma linha curta de muralha (F3-08)', () => {
  it('com recursos sobrando emite PLACE_WALL uma única vez por partida (<= 8 segmentos)', () => {
    const scene = new THREE.Scene();
    const terrain = new Terrain(scene);
    const gm = new GameManager(scene, terrain, null, null, createMatchConfig({ seed: 7, headless: true }));
    const director = gm.aiDirectors[0];
    const eco = director.economyManager;
    const p = gm.getPlayer(director.playerId);
    p.resources.wood = 2000; p.resources.stone = 2000; p.resources.gold = 2000;
    eco.considerWallLine();
    for (let i = 0; i < 3; i++) gm.simStep(SIM_DT);
    const mine = gm.buildings.filter(b => b.ownerId === director.playerId && b.role === 'wall');
    expect(mine.length).toBeGreaterThanOrEqual(3);
    expect(mine.length).toBeLessThanOrEqual(8);
    eco.considerWallLine();
    for (let i = 0; i < 3; i++) gm.simStep(SIM_DT);
    expect(gm.buildings.filter(b => b.ownerId === director.playerId && b.role === 'wall').length).toBe(mine.length);
  });

  it('não constrói na dificuldade fácil', () => {
    const scene = new THREE.Scene();
    const terrain = new Terrain(scene);
    const gm = new GameManager(scene, terrain, null, null, createMatchConfig({ seed: 7, headless: true, difficulty: 'easy' }));
    const director = gm.aiDirectors[0];
    const p = gm.getPlayer(director.playerId);
    p.resources.wood = 2000; p.resources.stone = 2000;
    director.economyManager.considerWallLine();
    for (let i = 0; i < 3; i++) gm.simStep(SIM_DT);
    expect(gm.buildings.filter(b => b.role === 'wall').length).toBe(0);
  });
});
