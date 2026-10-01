"""
build_skeleton.py — Esqueleto de combate (tipo interno `skeleton`) gerado 100% por script.

Uso:
  blender -b --factory-startup --python tools/blender/build_skeleton.py -- [--no-render]

Hierarquia PLANA (igual a SkeletonModel.js procedural), com o Weapon dentro de ArmR para a espada
acompanhar o braço (o UnitAnimator não toca o Weapon do esqueleto):
  Skeleton (raiz)
  ├─ Torso   pivô (0, 1.05, 0)   coluna, costelas, bacia, couraça enferrujada pela metade, trapos de time
  ├─ Head    pivô (0, 1.60, 0.07)  crânio com olhos verdes, elmo amassado enferrujado; rosto só em +Z
  ├─ ArmL / ArmR  pivô (∓0.44, 1.27, 0)   (ArmR > Weapon: cutelo enferrujado)
  └─ LegL / LegR  pivô (∓0.16, 0.66, 0)
Postura agressiva: torso inclinado para a frente, cabeça projetada, mandíbula aberta.
"""
import os
import sys
import math

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mathutils import Vector, Matrix  # noqa: E402
import common as C  # noqa: E402
from common import (MeshBuilder, M, prim_box, prim_rings, ring_h, prim_cyl, prim_cone,  # noqa: E402
                    prim_sphere, prim_extrude, limb_rings, bezier)
from unit_common import orient, cloth_panel, tube, finish_unit  # noqa: E402

TORSO_PIVOT = (0.0, 1.05, 0.0)
HEAD_PIVOT = (0.0, 1.58, 0.17)
ARM_PIVOT = (0.46, 1.25, 0.10)
LEG_PIVOT = (0.17, 0.66, 0.0)
TEAM_DEFAULT = '#c23a2a'
LEAN = 0.16
LEAN_DEG = 10.0   # inclinação do tronco para a frente (z por y)


def lz(y):
    """Deslocamento z da coluna na altura y (tronco inclinado, ombros à frente)."""
    return LEAN * max(y, -0.1) + 0.0


PALETTE = {
    'bone': dict(base='#e6dcc0', var='#b8a97c', var_scale=5.0, var_amt=0.85, fine=0.1, top=0.3,
                 edge='#fff8e2', edge_amt=0.55, edge_r=0.015, edge_gain=10.0, ao=(0.2, 0.65)),
    'bone_dark': dict(base='#9d9275', var='#6f654c', var_scale=4.0, var_amt=0.8, fine=0.1, top=0.2, ao=(0.2, 0.6)),
    'rust': dict(base='#6f5440', var='#9a5a2c', var_scale=7.0, var_amt=0.9, fine=0.22, fine_scale=30.0, top=0.35,
                 edge='#cfb27e', edge_amt=0.7, edge_r=0.02, edge_gain=11.0, ao=(0.25, 0.65)),
    'rust_dark': dict(base='#3c2c24', var='#5e3a20', var_scale=7.0, var_amt=0.9, fine=0.16, top=0.25,
                      edge='#a07a4a', edge_amt=0.5, edge_r=0.02, ao=(0.25, 0.65)),
    'iron': dict(base='#4a4d56', var='#2e3037', var_scale=7.0, var_amt=0.8, fine=0.14, top=0.35,
                 edge='#b8bfcb', edge_amt=0.9, edge_r=0.02, edge_gain=12.0, ao=(0.25, 0.55)),
    'blade': dict(base='#7d7c78', var='#5e4a38', var_scale=9.0, var_amt=1.0, fine=0.18, top=0.4,
                  edge='#e2dcc8', edge_amt=1.0, edge_r=0.02, edge_gain=14.0, ao=(0.2, 0.4)),
    'leather': dict(base='#4f3220', var='#34200f', var_scale=6.0, fine=0.12, top=0.2,
                    edge='#8a5c36', edge_amt=0.5, edge_r=0.02, ao=(0.25, 0.6)),
    'rag': dict(base='#6b5a42', var='#443726', var_scale=4.0, var_amt=0.9, fine=0.12, top=0.25, ao=(0.3, 0.6)),
    'dark': dict(base='#0b0908', var='#0b0908'),
    'eye': dict(base='#9dff6a', var='#5be02c', var_scale=20.0, emit_boost=1.4),
    'team': dict(base='#b8b0a4', var='#9d9589', var_scale=5.0, fine=0.08, top=0.25,
                 edge='#d8d2c8', edge_amt=0.3, edge_r=0.03, ao=(0.3, 0.65), team=True),
}


