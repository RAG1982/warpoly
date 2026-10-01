// src/ui/screens/SaveLoadDialog.js
// F2-06 · Diálogo de slots de save: modo 'save' (pausa) ou 'load' (pausa e menu principal).
// Lista os 3 slots manuais + autosave com resumo (tempo de jogo, facção, unidades, data).
import './mainMenu.css';
import './gameScreens.css';
import { SAVE_SLOTS, AUTOSAVE_SLOT } from '../../core/SaveStore.js';

const SLOT_LABEL = { slot1: 'Slot 1', slot2: 'Slot 2', slot3: 'Slot 3', [AUTOSAVE_SLOT]: 'Autosave' };
const FACTION_LABEL = { human: 'Aliança', orc: 'Horda' };

function fmtTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function describe(meta) {
  if (!meta) return 'Vazio';
  const s = meta.summary || {};
  const when = meta.savedAt ? new Date(meta.savedAt).toLocaleString('pt-BR') : '';
  const faction = FACTION_LABEL[s.faction] || '';
  return `${fmtTime(s.seconds || 0)} de jogo${faction ? ` · ${faction}` : ''}${s.units !== undefined ? ` · ${s.units} unid.` : ''}${when ? ` · ${when}` : ''}`;
}

export class SaveLoadDialog {
  /**
   * @param {object} opts
   * @param {import('../../core/SaveStore.js').SaveStore} opts.store
   * @param {(slot:string)=>Promise<void>|void} opts.onSave
   * @param {(slot:string)=>Promise<void>|void} opts.onLoad
   * @param {()=>void} [opts.onClose]
   */
  constructor({ store, onSave, onLoad, onClose }, parent = document.body) {
    this.store = store;
    this.onSave = onSave;
    this.onLoad = onLoad;
    this.onClose = onClose;
    this.parent = parent;
    this.root = null;
    this.mode = 'load';
    this._onKeyDown = this._onKeyDown.bind(this);
  }

  get isOpen() { return !!this.root && !this.root.hidden; }

  _build() {
    const root = document.createElement('div');
    root.id = 'save-dialog';
    root.className = 'gs-overlay gs-vars';
    root.hidden = true;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'save-dialog-title');
    root.style.zIndex = '9100';
    root.innerHTML = `
      <div class="gs-card gs-card--wide">
        <p class="gs-kicker">Partida</p>
        <h2 id="save-dialog-title" class="gs-title"></h2>
        <p class="gs-sub" data-save-msg></p>
        <div class="gs-actions gs-slots" data-save-slots></div>
        <div class="gs-actions"><button type="button" class="mm-btn mm-btn--ghost" data-save-close>Voltar</button></div>
      </div>`;
    root.addEventListener('click', (e) => {
      if (e.target.closest('[data-save-close]')) { this.close(); return; }
      const btn = e.target.closest('[data-slot]');
      if (btn && !btn.disabled) this._pick(btn.dataset.slot);
    });
    this.parent.appendChild(root);
    this.root = root;
  }

  async open(mode) {
    if (!this.root) this._build();
    this.mode = mode;
    this.root.querySelector('#save-dialog-title').textContent = mode === 'save' ? 'Salvar partida' : 'Carregar partida';
    this.root.hidden = false;
    window.addEventListener('keydown', this._onKeyDown, true);
    await this.refresh();
    this.root.querySelector('[data-slot]:not([disabled])')?.focus({ preventScroll: true });
  }

  async refresh(message = '') {
    const msgEl = this.root.querySelector('[data-save-msg]');
    msgEl.textContent = message || (this.mode === 'save' ? 'Escolha um slot (sobrescreve o conteúdo atual).' : 'Escolha o save a carregar.');
    let metas = [];
    try {
      metas = await this.store.list();
    } catch (err) {
      msgEl.textContent = 'Não foi possível acessar o armazenamento de saves neste navegador.';
      console.warn('[WarPoly] SaveStore:', err);
    }
    const bySlot = new Map(metas.map(m => [m.slot, m]));
    const slots = this.mode === 'save' ? SAVE_SLOTS : [...SAVE_SLOTS, AUTOSAVE_SLOT];
    this.root.querySelector('[data-save-slots]').innerHTML = slots.map((slot) => {
      const meta = bySlot.get(slot);
      const disabled = this.mode === 'load' && !meta;
      return `<button type="button" class="mm-btn" data-slot="${slot}"${disabled ? ' disabled' : ''}>
        <span class="mm-btn__label">${SLOT_LABEL[slot]}</span><span class="mm-btn__hint">${describe(meta)}</span>
      </button>`;
    }).join('');
  }

  async _pick(slot) {
    try {
      if (this.mode === 'save') {
        await this.onSave?.(slot);
        await this.refresh('Partida salva.');
      } else {
        await this.onLoad?.(slot);
      }
    } catch (err) {
      console.error('[WarPoly] save/load:', err);
      this.root.querySelector('[data-save-msg]').textContent = `Erro: ${err.message || err}`;
    }
  }

  _onKeyDown(e) {
    if (!this.isOpen) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.close();
    }
  }

  close() {
    if (!this.root || this.root.hidden) return;
    this.root.hidden = true;
    window.removeEventListener('keydown', this._onKeyDown, true);
    if (this.root.contains(document.activeElement)) document.activeElement.blur();
    this.onClose?.();
  }

  destroy() {
    this.close();
    this.root?.remove();
    this.root = null;
  }
}
