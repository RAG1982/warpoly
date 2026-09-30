# Balanceamento — continental-1v1 (it1)

- commit: `2260ede` | partidas: 100 | limite: 20 min simulados | seeds 1..100
- comando: `node --import tools/lib/register-json-loader.mjs tools/balance-sim.mjs --games 100 --map continental-1v1 --minutes 20 --tag it1`

## Vitórias

| facção | vitórias | % decididas | % total |
|---|---|---|---|
| human | 34 | 41 | 34 |
| orc | 49 | 59 | 49 |

Empates: 17 (17%). Vitórias por slot 0 (NE) / 1 (SW): 48.2% / 51.8% (das decididas).
Duração (min simulados): média 12.5, mediana 11.33, p90 20.

## human

- Centro nível 2: 0% das partidas, média 0 min; nível 3: 0%, média 0 min
- Recursos coletados (média/partida): {"gold":3130.6,"wood":1528.74,"stone":122.08}
- Treinadas (média): {"villager":12.55,"archer":50.74,"knight":6.42}
- Perdidas (média): {"archer":45.44,"knight":7.91,"villager":9.87}
- Pesquisas concluídas (média/partida): {}
- Exército (não-trabalhadores) aos 8 min: {"villager":7.59,"archer":4.95,"knight":0.62}
- Exército (não-trabalhadores) aos 12 min: {"villager":7.49,"archer":4.17,"knight":0.32}
- Exército (não-trabalhadores) aos 16 min: {"villager":7.42,"archer":5.27,"knight":0.12}

## orc

- Centro nível 2: 0% das partidas, média 0 min; nível 3: 0%, média 0 min
- Recursos coletados (média/partida): {"gold":3224.6,"wood":1599.24,"stone":107.76}
- Treinadas (média): {"peon":13.69,"axethrower":52.64,"grunt":6.87}
- Perdidas (média): {"axethrower":45.94,"peon":10.01,"grunt":7.87}
- Pesquisas concluídas (média/partida): {}
- Exército (não-trabalhadores) aos 8 min: {"peon":7.61,"axethrower":4.72,"grunt":0.73}
- Exército (não-trabalhadores) aos 12 min: {"peon":7.45,"axethrower":6.19,"grunt":0.51}
- Exército (não-trabalhadores) aos 16 min: {"peon":7.36,"axethrower":5.79,"grunt":0.42}
