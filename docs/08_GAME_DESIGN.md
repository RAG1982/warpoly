# 08 — Documento de Design de Jogo (F3-00) — v1 aprovada

> Status: **APROVADO pelo dono em 2026-09-29** (decisões D4–D7 em `07_DECISOES.md`). Tudo aqui vira dados em `src/data/` e tarefas F3/F4.
> Regras respeitadas: D1 (pedra permanece; **petróleo só após Centro da Cidade nível 2**), D2 (**nomes próprios**, nada de marcas da Blizzard), D3 (hardware). Mecânicas de referência: Warcraft II (ver `05_PARIDADE_WARCRAFT2.md`).

---

## 1. Premissa e facções

**Mundo:** as Terras de **Vaeloria**, um continente de vales e arquipélagos. Após a queda de uma antiga muralha de runas, os clãs das estepes de cinza cruzaram os passos das montanhas para as terras férteis do oeste.

| | Humanos | Orcs |
|---|---|---|
| Nome da facção | **Coroa de Aldária** | **Clãs de Gorthak** |
| Cor de identidade | azul e dourado | vermelho e ferro |
| Tom | ordem, fé, engenharia | fúria, xamanismo, força bruta |
| Líder (campanha) | Rainha Elyra Valcourt | Chefe Guerreiro Drogath Punho-de-Brasa |



---

## 2. Economia

| Recurso | Fonte | Entrega | Usos principais |
|---|---|---|---|
| **Ouro** | Mina (trabalhador **entra** ~1,5 s, 1 por vez, fila; mina esgota) | Centro da Cidade | tudo |
| **Madeira** | Florestas (bloqueiam passagem, abrem ao cortar) | Centro ou Serraria | construções, unidades à distância, navios |
| **Pedra** | Pedreira (como mina, mas 2 trabalhadores simultâneos) | Centro ou Canteiro | **níveis do Centro**, torres, muralhas, blindagem (armaduras), fortificação |
| **Petróleo** 🔒 | Plataforma sobre poço no mar — **liberado só no Centro nível 2** (D1) | Refinaria/Estaleiro | navios, upgrades navais, cerco nível 2 |
| **Suprimento** (população) | Casa/Toca (+5), Fazenda/Chiqueiro (+5), Centro (+5) | — | limite de exército (máx. 150) |

- Carga por viagem: 10 ouro · 10 madeira · 8 pedra · 100 petróleo (petroleiro).
- Bônus: Serraria nível 2 (+25% madeira); Centro nível 2/3 (+10%/+20% ouro); Canteiro (+20% pedra).
- **Decisão D5**: Casa/Toca **permanecem** (+5 suprimento, 50 madeira, nível 1); o **ouro passivo das fazendas foi removido** — ouro só vem de minas. Fazenda/Chiqueiro: +5 suprimento e desbloqueiam o Quartel (requisito), como no WC2.

### 2.1 Curva de economia (medida — F3-04)

Ouro/min por nº de trabalhadores minerando **a mesma mina** (1 vaga), medido headless com
`tools/eco-curve.mjs` (3 min simulados, ponto de entrega colado à mina para isolar o gargalo
do slot — sem tempo de viagem até a base):

| Trabalhadores na mina | Ouro/min |
|---|---|
| 1 | ~333 |
| 3 | ~387 |
| 5 | ~383 |
| 8 | ~383 |
| 12 | ~377 |

A mina satura a partir de ~3 trabalhadores: com 1 vaga e 1,5 s de entrada + carga de 10 ouro
por viagem, o throughput físico do gargalo já é atingido por 2-3 trabalhadores alternando —
os demais só esperam na fila (`Unit` estado `waitingMine`) sem aumentar a receita. Excedente
de mineiros de ouro deve ir para madeira/outra jazida (ver `AIEconomyManager`, que limita a
~5 mineiros por mina). Números de exemplo, não normativos — cada execução do script pode
variar ligeiramente com o RNG do mapa/IA vizinha.

---

## 3. Níveis do Centro da Cidade (tiers)

| Nível | Humanos | Orcs | Custo do upgrade | Libera |
|---|---|---|---|---|
| 1 | **Paço Real** | **Salão do Clã** | — | Fazenda, Quartel, Serraria, Ferraria, Torre de Vigia, Muralha; Trabalhador, Infantaria, Atirador |
| 2 | **Fortaleza** | **Bastião** | 1000 ouro · 400 madeira · 300 pedra · 60 s | Estábulo/Covil, Oficina, **Estaleiro + petróleo**, Canteiro, upgrades de torre, nível 2 de pesquisas, classe avançada do atirador |
| 3 | **Castelo de Aldária** | **Cidadela de Ferro** | 2000 ouro · 800 madeira · 600 pedra · 200 petróleo · 90 s | Templo/Altar, Torre Arcana/Santuário, Aviário/Ninho, cavalaria avançada, navios pesados |

