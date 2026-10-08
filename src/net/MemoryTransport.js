/**
 * MemoryTransport.js — F9-01: rede simulada em memória para testes (Node, sem relógio real).
 *
 * `createMemoryNetwork({ latencyMs, jitterMs, seed })` devolve uma "rede" com relógio manual:
 * `net.transport(id)` cria o transporte de um par; `net.advance(ms)` avança o relógio e entrega as
 * mensagens vencidas. Cada mensagem é copiada por JSON (como no fio) e recebe latência
 * `latencyMs + jitter` (jitter pseudoaleatório com seed própria, então mensagens PODEM chegar fora
 * de ordem — a sessão lockstep tem de tolerar isso). `net.tamper` (opcional) permite alterar uma
 * mensagem em trânsito (testes de par malicioso).
 */
import { Transport } from './Transport.js';

class MemoryTransport extends Transport {
  constructor(net, id) {
    super();
    this._net = net;
    this.id = id;
  }

  send(msg) {
    this._net._broadcast(this.id, msg);
  }
}

export function createMemoryNetwork({ latencyMs = 0, jitterMs = 0, seed = 1 } = {}) {
  let rng = seed >>> 0;
  const rand = () => {
    rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0;
    return rng / 4294967296;
  };
  const peers = new Map();
  let now = 0;
  let seq = 0;
  /** @type {{at: number, seq: number, to: number, msg: object}[]} */
  let queue = [];

  const net = {
    tamper: null,
    delivered: 0,
    get now() {
      return now;
    },
    get pending() {
      return queue.length;
    },
    transport(id) {
      const t = new MemoryTransport(net, id);
      peers.set(id, t);
      return t;
    },
    _broadcast(from, msg) {
      for (const id of peers.keys()) {
        if (id === from) continue;
        let copy = JSON.parse(JSON.stringify(msg));
        if (net.tamper) copy = net.tamper(from, id, copy) || copy;
        queue.push({ at: now + latencyMs + rand() * jitterMs, seq: seq++, to: id, msg: copy });
      }
    },
    /** Avança o relógio em `ms` e entrega o que venceu (ordem por instante de chegada, depois envio). */
    advance(ms) {
      now += ms;
      const due = queue.filter((e) => e.at <= now).sort((a, b) => a.at - b.at || a.seq - b.seq);
      if (due.length === 0) return;
      queue = queue.filter((e) => e.at > now);
      for (const e of due) {
        const p = peers.get(e.to);
        if (p) {
          net.delivered++;
          p._emit(e.msg);
        }
      }
    }
  };
  return net;
}
