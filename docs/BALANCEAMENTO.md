# Balanceamento base (F3-11)

Simulação IA×IA headless em lote (`tools/balance-sim.mjs`), mapa `continental-1v1`, limite de 20 min simulados, partidas ímpares com facções trocadas de slot. Neutros (jogador 99) são ignorados nas estatísticas. Relatórios em `tools/balance-report/` (`.md` + `.json` compacto).

## Como repetir

```bash
node --import ./tools/lib/register-json-loader.mjs tools/balance-sim.mjs --games 200 --map continental-1v1 --minutes 20 --tag final
node tools/balance-audit.mjs    # DPS/PV/custo/eficiência e paridade humano × orc
node tools/combat-table.mjs     # tabela de combate (F3-03)
```

Custo: ~14 s por partida (o lote de 200 leva ~48 min, acima do orçamento de 15 min da spec; as iterações usaram 60–100 partidas, ~15–27 min). Sequencial, ~230 MB de RAM.

## Auditoria de dados (antes → depois)

Eficiência = DPS (contra armadura 4) × PV / custo (ouro+madeira+pedra).

| par | antes (orc vs humano) | depois |
|---|---|---|
| Cavaleiro × Grunt | +12,8% | -1,0% |
| Arqueiro × Lançador | +17,2% | +14,8% |
| Patrulheiro × Enfurecido | +17,3% | +14,1% |
| Aldeão × Peão (trabalhadores, não são combate) | +42,7% | +42,7% |

A meta de paridade ≤ ±10% **não** foi atingida nos atiradores: ao aproximar a eficiência nominal a 5–9%, o humano passou a vencer 60–63% (o alcance 14,0 × 13,5 do arqueiro pesa mais que a eficiência nominal). O ponto de 50% em jogo fica com o orc ~+15% nominal.

## Iterações

| it | mudança | vitória humano / orc (% das decididas) | empates | partidas |
|---|---|---|---|---|
| 0 | baseline | 0% / 100% (IA humana nunca constrói Quartel) | 0% | 40 |
| 1 | `farm.popGranted` 0 → 5 (o GDD D5 já previa +5; a IA humana só constrói "fazenda" se der pop, então nunca cumpria o requisito `farm` do Quartel) | 41 / 59 | 17% | 100 |
| 2 | Cavaleiro PV 190→200, perfurante 6→7; Arqueiro PV 95→102; Grunt PV 205→198; Lançador PV 100→96; Patrulheiro 105→112; Enfurecido 110→105 | 60,4 / 39,6 | 20% | 60 |
| 3 | Arqueiro 102→99; Lançador 96→97; Patrulheiro 112→108; Enfurecido 105→103 | 62,7 / 37,3 | 17% | 100 |
| 4 | Arqueiro 99→97; Lançador 97→100; Patrulheiro 108→106; Enfurecido 103→108 | 47,6 / 52,4 | 18% | 100 |
| 5 | Centro: PV 1600→1400 (nível 2/3: 1900/2400), armadura 20→17 (tentativa de reduzir empates) | 48,2 / 51,8 | 17% | 100 |
| — | it5 **revertida** (não mudou empates) → estado final = it4 | | | |
| final | estado it4, seeds 1..200 | **51,7 / 48,3** (89 × 83) | **14%** (28) | 200 |

Vitórias por slot no final: NE 51,7% / SW 48,3%. Duração: média 12,3 min, mediana 11,9, p90 20 (limite).

Valores finais alterados (cumulativo ≤ ±30% do original): Cavaleiro PV 200, perfurante 7; Arqueiro PV 97; Grunt PV 198; Patrulheiro PV 106; Enfurecido PV 108; `farm.popGranted` 5. Lançador de Machado voltou a 100.

Testes que fixavam números antigos e foram ajustados: `combat.test.js` (Cavaleiro dano básico+perfurante 26→27), `research.test.js` (Patrulheiro PV 105→106).

## Achados e limitações

- Metas do lote final: cada facção entre 45–55% das decididas e empates ≤ 15% — **atingidas** (ruído estatístico ~±3,5 pontos com 172 decididas).
- **A IA ainda não usa** Centro nível 2/3 nem pesquisas (`0%` em todas as partidas): o balanceamento mede só Nível 1 (aldeões + Cavaleiro/Grunt + Arqueiro/Lançador). Ogro, Patrulheiro/Enfurecido, melhorias e o nível 2/3 do Centro ficam **sem medição**; repetir o lote quando a F5 (IA "Difícil" / uso de tecnologia) chegar. Sugestão de backlog: `NEW-<n>` — IA usar upgrade de Centro, Forja e `ranged_class`, e depois rebalancear.
- A IA quase só treina atiradores (~49 arqueiros × ~7 cavaleiros por partida): melee é subrepresentado; empates (~14%) vêm de impasses de atiradores, não de PV do Centro.
- `tools/check-data-parity.mjs` já estava quebrado antes da F3-11 (`blockerGrid` indefinido em `findNearestDropoff` no mock); não foi corrigido (fora de escopo).
- As tabelas de dano de `docs/08_GAME_DESIGN.md` §5–§7 já divergem de `src/data/` (são aspiracionais); `docs/02_MECANICAS.md` foi sincronizado para Cavaleiro/Arqueiro/Grunt/Fazenda.
