import { setTeamColor } from '../render/teamColor.js';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { enableShadows } from '../models/materials.js';
import { UNITS } from '../data/units.js';
import { BUILDINGS } from '../data/buildings.js';

/**
 * Modelos .glb gerados pelo pipeline Blender (tools/blender/, tarefa F7-00).
 * No jogo são usados por padrão (desde F7-00c); use ?glb=0 para desligar (ver ModelFactory).
 * O inspetor sempre os carrega para comparar com os procedurais.
 * key -> { url, root: nome do nó raiz no .glb, type: tipo de unidade (ou null) }
 */
const BASE = (import.meta.env && import.meta.env.BASE_URL) || '/';
export const GLB_MODELS = {
  grunt: { url: `${BASE}models/grunt.glb`, root: 'Grunt', type: 'grunt' },
  // Drogath Punho-de-Brasa (hero_drogath, M2-22): modelo do Tripo finalizado (Weapon = machado filho de ArmR, faixas e manto em TeamColor)
  hero_drogath: { url: `${BASE}models/hero_drogath.glb`, root: 'Grunt', type: 'grunt' },
  // Skarn, chefe-de-brasa (hero_skarn, M2-24): modelo do Tripo finalizado (Weapon = martelo de guerra gigante, filho de ArmR; faixas de couro em TeamColor)
  hero_skarn: { url: `${BASE}models/hero_skarn.glb`, root: 'Ogre', type: 'ogre' },
  knight: { url: `${BASE}models/knight.glb`, root: 'Knight', type: 'knight' },
  // Capitão Brann (hero_brann): modelo do Tripo finalizado (commit 4df356b; martelo = Sword, capa = Cape, sem escudo)
  hero_brann: { url: `${BASE}models/hero_brann.glb`, root: 'Knight', type: 'knight' },
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
  // Mestre Arcano Oren (hero_oren, M2-21): modelo do Tripo finalizado (Weapon = cajado filho de ArmR, Crystal pulsa no 'cast', pano em TeamColor)
  hero_oren: { url: `${BASE}models/hero_oren.glb`, root: 'Mage', type: 'mage' },
  necromancer: { url: `${BASE}models/necromancer.glb`, root: 'Necromancer', type: 'necromancer' },
  // Vozgul, a Profetisa (hero_vozgul, M2-23): modelo do Tripo finalizado (Weapon = cajado filho de ArmR, Crystal = chama verde emissiva (`Flame`) que pulsa no 'cast', fitas e faixas em TeamColor)
  hero_vozgul: { url: `${BASE}models/hero_vozgul.glb`, root: 'Necromancer', type: 'necromancer' },
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
  bandit_camp: { url: `${BASE}models/bandit_camp.glb`, root: 'BanditCamp', type: null },
  // F7-00b lote 2 (grupo 3): árvores instanciadas
  tree_oak: { url: `${BASE}models/tree_oak.glb`, root: 'TreeOak', type: null },
  tree_pine: { url: `${BASE}models/tree_pine.glb`, root: 'TreePine', type: null },
  tree_autumn: { url: `${BASE}models/tree_autumn.glb`, root: 'TreeAutumn', type: null },
  // F7-00b (agente B): bétula (4º tipo de árvore instanciada; `species: 'birch'` nos mapas)
  tree_birch: { url: `${BASE}models/tree_birch.glb`, root: 'TreeBirch', type: null },
  // ART-01/02/03/04 (MUNDO-TERRENO-MAPAS §6): props de bioma, árvores novas, vegetação seca e javali.
  // `lazy: true`: fora do boot e do preload; carregam só com `loadGlbTemplates(…, { includeLazy: true })` (inspetor e, depois, mapas de bioma).
  rock_granite_large: { url: `${BASE}models/rock_granite_large.glb`, root: 'RockGraniteLarge', type: null, lazy: true },
  rock_granite_medium: { url: `${BASE}models/rock_granite_medium.glb`, root: 'RockGraniteMedium', type: null, lazy: true },
  rock_granite_small: { url: `${BASE}models/rock_granite_small.glb`, root: 'RockGraniteSmall', type: null, lazy: true },
  cactus_1: { url: `${BASE}models/cactus_1.glb`, root: 'Cactus1', type: null, lazy: true },
  cactus_2: { url: `${BASE}models/cactus_2.glb`, root: 'Cactus2', type: null, lazy: true },
  bones: { url: `${BASE}models/bones.glb`, root: 'Bones', type: null, lazy: true },
  tree_broad: { url: `${BASE}models/tree_broad.glb`, root: 'TreeBroad', type: null, lazy: true },
  tree_palm: { url: `${BASE}models/tree_palm.glb`, root: 'TreePalm', type: null, lazy: true },
  tree_acacia: { url: `${BASE}models/tree_acacia.glb`, root: 'TreeAcacia', type: null, lazy: true },
  grass_dry: { url: `${BASE}models/grass_dry.glb`, root: 'GrassDry', type: null, lazy: true },
  tumbleweed: { url: `${BASE}models/tumbleweed.glb`, root: 'Tumbleweed', type: null, lazy: true },
  critter_boar: { url: `${BASE}models/critter_boar.glb`, root: 'CritterBoar', type: null, lazy: true },
  // F7-00b lote 2 (grupo 3): blocos de muralha instanciados (`WallBatch`)
  wall_human: { url: `${BASE}models/wall_human.glb`, root: 'WallHuman', type: null },
  wall_orc: { url: `${BASE}models/wall_orc.glb`, root: 'WallOrc', type: null },
  // ART-naval-buildings: construções navais humanas (Blender)
  shipyard: { url: `${BASE}models/shipyard.glb`, root: 'Shipyard', type: null },
  oil_platform: { url: `${BASE}models/oil_platform.glb`, root: 'OilPlatform', type: null },
  ship_dock: { url: `${BASE}models/ship_dock.glb`, root: 'ShipDock', type: null },
  orc_oil_platform: { url: `${BASE}models/orc_oil_platform.glb`, root: 'OrcOilPlatform', type: null },
  // ART-naval-ships: navios humanos (Blender)
  frigate: { url: `${BASE}models/frigate.glb`, root: 'Frigate', type: 'frigate' },
  barge: { url: `${BASE}models/barge.glb`, root: 'Barge', type: 'barge' },
  dreadnought: { url: `${BASE}models/dreadnought.glb`, root: 'Dreadnought', type: 'dreadnought' },
  tanker: { url: `${BASE}models/tanker.glb`, root: 'Tanker', type: 'tanker' },
  // ART-naval-ships: navios orcs (Blender)
  orc_frigate: { url: `${BASE}models/orc_frigate.glb`, root: 'OrcFrigate', type: 'frigate' },
  orc_barge: { url: `${BASE}models/orc_barge.glb`, root: 'OrcBarge', type: 'barge' },
  orc_dreadnought: { url: `${BASE}models/orc_dreadnought.glb`, root: 'OrcDreadnought', type: 'dreadnought' },
  orc_tanker: { url: `${BASE}models/orc_tanker.glb`, root: 'OrcTanker', type: 'tanker' },
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

/**
 * F10-05b: facção dona de cada .glb ('human' | 'orc' | 'neutral'), derivada de `faction` em src/data (unidade ou
 * construção com a mesma chave); chaves fora das tabelas (árvores, jazidas...) são 'neutral' = sempre carregadas.
 */
const FACTION_OVERRIDES = { orc_oil_platform: 'orc', orc_frigate: 'orc', orc_barge: 'orc', orc_dreadnought: 'orc', orc_tanker: 'orc' };
export function glbFaction(key) {
  if (FACTION_OVERRIDES[key]) return FACTION_OVERRIDES[key];
  const f = (UNITS[key] && UNITS[key].faction) || (BUILDINGS[key] && BUILDINGS[key].faction) || 'neutral';
  return f === 'human' || f === 'orc' ? f : 'neutral';
}

const jobs = new Map(); // chave do GLB_MODELS → Promise (cada .glb é baixado uma única vez)
let loader = null;

function loadOne(key) {
  if (jobs.has(key)) return jobs.get(key);
  const def = GLB_MODELS[key];
  loader ||= new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const job = loader.loadAsync(def.url).then(gltf => {
    const root = gltf.scene.getObjectByName(def.root) || gltf.scene;
    if (root.parent) root.parent.remove(root);
    root.position.set(0, 0, 0);
    enableShadows(root);
    glbTemplates.set(key, root);
  }).catch(err => {
    console.warn(`[glbModels] .glb indisponível (${def.url}), usando modelo procedural`, err);
  });
  jobs.set(key, job);
  return job;
}

/**
 * Carrega os .glb de GLB_MODELS (cada um uma única vez, mesmo em chamadas repetidas). Sem argumento carrega TODOS
 * (inspetor, pré-carga completa). Com `factions` (ex.: `['human']`) carrega só essas facções + os neutros; chamadas
 * posteriores completam o que faltar. Falhas individuais só geram aviso: o modelo procedural continua sendo o fallback.
 * @param {string[]|null} [factions]
 */
export function loadGlbTemplates(factions = null, { includeLazy = false } = {}) {
  const wanted = factions && new Set([...factions, 'neutral']);
  const pending = Object.keys(GLB_MODELS)
    .filter(key => includeLazy || !GLB_MODELS[key].lazy)
    .filter(key => !wanted || wanted.has(glbFaction(key)))
    .map(loadOne);
  return Promise.all(pending).then(() => glbTemplates);
}

/**
 * M2-10: carrega só as chaves pedidas (uma vez cada), inclusive as `lazy` (ex.: `tree_palm` quando o mapa tem palmeiras). Chaves
 * desconhecidas são ignoradas; falha individual só gera aviso (o TreeManager cai na árvore reserva). Com `?glb=0` não faz nada.
 * @param {string[]} keys
 */
export function ensureGlbKeys(keys) {
  if (!glbEnabled) return Promise.resolve(glbTemplates);
  return Promise.all((keys || []).filter(k => GLB_MODELS[k]).map(loadOne)).then(() => glbTemplates);
}

/**
 * Garante que os .glb foram carregados, memoizando a promessa.
 * Chamada na preload (quando habilitada) e em caminhos com ?skipPreload.
 * Falhas são registradas (console.warn) mas não impedem continuação com modelos procedurais.
 */
export function ensureGlbLoaded(factions = null, options = {}) {
  return loadGlbTemplates(factions, options);
}

// Cor de time (F7-02): implementação em render/teamColor.js (máscara = materiais `TeamColor`, cache por cor).
export { setTeamColor };

// Download começa já na importação (o AssetPreloader aguarda a promessa).
// Com ?glb=0 pode ser desligado; caso contrário ativa por padrão.
if (glbEnabled) loadGlbTemplates();
