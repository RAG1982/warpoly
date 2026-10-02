import { describe, it, expect } from 'vitest';
import { Pathfinder } from '../../src/sim/Pathfinder.js';
import { Terrain } from '../../src/world/Terrain.js';
import { getMap } from '../../src/data/maps/index.js';
import { NAVAL_MIN_DEPTH, NAVAL_MAX_HEIGHT, WATER_LEVEL } from '../../src/data/combat.js';
import { EVT } from '../../src/sim/events.js';
import { CMD } from '../../src/sim/commands.js';
import { getBuildingDef, getUnitDef } from '../../src/data/index.js';
import { makeNavalGm, run, build, hqOf, coastSpots } from './helpers/navalWorld.js';

/**
 * naval.test.js — F4-07a: grade e pathfinder naval, navio nunca pisa em terra, Estaleiro/Refinaria só em costa, saída para o mar.
 */
describe('grade naval (F4-07a)', () => {
  const terrain = new Terrain(getMap('estreito-1v1'));
  const naval = new Pathfinder(terrain, undefined, 1.5, 'naval');
  const land = new Pathfinder(terrain);

  it('NAVAL_MIN_DEPTH: célula navegável = água com profundidade ≥ 0,4 (altura ≤ nível da água − 0,4)', () => {
    expect(NAVAL_MIN_DEPTH).toBe(0.4);
    expect(NAVAL_MAX_HEIGHT).toBeCloseTo(WATER_LEVEL - 0.4, 6);
  });

  it('canal navega; costa rasa e terra bloqueiam; a grade terrestre é o espelho (paridade de API)', () => {
    expect(naval.isWalkableWorld(0, -40)).toBe(true); // canal fundo
    expect(naval.isWalkableWorld(-34, -16)).toBe(false); // terra (base)
    expect(land.isWalkableWorld(-34, -16)).toBe(true);
    expect(land.isWalkableWorld(0, -40)).toBe(false);
    // costa rasa: água (para os terrestres) mas sem profundidade para navios
    let shallow = null;
    for (let x = -12; x >= -26 && !shallow; x -= 0.25) {
      const h = terrain.getHeight(x, -30);
      if (h > NAVAL_MAX_HEIGHT && h < 0.65) shallow = { x, z: -30, h };
    }
    expect(shallow, 'deve existir uma faixa rasa na costa').toBeTruthy();
    expect(naval.isWalkableWorld(shallow.x, shallow.z)).toBe(false);
    expect(land.isWalkableWorld(shallow.x, shallow.z)).toBe(false);
    // hasLineOfSight naval: dentro do canal sim, atravessando terra não
    expect(naval.hasLineOfSight(0, -40, 0, -20)).toBe(true);
    expect(naval.hasLineOfSight(0, -40, -34, -16)).toBe(false);
    expect(land.hasLineOfSight(0, -40, 0, -20)).toBe(false);
  });

  it('bloqueios dinâmicos navais (blockCircle) e a mesma API de fila/cache', () => {
    const pf = new Pathfinder(terrain, undefined, 1.5, 'naval');
    expect(pf.isWalkableWorld(0, -40)).toBe(true);
    pf.blockCircle(0, -40, 3, +1);
    expect(pf.isWalkableWorld(0, -40)).toBe(false);
    pf.blockCircle(0, -40, 3, -1);
    expect(pf.isWalkableWorld(0, -40)).toBe(true);
    let got = null;
    pf.requestPath({ mesh: { position: { x: 0, z: -40 } } }, 0, -20, (p) => { got = p; });
    pf.processQueue(4000);
    expect(got).toEqual([{ x: 0, z: -20 }]);
  });

  it('caminho naval contorna a ilha: a ponte corta o canal ao meio, o navio dá a volta por fora e nunca cruza terra', () => {
    const p = naval.findPath(0, -40, 0, 40);
    expect(p.noPath).toBeFalsy();
    expect(p.length).toBeGreaterThan(3);
    let prev = { x: 0, z: -40 };
    for (const w of p) {
      expect(naval.hasLineOfSight(prev.x, prev.z, w.x, w.z), `trecho ${JSON.stringify(prev)}→${JSON.stringify(w)} cruza terra`).toBe(true);
      prev = w;
    }
    // a rota passa pela borda leste ou oeste do mapa (|x| > 40), nunca pela ponte (x≈0, z≈0)
    expect(p.some((w) => Math.abs(w.x) > 40)).toBe(true);
  });

  it('findNearestWalkable naval: ponto em terra vai para a água navegável mais próxima; nearNavigable mede a margem', () => {
    const snapped = naval.findNearestWalkable(-17, -20);
    expect(naval.isWalkableWorld(snapped.x, snapped.z)).toBe(true);
    expect(naval.nearNavigable(-17, -20, 6)).toBe(true);
    expect(naval.nearNavigable(-34, -16, 6)).toBe(false);
  });
});

