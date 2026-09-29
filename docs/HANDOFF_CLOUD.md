# HANDOFF — Execução no Claude Code online (nuvem)

> Roteiro para rodar parte do trabalho no **Claude Code na web** (claude.ai/code) sobre `github.com/RAG1982/warpoly`, em paralelo ao trabalho local do dono.
> **Prompt a colar na sessão online:**
> `Leia docs/HANDOFF_CLOUD.md e execute a próxima tarefa pendente da fila da nuvem, seguindo as regras do handoff.`

## 1. Contexto rápido
WarPoly: RTS 3D low-poly no navegador (three.js 0.186 + Vite 8, JS ES modules), inspirado em Warcraft II. Leia nesta ordem: `CLAUDE.md` → `docs/README.md` → `docs/specs/_COMUM.md` → a spec da tarefa.
Fluxo do projeto: specs detalhadas em `docs/specs/<ID>.md`; o executor segue a spec literalmente e reporta desvios.

## 2. Regras específicas da nuvem (substituem partes do `_COMUM.md`)
- **Sem GPU e sem navegador**: NÃO rode `npm run smoke`, `npm run bench`, Playwright, Blender nem `tools/safe-run.sh` (usa `systemd-run`, indisponível no container). NÃO use `ALLOW_SOFTWARE_GL=1`.
- **Verificação na nuvem** = somente:
  ```bash
  npm ci
  npm test
  npm run lint          # 0 erros
  npx vite build --outDir /tmp/build-check
  ```
  Tudo que a spec pedir de verificação visual/benchmark: escreva no relatório/PR em "Verificação pendente (local)" com o passo a passo para o dono rodar.
- **Branch e PR**: uma branch por tarefa, `cloud/<ID>` (ex.: `cloud/F1-07`), partindo do `master` mais recente. Ao terminar: push e abra **Pull Request** para `master` com o relatório da spec no corpo. **Não faça merge**; o coordenador local revisa e mescla.
- **Não edite** `docs/TASKS.md` nem `CLAUDE.md` (mudam localmente o tempo todo → conflitos).
- **Arquivos em edição local neste momento** (evite; se a spec mandar tocar, faça mudanças mínimas e localizadas, sem reformatar): `src/core/GameManager.js`, `src/entities/Unit.js`, `src/entities/Building.js`, `src/entities/Tree.js`, `src/core/Pathfinder.js`, `src/entities/ModelFactory.js`, `src/ai/**`, `src/sim/**`.
- Modelo recomendado para executar: **Sonnet**. Commits terminam com `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` (ou o modelo que estiver em uso).
- Idioma: PT-BR em código de UI, docs e relatório.

## 3. Fila da nuvem (execute em ordem; marque aqui só via PR, não edite TASKS)
| # | Tarefa | Spec | Observação |
|---|---|---|---|
| 1 | ~~BUGS-01~~ | — | ✅ mesclada (PR #1) |
| 2 | ~~F1-07~~ | — | ✅ mesclada (PR #2) |
| 3 | ~~F6-03~~ | — | ✅ mesclada (PR #3) |
| 4 | F3-01 — controles RTS completos + NEW-16 (população "5 / 10") | `docs/specs/F3-01-controles-rts.md` | Tudo via `gm.issue` (comandos F2-02) |
| 5 | F6-08 — menu de Opções completo | `docs/specs/F6-08-opcoes.md` | Rode **depois** da F3-01 (ambas tocam InputManager/UIManager) |

Para saber qual é a "próxima pendente": verifique se já existe branch `cloud/<ID>` ou PR aberto/mesclado com esse ID (`git ls-remote --heads origin 'cloud/*'` e o histórico do `master`). Pegue a primeira da tabela sem branch/PR.

## 4. O que está rodando localmente (não duplique)
- F2-03 — determinismo (RNG com seed, checksum, modo headless): `GameManager`, `Unit`, `Building`, `Tree`, `src/ai/**`, `src/sim/**`, `Pathfinder`, `ModelFactory`.
- Depois, localmente: F2-07 (event bus), F2-05 (mapas por dados).
- Já concluídas: F1-03/F1-03b, F1-05, F1-06, F1-08, F1-09, F2-02.
- Arte no Blender: **adiada** até o código estar pronto.

## 5. Relatório (corpo do PR, ≤ 25 linhas)
Branch, commits, o que foi feito, números/testes, desvios da spec, **Verificação pendente (local)** com passos.
