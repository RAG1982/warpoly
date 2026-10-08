# Soak test IA×IA (F10-02) — 100 partidas consolidadas

- Partidas: 100 (seeds 1..100, 4 lotes) · terminaram: 96 (96%) · com falha: 7
- Ticks até o fim (terminadas): média 16007, máx 60618 · partidas >40000 ticks: 8 · determinismo: 12 re-checadas, 0 divergentes · tempo real 1482 s

## Por mapa
| chave | partidas | terminaram | ticks médios | ticks máx | com falha |
|---|---|---|---|---|---|
| continental-1v1 | 36 | 34 (94%) | 16979 | 60618 | 2 |
| estreito-1v1 | 32 | 30 (94%) | 22647 | 60570 | 5 |
| ilhas-4p | 32 | 32 (100%) | 8749 | 24374 | 0 |

## Por facção do slot 0
| chave | partidas | terminaram | ticks médios | ticks máx | com falha |
|---|---|---|---|---|---|
| human | 52 | 51 (98%) | 14712 | 60618 | 2 |
| orc | 48 | 45 (94%) | 17474 | 60570 | 5 |

## Por dificuldade
| chave | partidas | terminaram | ticks médios | ticks máx | com falha |
|---|---|---|---|---|---|
| easy | 28 | 28 (100%) | 20248 | 60618 | 0 |
| normal | 24 | 24 (100%) | 10688 | 48235 | 0 |
| hard | 24 | 22 (92%) | 17216 | 60570 | 3 |
| brutal | 24 | 22 (92%) | 15202 | 54615 | 4 |

## Falhas (reproduzir com o comando)

- **stall** seed 5 (estreito-1v1/orc/hard) tick 45620: sem progresso desde o tick 43220
  - `node tools/soak.mjs --count 1 --recheck 0 --seed-start 5 --maps estreito-1v1 --faction orc --difficulty hard --out /tmp/soak-repro`
- **no-end** seed 16 (continental-1v1/orc/brutal) tick 72000: não terminou em 72000 ticks
  - `node tools/soak.mjs --count 1 --recheck 0 --seed-start 16 --maps continental-1v1 --faction orc --difficulty brutal --out /tmp/soak-repro`
- **stall** seed 23 (estreito-1v1/orc/brutal) tick 29940: sem progresso desde o tick 27540
  - `node tools/soak.mjs --count 1 --recheck 0 --seed-start 23 --maps estreito-1v1 --faction orc --difficulty brutal --out /tmp/soak-repro`
- **stall** seed 64 (estreito-1v1/human/hard) tick 39280: sem progresso desde o tick 36880
  - `node tools/soak.mjs --count 1 --recheck 0 --seed-start 64 --maps estreito-1v1 --faction human --difficulty hard --out /tmp/soak-repro`
- **no-end** seed 64 (estreito-1v1/human/hard) tick 72000: não terminou em 72000 ticks
  - `node tools/soak.mjs --count 1 --recheck 0 --seed-start 64 --maps estreito-1v1 --faction human --difficulty hard --out /tmp/soak-repro`
- **no-end** seed 72 (continental-1v1/orc/hard) tick 72000: não terminou em 72000 ticks
  - `node tools/soak.mjs --count 1 --recheck 0 --seed-start 72 --maps continental-1v1 --faction orc --difficulty hard --out /tmp/soak-repro`
- **no-end** seed 73 (estreito-1v1/orc/brutal) tick 72000: não terminou em 72000 ticks
  - `node tools/soak.mjs --count 1 --recheck 0 --seed-start 73 --maps estreito-1v1 --faction orc --difficulty brutal --out /tmp/soak-repro`
- **stall** seed 83 (estreito-1v1/human/brutal) tick 28640: sem progresso desde o tick 26240
  - `node tools/soak.mjs --count 1 --recheck 0 --seed-start 83 --maps estreito-1v1 --faction human --difficulty brutal --out /tmp/soak-repro`

## Partidas longas (>40000 ticks, terminadas)

- seed 5 (estreito-1v1/orc/hard): 60570 ticks (com falha)
- seed 23 (estreito-1v1/orc/brutal): 42506 ticks (com falha)
- seed 26 (continental-1v1/human/easy): 60618 ticks
- seed 39 (estreito-1v1/human/hard): 44266 ticks
- seed 45 (estreito-1v1/human/normal): 48235 ticks
- seed 67 (estreito-1v1/orc/easy): 42459 ticks
- seed 83 (estreito-1v1/human/brutal): 54615 ticks (com falha)
- seed 91 (continental-1v1/orc/brutal): 49998 ticks
