/**
 * names.js — Glossário de nomes em PT-BR (NEW-22 + NEW-3).
 *
 * Mapa de tradução para tipos de recursos, estado, e outros rótulos.
 * Usado pela UI (card de seleção) e futuramente pelo i18n (F6-09).
 */

/** Nomes de tipos de recursos em PT-BR */
export const RESOURCE_NAMES = {
  gold: 'Ouro',
  wood: 'Madeira',
  stone: 'Pedra',
  oil: 'Petróleo'
};

/** Rótulos de UI em PT-BR */
export const UI_LABELS = {
  carry: 'Carga',
  atk: 'Ataque',
  def: 'Defesa',
  spd: 'Velocidade'
};

/**
 * Função helper para traduzir nome de recurso.
 * @param {string} resourceType - 'gold', 'wood', 'stone', 'oil'
 * @returns {string} Nome em PT-BR ou o tipo original se não encontrado
 */
export function getResourceName(resourceType) {
  return RESOURCE_NAMES[resourceType] || resourceType;
}
