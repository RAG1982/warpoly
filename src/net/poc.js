/**
 * poc.js — F9-01: página de prova de conceito `net-poc.html` (lockstep 1v1 em 2 abas).
 * Sim headless (sem render) em cada aba; só comandos trafegam via BroadcastChannel.
 * Handshake: o convidado envia `hello` a cada 500 ms até receber `start` (seed) do anfitrião.
 */
import { GameManager } from '../sim/GameManager.js';
import { Terrain } from '../sim/Terrain.js';
import { createMatchConfig } from '../sim/MatchConfig.js';
import { CMD } from '../sim/commands.js';
import { getBuildingDef } from '../data/index.js';
import { BroadcastTransport } from './BroadcastTransport.js';
import { LockstepSession } from './LockstepSession.js';
import { createGameSimAdapter } from './GameSimAdapter.js';

const $ = (id) => document.getElementById(id);
const logEl = $('log');
const log = (s) => {
  logEl.textContent = `${new Date().toLocaleTimeString()} ${s}\n${logEl.textContent}`.slice(0, 6000);
};

const TURN_MS = 100; // 2 ticks de 50 ms
let ctx = null;

function startGame(localId, seed, transport) {
  const cfg = createMatchConfig({ seed, headless: true });
  cfg.players.forEach((p) => {
    p.isAI = false;
    p.isLocal = p.id === localId;
  });
  const gm = new GameManager(new Terrain(), null, null, cfg);
  const session = new LockstepSession({
    transport,
    localId,
    playerIds: [0, 1],
    sim: createGameSimAdapter(gm),
    onDesync: (d) => log(`DESYNC no turno ${d.turn}: local ${d.local} x jogador ${d.playerId} ${d.remote}`),
    onViolation: (v) => log(`violação de ${v.from}: ${v.reason}`)
  });
  ctx = { gm, session, localId };
  $('setup').hidden = true;
  $('game').hidden = false;
  $('pid').textContent = String(localId);
  window.lockstep = ctx;
  log(`partida iniciada (seed ${seed}, jogador ${localId})`);
  setInterval(() => {
    session.update();
    $('turn').textContent = `${session.turn} / ${gm.currentTick}`;
    $('stalls').textContent = String(session.stalls);
    const last = session.lastChecksum;
    $('sum').textContent = last ? `${last.h} (turno ${last.t})` : '—';
    const st = $('status');
    st.textContent = session.desync ? 'DESYNC — sim congelada' : 'em sincronia';
    st.className = session.desync ? 'bad' : 'ok';
  }, TURN_MS);
}

function setup(role) {
  const transport = new BroadcastTransport('warpoly-lockstep-poc');
  if (role === 'host') {
    const seed = (Date.now() % 100000) + 1; // fora da sim: a seed é decisão do lobby
    log('aguardando convidado…');
    transport.onMessage((m) => {
      if (m.k === 'hello' && !ctx) {
        transport.send({ k: 'start', seed });
        startGame(0, seed, transport);
      } else if (m.k === 'hello' && ctx) {
        transport.send({ k: 'start', seed }); // convidado ainda não ouviu
      }
    });
  } else {
    const t = setInterval(() => transport.send({ k: 'hello' }), 500);
    transport.send({ k: 'hello' });
    log('procurando anfitrião…');
    transport.onMessage((m) => {
      if (m.k === 'start' && !ctx) {
        clearInterval(t);
        startGame(1, m.seed, transport);
      }
    });
  }
}

$('host').onclick = () => setup('host');
$('join').onclick = () => setup('join');

$('move').onclick = () => {
  const { gm, session, localId } = ctx;
  const ids = gm.allUnits.filter((u) => u.ownerId === localId && !u.isDead).map((u) => u.id);
  session.queueCommand({ type: CMD.MOVE, unitIds: ids, x: Math.round(Math.random() * 40 - 20), z: Math.round(Math.random() * 40 - 20) });
};

$('train').onclick = () => {
  const { gm, session, localId } = ctx;
  const hq = gm.buildings.find((b) => b.ownerId === localId && (getBuildingDef(b.type).trains || []).length > 0);
  if (hq) session.queueCommand({ type: CMD.TRAIN, buildingId: hq.id, unitType: getBuildingDef(hq.type).trains[0] });
};

$('tamper').onclick = () => {
  ctx.gm.players[ctx.localId].resources.gold += 1;
  log('estado local adulterado (+1 ouro) — o próximo checksum deve divergir');
};
