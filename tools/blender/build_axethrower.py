"""
build_axethrower.py — Lanceiro-Machado troll (tipo interno `axethrower`, também usado por `berserker`)
gerado 100% por script.

Uso:
  blender -b --factory-startup --python tools/blender/build_axethrower.py -- [--no-render]

Hierarquia ANINHADA (igual ao AxethrowerModel.js procedural / ao Grunt; nomes lidos pelo UnitAnimator e
por ModelFactory.rebindUserData):
  Axethrower (raiz)
  ├─ Torso            pivô (0, 1.3, 0)          tanga/faixa em cor de time
  │  ├─ Head          pivô (0, 0.66, 0.05)      centro da cabeça
  │  │   └─ Mohawk    (0, 0, 0)                 crista laranja
  │  ├─ ArmL / ArmR   pivô (∓0.48, 0.38, 0)     repouso rotação 0; braçadeira em cor de time
  │  │   └─ WeaponL / WeaponR  (0, -0.84, 0.18) rotação x = -45° (repouso), machado de arremesso
  └─ LegL / LegR      pivô (∓0.24, 0.85, 0)
O machado é modelado "em pé" e girado por AXE_PRE dentro do nó Weapon*, para que em repouso
(rotation.x = -45°) fique quase vertical, gume para +Z; as rotações do UnitAnimator somam a isso.
"""
import os
import sys
import math
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C  # noqa: E402
from common import (MeshBuilder, M, prim_box, prim_rings, ring_h, prim_cyl, prim_cone,  # noqa: E402
                    prim_sphere, prim_extrude, limb_rings, bezier)

import worker_common as W  # noqa: E402
from worker_common import stitches  # noqa: E402

TORSO_PIVOT = (0.0, 1.3, 0.0)
HEAD_PIVOT = (0.0, 0.66, 0.05)      # relativo ao Torso (centro da cabeça)
ARM_PIVOT = (0.48, 0.38, 0.0)       # relativo ao Torso
LEG_PIVOT = (0.24, 0.85, 0.0)
WEAPON_POS = (0.0, -0.84, 0.18)     # relativo ao braço
WEAPON_REST_X = -45.0
TEAM_DEFAULT = '#c9382a'            # vermelho da Horda (multiplica a área cinza)

_SKIN = dict(base='#5d8f80', var='#456f66', var_scale=4.0, var_amt=0.6, fine=0.06,
             grad=(0.0, 2.7, 0.30), top=0.22, edge='#a5d2c0', edge_amt=0.35, edge_r=0.03, ao=(0.28, 0.65))

PALETTE = {
    'skin': dict(_SKIN),
    'skin_head': dict(_SKIN),
    'skin_torso': dict(_SKIN),
    'skin_arm': dict(_SKIN),
    'skin_dark': dict(base='#3f645a', var='#33534a', var_scale=4.0, fine=0.05, grad=(0.0, 2.7, 0.2),
                      top=0.15, ao=(0.25, 0.6)),
    'hair': dict(base='#dc5f1a', var='#b5350d', var_scale=9.0, var_amt=0.9, fine=0.14, top=0.3,
                 edge='#ffb24a', edge_amt=0.7, edge_r=0.02, ao=(0.2, 0.5), grad=(1.7, 2.75, -0.35)),
    'bone': dict(base='#e9dcb0', var='#c9b584', var_scale=5.0, fine=0.08, top=0.15,
                 edge='#fff6dc', edge_amt=0.4, edge_r=0.02, ao=(0.2, 0.55)),
    'leather': dict(base='#6e4424', var='#56331a', var_scale=6.0, fine=0.12, top=0.2,
                    edge='#a47245', edge_amt=0.55, edge_r=0.02, ao=(0.25, 0.6)),
    'leather_dk': dict(base='#48291a', var='#33200f', var_scale=7.0, fine=0.12, top=0.2,
                       edge='#7a5232', edge_amt=0.45, edge_r=0.02, ao=(0.25, 0.6)),
    'hide': dict(base='#c07a2e', var='#3d2612', var_scale=5.0, var_amt=1.0, fine=0.15, fine_scale=26.0,
                 streaks=(11.0, 1.4, 0.5), coord='object', top=0.22, edge='#e6b061', edge_amt=0.4,
                 edge_r=0.03, ao=(0.25, 0.6)),
    'fur': dict(base='#8a6a42', var='#2c1d10', var_scale=9.0, var_amt=1.0, fine=0.3, fine_scale=40.0,
                streaks=(3.0, 40.0, 0.4), top=0.3, edge='#d6c19a', edge_amt=0.6, edge_r=0.03,
                ao=(0.25, 0.6), coord='object'),
    'fur_lt': dict(base='#b39a72', var='#6a5034', var_scale=10.0, var_amt=1.0, fine=0.25, fine_scale=40.0, top=0.3,
                   edge='#f0e2c0', edge_amt=0.5, edge_r=0.03, ao=(0.25, 0.6)),
    'rune': dict(base='#e9d9a6', var='#d3bd7f', var_scale=12.0, top=0.1),
    'rune_red': dict(base='#b3301f', var='#8a2114', var_scale=12.0, top=0.1),
    'rust': dict(base='#6d5a4a', var='#4d3c2e', var_scale=11.0, var_amt=1.0, fine=0.25, top=0.3,
                 edge='#b89a78', edge_amt=0.6, edge_r=0.02, ao=(0.2, 0.5)),
    'iron': dict(base='#3d434f', var='#2d323b', var_scale=7.0, var_amt=0.8, fine=0.14, top=0.35,
                 edge='#c3cad6', edge_amt=0.95, edge_r=0.022, edge_gain=12.0, ao=(0.25, 0.55)),
    'blade': dict(base='#616b80', var='#4a5366', var_scale=6.0, fine=0.1, top=0.4,
                  edge='#f4f8ff', edge_amt=1.0, edge_r=0.03, edge_gain=14.0, ao=(0.2, 0.45)),
    'steel': dict(base='#9aa4b4', var='#7a8496', var_scale=9.0, fine=0.1, top=0.3,
                  edge='#f4f8ff', edge_amt=1.0, edge_r=0.02, ao=(0.2, 0.4)),
    'gold': dict(base='#d5a23a', var='#b07c22', var_scale=9.0, var_amt=0.7, fine=0.06, top=0.4,
                 edge='#ffe9a0', edge_amt=1.0, edge_r=0.016, edge_gain=12.0, ao=(0.2, 0.45)),
    'wood': dict(base='#7a5230', var='#5a3a1e', var_scale=5.0, fine=0.1, coord='object',
                 streaks=(40.0, 2.0, 0.22), edge='#a87a4c', edge_amt=0.4, edge_r=0.015, ao=(0.2, 0.5)),
    'eye': dict(base='#ffd23a', var='#ff9b1a', var_scale=20.0, emit_boost=1.45),
    'mouth': dict(base='#2a1512', var='#1a0d0b'),
    'team': dict(base='#b8b0a4', var='#9d9589', var_scale=5.0, fine=0.08, top=0.25,
                 edge='#d8d2c8', edge_amt=0.3, edge_r=0.03, ao=(0.3, 0.65), team=True),
}


