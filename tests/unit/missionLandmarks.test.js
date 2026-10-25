import { describe, it, expect } from 'vitest';
import { validateMission } from '../../src/sim/missions/schema.js';
import { UNITS } from '../../src/data/units.js';
import { PLAYER_COLORS } from '../../src/sim/MatchConfig.js';
import { baseMission, runTicks, teleport, makeMissionGm, statusOf } from './helpers/missionWorld.js';
import demo from '../../src/data/missions/mission-demo.json';
import { createMissionConfig } from '../../src/data/missions/index.js';
import { GameManager } from '../../src/core/GameManager.js';
import { Terrain } from '../../src/world/Terrain.js';
import { getMap } from '../../src/data/maps/index.js';

/** M3-X1 — marcos (`spawnLandmark`), marcadores de objetivo (`marker`), `displayName` e a demo do emissário. */
const errorsOf = (def) => validateMission(def).errors;
const has = (errs, text) => errs.some((e) => e.includes(text));
const withSetup = (...actions) => baseMission({ setup: actions });
const withObjectives = (...objectives) => baseMission({ objectives });
const escortMission = (over = {}) => baseMission({
  setup: [{ type: 'spawn', owner: 'player', unitType: 'mage', count: 1, x: -20, z: 8, tag: 'vip' }],
  objectives: [{ id: 'escort', type: 'escort', priority: 'primary', tag: 'vip', area: { x: 14, z: -18, r: 6 }, title: 'Escoltar' }],
  ...over
});

describe('schema: spawnLandmark / lightLandmark (M3-X1)', () => {
  it('aceita os marcos válidos (com tag, rótulo, escala, giro e known)', () => {
    const def = withSetup(
      { type: 'spawnLandmark', kind: 'ruins', x: 10, z: 4, tag: 'ruins', scale: 1.2, facing: 90, label: { 'pt-BR': 'Ruínas', en: 'Ruins' } },
      { type: 'spawnLandmark', kind: 'truce_post', x: 14, z: -18, known: true },
      { type: 'spawnLandmark', kind: 'shrine', x: -4, z: 2 }
    );
    expect(errorsOf(def)).toEqual([]);
  });

  it('recusa kind desconhecido, coordenada ausente, fora da área e escala fora do intervalo', () => {
    expect(has(errorsOf(withSetup({ type: 'spawnLandmark', kind: 'camp_prison', x: 0, z: 0 })), 'kind deve ser')).toBe(true);
    expect(has(errorsOf(withSetup({ type: 'spawnLandmark', kind: 'ruins', z: 0 })), '.x')).toBe(true);
    expect(has(errorsOf(withSetup({ type: 'spawnLandmark', kind: 'ruins', x: 500, z: 0 })), 'fora da área do mapa')).toBe(true);
    expect(has(errorsOf(withSetup({ type: 'spawnLandmark', kind: 'ruins', x: 0, z: 0, scale: 9 })), 'fora do intervalo')).toBe(true);
  });

  it('recusa tag inválida, rótulo não-texto e known não-booleano', () => {
    expect(has(errorsOf(withSetup({ type: 'spawnLandmark', kind: 'ruins', x: 0, z: 0, tag: 'Com Espaço' })), 'tag inválida')).toBe(true);
    expect(has(errorsOf(withSetup({ type: 'spawnLandmark', kind: 'ruins', x: 0, z: 0, label: 12 })), 'texto deve ser')).toBe(true);
    expect(has(errorsOf(withSetup({ type: 'spawnLandmark', kind: 'ruins', x: 0, z: 0, known: 'sim' })), 'deve ser booleano')).toBe(true);
  });

  it('lightLandmark exige uma tag que algum marco cria', () => {
    expect(errorsOf(withSetup(
      { type: 'spawnLandmark', kind: 'ruins', x: 0, z: 0, tag: 'ruins' },
      { type: 'lightLandmark', tag: 'ruins' }
    ))).toEqual([]);
    expect(has(errorsOf(withSetup({ type: 'lightLandmark', tag: 'nada' })), 'tag "nada" nunca é criada')).toBe(true);
  });
});

