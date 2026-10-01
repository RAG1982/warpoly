"""
build_arsonist.py — Incendiário orc (tipo interno `arsonist`) gerado 100% por script.

Uso:
  blender -b --factory-startup --python tools/blender/build_arsonist.py -- [--no-render]

Hierarquia PLANA + Fuse (igual a ArsonistModel.js procedural / SapperModel.js):
  Arsonist (raiz)
  ├─ Torso   pivô (0, 1.05, 0)   peito nu e cicatrizado, arnês, faixa de time, rack de 3 botijas de óleo
  │  └─ Fuse pivô no topo do rack: pavio + chama (pisca)
  ├─ Head    pivô (0, 1.58, 0.1)  quepe de couro com espigões, óculos de solda, presas; rosto só em +Z
  ├─ ArmL / ArmR  pivô (∓0.58, 1.26, 0)
  └─ LegL / LegR  pivô (∓0.19, 0.66, 0)
"""
import os
import sys
import math

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mathutils import Vector, Matrix  # noqa: E402
import common as C  # noqa: E402
from common import (MeshBuilder, M, prim_box, prim_rings, ring_h, prim_cyl, prim_cone,  # noqa: E402
                    prim_sphere, prim_extrude, limb_rings, bezier)
from unit_common import orient, cloth_panel, tube, fist, finish_unit  # noqa: E402

TORSO_PIVOT = (0.0, 1.05, 0.0)
HEAD_PIVOT = (0.0, 1.58, 0.12)
ARM_PIVOT = (0.60, 1.26, 0.0)
LEG_PIVOT = (0.20, 0.66, 0.0)
FUSE_POS = (0.0, 0.44, -0.5)
TEAM_DEFAULT = '#d23a2c'

PALETTE = {
    'team': dict(base='#b8b0a4', var='#9d9589', var_scale=5.0, fine=0.08, top=0.25,
                 edge='#d8d2c8', edge_amt=0.3, edge_r=0.03, ao=(0.3, 0.65), team=True),
    'skin': dict(base='#6ba23a', var='#4f8228', var_scale=4.0, var_amt=0.65, fine=0.06, top=0.25,
                 grad=(0.0, 2.4, 0.25), edge='#a8d86a', edge_amt=0.4, edge_r=0.025, ao=(0.28, 0.65)),
    'skin_dark': dict(base='#3f6a22', var='#2f521a', var_scale=4.0, fine=0.05, top=0.2, ao=(0.25, 0.6)),
    'scar': dict(base='#8a4a3a', var='#6a3a2c', var_scale=6.0, fine=0.08, top=0.3),
    'soot': dict(base='#2e3a22', var='#1e2816', var_scale=8.0, var_amt=0.9, fine=0.1, top=0.2),
    'leather': dict(base='#5a3720', var='#3a2210', var_scale=6.0, fine=0.14, top=0.25,
                    edge='#9a6c40', edge_amt=0.55, edge_r=0.02, ao=(0.25, 0.65)),
    'leather_dark': dict(base='#31200f', var='#1f1208', var_scale=6.0, fine=0.12, top=0.2,
                         edge='#6a4a2a', edge_amt=0.5, edge_r=0.02, ao=(0.25, 0.65)),
    'pants': dict(base='#4a2f26', var='#2c1b15', var_scale=4.0, var_amt=0.9, fine=0.14, top=0.2, ao=(0.3, 0.6),
                  grad=(0.0, 1.2, 0.35)),
    'iron': dict(base='#33373f', var='#22252b', var_scale=7.0, var_amt=0.8, fine=0.16, top=0.35,
                 edge='#a9b0be', edge_amt=0.9, edge_r=0.022, edge_gain=12.0, ao=(0.25, 0.55)),
    'rust': dict(base='#6b4a38', var='#9a5a2c', var_scale=7.0, var_amt=0.9, fine=0.22, fine_scale=30.0, top=0.35,
                 edge='#cfa87a', edge_amt=0.6, edge_r=0.02, ao=(0.25, 0.65)),
    'bone': dict(base='#e8dcb8', var='#bfaf80', var_scale=5.0, var_amt=0.8, fine=0.08, top=0.25,
                 edge='#fff8e0', edge_amt=0.5, edge_r=0.02, ao=(0.2, 0.6)),
    'wood': dict(base='#5d3d22', var='#3d2612', var_scale=5.0, fine=0.1, coord='object',
                 streaks=(40.0, 2.0, 0.25), top=0.25, edge='#9a7048', edge_amt=0.4, edge_r=0.015, ao=(0.2, 0.5)),
    'glass': dict(base='#2e4128', var='#1d2a1a', var_scale=4.0, top=0.5, edge='#9ac08a', edge_amt=0.7, edge_r=0.02),
    'oil': dict(base='#ff8a1a', var='#ff5a0a', var_scale=3.0, var_amt=0.9, emit_boost=1.2, top=0.3),
    'lens': dict(base='#ff7a1a', var='#ffb02a', var_scale=10.0, emit_boost=1.35, top=0.4),
    'cork': dict(base='#a8844e', var='#7e5f33', var_scale=8.0, top=0.2),
    'eye': dict(base='#ffd23a', var='#ff9b1a', var_scale=20.0, emit_boost=1.4),
    'mouth': dict(base='#2a1512', var='#1a0d0b'),
    'rope': dict(base='#a98a58', var='#7a6030', var_scale=10.0, fine=0.12, top=0.2),
    'spark': dict(base='#ffd23a', var='#ff8a1a', var_scale=6.0, emit_boost=1.4),
    'ember': dict(base='#ff6a14', var='#ff3a08', var_scale=6.0, emit_boost=1.3),
    'wax': dict(base='#c8322a', var='#8c1c16', var_scale=8.0, top=0.45),
}


