"""
build_peon.py — Lacaio orc (trabalhador da Horda, tipo interno `peon`) gerado 100% por script.

Uso:
  blender -b --factory-startup --python tools/blender/build_peon.py -- [--no-render]

Hierarquia ANINHADA (igual ao PeonModel.js procedural):
  Peon (raiz)
  ├─ Torso  pivô (0, 1.25, -0.08), rot x = 0.22 rad (postura curvada)
  │  ├─ Head   pivô (0, 0.62, 0.16)
  │  ├─ ArmL   pivô (-0.56, 0.38, 0)
  │  ├─ ArmR   pivô ( 0.56, 0.38, 0)
  │  │   └─ ToolGroup pivô (0, -0.92, 0.18)
  │  │       ├─ Axe (visível) / Pickaxe / Hammer (ocultos no jogo)  — gume/ponta para +Z
  │  └─ Pack   pivô (0, 0.05, -0.42)  (oculta no jogo; WoodBundle / GoldSack)
  ├─ LegL / LegR  pivô (∓0.25, 0.85, -0.05)
Cor de time (`TeamColor`): faixa da testa, bandoleira, faixa da cintura e cauda de pano.
"""
import os
import sys
import math

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C  # noqa: E402
from common import (MeshBuilder, M, prim_box, prim_rings, ring_h, prim_cyl, prim_cone,  # noqa: E402
                    prim_sphere, prim_extrude, limb_rings, bezier)
import worker_common as W  # noqa: E402
from worker_common import tube, stitches, rivets, cloth_panel, extrude_tapered  # noqa: E402
W.install_bevel_budget()

TORSO_PIVOT = (0.0, 1.25, -0.08)
TORSO_LEAN_DEG = math.degrees(0.22)
HEAD_PIVOT = (0.0, 0.62, 0.16)
ARM_PIVOT = (0.56, 0.38, 0.0)
TOOL_PIVOT = (0.0, -0.92, 0.18)
PACK_PIVOT = (0.0, 0.05, -0.42)
LEG_PIVOT = (0.25, 0.85, -0.05)
TEAM_DEFAULT = '#d23a2c'  # vermelho da Horda (multiplica a área cinza)

PALETTE = {
    'skin': dict(base='#77843f', var='#52622c', var_scale=3.2, var_amt=0.95, fine=0.12,
                 grad=(0.0, 2.4, 0.34), top=0.2, edge='#98a45a', edge_amt=0.3, edge_r=0.03,
                 ao=(0.28, 0.7), coord='world'),
    'skin_dark': dict(base='#435227', var='#36441f', var_scale=4.0, fine=0.05, grad=(0.0, 2.4, 0.2),
                      top=0.15, ao=(0.25, 0.6)),
    'scar': dict(base='#c4c48e', var='#b0b07c', var_scale=20.0, fine=0.1, top=0.15),
    'bruise': dict(base='#5a5a3a', var='#4a4a34', var_scale=9.0, var_amt=1.0, fine=0.14, top=0.1, ao=(0.3, 0.6)),
    'mud': dict(base='#5a4c33', var='#3f3422', var_scale=14.0, var_amt=1.0, fine=0.25, fine_scale=50.0, top=0.1,
                ao=(0.3, 0.7)),
    'leather': dict(base='#71452a', var='#54301a', var_scale=6.0, var_amt=0.9, fine=0.14, top=0.2,
                    edge='#a97a4c', edge_amt=0.55, edge_r=0.02, ao=(0.25, 0.6), grad=(0.0, 2.2, 0.15)),
    'leather_dk': dict(base='#48291a', var='#341c10', var_scale=6.0, fine=0.12, top=0.18,
                       edge='#7b5232', edge_amt=0.5, edge_r=0.018, ao=(0.22, 0.6)),
    'soot': dict(base='#3a2a1e', var='#2a1e14', var_scale=10.0, fine=0.15, top=0.1),
    'cloth': dict(base='#5d4a36', var='#463726', var_scale=7.0, var_amt=0.8, fine=0.15, fine_scale=45.0,
                  top=0.18, edge='#8a7458', edge_amt=0.35, edge_r=0.02, ao=(0.25, 0.65), grad=(0.0, 1.4, 0.22)),
    'iron': dict(base='#454b56', var='#31363f', var_scale=7.0, var_amt=0.8, fine=0.14, top=0.35,
                 edge='#c3cad6', edge_amt=0.9, edge_r=0.02, edge_gain=12.0, ao=(0.22, 0.55)),
    'rust': dict(base='#8a7060', var='#6a5242', var_scale=11.0, var_amt=1.0, fine=0.2, top=0.3,
                 edge='#c09a72', edge_amt=0.75, edge_r=0.02, edge_gain=11.0, ao=(0.2, 0.5)),
    'steel': dict(base='#9aa4b4', var='#788292', var_scale=9.0, fine=0.1, top=0.3,
                  edge='#eef3fa', edge_amt=1.0, edge_r=0.02, ao=(0.2, 0.4)),
    'bone': dict(base='#e3d5aa', var='#c6b280', var_scale=5.0, fine=0.08, top=0.15,
                 edge='#fff6dc', edge_amt=0.4, edge_r=0.02, ao=(0.2, 0.55)),
    'brass': dict(base='#d19a2a', var='#a97a1a', var_scale=9.0, var_amt=0.7, fine=0.06, top=0.35,
                  edge='#ffe9a0', edge_amt=1.0, edge_r=0.014, edge_gain=12.0, ao=(0.15, 0.45)),
    'wood': dict(base='#6c4a2a', var='#523620', var_scale=5.0, fine=0.1, coord='object',
                 streaks=(40.0, 2.0, 0.22), edge='#9a7048', edge_amt=0.4, edge_r=0.015, ao=(0.2, 0.5)),
    'bark': dict(base='#5a3f28', var='#3b2816', var_scale=9.0, var_amt=1.0, fine=0.22, fine_scale=30.0,
                 coord='object', streaks=(30.0, 3.0, 0.35), top=0.22, edge='#8f6a44', edge_amt=0.4,
                 edge_r=0.02, ao=(0.2, 0.6)),
    'wood_end': dict(base='#dcb676', var='#c39758', var_scale=14.0, var_amt=1.0, fine=0.12, top=0.3,
                     ao=(0.2, 0.4)),
    'wood_ring': dict(base='#a4783f', var='#87602e', var_scale=20.0, fine=0.1, top=0.2),
    'rope': dict(base='#cda56a', var='#a98548', var_scale=40.0, var_amt=1.0, fine=0.2, fine_scale=80.0, top=0.25,
                 edge='#efd29c', edge_amt=0.4, edge_r=0.01, ao=(0.15, 0.5)),
    'thread': dict(base='#e6d8b0', var='#cdbd8f', fine=0.05, top=0.1),
    'burlap': dict(base='#b39358', var='#927645', var_scale=14.0, var_amt=1.0, fine=0.22, fine_scale=70.0,
                   top=0.25, edge='#dcc288', edge_amt=0.4, edge_r=0.02, ao=(0.25, 0.65)),
    'gold': dict(base='#ffcc33', var='#e8a11a', var_scale=20.0, var_amt=1.0, fine=0.08, top=0.5,
                 edge='#fff6b0', edge_amt=1.0, edge_r=0.012, edge_gain=12.0, ao=(0.15, 0.4), emit_boost=1.1),
    'eye': dict(base='#ffc23a', var='#ff9b1a', var_scale=20.0, emit_boost=1.4),
    'mouth': dict(base='#2a1512', var='#1a0d0b'),
    'sole': dict(base='#2d211a', var='#1f1611', fine=0.1, top=0.1, ao=(0.15, 0.5)),
    'team': dict(base='#b8b0a4', var='#9d9589', var_scale=5.0, fine=0.1, fine_scale=45.0, top=0.25,
                 edge='#d8d2c8', edge_amt=0.3, edge_r=0.03, ao=(0.3, 0.65), team=True),
}


