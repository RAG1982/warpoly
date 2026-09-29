import * as THREE from 'three';
import { Building } from '../../Building.js';
import { GLTFBuildingLoader } from '../../../core/GLTFBuildingLoader.js';
import { EVT } from '../../../sim/events.js';

function posOf(v) {
  return { x: v.x, y: v.y, z: v.z };
}

/**
 * GreatHall — Fortaleza e Centro Comunitário da Facção Orc (Tier 1)
 *
 * Arquitetura (Engine & Gameplay):
 * - Extende a classe base Building.
 * - Suporta carregamento de modelo glTF (great_hall_orc.glb) com fallback procedural AAA.
 * - VFX: Estandartes de guerra da Horda com ondulação dinâmica de vento via código senoidal.
 * - VFX: Chaminé do conselho expelindo baforadas contínuas de fumaça.
 * - VFX: Braseiro da entrada com PointLight animada e cintilação de calor.
 */
export class GreatHall extends Building {
  constructor(scene, terrain, x, z, isConstructed = true, faction = 'enemy') {
    super(scene, terrain, 'great_hall', x, z, isConstructed, faction);
  }

  initCustomVFX() {
    this.bannerOscillationTimer = Math.random() * Math.PI * 2;
    this.smokePuffTimer = 0;
    this.banners = [];

    // 1. Mapeia ou constrói os nós de estandartes animados
    this.mesh.traverse(child => {
      if (child.name && (child.name.includes('Banner') || child.name.includes('Anim_WarBanner'))) {
        this.banners.push(child);
      }
    });

    // Se nenhum estandarte com nome especial foi encontrado, localiza malhas de bandeira
    if (this.banners.length === 0) {
      const bannerLeft = this.createProceduralBanner(-2.2, 3.8, 3.2, 0.15);
      const bannerRight = this.createProceduralBanner(2.2, 3.8, 3.2, -0.15);
      this.mesh.add(bannerLeft);
      this.mesh.add(bannerRight);
      this.banners.push(bannerLeft, bannerRight);
    }

    // 2. Cria luz dinâmica do braseiro da entrada
    this.brazierLight = new THREE.PointLight(0xff6b2b, 1.8, 12, 1.4);
    this.brazierLight.position.set(2.4, 3.2, 3.6);
    this.brazierLight.castShadow = false; // Otimização para performance móvel/web
    this.mesh.add(this.brazierLight);

    // 3. Socket para fumaça da chaminé
    this.chimneySocket = new THREE.Vector3(-2.4, 9.8, -2.0);
  }

  createProceduralBanner(x, y, z, rotationY) {
    const bannerGroup = new THREE.Group();
    bannerGroup.name = 'Anim_WarBanner_Procedural';
    bannerGroup.position.set(x, y, z);
    bannerGroup.rotation.y = rotationY;

    // Mastro
    const poleGeo = new THREE.CylinderGeometry(0.06, 0.06, 3.2, 6);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x3d2314, roughness: 0.85, flatShading: true });
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.y = 1.6;
    bannerGroup.add(pole);

    // Tecido carmesim com corte denteado
    const bannerGeo = new THREE.PlaneGeometry(0.9, 1.8, 4, 6);
    const bannerMat = new THREE.MeshStandardMaterial({
      color: 0xc52828,
      roughness: 0.65,
      metalness: 0.05,
      side: THREE.DoubleSide
    });
    const cloth = new THREE.Mesh(bannerGeo, bannerMat);
    cloth.position.set(0.45, 1.8, 0.05);
    bannerGroup.add(cloth);

    bannerGroup.userData.clothMesh = cloth;
    bannerGroup.userData.initialRotZ = cloth.rotation.z;
    return bannerGroup;
  }

  updateCustomVFX(delta, gameManager) {
    this.bannerOscillationTimer += delta * 3.6;

    // 1. Animação procedural dos estandartes (onda senoidal simulando brisa)
    this.banners.forEach((banner, idx) => {
      const offset = idx * 1.4;
      const wave = Math.sin(this.bannerOscillationTimer + offset) * 0.12;
      const flap = Math.cos(this.bannerOscillationTimer * 1.8 + offset) * 0.06;

      if (banner.userData.clothMesh) {
        banner.userData.clothMesh.rotation.y = wave;
        banner.userData.clothMesh.rotation.z = flap;
      } else {
        banner.rotation.y = wave;
      }
    });

    // 2. Cintilação da luz do braseiro
    if (this.brazierLight) {
      const flicker = Math.sin(this.bannerOscillationTimer * 4.5) * 0.25 + Math.cos(this.bannerOscillationTimer * 9.2) * 0.15;
      this.brazierLight.intensity = Math.max(1.1, 1.8 + flicker);
    }

    // 3. Emissão de fumaça da chaminé
    const gmEvents = gameManager && gameManager.events;
    if (gmEvents) {
      this.smokePuffTimer += delta;
      if (this.smokePuffTimer >= 0.75) {
        this.smokePuffTimer = 0;
        const worldPos = this.mesh.position.clone().add(this.chimneySocket);
        gmEvents.emit(EVT.BUILDING_VFX, { buildingId: this.id, ownerId: this.ownerId, pos: posOf(worldPos), kind: 'chimney_smoke' });
      }
    }
  }

  cleanupCustomVFX() {
    if (this.brazierLight) {
      this.mesh.remove(this.brazierLight);
      this.brazierLight.dispose();
      this.brazierLight = null;
    }
  }
}
