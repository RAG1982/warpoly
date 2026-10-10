"""
build_walls.py — blocos de muralha (humana de pedra e orc de paliçada) gerados 100% por script (F7-00b lote 2; refeito
na arte A para encaixar em fileira).

Uso:
  blender -b --factory-startup --python tools/blender/build_walls.py -- [human|orc|all] [--no-render]

Saída: public/models/wall_human.glb e wall_orc.glb. Um bloco de 2,4 × ~2,5 × 2,4 (a pegada é exatamente o passo
`WALL_STEP` = 2,4 de `src/data/buildings.js`, então o bloco vizinho encosta na face, sem vão), origem no centro da base, uma
malha só (`Static_Mesh`, material `Atlas` 512², 1 draw call). O `WallBatch` extrai a geometria e o material do .glb e os
desenha em `InstancedMesh` (1 draw call por facção, `scaleY` da obra e ocultação por instância preservados). Sem rotação
por instância: os blocos são simétricos em x/z.

Regras de encaixe (por que a fileira não tem emenda feia):
  * todas as faces verticais ficam rentes a ±1,2 (nada sai da célula de 2,4, então não há sobreposição coplanar);
  * os relevos (cordões, mísulas, seteiras, faixas de ferro) ficam DENTRO de cada face; os cantos são rentes e só os
    biséis de 0,02–0,03 desenham a "emenda" entre blocos;
  * os ritmos (mísulas em ±0,6, toras de 0,8 em 0,8, ameias de 0,6 nos cantos) têm período que divide 2,4, então o
    padrão continua sem salto de um bloco para o outro; as duas ameias de cantos vizinhos formam uma ameia de 1,2 com
    vão de 1,2 (merlão e vão iguais);
  * o pé desce 0,55 abaixo do solo, então relevo em desnível não mostra frestas por baixo do bloco.
Orc: grade 3×3 de toras octogonais (0,8 de passo, pontas de ferro nos cantos), faixa de tinta de guerra na tora do meio de cada face e cintas de ferro rentes.
Com `--no-render` só exporta; sem ele também gera `wall_<tipo>_row*` (5 blocos no passo do jogo, em linha e na diagonal).
"""
import os
import sys
import math

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('ATLAS', '512')
import bpy  # noqa: E402
from mathutils import Vector, Matrix  # noqa: E402
import common as C  # noqa: E402
from common import (MeshBuilder, M, prim_box, prim_rings, ring_h, prim_cyl, prim_cone, prim_sphere, limb_rings)  # noqa: E402
from bld_common import beam, tube, log, bbox_game, finish_building  # noqa: E402
import bld_orc as O  # noqa: E402
import build_ogre_den as D  # noqa: E402

TEAM_DEFAULT = '#808080'
CELL = 2.4          # = WALL_STEP (src/data/buildings.js)
HALF = CELL / 2
SKIRT = 0.55        # parte enterrada do pé

PALETTE = dict(D.PALETTE)
PALETTE.update(O.ORC_EXTRAS)
STONE = dict(base='#a7aeb5', var='#848b92', var_scale=2.0, var_amt=0.8, fine=0.1, pattern='bricks', mapping='box',
             pw=0.6, ph=0.4, mortar='#5d636a', mortar_size=0.04, brick_tint='#cdd2d7', brick_tint_amt=0.6,
             brick_dark=0.84, brick_lite=1.06, top=0.28, edge='#e8ecef', edge_amt=0.3, edge_r=0.04, edge_gain=6.0,
             ao=(0.7, 0.75), ao_pow=1.3)
PALETTE.update({
    'wstone': STONE,
    'wstone_dark': dict(STONE, base='#6f757c', var='#4f555c', brick_tint='#868c93', pw=0.8, ph=0.5),
    'wstone_light': dict(STONE, base='#c6ccd2', var='#a7aeb5', brick_tint='#dadee2', pw=0.6, ph=0.3),
    # toras da paliçada: AO leve (o AO forte entre toras encostadas vira "fresta preta" e as toras parecem finas)
    'stake': dict(base='#6a4630', var='#4a2f1e', var_scale=2.0, fine=0.09, pattern='planks_v', mapping='box', pw=3.0,
                  ph=0.3, mortar='#2a190f', mortar_size=0.012, top=0.25, edge='#9a7452', edge_amt=0.3, edge_r=0.03,
                  ao=(0.25, 0.4)),
    'stake_tip': dict(base='#6a4a2e', var='#4a3320', var_scale=6.0, var_amt=0.8, fine=0.1, top=0.3, edge='#9a7650',
                      edge_amt=0.3, edge_r=0.03, ao=(0.25, 0.4)),
    # cintas e pontas de ferro: fosco e escuro (o 'iron' padrão tem desgaste de borda forte, que clareia a faixa fina inteira)
    'strap': dict(base='#3a3a42', var='#2a2a31', var_scale=3.0, fine=0.1, top=0.25, edge='#7d7d88', edge_amt=0.22,
                  edge_r=0.012, ao=(0.3, 0.5)),
    'spike': dict(base='#4b4d58', var='#33343d', var_scale=3.0, fine=0.08, top=0.35, edge='#9a9aa8', edge_amt=0.3,
                  edge_r=0.02, ao=(0.25, 0.4)),
    'war_paint': dict(base='#a82a20', var='#7c1a12', var_scale=6.0, fine=0.12, top=0.25, ao=(0.25, 0.35)),
    'wmoss': dict(base='#5f7a4a', var='#47603a', var_scale=3.0, var_amt=0.9, fine=0.14, top=0.3, ao=(0.4, 0.5)),
})


