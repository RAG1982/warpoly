import { createGameSimAdapter } from '../net/GameSimAdapter.js';
import { OnlineHud } from '../net/OnlineHud.js';
import { attachOnlineUi } from '../net/onlineUi.js';
import { Terrain } from '../sim/Terrain.js';
import { TerrainView } from '../render/TerrainView.js';
import { FogView } from '../render/FogView.js';
import { getMap } from '../data/maps/index.js';
import { Water } from '../world/Water.js';
import { Decorations } from '../world/Decorations.js';
import { ParticleSystem } from '../entities/ParticleSystem.js';
import { ModelFactory } from '../entities/ModelFactory.js';
import { GameManager } from '../sim/GameManager.js';
import '../ai/registerAI.js'; // F2-08d: fábrica do AIDirector
import { InputManager } from './InputManager.js';
import { UIManager } from '../ui/UIManager.js';
import { collectSharedResources, disposeObjectTree } from '../render/sceneDisposal.js';
import { createAudioEvents } from '../audio/AudioEvents.js';
import { createVfxEvents } from '../render/VfxEvents.js';
import { RuinsManager } from '../render/RuinsManager.js';
import { VfxSystem } from '../render/vfx/VfxSystem.js';
import { selectVfxLevel } from '../render/vfx/vfxConfig.js';
import { getTextureQuality } from '../models/textureQuality.js';
import { QualitySettings } from './QualitySettings.js';
import { HazardView } from '../render/HazardView.js';
import { ProjectileViews } from '../render/ProjectileViews.js';
import { EntityViews } from '../render/EntityViews.js';
import { createUiEvents } from '../ui/UiEvents.js';
import { TutorialController } from '../ui/TutorialController.js';
import { MissionController } from '../ui/MissionController.js';
import { options } from '../ui/optionsStore.js';

/**
 * MatchSession — uma partida descartável (F2-04).
 *
 * Cria, a partir de uma MatchConfig, tudo o que é da partida: Terrain, Water, Decorations,
 * ParticleSystem, GameManager, InputManager e UIManager. `dispose()` desfaz tudo:
 *  - remove da cena todo objeto adicionado depois da criação da sessão e descarta as
 *    geometrias/materiais que não pertencem aos caches do ModelFactory (templates,
 *    fantasmas e materiais compartilhados continuam vivos para a próxima partida);
 *  - remove os listeners de window/DOM (InputManager, UIManager);
 *  - cancela timers (notificação da HUD) e para as IAs;
 *  - limpa partículas e textos flutuantes.
 *
 * Vivem a aplicação inteira (não são tocados aqui): renderer, SceneManager (cena, luzes,
 * câmera), SoundManager e os templates/texturas em cache.
 */
