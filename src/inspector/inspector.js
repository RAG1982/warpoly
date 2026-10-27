import * as THREE from 'three';
import { VfxSystem } from '../render/vfx/VfxSystem.js';
import { initMusicPanel } from './musicPanel.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Import all game models
import {
  createStable,
  createOgreDen,
  createBallista,
  createCatapult,
  createSapper,
  createMage,
  createNecromancer,
  createSkeleton,
  createArcaneTower,
  createAshSanctum,
  createTemple,
  createStormAltar,
  createWatchingEye,
  createGlider,
  createWarBalloon,
  createGryphonRider,
  createWarSerpent,
  createAviary,
  createSerpentNest,
  createArsonist,
  createWorkshop,
  createOrcWorkshop,
  createBanditCamp,
  createFlowerPatch,
  createPebbles,
  createGrassTuft,
  createBerryBush,
  createBoulder,
  createMushroomStump,
  createWaterLily,
  createArrow
} from '../models/index.js';

import { UnitAnimator, ANIMATION_DURATIONS } from '../animation/UnitAnimator.js';
import {
  GreatHall,
  OrcBarracks,
  PigFarm,
  OrcHouse,
  OrcWatchtower,
  OrcLumberMill,
  OrcForge
} from '../render/buildings/orc/index.js';
import { HumanForge } from '../render/buildings/HumanForge.js';
import { Building } from '../sim/Building.js';
import { ParticleSystem } from '../entities/ParticleSystem.js';
import { prepareStaticTemplate, isStaticMergeEnabled } from '../render/staticTemplates.js';
import { mergeUnitTemplate } from '../render/mergeUnitTemplate.js';
import { skinUnitTemplate, isSkinEnabled } from '../render/skinUnitTemplate.js';
import { ModelFactory } from '../entities/ModelFactory.js';
import { CritterAnimator } from '../render/critterAnimator.js';
import { ensureGlbLoaded } from '../entities/glbModels.js';
import { setTeamColor, hasTeamMask, TEAM_PALETTE } from '../render/teamColor.js';

// F2-08c: construção de simulação (pura) + a view correspondente, sem cena (o inspetor adiciona `view.mesh`).
const flatTerrain = { getHeight: () => 0 };
const bldView = (ViewClass, type) => new ViewClass(new Building(flatTerrain, type, 0, 0, true, 'player'), null);

// Modelos do pipeline Blender (F7-00): sempre carregados no inspetor para comparação
const glbPlaceholder = () => new THREE.Group();
const createGlb = key => () => ModelFactory.createGlbModel(key) || glbPlaceholder();

/**
 * Model Catalog Definitions
 */
