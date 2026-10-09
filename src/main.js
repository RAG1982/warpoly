import * as THREE from 'three';
import { installFogOfWarShader } from './render/fogOfWarShader.js';
import { SceneManager } from './core/SceneManager.js';
import { SoundManager } from './core/SoundManager.js';
import { AssetPreloader } from './core/AssetPreloader.js';
import { QualitySettings } from './core/QualitySettings.js';
import { MatchSession } from './core/MatchSession.js';
import { GameStateMachine, GameState } from './core/GameStateMachine.js';
import { createMatchConfig, matchConfigFromSearch, withNewSeed } from './sim/MatchConfig.js';
import { shouldShowMainMenu, showMainMenu } from './ui/screens/MainMenu.js';
import { PauseMenu } from './ui/screens/PauseMenu.js';
import { ensureGlbLoaded } from './entities/glbModels.js';
import { SaveLoadDialog } from './ui/screens/SaveLoadDialog.js';
import { SaveStore, AUTOSAVE_SLOT } from './core/SaveStore.js';
import { captureSave, applySaveCommands, fastForward, finishFastForward } from './sim/SaveGame.js';
import { SIM_DT } from './sim/constants.js';
import { ReplayService } from './core/ReplayService.js'; // F9-05
import { ReplayController } from './core/ReplayController.js';
import { ReplayDialog } from './ui/screens/ReplayDialog.js';
import { ensureReplayMap, replaySeek, finishReplaySeek, attachReplay } from './replay/Replay.js';
import { bootOptions, applyAudio } from './ui/optionsApply.js';
import { OptionsPanel } from './ui/screens/OptionsPanel.js';
import { t, applyI18n, onLanguageChange, getLanguage } from './i18n/index.js';
import { registerServiceWorker } from './pwa.js';

// F6-08: opções salvas (teclas, escala de UI, daltonismo, pan…) antes de qualquer tela.
registerServiceWorker();
bootOptions();

const S = GameState;

// Névoa de guerra por shader (F1-05): instala o patch global em `THREE.Material.prototype` antes de
// qualquer material ser compilado (AssetPreloader / warmLiveScene). Idempotente.
installFogOfWarShader();

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));

/**
 * Aplicação (F2-04). Vive a página inteira: renderer/SceneManager, SoundManager, os caches
 * de templates (ModelFactory) e a máquina de estados. Cada partida é uma MatchSession
 * descartável, criada a partir de uma MatchConfig e destruída sem recarregar a página.
 *
 *   Boot → MainMenu ⇄ MatchSetup → Loading → InGame ⇄ Paused → …   (ver GameStateMachine.js)
 *
 * `window.game` (depuração, smoke, bench) é esta instância; `gameManager`, `inputManager`,
 * `uiManager`… apontam para a sessão atual (null fora de partida).
 */
