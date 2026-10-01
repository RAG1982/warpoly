import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Import all game models
import {
  createKnight,
  createArcher,
  createVillager,
  createBandit,
  createPeon,
  createGrunt,
  createAxethrower,
  createOgre,
  createCavalier,
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
  createArsonist,
  createWorkshop,
  createOrcWorkshop,
  createCastle,
  createLumberCamp,
  createGoldMine,
  createStoneQuarry,
  createCottage,
  createBarracks,
  createWatchtower,
  createFarm,
  createBanditCamp,
  createGreatHall,
  createOrcBarracks,
  createPigFarm,
  createOrcLumberMill,
  createOrcWatchtower,
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

import { UnitAnimator, ANIMATION_DURATIONS } from '../animation/UnitAnimator.js';
import {
  GreatHall,
  OrcBarracks,
  PigFarm,
  OrcHouse,
  OrcWatchtower,
  OrcLumberMill,
  OrcForge
} from '../entities/buildings/orc/index.js';
import { HumanForge } from '../entities/buildings/HumanForge.js';
import { ParticleSystem } from '../entities/ParticleSystem.js';
import { prepareStaticTemplate, isStaticMergeEnabled } from '../render/staticTemplates.js';
import { mergeUnitTemplate } from '../render/mergeUnitTemplate.js';
import { skinUnitTemplate, isSkinEnabled } from '../render/skinUnitTemplate.js';
import { ModelFactory } from '../entities/ModelFactory.js';

// Modelos do pipeline Blender (F7-00): sempre carregados no inspetor para comparação
const glbPlaceholder = () => new THREE.Group();
const createGlb = key => () => ModelFactory.createGlbModel(key) || glbPlaceholder();

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
    notes: 'Rig plana idêntica à do KnightModel.js procedural (o UnitAnimator anima Sword/braços com rotações independentes). Sem escudo (a referência não tem). 10 draw calls, ~4,2 mil triângulos, 213 KB. Rosto só na face frontal (+Z).'
  },
  {
    id: 'cavalier',
    name: 'Cavaleiro Montado (Cavalier)',
    category: 'units',
    faction: 'human',
    type: 'cavalier',
    icon: '🐎',
    sourceFile: 'src/models/units/CavalierModel.js',
    create: createCavalier,
    description: 'Cavalaria pesada humana (F4-01): cavalo low-poly em caixas (tronco, pescoço, cabeça, crina, cauda, sela e manta azul) com o tronco do Espadachim montado na sela. Modelo procedural provisório; o modelo final do Blender vem na F7.',
    notes: 'Pernas do cavalo (HorseLegFL/FR/BL/BR) balançam em diagonais alternadas na animação de andar; braços, espada e escudo usam as mesmas poses do Espadachim.'
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
    notes: 'Rig plana igual à do ArcherModel.js (Torso, Head, ArmL, ArmR, LegL, LegR; Bow em ArmL com BowStringTop/BowStringBottom, BowTipTop/BowTipBottom e DrawnArrow). O ModelFactory recria updateBowString a partir desses nós. Também é o modelo do Ranger.'
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
    id: 'villager_glb',
    name: 'Camponês (Blender)',
    category: 'units',
    type: 'villager',
    icon: '🌾',
    glb: 'villager',
    sourceFile: 'tools/blender/build_villager.py',
    create: createGlb('villager'),
    description: 'Versão gerada pelo pipeline Blender headless (public/models/villager.glb): barrete de feltro e avental em cor de time, túnica de lã com mangas arregaçadas, luvas e botas de couro, cinto com ferramentas, machado/picareta/marreta separados e mochila com feixe de lenha ou saco de ouro.',
    notes: 'Rig plana idêntica à do VillagerModel.js (Torso, Head, ArmL, ArmR, LegL, LegR, ToolGroup > Axe/Pickaxe/Hammer, Pack > WoodBundle/GoldSack). Atlas 512², rosto só em +Z.'
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
    notes: 'Rig plana idêntica à do BanditModel.js (Weapon é irmã dos braços). Neutro: o TeamColor guarda só o trapo/bandana (vermelho-sujo). Rosto só na face frontal (+Z).'
  },
  {
    id: 'peon',
    name: 'Peon (Aldeão Orc)',
    category: 'units',
    faction: 'orc',
    type: 'peon',
    icon: '🪓',
    sourceFile: 'src/models/units/PeonModel.js',
    create: createPeon,
    description: 'Trabalhador incansável da Horda dos Orcs com postura curvada característica, pele verde-oliva, presas inferiores proeminentes, túnica de juta rústica com arreios de couro tachados, e ferramentas intercambiáveis (machado de corte, picareta de ferro e marreta de construtor).',
    notes: 'Inspirado no Peon clássico de Warcraft 2. Rigging modular completo com mochila de toras e saco de minério de ouro.'
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
    notes: 'Rig aninhada idêntica à do PeonModel.js (Torso > Head, ArmL, ArmR > ToolGroup > Axe/Pickaxe/Hammer; Pack no Torso; LegL/LegR na raiz). Atlas 512².'
  },
  {
    id: 'grunt',
    name: 'Grunt (Guerreiro Orc)',
    category: 'units',
    faction: 'orc',
    type: 'grunt',
    icon: '⚔️',
    sourceFile: 'src/models/units/GruntModel.js',
    create: createGrunt,
    description: 'A temível espinha dorsal da infantaria da Horda. Porte colossal com musculatura maciça, pintura de guerra carmesim, elmo spangenhelm com chifres recurvados de osso ancestral, ombreiras com espinhos de ferro forjado e machado de batalha de lâmina dupla gigantesco.',
    notes: 'Contraparte orc do Cavaleiro Humano. Animações de golpe circular violento (cleave) com torque total do tronco.'
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
    id: 'axethrower',
    name: 'Arremessador Troll (Axethrower)',
    category: 'units',
    faction: 'orc',
    type: 'axethrower',
    icon: '🎯',
    sourceFile: 'src/models/units/AxethrowerModel.js',
    create: createAxethrower,
    description: 'Atirador de elite ágil da Horda dos Orcs com silhueta acrobática e predadora. Pele verde-azulada (teal) vibrante, crista de cabelo moicano chamejante em laranja e carmesim, presas curvas de marfim, colar tribal de contas e machadinhas de arremesso afiadas.',
    notes: 'Inspirado no Troll Axethrower icônico de Warcraft 2. Animação de recuo de mira, arremesso balístico e recarga.'
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
    notes: 'Rig aninhada igual à do AxethrowerModel.js (Torso > Head/ArmL/ArmR > WeaponL/WeaponR; LegL/LegR na raiz; Mohawk em Head). Também é o modelo do Berserker.'
  },
  {
    id: 'ogre',
    name: 'Ogro da Horda (Ogre Brute)',
    category: 'units',
    faction: 'orc',
    type: 'ogre',
    icon: '👹',
    sourceFile: 'src/models/units/OgreModel.js',
    create: createOgre,
    description: 'Campeão titânico da Horda com força descomunal. Pele ocre-amarelada enrijecida, chifre frontal de marfim, barriga proeminente com arreio de couro tachado e clava maciça feita de tronco de árvore cravada de espinhos de ferro.',
    notes: 'Unidade gigante de elite (escala 1.5x) com golpe devastador de impacto sísmico no solo.'
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
    notes: 'Rig aninhada idêntica à do OgreModel.js (Head/ArmL/ArmR em Torso, Weapon em ArmR). Faixas, tanga, capa e trapo da clava em cor de time. Rosto só na face frontal (+Z).'
  },

  // --- CONSTRUÇÕES ---
  {
    id: 'great_hall',
    name: 'Grande Salão da Horda (Great Hall)',
    category: 'buildings',
    faction: 'orc',
    type: 'building',
    icon: '🌋',
    sourceFile: 'src/entities/buildings/orc/GreatHall.js',
    create: () => new GreatHall(null, { getHeight: () => 0 }, 0, 0, true, 'player'),
    description: 'A colossal fortaleza central da Horda Orc. Construída com pesadas toras de ferro, estacas defensivas pontiagudas, crânio de fera ancestral sobre o portal de entrada, quatro torreões de canto com braseiros de fogo ardente e estandartes de guerra vermelhos.',
    notes: 'VFX: Estandartes de guerra da Horda com ondulação dinâmica ao vento e braseiro de entrada com PointLight animada e cintilação de calor.'
  },
  {
    id: 'orc_barracks',
    name: 'Quartel da Horda (Orc Barracks)',
    category: 'buildings',
    faction: 'orc',
    type: 'building',
    icon: '🛡️',
    sourceFile: 'src/entities/buildings/orc/OrcBarracks.js',
    create: () => new OrcBarracks(null, { getHeight: () => 0 }, 0, 0, true, 'player'),
    description: 'Fortificação militar agressiva com toras entrecruzadas monumentais no cume do telhado, toldo de lona carmesim, pátio de treinamento com boneco de palha e estantes com machados de guerra afiados.',
    notes: 'VFX: Simulação física de pêndulo harmônico amortecido no boneco de treino suspenso (Anim_TrainingDummy) com reação a pancadas.'
  },
  {
    id: 'pig_farm',
    name: 'Fazenda de Porcos (Pig Farm)',
    category: 'buildings',
    faction: 'orc',
    type: 'building',
    icon: '🐖',
    sourceFile: 'src/entities/buildings/orc/PigFarm.js',
    create: () => new PigFarm(null, { getHeight: () => 0 }, 0, 0, true, 'player'),
    description: 'A emblemática fazenda dos Orcs em Warcraft 2. Cercado de toras rústicas com amarração de corda, chão de lama úmida com palha, cocho de comida, abrigo de palha e três javalis/porcos com rotinas autônomas fuçando e comendo no cercado.',
    notes: 'VFX: 3 javalis com IA comportamental autônoma (vagam pelo cercado, comem no cocho, farejam o chão e balançam os rabos em espiral).'
  },
  {
    id: 'orc_house',
    name: 'Toca dos Peons (Orc Burrow)',
    category: 'buildings',
    faction: 'orc',
    type: 'building',
    icon: '🛖',
    sourceFile: 'src/entities/buildings/orc/OrcHouse.js',
    create: () => new OrcHouse(null, { getHeight: () => 0 }, 0, 0, true, 'player'),
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
    sourceFile: 'src/entities/buildings/orc/OrcWatchtower.js',
    create: () => new OrcWatchtower(null, { getHeight: () => 0 }, 0, 0, true, 'player'),
    description: 'Atalaia defensiva de múltiplos andares com toras reforçadas por escoras diagonais, estacas de proteção na base, plataforma elevada de combate com paliçada dentada e braseiro ardente no topo.',
    notes: 'VFX: Braseiro de ferro suspenso no cume ardendo com chamas 3D animadas, fagulhas e PointLight dinâmica de fogo.'
  },
  {
    id: 'orc_lumber_mill',
    name: 'Serraria da Horda (Orc Lumber Mill)',
    category: 'buildings',
    faction: 'orc',
    type: 'building',
    icon: '🪚',
    sourceFile: 'src/entities/buildings/orc/OrcLumberMill.js',
    create: () => new OrcLumberMill(null, { getHeight: () => 0 }, 0, 0, true, 'player'),
    description: 'Oficina florestal pesada com plataforma de madeira elevada, mecanismo de serra circular giratória gigante de ferro serrilhado com marcas de resina, tora mestre sendo fatiada, montes de serragem e pilhas de toras.',
    notes: 'VFX: Serra circular dentada (Anim_SawBlade) que gira continuamente em torno do seu eixo com aceleração dinâmica ao processar toras.'
  },
  {
    id: 'orc_forge',
    name: 'Forja de Guerra da Horda (Orc War Forge)',
    category: 'buildings',
    faction: 'orc',
    type: 'building',
    icon: '🔥',
    sourceFile: 'src/entities/buildings/orc/OrcForge.js',
    create: () => new OrcForge(null, { getHeight: () => 0 }, 0, 0, true, 'player'),
    description: 'Centro de aprimoramentos bélicos e fundição da Horda. Erguida sobre blocos maciços de basalto vulcânico negro, possui fornalha abobadada com boca em arco e grades de ferro, chaminé monumental reforçada com anéis forjados, telhado parcial de chapas rebitadas, toco com bigorna de ferro fundido e tina de têmpera.',
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
    description: 'Estábulo humano gerado pelo pipeline Blender (public/models/stable.glb): celeiro de empena frontal com estrutura de madeira aparente e reboco sobre pé de pedra, baias com meias-portas e cavalos espiando, portão central aberto, sótão de feno com talha, telhado azul com cumeeira dourada e cúpula com cata-vento, pátio com cocho, cerca, fardos, rack de sela, lanternas e mastros com bandeirolas.',
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
    id: 'forge',
    name: 'Forja dos Humanos (Human Forge)',
    category: 'buildings',
    faction: 'human',
    type: 'building',
    icon: '🔨',
    sourceFile: 'src/entities/buildings/HumanForge.js',
    create: () => new HumanForge(null, { getHeight: () => 0 }, 0, 0, true, 'player'),
    description: 'Centro de armaria e aprimoramento bélico dos humanos baseado fielmente em forjaHumanos.png. Fornalha de pedra rústica entalhada com arco de alvenaria e braseiro ardente, chaminé alta com anel expansivo expelindo fumaça, estação de bigorna sobre tora robusta com fogo ativo de forja, grande marreta encostada, cepo e ferramentas de ferreiro espalhadas.',
    notes: 'VFX: Brasas e chamas ardendo na fornalha e sobre a bigorna com PointLights quentes dinâmicas, fumaça subindo pela chaminé e bigorna, e fagulhas ao forjar melhorias.'
  },
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

  updateBuildingVfxUI(item, building) {
    const descEl = document.getElementById('building-vfx-desc');
    const actionsEl = document.getElementById('building-vfx-actions');
    if (!descEl || !actionsEl) return;

    actionsEl.innerHTML = '';

    if (item.id === 'orc_lumber_mill') {
      descEl.innerHTML = '🪚 <strong>Serraria Industrial da Horda:</strong> A serra circular dentada gira continuamente em torno do seu eixo. Entregas de toras aceleram a lâmina e projetam cavacos de madeira.';
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
      descEl.innerHTML = `🐖 <strong>Criatório de Javalis da Horda:</strong> 3 javalis/porcos com IA comportamental autônoma vagam pelo cercado, farejam a terra, comem no cocho e balançam o rabo.`;
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
      descEl.innerHTML = '🌋 <strong>Grande Salão da Horda:</strong> Estandartes carmesim com ondulação dinâmica de vento via equações senoidais, braseiro de entrada com PointLight animada e chaminé ativa.';
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

  animate() {
    requestAnimationFrame(this.animate);

    this.timer.update();
    const dt = this.timer.getDelta();

    // Turntable Auto-rotation
    if (this.autoRotate && this.currentModelObject) {
      this.currentModelObject.rotation.y += dt * this.autoRotateSpeed;
    }

    // Unit Animator update
    if (this.animator) {
      this.animator.update(dt);
      this.updateTimelineUI();
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
  window.inspectorApp = new ModelInspectorApp();
});
