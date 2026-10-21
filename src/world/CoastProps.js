import * as THREE from 'three';
import { glbEnabled, glbTemplates } from '../entities/glbModels.js';
import { getMapTileset } from '../data/tilesets.js';
import { getRegionMap } from '../data/biomeRegions.js';
import { buildLavaInfo } from '../data/lavaRender.js';
import { planCoastProps, COAST_KINDS, COAST_RULES } from '../data/decorPlan.js';
import { zoomHidesDecorations, lodEnabled } from '../render/lod.js';

/** Props pequenos escondidos pelo LOD de zoom (como as decorações pequenas, F1-10); caniço e barco ficam. */
const SMALL = ['shell', 'starfish'];

/**
 * M2-16 · props de costa e praia (conchas, estrelas-do-mar, caniço, barco naufragado) de mapas REGIONAIS (`biomeGrid`).
 * Um `InstancedMesh` por tipo = 4 draw calls no máximo (nenhum projeta sombra; todos a recebem), geometria e atlas dos `.glb`
 * lazy `coast_*` (carregados por `ensureGlbKeys(coastKeysOfMap(mapa))` antes da partida). As posições vêm de `planCoastProps`
 * (puro e determinístico). Só visual: nada aqui toca a sim. Sem regiões, sem `.glb` ou com `?glb=0`: não cria nada.
 */
export class CoastProps {
  constructor(scene, terrain) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'CoastProps';
    this.plan = null;
    this.meshes = {};
    this._lodHidden = null;
    const mapDef = terrain && terrain.mapDef;
    if (!glbEnabled || !mapDef || !mapDef.biomeGrid) return;
    const regions = getRegionMap(mapDef, getMapTileset(mapDef));
    if (!regions) return;
    this.plan = planCoastProps({
      regions,
      getHeight: (x, z) => terrain.getHeight(x, z),
      mapDef: { ...mapDef, size: mapDef.size || regions.size },
      lava: buildLavaInfo(mapDef),
      waterLevel: 0.5
    });
    const dummy = new THREE.Object3D();
    for (const kind of COAST_KINDS) {
      const items = this.plan[kind];
      const template = glbTemplates.get(COAST_RULES[kind].key);
      if (!template || !items.length) continue;
      template.updateMatrixWorld(true);
      let src = null;
      template.traverse((o) => { if (!src && o.isMesh) src = o; });
      if (!src) continue;
      const geo = src.geometry.clone().applyMatrix4(src.matrixWorld);
      const mesh = new THREE.InstancedMesh(geo, src.material, items.length);
      mesh.name = `Coast_${kind}`;
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        dummy.position.set(it.x, it.y, it.z);
        dummy.rotation.set(0, it.rotY, 0);
        dummy.scale.setScalar(it.scale);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      this.meshes[kind] = mesh;
      this.group.add(mesh);
    }
    if (this.group.children.length) scene.add(this.group);
  }

  /** Com o zoom bem afastado esconde conchas e estrelas (só `visible`; chamar 1×/quadro). */
  applyLod(zoomLevel) {
    const hide = lodEnabled() && zoomHidesDecorations(zoomLevel);
    if (hide === this._lodHidden) return;
    this._lodHidden = hide;
    for (const kind of SMALL) if (this.meshes[kind]) this.meshes[kind].visible = !hide;
  }
}
