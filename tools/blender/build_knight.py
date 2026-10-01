"""
build_knight.py — soldado humano (Espadachim, tipo interno `knight`) gerado 100% por script.

Referência de arte: /home/rafael/Documentos/soldado.png (armadura de placas prateada com detalhes
dourados, elmo aberto de aço, capa e mangas azuis, cinto de couro, espada longa).

Uso:
  blender -b --factory-startup --python tools/blender/build_knight.py -- [--no-render]

Hierarquia PLANA (igual ao KnightModel.js procedural — o UnitAnimator anima Sword/Arm* com
rotações independentes e posições absolutas na raiz; não aninhe as peças):
  Knight (raiz)
  ├─ Torso   pivô (0, 1.05, 0)     (capa e saiote em cor de time)
  ├─ Head    pivô (0, 1.62, 0)
  ├─ ArmL / ArmR  pivô (∓0.38, 1.25, 0)  (ombreira incluída)
  ├─ LegL / LegR  pivô (∓0.16, 0.68, 0)
  └─ Sword   pivô (0.48, 0.75, 0.25), repouso rot x 0.5 rad / z −0.1 rad (gume para +Z)
Sem escudo (a referência não tem; o animador ignora ShieldGroup ausente).
"""
import os
import sys
import math

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mathutils import Vector, Matrix  # noqa: E402
import common as C  # noqa: E402
from common import (MeshBuilder, M, prim_box, prim_rings, ring_h, prim_cyl, prim_cone,  # noqa: E402
                    prim_sphere, prim_extrude, limb_rings, bezier)

TORSO_PIVOT = (0.0, 1.05, 0.0)
HEAD_PIVOT = (0.0, 1.62, 0.0)
ARM_PIVOT = (0.50, 1.27, 0.0)
LEG_PIVOT = (0.22, 0.68, 0.0)
SWORD_PIVOT = (0.66, 0.72, 0.30)
SHIELD_PIVOT = (-0.64, 0.95, 0.30)
SWORD_REST_DEG = (math.degrees(0.5), 0.0, math.degrees(-0.1))
TEAM_DEFAULT = '#1f4ac8'  # azul profundo (multiplica a área cinza)
# Ganchos usados por build_cavalier.py (o valor padrão reproduz o Espadachim a pé)
SKIRT = True
CAPE_FOLD = ((0, 0, -0.12), 0.06)   # (bulge, onda)
CAPE = ((0.34, 0.40, -0.22), (-0.34, 0.40, -0.22), (0.46, -0.92, -0.46), (-0.46, -0.92, -0.46))
SHIELD_SCALE = 1.0

PALETTE = {
    'steel': dict(base='#8791a3', var='#4a5263', var_scale=7.0, var_amt=0.75, fine=0.08, top=0.35,
                  edge='#f4f8ff', edge_amt=1.0, edge_r=0.02, edge_gain=12.0, ao=(0.25, 0.6),
                  grad=(0.0, 2.0, 0.22)),
    'steel_hi': dict(base='#c9d2df', var='#9da7b6', var_scale=8.0, fine=0.06, top=0.4,
                     edge='#ffffff', edge_amt=1.0, edge_r=0.015, edge_gain=12.0, ao=(0.2, 0.5)),
    'steel_dark': dict(base='#474e5d', var='#2f3540', var_scale=6.0, fine=0.1, top=0.3,
                       edge='#c4ccd9', edge_amt=0.9, edge_r=0.02, edge_gain=12.0, ao=(0.25, 0.65)),
    'gold': dict(base='#e3a522', var='#b5780f', var_scale=9.0, var_amt=0.7, fine=0.06, top=0.4,
                 edge='#ffe9a0', edge_amt=1.0, edge_r=0.018, edge_gain=12.0, ao=(0.2, 0.5)),
    'leather': dict(base='#6d4022', var='#4c2912', var_scale=6.0, fine=0.12, top=0.2,
                    edge='#a8703c', edge_amt=0.5, edge_r=0.02, ao=(0.25, 0.6)),
    'fur': dict(base='#ece6d6', var='#b9b09a', var_scale=14.0, var_amt=0.8, fine=0.18, top=0.3, ao=(0.3, 0.5)),
    'blade': dict(base='#d2dae6', var='#9aa6b8', var_scale=6.0, fine=0.06, top=0.4,
                  edge='#ffffff', edge_amt=1.0, edge_r=0.02, edge_gain=14.0, ao=(0.2, 0.4)),
    'dark': dict(base='#07090d', var='#07090d'),
    'team': dict(base='#b8b0a4', var='#9d9589', var_scale=5.0, fine=0.08, top=0.25,
                 edge='#d8d2c8', edge_amt=0.3, edge_r=0.03, ao=(0.3, 0.65), team=True),
}


