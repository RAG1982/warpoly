"""
build_bandit.py — Bandido neutro (tipo interno `bandit`) gerado 100% por script.

Uso:
  blender -b --factory-startup --python tools/blender/build_bandit.py -- [--no-render]

Hierarquia PLANA (igual ao BanditModel.js procedural — o UnitAnimator anima Weapon/Arm* com
rotações independentes e posições absolutas na raiz; não aninhe as peças):
  Bandit (raiz)
  ├─ Torso   pivô (0, 1.05, 0)  (colete de couro remendado, camisa, cinto com facas e bolsa)
  ├─ Head    pivô (0, 1.62, 0)  (capuz, bandana e rosto hostil só na face +Z)
  ├─ ArmL / ArmR  pivô (∓0.38, 1.25, 0)  (luvas sem dedos)
  ├─ LegL / LegR  pivô (∓0.16, 0.68, 0)
  └─ Weapon  pivô (0.48, 0.75, 0.25), repouso rot x 0.5 rad (porrete com pregos, 'gume' em +Z)
O bandido é neutro: o material TeamColor guarda só o trapo/bandana (vermelho-sujo por padrão).
"""
import os
import sys
import math

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C  # noqa: E402
from common import (MeshBuilder, M, prim_box, prim_rings, ring_h, prim_cyl, prim_cone,  # noqa: E402
                    prim_sphere, prim_extrude, limb_rings, bezier)

TORSO_PIVOT = (0.0, 1.05, 0.0)
HEAD_PIVOT = (0.0, 1.62, 0.0)
ARM_PIVOT = (0.38, 1.25, 0.0)
LEG_PIVOT = (0.16, 0.68, 0.0)
WEAPON_PIVOT = (0.48, 0.75, 0.25)
WEAPON_REST_DEG = (math.degrees(0.5), 0.0, -10.0)
TEAM_DEFAULT = '#8a3a2c'   # vermelho-sujo (neutro)

PALETTE = {
    'skin': dict(base='#c99b76', var='#a97a58', var_scale=6.0, var_amt=0.6, fine=0.06, top=0.2,
                 edge='#e8bf9a', edge_amt=0.3, edge_r=0.02, ao=(0.2, 0.55)),
    'stubble': dict(base='#7d5d47', var='#5f4432', var_scale=25.0, fine=0.2, top=0.15, ao=(0.2, 0.5)),
    'linen': dict(base='#93896a', var='#6d6549', var_scale=7.0, var_amt=0.9, fine=0.12, top=0.22,
                  edge='#c9c1a2', edge_amt=0.35, edge_r=0.02, ao=(0.25, 0.6), grad=(0.0, 1.9, 0.25)),
    'vest': dict(base='#5d3b22', var='#432816', var_scale=6.0, var_amt=1.0, fine=0.16, top=0.2,
                 edge='#a0724a', edge_amt=0.6, edge_r=0.015, ao=(0.22, 0.6), grad=(0.0, 1.9, 0.2)),
    'leather': dict(base='#7a4c28', var='#583319', var_scale=6.0, fine=0.12, top=0.2,
                    edge='#b98552', edge_amt=0.55, edge_r=0.015, ao=(0.22, 0.55)),
    'dark': dict(base='#33261c', var='#241a12', var_scale=6.0, fine=0.12, top=0.18,
                 edge='#6a5038', edge_amt=0.5, edge_r=0.015, ao=(0.22, 0.55)),
    'patch': dict(base='#6d6a3c', var='#565430', var_scale=8.0, fine=0.12, top=0.2,
                  edge='#9c9860', edge_amt=0.5, edge_r=0.012, ao=(0.2, 0.5)),
    'cloak': dict(base='#56613c', var='#39432a', var_scale=6.0, var_amt=0.9, fine=0.15, top=0.25,
                  edge='#7a6d58', edge_amt=0.4, edge_r=0.02, ao=(0.25, 0.6), grad=(0.0, 2.0, 0.2)),
    'pants': dict(base='#514032', var='#3b2e23', var_scale=5.0, fine=0.12, top=0.15,
                  edge='#7a6350', edge_amt=0.3, edge_r=0.015, ao=(0.25, 0.6), grad=(0.0, 1.0, 0.3)),
    'steel': dict(base='#a4adba', var='#7f8998', var_scale=8.0, fine=0.1, top=0.35,
                  edge='#f4f8ff', edge_amt=1.0, edge_r=0.015, edge_gain=14.0, ao=(0.2, 0.45)),
    'iron': dict(base='#4c515c', var='#343841', var_scale=7.0, var_amt=0.8, fine=0.15, top=0.3,
                 edge='#c3cad6', edge_amt=0.9, edge_r=0.015, edge_gain=12.0, ao=(0.22, 0.5)),
    'rust': dict(base='#6d4a36', var='#3b2c25', var_scale=9.0, var_amt=1.0, fine=0.2, top=0.3,
                 edge='#b58a62', edge_amt=0.7, edge_r=0.015, ao=(0.22, 0.55)),
    'wood': dict(base='#6a4a2e', var='#4a3220', var_scale=5.0, var_amt=1.0, fine=0.12, coord='object',
                 streaks=(40.0, 2.0, 0.3), edge='#a67d52', edge_amt=0.45, edge_r=0.012, ao=(0.22, 0.5)),
    'bone': dict(base='#e0d3a8', var='#bba876', var_scale=5.0, fine=0.08, top=0.15,
                 edge='#fff6dc', edge_amt=0.4, edge_r=0.015, ao=(0.2, 0.55)),
    'eye': dict(base='#e9e0c0', var='#c9bd90', var_scale=20.0, emit_boost=1.1),
    'pupil': dict(base='#1a1410', var='#100c09'),
    'mouth': dict(base='#4a231d', var='#2a1310'),
    'brow': dict(base='#2c2019', var='#1a120d'),
    'team': dict(base='#b8b0a4', var='#9d9589', var_scale=5.0, fine=0.1, top=0.25,
                 edge='#d8d2c8', edge_amt=0.3, edge_r=0.02, ao=(0.3, 0.65), team=True),
}


