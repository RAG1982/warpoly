import { describe, it, expect, beforeEach } from 'vitest';
import { listCampaigns, getCampaign } from '../../src/data/campaigns/index.js';
import { getMission, listMissions } from '../../src/data/missions/index.js';
import { getMap } from '../../src/data/maps/index.js';
import { validateMission } from '../../src/sim/missions/schema.js';
import { validateMatchConfig } from '../../src/sim/MatchConfig.js';
import { getHeightForMap } from '../../src/world/terrainGenerators.js';
import { UNITS } from '../../src/data/units.js';
import { NAVAL_MIN_DEPTH } from '../../src/data/combat.js';
import { BUILDINGS } from '../../src/data/buildings.js';
import { RESEARCH } from '../../src/data/upgrades.js';
import { researchToken, parseResearchToken } from '../../src/sim/techRestriction.js';
import {
  availableTech, missionUnlocks, unlockMissionOf,
  validateCampaign, isUnlocked, missionStatus, nextMission, isCampaignComplete, startingResourcesFor,
  CampaignProgress, memoryStorage, PROGRESS_KEY, createCampaignMissionConfig, setActiveRun, onMissionEnded
} from '../../src/campaign/index.js';
import ptBR from '../../src/i18n/pt-BR.json';
import en from '../../src/i18n/en.json';

const alliance = getCampaign('alliance');
const ids = alliance.missions.map((m) => m.id);