def cloth_panel(top_l, top_r, bot_l, bot_r, nx=5, ny=4, thick=0.03, bulge=(0, 0, 0),
                wave=0.03, jag=0.04):
    """Painel de tecido (slab fino) entre 4 cantos, com dobras e barra irregular."""
    import mathutils
    V = mathutils.Vector
    tl, tr, bl, br = V(top_l), V(top_r), V(bot_l), V(bot_r)
    b = V(bulge)
    front, back = [], []
    for j in range(ny + 1):
        v = j / ny
        for i in range(nx + 1):
            u = i / nx
            p = (tl.lerp(tr, u)).lerp(bl.lerp(br, u), v)
            p = p + b * math.sin(math.pi * u) * v
            p.z += math.sin(u * math.pi * 3.0) * wave * v
            if j == ny:
                p.y += jag * (1 if i % 2 else -1)
            front.append(tuple(p))
            back.append(tuple(p + V((0, 0, -thick))))
    verts = front + back
    n = (nx + 1) * (ny + 1)
    faces = []
    for j in range(ny):
        for i in range(nx):
            a = j * (nx + 1) + i
            faces.append((a, a + 1, a + nx + 2, a + nx + 1))
            faces.append((n + a, n + a + nx + 1, n + a + nx + 2, n + a + 1))

    def idx(i, j):
        return j * (nx + 1) + i
    border = [idx(i, 0) for i in range(nx + 1)] + [idx(nx, j) for j in range(1, ny + 1)] + \
             [idx(i, ny) for i in range(nx - 1, -1, -1)] + [idx(0, j) for j in range(ny - 1, 0, -1)]
    for k in range(len(border)):
        a, c = border[k], border[(k + 1) % len(border)]
        faces.append((a, c, n + c, n + a))
    return verts, faces


# ---------------------------------------------------------------------------
def orient(d):
    return Vector((0, 1, 0)).rotation_difference(Vector(d).normalized()).to_matrix().to_4x4()


