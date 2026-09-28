"""
build_grunt.py — guerreiro orc (tipo interno `grunt`) gerado 100% por script.

Uso:
  blender -b --factory-startup --python tools/blender/build_grunt.py -- [--no-render]

Hierarquia (nomes usados pelo UnitAnimator / ModelFactory.rebindUserData):
  Grunt (raiz)
  ├─ Torso            pivô no quadril
  │  ├─ Head          pivô no pescoço
  │  ├─ ArmL / ArmR   pivô no ombro (braço em repouso: rotação 0)
  │  │   └─ Weapon    (em ArmR) pivô na empunhadura, rotação x = -45°
  ├─ LegL / LegR      pivô no quadril
Cada parte é UM objeto; o Torso tem 2 materiais (Atlas + TeamColor).
"""
import os
import sys
import math

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C  # noqa: E402
from common import (MeshBuilder, M, prim_box, prim_rings, ring_h, prim_cyl, prim_cone,  # noqa: E402
                    prim_sphere, prim_extrude, limb_rings, bezier)

# Pivôs (coordenadas do jogo)
TORSO_PIVOT = (0.0, 1.0, 0.0)
HEAD_PIVOT = (0.0, 0.98, 0.16)      # relativo ao Torso
ARM_PIVOT_X = 0.76
ARM_PIVOT_Y = 0.80                  # relativo ao Torso
LEG_PIVOT = (0.27, 0.92, 0.0)
TEAM_DEFAULT = '#d23a2c'           # vermelho padrão (multiplica a área cinza)
WEAPON_REST_X = -45.0               # o UnitAnimator assume ~-0.78 rad em repouso

PALETTE = {
    'skin': dict(base='#5f9a35', var='#4a7d2a', var_scale=4.0, var_amt=0.6, fine=0.06,
                 grad=(0.0, 2.6, 0.30), top=0.22, edge='#9ccc5c', edge_amt=0.35, edge_r=0.03,
                 ao=(0.28, 0.65), coord='world'),
    'skin_dark': dict(base='#3e6d24', var='#345c1e', var_scale=4.0, fine=0.05, grad=(0.0, 2.6, 0.2),
                      top=0.15, ao=(0.25, 0.6)),
    'leather': dict(base='#6e4424', var='#56331a', var_scale=6.0, fine=0.12, top=0.2,
                    edge='#a47245', edge_amt=0.55, edge_r=0.02, ao=(0.25, 0.6)),
    'pants': dict(base='#4b3527', var='#3a281d', var_scale=5.0, fine=0.10, top=0.15,
                  edge='#6f5040', edge_amt=0.3, edge_r=0.02, ao=(0.25, 0.6), grad=(0.0, 1.2, 0.25)),
    'iron': dict(base='#3d434f', var='#2d323b', var_scale=7.0, var_amt=0.8, fine=0.14, top=0.35,
                 edge='#c3cad6', edge_amt=0.95, edge_r=0.022, edge_gain=12.0, ao=(0.25, 0.55)),
    'blade': dict(base='#6d7686', var='#586170', var_scale=6.0, fine=0.1, top=0.4,
                  edge='#f2f6fc', edge_amt=1.0, edge_r=0.03, edge_gain=14.0, ao=(0.2, 0.45)),
    'steel': dict(base='#8c96a6', var='#6f7888', var_scale=9.0, fine=0.1, top=0.3,
                  edge='#eef3fa', edge_amt=1.0, edge_r=0.02, ao=(0.2, 0.4)),
    'bone': dict(base='#e6d8ae', var='#c9b584', var_scale=5.0, fine=0.08, top=0.15,
                 edge='#fff6dc', edge_amt=0.4, edge_r=0.02, ao=(0.2, 0.55), grad=(1.6, 2.9, 0.25)),
    'fur': dict(base='#6a5139', var='#43321f', var_scale=9.0, var_amt=1.0, fine=0.25, fine_scale=40.0,
                streaks=(3.0, 40.0, 0.25), top=0.25, edge='#a98c66', edge_amt=0.5, edge_r=0.03,
                ao=(0.25, 0.6), coord='object'),
    'wood': dict(base='#6d4a2a', var='#553820', var_scale=5.0, fine=0.1, coord='object',
                 streaks=(40.0, 2.0, 0.22), edge='#9a7048', edge_amt=0.4, edge_r=0.015, ao=(0.2, 0.5)),
    'eye': dict(base='#ffd23a', var='#ff9b1a', var_scale=20.0, emit_boost=1.4),
    'mouth': dict(base='#2a1512', var='#1a0d0b'),
    'team': dict(base='#b8b0a4', var='#9d9589', var_scale=5.0, fine=0.08, top=0.25,
                 edge='#d8d2c8', edge_amt=0.3, edge_r=0.03, ao=(0.3, 0.65), team=True),
}


