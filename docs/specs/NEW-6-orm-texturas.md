# NEW-6 · Completar a F1-01: mapa ORM, pintura em Worker, cache IndexedDB e troca de qualidade sem recarregar

> **Status: SPEC (não iniciada)**. Escrita em 2026-10-11 por Sonnet 5.5 (sem código). Cada passo é um commit independente.

Leia antes: `docs/specs/_COMUM.md`, `CLAUDE.md`, F1-01 e NEW-6 em `docs/TASKS.md`, `docs/HANDOFF_CLOUD.md` seção 2 (regras da nuvem), `src/models/textureQuality.js`.
Worktree: nova a partir de `master`. Porta do vite (passos locais): **5196**.

## Objetivo medido ("pronto")
1. **VRAM estimada de texturas procedurais em `high` < 300 MB** (hoje 530,7 MB, medição abaixo); `med` e `low` não crescem (hoje 106,7 e 32,5 MB). Medida por `tools/texture-budget.mjs` (Node, passo 2) e, no local, por `renderer.info.memory.textures` + soma de bytes das texturas vivas.
2. **Load (bench `inicial`, `?texq=high`) não piora** em relação ao master e **cai pelo menos 40 % na 2ª visita** com cache IndexedDB quente (meta a confirmar no local; o master mede 5,0–5,3 s com `med`, `tools/bench/BASELINE.md`).
3. **Trocar a qualidade de textura nas Opções não recarrega a página**: as texturas são recriadas, os materiais atualizados, e `renderer.info.memory.textures` volta ao valor de uma carga limpa na qualidade nova (±2), após 10 trocas seguidas (sem vazamento).
4. Diferença visual `high` antes/depois aprovada no inspetor (`tools/texture-compare/`, mesmo método da F1-01).

## Estado atual (levantamento real, master `6d41862`)
- **Qualidade**: `src/models/textureQuality.js`. Presets de lado máximo `low 256 / med 512 / high 1024 / ultra 2048` (l.34). `getTextureQuality()` **memoriza em `cachedQuality` para sempre** (l.45, l.58–73); `setTextureQuality` só grava localStorage (l.79) e não limpa o cache de leitura. `createScaledCanvas` usa `document.createElement('canvas')` (l.162–183) e devolve canvas nulo sem `document` (l.163); `createBumpCanvas` = nulo em `low`, metade da resolução em `med`, cheia em `high/ultra` (l.185); `toTexture` cria `THREE.CanvasTexture` com mipmaps (l.253).
- **Aplicação**: `QualitySettings.set/setOverride` marcam `requiresReload` quando `textureQuality` muda (`src/core/QualitySettings.js` l.351 e l.373) e a UI mostra `opt.reloadHint` (`src/ui/screens/OptionsPanel.js:210, 361–368`). O menu propaga `?texq=` por URL (`MainMenu.js:62`).
- **Quem pinta** (todos síncronos, na thread principal, com `Math.random` — 72 chamadas — e canvas 2D): `environment/floraTextures.js` (18 conjuntos), `rockTextures.js` (2), `terrainTextures.js` (`getTerrainTextures` l.188, `getTerrainTexturesFromHeight` l.51; usa `document.createElement` + `ctx.filter='blur(6px)'` l.84–93), `tilesetTextures.js` (mapa só-albedo 2048 lógico, determinístico, sem `Math.random`; `withRoads` l.75), `waterTextures.js` (3), `buildings/banditCampTextures.js` (4), `units/axethrowerTextures.js` (1). Cada getter tem seu `Map` de cache em memória (`textureCache`), sem dispose.
- **Roughness/metalness pintados como canvas separados** e passados como `roughnessMap`/`metalnessMap`/`bumpMap` (ex.: `rockTextures.js:456–459`, `banditCampTextures.js:511–514`). Roughness às vezes é derivada do albedo por `drawImage` (`floraTextures.js:133,283,881`; `waterTextures.js:351,570`) — a pintura de um mapa depende do canvas de outro.
- **Consumidores dos mapas**: `world/Decorations.js:18–30` e `models/environment/DecorationModels.js:43–58` (`createPBRMat`), `models/buildings/BanditCampModel.js:37–100`, `world/Water.js:136–148, 252–262, 502–510` (anima `offset` em `map`, `roughnessMap` e `bumpMap` separadamente), `render/TerrainView.js:165–172`, `render/ProjectileViews.js:16` (só `.map`).
- **Mapas mortos (achado desta spec)**: `metalnessMap` multiplica o escalar `metalness`, e em **todos** os consumidores o escalar é 0: `BanditCampModel.js:46,58` (`metalness: 0.0`), `DecorationModels.js:50` / `Decorations.js:25` (padrão 0,0, nenhum chamador sobe), rochas idem. O machado do Arremessador usa só `.map` (`ProjectileViews.js:16`): roughness/metal/bump dele são pintados e jamais lidos. Ou seja, **37,3 MB (high) de metalness e ~10,7 MB de mapas do machado são puro desperdício hoje**.
- **Texturas fora do escopo `*Textures.js`** que também ocupam VRAM: textos flutuantes (`FloatingTextPool.js`, `ParticleSystem.js:220`, `RuinsManager.js:43`). BASELINE: 289 texturas vivas na cena inicial, 446 em `combate100`, 371 em `massa300` (antes da F1-01, quase todas 2048²).
- **Registro oficial**: TASKS F1-01 "Resultado": VRAM estimada 7,3 GB → med 399 MB / low 100 MB / high 1,94 GB; "Pendente → NEW-6". O número `high` da F1-01 (1,94 GB) **não bate** com a medição abaixo (530,7 MB) porque o universo contado era outro (inclui tudo que vivia na cena + cópias). Este NEW-6 passa a ter **orçamento próprio e reproduzível** (script abaixo); a comparação com os 399 MB/1,94 GB fica como nota, não como meta.