def cloth_panel(top_l, top_r, bot_l, bot_r, nx=4, ny=3, thick=0.02, bulge=(0, 0, 0),
                wave=0.02, jag=0.03):
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


def arc_ring(cy, rx, rz, a0, a1, n, cx=0.0, cz=0.0):
    """Anel parcial (arco de a0 a a1 graus; 90° = frente +Z) na altura cy."""
    pts = []
    for i in range(n):
        a = math.radians(a0 + (a1 - a0) * i / (n - 1))
        pts.append((cx + math.cos(a) * rx, cy, cz + math.sin(a) * rz))
    return pts


def dagger(mb, m):
    """Faca em bainha (lâmina para baixo em -y, cabo em +y). m = matriz do jogo."""
    mb.add(prim_box(0.05, 0.22, 0.03, taper=(0.5, 1.0)), 'leather', m @ M((0, -0.13, 0)), bevel=0.005)   # bainha
    mb.add(prim_box(0.04, 0.05, 0.03), 'iron', m @ M((0, -0.03, 0)), bevel=0.004)                       # boquilha
    mb.add(prim_cyl(0.017, 0.017, 0.10, 6), 'dark', m @ M((0, 0.0, 0)), smooth=40)                       # cabo
    mb.add(prim_box(0.085, 0.02, 0.03), 'steel', m @ M((0, -0.005, 0)), bevel=0.004)                     # guarda
    mb.add(prim_sphere(0.022, 0.022, 0.022, 5, 3), 'bone', m @ M((0, 0.11, 0)), smooth=60)


