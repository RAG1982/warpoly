import { describe, it, expect } from 'vitest';
import { GameManager } from '../../src/core/GameManager.js';
import { Terrain } from '../../src/world/Terrain.js';
import { getMap, registerMap, unregisterMap, listMaps } from '../../src/data/maps/index.js';
import { validateMapDef } from '../../src/data/maps/validate.js';
import { defaultAnchors, ANCHOR_NAME_RE } from '../../src/data/maps/anchors.js';
import { getMission, listMissions, createMissionConfig } from '../../src/data/missions/index.js';
import { validateMission, MissionError } from '../../src/sim/missions/schema.js';
import { resolveAnchors, resolveMissionAnchors } from '../../src/sim/missions/anchors.js';
import '../../src/data/campaigns/index.js'; // registra as missões das campanhas
import { stateChecksum } from '../../src/sim/checksum.js';
import { baseMission, makeMissionGm, runTicks, statusOf, teleport } from './helpers/missionWorld.js';

/**
 * M2-01 — âncoras: pontos nomeados em mapas (`anchors`) e em missões (`{ "anchor", "dx"?, "dz"? }`), resolvidos ANTES da
 * simulação (nada muda no checksum). Mapa sem âncoras (campanha clássica) continua igual.
 */
const clone = (o) => JSON.parse(JSON.stringify(o));
const MUNDO7 = ['duelo-continental-1', 'duelo-continental-2', 'duelo-continental-3', 'ilha-unica-1', 'ilha-unica-2', 'ilha-unica-3'];
const CAMPANHA = ['camp-01-baia-de-aurelan', 'camp-02-pouso-do-encontro', 'camp-03-pedra-mae']; // M2-03: mapas de campanha (com âncoras)
const PRIMARY = { id: 'o', type: 'survive', priority: 'primary', seconds: 99999, title: 't' };
const withSetup = (setup, over = {}) => baseMission({ autoVictory: false, objectives: [PRIMARY], setup, ...over });
const spawnAt = (pt) => ({ type: 'spawn', owner: 'player', unitType: 'villager', count: 1, ...pt });

/** Mapa mínimo (terra plana `continental`-like via `islands`) para testar a validação das âncoras. */
function miniMap(over = {}) {
  const base = clone(getMap('tutorial'));
  return { ...base, id: 'mini-anchors', ...over };
}

describe('âncoras no mapa: padrão derivado de slots, recursos, florestas, acampamentos e vaus', () => {
  it('defaultAnchors segue a nomenclatura da ficha M2-01', () => {
    const m = {
      ...clone(getMap('tutorial')),
      startSlots: [{ x: -30, z: 0 }, { x: 30, z: 0 }, { x: 0, z: 30 }, { x: 0, z: -30 }],
      resources: [{ type: 'gold', x: 1, z: 2 }, { type: 'stone', x: 3, z: 4 }, { type: 'gold', x: 5, z: 6 }, { type: 'oil', x: 7, z: 8 }],
      forests: [{ x: 10, z: 11 }, { x: 12, z: 13 }],
      neutrals: [{ kind: 'critters', x: 1, z: 1 }, { kind: 'camp', x: 20, z: 21 }],
      fords: [{ x: 40, z: 41, r: 5 }]
    };
    const { landingZone, ...rest } = defaultAnchors(m); // landingZone depende do terreno (heurística): testada nos mapas reais
    void landingZone;
    expect(rest).toEqual({
      playerStart: { x: -30, z: 0 }, enemyStart: { x: 30, z: 0 }, ally1: { x: 0, z: 30 }, ally2: { x: 0, z: -30 },
      goldMine1: { x: 1, z: 2 }, stoneQuarry1: { x: 3, z: 4 }, goldMine2: { x: 5, z: 6 }, well1: { x: 7, z: 8, water: true },
      forest1: { x: 10, z: 11 }, forest2: { x: 12, z: 13 }, neutralCamp1: { x: 20, z: 21 }, ford1: { x: 40, z: 41 }
    });
  });

  it('âncoras escritas à mão não são sobrescritas', () => {
    const m = { startSlots: [{ x: 1, z: 2 }], anchors: { playerStart: { x: 9, z: 9 }, extra: { x: 0, z: 0 } } };
    expect(defaultAnchors(m).playerStart).toEqual({ x: 9, z: 9 });
    expect(defaultAnchors(m).extra).toEqual({ x: 0, z: 0 });
  });

  it('os seis mapas do MUNDO-7 trazem as âncoras padrão (inclusive landingZone), em sincronia com os dados do mapa', () => {
    for (const id of MUNDO7) {
      const m = getMap(id);
      expect(m.anchors, id).toBeTruthy();
      expect(m.anchors, id).toEqual(defaultAnchors(m));
      for (const k of ['playerStart', 'enemyStart', 'goldMine1', 'forest1', 'landingZone']) expect(m.anchors[k], `${id}.${k}`).toBeTruthy();
      expect(m.anchors.playerStart).toEqual({ x: m.startSlots[0].x, z: m.startSlots[0].z });
      expect(Object.keys(m.anchors).every((n) => ANCHOR_NAME_RE.test(n))).toBe(true);
      const v = validateMapDef(m, { checkId: false });
      expect(v.errors, id).toEqual([]);
    }
  });

  it('mapas antigos (campanha clássica e escaramuça) continuam sem âncoras', () => {
    for (const m of listMaps({ includeHidden: true })) {
      if (!MUNDO7.includes(m.id) && !CAMPANHA.includes(m.id)) expect(m.anchors, m.id).toBeUndefined();
    }
  });
});