### Medição em Node (scratch descartável fora do repo; reproduzir com `tools/texture-budget.mjs`, passo 2)
Método: `document` falso com contexto 2D "no-op", `window.location.search='?texq=<preset>'`, chama **todos** os getters (todas as variantes: 4 flores, 2 arbustos, 2 bagas, 2 cogumelos…) e soma `largura × altura × 4 × 4/3` (RGBA8 + mipmaps) de cada textura distinta. Não inclui `tilesetTextures` (1 mapa por mapa de jogo: 5,3 MB em low/med, 21,3 MB em high/ultra) nem textos flutuantes.

| preset | texturas | MB total | map (cor) | roughness | metalness | bump | demais |
|---|---|---|---|---|---|---|---|
| low | 70 | **32,5** | ~14 | ~14 | 2,0 | 0 | ~2 |
| med | 96 | **106,7** | ~36 | ~36 | 9,3 | 8,6* | ~16 |
| high | 96 | **530,7** | 178,6 (+5,3 emissive) | 167,9 | 37,3 | 138,6 | 2,7 alpha |
| ultra | 96 | 1 690,7 | — | — | — | — | — |

(*med: bump já é metade da resolução.) Por grupo em `high`: flora 288 MB (54 texturas), bandit camp 90,7, água 45,3, rochas 42,7, terreno 42,7 (2 × 2048²), machado 21,3. As dimensões em `high` são 1024² (modelos) e 2048² (terreno); em `ultra` as flores ainda têm 15 de 1024² e 39 de 2048². Quase tudo em `high` é **dado** (roughness + metal + bump = 344 MB de 531): é aí que a meta se resolve, não no albedo.

### Cenários de orçamento em `high` (cálculo sobre a tabela; confirmar com o script)
| cenário | MB | observação |
|---|---|---|
| S0 hoje | 530,7 | |
| S1 ORM no mesmo lado (G=rough, B=metal fundidos) | 493,4 | só ganha o metal; rough sozinho vira 1 mapa RGBA do mesmo tamanho |
| S2 S1 + ORM a **metade do lado** (data maps pouco detalhados) | ~367 | roughness/metal são de baixa frequência |
| **S3 S2 + bump a metade do lado (como `med` já faz)** | **~263** | **cenário-alvo**; < 300 com folga de 37 MB |
| S4 S3 + terreno `high` em 1024² (como low/med) | ~231 | opcional se a folga não bastar |
| S5 layout alternativo "HRM" (R=altura do bump, G=rough, B=metal num único mapa, lado cheio) | ~355 | **não atinge 300 sozinho**; combina com meio lado → ~229 |

