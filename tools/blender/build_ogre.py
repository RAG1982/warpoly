"""
build_ogre.py — Ogro da Horda (tipo interno `ogre`) gerado 100% por script.

Uso:
  blender -b --factory-startup --python tools/blender/build_ogre.py -- [--no-render]

Hierarquia ANINHADA (igual ao OgreModel.js procedural / Grunt; nomes do UnitAnimator):
  Ogre (raiz)
  ├─ Torso            pivô na cintura (0, 1.5, 0)   (cinto, tanga e capa em cor de time)
  │  ├─ Head          pivô no pescoço
  │  ├─ ArmL / ArmR   pivô nos ombros (repouso: rotação 0); ombreira de ferro incluída
  │  │   └─ Weapon    (em ArmR) pivô na empunhadura, repouso rot x = -45°
  ├─ LegL / LegR      pivô nos quadris
A clava é modelada "de pé" (cabo em +y) e girada por CLUB_PRE dentro do nó Weapon, para que em
repouso (rot x -45°) fique inclinada ~15° à frente do corpo; o UnitAnimator soma suas rotações.
"""
import os
import sys
import math

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C  # noqa: E402
from common import (MeshBuilder, M, prim_box, prim_rings, ring_h, prim_cyl, prim_cone,  # noqa: E402
                    prim_sphere, prim_extrude, limb_rings, bezier)

TORSO_PIVOT = (0.0, 1.5, 0.0)
HEAD_PIVOT = (0.0, 0.92, 0.22)       # relativo ao Torso
ARM_PIVOT = (0.98, 0.66, 0.0)        # relativo ao Torso (x espelhado)
LEG_PIVOT = (0.44, 1.05, 0.0)        # relativo à raiz
WEAPON_PIVOT = (0.06, -1.12, 0.26)   # relativo ao ArmR (punho)
WEAPON_REST_X = -45.0
TEAM_DEFAULT = '#d23a2c'

PALETTE = {
    'skin': dict(base='#8a7358', var='#66523f', var_scale=3.5, var_amt=0.7, fine=0.07,
                 grad=(0.0, 3.2, 0.30), top=0.22, edge='#d2bd9a', edge_amt=0.35, edge_r=0.035,
                 ao=(0.35, 0.7), coord='world'),
    'skin_dark': dict(base='#625243', var='#4c3f33', var_scale=4.0, fine=0.06, grad=(0.0, 3.2, 0.2),
                      top=0.15, ao=(0.3, 0.6)),
    'scar': dict(base='#c29a8c', var='#a67c72', var_scale=10.0, fine=0.08, top=0.2, ao=(0.15, 0.4)),
    'leather': dict(base='#6b4324', var='#513019', var_scale=6.0, fine=0.12, top=0.2,
                    edge='#a47245', edge_amt=0.55, edge_r=0.025, ao=(0.25, 0.6)),
    'hide': dict(base='#5a4732', var='#3d2f20', var_scale=5.0, fine=0.14, top=0.15,
                 edge='#8b6f4c', edge_amt=0.35, edge_r=0.03, ao=(0.3, 0.65), grad=(0.0, 2.0, 0.25)),
    'iron': dict(base='#4a4f5a', var='#33373f', var_scale=6.0, var_amt=0.9, fine=0.16, top=0.35,
                 edge='#c9d0dc', edge_amt=0.95, edge_r=0.025, edge_gain=12.0, ao=(0.3, 0.6)),
    'rust': dict(base='#6d4a36', var='#3b2c25', var_scale=9.0, var_amt=1.0, fine=0.2, top=0.3,
                 edge='#b58a62', edge_amt=0.7, edge_r=0.025, edge_gain=12.0, ao=(0.25, 0.55)),
    'bone': dict(base='#e3d5aa', var='#bfa978', var_scale=5.0, fine=0.08, top=0.15,
                 edge='#fff6dc', edge_amt=0.4, edge_r=0.02, ao=(0.2, 0.55), grad=(0.0, 3.2, 0.2)),
    'fur': dict(base='#6a5139', var='#43321f', var_scale=9.0, var_amt=1.0, fine=0.25, fine_scale=40.0,
                streaks=(3.0, 40.0, 0.25), top=0.25, edge='#a98c66', edge_amt=0.5, edge_r=0.03,
                ao=(0.25, 0.6), coord='object'),
    'hair': dict(base='#2c2119', var='#181009', var_scale=14.0, fine=0.2, top=0.2, ao=(0.2, 0.5)),
    'wood': dict(base='#6d4a2a', var='#4a3119', var_scale=5.0, var_amt=1.0, fine=0.12, coord='object',
                 streaks=(40.0, 2.0, 0.3), edge='#a67d52', edge_amt=0.45, edge_r=0.02, ao=(0.25, 0.55)),
    'eye': dict(base='#ffc23a', var='#ff7a1a', var_scale=20.0, emit_boost=1.4),
    'mouth': dict(base='#2a1512', var='#1a0d0b'),
    'team': dict(base='#b8b0a4', var='#9d9589', var_scale=5.0, fine=0.08, top=0.25,
                 edge='#d8d2c8', edge_amt=0.3, edge_r=0.03, ao=(0.3, 0.65), team=True),
}


