# Soak test IA×IA (F10-02)

- Partidas: 25 · terminaram: 24 (96%) · ticks médios até o fim: 17090 · com falha: 1
- Limite: 72000 ticks · seeds 76..100 · determinismo re-checado em 3 seeds (0 divergentes)
- Tempo real: 474 s

## Por mapa
| chave | partidas | terminaram | ticks médios (terminadas) | com falha |
|---|---|---|---|---|
| continental-1v1 | 9 | 8 (89%) | 20114 | 1 |
| estreito-1v1 | 8 | 8 (100%) | 20165 | 0 |
| ilhas-4p | 8 | 8 (100%) | 10991 | 0 |

## Por facção do slot 0
| chave | partidas | terminaram | ticks médios (terminadas) | com falha |
|---|---|---|---|---|
| human | 13 | 12 (92%) | 17821 | 1 |
| orc | 12 | 12 (100%) | 16359 | 0 |

## Por dificuldade
| chave | partidas | terminaram | ticks médios (terminadas) | com falha |
|---|---|---|---|---|
| easy | 7 | 7 (100%) | 21914 | 0 |
| normal | 6 | 6 (100%) | 10479 | 0 |
| hard | 6 | 6 (100%) | 20717 | 0 |
| brutal | 6 | 5 (83%) | 13917 | 1 |

## Falhas (reproduzir com o comando)

- **no-end** seed 82 (continental-1v1/human/brutal) tick 72000: não terminou em 72000 ticks
  - `node tools/soak.mjs --count 1 --recheck 0 --seed-start 82 --maps continental-1v1 --faction human --difficulty brutal --out /tmp/soak-repro`
