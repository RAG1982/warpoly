import { describe, it, expect } from 'vitest';
import { CMD } from '../../src/sim/commands.js';
import { EVT } from '../../src/sim/events.js';
import { DIFFICULTY_PROFILES } from '../../src/ai/AIProfile.js';
import { regionAt } from '../../src/ai/AIWood.js';
import { REPLAY_SIM_VERSION } from '../../src/replay/Replay.js';
import { bootCampaignMission } from './helpers/campaignHarness.js';
import { makeGm, run } from './helpers/aiWorld.js';

/**
 * AI-AMPHIB — a IA leva o exército por mar (Barcaça) contra alvos sem rota terrestre.
 * Cenário real: missão 10 (Costa Ferrugem). O jogador (id 0) está numa ilha; os Clãs (id 1, IA) na costa leste,
 * com 3 Docas (ship_dock) já erguidas e 3 Galés de patrulha.
 */
const M10 = 'war-alliance-10-desembarque-costa-ferrugem';

async function boot({ difficulty = 'normal', barges = 0, grunts = 8, galleys = false } = {}) {
  const gm = await bootCampaignMission('war-alliance', M10);
  const ai = gm.aiDirectors[0];
  const player = gm.getPlayer(1);
  // a IA começa sem a tropa/ frota de missão: o cenário monta o que cada teste precisa
  for (const e of gm.getUnitsOf(1)) if (!e.isDead) { const keep = galleys && e.type === 'war_galley'; if (!keep) e.takeDamage(1e6, null); }
  run(gm, 5);
  const dock = gm.buildings.find(b => b.ownerId === 1 && b.type === 'ship_dock' && !b.isDead);
  const dp = gm.getDockPoint(dock);
  for (let i = 0; i < barges; i++) gm.spawnUnit('barge', dp.x + i * 2.5, dp.z, 1);
  const hqPos = ai.baseCenter;
  for (let i = 0; i < grunts; i++) gm.spawnUnit('grunt', hqPos.x - 6 - (i % 4) * 1.5, hqPos.y + 8 + Math.floor(i / 4) * 1.5, 1);
  const castle = gm.buildings.find(b => b.ownerId === 0 && b.type === 'castle');
  return { gm, ai, player, dock, castle };
}

/** Faz a IA conhecer o Castelo do jogador (a percepção sob névoa) e libera a expedição. */
function reveal(ai, castle) {
  const per = ai.perception;
  const p = castle.mesh.position;
  per.buildings.set(castle.id, { id: castle.id, type: castle.type, ownerId: 0, x: p.x, z: p.z, role: 'hq', radius: 4, tier: 1, lastSeen: per.now });
}

describe('AI-AMPHIB: perfis e versão', () => {
  it('todas as dificuldades têm barcaças/pausa; mais difícil = mais barcaças e pausa menor', () => {
    const ids = ['easy', 'normal', 'hard', 'brutal'];
    for (const id of ids) {
      const n = DIFFICULTY_PROFILES[id].naval;
      expect(n.boats, id).toBeGreaterThanOrEqual(1);
      expect(n.landCooldown, id).toBeGreaterThan(0);
    }
    for (let i = 1; i < ids.length; i++) {
      const a = DIFFICULTY_PROFILES[ids[i - 1]].naval;
      const b = DIFFICULTY_PROFILES[ids[i]].naval;
      expect(b.boats).toBeGreaterThanOrEqual(a.boats);
      expect(b.landCooldown).toBeLessThanOrEqual(a.landCooldown);
    }
    expect(REPLAY_SIM_VERSION).toBeGreaterThanOrEqual(8);
  });
});

describe('AI-AMPHIB: alvo alcançável por terra', () => {
  it('mapa continental: veredito "land", nenhum embarque, nenhuma operação anfíbia numa partida IA×IA', () => {
    const gm = makeGm({ difficulties: ['hard', 'hard'] });
    const issued = [];
    const orig = gm.issue.bind(gm);
    gm.issue = c => { issued.push(c.type); return orig(c); };
    for (const d of gm.aiDirectors) {
      expect(d.amphibious.verdict(d.baseCenter.x, d.baseCenter.y)).toBe('land');
      const other = gm.aiDirectors.find(o => o !== d);
      expect(d.amphibious.verdict(other.baseCenter.x, other.baseCenter.y)).toBe('land');
    }
    run(gm, 20 * 60 * 6);
    expect(issued.includes(CMD.LOAD)).toBe(false);
    expect(issued.includes(CMD.UNLOAD)).toBe(false);
    for (const d of gm.aiDirectors) { expect(d.amphibious.operationsStarted).toBe(0); expect(d.amphibious.demand()).toBeNull(); }
    gm.dispose();
  }, 120000);
});

