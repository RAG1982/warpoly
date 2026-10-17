# MUNDO-HEROIS · Os seis heróis da Guerra do Mar Fendido (Capitão, Mago e Comandante por facção)

> **Status: SPEC (proposta revisada com as decisões do dono de 2026-10-11; não iniciada)**. Escrita por Sonnet 5.5. **Só documento: nenhum código, nenhum JSON.** Complementa [`MUNDO-HISTORIA-CAMPANHA.md`](MUNDO-HISTORIA-CAMPANHA.md) (mundo, 12 missões por facção, `unlocks`) e [`MUNDO-BRIEFING-DONO.md`](MUNDO-BRIEFING-DONO.md).
> Leia antes: `CLAUDE.md`, `docs/historico/HANDOFF_CLOUD.md` (§2), `docs/specs/_COMUM.md`, `docs/specs/F4-08-herois.md`, `src/data/heroes.js`, `src/data/units.js` (`hero_*`), `src/data/abilities.js` (`hero_*`; cabeçalho = catálogo de efeitos) e `docs/08_GAME_DESIGN.md` §5.3b.
> Executores: agentes **sonnet** na nuvem para dados/habilidades/i18n/retratos provisórios (§7); **modelo 3D, retrato final e voz são locais** (modelagem: Sonnet 5.5 no Blender local, nunca Haiku; o dono gera as imagens de referência antes).

---

## 0. Resumo (leitura de 1 minuto)

**Decisão do dono (2026-10-11):** em vez de 15 personagens novos, **3 heróis por facção (6 no total): um Capitão, um Mago e um Comandante**. Eles se tornam jogáveis conforme a história os traz. Os demais nomes da história (Sevelin, Orsolo, Lyra, Mervane, Ulma, Hurgan, Brakka, Grok…) viram **NPCs de diálogo**: aparecem em cutscenes e falas, e quando precisam estar em campo usam **unidades comuns** (`knight`, `gryphon_rider`, `ogre`…), sem entrada nova em `units.js`.

| Facção | Capitão | Mago | Comandante |
|---|---|---|---|
| Liga de Aurelan (humanos, Velmara, oeste) | **Capitão Brann** (`hero_brann`, existe) | **Mestre Arcano Oren** (`hero_oren`, existe) | **Marechal Dorian Vasques** (`hero_dorian`, **novo**) |
| Clãs do Cinzal (orcs, Cinzara, leste) | **Drogath Punho-de-Brasa** (`hero_drogath`, existe) | **Vozgul, a Profetisa** (`hero_vozgul`, **novo**) | **Skarn, chefe-de-brasa** (`hero_skarn`, **novo**) |

- **Mapeamento (§1)**: mantêm-se os 3 ids existentes (Brann, Oren, Drogath); só **3 tipos novos** (Dorian, Vozgul, Skarn). Grok Quebra-Muros (do GDD e da versão anterior) deixa de ser herói: vira o NPC "mestre de cerco" (um `ogre_mage`/`catapult` nomeado em diálogo). Fica o GDD §5.3 (Vozgul e Grok como heróis orcs) corrigido para Vozgul e Skarn (§7).
- **Entrada na campanha** (igual nas duas facções, ver §2): **Capitão na missão 3** (primeiro herói; ensina o Grito de Guerra e as habilidades de herói) → **Mago na missão 10** → **Comandante na missão 11** → **missão 12: os três juntos** (a "reunião"). Antes de entrar, cada herói é **citado** em briefings e diálogos e **aparece como NPC/chefe inimigo** na campanha oposta (§2).
- **Habilidades**: 3 por herói, 18 no total. **4 já existem** (`hero_war_cry`, `hero_arcane_bolt`, `hero_mend` e o Grito reaproveitado para Drogath) e **14 são entradas novas** em `abilities.js`, todas montadas com **efeitos que já existem** (`damage`, `heal`, `status`, `channel`, `raise_dead`). **A única extensão de código** é um modificador no efeito `status`: aplicar em **área aos aliados** (`radius` + `allies:true`), usado por Dorian (2) e Skarn (1). Opcional: o efeito `dash` (Carga do Marechal) fica fora do MVP.
- **Nuvem**: dados (`units.js`, `abilities.js`), a extensão de status em área em `src/sim/abilities.js`, i18n pt-BR/en, testes e **retratos provisórios** (SVG gerado por código). **Local**: modelos 3D, retratos finais, voz, VFX e jogar para equilibrar (§7).

---

## 1. Mapeamento com os heróis que já existem

| Papel | Humanos | Orcs | O que muda nos dados |
|---|---|---|---|
| Capitão | `hero_brann` (existe) | `hero_drogath` (existe) | **mantêm id, `modelOf`, `scaleMul`, stats**; ganham 2 habilidades (de 1 para 3) e mais mana |
| Mago | `hero_oren` (existe) | `hero_vozgul` (**novo**) | Oren: ganha 1 habilidade (de 2 para 3); Vozgul: entrada nova |
| Comandante | `hero_dorian` (**novo**) | `hero_skarn` (**novo**) | entradas novas |

