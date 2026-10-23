// src/ui/screens/CampaignSelectScreen.js (M2-34) — Menu > "Campanha": tela só de escolha entre as campanhas
// (Liga de Aurelan × Clãs do Cinzal). Ao escolher, `onPick(campaignId)`; Esc / "Voltar" chama `onClose`.
import './campaignSelect.css';
import { t, getLanguage, onLanguageChange } from '../../i18n/index.js';
import { listCampaigns } from '../../data/campaigns/index.js';
import { getProgress } from '../../campaign/index.js';
import { buildEmblemSvg } from '../campaignVictoryArt.js';
import { buildCampaignCards, nextFocusIndex } from '../campaignSelectModel.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export class CampaignSelectScreen {
  /**
   * @param {object} o
   * @param {(campaignId: string) => void} o.onPick
   * @param {() => void} [o.onClose]
   * @param {boolean} [o.unlockAll]  `?campaign=unlock`
   * @param {string|null} [o.param]  valor de `?campaign=`
   */
  constructor({ onPick, onClose = null, progress = null, unlockAll = false, param = null }, parent = document.body) {
    this.onPick = onPick;
    this.onClose = onClose;
    this.progress = progress || getProgress();
    this.unlockAll = unlockAll;
    this.param = param;
    this.parent = parent;
    this.root = null;
    this._offLang = null;
    this._onKey = (e) => {
      if (e.code === 'Escape') { e.preventDefault(); e.stopPropagation(); this.close(); return; }
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) return;
      const cards = [...this.root.querySelectorAll('.cs-card')];
      if (!cards.length) return;
      e.preventDefault(); e.stopPropagation();
      const cur = cards.indexOf(document.activeElement);
      cards[nextFocusIndex(cur < 0 ? 0 : cur, e.key, cards.length)]?.focus();
    };
  }

  get isOpen() { return !!this.root; }

  open() {
    if (this.root) return;
    const root = document.createElement('div');
    root.className = 'cs-overlay';
    root.addEventListener('click', (e) => {
      const el = e.target.closest('[data-cs]');
      if (!el) return;
      if (el.dataset.cs === 'back') return this.close();
      if (el.dataset.cs === 'pick' && el.getAttribute('aria-disabled') !== 'true') this._pick(el.dataset.id);
    });
    this.parent.appendChild(root);
    this.root = root;
    document.addEventListener('keydown', this._onKey, true);
    this._offLang = onLanguageChange(() => this._render());
    this._render();
  }

  _pick(id) {
    this._detach();
    this.onPick?.(id);
  }

  _detach() {
    if (!this.root) return;
    document.removeEventListener('keydown', this._onKey, true);
    this._offLang?.();
    this._offLang = null;
    this.root.remove();
    this.root = null;
  }

  close() {
    if (!this.root) return;
    this._detach();
    this.onClose?.();
  }

  _card(c, big) {
    const name = c.title || t(`campaign.select.name.${c.id}`);
    const tag = c.beta ? '' : t(`campaign.select.tagline.${c.id}`);
    const premise = tag && !tag.startsWith('campaign.select.tagline.') ? tag : c.premise;
    const pct = c.total ? Math.round((c.done / c.total) * 100) : 0;
    const badge = c.comingSoon ? `<span class="cs-badge cs-badge--soon">${esc(t('campaign.select.soon'))}</span>`
      : c.beta ? `<span class="cs-badge">${esc(t('campaign.select.beta'))}</span>` : '';
    return `<button type="button" class="cs-card cs-card--${c.faction}${big ? '' : ' cs-card--small'}" data-cs="pick" data-id="${esc(c.id)}"`
      + `${c.playable ? '' : ` aria-disabled="true" title="${esc(t('campaign.select.soonHint'))}"`}>`
      + `<span class="cs-card__top">${badge}<span class="cs-side">${esc(t(`campaign.select.side.${c.faction}`))}</span></span>`
      + `<span class="cs-emblem">${buildEmblemSvg(c.faction)}</span>`
      + `<span class="cs-name">${esc(name)}</span>`
      + (c.subtitle ? `<span class="cs-sub">${esc(c.subtitle)}</span>` : '')
      + `<span class="cs-premise">${esc(premise)}</span>`
      + `<span class="cs-progress"><span class="cs-bar"><span style="width:${pct}%"></span></span>`
      + `<span class="cs-count">${esc(t('campaign.select.progress', { done: c.done, total: c.total }))}</span></span>`
      + `</button>`;
  }

  _render() {
    if (!this.root) return;
    const lang = getLanguage() === 'en' ? 'en' : 'pt-BR';
    const { main, beta } = buildCampaignCards(listCampaigns(), this.progress, { lang, unlockAll: this.unlockAll, param: this.param });
    const focused = this.root.querySelector('.cs-card:focus')?.dataset.id;
    this.root.innerHTML = `<div class="cs-screen" role="dialog" aria-modal="true" aria-labelledby="cs-title">`
      + `<h2 id="cs-title" class="cs-title">${esc(t('campaign.select.title'))}</h2>`
      + `<p class="cs-subtitle">${esc(t('campaign.select.subtitle'))}</p>`
      + `<div class="cs-cards" role="group" aria-labelledby="cs-title">${main.map((c) => this._card(c, true)).join('')}</div>`
      + (beta.length ? `<div class="cs-beta">${beta.map((c) => this._card(c, false)).join('')}</div>` : '')
      + `<p class="cs-hint">${esc(t('campaign.select.hint'))}</p>`
      + `<button type="button" class="cs-back" data-cs="back">${esc(t('campaign.select.back'))}</button></div>`;
    const target = (focused && this.root.querySelector(`.cs-card[data-id="${CSS.escape(focused)}"]`))
      || this.root.querySelector('.cs-card:not([aria-disabled="true"])') || this.root.querySelector('.cs-card');
    target?.focus({ preventScroll: true });
  }
}