def jag(ring, amp):
    return [(x, y + (amp if i % 2 else -amp * 0.4), z) for i, (x, y, z) in enumerate(ring)]


def build_torso(mats, root):
    mb = MeshBuilder('Torso')
    rings = [
        ring_h(-0.56, 0.30, 0.23, 12, cz=0.00),
        ring_h(-0.38, 0.31, 0.24, 12, cz=0.02),
        ring_h(-0.18, 0.33, 0.26, 12, cz=0.03),
        ring_h(0.04, 0.38, 0.28, 12, cz=0.03),
        ring_h(0.24, 0.44, 0.30, 12, cz=-0.01),
        ring_h(0.40, 0.42, 0.29, 12, cz=-0.07),
        ring_h(0.50, 0.28, 0.22, 12, cz=-0.04),
        ring_h(0.58, 0.17, 0.16, 12, cz=0.02),
    ]
    mb.add(prim_rings(rings), 'skin', smooth=72)
    # músculos/clavículas: peitorais e barriga (leve), cicatrizes
    for sx in (-1, 1):
        mb.add(prim_sphere(0.20, 0.13, 0.11, 8, 3), 'skin', M((sx * 0.17, 0.2, 0.25), (8, sx * 10, sx * -6)), smooth=70)
        mb.add(prim_box(0.02, 0.16, 0.012), 'scar', M((sx * 0.3, 0.05, 0.27), (0, 0, sx * -25)))
    # cicatrizes cruzadas no peito/ombro e hematomas
    mb.add(prim_box(0.018, 0.17, 0.010), 'scar', M((0.14, 0.27, 0.318), (0, 0, 40)))
    mb.add(prim_box(0.018, 0.12, 0.010), 'scar', M((0.15, 0.25, 0.322), (0, 0, -35)))
    mb.add(prim_box(0.018, 0.14, 0.010), 'scar', M((-0.30, 0.22, 0.26), (0, 0, 70)))
    mb.add(prim_sphere(0.09, 0.06, 0.03, 6, 2), 'bruise', M((-0.15, 0.12, 0.30), (0, 0, 20)), smooth=60)
    mb.add(prim_sphere(0.08, 0.05, 0.03, 6, 2), 'mud', M((0.34, 0.12, 0.22), (0, 50, 10)), smooth=60)
    # avental de couro (peitilho + saia) com rebites, remendos e queimaduras
    mb.add(cloth_panel((-0.22, 0.26, 0.315), (0.22, 0.26, 0.315), (-0.30, -0.24, 0.33), (0.30, -0.24, 0.33),
                       nx=4, ny=4, thick=0.04, bulge=(0, 0, 0.02), wave=0.01, jag=0.0), 'leather', smooth=45)
    mb.add(cloth_panel((-0.31, -0.26, 0.34), (0.31, -0.26, 0.34), (-0.36, -0.76, 0.37), (0.36, -0.76, 0.37),
                       nx=5, ny=4, thick=0.04, bulge=(0, 0, 0.05), wave=0.025, jag=0.05), 'leather', smooth=50)
    mb.add(prim_box(0.26, 0.20, 0.03), 'leather_dk', M((0.0, -0.04, 0.345)), bevel=0.01)      # bolso grande
    mb.add(prim_box(0.28, 0.05, 0.036), 'leather_dk', M((0.0, 0.065, 0.348)))
    stitches(mb, (-0.11, -0.12, 0.362), (0.11, -0.12, 0.362), 5, 'thread', size=(0.026, 0.008, 0.008))
    rivets(mb, [(-0.12, 0.065, 0.368), (0.12, 0.065, 0.368), (-0.24, 0.20, 0.335), (0.24, 0.20, 0.335)], 'iron', 0.022)
    mb.add(prim_box(0.10, 0.07, 0.008), 'soot', M((-0.16, -0.52, 0.378), (0, 0, 12)))              # queimadura
    mb.add(prim_box(0.12, 0.13, 0.014), 'cloth', M((0.16, -0.46, 0.382), (0, 0, -7)))             # remendo
    stitches(mb, (0.10, -0.4, 0.392), (0.22, -0.4, 0.392), 4, 'thread', size=(0.02, 0.007, 0.007))
    # correias do avental sobre os ombros (couro) que se cruzam nas costas
    for sx in (-1, 1):
        path = [(sx * 0.2, 0.22, 0.32), (sx * 0.2, 0.40, 0.2), (sx * 0.22, 0.50, -0.02),
                (sx * 0.19, 0.42, -0.24), (sx * 0.06, 0.14, -0.30), (-sx * 0.09, -0.08, -0.29)]
        tube(mb, path, [(0.05, 0.014)] * 6, 'leather', 6, smooth=50, up=(0, 1, 0))
    rivets(mb, [(0, 0.16, -0.31)], 'iron', 0.03)
    # cinto largo com fivela de ferro e presa de osso
    mb.add(prim_rings([ring_h(-0.42, 0.335, 0.265, 14, cz=0.03), ring_h(-0.25, 0.34, 0.27, 14, cz=0.03)]),
           'leather_dk', smooth=40)
    mb.add(prim_box(0.20, 0.16, 0.05), 'iron', M((0, -0.335, 0.335)), bevel=0.02)
    mb.add(prim_cone(0.04, 0.16, 5), 'bone', M((0, -0.335, 0.37), (90, 0, 0)))
    # cinto de ferramentas: martelinho, formão, bolsa e corda
    mb.add(prim_cyl(0.02, 0.02, 0.32, 6, base=False), 'wood', M((-0.36, -0.42, 0.14), (8, 0, 78)), smooth=40)
    mb.add(prim_box(0.10, 0.09, 0.09), 'iron', M((-0.28, -0.35, 0.14), (0, 0, 8)), bevel=0.01)
    mb.add(prim_box(0.05, 0.06, 0.06), 'leather_dk', M((-0.34, -0.29, 0.14)))
    mb.add(prim_box(0.14, 0.15, 0.10), 'leather', M((0.37, -0.42, 0.10), (0, 0, -6)), bevel=0.02, smooth=25)
    mb.add(prim_box(0.15, 0.06, 0.11), 'leather_dk', M((0.37, -0.35, 0.10), (0, 0, -6)))
    rivets(mb, [(0.365, -0.385, 0.155)], 'brass', 0.018)
    mb.add(prim_rings([ring_h(0.0, 0.10, 0.10, 8), ring_h(0.05, 0.10, 0.10, 8)], cap0=False, cap1=False), 'rope',
           M((0.30, -0.46, -0.13), (30, 0, 20)), smooth=30)
    mb.add(prim_cone(0.03, 0.14, 4), 'steel', M((-0.20, -0.5, 0.20), (0, 0, 168)))              # formão
    # tanga de pano por baixo e cauda de couro atrás (cor de time = faixa de cintura)
    mb.add(cloth_panel((0.24, -0.30, -0.24), (-0.24, -0.30, -0.24), (0.27, -0.72, -0.31), (-0.27, -0.72, -0.31),
                       nx=5, ny=4, thick=0.035, bulge=(0, 0, -0.06), wave=0.03, jag=0.06), 'team', smooth=50)
    # bandoleira (cor de time) atravessando o peito, com nó e pontas
    path = [(-0.32, 0.46, 0.02), (-0.26, 0.36, 0.26), (-0.10, 0.16, 0.345), (0.10, -0.02, 0.365),
            (0.28, -0.22, 0.34), (0.35, -0.30, 0.20)]
    tube(mb, path, [(0.062, 0.014)] * 6, 'team', 6, smooth=40, up=(0, 1, 0))
    mb.add(prim_sphere(0.05, 0.05, 0.04, 6, 3), 'team', M((0.36, -0.3, 0.16)), smooth=50)
    for k, (dx, ang) in enumerate(((0.035, 12), (-0.02, -16))):
        mb.add(prim_box(0.05, 0.26, 0.014, taper=(0.7, 1.0)), 'team', M((0.36 + dx, -0.45, 0.16), (0, 0, ang)), bevel=0.0)
    # ombreira de couro com espinho de osso (só o ombro esquerdo)
    # gola de couro no pescoço
    mb.add(prim_rings([ring_h(0.50, 0.24, 0.19, 12, cz=-0.03), ring_h(0.56, 0.20, 0.17, 12, cz=-0.01)],
                      cap0=False, cap1=False), 'leather_dk', smooth=40)
    return mb.build(mats, parent=root, location=TORSO_PIVOT)


