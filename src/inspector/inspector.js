import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Import all game models
import {
  createKnight,
  createArcher,
  createVillager,
  createBandit,
  createCastle,
  createLumberCamp,
  createGoldMine,
  createStoneQuarry,
  createCottage,
  createBarracks,
  createWatchtower,
  createFarm,
  createBanditCamp,
  createTree,
  createFlowerPatch,
  createPebbles,
  createGrassTuft,
  createBerryBush,
  createBoulder,
  createMushroomStump,
  createWaterLily,
  createArrow
} from '../models/index.js';

import { UnitAnimator, ANIMATION_DURATIONS } from './unitAnimator.js';

/**
 * Model Catalog Definitions
 */
const MODEL_CATALOG = [
  // --- UNIDADES ---
  {
    id: 'knight',
    name: 'Cavaleiro (Knight)',
    category: 'units',
    type: 'knight',
    icon: '🛡️',
    sourceFile: 'src/models/units/KnightModel.js',
    create: createKnight,
    description: 'Infantaria de choque com armadura de placas completa, penacho carmesim icônico, espada de aço forjado e escudo pontiagudo com brasão real dourado.',
    notes: 'Articulação modular completa (cabeça, torso, braços, pernas, ombreiras, escudo e espada). Escudo e espada vinculados aos braços com rotações independentes.'
  },
  {
    id: 'archer',
    name: 'Arqueiro (Archer)',
    category: 'units',
    type: 'archer',
    icon: '🏹',
    sourceFile: 'src/models/units/ArcherModel.js',
    create: createArcher,
    description: 'Atirador de elite ágil trajando túnica verde floresta, capuz cônico emplumado, aljava dorsal com flechas e arco recurvo de madeira nobre.',
    notes: 'Arco e corda modelados com CatmullRomCurve3. A aljava e flechas no dorso acompanham a inclinação lateral do torso durante a puxada da corda.'
  },
  {
    id: 'villager',
    name: 'Aldeão (Villager)',
    category: 'units',
    type: 'villager',
    icon: '🌾',
    sourceFile: 'src/models/units/VillagerModel.js',
    create: createVillager,
    description: 'A espinha dorsal da economia do reino em estilo estilizado AAA (inspirado em Warcraft 2 / Overwatch). Trabalhador multifuncional com túnica de lã ocre, avental de couro de artesão com fivelas de latão e costuras reforçadas, calças remendadas, ferramentas intercambiáveis (machado de lenhador com fio polido, picareta de mineração e marreta de construtor) e mochila de carga modular (feixe de toras com anéis de crescimento ou saco de juta com pepitas de ouro reluzentes).',
    notes: 'Texturas procedurais hand-painted em 2048x2048 com mapas de albedo, roughness, metalness e bump gerados via Canvas. Rigging completo compatível com todas as animações de coleta, marcha e ataque tanto no inspector quanto no jogo.'
  },
  {
    id: 'bandit',
    name: 'Bandido (Bandit Raider)',
    category: 'units',
    type: 'bandit',
    icon: '🪓',
    sourceFile: 'src/models/units/BanditModel.js',
    create: createBandit,
    description: 'Saqueador bárbaro temível com pintura de guerra carmesim, olhos furiosos luminescentes, elmo spangenhelm com chifres curvados de osso ancestral, brigandina tachada com fivela de crânio, ombreira de ferro espinhosa e clava com runas de sangue.',
    notes: 'Texturas PBR procedurais pintadas à mão (Warcraft 2 / Overwatch / Valorant). Rigging completo de membros, elmo, chifres e arma com suporte a todas as animações (Idle, Walk, Attack Slam, Death).'
  },

  // --- CONSTRUÇÕES ---
  {
    id: 'castle',
    name: 'Castelo Real (Castle Keep)',
    category: 'buildings',
    type: 'building',
    icon: '🏰',
    sourceFile: 'src/models/buildings/CastleModel.js',
    create: createCastle,
    description: 'A colossal fortaleza central do reino. Possui muralhas de cantaria pesada, 4 torres de vigia com telhados cônicos azuis, torreão principal com coroa ameada e portal reforçado.',
    notes: 'Construção modular com múltiplos níveis de platô. Geometrias com flat-shading criam facetas nítidas com sombras suaves, transmitindo solidez medieval.'
  },
  {
    id: 'lumber_camp',
    name: 'Serraria (Lumber Camp)',
    category: 'buildings',
    type: 'building',
    icon: '🪵',
    sourceFile: 'src/models/buildings/LumberCampModel.js',
    create: createLumberCamp,
    description: 'Serraria medieval estilizada AAA com plataforma de madeira elevada, abrigo de vigas e telhas de cedro, esteira mecânica com serra circular gigante cortando tora mestre, pilhas de toras com casca e anéis de corte, tábuas plainadas em cura, toco de corte com machado fincado e lanterna reluzente.',
    notes: 'Texturas PBR procedurais pintadas à mão em 2048x2048 (casca de carvalho, anéis de cerne/alburno, madeira de pinho chanfrada com pregos forjados, lâmina de aço polida e pilhas de serragem dourada). Escala otimizada para o grid de jogo com radius 3.2.'
  },
  {
    id: 'gold_mine',
    name: 'Mina de Ouro (Gold Mine)',
    category: 'buildings',
    type: 'building',
    icon: '🪙',
    sourceFile: 'src/models/buildings/GoldMineModel.js',
    create: createGoldMine,
    description: 'Complexo subterrâneo de mineração com escarpas de granito escuro, veios e agulhas de ouro reluzentes (metalness 0.94), portal fortificado de carvalho, trilhos de trem com dormentes, vagonete transbordando de pepitas, lanterna de ferro com luz âmbar e caixotes de minério.',
    notes: 'Texturas procedurais PBR 2048x2048 com veios dourados embutidos nas fendas da rocha, lanterna suspensa com PointLight atmosférico suave e vagonete com rodas de ferro fundido sobre trilhos de aço.'
  },
  {
    id: 'stone_quarry',
    name: 'Pedreira (Stone Quarry)',
    category: 'buildings',
    type: 'building',
    icon: '🪨',
    sourceFile: 'src/models/buildings/StoneQuarryModel.js',
    create: createStoneQuarry,
    description: 'Escavação ativa em múltiplos patamares rochosos de calcário e granito, derrick crane de madeira maciça com carga suspensa em linga, paletes de blocos aparelhados, escadas de acesso e ferramentas de cantaria.',
    notes: 'Texturas PBR procedurais em 2048x2048 (estratos sedimentares com marcas de cinzel, blocos ashlar com marcas de guilda de cantaria, vigas de carvalho com roldanas de ferro forjado e cordas trançadas).'
  },
  {
    id: 'cottage',
    name: 'Casa Colonial (Cottage)',
    category: 'buildings',
    type: 'building',
    icon: '🏠',
    sourceFile: 'src/models/buildings/CottageModel.js',
    create: createCottage,
    description: 'Residência medieval com reboco amarelo rústico, vigas e escoras de madeira escura no estilo enxaimel e telhado azul pontiagudo.',
    notes: 'Detalhe de chaminé de tijolos de pedra e porta arqueada de carvalho maciço com maçaneta forjada.'
  },
  {
    id: 'barracks',
    name: 'Quartel Militar (Barracks)',
    category: 'buildings',
    type: 'building',
    icon: '⚔️',
    sourceFile: 'src/models/buildings/BarracksModel.js',
    create: createBarracks,
    description: 'Guarnição militar fortificada de padrão AAA estilizado (inspirada em Warcraft 2, Valorant e Overwatch). Estrutura multisseção com salão principal em alvenaria e enxaimel, ala de armaria, plataforma de defesa superior com ameias e escadas, portas de ferro com brasão de espadas cruzadas, boneco de treino de palha com estopa e alvo, suportes com alabardas de aço e escudo do leão real, braseiros de ferro com brasas incandescentes e estandartes esvoaçantes.',
    notes: 'Dotado de texturas PBR procedurais em canvas 2048x2048 (albedo, rugosidade, metalicidade e bump). Proporções balanceadas para o grid do jogo (8.8x7.6).'
  },
  {
    id: 'watchtower',
    name: 'Torre de Vigia (Watchtower)',
    category: 'buildings',
    type: 'building',
    icon: '🗼',
    sourceFile: 'src/models/buildings/WatchtowerModel.js',
    create: createWatchtower,
    description: 'Posto de defesa e vigia medieval fortificado (estilo AAA estilizado / Warcraft 2). Apresenta fundação de cantaria com contrafortes a 45°, frestas de tiro chanfradas, superestrutura de vigamento em carvalho com mãos-francesas em balanço, cesto de observação com parapeito ameado e escudos heráldicos reais, telhado cônico de telhas azuis sobrepostas com friso dourado e pináculo, braseiro de ferro forjado com brasas incandescentes e galhardete ondulante no topo.',
    notes: 'Proporções arquitetônicas ideais para visão RTS isométrica (pegada 4x4, altura ~9.8). Plataforma dos arqueiros alinhada na altura y=6.8 para disparo perfeito de flechas. Texturas PBR procedurais em alta resolução (pedra com musgo e intempéries, vigamento com placas de reforço, telhas escamadas reais e brasas emissivas).'
  },
  {
    id: 'farm',
    name: 'Fazenda de Trigo (Farm)',
    category: 'buildings',
    type: 'building',
    icon: '🌾',
    sourceFile: 'src/models/buildings/FarmModel.js',
    create: createFarm,
    description: 'Fazenda medieval estilizada AAA completa: canteiro arado com espigas de trigo dourado, celeiro rústico com telhado de palha escalonada, puxadinho de ferramentas com lenha e roda, poço de pedra com manivela e balde, cerca de cedro com portão, fardos de feno e sacos de grãos.',
    notes: 'Texturas PBR procedurais pintadas à mão em 2048x2048 (albedo, rugosidade, metalicidade, relevo) com iluminação estilizada inspirada em Warcraft 2, Overwatch e Valorant.'
  },
  {
    id: 'bandit_camp',
    name: 'Acampamento Bandido (Bandit Camp)',
    category: 'buildings',
    type: 'building',
    icon: '⛺',
    sourceFile: 'src/models/buildings/BanditCampModel.js',
    create: createBanditCamp,
    description: 'Acampamento inimigo fortificado com paliçada circular de troncos pontiagudos, fogueira de acampamento central e tenda de couro carmesim do chefe saqueador.',
    notes: 'Silhueta agressiva com estacas inclinadas e caveiras totêmicas para distinguir imediatamente território hostil.'
  },

  // --- AMBIENTE & ITENS ---
  {
    id: 'oak_tree',
    name: 'Carvalho Frondoso (Oak Tree)',
    category: 'environment',
    type: 'nature',
    icon: '🌳',
    sourceFile: 'src/models/environment/TreeModel.js',
    create: () => createTree('oak'),
    description: 'Carvalho nobre AAA estilizado com tronco gotejado de musgo, 5 raízes tabulares ancoradas ao solo, bifurcações de galhos orgânicos, copas volumosas em dodecaedros facetados e cipós pendentes.',
    notes: 'Texturas PBR procedurais pintadas à mão (2048x2048): casca com fissuras profundas, anéis de crescimento em nós de galhos podados, musgo esmeralda e folhagem com luz de contorno dourada.'
  },
  {
    id: 'pine_tree',
    name: 'Pinheiro Alpino (Pine Tree)',
    category: 'environment',
    type: 'nature',
    icon: '🌲',
    sourceFile: 'src/models/environment/TreeModel.js',
    create: () => createTree('pine'),
    description: 'Conífera alpina imponente com tronco afunilado e casca escamosa avermelhada, 5 saias cônicas sobrepostas com bainhas serrilhadas facetadas e pinhas 3D suspensas.',
    notes: 'Texturas PBR com placas escamosas de pinheiro, gotas de resina âmbar translúcidas e feixes de agulhas com pontas orvalhadas/iluminadas pelo sol.'
  },
  {
    id: 'autumn_tree',
    name: 'Carvalho de Outono (Autumn Oak)',
    category: 'environment',
    type: 'nature',
    icon: '🍁',
    sourceFile: 'src/models/environment/TreeModel.js',
    create: () => createTree('autumn'),
    description: 'Variante outonal deslumbrante do carvalho ancestral com folhagem vibrante em tons de âmbar, cobre, rubi e ouro, cipós dourados e montinhos de folhas caídas ao pé das raízes.',
    notes: 'Iluminação estilizada de folhagem inspirada na arte conceitual de Warcraft 2, Valorant e Overwatch com oclusão ambiente nas fendas.'
  },
  {
    id: 'birch_tree',
    name: 'Bétula Prateada (Birch Tree)',
    category: 'environment',
    type: 'nature',
    icon: '🌿',
    sourceFile: 'src/models/environment/TreeModel.js',
    create: () => createTree('birch'),
    description: 'Bétula esguia e graciosa com curva suave no tronco, casca branco-giz com lenticelas escuras horizontais, manchas de líquen e copas esparsas em verde-lima/dourado.',
    notes: 'Elegância botânica nórdica estilizada com ramificações finas, tiras de casca descascando e pingentes de folhas que dançam ao vento.'
  },
  {
    id: 'flower_patch',
    name: 'Canteiro de Flores (Flower Patch)',
    category: 'environment',
    type: 'nature',
    icon: '🌸',
    sourceFile: 'src/models/environment/DecorationModels.js',
    create: () => createFlowerPatch('mixed'),
    description: 'Canteiro botânico de alta fidelidade estilizada com rosetas basais de folhas, hastes curvadas, pétalas em degradê procedural e botões de pólen dourado com brilho radiante.',
    notes: 'Texturas procedurais hand-painted 2048x2048 (albedo, rugosidade e relevo) com variações cromáticas para rosas, margaridas, girassóis e campânulas.'
  },
  {
    id: 'pebbles',
    name: 'Seixos Polidos de Rio (River Pebbles)',
    category: 'environment',
    type: 'nature',
    icon: '🪨',
    sourceFile: 'src/models/environment/DecorationModels.js',
    create: () => createPebbles(6),
    description: 'Agrupamento orgânico de seixos fluviais arredondados e polidos pela água, exibindo estrias de quartzo branco, pontilhado mineral e acabamento especular suave.',
    notes: 'Modelagem elipsoidal com rotação natural e mapa de relevo/rugosidade simulando pedras lavadas em leito de riacho límpido.'
  },
  {
    id: 'boulder',
    name: 'Grande Rochedo de Granito (Granite Boulder)',
    category: 'environment',
    type: 'nature',
    icon: '⛰️',
    sourceFile: 'src/models/environment/DecorationModels.js',
    create: () => createBoulder('large'),
    description: 'Imponente rochedo montanhoso facetado com clivagens geológicas marcadas, faixas sedimentares em camadas, capa de musgo verde aveludado e lascas de tálus na base.',
    notes: 'Inspirado no estilo hand-painted de Warcraft 2, Valorant e Overwatch, com facetas chanfradas nítidas e textura PBR rica em microporos e veios minerais.'
  },
  {
    id: 'berry_bush',
    name: 'Arbusto de Frutas Silvestres (Berry Bush)',
    category: 'environment',
    type: 'nature',
    icon: '🫐',
    sourceFile: 'src/models/environment/DecorationModels.js',
    create: () => createBerryBush('red'),
    description: 'Arbusto exuberante de folhagem densa estilizada com troncos lenhosos retorcidos e múltiplos cachos de bagas lustrosas vermelhas com reflexo especular vívido.',
    notes: 'Volumes foliares facetados com mapas PBR de nervuras e bagas com cálice botânico e realce luminoso suculento.'
  },
  {
    id: 'grass_tuft',
    name: 'Tufo de Grama Estilizada (Grass Tuft)',
    category: 'environment',
    type: 'nature',
    icon: '🌱',
    sourceFile: 'src/models/environment/DecorationModels.js',
    create: createGrassTuft,
    description: 'Tufo botânico elegante composto por múltiplas lâminas curvadas que arqueiam sob a gravidade, degradê vertical de verde-húmus a verde-lima ensolarado e trevo basal.',
    notes: 'Geometria customizada de fita afilada em 3 estágios com nervura central e renderização double-sided com baixa contagem poligonal e alto apelo visual.'
  },
  {
    id: 'mushroom_stump',
    name: 'Tronco com Cogumelos Mágicos (Mushroom Stump)',
    category: 'environment',
    type: 'nature',
    icon: '🍄',
    sourceFile: 'src/models/environment/DecorationModels.js',
    create: createMushroomStump,
    description: 'Tronco de carvalho centenário intemperizado com anéis de crescimento e fendas radiais no topo, cogumelos-de-fada (Amanita muscaria) vermelhos de bolinhas brancas, cantarelos e fungos-orelha.',
    notes: 'Riqueza ambiental com casca vertical sulcada, raízes retorcidas expostas, lamelas sanfonadas sob o chapéu e anéis de esporos nos caules.'
  },
  {
    id: 'water_lily',
    name: 'Vitória-Régia & Flor de Lótus (Water Lily & Lotus)',
    category: 'environment',
    type: 'nature',
    icon: '🪷',
    sourceFile: 'src/models/environment/DecorationModels.js',
    create: createWaterLily,
    description: 'Vitória-régia aquática esmeralda flutuante com entalhe angular em V e nervuras palmadas, acompanhada por broto menor e flor de lótus de pétalas rosa-alva com estame dourado.',
    notes: 'Textura hidrofóbica com gotas translúcidas de orvalho repousando na folha, anel de ondulação aquática e 3 camadas concêntricas de pétalas esculpidas.'
  },
  {
    id: 'arrow',
    name: 'Flecha Balística (Arrow)',
    category: 'environment',
    type: 'prop',
    icon: '🎯',
    sourceFile: 'src/models/environment/ArrowModel.js',
    create: createArrow,
    description: 'Projétil balístico disparado pelos arqueiros. Haste delgada de madeira, ponta afiada de aço escuro e 4 penas brancas de estabilização.',
    notes: 'Projetada para trajetórias parabólicas balísticas com inclinação de rotação na direção do vetor de velocidade.'
  }
];