def human(mb):
    # pé escuro (com a parte enterrada), corpo, cornija e ameias nos cantos: tudo rente a ±1,2
    mb.add(prim_box(CELL, SKIRT + 0.5, CELL, base=True), 'wstone_dark', M((0, -SKIRT, 0)), bevel=0.025)
    mb.add(prim_box(CELL, 1.4, CELL, base=True), 'wstone', M((0, 0.5, 0)), bevel=0.025)
    mb.add(prim_box(CELL, 0.26, CELL, base=True), 'wstone_light', M((0, 1.9, 0)), bevel=0.025)
    for sx in (-1, 1):
        for sz in (-1, 1):
            mb.add(prim_box(0.6, 0.38, 0.6, base=True), 'wstone_light', M((sx * 0.9, 2.16, sz * 0.9)), bevel=0.025)
    # relevos dentro de cada face (rentes aos cantos): cordão do pé, mísulas sob a cornija e seteira emoldurada
    for ry in (0, 90, 180, 270):
        T = M((0, 0, 0), (0, ry, 0))
        mb.add(prim_box(CELL, 0.1, 0.1), 'wstone_light', T @ M((0, 0.52, HALF)))
        for dx in (-0.6, 0.6):
            mb.add(prim_box(0.3, 0.24, 0.1), 'wstone_light', T @ M((dx, 1.66, HALF)))
        mb.add(prim_box(0.34, 0.84, 0.07), 'wstone_light', T @ M((0, 1.0, HALF)))
        mb.add(prim_box(0.12, 0.6, 0.06), 'dark', T @ M((0, 1.0, HALF + 0.02)))
    # musgo no pé (só em uma face, para o bloco não ficar uniforme)
    mb.add(prim_sphere(0.5, 0.08, 0.05, 6, 3, y_min=0.0), 'wmoss', M((-0.5, 0.47, HALF - 0.02)), smooth=0)
    mb.add(prim_sphere(0.35, 0.07, 0.05, 6, 3, y_min=0.0), 'wmoss', M((0.55, 0.47, -HALF + 0.02), (0, 180, 0)), smooth=0)


# alturas das 9 toras (grade 3×3 de 0,8, linhas de trás para a frente); topo máx. = 0,35 + 1,75 + 0,5 = 2,6
ORC_H = ((1.25, 1.5, 1.3), (1.45, 1.75, 1.4), (1.35, 1.6, 1.2))


def stake(mb, x, z, y0, h, r, tip_len, tip_mat, shaft_mat='stake'):
    """Tora octogonal pontiaguda sem tampas escondidas (o fundo entra no pé e o topo é a base da ponta)."""
    rings = limb_rings([(x, y0, z), (x, y0 + h, z)], [r, r], 8, up=(0, 1, 0))
    mb.add(prim_rings(rings, cap0=False, cap1=False), shaft_mat, smooth=0)
    v, f = prim_cone(r, tip_len, 8)
    mb.add((v, f[1:]), tip_mat, M((x, y0 + h, z)), smooth=0)