export class MatchSession {
  /**
   * @param {object} deps
   * @param {import('./SceneManager.js').SceneManager} deps.sceneManager
   * @param {import('./SoundManager.js').SoundManager} deps.sound
   * @param {object} deps.matchConfig  ver src/sim/MatchConfig.js
   * @param {object|null} [deps.online]  F9-03: partida online `{session, proxy, names, dispose}` (OnlineLobby); null = single-player
   */
  constructor({ sceneManager, sound, matchConfig, online = null }) {
    this.sceneManager = sceneManager;
    this.sound = sound;
    this.matchConfig = matchConfig;
    this.disposed = false;

    const scene = sceneManager.scene;
    // Tudo o que já está na cena (luzes, alvo do sol) é da aplicação.
    this._baseline = new Set(scene.children);

    this._resetView();

    // Mundo (F2-05: mapa orientado a dados — ver src/data/maps/README.md)
    this.terrain = new Terrain(getMap(matchConfig.mapId));
    this.terrainView = new TerrainView(scene, this.terrain); // F2-08c: malha do terreno (picking via `terrainView.mesh`)
    sceneManager.applyTileset?.(this.terrainView.tileset); // F7-04: céu/névoa/ambiente do tileset do mapa
    this.water = new Water(scene, this.terrain);
    this.decorations = new Decorations(scene, this.terrain);
    this.particleSystem = new ParticleSystem(scene);
    this.vfx = null; // F7-05 (só fora do headless)

    // Simulação (jogadores e bases a partir da MatchConfig, F2-01)
    this.gameManager = new GameManager(this.terrain, sound, this.particleSystem, matchConfig);
    if (!this.gameManager.headless) this.gameManager.gameSpeed = options.get('defaultSpeed'); // F6-08

    // F9-03: partida online — a sessão lockstep passa a dirigir a sim; comandos da UI vão para ela (ver GameManager.issue).
    this.online = online;
    this.onlineHud = null;
    this.onlineUi = null;
    /** F9-04: chamado quando a sessão online nos removeu (viramos IA) — `main.js` recria a partida local para o snapshot. */
    this.onOnlineResync = null;
    if (online) {
      online.keepAlive = false;
      const gm = this.gameManager;
      online.proxy.target = createGameSimAdapter(gm, { render: !gm.headless });
      gm.netIssue = (fields) => {
        try {
          online.session.queueCommand(fields);
        } catch (err) {
          console.warn('[WarPoly online] comando recusado:', err.message);
        }
      };
      this.onlineHud = new OnlineHud(online.session, online.names);
    }

    // Entrada e HUD
    this.inputManager = new InputManager(sceneManager, this.gameManager, this.terrain, this.terrainView);
    this.uiManager = new UIManager(this.gameManager, sceneManager, this.inputManager, sound);
    this.gameManager.soundManager = sound; // F2-08d: gancho de apresentação (lido só pelo InputManager)
    this.gameManager.uiManager = this.uiManager;
    this.gameManager.sceneManager = sceneManager;
    this.inputManager.uiManager = this.uiManager;
    if (online) {
      // F9-04: chat, pings de aliados e avisos de pausa/queda (só apresentação).
      this.onlineUi = attachOnlineUi({ online, gm: this.gameManager, sceneManager, uiManager: this.uiManager, inputManager: this.inputManager, onResync: () => this.onOnlineResync?.() });
    }

    // F2-08b/c: malhas das entidades de simulação puras (árvores, minas, critters, construções, unidades) e a parte
    // visual da névoa — antes do warm-up de shaders. Fora do headless.
    this.fogView = null;
    this.entityViews = null;
    if (!this.gameManager.headless) {
      const gm = this.gameManager;
      // Névoa (textura/shader, minimapa, fantasmas): criada com só terreno/água/decoração na cena (`markGroundMeshes`).
      this.fogView = new FogView(gm.fogOfWar, scene);
      gm.fogView = this.fogView; // lido pela HUD (minimapa)
      this.entityViews = new EntityViews(gm, scene);
      this.entityViews.particles = this.particleSystem; // F4-07b: esteira dos navios
      gm.entityViews = this.entityViews; // picking (InputManager)
      this.fogView.viewOf = e => this.entityViews.viewOf(e);
      this.entityViews.update();
    }

    this.focusCameraOnLocalBase();
    this.gameManager.onMatchStarted = () => this.focusCameraOnLocalBase(); // `GameManager.startMatch`
    // Compila os shaders da cena viva antes de a névoa esconder objetos
    this._warmLiveScene();

    // F2-07: ouvintes de apresentação (áudio/VFX/UI) do barramento de eventos da simulação —
    // nunca em modo headless (`MatchConfig.headless`: sem DOM/WebGL/Web Audio em Node).
    this._disposeAudioEvents = null;
    this._disposeVfxEvents = null;
    this._disposeUiEvents = null;
    this.ruins = null;
    if (!this.gameManager.headless) {
      this._disposeAudioEvents = createAudioEvents(this.gameManager, sound);
      // F7-05: partículas GPU em pool (nível por preset; `?vfx=off|low|med|high` força; `?texq=low` reduz).
      let vfxParam = null;
      try { vfxParam = new URLSearchParams(window.location.search).get('vfx'); } catch { /* sem window */ }
      const vfxLevel = selectVfxLevel(QualitySettings.current, getTextureQuality(), vfxParam);
      this.vfx = new VfxSystem(scene, vfxLevel, this.gameManager);
      this._disposeVfxEvents = createVfxEvents(this.gameManager, this.particleSystem, this.vfx);
      this.gameManager.hazardView = new HazardView(scene, this.gameManager); // F4-04b
      this.projectileViews = new ProjectileViews(this.gameManager, scene); // F2-08: malhas dos projéteis
      this._disposeUiEvents = createUiEvents(this.gameManager, this.uiManager);
      // NEW-19: ruínas visuais (só apresentação)
      this.ruins = new RuinsManager(this.gameManager, scene, QualitySettings);
      this.ruins.attach();
      // F6-09: tutorial jogável (missão 0) — painel de objetivo e setas só nesta partida.
      this.tutorialController = matchConfig.tutorial
        ? new TutorialController({
          gm: this.gameManager,
          sceneManager,
          uiManager: this.uiManager,
          onExit: () => document.dispatchEvent(new CustomEvent('warpoly:tutorial-exit'))
        })
        : null;
      // F8-04: missão — painel de objetivos, diálogos, cutscenes e tela de fim (só apresentação).
      this.missionController = this.gameManager.mission
        ? new MissionController({ gm: this.gameManager, sceneManager, inputManager: this.inputManager, uiManager: this.uiManager, sound })
        : null;
    }
  }

