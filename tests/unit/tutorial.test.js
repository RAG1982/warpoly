import { describe, it, expect } from 'vitest';
import { GameManager } from '../../src/core/GameManager.js';
import { Terrain } from '../../src/world/Terrain.js';
import { getMap, listMaps } from '../../src/data/maps/index.js';
import { validateMatchConfig } from '../../src/sim/MatchConfig.js';
import { getHeightForMap } from '../../src/world/terrainGenerators.js';
import { CMD } from '../../src/sim/commands.js';
import { EVT } from '../../src/sim/events.js';
import { SIM_DT } from '../../src/sim/constants.js';
import {
  Tutorial, TUTORIAL_STEPS, TUTORIAL_EVENT_TYPES, TUTORIAL_MAP_ID, TUTORIAL_RIVAL_ID, createTutorialConfig
} from '../../src/ui/tutorial.js';
import ptBR from '../../src/i18n/pt-BR.json';
import en from '../../src/i18n/en.json';

const ME = 0;

/** Eventos que concluem cada passo (sem o `poll`). */
const FINISH = {
  wood: (tut) => tut.handleEvent(EVT.RESOURCE_GATHERED, { ownerId: ME, type: 'wood', amount: 40 }),
  gold: (tut) => tut.handleEvent(EVT.RESOURCE_GATHERED, { ownerId: ME, type: 'gold', amount: 40 }),
  house: (tut) => tut.handleEvent(EVT.BUILDING_COMPLETED, { ownerId: ME, buildingType: 'cottage' }),
  farm: (tut) => tut.handleEvent(EVT.BUILDING_COMPLETED, { ownerId: ME, buildingType: 'farm' }),
  barracks: (tut) => tut.handleEvent(EVT.BUILDING_COMPLETED, { ownerId: ME, buildingType: 'barracks' }),
  train: (tut) => { tut.handleEvent(EVT.UNIT_TRAINED, { ownerId: ME, unitType: 'knight' }); tut.handleEvent(EVT.UNIT_TRAINED, { ownerId: ME, unitType: 'archer' }); },
  attack: (tut) => tut.handleEvent(EVT.CAMP_CLEARED, { byOwnerId: ME }),
  rival: (tut) => tut.handleEvent(EVT.PLAYER_DEFEATED, { ownerId: TUTORIAL_RIVAL_ID, name: 'x' })
};
/** Conclui, em ordem, os passos `ids` (o 1º, `select`, pelo instantâneo de seleção). */
function finishSteps(tut, ids) {
  for (const id of ids) {
    expect(tut.step.id).toBe(id);
    if (id === 'select') tut.update({ selectedWorker: true });
    else FINISH[id](tut);
  }
}
const ALL_BEFORE_ATTACK = ['select', 'wood', 'gold', 'house', 'farm', 'barracks', 'train'];