def bone(mb, p0, p1, r0, r1, mat='bone', knob=None, n=7):
    """Osso longo: haste entre p0 e p1 com epífises (bolas) nas pontas."""
    p0, p1 = Vector(p0), Vector(p1)
    mid = p0.lerp(p1, 0.5)
    mb.add(prim_rings(limb_rings([tuple(p0), tuple(mid), tuple(p1)], [r0, (r0 + r1) * 0.42, r1], n)), mat, smooth=60)
    k = knob or max(r0, r1) * 1.55
    for p in (p0, p1):
        mb.add(prim_sphere(k, k * 0.95, k, 6, 3), mat, Matrix.Translation(p), smooth=65)


def build_torso(mats, root):
    mb = MeshBuilder('Torso')
    # bacia: asas ilíacas abertas + sacro
    for sx in (-1, 1):
        mb.add(prim_box(0.22, 0.2, 0.1, taper=(1.25, 1.0)), 'bone', M((sx * 0.14, -0.2, 0.0), (0, sx * -22, sx * -12)), bevel=0.012)
        mb.add(prim_sphere(0.08, 0.08, 0.08, 6, 3), 'bone', M((sx * 0.16, -0.32, 0.03)), smooth=65)
    mb.add(prim_box(0.14, 0.16, 0.08, taper=(0.7, 1.0)), 'bone_dark', M((0, -0.24, -0.06)), bevel=0.01)
    # coluna: vértebras com leve curvatura (corcunda agressiva)
    for k in range(9):
        y = -0.12 + k * 0.065
        mb.add(prim_cyl(0.055 - 0.003 * k, 0.05 - 0.003 * k, 0.045, 7, base=False), 'bone', M((0, y, -0.03 + lz(y) * 0.3)), smooth=40)
        mb.add(prim_box(0.02, 0.03, 0.05), 'bone_dark', M((0, y, -0.075 + lz(y) * 0.3)))
    # cavidade do tórax escura (dá contraste entre as costelas)
    cav = [ring_h(-0.08, 0.2, 0.15, 10, cz=0.03), ring_h(0.1, 0.25, 0.19, 10, cz=0.04), ring_h(0.28, 0.25, 0.18, 10, cz=0.04),
           ring_h(0.38, 0.17, 0.12, 10, cz=0.03)]
    mb.add(prim_rings(cav), 'dark', smooth=60)
    # costelas: 6 pares
    for k in range(6):
        y = 0.38 - k * 0.095
        w = 0.20 + 0.07 * math.sin(math.pi * (k + 0.4) / 6.5)
        for sx in (-1, 1):
            pts = [(sx * 0.03, y, -0.02), (sx * w * 1.05, y + 0.015, 0.01), (sx * w * 1.0, y - 0.01, 0.17), (sx * 0.06, y - 0.045, 0.235)]
            tube(mb, pts, [0.03, 0.028, 0.026, 0.02], 'bone', n=5, smooth=55)
    mb.add(prim_box(0.07, 0.3, 0.045, taper=(0.6, 1.0)), 'bone', M((0, 0.2, 0.235)), bevel=0.01)
    # clavículas e omoplatas
    for sx in (-1, 1):
        bone(mb, (sx * 0.06, 0.42, 0.12), (sx * 0.34, 0.45, 0.0), 0.028, 0.03)
        mb.add(prim_box(0.2, 0.22, 0.03, taper=(0.7, 1.0)), 'bone', M((sx * 0.2, 0.3, -0.12), (-10, sx * 22, sx * -8)), bevel=0.008)
    # meia couraça enferrujada (cobre o lado direito do peito e o ombro), fixa com correias
    plate = [ring_h(-0.02, 0.24, 0.19, 10, cz=0.04), ring_h(0.18, 0.28, 0.205, 10, cz=0.05), ring_h(0.38, 0.30, 0.19, 10, cz=0.03)]
    mb.add(prim_rings(plate, cap0=False, cap1=False), 'rust', M((0.0, 0, 0)), smooth=45, bevel=0.006,
           mat_fn=lambda c, n: 'rust_dark' if (c[0] < -0.02 or (c[1] > 0.3 and c[0] < 0.1)) else None)
    mb.add(prim_rings([ring_h(0.37, 0.305, 0.195, 10, cz=0.03), ring_h(0.40, 0.3, 0.19, 10, cz=0.03)], cap0=False, cap1=False), 'iron', smooth=30)
    for (x, y) in ((0.18, 0.08), (0.2, 0.24), (0.1, 0.33), (0.22, -0.02)):
        mb.add(prim_sphere(0.022, 0.022, 0.02, 5, 3), 'iron', M((x, y, 0.245 + abs(x) * 0.0)), smooth=60)
    mb.add(prim_box(0.12, 0.28, 0.02), 'rust_dark', M((0.12, 0.17, 0.262), (0, 0, 8)))   # remendo
    for dy in (0.05, 0.3):
        mb.add(prim_box(0.62, 0.05, 0.04), 'leather', M((0.0, dy, 0.03), (0, 0, 0)))
    # gorjal enferrujado + dentes de serra
    mb.add(prim_rings([ring_h(0.42, 0.17, 0.14, 12, cz=0.06), ring_h(0.50, 0.12, 0.1, 12, cz=0.08)], cap0=False, cap1=False), 'rust', smooth=40)
    # cinto, fivela e saiote de trapos (time)
    mb.add(prim_rings([ring_h(-0.24, 0.27, 0.2, 12, cz=0.0), ring_h(-0.1, 0.275, 0.205, 12)]), 'leather', smooth=40)
    mb.add(prim_box(0.14, 0.12, 0.05), 'rust', M((0, -0.17, 0.2)), bevel=0.01)
    mb.add(cloth_panel((-0.2, -0.16, 0.2), (0.2, -0.16, 0.2), (-0.24, -0.72, 0.24), (0.24, -0.72, 0.24),
                       nx=4, ny=4, thick=0.025, wave=0.025, jag=0.07, bulge=(0, 0, 0.03)), 'team', smooth=50)
    mb.add(cloth_panel((0.2, -0.16, -0.14), (-0.2, -0.16, -0.14), (0.24, -0.6, -0.2), (-0.24, -0.6, -0.2),
                       nx=4, ny=3, thick=0.025, wave=0.025, jag=0.07), 'rag', smooth=50)
    # faixa de time cruzando o peito (trapo atado)
    mb.add(cloth_panel((-0.16, 0.38, 0.0), (-0.07, 0.4, 0.0), (0.25, -0.08, 0.0), (0.16, -0.12, 0.0)), 'team', M((0, 0, 0.0)), smooth=40)
    # capa rasgada curta nas costas
    mb.add(cloth_panel((0.28, 0.42, -0.1), (-0.28, 0.42, -0.1), (0.36, -0.5, -0.32), (-0.36, -0.5, -0.32),
                       nx=5, ny=5, thick=0.03, bulge=(0, 0, -0.1), wave=0.06, jag=0.12, wave_k=4.0), 'rag', smooth=50)
    t = mb.build(mats, parent=root, location=TORSO_PIVOT)
    t.data.transform(C.game_to_blender_matrix(M(r=(LEAN_DEG, 0, 0))))
    return t