def flask(mb, T, r, h, mat_glass='glass'):
    """Botija de vidro escuro cheia de óleo brilhante, cinta de ferro e rolha com pano."""
    prof = [(0.0, 0.7), (0.12, 0.95), (0.55, 1.0), (0.85, 0.7), (1.0, 0.3)]
    rings = [ring_h(-h / 2 + t * h, rr * r, rr * r, 10) for t, rr in prof]
    mb.add(prim_rings(rings), 'oil', T, smooth=65, mat_fn=lambda c, n: mat_glass if (c[1] - T.translation[1] > h * 0.28 or c[1] - T.translation[1] < -h * 0.46) else None)
    mb.add(prim_cyl(r * 1.04, r * 1.04, 0.035, 10, base=False), 'iron', T @ M((0, -h * 0.28, 0)), smooth=30)
    mb.add(prim_cyl(r * 0.98, r * 0.98, 0.035, 10, base=False), 'iron', T @ M((0, h * 0.2, 0)), smooth=30)
    mb.add(prim_cyl(r * 0.34, r * 0.34, 0.1, 7, base=False), 'cork', T @ M((0, h * 0.5 + 0.04, 0)), smooth=40)
    mb.add(prim_cyl(0.012, 0.012, 0.1, 4), 'rope', T @ M((0, h * 0.5 + 0.09, 0)))


