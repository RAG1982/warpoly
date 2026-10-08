# Soak test IA×IA (F10-02)

- Partidas: 25 · terminaram: 25 (100%) · ticks médios até o fim: 15340 · com falha: 1
- Limite: 72000 ticks · seeds 76..100 · determinismo re-checado em 3 seeds (0 divergentes)
- Tempo real: 321 s

## Por mapa
| chave | partidas | terminaram | ticks médios (terminadas) | com falha |
|---|---|---|---|---|
| continental-1v1 | 9 | 9 (100%) | 16016 | 0 |
| estreito-1v1 | 8 | 8 (100%) | 18929 | 1 |
| ilhas-4p | 8 | 8 (100%) | 10991 | 0 |

## Por facção do slot 0
| chave | partidas | terminaram | ticks médios (terminadas) | com falha |
|---|---|---|---|---|
| human | 13 | 13 (100%) | 15225 | 1 |
| orc | 12 | 12 (100%) | 15465 | 0 |

## Por dificuldade
| chave | partidas | terminaram | ticks médios (terminadas) | com falha |
|---|---|---|---|---|
| easy | 7 | 7 (100%) | 15823 | 0 |
| normal | 6 | 6 (100%) | 7896 | 0 |
| hard | 6 | 6 (100%) | 13052 | 0 |
| brutal | 6 | 6 (100%) | 24509 | 1 |

## Falhas (reproduzir com o comando)

- **stall** seed 83 (estreito-1v1/human/brutal) tick 28640: sem progresso desde o tick 26240
  - `node tools/soak.mjs --count 1 --recheck 0 --seed-start 83 --maps estreito-1v1 --faction human --difficulty brutal --out /tmp/soak-repro`