describe('validateMapDef confere as âncoras', () => {
  const codes = (m) => validateMapDef(m, { checkId: false, connectivity: false }).errors.map((e) => e.code);

  it('mapa com âncoras válidas passa; sem âncoras também', () => {
    expect(codes(miniMap())).toEqual([]);
    expect(codes(miniMap({ anchors: { a1: { x: -20, z: 8 }, 'b_2-x': { x: 0, z: 0 } } }))).toEqual([]);
  });

  it('nome inválido, fora da área jogável, formato errado e lista em vez de objeto', () => {
    expect(codes(miniMap({ anchors: { 'com espaço': { x: 0, z: 0 } } }))).toEqual(['anchorName']);
    expect(codes(miniMap({ anchors: { 'áspero': { x: 0, z: 0 } } }))).toEqual(['anchorName']);
    expect(codes(miniMap({ anchors: { longe: { x: 9999, z: 0 } } }))).toEqual(['anchorOutside']);
    expect(codes(miniMap({ anchors: { ruim: { x: 'a', z: 0 } } }))).toEqual(['anchorBad']);
    expect(codes(miniMap({ anchors: { ruim: { x: 0, z: 0, water: 'sim' } } }))).toEqual(['anchorBad']);
    expect(codes(miniMap({ anchors: [] }))).toEqual(['anchorsBad']);
  });

  it('terreno compatível: terra por padrão; water:true exige água', () => {
    const m = getMap('ilha-unica-1');
    const sea = { x: -90, z: -90 }; // mar aberto (canto da ilha)
    const land = m.startSlots[0];
    expect(codes({ ...m, anchors: { mar: { ...sea } } })).toEqual(['anchorWet']);
    expect(codes({ ...m, anchors: { mar: { ...sea, water: true } } })).toEqual([]);
    expect(codes({ ...m, anchors: { chao: { x: land.x, z: land.z, water: true } } })).toEqual(['anchorNotWater']);
    expect(codes({ ...m, anchors: { chao: { x: land.x, z: land.z } } })).toEqual([]);
  });
});

