"""
build_mage.py — Mago Arcano humano (tipo interno `mage`) gerado 100% por script.

Uso:
  blender -b --factory-startup --python tools/blender/build_mage.py -- [--no-render]

Hierarquia PLANA (igual a MageModel.js procedural; o UnitAnimator só mexe em Torso/Head/ArmL/ArmR/LegL/LegR
e escala `Crystal` no 'cast'):
  Mage (raiz)
  ├─ Torso   pivô (0, 1.05, 0)   túnica pesada + capa + estola (cor de time)
  ├─ Head    pivô (0, 1.62, 0)   chapéu pontudo, barba, rosto severo só em +Z
  ├─ ArmL / ArmR  pivô (∓0.47, 1.27, 0)
  ├─ LegL / LegR  pivô (∓0.16, 0.66, 0)  (cada perna leva meio saiote da túnica)
  ├─ Weapon  pivô (0.55, 0.70, 0.17)  cajado em pé (a mão direita o empunha)
  └─ Crystal pivô no centro do cristal, filho de Weapon (pulsa na 'cast')
"""
import os
import sys
import math

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mathutils import Vector, Matrix  # noqa: E402
import common as C  # noqa: E402
from common import (MeshBuilder, M, prim_box, prim_rings, ring_h, prim_cyl, prim_cone,  # noqa: E402
                    prim_sphere, prim_extrude, limb_rings, bezier)
from unit_common import orient, cloth_panel, tube, ring_band, fist, finish_unit  # noqa: E402

TORSO_PIVOT = (0.0, 1.05, 0.0)
HEAD_PIVOT = (0.0, 1.60, 0.0)
ARM_PIVOT = (0.47, 1.27, 0.0)
LEG_PIVOT = (0.16, 0.66, 0.0)
WEAPON_PIVOT = (0.62, 0.70, 0.19)
CRYSTAL_Y = 2.30          # relativo ao Weapon
TEAM_DEFAULT = '#2f5bd0'

PALETTE = {
    'robe': dict(base='#27407f', var='#16254f', var_scale=3.2, var_amt=0.8, fine=0.10, top=0.32,
                 edge='#6f8ad0', edge_amt=0.4, edge_r=0.025, ao=(0.3, 0.65), grad=(0.0, 2.2, 0.2)),
    'robe_dark': dict(base='#1a2750', var='#0f1736', var_scale=4.0, var_amt=0.8, fine=0.10, top=0.28,
                      edge='#566ab0', edge_amt=0.35, edge_r=0.025, ao=(0.3, 0.65)),
    'gold': dict(base='#e8ae2a', var='#b57a10', var_scale=9.0, var_amt=0.7, fine=0.06, top=0.4,
                 edge='#fff0b0', edge_amt=1.0, edge_r=0.016, edge_gain=12.0, ao=(0.2, 0.5)),
    'leather': dict(base='#6a3e20', var='#472810', var_scale=6.0, fine=0.12, top=0.2,
                    edge='#a8703c', edge_amt=0.5, edge_r=0.02, ao=(0.25, 0.6)),
    'skin': dict(base='#eab98f', var='#cf9068', var_scale=5.0, var_amt=0.6, fine=0.05, top=0.25,
                 edge='#f0c8a0', edge_amt=0.3, edge_r=0.02, ao=(0.25, 0.6)),
    'hair': dict(base='#e6e4de', var='#aaa69c', var_scale=14.0, var_amt=0.9, fine=0.18, fine_scale=40.0,
                 top=0.3, ao=(0.3, 0.5), edge='#ffffff', edge_amt=0.3, edge_r=0.02),
    'brow': dict(base='#cfccc4', var='#8f8b82', var_scale=18.0, var_amt=0.9, fine=0.12, top=0.2),
    'parch': dict(base='#e9dcb4', var='#c9b98a', var_scale=6.0, fine=0.1, top=0.3, edge='#fff6d8', edge_amt=0.4,
                  edge_r=0.02, ao=(0.2, 0.5)),
    'wood': dict(base='#5d3a1f', var='#3f2511', var_scale=5.0, fine=0.1, coord='object',
                 streaks=(40.0, 2.0, 0.25), top=0.25, edge='#9a7048', edge_amt=0.4, edge_r=0.015, ao=(0.2, 0.5)),
    'steel': dict(base='#8791a3', var='#4a5263', var_scale=7.0, var_amt=0.75, fine=0.08, top=0.35,
                  edge='#f4f8ff', edge_amt=1.0, edge_r=0.02, edge_gain=12.0, ao=(0.25, 0.6)),
    'crystal': dict(base='#46c4ff', var='#1f8be0', var_scale=2.5, var_amt=0.9, top=0.5, emit_boost=1.18,
                    edge='#e6fbff', edge_amt=0.9, edge_r=0.03, edge_gain=8.0),
    'core': dict(base='#e4fbff', var='#9fe8ff', var_scale=3.0, emit_boost=1.3),
    'rune': dict(base='#9be8ff', var='#5fcfff', var_scale=6.0, emit_boost=1.2),
    'eye': dict(base='#8fe6ff', var='#59c8ff', var_scale=20.0, emit_boost=1.4),
    'dark': dict(base='#07090d', var='#07090d'),
    'glass_b': dict(base='#3c9cff', var='#1f6fd0', var_scale=6.0, emit_boost=1.1, top=0.4),
    'glass_r': dict(base='#e0453a', var='#a62820', var_scale=6.0, emit_boost=1.05, top=0.4),
    'glass_g': dict(base='#58c970', var='#2f9a4a', var_scale=6.0, emit_boost=1.05, top=0.4),
    'cork': dict(base='#a8844e', var='#7e5f33', var_scale=8.0, top=0.2),
    'team': dict(base='#b8b0a4', var='#9d9589', var_scale=5.0, fine=0.08, top=0.25,
                 edge='#d8d2c8', edge_amt=0.3, edge_r=0.03, ao=(0.3, 0.65), team=True),
}