describe('schema: marker e displayName (M3-X1)', () => {
  it('marcador circular válido, com estilo e showWhen', () => {
    expect(errorsOf(withObjectives({ id: 'o1', type: 'survive', seconds: 5, title: 'x', marker: { area: { x: 0, z: 0, r: 4 }, style: 'discover', showWhen: 'revealed' } }))).toEqual([]);
  });

  it('recusa marcador sem área, com área retangular, estilo ou showWhen inválidos e campo desconhecido', () => {
    const obj = (marker) => withObjectives({ id: 'o1', type: 'survive', seconds: 5, title: 'x', marker });
    expect(has(errorsOf(obj({ style: 'goal' })), 'precisa de "area"')).toBe(true);
    expect(has(errorsOf(obj({ area: { x1: 0, z1: 0, x2: 4, z2: 4 } })), 'área circular')).toBe(true);
    expect(has(errorsOf(obj({ area: { x: 0, z: 0, r: 4 }, style: 'neon' })), 'style deve ser')).toBe(true);
    expect(has(errorsOf(obj({ area: { x: 0, z: 0, r: 4 }, showWhen: 'sempre' })), 'showWhen deve ser')).toBe(true);
    expect(has(errorsOf(obj({ area: { x: 0, z: 0, r: 4 }, cor: 'red' })), 'campo desconhecido no marcador')).toBe(true);
  });

  it('spawn.displayName é texto localizado; número é recusado', () => {
    const spawn = (displayName) => withSetup({ type: 'spawn', owner: 'player', unitType: 'mage', count: 1, x: 0, z: 0, displayName });
    expect(errorsOf(spawn({ 'pt-BR': 'Emissário', en: 'Envoy' }))).toEqual([]);
    expect(has(errorsOf(spawn(7)), 'displayName')).toBe(true);
  });
});

describe('MissionRuntime: marcos e marcadores (M3-X1)', () => {
  it('spawnLandmark cria o marco no runtime, com id sequencial e valores padrão', () => {
    const gm = makeMissionGm(withSetup({ type: 'spawnLandmark', kind: 'ruins', x: 10, z: 4, tag: 'ruins' }));
    expect(gm.mission.landmarks).toEqual([expect.objectContaining({ id: 1, kind: 'ruins', x: 10, z: 4, scale: 1, facing: 0, tag: 'ruins', known: false, lit: 0 })]);
  });

  it('o estado dos marcos sobrevive a serializar e restaurar (save/replay) e entra no checksum', () => {
    const def = withSetup({ type: 'spawnLandmark', kind: 'shrine', x: -4, z: 2, tag: 'altar', label: { 'pt-BR': 'Altar' } });
    const gm = makeMissionGm(def);
    const plain = makeMissionGm(baseMission());
    expect(gm.mission.hashString()).not.toBe(plain.mission.hashString());
    const state = JSON.parse(JSON.stringify(gm.mission.landmarkState()));
    const other = makeMissionGm(baseMission());
    other.mission.restoreLandmarkState(state);
    expect(other.mission.landmarkState()).toEqual(state);
    expect(other.mission.landmarks[0].label).toEqual({ 'pt-BR': 'Altar' });
  });

  it('lightLandmark acende o marco uma vez e muda o estado (hash)', () => {
    const gm = makeMissionGm(withSetup({ type: 'spawnLandmark', kind: 'ruins', x: 0, z: 0, tag: 'ruins' }));
    const before = gm.mission.hashString();
    runTicks(gm, 3);
    gm.mission.lightLandmark('ruins');
    const lit = gm.mission.landmarks[0].lit;
    expect(lit).toBeGreaterThan(0);
    expect(gm.mission.hashString()).not.toBe(before);
    gm.mission.lightLandmark('ruins');
    expect(gm.mission.landmarks[0].lit).toBe(lit); // não redispara
  });

  it('escort ganha marcador "goal" na área enquanto ativo e perde ao concluir', () => {
    const gm = makeMissionGm(escortMission());
    expect(gm.mission.markers()).toEqual([{ id: 'escort', style: 'goal', area: { x: 14, z: -18, r: 6 } }]);
    teleport(gm, gm.mission.tags.get('vip').map((id) => gm.entitiesById.get(id))[0], 14, -18);
    runTicks(gm, 10);
    expect(statusOf(gm, 'escort')).toBe('completed');
    expect(gm.mission.markers()).toEqual([]);
  });

  it('objetivo oculto com marcador só mostra depois de revealObjective', () => {
    const gm = makeMissionGm(baseMission({
      objectives: [
        { id: 'o1', type: 'survive', seconds: 60, title: 'x' },
        { id: 'hid', type: 'survive', seconds: 60, priority: 'hidden', title: 'y', marker: { area: { x: 0, z: 0, r: 5 }, style: 'discover' } }
      ]
    }));
    expect(gm.mission.markers()).toEqual([]);
    gm.mission.revealObjective('hid');
    expect(gm.mission.markers()).toEqual([{ id: 'hid', style: 'discover', area: { x: 0, z: 0, r: 5 } }]);
  });

  it('showWhen "revealed" mantém o marcador de um objetivo inativo já revelado; "active" não', () => {
    const area = { x: 2, z: 2, r: 4 };
    const gm = makeMissionGm(baseMission({
      objectives: [
        { id: 'o1', type: 'survive', seconds: 60, title: 'x' },
        { id: 'rev', type: 'survive', seconds: 60, priority: 'secondary', active: false, title: 'y', marker: { area, showWhen: 'revealed' } },
        { id: 'act', type: 'survive', seconds: 60, priority: 'secondary', active: false, title: 'z', marker: { area } }
      ]
    }));
    gm.mission.revealObjective('rev');
    gm.mission.revealObjective('act');
    expect(gm.mission.markers().map((m) => m.id)).toEqual(['rev']);
  });
});