def mirror_x(pts):
    return [(-x, y, z) for (x, y, z) in pts]


def cloth_panel(top_l, top_r, bot_l, bot_r, nx=5, ny=4, thick=0.035, bulge=(0, 0, 0),
                wave=0.03, jag=0.05):
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
    # bordas
    def idx(i, j):
        return j * (nx + 1) + i
    border = [idx(i, 0) for i in range(nx + 1)] + [idx(nx, j) for j in range(1, ny + 1)] + \
             [idx(i, ny) for i in range(nx - 1, -1, -1)] + [idx(0, j) for j in range(ny - 1, 0, -1)]
    for k in range(len(border)):
        a, c = border[k], border[(k + 1) % len(border)]
        faces.append((a, c, n + c, n + a))
    return verts, faces


def build_torso(mats, root):
    mb = MeshBuilder('Torso')
    # corpo (loft) — pélvis de couro, tronco de pele
    rings = [
        ring_h(-0.24, 0.40, 0.30, 12, cz=0.00),
        ring_h(-0.02, 0.44, 0.33, 12, cz=0.02),
        ring_h(0.14, 0.46, 0.36, 12, cz=0.05),
        ring_h(0.36, 0.50, 0.39, 12, cz=0.08),
        ring_h(0.58, 0.60, 0.42, 12, cz=0.07),
        ring_h(0.76, 0.68, 0.41, 12, cz=0.01),
        ring_h(0.90, 0.62, 0.35, 12, cz=-0.04),
        ring_h(0.99, 0.38, 0.26, 12, cz=0.00),
        ring_h(1.05, 0.20, 0.18, 12, cz=0.10),
    ]
    mb.add(prim_rings(rings), 'skin', smooth=70,
           mat_fn=lambda c, n: 'pants' if c[1] < 0.1 else None)
    # peitorais e abdômen
    for sx in (-1, 1):
        mb.add(prim_sphere(0.25, 0.16, 0.13, 8, 4), 'skin', M((sx * 0.21, 0.63, 0.37), (8, sx * 12, sx * -8)), smooth=70)
    mb.add(prim_sphere(0.24, 0.2, 0.12, 8, 4), 'skin', M((0, 0.34, 0.39)), smooth=70)
    # cinto largo + fivela de ferro com caveira
    mb.add(prim_rings([ring_h(0.02, 0.50, 0.40, 14, cz=0.05), ring_h(0.24, 0.52, 0.42, 14, cz=0.06)]),
           'leather', smooth=40)
    mb.add(prim_box(0.34, 0.26, 0.08), 'iron', M((0, 0.13, 0.49)), bevel=0.03)
    mb.add(prim_sphere(0.085, 0.09, 0.07, 6, 4), 'bone', M((0, 0.14, 0.54)), smooth=60)
    for sx in (-1, 1):
        mb.add(prim_box(0.06, 0.06, 0.05), 'mouth', M((sx * 0.035, 0.155, 0.6)))
    # correia diagonal (ombro esquerdo -> quadril direito) com rebites
    ctr = (0.0, 0.55, 0.03)
    ux, uy = 0.74, -0.67  # eixo inclinado no plano XY
    loop = []
    N = 12
    for k in range(N):
        t = 2 * math.pi * k / N
        R1, R2 = 0.80, (0.50 if math.sin(t) > 0 else 0.40)
        cx = ctr[0] + ux * R1 * math.cos(t)
        cy = ctr[1] + uy * R1 * math.cos(t)
        cz = ctr[2] + R2 * math.sin(t)
        # direção radial no plano e normal do plano
        rx, ry, rz = ux * math.cos(t), uy * math.cos(t), math.sin(t)
        cz_ = cz
        nx_, ny_ = -uy, ux
        w, th = 0.065, 0.035
        loop.append([
            (cx + nx_ * w + rx * th, cy + ny_ * w + ry * th, cz + rz * th),
            (cx - nx_ * w + rx * th, cy - ny_ * w + ry * th, cz + rz * th),
            (cx - nx_ * w - rx * th, cy - ny_ * w - ry * th, cz - rz * th),
            (cx + nx_ * w - rx * th, cy + ny_ * w - ry * th, cz - rz * th),
        ])
    loop.append(loop[0])
    mb.add(prim_rings(loop, cap0=False, cap1=False), 'leather', smooth=50)
    for t in (1.2, 1.6, 2.0):
        cx = ctr[0] + ux * 0.80 * math.cos(t)
        cy = ctr[1] + uy * 0.80 * math.cos(t)
        cz = ctr[2] + 0.50 * math.sin(t) + 0.04
        mb.add(prim_box(0.07, 0.07, 0.05), 'iron', M((cx, cy, cz)), bevel=0.015)
    # saiote de pele (pelo) com barra irregular
    kr = []
    for (y, r, jag) in ((0.06, 0.50, 0.0), (-0.16, 0.54, 0.0), (-0.36, 0.58, 0.08)):
        ring = ring_h(y, r, r * 0.8, 14, cz=0.03)
        if jag:
            ring = [(x, yy + (jag if i % 2 else -jag * 0.3), z) for i, (x, yy, z) in enumerate(ring)]
        kr.append(ring)
    mb.add(prim_rings(kr, cap0=False, cap1=False), 'fur', smooth=55)
    # tanga (frente e trás) — cor de time
    mb.add(cloth_panel((-0.19, 0.06, 0.5), (0.19, 0.06, 0.5), (-0.15, -0.5, 0.52), (0.15, -0.5, 0.52),
                       nx=4, ny=3, bulge=(0, 0, 0.05), jag=0.05), 'team', smooth=50)
    mb.add(cloth_panel((0.2, 0.06, -0.39), (-0.2, 0.06, -0.39), (0.17, -0.46, -0.44), (-0.17, -0.46, -0.44),
                       nx=4, ny=3, bulge=(0, 0, -0.04), jag=0.05), 'team', smooth=50)
    # capa curta nas costas — cor de time (legível de cima)
    mb.add(cloth_panel((0.48, 0.95, -0.36), (-0.48, 0.95, -0.36), (0.58, 0.16, -0.62), (-0.58, 0.16, -0.62),
                       nx=6, ny=3, thick=0.04, bulge=(0, 0, -0.08), wave=0.06, jag=0.08), 'team', smooth=50)
    # gola de pelo sobre os ombros (prende a capa)
    gr = [ring_h(0.86, 0.50, 0.34, 12, cz=-0.05), ring_h(0.98, 0.44, 0.30, 12, cz=-0.03),
          ring_h(1.03, 0.30, 0.22, 12, cz=0.02)]
    mb.add(prim_rings(gr, cap0=False, cap1=False), 'fur', smooth=60)
    return mb.build(mats, parent=root, location=TORSO_PIVOT)