  /** Câmera na base do jogador local. */
  focusCameraOnLocalBase() {
    const p = this.gameManager.localPlayer;
    if (this.sceneManager && p && p.startPos) {
      this.sceneManager.cameraTarget.set(p.startPos.x, 2.5, p.startPos.z);
    }
  }

  /** Compila os shaders de tudo o que está na cena (inclusive malhas ocultas), antes da primeira renderização. */
  _warmLiveScene() {
    const sm = this.sceneManager;
    if (!sm || !sm.renderer) return;
    const scene = sm.scene;
    const unhideList = [];
    scene.traverse(obj => {
      if (obj.isMesh && !obj.visible) {
        obj.visible = true;
        unhideList.push(obj);
      }
    });
    sm.renderer.compile(scene, sm.camera);
    for (let i = 0; i < unhideList.length; i++) {
      unhideList[i].visible = false;
    }
  }

  /** Câmera e hora do dia voltam ao padrão (o SceneManager sobrevive entre partidas). */
  _resetView() {
    const sm = this.sceneManager;
    sm.zoomLevel = sm.targetZoomLevel = 1.0;
    sm.cameraAngle = sm.targetCameraAngle = Math.PI / 4;
    if (sm.timeOfDay && sm.timeOfDay !== 'day') sm.setTimeOfDay('day');
    sm.invalidateShadowFrustum?.();
  }

  /**
   * Um quadro da partida.
   * F1-09: a simulação roda em passos fixos de `SIM_DT` (20 Hz) via `gameManager.advance()`;
   * `renderUpdate()` interpola a pose visual entre o passo anterior e o atual (`alpha`) e roda
   * a cada quadro renderizado, independente de quantos passos de simulação ocorreram nele.
   * @param {number} delta  segundos (já limitado)
   * @param {number} elapsed  tempo total do relógio da aplicação
   * @param {boolean} simulate  false no menu de pausa: câmera, água e HUD continuam
   */
  update(delta, elapsed, simulate = true) {
    if (this.disposed) return;
    this.inputManager.update(delta);
    this.sceneManager.updateCamera(delta);
    this.water.update(elapsed);
    this.decorations?.applyLod(this.sceneManager.zoomLevel); // F1-10: decorações pequenas somem no zoom máximo
    if (simulate) {
      const gm = this.gameManager;
      let alpha;
      if (this.online) {
        // F9-03: quem decide quantos passos rodam é a sessão (turnos de 100 ms em tempo real).
        alpha = this.online.session.pump(delta * 1000).alpha;
        gm._lastAlpha = alpha;
        this.onlineHud?.update(delta);
        this.onlineUi?.update();
      } else {
        alpha = gm.advance(delta);
      }
      this._presentFrame(delta, alpha);
      this.projectileViews?.update(alpha);
      this.particleSystem.update(delta);
      this.vfx?.update(delta);
      this.ruins?.update(delta);
    } else {
      // Pausado: mantém a pose de simulação (sem avançar), billboards seguem a câmera.
      this._presentFrame(0, 1);
      this.projectileViews?.update(1);
    }
    this.uiManager.update(delta);
    this.tutorialController?.update(delta);
    this.missionController?.update(delta, simulate); // F8-04
  }

