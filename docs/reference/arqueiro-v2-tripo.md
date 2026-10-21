# Arqueiro v2 (archer_v2) — FBX do Tripo no WarPoly (M2-31)

**Entrada:** `/home/rafael/Downloads/medieval+archer+3d+model/tripo_convert_2e3c6f08-…fbx` (+ `.fbm`): 1 malha de 19 632 triângulos, 1 ilha (arco, corda e aljava soldados), rig Mixamo de 65 ossos sem ações, T-pose, textura 512². **Script:** `tools/blender/build_archer_v2.py` (usa `hero_common.py`, como Oren/Drogath/Skarn). **Saída:** `public/models/archer_v2.glb` (13 draw calls, 22 654 triângulos, atlas 512², ~390 KB).

## Decisão: espelhar a malha (arco em `ArmL`)
O jogo anima o arqueiro com o arco em `ArmL` (lado -x: o `UnitAnimator` levanta o ArmL e puxa a corda com o ArmR; o `archer.glb` antigo é assim). O `hero_common` espelha a malha em x (como no Brann): a mão esquerda do FBX, que segura o arco, vira o `ArmL` em -x. O projétil e a pose de disparo seguem sem trocar de mão. Custo aceito: o emblema do tabardo fica espelhado (igual aos outros heróis).

## Hierarquia e cor de time
`Archer` > `Torso` (aljava e flechas fazem parte dele), `Head`, `ArmL` > `ForeArmL` > `Bow` (+ `BowTipTop/Bottom`, `BowStringTop/Bottom`, `DrawnArrow`), `ArmR` > `ForeArmR`, `LegL`, `LegR`. TeamColor = faces inteiras azuis do tabardo no tronco (o capuz azul-escuro e a gola ficam com a cor original). Repose por rig: braço do arco desce com o antebraço para a frente e a mão em guinada (o punho continua em torno do arco em pé); braço da corda desce reto. A corda original foi removida da malha (virou os cilindros dinâmicos) e a flecha armada é gerada no script.

## Animação (UnitAnimator) e projétil
- O `ForeArmL` é novo: no disparo o animador contra-gira o `ArmL` (quaternion inverso), então o braço do arco fica reto e o arco em pé (barriga para +Z) com o mesmo `ArmL.rotation.x = -1,45` do modelo antigo. `applyArcherFight` usa `applyArcherFightV2` só quando existe `ForeArmL` (o modelo antigo segue o caminho de sempre).
- Braço da corda: poses do `ArmR` e do `ForeArmR` (constante `ARCHER_V2_DRAW`) vindas de uma cinemática inversa (ponta dos dedos no encaixe, cotovelo recuado à altura do ombro); no jogo a distância dedos-encaixe é de 0,7 a 9 cm durante a puxada.
- `ProjectileViews` (só visual): a flecha da simulação nasce em (unidade + 1,68 em y); com o archer_v2 a malha parte da ponta do arco e volta à trajetória em 25 % do voo. A sim e o checksum não mudam.
- `ModelFactory.createArcher` usa `archer_v2` e cai no `archer` antigo (que continua registrado e no inspetor, `archer_glb`). O Patrulheiro (`modelOf: 'archer'`) herda o novo modelo.

## Verificação
`tools/ui-captures/archer-v2/game-check.mjs` (11 checagens + capturas: idle, andar, mira, corda puxada, solta, flecha no arco e em voo, morrer, time vermelho, Patrulheiro, inspetor); teste `tests/unit/archerV2Glb.test.js`; retrato e ícone (`ui_specs.py`, `portrait_poses.json`); baseline visual só de `inspector/archer_v2_glb`.

## Limites
Triângulos acima do archer antigo (6,8 mil): malha do Tripo sem decimar. As pernas só têm botas e o trecho de calça sob a barra do gibão (a saia fica no Torso). O ícone mostra a flecha armada saindo do arco (como o ícone antigo): a pose de idle do dump não esconde o `DrawnArrow`.
