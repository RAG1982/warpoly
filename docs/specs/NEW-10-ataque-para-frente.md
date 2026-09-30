# NEW-10 · Golpe das animações de ataque termina atrás do corpo

Leia antes: `docs/specs/_COMUM.md`, `CLAUDE.md` (regra: armas com gume para a frente, +Z). Executor: **haiku**. Worktree isolada. Porta do vite **5200**.

## Causa (confirmada por cálculo)
Em `src/animation/UnitAnimator.js`, as funções `applyKnightFight` (~402), `applyVillagerFight` (~608), `applyBanditFight` (~681), `applyGruntFight` (~756), `applyAxethrowerFight` (~821), `applyOgreFight` (~893) giram o braço com `armR.rotation.x` **negativo no preparo** e **positivo no golpe** (ex.: Talhador `-1.55 → +1.3`, comentário "slam forward").
O braço pende em −Y a partir do ombro e a unidade olha para **+Z**. Rotação em X por θ leva a mão (0,−1,0) para `(0, −cos θ, −sin θ)`. Logo **θ > 0 joga a mão para trás (−Z)** e θ < 0 para a frente. O golpe termina atrás do corpo — exatamente o que o dono viu.

## Correção — espelhar o eixo X do braço e da arma nas funções de luta
Em cada uma das 6 funções acima (todas as fases: preparo, golpe, impacto, recuperação):
1. Para `parts.armR.rotation.x = E` → troque por `parts.armR.rotation.x = -(E)`.
2. Para a arma presa ao braço (`parts.sword`, `parts.weapon`, `parts.weaponR`), com repouso `R` (valor usado no início do preparo / fim da recuperação; ex.: `sword` 0.5, `weapon`/`weaponR` −0.78): `rotation.x = E` → `rotation.x = 2*R - (E)`. Assim o ângulo relativo ao repouso inverte junto com o braço e o repouso continua igual.
3. Não mexa em `rotation.y`/`rotation.z`, torso, cabeça, escudo, pernas.
4. `applyArcherFight` (~482): **não alterar** (o arco puxa para trás por natureza), mas confira se a mão direita termina atrás só durante a puxada; se a flecha sai para a frente, deixe como está.
5. `applyGather` (~953): verifique com a mesma regra — se o machado/picareta do trabalhador bate **atrás** do corpo no "impacto", aplique o mesmo espelhamento só no braço/ferramenta.

Preferência de implementação: um helper local `mirrorX(v, rest = 0)` que devolve `2*rest - v`, usado em cada linha, para o diff ficar legível.

## Não fazer
Não alterar durações, fases, `idle`, `walk`, `hurt`, `die`, nem nomes de nós. Não editar outros arquivos além de `src/animation/UnitAnimator.js` e o teste novo.

## Teste (Vitest, `tests/unit/fightDirection.test.js`)
Crie um `UnitAnimator` com um modelo falso: `THREE.Group` com filhos nomeados `Torso, Head, ArmL, ArmR, LegL, LegR` e sub-nó da arma conforme o tipo (`Sword`/`Weapon`/`WeaponR` — veja os nomes em `bindModel` ~46). Para cada tipo `knight, villager, bandit, grunt, axethrower, ogre`: `setAnimation('fight')`, `setTime(p)`:
- no pico do preparo (p logo antes do fim da 1ª fase): `-Math.sin(armR.rotation.x) < 0.2` (mão não está à frente);
- no impacto (p = 0,5 para corpo a corpo; 0,6 para o lançador): `-Math.sin(armR.rotation.x) > 0.5` (mão à frente);
- em p = 0 e p = 1: `armR.rotation.x ≈ 0` e arma no repouso (tolerância 0,05).

## Verificação
- `npm test`, `npm run lint`, `npx vite build --outDir /tmp/claude-1000/warpoly-build-check`, `npm run smoke`.
- Capturas no inspetor via `bash /home/rafael/warpoly/tools/safe-run.sh --timeout 240 -- node <script>` (GPU real com `assertHardwareGpu` de `tools/lib/assertGpu.mjs`; dev server `timeout 600 npx vite --port 5200 --strictPort`): o inspetor aceita parâmetros de URL de modelo, animação e tempo (veja `src/inspector/inspector.js` ~630–647). Para `knight` e `grunt`: `anim=fight` em `time` = 0,3 · 0,5 · 0,7 da duração, girando o modelo de lado (`inspectorApp.currentModelObject.rotation.y = Math.PI/2`). Salvar em `tools/anim-compare/new10/`. **Olhe as imagens**: no impacto a arma deve estar à frente do peito.

## Entrega
Commit: `fix(anim): golpe corpo a corpo e arremesso terminam à frente do corpo (NEW-10)`. Relatório ≤ 12 linhas.