def glyph(mb, T, s=1.0, kind=0, mat='rune'):
    """Runa simples (traços de caixa) no plano XY local, com a face em +Z."""
    th = 0.012
    if kind == 0:   # ᛉ
        mb.add(prim_box(0.02 * s, 0.14 * s, th), mat, T)
        mb.add(prim_box(0.02 * s, 0.08 * s, th), mat, T @ M((-0.035 * s, 0.07 * s, 0), (0, 0, 35)))
        mb.add(prim_box(0.02 * s, 0.08 * s, th), mat, T @ M((0.035 * s, 0.07 * s, 0), (0, 0, -35)))
    elif kind == 1:  # ᚦ
        mb.add(prim_box(0.02 * s, 0.14 * s, th), mat, T @ M((-0.03 * s, 0, 0)))
        mb.add(prim_box(0.02 * s, 0.07 * s, th), mat, T @ M((0.0 * s, 0.035 * s, 0), (0, 0, -55)))
        mb.add(prim_box(0.02 * s, 0.07 * s, th), mat, T @ M((0.0 * s, -0.01 * s, 0), (0, 0, 55)))
    elif kind == 2:  # ◇
        mb.add(prim_extrude([(0, 0.08 * s), (0.05 * s, 0), (0, -0.08 * s), (-0.05 * s, 0)], th, axis='z'), mat, T)
    else:            # ᚠ
        mb.add(prim_box(0.02 * s, 0.14 * s, th), mat, T)
        mb.add(prim_box(0.02 * s, 0.08 * s, th), mat, T @ M((0.035 * s, 0.05 * s, 0), (0, 0, -50)))
        mb.add(prim_box(0.02 * s, 0.08 * s, th), mat, T @ M((0.035 * s, 0.0, 0), (0, 0, -50)))


