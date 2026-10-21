/**
 * ambience.js (F7-08) — ambiência por tileset (PURO): quais camadas sintetizadas tocam e com que força, por tileset de
 * `src/data/tilesets.js`. Camadas: vento, água, grilos (insetos), neve (chiado fino + cristais) e estrondo grave.
 * O som é feito por `AmbiencePlayer`; aqui só a mistura (testada em Node).
 */
import { resolveTilesetId } from '../data/tilesets.js';

export const AMBIENCE_LAYERS = Object.freeze(['wind', 'water', 'crickets', 'snow', 'rumble', 'lava']);

/** Mistura-base de cada tileset (0..1 por camada). `verdejante` é o tileset legado/padrão. */
export const AMBIENCE_PROFILES = Object.freeze({
  verdejante: Object.freeze({ wind: 0.35, water: 0.28, crickets: 0.25, snow: 0, rumble: 0, lava: 0 }),
  inverno: Object.freeze({ wind: 0.6, water: 0, crickets: 0, snow: 0.55, rumble: 0, lava: 0 }),
  devastadas: Object.freeze({ wind: 0.7, water: 0, crickets: 0, snow: 0, rumble: 0.35, lava: 0 }),
  pantano: Object.freeze({ wind: 0.18, water: 0.45, crickets: 0.8, snow: 0, rumble: 0, lava: 0 }),
  exuberante: Object.freeze({ wind: 0.35, water: 0.3, crickets: 0.3, snow: 0, rumble: 0, lava: 0 }),
  deserto: Object.freeze({ wind: 0.65, water: 0.05, crickets: 0.1, snow: 0, rumble: 0.1, lava: 0 }),
  savana: Object.freeze({ wind: 0.5, water: 0.1, crickets: 0.35, snow: 0, rumble: 0, lava: 0 }),
  vulcanico: Object.freeze({ wind: 0.6, water: 0.1, crickets: 0, snow: 0, rumble: 0.55, lava: 0 }),
  pedregoso: Object.freeze({ wind: 0.55, water: 0.35, crickets: 0.15, snow: 0, rumble: 0.1, lava: 0 })
});

/**
 * 0 (dia) .. 1 (noite) a partir do estado da cena: `timeOfDay` ('day'|'sunset'|'night') e, se ligado, o ciclo dia/noite
 * (`dayNight.phase`: 0 meia-noite, 0,5 meio-dia).
 */
export function nightFactor({ timeOfDay = 'day', dayNight = null } = {}) {
  if (dayNight && dayNight.enabled && typeof dayNight.phase === 'number') {
    return Math.max(0, Math.cos(2 * Math.PI * dayNight.phase));
  }
  return timeOfDay === 'night' ? 1 : timeOfDay === 'sunset' ? 0.5 : 0;
}

/**
 * Níveis (0..1) das camadas para um tileset. Insetos crescem à noite; o vento amansa um pouco.
 * @param {string} tilesetId  aceita aliases (`ilhas`, `winter`…) e desconhecido = verdejante
 * @param {{night?:number, lava?:boolean}} [opts]  `lava`: o mapa tem lava (M2-18) — liga a camada de borbulhar/estalar
 * @returns {Record<string, number>}
 */
export function ambienceMix(tilesetId, { night = 0, lava = false } = {}) {
  const base = AMBIENCE_PROFILES[resolveTilesetId(tilesetId)];
  const n = Math.min(1, Math.max(0, night));
  const out = {};
  for (const k of AMBIENCE_LAYERS) out[k] = base[k];
  out.crickets = base.crickets * (0.35 + 0.65 * n);
  out.wind = base.wind * (1 - 0.25 * n);
  out.lava = lava ? 0.55 : 0;
  return out;
}