# ---------------------------------------------------------------------------
# Pintura de guerra / tatuagens: máscaras procedurais somadas à emissão do material de pele
# (coordenadas do JOGO; a geometria do bake está em pose de repouso)
# ---------------------------------------------------------------------------
def add_paint(mat, kind):
    nt = mat.node_tree
    em = [n for n in nt.nodes if n.type == 'EMISSION'][0]
    col = em.inputs['Color'].links[0].from_socket
    nb = C.NB(nt)
    geo = nb.node('ShaderNodeNewGeometry')
    px, py, pz = nb.sep(geo.outputs['Position'])
    nx, ny, nz = nb.sep(geo.outputs['Normal'])
    X, Y, Z = px, pz, nb.math('MULTIPLY', py, -1.0)
    NZ = nb.math('MULTIPLY', ny, -1.0)
    ax = nb.math('ABSOLUTE', X)

    def rng(v, lo, hi):
        return nb.math('MULTIPLY', nb.math('GREATER_THAN', v, lo), nb.math('LESS_THAN', v, hi))

    def bars(u, freq, width):
        return nb.math('LESS_THAN', nb.math('FRACT', nb.math('MULTIPLY', u, freq)), width)

    if kind == 'head':      # listras diagonais nas bochechas (laranja) + risco na testa
        u = nb.math('SUBTRACT', Y, nb.math('MULTIPLY', ax, 1.25))
        m = nb.math('MULTIPLY', bars(u, 15.0, 0.42), rng(Y, 1.845, 1.965))
        m = nb.math('MULTIPLY', m, rng(ax, 0.045, 0.235))
        m = nb.math('MULTIPLY', m, nb.math('GREATER_THAN', Z, 0.10))
        paint = nb.rgb('#f0862c')
        # faixa vertical na testa/queixo (centro)
        c = nb.math('MULTIPLY', rng(ax, 0.0, 0.028), nb.math('GREATER_THAN', Z, 0.16))
        c = nb.math('MULTIPLY', c, rng(Y, 2.075, 2.19))
        m = nb.math('MAXIMUM', m, c)
    elif kind == 'torso':   # chevrons de osso-pintado no peito + risco nas costelas
        u = nb.math('ADD', Y, nb.math('MULTIPLY', ax, 0.85))
        m = nb.math('MULTIPLY', bars(u, 8.0, 0.30), rng(Y, 1.60, 1.90))
        m = nb.math('MULTIPLY', m, rng(ax, 0.02, 0.40))
        m = nb.math('MULTIPLY', m, nb.math('GREATER_THAN', NZ, 0.15))
        rb = nb.math('MULTIPLY', bars(nb.math('MULTIPLY', ax, 1.0), 14.0, 0.3), rng(Y, 1.32, 1.52))
        rb = nb.math('MULTIPLY', rb, nb.math('GREATER_THAN', NZ, 0.35))
        rb = nb.math('MULTIPLY', rb, rng(ax, 0.02, 0.25))
        m = nb.math('MAXIMUM', m, rb)
        paint = nb.rgb('#2b4f49')
    else:                   # 'arm': anéis tribais no bíceps e no antebraço
        m = nb.math('MULTIPLY', bars(Y, 9.5, 0.30), rng(Y, 1.10, 1.50))
        paint = nb.rgb('#2b4f49')
    new = nb.mix(m, col, paint)
    nt.links.new(new, em.inputs['Color'])


