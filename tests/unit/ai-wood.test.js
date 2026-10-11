import { describe, it, expect, vi } from 'vitest';
import { CMD } from '../../src/sim/commands.js';
import { Tree } from '../../src/sim/Tree.js';
import { stateChecksum } from '../../src/sim/checksum.js';
import { landRegions, regionAt, pointReachable, analyzeWood, FAR_TREE_DIST, woodDropoffs } from '../../src/ai/AIWood.js';
import { makeGm, run, place } from './helpers/aiWorld.js';

/**
 * NEW-44 — a IA reage à escassez de madeira: lê a oferta de madeira ALCANÇÁVEL, ergue serraria avançada quando as árvores ficam
 * longe das entregas (com reserva de madeira), não manda peões a árvores que não chegam, para de esperar tropas que não vêm.
 */

const refresh = d => { d._woodOutlookTick = -1e9; return d.woodOutlook(); };
const killTrees = (gm, pred = () => true) => { for (const t of gm.trees) if (!t.isDead && pred(t)) t.die(); };
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const drops = (gm, d) => woodDropoffs(gm, d.playerId, []);

/** Planta uma árvore extra (viva) na partida em (x, z). */
function plantTree(gm, x, z) {
  const t = new Tree(gm.terrain, x, z, 'oak', gm.rngMap);
  gm.registerEntity(t);
  gm.trees.push(t);
  return t;
}

describe('NEW-44: regiões terrestres e alcançabilidade', () => {
  it('componentes conexos da grade estática (grade sintética com duas ilhas)', () => {
    // 6×3 células: colunas 0–1 = ilha A, 2–3 = água, 4–5 = ilha B
    const pf = {
      cols: 6, rows: 3,
      staticGrid: Uint8Array.from([1, 1, 0, 0, 1, 1, 1, 1, 0, 0, 1, 1, 1, 1, 0, 0, 1, 1]),
      toGrid: (x, z) => ({ c: Math.floor(x), r: Math.floor(z) })
    };
    expect(landRegions(pf).count).toBe(2);
    const a = regionAt(pf, 0.5, 0.5);
    const b = regionAt(pf, 4.5, 0.5);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(b).toBeGreaterThanOrEqual(0);
    expect(a).not.toBe(b);
    expect(regionAt(pf, 2.5, 0.5)).toBe(-1); // água
    expect(pointReachable(pf, a, 1.5, 1.5)).toBe(true);
    expect(pointReachable(pf, a, 4.5, 1.5)).toBe(false); // outra ilha
    expect(pointReachable(pf, a, 2.5, 1.5)).toBe(true); // na água, mas colado na ilha A (o peão corta de fora)
    expect(pointReachable(pf, -1, 1.5, 1.5)).toBe(false);
  });

  it('mapa continental: uma só região; árvores além da borda jogável não contam', () => {
    const gm = makeGm({ seed: 3, difficulties: ['normal', 'normal'] });
    const d = gm.aiDirectors[0];
    expect(landRegions(gm.pathfinder).count).toBe(1);
    let o = refresh(d);
    expect(o.none).toBe(false);
    expect(o.count).toBe(gm.trees.filter(t => !t.isDead).length); // as árvores do mapa estão todas ao alcance
    killTrees(gm);
    o = refresh(d);
    expect(o.none).toBe(true);
    expect(o.count).toBe(0);
    // além do limite (±55 no mapa continental): inalcançável
    plantTree(gm, 57, 0);
    o = refresh(d);
    expect(o.none).toBe(true);
    // dentro do limite: alcançável
    plantTree(gm, 20, -12);
    o = refresh(d);
    expect(o.none).toBe(false);
    expect(o.count).toBe(1);
    expect(o.wood).toBe(120);
    gm.dispose();
  });

  it('classifica longe/acabando/nenhuma pela distância às entregas e pela madeira restante', () => {
    const gm = makeGm({ seed: 3, difficulties: ['normal', 'normal'] });
    const d = gm.aiDirectors[0];
    expect(refresh(d).far).toBe(false); // início: árvores a ~15 u da serraria
    const ds = drops(gm, d);
    killTrees(gm, t => ds.some(p => dist(p, t.mesh.position) < FAR_TREE_DIST + 6));
    const far = refresh(d);
    expect(far.none).toBe(false);
    expect(far.far).toBe(true);
    expect(far.nearest).toBeGreaterThan(FAR_TREE_DIST);
    // restam só 2 árvores: "acabando"
    const keep = far.trees.slice(0, 2);
    killTrees(gm, t => !keep.includes(t));
    const low = refresh(d);
    expect(low.count).toBe(2);
    expect(low.low).toBe(true);
    expect(low.none).toBe(false);
    gm.dispose();
  });
});

