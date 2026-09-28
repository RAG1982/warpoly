/**
 * GameStateMachine.js — Máquina de estados do jogo (F2-04).
 *
 *   Boot → MainMenu ⇄ MatchSetup → Loading → InGame ⇄ Paused
 *                                              InGame → PostGame → (MainMenu | Loading)
 *                                              Paused → (Loading | MainMenu)   (Reiniciar / Menu / Sair)
 *   Boot → Loading                             (URL de atalho: ?play, ?skipPreload, ?bench…)
 *   Loading → MainMenu                          (falha ao criar a partida)
 *
 * Lógica pura: sem DOM nem three.js (testável em Node). Quem usa registra `handlers`
 * por estado: `{ enter(ctx), exit(ctx) }`, com `ctx = { from, to, payload }`.
 * `exit` do estado atual roda antes de o estado mudar; `enter` do novo, depois.
 * Um `enter` pode pedir outra transição (ex.: Loading → InGame ao terminar); ela é
 * enfileirada e roda assim que a transição corrente acabar.
 */

export const GameState = Object.freeze({
  BOOT: 'Boot',
  MAIN_MENU: 'MainMenu',
  MATCH_SETUP: 'MatchSetup',
  LOADING: 'Loading',
  IN_GAME: 'InGame',
  PAUSED: 'Paused',
  POST_GAME: 'PostGame'
});

/** Transições permitidas: estado → estados de destino. */
export const TRANSITIONS = Object.freeze({
  [GameState.BOOT]: Object.freeze([GameState.MAIN_MENU, GameState.LOADING]),
  [GameState.MAIN_MENU]: Object.freeze([GameState.MATCH_SETUP]),
  [GameState.MATCH_SETUP]: Object.freeze([GameState.MAIN_MENU, GameState.LOADING]),
  [GameState.LOADING]: Object.freeze([GameState.IN_GAME, GameState.MAIN_MENU]),
  [GameState.IN_GAME]: Object.freeze([GameState.PAUSED, GameState.POST_GAME]),
  [GameState.PAUSED]: Object.freeze([GameState.IN_GAME, GameState.LOADING, GameState.MAIN_MENU]),
  [GameState.POST_GAME]: Object.freeze([GameState.MAIN_MENU, GameState.LOADING])
});

const ALL_STATES = new Set(Object.values(GameState));

export function isValidTransition(from, to) {
  const allowed = TRANSITIONS[from];
  return !!allowed && allowed.includes(to);
}

export class GameStateMachine {
  /**
   * @param {object} [opts]
   * @param {Record<string, {enter?: Function, exit?: Function}>} [opts.handlers]
   * @param {string} [opts.initial]  estado inicial (padrão Boot; não chama enter)
   */
  constructor({ handlers = {}, initial = GameState.BOOT } = {}) {
    if (!ALL_STATES.has(initial)) throw new Error(`GameStateMachine: estado inicial inválido "${initial}"`);
    this._state = initial;
    this._previous = null;
    this._handlers = { ...handlers };
    this._listeners = new Set();
    this._busy = false;
    this._queue = [];
    /** Histórico de transições concluídas: [{ from, to }] (útil em testes e depuração). */
    this.history = [];
  }

  get state() {
    return this._state;
  }

  get previous() {
    return this._previous;
  }

  is(state) {
    return this._state === state;
  }

  /** true se a transição do estado atual para `to` é permitida. */
  can(to) {
    return isValidTransition(this._state, to);
  }

  /** Registra (ou troca) os handlers de um estado. */
  setHandler(state, handler) {
    if (!ALL_STATES.has(state)) throw new Error(`GameStateMachine: estado desconhecido "${state}"`);
    this._handlers[state] = handler;
  }

  /** Ouve mudanças de estado: fn({ from, to, payload }). Retorna função para cancelar. */
  onChange(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  /**
   * Troca de estado. Lança Error se a transição não for permitida a partir do estado
   * em que a máquina estará quando a transição rodar (transições pedidas de dentro de
   * enter/exit são enfileiradas).
   * @returns {boolean} true se executou agora; false se foi enfileirada.
   */
  transition(to, payload = undefined) {
    if (!ALL_STATES.has(to)) throw new Error(`GameStateMachine: estado desconhecido "${to}"`);
    if (this._busy) {
      this._queue.push({ to, payload });
      return false;
    }
    this._run(to, payload);
    while (this._queue.length) {
      const next = this._queue.shift();
      this._run(next.to, next.payload);
    }
    return true;
  }

  /**
   * Como `transition`, mas devolve false (sem lançar) se a transição não for permitida
   * a partir do estado atual. Erros dos handlers continuam sendo propagados.
   */
  tryTransition(to, payload = undefined) {
    if (!this._busy && !this.can(to)) return false;
    this.transition(to, payload);
    return true;
  }

  _run(to, payload) {
    const from = this._state;
    if (!isValidTransition(from, to)) {
      this._queue.length = 0;
      throw new Error(`GameStateMachine: transição inválida ${from} → ${to}`);
    }
    const ctx = { from, to, payload };
    this._busy = true;
    try {
      this._handlers[from]?.exit?.(ctx);
      this._previous = from;
      this._state = to;
      this.history.push({ from, to });
      this._handlers[to]?.enter?.(ctx);
      this._listeners.forEach((fn) => fn(ctx));
    } catch (err) {
      this._queue.length = 0;
      throw err;
    } finally {
      this._busy = false;
    }
  }
}