def cloth_panel(top_l, top_r, bot_l, bot_r, nx=5, ny=4, thick=0.04, bulge=(0, 0, 0),
                wave=0.04, jag=0.06):
    """Painel de tecido (slab fino) entre 4 cantos, com dobras e barra rasgada."""
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


def chain(mb, pts, mat='iron', link=0.05):
    """Corrente: elos alternados (caixas finas) ao longo de uma polilinha."""
    import mathutils
    V = mathutils.Vector
    for i in range(len(pts) - 1):
        a, b = V(pts[i]), V(pts[i + 1])
        mid = (a + b) / 2
        d = b - a
        L = d.length
        ang_z = math.degrees(math.atan2(-d.x, d.y))
        ang_x = math.degrees(math.atan2(d.z, math.hypot(d.x, d.y)))
        roll = 90 if i % 2 else 0
        mb.add(prim_box(link * 0.7, L * 1.15, link * 0.7), mat,
               M(tuple(mid), (-ang_x, 0, ang_z)) @ M(r=(0, roll, 0)), bevel=0.008)


def spike(mb, base_pt, dirv, r, h, mat='iron', n=5):
    """Cone apontando em `dirv` (unitário) a partir de base_pt (espaço do jogo)."""
    import mathutils
    V = mathutils.Vector
    d = V(dirv).normalized()
    q = V((0, 1, 0)).rotation_difference(d)
    e = q.to_euler('XYZ')
    mb.add(prim_cone(r, h, n), mat, M(base_pt, (math.degrees(e.x), math.degrees(e.y), math.degrees(e.z))),
           smooth=60)


