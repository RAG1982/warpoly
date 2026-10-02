// src/ui/screens/PauseMenu.js
// F2-04 · Menu de pausa: Continuar, Reiniciar, Menu Principal e Sair.
// Criado uma vez pela aplicação (main.js) e só mostrado/escondido; a simulação para
// enquanto ele está aberto, mas a câmera (WASD/setas) e o render continuam.
import './mainMenu.css';
import './gameScreens.css';
import { t, getLanguage } from '../../i18n/index.js';

// `label`/`hint` = chaves i18n (`hint` literal quando começa com '<').
const ACTIONS = [
  { id: 'resume', label: 'pause.resume', hint: '<kbd>Esc</kbd>', primary: true },
  { id: 'save', label: 'pause.save', hint: 'pause.saveHint' },
  { id: 'load', label: 'pause.load' },
  { id: 'options', label: 'pause.options' },
  { id: 'restart', label: 'pause.restart', hint: 'pause.restartHint' },
  { id: 'main-menu', label: 'pause.mainMenu' },
  { id: 'quit', label: 'pause.quit' }
];

export class PauseMenu {
  /**
   * @param {object} handlers  { onResume, onSave, onLoad, onRestart, onMainMenu, onQuit }
   * @param {HTMLElement} [parent]
   */
  constructor(handlers = {}, parent = document.body) {
    this.handlers = handlers;
    this.parent = parent;
    this.root = null;
    this._onKeyDown = this._onKeyDown.bind(this);
  }

  get isOpen() {
    return !!this.root && !this.root.hidden;
  }

  _build() {
    const root = document.createElement('div');
    root.id = 'pause-menu';
    root.className = 'gs-overlay gs-vars';
    root.hidden = true;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'pause-title');
    root.innerHTML = `
      <div class="gs-card">
        <p class="gs-kicker">${t('pause.kicker')}</p>
        <h2 id="pause-title" class="gs-title">${t('pause.title')}</h2>
        <p class="gs-sub">${t('pause.sub')}</p>
        <nav class="gs-actions" aria-label="${t('pause.nav')}">
          ${ACTIONS.map((a) => `
            <button type="button" class="mm-btn${a.primary ? ' mm-btn--primary' : ''}" data-pause-action="${a.id}">
              <span class="mm-btn__label">${t(a.label)}</span>${a.hint ? `<span class="mm-btn__hint">${a.hint.startsWith('<') ? a.hint : t(a.hint)}</span>` : ''}
            </button>`).join('')}
        </nav>
      </div>`;
    root.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-pause-action]');
      if (btn) this._run(btn.dataset.pauseAction);
    });
    root.querySelector('.gs-actions').addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      const items = [...root.querySelectorAll('[data-pause-action]')];
      const i = items.indexOf(document.activeElement);
      if (i < 0) return;
      e.preventDefault();
      items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus();
    });
    this.parent.appendChild(root);
    this.root = root;
    this._builtLang = getLanguage();
  }

  _run(action) {
    const h = this.handlers;
    if (action === 'resume') h.onResume?.();
    else if (action === 'save') h.onSave?.();
    else if (action === 'load') h.onLoad?.();
    else if (action === 'options') h.onOptions?.();
    else if (action === 'restart') h.onRestart?.();
    else if (action === 'main-menu') h.onMainMenu?.();
    else if (action === 'quit') h.onQuit?.();
  }

  _onKeyDown(e) {
    if (!this.isOpen || document.getElementById('save-dialog')?.hidden === false) return;
    if (document.getElementById('options-panel')?.hidden === false) return; // F6-08: Esc fecha só as opções
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this._run('resume');
    }
  }

  show() {
    if (this.root && this._builtLang !== getLanguage()) { this.root.remove(); this.root = null; } // F6-09
    if (!this.root) this._build();
    if (this.isOpen) return;
    this.root.hidden = false;
    // Captura: o Esc que fecha a pausa não chega ao InputManager.
    window.addEventListener('keydown', this._onKeyDown, true);
    requestAnimationFrame(() => this.root?.querySelector('[data-pause-action="resume"]')?.focus({ preventScroll: true }));
  }

  hide() {
    if (!this.root || this.root.hidden) return;
    this.root.hidden = true;
    window.removeEventListener('keydown', this._onKeyDown, true);
    // Tira o foco dos botões escondidos (Enter/Espaço não devem reativá-los durante o jogo).
    if (this.root.contains(document.activeElement)) document.activeElement.blur();
  }

  destroy() {
    this.hide();
    this.root?.remove();
    this.root = null;
  }
}
