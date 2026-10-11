// src/ui/screens/CampaignVictory.js
// Tela FINAL da campanha (vitória na última missão): ilustração de vitória da facção vencedora (arte final
// `public/ui/art/victory_<facção>.webp` se existir; senão SVG procedural), título "VITÓRIA", epílogo da história em
// sequência, estatísticas e botões. Esc ou clique pula as animações. Modelo puro em ../campaignVictoryModel.js.
import './campaignVictory.css';
import { t, getLanguage, onLanguageChange } from '../../i18n/index.js';
import { buildCampaignVictoryModel, victoryArtUrl } from '../campaignVictoryModel.js';
import { buildVictorySvg, buildSparks } from '../campaignVictoryArt.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const BASE = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL) || '/';
const T_TITLE = 500; // ms até o "VITÓRIA"
const T_EP_TITLE = 2600; // título do epílogo
const T_PARA0 = 3800; // primeiro parágrafo
const T_PARA = 3200; // intervalo entre parágrafos

export class CampaignVictory {
  /**
   * @param {object} o
   * @param {object} o.def  campanha
   * @param {object} o.plan  campaignEndPlan
   * @param {object} [o.completed]  progresso da tentativa atual
   * @param {object|null} [o.sound]  SoundManager (opcional: sem som a tela funciona igual)
   * @param {(actionId:'menu'|'replay'|'stats') => void} o.onAction
   */
  constructor({ def, plan, completed = null, sound = null, onAction }, parent = document.body) {
    this.def = def;
    this.plan = plan;
    this.completed = completed;
    this.sound = sound;
    this.onAction = onAction;
    this.parent = parent;
    this.root = null;
    this.timers = [];
    this.revealed = false;
    this._offLang = null;
    this._onKey = (e) => {
      if (e.code === 'Escape') { e.preventDefault(); e.stopPropagation(); this.skip(); }
    };
  }

  get isOpen() { return !!this.root; }

  _model() {
    const lang = getLanguage() === 'en' ? 'en' : 'pt-BR';
    return buildCampaignVictoryModel({ def: this.def, plan: this.plan, completed: this.completed, lang });
  }

