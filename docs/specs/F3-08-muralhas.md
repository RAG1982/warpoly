# F3-08 · Muralhas (segmentos em arrasto, bloqueio de caminho, destruíveis)

> **Status: ⏳ A FAZER** (spec pronta 2026-09-30; não disparada — dispare só depois de F3-07 e NEW-21/NEW-22 mesclados).
> Leia antes: `CLAUDE.md`, `docs/specs/_COMUM.md`, `docs/08_GAME_DESIGN.md` §5.1 (tabela de construções, linha "Muralha"), §6 (armadura 10), `docs/07_DECISOES.md` (D2 nomes).
> Executor: **sonnet**, worktree, porta do vite **5203**. Depende de F1-07 (pathfinder), F3-03 (armadura) e NEW-21 (pathfinder devolve "sem caminho") — confirme com `git log --oneline | grep -E "NEW-21|F3-03"`.

## Por quê
Falta a muralha do WC2: barreira barata que o jogador desenha em linha, que bloqueia unidades inimigas e precisa ser destruída ou contornada. O `Pathfinder` já tem bloqueio dinâmico (`blockCircle`) ligado à criação/morte de construções (`GameManager.js` ~l.224 e ~l.237), então o núcleo já existe: falta o tipo de construção, a colocação por arrasto e o comportamento das unidades/IA diante de uma parede fechada.

## Pronto quando (mensurável)
1. **Dados** em `src/data/buildings.js`: `wall_human` (`name:'Muralha de Pedra'`) e `wall_orc` (`name:'Paliçada de Ferro'`), `role:'wall'`, `hp:250`, `armor:10`, `cost:{gold:0,wood:10,stone:20}`, `collisionRadius:1.5`, `popGranted:0`, `visionRadius:6`, `healthBarHeight:2.6`, `tower:null`, `trains:[]`, `dropoff:[]`, `requires:[]`, `buildTime` como as demais construções pequenas (metade do da Casa). Sem requisito de tier (design: disponível no nível 1). Aparece no painel de construção do aldeão/peão (mesma lista das outras).
2. **Colocação por arrasto**: com uma muralha selecionada para construir, botão esquerdo **pressionado** fixa o ponto A; ao arrastar, um traço em grade mostra segmentos ao longo da linha reta A→B (eixo dominante, snap a 8 direções; passo entre centros = `WALL_STEP = 2.4`, constante em `src/data/buildings.js`). Soltar confirma **todos os segmentos válidos** (custo total = n × custo do segmento, cobrado uma vez por segmento). Clique simples (sem arrasto) põe 1 segmento. Segmentos inválidos (terreno, árvore, outra construção, vau) aparecem vermelhos e são ignorados; o total exibido no ghost é só dos válidos. `Esc`/botão direito cancela. Shift mantém o modo após confirmar (como as demais construções — siga o que `InputManager` já faz).
3. **Comando**: novo `CMD.PLACE_WALL` em `src/sim/commands.js` com campos `['buildingType','points','unitIds']` (`points` = `[{x,z},...]`, ≤ 60 pontos, validado). `CommandExecutor` chama `gm.placeWall(type, points, unitIds, ownerId)`, que faz `canPlaceBuilding` por ponto (na ordem), cobra e cria cada segmento (reaproveite a lógica de `placeBuilding` sem duplicar: extraia um helper interno), e ordena a construção **em fila** (`orderBuild` com `queued`) aos aldeões escolhidos, segmento a segmento. Determinismo: mesma seed + mesmos comandos = mesmo checksum (`determinism.test.js` verde).
4. **Regras de posicionamento** (`canPlaceBuilding`): para `role:'wall'` o `minBuildingGap` de 3,2 **não** vale contra outras muralhas do mesmo dono (permite segmentos a 2,4) mas vale contra as demais construções; árvores/jazidas/vaus como hoje. Muralha **pode** ser colada (gap 0,5) em torre/Centro do mesmo dono.
5. **Bloqueio**: segmento concluído ou em obra bloqueia o pathfinder (já acontece por construção; garanta com teste). Uma linha contínua de segmentos com passo 2,4 e raio 1,5 (`effRadius` 1,2 em grade de 1,5) **não deixa fresta**: teste em `pathfinder.test.js`-estilo que uma fileira de 10 segmentos fecha a passagem (caminho inexistente) e que abrir 1 segmento (destruir) reabre.
6. **Portão**: nesta spec não há portão; deixe uma lacuna intencional do jogador (não colocar segmento) — documentado em `docs/02_MECANICAS.md`.
7. **Unidades inimigas**: quando `requestPath` não acha caminho (NEW-21) para uma ordem de movimento/ataque-movimento, a unidade vai ao ponto alcançável mais próximo (comportamento do NEW-21). Ordem de **ataque direto** em muralha inimiga funciona (clique direito) e unidades em `attackMove` **atacam muralhas que bloqueiam** (sem caminho ao alvo → alvo = muralha alcançável mais próxima do destino); muralhas **não** são alvo de auto-aquisição por unidades ociosas/em patrulha (evita distrair o combate; teste).
8. **Construção/visual**: reutilize o esqueleto de `Building` (obra por estágios via `updateConstructionState`). Modelo 3D **procedural simples** em `src/models/buildings/WallModel.js` (bloco 2,2×2,4×2,2 de pedra low-poly, `?glb` não se aplica) com dois materiais (humano pedra clara, orc madeira escura+ferro), registrado no `ModelFactory`. **Conexões**: sem malha de conexão nesta spec — só o bloco (v2 fica em `NEW-24` no backlog; registre). Orçamento: 1 draw call por material graças à mesclagem estática (`?merge`): não use `Mesh` novo por segmento sem passar pelo caminho de mesclagem já existente; se a mesclagem estática não cobrir construções que nascem em runtime, use **InstancedMesh** por facção para segmentos concluídos (cap 400 instâncias) — escolha e registre.
9. **IA** (`src/ai/**`): (a) defesa: com ≥ 6 aldeões extras e madeira/pedra sobrando, a IA constrói uma linha curta de muralha (≤ 8 segmentos) na frente do Centro em direção ao inimigo, no máx. 1 linha por partida e só no modo Normal/Difícil; (b) ataque: quando `requestPath` do exército ao Centro inimigo falhar, ataca a muralha mais próxima do destino em vez de ficar parado. Teste headless: mapa `continental-1v1` com corredor fechado por muralha → exército da IA destrói a muralha e chega.
10. **HUD**: card da muralha mostra nome, PV, armadura; sem botões de treino. Nome do botão de construção "Muralha de Pedra"/"Paliçada de Ferro"; tecla de atalho segue o padrão existente (`hotkeys`), sem conflito com `tests/unit/hotkeys.test.js`. Mensagens em PT-BR ("⚠️ Muralha: sem pontos válidos").