def build_torso(mats, root):
    mb = MeshBuilder('Torso')
    body = [ring_h(-0.30, 0.40, 0.30, 12), ring_h(-0.10, 0.42, 0.31, 12, cz=0.02), ring_h(0.10, 0.52, 0.34, 12, cz=0.05),
            ring_h(0.28, 0.62, 0.36, 12, cz=0.06), ring_h(0.38, 0.5, 0.29, 12, cz=0.02), ring_h(0.45, 0.24, 0.19, 12, cz=0.06)]
    mb.add(prim_rings(body), 'skin', smooth=68, mat_fn=lambda c, n: 'pants' if c[1] < -0.2 else None)
    for sx in (-1, 1):  # peitorais, abdômen
        mb.add(prim_sphere(0.22, 0.15, 0.12, 8, 3), 'skin', M((sx * 0.2, 0.2, 0.34), (8, sx * 12, sx * -8)), smooth=70)
    for k in range(3):
        for sx in (-1, 1):
            mb.add(prim_sphere(0.1, 0.06, 0.06, 6, 3), 'skin', M((sx * 0.09, 0.0 - k * 0.11, 0.33)), smooth=70)
    # cicatrizes de queimadura e riscos de fuligem no peito
    for (x, y, a) in ((-0.2, 0.28, 30), (0.22, 0.06, -35), (-0.1, -0.08, 15)):
        mb.add(prim_box(0.025, 0.2, 0.012), 'scar', M((x, y, 0.435 if y > 0.1 else 0.38), (0, 0, a)))
    # arnês de couro em X com argolas e rebites de ferro
    for sg in (-1, 1):
        pts = [(sg * 0.38, 0.4, 0.2), (sg * 0.12, 0.2, 0.37), (-sg * 0.14, -0.05, 0.37), (-sg * 0.38, -0.24, 0.2)]
        tube(mb, pts, [0.04, 0.04, 0.04, 0.04], 'leather', n=4, smooth=0)
    mb.add(prim_cyl(0.09, 0.09, 0.04, 10, base=False), 'iron', M((0, 0.08, 0.385), (90, 0, 0)), smooth=30)
    mb.add(prim_sphere(0.05, 0.05, 0.03, 6, 3), 'rust', M((0, 0.08, 0.41)), smooth=60)
    # vials pequenos de óleo no arnês (bandoleira)
    for k in range(4):
        t = k / 3.0
        x = -0.28 + 0.56 * t
        y = 0.3 - 0.4 * t
        flask(mb, M((x, y, 0.4 + 0.0), (-6, 0, 0)), 0.04, 0.16)
    # ombreiras: esquerda de ferro com espinhos, direita de couro com crânio pequeno
    for sx in (-1, 1):
        mat = 'iron' if sx < 0 else 'leather'
        mb.add(prim_sphere(0.27, 0.15, 0.26, 10, 3, y_min=0.0), mat, M((sx * 0.56, 0.38, 0.0), (0, 0, -sx * 20)), smooth=45)
        mb.add(prim_cyl(0.275, 0.272, 0.04, 10), 'rust', M((sx * 0.56, 0.37, 0.0), (0, 0, -sx * 20)), smooth=30)
        for k in range(3):
            mb.add(prim_cone(0.05, 0.2 - 0.03 * k, 5), 'bone' if sx > 0 else 'iron', M((sx * (0.5 + 0.09 * k), 0.5 - 0.05 * k, -0.08 + 0.08 * k), (0, 0, -sx * (24 + 13 * k))))
    # faixa de time na cintura + tiras penduradas, cinto largo com fivela de caveira
    mb.add(prim_rings([ring_h(-0.3, 0.405, 0.305, 12), ring_h(-0.1, 0.425, 0.315, 12, cz=0.02)]), 'leather_dark', smooth=40)
    mb.add(prim_box(0.18, 0.14, 0.06), 'iron', M((0, -0.2, 0.33)), bevel=0.012)
    mb.add(prim_sphere(0.05, 0.055, 0.03, 6, 3), 'bone', M((0, -0.2, 0.37)), smooth=60)
    mb.add(prim_rings([ring_h(-0.1, 0.43, 0.32, 12, cz=0.02), ring_h(-0.04, 0.44, 0.325, 12, cz=0.02)], cap0=False, cap1=False), 'team', smooth=40)
    for k, x in enumerate((-0.26, -0.08, 0.1, 0.28)):
        L = 0.5 + 0.1 * (k % 2)
        mb.add(cloth_panel((x - 0.08, -0.28, 0.31), (x + 0.08, -0.28, 0.31), (x - 0.09, -0.28 - L, 0.36), (x + 0.09, -0.28 - L, 0.36),
                           nx=2, ny=3, thick=0.035, wave=0.02, jag=0.05), 'team' if k % 2 == 0 else 'leather_dark', smooth=45)
    mb.add(cloth_panel((0.2, -0.28, -0.3), (-0.2, -0.28, -0.3), (0.22, -0.78, -0.36), (-0.22, -0.78, -0.36),
                       nx=3, ny=3, thick=0.035, wave=0.03, jag=0.07), 'team', smooth=45)
    # rack nas costas: estrutura de madeira e ferro com 3 botijas grandes + tampa
    mb.add(prim_box(0.76, 0.1, 0.08), 'wood', M((0, -0.2, -0.38)), bevel=0.01)
    mb.add(prim_box(0.76, 0.1, 0.08), 'wood', M((0, 0.3, -0.38)), bevel=0.01)
    for sx in (-1, 1):
        mb.add(prim_box(0.09, 0.9, 0.08), 'wood', M((sx * 0.38, 0.05, -0.38)), bevel=0.01)
        mb.add(prim_box(0.07, 0.07, 0.34), 'iron', M((sx * 0.38, 0.3, -0.2)))
    for k, x in enumerate((-0.23, 0.0, 0.23)):
        flask(mb, M((x, 0.05, -0.5 + (0.04 if k == 1 else 0.0))), 0.15, 0.56)
    mb.add(prim_box(0.8, 0.045, 0.16), 'iron', M((0, 0.44, -0.46)), bevel=0.008)
    # cinto de correia sobre os ombros prendendo o rack
    for sx in (-1, 1):
        mb.add(prim_box(0.085, 0.8, 0.04), 'leather_dark', M((sx * 0.3, 0.1, -0.22)), bevel=0.006)
    return mb.build(mats, parent=root, location=TORSO_PIVOT)


