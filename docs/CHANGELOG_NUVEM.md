# Changelog das alterações feitas na nuvem (2026-09-29 → 2026-10-11)

> Cada item tem o PR de origem. "Mesclado" = no `master`; "Pendente" = ainda sem PR mesclado (ver `ESTADO_NUVEM.md` §3). Nada aqui foi visto num navegador: a verificação visual, de áudio e de GPU está no corpo de cada PR ("Verificação pendente (local)").
> Branches `cloud/<ID>` por tarefa; integrações em `cloud/integracao` (#25), `cloud/integracao-2` (#35) e `cloud/integracao-3` (#42).

## Mesclado

### Jogabilidade e controles
- **F3-01** controles RTS (grupos de controle, S/H/A/P, Shift, atalhos do card, borda, minimapa) e NEW-16 (população "5 / 10"): feitos localmente (`ee2fe9d`); o PR #6 da nuvem foi fechado como superado.
- **NEW-35** `CMD.ATTACK_GROUND` (#19): o cerco ataca o chão; recua se o ponto estiver dentro do alcance mínimo.
- **NEW-26** inspeção somente-leitura de unidades/construções neutras e inimigas visíveis (#21): `gm.inspected`, sem comandos.
- **NEW-24** portão visual nas lacunas da muralha e muralhas no minimapa (#22).
- **NEW-29** nomes D7 das construções (Paço Real, Salão do Clã…) com i18n (#20).
- **UI** grade larga de construção do trabalhador (menos linhas).

### IA
- **NEW-44** (#30): leitura de madeira alcançável (`AIWood`), serraria avançada e reserva de madeira. Soak 10/10 nos 3 mapas; seed 82 terminou em 9106 ticks.
- **NEW-34** escolta de cerco e **NEW-25** ataque a acampamentos neutros (#34).

### Desempenho
- **NEW-7** `TreeManager` em chunks de 32 u com a contagem real (#18).
- **F1-10** LOD: decorações pequenas somem no zoom máximo; impostor de árvores distantes; sombra e detalhes de unidades/construções distantes (#24, #31); `?lod=0` desliga.
- **F10-05b** chunks de modelos por facção e carga de `.glb` por facção sob demanda (#15).
- **F10-04** orçamento de desempenho em CI (#28): `npm run perf`; baseline precisa ser regravada.

### Áudio
- **F7-08** motor de áudio de produção (#29): mixer + limitador, posicional, vozes com prioridade, música adaptativa, ambiência, falas por formantes; pausa e fim de jogo integrados.

### Qualidade e infraestrutura
- Testes de idioma (6 falhas antigas): `navigator.language = pt-BR` no vitest (#23). Suíte: 1527 testes.
- **NEW-41** teste do `fogOfWar` isolado (#17); **NEW-4** testes de `hasLineOfSight`; **NEW-31** `check-data-parity` roda; **NEW-50** lobby; **NEW-49** golpe do Arremessador; **NEW-52** juncos só em água rasa; **NEW-13** chamas sob névoa; **NEW-11** (já resolvido); **NEW-1** remove `GLTFBuildingLoader` (#26).
- **F9-05b** replay de partida online (`takeLog`) (#11). **AUD-1** auditoria do backlog.

### Documentos
- Specs: F1-10, NEW-6 (ORM/texturas: 530 MB em `high`, plano de 5 passos), NEW-14 (CPU de animação: 9 passos). Decisões do dono de 2026-10-11 (#27). `ESTADO_NUVEM.md`, `AUDITORIA_BACKLOG.md`.

## Mesclado em 2026-10-11 (integração #42): pedidos após jogar a campanha
- **#36** botão "Próxima missão" / "Tentar novamente" na tela final de missão.
- **#37** orcs (peão, guerreiro, lançador) na altura das unidades humanas (`VISUAL_SCALE`).
- **#38** áudio: só o que está na cena visível, menos volume/alcance com zoom afastado; efeitos de metal, pedra, explosão, desabamento, afundamento, flecha, machado, picareta, martelo; música militar por facção.
- **#39** tela final da campanha: arte de vitória por facção, epílogo "A Aurora sobre Aurelan", fanfarra, Rejogar (depende do #36).
- **#40** mapas maiores e florestas densas (madeira alcançável ≥ 8000 por jogador); `tools/measure-wood.mjs`.

## Pendente
- **F8-05b** (em andamento, `cloud/F8-05b`): campanha com todas as categorias de unidade e liberação progressiva de unidades, construções e pesquisas.

## Planos
Ver `ESTADO_NUVEM.md` §4: F8-05b → F8-06 (campanha da Horda), NEW-6 passos 1/2/4/5 (decisão sobre a resolução em `high`), NEW-14 passos 0–2/5–6 (3 e 4 após NEW-53), F1-10c (depende do bench), mapas `estreito-1v1`/`ilhas-4p`, arte Blender de vitória (`victory_human.webp`, `victory_orc.webp`), regravar `tests/perf/baseline.json`.