Modelos: o Castelo atual (Blender) vira o **nível 3** humano; os níveis 1–2 precisam de modelos novos (F7). O Grande Salão atual vira o nível 2 orc.

> **Implementado (F3-06):** `src/data/tiers.js` (nomes, PV, custo/tempo do upgrade, multiplicador
> de ouro); `CMD.UPGRADE_HQ`/`CMD.CANCEL_UPGRADE_HQ` (`Building.startTierUpgrade`/
> `cancelTierUpgrade`, PV proporcional ao subir, fila de treino pausada durante o upgrade,
> evento `EVT.HQ_TIER_CHANGED`); requisitos generalizados (`src/sim/requirements.js`) aceitam
> `{hq:N}` além de tipo de construção, aplicados em `placeBuilding`/`queueUnit`/`startResearch`;
> IA evolui o Centro com Quartel+Forja concluídos e ≥8 trabalhadores. **Pendente:** modelo 3D por
> nível (F7 — `modelByTier` fica `null`), petróleo (`oil` só declarado, F4-07), pesquisas em
> níveis (F3-07), construções novas de nível 2/3 (F4).

---

## 4. Construções

| Função (WC2) | Humanos | Orcs | Custo (ouro/madeira/pedra) | PV | Nível |
|---|---|---|---|---|---|
| Centro | Paço Real / Fortaleza / Castelo | Salão do Clã / Bastião / Cidadela de Ferro | — | 1600 / 2200 / 2800 | 1/2/3 |
| Casa (+5 supr.) | Casa | Toca | 0 / 50 / 0 | 400 | 1 |
| Fazenda (+5 supr., requisito do Quartel) | Fazenda | Chiqueiro | 80 / 30 / 0 | 400 | 1 |
| Quartel | Quartel | Acampamento de Guerra | 160 / 60 / 40 | 900 | 1 |
| Serraria | Serraria | Serraria do Clã | 120 / 40 / 0 | 600 | 1 |
| Ferraria | Ferraria Real | Forja de Guerra | 160 / 50 / 60 | 800 | 1 |
| Torre | Torre de Vigia → **Torre de Guarda** (flechas) / **Torre de Canhão** | Torre de Vigia → **Torre de Lanças** / **Torre de Petardo** | 50/60/60 → +150/0/100 | 500→700 | 1 (upgr. 2) |
| Muralha (segmento) | Muralha de Pedra | Paliçada de Ferro | 0 / 10 / 20 | 250 | 1 |
| Canteiro (entrega de pedra) | Canteiro | Fosso de Pedra | 80 / 60 / 0 | 500 | 2 |
| Estábulo | Estábulo Real | Covil dos Ogros | 200 / 60 / 40 | 700 | 2 |
| Oficina | Oficina de Engenharia | Oficina dos Engenhoqueiros | 180 / 100 / 40 | 700 | 2 |
| Estaleiro | Estaleiro | Doca do Clã | 200 / 150 / 0 | 900 | 2 |
| Refinaria | Refinaria | Caldeirão de Óleo | 100 / 150 / 50 | 700 | 2 |
| Fundição (naval) | Fundição | Fornalha Naval | 180 / 100 / 60 | 800 | 2 |
| Plataforma de petróleo | Plataforma | Plataforma | 180 / 60 / 0 (petroleiro constrói) | 500 | 2 |
| Templo (paladino/cura) | Templo da Luz | Altar das Tempestades | 250 / 100 / 80 | 900 | 3 |
| Torre de magia | Torre Arcana | Santuário das Cinzas | 250 / 80 / 80 | 800 | 3 |
| Aéreo | Aviário de Grifos | Ninho das Serpes | 300 / 150 / 60 | 900 | 3 |

> **Implementado (F3-08):** Muralha de Pedra / Paliçada de Ferro (`wall_human`/`wall_orc`, PV 250, armadura 10, 10 madeira + 20 pedra por segmento, nível 1): colocação por arrasto (`PLACE_WALL`, `WALL_STEP` 2,4), bloqueio de caminho, destruíveis, ataque de unidades/IA à muralha que fecha o caminho. Sem portão nem conexões visuais (v2 = NEW-24). Ver `docs/02_MECANICAS.md` (Muralhas).

---

