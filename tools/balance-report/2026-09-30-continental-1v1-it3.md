# Balanceamento — continental-1v1 (it3)

- commit: `fd69500` | partidas: 100 | limite: 20 min simulados | seeds 1..100
- comando: `node --import tools/lib/register-json-loader.mjs tools/balance-sim.mjs --games 100 --map continental-1v1 --minutes 20 --tag it3`

## Vitórias

| facção | vitórias | % decididas | % total |
|---|---|---|---|
| human | 52 | 62.7 | 52 |
| orc | 31 | 37.3 | 31 |

Empates: 17 (17%). Vitórias por slot 0 (NE) / 1 (SW): 51.8% / 48.2% (das decididas).
Duração (min simulados): média 12.23, mediana 11.33, p90 20.

## human

- Centro nível 2: 0% das partidas, média 0 min; nível 3: 0%, média 0 min
- Recursos coletados (média/partida): {"gold":3123.7,"wood":1585.23,"stone":123.68}
- Treinadas (média): {"villager":11.49,"archer":50.75,"knight":7.04}
- Perdidas (média): {"archer":43.34,"knight":7.83,"villager":7.64}
- Pesquisas concluídas (média/partida): {}
- Exército (não-trabalhadores) aos 8 min: {"villager":7.74,"knight":0.96,"archer":5.37}
- Exército (não-trabalhadores) aos 12 min: {"villager":7.64,"knight":0.58,"archer":6.4}
- Exército (não-trabalhadores) aos 16 min: {"villager":7.88,"archer":6.5,"knight":0.35}

## orc

- Centro nível 2: 0% das partidas, média 0 min; nível 3: 0%, média 0 min
- Recursos coletados (média/partida): {"gold":3109.7,"wood":1521.6,"stone":107.52}
- Treinadas (média): {"peon":13.47,"axethrower":49.69,"grunt":6.92}
- Perdidas (média): {"axethrower":45.19,"peon":11.24,"grunt":8.27}
- Pesquisas concluídas (média/partida): {}
- Exército (não-trabalhadores) aos 8 min: {"peon":7.46,"axethrower":4.11,"grunt":0.74}
- Exército (não-trabalhadores) aos 12 min: {"peon":7.07,"axethrower":4.33,"grunt":0.33}
- Exército (não-trabalhadores) aos 16 min: {"peon":7.04,"axethrower":4.23,"grunt":0.31}
