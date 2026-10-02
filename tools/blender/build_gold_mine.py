"""
build_gold_mine.py — Mina de Ouro (depósito neutro `gold`, `ResourceDepositView`) gerada 100% por script.

Uso:
  blender -b --factory-startup --python tools/blender/build_gold_mine.py -- [--no-render]

Saída (public/models/gold_mine.glb), coordenadas do jogo, origem no centro da base, frente = +Z:
  GoldMine (raiz)
  ├─ Static_Mesh   morro de rocha escura em ferradura com veios e cristas de ouro, portal de vigas de carvalho
  │                com dossel de tábuas e túnel negro, trilhos com dormentes, vagoneta transbordando de pepitas,
  │                lanterna acesa, caixotes de minério, barril, picaretas, pá e pepitas espalhadas (Atlas)
  ├─ Socket_UnitSpawn / Socket_Rally   (convenção dos edifícios)
Neutra: sem cor de time. Pegada ~6,8 (raio de colisão 3,4), altura ~4,6. 1 draw call.
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
from bld_house import polar, arch_poly, barrel, crate, lantern  # noqa: E402
import bld_orc as O  # noqa: E402
import build_ogre_den as D  # noqa: E402

Y0 = 0.30
TEAM_DEFAULT = '#808080'

PALETTE = dict(D.PALETTE)
PALETTE.update(O.ORC_EXTRAS)
PALETTE['wood'] = dict(PALETTE['log_light'])
PALETTE.update({
    'crag': dict(D.ROCK, pattern=None, base='#403d3a', var='#262321', var_scale=1.1, var_amt=1.0, fine=0.22, edge='#8a8176', edge_amt=0.5),
    'crag_light': dict(D.ROCK, pattern=None, base='#645f58', var='#403c36', var_scale=1.4, var_amt=1.0, fine=0.2, edge='#a29a8c', edge_amt=0.5),
    'gold': dict(base='#f0b41a', var='#c98a08', var_scale=6.0, var_amt=0.9, fine=0.1, top=0.55, edge='#fff0a0',
                 edge_amt=0.9, edge_r=0.03, ao=(0.3, 0.4), emit_boost=0.28),
    'gold_vein': dict(base='#ffcf3a', var='#e09a10', var_scale=8.0, var_amt=0.8, top=0.6, edge='#fff6c0',
                      edge_amt=0.8, edge_r=0.02, emit_boost=0.4),
    'tunnel': dict(base='#0b0908', var='#050404'),
    'rail': dict(base='#6d6c74', var='#4a4950', var_scale=4.0, fine=0.08, top=0.4, edge='#c8c8d0', edge_amt=0.7,
                 edge_r=0.015, ao=(0.4, 0.5)),
    'gravel': dict(base='#6b6258', var='#4a4238', var_scale=18.0, var_amt=0.9, fine=0.22, top=0.2, ao=(0.8, 0.8)),
})


def build_base(mats, root):
    mb = MeshBuilder('Base')
    mb.add(prim_cyl(3.45, 3.3, Y0, 16, base=True), 'crag', bevel=0.07, smooth=0)
    mb.add(prim_cyl(3.25, 3.25, 0.05, 16, base=True), 'gravel', M((0, Y0, 0.15)), smooth=0)
    return mb.build(mats, parent=root)


def build_mountain(mats, root):
    """Morro em ferradura: massa central recuada, blocos facetados em volta, cristas e veios de ouro."""
    mb = MeshBuilder('Mountain')
    # massa central (recuada, deixa a frente livre para o portal)
    mb.add(prim_sphere(2.7, 3.0, 2.3, 10, 6, y_min=0.0), 'crag', M((0, Y0 - 0.1, -1.15), (0, 20, 0)), smooth=0)
    for k, (sx, sz, sh, sr) in enumerate(((-0.9, -1.0, 2.1, 0.75), (0.8, -1.7, 2.5, 0.85), (-0.2, -2.1, 1.9, 0.7),
                                         (1.4, -0.8, 1.5, 0.6), (-1.6, -1.8, 1.4, 0.6), (0.2, -0.9, 1.7, 0.6))):
        mb.add(prim_box(sr * 1.9, sh * 0.8, sr * 1.6, taper=(0.4, 0.45), shift=(0.1, 0.05), base=True), 'crag_light' if k % 2 else 'crag', M((sx, Y0 + 2.3 - 0.1 * k, sz), (0, k * 27, 5 * (k % 3 - 1))), bevel=0.1, smooth=0)
    # blocos facetados da ferradura (atrás e nos flancos), do mais baixo (flanco) ao mais alto (fundo)
    n = 11
    for k in range(n):
        a = 62 + (360 - 124) * k / (n - 1)
        ar = math.radians(a)
        r = 2.3 + 0.35 * math.sin(k * 2.1)
        h = 1.6 + 1.5 * (0.5 - 0.5 * math.cos(ar)) + 0.3 * math.sin(k * 1.9)
        x, z = polar(r, a)
        w = 1.0 + 0.25 * math.sin(k * 3.1)
        mat = 'crag_light' if k % 3 == 0 else 'crag'
        mb.add(prim_sphere(w, h * 0.62, w * 0.9, 7, 4, y_min=-0.1), mat, M((x, Y0 + 0.05, z * 0.92 - 0.2), (0, a * 1.7, 0)), smooth=0)
        # veio de ouro: lasca inclinada na face externa do bloco
        if k % 2 == 0:
            dx, dz = polar(w * 0.78, a)
            mb.add(prim_box(0.14, 0.55, 0.07), 'gold_vein', M((x + dx * 0.8, Y0 + h * 0.3, z * 0.92 - 0.2 + dz * 0.8), (0, a, 18 + 9 * k % 5)))
    # veios e pepitas em relevo na massa central e nos flancos
    veins = [(-1.8, 1.2, -0.6, 25, 20), (1.9, 1.7, -0.4, -30, -15), (0.5, 2.9, -2.45, 5, 10), (-1.1, 2.1, -2.5, 8, -25),
             (1.4, 2.6, -2.1, -20, 22), (-2.35, 0.9, -1.3, 70, 5), (2.4, 1.0, -1.2, -70, -8), (0.0, 0.8, -2.7, 0, 0)]
    for (x, y, z, ry, rz) in veins:
        T = M((x, Y0 + y, z), (0, ry, rz))
        mb.add(prim_box(0.16, 0.9, 0.1, taper=(0.5, 1.0)), 'gold_vein', T, bevel=0.01)
        mb.add(prim_box(0.12, 0.5, 0.08), 'gold', T @ M((0.16, -0.1, 0.0), (0, 0, 24)), bevel=0.01)
        mb.add(prim_sphere(0.15, 0.12, 0.13, 5, 3), 'gold', T @ M((-0.1, 0.35, 0.05)), smooth=0)
    # aglomerados de cristais de ouro brotando da rocha
    for (x, y, z, ry, tilt) in ((-1.4, 2.0, -0.2, 30, 38), (1.6, 1.4, 0.0, -35, -42), (-2.3, 1.1, -1.8, 100, 40), (2.2, 2.0, -1.5, -80, -35),
                                (0.8, 3.1, -2.2, 10, 25), (-0.6, 3.4, -1.4, -20, -20)):
        for j in range(4):
            a = 90 * j + ry
            mb.add(prim_cone(0.1 + 0.02 * (j % 2), 0.55 + 0.2 * (j % 3), 4), 'gold_vein' if j % 2 else 'gold',
                   M((x, Y0 + y, z), (tilt * math.cos(math.radians(a)), a, tilt * math.sin(math.radians(a)))), smooth=0)
    # pedregulhos soltos na frente, nos dois flancos
    for (x, z, s, r) in ((-2.7, 1.9, 0.62, 20), (2.6, 2.2, 0.7, -40), (-3.0, 0.4, 0.55, 70), (3.0, 0.9, 0.5, 5), (-1.9, 2.8, 0.4, 0)):
        mb.add(prim_sphere(s, s * 0.7, s * 0.85, 6, 3, y_min=-0.2), 'crag_light', M((x, Y0, z), (0, r, 0)), smooth=0)
    return mb.build(mats, parent=root)


def build_portal(mats, root):
    """Portal de vigas de carvalho, dossel de tábuas, túnel negro e escoras internas."""
    mb = MeshBuilder('Portal')
    zf = 0.75
    # túnel negro recuado no morro
    mb.add(prim_extrude(arch_poly(1.9, 2.15, 0.0, 6), 0.7, axis='z'), 'tunnel', M((0, Y0, zf - 0.55)))
    # moldura: dois montantes e uma verga com chapas de ferro
    for sx in (-1, 1):
        mb.add(prim_box(0.42, 2.45, 0.46, base=True), 'wood_dark', M((sx * 1.15, Y0, zf)), bevel=0.04)
        mb.add(prim_box(0.46, 0.14, 0.5), 'iron', M((sx * 1.15, Y0 + 0.4, zf)))
        mb.add(prim_box(0.46, 0.14, 0.5), 'iron', M((sx * 1.15, Y0 + 1.7, zf)))
        beam(mb, (sx * 1.15, Y0 + 1.5, zf + 0.2), (sx * 0.65, Y0 + 2.45, zf + 0.2), 0.2, 0.14, 'wood')   # mão-francesa
    mb.add(prim_box(2.9, 0.4, 0.52), 'wood', M((0, Y0 + 2.45, zf)), bevel=0.04)
    mb.add(prim_box(2.5, 0.12, 0.56), 'iron', M((0, Y0 + 2.6, zf)))
    # escoras internas em arco (3 quadros)
    for k, dz in enumerate((-0.05, -0.55, -1.05)):
        for sx in (-1, 1):
            mb.add(prim_box(0.2, 1.9, 0.2, base=True), 'wood', M((sx * 0.92, Y0, zf + dz - 0.2)), bevel=0.02)
        mb.add(prim_box(2.0, 0.2, 0.2), 'wood', M((0, Y0 + 1.95, zf + dz - 0.2)), bevel=0.02)
    # dossel: duas águas de tábuas sobre o portal
    for sx in (-1, 1):
        mb.add(prim_box(1.9, 0.12, 1.5), 'plank', M((sx * 0.85, Y0 + 3.05, zf - 0.1), (0, 0, -sx * 24)), bevel=0.02)
    mb.add(prim_box(0.2, 0.2, 1.6), 'wood_dark', M((0, Y0 + 3.45, zf - 0.1)), bevel=0.02)
    for sx in (-1, 1):
        mb.add(prim_box(0.14, 0.14, 1.55), 'wood_dark', M((sx * 1.7, Y0 + 2.7, zf - 0.1)), bevel=0.02)
    # placa de ouro pregada na verga
    mb.add(prim_box(0.7, 0.34, 0.06), 'gold', M((0, Y0 + 2.45, zf + 0.29)), bevel=0.01)
    mb.add(prim_sphere(0.1, 0.09, 0.08, 5, 3), 'gold_vein', M((0, Y0 + 2.45, zf + 0.34)), smooth=0)
    return mb.build(mats, parent=root)


def build_rails(mats, root):
    """Trilhos de aço sobre dormentes, parachoque, vagoneta com pepitas e pilha de minério."""
    mb = MeshBuilder('Rails')
    z0, z1 = 0.5, 3.1
    for k in range(8):
        z = z0 + 0.1 + k * 0.34
        mb.add(prim_box(1.15, 0.08, 0.17), 'wood_dark', M((0, Y0 + 0.05, z)), bevel=0.01)
    for sx in (-1, 1):
        beam(mb, (sx * 0.42, Y0 + 0.14, z0), (sx * 0.42, Y0 + 0.14, z1), 0.07, 0.07, 'rail')
    mb.add(prim_box(1.0, 0.16, 0.14), 'iron', M((0, Y0 + 0.2, z1 + 0.05)), bevel=0.02)   # parachoque
    mb.add(prim_box(0.12, 0.34, 0.12), 'iron', M((-0.4, Y0 + 0.2, z1 + 0.05)))
    mb.add(prim_box(0.12, 0.34, 0.12), 'iron', M((0.4, Y0 + 0.2, z1 + 0.05)))
    # vagoneta
    cz = 1.85
    T = M((0, Y0 + 0.4, cz))
    mb.add(prim_box(0.98, 0.62, 1.25, taper=(0.82, 0.82), base=True), 'wood', T, bevel=0.03)
    mb.add(prim_box(1.0, 0.07, 1.27), 'iron', T @ M((0, 0.6, 0)), bevel=0.01)
    mb.add(prim_box(1.02, 0.07, 1.27), 'iron', T @ M((0, 0.22, 0)), bevel=0.01)
    for sz in (-1, 1):
        mb.add(prim_box(0.08, 0.64, 0.1, base=True), 'iron', T @ M((0.5, 0, sz * 0.45)))
        mb.add(prim_box(0.08, 0.64, 0.1, base=True), 'iron', T @ M((-0.5, 0, sz * 0.45)))
        for sx in (-1, 1):
            mb.add(prim_cyl(0.19, 0.19, 0.08, 10), 'iron', T @ M((sx * 0.46, -0.08, sz * 0.38), (0, 0, 90)), smooth=30)
    # pepitas: monte sobre a vagoneta
    mb.add(prim_sphere(0.46, 0.34, 0.6, 8, 4, y_min=0.0), 'gold', T @ M((0, 0.6, 0)), smooth=0)
    for k in range(14):
        a = k * 2.4
        mb.add(prim_sphere(0.1, 0.08, 0.09, 4, 3), 'gold_vein' if k % 3 == 0 else 'gold',
               T @ M((0.34 * math.cos(a) * (0.5 + 0.5 * math.sin(k)), 0.85 + 0.12 * (k % 3), 0.5 * math.sin(a) * 0.9), (0, k * 37, 0)), smooth=0)
    # pilha de minério ao lado dos trilhos
    mb.add(prim_sphere(0.55, 0.34, 0.5, 7, 3, y_min=0.0), 'crag_light', M((1.55, Y0, 1.35), (0, 20, 0)), smooth=0)
    for k in range(6):
        a = k * 1.9
        mb.add(prim_sphere(0.12, 0.1, 0.11, 4, 3), 'gold', M((1.55 + 0.35 * math.cos(a), Y0 + 0.28 + 0.1 * (k % 2), 1.35 + 0.3 * math.sin(a))), smooth=0)
    return mb.build(mats, parent=root)


def build_props(mats, root):
    mb = MeshBuilder('Props')
    # poste com lanterna acesa
    px, pz = -1.85, 1.15
    log(mb, (px, Y0, pz), (px, Y0 + 2.5, pz), 0.08, 'wood_dark', n=6)
    beam(mb, (px, Y0 + 2.45, pz), (px + 0.45, Y0 + 2.45, pz), 0.07, 0.07, 'wood_dark')
    beam(mb, (px, Y0 + 1.9, pz), (px + 0.3, Y0 + 2.4, pz), 0.05, 0.05, 'wood_dark')
    lantern(mb, M((px + 0.45, Y0 + 2.2, pz)), 'window', 'iron')
    # caixotes de minério com ouro e barril
    crate(mb, -1.6, Y0, 2.15, 0.62, 12, 'wood', 'wood_dark')
    mb.add(prim_sphere(0.24, 0.12, 0.24, 6, 3, y_min=0.0), 'gold', M((-1.6, Y0 + 0.6, 2.15)), smooth=0)
    crate(mb, -2.2, Y0, 1.75, 0.5, -20, 'wood_light', 'wood_dark')
    crate(mb, -1.85, Y0 + 0.62, 2.1, 0.46, 30, 'wood_light', 'wood_dark')
    barrel(mb, 2.2, Y0, 2.4, 0.3, 0.7, 'wood_dark', 'iron')
    barrel(mb, 2.75, Y0, 1.9, 0.26, 0.6, 'wood', 'iron')
    # picaretas encostadas e pá
    for (x, z, ry) in ((-0.95, 1.55, 15), (2.15, 0.45, -25)):
        log(mb, (x, Y0, z), (x + 0.25, Y0 + 1.35, z), 0.04, 'wood_light', n=5)
        mb.add(prim_box(0.62, 0.07, 0.07, taper=(0.4, 1.0)), 'steel', M((x + 0.25, Y0 + 1.37, z), (0, ry, 12)), bevel=0.01)
    log(mb, (1.05, Y0, 1.45), (1.2, Y0 + 1.3, 1.4), 0.035, 'wood_light', n=5)
    mb.add(prim_box(0.28, 0.34, 0.03, taper=(0.7, 1.0)), 'steel', M((1.04, Y0 + 0.17, 1.46)), bevel=0.005)
    # pepitas espalhadas no chão
    for k in range(9):
        a = k * 2.2
        mb.add(prim_sphere(0.09, 0.07, 0.08, 4, 3), 'gold', M((0.9 * math.cos(a) * 1.6, Y0 + 0.05, 2.3 + 0.5 * math.sin(a * 1.3))), smooth=0)
    return mb.build(mats, parent=root)


def main():
    args = C.script_args()
    C.reset_scene()
    mats = C.make_paint_set(PALETTE)
    root = C.make_empty('GoldMine')
    parts = [build_base(mats, root), build_mountain(mats, root), build_portal(mats, root),
             build_rails(mats, root), build_props(mats, root)]
    finish_building(root, 'gold_mine', 'gold_mine.glb', 'gold_mine_atlas', parts, None,
                    {'Base': 0.6, 'Mountain': 1.2, 'Portal': 1.2, 'Rails': 1.0, 'Props': 0.9},
                    TEAM_DEFAULT, args, spawn=(0, 0, 4.4), rally=(0, 0, 6.0), game_dist=70)


if __name__ == '__main__':
    main()
