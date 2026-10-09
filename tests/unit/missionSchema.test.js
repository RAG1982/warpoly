import { describe, it, expect } from 'vitest';
import { validateMission, assertMission, MissionError, MISSION_VERSION } from '../../src/sim/missions/schema.js';
import { getMission, listMissions, createMissionConfig, registerMission, unregisterMission, resolveMissionDef } from '../../src/data/missions/index.js';
import { validateMatchConfig, createMatchConfig } from '../../src/sim/MatchConfig.js';
import { baseMission } from './helpers/missionWorld.js';
import demo from '../../src/data/missions/mission-demo.json';

/** F8-04 — validação do JSON de missão (versionado), registro e integração com a MatchConfig. */
const errorsOf = (def, opts) => validateMission(def, opts).errors;
const has = (errs, text) => errs.some((e) => e.includes(text));
const clone = (o) => JSON.parse(JSON.stringify(o));

describe('validateMission (F8-04)', () => {
  it('a missão de demonstração e a missão base são válidas', () => {
    expect(errorsOf(demo)).toEqual([]);
    expect(errorsOf(baseMission())).toEqual([]);
    expect(demo.version).toBe(MISSION_VERSION);
  });

  it('JSON que não é objeto, formato e versão errados', () => {
    expect(validateMission(null).ok).toBe(false);
    expect(validateMission([]).ok).toBe(false);
    expect(has(errorsOf({ ...baseMission(), format: 'outro' }), 'format')).toBe(true);
    expect(has(errorsOf({ ...baseMission(), version: 99 }), 'versão 99')).toBe(true);
  });

  it('campos obrigatórios, id e mapa', () => {
    const m = baseMission();
    delete m.title;
    delete m.briefing;
    expect(has(errorsOf(m), 'title')).toBe(true);
    expect(has(errorsOf(m), 'briefing')).toBe(true);
    expect(has(errorsOf({ ...baseMission(), id: 'Id Inválido!' }), 'id inválido')).toBe(true);
    expect(has(errorsOf({ ...baseMission(), mapId: 'nao-existe' }), 'mapa desconhecido')).toBe(true);
    expect(errorsOf({ ...baseMission(), mapId: 'nao-existe' }, { checkMap: false })).toEqual([]);
  });

  it('textos localizados exigem pt-BR e idiomas conhecidos', () => {
    expect(has(errorsOf({ ...baseMission(), title: { en: 'only english' } }), 'pt-BR')).toBe(true);
    expect(has(errorsOf({ ...baseMission(), title: { 'pt-BR': 'x', fr: 'y' } }), 'idioma desconhecido')).toBe(true);
    expect(has(errorsOf({ ...baseMission(), title: 42 }), 'texto deve ser')).toBe(true);
    expect(errorsOf({ ...baseMission(), title: { 'pt-BR': 'x', en: 'y' } })).toEqual([]);
  });

  it('jogadores: exatamente um local, slots existentes e sem repetição', () => {
    const m = baseMission();
    m.players[1].isLocal = true;
    expect(has(errorsOf(m), 'exatamente um jogador')).toBe(true);
    const n = baseMission();
    n.players[1].startSlot = 0;
    expect(has(errorsOf(n), 'slot repetido')).toBe(true);
    const o = baseMission();
    o.players[1].startSlot = 7;
    expect(has(errorsOf(o), 'não tem o slot')).toBe(true);
    const p = baseMission();
    p.players[1].factionId = 'elfo';
    expect(has(errorsOf(p), 'human|orc')).toBe(true);
  });

  it('objetivos: tipos, parâmetros por tipo, ids duplicados e ausência de primário', () => {
    const base = (o) => baseMission({ objectives: [{ priority: 'primary', title: 't', ...o }] });
    expect(has(errorsOf(base({ id: 'a', type: 'voar' })), 'tipo de objetivo desconhecido')).toBe(true);
    expect(has(errorsOf(base({ id: 'a', type: 'survive' })), 'seconds')).toBe(true);
    expect(has(errorsOf(base({ id: 'a', type: 'destroy', select: {} })), 'seletor de mortes')).toBe(true);
    expect(has(errorsOf(base({ id: 'a', type: 'build', count: 1 })), 'buildingType ou role')).toBe(true);
    expect(has(errorsOf(base({ id: 'a', type: 'build', buildingType: 'torre-de-marfim', count: 1 })), 'construção desconhecida')).toBe(true);
    expect(has(errorsOf(base({ id: 'a', type: 'collect', resource: 'ferro', amount: 5 })), 'recurso inválido')).toBe(true);
    expect(has(errorsOf(base({ id: 'a', type: 'escort', tag: 'x', area: { x: 0, z: 0 } })), 'r')).toBe(true);
    expect(has(errorsOf(base({ id: 'a', type: 'escort', tag: 'x', area: { x: 0, z: 0, r: 3 } })), 'tag "x" nunca é criada')).toBe(true);
    expect(has(errorsOf(base({ id: 'a', type: 'eliminate', owners: [] })), 'lista não vazia')).toBe(true);
    expect(has(errorsOf(base({ id: 'a', type: 'survive', seconds: 5, priority: 'urgente' })), 'prioridade')).toBe(true);
    const dup = baseMission({ objectives: [{ id: 'a', type: 'survive', priority: 'primary', seconds: 1, title: 't' }, { id: 'a', type: 'survive', priority: 'primary', seconds: 1, title: 't' }] });
    expect(has(errorsOf(dup), 'id duplicado')).toBe(true);
    const noPrimary = baseMission({ objectives: [{ id: 'a', type: 'survive', priority: 'secondary', seconds: 1, title: 't' }] });
    expect(has(errorsOf(noPrimary), 'objetivo primário')).toBe(true);
    expect(errorsOf({ ...noPrimary, autoVictory: false })).toEqual([]);
    expect(has(errorsOf(baseMission({ objectives: [] })), 'lista não vazia')).toBe(true);
  });

  it('condições e ações: tipos, parâmetros e referências cruzadas', () => {
    const trig = (when, actions = [{ type: 'message', text: 'x' }]) => baseMission({ vars: { v: 0 }, triggers: [{ id: 't', when, actions }] });
    expect(has(errorsOf(trig({ type: 'lua' })), 'tipo de condição desconhecido')).toBe(true);
    expect(has(errorsOf(trig({ type: 'time' })), 'at')).toBe(true);
    expect(has(errorsOf(trig({ type: 'area', area: { x: 0, z: 0, r: 2 } }, [{ type: 'dança' }])), 'tipo de ação desconhecido')).toBe(true);
    expect(has(errorsOf(trig({ type: 'var', name: 'zzz', value: 1 })), 'não declarada')).toBe(true);
    expect(has(errorsOf(trig({ type: 'var', name: 'v', op: '~', value: 1 })), 'operador')).toBe(true);
    expect(has(errorsOf(trig({ type: 'objective', id: 'fantasma', status: 'completed' })), 'não existe')).toBe(true);
    expect(has(errorsOf(trig({ type: 'trigger', id: 'fantasma' })), 'gatilho "fantasma"')).toBe(true);
    expect(has(errorsOf(trig({ all: [] })), 'lista não vazia')).toBe(true);
    expect(has(errorsOf(trig({ type: 'time', at: 1 }, [])), 'lista não vazia')).toBe(true);
    expect(has(errorsOf(trig({ type: 'time', at: 1 }, [{ type: 'spawn', owner: 'bandits', unitType: 'dragao', count: 1, x: 0, z: 0 }])), 'unidade desconhecida')).toBe(true);
    expect(has(errorsOf(trig({ type: 'time', at: 1 }, [{ type: 'spawn', owner: 'bandits', unitType: 'bandit', count: 1, x: 9999, z: 0 }])), 'fora da área')).toBe(true);
    expect(has(errorsOf(trig({ type: 'time', at: 1 }, [{ type: 'giveResources', owner: 'player' }])), 'ao menos um recurso')).toBe(true);
    expect(has(errorsOf(trig({ type: 'time', at: 1 }, [{ type: 'sound', id: 'trovão' }])), 'id deve ser')).toBe(true);
    expect(has(errorsOf(trig({ type: 'time', at: 1 }, [{ type: 'setVar', name: 'v', value: null }])), 'valor deve ser')).toBe(true);
    expect(has(errorsOf(trig({ type: 'time', at: 1 }, [{ type: 'enableTrigger', id: 'nao' }])), 'não existe')).toBe(true);
    expect(has(errorsOf(trig({ type: 'time', at: 1 }, [{ type: 'setTeam', player: 'player', team: -1 }])), 'team')).toBe(true);
    expect(has(errorsOf(trig({ type: 'time', at: 1 }, [{ type: 'order', select: {}, kind: 'voar', x: 0, z: 0 }])), 'kind')).toBe(true);
  });

  it('cutscene: passos em ordem, dentro da duração', () => {
    const cut = (steps, duration = 5) => baseMission({ triggers: [{ id: 't', when: { type: 'time', at: 0 }, actions: [{ type: 'cutscene', duration, steps }] }] });
    expect(errorsOf(cut([{ at: 0, x: 0, z: 0 }, { at: 3, x: 5, z: 5 }]))).toEqual([]);
    expect(has(errorsOf(cut([{ at: 3, x: 0, z: 0 }, { at: 1, x: 5, z: 5 }])), 'ordem crescente')).toBe(true);
    expect(has(errorsOf(cut([{ at: 9, x: 0, z: 0 }])), 'depois do fim')).toBe(true);
    expect(has(errorsOf(cut([])), 'lista não vazia')).toBe(true);
  });

  it('reporta TODOS os erros de uma vez e assertMission lança MissionError', () => {
    const bad = baseMission({ objectives: [{ id: 'a', type: 'survive' }, { id: 'b', type: 'build' }], triggers: [{ id: 'x', when: { type: 'time' }, actions: [] }] });
    const r = validateMission(bad);
    expect(r.errors.length).toBeGreaterThan(4);
    expect(() => assertMission(bad)).toThrow(MissionError);
    try {
      assertMission(bad);
    } catch (e) {
      expect(e.errors).toEqual(r.errors);
      expect(e.message).toContain('t-mission');
    }
  });

  it('o demo cobre todos os tipos de objetivo e de ação', () => {
    const added = demo.triggers.flatMap((t) => t.actions).filter((a) => a.type === 'addObjective').map((a) => a.objective);
    const types = new Set([...demo.objectives, ...added].map((o) => o.type));
    expect([...types].sort()).toEqual(['build', 'collect', 'destroy', 'eliminate', 'escort', 'flag', 'rescue', 'survive']);
    const allActions = [...demo.setup, ...demo.triggers.flatMap((t) => t.actions)].map((a) => a.type);
    for (const a of ['spawn', 'giveResources', 'takeResources', 'setObjective', 'addObjective', 'revealObjective', 'reveal', 'setTeam', 'transfer', 'dialog', 'message', 'defeat', 'music', 'sound', 'camera', 'cutscene', 'setVar', 'incVar', 'enableTrigger', 'disableTrigger', 'tag', 'order']) {
      expect(allActions).toContain(a);
    }
    const condTypes = new Set();
    const walk = (c) => { if (c.all) c.all.forEach(walk); else if (c.any) c.any.forEach(walk); else if (c.not) walk(c.not); else condTypes.add(c.type); };
    demo.triggers.forEach((t) => walk(t.when));
    demo.objectives.forEach((o) => o.condition && walk(o.condition));
    for (const c of ['time', 'every', 'area', 'dead', 'count', 'var', 'objective', 'resource', 'trigger']) expect(condTypes).toContain(c);
  });
});

