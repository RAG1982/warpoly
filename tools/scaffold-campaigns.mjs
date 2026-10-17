#!/usr/bin/env node
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const ALLIANCE_DIR = 'src/data/campaigns/war-alliance';
const HORDE_DIR = 'src/data/campaigns/war-horde';

mkdirSync(ALLIANCE_DIR, { recursive: true });
mkdirSync(HORDE_DIR, { recursive: true });

const ALLIANCE_MISSIONS = [
  {
    num: 1,
    slug: 'terra-a-vista',
    title: { 'pt-BR': 'Terra à Vista', en: 'Land Ahoy' },
    speaker: { 'pt-BR': 'Sgt. Tomás Rocha', en: 'Sgt. Tomás Rocha' },
    portrait: '🛡️',
    mapId: 'campos-1v1',
    text: {
      'pt-BR': 'O Mar Fendido nos trouxe a este cabo. Erga um quartel, reúna uma força de patrulha e limpe os contrabandistas da costa.',
      en: 'The Sundered Sea brought us to this cape. Raise a barracks, gather a patrol force, and clear the smugglers from the coast.'
    },
    primary: { 'pt-BR': 'Erguer um Quartel e treinar soldados', en: 'Raise a Barracks and train soldiers' },
    unlocks: { units: ['villager', 'knight', 'archer'], buildings: ['cottage', 'lumber_camp', 'farm', 'barracks'] }
  },
  {
    num: 2,
    slug: 'pouso-do-encontro',
    title: { 'pt-BR': 'O Pouso do Encontro', en: 'Landing of the Meeting' },
    speaker: { 'pt-BR': 'Elara Pinheiral', en: 'Elara Pinheiral' },
    portrait: '🏹',
    mapId: 'desfiladeiro-1v1',
    text: {
      'pt-BR': 'Velas desconhecidas aportaram perto da Torre da Fenda. Forje armas na Ferraria e resgate nossos batedores.',
      en: 'Unknown sails anchored near the Rift Tower. Forge weapons at the Smithy and rescue our scouts.'
    },
    primary: { 'pt-BR': 'Pesquisar Armas Forjadas e resgatar batedores', en: 'Research Forged Weapons and rescue scouts' },
    unlocks: { buildings: ['forge', 'watchtower'], research: ['melee_weapons', 'ranged_ammo', 'melee_armor'] }
  },
  {
    num: 3,
    slug: 'ouro-da-pedra-mae',
    title: { 'pt-BR': 'Ouro da Pedra-Mãe', en: 'Gold of the Mother Stone' },
    speaker: { 'pt-BR': 'Capitão Brann', en: 'Captain Brann' },
    portrait: '⚔️',
    mapId: 'continental-1v1',
    text: {
      'pt-BR': 'Os orcs desembarcaram para tomar as minas de ouro. Segure a posição com muralhas e com a Guarda da Guarnição!',
      en: 'The orcs have landed to seize the gold mines. Hold the line with walls and the Garrison Guard!'
    },
    primary: { 'pt-BR': 'Defender as minas com Capitão Brann e muralhas', en: 'Defend the mines with Captain Brann and walls' },
    unlocks: { units: ['cavalier', 'ballista', 'sapper', 'ranger'], buildings: ['stable', 'workshop', 'wall_human'], research: ['siege_damage', 'woodcutting', 'ranged_class', 'melee_weapons@2', 'melee_armor@2', 'ranged_ammo@2', 'ranger_longbow'], heroes: ['hero_brann'] }
  },
  {
    num: 4,
    slug: 'baixio-do-breu',
    title: { 'pt-BR': 'O Baixio do Breu', en: 'Pitch Shallows' },
    speaker: { 'pt-BR': 'Capitão Brann', en: 'Captain Brann' },
    portrait: '⚔️',
    mapId: 'estreito-1v1',
    text: {
      'pt-BR': 'As reservas de petróleo do Baixio são cruciais. Construa o Estaleiro, extraia petróleo e domine as águas.',
      en: 'The oil reserves of the Shallows are crucial. Build the Shipyard, pump oil, and rule the waters.'
    },
    primary: { 'pt-BR': 'Erguer um Estaleiro e Plataformas de Petróleo', en: 'Raise a Shipyard and Oil Platforms' },
    unlocks: { units: ['glider', 'tanker', 'barge', 'frigate', 'dreadnought', 'submersible'], buildings: ['shipyard', 'refinery', 'foundry', 'oil_platform'], research: ['naval_cannons', 'naval_hulls', 'naval_cannons@2', 'naval_hulls@2', 'siege_damage@2'] }
  },
  {
    num: 5,
    slug: 'cerne-verde',
    title: { 'pt-BR': 'O Cerne Verde', en: 'The Green Core' },
    speaker: { 'pt-BR': 'Mestre Arcano Oren', en: 'Arcane Master Oren' },
    portrait: '🔮',
    mapId: 'bosques-2v2',
    text: {
      'pt-BR': 'As florestas ancestrais guardam ninhos de grifos e energia arcana. Convoque os magos da Torre Arcana e proteja o bosque.',
      en: 'The ancient forests harbor gryphon roosts and arcane power. Summon mages from the Arcane Tower and protect the grove.'
    },
    primary: { 'pt-BR': 'Treinar Magos e Grifos e purificar o bosque', en: 'Train Mages and Gryphons and cleanse the grove' },
    unlocks: { units: ['mage', 'templar', 'gryphon_rider'], buildings: ['arcane_tower', 'temple', 'aviary'], research: ['cavalry_class', 'spell_fireball', 'spell_slow', 'spell_heal', 'spell_exorcism'] }
  },
  {
    num: 6,
    slug: 'a-geada',
    title: { 'pt-BR': 'A Geada', en: 'The Frost' },
    speaker: { 'pt-BR': 'Capitão Brann', en: 'Captain Brann' },
    portrait: '⚔️',
    mapId: 'arquipelago-naval-4p',
    text: {
      'pt-BR': 'Prova de Fogo: todo o nosso arsenal militar está pronto. Conquiste o Farol Boreal e derrote a frente orc no gelo.',
      en: 'Trial by Fire: our full military arsenal is ready. Take the Boreal Lighthouse and shatter the orc frost front.'
    },
    primary: { 'pt-BR': 'Tomar o Farol Boreal com forças combinadas', en: 'Capture the Boreal Lighthouse with combined forces' },
    unlocks: { research: ['ranger_sight', 'ranger_marksman', 'spell_flameshield', 'spell_invisibility', 'spell_polymorph', 'spell_blizzard', 'spell_holy_vision'] }
  },
  {
    num: 7,
    slug: 'brejo-mudo',
    title: { 'pt-BR': 'O Brejo Mudo', en: 'Silent Marsh' },
    speaker: { 'pt-BR': 'Capitão Brann', en: 'Captain Brann' },
    portrait: '⚔️',
    mapId: 'vales-2v2',
    text: {
      'pt-BR': 'A traição de Mervane foi revelada. Sobreviva à emboscada no brejo e recupere os suprimentos.',
      en: 'Mervane\'s treachery has been exposed. Survive the swamp ambush and recover the supplies.'
    },
    primary: { 'pt-BR': 'Derrotar as forças traidoras no Brejo Mudo', en: 'Defeat the traitor forces in Silent Marsh' },
    unlocks: {}
  },
  {
    num: 8,
    slug: 'a-fornalha',
    title: { 'pt-BR': 'A Fornalha', en: 'The Furnace' },
    speaker: { 'pt-BR': 'Mestre Arcano Oren', en: 'Arcane Master Oren' },
    portrait: '🔮',
    mapId: 'continental-1v1',
    text: {
      'pt-BR': 'Na ilha vulcânica, rios de lava barram o caminho. Resgate os magos prisioneiros no Monte Caldeira.',
      en: 'On the volcanic isle, rivers of lava bar the way. Rescue the captive mages at Mount Caldron.'
    },
    primary: { 'pt-BR': 'Cruzar as passagens de lava e libertar os magos', en: 'Cross the lava crossings and free the mages' },
    unlocks: {}
  },
  {
    num: 9,
    slug: 'miragem',
    title: { 'pt-BR': 'Miragem', en: 'Mirage' },
    speaker: { 'pt-BR': 'Capitão Brann', en: 'Captain Brann' },
    portrait: '⚔️',
    mapId: 'ilhas-4p',
    text: {
      'pt-BR': 'Os três poços de Miragem são a última parada antes da costa orc. Assegure a água e a cabeça de ponte.',
      en: 'The three wells of Mirage are the final stop before the orc coast. Secure the water and the bridgehead.'
    },
    primary: { 'pt-BR': 'Capturar os três poços e repelir a contra-ofensiva', en: 'Capture all three wells and repel the counter-offensive' },
    unlocks: {}
  },
  {
    num: 10,
    slug: 'desembarque-costa-ferrugem',
    title: { 'pt-BR': 'Desembarque na Costa Ferrugem', en: 'Landing on Rust Coast' },
    speaker: { 'pt-BR': 'Mestre Arcano Oren', en: 'Arcane Master Oren' },
    portrait: '🔮',
    mapId: 'estreito-1v1',
    text: {
      'pt-BR': 'Chegamos ao continente de Cinzara. Mestre Oren lidera a cartografia arcana da cabeça de praia.',
      en: 'We have reached the continent of Cinzara. Master Oren spearheads the arcane mapping of the beachhead.'
    },
    primary: { 'pt-BR': 'Estabelecer o Marco da Colônia com Mestre Oren', en: 'Establish the Colony Outpost with Master Oren' },
    unlocks: { heroes: ['hero_oren'] }
  },
  {
    num: 11,
    slug: 'porto-albor',
    title: { 'pt-BR': 'Porto Albor', en: 'Port Albor' },
    speaker: { 'pt-BR': 'Marechal Dorian Vasques', en: 'Marshal Dorian Vasques' },
    portrait: '👑',
    mapId: 'vales-2v2',
    text: {
      'pt-BR': 'A segunda onda desembarca sob meu estandarte. Erga as defesas de Porto Albor e rompa o cerco inimigo.',
      en: 'The second wave lands under my banner. Raise the defenses of Port Albor and break the enemy siege.'
    },
    primary: { 'pt-BR': 'Comandar as tropas com Marechal Dorian e quebrar o cerco', en: 'Command troops with Marshal Dorian and break the siege' },
    unlocks: { heroes: ['hero_dorian'] }
  },
  {
    num: 12,
    slug: 'bastiao-do-cabo-ferrugem',
    title: { 'pt-BR': 'O Bastião do Cabo Ferrugem', en: 'The Bastion of Cape Rust' },
    speaker: { 'pt-BR': 'Marechal Dorian Vasques', en: 'Marshal Dorian Vasques' },
    portrait: '👑',
    mapId: 'planalto-ffa-4p',
    text: {
      'pt-BR': 'A batalha final: os três heróis juntos. Construa o Bastião supremo, feche o estreito naval e derrote Skarn!',
      en: 'The final battle: all three heroes united. Build the supreme Bastion, close the naval strait, and defeat Skarn!'
    },
    primary: { 'pt-BR': 'Erguer a fortaleza final e bloquear as rotas marítimas', en: 'Raise the final fortress and blockade the sea routes' },
    unlocks: {}
  }
];