describe('tutorial — lógica pura (F6-09)', () => {
  it('passos em ordem e textos nos dois idiomas', () => {
    expect(TUTORIAL_STEPS.map((s) => s.id)).toEqual(['select', 'wood', 'gold', 'house', 'farm', 'barracks', 'train', 'attack', 'rival']);
    for (const s of TUTORIAL_STEPS) {
      for (const k of [`tut.${s.id}.title`, `tut.${s.id}.text`]) {
        expect(ptBR[k], k).toBeTruthy();
        expect(en[k], k).toBeTruthy();
      }
    }
  });

  it('avança por eventos do EventBus, na ordem, ignorando outros jogadores e eventos fora de hora', () => {
    const states = [];
    const tut = new Tutorial({ localPlayerId: ME, onChange: (s) => states.push(s.stepId) });
    // Evento adiantado não conta.
    tut.handleEvent(EVT.BUILDING_COMPLETED, { ownerId: ME, buildingType: 'cottage' });
    expect(tut.step.id).toBe('select');
    tut.update({ selectedWorker: false });
    expect(tut.step.id).toBe('select');
    tut.update({ selectedWorker: true });
    expect(tut.step.id).toBe('wood');
    // Madeira de outro jogador e ouro não contam; soma até 40.
    tut.handleEvent(EVT.RESOURCE_GATHERED, { ownerId: 1, type: 'wood', amount: 100 });
    tut.handleEvent(EVT.RESOURCE_GATHERED, { ownerId: ME, type: 'gold', amount: 100 });
    expect(tut.state()).toMatchObject({ stepId: 'wood', count: 0, need: 40 });
    tut.handleEvent(EVT.RESOURCE_GATHERED, { ownerId: ME, type: 'wood', amount: 25 });
    expect(tut.state().count).toBe(25);
    tut.handleEvent(EVT.RESOURCE_GATHERED, { ownerId: ME, type: 'wood', amount: 25 });
    expect(tut.step.id).toBe('gold');
    tut.handleEvent(EVT.RESOURCE_GATHERED, { ownerId: ME, type: 'gold', amount: 50 });
    expect(tut.step.id).toBe('house');
    tut.handleEvent(EVT.BUILDING_COMPLETED, { ownerId: ME, buildingType: 'cottage' });
    expect(tut.step.id).toBe('farm');
    tut.handleEvent(EVT.BUILDING_COMPLETED, { ownerId: ME, buildingType: 'farm' });
    tut.handleEvent(EVT.BUILDING_COMPLETED, { ownerId: ME, buildingType: 'barracks' });
    expect(tut.step.id).toBe('train');
    // Trabalhador não é "tropa"; 2 soldados concluem.
    tut.handleEvent(EVT.UNIT_TRAINED, { ownerId: ME, unitType: 'villager' });
    tut.handleEvent(EVT.UNIT_TRAINED, { ownerId: ME, unitType: 'knight' });
    expect(tut.state().count).toBe(1);
    tut.handleEvent(EVT.UNIT_TRAINED, { ownerId: ME, unitType: 'archer' });
    expect(tut.step.id).toBe('attack');
    tut.handleEvent(EVT.CAMP_CLEARED, { byOwnerId: 1 });
    expect(tut.step.id).toBe('attack');
    tut.handleEvent(EVT.CAMP_CLEARED, { byOwnerId: ME });
    expect(tut.step.id).toBe('rival');
    expect(tut.finished).toBe(false);
    // Destruir o próprio rival ou um neutro não conta; a base orc conclui o tutorial.
    tut.handleEvent(EVT.PLAYER_DEFEATED, { ownerId: ME, name: 'você' });
    expect(tut.step.id).toBe('rival');
    tut.handleEvent(EVT.PLAYER_DEFEATED, { ownerId: TUTORIAL_RIVAL_ID, name: 'Rival' });
    expect(tut.finished).toBe(true);
    expect(tut.step).toBeNull();
    expect(tut.progress).toEqual({ done: 9, total: 9 });
    expect(states[0]).toBe('select');
  });

  it('acampamento destruído ANTES do passo attack: conclui na hora ao entrar nele', () => {
    const tut = new Tutorial({ localPlayerId: ME });
    finishSteps(tut, ['select', 'wood', 'gold', 'house', 'farm', 'barracks']);
    // Durante o passo 'train' o jogador destrói o acampamento (evento de construção destruída por ele).
    expect(tut.handleEvent(EVT.BUILDING_DESTROYED, { buildingType: 'bandit_camp', killerOwnerId: ME, ownerId: 2 })).toBe(true);
    expect(tut.step.id).toBe('train');
    tut.handleEvent(EVT.UNIT_TRAINED, { ownerId: ME, unitType: 'knight' });
    tut.handleEvent(EVT.UNIT_TRAINED, { ownerId: ME, unitType: 'knight' });
    // 'attack' já estava satisfeito: passa direto e fica em 'rival'.
    expect(tut.step.id).toBe('rival');
    expect(tut.progress).toEqual({ done: 8, total: 9 });
  });

  it('acampamento caído antes do passo attack também conta pelo estado do mundo (poll)', () => {
    const tut = new Tutorial({ localPlayerId: ME });
    finishSteps(tut, ALL_BEFORE_ATTACK);
    expect(tut.step.id).toBe('attack');
    tut.update({ campGone: false });
    expect(tut.step.id).toBe('attack');
    tut.update({ campGone: true });
    expect(tut.step.id).toBe('rival');
  });

  it('base orc destruída ANTES do passo rival: conclui na hora (tutorial termina ao fim do attack)', () => {
    const tut = new Tutorial({ localPlayerId: ME });
    finishSteps(tut, ['select', 'wood', 'gold', 'house', 'farm', 'barracks']);
    tut.handleEvent(EVT.PLAYER_DEFEATED, { ownerId: TUTORIAL_RIVAL_ID, name: 'Rival' });
    expect(tut.step.id).toBe('train');
    finishSteps(tut, ['train']);
    expect(tut.step.id).toBe('attack');
    tut.handleEvent(EVT.CAMP_CLEARED, { byOwnerId: ME });
    expect(tut.finished).toBe(true);
    expect(tut.progress).toEqual({ done: 9, total: 9 });
  });

  it('holdsVictory: vale enquanto o tutorial está em curso; some ao concluir ou pular', () => {
    const tut = new Tutorial({ localPlayerId: ME });
    expect(tut.holdsVictory).toBe(true);
    finishSteps(tut, ALL_BEFORE_ATTACK);
    FINISH.attack(tut);
    expect(tut.holdsVictory).toBe(true);
    FINISH.rival(tut);
    expect(tut.holdsVictory).toBe(false);
    const skipped = new Tutorial({ localPlayerId: ME });
    skipped.skip();
    expect(skipped.holdsVictory).toBe(false);
  });

  it('Pular encerra o tutorial e ignora eventos seguintes', () => {
    const tut = new Tutorial({ localPlayerId: ME });
    tut.skip();
    expect(tut.skipped).toBe(true);
    expect(tut.active).toBe(false);
    expect(tut.handleEvent(EVT.RESOURCE_GATHERED, { ownerId: ME, type: 'wood', amount: 99 })).toBe(false);
  });

  it('todo tipo de evento usado pelos passos é assinado pelo controlador', () => {
    const used = new Set(TUTORIAL_STEPS.flatMap((s) => s.events.map((e) => e.type)));
    expect([...used].sort()).toEqual([...TUTORIAL_EVENT_TYPES].sort());
    for (const t of used) expect(Object.values(EVT)).toContain(t);
  });
});