# ---------------------------------------------------------------------------
def build_torso(mats, root):
    mb = MeshBuilder('Torso')
    # tronco: pélvis, barrigão, caixa torácica larga, pescoço grosso (loft) — pele
    rings = [
        ring_h(-0.66, 0.56, 0.44, 12, cz=0.02),
        ring_h(-0.50, 0.70, 0.62, 12, cz=0.10),
        ring_h(-0.26, 0.78, 0.72, 12, cz=0.16),
        ring_h(-0.02, 0.74, 0.62, 12, cz=0.12),
        ring_h(0.22, 0.72, 0.52, 12, cz=0.06),
        ring_h(0.48, 0.86, 0.54, 12, cz=0.06),
        ring_h(0.70, 0.94, 0.52, 12, cz=0.0),
        ring_h(0.86, 0.72, 0.42, 12, cz=-0.05),
        ring_h(0.98, 0.40, 0.32, 12, cz=0.0),
        ring_h(1.06, 0.30, 0.26, 12, cz=0.12),
    ]
    mb.add(prim_rings(rings), 'skin', smooth=72)
    # peitorais, ombros de "trapézio" e barriga saliente
    for sx in (-1, 1):
        mb.add(prim_sphere(0.36, 0.24, 0.20, 10, 5), 'skin', M((sx * 0.30, 0.50, 0.50), (10, sx * 14, sx * -8)), smooth=70)
        mb.add(prim_sphere(0.30, 0.20, 0.26, 8, 4), 'skin', M((sx * 0.50, 0.90, -0.02)), smooth=70)   # trapézio
        # costelas / oblíquos
        mb.add(prim_sphere(0.20, 0.26, 0.18, 8, 4), 'skin', M((sx * 0.52, -0.02, 0.36), (0, sx * 20, 0)), smooth=70)
    mb.add(prim_sphere(0.58, 0.36, 0.30, 10, 5), 'skin', M((0, -0.34, 0.60)), smooth=70)   # pança
    mb.add(prim_sphere(0.09, 0.05, 0.05, 6, 3), 'skin_dark', M((0, -0.32, 0.88)), smooth=60)  # umbigo
    # cicatrizes (frisos claros sobre a pele): garra diagonal no peito e corte na pança
    for dx in (-0.07, 0.0, 0.07):
        mb.add(prim_box(0.03, 0.30, 0.025), 'scar', M((-0.28 + dx, 0.50 - dx * 0.4, 0.695 - abs(dx) * 0.2),
                                                        (12, 0, -28)), bevel=0.005)
    mb.add(prim_box(0.03, 0.30, 0.025), 'scar', M((0.20, -0.16, 0.815), (-8, 0, 32)), bevel=0.005)
    # pescoço grosso com gola de pelo
    mb.add(prim_rings([ring_h(0.96, 0.62, 0.46, 12, cz=-0.06), ring_h(1.06, 0.54, 0.40, 12, cz=-0.04),
                       ring_h(1.12, 0.36, 0.30, 12, cz=0.02)], cap0=False, cap1=False), 'fur', smooth=60)

    # arreio de couro: correia diagonal com argolas de ferro e rebites
    ctr = (0.0, 0.32, 0.0)
    ux, uy = 0.78, -0.62
    loop = []
    N = 14
    for k in range(N):
        t = 2 * math.pi * k / N
        R1 = 1.02
        R2 = 0.50 + 0.14 * math.sin(t) + 0.04
        cx = ctr[0] + ux * R1 * math.cos(t) * 0.9
        cy = ctr[1] + uy * R1 * math.cos(t) * 0.9
        cz = ctr[2] + R2 * math.sin(t) + 0.1
        rx, ry, rz = ux * math.cos(t), uy * math.cos(t), math.sin(t)
        nx_, ny_ = -uy, ux
        w, th = 0.085, 0.04
        loop.append([
            (cx + nx_ * w + rx * th, cy + ny_ * w + ry * th, cz + rz * th),
            (cx - nx_ * w + rx * th, cy - ny_ * w + ry * th, cz + rz * th),
            (cx - nx_ * w - rx * th, cy - ny_ * w - ry * th, cz - rz * th),
            (cx + nx_ * w - rx * th, cy + ny_ * w - ry * th, cz - rz * th),
        ])
    loop.append(loop[0])
    mb.add(prim_rings(loop, cap0=False, cap1=False), 'leather', smooth=50)
    for t in (1.25, 1.55, 1.85):
        cx = ctr[0] + ux * 1.02 * math.cos(t) * 0.9
        cy = ctr[1] + uy * 1.02 * math.cos(t) * 0.9
        cz = ctr[2] + (0.5 + 0.14 * math.sin(t) + 0.04) * math.sin(t) + 0.1 + 0.05
        mb.add(prim_sphere(0.05, 0.05, 0.035, 6, 3), 'iron', M((cx, cy, cz)), smooth=60)

    # cinto largo com fivela de ferro em caveira e correntes penduradas
    mb.add(prim_rings([ring_h(-0.60, 0.74, 0.64, 12, cz=0.10), ring_h(-0.36, 0.80, 0.70, 12, cz=0.13)]),
           'leather', smooth=40)
    mb.add(prim_box(0.46, 0.34, 0.09), 'iron', M((0, -0.47, 0.82), (-4, 0, 0)), bevel=0.035)
    mb.add(prim_sphere(0.12, 0.13, 0.08, 7, 4), 'bone', M((0, -0.46, 0.90)), smooth=60)
    for sx in (-1, 1):
        mb.add(prim_box(0.05, 0.05, 0.05), 'mouth', M((sx * 0.045, -0.44, 0.96)))
    mb.add(prim_box(0.06, 0.06, 0.04), 'mouth', M((0, -0.52, 0.95)))
    for sx in (-1, 1):
        mb.add(prim_sphere(0.05, 0.05, 0.04, 5, 3), 'iron', M((sx * 0.30, -0.47, 0.83)), smooth=60)
    # corrente na cintura e ossos/crânios pendurados
    chain(mb, [(-0.42, -0.62, 0.78), (-0.50, -0.76, 0.78), (-0.56, -0.90, 0.72)], link=0.075)
    mb.add(prim_sphere(0.10, 0.11, 0.09, 6, 4), 'bone', M((-0.58, -1.02, 0.70), (0, 0, 15)), smooth=60)
    chain(mb, [(0.52, -0.62, 0.76), (0.58, -0.76, 0.72)], link=0.07)
    mb.add(prim_box(0.16, 0.17, 0.14), 'leather', M((0.60, -0.90, 0.68), (0, 0, -8)), bevel=0.03, smooth=30)

    # saiote de pele (barra irregular) e tanga (frente/trás) em cor de time
    kr = []
    for (y, rx, rz, jag) in ((-0.56, 0.72, 0.62, 0.0), (-0.74, 0.80, 0.68, 0.0), (-0.88, 0.82, 0.70, 0.10)):
        ring = ring_h(y, rx, rz, 12, cz=0.06)
        if jag:
            ring = [(x, yy + (jag if i % 2 else -jag * 0.4), z) for i, (x, yy, z) in enumerate(ring)]
        kr.append(ring)
    mb.add(prim_rings(kr, cap0=False, cap1=False), 'fur', smooth=55)
    mb.add(cloth_panel((-0.26, -0.56, 0.90), (0.26, -0.56, 0.90), (-0.22, -1.20, 0.84), (0.22, -1.20, 0.84),
                       nx=4, ny=4, bulge=(0, 0, 0.08), jag=0.07), 'team', smooth=50)
    mb.add(cloth_panel((0.34, -0.56, -0.60), (-0.34, -0.56, -0.60), (0.28, -1.10, -0.62), (-0.28, -1.10, -0.62),
                       nx=4, ny=4, bulge=(0, 0, -0.06), jag=0.07), 'team', smooth=50)
    # capa curta em cor de time nas costas (legível de cima), presa por ossos
    mb.add(cloth_panel((0.44, 0.90, -0.42), (-0.44, 0.90, -0.42), (0.56, 0.05, -0.74), (-0.56, 0.05, -0.74),
                       nx=6, ny=4, thick=0.05, bulge=(0, 0, -0.12), wave=0.08, jag=0.10), 'team', smooth=50)
    for sx in (-1, 1):
        mb.add(prim_cyl(0.045, 0.045, 0.22, 5), 'bone', M((sx * 0.5, 0.92, -0.32), (0, 0, 90)), smooth=50)
    return mb.build(mats, parent=root, location=TORSO_PIVOT)