def build_head(mats, root):
    mb = MeshBuilder('Head')
    # crânio
    sk = [ring_h(-0.03, 0.085, 0.1, 10, cz=0.07), ring_h(0.06, 0.145, 0.16, 10, cz=0.03), ring_h(0.17, 0.165, 0.18, 10, cz=0.0),
          ring_h(0.27, 0.13, 0.145, 10, cz=-0.01), ring_h(0.33, 0.06, 0.07, 10, cz=-0.01)]
    mb.add(prim_rings(sk), 'bone', smooth=65)
    # face (somente +Z): órbitas fundas com brilho verde, cavidade nasal, maçãs do rosto, dentes
    for sx in (-1, 1):
        mb.add(prim_box(0.085, 0.085, 0.07), 'dark', M((sx * 0.07, 0.115, 0.165)), bevel=0.012)
        mb.add(prim_sphere(0.02, 0.02, 0.016, 6, 3), 'eye', M((sx * 0.07, 0.115, 0.2)), smooth=70)
        mb.add(prim_box(0.1, 0.03, 0.06), 'bone', M((sx * 0.075, 0.17, 0.17), (0, 0, sx * -12)), bevel=0.008)   # arcada
        mb.add(prim_box(0.07, 0.045, 0.06), 'bone', M((sx * 0.12, 0.04, 0.12)), bevel=0.01)
    mb.add(prim_extrude([(0, 0.05), (0.03, -0.035), (-0.03, -0.035)], 0.04, axis='z'), 'dark', M((0, 0.055, 0.19)))
    mb.add(prim_box(0.15, 0.07, 0.12, taper=(0.9, 0.8)), 'bone', M((0, -0.035, 0.14)), bevel=0.01)
    for k in range(6):
        mb.add(prim_box(0.021, 0.035, 0.02), 'bone', M(((k - 2.5) * 0.024, -0.075, 0.205)))
    # mandíbula aberta num rosnado (gira em torno da articulação)
    J = M((0, -0.01, 0.0), (22, 0, 0))
    mb.add(prim_box(0.15, 0.04, 0.17, taper=(0.9, 0.8)), 'bone', J @ M((0, -0.105, 0.1)), bevel=0.008)
    for sx in (-1, 1):
        mb.add(prim_box(0.035, 0.12, 0.04), 'bone', J @ M((sx * 0.085, -0.05, 0.0)))
    for k in range(6):
        mb.add(prim_box(0.02, 0.03, 0.02), 'bone', J @ M(((k - 2.5) * 0.024, -0.075, 0.185)))
    # elmo amassado enferrujado: calota baixa, aba, protetor nasal quebrado, buraco no topo e espigão
    mb.add(prim_sphere(0.2, 0.2, 0.21, 12, 4, y_min=0.0), 'iron', M((0, 0.15, -0.0)), smooth=45,
           mat_fn=lambda c, n: 'rust' if (c[0] < -0.03 or c[2] < -0.05) else None)
    for sx in (-1, 1):   # bochechas
        mb.add(prim_box(0.05, 0.2, 0.14, taper=(0.8, 0.9)), 'iron', M((sx * 0.185, 0.05, 0.06), (0, sx * -8, sx * 10)), bevel=0.01)
    mb.add(prim_cyl(0.215, 0.21, 0.05, 12), 'iron', M((0, 0.15, 0.0)), smooth=35)
    mb.add(prim_box(0.045, 0.2, 0.04), 'rust', M((0, 0.1, 0.19), (6, 0, 0)), bevel=0.01)
    mb.add(prim_box(0.04, 0.08, 0.34, taper=(0.4, 0.9)), 'iron', M((0, 0.35, 0.0)), bevel=0.01)
    mb.add(prim_cone(0.03, 0.12, 5), 'iron', M((0, 0.35, 0.16), (90, 0, 0)))
    # chifrezinho quebrado + corte (rachadura escura)
    mb.add(prim_box(0.02, 0.1, 0.02), 'rust_dark', M((0.07, 0.3, 0.12), (0, 0, 20)))
    # vértebras do pescoço
    for k in range(3):
        mb.add(prim_cyl(0.045, 0.045, 0.04, 7, base=False), 'bone', M((0, -0.1 - 0.05 * k, -0.04 - 0.01 * k)), smooth=40)
    return mb.build(mats, parent=root, location=HEAD_PIVOT)


