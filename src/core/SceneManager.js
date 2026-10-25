import * as THREE from 'three';
import { QualitySettings } from './QualitySettings.js';
import { PostFX } from '../render/PostFX.js';
import { getTextureQuality } from '../models/textureQuality.js';
import {
  selectEffects, parseFxParam, parseDayNightParam, sampleDayNight, advancePhase, gradeOf, DEFAULT_DAY_BASE
} from './lighting.js';

// Temporários da shadow camera dinâmica (evita alocação por frame)
const _ndc = [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 0]];
const _ray = new THREE.Vector3();
const _pt = new THREE.Vector3();
const _center = new THREE.Vector3();
const _lightBasis = new THREE.Matrix4();
const _lightBasisInv = new THREE.Matrix4();
const _origin = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

/** F4-05: tremor de câmera das explosões — ligado por padrão; `?shake=0` desliga. */
const SHAKE_DURATION = 0.15;
const SHAKE_AMPLITUDE = 0.3;
const SHAKE_MAX_DIST = 50;
const _urlParams = (() => {
  try { return new URLSearchParams(globalThis.location ? globalThis.location.search : ''); } catch (e) { return new URLSearchParams(''); }
})();
const SHAKE_ENABLED = (() => {
  try { return new URLSearchParams(globalThis.location ? globalThis.location.search : '').get('shake') !== '0'; } catch (e) { return true; }
})();

