import { Terrain } from '../world/Terrain.js';
import { getMap } from '../data/maps/index.js';
import { Water } from '../world/Water.js';
import { Decorations } from '../world/Decorations.js';
import { ParticleSystem } from '../entities/ParticleSystem.js';
import { ModelFactory } from '../entities/ModelFactory.js';
import { GameManager } from './GameManager.js';
import { InputManager } from './InputManager.js';
import { UIManager } from '../ui/UIManager.js';
import { collectSharedResources, disposeObjectTree } from '../render/sceneDisposal.js';
import { createAudioEvents } from '../audio/AudioEvents.js';
import { createVfxEvents } from '../render/VfxEvents.js';
import { HazardView } from '../render/HazardView.js';
import { createUiEvents } from '../ui/UiEvents.js';

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
   */
  constructor({ sceneManager, sound, matchConfig }) {
    this.sceneManager = sceneManager;
    this.sound = sound;
    this.matchConfig = matchConfig;
    this.disposed = false;

    const scene = sceneManager.scene;
    // Tudo o que já está na cena (luzes, alvo do sol) é da aplicação.
    this._baseline = new Set(scene.children);

    this._resetView();

    // Mundo (F2-05: mapa orientado a dados — ver src/data/maps/README.md)
    this.terrain = new Terrain(scene, getMap(matchConfig.mapId));
    this.water = new Water(scene, this.terrain);
    this.decorations = new Decorations(scene, this.terrain);
    this.particleSystem = new ParticleSystem(scene);

    // Simulação (jogadores e bases a partir da MatchConfig, F2-01)
    this.gameManager = new GameManager(scene, this.terrain, sound, this.particleSystem, matchConfig);

    // Entrada e HUD
    this.inputManager = new InputManager(sceneManager, this.gameManager, this.terrain);
    this.uiManager = new UIManager(this.gameManager, sceneManager, this.inputManager, sound);
    this.gameManager.uiManager = this.uiManager;
    this.gameManager.sceneManager = sceneManager;
    this.inputManager.uiManager = this.uiManager;

    this.gameManager.focusCameraOnLocalBase();
    // Compila os shaders da cena viva antes de a névoa esconder objetos
    this.gameManager.warmLiveScene();

    // F2-07: ouvintes de apresentação (áudio/VFX/UI) do barramento de eventos da simulação —
    // nunca em modo headless (`MatchConfig.headless`: sem DOM/WebGL/Web Audio em Node).
    this._disposeAudioEvents = null;
    this._disposeVfxEvents = null;
    this._disposeUiEvents = null;
    if (!this.gameManager.headless) {
      this._disposeAudioEvents = createAudioEvents(this.gameManager, sound);
      this._disposeVfxEvents = createVfxEvents(this.gameManager, this.particleSystem);
      this.gameManager.hazardView = new HazardView(this.gameManager.scene, this.gameManager); // F4-04b
      this._disposeUiEvents = createUiEvents(this.gameManager, this.uiManager);
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
    if (simulate) {
      const alpha = this.gameManager.advance(delta);
      this.gameManager.renderUpdate(delta, alpha);
      this.particleSystem.update(delta);
    } else {
      // Pausado: mantém a pose de simulação (sem avançar), billboards seguem a câmera.
      this.gameManager.renderUpdate(0, 1);
    }
    this.uiManager.update(delta);
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

    // 0. Ouvintes do barramento de eventos (F2-07) — antes de tudo, para não reagir a eventos
    // emitidos durante o próprio dispose (ex.: Building.dispose não emite, mas por segurança).
    this._disposeAudioEvents?.();
    this._disposeVfxEvents?.();
    if (this.gameManager.hazardView) { this.gameManager.hazardView.dispose(); this.gameManager.hazardView = null; }
    this._disposeUiEvents?.();

    // 1. Entrada e HUD primeiro: nada mais reage a eventos desta partida.
    this.inputManager.dispose();
    this.uiManager.dispose();

    // 2. Partículas e textos flutuantes (texturas de canvas próprias).
    this.particleSystem.dispose();

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

    // 4. Simulação: IAs, entidades, névoa, árvores instanciadas.
    this.gameManager.dispose();

    // 5. Solta as referências (o GC leva o resto).
    this.terrain = this.water = this.decorations = this.particleSystem = null;
    this.gameManager = this.inputManager = this.uiManager = null;
    this._baseline = null;
  }
}
