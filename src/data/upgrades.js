/**
 * upgrades.js — Pesquisas em níveis (F3-07; substitui as 4 pesquisas de nível único da F0-06).
 *
 * `RESEARCH[id]` = { building: 'forge'|'lumber' (role da construção que pesquisa), faction?
 * ('human'|'orc' — ausente = ambas), levels: [{cost, time, bonus?, effect?, requires}], appliesTo?
 * (tipos de unidade afetados), name: {human, orc} }.
 *
 * - `bonus`  soma em stats da unidade: basic → damage.basic, piercing → damage.piercing,
 *            armor → armor, range → attackRange, sight → sightBonus (raio de visão).
 * - `effect` woodMultiplier (coleta de madeira), regen (PV/s), promote ({archer:'ranger',...}).
 * - `requires` no formato de `src/sim/requirements.js` ({hq:N}, {research:'id', level?}, tipo de construção).
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
    appliesTo: ['knight', 'grunt', 'cavalier', 'ogre'], // TODO F4-04: Templário / Ogro Feiticeiro entram aqui
    icon: '/icoEspada.png',
    name: { human: 'Armas Forjadas', orc: 'Lâminas de Guerra' }
  },
  melee_armor: {
    building: 'forge',
    levels: [
      { cost: { gold: 150, wood: 100, stone: 80 }, time: 30, bonus: { armor: 2 }, requires: [] },
      { cost: { gold: 300, wood: 200, stone: 160 }, time: 45, bonus: { armor: 2 }, requires: [{ hq: 2 }] }
    ],
    appliesTo: ['knight', 'grunt', 'cavalier', 'ogre'],
    icon: '/icoEscudo.png',
    name: { human: 'Escudos Reforçados', orc: 'Placas de Ferro' }
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
  }
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
  if (e.promote) parts.push('promove atiradores à classe avançada');
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