# ---------------------------------------------------------------------------
def cloth_panel(top_l, top_r, bot_l, bot_r, nx=5, ny=4, thick=0.035, bulge=(0, 0, 0),
                wave=0.03, jag=0.05):
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


def axe_blade(poly_zy, thick, taper_from, taper_to):
    """Lâmina: polígono no plano (z, y), espessura em x que afina do soquete (z pequeno) ao gume."""
    verts, faces = prim_extrude(poly_zy, thick, axis='x')
    out = []
    for (x, y, z) in verts:
        t = min(1.0, max(0.0, (z - taper_from) / (taper_to - taper_from)))
        out.append((x * (1.0 - 0.82 * t), y, z))
    return out, faces


BLADE = [(0.05, 0.64), (0.13, 0.72), (0.21, 0.79), (0.29, 0.73), (0.35, 0.63), (0.318, 0.585), (0.385, 0.52),
         (0.37, 0.40), (0.335, 0.36), (0.352, 0.335), (0.31, 0.29), (0.235, 0.19), (0.215, 0.29), (0.15, 0.35),
         (0.05, 0.38)]
EDGE = [(0.21, 0.79), (0.29, 0.73), (0.35, 0.63), (0.318, 0.585), (0.385, 0.52), (0.37, 0.40), (0.335, 0.36),
        (0.352, 0.335), (0.31, 0.29), (0.235, 0.19), (0.25, 0.30), (0.29, 0.40), (0.293, 0.52), (0.285, 0.60),
        (0.27, 0.70)]


def blade_half(zs, thick=0.05):
    t = min(1.0, max(0.0, (zs - 0.05) / 0.28))
    return thick / 2 * (1.0 - 0.82 * t)


# runas pintadas (traços) em (z, y) da lâmina, antes do escalonamento de z
RUNES = [  # cada runa: lista de traços ((z0,y0),(z1,y1))
    [((0.17, 0.62), (0.17, 0.50)), ((0.17, 0.56), (0.24, 0.62)), ((0.17, 0.52), (0.24, 0.46))],
    [((0.27, 0.56), (0.27, 0.44)), ((0.22, 0.52), (0.32, 0.52))],
    [((0.13, 0.46), (0.20, 0.40)), ((0.20, 0.40), (0.14, 0.34)), ((0.14, 0.34), (0.22, 0.30))],
]


def blade_runes(mb, P, side_x):
    """Runas pintadas nas duas faces da lâmina (quads de 2 tris, cor de sangue/osso)."""
    for ri, rune in enumerate(RUNES):
        mat = 'rune_red' if ri != 1 else 'rune'
        for (a, b) in rune:
            for sx in (-1, 1):
                pts = []
                for (z, y) in (a, b):
                    zs = z * 0.86
                    pts.append(tuple(P @ Vector((sx * (blade_half(zs) + 0.001), y, zs))))
                nrm = tuple((P.to_3x3() @ Vector((sx, 0, 0))))
                d = Vector(pts[1]) - Vector(pts[0])
                stitches(mb, pts[0], pts[1], 1, mat, size=(d.length + 0.01, 0.014, 0.01), hint=nrm)


def mini_axe(mb, m):
    """Machadinha de cinto/bandoleira: cabo ao longo de +Y, gume em +Z. Comprimento ~0.30."""
    mb.add(prim_cyl(0.017, 0.02, 0.27, 6, base=False), 'wood', m @ M((0, 0.03, 0)), smooth=50)
    mb.add(prim_box(0.05, 0.075, 0.055), 'iron', m @ M((0, 0.155, 0)))
    poly = [(0.03, 0.05), (0.075, 0.075), (0.115, 0.03), (0.125, -0.02), (0.11, -0.075), (0.07, -0.05), (0.03, -0.035)]
    v, f = axe_blade(poly, 0.02, 0.03, 0.125)
    mb.add((v, f), 'blade', m @ M((0, 0.165, 0)))


# ---------------------------------------------------------------------------
TORSO_RINGS = [  # (y, rx, rz, cz)
    (-0.58, 0.30, 0.21, 0.00),
    (-0.40, 0.28, 0.20, 0.01),
    (-0.20, 0.30, 0.21, 0.02),
    (0.00, 0.35, 0.235, 0.03),
    (0.22, 0.42, 0.265, 0.04),
    (0.42, 0.47, 0.275, 0.03),
    (0.56, 0.42, 0.24, 0.00),
    (0.66, 0.20, 0.17, 0.02),
    (0.76, 0.17, 0.15, 0.04),
]


def chest_z(x, y, off=0.012):
    for (y0, rx0, rz0, cz0), (y1, rx1, rz1, cz1) in zip(TORSO_RINGS[:-1], TORSO_RINGS[1:]):
        if y0 <= y <= y1:
            t = (y - y0) / (y1 - y0)
            rx, rz, cz = rx0 + (rx1 - rx0) * t, rz0 + (rz1 - rz0) * t, cz0 + (cz1 - cz0) * t
            k = max(0.0, 1.0 - (x / rx) ** 2)
            return cz + rz * math.sqrt(k) + off
    return 0.2


