import { describe, it, expect, afterEach } from 'vitest';
import { GameManager } from '../../src/core/GameManager.js';
import { Terrain } from '../../src/world/Terrain.js';
import { createMatchConfig, validateMatchConfig } from '../../src/sim/MatchConfig.js';
import { getMap } from '../../src/data/maps/index.js';
import { createMissionConfig } from '../../src/data/missions/index.js';
import { getCampaign } from '../../src/data/campaigns/index.js';
import { SIM_DT } from '../../src/sim/constants.js';
import { CMD } from '../../src/sim/commands.js';
import { EVT } from '../../src/sim/events.js';
import { stateChecksum } from '../../src/sim/checksum.js';
import { missingRequirements, missingUnitRequirements, missingUpgradeRequirements, formatRequirement } from '../../src/sim/requirements.js';
import { validateTechRestriction, techLock, researchToken } from '../../src/sim/techRestriction.js';
import {
  validateCampaign, availableTech, missionUnlocks, unlockMissionOf, techRestrictionFor, hasTechProgression,
  createCampaignMissionConfig, CampaignProgress, memoryStorage
} from '../../src/campaign/index.js';
import { requirementsLine, requirementText, localizeSimText } from '../../src/ui/uiText.js';
import { unlockNames, unlockSummary, unlockAnnouncement } from '../../src/ui/techText.js';
import { setLanguage } from '../../src/i18n/index.js';
import { validateMission } from '../../src/sim/missions/schema.js';
import { baseMission, makeMissionGm, runTicks, recordEvents, statusOf } from './helpers/missionWorld.js';

/**
 * F8-05b — liberação progressiva da campanha: `availableTech` (pura, cumulativa), validação de `unlocks`, `techRestriction` da
 * `MatchConfig` e sua aplicação (TRAIN / PLACE_BUILDING / RESEARCH recusados sem efeito colateral), partidas sem restrição idênticas ao
 * master (checksums fixados) e textos "Novo: …" / "Disponível na missão N".
 */
const alliance = getCampaign('alliance');
const BASE = { format: 'warpolycampaign', version: 1, id: 'x', factionId: 'human', title: 'x', premise: 'p' };
const camp = (...unlocks) => ({ ...BASE, missions: unlocks.map((u, i) => ({ id: `m${i + 1}`, ...(i ? { requires: [`m${i}`] } : {}), ...(u ? { unlocks: u } : {}) })) });

describe('availableTech: união cumulativa dos unlocks (função pura)', () => {
  const c = camp({ units: ['knight'], buildings: ['barracks'] }, { units: ['archer'], research: ['melee_weapons'] }, null, { units: ['cavalier'], research: ['melee_weapons@2'], heroes: ['hero_brann'] });

  it('missão N = união das missões 1..N (índice 0-based ou id)', () => {
    const a0 = availableTech(c, 0);
    expect([...a0.units]).toEqual(['knight']);
    expect([...a0.buildings]).toEqual(['barracks']);
    expect(a0.research.size).toBe(0);
    const a1 = availableTech(c, 'm2');
    expect([...a1.units].sort()).toEqual(['archer', 'knight']);
    expect([...a1.research]).toEqual(['melee_weapons']);
    expect(availableTech(c, 2).units.size).toBe(2); // m3 não libera nada: o conjunto se mantém
    const a3 = availableTech(c, 3);
    expect([...a3.units].sort()).toEqual(['archer', 'cavalier', 'knight']);
    expect([...a3.research].sort()).toEqual(['melee_weapons', 'melee_weapons@2']);
    expect([...a3.heroes]).toEqual(['hero_brann']);
    expect(availableTech(c, 'nao-existe').units.size).toBe(0);
  });

  it('cada conjunto contém o anterior (cumulatividade) na campanha do Reino', () => {
    const n = alliance.missions.length;
    let prev = availableTech(alliance, 0);
    expect(prev.units.size).toBeGreaterThan(0);
    for (let i = 1; i < n; i++) {
      const cur = availableTech(alliance, i);
      for (const kind of ['units', 'buildings', 'research', 'heroes']) {
        for (const id of prev[kind]) expect(cur[kind].has(id), `${kind}:${id} some na missão ${i + 1}`).toBe(true);
        const novos = missionUnlocks(alliance, i)[kind];
        for (const id of novos) { expect(prev[kind].has(id), `${id} liberado duas vezes`).toBe(false); expect(cur[kind].has(id)).toBe(true); }
        expect(cur[kind].size).toBe(prev[kind].size + novos.length);
      }
      prev = cur;
    }
  });

  it('unlockMissionOf devolve a missão (1-based) que libera cada item', () => {
    expect(unlockMissionOf(alliance, 'units', 'knight')).toBe(1);
    expect(unlockMissionOf(alliance, 'buildings', 'stable')).toBe(4);
    expect(unlockMissionOf(alliance, 'units', 'frigate')).toBe(6);
    expect(unlockMissionOf(alliance, 'research', 'melee_weapons@2')).toBe(7);
    expect(unlockMissionOf(alliance, 'units', 'grunt')).toBeNull();
  });
});