def build_torso(mats, root):
    mb = MeshBuilder('Torso')
    # gibão de malha sob a couraça
    tunic = [ring_h(-0.32, 0.27, 0.20, 14), ring_h(-0.10, 0.29, 0.21, 14), ring_h(0.20, 0.40, 0.23, 14),
             ring_h(0.36, 0.40, 0.22, 14)]
    mb.add(prim_rings(tunic), 'steel_dark', smooth=60)
    # couraça larga em V: cintura estreita, peito e ombros volumosos, quilha e nervuras
    breast = [ring_h(-0.18, 0.27, 0.205, 12, cz=0.02), ring_h(0.00, 0.35, 0.24, 12, cz=0.035),
              ring_h(0.17, 0.435, 0.265, 12, cz=0.04), ring_h(0.32, 0.455, 0.245, 12, cz=0.02),
              ring_h(0.41, 0.33, 0.18, 12)]
    mb.add(prim_rings(breast), 'steel', smooth=55, bevel=0.008)
    mb.add(prim_box(0.06, 0.60, 0.05, taper=(0.5, 0.6)), 'steel_hi', M((0, 0.11, 0.268)))
    # frisos dourados: cintura, cava dos braços, gola, peito (volutas)
    mb.add(prim_rings([ring_h(-0.175, 0.272, 0.208, 12, cz=0.02), ring_h(-0.14, 0.282, 0.212, 12, cz=0.02)],
                      cap0=False, cap1=False), 'gold', smooth=30)
    mb.add(prim_rings([ring_h(0.385, 0.34, 0.19, 12), ring_h(0.41, 0.335, 0.185, 12)], cap0=False, cap1=False),
           'gold', smooth=30)
    for sx in (-1, 1):
        mb.add(prim_box(0.05, 0.24, 0.05), 'gold', M((sx * 0.43, 0.28, 0.03), (0, 0, sx * -10)))
    for (y, rx, rz, cz) in ((0.215, 0.443, 0.272, 0.04), (0.035, 0.357, 0.246, 0.035)):
        mb.add(prim_rings([ring_h(y, rx, rz, 12, cz=cz), ring_h(y + 0.022, rx + 0.004, rz + 0.004, 12, cz=cz)],
                          cap0=False, cap1=False), 'gold', smooth=30)
    # gorjal em lâminas + gola de pele (arminho)
    for k, (y, rx, rz) in enumerate(((0.36, 0.25, 0.20), (0.41, 0.22, 0.18))):
        mb.add(prim_rings([ring_h(y - 0.045, rx, rz, 14), ring_h(y + 0.045, rx - 0.012, rz - 0.01, 14)], cap0=False,
                          cap1=False), 'steel_dark', smooth=40)
    mb.add(prim_rings([ring_h(0.33, 0.35, 0.26, 14), ring_h(0.40, 0.33, 0.245, 14), ring_h(0.47, 0.26, 0.20, 14),
                       ring_h(0.49, 0.20, 0.16, 14)], cap0=False, cap1=False), 'fur', smooth=70)
    # cinto largo com fivela grande, rebites e bolsa
    mb.add(prim_rings([ring_h(-0.30, 0.285, 0.215, 12), ring_h(-0.12, 0.29, 0.22, 12)]), 'leather', smooth=40)
    mb.add(prim_box(0.24, 0.17, 0.05), 'gold', M((0, -0.21, 0.23)))
    mb.add(prim_box(0.14, 0.09, 0.04), 'steel_dark', M((0, -0.21, 0.255)), bevel=0.012)
    mb.add(prim_sphere(0.03, 0.03, 0.02, 6, 3), 'gold', M((0, -0.21, 0.28)), smooth=60)
    for i in range(7):
        a = math.radians(-70 + i * 23)
        mb.add(prim_sphere(0.022, 0.022, 0.018, 5, 3), 'gold', M((math.sin(a) * 0.285, -0.27, math.cos(a) * 0.215)), smooth=60)
    mb.add(prim_box(0.15, 0.17, 0.11), 'leather', M((0.33, -0.25, 0.04), (0, 0, -8)), smooth=30)
    # tassetes em camadas (laterais) com barra dourada
    for sx in (-1, 1):
        for k in range(3):
            y = -0.31 - 0.095 * k
            mb.add(prim_box(0.22 - 0.01 * k, 0.11, 0.035, taper=(0.9, 1.0)), 'steel',
                   M((sx * 0.25, y, 0.13 - 0.008 * k), (-8 - k * 4, sx * -22, sx * -10 - k * 4)), bevel=0.008)
            mb.add(prim_box(0.22 - 0.01 * k, 0.022, 0.04), 'gold',
                   M((sx * (0.255 + 0.015 * k), y - 0.055, 0.145 - 0.008 * k), (-8 - k * 4, sx * -22, sx * -10 - k * 4)))
    # sobreveste (tabardo) azul de time sobre a couraça, com borda e brasão de ouro
    if SKIRT:
        mb.add(cloth_panel((-0.175, 0.04, 0.265), (0.175, 0.04, 0.265), (-0.22, -0.78, 0.30), (0.22, -0.78, 0.30),
                           nx=4, ny=5, thick=0.035, bulge=(0, 0, 0.035), wave=0.02, jag=0.02), 'team', smooth=50)
        mb.add(cloth_panel((0.21, 0.04, -0.20), (-0.21, 0.04, -0.20), (0.25, -0.80, -0.24), (-0.25, -0.80, -0.24),
                           nx=4, ny=5, thick=0.035, bulge=(0, 0, -0.035), wave=0.02, jag=0.02), 'team', smooth=50)
        for sx in (-1, 1):
            mb.add(prim_box(0.022, 0.80, 0.014), 'gold', M((sx * 0.172, -0.37, 0.305), (0, 0, sx * -3)))
        mb.add(prim_box(0.41, 0.03, 0.02), 'gold', M((0, -0.77, 0.325)))
        mb.add(prim_box(0.075, 0.36, 0.022), 'gold', M((0, -0.36, 0.322)))
        mb.add(prim_box(0.26, 0.075, 0.022), 'gold', M((0, -0.30, 0.322)))
        for dy in (0.20, -0.20):
            mb.add(prim_box(0.14, 0.05, 0.022), 'gold', M((0, -0.36 + dy, 0.322)))
        for dx in (-0.16, 0.16):
            mb.add(prim_box(0.05, 0.14, 0.022), 'gold', M((dx, -0.30, 0.322)))
        mb.add(prim_extrude([(0, 0.06), (0.05, 0), (0, -0.06), (-0.05, 0)], 0.022, axis='z'), 'steel_dark',
               M((0, -0.30, 0.335)), bevel=0.005)
    # capa longa e volumosa presa por grampos dourados
    mb.add(cloth_panel(*CAPE, nx=7, ny=6, thick=0.04, bulge=CAPE_FOLD[0], wave=CAPE_FOLD[1], jag=0.07), 'team', smooth=50)
    mb.add(prim_box(0.62, 0.05, 0.08, taper=(0.9, 1.0)), 'gold', M((0, 0.40, -0.22)))
    for sx in (-1, 1):
        mb.add(prim_sphere(0.055, 0.055, 0.045, 7, 4), 'gold', M((sx * 0.30, 0.38, -0.06)), smooth=60)
    return mb.build(mats, parent=root, location=TORSO_PIVOT)