def build_torso(mats, root):
    mb = MeshBuilder('Torso')
    # camisa suja (linho) — corpo magro
    shirt = [ring_h(-0.30, 0.205, 0.15, 12), ring_h(-0.12, 0.20, 0.145, 12), ring_h(0.06, 0.235, 0.16, 12),
             ring_h(0.24, 0.285, 0.18, 12), ring_h(0.38, 0.27, 0.165, 12), ring_h(0.46, 0.17, 0.13, 12)]
    mb.add(prim_rings(shirt), 'linen', smooth=70)
    # colete de couro remendado (barra irregular), aberto em V na frente
    vest_rings = []
    for (y, rx, rz, jag) in ((-0.20, 0.225, 0.168, 0.05), (-0.04, 0.245, 0.178, 0.0), (0.14, 0.29, 0.20, 0.0),
                             (0.30, 0.305, 0.19, 0.0)):
        ring = ring_h(y, rx, rz, 12)
        if jag:
            ring = [(x, yy + (jag if i % 2 else -jag), z) for i, (x, yy, z) in enumerate(ring)]
        vest_rings.append(ring)
    mb.add(prim_rings(vest_rings, cap0=False, cap1=False), 'vest', smooth=60)
    # gola/capuz caído sobre os ombros (cobre a gola da camisa)
    cowl = [ring_h(0.20, 0.31, 0.215, 12), ring_h(0.33, 0.30, 0.205, 12, cz=-0.005), ring_h(0.43, 0.20, 0.155, 12),
            ring_h(0.48, 0.15, 0.125, 12)]
    mb.add(prim_rings(cowl, cap0=False, cap1=False), 'cloak', smooth=60)
    # abertura em V: cunha de camisa por cima e cordão de couro cruzado
    tri = [(-0.10, 0.37), (0.10, 0.37), (0.0, 0.08)]
    mb.add(prim_extrude(tri, 0.03, axis='z'), 'linen', M((0, 0, 0.192), (-4, 0, 0)))
    for k, (y, w) in enumerate(((0.28, 0.07), (0.20, 0.052), (0.13, 0.034))):
        mb.add(prim_box(w * 2.0, 0.012, 0.012), 'dark', M((0, y, 0.213), (0, 0, 14 if k % 2 else -14)))
    # gola do colete e ombros
    for sx in (-1, 1):
        mb.add(prim_box(0.14, 0.06, 0.24), 'vest', M((sx * 0.22, 0.375, -0.005), (0, 0, sx * -12)), bevel=0.012, smooth=30)
    # remendos costurados (quadrados de tecido) com pontos
    for (px, py, pz, ang, w, h, mat) in ((0.13, 0.15, 0.198, 4, 0.11, 0.10, 'patch'), (-0.15, 0.02, 0.19, -6, 0.10, 0.12, 'linen'),
                                         (0.16, -0.08, 0.176, 8, 0.09, 0.08, 'patch')):
        mb.add(prim_box(w, h, 0.012), mat, M((px, py, pz), (0, 0, ang)), bevel=0.003)
        for sx2 in (-1, 1):
            mb.add(prim_box(0.008, h + 0.012, 0.006), 'dark', M((px + sx2 * w * 0.5, py, pz + 0.005), (0, 0, ang)))
    # cinto largo com fivela suja + tira de couro
    mb.add(prim_rings([ring_h(-0.25, 0.235, 0.172, 12), ring_h(-0.14, 0.24, 0.176, 12)]), 'leather', smooth=40)
    mb.add(prim_box(0.085, 0.10, 0.03), 'iron', M((0, -0.195, 0.18)), bevel=0.01)
    mb.add(prim_box(0.05, 0.065, 0.03), 'rust', M((0, -0.195, 0.196)), bevel=0.006)
    # facas nas bainhas (esquerda: uma na horizontal cruzada atrás; frente: duas em ângulos diferentes)
    dagger(mb, M((-0.17, -0.20, 0.17), (12, 0, 8)))
    dagger(mb, M((0.09, -0.20, 0.195), (-4, 0, -14)))
    dagger(mb, M((-0.13, -0.20, -0.17), (0, 0, 90)))
    # bolsa de couro remendada na cintura direita
    mb.add(prim_box(0.15, 0.15, 0.10), 'leather', M((0.25, -0.30, 0.06), (0, 0, -5)), bevel=0.02, smooth=30)
    mb.add(prim_box(0.16, 0.06, 0.11), 'vest', M((0.25, -0.23, 0.06), (0, 0, -5)), bevel=0.012)
    mb.add(prim_sphere(0.022, 0.022, 0.016, 5, 3), 'iron', M((0.25, -0.24, 0.115)), smooth=60)
    mb.add(prim_box(0.05, 0.06, 0.012), 'patch', M((0.22, -0.32, 0.112), (0, 0, 8)), bevel=0.003)
    # saco pequeno pendurado nas costas + corda
    mb.add(prim_box(0.17, 0.15, 0.09), 'linen', M((-0.05, -0.30, -0.19), (8, 0, 0)), bevel=0.02, smooth=30)
    mb.add(prim_cyl(0.018, 0.018, 0.10, 5), 'dark', M((-0.05, -0.20, -0.19), (0, 0, 90)), smooth=40)
    # trapos do cinto (barra rasgada em cor de time, identifica o "grupo" do bandoleiro)
    mb.add(cloth_panel((0.02, -0.22, 0.19), (0.19, -0.22, 0.19), (0.0, -0.58, 0.20), (0.20, -0.56, 0.20),
                       nx=3, ny=3, bulge=(0, 0, 0.02), jag=0.03), 'team', smooth=50)
    mb.add(cloth_panel((0.18, -0.22, -0.15), (-0.16, -0.22, -0.15), (0.16, -0.60, -0.19), (-0.14, -0.62, -0.19),
                       nx=4, ny=3, bulge=(0, 0, -0.02), jag=0.03), 'dark', smooth=50)
    # bandoleira (faixa em cor de time) do ombro esquerdo ao quadril direito, com bolsinhas
    ctr = (0.0, 0.14, 0.0)
    ux, uy = 0.70, -0.71
    loop = []
    N = 12
    for k in range(N):
        t = 2 * math.pi * k / N
        R1, R2 = 0.33, (0.19 if math.sin(t) > 0 else 0.15)
        cx = ctr[0] + ux * R1 * math.cos(t)
        cy = ctr[1] + uy * R1 * math.cos(t)
        cz = ctr[2] + R2 * math.sin(t)
        rx, ry, rz = ux * math.cos(t), uy * math.cos(t), math.sin(t)
        nx_, ny_ = -uy, ux
        w, th = 0.035, 0.012
        loop.append([
            (cx + nx_ * w + rx * th, cy + ny_ * w + ry * th, cz + rz * th),
            (cx - nx_ * w + rx * th, cy - ny_ * w + ry * th, cz + rz * th),
            (cx - nx_ * w - rx * th, cy - ny_ * w - ry * th, cz - rz * th),
            (cx + nx_ * w - rx * th, cy + ny_ * w - ry * th, cz - rz * th),
        ])
    loop.append(loop[0])
    mb.add(prim_rings(loop, cap0=False, cap1=False), 'dark', smooth=50)
    return mb.build(mats, parent=root, location=TORSO_PIVOT)