### 1.1 Lista exata do que muda (para o passo de dados, §7)
**`src/data/units.js`** (única fonte de stats; `heroes.js` deriva sozinho de `unique: true`, então `HEROES`/`HERO_TYPES` passam de 3 para **6** itens sem mexer em `heroes.js`):
1. `hero_brann.abilities`: `['hero_war_cry']` → `['hero_war_cry', 'hero_shield_bash', 'hero_revide_stance']`; `maxMana: 120 → 150`, `startMana: 120 → 150`, `manaRegen: 1 → 1.2`; `description` atualizada.
2. `hero_drogath.abilities`: `['hero_war_cry']` → `['hero_war_cry', 'hero_ember_strike', 'hero_clan_fire']`; `maxMana`/`startMana: 120 → 150`, `manaRegen: 1 → 1.2`; `description` atualizada.
3. `hero_oren.abilities`: `['hero_arcane_bolt', 'hero_mend']` → `['hero_arcane_bolt', 'hero_mend', 'hero_arcane_storm']`; resto igual (255 de mana já comporta a canalização).
4. **Novos**: `hero_dorian`, `hero_vozgul`, `hero_skarn` (fichas em §3–§6; stats sugeridos nas tabelas), no estilo de `hero_brann`: `unique: true`, `isHero: true`, `cost: null`, `trainTime: null`, `modelOf` (modelo provisório), `scaleMul`, `icon` provisório.
5. Comentário-cabeçalho de `heroes.js`: "Habilidades: ativas simples … (`hero_*`)" continua válido; só atualizar a contagem se citada.

**`src/data/abilities.js`**: 14 entradas novas (todas `requires: []`, como exige `tests/unit/heroes.test.js`): `hero_shield_bash`, `hero_revide_stance`, `hero_arcane_storm`, `hero_ember_strike`, `hero_clan_fire`, `hero_soul_drain`, `hero_ancestors`, `hero_ash_veil`, `hero_banner`, `hero_shield_line`, `hero_marshal_charge`, `hero_horde_roar`, `hero_ash_pact`, `hero_crown_hammer`. E o texto do cabeçalho do catálogo documentando `radius`/`allies` no efeito `status`.

**`src/sim/abilities.js`** (extensão, ver §8-A1): `status` com `radius` e `allies:true`.

**`src/i18n/pt-BR.json` e `en.json`**: `unit.hero_dorian|hero_vozgul|hero_skarn.name|desc` e `ability.<14 ids>.name|desc`; atualizar `unit.hero_brann.desc`, `unit.hero_drogath.desc`, `unit.hero_oren.desc`.

**Não mudam**: ids e stats de Brann, Oren, Drogath; `modelOf`; as 3 habilidades existentes; `heroes.js` (código); as regras de unicidade/morte/imunidade a Transmutação. As campanhas **beta** (`alliance` com 8 missões) usam `hero_brann`/`hero_oren`/`hero_drogath`: só ganham habilidades, o que é compatível (os `spawn` ignoram `abilities`).

### 1.2 Regra de morte e derrota
Como hoje: morto = fora da partida (não volta na mesma missão), e a missão pode declarar derrota se o **herói âncora** morrer (convenção: o herói que a missão apresenta). Em cada campanha o herói **volta na missão seguinte** (não há morte permanente de herói jogável; as mortes narrativas são de NPCs, §2). Chefes inimigos usam os mesmos tipos (`hero_*`) criados para a IA; como a regra é "1 por partida", cada tipo aparece uma vez por missão.

---

## 2. Quando cada herói entra (e como aparece na campanha oposta)

**Regra**: tutorial progressivo nas missões 1–6; a partir da 7 tudo liberado, **sem "personagem novo por missão"**. Os heróis entram assim, nas duas campanhas (a lista `unlocks.heroes` de cada missão acompanha, ver `MUNDO-HISTORIA-CAMPANHA.md` §4):

| Missão | Liga de Aurelan libera | Clãs do Cinzal libera | Justificativa |
|---|---|---|---|
| 3 | **Capitão Brann** | **Drogath** | primeiro combate sério + muralha/cerco; o jogador aprende o que é um herói (Grito de Guerra, mana, unicidade) com o mais simples (corpo a corpo) |
| 10 | **Oren** (Mago) | **Vozgul** (Mago) | o mago é o herói que exige a árvore completa e a logística da colônia; entra no desembarque, depois de ser apresentado como mentor/ameaça (m5, m8) |
| 11 | **Dorian** (Comandante) | **Skarn** (Comandante) | o comandante chega **com a segunda onda por mar**; antes disso é só voz e ameaça. O jogador o comanda só quando já precisa de liderança em área |
| 12 | (nenhum novo) | (nenhum novo) | **reunião**: Capitão + Mago + Comandante em campo juntos, para a fortaleza e o bloqueio |

Ordem escolhida: **Capitão → Mago → Comandante** (simples e direto → utilitário e sustentação → liderança em área). Alternativa em aberto: Comandante já na m12 (pergunta §9-1).

### 2.1 Presença do herói na campanha do outro lado (espelho)
Cada herói é **inimigo (chefe ou capitão de patrulha)** na campanha oposta, nas missões abaixo (a IA usa o mesmo `unitType`, só que sob a bandeira inimiga; precisa de `spawn` com `owner: <inimigo>` e `autoVictory` ajustado):