class GameApp {
  constructor() {
    this.params = new URLSearchParams(window.location.search);
    this.skipPreload = this.params.has('skipPreload');
    this.container = document.getElementById('game-container');

    // Serviços da aplicação (criados na 1ª partida: o menu não precisa de WebGL)
    this.sound = null;
    this.sceneManager = null;
    this.timer = null;
    this.assetsReady = false; // preload feito (roda uma vez só)

    // Partida
    this.session = null;
    this.matchConfig = null;
    this.matchCount = 0;
    this._loadToken = 0;

    this.menu = null;
    // F2-06: save/load em slots (IndexedDB) + autosave opcional (`?autosave=<min>` ou localStorage 'warpoly.autosave').
    this.saves = new SaveStore();
    this.saveDialog = new SaveLoadDialog({
      store: this.saves,
      onSave: (slot) => this.saveToSlot(slot),
      onLoad: (slot) => this.loadFromSlot(slot)
    });
    // F9-05: replays — gravação automática de toda partida + lista/importação/exportação no menu principal.
    this.replays = new ReplayService();
    this.replayCtl = null;
    this.replayDialog = new ReplayDialog({ service: this.replays, onPlay: (replay) => this.playReplay(replay) });
    this._autosaveMinutes = this._readAutosaveMinutes();
    this._nextAutosaveTick = Infinity;
    // F6-08: tela de Opções única (menu principal e pausa/engrenagem). Aplica áudio ao vivo.
    this.optionsPanel = new OptionsPanel({
      getContext: () => ({ sound: this.sound, sceneManager: this.sceneManager, gameManager: this.gameManager })
    });
    this.pauseMenu = new PauseMenu({
      onOptions: () => this.optionsPanel.open(),
      onSave: () => this.saveDialog.open('save'),
      onLoad: () => this.saveDialog.open('load'),
      onResume: () => this.resume(),
      onRestart: () => this.restartMatch(),
      onMainMenu: () => this.goToMainMenu(),
      onQuit: () => this.quit()
    });

    this.fsm = new GameStateMachine({
      handlers: {
        [S.MAIN_MENU]: { enter: () => this._enterMainMenu() },
        [S.LOADING]: { enter: (ctx) => this._enterLoading(ctx.payload) },
        [S.IN_GAME]: { enter: (ctx) => this._enterInGame(ctx.from) },
        [S.PAUSED]: { enter: () => this._enterPaused(), exit: () => this.pauseMenu.hide() },
        [S.POST_GAME]: { enter: () => this._enterPostGame() }
      }
    });

    this._animate = this._animate.bind(this);
    this._bindStaticHud();
  }

  // --- Compatibilidade: window.game.gameManager / sceneManager / quality … ---
  get gameManager() { return this.session?.gameManager ?? null; }
  get inputManager() { return this.session?.inputManager ?? null; }
  get uiManager() { return this.session?.uiManager ?? null; }
  get terrain() { return this.session?.terrain ?? null; }
  get water() { return this.session?.water ?? null; }
  get decorations() { return this.session?.decorations ?? null; }
  get particleSystem() { return this.session?.particleSystem ?? null; }
  get vfx() { return this.session?.vfx ?? null; } // F7-05: partículas GPU (debug/capturas)
  /** F1-04: presets de qualidade (window.game.quality) */
  get quality() { return this.sceneManager?.quality ?? QualitySettings; }
  get state() { return this.fsm.state; }

  /** Boot: menu principal, ou direto para a partida se a URL pedir (?play, ?skipPreload, ?bench…). */
  start() {
    if (this.params.get('online') === '1') {
      this._startOnline();
      return;
    }
    if (shouldShowMainMenu()) {
      this.fsm.transition(S.MAIN_MENU);
    } else {
      this.fsm.transition(S.LOADING, { config: matchConfigFromSearch(window.location.search) });
    }
  }

  /**
   * F9-03: `?online=1` — sala online no lugar do menu (módulo carregado só aqui; single-player intacto).
   * Ao iniciar, a MatchConfig e a sessão lockstep seguem para o carregamento normal da partida.
   */
  async _startOnline() {
    this._hideLoadingScreen(false);
    document.documentElement.classList.remove('wp-menu');
    const { openOnlineLobby } = await import('./net/OnlineLobby.js');
    openOnlineLobby({
      params: this.params,
      onStart: (online) => {
        this.online = online;
        this.fsm.transition(S.LOADING, { config: online.config, online });
      }
    });
  }

  // ------------------------------------------------------------------ ações
  pause() {
    if (this.replayCtl) return this.replayCtl.togglePause(); // F9-05: no replay o botão da HUD só pausa/retoma o replay
    if (this.fsm.is(S.IN_GAME)) this.fsm.transition(S.PAUSED);
  }

  resume() {
    if (this.fsm.is(S.PAUSED)) this.fsm.transition(S.IN_GAME);
  }

  /** Reiniciar (menu de pausa): mesma MatchConfig, mesma seed. */
  restartMatch() {
    if (this.session?.online) return; // F9-03: partida online não reinicia (seria uma partida local)
    if (this.fsm.is(S.PAUSED) || this.fsm.is(S.POST_GAME)) {
      this.fsm.transition(S.LOADING, { config: this.matchConfig });
    }
  }