def build_head(mats, root):
    """Origem no centro da cabeça (pescoço em -y); traços só na face frontal +Z."""
    mb = MeshBuilder('Head')
    mb.add(prim_cyl(0.075, 0.09, 0.14, 8), 'skin', M((0, -0.26, 0.0)), smooth=60)                  # pescoço
    # crânio e mandíbula angulosa, magra
    mb.add(prim_sphere(0.135, 0.16, 0.15, 10, 6), 'skin', M((0, 0.0, 0.0)), smooth=75)
    mb.add(prim_box(0.15, 0.10, 0.15, taper=(0.75, 0.85)), 'skin', M((0, -0.115, 0.045), (8, 0, 0)), bevel=0.02, smooth=40)
    # barba por fazer no queixo/bochechas (só frente)
    mb.add(prim_box(0.14, 0.085, 0.03), 'stubble', M((0, -0.125, 0.115), (8, 0, 0)), bevel=0.01, smooth=30)
    for sx in (-1, 1):
        mb.add(prim_box(0.03, 0.09, 0.05), 'stubble', M((sx * 0.078, -0.09, 0.09), (0, sx * -10, 0)), bevel=0.006)
    # nariz torto e grande (quebrado)
    mb.add(prim_box(0.036, 0.085, 0.05, taper=(0.6, 0.8)), 'skin', M((0.004, -0.02, 0.145), (-14, 0, 6)), bevel=0.008)
    # sobrancelhas franzidas em V + olhos apertados, hostis
    for sx in (-1, 1):
        mb.add(prim_box(0.085, 0.024, 0.03), 'brow', M((sx * 0.055, 0.052, 0.143), (0, 0, sx * 22)), bevel=0.005)
        mb.add(prim_box(0.06, 0.028, 0.02), 'eye', M((sx * 0.055, 0.02, 0.146)), bevel=0.004)
        mb.add(prim_sphere(0.014, 0.014, 0.008, 5, 3), 'pupil', M((sx * 0.052, 0.02, 0.159)), smooth=80)
        mb.add(prim_box(0.07, 0.014, 0.024), 'skin', M((sx * 0.055, 0.037, 0.147), (0, 0, sx * 12)), bevel=0.003)   # pálpebra caída
    # cicatriz vertical no olho esquerdo (só frente)
    mb.add(prim_box(0.014, 0.12, 0.012), 'mouth', M((-0.075, 0.0, 0.148), (0, 0, -12)), bevel=0.002)
    # boca torta com dentes à mostra
    mb.add(prim_box(0.085, 0.022, 0.018), 'mouth', M((0.006, -0.088, 0.146), (0, 0, 6)), bevel=0.003)
    for k, dx in enumerate((-0.028, 0.0, 0.028)):
        mb.add(prim_box(0.018, 0.016, 0.012), 'bone', M((0.006 + dx, -0.081, 0.153)), bevel=0.002)
    # orelhas
    for sx in (-1, 1):
        mb.add(prim_box(0.02, 0.07, 0.05, taper=(1.0, 0.7)), 'skin', M((sx * 0.138, -0.01, -0.005), (0, 0, sx * -8)), bevel=0.006)
    # capuz: casca aberta na frente (arcos de anel), com aba, ponta caída atrás e bainhas rasgadas
    hood = []
    for (y, rx, rz, cz, a0, a1) in ((-0.10, 0.19, 0.19, -0.045, 122, 418), (0.03, 0.215, 0.225, -0.05, 132, 408),
                                    (0.14, 0.205, 0.225, -0.05, 130, 410), (0.22, 0.15, 0.17, -0.065, 122, 418),
                                    (0.27, 0.07, 0.08, -0.10, 110, 430)):
        hood.append(arc_ring(y, rx, rz, a0, a1, 12, cz=cz))
    mb.add(prim_rings(hood, cap0=False, cap1=False, closed=False), 'cloak', smooth=65)
    # bico do capuz caído para trás e aba de frente (sombreia os olhos)
    path = bezier((0, 0.26, -0.11), (0, 0.32, -0.26), (0, 0.16, -0.35), 3)
    mb.add(prim_rings(limb_rings(path, [0.06, 0.055, 0.035, 0.008], 6, up=(1, 0, 0)), cap1=False), 'cloak', smooth=70)
    mb.add(prim_box(0.22, 0.035, 0.07, taper=(0.9, 0.5)), 'cloak', M((0, 0.15, 0.17), (-14, 0, 0)), bevel=0.008, smooth=30)
    # bandana/lenço no pescoço puxado para baixo (cor de time) + nó
    mb.add(prim_rings([ring_h(-0.22, 0.125, 0.115, 10), ring_h(-0.16, 0.14, 0.13, 10), ring_h(-0.12, 0.12, 0.12, 10)],
                      cap0=False, cap1=False), 'team', smooth=50)
    mb.add(prim_box(0.10, 0.09, 0.04, taper=(0.6, 1.0)), 'team', M((0.03, -0.19, 0.13), (-8, 0, 0)), bevel=0.008)
    mb.add(prim_cone(0.03, 0.10, 4), 'team', M((0.06, -0.26, 0.125), (180, 0, 12)), smooth=30)
    # bandana na testa sob o capuz (faixa em cor de time)
    mb.add(prim_rings([ring_h(0.075, 0.148, 0.163, 12), ring_h(0.115, 0.146, 0.161, 12)], cap0=False, cap1=False),
           'team', smooth=50)
    return mb.build(mats, parent=root, location=HEAD_PIVOT)