const MODEL_CATALOG = [
  // --- UNIDADES ---
  {
    id: 'knight_glb',
    name: 'Espadachim (Blender)',
    category: 'units',
    faction: 'human',
    type: 'knight',
    icon: '🗡️',
    glb: 'knight',
    sourceFile: 'tools/blender/build_knight.py',
    create: createGlb('knight'),
    description: 'Versão gerada pelo pipeline Blender headless (public/models/knight.glb) a partir da referência soldado.png: armadura de placas de aço com frisos dourados, elmo aberto, capa e mangas azuis em cor de time, espada longa. 7 partes rígidas (Torso, Head, ArmL, ArmR, LegL, LegR, Sword), atlas 512².',
    notes: 'Rig plana (a do antigo KnightModel.js, removido na F7-00b; o UnitAnimator anima Sword/braços com rotações independentes). Sem escudo (a referência não tem). 10 draw calls, ~4,2 mil triângulos, 213 KB. Rosto só na face frontal (+Z).'
  },
  {
    id: 'knight_v2_glb',
    name: 'Espadachim v2 (Tripo)',
    category: 'units',
    faction: 'human',
    type: 'knight',
    icon: '🛡️',
    glb: 'knight_v2',
    sourceFile: 'tools/blender/build_knight_v2.py',
    create: createGlb('knight_v2'),
    description: 'Espadachim humano v2: infantaria do Tripo finalizada no Blender (public/models/knight_v2.glb). Armadura de placas cinza e dourada, elmo com crista, tabardo azul, espada curta na mão direita e escudo azul com leão na esquerda. Tabardo, crista e mangas em TeamColor; o escudo mantém o azul heráldico. Nós Knight, Torso, Head, ArmL, ArmR, LegL, LegR, Sword e ShieldGroup.',
    notes: 'Tipo knight: Sword é FILHA de ArmR e ShieldGroup FILHO de ArmL (acompanham o balanço do braço; o animador escreve a rotação de repouso x 0,5 / z −0,1 na espada e y −0,3 no escudo). Braços reposados pelo rig (A-pose, espada à frente, escudo no antebraço). 14 draw calls, ~21,4 mil triângulos, atlas 512². É o padrão do jogo; o Espadachim (Blender) antigo continua como fallback. O leão do escudo/tabardo está registrado para a auditoria de IP (M6-02).'
  },
  {
    id: 'hero_brann_glb',
    name: 'Capitão Brann (herói, Tripo)',
    category: 'units',
    faction: 'human',
    type: 'knight',
    icon: '🔨',
    glb: 'hero_brann',
    sourceFile: 'tools/blender/build_hero_brann.py',
    create: createGlb('hero_brann'),
    description: 'Herói humano Capitão Brann: modelo do Tripo finalizado no Blender (public/models/hero_brann.glb). Nós Knight, Torso, Head, ArmL, ArmR, LegL, LegR, Sword (martelo) e Cape (capa, TeamColor). Sem escudo.',
    notes: 'Rig de cavaleiro (type knight). Pivôs de ombro e punho seguem o corpo do Tripo. Capa estática (não anima). 8 draw calls, 10.953 triângulos, atlas 512².',
  },
  {
    id: 'ballista',
    name: 'Balista (Ballista)',
    category: 'units',
    faction: 'human',
    type: 'ballista',
    icon: '🏹',
    sourceFile: 'src/models/units/BallistaModel.js',
    create: createBallista,
    description: 'Cerco humano (F4-02): chassi de madeira sobre duas rodas com besta gigante, virote e estandarte azul. Modelo procedural provisório; o final do Blender vem na F7.',
    notes: 'Nó SiegeArm recua ao disparar (animação fight); WheelL/WheelR giram ao andar.'
  },
  {
    id: 'catapult',
    name: 'Catapulta (Catapult)',
    category: 'units',
    faction: 'orc',
    type: 'catapult',
    icon: '🪨',
    sourceFile: 'src/models/units/CatapultModel.js',
    create: createCatapult,
    description: 'Cerco orc (F4-02): chassi de troncos sobre duas rodas, braço de arremesso com concha e pedra, peles e estandarte vermelho. Modelo procedural provisório; o final do Blender vem na F7.',
    notes: 'Nó SiegeArm arma e lança na animação fight; WheelL/WheelR giram ao andar.'
  },
  {
    id: 'mage', name: 'Mago Arcano (Mage)', category: 'units', faction: 'human', type: 'mage', icon: '🧙',
    sourceFile: 'src/models/units/MageModel.js', create: createMage,
    description: 'Conjurador humano (F4-04): túnica azul-marinho, capuz e cajado com cristal azul. Procedural provisório; o final do Blender vem na F7.',
    notes: 'Nós Weapon e Crystal; o cristal pulsa na animação cast.'
  },
  {
    id: 'necromancer', name: 'Necromante das Cinzas (Necromancer)', category: 'units', faction: 'orc', type: 'necromancer', icon: '☠️',
    sourceFile: 'src/models/units/NecromancerModel.js', create: createNecromancer,
    description: 'Conjurador orc (F4-04): manto cinza-escuro, capuz e cajado com crânio e cristal verde. Procedural provisório.',
    notes: 'Nós Weapon e Crystal; o cristal pulsa na animação cast.'
  },
  {
    id: 'skeleton', name: 'Esqueleto (Skeleton)', category: 'units', faction: 'orc', type: 'skeleton', icon: '🦴',
    sourceFile: 'src/models/units/SkeletonModel.js', create: createSkeleton,
    description: 'Morto-vivo invocado por Erguer Mortos (F4-04). Procedural simples.', notes: 'Rig humanoide plana + Weapon.'
  },
  {
    id: 'arcane_tower', name: 'Torre Arcana (Arcane Tower)', category: 'buildings', faction: 'human', type: 'building', icon: '🔮',
    sourceFile: 'src/models/buildings/ArcaneTowerModel.js', create: createArcaneTower,
    description: 'Torre de magos humana (F4-04): fuste de pedra esguio, anéis dourados, telhado azul e cristal flutuante.', notes: 'Procedural provisório.'
  },
  {
    id: 'ash_sanctum', name: 'Santuário das Cinzas (Ash Sanctum)', category: 'buildings', faction: 'orc', type: 'building', icon: '🔥',
    sourceFile: 'src/models/buildings/AshSanctumModel.js', create: createAshSanctum,
    description: 'Santuário orc (F4-04): plataforma de basalto, pilares com crânios, braseiro verde-ácido e estandarte.', notes: 'Procedural provisório.'
  },
  {
    id: 'temple', name: 'Templo da Luz (Temple)', category: 'buildings', faction: 'human', type: 'building', icon: '⛪',
    sourceFile: 'src/models/buildings/TempleModel.js', create: createTemple,
    description: 'Templo humano (F4-04b): base escalonada, anel de colunas, cúpula dourada e esfera de luz.', notes: 'Procedural provisório.'
  },
  {
    id: 'storm_altar', name: 'Altar das Tempestades (Storm Altar)', category: 'buildings', faction: 'orc', type: 'building', icon: '⚡',
    sourceFile: 'src/models/buildings/StormAltarModel.js', create: createStormAltar,
    description: 'Altar orc (F4-04b): plataforma escura, altar central com relâmpagos e quatro totens com chifres.', notes: 'Procedural provisório.'
  },
  {
    id: 'watching_eye', name: 'Olho Vigia (Watching Eye)', category: 'units', faction: 'orc', type: 'watching_eye', icon: '👁️',
    sourceFile: 'src/models/units/WatchingEyeModel.js', create: createWatchingEye,
    description: 'Olho voador invocado (F4-04b): globo violeta com íris dourada na frente (+Z) e tentáculos.', notes: 'Sem rig humanoide.'
  },
  {
    id: 'glider', name: 'Planador de Engenho (Glider)', category: 'units', faction: 'human', type: 'glider', icon: '🪁',
    sourceFile: 'src/models/units/GliderModel.js', create: createGlider,
    description: 'Batedor aéreo humano (F4-06): planador de madeira com asas de pano e piloto. Modelo procedural provisório (Blender na F7).', notes: 'Nós Torso/Head/WingL/WingR; animação de voo (bob + batida de asas).'
  },
  {
    id: 'war_balloon', name: 'Balão de Guerra (War Balloon)', category: 'units', faction: 'orc', type: 'war_balloon', icon: '🎈',
    sourceFile: 'src/models/units/BalloonModel.js', create: createWarBalloon,
    description: 'Batedor aéreo orc (F4-06): balão de couro remendado e cesta com braseiro. Modelo procedural provisório.', notes: 'Nós Torso/Head/Rotor.'
  },
  {
    id: 'gryphon_rider', name: 'Cavaleiro Grifo (Gryphon Rider)', category: 'units', faction: 'human', type: 'gryphon_rider', icon: '🦅',
    sourceFile: 'src/models/units/GryphonRiderModel.js', create: createGryphonRider,
    description: 'Ataque aéreo humano (F4-06): grifo com cavaleiro de armadura azul. Modelo procedural provisório.', notes: 'Nós Torso/Head/WingL/WingR.'
  },
  {
    id: 'war_serpent', name: 'Serpe de Guerra (War Serpent)', category: 'units', faction: 'orc', type: 'war_serpent', icon: '🐉',
    sourceFile: 'src/models/units/WarSerpentModel.js', create: createWarSerpent,
    description: 'Ataque aéreo orc (F4-06): serpente alada de membrana vermelha, presas e olhos âmbar. Modelo procedural provisório.', notes: 'Nós Torso/Head/WingL/WingR.'
  },
  {
    id: 'aviary', name: 'Aviário de Grifos (Aviary)', category: 'buildings', faction: 'human', type: 'building', icon: '🪺',
    sourceFile: 'src/models/buildings/AviaryModel.js', create: createAviary,
    description: 'Aviário humano (F4-06): torre de pedra com plataforma de pouso, ninho de palha e poleiros.', notes: 'Procedural provisório.'
  },
  {
    id: 'serpent_nest', name: 'Ninho das Serpes (Serpent Nest)', category: 'buildings', faction: 'orc', type: 'building', icon: '🥚',
    sourceFile: 'src/models/buildings/SerpentNestModel.js', create: createSerpentNest,
    description: 'Ninho orc (F4-06): montículo de rocha, espinhos de osso e ovos verdes brilhantes.', notes: 'Procedural provisório.'
  },
  {
    id: 'sapper',
    name: 'Sapadores de Pólvora (Sapper)',
    category: 'units',
    faction: 'human',
    type: 'sapper',
    icon: '💣',
    sourceFile: 'src/models/units/SapperModel.js',
    create: createSapper,
    description: 'Unidade suicida humana (F4-05): humanoide com barril de pólvora nas costas e pavio aceso. Modelo procedural provisório; o final do Blender vem na F7.',
    notes: 'Nó Fuse (pavio) pisca nas animações walk/fight; fight = corrida acelerada.'
  },
  {
    id: 'arsonist',
    name: 'Incendiários (Arsonist)',
    category: 'units',
    faction: 'orc',
    type: 'arsonist',
    icon: '🔥',
    sourceFile: 'src/models/units/ArsonistModel.js',
    create: createArsonist,
    description: 'Unidade suicida orc (F4-05): orc com botijas de óleo nas costas e pavio aceso. Modelo procedural provisório; o final do Blender vem na F7.',
    notes: 'Nó Fuse (pavio) pisca nas animações walk/fight; fight = corrida acelerada.'
  },
  {
    id: 'mage_glb',
    name: 'Mago Arcano (Blender)',
    category: 'units',
    faction: 'human',
    type: 'mage',
    icon: '🧙',
    glb: 'mage',
    sourceFile: 'tools/blender/build_mage.py',
    create: createGlb('mage'),
    description: 'Conjurador humano gerado pelo pipeline Blender (public/models/mage.glb): mago encorpado de chapéu pontudo e barba longa, túnica pesada azul-marinho com bordados dourados, manto de ombros com ombreiras de couro, capa e estola em cor de time com runas, cinto com grimório e frascos, mãos fortes com anéis e cajado grande com cristal flutuante em garras de ouro e anel rúnico.',
    notes: 'Rig plana (Torso, Head, ArmL/ArmR, LegL/LegR, Weapon > Crystal); o Crystal pulsa na animação cast. ~6,8 mil triângulos, 9 draw calls, atlas 512².'
  },
  {
    id: 'hero_oren_glb',
    name: 'Mestre Arcano Oren (herói, Tripo)',
    category: 'units',
    faction: 'human',
    type: 'mage',
    icon: '🔮',
    glb: 'hero_oren',
    sourceFile: 'tools/blender/build_hero_oren.py',
    create: createGlb('hero_oren'),
    description: 'Herói humano Mestre Arcano Oren: modelo do Tripo finalizado no Blender (public/models/hero_oren.glb). Robe azul-petróleo com capuz, cinto com bolsas e rolos de mapas; cajado de madeira com cristal ciano. Nós Mage, Torso, Head, ArmL, ArmR, LegL, LegR, Weapon (cajado, filho de ArmR) e Crystal (filho de Weapon).',
    notes: 'Rig de mago (type mage): o animador contra-gira o Weapon para o cajado ficar em pé e o Crystal pulsa no cast. Braços reposados pelo rig (o FBX estava em T-pose); a saia longa fica no Torso e só as botas viram LegL/LegR. O pano do robe usa TeamColor. 12 draw calls, ~21 mil triângulos, atlas 512².'
  },
  {
    id: 'hero_vozgul_glb',
    name: 'Vozgul, a Profetisa (herói, Tripo)',
    category: 'units',
    faction: 'orc',
    type: 'necromancer',
    icon: '💀',
    glb: 'hero_vozgul',
    sourceFile: 'tools/blender/build_hero_vozgul.py',
    create: createGlb('hero_vozgul'),
    description: 'Heroína orc Vozgul, a Profetisa: modelo do Tripo finalizado no Blender (public/models/hero_vozgul.glb). Capuz com galhadas de osso, manto longo rasgado de lã cinza-carvão, colares de dentes, bolsas, fitas e faixas vermelhas desbotadas (TeamColor) e cajado em espiral com crânio e chama verde-limão (material emissivo próprio).',
    notes: 'Rig do necromante (type necromancer): o animador contra-gira o Weapon para o cajado ficar em pé e o Crystal (a chama) pulsa no cast. Braços reposados pelo rig (o FBX estava em T-pose); o manto de costas e a barra longa ficam no Torso (só as sandálias viram LegL/LegR); fitas fazem parte dos braços. 12 draw calls, ~21 mil triângulos, atlas 512².'
  },
  {
    id: 'necromancer_glb',
    name: 'Necromante das Cinzas (Blender)',
    category: 'units',
    faction: 'orc',
    type: 'necromancer',
    icon: '☠️',
    glb: 'necromancer',
    sourceFile: 'tools/blender/build_necromancer.py',
    create: createGlb('necromancer'),
    description: 'Conjurador orc gerado pelo pipeline Blender (public/models/necromancer.glb): orc de pele cinzenta com capuz chifrudo, ombreiras de crânios com espigões, colar e arnês de ossos, runas verdes brilhantes, manto esfarrapado com faixas de time e fumaça nas barras, cajado com crânio chifrudo e chama de alma verde-ácido.',
    notes: 'Mesma rig do Mago; Crystal (chama de alma) pulsa na animação cast. ~6,8 mil triângulos, 12 draw calls, atlas 512².'
  },
  {
    id: 'skeleton_glb',
    name: 'Esqueleto (Blender)',
    category: 'units',
    faction: 'orc',
    type: 'skeleton',
    icon: '🦴',
    glb: 'skeleton',
    sourceFile: 'tools/blender/build_skeleton.py',
    create: createGlb('skeleton'),
    description: 'Morto-vivo de combate gerado pelo pipeline Blender (public/models/skeleton.glb): ossos grossos, caixa torácica aberta, meia couraça e ombreiras enferrujadas, elmo amassado, olhos verdes, trapos em cor de time e cutelo enferrujado empunhado; postura inclinada e agressiva.',
    notes: 'Rig plana com Weapon dentro de ArmR. ~5,9 mil triângulos, 8 draw calls, atlas 512². Também usado pelas invocações de Erguer Mortos.'
  },
  {
    id: 'sapper_glb',
    name: 'Sapadores de Pólvora (Blender)',
    category: 'units',
    faction: 'human',
    type: 'sapper',
    icon: '💣',
    glb: 'sapper',
    sourceFile: 'tools/blender/build_sapper.py',
    create: createGlb('sapper'),
    description: 'Sapador humano gerado pelo pipeline Blender (public/models/sapper.glb): brutamontes de quepe de couro com óculos na testa e careta fanática, colete em cor de time, bandoleira de bombas, avental de couro, luvas grossas e grande barril de pólvora com caveira e pavio aceso nas costas.',
    notes: 'Nó Fuse (filho do Torso) pisca nas animações walk/fight; fight = corrida acelerada. ~5,1 mil triângulos, 8 draw calls, atlas 512².'
  },
  {
    id: 'arsonist_glb',
    name: 'Incendiários (Blender)',
    category: 'units',
    faction: 'orc',
    type: 'arsonist',
    icon: '🔥',
    glb: 'arsonist',
    sourceFile: 'tools/blender/build_arsonist.py',
    create: createGlb('arsonist'),
    description: 'Incendiário orc gerado pelo pipeline Blender (public/models/arsonist.glb): orc de ombros enormes com óculos de solda de lentes laranja, quepe de couro com espigões, presas, arnês com vials de óleo, ombreiras de ferro e osso, faixas de time e rack de três botijas de óleo brilhante com pavio aceso nas costas.',
    notes: 'Nó Fuse (filho do Torso) pisca nas animações walk/fight. ~5,7 mil triângulos, 8 draw calls, atlas 512².'
  },
  {
    id: 'cavalier_glb',
    name: 'Cavaleiro Montado (Blender)',
    category: 'units',
    faction: 'human',
    type: 'cavalier',
    icon: '🐎',
    glb: 'cavalier',
    sourceFile: 'tools/blender/build_cavalier.py',
    create: createGlb('cavalier'),
    description: 'Cavalaria pesada humana gerada pelo pipeline Blender headless (public/models/cavalier.glb): cavalo de guerra low-poly anatômico (pescoço arqueado, crina, cauda, focinho com estrela, olhos, ferraduras), sela de couro, estribos, peitoral, rédeas, gualdrapa heráldica e penacho em cor de time; o cavaleiro usa a linguagem do Espadachim (armadura de placas com frisos dourados, elmo aberto, capa azul em cor de time, espada longa erguida e mão esquerda nas rédeas).',
    notes: 'Rig plana: Horse (corpo + arreios + pernas do cavaleiro, estático), HorseLegFL/FR/BL/BR (pivô no ombro/quadril; galope em diagonais pelo UnitAnimator), Torso, Head, ArmL, ArmR, Sword (mesmos nós do Espadachim). Sem escudo, para manter a silhueta limpa. 14 draw calls, ~8 mil triângulos, atlas 512². Rosto do cavaleiro só na face frontal (+Z); olhos do cavalo nas laterais (anatomia equina).'
  },
  {
    id: 'ballista_glb',
    name: 'Balista (Blender)',
    category: 'units',
    faction: 'human',
    type: 'ballista',
    icon: '🏹',
    glb: 'ballista',
    sourceFile: 'tools/blender/build_ballista.py',
    create: createGlb('ballista'),
    description: 'Balista humana gerada pelo pipeline Blender (public/models/ballista.glb): besta gigante de braços laminados (madeira + tendão) com pontas de ferro e corda de tendão em V, virote enorme com penas em cor de time, carreta de madeira e ferro com 2 rodas raiadas de aro de ferro e perna de apoio traseira, trilho central, cabrestante com manivelas e catraca, escudo frontal com faixas azuis e brasão dourado e estandarte. Sem tripulação.',
    notes: 'Rig plana: Body, SiegeArm (pivô (0, 1.84, 0); recua em −Z ao disparar), WheelL/WheelR (pivô no eixo; giram em X ao andar). 6 draw calls, ~5 mil triângulos, atlas 512². Cor de time: penas do virote, faixas dos braços, escudo e estandarte.'
  },
  {
    id: 'catapult_glb',
    name: 'Catapulta (Blender)',
    category: 'units',
    faction: 'orc',
    type: 'catapult',
    icon: '🪨',
    glb: 'catapult',
    sourceFile: 'tools/blender/build_catapult.py',
    create: createGlb('catapult'),
    description: 'Catapulta orc gerada pelo pipeline Blender (public/models/catapult.glb): engenho de toras grosseiras amarradas com corda e ferro sobre 2 rodas maciças de pranchas com espigões, cavaletes em A com peles esticadas, correntes, ossos e crânios, espigões de ferro na frente, cabrestante de ossos, braço longo com concha carregada (rocha e crânios) e contrapeso em gaiola de toras cheia de pedras. Faixas vermelhas em cor de time. Sem operador.',
    notes: 'Rig plana: Body, SiegeArm (pivô (0, 2.25, −0.1); gira em X: + arma, − lança; repouso com a ponta 14° acima, já na geometria), WheelL/WheelR (giram em X ao andar). 6 draw calls, ~6,5 mil triângulos, atlas 512².'
  },
  {
    id: 'archer_glb',
    name: 'Arqueiro (Blender)',
    category: 'units',
    faction: 'human',
    type: 'archer',
    icon: '🏹',
    glb: 'archer',
    sourceFile: 'tools/blender/build_archer.py',
    create: createGlb('archer'),
    description: 'Versão gerada pelo pipeline Blender headless (public/models/archer.glb): capuz e manto em cor de time (verde-oliva), gibão de couro sobre túnica, braçadeiras, aljava cheia de flechas com penas, arco composto com empunhadura de couro e corda de dois segmentos, adaga e bolsas.',
    notes: 'Rig plana (a do antigo ArcherModel.js, removido na F7-00b; Torso, Head, ArmL, ArmR, LegL, LegR; Bow em ArmL com BowStringTop/BowStringBottom, BowTipTop/BowTipBottom e DrawnArrow). O ModelFactory recria updateBowString a partir desses nós. Também é o modelo do Ranger.'
  },
  {
    id: 'archer_v2_glb',
    name: 'Arqueiro v2 (Tripo)',
    category: 'units',
    faction: 'human',
    type: 'archer',
    icon: '🏹',
    glb: 'archer_v2',
    sourceFile: 'tools/blender/build_archer_v2.py',
    create: createGlb('archer_v2'),
    description: 'Arqueiro humano v2 (M2-31): modelo do Tripo finalizado no Blender (public/models/archer_v2.glb). Capuz verde-azulado, tabardo azul com emblema (TeamColor), gibão de couro com ombreiras, aljava com flechas nas costas e arco longo na mão do arco (ArmL). É o padrão do Arqueiro e do Patrulheiro no jogo; o modelo antigo continua em "Arqueiro (Blender)".',
    notes: 'Rig do tipo archer com dois cotovelos novos: ArmL > ForeArmL > Bow (+ BowTipTop/Bottom, BowStringTop/Bottom e DrawnArrow) e ArmR > ForeArmR. Malha espelhada em x (como o Brann): o braço esquerdo do FBX, que segura o arco, é o ArmL (-x), como no archer.glb antigo. No disparo o UnitAnimator contra-gira o ForeArmL (braço do arco reto, arco em pé) e dobra o ForeArmR (corda no encaixe, cotovelo recuado). 13 draw calls, ~22,6 mil triângulos, atlas 512².'
  },
  {
    id: 'villager_glb',
    name: 'Camponês (Blender)',
    category: 'units',
    type: 'villager',
    icon: '🌾',
    glb: 'villager',
    sourceFile: 'tools/blender/build_villager.py',
    create: createGlb('villager'),
    description: 'Versão gerada pelo pipeline Blender headless (public/models/villager.glb): barrete de feltro e avental em cor de time, túnica de lã com mangas arregaçadas, luvas e botas de couro, cinto com ferramentas, machado/picareta/marreta separados e mochila com feixe de lenha ou saco de ouro.',
    notes: 'Rig plana (a do antigo VillagerModel.js, removido na F7-00b; Torso, Head, ArmL, ArmR, LegL, LegR, ToolGroup > Axe/Pickaxe/Hammer, Pack > WoodBundle/GoldSack). Atlas 512², rosto só em +Z.'
  },
  {
    id: 'villager_v2_glb',
    name: 'Camponês v2 (Tripo)',
    category: 'units',
    faction: 'human',
    type: 'villager',
    icon: '⛏️',
    glb: 'villager_v2',
    sourceFile: 'tools/blender/build_villager_v2.py',
    create: createGlb('villager_v2'),
    description: 'Aldeão humano v2: camponês de barba ruiva do Tripo finalizado no Blender (public/models/villager_v2.glb). Capuz de couro, colete sobre túnica azul (cor de time), cinto com bolsas e bolsa de moedas, picareta na mão direita; mochila de carga com feixe de lenha e saco de ouro/pedra (Pack).',
    notes: 'Tipo villager: Torso, Head, ArmL, ArmR, LegL, LegR; a picareta é o ToolGroup, FILHO de ArmR (balança com o braço; o gesto de coleta serve para madeira, ouro e pedra). Pack > PackFrame/WoodBundle/GoldSack. É o padrão do jogo; o Camponês (Blender) antigo continua como fallback. ~22 mil triângulos, 14 draw calls, atlas 512².'
  },
  {
    id: 'bandit_glb',
    name: 'Bandido (Blender)',
    category: 'units',
    type: 'bandit',
    icon: '🗡️',
    glb: 'bandit',
    sourceFile: 'tools/blender/build_bandit.py',
    create: createGlb('bandit'),
    description: 'Versão gerada pelo pipeline Blender headless (public/models/bandit.glb): saqueador magro e mal-encarado com capuz e bandana, colete de couro remendado, cinto com facas e bolsa, luvas sem dedos, botas gastas e porrete cravejado de pregos. 7 partes rígidas (Torso, Head, ArmL, ArmR, LegL, LegR, Weapon), atlas 512².',
    notes: 'Rig plana (a do antigo BanditModel.js, removido na F7-00b; Weapon é irmã dos braços). Neutro: o TeamColor guarda só o trapo/bandana (vermelho-sujo). Rosto só na face frontal (+Z).'
  },
  {
    id: 'peon_glb',
    name: 'Lacaio (Blender)',
    category: 'units',
    faction: 'orc',
    type: 'peon',
    icon: '🪓',
    glb: 'peon',
    sourceFile: 'tools/blender/build_peon.py',
    create: createGlb('peon'),
    description: 'Versão gerada pelo pipeline Blender headless (public/models/peon.glb): trabalhador orc curvado de pele verde-oliva, presas pequenas, olhos âmbar, avental de couro, cinto de ferramentas, faixa/bandoleira em cor de time e ferramentas rudimentares (machado, picareta, marreta) com mochila de lenha/ouro.',
    notes: 'Rig aninhada (a do antigo PeonModel.js, removido na F7-00b; Torso > Head, ArmL, ArmR > ToolGroup > Axe/Pickaxe/Hammer; Pack no Torso; LegL/LegR na raiz). Atlas 512².'
  },
  {
    id: 'grunt_glb',
    name: 'Guerreiro Orc (Blender)',
    category: 'units',
    faction: 'orc',
    type: 'grunt',
    icon: '🪓',
    glb: 'grunt',
    sourceFile: 'tools/blender/build_grunt.py',
    create: createGlb('grunt'),
    description: 'Versão gerada pelo pipeline Blender headless (public/models/grunt.glb): 7 partes rígidas (Torso, Head, ArmL, ArmR, Weapon, LegL, LegR), atlas 512² com cor, AO e desgaste de bordas assados, capa e tanga em cor de time.',
    notes: 'Compatível com o UnitAnimator atual (mesmos nós e pivôs nas articulações). 8 draw calls, ~4,4 mil triângulos, 1 textura. Esqueleto e AnimationMixer ficam para a F7-00b.'
  },
  {
    id: 'hero_drogath_glb',
    name: 'Drogath Punho-de-Brasa (herói, Tripo)',
    category: 'units',
    faction: 'orc',
    type: 'grunt',
    icon: '🪓',
    glb: 'hero_drogath',
    sourceFile: 'tools/blender/build_hero_drogath.py',
    create: createGlb('hero_drogath'),
    description: 'Herói orc Drogath Punho-de-Brasa: modelo do Tripo finalizado no Blender (public/models/hero_drogath.glb). Pele verde-oliva, ombreira de ferro com espetos, manto de pele, correntes, braseiro na cintura e machado de duas mãos. Nós Grunt, Torso (com Head, ArmL e ArmR), LegL, LegR e Weapon (machado, filho de ArmR).',
    notes: 'Rig do tipo grunt (hierarquia do grunt.glb): o golpe torce o Torso e leva braços e cabeça; o Weapon repousa a -45° em x e o machado tem o gume para +Z. Braço direito reposado pelo rig (o FBX tinha o machado sobre o ombro); machado rígido ligado à mão. Faixas, tanga e atadura do cabo usam TeamColor. 13 draw calls, ~20,8 mil triângulos, atlas 512².'
  },
  {
    id: 'hero_skarn_glb',
    name: 'Skarn, chefe-de-brasa (herói, Tripo)',
    category: 'units',
    faction: 'orc',
    type: 'ogre',
    icon: '🔨',
    glb: 'hero_skarn',
    sourceFile: 'tools/blender/build_hero_skarn.py',
    create: createGlb('hero_skarn'),
    description: 'Herói orc Skarn, chefe-de-brasa: o maior herói do jogo (public/models/hero_skarn.glb). Ogro de pele verde-musgo com coroa de espetos, manto de pele nos ombros, duas lanternas de brasa sobre os ombros, placas de ferro negro, saiote de correntes e crânios na cintura. Nós Ogre, Torso (com Head, ArmL e ArmR), LegL, LegR e Weapon (martelo de guerra gigante, filho de ArmR).',
    notes: 'Rig do tipo ogre (hierarquia do ogre.glb): o golpe levanta e esmaga como o Ogro; o Weapon repousa a -45° em x, cabo em pé, e a cabeça retangular do martelo tem as faces de impacto para ±Z. O corpo e o martelo vêm de dois FBX do Tripo (o martelo, sem rig, foi decimado e encaixado na mão direita reposada). Couro dos tassets em TeamColor; a brasa das lanternas é pintada na textura. 10 draw calls, ~25,7 mil triângulos, atlas 512².'
  },
  {
    id: 'hero_dorian_glb',
    name: 'Marechal Dorian Vasques (herói, Tripo)',
    category: 'units',
    faction: 'human',
    type: 'cavalier',
    icon: '🏇',
    glb: 'hero_dorian',
    sourceFile: 'tools/blender/build_hero_dorian.py',
    create: createGlb('hero_dorian'),
    description: 'Herói humano Dorian Vasques: modelo do Tripo (sem rig) segmentado por geometria no Blender (public/models/hero_dorian.glb). Cavalo de guerra com barda azul, cavaleiro de placas com elmo de pluma, capa longa, espada na cintura e estandarte de Aurelan nas costas. Nós Cavalier, Horse, HorseLegFL/FR/BL/BR, Torso (com a capa e o filho Banner), Head, ArmL, ArmR e Sword.',
    notes: 'Rig do tipo cavalier (hierarquia do cavalier.glb): o animador balança as 4 patas e usa o ramo do knight para tronco, braços e espada. O nó novo Banner (haste + bandeira, filho do Torso, pivô na base da haste) balança por seno em UnitAnimator.applyBanner. Barda, capa e pano do estandarte usam TeamColor. 14 draw calls, ~23,6 mil triângulos, atlas 512².'
  },
  {
    id: 'axethrower_glb',
    name: 'Lanceiro-Machado Troll (Blender)',
    category: 'units',
    faction: 'orc',
    type: 'axethrower',
    icon: '🪓',
    glb: 'axethrower',
    sourceFile: 'tools/blender/build_axethrower.py',
    create: createGlb('axethrower'),
    description: 'Versão gerada pelo pipeline Blender headless (public/models/axethrower.glb): troll alto e musculoso de pele verde-acinzentada com pintura de guerra, moicano laranja, presas, colar de contas, bandoleira e cinturão de machados de arremesso, ombreira de pele, tanga em cor de time e dois machados de arremesso nas mãos.',
    notes: 'Rig aninhada (a do antigo AxethrowerModel.js, removido na F7-00b; Torso > Head/ArmL/ArmR > WeaponL/WeaponR; LegL/LegR na raiz; Mohawk em Head). Também é o modelo do Berserker.'
  },
  {
    id: 'ogre_glb',
    name: 'Ogro (Blender)',
    category: 'units',
    faction: 'orc',
    type: 'ogre',
    icon: '👹',
    glb: 'ogre',
    sourceFile: 'tools/blender/build_ogre.py',
    create: createGlb('ogre'),
    description: 'Versão gerada pelo pipeline Blender headless (public/models/ogre.glb): brutamontes colossal com barrigão, ombros largos, cabeça pequena de mandíbula proeminente e chifre, pele acinzentada com cicatrizes, ombreiras de ferro, correntes e clava gigante cravejada de espigões. 7 partes rígidas (Torso, Head, ArmL, ArmR, Weapon, LegL, LegR), atlas 512².',
    notes: 'Rig aninhada (a do antigo OgreModel.js, removido na F7-00b; Head/ArmL/ArmR em Torso, Weapon em ArmR). Faixas, tanga, capa e trapo da clava em cor de time. Rosto só na face frontal (+Z).'
  },

  // --- CONSTRUÇÕES ---
  {
    id: 'great_hall',
    name: 'Grande Salão dos Clãs (Great Hall)',
    category: 'buildings',
    faction: 'orc',
    type: 'building',
    icon: '🌋',
    sourceFile: 'src/render/buildings/orc/GreatHall.js',
    create: () => bldView(GreatHall, 'great_hall'),
    description: 'A colossal fortaleza central dos Clãs Orcs. Construída com pesadas toras de ferro, estacas defensivas pontiagudas, crânio de fera ancestral sobre o portal de entrada, quatro torreões de canto com braseiros de fogo ardente e estandartes de guerra vermelhos.',
    notes: 'VFX: Estandartes de guerra dos Clãs com ondulação dinâmica ao vento e braseiro de entrada com PointLight animada e cintilação de calor.'
  },
  {
    id: 'orc_barracks',
    name: 'Quartel dos Clãs (Orc Barracks)',
    category: 'buildings',
    faction: 'orc',
    type: 'building',
    icon: '🛡️',
    sourceFile: 'src/render/buildings/orc/OrcBarracks.js',
    create: () => bldView(OrcBarracks, 'orc_barracks'),
    description: 'Fortificação militar agressiva com toras entrecruzadas monumentais no cume do telhado, toldo de lona carmesim, pátio de treinamento com boneco de palha e estantes com machados de guerra afiados.',
    notes: 'VFX: Simulação física de pêndulo harmônico amortecido no boneco de treino suspenso (Anim_TrainingDummy) com reação a pancadas.'
  },
  {
    id: 'pig_farm',
    name: 'Cercado de Javalis (procedural)',
    category: 'buildings',
    faction: 'orc',
    type: 'building',
    icon: '🐖',
    sourceFile: 'src/render/buildings/orc/PigFarm.js',
    create: () => bldView(PigFarm, 'pig_farm'),
    description: 'O emblemático cercado dos Clãs do Cinzal. Cercado de toras rústicas com amarração de corda, chão de lama úmida com palha, cocho de comida, abrigo de palha e três javalis/porcos com rotinas autônomas fuçando e comendo no cercado.',
    notes: 'VFX: 3 javalis com IA comportamental autônoma (vagam pelo cercado, comem no cocho, farejam o chão e balançam os rabos em espiral).'
  },
  {
    id: 'orc_house',
    name: 'Toca dos Peons (Orc Burrow)',
    category: 'buildings',
    faction: 'orc',
    type: 'building',
    icon: '🛖',
    sourceFile: 'src/render/buildings/orc/OrcHouse.js',
    create: () => bldView(OrcHouse, 'orc_house'),
    description: 'Toca e habitação dos Peons Orcs construída com esteios de madeira robustos, telhado cônico assimétrico de peles curtidas costuradas com faixas de couro, presas de bestas nas bordas, pórtico baixo com crânio tribal e respiradouro de fumaça.',
    notes: 'VFX: Fumaça suave saindo pelo respiradouro do teto e luz de fogueira interna (PointLight) escapando pelo vão da porta.'
  },
  {
    id: 'orc_watchtower',
    name: 'Torre de Vigia Orc (Orc Watchtower)',
    category: 'buildings',
    faction: 'orc',
    type: 'building',
    icon: '🏹',
    sourceFile: 'src/render/buildings/orc/OrcWatchtower.js',
    create: () => bldView(OrcWatchtower, 'orc_watchtower'),
    description: 'Atalaia defensiva de múltiplos andares com toras reforçadas por escoras diagonais, estacas de proteção na base, plataforma elevada de combate com paliçada dentada e braseiro ardente no topo.',
    notes: 'VFX: Braseiro de ferro suspenso no cume ardendo com chamas 3D animadas, fagulhas e PointLight dinâmica de fogo.'
  },
  {
    id: 'orc_lumber_mill',
    name: 'Serraria dos Clãs (Orc Lumber Mill)',
    category: 'buildings',
    faction: 'orc',
    type: 'building',
    icon: '🪚',
    sourceFile: 'src/render/buildings/orc/OrcLumberMill.js',
    create: () => bldView(OrcLumberMill, 'orc_lumber_mill'),
    description: 'Oficina florestal pesada com plataforma de madeira elevada, mecanismo de serra circular giratória gigante de ferro serrilhado com marcas de resina, tora mestre sendo fatiada, montes de serragem e pilhas de toras.',
    notes: 'VFX: Serra circular dentada (Anim_SawBlade) que gira continuamente em torno do seu eixo com aceleração dinâmica ao processar toras.'
  },
  {
    id: 'orc_forge',
    name: 'Forja de Guerra dos Clãs (Orc War Forge)',
    category: 'buildings',
    faction: 'orc',
    type: 'building',
    icon: '🔥',
    sourceFile: 'src/render/buildings/orc/OrcForge.js',
    create: () => bldView(OrcForge, 'orc_forge'),
    description: 'Centro de aprimoramentos bélicos e fundição dos Clãs. Erguida sobre blocos maciços de basalto vulcânico negro, possui fornalha abobadada com boca em arco e grades de ferro, chaminé monumental reforçada com anéis forjados, telhado parcial de chapas rebitadas, toco com bigorna de ferro fundido e tina de têmpera.',
    notes: 'VFX: Fogo intenso na fornalha com malha de chamas animadas, PointLight de calor termodinâmico, chaminé alta expelindo fumaça preta e faíscas incandescentes na bigorna.'
  },
  {
    id: 'stable',
    name: 'Estábulo Real (Stable)',
    category: 'buildings',
    faction: 'human',
    type: 'building',
    icon: '🐴',
    sourceFile: 'src/models/buildings/StableModel.js',
    create: createStable,
    description: 'Estábulo humano (F4-01): galpão de madeira aberto na frente sobre base de pedra, telhado de duas águas azul com cumeeira dourada, baias com feno, cocho, cerca e estandarte.',
    notes: 'Modelo procedural provisório sem texturas de canvas (materiais compartilhados).'
  },
  {
    id: 'ogre_den',
    name: 'Covil dos Ogros (Ogre Den)',
    category: 'buildings',
    faction: 'orc',
    type: 'building',
    icon: '🦴',
    sourceFile: 'src/models/buildings/OgreDenModel.js',
    create: createOgreDen,
    description: 'Covil orc (F4-01): paliçada de troncos escuros sobre basalto, portão largo com caveira e ossos cruzados, telhado de peles, espetos nos cantos e estandarte de guerra.',
    notes: 'Modelo procedural provisório sem texturas de canvas (materiais compartilhados).'
  },
  {
    id: 'workshop',
    name: 'Oficina de Engenharia (Workshop)',
    category: 'buildings',
    faction: 'human',
    type: 'building',
    icon: '⚙️',
    sourceFile: 'src/models/buildings/WorkshopModel.js',
    create: createWorkshop,
    description: 'Oficina humana (F4-02): galpão de madeira sobre base de pedra, telhado azul com chaminé, engrenagem grande, bancada com bigorna e balista em montagem.',
    notes: 'Modelo procedural provisório sem texturas de canvas (materiais compartilhados).'
  },
  {
    id: 'orc_workshop',
    name: 'Oficina dos Engenhoqueiros (Orc Workshop)',
    category: 'buildings',
    faction: 'orc',
    type: 'building',
    icon: '⚙️',
    sourceFile: 'src/models/buildings/OrcWorkshopModel.js',
    create: createOrcWorkshop,
    description: 'Oficina orc (F4-02): paliçada de troncos sobre basalto, portão com caveira, telhado de peles, engrenagem de ferro, catapulta em montagem e pilha de pedras.',
    notes: 'Modelo procedural provisório sem texturas de canvas (materiais compartilhados).'
  },
  {
    id: 'workshop_glb',
    name: 'Oficina de Engenharia (Blender)',
    category: 'buildings',
    faction: 'human',
    type: 'building',
    icon: '⚙️',
    glb: 'workshop',
    sourceFile: 'tools/blender/build_workshop.py',
    create: createGlb('workshop'),
    description: 'Oficina humana gerada pelo pipeline Blender (public/models/workshop.glb): galpão de enxaimel sobre pé de pedra com telhado azul de duas águas e cumeeira dourada com cata-vento de engrenagem, chaminé alta de tijolos, engrenagens de ferro e ouro na fachada, portão em arco aberto com forja acesa ao fundo, projetos de máquinas pendurados, guindaste de madeira com caixote, bancada com bigorna, balista inacabada, tábuas, barris, roda sobressalente, lanternas e mastros com bandeirolas.',
    notes: '2 draw calls (Static_Mesh + Anim_Banners em cor de time), ~7,3 mil triângulos, atlas 1024². Pegada ~7,3 x 7,3 (raio de colisão 3,6), altura ~6,8 com a chaminé. Sockets: Socket_UnitSpawn, Socket_Rally.'
  },
  {
    id: 'orc_workshop_glb',
    name: 'Oficina dos Engenhoqueiros (Blender)',
    category: 'buildings',
    faction: 'orc',
    type: 'building',
    icon: '⚙️',
    glb: 'orc_workshop',
    sourceFile: 'tools/blender/build_orc_workshop.py',
    create: createGlb('orc_workshop'),
    description: 'Oficina orc gerada pelo pipeline Blender (public/models/orc_workshop.glb): galpão bruto de meia-água com toras, chapas remendadas de ferro enferrujado, peles e costelas de osso, baia esquerda aberta com forja ardente, fole e bigorna, chaminé torta de ferro com chama, baia direita de chapas rebitadas com portão de ferro, engrenagens toscas (inclusive uma gigante sobre o telhado), catapulta inacabada, sucata, barris, pedras, ossos, crânios, espigões e estandartes rasgados.',
    notes: '2 draw calls (Static_Mesh + Anim_Banners em cor de time), ~9 mil triângulos, atlas 1024². Pegada ~7,3 x 7,3 (raio de colisão 3,6), altura ~7 com a chaminé. Sockets: Socket_UnitSpawn, Socket_Rally.'
  },
  {
    id: 'stable_glb',
    name: 'Estábulo Real (Blender)',
    category: 'buildings',
    faction: 'human',
    type: 'building',
    icon: '🐴',
    glb: 'stable',
    sourceFile: 'tools/blender/build_stable.py',
    create: createGlb('stable'),
    description: 'Estábulo humano gerado pelo pipeline Blender (public/models/stable.glb): celeiro de empena frontal com estrutura de madeira aparente e reboco sobre pé de pedra, baias fundas com divisórias e meias-portas, dois cavalos inteiros (tronco, garupa e cauda atrás da porta) espiando por cima delas (castanho e ruço, com pescoço arqueado, crina, blaze, ombros e peito), portão central aberto, sótão de feno com talha, telhado azul com cumeeira dourada e cúpula com cata-vento, pátio com cocho, cerca, fardos, rack de sela, lanternas e mastros com bandeirolas.',
    notes: '2 draw calls (Static_Mesh + Anim_Banners em cor de time), ~5 mil triângulos, atlas 1024². Pegada ~7,3 x 7,3 (raio de colisão 3,6), altura ~6. Sockets: Socket_UnitSpawn, Socket_Rally.'
  },
  {
    id: 'ogre_den_glb',
    name: 'Covil dos Ogros (Blender)',
    category: 'buildings',
    faction: 'orc',
    type: 'building',
    icon: '🦴',
    glb: 'ogre_den',
    sourceFile: 'tools/blender/build_ogre_den.py',
    create: createGlb('ogre_den'),
    description: 'Covil orc gerado pelo pipeline Blender (public/models/ogre_den.glb): paliçada de toras pontiagudas com travessas de ferro, teto de peles sobre costelas gigantes de osso, portão largo de troncos pontiagudos aberto, crânio de ogro com chifres sobre o portão, crânios nas colunas e nos totens, braseiros acesos, estandartes rasgados em cor de time, peles esticadas, ossadas e clavas.',
    notes: '2 draw calls (Static_Mesh + Anim_Banners em cor de time), ~8,6 mil triângulos, atlas 1024². Pegada ~7,3 x 7,3 (raio de colisão 3,6), altura ~5,4. Sockets: Socket_UnitSpawn, Socket_Rally.'
  },
  {
    id: 'arcane_tower_glb',
    name: 'Torre Arcana (Blender)',
    category: 'buildings',
    faction: 'human',
    type: 'building',
    icon: '🔮',
    glb: 'arcane_tower',
    sourceFile: 'tools/blender/build_arcane_tower.py',
    create: createGlb('arcane_tower'),
    description: 'Torre de magos humana gerada pelo pipeline Blender (public/models/arcane_tower.glb).',
    notes: 'Sockets: Socket_UnitSpawn, Socket_Rally.'
  },
  {
    id: 'frigate_glb',
    name: 'Fragata (Blender)',
    category: 'units',
    faction: 'human',
    type: 'frigate',
    icon: '🚢',
    glb: 'frigate',
    sourceFile: 'tools/blender/build_frigate.py',
    create: createGlb('frigate'),
    description: 'Fragata humana (public/models/frigate.glb): casco de aço azul rebitado com bordo creme e friso dourado, escudos heráldicos, duas torres de canos gêmeos (proa e popa), passadiço com janelas, chaminé, mastro com gávea, velas e flâmula.',
    notes: 'Nós: Hull, Turret1/Cannon1 (proa), Turret2/Cannon2 (popa), Sail, Flag, Anim_Smoke. Proa = +Z, y=0 na linha d\'água.'
  },
  {
    id: 'barge_glb',
    name: 'Barcaça de Transporte (Blender)',
    category: 'units',
    faction: 'human',
    type: 'barge',
    icon: '⛵',
    glb: 'barge',
    sourceFile: 'tools/blender/build_barge.py',
    create: createGlb('barge'),
    description: 'Barcaça humana (public/models/barge.glb): casco bojudo de tábuas claras, convés com escotilha, castelo de popa com torre, guindaste com gancho, rampa de proa articulada, âncora, canhões de bordo e bandeira.',
    notes: 'Nós: Hull, Crane/Hook, Ramp (articulada), Flag. Proa = +Z.'
  },
  {
    id: 'dreadnought_glb',
    name: 'Couraçado (Blender)',
    category: 'units',
    faction: 'human',
    type: 'dreadnought',
    icon: '⚓',
    glb: 'dreadnought',
    sourceFile: 'tools/blender/build_dreadnought.py',
    create: createGlb('dreadnought'),
    description: 'Couraçado humano (public/models/dreadnought.glb): galeão blindado dourado e azul de 3 mastros com velas, fileira de canhões, esporão de aço, duas torres de canos gêmeos, castelo de popa de pedra e canhão giratório.',
    notes: 'Nós: Hull, Turret1/Cannon1, Turret2/Cannon2, Cannon3, Sail1..3, Flag. Proa = +Z.'
  },
  {
    id: 'tanker_glb',
    name: 'Petroleiro (Blender)',
    category: 'units',
    faction: 'human',
    type: 'tanker',
    icon: '🛢️',
    glb: 'tanker',
    sourceFile: 'tools/blender/build_tanker.py',
    create: createGlb('tanker'),
    description: 'Petroleiro humano (public/models/tanker.glb): casco de chapas laranja-ferrugem, três tanques com cintas, tubulação e válvulas, mangueira de carga, cabine de popa, antena e chaminé com faixa.',
    notes: 'Nós: Hull, Hose, Flag, Anim_Smoke. Compartilhado pelas duas facções até haver a versão orc.'
  },
  {
    id: 'orc_frigate_glb',
    name: 'Fragata Orc (Blender)',
    category: 'units',
    faction: 'orc',
    type: 'frigate',
    icon: '🚢',
    glb: 'orc_frigate',
    sourceFile: 'tools/blender/build_orc_frigate.py',
    create: createGlb('orc_frigate'),
    description: 'Fragata orc (public/models/orc_frigate.glb): casco de madeira com placas de ferro enferrujado e espinhos, proa em cabeça de javali de ferro com presas, torres de canos triplos/duplos, torre central com cesto de espinhos, chaminé, vela rasgada e estandarte de caveira. ~17 mil tris, 10 draw calls.',
    notes: 'Mesmos nós da fragata humana: Hull, Turret1/Cannon1, Turret2/Cannon2, Sail, Flag, Anim_Smoke.'
  },
  {
    id: 'orc_barge_glb',
    name: 'Barcaça Orc (Blender)',
    category: 'units',
    faction: 'orc',
    type: 'barge',
    icon: '⛵',
    glb: 'orc_barge',
    sourceFile: 'tools/blender/build_orc_barge.py',
    create: createGlb('orc_barge'),
    description: 'Barcaça orc (public/models/orc_barge.glb): casco de tábuas escuras com remendos de couro e pano rasgado, rampa de proa com espinhos e correntes, postes, torre de vigia, caixotes, barris e canhão. ~13 mil tris, 7 draw calls.',
    notes: 'Mesmos nós da barcaça humana: Hull, Crane/Hook, Ramp, Flag.'
  },
  {
    id: 'orc_dreadnought_glb',
    name: 'Couraçado Orc (Blender)',
    category: 'units',
    faction: 'orc',
    type: 'dreadnought',
    icon: '⚓',
    glb: 'orc_dreadnought',
    sourceFile: 'tools/blender/build_orc_dreadnought.py',
    create: createGlb('orc_dreadnought'),
    description: 'Couraçado orc (public/models/orc_dreadnought.glb): fortaleza flutuante de madeira e ferro com espinhos e presas, pagode central de 4 andares, torretas de canos grossos, canhões laterais, esporão serrilhado e bandeiras de guerra. ~27 mil tris, 12 draw calls, atlas 1024².',
    notes: 'Nós: Hull, Turret1/Cannon1, Turret2/Cannon2, Cannon3, Sail1..3 (bandeiras), Flag.'
  },
  {
    id: 'orc_tanker_glb',
    name: 'Petroleiro Orc (Blender)',
    category: 'units',
    faction: 'orc',
    type: 'tanker',
    icon: '🛢️',
    glb: 'orc_tanker',
    sourceFile: 'tools/blender/build_orc_tanker.py',
    create: createGlb('orc_tanker'),
    description: 'Petroleiro orc (public/models/orc_tanker.glb): casco de ferro enferrujado e madeira, três tanques de cobre com canos e válvulas, caldeiras, chaminé com faixa de time, guindaste com balde. ~19 mil tris, 5 draw calls.',
    notes: 'Nós: Hull, Hose, Flag, Anim_Smoke.'
  },
  {
    id: 'ship_dock_glb',
    name: 'Doca do Clã (Blender)',
    category: 'buildings',
    faction: 'orc',
    type: 'building',
    icon: '⚓',
    glb: 'ship_dock',
    sourceFile: 'tools/blender/build_ship_dock.py',
    create: createGlb('ship_dock'),
    description: 'Doca do Clã orc (public/models/ship_dock.glb): guindastes de toras e ossos com ganchos, presas de marfim com tiras de ferro, casco de pele e ossos em construção sobre rampa de tábuas com estacas, torre de vigia com telhado pontudo, estandarte de caveira, pilhas de toras. ~18 mil tris, 5 draw calls, atlas 1024².',
    notes: 'Nós: Static_Mesh, Anim_Banners, Anim_Crane, Anim_Crane_2. Sockets: Socket_UnitSpawn (mar, +Z), Socket_Rally.'
  },
  {
    id: 'orc_oil_platform_glb',
    name: 'Plataforma de Petróleo Orc (Blender)',
    category: 'buildings',
    faction: 'orc',
    type: 'building',
    icon: '🛢️',
    glb: 'orc_oil_platform',
    sourceFile: 'tools/blender/build_orc_oil_platform.py',
    create: createGlb('orc_oil_platform'),
    description: 'Plataforma orc (public/models/orc_oil_platform.glb): convés de tábuas e placas de ferro sobre pilares de madeira, torre de perfuração em treliça com chifres e chama, bomba cavalo-de-pau, barris, mangueira, torre de vigia com caveira. ~14 mil tris, 5 draw calls, atlas 1024².',
    notes: 'Nós: Static_Mesh, Anim_Banners, Anim_Smoke, Anim_Crane, Anim_Drill. Sockets: Socket_UnitSpawn, Socket_Rally.'
  },
  {
    id: 'shipyard_glb',
    name: 'Estaleiro (Blender)',
    category: 'buildings',
    faction: 'human',
    type: 'building',
    icon: '⚓',
    glb: 'shipyard',
    sourceFile: 'tools/blender/build_shipyard.py',
    create: createGlb('shipyard'),
    description: 'Estaleiro humano gerado pelo pipeline Blender (public/models/shipyard.glb): doca de pedra e madeira aberta para o mar (+Z) com doca seca, casco de navio em construção sobre cavaletes (mastro com gávea, vergas, portinholas, cabine de ré), torre de pedra com telhado de telhas azul/vermelho, dois guindastes de madeira e aço com corda e gancho, caixotes, barris, fardos, bancada e rack de ferramentas, cordas enroladas.',
    notes: '5 draw calls (Static_Mesh + Anim_Banners TeamColor 2 materiais + Anim_Crane + Anim_Crane_2), atlas 2048². Pegada ~7,5 x 7,5 (raio de colisão 3,6), altura ~8. Nós animáveis: Anim_Banners, Anim_Crane, Anim_Crane_2. Sockets: Socket_UnitSpawn (mar, +Z), Socket_Rally.'
  },
  {
    id: 'oil_platform_glb',
    name: 'Plataforma de Petróleo (Blender)',
    category: 'buildings',
    faction: 'human',
    type: 'building',
    icon: '🛢️',
    glb: 'oil_platform',
    sourceFile: 'tools/blender/build_oil_platform.py',
    create: createGlb('oil_platform'),
    description: 'Plataforma de petróleo humana gerada pelo pipeline Blender (public/models/oil_platform.glb): convés de tábuas sobre quatro pilares de madeira com cintas de aço e blocos de pedra (y = 0 no nível da água; pilares descem até y = -1), torre de perfuração em treliça de aço e madeira com roda dentada, três tanques enferrujados com tubulações e válvulas, casinha de controle com chaminé e fumaça preta, guindaste, barris e bancada.',
    notes: '6 draw calls (Static_Mesh + Anim_Banners TeamColor 2 materiais + Anim_Drill + Anim_Crane + Anim_Smoke), atlas 2048². Pegada ~5 x 5, altura ~7,5. Nós animáveis: Anim_Banners, Anim_Smoke, Anim_Crane, Anim_Drill. Sockets: Socket_UnitSpawn, Socket_Rally.'
  },
  {
    id: 'ash_sanctum_glb',
    name: 'Santuário das Cinzas (Blender)',
    category: 'buildings',
    faction: 'orc',
    type: 'building',
    icon: '🔥',
    glb: 'ash_sanctum',
    sourceFile: 'tools/blender/build_ash_sanctum.py',
    create: createGlb('ash_sanctum'),
    description: 'Santuário orc gerado pelo pipeline Blender (public/models/ash_sanctum.glb).',
    notes: 'Sockets: Socket_UnitSpawn, Socket_Rally.'
  },
  {
    id: 'temple_glb',
    name: 'Templo da Luz (Blender)',
    category: 'buildings',
    faction: 'human',
    type: 'building',
    icon: '⛪',
    glb: 'temple',
    sourceFile: 'tools/blender/build_temple.py',
    create: createGlb('temple'),
    description: 'Templo humano gerado pelo pipeline Blender (public/models/temple.glb): capela cruciforme de mármore claro com pórtico de quatro colunas e frontão com sol de ouro, nave e transepto de telhado azul, vitrais coloridos, rosácea, tambor octogonal com janelas, cúpula dourada com lanterna e flecha com sol, estandartes em cor de time.',
    notes: '2 draw calls (Static_Mesh + Anim_Banners em cor de time), ~5,8 mil triângulos, atlas 1024², ~370 KB. Pegada ~6,7 x 7 (raio de colisão 3,4), altura ~9,4. Sockets: Socket_UnitSpawn, Socket_Rally.'
  },
  {
    id: 'storm_altar_glb',
    name: 'Altar das Tempestades (Blender)',
    category: 'buildings',
    faction: 'orc',
    type: 'building',
    icon: '⚡',
    glb: 'storm_altar',
    sourceFile: 'tools/blender/build_storm_altar.py',
    create: createGlb('storm_altar'),
    description: 'Altar orc gerado pelo pipeline Blender (public/models/storm_altar.glb): praça de basalto com círculo de runas ciano, seis menires com crânios, chifres e cristais, altar com crânio de ogro e cristais de tempestade em anel de ferro, pilão de chifres com cristal-mestre, raios congelados ligando os cristais, tambores de guerra, totens com estandartes e ossadas.',
    notes: '2 draw calls (Static_Mesh + Anim_Banners em cor de time), ~7,7 mil triângulos, atlas 1024², ~460 KB. Pegada ~6,6 x 6,6 (raio de colisão 3,4), altura ~8,5. Sockets: Socket_UnitSpawn, Socket_Rally.'
  },
  {
    id: 'watching_eye_glb',
    name: 'Olho Vigia (Blender)',
    category: 'units',
    faction: 'orc',
    type: 'watching_eye',
    icon: '👁️',
    glb: 'watching_eye',
    sourceFile: 'tools/blender/build_watching_eye.py',
    create: createGlb('watching_eye'),
    description: 'Olho voador invocado, gerado pelo pipeline Blender (public/models/watching_eye.glb): globo violeta com veias flutuando a ~2,4 u do chão, íris dourada com pupila em fenda e anel de ouro na frente (+Z), pálpebras pesadas, espinhos de osso, seis tentáculos articulados com ventosas pendurados em volta da metade de baixo do globo e barbatana em cor de time.',
    notes: 'Sem rig humanoide: Torso (nó no centro do globo; o UnitAnimator respira/balança o conjunto) > Body, Fin e Anim_Tentacle0..5 (pivôs articulados, cada um com a malha TentacleN em coordenadas locais; o UnitAnimator ondula rotation.x/z, mais ao se mover). ~1,7 mil triângulos, 8 draw calls, atlas 512², ~112 KB.'
  },
  {
    id: 'templar_glb',
    name: 'Templário (Blender)',
    category: 'units',
    faction: 'human',
    type: 'cavalier',
    icon: '🐎',
    glb: 'templar',
    sourceFile: 'tools/blender/build_templar.py',
    create: createGlb('templar'),
    description: 'Cavaleiro consagrado gerado a partir do Cavaleiro (public/models/templar.glb): armadura branca com frisos de ouro vivo, cavalo branco, tabardo e gualdrapa em cor de time com emblema de sol (também no escudo e no peitoral do cavalo, voltados para +Z), elmo com crista alta de plumas brancas e disco solar na testa.',
    notes: 'Mesma rig do Cavaleiro (Horse, HorseLeg*, Torso, Head, ArmL/ArmR, Sword, ShieldGroup). ~9 mil triângulos, 14 draw calls, atlas 512². Animações do UnitAnimator como `cavalier`.'
  },
  {
    id: 'ogre_mage_glb',
    name: 'Ogro Feiticeiro (Blender)',
    category: 'units',
    faction: 'orc',
    type: 'ogre',
    icon: '👹',
    glb: 'ogre_mage',
    sourceFile: 'tools/blender/build_ogre_mage.py',
    create: createGlb('ogre_mage'),
    description: 'Ogro xamã gerado a partir do Ogro (public/models/ogre_mage.glb): pele cinza-azulada com tinta ritual de raio luminosa, olhos elétricos, cabelo branco, cristal na testa, penacho de ossos e penas, colar de presas com cristal de tempestade no centro do peito e cajado de xamã com cristal de raio no lugar da clava.',
    notes: 'Mesma rig aninhada do Ogro (Weapon em ArmR). ~7 mil triângulos, 11 draw calls, atlas 512². Rosto só na face frontal (+Z).'
  },
  // F7-00b lote 1 (início)
  {
    id: 'glider_glb',
    name: 'Planador de Engenho (Blender)',
    category: 'units',
    faction: 'human',
    type: 'glider',
    icon: '🪁',
    glb: 'glider',
    sourceFile: 'tools/blender/build_glider.py',
    create: createGlb('glider'),
    description: 'Batedor aéreo humano gerado pelo pipeline Blender (public/models/glider.glb): casco de madeira em forma de barco com quilha e esqui, bico de latão com hélice, mastro com cordame, duas asas de pano em cor de time com nervuras, cauda com leme e piloto de capacete e óculos.',
    notes: 'Nós Torso (raiz), Head, WingL, WingR (batida de asas e bob do UnitAnimator.applyAir). ~2,9 mil triângulos, 7 draw calls, atlas 512², ~170 KB. Rosto só na frente (+Z).'
  },
  {
    id: 'war_balloon_glb',
    name: 'Balão de Guerra (Blender)',
    category: 'units',
    faction: 'orc',
    type: 'war_balloon',
    icon: '🎈',
    glb: 'war_balloon',
    sourceFile: 'tools/blender/build_war_balloon.py',
    create: createGlb('war_balloon'),
    description: 'Batedor aéreo orc gerado pelo pipeline Blender (public/models/war_balloon.glb): envelope de gomos abaulados (couro claro e ferrugem, remendos) com costuras de tiras de couro rebitadas, faixa de guerra serrilhada em cor de time com o crânio de presas, coroa de ferro com espinhos de osso, braseiro aceso na boca, cesta de vime com escada de corda, bombas e leme em cor de time, vigia com luneta e um segundo tripulante, hélice de popa de ossos.',
    notes: 'Nós Torso (envelope + cordas + braseiro), Basket (cesta, tripulação, bombas, leme; filho do Torso), Head (vigia) e Rotor (gira em z). ~7,5 mil triângulos, 6 draw calls (4 malhas: Atlas + TeamColor), atlas 512², ~286 KB. Rosto/crânio só na frente (+Z). Base em y ~ 0 (a simulação aplica flyHeight 4,5).'
  },
  {
    id: 'gryphon_rider_glb',
    name: 'Cavaleiro Grifo (Blender)',
    category: 'units',
    faction: 'human',
    type: 'gryphon_rider',
    icon: '🦅',
    glb: 'gryphon_rider',
    sourceFile: 'tools/blender/build_gryphon_rider.py',
    create: createGlb('gryphon_rider'),
    description: 'Ataque aéreo humano gerado pelo pipeline Blender (public/models/gryphon_rider.glb): grifo com corpo de leão, peito emplumado, cabeça de águia com bico em gancho, asas de penas em leque, sela com manta em cor de time e cavaleiro de aço com lança e flâmula.',
    notes: 'Nós Torso, Head, WingL, WingR. ~5,1 mil triângulos, 7 draw calls, atlas 512², ~270 KB.'
  },
  {
    id: 'gryphon_rider_v2_glb',
    name: 'Cavaleiro Grifo v2 (Tripo)',
    category: 'units',
    faction: 'human',
    type: 'gryphon_rider',
    icon: '🦅',
    glb: 'gryphon_rider_v2',
    sourceFile: 'tools/blender/build_gryphon_tripo.py',
    create: createGlb('gryphon_rider_v2'),
    description: 'Cavaleiro Grifo v2 (ART-GRIFO): grifo com anão-cavaleiro do Tripo finalizado no Blender (public/models/gryphon_rider_v2.glb). Cabeça de águia com bico dourado, peitoral de placas, corpo e cauda de leão, asas de penas, cavaleiro de elmo e martelo. Ombreiras e elmo do cavaleiro em TeamColor. É o padrão do jogo; o Cavaleiro Grifo (Blender) antigo continua como reserva.',
    notes: 'Nós GryphonRider > Torso > Head, WingL > WingTipL, WingR > WingTipR, Tail (pivôs no pescoço, ombros, cotovelos das asas e garupa). O UnitAnimator.applyAir bate WingL/WingR em z (ponta atrasada), ondula a cauda e na morte mergulha com as asas dobradas. ~7,6 mil triângulos, 9 draw calls, atlas 512², ~184 KB. Base em y ~ 0 (a simulação aplica flyHeight 4,5).'
  },
  {
    id: 'war_serpent_glb',
    name: 'Serpe de Guerra (Blender)',
    category: 'units',
    faction: 'orc',
    type: 'war_serpent',
    icon: '🐉',
    glb: 'war_serpent',
    sourceFile: 'tools/blender/build_war_serpent.py',
    create: createGlb('war_serpent'),
    description: 'Ataque aéreo orc gerado pelo pipeline Blender (public/models/war_serpent.glb): serpente alada de escamas verdes com ventre claro, crista dorsal de osso, couraça de ossos e ferro, sela com manta em cor de time, cabeça com presas, chifres e olhos âmbar na frente (+Z), asas de morcego com membrana em cor de time e ferrão de aço.',
    notes: 'Nós Torso, Head, WingL, WingR. ~2,1 mil triângulos, 8 draw calls, atlas 512², ~165 KB.'
  },
  {
    id: 'aviary_glb',
    name: 'Aviário de Grifos (Blender)',
    category: 'buildings',
    faction: 'human',
    type: 'building',
    icon: '🪺',
    glb: 'aviary',
    sourceFile: 'tools/blender/build_aviary.py',
    create: createGlb('aviary'),
    description: 'Aviário humano gerado pelo pipeline Blender (public/models/aviary.glb): torre de pedra com portão em arco e janelas de vitral, escada externa em espiral, plataforma de pouso de madeira com parapeito e dossel azul, ninho de gravetos com ovos, poleiros, grifos de pedra no portão, cochos e fardos.',
    notes: '2 draw calls (Static_Mesh + Anim_Banners em cor de time), ~7,4 mil triângulos, atlas 1024², ~410 KB. Pegada ~7 (raio de colisão 3,4), altura ~8,6. Sockets: Socket_UnitSpawn, Socket_Rally.'
  },
  {
    id: 'serpent_nest_glb',
    name: 'Ninho das Serpes (Blender)',
    category: 'buildings',
    faction: 'orc',
    type: 'building',
    icon: '🥚',
    glb: 'serpent_nest',
    sourceFile: 'tools/blender/build_serpent_nest.py',
    create: createGlb('serpent_nest'),
    description: 'Ninho orc gerado pelo pipeline Blender (public/models/serpent_nest.glb): anel de pilares de basalto, cratera de cinzas com leito de ossos e couro, ovos verdes brilhantes, presas gigantes, covil em arco de costelas com crânio, esqueleto de serpe, totens de crânios e estandartes esfarrapados.',
    notes: '2 draw calls (Static_Mesh + Anim_Banners em cor de time), ~6,2 mil triângulos, atlas 1024², ~345 KB. Pegada ~7 (raio de colisão 3,4), altura ~4,8. Sockets: Socket_UnitSpawn, Socket_Rally.'
  },
  {
    id: 'barracks_glb',
    name: 'Quartel de Infantaria (Blender)',
    category: 'buildings',
    faction: 'human',
    type: 'building',
    icon: '⚔️',
    glb: 'barracks',
    sourceFile: 'tools/blender/build_alliance_bld.py',
    create: createGlb('barracks'),
    description: 'Quartel humano (ART-ALI-3, modelo do Tripo): salão de enxaimel com telhado de ardósia, torreta de vigia com panos em cor de time e pátio de treino com bonecos e racks de armas voltado para +Z.',
    notes: '2 draw calls, ~7,2 mil triângulos, atlas 512², ~174 KB. Pegada ~6,9 x 7,4 (raio de colisão 3,5), altura ~5,8. Sockets: Socket_UnitSpawn, Socket_Rally.'
  },
  {
    id: 'forge_glb',
    name: 'Forja Real (Blender)',
    category: 'buildings',
    faction: 'human',
    type: 'building',
    icon: '🔨',
    glb: 'forge',
    sourceFile: 'tools/blender/build_forge.py',
    create: createGlb('forge'),
    description: 'Forja humana gerada pelo pipeline Blender (public/models/forge.glb): oficina de pedra com fornalha em arco e brasas, chaminé alta de pedra, telhado azul, bigorna sobre cepo com ferro em brasa, cocho de têmpera, lingotes e rack de espadas.',
    notes: '2 draw calls, ~3,3 mil triângulos, atlas 1024², ~237 KB. Pegada ~6,6 (raio 3,4), altura ~7,3.'
  },
  {
    id: 'cottage_glb',
    name: 'Casa Residencial (Blender)',
    category: 'buildings',
    faction: 'human',
    type: 'building',
    icon: '🏠',
    glb: 'cottage',
    sourceFile: 'tools/blender/build_alliance_bld.py',
    create: createGlb('cottage'),
    description: 'Casa humana (ART-ALI-3, modelo do Tripo): enxaimel sobre pé de pedra, telhado de ardósia, chaminé de pedra no lado +X (fumaça do jogo) e porta dupla voltada para +Z.',
    notes: '1 draw call (sem faces TeamColor: o modelo não tem pano/bandeira), ~7,2 mil triângulos, atlas 512², ~147 KB. Pegada ~5 x 4,7 (raio 2,8), altura ~5,6.'
  },
  {
    id: 'farm_glb',
    name: 'Fazenda de Trigo (Blender)',
    category: 'buildings',
    faction: 'human',
    type: 'building',
    icon: '🌾',
    glb: 'farm',
    sourceFile: 'tools/blender/build_farm.py',
    create: createGlb('farm'),
    description: 'Fazenda humana gerada pelo pipeline Blender (public/models/farm.glb): celeiro de enxaimel com palha e talha, galpão lateral, poço de pedra, campo sulcado de trigo, cerca de ripas, fardos e sacos.',
    notes: '2 draw calls, ~5,4 mil triângulos, atlas 1024², ~353 KB. Pegada ~6 (raio 2,8), altura ~3,9.'
  },
  {
    id: 'lumber_camp_glb',
    name: 'Serraria Florestal (Blender)',
    category: 'buildings',
    faction: 'human',
    type: 'building',
    icon: '🪵',
    glb: 'lumber_camp',
    sourceFile: 'tools/blender/build_alliance_bld.py',
    create: createGlb('lumber_camp'),
    description: 'Serraria humana (ART-ALI-3, modelo do Tripo): galpão de enxaimel com roda d\'água, serra circular sobre cavalete e pilhas de toras na frente (+Z); remendos azuis do telhado em cor de time.',
    notes: '2 draw calls, ~7,2 mil triângulos, atlas 512², ~170 KB. Pegada ~7,8 x 5,9 (raio de colisão 3,2), altura ~3,7.'
  },
  {
    id: 'watchtower_glb',
    name: 'Torre de Vigia (Blender)',
    category: 'buildings',
    faction: 'human',
    type: 'building',
    icon: '🗼',
    glb: 'watchtower',
    sourceFile: 'tools/blender/build_watchtower.py',
    create: createGlb('watchtower'),
    description: 'Torre de vigia humana gerada pelo pipeline Blender (public/models/watchtower.glb): fuste octogonal de pedra com contrafortes e seteiras, galeria de madeira em balanço com parapeito e escudos em cor de time, telhado cônico azul, braseiro e escada de mão.',
    notes: '2 draw calls, ~6,3 mil triângulos, atlas 1024², ~371 KB. Pegada ~4 (raio 2), altura ~10; galeria em y 5,8 (origem do disparo 6,8).'
  },
  {
    id: 'great_hall_glb',
    name: 'Grande Salão Orc (Blender)',
    category: 'buildings',
    faction: 'orc',
    type: 'building',
    icon: '🏰',
    glb: 'great_hall',
    sourceFile: 'tools/blender/build_great_hall.py',
    create: createGlb('great_hall'),
    description: 'QG orc gerado pelo pipeline Blender (public/models/great_hall.glb): salão monumental de toras com telhado de placas de ferro e crista de chifres, pátio de paliçada com quatro bastiões, portão de presas com crânio, braseiros e racks de armas.',
    notes: '5 draw calls (estática + 4 nós Anim_WarBanner_* animados pelo GreatHall.js), ~13,8 mil triângulos, atlas 1024², ~560 KB. Pegada ~11 (raio 5,5; paliçada de meia-largura 4,2), altura ~10,2.'
  },
  {
    id: 'orc_barracks_glb',
    name: 'Quartel dos Clãs (Blender)',
    category: 'buildings',
    faction: 'orc',
    type: 'building',
    icon: '🛡️',
    glb: 'orc_barracks',
    sourceFile: 'tools/blender/build_orc_barracks.py',
    create: createGlb('orc_barracks'),
    description: 'Quartel orc gerado pelo pipeline Blender (public/models/orc_barracks.glb): arena de treino com paliçada, plataformas de guarda, portão de presas, salão de toras com telhado de peles, racks, pedra de afiar e forca com o boneco Anim_TrainingDummy.',
    notes: '3 draw calls, ~8,4 mil triângulos, atlas 1024², ~390 KB. Pegada ~7,2 (raio 3,6; pegada encolhida por 0,88), altura ~5,3. Nó Anim_TrainingDummy (pivô (2,5; 3,8; 1,2)).'
  },
  {
    id: 'orc_forge_glb',
    name: 'Forja de Guerra Orc (Blender)',
    category: 'buildings',
    faction: 'orc',
    type: 'building',
    icon: '🔥',
    glb: 'orc_forge',
    sourceFile: 'tools/blender/build_orc_forge.py',
    create: createGlb('orc_forge'),
    description: 'Forja orc gerada pelo pipeline Blender (public/models/orc_forge.glb): alto-forno de basalto com boca em arco e chaminé escalonada até y ~9,5, galpão de toras com telhado de ferro, bigorna, cocho de têmpera e lingotes.',
    notes: '2 draw calls, ~4,5 mil triângulos, atlas 1024², ~272 KB. Chamas animadas somadas pelo OrcForge.js em (−1,4; 1,6; 0,6).'
  },
  {
    id: 'orc_house_glb',
    name: 'Toca Orc (Blender)',
    category: 'buildings',
    faction: 'orc',
    type: 'building',
    icon: '🛖',
    glb: 'orc_house',
    sourceFile: 'tools/blender/build_orc_house.py',
    create: createGlb('orc_house'),
    description: 'Toca orc gerada pelo pipeline Blender (public/models/orc_house.glb): cabana octogonal de toras sobre basalto, telhado cônico de peles com costelas de osso, chaminé, arco de costelas, lenha e crânio troféu.',
    notes: '2 draw calls, ~3,6 mil triângulos, atlas 1024², ~241 KB. Pegada ~5,4 (raio 2,8), altura ~5,4.'
  },
  {
    id: 'pig_farm_glb',
    name: 'Cercado de Javalis (Blender)',
    category: 'buildings',
    faction: 'orc',
    type: 'building',
    icon: '🐗',
    glb: 'pig_farm',
    sourceFile: 'tools/blender/build_pig_farm.py',
    create: createGlb('pig_farm'),
    description: 'Criatório orc gerado pelo pipeline Blender (public/models/pig_farm.glb): curral de paliçada com porteira, lama, galpão de toras com palha, cochos e poste de abate. Os javalis do cercado são criados em tempo de execução por PigFarm.js.',
    notes: '2 draw calls (o cercado em jogo soma 3 javalis procedurais de 4 malhas cada = 14), ~5,1 mil triângulos, atlas 512² (M2-13: era 1024², regenerado com ATLAS=512), ~196 KB. Pegada ~6 (raio 2,8), altura ~4,3.'
  },
  {
    id: 'orc_lumber_mill_glb',
    name: 'Serraria Mecânica Orc (Blender)',
    category: 'buildings',
    faction: 'orc',
    type: 'building',
    icon: '🪚',
    glb: 'orc_lumber_mill',
    sourceFile: 'tools/blender/build_orc_lumber_mill.py',
    create: createGlb('orc_lumber_mill'),
    description: 'Serraria orc gerada pelo pipeline Blender (public/models/orc_lumber_mill.glb): plataforma de toras, galpão em A com telhado de placas de ferro, cavalete com tronco, guindaste, pirâmide de toras e serra circular Anim_SawBlade (gira em X no OrcLumberMill.js).',
    notes: '3 draw calls, ~4,5 mil triângulos, atlas 1024², ~276 KB. Anim_SawBlade com pivô (0; 1,6; 0,4), raio 1,2.'
  },
  {
    id: 'orc_watchtower_glb',
    name: 'Torre de Vigia Orc (Blender)',
    category: 'buildings',
    faction: 'orc',
    type: 'building',
    icon: '🗼',
    glb: 'orc_watchtower',
    sourceFile: 'tools/blender/build_orc_watchtower.py',
    create: createGlb('orc_watchtower'),
    description: 'Torre orc gerada pelo pipeline Blender (public/models/orc_watchtower.glb): quatro troncos inclinados com travessas e escoras, paredes de tábuas e toras, plataforma de arqueiros com parapeito de espinhos e braseiro central.',
    notes: '2 draw calls, ~6,3 mil triângulos, atlas 1024², ~326 KB. Pegada ~4,5 (raio 2), altura ~10; chama animada em (0; 8,4; 0) pelo OrcWatchtower.js.'
  },
  {
    id: 'gold_mine_glb',
    name: 'Mina de Ouro (Blender)',
    category: 'buildings',
    type: 'building',
    icon: '🪙',
    glb: 'gold_mine',
    sourceFile: 'tools/blender/build_gold_mine.py',
    create: createGlb('gold_mine'),
    description: 'Mina de ouro neutra gerada pelo pipeline Blender (public/models/gold_mine.glb): morro de rocha escura em ferradura com picos facetados, veios e cristais de ouro, portal de vigas de carvalho com dossel e túnel negro, trilhos com vagoneta transbordando de pepitas, lanterna acesa, caixotes, barril, picaretas e pá.',
    notes: '1 draw call (sem cor de time), ~5,4 mil triângulos, atlas 1024², ~353 KB. Pegada ~7 (raio de colisão 3,4), altura ~4,6. Usada pelo ResourceDepositView.'
  },
  {
    id: 'stone_quarry_glb',
    name: 'Pedreira (Blender)',
    category: 'buildings',
    type: 'building',
    icon: '🪨',
    glb: 'stone_quarry',
    sourceFile: 'tools/blender/build_stone_quarry.py',
    create: createGlb('stone_quarry'),
    description: 'Pedreira neutra gerada pelo pipeline Blender (public/models/stone_quarry.glb): paredão de calcário em três patamares com estratos e faces recém-cortadas, penhasco escuro, derrick de madeira com talha e bloco em linga, cabrestante, pilha de blocos aparelhados, bloco rachado com cunhas, carrinho de mão, escada e ferramentas.',
    notes: '1 draw call (sem cor de time), ~2,7 mil triângulos, atlas 1024², ~232 KB. Pegada ~6,4 (raio de colisão 3,0), altura ~4,7.'
  },
  {
    id: 'bandit_camp_glb',
    name: 'Acampamento Bandido (Blender)',
    category: 'buildings',
    type: 'building',
    icon: '⛺',
    glb: 'bandit_camp',
    sourceFile: 'tools/blender/build_bandit_camp.py',
    create: createGlb('bandit_camp'),
    description: 'Acampamento hostil neutro gerado pelo pipeline Blender (public/models/bandit_camp.glb): muro contínuo de toras pontiagudas (alto nos fundos, caído e aberto para a câmera do jogo), portão com dois mourões-totem de crânios, verga com dentes de osso e crânio de ogro com presas e batentes abertos, torre de vigia sobre pernas com teto carmesim, tenda de guerra de cumeeira com remendos, abrigo de peles, fogueira com caldeirão, baú de saque, rack de armas, barris e dois mastros de estandarte.',
    notes: '2 draw calls (Static_Mesh + Anim_Banners TeamColor; o jogo pinta as faixas com a cor dos neutros), ~12,4 mil triângulos, atlas 1024², ~530 KB. Pegada ~8,4 (raio de colisão 4,2), altura ~6,6 (torre). Sockets: Socket_UnitSpawn, Socket_Rally. Frente (portão) em +Z.'
  },
  {
    id: 'tree_oak_glb',
    name: 'Carvalho (Blender)',
    category: 'environment',
    type: 'nature',
    icon: '🌳',
    glb: 'tree_oak',
    sourceFile: 'tools/blender/build_trees.py',
    create: createGlb('tree_oak'),
    description: 'Carvalho do mapa gerado pelo pipeline Blender (public/models/tree_oak.glb): tronco com raízes e galhos e sete copas facetadas com luz e sombra pintadas. Usado em InstancedMesh pelo TreeManager.',
    notes: '1 draw call (uma malha, atlas 512²), ~570 triângulos, ~56 KB. Substituiu as 2 malhas procedurais (tronco e copa, ~480 triângulos) e as texturas de 2048² geradas no carregamento (removidas na F7-00b). `?glbtrees=0`/`?glb=0` usam a árvore reserva de uma cor do TreeManager.'
  },
  {
    id: 'tree_pine_glb',
    name: 'Pinheiro (Blender)',
    category: 'environment',
    type: 'nature',
    icon: '🌲',
    glb: 'tree_pine',
    sourceFile: 'tools/blender/build_trees.py',
    create: createGlb('tree_pine'),
    description: 'Pinheiro do mapa gerado pelo pipeline Blender (public/models/tree_pine.glb): tronco com raízes e cinco camadas de agulhas facetadas com ponta.',
    notes: '1 draw call, ~160 triângulos, atlas 512², ~31 KB.'
  },
  {
    id: 'tree_autumn_glb',
    name: 'Carvalho de Outono (Blender)',
    category: 'environment',
    type: 'nature',
    icon: '🍂',
    glb: 'tree_autumn',
    sourceFile: 'tools/blender/build_trees.py',
    create: createGlb('tree_autumn'),
    description: 'Carvalho de outono (mesma malha do carvalho, copas alaranjadas) gerado pelo pipeline Blender (public/models/tree_autumn.glb).',
    notes: '1 draw call, ~570 triângulos, atlas 512², ~64 KB.'
  },
  {
    id: 'tree_birch_glb',
    name: 'Bétula (Blender)',
    category: 'environment',
    type: 'nature',
    icon: '🌿',
    glb: 'tree_birch',
    sourceFile: 'tools/blender/build_birch.py',
    create: createGlb('tree_birch'),
    description: 'Bétula do mapa gerada pelo pipeline Blender (public/models/tree_birch.glb): tronco esguio de curva suave com base alargada, casca branco-giz com lenticelas escuras horizontais (padrão procedural assado no atlas), dez galhos finos e dez copas facetadas verde-limão em três andares. `species: "birch"` nos mapas; instanciada pelo TreeManager sob demanda (só existe o InstancedMesh se o mapa tiver bétulas).',
    notes: '1 draw call, ~820 triângulos, atlas 512², ~80 KB, altura ~6,8. Substituiu a bétula procedural (2 malhas e texturas de 2048² geradas no carregamento; removida na F7-00b). `?glbtrees=0`/`?glb=0` usam a árvore reserva de uma cor do TreeManager.'
  },
  {
    id: 'rock_granite_large_glb',
    name: 'Rocha de Granito Grande (Blender)',
    category: 'environment',
    type: 'nature',
    icon: '🪨',
    glb: 'rock_granite_large',
    sourceFile: 'tools/blender/build_props_rochas_cactos.py',
    create: createGlb('rock_granite_large'),
    description: 'Maciço de granito grande (ART-01): facetas, topo claro, lados sombreados. 661 triângulos, atlas 512², 3,9 × 3,4 m.',
    notes: 'Prop de bioma de deserto, savana e exuberante. 1 draw call, enterrado 0,30 m.',
  },
  {
    id: 'rock_granite_medium_glb',
    name: 'Rocha de Granito Média (Blender)',
    category: 'environment',
    type: 'nature',
    icon: '🪨',
    glb: 'rock_granite_medium',
    sourceFile: 'tools/blender/build_props_rochas_cactos.py',
    create: createGlb('rock_granite_medium'),
    description: 'Rocha de granito média (ART-01). 203 triângulos, atlas 512², 1,6 × 1,5 m.',
    notes: '1 draw call.',
  },
  {
    id: 'rock_granite_small_glb',
    name: 'Rocha de Granito Pequena (Blender)',
    category: 'environment',
    type: 'nature',
    icon: '🪨',
    glb: 'rock_granite_small',
    sourceFile: 'tools/blender/build_props_rochas_cactos.py',
    create: createGlb('rock_granite_small'),
    description: 'Rocha de granito pequena (ART-01). 83 triângulos, atlas 256², 0,6 × 0,55 m.',
    notes: '1 draw call.',
  },
  {
    id: 'cactus_1_glb',
    name: 'Cacto Colunar (Blender)',
    category: 'environment',
    type: 'nature',
    icon: '🌵',
    glb: 'cactus_1',
    sourceFile: 'tools/blender/build_props_rochas_cactos.py',
    create: createGlb('cactus_1'),
    description: 'Cacto colunar com dois braços (ART-03). 1 260 triângulos, atlas 512², 3,3 m de altura.',
    notes: '1 draw call.',
  },
  {
    id: 'cactus_2_glb',
    name: 'Cacto Baixo (Blender)',
    category: 'environment',
    type: 'nature',
    icon: '🌵',
    glb: 'cactus_2',
    sourceFile: 'tools/blender/build_props_rochas_cactos.py',
    create: createGlb('cactus_2'),
    description: 'Cacto baixo de um braço (ART-03). 712 triângulos, atlas 512², 1,8 m de altura.',
    notes: '1 draw call.',
  },
  {
    id: 'bones_glb',
    name: 'Ossada (Blender)',
    category: 'environment',
    type: 'nature',
    icon: '🦴',
    glb: 'bones',
    sourceFile: 'tools/blender/build_props_rochas_cactos.py',
    create: createGlb('bones'),
    description: 'Ossada de animal sobre o chão (ART-03). 1 694 triângulos, atlas 512², 2,4 × 2,9 m.',
    notes: '1 draw call.',
  },
  {
    id: 'coast_shell_glb',
    name: 'Concha de Vieira (Blender)',
    category: 'environment',
    type: 'nature',
    icon: '🐚',
    glb: 'coast_shell',
    sourceFile: 'tools/blender/build_props_costa.py',
    create: createGlb('coast_shell'),
    description: 'Concha de vieira com uma menor ao lado (M2-16). 300 triângulos, atlas 128², ~0,5 m. Praias de areia e costa de grama/savana.',
    notes: '1 draw call (instanciado por src/world/CoastProps.js).',
  },
  {
    id: 'coast_starfish_glb',
    name: 'Estrela-do-mar (Blender)',
    category: 'environment',
    type: 'nature',
    icon: '⭐',
    glb: 'coast_starfish',
    sourceFile: 'tools/blender/build_props_costa.py',
    create: createGlb('coast_starfish'),
    description: 'Estrela-do-mar de cinco braços (M2-16). 416 triângulos, atlas 128², ~0,38 m. Na areia molhada junto à água.',
    notes: '1 draw call (instanciado por src/world/CoastProps.js).',
  },
  {
    id: 'coast_reed_glb',
    name: 'Caniço (Blender)',
    category: 'environment',
    type: 'nature',
    icon: '🌾',
    glb: 'coast_reed',
    sourceFile: 'tools/blender/build_props_costa.py',
    create: createGlb('coast_reed'),
    description: 'Touceira de caniço com três espigas (M2-16). 351 triângulos, atlas 256², ~1,8 m. Margem de pântano, grama e floresta.',
    notes: '1 draw call (instanciado por src/world/CoastProps.js).',
  },
  {
    id: 'coast_wreck_glb',
    name: 'Barco Naufragado (Blender)',
    category: 'environment',
    type: 'nature',
    icon: '⚓',
    glb: 'coast_wreck',
    sourceFile: 'tools/blender/build_props_costa.py',
    create: createGlb('coast_wreck'),
    description: 'Casco de barco naufragado: quilha, cavernas, tábuas e mastro quebrado (M2-16). 508 triângulos, atlas 256², ~4,4 m. Raro, em água rasa de costa de areia.',
    notes: '1 draw call (instanciado por src/world/CoastProps.js).',
  },
  {
    id: 'tree_broad_glb',
    name: 'Árvore Larga (Blender)',
    category: 'environment',
    type: 'nature',
    icon: '🌳',
    glb: 'tree_broad',
    sourceFile: 'tools/blender/build_vegetacao_seca_arvores.py',
    create: createGlb('tree_broad'),
    description: 'Árvore de copa larga, variante alta (ART-02). 1 486 triângulos, atlas 512², 6,7 × 8,7 m.',
    notes: '1 draw call. Sem cor de vértice (o TreeManager tinge por instância). Ainda não entra no mapa: falta integração de espécie.',
  },
  {
    id: 'tree_palm_glb',
    name: 'Palmeira (Blender)',
    category: 'environment',
    type: 'nature',
    icon: '🌴',
    glb: 'tree_palm',
    sourceFile: 'tools/blender/build_vegetacao_seca_arvores.py',
    create: createGlb('tree_palm'),
    description: 'Palmeira com tronco curvo e fronde (ART-02). 1 116 triângulos, atlas 512², 5,9 × 7,7 m.',
    notes: '1 draw call. A copa fica ~1,6 ao lado do pé: no jogo o impostor de LOD desloca a copa junto e o hit-proxy ganha um 2º cilindro na copa (M2-10); a colisão fica no pé.',
  },
  {
    id: 'tree_acacia_glb',
    name: 'Acácia (Blender)',
    category: 'environment',
    type: 'nature',
    icon: '🌳',
    glb: 'tree_acacia',
    sourceFile: 'tools/blender/build_vegetacao_seca_arvores.py',
    create: createGlb('tree_acacia'),
    description: 'Acácia de copa achatada em guarda-chuva (ART-02). 1 344 triângulos, atlas 512², 6,8 × 6,6 m.',
    notes: '1 draw call. Ainda não entra no mapa: falta integração de espécie.',
  },
  {
    id: 'grass_dry_glb',
    name: 'Capim Seco (Blender)',
    category: 'environment',
    type: 'nature',
    icon: '🌾',
    glb: 'grass_dry',
    sourceFile: 'tools/blender/build_vegetacao_seca_arvores.py',
    create: createGlb('grass_dry'),
    description: 'Tufo de capim seco (ART-03). 168 triângulos, atlas 256², 1,8 × 0,9 m.',
    notes: '1 draw call.',
  },
  {
    id: 'rock_sandstone_a_glb',
    name: 'Mesa de Arenito (Blender)',
    category: 'environment',
    type: 'nature',
    icon: '🪨',
    glb: 'rock_sandstone_a',
    sourceFile: 'tools/blender/build_props_biomas.py',
    create: createGlb('rock_sandstone_a'),
    description: 'Mesa de arenito em estratos (ART-01, M2-12): quatro camadas ocre-avermelhadas deslocadas, a de cima mais larga (capa), topo claro e dois matacões no pé. 293 triângulos, atlas 512², 2,7 × 2,0 m, 2,0 m de altura.',
    notes: 'Prop de deserto, estepe e savana (`PROP_RULES`, colocado por `planProps`). 1 draw call, enterrado 0,28 m.',
  },
  {
    id: 'rock_sandstone_b_glb',
    name: 'Pedra de Arenito (Blender)',
    category: 'environment',
    type: 'nature',
    icon: '🪨',
    glb: 'rock_sandstone_b',
    sourceFile: 'tools/blender/build_props_biomas.py',
    create: createGlb('rock_sandstone_b'),
    description: 'Pedra baixa de arenito (ART-01, M2-12): três camadas, um bloco quebrado caído e uma lasca. 303 triângulos, atlas 512², 1,9 × 1,3 m, 1,0 m de altura.',
    notes: 'Prop de deserto, estepe e savana. 1 draw call, enterrado 0,18 m.',
  },
  {
    id: 'rock_basalt_a_glb',
    name: 'Colunas de Basalto A (Blender)',
    category: 'environment',
    type: 'nature',
    icon: '🪨',
    glb: 'rock_basalt_a',
    sourceFile: 'tools/blender/build_props_biomas.py',
    create: createGlb('rock_basalt_a'),
    description: 'Cluster de dez colunas hexagonais de basalto (ART-06, M2-14), a central a mais alta (2,2 m), topos inclinados e juntas irregulares. 160 triângulos, atlas 512², 2,7 × 2,8 m.',
    notes: 'Prop vulcânico (`PROP_RULES`; Fornalha). 1 draw call, enterrado 0,30 m. Paleta de `vulcanico`.',
  },
  {
    id: 'rock_basalt_b_glb',
    name: 'Colunas de Basalto B (Blender)',
    category: 'environment',
    type: 'nature',
    icon: '🪨',
    glb: 'rock_basalt_b',
    sourceFile: 'tools/blender/build_props_biomas.py',
    create: createGlb('rock_basalt_b'),
    description: 'Colunas baixas de basalto (ART-06, M2-14): cinco de pé em meia-lua, uma tombada e um toco. 116 triângulos, atlas 512², 2,6 × 2,1 m, 1,2 m de altura.',
    notes: 'Prop vulcânico. 1 draw call.',
  },
  {
    id: 'volcano_cone_glb',
    name: 'Cone Vulcânico (Blender)',
    category: 'environment',
    type: 'nature',
    icon: '🌋',
    glb: 'volcano_cone',
    sourceFile: 'tools/blender/build_props_biomas.py',
    create: createGlb('volcano_cone'),
    description: 'Cone vulcânico pequeno (ART-06, M2-14): dez faces irregulares, borda de cratera com dois dentes, boca de lava laranja e três filetes de lava na encosta. 146 triângulos, atlas 512², 3,6 m de diâmetro, 1,05 m de altura visível.',
    notes: 'Prop vulcânico. 1 draw call. A lava é cor assada no atlas (o render emissivo animado é o de `lavaRender`, só do rio de lava).',
  },
  {
    id: 'tree_burnt_glb',
    name: 'Árvore Queimada (Blender)',
    category: 'environment',
    type: 'nature',
    icon: '🌳',
    glb: 'tree_burnt',
    sourceFile: 'tools/blender/build_props_biomas.py',
    create: createGlb('tree_burnt'),
    description: 'Árvore queimada (ART-06, M2-14): tronco carbonizado que afina até uma ponta quebrada, cinco galhos secos, raízes expostas e um galho caído; brasas laranja nas trincas e no pé (pintura). 314 triângulos, atlas 512², 4,1 m de altura.',
    notes: 'Prop vulcânico, sem folhas. 1 draw call. Não é espécie de `TreeManager`: instanciada como decoração.',
  },
  {
    id: 'fumarole_glb',
    name: 'Fumarola (Blender)',
    category: 'environment',
    type: 'nature',
    icon: '💨',
    glb: 'fumarole',
    sourceFile: 'tools/blender/build_props_biomas.py',
    create: createGlb('fumarole'),
    description: 'Respiradouro vulcânico (ART-06, M2-14): monte baixo de basalto com anel de crosta de enxofre, boca escura, cinco cristais amarelos e três pedras soltas. 242 triângulos, atlas 512², 3,0 m de diâmetro, 0,8 m de altura. Só a malha base: o vapor é da M2-18.',
    notes: 'Prop vulcânico. 1 draw call.',
  },
  {
    id: 'obsidian_glb',
    name: 'Obsidiana (Blender)',
    category: 'environment',
    type: 'nature',
    icon: '💎',
    glb: 'obsidian',
    sourceFile: 'tools/blender/build_props_biomas.py',
    create: createGlb('obsidian'),
    description: 'Aglomerado de nove cristais de obsidiana (ART-06, M2-14): prismas hexagonais pontiagudos, quase pretos, com brilho nas arestas (pintura) e rugosidade baixa. 252 triângulos, atlas 512², 1,9 m de largura, 1,55 m de altura.',
    notes: 'Prop vulcânico. 1 draw call, roughness 0,28.',
  },
  {
    id: 'ice_block_small_glb',
    name: 'Bloco de Gelo (Blender)',
    category: 'environment',
    type: 'nature',
    icon: '🧊',
    glb: 'ice_block_small',
    sourceFile: 'tools/blender/build_props_biomas.py',
    create: createGlb('ice_block_small'),
    description: 'Bloco de gelo pequeno (ART-07, M2-15): dois cristais facetados encostados e uma lasca, azul-gelo com veios e topo branco-azulado. 178 triângulos, atlas 512², 1,5 × 1,3 m, 1,2 m de altura.',
    notes: 'Prop de gelo e neve (`PROP_RULES`; A Geada). 1 draw call, roughness 0,25.',
  },
  {
    id: 'ice_block_large_glb',
    name: 'Iceberg (Blender)',
    category: 'environment',
    type: 'nature',
    icon: '🧊',
    glb: 'ice_block_large',
    sourceFile: 'tools/blender/build_props_biomas.py',
    create: createGlb('ice_block_large'),
    description: 'Iceberg (ART-07, M2-15): cinco monólitos de gelo de pontas diferentes (o central de 3 m) e lascas no pé. 395 triângulos, atlas 512², 3,9 × 2,7 m, 3,0 m de altura.',
    notes: 'Prop de gelo e neve. 1 draw call, roughness 0,25.',
  },
  {
    id: 'tree_pine_snow_glb',
    name: 'Pinheiro Nevado (Blender)',
    category: 'environment',
    type: 'nature',
    icon: '🌲',
    glb: 'tree_pine_snow',
    sourceFile: 'tools/blender/build_props_biomas.py',
    create: createGlb('tree_pine_snow'),
    description: 'Pinheiro nevado (ART-07, M2-15): a silhueta de `tree_pine` (tronco e cinco andares de cone) em agulhas frias, com uma capa de neve em cada andar e na ponta. 182 triângulos, atlas 512², 7,4 m de altura.',
    notes: 'Decoração de neve (não é espécie de `TreeManager`: sem colisão). 1 draw call.',
  },
  {
    id: 'rock_snow_glb',
    name: 'Rocha com Neve (Blender)',
    category: 'environment',
    type: 'nature',
    icon: '🪨',
    glb: 'rock_snow',
    sourceFile: 'tools/blender/build_props_biomas.py',
    create: createGlb('rock_snow'),
    description: 'Rocha com capa de neve (ART-07, M2-15): matacão com dois vizinhos; a neve cobre as faces que olham para cima e deixa a rocha fria nas íngremes. 209 triângulos, atlas 512², 2,3 × 2,0 m, 1,0 m de altura.',
    notes: 'Prop de neve, gelo e rocha. 1 draw call, enterrado 0,20 m.',
  },
  {
    id: 'fern_glb',
    name: 'Samambaia (Blender)',
    category: 'environment',
    type: 'nature',
    icon: '🌿',
    glb: 'fern',
    sourceFile: 'tools/blender/build_props_biomas.py',
    create: createGlb('fern'),
    description: 'Samambaia (ART-10, M2-17): roseta de onze frondes com margem recortada e nervura clara, as jovens de pé no centro e as maduras arqueando para fora. 363 triângulos, atlas 512², 2,6 m de diâmetro, 0,7 m de altura. Superfícies abertas (material de dupla face).',
    notes: 'Sub-bosque de floresta, grama exuberante e pântano (`PROP_RULES`; Cerne Verde, Brejo Mudo). 1 draw call.',
  },
  {
    id: 'log_fallen_glb',
    name: 'Tronco Caído (Blender)',
    category: 'environment',
    type: 'nature',
    icon: '🪵',
    glb: 'log_fallen',
    sourceFile: 'tools/blender/build_props_biomas.py',
    create: createGlb('log_fallen'),
    description: 'Tronco caído (ART-10, M2-17): 3,3 m deitado, uma ponta cortada com miolo claro e a outra em lascas, dois tocos de galho, musgo no topo e cogumelo-prateleira. 326 triângulos, atlas 512², 3,8 × 0,9 m.',
    notes: 'Sub-bosque de floresta, grama e pântano. 1 draw call, 0,8 m de altura.',
  },
  {
    id: 'log_drowned_glb',
    name: 'Tronco Afogado (Blender)',
    category: 'environment',
    type: 'nature',
    icon: '🪵',
    glb: 'log_drowned',
    sourceFile: 'tools/blender/build_props_biomas.py',
    create: createGlb('log_drowned'),
    description: 'Tronco afogado (ART-10, M2-17): inclinado, com a ponta de baixo na lama e a de cima erguida (~1,2 m), dois galhos quebrados, limo, musgo e três cogumelos-prateleira. 344 triângulos, atlas 512², 3,4 m de comprimento, 1,7 m de altura.',
    notes: 'Pântano, nas margens baixas (afunda 0,1 m). 1 draw call.',
  },
  {
    id: 'mangrove_root_glb',
    name: 'Raiz de Mangue (Blender)',
    category: 'environment',
    type: 'nature',
    icon: '🌳',
    glb: 'mangrove_root',
    sourceFile: 'tools/blender/build_props_biomas.py',
    create: createGlb('mangrove_root'),
    description: 'Raiz de mangue (ART-10, M2-17): tronco curto e torto, seis raízes-escora em arco enterradas em volta e uma pequena copa verde-escura. 371 triângulos, atlas 512², 2,6 m de largura, 2,2 m de altura.',
    notes: 'Pântano, nas margens baixas (afunda 0,1 m). 1 draw call.',
  },
  {
    id: 'tumbleweed_glb',
    name: 'Arbusto Rolante (Blender)',
    category: 'environment',
    type: 'nature',
    icon: '🌿',
    glb: 'tumbleweed',
    sourceFile: 'tools/blender/build_vegetacao_seca_arvores.py',
    create: createGlb('tumbleweed'),
    description: 'Arbusto rolante de galhos secos (ART-03, enxugado na M2-12). 509 triângulos (eram 1 709), atlas 256², 0,86 m de diâmetro.',
    notes: '1 draw call. Prop de deserto, estepe e savana (`PROP_RULES`).',
  },
  {
    id: 'critter_boar_glb',
    name: 'Javali (Blender)',
    category: 'environment',
    faction: 'neutral',
    type: 'nature',
    icon: '🐗',
    glb: 'critter_boar',
    sourceFile: 'tools/blender/build_critter_boar.py',
    create: createGlb('critter_boar'),
    description: 'Javali selvagem neutro (ART-04): tronco em cunha, crina de cerdas, focinho rosado e presas curtas, pernas curtas com cascos. Já é o modelo do jogo (CritterView, M2-13) com animações de andar, pastar e correr (nós Body, Head, Leg_*); o procedural é só reserva.',
    notes: '6 draw calls (Body, Head e 4 pernas), 1 172 triângulos, atlas 512², escala ×1,4 na geometria: 0,51 × 0,84 × 1,87 m (L × A × P), frente em +Z. No jogo, CritterView aplica mais ×1,4: ~2,61 m de comprimento, como o procedural (2,58 m). Animação por rotação dos nós: no inspetor alterna andar, pastar e correr (?critter=walk, graze, run, idle ou dead fixa o estado).',
  },
  {
    id: 'wall_human_glb',
    name: 'Muralha de Pedra (Blender)',
    category: 'buildings',
    faction: 'human',
    type: 'building',
    icon: '🧱',
    glb: 'wall_human',
    sourceFile: 'tools/blender/build_walls.py',
    create: createGlb('wall_human'),
    description: 'Bloco de muralha humana gerado pelo pipeline Blender (public/models/wall_human.glb): pé escuro enterrado, corpo de alvenaria com seteiras emolduradas, cordão e mísulas, cornija e ameias nos cantos. A pegada é o passo WALL_STEP (2,4): o bloco vizinho encosta rente, sem vão, e as ameias de cantos vizinhos viram uma ameia de 1,2 com vão de 1,2. O WallBatch instancia a geometria e o material deste .glb.',
    notes: '1 draw call, ~616 triângulos, atlas 512², ~49 KB. Bloco de 2,4 × 2,4 (rente à célula) × 2,5 de altura, com 0,55 enterrado (relevo em desnível não mostra frestas). Fileira de 5 blocos: tools/ui-captures/art-a/muralha-humana-*.png.'
  },
  {
    id: 'wall_orc_glb',
    name: 'Paliçada Orc (Blender)',
    category: 'buildings',
    faction: 'orc',
    type: 'building',
    icon: '🪵',
    glb: 'wall_orc',
    sourceFile: 'tools/blender/build_walls.py',
    create: createGlb('wall_orc'),
    description: 'Bloco de paliçada orc gerado pelo pipeline Blender (public/models/wall_orc.glb): pé de pedra bruta enterrado, grade 3×3 de toras octogonais encostadas (0,8 de passo, pontas de ferro nos cantos, faixa de tinta de guerra na tora do meio de cada face), miolo escuro nos vãos e duas cintas de ferro rentes. A pegada é o passo WALL_STEP (2,4): a fileira mantém o ritmo de toras sem emenda visível.',
    notes: '1 draw call, ~432 triângulos, atlas 512², ~39 KB. Bloco de 2,4 × 2,4 × 2,6 de altura, com 0,55 enterrado. Fileira de 5 blocos: tools/ui-captures/art-a/muralha-orc-*.png.'
  },
  // F7-00b lote 1 (fim)
  {
    id: 'forge',
    name: 'Forja dos Humanos (Human Forge)',
    category: 'buildings',
    faction: 'human',
    type: 'building',
    icon: '🔨',
    sourceFile: 'src/render/buildings/HumanForge.js',
    create: () => bldView(HumanForge, 'forge'),
    description: 'Centro de armaria e aprimoramento bélico dos humanos baseado fielmente em forjaHumanos.png. Fornalha de pedra rústica entalhada com arco de alvenaria e braseiro ardente, chaminé alta com anel expansivo expelindo fumaça, estação de bigorna sobre tora robusta com fogo ativo de forja, grande marreta encostada, cepo e ferramentas de ferreiro espalhadas.',
    notes: 'VFX: Brasas e chamas ardendo na fornalha e sobre a bigorna com PointLights quentes dinâmicas, fumaça subindo pela chaminé e bigorna, e fagulhas ao forjar melhorias.'
  },
  {
    id: 'castle_glb',
    name: 'Castelo (Blender)',
    category: 'buildings',
    type: 'building',
    icon: '🏯',
    glb: 'castle',
    sourceFile: 'tools/blender/build_castle.py',
    create: createGlb('castle'),
    description: 'Versão gerada pelo pipeline Blender headless (public/models/castle.glb): torres com telhados cônicos azuis, muralhas com ameias, portão em arco, torre de menagem, salão, madeira e estandartes em cor de time.',
    notes: '2 draw calls (Static_Mesh + Anim_Banners), ~8,7 mil triângulos, atlas 1024² com bake de cor e AO. Mesma pegada (raio 5,5) e altura (~9,5) do castelo procedural. Sockets: Socket_UnitSpawn, Socket_Rally.'
  },
  {
    id: 'hq_human_1_glb',
    name: 'Centro humano nível 1 · Paço Real (Tripo)',
    category: 'buildings',
    faction: 'human',
    type: 'building',
    icon: '🏰',
    glb: 'hq_human_1',
    sourceFile: 'tools/blender/build_hq_human.py',
    create: createGlb('hq_human_1'),
    description: 'Casa de enxaimel com telhado de palha e ardósia, chaminé de pedra, sacos e caixotes; bandeira azul em cor de time. Modelo do nível 1 do Centro humano (M2-33), o padrão no jogo; o castelo antigo continua em Castelo (Blender).',
    notes: '2 draw calls (Atlas + TeamColor), 18,6 mil triângulos, atlas 512². Altura 9,0, pegada 6,8 x 6,5 (raio de colisão 5,5 da simulação, igual nos 3 níveis; raio máximo dos vértices 4,3). Fumaça da chaminé em (1,3; 8,2; -1,6). Sockets: Socket_UnitSpawn, Socket_Rally.'
  },
  {
    id: 'hq_human_2_glb',
    name: 'Centro humano nível 2 · Fortaleza (Tripo)',
    category: 'buildings',
    faction: 'human',
    type: 'building',
    icon: '🏰',
    glb: 'hq_human_2',
    sourceFile: 'tools/blender/build_hq_human.py',
    create: createGlb('hq_human_2'),
    description: 'Casa-forte de pedra com ameias, portão de grade, torre central de telhado azul e bandeira de time. Modelo do nível 2 (M2-33): o BuildingView troca para ele quando o upgrade do Centro termina.',
    notes: '2 draw calls (Atlas + TeamColor), 18,2 mil triângulos, atlas 512². Altura 12,5, pegada 8,1 x 8,3 (raio máximo dos vértices 5,4). Sockets: Socket_UnitSpawn, Socket_Rally.'
  },
  {
    id: 'hq_human_3_glb',
    name: 'Centro humano nível 3 · Castelo de Aldária (Tripo)',
    category: 'buildings',
    faction: 'human',
    type: 'building',
    icon: '🏰',
    glb: 'hq_human_3',
    sourceFile: 'tools/blender/build_hq_human.py',
    create: createGlb('hq_human_3'),
    description: 'Castelo de pedra com quatro torres de telhado cônico azul, torre de menagem, leões, estandartes e portão. Modelo do nível 3 (M2-33). Bandeiras e estandartes em cor de time.',
    notes: '2 draw calls (Atlas + TeamColor), 19,3 mil triângulos, atlas 512². Altura 15,5, pegada 8,6 x 8,2 (raio máximo dos vértices 5,8: só as pontas dos leões/torres passam do raio 5,5). Sockets: Socket_UnitSpawn, Socket_Rally.'
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
    ambientColor: 0x646a7d,
    ambientIntensity: 1.4,
    keyColor: 0xfff8ee,
    keyIntensity: 2.8,
    keyPos: [6, 9, 7],
    fillColor: 0xbcd9f5,
    fillIntensity: 1.6,
    fillPos: [-7, 5, -5],
    rimColor: 0xffdf88,
    rimIntensity: 2.2,
    rimPos: [0, 8, -8]
  },
  day: {
    name: 'Dia Ensolarado',
    bg: 0x76aed9,
    ambientColor: 0x90d2f5,
    ambientIntensity: 1.3,
    keyColor: 0xfffbe8,
    keyIntensity: 3.0,
    keyPos: [8, 12, 5],
    fillColor: 0xb5dcff,
    fillIntensity: 1.2,
    fillPos: [-8, 6, -5],
    rimColor: 0xffecb3,
    rimIntensity: 1.2,
    rimPos: [3, 6, -7]
  },
  sunset: {
    name: 'Pôr do Sol',
    bg: 0x2b1c2b,
    ambientColor: 0x5a3452,
    ambientIntensity: 1.2,
    keyColor: 0xff8542,
    keyIntensity: 3.2,
    keyPos: [10, 4, 3],
    fillColor: 0xc88efc,
    fillIntensity: 1.3,
    fillPos: [-7, 5, -4],
    rimColor: 0xf43f5e,
    rimIntensity: 2.2,
    rimPos: [-4, 6, -7]
  },
  night: {
    name: 'Noite de Luar',
    bg: 0x0a0e17,
    ambientColor: 0x1d2c48,
    ambientIntensity: 0.9,
    keyColor: 0x8ae0ff,
    keyIntensity: 2.2,
    keyPos: [-6, 9, 5],
    fillColor: 0x939bfb,
    fillIntensity: 1.2,
    fillPos: [6, 4, -4],
    rimColor: 0xc894fc,
    rimIntensity: 1.6,
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
    this.currentBuildingInstance = null;
    this.particleSystem = null;
    this.animator = null;
    this.critterAnimator = null;
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

    // F7-02: cor de time da prévia (paleta de 8 + cor livre)
    this.teamColor = TEAM_PALETTE[0];

    // Clock
    this.timer = new THREE.Timer();

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
    const teamQ = urlParams.get('team'); // ?team=3 (índice da paleta) ou ?team=ff8800
    if (teamQ) this.teamColor = /^\d$/.test(teamQ) ? TEAM_PALETTE[+teamQ] || this.teamColor : '#' + teamQ.replace('#', '');
    this.setupTeamColorUI();
    this.selectModel(initialModel);
    ModelFactory.loadGlbModels().then(() => {
      if (this.currentModelItem && this.currentModelItem.glb) {
        this.selectModel(this.currentModelItem.id);
        const q = new URLSearchParams(window.location.search);
        const anim = q.get('anim');
        if (this.animator && anim && anim !== 'idle') this.setUnitAnimation(anim);
        if (this.animator && q.get('time') !== null) {
          this.animator.pause();
          this.animator.setTime(parseFloat(q.get('time')));
        }
      }
    });
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

    // Particle System for live building VFX
    this.particleSystem = new ParticleSystem(this.scene);

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
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.35;


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
      let matchCat = false;
      if (this.activeCategory === 'all') {
        matchCat = true;
      } else if (this.activeCategory === 'orcs') {
        matchCat = (item.faction === 'orc');
      } else {
        matchCat = (item.category === this.activeCategory);
      }
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

    // Cleanup previous building VFX if any
    if (this.currentBuildingInstance && this.currentBuildingInstance.cleanupCustomVFX) {
      this.currentBuildingInstance.cleanupCustomVFX();
      this.currentBuildingInstance = null;
    }

    // Clear particles (F1-08: pools/cache vivem em ParticleSystem; clear() os desativa)
    if (this.particleSystem) {
      this.particleSystem.clear();
    }

    // Remove old model
    if (this.currentModelObject) {
      this.clearWireframeOverlays();
      this.scene.remove(this.currentModelObject);
      this.currentModelObject = null;
    }

    // Instantiate new model or Building entity
    const created = item.create();
    let model;
    if (created instanceof THREE.Object3D) {
      if (item.category === 'units' && !item.glb) {
        // F1-03b: mesmo skinning rígido do jogo, para "Componentes" refletir o custo real
        // (?merge=0 desliga tudo; ?skin=0 volta à mescla por osso da F1-03, para comparar)
        model = isStaticMergeEnabled()
          ? (isSkinEnabled() ? skinUnitTemplate(created) : mergeUnitTemplate(created))
          : created;
      } else {
        // F1-02: mesma mescla estática do jogo (construções/depósitos/decorações; ?merge=0 desliga)
        model = prepareStaticTemplate(item.id, created);
      }
    } else if (created && created.mesh instanceof THREE.Object3D) {
      this.currentBuildingInstance = created;
      model = created.mesh;
    } else {
      model = created;
    }

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
    const buildingVfxSection = document.getElementById('building-vfx-section');

    if (item.category === 'units') {
      animSection.style.display = 'block';
      if (buildingVfxSection) buildingVfxSection.style.display = 'none';
      this.animator = new UnitAnimator(model, item.type);

      // Handle Villager / Peon extra controls
      if (item.type === 'villager' || item.type === 'peon') {
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
      // M2-13: javali `.glb` anima andar/pastar/correr; `?critter=walk|graze|run|idle|dead` fixa o estado, sem o parâmetro alterna sozinho.
      this.critterAnimator = item.glb === 'critter_boar' ? new CritterAnimator(model) : null;
      this.critterClock = 0;

      if (this.currentBuildingInstance && buildingVfxSection) {
        buildingVfxSection.style.display = 'block';
        this.updateBuildingVfxUI(item, this.currentBuildingInstance);
      } else if (buildingVfxSection) {
        buildingVfxSection.style.display = 'none';
      }
    }

    // Reapply wireframe if toggled
    if (this.wireframeActive) {
      this.applyWireframeOverlay(true);
    }

    this.applyTeamColor();

    // Update Model Stats & Details Card
    this.updateModelStatsUI(item, model, box, size);
  }

  /** F7-02: aplica a cor de time atual ao modelo mostrado (no-op sem máscara `TeamColor`) e atualiza a UI. */
  applyTeamColor() {
    const model = this.currentModelObject;
    const has = !!model && hasTeamMask(model);
    if (has) setTeamColor(model, this.teamColor);
    const sec = document.getElementById('team-color-section');
    if (sec) sec.dataset.mask = has ? '1' : '0';
    const note = document.getElementById('team-color-note');
    if (note) note.textContent = has ? '' : 'Este modelo não tem área de cor de time.';
    const hex = new THREE.Color(this.teamColor).getHexString();
    document.querySelectorAll('.team-swatch').forEach(b => {
      b.classList.toggle('active', b.dataset.color.replace('#', '').toLowerCase() === hex);
    });
    const free = document.getElementById('team-color-free');
    if (free) free.value = '#' + hex;
  }

  setTeamColorValue(color) {
    this.teamColor = color;
    this.applyTeamColor();
  }

  setupTeamColorUI() {
    const wrap = document.getElementById('team-color-swatches');
    if (!wrap) return;
    wrap.innerHTML = '';
    TEAM_PALETTE.forEach((c, i) => {
      const b = document.createElement('button');
      b.className = 'team-swatch';
      b.dataset.color = c;
      b.title = 'Cor de time ' + (i + 1);
      b.style.background = c;
      b.addEventListener('click', () => this.setTeamColorValue(c));
      wrap.appendChild(b);
    });
    const free = document.getElementById('team-color-free');
    if (free) free.addEventListener('input', () => this.setTeamColorValue(free.value));
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

    // F7-05: efeito de teste (partículas GPU) no pedestal — cada clique dispara o próximo da lista.
    const vfxBtn = document.getElementById('btn-test-vfx');
    if (vfxBtn) vfxBtn.addEventListener('click', () => this.testVfx());

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

  updateBuildingVfxUI(item, building) {
    const descEl = document.getElementById('building-vfx-desc');
    const actionsEl = document.getElementById('building-vfx-actions');
    if (!descEl || !actionsEl) return;

    actionsEl.innerHTML = '';

    if (item.id === 'orc_lumber_mill') {
      descEl.innerHTML = '🪚 <strong>Serraria Industrial dos Clãs:</strong> A serra circular dentada gira continuamente em torno do seu eixo. Entregas de toras aceleram a lâmina e projetam cavacos de madeira.';
      const btn = document.createElement('button');
      btn.className = 'gold-btn action-btn';
      btn.innerHTML = '🪵 Processar Madeira (Acelerar Serra)';
      btn.addEventListener('click', () => {
        if (building.processWoodDelivery) {
          building.processWoodDelivery(this.particleSystem);
          this.showToast('Lote de toras processado! A rotação da serra acelerou.');
        }
      });
      actionsEl.appendChild(btn);
    } else if (item.id === 'orc_barracks') {
      descEl.innerHTML = '⚔️ <strong>Quartel Militar:</strong> O boneco de palha suspenso oscila com física pendular harmônica amortecida com molas e reage a pancadas.';
      const btn = document.createElement('button');
      btn.className = 'gold-btn action-btn';
      btn.innerHTML = '💥 Golpear Boneco de Treino';
      btn.addEventListener('click', () => {
        if (building.hitDummy) {
          building.hitDummy(this.particleSystem);
          this.showToast('Pancada desferida! O boneco oscila vigorosamente.');
        }
      });
      actionsEl.appendChild(btn);
    } else if (item.id === 'pig_farm') {
      descEl.innerHTML = `🐖 <strong>Criatório de Javalis dos Clãs:</strong> 3 javalis/porcos com IA comportamental autônoma vagam pelo cercado, farejam a terra, comem no cocho e balançam o rabo.`;
      const btn = document.createElement('button');
      btn.className = 'gold-btn action-btn';
      btn.innerHTML = '🌾 Chamar Javalis ao Cocho';
      btn.addEventListener('click', () => {
        if (building.pigs) {
          building.pigs.forEach(p => {
            p.state = 'eating';
            p.timer = 5.0;
          });
          if (this.particleSystem) {
            this.particleSystem.spawnFloatingText('Oink! Oink!', building.mesh.position, '#ffd700');
          }
          this.showToast('Javalis foram para o cocho se alimentar!');
        }
      });
      actionsEl.appendChild(btn);
    } else if (item.id === 'orc_forge') {
      descEl.innerHTML = '🔥 <strong>Forja de Guerra & Fundição:</strong> Fornalha de basalto vulcânico com chamas animadas, PointLight pulsante, chaminé expelindo fumaça preta de carvão e bigorna.';
      const btn = document.createElement('button');
      btn.className = 'gold-btn action-btn';
      btn.innerHTML = '🔨 Bater Martelo na Bigorna (Faíscas)';
      btn.addEventListener('click', () => {
        if (building.strikeAnvil) {
          building.strikeAnvil(this.particleSystem);
          this.showToast('Faíscas forjadas na bigorna de ferro!');
        }
      });
      actionsEl.appendChild(btn);
    } else if (item.id === 'great_hall') {
      descEl.innerHTML = '🌋 <strong>Grande Salão dos Clãs:</strong> Estandartes carmesim com ondulação dinâmica de vento via equações senoidais, braseiro de entrada com PointLight animada e chaminé ativa.';
      const btn = document.createElement('button');
      btn.className = 'gold-btn action-btn';
      btn.innerHTML = '💨 Baforada de Fumaça na Chaminé';
      btn.addEventListener('click', () => {
        if (this.particleSystem) {
          const chimneyPos = building.mesh.position.clone().add(new THREE.Vector3(-2.2, 9.8, -1.8));
          this.particleSystem.spawnSmokePuff(chimneyPos);
          this.showToast('Fumaça espessa expelida pela chaminé!');
        }
      });
      actionsEl.appendChild(btn);
    } else if (item.id === 'orc_watchtower') {
      descEl.innerHTML = '🏹 <strong>Torre de Vigia:</strong> Braseiro suspenso ardendo no cume com iluminação PointLight pulsante e labaredas cônicas em rotação e escala dinâmica.';
      const btn = document.createElement('button');
      btn.className = 'gold-btn action-btn';
      btn.innerHTML = '🔥 Alimentar Braseiro com Óleo';
      btn.addEventListener('click', () => {
        if (building.brazierLight) {
          building.brazierLight.intensity = 4.5;
        }
        if (this.particleSystem) {
          const sparkPos = building.mesh.position.clone().add(building.brazierSocket || new THREE.Vector3(0, 8.5, 0));
          this.particleSystem.spawnHitSparks(sparkPos);
        }
        this.showToast('Braseiro alimentado com óleo de batalha!');
      });
      actionsEl.appendChild(btn);
    } else if (item.id === 'orc_house') {
      descEl.innerHTML = '🛖 <strong>Toca dos Peons (Burrow):</strong> Telhado cônico de peles costuradas com fogueira interna acolhedora e respiradouro de fumaça de madeira no ápice.';
      const btn = document.createElement('button');
      btn.className = 'gold-btn action-btn';
      btn.innerHTML = '💨 Soprar Fumaça pelo Respiradouro';
      btn.addEventListener('click', () => {
        if (this.particleSystem) {
          const ventPos = building.mesh.position.clone().add(building.roofSmokeSocket || new THREE.Vector3(0, 4.2, 0));
          this.particleSystem.spawnSmokePuff(ventPos);
          this.showToast('Fumaça escapando pela chaminé cônica!');
        }
      });
      actionsEl.appendChild(btn);
    }
  }

  onWindowResize() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(width, height);
  }

  /** F7-05: dispara um efeito de teste do VFX (`kind` opcional; senão cicla). */
  testVfx(kind) {
    if (!this.vfx) this.vfx = new VfxSystem(this.scene, 'high');
    const list = [
      { fx: 'building_collapse', radius: 3 }, { fx: 'blood', amount: 40 }, { fx: 'unit_death' },
      { fx: 'explosion', radius: 2.5 }, { fx: 'magic', kind: 'burst', color: '#fb923c', radius: 2.5 },
      { fx: 'magic', kind: 'ring', color: '#38bdf8', radius: 3 }, { fx: 'magic', kind: 'aura', color: '#4ade80', radius: 2, duration: 1 }
    ];
    this._vfxIdx = ((this._vfxIdx ?? -1) + 1) % list.length;
    const d = kind ? { fx: kind, radius: 2.5, amount: 30, kind: 'burst', color: '#fb923c' } : list[this._vfxIdx];
    this.vfx.play({ ...d, pos: { x: 0, y: 0.1, z: 0 } });
    return d.fx;
  }

  animate() {
    requestAnimationFrame(this.animate);

    this.timer.update();
    const dt = this.timer.getDelta();
    if (this.vfx) this.vfx.update(dt);

    // Turntable Auto-rotation
    if (this.autoRotate && this.currentModelObject) {
      this.currentModelObject.rotation.y += dt * this.autoRotateSpeed;
    }

    // Unit Animator update
    if (this.animator) {
      this.animator.update(dt);
      this.updateTimelineUI();
    }

    // M2-13: animação do javali (ciclo: andar 4 s, pastar 4 s, correr 3 s)
    if (this.critterAnimator && this.critterAnimator.valid) {
      const forced = new URLSearchParams(window.location.search).get('critter');
      this.critterClock += dt;
      const t = this.critterClock % 11;
      this.critterAnimator.setState(forced || (t < 4 ? 'walk' : t < 8 ? 'graze' : 'run'));
      this.critterAnimator.update(dt);
    }

    // Building procedural animation & VFX update
    if (this.currentBuildingInstance && this.currentBuildingInstance.updateCustomVFX) {
      this.currentBuildingInstance.updateCustomVFX(dt, null, null, this.particleSystem);
    }

    // Particle System update
    if (this.particleSystem) {
      this.particleSystem.update(dt);
    }

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}

// Bootstrap application on DOM load
window.addEventListener('DOMContentLoaded', () => {
  ensureGlbLoaded(null, { includeLazy: true }); // ART-01..04: props, árvores novas e javali são lazy (fora do boot do jogo)
  window.inspectorApp = new ModelInspectorApp();
  window.inspectorApp.musicPanel = initMusicPanel(document); // painel "Músicas": player e seleção das faixas do jogo
});