## 5. Unidades

Formato: PV · dano (básico + perfurante) · armadura · alcance · visão · velocidade · custo (ouro/madeira/pedra/petróleo) · tempo · suprimento. Valores **iniciais**, na escala atual do jogo (unidades de mundo), a balancear com simulações headless (F3-11).

### 5.1 Terrestres
| Papel | Humanos | Orcs | PV | Dano | Arm | Alc | Vel | Custo | Tempo | Nível | Onde |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Trabalhador | **Camponês** | **Lacaio** | 85 | 3+2 | 0 | 1,8 | 4,5 | 60/0/0 | 7 | 1 | Centro |
| Infantaria | **Espadachim** | **Talhador** | 190 | 6+3 | 4 | 2,1 | 4,5 | 70/20/5 | 10 | 1 | Quartel |
| Atirador | **Arqueiro** → **Patrulheiro** | **Lanceiro-Machado** → **Enfurecido** | 95 | 3+6 | 0 | 14 | 4,5 | 60/40/0 | 9 | 1 (→2) | Quartel |
| Cavalaria ✅ F4-01 (Templário/Ogro Feiticeiro: F4-04/F4-08) | **Cavaleiro** → **Templário** | **Ogro** → **Ogro Feiticeiro** | 320 | 8+4 | 4 | 2,3 | 5,6 | 120/60/20 | 14 | 2 (→3) | Quartel + Estábulo/Covil |
| Cerco ✅ F4-02 | **Balista** | **Catapulta** | 220 | 80+0 (área r1,5) | 0 | 20 (mín. 4) | 3,0 | 90/200/40 | 18 | 2 | Quartel + Oficina |
| Sapadores | **Sapadores de Pólvora** | **Incendiários** | 60 | 400 (suicida, área) | 0 | 1 | 5,0 | 70/25/0 | 10 | 2 | Oficina |
| Conjurador | **Mago Arcano** | **Necromante das Cinzas** | 60 | 0+9 (mágico) | 0 | 8 | 4,2 | 120/0/0 | 12 | 3 | Torre Arcana / Santuário |

Upgrades de classe: Patrulheiro/Enfurecido (Serraria, nível 2): +alcance/+visão ou +regeneração; Templário/Ogro Feiticeiro (Templo/Altar, nível 3): ganha mana e magias.

### 5.2 Aéreas e navais
| Papel | Humanos | Orcs | Notas | Nível |
|---|---|---|---|---|
| Batedor aéreo | **Planador de Engenho** | **Balão de Guerra** | sem ataque; visão 30; detecta submersos | 2 (Oficina) |
| Ataque aéreo | **Cavaleiro Grifo** | **Serpe de Guerra** | PV 350, dano mágico em área curta; só atingível por atiradores/torres/navios | 3 (Aviário/Ninho) |
| Petroleiro | Petroleiro | Petroleiro | coleta petróleo, constrói plataforma | 2 |
| Destróier | **Fragata** | **Galé de Guerra** | anti-ar e anti-navio | 2 |
| Transporte | Barcaça | Barcaça | 6 unidades | 2 |
| Pesado | **Couraçado** | **Leviatã de Ferro** | longo alcance, destrói costa | 3 (+Fundição) |
| Submerso | **Submersível** | **Tartaruga Colossal** | invisível exceto a batedores aéreos | 3 |

### 5.3 Heróis (campanha **e** escaramuça — decisão D6)
Humanos: Rainha Elyra (Templária), Mestre Arcano Oren, Capitão Brann. Orcs: Drogath Punho-de-Brasa (Talhador), Vozgul a Profetisa (Necromante), Grok Quebra-Muros (Ogro Feiticeiro).

Regras na escaramuça:
- **1 herói vivo por jogador**, escolhido entre os 3 da facção, invocado no **Centro nível 2** (300 ouro · 100 madeira · 50 pedra · 5 suprimento · 45 s).
- Níveis 1–5 por experiência (abates próximos); cada nível +10% PV/dano e 1 ponto de habilidade.
- 3 habilidades por herói (2 ativas + 1 aura), desbloqueadas nos níveis 1, 3 e 5 (definição em `src/data/heroes.js`).
- Morte: pode ser **revivido** no Centro por 50% do custo e 30 s; perde nenhum nível.
- Opção da partida "Sem heróis" (clássico WC2) no setup de escaramuça.
- Campanha usa os mesmos heróis com níveis fixos por missão.