def glove_hand(mb, s, base):
    """Mão com luva sem dedos (espaço da mão: -y ao longo da mão, +z = nós dos dedos)."""
    mb.add(prim_box(0.085, 0.10, 0.09, taper=(0.9, 0.9)), 'dark', base @ M((0, -0.045, 0.0)), bevel=0.01, smooth=35)
    mb.add(prim_box(0.088, 0.02, 0.095), 'leather', base @ M((0, -0.005, 0.0)), bevel=0.004)  # punho da luva
    for fx in (-0.031, -0.01, 0.011, 0.032):
        mb.add(prim_box(0.02, 0.055, 0.032, taper=(0.9, 0.9)), 'skin', base @ M((fx, -0.115, 0.03), (25, 0, 0)), smooth=30)
    mb.add(prim_box(0.028, 0.07, 0.03), 'skin', base @ M((-s * 0.055, -0.06, 0.03), (0, 0, s * 26)), smooth=30)


def build_arm(mats, root, side):
    s = side
    mb = MeshBuilder('ArmR' if s > 0 else 'ArmL')
    # ombro: manga de camisa com ombro arredondado
    mb.add(prim_sphere(0.085, 0.085, 0.085, 8, 4), 'linen', M((s * 0.0, 0.02, 0.0)), smooth=70)
    up = [(s * 0.0, 0.0, 0.0), (s * 0.02, -0.16, 0.01), (s * 0.03, -0.31, 0.015)]
    mb.add(prim_rings(limb_rings(up, [0.075, 0.075, 0.068], 8)), 'linen', smooth=70)
    # remendo na manga e barra dobrada
    mb.add(prim_rings(limb_rings([(s * 0.03, -0.28, 0.015), (s * 0.033, -0.325, 0.017)], [0.076, 0.076], 8),
                      cap0=False, cap1=False), 'dark', smooth=30)
    mb.add(prim_box(0.06, 0.07, 0.014), 'patch', M((s * 0.02, -0.14, 0.078), (0, 0, s * 6)), bevel=0.003)
    if s > 0:
        # braço da clava: antebraço dobrado para a frente até o cabo
        fa = [(s * 0.03, -0.31, 0.015), (s * 0.05, -0.42, 0.10), (s * 0.06, -0.50, 0.19)]
        mb.add(prim_rings(limb_rings(fa, [0.058, 0.055, 0.045], 8)), 'skin', smooth=70)
        mb.add(prim_rings(limb_rings([(s * 0.052, -0.43, 0.105), (s * 0.06, -0.50, 0.19)], [0.062, 0.05], 8),
                          cap0=True, cap1=True), 'leather', smooth=30)
        glove_hand(mb, s, M((s * 0.06, -0.50, 0.19), (-60, 0, 0)))
    else:
        fa = [(s * 0.03, -0.31, 0.015), (s * 0.04, -0.44, 0.03), (s * 0.05, -0.57, 0.05)]
        mb.add(prim_rings(limb_rings(fa, [0.058, 0.055, 0.045], 8)), 'skin', smooth=70)
        mb.add(prim_rings(limb_rings([(s * 0.04, -0.46, 0.035), (s * 0.05, -0.57, 0.05)], [0.062, 0.05], 8)),
               'leather', smooth=30)
        glove_hand(mb, s, M((s * 0.05, -0.575, 0.05), (-8, 0, 0)))
    # trapo amarrado no braço (cor de time)
    mb.add(prim_rings(limb_rings([(s * 0.02, -0.17, 0.012), (s * 0.023, -0.215, 0.013)], [0.082, 0.082], 8),
                      cap0=False, cap1=False), 'team', smooth=30)
    return mb.build(mats, parent=root, location=(s * ARM_PIVOT[0], ARM_PIVOT[1], ARM_PIVOT[2]))


