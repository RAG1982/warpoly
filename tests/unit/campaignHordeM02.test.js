import { describe, it, expect } from 'vitest';
import { playMission } from './helpers/campaignHarness.js';
import { EVT } from '../../src/sim/events.js';
import { win, rush } from '../fixtures/campaign-playthrough/war-horde-02-velas-brancas.js';

/**
 * M4-02 (espelho da M3-03) — m02 "Velas Brancas": resgatar 4 batedores presos pelas patrulhas de Aurelan e escoltá-los ao cais.
 * Os objetivos têm de ser VERDADEIROS (cada título descreve a condição que o conclui): batedor só é solto sem inimigo por perto,
 * a escolta só abre com os 4 resgatados, a vitória só vem após a cutscene, e um batedor morto derrota.
 */
const ID = 'war-horde-02-velas-brancas';
const PRISONS = [6, 3, 4, 5];
const d = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const pos = (e) => ({ x: e.mesh.position.x, z: e.mesh.position.z });

describe('m02 Velas Brancas · mundo e objetivos', () => {
  it('4 batedores neutros (Lanceiros-Machado) nas prisões, guardados por soldados de Aurelan; barcaça no cais; Rurga e Mensageiro NPC', async () => {
    const { gm } = await playMission('war-horde', ID, [], { maxSeconds: 1 });
    const A = gm.terrain.mapDef.anchors;
    expect(gm.terrain.mapDef.id).toBe('camp-02-pouso-do-encontro');
    const scouts = gm.mission.tags.get('scout').map((i) => gm.entitiesById.get(i));
    expect(scouts).toHaveLength(4);
    scouts.forEach((s, i) => {
      expect(s.ownerId).toBe(-1);
      expect(s.type).toBe('axethrower');
      expect(d(pos(s), A[`scoutPrison${PRISONS[i]}`])).toBeLessThan(2);
    });
    for (const k of PRISONS) {
      const g = gm.mission.tags.get(`guard${k}`).map((i) => gm.entitiesById.get(i));
      expect(g.length).toBeGreaterThanOrEqual(3);
      for (const u of g) { expect(u.ownerId).toBe(1); expect(['knight', 'archer']).toContain(u.type); }
    }
    const barge = gm.entitiesById.get(gm.mission.tags.get('rescue_barge')[0]);
    expect(barge.type).toBe('barge');
    expect(d(pos(barge), A.pier1Water)).toBeLessThan(3);
    const envoy = gm.entitiesById.get(gm.mission.tags.get('envoy')[0]);
    expect(envoy.ownerId).toBe(-1);
    expect(envoy.type).toBe('mage'); // humano, não treinável pelo jogador orc
    const rurga = gm.entitiesById.get(gm.mission.tags.get('rurga')[0]);
    expect(rurga.ownerId).toBe(-1);
    expect(gm.mission.def.objectives.filter((o) => o.priority === 'primary').map((o) => o.id)).toEqual(['rescue-scouts', 'escort-scouts']);
    expect(gm.mission.objectives.get('escort-scouts').status).toBe('inactive');
    expect(gm.mission.objectives.get('rescue-scouts').max).toBe(4);
  });

  it('investida precoce: os 3 soldados do início NÃO libertam ninguém (Talhadores caem, os batedores seguem presos, sem vitória)', async () => {
    const run = await playMission('war-horde', ID, rush, { maxSeconds: 300 });
    expect(run.outcome).toBeNull();
    expect(run.gm.mission.vars.freed).toBe(0);
    expect(run.gm.getUnitsOf(0).filter((u) => !u.isDead && u.type === 'grunt')).toHaveLength(0);
    expect(run.gm.mission.objectives.get('escort-scouts').status).toBe('inactive');
  }, 60000);

  it('batedor só é solto com os guardas mortos E sem inimigo por perto; os dois do sul compartilham a guarda', async () => {
    const seen = [];
    const run = await playMission('war-horde', ID, [
      { name: 'perto-com-guardas', wait: 1, run: (c) => { const p = c.anchor('scoutPrison4'); c.teleport(c.mine('grunt')[0], p.x + 3, p.z); } },
      { name: 'ainda-preso', wait: 1, run: (c) => { seen.push(c.gm.mission.vars.freed); c.slayTag('guard4'); } },
      // guardas mortos, mas um inimigo extra (Arqueiro de Aurelan) ainda perto do batedor: continua preso
      { name: 'intruso', wait: 0.5, run: (c) => { c.gm.spawnUnit('archer', c.anchor('scoutPrison4').x, c.anchor('scoutPrison4').z + 6, 1); } },
      { name: 'segue-preso', wait: 1, run: (c) => { seen.push(c.gm.mission.vars.freed); c.slay(c.gm.getUnitsOf(1).filter((u) => d(pos(u), c.anchor('scoutPrison4')) < 16)); } },
      { name: 'solto', wait: 1.5, run: (c) => { seen.push(c.gm.mission.vars.freed); } },
      // sul: matar só a guarda do 6 não basta (o 3 está a 14 u e é a mesma guarda)
      { name: 'sul', wait: 1, run: (c) => { const p = c.anchor('scoutPrison6'); c.teleport(c.mine('grunt')[1] || c.mine('axethrower')[0], p.x + 2, p.z); c.slayTag('guard6'); } },
      { name: 'sul-metade', wait: 1.5, run: (c) => { seen.push(c.gm.mission.vars.freed); c.slayTag('guard3'); } },
      { name: 'sul-fim', wait: 1.5, run: (c) => { seen.push(c.gm.mission.vars.freed); } }
    ], { maxSeconds: 40 });
    expect(seen).toEqual([0, 0, 1, 1, 3]);
    void run;
  }, 60000);

  it('rescue concluído abre a escolta; escoltar os 4 até o cais vence só depois da cutscene final', async () => {
    const log = [];
    const script = [
      { name: 'gravador', run: (c) => { c.gm.events.on(EVT.MISSION_OBJECTIVE, (e) => log.push(`obj:${e.id}:${e.status}`)); c.gm.events.on(EVT.MISSION_CUTSCENE, (e) => log.push(`cut:${e.id}`)); c.gm.events.on(EVT.MISSION_ENDED, (e) => log.push(`end:${e.outcome}`, e.text?.['pt-BR'])); } },
      { name: 'solta', wait: 1, run: (c) => { for (const k of PRISONS) c.slayTag(`guard${k}`); for (const e of c.tagged('scout')) c.gm.transferUnit(e, 0); } },
      { name: 'espera', wait: 1, run: (c) => { if (c.status('rescue-scouts') !== 'completed' || c.status('escort-scouts') !== 'active') throw new Error('rescue devia concluir e abrir a escolta'); } },
      { name: 'longe', wait: 1, run: (c) => { if (c.status('escort-scouts') !== 'active' || c.obj('escort-scouts').cur !== 0) throw new Error('escolta devia estar em 0/4'); } },
      { name: 'cais', wait: 1, run: (c) => { const p = c.anchor('pier1'); c.tagged('scout').forEach((u, i) => c.teleport(u, p.x + i, p.z + 2)); } }
    ];
    const run = await playMission('war-horde', ID, script, { maxSeconds: 90 });
    expect(run.outcome, log.join(' | ')).toBe('victory');
    const at = (s) => log.findIndex((l) => l === s);
    expect(at('obj:escort-scouts:completed')).toBeGreaterThan(at('obj:rescue-scouts:completed'));
    expect(at('cut:finale')).toBeGreaterThan(at('obj:escort-scouts:completed'));
    expect(at('end:victory')).toBeGreaterThan(at('cut:finale'));
  }, 60000);

  it('batedor morto antes de resgatar todos derrota; morto na escolta também', async () => {
    const a = await playMission('war-horde', ID, [{ name: 'mata', wait: 2, run: (c) => c.slay([c.tagged('scout')[0]]) }], { maxSeconds: 20 });
    expect(a.outcome).toBe('defeat');
    const b = await playMission('war-horde', ID, [
      { name: 'solta', wait: 1, run: (c) => { for (const e of c.tagged('scout')) c.gm.transferUnit(e, 0); } },
      { name: 'mata', wait: 3, run: (c) => c.slay([c.tagged('scout')[1]]) }
    ], { maxSeconds: 30 });
    expect(b.outcome).toBe('defeat');
  }, 60000);

  it('Forja → Lâminas de Guerra e Torre de Vigia: secundárias encadeadas; a torre dá +100 de madeira; não mudam a vitória', async () => {
    let wood0 = 0;
    const run = await playMission('war-horde', ID, [
      { name: 'estado', run: (c) => { wood0 = c.gm.getPlayer(0).resources.wood; if (c.status('research-weapons') !== 'inactive') throw new Error('pesquisa só abre com a Forja'); } },
      { name: 'forja', wait: 1, run: (c) => c.gm.mission.setObjectiveStatus('build-forge', 'completed') },
      { name: 'abre', wait: 1, run: (c) => { if (c.status('research-weapons') !== 'active') throw new Error('Forja devia abrir a pesquisa'); c.gm.mission.setObjectiveStatus('build-tower', 'completed'); } },
      { name: 'torre', wait: 1, run: (c) => { if (c.gm.getPlayer(0).resources.wood < wood0 + 100 - 5) throw new Error('+100 de madeira'); } }
    ], { maxSeconds: 20 });
    expect(run.outcome).toBeNull();
    const defs = run.gm.mission.def.objectives;
    expect(defs.find((o) => o.id === 'research-weapons').condition).toMatchObject({ type: 'research', id: 'melee_weapons' });
    expect(defs.filter((o) => o.priority === 'secondary').map((o) => o.id)).toEqual(['build-forge', 'research-weapons', 'build-tower']);
  }, 60000);

  it('oculta: poupar o Mensageiro (+100 de ouro); ruínas (+200) aparecem no painel após o 1º batedor', async () => {
    let g0 = 0;
    const run = await playMission('war-horde', ID, [
      { name: 'honra', run: (c) => { g0 = c.gm.getPlayer(0).resources.gold; const p = c.anchor('emissary1'); c.teleport(c.mine('grunt')[0], p.x + 2, p.z); }, each: () => {}, until: (c) => c.status('envoy-honor') === 'completed', timeout: 10 },
      { name: 'ouro', wait: 1, run: (c) => { if (c.gm.getPlayer(0).resources.gold < g0 + 100 - 5) throw new Error('+100 de ouro'); if (c.gm.mission.objectives.get('find-ruins').visible) throw new Error('ruínas ocultas até o 1º batedor'); c.gm.transferUnit(c.tagged('scout')[0], 0); c.gm.mission.vars.freed = 1; } },
      { name: 'ruinas', wait: 1, run: (c) => { if (!c.gm.mission.objectives.get('find-ruins').visible) throw new Error('ruínas devem aparecer'); const p = c.anchor('ruins1'); c.teleport(c.mine('grunt')[1] || c.mine('axethrower')[0], p.x, p.z); } },
      { name: 'achou', wait: 1, run: (c) => { if (c.status('find-ruins') !== 'completed') throw new Error('ruínas devem estar achadas'); } }
    ], { maxSeconds: 30 });
    expect(run.gm.mission.landmarks.find((l) => l.tag === 'ruins').lit).toBeGreaterThan(0);
  }, 60000);
});