const HORDE_MISSIONS = [
  {
    num: 1,
    slug: 'cinzas-vermelhas',
    title: { 'pt-BR': 'Cinzas Vermelhas', en: 'Red Ashes' },
    speaker: { 'pt-BR': 'Anciã Ulma', en: 'Elder Ulma' },
    portrait: '🔥',
    mapId: 'desfiladeiro-1v1',
    text: {
      'pt-BR': 'O Cinzal precisa de recursos e madeira. Monte o Acampamento de Guerra, treine guerreiros e expulse os saqueadores.',
      en: 'The Cinzal needs timber and iron. Pitch the War Camp, train warriors, and drive out the raiders.'
    },
    primary: { 'pt-BR': 'Erguer um Acampamento de Guerra e treinar guerreiros', en: 'Raise a War Camp and train warriors' },
    unlocks: { units: ['peon', 'grunt', 'axethrower'], buildings: ['orc_house', 'orc_lumber_mill', 'pig_farm', 'orc_barracks'] }
  },
  {
    num: 2,
    slug: 'velas-brancas',
    title: { 'pt-BR': 'Velas Brancas', en: 'White Sails' },
    speaker: { 'pt-BR': 'Rurga Faro-Fino', en: 'Rurga Keen-Scent' },
    portrait: '🪓',
    mapId: 'campos-1v1',
    text: {
      'pt-BR': 'Velas brancas humanas avistadas no Pouso do Encontro. Monte torres e forje lâminas afiadas na Forja.',
      en: 'White human sails sighted at Meeting Landing. Build towers and forge sharp blades at the Forge.'
    },
    primary: { 'pt-BR': 'Pesquisar Armas Forjadas e erguer Torres de Vigia', en: 'Research Forged Weapons and erect Watchtowers' },
    unlocks: { buildings: ['orc_forge', 'orc_watchtower'], research: ['melee_weapons', 'ranged_ammo', 'melee_armor'] }
  },
  {
    num: 3,
    slug: 'a-pedra-que-brilha',
    title: { 'pt-BR': 'A Pedra que Brilha', en: 'The Shining Stone' },
    speaker: { 'pt-BR': 'Drogath Punho-de-Brasa', en: 'Drogath Emberfist' },
    portrait: '🔥',
    mapId: 'continental-1v1',
    text: {
      'pt-BR': 'Pedra-Mãe está cheia de ouro humano. Com Drogath e os Ogros na dianteira, assalte a fortaleza da mina!',
      en: 'Mother Stone is rich with human gold. With Drogath and the Ogres in the lead, storm the mine fortress!'
    },
    primary: { 'pt-BR': 'Assaltar a guarnição mineira com Drogath e ogros', en: 'Storm the mining garrison with Drogath and ogres' },
    unlocks: { units: ['ogre', 'catapult', 'arsonist', 'berserker', 'war_balloon'], buildings: ['ogre_den', 'orc_workshop', 'wall_orc'], research: ['siege_damage', 'woodcutting', 'ranged_class', 'melee_weapons@2', 'melee_armor@2', 'ranged_ammo@2', 'berserker_range'], heroes: ['hero_drogath'] }
  },
  {
    num: 4,
    slug: 'mare-de-breu',
    title: { 'pt-BR': 'Maré de Breu', en: 'Tide of Pitch' },
    speaker: { 'pt-BR': 'Drogath Punho-de-Brasa', en: 'Drogath Emberfist' },
    portrait: '🔥',
    mapId: 'estreito-1v1',
    text: {
      'pt-BR': 'Construa a Doca Naval e as Plataformas de Petróleo. As Galés de Guerra dos Clãs do Cinzal dominarão o Baixio!',
      en: 'Construct the Naval Dock and Oil Platforms. The Cinzal Clans\' War Galleys will rule the Shallows!'
    },
    primary: { 'pt-BR': 'Construir a Doca e Plataformas e afundar a patrulha', en: 'Build the Dock and Platforms and sink the patrol' },
    unlocks: { units: ['tanker', 'barge', 'war_galley', 'iron_leviathan', 'colossal_turtle'], buildings: ['ship_dock', 'naval_forge', 'ash_cauldron', 'oil_platform'], research: ['naval_cannons', 'naval_hulls', 'naval_cannons@2', 'naval_hulls@2', 'siege_damage@2'] }
  },
  {
    num: 5,
    slug: 'madeira-de-guerra',
    title: { 'pt-BR': 'Madeira de Guerra', en: 'Timber of War' },
    speaker: { 'pt-BR': 'Vozgul a Profetisa', en: 'Vozgul the Prophetess' },
    portrait: '💀',
    mapId: 'bosques-2v2',
    text: {
      'pt-BR': 'Cerne Verde tem madeira para mil frotas. Evoque os ancestrais e convoque as Serpes de Guerra.',
      en: 'Green Core holds timber for a thousand fleets. Summon the ancestors and call upon War Serpents.'
    },
    primary: { 'pt-BR': 'Colher madeira e derrotar os magos do bosque', en: 'Harvest timber and vanquish the grove mages' },
    unlocks: { units: ['necromancer', 'war_serpent', 'ogre_mage'], buildings: ['ash_sanctum', 'storm_altar', 'serpent_nest'], research: ['cavalry_class', 'spell_death_touch', 'spell_raise_dead', 'spell_eye', 'spell_bloodlust'] }
  },
  {
    num: 6,
    slug: 'fogo-no-gelo',
    title: { 'pt-BR': 'Fogo no Gelo', en: 'Fire on Ice' },
    speaker: { 'pt-BR': 'Drogath Punho-de-Brasa', en: 'Drogath Emberfist' },
    portrait: '🔥',
    mapId: 'arquipelago-naval-4p',
    text: {
      'pt-BR': 'Prova de Fogo: todo o poder militar dos clãs reunido. Quebre o Farol Boreal e derrote a frota humana.',
      en: 'Trial by Fire: full clan might assembled. Shatter the Boreal Lighthouse and crush the human fleet.'
    },
    primary: { 'pt-BR': 'Conquistar o Farol Boreal no gelo', en: 'Conquer the Boreal Lighthouse on the ice' },
    unlocks: { research: ['berserker_regen', 'berserker_fury', 'spell_haste', 'spell_unholy_armor', 'spell_ash_cloud', 'spell_whirlwind', 'spell_runes'] }
  },
  {
    num: 7,
    slug: 'casa-no-brejo',
    title: { 'pt-BR': 'Casa no Brejo', en: 'Home in the Marsh' },
    speaker: { 'pt-BR': 'Drogath Punho-de-Brasa', en: 'Drogath Emberfist' },
    portrait: '🔥',
    mapId: 'vales-2v2',
    text: {
      'pt-BR': 'Hurgan quebrou o juramento dos clãs. Defenda o Brejo Mudo e faça o traidor pagar com ferro.',
      en: 'Hurgan broke the clan oath. Defend Silent Marsh and make the traitor pay in iron.'
    },
    primary: { 'pt-BR': 'Derrotar o traidor Hurgan no Brejo Mudo', en: 'Defeat the traitor Hurgan in Silent Marsh' },
    unlocks: {}
  },
  {
    num: 8,
    slug: 'o-monte-caldeira',
    title: { 'pt-BR': 'O Monte Caldeira', en: 'Mount Caldron' },
    speaker: { 'pt-BR': 'Vozgul a Profetisa', en: 'Vozgul the Prophetess' },
    portrait: '💀',
    mapId: 'continental-1v1',
    text: {
      'pt-BR': 'A Fornalha é sagrada. Defenda a forja central enquanto os ritos de cinza inflamam a montanha.',
      en: 'The Furnace is sacred. Defend the central forge while the ash rites ignite the mountain.'
    },
    primary: { 'pt-BR': 'Segurar a forja vulcânica durante o rito', en: 'Hold the volcanic forge during the rite' },
    unlocks: {}
  },
  {
    num: 9,
    slug: 'o-ultimo-poco',
    title: { 'pt-BR': 'O Último Poço', en: 'The Last Well' },
    speaker: { 'pt-BR': 'Drogath Punho-de-Brasa', en: 'Drogath Emberfist' },
    portrait: '🔥',
    mapId: 'ilhas-4p',
    text: {
      'pt-BR': 'Os poços de Miragem dão água à travessia. Assegure a última ilha antes de Velmara.',
      en: 'The wells of Mirage provide water for the crossing. Secure the final isle before Velmara.'
    },
    primary: { 'pt-BR': 'Garantir os poços de água e a cabeça de ponte', en: 'Secure the water wells and the bridgehead' },
    unlocks: {}
  },
  {
    num: 10,
    slug: 'cabo-aurora',
    title: { 'pt-BR': 'Desembarque no Cabo Aurora', en: 'Landing at Cape Aurora' },
    speaker: { 'pt-BR': 'Vozgul a Profetisa', en: 'Vozgul the Prophetess' },
    portrait: '💀',
    mapId: 'estreito-1v1',
    text: {
      'pt-BR': 'Os Clãs do Cinzal pisaram nas terras de Velmara. Acalme as marés e estabeleça o Marco de Brasa-Alta.',
      en: 'The Cinzal Clans have set foot on Velmara\'s shores. Calm the tides and raise the Highember Outpost.'
    },
    primary: { 'pt-BR': 'Estabelecer a colônia com Vozgul', en: 'Establish the colony outpost with Vozgul' },
    unlocks: { heroes: ['hero_vozgul'] }
  },
  {
    num: 11,
    slug: 'brasa-alta',
    title: { 'pt-BR': 'Brasa-Alta', en: 'Highember' },
    speaker: { 'pt-BR': 'Skarn chefe-de-brasa', en: 'Skarn Ember-Chief' },
    portrait: '👑',
    mapId: 'vales-2v2',
    text: {
      'pt-BR': 'Eu cheguei com a frota principal. Sob a coroa de ferro, esmague a resistência da Liga de Aurelan na savana!',
      en: 'I have arrived with the main fleet. Beneath the iron crown, crush the Aurelan League resistance on the savanna!'
    },
    primary: { 'pt-BR': 'Comandar as forças com Skarn e tomar a savana', en: 'Command forces with Skarn and seize the savanna' },
    unlocks: { heroes: ['hero_skarn'] }
  },
  {
    num: 12,
    slug: 'cidadela-de-brasa-alta',
    title: { 'pt-BR': 'A Cidadela de Brasa-Alta', en: 'Highember Citadel' },
    speaker: { 'pt-BR': 'Skarn chefe-de-brasa', en: 'Skarn Ember-Chief' },
    portrait: '👑',
    mapId: 'planalto-ffa-4p',
    text: {
      'pt-BR': 'Erga a Cidadela de Ferro e feche o mar para sempre. O Marechal Dorian lidera a última carga: destrua-o!',
      en: 'Raise the Iron Citadel and shut the sea forever. Marshal Dorian leads the final charge: destroy him!'
    },
    primary: { 'pt-BR': 'Erguer a cidadela final e fechar o acesso marítimo', en: 'Raise the final citadel and seal the sea passage' },
    unlocks: {}
  }
];

