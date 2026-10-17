/**
 * terrain-preview (F7-04): prévia dos 4 tilesets sobre qualquer mapa, com orbit, seletor e modo "comparar" (2×2).
 * `window.terrainPreview` expõe a API para capturas (`setTileset`, `setMap`, `setCompare`, `renderOnce`).
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Terrain } from './sim/Terrain.js';
import { TerrainView } from './render/TerrainView.js';
import { Water } from './world/Water.js';
import { Decorations } from './world/Decorations.js';
import { TreeManager } from './world/TreeManager.js';
import { listMaps, getMap, DEFAULT_MAP_ID } from './data/maps/index.js';
import { TILESETS, TILESET_IDS, resolveTilesetId } from './data/tilesets.js';
import { treeMixFor } from './data/treeSpecies.js';

const params = new URLSearchParams(location.search);
if (params.get('ui') === '0') document.body.classList.add('hide-ui');
const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.38;
renderer.setScissorTest(true);

const camera = new THREE.PerspectiveCamera(36, 1, 0.5, 900);
camera.position.set(52, 46, 52);
const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 0, 0);
controls.maxPolarAngle = Math.PI * 0.47;
controls.update();

/** Uma cena completa de um tileset sobre o mapa atual. */
class Stage {
  constructor(tilesetId, mapDef) {
    const def = TILESETS[tilesetId];
    this.def = def;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(def.atmosphere.sky);
    this.scene.fog = new THREE.Fog(def.atmosphere.sky, def.atmosphere.fogNear, def.atmosphere.fogFar);
    this.scene.add(new THREE.HemisphereLight(def.legacy ? 0xe8f4ff : def.atmosphere.hemiSky, def.atmosphere.hemiGround, def.legacy ? 1.2 : 1.05));
    const sun = new THREE.DirectionalLight(0xfffaee, 2.5);
    sun.position.set(-45, 75, -35);
    this.scene.add(sun);
    const terrain = new Terrain({ ...mapDef, tileset: tilesetId });
    // MUNDO-5: a prévia compara tilesets puros sobre o mesmo mapa: `regions: false` ignora o `biomeGrid` do mapa.
    this.terrainView = new TerrainView(this.scene, terrain, { tileset: tilesetId, regions: false });
    this.water = new Water(this.scene, terrain, { tileset: tilesetId, regions: false });
    this.decorations = new Decorations(this.scene, terrain, { tileset: tilesetId, regions: false });
    this.trees = new TreeManager(this.scene, { tileset: tilesetId });
    this.populateForests(terrain, mapDef);
  }

  populateForests(terrain, mapDef) {
    let s = 12345;
    const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (const f of mapDef.forests || []) {
      for (let i = 0; i < Math.min(f.count || 6, 14); i++) {
        const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * (f.radius || 6);
        const x = f.x + Math.cos(a) * r, z = f.z + Math.sin(a) * r;
        const y = terrain.getHeight(x, z);
        if (y < 1.6) continue;
        const type = rnd() < 0.65 ? (f.species || 'pine') : treeMixFor(f.species)[Math.floor(rnd() * 3)];
        if (this.trees.countOf(type) >= 118) continue;
        this.trees.registerTree({}, x, y, z, rnd() * 6.28, 0.9 + rnd() * 0.4, type);
      }
    }
  }

  dispose() {
    this.trees.dispose();
    this.scene.traverse((o) => { if (o.geometry && o.geometry.dispose) o.geometry.dispose(); });
  }
}

const state = {
  mapId: getMap(params.get('map')) ? params.get('map') : DEFAULT_MAP_ID,
  tileset: resolveTilesetId(params.get('tileset') || 'verdejante'),
  compare: params.get('compare') === '1',
  stages: []
};

const elTilesets = document.getElementById('tilesets');
const elMap = document.getElementById('map');
const elCompare = document.getElementById('compare');
const elTags = document.getElementById('tags');

function rebuild() {
  state.stages.forEach((s) => s.dispose());
  const mapDef = getMap(state.mapId);
  const ids = state.compare ? TILESET_IDS : [state.tileset];
  state.stages = ids.map((id) => new Stage(id, mapDef));
  const half = mapDef.size / 2;
  controls.target.set(0, 1, 0);
  camera.position.set(half * 0.8, half * 0.72, half * 0.8);
  controls.update();
  elTilesets.querySelectorAll('button').forEach((b) => b.classList.toggle('on', !state.compare && b.dataset.id === state.tileset));
  elCompare.classList.toggle('on', state.compare);
  elTags.innerHTML = '';
  state.stages.forEach((s) => {
    const t = document.createElement('div');
    t.className = 'tag';
    t.textContent = s.def.name;
    elTags.appendChild(t);
  });
  layoutTags();
}

function viewports() {
  const w = innerWidth, h = innerHeight;
  if (state.stages.length === 1) return [[0, 0, w, h]];
  return [[0, h / 2, w / 2, h / 2], [w / 2, h / 2, w / 2, h / 2], [0, 0, w / 2, h / 2], [w / 2, 0, w / 2, h / 2]];
}
function layoutTags() {
  if (state.stages.length === 1) { elTags.innerHTML = ''; return; }
  const vps = viewports();
  [...elTags.children].forEach((t, i) => {
    const [x, y, , vh] = vps[i];
    t.style.left = `${x + 12}px`;
    t.style.top = `${innerHeight - (y + vh) + 12}px`;
  });
}

function renderOnce(time = performance.now() / 1000) {
  renderer.setSize(innerWidth, innerHeight, false);
  const vps = viewports();
  state.stages.forEach((st, i) => {
    const [x, y, w, h] = vps[i];
    renderer.setViewport(x, y, w, h);
    renderer.setScissor(x, y, w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    st.water.update(time);
    renderer.render(st.scene, camera);
  });
}

TILESET_IDS.forEach((id) => {
  const b = document.createElement('button');
  b.textContent = TILESETS[id].name;
  b.dataset.id = id;
  b.onclick = () => { state.compare = false; state.tileset = id; rebuild(); };
  elTilesets.appendChild(b);
});
listMaps().forEach((m) => {
  const o = document.createElement('option');
  o.value = m.id;
  o.textContent = m.name || m.id;
  elMap.appendChild(o);
});
elMap.value = state.mapId;
elMap.onchange = () => { state.mapId = elMap.value; rebuild(); };
elCompare.onclick = () => { state.compare = !state.compare; rebuild(); };
addEventListener('resize', layoutTags);

window.terrainPreview = {
  state, renderer, camera, controls,
  setTileset(id) { state.compare = false; state.tileset = resolveTilesetId(id); rebuild(); },
  setMap(id) { state.mapId = id; elMap.value = id; rebuild(); },
  setCompare(on) { state.compare = !!on; rebuild(); },
  renderOnce
};

rebuild();
(function loop() {
  controls.update();
  renderOnce();
  requestAnimationFrame(loop);
})();
