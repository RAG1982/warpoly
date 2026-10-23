/**
 * SignalingClient.js — F9-02: cliente WebSocket do servidor de sinalização/lobby (`server/`).
 *
 * Eventos (via `on(tipo, fn)`): todo `t` do servidor (`hello`, `joined`, `room`, `rooms`,
 * `rejoined`, `peer-joined`, `peer-left`, `signal`, `chat`, `start`, `kicked`, `error`, `pong`) mais os locais
 * `open`, `close` e `reconnecting`. Reconexão simples: backoff exponencial 0,5 s → 8 s, até
 * `maxRetries`. O servidor não guarda sessão: após reconectar o id muda (novo `hello`) e a
 * camada de cima decide se reentra na sala (`rejoin()` usa o último código). `ping` periódico
 * mantém a conexão viva contra a expulsão por inatividade.
 */
export class SignalingClient {
  /**
   * @param {object} o
   * @param {string} o.url  ws://host:porta
   * @param {typeof WebSocket} [o.WebSocketImpl]
   * @param {boolean} [o.reconnect=true]
   * @param {number} [o.maxRetries=6]
   * @param {number} [o.pingMs=20000]
   */
  constructor({ url, WebSocketImpl = globalThis.WebSocket, reconnect = true, maxRetries = 6, pingMs = 20000, setTimer = setTimeout, clearTimer = clearTimeout }) {
    this.url = url;
    this.WS = WebSocketImpl;
    this.autoReconnect = reconnect;
    this.maxRetries = maxRetries;
    this.pingMs = pingMs;
    // Wrappers: chamar `setTimeout`/`clearTimeout` como método do cliente dá "Illegal invocation" no navegador.
    this._setTimer = (fn, ms) => setTimer(fn, ms);
    this._clearTimer = (id) => clearTimer(id);
    this._handlers = new Map();
    this._retries = 0;
    this._closedByUser = false;
    this._ws = null;
    this.id = null;
    this.room = null;
    this.name = null;
    this._lastCode = null;
    /** F9-04: token da vaga (devolvido em `joined`/`rejoined`) para voltar à partida em andamento. */
    this.token = null;
    this._pingTimer = null;
    this._retryTimer = null;
  }

  on(type, fn) {
    if (!this._handlers.has(type)) this._handlers.set(type, new Set());
    this._handlers.get(type).add(fn);
    return () => this._handlers.get(type).delete(fn);
  }

  _emit(type, data) {
    const hs = this._handlers.get(type);
    if (hs) for (const fn of [...hs]) fn(data);
  }

  get connected() {
    return !!this._ws && this._ws.readyState === 1;
  }

  connect() {
    this._closedByUser = false;
    const ws = new this.WS(this.url);
    this._ws = ws;
    ws.onopen = () => {
      this._retries = 0;
      this._startPing();
      this._emit('open', {});
    };
    ws.onmessage = (ev) => {
      let m;
      try {
        m = JSON.parse(typeof ev.data === 'string' ? ev.data : String(ev.data));
      } catch {
        return;
      }
      if (!m || typeof m.t !== 'string') return;
      if (m.t === 'hello') this.id = m.id;
      if (m.t === 'joined' || m.t === 'rejoined') {
        this.id = m.you;
        this.room = m.room;
        this._lastCode = m.room.code;
        if (typeof m.token === 'string') this.token = m.token;
      } else if (m.t === 'room') {
        this.room = m;
      }
      this._emit(m.t, m);
    };
    ws.onclose = () => {
      this._stopPing();
      if (this._ws === ws) this._ws = null;
      this.room = null;
      this._emit('close', {});
      if (!this._closedByUser && this.autoReconnect && this._retries < this.maxRetries) {
        const delay = Math.min(8000, 500 * 2 ** this._retries++);
        this._emit('reconnecting', { attempt: this._retries, delay });
        this._retryTimer = this._setTimer(() => this.connect(), delay);
      }
    };
    ws.onerror = () => {};
    return this;
  }

  /** @returns {boolean} false se a conexão não está aberta (mensagem descartada) */
  send(msg) {
    if (!this.connected) return false;
    this._ws.send(JSON.stringify(msg));
    return true;
  }

  // Atalhos do protocolo.
  create(name, opts = {}) {
    this.name = name;
    return this.send({ t: 'create', name, ...opts });
  }
  join(code, name) {
    this.name = name;
    return this.send({ t: 'join', code: String(code).trim().toUpperCase(), name });
  }
  /** Reentra na última sala após reconexão. */
  rejoin() {
    return this._lastCode && this.name ? this.join(this._lastCode, this.name) : false;
  }
  /** F9-04: volta à partida em andamento na mesma vaga (após queda/recarga), com o token da sala. */
  rejoinGame(code = this._lastCode, token = this.token) {
    return code && token ? this.send({ t: 'rejoin', code: String(code).toUpperCase(), token }) : false;
  }
  list() {
    return this.send({ t: 'list' });
  }
  leave() {
    this._lastCode = null;
    return this.send({ t: 'leave' });
  }
  chat(text) {
    return this.send({ t: 'chat', text });
  }
  setReady(ready) {
    return this.send({ t: 'ready', ready });
  }
  setup(fields) {
    return this.send({ t: 'setup', ...fields });
  }
  setConfig(config) {
    return this.send({ t: 'config', config });
  }
  kick(id) {
    return this.send({ t: 'kick', id });
  }
  start() {
    return this.send({ t: 'start' });
  }
  signal(to, data) {
    return this.send({ t: 'signal', to, data });
  }

  close() {
    this._closedByUser = true;
    this._clearTimer(this._retryTimer);
    this._stopPing();
    if (this._ws) this._ws.close();
  }

  _startPing() {
    this._stopPing();
    if (this.pingMs > 0) {
      this._pingTimer = setInterval(() => this.send({ t: 'ping' }), this.pingMs);
    }
  }
  _stopPing() {
    if (this._pingTimer) clearInterval(this._pingTimer);
    this._pingTimer = null;
  }
}