describe('NEW-44: trabalhadores', () => {
  it('sem árvore alcançável ninguém recebe ordem de cortar; o ocioso vai ao ouro', () => {
    const gm = makeGm({ seed: 3, difficulties: ['normal', 'normal'] });
    const d = gm.aiDirectors[0];
    // controle: com árvores, algum trabalhador é mandado cortar madeira
    const spyWith = vi.spyOn(gm, 'issue');
    d.economyManager.rebalanceWorkforce();
    const withTrees = spyWith.mock.calls.map(c => c[0]).filter(c => c.type === CMD.GATHER && gm.entitiesById.get(c.targetId).type === 'tree');
    expect(withTrees.length).toBeGreaterThan(0);
    spyWith.mockRestore();

    killTrees(gm);
    refresh(d);
    const spy = vi.spyOn(gm, 'issue');
    d.economyManager.rebalanceWorkforce();
    const cmds = spy.mock.calls.map(c => c[0]).filter(c => c.type === CMD.GATHER);
    expect(cmds.length).toBeGreaterThan(0);
    for (const c of cmds) expect(gm.entitiesById.get(c.targetId).type).not.toBe('tree');
    gm.dispose();
  });

  it('peão preso numa árvore inalcançável é reatribuído a uma árvore que chega', () => {
    const gm = makeGm({ seed: 3, difficulties: ['normal', 'normal'] });
    const d = gm.aiDirectors[0];
    const bad = plantTree(gm, 57, 0);
    const worker = gm.getUnitsOf(0).find(u => u.type === d.workerType);
    worker.state = 'gathering';
    worker.gatherTarget = bad;
    refresh(d);
    expect(d.economyManager.isTreeReachable(bad)).toBe(false);
    const spy = vi.spyOn(gm, 'issue');
    d.economyManager.rebalanceWorkforce();
    const mine = spy.mock.calls.map(c => c[0]).filter(c => c.type === CMD.GATHER && c.unitIds.includes(worker.id));
    expect(mine.length).toBe(1);
    expect(mine[0].targetId).not.toBe(bad.id);
    // e a busca de árvore do gerente nunca devolve a inalcançável
    expect(d.economyManager.findNearestLivingTree({ x: 56, y: 0, z: 0 })).not.toBe(bad);
    gm.dispose();
  });
});

