/**
 * hotkeys.js (F6-03 — HUD responsiva)
 *
 * Mapa das letras de atalho mostradas nos botões do card de comandos (construir/treinar/
 * pesquisar). Aqui só se **exibe** a letra — o funcionamento real das teclas é da F3-01.
 */

import { getBuildingDef } from '../data/index.js';

/** Construir: por papel da construção (independe da facção — casa/serraria/fazenda/quartel/forja/torre). */
export const BUILD_HOTKEY_BY_ROLE = {
  house: 'C',
  lumber: 'L',
  farm: 'F',
  barracks: 'B',
  forge: 'K',
  stable: 'V',
  tower: 'T',
  wall: 'M'
};

/** Treinar unidades: posicional, na ordem dos botões (até 3 unidades treináveis por construção). */
export const TRAIN_SLOT_HOTKEYS = ['Q', 'W', 'E'];

/** Pesquisas da forja: posicional, sequência própria para não colidir com o treino (até 4 melhorias). */
export const RESEARCH_SLOT_HOTKEYS = ['R', 'A', 'S', 'D'];

/** Tecla de atalho de um botão "construir" a partir do tipo de construção (`orc_barracks`, `cottage`…). */
export function getBuildHotkey(buildingType) {
  const role = getBuildingDef(buildingType).role;
  return BUILD_HOTKEY_BY_ROLE[role] || '';
}

/** Tecla de atalho de um botão "treinar unidade" pela posição no grid (0-based). */
export function getTrainHotkey(slotIndex) {
  return TRAIN_SLOT_HOTKEYS[slotIndex] || '';
}

/** Tecla de atalho de um botão "pesquisa da forja" pela posição no grid (0-based). */
export function getResearchHotkey(slotIndex) {
  return RESEARCH_SLOT_HOTKEYS[slotIndex] || '';
}
