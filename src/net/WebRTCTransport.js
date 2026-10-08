/**
 * WebRTCTransport.js — F9-02: `Transport` em malha completa sobre RTCDataChannel (ver
 * docs/09_MULTIPLAYER.md §5). Um canal confiável e ordenado (`ordered:true`) por par; `send(msg)`
 * difunde o JSON a todos os canais abertos (e guarda em fila curta o que for enviado a pares ainda
 * conectando). Regra anti-colisão: o par de MENOR id inicia (cria o canal e a offer).
 *
 * A sinalização é injetada (`sendSignal(to, data)`), então a classe não conhece WebSocket e o teste
 * usa pares falsos. `attach(signalingClient)` liga `signal` ↔ `sendSignal` do `SignalingClient`.
 * Eventos de ciclo de vida: `onPeerOpen/onPeerClose` (fn(id)) e `allOpen(ids)`.
 */
import { Transport } from './Transport.js';

const MAX_QUEUE = 256;
const MAX_INBOUND_BYTES = 64 * 1024;

export const DEFAULT_RTC_CONFIG = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

export class WebRTCTransport extends Transport {
  /**
   * @param {object} o
   * @param {number} o.localId
   * @param {(to: number, data: object) => void} o.sendSignal
   * @param {typeof RTCPeerConnection} [o.RTCPeerConnectionImpl]
   * @param {object} [o.rtcConfig]  inclua `iceServers` com TURN se disponível
   * @param {(id: number) => void} [o.onPeerOpen]
   * @param {(id: number) => void} [o.onPeerClose]
   */
  constructor({ localId, sendSignal, RTCPeerConnectionImpl = globalThis.RTCPeerConnection, rtcConfig = DEFAULT_RTC_CONFIG, onPeerOpen, onPeerClose }) {
    super();
    this.localId = localId;
    this._sendSignal = sendSignal;
    this._RTC = RTCPeerConnectionImpl;
    this._rtcConfig = rtcConfig;
    this.onPeerOpen = onPeerOpen;
    this.onPeerClose = onPeerClose;
    /** @type {Map<number, {pc: object, dc: object|null, queue: string[], pendingIce: object[], remoteSet: boolean}>} */
    this.peers = new Map();
    this._detach = null;
  }

  /** Liga a um SignalingClient: signal recebido → handleSignal; sala → addPeer/removePeer. */
  attach(sig) {
    const offs = [
      sig.on('signal', (m) => this.handleSignal(m.from, m.data)),
      sig.on('peer-left', (m) => this.removePeer(m.id)),
      sig.on('peer-joined', (m) => this.addPeer(m.id))
    ];
    this._sendSignal = (to, data) => sig.signal(to, data);
    this._detach = () => offs.forEach((f) => f());
    for (const p of sig.room?.players ?? []) if (p.id !== this.localId) this.addPeer(p.id);
  }

  /** Cria a conexão com `id` (idempotente). O menor id inicia a offer. */
  addPeer(id) {
    if (id === this.localId) return null;
    let p = this.peers.get(id);
    if (p) return p;
    const pc = new this._RTC(this._rtcConfig);
    p = { pc, dc: null, queue: [], pendingIce: [], remoteSet: false };
    this.peers.set(id, p);
    pc.onicecandidate = (ev) => {
      const c = ev.candidate;
      this._sendSignal(id, c ? { type: 'ice', candidate: c.candidate, sdpMid: c.sdpMid ?? null, sdpMLineIndex: c.sdpMLineIndex ?? null } : { type: 'ice', candidate: null });
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') this._closed(id);
    };
    pc.ondatachannel = (ev) => this._bindChannel(id, ev.channel);
    if (this.localId < id) {
      this._bindChannel(id, pc.createDataChannel('lockstep', { ordered: true }));
      pc.createOffer()
        .then((offer) => pc.setLocalDescription(offer).then(() => this._sendSignal(id, { type: 'offer', sdp: (pc.localDescription || offer).sdp })))
        .catch(() => this._closed(id));
    }
    return p;
  }

  removePeer(id) {
    const p = this.peers.get(id);
    if (!p) return;
    this.peers.delete(id);
    try {
      p.dc?.close();
      p.pc.close();
    } catch {
      /* já fechado */
    }
    this.onPeerClose?.(id);
  }

  async handleSignal(from, data) {
    if (!data || typeof data !== 'object') return;
    const p = this.addPeer(from);
    if (!p) return;
    const pc = p.pc;
    try {
      if (data.type === 'offer') {
        await pc.setRemoteDescription({ type: 'offer', sdp: data.sdp });
        p.remoteSet = true;
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        this._sendSignal(from, { type: 'answer', sdp: (pc.localDescription || answer).sdp });
        await this._flushIce(p);
      } else if (data.type === 'answer') {
        await pc.setRemoteDescription({ type: 'answer', sdp: data.sdp });
        p.remoteSet = true;
        await this._flushIce(p);
      } else if (data.type === 'ice') {
        if (p.remoteSet) await pc.addIceCandidate(data.candidate === null ? null : { candidate: data.candidate, sdpMid: data.sdpMid, sdpMLineIndex: data.sdpMLineIndex });
        else p.pendingIce.push(data);
      }
    } catch {
      this._closed(from);
    }
  }

  async _flushIce(p) {
    const list = p.pendingIce;
    p.pendingIce = [];
    for (const d of list) await p.pc.addIceCandidate(d.candidate === null ? null : { candidate: d.candidate, sdpMid: d.sdpMid, sdpMLineIndex: d.sdpMLineIndex });
  }

  _bindChannel(id, dc) {
    const p = this.peers.get(id);
    if (!p) return;
    p.dc = dc;
    dc.onopen = () => {
      for (const s of p.queue) dc.send(s);
      p.queue = [];
      this.onPeerOpen?.(id);
    };
    dc.onclose = () => this._closed(id);
    dc.onmessage = (ev) => {
      const raw = ev.data;
      if (typeof raw !== 'string' || raw.length > MAX_INBOUND_BYTES) return;
      let msg;
      try {
        msg = JSON.parse(raw);
      } catch {
        return;
      }
      if (msg && typeof msg === 'object') this._emit(msg);
    };
    if (dc.readyState === 'open') dc.onopen();
  }

  _closed(id) {
    if (this.peers.has(id)) this.removePeer(id);
  }

  /** true se há canal aberto com todos os `ids` (ou com todos os pares conhecidos). */
  allOpen(ids = [...this.peers.keys()]) {
    return ids.every((id) => this.peers.get(id)?.dc?.readyState === 'open');
  }

  send(msg) {
    const s = JSON.stringify(msg);
    for (const p of this.peers.values()) {
      if (p.dc && p.dc.readyState === 'open') p.dc.send(s);
      else if (p.queue.length < MAX_QUEUE) p.queue.push(s);
    }
  }

  close() {
    this._detach?.();
    for (const id of [...this.peers.keys()]) this.removePeer(id);
    super.close();
  }
}