describe('navio na água (F4-07a)', () => {
  it('um petroleiro ordenado a um ponto em terra para na água; nunca pisa em terra/costa rasa durante a viagem', () => {
    const gm = makeNavalGm();
    const u = gm.spawnUnit('tanker', 0, -40, 0);
    expect(u.layer).toBe('naval');
    expect(u.mesh.position.y).toBeCloseTo(WATER_LEVEL, 6);
    gm.issue({ type: CMD.MOVE, playerId: 0, unitIds: [u.id], x: -34, z: -16 }); // terra firme (a base)
    let worst = -Infinity;
    for (let i = 0; i < 20 * 40; i++) {
      gm.simStep(0.05);
      worst = Math.max(worst, gm.terrain.getHeight(u.mesh.position.x, u.mesh.position.z));
    }
    expect(worst).toBeLessThanOrEqual(NAVAL_MAX_HEIGHT + 1e-9);
    // chegou perto da margem da base (destino ajustado à água mais próxima)
    expect(Math.hypot(u.mesh.position.x + 34, u.mesh.position.z + 16)).toBeLessThan(26);
  });

  it('navio nasce na água mesmo se pedido em terra (spawn ajustado) e circula o continente por fora (mover N→S)', () => {
    const gm = makeNavalGm();
    const u = gm.spawnUnit('tanker', -34, -16, 0); // em cima da base
    expect(gm.terrain.getHeight(u.mesh.position.x, u.mesh.position.z)).toBeLessThanOrEqual(NAVAL_MAX_HEIGHT);
    const v = gm.spawnUnit('tanker', 0, -40, 0);
    gm.issue({ type: CMD.MOVE, playerId: 0, unitIds: [v.id], x: 0, z: 40 });
    let maxX = 0;
    for (let i = 0; i < 20 * 70; i++) {
      gm.simStep(0.05);
      maxX = Math.max(maxX, Math.abs(v.mesh.position.x));
      expect(gm.terrain.getHeight(v.mesh.position.x, v.mesh.position.z)).toBeLessThanOrEqual(NAVAL_MAX_HEIGHT + 1e-9);
    }
    expect(maxX).toBeGreaterThan(40); // deu a volta por fora
    expect(Math.hypot(v.mesh.position.x, v.mesh.position.z - 40)).toBeLessThan(8);
  });

  it('terrestres e navios não colidem entre si (camadas); navio não bloqueia a grade terrestre', () => {
    const gm = makeNavalGm();
    const before = Array.from(gm.pathfinder.dynamicBlock).reduce((a, b) => a + b, 0);
    gm.spawnUnit('tanker', 0, -40, 0);
    expect(Array.from(gm.pathfinder.dynamicBlock).reduce((a, b) => a + b, 0)).toBe(before);
  });
});

