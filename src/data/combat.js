/**
 * combat.js — F3-03: constante de balanceamento do modelo de combate WC2.
 *
 * DAMAGE_SCALE  Multiplicador aplicado depois do multiplicador aleatório 0,5–1,0
 *               (`src/sim/combat.js`, `computeDamage`). Calibrado para manter o DPS médio
 *               próximo do modelo anterior (`max(2, ataque - armadura)`, sem variação) —
 *               o balanceamento fino é a F3-11.
 */
export const DAMAGE_SCALE = 1.333;

/** F4-04: segundos que o registro de cadáver (`GameManager.corpses`) fica disponível para Erguer Mortos. */
export const CORPSE_LIFETIME = 30;
/** F4-04: capacidade do pool fixo de cadáveres (FIFO: o mais antigo é sobrescrito). */
export const CORPSE_CAPACITY = 64;
/** F4-04: detecção de unidades invisíveis — raio de detectores (unidades `detector`, torre arcana/santuário) e de contato. */
export const DETECT_RADIUS = 12;
export const DETECT_CONTACT_RADIUS = 2;
/** F4-04: dano fixo do Escudo de Chamas por golpe corpo a corpo recebido. */
export const FLAMESHIELD_DAMAGE = 8;

// --- F4-07: petróleo e navegação naval ---
/** Nível da água (Water.js / `mapDef.waterLevel`). */
export const WATER_LEVEL = 0.5;
/** F4-07a: profundidade mínima (`waterLevel − altura`) para uma célula/ponto ser navegável por navios. */
export const NAVAL_MIN_DEPTH = 0.4;
/** F4-07a: altura máxima do terreno em que um navio pode estar (`WATER_LEVEL − NAVAL_MIN_DEPTH`). */
export const NAVAL_MAX_HEIGHT = WATER_LEVEL - NAVAL_MIN_DEPTH;
/** F4-07a: segundos que o petroleiro leva para encher o tanque junto à plataforma (`carry_time`). */
export const OIL_LOAD_TIME = 3;
/** F4-07b: navios só atingem terra/construções a até esta distância (u) da margem navegável. */
export const SHORE_REACH = 2;
/** F4-07b: distância máxima (borda a borda) entre a margem do terrestre e a barcaça para embarcar. */
export const BOARD_DISTANCE = 3;
/** F4-07b: segundos sem atacar até o submersível voltar a mergulhar (invisível). */
export const SUBMERGE_DELAY = 4;