  /** Jogar novamente (fim de jogo): mesma MatchConfig, seed nova. */
  playAgain() {
    if (this.session?.online) return this.goToMainMenu();
    if (this.fsm.is(S.POST_GAME)) {
      // F8-04: missão = mesma config (a seed faz parte da missão).
      const isMission = !!(this.matchConfig.missionId || this.matchConfig.mission);
      this.fsm.transition(S.LOADING, { config: isMission ? this.matchConfig : withNewSeed(this.matchConfig) });
    }
  }

  // ------------------------------------------------------------------ save / load (F2-06)
  _readAutosaveMinutes() {
    try {
      const q = this.params.get('autosave');
      if (q !== null) localStorage.setItem('warpoly.autosave', String(Number(q) || 0));
      return Math.max(0, Number(localStorage.getItem('warpoly.autosave')) || 0);
    } catch {
      return 0;
    }
  }

  /** Estado de apresentação restaurado depois do load: câmera, hora do dia, seleção e grupos. */
  _captureView() {
    const sm = this.sceneManager;
    const gm = this.gameManager;
    const im = this.inputManager;
    return {
      cameraTarget: { x: sm.cameraTarget.x, y: sm.cameraTarget.y, z: sm.cameraTarget.z },
      zoom: sm.targetZoomLevel,
      angle: sm.targetCameraAngle,
      timeOfDay: sm.timeOfDay,
      selected: gm.selectedUnits.map((u) => u.id),
      selectedBuilding: gm.selectedBuilding ? gm.selectedBuilding.id : null,
      groups: im?.controlGroups ? [...im.controlGroups.groups.entries()] : [] // grupos de controle (F3-01), se existirem
    };
  }

  _restoreView(view) {
    if (!view) return;
    const sm = this.sceneManager;
    const gm = this.gameManager;
    const im = this.inputManager;
    if (view.cameraTarget) sm.cameraTarget.set(view.cameraTarget.x, view.cameraTarget.y, view.cameraTarget.z);
    if (view.zoom) sm.zoomLevel = sm.targetZoomLevel = view.zoom;
    if (view.angle !== undefined) sm.cameraAngle = sm.targetCameraAngle = view.angle;
    if (view.timeOfDay && sm.timeOfDay !== view.timeOfDay) sm.setTimeOfDay(view.timeOfDay);
    if (im?.controlGroups) for (const [n, ids] of view.groups || []) im.controlGroups.set(n, ids);
    const sel = (view.selected || []).map((id) => gm.entitiesById.get(id)).filter((u) => u && !u.isDead);
    if (sel.length > 0) {
      sel.forEach((u) => u.setSelected(true));
      gm.selectedUnits = sel;
    } else if (view.selectedBuilding != null) {
      const b = gm.entitiesById.get(view.selectedBuilding);
      if (b && !b.isDead) { b.setSelected(true); gm.selectedBuilding = b; }
    }
  }

  /** Salva a partida atual no slot (`slot1..3` ou `autosave`). */
  async saveToSlot(slot) {
    const gm = this.gameManager;
    if (!gm) throw new Error(t('main.noMatch'));
    const label = slot === AUTOSAVE_SLOT ? t('save.autosave') : `${t('save.slotWord')} ${slot.replace('slot', '')}`;
    await this.saves.put(slot, captureSave(gm, { name: label, view: this._captureView() }));
  }

  /** Carrega um slot: recria a partida pela config do save e a reproduz até o tick salvo. */
  async loadFromSlot(slot) {
    const save = await this.saves.get(slot);
    if (!save) throw new Error(t('main.emptySlot'));
    this.saveDialog.close();
    if (this.fsm.is(S.MAIN_MENU)) this.fsm.transition(S.MATCH_SETUP);
    if (!this.fsm.can(S.LOADING)) return;
    this.fsm.transition(S.LOADING, { config: save.config, save });
  }

