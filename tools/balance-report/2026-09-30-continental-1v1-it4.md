# Balanceamento — continental-1v1 (it4)

- commit: `1e4d368` | partidas: 100 | limite: 20 min simulados | seeds 1..100
- comando: `node --import tools/lib/register-json-loader.mjs tools/balance-sim.mjs --games 100 --map continental-1v1 --minutes 20 --tag it4`

## Vitórias

| facção | vitórias | % decididas | % total |
|---|---|---|---|
| human | 39 | 47.6 | 39 |
| orc | 43 | 52.4 | 43 |

Empates: 18 (18%). Vitórias por slot 0 (NE) / 1 (SW): 50% / 50% (das decididas).
Duração (min simulados): média 13, mediana 12.51, p90 20.

## human

- Centro nível 2: 0% das partidas, média 0 min; nível 3: 0%, média 0 min
- Recursos coletados (média/partida): {"gold":3210.5,"wood":1592.64,"stone":123.84}
- Treinadas (média): {"villager":11.81,"archer":52.04,"knight":6.97}
- Perdidas (média): {"archer":46.45,"knight":8.11,"villager":8.66}
- Pesquisas concluídas (média/partida): {}
- Exército (não-trabalhadores) aos 8 min: {"villager":7.65,"archer":4.91,"knight":0.65}
- Exército (não-trabalhadores) aos 12 min: {"villager":7.31,"knight":0.46,"archer":4.83}
- Exército (não-trabalhadores) aos 16 min: {"villager":7.31,"archer":4.84,"knight":0.19}

## orc

- Centro nível 2: 0% das partidas, média 0 min; nível 3: 0%, média 0 min
- Recursos coletados (média/partida): {"gold":3318.8,"wood":1633.35,"stone":109.2}
- Treinadas (média): {"peon":13.12,"axethrower":54.33,"grunt":7.04}
- Perdidas (média): {"axethrower":48.08,"peon":9.88,"grunt":8.22}
- Pesquisas concluídas (média/partida): {}
- Exército (não-trabalhadores) aos 8 min: {"peon":7.62,"axethrower":4.54,"grunt":0.56}
- Exército (não-trabalhadores) aos 12 min: {"peon":7.33,"grunt":0.43,"axethrower":5.19}
- Exército (não-trabalhadores) aos 16 min: {"peon":7.28,"axethrower":5.25,"grunt":0.22}
