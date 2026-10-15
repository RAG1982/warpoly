/**
 * tools/lib/irregularCoast.mjs — SHIM de compatibilidade (MUNDO-1, spec docs/specs/MUNDO-TERRENO-MAPAS.md §7 passo 1).
 *
 * O gerador de costas irregulares foi promovido a módulo de dados puro em `src/data/maps/coast/` (sem DOM, sem three.js, sem
 * `Math.random`). Este arquivo só reexporta a API para que `tools/proto/irregular-coast.mjs`, `tools/gen-world-map.mjs`,
 * `tools/lib/irregularCoastRender.mjs` e os testes antigos continuem funcionando sem mudança. Código novo importa de
 * `src/data/maps/coast/index.js`.
 */
export * from '../../src/data/maps/coast/index.js';
