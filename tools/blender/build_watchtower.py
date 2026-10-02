"""
build_watchtower.py — Torre de Vigia humana (tipo interno `watchtower`) gerada 100% por script.

Uso:
  blender -b --factory-startup --python tools/blender/build_watchtower.py -- [--no-render]

Saída (public/models/watchtower.glb), coordenadas do jogo, origem no centro da base, frente = +Z:
  Watchtower (raiz)
  ├─ Static_Mesh       embasamento escalonado com contrafortes, fuste octogonal afunilado de pedra com seteiras,
  │                    porta em arco, mísulas de machicolação, galeria de madeira em balanço (piso em y 5,8,
  │                    parapeito entalhado), telhado cônico azul com friso e pináculo de ouro, braseiro
  │                    de ferro com brasas, escada de mão nos fundos e caixa de flechas (Atlas)
  ├─ Anim_Banners      escudos heráldicos nas faces do parapeito e flâmula do pináculo (material TeamColor)
  ├─ Socket_UnitSpawn  saída (frente da porta)
  └─ Socket_Rally      ponto de reunião padrão
Pegada ~4 x 4 (raio de colisão 2,0), altura ~9,8; origem do disparo das flechas em y = 6,8 (parapeito). 2 draw calls.
"""
import os
import sys
import math

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
from mathutils import Vector, Matrix  # noqa: E402
import common as C  # noqa: E402
from common import (MeshBuilder, M, prim_box, prim_rings, ring_h, prim_cyl, prim_cone,  # noqa: E402
                    prim_sphere, prim_extrude, bezier)
from bld_common import beam, tube, log, finish_building  # noqa: E402
import bld_house as H  # noqa: E402
import build_stable as S  # noqa: E402

TEAM_DEFAULT = '#3a66d6'
Y0 = 0.30
GAL_Y = 5.8               # piso da galeria
SHAFT_TOP = 5.35
R0, R1 = 1.35, 1.0        # raio do fuste (base, topo)
GR = 1.62                 # raio da galeria

PALETTE = dict(S.PALETTE)
PALETTE.update(H.HUMAN_EXTRAS)
PALETTE['stone_cyl'] = dict(S.STONE, mapping='cyl', cyl_radius=1.2, pw=0.5, ph=0.28)


def r_at(y):
    t = max(0.0, min(1.0, (y - Y0) / (SHAFT_TOP - Y0)))
    return R0 + (R1 - R0) * t


def build_base(mats, root):
    mb = MeshBuilder('Base')
    mb.add(prim_cyl(2.0, 1.9, Y0, 8, base=True, phase=math.pi / 8), 'stone_dark', bevel=0.05, smooth=0)
    mb.add(prim_cyl(1.85, 1.85, 0.05, 8, base=True, phase=math.pi / 8), 'paving', M((0, Y0, 0)), smooth=0)
    # degrau da porta
    mb.add(prim_box(1.4, 0.14, 0.6, base=True), 'stone_dark', M((0, Y0, R0 + 0.55)), bevel=0.025)
    mb.add(prim_box(1.1, 0.12, 0.4, base=True), 'stone_light', M((0, Y0 + 0.14, R0 + 0.45)), bevel=0.025)
    return mb.build(mats, parent=root)


def build_shaft(mats, root):
    mb = MeshBuilder('Shaft')
    # embasamento escalonado (pedra escura) + fuste octogonal afunilado
    mb.add(prim_cyl(1.65, 1.5, 0.9, 8, base=True, phase=math.pi / 8), 'stone_dark', M((0, Y0, 0)), bevel=0.04, smooth=0)
    rings = [ring_h(Y0 + 0.9, R0 + 0.05, R0 + 0.05, 8, phase=math.pi / 8), ring_h(3.2, 1.18, 1.18, 8, phase=math.pi / 8),
             ring_h(SHAFT_TOP, R1, R1, 8, phase=math.pi / 8)]
    mb.add(prim_rings(rings, cap0=False, cap1=True), 'stone_cyl', smooth=0)
    for y in (2.2, 4.1):
        r = r_at(y) + 0.06
        mb.add(prim_cyl(r, r, 0.14, 8, base=True, phase=math.pi / 8), 'stone_light', M((0, y, 0)), bevel=0.015, smooth=0)
    # contrafortes em 45° nos cantos da frente (esporões de pedra)
    for sx in (-1, 1):
        a = sx * 45
        x, z = H.polar(1.5, a)
        mb.add(prim_box(0.45, 1.5, 0.45, taper=(0.5, 0.5), base=True), 'stone', M((x, Y0, z), (0, a, 0)), bevel=0.03)
    for sx in (-1, 1):
        a = 180 + sx * 45
        x, z = H.polar(1.5, a)
        mb.add(prim_box(0.45, 1.5, 0.45, taper=(0.5, 0.5), base=True), 'stone', M((x, Y0, z), (0, a, 0)), bevel=0.03)
    # porta em arco reforçada (frente)
    H.door_arched(mb, M((0, Y0, R0 + 0.0 - 0.1)), 0.95, 1.7)
    # seteiras nas faces cardeais e diagonais
    for (y, angs) in ((2.8, (90, 270, 180)), (4.5, (0, 90, 180, 270)), (3.6, (45, 135, 225, 315))):
        for a in angs:
            r = r_at(y) * math.cos(math.pi / 8) - 0.03
            x, z = H.polar(r, a)
            T = M((x, y, z), (0, a, 0))
            mb.add(prim_box(0.14, 0.62, 0.08), 'dark', T)
            mb.add(prim_box(0.3, 0.07, 0.1), 'stone_light', T @ M((0, 0.35, 0.02)), bevel=0.01)
            mb.add(prim_box(0.3, 0.07, 0.1), 'stone_light', T @ M((0, -0.35, 0.02)), bevel=0.01)
    # mísulas de machicolação sob a galeria
    for k in range(16):
        a = 360 * k / 16
        x, z = H.polar(R1 + 0.25, a)
        mb.add(prim_box(0.3, 0.55, 0.62, taper=(0.5, 0.9)), 'stone_dark', M((x, SHAFT_TOP - 0.1, z), (0, a, 0)), bevel=0.015)
    mb.add(prim_cyl(1.6, 1.15, 0.35, 8, base=True, phase=math.pi / 8), 'stone_dark', M((0, SHAFT_TOP - 0.1, 0)), bevel=0.02, smooth=0)
    return mb.build(mats, parent=root)


