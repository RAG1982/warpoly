// src/ui/screens/ReplayBar.js
// F9-05 · Barra do player de replay: pausa, velocidade 0,25×–8×, barra de progresso/salto, visão por jogador
// e aviso de divergência. Só DOM — a lógica fica em src/core/ReplayController.js.
import './mainMenu.css';
import './gameScreens.css';
import './replay.css';
import { t, factionName } from '../../i18n/index.js';
import { playerDisplayName } from '../uiText.js';
import { REPLAY_SPEEDS, VIEW_ALL, formatTicks } from '../../replay/Replay.js';

const fmtSpeed = (s) => `${s}×`;

export class ReplayBar {
  /**
   * @param {object} o
   * @param {object} o.replay
   * @param {{onPause:()=>void, onSpeed:(s:number)=>void, onSeek:(tick:number)=>void, onView:(v:number)=>void, onExit:()=>void}} o.handlers
   */
  constructor({ replay, handlers }, parent = document.body) {
    this.replay = replay;
    this.h = handlers;
    this.parent = parent;
    this._dragging = false;
    this._build();
  }

  _build() {
    const r = this.replay;
    const players = r.config.players;
    const root = document.createElement('div');
    root.id = 'replay-bar';
    root.className = 'rp-bar gs-vars';
    root.setAttribute('role', 'region');
    root.setAttribute('aria-label', t('replay.bar'));
    root.innerHTML = `
      <div class="rp-row">
        <span class="rp-tag">${t('replay.tag')}</span>
        <button type="button" class="rp-btn" data-rp="pause" aria-label="${t('replay.pause')}"></button>
        <div class="rp-speeds" role="group" aria-label="${t('replay.speed')}">
          ${REPLAY_SPEEDS.map((s) => `<button type="button" class="rp-btn rp-btn--speed" data-rp-speed="${s}" aria-pressed="false">${fmtSpeed(s)}</button>`).join('')}
        </div>
        <label class="rp-view">${t('replay.view')}
          <select data-rp="view">
            <option value="${VIEW_ALL}">${t('replay.viewAll')}</option>
            ${players.map((p) => `<option value="${p.id}">${playerDisplayName(p.name)} (${factionName(p.factionId)})</option>`).join('')}
          </select>
        </label>
        <button type="button" class="rp-btn rp-btn--exit" data-rp="exit">${t('replay.exit')}</button>
      </div>
      <div class="rp-row">
        <span class="rp-time" data-rp="time" aria-live="off">0:00 / ${formatTicks(r.ticks)}</span>
        <input type="range" class="rp-seek" data-rp="seek" min="0" max="${Math.max(1, r.ticks)}" step="20" value="0" aria-label="${t('replay.seek')}">
      </div>
      <p class="rp-msg" data-rp="msg" role="status" hidden></p>
      <p class="rp-warn" data-rp="warn" role="alert" hidden></p>`;
    this.root = root;
    this.btnPause = root.querySelector('[data-rp="pause"]');
    this.seek = root.querySelector('[data-rp="seek"]');
    this.time = root.querySelector('[data-rp="time"]');
    this.viewSel = root.querySelector('[data-rp="view"]');
    this.msg = root.querySelector('[data-rp="msg"]');
    this.warn = root.querySelector('[data-rp="warn"]');
    // Teclado/clique do jogo não deve vazar da barra (atalhos do InputManager).
    root.addEventListener('keydown', (e) => e.stopPropagation());
    root.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.rp === 'pause') this.h.onPause();
      else if (b.dataset.rp === 'exit') this.h.onExit();
      else if (b.dataset.rpSpeed) this.h.onSpeed(Number(b.dataset.rpSpeed));
      b.blur();
    });
    this.seek.addEventListener('input', () => {
      this._dragging = true;
      this.time.textContent = `${formatTicks(Number(this.seek.value))} / ${formatTicks(this.replay.ticks)}`;
    });
    this.seek.addEventListener('change', () => {
      this._dragging = false;
      this.h.onSeek(Number(this.seek.value));
      this.seek.blur();
    });
    this.viewSel.addEventListener('change', () => {
      this.h.onView(Number(this.viewSel.value));
      this.viewSel.blur();
    });
    this.parent.appendChild(root);
  }

  setView(v) {
    this.viewSel.value = String(v);
  }

  /** @param {{tick:number, paused:boolean, speed:number, seeking:number|null, ended:boolean}} s */
  update(s) {
    const paused = s.paused || s.ended;
    this.btnPause.textContent = paused ? '▶' : '⏸';
    this.btnPause.setAttribute('aria-label', paused ? t('replay.play') : t('replay.pause'));
    for (const b of this.root.querySelectorAll('[data-rp-speed]')) {
      b.setAttribute('aria-pressed', String(Number(b.dataset.rpSpeed) === s.speed));
    }
    if (!this._dragging) {
      this.seek.value = String(s.tick);
      this.time.textContent = `${formatTicks(s.tick)} / ${formatTicks(this.replay.ticks)}`;
    }
    const m = s.seeking !== null ? t('replay.seeking', { time: formatTicks(s.seeking) }) : s.ended ? t('replay.ended') : '';
    this.msg.hidden = !m;
    if (this.msg.textContent !== m) this.msg.textContent = m;
  }

  showWarning(text) {
    this.warn.hidden = !text;
    this.warn.textContent = text || '';
  }

  destroy() {
    this.root?.remove();
    this.root = null;
  }
}
