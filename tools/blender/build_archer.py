"""
build_archer.py — Arqueiro humano (tipo interno `archer`, também usado por `ranger`) gerado 100% por script.

Uso:
  blender -b --factory-startup --python tools/blender/build_archer.py -- [--no-render]

Hierarquia PLANA (igual ao ArcherModel.js procedural — o UnitAnimator move Torso/Head/ArmL/ArmR/LegL/LegR
com posições e rotações absolutas na raiz; não aninhe as peças):
  Archer (raiz)
  ├─ Torso   pivô (0, 1.05, 0)      (gibão de couro, túnica verde, aljava, manto/capa em cor de time)
  ├─ Head    pivô (0, 1.58, 0)      (capuz em cor de time, pluma)
  ├─ ArmL    pivô (-0.38, 1.25, 0)  braço do arco
  │   └─ Bow  (0, -0.51, -0.12)     arco composto; grip em z=+0.14 (na mão), corda no plano z=0
  │       ├─ BowTipTop / BowTipBottom (empties nas pontas: ModelFactory.rebindUserData usa como
  │       │                            extremidades da corda; sem eles usa ±0.95)
  │       ├─ BowStringTop / BowStringBottom (cilindros de altura 1, centrados; o updateBowString os
  │       │                            posiciona/escala/gira a cada quadro)
  │       └─ DrawnArrow  origem = encaixe da flecha (nock); haste ao longo de +Z
  ├─ ArmR    pivô (0.38, 1.25, 0)   braço que puxa a corda
  └─ LegL / LegR  pivô (∓0.16, 0.68, 0)
Cor de time (`TeamColor`): capuz, manto dos ombros e capa curta.
"""
import os
import sys
import math

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C  # noqa: E402
from common import (MeshBuilder, M, prim_box, prim_rings, ring_h, prim_cyl, prim_cone,  # noqa: E402
                    prim_sphere, prim_extrude, limb_rings, bezier)

TORSO_PIVOT = (0.0, 1.05, 0.0)
HEAD_PIVOT = (0.0, 1.58, 0.0)
ARM_PIVOT = (0.38, 1.25, 0.0)
LEG_PIVOT = (0.16, 0.68, 0.0)
BOW_POS = (0.0, -0.51, -0.12)
BOW_TIP = 0.72          # meia-altura do arco (pontas em y = ±BOW_TIP, z = 0)
TEAM_DEFAULT = '#6b8a3a'  # verde-oliva (multiplica a área cinza)

