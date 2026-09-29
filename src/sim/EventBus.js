/**
 * EventBus.js — F2-07: barramento de eventos da simulação.
 *
 * Puro (sem three.js/DOM): a simulação (Unit/Building/Tree/ResourceDeposit/Arrow/GameManager.simStep/ai/**)
 * emite eventos em vez de chamar `soundManager`/`particleSystem`/`uiManager` diretamente. Os
 * ouvintes (camada de apresentação: `src/audio/AudioEvents.js`, `src/render/VfxEvents.js`,
 * `src/ui/UiEvents.js`) são registrados pela `MatchSession` e decidem sozinhos as condições de
 * visibilidade (névoa, `isLocal`) a partir do payload (`pos`/`ownerId`).
 *
 * Eventos são **enfileirados** durante o passo de simulação (`emit`) e **despachados** só em
 * `flush()`, na ordem de emissão — nunca durante o próprio passo (replays/determinismo: o efeito
 * visual/sonoro nunca roda em paralelo com a lógica de estado). `GameManager.simStep` chama
 * `flush()` no fim do passo; `GameManager.renderUpdate` também chama `flush()` no fim do quadro
 * (VFX de apresentação disparado fora do tick fixo — chaminés, faíscas — não deve esperar até
 * 50 ms pelo próximo `simStep`).
 */

/** Congela `payload` (e o objeto `pos`, se houver) para nunca ser mutado por um ouvinte. */
function freezePayload(payload) {
  if (payload && typeof payload === 'object') {
    if (payload.pos && typeof payload.pos === 'object') Object.freeze(payload.pos);
    Object.freeze(payload);
  }
  return payload;
}

export class EventBus {
  constructor() {
    /** @type {Map<string, Set<Function>>} */
    this._listeners = new Map();
    this._queue = [];
    /** Replays futuros (F9-05): ignora ouvintes sem deixar de aceitar `emit`/`flush`. */
    this.muted = false;
  }

  /**
   * @param {string} type
   * @param {(payload: object) => void} fn
   * @returns {() => void} `off` — remove este ouvinte.
   */
  on(type, fn) {
    let set = this._listeners.get(type);
    if (!set) {
      set = new Set();
      this._listeners.set(type, set);
    }
    set.add(fn);
    return () => this.off(type, fn);
  }

  off(type, fn) {
    const set = this._listeners.get(type);
    if (set) set.delete(fn);
  }

  /** Enfileira `payload` (só dados: ids, tipo, `pos` copiada, números — nunca objetos three.js). */
  emit(type, payload) {
    this._queue.push({ type, payload: freezePayload(payload) });
  }

  /** Despacha a fila para os ouvintes, na ordem de emissão, e a esvazia. */
  flush() {
    if (this._queue.length === 0) return;
    const queue = this._queue;
    this._queue = [];
    if (this.muted) return;
    for (let i = 0; i < queue.length; i++) {
      const { type, payload } = queue[i];
      const set = this._listeners.get(type);
      if (!set || set.size === 0) continue;
      set.forEach(fn => fn(payload));
    }
  }

  /** Remove todos os ouvintes e esvazia a fila (sem despachar). */
  clear() {
    this._queue.length = 0;
    this._listeners.clear();
  }
}
