// F9-02: WebRTCTransport com RTCPeerConnection falso (malha de 3 pares, sinalização em memória).
import { describe, it, expect } from 'vitest';
import { WebRTCTransport } from '../../src/net/WebRTCTransport.js';

/** Mundo falso: cada FakePC se liga ao par correspondente via offer/answer carimbados com o id do dono. */
function makeWorld() {
  const pcs = new Map(); // "owner" id -> {peerId -> FakePC}
  const queue = [];
  const world = {
    pcs,
    flush() {
      while (queue.length) queue.shift()();
    },
    defer: (f) => queue.push(f)
  };
  const make = (ownerId) =>
    class FakePC {
      constructor() {
        this.connectionState = 'new';
        this.remote = null;
        this.added = [];
        this.owner = ownerId;
      }
      createDataChannel() {
        this.dc = new FakeDC();
        return this.dc;
      }
      async createOffer() {
        return { type: 'offer', sdp: `offer-from-${ownerId}` };
      }
      async createAnswer() {
        return { type: 'answer', sdp: `answer-from-${ownerId}` };
      }
      async setLocalDescription(d) {
        this.localDescription = d;
      }
      async setRemoteDescription(d) {
        this.remote = d;
        const from = Number(d.sdp.split('-').pop());
        this.remoteId = from;
        if (d.type === 'answer') {
          // fecha o laço: canais abrem dos dois lados
          const other = world.pcs.get(from);
          const peerPc = other.byRemote.get(ownerId);
          world.defer(() => {
            this.dc.peer = peerPc.incoming;
            peerPc.incoming.peer = this.dc;
            this.dc.open();
            peerPc.incoming.open();
          });
        } else {
          const me = world.pcs.get(ownerId);
          me.byRemote.set(from, this);
          this.incoming = new FakeDC();
          this.ondatachannel?.({ channel: this.incoming });
        }
      }
      async addIceCandidate(c) {
        if (!this.remote) throw new Error('ICE antes da descrição remota');
        this.added.push(c);
      }
      close() {
        this.connectionState = 'closed';
      }
    };
  return { world, make };
}

class FakeDC {
  constructor() {
    this.readyState = 'connecting';
    this.sent = [];
  }
  open() {
    this.readyState = 'open';
    this.onopen?.();
  }
  send(s) {
    this.sent.push(s);
    this.peer?.onmessage?.({ data: s });
  }
  close() {
    this.readyState = 'closed';
  }
}

function setup(ids) {
  const { world, make } = makeWorld();
  const ts = new Map();
  for (const id of ids) {
    world.pcs.set(id, { byRemote: new Map() });
    const t = new WebRTCTransport({
      localId: id,
      RTCPeerConnectionImpl: make(id),
      sendSignal: (to, data) => world.defer(() => ts.get(to).handleSignal(id, data))
    });
    ts.set(id, t);
  }
  return { world, ts };
}

const settle = async (world) => {
  for (let i = 0; i < 20; i++) {
    world.flush();
    await new Promise((r) => setTimeout(r, 0));
  }
};

describe('WebRTCTransport', () => {
  it('forma malha de 3 pares; menor id inicia; send difunde e recebe sem eco', async () => {
    const { world, ts } = setup([1, 2, 3]);
    for (const [id, t] of ts) for (const o of ts.keys()) if (o !== id) t.addPeer(o);
    await settle(world);
    for (const t of ts.values()) expect(t.allOpen()).toBe(true);
    const got = { 1: [], 2: [], 3: [] };
    for (const [id, t] of ts) t.onMessage((m) => got[id].push(m));
    ts.get(2).send({ k: 'turn', turn: 5, cmds: [] });
    expect(got[1]).toEqual([{ k: 'turn', turn: 5, cmds: [] }]);
    expect(got[3]).toEqual([{ k: 'turn', turn: 5, cmds: [] }]);
    expect(got[2]).toEqual([]);
  });

  it('enfileira mensagens para pares ainda conectando e descarta lixo recebido', async () => {
    const { world, ts } = setup([1, 2]);
    ts.get(1).addPeer(2);
    ts.get(1).send({ k: 'early' }); // canal ainda não aberto
    const got = [];
    ts.get(2).onMessage((m) => got.push(m));
    ts.get(2).addPeer(1);
    await settle(world);
    expect(got).toEqual([{ k: 'early' }]);
    const dc = ts.get(2).peers.get(1).dc;
    dc.onmessage({ data: 'não json' });
    dc.onmessage({ data: 123 });
    dc.onmessage({ data: 'x'.repeat(70000) });
    expect(got).toHaveLength(1);
  });

  it('enfileira ICE que chega antes da descrição remota e fecha par removido', async () => {
    const { world, ts } = setup([1, 2]);
    const t2 = ts.get(2);
    await t2.handleSignal(1, { type: 'ice', candidate: 'cand', sdpMid: '0', sdpMLineIndex: 0 });
    const pc = t2.peers.get(1).pc;
    expect(pc.added).toHaveLength(0);
    await t2.handleSignal(1, { type: 'offer', sdp: 'offer-from-1' });
    expect(pc.added).toHaveLength(1);
    await settle(world);
    let closed = null;
    t2.onPeerClose = (id) => (closed = id);
    t2.removePeer(1);
    expect(closed).toBe(1);
    expect(t2.peers.size).toBe(0);
  });
});
