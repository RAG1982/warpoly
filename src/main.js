import * as THREE from 'three';
import { SceneManager } from './core/SceneManager.js';
import { SoundManager } from './core/SoundManager.js';
import { Terrain } from './world/Terrain.js';
import { Water } from './world/Water.js';
import { Decorations } from './world/Decorations.js';
import { ParticleSystem } from './entities/ParticleSystem.js';
import { GameManager } from './core/GameManager.js';
import { InputManager } from './core/InputManager.js';
import { UIManager } from './ui/UIManager.js';
import { AssetPreloader } from './core/AssetPreloader.js';

class GameApp {
  static async init() {
    const container = document.getElementById('game-container');
    const statusEl = document.getElementById('loading-status');
    const percentEl = document.getElementById('loading-percentage');
    const fillEl = document.getElementById('loading-bar-fill');
    const estEl = document.getElementById('loading-est');
    const screenEl = document.getElementById('loading-screen');

    const updateLoadingUI = (info) => {
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
    };

    // 1. Audio System
    const sound = new SoundManager();

    // 2. 3D Scene, Lighting, Camera
    const sceneManager = new SceneManager(container);

    // 3. Preload and warm all 3D models and procedural 2048x2048 textures
    const urlParams = new URLSearchParams(window.location.search);
    const skipPreload = urlParams.has('skipPreload');

    if (!skipPreload) {
      await AssetPreloader.preloadAll(sceneManager.renderer, (info) => {
        updateLoadingUI(info);
      });
    }

    // 4. Create App
    const app = new GameApp(container, sound, sceneManager);

    // 5. Smoothly fade out loading screen
    if (screenEl) {
      if (skipPreload) {
        screenEl.style.display = 'none';
      } else {
        screenEl.classList.add('fade-out');
        setTimeout(() => {
          screenEl.style.display = 'none';
        }, 650);
      }
    }

    return app;
  }

  constructor(container, sound, sceneManager) {
    this.sound = sound;
    this.sceneManager = sceneManager;
    this.quality = sceneManager.quality; // F1-04: presets de qualidade (window.game.quality)

    // 3. Environment & World
    this.terrain = new Terrain(this.sceneManager.scene);
    this.water = new Water(this.sceneManager.scene, this.terrain);
    this.decorations = new Decorations(this.sceneManager.scene, this.terrain);

    // 4. Particle Effects
    this.particleSystem = new ParticleSystem(this.sceneManager.scene);

    // 5. Game Logic & Entities (Castle, Lumber Camp, Gold Mine, Units)
    this.gameManager = new GameManager(
      this.sceneManager.scene,
      this.terrain,
      this.sound,
      this.particleSystem
    );

    // 6. Input & Camera Controls
    this.inputManager = new InputManager(
      this.sceneManager,
      this.gameManager,
      this.terrain
    );

    // 7. AAA Gold UI
    this.uiManager = new UIManager(
      this.gameManager,
      this.sceneManager,
      this.inputManager,
      this.sound
    );
    this.gameManager.uiManager = this.uiManager;
    this.gameManager.sceneManager = this.sceneManager;
    this.inputManager.uiManager = this.uiManager;

    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('faction') === 'orc') {
      this.gameManager.setPlayerFaction('orc');
    }
    if (urlParams.get('settings') === '1' || urlParams.get('config') === '1') {
      const panel = document.getElementById('settings-panel');
      if (panel) panel.style.display = 'block';
    }

    // Warm and precompile live scene shaders before fog of war culls objects
    this.gameManager.warmLiveScene();

    // Resume Audio on first user interaction
    const unlockAudio = () => {
      this.sound.resume();
      window.removeEventListener('click', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    };
    window.addEventListener('click', unlockAudio);
    window.addEventListener('keydown', unlockAudio);

    // Expose game instance globally for debugging and verification
    window.game = this;

    // Game Clock
    this.clock = new THREE.Clock();
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  animate() {
    requestAnimationFrame(this.animate);

    const delta = Math.min(this.clock.getDelta(), 0.1);
    const elapsedTime = this.clock.getElapsedTime();

    // Update systems
    this.inputManager.update(delta);
    this.sceneManager.updateCamera(delta);
    this.water.update(elapsedTime);
    this.gameManager.update(delta);
    this.particleSystem.update(delta);
    this.uiManager.update(delta);

    // Render 3D Scene
    this.sceneManager.render();
  }
}

// Start Game when DOM is ready
window.addEventListener('DOMContentLoaded', () => {
  GameApp.init();
});