> Decisão de projeto: o pedido define o layout **R=oclusão, G=roughness, B=metalness** (padrão glTF), que é o implementado. O `bumpMap` do three lê o canal **R** (`.x`), então não pode dividir o mapa ORM sem abrir mão do AO; por isso o bump continua separado (cenário S3). O layout "HRM" fica como alternativa documentada (S5), só se o visual a meio lado for reprovado.

## Orçamento e regras
- Texturas de **modelo novo ≤ 512²** (regra do CLAUDE.md) e ≤ 20 draw calls por modelo. Texturas de dados (ORM, bump) de qualquer conjunto: **lado = max(256, lado do albedo ÷ 2)** em `high/ultra`, mesmo lado do albedo em `low/med` (hoje já é assim em `med` para o bump). Terreno/tileset continuam a exceção (mapa inteiro): 1024–2048.
- Orçamento de VRAM por preset (teste de regressão no passo 2, falha se estourar): `low ≤ 40 MB`, `med ≤ 115 MB`, `high < 300 MB`, `ultra` sem teto (preset de entusiasta, deve ser ≤ 1 700 MB, o que já é hoje).
- Não renomear nós de modelos; nenhuma mudança de números de jogo; `src/sim/**` intocado (render/modelos apenas).

## Arquitetura (passos pequenos, independentes, um commit cada)

### Passo 1 · Empacotador ORM puro (`src/models/ormPack.js`, novo)
Commit: `NEW-6: empacotador ORM puro (oclusão/roughness/metalness)`.
- Função pura `packORM({ width, height, ao, rough, metal })` → `Uint8ClampedArray(width*height*4)`; `ao`, `rough`, `metal` são, cada um, `Uint8ClampedArray` RGBA da fonte **ou** `null`. Regras: R ← `ao[i*4+0]` (se `null`, 255); G ← `rough[i*4+1]` (canal que o three lê hoje no `roughnessMap`; se `null`, 255); B ← `metal[i*4+2]` (canal que o three lê no `metalnessMap`; se `null`, 0); A = 255 **sempre** (evita perda por alfa pré-multiplicado ao passar por `putImageData`/canvas).
- Reduzir resolução: `downsampleRGBA(src, sw, sh, dw, dh)` (média de caixa, pura) para o lado de dados da seção Orçamento; dimensões devem dividir-se (potência de 2), senão erro claro.
- `ormLayout = { R: 'ao', G: 'roughness', B: 'metalness' }` exportado (constante usada por testes e docs). `unpackChannel(orm, channel)` auxiliar para teste e para o inspetor.
- **Testes (Vitest, Node puro)** `tests/unit/ormPack.test.js`: (a) pixel conhecido ida e volta (R/G/B/A nos offsets certos); (b) `ao=null` → R=255, `metal=null` → B=0; (c) A=255 mesmo se a fonte tinha alfa 0; (d) roughness lida do canal G e metalness do B da fonte, ignorando os outros canais; (e) `downsampleRGBA` 4×4→2×2 com média exata e 2×2→1×1; (f) tamanhos incompatíveis lançam erro; (g) não muta as entradas; (h) 1024×1024 em < 50 ms (limite folgado, só para pegar O(n²) acidental).
- Riscos: premultiplied alpha (mitigado por A=255); ordem de canais se alguém trocar o layout (teste (a) trava).
- Só no local: nada.

