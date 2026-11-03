/**
 * src/ui/worldMapModel.js (M2-08) — modelo PURO do mapa-múndi da tela de campanha (sem DOM; testável em Node).
 * Dado o `world-map.json`, a campanha e o progresso, devolve os 12 marcadores (posição em % sobre a arte,
 * estado, nome da ilha/região, rótulo para leitor de tela) e a rota. A renderização fica em `worldMap.js`.
 */
import worldMapData from '../data/campaigns/world-map.json';
import { localize } from '../sim/missions/text.js';

/** Estados de um marcador: concluída, atual (próxima a jogar), disponível (liberada, mas não é a atual), bloqueada. */
export const MARKER_STATES = ['completed', 'current', 'available', 'locked'];

/**
 * Candidatos de arte, do melhor para o pior. `clean` = sem texto gravado (dispensa a cartela).
 * `have` = nomes de arquivo existentes em `public/art/world/` (detectado em build por `worldMap.js`); sem ele, todos valem.
 * @param {string} [base] BASE_URL do Vite ('/' ou '/warpoly/')
 * @param {string[]|null} [have]
 */
export function worldMapArtCandidates(base = '/', have = null) {
  const b = base.endsWith('/') ? base : `${base}/`;
  const all = [
    { file: 'mapa-mundi-clean.webp', clean: true },
    { file: 'mapa-mundi-clean.jpg', clean: true },
    { file: 'mapa-mundi.jpg', clean: false },
    { file: 'mapa-mundi.png', clean: false }
  ];
  return all.filter((c) => !have || have.includes(c.file)).map((c) => ({ url: `${b}art/world/${c.file}`, clean: c.clean }));
}

const pct = (v) => Math.round(v * 10000) / 100;

/**
 * @param {object} o
 * @param {object} o.campaignDef definição da campanha (`listCampaigns()`)
 * @param {{status:Function}} o.progress
 * @param {string} [o.currentId] id da missão "atual" (próxima a jogar)
 * @param {string} [o.selectedId]
 * @param {boolean} [o.unlockAll]
 * @param {string} [o.lang]
 * @param {(missionId:string)=>string} [o.titleOf] título da missão
 * @param {(key:string, p?:object)=>string} [o.t] i18n
 * @param {object} [o.data] world-map.json (testes)
 */
export function buildWorldMapModel({ campaignDef, progress, currentId = null, selectedId = null, unlockAll = false, lang = 'pt-BR', titleOf = null, t = null, data = worldMapData } = {}) {
  const art = data.art;
  const stages = (campaignDef && data.campaignStages[campaignDef.id]) || [];
  const pins = (campaignDef && art.stages[campaignDef.id]) || [];
  const conts = (campaignDef && art.continentAt[campaignDef.id]) || [];
  const contName = (id) => localize((data.continents.find((c) => c.id === id) || { name: id }).name, lang);
  const islandOf = (stage) => data.islands.find((i) => i.stage === stage) || null;
  const tr = t || ((k) => k);
  const missions = campaignDef ? campaignDef.missions : [];

  const markers = missions.map((entry, i) => {
    const stage = stages[i];
    const pin = pins[i];
    if (!stage || !pin) return null;
    const raw = progress.status(campaignDef, entry.id, { unlockAll });
    let state = 'locked';
    if (raw === 'completed') state = 'completed';
    else if (raw !== 'locked') state = entry.id === currentId ? 'current' : 'available';
    const isl = islandOf(stage.stage);
    const place = isl ? localize(isl.name, lang) : contName(stage.stage === 1 ? conts[0] : conts[1]);
    const title = titleOf ? titleOf(entry.id) : localize(stage.name, lang);
    const n = i + 1;
    return {
      id: entry.id, index: i, n, state,
      x: pct(pin.x / art.width), y: pct(pin.y / art.height),
      selected: entry.id === selectedId,
      place, title,
      label: `${tr('worldmap.mission', { n })}: ${title}. ${place}. ${tr(`worldmap.state.${state}`)}`
    };
  }).filter(Boolean);

  // Rota decorativa: trechos até o marcador mais avançado liberado ficam "percorridos".
  const reached = markers.reduce((m, k) => (k.state !== 'locked' ? Math.max(m, k.index) : m), 0);
  const route = markers.slice(0, -1).map((a, i) => {
    const b = markers[i + 1];
    return { from: a.id, to: b.id, x1: a.x, y1: a.y, x2: b.x, y2: b.y, done: i < reached };
  });

  const box = (r) => ({ x: pct(r.x / art.width), y: pct(r.y / art.height), w: pct(r.w / art.width), h: pct(r.h / art.height) });
  return {
    aspect: art.width / art.height,
    title: localize(data.name, lang),
    scroll: box(art.titleScroll),
    cartela: box(art.cartela),
    markers, route,
    count: markers.length
  };
}

/** Próximo marcador (setas/Home/End) entre os `count`; circular. */
export function nextMarkerIndex(index, key, count) {
  if (count <= 0) return -1;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  const step = key === 'ArrowLeft' || key === 'ArrowUp' ? -1 : key === 'ArrowRight' || key === 'ArrowDown' ? 1 : 0;
  return step ? (index + step + count) % count : index;
}