def build_gallery(mats, root, banners):
    mb = MeshBuilder('Gallery')
    # piso de tábuas com vigas expostas
    mb.add(prim_cyl(GR, GR, 0.2, 8, base=True, phase=math.pi / 8), 'wood', M((0, GAL_Y - 0.15, 0)), bevel=0.02, smooth=0)
    for k in range(8):
        a = 360 * k / 8 + 22.5
        x, z = H.polar(GR - 0.1, a)
        mb.add(prim_box(0.12, 0.12, 0.5), 'wood_beam', M((x * 0.82, GAL_Y - 0.25, z * 0.82), (0, a, 0)))
    # parapeito entalhado: 8 faces, cada uma com 3 ameias e tábua de base, com escoras de ferro
    for k in range(8):
        a = 360 * k / 8
        x, z = H.polar(GR - 0.02, a)
        T = M((x, GAL_Y + 0.05, z), (0, a, 0))
        mb.add(prim_box(1.15, 0.46, 0.1, base=True), 'wood', T, bevel=0.01)
        for dx in (-0.42, 0.0, 0.42):
            mb.add(prim_box(0.24, 0.3, 0.1, base=True), 'wood', T @ M((dx, 0.46, 0)), bevel=0.008)
        mb.add(prim_box(1.2, 0.06, 0.14), 'wood_beam', T @ M((0, 0.04, 0)))
        mb.add(prim_box(1.2, 0.05, 0.12), 'iron', T @ M((0, 0.4, 0.0)))
    # prumos de canto
    for k in range(8):
        a = 360 * k / 8 + 22.5
        x, z = H.polar(GR + 0.0, a)
        mb.add(prim_box(0.16, 1.4, 0.16, base=True), 'wood_beam', M((x, GAL_Y + 0.05, z), (0, a, 0)), bevel=0.012)
    # equipamento: caixa de flechas, barril e feixes de flechas
    mb.add(prim_box(0.5, 0.3, 0.3, base=True), 'wood', M((0.55, GAL_Y + 0.05, -0.7), (0, 25, 0)), bevel=0.015)
    for k in range(6):
        mb.add(prim_cyl(0.012, 0.012, 0.45, 4), 'wood_light', M((0.45 + 0.04 * k, GAL_Y + 0.3, -0.7), (0, 25, 8)))
        mb.add(prim_cone(0.03, 0.07, 4), 'steel', M((0.45 + 0.04 * k, GAL_Y + 0.77, -0.7), (0, 25, 8)))
    H.barrel(mb, -0.7, GAL_Y + 0.05, -0.55, r=0.25, h=0.55)
    # braseiro de ferro pendurado em balanço (lateral direita) com brasas
    bx, bz = 1.95, 0.2
    beam(mb, (1.5, GAL_Y - 0.2, 0.2), (bx, GAL_Y - 0.5, bz), 0.1, 0.1, 'wood_beam')
    beam(mb, (1.6, GAL_Y - 0.7, 0.2), (bx - 0.05, GAL_Y - 0.5, bz), 0.07, 0.07, 'wood_beam')
    mb.add(prim_sphere(0.28, 0.2, 0.28, 8, 3, y_max=0.0), 'iron', M((bx, GAL_Y - 0.25, bz)), smooth=45)
    mb.add(prim_cyl(0.3, 0.3, 0.04, 8), 'iron', M((bx, GAL_Y - 0.25, bz)), smooth=0)
    mb.add(prim_sphere(0.24, 0.08, 0.24, 7, 3, y_min=0.0), 'ember', M((bx, GAL_Y - 0.22, bz)), smooth=60)
    for k in range(3):
        mb.add(prim_cone(0.07, 0.28 + 0.08 * (k % 2), 4), 'ember', M((bx + (k - 1) * 0.12, GAL_Y - 0.2, bz + 0.05 * (k % 2))))
    # escada de mão nos fundos (do chão até a galeria)
    lz = -(r_at(3.0) + 0.55)
    for sx in (-1, 1):
        mb.add(prim_box(0.08, GAL_Y - Y0 + 0.5, 0.1, base=True), 'wood', M((sx * 0.3, Y0, lz)), bevel=0.008)
    for k in range(14):
        mb.add(prim_box(0.58, 0.06, 0.08), 'wood_light', M((0, Y0 + 0.3 + 0.4 * k, lz)))
    for y in (1.2, 3.2, 5.0):
        mb.add(prim_box(0.12, 0.1, 0.55), 'iron', M((0.3, Y0 + y, lz + 0.27)))
        mb.add(prim_box(0.12, 0.1, 0.55), 'iron', M((-0.3, Y0 + y, lz + 0.27)))
    # lanterna na porta
    H.lantern(mb, M((0.95, Y0 + 1.95, R0 + 0.45)))
    return mb.build(mats, parent=root)


