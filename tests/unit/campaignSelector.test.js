import { describe, it, expect } from 'vitest';
import { listCampaigns, getCampaign } from '../../src/data/campaigns/index.js';
import { CampaignProgress, memoryStorage } from '../../src/campaign/progress.js';
import { CampaignScreen } from '../../src/ui/screens/CampaignScreen.js';

describe('Seletor e Múltiplas Campanhas (MUNDO-HISTORIA-CAMPANHA §7)', () => {
  it('listCampaigns lista as 3 campanhas em ordem correta por order', () => {
    const camps = listCampaigns();
    expect(camps.length).toBe(3);
    expect(camps[0].id).toBe('war-alliance');
    expect(camps[1].id).toBe('war-horde');
    expect(camps[2].id).toBe('alliance');
    expect(camps[2].track).toBe('beta');
  });

  it('cada campanha possui suas 12 missões (ou 8 na beta) devidamente registradas', () => {
    const warAlliance = getCampaign('war-alliance');
    const warHorde = getCampaign('war-horde');
    const alliance = getCampaign('alliance');

    expect(warAlliance.missions.length).toBe(12);
    expect(warHorde.missions.length).toBe(12);
    expect(alliance.missions.length).toBe(8);

    expect(warAlliance.factionId).toBe('human');
    expect(warHorde.factionId).toBe('orc');
  });

  it('CampaignProgress gerencia tentativas e vitórias de forma isolada entre campanhas', () => {
    const storage = memoryStorage();
    const progress = new CampaignProgress(storage);

    // Registra vitória na m01 da campanha principal do Reino
    progress.recordVictory('war-alliance', 'war-alliance-01-terra-a-vista', { seconds: 120 });
    expect(progress.completed('war-alliance')['war-alliance-01-terra-a-vista']).toBeDefined();

    // campanha dos Clãs principal não deve ter missões completadas
    expect(Object.keys(progress.completed('war-horde')).length).toBe(0);

    // Registra vitória nos Clãs
    progress.recordVictory('war-horde', 'war-horde-01-cinzas-vermelhas', { seconds: 95 });
    expect(progress.completed('war-horde')['war-horde-01-cinzas-vermelhas']).toBeDefined();

    // Campanha beta continua intacta
    expect(Object.keys(progress.completed('alliance')).length).toBe(0);
  });

  it('CampaignScreen gerencia campaignId e seleção padrão por campanha', () => {
    const storage = memoryStorage();
    const progress = new CampaignProgress(storage);
    const screen = new CampaignScreen({
      onStart: () => {},
      progress
    }, null);

    expect(screen.campaignId).toBeNull();
    // seleciona war-alliance
    screen.campaignId = 'war-alliance';
    screen._pickDefault();
    expect(screen.selected).toBe('war-alliance-01-terra-a-vista');

    // seleciona war-horde
    screen.campaignId = 'war-horde';
    screen._pickDefault();
    expect(screen.selected).toBe('war-horde-01-cinzas-vermelhas');

    // seleciona alliance (beta)
    screen.campaignId = 'alliance';
    screen._pickDefault();
    expect(screen.selected).toBe('alliance-01-fumaca-no-vale');
  });
});