def build_head(mats, torso):
    """Origem no pescoço; cabeça pequena, crânio baixo, mandíbula enorme (rosto só em +Z)."""
    mb = MeshBuilder('Head')
    # crânio baixo e largo
    rings = [
        ring_h(0.02, 0.28, 0.24, 12, cz=0.06),
        ring_h(0.16, 0.34, 0.30, 12, cz=0.08),
        ring_h(0.30, 0.34, 0.32, 12, cz=0.08),
        ring_h(0.42, 0.28, 0.28, 12, cz=0.05),
        ring_h(0.50, 0.16, 0.16, 12, cz=0.02),
    ]
    mb.add(prim_rings(rings), 'skin', smooth=75)
    # mandíbula inferior enorme e saliente (underbite)
    mb.add(prim_box(0.62, 0.26, 0.46, taper=(0.9, 0.85)), 'skin', M((0, 0.02, 0.24), (-8, 0, 0)),
           bevel=0.07, smooth=45)
    # queixo pesado
    mb.add(prim_box(0.34, 0.14, 0.14), 'skin', M((0, -0.10, 0.46), (-10, 0, 0)), bevel=0.05, smooth=45)
    # boca escura (fenda frontal) + dentes inferiores
    mb.add(prim_box(0.40, 0.05, 0.10), 'mouth', M((0, 0.08, 0.435)))
    for sx in (-1, 1):
        mb.add(prim_box(0.06, 0.07, 0.05), 'bone', M((sx * 0.10, 0.145, 0.47)), bevel=0.01)
        mb.add(prim_box(0.05, 0.05, 0.04), 'bone', M((sx * 0.20, 0.135, 0.44)), bevel=0.01)
        # presas enormes saindo da mandíbula, curvas para cima
        path = [(sx * 0.20, 0.06, 0.43), (sx * 0.24, 0.20, 0.50), (sx * 0.27, 0.36, 0.48)]
        mb.add(prim_rings(limb_rings(path, [0.062, 0.045, 0.008], 6), cap1=False), 'bone', smooth=70)
        # dentes superiores menores
        mb.add(prim_cone(0.03, 0.09, 4), 'bone', M((sx * 0.13, 0.10, 0.42), (180, 0, 0)), smooth=40)
    # sobrancelha dupla pesada, franzida
    for sx in (-1, 1):
        mb.add(prim_box(0.30, 0.09, 0.16, taper=(0.9, 0.7)), 'skin_dark',
               M((sx * 0.15, 0.32, 0.375), (14, 0, sx * 16)), bevel=0.035, smooth=45)
    # olhos pequenos, fundos, brilhando
    for sx in (-1, 1):
        mb.add(prim_sphere(0.065, 0.04, 0.03, 6, 3), 'eye', M((sx * 0.13, 0.255, 0.395), (0, 0, sx * 12)), smooth=80)
    # nariz achatado e largo com narinas
    mb.add(prim_box(0.26, 0.13, 0.11, taper=(0.5, 0.55)), 'skin', M((0, 0.17, 0.43), (-14, 0, 0)), bevel=0.04)
    for sx in (-1, 1):
        mb.add(prim_box(0.05, 0.03, 0.03), 'mouth', M((sx * 0.06, 0.135, 0.49)))
    # bochechas / verrugas
    for sx in (-1, 1):
        mb.add(prim_sphere(0.09, 0.07, 0.07, 6, 3), 'skin', M((sx * 0.28, 0.14, 0.32)), smooth=70)
        mb.add(prim_sphere(0.03, 0.03, 0.03, 5, 3), 'skin_dark', M((sx * 0.30, 0.20, 0.40)), smooth=70)
            # orelhas pontudas largas
    for sx in (-1, 1):
        path = [(sx * 0.32, 0.26, 0.04), (sx * 0.46, 0.32, -0.02), (sx * 0.60, 0.40, -0.10)]
        mb.add(prim_rings(limb_rings(path, [(0.09, 0.03), (0.065, 0.022), (0.006, 0.006)], 5)), 'skin', smooth=60)
    # argola de ferro na orelha esquerda
    mb.add(prim_cyl(0.05, 0.05, 0.02, 8), 'iron', M((-0.50, 0.24, -0.02), (0, 0, 90)), smooth=30)
    # topete: rabo de cabelo preto preso por anel de osso (atrás) + tufos laterais
    mb.add(prim_cyl(0.11, 0.09, 0.08, 8), 'bone', M((0, 0.50, -0.10), (30, 0, 0)), smooth=30)
    path = bezier((0, 0.53, -0.12), (0, 0.72, -0.34), (0, 0.42, -0.52), 4)
    mb.add(prim_rings(limb_rings(path, [0.07, 0.085, 0.08, 0.05, 0.012], 6, up=(1, 0, 0)), cap1=False),
           'hair', smooth=70)
    for sx in (-1, 1):
        mb.add(prim_sphere(0.10, 0.09, 0.14, 6, 3), 'hair', M((sx * 0.30, 0.38, -0.14)), smooth=70)
    # UM chifre marfim na testa (como no procedural), levemente para frente
    path = bezier((0, 0.42, 0.26), (0, 0.62, 0.36), (0, 0.80, 0.30), 4)
    mb.add(prim_rings(limb_rings(path, [0.10, 0.085, 0.06, 0.035, 0.006], 7, up=(1, 0, 0)), cap1=False),
           'bone', smooth=70)
    mb.add(prim_cyl(0.125, 0.125, 0.05, 8), 'rust', M((0, 0.44, 0.27), (30, 0, 0)), smooth=30)
    return mb.build(mats, parent=torso, location=HEAD_PIVOT)


