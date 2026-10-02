"""
build_stone_quarry.py — Pedreira (depósito neutro `stone`, `ResourceDepositView`) gerada 100% por script.

Uso:
  blender -b --factory-startup --python tools/blender/build_stone_quarry.py -- [--no-render]

Saída (public/models/stone_quarry.glb), coordenadas do jogo, origem no centro da base, frente = +Z:
  StoneQuarry (raiz)
  ├─ Static_Mesh   paredão de calcário em três patamares com estratos e marcas de cinzel, penhasco escuro no flanco,
  │                derrick de madeira com talha, corda e bloco em linga, cabrestante, pilha de blocos aparelhados,
  │                bloco rachado com cunhas, carrinho de mão com entulho, escada, ferramentas e lasca de pedra (Atlas)
  └─ Socket_UnitSpawn / Socket_Rally   (convenção dos edifícios)
Neutra: sem cor de time. Pegada ~6,4 (raio de colisão 3,0), altura ~4,6. 1 draw call.
"""
import os
import sys
import math

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
from mathutils import Vector, Matrix  # noqa: E402
import common as C  # noqa: E402
from common import (MeshBuilder, M, prim_box, prim_rings, ring_h, prim_cyl, prim_cone,  # noqa: E402
                    prim_sphere, prim_extrude, bezier)
from bld_common import beam, tube, log, bbox_game, finish_building  # noqa: E402
from bld_house import polar, barrel, crate  # noqa: E402
import bld_orc as O  # noqa: E402
import build_ogre_den as D  # noqa: E402

Y0 = 0.30
TEAM_DEFAULT = '#808080'

PALETTE = dict(D.PALETTE)
PALETTE.update(O.ORC_EXTRAS)
PALETTE['wood'] = dict(PALETTE['log_light'])
STRATA = dict(base='#b5a98c', var='#8c8068', var_scale=1.6, var_amt=0.9, fine=0.12, pattern='bricks', mapping='box',
              pw=3.4, ph=0.34, mortar='#6d6552', mortar_size=0.035, brick_tint='#cdc2a4', brick_tint_amt=0.55,
              brick_dark=0.82, brick_lite=1.08, grad=(0.0, 4.0, 0.2), top=0.45, edge='#f0eadb', edge_amt=0.45,
              edge_r=0.05, edge_gain=6.0, ao=(1.0, 0.75), ao_pow=1.3)
PALETTE.update({
    'strata': STRATA,
    'strata_dark': dict(STRATA, base='#8f836b', var='#6a6049', brick_tint='#a09478'),
    'ashlar': dict(STRATA, pw=0.9, ph=0.45, brick_tint_amt=0.7, mortar='#7a715d', mortar_size=0.03, grad=None),
    'cut_face': dict(base='#d9cfb2', var='#b3a88c', var_scale=14.0, var_amt=0.7, fine=0.2, top=0.5, edge='#fff8e4',
                     edge_amt=0.5, edge_r=0.03, ao=(0.5, 0.6)),
    'crag': dict(D.ROCK, pattern=None, base='#6f685d', var='#47423a', var_scale=1.0, var_amt=1.0, fine=0.3,
                 edge='#9a9082', edge_amt=0.5),
    'rubble': dict(base='#a39a86', var='#6e6654', var_scale=20.0, var_amt=1.0, fine=0.25, top=0.4, ao=(0.6, 0.7)),
    'gravel': dict(base='#8d846f', var='#665e4c', var_scale=18.0, var_amt=0.9, fine=0.22, top=0.25, ao=(0.8, 0.8)),
})


def build_base(mats, root):
    mb = MeshBuilder('Base')
    mb.add(prim_cyl(3.2, 3.05, Y0, 16, base=True), 'strata_dark', bevel=0.07, smooth=0)
    mb.add(prim_cyl(3.0, 3.0, 0.05, 16, base=True), 'gravel', M((0, Y0, 0.1)), smooth=0)
    return mb.build(mats, parent=root)


