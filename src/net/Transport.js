/**
 * Transport.js — F9-01: contrato do transporte de rede do lockstep.
 *
 * O `LockstepSession` só conhece esta interface: `send(msg)` difunde um objeto JSON puro para
 * todos os outros pares e `onMessage(fn)` registra o ouvinte das mensagens recebidas. Não há
 * garantia de ordem entre mensagens (a sessão tolera reordenação) nem de entrega instantânea,
 * mas assume-se entrega confiável (WebRTC DataChannel `ordered:true` ou WebSocket). Implementações:
 * `BroadcastTransport` (2 abas, PoC), `MemoryTransport` (testes) e, na F9-03, `WebRtcTransport`.
 */
export class Transport {
  constructor() {
    /** @type {Set<(msg: object) => void>} */
    this._handlers = new Set();
  }

  /** Difunde `msg` (objeto JSON puro) a todos os outros pares. */
  send(_msg) {
    throw new Error('Transport.send não implementado');
  }

  /** @returns {() => void} função que remove o ouvinte */
  onMessage(fn) {
    this._handlers.add(fn);
    return () => this._handlers.delete(fn);
  }

  /** Uso das subclasses: entrega `msg` aos ouvintes. */
  _emit(msg) {
    for (const fn of this._handlers) fn(msg);
  }

  close() {
    this._handlers.clear();
  }
}
