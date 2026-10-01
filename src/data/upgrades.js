/**
 * upgrades.js — Pesquisas em níveis (F3-07; substitui as 4 pesquisas de nível único da F0-06).
 *
 * `RESEARCH[id]` = { building: 'forge'|'lumber'|'arcane'|'temple' (role da construção que pesquisa), faction?
 * ('human'|'orc' — ausente = ambas), levels: [{cost, time, bonus?, effect?, requires}], appliesTo?
 * (tipos de unidade afetados), name: {human, orc} }.
 *
 * - `bonus`  soma em stats da unidade: basic → damage.basic, piercing → damage.piercing,
 *            armor → armor, range → attackRange, sight → sightBonus (raio de visão).
 * - `effect` woodMultiplier (coleta de madeira), regen (PV/s), promote ({archer:'ranger',...}).
 * - `requires` no formato de `src/sim/requirements.js` ({hq:N}, {research:'id', level?}, {role:'workshop'} (F4-02: construção concluída de qualquer tipo com esse `role`), tipo de construção).
 *
 * `UPGRADE_CONFIG`/`FORGE_UPGRADES` continuam exportados, derivados de `RESEARCH`, para os
 * consumidores antigos (UI/eventos). Valores iniciais — balanceamento na F3-11.
 */

export const RESEARCH = {
  melee_weapons: {
    building: 'forge',
    levels: [
      { cost: { gold: 200, wood: 100 }, time: 30, bonus: { basic: 2 }, requires: [] },
      { cost: { gold: 400, wood: 200 }, time: 45, bonus: { basic: 2 }, requires: [{ hq: 2 }] }
    ],
    appliesTo: ['knight', 'grunt', 'cavalier', 'ogre', 'templar', 'ogre_mage'],
    icon: '/icoEspada.png',
    name: { human: 'Armas Forjadas', orc: 'Lâminas de Guerra' }
  },
  melee_armor: {
    building: 'forge',
    levels: [
      { cost: { gold: 150, wood: 100, stone: 80 }, time: 30, bonus: { armor: 2 }, requires: [] },
      { cost: { gold: 300, wood: 200, stone: 160 }, time: 45, bonus: { armor: 2 }, requires: [{ hq: 2 }] }
    ],
    appliesTo: ['knight', 'grunt', 'cavalier', 'ogre', 'templar', 'ogre_mage'],
    icon: '/icoEscudo.png',
    name: { human: 'Escudos Reforçados', orc: 'Placas de Ferro' }
  },
  // F4-02: cerco (Balista/Catapulta); o nível 1 exige a Oficina da facção construída.
  siege_damage: {
    building: 'forge',
    levels: [
      { cost: { gold: 300, wood: 300 }, time: 40, bonus: { basic: 15 }, requires: [{ role: 'workshop' }] },
      { cost: { gold: 600, wood: 500 }, time: 60, bonus: { basic: 15 }, requires: [{ hq: 2 }] }
    ],
    appliesTo: ['ballista', 'catapult'],
    icon: '/icoEspada.png',
    name: { human: 'Munição Explosiva', orc: 'Pedras Incendiárias' }
  },
  ranged_ammo: {
    building: 'lumber',
    levels: [
      { cost: { gold: 200, wood: 100 }, time: 30, bonus: { piercing: 1 }, requires: [] },
      { cost: { gold: 400, wood: 200 }, time: 45, bonus: { piercing: 1 }, requires: [{ hq: 2 }] }
    ],
    appliesTo: ['archer', 'axethrower', 'ranger', 'berserker'],
    icon: '/icoArco.png',
    name: { human: 'Flechas de Aço', orc: 'Machados Balanceados' }
  },
  woodcutting: {
    building: 'lumber',
    levels: [
      { cost: { gold: 300, wood: 150 }, time: 40, effect: { woodMultiplier: 1.25 }, requires: [] }
    ],
    icon: '/icoSerraria.svg',
    name: { human: 'Ofício do Lenhador', orc: 'Ofício do Lenhador' }
  },
  ranged_class: {
    building: 'lumber',
    levels: [
      { cost: { gold: 800 }, time: 60, effect: { promote: { archer: 'ranger', axethrower: 'berserker' } }, requires: [{ hq: 2 }] }
    ],
    icon: '/icoArco.png',
    name: { human: 'Treinamento de Patrulheiro', orc: 'Ritual do Enfurecido' }
  },
  // Classe avançada (1 nível cada; requer ranged_class).
  ranger_longbow: {
    building: 'lumber', faction: 'human',
    levels: [{ cost: { gold: 500 }, time: 40, bonus: { range: 2 }, requires: [{ research: 'ranged_class' }] }],
    appliesTo: ['ranger'], icon: '/icoArco.png', name: { human: 'Arco Longo' }
  },
  ranger_sight: {
    building: 'lumber', faction: 'human',
    levels: [{ cost: { gold: 1500 }, time: 50, bonus: { sight: 4 }, requires: [{ research: 'ranged_class' }] }],
    appliesTo: ['ranger'], icon: '/icoArco.png', name: { human: 'Visão Aguçada' }
  },
  ranger_marksman: {
    building: 'lumber', faction: 'human',
    levels: [{ cost: { gold: 2500 }, time: 60, bonus: { piercing: 3 }, requires: [{ research: 'ranged_class' }] }],
    appliesTo: ['ranger'], icon: '/icoArco.png', name: { human: 'Pontaria' }
  },
  berserker_range: {
    building: 'lumber', faction: 'orc',
    levels: [{ cost: { gold: 500 }, time: 40, bonus: { range: 2 }, requires: [{ research: 'ranged_class' }] }],
    appliesTo: ['berserker'], icon: '/icoArco.png', name: { orc: 'Arremesso Longo' }
  },
  berserker_regen: {
    building: 'lumber', faction: 'orc',
    levels: [{ cost: { gold: 1500 }, time: 50, effect: { regen: 1 }, requires: [{ research: 'ranged_class' }] }],
    appliesTo: ['berserker'], icon: '/icoArco.png', name: { orc: 'Regeneração' }
  },
  berserker_fury: {
    building: 'lumber', faction: 'orc',
    levels: [{ cost: { gold: 2500 }, time: 60, bonus: { piercing: 3 }, requires: [{ research: 'ranged_class' }] }],
    appliesTo: ['berserker'], icon: '/icoArco.png', name: { orc: 'Fúria' }
  },
  // F4-04: magias (Torre Arcana / Santuário das Cinzas, `role: 'arcane'`). Cada pesquisa libera uma
  // habilidade (`effect.unlock` = id em `src/data/abilities.js`; o requisito real é `{research}` da habilidade).
  spell_fireball: {
    building: 'arcane', faction: 'human',
    levels: [{ cost: { gold: 300 }, time: 40, effect: { unlock: 'fireball' }, requires: [] }],
    icon: '/icoEspada.png', name: { human: 'Bola de Fogo' }
  },
  spell_slow: {
    building: 'arcane', faction: 'human',
    levels: [{ cost: { gold: 250 }, time: 35, effect: { unlock: 'slow' }, requires: [] }],
    icon: '/icoEscudo.png', name: { human: 'Lentidão' }
  },
  spell_flameshield: {
    building: 'arcane', faction: 'human',
    levels: [{ cost: { gold: 350 }, time: 45, effect: { unlock: 'flameshield' }, requires: [] }],
    icon: '/icoEscudo.png', name: { human: 'Escudo de Chamas' }
  },
  spell_invisibility: {
    building: 'arcane', faction: 'human',
    levels: [{ cost: { gold: 500 }, time: 50, effect: { unlock: 'invisibility' }, requires: [] }],
    icon: '/icoEscudo.png', name: { human: 'Invisibilidade' }
  },
  spell_polymorph: {
    building: 'arcane', faction: 'human',
    levels: [{ cost: { gold: 500 }, time: 50, effect: { unlock: 'polymorph' }, requires: [] }],
    icon: '/icoEscudo.png', name: { human: 'Transmutação' }
  },
  spell_blizzard: {
    building: 'arcane', faction: 'human',
    levels: [{ cost: { gold: 600 }, time: 60, effect: { unlock: 'blizzard' }, requires: [] }],
    icon: '/icoEscudo.png', name: { human: 'Nevasca' }
  },
  spell_death_touch: {
    building: 'arcane', faction: 'orc',
    levels: [{ cost: { gold: 300 }, time: 40, effect: { unlock: 'death_touch' }, requires: [] }],
    icon: '/icoEspada.png', name: { orc: 'Toque da Morte' }
  },
  spell_haste: {
    building: 'arcane', faction: 'orc',
    levels: [{ cost: { gold: 250 }, time: 35, effect: { unlock: 'haste_spell' }, requires: [] }],
    icon: '/icoEscudo.png', name: { orc: 'Pressa' }
  },
  spell_raise_dead: {
    building: 'arcane', faction: 'orc',
    levels: [{ cost: { gold: 400 }, time: 45, effect: { unlock: 'raise_dead' }, requires: [] }],
    icon: '/icoEscudo.png', name: { orc: 'Erguer Mortos' }
  },
  spell_unholy_armor: {
    building: 'arcane', faction: 'orc',
    levels: [{ cost: { gold: 400 }, time: 45, effect: { unlock: 'unholy_armor' }, requires: [] }],
    icon: '/icoEscudo.png', name: { orc: 'Armadura Profana' }
  },
  spell_ash_cloud: {
    building: 'arcane', faction: 'orc',
    levels: [{ cost: { gold: 600 }, time: 60, effect: { unlock: 'ash_cloud' }, requires: [] }],
    icon: '/icoEscudo.png', name: { orc: 'Nuvem de Cinzas' }
  },
  spell_whirlwind: {
    building: 'arcane', faction: 'orc',
    levels: [{ cost: { gold: 800 }, time: 60, effect: { unlock: 'whirlwind' }, requires: [] }],
    icon: '/icoEscudo.png', name: { orc: 'Redemoinho' }
  },
  // F4-04b: Templo da Luz / Altar das Tempestades (`role: 'temple'`). `cavalry_class` promove Cavaleiro → Templário e
  // Ogro → Ogro Feiticeiro (mecanismo `promote`); as magias dos novos conjuradores exigem a classe.
  cavalry_class: {
    building: 'temple',
    levels: [{ cost: { gold: 1000 }, time: 60, effect: { promote: { cavalier: 'templar', ogre: 'ogre_mage' } }, requires: [{ hq: 3 }] }],
    icon: '/icoEspada.png', name: { human: 'Ordenação', orc: 'Ritual das Tempestades' }
  },
  spell_holy_vision: {
    building: 'temple', faction: 'human',
    levels: [{ cost: { gold: 500 }, time: 40, effect: { unlock: 'holy_vision' }, requires: [{ research: 'cavalry_class' }] }],
    icon: '/icoArco.png', name: { human: 'Vista Sagrada' }
  },
  spell_heal: {
    building: 'temple', faction: 'human',
    levels: [{ cost: { gold: 700 }, time: 45, effect: { unlock: 'heal' }, requires: [{ research: 'cavalry_class' }] }],
    icon: '/icoEscudo.png', name: { human: 'Cura' }
  },
  spell_exorcism: {
    building: 'temple', faction: 'human',
    levels: [{ cost: { gold: 1000 }, time: 60, effect: { unlock: 'exorcism' }, requires: [{ research: 'cavalry_class' }] }],
    icon: '/icoEspada.png', name: { human: 'Exorcismo' }
  },
  spell_eye: {
    building: 'temple', faction: 'orc',
    levels: [{ cost: { gold: 500 }, time: 40, effect: { unlock: 'eye_of_watch' }, requires: [{ research: 'cavalry_class' }] }],
    icon: '/icoArco.png', name: { orc: 'Olho Vigia' }
  },
  spell_bloodlust: {
    building: 'temple', faction: 'orc',
    levels: [{ cost: { gold: 700 }, time: 45, effect: { unlock: 'bloodlust' }, requires: [{ research: 'cavalry_class' }] }],
    icon: '/icoEspada.png', name: { orc: 'Sede de Batalha' }
  },
  spell_runes: {
    building: 'temple', faction: 'orc',
    levels: [{ cost: { gold: 1000 }, time: 60, effect: { unlock: 'runes' }, requires: [{ research: 'cavalry_class' }] }],
    icon: '/icoEscudo.png', name: { orc: 'Runas Explosivas' }
  },
};