describe('validateCampaign: bloco unlocks (tipos existentes em src/data, sem typo)', () => {
  const errs = (...u) => validateCampaign(camp(...u)).errors.join('|');

  it('a campanha do Reino é válida e todo item de unlocks existe em src/data', () => {
    expect(validateCampaign(alliance).ok).toBe(true);
  });
  it('rejeita typo, tipo na categoria errada, item não treinável, de outra facção e repetido', () => {
    expect(errs({ units: ['kinght'] })).toMatch(/unidade desconhecida/);
    expect(errs({ buildings: ['knight'] })).toMatch(/construção desconhecida/);
    expect(errs({ units: ['hero_brann'] })).toMatch(/herói/);
    expect(errs({ heroes: ['knight'] })).toMatch(/herói desconhecido/);
    expect(errs({ units: ['skeleton'] })).toMatch(/não é treinável/);
    expect(errs({ units: ['grunt'] })).toMatch(/facção/);
    expect(errs({ heroes: ['hero_drogath'] })).toMatch(/facção|campanha/);
    expect(errs({ research: ['spell_haste'] })).toMatch(/facção/);
    expect(errs({ research: ['melee_wepons'] })).toMatch(/pesquisa desconhecida/);
    expect(errs({ research: ['melee_weapons@3'] })).toMatch(/nível/);
    expect(errs({ research: ['woodcutting@2'] })).toMatch(/nível/);
    expect(errs({ units: ['knight'] }, { units: ['knight'] })).toMatch(/já foi liberado/);
    expect(errs({ foo: ['x'] })).toMatch(/campo desconhecido/);
    expect(errs({ units: 'knight' })).toMatch(/deve ser lista/);
  });
  it('o nível 2 exige o nível 1 liberado antes ou junto', () => {
    expect(errs({ research: ['melee_weapons@2'] })).toMatch(/nível anterior/);
    expect(errs({ research: ['melee_weapons', 'melee_weapons@2'] })).toBe('');
    expect(errs({ research: ['melee_weapons'] }, { research: ['melee_weapons@2'] })).toBe('');
  });
  it('petroleiro, barcaça e plataforma (facção neutra) são aceitos', () => {
    expect(errs({ units: ['tanker', 'barge'], buildings: ['oil_platform'] })).toBe('');
  });
});

