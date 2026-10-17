# Índice das especificações (status real em 2026-10-17)

> A linha `Status` dentro de cada spec **não foi atualizada** depois da execução (muitas dizem "A FAZER" mas estão DONE). A coluna **Status real** abaixo vem do quadro final em [../historico/TASKS_ate_2026-10-17.md](../historico/TASKS_ate_2026-10-17.md); no andamento atual, o status vive no quadro da §6 de [../PLANO_FINAL.md](../PLANO_FINAL.md).
> Regras comuns a todas as specs: [`_COMUM.md`](_COMUM.md). Fichas novas (M0–M6) ficam em [../PLANO_FINAL_TAREFAS.md](../PLANO_FINAL_TAREFAS.md), não aqui. Fluxo e regras de modelos: [../SESSION_HANDOFF.md](../SESSION_HANDOFF.md).

## Specs por tarefa (spec → status real)

| Spec | Tarefa | Status real | Observação |
|---|---|---|---|
| [BUGS-01-pequenos.md](BUGS-01-pequenos.md) | NEW-2, 5, 11, 13 | DONE (PR #1, nuvem) | |
| [F0-08-anti-swiftshader.md](F0-08-anti-swiftshader.md) | F0-08 | DONE (d17aaf5) | |
| [F1-03-unidades-por-osso.md](F1-03-unidades-por-osso.md) | F1-03 | DONE parcial (3fd7fc2) | meta cumprida via F1-03b |
| [F1-03b-unidades-skinned.md](F1-03b-unidades-skinned.md) | F1-03b | DONE (38c013b) | meta 50 FPS → NEW-15 |
| [F1-05-nevoa-shader.md](F1-05-nevoa-shader.md) | F1-05 | DONE (e33d40e) | |
| [F1-06-grade-espacial.md](F1-06-grade-espacial.md) | F1-06 | DONE parcial (bf87e23) | gargalo restante → NEW-14 |
| [F1-07-pathfinder.md](F1-07-pathfinder.md) | F1-07 | DONE (PR #2, nuvem) | |
| [F1-08-alocacoes-vazamentos.md](F1-08-alocacoes-vazamentos.md) | F1-08 | DONE (70fea77) | |
| [F1-09-tick-fixo-lod-animacao.md](F1-09-tick-fixo-lod-animacao.md) | F1-09 | DONE (5dca95c) | |
| [F1-10-lod-culling.md](F1-10-lod-culling.md) | F1-10 | DOING (parcial) | itens 1–4 mesclados; falta a medição local de massa300 (M1-03) |
| [F2-02-sistema-comandos.md](F2-02-sistema-comandos.md) | F2-02 | DONE (b5ca827) | |
| [F2-03-determinismo.md](F2-03-determinismo.md) | F2-03 | DONE (32b5fa9) | |
| [F2-05-mapas-dados.md](F2-05-mapas-dados.md) | F2-05 | DONE (110c125) | |
| [F2-07-event-bus.md](F2-07-event-bus.md) | F2-07 | DONE (13fc992) | |
| [F3-01-controles-rts.md](F3-01-controles-rts.md) | F3-01 | DONE (2026-10-01) | feita localmente; o PR #6 da nuvem foi superado |
| [F3-03-combate.md](F3-03-combate.md) | F3-03 | DONE (2b345d6) | |
| [F3-04-economia.md](F3-04-economia.md) | F3-04 | DONE (5b8a72e) | |
| [F3-05-reparo-cancelamento.md](F3-05-reparo-cancelamento.md) | F3-05 | DONE (bad98e7) | |
| [F3-06-niveis-centro.md](F3-06-niveis-centro.md) | F3-06 | DONE (369cc38) | |
| [F3-07-pesquisas-niveis.md](F3-07-pesquisas-niveis.md) | F3-07 | DONE (15f7969) | |
| [F3-08-muralhas.md](F3-08-muralhas.md) | F3-08 | DONE (db969c7) | |
| [F3-09-vitoria-estatisticas.md](F3-09-vitoria-estatisticas.md) | F3-09 | DONE (fcf0c73) | |
| [F3-10-neutros-critters.md](F3-10-neutros-critters.md) | F3-10 | DONE (05b8740) | |
| [F3-11-balanceamento-base.md](F3-11-balanceamento-base.md) | F3-11 | DONE (a048317) | lote a repetir: NEW-30 |
| [F4-01-cavalaria.md](F4-01-cavalaria.md) | F4-01 | DONE (8f753cf) | |
| [F4-02-cerco.md](F4-02-cerco.md) | F4-02 | DONE (f419963) | |
| [F4-03-mana-habilidades.md](F4-03-mana-habilidades.md) | F4-03 | DONE (19c7eae) | |
| [F4-04-conjuradores-magias.md](F4-04-conjuradores-magias.md) | F4-04 | DONE (48d6b14) | |
| [F4-04b-templo-magias-restantes.md](F4-04b-templo-magias-restantes.md) | F4-04b | DONE (ebb67e5) | |
| [F4-05-sapadores.md](F4-05-sapadores.md) | F4-05 | DONE (19c7eae) | |
| [F4-06-aereo.md](F4-06-aereo.md) | F4-06 | DONE (2026-10-01) | |
| [F4-07a-petroleo-estaleiro.md](F4-07a-petroleo-estaleiro.md) | F4-07a | DONE (2026-10-02) | |
| [F4-07b-navios-de-guerra.md](F4-07b-navios-de-guerra.md) | F4-07b | DONE (2026-10-07) | |
| [F4-08-herois.md](F4-08-herois.md) | F4-08 | DONE (2026-10-08) | 3 heróis; os 6 do novo mundo: MUNDO-2 |
| [F5-ia.md](F5-ia.md) | F5-01…05 | DONE, exceto F5-03 | F5-03 (dificuldade) parcial e adiada pelo dono; F5-06 DONE (2026-10-09) |
| [F6-02-05.md](F6-02-05.md) | F6-02, F6-05 | DONE (2026-10-02) | plano do próprio executor |
| [F6-03-hud-responsiva.md](F6-03-hud-responsiva.md) | F6-03 | DONE (PR #3, nuvem) | |
| [F6-04-06-07.md](F6-04-06-07.md) | F6-04, 06, 07 | DONE (2026-10-02) | plano do próprio executor |
| [F6-08-opcoes.md](F6-08-opcoes.md) | F6-08 | DONE (2026-10-02) | |
| [F6-09.md](F6-09.md) | F6-09 | DONE (2026-10-02) | i18n pt-BR/en e tutorial |
| [F7-00c-glb-padrao.md](F7-00c-glb-padrao.md) | F7-00c / NEW-12 | DONE (7d6f712) | |
| [F7-00d-lacaio-blender.md](F7-00d-lacaio-blender.md) | F7-00d | DONE (`peon.glb` via `tools/blender/build_peon.py`; refinado na NEW-32) | a linha "ADIADA" da spec é antiga; arte liberada em 2026-10-09 |
| [F8-06-campanha-horda.md](F8-06-campanha-horda.md) | F8-06 | TODO (briefing) | a Horda do novo mundo é `war-horde` (M4) |
| [MUNDO-BRIEFING-DONO.md](MUNDO-BRIEFING-DONO.md) | novo mundo | fonte | briefing original do dono |
| [MUNDO-HISTORIA-CAMPANHA.md](MUNDO-HISTORIA-CAMPANHA.md) | MUNDO-3/4/6/9/10 | PARCIAL | história, seletor e dados das 24 missões feitos; falta polir (M3/M4) |
| [MUNDO-HEROIS.md](MUNDO-HEROIS.md) | MUNDO-2 | PARCIAL | dados dos 6 heróis feitos; só o Brann tem modelo 3D |
| [MUNDO-TERRENO-MAPAS.md](MUNDO-TERRENO-MAPAS.md) | MUNDO-1/5/7, ART-01…16 | PARCIAL | costa, render por bioma e 6 mapas feitos; ART-05…16 e navais pendentes |
| [NEW-6-orm-texturas.md](NEW-6-orm-texturas.md) | NEW-6 | TODO | passo 2 exige decisão do dono |
| [NEW-10-ataque-para-frente.md](NEW-10-ataque-para-frente.md) | NEW-10 | DONE (944b6ee) | |
| [NEW-14-cpu-animacao.md](NEW-14-cpu-animacao.md) | NEW-14 | TODO (spec pronta) | |
| [NEW-17-pintura-terreno.md](NEW-17-pintura-terreno.md) | NEW-17 | DONE (297a07e) | |
| [NEW-18-card-vazio.md](NEW-18-card-vazio.md) | NEW-18 | DONE (640dff1) | |
| [NEW-19-ruinas.md](NEW-19-ruinas.md) | NEW-19 | REVIEW (mesclada) | verificada em 2026-10-11 |
| [NEW-20-teste-intermitente.md](NEW-20-teste-intermitente.md) | NEW-20 | ADIADA pelo dono | |

Tarefas antigas sem spec própria (F5, F6, F7-02…09, F8-01…05, F9, F10, NEW-*): ver o índice em [../TASKS.md](../TASKS.md).
