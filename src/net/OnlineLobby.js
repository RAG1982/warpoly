/**
 * OnlineLobby.js — F9-03: sala online dentro da página do jogo (`/?online=1`). Painel mínimo que
 * conversa com o servidor de sinalização, forma a malha WebRTC e, quando todos os canais abrem e os
 * `hello` batem (versão do protocolo + hash da MatchConfig), entrega à aplicação a MatchConfig e a
 * `LockstepSession` já criada (com a sim ligada depois, pelo `proxy`): assim nenhum pacote que chegue
 * durante o carregamento do mapa se perde. Não altera o fluxo single-player (só é importado com
 * `?online=1`). Textos em PT-BR; nomes de jogadores entram por `textContent`.
 *
 * Parâmetros: `?signal=ws://host:8787` (padrão: mesmo host, porta 8787), `?sala=CODIGO` (entra direto),
 * `?nome=…`, `?stun=0` (sem STUN, útil em rede local/testes), `?delay=N` (atraso inicial),
 * `?adaptive=0` (desliga o atraso adaptativo), `?droptimeout=ms` (F9-04; padrão 10000), `?rejoin=1` (volta à partida após recarregar).
 * F9-04: sobrevive a quedas — se o WebSocket de sinalização cai durante a partida ele reconecta e volta
 * à vaga com `rejoin` (malha WebRTC refeita); se a PÁGINA é recarregada (`?online=1&rejoin=1`, dados em
 * sessionStorage) a partida local é recriada e o estado vem por snapshot de um par saudável.
 * Também expõe `window.lobby` (room, start, transporte, localId, config) como o `lobby.html`.
 */
import { SignalingClient } from './SignalingClient.js';
import { WebRTCTransport } from './WebRTCTransport.js';
import { LockstepSession } from './LockstepSession.js';
import { buildOnlineMatchConfig } from './onlineMatch.js';
import { fnv1a } from '../sim/rng.js';
import { listMaps, DEFAULT_MAP_ID } from '../data/maps/index.js';

export const PROTOCOL_VERSION = 1;
const OPEN_TIMEOUT_MS = 25000;
const STORE_KEY = 'warpoly.online';
const HELLO_TIMEOUT_MS = 10000;

const ERR = {
  'no-such-room': 'Sala não encontrada.',
  'room-full': 'Sala cheia.',
  'already-started': 'A partida já começou.',
  'not-host': 'Só o anfitrião pode fazer isso.',
  'need-players': 'São necessários pelo menos 2 jogadores.',
  'not-all-ready': 'Nem todos estão prontos.',
  'rate-limited': 'Muitas mensagens; devagar.',
  'server-full': 'Servidor cheio.'
};

/** Hash estável da config (sem `isLocal`, que difere por par): handshake de "mesma partida". */
export function configHash(cfg) {
  const norm = { ...cfg, players: cfg.players.map((p) => ({ ...p, isLocal: false })) };
  return fnv1a(JSON.stringify(norm));
}

const el = (tag, props = {}, ...kids) => {
  const e = document.createElement(tag);
  Object.assign(e, props);
  for (const k of kids) e.append(k);
  return e;
};

/**
 * Abre o painel. `onStart({config, session, proxy, transport, names, localPlayerId})` é chamado uma vez.
 * @returns {{close: () => void}}
 */