describe('techRestrictionFor / MatchConfig.techRestriction', () => {
  it('sem progressão na campanha: nenhuma restrição', () => {
    expect(hasTechProgression(camp(null, null))).toBe(false);
    expect(techRestrictionFor(camp(null, null), 1)).toBeNull();
  });

  it('missão N: disponível = cumulativo; later = missão que libera o resto; unlocks = novidades', () => {
    const t = techRestrictionFor(alliance, 'alliance-02-cativos-da-garganta');
    expect(t.players).toEqual([0]);
    expect(t.mission).toBe(2);
    expect(t.units.sort()).toEqual(['archer', 'knight', 'villager']);
    expect(t.buildings).toContain('forge');
    expect(t.buildings).not.toContain('stable');
    expect(t.research.sort()).toEqual(['melee_weapons', 'ranged_ammo']);
    expect(t.later.buildings.stable).toBe(4);
    expect(t.later.units.frigate).toBe(6);
    expect(t.later.research['melee_weapons@2']).toBe(7);
    expect(t.unlocks.buildings).toEqual(['forge']);
    expect(validateTechRestriction(t).ok).toBe(true);
  });

  it('a config de missão da campanha leva techRestriction; techAll e missões isoladas, não', () => {
    const progress = new CampaignProgress(memoryStorage());
    const id = alliance.missions[3].id;
    const cfg = createCampaignMissionConfig('alliance', id, { progress, unlockAll: true });
    expect(cfg.techRestriction.mission).toBe(4);
    expect(cfg.techRestriction.players).toEqual([0]); // só o jogador local: a IA inimiga/aliada não é restringida
    expect(() => validateMatchConfig(cfg)).not.toThrow();
    expect(createCampaignMissionConfig('alliance', id, { progress, unlockAll: true, techAll: true }).techRestriction).toBeUndefined();
    expect(createMissionConfig(id).techRestriction).toBeUndefined(); // menu "Missões" / escaramuça: sem restrição
  });

  it('validateMatchConfig recusa item inexistente e jogador inexistente', () => {
    const cfg = createMatchConfig({ seed: 1, headless: true });
    const ok = { players: [0], units: ['knight'], buildings: [], research: [], heroes: [] };
    expect(() => validateMatchConfig({ ...cfg, techRestriction: ok })).not.toThrow();
    expect(() => validateMatchConfig({ ...cfg, techRestriction: { ...ok, units: ['kinght'] } })).toThrow(/techRestriction/);
    expect(() => validateMatchConfig({ ...cfg, techRestriction: { ...ok, players: [7] } })).toThrow(/jogador 7/);
    expect(() => validateMatchConfig({ ...cfg, techRestriction: { ...ok, research: ['melee_weapons@5'] } })).toThrow(/techRestriction/);
  });
});

function makeGm(techRestriction, { resources = { gold: 9000, wood: 9000, stone: 9000 }, seed = 21 } = {}) {
  const cfg = createMatchConfig({ seed, headless: true });
  if (techRestriction) cfg.techRestriction = techRestriction;
  cfg.startingResources = resources;
  const gm = new GameManager(new Terrain(getMap(cfg.mapId)), null, null, cfg);
  gm.aiDirectors.forEach((d) => d.dispose?.());
  gm.aiDirectors = [];
  gm.aiDirector = null;
  return gm;
}
const tick = (gm, n = 2) => { for (let i = 0; i < n; i++) gm.simStep(SIM_DT); };
const hq = (gm) => gm.buildings.find((b) => b.ownerId === 0 && b.type === 'castle');
function add(gm, type, dx, dz, tier = 1) {
  const p = hq(gm).mesh.position;
  const b = gm.createBuilding(type, p.x + dx, p.z + dz, true, 0);
  gm.buildings.push(b);
  if (tier > 1) hq(gm).tier = tier;
  return b;
}
const money = (gm) => ({ ...gm.getPlayer(0).resources });
const notices = (gm) => { const log = []; gm.events.on(EVT.NOTIFY, (p) => log.push(p.text)); return log; };

