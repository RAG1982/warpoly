// src/ui/screens/MissionBriefing.js
// F8-04 · Menu principal > "Missões": lista as missões e mostra o briefing (retrato provisório por emoji, texto,
// objetivos primários/secundários — os ocultos não aparecem) antes de iniciar. Textos da missão vêm do JSON (pt-BR/en).
import './mission.css';
import { t, getLanguage, onLanguageChange } from '../../i18n/index.js';
import { listMissions } from '../../data/missions/index.js';
import { localize } from '../../sim/missions/text.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export class MissionBriefing {
  /**
   * @param {object} o
   * @param {(missionId: string) => void} o.onStart  o jogador confirmou "Iniciar missão"
   * @param {() => void} [o.onClose]
   */
  constructor({ onStart, onClose = null }, parent = document.body) {
    this.onStart = onStart;
    this.onClose = onClose;
    this.parent = parent;
    this.root = null;
    this.selected = null;
    this._onKey = (e) => {
      if (e.code === 'Escape') { e.preventDefault(); e.stopPropagation(); this.close(); }
    };
    this._offLang = null;
  }

  get isOpen() { return !!this.root; }

  open() {
    if (this.root) return;
    const missions = listMissions();
    this.selected = this.selected && missions.some((m) => m.id === this.selected) ? this.selected : (missions[0] && missions[0].id) || null;
    const root = document.createElement('div');
    root.className = 'ms-brief-overlay';
    root.addEventListener('click', (e) => {
      if (e.target === root) return this.close();
      const el = e.target.closest('[data-ms]');
      if (!el) return;
      const act = el.dataset.ms;
      if (act === 'pick') { this.selected = el.dataset.id; this._render(); }
      else if (act === 'start') this.onStart?.(this.selected);
      else if (act === 'back') this.close();
    });
    this.parent.appendChild(root);
    this.root = root;
    document.addEventListener('keydown', this._onKey, true);
    this._offLang = onLanguageChange(() => this._render());
    this._render();
  }

  close() {
    if (!this.root) return;
    document.removeEventListener('keydown', this._onKey, true);
    this._offLang?.();
    this._offLang = null;
    this.root.remove();
    this.root = null;
    this.onClose?.();
  }

  _render() {
    if (!this.root) return;
    const lang = getLanguage();
    const missions = listMissions();
    const m = missions.find((x) => x.id === this.selected);
    const list = missions.map((x) => `<button type="button" class="ms-brief-item" data-ms="pick" data-id="${esc(x.id)}" aria-current="${x.id === this.selected}">${esc(localize(x.title, lang))}</button>`).join('');
    let main = `<p>${esc(t('mission.none'))}</p>`;
    if (m) {
      const obj = (priority) => m.objectives.filter((o) => (o.priority ?? 'primary') === priority).map((o) => `<li>${esc(localize(o.title, lang))}</li>`).join('');
      const prim = obj('primary');
      const sec = obj('secondary');
      const hints = (m.briefing.hints || []).map((h) => `<li>${esc(localize(h, lang))}</li>`).join('');
      main = `<h3>${esc(localize(m.title, lang))}</h3>`
        + (m.subtitle ? `<p class="ms-brief-sub">${esc(localize(m.subtitle, lang))}</p>` : '')
        + `<div class="ms-brief-talk"><div class="ms-portrait" aria-hidden="true">${esc(m.briefing.portrait || '📜')}</div><div class="ms-say">`
        + (m.briefing.speaker ? `<span class="ms-speaker">${esc(localize(m.briefing.speaker, lang))}</span>` : '')
        + `<p>${esc(localize(m.briefing.text, lang))}</p></div></div>`
        + `<div><h4 class="ms-h">${esc(t('mission.primary'))}</h4><ul class="ms-brief-hints">${prim}</ul>`
        + (sec ? `<h4 class="ms-h">${esc(t('mission.secondary'))}</h4><ul class="ms-brief-hints">${sec}</ul>` : '') + '</div>'
        + (hints ? `<ul class="ms-brief-hints">${hints}</ul>` : '')
        + `<div class="ms-brief-actions"><button type="button" class="ms-primary" data-ms="start">${esc(t('mission.start'))}</button><button type="button" data-ms="back">${esc(t('mission.back'))}</button></div>`;
    }
    this.root.innerHTML = `<div class="ms-brief" role="dialog" aria-modal="true" aria-labelledby="ms-brief-title">`
      + `<div class="ms-brief-list"><h2 id="ms-brief-title">${esc(t('mission.listTitle'))}</h2>${list}</div><div class="ms-brief-main">${main}</div></div>`;
    this.root.querySelector('[data-ms="start"]')?.focus({ preventScroll: true });
  }
}