## Contexto no código (confira antes de editar)
- `src/data/buildings.js` — `BUILDINGS`, `getBuildingDef`; molde: `watchtower` (~l.151).
- `src/core/GameManager.js`: `canPlaceBuilding` (~l.585), `placeBuilding` (~l.796), bloqueio no pathfinder (~l.224/237), `createBuilding`.
- `src/core/InputManager.js`: `startPlacement` (~l.313), `confirmPlacement` (~l.345), ghost em mousemove (~l.184).
- `src/sim/commands.js` (`CMD`, esquemas, validação) e `src/sim/CommandExecutor.js` (~l.145).
- `src/core/Pathfinder.js`: `blockCircle` (~l.212), `_searchAStar`, `requestPath`.
- `src/entities/Building.js`: construção por estágios, `takeDamage/die` (libera o bloqueio via `GameManager`).

## Não fazer
- Sem portão, sem torre de muralha, sem reparo (F3-05), sem arte final no Blender (F7 — depois), sem modelo com conexões (NEW-24).
- Não altere custos/valores de outras construções. Não mude o formato de `BUILDING_PLACED` (só emita 1 por segmento).
- Evite editar `style.css`/`src/ui/screens/**`; em `UIManager.js` só o mínimo (botão de construir + card).

## Testes (Vitest, em `tests/unit/`)
- `walls.test.js`: `placeWall` cobra n×custo só dos válidos; recusa sem recursos (nada é criado); limite de 60 pontos; passo 2,4 permitido entre muralhas do mesmo dono e proibido contra outras construções; fileira de 10 fecha o pathfinder; destruir 1 abre; muralha inimiga é atacável por ordem direta; ociosos não a auto-adquirem.
- `commands.test.js`: `PLACE_WALL` valida campos/limite.
- IA headless: exército derruba muralha e chega ao destino (tempo simulado ≤ 5 min).
- `determinism.test.js` continua verde.

## Verificação
Comandos mínimos do `_COMUM.md`. No jogo (porta 5203, `?skipPreload&texq=low&play`, via safe-run): arrastar linha de 8 segmentos, conferir ghost verde/vermelho, obra por aldeões, unidade inimiga parando na parede e atacando; capturas em `tools/ui-captures/walls/`. `game.sceneManager.renderer.info` antes/depois com 40 segmentos (draw calls +≤ 2).

## Docs
`docs/02_MECANICAS.md` (muralhas, lacuna), `docs/01_ARQUITETURA.md` (`PLACE_WALL`, `WALL_STEP`), `docs/08_GAME_DESIGN.md` (marcar implementado), `docs/TASKS.md` não (coordenador).

## Entrega
Commits `F3-08 wip: ...` por etapa; final `F3-08: muralhas em arrasto com bloqueio de caminho e IA`. Relatório ≤ 25 linhas.