def build_head(mats, torso):
    mb = MeshBuilder('Head')
    # crânio largo, testa baixa
    rings = [
        ring_h(-0.10, 0.20, 0.22, 12, cz=0.06),
        ring_h(0.02, 0.26, 0.25, 12, cz=0.03),
        ring_h(0.14, 0.27, 0.25, 12, cz=0.0),
        ring_h(0.24, 0.23, 0.22, 12, cz=-0.03),
        ring_h(0.31, 0.13, 0.13, 12, cz=-0.05),
    ]
    mb.add(prim_rings(rings), 'skin', smooth=75)
    # mandíbula projetada (underbite) + queixo
    mb.add(prim_box(0.46, 0.20, 0.33, taper=(0.9, 0.82)), 'skin', M((0, -0.115, 0.17), (-10, 0, 0)),
           bevel=0.05, bevel_segments=2, smooth=45)
    mb.add(prim_box(0.28, 0.05, 0.06), 'mouth', M((0, -0.045, 0.325)))
    for sx in (-1, 1):
        mb.add(prim_box(0.045, 0.045, 0.035), 'bone', M((sx * 0.07, -0.05, 0.33)))
        path = [(sx * 0.14, -0.08, 0.31), (sx * 0.165, 0.0, 0.345), (sx * 0.18, 0.075, 0.33)]
        tube(mb, path, [0.045, 0.03, 0.006], 'bone', 6, smooth=70, cap1=False)
    # testa/sobrancelhas pesadas
    for sx in (-1, 1):
        mb.add(prim_box(0.22, 0.055, 0.09, taper=(0.9, 0.7)), 'skin_dark', M((sx * 0.115, 0.16, 0.228), (8, 0, sx * 22)),
               bevel=0.015)
        # olhos âmbar em fenda
        mb.add(prim_sphere(0.066, 0.03, 0.03, 6, 3), 'eye', M((sx * 0.105, 0.075, 0.252), (0, 0, sx * 16)), smooth=80)
        mb.add(prim_box(0.15, 0.06, 0.05, taper=(0.9, 0.9)), 'skin_dark', M((sx * 0.105, 0.075, 0.225), (0, 0, sx * 16)))
    # cicatriz sobre o olho direito e cheiro de lama na bochecha (só frente)
    mb.add(prim_box(0.015, 0.15, 0.012), 'scar', M((-0.105, 0.11, 0.255), (8, 0, -28)))
    mb.add(prim_sphere(0.05, 0.03, 0.02, 6, 2), 'mud', M((0.12, -0.03, 0.262), (0, 20, 0)), smooth=60)
    # nariz achatado com narinas
    mb.add(prim_box(0.16, 0.09, 0.08, taper=(0.5, 0.55)), 'skin', M((0, 0.02, 0.265), (-15, 0, 0)), bevel=0.02)
    for sx in (-1, 1):
        mb.add(prim_box(0.035, 0.026, 0.025), 'mouth', M((sx * 0.04, -0.005, 0.305)))
    # bochechas ossudas (só relevo frontal)
    for sx in (-1, 1):
        mb.add(prim_sphere(0.07, 0.045, 0.05, 6, 2), 'skin', M((sx * 0.185, 0.04, 0.17), (0, sx * 25, 0)), smooth=70)
    # orelhas longas, com argola de latão
    for sx in (-1, 1):
        path = [(sx * 0.25, 0.09, -0.02), (sx * 0.37, 0.14, -0.07), (sx * 0.5, 0.25, -0.13)]
        tube(mb, path, [(0.075, 0.025), (0.05, 0.018), (0.006, 0.006)], 'skin', 5, smooth=60)
        mb.add(prim_rings(limb_rings([(sx * 0.335, 0.078, -0.045), (sx * 0.335, 0.055, -0.045)], [0.03, 0.03], 8)),
               'brass', smooth=30)
    # faixa da testa (cor de time), com nó e pontas atrás; coque de cabelo escuro
    mb.add(prim_rings([ring_h(0.20, 0.245, 0.245, 14, cz=-0.005), ring_h(0.255, 0.225, 0.225, 14, cz=-0.02)],
                      cap0=False, cap1=False), 'team', smooth=40)
    mb.add(prim_sphere(0.045, 0.04, 0.035, 6, 3), 'team', M((0.0, 0.22, -0.23)), smooth=60)
    for sx in (-1, 1):
        mb.add(prim_box(0.05, 0.22, 0.014, taper=(0.6, 1.0)), 'team',
               M((sx * 0.04, 0.12, -0.245), (10, 0, sx * -14)))
    mb.add(prim_sphere(0.075, 0.065, 0.07, 7, 3), 'soot', M((0.0, 0.335, -0.11)), smooth=65)
    mb.add(prim_rings(limb_rings([(0, 0.29, -0.11), (0, 0.305, -0.11)], [0.055, 0.055], 7)), 'leather', smooth=30)
    # nuca larga
    return mb.build(mats, parent=torso, location=HEAD_PIVOT)