def build_head(mats, torso):
    mb = MeshBuilder('Head')
    # crânio + face superior (até o lábio de cima)
    rings = [
        ring_h(0.05, 0.27, 0.22, 12, cz=0.12),
        ring_h(0.17, 0.29, 0.26, 12, cz=0.08),
        ring_h(0.28, 0.27, 0.26, 12, cz=0.05),
        ring_h(0.38, 0.22, 0.23, 12, cz=0.02),
        ring_h(0.46, 0.12, 0.13, 12, cz=0.0),
    ]
    mb.add(prim_rings(rings), 'skin', smooth=75)
    # mandíbula inferior saliente (underbite) — o traço mais "orc" do rosto
    mb.add(prim_box(0.50, 0.20, 0.36, taper=(0.92, 0.85)), 'skin', M((0, -0.02, 0.2), (-10, 0, 0)),
           bevel=0.06, bevel_segments=2, smooth=45)
    mb.add(prim_box(0.3, 0.06, 0.08), 'mouth', M((0, 0.075, 0.33)))
    # dentes inferiores + presas grandes saindo da mandíbula
    for sx in (-1, 1):
        mb.add(prim_box(0.05, 0.05, 0.04), 'bone', M((sx * 0.06, 0.09, 0.36)), bevel=0.01)
        path = [(sx * 0.15, 0.04, 0.33), (sx * 0.18, 0.18, 0.40), (sx * 0.23, 0.30, 0.38)]
        mb.add(prim_rings(limb_rings(path, [0.058, 0.04, 0.008], 6), cap1=False), 'bone', smooth=70)
    # sobrancelhas franzidas em V (ponta interna baixa)
    for sx in (-1, 1):
        mb.add(prim_box(0.27, 0.09, 0.16, taper=(0.9, 0.7)), 'skin_dark',
               M((sx * 0.125, 0.27, 0.28), (14, 0, sx * 20)), bevel=0.03)
    # olhos em fenda, brilhando
    for sx in (-1, 1):
        mb.add(prim_sphere(0.06, 0.024, 0.03, 6, 3), 'eye', M((sx * 0.11, 0.215, 0.315), (0, 0, sx * 18)), smooth=80)
    # nariz achatado e largo
    mb.add(prim_box(0.21, 0.1, 0.09, taper=(0.45, 0.5)), 'skin', M((0, 0.14, 0.345), (-15, 0, 0)), bevel=0.03)
    for sx in (-1, 1):
        mb.add(prim_box(0.04, 0.03, 0.03), 'mouth', M((sx * 0.05, 0.105, 0.39)))
    # orelhas pontudas
    for sx in (-1, 1):
        path = [(sx * 0.25, 0.22, 0.04), (sx * 0.36, 0.26, -0.02), (sx * 0.47, 0.31, -0.1)]
        mb.add(prim_rings(limb_rings(path, [(0.08, 0.03), (0.055, 0.02), (0.006, 0.006)], 5)), 'skin', smooth=60)
    # elmo de ferro (calota + aba + protetor nasal + crista)
    mb.add(prim_sphere(0.31, 0.28, 0.315, 12, 4, y_min=0.0), 'iron', M((0, 0.3, 0.03)), smooth=50)
    mb.add(prim_cyl(0.33, 0.325, 0.07, 12), 'iron', M((0, 0.27, 0.03), s=(1, 1, 1.02)), smooth=40)
    mb.add(prim_box(0.075, 0.2, 0.06), 'iron', M((0, 0.29, 0.345), (8, 0, 0)), bevel=0.018)
    mb.add(prim_box(0.06, 0.09, 0.5, taper=(0.4, 0.8)), 'iron', M((0, 0.56, 0.02)), bevel=0.015)
    # chifres curvos de osso (silhueta)
    for sx in (-1, 1):
        path = bezier((sx * 0.27, 0.41, 0.02), (sx * 0.66, 0.43, -0.02), (sx * 0.62, 0.85, 0.14), 5)
        radii = [0.095, 0.083, 0.066, 0.046, 0.026, 0.006]
        mb.add(prim_rings(limb_rings(path, radii, 7), cap1=False), 'bone', smooth=70)
        rp = limb_rings(bezier((sx * 0.3, 0.41, 0.02), (sx * 0.36, 0.415, 0.02), (sx * 0.42, 0.42, 0.015), 1),
                        [0.11, 0.11], 8)
        mb.add(prim_rings(rp), 'iron', smooth=40)
    return mb.build(mats, parent=torso, location=HEAD_PIVOT)


