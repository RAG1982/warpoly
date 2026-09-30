# NEW-17 · Textura do terreno pintada a partir da altura do mapa (mapas não continentais)

Leia antes: `docs/specs/_COMUM.md`, `CLAUDE.md`, `src/data/maps/README.md`. Executor: **haiku**. Worktree isolada. Porta do vite **5199**.

## Sintoma
Em `?map=ilhas-4p` a textura do chão mostra desenhos do mapa continental (retângulo de terra ±54, rio diagonal, 3 vaus, manchas de terra nas bases antigas) que não batem com o relevo real: água com "rachaduras", manchas de terra fora do lugar. Captura: `tools/ui-captures/maps/ilhas-4p-jogo.png`.

## Causa
`src/models/environment/terrainTextures.js:18` `getTerrainTextures(landmarks, worldSize)` desenha formas **fixas do continental** (linhas ~40–170: `w2c(-54,-54)`, rio `x−z=0`, `fords`, `drawSoilPatch(32,-30…)`). `src/world/Terrain.js:134` chama com `this.landmarks` montado de `mapDef` (~linha 23), mas as formas continuam as do continental. Cache: `master_terrain_${worldSize}`.

## Correção
1. **Não alterar o caminho continental** (visual do mapa padrão deve ficar idêntico): se `mapDef.terrain.generator === 'continental'` (ou `mapDef` ausente), chame a função atual exatamente como hoje.
2. Novo caminho para os demais geradores — em `terrainTextures.js`, exporte `getTerrainTexturesFromHeight({ id, size, getHeight, waterLevel, startSlots })`:
   - cache por `terrain_h_${id}_${size}`;
   - canvas via o mesmo `createScaledCanvas(2048, 2048, TERRAIN_CANVAS_OPTIONS)` já usado no arquivo (respeita `?texq=`);
   - amostrar a altura numa grade de **256×256** (`x = -size/2 + (i+0.5)*size/256`), pintar cada célula como retângulo (`fillRect`) com a cor por faixa:
     - `h < waterLevel - 0.3` → fundo marinho `#c9b27a` (fica sob a água do `Water.js`),
     - `h < 1.4` → areia `#e4ce95`,
     - `h < 3.2` → grama com variação: interpolar entre `#66873c` e `#78d458` usando um ruído barato determinístico (`(Math.sin(x*0.37)+Math.cos(z*0.29))*0.5`),
     - senão → rocha/relva alta `#8a8f6a`;
   - depois aplicar um desfoque leve para suavizar os degraus: `ctx.filter = 'blur(6px)'` redesenhando o canvas sobre si mesmo (via canvas temporário), e resetar `ctx.filter`;
   - manchas de solo (`drawSoilPatch` equivalente, raio 6) em cada `startSlots[i]` (clareira da base);
   - roughness: mesma lógica do caminho continental, mas por faixa (areia 0,9; grama 0,8; rocha 0,7); bump: pode reutilizar o mesmo tratamento do caminho continental aplicado ao albedo, ou ficar `null` se `isBumpEnabled()` for falso (padrão do arquivo).
3. `src/world/Terrain.js` ~134: se o gerador não for continental, chamar `getTerrainTexturesFromHeight({ id: mapDef.id, size: this.width, getHeight: (x, z) => this.getHeight(x, z), waterLevel: mapDef.waterLevel ?? 0.5, startSlots: mapDef.startSlots })`; senão manter a chamada atual.

## Não fazer
Não mexer em `GameManager.js`, `UIManager.js`, `src/sim/**`, `src/ai/**` (outro agente, F3-04, está neles). Não mudar o visual do `continental-1v1`.

## Testes
Vitest `tests/unit/terrainTexturesHeight.test.js`: função pura de faixa de cor `terrainBandColor(h, waterLevel, x, z)` (exporte-a) retorna as cores esperadas nos limites (0,19 / 1,39 / 3,19 / 3,21). (O canvas não existe no Node; teste só a função pura.)

## Verificação
- `npm test`, `npm run lint`, `npx vite build --outDir /tmp/claude-1000/warpoly-build-check`, `npm run smoke`.
- Captura via `bash /home/rafael/warpoly/tools/safe-run.sh --timeout 240 -- node <script>` (GPU real, `assertHardwareGpu` de `tools/lib/assertGpu.mjs`, dev server `timeout 600 npx vite --port 5199 --strictPort`): `/?play&skipPreload&texq=low&map=ilhas-4p&ffa=1` e `/?play&skipPreload&texq=low` (continental). Salvar em `tools/ui-captures/maps/depois-new17-{ilhas,continental}.png`. **Olhe as imagens**: ilhas com areia na costa e grama no interior, sem rio diagonal nem manchas estranhas; continental igual ao `continental-1v1-jogo.png` existente. Encerre vite e navegador.

## Entrega
Commit: `fix(terreno): textura pintada pela altura em mapas não continentais (NEW-17)`. Relatório ≤ 12 linhas.