def build_torso(mats, root):
    mb = MeshBuilder('Torso')
    rings = [ring_h(y, rx, rz, 14, cz=cz) for (y, rx, rz, cz) in TORSO_RINGS]
    mb.add(prim_rings(rings), 'skin_torso', smooth=70)
    # peitorais, abdômen em placas e trapézios (silhueta musculosa e "corcunda" de caçador)
    for sx in (-1, 1):
        mb.add(prim_sphere(0.20, 0.135, 0.11, 8, 4), 'skin_torso', M((sx * 0.20, 0.33, 0.235), (10, sx * 12, sx * -8)), smooth=70)
        mb.add(prim_sphere(0.13, 0.15, 0.09, 6, 3), 'skin_torso', M((sx * 0.30, 0.52, -0.06)), smooth=70)
        for k, y in enumerate((0.10, -0.06, -0.21)):
            mb.add(prim_sphere(0.085, 0.06, 0.05, 6, 3), 'skin_torso', M((sx * 0.075, y, 0.235 - k * 0.01)), smooth=70)
    mb.add(prim_sphere(0.24, 0.13, 0.14, 8, 4), 'skin_torso', M((0, 0.58, -0.08)), smooth=70)
    # colar de contas de osso com presa central
    for k in range(11):
        a = math.pi * (0.12 + 0.76 * k / 10)  # arco na frente
        x = -math.cos(a) * 0.235
        z = 0.06 + math.sin(a) * 0.20
        y = 0.55 - math.sin(a) * 0.06 - 0.12 * math.sin(a) ** 6
        mb.add(prim_sphere(0.03, 0.03, 0.03, 5, 3), 'bone', M((x, y, z)), smooth=60)
    mb.add(prim_cone(0.038, 0.15, 5), 'bone', M((0, 0.385, 0.255), (172, 0, 0)), smooth=60)
    for sx in (-1, 1):
        mb.add(prim_sphere(0.026, 0.026, 0.026, 5, 3), 'gold', M((sx * 0.07, 0.42, 0.25)), smooth=60)
    # bandoleira de couro (ombro direito -> quadril esquerdo) com duas machadinhas
    path = []
    N = 10
    for i in range(N + 1):
        t = i / N
        x = 0.30 + (-0.27 - 0.30) * t
        y = 0.55 + (-0.14 - 0.55) * t
        path.append((x, y, chest_z(x, y, 0.014)))
    mb.add(prim_rings(limb_rings(path, [(0.045, 0.016)] * len(path), 6, up=(0, 0, 1))), 'leather', smooth=60)
    for (t, ang) in ((0.38, 34), (0.62, -28)):
        x = 0.30 + (-0.27 - 0.30) * t
        y = 0.55 + (-0.14 - 0.55) * t
        mb.add(prim_box(0.075, 0.03, 0.03), 'gold', M((x, y, chest_z(x, y, 0.024)), (0, 0, -42)), bevel=0.006)
    for (t, ang, sgn) in ((0.22, 20, 1), (0.84, -18, -1)):
        x = 0.30 + (-0.27 - 0.30) * t
        y = 0.55 + (-0.14 - 0.55) * t
        mini_axe(mb, M((x + sgn * 0.02, y + 0.02, chest_z(x, y, 0.03)), (-14, 0, ang + 20)) @ M((0, -0.12, 0)))
    # cinturão largo com fivela de ferro + crânio pequeno e machadinhas de arremesso
    mb.add(prim_rings([ring_h(-0.44, 0.285, 0.205, 16, cz=0.01), ring_h(-0.30, 0.295, 0.212, 16, cz=0.01)]),
           'leather', smooth=45, bevel=0.004)
    mb.add(prim_box(0.15, 0.13, 0.05), 'iron', M((0, -0.37, 0.235)), bevel=0.02)
    mb.add(prim_sphere(0.05, 0.055, 0.04, 6, 4), 'bone', M((0, -0.37, 0.27)), smooth=60)
    for sx in (-1, 1):
        mb.add(prim_box(0.02, 0.03, 0.02), 'mouth', M((sx * 0.02, -0.365, 0.302)))
    for (x, y, z, rz, ry) in ((-0.30, -0.30, 0.06, 16, 0), (0.30, -0.30, 0.06, -16, 0),
                              (-0.20, -0.30, 0.19, 8, 0), (0.20, -0.30, 0.19, -8, 0),
                              (-0.12, -0.30, -0.20, 6, 180), (0.14, -0.30, -0.20, -6, 180)):
        mini_axe(mb, M((x, y, z), (0, ry, rz)) @ M((0, -0.10, 0)))
    # tanga de pele de tigre (saiote) com barra irregular
    kr = []
    for (y, rx, rz, jag) in ((-0.36, 0.30, 0.225, 0.0), (-0.52, 0.335, 0.255, 0.0), (-0.70, 0.36, 0.28, 0.07)):
        ring = ring_h(y, rx, rz, 16, cz=0.01)
        if jag:
            ring = [(x, yy + (jag if i % 2 else -jag * 0.3), z) for i, (x, yy, z) in enumerate(ring)]
        kr.append(ring)
    mb.add(prim_rings(kr, cap0=False, cap1=False), 'hide', smooth=55)
    # painéis de cor de time (frente e costas) e faixa lateral
    mb.add(cloth_panel((-0.15, -0.40, 0.235), (0.15, -0.40, 0.235), (-0.16, -0.98, 0.29), (0.16, -0.98, 0.29),
                       nx=4, ny=4, bulge=(0, 0, 0.05), jag=0.05), 'team', smooth=50)
    mb.add(cloth_panel((0.18, -0.40, -0.21), (-0.18, -0.40, -0.21), (0.19, -0.90, -0.29), (-0.19, -0.90, -0.29),
                       nx=4, ny=3, bulge=(0, 0, -0.04), jag=0.05), 'team', smooth=50)
    mb.add(cloth_panel((-0.31, -0.32, 0.03), (-0.31, -0.32, -0.08), (-0.36, -0.80, 0.03), (-0.36, -0.80, -0.08),
                       nx=2, ny=3, thick=0.03, jag=0.05), 'team', smooth=50)
    # pontas de espinha (trofeu de ossos) nas costas
    for k, (y, h) in enumerate(((0.50, 0.13), (0.33, 0.11), (0.16, 0.09))):
        mb.add(prim_cone(0.028 - k * 0.003, h, 5), 'bone', M((0, y, -0.235 - k * 0.006), (-80, 0, 0)), smooth=60)
    return mb.build(mats, parent=root, location=TORSO_PIVOT)