# ---------------------------------------------------------------------------
def build_torso(mats, root):
    mb = MeshBuilder('Torso')
    # túnica pesada: peitoral largo, cintura marcada, saiote superior em sino (o inferior fica nas pernas)
    body = [ring_h(-0.46, 0.40, 0.31, 12), ring_h(-0.30, 0.34, 0.27, 12), ring_h(-0.12, 0.31, 0.25, 12, cz=0.01),
            ring_h(0.08, 0.37, 0.27, 12, cz=0.025), ring_h(0.26, 0.45, 0.29, 12, cz=0.03),
            ring_h(0.38, 0.45, 0.27, 12, cz=0.0), ring_h(0.45, 0.24, 0.19, 12)]
    mb.add(prim_rings(body), 'robe', smooth=62, bevel=0.006)
    # bordado dourado: gola, barra do saiote, placket central com losangos
    mb.add(prim_rings([ring_h(-0.455, 0.405, 0.315, 14), ring_h(-0.42, 0.396, 0.307, 14)], cap0=False, cap1=False), 'gold', smooth=30)
    mb.add(prim_box(0.07, 0.86, 0.025, taper=(1.0, 1.0)), 'gold', M((0, -0.05, 0.285)))
    for y in (0.22, 0.02, -0.24):
        mb.add(prim_extrude([(0, 0.075), (0.065, 0), (0, -0.075), (-0.065, 0)], 0.022, axis='z'), 'gold', M((0, y, 0.30)), bevel=0.004)
    mb.add(prim_rings([ring_h(0.40, 0.255, 0.20, 14), ring_h(0.43, 0.245, 0.195, 14)], cap0=False, cap1=False), 'gold', smooth=30)
    # manto de ombros (ombreiras de tecido pesado com friso e fecho)
    mantle = [ring_h(0.47, 0.28, 0.21, 12), ring_h(0.40, 0.46, 0.31, 12), ring_h(0.28, 0.60, 0.36, 12), ring_h(0.18, 0.60, 0.35, 12)]
    mb.add(prim_rings(mantle, cap0=False, cap1=False), 'robe_dark', smooth=55, bevel=0.005)
    mb.add(prim_rings([ring_h(0.185, 0.605, 0.355, 12), ring_h(0.215, 0.605, 0.355, 12)], cap0=False, cap1=False), 'gold', smooth=30)
    mb.add(prim_rings([ring_h(0.285, 0.602, 0.362, 12), ring_h(0.305, 0.598, 0.36, 12)], cap0=False, cap1=False), 'gold', smooth=30)
    for sx in (-1, 1):
        for k in range(3):   # ombreira de couro em lâminas sobre o manto
            mb.add(prim_sphere(0.20 - 0.015 * k, 0.07, 0.19 - 0.015 * k, 10, 3, y_min=0.0), 'leather',
                   M((sx * (0.45 + 0.05 * k), 0.40 - 0.07 * k, 0.0), (0, 0, -sx * (18 + 8 * k))), smooth=55)
            mb.add(prim_cyl(0.20 - 0.015 * k, 0.20 - 0.015 * k, 0.014, 10), 'gold',
                   M((sx * (0.45 + 0.05 * k), 0.395 - 0.07 * k, 0.0), (0, 0, -sx * (18 + 8 * k))), smooth=30)
        mb.add(prim_cone(0.045, 0.16, 6), 'gold', M((sx * 0.50, 0.52, 0.0), (0, 0, -sx * 35)))
        mb.add(prim_sphere(0.05, 0.05, 0.05, 6, 3), 'gold', M((sx * 0.40, 0.44, 0.0)), smooth=60)
    # fecho central do manto: joia azul num engaste dourado + correntes
    mb.add(prim_cyl(0.075, 0.075, 0.03, 10, base=False), 'gold', M((0, 0.40, 0.255), (90, 0, 0)), smooth=30)
    mb.add(prim_extrude([(0, 0.06), (0.05, 0), (0, -0.06), (-0.05, 0)], 0.03, axis='z'), 'crystal', M((0, 0.40, 0.275)), bevel=0.004)
    for sx in (-1, 1):
        tube(mb, [(sx * 0.07, 0.40, 0.26), (sx * 0.2, 0.36, 0.30), (sx * 0.3, 0.38, 0.27)], [0.014, 0.014, 0.014], 'gold', n=5)
    # alta gola de pano em duas asas atrás do pescoço (emoldura a cabeça)
    for sx in (-1, 1):
        mb.add(prim_box(0.34, 0.34, 0.05, taper=(1.15, 1.0)), 'robe_dark', M((sx * 0.17, 0.62, -0.17), (-10, sx * 28, sx * -14)), bevel=0.008)
        mb.add(prim_box(0.36, 0.03, 0.06), 'gold', M((sx * 0.20, 0.80, -0.21), (-10, sx * 28, sx * -14)))
    # cinto largo de couro com fivela arcana, grimório, frascos, bolsas e cordão
    mb.add(prim_rings([ring_h(-0.24, 0.335, 0.265, 14, cz=0.01), ring_h(-0.07, 0.33, 0.262, 14, cz=0.01)]), 'leather', smooth=40)
    mb.add(prim_box(0.20, 0.17, 0.05), 'gold', M((0, -0.155, 0.27)), bevel=0.01)
    mb.add(prim_sphere(0.045, 0.06, 0.03, 6, 4), 'crystal', M((0, -0.155, 0.30)), smooth=60)
    for i in range(6):
        a = math.radians(-78 + i * 31)
        mb.add(prim_sphere(0.02, 0.02, 0.018, 5, 3), 'gold', M((math.sin(a) * 0.335, -0.215, math.cos(a) * 0.265 + 0.01)), smooth=60)
    # grimório pendurado no quadril esquerdo (-x): capa de couro, cantoneiras e fecho, páginas
    gT = M((-0.34, -0.34, 0.08), (0, -14, 10))
    mb.add(prim_box(0.24, 0.30, 0.10), 'leather', gT, bevel=0.012)
    mb.add(prim_box(0.215, 0.27, 0.075), 'parch', gT @ M((0.012, 0, 0.0)), bevel=0.004)
    mb.add(prim_box(0.235, 0.29, 0.02), 'leather', gT @ M((0, 0, 0.056)), bevel=0.006)
    for (dx, dy) in ((-0.11, 0.14), (0.11, 0.14), (-0.11, -0.14), (0.11, -0.14)):
        mb.add(prim_box(0.05, 0.05, 0.12), 'gold', gT @ M((dx, dy, 0.0)))
    mb.add(prim_extrude([(0, 0.05), (0.04, 0), (0, -0.05), (-0.04, 0)], 0.02, axis='z'), 'crystal', gT @ M((0, 0.0, 0.07)))
    glyph(mb, gT @ M((0, -0.07, 0.068)), 0.8, 1, 'gold')
    tube(mb, [(-0.3, -0.12, 0.2), (-0.34, -0.2, 0.14), (-0.34, -0.26, 0.09)], [0.015, 0.015, 0.015], 'leather', n=5)
    # frascos de poção no quadril direito (+x) e bolsa
    for k, gm in enumerate(('glass_b', 'glass_r', 'glass_g')):
        a = math.radians(32 + k * 24)
        x, z = math.sin(a) * 0.35, math.cos(a) * 0.27
        T = M((x, -0.34, z), (0, math.degrees(a), 0))
        mb.add(prim_rings([ring_h(-0.07, 0.035, 0.035, 8), ring_h(-0.05, 0.062, 0.062, 8), ring_h(0.03, 0.065, 0.065, 8),
                           ring_h(0.07, 0.03, 0.03, 8)]), gm, T, smooth=70)
        mb.add(prim_cyl(0.026, 0.03, 0.04, 8, base=False), 'cork', T @ M((0, 0.10, 0)))
        mb.add(prim_cyl(0.068, 0.068, 0.012, 8, base=False), 'leather', T @ M((0, -0.02, 0)))
    mb.add(prim_box(0.15, 0.17, 0.12), 'leather', M((0.28, -0.52, -0.1), (0, -20, -6)), bevel=0.012)
    mb.add(prim_box(0.16, 0.04, 0.13), 'gold', M((0.28, -0.44, -0.1), (0, -20, -6)))
    # estola de time (frente e costas) com franjas e runas douradas
    mb.add(cloth_panel((-0.10, 0.44, 0.28), (0.10, 0.44, 0.28), (-0.14, -0.50, 0.36), (0.14, -0.50, 0.36),
                       nx=3, ny=6, thick=0.03, bulge=(0, 0, 0.04), wave=0.015, jag=0.02), 'team', smooth=50)
    for dx in (-0.05, 0.0, 0.05):
        mb.add(prim_box(0.02, 0.07, 0.02), 'gold', M((dx, -0.54, 0.37)))
    # capa longa de time, forrada, com runas
    cape = ((0.36, 0.42, -0.24), (-0.36, 0.42, -0.24), (0.52, -0.92, -0.52), (-0.52, -0.92, -0.52))
    mb.add(cloth_panel(*cape, nx=6, ny=6, thick=0.045, bulge=(0, 0, -0.14), wave=0.07, jag=0.07), 'team', smooth=50)
    mb.add(cloth_panel((0.36, 0.42, -0.285), (-0.36, 0.42, -0.285), (0.52, -0.9, -0.57), (-0.52, -0.9, -0.57),
                       nx=5, ny=5, thick=0.02, bulge=(0, 0, -0.14), wave=0.07, jag=0.07), 'robe_dark', smooth=50)
    for k, (x, y) in enumerate(((0, 0.05), (-0.17, -0.2), (0.17, -0.25), (0, -0.5), (-0.2, -0.7), (0.2, -0.72))):
        zc = -0.30 - 0.22 * (0.42 - y) / 1.3 - 0.06
        glyph(mb, M((x, y, zc - 0.06), (0, 180, 0)), 1.35, k % 4)
    mb.add(prim_box(0.76, 0.05, 0.07, taper=(0.9, 1.0)), 'gold', M((0, 0.42, -0.24)))
    return mb.build(mats, parent=root, location=TORSO_PIVOT)