### 5.4 Neutros
Bandoleiros (modelos prontos: Bandido + Acampamento) guardam minas extras; critters decorativos (ovelhas, porcos, focas).
**Implementado (F3-10):** acampamentos de bandidos (4 guardas com leash de 22, jazida de ouro própria, recompensa de 300 de ouro ao destruir o acampamento) e critters (ovelha/porco) definidos por `neutrals` nos mapas; jogador neutro hostil (id 99) fora de vitória/HUD/IA. Focas e ataque da IA a acampamentos (NEW-25) ficam para depois.

---

## 6. Combate

- Fórmula (estilo WC2): `dano = max(0, básico − armadura) + perfurante`, multiplicado por aleatório **determinístico** (`gm.rng`) entre 0,5 e 1,0. Mínimo 1.
- Tipos de dano: **normal**, **perfurante** (ignora armadura, já é o componente perfurante), **cerco** (×1,5 contra construções, ×0,5 contra unidades), **mágico** (ignora armadura).
- Construções têm armadura (Centro 20, torres 20, muralhas 10, demais 15) — corrige B5.
- Projéteis de cerco são balísticos e **podem errar** alvo em movimento; flechas/machados seguem o alvo.
- Contras (resumo):
| Vence → | Infantaria | Atirador | Cavalaria | Cerco | Conjurador | Aéreo |
|---|---|---|---|---|---|---|
| Infantaria | = | ✔ (fecha distância) | ✘ | ✔ | ✔ | — |
| Atirador | ✘ | = | ✘ | ✔ | ✔ | ✔ |
| Cavalaria | ✔ | ✔ | = | ✔ | ✔ | — |
| Cerco | ✔ (grupos) | ✔ (grupos) | ✘ | = | — | — |
| Conjurador | ✔ (área) | ✔ (área) | ✔ (lentidão) | — | = | ✔ |

### 6.1 Tabela de simulação (medida — F3-03)

`computeDamage` (`src/sim/combat.js`) aplicado 1000 vezes por par, headless, com
`tools/combat-table.mjs` (sem navegador; seed 42; mesma fórmula do jogo, DAMAGE_SCALE 1,333 —
`src/data/combat.js`). "Golpes p/ matar" = HP do alvo ÷ dano médio (arredondado para cima, sem
regenerar HP entre golpes); "tempo p/ matar" = golpes × cooldown de ataque do atacante (duelo
1×1, atacante sempre em alcance):

| Par (atacante × alvo) | Dano médio | Mín | Máx | Golpes p/ matar | Tempo p/ matar |
|---|---|---|---|---|---|
| Cavaleiro × Grunt | 21,98 | 15 | 29 | 10 | 11,0 s |
| Arqueiro × Cavaleiro | 13,84 | 9 | 19 | 14 | 19,6 s |
| Grunt × Arqueiro | 27,91 | 19 | 37 | 4 | 4,6 s |
| Cavaleiro × Castelo | 6,08 | 4 | 8 | 264 | 290,4 s |
| Arqueiro × Castelo | 12,12 | 8 | 16 | 133 | 186,2 s |
| Torre de Vigia × Cavaleiro | 14,07 | 9 | 19 | 14 | 19,6 s |
| Balista/Catapulta × Castelo (F4-02; no centro da área) | 89,68 | 60 | 120 | 18 | 57,6 s |
| Balista/Catapulta × Cavaleiro (F4-02; alvo no centro da área) | 37,91 | 25 | 51 | 6 | 19,2 s |

Cavalaria (dano normal) perde bruto contra construções (armadura 20 sem componente perfurante
relevante); arqueiros/torres (perfurantes) sofrem menos com armadura alta — a mesma lógica do
contras acima. Números de exemplo (seed 42), não normativos — o balanceamento fino é a F3-11.

---

## 7. Pesquisas

> **Implementado (F3-07):** Armas, Escudos/Placas, Flechas/Machados, Ofício do lenhador, Classe avançada e as 6 pesquisas da classe avançada. Faltam Cerco, Templo/Altar, Fundição e Magias (F4).