| Herói inimigo | Aparece como inimigo em | Papel |
|---|---|---|
| Brann | Clãs do Cinzal **m3** (capitão da guarnição de Pedra-Mãe; chefe do assalto) e **m6** (comandante do forte de Brumar) | muro humano |
| Oren | Clãs do Cinzal **m5** (mago do Bosque) e **m8** (defende a Fornalha com o esquadrão de Lyra) | feiticeiro aliado |
| Dorian | Clãs do Cinzal **m9** (contra-ofensiva de Miragem, junto de Cavaleiros e Balistas, sem grifos) e **m12** (chefe final) | marechal |
| Drogath | Liga de Aurelan **m2** (capitão da patrulha do Chama-Baixa, cutscene) e **m6** (forte dos Lanças Quebradas, chefe) | capitão de guerra |
| Vozgul | Liga de Aurelan **m5** (Necromantes do Salão do Bosque, voz em diálogo) e **m8** (chefe do Santuário das Cinzas) | profetisa |
| Skarn | Liga de Aurelan **m1** (voz), **m9** (contra-ofensiva de Miragem, comandada por Grok no campo; Skarn em cutscene) e **m12** (chefe final) | chefe-de-brasa |

(As datas de `MUNDO-HISTORIA-CAMPANHA.md` §3.6/§3.7 foram ajustadas para este espelho. Grok comanda a contra-ofensiva dos Clãs do Cinzal em m9 da Liga de Aurelan como `ogre_mage` nomeado; Lyra comanda o esquadrão de grifos nas m8/m9/m11 dos Clãs do Cinzal como `gryphon_rider` nomeado.)

---

## 3. Capitão Brann (humano, `hero_brann`)

**Papel**: tanque corpo a corpo, o "capitão da guarnição": segura a linha e inspira a infantaria. É o herói que o jogador conhece primeiro.
**Personalidade/história**: soldado de carreira de Aurelan, 48 anos, voz seca e humor curto, conhece o nome de cada recruta. Foi capitão do forte de Pedra-Mãe antes de o governador **Mervane** chegar, e desconfia do ouro que sai da mina sem passar pelo registro. Fiel a quem manda, mas não às ordens que desperdiçam soldados. Frase: "Ninguém dorme antes da sentinela render."
**Arco por missão (Liga de Aurelan, jogável)**
| m | Brann |
|---|---|
| 1–2 | citado: a Rainha lhe escreve do forte; na cutscene da m2 abre o portão para os náufragos |
| **3** | **jogável**: segura o Paço de Pedra-Mãe 7 min contra o Presa-Negra; vê Mervane tratar a guarnição como custo |
| 4–6 | acompanha a frota em terra; na m6 (Geada) lidera o forte de apoio; objetivo oculto de conduta sobre a vida dos recrutas |
| 7 | **descobre o ferro de contrabando** de Mervane; a traição o pega com o braço no escudo, jura "nunca mais confiar numa carta selada" |
| 8–9 | segura a linha enquanto Oren/Orsolo libertam os magos; na m9 comanda o Forte Atalaia |
| 10–12 | lidera o desembarque; na m12, âncora do muro (derrota se ele cair, opcional) |
**Nos Clãs do Cinzal (inimigo)**: m3 e m6 (ver §2.1).
**Aparência (ficha para o modelador)**: ver §3.1.
**Atributos base** (existentes; **sem mudança**): PV 520 · dano 34+12 normal · armadura 6 · velocidade 5,0 · alcance 2,2 · recarga 1,0 s · visão 18 · `modelOf: knight` · `scaleMul 1.2`. **Mana: 150 (+1,2/s)** (de 120 +1,0).
**Habilidades**
| # | id | Nome | Tecla | Alvo | Alcance | Mana | Recarga | Efeito | Novo? |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `hero_war_cry` | Grito de Guerra | Z | si | 0 | 50 | 5 s | `status bloodlust` 15 s no herói: dano +50%, ataque +50%, movimento +25% | **existe** |
| 2 | `hero_shield_bash` | Golpe de Escudo | X | inimigo | 3 | 30 | 8 s | `damage` 45 (`normal`, `radius: 2.5`) + `status slow` 5 s no alvo | entrada nova; efeitos existentes |
| 3 | `hero_revide_stance` | Postura de Revide | C | si | 0 | 45 | 25 s | `status flameshield` 20 s: quem o atacar corpo a corpo sofre 8 de dano mágico por golpe | entrada nova; efeito existente |
**Itens/evolução**: nenhum no MVP (ver §7.1).

### 3.1 Aparência
- **Silhueta**: o mais largo e baixo do trio humano; ombros em "T" por causa das ombreiras e do escudo grande; capacete com crista curta (sem cimeira exagerada). Postura firme, pés afastados, escudo no braço esquerdo (`ArmL`).
- **Armadura/roupa**: couraça de placas escovadas (aço fosco) sobre gibão de lã azul-escuro; manto curto de guarnição preso num ombro; luvas de couro; botas de marcha. Marcas de uso (amassados, remendos), **sem ornamento dourado exceto a gola**.
- **Armas**: espada longa reta de uma mão (**gume voltado para +Z**) e escudo redondo/de brasão (o brasão pode levar a cor do time).
- **Cores**: azul-real da Liga de Aurelan nos panos e no brasão (cor do time), aço neutro, couro marrom; dourado só na gola e na fivela.
- **Expressão**: rosto quadrado e curtido, barba curta grisalha, cicatriz na sobrancelha, olhar de quem conta cabeças. **Textura de rosto só na face frontal (+Z)**; laterais, topo e nuca lisos.
- **Proporção**: ≈ **1,2×** o Espadachim (`scaleMul 1.2`) e um pouco mais largo; mesma altura de olhos que a cavalaria desmontada.
- **Nós nomeados**: manter `Torso`, `ArmL`, `ArmR`, `Sword` (e `Shield` se existir no modelo do Espadachim) para o `UnitAnimator` e `ModelFactory.rebindUserData`.