  // ------------------------------------------------------------------ replays (F9-05)
  /**
   * Reproduz um replay (do menu principal ou da lista). `tick`/`view` = onde começar e de qual jogador mostrar a visão
   * (usados ao saltar para trás: a partida é recriada e avança até o tick).
   */
  playReplay(replay, { tick = 0, view = null } = {}) {
    try {
      ensureReplayMap(replay);
    } catch (err) {
      this.replayDialog.showError(err);
      return;
    }
    this.replayDialog.close();
    if (this.fsm.is(S.MAIN_MENU)) this.fsm.transition(S.MATCH_SETUP);
    if (this.fsm.is(S.IN_GAME)) this.fsm.transition(S.PAUSED); // recarregar a partir do replay em andamento
    if (!this.fsm.can(S.LOADING)) return;
    this.fsm.transition(S.LOADING, { config: { ...replay.config, headless: false }, replayPlay: { replay, tick, view } });
  }

  /** Sai do replay para o menu principal (a partir de IN_GAME passa por PAUSED, como o resto do fluxo). */
  exitReplay() {
    if (this.fsm.is(S.IN_GAME)) this.fsm.transition(S.PAUSED);
    this.goToMainMenu();
  }

  /** Avança a sim do replay até `tick` por quadros, com progresso na tela de loading. */
  async _seekReplayLoading(gm, replayPlay, token) {
    const status = document.getElementById('loading-status');
    const est = document.getElementById('loading-est');
    const target = Math.min(replayPlay.tick, replayPlay.replay.ticks);
    let left = target - gm.currentTick;
    while (left > 0) {
      left = replaySeek(gm, target, 400);
      const pct = Math.round(((target - left) / Math.max(1, target)) * 100);
      this._updateLoadingUI({ percent: pct, current: 1, total: 1, name: 'match', estSeconds: 1 });
      if (status) status.textContent = t('loading.restoring');
      if (est) est.textContent = t('loading.replaying', { min: Math.floor(target * SIM_DT / 60), pct });
      await nextFrame();
      if (token !== this._loadToken || !this.fsm.is(S.LOADING)) { gm.events.presentationMuted = false; return false; }
    }
    finishReplaySeek(gm);
    return true;
  }

  _autosaveTick(session) {
    const gm = session.gameManager;
    if (this.replayCtl) return;
    if (this._autosaveMinutes <= 0 || gm.isGameOver || gm.currentTick < this._nextAutosaveTick) return;
    this._nextAutosaveTick = gm.currentTick + Math.round((this._autosaveMinutes * 60) / SIM_DT);
    this.saveToSlot(AUTOSAVE_SLOT).catch((err) => console.warn('[WarPoly] autosave falhou:', err));
  }

  /** Reaplica comandos e avança a simulação por quadros (com progresso) até o tick do save. */
  async _restoreSave(save, token) {
    const gm = this.session.gameManager;
    applySaveCommands(gm, save);
    const status = document.getElementById('loading-status');
    const est = document.getElementById('loading-est');
    let left = save.tick - gm.currentTick;
    while (left > 0) {
      left = fastForward(gm, save, 400);
      const pct = Math.round(((save.tick - left) / Math.max(1, save.tick)) * 100);
      this._updateLoadingUI({ percent: pct, current: 1, total: 1, name: 'match', estSeconds: 1 });
      if (status) status.textContent = t('loading.restoring');
      if (est) est.textContent = t('loading.replaying', { min: Math.floor(save.tick * SIM_DT / 60), pct });
      await nextFrame();
      if (token !== this._loadToken || !this.fsm.is(S.LOADING)) { gm.events.presentationMuted = false; return false; }
    }
    const res = finishFastForward(gm, save);
    if (!res.ok) {
      console.warn('[WarPoly] save: o checksum não bate (versão do jogo diferente?)', res);
      this._saveMismatch = true;
    }
    this._restoreView(save.view);
    return true;
  }

  goToMainMenu() {
    if (this.fsm.can(S.MAIN_MENU)) this.fsm.transition(S.MAIN_MENU);
  }

  /** Sair: fecha a aba quando o navegador permite; senão volta ao menu principal. */
  quit() {
    this.goToMainMenu();
    try { window.close(); } catch { /* aba não aberta por script */ }
  }

