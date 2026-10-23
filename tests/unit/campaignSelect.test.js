import { describe, it, expect } from 'vitest';
import { listCampaigns } from '../../src/data/campaigns/index.js';
import { CampaignProgress, memoryStorage } from '../../src/campaign/progress.js';
import { buildCampaignCards, nextFocusIndex, isCampaignPlayable, showBetaFor } from '../../src/ui/campaignSelectModel.js';
import { CampaignScreen } from '../../src/ui/screens/CampaignScreen.js';
import pt from '../../src/i18n/pt-BR.json';
import en from '../../src/i18n/en.json';

const camps = listCampaigns();

describe('Tela de escolha de campanha (M2-34)', () => {
  it('mostra só as duas campanhas principais por padrão; a beta só com ?campaign=alliance|beta|unlock', () => {
    const progress = new CampaignProgress(memoryStorage());
    const { main, beta } = buildCampaignCards(camps, progress);
    expect(main.map((c) => c.id)).toEqual(['war-alliance', 'war-horde']);
    expect(beta).toEqual([]);
    expect(buildCampaignCards(camps, progress, { param: 'alliance' }).beta.map((c) => c.id)).toEqual(['alliance']);
    expect(showBetaFor('unlock')).toBe(true);
    expect(showBetaFor(null)).toBe(false);
  });

  it('cartões trazem facção, progresso via CampaignProgress e rótulo "em breve" da Horda', () => {
    const progress = new CampaignProgress(memoryStorage());
    progress.recordVictory('war-alliance', 'war-alliance-01-terra-a-vista', { seconds: 100 });
    const { main } = buildCampaignCards(camps, progress);
    const [a, h] = main;
    expect([a.faction, h.faction]).toEqual(['human', 'orc']);
    expect([a.done, a.total]).toEqual([1, 12]);
    expect([h.done, h.total]).toEqual([0, 12]);
    expect(a.playable).toBe(true);
    expect(h.comingSoon).toBe(true);
    expect(h.playable).toBe(false);
  });

  it('campanha em breve abre com unlockAll ou ?campaign=<id>', () => {
    const horde = camps.find((c) => c.id === 'war-horde');
    expect(isCampaignPlayable(horde, {})).toBe(false);
    expect(isCampaignPlayable(horde, { unlockAll: true })).toBe(true);
    expect(isCampaignPlayable(horde, { param: 'war-horde' })).toBe(true);
  });

  it('navegação por teclado é circular', () => {
    expect(nextFocusIndex(0, 'ArrowRight', 2)).toBe(1);
    expect(nextFocusIndex(1, 'ArrowRight', 2)).toBe(0);
    expect(nextFocusIndex(0, 'ArrowLeft', 2)).toBe(1);
    expect(nextFocusIndex(1, 'Home', 3)).toBe(0);
    expect(nextFocusIndex(0, 'End', 3)).toBe(2);
    expect(nextFocusIndex(0, 'ArrowRight', 0)).toBe(-1);
  });

  it('CampaignScreen: campaignId definido de fora seleciona a missão padrão daquela campanha', () => {
    const screen = new CampaignScreen({ onStart: () => {}, progress: new CampaignProgress(memoryStorage()) }, null);
    screen.campaignId = 'war-horde';
    screen._pickDefault();
    expect(screen.selected).toBe('war-horde-01-cinzas-vermelhas');
  });

  it('chaves i18n novas existem em pt-BR e en', () => {
    const keys = Object.keys(pt).filter((k) => k.startsWith('campaign.select.') || k === 'campaign.switch');
    expect(keys.length).toBeGreaterThan(10);
    for (const k of keys) expect(en[k], k).toBeTruthy();
    for (const c of camps.filter((x) => x.track !== 'beta')) {
      expect(pt[`campaign.select.name.${c.id}`]).toBeTruthy();
      expect(pt[`campaign.select.tagline.${c.id}`]).toBeTruthy();
    }
  });
});
