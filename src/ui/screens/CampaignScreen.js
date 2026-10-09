// src/ui/screens/CampaignScreen.js
// F8-05 · Menu principal > "Campanha": escolha da campanha, premissa (marcada PROVISÓRIA), lista de missões com estado
// (bloqueada / disponível / concluída), briefing e "Iniciar/Continuar"; "Nova tentativa" zera o progresso da campanha
// (as tentativas anteriores ficam gravadas). Reaproveita o estilo do briefing de missões (mission.css).
import './mission.css';
import { t, getLanguage, onLanguageChange } from '../../i18n/index.js';
import { listCampaigns } from '../../data/campaigns/index.js';
import { getMission } from '../../data/missions/index.js';
import { localize } from '../../sim/missions/text.js';
import { getProgress, nextMission } from '../../campaign/index.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export class CampaignScreen {
  /**
   * @param {object} o
   * @param {(campaignId: string, missionId: string) => void} o.onStart  o jogador confirmou "Iniciar missão"
   * @param {() => void} [o.onClose]
   * @param {import('../../campaign/progress.js').CampaignProgress} [o.progress]
   * @param {boolean} [o.unlockAll]  depuração: `?campaign=unlock`
   */
  constructor({ onStart, onClose = null, progress = null, unlockAll = false }, parent = document.body) {
    this.onStart = onStart;
    this.onClose = onClose;
    this.progress = progress || getProgress();
    this.unlockAll = unlockAll;
    this.parent = parent;
    this.root = null;
    this.campaignId = null;
    this.selected = null;
    this._onKey = (e) => {
      if (e.code === 'Escape') { e.preventDefault(); e.stopPropagation(); this.close(); }
    };
    this._offLang = null;
  }

  get isOpen() { return !!this.root; }

  _def() { return listCampaigns().find((c) => c.id === this.campaignId) || null; }

  open() {
    if (this.root) return;
    const camps = listCampaigns();
    if (!this.campaignId || !camps.some((c) => c.id === this.campaignId)) this.campaignId = camps[0] ? camps[0].id : null;
    this._pickDefault();
    const root = document.createElement('div');
    root.className = 'ms-brief-overlay';
    root.addEventListener('click', (e) => {
      if (e.target === root) return this.close();
      const el = e.target.closest('[data-cp]');
      if (!el || el.disabled) return;
      const act = el.dataset.cp;
      if (act === 'pick') { this.selected = el.dataset.id; this._render(); }
      else if (act === 'start') this.onStart?.(this.campaignId, this.selected);
      else if (act === 'new') { this.progress.newAttempt(this.campaignId); this._pickDefault(); this._render(); }
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

  /** Seleciona a próxima missão disponível (ou a primeira se a campanha acabou). */
  _pickDefault() {
    const def = this._def();
    if (!def) { this.selected = null; return; }
    const opts = { unlockAll: this.unlockAll };
    this.selected = nextMission(def, this.progress.completed(def.id), opts) || def.missions[0].id;
  }

  _render() {
    if (!this.root) return;
    const lang = getLanguage();
    const def = this._def();
    if (!def) {
      this.root.innerHTML = `<div class="ms-brief" role="dialog" aria-modal="true"><div class="ms-brief-main"><p>${esc(t('campaign.none'))}</p><div class="ms-brief-actions"><button type="button" data-cp="back">${esc(t('mission.back'))}</button></div></div></div>`;
      return;
    }
    const completed = this.progress.completed(def.id);
    const opts = { unlockAll: this.unlockAll };
    const list = def.missions.map((entry, i) => {
      const m = getMission(entry.id);
      const st = this.progress.status(def, entry.id, opts);
      const mark = st === 'completed' ? '✔' : st === 'locked' ? '🔒' : '▶';
      return `<button type="button" class="ms-brief-item" data-cp="pick" data-id="${esc(entry.id)}" data-status="${st}" aria-current="${entry.id === this.selected}">`
        + `<span aria-hidden="true">${mark}</span> ${i + 1}. ${esc(localize(m.title, lang))}</button>`;
    }).join('');

    const m = getMission(this.selected);
    const entry = def.missions.find((e) => e.id === this.selected);
    const st = this.progress.status(def, this.selected, opts);
    let main = '';
    if (m) {
      const obj = (priority) => m.objectives.filter((o) => (o.priority ?? 'primary') === priority).map((o) => `<li>${esc(localize(o.title, lang))}</li>`).join('');
      const prim = obj('primary');
      const sec = obj('secondary');
      const rec = completed[this.selected];
      const carry = entry.carryOver && entry.requires && entry.requires.length ? `<p class="ms-brief-sub">${esc(t('campaign.carry'))}</p>` : '';
      main = `<h3>${esc(localize(m.title, lang))}</h3>`
        + `<p class="ms-brief-sub">${esc(t(`campaign.status.${st}`))}${rec ? ` · ${esc(t('mission.time'))}: ${fmtTime(rec.seconds)}` : ''}</p>`
        + `<div class="ms-brief-talk"><div class="ms-portrait" aria-hidden="true">${esc(m.briefing.portrait || '📜')}</div><div class="ms-say">`
        + (m.briefing.speaker ? `<span class="ms-speaker">${esc(localize(m.briefing.speaker, lang))}</span>` : '')
        + `<p>${esc(localize(m.briefing.text, lang))}</p></div></div>`
        + `<div><h4 class="ms-h">${esc(t('mission.primary'))}</h4><ul class="ms-brief-hints">${prim}</ul>`
        + (sec ? `<h4 class="ms-h">${esc(t('mission.secondary'))}</h4><ul class="ms-brief-hints">${sec}</ul>` : '') + '</div>'
        + carry
        + `<div class="ms-brief-actions"><button type="button" class="ms-primary" data-cp="start"${st === 'locked' ? ' disabled' : ''}>${esc(t(st === 'completed' ? 'mission.replay' : 'campaign.play'))}</button>`
        + `<button type="button" data-cp="new">${esc(t('campaign.newAttempt'))}</button><button type="button" data-cp="back">${esc(t('mission.back'))}</button></div>`;
    }
    const prov = def.provisional ? `<span class="ms-badge-prov" title="${esc(t('campaign.provisionalHint'))}">${esc(t('campaign.provisional'))}</span>` : '';
    const attempt = t('campaign.attempt', { n: this.progress.attemptNumber(def.id) });
    this.root.innerHTML = `<div class="ms-brief" role="dialog" aria-modal="true" aria-labelledby="cp-title">`
      + `<div class="ms-brief-list"><h2 id="cp-title">${esc(localize(def.title, lang))}</h2>${prov}`
      + `<p class="ms-brief-sub">${esc(attempt)}</p>${list}</div>`
      + `<div class="ms-brief-main"><p class="ms-brief-talk">${esc(localize(def.premise, lang))}</p>${main}</div></div>`;
    this.root.querySelector('[data-cp="start"]:not([disabled])')?.focus({ preventScroll: true });
  }
}