function generateCampaign(faction, missions, dir, campId, campTitle, campSub, campPremise, epilogue) {
  const missionEntries = [];

  missions.forEach((m, idx) => {
    const id = `${campId}-${String(m.num).padStart(2, '0')}-${m.slug}`;
    const prevId = idx > 0 ? missionEntries[idx - 1].id : null;

    const missionDef = {
      format: 'warpolymission',
      version: 1,
      id,
      hidden: true,
      title: m.title,
      subtitle: { 'pt-BR': `${faction === 'human' ? 'Liga de Aurelan' : 'Clãs do Cinzal'}, missão ${m.num}`, en: `${faction === 'human' ? 'Aurelan League' : 'Cinzal Clans'}, mission ${m.num}` },
      briefing: {
        speaker: m.speaker,
        portrait: m.portrait,
        text: m.text,
        hints: [
          { 'pt-BR': 'Concentre-se nos objetivos primários para avançar.', en: 'Focus on primary objectives to advance.' }
        ]
      },
      mapId: m.mapId,
      seed: 9000 + m.num * 17,
      players: [
        { id: 0, name: { 'pt-BR': faction === 'human' ? 'Liga de Aurelan' : 'Clãs do Cinzal', en: faction === 'human' ? 'Aurelan League' : 'Cinzal Clans' }, factionId: faction, team: 0, color: faction === 'human' ? '#2563eb' : '#dc2626', isLocal: true, startSlot: 0 },
        { id: 1, name: { 'pt-BR': faction === 'human' ? 'Clãs do Cinzal' : 'Tropas de Aurelan', en: faction === 'human' ? 'Cinzal Clans' : 'Aurelan Troops' }, factionId: faction === 'human' ? 'orc' : 'human', team: 1, color: faction === 'human' ? '#dc2626' : '#2563eb', isAI: true, startSlot: 1 }
      ],
      startingResources: { wood: 400, gold: 400, stone: 150 },
      setup: [
        { type: 'tag', select: { buildingType: faction === 'human' ? 'great_hall' : 'castle' }, tag: 'enemy_base' }
      ],
      objectives: [
        {
          id: 'primary-main',
          type: 'destroy',
          priority: 'primary',
          select: { tag: 'enemy_base' },
          title: m.primary
        }
      ]
    };

    writeFileSync(join(dir, `m${String(m.num).padStart(2, '0')}-${m.slug}.json`), JSON.stringify(missionDef, null, 2) + '\n');

    const entry = {
      id,
      ...(prevId ? { requires: [prevId], carryOver: { resources: { gold: 0.25, wood: 0.25, stone: 0.25 }, max: 300 } } : {}),
      unlocks: m.unlocks
    };
    missionEntries.push(entry);
  });

  const campaignJson = {
    format: 'warpolycampaign',
    version: 1,
    id: campId,
    factionId: faction,
    track: 'main',
    order: faction === 'human' ? 1 : 2,
    title: campTitle,
    subtitle: campSub,
    premise: campPremise,
    epilogue,
    missions: missionEntries
  };

  writeFileSync(join(dir, 'campaign.json'), JSON.stringify(campaignJson, null, 2) + '\n');
}

