import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { enableShadows } from '../models/materials.js';

/**
 * Modelos .glb gerados pelo pipeline Blender (tools/blender/, tarefa F7-00).
 * No jogo são usados por padrão (desde F7-00c); use ?glb=0 para desligar (ver ModelFactory).
 * O inspetor sempre os carrega para comparar com os procedurais.
 * key -> { url, root: nome do nó raiz no .glb, type: tipo de unidade (ou null) }
 */
const BASE = (import.meta.env && import.meta.env.BASE_URL) || '/';
export const GLB_MODELS = {
  grunt: { url: `${BASE}models/grunt.glb`, root: 'Grunt', type: 'grunt' },
  knight: { url: `${BASE}models/knight.glb`, root: 'Knight', type: 'knight' },
  archer: { url: `${BASE}models/archer.glb`, root: 'Archer', type: 'archer' },
  axethrower: { url: `${BASE}models/axethrower.glb`, root: 'Axethrower', type: 'axethrower' },
  villager: { url: `${BASE}models/villager.glb`, root: 'Villager', type: 'villager' },
  peon: { url: `${BASE}models/peon.glb`, root: 'Peon', type: 'peon' },
  ogre: { url: `${BASE}models/ogre.glb`, root: 'Ogre', type: 'ogre' },
  bandit: { url: `${BASE}models/bandit.glb`, root: 'Bandit', type: 'bandit' },
  castle: { url: `${BASE}models/castle.glb`, root: 'Castle', type: null },
  cavalier: { url: `${BASE}models/cavalier.glb`, root: 'Cavalier', type: 'cavalier' },
  stable: { url: `${BASE}models/stable.glb`, root: 'Stable', type: null },
  ogre_den: { url: `${BASE}models/ogre_den.glb`, root: 'OgreDen', type: null },
  // NEW-36: cerco e oficinas (Blender)
  ballista: { url: `${BASE}models/ballista.glb`, root: 'Ballista', type: 'ballista' },
  catapult: { url: `${BASE}models/catapult.glb`, root: 'Catapult', type: 'catapult' },
  workshop: { url: `${BASE}models/workshop.glb`, root: 'Workshop', type: null },
  orc_workshop: { url: `${BASE}models/orc_workshop.glb`, root: 'OrcWorkshop', type: null },
  // NEW-39: conjuradores, esqueleto, sapadores e construções arcanas (Blender)
  mage: { url: `${BASE}models/mage.glb`, root: 'Mage', type: 'mage' },
  necromancer: { url: `${BASE}models/necromancer.glb`, root: 'Necromancer', type: 'necromancer' },
  skeleton: { url: `${BASE}models/skeleton.glb`, root: 'Skeleton', type: 'skeleton' },
  sapper: { url: `${BASE}models/sapper.glb`, root: 'Sapper', type: 'sapper' },
  arsonist: { url: `${BASE}models/arsonist.glb`, root: 'Arsonist', type: 'arsonist' },
  arcane_tower: { url: `${BASE}models/arcane_tower.glb`, root: 'ArcaneTower', type: null },
  ash_sanctum: { url: `${BASE}models/ash_sanctum.glb`, root: 'AshSanctum', type: null },
  // NEW-40: Templo da Luz, Altar das Tempestades, Olho Vigia, Templário e Ogro Feiticeiro (Blender)
  temple: { url: `${BASE}models/temple.glb`, root: 'Temple', type: null },
  storm_altar: { url: `${BASE}models/storm_altar.glb`, root: 'StormAltar', type: null },
  watching_eye: { url: `${BASE}models/watching_eye.glb`, root: 'WatchingEye', type: 'watching_eye' },
  templar: { url: `${BASE}models/templar.glb`, root: 'Templar', type: 'cavalier' },
  ogre_mage: { url: `${BASE}models/ogre_mage.glb`, root: 'OgreMage', type: 'ogre' },
  // F7-00b lote 1 (grupo 1)
  glider: { url: `${BASE}models/glider.glb`, root: 'Glider', type: 'glider' },
  war_balloon: { url: `${BASE}models/war_balloon.glb`, root: 'WarBalloon', type: 'war_balloon' },
  gryphon_rider: { url: `${BASE}models/gryphon_rider.glb`, root: 'GryphonRider', type: 'gryphon_rider' },
  war_serpent: { url: `${BASE}models/war_serpent.glb`, root: 'WarSerpent', type: 'war_serpent' },
  aviary: { url: `${BASE}models/aviary.glb`, root: 'Aviary', type: null },
  serpent_nest: { url: `${BASE}models/serpent_nest.glb`, root: 'SerpentNest', type: null },
  // F7-00b lote 1 (grupo 2)
  barracks: { url: `${BASE}models/barracks.glb`, root: 'Barracks', type: null },
  forge: { url: `${BASE}models/forge.glb`, root: 'Forge', type: null },
  cottage: { url: `${BASE}models/cottage.glb`, root: 'Cottage', type: null },
  farm: { url: `${BASE}models/farm.glb`, root: 'Farm', type: null },
  lumber_camp: { url: `${BASE}models/lumber_camp.glb`, root: 'LumberCamp', type: null },
  watchtower: { url: `${BASE}models/watchtower.glb`, root: 'Watchtower', type: null },
  // F7-00b lote 1 (grupo 3)
  great_hall: { url: `${BASE}models/great_hall.glb`, root: 'GreatHall', type: null },
  orc_barracks: { url: `${BASE}models/orc_barracks.glb`, root: 'OrcBarracks', type: null },
  orc_forge: { url: `${BASE}models/orc_forge.glb`, root: 'OrcForge', type: null },
  orc_house: { url: `${BASE}models/orc_house.glb`, root: 'OrcHouse', type: null },
  pig_farm: { url: `${BASE}models/pig_farm.glb`, root: 'PigFarm', type: null },
  orc_lumber_mill: { url: `${BASE}models/orc_lumber_mill.glb`, root: 'OrcLumberMill', type: null },
  orc_watchtower: { url: `${BASE}models/orc_watchtower.glb`, root: 'OrcWatchtower', type: null },
  // F7-00b lote 2 (grupo 2): jazidas neutras e acampamento bandido
  gold_mine: { url: `${BASE}models/gold_mine.glb`, root: 'GoldMine', type: null },
  stone_quarry: { url: `${BASE}models/stone_quarry.glb`, root: 'StoneQuarry', type: null },
  bandit_camp: { url: `${BASE}models/bandit_camp.glb`, root: 'BanditCamp', type: null }
};