def build_head(mats, root):
    """Armet fechado de aço: viseira baixada com fenda em T (o único 'rosto' fica na frente, +Z)."""
    mb = MeshBuilder('Head')
    rings = [ring_h(0.285, 0.06, 0.07, 12), ring_h(0.23, 0.15, 0.17, 12), ring_h(0.15, 0.20, 0.22, 12),
             ring_h(0.04, 0.21, 0.24, 12, cz=0.01), ring_h(-0.07, 0.205, 0.25, 12, cz=0.035),
             ring_h(-0.17, 0.175, 0.245, 12, cz=0.055), ring_h(-0.27, 0.13, 0.18, 12, cz=0.03)]
    mb.add(prim_rings(rings), 'steel', smooth=50, bevel=0.005)
    # viseira: placa frontal com fenda em T e furos de ventilação
    mb.add(prim_box(0.34, 0.27, 0.05, taper=(0.75, 1.0)), 'steel_dark', M((0, -0.04, 0.262), (-4, 0, 0)), bevel=0.012)
    mb.add(prim_box(0.25, 0.034, 0.03), 'dark', M((0, 0.03, 0.29)))
    mb.add(prim_box(0.034, 0.15, 0.03), 'dark', M((0, -0.06, 0.29)))
    for sx in (-1, 1):
        for k in range(3):
            mb.add(prim_box(0.022, 0.022, 0.03), 'dark', M((sx * 0.085, -0.03 - k * 0.05, 0.285 + 0.005 * k)))
    # arco de ouro na borda da viseira, aro na testa e dobradiças laterais
    mb.add(prim_box(0.36, 0.022, 0.03), 'gold', M((0, 0.10, 0.275)))
    mb.add(prim_box(0.30, 0.022, 0.03), 'gold', M((0, -0.175, 0.29)))
    mb.add(prim_rings([ring_h(0.12, 0.208, 0.225, 12), ring_h(0.145, 0.205, 0.222, 12)], cap0=False, cap1=False),
           'gold', smooth=30)
    for sx in (-1, 1):
        mb.add(prim_cyl(0.05, 0.05, 0.03, 10), 'gold', M((sx * 0.205, -0.02, 0.06), (0, 0, 90)), smooth=30)
        mb.add(prim_box(0.02, 0.36, 0.03), 'gold', M((sx * 0.2, -0.0, 0.14), (0, sx * 18, 0)))
    # crista dourada com plumagem de lâminas + espigão
    mb.add(prim_box(0.045, 0.06, 0.46, taper=(0.8, 1.0)), 'gold', M((0, 0.285, 0.0)))
    for i in range(6):
        z = 0.17 - i * 0.075
        mb.add(prim_box(0.03, 0.15 - i * 0.012, 0.085), 'gold', M((0, 0.35 - i * 0.004, z), (-18 - i * 5, 0, 0)))
    mb.add(prim_cone(0.022, 0.12, 6), 'gold', M((0, 0.29, 0.24)))
    # gorjal (aba de pescoço) em lâminas com friso dourado
    for k, (y, rx, rz) in enumerate(((-0.26, 0.19, 0.2), (-0.32, 0.22, 0.225), (-0.38, 0.25, 0.25))):
        mb.add(prim_rings([ring_h(y + 0.04, rx, rz, 14), ring_h(y - 0.04, rx + 0.01, rz + 0.01, 14)], cap0=False,
                          cap1=False), 'steel_dark', smooth=40)
    mb.add(prim_rings([ring_h(-0.415, 0.255, 0.255, 14), ring_h(-0.43, 0.26, 0.26, 14)], cap0=False, cap1=False),
           'gold', smooth=30)
    return mb.build(mats, parent=root, location=HEAD_PIVOT)