def build_arm(mats, torso, side):
    s = side
    mb = MeshBuilder('ArmR' if s > 0 else 'ArmL')
    # ombro esférico + braço longo e forte
    mb.add(prim_sphere(0.16, 0.15, 0.15, 9, 4), 'skin', M((0.0, -0.02, 0.0)), smooth=72)
    tube(mb, [(0, -0.02, 0), (s * 0.01, -0.22, 0.01), (s * 0.015, -0.42, 0.0)], [0.118, 0.125, 0.10], 'skin', 9, smooth=72)
    if s > 0:
        wrist = (0.0, -0.80, 0.16)
        hand = (0.0, -0.92, 0.18)
    else:
        wrist = (0.0, -0.76, 0.10)
        hand = (0.0, -0.88, 0.12)
    tube(mb, [(s * 0.015, -0.42, 0.0), (s * 0.01, -0.55, 0.03), wrist], [0.10, 0.105, 0.078], 'skin', 9, smooth=72)
    mb.add(prim_box(0.016, 0.16, 0.010), 'scar', M((s * 0.06, -0.3, 0.117), (0, 0, s * 25)))
    mb.add(prim_sphere(0.075, 0.05, 0.05, 6, 2), 'mud', M((-s * 0.06, -0.50, 0.07), (0, 0, 0)), smooth=60)
    # bracelete de couro com rebites e faixas de pano no antebraço
    tube(mb, [(s * 0.01, -0.60, 0.05), (wrist[0], wrist[1] + 0.02, wrist[2] - 0.01)], [0.108, 0.085], 'leather_dk', 9,
         smooth=40)
    rivets(mb, [(s * 0.09, -0.66, 0.085), (s * 0.09, -0.72, 0.1)], 'iron', 0.016)
    tube(mb, [(s * 0.012, -0.30, 0.01), (s * 0.014, -0.34, 0.01)], [0.13, 0.13], 'cloth', 9, smooth=30)
    # punho grande (nós dos dedos) — no braço direito envolve o cabo
    x, y, z = hand
    mb.add(prim_box(0.15, 0.14, 0.15, taper=(0.95, 0.9)), 'skin', M((x, y, z)), bevel=0.03, smooth=35)
    if s > 0:
        for k in range(4):
            mb.add(prim_box(0.145, 0.034, 0.07), 'skin', M((x, y + 0.054 - k * 0.036, z + 0.095)), smooth=25)
        mb.add(prim_box(0.07, 0.1, 0.08), 'skin', M((x - 0.09, y + 0.02, z + 0.05), (0, 0, 18)), bevel=0.012, smooth=25)
    else:
        for k in range(3):
            mb.add(prim_box(0.045, 0.11, 0.07), 'skin', M((x + (k - 1) * 0.05, y - 0.1, z + 0.03), (12, 0, 0)),
                   bevel=0.008, smooth=25)
        mb.add(prim_box(0.07, 0.1, 0.07), 'skin', M((x + 0.09, y - 0.03, z + 0.05), (0, 0, -22)), bevel=0.01, smooth=25)
    if s < 0:
        # ombreira de couro cravejada com espinho de osso (só o ombro esquerdo)
        mb.add(prim_sphere(0.20, 0.13, 0.20, 9, 3, y_min=0.0), 'leather', M((0.0, 0.06, 0.0), (0, 0, 14)), smooth=45)
        mb.add(prim_rings([ring_h(0.06, 0.205, 0.205, 10), ring_h(0.03, 0.21, 0.21, 10)], cap0=False, cap1=False),
               'leather_dk', M((0, 0, 0), (0, 0, 14)), smooth=30)
        rivets(mb, [(-0.14, 0.15, 0.11), (-0.04, 0.17, 0.14)], 'iron', 0.02)
        mb.add(prim_cone(0.045, 0.16, 5), 'bone', M((-0.14, 0.16, -0.02), (0, 0, 32)), smooth=60)
    return mb.build(mats, parent=torso, location=(s * ARM_PIVOT[0], ARM_PIVOT[1], ARM_PIVOT[2]))