### Passo 2 · Uso no material + migração das texturas procedurais (`textureQuality.js`, `*Textures.js`, consumidores)
Commit: `NEW-6: mapas ORM nos materiais procedurais e orçamento de VRAM`.
- Helper em `textureQuality.js`: `toOrmTexture({ rough, metal, ao })` — lê os canvases (`getImageData`), chama `packORM`, desenha num canvas de lado reduzido, devolve **uma** `THREE.Texture` (`colorSpace = NoColorSpace`, mipmaps, anisotropia do preset). Canvas nulo/`document` ausente → `null` (mesmo contrato de `toTexture`). Atenção a `getImageData`/`putImageData`: o `ctx` escalado **não** os converte (cabeçalho de `textureQuality.js`); o helper trabalha em pixels físicos (`canvas.width`).
- Helper de material `applyOrm(params, tex, { metalness })` (puro, testável): se `tex.orm`, atribui `roughnessMap = metalnessMap = tex.orm`; `aoMap` **só** se `tex.hasAo === true` (nenhum conjunto pinta AO hoje; deixar R=255 e não ligar `aoMap` poupa um sampler); se o escalar de metalness do material for 0, **não** atribui `metalnessMap` (mapa morto, achado acima); se o conjunto tiver metal vivo, o escalar tem de ser 1 × fator desejado (documentar: o três multiplica escalar × canal).
- Migração: os getters passam a devolver `{ map, orm, bumpMap, emissiveMap?, alphaMap? }`, mantendo **aliases de compatibilidade** `roughnessMap`/`metalnessMap` apontando para `orm` até todos os consumidores migrarem (`Object.defineProperty` com getter) — assim o passo é seguro mesmo com consumidores esquecidos. Migrar: `Decorations.js:18–30`, `DecorationModels.js:43–58`, `BanditCampModel.js:37–100`, `Water.js:140–143, 258–262, 502–510` (um único `offset` do ORM em vez de dois), `TerrainView.js:165–172`, `tilesetTextures.js:75–81` (`withRoads` reaproveita `baseTex.orm`).
- **Parar de pintar o que ninguém lê**: `getAxethrowerAxeTextures` pinta só `map` (o consumidor usa só `.map`); `metalnessMap` não é pintado onde todo escalar é 0 (rochas, acampamento: só o albedo/rough/bump). Economia medida em `high`: ≈ 37 MB (metal) + ≈ 11 MB (machado) antes mesmo do ORM.
- `tools/texture-budget.mjs` (novo, Node puro, reaproveita o scratch desta spec): imprime a tabela acima por preset e **sai com código 1** se estourar o orçamento por preset. `package.json`: script `texture:budget`.
- **Testes** `tests/unit/textureBudget.test.js`: roda o mesmo cálculo com `document` falso para os 4 presets (cada preset em `vi.resetModules()` + `?texq`), afirma `high < 300 MB`, `med ≤ 115`, `low ≤ 40`, número de texturas distintas ≤ 96, que nenhum `orm` tem lado > lado do albedo e que **nenhum getter devolve `metalnessMap` sem consumidor** (lista branca). `tests/unit/applyOrm.test.js`: com `metalness: 0` não liga `metalnessMap`; com `hasAo:false` não liga `aoMap`; `roughnessMap === metalnessMap` quando ambos ligados; aliases legados retornam o mesmo objeto.
- Riscos: (a) diferença visual por roughness a meio lado (aprovar no inspetor); (b) um consumidor lendo `.roughnessMap` direto continua funcionando pelo alias; (c) `Water.js` deixa de animar dois offsets (equivalente); (d) glTF/GLB (`?glb=1`) não usa essas texturas.
- Só no local: **memória real de GPU** (`renderer.info.memory.textures`, `chrome://gpu`/`about:gpu`), visual no inspetor e no jogo (rochas, flora, acampamento bandido, água, terreno), `tools/texture-compare/` em `high` antes/depois, `npm run bench -- --scenarios=inicial` com `?texq=high`.