| Onde | Pesquisa | Níveis | Efeito | Custo nível 1 / 2 |
|---|---|---|---|---|
| Ferraria/Forja | Armas | 2 | +2 dano básico infantaria/cavalaria (por nível) | 200/100/0 · 400/200/0 |
| Ferraria/Forja | Escudos/Placas | 2 | +2 armadura infantaria/cavalaria | 150/100/80 · 300/200/160 |
| Ferraria/Forja | Cerco | 2 | +15 dano balista/catapulta | 300/300/0 · 600/500/0 |
| Serraria | Flechas/Machados | 2 | +1 perfurante atiradores | 200/100/0 · 400/200/0 |
| Serraria | Classe avançada | 1 | Arqueiro→Patrulheiro / Lanceiro→Enfurecido | 800/0/0 (nível 2) |
| Serraria | Ofício do lenhador | 1 | +25% madeira | 300/150/0 |
| Serraria (Patrulheiro) | Arco longo / Visão aguçada / Pontaria | 1 cada | +alcance / +visão / +dano | 500–2500 ouro |
| Serraria (Enfurecido) | Arremesso longo / Regeneração / Fúria | 1 cada | +alcance / regenera PV / +dano | 500–2500 ouro |
| Templo/Altar | Ordenação (Templário) / Ritual (Ogro Feiticeiro) | 1 | upgrade de classe | 1000 ouro |
| Fundição | Canhões navais / Cascos | 2 | +dano / +armadura naval | com petróleo |
| Torre Arcana/Santuário, Templo/Altar | Magias | 1 cada | libera magia | ver §8 |

---

## 8. Magias (mana: máx. 255, regenera 1/s)

> **Framework pronto (F4-03):** mana, recarga, alvos, status, auto-cast, modo-alvo e VFX genérico existem orientados a dados (`src/data/abilities.js`). As magias da tabela abaixo entram na F4-04.

| Humanos | Mana | Efeito | Orcs | Mana | Efeito |
|---|---|---|---|---|---|
| **Templário:** Vista Sagrada | 70 | revela área distante | **Ogro Feiticeiro:** Olho Vigia | 70 | invoca olho voador batedor |
| Cura | 6/PV | cura aliado | Sede de Batalha | 50 | +dano e velocidade de ataque (20 s) |
| Exorcismo | 4/PV | dano em mortos-vivos | Runas Explosivas | 200 | minas mágicas no chão |
| **Mago:** Bola de Fogo | 25 | dano em linha | **Necromante:** Toque da Morte | 100 | dano e cura o necromante |
| Lentidão | 50 | reduz velocidade (30 s) | Pressa | 50 | acelera aliado (30 s) |
| Escudo de Chamas | 80 | dano a quem encosta | Erguer Mortos | 50 | esqueletos dos corpos |
| Invisibilidade | 200 | aliado invisível até atacar | Redemoinho | 100 | tornado errante |
| Transmutação | 200 | transforma inimigo em ovelha | Armadura Profana | 100 | invulnerável 6 s (−50% PV) |
| Nevasca | 25/onda | dano em área contínuo | Nuvem de Cinzas | 25/onda | dano em área contínuo |

---

## 9. Condições de vitória e modos
- Padrão (WC2): **destruir todas as construções** do inimigo. Opcional: Regicídio (Centro), Tempo (maior pontuação em N min).
- **Implementado (F3-09)**: Destruir tudo (padrão) e Regicídio, com estatísticas da partida (`MatchStats`); Tempo continua pendente. Ver `docs/02_MECANICAS.md`.
- Escaramuça 1×1 a 8 jogadores (times), campanha (2 × 8+ missões), multiplayer lockstep.

---

## 10. Mapeamento para o código (para as specs F3/F4)
- Dados: novos campos em `src/data/units.js`/`buildings.js`: `tier`, `requires: [ids]`, `damage: {basic, piercing, type}`, `mana`, `abilities: []`, `layer: 'ground'|'air'|'naval'`, `supply`, `upgradesTo`.
- Pesquisas em `src/data/upgrades.js` com `levels[]`.
- Magias em `src/data/abilities.js` (novo).
- Glossário de nomes em `src/data/names.js` (PT-BR; base do i18n F6-09).
- Ordem de implementação sugerida: F3-04 economia (mina com entrada, florestas, remover casa/ouro passivo) → F3-03 combate → F3-06 níveis + requisitos → F3-07 pesquisas → F3-08 muralhas → F3-05 reparo → F4-01 cavalaria → F4-02 cerco → F4-03/F4-04 magias → F4-06 aéreo → F4-07 naval+petróleo.

---

## Decisões do dono (2026-09-29)
- D4: facções **Coroa de Aldária** (humanos) e **Clãs de Gorthak** (orcs).
- D5: Casa/Toca mantidas; ouro passivo das fazendas removido.
- D6: heróis na campanha **e** na escaramuça (1 por jogador, opção "Sem heróis").
- D7: nomes de unidades e construções deste documento aprovados.

### F3-05 (implementado)
Reparo custa 50% do custo original para 100% de PV; cancelar obra reembolsa 75%; máx. 4 trabalhadores por construção. Ver `docs/02_MECANICAS.md`.
