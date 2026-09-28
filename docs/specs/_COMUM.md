# Regras comuns a TODAS as especificações (leia antes da spec)

Você é um agente executor. A especificação foi escrita pelo planejador. **Siga a spec literalmente**; quando a spec não cobrir um detalhe, escolha a opção mais simples que preserve o comportamento atual e registre a escolha no relatório. Não amplie o escopo.

## Ambiente
- Repositório: `/home/rafael/warpoly` (three.js 0.186 + Vite 8, JS ES modules, sem TypeScript). Contexto geral: `CLAUDE.md` e `docs/01_ARQUITETURA.md`.
- Trabalhe na worktree/branch indicada na spec. Não edite `docs/TASKS.md` (o coordenador atualiza).
- `node_modules`: se a worktree não tiver, rode `ln -s /home/rafael/warpoly/node_modules node_modules` (nunca commite o link). Se a spec pedir dependência nova, remova o link e rode `npm install`.

## Recursos da máquina (OBRIGATÓRIO)
- Todo navegador (Playwright/Chromium), Blender ou benchmark roda **somente** via
  `bash /home/rafael/warpoly/tools/safe-run.sh --timeout <s> -- <comando>` (trava global: 1 processo pesado por vez; teto de 12 GB). Se outro agente estiver com a trava, espere.
- Chromium **sempre com GPU real** (`--use-angle=vulkan --enable-gpu`, como em `tools/bench/run-bench.mjs`). Se o renderer WebGL reportado contiver `SwiftShader` ou `llvmpipe`, **aborte** (texturas vão para a RAM e estouram a memória).
- `--js-flags=--max-old-space-size=2048`, uma página por vez, feche browser e vite em `finally`.
- Dev server: `timeout 900 npx vite --port <porta da spec> --strictPort`; encerre ao terminar. Nunca deixe processos órfãos (`pkill -f "vite --port <porta>"` no fim).
- No jogo de teste use `?skipPreload&texq=low` (exceto quando a spec medir load/texturas).

## Verificação mínima antes de entregar
```bash
npm test
npm run lint        # 0 erros (avisos antigos são aceitos)
npx vite build --outDir /tmp/claude-1000/warpoly-build-check   # não suje dist/
npm run smoke       # já usa safe-run
```

## Entrega
- Commit único (ou commits pequenos) na branch da worktree, mensagem indicada na spec, terminando com a linha:
  `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`
- **Relatório final ≤ 25 linhas**: branch, hash, o que foi feito (tópicos), números pedidos pela spec (antes/depois), resultado dos 4 comandos acima, desvios da spec e pendências. Sem colar código.