def build_leg(mats, root, side):
    s = side
    mb = MeshBuilder('LegR' if s > 0 else 'LegL')
    # coxa musculosa, calça rasgada até o joelho (barra irregular), canela nua enfaixada
    tube(mb, [(0, -0.02, 0), (s * 0.01, -0.2, 0.02), (s * 0.015, -0.42, 0.02)],
         [(0.175, 0.18), (0.18, 0.185), (0.14, 0.145)], 'cloth', 10, smooth=70, cap0=False, cap1=False)
    hem = [(0.14 * math.cos(a), -0.44 + (0.045 if i % 2 else -0.02), 0.145 * math.sin(a))
           for i, a in enumerate([2 * math.pi * k / 10 for k in range(10)])]
    mb.add(prim_rings([ring_h(-0.36, 0.145, 0.15, 10, cx=s * 0.013, cz=0.02), [(x + s * 0.013, y, z + 0.02) for (x, y, z) in hem]],
                      cap0=False, cap1=False), 'cloth', smooth=40)
    mb.add(prim_box(0.10, 0.10, 0.015), 'leather', M((s * 0.02, -0.28, 0.19), (0, 0, 8)))
    stitches(mb, (s * 0.02 - 0.05, -0.28, 0.2), (s * 0.02 + 0.05, -0.28, 0.2), 4, 'thread', size=(0.018, 0.006, 0.006))
    tube(mb, [(s * 0.015, -0.42, 0.02), (s * 0.03, -0.58, 0.03), (s * 0.04, -0.74, 0.0)], [0.13, 0.135, 0.09], 'skin', 9,
         smooth=72)
    # joelheira de couro com rebite + tiras nas canelas
    mb.add(prim_sphere(0.12, 0.08, 0.10, 8, 3, y_min=0.0), 'leather', M((s * 0.02, -0.4, 0.13), (90, 0, 0)), smooth=40)
    rivets(mb, [(s * 0.02, -0.4, 0.21)], 'iron', 0.02)
    for y in (-0.6, -0.68):
        mb.add(prim_rings([ring_h(y, 0.14, 0.14, 10, cx=s * 0.034, cz=0.02), ring_h(y - 0.035, 0.14, 0.14, 10, cx=s * 0.036, cz=0.02)]),
               'leather_dk', smooth=30)
    # pé grande: sola grossa, peito do pé de pele e dedos com tira de couro
    mb.add(prim_box(0.28, 0.10, 0.36, taper=(0.9, 0.7), base=True), 'skin', M((s * 0.04, -0.85, 0.07)), bevel=0.03, smooth=40)
    mb.add(prim_box(0.30, 0.04, 0.40, taper=(0.9, 0.8), base=True), 'sole', M((s * 0.04, -0.85, 0.06)), bevel=0.01, smooth=25)
    for k in range(3):
        mb.add(prim_sphere(0.045, 0.04, 0.05, 5, 2), 'skin', M((s * 0.04 + (k - 1) * 0.085, -0.83, 0.27)), smooth=60)
    mb.add(prim_box(0.30, 0.03, 0.08), 'leather', M((s * 0.04, -0.77, 0.12), (10, 0, 0)))
    mb.add(prim_box(0.05, 0.06, 0.03), 'iron', M((s * 0.04 + s * 0.15, -0.78, 0.12)))
    return mb.build(mats, parent=root, location=(s * LEG_PIVOT[0], LEG_PIVOT[1], LEG_PIVOT[2]))


