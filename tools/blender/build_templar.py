"""
build_templar.py — Templário (tipo interno `templar`, classe avançada da cavalaria humana) gerado por script.

Reaproveita `build_cavalier.py` (cavalo + cavaleiro do Espadachim) com a MESMA rig e os MESMOS nomes de nós
(Horse, HorseLegFL/FR/BL/BR, Torso, Head, ArmL, ArmR, Sword, ShieldGroup), mudando só tinta e adornos:
armadura branca com frisos de ouro vivo, cavalo branco, tabardo de time com emblema de luz (sol de 8 raios),
elmo com crista alta de plumas brancas e disco solar na testa (frente, +Z). O emblema do tabardo fica atrás do pescoço do cavalo
na câmera RTS (de frente e de cima), então o sol também aparece onde se vê: no escudo (cruz + 4 raios diagonais = sol de 8 raios com
núcleo luminoso) e no peitoral do cavalo (medalhão com 8 raios), ambos voltados para +Z.

Uso:
  blender -b --factory-startup --python tools/blender/build_templar.py -- [--no-render]
Saída: public/models/templar.glb (raiz `Templar`).
"""
import os
import sys
import math

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mathutils import Vector  # noqa: E402
import common as C  # noqa: E402
from common import (MeshBuilder, M, prim_box, prim_cyl, prim_cone, prim_sphere, prim_extrude, bezier)  # noqa: E402
from bld_common import tube  # noqa: E402
import build_cavalier as CAV  # noqa: E402

CAV.PALETTE.update({
    'steel': dict(base='#e4e9f2', var='#aeb9cf', var_scale=7.0, var_amt=0.6, fine=0.05, top=0.4,
                  edge='#ffffff', edge_amt=1.0, edge_r=0.02, edge_gain=12.0, ao=(0.25, 0.55), grad=(0.0, 2.0, 0.18)),
    'steel_hi': dict(base='#fbfcff', var='#dfe6f3', var_scale=8.0, fine=0.04, top=0.4, edge='#ffffff', edge_amt=1.0,
                     edge_r=0.015, edge_gain=12.0, ao=(0.2, 0.45)),
    'steel_dark': dict(base='#8e9bb6', var='#6a7893', var_scale=6.0, fine=0.08, top=0.3, edge='#e4ebf8', edge_amt=0.9,
                       edge_r=0.02, edge_gain=12.0, ao=(0.25, 0.6)),
    'gold': dict(base='#f6bd2a', var='#d28f10', var_scale=9.0, var_amt=0.7, fine=0.05, top=0.45, edge='#fff3b8',
                 edge_amt=1.0, edge_r=0.018, edge_gain=12.0, ao=(0.2, 0.45)),
    'coat': dict(base='#efe9dd', var='#cfc3ad', var_scale=7.0, var_amt=0.55, fine=0.04, top=0.35, ao=(0.3, 0.5),
                 grad=(0.0, 1.7, 0.18)),
    'coat_dark': dict(base='#c4b8a2', var='#a89c85', var_scale=8.0, var_amt=0.5, fine=0.05, top=0.25, ao=(0.25, 0.5)),
    'sock': dict(base='#f7f2e8', var='#e2d9c6', var_scale=9.0, fine=0.03, top=0.3, ao=(0.25, 0.5)),
    'blaze': dict(base='#fdf9ef', var='#eee6d2', var_scale=9.0, fine=0.03, top=0.3),
    'mane': dict(base='#f6efd8', var='#dccb9c', var_scale=10.0, var_amt=0.8, fine=0.08, top=0.35, ao=(0.2, 0.45)),
    'muzzle': dict(base='#9a8076', var='#7a6258', var_scale=10.0, fine=0.05, top=0.3),
    'plume': dict(base='#fdfcf6', var='#e0dccb', var_scale=14.0, var_amt=0.6, fine=0.12, top=0.4, ao=(0.25, 0.5)),
    'light': dict(base='#fff7c8', var='#ffe27a', var_scale=6.0, emit_boost=1.3),
})


