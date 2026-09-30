/**
 * tiers.js — F3-06: níveis do Centro da Cidade (`role: 'hq'`).
 *
 * Paço Real → Fortaleza → Castelo de Aldária (Reino Humano)
 * Salão do Clã → Bastião → Cidadela de Ferro (Clãs Orcs)
 *
 * Módulo puro (sem three.js), fonte única destes números (F0-06). `TIER_NAMES` fica local
 * aqui por ora (F6-09/NEW-3 migra nomes para `src/data/names.js` quando existir i18n).
 *
 * NEW-24: o custo do nível 3 declara `oil: 200` no schema (petróleo), mas nenhum Player tem
 * esse recurso ainda — `Building.startTierUpgrade` só debita gold/wood/stone. O campo fica
 * pronto para a F4-07 ligar o recurso de verdade.
 */

export const TIER_NAMES = {
  human: { 1: 'Paço Real', 2: 'Fortaleza', 3: 'Castelo de Aldária' },
  orc: { 1: 'Salão do Clã', 2: 'Bastião', 3: 'Cidadela de Ferro' }
};

/**
 * PV máximo por nível do Centro (mesmo valor para as duas facções — decisão do design,
 * ver spec F3-06 item 1). NEW-24: alinha `great_hall.hp` (antes 1750) a 1600 no nível 1,
 * igual ao `castle` humano, para as duas facções compartilharem esta tabela.
 */
export const HQ_TIER_HP = { 1: 1400, 2: 1900, 3: 2400 };

/** Armadura do Centro em qualquer nível (igual à armadura atual de `castle`/`great_hall`). */
export const HQ_TIER_ARMOR = 17;

/** Multiplicador de coleta de ouro por nível — consumido por `gatherMultiplier` (F3-04). */
export const HQ_TIER_GOLD_MULT = { 1: 1.0, 2: 1.10, 3: 1.20 };

/**
 * Custo/tempo do upgrade para o nível indicado (2 ou 3). `oil` é declarado e ignorado
 * até a F4-07 (ver NEW-24 acima).
 */
export const HQ_UPGRADE_COST = {
  2: { gold: 1000, wood: 400, stone: 300, time: 60 },
  3: { gold: 2000, wood: 800, stone: 600, oil: 200, time: 90 }
};

/** Modelo 3D por nível — todos `null` nesta fase (F7 troca o modelo; ver spec item 3). */
export const HQ_TIER_MODEL = { 1: null, 2: null, 3: null };

/** Nome PT-BR do nível `tier` da facção `factionId` ('human' | 'orc'). */
export function getTierName(factionId, tier) {
  const names = TIER_NAMES[factionId] || TIER_NAMES.human;
  return names[tier] || `Nível ${tier}`;
}

/** Custo {gold, wood, stone, oil, time} para evoluir até `nextTier` (2 ou 3), ou `null`. */
export function getHqUpgradeCost(nextTier) {
  return HQ_UPGRADE_COST[nextTier] || null;
}