def build_arm(mats, root, side, elbow=None, wrist=None):
    """side = +1 (ArmR) ou −1 (ArmL); pivô no ombro. Braço afastado do corpo: ombreira de 3 lâminas com
    espigão, cotoveleira grande e manopla. elbow/wrist (relativos ao ombro) permitem poses dobradas."""
    s = side
    mb = MeshBuilder('ArmR' if s > 0 else 'ArmL')
    for i, (rx, ry, rz, y, tilt) in enumerate(((0.185, 0.15, 0.20, 0.05, 20), (0.18, 0.12, 0.19, -0.06, 28),
                                                (0.17, 0.10, 0.18, -0.16, 36))):
        T = M((s * (0.03 + 0.03 * i), y, 0.0), (0, 0, -s * tilt))
        mb.add(prim_sphere(rx, ry, rz, 12, 4, y_min=0.0), 'steel' if i != 1 else 'steel_hi', T, smooth=50)
        mb.add(prim_cyl(rx * 0.99, rx * 0.97, 0.026, 12), 'gold', T, smooth=30)
    mb.add(prim_cone(0.045, 0.17, 6), 'gold', M((s * 0.11, 0.17, 0.0), (0, 0, -s * 42)))
    mb.add(prim_sphere(0.05, 0.05, 0.05, 6, 3), 'gold', M((s * 0.07, 0.12, 0.0)), smooth=60)
    e = Vector(elbow) if elbow else Vector((s * 0.12, -0.38, 0.0))
    w = Vector(wrist) if wrist else Vector((s * 0.15, -0.68, 0.08))
    sh = Vector((s * 0.05, -0.14, 0.0))
    up = [tuple(sh), tuple(sh.lerp(e, 0.5)), tuple(e)]
    mb.add(prim_rings(limb_rings(up, [0.10, 0.105, 0.095], 8)), 'steel', smooth=60, bevel=0.005)
    mb.add(prim_cyl(0.11, 0.11, 0.025, 10), 'gold', Matrix.Translation(sh.lerp(e, 0.45)) @ orient(e - sh), smooth=30)
    mb.add(prim_sphere(0.115, 0.11, 0.11, 8, 4), 'steel_hi', M(tuple(e)), smooth=50)
    mb.add(prim_cone(0.04, 0.12, 6), 'gold', Matrix.Translation(e + Vector((s * 0.09, -0.02, -0.03))) @
           orient((s * 1, 0, -0.3)))
    fa = [tuple(e), tuple(e.lerp(w, 0.5)), tuple(w)]
    mb.add(prim_rings(limb_rings(fa, [0.085, 0.092, 0.075], 8)), 'steel', smooth=60, bevel=0.005)
    for t in (0.35, 0.7):
        mb.add(prim_cyl(0.096, 0.096, 0.02, 10), 'gold', Matrix.Translation(e.lerp(w, t)) @ orient(w - e), smooth=30)
    d = (w - e).normalized()
    Tg = Matrix.Translation(w + d * 0.07) @ orient(d)
    mb.add(prim_box(0.13, 0.15, 0.14, taper=(0.9, 0.85)), 'steel_dark', Tg, bevel=0.016)
    mb.add(prim_box(0.14, 0.03, 0.15), 'gold', Matrix.Translation(w) @ orient(d))
    mb.add(prim_box(0.12, 0.05, 0.10), 'steel_hi', Tg @ M((0, -0.08, 0.03)))
    return mb.build(mats, parent=root, location=(s * ARM_PIVOT[0], ARM_PIVOT[1], ARM_PIVOT[2]))


