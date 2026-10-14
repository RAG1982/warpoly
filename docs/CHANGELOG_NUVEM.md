# Changelog das alterações feitas na nuvem (2026-09-29 → 2026-10-13)

> Cada item tem o PR de origem. "Mesclado" = no `master`; "Pendente" = ainda sem PR mesclado (ver `ESTADO_NUVEM.md` §3). Nada aqui foi visto num navegador: a verificação visual, de áudio e de GPU está no corpo de cada PR ("Verificação pendente (local)").
> Branches `cloud/<ID>` por tarefa; integrações em `cloud/integracao` (#25), `cloud/integracao-2` (#35), `cloud/integracao-3` (#42) e `cloud/integracao-4` (#46). **Tudo está mesclado; nada pendente.**

## Mesclado

### Áudio
- **cloud/remover-falas** (decisão do dono, 2026-10-11): removidas as falas sintetizadas das unidades (diretório `src/audio/speech/`, canal `volumeVoice` e slider das Opções, chaves i18n `opt.a.voice*`). Ficam os cliques de seleção/ordem, os efeitos e o `VoicePool`; o histórico da F7-08 abaixo cita as falas como eram. Configuração salva com `warpoly.volVoice` é ignorada.

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
- **F7-08** motor de áudio de produção (#29): mixer + limitador, posicional, vozes com prioridade, música adaptativa, ambiência (as falas foram removidas depois, ver "Áudio" acima); pausa e fim de jogo integrados.

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


## Mesclado em 2026-10-11/12 (integração #46 e documentos #47–#50)
- **F8-05b** (#44): campanha da Aliança com todas as categorias de unidade e liberação progressiva (`unlocks`, `availableTech`, `techRestrictionFor`; exigência travada em `requirements.js`; ação `setTier` e condição `research` nas missões; UI "Disponível na missão N" e anúncio "Novo: …"); m5 oficina/sapadores/herói Brann, m6 naval com petróleo, m7 magos/aéreas/herói Oren, m8 tudo.
- **Falas removidas** (#45): `src/audio/speech/` apagado, slider "Falas" das Opções removido (configuração antiga ignorada).
- **Música:** catálogo único (41 entradas), tema de abertura "Marcha da Tempestade" e 2 candidatas, 5 candidatas de paz e 6 de combate por facção, evolução por tempo de partida, player no inspetor com seleção (`localStorage`), `docs/MUSICA.md`. As 3 faixas de combate atuais ficam `inGame:false`.
- **MIDI** (#47): `tools/export-midi.mjs` e `src/audio/music/midiExport.js`.
- **Documentos do novo mundo** (#48–#50): briefing da Horda (F8-06, preservado), briefing do dono, specs de história/campanha (12 missões por facção, tutorial 1–6), 6 heróis (`MUNDO-HEROIS.md`), terreno/mapas com costas irregulares, biomas, lava sem dano e mapa-múndi ilustrativo; protótipo `tools/proto/irregular-coast.mjs` com prévias.

## Integração local (2026-10-13; não é trabalho da nuvem)

- **Docs da nuvem** `origin/cloud/docs-estado-final` (`7497c72`, de 2026-10-12) mesclados. Conflito em `docs/TASKS.md` resolvido pela versão da nuvem (a mais nova); o resto foi mantido.
- **Novo mundo (parcial)**, branch `task/mundo-2026-10-13` (`cc0c505` arte e decisões de mapa; `b73fd57` código e dados; mesclada no `master`): lava na simulação (`lavaGrid`, `Terrain.isLava`), biomas e 5 tilesets novos, 6 heróis, seletor de campanhas (trilha `main` × `beta`), `war-alliance` e `war-horde` (12 missões cada, só dados), tela de história, mapa-múndi ilustrativo, javali e ovelha como fauna, mapas com no mínimo 168×168. Estado por passo em `docs/TASKS.md`, seção "Novo mundo".
- **Mina que desaba** (NEW-54): mina ou pedreira esgotada sai da simulação, com som e VFX de desabamento.
- **Revisão visual de 2026-10-11** (`task/revisao-visual-2026-10-11`, commit `5a5ebdd`, mesclada no `master`): NEW-13 (construção lembrada pela névoa não anima nem solta fumaça), NEW-19 (decal da ruína acompanha o relevo; ruína da mina fica fora da pegada), plano de água de 1400 u. Capturas e JSON em `tools/ui-captures/revisao-2026-10-11/`. NEW-35 e NEW-52 ficaram com verificação incompleta (ver `docs/TASKS.md`).
- **Não mesclado:** `task/F7-08-verificacao` (`ecdd348`, WIP de áudio): enviado ao `origin`, conflita com o motor de música em `AudioEngine.js` e `tools/audio-check.mjs`.
- **Superado, não mesclar:** `cloud/F3-01` (PR #6).

## Planos
Ver `ESTADO_NUVEM.md` §4: novo mundo (gerador de mapas irregulares → biomas → dados dos 6 heróis → seletor de campanhas → tela de história → 12 missões por facção), NEW-6, NEW-14, F1-10c, arte Blender, regravar a baseline de desempenho. A F8-06 (Horda, 8 missões) vira a "Campanha Clássica (beta)" junto com a Aliança atual.