def build_head(mats, torso):
    mb = MeshBuilder('Head')
    rings = [
        ring_h(-0.21, 0.15, 0.17, 12, cz=0.06),
        ring_h(-0.10, 0.205, 0.23, 12, cz=0.04),
        ring_h(0.04, 0.235, 0.255, 12, cz=0.0),
        ring_h(0.17, 0.215, 0.24, 12, cz=-0.02),
        ring_h(0.26, 0.13, 0.15, 12, cz=-0.03),
    ]
    mb.add(prim_rings(rings), 'skin_head', smooth=75)
    # mandíbula projetada (underbite) e queixo
    mb.add(prim_box(0.33, 0.14, 0.26, taper=(0.92, 0.88)), 'skin_head', M((0, -0.16, 0.13), (-12, 0, 0)),
           bevel=0.035, bevel_segments=2, smooth=45)
    mb.add(prim_box(0.20, 0.03, 0.05), 'mouth', M((0, -0.115, 0.255)), bevel=0.006)
    # presas grandes curvas (lado da mandíbula, sobem à frente do rosto)
    for sx in (-1, 1):
        path = bezier((sx * 0.115, -0.14, 0.235), (sx * 0.20, -0.07, 0.35), (sx * 0.165, 0.10, 0.345), 5)
        mb.add(prim_rings(limb_rings(path, [0.046, 0.04, 0.032, 0.022, 0.011, 0.003], 6), cap1=False), 'bone', smooth=70)
        mb.add(prim_box(0.03, 0.03, 0.025), 'bone', M((sx * 0.05, -0.115, 0.268)), bevel=0.006)
    # arcada superciliar pesada + olhos amarelos fundos
    for sx in (-1, 1):
        mb.add(prim_box(0.14, 0.055, 0.12, taper=(0.9, 0.8)), 'skin_dark', M((sx * 0.085, 0.115, 0.235), (12, 0, sx * 14)),
               bevel=0.02, smooth=30)
        mb.add(prim_sphere(0.037, 0.02, 0.02, 6, 3), 'eye', M((sx * 0.088, 0.062, 0.262), (0, 0, sx * -10)), smooth=80)
    # nariz longo e adunco
    mb.add(prim_box(0.075, 0.15, 0.13, taper=(0.55, 0.7)), 'skin_head', M((0, 0.0, 0.285), (-32, 0, 0)), bevel=0.02, smooth=35)
    for sx in (-1, 1):
        mb.add(prim_box(0.024, 0.02, 0.03), 'mouth', M((sx * 0.026, -0.06, 0.345)))
    # orelhas longas, pontudas, varridas para trás; argola de ouro
    for sx in (-1, 1):
        path = [(sx * 0.215, 0.02, -0.02), (sx * 0.34, 0.10, -0.10), (sx * 0.5, 0.26, -0.21)]
        mb.add(prim_rings(limb_rings(path, [(0.075, 0.03), (0.055, 0.022), (0.006, 0.006)], 5)), 'skin_head', smooth=60)
        mb.add(prim_sphere(0.02, 0.02, 0.02, 5, 3), 'gold', M((sx * 0.30, 0.0, -0.095)), smooth=60)
    return mb.build(mats, parent=torso, location=HEAD_PIVOT)


def build_mohawk(mats, head):
    mb = MeshBuilder('Mohawk')
    contour = [(0.17, 0.20), (0.15, 0.47), (0.095, 0.35), (0.06, 0.64), (-0.01, 0.42), (-0.06, 0.76),
               (-0.115, 0.46), (-0.18, 0.66), (-0.20, 0.36), (-0.30, 0.46), (-0.27, 0.19), (-0.35, 0.10),
               (-0.27, -0.02), (-0.20, 0.09), (-0.10, 0.19), (0.0, 0.245), (0.09, 0.24)]
    verts, faces = prim_extrude(contour, 0.15, axis='x')
    # afina a crista para as pontas e abaula no centro
    v2 = [(x * (0.35 if y > 0.36 else 1.0) if y > 0.3 else x, y, z) for (x, y, z) in verts]
    mb.add((v2, faces), 'hair', bevel=0.012, smooth=0)
    # mecha interna menor, deslocada, para volume
    contour2 = [(z * 0.9 - 0.01, y * 0.82 + 0.02) for (z, y) in contour]
    v3, f3 = prim_extrude(contour2, 0.21, axis='x')
    v3 = [(x * (0.25 if y > 0.36 else 0.9), y, z) for (x, y, z) in v3]
    mb.add((v3, f3), 'hair', smooth=0)
    return mb.build(mats, parent=head, location=(0, 0, 0))


