# F6-03 · HUD responsiva estilo WC2 (corrige B11)

> **Status: ✅ PRONTA — DONE (PR #3, nuvem)**

Leia antes: `docs/specs/_COMUM.md` (na nuvem, veja também `docs/HANDOFF_CLOUD.md`), `CLAUDE.md`, referências visuais `docs/reference/hudmodelo.png` e `docs/reference/dialogoBarracs.png`, `src/ui/screens/mainMenu.css` (identidade dourada já usada no menu).

## Por quê
- `style.css`: `#minimap-wrapper` (linha ~436) fixo em `left:20px`, `#selection-card` (~482) fixo em `left:186px; width:580px; max-width: calc(100vw - 440px)` → em 1024×768 o card é cortado e sobrepõe (B11). Não há nenhuma `@media`.
- Seleção múltipla não mostra grade de retratos; botões do card de comandos não mostram atalho; tooltips pobres.

## "Pronto"
Capturas manuais (ou pelo dono, localmente) em 1024×768, 1366×768, 1920×1080 e 2560×1440 sem cortes/sobreposições; card de comandos 3×3 com atalho visível; seleção múltipla em grade.

## Implementação
1. **Escala de UI** — variável CSS `--ui-scale` no `:root` calculada em JS (`src/ui/uiScale.js`, novo): `clamp(0.75, min(innerWidth/1920, innerHeight/1080) * userScale, 1.5)`; `userScale` de `localStorage['warpoly.uiScale']` (padrão 1). Aplicar com `transform: scale(var(--ui-scale))` + `transform-origin` nos 3 blocos (topo, minimapa, card) **ou** tamanhos em `calc(Npx * var(--ui-scale))`. Atualizar no `resize`.
2. **Layout inferior** — `#bottom-bar` vira grid de 3 colunas: `[minimapa][card de seleção/comandos flexível][retrato/infos]`, `gap` 12 px × escala, margens 16 px × escala; card ocupa o espaço restante (`minmax(0, 1fr)`), nunca ultrapassa a tela. Remover `left`/`width` absolutos atuais.
3. **Card de comandos 3×3** — os botões de treinar/construir/pesquisar existentes (`#bld-train-buttons`, `#selection-actions`, lista de construções do trabalhador) passam a ser renderizados numa grade 3×3 de 56 px × escala, cada um com: ícone, **letra de atalho** no canto (pegue de um mapa novo `src/ui/hotkeys.js`: construir — casa **C**, serraria **L**, fazenda **F**, quartel **B**, forja **K**, torre **T**; treinar — 1º botão **Q**, 2º **W**, 3º **E**; pesquisa **R**…; o funcionamento das teclas é da F3-01 — aqui só exibir), custo em miniatura e estado desabilitado (sem recursos/pop).
4. **Tooltip** — ao passar o mouse: nome, descrição, custo (ícones), tempo, requisitos faltantes em vermelho. Componente único `src/ui/Tooltip.js`, posicionado acima do botão, dentro da tela.
5. **Seleção múltipla** — quando `gm.selectedUnits.length > 1`: grade de até 24 retratos (ícone do tipo + barra de vida), clique num retrato seleciona só aquela unidade (`gm.selectSingle`).
6. **Topo** — barra de recursos centralizada que encolhe; em < 1100 px esconder textos secundários.

## Restrições
- `src/ui/UIManager.js` está sendo alterado em paralelo no computador do dono (as chamadas `queueUnit/startResearch/...` vão virar comandos na F2-02). **Não altere a lógica dos handlers de clique**; mexa só em como o DOM do card é montado (funções `renderBuildingTrainButtons`, `renderSelectionActions`, `updateSelectionCard`), preservando IDs/`data-*` usados pelos handlers. Prefira novos módulos em `src/ui/` chamados a partir do UIManager.
- Textos em PT-BR; nomes provisórios da decisão D2 (sem Horda/Aliança).
- Não mudar `index.html` IDs usados por testes (`#btn-pause-menu`, `#btn-play-again`, `#btn-go-main-menu`, `#resource-bar`, `#minimap-canvas`).

## Testes
- Vitest para `uiScale.js` (limites do clamp) e `hotkeys.js` (sem teclas duplicadas por contexto).

## Verificação
- `npm test`, `npm run lint`, `npx vite build`.
- Verificação visual **pendente para rodar localmente** (sem GPU na nuvem): descreva no relatório o que o dono deve olhar em cada resolução.

## Docs
`docs/04_DIAGNOSTICO.md`: marcar B11 como corrigido (pendente validação visual local).

## Entrega
Commit: `F6-03: HUD responsiva, card de comandos 3x3 com atalhos, tooltips, seleção múltipla`.
