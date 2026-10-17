/**
 * ReplayController.js — F9-05: dirige uma `MatchSession` em modo replay (pausa, velocidade, salto, visão).
 *
 * A sim roda normalmente (`gm.advance`) com os comandos humanos do replay já enfileirados (`attachReplay`);
 * aqui só se controla `gm.gameSpeed`/`gm.isPaused`, o salto para a frente (avança em fatias de ~12 ms por quadro)
 * e a conferência dos checksums. Salto para TRÁS = recriar a partida (`onReload`) e avançar até o tick — não há
 * snapshots da sim (o estado é um grafo de entidades; ver docs/09_MULTIPLAYER.md §8).
 */
import { attachReplay, setReplayView, replaySeek, finishReplaySeek, verifyReplayProgress, VIEW_ALL, REPLAY_SPEEDS, REPLAY_SIM_VERSION, formatTicks } from '../replay/Replay.js';
import { stateChecksum } from '../sim/checksum.js';
import { ReplayBar } from '../ui/screens/ReplayBar.js';
import { t } from '../i18n/index.js';

const SEEK_BUDGET_MS = 12;

export class ReplayController {
  /**
   * @param {object} o
   * @param {import('./MatchSession.js').MatchSession} o.session
   * @param {object} o.replay
   * @param {number} [o.view]  jogador cuja visão mostrar (padrão: o local original); `VIEW_ALL` = visão total
   * @param {() => void} o.onExit
   * @param {(opts: {tick: number, view: number}) => void} o.onReload  recria a partida (salto para trás)
   */
  constructor({ session, replay, view = null, onExit, onReload }) {
    this.session = session;
    this.gm = session.gameManager;
    this.replay = replay;
    this.onExit = onExit;
    this.onReload = onReload;
    this.speed = 1;
    this.paused = false;
    this.ended = false;
    this.seekTarget = null;
    this._warned = false;
    this._finalChecked = false;
    if (!this.gm._replay) attachReplay(this.gm, replay);
    // M1-04: a reprodução nunca passa do último tick gravado. A 8x um quadro podia dar o passo extra (tick 1501 de 1500),
    // `ended` só era visto depois, e a conferência do checksum final (`currentTick === final.tick`) era pulada em silêncio.
    if (!this.gm._replayCapped) {
      this.gm._replayCapped = true;
      const inner = this.gm.simStep.bind(this.gm);
      const cap = replay.final?.tick ?? replay.ticks;
      this.gm.simStep = (dt) => { if (this.gm.currentTick < cap) inner(dt); };
    }
    this.view = view === null ? this.gm.localPlayerId : view;
    if (this.view !== this.gm.localPlayerId) setReplayView(this.gm, this.view);
    // Sem o modal de fim de partida do jogador local (a barra mostra "fim do replay").
    if (session.uiManager) session.uiManager._postGameShown = true;
    this.bar = new ReplayBar({
      replay,
      handlers: {
        onPause: () => this.togglePause(),
        onSpeed: (s) => this.setSpeed(s),
        onSeek: (tick) => this.seek(tick),
        onView: (v) => this.setView(v),
        onExit: () => this.onExit()
      }
    });
    this.bar.setView(this.view);
    if (replay.simVersion !== REPLAY_SIM_VERSION) {
      this.bar.showWarning(t('replay.simVersion', { rec: replay.simVersion, cur: REPLAY_SIM_VERSION }));
    }
    this.session.inputManager.onPauseRequest = () => this.togglePause();
    this._apply();
  }

  /** A partida só avança por `gm.advance` quando não está em salto. */
  get simulate() {
    return this.seekTarget === null;
  }

  togglePause() {
    if (this.ended) return;
    this.paused = !this.paused;
    this._apply();
  }

  setSpeed(s) {
    if (REPLAY_SPEEDS.includes(s)) this.speed = s;
    this._apply();
  }

  setView(v) {
    this.view = v;
    setReplayView(this.gm, v);
    this.bar.setView(v);
  }

  /** Salta para `tick`: para a frente avança em fatias; para trás recria a partida. */
  seek(tick) {
    tick = Math.max(0, Math.min(this.replay.ticks, Math.round(tick)));
    if (tick < this.gm.currentTick) {
      this.onReload({ tick, view: this.view });
      return;
    }
    if (tick === this.gm.currentTick) return;
    this.seekTarget = tick;
    this.ended = false;
  }

  _apply() {
    const gm = this.gm;
    gm.gameSpeed = this.speed;
    gm.isPaused = this.paused || this.ended || this.seekTarget !== null;
  }

  /** Por quadro (antes de `session.update`). */
  update() {
    const gm = this.gm;
    if (this.seekTarget !== null) {
      const t0 = performance.now();
      let left = 1;
      while (left > 0 && performance.now() - t0 < SEEK_BUDGET_MS) left = replaySeek(gm, this.seekTarget, 25);
      verifyReplayProgress(gm);
      if (left <= 0) {
        finishReplaySeek(gm);
        this.seekTarget = null;
      }
    } else if (!this.ended && (gm.isGameOver || gm.currentTick >= this.replay.ticks)) {
      this.ended = true;
    }
    if (this.ended && !this._finalChecked && gm.currentTick === this.replay.final.tick) {
      this._finalChecked = true;
      if (stateChecksum(gm) !== this.replay.final.hash) gm._replay.mismatch ||= { tick: gm.currentTick, expected: this.replay.final.hash, actual: stateChecksum(gm) };
    }
    this._apply();
    const mm = verifyReplayProgress(gm);
    if (mm && !this._warned) {
      this._warned = true;
      this.paused = true;
      this._apply();
      this.bar.showWarning(t('replay.diverged', { time: formatTicks(mm.tick) }));
      console.warn('[WarPoly] replay: divergência de checksum', mm);
    }
    this.bar.update({ tick: gm.currentTick, paused: this.paused, speed: this.speed, seeking: this.seekTarget, ended: this.ended });
  }

  dispose() {
    this.bar?.destroy();
    this.bar = null;
    if (this.gm) {
      this.gm.events.presentationMuted = false;
    }
  }
}

export { VIEW_ALL };