WRIST = (0.13, -0.95, 0.2)   # lado direito; o esquerdo espelha x
HAND_ROT = (-24, 0, 0)


def hand(mb, s):
    """Punho fechado arredondado com dedos sugeridos (espaço da mão: -y ao
    longo da mão, +z = nós dos dedos)."""
    base = M((s * WRIST[0], WRIST[1], WRIST[2]), HAND_ROT)
    mb.add(prim_sphere(0.13, 0.13, 0.14, 7, 4), 'skin', base @ M((0, -0.1, 0.0)), smooth=60)
    for i, fx in enumerate((-0.07, 0.0, 0.07)):
        mb.add(prim_box(0.066, 0.1, 0.1), 'skin', base @ M((fx, -0.15 + abs(fx) * 0.25, 0.1), (20, 0, 0)),
               bevel=0.018, smooth=40)
    mb.add(prim_box(0.06, 0.13, 0.07), 'skin', base @ M((-s * 0.12, -0.1, 0.07), (0, 0, s * 25)),
           bevel=0.02, smooth=40)


def build_arm(mats, torso, side):
    """side = +1 (direito, ArmR) ou -1 (esquerdo, ArmL)."""
    s = side
    name = 'ArmR' if s > 0 else 'ArmL'
    mb = MeshBuilder(name)
    mb.add(prim_sphere(0.24, 0.23, 0.23, 8, 4), 'skin', M((s * 0.02, -0.02, 0)), smooth=70)
    up = [(s * 0.03, -0.06, 0.0), (s * 0.05, -0.30, 0.01), (s * 0.06, -0.55, -0.02)]
    mb.add(prim_rings(limb_rings(up, [(0.2, 0.19), (0.22, 0.2), (0.155, 0.15)], 8)), 'skin', smooth=70)
    # antebraço afunilado: grosso perto do cotovelo, fino no pulso
    ex, ey, ez = s * 0.06, -0.55, -0.02
    wx, wy, wz = s * WRIST[0], WRIST[1], WRIST[2]
    fa = [(ex + (wx - ex) * t, ey + (wy - ey) * t, ez + (wz - ez) * t) for t in (0.0, 0.3, 0.7, 1.0)]
    mb.add(prim_rings(limb_rings(fa, [0.15, 0.185, 0.15, 0.11], 8)), 'skin', smooth=70)
    br = [fa[1], fa[3]]
    br = [(ex + (wx - ex) * t, ey + (wy - ey) * t, ez + (wz - ez) * t) for t in (0.42, 0.95)]
    mb.add(prim_rings(limb_rings(br, [0.2, 0.15], 8)), 'iron', bevel=0.012, smooth=30)
    mb.add(prim_cone(0.05, 0.2, 5), 'steel', M((s * 0.29, -0.78, 0.1), (0, 0, -s * 90)))
    hand(mb, s)
    # ombreira dupla de ferro com espinhos de osso
    mb.add(prim_sphere(0.33, 0.24, 0.34, 10, 3, y_min=0.0), 'iron', M((s * 0.07, 0.04, 0.0), (0, 0, -s * 22)),
           smooth=40)
    mb.add(prim_sphere(0.28, 0.16, 0.31, 10, 2, y_min=0.0), 'iron', M((s * 0.2, -0.14, 0.0), (0, 0, -s * 48)),
           smooth=40)
    mb.add(prim_cyl(0.345, 0.335, 0.05, 10), 'leather', M((s * 0.07, 0.02, 0.0), (0, 0, -s * 22)), smooth=30)
    for (dz, h) in ((-0.13, 0.36), (0.1, 0.30)):
        mb.add(prim_cone(0.075, h, 6), 'bone', M((s * 0.16, 0.18, dz), (0, 0, -s * 38)), smooth=60)
    return mb.build(mats, parent=torso, location=(s * ARM_PIVOT_X, ARM_PIVOT_Y, 0.0))


