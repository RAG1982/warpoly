import { describe, it, expect } from 'vitest';
import {
  createSetup, normalizeSetup, setMap, addAI, removeAI, cycleTeam, pickColor, assignSlots, validateSetup,
  buildMatchConfig, parseSeed, maxAIs, loadSetup, saveSetup, RESOURCE_PRESETS, STORAGE_KEY, MAX_TEAMS
} from '../../src/ui/skirmishSetup.js';
import { getMap, listMaps } from '../../src/data/maps/index.js';
import { validateMatchConfig, PLAYER_COLORS } from '../../src/sim/MatchConfig.js';
import { STARTING_RESOURCES } from '../../src/data/factions.js';

const fakeStorage = (init = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, _m: m };
};

describe('skirmishSetup (F6-02)', () => {
  it('padrão: humano × 1 IA orc, mapa padrão, recursos padrão; gera MatchConfig válida', () => {
    const s = createSetup();
    expect(s.ai).toHaveLength(1);
    expect(s.localFaction).toBe('human');
    expect(s.ai[0].faction).toBe('orc');
    const cfg = buildMatchConfig(s, { seed: 7 });
    expect(cfg.players).toHaveLength(2);
    expect(cfg.seed).toBe(7);
    expect(cfg.startingResources).toEqual(STARTING_RESOURCES);
    expect(() => validateMatchConfig(cfg)).not.toThrow();
  });

  it('limite de IAs por mapa = maxPlayers − 1 (1..7)', () => {
    for (const m of listMaps()) {
      let s = createSetup(m.id);
      for (let i = 0; i < 10; i++) s = addAI(s);
      expect(s.ai.length).toBe(maxAIs(m));
      expect(s.ai.length).toBe(Math.min(7, m.maxPlayers - 1));
      s = normalizeSetup({ ...s, ai: [...s.ai, ...s.ai, ...s.ai] }); // excesso é cortado
      expect(s.ai.length).toBeLessThanOrEqual(7);
    }
    expect(maxAIs({ maxPlayers: 8 })).toBe(7);
    expect(maxAIs({ maxPlayers: 12 })).toBe(7);
  });

  it('trocar para mapa menor corta as IAs excedentes e o slot inválido', () => {
    const big = listMaps().reduce((a, b) => (b.maxPlayers > a.maxPlayers ? b : a));
    const small = listMaps().reduce((a, b) => (b.maxPlayers < a.maxPlayers ? b : a));
    let s = createSetup(big.id);
    for (let i = 0; i < 7; i++) s = addAI(s);
    s = { ...s, localSlot: big.startSlots.length - 1 };
    const t = setMap(s, small.id);
    expect(t.mapId).toBe(small.id);
    expect(t.ai.length).toBeLessThanOrEqual(small.maxPlayers - 1);
    expect(t.localSlot).toBeLessThan(small.startSlots.length);
  });

  it('removeAI mantém pelo menos 1', () => {
    let s = addAI(createSetup('ilhas-4p'));
    s = removeAI(removeAI(s, 0), 0);
    expect(s.ai).toHaveLength(1);
  });

  it('cores e slots únicos em toda combinação; trocar cor faz permuta', () => {
    let s = createSetup('ilhas-4p');
    s = addAI(addAI(s));
    const colors = [s.localColor, ...s.ai.map((a) => a.color)];
    expect(new Set(colors).size).toBe(colors.length);
    const s2 = pickColor(s, -1, s.ai[0].color);
    expect(s2.localColor).toBe(s.ai[0].color);
    expect(s2.ai[0].color).toBe(s.localColor);
    const c2 = [s2.localColor, ...s2.ai.map((a) => a.color)];
    expect(new Set(c2).size).toBe(c2.length);
    const slots = assignSlots(s);
    const all = [slots.local, ...slots.ai];
    expect(new Set(all).size).toBe(all.length);
    expect(pickColor(s, 0, 99)).toBe(s);
  });

  it('cores duplicadas no storage são corrigidas', () => {
    const n = normalizeSetup({ localColor: 2, ai: [{ color: 2 }, { color: 2 }, { color: 2 }], mapId: 'ilhas-4p' });
    const c = [n.localColor, ...n.ai.map((a) => a.color)];
    expect(new Set(c).size).toBe(c.length);
    expect(c.every((x) => x >= 0 && x < PLAYER_COLORS.length)).toBe(true);
  });

  it('pelo menos 2 times: todos no mesmo time é recusado', () => {
    const s = { ...createSetup(), localTeam: 3, ai: [{ ...createSetup().ai[0], team: 3 }] };
    expect(validateSetup(s)[0]).toMatch(/dois times/);
    expect(() => buildMatchConfig(s)).toThrow(/dois times/);
    expect(validateSetup(cycleTeam(s, 0))).toEqual([]);
  });

  it('cycleTeam é circular em 0..7', () => {
    let s = createSetup();
    for (let i = 0; i < MAX_TEAMS; i++) s = cycleTeam(s, -1);
    expect(s.localTeam).toBe(0);
  });

  it('parseSeed: vazio = aleatória, número, texto por hash estável', () => {
    expect(parseSeed('')).toBeNull();
    expect(parseSeed('  ')).toBeNull();
    expect(parseSeed('1234')).toBe(1234);
    expect(parseSeed('guerra')).toBe(parseSeed('guerra'));
    expect(parseSeed('guerra')).not.toBe(parseSeed('paz'));
    expect(parseSeed('guerra')).toBeLessThan(0x7fffffff);
    const cfg = buildMatchConfig({ ...createSetup(), seed: '42' });
    expect(cfg.seed).toBe(42);
  });

  it('recursos iniciais: presets aplicados na config', () => {
    for (const id of Object.keys(RESOURCE_PRESETS)) {
      const cfg = buildMatchConfig({ ...createSetup(), resources: id }, { seed: 1 });
      expect(cfg.startingResources).toEqual(RESOURCE_PRESETS[id].amounts);
    }
    expect(RESOURCE_PRESETS.low.amounts.gold).toBeLessThan(RESOURCE_PRESETS.rich.amounts.gold);
  });

  it('facção aleatória da IA é determinística pela semente', () => {
    const s = { ...createSetup('ilhas-4p'), ai: addAI(addAI(createSetup('ilhas-4p'))).ai.map((a) => ({ ...a, faction: 'random' })) };
    const a = buildMatchConfig(s, { seed: 99 }).players.map((p) => p.factionId);
    const b = buildMatchConfig(s, { seed: 99 }).players.map((p) => p.factionId);
    expect(a).toEqual(b);
    const seen = new Set();
    for (let seed = 1; seed < 40; seed++) buildMatchConfig(s, { seed }).players.slice(1).forEach((p) => seen.add(p.factionId));
    expect(seen.size).toBe(2);
  });

  it('toda combinação gerada nos mapas passa em validateMatchConfig (times, dificuldades, facções)', () => {
    for (const m of listMaps()) {
      let s = createSetup(m.id);
      for (let i = 0; i < 7; i++) s = addAI(s);
      s = { ...s, localFaction: 'orc', victoryMode: 'regicide' };
      s = { ...s, ai: s.ai.map((a, i) => ({ ...a, difficulty: ['easy', 'normal', 'hard', 'brutal'][i % 4], faction: ['human', 'orc', 'random'][i % 3] })) };
      const cfg = buildMatchConfig(s, { seed: 5 });
      expect(cfg.players.length).toBe(s.ai.length + 1);
      expect(cfg.players.filter((p) => p.isLocal)).toHaveLength(1);
      expect(cfg.players[1].difficulty).toBe('easy');
      expect(cfg.victoryMode).toBe('regicide');
      expect(cfg.players.length).toBeLessThanOrEqual(getMap(m.id).maxPlayers);
    }
  });

  it('persistência: ida e volta; lixo no storage vira padrão; chaves legadas valem de base', () => {
    const st = fakeStorage();
    const s = addAI({ ...createSetup('ilhas-4p'), localFaction: 'orc', resources: 'high', seed: 'abc' });
    saveSetup(s, st);
    expect(loadSetup(st)).toEqual(normalizeSetup(s));
    const bad = fakeStorage({ [STORAGE_KEY]: '{nao é json' });
    expect(loadSetup(bad)).toEqual(createSetup());
    const junk = fakeStorage({ [STORAGE_KEY]: JSON.stringify({ mapId: 'x', ai: 'oops', resources: 'zzz', localFaction: 'elfo' }) });
    expect(loadSetup(junk)).toEqual(createSetup());
    const legacy = loadSetup(fakeStorage({ 'warpoly.faction': 'orc', 'warpoly.difficulty': 'hard', 'warpoly.victory': 'regicide', 'warpoly.map': 'ilhas-4p' }));
    expect(legacy.localFaction).toBe('orc');
    expect(legacy.ai[0].difficulty).toBe('hard');
    expect(legacy.ai[0].faction).toBe('human');
    expect(legacy.victoryMode).toBe('regicide');
    expect(legacy.mapId).toBe('ilhas-4p');
  });

  it('MatchConfig recusa startingResources inválido', () => {
    const cfg = buildMatchConfig(createSetup(), { seed: 1 });
    expect(() => validateMatchConfig({ ...cfg, startingResources: { wood: -1, gold: 0, stone: 0 } })).toThrow(/startingResources/);
    expect(() => validateMatchConfig({ ...cfg, startingResources: { wood: 1 } })).toThrow(/startingResources/);
  });
});