---

## 4. Mestre Arcano Oren (humano, `hero_oren`)

**Papel**: mago de campo de alcance: dano em área, cura e controle de área. Frágil; exige proteção.
**Personalidade/história**: 29 anos, cartógrafo arcano, discípulo do **Mestre Orsolo** (NPC que desenha o primeiro mapa do Mar Fendido). Curioso, falante, sofre de ansiedade antes de cada combate e some em "cálculos" quando está nervoso, mas é calmo quando alguém depende dele. Carrega os cadernos de Orsolo.
**Arco por missão (Liga de Aurelan)**
| m | Oren |
|---|---|
| 1–4 | citado nas cartas de Orsolo; aparece em cutscene na m2 (mede a Torre da Fenda) |
| 5 | **cameo** (Cerne Verde): lidera 2 Magos de IA aliados que ajudam a queimar o Salão do Bosque; ensina a Bola de Fogo |
| 6–7 | em cutscenes: calcula a rota do comboio; na m7 percebe o desvio de mapas de Mervane |
| **8** | **perde o mentor**: Orsolo está entre os 6 magos presos em Fornalha e **morre libertando os outros** (morte narrativa de NPC). Oren herda os cadernos |
| 9 | na cutscene, redesenha a costa inimiga a partir dos cadernos |
| **10** | **jogável**: desenha o terreno do desembarque (a missão revela área); passa de "aprendiz" a "Mestre" |
| 11–12 | cura e Tempestade Arcana sustentam a colônia e o muro; na m12 fecha o estreito com a Tempestade |
**Nos Clãs do Cinzal (inimigo)**: m5, m8 (ver §2.1). **Aparência**: §4.1.
**Atributos base** (existentes; **sem mudança**): PV 260 · dano 0+34 mágico · armadura 2 · velocidade 4,6 · alcance 10 · recarga 1,6 s · visão 20 · `modelOf: mage` · `scaleMul 1.15` · mana 255 (+1,5/s).
**Habilidades**
| # | id | Nome | Tecla | Alvo | Alcance | Mana | Recarga | Efeito | Novo? |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `hero_arcane_bolt` | Raio Arcano | Z | inimigo | 14 | 40 | 3 s | `damage` 60 mágico, `radius 3` | **existe** |
| 2 | `hero_mend` | Restauro | X | aliado | 9 | 0 (3 de mana por PV) | 0 | `heal` 8 PV/s, auto-cast abaixo de 60% de PV, repete | **existe** |
| 3 | `hero_arcane_storm` | Tempestade Arcana | C | chão | 12 | 30 por onda | 10 s | `channel`: 6 ondas de 1 s, cada uma `damage` 16 mágico em `radius 4` (nova ordem interrompe) | entrada nova; efeito `channel` existente |
**Itens/evolução**: nenhum no MVP.

### 4.1 Aparência
- **Silhueta**: alto e esguio, com capuz pontudo caído e manto longo que afunila na barra; um cajado mais alto que ele com cristal na ponta. Triângulo de manto, pouco volume nos braços.
- **Roupa**: robe azul-petróleo com faixas pergaminho-claro; tira de couro atravessada com **três cadernos/rolos de mapas**; luvas sem dedos; sandálias de couro. Detalhes dourados finos (bordas e bússola no peito).
- **Arma**: cajado de madeira clara com cristal azul-gelo (emissivo leve); sem lâmina (não há gume).
- **Cores**: azul-petróleo (cor do time nos panos), bege, dourado-fosco; cristal ciano. Brilho no cristal ≤ 1 material emissivo.
- **Expressão**: rosto jovem e atento, óculos redondos de latão (opcional; se pesar, substituir por sobrancelhas marcadas), barba rala, cabelo preso. Textura de rosto só na face +Z.
- **Proporção**: ≈ **1,15×** o Mago (`scaleMul 1.15`); ombros estreitos; cajado ≈ 1,4× a altura do Mago comum.
- **Nós nomeados**: manter os do Mago comum (`Torso`, `ArmL`, `ArmR`, `Staff`).

---

## 5. Marechal Dorian Vasques (humano, `hero_dorian` — NOVO)

