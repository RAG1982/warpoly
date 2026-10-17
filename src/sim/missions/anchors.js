/**
 * anchors.js — M2-01: resolve as âncoras de uma missão contra o mapa dela, ANTES da simulação.
 *
 * Em qualquer lugar da missão onde caiba um ponto (`spawn`, `order`, `area`, `camera`, `spawnBuilding`, `reveal`, passos de
 * cutscene, `escort`, `guard`…), `{ "anchor": "goldMine1", "dx"?: n, "dz"?: n }` equivale a `{ x, z }` = âncora + deslocamento.
 * Outros campos do mesmo objeto são mantidos (`{ "anchor": "landingZone", "r": 6 }` vira `{ "r": 6, "x": …, "z": … }`).
 *
 * Determinístico e puro: só soma números do mapa e da missão (sem RNG/relógio) e roda uma vez, no carregamento
 * (validação e construção do `MissionRuntime`); a simulação, o checksum e os saves só enxergam coordenadas. Missão sem
 * âncoras devolve a MESMA definição (nenhuma cópia), então as missões clássicas não mudam.
 */
import { ANCHOR_NAME_RE } from '../../data/maps/anchors.js';
import { MissionError } from './schema.js';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * @param {object} def     definição da missão (pode conter âncoras)
 * @param {object|null} mapDef  mapa da missão; `null` = só confere a sintaxe (usa 0,0 no lugar do ponto)
 * @returns {{ def: object, errors: string[] }}  `def` com as âncoras trocadas por `x`/`z` (a própria `def` se não há âncoras)
 */
export function resolveAnchors(def, mapDef) {
  const errors = [];
  const table = mapDef ? (isObj(mapDef.anchors) ? mapDef.anchors : {}) : null;
  const where = `missão "${def && def.id}"${mapDef ? `, mapa "${mapDef.id}"` : ''}`;

  const resolvePoint = (o, path) => {
    const name = o.anchor;
    const { anchor, dx, dz, ...rest } = o;
    void anchor;
    // Em caso de erro devolve um ponto (0,0) só para a validação seguir sem erros em cascata.
    const fail = (msg) => { errors.push(`${path}: ${msg}`); return { ...rest, x: 0, z: 0 }; };
    if (typeof name !== 'string' || !ANCHOR_NAME_RE.test(name)) return fail(`nome de âncora inválido (use letras, números, _ ou -; ${where})`);
    for (const k of ['dx', 'dz']) if (o[k] !== undefined && !isNum(o[k])) return fail(`${k} deve ser número finito`);
    if ('x' in o || 'z' in o) return fail(`"anchor" não combina com "x"/"z" no mesmo ponto (use dx/dz para deslocar)`);
    let base = { x: 0, z: 0 };
    if (table) {
      const a = table[name];
      if (!a || !isNum(a.x) || !isNum(a.z)) {
        const known = Object.keys(table);
        return fail(`âncora "${name}" não existe (${where}${known.length ? `; o mapa tem: ${known.slice(0, 12).join(', ')}${known.length > 12 ? ', …' : ''}` : '; o mapa não tem âncoras'})`);
      }
      base = a;
    }
    return { ...rest, x: base.x + (dx ?? 0), z: base.z + (dz ?? 0) };
  };

  const walk = (v, path) => {
    if (Array.isArray(v)) {
      let out = v;
      v.forEach((item, i) => {
        const r = walk(item, `${path}[${i}]`);
        if (r !== item) {
          if (out === v) out = v.slice();
          out[i] = r;
        }
      });
      return out;
    }
    if (!isObj(v)) return v;
    let out = v;
    for (const [k, item] of Object.entries(v)) {
      const r = walk(item, path ? `${path}.${k}` : k);
      if (r !== item) {
        if (out === v) out = { ...v };
        out[k] = r;
      }
    }
    return 'anchor' in out ? resolvePoint(out, path) : out;
  };

  return { def: walk(def, ''), errors };
}

/** Como `resolveAnchors`, mas lança `MissionError` (nome do mapa e da missão na mensagem) se alguma âncora for inválida/inexistente. */
export function resolveMissionAnchors(def, mapDef) {
  const r = resolveAnchors(def, mapDef);
  if (r.errors.length) throw new MissionError(r.errors, def && def.id);
  return r.def;
}