### Passo 3 · Pintura em Worker/OffscreenCanvas com fallback
Commit: `NEW-6: pintura de texturas em Worker (OffscreenCanvas) com fallback`.
- Separar **pintar** de **embrulhar**: cada getter vira `paintXxx(env) → { canvases | pixels }` (puro de three, recebe uma fábrica de canvas) + `wrapXxx(result) → texturas`. A fábrica vem de `textureQuality.js`: `createScaledCanvas` aceita `options.factory` (ou `setCanvasFactory`), com padrão = `document.createElement('canvas')`; no Worker usa `new OffscreenCanvas(w, h)`. `typeof document === 'undefined'` deixa de significar "canvas nulo" quando houver `OffscreenCanvas`. Remover `document.createElement` de `terrainTextures.js:84` (usar a fábrica) e proteger `ctx.filter` (Safari não suporta `filter` em 2D: cair para sem blur e documentar).
- Worker `src/models/texture.worker.js` (módulo, `new Worker(new URL('./texture.worker.js', import.meta.url), { type: 'module' })` — suportado pelo Vite 8): importa só os `paint*` (nada de `three`, `window`, `document`, `localStorage`). Mensagem de entrada `{ id, quality, version, params }`; saída `{ id, result }` com `ImageBitmap`/`ArrayBuffer` transferíveis (pixels ORM prontos, calculados no Worker). `getTextureQuality()` **não** pode ser chamado no Worker (lê `window`): a qualidade viaja na mensagem e entra em `paintXxx` por parâmetro (`env.quality`).
- Orquestrador `src/models/TextureService.js`: `await paintAll(ids, onProgress)`; **feature-detect** `typeof OffscreenCanvas !== 'undefined' && typeof Worker !== 'undefined' && canvas 2D no Worker` (sonda: pede ao Worker `new OffscreenCanvas(1,1).getContext('2d')`); se falhar ou der erro/timeout (10 s por textura) → **fallback síncrono na thread principal** com o mesmo `paintXxx`. Sem DOM no Worker: nada de `new Image()` nem `document`; texto (`fillText`) usa a fonte do sistema.
- `Math.random` nas pinturas: aceitável para visual, mas torna o resultado irreproduzível (e o cache IndexedDB congela uma variante). Decisão mínima: passar uma `rng` semeada (`mulberry32(seedPorId)`) como parâmetro de `paintXxx`, substituindo `Math.random` (72 usos) por `env.rng()`; assim Worker, fallback e cache produzem a mesma imagem e o teste pode comparar hash. Isto é um **desvio opcional**; se atrasar, manter `Math.random` e documentar.
- `ImageBitmap` e `flipY`: o three ignora `flipY` em `ImageBitmap`; criar com `createImageBitmap(canvas, { imageOrientation: 'flipY' })` e `texture.flipY = false` (documentar). `tex.needsUpdate = true` só depois de ter a imagem.
- `AssetPreloader` (`src/core/AssetPreloader.js:67–70`) passa a aguardar `TextureService.paintAll` (barra de progresso real, thread principal livre). O item "Texturas do Terreno do Reino" usa o serviço.
- **Testes**: `tests/unit/textureService.test.js` com `Worker` e `OffscreenCanvas` **falsos** (objeto que executa o mesmo `paintXxx` em microtask): (a) com Worker falso, o resultado é igual ao do caminho síncrono; (b) sem `OffscreenCanvas` → fallback síncrono, mesmo resultado; (c) Worker que lança erro → fallback e `console.warn` único; (d) timeout (relógio falso de Vitest) → fallback; (e) fila: no máximo N tarefas em voo; (f) cancelar no meio descarta resultados atrasados; (g) o módulo do Worker não referencia `window`/`document` (teste de texto sobre o arquivo `texture.worker.js` + `paint*`: nenhum `document.`/`window.`/`localStorage` fora da fábrica padrão); (h) com `rng` semeada, mesma semente → mesmos bytes (hash) em duas chamadas.
- Riscos: **maior do plano** (refatora ~3 300 linhas de pintura; fazer por grupo, um getter por vez, com `git diff --stat` pequeno por commit interno). `ctx.filter`, `fillText`/fontes e `drawImage` entre canvases diferem no Worker; pintura que depende de outro canvas (roughness derivada do albedo) tem de ficar **dentro do mesmo `paintXxx`**. `OffscreenCanvas` no Safari < 17 sem 2D: cai no fallback. Em dev (Vite), Worker de módulo exige `type:'module'` (Firefox ≥ 114).
- Só no local: **tempo de load** com a thread principal livre (`?texq=high`, 3 execuções, mediana vs. master), ausência de long tasks > 50 ms durante o load (Performance panel / `PerformanceObserver`), Worker de fato ativo (log do serviço) e comparação pixel a pixel Worker × fallback (`tools/visual-regress.mjs` ou diff de PNG).