describe('resolução de âncoras em missões', () => {
  const MAP = { id: 'mapa-x', anchors: { goldMine1: { x: 10, z: -4 }, landingZone: { x: -30, z: 12 } } };

  it('troca {anchor,dx,dz} por {x,z}, mantendo os outros campos (áreas, ordens, spawn, camera, cutscene, condições)', () => {
    const def = {
      id: 'm',
      setup: [{ type: 'spawn', anchor: 'goldMine1', dx: 2, dz: 1, tag: 'a', order: { kind: 'move', anchor: 'landingZone', dz: -2 } }],
      objectives: [{ id: 'e', type: 'escort', area: { anchor: 'landingZone', r: 6 } }],
      triggers: [{ when: { type: 'area', area: { anchor: 'goldMine1', r: 3 } }, actions: [{ type: 'cutscene', steps: [{ at: 0, anchor: 'goldMine1' }] }] }]
    };
    const { def: out, errors } = resolveAnchors(def, MAP);
    expect(errors).toEqual([]);
    expect(out.setup[0]).toEqual({ type: 'spawn', tag: 'a', x: 12, z: -3, order: { kind: 'move', x: -30, z: 10 } });
    expect(out.objectives[0].area).toEqual({ r: 6, x: -30, z: 12 });
    expect(out.triggers[0].when.area).toEqual({ r: 3, x: 10, z: -4 });
    expect(out.triggers[0].actions[0].steps[0]).toEqual({ at: 0, x: 10, z: -4 });
    expect(JSON.stringify(def)).toContain('"anchor"'); // a definição original não é alterada
  });

  it('sem âncoras devolve a MESMA definição (sem cópia): missões clássicas não mudam', () => {
    const def = baseMission();
    expect(resolveAnchors(def, MAP).def).toBe(def);
    expect(resolveMissionAnchors(def, MAP)).toBe(def);
  });

  it('âncora inexistente: erro claro com nome, missão e mapa', () => {
    const def = withSetup([spawnAt({ anchor: 'naoExiste' })], { id: 'minha-missao' });
    const r = resolveAnchors(def, MAP);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toMatch(/setup\[0\]/);
    expect(r.errors[0]).toMatch(/naoExiste/);
    expect(r.errors[0]).toMatch(/minha-missao/);
    expect(r.errors[0]).toMatch(/mapa-x/);
    expect(() => resolveMissionAnchors(def, MAP)).toThrow(MissionError);
    // mapa sem âncoras
    expect(resolveAnchors(def, { id: 'velho' }).errors[0]).toMatch(/não tem âncoras/);
  });

  it('rejeita nome inválido, dx/dz não numérico e anchor junto de x/z', () => {
    for (const pt of [{ anchor: 'nome inválido' }, { anchor: 'goldMine1', dx: 'a' }, { anchor: 'goldMine1', x: 1, z: 2 }, { anchor: 5 }]) {
      expect(resolveAnchors(withSetup([spawnAt(pt)]), MAP).errors, JSON.stringify(pt)).toHaveLength(1);
    }
  });

  it('é determinística (mesma entrada, mesmo resultado)', () => {
    const def = withSetup([spawnAt({ anchor: 'goldMine1', dx: 0.1, dz: 0.2 })]);
    expect(resolveAnchors(def, MAP).def).toEqual(resolveAnchors(def, MAP).def);
  });
});

describe('campanha clássica inalterada', () => {
  it('nenhuma missão registrada além da demo de âncoras usa âncoras: a resolução devolve a mesma definição', () => {
    const all = listMissions({ includeHidden: true }).filter((m) => m.id !== 'mission-anchors-demo');
    expect(all.length).toBeGreaterThan(8);
    for (const def of all) {
      expect(JSON.stringify(def), def.id).not.toContain('"anchor"');
      expect(resolveAnchors(def, getMap(def.mapId)).def, def.id).toBe(def);
    }
  });
});

describe('validateMission com âncoras', () => {
  it('missão com âncoras de mapa gerado é válida; as coordenadas resolvidas passam nas checagens de área jogável', () => {
    expect(validateMission(getMission('mission-anchors-demo')).errors).toEqual([]);
    const ok = withSetup([spawnAt({ anchor: 'playerStart', dx: 4 })], { mapId: 'ilha-unica-2' });
    expect(validateMission(ok).errors).toEqual([]);
    const fora = withSetup([spawnAt({ anchor: 'playerStart', dx: 9999 })], { mapId: 'ilha-unica-2' });
    expect(validateMission(fora).errors.some((e) => e.includes('fora da área'))).toBe(true);
  });

  it('âncora faltando: erro de validação com nome, missão e mapa; mapa sem âncoras (tutorial) também', () => {
    const e1 = validateMission(withSetup([spawnAt({ anchor: 'fantasma' })], { mapId: 'ilha-unica-2', id: 'm-ancora' })).errors;
    expect(e1.some((e) => e.includes('fantasma') && e.includes('m-ancora') && e.includes('ilha-unica-2'))).toBe(true);
    const e2 = validateMission(withSetup([spawnAt({ anchor: 'playerStart' })])).errors; // mapa `tutorial`: sem âncoras
    expect(e2.some((e) => e.includes('playerStart') && e.includes('tutorial'))).toBe(true);
  });

  it('com checkMap:false só a sintaxe da âncora é conferida', () => {
    const def = withSetup([spawnAt({ anchor: 'qualquerNome' })]);
    expect(validateMission(def, { checkMap: false }).errors).toEqual([]);
    expect(validateMission(withSetup([spawnAt({ anchor: 'nome ruim' })]), { checkMap: false }).errors).toHaveLength(1);
  });

  it('tags e objetivos continuam valendo depois da resolução', () => {
    const def = withSetup([spawnAt({ anchor: 'playerStart', tag: 'x' })], {
      mapId: 'ilha-unica-2',
      objectives: [PRIMARY, { id: 'r', type: 'rescue', tag: 'nunca-criada', title: 't' }]
    });
    expect(validateMission(def).errors.some((e) => e.includes('nunca-criada'))).toBe(true);
  });
});