**Papel**: Comandante: lidera em área (aura de pressa/escudos), campeão montado. Mais veloz e mais caro em mana.
**Personalidade/história**: 56 anos, estrategista da Guarda Real, calmo, formal, nunca levanta a voz, mas todas as ordens saem em duas frases. É cunhado de **Mervane**: a traição do governador na m7 é uma ferida pessoal que o faz mais duro. Carrega o estandarte de Aurelan. Frase: "Um mapa não perdoa uma hesitação."
**Arco por missão (Liga de Aurelan)**
| m | Dorian |
|---|---|
| 1 | citado: a Rainha lhe confia a frota |
| 2–6 | voz nas cartas e nas cutscenes; orquestra a logística (Brumar, reforços) |
| 7 | **traição de Mervane** (cunhado): Dorian retira o título do governador por carta, sem aparecer em campo |
| 8–9 | assume o comando da expedição às ilhas; sobre a chegada à Miragem, decide o plano da colônia |
| 10 | em cutscene, despede-se do porto e "sobe a bordo da terceira onda" |
| **11** | **jogável**: chega com a segunda onda por mar ao Porto Albor; assume o comando do cerco |
| **12** | lidera a fortaleza; derruba Skarn (chefe) ou o obriga a recuar; **fica** no Bastião (gancho) |
**Nos Clãs do Cinzal (inimigo)**: m9 e m12 (chefe final; ver §2.1). Pode **fugir ferido** no gancho.
**Atributos base sugeridos**
| PV | Dano | Armad. | Vel. | Alcance | Recarga | Visão | Mana | Base/escala |
|---|---|---|---|---|---|---|---|---|
| 600 | 42+10 normal | 6 | 6,0 | 2,4 | 1,15 s | 20 | 180 (+1,2/s) | `modelOf: cavalier`, `scaleMul 1.3` |
(faixa coerente com `hero_brann` 520 PV e o Cavaleiro 300 PV ×2; a velocidade é próxima do Cavaleiro (6,2) menos 3%; ajustar no balanceamento local.)
**Habilidades**
| # | id | Nome | Tecla | Alvo | Alcance | Mana | Recarga | Efeito | Novo? |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `hero_banner` | Estandarte de Aurelan | Z | si (área) | 0 | 60 | 30 s | `status haste` 12 s no herói **e nos aliados em `radius 9`** (movimento +50%, ataque +50%) | entrada nova + **extensão A1** (status em área) |
| 2 | `hero_shield_line` | Escudos Cerrados | X | si (área) | 0 | 70 | 35 s | `status flameshield` 15 s no herói e nos aliados em `radius 7` | entrada nova + **extensão A1** |
| 3 | `hero_marshal_charge` | Carga do Marechal | C | inimigo | 10 | 50 | 12 s | `damage` 90 (`normal`, `radius 3`) + `status slow` 3 s no alvo; opcional futuro: o herói avança até o alvo (efeito `dash`, **fora do MVP**) | entrada nova; efeitos existentes |
**Itens/evolução**: nenhum no MVP.

### 5.1 Aparência
- **Silhueta**: montado, vertical e imponente; o único humano com **capa longa** esvoaçante e **estandarte** preso às costas (haste alta, bandeira triangular). Cavalo largo e alto, porte de comando.
- **Armadura/roupa**: armadura completa de placas azul-aço (acabamento polido, mais refinada que a de Brann), peitoral com sol/estrela de Aurelan gravado; elmo aberto com **pluma azul**; capa azul-real com forro dourado.
- **Armas**: espada de cavalaria curva (**gume para +Z**) na cintura; lança de cerimônia opcional nas costas (se pesar, remover). Estandarte: cor do time no pano.
- **Cores**: azul-real (cor do time na capa e no pano), prata polida, **dourado** nas bordas e na pluma (mais ouro que Brann, para marcar posto).
- **Expressão**: rosto longo e sereno, barba curta branca, olhar fixo no horizonte; sobrancelhas retas. Textura de rosto só na face +Z do elmo aberto.
- **Proporção**: o cavaleiro pesa ≈ **1,3×** o Cavaleiro comum (`scaleMul 1.3`); o cavalo é o mesmo do Cavaleiro com barda azul; altura total dominante mas ≤ o Ogro.
- **Nós nomeados**: manter os do Cavaleiro (`Torso`, `ArmL`, `ArmR`, `Sword`, nós do cavalo). Acrescentar `Banner` (novo, só visual) exige registro em `ModelFactory.rebindUserData` e no `UnitAnimator` (animação de balanço) — documentar na tarefa de modelagem.

---

## 6. Heróis dos Clãs do Cinzal

### 6.1 Drogath Punho-de-Brasa (orc, `hero_drogath`) — Capitão
**Papel**: capitão de guerra do Clã Chama-Baixa: combatente de linha de frente, resistente, com cura própria.
**Personalidade/história**: 40 anos, líder de um clã pequeno que sobrevive de honra e de promessas. Silencioso, cumpre o que jura, acredita que "o fogo do clã não se apaga por ordem de chefe". Cuida do braseiro da **Anciã Ulma**. Frase: "O que o clã acende, o clã apaga."
**Arco por missão (Clãs do Cinzal)**
| m | Drogath |
|---|---|
| 1–2 | citado e em cutscenes: comanda a praia, reconhece o mural da Fenda com Ulma; objetivo oculto de conduta (Honra do Clã) |
| **3** | **jogável**: lidera o assalto a Pedra-Mãe; protege os Lacaios; vê o Presa-Negra lutar ao seu lado |
| 4–6 | dá a dianteira nos assaltos às ilhas; na m6 (Geada), enfrenta o forte de Brumar |
| 7 | **traição de Hurgan** (Lanças Quebradas): quebra o juramento e abre o brejo; Drogath o enfrenta |
| 8–9 | segura a Fornalha enquanto Vozgul faz o rito; na m9 a Anciã Ulma **morre** de velhice no último poço (morte narrativa de NPC), e Drogath **herda o Fogo do Clã** |
| 10–12 | leva o Fogo do Clã ao desembarque; na m12 acende o braseiro na Cidadela |
**Na Liga de Aurelan (inimigo)**: m2 (cutscene) e m6 (chefe do forte).
**Atributos base** (existentes; **sem mudança**): PV 540 · dano 38+10 normal · armadura 6 · velocidade 4,9 · alcance 2,2 · recarga 1,05 s · visão 18 · `modelOf: grunt` · `scaleMul 1.2`. **Mana: 150 (+1,2/s)** (de 120 +1,0).
**Habilidades**
| # | id | Nome | Tecla | Alvo | Alcance | Mana | Recarga | Efeito | Novo? |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `hero_war_cry` | Grito de Guerra | Z | si | 0 | 50 | 5 s | `status bloodlust` 15 s | **existe** (compartilhada com Brann) |
| 2 | `hero_ember_strike` | Golpe de Brasa | X | inimigo | 3 | 35 | 8 s | `damage` 50 (`magic`, `radius 2.5`) | entrada nova; efeito existente |
| 3 | `hero_clan_fire` | Fogo do Clã | C | si | 0 | 60 | 30 s | `heal` 150 PV de uma vez no herói | entrada nova; efeito existente |
**Itens/evolução**: nenhum no MVP.
**Aparência**
- **Silhueta**: largo e curvado para a frente (postura de investida); ombros caídos e braços longos; **machado de duas mãos** apoiado no ombro. Mais "corpulento" que o Brann.
- **Armadura/roupa**: couro curtido e **placas de ferro escuro** só nos ombros e no peito; manto de pele curto; faixas de pano vermelho-ferrugem nos antebraços; correntes de ferro; **braseiro minúsculo** pendurado na cintura (emissivo laranja, 1 material).
- **Arma**: machado de guerra de lâmina larga (**gume para +Z**), cabo de osso/madeira escura.
- **Cores**: pele verde-oliva, vermelho-ferrugem (cor do time nas faixas e no manto), ferro enegrecido, laranja da brasa.
- **Expressão**: mandíbula pesada, **presas curtas**, olhar baixo e sério; pintura de guerra em cinza (só na face frontal). Textura de rosto só na face +Z.
- **Proporção**: ≈ **1,2×** o Talhador (`scaleMul 1.2`).
- **Nós nomeados**: manter os do Talhador (`Torso`, `ArmL`, `ArmR`, `Axe`/arma).