def build_cliffs(mats, root):
    """Três patamares de calcário em degraus (fundo), penhasco escuro no flanco esquerdo, faces recém-cortadas."""
    mb = MeshBuilder('Cliffs')
    # patamares: cada um menor e mais recuado
    tiers = [(5.6, 1.3, 2.3, 0.0, -1.75, 'strata'), (4.5, 1.25, 1.8, 0.2, -2.1, 'strata_dark'), (3.2, 1.15, 1.3, 0.4, -2.4, 'strata')]
    y = Y0
    for (w, h, d, dx, z, mat) in tiers:
        mb.add(prim_box(w, h, d, taper=(0.92, 0.9), shift=(0.0, 0.03), base=True), mat, M((dx, y, z)), bevel=0.09, smooth=0)
        # estratos salientes e fendas
        for k in range(3):
            mb.add(prim_box(w * 0.7, 0.05, 0.1), 'strata_dark', M((dx + 0.2 * k - 0.2, y + 0.3 + 0.28 * k, z + d / 2 + 0.02)))
        # face recém-cortada (clara) com marcas de cinzel
        mb.add(prim_box(w * 0.36, h * 0.62, 0.06), 'cut_face', M((dx + 0.9, y + h * 0.5, z + d / 2 - 0.03)), bevel=0.01)
        y += h
    # penhasco escuro e blocos soltos de topo
    mb.add(prim_box(1.6, 2.6, 2.0, taper=(0.6, 0.7), shift=(0.1, 0.05), base=True), 'crag', M((-2.15, Y0, -1.5), (0, 20, 0)), bevel=0.12, smooth=0)
    mb.add(prim_box(1.2, 2.0, 1.3, taper=(0.5, 0.6), shift=(-0.1, 0.1), base=True), 'crag', M((-2.5, Y0, -0.3), (0, -30, 0)), bevel=0.1, smooth=0)
    mb.add(prim_sphere(0.9, 0.55, 0.8, 6, 3, y_min=-0.2), 'crag', M((-1.7, Y0, -0.1), (0, 40, 0)), smooth=0)
    mb.add(prim_box(1.0, 1.6, 1.2, taper=(0.5, 0.55), base=True), 'crag', M((-2.45, Y0 + 2.2, -1.4), (0, -25, 4)), bevel=0.1, smooth=0)
    mb.add(prim_box(0.9, 0.7, 0.8, taper=(0.7, 0.7), base=True), 'strata', M((0.6, Y0 + 3.7, -2.45), (0, 25, 0)), bevel=0.07, smooth=0)
    mb.add(prim_box(0.7, 0.5, 0.6, taper=(0.7, 0.7), base=True), 'strata_dark', M((-0.4, Y0 + 3.7, -2.4), (0, -20, 0)), bevel=0.07, smooth=0)
    # penedos soltos nos flancos
    for (x, z, s, r) in ((-2.6, 0.3, 0.55, 20), (2.7, -0.6, 0.5, -30), (-2.3, 1.7, 0.4, 5)):
        mb.add(prim_sphere(s, s * 0.7, s * 0.85, 6, 3, y_min=-0.2), 'strata_dark', M((x, Y0, z), (0, r, 0)), smooth=0)
    return mb.build(mats, parent=root)