def build_axe(mats, tg):
    """Machado rudimentar: cabo de madeira com fitas de couro, lâmina de ferro lascada (gume +Z)."""
    mb = MeshBuilder('Axe')
    tube(mb, [(0, -0.48, 0), (0, -0.2, 0.01), (0, 0.15, 0.0), (0, 0.5, 0.0), (0, 0.78, 0.0)],
         [0.05, 0.043, 0.043, 0.045, 0.05], 'wood', 8, smooth=60)
    mb.add(prim_cyl(0.06, 0.06, 0.26, 8, base=False), 'leather_dk', M((0, -0.02, 0)), smooth=40)
    mb.add(prim_cyl(0.065, 0.06, 0.10, 8, base=False), 'leather', M((0, -0.44, 0)), smooth=40)
    H = 0.62
    mb.add(prim_box(0.10, 0.20, 0.16), 'rust', M((0, H, 0)), bevel=0.02)        # cubo de ferro
    blade = [(0.06, 0.16), (0.16, 0.20), (0.30, 0.27), (0.42, 0.29), (0.45, 0.20), (0.41, 0.14), (0.47, 0.08),
             (0.44, -0.04), (0.47, -0.14), (0.38, -0.22), (0.24, -0.20), (0.12, -0.14), (0.06, -0.08)]
    verts, faces = extrude_tapered(blade, 0.07, lambda z, y: 1.0 - max(0.0, (z - 0.08) / 0.4) * 0.8)
    mb.add((verts, faces), 'rust', M((0, H, 0)), bevel=0.01)
    edge = [(0.42, 0.29), (0.45, 0.20), (0.41, 0.14), (0.47, 0.08), (0.44, -0.04), (0.47, -0.14), (0.38, -0.22),
            (0.36, -0.15), (0.40, -0.05), (0.39, 0.06), (0.35, 0.14), (0.38, 0.22)]
    verts, faces = extrude_tapered(edge, 0.04, lambda z, y: 1.0 - max(0.0, (z - 0.35) / 0.12) * 0.9)
    mb.add((verts, faces), 'steel', M((0, H, 0)))
    mb.add(prim_cone(0.06, 0.24, 5), 'bone', M((0, H, -0.08), (-90, 0, 0)), smooth=50)   # espigão de osso atrás
    for dz in (0.0, 0.07):  # amarras de couro cru
        mb.add(prim_cyl(0.06, 0.06, 0.03, 8, base=False), 'rope', M((0, H - 0.13 - dz * 0.5, 0)), smooth=30)
    rivets(mb, [(0.038, H + 0.02, 0.0), (-0.038, H + 0.02, 0.0)], 'iron', 0.016)
    return mb.build(mats, parent=tg, location=(0, 0, 0))


