import * as THREE from 'three';
import { QualitySettings } from './QualitySettings.js';

// Temporários da shadow camera dinâmica (evita alocação por frame)
const _ndc = [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 0]];
const _ray = new THREE.Vector3();
const _pt = new THREE.Vector3();
const _center = new THREE.Vector3();
const _lightBasis = new THREE.Matrix4();
const _lightBasisInv = new THREE.Matrix4();
const _origin = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

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

    // Presets de qualidade (DPR, sombras, tone mapping, resolução dinâmica)
    QualitySettings.apply(this.renderer, this);

    // Time of day preset
    this.timeOfDay = 'day'; // 'day', 'sunset', 'night'

    // Resize event
    window.addEventListener('resize', () => this.onResize());
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
    this.cameraTarget.x = THREE.MathUtils.clamp(this.cameraTarget.x, -55, 55);
    this.cameraTarget.z = THREE.MathUtils.clamp(this.cameraTarget.z, -55, 55);
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

    this.renderer.render(this.scene, this.camera);
  }
}
