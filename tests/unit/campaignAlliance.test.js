import { describe, it, expect, beforeEach } from 'vitest';
import { listCampaigns, getCampaign } from '../../src/data/campaigns/index.js';
import { getMission, listMissions } from '../../src/data/missions/index.js';
import { getMap } from '../../src/data/maps/index.js';
import { validateMission } from '../../src/sim/missions/schema.js';
import { validateMatchConfig } from '../../src/sim/MatchConfig.js';
import { getHeightForMap } from '../../src/world/terrainGenerators.js';
import { UNITS } from '../../src/data/units.js';
import { NAVAL_MIN_DEPTH } from '../../src/data/combat.js';
import {
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
