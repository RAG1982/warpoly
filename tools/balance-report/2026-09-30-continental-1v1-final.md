# Balanceamento — continental-1v1 (final)

- commit: `3b92aee` | partidas: 200 | limite: 20 min simulados | seeds 1..200
- comando: `node --import tools/lib/register-json-loader.mjs tools/balance-sim.mjs --games 200 --map continental-1v1 --minutes 20 --tag final`

## Vitórias

| facção | vitórias | % decididas | % total |
|---|---|---|---|
| human | 89 | 51.7 | 44.5 |
| orc | 83 | 48.3 | 41.5 |

Empates: 28 (14%). Vitórias por slot 0 (NE) / 1 (SW): 51.7% / 48.3% (das decididas).
Duração (min simulados): média 12.33, mediana 11.93, p90 20.

## human

- Centro nível 2: 0% das partidas, média 0 min; nível 3: 0%, média 0 min
- Recursos coletados (média/partida): {"gold":3032,"wood":1515.54,"stone":122.48}
- Treinadas (média): {"villager":11.74,"archer":48.88,"knight":6.67}
- Perdidas (média): {"archer":42.62,"knight":7.62,"villager":8.55}
- Pesquisas concluídas (média/partida): {}
- Exército (não-trabalhadores) aos 8 min: {"villager":7.64,"archer":5.08,"knight":0.7}
- Exército (não-trabalhadores) aos 12 min: {"villager":7.27,"knight":0.53,"archer":5.05}
- Exército (não-trabalhadores) aos 16 min: {"villager":7.15,"archer":5.81,"knight":0.27}

## orc

- Centro nível 2: 0% das partidas, média 0 min; nível 3: 0%, média 0 min
- Recursos coletados (média/partida): {"gold":3129.45,"wood":1534.08,"stone":105.88}
- Treinadas (média): {"peon":12.98,"axethrower":50.66,"grunt":6.67}
- Perdidas (média): {"axethrower":44.84,"peon":9.96,"grunt":7.85}
- Pesquisas concluídas (média/partida): {}
- Exército (não-trabalhadores) aos 8 min: {"peon":7.53,"axethrower":4.58,"grunt":0.62}
- Exército (não-trabalhadores) aos 12 min: {"peon":7.3,"grunt":0.43,"axethrower":5.23}
- Exército (não-trabalhadores) aos 16 min: {"peon":7.02,"axethrower":4.81,"grunt":0.27}
