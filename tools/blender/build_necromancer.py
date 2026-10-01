"""
build_necromancer.py — Necromante das Cinzas orc (tipo interno `necromancer`) gerado 100% por script.

Uso:
  blender -b --factory-startup --python tools/blender/build_necromancer.py -- [--no-render]

Hierarquia PLANA (igual a NecromancerModel.js procedural / MageModel.js):
  Necromancer (raiz)
  ├─ Torso   pivô (0, 1.05, 0)   manto esfarrapado, ombreiras de crânios, colares de ossos, faixas de time
  ├─ Head    pivô (0, 1.60, 0)   capuz com chifres; rosto orc (presas, olhos verdes brilhantes) só em +Z
  ├─ ArmL / ArmR  pivô (∓0.52, 1.27, 0)
  ├─ LegL / LegR  pivô (∓0.18, 0.66, 0)   (cada perna leva meio saiote esfarrapado)
  ├─ Weapon  pivô (0.66, 0.70, 0.19)  cajado com crânio chifrudo
  └─ Crystal filho de Weapon: chama/cristal de alma verde-ácido (pulsa na 'cast')
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
from bld_common import skull  # noqa: E402

TORSO_PIVOT = (0.0, 1.05, 0.0)
HEAD_PIVOT = (0.0, 1.60, 0.06)
ARM_PIVOT = (0.55, 1.27, 0.0)
LEG_PIVOT = (0.18, 0.66, 0.0)
WEAPON_PIVOT = (0.70, 0.70, 0.20)
TEAM_DEFAULT = '#d23a2c'

PALETTE = {
    'robe': dict(base='#3d3d48', var='#23232b', var_scale=3.5, var_amt=0.9, fine=0.12, top=0.3,
                 edge='#82828f', edge_amt=0.4, edge_r=0.025, ao=(0.3, 0.7), grad=(0.0, 2.2, 0.28)),
    'robe_dark': dict(base='#24242c', var='#14141a', var_scale=4.0, var_amt=0.9, fine=0.1, top=0.25,
                      edge='#5c5c68', edge_amt=0.35, edge_r=0.025, ao=(0.3, 0.7)),
    'skin': dict(base='#8f9f95', var='#66766c', var_scale=4.5, var_amt=0.7, fine=0.07, top=0.28,
                 edge='#c4d2c8', edge_amt=0.4, edge_r=0.025, ao=(0.28, 0.65), grad=(0.0, 2.4, 0.2)),
    'skin_dark': dict(base='#566559', var='#3f4c43', var_scale=4.0, fine=0.06, top=0.2, ao=(0.25, 0.6)),
    'bone': dict(base='#e8dcb8', var='#bfaf80', var_scale=5.0, var_amt=0.8, fine=0.08, top=0.25,
                 edge='#fff8e0', edge_amt=0.5, edge_r=0.02, ao=(0.2, 0.6)),
    'dark': dict(base='#07090d', var='#07090d'),
    'iron': dict(base='#3b3f48', var='#272a31', var_scale=7.0, var_amt=0.8, fine=0.14, top=0.35,
                 edge='#b6bdca', edge_amt=0.9, edge_r=0.022, edge_gain=12.0, ao=(0.25, 0.55)),
    'leather': dict(base='#4e301b', var='#33200f', var_scale=6.0, fine=0.12, top=0.2,
                    edge='#8a5c36', edge_amt=0.5, edge_r=0.02, ao=(0.25, 0.6)),
    'wood': dict(base='#4a3220', var='#2f1f12', var_scale=5.0, fine=0.1, coord='object',
                 streaks=(40.0, 2.0, 0.25), top=0.25, edge='#8a6a46', edge_amt=0.4, edge_r=0.015, ao=(0.2, 0.5)),
    'flame': dict(base='#b6ff44', var='#6fd01c', var_scale=2.5, var_amt=0.9, top=0.5, emit_boost=1.15,
                  edge='#efffc0', edge_amt=0.9, edge_r=0.03, edge_gain=8.0),
    'core': dict(base='#f2ffd0', var='#c9ff7a', var_scale=3.0, emit_boost=1.25),
    'rune': dict(base='#b8f84a', var='#7fda24', var_scale=6.0, emit_boost=1.15),
    'eye': dict(base='#cbff5a', var='#8de026', var_scale=20.0, emit_boost=1.4),
    'smoke': dict(base='#9a9aa6', var='#6e6e7a', var_scale=3.0, var_amt=0.8, fine=0.1, top=0.5, ao=(0.3, 0.4)),
    'ash': dict(base='#9a9aa4', var='#6d6d78', var_scale=3.0, var_amt=0.8, fine=0.12, top=0.4),
    'team': dict(base='#b8b0a4', var='#9d9589', var_scale=5.0, fine=0.08, top=0.25,
                 edge='#d8d2c8', edge_amt=0.3, edge_r=0.03, ao=(0.3, 0.65), team=True),
}


def smoke_puff(mb, x, y, z, r, mat='smoke'):
    mb.add(prim_sphere(r, r * 0.8, r, 7, 3), mat, M((x, y, z)), smooth=70)


def rune_line(mb, T, kind, s=1.0):
    """Tatuagem/runa luminosa de traços simples, face em +Z."""
    th = 0.012
    if kind == 0:
        mb.add(prim_box(0.016 * s, 0.12 * s, th), 'rune', T)
        mb.add(prim_box(0.016 * s, 0.07 * s, th), 'rune', T @ M((0.03 * s, 0.03 * s, 0), (0, 0, -45)))
        mb.add(prim_box(0.016 * s, 0.07 * s, th), 'rune', T @ M((-0.03 * s, 0.03 * s, 0), (0, 0, 45)))
    elif kind == 1:
        mb.add(prim_box(0.016 * s, 0.12 * s, th), 'rune', T)
        mb.add(prim_box(0.08 * s, 0.016 * s, th), 'rune', T @ M((0, 0.03 * s, 0)))
        mb.add(prim_box(0.05 * s, 0.016 * s, th), 'rune', T @ M((0, -0.03 * s, 0)))
    else:
        mb.add(prim_extrude([(0, 0.07 * s), (0.045 * s, 0), (0, -0.07 * s), (-0.045 * s, 0)], th, axis='z'), 'rune', T)


def build_torso(mats, root):
    mb = MeshBuilder('Torso')
    # peito nu e musculoso sob o manto aberto (pele cinzenta com runas)
    chest = [ring_h(-0.30, 0.38, 0.30, 12), ring_h(-0.10, 0.36, 0.28, 12, cz=0.01), ring_h(0.10, 0.44, 0.31, 12, cz=0.04),
             ring_h(0.28, 0.54, 0.33, 12, cz=0.04), ring_h(0.38, 0.40, 0.26, 12, cz=0.0), ring_h(0.46, 0.2, 0.17, 12)]
    mb.add(prim_rings(chest), 'skin', smooth=65)
    for sx in (-1, 1):  # peitorais e abdômen
        mb.add(prim_sphere(0.19, 0.13, 0.1, 8, 3), 'skin', M((sx * 0.17, 0.22, 0.31), (8, sx * 10, 0)), smooth=70)
    for k in range(3):
        mb.add(prim_sphere(0.14, 0.05, 0.06, 6, 3), 'skin', M((0, 0.0 - k * 0.1, 0.285)), smooth=70)
    # runas luminosas no peito
    rune_line(mb, M((-0.17, 0.25, 0.425)), 0, 1.1)
    rune_line(mb, M((0.17, 0.25, 0.425)), 1, 1.1)
    rune_line(mb, M((0.0, 0.08, 0.37)), 2, 0.9)
    # arnês de ossos: costelas amarradas sobre o peito
    for k in range(4):
        y = 0.30 - k * 0.12
        for sx in (-1, 1):
            pts = [(sx * 0.05, y, 0.325), (sx * 0.23, y - 0.01, 0.30), (sx * 0.38, y - 0.05, 0.19)]
            tube(mb, pts, [0.024, 0.024, 0.02], 'bone', n=5, smooth=50)
    mb.add(prim_box(0.05, 0.5, 0.05), 'bone', M((0, 0.12, 0.33)), bevel=0.008)
    # manto esfarrapado de ombros e capuz (capa grossa)
    mantle = [ring_h(0.46, 0.30, 0.24, 12), ring_h(0.40, 0.50, 0.34, 12), ring_h(0.26, 0.64, 0.40, 12), ring_h(0.14, 0.62, 0.38, 12)]
    mb.add(prim_rings(mantle, cap0=False, cap1=False), 'robe', smooth=50)
    jag = [ring_h(0.16, 0.62, 0.385, 12)]
    for sx in (-1, 1):  # ombreiras de crânio com espigões
        for dz, ys in ((0.0, 0.0),):
            skull(mb, M((sx * 0.50, 0.46, 0.04), (0, sx * 60, 0), s=1.0), 0.55)
        for k in range(3):
            mb.add(prim_cone(0.045, 0.2 - 0.03 * k, 5), 'bone', M((sx * (0.46 + 0.07 * k), 0.58 - 0.06 * k, -0.12 - 0.05 * k), (-18, 0, -sx * (25 + 14 * k))))
        mb.add(prim_cyl(0.20, 0.2, 0.035, 10), 'leather', M((sx * 0.5, 0.36, 0.0), (0, 0, -sx * 22)), smooth=30)
    # colar de ossos/dentes e amuleto de crânio
    for k in range(11):
        a = math.radians(-82 + k * 16.4)
        x, z = math.sin(a) * 0.34, math.cos(a) * 0.26
        y = 0.47 - 0.12 * math.cos(a * 1.2) * 0.0 - (0.1 * (1 - math.cos(a * 0.95)) * 0)
        mb.add(prim_cone(0.026, 0.12 + 0.04 * (1 - abs(k - 5) / 5.0), 5), 'bone', M((x, 0.40 - 0.04 * (1 - abs(k - 5) / 5.0) * 0 - 0.03 * abs(k - 5) * 0.2, z), (-12, math.degrees(a), 180)))
    # cinto de ossos e corda, fivela de crânio
    mb.add(prim_rings([ring_h(-0.28, 0.375, 0.295, 12), ring_h(-0.1, 0.36, 0.285, 12, cz=0.01)]), 'leather', smooth=40)
    skull(mb, M((0, -0.18, 0.3)), 0.42)
    for i in range(7):
        a = math.radians(-72 + i * 24)
        mb.add(prim_cone(0.025, 0.1, 5), 'bone', M((math.sin(a) * 0.375, -0.2, math.cos(a) * 0.295), (0, math.degrees(a), 180)))
    # saiote do manto: tiras esfarrapadas de pano (frente/trás) + faixas de time
    for k, x in enumerate((-0.28, -0.1, 0.1, 0.28)):
        L = 0.62 + 0.12 * ((k * 5) % 3)
        mb.add(cloth_panel((x - 0.07, -0.22, 0.30), (x + 0.07, -0.22, 0.30), (x - 0.09, -0.22 - L, 0.36), (x + 0.09, -0.22 - L, 0.36),
                           nx=2, ny=4, thick=0.03, wave=0.02, jag=0.05), 'robe_dark', smooth=50)
    for x in (-0.19, 0.19):
        mb.add(cloth_panel((x - 0.06, -0.2, 0.32), (x + 0.06, -0.2, 0.32), (x - 0.07, -0.88, 0.40), (x + 0.07, -0.88, 0.40),
                           nx=2, ny=5, thick=0.03, wave=0.025, jag=0.06), 'team', smooth=50)
    # capa esfarrapada nas costas com faixa de time e fumaça
    cape = ((0.40, 0.44, -0.30), (-0.40, 0.44, -0.30), (0.58, -0.92, -0.62), (-0.58, -0.92, -0.62))
    mb.add(cloth_panel(*cape, nx=6, ny=6, thick=0.05, bulge=(0, 0, -0.14), wave=0.08, jag=0.14, wave_k=4.0), 'robe', smooth=50)
    mb.add(cloth_panel((0.07, 0.30, -0.37), (-0.07, 0.30, -0.37), (0.14, -0.96, -0.70), (-0.14, -0.96, -0.70),
                       nx=2, ny=6, thick=0.03, bulge=(0, 0, -0.1), wave=0.06, jag=0.08), 'team', smooth=50)
    for (x, y, z, r) in ((-0.55, -0.85, -0.5, 0.18), (0.2, -0.9, -0.7, 0.2), (0.58, -0.84, -0.48, 0.16), (-0.2, -0.92, -0.72, 0.15)):
        smoke_puff(mb, x, y, z, r)
    return mb.build(mats, parent=root, location=TORSO_PIVOT)


def build_leg(mats, root, side):
    s = side
    mb = MeshBuilder('LegR' if s > 0 else 'LegL')
    rings = [ring_h(0.02, 0.2, 0.26, 12), ring_h(-0.2, 0.22, 0.29, 12), ring_h(-0.38, 0.24, 0.31, 12)]
    rings = [[(x + (0.04 if i % 2 else -0.0) * 0, y, z) for i, (x, y, z) in enumerate(r)] for r in rings]
    # barra esfarrapada (alterna comprimento)
    hem = [(x, y - (0.12 if i % 2 else 0.0), z) for i, (x, y, z) in enumerate(ring_h(-0.50, 0.255, 0.325, 12))]
    rings.append(hem)
    mb.add(prim_rings(rings, cap0=False, cap1=False), 'robe', M((s * -0.01, 0, 0)), smooth=55)
    # tiras de time penduradas na coxa
    mb.add(cloth_panel((s * 0.0 - 0.05, -0.08, 0.30), (s * 0.0 + 0.05, -0.08, 0.30), (-0.06, -0.62, 0.34), (0.06, -0.62, 0.34),
                       nx=2, ny=4, thick=0.025, wave=0.02, jag=0.05), 'team', smooth=50)
    # pés: ataduras de couro, garras
    mb.add(prim_box(0.22, 0.18, 0.36, taper=(0.85, 0.6), base=True), 'leather', M((0.0, -0.66, 0.06)), bevel=0.02, smooth=35)
    for k in range(3):
        mb.add(prim_cone(0.03, 0.09, 4), 'bone', M(((k - 1) * 0.06, -0.62, 0.29), (90, 0, 0)))
    for (x, z, r) in ((0.24 * s, 0.08, 0.15), (-0.1 * s, 0.34, 0.14), (0.05 * s, -0.3, 0.17)):
        smoke_puff(mb, x, -0.58, z, r)
    return mb.build(mats, parent=root, location=(s * LEG_PIVOT[0], LEG_PIVOT[1], LEG_PIVOT[2]))


def build_head(mats, root):
    mb = MeshBuilder('Head')
    # cabeça orc: crânio + face inferior com mandíbula saliente
    rings = [ring_h(0.07, 0.19, 0.19, 12, cz=0.06), ring_h(0.17, 0.215, 0.23, 12, cz=0.04), ring_h(0.27, 0.2, 0.22, 12, cz=0.02),
             ring_h(0.36, 0.15, 0.17, 12, cz=0.0), ring_h(0.42, 0.07, 0.08, 12)]
    mb.add(prim_rings(rings), 'skin', smooth=70)
    mb.add(prim_box(0.36, 0.17, 0.30, taper=(0.92, 0.85)), 'skin', M((0, 0.0, 0.14), (-8, 0, 0)), bevel=0.04, bevel_segments=2, smooth=45)
    mb.add(prim_box(0.22, 0.05, 0.06), 'dark', M((0, 0.06, 0.28)))
    for sx in (-1, 1):  # presas e dentes
        mb.add(prim_box(0.04, 0.04, 0.03), 'bone', M((sx * 0.05, 0.075, 0.305)), bevel=0.008)
        path = [(sx * 0.12, 0.03, 0.28), (sx * 0.145, 0.15, 0.34), (sx * 0.17, 0.25, 0.33)]
        mb.add(prim_rings(limb_rings(path, [0.05, 0.035, 0.007], 6), cap1=False), 'bone', smooth=70)
        # sobrancelhas pesadas, olhos verdes brilhantes
        mb.add(prim_box(0.2, 0.07, 0.12, taper=(0.9, 0.7)), 'skin_dark', M((sx * 0.1, 0.235, 0.215), (14, 0, sx * 22)), bevel=0.02)
        mb.add(prim_sphere(0.05, 0.022, 0.03, 6, 3), 'eye', M((sx * 0.09, 0.19, 0.24), (0, 0, sx * 16)), smooth=80)
    mb.add(prim_box(0.16, 0.09, 0.08, taper=(0.45, 0.5)), 'skin', M((0, 0.12, 0.27), (-15, 0, 0)), bevel=0.02)
    # runas de tatuagem na testa (só na frente)
    rune_line(mb, M((0.0, 0.33, 0.185), (-14, 0, 0)), 2, 0.55)
    # capuz com abertura frontal: arco aberto atrás/topo/lados (não cobre o rosto em +Z)
    def arc(y, rx, rz, cz=0.0, n=11, gap=0.95):
        pts = []
        a0 = math.pi / 2 + gap
        a1 = math.pi / 2 + 2 * math.pi - gap
        for i in range(n):
            a = a0 + (a1 - a0) * i / (n - 1)
            pts.append((math.cos(a) * rx, y, cz + math.sin(a) * rz))
        return pts
    hood = [arc(-0.1, 0.30, 0.31, -0.02, gap=0.7), arc(0.1, 0.34, 0.36, -0.03, gap=0.8), arc(0.28, 0.32, 0.34, -0.05, gap=0.95),
            arc(0.45, 0.24, 0.26, -0.1, gap=1.1), arc(0.58, 0.14, 0.15, -0.2, gap=1.3), arc(0.66, 0.05, 0.06, -0.34, gap=1.4)]
    mb.add(prim_rings(hood, cap0=False, cap1=False, closed=False), 'robe_dark', smooth=55)
    # capuz forrado (interior mais claro p/ dar profundidade) + pico traseiro caído
    tail = bezier((0, 0.60, -0.28), (0, 0.55, -0.55), (0, 0.18, -0.78), 5)
    tube(mb, tail, [0.12, 0.1, 0.085, 0.06, 0.035, 0.008], 'robe_dark', n=6, smooth=50)
    # chifres de osso retorcidos saindo do capuz
    for sx in (-1, 1):
        hp = bezier((sx * 0.30, 0.3, 0.0), (sx * 0.62, 0.38, -0.05), (sx * 0.5, 0.82, 0.18), 5)
        tube(mb, hp, [0.075, 0.065, 0.052, 0.036, 0.02, 0.005], 'bone', n=6, smooth=65)
        for k in range(2):
            mb.add(prim_cyl(0.083 - 0.01 * k, 0.083 - 0.01 * k, 0.025, 8, base=False), 'iron',
                   M(tuple(Vector(hp[k + 0]) + Vector((sx * 0.01, 0, 0)))), smooth=30)
    # testeira de osso com espigões e crânio pequeno no centro
    mb.add(prim_box(0.34, 0.035, 0.05), 'bone', M((0, 0.42, 0.19), (-20, 0, 0)))
    skull(mb, M((0, 0.47, 0.19), (-10, 0, 0)), 0.3)
    # gola alta do capuz (atrás do pescoço)
    for sx in (-1, 1):
        mb.add(prim_box(0.28, 0.3, 0.04), 'robe_dark', M((sx * 0.14, -0.05, -0.2), (-8, sx * 24, sx * -12)))
    return mb.build(mats, parent=root, location=HEAD_PIVOT)


def build_arm(mats, root, side):
    s = side
    mb = MeshBuilder('ArmR' if s > 0 else 'ArmL')
    sh = Vector((s * 0.03, -0.08, 0.0))
    e = Vector((s * 0.08, -0.36, 0.02))
    w = Vector((s * 0.1, -0.64, 0.14 if s > 0 else 0.08))
    tube(mb, [tuple(sh), tuple(sh.lerp(e, 0.5)), tuple(e)], [0.15, 0.17, 0.14], 'skin', n=9)
    mb.add(prim_sphere(0.14, 0.14, 0.14, 8, 4), 'skin', M(tuple(e)), smooth=65)
    d = (w - e).normalized()
    tube(mb, [tuple(e), tuple(e.lerp(w, 0.45)), tuple(w)], [0.13, 0.15, 0.105], 'skin', n=9)
    # braçadeira de ossos/ferro com espetos
    mb.add(prim_cyl(0.155, 0.12, 0.17, 9), 'iron', Matrix.Translation(e.lerp(w, 0.62)) @ orient(d), smooth=35, bevel=0.01)
    mb.add(prim_cone(0.04, 0.16, 5), 'bone', Matrix.Translation(e.lerp(w, 0.55) + Vector((s * 0.14, 0, 0.0))) @ orient((s, 0.1, 0)))
    mb.add(prim_cone(0.04, 0.14, 5), 'bone', Matrix.Translation(e.lerp(w, 0.7) + Vector((s * 0.12, 0, -0.08))) @ orient((s, 0.1, -0.5)))
    # manga rasgada no braço superior com friso
    mb.add(prim_cyl(0.19, 0.2, 0.2, 10), 'robe', Matrix.Translation(sh.lerp(e, 0.4)) @ orient(e - sh), smooth=40)
    mb.add(prim_cyl(0.205, 0.205, 0.02, 10), 'bone', Matrix.Translation(sh.lerp(e, 0.62)) @ orient(e - sh), smooth=30)
    # mão com garras
    Tw = Matrix.Translation(w + d * 0.01) @ orient(d)
    fist(mb, Tw, 1.4, 'skin', knuckle='skin_dark')
    for k in range(4):
        mb.add(prim_cone(0.016, 0.07, 4), 'bone', Tw @ M(((k - 1.5) * 0.042, 0.19, 0.12), (70, 0, 0)))
    return mb.build(mats, parent=root, location=(s * ARM_PIVOT[0], ARM_PIVOT[1], ARM_PIVOT[2]))


def build_weapon(mats, root):
    mb = MeshBuilder('Weapon')
    y0, y1 = -0.70, 1.72
    # haste de osso/madeira nodosa
    tube(mb, [(0.0, y0, 0.0), (0.02, 0.4, 0.01), (-0.02, 1.1, 0.0), (0.0, y1, 0.0)], [0.045, 0.05, 0.048, 0.05], 'wood', n=7, smooth=45)
    mb.add(prim_cone(0.05, 0.14, 7), 'iron', M((0, y0 - 0.12, 0), (180, 0, 0)))
    for y in (-0.36, 0.12, 0.6, 1.1):
        mb.add(prim_cyl(0.065, 0.065, 0.04, 8, base=False), 'bone', M((0, y, 0)), smooth=30)
    mb.add(prim_cyl(0.058, 0.058, 0.3, 8, base=False), 'leather', M((0, 0.04, 0)), smooth=30)
    # tiras de pano de time e amuletos de osso
    for k, (dz, L) in enumerate(((0.0, 0.5), (0.0, 0.36))):
        mb.add(cloth_panel((-0.03 - 0.03 * k, 1.5, 0.05), (0.01 - 0.03 * k, 1.5, 0.06), (-0.05 - 0.04 * k, 1.5 - L, 0.12), (0.03 - 0.04 * k, 1.5 - L, 0.13),
                           nx=1, ny=3, thick=0.02, wave=0.015, jag=0.04), 'team', smooth=40)
    # crânio grande de besta no topo com chifres e mandíbula; olhos acesos
    skull(mb, M((0, 1.98, 0.0), (-8, 0, 0)), 0.78)
    for sx in (-1, 1):
        mb.add(prim_sphere(0.035, 0.035, 0.02, 6, 3), 'eye', M((sx * 0.15, 1.96, 0.28)), smooth=60)
    # garras de osso curvas que seguram a chama acima do crânio
    for k in range(3):
        a = math.radians(90 + k * 120)
        pts = [(math.sin(a) * 0.1, 2.15, math.cos(a) * 0.1 - 0.05), (math.sin(a) * 0.2, 2.32, math.cos(a) * 0.2 - 0.05),
               (math.sin(a) * 0.14, 2.52, math.cos(a) * 0.14 - 0.05)]
        tube(mb, pts, [0.03, 0.024, 0.006], 'bone', n=5, smooth=50)
    # pendurados: ossinhos e crânio pequeno
    for k, y in enumerate((0.9, 1.0)):
        mb.add(prim_cone(0.025, 0.12, 4), 'bone', M((0.07, y, 0.0), (180, 0, 8)))
    w = mb.build(mats, parent=root, location=WEAPON_PIVOT)
    cb = MeshBuilder('Crystal')
    # chama de alma: gota alta facetada + núcleo claro + fagulhas
    cb.add(prim_cone(0.2, 0.46, 6), 'flame', M((0, 0.0, 0)), smooth=0, bevel=0.004)
    cb.add(prim_cone(0.2, 0.26, 6), 'flame', M((0, 0.0, 0), (180, 0, 0)), smooth=0)
    cb.add(prim_cone(0.09, 0.3, 6), 'core', M((0, 0.0, 0)), smooth=0)
    for k in range(3):
        a = 2 * math.pi * k / 3
        cb.add(prim_cone(0.05, 0.18, 4), 'flame', M((math.sin(a) * 0.3, 0.1 + 0.1 * k, math.cos(a) * 0.3 - 0.05)), smooth=0)
    return w, cb.build(mats, parent=w, location=(0, 2.38, -0.05))


def main():
    args = C.script_args()
    C.reset_scene()
    mats = C.make_paint_set(PALETTE)
    root = C.make_empty('Necromancer')
    torso = build_torso(mats, root)
    head = build_head(mats, root)
    arm_l = build_arm(mats, root, -1)
    arm_r = build_arm(mats, root, 1)
    leg_l = build_leg(mats, root, -1)
    leg_r = build_leg(mats, root, 1)
    weapon, crystal = build_weapon(mats, root)
    parts = [torso, head, arm_l, arm_r, leg_l, leg_r, weapon, crystal]
    finish_unit('necromancer', 'necromancer.glb', 'necromancer_atlas', root, parts,
                {'Head': 1.6, 'Torso': 1.2, 'Weapon': 0.9, 'LegL': 0.7, 'LegR': 0.7, 'ArmL': 1.0, 'ArmR': 1.0, 'Crystal': 0.6},
                TEAM_DEFAULT, args, cam_h=2.4, focus=1.25)


if __name__ == '__main__':
    main()
