# Soak test IA×IA (F10-02)

- Partidas: 24 · terminaram: 23 (96%) · ticks médios até o fim: 14256 · com falha: 1
- Limite: 72000 ticks · seeds 1..24 · determinismo re-checado em 3 seeds (0 divergentes)
- Tempo real: 358 s

## Por mapa
| chave | partidas | terminaram | ticks médios (terminadas) | com falha |
|---|---|---|---|---|
| camp-01-baia-de-aurelan | 8 | 8 (100%) | 12180 | 0 |
| camp-02-pouso-do-encontro | 8 | 7 (88%) | 16406 | 1 |
| camp-03-pedra-mae | 8 | 8 (100%) | 14450 | 0 |

## Por facção do slot 0
| chave | partidas | terminaram | ticks médios (terminadas) | com falha |
|---|---|---|---|---|
| human | 12 | 11 (92%) | 14470 | 1 |
| orc | 12 | 12 (100%) | 14060 | 0 |

## Por dificuldade
| chave | partidas | terminaram | ticks médios (terminadas) | com falha |
|---|---|---|---|---|
| easy | 6 | 6 (100%) | 18445 | 0 |
| normal | 6 | 6 (100%) | 12586 | 0 |
| hard | 6 | 6 (100%) | 13955 | 0 |
| brutal | 6 | 5 (83%) | 11593 | 1 |

## Falhas (reproduzir com o comando)

- **stall** seed 8 (camp-02-pouso-do-encontro/human/brutal) tick 31860: sem progresso desde o tick 29460
  - `node tools/soak.mjs --count 1 --recheck 0 --seed-start 8 --maps camp-02-pouso-do-encontro --faction human --difficulty brutal --out /tmp/soak-repro`
- **no-end** seed 8 (camp-02-pouso-do-encontro/human/brutal) tick 72000: não terminou em 72000 ticks
  - `node tools/soak.mjs --count 1 --recheck 0 --seed-start 8 --maps camp-02-pouso-do-encontro --faction human --difficulty brutal --out /tmp/soak-repro`
