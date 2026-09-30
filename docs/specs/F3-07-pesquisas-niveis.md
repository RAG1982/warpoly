# F3-07 · Pesquisas em níveis (Ferraria/Forja e Serraria) e classe avançada do atirador

> **Status: ✅ PRONTA (mesclada)**
> Leia antes: `CLAUDE.md`, `docs/specs/_COMUM.md`, `docs/08_GAME_DESIGN.md` §5.1, §6, §7, `docs/07_DECISOES.md` (D2 nomes próprios, D7).
> Executor: **sonnet**, worktree, porta do vite **5202**. Depende de F3-03 (dano básico/perfurante) e F3-06 (requisitos `{hq:N}`) — ambas já no master.

## Por quê
Hoje há 4 pesquisas de nível único, só na Forja (`src/data/upgrades.js`: `infantry_attack`, `infantry_defense`, `ranged_attack`, `ranged_defense`; `FORGE_UPGRADES`), com bônus em "ataque" genérico. O design §7 pede pesquisas em **2 níveis**, divididas entre **Ferraria/Forja** (corpo a corpo) e **Serraria** (atiradores + economia), requisitos por nível do Centro, e a **classe avançada** do atirador (Arqueiro→Patrulheiro, Lanceiro-Machado→Enfurecido) com pesquisas próprias.

## Pronto quando (mensurável)
1. **Catálogo de pesquisas por níveis** em `src/data/upgrades.js` (substitui o formato atual; mantenha `UPGRADE_CONFIG`/`FORGE_UPGRADES` como exports **derivados** para compatibilidade até a UI migrar):
   ```js
   export const RESEARCH = {
     melee_weapons:  { building: 'forge', levels: [ {cost:{gold:200,wood:100}, time:30, bonus:{basic:+2},  requires:[]},
                                                  {cost:{gold:400,wood:200}, time:45, bonus:{basic:+2},  requires:[{hq:2}]} ],
                       appliesTo: ['knight','grunt','ogre'], name:{human:'Armas Forjadas', orc:'Lâminas de Guerra'} },
     melee_armor:    { building: 'forge', levels: [ {cost:{gold:150,wood:100,stone:80},  time:30, bonus:{armor:+2}, requires:[]},
                                                  {cost:{gold:300,wood:200,stone:160}, time:45, bonus:{armor:+2}, requires:[{hq:2}]} ],
                       appliesTo: ['knight','grunt','ogre'], name:{human:'Escudos Reforçados', orc:'Placas de Ferro'} },
     ranged_ammo:    { building: 'lumber', levels: [ {cost:{gold:200,wood:100}, time:30, bonus:{piercing:+1}, requires:[]},
                                                   {cost:{gold:400,wood:200}, time:45, bonus:{piercing:+1}, requires:[{hq:2}]} ],
                       appliesTo: ['archer','axethrower','ranger','berserker'], name:{human:'Flechas de Aço', orc:'Machados Balanceados'} },
     woodcutting:    { building: 'lumber', levels: [ {cost:{gold:300,wood:150}, time:40, effect:{woodMultiplier:1.25}, requires:[]} ],
                       name:{human:'Ofício do Lenhador', orc:'Ofício do Lenhador'} },
     ranged_class:   { building: 'lumber', levels: [ {cost:{gold:800}, time:60, effect:{promote:{archer:'ranger', axethrower:'berserker'}}, requires:[{hq:2}]} ],
                       name:{human:'Treinamento de Patrulheiro', orc:'Ritual do Enfurecido'} },
     // Classe avançada (1 nível cada; requer ranged_class):
     ranger_longbow:    { building:'lumber', faction:'human', levels:[{cost:{gold:500}, time:40, bonus:{range:+2}, requires:[{research:'ranged_class'}]}], appliesTo:['ranger'], name:{human:'Arco Longo'} },
     ranger_sight:      { building:'lumber', faction:'human', levels:[{cost:{gold:1500}, time:50, bonus:{sight:+4}, requires:[{research:'ranged_class'}]}], appliesTo:['ranger'], name:{human:'Visão Aguçada'} },
     ranger_marksman:   { building:'lumber', faction:'human', levels:[{cost:{gold:2500}, time:60, bonus:{piercing:+3}, requires:[{research:'ranged_class'}]}], appliesTo:['ranger'], name:{human:'Pontaria'} },
     berserker_range:   { building:'lumber', faction:'orc',   levels:[{cost:{gold:500}, time:40, bonus:{range:+2}, requires:[{research:'ranged_class'}]}], appliesTo:['berserker'], name:{orc:'Arremesso Longo'} },
     berserker_regen:   { building:'lumber', faction:'orc',   levels:[{cost:{gold:1500}, time:50, effect:{regen:1}, requires:[{research:'ranged_class'}]}], appliesTo:['berserker'], name:{orc:'Regeneração'} },
     berserker_fury:    { building:'lumber', faction:'orc',   levels:[{cost:{gold:2500}, time:60, bonus:{piercing:+3}, requires:[{research:'ranged_class'}]}], appliesTo:['berserker'], name:{orc:'Fúria'} }
   };
   ```
   (Cerco e naval ficam para F4-02/F4-07. Valores são iniciais — balanceamento na F3-11.)