def fist(mb, s, base):
    """Punho enorme (espaço: -y ao longo da mão, +z = nós dos dedos), base = matriz M."""
    mb.add(prim_sphere(0.22, 0.22, 0.24, 8, 4), 'skin', base @ M((0, -0.08, 0.0)), smooth=60)
    for i, fx in enumerate((-0.135, -0.045, 0.045, 0.135)):
        mb.add(prim_box(0.085, 0.16, 0.15, taper=(0.9, 0.8)), 'skin', base @ M((fx, -0.20, 0.13), (28, 0, 0)), smooth=40)
        mb.add(prim_box(0.06, 0.03, 0.02), 'skin_dark', base @ M((fx, -0.27, 0.22)))  # unhas
    mb.add(prim_box(0.10, 0.22, 0.12), 'skin', base @ M((-s * 0.21, -0.10, 0.10), (0, 0, s * 30)),
           smooth=40)


def build_arm(mats, torso, side):
    s = side
    name = 'ArmR' if s > 0 else 'ArmL'
    mb = MeshBuilder(name)
    # deltoide e bíceps
    mb.add(prim_sphere(0.36, 0.34, 0.34, 9, 5), 'skin', M((s * 0.02, -0.02, 0)), smooth=70)
    up = [(s * 0.02, -0.08, 0.0), (s * 0.05, -0.36, 0.02), (s * 0.08, -0.66, -0.01)]
    mb.add(prim_rings(limb_rings(up, [(0.30, 0.28), (0.34, 0.30), (0.24, 0.23)], 8)), 'skin', smooth=70)
    # antebraço robusto em leve flexão para frente
    fa = [(s * 0.08, -0.64, 0.0), (s * 0.08, -0.82, 0.10), (s * 0.06, -1.00, 0.20)]
    mb.add(prim_rings(limb_rings(fa, [0.25, 0.27, 0.19], 8)), 'skin', smooth=70)
    mb.add(prim_sphere(0.26, 0.20, 0.24, 8, 4), 'skin', M((s * 0.08, -0.66, -0.02)), smooth=70)  # cotovelo
    # braçadeira de ferro enferrujado com rebites e espigões
    br = [(s * 0.075, -0.80, 0.09), (s * 0.06, -1.02, 0.21)]
    mb.add(prim_rings(limb_rings(br, [0.29, 0.22], 8)), 'rust', bevel=0.012, smooth=30)
    for k in range(3):
        a = math.radians(-50 + k * 50)
        spike(mb, (s * (0.075 + 0.25 * math.cos(a) * 0.9), -0.88 - k * 0.0, 0.13 + 0.25 * math.sin(a) * 0.9),
              (s * 0.9 * math.cos(a), 0.15, math.sin(a) * 0.9), 0.05, 0.16, 'iron')
    # punho
    fist(mb, s, M((s * 0.06, -1.02, 0.22), (-14, 0, 0)))
    # cicatrizes no braço
    mb.add(prim_box(0.05, 0.24, 0.03), 'scar', M((s * 0.28, -0.44, 0.10), (0, 0, s * -8)), bevel=0.006)
    # ombreira dupla de ferro tosca com espigões e rebites
    mb.add(prim_sphere(0.46, 0.30, 0.44, 10, 4, y_min=0.0), 'iron', M((s * 0.10, 0.06, 0.0), (0, 0, -s * 22)), smooth=40)
    mb.add(prim_sphere(0.40, 0.20, 0.38, 10, 3, y_min=0.0), 'rust', M((s * 0.26, -0.15, 0.0), (0, 0, -s * 50)), smooth=40)
    mb.add(prim_cyl(0.47, 0.455, 0.06, 12), 'leather', M((s * 0.10, 0.03, 0.0), (0, 0, -s * 22)), smooth=30)
    for (dz, h, dx) in ((-0.20, 0.42, 0.14), (0.05, 0.36, 0.20), (0.24, 0.30, 0.12)):
        spike(mb, (s * dx, 0.20, dz), (s * 0.5, 1.0, dz * 0.4), 0.085, h, 'bone', n=6)
    for k in range(5):
        a = math.radians(-70 + k * 35)
        mb.add(prim_sphere(0.05, 0.04, 0.05, 5, 3), 'rust',
               M((s * (0.10 + 0.40 * math.cos(a)), 0.02 - 0.05 * abs(math.sin(a)), 0.44 * math.sin(a))), smooth=60)
    if s < 0:
        # corrente quebrada presa ao punho (algema)
        mb.add(prim_cyl(0.20, 0.20, 0.05, 10), 'iron', M((s * 0.06, -0.92, 0.19), (-14, 0, 0)), smooth=30)
    else:
        # faixa de tecido (cor de time) no bíceps
        mb.add(prim_rings(limb_rings([(s * 0.05, -0.34, 0.02), (s * 0.055, -0.46, 0.02)], [(0.365, 0.335), (0.36, 0.33)], 8),
                          cap0=False, cap1=False), 'team', smooth=40)
    if s < 0:
        mb.add(prim_rings(limb_rings([(s * 0.05, -0.34, 0.02), (s * 0.055, -0.46, 0.02)], [(0.365, 0.335), (0.36, 0.33)], 8),
                          cap0=False, cap1=False), 'team', smooth=40)
    return mb.build(mats, parent=torso, location=(s * ARM_PIVOT[0], ARM_PIVOT[1], ARM_PIVOT[2]))