/** Ids das pesquisas de uma construção (`role`) para a facção dada (ausente = todas). */
export function researchIdsFor(role, factionId = null) {
  return Object.keys(RESEARCH).filter(id => {
    const r = RESEARCH[id];
    return r.building === role && (!r.faction || !factionId || r.faction === factionId);
  });
}

export function getMaxResearchLevel(id) {
  const r = RESEARCH[id];
  return r ? r.levels.length : 0;
}

/** Nome da pesquisa na facção (cai para a outra facção se só houver uma). */
export function researchName(id, factionId = 'human') {
  const r = RESEARCH[id];
  if (!r) return id;
  return r.name[factionId] || r.name.human || r.name.orc || id;
}

/** `researchLevels` = Map<id, nível> (ou null). */
function levelOf(researchLevels, id) {
  return (researchLevels && researchLevels.get(id)) || 0;
}

/**
 * Maior `effect[key]` numérico entre os níveis já concluídos de todas as pesquisas (ou
 * `fallback`). Usado por `gatherMultiplier` (woodMultiplier).
 */
export function researchEffect(researchLevels, key, fallback = 0) {
  let v = fallback;
  for (const id of Object.keys(RESEARCH)) {
    const lv = levelOf(researchLevels, id);
    for (let l = 0; l < lv; l++) {
      const e = RESEARCH[id].levels[l].effect;
      if (e && typeof e[key] === 'number') v = Math.max(v, e[key]);
    }
  }
  return v;
}

