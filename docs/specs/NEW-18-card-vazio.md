# NEW-18 · Guia rápido esticado na base da HUD quando nada está selecionado

Leia antes: `docs/specs/_COMUM.md`, `CLAUDE.md`. Executor: **haiku**. Worktree isolada. Sem dev server obrigatório.

## Sintoma
Sem seleção, aparece uma faixa escura larga ocupando toda a base da tela (do minimapa até a direita), com o texto "WASD Mover · Scroll Zoom · C / Clique Selecionar · Direito Mover" encostado na direita. Captura: `tools/ui-captures/maps/ilhas-4p-jogo.png`.

## Causa (confirmada no código)
`style.css` ~linha 436: `#bottom-bar` é um grid `grid-template-columns: auto minmax(0, 1fr) auto` com 3 filhos: `#minimap-wrapper`, `#selection-card`, `#quick-guide` (~linha 1150). Quando nada está selecionado, `UIManager.updateSelectionCard()` (`src/ui/UIManager.js` ~443–566) põe `#selection-card` em `display:none`; o card **sai do fluxo do grid** e o `#quick-guide` é auto-posicionado na **coluna 2 (1fr)**, esticando na largura toda.

## Correção (só CSS)
Em `style.css`, fixe a coluna de cada filho do `#bottom-bar`:
```css
#minimap-wrapper { grid-column: 1; }
#selection-card  { grid-column: 2; }
#quick-guide     { grid-column: 3; justify-self: end; }
```
(adicione às regras existentes de cada seletor; não crie regras duplicadas se já houver o seletor — edite o bloco existente). Confira que nada no `@media (max-width: 1100px)` redefine `grid-column`.

## Não fazer
Não editar `src/ui/UIManager.js` nem outros arquivos (outro agente, F3-04, mexe em `UIManager.js`).

## Verificação
- `npm test`, `npm run lint`, `npx vite build --outDir /tmp/claude-1000/warpoly-build-check`.
- Se quiser confirmar visualmente: script Playwright via `bash /home/rafael/warpoly/tools/safe-run.sh --timeout 240 -- node <script>` (GPU real, use `assertHardwareGpu` de `tools/lib/assertGpu.mjs`), dev server `timeout 600 npx vite --port 5198 --strictPort`, abrir `/?play&skipPreload&texq=low`, sem seleção, e medir `document.getElementById('quick-guide').getBoundingClientRect().width` — deve ser < 400 px em 1280×720 (antes era ~1400). Encerre vite e navegador ao final.

## Entrega
Commit: `fix(hud): guia rápido não estica sem seleção (NEW-18)`. Relatório ≤ 10 linhas.