describe('tutorial — mapa e MatchConfig', () => {
  const mapDef = getMap(TUTORIAL_MAP_ID);
  it('mapa existe, é escondido da Escaramuça e é pequeno', () => {
    expect(mapDef).toBeTruthy();
    expect(listMaps().map((m) => m.id)).not.toContain(TUTORIAL_MAP_ID);
    expect(listMaps({ includeHidden: true }).map((m) => m.id)).toContain(TUTORIAL_MAP_ID);
    expect(mapDef.size).toBeLessThanOrEqual(110);
  });
  it('slots, recursos e acampamentos em terra seca e dentro da área jogável', () => {
    const half = mapDef.playable / 2;
    const pts = [...mapDef.startSlots, ...mapDef.resources, ...mapDef.neutrals, ...mapDef.forests];
    for (const p of pts) {
      expect(Math.abs(p.x)).toBeLessThan(half);
      expect(Math.abs(p.z)).toBeLessThan(half);
      expect(getHeightForMap(mapDef, p.x, p.z), `(${p.x}, ${p.z})`).toBeGreaterThanOrEqual(1.8);
    }
  });
  it('createTutorialConfig valida e tem rival passivo (sem IA)', () => {
    const cfg = createTutorialConfig();
    expect(() => validateMatchConfig(cfg)).not.toThrow();
    expect(cfg.tutorial).toBe(true);
    expect(cfg.players.filter((p) => p.isAI)).toHaveLength(0);
    expect(cfg.players.filter((p) => p.isLocal)).toHaveLength(1);
    expect(cfg.seed).toBe(createTutorialConfig().seed);
  });
});

