"""
build_orc_house.py — Toca Orc (tipo interno `orc_house`) gerada 100% por script.

Uso:
  blender -b --factory-startup --python tools/blender/build_orc_house.py -- [--no-render]

Saída (public/models/orc_house.glb), coordenadas do jogo, origem no centro da base, frente = +Z:
  OrcHouse (raiz)
  ├─ Static_Mesh       cabana octogonal de toras de ferro sobre pé de basalto, porta de tábuas com cintas de ferro
  │                    e puxador de osso, janelas âmbar com grade, telhado cônico de peles remendadas com presas
  │                    e ripas, chaminé de pedra com tampa de ferro, arco de costelas, lenha com machado, crânio troféu
  ├─ Anim_Banners      estandarte e faixas esfarrapadas (material TeamColor)
  ├─ Socket_UnitSpawn  saída (frente da porta)
  └─ Socket_Rally      ponto de reunião padrão
Pegada ~5,4 x 5,4 (raio de colisão 2,8), altura ~5,2. 2 draw calls.
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
from bld_common import beam, tube, log, skull, finish_building  # noqa: E402
import bld_orc as O  # noqa: E402
import build_ogre_den as D  # noqa: E402

TEAM_DEFAULT = '#b81d24'
Y0 = 0.28
WALL_R = 1.75
WALL_H = 2.0
FT = 0.55           # topo do pé de basalto
ROOF_H = 2.3

PALETTE = dict(D.PALETTE)
PALETTE.update(O.ORC_EXTRAS)


def build_base(mats, root):
    mb = MeshBuilder('Base')
    mb.add(prim_cyl(2.75, 2.65, Y0, 12, base=True, phase=math.pi / 12), 'rock', bevel=0.05, smooth=0)
    mb.add(prim_cyl(2.55, 2.55, 0.05, 12, base=True, phase=math.pi / 12), 'mud', M((0, Y0, 0)), smooth=0)
    for (x, z, s, r) in ((-2.2, -1.4, 0.4, 20), (2.3, -1.2, 0.45, -10), (-2.3, 1.2, 0.32, 40)):
        mb.add(prim_sphere(s, s * 0.7, s * 0.9, 7, 4, y_min=-0.2), 'rock_plain', M((x, Y0, z), (0, r, 0)), smooth=0)
    return mb.build(mats, parent=root)


def build_hut(mats, root, banners):
    mb = MeshBuilder('Hut')
    # pé de basalto octogonal e parede de toras horizontais empilhadas (anéis octogonais)
    mb.add(prim_cyl(WALL_R + 0.18, WALL_R + 0.12, FT - Y0, 8, base=True, phase=math.pi / 8), 'rock', M((0, Y0, 0)), bevel=0.04, smooth=0)
    mb.add(prim_cyl(WALL_R, WALL_R, WALL_H, 8, base=True, phase=math.pi / 8), 'log', M((0, FT, 0)), smooth=0)
    n_rows = 8
    for k in range(n_rows):
        y = FT + 0.12 + k * 0.245
        mb.add(prim_cyl(WALL_R + 0.08, WALL_R + 0.08, 0.2, 8, base=True, phase=math.pi / 8), 'log', M((0, y, 0)), smooth=0)
    # cantos: prumos de tronco com pontas salientes (encaixe de toras) e cintas de ferro
    for k in range(8):
        a = 360 * k / 8 + 22.5
        x, z = O.polar(WALL_R + 0.1, a)
        mb.add(prim_cyl(0.13, 0.13, WALL_H + 0.1, 6, base=True), 'bark', M((x, FT, z)), smooth=30)
        mb.add(prim_cone(0.09, 0.22, 5), 'log_end', M((x, FT + WALL_H + 0.1, z)))
    for y in (FT + 0.5, FT + 1.5):
        mb.add(prim_cyl(WALL_R + 0.16, WALL_R + 0.16, 0.05, 8, base=True, phase=math.pi / 8), 'iron', M((0, y, 0)), smooth=0)
    # porta de tábuas com cintas de ferro, batente de osso e puxador de osso
    zf = WALL_R * math.cos(math.pi / 8) + 0.02
    mb.add(prim_extrude(O.arch_poly(1.2, 1.7, FT), 0.3, axis='z'), 'bone', M((0, 0, zf - 0.04)), bevel=0.02)
    mb.add(prim_extrude(O.arch_poly(0.95, 1.55, FT), 0.14, axis='z'), 'plank', M((0, 0, zf + 0.06)))
    for dy in (0.35, 1.0, 1.55):
        mb.add(prim_box(0.95, 0.06, 0.04), 'iron', M((0, FT + dy, zf + 0.14)))
    mb.add(prim_cone(0.045, 0.3, 5), 'bone', M((0.28, FT + 0.85, zf + 0.15), (0, 0, -90)))
    # janelas âmbar com grade e venezianas de pele (laterais)
    for a in (-90, 90, 135, -135):
        x, z = O.polar(WALL_R * math.cos(math.pi / 8), a)
        T = M((x, FT + 1.2, z), (0, a, 0))
        mb.add(prim_box(0.5, 0.5, 0.06), 'window', T)
        mb.add(prim_box(0.62, 0.08, 0.12), 'bone', T @ M((0, 0.3, 0.03)))
        mb.add(prim_box(0.62, 0.08, 0.12), 'bone', T @ M((0, -0.3, 0.03)))
        for dx in (-0.12, 0.12):
            mb.add(prim_box(0.035, 0.5, 0.05), 'iron', T @ M((dx, 0, 0.05)))
        mb.add(prim_box(0.5, 0.035, 0.05), 'iron', T @ M((0, 0, 0.05)))
    # chaminé de basalto no fundo com tampa de ferro e espinhos
    cx, cz = 0.8, -1.55
    mb.add(prim_box(0.75, WALL_H + 1.6, 0.75, taper=(0.8, 0.8), base=True), 'rock', M((cx, FT, cz)), bevel=0.05)
    mb.add(prim_box(0.8, 0.12, 0.8), 'iron', M((cx, FT + WALL_H + 1.6, cz)), bevel=0.01)
    for k in range(4):
        a = 90 * k + 45
        x, z = O.polar(0.34, a)
        mb.add(prim_cone(0.05, 0.3, 4), 'iron', M((cx + x, FT + WALL_H + 1.66, cz + z)))
    return mb.build(mats, parent=root)


def build_roof(mats, root):
    mb = MeshBuilder('Roof')
    y0 = FT + WALL_H
    # cone de peles com remendos (mat por gomo) e costelas de osso radiais
    prof = [(0.0, WALL_R + 0.55), (0.5, WALL_R * 0.78), (1.2, WALL_R * 0.42), (ROOF_H, 0.06)]
    rings = [ring_h(y0 + dy, r, r, 16, phase=math.pi / 16) for (dy, r) in prof]

    def mat_fn(c, nrm):
        a = math.atan2(c[2], c[0]) % (2 * math.pi)
        k = int(a / (2 * math.pi) * 8)
        return 'hide' if k % 2 else 'hide_dark'
    mb.add(prim_rings(rings, cap0=False, cap1=True), 'hide', smooth=40, mat_fn=mat_fn)
    for k in range(8):
        a = 360 * k / 8
        pts = []
        for (dy, r) in prof:
            x, z = O.polar(r + 0.05, a)
            pts.append((x, y0 + dy + 0.03, z))
        tube(mb, pts, [0.07, 0.065, 0.055, 0.04], 'bone', n=5, smooth=30)
    # anel de ripas (costas de osso) e presas na borda do beiral
    mb.add(prim_rings([ring_h(y0 + 0.04, WALL_R + 0.62, WALL_R + 0.62, 16), ring_h(y0 + 0.1, WALL_R + 0.58, WALL_R + 0.58, 16)],
                      cap0=False, cap1=False), 'log', smooth=30)
    for k in range(8):
        a = 360 * k / 8 + 22.5
        x, z = O.polar(WALL_R + 0.55, a)
        mb.add(prim_cone(0.09, 0.5, 5), 'bone', M((x, y0 - 0.1, z)), smooth=40)
    # topo: crânio de ogro e pontas de osso cruzadas
    skull(mb, M((0, y0 + ROOF_H - 0.15, 0.0), (0, 0, 0)), 0.45, 'bone')
    mb.add(prim_cone(0.05, 0.5, 4), 'bone', M((0, y0 + ROOF_H + 0.1, 0)))
    return mb.build(mats, parent=root)


def build_props(mats, root, banners):
    mb = MeshBuilder('Props')
    zf = 2.4
    # arco de costelas na frente (duas costelas curvas gigantes formando portal)
    for sx in (-1, 1):
        pts = bezier((sx * 0.9, Y0, zf), (sx * 1.0, Y0 + 2.1, zf), (0.0, Y0 + 2.2, zf), 6)
        tube(mb, pts, [0.11, 0.1, 0.09, 0.08, 0.075, 0.07, 0.06], 'bone', n=6, smooth=45)
    skull(mb, M((0, Y0 + 2.15, zf), (0, 0, 0)), 0.3, 'bone')
    # lenha e cepo com machado
    for r in range(3):
        for k in range(3 - r):
            log(mb, (-2.3, Y0 + 0.12 + 0.2 * r, 0.6 + 0.22 * k + 0.11 * r), (-1.7, Y0 + 0.12 + 0.2 * r, 0.6 + 0.22 * k + 0.11 * r), 0.1, 'bark', n=6)
    mb.add(prim_cyl(0.25, 0.3, 0.45, 8, base=True), 'bark', M((1.75, Y0, 1.55)), smooth=40)
    mb.add(prim_cyl(0.25, 0.25, 0.02, 8), 'log_end', M((1.75, Y0 + 0.45, 1.55)))
    log(mb, (1.75, Y0 + 0.5, 1.5), (1.45, Y0 + 0.9, 1.6), 0.03, 'log_end', n=5)
    mb.add(prim_box(0.24, 0.22, 0.05), 'steel', M((1.7, Y0 + 0.55, 1.52), (0, 0, -20)), bevel=0.007)
    # crânio troféu num poste e barril
    log(mb, (-1.4, Y0, 2.0), (-1.4, Y0 + 1.25, 2.0), 0.06, 'log', n=6)
    skull(mb, M((-1.4, Y0 + 1.45, 2.0), (0, 25, 0)), 0.34, 'bone')
    O.barrel_orc(mb, 2.2, Y0, -0.4)
    # peles esticadas num cavalete (frente-direita)
    for dx in (-0.5, 0.5):
        beam(mb, (2.0 + dx, Y0, 2.2), (2.0 + dx * 0.4, Y0 + 1.5, 2.2), 0.07, 0.07, 'log')
    mb.add(prim_box(1.0, 1.0, 0.04), 'hide', M((2.0, Y0 + 0.9, 2.2), (0, 0, 0)), bevel=0.0)
    # mastro com estandarte
    O.banner_pole(mb, 2.3, Y0, 2.75, 3.4, banners, ry=0, w=0.8, bh=1.2)
    return mb.build(mats, parent=root)


def build_banners(mats, root, mb):
    O.tattered_banner(mb, 0.0, FT + 1.95, WALL_R * math.cos(math.pi / 8) + 0.2, 0, 0.5, 0.9)
    return mb.build(mats, parent=root)


def main():
    args = C.script_args()
    C.reset_scene()
    mats = C.make_paint_set(PALETTE)
    root = C.make_empty('OrcHouse')
    bmb = MeshBuilder('Anim_Banners')
    base = build_base(mats, root)
    hut = build_hut(mats, root, bmb)
    roof = build_roof(mats, root)
    props = build_props(mats, root, bmb)
    banners = build_banners(mats, root, bmb)
    finish_building(root, 'orc_house', 'orc_house.glb', 'orc_house_atlas', [base, hut, roof, props], banners,
                    {'Base': 0.5, 'Hut': 1.1, 'Roof': 0.9, 'Props': 0.9, 'Anim_Banners': 0.8},
                    TEAM_DEFAULT, args, spawn=(0, 0, 3.9), rally=(0, 0, 5.9))


if __name__ == '__main__':
    main()