export class SceneManager {
  constructor(canvasContainer) {
    this.container = canvasContainer;
    
    // Scene
    this.scene = new THREE.Scene();
    this.skyColor = 0x85c8ec;
    this.scene.background = new THREE.Color(this.skyColor);
    this.scene.fog = new THREE.Fog(this.skyColor, 95, 320);

    // Renderer (antialias vem do preset: só muda recarregando a página)
    this.quality = QualitySettings;
    this.renderer = new THREE.WebGLRenderer({ antialias: QualitySettings.current.antialias, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(QualitySettings.maxPixelRatio());
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.38;
    this.container.appendChild(this.renderer.domElement);

    // Camera (Isometric Diorama feel with low FOV and more horizontal angle)
    this.camera = new THREE.PerspectiveCamera(32, window.innerWidth / window.innerHeight, 0.5, 900);
    this.cameraTarget = new THREE.Vector3(32, 2.5, -30); // Starts focused on player base
    this.cameraOffset = new THREE.Vector3(45, 44, 45);
    this.camera.position.copy(this.cameraTarget).add(this.cameraOffset);
    this.camera.lookAt(this.cameraTarget);

    // Zoom and Pan tracking
    this.zoomLevel = 1.0;
    this.targetZoomLevel = 1.0;
    this.minZoom = 0.5;
    this.maxZoom = 1.8;
    this.cameraAngle = Math.PI / 4; // 45 degrees
    this.targetCameraAngle = Math.PI / 4;

    // Sombra dinâmica: ajustada pelo QualitySettings
    this.shadowUpdateInterval = 1;
    this.maxShadowDistance = 90;
    this._shadowFrame = 0;
    this._shadowKey = '';
    this._lastRenderTime = 0;

    // Lights
    this.setupLights();

    // F7-03: pós-processamento (composer só existe se algum efeito estiver ligado pelo preset) e ciclo dia/noite opcional
    this.postfx = new PostFX(this.renderer, this.scene, this.camera);
    this.dayNight = { ...parseDayNightParam(_urlParams.get('daynight'), _urlParams.get('tod')), _snap: null, _acc: 0, _sunDirAt: 0 };

    // Presets de qualidade (DPR, sombras, tone mapping, resolução dinâmica)
    QualitySettings.apply(this.renderer, this);
    if (this.dayNight.enabled) this.setDayNight({ enabled: true });

    // Time of day preset
    this.timeOfDay = 'day'; // 'day', 'sunset', 'night'

    // Resize event
    window.addEventListener('resize', () => this.onResize());
  }

  /** F7-03: (re)monta o pós-processamento conforme o preset atual (`?texq=low` desliga; `?fx=` força). */
  applyPostFx() {
    if (!this.postfx) return;
    const fx = selectEffects(QualitySettings.current, getTextureQuality(), parseFxParam(_urlParams.get('fx')));
    this.postfx.configure(fx);
    this.postfx.setGrade(gradeOf(this.tileset));
  }

  /**
   * F7-03: ciclo dia/noite (só visual, relógio de render; desligado por padrão). `cfg`: { enabled, period (s), phase (0..1) }.
   * Ao desligar restaura a iluminação anterior.
   */
  setDayNight(cfg = {}) {
    const d = this.dayNight;
    const wasOn = d.enabled;
    if (typeof cfg.period === 'number' && cfg.period >= 20) d.period = cfg.period;
    if (typeof cfg.phase === 'number') d.phase = cfg.phase - Math.floor(cfg.phase);
    if (typeof cfg.enabled === 'boolean') d.enabled = cfg.enabled;
    if (d.enabled && !d._snap) {
      d._snap = {
        sky: this.skyColor, sunColor: this.sunLight.color.getHex(), sunI: this.sunLight.intensity, sunPos: this.sunLight.position.clone(),
        hemiSky: this.hemiLight.color.getHex(), hemiGround: this.hemiLight.groundColor.getHex(), hemiI: this.hemiLight.intensity,
        fillColor: this.fillLight.color.getHex(), fillI: this.fillLight.intensity, exposure: this.renderer.toneMappingExposure
      };
      d._exposure0 = this.renderer.toneMappingExposure;
    }
    if (d.enabled) { d._acc = 1; this._applyDayNight(true); }
    else if (wasOn && d._snap) this._restoreDayNight();
  }

  _dayBase() {
    const a = this.tileset ? this.tileset.atmosphere : null;
    return a ? { sky: a.sky, hemiSky: a.hemiSky, hemiGround: a.hemiGround } : DEFAULT_DAY_BASE;
  }

  _applyDayNight(force) {
    const d = this.dayNight;
    const st = sampleDayNight(d.phase, this._dayBase());
    this.skyColor = st.sky;
    this.scene.background.set(st.sky);
    this.scene.fog.color.set(st.sky);
    this.sunLight.color.set(st.sunColor);
    this.sunLight.intensity = st.sunI;
    this.hemiLight.color.set(st.hemiSky);
    this.hemiLight.groundColor.set(st.hemiGround);
    this.hemiLight.intensity = st.hemiI;
    this.fillLight.color.set(st.fillColor);
    this.fillLight.intensity = st.fillI;
    this.renderer.toneMappingExposure = d._exposure0 * st.exposure;
    if (this.postfx) this.postfx.setNight(st.night);
    // direção do sol: a sombra só é recalculada em degraus (evita redesenhar o shadow map todo frame)
    const nx = st.sunPos[0] - this.sunAnchor.x, ny = st.sunPos[1] - this.sunAnchor.y, nz = st.sunPos[2] - this.sunAnchor.z;
    const len = Math.hypot(nx, ny, nz) || 1;
    const dot = (nx * this.sunDirection.x + ny * this.sunDirection.y + nz * this.sunDirection.z) / len;
    if (force || dot < 0.9995) {
      this.sunLight.position.set(st.sunPos[0], st.sunPos[1], st.sunPos[2]);
      this.sunDirection.set(nx / len, ny / len, nz / len);
      this.invalidateShadowFrustum();
    }
  }

  _restoreDayNight() {
    const d = this.dayNight;
    const sn = d._snap;
    this.skyColor = sn.sky;
    this.scene.background.set(sn.sky);
    this.scene.fog.color.set(sn.sky);
    this.sunLight.color.set(sn.sunColor);
    this.sunLight.intensity = sn.sunI;
    this.sunLight.position.copy(sn.sunPos);
    this.hemiLight.color.set(sn.hemiSky);
    this.hemiLight.groundColor.set(sn.hemiGround);
    this.hemiLight.intensity = sn.hemiI;
    this.fillLight.color.set(sn.fillColor);
    this.fillLight.intensity = sn.fillI;
    this.renderer.toneMappingExposure = sn.exposure;
    this.sunDirection.copy(this.sunLight.position).sub(this.sunAnchor).normalize();
    if (this.postfx) this.postfx.setNight(0);
    this.invalidateShadowFrustum();
    d._snap = null;
  }

  setupLights() {
    // Warm Hemisphere bounce light
    this.hemiLight = new THREE.HemisphereLight(0xe8f4ff, 0x627d54, 1.2);
    this.scene.add(this.hemiLight);

    // Main Sunlight (Angle tuned to match modelo.png: shadows fall to bottom-right)
    this.sunLight = new THREE.DirectionalLight(0xfffaee, 2.6);

    this.sunLight.position.set(-52, 68, -22);
    this.sunLight.castShadow = true;
    // Direção do sol: a posição da luz passa a seguir a câmera em updateShadowCamera.
    // Referência = alvo inicial da câmera (a luz antes era fixa e mirava esse alvo): mantém o ângulo das sombras.
    this.sunAnchor = this.cameraTarget.clone();
    this.sunDirection = this.sunLight.position.clone().sub(this.sunAnchor).normalize();
    
    // Shadow parameters for crisp low-poly shadows
    this.sunLight.shadow.mapSize.width = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
    this.sunLight.shadow.camera.near = 10;
    this.sunLight.shadow.camera.far = 220;
    const shadowD = 90;
    this.sunLight.shadow.camera.left = -shadowD;
    this.sunLight.shadow.camera.right = shadowD;
    this.sunLight.shadow.camera.top = shadowD;
    this.sunLight.shadow.camera.bottom = -shadowD;
    this.sunLight.shadow.bias = -0.0003;
    this.sunLight.shadow.normalBias = 0.02;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    // Ambient bounce fill from opposite angle
    this.fillLight = new THREE.DirectionalLight(0x8eb2d4, 0.45);
    this.fillLight.position.set(40, 30, 45);
    this.scene.add(this.fillLight);
  }

  /**
   * F7-04: céu/névoa/ambiente do tileset (`src/data/tilesets.js`). O tileset legado (verdejante) mantém os valores
   * originais da cena; os demais tingem céu, névoa de distância e luz hemisférica (só no modo 'day').
   */
  /** Limite da câmera (±) pela área jogável do mapa; mapas pequenos mantêm o mínimo histórico de 55. */
  setCameraBoundsFromMap(mapDef) {
    const play = (mapDef && (mapDef.playable || mapDef.size)) || 0;
    this.cameraBound = Math.max(55, play / 2);
  }

  applyTileset(def) {
    if (!this._baseAtmo) {
      this._baseAtmo = {
        sky: this.skyColor, fogNear: this.scene.fog.near, fogFar: this.scene.fog.far,
        hemiSky: this.hemiLight.color.getHex(), hemiGround: this.hemiLight.groundColor.getHex(), hemiI: this.hemiLight.intensity
      };
    }
    this.tileset = def && !def.legacy ? def : null;
    const a = this.tileset ? this.tileset.atmosphere : this._baseAtmo;
    this.skyColor = a.sky;
    this.scene.background.set(a.sky);
    this.scene.fog.color.set(a.sky);
    this.scene.fog.near = a.fogNear;
    this.scene.fog.far = a.fogFar;
    this.hemiLight.color.set(a.hemiSky);
    this.hemiLight.groundColor.set(a.hemiGround);
    if (!this.tileset) this.hemiLight.intensity = this._baseAtmo.hemiI;
    if (this.timeOfDay && this.timeOfDay !== 'day') this.setTimeOfDay(this.timeOfDay);
    if (this.postfx) this.postfx.setGrade(gradeOf(this.tileset)); // F7-03
    if (this.dayNight && this.dayNight.enabled) this._applyDayNight(true);
  }

  setTimeOfDay(mode) {
    this.timeOfDay = mode;
    if (mode === 'day') {
      this.skyColor = 0x85c8ec;
      this.scene.background.set(this.skyColor);
      this.scene.fog.color.set(this.skyColor);
      this.sunLight.color.set(0xfffaec);
      this.sunLight.intensity = 2.45;
      this.sunLight.position.set(-45, 75, -35);
      this.hemiLight.color.set(0xcde6ff);
      this.hemiLight.groundColor.set(0x567848);
      this.hemiLight.intensity = 1.05;
      this.fillLight.color.set(0x9fc3e7);
      this.fillLight.intensity = 0.55;
      if (this.tileset) { // F7-04: ambiente do tileset por cima do 'day' padrão
        const a = this.tileset.atmosphere;
        this.skyColor = a.sky;
        this.scene.background.set(a.sky);
        this.scene.fog.color.set(a.sky);
        this.hemiLight.color.set(a.hemiSky);
        this.hemiLight.groundColor.set(a.hemiGround);
      }
    } else if (mode === 'sunset') {
      this.skyColor = 0xdf8458;
      this.scene.background.set(this.skyColor);
      this.scene.fog.color.set(this.skyColor);
      this.sunLight.color.set(0xff9d47);
      this.sunLight.intensity = 2.4;
      this.sunLight.position.set(-60, 38, -50);
      this.hemiLight.color.set(0xffb785);
      this.hemiLight.groundColor.set(0x563829);
      this.hemiLight.intensity = 0.7;
      this.fillLight.color.set(0x5c3d6c);
      this.fillLight.intensity = 0.4;
    } else if (mode === 'night') {
      this.skyColor = 0x121b2d;
      this.scene.background.set(this.skyColor);
      this.scene.fog.color.set(this.skyColor);
      this.sunLight.color.set(0x89aee6);
      this.sunLight.intensity = 0.7;
      this.sunLight.position.set(-30, 60, -30);
      this.hemiLight.color.set(0x283b5e);
      this.hemiLight.groundColor.set(0x111e15);
      this.hemiLight.intensity = 0.45;
      this.fillLight.color.set(0x19273c);
      this.fillLight.intensity = 0.2;
    }
    this.sunDirection.copy(this.sunLight.position).sub(this.sunAnchor).normalize();
    this.invalidateShadowFrustum();
  }

  /** F4-05: tremor curto (0,15 s) se a explosão em `pos` está perto do alvo da câmera. Sem alocação. */
  shake(pos) {
    if (!SHAKE_ENABLED) return;
    const dx = pos.x - this.cameraTarget.x;
    const dz = pos.z - this.cameraTarget.z;
    if (dx * dx + dz * dz > SHAKE_MAX_DIST * SHAKE_MAX_DIST) return;
    this._shakeTime = SHAKE_DURATION;
  }

  updateCamera(delta) {
    // Smooth zoom interpolation
    this.zoomLevel = THREE.MathUtils.lerp(this.zoomLevel, this.targetZoomLevel, delta * 10);
    this.cameraAngle = THREE.MathUtils.lerp(this.cameraAngle, this.targetCameraAngle, delta * 8);

    const dist = 76 * this.zoomLevel;
    // Lower camera pitch (~35° instead of ~50°) for a more horizontal, heroic RTS perspective
    const height = (44 + (1.0 - this.zoomLevel) * 8) * this.zoomLevel;
    const horizDist = Math.sqrt(Math.max(10, dist * dist - height * height));

    const camX = this.cameraTarget.x + Math.cos(this.cameraAngle) * horizDist;
    const camZ = this.cameraTarget.z + Math.sin(this.cameraAngle) * horizDist;
    const camY = this.cameraTarget.y + height;

    this.camera.position.set(camX, camY, camZ);
    this.camera.lookAt(this.cameraTarget);

    if (this._shakeTime > 0) {
      this._shakeTime -= delta;
      const k = Math.max(0, this._shakeTime / SHAKE_DURATION) * SHAKE_AMPLITUDE;
      this.camera.position.x += (Math.random() - 0.5) * 2 * k;
      this.camera.position.y += (Math.random() - 0.5) * 2 * k;
    }

    this.updateShadowCamera();
  }

  /** Força recalcular o frustum da luz e redesenhar o shadow map no próximo frame. */
  invalidateShadowFrustum() {
    this._shadowKey = '';
  }

  /**
   * Ajusta o frustum ortográfico da luz à área visível (zoom + alvo da câmera).
   * Texels estáveis: o raio é quantizado (invariante à rotação da câmera) e o centro
   * é alinhado à grade de texels no espaço da luz, evitando shimmering ao mover a câmera.
   */
  updateShadowCamera() {
    const light = this.sunLight;
    if (!light || !this.sunDirection) return;
    const cam = this.camera;
    cam.updateMatrixWorld();

    // Pegada da visão no chão (y = 0), limitada a maxShadowDistance a partir do alvo
    const maxD = this.maxShadowDistance;
    const groundY = 0;
    let n = 0;
    _center.set(0, 0, 0);
    const pts = this._footprint || (this._footprint = _ndc.map(() => new THREE.Vector3()));
    for (let i = 0; i < _ndc.length; i++) {
      _ray.set(_ndc[i][0], _ndc[i][1], 0.5).unproject(cam).sub(cam.position).normalize();
      const p = pts[i];
      if (_ray.y < -1e-4) {
        const t = (groundY - cam.position.y) / _ray.y;
        p.copy(cam.position).addScaledVector(_ray, t);
      } else {
        p.copy(cam.position).addScaledVector(_ray, maxD * 2);
        p.y = groundY;
      }
      // limita a distância horizontal ao alvo
      _pt.set(p.x - this.cameraTarget.x, 0, p.z - this.cameraTarget.z);
      const len = _pt.length();
      if (len > maxD) p.set(this.cameraTarget.x + _pt.x / len * maxD, groundY, this.cameraTarget.z + _pt.z / len * maxD);
      _center.add(p);
      n++;
    }
    _center.divideScalar(n);

    // Raio do círculo que cobre a pegada + margem para sombras de objetos altos fora da tela
    let radius = 0;
    for (let i = 0; i < n; i++) radius = Math.max(radius, _center.distanceTo(pts[i]));
    radius = Math.min(radius + 8, maxD);
    radius = Math.ceil(radius / 4) * 4; // quantizado: só muda em degraus

    // Espaço da luz fixo (depende só da direção do sol)
    _lightBasis.lookAt(this.sunDirection, _origin, _up);
    _lightBasisInv.copy(_lightBasis).invert();
    const shadow = light.shadow;
    const texel = (2 * radius) / shadow.mapSize.x;
    _pt.copy(_center).applyMatrix4(_lightBasisInv);
    _pt.x = Math.round(_pt.x / texel) * texel;
    _pt.y = Math.round(_pt.y / texel) * texel;
    _pt.applyMatrix4(_lightBasis);

    const key = `${_pt.x.toFixed(3)}|${_pt.y.toFixed(3)}|${_pt.z.toFixed(3)}|${radius}|${shadow.mapSize.x}`;
    if (key === this._shadowKey) return;
    this._shadowKey = key;

    const lightDist = 120;
    light.target.position.copy(_pt);
    light.position.copy(_pt).addScaledVector(this.sunDirection, lightDist);
    light.target.updateMatrixWorld();
    light.updateMatrixWorld();

    const sc = shadow.camera;
    sc.left = -radius;
    sc.right = radius;
    sc.top = radius;
    sc.bottom = -radius;
    sc.near = 1;
    sc.far = lightDist + radius + 40;
    sc.updateProjectionMatrix();
    this._shadowFrustumChanged = true;
  }

  panCamera(moveRight, moveForward) {
    // Screen-aligned world vectors on the XZ ground plane
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();

    // Perpendicular right vector on XZ plane
    const right = new THREE.Vector3();
    right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

    // W = +forward (view up), S = -forward (view down)
    // D = +right (view right), A = -right (view left)
    this.cameraTarget.addScaledVector(right, moveRight);
    this.cameraTarget.addScaledVector(forward, moveForward);

    // Clamp camera within map bounds
    const cb = this.cameraBound ?? 55; // mapas grandes (campanha, 176–256) ajustam via `setCameraBoundsFromMap`
    this.cameraTarget.x = THREE.MathUtils.clamp(this.cameraTarget.x, -cb, cb);
    this.cameraTarget.z = THREE.MathUtils.clamp(this.cameraTarget.z, -cb, cb);
  }

  zoomCamera(deltaZoom) {
    this.targetZoomLevel = THREE.MathUtils.clamp(this.targetZoomLevel + deltaZoom, this.minZoom, this.maxZoom);
  }

  rotateCamera(deltaAngle) {
    this.targetCameraAngle += deltaAngle;
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(QualitySettings.dynamic.pixelRatio || QualitySettings.maxPixelRatio());
    this.invalidateShadowFrustum();
  }

  render() {
    // Resolução dinâmica (desligável pelo preset)
    const now = performance.now();
    this._lastDt = this._lastRenderTime ? Math.min(0.25, (now - this._lastRenderTime) / 1000) : 0;
    if (this._lastRenderTime) QualitySettings.tick((now - this._lastRenderTime) / 1000);
    this._lastRenderTime = now;

    // Sombra a cada N frames, ou imediatamente se o frustum da luz mudou
    const sm = this.renderer.shadowMap;
    if (sm.enabled && !sm.autoUpdate) {
      this._shadowFrame++;
      if (this._shadowFrustumChanged || this._shadowFrame >= this.shadowUpdateInterval) {
        sm.needsUpdate = true;
        this._shadowFrame = 0;
      }
    }
    this._shadowFrustumChanged = false;

    // F7-03: ciclo dia/noite (≈10 Hz; só visual)
    const dn = this.dayNight;
    if (dn.enabled) {
      const dt = this._lastDt || 0;
      dn.phase = advancePhase(dn.phase, dt, dn.period);
      dn._acc += dt;
      if (dn._acc >= 0.1) { dn._acc = 0; this._applyDayNight(false); }
    }

    if (this.postfx && this.postfx.active) this.postfx.render(this._lastDt || 0.016);
    else this.renderer.render(this.scene, this.camera);
  }
}