describe('mission-anchors-demo (mapa gerado duelo-continental-1) em modo headless', () => {
  const MAP = getMap('duelo-continental-1');
  const A = MAP.anchors;
  const demoGm = () => {
    const cfg = createMissionConfig('mission-anchors-demo');
    cfg.headless = true;
    return new GameManager(new Terrain(getMap(cfg.mapId)), null, null, cfg);
  };
  const tag = (gm, name) => gm.mission.tags.get(name).map((id) => gm.entitiesById.get(id));
  const near = (u, x, z) => Math.hypot(u.mesh.position.x - x, u.mesh.position.z - z);

  it('fica fora do menu (hidden) e usa só âncoras (nenhum x/z literal em pontos)', () => {
    expect(listMissions().map((m) => m.id)).not.toContain('mission-anchors-demo');
    expect(listMissions({ includeHidden: true }).map((m) => m.id)).toContain('mission-anchors-demo');
    expect(JSON.stringify(getMission('mission-anchors-demo'))).not.toMatch(/"(x|z)":/);
  });

  it('entidades nascem nos pontos das âncoras (+ deslocamento); o runtime guarda a definição resolvida', () => {
    const gm = demoGm();
    runTicks(gm, 2);
    expect(near(tag(gm, 'envoy')[0], A.playerStart.x + 5, A.playerStart.z + 7)).toBeLessThan(3);
    expect(tag(gm, 'captives').length).toBe(3);
    for (const u of tag(gm, 'captives')) expect(near(u, A.goldMine1.x + 6, A.goldMine1.z + 4)).toBeLessThan(8);
    const tower = tag(gm, 'tower')[0];
    expect(tower.mesh.position.x).toBeCloseTo(A.enemyStart.x - 12, 5);
    expect(tower.mesh.position.z).toBeCloseTo(A.enemyStart.z - 8, 5);
    const esc = gm.mission.def.objectives.find((o) => o.id === 'escort-envoy');
    expect(esc.area).toEqual({ r: 8, x: A.landingZone.x, z: A.landingZone.z });
    expect(JSON.stringify(gm.mission.def)).not.toContain('"anchor"');
  });

  it('o emissário chega à landingZone => objetivo de escolta concluído e gatilho dispara', () => {
    const gm = demoGm();
    runTicks(gm, 3);
    expect(statusOf(gm, 'escort-envoy')).toBe('active');
    teleport(gm, tag(gm, 'envoy')[0], A.landingZone.x, A.landingZone.z);
    runTicks(gm, 12);
    expect(statusOf(gm, 'escort-envoy')).toBe('completed');
    expect(gm.mission.vars.arrived).toBe(true);
  });

  it('checksum idêntico ao da mesma missão escrita com coordenadas literais (âncora é resolvida antes da simulação)', () => {
    const lit = (v) => (v && typeof v === 'object' ? (Array.isArray(v) ? v.map(lit) : Object.fromEntries(Object.entries(v).map(([k, x]) => [k, lit(x)]))) : v);
    const resolved = lit(resolveMissionAnchors(getMission('mission-anchors-demo'), MAP));
    expect(JSON.stringify(resolved)).not.toContain('"anchor"');
    const run = (def) => {
      const gm = makeMissionGm(def);
      runTicks(gm, 60);
      return stateChecksum(gm);
    };
    expect(run(clone(getMission('mission-anchors-demo')))).toBe(run({ ...resolved, id: 'mission-anchors-demo' }));
  });
});

describe('mapa registrado em runtime com âncoras próprias', () => {
  it('missão resolve contra as âncoras do mapa registrado e erra se elas somem', () => {
    const base = clone(getMap('tutorial'));
    const m = { ...base, id: 'tmp-anchors-map', anchors: { ponto: { x: -20, z: 8 } } };
    registerMap(m);
    try {
      const def = withSetup([spawnAt({ anchor: 'ponto', dx: 1 })], { mapId: 'tmp-anchors-map' });
      expect(validateMission(def).errors).toEqual([]);
      expect(resolveMissionAnchors(def, getMap('tmp-anchors-map')).setup[0]).toMatchObject({ x: -19, z: 8 });
    } finally {
      unregisterMap('tmp-anchors-map');
    }
    expect(validateMission(withSetup([spawnAt({ anchor: 'ponto' })], { mapId: 'tmp-anchors-map' })).errors.some((e) => e.includes('mapa desconhecido'))).toBe(true);
  });
});
