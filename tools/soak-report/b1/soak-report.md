# Soak test IA×IA (F10-02)

- Partidas: 25 · terminaram: 24 (96%) · ticks médios até o fim: 16208 · com falha: 3
- Limite: 72000 ticks · seeds 1..25 · determinismo re-checado em 3 seeds (0 divergentes)
- Tempo real: 404 s

## Por mapa
| chave | partidas | terminaram | ticks médios (terminadas) | com falha |
|---|---|---|---|---|
| continental-1v1 | 9 | 8 (89%) | 17369 | 1 |
| estreito-1v1 | 8 | 8 (100%) | 23615 | 2 |
| ilhas-4p | 8 | 8 (100%) | 7640 | 0 |

## Por facção do slot 0
| chave | partidas | terminaram | ticks médios (terminadas) | com falha |
|---|---|---|---|---|
| human | 13 | 13 (100%) | 11572 | 0 |
| orc | 12 | 11 (92%) | 21687 | 3 |

## Por dificuldade
| chave | partidas | terminaram | ticks médios (terminadas) | com falha |
|---|---|---|---|---|
| easy | 7 | 7 (100%) | 18627 | 0 |
| normal | 6 | 6 (100%) | 9801 | 0 |
| hard | 6 | 6 (100%) | 20390 | 1 |
| brutal | 6 | 5 (83%) | 15492 | 2 |

## Falhas (reproduzir com o comando)

- **stall** seed 5 (estreito-1v1/orc/hard) tick 45620: sem progresso desde o tick 43220
  - `node tools/soak.mjs --count 1 --recheck 0 --seed-start 5 --maps estreito-1v1 --faction orc --difficulty hard --out /tmp/soak-repro`
- **no-end** seed 16 (continental-1v1/orc/brutal) tick 72000: não terminou em 72000 ticks
  - `node tools/soak.mjs --count 1 --recheck 0 --seed-start 16 --maps continental-1v1 --faction orc --difficulty brutal --out /tmp/soak-repro`
- **stall** seed 23 (estreito-1v1/orc/brutal) tick 29940: sem progresso desde o tick 27540
  - `node tools/soak.mjs --count 1 --recheck 0 --seed-start 23 --maps estreito-1v1 --faction orc --difficulty brutal --out /tmp/soak-repro`