### 6.2 Vozgul, a Profetisa (orc, `hero_vozgul` — NOVO) — Mago
**Papel**: mago de apoio e controle: dreno de vida, mortos-vivos temporários e furtividade. Alcance médio, frágil.
**Personalidade/história**: idade incerta (ouvem dizer que lembra os avós dos avós). Voz baixa e lenta; pensa em "dívidas de memória": todo morto merece lembrança. Ensina que o Erguer Mortos é um **empréstimo com juros**, não uma arma. Guardiã do rito da forja de Fornalha. Discreta oposição a Skarn (usa necromancia sem rito).
**Arco por missão (Clãs do Cinzal)**
| m | Vozgul |
|---|---|
| 1–4 | citada por Ulma como "quem guarda os nomes dos mortos" |
| 5 | **cameo** (Madeira de Guerra): conduz os Necromantes de IA; ensina o Erguer Mortos "com respeito" |
| 6–7 | em cutscenes: tenta convencer Skarn a não usar mortos como isca |
| **8** | **rito de Fornalha**: conduz o rito que acende o Monte Caldeira; é o foco da defesa |
| 9 | recusa-se a erguer os mortos de Miragem sem rito; discute com Skarn (semente do gancho) |
| **10** | **jogável**: abre o desembarque acalmando as marés; erguida como guardiã do Fogo do Clã herdado de Ulma |
| 11–12 | na colônia, honra os mortos e usa o Chamado dos Ancestrais com disciplina; na m12 é a "voz" da Cidadela |
**Na Liga de Aurelan (inimigo)**: m5 (voz), m8 (chefe do Santuário).
**Atributos base sugeridos**
| PV | Dano | Armad. | Vel. | Alcance | Recarga | Visão | Mana | Base/escala |
|---|---|---|---|---|---|---|---|---|
| 240 | 0+30 mágico | 2 | 4,4 | 9,5 | 1,7 s | 20 | 270 (+1,4/s) | `modelOf: necromancer`, `scaleMul 1.15` |
(espelha Oren: 260 PV, 0+34 mágico, alcance 10, 255 mana; Vozgul troca um pouco de alcance e dano por mais mana.)
**Habilidades**
| # | id | Nome | Tecla | Alvo | Alcance | Mana | Recarga | Efeito | Novo? |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `hero_soul_drain` | Dreno de Alma | Z | inimigo | 10 | 45 | 4 s | `damage` 70 mágico com `lifesteal 0.5` (cura a si) | entrada nova; efeito existente (Toque da Morte) |
| 2 | `hero_ancestors` | Chamado dos Ancestrais | X | si | 0 | 60 | 15 s | `raise_dead` de `skeleton` (`radius 8`, até 4 cadáveres, `lifetime 90`); sem cadáver, não lança | entrada nova; efeito existente |
| 3 | `hero_ash_veil` | Véu de Cinzas | C | aliado | 10 | 70 | 20 s | `status invisible` 20 s no aliado | entrada nova; status existente |
**Itens/evolução**: nenhum no MVP.
**Aparência**
- **Silhueta**: alta, esguia e curvada; capuz ritual com **galhadas/costelas de osso** em arco sobre a cabeça; manto longo que arrasta cinza; cajado em espiral com crânio pequeno no topo.
- **Roupa**: robe de lã cinza-carvão por cima de faixas de pano vermelho desbotado (cor do time); colares de dentes e **fitas com nomes riscados** presas ao cajado; mãos pintadas de cinza.
- **Arma**: cajado ritual (sem gume); chama verde-limão pálida fraca (1 material emissivo) na ponta.
- **Cores**: pele verde-acinzentada, cinza-carvão, vermelho desbotado (cor do time), osso, **verde-limão** (necro, o mesmo da `raise_dead` `#84cc16`).
- **Expressão**: olhos fundos e calmos, sobrancelhas baixas, pintura branca de cinza em linhas verticais; **presas pequenas**. Textura de rosto só na face +Z.
- **Proporção**: ≈ **1,15×** o Necromante (`scaleMul 1.15`); mais alta e fina que Drogath (mesma altura de olhos que Oren).
- **Nós nomeados**: manter os do Necromante (`Torso`, `ArmL`, `ArmR`, `Staff`).

