/**
 * BroadcastTransport.js — F9-01: transporte via `BroadcastChannel` (abas da mesma origem).
 * Só para a prova de conceito 1v1 em 2 abas (`net-poc.html`); troque por WebRTC na F9-03.
 * `BroadcastChannel` não devolve a mensagem à própria aba, então não há eco a filtrar.
 */
import { Transport } from './Transport.js';

export class BroadcastTransport extends Transport {
  /** @param {string} channelName */
  constructor(channelName = 'warpoly-lockstep') {
    super();
    this._ch = new BroadcastChannel(channelName);
    this._ch.onmessage = (ev) => this._emit(ev.data);
  }

  send(msg) {
    this._ch.postMessage(msg);
  }

  close() {
    this._ch.close();
    super.close();
  }
}
