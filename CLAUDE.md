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

## Regras
- Textos de UI em PT-BR (até existir i18n — F6-09).
- Nós nomeados dos modelos (`Torso`, `ArmL`, `Sword`…) são usados pelo `UnitAnimator` e `ModelFactory.rebindUserData`: não renomeie sem atualizar os dois.
- Mudanças visuais: confira no jogo **e** no inspetor antes de entregar.
- Orçamento por modelo novo: ≤ 20 draw calls e texturas ≤ 512².
- Não use nomes próprios/lore da Blizzard em conteúdo novo (ver `docs/05_PARIDADE_WARCRAFT2.md`).