  /**
   * F2-08c: parte visual do quadro (nunca escreve na simulação): perigos, névoa (textura/fantasmas/esconder malhas
   * inimigas), views das entidades (interpolação, LOD de animação, barras, VFX ambiente) e despacho dos eventos
   * emitidos pelas views (fumaça, faíscas…) para áudio/partículas.
   */
  _presentFrame(delta, alpha) {
    const gm = this.gameManager;
    if (!gm.isPaused && !gm.isGameOver) {
      if (gm.hazardView) gm.hazardView.update(delta); // F4-04b
      if (this.fogView) {
        const fl = gm._fogLists;
        this.fogView.update(fl.playerUnits, fl.playerBuildings, gm.enemies, fl.enemyBuildings);
      }
    }
    this.entityViews?.update(delta, alpha);
    gm.renderUpdate(delta, alpha); // despacha `events.flush()` (se não pausado)
    gm.events.flush();
  }

  /** Estatísticas para o teste de vazamento. */
  static sceneObjectCount(scene) {
    let n = 0;
    scene.traverse(() => n++);
    return n;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    const scene = this.sceneManager.scene;
    this.sceneManager.applyTileset?.(null); // F7-04: céu/névoa voltam ao padrão

    // 0. Ouvintes do barramento de eventos (F2-07) — antes de tudo, para não reagir a eventos
    // emitidos durante o próprio dispose (ex.: Building.dispose não emite, mas por segurança).
    this._disposeAudioEvents?.();
    this._disposeVfxEvents?.();
    if (this.gameManager.hazardView) { this.gameManager.hazardView.dispose(); this.gameManager.hazardView = null; }
    this.projectileViews?.dispose();
    this.projectileViews = null;
    this._disposeUiEvents?.();
    this.ruins?.dispose();
    this.tutorialController?.dispose();
    this.tutorialController = null;
    this.missionController?.dispose(); // F8-04
    this.missionController = null;

    // F9-03: encerra a sessão online (HUD, transporte, sala).
    this.onlineHud?.dispose();
    this.onlineHud = null;
    this.onlineUi?.dispose();
    this.onlineUi = null;
    this.gameManager.netIssue = null;
    if (this.online?.keepAlive) {
      // F9-04: recriação para ressincronizar — a sessão lockstep e o transporte continuam vivos; só a sim local morre.
      if (this.online.proxy) this.online.proxy.target = null;
    } else {
      this.online?.dispose?.();
    }
    this.online = null;

    // 1. Entrada e HUD primeiro: nada mais reage a eventos desta partida.
    this.inputManager.dispose();
    this.uiManager.dispose();

    // 2. Partículas e textos flutuantes (texturas de canvas próprias).
    this.particleSystem.dispose();
    this.vfx?.dispose();
    this.vfx = null;

    // 3. Tudo o que a partida pôs na cena: remove e descarta o que não é compartilhado.
    const shared = collectSharedResources(ModelFactory);
    const disposed = { geometries: new Set(), materials: new Set() };
    const extra = scene.children.filter(o => !this._baseline.has(o));
    for (const obj of extra) disposeObjectTree(obj, shared, disposed);
    this.lastDisposeStats = {
      objects: extra.length,
      geometries: disposed.geometries.size,
      materials: disposed.materials.size
    };

    // 4. Views das entidades (árvores instanciadas, lotes de muralha) e da névoa; depois a simulação (IAs, entidades).
    this.entityViews?.dispose();
    this.entityViews = null;
    this.fogView?.dispose();
    this.fogView = null;
    this.gameManager.fogView = null;
    this.gameManager.entityViews = null;
    this.gameManager.dispose();

    // 5. Solta as referências (o GC leva o resto).
    this.terrain = this.terrainView = this.water = this.decorations = this.particleSystem = null;
    this.gameManager = this.inputManager = this.uiManager = null;
    this._baseline = null;
  }
}
