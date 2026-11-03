/**
 * src/ui/worldMap.js (M2-08) — mapa-múndi de Ondara como fundo da lista de missões da tela de campanha
 * (MUNDO-TERRENO-MAPAS §4). É só uma ilustração: arte + 12 pinos (botões HTML reais, posicionados em %),
 * rota decorativa e nome da ilha. A lógica (posições, estados, rótulos) fica em `worldMapModel.js` (puro).
 *
 * Arte: usa `public/art/world/mapa-mundi-clean.(webp|jpg)` (sem texto) quando existe; senão a arte antiga, que
 * tem texto em inglês gravado, com uma cartela cobrindo a faixa de título (decisão D5).
 * Fonte: Cinzel (já carregada pelo `style.css`; sem dependência nova) com fallback serif.
 */
import './worldMap.css';
import { buildWorldMapModel, worldMapArtCandidates, nextMarkerIndex } from './worldMapModel.js';
import { getLanguage, t } from '../i18n/index.js';

const BASE = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL) || '/';

// Arquivos de arte existentes em public/art/world, injetados pelo vite.config.js (`define`); null = desconhecido (testes).
/* global __WORLD_ART_FILES__ */
const ART_FILES = typeof __WORLD_ART_FILES__ !== 'undefined' ? __WORLD_ART_FILES__ : null;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Primeira arte disponível (a "clean" ganha da antiga). */
export function pickWorldMapArt(base = BASE, have = ART_FILES) {
  return worldMapArtCandidates(base, have)[0] || null;
}

const ICON = { completed: '✔', current: '', available: '', locked: '🔒' };

/**
 * Markup do mapa (testável em Node).
 * @param {object} o  ver `buildWorldMapModel` (+ `art`: {url, clean})
 */
export function worldMapHtml({ art = pickWorldMapArt(), ...o } = {}) {
  const lang = o.lang || getLanguage();
  const model = buildWorldMapModel({ ...o, lang, t });
  const rect = (r) => `left:${r.x}%;top:${r.y}%;width:${r.w}%;height:${r.h}%`;
  const roving = model.markers.find((m) => m.selected) || model.markers.find((m) => m.state === 'current') || model.markers[0];
  const route = model.route.map((r) => `<line class="wm-route${r.done ? ' wm-route--done' : ''}" x1="${r.x1}" y1="${r.y1}" x2="${r.x2}" y2="${r.y2}"/>`).join('');
  const pins = model.markers.map((m) => {
    const tipSide = m.x > 70 ? ' wm-pin--tip-left' : m.x < 20 ? ' wm-pin--tip-right' : '';
    return `<button type="button" class="wm-pin${tipSide}" data-cp="pick" data-id="${esc(m.id)}" data-state="${m.state}" data-status="${m.state === 'completed' ? 'completed' : m.state === 'locked' ? 'locked' : 'available'}"`
      + ` style="left:${m.x}%;top:${m.y}%" aria-label="${esc(m.label)}" aria-current="${m.selected}" tabindex="${m === roving ? 0 : -1}">`
      + `<span class="wm-pin-n" aria-hidden="true">${ICON[m.state] || m.n}</span>`
      + `<span class="wm-tip" aria-hidden="true"><b>${m.n}. ${esc(m.title)}</b><i>${esc(m.place)}</i></span></button>`;
  }).join('');
  const sel = model.markers.find((m) => m.selected);
  const clean = !!(art && art.clean);
  const title = `<div class="wm-title${clean ? ' wm-title--scroll' : ' wm-title--cartela'}" style="${rect(clean ? model.scroll : model.cartela)}" aria-hidden="true"><span>${esc(model.title)}</span></div>`;
  return `<div class="wm" style="--wm-aspect:${model.aspect}" data-art="${clean ? 'clean' : 'legacy'}">`
    + `<div class="wm-frame" role="group" aria-label="${esc(t('worldmap.aria', { title: model.title, n: model.count }))}">`
    + (art ? `<img class="wm-art" src="${esc(art.url)}" alt="" draggable="false">` : '')
    + title
    + `<svg class="wm-routes" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">${route}</svg>`
    + pins
    + `</div>`
    + (sel ? `<p class="wm-caption" aria-hidden="true"><b>${sel.n}. ${esc(sel.title)}</b> <i>${esc(sel.place)}</i></p>` : '')
    + `</div>`;
}

/** Setas/Home/End movem o foco entre os pinos; Enter/Espaço já ativam o botão (clique → `data-cp="pick"`). */
export function attachWorldMapKeys(container) {
  const onKey = (e) => {
    const pin = e.target.closest?.('.wm-pin');
    if (!pin) return;
    const pins = [...container.querySelectorAll('.wm-pin')];
    const i = pins.indexOf(pin);
    const j = nextMarkerIndex(i, e.key, pins.length);
    if (j === i || j < 0) return;
    e.preventDefault();
    e.stopPropagation();
    pins.forEach((p) => { p.tabIndex = -1; });
    pins[j].tabIndex = 0;
    pins[j].focus();
  };
  container.addEventListener('keydown', onKey);
  return () => container.removeEventListener('keydown', onKey);
}

export { generateWorldMapSvg } from './worldMapSvg.js';
