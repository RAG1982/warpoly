import { describe, it, expect, beforeEach } from 'vitest';
import { campaignEndPlan } from '../../src/campaign/campaign.js';
import {
  CampaignProgress, memoryStorage, setProgress, setActiveRun, getActiveRun, getCampaignEndPlan,
  prepareCampaignMission, onMissionEnded
} from '../../src/campaign/index.js';
import { getCampaign } from '../../src/data/campaigns/index.js';
import { buildMissionEndModel, missionEndActions } from '../../src/ui/missionPresentation.js';
import ptBR from '../../src/i18n/pt-BR.json';
import en from '../../src/i18n/en.json';

const def = {
  id: 'c', missions: [
    { id: 'a' },
    { id: 'b', requires: ['a'], carryOver: { resources: { gold: 0.5 } } },
    { id: 'c', requires: ['b', 'x-nao-feita'] },
    { id: 'z', requires: ['b'] }
  ]
};
const snap = (outcome) => ({ id: 'a', title: 'M', outcome, outcomeText: null, objectives: [] });

describe('campaignEndPlan (puro)', () => {
  it('vitória com próxima desbloqueada: aponta a missão seguinte e o carry-over', () => {
    const p = campaignEndPlan(def, 'a', 'victory', {});
    expect(p).toMatchObject({ inCampaign: true, hasNext: true, nextMissionId: 'b', isLastMission: false, campaignComplete: false, carryOver: true });
  });
  it('pula missões ainda bloqueadas e escolhe a primeira desbloqueada', () => {
    const p = campaignEndPlan(def, 'b', 'victory', { a: {} });
    expect(p.nextMissionId).toBe('z'); // "c" exige outra missão não concluída
  });
  it('última missão vencida: sem próxima; campanha concluída só se tudo foi vencido', () => {
    const linear = { id: 'l', missions: [{ id: 'a' }, { id: 'b', requires: ['a'] }] };
    const p = campaignEndPlan(linear, 'b', 'victory', { a: {} });
    expect(p).toMatchObject({ hasNext: false, nextMissionId: null, isLastMission: true, campaignComplete: true });
    expect(campaignEndPlan(def, 'z', 'victory', { a: {}, b: {} })).toMatchObject({ hasNext: false, isLastMission: true, campaignComplete: false });
  });
  it('próxima bloqueada (requisito não cumprido): não oferece', () => {
    const d = { id: 'd', missions: [{ id: 'a' }, { id: 'b', requires: ['a', 'outra'] }] };
    expect(campaignEndPlan(d, 'a', 'victory', {}).hasNext).toBe(false);
  });
  it('derrota: nunca há próxima nem campanha concluída', () => {
    const p = campaignEndPlan(def, 'a', 'defeat', { a: {} });
    expect(p).toMatchObject({ inCampaign: true, hasNext: false, nextMissionId: null, campaignComplete: false });
  });
  it('missão fora da campanha: inCampaign=false', () => {
    expect(campaignEndPlan(def, 'nada', 'victory', {}).inCampaign).toBe(false);
    expect(campaignEndPlan(null, 'a', 'victory', {}).inCampaign).toBe(false);
  });
});