### Passo 4 · Cache IndexedDB versionado
Commit: `NEW-6: cache IndexedDB de texturas procedurais`.
- `src/models/textureCache.js`: chave `${id}|${quality}|${genVersion}` onde `id` = nome do conjunto (+ variante/mapa/tamanho: `flower_petals_pink`, `master_terrain_140`, `terrain_h_<mapId>_<size>`), `quality` = preset, `genVersion` = inteiro **por grupo** em `src/models/textureRegistry.js` (`{ id, version, paint }`) que o autor incrementa ao mudar a pintura. Valor = `{ w, h, kind: 'rgba'|'png', data, savedAt, bytes }`. Banco `warpoly-textures` v1, store `textures`; versão do esquema do banco separada da `genVersion`.
- API injetável (sem tocar `indexedDB` direto no código de domínio): `createTextureCache(backend)`, onde `backend` implementa `get(key) / put(key, value) / delete(key) / keys() / clear()`; `idbBackend()` (navegador) e `memoryBackend()` (testes). Falhas (modo privado, quota, bloqueio) **nunca lançam**: viram "miss" + um aviso.
- Política: no `paintAll`, para cada id: `cache.get` → hit: desserializa e embrulha (sem pintar); miss: pinta (Worker/fallback) → `cache.put` em segundo plano. LRU simples por `savedAt` com teto de **256 MB** total (`bytes`); entradas de `genVersion`/qualidade antigas são apagadas quando uma nova da mesma `id` é gravada (não acumula lixo). Terreno por `mapId` também entra (a chave inclui `size`). Formato padrão: pixels RGBA brutos (`ArrayBuffer`; rápido de ler) com `convertToBlob('image/png')` como alternativa se o tamanho incomodar; a escolha final sai de medição local (tamanho em disco × tempo de leitura).
- `?nocache` na URL ignora a leitura (e `?texcache=clear` limpa) — para o bench e para depuração.
- **Testes** `tests/unit/textureCache.test.js` com `memoryBackend`: (a) miss → pinta e grava, 2ª chamada → hit sem chamar `paint`; (b) `genVersion` diferente → miss; (c) qualidade diferente → miss e **não** apaga a outra qualidade; (d) gravar versão nova apaga a antiga da mesma `id`; (e) teto de 256 MB expulsa o mais antigo; (f) backend que lança → comportamento "sem cache" e jogo segue; (g) dado corrompido (tamanho ≠ w×h×4) → miss; (h) chave estável para a mesma entrada.
- Riscos: dados antigos após mudar a pintura sem incrementar `genVersion` (mitigar: teste que falha se o hash do texto dos `paint*` mudar sem a versão — opcional); quota/eviction pelo navegador (aceitável, é só cache); Safari em aba privada (backend lança → ignora).
- Só no local: **tempo de load 2ª visita** (meta -40 %), tamanho real no disco (DevTools → Application → IndexedDB), comportamento com cache corrompido/limpo, aba privada.