def orc(mb):
    # pé de pedra bruta (com a parte enterrada) + grade 3×3 de toras octogonais pontiagudas + miolo escuro nos vãos
    mb.add(prim_box(CELL, SKIRT + 0.4, CELL, base=True), 'rock_plain', M((0, -SKIRT, 0)), bevel=0.03)
    mb.add(prim_box(CELL - 0.3, 1.0, CELL - 0.3, base=True), 'dark', M((0, 0.3, 0)))
    r = 0.44   # as toras encostam em 0,8 (largura entre faces 0,81): sem fresta, só a "costura" entre elas
    for j, z in enumerate((-0.8, 0.0, 0.8)):
        for i, x in enumerate((-0.8, 0.0, 0.8)):
            corner = (i != 1 and j != 1)
            if corner:   # toras dos cantos com ponta de ferro
                stake(mb, x, z, 0.35, ORC_H[j][i], r, 0.6, 'spike')
            else:
                stake(mb, x, z, 0.35, ORC_H[j][i], r, 0.5, 'stake_tip')
    # faixa de tinta de guerra na tora do meio de cada face (ritmo de 2,4 na fileira); anel um pouco maior que o octógono
    for (i, j) in ((1, 0), (1, 2), (0, 1), (2, 1)):
        x, z = (-0.8, 0.0, 0.8)[i], (-0.8, 0.0, 0.8)[j]
        mb.add(prim_cyl(r + 0.012, r + 0.012, 0.2, 8, base=True, cap0=False, cap1=False), 'war_paint', M((x, 0.35 + 0.62, z)), smooth=0)
    # cintas de ferro rentes ao bloco nas quatro faces (duas alturas)
    for y in (0.8, 1.4):
        for ry in (0, 90, 180, 270):
            T = M((0, 0, 0), (0, ry, 0))
            mb.add(prim_box(CELL - 0.06, 0.13, 0.05), 'strap', T @ M((0, y, HALF - 0.005)))


def build(kind):
    C.reset_scene()
    mats = C.make_paint_set(PALETTE)
    root = C.make_empty('WallHuman' if kind == 'human' else 'WallOrc')
    mb = MeshBuilder('Block')
    (human if kind == 'human' else orc)(mb)
    part = mb.build(mats, parent=root)
    out = f'wall_{kind}'
    args = C.script_args()
    # finish_building renderiza o bloco avulso; a fileira vem depois (precisa do bloco já com o material final)
    finish_building(root, out, out + '.glb', out + '_atlas', [part], None, {'Block': 1.0}, TEAM_DEFAULT,
                    args, spawn=(0, 0, 0), rally=(0, 0, 0), game_dist=40)
    print('BBOX', bbox_game(root))
    if '--no-render' not in args:
        render_rows(kind)


def clear_rig():
    """Remove sol, chão e câmera de um RenderRig anterior (cada RenderRig cria os seus; luzes repetidas estourariam a exposição)."""
    for o in list(bpy.data.objects):
        if o.name.startswith(('Sun', 'RGround', 'Cam')):
            bpy.data.objects.remove(o)


def render_rows(kind):
    """Fileiras de 5 blocos no passo real do jogo (2,4): em x, na diagonal (passo 2,4 ao longo de (1,1)) e em L."""
    block = bpy.data.objects['Static_Mesh']
    me = block.data

    def row(name, pts):
        rr = C.make_empty(name)
        for k, (x, z) in enumerate(pts):
            o = bpy.data.objects.new(f'{name}_{k}', me)
            bpy.context.scene.collection.objects.link(o)
            o.parent = rr
            o.location = C.g(x, 0, z)
        return rr

    res = int(os.environ.get('RENDER_RES', 800))
    line = [((i - 2) * CELL, 0.0) for i in range(5)]
    diag = [((i - 2) * CELL / math.sqrt(2), (i - 2) * CELL / math.sqrt(2)) for i in range(5)]
    ell = [(-4.8, 2.4), (-2.4, 2.4), (0.0, 2.4), (0.0, 0.0), (0.0, -2.4)]
    for suffix, pts, views in (('row', line, [('game', (45, 44, 45), 24, None), ('low', (0.25, 0.42, 1.0), 24, None),
                                              ('top', (0.0, 1.0, 0.18), 24, None)]),
                               ('rowdiag', diag, [('game', (45, 44, 45), 24, None)]),
                               ('rowL', ell, [('game', (45, 44, 45), 24, None)])):
        rr = row(f'{kind}_{suffix}', pts)
        bpy.context.view_layer.update()
        # esconde o bloco original (a fileira tem o seu) e enquadra só a fileira
        block.hide_render = True
        clear_rig()
        rig = C.RenderRig(rr, f'wall_{kind}_{suffix}', res=res, samples=24)
        for (sfx, dvec, fov, dist) in views:
            rig.render(sfx, dvec, fov)
        if suffix == 'row':   # close da emenda do meio (x = 1,2) em duas alturas de câmera
            rig.center = C.g(1.2, 1.25, 0.0)
            rig.radius = 2.6
            rig.render('seam', (0.55, 0.5, 1.0), 30)
            rig.render('seam_back', (-0.55, 0.5, -1.0), 30)
        for o in list(rr.children):
            bpy.data.objects.remove(o)
        bpy.data.objects.remove(rr)


def main():
    args = C.script_args()
    kinds = [a for a in args if a in ('human', 'orc')] or ['human', 'orc']
    for k in kinds:
        build(k)


if __name__ == '__main__':
    main()