2. **Estado por jogador**: `Player.researchLevels: Map<researchId, level>` (0 = nada). `researchedUpgrades` antigo vira derivado (`id` presente se nível ≥ 1) para compatibilidade.
3. **Onde se pesquisa**: `Building.startResearch(researchId)` aceita construção cujo `role` (`src/data/buildings.js`) bate com `RESEARCH[id].building` (`'forge'` → Ferraria/Forja de Guerra; `'lumber'` → Serraria/Serraria do Clã). Pesquisa o **próximo nível** do jogador; bloqueia se já no máximo, se outra construção do mesmo jogador já pesquisa o mesmo id, se faltar requisito (`evalRequirements` de `src/sim/requirements.js` — estender com `{research:'id', level?:N}`) ou recursos. Custo cobrado no executor do comando `CMD.RESEARCH` (já existe — F2-02).
4. **Aplicação** (`GameManager.completeUpgrade`/`applyUpgradeToUnit` ~l.709–740 — renomeie internamente se quiser, mantendo as assinaturas públicas):
   - `bonus.basic` → soma em `unit.damage.basic`; `bonus.piercing` → `unit.damage.piercing`; `bonus.armor` → `unit.armor`; `bonus.range` → `unit.attackRange`; `bonus.sight` → raio de visão (onde a névoa lê o raio da unidade — confira `FogOfWar`/`src/data` e use um campo `unit.sightBonus` somado na leitura).
   - Aplicar a unidades vivas **e** às treinadas depois (como hoje, por nível acumulado).
   - `effect.woodMultiplier` → integra com `gatherMultiplier` de `src/data/economy.js` (F3-04/F3-06).
   - `effect.regen` → +N PV/s em `simStep` para unidades `berserker` do jogador (sem passar do máximo).
   - `effect.promote` → **classe avançada**: todas as unidades `archer`/`axethrower` vivas do jogador viram `ranger`/`berserker` (troca de `type`, stats da nova definição preservando % de PV e bônus de pesquisa já aplicados), e o Quartel passa a treinar `ranger`/`berserker` no lugar. **Modelo 3D**: reutiliza o do arqueiro/lançador (arte nova é F7, adiada) — só mudar o nome exibido.
5. **Dados de unidade**: `src/data/units.js` ganha `ranger` e `berserker` (nomes PT-BR "Patrulheiro"/"Enfurecido"), base = arqueiro/lançador com +10% PV e +1 perfurante; `modelOf: 'archer'|'axethrower'` para o `ModelFactory` escolher o modelo.
6. **HUD**: card da Ferraria/Forja e da Serraria mostra as pesquisas disponíveis com **nível atual/máximo** ("Armas Forjadas 1/2"), custo do próximo nível, tooltip com efeito e requisitos faltantes (`Requer: Fortaleza`, `Requer: Treinamento de Patrulheiro`), progresso durante a pesquisa. Nomes pela facção (`name.human`/`name.orc`). Mudanças **mínimas** em `UIManager.js` (outro trabalho — F3-01 na nuvem — pode tocar input/card): gere a lista a partir de `RESEARCH` filtrando por `building` e `faction`.
7. **IA** (`src/ai/**`): pesquisa `melee_weapons`/`ranged_ammo` nível 1 quando tiver a construção e excedente (ouro > 400), nível 2 após evoluir o Centro; `ranged_class` quando tiver ≥ 4 atiradores e Centro nível 2.

## Não fazer
- Não criar cerco/naval/magias (F4). Não alterar modelos 3D. Não mudar custos de unidades/construções.
- Arquivos em outras frentes (evite ou mude o mínimo): `src/core/InputManager.js`, `style.css`, `src/ui/screens/**`.

## Testes (Vitest)
- `research.test.js`: pesquisar nível 1 e 2 na construção certa; recusa na construção errada; recusa sem `{hq:2}`; recusa duplicada por outra construção; máximo de nível; custo cobrado/reembolsado ao cancelar.
- Aplicação: `melee_weapons` 2 níveis → `damage.basic +4` em unidade viva e em unidade treinada depois; `ranged_ammo` → `piercing +1/+2`; `woodcutting` → multiplicador 1,25 na madeira entregue.
- Promoção: 3 arqueiros vivos viram `ranger` mantendo % de PV e bônus; Quartel passa a oferecer `ranger`.
- `berserker_regen`: PV sobe 1/s até o máximo.
- `determinism.test.js` continua verde.

## Verificação
Comandos mínimos do `_COMUM.md` (`npm run smoke` já usa safe-run — não aninhe). No jogo (porta 5202, `?skipPreload&texq=low`, via safe-run): pesquisar Armas Forjadas 1/2, Flechas de Aço, Treinamento de Patrulheiro; conferir card, números no card da unidade ("Atk: …") e nomes. Capturas em `tools/ui-captures/research/`.

## Docs
`docs/02_MECANICAS.md` (pesquisas), `docs/08_GAME_DESIGN.md` §7 (marcar implementado), `docs/01_ARQUITETURA.md` (formato `RESEARCH`, `researchLevels`).

## Entrega
Commits `F3-07 wip: ...` por etapa; final `F3-07: pesquisas em níveis, Serraria, classe avançada do atirador`. Relatório ≤ 25 linhas.
