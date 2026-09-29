# F3-01 · Controles RTS completos (+ NEW-16)

Leia antes: `docs/specs/_COMUM.md` (na nuvem: `docs/HANDOFF_CLOUD.md`), `CLAUDE.md`, seção "Comandos" de `docs/01_ARQUITETURA.md` (F2-02: `gm.issue(cmd)`, `CMD.*`, `queued`), `src/ui/hotkeys.js` (F6-03: letras já **exibidas** no card).

## "Pronto"
Todas as ações abaixo funcionam no jogo, emitindo **comandos** (`gm.issue(makeCommand({...}))`) — nunca chamando métodos de entidade diretamente — e são cobertas por testes de lógica pura.

## Controles
Toda a lógica de teclado/mouse fica em `src/core/InputManager.js` (`onKeyDown` ~linha 86, `onMouseDown/Up/Move`, `raycastScene`); crie `src/core/ControlGroups.js` e `src/core/Hotkeys.js` (lógica pura, testável) chamados pelo InputManager.

| Ação | Entrada | Comando / efeito |
|---|---|---|
| Grupos de controle | `Ctrl+1..9` grava seleção; `1..9` seleciona; duplo toque em `1..9` (< 350 ms) centraliza a câmera no grupo; `Shift+1..9` adiciona ao grupo | seleção local (não é comando) |
| Adicionar/remover da seleção | `Shift+clique` alterna unidade; `Shift+caixa` adiciona | local |
| Selecionar todos do tipo na tela | duplo clique numa unidade própria | local (projeção como `selectUnitsInBox`) |
| Parar | `S` | `CMD.STOP` |
| Segurar posição | `H` | `CMD.HOLD` (a tecla H antiga "ir ao HQ" passa para `Backspace`) |
| Atacar-movendo | `A` depois clique esquerdo no chão/alvo | `CMD.ATTACK_MOVE` (cursor em modo alvo; Esc/clique direito cancela) |
| Patrulhar | `P` depois clique esquerdo | `CMD.PATROL` |
| Enfileirar | segurar `Shift` ao dar qualquer ordem | `queued: true` |
| Card de comandos | letras de `src/ui/hotkeys.js` (construir: C/L/F/B/K/T; treinar Q/W/E; pesquisa R/A/S/D) acionam o botão correspondente **do card visível** | reusa o handler de clique do botão (dispare `.click()` no botão por `data-*`), para não duplicar lógica |
| Trabalhador ocioso | `.` (ponto) seleciona o próximo trabalhador `idle` do jogador local e centraliza | local |
| Último alerta | `Espaço` centraliza no último evento "sob ataque" (se `uiManager` expuser; senão no HQ) | local |
| Pan pela borda | mouse a ≤ 8 px da borda da janela move a câmera (velocidade = WASD) | local; desligável em `localStorage['warpoly.edgePan']='0'` |
| Arrastar câmera | botão do meio pressionado + mover | local |
| Minimapa | clique direito no minimapa com unidades selecionadas | `CMD.MOVE` para o ponto correspondente (use a conversão já existente em `UIManager.initMinimapEvents`) |
| Limite de seleção | `SELECTION_LIMIT = 24` (constante exportada) — caixa pega as 24 mais próximas do centro da caixa | local |

Conflitos de tecla: letras do card só valem quando **não** há modo alvo ativo e o foco não está em input de texto; `S/H/A/P` têm prioridade quando há unidades selecionadas e nenhuma construção selecionada; com construção selecionada valem as letras do card. Documente a tabela final em `docs/02_MECANICAS.md` ("Controles").

## NEW-16 (junto)
Em `style.css`/`src/ui/` (F6-03): abaixo de 1100 px a população mostra só "5"; deve mostrar "5 / 10" sempre (esconder outro texto secundário, não o máximo).

## Restrições
- `GameManager.js`, `Unit.js`, `Building.js`, `src/ai/**`, `src/sim/**` estão sendo alterados localmente (determinismo F2-03): **não edite** — tudo via `gm.issue` e leitura de estado. Se precisar de um getter novo, peça no relatório.
- `UIManager.js`: só o necessário para minimapa (clique direito) e NEW-16.

## Testes (Vitest)
- `controlGroups.test.js`: gravar/selecionar/adicionar; unidade morta sai do grupo; duplo toque detectado por tempo.
- `hotkeys.test.js` (estender): prioridade de tecla conforme contexto (unidades vs construção vs modo alvo).
- Limite de seleção: 30 unidades na caixa → 24 mais próximas do centro.

## Verificação
`npm test`, `npm run lint`, `npx vite build`. Verificação manual **pendente local**: liste no PR um roteiro de 10 passos para o dono testar cada controle.

## Entrega
Commit(s) na branch `cloud/F3-01`: `F3-01: controles RTS completos (grupos, S/H/A/P, shift, atalhos do card, borda, minimapa)`; `fix(ui): população sempre com máximo (NEW-16)`.