PALETTE = {
    'skin': dict(base='#d9a273', var='#c48857', var_scale=6.0, var_amt=0.5, fine=0.05,
                 top=0.2, ao=(0.2, 0.5)),
    'hair': dict(base='#5a3a20', var='#3f2714', var_scale=10.0, fine=0.15, top=0.2, ao=(0.2, 0.5)),
    'tunic': dict(base='#b39c6a', var='#96804f', var_scale=6.0, var_amt=0.6, fine=0.10, top=0.18,
                  edge='#e8d6a8', edge_amt=0.35, edge_r=0.02, ao=(0.25, 0.6), grad=(0.0, 1.8, 0.15)),
    'sleeve': dict(base='#4e6c30', var='#3b5424', var_scale=6.0, var_amt=0.6, fine=0.10, top=0.18,
                   edge='#86a25a', edge_amt=0.35, edge_r=0.02, ao=(0.25, 0.6), grad=(0.0, 1.8, 0.15)),
    'pants': dict(base='#5a4a36', var='#443626', var_scale=5.0, fine=0.10, top=0.15,
                  edge='#7f6a50', edge_amt=0.3, edge_r=0.02, ao=(0.25, 0.6), grad=(0.0, 1.0, 0.25)),
    'leather': dict(base='#8a5528', var='#6a3e1a', var_scale=6.0, fine=0.12, top=0.2,
                    edge='#c08a52', edge_amt=0.55, edge_r=0.02, ao=(0.25, 0.6)),
    'leather_dk': dict(base='#553219', var='#3f2410', var_scale=7.0, fine=0.12, top=0.2,
                       edge='#8a5c36', edge_amt=0.45, edge_r=0.02, ao=(0.25, 0.6)),
    'bronze': dict(base='#c9963a', var='#a67622', var_scale=9.0, var_amt=0.7, fine=0.06, top=0.4,
                   edge='#ffe6a0', edge_amt=1.0, edge_r=0.016, edge_gain=12.0, ao=(0.2, 0.45)),
    'steel': dict(base='#a7b0bf', var='#8792a4', var_scale=8.0, var_amt=0.7, fine=0.08, top=0.35,
                  edge='#f4f8ff', edge_amt=1.0, edge_r=0.015, edge_gain=12.0, ao=(0.2, 0.45)),
    'wood': dict(base='#93602c', var='#6c441c', var_scale=5.0, fine=0.10, coord='object',
                 streaks=(30.0, 2.0, 0.24), top=0.25, edge='#c99458', edge_amt=0.45, edge_r=0.014,
                 ao=(0.2, 0.5)),
    'wood_lt': dict(base='#c79a55', var='#a87a3a', var_scale=6.0, fine=0.08, coord='object',
                    streaks=(40.0, 2.0, 0.2), top=0.3, edge='#e6c58a', edge_amt=0.4, edge_r=0.008,
                    ao=(0.2, 0.5)),
    'bone': dict(base='#eadfb8', var='#cdbb8a', var_scale=5.0, fine=0.08, top=0.15,
                 edge='#fff8e0', edge_amt=0.4, edge_r=0.014, ao=(0.2, 0.55)),
    'feather': dict(base='#c4522b', var='#9c3a1c', var_scale=14.0, var_amt=0.8, fine=0.10, top=0.25,
                    edge='#f0a070', edge_amt=0.45, edge_r=0.01, ao=(0.15, 0.4)),
    'fletch': dict(base='#f0ead6', var='#d9d0b4', var_scale=18.0, var_amt=0.6, fine=0.06, top=0.2,
                   ao=(0.1, 0.3)),
    'string': dict(base='#efe8d2', var='#d6cdb0', var_scale=20.0),
    'gem': dict(base='#22c98a', var='#0e8a5c', var_scale=12.0, top=0.4, emit_boost=1.15),
    'eye': dict(base='#2a4d7a', var='#1c3556', var_scale=20.0),
    'eye_w': dict(base='#f2ede2', var='#e0d9c8', var_scale=20.0),
    'mouth': dict(base='#7a3b30', var='#5a2a22'),
    'brow': dict(base='#4a2d18', var='#33200f'),
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


def arrow_parts(mb, m, length, tip_at, shaft_r=0.011, vane_len=0.13, vane_w=0.05, axis_up=True,
                fletch_mat='feather', tip=True):
    """Flecha ao longo do eixo +Y local de `m` (haste de y=0 a y=length, ponta de aço, 3 penas)."""
    mb.add(prim_cyl(shaft_r, shaft_r, length, 4), 'wood_lt', m, smooth=60)
    if tip:
        mb.add(prim_cone(shaft_r * 2.3, 0.075, 4), 'steel', m @ M((0, tip_at, 0)), bevel=0.0)
    for k in range(2):
        a = k * 90
        mb.add(prim_box(0.004, vane_len, vane_w, taper=(1, 0.5), base=True), fletch_mat,
               m @ M((0, 0.015, 0), (0, a, 0)) @ M((0, 0, vane_w / 2 + shaft_r * 0.5)))


# ---------------------------------------------------------------------------
JERKIN = [  # (y, rx, rz, cz)
    (-0.20, 0.265, 0.190, 0.00),
    (-0.02, 0.255, 0.185, 0.00),
    (0.14, 0.290, 0.205, 0.015),
    (0.30, 0.305, 0.200, 0.01),
    (0.38, 0.240, 0.165, 0.0),
]


def chest_surface_z(x, y, off=0.012):
    """z da superfície frontal do gibão em (x, y) — usado para colar correias."""
    for (y0, rx0, rz0, cz0), (y1, rx1, rz1, cz1) in zip(JERKIN[:-1], JERKIN[1:]):
        if y0 <= y <= y1:
            t = (y - y0) / (y1 - y0)
            rx, rz, cz = rx0 + (rx1 - rx0) * t, rz0 + (rz1 - rz0) * t, cz0 + (cz1 - cz0) * t
            k = max(0.0, 1.0 - (x / rx) ** 2)
            return cz + rz * math.sqrt(k) + off
    return 0.2


def build_torso(mats, root):
    mb = MeshBuilder('Torso')
    # túnica verde (aparece na barra, no colarinho e nas mangas)
    tunic = [ring_h(-0.30, 0.27, 0.20, 12), ring_h(-0.05, 0.245, 0.185, 12), ring_h(0.16, 0.285, 0.205, 12),
             ring_h(0.34, 0.29, 0.19, 12), ring_h(0.42, 0.19, 0.145, 12)]
    mb.add(prim_rings(tunic), 'tunic', smooth=70)
    # saiote da túnica com barra recortada (tiras) — dá ritmo à silhueta
    hem = []
    for (y, rx, rz, jag) in ((-0.16, 0.275, 0.20, 0.0), (-0.34, 0.31, 0.235, 0.0), (-0.52, 0.335, 0.26, 0.05)):
        ring = ring_h(y, rx, rz, 12)
        if jag:
            ring = [(x, yy + (jag if i % 2 else -jag), z) for i, (x, yy, z) in enumerate(ring)]
        hem.append(ring)
    mb.add(prim_rings(hem, cap0=False, cap1=False), 'tunic', smooth=55)
    # gibão de couro por cima (colete): sem gola, deixa a túnica aparecer no pescoço e nos ombros
    jk = [ring_h(y, rx + 0.014, rz + 0.012, 12, cz=cz) for (y, rx, rz, cz) in JERKIN[:-1]]
    jk.append(ring_h(0.33, 0.27, 0.185, 12, cz=0.01))
    mb.add(prim_rings(jk, cap1=False), 'leather', smooth=55)
    # abertura em V no peito + ilhoses e cordão de amarração
    mb.add(prim_box(0.13, 0.34, 0.03, taper=(0.15, 1.0)), 'tunic', M((0, 0.19, 0.212), (0, 0, 180)), smooth=0)
    for k in range(4):
        y = 0.30 - k * 0.075
        w = 0.05 + 0.018 * (3 - k) * 0.0 + 0.012 * k
        mb.add(prim_box(w, 0.012, 0.02), 'leather_dk', M((0, y, 0.222), (0, 0, 8 if k % 2 else -8)), bevel=0.003)
    # vivos (costuras) de couro escuro ao lado da abertura e nas laterais
    for sx in (-1, 1):
        mb.add(prim_box(0.014, 0.44, 0.012), 'leather_dk', M((sx * 0.095, 0.10, 0.205), (0, 0, sx * -8)))
        mb.add(prim_box(0.014, 0.40, 0.012), 'leather_dk', M((sx * 0.235, 0.05, 0.12), (0, sx * -35, 0)))
    # costuras/rebites de bronze nas laterais do gibão
    for sx in (-1, 1):
        for y in (0.20, 0.06):
            mb.add(prim_sphere(0.014, 0.014, 0.014, 4, 2), 'bronze',
                   M((sx * 0.293, y, 0.06)), smooth=60)
    # cinto largo + fivela de bronze
    mb.add(prim_rings([ring_h(-0.235, 0.278, 0.205, 14), ring_h(-0.115, 0.284, 0.209, 14)]), 'leather_dk',
           smooth=45, bevel=0.004)
    mb.add(prim_box(0.10, 0.11, 0.03), 'bronze', M((0, -0.175, 0.213)))
    mb.add(prim_box(0.05, 0.06, 0.035), 'leather_dk', M((0, -0.175, 0.222)))
    # bolsa de cinto (direita) e cantil/bolsinha (esquerda, atrás)
    mb.add(prim_box(0.13, 0.14, 0.09), 'leather', M((0.30, -0.20, 0.06), (0, 0, -6)), bevel=0.02, smooth=25)
    mb.add(prim_box(0.14, 0.05, 0.10), 'leather_dk', M((0.30, -0.13, 0.06), (0, 0, -6)), bevel=0.012)
    mb.add(prim_sphere(0.016, 0.016, 0.016, 5, 3), 'bronze', M((0.30, -0.17, 0.112)), smooth=60)
    mb.add(prim_box(0.11, 0.12, 0.08), 'leather', M((-0.29, -0.20, -0.10), (0, 8, 6)))
    # adaga na cintura esquerda-frente
    mb.add(prim_box(0.05, 0.28, 0.04, taper=(0.5, 0.9)), 'leather_dk', M((-0.24, -0.32, 0.16), (-6, 0, -14)),
           bevel=0.006)
    mb.add(prim_box(0.06, 0.05, 0.05), 'bronze', M((-0.20, -0.15, 0.17), (-6, 0, -14)), bevel=0.008)
    mb.add(prim_cyl(0.017, 0.017, 0.10, 6), 'leather', M((-0.19, -0.10, 0.175), (-6, 0, -14)), smooth=50)
    # correia diagonal do ombro direito ao quadril esquerdo (segura a aljava) com fivela
    path = []
    N = 9
    for i in range(N + 1):
        t = i / N
        x = 0.16 + (-0.24 - 0.16) * t
        y = 0.36 + (-0.15 - 0.36) * t
        path.append((x, y, chest_surface_z(x, y)))
    mb.add(prim_rings(limb_rings(path, [(0.04, 0.014)] * len(path), 6, up=(0, 0, 1))), 'leather_dk', smooth=60)
    mb.add(prim_box(0.075, 0.05, 0.03), 'bronze', M((-0.02, 0.13, chest_surface_z(-0.02, 0.13) + 0.012),
                                                    (0, 0, -42)), bevel=0.008)
    # manto dos ombros (cor de time): cai sobre os ombros, barra recortada
    mant = [ring_h(0.43, 0.185, 0.15, 12), ring_h(0.37, 0.30, 0.235, 12), ring_h(0.28, 0.375, 0.27, 12)]
    mant = [[(x, y + (0.035 if (k == 2 and i % 2) else 0.0), z) for i, (x, y, z) in enumerate(r)]
            for k, r in enumerate(mant)]
    mb.add(prim_rings(mant, cap0=False, cap1=False), 'team', smooth=55)
    mb.add(prim_rings([ring_h(0.42, 0.20, 0.165, 12), ring_h(0.455, 0.19, 0.155, 12)], cap0=False, cap1=False),
           'team', smooth=30)
    mb.add(prim_rings([ring_h(0.305, 0.352, 0.258, 12), ring_h(0.285, 0.372, 0.268, 12)], cap0=False, cap1=False),
           'leather_dk', smooth=30)
    # capa curta nas costas (cor de time) presa aos ombros por dois fechos de bronze com gema
    mb.add(cloth_panel((0.24, 0.32, -0.19), (-0.24, 0.32, -0.19), (0.34, -0.42, -0.27), (-0.34, -0.42, -0.27),
                       nx=6, ny=5, thick=0.03, bulge=(0, 0, -0.06), wave=0.045, jag=0.06), 'team', smooth=50)
    for sx in (-1, 1):
        mb.add(prim_cyl(0.034, 0.034, 0.02, 8), 'bronze', M((sx * 0.20, 0.34, 0.15), (78, 0, 0)), smooth=30)
        mb.add(prim_sphere(0.02, 0.02, 0.014, 6, 3), 'gem', M((sx * 0.20, 0.35, 0.165), (0, 0, 0)), smooth=70)
    # ---- aljava (costas, direita) ----
    Q = M((0.14, 0.14, -0.31), (-13, 0, -13))
    body = [ring_h(-0.02, 0.058, 0.058, 10), ring_h(0.20, 0.078, 0.078, 10), ring_h(0.40, 0.088, 0.088, 10)]
    mb.add(prim_rings(body), 'leather_dk', Q, smooth=60)
    mb.add(prim_cone(0.058, 0.09, 10), 'bronze', Q @ M((0, -0.10, 0), (180, 0, 0)), smooth=40)
    for (y, r) in ((0.0, 0.062), (0.39, 0.092)):
        mb.add(prim_cyl(r, r, 0.05, 10), 'bronze', Q @ M((0, y - 0.025 if y else y, 0)), smooth=30, bevel=0.003)
    mb.add(prim_box(0.02, 0.24, 0.006), 'leather', Q @ M((0, 0.20, 0.092)), bevel=0.003)
    # flechas na aljava: hastes emergindo do topo com penas (silhueta)
    import random
    rnd = random.Random(7)
    for k in range(6):
        a = 2 * math.pi * k / 6 + 0.3
        rr = 0.028 + (k % 2) * 0.012
        ax, az = math.cos(a) * rr, math.sin(a) * rr
        tilt_x = math.degrees(az * 3.2) + rnd.uniform(-3, 3)
        tilt_z = -math.degrees(ax * 3.2) + rnd.uniform(-3, 3)
        top = 0.62 + (k % 3) * 0.05
        arrow_parts(mb, Q @ M((ax, 0.30, az), (tilt_x, 0, tilt_z)), top - 0.30, top - 0.30 + 0.0, tip=False,
                    fletch_mat='feather' if k % 2 == 0 else 'fletch', vane_len=0.11, vane_w=0.05)
    return mb.build(mats, parent=root, location=TORSO_PIVOT)


def build_head(mats, root):
    mb = MeshBuilder('Head')
    # pescoço + rosto (só a face frontal +Z tem traços)
    mb.add(prim_cyl(0.06, 0.07, 0.14, 8), 'skin', M((0, -0.2, 0.0)), smooth=60)
    mb.add(prim_sphere(0.122, 0.148, 0.148, 12, 6), 'skin', M((0, 0.005, 0.06)), smooth=75)
    for sx in (-1, 1):
        mb.add(prim_sphere(0.028, 0.017, 0.014, 6, 3), 'eye_w', M((sx * 0.052, 0.016, 0.202)), smooth=80)
        mb.add(prim_box(0.062, 0.016, 0.03), 'skin', M((sx * 0.052, 0.032, 0.204), (-6, 0, sx * 8)), bevel=0.004)
        mb.add(prim_sphere(0.014, 0.014, 0.012, 6, 3), 'eye', M((sx * 0.052, 0.012, 0.213)), smooth=80)
        mb.add(prim_box(0.072, 0.02, 0.022), 'brow', M((sx * 0.055, 0.058, 0.196), (-6, 0, sx * 10)), bevel=0.005)
    mb.add(prim_box(0.036, 0.075, 0.045, taper=(0.7, 0.8)), 'skin', M((0, -0.03, 0.212), (-10, 0, 0)), bevel=0.008)
    mb.add(prim_box(0.07, 0.014, 0.014), 'mouth', M((0, -0.098, 0.196)), bevel=0.003)
    # cabelo aparecendo sob o capuz (nuca/têmporas)
    mb.add(prim_sphere(0.14, 0.11, 0.14, 10, 4, y_max=0.3), 'hair', M((0, -0.05, -0.04)), smooth=70)
    # capuz: domo maior que a cabeça (o rosto vaza pela frente), gola e bico caído para trás
    hood = [ring_h(-0.12, 0.165, 0.17, 12, cz=-0.03), ring_h(0.0, 0.195, 0.205, 12, cz=-0.025),
            ring_h(0.12, 0.185, 0.20, 12, cz=-0.03), ring_h(0.22, 0.13, 0.14, 12, cz=-0.05),
            ring_h(0.29, 0.05, 0.06, 12, cz=-0.09)]
    mb.add(prim_rings(hood), 'team', smooth=55)
    # bico do capuz caído para trás
    pk = bezier((0, 0.26, -0.09), (0, 0.36, -0.20), (0, 0.24, -0.38), 5)
    mb.add(prim_rings(limb_rings(pk, [0.052, 0.045, 0.034, 0.022, 0.012, 0.004], 6, up=(1, 0, 0)), cap1=False),
           'team', smooth=70)
    # costura central do capuz (nervura de couro)
    mb.add(prim_rings(limb_rings(bezier((0, 0.21, 0.13), (0, 0.32, 0.0), (0, 0.27, -0.09), 3), [0.011] * 4, 4, up=(1, 0, 0)), cap0=False, cap1=False), 'leather_dk', smooth=40)
    # gola do capuz sobre os ombros (anel de tecido)
    mb.add(prim_rings([ring_h(-0.15, 0.21, 0.19, 12, cz=0.0), ring_h(-0.22, 0.25, 0.21, 12, cz=0.0)],
                      cap0=False, cap1=False), 'team', smooth=50)
    # debrum do rosto (aro de couro escuro em volta da abertura)
    rim = []
    for k in range(14):
        a = 2 * math.pi * k / 14
        rim.append((math.cos(a) * 0.118, 0.012 + math.sin(a) * 0.150, 0.168 - 0.03 * (1 - math.cos(a * 0.0))))
    rim.append(rim[0])
    mb.add(prim_rings(limb_rings(rim, [(0.014, 0.012)] * len(rim), 5, up=(0, 0, 1)), cap0=False, cap1=False),
           'leather_dk', smooth=60)
    # pluma (penas vermelhas) presa por broche de bronze com gema, no lado esquerdo do capuz
    mb.add(prim_cyl(0.034, 0.034, 0.02, 8), 'bronze', M((-0.19, 0.06, 0.06), (0, 0, 90)), smooth=30, bevel=0.004)
    mb.add(prim_sphere(0.02, 0.02, 0.016, 6, 3), 'gem', M((-0.205, 0.06, 0.06), (0, 0, 90)), smooth=70)
    for (dz, dl, curl) in ((0.03, 0.40, 0.0), (0.0, 0.34, 12), (-0.03, 0.29, 24)):
        pth = bezier((-0.20, 0.08, dz), (-0.30, 0.26 + dl * 0.2, dz - 0.10 - curl * 0.004), (-0.20, 0.30 + dl * 0.2, dz - 0.34 - curl * 0.004), 6)
        rad = [(0.006, 0.025), (0.016, 0.045), (0.024, 0.055), (0.024, 0.05), (0.018, 0.04), (0.009, 0.02), (0.003, 0.008)]
        mb.add(prim_rings(limb_rings(pth, rad, 6, up=(0, 0, 1)), cap1=False), 'feather', smooth=65)
    return mb.build(mats, parent=root, location=HEAD_PIVOT)


def hand_grip(mb, s, ox=0.0):
    """Punho fechado ao redor do grip do arco (mão esquerda)."""
    mb.add(prim_box(0.115, 0.13, 0.125, taper=(0.92, 0.95)), 'skin', M((ox, -0.545, 0.03)), bevel=0.028,
           bevel_segments=2, smooth=45)
    for k, dy in enumerate((0.045, 0.015, -0.015, -0.045)):
        mb.add(prim_box(0.12, 0.028, 0.05), 'skin', M((ox, -0.545 + dy, 0.105)), bevel=0.008, smooth=30)
    mb.add(prim_box(0.05, 0.065, 0.075), 'skin', M((ox - s * 0.06, -0.50, 0.10), (0, 0, s * 20)), bevel=0.014,
           smooth=30)


def hand_open(mb, s):
    """Mão que puxa a corda: dedos meio dobrados, com dedeira de couro."""
    mb.add(prim_box(0.10, 0.09, 0.09, taper=(0.9, 0.9)), 'skin', M((0, -0.55, 0.02)), bevel=0.02, smooth=40)
    for k, dx in enumerate((-0.036, -0.012, 0.012, 0.036)):
        mb.add(prim_box(0.024, 0.075, 0.03), 'skin', M((dx, -0.615, 0.045), (-18, 0, 0)), bevel=0.006, smooth=30)
    mb.add(prim_box(0.10, 0.03, 0.05), 'leather_dk', M((0, -0.595, 0.05), (-18, 0, 0)), bevel=0.006)
    mb.add(prim_box(0.045, 0.07, 0.04), 'skin', M((-s * 0.06, -0.55, 0.06), (0, 0, s * 25)), bevel=0.01, smooth=30)


def build_arm(mats, root, side):
    s = side
    mb = MeshBuilder('ArmR' if s > 0 else 'ArmL')
    # capa de ombro em couro com rebites de bronze
    mb.add(prim_sphere(0.118, 0.075, 0.118, 10, 4, y_min=0.0), 'leather', M((s * 0.012, 0.07, 0.0), (0, 0, -s * 14)),
           smooth=55, bevel=0.004)
    mb.add(prim_cyl(0.12, 0.116, 0.022, 10), 'leather_dk', M((s * 0.02, 0.055, 0.0), (0, 0, -s * 14)), smooth=30)
    mb.add(prim_sphere(0.125, 0.06, 0.125, 10, 3, y_min=0.0), 'leather_dk', M((s * 0.045, 0.0, 0.0), (0, 0, -s * 26)), smooth=50)
    for a in (-0.7, 0.0, 0.7):
        mb.add(prim_sphere(0.014, 0.014, 0.012, 5, 3), 'bronze',
               M((s * (0.022 + 0.078 * math.sin(a)), 0.075 + 0.02, 0.09 * math.cos(a) * 0.9)), smooth=60)
    # manga da túnica (bíceps) e braçal
    up = [(s * 0.008, -0.02, 0.0), (s * 0.014, -0.16, 0.0), (s * 0.02, -0.30, 0.008)]
    mb.add(prim_rings(limb_rings(up, [(0.088, 0.088), (0.093, 0.093), (0.078, 0.078)], 8)), 'sleeve', smooth=70)
    mb.add(prim_sphere(0.075, 0.07, 0.075, 8, 4), 'sleeve', M((s * 0.022, -0.31, 0.01)), smooth=60)
    fa = [(s * 0.024, -0.32, 0.012), (s * 0.026, -0.42, 0.02), (s * 0.027, -0.51, 0.026)]
    mb.add(prim_rings(limb_rings(fa, [0.066, 0.07, 0.058], 8)), 'sleeve', smooth=70)
    # braçadeira de couro (arqueiro) com tiras e rebites
    br = [(s * 0.025, -0.385, 0.017), (s * 0.026, -0.44, 0.02), (s * 0.0268, -0.505, 0.025)]
    mb.add(prim_rings(limb_rings(br, [0.076, 0.078, 0.066], 8)), 'leather_dk', smooth=40, bevel=0.005)
    for y in (-0.41, -0.47):
        mb.add(prim_box(0.16, 0.016, 0.155), 'leather', M((s * 0.026, y, 0.02)), bevel=0.005, smooth=0)
    for (y, dz) in ((-0.40, 0.078), (-0.47, 0.076)):
        mb.add(prim_sphere(0.011, 0.011, 0.011, 5, 3), 'steel', M((s * 0.026, y, 0.02 + dz)), smooth=60)
    if s < 0:
        hand_grip(mb, s)
    else:
        hand_open(mb, s)
    return mb.build(mats, parent=root, location=(s * ARM_PIVOT[0], ARM_PIVOT[1], ARM_PIVOT[2]))


def build_leg(mats, root, side):
    s = side
    mb = MeshBuilder('LegR' if s > 0 else 'LegL')
    th = [(0, -0.02, 0), (s * 0.005, -0.18, 0.01), (s * 0.01, -0.33, 0.012)]
    mb.add(prim_rings(limb_rings(th, [(0.115, 0.12), (0.12, 0.125), (0.098, 0.10)], 8)), 'pants', smooth=70)
    # joelheira de couro com rebites
    mb.add(prim_sphere(0.095, 0.075, 0.07, 8, 4), 'leather', M((s * 0.012, -0.335, 0.075)), smooth=50)
    mb.add(prim_sphere(0.014, 0.014, 0.012, 5, 3), 'bronze', M((s * 0.012, -0.335, 0.138)), smooth=60)
    # bota cano alto com dobra (cuff), tiras e fivelas
    sh = [(s * 0.012, -0.30, 0.014), (s * 0.016, -0.46, 0.01), (s * 0.02, -0.62, 0.005)]
    mb.add(prim_rings(limb_rings(sh, [0.098, 0.095, 0.078], 9)), 'leather_dk', smooth=60, bevel=0.004)
    cuff = [ring_h(-0.29, 0.105, 0.11, 10, cx=s * 0.012), ring_h(-0.345, 0.118, 0.122, 10, cx=s * 0.012)]
    mb.add(prim_rings(cuff, cap0=False, cap1=False), 'leather', smooth=35)
    mb.add(prim_rings([ring_h(-0.345, 0.118, 0.122, 10, cx=s * 0.012), ring_h(-0.35, 0.10, 0.104, 10, cx=s * 0.012)],
                      cap0=False, cap1=False), 'leather_dk', smooth=35)
    for y in (-0.49, -0.57):
        mb.add(prim_cyl(0.103 - (y + 0.49) * -0.15, 0.103 - (y + 0.49) * -0.15, 0.022, 8), 'leather',
               M((s * 0.018, y, 0.0)), smooth=40)
    mb.add(prim_box(0.024, 0.026, 0.02), 'bronze', M((s * 0.117, -0.49, 0.0)), bevel=0.005)
    # pé: solado, biqueira e peito do pé
    mb.add(prim_box(0.16, 0.06, 0.32, taper=(0.86, 0.72), base=True), 'leather_dk', M((s * 0.02, -0.68, 0.055)),
           bevel=0.014, smooth=35)
    mb.add(prim_box(0.15, 0.05, 0.20, taper=(0.9, 0.8), base=True), 'leather', M((s * 0.02, -0.635, 0.085)),
           bevel=0.012, smooth=35)
    mb.add(prim_box(0.16, 0.022, 0.335, taper=(0.88, 0.74), base=True), 'leather', M((s * 0.02, -0.69, 0.055)),
           bevel=0.006)
    mb.add(prim_box(0.12, 0.035, 0.05), 'leather', M((s * 0.02, -0.665, 0.205)), bevel=0.008)
    return mb.build(mats, parent=root, location=(s * LEG_PIVOT[0], LEG_PIVOT[1], LEG_PIVOT[2]))


def limb_path(sgn):
    """Curva do braço do arco (sgn=+1 superior, -1 inferior). Origem = grip; +z = frente."""
    pts = [(0.0, 0.10, 0.15), (0.0, 0.22, 0.185), (0.0, 0.38, 0.185), (0.0, 0.52, 0.135),
           (0.0, 0.63, 0.07), (0.0, 0.71, 0.005)]
    return [(x, sgn * y, z) for (x, y, z) in pts]


def build_bow(mats, arm_l):
    mb = MeshBuilder('Bow')
    for sgn in (1, -1):
        path = limb_path(sgn)
        rad = [(0.042, 0.032), (0.05, 0.03), (0.047, 0.027), (0.038, 0.023), (0.026, 0.018), (0.016, 0.013)]
        # braço = loft de madeira; a face de trás (lado da corda) leva uma tira de corno claro
        mb.add(prim_rings(limb_rings(path, rad, 8, up=(1, 0, 0) if False else (0, 0, 1))), 'wood', smooth=60)
        # tira de corno (face frontal) e reforço de bronze perto do riser
        strip = [(x, y, z + 0.018) for (x, y, z) in path[1:5]]
        mb.add(prim_rings(limb_rings(strip, [(0.022, 0.008), (0.022, 0.008), (0.018, 0.007), (0.013, 0.006)], 6)),
               'bone', smooth=60)
        # ponteira de bronze e nock de corno na extremidade (entalhe da corda)
        mb.add(prim_sphere(0.024, 0.02, 0.024, 6, 3), 'bronze', M((0, sgn * 0.70, 0.012)), smooth=60)
        mb.add(prim_box(0.028, 0.03, 0.03), 'bone', M((0, sgn * 0.735, -0.004)), bevel=0.007)
    # riser (parte central) mais grosso + empunhadura de couro + anéis de bronze
    riser = [(0.0, -0.14, 0.15), (0.0, -0.05, 0.145), (0.0, 0.05, 0.145), (0.0, 0.14, 0.15)]
    mb.add(prim_rings(limb_rings(riser, [(0.044, 0.04), (0.052, 0.05), (0.052, 0.05), (0.044, 0.04)], 8,
                                 up=(0, 0, 1))), 'wood', smooth=55)
    mb.add(prim_cyl(0.05, 0.05, 0.15, 8), 'leather', M((0, -0.075, 0.147)), smooth=50)
    for y in (-0.085, 0.085):
        mb.add(prim_cyl(0.056, 0.056, 0.016, 8), 'bronze', M((0, y - 0.008 + (0.0), 0.147)), smooth=30, bevel=0.003)
    # ombreira/descanso da flecha (lado da flecha) e placa de bronze
    mb.add(prim_box(0.028, 0.05, 0.05), 'wood', M((0.048, 0.10, 0.15)), bevel=0.008)
    mb.add(prim_box(0.008, 0.16, 0.03), 'bronze', M((0.03, 0.0, 0.19)), bevel=0.002)
    bow = mb.build(mats, parent=arm_l, location=BOW_POS)
    # pontas da corda (empties) — ModelFactory.rebindUserData as lê
    C.make_empty('BowTipTop', (0, BOW_TIP, 0.0), parent=bow)
    C.make_empty('BowTipBottom', (0, -BOW_TIP, 0.0), parent=bow)
    return bow


def build_strings(mats, bow):
    out = []
    for name, sgn in (('BowStringTop', 1), ('BowStringBottom', -1)):
        mb = MeshBuilder(name)
        mb.add(prim_cyl(0.0065, 0.0065, 1.0, 4, base=False), 'string', smooth=60)
        o = mb.build(mats, parent=bow, location=(0, sgn * BOW_TIP / 2, 0.0))
        o.scale = (1.0, 1.0, BOW_TIP)  # Blender: eixo Z = y do jogo (comprimento inicial do segmento)
        out.append(o)
    return out


def build_arrow(mats, bow):
    mb = MeshBuilder('DrawnArrow')
    # eixo do jogo +Z: constrói ao longo de +Y e gira -> +Z; deslocada em x para passar ao lado do grip
    R = M((0.048, 0.0, 0.0), (90, 0, 0))
    mb.add(prim_cyl(0.0095, 0.0095, 0.70, 6), 'wood_lt', R @ M((0, 0.02, 0)), smooth=60)
    mb.add(prim_cone(0.03, 0.09, 4), 'steel', R @ M((0, 0.72, 0)), bevel=0.0)
    mb.add(prim_box(0.03, 0.02, 0.03), 'bone', R @ M((0, 0.03, 0)), bevel=0.004)
    for k in range(3):
        mb.add(prim_box(0.004, 0.13, 0.05, taper=(1, 0.5), base=True), 'feather' if k == 0 else 'fletch',
               R @ M((0, 0.045, 0), (0, k * 120, 0)) @ M((0, 0, 0.025)))
    return mb.build(mats, parent=bow, location=(0, 0, 0))


def main():
    args = C.script_args()
    C.reset_scene()
    mats = C.make_paint_set(PALETTE)
    root = C.make_empty('Archer')
    torso = build_torso(mats, root)
    head = build_head(mats, root)
    arm_l = build_arm(mats, root, -1)
    arm_r = build_arm(mats, root, 1)
    leg_l = build_leg(mats, root, -1)
    leg_r = build_leg(mats, root, 1)
    bow = build_bow(mats, arm_l)
    strings = build_strings(mats, bow)
    arrow = build_arrow(mats, bow)
    parts = [torso, head, arm_l, arm_r, leg_l, leg_r, bow, arrow] + strings
    import bpy
    bpy.context.view_layer.update()

    C.uv_atlas(parts, weights={'Head': 1.6, 'Torso': 1.25, 'Bow': 1.3, 'LegL': 0.85, 'LegR': 0.85, 'ArmL': 0.9,
                               'ArmR': 0.9, 'DrawnArrow': 0.8, 'BowStringTop': 1.0, 'BowStringBottom': 1.0},
               margin=0.008)
    img = C.bake_atlas(parts, 'archer_atlas', 512, samples=int(os.environ.get('BAKE_SAMPLES', 32)), margin=4)
    C.finalize_materials(parts, img, team_default=TEAM_DEFAULT,
                         out_png=os.path.join(C.BUILD_DIR, 'archer_atlas.png'))
    out = os.path.join(C.OUT_MODELS, 'archer.glb')
    C.export_glb(root, out)
    st = C.stats(root, out)
    print('STATS archer', st)
    if '--no-render' not in args:
        arrow.hide_render = True
        rig = C.RenderRig(root, 'archer', res=int(os.environ.get('RENDER_RES', 800)), samples=24)
        rig.render('34', (1.0, 0.95, 1.0), 30)
        rig.render('front', (0.0, 0.25, 1.0), 30)
        rig.render('back', (-0.6, 0.6, -1.0), 30)
        rig.render('side', (1.0, 0.2, 0.0), 30)
        rig.render('game', (45, 44, 45), 24, dist=78 / 1.62)
        C.set_team_color('#2f63e0')
        rig.render('34_azul', (1.0, 0.95, 1.0), 30)
        C.set_team_color(TEAM_DEFAULT)


main()