  open() {
    if (this.root) return;
    this.root = document.createElement('div');
    this.root.className = 'cv';
    this.root.id = 'campaign-victory';
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.setAttribute('aria-labelledby', 'cv-title');
    this.root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-cv]');
      if (b) { this._act(b.dataset.cv); return; }
      this.skip();
    });
    this.parent.appendChild(this.root);
    document.addEventListener('keydown', this._onKey, true);
    this._render();
    this._loadArt();
    this._offLang = onLanguageChange(() => { this.revealed = true; this._clear(); this._render(); }); // idioma novo: mostra tudo já
    this._playFanfare();
    if (this._reducedMotion()) this.skip();
    else this._schedule();
  }

  close() {
    this._clear();
    clearTimeout(this._calm);
    document.removeEventListener('keydown', this._onKey, true);
    this._offLang?.();
    this._offLang = null;
    this.root?.remove();
    this.root = null;
  }

  _reducedMotion() {
    try { return !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
  }

  _clear() { this.timers.forEach(clearTimeout); this.timers = []; }

  _act(id) {
    if (id === 'stats') this.close();
    this.onAction?.(id);
  }

  _render() {
    const m = this._model();
    this.model = m;
    const root = this.root;
    root.className = `cv cv--${m.faction}${this.revealed ? ' is-all' : ''}${this.hasArt ? ' cv--has-art' : ''}`;
    const paras = m.generic
      ? `<p class="cv-p" data-step="p">${esc(t('campaign.end.complete'))}</p>`
      : m.paragraphs.map((p) => `<p class="cv-p" data-step="p">${esc(p)}</p>`).join('');
    const stats = m.stats
      ? `<p class="cv-stats" data-step="end">${esc(t('campaign.victory.stats', { done: m.stats.missions, total: m.stats.total }))}${m.stats.time ? ` · ${esc(t('mission.time'))}: ${esc(m.stats.time)}` : ''}</p>`
      : '';
    root.innerHTML = `<div class="cv-bg" aria-hidden="true">${buildVictorySvg(m.faction)}<div class="cv-sparks">${buildSparks(m.faction)}</div></div>`
      + '<div class="cv-shade" aria-hidden="true"></div>'
      + '<div class="cv-content">'
      + `<h1 id="cv-title" class="cv-title" data-step="title">${esc(t(m.titleKey))}</h1>`
      + `<div class="cv-story">${m.epilogueTitle ? `<h2 class="cv-ep" data-step="ep">${esc(m.epilogueTitle)}</h2>` : ''}${paras}`
      + `${m.credits ? `<p class="cv-credits" data-step="end">${esc(m.credits)}</p>` : ''}</div>`
      + `${stats}<div class="cv-actions" data-step="end">${m.actions.map((a) => `<button type="button" class="cv-btn${a.primary ? ' cv-btn--primary' : ''}" data-cv="${a.id}">${esc(t(a.labelKey))}</button>`).join('')}</div>`
      + `<p class="cv-hint" data-step="hint">${esc(t('campaign.victory.skip'))}</p></div>`;
    if (this.hasArt) this._mountArt();
    if (this.revealed) this.root.querySelector('.cv-btn--primary')?.focus({ preventScroll: true });
  }

  /** Revela os passos em sequência (título, título do epílogo, parágrafos, estatísticas/botões). */
  _schedule() {
    const q = (sel) => [...this.root.querySelectorAll(sel)];
    const show = (el) => el?.classList.add('is-in');
    const at = (ms, fn) => this.timers.push(setTimeout(fn, ms));
    at(T_TITLE, () => show(this.root.querySelector('[data-step="title"]')));
    at(T_EP_TITLE, () => show(this.root.querySelector('[data-step="ep"]')));
    const paras = q('[data-step="p"]');
    paras.forEach((p, i) => at(T_PARA0 + i * T_PARA, () => show(p)));
    at(T_PARA0 + paras.length * T_PARA, () => this.skip());
  }

  /** Mostra tudo agora (Esc/clique/movimento reduzido) e põe o foco no botão principal. */
  skip() {
    if (!this.root || this.revealed) return;
    this.revealed = true;
    this._clear();
    this.root.classList.add('is-all');
    this.root.querySelector('.cv-btn--primary')?.focus({ preventScroll: true });
  }

  /** Slot de arte final: só usa `victory_<facção>.webp` se o arquivo carregar; do contrário fica o SVG procedural. */
  _loadArt() {
    if (typeof Image === 'undefined') return;
    const faction = this.model.faction;
    const img = new Image();
    img.onload = () => {
      if (!this.root) return;
      this.hasArt = true;
      this.artSrc = img.src;
      this._mountArt();
    };
    img.onerror = () => { this.hasArt = false; };
    img.src = victoryArtUrl(faction, BASE);
  }

  _mountArt() {
    const bg = this.root?.querySelector('.cv-bg');
    if (!bg || bg.querySelector('.cv-art')) return;
    const im = document.createElement('img');
    im.className = 'cv-art';
    im.alt = '';
    im.src = this.artSrc || victoryArtUrl(this.model.faction, BASE);
    bg.prepend(im);
    this.root.classList.add('cv--has-art');
  }

  _playFanfare() {
    const s = this.sound;
    if (!s) return;
    try {
      s.playSfx?.(this.model.faction === 'orc' ? 'victoryFanfareOrc' : 'victoryFanfareHuman');
      this._calm = setTimeout(() => { try { s.calmMusic?.(); } catch { /* sem áudio */ } }, 2600);
    } catch { /* sem áudio: a tela funciona igual */ }
  }
}
