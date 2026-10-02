/**
 * cursors.js (F6-06) — cursores contextuais (atacar, coletar, construir, reparar, alvo de magia,
 * inválido). Lógica pura (sem DOM/three.js): `classifyHover` descreve a entidade sob o mouse,
 * `cursorKindFor` escolhe o tipo de cursor e `cursorCss` devolve o valor da propriedade CSS `cursor`.
 * O DOM fica em `CursorController`.
 */

/** @typedef {'default'|'attack'|'gather'|'build'|'repair'|'spell'|'invalid'} CursorKind */
export const CURSOR_KINDS = Object.freeze(['default', 'attack', 'gather', 'build', 'repair', 'spell', 'invalid']);

const isWorker = (u) => !!u && (u.type === 'villager' || u.type === 'peon');

/**
 * Classifica a entidade sob o mouse em relação ao jogador local.
 * @returns {'none'|'hostile'|'critter'|'resource'|'depleted'|'ownSite'|'ownDamaged'|'ownBuilding'|'ownUnit'|'ally'|'other'}
 */
export function classifyHover(e, { localId, isHostile }) {
  if (!e) return 'none';
  if (e.isDead || e.isDying) return 'none';
  if (e.species !== undefined) return 'critter';
  if (e.resourcesRemaining !== undefined || e.woodRemaining !== undefined) {
    const left = e.resourcesRemaining !== undefined ? e.resourcesRemaining : e.woodRemaining;
    return left > 0 ? 'resource' : 'depleted';
  }
  if (e.ownerId === undefined || e.ownerId === null) return 'other';
  if (isHostile(localId, e.ownerId)) return 'hostile';
  const isBuilding = 'isConstructed' in e;
  if (e.ownerId === localId) {
    if (isBuilding) {
      if (!e.isConstructed) return 'ownSite';
      if (e.hp < e.maxHp) return 'ownDamaged';
      return 'ownBuilding';
    }
    return 'ownUnit';
  }
  return 'ally';
}

/**
 * Tipo de cursor para o estado atual.
 * @param {object} ctx
 * @param {boolean} [ctx.enabled=true]
 * @param {{kind:string}|null} [ctx.targetMode]  modo-alvo: cast | attackMove | patrol | repair
 * @param {boolean} [ctx.castValid]    cast: o alvo sob o mouse é válido para a habilidade
 * @param {boolean} [ctx.placing]      há uma construção sendo posicionada
 * @param {boolean} [ctx.placeValid]
 * @param {Array<{type:string, isDead?:boolean}>} [ctx.selectedUnits]
 * @param {ReturnType<typeof classifyHover>} [ctx.hover]
 * @returns {CursorKind}
 */
export function cursorKindFor(ctx) {
  if (ctx.enabled === false) return 'default';
  const hover = ctx.hover || 'none';
  const tm = ctx.targetMode;
  if (tm) {
    if (tm.kind === 'cast') return ctx.castValid === false ? 'invalid' : 'spell';
    if (tm.kind === 'repair') return hover === 'ownDamaged' ? 'repair' : 'invalid';
    if (tm.kind === 'attackMove') return 'attack';
    return 'spell'; // patrulhar: alvo no chão
  }
  if (ctx.placing) return ctx.placeValid === false ? 'invalid' : 'build';

  const units = (ctx.selectedUnits || []).filter((u) => !u.isDead);
  if (units.length === 0) return 'default';
  const worker = units.some(isWorker);
  switch (hover) {
    case 'hostile':
    case 'critter': return 'attack';
    case 'resource': return worker ? 'gather' : 'default';
    case 'ownSite': return worker ? 'build' : 'default';
    case 'ownDamaged': return worker ? 'repair' : 'default';
    default: return 'default';
  }
}

// ---------------------------------------------------------------- estilos (SVG embutido)
const svg = (inner) => `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">${inner}</svg>`;
const outline = 'stroke="#000" stroke-opacity=".85" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" fill="none"';
const line = (d, c, w = 2.2) => `<path d="${d}" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`;
const halo = (d) => `<path d="${d}" ${outline}/>`;

const ICONS = {
  // espadas cruzadas (vermelho)
  attack: svg(halo('M7 7 L25 25 M25 7 L7 25') + halo('M5 11 L11 5 M21 5 L27 11') + line('M7 7 L25 25 M25 7 L7 25', '#ff4a3d') + line('M5 11 L11 5 M21 5 L27 11', '#ffd2cc', 2)),
  // picareta (dourado)
  gather: svg(halo('M8 25 L22 11') + halo('M9 12 Q16 5 25 9') + line('M8 25 L22 11', '#e8c066', 2.6) + line('M9 12 Q16 5 25 9', '#ffd75e', 2.6)),
  // martelo (laranja)
  build: svg(halo('M9 24 L20 13') + halo('M14 7 L22 7 L26 11 L18 11 Z') + line('M9 24 L20 13', '#d7a55a', 2.6) + line('M14 7 L22 7 L26 11 L18 11 Z', '#ffb347', 2.2)),
  // chave inglesa (verde)
  repair: svg(halo('M8 25 L19 14') + halo('M18 6 A5 5 0 1 0 26 14 L21 13 L19 11 Z') + line('M8 25 L19 14', '#8ee08e', 2.6) + line('M18 6 A5 5 0 1 0 26 14 L21 13 L19 11 Z', '#b9f5b9', 2)),
  // mira de magia (azul-violeta)
  spell: svg(halo('M16 4 V10 M16 22 V28 M4 16 H10 M22 16 H28') + `<circle cx="16" cy="16" r="6" ${outline}/>` + line('M16 4 V10 M16 22 V28 M4 16 H10 M22 16 H28', '#9ab8ff') + `<circle cx="16" cy="16" r="6" stroke="#b69cff" stroke-width="2.2" fill="none"/>`),
  // proibido (vermelho)
  invalid: svg(`<circle cx="16" cy="16" r="9" ${outline}/>` + halo('M10 22 L22 10') + `<circle cx="16" cy="16" r="9" stroke="#ff5252" stroke-width="2.6" fill="none"/>` + line('M10 22 L22 10', '#ff5252', 2.6))
};

const FALLBACK = { attack: 'crosshair', gather: 'pointer', build: 'pointer', repair: 'pointer', spell: 'crosshair', invalid: 'not-allowed' };

/** Estilos prontos: `{ kind: 'url("data:…") 16 16, fallback' }` (default fica sem entrada). */
export const CURSOR_STYLES = Object.freeze(Object.fromEntries(
  Object.entries(ICONS).map(([k, s]) => [k, `url("data:image/svg+xml,${encodeURIComponent(s)}") 16 16, ${FALLBACK[k]}`])
));

/**
 * Valor CSS de `cursor` para o tipo. `inTargetMode` mantém a mira clássica quando os cursores
 * contextuais estão desligados (comportamento anterior à F6-06). String vazia = cursor padrão.
 */
export function cursorCss(kind, { enabled = true, inTargetMode = false } = {}) {
  if (!enabled) return inTargetMode ? 'crosshair' : '';
  return CURSOR_STYLES[kind] || '';
}

/** Aplica o cursor a um elemento só quando o valor muda. */
export class CursorController {
  constructor(element) {
    this.el = element;
    this._last = null;
  }
  apply(css) {
    if (css === this._last || !this.el) return;
    this._last = css;
    this.el.style.cursor = css;
  }
  dispose() {
    if (this.el) this.el.style.cursor = '';
    this._last = null;
    this.el = null;
  }
}
