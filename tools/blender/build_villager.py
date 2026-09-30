"""
build_villager.py — Camponês humano (tipo interno `villager`) gerado 100% por script.

Uso:
  blender -b --factory-startup --python tools/blender/build_villager.py -- [--no-render]

Hierarquia PLANA (igual ao VillagerModel.js procedural; o UnitAnimator gira ToolGroup e os
braços de forma independente, então nada é aninhado):
  Villager (raiz)
  ├─ Torso  pivô (0, 1.0, 0)   túnica, avental (cor de time), cinto, bolsos
  ├─ Head   pivô (0, 1.55, 0)  rosto só em +Z, barrete de tecido (cor de time)
  ├─ ArmL / ArmR  pivô (∓0.35, 1.18, 0)  (manga arregaçada + luva de couro)
  ├─ LegL / LegR  pivô (∓0.15, 0.65, 0)
  ├─ ToolGroup pivô (0.35, 0.75, 0.2)
  │   ├─ Axe      (visível)   rot x 0.5 rad   gume para +Z
  │   ├─ Pickaxe  (oculta no jogo)
  │   └─ Hammer   (oculta no jogo)
  └─ Pack pivô (0, 1.05, -0.28)  (oculta no jogo; mochila com WoodBundle / GoldSack)
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

TORSO_PIVOT = (0.0, 1.0, 0.0)
HEAD_PIVOT = (0.0, 1.55, 0.0)
ARM_PIVOT = (0.35, 1.18, 0.0)
LEG_PIVOT = (0.15, 0.65, 0.0)
TOOL_PIVOT = (0.35, 0.75, 0.2)
PACK_PIVOT = (0.0, 1.05, -0.28)
TOOL_REST_X = math.degrees(0.5)
TEAM_DEFAULT = '#2f63e0'

PALETTE = {
    'skin': dict(base='#eab08a', var='#d99a74', var_scale=6.0, var_amt=0.5, fine=0.05, top=0.2,
                 ao=(0.2, 0.5), edge='#f8d0b0', edge_amt=0.25, edge_r=0.02),
    'cheek': dict(base='#e58f7c', var='#d97b68', var_scale=8.0, fine=0.04, top=0.2, ao=(0.2, 0.4)),
    'stubble': dict(base='#b8866a', var='#a3735a', var_scale=30.0, var_amt=1.0, fine=0.3, fine_scale=90.0,
                    top=0.15, ao=(0.2, 0.4)),
    'hair': dict(base='#5a3a20', var='#3c2412', var_scale=12.0, fine=0.18, top=0.25, ao=(0.2, 0.55),
                 edge='#8a6238', edge_amt=0.4, edge_r=0.02),
    'tunic': dict(base='#cf9f4c', var='#b58436', var_scale=7.0, var_amt=0.8, fine=0.13, fine_scale=45.0,
                  top=0.2, edge='#efcf8a', edge_amt=0.35, edge_r=0.02, ao=(0.25, 0.65), grad=(0.6, 1.7, 0.2),
                  coord='object'),
    'linen': dict(base='#e8dfc6', var='#d2c6a4', var_scale=8.0, fine=0.1, fine_scale=50.0, top=0.25,
                  edge='#fff8e2', edge_amt=0.35, edge_r=0.02, ao=(0.22, 0.6)),
    'leather': dict(base='#764525', var='#5a3218', var_scale=6.0, fine=0.13, top=0.22,
                    edge='#b47b48', edge_amt=0.6, edge_r=0.018, ao=(0.22, 0.6)),
    'leather_dk': dict(base='#4a2b16', var='#38200f', var_scale=6.0, fine=0.12, top=0.2,
                       edge='#7d5230', edge_amt=0.5, edge_r=0.018, ao=(0.22, 0.6)),
    'pants': dict(base='#7a6a52', var='#5f513c', var_scale=8.0, var_amt=0.8, fine=0.12, fine_scale=40.0, top=0.2,
                  edge='#a08c6c', edge_amt=0.35, edge_r=0.02, ao=(0.25, 0.65), grad=(0.0, 0.9, 0.25)),
    'patch_a': dict(base='#5f7a95', var='#4c647e', var_scale=10.0, fine=0.1, top=0.2,
                    edge='#9db6cf', edge_amt=0.4, edge_r=0.015, ao=(0.2, 0.5)),
    'patch_b': dict(base='#94513c', var='#7d4130', var_scale=10.0, fine=0.1, top=0.2,
                    edge='#cf8a70', edge_amt=0.4, edge_r=0.015, ao=(0.2, 0.5)),
    'thread': dict(base='#f0e4c0', var='#d9c896', fine=0.05, top=0.1),
    'brass': dict(base='#e6aa2a', var='#c58a18', var_scale=9.0, var_amt=0.7, fine=0.06, top=0.4,
                  edge='#fff0a8', edge_amt=1.0, edge_r=0.014, edge_gain=12.0, ao=(0.15, 0.45)),
    'iron': dict(base='#4a505d', var='#363b46', var_scale=7.0, var_amt=0.8, fine=0.14, top=0.35,
                 edge='#c3cad6', edge_amt=0.9, edge_r=0.015, edge_gain=12.0, ao=(0.2, 0.55)),
    'steel': dict(base='#a4aebd', var='#7f8998', var_scale=9.0, fine=0.1, top=0.35,
                  edge='#f4f8ff', edge_amt=1.0, edge_r=0.014, edge_gain=13.0, ao=(0.18, 0.4)),
    'blade': dict(base='#8f9aab', var='#727d8e', var_scale=6.0, fine=0.1, top=0.4,
                  edge='#ffffff', edge_amt=1.0, edge_r=0.02, edge_gain=14.0, ao=(0.15, 0.4)),
    'wood': dict(base='#83592f', var='#63421f', var_scale=5.0, fine=0.1, coord='object',
                 streaks=(40.0, 2.0, 0.22), edge='#b98c58', edge_amt=0.4, edge_r=0.012, ao=(0.2, 0.5)),
    'bark': dict(base='#5f4128', var='#3f2a17', var_scale=9.0, var_amt=1.0, fine=0.22, fine_scale=30.0,
                 coord='object', streaks=(30.0, 3.0, 0.35), top=0.22, edge='#8f6a44', edge_amt=0.4,
                 edge_r=0.02, ao=(0.2, 0.6)),
    'wood_end': dict(base='#e0bc7c', var='#c79c5c', var_scale=14.0, var_amt=1.0, fine=0.12, top=0.3,
                     ao=(0.2, 0.4)),
    'wood_ring': dict(base='#a87c44', var='#8c6232', var_scale=20.0, fine=0.1, top=0.2),
    'rope': dict(base='#d2ac74', var='#b08b54', var_scale=40.0, var_amt=1.0, fine=0.2, fine_scale=80.0, top=0.25,
                 edge='#f0d4a0', edge_amt=0.4, edge_r=0.01, ao=(0.15, 0.5)),
    'burlap': dict(base='#bd9d62', var='#9a7c48', var_scale=14.0, var_amt=1.0, fine=0.22, fine_scale=70.0,
                   top=0.25, edge='#e2c88e', edge_amt=0.4, edge_r=0.02, ao=(0.25, 0.65)),
    'gold': dict(base='#ffcc33', var='#e8a11a', var_scale=20.0, var_amt=1.0, fine=0.08, top=0.5,
                 edge='#fff6b0', edge_amt=1.0, edge_r=0.012, edge_gain=12.0, ao=(0.15, 0.4), emit_boost=1.1),
    'sole': dict(base='#2d211a', var='#1f1611', fine=0.1, top=0.1, ao=(0.15, 0.5)),
    'eye_white': dict(base='#f3efe4', var='#e2dccb', top=0.1),
    'iris': dict(base='#7c4a1c', var='#5b3411', var_scale=30.0),
    'pupil': dict(base='#170e08', var='#0e0805'),
    'mouth': dict(base='#7d3a2e', var='#5a271f'),
    'cap_band': dict(base='#e2d6b4', var='#c8b98f', var_scale=9.0, fine=0.1, fine_scale=45.0, top=0.25,
                     edge='#fff5d6', edge_amt=0.35, edge_r=0.02, ao=(0.2, 0.55)),
    'team': dict(base='#b8b0a4', var='#9d9589', var_scale=5.0, fine=0.1, fine_scale=45.0, top=0.25,
                 edge='#d8d2c8', edge_amt=0.3, edge_r=0.03, ao=(0.3, 0.65), team=True),
}


def jag_ring(ring, amp=0.03):
    return [(x, y + (amp if i % 2 else -amp * 0.4), z) for i, (x, y, z) in enumerate(ring)]


# ---------------------------------------------------------------------------
def build_torso(mats, root):
    mb = MeshBuilder('Torso')
    # túnica de lã ocre: loft do quadril ao pescoço (barra irregular)
    rings = [
        jag_ring(ring_h(-0.37, 0.320, 0.235, 14, cz=0.00), 0.035),
        ring_h(-0.22, 0.290, 0.215, 14, cz=0.01),
        ring_h(-0.06, 0.270, 0.208, 14, cz=0.02),
        ring_h(0.10, 0.285, 0.205, 14, cz=0.01),
        ring_h(0.22, 0.305, 0.190, 14, cz=-0.01),
        ring_h(0.29, 0.235, 0.150, 14, cz=0.00),
        ring_h(0.33, 0.130, 0.110, 14, cz=0.01),
    ]
    mb.add(prim_rings(rings), 'tunic', smooth=75)
    # pescoço + gola de linho aberta (V) + cordinhas
    tube(mb, [(0, 0.27, 0.01), (0, 0.34, 0.02), (0, 0.41, 0.02)], [0.098, 0.088, 0.084], 'skin', 10, smooth=70)
    mb.add(prim_rings([ring_h(0.285, 0.170, 0.135, 12, cz=0.005), ring_h(0.335, 0.140, 0.118, 12, cz=0.012),
                       ring_h(0.36, 0.128, 0.11, 12, cz=0.015)], cap0=False, cap1=False), 'linen', smooth=50)
    # V do decote (pele) na frente
    mb.add(prim_box(0.10, 0.11, 0.03, taper=(0.15, 1.0)), 'skin', M((0, 0.27, 0.13), (-12, 0, 0)), bevel=0.005)
    for sx in (-1, 1):
        mb.add(prim_box(0.055, 0.15, 0.03), 'linen', M((sx * 0.055, 0.28, 0.145), (-10, 0, sx * -24)), bevel=0.008)
    stitches(mb, (-0.055, 0.19, 0.155), (0.055, 0.19, 0.155), 3, 'leather_dk', size=(0.02, 0.008, 0.008))
    # ombros: costura da cava (fios de linha)

    # avental de tecido (cor de time): peitilho + saia, com dobras
    mb.add(cloth_panel((-0.135, 0.205, 0.198), (0.135, 0.205, 0.198), (-0.20, -0.12, 0.222), (0.20, -0.12, 0.222),
                       nx=4, ny=3, thick=0.03, bulge=(0, 0, 0.012), wave=0.006, jag=0.0), 'team', smooth=45)
    mb.add(cloth_panel((-0.20, -0.14, 0.235), (0.20, -0.14, 0.235), (-0.245, -0.55, 0.265), (0.245, -0.55, 0.265),
                       nx=5, ny=4, thick=0.03, bulge=(0, 0, 0.04), wave=0.02, jag=0.03), 'team', smooth=50)
    # bainha do avental (fita de linho) + costuras
    # bolso de couro com pontos, lápis e chave
    mb.add(prim_box(0.20, 0.13, 0.03, taper=(1.0, 1.0)), 'leather', M((0, -0.02, 0.222)), bevel=0.008)
    mb.add(prim_box(0.21, 0.035, 0.036), 'leather_dk', M((0, 0.035, 0.226)), bevel=0.006)
    stitches(mb, (-0.085, -0.075, 0.24), (0.085, -0.075, 0.24), 5, 'thread', size=(0.024, 0.007, 0.007))
    mb.add(prim_box(0.022, 0.15, 0.022), 'wood', M((0.06, 0.06, 0.226), (0, 0, 10)), bevel=0.004)
    mb.add(prim_cone(0.014, 0.05, 4), 'iron', M((0.078, 0.145, 0.226), (0, 0, 10)))
    mb.add(prim_box(0.05, 0.12, 0.02), 'linen', M((-0.05, 0.03, 0.238), (0, 0, -8)), bevel=0.005)  # trapo
    # alças de couro sobre os ombros (cruzam nas costas) + fivelas de latão
    for sx in (-1, 1):
        path = [(sx * 0.115, 0.15, 0.202), (sx * 0.125, 0.25, 0.188), (sx * 0.145, 0.305, 0.05),
                (sx * 0.13, 0.27, -0.13), (sx * 0.09, 0.14, -0.225), (-sx * 0.02, -0.02, -0.232),
                (-sx * 0.11, -0.10, -0.23)]
        tube(mb, path, [(0.036, 0.011)] * 7, 'leather', 6, smooth=50, up=(0, 1, 0))
        mb.add(prim_box(0.065, 0.045, 0.028), 'brass', M((sx * 0.115, 0.17, 0.212)), bevel=0.008)
        mb.add(prim_box(0.04, 0.02, 0.03), 'leather_dk', M((sx * 0.115, 0.17, 0.222)), bevel=0.004)
        rivets(mb, [(sx * 0.115, 0.1, 0.212)], 'brass', 0.014)
    # cinto largo + fivela grande (com pino) e furos
    mb.add(prim_rings([jag_ring(ring_h(-0.205, 0.286, 0.222, 16, cz=0.01), 0.0),
                       ring_h(-0.08, 0.288, 0.224, 16, cz=0.01)]), 'leather', smooth=45)
    mb.add(prim_box(0.13, 0.115, 0.036), 'brass', M((0, -0.145, 0.245)), bevel=0.012)
    mb.add(prim_box(0.075, 0.062, 0.04), 'leather_dk', M((0, -0.145, 0.252)), bevel=0.006)
    mb.add(prim_box(0.02, 0.09, 0.02), 'brass', M((0, -0.145, 0.275)), bevel=0.004)
    for sx in (-1, 1):
        for k in range(2):
            mb.add(prim_sphere(0.012, 0.012, 0.008, 5, 3), 'leather_dk',
                   M((sx * (0.11 + k * 0.03), -0.145, 0.248)), smooth=60)
    # bolsa de couro no quadril direito (com aba, fivela e cordão)
    mb.add(prim_box(0.115, 0.14, 0.10, taper=(0.95, 0.95)), 'leather', M((0.315, -0.20, 0.06), (0, 0, -8)),
           bevel=0.016, smooth=25)
    mb.add(prim_box(0.125, 0.07, 0.11), 'leather_dk', M((0.32, -0.13, 0.062), (0, 0, -8)), bevel=0.012)
    rivets(mb, [(0.316, -0.155, 0.118)], 'brass', 0.016)
    stitches(mb, (0.26, -0.26, 0.112), (0.36, -0.28, 0.112), 4, 'thread', size=(0.02, 0.007, 0.007))
    # alça de ferramentas (esquerda) com cunha e martelinho
    mb.add(prim_box(0.075, 0.12, 0.06), 'leather', M((-0.315, -0.19, 0.06), (0, 0, 8)), bevel=0.012)
    mb.add(prim_cone(0.03, 0.15, 4), 'iron', M((-0.318, -0.34, 0.06), (0, 45, 178)), smooth=0)
    mb.add(prim_box(0.02, 0.17, 0.02), 'wood', M((-0.29, -0.27, 0.085), (0, 0, 8)), bevel=0.004)
    mb.add(prim_box(0.08, 0.04, 0.045), 'iron', M((-0.283, -0.19, 0.085)), bevel=0.008)
    # remendo de pano no flanco + costuras (desgaste) e remendo nas costas
    mb.add(prim_box(0.10, 0.10, 0.012), 'patch_a', M((-0.19, -0.27, 0.205), (0, 0, 8)), bevel=0.003)
    stitches(mb, (-0.235, -0.22, 0.213), (-0.145, -0.215, 0.213), 4, 'thread', size=(0.02, 0.006, 0.006))
    mb.add(prim_box(0.12, 0.13, 0.014), 'patch_b', M((0.06, 0.05, -0.208), (0, 0, -6)), bevel=0.003)
    stitches(mb, (0.0, 0.115, -0.216), (0.12, 0.10, -0.216), 4, 'thread', size=(0.022, 0.006, 0.006))
    stitches(mb, (0.0, -0.014, -0.216), (0.12, -0.03, -0.216), 4, 'thread', size=(0.022, 0.006, 0.006))
    # laço do avental atrás (nó + duas pontas em cor de time)
    mb.add(prim_sphere(0.04, 0.035, 0.03, 6, 3), 'team', M((0, -0.12, -0.235)), smooth=60)
    for sx in (-1, 1):
        mb.add(prim_box(0.06, 0.20, 0.018, taper=(0.7, 1.0)), 'team',
               M((sx * 0.05, -0.24, -0.238), (10, 0, sx * -14)), bevel=0.004)
    mb.add(prim_rings([ring_h(-0.09, 0.283, 0.220, 16, cz=0.0), ring_h(-0.11, 0.285, 0.222, 16, cz=0.0)],
                      cap0=False, cap1=False), 'leather_dk', smooth=30)
    return mb.build(mats, parent=root, location=TORSO_PIVOT)


def build_head(mats, root):
    mb = MeshBuilder('Head')
    # crânio/rosto: esfera achatada (traços só na frente +Z)
    mb.add(prim_sphere(0.168, 0.185, 0.172, 12, 6), 'skin', M((0, -0.02, 0.008)), smooth=80)
    # queixo e mandíbula levemente marcados
    mb.add(prim_sphere(0.115, 0.075, 0.105, 10, 4), 'skin', M((0, -0.125, 0.06)), smooth=80)
    # olhos: branco + íris âmbar + pupila + brilho
    for sx in (-1, 1):
        mb.add(prim_sphere(0.038, 0.033, 0.014, 8, 3), 'eye_white', M((sx * 0.066, 0.005, 0.166), (0, sx * 8, 0)),
               smooth=80)
        mb.add(prim_sphere(0.024, 0.025, 0.008, 8, 2), 'iris', M((sx * 0.063, 0.003, 0.178), (0, sx * 6, 0)), smooth=80)
        mb.add(prim_sphere(0.012, 0.013, 0.006, 6, 2), 'pupil', M((sx * 0.063, 0.003, 0.185)), smooth=80)
        mb.add(prim_sphere(0.005, 0.005, 0.004, 4, 2), 'eye_white', M((sx * 0.055, 0.012, 0.19)), smooth=80)
        # pálpebra superior sutil
        mb.add(prim_box(0.075, 0.014, 0.02), 'skin', M((sx * 0.066, 0.033, 0.168), (0, 0, sx * -6)), bevel=0.004)
        # sobrancelha espessa (levemente arqueada, amigável)
        mb.add(prim_box(0.088, 0.03, 0.03, taper=(0.9, 0.8)), 'hair',
               M((sx * 0.07, 0.062, 0.167), (-8, sx * 8, sx * -10)), bevel=0.008)
        # bochecha corada
        mb.add(prim_sphere(0.045, 0.032, 0.022, 6, 2), 'cheek', M((sx * 0.105, -0.07, 0.14), (0, sx * 30, 0)),
               smooth=80)
    # nariz batatudo: ponte + bulbo + narinas
    mb.add(prim_box(0.035, 0.08, 0.04, taper=(0.75, 0.8)), 'skin', M((0, -0.012, 0.172), (-6, 0, 0)), bevel=0.008)
    mb.add(prim_sphere(0.043, 0.036, 0.04, 8, 4), 'skin', M((0, -0.058, 0.192)), smooth=80)
    for sx in (-1, 1):
        mb.add(prim_sphere(0.017, 0.013, 0.014, 5, 3), 'skin', M((sx * 0.032, -0.07, 0.178)), smooth=70)
    # sorriso: arco de boca + covinhas
    smile = bezier((-0.062, -0.108, 0.166), (0.0, -0.138, 0.18), (0.062, -0.108, 0.166), 6)
    tube(mb, smile, [0.008] * 7, 'mouth', 5, smooth=60, up=(0, 0, 1))
    for sx in (-1, 1):
        mb.add(prim_sphere(0.010, 0.010, 0.008, 5, 3), 'mouth', M((sx * 0.068, -0.103, 0.163)), smooth=60)
    # barba por fazer no queixo (só na frente) + bigode
    mb.add(prim_sphere(0.100, 0.055, 0.06, 10, 3, y_max=0.3), 'stubble', M((0, -0.148, 0.098)), smooth=80)
    for sx in (-1, 1):
        tube(mb, [(sx * 0.008, -0.088, 0.187), (sx * 0.05, -0.09, 0.178), (sx * 0.085, -0.104, 0.16)],
             [0.017, 0.014, 0.006], 'hair', 5, smooth=70, cap1=False)
    # orelhas
    for sx in (-1, 1):
        mb.add(prim_sphere(0.028, 0.05, 0.038, 8, 4), 'skin', M((sx * 0.168, -0.01, 0.0), (0, 0, sx * -8)), smooth=70)
    # cabelo desgrenhado saindo do barrete: tufos laterais e nuca
    for sx in (-1, 1):
        mb.add(prim_box(0.06, 0.12, 0.15, taper=(0.5, 0.9)), 'hair', M((sx * 0.155, 0.055, 0.03), (0, 0, sx * 20)),
               bevel=0.012, smooth=30)
    mb.add(prim_sphere(0.165, 0.10, 0.14, 10, 3, y_max=0.4), 'hair', M((0, -0.02, -0.05)), smooth=70)
    mb.add(prim_box(0.22, 0.05, 0.05), 'hair', M((0, -0.085, -0.15), (10, 0, 0)), smooth=25)
    # barrete de feltro (cor de time), tombado para o lado, com aba de linho e ilhoses de latão
    CAPY = 0.135
    cap_rings = [
        ring_h(CAPY + 0.00, 0.192, 0.202, 14, cz=0.0),
        ring_h(CAPY + 0.05, 0.226, 0.236, 14, cx=-0.005, cz=-0.01),
        ring_h(CAPY + 0.10, 0.242, 0.250, 14, cx=-0.01, cz=-0.02),
        ring_h(CAPY + 0.145, 0.216, 0.224, 14, cx=-0.02, cz=-0.03),
        ring_h(CAPY + 0.178, 0.130, 0.138, 14, cx=-0.03, cz=-0.04),
        ring_h(CAPY + 0.192, 0.045, 0.05, 14, cx=-0.04, cz=-0.05),
    ]
    mb.add(prim_rings(cap_rings, cap0=False), 'team', smooth=70)
    # ponta caída (aba mole) para trás e para o lado, com pompom de linho
    tube(mb, [(-0.04, CAPY + 0.185, -0.05), (-0.11, CAPY + 0.215, -0.10), (-0.18, CAPY + 0.17, -0.17),
              (-0.215, CAPY + 0.09, -0.20)], [0.06, 0.05, 0.038, 0.026], 'team', 7, smooth=70)
    mb.add(prim_sphere(0.032, 0.032, 0.032, 6, 3), 'cap_band', M((-0.22, CAPY + 0.075, -0.205)), smooth=60)
    # barra de linho (dobra) com costura e ilhoses
    mb.add(prim_rings([ring_h(CAPY - 0.06, 0.197, 0.207, 14), ring_h(CAPY + 0.02, 0.205, 0.215, 14)]),
           'cap_band', smooth=45)
    mb.add(prim_rings([ring_h(CAPY + 0.02, 0.205, 0.215, 14), ring_h(CAPY + 0.035, 0.199, 0.209, 14)],
                      cap0=False, cap1=False), 'leather', smooth=35)
    for k in range(7):
        a_ = math.radians(-60 + k * 20)
        mb.add(prim_sphere(0.012, 0.012, 0.008, 5, 2), 'brass',
               M((math.sin(a_) * 0.207, CAPY - 0.02, math.cos(a_) * 0.217)), smooth=60)
    return mb.build(mats, parent=root, location=HEAD_PIVOT)


def glove(mb, s, c, grip=True):
    """Mão de luva (couro) — c = centro do punho."""
    x, y, z = c
    mb.add(prim_box(0.115, 0.115, 0.12, taper=(0.95, 0.9)), 'leather', M((x, y, z)), bevel=0.02, smooth=30)
    if grip:  # dedos enrolados no cabo (proa frontal)
        for k in range(4):
            mb.add(prim_box(0.108, 0.026, 0.06), 'leather', M((x, y + 0.042 - k * 0.028, z + 0.07)), bevel=0.006,
                   smooth=25)
        mb.add(prim_box(0.05, 0.075, 0.06), 'leather', M((x - s * 0.06, y + 0.02, z + 0.035), (0, 0, s * 18)),
               bevel=0.012, smooth=25)
    else:
        for k in range(3):
            mb.add(prim_box(0.03, 0.075, 0.05), 'leather', M((x + (k - 1) * 0.036, y - 0.075, z + 0.02), (10, 0, 0)),
                   bevel=0.006, smooth=25)
        mb.add(prim_box(0.05, 0.07, 0.05), 'leather', M((x - s * 0.07, y - 0.02, z + 0.03), (0, 0, s * 25)),
               bevel=0.01, smooth=25)


def build_arm(mats, root, side):
    s = side
    mb = MeshBuilder('ArmR' if s > 0 else 'ArmL')
    # ombro/manga de lã ocre, dobra arregaçada com friso
    mb.add(prim_sphere(0.108, 0.105, 0.108, 9, 4), 'tunic', M((s * 0.02, -0.03, 0.0)), smooth=75)
    tube(mb, [(s * 0.02, -0.03, 0.0), (s * 0.02, -0.14, 0.01), (s * 0.02, -0.20, 0.02)], [0.098, 0.096, 0.094],
         'tunic', 10, smooth=75, cap0=False)
    mb.add(prim_rings([ring_h(-0.19, 0.108, 0.108, 10, cx=s * 0.02, cz=0.02), ring_h(-0.215, 0.116, 0.116, 10, cx=s * 0.02, cz=0.022),
                       ring_h(-0.245, 0.104, 0.104, 10, cx=s * 0.02, cz=0.026)]), 'tunic', smooth=60)
    stitches(mb, (s * 0.02 - 0.12, -0.215, 0.02), (s * 0.02 + 0.12, -0.215, 0.02), 1, 'thread')
    # antebraço nu com pelinhos (pele)
    if s > 0:
        fa = [(s * 0.02, -0.24, 0.025), (s * 0.02, -0.31, 0.075), (s * 0.02, -0.365, 0.135)]
        wrist = (s * 0.02, -0.395, 0.17)
        hand_c = (s * 0.02, -0.43, 0.20)
    else:
        fa = [(s * 0.02, -0.24, 0.025), (s * 0.02, -0.32, 0.06), (s * 0.02, -0.385, 0.09)]
        wrist = (s * 0.02, -0.41, 0.105)
        hand_c = (s * 0.02, -0.475, 0.115)
    tube(mb, fa, [0.088, 0.078, 0.07], 'skin', 9, smooth=75)
    # punho da luva de couro (cano largo) com tira e ilhós
    cuff = [fa[2], wrist]
    tube(mb, cuff, [0.088, 0.09], 'leather_dk', 9, smooth=40)
    mb.add(prim_box(0.02, 0.05, 0.05), 'brass', M((s * 0.02 + s * 0.09, wrist[1] + 0.012, wrist[2] - 0.02)), bevel=0.005)
    glove(mb, s, hand_c, grip=(s > 0))
    return mb.build(mats, parent=root, location=(s * ARM_PIVOT[0], ARM_PIVOT[1], ARM_PIVOT[2]))


def build_leg(mats, root, side):
    s = side
    mb = MeshBuilder('LegR' if s > 0 else 'LegL')
    # calça de tecido rústico (remendos e costuras), dobra para dentro da bota
    tube(mb, [(0, -0.03, 0), (s * 0.003, -0.20, 0.012), (s * 0.006, -0.34, 0.01)],
         [(0.112, 0.115), (0.108, 0.112), (0.094, 0.098)], 'pants', 10, smooth=75, cap0=False)
    # remendos: joelho (couro) + coxa (pano) com pontos
    mb.add(prim_box(0.115, 0.115, 0.03), 'patch_a', M((s * 0.006, -0.25, 0.102), (-4, 0, s * 4)), bevel=0.006)
    stitches(mb, (s * 0.006 - 0.05, -0.30, 0.118), (s * 0.006 + 0.05, -0.30, 0.118), 4, 'thread', size=(0.018, 0.006, 0.006))
    stitches(mb, (s * 0.006 - 0.05, -0.20, 0.118), (s * 0.006 + 0.05, -0.20, 0.118), 4, 'thread', size=(0.018, 0.006, 0.006))
    mb.add(prim_box(0.075, 0.075, 0.02), 'patch_b', M((s * 0.075, -0.11, 0.08), (0, 25, s * -8)), bevel=0.004)
    # bota: cano de couro + dobra + tira com fivela
    tube(mb, [(s * 0.006, -0.36, 0.01), (s * 0.006, -0.47, 0.01), (s * 0.008, -0.56, 0.015)],
         [(0.104, 0.108), (0.092, 0.094), (0.084, 0.086)], 'leather', 10, smooth=60)
    mb.add(prim_rings([ring_h(-0.40, 0.119, 0.122, 12, cx=s * 0.006, cz=0.01),
                       ring_h(-0.345, 0.122, 0.125, 12, cx=s * 0.006, cz=0.01)]), 'leather_dk', smooth=40)
    stitches(mb, (s * 0.006 - 0.10, -0.372, 0.13), (s * 0.006 + 0.10, -0.372, 0.13), 5, 'thread',
             size=(0.02, 0.006, 0.006))
    mb.add(prim_rings([ring_h(-0.505, 0.096, 0.098, 12, cx=s * 0.008, cz=0.012),
                       ring_h(-0.53, 0.098, 0.1, 12, cx=s * 0.008, cz=0.012)]), 'leather_dk', smooth=40)
    mb.add(prim_box(0.03, 0.04, 0.02), 'brass', M((s * 0.008 + s * 0.097, -0.517, 0.02)), bevel=0.004)
    # pé: corpo + biqueira arredondada + sola grossa com salto
    mb.add(prim_box(0.16, 0.085, 0.26, taper=(0.86, 0.7), base=True), 'leather', M((s * 0.008, -0.6, 0.06)),
           bevel=0.022, smooth=35)
    mb.add(prim_sphere(0.078, 0.05, 0.075, 8, 4, y_min=0.0), 'leather_dk', M((s * 0.008, -0.585, 0.175)), smooth=60)
    mb.add(prim_box(0.18, 0.045, 0.31, taper=(0.9, 0.85), base=True), 'sole', M((s * 0.008, -0.65, 0.05)),
           bevel=0.012, smooth=25)
    for k in range(3):
        mb.add(prim_box(0.10, 0.012, 0.014), 'thread', M((s * 0.008, -0.55 + k * 0.0, 0.14 - k * 0.0 + 0.0)))
    return mb.build(mats, parent=root, location=(s * LEG_PIVOT[0], LEG_PIVOT[1], LEG_PIVOT[2]))


# ---------------------------------------------------------------------------
def build_axe(mats, tg):
    """Machado do lenhador: cabo curvo de freixo, lâmina larga com gume polido para +Z."""
    mb = MeshBuilder('Axe')
    path = [(0, -0.44, -0.035), (0, -0.22, 0.0), (0, 0.04, 0.02), (0, 0.24, 0.005), (0, 0.38, -0.01)]
    tube(mb, path, [0.030, 0.026, 0.026, 0.027, 0.03], 'wood', 8, smooth=60)
    mb.add(prim_cyl(0.041, 0.031, 0.075, 8, base=False), 'leather_dk', M((0, -0.43, -0.033)), smooth=40)
    mb.add(prim_cyl(0.036, 0.036, 0.25, 8, base=False), 'leather', M((0, -0.03, 0.02)), smooth=40)
    for k in range(2):  # anéis de couro
        mb.add(prim_cyl(0.039, 0.039, 0.014, 7, base=False), 'leather_dk', M((0, -0.10 + k * 0.11, 0.02)), smooth=30)
    mb.add(prim_cyl(0.042, 0.036, 0.075, 8, base=False), 'iron', M((0, 0.31, -0.004)), smooth=30)
    H = (0, 0.37, -0.01)
    mb.add(prim_box(0.075, 0.13, 0.11), 'iron', M(H), bevel=0.012)      # olho do machado
    mb.add(prim_box(0.028, 0.012, 0.055), 'steel', M((0, 0.44, -0.01)), bevel=0.003)  # cunha
    body = [(0.05, 0.07), (0.13, 0.115), (0.24, 0.16), (0.30, 0.20), (0.325, 0.09), (0.33, -0.02),
            (0.315, -0.11), (0.29, -0.19), (0.20, -0.145), (0.11, -0.11), (0.05, -0.065)]
    verts, faces = extrude_tapered(body, 0.045, lambda z, y: 1.0 - max(0.0, (z - 0.05) / 0.28) * 0.85)
    mb.add((verts, faces), 'blade', M((0, H[1], H[2])), bevel=0.006)
    edge = [(0.26, 0.17), (0.30, 0.20), (0.325, 0.09), (0.33, -0.02), (0.315, -0.11), (0.29, -0.19), (0.26, -0.165),
            (0.285, -0.11), (0.30, -0.02), (0.295, 0.08)]
    verts, faces = extrude_tapered(edge, 0.03, lambda z, y: 1.0 - max(0.0, (z - 0.26) / 0.08) * 0.9)
    mb.add((verts, faces), 'steel', M((0, H[1], H[2])))
    # cabeça de trás (martelo) e cicatrizes de uso
    mb.add(prim_box(0.06, 0.09, 0.07), 'iron', M((0, H[1] + 0.005, H[2] - 0.075)), bevel=0.01)
    for (z, y) in ((0.325, 0.03), (0.32, -0.08)):
        mb.add(prim_box(0.02, 0.02, 0.02), 'wood_ring', M((0, H[1] + y, H[2] + z), (0, 0, 45)))
    rivets(mb, [(0.026, H[1] + 0.02, H[2] + 0.11), (-0.026, H[1] + 0.02, H[2] + 0.11)], 'brass', 0.011)
    ax = mb.build(mats, parent=tg, location=(0, 0, 0))
    C.set_rot_game(ax, (TOOL_REST_X, 0, 0))
    return ax


def build_pickaxe(mats, tg):
    mb = MeshBuilder('Pickaxe')
    mb.add(prim_cyl(0.028, 0.032, 0.9, 8, base=False), 'wood', M((0, 0.0, 0)), smooth=55)
    mb.add(prim_cyl(0.037, 0.037, 0.22, 8, base=False), 'leather', M((0, -0.04, 0)), smooth=40)
    for k in range(2):
        mb.add(prim_cyl(0.04, 0.04, 0.014, 7, base=False), 'leather_dk', M((0, -0.10 + k * 0.11, 0)), smooth=30)
    mb.add(prim_cyl(0.034, 0.04, 0.08, 8, base=False), 'leather_dk', M((0, -0.44, 0)), smooth=40)
    H = 0.37
    mb.add(prim_cyl(0.04, 0.036, 0.09, 8, base=False), 'iron', M((0, 0.31, 0)), smooth=30)
    mb.add(prim_box(0.085, 0.10, 0.09), 'iron', M((0, H, 0)), bevel=0.012)
    top = [(-0.44, -0.075), (-0.36, -0.03), (-0.24, 0.02), (-0.1, 0.055), (0.0, 0.062), (0.1, 0.055), (0.24, 0.02),
           (0.36, -0.03), (0.44, -0.075)]
    bot = [(0.32, -0.035), (0.2, 0.0), (0.09, -0.04), (-0.09, -0.04), (-0.2, 0.0), (-0.32, -0.035)]
    poly = top + bot
    verts, faces = extrude_tapered(poly, 0.05, lambda z, y: 1.0 - (abs(z) / 0.44) ** 2 * 0.86)
    mb.add((verts, faces), 'iron', M((0, H, 0)), bevel=0.006)
    for sz in (-1, 1):  # pontas polidas
        tp = [(sz * 0.30, -0.02), (sz * 0.44, -0.075), (sz * 0.34, -0.035)]
        tip = [(sz * 0.29, 0.0), (sz * 0.36, -0.03), (sz * 0.445, -0.076), (sz * 0.40, -0.06), (sz * 0.30, -0.02)]
        if sz < 0:
            tip = list(reversed(tip))
        verts, faces = extrude_tapered(tip, 0.032, lambda z, y: 1.0 - (abs(z) - 0.28) / 0.17 * 0.9)
        mb.add((verts, faces), 'steel', M((0, H, 0)))
        mb.add(prim_box(0.06, 0.05, 0.03), 'iron', M((0, H - 0.005, sz * 0.055)), bevel=0.006)
    rivets(mb, [(0.03, H + 0.025, 0.02), (-0.03, H + 0.025, 0.02)], 'brass', 0.012)
    pk = mb.build(mats, parent=tg, location=(0, 0, 0))
    C.set_rot_game(pk, (TOOL_REST_X, 0, 0))
    return pk


def build_hammer(mats, tg):
    mb = MeshBuilder('Hammer')
    mb.add(prim_cyl(0.03, 0.033, 0.78, 8, base=False), 'wood', M((0, 0.0, 0)), smooth=45)
    mb.add(prim_cyl(0.038, 0.038, 0.24, 8, base=False), 'leather', M((0, -0.03, 0)), smooth=40)
    for k in range(2):
        mb.add(prim_cyl(0.041, 0.041, 0.014, 7, base=False), 'leather_dk', M((0, -0.10 + k * 0.11, 0)), smooth=30)
    mb.add(prim_sphere(0.04, 0.03, 0.04, 6, 4), 'leather_dk', M((0, -0.40, 0)), smooth=60)
    H = 0.31
    mb.add(prim_box(0.13, 0.15, 0.24), 'iron', M((0, H, 0)), bevel=0.014)            # corpo do martelo
    for sz in (-1, 1):  # faces de bater e placas laterais
        mb.add(prim_box(0.15, 0.17, 0.045, taper=(0.95, 1.0)), 'steel', M((0, H, sz * 0.14)), bevel=0.012)
        mb.add(prim_box(0.10, 0.10, 0.012), 'steel', M((0, H, sz * 0.166)), bevel=0.003)
    for sx in (-1, 1):
        mb.add(prim_box(0.014, 0.10, 0.17), 'steel', M((sx * 0.072, H, 0)), bevel=0.004)
        rivets(mb, [(sx * 0.082, H + 0.03, -0.05), (sx * 0.082, H + 0.03, 0.05), (sx * 0.082, H - 0.03, -0.05),
                    (sx * 0.082, H - 0.03, 0.05)], 'brass', 0.011)
    mb.add(prim_cyl(0.045, 0.04, 0.05, 8, base=False), 'iron', M((0, H - 0.09, 0)), smooth=30)
    mb.add(prim_box(0.028, 0.012, 0.06), 'steel', M((0, H + 0.09, 0)), bevel=0.003)
    hm = mb.build(mats, parent=tg, location=(0, 0, 0))
    C.set_rot_game(hm, (TOOL_REST_X, 0, 0))
    return hm


# ---------------------------------------------------------------------------
def build_pack(mats, root):
    pack = C.make_empty('Pack', PACK_PIVOT, parent=root)
    mb = MeshBuilder('PackFrame')
    for fx in (-0.18, 0.18):
        mb.add(prim_box(0.035, 0.62, 0.035), 'wood', M((fx, 0.0, 0.04)), bevel=0.006, smooth=20)
    for fy in (-0.22, 0.0, 0.22):
        mb.add(prim_box(0.40, 0.032, 0.035), 'wood', M((0, fy, 0.04)), bevel=0.006)
    mb.add(prim_box(0.36, 0.40, 0.20, taper=(0.92, 0.9)), 'linen', M((0, -0.08, -0.06)), bevel=0.03, smooth=35)
    mb.add(prim_box(0.30, 0.14, 0.06), 'leather', M((0, -0.10, -0.175)), bevel=0.015)   # bolso externo
    stitches(mb, (-0.12, -0.05, -0.208), (0.12, -0.05, -0.208), 5, 'thread', size=(0.024, 0.007, 0.007))
    mb.add(prim_box(0.38, 0.14, 0.22), 'leather', M((0, 0.09, -0.06)), bevel=0.02, smooth=30)   # aba
    mb.add(prim_box(0.05, 0.10, 0.03), 'leather_dk', M((0, 0.04, -0.175)), bevel=0.006)
    rivets(mb, [(0, 0.015, -0.185)], 'brass', 0.016)
    mb.add(prim_cyl(0.075, 0.075, 0.46, 10, base=False), 'linen', M((0, 0.26, -0.03), (0, 0, 90)), smooth=60)
    for bx in (-0.14, 0.14):
        mb.add(prim_cyl(0.083, 0.083, 0.03, 10, base=False), 'leather', M((bx, 0.26, -0.03), (0, 0, 90)), smooth=40)
    # alças de ombro
    for sx in (-1, 1):
        path = [(sx * 0.13, 0.15, -0.03), (sx * 0.135, 0.27, 0.02), (sx * 0.14, 0.30, 0.20), (sx * 0.125, 0.22, 0.42)]
        tube(mb, path, [(0.038, 0.012)] * 4, 'leather', 6, smooth=50, up=(0, 1, 0))
    fr = mb.build(mats, parent=pack, location=(0, 0, 0))

    # feixe de lenha: 3 toras com anéis de crescimento, cascas ásperas e cordas de cânhamo
    wb = MeshBuilder('WoodBundle')
    for (x, y, z, rz) in ((-0.11, -0.10, -0.16, 88), (0.11, -0.10, -0.16, 92), (0.0, 0.085, -0.18, 90)):
        m = M((x, y, z), (0, 0, rz))
        wb.add(prim_cyl(0.105, 0.103, 0.86, 8, base=False), 'bark', m, smooth=60,
               mat_fn=lambda c, n: 'wood_end' if abs(n[0]) > 0.9 else None)
        for sgn in (-1, 1):
            wb.add(prim_cyl(0.055, 0.055, 0.006, 8, base=False), 'wood_ring',
                   m @ M((0, sgn * 0.432, 0)), smooth=0)
    for rx in (-0.24, 0.24):
        wb.add(prim_rings([ring_h(0.0, 0.24, 0.24, 10), ring_h(0.03, 0.24, 0.24, 10)], cap0=False, cap1=False), 'rope',
               M((rx, -0.01, -0.17), (0, 0, 90)), smooth=30)
        wb.add(prim_sphere(0.04, 0.04, 0.04, 5, 2), 'rope', M((rx, 0.20, -0.17)), smooth=50)
    wood = wb.build(mats, parent=pack, location=(0, 0, 0))

    # saco de ouro: juta amarrada, pepitas facetadas
    gb = MeshBuilder('GoldSack')
    sack = [ring_h(-0.16, 0.10, 0.09, 10, cz=-0.15), ring_h(-0.10, 0.22, 0.20, 10, cz=-0.15),
            ring_h(0.02, 0.29, 0.26, 10, cz=-0.15), ring_h(0.12, 0.22, 0.20, 10, cz=-0.15),
            ring_h(0.19, 0.11, 0.10, 10, cz=-0.15), ring_h(0.215, 0.13, 0.12, 10, cz=-0.15)]
    gb.add(prim_rings(sack), 'burlap', smooth=70)
    gb.add(prim_rings([ring_h(0.17, 0.125, 0.115, 10, cz=-0.15), ring_h(0.19, 0.125, 0.115, 10, cz=-0.15)]),
           'rope', smooth=40)
    stitches(gb, (-0.1, -0.02, -0.005), (0.1, -0.02, -0.005), 4, 'thread', size=(0.028, 0.008, 0.008))
    gb.add(prim_box(0.14, 0.14, 0.012), 'patch_b', M((0.06, 0.0, 0.11 - 0.15 + 0.03), (0, 15, 5)), bevel=0.003)
    for k, (x, y, z, sc) in enumerate(((0.0, 0.245, -0.15, 0.085), (-0.075, 0.235, -0.11, 0.07),
                                       (0.075, 0.23, -0.12, 0.075), (-0.035, 0.29, -0.16, 0.06),
                                       (0.045, 0.285, -0.17, 0.065), (0.0, 0.23, -0.21, 0.07))):
        gb.add(prim_sphere(sc, sc, sc, 5, 3), 'gold', M((x, y, z), (k * 30, k * 55, k * 20)), smooth=0)
    gold = gb.build(mats, parent=pack, location=(0, 0, 0))
    return pack, fr, wood, gold


def main():
    args = C.script_args()
    C.reset_scene()
    mats = C.make_paint_set(PALETTE)
    root = C.make_empty('Villager')
    torso = build_torso(mats, root)
    head = build_head(mats, root)
    arm_l = build_arm(mats, root, -1)
    arm_r = build_arm(mats, root, 1)
    leg_l = build_leg(mats, root, -1)
    leg_r = build_leg(mats, root, 1)
    tg = C.make_empty('ToolGroup', TOOL_PIVOT, parent=root)
    axe = build_axe(mats, tg)
    pick = build_pickaxe(mats, tg)
    ham = build_hammer(mats, tg)
    pack, frame, wood, gold = build_pack(mats, root)
    parts = [torso, head, arm_l, arm_r, leg_l, leg_r, axe, pick, ham, frame, wood, gold]
    import bpy
    bpy.context.view_layer.update()

    C.uv_atlas(parts, weights={'Head': 1.6, 'Torso': 1.15, 'ArmL': 0.9, 'ArmR': 0.9, 'LegL': 0.8, 'LegR': 0.8,
                               'Axe': 1.0, 'Pickaxe': 0.8, 'Hammer': 0.8, 'PackFrame': 0.8, 'WoodBundle': 0.8,
                               'GoldSack': 0.9}, margin=0.007)
    img = C.bake_atlas(parts, 'villager_atlas', 512, samples=int(os.environ.get('BAKE_SAMPLES', 32)), margin=4)
    C.finalize_materials(parts, img, team_default=TEAM_DEFAULT,
                         out_png=os.path.join(C.BUILD_DIR, 'villager_atlas.png'))
    out = os.path.join(C.OUT_MODELS, 'villager.glb')
    C.export_glb(root, out)
    st = C.stats(root, out)
    print('STATS villager', st)
    if '--no-render' not in args:
        rig = C.RenderRig(root, 'villager', res=int(os.environ.get('RENDER_RES', 800)), samples=24)
        # estado padrão do jogo: só o machado; sem carga
        W.hide_for_render([pick, ham, wood, gold] + [frame], True)
        rig.render('34', (1.0, 0.95, 1.0), 30)
        rig.render('front', (0.0, 0.25, 1.0), 30)
        rig.render('back', (-0.6, 0.6, -1.0), 30)
        rig.render('side', (1.0, 0.2, 0.0), 30)
        rig.render('game', (45, 44, 45), 24, dist=78 / 1.62)
        # carregando madeira
        W.hide_for_render([wood, frame], False)
        rig.render('34_madeira', (1.0, 0.95, 1.0), 30)
        rig.render('back_madeira', (-0.6, 0.6, -1.0), 30)
        W.hide_for_render([wood], True)
        # picareta + ouro
        W.hide_for_render([axe], True)
        W.hide_for_render([pick, gold], False)
        rig.render('34_picareta', (1.0, 0.95, 1.0), 30)
        rig.render('back_ouro', (-0.6, 0.6, -1.0), 30)
        W.hide_for_render([pick, gold, frame], True)
        W.hide_for_render([ham], False)
        rig.render('34_marreta', (1.0, 0.95, 1.0), 30)
        W.hide_for_render([axe], False)
        W.hide_for_render([ham], True)
        rig.center.z = 1.55 + 0.02
        r0 = rig.radius
        rig.radius = 0.32
        rig.render('face', (0.15, 0.1, 1.0), 30)
        rig.render('face34', (0.8, 0.35, 1.0), 30)
        rig.radius = r0
        C.set_team_color('#c0392b')
        rig.render('34_vermelho', (1.0, 0.95, 1.0), 30)
        C.set_team_color(TEAM_DEFAULT)


main()
