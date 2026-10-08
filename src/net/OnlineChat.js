/**
 * OnlineChat.js — F9-04: chat in-game. Painel DOM no canto inferior esquerdo: as últimas mensagens
 * aparecem e somem sozinhas (~12 s); `Enter` abre a caixa (todos), `Shift+Enter` abre em modo "aliados";
 * `Enter` envia, `Esc` fecha. Só apresentação: mensagens vêm de `session.onChat` e saem por
 * `session.sendChat` (fora da sim, nunca no checksum). Textos entram por `textContent`. PT-BR.
 * Como o `InputManager` ignora teclas vindas de <input>, digitar aqui não dispara atalhos do jogo.
 */
const SHOW_MS = 12000;
const MAX_LINES = 40;

export class OnlineChat {
  /**
   * @param {import('./LockstepSession.js').LockstepSession} session
   * @param {{nameOf: (pid: number) => string, colorOf?: (pid: number) => string, now?: () => number}} o
   */
  constructor(session, { nameOf, colorOf = () => '#e5e7eb', now = () => performance.now() }) {
    this.session = session;
    this.nameOf = nameOf;
    this.colorOf = colorOf;
    this.now = now;
    this.team = false;
    this.lines = [];
    this.el = document.createElement('div');
    this.el.id = 'online-chat';
    this.el.style.cssText = 'position:fixed;left:10px;bottom:230px;width:min(380px,40vw);z-index:9000;font:13px/1.35 system-ui,sans-serif;color:#e5e7eb;pointer-events:none';
    this.log = document.createElement('div');
    this.log.style.cssText = 'display:flex;flex-direction:column;gap:2px;text-shadow:0 1px 2px #000';
    this.input = document.createElement('input');
    this.input.type = 'text';
    this.input.maxLength = 200;
    this.input.autocomplete = 'off';
    this.input.style.cssText = 'display:none;width:100%;box-sizing:border-box;margin-top:4px;padding:4px 8px;border-radius:4px;border:1px solid #475569;background:rgba(10,14,28,.85);color:#fff;pointer-events:auto;font:inherit';
    this.el.append(this.log, this.input);
    document.body.append(this.el);
    this._onKey = (e) => this._windowKey(e);
    window.addEventListener('keydown', this._onKey, true);
    this.input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        this._send();
        e.preventDefault();
      } else if (e.key === 'Escape') {
        this.close();
        e.preventDefault();
      }
    });
    this.input.addEventListener('blur', () => this.close());
    this._timer = setInterval(() => this._prune(), 1000);
  }

  get isOpen() {
    return this.input.style.display !== 'none';
  }

  _windowKey(e) {
    if (e.key !== 'Enter' || this.isOpen || e.ctrlKey || e.altKey || e.metaKey) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
    e.preventDefault();
    e.stopPropagation();
    this.open(e.shiftKey);
  }

  open(team = false) {
    this.team = team;
    this.input.placeholder = team ? 'Aliados: digite e tecle Enter' : 'Todos: digite e tecle Enter';
    this.input.style.display = '';
    this.input.value = '';
    this._show();
    setTimeout(() => this.input.focus(), 0);
  }

  close() {
    this.input.style.display = 'none';
    this.input.value = '';
    this.input.blur?.();
  }

  _send() {
    const text = this.input.value.trim();
    this.close();
    if (text) this.session.sendChat(text, { team: this.team });
  }

  /** Chamado por `session.onChat`. */
  add({ from, text, team }) {
    this.lines.push({ from, text, team, t: this.now() });
    if (this.lines.length > MAX_LINES) this.lines.shift();
    this._show();
  }

  /** Mensagem de sistema (entrada/saída, pausa, queda). */
  system(text) {
    this.lines.push({ from: -1, text, team: false, t: this.now() });
    if (this.lines.length > MAX_LINES) this.lines.shift();
    this._show();
  }

  _show() {
    const now = this.now();
    const vis = this.isOpen ? this.lines.slice(-12) : this.lines.filter((l) => now - l.t < SHOW_MS).slice(-8);
    this.log.replaceChildren(
      ...vis.map((l) => {
        const row = document.createElement('div');
        if (l.from < 0) {
          row.textContent = l.text;
          row.style.color = '#fbbf24';
          return row;
        }
        const who = document.createElement('b');
        who.textContent = `${l.team ? '[Aliados] ' : ''}${this.nameOf(l.from)}: `;
        who.style.color = this.colorOf(l.from);
        const msg = document.createElement('span');
        msg.textContent = l.text;
        row.append(who, msg);
        return row;
      })
    );
  }

  _prune() {
    if (!this.isOpen) this._show();
  }

  dispose() {
    clearInterval(this._timer);
    window.removeEventListener('keydown', this._onKey, true);
    this.el.remove();
  }
}