describe('NEW-44: serraria avançada e reserva de madeira', () => {
  function farWorld() {
    const gm = makeGm({ seed: 3, difficulties: ['normal', 'normal'] });
    const d = gm.aiDirectors[0];
    const ds = drops(gm, d);
    killTrees(gm, t => ds.some(p => dist(p, t.mesh.position) < FAR_TREE_DIST + 8));
    refresh(d);
    return { gm, d };
  }

  it('achou um local junto das árvores restantes, válido e alcançável', () => {
    const { gm, d } = farWorld();
    const site = d.economyManager.findLumberSiteNow();
    expect(site).not.toBeNull();
    expect(gm.canPlaceBuilding(d.lumberType, site.x, site.z)).toBe(true);
    const nearest = Math.min(...refresh(d).trees.map(t => dist(site, t.mesh.position)));
    expect(nearest).toBeGreaterThan(5); // folga de `canPlaceBuilding` das árvores vivas
    expect(nearest).toBeLessThan(14);
    gm.dispose();
  });

  it('sem o custo segura a reserva; com o custo emite PLACE_BUILDING da serraria e libera a reserva', () => {
    const { gm, d } = farWorld();
    const eco = d.economyManager;
    const cost = d.costs.lumber.wood;
    const spy = vi.spyOn(gm, 'issue');
    d.player.resources.wood = cost - 20;
    expect(eco.manageForwardLumber(1)).toBe(true);
    expect(eco.woodReserve).toBe(cost);
    expect(d.woodReserve).toBe(cost);
    expect(spy.mock.calls.filter(c => c[0].type === CMD.PLACE_BUILDING).length).toBe(0);

    d.player.resources.wood = cost + 40;
    expect(eco.manageForwardLumber(1)).toBe(true);
    expect(eco.woodReserve).toBe(0);
    const placed = spy.mock.calls.map(c => c[0]).filter(c => c.type === CMD.PLACE_BUILDING);
    expect(placed.length).toBe(1);
    expect(placed[0].buildingType).toBe(d.lumberType);
    expect(gm.canPlaceBuilding(d.lumberType, placed[0].x, placed[0].z)).toBe(true);
    gm.dispose();
  });

  it('a reserva expira (150 s) e a IA espera antes de tentar de novo; o limite de serrarias vale', () => {
    const { gm, d } = farWorld();
    const eco = d.economyManager;
    d.player.resources.wood = 10;
    expect(eco.manageForwardLumber(1)).toBe(true);
    expect(eco.woodReserve).toBeGreaterThan(0);
    d.simTime += 151;
    expect(eco.manageForwardLumber(1)).toBe(false);
    expect(eco.woodReserve).toBe(0);
    d.simTime += 10; // ainda em espera
    expect(eco.manageForwardLumber(1)).toBe(false);
    d.simTime += 400;
    expect(eco.manageForwardLumber(3)).toBe(false); // já tem 3 serrarias
    expect(eco.woodReserve).toBe(0);
    gm.dispose();
  });

  it('a reserva segura o treino que consumiria a madeira da serraria; sem reserva treina', () => {
    const { gm, d } = farWorld();
    const eco = d.economyManager;
    const mm = d.militaryManager;
    // quartel concluído + exército mínimo (a reserva não vale com < 4 combatentes)
    const spot = (() => {
      for (let r = 12; r < 30; r += 2) for (let a = 0; a < 16; a++) {
        const x = d.baseCenter.x + Math.cos(a) * r;
        const z = d.baseCenter.y + Math.sin(a) * r;
        if (gm.canPlaceBuilding(d.barracksType, x, z)) return { x, z };
      }
      return null;
    })();
    const barracks = gm.createBuilding(d.barracksType, spot.x, spot.z, true, 0);
    gm.buildings.push(barracks);
    // o treino também exige ≥ 3 peões (sem isso `isWorkerEmergency` congela o recrutamento militar)
    for (let i = 0; i < 2; i++) place(gm, gm.spawnUnit(d.workerType, d.baseCenter.x - i, d.baseCenter.y + 5, 0), d.baseCenter.x - i, d.baseCenter.y + 5);
    for (let i = 0; i < 4; i++) place(gm, gm.spawnUnit(d.meleeType, d.baseCenter.x + i, d.baseCenter.y + 3, 0), d.baseCenter.x + i, d.baseCenter.y + 3);
    d.recalculatePop();
    d.player.maxPopulation = 60; // sem o teto de população do cenário
    d.player.resources.gold = 500;
    d.player.resources.wood = d.costs.melee.wood + 20; // paga o treino, mas não o treino + a reserva (80)
    const spy = vi.spyOn(gm, 'issue');
    eco._campHold = true;
    eco._campHoldSince = d.simTime;
    mm.manageTraining();
    expect(spy.mock.calls.filter(c => c[0].type === CMD.TRAIN).length).toBe(0);
    eco._campHold = false;
    mm.manageTraining();
    expect(spy.mock.calls.filter(c => c[0].type === CMD.TRAIN).length).toBe(1);
    gm.dispose();
  });
});

