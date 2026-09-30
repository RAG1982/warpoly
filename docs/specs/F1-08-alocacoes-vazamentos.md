# F1-08 · Eliminar alocações por frame e vazamentos de GPU

> **Status: ✅ PRONTA — DONE (70fea77)**

Leia antes: `docs/specs/_COMUM.md`, `CLAUDE.md`, item 6 da seção 1 de `docs/04_DIAGNOSTICO.md`.
Worktree: nova (isolada). **Antes de começar, rode `git log -1 --oneline master` e confirme que a worktree contém esse commit; se não, `git merge master`.** Porta do vite: **5190**.

## Objetivo e "pronto"
- Heap JS estável em 10 min de partida (sem crescimento contínuo; variação final ≤ +10% sobre o patamar após 2 min).
- `renderer.info.memory.textures` e `.geometries` **não crescem** durante combate (hoje crescem por texto flutuante e projétil de machado).
- Zero `new THREE.Vector3/Quaternion/Matrix4` dentro de métodos chamados por frame nos arquivos listados.

## Pontos a corrigir (caminho:linha no master atual — confirme com grep)
1. **Texto flutuante** — `src/entities/ParticleSystem.js:152` `spawnFloatingText(text, pos, color)` cria `canvas` + `CanvasTexture` + `SpriteMaterial` a cada chamada (cada acerto!) e descarta em `update` (~linha 222).
   - Substituir por **pool** de sprites (ex.: 64) com uma **textura atlas** gerada uma vez: glifos `0-9 + - ` e as palavras usadas (grep `spawnFloatingText(` no projeto para listar: ex. "Madeira", "Ouro", "Pedra", "Construído!", "Melhoria Forjada!"…). Alternativa aceitável e mais simples: cache de textura **por string+cor** (Map, limite 128 entradas LRU) + pool de `Sprite`/`SpriteMaterial` reutilizados (troca só `map`, `color`, `opacity`). Escolha a alternativa simples.
   - Pool esgotado: reutilize o sprite mais antigo.
   - Assinatura pública `spawnFloatingText(text, pos, color)` **inalterada**.
2. **Partículas** — `ParticleSystem.spawnWoodChips/GoldGlitter/StoneDust/HitSparks/SmokePuff`: criam `Mesh` e `Vector3` por partícula, e `spawnSmokePuff` cria material novo (descartado em `update` ~linha 208). Criar **pool** de meshes por tipo (geometria/material compartilhados; fumaça usa material compartilhado com opacidade via `instanceColor`/escala — ou clone de material **reutilizado** do pool, nunca criado por spawn). `velocity` reutilizada por item do pool.
3. **Projétil de machado** — `src/entities/Arrow.js` `createProjectileMesh` (~linha 24): cria `MeshStandardMaterial` e 2 geometrias por arremesso e `hit()` (~88) só faz `scene.remove`. Criar template compartilhado (módulo: `let axeTemplate = null`, criado na 1ª vez) e usar `clone(false)`-sem-materiais (compartilhar geometria/material). Mesma ideia para a flecha se `ModelFactory.createArrow()` não for cacheado (verifique).
4. **Vector3 por frame**:
   - `Arrow.js:57` (`.add(new THREE.Vector3(0,1,0))`), `:68`, `:74` (`new THREE.Vector3().lerpVectors`) → vetores de módulo reutilizáveis (`const _v1 = new THREE.Vector3()`).
   - `Building.js:658` (`worldPos` nas chamas), `:690-691` (chaminé), `:720` (origem do projétil da torre) → constantes de módulo/vetores reutilizados.
   - `Unit.js:912` (origem do projétil) → vetor reutilizado; `:245,247,643` (`targetPos = new Vector3`) → `this.targetPos` criado uma vez no construtor e atualizado com `.set()`.
   - `ParticleSystem` spawns (linhas ~27, ~33 e equivalentes) → cobertos pelo pool.
   **Cuidado**: `Arrow` guarda `startPos`/`targetPos` por instância (legítimo, 1 vez por projétil) — só elimine as alocações **por frame**.
5. **Descartar ao sair** — `ParticleSystem.dispose()`/`clear()` (usados pela `MatchSession`, F2-04) liberam pools e texturas de cache.

## Não fazer
- Não mudar visual (cor, tamanho, duração, trajetória) de textos, partículas e projéteis.
- Não editar `GameManager.js` (F1-06 em andamento) nem `src/render/**`, `ModelFactory.js` além do necessário para cachear a flecha (se precisar, ≤ 5 linhas).
- `Unit.js`/`Building.js`: só as linhas de alocação citadas (F1-06 também edita esses arquivos — mudanças mínimas e localizadas).

## Testes (Vitest)
- `tests/unit/particlePool.test.js`: spawn de 200 textos com pool de 64 → nunca mais de 64 sprites vivos; o mesmo texto+cor reutiliza a mesma textura; `dispose()` zera cache. (Se `document`/canvas não existir no ambiente de teste, isole a lógica de pool/cache numa classe pura e teste essa classe.)

## Verificação (números no relatório)
1. Comandos mínimos do `_COMUM.md` (`npm run smoke`/`npm run bench` já usam safe-run — não aninhe).
2. Script Playwright via safe-run (GPU real, `assertHardwareGpu`, porta 5190, `?skipPreload&texq=low&bench=combate100&benchDuration=600`) — ou cenário equivalente — amostrando a cada 30 s: `performance.memory.usedJSHeapSize`, `renderer.info.memory.textures`, `.geometries`. Reportar tabela (0 s, 2 min, 5 min, 10 min). Aceite: texturas/geometrias constantes após o aquecimento; heap ≤ +10% entre 2 min e 10 min.
3. `npm run bench -- --scenarios=combate100` antes/depois (FPS e frame time).

## Entrega
Mensagem de commit: `F1-08: pools de partículas/textos, projéteis compartilhados, sem alocações por frame`.