describe('campanha da Aliança: dados (F8-05)', () => {
  it('está registrada, válida e tem 8 ou mais missões, todas escondidas do menu "Missões"', () => {
    expect(listCampaigns().map((c) => c.id)).toContain('alliance');
    expect(validateCampaign(alliance, { hasMission: (id) => !!getMission(id) })).toEqual({ ok: true, errors: [] });
    expect(ids.length).toBeGreaterThanOrEqual(8);
    expect(new Set(ids).size).toBe(ids.length);
    const visible = listMissions().map((m) => m.id);
    for (const id of ids) expect(visible).not.toContain(id);
  });

  it('a premissa é marcada como provisória, nos dois idiomas', () => {
    expect(alliance.provisional).toBe(true);
    expect(alliance.premise['pt-BR'].length).toBeGreaterThan(80);
    expect(alliance.premise.en.length).toBeGreaterThan(80);
  });

  it.each(ids)('%s passa pelo validador F8-04, tem briefing, textos em pt-BR/en e config válida', (id) => {
    const m = getMission(id);
    expect(validateMission(m)).toEqual({ ok: true, errors: [] });
    expect(m.briefing.text['pt-BR']).toBeTruthy();
    expect(m.briefing.text.en).toBeTruthy();
    const primary = m.objectives.filter((o) => (o.priority ?? 'primary') === 'primary');
    expect(primary.length).toBeGreaterThanOrEqual(1);
    expect(m.objectives.some((o) => o.priority === 'secondary')).toBe(true);
    expect(m.objectives.some((o) => o.priority === 'hidden')).toBe(true);
    expect(m.triggers.some((t) => t.actions.some((a) => a.type === 'cutscene'))).toBe(true);
    expect(m.triggers.some((t) => t.actions.some((a) => a.type === 'dialog'))).toBe(true);
    const cfg = createCampaignMissionConfig('alliance', id, { progress: new CampaignProgress(memoryStorage()), unlockAll: true });
    expect(() => validateMatchConfig(cfg)).not.toThrow();
    expect(cfg.victoryMode).toBe('mission');
    expect(cfg.players.find((p) => p.isLocal).factionId).toBe('human');
  });

  it('textos bilíngues em todo o JSON (todo objeto de texto com pt-BR tem en) e sem nomes proibidos', () => {
    const banned = /(thrall|orgrim|durotan|uther|arthas|jaina|lothar|khadgar|gul'?dan|blackhand|grom|medivh|turalyon|azeroth|stormwind|warcraft|blizzard)/i;
    const walk = (v, path, file) => {
      if (path.endsWith('.unlocks')) return; // F8-05b: ids de src/data (ex.: spell_blizzard), não texto do jogo
      if (Array.isArray(v)) return v.forEach((x, i) => walk(x, `${path}[${i}]`, file));
      if (v && typeof v === 'object') {
        if ('pt-BR' in v) expect(typeof v.en, `${file} ${path} sem en`).toBe('string');
        return Object.entries(v).forEach(([k, x]) => walk(x, `${path}.${k}`, file));
      }
      if (typeof v === 'string') expect(banned.test(v), `${file} ${path}: ${v}`).toBe(false);
    };
    walk(alliance, 'campaign', 'campaign');
    for (const id of ids) walk(getMission(id), id, id);
  });

  it('spawns, áreas e ordens ficam em terra firme dentro da área jogável do mapa (navios: na água navegável)', () => {
    const isNaval = (a) => {
      const list = a.units ?? (a.unitType ? [{ type: a.unitType }] : null);
      return a.type === 'spawn' && !!list && list.length > 0 && list.every((u) => UNITS[u.type] && UNITS[u.type].layer === 'naval');
    };
    for (const id of ids) {
      const m = getMission(id);
      const map = getMap(m.mapId);
      const half = (map.playable ?? map.size) / 2;
      const land = [];
      const sea = []; // F8-05b: spawn só de navios
      const anywhere = []; // F8-05b: `reveal` (névoa) pode mirar o mar
      const walk = (v, key) => {
        if (Array.isArray(v)) return v.forEach((x) => walk(x, key));
        if (!v || typeof v !== 'object') return;
        if (key !== 'steps' && typeof v.x === 'number' && typeof v.z === 'number') (isNaval(v) ? sea : v.type === 'reveal' ? anywhere : land).push([v.x, v.z]);
        for (const [k, x] of Object.entries(v)) walk(x, k);
      };
      walk(m.setup, 'setup');
      walk(m.objectives, 'objectives');
      walk(m.triggers.filter((t) => !t.actions.some((a) => a.type === 'cutscene')), 'triggers');
      expect(land.length).toBeGreaterThan(0);
      const out = ([x, z]) => Math.abs(x) >= half || Math.abs(z) >= half;
      expect(land.filter(([x, z]) => out([x, z]) || getHeightForMap(map, x, z) < 1.8), `${id}: pontos fora da terra firme`).toEqual([]);
      expect(sea.filter(([x, z]) => out([x, z]) || getHeightForMap(map, x, z) > map.waterLevel - NAVAL_MIN_DEPTH), `${id}: navios fora da água navegável`).toEqual([]);
      expect(anywhere.filter(out), `${id}: reveal fora da área jogável`).toEqual([]);
    }
  });

  it('usa mais de um mapa e as missões variam em tipos de objetivo (dificuldade e variedade)', () => {
    const maps = new Set(ids.map((id) => getMission(id).mapId));
    expect(maps.size).toBeGreaterThanOrEqual(7);
    const types = new Set();
    for (const id of ids) for (const o of getMission(id).objectives) types.add(o.type);
    for (const ty of ['build', 'destroy', 'rescue', 'escort', 'survive', 'collect', 'flag']) expect(types.has(ty), ty).toBe(true);
    // dificuldade crescente: a quantidade de jogadores/IA não diminui no fim; última missão tem 4 jogadores com IA
    const last = getMission(ids[ids.length - 1]);
    expect(last.players.filter((p) => p.isAI).length).toBeGreaterThanOrEqual(2);
  });
});

describe('campanha: ordem, desbloqueio e carry-over (F8-05)', () => {
  it('só a 1ª missão começa disponível; concluir libera a próxima', () => {
    const done = {};
    expect(nextMission(alliance, done)).toBe(ids[0]);
    expect(missionStatus(alliance, ids[0], done)).toBe('available');
    for (let i = 1; i < ids.length; i++) expect(missionStatus(alliance, ids[i], done)).toBe('locked');
    for (let i = 0; i < ids.length; i++) {
      expect(nextMission(alliance, done)).toBe(ids[i]);
      done[ids[i]] = { seconds: 60 + i, resources: { gold: 0, wood: 0, stone: 0 } };
      expect(missionStatus(alliance, ids[i], done)).toBe('completed');
      if (i + 1 < ids.length) expect(isUnlocked(alliance, ids[i + 1], done)).toBe(true);
      if (i + 2 < ids.length) expect(isUnlocked(alliance, ids[i + 2], done)).toBe(false);
    }
    expect(isCampaignComplete(alliance, done)).toBe(true);
    expect(nextMission(alliance, done)).toBe(null);
  });

  it('unlockAll libera tudo (depuração) e config de missão bloqueada lança', () => {
    expect(isUnlocked(alliance, ids[5], {}, { unlockAll: true })).toBe(true);
    const progress = new CampaignProgress(memoryStorage());
    expect(() => createCampaignMissionConfig('alliance', ids[3], { progress })).toThrow(/bloqueada/);
    expect(() => createCampaignMissionConfig('alliance', 'mission-demo', { progress })).toThrow(/não pertence/);
  });

  it('validador do índice rejeita ciclos, requires futuros e missões repetidas', () => {
    const base = { format: 'warpolycampaign', version: 1, id: 'x', factionId: 'human', title: 'x', premise: 'p' };
    expect(validateCampaign({ ...base, missions: [{ id: 'a', requires: ['b'] }, { id: 'b' }] }).ok).toBe(false);
    expect(validateCampaign({ ...base, missions: [{ id: 'a' }, { id: 'a' }] }).ok).toBe(false);
    expect(validateCampaign({ ...base, missions: [{ id: 'a' }, { id: 'b', requires: ['a'], carryOver: { resources: { gold: 2 } } }] }).ok).toBe(false);
    expect(validateCampaign({ ...base, missions: [{ id: 'a' }, { id: 'b', requires: ['a'] }] }).ok).toBe(true);
    expect(validateCampaign({ ...base, missions: [{ id: 'zz' }] }, { hasMission: () => false }).ok).toBe(false);
  });

  it('carry-over: fração do saldo final da missão anterior, com teto, somada aos recursos da missão', () => {
    const mission = getMission(ids[1]);
    const entry = alliance.missions[1];
    expect(startingResourcesFor(mission, entry, {})).toEqual({ gold: 350, wood: 400, stone: 150 });
    const done = { [ids[0]]: { resources: { gold: 1000, wood: 80, stone: 0 } } };
    // ouro: 25% de 1000 = 250 (teto 300); madeira: 20; pedra: 0
    expect(startingResourcesFor(mission, entry, done)).toEqual({ gold: 600, wood: 420, stone: 150 });
    done[ids[0]].resources.gold = 100000; // teto de 300
    expect(startingResourcesFor(mission, entry, done).gold).toBe(650);
  });

  it('a config da missão seguinte recebe o carry-over da tentativa atual', () => {
    const progress = new CampaignProgress(memoryStorage());
    progress.recordVictory('alliance', ids[0], { seconds: 100, resources: { gold: 400, wood: 40, stone: 8 } });
    const cfg = createCampaignMissionConfig('alliance', ids[1], { progress });
    expect(cfg.startingResources).toEqual({ gold: 350 + 100, wood: 400 + 10, stone: 150 + 2 });
  });
});

describe('campanha: progresso salvo por tentativa (F8-05)', () => {
  let store;
  let progress;
  beforeEach(() => { store = memoryStorage(); progress = new CampaignProgress(store, { now: () => 1234 }); });

  it('grava vitórias, mantém o melhor tempo e persiste no armazenamento', () => {
    progress.recordVictory('alliance', ids[0], { seconds: 200, resources: { gold: 5, wood: 6, stone: 7 } });
    progress.recordVictory('alliance', ids[0], { seconds: 300 });
    expect(progress.completed('alliance')[ids[0]].seconds).toBe(200);
    progress.recordVictory('alliance', ids[0], { seconds: 150, resources: { gold: 1, wood: 1, stone: 1 } });
    expect(progress.completed('alliance')[ids[0]]).toMatchObject({ seconds: 150, resources: { gold: 1, wood: 1, stone: 1 } });
    const again = new CampaignProgress(store);
    expect(again.completed('alliance')[ids[0]].seconds).toBe(150);
    expect(again.status(alliance, ids[1])).toBe('available');
    expect(JSON.parse(store.getItem(PROGRESS_KEY)).version).toBe(1);
  });

  it('nova tentativa zera o desbloqueio mas guarda a anterior', () => {
    progress.recordVictory('alliance', ids[0], { seconds: 90 });
    expect(progress.attemptNumber('alliance')).toBe(1);
    expect(progress.newAttempt('alliance')).toBe(2);
    expect(progress.status(alliance, ids[1])).toBe('locked');
    expect(progress.attemptCount('alliance')).toBe(2);
    expect(progress.selectAttempt('alliance', 1)).toBe(true);
    expect(progress.status(alliance, ids[1])).toBe('available');
    expect(progress.selectAttempt('alliance', 9)).toBe(false);
  });

  it('dados corrompidos ou armazenamento indisponível não lançam', () => {
    store.setItem(PROGRESS_KEY, '{nao-e-json');
    expect(new CampaignProgress(store).attemptNumber('alliance')).toBe(1);
    const broken = { getItem() { throw new Error('x'); }, setItem() { throw new Error('y'); } };
    const p = new CampaignProgress(broken);
    expect(() => p.recordVictory('alliance', ids[0], { seconds: 1 })).not.toThrow();
    expect(p.completed('alliance')[ids[0]]).toBeTruthy();
  });

  it('gancho de fim de missão só grava vitória da missão de campanha ativa', () => {
    setActiveRun({ campaignId: 'alliance', missionId: ids[0] });
    expect(onMissionEnded({ missionId: ids[0], outcome: 'defeat', seconds: 10 }, progress)).toBe(false);
    expect(onMissionEnded({ missionId: ids[1], outcome: 'victory', seconds: 10 }, progress)).toBe(false);
    expect(onMissionEnded({ missionId: ids[0], outcome: 'victory', seconds: 77, resources: { gold: 9, wood: 8, stone: 7 } }, progress)).toBe(true);
    expect(progress.completed('alliance')[ids[0]]).toMatchObject({ seconds: 77, resources: { gold: 9, wood: 8, stone: 7 } });
    setActiveRun(null);
    expect(onMissionEnded({ missionId: ids[1], outcome: 'victory' }, progress)).toBe(false);
  });
});

describe('campanha: i18n (F8-05)', () => {
  it('chaves da tela de campanha existem em pt-BR e en', () => {
    const keys = ['menu.campaign', 'menu.campaignHint', 'campaign.none', 'campaign.play', 'campaign.newAttempt', 'campaign.attempt',
      'campaign.provisional', 'campaign.provisionalHint', 'campaign.status.locked', 'campaign.status.available', 'campaign.status.completed', 'campaign.carry'];
    for (const k of keys) {
      expect(ptBR[k], k).toBeTruthy();
      expect(en[k], k).toBeTruthy();
    }
  });
});

/**
 * F8-05b — conteúdo da liberação progressiva: a campanha libera TODAS as unidades/construções/pesquisas da Aliança, cada missão usa
 * (exige ou recompensa) as suas novidades, nada é entregue ao jogador antes de ser liberado, os inimigos variam por tema e a união
 * das unidades das 8 missões cobre todas as categorias (infantaria, cavalaria, cerco, conjurador, sapador, aérea, naval, herói).
 */
describe('campanha da Aliança: liberação progressiva e cobertura de unidades (F8-05b)', () => {
  const missions = ids.map((id) => getMission(id));
  const isNum = (n) => typeof n === 'number';
  const textOf = (t) => (typeof t === 'string' ? { 'pt-BR': t, en: t } : t);

  /** Todos os objetos de ação `spawn`/`spawnBuilding` (setup + gatilhos) de uma missão, com o dono. */
  function actionsOf(m) {
    const out = [];
    const walk = (v) => {
      if (Array.isArray(v)) return v.forEach(walk);
      if (!v || typeof v !== 'object') return;
      if (v.type === 'spawn' || v.type === 'spawnBuilding') out.push(v);
      Object.values(v).forEach(walk);
    };
    walk(m.setup);
    walk(m.triggers);
    return out;
  }
  const spawnedUnits = (a) => (a.units ?? (a.unitType ? [{ type: a.unitType }] : [])).map((u) => u.type);
  /** Dono do lado do jogador? Um aliado que a missão faz trair (`setTeam`) conta como inimigo. */
  const isPlayerOwner = (m, owner) => {
    if (owner === 'player' || owner === 0) return true;
    if (owner === 'ally') return true;
    if (!isNum(owner)) return false;
    const betrays = JSON.stringify(m.triggers).includes(`"type":"setTeam","player":${owner}`);
    const localTeam = m.players.find((p) => p.isLocal).team;
    return !betrays && m.players.some((p) => p.id === owner && p.team === localTeam);
  };
  const isEnemyOwner = (m, owner) => !isPlayerOwner(m, owner) && owner !== 'neutral';

  /** Seletores/condições que citam `unitType` / `buildingType` / pesquisa de um objetivo ou gatilho. */
  function conditionRefs(m) {
    const refs = { units: [], buildings: [], research: [] };
    const walk = (v, ctx) => {
      if (Array.isArray(v)) return v.forEach((x) => walk(x, ctx));
      if (!v || typeof v !== 'object') return;
      if (v.type === 'destroy' || v.type === 'dead') return; // mortes de inimigos/neutros: não são unidades do jogador
      const mine = v.owner === undefined || v.owner === 'player' || v.owner === 0;
      if (v.type === 'research' && typeof v.id === 'string') refs.research.push(v.level > 1 ? `${v.id}@${v.level}` : v.id);
      if (mine && typeof v.unitType === 'string') refs.units.push(v.unitType);
      if (mine && typeof v.buildingType === 'string') refs.buildings.push(v.buildingType);
      for (const x of Object.values(v)) walk(x, ctx);
    };
    walk(m.objectives, null);
    walk(m.triggers.map((t) => t.when), null);
    return refs;
  }

  it('a campanha libera TODAS as unidades, construções e pesquisas da Aliança (e os dois heróis)', () => {
    const all = availableTech(alliance, ids.length - 1);
    const humanUnits = Object.values(UNITS).filter((u) => (u.faction === 'human' || u.faction === 'neutral') && u.cost && !u.isHero).map((u) => u.type);
    for (const t of humanUnits) expect(all.units.has(t), `unidade ${t} nunca é liberada`).toBe(true);
    for (const t of Object.values(BUILDINGS).filter((b) => (b.faction === 'human' || b.faction === 'neutral') && b.role !== 'hq' && b.role !== 'camp').map((b) => b.type)) {
      expect(all.buildings.has(t), `construção ${t} nunca é liberada`).toBe(true);
    }
    for (const [id, r] of Object.entries(RESEARCH).filter(([, r]) => !r.faction || r.faction === 'human')) {
      for (let lv = 1; lv <= r.levels.length; lv++) expect(all.research.has(researchToken(id, lv)), `pesquisa ${id} nível ${lv} nunca é liberada`).toBe(true);
    }
    expect([...all.heroes].sort()).toEqual(['hero_brann', 'hero_oren']);
  });

  it('a progressão cresce missão a missão e cada missão libera algo novo', () => {
    let prev = 0;
    ids.forEach((id, i) => {
      const u = missionUnlocks(alliance, i);
      const novos = u.units.length + u.buildings.length + u.research.length + u.heroes.length;
      expect(novos, `${id} não libera nada`).toBeGreaterThan(0);
      const t = availableTech(alliance, i);
      const total = t.units.size + t.buildings.size + t.research.size + t.heroes.size;
      expect(total).toBe(prev + novos);
      prev = total;
    });
    // as âncoras do plano: infantaria → ferraria → torres → estábulo → oficina → estaleiro → magia/aviário → o resto
    const when = (kind, id) => unlockMissionOf(alliance, kind, id);
    expect(when('units', 'knight')).toBe(1);
    expect(when('units', 'archer')).toBe(1);
    expect(when('buildings', 'forge')).toBe(2);
    expect(when('buildings', 'watchtower')).toBe(3);
    expect(when('buildings', 'wall_human')).toBe(3);
    expect(when('buildings', 'stable')).toBe(4);
    expect(when('units', 'cavalier')).toBe(4);
    expect(when('buildings', 'workshop')).toBe(5);
    expect(when('units', 'ballista')).toBe(5);
    expect(when('units', 'sapper')).toBe(5);
    expect(when('buildings', 'shipyard')).toBe(6);
    expect(when('buildings', 'oil_platform')).toBe(6);
    expect(when('units', 'frigate')).toBe(6);
    expect(when('units', 'barge')).toBe(6);
    expect(when('units', 'tanker')).toBe(6);
    expect(when('units', 'dreadnought')).toBe(6);
    expect(when('buildings', 'arcane_tower')).toBe(7);
    expect(when('buildings', 'temple')).toBe(7);
    expect(when('buildings', 'aviary')).toBe(7);
    expect(when('units', 'mage')).toBe(7);
    expect(when('units', 'templar')).toBe(7);
    expect(when('units', 'gryphon_rider')).toBe(7);
    expect(when('research', 'melee_weapons@2')).toBe(7);
    expect(when('units', 'ranger')).toBe(8);
  });

  it('cada item liberado é alcançável: os requisitos de construção/nível/pesquisa saem de itens liberados antes ou junto', () => {
    // nível do Centro que a missão concede (ação `setTier` do setup); sem ela, nível 1
    const tierOf = (m) => Math.max(1, ...m.setup.filter((a) => a.type === 'setTier').map((a) => a.tier));
    const reqOk = (req, avail, tier) => {
      if (typeof req === 'string') return avail.buildings.has(req) || req === 'castle';
      if (typeof req.hq === 'number') return tier >= req.hq;
      if (typeof req.role === 'string') return [...avail.buildings].some((b) => BUILDINGS[b].role === req.role);
      if (typeof req.research === 'string') return avail.research.has(researchToken(req.research, req.level || 1));
      return false;
    };
    ids.forEach((id, i) => {
      const avail = availableTech(alliance, i);
      const here = tierOf(getMission(id));
      const novos = missionUnlocks(alliance, i);
      for (const b of novos.buildings) for (const r of BUILDINGS[b].requires || []) expect(reqOk(r, avail, here), `${id}: ${b} exige ${JSON.stringify(r)}`).toBe(true);
      for (const u of novos.units) {
        const base = UNITS[u].modelOf;
        const reqs = UNITS[u].requires || [];
        for (const r of reqs) expect(reqOk(r, avail, here), `${id}: ${u} exige ${JSON.stringify(r)}`).toBe(true);
        // a unidade precisa de uma construção liberada que a treine (ou da pesquisa que a promove)
        const trainers = Object.values(BUILDINGS).filter((b) => avail.buildings.has(b.type) && (b.trains || []).some((t) => t === u || t === base));
        const promoted = Object.values(RESEARCH).some((r) => r.levels[0].effect && r.levels[0].effect.promote && Object.values(r.levels[0].effect.promote).includes(u) && avail.research.has(Object.keys(RESEARCH).find((k) => RESEARCH[k] === r)));
        const castleTrains = (BUILDINGS.castle.trains || []).includes(u);
        expect(trainers.length > 0 || promoted || castleTrains, `${id}: ${u} sem construção liberada que a treine`).toBe(true);
      }
      for (const r of novos.research) {
        const { id: rid, level } = parseResearchToken(r);
        const def = RESEARCH[rid];
        for (const q of def.levels[level - 1].requires || []) expect(reqOk(q, avail, here), `${id}: pesquisa ${r} exige ${JSON.stringify(q)}`).toBe(true);
        expect([...avail.buildings].some((b) => BUILDINGS[b].role === def.building), `${id}: ${r} sem construção liberada que a pesquise (${def.building})`).toBe(true);
      }
    });
  });

  it('nada é entregue ao jogador antes de liberado: spawns, construções e pesquisas de objetivos usam só o disponível naquela missão', () => {
    ids.forEach((id, i) => {
      const m = missions[i];
      const avail = availableTech(alliance, i);
      for (const a of actionsOf(m)) {
        if (a.type === 'spawnBuilding') {
          if (isPlayerOwner(m, a.owner)) expect(BUILDINGS[a.buildingType].role === 'hq' || avail.buildings.has(a.buildingType), `${id}: spawnBuilding ${a.buildingType}`).toBe(true);
          continue;
        }
        if (!isPlayerOwner(m, a.owner)) continue;
        for (const u of spawnedUnits(a)) {
          if (UNITS[u].isHero) expect(avail.heroes.has(u), `${id}: herói ${u} ainda não liberado`).toBe(true);
          else if (UNITS[u].faction === 'neutral' && u !== 'tanker' && u !== 'barge') continue; // cativos/civis neutros
          else expect(avail.units.has(u) || (UNITS[u].modelOf && avail.units.has(UNITS[u].modelOf)), `${id}: ${u} entregue antes de liberado`).toBe(true);
        }
      }
      const refs = conditionRefs(m);
      for (const u of refs.units) expect(avail.units.has(u) || avail.heroes.has(u) || (UNITS[u].modelOf && avail.units.has(UNITS[u].modelOf)), `${id}: objetivo cita ${u} antes de liberado`).toBe(true);
      for (const b of refs.buildings) expect(avail.buildings.has(b), `${id}: objetivo cita ${b} antes de liberado`).toBe(true);
      for (const r of refs.research) expect(avail.research.has(r), `${id}: objetivo cita a pesquisa ${r} antes de liberada`).toBe(true);
    });
  });

  it('cada missão USA as novidades que libera (objetivo, recompensa, herói ou inimigo) e traz uma "Dica" bilíngue', () => {
    ids.forEach((id, i) => {
      const m = missions[i];
      const u = missionUnlocks(alliance, i);
      const blob = JSON.stringify({ o: m.objectives, t: m.triggers, s: m.setup });
      const used = [...u.units, ...u.buildings, ...u.heroes].filter((x) => blob.includes(`"${x}"`));
      const usedResearch = u.research.filter((r) => { const p = parseResearchToken(r); return blob.includes(`"id":"${p.id}"`) || blob.includes(`"id": "${p.id}"`); });
      expect(used.length + usedResearch.length, `${id}: nenhuma novidade é usada na missão`).toBeGreaterThanOrEqual(i === 0 ? 2 : 1);
      const hints = (m.briefing.hints || []).map(textOf);
      expect(hints.some((h) => /^Dica:/.test(h['pt-BR']) && /^Tip:/.test(h.en)), `${id}: sem "Dica:" bilíngue`).toBe(true);
    });
  });

  it('as novidades de cada missão têm nome em pt-BR e en (sem chave ausente)', () => {
    ids.forEach((id, i) => {
      const u = missionUnlocks(alliance, i);
      for (const t of [...u.units, ...u.heroes]) for (const d of [ptBR, en]) expect(d[`unit.${t}.name`], `unit.${t}.name`).toBeTruthy();
      for (const t of u.buildings) for (const d of [ptBR, en]) expect(d[`building.${t}.name`], `building.${t}.name`).toBeTruthy();
      for (const r of u.research) for (const d of [ptBR, en]) expect(d[`research.${parseResearchToken(r).id}.human`], `research.${r}`).toBeTruthy();
    });
    for (const k of ['req.locked', 'req.lockedNever', 'campaign.unlock.title', 'campaign.unlock.announce', 'campaign.unlock.units', 'campaign.unlock.buildings', 'campaign.unlock.research', 'campaign.unlock.heroes', 'campaign.unlock.level']) {
      expect(ptBR[k], k).toBeTruthy();
      expect(en[k], k).toBeTruthy();
    }
  });

  it('heróis únicos: cada um entra em 2 ou 3 missões, sempre depois de liberado, e nunca em duas ações da mesma missão', () => {
    const where = { hero_brann: [], hero_oren: [] };
    ids.forEach((id, i) => {
      const seen = new Set();
      for (const a of actionsOf(missions[i])) for (const u of spawnedUnits(a)) {
        if (!UNITS[u].isHero) continue;
        expect(seen.has(u), `${id}: ${u} aparece duas vezes`).toBe(false);
        seen.add(u);
        where[u].push(i + 1);
        expect(availableTech(alliance, i).heroes.has(u)).toBe(true);
      }
    });
    expect(where.hero_brann).toEqual([5, 6, 8]);
    expect(where.hero_oren).toEqual([7, 8]);
  });

  it('inimigos variam com o tema da missão (necromantes, serpes, lanceiros, navios orcs, cerco, incendiários…)', () => {
    const enemy = ids.map((id, i) => {
      const set = new Set();
      for (const a of actionsOf(missions[i])) if (a.type === 'spawn' && isEnemyOwner(missions[i], a.owner)) spawnedUnits(a).forEach((u) => set.add(u));
      return set;
    });
    const has = (n, ...types) => types.forEach((t) => expect(enemy[n - 1].has(t), `m0${n} sem ${t}`).toBe(true));
    has(1, 'grunt');
    has(2, 'grunt', 'axethrower');
    has(3, 'ogre', 'arsonist'); // muralhas: Incendiários na onda final
    has(4, 'ogre');
    has(5, 'catapult', 'arsonist'); // cerco e Incendiários
    has(6, 'war_galley', 'iron_leviathan'); // navios orcs
    has(7, 'necromancer', 'war_balloon', 'ogre');
    has(8, 'necromancer', 'war_serpent', 'ogre');
    // construções inimigas criadas pela missão: torres de guarda (m05) e o Ninho das Serpes (m08)
    const nests = actionsOf(missions[7]).filter((a) => a.type === 'spawnBuilding').map((a) => a.buildingType);
    expect(nests).toContain('serpent_nest');
    const towers = actionsOf(missions[4]).filter((a) => a.type === 'spawnBuilding').map((a) => a.buildingType);
    expect(towers.filter((t) => t === 'orc_watchtower').length).toBe(2);
    // m01–m03 continuam leves: nenhum deles ganhou herói, cerco, naval ou aéreo inimigo
    for (let n = 1; n <= 3; n++) for (const t of enemy[n - 1]) expect(['grunt', 'axethrower', 'ogre', 'arsonist']).toContain(t);
  });

  it('cobertura de unidades: as 8 missões (jogador + inimigo + objetivos) usam pelo menos uma unidade de CADA categoria', () => {
    const CAT = {
      infantaria: ['villager', 'knight', 'archer', 'ranger', 'peon', 'grunt', 'axethrower', 'berserker'],
      cavalaria: ['cavalier', 'ogre'],
      cerco: ['ballista', 'catapult'],
      conjurador: ['mage', 'templar', 'necromancer', 'ogre_mage'],
      sapador: ['sapper', 'arsonist'],
      aerea: ['glider', 'gryphon_rider', 'war_balloon', 'war_serpent'],
      naval: ['tanker', 'barge', 'frigate', 'dreadnought', 'submersible', 'war_galley', 'iron_leviathan', 'colossal_turtle'],
      heroi: ['hero_brann', 'hero_oren', 'hero_drogath']
    };
    const catOf = (t) => Object.keys(CAT).find((c) => CAT[c].includes(t));
    const player = new Set();
    const foe = new Set();
    const objective = new Set();
    ids.forEach((id, i) => {
      const m = missions[i];
      for (const a of actionsOf(m)) {
        if (a.type !== 'spawn') continue;
        for (const u of spawnedUnits(a)) (isPlayerOwner(m, a.owner) ? player : isEnemyOwner(m, a.owner) ? foe : new Set()).add(u);
      }
      const refs = conditionRefs(m);
      refs.units.forEach((u) => objective.add(u));
      for (const o of m.objectives) {
        const sel = o.select || {};
        if (sel.unitType) objective.add(sel.unitType);
      }
      for (const p of m.players) (p.factionId === 'human' ? ['villager', 'knight', 'archer'] : ['peon', 'grunt', 'axethrower']).forEach((u) => (p.isLocal || p.team === m.players.find((q) => q.isLocal).team ? player : foe).add(u));
    });
    const used = new Set([...player, ...foe, ...objective]);
    for (const c of Object.keys(CAT)) {
      expect(CAT[c].some((u) => used.has(u)), `categoria ${c} não aparece em nenhuma missão`).toBe(true);
    }
    // o jogador usa uma unidade de cada categoria da Aliança, e o inimigo traz as suas (sem heróis)
    for (const c of Object.keys(CAT)) expect(CAT[c].some((u) => player.has(u) || objective.has(u)), `jogador sem ${c}`).toBe(true);
    for (const c of Object.keys(CAT).filter((x) => x !== 'heroi')) expect(CAT[c].some((u) => foe.has(u)), `inimigo sem ${c}`).toBe(true);
    // e toda unidade usada pertence a uma categoria conhecida (sem tipo esquecido)
    for (const u of used) if (!['bandit', 'sheep', 'skeleton'].includes(u)) expect(catOf(u), `${u} sem categoria`).toBeTruthy();
    // todas as unidades da Aliança (treináveis ou heróis) aparecem em alguma missão, no jogador ou nos objetivos, ou são liberadas para treino
    const all = availableTech(alliance, ids.length - 1);
    for (const u of [...all.units, ...all.heroes]) expect(catOf(u), `${u} sem categoria`).toBeTruthy();
  });
});
