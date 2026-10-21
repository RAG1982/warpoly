/**
 * src/data/maps/coast/world.js (MUNDO-TERRENO-MAPAS §2.4–2.5 · MUNDO-1)
 *
 * Do preset ao mapa jogável: gera a costa, confere a geografia, assa o terreno, posiciona bases/jazidas/florestas/poços, monta o
 * `mapDef` (`painted` + `lavaGrid` + `biomeGrid`) e confere o mundo contra o `Pathfinder` real. Se alguma etapa falhar, a SEMENTE É
 * REJEITADA e tenta-se `seed + 1 … seed + tries − 1` (spec §2.4: "semente rejeitada se violar"); o resultado diz qual semente valeu.
 *
 * Puro e determinístico: mesma (preset, seed) ⇒ mesmo `mapDef`, byte a byte.
 */
import { generateCoast } from './generate.js';
import { bakeTerrain, bakeToMapDef } from './bake.js';
import { planLayout } from './layout.js';
import { verifyCoastMap, verifyCoastWorld } from './verify.js';
import { getCoastPreset } from './presets.js';
import { defaultAnchors } from '../anchors.js';

/** Id estável do mapa assado: `mundo-<preset>-<semente pedida>`. */
export const coastMapId = (presetId, seed) => `mundo-${presetId}-${seed}`;

/**
 * @param {string|object} presetOrId  id de `COAST_PRESETS` (ou um preset)
 * @param {{ seed?: number, tries?: number, id?: string, name?: string, tileset?: string }} [opts]
 * @returns {{ ok: boolean, preset: string, requestedSeed: number, seed: number|null, attempts: {seed:number, stage:string, failures:string[]}[], map?: object, baked?: object, plan?: object, mapDef?: object, verification?: object }}
 */
export function buildCoastWorld(presetOrId, { seed = 1, tries = 10, id = null, name = null, tileset = null } = {}) {
  const preset = getCoastPreset(presetOrId);
  const attempts = [];
  for (let k = 0; k < tries; k++) {
    const s = (seed + k) >>> 0;
    const map = generateCoast({ ...preset.options, seed: s });
    const geo = verifyCoastMap(map, preset.verify);
    if (!geo.ok) { attempts.push({ seed: s, stage: 'geografia', failures: geo.failures }); continue; }
    const playable = map.size - 12;
    const baked = bakeTerrain(map, { cell: 1 });
    const plan = planLayout(map, baked, { ...preset.layout, naval: preset.naval }, { playable, seed: s, woodTarget: preset.woodTarget });
    if (!plan.ok) { attempts.push({ seed: s, stage: 'layout', failures: plan.failures }); continue; }
    const mapDef = bakeToMapDef(map, {
      id: id ?? coastMapId(preset.id, seed), name: name ?? preset.name, tileset: tileset ?? preset.tileset, cell: 1, playable,
      maxPlayers: plan.startSlots.length, startSlots: plan.startSlots, resources: plan.resources, forests: plan.forests, fords: plan.fords, neutrals: plan.neutrals,
      biomeGrid: true, baked
    });
    mapDef.anchors = defaultAnchors(mapDef); // M2-01: pontos nomeados para as missões (entre `neutrals` e `meta`)
    mapDef.meta = { generator: 'coast', preset: preset.id, seed, seedUsed: s };
    const world = verifyCoastWorld(mapDef, { naval: preset.naval, woodTarget: preset.woodTarget });
    if (!world.ok) { attempts.push({ seed: s, stage: 'mundo', failures: world.failures }); continue; }
    return { ok: true, preset: preset.id, requestedSeed: seed, seed: s, attempts, map, baked, plan, mapDef, verification: { geo, world } };
  }
  return { ok: false, preset: preset.id, requestedSeed: seed, seed: null, attempts };
}
