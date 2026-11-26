/**
 * tiers.js — F3-06: níveis do Centro da Cidade (`role: 'hq'`).
 *
 * Paço Real → Fortaleza → Castelo de Aldária (Reino Humano)
 * Salão do Clã → Bastião → Cidadela de Ferro (Clãs Orcs)
 *
 * Módulo puro (sem three.js), fonte única destes números (F0-06). `TIER_NAMES` fica local
 * aqui por ora (F6-09/NEW-3 migra nomes para `src/data/names.js` quando existir i18n).
 *
 * F4-07a: o custo do nível 3 inclui `oil: 200` e agora É cobrado (`Player.deduct`/`canAfford` conhecem o
 * 4º recurso; resolve a pendência NEW-24 da F3-06).
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
export const HQ_TIER_HP = { 1: 1600, 2: 2200, 3: 2800 };

/** Armadura do Centro em qualquer nível (igual à armadura atual de `castle`/`great_hall`). */
export const HQ_TIER_ARMOR = 20;

/** Multiplicador de coleta de ouro por nível — consumido por `gatherMultiplier` (F3-04). */
export const HQ_TIER_GOLD_MULT = { 1: 1.0, 2: 1.10, 3: 1.20 };

/**
 * Custo/tempo do upgrade para o nível indicado (2 ou 3). F4-07a: `oil` é cobrado.
 */
export const HQ_UPGRADE_COST = {
  2: { gold: 600, wood: 300, stone: 200, time: 60 },
  3: { gold: 1333, wood: 533, stone: 400, oil: 266, time: 90 }
};

/**
 * ENG-WALL: Centros extras construíveis (Paço Real/Salão do Clã de nível 1 pelo menu do trabalhador). Limite por jogador
 * (inicial + 2), distância mínima entre Centros do mesmo dono e afastamento de bases inimigas (ver `GameManager.canPlaceBuilding`).
 * A obra leva `buildings.castle.buildTime` (30 s, metade do upgrade para o nível 2) e custa o `cost` do próprio tipo.
 */
export const HQ_MAX_PER_PLAYER = 3;
/** Distância mínima (u) entre centros de dois Centros do mesmo dono (vivos ou em obra). */
export const HQ_MIN_DISTANCE = 24;
/** Um Centro novo fica a pelo menos esta distância (u) de qualquer Centro inimigo (hostil). */
export const HQ_ENEMY_CLEARANCE = 40;
/** Mina de ouro a menos de `HQ_ENEMY_MINE_RADIUS` de um Centro hostil é "mina inimiga": o Centro novo fica a `HQ_ENEMY_MINE_CLEARANCE` dela. */
export const HQ_ENEMY_MINE_RADIUS = 36;
export const HQ_ENEMY_MINE_CLEARANCE = 14;

/**
 * M2-33: chave do modelo 3D (`GLB_MODELS`) por facção e nível do Centro. Humanos têm um .glb por nível
 * (`tools/blender/build_hq_human.py`); orcs também têm um .glb por nível (`tools/blender/build_hq_orc.py`; sem ele cai no `great_hall.glb` antigo).
 * Só leitura do render: a simulação nunca usa isto (o checksum do headless não muda).
 */
export const HQ_TIER_MODEL = {
  human: { 1: 'hq_human_1', 2: 'hq_human_2', 3: 'hq_human_3' },
  orc: { 1: 'hq_orc_1', 2: 'hq_orc_2', 3: 'hq_orc_3' }
};

/**
 * M2-33: dimensões VISUAIS do Centro humano por nível (só render; o raio de colisão da simulação continua o de
 * `buildings.castle.collisionRadius` = 5,5 em qualquer nível, então pathfinder e entrega de recursos não mudam).
 * `height` = altura do modelo (y) e `healthBarHeight` = onde fica a barra de vida/chamas; `chimney` = ponto (relativo ao
 * centro, sem rotação) de onde sai a fumaça da chaminé (só o nível 1 tem chaminé); `footprint` = lado da pegada x/z.
 */
export const HQ_TIER_VIEW = {
  1: { height: 9.0, footprint: 6.8, healthBarHeight: 10.0, chimney: { x: 1.3, y: 8.2, z: -1.6 } },
  2: { height: 12.5, footprint: 8.2, healthBarHeight: 13.5, chimney: null },
  3: { height: 15.5, footprint: 8.5, healthBarHeight: 16.5, chimney: null }
};

/**
 * Dimensões VISUAIS do Centro orc por nível (mesmos campos de `HQ_TIER_VIEW`; só render). Salão do Clã -> Bastião -> Cidadela de Ferro.
 * A Cidadela de Ferro não tem chaminé.
 */
export const HQ_TIER_VIEW_ORC = {
  1: { height: 8.0, footprint: 8.6, healthBarHeight: 9.0, chimney: { x: 1.8, y: 7.6, z: -1.8 } },
  2: { height: 11.5, footprint: 8.2, healthBarHeight: 12.5, chimney: { x: 3.4, y: 11.4, z: -1.5 } },
  3: { height: 13.5, footprint: 8.8, healthBarHeight: 14.5, chimney: null }
};

/** Visual do Centro (`HQ_TIER_VIEW`/`HQ_TIER_VIEW_ORC`) da facção e nível; cai no nível 1 da facção. */
export function hqTierView(factionId, tier) {
  const t = factionId === 'orc' ? HQ_TIER_VIEW_ORC : HQ_TIER_VIEW;
  return t[tier] || t[1];
}

/** Nome PT-BR do nível `tier` da facção `factionId` ('human' | 'orc'). */
export function getTierName(factionId, tier) {
  const names = TIER_NAMES[factionId] || TIER_NAMES.human;
  return names[tier] || `Nível ${tier}`;
}

/** Custo {gold, wood, stone, oil, time} para evoluir até `nextTier` (2 ou 3), ou `null`. */
export function getHqUpgradeCost(nextTier) {
  return HQ_UPGRADE_COST[nextTier] || null;
}