def build_derrick(mats, root):
    """Derrick de madeira: mastro, lança inclinada, escoras, cabrestante e bloco pendurado em linga."""
    mb = MeshBuilder('Derrick')
    mx, mz = 1.95, -0.2
    top = Y0 + 4.0
    # base e mastro
    mb.add(prim_box(1.1, 0.2, 1.1, base=True), 'wood_dark', M((mx, Y0, mz)), bevel=0.02)
    log(mb, (mx, Y0 + 0.2, mz), (mx, top, mz), 0.15, 'wood_dark', n=7)
    for sz in (-1, 1):
        beam(mb, (mx + 0.05, Y0 + 0.3, mz + sz * 0.5), (mx, top - 1.2, mz + sz * 0.07), 0.11, 0.11, 'wood')
    beam(mb, (mx + 0.45, Y0 + 0.3, mz), (mx, top - 1.3, mz), 0.11, 0.11, 'wood')
    # lança
    tip = (mx - 2.2, top - 0.5, mz + 1.2)
    beam(mb, (mx, top - 0.4, mz), tip, 0.16, 0.14, 'wood', bevel=0.01)
    beam(mb, (mx, top - 1.4, mz), (mx - 1.1, top - 0.9, mz + 0.62), 0.09, 0.09, 'wood')   # escora da lança
    mb.add(prim_cone(0.12, 0.35, 5), 'iron', M((mx, top, mz)))
    mb.add(prim_cyl(0.2, 0.2, 0.12, 8), 'iron', M(tip, (0, 0, 90)), smooth=30)   # polia
    # cabos de apoio ao topo
    beam(mb, (mx, top, mz), (mx + 1.1, Y0 + 0.2, mz - 0.9), 0.025, 0.025, 'rope')
    beam(mb, (mx, top, mz), (mx + 1.0, Y0 + 0.2, mz + 1.0), 0.025, 0.025, 'rope')
    # cabrestante com manivela
    wz = mz + 0.8
    mb.add(prim_cyl(0.22, 0.22, 0.7, 8, base=False), 'wood_dark', M((mx + 0.55, Y0 + 0.65, wz), (0, 0, 90)), smooth=40)
    for sx in (-1, 1):
        mb.add(prim_box(0.1, 0.9, 0.2, base=True), 'wood', M((mx + 0.55 + sx * 0.4, Y0, wz)), bevel=0.01)
        mb.add(prim_cyl(0.3, 0.3, 0.05, 10), 'wood_light', M((mx + 0.55 + sx * 0.36, Y0 + 0.65, wz), (0, 0, 90)), smooth=30)
    mb.add(prim_box(0.06, 0.06, 0.6), 'iron', M((mx + 1.0, Y0 + 0.65, wz + 0.2), (35, 0, 0)))
    # corda da talha até o bloco pendurado
    bx, bz = tip[0], tip[2]
    beam(mb, (mx + 0.55, Y0 + 0.85, wz), tip, 0.02, 0.02, 'rope')
    beam(mb, (bx, tip[1], bz), (bx, Y0 + 1.95, bz), 0.025, 0.025, 'rope')
    # linga e bloco aparelhado suspenso
    beam(mb, (bx, Y0 + 1.95, bz), (bx - 0.4, Y0 + 1.55, bz), 0.02, 0.02, 'rope')
    beam(mb, (bx, Y0 + 1.95, bz), (bx + 0.4, Y0 + 1.55, bz), 0.02, 0.02, 'rope')
    mb.add(prim_box(0.95, 0.6, 0.7, base=True), 'ashlar', M((bx, Y0 + 1.0, bz), (0, 12, 0)), bevel=0.04, smooth=0)
    mb.add(prim_box(1.0, 0.04, 0.05), 'rope', M((bx, Y0 + 1.5, bz)))
    return mb.build(mats, parent=root)


