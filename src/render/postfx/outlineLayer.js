/**
 * outlineLayer.js (F7-03) — marca as malhas de uma entidade selecionada na camada de máscara do contorno.
 * As malhas continuam na camada 0 (visíveis para a câmera principal); a camada 12 só é lida pelo passe de máscara
 * do `PostFX`, que renderiza apenas o que está marcado. Se o contorno estiver desligado nos presets, marcar é inofensivo.
 */
export const OUTLINE_LAYER = 12;

/** Nomes que não fazem parte do corpo (anel, barras de vida/mana, marcador de rally, decalques). */
const SKIP = /^(SelectionRing|HealthBar|HealthBg|HealthFill|ManaBg|ManaFill|Rally|Decal)/;

let marked = 0;

/** Quantidade de raízes marcadas (o passe de máscara só roda se > 0). */
export function outlineCount() { return marked; }

/**
 * Liga/desliga a camada de contorno nas malhas de `root`. Chame só na TRANSIÇÃO de seleção (não por frame).
 * @returns {boolean} novo estado
 */
export function setOutlined(root, on) {
  if (!root) return false;
  const walk = (o) => {
    if (SKIP.test(o.name)) return;
    if (o.isMesh || o.isSkinnedMesh) {
      if (on) o.layers.enable(OUTLINE_LAYER); else o.layers.disable(OUTLINE_LAYER);
    }
    for (let i = 0; i < o.children.length; i++) walk(o.children[i]);
  };
  walk(root);
  return on;
}

/** Atualiza o contador conforme a transição de uma view (`prev` → `next`). */
export function trackOutline(prev, next) {
  if (prev === next) return;
  marked = Math.max(0, marked + (next ? 1 : -1));
}

/**
 * Sincroniza o estado de contorno de uma view (guarda `view._outlineOn`); custa um `if` por frame quando nada muda.
 * Após trocar o modelo da view, zere `view._outlineOn = false` para remarcar as malhas novas.
 */
export function syncOutline(view, root, on) {
  on = !!on;
  if (view._outlineOn === on || (!view._outlineOn && !on)) return;
  view._outlineOn = on;
  setOutlined(root, on);
  trackOutline(!on, on);
}

/** Esquece a marcação de uma view cujas malhas foram trocadas/descartadas (ajusta o contador). */
export function resetOutline(view) {
  if (view._outlineOn) trackOutline(true, false);
  view._outlineOn = false;
}