def build_leg(mats, root, side):
    s = side
    mb = MeshBuilder('LegR' if s > 0 else 'LegL')
    th = [(0, -0.02, 0), (s * 0.005, -0.20, 0.015), (s * 0.01, -0.36, 0.02)]
    mb.add(prim_rings(limb_rings(th, [(0.15, 0.16), (0.145, 0.155), (0.115, 0.125)], 10)), 'steel', smooth=60, bevel=0.005)
    for y in (-0.09, -0.30):
        mb.add(prim_cyl(0.155, 0.155, 0.022, 12), 'gold', M((s * 0.004, y, 0.01)), smooth=30)
    mb.add(prim_sphere(0.13, 0.115, 0.115, 10, 4), 'steel_hi', M((s * 0.012, -0.385, 0.06)), smooth=50)
    mb.add(prim_cyl(0.125, 0.125, 0.022, 10), 'gold', M((s * 0.012, -0.385, 0.06), (90, 0, 0)), smooth=30)
    mb.add(prim_cone(0.045, 0.12, 6), 'gold', M((s * 0.012, -0.385, 0.175), (90, 0, 0)))
    sh = [(s * 0.012, -0.41, 0.03), (s * 0.016, -0.53, 0.015), (s * 0.02, -0.64, 0.0)]
    mb.add(prim_rings(limb_rings(sh, [(0.105, 0.115), (0.11, 0.115), (0.085, 0.09)], 10)), 'steel', smooth=60, bevel=0.005)
    mb.add(prim_box(0.035, 0.22, 0.03), 'steel_hi', M((s * 0.014, -0.52, 0.125), (8, 0, 0)))
    mb.add(prim_cyl(0.118, 0.118, 0.022, 10), 'gold', M((s * 0.014, -0.45, 0.02)), smooth=30)
    # sabatão de aço com bico e rebites dourados
    mb.add(prim_box(0.20, 0.10, 0.33, taper=(0.8, 0.6), base=True), 'steel_dark', M((s * 0.02, -0.70, 0.07)), bevel=0.02,
           smooth=35)
    mb.add(prim_box(0.15, 0.06, 0.14, base=True), 'steel', M((s * 0.02, -0.63, 0.19)), bevel=0.015)
    for k in range(3):
        mb.add(prim_sphere(0.018, 0.018, 0.018, 5, 3), 'gold', M((s * 0.02, -0.62, 0.12 + k * 0.06)), smooth=60)
    return mb.build(mats, parent=root, location=(s * LEG_PIVOT[0], LEG_PIVOT[1], LEG_PIVOT[2]))