def fist(mb, s, ox=0.0):
    """Punho grande e nodoso ao redor do cabo (eixo do cabo inclinado ~25° à frente)."""
    c = (0.0, -0.845, 0.175)
    mb.add(prim_box(0.175, 0.15, 0.17, taper=(0.95, 0.92)), 'skin_arm', M(c, (-8, 0, 0)), bevel=0.04,
           bevel_segments=2, smooth=45)
    for k, dy in enumerate((0.06, 0.02, -0.02, -0.06)):
        mb.add(prim_box(0.15, 0.036, 0.06), 'skin_arm', M((c[0], c[1] + dy - 0.005, c[2] + 0.095), (-8, 0, 0)), bevel=0.01,
               smooth=30)
    mb.add(prim_box(0.06, 0.09, 0.08), 'skin_arm', M((-s * 0.09, c[1] + 0.02, c[2] + 0.03), (0, 0, s * 20)), bevel=0.02,
           smooth=30)


def build_arm(mats, torso, side):
    s = side
    name = 'ArmR' if s > 0 else 'ArmL'
    mb = MeshBuilder(name)
    mb.add(prim_sphere(0.175, 0.16, 0.165, 8, 4), 'skin_arm', M((s * 0.02, -0.02, 0)), smooth=70)
    up = [(s * 0.02, -0.04, 0.0), (s * 0.03, -0.24, 0.0), (s * 0.03, -0.44, 0.0)]
    mb.add(prim_rings(limb_rings(up, [(0.135, 0.13), (0.15, 0.145), (0.105, 0.10)], 8)), 'skin_arm', smooth=70)
    mb.add(prim_sphere(0.09, 0.09, 0.08, 6, 3), 'skin_arm', M((s * 0.03, -0.26, 0.10)), smooth=70)   # bíceps
    mb.add(prim_sphere(0.085, 0.10, 0.085, 6, 3), 'skin_arm', M((s * 0.03, -0.44, 0.0)), smooth=70)
    fa = [(s * 0.03, -0.44, 0.0), (s * 0.03, -0.58, 0.05), (s * 0.03, -0.72, 0.12), (s * 0.025, -0.80, 0.16)]
    mb.add(prim_rings(limb_rings(fa, [0.105, 0.125, 0.105, 0.08], 8)), 'skin_arm', smooth=70)
    # braçadeira de couro com espigões + faixa de time no bíceps
    br = [(s * 0.03, -0.62, 0.075), (s * 0.028, -0.78, 0.15)]
    mb.add(prim_rings(limb_rings(br, [0.13, 0.095], 8)), 'leather_dk', bevel=0.008, smooth=30)
    for k, t in enumerate((0.25, 0.7)):
        mb.add(prim_cone(0.022, 0.07, 5), 'iron', M((s * (0.03 + 0.12), -0.62 - 0.16 * t, 0.075 + 0.075 * t),
                                                  (0, 0, -s * 90)))
    mb.add(prim_rings([ring_h(-0.14, 0.152, 0.148, 10, cx=s * 0.03), ring_h(-0.20, 0.158, 0.153, 10, cx=s * 0.03)],
                      cap0=False, cap1=False), 'team', smooth=40)
    fist(mb, s)
    if s < 0:
        # ombreira de pele com espinhos de osso (ombro esquerdo)
        pr = [ring_h(-0.13, 0.30, 0.27, 12, cx=s * 0.13), ring_h(-0.03, 0.33, 0.29, 12, cx=s * 0.11),
              ring_h(0.08, 0.28, 0.26, 12, cx=s * 0.07), ring_h(0.17, 0.20, 0.19, 12, cx=s * 0.04),
              ring_h(0.23, 0.08, 0.08, 12, cx=s * 0.03)]
        jag = {0: (-0.07, 0.05), 1: (0.05, -0.02), 2: (0.02, -0.02)}
        pr = [[(x, y + (jag[k][0] if i % 2 else jag[k][1]) if k in jag else y, z) for i, (x, y, z) in enumerate(r)]
              for k, r in enumerate(pr)]
        mb.add(prim_rings(pr, cap0=False, cap1=True), 'fur', smooth=60)
        for (dz, h, dx) in ((-0.10, 0.22, 0.10), (0.11, 0.19, 0.12)):
            mb.add(prim_cone(0.06, h, 6), 'bone', M((s * dx, 0.14, dz), (0, 0, -s * 34)), smooth=60)
        mb.add(prim_cone(0.035, 0.12, 5), 'bone', M((s * 0.20, 0.03, 0.17), (0, 0, -s * 62)), smooth=60)
        # camadas de pele: duas franjas em mechas penduradas (fasas deslocadas) por cima do pad
        for li, (y0, rr, ph) in enumerate(((0.02, 0.335, 0.0), (-0.05, 0.36, 0.5))):
            n = 10
            top = [ring_h(y0 + 0.02 - li * 0.0, rr - 0.03, rr - 0.05, n, cx=s * 0.12, phase=ph * math.pi / n)]
            low = ring_h(y0 - 0.10, rr, rr - 0.02, n, cx=s * 0.12, phase=ph * math.pi / n)
            low = [(x, yy - (0.13 if i % 2 else 0.0), z) for i, (x, yy, z) in enumerate(low)]
            mb.add(prim_rings(top + [low], cap0=False, cap1=False), 'fur' if li == 0 else 'hide', smooth=30)
        # tufos (cones de pelo) no topo do pad
        for k in range(8):
            a = 2 * math.pi * k / 8 + 0.3
            mb.add(prim_cone(0.034, 0.14, 4), 'fur_lt', M((s * 0.06 + math.cos(a) * 0.17, 0.17, math.sin(a) * 0.16),
                                                        (math.sin(a) * 25, 0, -math.cos(a) * 25)), smooth=0)
        # tira de couro costurada na base do pad
        mb.add(prim_rings([ring_h(-0.085, 0.322, 0.302, 12, cx=s * 0.12), ring_h(-0.115, 0.318, 0.298, 12, cx=s * 0.12)],
                          cap0=False, cap1=False), 'leather_dk', smooth=30)
        stitches(mb, (s * 0.12 - 0.22, -0.10, 0.24), (s * 0.12 + 0.22, -0.10, 0.24), 6, 'fur_lt', size=(0.03, 0.01, 0.01),
                 hint=(0, 0, 1))
    else:
        # ombro direito: aro de ferro com espinho + tira de couro
        mb.add(prim_sphere(0.20, 0.17, 0.2, 8, 4, y_min=0.0), 'iron', M((s * 0.04, 0.03, 0.0), (0, 0, -s * 22)),
               smooth=40, bevel=0.006)
        mb.add(prim_cone(0.06, 0.24, 6), 'bone', M((s * 0.13, 0.13, 0.0), (0, 0, -s * 40)), smooth=60)
        mb.add(prim_cyl(0.205, 0.2, 0.035, 10), 'leather_dk', M((s * 0.04, 0.03, 0.0), (0, 0, -s * 22)), smooth=30)
    return mb.build(mats, parent=torso, location=(s * ARM_PIVOT[0], ARM_PIVOT[1], ARM_PIVOT[2]))


