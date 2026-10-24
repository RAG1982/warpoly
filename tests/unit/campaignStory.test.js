import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import worldStory from '../../src/data/story/world.json';
import { validateStory, CampaignStoryModel, storyArtUrl, storyArtCandidates } from '../../src/ui/campaignStoryModel.js';
import { CampaignProgress, memoryStorage } from '../../src/campaign/progress.js';

const PUBLIC_DIR = join(process.cwd(), 'public');
/** Caminho em `public/` (sem extensão) de um id de arte, como `storyArtCandidates` o resolve. */
const artStem = (id) => (id.includes('/') ? `art/${id}` : `art/story/${id.startsWith('panel-') ? id : `panel-${id}`}`);

describe('História de Abertura da Campanha (MUNDO-HISTORIA-CAMPANHA §2)', () => {
  describe('Validação do JSON (world.json)', () => {
    it('world.json é válido segundo validateStory', () => {
      const res = validateStory(worldStory);
      expect(res.ok).toBe(true);
      expect(res.errors).toEqual([]);
    });

    it('possui 7 painéis narrativos mais tela de título', () => {
      expect(worldStory.panels.length).toBe(7);
      expect(worldStory.titleCard).toBeDefined();
    });

    it('todos os painéis possuem texto bilíngue em pt-BR e en', () => {
      for (const p of worldStory.panels) {
        if (p.factionVariants) {
          expect(p.factionVariants.human.text['pt-BR']).toBeTruthy();
          expect(p.factionVariants.human.text.en).toBeTruthy();
          expect(p.factionVariants.orc.text['pt-BR']).toBeTruthy();
          expect(p.factionVariants.orc.text.en).toBeTruthy();
        } else {
          expect(p.text['pt-BR']).toBeTruthy();
          expect(p.text.en).toBeTruthy();
        }
      }
    });

    it('rejeita dados inválidos ou incompletos', () => {
      expect(validateStory(null).ok).toBe(false);
      expect(validateStory({ format: 'outro', version: 1 }).ok).toBe(false);
      expect(validateStory({ format: 'warpolystory', version: 2 }).ok).toBe(false);

      const semPanels = {
        format: 'warpolystory',
        version: 1,
        title: { 'pt-BR': 'T', en: 'T' },
        panels: []
      };
      expect(validateStory(semPanels).ok).toBe(false);

      const faltandoEn = {
        format: 'warpolystory',
        version: 1,
        title: { 'pt-BR': 'T' },
        panels: Array(6).fill({ id: 'p', art: 'a', seconds: 10, text: { 'pt-BR': 'só pt' } })
      };
      expect(validateStory(faltandoEn).ok).toBe(false);
    });
  });

  describe('Modelo puro CampaignStoryModel', () => {
    it('carrega painéis e resolve variantes por facção (Reino x Clãs)', () => {
      const storage = memoryStorage();
      const modelHuman = new CampaignStoryModel({
        storyData: worldStory,
        campaignId: 'war-alliance',
        faction: 'human',
        storage
      });

      const modelOrc = new CampaignStoryModel({
        storyData: worldStory,
        campaignId: 'war-horde',
        faction: 'orc',
        storage
      });

      expect(modelHuman.totalCount).toBe(8); // 7 narrativos + 1 título
      expect(modelHuman.narrativeCount).toBe(7);

      // Painel 7 do Reino cita Sevelin e Baía de Aurelan
      const p7Human = modelHuman.panels[6];
      expect(p7Human.art).toBe('panel-7-alliance');
      expect(p7Human.text['pt-BR']).toContain('Sevelin');
      expect(p7Human.text.en).toContain('Aurelan');

      // Painel 7 dos Clãs cita Skarn e Planalto do Cinzal
      const p7Orc = modelOrc.panels[6];
      expect(p7Orc.art).toBe('panel-7-horde');
      expect(p7Orc.text['pt-BR']).toContain('Skarn');
      expect(p7Orc.text.en).toContain('Skarn');
    });

    it('navega com next(), prev() e detecta início e fim', () => {
      const model = new CampaignStoryModel({
        storyData: worldStory,
        campaignId: 'war-alliance',
        faction: 'human',
        storage: memoryStorage()
      });

      expect(model.isFirst).toBe(true);
      expect(model.isLast).toBe(false);
      expect(model.currentIndex).toBe(0);

      // prev no início não faz nada
      expect(model.prev()).toBe(false);
      expect(model.currentIndex).toBe(0);

      // Avança até o penúltimo
      for (let i = 0; i < model.totalCount - 1; i++) {
        expect(model.next()).toBe(true);
      }
      expect(model.isLast).toBe(true);
      expect(model.isTitle).toBe(true);

      // Retorna 1 painel
      expect(model.prev()).toBe(true);
      expect(model.isLast).toBe(false);
      expect(model.currentIndex).toBe(model.totalCount - 2);

      // Avança para o último e depois completa
      expect(model.next()).toBe(true);
      expect(model.isLast).toBe(true);
      expect(model.next()).toBe(false); // Chegou ao fim
      expect(model.isCompleted).toBe(true);
    });

    it('skip() pula diretamente para o encerramento e marca visto', () => {
      const storage = memoryStorage();
      const model = new CampaignStoryModel({
        storyData: worldStory,
        campaignId: 'war-alliance',
        faction: 'human',
        storage
      });

      expect(model.isFirstTime('war-alliance')).toBe(true);
      model.skip();
      expect(model.isCompleted).toBe(true);
      expect(model.isFirstTime('war-alliance')).toBe(false);
    });

    it('persistência em storage isola campanhas e reinicia com nova tentativa', () => {
      const storage = memoryStorage();
      const progress = new CampaignProgress(storage);

      expect(CampaignStoryModel.isFirstTime('war-alliance', progress)).toBe(true);
      expect(CampaignStoryModel.isFirstTime('war-horde', progress)).toBe(true);

      CampaignStoryModel.markSeen('war-alliance', progress);

      // Reino já visto, Clãs ainda na primeira vez
      expect(CampaignStoryModel.isFirstTime('war-alliance', progress)).toBe(false);
      expect(CampaignStoryModel.isFirstTime('war-horde', progress)).toBe(true);

      // Nova tentativa no Reino reativa a visualização de primeira vez
      progress.newAttempt('war-alliance');
      expect(CampaignStoryModel.isFirstTime('war-alliance', progress)).toBe(true);
    });

    it('storyArtUrl gera o caminho correto da arte', () => {
      expect(storyArtUrl('1')).toBe('/ui/art/story/panel-1.webp');
      expect(storyArtUrl('panel-2')).toBe('/ui/art/story/panel-2.webp');
      expect(storyArtUrl('title', '/assets/')).toBe('/assets/ui/art/story/panel-title.webp');
    });

    it('storyArtCandidates parte do BASE_URL (jogo numa subpasta, ex.: GitHub Pages /warpoly/)', () => {
      expect(storyArtCandidates('2', '/warpoly/')).toEqual([
        '/warpoly/art/story/panel-2.png',
        '/warpoly/art/story/panel-2.jpg',
        '/warpoly/ui/art/story/panel-2.webp'
      ]);
      expect(storyArtCandidates('panel-7-horde', './')[0]).toBe('./art/story/panel-7-horde.png');
      expect(storyArtCandidates('world/mapa-mundi', '/warpoly/')).toEqual([
        '/warpoly/art/world/mapa-mundi.png',
        '/warpoly/art/world/mapa-mundi.jpg'
      ]);
      for (const url of storyArtCandidates('3', '/warpoly/')) expect(url.startsWith('/warpoly/')).toBe(true);
    });

    it('toda arte citada em world.json (painéis das duas facções e cartão de título) existe em public/', () => {
      const ids = new Set();
      for (const p of worldStory.panels) {
        ids.add(p.art);
        for (const v of Object.values(p.factionVariants || {})) ids.add(v.art);
      }
      ids.add(worldStory.titleCard.art);
      for (const id of ids) {
        const stem = join(PUBLIC_DIR, artStem(id));
        expect(existsSync(`${stem}.png`) || existsSync(`${stem}.jpg`), `arte sem arquivo: ${id}`).toBe(true);
      }
    });

    it('o cartão de título usa a ilustração do mapa-múndi (spec: o mapa completo se funde ao logotipo)', () => {
      expect(worldStory.titleCard.art).toBe('world/mapa-mundi');
    });
  });

  describe('Mapa-múndi de Ondara (MUNDO-TERRENO-MAPAS §4)', () => {
    it('world-map.json define os continentes e as 8 ilhas dos Estilhaços', async () => {
      const { default: worldMap } = await import('../../src/data/campaigns/world-map.json');
      expect(worldMap.format).toBe('warpolyworldmap');
      expect(worldMap.version).toBe(1);

      const velmara = worldMap.continents.find((c) => c.id === 'velmara');
      const cinzara = worldMap.continents.find((c) => c.id === 'cinzara');
      expect(velmara).toBeDefined();
      expect(cinzara).toBeDefined();
      expect(velmara.side).toBe('west');
      expect(cinzara.side).toBe('east');

      expect(worldMap.islands.length).toBe(8);
      const islandIds = worldMap.islands.map((i) => i.id);
      expect(islandIds).toContain('pouso-do-encontro');
      expect(islandIds).toContain('pedra-mae');
      expect(islandIds).toContain('baixio-do-breu');
      expect(islandIds).toContain('cerne-verde');
      expect(islandIds).toContain('a-geada');
      expect(islandIds).toContain('brejo-mudo');
      expect(islandIds).toContain('a-fornalha');
      expect(islandIds).toContain('miragem');

      const fornalha = worldMap.islands.find((i) => i.id === 'a-fornalha');
      expect(fornalha.icon).toBe('smoke');
    });

    it('generateWorldMapSvg gera SVG completo com marcadores de missão e rota', async () => {
      const { generateWorldMapSvg } = await import('../../src/ui/worldMap.js');
      const { getCampaign } = await import('../../src/data/campaigns/index.js');
      const storage = memoryStorage();
      const progress = new CampaignProgress(storage);
      const warAlliance = getCampaign('war-alliance');

      const svg = generateWorldMapSvg({
        campaignDef: warAlliance,
        progress,
        lang: 'pt-BR'
      });

      expect(svg).toContain('<svg');
      expect(svg).toContain('Velmara');
      expect(svg).toContain('Cinzara');
      expect(svg).toContain('Mar Fendido');
      expect(svg).toContain('world-map-route');
      expect(svg).toContain('world-map-marker');
      expect(svg).toContain('war-alliance-01-terra-a-vista');
    });
  });

  describe('Integração com CampaignScreen', () => {
    it('_shouldAutoShowStory respeita primeira tentativa e ignora trilha beta', async () => {
      const { CampaignScreen } = await import('../../src/ui/screens/CampaignScreen.js');
      const storage = memoryStorage();
      const progress = new CampaignProgress(storage);

      const screen = new CampaignScreen({
        onStart: () => {},
        progress
      }, null);

      // campanha principal do Reino na primeira tentativa deve exibir história
      screen.campaignId = 'war-alliance';
      expect(screen._shouldAutoShowStory()).toBe(true);

      // Vista mas sem nenhuma missão concluída: a história ainda abre ao entrar na campanha
      CampaignStoryModel.markSeen('war-alliance', progress);
      expect(screen._shouldAutoShowStory()).toBe(true);
      // ...mas "Iniciar" não a repete (já foi vista)
      expect(screen._shouldShowStoryOnStart()).toBe(false);

      // Com missão concluída: vai direto à lista
      progress.recordVictory('war-alliance', 'alliance-01', { seconds: 60 });
      expect(screen._shouldAutoShowStory()).toBe(false);

      // Campanha beta nunca abre história de abertura
      screen.campaignId = 'alliance';
      expect(screen._shouldAutoShowStory()).toBe(false);
    });
  });
});