### Passo 5 · Troca de qualidade sem recarregar
Commit: `NEW-6: troca de qualidade de textura sem recarregar`.
- Fonte única da qualidade: `getTextureQuality()` deixa de memorizar para sempre. `setTextureQualityRuntime(q)` atualiza a variável, grava localStorage e dispara um **evento** `onTextureQualityChange` (lista de ouvintes; sem `window.dispatchEvent` para ser testável). `QualitySettings.set/setOverride` deixam de devolver `requiresReload` por causa de `textureQuality` (continua `true` para `antialias` e `pointLightShadows`) e chamam o serviço.
- `TextureService.rebuild(newQuality)`: (1) pede ao registro as texturas vivas por `id`; (2) pinta/lê do cache as novas (passo 3 e 4); (3) para cada material **registrado** (`TextureService.registerMaterial(mat, setId, applyFn)` no momento da criação: `Decorations`, `DecorationModels`, `BanditCampModel`, `Water`, `TerrainView`, `tilesetTextures`) reatribui `map/roughnessMap/metalnessMap/bumpMap/emissiveMap/alphaMap`, `needsUpdate = true` e `bumpMap` ligado/desligado conforme `isBumpEnabled()` (em `low` o bump some: o programa do shader muda, por isso `mat.needsUpdate`); (4) só **depois** que os materiais apontam para as novas, `dispose()` das texturas antigas e `Map.clear()` dos caches antigos (`clearFloraTextureCache`, `clearRockTextureCache` + os demais, hoje sem uso real); (5) `anisotropy` do preset novo; (6) emite `ready`. Se a pintura falhar, mantém as texturas antigas e relata erro (a UI mostra `opt.texture.failed`).
- Materiais compartilhados entre modelos (`pbrMaterialCache` em `DecorationModels.js:34`) são atualizados **uma vez** (por material, não por mesh). Clones (`clone()` de modelos) compartilham material; nenhum material novo é criado. Terreno (`TerrainView`) e `withRoads` recriam o `map` de acordo com o `id` do mapa atual.
- Durante a troca: desabilitar o seletor de textura nas Opções (estado "aplicando…"), sem travar o loop (a pintura é assíncrona no Worker). Texto novo de UI em PT-BR (+ chave i18n pt-BR/en).
- **Testes** `tests/unit/textureSwap.test.js`: texturas e materiais **falsos** (objetos com `dispose()` espiável e `needsUpdate`): (a) após `rebuild`, todo material registrado aponta para textura da nova qualidade e nenhuma das antigas continua referenciada; (b) cada textura antiga recebe `dispose()` exatamente 1 vez; (c) material compartilhado atualizado uma vez; (d) 10 trocas seguidas (`low→med→high→…`) terminam com o mesmo número de texturas vivas que uma carga limpa (contador de `dispose` vs. criadas); (e) falha de pintura → texturas antigas intactas e sem `dispose`; (f) troca para a mesma qualidade é no-op; (g) troca dupla concorrente: a segunda cancela a primeira (sem aplicar resultado velho); (h) `getTextureQuality()` reflete a nova qualidade sem recarregar; (i) em `low`, `bumpMap` é `null` e `needsUpdate` é marcado.
- Riscos: texturas "esquecidas" por código que guarda a referência (`Water.js:502–510` guarda `surfaceMat.map`; trocar para ler sempre do material); instâncias de `InstancedMesh` com material compartilhado (ok) e **flash** de uma frame sem textura (ordem 3→4 evita); recompilação de shader ao ligar/desligar `bumpMap` (um pico de frame; aceitável, medir).
- Só no local: **vazamento real de GPU** (`renderer.info.memory.textures` e o heap do Chrome após 10 trocas), picos de frame na troca, visual idêntico a uma carga limpa na mesma qualidade (capturas), troca durante partida em andamento (inclui fim de partida e reinício).

## Ordem de execução recomendada
1. **Passo 1** (nuvem) — base pura, sem risco.
2. **Passo 2** (metade na nuvem: helpers, `applyOrm`, `texture-budget`, testes de orçamento; **migração visual final = local**, porque muda a aparência de `high`). É o passo que fecha o critério 1 (< 300 MB); entregar sozinho já cumpre "pronto" nº 1.
3. **Passo 4** (nuvem, backend injetável) — independe do Worker; já reduz load na 2ª visita só com o fallback síncrono.
4. **Passo 3** (local-pesado: refator grande e medição de load) — pode ser dividido por grupo (um commit por arquivo `*Textures.js`).
5. **Passo 5** (por último; depende de 2, 3 e 4 e de registro de materiais).
Cada passo deixa o jogo funcional; os passos 3, 4 e 5 podem ser abandonados individualmente sem desfazer o 1–2.