export const glbEnabled = (() => {
  try {
    if (typeof window === 'undefined') return true;
    const param = new URLSearchParams(window.location.search).get('glb');
    // ?glb=0 desliga; ?glb=1 ativa (redundante, pois já está ativo por padrão)
    return param !== '0';
  } catch (e) {
    return true;
  }
})();

export const glbTemplates = new Map();
let loadPromise = null;

/**
 * Carrega (uma vez) todos os .glb de GLB_MODELS. Falhas individuais só geram
 * aviso: o modelo procedural continua sendo o fallback.
 */
export function loadGlbTemplates() {
  if (loadPromise) return loadPromise;
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const jobs = Object.entries(GLB_MODELS).map(([key, def]) =>
    loader.loadAsync(def.url).then(gltf => {
      const root = gltf.scene.getObjectByName(def.root) || gltf.scene;
      if (root.parent) root.parent.remove(root);
      root.position.set(0, 0, 0);
      enableShadows(root);
      glbTemplates.set(key, root);
    }).catch(err => {
      console.warn(`[glbModels] .glb indisponível (${def.url}), usando modelo procedural`, err);
    })
  );
  loadPromise = Promise.all(jobs).then(() => glbTemplates);
  return loadPromise;
}

/**
 * Garante que os .glb foram carregados, memoizando a promessa.
 * Chamada na preload (quando habilitada) e em caminhos com ?skipPreload.
 * Falhas são registradas (console.warn) mas não impedem continuação com modelos procedurais.
 */
export function ensureGlbLoaded() {
  return loadGlbTemplates();
}

// Materiais de time já tintados, compartilhados por (material de origem, cor): N unidades/construções do
// mesmo jogador usam o mesmo material (sem 1 clone por instância).
const teamMatCache = new Map();

/**
 * Cor de time (F7-02): troca o material `TeamColor` de cada malha da instância por uma variante tintada
 * com a cor do dono (a textura do atlas continua compartilhada). Vale para unidades e construções .glb;
 * modelos procedurais não têm `TeamColor` e passam intactos. Idempotente.
 */
export function setTeamColor(obj, color) {
  if (!obj || !color) return obj;
  const key = new THREE.Color(color).getHexString();
  obj.traverse(child => {
    if (!child.isMesh || !child.material || child.material.name !== 'TeamColor') return;
    const src = child.userData.teamSrcMaterial || child.userData.origMaterial || child.material;
    let byColor = teamMatCache.get(src);
    if (!byColor) { byColor = new Map(); teamMatCache.set(src, byColor); }
    let m = byColor.get(key);
    if (!m) {
      m = src.clone();
      m.name = 'TeamColor';
      m.color.set(color);
      byColor.set(key, m);
    }
    child.userData.teamSrcMaterial = src;
    child.material = m;
    if (child.userData.origMaterial) child.userData.origMaterial = m;
  });
  return obj;
}

// Download começa já na importação (o AssetPreloader aguarda a promessa).
// Com ?glb=0 pode ser desligado; caso contrário ativa por padrão.
if (glbEnabled) loadGlbTemplates();
