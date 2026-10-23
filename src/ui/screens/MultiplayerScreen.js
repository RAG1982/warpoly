// src/ui/screens/MultiplayerScreen.js (MP-02) — Menu > "Multiplayer": tela de entrada da partida online.
// Nome do jogador (lembrado), "Criar sala", "Entrar com código" e lista de salas públicas (mensagem
// `list` do servidor de sinalização). Ao criar/entrar, `onLaunch(entry)` entrega a entrada ao
// OnlineLobby (o mesmo de `?online=1`); a tela se desmonta antes. Esc / "Voltar" chama `onClose`.
// Sem servidor: mensagem em PT-BR com "Tentar de novo" (o teste de disponibilidade é a própria conexão).
import '../../ui/screens/multiplayer.css';
import { t, getLanguage, onLanguageChange } from '../../i18n/index.js';
import { SignalingClient } from '../../net/SignalingClient.js';
import { resolveSignalUrl } from '../../net/signalUrl.js';
import { nextFocusIndex } from '../campaignSelectModel.js';
import {
  loadPlayerName, savePlayerName, roomListItems, buildLobbyEntry, isRoomCodeValid, normalizeRoomCode
} from '../multiplayerModel.js';

const PROBE_TIMEOUT_MS = 8000;
const REFRESH_MS = 5000;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** localStorage se existir e estiver acessível (modo privado pode lançar); senão null. */
function defaultStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export class MultiplayerScreen {
  /**
   * @param {object} o
   * @param {(entry: object) => void} o.onLaunch   entrada pronta para o OnlineLobby (`buildLobbyEntry`)
   * @param {() => void} [o.onClose]               Esc / "Voltar"
   * @param {string} [o.signal]                    URL ws do sinalizador (padrão: `resolveSignalUrl`)
   * @param {object|null} [o.storage]              armazenamento do nome (padrão: localStorage)
   * @param {(url: string) => object} [o.probeFactory]  cliente de sinalização (testes)
   */
  constructor({ onLaunch, onClose = null, signal = null, storage = defaultStorage(), probeFactory = null } = {}, parent = document.body) {
    this.onLaunch = onLaunch;
    this.onClose = onClose;
    this.parent = parent;
    this.storage = storage;
    this.signal = signal ?? resolveSignalUrl({
      param: new URLSearchParams(globalThis.location?.search ?? '').get('signal'),
      protocol: globalThis.location?.protocol,
      hostname: globalThis.location?.hostname
    });
    this.probeFactory = probeFactory ?? ((url) => new SignalingClient({ url, reconnect: false, pingMs: 0 }));
    this.root = null;
    this.state = 'connecting'; // 'connecting' | 'ready' | 'unavailable'
    this.rooms = [];
    this._client = null;
    this._timeout = null;
    this._refresh = null;
    this._offLang = null;
    this._onKey = (e) => {
      if (e.code === 'Escape') { e.preventDefault(); e.stopPropagation(); this.close(); return; }
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) return;
      if (!this.root || !document.activeElement?.classList.contains('mp-room')) return;
      const items = [...this.root.querySelectorAll('.mp-room')];
      e.preventDefault(); e.stopPropagation();
      const cur = items.indexOf(document.activeElement);
      items[nextFocusIndex(cur < 0 ? 0 : cur, e.key, items.length)]?.focus();
    };
  }

  get isOpen() { return !!this.root; }

  open() {
    if (this.root) return;
    const root = document.createElement('div');
    root.className = 'mp-overlay';
    root.addEventListener('click', (e) => this._onClick(e));
    root.addEventListener('keydown', (e) => this._onInputKey(e));
    this.parent.appendChild(root);
    this.root = root;
    document.addEventListener('keydown', this._onKey, true);
    this._offLang = onLanguageChange(() => this._render());
    this._render();
    this._probe();
    this.root.querySelector('#mp-name')?.focus({ preventScroll: true });
  }

  /** Esc / "Voltar": desmonta e avisa `onClose` (quem chamou volta ao menu). */
  close() {
    if (!this.root) return;
    this.dispose();
    this.onClose?.();
  }

  /** Desmonta sem avisar (usado ao entregar a entrada ao lobby e ao destruir o menu). */
  dispose() {
    this._stopProbe();
    if (this.root) {
      document.removeEventListener('keydown', this._onKey, true);
      this._offLang?.();
      this._offLang = null;
      this.root.remove();
      this.root = null;
    }
  }

  // ------------------------------------------------------------------ servidor
  _probe() {
    this._stopProbe();
    this._setState('connecting');
    const client = this.probeFactory(this.signal);
    this._client = client;
    let opened = false;
    client.on('open', () => {
      if (client !== this._client) return;
      opened = true;
      clearTimeout(this._timeout);
      this._timeout = null;
      client.list();
      this._refresh = setInterval(() => client.connected && client.list(), REFRESH_MS);
    });
    client.on('rooms', (m) => {
      if (client !== this._client) return;
      this.rooms = roomListItems(m.rooms);
      if (this.state !== 'ready') this._setState('ready');
      else this._renderRooms();
    });
    client.on('close', () => {
      if (client !== this._client) return;
      this._stopProbe();
      this._setState('unavailable');
    });
    // Conexão pendurada (sem abrir nem fechar): também conta como indisponível.
    this._timeout = setTimeout(() => {
      if (opened || client !== this._client) return;
      this._stopProbe();
      this._setState('unavailable');
    }, PROBE_TIMEOUT_MS);
    client.connect();
  }

  _stopProbe() {
    clearTimeout(this._timeout);
    clearInterval(this._refresh);
    this._timeout = null;
    this._refresh = null;
    const client = this._client;
    this._client = null;
    if (client) client.close();
  }

  _setState(state) {
    this.state = state;
    if (state === 'unavailable') this.rooms = [];
    this._renderStatus();
    this._renderRooms();
  }

  // ------------------------------------------------------------------ ações
  _name() {
    return this.root?.querySelector('#mp-name')?.value ?? loadPlayerName(this.storage);
  }

  _launch(entry) {
    if (!entry) return false;
    savePlayerName(this.storage, entry.name);
    this.dispose();
    this.onLaunch?.(entry);
    return true;
  }

  _join(code) {
    const input = this.root?.querySelector('#mp-code');
    const err = this.root?.querySelector('#mp-code-err');
    const raw = code ?? input?.value ?? '';
    if (!isRoomCodeValid(raw)) {
      if (err) { err.textContent = t('mp.codeInvalid'); err.hidden = false; }
      input?.setAttribute('aria-invalid', 'true');
      input?.focus();
      return false;
    }
    return this._launch(buildLobbyEntry({ mode: 'join', name: this._name(), code: normalizeRoomCode(raw), signal: this.signal, fallbackName: t('mp.defaultName') }));
  }

  _onClick(e) {
    const el = e.target.closest('[data-mp]');
    if (!el || el.disabled) return;
    switch (el.dataset.mp) {
      case 'back': return this.close();
      case 'create': return this._launch(buildLobbyEntry({ mode: 'create', name: this._name(), isPublic: this.root.querySelector('#mp-public')?.checked, signal: this.signal, fallbackName: t('mp.defaultName') }));
      case 'join': return this._join();
      case 'room': return this._join(el.dataset.code);
      case 'refresh': return this._client?.connected && this._client.list();
      case 'retry': return this._probe();
      default:
    }
  }

  _onInputKey(e) {
    if (e.key !== 'Enter') return;
    if (e.target.id === 'mp-code') { e.preventDefault(); this._join(); }
    else if (e.target.id === 'mp-name') { e.preventDefault(); this.root.querySelector('[data-mp="create"]')?.focus(); }
  }

  // ------------------------------------------------------------------ render
  _render() {
    if (!this.root) return;
    const lang = getLanguage() === 'en' ? 'en' : 'pt-BR';
    const keep = this._snapshot();
    this.root.innerHTML = `<div class="mp-screen" role="dialog" aria-modal="true" aria-labelledby="mp-title" data-lang="${lang}">`
      + `<p class="mp-kicker">${esc(t('mp.kicker'))}</p>`
      + `<h2 id="mp-title" class="mp-title">${esc(t('mp.title'))}</h2>`
      + `<p class="mp-subtitle">${esc(t('mp.subtitle'))}</p>`
      + `<div class="mp-status" id="mp-status" role="status" aria-live="polite"></div>`
      + `<label class="mp-field"><span class="mp-field__label">${esc(t('mp.name'))}</span>`
      + `<input id="mp-name" class="mp-input" type="text" maxlength="24" autocomplete="nickname" placeholder="${esc(t('mp.defaultName'))}" value="${esc(keep.name ?? loadPlayerName(this.storage))}">`
      + `<span class="mp-hint">${esc(t('mp.nameHint'))}</span></label>`
      + `<div class="mp-cols">`
      + `<section class="mp-card" aria-labelledby="mp-create-title"><h3 id="mp-create-title" class="mp-card__title">${esc(t('mp.create'))}</h3>`
      + `<p class="mp-hint">${esc(t('mp.createHint'))}</p>`
      + `<label class="mp-check"><input id="mp-public" type="checkbox"${keep.pub ? ' checked' : ''}> <span>${esc(t('mp.createPublic'))}</span></label>`
      + `<button type="button" class="mp-btn mp-btn--primary" data-mp="create">${esc(t('mp.create'))}</button></section>`
      + `<section class="mp-card" aria-labelledby="mp-join-title"><h3 id="mp-join-title" class="mp-card__title">${esc(t('mp.joinTitle'))}</h3>`
      + `<label class="mp-field"><span class="mp-field__label">${esc(t('mp.code'))}</span>`
      + `<input id="mp-code" class="mp-input mp-input--code" type="text" maxlength="8" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-describedby="mp-code-err" value="${esc(keep.code ?? '')}"></label>`
      + `<p id="mp-code-err" class="mp-err" role="alert" hidden></p>`
      + `<button type="button" class="mp-btn" data-mp="join">${esc(t('mp.join'))}</button></section>`
      + `</div>`
      + `<section class="mp-rooms" aria-labelledby="mp-rooms-title">`
      + `<header class="mp-rooms__head"><h3 id="mp-rooms-title" class="mp-card__title">${esc(t('mp.roomsTitle'))}</h3>`
      + `<button type="button" class="mp-btn mp-btn--ghost" data-mp="refresh">${esc(t('mp.roomsRefresh'))}</button></header>`
      + `<ul id="mp-room-list" class="mp-room-list" aria-labelledby="mp-rooms-title"></ul></section>`
      + `<footer class="mp-foot"><button type="button" class="mp-btn mp-btn--ghost" data-mp="back">${esc(t('mp.back'))}</button>`
      + `<span class="mp-hint">${esc(t('mp.hint'))}</span></footer>`
      + `</div>`;
    this._bindInputs();
    this._renderStatus();
    this._renderRooms();
    this._restoreFocus(keep.focus);
  }

  _bindInputs() {
    this.root.querySelector('#mp-code')?.addEventListener('input', (e) => {
      e.target.value = normalizeRoomCode(e.target.value);
      e.target.removeAttribute('aria-invalid');
      const err = this.root.querySelector('#mp-code-err');
      if (err) err.hidden = true;
    });
  }

  _snapshot() {
    if (!this.root) return {};
    const focus = document.activeElement;
    const key = focus && this.root.contains(focus) ? (focus.id || focus.dataset?.mp || null) : null;
    return {
      name: this.root.querySelector('#mp-name')?.value,
      code: this.root.querySelector('#mp-code')?.value,
      pub: this.root.querySelector('#mp-public')?.checked,
      focus: key
    };
  }

  _restoreFocus(key) {
    if (!key || !this.root) return;
    const el = this.root.querySelector(`#${CSS.escape(key)}, [data-mp="${CSS.escape(key)}"]`);
    el?.focus({ preventScroll: true });
  }

  _renderStatus() {
    if (!this.root) return;
    const box = this.root.querySelector('#mp-status');
    const down = this.state === 'unavailable';
    box.innerHTML = down
      ? `<div class="mp-alert"><span>${esc(t('mp.unavailable'))}</span> <button type="button" class="mp-btn" data-mp="retry">${esc(t('mp.retry'))}</button></div>`
      : '';
    for (const b of this.root.querySelectorAll('[data-mp="create"], [data-mp="join"], [data-mp="refresh"]')) b.disabled = down;
    for (const b of this.root.querySelectorAll('.mp-room')) b.disabled = down;
  }

  _renderRooms() {
    if (!this.root) return;
    const list = this.root.querySelector('#mp-room-list');
    if (!list) return;
    if (this.state === 'connecting') {
      list.innerHTML = `<li class="mp-muted">${esc(t('mp.roomsLoading'))}</li>`;
      return;
    }
    if (this.state === 'unavailable') {
      list.innerHTML = '';
      return;
    }
    if (!this.rooms.length) {
      list.innerHTML = `<li class="mp-muted">${esc(t('mp.roomsEmpty'))}</li>`;
      return;
    }
    list.innerHTML = this.rooms.map((r) => `<li><button type="button" class="mp-room" data-mp="room" data-code="${esc(r.code)}" aria-label="${esc(t('mp.roomJoin', { code: r.code }))}">`
      + `<span class="mp-room__code">${esc(r.code)}</span>`
      + `<span class="mp-room__info">${esc(t('mp.roomLine', { host: r.host, players: r.players, max: r.maxPlayers }))}</span></button></li>`).join('');
  }
}
