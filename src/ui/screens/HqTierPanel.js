// src/ui/screens/HqTierPanel.js
// M3-03a · "Centro evoluído: <nível>": lista o que o novo nível libera, no mesmo visual do bloco "Novo nesta missão"
// do briefing (classes `ms-brief*` de mission.css e `unlockNames` de techText.js). NÃO pausa a simulação nem cobre o
// jogo: é um cartão lateral; fecha com o botão, clique no cartão ou Esc (Esc não chega ao menu de pausa).
import './mission.css';
import { t } from '../../i18n/index.js';
import { unlockNames } from '../techText.js';
import { TECH_KINDS } from '../../sim/techRestriction.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export class HqTierPanel {
  constructor(parent = document.body) {
    this.parent = parent;
    this.root = null;
    this._onKey = (e) => {
      if (e.code === 'Escape') { e.preventDefault(); e.stopPropagation(); this.close(); }
    };
  }

  get isOpen() { return !!this.root; }

  /**
   * @param {object} o
   * @param {string} o.title       "Centro evoluído: Fortaleza"
   * @param {{units:string[],buildings:string[],research:string[]}} o.unlocks  (ver `hqTierUnlocks`)
   * @param {string} o.factionId   'human' | 'orc' (nomes localizados)
   */
  open({ title, unlocks, factionId = 'human' }) {
    this.close();
    const names = unlockNames(unlocks, factionId);
    const blocks = TECH_KINDS.filter((k) => names[k])
      .map((k) => `<div><h4 class="ms-h">${esc(t(`campaign.unlock.${k}`))}</h4><ul class="ms-brief-hints">${names[k].map((n) => `<li>${esc(n)}</li>`).join('')}</ul></div>`)
      .join('');
    // Cartão lateral, sem véu: o Centro e os fogos continuam visíveis e o jogo segue rodando.
    const root = document.createElement('div');
    root.style.cssText = 'position:fixed;right:16px;top:96px;z-index:100100;';
    root.innerHTML = `<div class="ms-brief" role="dialog" aria-labelledby="hq-tier-title" style="grid-template-columns:1fr;width:min(360px,92vw);cursor:pointer">`
      + `<div class="ms-brief-main"><h3 id="hq-tier-title">${esc(title)}</h3>`
      + `<p class="ms-brief-sub">${esc(t('hq.tierUp.hint'))}</p>${blocks}`
      + `<div class="ms-brief-actions"><button type="button" class="ms-primary" data-hq="close">${esc(t('common.close'))}</button></div>`
      + '</div></div>';
    root.querySelector('.ms-brief').addEventListener('click', () => this.close());
    this.parent.appendChild(root);
    this.root = root;
    document.addEventListener('keydown', this._onKey, true);
    root.querySelector('[data-hq="close"]')?.focus({ preventScroll: true });
  }

  close() {
    if (!this.root) return;
    document.removeEventListener('keydown', this._onKey, true);
    this.root.remove();
    this.root = null;
  }
}