export function openOnlineLobby({ params, onStart }) {
  const q = (k, d = null) => (params.has(k) ? params.get(k) : d);
  const signalUrl = q('signal', `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.hostname}:8787`);

  const root = el('div', { id: 'online-lobby' });
  root.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#0b1020;color:#e5e7eb;font:14px/1.4 system-ui,sans-serif;display:flex;align-items:center;justify-content:center;overflow:auto';
  const card = el('div');
  card.style.cssText = 'background:#131a2e;border:1px solid #2b3556;border-radius:10px;padding:20px;min-width:320px;max-width:560px;width:92vw;display:grid;gap:10px';
  root.append(card);

  const title = el('h2', { textContent: 'WarPoly · Partida online' });
  title.style.margin = '0';
  const status = el('div', { id: 'ol-status', textContent: 'Desconectado.' });
  status.style.color = '#fbbf24';
  const inName = el('input', { id: 'ol-name', value: q('nome', 'Jogador'), maxLength: 24 });
  const inServer = el('input', { id: 'ol-server', value: signalUrl });
  const btnConnect = el('button', { id: 'ol-connect', textContent: 'Conectar' });
  const inCode = el('input', { id: 'ol-code', placeholder: 'Código da sala', maxLength: 8 });
  const btnCreate = el('button', { id: 'ol-create', textContent: 'Criar sala' });
  const btnJoin = el('button', { id: 'ol-join', textContent: 'Entrar' });
  const menu = el('div', {}, inCode, ' ', btnJoin, ' ', btnCreate);
  menu.hidden = true;
  const roomCode = el('b', { id: 'ol-roomcode' });
  const selMap = el('select', { id: 'ol-map' });
  for (const m of listMaps()) selMap.append(el('option', { value: m.id, textContent: m.name || m.id }));
  selMap.value = DEFAULT_MAP_ID;
  const selFaction = el('select', { id: 'ol-faction' }, el('option', { value: 'human', textContent: 'Aliança' }), el('option', { value: 'orc', textContent: 'Horda' }));
  const chkReady = el('input', { id: 'ol-ready', type: 'checkbox' });
  const btnStart = el('button', { id: 'ol-start', textContent: 'Iniciar partida' });
  const btnLeave = el('button', { id: 'ol-leave', textContent: 'Sair da sala' });
  const list = el('ul', { id: 'ol-players' });
  list.style.cssText = 'margin:0;padding-left:18px';
  const roomBox = el(
    'div', {},
    el('div', {}, 'Sala ', roomCode, '  '),
    el('div', {}, 'Mapa: ', selMap, '  Facção: ', selFaction, '  ', el('label', {}, chkReady, ' Pronto')),
    list,
    el('div', {}, btnStart, ' ', btnLeave)
  );
  roomBox.hidden = true;
  roomBox.style.display = 'none';
  card.append(
    title, status,
    el('div', {}, 'Nome: ', inName), el('div', {}, 'Servidor: ', inServer, ' ', btnConnect),
    menu, roomBox
  );
  document.body.append(root);

  const setStatus = (t, bad = true) => {
    status.textContent = t || '';
    status.style.color = bad ? '#fbbf24' : '#86efac';
  };

  let sig = null;
  const state = { room: null };
  window.lobby = state;
  let closed = false;
  let starting = false;
  let running = false; // partida em andamento (a sessão lockstep existe)

  function render() {
    const r = state.room;
    menu.hidden = !!r || !sig?.connected;
    roomBox.hidden = !r;
    roomBox.style.display = r ? '' : 'none';
    if (!r) return;
    const isHost = r.host === sig.id;
    roomCode.textContent = r.code;
    btnStart.hidden = !isHost;
    selMap.disabled = !isHost;
    if (r.config.map) selMap.value = r.config.map;
    const me = r.players.find((p) => p.id === sig.id);
    if (me) {
      chkReady.checked = me.ready;
      selFaction.value = me.faction;
    }
    list.replaceChildren(
      ...r.players.map((p) => el('li', { textContent: `${p.name}${p.id === r.host ? ' (anfitrião)' : ''}${p.id === sig.id ? ' (você)' : ''} · ${p.faction === 'orc' ? 'Horda' : 'Aliança'} · ${p.ready || p.id === r.host ? 'pronto' : 'aguardando'}` }))
    );
  }

  function connect() {
    const name = inName.value.trim() || 'Jogador';
    inName.value = name;
    sig?.close();
    sig = new SignalingClient({ url: inServer.value.trim() });
    sig.on('open', () => {
      setStatus('Conectado ao servidor.', false);
      render();
      if (running) {
        sig.rejoinGame(); // F9-04: queda do WebSocket no meio da partida: volta à mesma vaga
        return;
      }
      if (rejoinData) {
        sig.rejoinGame(rejoinData.code, rejoinData.token);
        return;
      }
      const code = q('sala');
      if (code && !state.room) sig.join(code, name);
    });
    sig.on('close', () => {
      if (!starting) setStatus('Desconectado do servidor.');
      state.room = null;
      render();
    });
    sig.on('reconnecting', (m) => setStatus(`Reconectando (${m.attempt})…`));
    sig.on('joined', (m) => {
      state.room = m.room;
      render();
    });
    sig.on('rejoined', (m) => {
      state.room = m.room;
      if (running) {
        state.localId = sig.id;
        state.transport?.reattach(sig); // malha WebRTC refeita com o id novo
        return;
      }
      rejoinData = null;
      beginMatch(m.start, { rejoin: true, slot: m.slot }).catch((err) => failStart(err));
    });
    sig.on('room', (m) => {
      state.room = m;
      render();
    });
    sig.on('kicked', () => {
      state.room = null;
      setStatus('Você foi removido da sala.');
      render();
    });
    sig.on('error', (m) => {
      if (rejoinData && m.code === 'no-such-room') {
        rejoinData = null;
        try {
          sessionStorage.removeItem(STORE_KEY);
        } catch {
          /* sem storage */
        }
        setStatus('A partida anterior não existe mais.');
        return;
      }
      setStatus(ERR[m.code] || `Erro: ${m.code}`);
    });
    sig.on('start', (m) => beginMatch(m).catch((err) => failStart(err)));
    sig.connect();
  }

  function failStart(err) {
    console.error('[online] falha ao iniciar:', err);
    starting = false;
    setStatus(`Não foi possível iniciar: ${err.message || err}`);
    state.transport?.close();
    state.transport = null;
  }

  async function beginMatch(m, { rejoin = false, slot = null } = {}) {
    starting = true;
    setStatus(rejoin ? 'Voltando à partida — conectando aos jogadores…' : 'Partida iniciando — conectando aos jogadores…', false);
    const mySlot = slot ?? sig.id; // id de rede da vaga na mensagem `start`
    try {
      sessionStorage.setItem(STORE_KEY, JSON.stringify({ signal: inServer.value.trim(), code: sig.room?.code ?? sig._lastCode, token: sig.token, name: inName.value.trim(), at: Date.now() }));
    } catch {
      /* sem storage: só perde o rejoin após recarregar */
    }
    const built = buildOnlineMatchConfig({ players: m.players, seed: m.seed, config: m.config, localNetId: mySlot });
    const { config, playerIds, toPlayerId, localPlayerId } = built;
    const rtcConfig = q('stun') === '0' ? { iceServers: [] } : undefined;
    const transport = new WebRTCTransport({ localId: sig.id, sendSignal: () => {}, ...(rtcConfig ? { rtcConfig } : {}) });
    transport.attach(sig);
    Object.assign(state, { start: m, transport, localId: sig.id, config, built });
    running = true;

    // A sessão existe já (recebe e guarda pacotes durante o carregamento); a sim é ligada depois.
    const proxy = { target: null };
    for (const fn of ['enqueue', 'step', 'checksum', 'detail', 'beginTurn', 'endTurn', 'takeover', 'release', 'captureSnapshot', 'restoreSnapshot']) proxy[fn] = (...a) => proxy.target[fn]?.(...a);
    proxy.ready = () => !!proxy.target; // F9-04: a sessão só aplica snapshot quando a partida local existe
    const hash = configHash(config);
    // Os ids de rede (sig.id) e de jogo (0..n-1) diferem; a sessão usa os de jogo (campo `from` das mensagens).
    const session = new LockstepSession({
      transport,
      localId: localPlayerId,
      playerIds,
      sim: proxy,
      turnTicks: 2,
      delayTurns: Number(q('delay', 3)),
      adaptive: q('adaptive') !== '0',
      checkEvery: 10,
      dropTimeoutMs: Number(q('droptimeout', 10000)) // F9-04: stall deste tamanho => o jogador vira IA
    });

    const helloFrom = new Map();
    transport.onMessage((msg) => {
      if (msg && msg.k === 'hello' && Number.isInteger(msg.from) && msg.from < 0) helloFrom.set(-1 - msg.from, msg);
    });
    const others = (rejoin ? (sig.room?.players ?? []) : m.players).filter((p) => p.id !== sig.id).map((p) => p.id);
    const t0 = performance.now();
    // Rejoin: basta um canal aberto (outros jogadores podem ter caído); partida nova exige todos.
    const opened = () => (rejoin ? others.some((id) => transport.allOpen([id])) : transport.allOpen(others));
    while (!opened()) {
      if (performance.now() - t0 > OPEN_TIMEOUT_MS) throw new Error('tempo esgotado abrindo a conexão com os jogadores (NAT? configure TURN)');
      await new Promise((r) => setTimeout(r, 100));
    }
    // handshake: mesma versão e mesma configuração
    // `from` negativo (-1 - id de jogo): a sessão ignora o hello (só aceita `from` de jogadores).
    const sendHello = () => transport.send({ k: 'hello', from: -1 - localPlayerId, v: PROTOCOL_VERSION, cfg: hash });
    sendHello();
    const t1 = performance.now();
    const need = rejoin ? [] : playerIds.filter((i) => i !== localPlayerId); // quem volta não repete o handshake (a partida já corre)
    for (let tick = 0; need.some((i) => !helloFrom.has(i)); tick++) {
      if (performance.now() - t1 > HELLO_TIMEOUT_MS) throw new Error('algum jogador não respondeu ao handshake');
      if (tick % 5 === 4) sendHello(); // reenvia: o outro lado pode ter registrado o ouvinte depois
      await new Promise((r) => setTimeout(r, 100));
    }
    for (const [i, h] of helloFrom) {
      if (h.v !== PROTOCOL_VERSION || h.cfg !== hash) throw new Error(`jogador ${i + 1} está com versão/configuração diferente`);
    }
    const names = config.players.map((p) => p.name);
    if (rejoin) session.beginResync(); // sim local zerada: o estado vem por snapshot
    close();
    const dispose = () => {
      running = false;
      try {
        sessionStorage.removeItem(STORE_KEY);
      } catch {
        /* sem storage */
      }
      session.bye(); // aviso imediato: os outros passam este jogador à IA sem esperar o timeout
      setTimeout(() => {
        session.dispose();
        transport.close();
        try {
          sig.leave();
          sig.close();
        } catch {
          /* já fechado */
        }
      }, 250);
    };
    onStart({ config, session, proxy, transport, names, localPlayerId, toPlayerId, dispose });
  }

  function close() {
    if (closed) return;
    closed = true;
    root.remove();
  }

  btnConnect.onclick = connect;
  btnCreate.onclick = () => sig.create(inName.value.trim() || 'Jogador', { public: false, config: { map: selMap.value } });
  btnJoin.onclick = () => sig.join(inCode.value, inName.value.trim() || 'Jogador');
  btnLeave.onclick = () => {
    sig.leave();
    state.room = null;
    render();
  };
  selMap.onchange = () => sig.setConfig({ ...state.room.config, map: selMap.value });
  selFaction.onchange = () => sig.setup({ faction: selFaction.value });
  chkReady.onchange = () => sig.setReady(chkReady.checked);
  btnStart.onclick = () => sig.start();

  // F9-04: página recarregada no meio da partida: volta à vaga (token em sessionStorage).
  let rejoinData = null;
  if (q('rejoin') === '1') {
    try {
      const d = JSON.parse(sessionStorage.getItem(STORE_KEY) || 'null');
      if (d && d.code && d.token && Date.now() - d.at < 10 * 60_000) rejoinData = d;
    } catch {
      rejoinData = null;
    }
    if (rejoinData && rejoinData.signal) inServer.value = rejoinData.signal;
    if (rejoinData && rejoinData.name) inName.value = rejoinData.name;
  }
  if (q('autoconnect') !== '0') connect();
  return { close };
}