describe('registro de missões e MatchConfig (F8-04)', () => {
  it('só a demonstração está no menu; getMission/listMissions', () => {
    expect(listMissions().map((m) => m.id)).toEqual(['mission-demo']);
    expect(getMission('mission-demo')).toBe(demo);
    expect(getMission('nada')).toBeUndefined();
  });

  it('registerMission valida, não sobrescreve as embutidas e unregister remove', () => {
    expect(() => registerMission({ ...baseMission(), objectives: [] })).toThrow(MissionError);
    expect(() => registerMission({ ...clone(demo) })).toThrow(/embutida/);
    registerMission(baseMission({ id: 'extra-1' }));
    expect(getMission('extra-1')).toBeTruthy();
    expect(unregisterMission('extra-1')).toBe(true);
    expect(unregisterMission('mission-demo')).toBe(false);
  });

  it('createMissionConfig gera uma MatchConfig válida de missão (nomes por idioma)', () => {
    const cfg = createMissionConfig('mission-demo');
    expect(cfg.victoryMode).toBe('mission');
    expect(cfg.missionId).toBe('mission-demo');
    expect(cfg.players.map((p) => p.name)).toEqual(['Você', 'Emissários do Clã']);
    expect(createMissionConfig('mission-demo', { lang: 'en' }).players[0].name).toBe('You');
    expect(() => validateMatchConfig(cfg)).not.toThrow();
    expect(createMissionConfig('mission-demo', { inline: true }).mission.id).toBe('mission-demo');
    expect(() => createMissionConfig('nada')).toThrow(/desconhecida/);
  });

  it('validateMatchConfig recusa missão inexistente, inválida ou com modo de vitória errado', () => {
    const cfg = createMissionConfig('mission-demo');
    expect(() => validateMatchConfig({ ...cfg, missionId: 'nada' })).toThrow(/missão desconhecida/);
    expect(() => validateMatchConfig({ ...cfg, victoryMode: 'conquest' })).toThrow(/victoryMode "mission"/);
    expect(() => validateMatchConfig({ ...cfg, mission: { ...clone(demo), objectives: [] } })).toThrow(MissionError);
    expect(() => validateMatchConfig({ ...createMatchConfig({ seed: 1 }), victoryMode: 'mission' })).toThrow(/exige missionId/);
    expect(resolveMissionDef(createMatchConfig({ seed: 1 }))).toBeNull();
  });
});