def build_leg(mats, root, side):
    s = side
    mb = MeshBuilder('LegR' if s > 0 else 'LegL')
    # meio saiote da túnica: segue a perna (a barra irregular fica em y ~ -0.5)
    rings = [ring_h(0.02, 0.19, 0.26, 12, cx=0), ring_h(-0.20, 0.21, 0.29, 12, cx=0), ring_h(-0.40, 0.235, 0.31, 12, cx=0),
             ring_h(-0.50, 0.25, 0.32, 12, cx=0)]
    mb.add(prim_rings(rings, cap0=False, cap1=False), 'robe', M((s * -0.01, 0, 0.0)), smooth=60, bevel=0.005)
    mb.add(prim_rings([ring_h(-0.47, 0.254, 0.324, 12, cx=-0.01 * s), ring_h(-0.505, 0.256, 0.326, 12, cx=-0.01 * s)],
                      cap0=False, cap1=False), 'gold', smooth=30)
    # bordado vertical de barra (galão duplo)
    for dx in (-0.075, 0.075):
        mb.add(prim_box(0.025, 0.42, 0.02), 'gold', M((dx - 0.01 * s, -0.27, 0.318), (-5, 0, 0)))
    # bota alta de couro (aparece sob a barra) com biqueira e fivelas
    mb.add(prim_box(0.2, 0.2, 0.34, taper=(0.85, 0.6), base=True), 'leather', M((0.0, -0.66, 0.06)), bevel=0.02, smooth=35)
    mb.add(prim_box(0.15, 0.06, 0.18, base=True), 'leather', M((0.0, -0.62, 0.2)), bevel=0.015)
    mb.add(prim_box(0.22, 0.03, 0.2), 'gold', M((0.0, -0.585, 0.14)))
    mb.add(prim_cyl(0.11, 0.11, 0.25, 10), 'leather', M((0.0, -0.55, -0.0)), smooth=40)
    return mb.build(mats, parent=root, location=(s * LEG_PIVOT[0], LEG_PIVOT[1], LEG_PIVOT[2]))