# O machado é modelado "em pé" (cabo em +y) e girado por AXE_PRE dentro do nó
# Weapon, para que em repouso (Weapon.rotation.x = -45°) ele fique quase
# vertical e à frente do corpo; as rotações do UnitAnimator somam a isso.
AXE_PRE = M(r=(62, 0, 0)) @ M(r=(0, -15, 0))


def build_weapon(mats, arm_r):
    mb = MeshBuilder('Weapon')
    P = AXE_PRE
    mb.add(prim_cyl(0.052, 0.045, 1.95, 8, base=False), 'wood', P @ M((0, 0.5, 0)), smooth=50)
    mb.add(prim_cyl(0.064, 0.064, 0.34, 8, base=False), 'leather', P @ M((0, 0.0, 0)), smooth=50)
    for y in (-0.3, 0.3, 0.95):
        mb.add(prim_cyl(0.068, 0.068, 0.05, 8, base=False), 'iron', P @ M((0, y, 0)))
    mb.add(prim_cone(0.08, 0.22, 6), 'steel', P @ M((0, -0.47, 0), (180, 0, 0)))
    head_y = 1.3
    mb.add(prim_box(0.15, 0.40, 0.17), 'iron', P @ M((0, head_y, 0)), bevel=0.025)
    mb.add(prim_cone(0.07, 0.36, 6), 'steel', P @ M((0, head_y + 0.19, 0)))
    # contrapeso: esporão curvo para trás
    mb.add(prim_rings(limb_rings([(0, head_y + 0.05, -0.07), (0, head_y + 0.02, -0.25), (0, head_y - 0.1, -0.42)],
                                 [(0.05, 0.09), (0.035, 0.06), (0.004, 0.004)], 5), cap1=False), 'steel', P, smooth=0)
    blade = [(0.07, 0.15), (0.24, 0.22), (0.42, 0.44), (0.60, 0.46), (0.74, 0.24), (0.78, -0.02),
             (0.73, -0.28), (0.60, -0.50), (0.40, -0.42), (0.23, -0.18), (0.07, -0.13)]
    for sz, k in ((1, 1.12),):
        poly = [(sz * z * k, y * k) for (z, y) in blade]
        if sz < 0:
            poly = list(reversed(poly))
        verts, faces = prim_extrude(poly, 0.08, axis='x')
        verts = [(x * (0.22 if abs(z) > 0.56 * k else 1.0), y, z) for (x, y, z) in verts]
        mb.add((verts, faces), 'blade', P @ M((0, head_y, 0)), bevel=0.014)
    # gume de aço claro (faixa externa)
    for sz, k in ((1, 1.12),):
        edge = [(0.6, 0.46), (0.74, 0.24), (0.78, -0.02), (0.73, -0.28), (0.60, -0.50),
                (0.54, -0.40), (0.64, -0.24), (0.68, -0.02), (0.65, 0.2), (0.54, 0.36)]
        poly = [(sz * z * k, y * k) for (z, y) in edge]
        if sz < 0:
            poly = list(reversed(poly))
        verts, faces = prim_extrude(poly, 0.03, axis='x')
        mb.add((verts, faces), 'steel', P @ M((0, head_y, 0)) @ M(s=(1.0, 1.0, 1.0)))
    w = mb.build(mats, parent=arm_r, location=(WRIST[0], WRIST[1] - 0.1, WRIST[2] + 0.02))
    C.set_rot_game(w, (WEAPON_REST_X, 0, 0))
    return w