def build_sword(mats, root):
    """Montante robusto: empunhadura em y≈0, lâmina larga em +Y com o gume voltado para ±Z (frente = +Z)."""
    mb = MeshBuilder('Sword')
    mb.add(prim_cyl(0.03, 0.03, 0.27, 8, base=False), 'leather', M((0, -0.12, 0)), smooth=50)
    for y in (-0.22, -0.15, -0.08, -0.01):
        mb.add(prim_cyl(0.036, 0.036, 0.014, 8, base=False), 'gold', M((0, y, 0)))
    mb.add(prim_sphere(0.065, 0.065, 0.065, 8, 4), 'gold', M((0, -0.30, 0)), smooth=60)
    mb.add(prim_sphere(0.03, 0.03, 0.03, 6, 3), 'steel_hi', M((0, -0.355, 0)), smooth=60)
    # guarda ornamentada: barra com volutas, cabeça central e quilhões
    mb.add(prim_box(0.52, 0.06, 0.075), 'gold', M((0, 0.05, 0)))
    for sx in (-1, 1):
        mb.add(prim_sphere(0.04, 0.04, 0.045, 7, 4), 'gold', M((sx * 0.27, 0.05, 0)), smooth=60)
        mb.add(prim_box(0.14, 0.05, 0.06), 'gold', M((sx * 0.20, 0.11, 0), (0, 0, sx * -30)))
        mb.add(prim_box(0.12, 0.045, 0.055), 'gold', M((sx * 0.22, -0.01, 0), (0, 0, sx * 28)))
    mb.add(prim_sphere(0.07, 0.07, 0.06, 8, 4), 'gold', M((0, 0.06, 0.03)), smooth=60)
    mb.add(prim_box(0.06, 0.06, 0.04), 'steel_dark', M((0, 0.08, 0.075)), bevel=0.008)
    mb.add(prim_box(0.05, 0.11, 0.17, taper=(1.0, 0.9)), 'gold', M((0, 0.13, 0.0)))
    # lâmina larga com sulco central e ponta
    mb.add(prim_box(0.042, 1.02, 0.17, taper=(0.9, 0.78), base=True), 'blade', M((0, 0.17, 0)), bevel=0.008)
    mb.add(prim_box(0.05, 0.72, 0.045, taper=(0.6, 0.6), base=True), 'steel_dark', M((0.012, 0.23, 0)))
    mb.add(prim_cone(0.087, 0.22, 4, base=True), 'blade', M((0, 1.19, 0), (0, 45, 0), (0.30, 1.0, 1.0)))
    sw = mb.build(mats, parent=root, location=SWORD_PIVOT)
    C.set_rot_game(sw, SWORD_REST_DEG)
    return sw


KITE = [(-0.30, 0.44), (-0.15, 0.475), (0.15, 0.475), (0.30, 0.44), (0.315, 0.10), (0.26, -0.22), (0.11, -0.45),
        (0.0, -0.56), (-0.11, -0.45), (-0.26, -0.22), (-0.315, 0.10)]