## O que vai para a nuvem e o que é local
| item | onde | motivo |
|---|---|---|
| Passo 1 completo, testes | **nuvem** | função pura |
| Passo 2: `toOrmTexture`, `applyOrm`, `texture-budget`, testes de orçamento | **nuvem** | Node com `document` falso; sem GPU |
| Passo 2: aprovar o visual `high` (rochas, flora, acampamento, água, terreno) e VRAM real | **local** | precisa GPU, `renderer.info`, inspetor |
| Passo 4: `textureCache` + `memoryBackend` + testes | **nuvem** | backend injetável |
| Passo 4: `idbBackend` real, tamanho e tempo de 2ª visita | **local** | navegador |
| Passo 3: refator `paint*` + `TextureService` + testes com Worker falso | **nuvem** (cuidado: grande) ou local | testável sem navegador, mas o resultado só vale com Worker real |
| Passo 3: Worker real, tempo de load, long tasks, Safari/Firefox | **local** | navegador/GPU |
| Passo 5: lógica de troca + testes com objetos falsos | **nuvem** | |
| Passo 5: vazamento de GPU, picos de frame, visual da troca | **local** | `safe-run.sh`, `assertGpu` |

Regras de execução na nuvem: `npm ci && npm test && npm run lint && npx vite build --outDir /tmp/build-check`; branch `cloud/NEW-6-p<N>`; **não** rodar smoke/bench/Playwright; "Verificação pendente (local)" no relatório.

## Verificação local (números a entregar)
1. `node tools/texture-budget.mjs` (low/med/high/ultra: texturas e MB) antes/depois.
2. `npm run bench -- --scenarios=inicial,combate100` com `?texq=high` e `?texq=med` via `tools/safe-run.sh`: load, `texturas`, `GPU mem` estimada, FPS (antes/depois).
3. Load 1ª e 2ª visita (cache frio/quente), 3 repetições, mediana; long tasks durante o load.
4. Troca de qualidade ×10 numa partida: `renderer.info.memory.textures` por troca (tabela no relatório) e captura de `grunt/castle/knight` + flora + rochas + água + terreno em cada preset, comparadas a `tools/texture-compare/`.
5. Script Playwright novo usa `tools/lib/assertGpu.mjs` e `?skipPreload` quando não medir load; encerrar vite e navegador no `finally`.

## Não fazer
- Não mudar números de jogo, nós nomeados de modelos, nem `src/sim/**`.
- Não criar textura nova > 512² para modelo novo; não usar nomes/lore da Blizzard.
- Não adicionar dependências (usar `memoryBackend` em testes; **sem** `fake-indexeddb`).
- Não mexer em `docs/TASKS.md` nem `CLAUDE.md` (o coordenador atualiza ao mesclar).

## Docs
`docs/01_ARQUITETURA.md`: seção "Texturas procedurais" (ORM, Worker, cache, troca em tempo de execução, orçamento por preset) e `docs/04_DIAGNOSTICO.md` (nota: orçamento de VRAM medido por `texture-budget`).

## Relatório esperado (≤ 25 linhas)
```
NEW-6 passo <N> — branch cloud/NEW-6-p<N>, commit <hash>
Feito: <3–6 tópicos do passo, com arquivos>
Números (antes → depois): texturas <96→?>; VRAM low/med/high/ultra <32,5/106,7/530,7/1690,7 → ?>;
  orçamento por preset (texture-budget): <ok/estourou>; testes novos <n>, suíte <total> verde
Resultado dos comandos: npm test <ok>, npm run lint <0 erros>, vite build <ok>
Desvios da spec: <ex.: manteve Math.random; sem rng semeada>
Verificação pendente (local):
  1. node tools/texture-budget.mjs  → colar tabela
  2. safe-run.sh -- npm run bench -- --scenarios=inicial,combate100 (texq=high e med)
  3. inspetor + jogo: rochas, flora, acampamento, água, terreno em high; tools/texture-compare/
  4. (passos 3–5) load 1ª/2ª visita, long tasks, 10 trocas de qualidade com renderer.info.memory.textures
Riscos/decisões para o dono: <ex.: aceitar ORM/bump a meio lado em high; layout HRM se reprovar>
```
