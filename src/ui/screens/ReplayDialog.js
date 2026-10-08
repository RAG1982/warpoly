// src/ui/screens/ReplayDialog.js
// F9-05 · Lista de replays (menu principal): reproduzir, exportar (.warpolyreplay), apagar e importar arquivo.
import './mainMenu.css';
import './gameScreens.css';
import './replay.css';
import { t, getLanguage, getLocale, factionName } from '../../i18n/index.js';
import { playerDisplayName } from '../uiText.js';
import { REPLAY_EXT, formatTicks } from '../../replay/Replay.js';
import { getMap } from '../../data/maps/index.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function titleOf(meta) {
  const s = meta.summary || {};
  const ps = s.players || [];
  const names = ps.map((p) => `${esc(playerDisplayName(p.name))} (${esc(factionName(p.factionId))})`);
  return names.length > 2 ? `${names.slice(0, 2).join(' × ')} +${names.length - 2}` : names.join(' × ');
}

function metaLine(meta) {
  const s = meta.summary || {};
  const map = getMap(s.mapId);
  const when = meta.createdAt ? new Date(meta.createdAt).toLocaleString(getLocale()) : '';
  const parts = [map ? map.name : s.mapId, formatTicks((s.seconds || 0) * 20), when];
  if (s.online) parts.push(t('replay.online'));
  if (s.over) parts.push(s.localWon ? t('replay.won') : t('replay.lost'));
  if (meta.bytes) parts.push(`${Math.max(1, Math.round(meta.bytes / 1024))} kB`);
  return parts.filter(Boolean).map(esc).join(' · ');
}

export class ReplayDialog {
  /**
   * @param {object} o
   * @param {import('../../core/ReplayService.js').ReplayService} o.service
   * @param {(replay: object) => void} o.onPlay
   * @param {() => void} [o.onClose]
   */
  constructor({ service, onPlay, onClose }, parent = document.body) {
    this.service = service;
    this.onPlay = onPlay;
    this.onClose = onClose;
    this.parent = parent;
    this.root = null;
    this._onKeyDown = this._onKeyDown.bind(this);
  }

  get isOpen() { return !!this.root && !this.root.hidden; }

  _build() {
    const root = document.createElement('div');
    root.id = 'replay-dialog';
    root.className = 'gs-overlay gs-vars';
    root.hidden = true;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'replay-dialog-title');
    root.style.zIndex = '100200'; // acima do menu principal (z-index 100000)
    root.innerHTML = `
      <div class="gs-card gs-card--wide" style="width:min(680px,100%)">
        <p class="gs-kicker">${t('menu.tagline')}</p>
        <h2 id="replay-dialog-title" class="gs-title">${t('replay.title')}</h2>
        <p class="gs-sub" data-rp-msg role="status"></p>
        <div class="rp-list" data-rp-list></div>
        <div class="gs-actions gs-actions--row">
          <button type="button" class="mm-btn" data-rp-import>${t('replay.import')}</button>
          <button type="button" class="mm-btn mm-btn--ghost" data-rp-close>${t('common.back')}</button>
        </div>
        <input type="file" accept="${REPLAY_EXT},application/json,.json" data-rp-file hidden>
      </div>`;
    root.addEventListener('click', (e) => this._click(e));
    root.querySelector('[data-rp-file]').addEventListener('change', (e) => this._import(e.target));
    this.parent.appendChild(root);
    this.root = root;
    this._builtLang = getLanguage();
  }

  async open() {
    if (this.root && this._builtLang !== getLanguage()) { this.root.remove(); this.root = null; }
    if (!this.root) this._build();
    this.root.hidden = false;
    window.addEventListener('keydown', this._onKeyDown, true);
    await this.refresh();
    this.root.querySelector('[data-rp-play]')?.focus({ preventScroll: true });
  }

  _msg(text) {
    this.root.querySelector('[data-rp-msg]').textContent = text;
  }

  async refresh(message = '') {
    let metas = [];
    try {
      metas = await this.service.store.list();
      this._msg(message || (metas.length ? t('replay.pick') : ''));
    } catch (err) {
      this._msg(t('replay.storageError'));
      console.warn('[WarPoly] ReplayStore:', err);
    }
    const list = this.root.querySelector('[data-rp-list]');
    list.innerHTML = metas.length
      ? metas.map((m) => `
        <div class="rp-item" data-id="${esc(m.id)}">
          <div class="rp-item__main"><div class="rp-item__title">${titleOf(m)}</div><div class="rp-item__meta">${metaLine(m)}</div></div>
          <div class="rp-item__actions">
            <button type="button" class="rp-btn" data-rp-play>${t('replay.play')}</button>
            <button type="button" class="rp-btn" data-rp-export>${t('replay.export')}</button>
            <button type="button" class="rp-btn" data-rp-del>${t('replay.delete')}</button>
          </div>
        </div>`).join('')
      : `<p class="rp-empty">${t('replay.empty')}</p>`;
  }

  async _click(e) {
    if (e.target.closest('[data-rp-close]')) return this.close();
    if (e.target.closest('[data-rp-import]')) return this.root.querySelector('[data-rp-file]').click();
    const item = e.target.closest('.rp-item');
    if (!item) return;
    const id = item.dataset.id;
    try {
      if (e.target.closest('[data-rp-del]')) {
        if (item.dataset.confirm !== '1') {
          item.dataset.confirm = '1';
          e.target.closest('[data-rp-del]').textContent = t('replay.confirmDelete');
          return;
        }
        await this.service.store.remove(id);
        await this.refresh(t('replay.deleted'));
        return;
      }
      const replay = await this.service.store.get(id);
      if (!replay) throw Object.assign(new Error('?'), { code: 'invalid' });
      if (e.target.closest('[data-rp-export]')) this.service.exportFile(replay);
      else if (e.target.closest('[data-rp-play]')) this.onPlay?.(replay);
    } catch (err) {
      this._msg(this._errText(err));
    }
  }

  _errText(err) {
    const code = err && err.code;
    return ['json', 'format', 'version', 'invalid', 'map'].includes(code) ? t(`replay.err.${code}`) : t('replay.err.generic', { msg: err && err.message ? err.message : String(err) });
  }

  async _import(input) {
    const file = input.files && input.files[0];
    input.value = '';
    if (!file) return;
    try {
      await this.service.importFile(file);
      await this.refresh(t('replay.imported'));
    } catch (err) {
      this._msg(this._errText(err));
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

  /** Mostra uma mensagem de erro (ex.: falha ao iniciar o replay). */
  showError(err) {
    if (this.root) this._msg(this._errText(err));
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
