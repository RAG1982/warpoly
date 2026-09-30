# NEW-20 · Teste intermitente (timeout com cache frio)

> **Status: ⏸ ADIADA pelo dono (agente sem permissão para npx vitest)**

Leia antes: `docs/specs/_COMUM.md`, `CLAUDE.md`. Executor: **haiku**. Worktree isolada. Sem navegador.

## Sintoma
Após o merge da F3-04, a 1ª execução de `npm test` teve **1 falha**; as 5 seguintes passaram (264/264). Suspeita: testes pesados em modo headless (partidas IA×IA de milhares de ticks) estourando o timeout padrão do Vitest (5 s) quando o cache de transformação está frio ou a máquina está ocupada.
Arquivos pesados: `tests/unit/determinism.test.js` (12 000 ticks, já tem um `it(` com timeout próprio perto da linha 29 — confira), `eventsHeadless.test.js`, `mapsHeadless.test.js`, `economy-mine.test.js`, `no-passive-income.test.js`, `requirements.test.js`, `commandExecutor.test.js`.

## Passos
1. Reproduzir com cache frio: `rm -rf node_modules/.vite node_modules/.vitest 2>/dev/null; npx vitest run --reporter=verbose 2>&1 | tail -40` — rode 3 vezes (limpando o cache antes de cada) e anote qualquer falha com nome do teste e mensagem.
2. Medir duração: `npx vitest run --reporter=verbose` e liste os testes com duração > 2 s.
3. Correção:
   - em `vitest.config.js`, adicionar `testTimeout: 20000` e `hookTimeout: 20000` (mantendo o resto);
   - se algum teste falhar por outro motivo que não timeout (ex.: dependência de ordem, estado global compartilhado como `ModelFactory.headless` ou cache de módulo), corrigir **o teste** (isolar estado com `beforeEach/afterEach`) — não mude código de `src/` sem justificar no relatório.
4. Validar: 5 execuções seguidas com cache limpo antes de cada → 5/5 verdes.

## Não fazer
Não editar código de `src/` (exceto se o problema for comprovadamente de estado global — nesse caso mudança mínima e explicada). Não editar `docs/TASKS.md`.

## Verificação
`npm test` (5×, cache limpo), `npm run lint`.

## Entrega
Commit: `test: timeouts para testes headless pesados (NEW-20)`. Relatório ≤ 10 linhas: causa encontrada, testes lentos (nome + duração), resultado das 5 execuções.