def build_shield(mats, root, scale=1.0, pivot=None):
    """Escudo de pavês/kite: aro de aço, friso de ouro, campo azul de time com brasão e umbo dourado.
    Nó ShieldGroup (o UnitAnimator gira em y; repouso rot y −0,3)."""
    k = scale
    mb = MeshBuilder('ShieldGroup')
    for (f, depth, mat) in ((1.0, 0.055, 'steel_dark'), (0.93, 0.075, 'gold'), (0.85, 0.095, 'team')):
        poly = [(x * f * k, y * f * k) for (x, y) in KITE]
        mb.add(prim_extrude(poly, depth, axis='z'), mat, M((0, 0, 0)))
    # verso de couro
    mb.add(prim_box(0.10 * k, 0.56 * k, 0.03), 'leather', M((0, 0.05 * k, -0.04)))
    mb.add(prim_box(0.36 * k, 0.07 * k, 0.03), 'leather', M((0, -0.12 * k, -0.04)))
    # brasão: cruz pattée dourada e umbo central
    z = 0.055
    mb.add(prim_box(0.10 * k, 0.74 * k, 0.03), 'gold', M((0, -0.02 * k, z)))
    mb.add(prim_box(0.44 * k, 0.10 * k, 0.03), 'gold', M((0, 0.14 * k, z)))
    for (dx, dy, w, h) in ((0, 0.36, 0.2, 0.06), (0, -0.38, 0.14, 0.05), (-0.23, 0.14, 0.06, 0.2), (0.23, 0.14, 0.06, 0.2)):
        mb.add(prim_box(w * k, h * k, 0.03), 'gold', M((dx * k, dy * k, z)))
    mb.add(prim_sphere(0.10 * k, 0.10 * k, 0.055, 10, 5), 'steel_hi', M((0, 0.14 * k, z + 0.03)), smooth=60)
    mb.add(prim_cyl(0.105 * k, 0.105 * k, 0.02, 10, base=False), 'gold', M((0, 0.14 * k, z + 0.012), (90, 0, 0)), smooth=30)
    for (x, y) in ((-0.25, 0.42), (0.25, 0.42), (-0.29, 0.05), (0.29, 0.05), (-0.19, -0.26), (0.19, -0.26)):
        mb.add(prim_sphere(0.022 * k, 0.022 * k, 0.02, 5, 3), 'steel_hi', M((x * k, y * k, 0.05)), smooth=60)
    sh = mb.build(mats, parent=root, location=pivot or SHIELD_PIVOT)
    C.set_rot_game(sh, (0.0, math.degrees(-0.3), 0.0))
    return sh



def main():
    args = C.script_args()
    C.reset_scene()
    mats = C.make_paint_set(PALETTE)
    root = C.make_empty('Knight')
    torso = build_torso(mats, root)
    head = build_head(mats, root)
    arm_l = build_arm(mats, root, -1)
    arm_r = build_arm(mats, root, 1)
    leg_l = build_leg(mats, root, -1)
    leg_r = build_leg(mats, root, 1)
    sword = build_sword(mats, root)
    shield = build_shield(mats, root)
    parts = [torso, head, arm_l, arm_r, leg_l, leg_r, sword, shield]
    import bpy
    bpy.context.view_layer.update()

    C.uv_atlas(parts, weights={'Head': 1.5, 'Torso': 1.2, 'Sword': 0.8, 'LegL': 0.8, 'LegR': 0.8,
                               'ArmL': 0.9, 'ArmR': 0.9, 'ShieldGroup': 0.9}, margin=0.006)
    img = C.bake_atlas(parts, 'knight_atlas', 512, samples=int(os.environ.get('BAKE_SAMPLES', 32)), margin=4)
    C.finalize_materials(parts, img, team_default=TEAM_DEFAULT,
                         out_png=os.path.join(C.BUILD_DIR, 'knight_atlas.png'))
    out = os.path.join(C.OUT_MODELS, 'knight.glb')
    C.export_glb(root, out)
    st = C.stats(root, out)
    print('STATS knight', st)
    if '--no-render' not in args:
        rig = C.RenderRig(root, 'knight', res=int(os.environ.get('RENDER_RES', 800)), samples=24)
        rig.render('34', (1.0, 0.95, 1.0), 30)
        rig.render('front', (0.0, 0.25, 1.0), 30)
        rig.render('back', (-0.6, 0.6, -1.0), 30)
        rig.render('side', (1.0, 0.2, 0.0), 30)
        rig.render('game', (45, 44, 45), 24, dist=78 / 1.62)
        C.set_team_color('#c0392b')
        rig.render('34_vermelho', (1.0, 0.95, 1.0), 30)
        C.set_team_color(TEAM_DEFAULT)


if __name__ == '__main__':
    main()
