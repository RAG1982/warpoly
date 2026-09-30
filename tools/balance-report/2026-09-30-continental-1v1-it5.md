# Balanceamento — continental-1v1 (it5)

- commit: `041d503` | partidas: 100 | limite: 20 min simulados | seeds 1..100
- comando: `node --import tools/lib/register-json-loader.mjs tools/balance-sim.mjs --games 100 --map continental-1v1 --minutes 20 --tag it5`

## Vitórias

| facção | vitórias | % decididas | % total |
|---|---|---|---|
| human | 40 | 48.2 | 40 |
| orc | 43 | 51.8 | 43 |

Empates: 17 (17%). Vitórias por slot 0 (NE) / 1 (SW): 50.6% / 49.4% (das decididas).
Duração (min simulados): média 12.87, mediana 12.23, p90 20.

## human

- Centro nível 2: 0% das partidas, média 0 min; nível 3: 0%, média 0 min
- Recursos coletados (média/partida): {"gold":3203.7,"wood":1590.06,"stone":123.76}
- Treinadas (média): {"villager":11.77,"archer":51.99,"knight":6.96}
- Perdidas (média): {"archer":46.46,"knight":8.1,"villager":8.62}
- Pesquisas concluídas (média/partida): {}
- Exército (não-trabalhadores) aos 8 min: {"villager":7.65,"archer":4.78,"knight":0.58}
- Exército (não-trabalhadores) aos 12 min: {"villager":7.42,"knight":0.4,"archer":4.69}
- Exército (não-trabalhadores) aos 16 min: {"villager":7.55,"archer":4.87,"knight":0.16}

## orc

- Centro nível 2: 0% das partidas, média 0 min; nível 3: 0%, média 0 min
- Recursos coletados (média/partida): {"gold":3310.8,"wood":1629.81,"stone":109.04}
- Treinadas (média): {"peon":13.05,"axethrower":54.18,"grunt":7.02}
- Perdidas (média): {"axethrower":48.06,"peon":9.79,"grunt":8.22}
- Pesquisas concluídas (média/partida): {}
- Exército (não-trabalhadores) aos 8 min: {"peon":7.69,"axethrower":4.61,"grunt":0.57}
- Exército (não-trabalhadores) aos 12 min: {"peon":7.6,"grunt":0.44,"axethrower":5.38}
- Exército (não-trabalhadores) aos 16 min: {"peon":7.48,"axethrower":5.42,"grunt":0.23}
