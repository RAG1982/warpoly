// src/ui/screens/PauseMenu.js
// F2-04 · Menu de pausa: Continuar, Reiniciar, Menu Principal e Sair.
// Criado uma vez pela aplicação (main.js) e só mostrado/escondido; a simulação para
// enquanto ele está aberto, mas a câmera (WASD/setas) e o render continuam.
import './mainMenu.css';
import './gameScreens.css';

const ACTIONS = [
  { id: 'resume', label: 'Continuar', hint: '<kbd>Esc</kbd>', primary: true },
  { id: 'restart', label: 'Reiniciar', hint: 'Mesma partida' },
  { id: 'main-menu', label: 'Menu Principal' },
  { id: 'quit', label: 'Sair' }
];

export class PauseMenu {
  /**
   * @param {object} handlers  { onResume, onRestart, onMainMenu, onQuit }
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
        <p class="gs-kicker">Partida</p>
        <h2 id="pause-title" class="gs-title">Pausa</h2>
        <p class="gs-sub">A simulação está parada. A câmera continua livre.</p>
        <nav class="gs-actions" aria-label="Menu de pausa">
          ${ACTIONS.map((a) => `
            <button type="button" class="mm-btn${a.primary ? ' mm-btn--primary' : ''}" data-pause-action="${a.id}">
              <span class="mm-btn__label">${a.label}</span>${a.hint ? `<span class="mm-btn__hint">${a.hint}</span>` : ''}
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
  }

  _run(action) {
    const h = this.handlers;
    if (action === 'resume') h.onResume?.();
    else if (action === 'restart') h.onRestart?.();
    else if (action === 'main-menu') h.onMainMenu?.();
    else if (action === 'quit') h.onQuit?.();
  }

  _onKeyDown(e) {
    if (!this.isOpen) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this._run('resume');
    }
  }

  show() {
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