def build_fuse(mats, torso):
    mb = MeshBuilder('Fuse')
    tube(mb, [(0, 0, 0), (0.0, 0.06, -0.02), (0.03, 0.12, -0.01), (0.02, 0.18, 0.02)], [0.018, 0.018, 0.015, 0.012], 'rope', n=5, smooth=40)
    mb.add(prim_cone(0.09, 0.2, 5), 'spark', M((0.02, 0.18, 0.02)), smooth=0)
    mb.add(prim_cone(0.09, 0.1, 5), 'spark', M((0.02, 0.18, 0.02), (180, 0, 0)), smooth=0)
    mb.add(prim_cone(0.055, 0.2, 4), 'ember', M((0.09, 0.18, 0.0), (0, 0, -35)), smooth=0)
    mb.add(prim_cone(0.05, 0.18, 4), 'ember', M((-0.06, 0.2, 0.05), (20, 0, 35)), smooth=0)
    return mb.build(mats, parent=torso, location=FUSE_POS)


def build_head(mats, root):
    mb = MeshBuilder('Head')
    rings = [ring_h(-0.1, 0.19, 0.19, 12, cz=0.06), ring_h(0.0, 0.225, 0.23, 12, cz=0.04), ring_h(0.1, 0.215, 0.225, 12, cz=0.02),
             ring_h(0.2, 0.17, 0.18, 12, cz=0.0), ring_h(0.26, 0.08, 0.09, 12)]
    mb.add(prim_rings(rings), 'skin', smooth=70)
    # mandíbula saliente (underbite) e presas curvas
    mb.add(prim_box(0.38, 0.17, 0.3, taper=(0.92, 0.85)), 'skin', M((0, -0.13, 0.12), (-8, 0, 0)), bevel=0.04, bevel_segments=2, smooth=45)
    mb.add(prim_box(0.24, 0.05, 0.06), 'mouth', M((0, -0.07, 0.27)))
    for sx in (-1, 1):
        mb.add(prim_box(0.04, 0.04, 0.03), 'bone', M((sx * 0.055, -0.055, 0.3)), bevel=0.008)
        path = [(sx * 0.13, -0.11, 0.26), (sx * 0.155, 0.02, 0.33), (sx * 0.17, 0.12, 0.31)]
        mb.add(prim_rings(limb_rings(path, [0.052, 0.036, 0.007], 6), cap1=False), 'bone', smooth=70)
        # sobrancelhas severas, olhos acesos atrás das lentes
        mb.add(prim_box(0.2, 0.06, 0.1, taper=(0.9, 0.7)), 'skin_dark', M((sx * 0.1, 0.115, 0.21), (14, 0, sx * 20)), bevel=0.02)
        mb.add(prim_sphere(0.045, 0.022, 0.025, 6, 3), 'eye', M((sx * 0.095, 0.075, 0.225), (0, 0, sx * 14)), smooth=80)
        # orelhas pontudas
        pth = [(sx * 0.22, 0.05, 0.02), (sx * 0.34, 0.1, -0.02), (sx * 0.46, 0.17, -0.08)]
        mb.add(prim_rings(limb_rings(pth, [(0.07, 0.025), (0.05, 0.018), (0.006, 0.006)], 5)), 'skin', smooth=60)
    mb.add(prim_box(0.17, 0.09, 0.08, taper=(0.45, 0.5)), 'skin', M((0, -0.02, 0.27), (-15, 0, 0)), bevel=0.02)
    # óculos de solda: aros de ferro, lentes laranja brilhantes, tira de couro
    for sx in (-1, 1):
        G = M((sx * 0.1, 0.075, 0.235))
        mb.add(prim_cyl(0.075, 0.075, 0.06, 10, base=False), 'iron', G @ M(r=(90, 0, 0)), smooth=30)
        mb.add(prim_cyl(0.058, 0.058, 0.04, 10, base=False), 'lens', G @ M((0, 0, 0.022), (90, 0, 0)), smooth=30)
        mb.add(prim_cyl(0.082, 0.082, 0.02, 10, base=False), 'rust', G @ M((0, 0, 0.0), (90, 0, 0)), smooth=30)
    mb.add(prim_box(0.1, 0.03, 0.04), 'iron', M((0, 0.075, 0.24)))
    mb.add(prim_rings([ring_h(0.04, 0.23, 0.235, 12, cz=0.02), ring_h(0.1, 0.228, 0.23, 12, cz=0.02)], cap0=False, cap1=False), 'leather_dark', smooth=30)
    # quepe de couro com espigões e remendos (sem cobrir o rosto)
    mb.add(prim_sphere(0.235, 0.17, 0.235, 12, 4, y_min=0.0), 'leather', M((0, 0.16, 0.0)), smooth=50)
    mb.add(prim_cyl(0.245, 0.24, 0.05, 12), 'leather_dark', M((0, 0.15, 0.0)), smooth=30)
    for k in range(3):
        mb.add(prim_cone(0.035, 0.15 - 0.02 * abs(k - 1), 5), 'iron', M((0, 0.32, -0.12 + 0.12 * k), (0, 0, 0)))
    mb.add(prim_box(0.1, 0.14, 0.02), 'rust', M((-0.12, 0.28, 0.14), (0, 20, 10)))
    for sx in (-1, 1):
        mb.add(prim_box(0.05, 0.24, 0.16, taper=(0.9, 0.9)), 'leather', M((sx * 0.225, -0.05, -0.0)), bevel=0.01)
    return mb.build(mats, parent=root, location=HEAD_PIVOT)