def build_arm(mats, root, side):
    s = side
    mb = MeshBuilder('ArmR' if s > 0 else 'ArmL')
    sh = (s * 0.0, -0.04, 0.0)
    e = (s * 0.06, -0.34, 0.05)
    w = (s * 0.07, -0.62, 0.16 if s > 0 else 0.1)
    bone(mb, sh, e, 0.058, 0.052, knob=0.085)
    # antebraço: dois ossos paralelos (rádio e ulna)
    for dx in (-0.017, 0.017):
        bone(mb, (e[0] + dx, e[1], e[2]), (w[0] + dx, w[1], w[2]), 0.032, 0.026, knob=0.04, n=6)
    # ombreira enferrujada (a esquerda: grande e espinhosa; a direita: placa menor)
    big = s < 0
    k = 1.0 if big else 0.78
    for i, (rx, y, tilt) in enumerate(((0.19, 0.04, 22), (0.17, -0.06, 32))):
        T = M((s * (0.04 + 0.03 * i), y * k, 0.0), (0, 0, -s * tilt))
        mb.add(prim_sphere(rx * k, 0.12 * k, (rx - 0.01) * k, 10, 3, y_min=0.0), 'rust' if i == 0 else 'rust_dark', T, smooth=45, bevel=0.004)
        mb.add(prim_cyl(rx * k * 0.99, rx * k * 0.97, 0.02, 10), 'iron', T, smooth=30)
    mb.add(prim_cone(0.05 * k, 0.2 * k, 5), 'iron', M((s * 0.13, 0.08 * k, 0.0), (0, 0, -s * 55)))
    # braçadeira de couro e manopla enferrujada
    mb.add(prim_cyl(0.075, 0.066, 0.2, 9), 'rust', Matrix.Translation(Vector(e).lerp(Vector(w), 0.55)) @ orient(Vector(w) - Vector(e)), smooth=35, bevel=0.006)
    mb.add(prim_cyl(0.08, 0.08, 0.03, 9), 'leather', Matrix.Translation(Vector(e).lerp(Vector(w), 0.8)) @ orient(Vector(w) - Vector(e)), smooth=30)
    # mão esquelética: metacarpos + falanges em garra
    d = (Vector(w) - Vector(e)).normalized()
    Tw = Matrix.Translation(Vector(w) + d * 0.02) @ orient(d)
    mb.add(prim_box(0.1, 0.1, 0.045, taper=(0.9, 0.9)), 'bone', Tw @ M((0, 0.05, 0.0)), bevel=0.008)
    for kf in range(4):
        x = (kf - 1.5) * 0.03
        tube(mb, [tuple(Tw @ Vector((x, 0.1, 0.0))), tuple(Tw @ Vector((x, 0.17, 0.045))), tuple(Tw @ Vector((x, 0.16, 0.1)))],
             [0.013, 0.012, 0.009], 'bone', n=4, smooth=40)
    mb.add(prim_cone(0.014, 0.05, 4), 'bone', Tw @ M((0.075, 0.07, 0.04), (30, 0, -60)))
    return mb.build(mats, parent=root, location=ARM_PIVOT if s > 0 else (-ARM_PIVOT[0], ARM_PIVOT[1], ARM_PIVOT[2]))