describe('recusa de TRAIN / PLACE_BUILDING / RESEARCH fora do liberado (sem efeito colateral)', () => {
  const tech = (over = {}) => ({
    players: [0], units: ['villager', 'knight', 'archer'], buildings: ['cottage', 'lumber_camp', 'farm', 'barracks'], research: [], heroes: [],
    later: { units: { cavalier: 4 }, buildings: { forge: 2, stable: 4 }, research: { melee_weapons: 2, 'melee_weapons@2': 7 }, heroes: {} }, ...over
  });

  it('TRAIN: unidade liberada entra na fila; a fora do liberado é ignorada sem debitar', () => {
    const gm = makeGm(tech());
    const barracks = add(gm, 'barracks', 14, 6);
    const stable = add(gm, 'stable', -14, 6, 2);
    const before = money(gm);
    gm.issue({ type: CMD.TRAIN, playerId: 0, buildingId: stable.id, unitType: 'cavalier' });
    tick(gm);
    expect(stable.queue.length).toBe(0);
    expect(money(gm)).toEqual(before);
    gm.issue({ type: CMD.TRAIN, playerId: 0, buildingId: barracks.id, unitType: 'knight' });
    tick(gm);
    expect(barracks.queue.length).toBe(1);
    expect(money(gm).gold).toBeLessThan(before.gold);
  });

  it('o mesmo TRAIN passa quando o tipo entra na lista (e sem restrição)', () => {
    for (const t of [tech({ units: ['villager', 'knight', 'archer', 'cavalier'], buildings: ['barracks', 'stable'] }), null]) {
      const gm = makeGm(t);
      const stable = add(gm, 'stable', -14, 6, 2);
      gm.issue({ type: CMD.TRAIN, playerId: 0, buildingId: stable.id, unitType: 'cavalier' });
      tick(gm);
      expect(stable.queue.length).toBe(1);
    }
  });

  it('PLACE_BUILDING: a construção fora do liberado é ignorada e avisa "Disponível na missão N"', () => {
    const gm = makeGm(tech());
    const log = notices(gm);
    const n0 = gm.buildings.length;
    const before = money(gm);
    const worker = gm.getUnitsOf(0).find((u) => u.type === 'villager');
    const p = hq(gm).mesh.position;
    gm.issue({ type: CMD.PLACE_BUILDING, playerId: 0, buildingType: 'forge', x: p.x + 16, z: p.z + 14, unitIds: [worker.id] });
    tick(gm);
    expect(gm.buildings.length).toBe(n0);
    expect(money(gm)).toEqual(before);
    expect(log).toContain('⚠️ Disponível na missão 2');
    expect(localizeSimText('⚠️ Disponível na missão 2')).toBe('⚠️ Disponível na missão 2'); // pt-BR (idioma do ambiente de testes)
    gm.issue({ type: CMD.PLACE_BUILDING, playerId: 0, buildingType: 'cottage', x: p.x + 16, z: p.z + 14, unitIds: [worker.id] });
    tick(gm);
    expect(gm.buildings.length).toBe(n0 + 1);
    expect(money(gm).wood).toBeLessThan(before.wood);
  });

  it('PLACE_WALL também respeita a lista de construções', () => {
    const gm = makeGm(tech());
    const p = hq(gm).mesh.position;
    const worker = gm.getUnitsOf(0).find((u) => u.type === 'villager');
    const n0 = gm.buildings.length;
    gm.issue({ type: CMD.PLACE_WALL, playerId: 0, buildingType: 'wall_human', points: [{ x: p.x + 20, z: p.z + 20 }, { x: p.x + 22.4, z: p.z + 20 }], unitIds: [worker.id] });
    tick(gm);
    expect(gm.buildings.length).toBe(n0);
  });

  it('RESEARCH: pesquisa fora do liberado é ignorada sem debitar; liberada (nível 1) passa; nível 2 pede a ficha "@2"', () => {
    const forgeCfg = { buildings: ['barracks', 'forge'] };
    const gm = makeGm(tech(forgeCfg));
    const forge = add(gm, 'forge', 14, -8, 2);
    const before = money(gm);
    gm.issue({ type: CMD.RESEARCH, playerId: 0, buildingId: forge.id, upgradeId: 'melee_weapons' });
    tick(gm);
    expect(forge.currentResearch).toBeNull();
    expect(money(gm)).toEqual(before);

    const gm2 = makeGm(tech({ ...forgeCfg, research: ['melee_weapons'] }));
    const forge2 = add(gm2, 'forge', 14, -8, 2);
    gm2.issue({ type: CMD.RESEARCH, playerId: 0, buildingId: forge2.id, upgradeId: 'melee_weapons' });
    tick(gm2);
    expect(forge2.currentResearch && forge2.currentResearch.id).toBe('melee_weapons');
    // nível 2: só com "melee_weapons@2"
    gm2.getPlayer(0).setResearchLevel('melee_weapons', 1);
    forge2.currentResearch = null;
    const m = missingUpgradeRequirements(0, 'melee_weapons', gm2);
    expect(m[0]).toMatchObject({ locked: true, kind: 'research', id: 'melee_weapons@2', mission: 7 });
  });

  it('a promoção (Patrulheiro no lugar do Arqueiro) vale pela base liberada; a pesquisa é que é travada', () => {
    const gm = makeGm(tech());
    expect(techLock(gm, 0, 'units', 'ranger')).toBeNull(); // modelOf: archer (liberado)
    expect(techLock(gm, 0, 'units', 'cavalier')).toMatchObject({ locked: true, mission: 4 });
    expect(missingUpgradeRequirements(0, 'ranged_class', gm)[0]).toMatchObject({ locked: true });
  });

  it('só os jogadores de `players` são restringidos (a IA/aliados seguem livres)', () => {
    const gm = makeGm(tech());
    expect(missingUnitRequirements(0, 'cavalier', gm).some((r) => r.locked)).toBe(true);
    expect(missingUnitRequirements(1, 'ogre', gm).some((r) => r.locked)).toBe(false);
    expect(missingUnitRequirements(1, 'cavalier', gm).some((r) => r.locked)).toBe(false);
    expect(missingRequirements(1, 'forge', gm).some((r) => r.locked)).toBe(false);
  });

  it('item que a campanha nunca libera: "Indisponível nesta campanha"', () => {
    const gm = makeGm(tech());
    const lock = techLock(gm, 0, 'buildings', 'orc_barracks');
    expect(lock).toMatchObject({ locked: true, mission: null });
    expect(formatRequirement(lock)).toBe('Indisponível nesta campanha');
  });
});