def build_leg(mats, root, side):
    s = side
    mb = MeshBuilder('LegR' if s > 0 else 'LegL')
    th = [(0.0, -0.02, 0.0), (s * 0.005, -0.18, 0.01), (s * 0.01, -0.34, 0.01)]
    mb.add(prim_rings(limb_rings(th, [(0.095, 0.10), (0.098, 0.102), (0.075, 0.08)], 8)), 'pants', smooth=70)
    # remendo no joelho e na coxa
    mb.add(prim_box(0.085, 0.09, 0.014), 'patch', M((s * 0.01, -0.29, 0.088), (0, 0, s * 6)), bevel=0.003)
    mb.add(prim_box(0.07, 0.08, 0.014), 'linen', M((s * -0.01, -0.10, 0.098), (0, 0, s * -8)), bevel=0.003)
    sh = [(s * 0.01, -0.36, 0.015), (s * 0.014, -0.46, 0.01), (s * 0.017, -0.56, 0.0)]
    mb.add(prim_rings(limb_rings(sh, [0.075, 0.078, 0.068], 8)), 'pants', smooth=70)
    # bota gasta: cano com cuff dobrado, sola e biqueira
    boot = [(s * 0.016, -0.50, 0.0), (s * 0.02, -0.62, 0.005), (s * 0.02, -0.68, 0.015)]
    mb.add(prim_rings(limb_rings(boot, [0.09, 0.083, 0.078], 8)), 'leather', smooth=40)
    mb.add(prim_rings(limb_rings([(s * 0.016, -0.49, 0.0), (s * 0.017, -0.535, 0.0)], [0.10, 0.10], 8),
                      cap0=True, cap1=True), 'dark', smooth=25)
    mb.add(prim_box(0.15, 0.09, 0.27, taper=(0.85, 0.7), base=True), 'leather', M((s * 0.02, -0.68, 0.05)),
           bevel=0.012, smooth=35)
    mb.add(prim_box(0.15, 0.03, 0.29, base=True), 'dark', M((s * 0.02, -0.68, 0.05)), bevel=0.006)
    mb.add(prim_box(0.10, 0.03, 0.05), 'rust', M((s * 0.02, -0.62, 0.16)), bevel=0.006)   # remendo da ponta
    # fivelas/cintas da bota
    for y in (-0.58, -0.64):
        mb.add(prim_rings(limb_rings([(s * 0.02, y, 0.004), (s * 0.02, y - 0.02, 0.004)], [0.086, 0.086], 8),
                          cap0=False, cap1=False), 'dark', smooth=25)
    return mb.build(mats, parent=root, location=(s * LEG_PIVOT[0], LEG_PIVOT[1], LEG_PIVOT[2]))


