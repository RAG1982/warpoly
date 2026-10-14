/**
 * src/ui/campaignStoryModel.js
 * Modelo puro da tela de abertura da história (sem DOM/Three.js; testável em Node).
 * Gerencia validação do JSON, lista de painéis resolvidos por facção, navegação (next, prev, skip),
 * persistência de "história vista" e autoavanço.
 */
import { CampaignProgress, memoryStorage } from '../campaign/progress.js';

export const STORY_FORMAT = 'warpolystory';
export const STORY_VERSION = 1;

/**
 * Valida o schema de dados da história (ex: src/data/story/world.json).
 * @param {object} data
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateStory(data) {
  const errors = [];
  if (!data || typeof data !== 'object') {
    return { ok: false, errors: ['data must be an object'] };
  }
  if (data.format !== STORY_FORMAT) {
    errors.push(`invalid format: expected "${STORY_FORMAT}", got "${data.format}"`);
  }
  if (data.version !== STORY_VERSION) {
    errors.push(`invalid version: expected ${STORY_VERSION}, got ${data.version}`);
  }
  if (!data.title || typeof data.title !== 'object' || !data.title['pt-BR'] || !data.title.en) {
    errors.push('title must be bilingual with pt-BR and en');
  }
  if (!Array.isArray(data.panels)) {
    errors.push('panels must be an array');
  } else {
    if (data.panels.length < 5 || data.panels.length > 8) {
      errors.push(`panels count must be between 5 and 8 (found ${data.panels.length})`);
    }
    data.panels.forEach((p, idx) => {
      const prefix = `panels[${idx}]`;
      if (!p.id || typeof p.id !== 'string') errors.push(`${prefix}.id is required`);
      if (!p.art || typeof p.art !== 'string') errors.push(`${prefix}.art is required`);
      if (typeof p.seconds !== 'number' || p.seconds <= 0) errors.push(`${prefix}.seconds must be > 0`);

      const hasDirectText = p.text && p.text['pt-BR'] && p.text.en;
      const hasFactionVariants = p.factionVariants &&
        p.factionVariants.human?.text?.['pt-BR'] && p.factionVariants.human?.text?.en &&
        p.factionVariants.orc?.text?.['pt-BR'] && p.factionVariants.orc?.text?.en;

      if (!hasDirectText && !hasFactionVariants) {
        errors.push(`${prefix} must contain bilingual text (pt-BR and en) or complete factionVariants`);
      }
    });
  }

  if (data.titleCard) {
    if (!data.titleCard.text?.['pt-BR'] || !data.titleCard.text?.en) {
      errors.push('titleCard must contain bilingual text (pt-BR and en)');
    }
  }

  return { ok: errors.length === 0, errors };
}

/**
 * URL do slot de arte final de um painel de história.
 * @param {string} artId
 * @param {string} base
 * @returns {string}
 */
export function storyArtUrl(artId, base = '/') {
  const clean = artId.startsWith('panel-') ? artId : `panel-${artId}`;
  return `${base}ui/art/story/${clean}.webp`;
}

export class CampaignStoryModel {
  /**
   * @param {object} opts
   * @param {object} opts.storyData Dados validados de world.json
   * @param {string} [opts.campaignId] ID da campanha (ex: 'war-alliance', 'war-horde')
   * @param {'human'|'orc'} [opts.faction] Facção atual
   * @param {CampaignProgress} [opts.progress] Instância de progresso
   * @param {object} [opts.storage] Storage alternativo (ex: memoryStorage)
   * @param {boolean} [opts.autoAdvance] Se inicia com autoavanço ativo
   * @param {boolean} [opts.includeTitleCard] Se inclui cartão de título ao final
   */
  constructor({
    storyData,
    campaignId = 'war-alliance',
    faction = 'human',
    progress = null,
    storage = null,
    autoAdvance = false,
    includeTitleCard = true
  }) {
    this.storyData = storyData;
    this.campaignId = campaignId;
    this.faction = faction || (campaignId.includes('horde') ? 'orc' : 'human');
    this.progress = progress || new CampaignProgress(storage || memoryStorage());
    this.autoAdvance = autoAdvance;
    this.includeTitleCard = includeTitleCard;

    this.panels = this._resolvePanels();
    this.narrativeCount = storyData?.panels?.length || 0;
    this.totalCount = this.panels.length;
    this.currentIndex = 0;
    this.isCompleted = false;
  }

  _resolvePanels() {
    if (!this.storyData?.panels) return [];
    const resolved = this.storyData.panels.map((p, idx) => {
      const variant = p.factionVariants?.[this.faction];
      return {
        id: p.id,
        index: idx,
        art: variant?.art || p.art,
        seconds: variant?.seconds || p.seconds || 10,
        text: variant?.text || p.text,
        music: p.music || null,
        sfx: p.sfx || null,
        isTitle: false
      };
    });

    if (this.includeTitleCard && this.storyData.titleCard) {
      const tc = this.storyData.titleCard;
      resolved.push({
        id: tc.id || 'title',
        index: resolved.length,
        art: tc.art || 'title',
        seconds: tc.seconds || 6,
        text: tc.text || this.storyData.title,
        title: this.storyData.title,
        isTitle: true
      });
    }

    return resolved;
  }

  get currentPanel() {
    return this.panels[this.currentIndex] || null;
  }

  get isFirst() {
    return this.currentIndex === 0;
  }

  get isLast() {
    return this.currentIndex === this.totalCount - 1;
  }

  get isTitle() {
    return !!this.currentPanel?.isTitle;
  }

  /**
   * Avança para o próximo painel. Retorna true se avançou, ou false se chegou ao final.
   */
  next() {
    if (this.currentIndex < this.totalCount - 1) {
      this.currentIndex += 1;
      return true;
    }
    this.isCompleted = true;
    this.markSeen();
    return false;
  }

  /**
   * Volta para o painel anterior.
   */
  prev() {
    if (this.currentIndex > 0) {
      this.currentIndex -= 1;
      return true;
    }
    return false;
  }

  /**
   * Pula toda a história.
   */
  skip() {
    this.currentIndex = this.totalCount - 1;
    this.isCompleted = true;
    this.markSeen();
    return true;
  }

  /**
   * Pula para um índice específico.
   */
  goTo(idx) {
    if (idx >= 0 && idx < this.totalCount) {
      this.currentIndex = idx;
      return true;
    }
    return false;
  }

  getDuration(idx = this.currentIndex) {
    return this.panels[idx]?.seconds || 10;
  }

  setAutoAdvance(enabled) {
    this.autoAdvance = !!enabled;
  }

  isFirstTime(cid = this.campaignId) {
    return CampaignStoryModel.isFirstTime(cid, this.progress);
  }

  markSeen(cid = this.campaignId) {
    CampaignStoryModel.markSeen(cid, this.progress);
  }

  static isFirstTime(cid, storageOrProgress) {
    if (!cid) return true;
    if (storageOrProgress instanceof CampaignProgress) {
      return !storageOrProgress.isStorySeen(cid);
    }
    const prog = new CampaignProgress(storageOrProgress || memoryStorage());
    return !prog.isStorySeen(cid);
  }

  static markSeen(cid, storageOrProgress) {
    if (!cid) return;
    if (storageOrProgress instanceof CampaignProgress) {
      storageOrProgress.markStorySeen(cid);
      return;
    }
    const prog = new CampaignProgress(storageOrProgress || memoryStorage());
    prog.markStorySeen(cid);
  }
}