def build_leg(mats, root, side):
    s = side
    mb = MeshBuilder('LegR' if s > 0 else 'LegL')
    hip = (0, 0.0, 0.0)
    knee = (s * 0.0, -0.34, 0.05)
    ank = (s * 0.0, -0.64, -0.0)
    bone(mb, hip, knee, 0.07, 0.058, knob=0.1)
    bone(mb, knee, ank, 0.055, 0.05, knob=0.08)
    mb.add(prim_box(0.035, 0.28, 0.035), 'bone', M((s * 0.03, -0.5, 0.0)))
    # cota/malha rasgada na coxa e joelheira com espigão
    mb.add(prim_cyl(0.095, 0.085, 0.2, 9), 'rust_dark', M((0, -0.14, 0.01)), smooth=35)
    mb.add(prim_cyl(0.1, 0.1, 0.03, 9), 'leather', M((0, -0.05, 0.01)), smooth=30)
    mb.add(prim_sphere(0.1, 0.09, 0.07, 8, 3, y_min=0.0), 'rust', M((0, -0.34, 0.11), (90, 0, 0)), smooth=45)
    mb.add(prim_cone(0.03, 0.1, 5), 'iron', M((0, -0.34, 0.2), (90, 0, 0)))
    # grevas enferrujadas na canela
    mb.add(prim_box(0.11, 0.26, 0.05, taper=(0.9, 1.0)), 'rust', M((0, -0.5, 0.07), (-6, 0, 0)), bevel=0.012)
    mb.add(prim_box(0.12, 0.03, 0.07), 'iron', M((0, -0.38, 0.07)))
    # pé: ossos do metatarso dentro de sabatão enferrujado
    mb.add(prim_box(0.15, 0.09, 0.3, taper=(0.8, 0.55), base=True), 'rust_dark', M((0, -0.7, 0.07)), bevel=0.018, smooth=35)
    mb.add(prim_box(0.11, 0.05, 0.12, base=True), 'rust', M((0, -0.65, 0.16)), bevel=0.012)
    # trapos pendurados do quadril (time)
    mb.add(cloth_panel((-0.06, -0.06, 0.1), (0.06, -0.06, 0.1), (-0.07, -0.5, 0.14), (0.07, -0.5, 0.14), nx=2, ny=3,
                       thick=0.02, wave=0.02, jag=0.05), 'rag', smooth=45)
    return mb.build(mats, parent=root, location=(s * LEG_PIVOT[0], LEG_PIVOT[1], LEG_PIVOT[2]))


