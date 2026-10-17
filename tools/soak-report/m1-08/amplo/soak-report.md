# Soak test IA×IA (F10-02) — 100 partidas consolidadas

- Partidas: 100 (seeds 1..100, 4 lotes) · terminaram: 97 (97%) · com falha: 4
- Ticks até o fim (terminadas): média 18924, máx 48641 · partidas >40000 ticks: 2 · determinismo: 12 re-checadas, 0 divergentes · tempo real 3355 s

## Por mapa
| chave | partidas | terminaram | ticks médios | ticks máx | com falha |
|---|---|---|---|---|---|
| continental-1v1 | 8 | 8 (100%) | 13531 | 22219 | 0 |
| ilhas-4p | 8 | 7 (88%) | 18026 | 30499 | 1 |
| estreito-1v1 | 8 | 8 (100%) | 18888 | 30245 | 0 |
| campos-1v1 | 8 | 8 (100%) | 28852 | 38552 | 0 |
| desfiladeiro-1v1 | 8 | 8 (100%) | 28099 | 48641 | 1 |
| vales-2v2 | 8 | 8 (100%) | 13564 | 24665 | 0 |
| bosques-2v2 | 8 | 8 (100%) | 17749 | 26912 | 0 |
| planalto-ffa-4p | 8 | 8 (100%) | 14452 | 24434 | 0 |
| arquipelago-naval-4p | 8 | 8 (100%) | 15903 | 23827 | 0 |
| duelo-continental-1 | 8 | 8 (100%) | 15629 | 20483 | 0 |
| duelo-continental-2 | 4 | 4 (100%) | 19273 | 27312 | 0 |
| duelo-continental-3 | 4 | 4 (100%) | 23808 | 33144 | 0 |
| ilha-unica-1 | 4 | 4 (100%) | 25358 | 35219 | 0 |
| ilha-unica-2 | 4 | 3 (75%) | 17909 | 25675 | 1 |
| ilha-unica-3 | 4 | 3 (75%) | 16200 | 32557 | 1 |

## Por facção do slot 0
| chave | partidas | terminaram | ticks médios | ticks máx | com falha |
|---|---|---|---|---|---|
| human | 60 | 58 (97%) | 19737 | 48641 | 2 |
| orc | 40 | 39 (98%) | 17714 | 43837 | 2 |

## Por dificuldade
| chave | partidas | terminaram | ticks médios | ticks máx | com falha |
|---|---|---|---|---|---|
| easy | 28 | 27 (96%) | 16923 | 30499 | 1 |
| normal | 24 | 24 (100%) | 24940 | 43837 | 1 |
| hard | 24 | 23 (96%) | 19702 | 48641 | 1 |
| brutal | 24 | 23 (96%) | 14216 | 32557 | 1 |

## Falhas (reproduzir com o comando)

- **no-end** seed 14 (ilha-unica-2/human/hard) tick 72000: não terminou em 72000 ticks
  - `node tools/soak.mjs --count 1 --recheck 0 --seed-start 14 --maps ilha-unica-2 --faction human --difficulty hard --out /tmp/soak-repro`
- **stall** seed 45 (desfiladeiro-1v1/orc/normal) tick 31840: sem progresso desde o tick 29440
  - `node tools/soak.mjs --count 1 --recheck 0 --seed-start 45 --maps desfiladeiro-1v1 --faction orc --difficulty normal --out /tmp/soak-repro`
- **stall** seed 65 (ilha-unica-3/human/brutal) tick 46900: sem progresso desde o tick 44500
  - `node tools/soak.mjs --count 1 --recheck 0 --seed-start 65 --maps ilha-unica-3 --faction human --difficulty brutal --out /tmp/soak-repro`
- **no-end** seed 65 (ilha-unica-3/human/brutal) tick 72000: não terminou em 72000 ticks
  - `node tools/soak.mjs --count 1 --recheck 0 --seed-start 65 --maps ilha-unica-3 --faction human --difficulty brutal --out /tmp/soak-repro`
- **no-end** seed 92 (ilhas-4p/orc/easy) tick 72000: não terminou em 72000 ticks
  - `node tools/soak.mjs --count 1 --recheck 0 --seed-start 92 --maps ilhas-4p --faction orc --difficulty easy --out /tmp/soak-repro`

## Partidas longas (>40000 ticks, terminadas)

- seed 45 (desfiladeiro-1v1/orc/normal): 43837 ticks (com falha)
- seed 80 (desfiladeiro-1v1/human/hard): 48641 ticks
