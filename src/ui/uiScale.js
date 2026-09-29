/**
 * uiScale.js (F6-03 — HUD responsiva)
 *
 * Calcula a variável CSS `--ui-scale` em `document.documentElement`, usada pelos blocos do HUD
 * (topo, minimapa, card de seleção/comandos) para encolher/crescer com a resolução da janela,
 * evitando cortes/sobreposições (B11).
 *
 * escala = clamp(0.75, min(innerWidth/1920, innerHeight/1080) * userScale, 1.5)
 * `userScale` vem de `localStorage['warpoly.uiScale']` (padrão 1, ajustável pelo jogador).
 */

const STORAGE_KEY = 'warpoly.uiScale';
const MIN_SCALE = 0.75;
const MAX_SCALE = 1.5;
const REFERENCE_WIDTH = 1920;
const REFERENCE_HEIGHT = 1080;

function safeGet(key) {
  try { return window.localStorage.getItem(key); } catch { return null; }
}

function safeSet(key, value) {
  try { window.localStorage.setItem(key, value); } catch { /* armazenamento bloqueado */ }
}

/** Lê `userScale` salvo (padrão 1 se ausente/ inválido). */
export function getUserScale() {
  const raw = safeGet(STORAGE_KEY);
  const n = raw !== null ? parseFloat(raw) : NaN;
  return Number.isFinite(n) ? n : 1;
}

/** Salva `userScale` (não faz o clamp final — isso é feito em `computeUiScale`). */
export function setUserScale(value) {
  safeSet(STORAGE_KEY, String(value));
}

/**
 * Calcula a escala final de UI a partir do tamanho da janela e do ajuste do jogador.
 * @param {number} innerWidth
 * @param {number} innerHeight
 * @param {number} userScale
 * @returns {number}
 */
export function computeUiScale(innerWidth, innerHeight, userScale = 1) {
  const fit = Math.min(innerWidth / REFERENCE_WIDTH, innerHeight / REFERENCE_HEIGHT);
  const scale = fit * userScale;
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

/**
 * Aplica `--ui-scale` em `document.documentElement` a partir do tamanho atual da janela e do
 * `userScale` salvo, e registra um listener de `resize` para mantê-la atualizada.
 * @returns {() => void} função para remover o listener (uso em testes/dispose)
 */
export function initUiScale() {
  const root = document.documentElement;

  const apply = () => {
    const scale = computeUiScale(window.innerWidth, window.innerHeight, getUserScale());
    root.style.setProperty('--ui-scale', String(scale));
  };

  apply();
  window.addEventListener('resize', apply);
  return () => window.removeEventListener('resize', apply);
}