### 6.3 Skarn, chefe-de-brasa (orc, `hero_skarn` — NOVO) — Comandante
**Papel**: Comandante dos Clãs do Cinzal: tanque de chefia, grita ordens em área e pode se proteger (ao custo de vida). O maior herói do jogo.
**Personalidade/história**: 52 anos, ogro de coroa de ferro que unificou os clãs numa união de clãs porque viu a fome matar a metade deles. Carismático e implacável, convicto de que "os Clãs do Cinzal precisam do mar, e quem fecha o mar fecha os Clãs do Cinzal". Não é o vilão simples: trata os clãs com dureza, mas lhes dá água. Sua coroa de ferro é feita das lâminas de três clãs rivais.
**Arco por missão (Clãs do Cinzal)**
| m | Skarn |
|---|---|
| 1 | voz (pira do Planalto do Cinzal) e carta |
| 2–6 | ordens e cartas; na m4 escolhe queimar a madeira das barcaças de cinza para acender a frota; na m5 manda erguer mortos sem rito (conflito com Vozgul) |
| 7 | compra Hurgan com ferro de Mervane; na m7 Drogath sofre a traição |
| 8–9 | na m9 ordena resistir no último poço; a morte da Anciã Ulma o impacta |
| 10 | atravessa o Mar Fendido na terceira onda |
| **11** | **jogável**: chega com a segunda onda por mar a Brasa-Alta; assume o comando da colônia |
| **12** | lidera a Cidadela contra Dorian (que pode fugir ferido: gancho) |
**Na Liga de Aurelan (inimigo)**: m1 (voz), m9 (cutscene) e m12 (chefe final).
**Atributos base sugeridos**
| PV | Dano | Armad. | Vel. | Alcance | Recarga | Visão | Mana | Base/escala |
|---|---|---|---|---|---|---|---|---|
| 700 | 48+12 normal | 7 | 5,2 | 2,6 | 1,4 s | 20 | 180 (+1,2/s) | `modelOf: ogre`, `scaleMul 1.35` |
(Ogro 320 PV, 32+10: Skarn ≈ 2,2× em PV e 1,5× em dano, como Brann sobre o Espadachim.)
**Habilidades**
| # | id | Nome | Tecla | Alvo | Alcance | Mana | Recarga | Efeito | Novo? |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `hero_horde_roar` | Rugido dos Clãs | Z | si (área) | 0 | 70 | 30 s | `status bloodlust` 10 s no herói **e nos aliados em `radius 8`** | entrada nova + **extensão A1** |
| 2 | `hero_ash_pact` | Pacto de Cinzas | X | si | 0 | 40 | 40 s | `status unholy_armor` 6 s no herói: invulnerável durante o efeito; ao fim perde 50% do PV atual | entrada nova; status existente |
| 3 | `hero_crown_hammer` | Martelo da Coroa | C | inimigo | 3 | 55 | 12 s | `damage` 110 (`normal`, `radius 4`) + `status slow` 4 s no alvo | entrada nova; efeitos existentes |
**Itens/evolução**: nenhum no MVP.
**Aparência**
- **Silhueta**: o **maior** herói do jogo (maior que o Ogro comum e que qualquer humano); tronco enorme, braços longos, postura ereta de comando; coroa de ferro com lâminas voltadas para cima (silhueta de "coroa de espetos"); **manto de pele** pesado nos ombros.
- **Armadura/roupa**: placas de ferro negro em ombros, peito e antebraços; saiote de correntes; faixas vermelho-ferrugem (cor do time) e cicatrizes de brasa; braseiro portátil nas costas (emissivo).
- **Arma**: **martelo de guerra gigante** de cabeça retangular (**o lado "de ataque" para +Z**); sem lâmina cortante.
- **Cores**: pele verde-musgo escura, ferro enegrecido, vermelho-ferrugem (cor do time), laranja da brasa.
- **Expressão**: sobrancelha pesada, boca com **presas grandes**, olhar frio e confiante; uma cicatriz atravessando o olho esquerdo. Textura de rosto só na face +Z.
- **Proporção**: ≈ **1,35×** o Ogro comum (`scaleMul 1.35`) ≈ 1,9× o Talhador em altura; draw calls ≤ 20 mesmo com a coroa e o braseiro.
- **Nós nomeados**: manter os do Ogro (`Torso`, `ArmL`, `ArmR`, `Club`/arma).

---

## 7. O que se implementa onde