def build_leg(mats, root, side):
    s = side
    name = 'LegR' if s > 0 else 'LegL'
    mb = MeshBuilder(name)
    th = [(s * 0.01, 0.02, 0.0), (s * 0.03, -0.22, 0.02), (s * 0.05, -0.44, 0.03)]
    mb.add(prim_rings(limb_rings(th, [(0.21, 0.2), (0.215, 0.21), (0.165, 0.16)], 8)), 'pants', smooth=70)
    mb.add(prim_sphere(0.14, 0.13, 0.09, 8, 3, y_min=0.0), 'iron', M((s * 0.05, -0.46, 0.13), (90, 0, 0)), smooth=40)
    sh = [(s * 0.05, -0.47, 0.03), (s * 0.06, -0.64, 0.0), (s * 0.07, -0.78, -0.01)]
    mb.add(prim_rings(limb_rings(sh, [0.15, 0.17, 0.15], 8)), 'skin', smooth=70)
    for y in (-0.56, -0.66):
        mb.add(prim_cyl(0.17, 0.172, 0.045, 10), 'leather', M((s * 0.06, y, 0.0)), smooth=40)
    mb.add(prim_box(0.3, 0.2, 0.44, taper=(0.85, 0.7), base=True), 'leather', M((s * 0.07, -0.92, 0.06)),
           bevel=0.04, smooth=35)
    mb.add(prim_box(0.27, 0.11, 0.12, base=True), 'iron', M((s * 0.07, -0.92, 0.26)), bevel=0.03)
    fr = [ring_h(-0.8, 0.19, 0.19, 10, cx=s * 0.07), ring_h(-0.7, 0.2, 0.2, 10, cx=s * 0.07),
          ring_h(-0.64, 0.17, 0.17, 10, cx=s * 0.07)]
    mb.add(prim_rings(fr), 'fur', smooth=60)
    return mb.build(mats, parent=root, location=(s * LEG_PIVOT[0], LEG_PIVOT[1], LEG_PIVOT[2]))