def build_roof(mats, root):
    mb = MeshBuilder('Roof')
    top = GAL_Y + 1.45
    mb.add(prim_cyl(1.9, 1.75, 0.16, 8, base=True, phase=math.pi / 8), 'gold', M((0, top, 0)), bevel=0.01, smooth=0)  # friso dourado
    mb.add(prim_cone(1.82, 1.7, 8, base=True, phase=math.pi / 8), 'roof_cone', M((0, top + 0.12, 0)), smooth=0)
    # beirais com cauda de caibros
    for k in range(16):
        a = 360 * k / 16
        x, z = H.polar(1.78, a)
        mb.add(prim_box(0.08, 0.1, 0.34), 'wood_beam', M((x, top - 0.05, z), (0, a, 0)))
    # pináculo: base torneada, esfera e agulha
    mb.add(prim_cyl(0.14, 0.1, 0.22, 8, base=True), 'gold', M((0, top + 1.75, 0)), smooth=40)
    mb.add(prim_sphere(0.14, 0.14, 0.14, 7, 4), 'gold', M((0, top + 2.0, 0)), smooth=70)
    mb.add(prim_cone(0.05, 0.7, 5), 'gold', M((0, top + 2.1, 0)))
    # colunas de apoio entre galeria e telhado (escoras de madeira)
    for k in range(8):
        a = 360 * k / 8 + 22.5
        x, z = H.polar(GR, a)
        beam(mb, (x, GAL_Y + 1.35, z), (x * 0.9, top, z * 0.9), 0.12, 0.12, 'wood_beam')
    return mb.build(mats, parent=root)


def build_banners(mats, root):
    mb = MeshBuilder('Anim_Banners')
    shield = [(0.0, 0.3), (0.22, 0.24), (0.22, -0.04), (0.0, -0.3), (-0.22, -0.04), (-0.22, 0.24)]
    for a in (0, 90, 180, 270):
        x, z = H.polar(GR + 0.07, a)
        mb.add(prim_extrude(shield, 0.04, axis='z'), 'team', M((x, GAL_Y + 0.34, z), (0, a, 0)), bevel=0.005)
    # flâmula de duas pontas no pináculo
    top = GAL_Y + 1.45
    pole = [(0.0, 0.0), (0.0, -0.22), (-1.0, -0.12), (-0.78, -0.07), (-1.0, 0.0)]
    verts, faces = prim_extrude(pole, 0.03, axis='z')
    verts = [(x, y, z + 0.07 * math.sin(x * 6.0)) for (x, y, z) in verts]
    mb.add((verts, faces), 'team', M((0.04, top + 2.55, 0.0)), smooth=40)
    # fitas penduradas sob a galeria
    for a in (45, 135, 225, 315):
        x, z = H.polar(GR - 0.1, a)
        sw = [(-0.12, 0.0), (0.12, 0.0), (0.12, -0.6), (0.0, -0.45), (-0.12, -0.6)]
        v, f = prim_extrude(sw, 0.03, axis='z')
        mb.add((v, f), 'team', M((x, GAL_Y - 0.28, z), (0, a, 0)), smooth=40)
    return mb.build(mats, parent=root)


def main():
    args = C.script_args()
    C.reset_scene()
    mats = C.make_paint_set(PALETTE)
    root = C.make_empty('Watchtower')
    base = build_base(mats, root)
    shaft = build_shaft(mats, root)
    gal = build_gallery(mats, root, None)
    roof = build_roof(mats, root)
    banners = build_banners(mats, root)
    finish_building(root, 'watchtower', 'watchtower.glb', 'watchtower_atlas', [base, shaft, gal, roof], banners,
                    {'Base': 0.6, 'Shaft': 1.2, 'Gallery': 1.0, 'Roof': 0.8, 'Anim_Banners': 0.8},
                    TEAM_DEFAULT, args, spawn=(0, 0, 3.6), rally=(0, 0, 5.6), game_dist=110)


if __name__ == '__main__':
    main()