describe('modelo da tela final (botões)', () => {
  it('vitória com próxima: Próxima (primário), Repetir, Estatísticas, Menu', () => {
    const m = buildMissionEndModel(snap('victory'), 10, 'pt-BR', campaignEndPlan(def, 'a', 'victory', {}));
    expect(m.actions.map((a) => a.id)).toEqual(['next', 'retry', 'stats', 'menu']);
    expect(m.actions.filter((a) => a.primary).map((a) => a.id)).toEqual(['next']);
    expect(m.actions[1].labelKey).toBe('campaign.end.repeat');
    expect(m.campaignDoneKey).toBeNull();
  });
  it('derrota: Tentar novamente, Estatísticas, Menu (sem Próxima)', () => {
    const m = buildMissionEndModel(snap('defeat'), 10, 'pt-BR', campaignEndPlan(def, 'a', 'defeat', {}));
    expect(m.actions.map((a) => a.id)).toEqual(['retry', 'stats', 'menu']);
    expect(m.actions[0]).toMatchObject({ labelKey: 'campaign.end.tryAgain', primary: true });
  });
  it('última missão vencida: mensagem de campanha concluída, sem Próxima', () => {
    const linear = { id: 'l', missions: [{ id: 'a' }, { id: 'b', requires: ['a'] }] };
    const m = buildMissionEndModel({ ...snap('victory'), id: 'b' }, 10, 'pt-BR', campaignEndPlan(linear, 'b', 'victory', { a: {} }));
    expect(m.actions.some((a) => a.id === 'next')).toBe(false);
    expect(m.campaignDoneKey).toBe('campaign.end.complete');
    expect(m.actions.find((a) => a.id === 'retry').primary).toBe(true);
  });
  it('fora da campanha: comportamento antigo', () => {
    expect(missionEndActions('victory', null).actions[0]).toMatchObject({ id: 'retry', labelKey: 'mission.replay' });
    expect(missionEndActions('defeat', null).actions[0]).toMatchObject({ id: 'retry', labelKey: 'mission.retry' });
  });
  it('todas as chaves usadas existem em pt-BR e en', () => {
    const keys = ['campaign.end.next', 'campaign.end.repeat', 'campaign.end.tryAgain', 'campaign.end.complete'];
    for (const k of keys) { expect(ptBR[k], k).toBeTruthy(); expect(en[k], k).toBeTruthy(); }
  });
});

describe('integração com a campanha real (progresso + carry-over)', () => {
  let progress;
  beforeEach(() => { progress = new CampaignProgress(memoryStorage()); setProgress(progress); setActiveRun(null); });

  it('vitória grava o progresso e a "próxima" inicia com carry-over, pelo mesmo fluxo da CampaignScreen', () => {
    const camp = getCampaign('alliance');
    const [m1, m2] = camp.missions.map((m) => m.id);
    prepareCampaignMission('alliance', m1);
    expect(getActiveRun()).toMatchObject({ campaignId: 'alliance', missionId: m1 });
    expect(getCampaignEndPlan(m1, 'defeat')).toMatchObject({ hasNext: false });
    expect(onMissionEnded({ missionId: m1, outcome: 'victory', seconds: 90, resources: { gold: 400, wood: 100, stone: 0 } })).toBe(true);
    const plan = getCampaignEndPlan(m1, 'victory');
    expect(plan).toMatchObject({ hasNext: true, nextMissionId: m2, carryOver: true, campaignId: 'alliance' });
    const cfg = prepareCampaignMission('alliance', plan.nextMissionId);
    expect(getActiveRun().missionId).toBe(m2);
    expect(cfg.startingResources.gold).toBeGreaterThanOrEqual(100); // 25% de 400
  });

  it('derrota não grava e não libera a próxima', () => {
    const [m1, m2] = getCampaign('alliance').missions.map((m) => m.id);
    prepareCampaignMission('alliance', m1);
    expect(onMissionEnded({ missionId: m1, outcome: 'defeat' })).toBe(false);
    expect(() => prepareCampaignMission('alliance', m2)).toThrow(/bloqueada/);
  });

  it('última missão: sem próxima e campanha concluída quando todas foram vencidas', () => {
    const ids = getCampaign('alliance').missions.map((m) => m.id);
    for (const id of ids) {
      prepareCampaignMission('alliance', id);
      onMissionEnded({ missionId: id, outcome: 'victory', seconds: 1, resources: { gold: 0, wood: 0, stone: 0 } });
    }
    const last = ids[ids.length - 1];
    expect(getCampaignEndPlan(last, 'victory')).toMatchObject({ hasNext: false, isLastMission: true, campaignComplete: true });
  });

  it('sem execução ativa (missão avulsa): plano nulo', () => {
    expect(getCampaignEndPlan('qualquer', 'victory')).toBeNull();
  });
});