def build_weapon(mats, arm_r):
    """Cutelo largo e enferrujado, com a lâmina para cima/para a frente, gume em +Z."""
    mb = MeshBuilder('Weapon')
    mb.add(prim_cyl(0.028, 0.028, 0.24, 7, base=False), 'leather', M((0, 0.0, 0)), smooth=45)
    for y in (-0.07, 0.0, 0.07):
        mb.add(prim_cyl(0.034, 0.034, 0.014, 7, base=False), 'rust_dark', M((0, y, 0)))
    mb.add(prim_sphere(0.045, 0.045, 0.045, 6, 3), 'rust', M((0, -0.15, 0)), smooth=60)
    mb.add(prim_box(0.07, 0.05, 0.3, taper=(1.0, 0.8)), 'iron', M((0, 0.14, 0.02)), bevel=0.01)
    mb.add(prim_box(0.075, 0.06, 0.06), 'rust', M((0, 0.14, 0.17)), bevel=0.01)
    # lâmina curva de gume único (z+ = gume), com mossas
    poly = [(-0.05, 0.16), (0.12, 0.16), (0.16, 0.45), (0.16, 0.8), (0.12, 1.02), (0.06, 1.1), (-0.04, 1.0), (-0.05, 0.6)]
    mb.add(prim_extrude(poly, 0.03, axis='x'), 'blade', M((0, 0, 0)), bevel=0.006, mat_fn=lambda c, n: 'rust_dark' if c[2] > 0.1 and c[1] > 0.5 and abs(c[1] - 0.66) < 0.05 else None)
    for (y, dz) in ((0.4, 0.17), (0.62, 0.17), (0.86, 0.14)):
        mb.add(prim_box(0.036, 0.05, 0.035), 'rust_dark', M((0, y, dz)))   # mossas no gume
    mb.add(prim_box(0.032, 0.8, 0.04), 'rust_dark', M((0, 0.62, -0.03)))    # lombo escurecido
    mb.add(prim_box(0.034, 0.5, 0.025), 'rust', M((0, 0.5, 0.06)))          # veio de ferrugem
    w = mb.build(mats, parent=arm_r, location=(0.075, -0.64, 0.16))
    C.set_rot_game(w, (55.0, 0.0, 0.0))
    return w


def main():
    args = C.script_args()
    C.reset_scene()
    mats = C.make_paint_set(PALETTE)
    root = C.make_empty('Skeleton')
    torso = build_torso(mats, root)
    head = build_head(mats, root)
    arm_l = build_arm(mats, root, -1)
    arm_r = build_arm(mats, root, 1)
    leg_l = build_leg(mats, root, -1)
    leg_r = build_leg(mats, root, 1)
    weapon = build_weapon(mats, arm_r)
    parts = [torso, head, arm_l, arm_r, leg_l, leg_r, weapon]
    finish_unit('skeleton', 'skeleton.glb', 'skeleton_atlas', root, parts,
                {'Head': 1.7, 'Torso': 1.2, 'Weapon': 0.8, 'LegL': 0.8, 'LegR': 0.8, 'ArmL': 1.0, 'ArmR': 1.0},
                TEAM_DEFAULT, args, cam_h=1.9)


if __name__ == '__main__':
    main()