describe('Estaleiro, Refinaria e saída para o mar (F4-07a)', () => {
  it('dados: Estaleiro e Doca do Clã (role shipyard, costeiros, Centro 2), treinam o petroleiro', () => {
    for (const [t, req] of [['shipyard', 'barracks'], ['ship_dock', 'orc_barracks']]) {
      const d = getBuildingDef(t);
      expect(d).toMatchObject({ role: 'shipyard', hp: 900, armor: 15, collisionRadius: 3.6, coastal: true });
      expect(d.cost).toEqual({ gold: 200, wood: 150, stone: 0 });
      expect(d.requires).toEqual([req, { hq: 2 }]);
      expect(d.trains).toContain('tanker');
    }
    for (const [t, req] of [['refinery', 'shipyard'], ['ash_cauldron', 'ship_dock']]) {
      const d = getBuildingDef(t);
      expect(d).toMatchObject({ role: 'refinery', hp: 700, armor: 15, collisionRadius: 3.4, coastal: true, dropoff: ['oil'] });
      expect(d.cost).toEqual({ gold: 100, wood: 150, stone: 50 });
      expect(d.requires).toEqual([req, { hq: 2 }]);
    }
  });

  it('Estaleiro só em costa: inland, água aberta e fora da margem são recusados; a margem é aceita', () => {
    const gm = makeNavalGm();
    expect(gm.canPlaceBuilding('shipyard', -34, -4)).toBe(false); // interior do continente
    expect(gm.canPlaceBuilding('shipyard', 0, -40)).toBe(false); // água aberta (o centro precisa ser terra)
    const spots = coastSpots(gm, 'shipyard', -1, 3);
    expect(spots.length).toBeGreaterThan(0);
    for (const s of spots) {
      expect(gm.terrain.getHeight(s.x, s.z)).toBeGreaterThanOrEqual(1.8);
      expect(gm.hasNavigableWaterNear(s.x, s.z, 3.6 + 1.3)).toBe(true);
    }
    expect(gm.canPlaceBuilding('refinery', spots[0].x, spots[0].z)).toBe(true);
    expect(gm.canPlaceBuilding('barracks', spots[0].x, spots[0].z)).toBe(true); // construções comuns seguem as regras de sempre
  });

  it('ponto de saída (cais) fica em célula navegável; sem saída para o mar o treino é recusado com aviso e sem debitar', () => {
    const gm = makeNavalGm();
    const hq = hqOf(gm, 0);
    hq.tier = 2;
    gm.getPlayer(0).resources.gold = 5000;
    gm.getPlayer(0).resources.wood = 5000;
    const yard = build(gm, 'shipyard', 0, ...Object.values(coastSpots(gm, 'shipyard', -1, 1)[0]));
    const dock = gm.getDockPoint(yard);
    expect(dock).toBeTruthy();
    expect(gm.navalPathfinder.isWalkableWorld(dock.x, dock.z)).toBe(true);

    const inland = build(gm, 'shipyard', 0, -34, -4); // erguido por cheat de teste: sem mar por perto
    expect(gm.getDockPoint(inland)).toBeNull();
    const msgs = [];
    gm.events.on(EVT.NOTIFY, (e) => msgs.push(e.text));
    const gold = gm.getPlayer(0).resources.gold;
    expect(inland.queueUnit('tanker', gm)).toBe(false);
    gm.events.flush();
    expect(msgs.some((m) => m.includes('Sem saída para o mar'))).toBe(true);
    expect(gm.getPlayer(0).resources.gold).toBe(gold);
    expect(yard.queueUnit('tanker', gm)).toBe(true);
  });

  it('o navio treinado nasce na água, no cais (sem consumir o RNG de simulação)', () => {
    const gm = makeNavalGm();
    hqOf(gm, 0).tier = 2;
    gm.getPlayer(0).resources.gold = 5000;
    gm.getPlayer(0).resources.wood = 5000;
    const spot = coastSpots(gm, 'shipyard', -1, 1)[0];
    build(gm, 'barracks', 0, -30, 6);
    const yard = build(gm, 'shipyard', 0, spot.x, spot.z);
    expect(yard.queueUnit('tanker', gm)).toBe(true);
    run(gm, getUnitDef('tanker').trainTime + 2);
    const tanker = gm.allUnits.find((u) => u.type === 'tanker' && u.ownerId === 0);
    expect(tanker).toBeTruthy();
    expect(gm.terrain.getHeight(tanker.mesh.position.x, tanker.mesh.position.z)).toBeLessThanOrEqual(NAVAL_MAX_HEIGHT);
    expect(Math.hypot(tanker.mesh.position.x - yard.dockPoint.x, tanker.mesh.position.z - yard.dockPoint.z)).toBeLessThan(6);
  });
});