def build_head(mats, root):
    mb = MeshBuilder('Head')
    # crânio humano maduro, queixo forte
    skull = [ring_h(0.27, 0.07, 0.08, 12), ring_h(0.22, 0.14, 0.16, 12), ring_h(0.14, 0.18, 0.20, 12),
             ring_h(0.04, 0.185, 0.215, 12, cz=0.01), ring_h(-0.06, 0.165, 0.215, 12, cz=0.025),
             ring_h(-0.14, 0.12, 0.17, 12, cz=0.04), ring_h(-0.19, 0.06, 0.09, 12, cz=0.05)]
    mb.add(prim_rings(skull), 'skin', smooth=65)
    # rosto só na face frontal (+Z): sobrancelhas espessas e severas, olhos azuis brilhantes, nariz adunco
    for sx in (-1, 1):
        mb.add(prim_box(0.12, 0.045, 0.06), 'brow', M((sx * 0.075, 0.115, 0.215), (-8, 0, sx * -18)), bevel=0.01)
        mb.add(prim_box(0.075, 0.035, 0.03), 'dark', M((sx * 0.075, 0.062, 0.205)))
        mb.add(prim_box(0.05, 0.03, 0.03), 'eye', M((sx * 0.075, 0.062, 0.222)))
    mb.add(prim_box(0.075, 0.15, 0.075, taper=(0.8, 0.7)), 'skin', M((0, 0.015, 0.23), (-14, 0, 0)), bevel=0.01)
    mb.add(prim_sphere(0.045, 0.04, 0.05, 6, 3), 'skin', M((0, -0.045, 0.265)), smooth=60)
    # bigode caído e barba longa de 3 mechas em ponta (descem até o peito)
    for sx in (-1, 1):
        mb.add(prim_box(0.12, 0.05, 0.06, taper=(0.5, 0.9)), 'hair', M((sx * 0.07, -0.085, 0.245), (0, sx * -8, sx * 25)), bevel=0.01)
    beard = [ring_h(-0.05, 0.15, 0.14, 12, cz=0.09), ring_h(-0.16, 0.19, 0.17, 12, cz=0.19), ring_h(-0.32, 0.21, 0.15, 12, cz=0.31),
             ring_h(-0.50, 0.14, 0.12, 12, cz=0.40), ring_h(-0.68, 0.02, 0.03, 12, cz=0.43)]
    mb.add(prim_rings(beard, cap0=False, cap1=True), 'hair', smooth=70, mat_fn=lambda c, n: None)
    for sx in (-1, 1):
        mb.add(prim_cone(0.065, 0.3, 6), 'hair', M((sx * 0.12, -0.34, 0.37), (180, 0, sx * 6)), smooth=40)
    # cabelo comprido branco atrás e costeletas
    hair = [ring_h(0.18, 0.17, 0.2, 12, cz=-0.03), ring_h(0.05, 0.2, 0.23, 12, cz=-0.05), ring_h(-0.15, 0.19, 0.21, 12, cz=-0.07),
            ring_h(-0.34, 0.15, 0.17, 12, cz=-0.1)]
    mb.add(prim_rings(hair, cap0=False, cap1=True), 'hair', M((0, 0, -0.04)), smooth=70)
    for sx in (-1, 1):
        mb.add(prim_box(0.05, 0.2, 0.1, taper=(1.0, 0.7)), 'hair', M((sx * 0.185, 0.0, 0.07), (0, 0, 0)))
        # orelha
        mb.add(prim_sphere(0.03, 0.06, 0.04, 5, 3), 'skin', M((sx * 0.19, 0.02, 0.0)), smooth=60)
    # chapéu pontudo: aba larga levemente erguida à frente, copa torta e dobrada, fita com fivela de ouro
    H = M((0, 0.0, 0.0), (-7, 0, 0))
    brim = [ring_h(0.205, 0.215, 0.235, 16, cz=-0.01), ring_h(0.215, 0.33, 0.37, 16, cz=-0.01),
            ring_h(0.185, 0.44, 0.46, 16, cz=-0.02), ring_h(0.165, 0.45, 0.47, 16, cz=-0.02)]
    mb.add(prim_rings(brim, cap0=False, cap1=True), 'robe_dark', H, smooth=40, bevel=0.004)
    mb.add(prim_rings([ring_h(0.168, 0.452, 0.472, 16, cz=-0.02), ring_h(0.19, 0.448, 0.468, 16, cz=-0.02)], cap0=False, cap1=False),
           'gold', H, smooth=30)
    cone = [ring_h(0.20, 0.20, 0.22, 14, cz=-0.01), ring_h(0.36, 0.185, 0.2, 14, cz=-0.02), ring_h(0.58, 0.14, 0.15, 14, cz=-0.05),
            ring_h(0.80, 0.09, 0.10, 14, cz=-0.12), ring_h(0.98, 0.05, 0.055, 14, cz=-0.22), ring_h(1.10, 0.02, 0.022, 14, cz=-0.36)]
    mb.add(prim_rings(cone, cap0=False, cap1=True), 'robe', H, smooth=60)
    mb.add(prim_rings([ring_h(0.215, 0.205, 0.225, 14, cz=-0.01), ring_h(0.265, 0.2, 0.22, 14, cz=-0.012)], cap0=False, cap1=False),
           'gold', H, smooth=30)
    mb.add(prim_box(0.13, 0.11, 0.04), 'gold', H @ M((0, 0.24, 0.222)), bevel=0.01)
    mb.add(prim_extrude([(0, 0.045), (0.035, 0), (0, -0.045), (-0.035, 0)], 0.03, axis='z'), 'crystal', H @ M((0, 0.24, 0.245)))
    # estrelas/runas na copa (frente)
    for (y, x, k) in ((0.45, -0.05, 2), (0.62, 0.04, 0)):
        glyph(mb, H @ M((x, y, 0.145 - (y - 0.4) * 0.12), (-14, 0, 0)), 0.8, k, 'gold')
    hd = mb.build(mats, parent=root, location=HEAD_PIVOT)
    hd.data.transform(Matrix.Scale(1.14, 4))
    return hd