# Clava modelada "em pé" (cabo em +y) e girada por CLUB_PRE (~60°) dentro do nó Weapon
CLUB_PRE = M(r=(0, 0, -22)) @ M(r=(54, 0, 0)) @ M(r=(0, -10, 0), s=0.86)


def build_club(mats, arm_r):
    mb = MeshBuilder('Weapon')
    P = CLUB_PRE
    # cabo grosso com empunhadura de couro enrolada e pomo de osso
    mb.add(prim_cyl(0.10, 0.09, 0.95, 8, base=False), 'wood', P @ M((0, 0.12, 0)), smooth=50)
    mb.add(prim_cyl(0.125, 0.125, 0.46, 8, base=False), 'leather', P @ M((0, 0.0, 0)), smooth=45)
    for y in (-0.16, -0.05, 0.06, 0.17):
        mb.add(prim_cyl(0.132, 0.132, 0.03, 8, base=False), 'hide', P @ M((0, y, 0)), smooth=30)
    mb.add(prim_sphere(0.17, 0.15, 0.17, 8, 4), 'bone', P @ M((0, -0.36, 0)), smooth=60)
    mb.add(prim_cyl(0.16, 0.16, 0.06, 8), 'iron', P @ M((0, -0.26, 0)), smooth=30)
    # cabeça: tronco cônico de madeira (afinado na base, bojudo no topo, calota arredondada)
    head_rings = [ring_h(0.55, 0.14, 0.14, 10), ring_h(0.80, 0.20, 0.20, 10), ring_h(1.10, 0.31, 0.31, 10),
                  ring_h(1.40, 0.40, 0.40, 10), ring_h(1.66, 0.42, 0.42, 10), ring_h(1.86, 0.36, 0.36, 10),
                  ring_h(1.98, 0.21, 0.21, 10)]
    mb.add(prim_rings(head_rings, cap0=True, cap1=True), 'wood', P, smooth=60)
    # rachaduras/nós salientes
    for (y, ang) in ((1.0, 20), (1.45, 200), (1.7, 110)):
        r = 0.28 + (y - 1.0) * 0.12
        ca, sa = math.cos(math.radians(ang)), math.sin(math.radians(ang))
        mb.add(prim_sphere(0.10, 0.08, 0.07, 6, 3), 'skin_dark', P @ M((ca * r, y, sa * r)), smooth=60)
    # cintas de ferro (aros) — três faixas com rebites
    for (y, r) in ((0.92, 0.245), (1.26, 0.35), (1.72, 0.415)):
        mb.add(prim_cyl(r, r, 0.10, 10, base=False), 'rust', P @ M((0, y, 0)), smooth=30, bevel=0.01)
    # espigões de ferro em grade (carreiras de espinhos radiais)
    rows = ((1.16, 0.33, 5, 0.0), (1.48, 0.41, 6, 25), (1.74, 0.42, 6, 0))
    for (y, r, cnt, off) in rows:
        for i in range(cnt):
            a = math.radians(off + 360 * i / cnt)
            ca, sa = math.cos(a), math.sin(a)
            # cone orientado radialmente
            import mathutils
            d = mathutils.Vector((ca, 0.25, sa)).normalized()
            q = mathutils.Vector((0, 1, 0)).rotation_difference(d).to_euler('XYZ')
            mb.add(prim_cone(0.065, 0.28 if y > 1.4 else 0.22, 4), 'iron',
                   P @ M((ca * (r - 0.03), y, sa * (r - 0.03)),
                         (math.degrees(q.x), math.degrees(q.y), math.degrees(q.z))), smooth=60)
    # espigão central no topo e placa de ferro na face de impacto (+Z local)
    mb.add(prim_cone(0.11, 0.36, 5), 'iron', P @ M((0, 1.94, 0)), smooth=60)
    mb.add(prim_box(0.26, 0.36, 0.06), 'iron', P @ M((0, 1.45, 0.40), (0, 0, 0)), bevel=0.02)
    # trapo em cor de time amarrado sob a cabeça (identificação de time em cima da clava)
    mb.add(prim_rings([ring_h(0.60, 0.185, 0.185, 10), ring_h(0.68, 0.175, 0.175, 10)], cap0=False, cap1=False),
           'team', P, smooth=30)
    mb.add(cloth_panel((-0.12, 0.64, 0.17), (0.12, 0.64, 0.17), (-0.16, 0.10, 0.24), (0.14, 0.10, 0.24),
                       nx=3, ny=3, thick=0.03, bulge=(0, 0, 0.05), wave=0.03, jag=0.05), 'team', P, smooth=50)
    w = mb.build(mats, parent=arm_r, location=WEAPON_PIVOT)
    C.set_rot_game(w, (WEAPON_REST_X, 0, 0))
    return w


