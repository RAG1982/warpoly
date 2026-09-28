# F7-00c · Modelos .glb aprovados ligados por padrão

Leia antes: `docs/specs/_COMUM.md`, `CLAUDE.md`.
Worktree: nova (isolada). Porta do vite: **5189**.

## Contexto
Os modelos do pipeline Blender (`public/models/grunt.glb`, `public/models/castle.glb`) foram aprovados pelo dono. Hoje só aparecem com `?glb=1`:
- `src/entities/glbModels.js:17` — `glbEnabled` = `URLSearchParams(...).get('glb') === '1'`.
- `src/core/AssetPreloader.js:17-20` — só aguarda `ModelFactory.loadGlbModels()` se `ModelFactory.glbEnabled`.
- Com `?skipPreload` o preloader não roda e os .glb nunca carregam (unidades/construções saem procedurais).

## Passos
1. `glbModels.js`: `glbEnabled` passa a ser **true por padrão**; `?glb=0` desliga. Mantenha `?glb=1` aceito (true).
2. Carregamento independente do preload: exporte/garanta uma função `ensureGlbLoaded()` (promessa memoizada que chama `loadGlbModels()` uma vez). Chame-a:
   - no `AssetPreloader.preloadAll` (como hoje, quando habilitado);
   - no caminho de início de partida com `?skipPreload` — em `src/main.js`/`src/core/MatchSession.js` (onde a sessão é criada; procure por `skipPreload`), **aguardando** a promessa antes de criar o `GameManager`. Custo esperado < 1 s (2 arquivos, ~800 KB).
3. Se o carregamento falhar (404/erro de parse), registrar `console.warn` e seguir com os modelos procedurais (comportamento atual de fallback em `ModelFactory`).
4. Inspetor: nada muda (já carrega sempre os .glb para comparação).
5. Atualize a linha de parâmetros de URL em `docs/01_ARQUITETURA.md` (`?glb=0` desliga modelos Blender).

## Não fazer
Não alterar modelos, `mergeStaticTemplate`/`mergeUnitTemplate`/skinning, `Unit.js`, `GameManager.js`.

## Verificação
1. Comandos mínimos do `_COMUM.md` (`npm run smoke` já usa safe-run — não aninhe).
2. Script Playwright via `bash /home/rafael/warpoly/tools/safe-run.sh --timeout 240 -- node <script>` (GPU real, `assertHardwareGpu` de `tools/lib/assertGpu.mjs`), porta 5189:
   - `/?play&skipPreload&texq=low` (humano): castelo do jogador contém nó `Static_Mesh` (é o .glb).
   - `/?play&faction=orc&skipPreload&texq=low`: os 2 guerreiros iniciais (`type==='grunt'`) têm filho vindo do .glb (ex.: material com mapa WebP / nó raiz `Grunt`).
   - `/?play&skipPreload&glb=0&texq=low`: castelo sem `Static_Mesh` (procedural).
   Remova o script ao terminar ou deixe em `tools/` se útil.

## Entrega
Mensagem de commit: `F7-00c: modelos glb aprovados ligados por padrão (?glb=0 desliga)`.