def build_pickaxe(mats, tg):
    mb = MeshBuilder('Pickaxe')
    mb.add(prim_cyl(0.043, 0.05, 1.3, 8, base=False), 'wood', M((0, 0.15, 0)), smooth=55)
    mb.add(prim_cyl(0.06, 0.06, 0.26, 8, base=False), 'leather_dk', M((0, -0.02, 0)), smooth=40)
    mb.add(prim_cyl(0.06, 0.055, 0.1, 8, base=False), 'leather', M((0, -0.5, 0)), smooth=40)
    H = 0.72
    mb.add(prim_box(0.12, 0.16, 0.13), 'rust', M((0, H, 0)), bevel=0.02)
    top = [(-0.46, -0.10), (-0.36, -0.03), (-0.22, 0.05), (-0.09, 0.09), (0.0, 0.10), (0.09, 0.09), (0.22, 0.05),
           (0.36, -0.03), (0.46, -0.10)]
    bot = [(0.32, -0.06), (0.2, 0.0), (0.08, -0.05), (-0.08, -0.05), (-0.2, 0.0), (-0.32, -0.06)]
    verts, faces = extrude_tapered(top + bot, 0.075, lambda z, y: 1.0 - (abs(z) / 0.46) ** 2 * 0.85)
    mb.add((verts, faces), 'rust', M((0, H, 0)), bevel=0.008)
    for sz in (-1, 1):
        tip = [(sz * 0.31, 0.0), (sz * 0.38, -0.04), (sz * 0.465, -0.102), (sz * 0.42, -0.08), (sz * 0.32, -0.04)]
        if sz < 0:
            tip = list(reversed(tip))
        verts, faces = extrude_tapered(tip, 0.045, lambda z, y: 1.0 - (abs(z) - 0.3) / 0.17 * 0.9)
        mb.add((verts, faces), 'steel', M((0, H, 0)))
        mb.add(prim_cyl(0.07, 0.07, 0.03, 8, base=False), 'rope', M((0, H, sz * 0.10), (90, 0, 0)), smooth=30)
    rivets(mb, [(0.05, H + 0.05, 0.03), (-0.05, H + 0.05, 0.03)], 'iron', 0.016)
    return mb.build(mats, parent=tg, location=(0, 0, 0))


def build_hammer(mats, tg):
    mb = MeshBuilder('Hammer')
    mb.add(prim_cyl(0.05, 0.055, 1.1, 8, base=False), 'wood', M((0, 0.15, 0)), smooth=45)
    mb.add(prim_cyl(0.062, 0.062, 0.26, 8, base=False), 'leather_dk', M((0, -0.02, 0)), smooth=40)
    H = 0.58
    mb.add(prim_box(0.26, 0.28, 0.44), 'rust', M((0, H, 0)), bevel=0.03)                # cabeça de pedra/ferro
    for sz in (-1, 1):
        mb.add(prim_box(0.28, 0.30, 0.04, taper=(0.95, 1.0)), 'iron', M((0, H, sz * 0.24)), bevel=0.012)
        mb.add(prim_cyl(0.075, 0.075, 0.03, 8, base=False), 'steel', M((0, H, sz * 0.265), (90, 0, 0)), smooth=30)
    for sy in (-1, 1):
        mb.add(prim_box(0.29, 0.03, 0.30), 'iron', M((0, H + sy * 0.15, 0)), bevel=0.008)
    for sx in (-1, 1):
        rivets(mb, [(sx * 0.135, H + 0.06, -0.09), (sx * 0.135, H + 0.06, 0.09), (sx * 0.135, H - 0.06, 0.0)], 'iron', 0.02)
    mb.add(prim_cyl(0.075, 0.07, 0.06, 8, base=False), 'rope', M((0, H - 0.20, 0)), smooth=30)
    return mb.build(mats, parent=tg, location=(0, 0, 0))


def build_pack(mats, torso):
    pack = C.make_empty('Pack', PACK_PIVOT, parent=torso)
    mb = MeshBuilder('PackFrame')
    for fx in (-0.30, 0.30):
        mb.add(prim_box(0.05, 0.78, 0.05), 'wood', M((fx, 0.0, 0.0)), bevel=0.008, smooth=20)
    for fy in (-0.30, 0.0, 0.30):
        mb.add(prim_box(0.66, 0.05, 0.05), 'wood', M((0, fy, 0.0)), bevel=0.008)
    mb.add(prim_box(0.5, 0.5, 0.10), 'burlap', M((0, -0.05, -0.07)), bevel=0.025, smooth=30)
    stitches(mb, (-0.2, -0.05, -0.125), (0.2, -0.05, -0.125), 5, 'thread', size=(0.03, 0.008, 0.008), hint=(0, 0, -1))
    mb.add(prim_box(0.4, 0.09, 0.12), 'leather_dk', M((0, 0.22, -0.07)), bevel=0.015)
    rivets(mb, [(-0.28, 0.3, 0.03), (0.28, 0.3, 0.03), (-0.28, -0.3, 0.03), (0.28, -0.3, 0.03)], 'iron', 0.022)
    for sx in (-1, 1):
        path = [(sx * 0.25, 0.3, 0.02), (sx * 0.27, 0.34, 0.2), (sx * 0.24, 0.1, 0.5)]
        tube(mb, path, [(0.05, 0.014)] * 3, 'leather', 6, smooth=50, up=(0, 1, 0))
    fr = mb.build(mats, parent=pack, location=(0, 0, 0))

    wb = MeshBuilder('WoodBundle')
    for (x, y, z) in ((-0.14, -0.05, -0.2), (0.14, -0.05, -0.2), (0.0, 0.18, -0.2), (0.0, -0.22, -0.2)):
        m = M((x, y, z), (0, 0, 90))
        wb.add(prim_cyl(0.115, 0.113, 0.86, 8, base=False), 'bark', m, smooth=60,
               mat_fn=lambda c, n: 'wood_end' if abs(n[0]) > 0.9 else None)
        for sgn in (-1, 1):
            wb.add(prim_cyl(0.06, 0.06, 0.006, 8, base=False), 'wood_ring', m @ M((0, sgn * 0.432, 0)), smooth=0)
    for rx in (-0.26, 0.26):
        wb.add(prim_rings([ring_h(0.0, 0.3, 0.29, 10), ring_h(0.035, 0.3, 0.29, 10)], cap0=False, cap1=False), 'rope',
               M((rx, -0.02, -0.2), (0, 0, 90)), smooth=30)
        wb.add(prim_sphere(0.045, 0.045, 0.045, 5, 2), 'rope', M((rx, 0.31, -0.2)), smooth=50)
    wood = wb.build(mats, parent=pack, location=(0, 0, 0))

    gb = MeshBuilder('GoldSack')
    sack = [ring_h(-0.30, 0.14, 0.12, 10, cz=-0.2), ring_h(-0.2, 0.28, 0.26, 10, cz=-0.2),
            ring_h(-0.02, 0.36, 0.32, 10, cz=-0.2), ring_h(0.16, 0.28, 0.25, 10, cz=-0.2),
            ring_h(0.28, 0.13, 0.12, 10, cz=-0.2), ring_h(0.31, 0.16, 0.15, 10, cz=-0.2)]
    gb.add(prim_rings(sack), 'burlap', smooth=70)
    gb.add(prim_rings([ring_h(0.25, 0.15, 0.14, 10, cz=-0.2), ring_h(0.28, 0.15, 0.14, 10, cz=-0.2)]), 'rope', smooth=40)
    stitches(gb, (-0.12, -0.05, 0.12), (0.12, -0.05, 0.12), 4, 'thread', size=(0.03, 0.008, 0.008), hint=(0, 0, 1))
    for k, (x, y, z, sc) in enumerate(((0.0, 0.34, -0.2, 0.09), (-0.09, 0.32, -0.15, 0.08), (0.09, 0.32, -0.16, 0.08),
                                       (-0.04, 0.39, -0.22, 0.07), (0.05, 0.38, -0.24, 0.07), (0.0, 0.3, -0.27, 0.075))):
        gb.add(prim_sphere(sc, sc, sc, 5, 3), 'gold', M((x, y, z), (k * 30, k * 55, k * 20)), smooth=0)
    gold = gb.build(mats, parent=pack, location=(0, 0, 0))
    return pack, fr, wood, gold


