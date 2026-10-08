# Soak test IA×IA (F10-02)

- Partidas: 25 · terminaram: 22 (88%) · ticks médios até o fim: 14780 · com falha: 3
- Limite: 72000 ticks · seeds 51..75 · determinismo re-checado em 3 seeds (0 divergentes)
- Tempo real: 368 s

## Por mapa
| chave | partidas | terminaram | ticks médios (terminadas) | com falha |
|---|---|---|---|---|
| continental-1v1 | 9 | 8 (89%) | 14222 | 1 |
| estreito-1v1 | 8 | 6 (75%) | 25667 | 2 |
| ilhas-4p | 8 | 8 (100%) | 7172 | 0 |

## Por facção do slot 0
| chave | partidas | terminaram | ticks médios (terminadas) | com falha |
|---|---|---|---|---|
| human | 13 | 12 (92%) | 11076 | 1 |
| orc | 12 | 10 (83%) | 19224 | 2 |

## Por dificuldade
| chave | partidas | terminaram | ticks médios (terminadas) | com falha |
|---|---|---|---|---|
| easy | 7 | 7 (100%) | 22002 | 0 |
| normal | 6 | 6 (100%) | 11055 | 0 |
| hard | 6 | 4 (67%) | 14498 | 2 |
| brutal | 6 | 5 (83%) | 9363 | 1 |

## Falhas (reproduzir com o comando)

- **stall** seed 64 (estreito-1v1/human/hard) tick 39280: sem progresso desde o tick 36880
  - `node tools/soak.mjs --count 1 --recheck 0 --seed-start 64 --maps estreito-1v1 --faction human --difficulty hard --out /tmp/soak-repro`
- **no-end** seed 64 (estreito-1v1/human/hard) tick 72000: não terminou em 72000 ticks
  - `node tools/soak.mjs --count 1 --recheck 0 --seed-start 64 --maps estreito-1v1 --faction human --difficulty hard --out /tmp/soak-repro`
- **no-end** seed 72 (continental-1v1/orc/hard) tick 72000: não terminou em 72000 ticks
  - `node tools/soak.mjs --count 1 --recheck 0 --seed-start 72 --maps continental-1v1 --faction orc --difficulty hard --out /tmp/soak-repro`
- **no-end** seed 73 (estreito-1v1/orc/brutal) tick 72000: não terminou em 72000 ticks
  - `node tools/soak.mjs --count 1 --recheck 0 --seed-start 73 --maps estreito-1v1 --faction orc --difficulty brutal --out /tmp/soak-repro`
