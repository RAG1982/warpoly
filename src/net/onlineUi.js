/**
 * onlineUi.js — F9-04: liga a apresentação da partida online (chat, pings de aliados, avisos de pausa/queda,
 * ressincronização) à `LockstepSession`. Tudo aqui é UI: nada escreve na simulação e nada entra no checksum.
 * Criado pela `MatchSession` depois de InputManager/UIManager e descartado junto com ela.
 */
import { OnlineChat } from './OnlineChat.js';
import { MapPings } from './MapPings.js';
import { MapPingMarkers } from './MapPingMarkers.js';

/**
 * @param {object} o
 * @param {{session: import('./LockstepSession.js').LockstepSession}} o.online
 * @param {import('../sim/GameManager.js').GameManager} o.gm
 * @param {object} o.sceneManager
 * @param {object} o.uiManager
 * @param {object} o.inputManager
 * @param {() => void} [o.onResync]  chamado quando a sessão nos removeu (viramos IA): a aplicação recria a partida local
 */
export function attachOnlineUi({ online, gm, sceneManager, uiManager, inputManager, onResync }) {
  const session = online.session;
  const nameOf = (pid) => gm.getPlayer(pid)?.name || `Jogador ${pid + 1}`;
  const colorOf = (pid) => gm.getPlayer(pid)?.color || '#e5e7eb';
  const chat = new OnlineChat(session, { nameOf, colorOf });
  const pings = new MapPings();
  const markers = new MapPingMarkers(sceneManager.scene, gm.terrain);
  const now = () => performance.now();

  session.isAlly = (pid) => pid === gm.localPlayerId || gm.isAlly(gm.localPlayerId, pid);
  session.onChat = (m) => chat.add(m);
  session.onMapPing = (m) => {
    pings.add({ x: m.x, z: m.z, kind: m.kind, from: m.from, color: colorOf(m.from) }, now());
    if (!m.local) chat.system(`${nameOf(m.from)} marcou o mapa.`);
  };
  session.onRoomEvent = (e) => {
    switch (e.type) {
      case 'voteStart':
        chat.system(`${nameOf(e.proposer)} propôs ${e.kind === 'pause' ? 'pausar' : 'retomar'} a partida.`);
        break;
      case 'voteFailed':
        chat.system(e.expired ? 'A votação expirou.' : 'A proposta foi recusada.');
        break;
      case 'paused':
        chat.system('Partida pausada por votação.');
        break;
      case 'resuming':
        chat.system('Retomando em 3 segundos…');
        break;
      case 'resumed':
        chat.system('Partida retomada.');
        break;
      case 'leave':
        chat.system(`${nameOf(e.pid)} saiu da partida.`);
        break;
      case 'takeover':
        chat.system(`${nameOf(e.pid)} agora é controlado pela IA.`);
        break;
      case 'release':
        chat.system(`${nameOf(e.pid)} voltou à partida.`);
        break;
      case 'removed':
        chat.system('Você perdeu a conexão: a IA assumiu o seu lugar. Ressincronizando…');
        onResync?.();
        break;
      case 'resyncFailed':
        chat.system('Falha ao ressincronizar; tentando de novo…');
        onResync?.(); // recria a partida local (a tentativa anterior a deixou suja)
        break;
      case 'resynced':
        chat.system('Ressincronizado. Voltando ao controle em instantes.');
        break;
      default:
    }
  };
  const request = (pos, kind) => session.sendMapPing(pos.x, pos.z, { kind, team: true });
  inputManager.onMapPingRequest = request;
  uiManager.onMapPingRequest = request;
  uiManager.allyPings = pings;

  return {
    chat,
    pings,
    update() {
      markers.update(pings.active(now()));
    },
    dispose() {
      session.onChat = session.onMapPing = session.onRoomEvent = () => {};
      inputManager.onMapPingRequest = null;
      uiManager.onMapPingRequest = null;
      uiManager.allyPings = null;
      markers.dispose();
      chat.dispose();
    }
  };
}