  // ------------------------------------------------------------------ estados
  _enterMainMenu() {
    this.pauseMenu.hide();
    this._disposeSession();
    this._hideLoadingScreen(false);
    if (this.menu) return; // voltando do painel Escaramuça (MatchSetup)
    this.menu = showMainMenu(document.body, {
      onOptions: () => this.optionsPanel.open(),
      onStart: (choice) => this._onMenuStart(choice),
      onLoadGame: () => this.saveDialog.open('load'),
      onReplays: () => this.replayDialog.open(),
      onSetupChange: (open) => {
        if (open && this.fsm.is(S.MAIN_MENU)) this.fsm.transition(S.MATCH_SETUP);
        else if (!open && this.fsm.is(S.MATCH_SETUP)) this.fsm.transition(S.MAIN_MENU);
      }
    });
  }

  /** F6-02: o menu entrega a MatchConfig completa (`choice.config`); sem ela cai no createMatchConfig legado. */
  _onMenuStart({ config: chosen, faction, difficulty, mapId, victoryMode }) {
    if (this.fsm.is(S.MAIN_MENU)) this.fsm.transition(S.MATCH_SETUP);
    if (!this.fsm.is(S.MATCH_SETUP)) return;
    const config = chosen || createMatchConfig({
      localFaction: faction,
      difficulty,
      mapId,
      victoryMode,
      ffa: ['1', 'true'].includes(this.params.get('ffa'))
    });
    this.fsm.transition(S.LOADING, { config });
  }

  /**
   * F9-04: a sessão lockstep nos removeu (caímos e a IA assumiu). Recria a partida local do zero (mantendo
   * sessão e transporte) para receber o snapshot de um par saudável e voltar ao jogo.
   */
  _resyncOnlineMatch(online) {
    if (this.session?.online !== online) return;
    online.keepAlive = true;
    if (this.fsm.is(S.IN_GAME)) this.fsm.transition(S.PAUSED);
    if (this.fsm.is(S.PAUSED)) this.fsm.transition(S.LOADING, { config: online.config, online });
  }

  _enterLoading({ config, save = null, online = null, replayPlay = null }) {
    const token = ++this._loadToken;
    this.pauseMenu.hide();
    this._disposeSession();
    if (this.menu) {
      this.menu.destroy();
      this.menu = null;
    }
    this.matchConfig = config;
    this._loadMatch(config, token, save, online, replayPlay).catch((err) => {
      console.error('[WarPoly] falha ao carregar a partida:', err);
      if (token === this._loadToken && this.fsm.is(S.LOADING)) this.fsm.transition(S.MAIN_MENU);
    });
  }

  async _loadMatch(config, token, save = null, online = null, replayPlay = null) {
    const firstServices = !this.sceneManager;
    const restoring = save || replayPlay; // F2-06/F9-05: partida que avança até um tick antes de jogar
    this._ensureServices();

    const needsPreload = !this.assetsReady && !this.skipPreload;
    if (this.skipPreload && firstServices && !restoring) {
      // Comportamento histórico do ?skipPreload: sem tela de loading, partida na hora.
      this._hideLoadingScreen(false);
    } else {
      this._showLoadingScreen(needsPreload);
      if (needsPreload) {
        await AssetPreloader.preloadAll(this.sceneManager.renderer, (info) => this._updateLoadingUI(info));
      }
      // Deixa a tela de loading pintar antes da construção síncrona da partida.
      await nextFrame();
      await nextFrame();
    }
    // Carrega .glb se com ?skipPreload e não foram carregados ainda
    if (this.skipPreload && !this.assetsReady) {
      try {
        await ensureGlbLoaded();
      } catch (err) {
        console.warn('[main.js] erro ao carregar .glb com skipPreload:', err);
        // continua com modelos procedurais
      }
    }

    this.assetsReady = true;
    if (token !== this._loadToken || !this.fsm.is(S.LOADING)) return;

    this.session = new MatchSession({ sceneManager: this.sceneManager, sound: this.sound, matchConfig: config, online });
    if (online) this.session.onOnlineResync = () => setTimeout(() => this._resyncOnlineMatch(online), 0);
    this.matchCount++;
    this._saveMismatch = false;
    if (save) {
      if (this.skipPreload && firstServices) this._showLoadingScreen(false);
      const ok = await this._restoreSave(save, token);
      if (!ok) return;
    }
    if (replayPlay) {
      // F9-05: modo replay — comandos humanos do arquivo, sem gravação, sem entrada de comandos.
      const gm = this.session.gameManager;
      attachReplay(gm, replayPlay.replay);
      if (this.skipPreload && firstServices) this._showLoadingScreen(false);
      const ok = await this._seekReplayLoading(gm, replayPlay, token);
      if (!ok) return;
      this.replayCtl = new ReplayController({
        session: this.session,
        replay: replayPlay.replay,
        view: replayPlay.view,
        onExit: () => this.exitReplay(),
        onReload: (o) => this.playReplay(replayPlay.replay, o)
      });
    } else {
      this.replays.begin(this.session.gameManager, { online: !!online }); // F9-05: gravação automática
    }
    this._nextAutosaveTick = this._autosaveMinutes > 0
      ? this.session.gameManager.currentTick + Math.round((this._autosaveMinutes * 60) / SIM_DT)
      : Infinity;
    this.timer.update(); // o tempo de carga não vira um delta gigante

    if (!(this.skipPreload && firstServices && !restoring)) this._hideLoadingScreen(true);
    this.fsm.transition(S.IN_GAME);
    if (this._saveMismatch) {
      this.session.uiManager.showNotification(`⚠️ ${t('main.saveMismatch')}`, 7000);
    }
  }

