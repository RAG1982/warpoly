/**
 * src/data/maps/coast/lagoons.js (MUNDO-TERRENO-MAPAS §2.2 passo 3 · MUNDO-1)
 *
 * Lagoas: água que não toca o oceano (componente 4-conexo diferente do da célula [0,0], que é sempre mar). As PEQUENAS
 * (`< minLake` células) viram terra (sem poças de poucas células, que a rasterização cria nas reentrâncias); as GRANDES ficam
 * como lagos (oásis/lagoa de pântano; nunca recebem poço de petróleo). Puro: altera `land`/`owner` no lugar.
 */
import { labelComponents } from './grid.js';

/**
 * Preenche as lagoas pequenas e lista as que sobram.
 * @param {Uint8Array} land    máscara de terra (1 = terra), alterada no lugar
 * @param {Int16Array} owner   dono (índice da entidade) de cada célula de terra, alterado no lugar
 * @param {number} G           células por lado
 * @param {number} minLake     lagoas com menos células que isso viram terra
 * @returns {{ lakes: number[], filled: number }}  tamanhos (células) dos lagos que ficaram e nº de lagoas preenchidas
 */
export function resolveLagoons(land, owner, G, minLake) {
  const N = G * G;
  const water = new Uint8Array(N);
  for (let c = 0; c < N; c++) water[c] = land[c] ? 0 : 1;
  const wl = labelComponents(water, G, 1);
  const oceanId = wl.labels[0];
  const lakes = [];
  const fillList = new Map();
  for (let c = 0; c < N; c++) {
    const id = wl.labels[c];
    if (id < 0 || id === oceanId) continue;
    if (wl.sizes[id] < minLake) { if (!fillList.has(id)) fillList.set(id, []); fillList.get(id).push(c); }
  }
  for (const cells of fillList.values()) {
    let own = -1;
    for (const c of cells) {
      for (const n of [c - 1, c + 1, c - G, c + G]) if (n >= 0 && n < N && land[n] && owner[n] >= 0) { own = owner[n]; break; }
      if (own >= 0) break;
    }
    for (const c of cells) { land[c] = 1; owner[c] = own; }
  }
  for (let id = 0; id < wl.sizes.length; id++) if (id !== oceanId && wl.sizes[id] >= minLake) lakes.push(wl.sizes[id]);
  return { lakes, filled: fillList.size };
}

/** Lagos (águas interiores) de uma máscara de terra: `[{ cells, size }]`, só para conferência independente do gerador. */
export function listLakes(land, G) {
  const N = G * G;
  const water = new Uint8Array(N);
  for (let c = 0; c < N; c++) water[c] = land[c] ? 0 : 1;
  const wl = labelComponents(water, G, 1);
  const oceanId = wl.labels[0];
  const out = [];
  for (let id = 0; id < wl.sizes.length; id++) if (id !== oceanId) out.push({ id, size: wl.sizes[id] });
  return { lakes: out, labels: wl.labels };
}
