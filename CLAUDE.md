# WarPoly — instruções para agentes

RTS 3D low-poly no navegador (three.js + Vite, JS ES modules), inspirado em **Warcraft II** (Aliança Humana × Horda Orc). Objetivo: paridade de recursos com o WC2 e qualidade AAA no navegador.

## Antes de qualquer tarefa
1. Leia `docs/README.md` e a tarefa correspondente em `docs/TASKS.md`.
2. Siga o **Protocolo de execução** do TASKS.md: mude o status para `DOING`, trabalhe em `task/<ID>`, respeite a posse de arquivos da sua lane e atualize status/docs ao terminar.
3. Não duplique números de balanceamento: depois da F0-06 eles vivem em `src/data/`.

## Comandos
- Dev: `npx vite --port 5173` (launch config `warpoly-dev`). URLs: `/` jogo, `/inspector.html` inspetor 3D. Parâmetros: `?skipPreload`, `?faction=orc`.
- Build: `npm run build`.
- Debug no console: `window.game` (jogo), `window.inspectorApp` (inspetor); desempenho em `game.sceneManager.renderer.info`.
- Blender headless (pipeline de arte): `/home/rafael/Downloads/blender-5.2.1-linux-x64/blender -b --python tools/blender/<script>.py`.

## Modelos e fluxo de trabalho (decisão do dono, 2026-09-28)
- **Opus 5.5 só planeja e escreve especificações** (`docs/specs/<ID>.md`, regras comuns em `docs/specs/_COMUM.md`) e, no futuro, faz modelagem no Blender.
- **Execução de código por agentes `sonnet`** (ou `haiku` para tarefas mecânicas triviais), que leem `CLAUDE.md` + a spec e executam.
- **Modelagem no Blender adiada** até todo o código estar pronto (F7-00b, F7-09 e demais tarefas ART em espera).

## Regras de recursos da máquina (OBRIGATÓRIO — a máquina travou por OOM em 2026-09-28)
- Todo processo pesado (Playwright/Chromium, Blender, `npm run bench`, `npm run smoke`) roda **somente** via
  `/home/rafael/warpoly/tools/safe-run.sh [--mem 12G] [--timeout 300] -- <comando>` (trava global: 1 por vez; teto de RAM de 12G sem swap; máquina tem 32 GB).
- No navegador de teste use `?texq=low` quando existir e `?skipPreload` sempre que a medição não for de load.
- Encerre o dev server (vite) e navegadores ao terminar; nunca deixe processos órfãos.
- No máximo 3 agentes em paralelo (só 1 processo pesado por vez, garantido pela trava).

## Regras
- Textos de UI em PT-BR (até existir i18n — F6-09).
- Nós nomeados dos modelos (`Torso`, `ArmL`, `Sword`…) são usados pelo `UnitAnimator` e `ModelFactory.rebindUserData`: não renomeie sem atualizar os dois.
- Mudanças visuais: confira no jogo **e** no inspetor antes de entregar.
- Texturas de rosto ficam **só na face frontal (+Z) da cabeça**; laterais, topo e nuca usam pele/material liso. Armas com gume voltado para a frente do personagem (+Z).
- Orçamento por modelo novo: ≤ 20 draw calls e texturas ≤ 512².
- Não use nomes próprios/lore da Blizzard em conteúdo novo (ver `docs/05_PARIDADE_WARCRAFT2.md`).