// ---------------------------------------------------------------------------------------------
// Percurso completo, em Node (simulação real, headless): um "jogador" roteirizado cumpre os 8
// passos pelos comandos da simulação, e o Tutorial avança só pelos eventos do EventBus.
// ---------------------------------------------------------------------------------------------
describe('tutorial — percurso completo na simulação headless', () => {
  it('conclui os 8 passos em ≤ 8 min de jogo (jogador roteirizado)', () => {
    const cfg = { ...createTutorialConfig(), headless: true };
    const gm = new GameManager(new Terrain(getMap(cfg.mapId)), null, null, cfg);
    const tut = new Tutorial({ localPlayerId: ME });
    for (const type of TUTORIAL_EVENT_TYPES) gm.events.on(type, (p) => tut.handleEvent(type, p));

    const home = gm.localPlayer.startPos;
    const workers = () => gm.units.filter((u) => u.ownerId === ME && !u.isDead && u.type === 'villager');
    const soldiers = () => gm.units.filter((u) => u.ownerId === ME && !u.isDead && ['knight', 'archer'].includes(u.type));
    const near = (list, pos) => [...list].sort((a, b) => Math.hypot(a.mesh.position.x - pos.x, a.mesh.position.z - pos.z) - Math.hypot(b.mesh.position.x - pos.x, b.mesh.position.z - pos.z));
    const run = (ticks) => { for (let i = 0; i < ticks; i++) gm.simStep(SIM_DT); };
    const elapsed = () => gm.currentTick * SIM_DT;
    const untilStep = (id, maxSec) => {
      const t0 = elapsed();
      while (tut.step && tut.step.id === id && elapsed() - t0 < maxSec) run(10);
      expect(tut.step ? tut.step.id : 'finished', `travou em ${id}`).not.toBe(id);
    };
    const place = (type) => {
      const hq = home;
      for (let r = 8; r < 40; r += 3) {
        for (let a = 0; a < 16; a++) {
          const x = hq.x + Math.cos(a * Math.PI / 8) * r;
          const z = hq.z + Math.sin(a * Math.PI / 8) * r;
          if (gm.canPlaceBuilding(type, x, z, null, ME)) {
            gm.issue({ type: CMD.PLACE_BUILDING, playerId: ME, buildingType: type, x, z, unitIds: workers().map((u) => u.id) });
            return true;
          }
        }
      }
      return false;
    };

    // 1. selecionar
    tut.update({ selectedWorker: true });
    expect(tut.step.id).toBe('wood');
    // 2–3. madeira e ouro
    const tree = near(gm.trees.filter((tr) => !tr.isDead), home)[0];
    gm.issue({ type: CMD.GATHER, playerId: ME, unitIds: workers().map((u) => u.id), targetId: tree.id });
    untilStep('wood', 120);
    const mine = near(gm.resourceDeposits.filter((r) => r.type === 'gold'), home)[0];
    gm.issue({ type: CMD.GATHER, playerId: ME, unitIds: workers().map((u) => u.id), targetId: mine.id });
    untilStep('gold', 120);
    // 4–6. casa, fazenda, quartel
    for (const [step, type] of [['house', 'cottage'], ['farm', 'farm'], ['barracks', 'barracks']]) {
      expect(place(type), `posição para ${type}`).toBe(true);
      untilStep(step, 150);
    }
    // 7. treinar 2 soldados
    const barracks = gm.buildings.find((b) => b.ownerId === ME && b.type === 'barracks' && b.isConstructed);
    gm.issue({ type: CMD.TRAIN, playerId: ME, buildingId: barracks.id, unitType: 'knight' });
    gm.issue({ type: CMD.TRAIN, playerId: ME, buildingId: barracks.id, unitType: 'knight' });
    untilStep('train', 90);
    // 8. atacar o acampamento com todas as tropas
    const camp = gm.buildings.find((b) => b.type === 'bandit_camp');
    expect(camp).toBeTruthy();
    gm.issue({ type: CMD.ATTACK_MOVE, playerId: ME, unitIds: soldiers().map((u) => u.id), x: camp.mesh.position.x, z: camp.mesh.position.z });
    const t0 = elapsed();
    while (tut.step && tut.step.id === 'attack' && elapsed() - t0 < 200) {
      run(20);
      if (!camp.isDead) gm.issue({ type: CMD.ATTACK, playerId: ME, unitIds: soldiers().map((u) => u.id), targetId: camp.id });
    }
    expect(tut.step && tut.step.id, 'passo após o acampamento').toBe('rival');
    expect(gm.isGameOver).toBe(false); // o rival ainda está de pé: a partida segue
    // 9. destruir a base do rival (atalho: derruba as construções dele) — só então o tutorial termina e vence.
    for (const b of gm.buildings.filter((x) => x.ownerId === TUTORIAL_RIVAL_ID && !x.isDead)) b.die();
    run(40);
    expect(tut.finished, 'tutorial deveria estar concluído').toBe(true);
    expect(elapsed(), 'tempo de jogo').toBeLessThanOrEqual(8 * 60);
    expect(gm.isGameOver).toBe(true);
    expect(gm.gameWon).toBe(true);
  }, 120000);

  it('vitória por conquista não termina a partida enquanto o tutorial não chega ao fim (e volta com Pular)', () => {
    const cfg = { ...createTutorialConfig(), headless: true };
    const gm = new GameManager(new Terrain(getMap(cfg.mapId)), null, null, cfg);
    const tut = new Tutorial({ localPlayerId: ME });
    for (const type of TUTORIAL_EVENT_TYPES) gm.events.on(type, (p) => tut.handleEvent(type, p));
    gm.victoryHold = () => tut.holdsVictory;
    // Rival derrotado cedo (no passo 'select'): não pode encerrar a partida às cegas.
    for (const b of gm.buildings.filter((x) => x.ownerId === TUTORIAL_RIVAL_ID && !x.isDead)) b.die();
    const run = (ticks) => { for (let i = 0; i < ticks; i++) gm.simStep(SIM_DT); };
    run(40);
    expect(tut.step.id).toBe('select');
    expect(gm.isGameOver).toBe(false);
    expect(gm.gameWon).toBe(false);
    tut.skip();
    run(5);
    expect(gm.isGameOver).toBe(true);
    expect(gm.gameWon).toBe(true);
  });
});
