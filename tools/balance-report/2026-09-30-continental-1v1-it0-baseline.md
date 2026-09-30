# Balanceamento — continental-1v1 (it0-baseline)

- commit: `42df484` | partidas: 40 | limite: 20 min simulados | seeds 1..40
- comando: `node --import tools/lib/register-json-loader.mjs tools/balance-sim.mjs --games 40 --map continental-1v1 --minutes 20 --tag it0-baseline`

## Vitórias

| facção | vitórias | % decididas | % total |
|---|---|---|---|
| human | 0 | 0 | 0 |
| orc | 40 | 100 | 100 |

Empates: 0 (0%). Vitórias por slot 0 (NE) / 1 (SW): 50% / 50% (das decididas).
Duração (min simulados): média 4.48, mediana 4.23, p90 5.21.

## human

- Centro nível 2: 0% das partidas, média 0 min; nível 3: 0%, média 0 min
- Recursos coletados (média/partida): {"gold":636.25,"wood":464.93,"stone":0}
- Treinadas (média): {"villager":13.4}
- Perdidas (média): {"villager":15.18,"archer":1,"knight":2}
- Pesquisas concluídas (média/partida): {"ranged_ammo#1":0.15,"woodcutting#1":0.03}
- Exército (não-trabalhadores) aos 8 min: {}
- Exército (não-trabalhadores) aos 12 min: {}
- Exército (não-trabalhadores) aos 16 min: {}

## orc

- Centro nível 2: 0% das partidas, média 0 min; nível 3: 0%, média 0 min
- Recursos coletados (média/partida): {"gold":1218.75,"wood":753.9,"stone":71.2}
- Treinadas (média): {"peon":6.4,"axethrower":17.02,"grunt":3.02}
- Perdidas (média): {"axethrower":2.1,"grunt":1.07,"peon":0.42}
- Pesquisas concluídas (média/partida): {}
- Exército (não-trabalhadores) aos 8 min: {}
- Exército (não-trabalhadores) aos 12 min: {}
- Exército (não-trabalhadores) aos 16 min: {}