def build_leg(mats, root, side):
    s = side
    name = 'LegR' if s > 0 else 'LegL'
    mb = MeshBuilder(name)
    th = [(s * 0.0, 0.10, 0.0), (s * 0.02, -0.20, 0.03), (s * 0.05, -0.52, 0.04)]
    mb.add(prim_rings(limb_rings(th, [(0.34, 0.32), (0.34, 0.32), (0.26, 0.25)], 8)), 'skin', smooth=70)
    # calça de pele rasgada (metade superior) e joelheira de couro/ferro
    mb.add(prim_rings([ring_h(0.08, 0.36, 0.34, 12, cx=0.0), ring_h(-0.20, 0.365, 0.345, 12, cx=s * 0.02),
                       ring_h(-0.40, 0.33, 0.31, 12, cx=s * 0.04)], cap0=False, cap1=False), 'hide', smooth=55)
    mb.add(prim_sphere(0.24, 0.20, 0.16, 8, 4, y_min=0.0), 'rust', M((s * 0.05, -0.57, 0.20), (90, 0, 0)), smooth=40)
    for k in (-1, 0, 1):
        spike(mb, (s * 0.05 + k * 0.09, -0.57, 0.34), (k * 0.35, 0.1, 1.0), 0.04, 0.12, 'iron', n=5)
    sh = [(s * 0.05, -0.54, 0.05), (s * 0.06, -0.76, 0.03), (s * 0.07, -0.94, 0.02)]
    mb.add(prim_rings(limb_rings(sh, [0.24, 0.245, 0.20], 8)), 'skin', smooth=70)
    # faixas de couro enroladas na canela
    for y in (-0.72, -0.82, -0.92):
        mb.add(prim_cyl(0.255, 0.258, 0.06, 12), 'leather', M((s * 0.065, y, 0.03)), smooth=40)
    # pé enorme: bota de couro aberta com dedos à mostra, sola de ferro
    mb.add(prim_box(0.46, 0.20, 0.66, taper=(0.9, 0.7), base=True), 'leather', M((s * 0.08, -1.05, 0.14)),
           bevel=0.05, smooth=35)
    for fx in (-0.15, -0.05, 0.05, 0.15):
        mb.add(prim_box(0.095, 0.11, 0.12, base=True), 'skin', M((s * 0.08 + fx, -1.05, 0.52), (-6, 0, 0)),
               smooth=40)
        mb.add(prim_cone(0.03, 0.06, 4), 'bone', M((s * 0.08 + fx, -1.00, 0.61), (90, 0, 0)), smooth=30)
    mb.add(prim_box(0.44, 0.06, 0.60, base=True), 'iron', M((s * 0.08, -1.05, 0.10)), bevel=0.02)
    mb.add(prim_box(0.38, 0.14, 0.10, base=True), 'rust', M((s * 0.08, -0.90, 0.32), (-12, 0, 0)), bevel=0.02)
    return mb.build(mats, parent=root, location=(s * LEG_PIVOT[0], LEG_PIVOT[1], LEG_PIVOT[2]))