describe('sem restrição = comportamento e checksum do master', () => {
  const run = (cfg, ticks) => {
    cfg.headless = true;
    const gm = new GameManager(new Terrain(getMap(cfg.mapId)), null, null, cfg);
    for (let i = 0; i < ticks; i++) gm.simStep(SIM_DT);
    return stateChecksum(gm);
  };

  it('os requisitos não ganham nenhuma entrada sem techRestriction', () => {
    const gm = makeGm(null);
    expect(missingUnitRequirements(0, 'cavalier', gm).some((r) => r.locked)).toBe(false);
    expect(missingRequirements(0, 'forge', gm)).toEqual([]);
    expect(missingUpgradeRequirements(0, 'melee_weapons', gm)).toEqual([]);
  });

  it('checksums idênticos aos do master (valores medidos antes desta mudança): escaramuça IA×IA, FFA e missão isolada', () => {
    const skirmish = createMatchConfig({ seed: 11, headless: true });
    skirmish.players.forEach((p) => { p.isAI = true; });
    expect(run(skirmish, 1500)).toBe(2385247165);
    expect(run(createMissionConfig('mission-demo'), 1200)).toBe(2809377963);
    expect(run(createMatchConfig({ seed: 5, ffa: true, headless: true, mapId: 'ilhas-4p' }), 1000)).toBe(1953366667);
  }, 60000);

  it('techRestriction presente entra no checksum de forma estável; ausente/`undefined` não muda nada', () => {
    const mk = (tr) => { const c = createMatchConfig({ seed: 7, headless: true }); if (tr !== undefined) c.techRestriction = tr; return c; };
    const tr = { players: [0], units: ['knight'], buildings: ['barracks'], research: [], heroes: [] };
    const none = run(mk(undefined), 200);
    expect(run(mk(undefined), 200)).toBe(none);
    const withTr = run(mk(tr), 200);
    expect(run(mk(tr), 200)).toBe(withTr); // determinístico
    expect(withTr).not.toBe(none);
    expect(run(mk({ ...tr, units: ['knight', 'archer'] }), 200)).not.toBe(withTr);
    expect(run(mk({ ...tr, units: ['archer', 'knight'].reverse() }), 200)).toBe(run(mk({ ...tr, units: ['knight', 'archer'] }), 200)); // ordem da lista não importa
  });
});

describe('textos: "Novo: …" (briefing/anúncio) e "Disponível na missão N", pt-BR e en', () => {
  afterEach(() => setLanguage('pt-BR'));

  it('lista os nomes localizados das liberações da missão', () => {
    const u = missionUnlocks(alliance, 4);
    expect(Object.keys(unlockNames(u))).toEqual(['units', 'buildings', 'research', 'heroes']);
    setLanguage('pt-BR');
    const pt = unlockAnnouncement(u);
    expect(pt.startsWith('Novo: ')).toBe(true);
    expect(pt).toContain('Unidades:');
    expect(pt).toContain('Oficina');
    setLanguage('en');
    const en = unlockAnnouncement(u);
    expect(en.startsWith('New: ')).toBe(true);
    expect(en).toContain('Units:');
    expect(en).toContain('Workshop');
    expect(en).not.toBe(pt);
    expect(unlockSummary({ units: [], buildings: [] })).toBe('');
    expect(unlockAnnouncement({})).toBe('');
  });

  it('nível 2 aparece como "(nível 2)" e a dica da HUD usa a missão que libera', () => {
    setLanguage('pt-BR');
    expect(unlockSummary({ research: ['melee_weapons@2'] })).toMatch(/\(nível 2\)/);
    const lock = { locked: true, kind: 'units', id: 'cavalier', mission: 4 };
    expect(requirementText(lock)).toBe('Disponível na missão 4');
    expect(requirementsLine(['barracks', lock])).toBe('Disponível na missão 4'); // o bloqueio da campanha vale mais que "Requer: …"
    setLanguage('en');
    expect(requirementText(lock)).toBe('Available in mission 4');
    expect(localizeSimText('⚠️ Disponível na missão 4')).toBe('⚠️ Available in mission 4');
    expect(requirementText({ locked: true, mission: null })).toBe('Not available in this campaign');
  });

  it('researchToken: nível 1 = id, nível 2 = id@2', () => {
    expect(researchToken('melee_weapons')).toBe('melee_weapons');
    expect(researchToken('melee_weapons', 2)).toBe('melee_weapons@2');
  });
});

