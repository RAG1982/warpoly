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
    this.clock = null;
    this.assetsReady = false; // preload feito (roda uma vez só)

    // Partida
    this.session = null;
    this.matchConfig = null;
    this.matchCount = 0;
    this._loadToken = 0;

    this.menu = null;
    this.pauseMenu = new PauseMenu({
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
  /** F1-04: presets de qualidade (window.game.quality) */
  get quality() { return this.sceneManager?.quality ?? QualitySettings; }
  get state() { return this.fsm.state; }

  /** Boot: menu principal, ou direto para a partida se a URL pedir (?play, ?skipPreload, ?bench…). */
  start() {
    if (shouldShowMainMenu()) {
      this.fsm.transition(S.MAIN_MENU);
    } else {
      this.fsm.transition(S.LOADING, { config: matchConfigFromSearch(window.location.search) });
    }
  }

  // ------------------------------------------------------------------ ações
  pause() {
    if (this.fsm.is(S.IN_GAME)) this.fsm.transition(S.PAUSED);
  }

  resume() {
    if (this.fsm.is(S.PAUSED)) this.fsm.transition(S.IN_GAME);
  }

  /** Reiniciar (menu de pausa): mesma MatchConfig, mesma seed. */
  restartMatch() {
    if (this.fsm.is(S.PAUSED) || this.fsm.is(S.POST_GAME)) {
      this.fsm.transition(S.LOADING, { config: this.matchConfig });
    }
  }

  /** Jogar novamente (fim de jogo): mesma MatchConfig, seed nova. */
  playAgain() {
    if (this.fsm.is(S.POST_GAME)) {
      this.fsm.transition(S.LOADING, { config: withNewSeed(this.matchConfig) });
    }
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
      onStart: (choice) => this._onMenuStart(choice),
      onSetupChange: (open) => {
        if (open && this.fsm.is(S.MAIN_MENU)) this.fsm.transition(S.MATCH_SETUP);
        else if (!open && this.fsm.is(S.MATCH_SETUP)) this.fsm.transition(S.MAIN_MENU);
      }
    });
  }

  _onMenuStart({ faction, difficulty }) {
    if (this.fsm.is(S.MAIN_MENU)) this.fsm.transition(S.MATCH_SETUP);
    if (!this.fsm.is(S.MATCH_SETUP)) return;
    const config = createMatchConfig({
      localFaction: faction,
      difficulty,
      ffa: ['1', 'true'].includes(this.params.get('ffa'))
    });
    this.fsm.transition(S.LOADING, { config });
  }

  _enterLoading({ config }) {
    const token = ++this._loadToken;
    this.pauseMenu.hide();
    this._disposeSession();
    if (this.menu) {
      this.menu.destroy();
      this.menu = null;
    }
    this.matchConfig = config;
    this._loadMatch(config, token).catch((err) => {
      console.error('[WarPoly] falha ao carregar a partida:', err);
      if (token === this._loadToken && this.fsm.is(S.LOADING)) this.fsm.transition(S.MAIN_MENU);
    });
  }

  async _loadMatch(config, token) {
    const firstServices = !this.sceneManager;
    this._ensureServices();

    const needsPreload = !this.assetsReady && !this.skipPreload;
    if (this.skipPreload && firstServices) {
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

    this.session = new MatchSession({ sceneManager: this.sceneManager, sound: this.sound, matchConfig: config });
    this.matchCount++;
    this.clock.getDelta(); // o tempo de carga não vira um delta gigante

    if (!(this.skipPreload && firstServices)) this._hideLoadingScreen(true);
    this.fsm.transition(S.IN_GAME);
  }

  _enterInGame(from) {
    const im = this.session.inputManager;
    im.suspended = false;
    im.onPauseRequest = () => this.pause();
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
    this.sceneManager = new SceneManager(this.container);

    // Libera o áudio na primeira interação (política de autoplay)
    const unlockAudio = () => {
      this.sound.resume();
      window.removeEventListener('click', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    };
    window.addEventListener('click', unlockAudio);
    window.addEventListener('keydown', unlockAudio);

    this.clock = new THREE.Clock();
    requestAnimationFrame(this._animate);
  }

  _disposeSession() {
    if (!this.session) return;
    this.session.dispose();
    this.session = null;
  }

  /** Botões estáticos do index.html ligados uma vez (a HUD vive a página inteira). */
  _bindStaticHud() {
    document.getElementById('btn-pause-menu')?.addEventListener('click', () => this.pause());
    document.getElementById('btn-play-again')?.addEventListener('click', () => this.playAgain());
    document.getElementById('btn-go-main-menu')?.addEventListener('click', () => this.goToMainMenu());
  }

  _animate() {
    requestAnimationFrame(this._animate);
    const delta = Math.min(this.clock.getDelta(), 0.1);
    const elapsedTime = this.clock.getElapsedTime();

    const session = this.session;
    if (!session) return; // menu/loading: nada para desenhar

    const simulate = this.fsm.is(S.IN_GAME);
    session.update(delta, elapsedTime, simulate);
    this.sceneManager.render();

    if (simulate && session.gameManager.isGameOver) this.fsm.transition(S.POST_GAME);
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
      if (status) status.textContent = 'Preparando o campo de batalha...';
      if (est) est.textContent = 'Posicionando exércitos e recursos';
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
        ? 'Reino preparado com sucesso!'
        : `Preparando ${info.name}... (${info.current}/${info.total})`;
    }
    if (estEl) {
      if (info.percent >= 100) {
        estEl.textContent = 'Iniciando o reino de WarPoly...';
      } else if (info.estSeconds > 0) {
        estEl.textContent = `Tempo estimado restante: ~${info.estSeconds}s`;
      } else {
        estEl.textContent = 'Carregando detalhes finais...';
      }
    }
  }
}

// Start Game when DOM is ready
window.addEventListener('DOMContentLoaded', () => {
  const app = new GameApp();
  // Máquina de estados acessível mesmo antes da 1ª partida (window.game só aparece no InGame).
  window.warpoly = app;
  app.start();
});