def build_yard(mats, root):
    """Blocos empilhados, bloco rachado com cunhas, carrinho de mão, escada, ferramentas, entulho."""
    mb = MeshBuilder('Yard')
    # pilha de blocos aparelhados (esquerda-frente)
    stack = [(-1.8, 1.25, 0, 0, 10), (-0.85, 1.35, 0, 0, -6), (-1.8, 1.25, 1, 0, -4), (-1.3, 1.3, 2, 0, 14), (-0.85, 1.35, 1, 0, 6)]
    for (x, z, lvl, _, r) in stack:
        mb.add(prim_box(0.95, 0.5, 0.65, base=True), 'ashlar', M((x, Y0 + lvl * 0.5, z), (0, r, 0)), bevel=0.04, smooth=0)
    mb.add(prim_box(0.9, 0.45, 0.6, base=True), 'cut_face', M((-1.3, Y0 + 1.0, 1.3), (0, 8, 0)), bevel=0.04, smooth=0)
    # bloco bruto sendo rachado: cunhas de ferro em linha e marteletas
    bx, bz = 0.35, 1.55
    mb.add(prim_box(1.3, 0.75, 0.85, taper=(0.95, 0.95), base=True), 'strata', M((bx, Y0, bz), (0, -12, 0)), bevel=0.06, smooth=0)
    for k in range(4):
        mb.add(prim_box(0.07, 0.16, 0.14, taper=(0.6, 1.0)), 'steel', M((bx - 0.45 + 0.3 * k, Y0 + 0.82, bz - 0.04 * k), (0, -12, 0)), bevel=0.005)
    mb.add(prim_box(0.02, 0.06, 1.0), 'dark', M((bx, Y0 + 0.76, bz), (0, -12, 0)))
    # marreta e cinzel
    log(mb, (0.95, Y0 + 0.08, 2.2), (1.55, Y0 + 0.1, 2.35), 0.035, 'wood_light', n=5)
    mb.add(prim_box(0.18, 0.12, 0.12), 'iron', M((0.92, Y0 + 0.1, 2.18), (0, 15, 0)), bevel=0.01)
    mb.add(prim_box(0.04, 0.04, 0.4), 'steel', M((0.2, Y0 + 0.04, 2.35), (0, 40, 0)))
    # carrinho de mão com entulho
    wx, wz = 2.15, 1.65
    T = M((wx, Y0, wz), (0, -35, 0))
    mb.add(prim_box(0.62, 0.3, 0.8, taper=(0.8, 0.85), base=True), 'wood', T @ M((0, 0.3, 0.0)), bevel=0.02)
    mb.add(prim_sphere(0.26, 0.14, 0.34, 6, 3, y_min=0.0), 'rubble', T @ M((0, 0.58, 0.0)), smooth=0)
    mb.add(prim_cyl(0.22, 0.22, 0.07, 10), 'wood_dark', T @ M((0, 0.22, 0.55), (0, 0, 90)), smooth=30)
    for sx in (-1, 1):
        mb.add(prim_box(0.05, 0.05, 0.85), 'wood_light', T @ M((sx * 0.22, 0.42, -0.62), (-8, 0, 0)))
        mb.add(prim_box(0.05, 0.3, 0.05, base=True), 'wood_light', T @ M((sx * 0.22, 0.0, -0.95)))
    # escada de madeira encostada no patamar
    lx, lz = 0.2, -0.45
    for sx in (-1, 1):
        beam(mb, (lx + sx * 0.28, Y0, lz + 0.35), (lx + sx * 0.28, Y0 + 1.55, lz - 0.1), 0.06, 0.05, 'wood')
    for k in range(6):
        t = (k + 0.5) / 6
        mb.add(prim_box(0.6, 0.045, 0.06), 'wood_light', M((lx, Y0 + 1.55 * t, lz + 0.35 - 0.45 * t)))
    # barril com cunhas e cesto de lascas
    barrel(mb, 2.55, Y0, 0.9, 0.26, 0.6, 'wood_dark', 'iron')
    # entulho: lascas e blocos pequenos espalhados
    for k in range(14):
        a = k * 2.4
        mb.add(prim_sphere(0.09 + 0.03 * (k % 3), 0.06, 0.08, 4, 3), 'rubble',
               M((1.2 * math.cos(a) * 1.5, Y0 + 0.04, 1.2 + 1.1 * math.sin(a * 1.1) + 0.5), (0, k * 40, 0)), smooth=0)
    mb.add(prim_sphere(0.7, 0.36, 0.55, 7, 3, y_min=0.0), 'rubble', M((-2.3, Y0, 0.6), (0, 20, 0)), smooth=0)
    mb.add(prim_sphere(0.55, 0.3, 0.5, 7, 3, y_min=0.0), 'rubble', M((1.0, Y0, -1.2), (0, -15, 0)), smooth=0)
    return mb.build(mats, parent=root)


def main():
    args = C.script_args()
    C.reset_scene()
    mats = C.make_paint_set(PALETTE)
    root = C.make_empty('StoneQuarry')
    parts = [build_base(mats, root), build_cliffs(mats, root), build_derrick(mats, root), build_yard(mats, root)]
    finish_building(root, 'stone_quarry', 'stone_quarry.glb', 'stone_quarry_atlas', parts, None,
                    {'Base': 0.6, 'Cliffs': 1.2, 'Derrick': 0.9, 'Yard': 1.1},
                    TEAM_DEFAULT, args, spawn=(0, 0, 4.2), rally=(0, 0, 5.8), game_dist=70)


if __name__ == '__main__':
    main()