generateCampaign(
  'human',
  ALLIANCE_MISSIONS,
  ALLIANCE_DIR,
  'war-alliance',
  { 'pt-BR': 'A Guerra do Mar Fendido (Liga de Aurelan)', en: 'The Sundered Sea War (Aurelan League)' },
  { 'pt-BR': 'A Marcha de Aurelan (12 missões)', en: 'The March of Aurelan (12 missions)' },
  {
    'pt-BR': 'O planeta Ondara despertou para a Guerra do Mar Fendido. Conduza os exércitos de Aurelan através dos Estilhaços, domine as ilhas estratégicas e estabeleça o Bastião supremo em Cinzara.',
    en: 'The world of Ondara has awakened to the Sundered Sea War. Lead the armies of Aurelan through the Shards, claim strategic islands, and establish the supreme Bastion in Cinzara.'
  },
  {
    faction: 'human',
    title: { 'pt-BR': 'O Farol do Outro Lado', en: 'The Lighthouse on the Other Shore' },
    paragraphs: [
      {
        'pt-BR': 'Quando a última torre do Bastião do Cabo Ferrugem foi coroada, o Mar Fendido ficou, pela primeira vez, do lado de Aurelan.',
        en: 'When the last tower of the Cape Rust Bastion was crowned, the Sundered Sea lay, for the first time, on Aurelan\'s side.'
      },
      {
        'pt-BR': 'Mestre Oren redesenhou o mapa com os cadernos de Orsolo: onde havia vazio, agora havia uma fortaleza em terra alheia.',
        en: 'Master Oren redrew the map from Orsolo\'s notebooks: where there had been emptiness, there now stood a fortress on foreign soil.'
      },
      {
        'pt-BR': 'O Marechal Dorian e o Capitão Brann guardam o estreito; a vitória da Liga de Aurelan está gravada nas pedras do mar.',
        en: 'Marshal Dorian and Captain Brann guard the strait; the Aurelan League victory is engraved in the stones of the sea.'
      }
    ],
    credits: { 'pt-BR': 'Fim da Marcha de Aurelan', en: 'End of the March of Aurelan' }
  }
);

