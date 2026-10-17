/**
 * src/data/maps/campaignLoaders.js (M2-28 · mapas de campanha sob demanda)
 *
 * Os palcos da campanha (`camp-*.json`, ~100–135 KB cada) não entram no bundle de boot: cada um vira um chunk
 * próprio, baixado por `import()` dinâmico quando uma partida/editor/ferramenta o pede (`ensureMapLoaded` em
 * `index.js`). A lista é EXPLÍCITA (não `import.meta.glob`) para funcionar também em Node puro (headless-match,
 * soak) com o hook `tools/lib/jsonImportLoader.mjs`. Ao criar um mapa `camp-*` novo (M2-04…07), acrescente-o aqui:
 * `tests/unit/campaignLazy.test.js` falha se um `camp-*.json` da pasta não estiver nesta tabela (ou vice-versa).
 */
export const CAMPAIGN_MAP_LOADERS = Object.freeze({
  'camp-01-baia-de-aurelan': () => import('./camp-01-baia-de-aurelan.json'),
  'camp-02-pouso-do-encontro': () => import('./camp-02-pouso-do-encontro.json'),
  'camp-03-pedra-mae': () => import('./camp-03-pedra-mae.json')
});