# O machado é modelado "em pé" (cabo em +y, gume em +z) e girado por AXE_PRE dentro do nó Weapon*:
# em repouso (Weapon*.rotation.x = -45°) fica inclinado ~25° para a frente.
AXE_PRE = M(r=(70, 0, 0))


def build_weapon(mats, arm, side):
    s = side
    mb = MeshBuilder('WeaponR' if s > 0 else 'WeaponL')
    P = AXE_PRE @ M(r=(0, s * 22, 0))     # gume levemente para fora: lê melhor na câmera RTS
    mb.add(prim_cyl(0.034, 0.04, 1.0, 8, base=False), 'wood', P @ M((0, 0.17, 0)), smooth=50)
    mb.add(prim_cyl(0.048, 0.048, 0.26, 8, base=False), 'leather', P @ M((0, 0.0, 0)), smooth=50)
    for y in (-0.13, 0.13):
        mb.add(prim_cyl(0.052, 0.052, 0.02, 8, base=False), 'iron', P @ M((0, y, 0)))
    # remate: cone de ferro no cabo + pingente de osso e pena laranja
    mb.add(prim_cone(0.05, 0.11, 6), 'iron', P @ M((0, -0.335, 0), (180, 0, 0)))
    mb.add(prim_sphere(0.03, 0.03, 0.03, 5, 3), 'bone', P @ M((0.0, -0.30, 0.06)), smooth=60)
    mb.add(prim_cone(0.026, 0.2, 4), 'hair', P @ M((0.02, -0.38, -0.02), (170, 0, 0)), smooth=0)
    # cabeça: soquete de ferro, esporão traseiro, ponta superior e lâmina crescente
    mb.add(prim_box(0.075, 0.17, 0.10), 'iron', P @ M((0, 0.52, 0)), bevel=0.012)
    mb.add(prim_cone(0.036, 0.15, 5), 'steel', P @ M((0, 0.605, 0)))
    mb.add(prim_cone(0.04, 0.17, 5), 'steel', P @ M((0, 0.53, -0.07), (-90, 0, 0)))
    v, f = axe_blade([(z * 0.86, y) for (z, y) in BLADE], 0.05, 0.05, 0.33)
    mb.add((v, f), 'blade', P, bevel=0.007)
    blade_runes(mb, P, 1)
    v, f = axe_blade([(z * 0.86, y) for (z, y) in EDGE], 0.036, 0.20, 0.33)
    mb.add((v, f), 'steel', P)
    w = mb.build(mats, parent=arm, location=WEAPON_POS)
    C.set_rot_game(w, (WEAPON_REST_X, 0, 0))
    return w