def build_arm(mats, root, side):
    s = side
    mb = MeshBuilder('ArmR' if s > 0 else 'ArmL')
    sh = Vector((0.0, -0.1, 0.0))
    e = Vector((s * 0.06, -0.37, 0.03))
    w = Vector((s * 0.08, -0.64, 0.12))
    tube(mb, [tuple(sh), tuple(sh.lerp(e, 0.45)), tuple(e)], [0.16, 0.18, 0.15], 'skin', n=9)
    mb.add(prim_sphere(0.155, 0.15, 0.15, 8, 4), 'skin', M(tuple(e)), smooth=65)
    d = (w - e).normalized()
    tube(mb, [tuple(e), tuple(e.lerp(w, 0.4)), tuple(w)], [0.14, 0.155, 0.105], 'skin', n=9)
    # braçadeira de ferro chamuscada com espetos + atadura
    mb.add(prim_cyl(0.165, 0.125, 0.2, 9), 'iron', Matrix.Translation(e.lerp(w, 0.62)) @ orient(d), smooth=35, bevel=0.01)
    mb.add(prim_cone(0.04, 0.15, 5), 'rust', Matrix.Translation(e.lerp(w, 0.6) + Vector((s * 0.14, 0, 0.0))) @ orient((s, 0.1, 0)))
    mb.add(prim_cyl(0.18, 0.18, 0.05, 9), 'leather', Matrix.Translation(sh.lerp(e, 0.55)) @ orient(e - sh), smooth=30)
    mb.add(prim_cone(0.03, 0.1, 4), 'iron', Matrix.Translation(sh.lerp(e, 0.55) + Vector((s * 0.17, 0, 0.0))) @ orient((s, 0, 0)))
    Tw = Matrix.Translation(w + d * 0.01) @ orient(d)
    fist(mb, Tw, 1.5, 'leather_dark', glove='leather_dark', knuckle='iron')
    mb.add(prim_cyl(0.13, 0.13, 0.05, 9), 'iron', Tw @ M((0, 0.0, 0.0)), smooth=30)
    return mb.build(mats, parent=root, location=(s * ARM_PIVOT[0], ARM_PIVOT[1], ARM_PIVOT[2]))