def head_extras(mb):
    # crista alta: três plumas brancas em arco para trás, presas por uma base de ouro
    mb.add(prim_box(0.07, 0.07, 0.20, taper=(0.8, 0.9)), 'gold', M((0, 0.33, -0.02)))
    for i, (dx, rise, back) in enumerate(((0.0, 0.46, -0.50), (-0.075, 0.38, -0.40), (0.075, 0.38, -0.40))):
        pts = bezier((dx * 0.4, 0.34, 0.0), (dx, 0.34 + rise * 1.15, -0.10), (dx * 1.6, 0.30 + rise * 0.55, back), 5)
        tube(mb, pts, [0.045, 0.060, 0.058, 0.044, 0.026, 0.006], 'plume', n=5, smooth=70)
    # disco solar na testa (só na frente, +Z): disco de ouro com núcleo de luz e 8 raios curtos
    S = M((0, 0.205, 0.232))
    mb.add(prim_cyl(0.058, 0.058, 0.02, 10, base=False), 'gold', S @ M(r=(90, 0, 0)), smooth=30)
    mb.add(prim_cyl(0.032, 0.032, 0.026, 8, base=False), 'light', S @ M(r=(90, 0, 0)))
    for k in range(8):
        a = k * 45
        mb.add(prim_cone(0.012, 0.045, 4), 'gold',
               S @ M((math.sin(math.radians(a)) * 0.075, math.cos(math.radians(a)) * 0.075, 0.0), (0, 0, -a)))
    # asinhas de ouro nas têmporas
    for sx in (-1, 1):
        for j in range(3):
            mb.add(prim_box(0.014, 0.03, 0.12 - 0.02 * j), 'gold',
                   M((sx * 0.215, 0.12 + j * 0.035, -0.02 - 0.05 * j), (0, 0, sx * -(16 + 14 * j))))


def torso_extras(mb):
    # emblema de luz no tabardo: sol de 8 raios com núcleo luminoso, à frente do brasão de cruz
    bz = CAV.K.TAB['botz'] + 0.052
    em = CAV.K.TAB['emb'] + 0.01
    S = M((0, em, bz))
    for k in range(8):
        a = k * 45
        ln = 0.13 if k % 2 == 0 else 0.095
        mb.add(prim_box(0.028, ln, 0.012, taper=(0.4, 1.0)), 'gold',
               S @ M((math.sin(math.radians(a)) * (0.05 + ln / 2), math.cos(math.radians(a)) * (0.05 + ln / 2), 0.0), (0, 0, -a)))
    mb.add(prim_cyl(0.052, 0.052, 0.014, 10, base=False), 'gold', S @ M(r=(90, 0, 0)), smooth=30)
    mb.add(prim_cyl(0.034, 0.034, 0.02, 8, base=False), 'light', S @ M(r=(90, 0, 0)))
    # gola/ombros: cordão dourado ao redor do peitoral
    for sx in (-1, 1):
        mb.add(prim_cyl(0.03, 0.03, 0.015, 8, base=False), 'light', M((sx * 0.43, 0.32, 0.06), (0, 0, 90)))


def horse_extras(mb):
    # sol de 8 raios no peitoral do cavalo (frente, +Z), em volta do medalhão do arreio (0; 1,06; 0,80): é o emblema que a
    # câmera RTS vê de frente, já que o do tabardo fica atrás do pescoço do cavalo
    S = M((0, 1.06, 0.80))
    for k in range(8):
        a = k * 45
        ln = 0.17 if k % 2 == 0 else 0.115
        r = 0.07 + ln / 2
        mb.add(prim_box(0.04, ln, 0.02, taper=(0.4, 1.0)), 'gold',
               S @ M((math.sin(math.radians(a)) * r, math.cos(math.radians(a)) * r, 0.006), (0, 0, -a)))
    mb.add(prim_cyl(0.045, 0.045, 0.03, 8, base=False), 'light', S @ M((0, 0, 0.012), (90, 0, 0)))


def shield_extras(mb):
    # escudo (escala 0,62 no Cavaleiro): a cruz dourada ganha 4 raios diagonais e o umbo um núcleo luminoso = sol de 8 raios
    k = 0.62
    z = 0.058
    for a in (45, 135):
        mb.add(prim_box(0.05 * k, 0.56 * k, 0.03), 'gold', M((0, 0.14 * k, z), (0, 0, a)))
    mb.add(prim_sphere(0.078 * k, 0.078 * k, 0.05, 8, 4), 'light', M((0, 0.14 * k, 0.118)), smooth=60)


EXTRAS = {'Head': head_extras, 'Torso': torso_extras, 'Horse': horse_extras, 'ShieldGroup': shield_extras}
_orig_build = MeshBuilder.build


def _build(self, mat_lookup, parent=None, location=(0, 0, 0), collection=None):
    fn = EXTRAS.get(self.name)
    if fn:
        fn(self)
    return _orig_build(self, mat_lookup, parent, location, collection)


MeshBuilder.build = _build

if __name__ == '__main__':
    CAV.main('Templar', 'templar')
