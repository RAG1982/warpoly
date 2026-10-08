/**
 * signaling.js — F9-02: servidor de sinalização + lobby (Node + `ws`).
 *
 * Só faz: salas por código, lista pública, estado do lobby (pronto/facção/config/iniciar), chat e
 * relé de offer/answer/ICE entre pares da MESMA sala. Nunca vê comandos de jogo (vão por
 * DataChannel). Limites: 8 jogadores/sala, mensagem ≤ 16 KiB, taxa por conexão (token bucket),
 * inatividade (sem mensagem/pong) => expulsão, máx. de salas e de conexões por IP.
 */
import { WebSocketServer } from 'ws';
import { randomInt } from 'node:crypto';
import { parseClientMessage, MAX_MESSAGE_BYTES, MAX_PLAYERS, PROTOCOL_VERSION } from './protocol.js';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function createSignalingServer({
  port = 0,
  host = '127.0.0.1',
  idleMs = 60_000,
  sweepMs = 5_000,
  maxRooms = 500,
  maxConnsPerIp = 20,
  rateBurst = 30,
  ratePerSec = 15,
  strikesToKick = 5,
  now = () => Date.now()
} = {}) {
  const wss = new WebSocketServer({ port, host, maxPayload: MAX_MESSAGE_BYTES });
  /** @type {Map<string, object>} */
  const rooms = new Map();
  const conns = new Set();
  const perIp = new Map();
  let nextId = 1;

  const send = (c, m) => {
    if (c.ws.readyState === 1) c.ws.send(JSON.stringify(m));
  };
  const err = (c, code) => send(c, { t: 'error', code });

  function newCode() {
    for (let i = 0; i < 50; i++) {
      let s = '';
      for (let k = 0; k < 5; k++) s += CODE_CHARS[randomInt(CODE_CHARS.length)];
      if (!rooms.has(s)) return s;
    }
    return null;
  }

  const snapshot = (r) => ({
    t: 'room',
    code: r.code,
    host: r.host,
    public: r.public,
    maxPlayers: r.maxPlayers,
    started: r.started,
    config: r.config,
    players: [...r.members.values()].map((m) => ({ id: m.id, name: m.name, ready: m.ready, faction: m.faction, color: m.color, team: m.team }))
  });
  const broadcast = (r, msg, except = null) => {
    for (const m of r.members.values()) if (m !== except) send(m, msg);
  };
  const pushRoom = (r) => broadcast(r, snapshot(r));

  function publicList() {
    return [...rooms.values()]
      .filter((r) => r.public && !r.started)
      .map((r) => ({ code: r.code, host: r.members.get(r.host)?.name ?? '?', players: r.members.size, maxPlayers: r.maxPlayers, config: r.config }));
  }

  function leaveRoom(c, reason = 'left') {
    const r = c.room;
    if (!r) return;
    c.room = null;
    r.members.delete(c.id);
    if (r.members.size === 0) {
      rooms.delete(r.code);
      return;
    }
    if (r.host === c.id) r.host = Math.min(...r.members.keys()); // menor id assume (docs §5)
    broadcast(r, { t: 'peer-left', id: c.id, reason, host: r.host });
    pushRoom(r);
  }

  function enter(c, r, name) {
    c.room = r;
    c.name = name;
    c.ready = false;
    c.faction = 'human';
    c.color = 0;
    c.team = 0;
    r.members.set(c.id, c);
    send(c, { t: 'joined', you: c.id, room: snapshot(r), v: PROTOCOL_VERSION });
    broadcast(r, { t: 'peer-joined', id: c.id, name }, c);
    pushRoom(r);
  }

  function handle(c, m) {
    const r = c.room;
    const isHost = r && r.host === c.id;
    switch (m.t) {
      case 'ping':
        return send(c, { t: 'pong' });
      case 'list':
        return send(c, { t: 'rooms', rooms: publicList() });
      case 'create': {
        if (r) return err(c, 'already-in-room');
        if (rooms.size >= maxRooms) return err(c, 'server-full');
        const code = newCode();
        if (!code) return err(c, 'server-full');
        const room = { code, host: c.id, public: m.public === true, maxPlayers: m.maxPlayers ?? MAX_PLAYERS, started: false, config: m.config ?? {}, members: new Map() };
        rooms.set(code, room);
        return enter(c, room, m.name);
      }
      case 'join': {
        if (r) return err(c, 'already-in-room');
        const room = rooms.get(m.code);
        if (!room) return err(c, 'no-such-room');
        if (room.started) return err(c, 'already-started');
        if (room.members.size >= room.maxPlayers) return err(c, 'room-full');
        return enter(c, room, m.name);
      }
      case 'leave':
        return leaveRoom(c);
      default:
    }
    if (!r) return err(c, 'not-in-room');
    switch (m.t) {
      case 'signal': {
        const to = r.members.get(m.to);
        if (!to || to === c) return err(c, 'no-such-peer');
        return send(to, { t: 'signal', from: c.id, data: m.data });
      }
      case 'chat':
        return broadcast(r, { t: 'chat', from: c.id, name: c.name, text: m.text.trim() });
      case 'ready':
        c.ready = m.ready;
        return pushRoom(r);
      case 'setup':
        if (m.faction !== undefined) c.faction = m.faction;
        if (m.color !== undefined) c.color = m.color;
        if (m.team !== undefined) c.team = m.team;
        c.ready = false;
        return pushRoom(r);
      case 'config':
        if (!isHost) return err(c, 'not-host');
        r.config = m.config;
        for (const p of r.members.values()) p.ready = false;
        return pushRoom(r);
      case 'kick': {
        if (!isHost) return err(c, 'not-host');
        const t = r.members.get(m.id);
        if (!t || t === c) return err(c, 'no-such-peer');
        send(t, { t: 'kicked', reason: 'host' });
        leaveRoom(t, 'kicked');
        return;
      }
      case 'start': {
        if (!isHost) return err(c, 'not-host');
        if (r.members.size < 2) return err(c, 'need-players');
        if ([...r.members.values()].some((p) => p.id !== r.host && !p.ready)) return err(c, 'not-all-ready');
        r.started = true;
        const players = [...r.members.values()].map((p) => ({ id: p.id, name: p.name, faction: p.faction, color: p.color, team: p.team }));
        const seed = randomInt(1, 2 ** 31 - 1);
        return broadcast(r, { t: 'start', config: r.config, players, seed, startAt: now() + 3000 });
      }
      default:
    }
  }

  wss.on('connection', (ws, req) => {
    const ip = req.socket.remoteAddress || '?';
    const n = (perIp.get(ip) || 0) + 1;
    if (n > maxConnsPerIp) {
      ws.close(1013, 'too-many-connections');
      return;
    }
    perIp.set(ip, n);
    const c = { ws, ip, id: nextId++, room: null, name: '', last: now(), tokens: rateBurst, tokAt: now(), strikes: 0 };
    conns.add(c);
    send(c, { t: 'hello', id: c.id, v: PROTOCOL_VERSION });
    ws.on('pong', () => (c.last = now()));
    ws.on('message', (raw, isBinary) => {
      const t = now();
      c.last = t;
      c.tokens = Math.min(rateBurst, c.tokens + ((t - c.tokAt) / 1000) * ratePerSec);
      c.tokAt = t;
      if (c.tokens < 1) {
        err(c, 'rate-limited');
        if (++c.strikes >= strikesToKick) ws.close(1008, 'rate-limited');
        return;
      }
      c.tokens -= 1;
      if (isBinary) {
        err(c, 'bad-message');
        return;
      }
      const { msg, error } = parseClientMessage(raw.toString());
      if (!msg) {
        err(c, error);
        if (++c.strikes >= strikesToKick) ws.close(1008, 'protocol-violations');
        return;
      }
      handle(c, msg);
    });
    ws.on('close', () => {
      leaveRoom(c, 'disconnected');
      conns.delete(c);
      const k = (perIp.get(ip) || 1) - 1;
      if (k <= 0) perIp.delete(ip);
      else perIp.set(ip, k);
    });
    ws.on('error', () => {});
  });

  // Inatividade: pinga e expulsa quem não responde (nem pong nem mensagens) em `idleMs`.
  const sweep = setInterval(() => {
    const t = now();
    for (const c of conns) {
      if (t - c.last > idleMs) {
        send(c, { t: 'kicked', reason: 'idle' });
        c.ws.close(4000, 'idle');
      } else if (c.ws.readyState === 1) c.ws.ping();
    }
  }, sweepMs);
  sweep.unref?.();

  return {
    rooms,
    get port() {
      return wss.address().port;
    },
    ready: new Promise((res) => wss.once('listening', res)),
    close() {
      clearInterval(sweep);
      for (const c of conns) c.ws.terminate();
      return new Promise((res) => wss.close(res));
    }
  };
}