def main():
    args = C.script_args()
    C.reset_scene()
    mats = C.make_paint_set(PALETTE)
    root = C.make_empty('Peon')
    torso = build_torso(mats, root)
    C.set_rot_game(torso, (TORSO_LEAN_DEG, 0, 0))
    head = build_head(mats, torso)
    arm_l = build_arm(mats, torso, -1)
    arm_r = build_arm(mats, torso, 1)
    tg = C.make_empty('ToolGroup', TOOL_PIVOT, parent=arm_r)
    axe = build_axe(mats, tg)
    pick = build_pickaxe(mats, tg)
    ham = build_hammer(mats, tg)
    pack, frame, wood, gold = build_pack(mats, torso)
    leg_l = build_leg(mats, root, -1)
    leg_r = build_leg(mats, root, 1)
    parts = [torso, head, arm_l, arm_r, axe, pick, ham, frame, wood, gold, leg_l, leg_r]
    import bpy
    bpy.context.view_layer.update()

    C.uv_atlas(parts, weights={'Head': 1.6, 'Torso': 1.1, 'ArmL': 0.9, 'ArmR': 0.9, 'LegL': 0.8, 'LegR': 0.8,
                               'Axe': 1.0, 'Pickaxe': 0.8, 'Hammer': 0.8, 'PackFrame': 0.8, 'WoodBundle': 0.8,
                               'GoldSack': 0.9}, margin=0.007)
    img = C.bake_atlas(parts, 'peon_atlas', 512, samples=int(os.environ.get('BAKE_SAMPLES', 32)), margin=4)
    C.finalize_materials(parts, img, team_default=TEAM_DEFAULT,
                         out_png=os.path.join(C.BUILD_DIR, 'peon_atlas.png'))
    out = os.path.join(C.OUT_MODELS, 'peon.glb')
    C.export_glb(root, out)
    st = C.stats(root, out)
    print('STATS peon', st)
    if '--no-render' not in args:
        rig = C.RenderRig(root, 'peon', res=int(os.environ.get('RENDER_RES', 800)), samples=24)
        W.hide_for_render([pick, ham, wood, gold, frame], True)
        rig.render('34', (1.0, 0.95, 1.0), 30)
        rig.render('front', (0.0, 0.25, 1.0), 30)
        rig.render('back', (-0.6, 0.6, -1.0), 30)
        rig.render('side', (1.0, 0.2, 0.0), 30)
        rig.render('game', (45, 44, 45), 24, dist=78 / 1.62)
        W.hide_for_render([wood, frame], False)
        rig.render('34_madeira', (1.0, 0.95, 1.0), 30)
        rig.render('back_madeira', (-0.6, 0.6, -1.0), 30)
        W.hide_for_render([wood], True)
        W.hide_for_render([axe], True)
        W.hide_for_render([pick, gold], False)
        rig.render('34_picareta', (1.0, 0.95, 1.0), 30)
        rig.render('back_ouro', (-0.6, 0.6, -1.0), 30)
        W.hide_for_render([pick, gold, frame], True)
        W.hide_for_render([ham], False)
        rig.render('34_marreta', (1.0, 0.95, 1.0), 30)
        W.hide_for_render([axe], False)
        W.hide_for_render([ham], True)
        rig.center.z = 1.9
        rig.center.y = -0.1
        r0 = rig.radius
        rig.radius = 0.38
        rig.render('face', (0.15, 0.1, 1.0), 30)
        rig.render('face34', (0.8, 0.35, 1.0), 30)
        rig.radius = r0
        C.set_team_color('#2f63e0')
        rig.render('34_azul', (1.0, 0.95, 1.0), 30)
        C.set_team_color(TEAM_DEFAULT)


main()
