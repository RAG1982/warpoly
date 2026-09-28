import * as THREE from 'three';

export class SceneManager {
  constructor(canvasContainer) {
    this.container = canvasContainer;
    
    // Scene
    this.scene = new THREE.Scene();
    this.skyColor = 0x85c8ec;
    this.scene.background = new THREE.Color(this.skyColor);
    this.scene.fog = new THREE.Fog(this.skyColor, 95, 320);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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

    // Lights
    this.setupLights();

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

    // Keep sunlight shadow centered around camera target for optimal shadow quality
    this.sunLight.target.position.copy(this.cameraTarget);
    this.sunLight.target.updateMatrixWorld();
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
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