/**
 * Tipo em que `unitType` foi promovido para o jogador (ex.: 'archer' → 'ranger'), ou o próprio
 * `unitType`. Se `factionOf` e `factionId` forem dados, ignora promoções para outra facção.
 * @param {string} unitType
 * @param {Map<string,number>} researchLevels
 * @param {((type:string)=>string)|null} [factionOf]
 * @param {string|null} [factionId]
 */
export function promotedType(unitType, researchLevels, factionOf = null, factionId = null) {
  for (const id of Object.keys(RESEARCH)) {
    if (levelOf(researchLevels, id) < 1) continue;
    const e = RESEARCH[id].levels[0].effect;
    const to = e && e.promote && e.promote[unitType];
    if (to && (!factionOf || !factionId || factionOf(to) === factionId)) return to;
  }
  return unitType;
}

/** Texto PT-BR curto do efeito de um nível (tooltip da HUD). */
export function describeLevel(id, level) {
  const r = RESEARCH[id];
  const lv = r && r.levels[level - 1];
  if (!lv) return '';
  const parts = [];
  const b = lv.bonus || {};
  if (b.basic) parts.push(`+${b.basic} dano básico`);
  if (b.piercing) parts.push(`+${b.piercing} dano perfurante`);
  if (b.armor) parts.push(`+${b.armor} armadura`);
  if (b.range) parts.push(`+${b.range} alcance`);
  if (b.sight) parts.push(`+${b.sight} visão`);
  const e = lv.effect || {};
  if (e.woodMultiplier) parts.push(`+${Math.round((e.woodMultiplier - 1) * 100)}% madeira coletada`);
  if (e.regen) parts.push(`regenera ${e.regen} PV/s`);
  if (e.promote) parts.push('promove as unidades à classe avançada');
  if (e.unlock) parts.push('libera a magia para os conjuradores');
  return parts.join(', ');
}

// ---------------------------------------------------------------------------
// Derivados de compatibilidade (UI/eventos antigos). `cost` = custo do nível 1 + `time`.
// ---------------------------------------------------------------------------

export const UPGRADE_CONFIG = Object.fromEntries(
  Object.entries(RESEARCH).map(([id, r]) => [id, {
    id,
    building: r.building,
    faction: r.faction || null,
    maxLevel: r.levels.length,
    name: { human: r.name.human || r.name.orc, orc: r.name.orc || r.name.human },
    description: { human: describeLevel(id, 1), orc: describeLevel(id, 1) },
    icon: r.icon,
    cost: { ...r.levels[0].cost, time: r.levels[0].time },
    requires: r.levels[0].requires,
    appliesTo: (unitType) => !r.appliesTo || r.appliesTo.includes(unitType)
  }])
);

export const FORGE_UPGRADES = Object.keys(RESEARCH).filter(id => RESEARCH[id].building === 'forge');
