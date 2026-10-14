/**
 * src/ui/worldMap.js
 * Componente do Mapa-Múndi de Ondara (MUNDO-TERRENO-MAPAS §4, MUNDO-HISTORIA-CAMPANHA §7.2).
 * Renderiza os continentes Velmara e Cinzara, os Estilhaços no Mar Fendido,
 * rota pontilhada e marcadores interativos de missão da campanha.
 */
import './worldMap.css';
import worldMapData from '../data/campaigns/world-map.json';
import { localize } from '../sim/missions/text.js';
import { getLanguage, t } from '../i18n/index.js';

const esc = (s) => String(s || '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[c]);

/**
 * Gera o markup SVG puro do mapa-múndi para a campanha informada (testável em Node).
 * @param {object} opts
 * @param {object} opts.campaignDef Definição da campanha (war-alliance ou war-horde)
 * @param {import('../campaign/progress.js').CampaignProgress} [opts.progress]
 * @param {string} [opts.selectedMissionId] ID da missão atualmente selecionada
 * @param {boolean} [opts.unlockAll] Modo depuração ?campaign=unlock
 * @param {string} [opts.lang] Idioma ('pt-BR' ou 'en')
 * @returns {string} Markup SVG
 */
export function generateWorldMapSvg({
  campaignDef,
  progress = null,
  selectedMissionId = null,
  unlockAll = false,
  lang = 'pt-BR'
} = {}) {
  const data = worldMapData;
  const width = data.bounds.width;
  const height = data.bounds.height;
  const stages = (campaignDef && data.campaignStages[campaignDef.id]) || [];

  const completed = (campaignDef && progress) ? progress.completed(campaignDef.id) : {};
  const opts = { unlockAll };

  // Continentes
  const velmara = data.continents.find((c) => c.id === 'velmara');
  const cinzara = data.continents.find((c) => c.id === 'cinzara');

  // Ilhas
  const islandsSvg = data.islands.map((isl) => {
    const isSmoke = isl.icon === 'smoke';
    const name = localize(isl.name, lang);
    return `
      <g class="world-map-island" data-island-id="${esc(isl.id)}">
        <path d="${isl.path}" />
        <text class="world-map-label world-map-label--sub" x="${isl.x}" y="${isl.y + isl.radius + 12}">${esc(name)}</text>
        ${isSmoke ? `<text x="${isl.x}" y="${isl.y - 4}" text-anchor="middle" font-size="14">🌋</text>` : ''}
      </g>
    `;
  }).join('');

  // Rota pontilhada entre os estágios da campanha
  let routeSvg = '';
  if (stages.length > 1) {
    const pts = stages.map((s) => `${s.x},${s.y}`).join(' ');
    routeSvg = `<polyline class="world-map-route" points="${pts}" />`;
  }

  // Marcadores de missão
  const markersSvg = (campaignDef ? campaignDef.missions : []).map((entry, idx) => {
    const stage = stages[idx];
    if (!stage) return '';

    let status = 'locked';
    if (unlockAll) {
      status = completed[entry.id] ? 'completed' : 'available';
    } else if (progress) {
      status = progress.status(campaignDef, entry.id, opts);
    } else if (idx === 0) {
      status = 'available';
    }

    const isSelected = entry.id === selectedMissionId;
    const missionNum = idx + 1;
    const x = stage.x;
    const y = stage.y;

    let markerContent = '';
    if (status === 'completed') {
      markerContent = `
        <circle cx="${x}" cy="${y}" r="14" fill="#8c6a1e" stroke="#ffe39a" stroke-width="2"/>
        <text x="${x}" y="${y + 4}" text-anchor="middle" font-size="12" fill="#fff" font-weight="bold">✔</text>
      `;
    } else if (status === 'available') {
      markerContent = `
        <circle class="world-map-marker-pulse" cx="${x}" cy="${y}" r="15" fill="#1e3a5f" stroke="#ffea9f" stroke-width="2.5"/>
        <text x="${x}" y="${y + 4.5}" text-anchor="middle" font-size="11" fill="#ffea9f" font-weight="bold">${missionNum}</text>
      `;
    } else {
      markerContent = `
        <circle cx="${x}" cy="${y}" r="12" fill="#151b24" stroke="#556070" stroke-width="1.5" opacity="0.65"/>
        <text x="${x}" y="${y + 4}" text-anchor="middle" font-size="10" fill="#7a889b">🔒</text>
      `;
    }

    const selRing = isSelected ? `
      <circle cx="${x}" cy="${y}" r="20" fill="none" stroke="#fff6d8" stroke-width="2" stroke-dasharray="3,3"/>
    ` : '';

    return `
      <g class="world-map-marker" data-mission-id="${esc(entry.id)}" data-status="${status}" tabindex="0" role="button" aria-label="${esc(localize(stage.name, lang))} (${status})">
        ${selRing}
        ${markerContent}
      </g>
    `;
  }).join('');

  const titleSea = localize(data.sea.name, lang);
  const titleVelmara = velmara ? localize(velmara.name, lang) : 'Velmara';
  const titleCinzara = cinzara ? localize(cinzara.name, lang) : 'Cinzara';

  return `
    <svg class="world-map-svg" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="ocean-glow" cx="50%" cy="50%" r="55%">
          <stop offset="0%" stop-color="#121e33" />
          <stop offset="100%" stop-color="#080d17" />
        </radialGradient>
      </defs>

      <!-- Fundo do oceano -->
      <rect width="${width}" height="${height}" fill="url(#ocean-glow)" class="world-map-sea" />

      <!-- Linhas decorativas do mar (paralelos e meridianos antigos) -->
      <g stroke="rgba(212,175,55,0.08)" stroke-width="1">
        <line x1="0" y1="200" x2="${width}" y2="200" />
        <line x1="0" y1="400" x2="${width}" y2="400" />
        <line x1="0" y1="600" x2="${width}" y2="600" />
        <line x1="300" y1="0" x2="300" y2="${height}" />
        <line x1="600" y1="0" x2="600" y2="${height}" />
        <line x1="900" y1="0" x2="900" y2="${height}" />
      </g>

      <!-- Rosa dos Ventos central -->
      <g transform="translate(600, 390)" opacity="0.16">
        <circle r="120" fill="none" stroke="#d4af37" stroke-width="1.5" stroke-dasharray="4,4"/>
        <polygon points="0,-100 12,-20 0,0 -12,-20" fill="#d4af37"/>
        <polygon points="0,100 12,20 0,0 -12,20" fill="#d4af37"/>
        <polygon points="-100,0 -20,12 0,0 -20,-12" fill="#d4af37"/>
        <polygon points="100,0 20,12 0,0 20,-12" fill="#d4af37"/>
      </g>

      <!-- Continente Velmara (Oeste) -->
      ${velmara ? `
        <path class="world-map-land-velmara" d="${velmara.path}" />
        <text class="world-map-label" x="${velmara.labelPos.x}" y="${velmara.labelPos.y}" font-size="28">${esc(titleVelmara)}</text>
        <text class="world-map-label world-map-label--sub" x="${velmara.labelPos.x}" y="${velmara.labelPos.y + 24}">${esc(t('worldmap.allianceTag'))}</text>
      ` : ''}

      <!-- Continente Cinzara (Leste) -->
      ${cinzara ? `
        <path class="world-map-land-cinzara" d="${cinzara.path}" />
        <text class="world-map-label" x="${cinzara.labelPos.x}" y="${cinzara.labelPos.y}" font-size="28">${esc(titleCinzara)}</text>
        <text class="world-map-label world-map-label--sub" x="${cinzara.labelPos.x}" y="${cinzara.labelPos.y + 24}">${esc(t('worldmap.hordeTag'))}</text>
      ` : ''}

      <!-- Rótulo do Mar Fendido -->
      <text class="world-map-label" x="${data.sea.labelPos.x}" y="${data.sea.labelPos.y}" font-size="22" letter-spacing="0.3em">${esc(titleSea)}</text>
      <text class="world-map-label world-map-label--sub" x="${data.sea.labelPos.x}" y="${data.sea.labelPos.y + 20}">${esc(t('worldmap.shards'))}</text>

      <!-- Ilhas dos Estilhaços -->
      ${islandsSvg}

      <!-- Rota da campanha -->
      ${routeSvg}

      <!-- Marcadores de missão -->
      ${markersSvg}
    </svg>
  `;
}

export class WorldMap {
  /**
   * @param {object} o
   * @param {object} o.campaignDef Definição da campanha
   * @param {import('../campaign/progress.js').CampaignProgress} o.progress
   * @param {string} [o.selectedMissionId]
   * @param {boolean} [o.unlockAll]
   * @param {(missionId: string) => void} [o.onSelectMission]
   * @param {(campaignId: string, missionId: string) => void} [o.onStartMission]
   */
  constructor({
    campaignDef = null,
    progress = null,
    selectedMissionId = null,
    unlockAll = false,
    onSelectMission = null,
    onStartMission = null
  } = {}) {
    this.campaignDef = campaignDef;
    this.progress = progress;
    this.selectedMissionId = selectedMissionId;
    this.unlockAll = unlockAll;
    this.onSelectMission = onSelectMission;
    this.onStartMission = onStartMission;
    this.container = null;
    this._clickHandler = null;
  }

  render(container) {
    if (!container) return;
    this.container = container;
    const lang = getLanguage();
    const svgHtml = generateWorldMapSvg({
      campaignDef: this.campaignDef,
      progress: this.progress,
      selectedMissionId: this.selectedMissionId,
      unlockAll: this.unlockAll,
      lang
    });

    container.innerHTML = `<div class="world-map-wrap">${svgHtml}</div>`;

    if (!this._clickHandler) {
      this._clickHandler = (e) => {
        const marker = e.target.closest('[data-mission-id]');
        if (!marker) return;
        const id = marker.dataset.missionId;
        const status = marker.dataset.status;
        if (status === 'locked' && !this.unlockAll) return;
        this.selectedMissionId = id;
        this.onSelectMission?.(id);
        this.render(this.container);
      };
      container.addEventListener('click', this._clickHandler);
    }
  }

  setSelectedMission(missionId) {
    this.selectedMissionId = missionId;
    if (this.container) this.render(this.container);
  }

  setCampaign(campaignDef) {
    this.campaignDef = campaignDef;
    if (this.container) this.render(this.container);
  }

  destroy() {
    if (this.container && this._clickHandler) {
      this.container.removeEventListener('click', this._clickHandler);
      this._clickHandler = null;
    }
    this.container = null;
  }
}
