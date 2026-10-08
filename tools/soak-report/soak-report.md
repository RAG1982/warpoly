# Soak test IA×IA (F10-02)

- Partidas: 20 · terminaram: 19 (95%) · ticks médios até o fim: 16905 · com falha: 2
- Limite: 72000 ticks · seeds 1..20 · determinismo re-checado em 2 seeds (0 divergentes)
- Tempo real: 343 s

## Por mapa
| chave | partidas | terminaram | ticks médios (terminadas) | com falha |
|---|---|---|---|---|
| continental-1v1 | 7 | 6 (86%) | 17665 | 1 |
| estreito-1v1 | 7 | 7 (100%) | 13657 | 0 |
| ilhas-4p | 6 | 6 (100%) | 19935 | 1 |

## Por facção do slot 0
| chave | partidas | terminaram | ticks médios (terminadas) | com falha |
|---|---|---|---|---|
| human | 11 | 11 (100%) | 18591 | 1 |
| orc | 9 | 8 (89%) | 14588 | 1 |

## Por dificuldade
| chave | partidas | terminaram | ticks médios (terminadas) | com falha |
|---|---|---|---|---|
| easy | 6 | 5 (83%) | 14067 | 1 |
| normal | 6 | 6 (100%) | 9989 | 0 |
| hard | 4 | 4 (100%) | 19395 | 0 |
| brutal | 4 | 4 (100%) | 28340 | 1 |

## Falhas (reproduzir com o comando)

- **no-end** seed 10 (continental-1v1/orc/easy) tick 72000: não terminou em 72000 ticks
  - `node tools/headless-match.js --seed 10 --map continental-1v1 --difficulty easy`
- **stall** seed 15 (ilhas-4p/human/brutal) tick 52220: sem progresso desde o tick 49820
  - `node tools/headless-match.js --seed 15 --map ilhas-4p --difficulty brutal`