def main():
    args = C.script_args()
    C.reset_scene()
    mats = C.make_paint_set(PALETTE)
    root = C.make_empty('Ogre')
    torso = build_torso(mats, root)
    head = build_head(mats, torso)
    arm_l = build_arm(mats, torso, -1)
    arm_r = build_arm(mats, torso, 1)
    club = build_club(mats, arm_r)
    leg_l = build_leg(mats, root, -1)
    leg_r = build_leg(mats, root, 1)
    parts = [torso, head, arm_l, arm_r, club, leg_l, leg_r]
    import bpy
    bpy.context.view_layer.update()

    C.uv_atlas(parts, weights={'Head': 1.6, 'Torso': 1.0, 'Weapon': 1.0, 'ArmL': 0.9, 'ArmR': 0.9,
                               'LegL': 0.75, 'LegR': 0.75}, margin=0.008)
    img = C.bake_atlas(parts, 'ogre_atlas', 512, samples=int(os.environ.get('BAKE_SAMPLES', 32)), margin=4)
    C.finalize_materials(parts, img, team_default=TEAM_DEFAULT,
                         out_png=os.path.join(C.BUILD_DIR, 'ogre_atlas.png'))
    out = os.path.join(C.OUT_MODELS, 'ogre.glb')
    C.export_glb(root, out)
    st = C.stats(root, out)
    print('STATS ogre', st)
    if '--no-render' not in args:
        rig = C.RenderRig(root, 'ogre', res=int(os.environ.get('RENDER_RES', 800)), samples=24)
        rig.render('34', (1.0, 0.95, 1.0), 30)
        rig.render('front', (0.0, 0.25, 1.0), 30)
        rig.render('back', (-0.6, 0.6, -1.0), 30)
        rig.render('side', (1.0, 0.2, 0.0), 30)
        if os.environ.get('FACE'):
            c0 = rig.center.copy()
            rig.center.z = 2.6
            rig.render('face', (0.35, 0.3, 1.0), 30, zoom=0.28)
            rig.center = c0
        rig.render('game', (45, 44, 45), 24, dist=78 / 1.62)
        C.set_team_color('#2f63e0')
        rig.render('34_azul', (1.0, 0.95, 1.0), 30)
        C.set_team_color(TEAM_DEFAULT)


main()