def build_weapon(mats, root):
    """Porrete: cabo em y≈0 (mão), cabeça grossa em +Y com pregos; 'gume'(fileira de pregos) em +Z."""
    mb = MeshBuilder('Weapon')
    mb.add(prim_cyl(0.034, 0.038, 0.62, 7, base=False), 'wood', M((0, 0.12, 0)), smooth=50)
    mb.add(prim_cyl(0.042, 0.042, 0.24, 7, base=False), 'dark', M((0, 0.0, 0)), smooth=45)   # empunhadura
    for y in (-0.08, -0.03, 0.02, 0.07):
        mb.add(prim_cyl(0.045, 0.045, 0.014, 7, base=False), 'leather', M((0, y, 0)), smooth=30)
    mb.add(prim_cyl(0.05, 0.05, 0.03, 7, base=False), 'iron', M((0, -0.13, 0)), smooth=30)
    mb.add(prim_sphere(0.05, 0.04, 0.05, 6, 3), 'wood', M((0, -0.155, 0)), smooth=60)
    # cabeça de tronco cônico, irregular
    hr = [ring_h(0.28, 0.04, 0.04, 8), ring_h(0.42, 0.075, 0.075, 8), ring_h(0.58, 0.115, 0.115, 8),
          ring_h(0.72, 0.125, 0.125, 8), ring_h(0.82, 0.10, 0.10, 8), ring_h(0.87, 0.05, 0.05, 8)]
    mb.add(prim_rings(hr), 'wood', smooth=60)
    # cinta de ferro enferrujada e corda enrolada
    mb.add(prim_cyl(0.13, 0.13, 0.04, 8, base=False), 'rust', M((0, 0.66, 0)), smooth=30)
    mb.add(prim_cyl(0.083, 0.083, 0.03, 8, base=False), 'rust', M((0, 0.45, 0)), smooth=30)
    for y in (0.30, 0.335, 0.37):
        mb.add(prim_cyl(0.056, 0.056, 0.018, 7, base=False), 'linen', M((0, y, 0)), smooth=30)
    # pregos radiais (mais numerosos na face +Z)
    import mathutils
    for (y, r, cnt, off, ln) in ((0.52, 0.10, 4, 45, 0.11), (0.62, 0.118, 5, 20, 0.13), (0.74, 0.122, 5, 55, 0.13)):
        for i in range(cnt):
            a = math.radians(off + 360 * i / cnt)
            ca, sa = math.cos(a), math.sin(a)
            d = mathutils.Vector((ca, 0.3, sa)).normalized()
            q = mathutils.Vector((0, 1, 0)).rotation_difference(d).to_euler('XYZ')
            mb.add(prim_cone(0.021, ln, 4), 'iron',
                   M((ca * (r - 0.012), y, sa * (r - 0.012)), (math.degrees(q.x), math.degrees(q.y), math.degrees(q.z))),
                   smooth=50)
    mb.add(prim_cone(0.03, 0.14, 4), 'iron', M((0, 0.86, 0)), smooth=50)
    # fileira de pregos grandes na face de impacto (+Z)
    for (y, ln) in ((0.55, 0.13), (0.65, 0.15), (0.75, 0.14)):
        mb.add(prim_cone(0.026, ln, 4), 'iron', M((0, y, 0.115), (90, 0, 0)), smooth=50)
    # tira de tecido (cor de time) pendurada abaixo da cabeça
    mb.add(cloth_panel((-0.03, 0.30, 0.055), (0.03, 0.30, 0.055), (-0.04, 0.10, 0.075), (0.04, 0.10, 0.075),
                       nx=2, ny=3, thick=0.012, wave=0.015, jag=0.02), 'team', smooth=50)
    w = mb.build(mats, parent=root, location=WEAPON_PIVOT)
    C.set_rot_game(w, WEAPON_REST_DEG)
    return w