/**
 * Lighting Presets Configurations
 */
const LIGHT_PRESETS = {
  studio: {
    name: 'Estúdio',
    bg: 0x14161f,
    ambientColor: 0x333644,
    ambientIntensity: 0.8,
    keyColor: 0xfff6ec,
    keyIntensity: 2.2,
    keyPos: [5, 8, 6],
    fillColor: 0xb5d2ee,
    fillIntensity: 1.1,
    fillPos: [-6, 4, -4],
    rimColor: 0xffd375,
    rimIntensity: 1.8,
    rimPos: [0, 7, -7]
  },
  day: {
    name: 'Dia Ensolarado',
    bg: 0x76aed9,
    ambientColor: 0x85c8ec,
    ambientIntensity: 0.9,
    keyColor: 0xfffbe8,
    keyIntensity: 2.6,
    keyPos: [8, 12, 5],
    fillColor: 0xa8d5ff,
    fillIntensity: 0.7,
    fillPos: [-8, 6, -5],
    rimColor: 0xffecb3,
    rimIntensity: 0.9,
    rimPos: [3, 6, -7]
  },
  sunset: {
    name: 'Pôr do Sol',
    bg: 0x2b1c2b,
    ambientColor: 0x42263d,
    ambientIntensity: 0.85,
    keyColor: 0xff7b38,
    keyIntensity: 2.8,
    keyPos: [10, 4, 3],
    fillColor: 0xc084fc,
    fillIntensity: 1.0,
    fillPos: [-7, 5, -4],
    rimColor: 0xf43f5e,
    rimIntensity: 1.9,
    rimPos: [-4, 6, -7]
  },
  night: {
    name: 'Noite de Luar',
    bg: 0x0a0e17,
    ambientColor: 0x121b2d,
    ambientIntensity: 0.5,
    keyColor: 0x7dd3fc,
    keyIntensity: 1.6,
    keyPos: [-6, 9, 5],
    fillColor: 0x818cf8,
    fillIntensity: 0.8,
    fillPos: [6, 4, -4],
    rimColor: 0xc084fc,
    rimIntensity: 1.2,
    rimPos: [0, 7, -6]
  }
};

