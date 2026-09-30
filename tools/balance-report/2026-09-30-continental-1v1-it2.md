# Balanceamento — continental-1v1 (it2)

- commit: `a260008` | partidas: 60 | limite: 20 min simulados | seeds 1..60
- comando: `node --import tools/lib/register-json-loader.mjs tools/balance-sim.mjs --games 60 --map continental-1v1 --minutes 20 --tag it2`

## Vitórias

| facção | vitórias | % decididas | % total |
|---|---|---|---|
| human | 29 | 60.4 | 48.3 |
| orc | 19 | 39.6 | 31.7 |

Empates: 12 (20%). Vitórias por slot 0 (NE) / 1 (SW): 54.2% / 45.8% (das decididas).
Duração (min simulados): média 12.49, mediana 11.22, p90 20.

## human

- Centro nível 2: 0% das partidas, média 0 min; nível 3: 0%, média 0 min
- Recursos coletados (média/partida): {"gold":3082.33,"wood":1557.55,"stone":126.8}
- Treinadas (média): {"villager":12.17,"archer":48.92,"knight":7.1}
- Perdidas (média): {"archer":42.2,"knight":8.13,"villager":8.65}
- Pesquisas concluídas (média/partida): {"ranged_ammo#1":0.02}
- Exército (não-trabalhadores) aos 8 min: {"villager":7.57,"knight":0.85,"archer":5.17}
- Exército (não-trabalhadores) aos 12 min: {"villager":7.54,"archer":5,"knight":0.23}
- Exército (não-trabalhadores) aos 16 min: {"villager":7.32,"archer":5.53,"knight":0.26}

## orc

- Centro nível 2: 0% das partidas, média 0 min; nível 3: 0%, média 0 min
- Recursos coletados (média/partida): {"gold":3152.33,"wood":1545.5,"stone":108}
- Treinadas (média): {"peon":13.9,"axethrower":50.07,"grunt":7.2}
- Perdidas (média): {"axethrower":45.2,"peon":11.22,"grunt":8.38}
- Pesquisas concluídas (média/partida): {}
- Exército (não-trabalhadores) aos 8 min: {"peon":7.06,"axethrower":4.26,"grunt":0.72}
- Exército (não-trabalhadores) aos 12 min: {"peon":7.23,"axethrower":5.23,"grunt":0.5}
- Exército (não-trabalhadores) aos 16 min: {"peon":7.05,"axethrower":4.95,"grunt":0.32}