describe('missões: ação `setTier` e condição `research` (F8-05b)', () => {
  const mission = (over = {}) => baseMission({
    setup: [{ type: 'setTier', owner: 'player', tier: 3 }],
    objectives: [
      { id: 'o1', type: 'survive', priority: 'primary', seconds: 600, title: 'Sobreviver' },
      { id: 'r1', type: 'flag', priority: 'secondary', condition: { type: 'research', owner: 'player', id: 'melee_weapons' }, title: 'Pesquisar' },
      { id: 'r2', type: 'flag', priority: 'hidden', condition: { type: 'research', owner: 'player', id: 'melee_weapons', level: 2 }, title: 'Pesquisar 2' }
    ],
    ...over
  });

  it('setTier eleva o Centro concluído do dono (PV do nível) e só o dono pedido', () => {
    const gm = makeMissionGm(mission());
    runTicks(gm, 2);
    const castle = gm.buildings.find((b) => b.ownerId === 0 && b.type === 'castle');
    expect(castle.tier).toBe(3);
    expect(castle.maxHp).toBe(2800);
    expect(castle.hp).toBe(2800);
    expect(gm.buildings.find((b) => b.ownerId === 1 && b.type === 'great_hall').tier).toBe(1);
  });

  it('setTier em gatilho emite HQ_TIER_CHANGED e nunca rebaixa; o schema recusa nível fora de 2..3', () => {
    const def = mission({
      setup: [],
      triggers: [
        { id: 'up', when: { type: 'time', at: 0 }, actions: [{ type: 'setTier', tier: 2 }] },
        { id: 'again', when: { type: 'trigger', id: 'up' }, actions: [{ type: 'setTier', tier: 2 }] }
      ]
    });
    const gm = makeMissionGm(def);
    const events = recordEvents(gm, [EVT.HQ_TIER_CHANGED]);
    runTicks(gm, 3);
    expect(events.map((e) => e.tier)).toEqual([2]);
    expect(validateMission(mission({ setup: [{ type: 'setTier', tier: 1 }] })).ok).toBe(false);
    expect(validateMission(mission({ setup: [{ type: 'setTier', tier: 4 }] })).ok).toBe(false);
    expect(validateMission(mission({ setup: [{ type: 'setTier', owner: 'xx', tier: 2 }] })).ok).toBe(false);
    expect(validateMission(mission()).ok).toBe(true);
  });

  it('a condição research conclui o objetivo quando a pesquisa (e o nível) termina', () => {
    const gm = makeMissionGm(mission());
    runTicks(gm, 3);
    expect(statusOf(gm, 'r1')).not.toBe('completed');
    gm.getPlayer(0).setResearchLevel('melee_weapons', 1);
    runTicks(gm, 3);
    expect(statusOf(gm, 'r1')).toBe('completed');
    expect(statusOf(gm, 'r2')).not.toBe('completed');
    gm.getPlayer(0).setResearchLevel('melee_weapons', 2);
    runTicks(gm, 3);
    expect(statusOf(gm, 'r2')).toBe('completed');
  });

  it('o schema recusa pesquisa desconhecida ou nível inexistente na condição research', () => {
    const ok = (cond) => validateMission(mission({ objectives: [{ id: 'o1', type: 'survive', seconds: 5, title: 'x' }, { id: 'f', type: 'flag', priority: 'secondary', condition: cond, title: 'f' }] })).ok;
    expect(ok({ type: 'research', id: 'melee_wepons' })).toBe(false);
    expect(ok({ type: 'research', id: 'woodcutting', level: 2 })).toBe(false);
    expect(ok({ type: 'research', id: 'woodcutting' })).toBe(true);
  });
});