def build_leg(mats, root, side):
    s = side
    mb = MeshBuilder('LegR' if s > 0 else 'LegL')
    th = [(s * 0.0, -0.02, 0.0), (s * 0.01, -0.24, 0.02), (s * 0.02, -0.44, 0.02)]
    mb.add(prim_rings(limb_rings(th, [(0.165, 0.16), (0.17, 0.165), (0.12, 0.115)], 8)), 'skin', smooth=70)
    mb.add(prim_sphere(0.115, 0.1, 0.095, 6, 3), 'skin', M((s * 0.02, -0.455, 0.05)), smooth=60)
    sh = [(s * 0.02, -0.45, 0.02), (s * 0.03, -0.62, -0.01), (s * 0.035, -0.79, 0.0)]
    mb.add(prim_rings(limb_rings(sh, [0.115, 0.125, 0.085], 8)), 'skin', smooth=70)
    mb.add(prim_sphere(0.11, 0.13, 0.085, 6, 3), 'skin', M((s * 0.03, -0.58, -0.09)), smooth=70)  # panturrilha
    # perneira de couro (cano) com fivelas e pele no joelho
    mb.add(prim_rings([ring_h(-0.72, 0.105, 0.105, 10, cx=s * 0.033), ring_h(-0.56, 0.135, 0.135, 10, cx=s * 0.03)]),
           'leather', smooth=35)
    for y in (-0.60, -0.68):
        mb.add(prim_cyl(0.14 - (y + 0.6) * -0.4, 0.14 - (y + 0.6) * -0.4, 0.03, 10), 'leather_dk',
               M((s * 0.031, y, 0.0)), smooth=40)
    fr = [ring_h(-0.45, 0.16, 0.16, 10, cx=s * 0.02), ring_h(-0.53, 0.175, 0.175, 10, cx=s * 0.022),
          ring_h(-0.60, 0.15, 0.15, 10, cx=s * 0.026)]
    mb.add(prim_rings([[(x, y + (0.03 if i % 2 else 0.0), z) for i, (x, y, z) in enumerate(r)] for r in fr]), 'fur', smooth=60)
    # pé grande com dedos e garras de osso
    mb.add(prim_box(0.25, 0.13, 0.36, taper=(0.9, 0.75), base=True), 'skin_dark', M((s * 0.035, -0.85, 0.06)),
           bevel=0.03, smooth=35)
    for k, dx in enumerate((-0.075, 0.0, 0.075)):
        mb.add(prim_box(0.075, 0.07, 0.10), 'skin_dark', M((s * 0.035 + dx, -0.85, 0.245)), bevel=0.014, smooth=30, )
        mb.add(prim_cone(0.03, 0.09, 4), 'bone', M((s * 0.035 + dx, -0.815, 0.33), (90, 0, 0)))
    mb.add(prim_rings([ring_h(-0.76, 0.1, 0.1, 10, cx=s * 0.034), ring_h(-0.79, 0.105, 0.105, 10, cx=s * 0.035)],
                      cap0=False, cap1=False), 'gold', smooth=30)
    return mb.build(mats, parent=root, location=(s * LEG_PIVOT[0], LEG_PIVOT[1], LEG_PIVOT[2]))


def main():
    args = C.script_args()
    C.reset_scene()
    mats = C.make_paint_set(PALETTE)
    add_paint(mats['skin_head'], 'head')
    add_paint(mats['skin_torso'], 'torso')
    add_paint(mats['skin_arm'], 'arm')
    root = C.make_empty('Axethrower')
    torso = build_torso(mats, root)
    head = build_head(mats, torso)
    mohawk = build_mohawk(mats, head)
    arm_l = build_arm(mats, torso, -1)
    arm_r = build_arm(mats, torso, 1)
    weapon_l = build_weapon(mats, arm_l, -1)
    weapon_r = build_weapon(mats, arm_r, 1)
    leg_l = build_leg(mats, root, -1)
    leg_r = build_leg(mats, root, 1)
    parts = [torso, head, mohawk, arm_l, arm_r, weapon_l, weapon_r, leg_l, leg_r]
    import bpy
    bpy.context.view_layer.update()

    C.uv_atlas(parts, weights={'Head': 1.6, 'Torso': 1.1, 'Mohawk': 0.7, 'ArmL': 0.9, 'ArmR': 0.9,
                               'WeaponL': 1.0, 'WeaponR': 1.0, 'LegL': 0.8, 'LegR': 0.8}, margin=0.008)
    img = C.bake_atlas(parts, 'axethrower_atlas', 512, samples=int(os.environ.get('BAKE_SAMPLES', 32)), margin=4)
    C.finalize_materials(parts, img, team_default=TEAM_DEFAULT,
                         out_png=os.path.join(C.BUILD_DIR, 'axethrower_atlas.png'))
    out = os.path.join(C.OUT_MODELS, 'axethrower.glb')
    C.export_glb(root, out)
    st = C.stats(root, out)
    print('STATS axethrower', st)
    if '--no-render' not in args:
        rig = C.RenderRig(root, 'axethrower', res=int(os.environ.get('RENDER_RES', 800)), samples=24)
        rig.render('34', (1.0, 0.95, 1.0), 30)
        rig.render('front', (0.0, 0.25, 1.0), 30)
        rig.render('back', (-0.6, 0.6, -1.0), 30)
        rig.render('side', (1.0, 0.2, 0.0), 30)
        rig.render('game', (45, 44, 45), 24, dist=78 / 1.62)
        C.set_team_color('#2f63e0')
        rig.render('34_azul', (1.0, 0.95, 1.0), 30)
        C.set_team_color(TEAM_DEFAULT)


main()