/**
 * Main Inspector Application Class
 */
class ModelInspectorApp {
  constructor() {
    this.container = document.getElementById('viewport-container');
    this.canvas = document.getElementById('canvas3d');

    // State
    this.currentModelItem = null;
    this.currentModelObject = null;
    this.animator = null;
    this.activeCategory = 'all';
    this.searchQuery = '';
    this.currentLighting = 'studio';

    // Viewport Options
    this.autoRotate = false;
    this.autoRotateSpeed = 1.5;
    this.wireframeActive = false;
    this.pedestalActive = true;
    this.wireframeMeshes = [];

    // Villager Options
    this.villagerTool = 'axe';
    this.villagerCargo = 'none';

    // Clock
    this.clock = new THREE.Clock();

    this.initThree();
    this.initPedestal();
    this.initLighting();
    this.buildCatalogUI();
    this.bindDOMEvents();

    // Load initial model (supports ?model=archer&anim=fight)
    const urlParams = new URLSearchParams(window.location.search);
    const initialModel = urlParams.get('model') || 'knight';
    const initialAnim = urlParams.get('anim') || 'idle';
    const initialLight = urlParams.get('light');
    if (initialLight && LIGHT_PRESETS[initialLight]) {
      this.applyLightingPreset(initialLight);
    }
    this.selectModel(initialModel);
    if (this.animator && initialAnim !== 'idle') {
      this.setUnitAnimation(initialAnim);
    }
    const timeParam = urlParams.get('time');
    if (this.animator && timeParam !== null) {
      this.animator.pause();
      this.animator.setTime(parseFloat(timeParam));
    }

    // Start loop
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  initThree() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(LIGHT_PRESETS.studio.bg);

    // Camera
    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 200);
    this.camera.position.set(4.5, 3.2, 5.5);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;

    // Controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.maxPolarAngle = Math.PI / 2 + 0.05; // allow slight under-view
    this.controls.minDistance = 0.8;
    this.controls.maxDistance = 50;
    this.controls.target.set(0, 1.2, 0);
    this.controls.update();

    // Resize listener
    window.addEventListener('resize', () => this.onWindowResize());
  }

  initPedestal() {
    this.pedestalGroup = new THREE.Group();
    this.pedestalGroup.name = 'PedestalGroup';

    // Low-poly stone circular pedestal
    const pedGeo = new THREE.CylinderGeometry(3.6, 4.0, 0.35, 24);
    const pedMat = new THREE.MeshStandardMaterial({
      color: 0x222430,
      roughness: 0.9,
      flatShading: true
    });
    this.pedestalMesh = new THREE.Mesh(pedGeo, pedMat);
    this.pedestalMesh.position.y = -0.175;
    this.pedestalMesh.receiveShadow = true;
    this.pedestalGroup.add(this.pedestalMesh);

    // Gold trim bevel ring
    const trimGeo = new THREE.TorusGeometry(3.65, 0.04, 6, 32);
    trimGeo.rotateX(Math.PI / 2);
    const trimMat = new THREE.MeshStandardMaterial({
      color: 0xd4af37,
      roughness: 0.35,
      metalness: 0.8
    });
    this.pedestalTrim = new THREE.Mesh(trimGeo, trimMat);
    this.pedestalTrim.position.y = 0.01;
    this.pedestalGroup.add(this.pedestalTrim);

    // Subtle grid helper on the pedestal
    this.gridHelper = new THREE.GridHelper(7.2, 12, 0xd4af37, 0x3b3f54);
    this.gridHelper.position.y = 0.015;
    this.pedestalGroup.add(this.gridHelper);

    this.scene.add(this.pedestalGroup);
  }

  initLighting() {
    this.lightsGroup = new THREE.Group();
    this.lightsGroup.name = 'LightsGroup';

    // Ambient
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
    this.lightsGroup.add(this.ambientLight);

    // Hemisphere Light (Sky & Ground bounce for stylized UE5 reflections)
    this.hemiLight = new THREE.HemisphereLight(0xfff8ed, 0x334155, 0.75);
    this.lightsGroup.add(this.hemiLight);

    // Key Light (Sun / Studio Key)
    this.keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
    this.keyLight.castShadow = true;
    this.keyLight.shadow.mapSize.width = 2048;
    this.keyLight.shadow.mapSize.height = 2048;
    this.keyLight.shadow.camera.near = 0.5;
    this.keyLight.shadow.camera.far = 40;
    this.keyLight.shadow.camera.left = -8;
    this.keyLight.shadow.camera.right = 8;
    this.keyLight.shadow.camera.top = 8;
    this.keyLight.shadow.camera.bottom = -8;
    this.keyLight.shadow.bias = -0.0005;
    this.lightsGroup.add(this.keyLight);

    // Fill Light
    this.fillLight = new THREE.DirectionalLight(0xffffff, 1.2);
    this.lightsGroup.add(this.fillLight);

    // Rim Light
    this.rimLight = new THREE.DirectionalLight(0xffffff, 1.8);
    this.lightsGroup.add(this.rimLight);

    this.scene.add(this.lightsGroup);
    this.applyLightingPreset(this.currentLighting);
  }

  applyLightingPreset(presetKey) {
    const config = LIGHT_PRESETS[presetKey];
    if (!config) return;

    this.currentLighting = presetKey;
    this.scene.background.setHex(config.bg);

    this.ambientLight.color.setHex(config.ambientColor);
    this.ambientLight.intensity = config.ambientIntensity;

    if (this.hemiLight) {
      this.hemiLight.color.setHex(config.keyColor);
      this.hemiLight.groundColor.setHex(config.ambientColor);
      this.hemiLight.intensity = config.ambientIntensity * 0.85;
    }

    this.keyLight.color.setHex(config.keyColor);
    this.keyLight.intensity = config.keyIntensity;
    this.keyLight.position.set(...config.keyPos);

    this.fillLight.color.setHex(config.fillColor);
    this.fillLight.intensity = config.fillIntensity;
    this.fillLight.position.set(...config.fillPos);

    this.rimLight.color.setHex(config.rimColor);
    this.rimLight.intensity = config.rimIntensity;
    this.rimLight.position.set(...config.rimPos);

    // Update active button state
    document.querySelectorAll('.preset-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.preset === presetKey);
    });
  }

  buildCatalogUI() {
    const container = document.getElementById('model-list-container');
    container.innerHTML = '';

    const query = this.searchQuery.toLowerCase().trim();
    const filtered = MODEL_CATALOG.filter(item => {
      const matchCat = (this.activeCategory === 'all' || item.category === this.activeCategory);
      const matchQuery = !query || item.name.toLowerCase().includes(query) || item.description.toLowerCase().includes(query);
      return matchCat && matchQuery;
    });

    if (filtered.length === 0) {
      container.innerHTML = `
        <div style="padding: 24px; text-align: center; color: var(--text-muted); font-size: 13px;">
          Nenhum modelo encontrado para "${this.searchQuery}".
        </div>
      `;
      return;
    }

    filtered.forEach(item => {
      const btn = document.createElement('div');
      btn.className = `model-card-btn ${this.currentModelItem && this.currentModelItem.id === item.id ? 'active' : ''}`;
      btn.dataset.modelId = item.id;
      btn.innerHTML = `
        <div class="model-card-icon">${item.icon}</div>
        <div class="model-card-info">
          <div class="model-card-name">${item.name}</div>
          <div class="model-card-sub">${item.sourceFile.split('/').pop()}</div>
        </div>
      `;

      btn.addEventListener('click', () => this.selectModel(item.id));
      container.appendChild(btn);
    });
  }

  selectModel(modelId) {
    const item = MODEL_CATALOG.find(m => m.id === modelId);
    if (!item) return;

    this.currentModelItem = item;

    // Remove old model
    if (this.currentModelObject) {
      this.clearWireframeOverlays();
      this.scene.remove(this.currentModelObject);
      this.currentModelObject = null;
    }

    // Instantiate new model
    const model = item.create();
    this.currentModelObject = model;
    this.scene.add(model);

    // Update pedestal size depending on model size
    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    box.getSize(size);
    const center = new THREE.Vector3();
    box.getCenter(center);
    const maxDim = Math.max(size.x, size.z);

    const pedRadius = Math.max(2.8, (maxDim * 0.8) + 0.6);
    this.pedestalMesh.scale.set(pedRadius / 3.6, 1, pedRadius / 3.6);
    this.pedestalTrim.scale.set(pedRadius / 3.6, 1, pedRadius / 3.6);
    this.gridHelper.scale.set(pedRadius / 3.6, 1, pedRadius / 3.6);

    // Frame camera smoothly to look at model
    this.frameCameraOn(box);

    // Update active highlight in list
    document.querySelectorAll('.model-card-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.modelId === item.id);
    });

    // Update header badge
    const badge = document.getElementById('current-model-badge');
    if (badge) {
      badge.innerHTML = `<span>${item.icon}</span> <span>${item.name}</span>`;
    }

    // Configure animation vs static model
    const animSection = document.getElementById('anim-section');
    const villagerOpts = document.getElementById('villager-options');

    if (item.category === 'units') {
      animSection.style.display = 'block';
      this.animator = new UnitAnimator(model, item.type);

      // Handle Villager extra controls
      if (item.id === 'villager') {
        villagerOpts.style.display = 'flex';
        this.animator.setVillagerTool(this.villagerTool);
        this.animator.setVillagerCargo(this.villagerCargo);
      } else {
        villagerOpts.style.display = 'none';
      }

      // Default to Idle state
      this.setUnitAnimation('idle');
    } else {
      animSection.style.display = 'none';
      this.animator = null;
    }

    // Reapply wireframe if toggled
    if (this.wireframeActive) {
      this.applyWireframeOverlay(true);
    }

    // Update Model Stats & Details Card
    this.updateModelStatsUI(item, model, box, size);
  }

  frameCameraOn(box) {
    const center = new THREE.Vector3();
    box.getCenter(center);
    const size = new THREE.Vector3();
    box.getSize(size);

    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = this.camera.fov * (Math.PI / 180);
    let cameraDistance = Math.abs(maxDim / 2 / Math.tan(fov / 2)) * 1.5;
    cameraDistance = Math.max(cameraDistance, 3.2);

    const urlParams = new URLSearchParams(window.location.search);
    const cam = urlParams.get('cam');

    this.controls.target.set(center.x, Math.max(0.5, center.y), center.z);
    if (cam === 'back') {
      this.camera.position.set(
        center.x,
        center.y + cameraDistance * 0.25,
        center.z - cameraDistance * 1.15
      );
    } else if (cam === 'side') {
      this.camera.position.set(
        center.x - cameraDistance * 1.15,
        center.y + cameraDistance * 0.25,
        center.z
      );
    } else {
      this.camera.position.set(
        center.x + cameraDistance * 0.45,
        center.y + cameraDistance * 0.35,
        center.z + cameraDistance * 1.05
      );
    }
    this.controls.update();
  }

  updateModelStatsUI(item, model, box, size) {
    let meshCount = 0;
    let vertexCount = 0;
    let triangleCount = 0;
    const materialsSet = new Set();

    model.traverse(child => {
      if (child.isMesh && child.geometry) {
        meshCount++;
        const geo = child.geometry;
        if (geo.attributes && geo.attributes.position) {
          vertexCount += geo.attributes.position.count;
        }
        if (geo.index) {
          triangleCount += geo.index.count / 3;
        } else if (geo.attributes && geo.attributes.position) {
          triangleCount += geo.attributes.position.count / 3;
        }
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach(m => materialsSet.add(m.uuid || m));
          } else {
            materialsSet.add(child.material.uuid || child.material);
          }
        }
      }
    });

    document.getElementById('stat-triangles').textContent = Math.round(triangleCount).toLocaleString();
    document.getElementById('stat-vertices').textContent = vertexCount.toLocaleString();
    document.getElementById('stat-components').textContent = meshCount;
    document.getElementById('stat-materials').textContent = materialsSet.size;
    document.getElementById('stat-dimensions').textContent = `${size.x.toFixed(2)}m × ${size.y.toFixed(2)}m × ${size.z.toFixed(2)}m`;

    document.getElementById('source-file-path').textContent = item.sourceFile;
    document.getElementById('source-file-path').title = item.sourceFile;

    document.getElementById('model-description').textContent = item.description;
    document.getElementById('model-notes').innerHTML = `<strong>Notas de Modelagem & Rigging:</strong> ${item.notes}`;
  }

  setUnitAnimation(animName) {
    if (!this.animator) return;
    this.animator.setAnimation(animName, true);

    // Update active button state
    document.querySelectorAll('.anim-state-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.anim === animName);
    });

    // Update timeline display
    this.updateTimelineUI();
  }

  applyWireframeOverlay(enabled) {
    this.clearWireframeOverlays();
    this.wireframeActive = enabled;

    if (!enabled || !this.currentModelObject) return;

    const wireMat = new THREE.LineBasicMaterial({
      color: 0xffd54f,
      transparent: true,
      opacity: 0.45,
      depthTest: true
    });

    this.currentModelObject.traverse(child => {
      if (child.isMesh && child.geometry) {
        const wireGeo = new THREE.WireframeGeometry(child.geometry);
        const line = new THREE.LineSegments(wireGeo, wireMat);
        line.name = '__wireframe_overlay__';
        child.add(line);
        this.wireframeMeshes.push(line);
      }
    });
  }

  clearWireframeOverlays() {
    this.wireframeMeshes.forEach(line => {
      if (line.parent) {
        line.parent.remove(line);
      }
      if (line.geometry) line.geometry.dispose();
    });
    this.wireframeMeshes = [];
  }

  bindDOMEvents() {
    // 1. Search Bar
    const searchInput = document.getElementById('search-models');
    if (searchInput) {
      searchInput.addEventListener('input', e => {
        this.searchQuery = e.target.value;
        this.buildCatalogUI();
      });
    }

    // 2. Category Filter Tabs
    document.querySelectorAll('.cat-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.cat-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this.activeCategory = tab.dataset.category;
        this.buildCatalogUI();
      });
    });

    // 3. Viewport Floating Toolbar
    // Reset Camera
    document.getElementById('btn-reset-cam').addEventListener('click', () => {
      if (this.currentModelObject) {
        const box = new THREE.Box3().setFromObject(this.currentModelObject);
        this.frameCameraOn(box);
      }
    });

    // Auto-Rotate Turntable Toggle
    const autoRotateBtn = document.getElementById('btn-auto-rotate');
    autoRotateBtn.addEventListener('click', () => {
      this.autoRotate = !this.autoRotate;
      autoRotateBtn.classList.toggle('active', this.autoRotate);
    });

    // Pedestal & Grid Toggle
    const pedestalBtn = document.getElementById('btn-toggle-pedestal');
    pedestalBtn.addEventListener('click', () => {
      this.pedestalActive = !this.pedestalActive;
      this.pedestalGroup.visible = this.pedestalActive;
      pedestalBtn.classList.toggle('active', this.pedestalActive);
    });

    // Wireframe Toggle
    const wireframeBtn = document.getElementById('btn-toggle-wireframe');
    wireframeBtn.addEventListener('click', () => {
      const active = !this.wireframeActive;
      wireframeBtn.classList.toggle('active', active);
      this.applyWireframeOverlay(active);
    });

    // Lighting Presets
    document.querySelectorAll('.preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.applyLightingPreset(btn.dataset.preset);
      });
    });

    // 4. Unit Animation Panel
    // Action State Buttons
    document.querySelectorAll('.anim-state-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.setUnitAnimation(btn.dataset.anim);
      });
    });

    // Play / Pause Toggle
    const playPauseBtn = document.getElementById('btn-play-pause');
    playPauseBtn.addEventListener('click', () => {
      if (!this.animator) return;
      const isPlaying = this.animator.togglePlay();
      playPauseBtn.innerHTML = isPlaying ? '⏸️' : '▶️';
    });

    // Replay / Renascer Button
    const replayBtn = document.getElementById('btn-anim-replay');
    replayBtn.addEventListener('click', () => {
      if (!this.animator) return;
      this.animator.play();
      this.animator.setTime(0);
      playPauseBtn.innerHTML = '⏸️';
    });

    // Timeline Scrubber Slider
    const timelineSlider = document.getElementById('timeline-slider');
    timelineSlider.addEventListener('input', e => {
      if (!this.animator) return;
      this.animator.pause();
      playPauseBtn.innerHTML = '▶️';
      const pct = parseFloat(e.target.value) / 100;
      const t = pct * this.animator.getDuration();
      this.animator.setTime(t);
      this.updateTimelineUI();
    });

    // Step Forward / Back Buttons
    document.getElementById('btn-step-back').addEventListener('click', () => {
      if (!this.animator) return;
      this.animator.pause();
      playPauseBtn.innerHTML = '▶️';
      this.animator.step(-0.04);
      this.updateTimelineUI();
    });

    document.getElementById('btn-step-forward').addEventListener('click', () => {
      if (!this.animator) return;
      this.animator.pause();
      playPauseBtn.innerHTML = '▶️';
      this.animator.step(0.04);
      this.updateTimelineUI();
    });

    // Speed Selector Buttons
    document.querySelectorAll('.speed-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        document.querySelectorAll('.speed-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        const spd = parseFloat(pill.dataset.speed);
        if (this.animator) {
          this.animator.setSpeed(spd);
        }
      });
    });

    // Villager Tool Toggle
    document.querySelectorAll('.v-tool-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.v-tool-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.villagerTool = btn.dataset.tool;
        if (this.animator) {
          this.animator.setVillagerTool(this.villagerTool);
        }
      });
    });

    // Villager Cargo Toggle
    document.querySelectorAll('.v-cargo-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.v-cargo-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.villagerCargo = btn.dataset.cargo;
        if (this.animator) {
          this.animator.setVillagerCargo(this.villagerCargo);
        }
      });
    });

    // Copy File Path Button
    document.getElementById('btn-copy-path').addEventListener('click', () => {
      if (!this.currentModelItem) return;
      navigator.clipboard.writeText(this.currentModelItem.sourceFile);
      this.showToast('📋 Caminho do arquivo copiado!');
    });

    // Fullscreen Toggle
    const fsBtn = document.getElementById('btn-fullscreen');
    if (fsBtn) {
      fsBtn.addEventListener('click', () => {
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen();
          fsBtn.textContent = '⤓ Normal';
        } else {
          document.exitFullscreen();
          fsBtn.textContent = '⤢ Tela Cheia';
        }
      });
    }
  }

  updateTimelineUI() {
    if (!this.animator) return;
    const dur = this.animator.getDuration();
    const cur = this.animator.time;
    const pct = Math.min(100, Math.max(0, (cur / dur) * 100));

    const slider = document.getElementById('timeline-slider');
    if (slider) slider.value = pct;

    const timeLabel = document.getElementById('timeline-time');
    if (timeLabel) timeLabel.textContent = `${cur.toFixed(2)}s / ${dur.toFixed(2)}s`;
  }

  showToast(message) {
    const toast = document.getElementById('toast-msg');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      toast.classList.remove('show');
    }, 2200);
  }

  onWindowResize() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(width, height);
  }

  animate() {
    requestAnimationFrame(this.animate);

    const dt = this.clock.getDelta();

    // Turntable Auto-rotation
    if (this.autoRotate && this.currentModelObject) {
      this.currentModelObject.rotation.y += dt * this.autoRotateSpeed;
    }

    // Unit Animator update
    if (this.animator) {
      this.animator.update(dt);
      this.updateTimelineUI();
    }

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}

// Bootstrap application on DOM load
window.addEventListener('DOMContentLoaded', () => {
  window.inspectorApp = new ModelInspectorApp();
});
