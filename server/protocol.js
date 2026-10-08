/**
 * protocol.js — F9-02: validação estrita das mensagens de sinalização/lobby (compartilhada por
 * servidor e testes). Toda mensagem é um objeto JSON `{ t: <tipo>, ... }` com campos conhecidos;
 * campo extra, tipo errado ou tamanho excedido => `null` + motivo (nunca lança).
 */
export const PROTOCOL_VERSION = 1;
export const MAX_PLAYERS = 8;
export const MAX_MESSAGE_BYTES = 16 * 1024;
export const MAX_NAME = 24;
export const MAX_CHAT = 200;

const isStr = (v, max, min = 0) => typeof v === 'string' && v.length >= min && v.length <= max;
const isId = (v) => Number.isInteger(v) && v >= 1 && v <= 1_000_000;
const isBool = (v) => typeof v === 'boolean';
const keys = (m, allowed) => Object.keys(m).every((k) => k === 't' || allowed.includes(k));
const SAFE = /^[\p{L}\p{N} _.\-'()]+$/u;

function isName(v) {
  return isStr(v, MAX_NAME, 1) && SAFE.test(v) && v.trim().length > 0;
}

/** Config da partida escolhida pelo anfitrião: só campos escalares pequenos. */
export function validConfig(c) {
  if (!c || typeof c !== 'object' || Array.isArray(c)) return false;
  const e = Object.entries(c);
  if (e.length > 16) return false;
  return e.every(([k, v]) => /^[a-zA-Z]{1,20}$/.test(k) && (typeof v === 'number' ? Number.isFinite(v) : typeof v === 'boolean' || isStr(v, 40)));
}

/** Dados de sinalização WebRTC: offer/answer {type,sdp} ou ice {candidate...}. */
export function validSignal(d) {
  if (!d || typeof d !== 'object') return false;
  if (d.type === 'offer' || d.type === 'answer') return keys(d, ['type', 'sdp']) && isStr(d.sdp, 12000, 1);
  if (d.type === 'ice') {
    if (!keys(d, ['type', 'candidate', 'sdpMid', 'sdpMLineIndex'])) return false;
    if (d.candidate === null) return true; // fim dos candidatos
    return isStr(d.candidate, 1000) && (d.sdpMid == null || isStr(d.sdpMid, 64)) && (d.sdpMLineIndex == null || (Number.isInteger(d.sdpMLineIndex) && d.sdpMLineIndex >= 0 && d.sdpMLineIndex < 16));
  }
  return false;
}

const verOk = (m) => m.ver === undefined || m.ver === PROTOCOL_VERSION;

const SPEC = {
  list: [[], () => true],
  ping: [[], () => true],
  leave: [[], () => true],
  start: [[], () => true],
  create: [
    ['name', 'public', 'maxPlayers', 'config', 'ver'],
    (m) =>
      isName(m.name) &&
      (m.public === undefined || isBool(m.public)) &&
      (m.maxPlayers === undefined || (Number.isInteger(m.maxPlayers) && m.maxPlayers >= 2 && m.maxPlayers <= MAX_PLAYERS)) &&
      (m.config === undefined || validConfig(m.config)) &&
      verOk(m)
  ],
  join: [['code', 'name', 'ver'], (m) => isStr(m.code, 8, 4) && /^[A-Z0-9]+$/.test(m.code) && isName(m.name) && verOk(m)],
  signal: [['to', 'data'], (m) => isId(m.to) && validSignal(m.data)],
  chat: [['text'], (m) => isStr(m.text, MAX_CHAT, 1) && m.text.trim().length > 0],
  ready: [['ready'], (m) => isBool(m.ready)],
  setup: [
    ['faction', 'color', 'team'],
    (m) =>
      (m.faction === undefined || ['human', 'orc'].includes(m.faction)) &&
      (m.color === undefined || (Number.isInteger(m.color) && m.color >= 0 && m.color < 16)) &&
      (m.team === undefined || (Number.isInteger(m.team) && m.team >= 0 && m.team < 8))
  ],
  config: [['config'], (m) => validConfig(m.config)],
  kick: [['id'], (m) => isId(m.id)]
};

/**
 * @param {string|Buffer} raw
 * @returns {{ msg: object|null, error?: string }}
 */
export function parseClientMessage(raw) {
  const len = typeof raw === 'string' ? Buffer.byteLength(raw) : raw.length;
  if (len > MAX_MESSAGE_BYTES) return { msg: null, error: 'too-large' };
  let m;
  try {
    m = JSON.parse(typeof raw === 'string' ? raw : raw.toString('utf8'));
  } catch {
    return { msg: null, error: 'bad-json' };
  }
  if (!m || typeof m !== 'object' || Array.isArray(m) || typeof m.t !== 'string') return { msg: null, error: 'bad-message' };
  const spec = Object.prototype.hasOwnProperty.call(SPEC, m.t) ? SPEC[m.t] : null;
  if (!spec) return { msg: null, error: 'unknown-type' };
  if (!keys(m, spec[0]) || !spec[1](m)) return { msg: null, error: 'invalid-fields' };
  return { msg: m };
}