generateCampaign(
  'orc',
  HORDE_MISSIONS,
  HORDE_DIR,
  'war-horde',
  { 'pt-BR': 'A Guerra do Mar Fendido (Clãs do Cinzal)', en: 'The Sundered Sea War (Cinzal Clans)' },
  { 'pt-BR': 'O Caminho das Brasas do Cinzal (12 missões)', en: 'The Ember Road of the Cinzal (12 missions)' },
  {
    'pt-BR': 'A terra seca de Cinzara não perdoa. O chefe-de-brasa Skarn uniu os clãs para atravessar o Mar Fendido, tomar os Estilhaços e erguer a Cidadela de Ferro no continente verde.',
    en: 'The dry land of Cinzara forgives no one. Ember-chief Skarn has united the clans to cross the Sundered Sea, take the Shards, and raise the Iron Citadel on the green continent.'
  },
  {
    faction: 'orc',
    title: { 'pt-BR': 'A Brasa que Não se Apaga', en: 'The Ember That Never Dies' },
    paragraphs: [
      {
        'pt-BR': 'Quando a última torre da Cidadela de Brasa-Alta ergueu o estandarte, o Mar Fendido deixou de ser uma muralha e virou estrada.',
        en: 'When the last tower of Highember Citadel raised the banner, the Sundered Sea stopped being a wall and became a road.'
      },
      {
        'pt-BR': 'Drogath acendeu o Fogo do Clã no meio da terra verde, honrando a memória da Anciã Ulma.',
        en: 'Drogath lit the Clan Fire in the middle of the green land, honoring the memory of Elder Ulma.'
      },
      {
        'pt-BR': 'Vozgul e Skarn vigiam o horizonte: o Cinzal nunca mais será fechado por ninguém.',
        en: 'Vozgul and Skarn watch the horizon: the Cinzal will never be sealed off by anyone again.'
      }
    ],
    credits: { 'pt-BR': 'Fim do Caminho das Brasas', en: 'End of the Ember Road' }
  }
);

console.log('Campanhas war-alliance e war-horde geradas com sucesso!');
