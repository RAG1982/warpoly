"""
build_sapper.py — Sapador de Pólvora humano (tipo interno `sapper`) gerado 100% por script.

Uso:
  blender -b --factory-startup --python tools/blender/build_sapper.py -- [--no-render]

Hierarquia PLANA + Fuse (igual a SapperModel.js procedural; `applySapperRun` inclina o Torso, balança
braços/pernas e o pavio `Fuse` pisca por escala):
  Sapper (raiz)
  ├─ Torso   pivô (0, 1.05, 0)   colete de time, bandoleira de bombas, barril de pólvora nas costas
  │  └─ Fuse pivô na boca do barril: cordão + faísca (pisca)
  ├─ Head    pivô (0, 1.60, 0)   quepe de couro, óculos na testa, careta fanática; rosto só em +Z
  ├─ ArmL / ArmR  pivô (∓0.48, 1.26, 0)   luvas grossas
  └─ LegL / LegR  pivô (∓0.17, 0.66, 0)
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

TORSO_PIVOT = (0.0, 1.05, 0.0)
HEAD_PIVOT = (0.0, 1.60, 0.0)
ARM_PIVOT = (0.50, 1.26, 0.0)
LEG_PIVOT = (0.18, 0.66, 0.0)
BARREL_C = (0.0, 0.06, -0.47)       # centro do barril (espaço do Torso)
FUSE_POS = (0.0, 0.42, -0.47)       # boca do barril
TEAM_DEFAULT = '#2f5bd0'

PALETTE = {
    'team': dict(base='#b8b0a4', var='#9d9589', var_scale=5.0, fine=0.08, top=0.25,
                 edge='#d8d2c8', edge_amt=0.3, edge_r=0.03, ao=(0.3, 0.65), team=True),
    'linen': dict(base='#d6c9a8', var='#a8977a', var_scale=3.5, var_amt=0.8, fine=0.12, top=0.3, ao=(0.3, 0.6),
                  edge='#efe6cc', edge_amt=0.3, edge_r=0.025),
    'leather': dict(base='#6b4024', var='#452612', var_scale=6.0, fine=0.14, top=0.25,
                    edge='#b07a48', edge_amt=0.55, edge_r=0.02, ao=(0.25, 0.65)),
    'leather_dark': dict(base='#3d2414', var='#26140a', var_scale=6.0, fine=0.12, top=0.2,
                         edge='#7a5232', edge_amt=0.5, edge_r=0.02, ao=(0.25, 0.65)),
    'glove': dict(base='#4a2f1c', var='#2f1c0e', var_scale=8.0, fine=0.14, top=0.25,
                  edge='#9a6c40', edge_amt=0.5, edge_r=0.015, ao=(0.2, 0.6)),
    'pants': dict(base='#4a3a2c', var='#2e231a', var_scale=4.0, var_amt=0.9, fine=0.12, top=0.2, ao=(0.3, 0.6),
                  grad=(0.0, 1.2, 0.3)),
    'skin': dict(base='#e2ad84', var='#c58861', var_scale=5.0, var_amt=0.6, fine=0.06, top=0.28,
                 edge='#f2cba6', edge_amt=0.3, edge_r=0.02, ao=(0.25, 0.6)),
    'soot': dict(base='#5a4638', var='#3a2c22', var_scale=8.0, var_amt=0.9, fine=0.1, top=0.2),
    'hair': dict(base='#2d1c10', var='#1a0e07', var_scale=14.0, fine=0.18, fine_scale=40.0, top=0.3),
    'teeth': dict(base='#f2ecd8', var='#d8cfae', var_scale=10.0, top=0.3),
    'eye_w': dict(base='#f6f4ea', var='#e2dccb', var_scale=10.0, top=0.3),
    'pupil': dict(base='#07090d', var='#07090d'),
    'mouth': dict(base='#2a0f0c', var='#1a0807'),
    'wood': dict(base='#7a4d27', var='#573418', var_scale=2.0, fine=0.1, pattern='planks_v', mapping='box',
                 pw=3.0, ph=0.1, mortar='#2c1a0c', mortar_size=0.02,
                 edge='#b88a54', edge_amt=0.45, edge_r=0.02, top=0.25, ao=(0.3, 0.65)),
    'iron': dict(base='#3d424d', var='#2a2e36', var_scale=7.0, var_amt=0.8, fine=0.14, top=0.35,
                 edge='#bcc4d2', edge_amt=0.9, edge_r=0.02, edge_gain=12.0, ao=(0.25, 0.55)),
    'brass': dict(base='#d0a040', var='#9a6e1e', var_scale=9.0, var_amt=0.7, fine=0.06, top=0.4,
                  edge='#ffeaa0', edge_amt=1.0, edge_r=0.016, edge_gain=12.0, ao=(0.2, 0.5)),
    'lens': dict(base='#ffcb5c', var='#ff9a2a', var_scale=10.0, emit_boost=1.2, top=0.4),
    'rope': dict(base='#b49865', var='#8a7040', var_scale=10.0, fine=0.12, top=0.2),
    'powder': dict(base='#2a2a30', var='#18181c', var_scale=6.0, fine=0.12, top=0.4, edge='#8a8a96', edge_amt=0.6,
                   edge_r=0.02, ao=(0.2, 0.5)),
    'wax': dict(base='#c8322a', var='#8c1c16', var_scale=8.0, top=0.45, edge='#ff8a7a', edge_amt=0.5, edge_r=0.02),
    'spark': dict(base='#ffd23a', var='#ff8a1a', var_scale=6.0, emit_boost=1.4),
    'ember': dict(base='#ff7a1a', var='#ff4a0a', var_scale=6.0, emit_boost=1.3),
    'skullmark': dict(base='#e8dcb8', var='#c9b98a', var_scale=6.0, top=0.3),
}


def barrel(mb, c, r, h, tilt=0.0):
    """Barril de pólvora grande com aros de ferro, tampa, marca de caveira e cordas."""
    T = Matrix.Translation(Vector(c)) @ M(r=(tilt, 0, 0))
    prof = [(0.0, 0.84 * r), (0.2, 0.96 * r), (0.5, r), (0.8, 0.96 * r), (1.0, 0.84 * r)]
    rings = [ring_h(-h / 2 + t * h, rr, rr, 12) for t, rr in prof]
    mb.add(prim_rings(rings), 'wood', T, smooth=55)
    for t in (0.14, 0.34, 0.66, 0.86):
        rr = [0.88, 0.97, 0.97, 0.88][(0.14, 0.34, 0.66, 0.86).index(t)] * r
        mb.add(prim_cyl(rr * 1.045, rr * 1.045, 0.05, 12, base=False), 'iron', T @ M((0, -h / 2 + t * h, 0)), smooth=30)
    mb.add(prim_cyl(0.8 * r, 0.8 * r, 0.04, 12), 'wood', T @ M((0, h / 2 - 0.0, 0)))
    mb.add(prim_cyl(0.84 * r, 0.84 * r, 0.03, 12), 'iron', T @ M((0, h / 2 + 0.03, 0)), smooth=30)
    # bocal com rolha e furo do pavio
    mb.add(prim_cyl(0.09, 0.1, 0.06, 8), 'leather_dark', T @ M((0, h / 2 + 0.04, 0)), smooth=40)
    # marca de perigo (caveira) na face externa (-z): placa de bone + olhos
    mb.add(prim_box(0.22, 0.2, 0.025), 'skullmark', T @ M((0, 0.03, -r * 1.01)), bevel=0.006)
    for sx in (-1, 1):
        mb.add(prim_box(0.05, 0.05, 0.03), 'pupil', T @ M((sx * 0.05, 0.05, -r * 1.02)))
    mb.add(prim_box(0.14, 0.03, 0.03), 'pupil', T @ M((0, -0.04, -r * 1.02)))
    return T


def build_torso(mats, root):
    mb = MeshBuilder('Torso')
    # camisa de linho: tronco largo e forte
    shirt = [ring_h(-0.32, 0.36, 0.27, 12), ring_h(-0.14, 0.34, 0.25, 12), ring_h(0.08, 0.42, 0.28, 12, cz=0.02),
             ring_h(0.28, 0.5, 0.29, 12, cz=0.02), ring_h(0.38, 0.4, 0.25, 12), ring_h(0.43, 0.2, 0.18, 12)]
    mb.add(prim_rings(shirt), 'linen', smooth=62)
    # colete de couro e time: peito aberto, gola alta, ombros
    vest = [ring_h(-0.28, 0.375, 0.285, 12), ring_h(-0.1, 0.355, 0.265, 12), ring_h(0.1, 0.435, 0.29, 12, cz=0.02),
            ring_h(0.27, 0.515, 0.30, 12, cz=0.02), ring_h(0.37, 0.43, 0.26, 12)]
    mb.add(prim_rings(vest, cap0=False, cap1=False), 'team', smooth=55, bevel=0.004)
    mb.add(prim_rings([ring_h(-0.285, 0.378, 0.288, 12), ring_h(-0.255, 0.372, 0.282, 12)], cap0=False, cap1=False), 'leather', smooth=30)
    # abertura do colete: placa de couro no peito com fivelas
    mb.add(prim_box(0.16, 0.56, 0.03), 'linen', M((0, 0.06, 0.29)))
    for k in range(4):
        mb.add(prim_box(0.2, 0.025, 0.04), 'leather', M((0, 0.26 - k * 0.12, 0.31)))
        mb.add(prim_sphere(0.017, 0.017, 0.015, 5, 3), 'brass', M((0.0, 0.26 - k * 0.12, 0.335)), smooth=60)
    # ombreira de couro reforçada (esquerda) e almofada
    for sx in (-1, 1):
        mb.add(prim_sphere(0.20, 0.09, 0.19, 10, 3, y_min=0.0), 'leather', M((sx * 0.5, 0.36, 0.0), (0, 0, -sx * 18)), smooth=55)
        mb.add(prim_cyl(0.2, 0.2, 0.016, 10), 'brass', M((sx * 0.5, 0.355, 0.0), (0, 0, -sx * 18)), smooth=30)
    mb.add(prim_cone(0.05, 0.16, 6), 'iron', M((-0.5, 0.40, 0.0), (0, 0, 28)))
    # bandoleira de bombas (ombro direito -> quadril esquerdo) com 5 cargas
    for k in range(5):
        t = k / 4.0
        x = 0.3 - 0.6 * t
        y = 0.38 - 0.62 * t
        z = 0.3 - 0.03 * math.sin(math.pi * t)
        mb.add(prim_sphere(0.075, 0.075, 0.07, 8, 4), 'powder', M((x, y, z + 0.04)), smooth=65)
        mb.add(prim_cyl(0.034, 0.034, 0.03, 6), 'wax', M((x, y + 0.075, z + 0.04)), smooth=40)
        mb.add(prim_cyl(0.012, 0.012, 0.07, 4), 'rope', M((x, y + 0.11, z + 0.04), (0, 0, 20)))
        mb.add(prim_cyl(0.083, 0.083, 0.02, 8), 'brass', M((x, y, z + 0.04), (90, 0, 0)))
    strap = [(0.30, 0.43, 0.24), (0.0, 0.1, 0.285), (-0.3, -0.24, 0.26)]
    tube(mb, [(0.34, 0.46, 0.20), (0.15, 0.22, 0.30), (-0.15, -0.1, 0.30), (-0.36, -0.28, 0.2)], [0.035, 0.035, 0.035, 0.035], 'leather', n=4, smooth=0)
    # cinto largo, fivela e bolsas
    mb.add(prim_rings([ring_h(-0.3, 0.375, 0.285, 12), ring_h(-0.12, 0.36, 0.27, 12)]), 'leather_dark', smooth=40)
    mb.add(prim_box(0.16, 0.14, 0.05), 'brass', M((0, -0.2, 0.28)), bevel=0.01)
    mb.add(prim_box(0.08, 0.07, 0.04), 'iron', M((0, -0.2, 0.31)), bevel=0.008)
    for sx in (-1, 1):
        mb.add(prim_box(0.17, 0.19, 0.12), 'leather', M((sx * 0.36, -0.28, 0.1), (0, sx * -12, sx * -6)), bevel=0.012)
        mb.add(prim_box(0.18, 0.05, 0.13), 'brass', M((sx * 0.36, -0.2, 0.1), (0, sx * -12, sx * -6)))
    # avental de couro à frente (barra queimada)
    mb.add(cloth_panel((-0.22, -0.3, 0.27), (0.22, -0.3, 0.27), (-0.27, -0.88, 0.31), (0.27, -0.88, 0.31),
                       nx=4, ny=4, thick=0.04, bulge=(0, 0, 0.03), wave=0.02, jag=0.04), 'leather_dark', smooth=50)
    # barril nas costas + correias cruzadas + corda enrolada
    barrel(mb, BARREL_C, 0.27, 0.62, tilt=-6)
    for sx in (-1, 1):
        mb.add(prim_box(0.075, 0.9, 0.04), 'leather', M((sx * 0.22, 0.16, -0.2), (0, 0, -sx * -8)), bevel=0.006)
    mb.add(prim_box(0.62, 0.075, 0.04), 'leather', M((0, 0.24, -0.2)))
    mb.add(prim_box(0.62, 0.075, 0.04), 'leather', M((0, -0.08, -0.2)))
    return mb.build(mats, parent=root, location=TORSO_PIVOT)


def build_fuse(mats, torso):
    mb = MeshBuilder('Fuse')
    # cordão torcido para fora do barril + faísca facetada com chamas
    tube(mb, [(0, 0, 0), (0.0, 0.07, -0.02), (0.03, 0.14, -0.01), (0.02, 0.2, 0.02)], [0.016, 0.016, 0.014, 0.012], 'rope', n=5, smooth=40)
    mb.add(prim_cone(0.08, 0.16, 5), 'spark', M((0.02, 0.2, 0.02)), smooth=0)
    mb.add(prim_cone(0.08, 0.1, 5), 'spark', M((0.02, 0.2, 0.02), (180, 0, 0)), smooth=0)
    mb.add(prim_cone(0.045, 0.16, 4), 'ember', M((0.08, 0.2, 0.0), (0, 0, -40)), smooth=0)
    mb.add(prim_cone(0.045, 0.14, 4), 'ember', M((-0.04, 0.22, 0.05), (20, 0, 30)), smooth=0)
    return mb.build(mats, parent=torso, location=FUSE_POS)


def build_head(mats, root):
    mb = MeshBuilder('Head')
    sk = [ring_h(-0.19, 0.08, 0.09, 12, cz=0.04), ring_h(-0.1, 0.15, 0.17, 12, cz=0.03), ring_h(0.0, 0.18, 0.2, 12, cz=0.01),
          ring_h(0.1, 0.19, 0.21, 12, cz=0.0), ring_h(0.2, 0.17, 0.19, 12), ring_h(0.27, 0.09, 0.1, 12)]
    mb.add(prim_rings(sk), 'skin', smooth=65)
    # mandíbula quadrada
    mb.add(prim_box(0.30, 0.13, 0.2, taper=(0.85, 0.7)), 'skin', M((0, -0.12, 0.09)), bevel=0.02, smooth=40)
    # rosto fanático (+Z): olhos arregalados com pupilas pequenas, sobrancelhas inclinadas, sorriso de dentes, fuligem
    for sx in (-1, 1):
        mb.add(prim_box(0.095, 0.07, 0.05), 'eye_w', M((sx * 0.085, 0.045, 0.205)), bevel=0.008)
        mb.add(prim_box(0.035, 0.04, 0.03), 'pupil', M((sx * 0.085 - sx * 0.005, 0.045, 0.235)))
        mb.add(prim_box(0.13, 0.04, 0.05), 'hair', M((sx * 0.085, 0.115, 0.205), (-8, 0, sx * 22)), bevel=0.008)
        mb.add(prim_box(0.11, 0.07, 0.03), 'soot', M((sx * 0.1, -0.03, 0.215), (0, 0, sx * -10)))
        mb.add(prim_box(0.035, 0.1, 0.05, taper=(0.6, 1.0)), 'soot', M((sx * 0.14, -0.14, 0.17), (0, 0, sx * -12)))
    mb.add(prim_box(0.07, 0.12, 0.08, taper=(0.8, 0.7)), 'skin', M((0, -0.03, 0.225), (-10, 0, 0)), bevel=0.01)
    mb.add(prim_box(0.2, 0.065, 0.05), 'mouth', M((0, -0.115, 0.215)), bevel=0.006)
    for k in range(6):
        mb.add(prim_box(0.028, 0.03, 0.03), 'teeth', M(((k - 2.5) * 0.031, -0.098, 0.236)))
        mb.add(prim_box(0.028, 0.026, 0.03), 'teeth', M(((k - 2.5) * 0.031, -0.135, 0.236)))
    # quepe de couro com abas laterais e rebites; óculos de proteção empurrados para a testa
    mb.add(prim_sphere(0.205, 0.17, 0.215, 12, 4, y_min=0.0), 'leather', M((0, 0.14, -0.005)), smooth=50)
    mb.add(prim_cyl(0.215, 0.215, 0.05, 12), 'leather_dark', M((0, 0.13, 0.0)), smooth=30)
    mb.add(prim_box(0.2, 0.025, 0.1), 'leather_dark', M((0, 0.165, 0.2), (-14, 0, 0)))
    for sx in (-1, 1):
        mb.add(prim_box(0.05, 0.2, 0.15, taper=(0.9, 0.9)), 'leather', M((sx * 0.19, -0.02, 0.0)), bevel=0.01)
        mb.add(prim_sphere(0.015, 0.015, 0.012, 4, 2), 'brass', M((sx * 0.22, 0.09, 0.03)), smooth=60)
    mb.add(prim_rings([ring_h(0.13, 0.215, 0.225, 12), ring_h(0.17, 0.21, 0.22, 12)], cap0=False, cap1=False), 'leather_dark', smooth=30)
    for sx in (-1, 1):
        G = M((sx * 0.085, 0.175, 0.205), (-20, 0, 0))
        mb.add(prim_cyl(0.065, 0.065, 0.05, 10, base=False), 'brass', G @ M((0, 0, 0), (90, 0, 0)), smooth=30)
        mb.add(prim_cyl(0.052, 0.052, 0.03, 10, base=False), 'lens', G @ M((0, 0, 0.022), (90, 0, 0)), smooth=30)
    mb.add(prim_box(0.06, 0.03, 0.04), 'brass', M((0, 0.175, 0.214), (-20, 0, 0)))
    # cabelo despontando atrás do quepe
    mb.add(prim_box(0.3, 0.12, 0.08, taper=(0.9, 1.0)), 'hair', M((0, 0.0, -0.2)), bevel=0.01)
    hd = mb.build(mats, parent=root, location=HEAD_PIVOT)
    hd.data.transform(Matrix.Scale(1.1, 4))
    return hd


def build_arm(mats, root, side):
    s = side
    mb = MeshBuilder('ArmR' if s > 0 else 'ArmL')
    sh = Vector((s * 0.0, -0.08, 0.0))
    e = Vector((s * 0.05, -0.33, 0.03))
    w = Vector((s * 0.06, -0.58, 0.1))
    tube(mb, [tuple(sh), tuple(sh.lerp(e, 0.5)), tuple(e)], [0.12, 0.135, 0.115], 'linen', n=9)
    mb.add(prim_sphere(0.12, 0.115, 0.12, 8, 4), 'linen', M(tuple(e)), smooth=62)
    # antebraço nu e forte com braçadeira de couro e luva de cano alto
    d = (w - e).normalized()
    tube(mb, [tuple(e), tuple(e.lerp(w, 0.45)), tuple(w)], [0.105, 0.115, 0.09], 'skin', n=9)
    mb.add(prim_cyl(0.125, 0.125, 0.04, 9), 'linen', Matrix.Translation(e + d * 0.02) @ orient(d), smooth=30)    # manga arregaçada
    mb.add(prim_cyl(0.118, 0.1, 0.17, 9), 'glove', Matrix.Translation(e.lerp(w, 0.78)) @ orient(d), smooth=35, bevel=0.005)
    mb.add(prim_cyl(0.122, 0.122, 0.022, 9), 'brass', Matrix.Translation(e.lerp(w, 0.58)) @ orient(d), smooth=30)
    Tw = Matrix.Translation(w + d * 0.01) @ orient(d)
    fist(mb, Tw, 1.3, 'glove', glove='glove', knuckle='leather')
    mb.add(prim_box(0.14, 0.02, 0.05), 'brass', Tw @ M((0, 0.085, 0.1)))
    return mb.build(mats, parent=root, location=(s * ARM_PIVOT[0], ARM_PIVOT[1], ARM_PIVOT[2]))


def build_leg(mats, root, side):
    s = side
    mb = MeshBuilder('LegR' if s > 0 else 'LegL')
    th = [(0, 0.0, 0), (s * 0.005, -0.2, 0.02), (s * 0.01, -0.38, 0.03)]
    tube(mb, th, [(0.15, 0.16), (0.145, 0.155), (0.12, 0.13)], 'pants', n=9)
    mb.add(prim_box(0.14, 0.12, 0.05), 'leather', M((s * 0.01, -0.4, 0.11)), bevel=0.012)        # joelheira
    mb.add(prim_sphere(0.12, 0.1, 0.08, 8, 3, y_min=0.0), 'leather', M((s * 0.01, -0.4, 0.1), (90, 0, 0)), smooth=50)
    mb.add(prim_box(0.12, 0.08, 0.02), 'linen', M((s * 0.05, -0.18, 0.15)))                          # remendo
    sh = [(s * 0.012, -0.42, 0.03), (s * 0.016, -0.54, 0.015), (s * 0.02, -0.64, 0.0)]
    tube(mb, sh, [(0.115, 0.12), (0.115, 0.12), (0.095, 0.1)], 'pants', n=9)
    # bota de cano alto com biqueira de ferro e fivelas
    mb.add(prim_cyl(0.125, 0.12, 0.28, 10), 'leather_dark', M((s * 0.018, -0.66, 0.0), (0, 0, 0)), smooth=40)
    mb.add(prim_box(0.2, 0.1, 0.34, taper=(0.82, 0.58), base=True), 'leather', M((s * 0.02, -0.71, 0.08)), bevel=0.02, smooth=35)
    mb.add(prim_box(0.15, 0.07, 0.08, base=True), 'iron', M((s * 0.02, -0.7, 0.28)), bevel=0.012)
    for dy in (-0.5, -0.58):
        mb.add(prim_box(0.14, 0.025, 0.02), 'brass', M((s * 0.02, dy, 0.12)))
    return mb.build(mats, parent=root, location=(s * LEG_PIVOT[0], LEG_PIVOT[1], LEG_PIVOT[2]))


def main():
    args = C.script_args()
    C.reset_scene()
    mats = C.make_paint_set(PALETTE)
    root = C.make_empty('Sapper')
    torso = build_torso(mats, root)
    fuse = build_fuse(mats, torso)
    head = build_head(mats, root)
    arm_l = build_arm(mats, root, -1)
    arm_r = build_arm(mats, root, 1)
    leg_l = build_leg(mats, root, -1)
    leg_r = build_leg(mats, root, 1)
    parts = [torso, fuse, head, arm_l, arm_r, leg_l, leg_r]
    finish_unit('sapper', 'sapper.glb', 'sapper_atlas', root, parts,
                {'Head': 1.7, 'Torso': 1.2, 'Fuse': 0.8, 'LegL': 0.8, 'LegR': 0.8, 'ArmL': 1.0, 'ArmR': 1.0},
                TEAM_DEFAULT, args, cam_h=1.95)


if __name__ == '__main__':
    main()
