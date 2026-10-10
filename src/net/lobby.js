/**
 * lobby.js — F9-02: painel mínimo de lobby (`lobby.html`). Isolado do jogo: só conversa com o
 * servidor de sinalização e, ao receber `start`, monta o `WebRTCTransport` (malha) e deixa o
 * resultado em `window.lobby` (transporte, jogadores, seed, config) — a F9-03 liga isso à partida.
 * Textos em PT-BR; nomes de jogadores entram via `textContent` (nunca innerHTML).
 */
import { SignalingClient } from './SignalingClient.js';
import { WebRTCTransport } from './WebRTCTransport.js';
import { bindStatus } from './lobbyStatus.js';
import { listMaps, DEFAULT_MAP_ID } from '../data/maps/index.js';

const $ = (id) => document.getElementById(id);

let sig = null;
const state = { room: null };
window.lobby = state;

const status = (t) => ($('status').textContent = t || '');
const row = (cells, tag = 'td') => {
  const tr = document.createElement('tr');
  for (const c of cells) {
    const td = document.createElement(tag);
    if (c instanceof Node) td.append(c);
    else td.textContent = String(c);
    tr.append(td);
  }
  return tr;
};

function show() {
  const inRoom = !!state.room;
  $('menu').hidden = inRoom || !sig?.connected;
  $('room').hidden = !inRoom;
}

function render() {
  const r = state.room;
  show();
  if (!r) return;
  $('rcode').textContent = r.code;
  const isHost = r.host === sig.id;
  $('btnStart').hidden = !isHost;
  $('map').disabled = !isHost;
  if (r.config.map) $('map').value = r.config.map;
  const me = r.players.find((p) => p.id === sig.id);
  if (me) {
    $('ready').checked = me.ready;
    $('faction').value = me.faction;
  }
  const t = $('players');
  t.replaceChildren(row(['Jogador', 'Facção', 'Pronto', ''], 'th'));
  for (const p of r.players) {
    const kick = document.createElement('button');
    kick.textContent = 'Expulsar';
    kick.onclick = () => sig.kick(p.id);
    const showKick = isHost && p.id !== sig.id;
    t.append(row([p.name + (p.id === r.host ? ' (anfitrião)' : ''), p.faction === 'orc' ? 'Horda' : 'Aliança', p.ready ? 'sim' : 'não', showKick ? kick : '']));
  }
}

function addChat(line) {
  const el = $('chat');
  el.textContent += line + '\n';
  el.scrollTop = el.scrollHeight;
}

function connect() {
  const name = $('name').value.trim() || 'Jogador';
  $('name').value = name;
  sig = new SignalingClient({ url: $('server').value.trim() });
  sig.on('open', () => {
    $('conn').textContent = 'conectado';
    show();
    sig.list();
    const code = new URLSearchParams(location.search).get('sala');
    if (code && !state.room) sig.join(code, name);
  });
  sig.on('close', () => {
    $('conn').textContent = 'desconectado';
    state.room = null;
    show();
  });
  sig.on('reconnecting', (m) => ($('conn').textContent = `reconectando (${m.attempt})…`));
  sig.on('joined', (m) => {
    state.room = m.room;
    status('');
    render();
  });
  sig.on('room', (m) => {
    state.room = m;
    render();
  });
  sig.on('rooms', (m) => {
    const t = $('rooms');
    t.replaceChildren(row(['Código', 'Anfitrião', 'Jogadores', ''], 'th'));
    for (const r of m.rooms) {
      const b = document.createElement('button');
      b.textContent = 'Entrar';
      b.onclick = () => sig.join(r.code, name);
      t.append(row([r.code, r.host, `${r.players}/${r.maxPlayers}`, b]));
    }
  });
  sig.on('chat', (m) => addChat(`${m.name}: ${m.text}`));
  sig.on('peer-left', (m) => addChat(`* jogador ${m.id} saiu (${m.reason})`));
  sig.on('kicked', () => {
    state.room = null;
    status('Você foi removido da sala.');
    show();
  });
  bindStatus(sig, status);
  sig.on('start', (m) => {
    const transport = new WebRTCTransport({ localId: sig.id, sendSignal: () => {} });
    transport.attach(sig);
    Object.assign(state, { start: m, transport, localId: sig.id });
    addChat('* partida iniciando — conectando aos jogadores (F9-03 liga isto à simulação)');
  });
  sig.connect();
}

function init() {
  for (const m of listMaps()) {
    const o = document.createElement('option');
    o.value = m.id;
    o.textContent = m.name || m.id;
    $('map').append(o);
  }
  $('map').value = DEFAULT_MAP_ID;
  $('btnConnect').onclick = connect;
  $('btnList').onclick = () => sig?.list();
  $('btnCreate').onclick = () => sig.create($('name').value.trim() || 'Jogador', { public: $('pub').checked, config: { map: $('map').value } });
  $('btnJoin').onclick = () => sig.join($('code').value, $('name').value.trim() || 'Jogador');
  $('btnLeave').onclick = () => {
    sig.leave();
    state.room = null;
    show();
  };
  $('btnCopy').onclick = () => navigator.clipboard?.writeText(`${location.origin}${location.pathname}?sala=${state.room.code}`);
  $('map').onchange = () => sig.setConfig({ ...state.room.config, map: $('map').value });
  $('faction').onchange = () => sig.setup({ faction: $('faction').value });
  $('ready').onchange = () => sig.setReady($('ready').checked);
  $('btnStart').onclick = () => sig.start();
  $('btnSend').onclick = () => {
    if ($('msg').value.trim()) sig.chat($('msg').value);
    $('msg').value = '';
  };
  $('msg').onkeydown = (e) => e.key === 'Enter' && $('btnSend').click();
}
init();
