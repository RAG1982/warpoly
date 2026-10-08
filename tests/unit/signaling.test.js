// F9-02: servidor de sinalização em porta efêmera com clientes `ws` simulados.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import WebSocket from 'ws';
import { createSignalingServer } from '../../server/signaling.js';
import { parseClientMessage } from '../../server/protocol.js';

class Client {
  constructor(port) {
    this.ws = new WebSocket(`ws://127.0.0.1:${port}`);
    this.inbox = [];
    this.waiters = [];
    this.closed = new Promise((res) => this.ws.on('close', (code) => res(code)));
    this.ws.on('message', (d) => {
      const m = JSON.parse(d.toString());
      this.inbox.push(m);
      this.waiters = this.waiters.filter((w) => !w());
    });
    this.opened = new Promise((res) => this.ws.on('open', res));
  }
  async hello() {
    await this.opened;
    const m = await this.next('hello');
    this.id = m.id;
    return this;
  }
  send(m) {
    this.ws.send(typeof m === 'string' ? m : JSON.stringify(m));
  }
  /** Próxima mensagem do tipo `t` ainda não consumida. */
  next(t, timeout = 2000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timeout esperando ${t}; inbox=${JSON.stringify(this.inbox)}`)), timeout);
      const check = () => {
        const i = this.inbox.findIndex((m) => m.t === t);
        if (i < 0) return false;
        clearTimeout(timer);
        resolve(this.inbox.splice(i, 1)[0]);
        return true;
      };
      if (!check()) this.waiters.push(check);
    });
  }
}

let srv;
const clients = [];
const mk = async () => {
  const c = await new Client(srv.port).hello();
  clients.push(c);
  return c;
};

beforeEach(async () => {
  srv = createSignalingServer({ port: 0, sweepMs: 20, idleMs: 100_000 });
  await srv.ready;
});
afterEach(async () => {
  for (const c of clients.splice(0)) c.ws.terminate();
  await srv.close();
});

describe('protocolo (validação)', () => {
  it('aceita válidas e rejeita lixo sem lançar', () => {
    expect(parseClientMessage('{"t":"list"}').msg).toBeTruthy();
    expect(parseClientMessage('nao json').error).toBe('bad-json');
    expect(parseClientMessage('{"t":"foo"}').error).toBe('unknown-type');
    expect(parseClientMessage('{"t":"__proto__"}').error).toBe('unknown-type');
    expect(parseClientMessage('{"t":"list","extra":1}').error).toBe('invalid-fields');
    expect(parseClientMessage('{"t":"chat","text":""}').error).toBe('invalid-fields');
    expect(parseClientMessage('{"t":"create","name":"<script>"}').error).toBe('invalid-fields');
    expect(parseClientMessage('{"t":"signal","to":2,"data":{"type":"offer","sdp":"x"}}').msg).toBeTruthy();
    expect(parseClientMessage('{"t":"signal","to":2,"data":{"type":"zzz"}}').error).toBe('invalid-fields');
    expect(parseClientMessage('[1]').error).toBe('bad-message');
    expect(parseClientMessage('x'.repeat(20000)).error).toBe('too-large');
  });
});

describe('servidor de sinalização', () => {
  it('cria, entra, lista pública, relé e saída/transferência de anfitrião', async () => {
    const a = await mk();
    const b = await mk();
    const c = await mk();
    a.send({ t: 'create', name: 'Ana', public: true, config: { map: 'continental-1v1' } });
    const joined = await a.next('joined');
    const code = joined.room.code;
    expect(code).toMatch(/^[A-Z0-9]{5}$/);
    expect(joined.room.host).toBe(a.id);

    b.send({ t: 'list' });
    const list = await b.next('rooms');
    expect(list.rooms).toEqual([expect.objectContaining({ code, host: 'Ana', players: 1, maxPlayers: 8 })]);

    b.send({ t: 'join', code, name: 'Bia' });
    const bj = await b.next('joined');
    expect(bj.room.players.map((p) => p.name)).toEqual(['Ana', 'Bia']);
    expect((await a.next('peer-joined')).id).toBe(b.id);
    c.send({ t: 'join', code, name: 'Caio' });
    await c.next('joined');

    // relé de sinalização: só o destinatário recebe, com `from` carimbado pelo servidor
    a.send({ t: 'signal', to: b.id, data: { type: 'offer', sdp: 'v=0' } });
    const sig = await b.next('signal');
    expect(sig).toEqual({ t: 'signal', from: a.id, data: { type: 'offer', sdp: 'v=0' } });
    a.send({ t: 'signal', to: 9999, data: { type: 'ice', candidate: null } });
    expect((await a.next('error')).code).toBe('no-such-peer');
    expect(c.inbox.filter((m) => m.t === 'signal')).toHaveLength(0);

    // chat
    b.send({ t: 'chat', text: 'olá' });
    expect((await c.next('chat')).text).toBe('olá');

    // anfitrião sai => menor id vivo assume
    a.ws.close();
    const left = await b.next('peer-left');
    expect(left.id).toBe(a.id);
    expect(left.host).toBe(b.id);
    b.send({ t: 'config', config: { map: 'estreito-1v1' } });
    let room;
    do room = await b.next('room');
    while (room.config.map !== 'estreito-1v1');
    expect(room.host).toBe(b.id);
  });

  it('pronto / iniciar: só anfitrião, só com todos prontos; sala iniciada some da lista', async () => {
    const a = await mk();
    const b = await mk();
    a.send({ t: 'create', name: 'Ana', public: true });
    const { room } = await a.next('joined');
    b.send({ t: 'join', code: room.code, name: 'Bia' });
    await b.next('joined');
    b.send({ t: 'start' });
    expect((await b.next('error')).code).toBe('not-host');
    a.send({ t: 'start' });
    expect((await a.next('error')).code).toBe('not-all-ready');
    b.send({ t: 'ready', ready: true });
    await a.next('room');
    a.send({ t: 'start' });
    const st = await b.next('start');
    expect(st.players).toHaveLength(2);
    expect(Number.isInteger(st.seed)).toBe(true);
    a.send({ t: 'list' });
    expect((await a.next('rooms')).rooms).toHaveLength(0);
    const late = await mk();
    late.send({ t: 'join', code: room.code, name: 'Tarde' });
    expect((await late.next('error')).code).toBe('already-started');
  });

  it('limite de 8 jogadores, sala inexistente e mudança de config só do anfitrião', async () => {
    const h = await mk();
    h.send({ t: 'create', name: 'Host' });
    const { room } = await h.next('joined');
    for (let i = 0; i < 7; i++) {
      const p = await mk();
      p.send({ t: 'join', code: room.code, name: 'P' + i });
      await p.next('joined');
    }
    const extra = await mk();
    extra.send({ t: 'join', code: room.code, name: 'Extra' });
    expect((await extra.next('error')).code).toBe('room-full');
    extra.send({ t: 'join', code: 'ZZZZZ', name: 'Extra' });
    expect((await extra.next('error')).code).toBe('no-such-room');
    clients[1].send({ t: 'config', config: { map: 'x' } });
    expect((await clients[1].next('error')).code).toBe('not-host');
  });

  it('mensagem inválida/grande gera erro; reincidência derruba a conexão', async () => {
    const a = await mk();
    a.send('lixo');
    expect((await a.next('error')).code).toBe('bad-json');
    a.send(JSON.stringify({ t: 'chat', text: 'x'.repeat(500) }));
    expect((await a.next('error')).code).toBe('invalid-fields');
    for (let i = 0; i < 5; i++) a.send('lixo');
    expect(await a.closed).toBe(1008);
    const big = await mk();
    big.send('x'.repeat(40_000)); // acima de maxPayload do ws
    expect(await big.closed).toBe(1009);
  });

  it('limite de taxa', async () => {
    await srv.close();
    srv = createSignalingServer({ port: 0, rateBurst: 5, ratePerSec: 0.001, strikesToKick: 3 });
    await srv.ready;
    const a = await mk();
    for (let i = 0; i < 12; i++) a.send({ t: 'ping' });
    expect(await a.closed).toBe(1008);
  });

  it('expulsa por inatividade', async () => {
    await srv.close();
    let t = 0;
    srv = createSignalingServer({ port: 0, sweepMs: 10, idleMs: 1000, now: () => t });
    await srv.ready;
    const a = await mk();
    t = 5000;
    expect(await a.closed).toBe(4000);
  });

  it('F9-04: quem cai no meio da partida volta com rejoin{code,token}; token errado e saída voluntária não voltam', async () => {
    const a = await mk();
    const b = await mk();
    a.send({ t: 'create', name: 'Ana' });
    const ja = await a.next('joined');
    expect(ja.token).toMatch(/^[a-f0-9]{16,}$/);
    b.send({ t: 'join', code: ja.room.code, name: 'Bia' });
    const jb = await b.next('joined');
    await a.next('peer-joined');
    b.send({ t: 'ready', ready: true });
    await a.next('room');
    a.send({ t: 'start' });
    const st = await b.next('start');
    const oldId = b.id;
    b.ws.terminate(); // queda de rede
    await a.next('peer-left');
    const b2 = await mk();
    b2.send({ t: 'rejoin', code: ja.room.code, token: 'ab'.repeat(12) });
    expect((await b2.next('error')).code).toBe('no-such-room');
    b2.send({ t: 'rejoin', code: ja.room.code, token: jb.token });
    const rj = await b2.next('rejoined');
    expect(rj.oldId).toBe(oldId);
    expect(rj.slot).toBe(oldId); // a vaga mantém o id da mensagem `start`
    expect(rj.start.seed).toBe(st.seed);
    expect(rj.start.players).toHaveLength(2);
    const pj = await a.next('peer-joined');
    expect(pj).toMatchObject({ id: b2.id, rejoin: true, oldId });
    // o token só vale uma vez
    const b3 = await mk();
    b3.send({ t: 'rejoin', code: ja.room.code, token: jb.token });
    expect((await b3.next('error')).code).toBe('no-such-room');
    // quem sai de propósito não volta
    b2.send({ t: 'leave' });
    await a.next('peer-left');
    const b4 = await mk();
    b4.send({ t: 'rejoin', code: ja.room.code, token: rj.token });
    expect((await b4.next('error')).code).toBe('no-such-room');
  });
});
