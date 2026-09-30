# Índice das especificações (status em 2026-09-30)

Cada spec tem na 3ª linha `> **Status: ...**`. Regras comuns a todas: [`_COMUM.md`](_COMUM.md). Fluxo e regras de modelos: [`../SESSION_HANDOFF.md`](../SESSION_HANDOFF.md).

## ⏳ A FAZER
| Spec | Onde rodar | Executor | Observação |
|---|---|---|---|
| [F3-08-muralhas.md](F3-08-muralhas.md) | local | sonnet | Muralhas em arrasto (porta 5203). Próxima. |
| [F3-05-reparo-cancelamento.md](F3-05-reparo-cancelamento.md) | local | sonnet | Reparo/cancelar obra (5204), após F3-08 |
| [F3-09-vitoria-estatisticas.md](F3-09-vitoria-estatisticas.md) | local | sonnet | Modos de vitória + MatchStats (5205) |
| [F3-10-neutros-critters.md](F3-10-neutros-critters.md) | local | sonnet | Bandoleiros/critters (5206), após F3-09 |
| [F4-01-cavalaria.md](F4-01-cavalaria.md) | local | sonnet | Cavalaria + nomes D7 (5207) |
| [F4-02-cerco.md](F4-02-cerco.md) | local | sonnet | Cerco + Oficina + projétil balístico (5208), após F4-01 |
| [F4-03-mana-habilidades.md](F4-03-mana-habilidades.md) | local | sonnet | Framework de mana/habilidades (5209), após F4-02 |
| [F4-04-conjuradores-magias.md](F4-04-conjuradores-magias.md) | local | sonnet | Mago/Necromante + mecânicas (5210), após F4-03 |
| [F4-04b-templo-magias-restantes.md](F4-04b-templo-magias-restantes.md) | local | sonnet | Templo/Altar, Templário/Ogro Feiticeiro (5211) |
| [F4-05-sapadores.md](F4-05-sapadores.md) | local | sonnet | Sapadores (5212), após F4-02 |
| [F4-06-aereo.md](F4-06-aereo.md) | local | sonnet | Camada aérea (5213) |
| [F4-07a-petroleo-estaleiro.md](F4-07a-petroleo-estaleiro.md) | local | sonnet | Petróleo, Estaleiro, naval (5214) |
| [F4-07b-navios-de-guerra.md](F4-07b-navios-de-guerra.md) | local | sonnet | Navios, transporte, Fundição (5215) |
| [F4-08-herois.md](F4-08-herois.md) | local | sonnet | Heróis D6 (5216) — **porta 5216 também usada pela arte; ajuste se rodarem juntas** |
| [F3-11-balanceamento-base.md](F3-11-balanceamento-base.md) | local (Node, sem navegador) | sonnet | Lote IA×IA, só depois de F3-05/07/08/09/10 |
| [F3-01-controles-rts.md](F3-01-controles-rts.md) | nuvem (item 4) | sonnet | Controles RTS + NEW-16 |
| [F6-08-opcoes.md](F6-08-opcoes.md) | nuvem (item 5) | sonnet | Depois da F3-01 |
| [NEW-19-ruinas.md](NEW-19-ruinas.md) | nuvem (item 6) | sonnet | Ruínas/clareiras, só render |

## ⏸ ADIADA
| Spec | Motivo |
|---|---|
| [F7-00d-lacaio-blender.md](F7-00d-lacaio-blender.md) | Modelagem 3D por **Sonnet 5.5**, e só depois do código pronto |
| [NEW-20-teste-intermitente.md](NEW-20-teste-intermitente.md) | Adiada pelo dono (executor sem permissão para `npx vitest`) |

## ✅ PRONTAS (mescladas no master)
| Spec | Commit |
|---|---|
| [F3-07-pesquisas-niveis.md](F3-07-pesquisas-niveis.md) | 15f7969 |
| [F0-08-anti-swiftshader.md](F0-08-anti-swiftshader.md) | d17aaf5 |
| [F1-03-unidades-por-osso.md](F1-03-unidades-por-osso.md) | 3fd7fc2 (parcial → F1-03b) |
| [F1-03b-unidades-skinned.md](F1-03b-unidades-skinned.md) | 38c013b (meta 50 FPS → NEW-15) |
| [F1-05-nevoa-shader.md](F1-05-nevoa-shader.md) | e33d40e |
| [F1-06-grade-espacial.md](F1-06-grade-espacial.md) | bf87e23 (parcial → NEW-14/F1-09) |
| [F1-07-pathfinder.md](F1-07-pathfinder.md) | PR #2 (nuvem) |
| [F1-08-alocacoes-vazamentos.md](F1-08-alocacoes-vazamentos.md) | 70fea77 |
| [F1-09-tick-fixo-lod-animacao.md](F1-09-tick-fixo-lod-animacao.md) | 5dca95c |
| [F2-02-sistema-comandos.md](F2-02-sistema-comandos.md) | b5ca827 |
| [F2-03-determinismo.md](F2-03-determinismo.md) | 32b5fa9 |
| [F2-05-mapas-dados.md](F2-05-mapas-dados.md) | 110c125 |
| [F2-07-event-bus.md](F2-07-event-bus.md) | 13fc992 |
| [F3-03-combate.md](F3-03-combate.md) | 2b345d6 |
| [F3-04-economia.md](F3-04-economia.md) | 5b8a72e |
| [F3-06-niveis-centro.md](F3-06-niveis-centro.md) | 369cc38 |
| [F6-03-hud-responsiva.md](F6-03-hud-responsiva.md) | PR #3 (nuvem) |
| [F7-00c-glb-padrao.md](F7-00c-glb-padrao.md) | 7d6f712 |
| [BUGS-01-pequenos.md](BUGS-01-pequenos.md) | PR #1 (nuvem) |
| [NEW-10-ataque-para-frente.md](NEW-10-ataque-para-frente.md) | 944b6ee |
| [NEW-17-pintura-terreno.md](NEW-17-pintura-terreno.md) | 297a07e |
| [NEW-18-card-vazio.md](NEW-18-card-vazio.md) | 640dff1 |

## Sem spec ainda (candidatas, ver `../TASKS.md`)
F3-05 reparo · F3-08 muralhas · F3-09 vitória/estatísticas · F3-10 neutros · F3-11 balanceamento · F4-* (cavalaria, cerco, magias, sapadores, aéreo, naval/petróleo, heróis) · F5-* IA · F6-02/F6-04..F6-07/F6-09 · F8-* conteúdo · F9-* multiplayer · F10-* release · pequenas: NEW-21 (rota em floresta fechada), NEW-22/NEW-3 (textos em inglês), NEW-6 (ORM), NEW-15 (FPS combate).