def build_leg(mats, root, side):
    s = side
    mb = MeshBuilder('LegR' if s > 0 else 'LegL')
    th = [(0, 0.0, 0), (s * 0.005, -0.2, 0.02), (s * 0.01, -0.38, 0.03)]
    tube(mb, th, [(0.19, 0.2), (0.185, 0.2), (0.15, 0.16)], 'pants', n=9)
    mb.add(prim_box(0.17, 0.12, 0.06), 'iron', M((s * 0.01, -0.4, 0.14)), bevel=0.012)
    mb.add(prim_cone(0.04, 0.1, 5), 'iron', M((s * 0.01, -0.4, 0.22), (90, 0, 0)))
    sh = [(s * 0.012, -0.42, 0.03), (s * 0.016, -0.54, 0.015), (s * 0.02, -0.64, 0.0)]
    tube(mb, sh, [(0.14, 0.15), (0.14, 0.15), (0.115, 0.12)], 'pants', n=9)
    mb.add(prim_cyl(0.15, 0.145, 0.25, 10), 'leather_dark', M((s * 0.018, -0.66, 0.0)), smooth=40)
    mb.add(prim_box(0.24, 0.1, 0.36, taper=(0.82, 0.58), base=True), 'leather', M((s * 0.02, -0.71, 0.08)), bevel=0.02, smooth=35)
    for k in range(3):
        mb.add(prim_cone(0.03, 0.09, 4), 'iron', M((s * 0.02 + (k - 1) * 0.06, -0.66, 0.3), (90, 0, 0)))
    mb.add(prim_cyl(0.155, 0.155, 0.025, 10), 'rust', M((s * 0.018, -0.5, 0.0)), smooth=30)
    return mb.build(mats, parent=root, location=(s * LEG_PIVOT[0], LEG_PIVOT[1], LEG_PIVOT[2]))


def main():
    args = C.script_args()
    C.reset_scene()
    mats = C.make_paint_set(PALETTE)
    root = C.make_empty('Arsonist')
    torso = build_torso(mats, root)
    fuse = build_fuse(mats, torso)
    head = build_head(mats, root)
    arm_l = build_arm(mats, root, -1)
    arm_r = build_arm(mats, root, 1)
    leg_l = build_leg(mats, root, -1)
    leg_r = build_leg(mats, root, 1)
    parts = [torso, fuse, head, arm_l, arm_r, leg_l, leg_r]
    finish_unit('arsonist', 'arsonist.glb', 'arsonist_atlas', root, parts,
                {'Head': 1.7, 'Torso': 1.2, 'Fuse': 0.8, 'LegL': 0.8, 'LegR': 0.8, 'ArmL': 1.0, 'ArmR': 1.0},
                TEAM_DEFAULT, args, cam_h=2.0)


if __name__ == '__main__':
    main()
