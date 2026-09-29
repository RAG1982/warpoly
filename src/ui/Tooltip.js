/**
 * Tooltip.js (F6-03 — HUD responsiva)
 *
 * Monta o HTML de dentro do balão de dica (`.bld-hint-bubble`) mostrado ao passar o mouse nos
 * botões do card de comandos (construir/treinar/pesquisar): nome + atalho, descrição, custo
 * (ícones, em vermelho quando falta o recurso) e tempo. Um componente único para o conteúdo, em
 * vez de montar o mesmo HTML em cada função de `UIManager.js` — o posicionamento/exibição do
 * balão continua em CSS (`:hover`, já existente).
 */

const RESOURCE_ICON = { gold: '/icoouro.png', wood: '/icomadeira.png', stone: '/icopedra.png' };
const RESOURCE_LABEL = { gold: 'Ouro', wood: 'Madeira', stone: 'Pedra' };

/** HTML de um item de custo; fica em vermelho (`.cost-insufficient`) quando falta o recurso. */
function costItemHtml(type, amount, available) {
  const insufficient = available !== undefined && available < amount;
  return `<span class="bld-cost-item${insufficient ? ' cost-insufficient' : ''}">${amount} <img src="${RESOURCE_ICON[type]}" class="bld-cost-icon" alt="${RESOURCE_LABEL[type]}" /></span>`;
}

/**
 * HTML do custo `{gold?, wood?, stone?}`. Com `resources` (recursos disponíveis do jogador),
 * marca em vermelho cada item que falta (requisito não cumprido).
 */
export function buildCostHtml(cost, resources) {
  if (!cost) return '';
  const parts = [];
  if (cost.gold) parts.push(costItemHtml('gold', cost.gold, resources?.gold));
  if (cost.wood) parts.push(costItemHtml('wood', cost.wood, resources?.wood));
  if (cost.stone) parts.push(costItemHtml('stone', cost.stone, resources?.stone));
  return parts.length > 0 ? parts.join(', ') : 'Sem custo';
}

/**
 * HTML completo do balão de dica: título (com a letra de atalho, se houver), descrição, custo
 * e tempo de treino/construção, e requisitos faltantes (ex.: recursos insuficientes) em vermelho.
 * @param {{
 *   title: string, hotkey?: string, description?: string,
 *   cost?: { gold?: number, wood?: number, stone?: number }, resources?: object,
 *   time?: number, missing?: string[]
 * }} opts
 */
export function buildTooltipHtml(opts) {
  const { title, hotkey, description, cost, resources, time, missing } = opts;
  const header = `
    <div class="bld-hint-header">
      <span class="bld-hint-title">${title}${hotkey ? ` <span class="bld-hint-hotkey">(${hotkey})</span>` : ''}</span>
      ${description ? `<span class="bld-hint-desc">${description}</span>` : ''}
    </div>
  `;

  const footerParts = [];
  if (cost) footerParts.push(`<span class="bld-cost-items">${buildCostHtml(cost, resources)}</span>`);
  if (time) footerParts.push(`<span class="bld-hint-time">⏱ ${time}s</span>`);
  const footer = footerParts.length > 0 ? `<div class="bld-hint-footer">${footerParts.join('')}</div>` : '';

  const missingHtml = missing && missing.length > 0
    ? `<div class="bld-hint-missing">${missing.join(', ')}</div>`
    : '';

  return `<div class="bld-hint-col">${header}${footer}${missingHtml}</div>`;
}