describe('NEW-44: exército que não pode ser reposto', () => {
  it('sem árvore alcançável e sem madeira para o combatente mais barato, a onda é pequena; com madeira ou árvores, não', () => {
    const gm = makeGm({ seed: 3, difficulties: ['hard', 'hard'] });
    const d = gm.aiDirectors[0];
    const mm = d.militaryManager;
    d.simTime = 1000;
    d.player.resources.wood = 0;
    expect(mm.reinforcementsBlocked()).toBe(false); // ainda há árvores
    const normal = mm.computeThreshold();
    expect(normal).toBeGreaterThan(3);
    killTrees(gm);
    refresh(d);
    expect(mm.reinforcementsBlocked()).toBe(true);
    expect(mm.computeThreshold()).toBeLessThanOrEqual(3);
    d.player.resources.wood = 500; // ainda dá para treinar
    expect(mm.reinforcementsBlocked()).toBe(false);
    expect(mm.computeThreshold()).toBe(normal);
    d.simTime = 20; // início de partida nunca conta
    d.player.resources.wood = 0;
    expect(mm.reinforcementsBlocked()).toBe(false);
    gm.dispose();
  });

  it('sem madeira a IA ataca com o exército que tem (não espera a onda cheia)', () => {
    const gm = makeGm({ seed: 3, difficulties: ['hard', 'hard'] });
    const d = gm.aiDirectors[0];
    const mm = d.militaryManager;
    killTrees(gm);
    d.simTime = 1500;
    gm.currentTick = 1500 / 0.05;
    refresh(d);
    d.player.resources.wood = 0;
    d.perception.update();
    // 6 combatentes ociosos: abaixo da onda normal (≥ 8 + guarda), acima da onda reduzida (3 + guarda 1)
    for (const u of gm.getUnitsOf(0).filter(x => x.type !== d.workerType)) u.die();
    const army = [];
    for (let i = 0; i < 6; i++) {
      const u = gm.spawnUnit(d.meleeType, d.baseCenter.x - 6 + i, d.baseCenter.y + 4, 0);
      place(gm, u, d.baseCenter.x - 6 + i, d.baseCenter.y + 4);
      army.push(u);
    }
    mm.attackThreshold = mm.computeThreshold();
    expect(mm.attackThreshold).toBeLessThanOrEqual(3);
    const spy = vi.spyOn(gm, 'issue');
    mm.manageMilitaryExpedition();
    const orders = spy.mock.calls.map(c => c[0]).filter(c => c.type === CMD.ATTACK || c.type === CMD.ATTACK_MOVE);
    expect(orders.length).toBeGreaterThan(0);
    expect(orders[0].unitIds.length).toBe(5); // 6 combatentes − guarda de 1
    gm.dispose();
  });
});

describe('NEW-44: partida inteira', () => {
  it('determinismo: mesma seed, árvores zeradas no mesmo tick => mesmo checksum', () => {
    const sums = [0, 1].map(() => {
      const gm = makeGm({ seed: 7, difficulties: ['hard', 'normal'] });
      run(gm, 20 * 90);
      killTrees(gm);
      run(gm, 20 * 120);
      const s = stateChecksum(gm);
      gm.dispose();
      return s;
    });
    expect(sums[0]).toBe(sums[1]);
  }, 60000);

  it('sem árvores no mapa a economia não quebra: nenhum NaN e nenhum peão preso "cortando" árvore inexistente', () => {
    const gm = makeGm({ seed: 5, difficulties: ['normal', 'normal'] });
    run(gm, 20 * 60);
    killTrees(gm);
    run(gm, 20 * 180);
    for (const p of gm.players) for (const r of Object.keys(p.resources)) expect(Number.isFinite(p.resources[r])).toBe(true);
    for (const u of gm.allUnits) {
      if (u.isDead || u.type !== gm.aiDirectors[0].workerType && u.type !== gm.aiDirectors[1].workerType) continue;
      expect(!(u.state === 'gathering' && u.gatherTarget && u.gatherTarget.type === 'tree')).toBe(true);
    }
    gm.dispose();
  }, 60000);
});
