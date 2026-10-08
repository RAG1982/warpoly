/**
 * MemoryTransport.js — F9-01/F9-03: rede simulada em memória para testes (Node, sem relógio real).
 *
 * `createMemoryNetwork({ latencyMs, jitterMs, seed, lossRate, resendMs })` devolve uma "rede" com
 * relógio manual: `net.transport(id)` cria o transporte de um par; `net.advance(ms)` avança o
 * relógio e entrega as mensagens vencidas. Cada mensagem é copiada por JSON (como no fio) e recebe
 * latência `latencyMs + jitter` (jitter pseudoaleatório com seed própria, então mensagens PODEM
 * chegar fora de ordem — a sessão lockstep tem de tolerar isso).
 *
 * F9-03: enlaces por par — `net.setLink(a, b, { latencyMs, jitterMs, lossRate, resendMs })` (vale
 * nos dois sentidos; `setLink(a, b, null)` volta ao padrão da rede). `lossRate` simula perda em
 * canal CONFIÁVEL (DataChannel ordered:true retransmite): a mensagem "perdida" chega `resendMs`
 * (padrão 3×latência + 200 ms) mais tarde, o que também a reordena em relação às seguintes.
 * Os parâmetros podem ser mudados durante o teste (atraso adaptativo sobe e desce).
 * `net.tamper` (opcional) permite alterar uma mensagem em trânsito (testes de par malicioso).
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

export function createMemoryNetwork({ latencyMs = 0, jitterMs = 0, seed = 1, lossRate = 0, resendMs = null } = {}) {
  let rng = seed >>> 0;
  const rand = () => {
    rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0;
    return rng / 4294967296;
  };
  const peers = new Map();
  const links = new Map();
  const linkKey = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);
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
    /** Configura (ou remove, com `null`) o enlace entre dois pares; campos omitidos herdam o padrão da rede. */
    setLink(a, b, cfg) {
      if (cfg === null) links.delete(linkKey(a, b));
      else links.set(linkKey(a, b), cfg);
    },
    _broadcast(from, msg) {
      for (const id of peers.keys()) {
        if (id === from) continue;
        let copy = JSON.parse(JSON.stringify(msg));
        if (net.tamper) copy = net.tamper(from, id, copy) || copy;
        const l = links.get(linkKey(from, id)) || {};
        const lat = l.latencyMs ?? latencyMs;
        const jit = l.jitterMs ?? jitterMs;
        const loss = l.lossRate ?? lossRate;
        let delay = lat + rand() * jit;
        if (loss > 0 && rand() < loss) delay += l.resendMs ?? resendMs ?? 3 * lat + 200;
        queue.push({ at: now + delay, seq: seq++, to: id, msg: copy });
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