def main():
    args = C.script_args()
    C.reset_scene()
    mats = C.make_paint_set(PALETTE)
    root = C.make_empty('Bandit')
    torso = build_torso(mats, root)
    head = build_head(mats, root)
    arm_l = build_arm(mats, root, -1)
    arm_r = build_arm(mats, root, 1)
    leg_l = build_leg(mats, root, -1)
    leg_r = build_leg(mats, root, 1)
    weapon = build_weapon(mats, root)
    parts = [torso, head, arm_l, arm_r, leg_l, leg_r, weapon]
    import bpy
    bpy.context.view_layer.update()

    C.uv_atlas(parts, weights={'Head': 1.6, 'Torso': 1.2, 'Weapon': 0.9, 'LegL': 0.85, 'LegR': 0.85,
                               'ArmL': 0.9, 'ArmR': 0.9}, margin=0.008)
    img = C.bake_atlas(parts, 'bandit_atlas', 512, samples=int(os.environ.get('BAKE_SAMPLES', 32)), margin=4)
    C.finalize_materials(parts, img, team_default=TEAM_DEFAULT,
                         out_png=os.path.join(C.BUILD_DIR, 'bandit_atlas.png'))
    out = os.path.join(C.OUT_MODELS, 'bandit.glb')
    C.export_glb(root, out)
    st = C.stats(root, out)
    print('STATS bandit', st)
    if '--no-render' not in args:
        rig = C.RenderRig(root, 'bandit', res=int(os.environ.get('RENDER_RES', 800)), samples=24)
        rig.render('34', (1.0, 0.95, 1.0), 30)
        rig.render('front', (0.0, 0.25, 1.0), 30)
        rig.render('back', (-0.6, 0.6, -1.0), 30)
        rig.render('side', (1.0, 0.2, 0.0), 30)
        if os.environ.get('FACE'):
            c0 = rig.center.copy()
            rig.center.z = 1.62
            rig.render('face', (0.35, 0.3, 1.0), 30, zoom=0.3)
            rig.center = c0
        rig.render('game', (45, 44, 45), 24, dist=78 / 1.62)


main()
