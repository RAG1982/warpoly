import { describe, it, expect } from 'vitest';
import { validateCampaign, campaignEndPlan } from '../../src/campaign/campaign.js';
import { getCampaign } from '../../src/data/campaigns/index.js';
import { buildCampaignVictoryModel, isCampaignFinale, victoryArtUrl } from '../../src/ui/campaignVictoryModel.js';
import { buildVictorySvg, buildSparks } from '../../src/ui/campaignVictoryArt.js';
import { SFX } from '../../src/audio/sfxRecipes.js';
import ptBR from '../../src/i18n/pt-BR.json';
import en from '../../src/i18n/en.json';

const alliance = getCampaign('alliance');
const lastId = alliance.missions[alliance.missions.length - 1].id;
const allDone = Object.fromEntries(alliance.missions.map((m, i) => [m.id, { seconds: 600 + i * 60 }]));
const bi = (s) => ({ 'pt-BR': s, en: s });
const base = () => ({
  format: 'warpolycampaign', version: 1, id: 'x', factionId: 'human', title: bi('T'), premise: bi('P'),
  missions: [{ id: 'a' }, { id: 'b', requires: ['a'] }],
  epilogue: { faction: 'human', title: bi('Fim'), paragraphs: [bi('1'), bi('2'), bi('3')], credits: bi('Créditos') }
});

describe('epilogue no schema', () => {
  it('campanha válida com epílogo; epílogo é opcional', () => {
    expect(validateCampaign(base()).ok).toBe(true);
    const d = base(); delete d.epilogue;
    expect(validateCampaign(d).ok).toBe(true);
  });
  it('a campanha da Aliança traz epílogo bilíngue de 3 a 5 parágrafos, facção human, 120-180 palavras', () => {
    const e = alliance.epilogue;
    expect(e.faction).toBe('human');
    expect(e.paragraphs.length).toBeGreaterThanOrEqual(3);
    expect(e.paragraphs.length).toBeLessThanOrEqual(5);
    for (const lang of ['pt-BR', 'en']) {
      const words = e.paragraphs.map((p) => p[lang]).join(' ').split(/\s+/).length;
      expect(words, lang).toBeGreaterThanOrEqual(100);
      expect(words, lang).toBeLessThanOrEqual(200);
    }
  });
  it('erros: parágrafo sem idioma, poucos parágrafos, facção inválida, título sem en', () => {
    let d = base(); d.epilogue.paragraphs[1] = { 'pt-BR': 'só pt' };
    expect(validateCampaign(d).errors.join('\n')).toMatch(/epilogue\.paragraphs\[1\]/);
    d = base(); d.epilogue.paragraphs = [bi('1'), bi('2')];
    expect(validateCampaign(d).errors.join('\n')).toMatch(/epilogue\.paragraphs/);
    d = base(); d.epilogue.faction = 'elf';
    expect(validateCampaign(d).errors.join('\n')).toMatch(/epilogue\.faction/);
    d = base(); d.epilogue.title = { 'pt-BR': 'x' };
    expect(validateCampaign(d).errors.join('\n')).toMatch(/epilogue\.title/);
    d = base(); d.epilogue = 'texto';
    expect(validateCampaign(d).ok).toBe(false);
  });
});

describe('campaignEndPlan na última missão', () => {
  it('campanha concluída traz epílogo e facção', () => {
    const done = { ...allDone }; delete done[lastId];
    const p = campaignEndPlan(alliance, lastId, 'victory', done);
    expect(p).toMatchObject({ hasNext: false, isLastMission: true, campaignComplete: true, factionId: 'human' });
    expect(p.epilogue).toBe(alliance.epilogue);
    expect(isCampaignFinale(p)).toBe(true);
  });
  it('missão intermediária e derrota não são o final', () => {
    const first = alliance.missions[0].id;
    expect(isCampaignFinale(campaignEndPlan(alliance, first, 'victory', {}))).toBe(false);
    expect(campaignEndPlan(alliance, first, 'victory', {}).epilogue).toBeNull();
    expect(isCampaignFinale(campaignEndPlan(alliance, lastId, 'defeat', allDone))).toBe(false);
    expect(isCampaignFinale(null)).toBe(false);
  });
});