  _enterInGame(from) {
    const im = this.session.inputManager;
    im.suspended = false;
    im.onPauseRequest = this.replayCtl ? () => this.replayCtl.togglePause() : () => this.pause();
    if (from !== S.LOADING) return;

    // 1ª partida da página: ganchos de depuração e atalhos de URL, como antes da F2-04.
    if (!this._booted) {
      this._booted = true;
      window.game = this;
      if (this.params.get('settings') === '1' || this.params.get('config') === '1') {
        const panel = document.getElementById('settings-panel');
        if (panel) panel.style.display = 'block';
      }
      if (this.params.has('bench')) import('./debug/bench.js').then((m) => m.startBench(this));
    }
  }

  _enterPaused() {
    this.session.inputManager.suspended = true;
    this.pauseMenu.show();
  }

  _enterPostGame() {
    // A simulação já parou (isGameOver); o modal de fim de jogo é mostrado pelo UIManager.
    this.session.inputManager.onPauseRequest = null;
    requestAnimationFrame(() => document.getElementById('btn-play-again')?.focus({ preventScroll: true }));
  }

  // ------------------------------------------------------------------ serviços
  _ensureServices() {
    if (this.sceneManager) return;
    this.sound = new SoundManager();
    applyAudio(this.sound);
    this.sceneManager = new SceneManager(this.container);

    // Libera o áudio na primeira interação (política de autoplay)
    const unlockAudio = () => {
      this.sound.resume();
      window.removeEventListener('click', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    };
    window.addEventListener('click', unlockAudio);
    window.addEventListener('keydown', unlockAudio);

    this.timer = new THREE.Timer();
    requestAnimationFrame(this._animate);
  }

  _disposeSession() {
    if (!this.session) return;
    this.replays.finish().catch((err) => console.warn('[WarPoly] replay: falha ao gravar:', err)); // F9-05 (snapshot síncrono)
    this.replayCtl?.dispose();
    this.replayCtl = null;
    this.session.dispose();
    this.session = null;
  }

  /** Botões estáticos do index.html ligados uma vez (a HUD vive a página inteira). */
  _bindStaticHud() {
    document.getElementById('btn-pause-menu')?.addEventListener('click', () => this.pause());
    document.getElementById('btn-play-again')?.addEventListener('click', () => this.playAgain());
    document.getElementById('btn-go-main-menu')?.addEventListener('click', () => this.goToMainMenu());
    document.addEventListener('warpoly:tutorial-exit', () => this.goToMainMenu()); // F6-09
    document.addEventListener('warpoly:mission-retry', () => this.restartMatch()); // F8-04: tela de fim de missão
    document.addEventListener('warpoly:mission-menu', () => this.goToMainMenu());
  }

  _animate() {
    requestAnimationFrame(this._animate);
    // F6-08: limite de FPS (Opções > Gráficos). 0 = sem limite.
    const cap = QualitySettings.current.fpsCap;
    if (cap > 0) {
      const now = performance.now();
      if (this._lastFrameAt && now - this._lastFrameAt < 1000 / cap - 1) return;
      this._lastFrameAt = now;
    }
    this.timer.update();
    const delta = Math.min(this.timer.getDelta(), 0.1);
    const elapsedTime = this.timer.getElapsed();

    const session = this.session;
    if (!session) return; // menu/loading: nada para desenhar

    // F9-03: em rede não há pausa local (a sim é compartilhada; pausa votada = F9-04) — o menu de pausa abre por cima.
    const ctl = this.replayCtl; // F9-05
    ctl?.update();
    const simulate = (this.fsm.is(S.IN_GAME) || (!!session.online && this.fsm.is(S.PAUSED))) && (!ctl || ctl.simulate);
    session.update(delta, elapsedTime, simulate);
    if (simulate && !ctl) {
      this._autosaveTick(session);
      this.replays.poll();
    }
    this.sceneManager.render();

    if (simulate && !ctl && session.gameManager.isGameOver) {
      this.replays.finish().catch((err) => console.warn('[WarPoly] replay: falha ao gravar:', err)); // F9-05
      this.fsm.transition(S.POST_GAME);
    }
  }

  // ------------------------------------------------------------------ tela de loading
  _showLoadingScreen(withProgress) {
    const screen = document.getElementById('loading-screen');
    if (!screen) return;
    screen.classList.remove('fade-out');
    screen.style.display = '';
    clearTimeout(this._loadingFadeTimer);
    if (!withProgress) {
      this._updateLoadingUI({ percent: 100, current: 1, total: 1, name: 'batalha', estSeconds: 0 });
      const status = document.getElementById('loading-status');
      const est = document.getElementById('loading-est');
      if (status) status.textContent = t('loading.battlefield');
      if (est) est.textContent = t('loading.positioning');
    }
  }

  _hideLoadingScreen(fade) {
    const screen = document.getElementById('loading-screen');
    if (!screen || screen.style.display === 'none') return;
    clearTimeout(this._loadingFadeTimer);
    if (!fade) {
      screen.style.display = 'none';
      return;
    }
    screen.classList.add('fade-out');
    this._loadingFadeTimer = setTimeout(() => {
      screen.style.display = 'none';
    }, 650);
  }

  _updateLoadingUI(info) {
    const fillEl = document.getElementById('loading-bar-fill');
    const percentEl = document.getElementById('loading-percentage');
    const statusEl = document.getElementById('loading-status');
    const estEl = document.getElementById('loading-est');
    if (fillEl) fillEl.style.width = `${info.percent}%`;
    if (percentEl) percentEl.textContent = `${info.percent}%`;
    if (statusEl) {
      statusEl.textContent = info.name === 'Pronto!'
        ? t('loading.ready')
        : t('loading.preparing', { current: info.current, total: info.total });
    }
    if (estEl) {
      if (info.percent >= 100) {
        estEl.textContent = t('loading.starting');
      } else if (info.estSeconds > 0) {
        estEl.textContent = t('loading.eta', { s: info.estSeconds });
      } else {
        estEl.textContent = t('loading.finalizing');
      }
    }
  }
}

// Start Game when DOM is ready
window.addEventListener('DOMContentLoaded', () => {
  // F6-09: textos estáticos do index.html (data-i18n*) no idioma salvo/detectado; troca em tempo real.
  document.documentElement.lang = getLanguage() === 'en' ? 'en' : 'pt-BR';
  applyI18n();
  onLanguageChange(() => applyI18n());
  const app = new GameApp();
  // Máquina de estados acessível mesmo antes da 1ª partida (window.game só aparece no InGame).
  window.warpoly = app;
  app.start();
});