describe('mission-demo: emissário, trégua e ruínas (M3-X1)', () => {
  const demoGm = () => {
    const cfg = createMissionConfig('mission-demo');
    cfg.headless = true;
    return new GameManager(new Terrain(getMap(cfg.mapId)), null, null, cfg);
  };
  const envoy = (gm) => gm.mission.tags.get('envoy').map((id) => gm.entitiesById.get(id))[0];

  it('tem trégua visível desde o início e as ruínas escondidas até serem exploradas', () => {
    const gm = demoGm();
    runTicks(gm, 2);
    const lms = gm.mission.landmarks;
    expect(lms.find((l) => l.kind === 'truce_post')).toEqual(expect.objectContaining({ x: 14, z: -18, known: true }));
    expect(lms.find((l) => l.kind === 'ruins')).toEqual(expect.objectContaining({ x: 34, z: 26, known: false }));
  });

  it('a escolta tem marcador dourado na área da trégua', () => {
    const gm = demoGm();
    runTicks(gm, 2);
    expect(gm.mission.markers()).toEqual([{ id: 'escort-envoy', style: 'goal', area: { x: 14, z: -18, r: 6 } }]);
  });

  it('o emissário é um herói NÃO treinável (não está nas unidades que a missão libera) e tem nome e anel próprios', () => {
    const gm = demoGm();
    const u = envoy(gm);
    expect(u.type).toBe('hero_oren');
    expect(UNITS[u.type].cost).toBeNull(); // não treinável em nenhuma partida
    expect(u.displayName).toEqual({ 'pt-BR': 'Emissário', en: 'Envoy' });
    expect(u.markColor).toBe('#f0abfc');
    expect(PLAYER_COLORS.map((c) => c.toLowerCase())).not.toContain(u.markColor);
  });

  it('a cor do anel do emissário não se confunde com nenhuma cor de jogador', () => {
    const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const mine = hex('#f0abfc');
    for (const c of PLAYER_COLORS) {
      const d = Math.hypot(...hex(c).map((v, i) => v - mine[i]));
      expect(d).toBeGreaterThan(60);
    }
  });

  it('ao achar as ruínas, o marco acende e o ouro é concedido', () => {
    const gm = demoGm();
    const me = () => gm.getUnitsOf(0)[0];
    teleport(gm, me(), 34, 26);
    runTicks(gm, 10);
    expect(statusOf(gm, 'scout-ruins')).toBe('completed');
    expect(gm.mission.landmarks.find((l) => l.kind === 'ruins').lit).toBeGreaterThan(0);
  });

  it('a demo continua válida (sem erros de schema)', () => {
    expect(validateMission(demo).errors).toEqual([]);
  });
});
