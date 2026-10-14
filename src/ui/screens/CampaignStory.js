/**
 * src/ui/screens/CampaignStory.js
 * Componente de tela cheia para exibição dos painéis narrativos da história de Ondara
 * (MUNDO-HISTORIA-CAMPANHA §2, §7.2).
 */
import './campaignStory.css';
import defaultStoryData from '../../data/story/world.json';
import { CampaignStoryModel, storyArtCandidates } from '../campaignStoryModel.js';
import { t, getLanguage, onLanguageChange } from '../../i18n/index.js';
import { localize } from '../../sim/missions/text.js';

const BASE = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL) || '/';

const esc = (s) => String(s || '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[c]);

export class CampaignStory {
  /**
   * @param {object} o
   * @param {object} [o.storyData] Dados de world.json
   * @param {string} [o.campaignId] ID da campanha (ex: 'war-alliance', 'war-horde')
   * @param {'human'|'orc'} [o.faction] Facção
   * @param {import('../../campaign/progress.js').CampaignProgress} [o.progress]
   * @param {(actionId: 'done'|'skip') => void} [o.onAction] Callback ao finalizar ou pular
   * @param {() => void} [o.onClose] Callback ao fechar
   * @param {HTMLElement} [parent] Elemento pai
   */
  constructor({
    storyData = defaultStoryData,
    campaignId = 'war-alliance',
    faction = 'human',
    progress = null,
    onAction = null,
    onClose = null
  } = {}, parent = typeof document !== 'undefined' ? document.body : null) {
    this.storyData = storyData;
    this.campaignId = campaignId;
    this.faction = faction || (campaignId.includes('horde') ? 'orc' : 'human');
    this.progress = progress;
    this.onAction = onAction;
    this.onClose = onClose;
    this.parent = parent;

    this.model = new CampaignStoryModel({
      storyData: this.storyData,
      campaignId: this.campaignId,
      faction: this.faction,
      progress: this.progress,
      autoAdvance: true
    });

    this.root = null;
    this._timer = null;
    this._offLang = null;
    this._artCache = new Map();

    this._onKey = (e) => {
      if (!this.isOpen) return;
      if (e.code === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this.skip();
      } else if (e.code === 'Space' || e.code === 'Enter' || e.code === 'ArrowRight') {
        e.preventDefault();
        e.stopPropagation();
        this.next();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        e.stopPropagation();
        this.prev();
      }
    };
  }

  get isOpen() {
    return !!this.root;
  }

  open() {
    if (this.root || !this.parent) return;

    const root = document.createElement('div');
    root.className = 'story-screen';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', t('story.title'));

    root.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-story]');
      if (btn) {
        const act = btn.dataset.story;
        if (act === 'next') this.next();
        else if (act === 'prev') this.prev();
        else if (act === 'skip') this.skip();
        return;
      }
      const dot = e.target.closest('[data-story-dot]');
      if (dot) {
        const idx = Number(dot.dataset.storyDot);
        if (!Number.isNaN(idx)) {
          this._stopAutoAdvance();
          this.model.goTo(idx);
          this._render();
        }
      }
    });

    this.parent.appendChild(root);
    this.root = root;
    document.addEventListener('keydown', this._onKey, true);
    this._offLang = onLanguageChange(() => this._render());

    this._render();
    this._scheduleAutoAdvance();
  }

  close() {
    this._clearTimer();
    if (!this.root) return;
    document.removeEventListener('keydown', this._onKey, true);
    this._offLang?.();
    this._offLang = null;
    this.root.remove();
    this.root = null;
    this.onClose?.();
  }

  next() {
    this._stopAutoAdvance();
    const hasMore = this.model.next();
    if (!hasMore) {
      this._finish('done');
      return;
    }
    this._render();
    this._scheduleAutoAdvance();
  }

  prev() {
    this._stopAutoAdvance();
    if (this.model.prev()) {
      this._render();
      this._scheduleAutoAdvance();
    }
  }

  skip() {
    this._clearTimer();
    this.model.skip();
    this._finish('skip');
  }

  _finish(action) {
    this.close();
    this.onAction?.(action);
  }

  _clearTimer() {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
  }

  _stopAutoAdvance() {
    this.model.setAutoAdvance(false);
    this._clearTimer();
  }

  _scheduleAutoAdvance() {
    this._clearTimer();
    if (!this.model.autoAdvance) return;
    const durSec = this.model.getDuration();
    this._timer = setTimeout(() => {
      if (this.isOpen) {
        this.next();
      }
    }, durSec * 1000);
  }

  _render() {
    if (!this.root) return;
    const lang = getLanguage();
    const panel = this.model.currentPanel;
    if (!panel) return;

    const isTitle = this.model.isTitle;
    const narrativeIndex = isTitle ? this.model.narrativeCount - 1 : this.model.currentIndex;

    // Indicadores visuais de progresso (7 pontos)
    const dots = Array.from({ length: this.model.narrativeCount }).map((_, i) => {
      let cls = 'story-dot';
      if (i === narrativeIndex) cls += ' is-active';
      else if (i < narrativeIndex || isTitle) cls += ' is-passed';
      return `<button type="button" class="${cls}" data-story-dot="${i}" aria-label="${esc(t('story.panel', { current: i + 1, total: this.model.narrativeCount }))}"></button>`;
    }).join('');

    const textStr = localize(panel.text, lang);
    const titleStr = localize(this.storyData.title, lang);

    // Corpo central: texto ou título
    let mainContent = '';
    if (isTitle) {
      mainContent = `
        <div class="story-title-card">
          <h1 class="story-main-title">${esc(titleStr)}</h1>
          <p class="story-subtitle">${esc(textStr !== titleStr ? textStr : '')}</p>
        </div>
      `;
    }

    const nextLabel = this.model.isLast ? esc(t('story.start')) : esc(t('story.next'));
    const prevDisabled = this.model.isFirst ? 'disabled' : '';

    this.root.innerHTML = `
      <div class="story-bg" id="story-art-container">
        <div class="story-fallback" id="story-art-fallback">
          ${this._renderFallbackSvg(panel.id)}
        </div>
        <div class="story-shade"></div>
      </div>

      <header class="story-header">
        <span class="story-brand">${esc(titleStr)}</span>
        <button type="button" class="story-skip-btn" data-story="skip">${esc(t('story.skip'))} [Esc]</button>
      </header>

      ${mainContent}

      <footer class="story-footer">
        ${!isTitle ? `
          <div class="story-caption-band">
            <p class="story-caption-text">${esc(textStr)}</p>
          </div>
        ` : ''}

        <div class="story-progress" role="tablist">
          ${dots}
        </div>

        <nav class="story-nav">
          <button type="button" class="story-btn" data-story="prev" ${prevDisabled}>
            ${esc(t('story.prev'))}
          </button>
          <button type="button" class="story-btn story-btn--primary" data-story="next">
            ${nextLabel}
          </button>
        </nav>
      </footer>
    `;

    this._tryLoadArt(panel.art);
  }

  _renderFallbackSvg(panelId) {
    return `
      <svg class="story-fallback-canvas" viewBox="0 0 1920 1080" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
        <defs>
          <radialGradient id="vignette" cx="50%" cy="50%" r="60%">
            <stop offset="40%" stop-color="#141c2b" stop-opacity="0.3"/>
            <stop offset="100%" stop-color="#020408" stop-opacity="0.95"/>
          </radialGradient>
          <pattern id="grid" width="120" height="120" patternUnits="userSpaceOnUse">
            <path d="M 120 0 L 0 0 0 120" fill="none" stroke="rgba(212,175,55,0.06)" stroke-width="1"/>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="#0a1019"/>
        <rect width="100%" height="100%" fill="url(#grid)"/>
        <!-- Rosa dos ventos decorativa de fundo -->
        <g transform="translate(960, 540)" opacity="0.12">
          <circle r="360" fill="none" stroke="#d4af37" stroke-width="2"/>
          <circle r="220" fill="none" stroke="#d4af37" stroke-width="1.5" stroke-dasharray="6,6"/>
          <polygon points="0,-320 30,-50 0,0 -30,-50" fill="#d4af37"/>
          <polygon points="0,320 30,50 0,0 -30,50" fill="#d4af37"/>
          <polygon points="-320,0 -50,30 0,0 -50,-30" fill="#d4af37"/>
          <polygon points="320,0 50,30 0,0 50,-30" fill="#d4af37"/>
        </g>
        <rect width="100%" height="100%" fill="url(#vignette)"/>
      </svg>
    `;
  }

  _tryLoadArt(artId) {
    if (!artId || typeof Image === 'undefined') return;
    const candidates = storyArtCandidates(artId, BASE);
    const container = this.root?.querySelector('#story-art-container');
    if (!container) return;

    const tryNext = (idx) => {
      if (idx >= candidates.length) return;
      const url = candidates[idx];
      if (this._artCache.get(url) === 'failed') {
        tryNext(idx + 1);
        return;
      }

      const img = new Image();
      img.src = url;
      img.className = 'story-art';
      img.onload = () => {
        this._artCache.set(url, 'loaded');
        const fallback = container.querySelector('#story-art-fallback');
        if (fallback) fallback.style.display = 'none';
        container.prepend(img);
      };
      img.onerror = () => {
        this._artCache.set(url, 'failed');
        tryNext(idx + 1);
      };
    };

    tryNext(0);
  }
}