def main():
    args = C.script_args()
    C.reset_scene()
    mats = C.make_paint_set(PALETTE)
    root = C.make_empty('Grunt')
    torso = build_torso(mats, root)
    head = build_head(mats, torso)
    arm_l = build_arm(mats, torso, -1)
    arm_r = build_arm(mats, torso, 1)
    weapon = build_weapon(mats, arm_r)
    leg_l = build_leg(mats, root, -1)
    leg_r = build_leg(mats, root, 1)
    parts = [torso, head, arm_l, arm_r, weapon, leg_l, leg_r]
    import bpy
    bpy.context.view_layer.update()

    C.uv_atlas(parts, weights={'Head': 1.55, 'Torso': 1.05, 'Weapon': 1.0, 'LegL': 0.8, 'LegR': 0.8},
               margin=0.008)
    img = C.bake_atlas(parts, 'grunt_atlas', 512, samples=int(os.environ.get('BAKE_SAMPLES', 32)), margin=4)
    C.finalize_materials(parts, img, team_default=TEAM_DEFAULT,
                         out_png=os.path.join(C.BUILD_DIR, 'grunt_atlas.png'))
    out = os.path.join(C.OUT_MODELS, 'grunt.glb')
    C.export_glb(root, out)
    st = C.stats(root, out)
    print('STATS grunt', st)
    if '--no-render' not in args:
        rig = C.RenderRig(root, 'grunt', res=int(os.environ.get('RENDER_RES', 800)), samples=24)
        rig.render('34', (1.0, 0.95, 1.0), 30)          # 3/4 parecido com a câmera RTS
        rig.render('front', (0.0, 0.25, 1.0), 30)
        rig.render('back', (-0.6, 0.6, -1.0), 30)
        # escala de jogo: câmera do SceneManager (offset 45,44,45; fov 32) e unidade x1.62
        rig.render('game', (45, 44, 45), 24, dist=78 / 1.62)
        C.set_team_color('#2f63e0')
        rig.render('34_azul', (1.0, 0.95, 1.0), 30)
        C.set_team_color(TEAM_DEFAULT)


main()