def build_arm(mats, root, side):
    """Braço de manga larga com punho de sino bordado, braçadeira de couro e mão forte com anéis."""
    s = side
    mb = MeshBuilder('ArmR' if s > 0 else 'ArmL')
    sh = Vector((s * 0.02, -0.08, 0.0))
    e = Vector((s * 0.06, -0.34, 0.03))
    w = Vector((s * 0.075, -0.62, 0.15 if s > 0 else 0.09))
    up = [tuple(sh), tuple(sh.lerp(e, 0.5)), tuple(e)]
    tube(mb, up, [0.125, 0.14, 0.13], 'robe', n=9, bevel=0.004)
    mb.add(prim_sphere(0.14, 0.13, 0.14, 8, 4), 'robe', M(tuple(e)), smooth=60)
    # antebraço: manga em sino
    fa = [tuple(e), tuple(e.lerp(w, 0.5)), tuple(w + (e - w).normalized() * 0.06)]
    tube(mb, fa, [0.12, 0.15, 0.185], 'robe', n=9, bevel=0.004)
    # punho: friso dourado duplo + bainha escura
    d = (w - e).normalized()
    cuff = w + (e - w).normalized() * 0.06
    mb.add(prim_cyl(0.19, 0.19, 0.035, 10, base=False), 'gold', Matrix.Translation(cuff) @ orient(d), smooth=30)
    mb.add(prim_cyl(0.18, 0.2, 0.07, 10, base=False), 'robe_dark', Matrix.Translation(cuff + d * 0.04) @ orient(d), smooth=40)
    mb.add(prim_cyl(0.19, 0.19, 0.016, 10, base=False), 'gold', Matrix.Translation(cuff + d * 0.075) @ orient(d), smooth=30)
    # braçadeira de couro sob a manga
    mb.add(prim_cyl(0.115, 0.115, 0.06, 9), 'leather', Matrix.Translation(e.lerp(w, 0.2)) @ orient(d), smooth=40)
    # mão forte
    Tw = Matrix.Translation(w + d * 0.015) @ orient(d)
    fist(mb, Tw @ M((0, 0, 0.0), (0, 0, 0)), 1.25, 'skin', knuckle='skin')
    mb.add(prim_cyl(0.034, 0.034, 0.02, 8, base=False), 'gold', Tw @ M((0.02, 0.12, 0.085), (90, 0, 0)), smooth=30)
    mb.add(prim_sphere(0.022, 0.022, 0.02, 5, 3), 'crystal', Tw @ M((0.02, 0.12, 0.1)), smooth=60)
    mb.add(prim_cyl(0.034, 0.034, 0.02, 8, base=False), 'gold', Tw @ M((-0.032, 0.12, 0.085), (90, 0, 0)), smooth=30)
    return mb.build(mats, parent=root, location=(s * ARM_PIVOT[0], ARM_PIVOT[1], ARM_PIVOT[2]))