describe('AI-AMPHIB: alvo numa ilha (missão 10)', () => {
  it('veredito: a base dos Clãs é terra; o Castelo do jogador só se alcança por mar', async () => {
    const { gm, ai, castle } = await boot();
    const am = ai.amphibious;
    expect(am.enabled).toBe(true);
    expect(am.verdict(ai.baseCenter.x, ai.baseCenter.y)).toBe('land');
    const p = castle.mesh.position;
    expect(am.verdict(p.x, p.z)).toBe('sea');
    expect(am.landReachable(p.x, p.z)).toBe(false);
    gm.dispose();
  });

  it('sem barcaça e sem recursos: a onda NÃO sai, não há aviso de ataque e a tropa fica em staging', async () => {
    const { gm, ai, castle } = await boot({ barges: 0 });
    reveal(ai, castle);
    const mil = ai.militaryManager;
    mil.attackThreshold = 3;
    const events = [];
    gm.events.on(EVT.NOTIFY, e => events.push(e));
    gm.events.on(EVT.UNDER_ATTACK, e => events.push(e));
    const issued = [];
    const orig = gm.issue.bind(gm);
    gm.issue = c => { issued.push(c.type); return orig(c); };
    for (let t = 0; t < 60; t++) { run(gm, 20); ai.simTime = gm.currentTick / 20; mil.manageMilitaryExpedition(); }
    expect(events.filter(e => e.ownerId === 0 && /esquadr/.test(e.text || ''))).toEqual([]);
    expect(events.filter(e => e.pos)).toEqual([]);
    expect(issued.includes(CMD.ATTACK_MOVE)).toBe(false);
    expect(ai.amphibious.demand()).toBeTruthy(); // mas pede a barcaça (Estaleiro → Barcaça)
    // tropas continuam na costa da base, na região da IA
    for (const u of gm.getUnitsOf(1)) if (u.type === 'grunt' && !u.isDead) expect(regionAt(gm.pathfinder, u.mesh.position.x, u.mesh.position.z)).toBe(1);
    gm.dispose();
  }, 120000);

  it('com Doca, Centro nível 2, refinaria e petróleo: treina a barcaça pedida (sem treinar navio de guerra antes)', async () => {
    const { gm, ai, castle } = await boot({ barges: 0 });
    reveal(ai, castle);
    const hq = gm.buildings.find(b => b.ownerId === 1 && b.type === 'great_hall');
    hq.tier = 2;
    const nm = ai.navalManager;
    expect(nm.feasible()).toBe(true);
    // refinaria "pronta" para o gerente naval ver o plano completo
    const res = gm.getPlayer(1).resources;
    Object.assign(res, { gold: 3000, wood: 3000, stone: 500, oil: 400 });
    const mil = ai.militaryManager;
    mil.attackThreshold = 3;
    const trained = [];
    gm.events.on(EVT.UNIT_TRAINED, e => trained.push(e.unitType));
    for (let t = 0; t < 240 && !trained.includes('barge'); t++) { run(gm, 20); ai.simTime = gm.currentTick / 20; mil.manageMilitaryExpedition(); }
    expect(trained).toContain('barge');
    expect(trained).not.toContain('war_galley');
    gm.dispose();
  }, 120000);

  it('com barcaça existente: embarca, navega, desembarca na ilha e ataca; o aviso sai só quando a barcaça zarpa', async () => {
    const { gm, ai, castle } = await boot({ barges: 1, grunts: 6 });
    reveal(ai, castle);
    const mil = ai.militaryManager;
    mil.attackThreshold = 3;
    const am = ai.amphibious;
    const log = [];
    const cmds = [];
    const orig = gm.issue.bind(gm);
    gm.issue = c => { cmds.push(c.type); return orig(c); };
    gm.events.on(EVT.NOTIFY, e => { if (e.ownerId === 0 && /embarcaram/.test(e.text || '')) log.push(['notify', gm.currentTick, am._op ? am._op.phase : null]); });
    const phases = [];
    for (let t = 0; t < 400; t++) {
      run(gm, 20);
      ai.simTime = gm.currentTick / 20;
      mil.manageMilitaryExpedition();
      const ph = am._op ? am._op.phase : null;
      if (phases[phases.length - 1] !== ph) phases.push(ph);
      if (am.landings > 0) break;
    }
    expect(phases).toEqual(expect.arrayContaining(['gather', 'board', 'escort', 'landing']));
    expect(am.landings).toBe(1);
    expect(cmds.includes(CMD.LOAD)).toBe(true);
    expect(cmds.includes(CMD.UNLOAD)).toBe(true);
    expect(log.length).toBe(1);
    expect(log[0][2]).toBe('landing'); // aviso depois de embarcar, ao zarpar
    // a tropa está na massa de terra do jogador e em attack-move
    const landed = gm.getUnitsOf(1).filter(u => u.type === 'grunt' && !u.isDead);
    expect(landed.length).toBeGreaterThanOrEqual(2);
    for (const u of landed) {
      expect(u.transportedBy).toBeNull();
      expect(regionAt(gm.pathfinder, u.mesh.position.x, u.mesh.position.z)).toBe(0);
    }
    gm.dispose();
  }, 180000);

  it('com escolta: navios de guerra vão à frente e a barcaça só zarpa depois; a frota não os recruta enquanto isso', async () => {
    const { gm, ai, castle } = await boot({ barges: 1, grunts: 6, galleys: true });
    reveal(ai, castle);
    const mil = ai.militaryManager;
    mil.attackThreshold = 3;
    const am = ai.amphibious;
    const nm = ai.navalManager;
    expect(nm.managesFleet()).toBe(true);
    let escortSeen = 0;
    let holdSeen = false;
    for (let t = 0; t < 400; t++) {
      run(gm, 20);
      ai.simTime = gm.currentTick / 20;
      mil.manageMilitaryExpedition();
      if (am._op && am._op.escorts.length > 0) { escortSeen = Math.max(escortSeen, am._op.escorts.length); if (nm.escortHold.size > 0) holdSeen = true; }
      if (am.landings > 0) break;
    }
    expect(escortSeen).toBeGreaterThan(0);
    expect(holdSeen).toBe(true);
    expect(am.landings).toBe(1);
    expect(nm.escortHold.size).toBe(0);
    gm.dispose();
  }, 180000);
});
