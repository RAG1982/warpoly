# Soak test IA×IA (F10-02) — 100 partidas consolidadas

- Partidas: 100 (seeds 1..100, 4 lotes) · terminaram: 99 (99%) · com falha: 1
- Ticks até o fim (terminadas): média 14889, máx 54169 · partidas >40000 ticks: 2 · determinismo: 12 re-checadas, 0 divergentes · tempo real 1549 s

## Por mapa
| chave | partidas | terminaram | ticks médios | ticks máx | com falha |
|---|---|---|---|---|---|
| continental-1v1 | 36 | 35 (97%) | 15468 | 41422 | 1 |
| estreito-1v1 | 32 | 32 (100%) | 20397 | 54169 | 0 |
| ilhas-4p | 32 | 32 (100%) | 8749 | 24374 | 0 |

## Por facção do slot 0
| chave | partidas | terminaram | ticks médios | ticks máx | com falha |
|---|---|---|---|---|---|
| human | 52 | 51 (98%) | 15457 | 54169 | 1 |
| orc | 48 | 48 (100%) | 14286 | 32867 | 0 |

## Por dificuldade
| chave | partidas | terminaram | ticks médios | ticks máx | com falha |
|---|---|---|---|---|---|
| easy | 28 | 28 (100%) | 19586 | 41422 | 0 |
| normal | 24 | 24 (100%) | 10095 | 29660 | 0 |
| hard | 24 | 24 (100%) | 17751 | 54169 | 0 |
| brutal | 24 | 23 (96%) | 11187 | 27573 | 1 |

## Falhas (reproduzir com o comando)

- **no-end** seed 82 (continental-1v1/human/brutal) tick 72000: não terminou em 72000 ticks
  - `node tools/soak.mjs --count 1 --recheck 0 --seed-start 82 --maps continental-1v1 --faction human --difficulty brutal --out /tmp/soak-repro`

## Partidas longas (>40000 ticks, terminadas)

- seed 1 (continental-1v1/human/easy): 41422 ticks
- seed 14 (estreito-1v1/human/hard): 54169 ticks