def build_weapon(mats, root):
    """Cajado arcano: haste de madeira com anéis dourados, cabeça em garras de ouro e cristal flutuante (Crystal)."""
    mb = MeshBuilder('Weapon')
    y0, y1 = -0.70, 1.78
    mb.add(prim_cyl(0.045, 0.052, y1 - y0, 8, base=False), 'wood', M((0, (y0 + y1) / 2, 0)), smooth=50)
    mb.add(prim_cone(0.05, 0.14, 8), 'steel', M((0, y0 - 0.12, 0), (180, 0, 0)))
    for y in (-0.38, 0.0, 0.32, 0.7, 1.3, 1.62):
        mb.add(prim_cyl(0.06, 0.06, 0.035, 8, base=False), 'gold', M((0, y, 0)), smooth=30)
    # empunhadura de couro enrolada
    mb.add(prim_cyl(0.058, 0.058, 0.30, 8, base=False), 'leather', M((0, 0.02, 0)), smooth=30)
    # cabeça: base em copa + 4 garras curvas + anéis rúnicos girando em torno do cristal
    mb.add(prim_cone(0.09, 0.18, 8), 'gold', M((0, 1.72, 0)), smooth=35)
    for k in range(4):
        a = math.radians(45 + k * 90)
        pts = [(math.sin(a) * 0.07, 1.78, math.cos(a) * 0.07), (math.sin(a) * 0.19, 1.92, math.cos(a) * 0.19),
               (math.sin(a) * 0.20, 2.14, math.cos(a) * 0.20), (math.sin(a) * 0.11, 2.30, math.cos(a) * 0.11)]
        tube(mb, pts, [0.026, 0.022, 0.018, 0.006], 'gold', n=5, smooth=50)
    mb.add(prim_rings([ring_h(2.04, 0.265, 0.265, 20), ring_h(2.04, 0.235, 0.235, 20)], cap0=False, cap1=False), 'gold', M(), smooth=30)
    mb.add(prim_cyl(0.27, 0.27, 0.02, 20, base=False), 'gold', M((0, 2.04, 0), (0, 0, 14)), smooth=30)
    for k in range(4):   # contas de cristal no anel
        a = 2 * math.pi * k / 4 + 0.4
        mb.add(prim_sphere(0.034, 0.034, 0.034, 6, 3), 'crystal', M((math.sin(a) * 0.27, 2.04, math.cos(a) * 0.27)), smooth=60)
    # contrapesos/ornamentos: penas e fita de time? (fita de couro com pingentes)
    for k, y in enumerate((0.9, 1.0)):
        mb.add(prim_sphere(0.04, 0.05, 0.04, 6, 3), 'crystal' if k else 'gold', M((0.07, y, 0.02)), smooth=60)
    w = mb.build(mats, parent=root, location=WEAPON_PIVOT)
    # Crystal: filho de Weapon, pivô no centro do cristal (escala pulsa no 'cast')
    cb = MeshBuilder('Crystal')
    cb.add(prim_cone(0.17, 0.30, 6), 'crystal', M((0, 0.0, 0)), smooth=0, bevel=0.004)
    cb.add(prim_cone(0.17, 0.30, 6), 'crystal', M((0, 0.0, 0), (180, 0, 0)), smooth=0, bevel=0.004)
    cb.add(prim_cone(0.075, 0.2, 6), 'core', M((0, 0.0, 0)), smooth=0)
    cb.add(prim_cone(0.075, 0.2, 6), 'core', M((0, 0.0, 0), (180, 0, 0)), smooth=0)
    # fragmentos orbitando
    for k in range(3):
        a = 2 * math.pi * k / 3
        cb.add(prim_cone(0.045, 0.1, 4), 'crystal', M((math.sin(a) * 0.3, 0.12 * (k - 1), math.cos(a) * 0.3)), smooth=0)
        cb.add(prim_cone(0.045, 0.1, 4), 'crystal', M((math.sin(a) * 0.3, 0.12 * (k - 1), math.cos(a) * 0.3), (180, 0, 0)), smooth=0)
    c = cb.build(mats, parent=w, location=(0, 2.04 - 0.0, 0))
    return w, c


def main():
    args = C.script_args()
    C.reset_scene()
    mats = C.make_paint_set(PALETTE)
    root = C.make_empty('Mage')
    torso = build_torso(mats, root)
    head = build_head(mats, root)
    arm_l = build_arm(mats, root, -1)
    arm_r = build_arm(mats, root, 1)
    leg_l = build_leg(mats, root, -1)
    leg_r = build_leg(mats, root, 1)
    weapon, crystal = build_weapon(mats, root)
    parts = [torso, head, arm_l, arm_r, leg_l, leg_r, weapon, crystal]
    finish_unit('mage', 'mage.glb', 'mage_atlas', root, parts,
                {'Head': 1.6, 'Torso': 1.2, 'Weapon': 0.8, 'LegL': 0.7, 'LegR': 0.7, 'ArmL': 1.0, 'ArmR': 1.0, 'Crystal': 0.6},
                TEAM_DEFAULT, args, cam_h=2.3)


if __name__ == '__main__':
    main()