### 7.1 Nuvem (sem GPU/navegador; regras de `docs/historico/HANDOFF_CLOUD.md` §2)
| Item | Arquivos | Verificação |
|---|---|---|
| **Dados dos heróis** (3 novos, 3 alterados) | `src/data/units.js` | `tests/unit/heroes.test.js` (estende: 6 heróis, `modelOf` válido, facção, unique) |
| **14 habilidades** novas | `src/data/abilities.js` | `tests/unit/abilities.test.js` (estende: ids existem, `requires: []`, efeitos de `EFFECT_KINDS`) |
| **Extensão A1**: `status` com `radius`/`allies` | `src/sim/abilities.js` (e doc no cabeçalho de `abilities.js`) | teste novo de aplicação em área + `determinism.test.js` verde (ordem por id) |
| **i18n** pt-BR/en | `src/i18n/*.json` | teste de paridade de i18n |
| **Retratos provisórios** | `public/ui/heroes/<id>.svg` (gerados por script descartável: escudo/monograma com cor da facção) e `icon` dos 3 novos | — (captura: pendente local) |
| Docs | `docs/08_GAME_DESIGN.md` §5.3/5.3b (Vozgul e **Skarn**, não Grok, como heróis orcs; Brann/Drogath com 3 habilidades), `src/data/campaigns/README.md` (corrigir "nenhum herói existe ainda") | — |
| Missões/campanha | JSON das 12 missões por facção: `spawn` dos heróis conforme §2; `unlocks.heroes` | testes de campanha de `MUNDO-HISTORIA-CAMPANHA.md` §7.4 |

**Itens e evolução**: o sistema atual (F4-08, `heroes.js`) **não tem itens nem níveis**; o GDD §5.3 previa níveis 1–5 por XP, mas a implementação foi simplificada para "unique + habilidades ativas". Esta spec **não adiciona** nenhum dos dois (evita escopo). Se o dono quiser: (a) **evolução por missão** (cada herói ganha +X% PV/dano em marcos m3/m6/m9/m12 via `unlocks`) ou (b) **XP real** (F4-08 original). Pergunta §9-3.

### 7.2 Local (precisa de Blender, GPU, ouvido)
- **Modelos 3D** (Sonnet 5.5 no Blender; o dono gera antes as imagens de referência): Dorian, Vozgul e Skarn (novos) e **versões de herói** de Brann, Oren e Drogath (hoje reaproveitam `knight`, `mage`, `grunt`). Seguem F7-00c (glb padrão), ≤ 20 draw calls, texturas ≤ 512², rosto só na face +Z, armas com gume para +Z; preservar os nós nomeados; verificar no jogo **e** no inspetor.
- **Retratos e ícones finais** (F7-09), **voz** (se houver), **VFX** das habilidades (cores já sugeridas nas fichas).
- **Equilíbrio**: PV/dano/mana/recarga são valores iniciais; ajustar jogando (m3, m10, m11, m12) e com `tools/headless-match.js` se houver balanceamento IA.
- **Animações** especiais (Estandarte do Dorian; coroa do Skarn) se pedirem nós novos.

---

## 8. Detalhes técnicos das habilidades

### A1 — `status` em área aliada (única extensão de código)
Hoje `{kind:'status', id, duration}` aplica ao alvo (ou ao lançador). Proposta mínima: campos opcionais `radius` (número) e `allies: true`: aplica também a **todas as unidades aliadas do mesmo dono (e de aliados de time)** dentro de `radius` do lançador, em **ordem crescente de id** (determinismo), excluindo construções. Sem `radius`, comportamento atual idêntico. Usada por `hero_banner`, `hero_shield_line` (Dorian) e `hero_horde_roar` (Skarn). Teste: aplicação em área, não afeta inimigos, ordem estável, `determinism.test.js` verde.

### A2 — `dash` (opcional, fora do MVP)
`hero_marshal_charge` só causa dano + lentidão. O "avanço até o alvo" (Dorian atravessando a linha) é uma melhoria futura: `{kind:'dash', speed}` move o lançador até o alvo antes do `damage`. Não é exigido pelo aceite.

### Hotkeys por herói
Z/X/C livres em cada herói (sem repetir dentro do mesmo herói): Brann Z/X/C = Grito/Golpe/Postura; Oren Z/X/C = Raio/Restauro/Tempestade; Drogath Z/X/C = Grito/Golpe/Fogo; Vozgul Z/X/C = Dreno/Chamado/Véu; Dorian Z/X/C = Estandarte/Escudos/Carga; Skarn Z/X/C = Rugido/Pacto/Martelo.

---

## 9. Perguntas ainda abertas
1. **Comandante na m11 (recomendado) ou na m12?** Na m11 ele é o herói que dá peso à colônia; na m12 o jogador o recebe só para o final (mais "recompensa", menos uso).
2. **Skarn jogável nos Clãs do Cinzal** (e Dorian jogável na Liga de Aurelan) apesar de serem os chefes da campanha oposta: confirmado pela decisão 6 ("versões humana e orc"); só confirme se o chefe final (inimigo) deve ser **mais forte** que o herói jogável (hoje: o mesmo tipo, com mais guarda/ondas).
3. **Itens/evolução de herói**: manter fora (MVP) ou adotar evolução por missão / XP?
4. **Vozgul como "Profetisa"**: a profetisa dos Clãs do Cinzal tem papel que lembra um oráculo; aceitável, ou prefere "Guardiã da Memória"?
5. **Brann e Drogath compartilham `hero_war_cry`**: ok manter uma habilidade reaproveitada, ou criar variação por facção (efeito idêntico, nome/ícone diferentes)?
6. **Morte narrativa de NPCs** (Orsolo na m8 da Liga de Aurelan; Ulma na m9 dos Clãs do Cinzal): aceitável no tom, só em diálogo e sem violência explícita?