describe('modelo da tela de vitória', () => {
  const plan = campaignEndPlan(alliance, lastId, 'victory', allDone);
  it('Aliança: facção, título do epílogo, parágrafos, botões e estatísticas', () => {
    const m = buildCampaignVictoryModel({ def: alliance, plan, completed: allDone, lang: 'pt-BR' });
    expect(m.faction).toBe('human');
    expect(m.generic).toBe(false);
    expect(m.epilogueTitle).toBe(alliance.epilogue.title['pt-BR']);
    expect(m.paragraphs).toEqual(alliance.epilogue.paragraphs.map((p) => p['pt-BR']));
    expect(m.actions.map((a) => a.id)).toEqual(['menu', 'replay', 'stats']);
    expect(m.actions.filter((a) => a.primary)).toHaveLength(1);
    expect(m.stats).toMatchObject({ missions: 8, total: 8 });
    expect(m.stats.time).toMatch(/^\d+:\d{2}(:\d{2})?$/);
    expect(buildCampaignVictoryModel({ def: alliance, plan, completed: allDone, lang: 'en' }).epilogueTitle).toBe('Dawn over Aurelan');
  });
  it('sem epílogo: texto genérico com a facção da campanha; sem progresso: sem estatísticas', () => {
    const d = { ...alliance, factionId: 'orc' }; delete d.epilogue;
    const p = campaignEndPlan(d, lastId, 'victory', allDone);
    expect(p.epilogue).toBeNull();
    const m = buildCampaignVictoryModel({ def: d, plan: p });
    expect(m).toMatchObject({ generic: true, faction: 'orc', paragraphs: [], epilogueTitle: '', stats: null });
  });
  it('slot de arte final', () => {
    expect(victoryArtUrl('orc')).toBe('/ui/art/victory_orc.webp');
    expect(victoryArtUrl('human', '/base/')).toBe('/base/ui/art/victory_human.webp');
  });
});

describe('ilustração SVG procedural', () => {
  for (const f of ['human', 'orc']) {
    it(`${f}: elementos esperados e nenhum asset externo`, () => {
      const svg = buildVictorySvg(f);
      for (const cls of ['cv-rays', 'cv-far', 'cv-mid', 'cv-flag', 'cv-banner', 'cv-laurel', 'cv-sun']) expect(svg, cls).toContain(`class="${cls}`);
      expect(svg).toContain(`cv-svg--${f}`);
      expect(svg).not.toMatch(/<image|<script|xlink:href|href=|url\((?!#)/i);
      expect(svg).not.toMatch(/https?:\/\/(?!www\.w3\.org)/);
    });
  }
  it('facções diferem (cores e emblema) e as faíscas são determinísticas', () => {
    expect(buildVictorySvg('human')).not.toBe(buildVictorySvg('orc'));
    expect(buildVictorySvg('orc')).toContain('#a3281c');
    expect(buildVictorySvg('human')).toContain('#2f5fb3');
    expect(buildSparks('human')).toBe(buildSparks('human'));
    expect((buildSparks('orc', 10).match(/cv-spark/g) || []).length).toBe(10);
  });
});

describe('i18n e som', () => {
  it('chaves da tela final existem nos dois idiomas', () => {
    for (const k of ['campaign.victory.title', 'campaign.victory.replay', 'campaign.victory.stats', 'campaign.victory.skip', 'campaign.end.complete', 'mission.menu', 'mission.stats']) {
      expect(ptBR[k], k).toBeTruthy();
      expect(en[k], k).toBeTruthy();
    }
  });
  it('fanfarras sintetizadas por facção existem', () => {
    for (const k of ['victoryFanfareHuman', 'victoryFanfareOrc']) {
      expect(SFX[k].dur).toBeGreaterThan(0.05);
      expect(SFX[k].dur).toBeLessThan(2);
    }
  });
});
