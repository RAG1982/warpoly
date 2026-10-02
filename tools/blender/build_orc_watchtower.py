"""
build_orc_watchtower.py — Torre de Vigia orc (tipo interno `orc_watchtower`) gerada 100% por script.

Uso:
  blender -b --factory-startup --python tools/blender/build_orc_watchtower.py -- [--no-render]

Saída (public/models/orc_watchtower.glb), coordenadas do jogo, origem no centro da base, frente = +Z:
  OrcWatchtower (raiz)
  ├─ Static_Mesh       embasamento de basalto, quatro troncos inclinados afunilando até y ≈ 7,5 com travessas,
  │                    cintas e escoras de ferro, paredes de tábuas e toras nos dois primeiros andares, escada de
  │                    mão, plataforma de arqueiros com parapeito de toras e espinhos voltados para fora,
  │                    suporte central do braseiro (o `OrcWatchtower.js` soma a chama animada em (0; 8,4; 0)),
  │                    crânios e presas (Atlas)
  ├─ Anim_Banners      estandartes esfarrapados (material TeamColor)
  ├─ Socket_UnitSpawn  saída (frente)
  └─ Socket_Rally      ponto de reunião padrão
Pegada ~4 x 4 (raio de colisão 2,0), altura ~10; origem do disparo dos machados em y = 8,2. 2 draw calls.
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
Y0 = 0.30
PLAT_Y = 7.35          # piso da plataforma
RB, RT = 1.55, 1.1     # raio dos pilares (base, topo) — medido ao canto

PALETTE = dict(D.PALETTE)
PALETTE.update(O.ORC_EXTRAS)


def corner(k, r, yfrac_r):
    a = math.radians(45 + 90 * k)
    return math.cos(a) * r, math.sin(a) * r


def r_at(y):
    t = max(0.0, min(1.0, (y - Y0) / (PLAT_Y - Y0)))
    return RB + (RT - RB) * t


def build_base(mats, root):
    mb = MeshBuilder('Base')
    mb.add(prim_box(4.0, Y0, 4.0, taper=(0.97, 0.97), base=True), 'rock', bevel=0.06)
    mb.add(prim_box(3.7, 0.05, 3.7, base=True), 'mud', M((0, Y0, 0)))
    for (x, z, s, r) in ((-1.7, 1.7, 0.35, 20), (1.8, 1.6, 0.4, -15), (1.7, -1.7, 0.33, 40)):
        mb.add(prim_sphere(s, s * 0.7, s * 0.9, 7, 4, y_min=-0.2), 'rock_plain', M((x, Y0, z), (0, r, 0)), smooth=0)
    return mb.build(mats, parent=root)


def build_tower(mats, root, banners):
    mb = MeshBuilder('Tower')
    # sapatas de basalto sob os pilares
    pil = []
    for k in range(4):
        bx, bz = corner(k, RB * 1.0, 0)
        tx, tz = corner(k, RT * 1.0, 0)
        pts = bezier((bx, Y0 + 0.1, bz), ((bx + tx) / 2 * 1.02, Y0 + (PLAT_Y - Y0) / 2, (bz + tz) / 2 * 1.02), (tx, PLAT_Y + 0.1, tz), 8)
        tube(mb, pts, [0.26, 0.25, 0.24, 0.23, 0.22, 0.21, 0.2, 0.19, 0.18], 'bark', n=7, smooth=50)
        mb.add(prim_box(0.7, 0.4, 0.7, taper=(0.8, 0.8), base=True), 'rock', M((bx, Y0, bz), (0, 45 + 90 * k, 0)), bevel=0.04)
        mb.add(prim_cone(0.3, 0.6, 5), 'iron', M((bx, Y0 + 0.4, bz)))      # gusset de ferro
        pil.append(((bx, bz), (tx, tz)))
    # travessas horizontais em 3 andares + cintas de ferro + escoras em X
    for y in (2.4, 4.8, PLAT_Y - 0.1):
        r = r_at(y) * 0.94
        for k in range(4):
            a = math.radians(45 + 90 * k)
            b = math.radians(45 + 90 * (k + 1))
            p0 = (math.cos(a) * r, y, math.sin(a) * r)
            p1 = (math.cos(b) * r, y, math.sin(b) * r)
            beam(mb, p0, p1, 0.26, 0.24, 'log', bevel=0.02)
            mb.add(prim_box(0.34, 0.14, 0.34), 'iron', M(p0), bevel=0.01)
    for k in range(4):
        a = math.radians(45 + 90 * k)
        b = math.radians(45 + 90 * (k + 1))
        for (ya, yb) in ((2.4, 4.8), (4.8, PLAT_Y - 0.1)):
            ra, rb = r_at(ya) * 0.94, r_at(yb) * 0.94
            beam(mb, (math.cos(a) * ra, ya, math.sin(a) * ra), (math.cos(b) * rb, yb, math.sin(b) * rb), 0.14, 0.14, 'wood_light')
            beam(mb, (math.cos(b) * ra, ya, math.sin(b) * ra), (math.cos(a) * rb, yb, math.sin(a) * rb), 0.14, 0.14, 'wood_light')
    # paredes de tábuas no 1º andar (frente com porta baixa) e toras no 2º
    for k in range(4):
        a = math.radians(45 + 90 * k)
        b = math.radians(45 + 90 * (k + 1))
        for (y0, y1, mat) in ((Y0 + 0.2, 2.3, 'plank'), (2.5, 4.7, 'log')):
            ra = r_at(y0) * 0.9
            p0 = Vector((math.cos(a) * ra, 0, math.sin(a) * ra))
            p1 = Vector((math.cos(b) * ra, 0, math.sin(b) * ra))
            mid = (p0 + p1) / 2
            ang = -math.degrees(math.atan2(p1.z - p0.z, p1.x - p0.x))
            ln = (p1 - p0).length * 0.98
            mb.add(prim_box(ln, y1 - y0, 0.12, base=True), mat, M((mid.x, y0, mid.z), (0, ang, 0)), bevel=0.01)
    # porta baixa de tábuas na frente (face +Z) e seteiras
    zf = r_at(1.5) * 0.9 * math.cos(math.radians(45)) + 0.07
    mb.add(prim_extrude(O.arch_poly(0.9, 1.5, Y0 + 0.2), 0.14, axis='z'), 'bone', M((0, 0, zf - 0.02)))
    mb.add(prim_extrude(O.arch_poly(0.7, 1.4, Y0 + 0.2), 0.1, axis='z'), 'plank', M((0, 0, zf + 0.04)))
    for dy in (0.5, 1.2):
        mb.add(prim_box(0.7, 0.05, 0.04), 'iron', M((0, Y0 + 0.2 + dy, zf + 0.1)))
    for (y, a) in ((3.4, 0), (3.6, 90), (3.6, 180), (3.6, 270)):
        r = r_at(y) * 0.9 * math.cos(math.radians(45)) + 0.07
        x, z = O.polar(r, a)
        T = M((x, y, z), (0, a, 0))
        mb.add(prim_box(0.12, 0.6, 0.06), 'window', T)
        mb.add(prim_box(0.3, 0.07, 0.1), 'iron', T @ M((0, 0.34, 0.02)))
        mb.add(prim_box(0.3, 0.07, 0.1), 'iron', T @ M((0, -0.34, 0.02)))
    # escada de mão nos fundos
    lz = -(r_at(2.0) * 0.9 * math.cos(math.radians(45)) + 0.55)
    for sx in (-1, 1):
        mb.add(prim_box(0.08, PLAT_Y - Y0 + 0.4, 0.1, base=True), 'bark', M((sx * 0.3, Y0, lz)))
    for k in range(16):
        mb.add(prim_box(0.58, 0.06, 0.08), 'wood_light', M((0, Y0 + 0.3 + 0.43 * k, lz)))
    # crânios e presas na face frontal
    skull(mb, M((0, 4.3, r_at(4.3) * 0.9 * math.cos(math.radians(45)) + 0.2)), 0.5, 'bone')
    for sx in (-1, 1):
        O.tusk(mb, (sx * 0.5, 2.5, zf + 0.15), (sx * 0.2, 4.1, zf + 0.2), (sx * 0.4, 0.2, 0.15), r0=0.1)
    return mb.build(mats, parent=root)


def build_platform(mats, root, banners):
    mb = MeshBuilder('Platform')
    R = 1.62
    # piso de toras em balanço, com vigas expostas
    mb.add(prim_box(2 * R + 0.1, 0.22, 2 * R + 0.1), 'bark', M((0, PLAT_Y - 0.05, 0)), bevel=0.03)
    for k in range(8):
        z = -R + 0.2 + 0.4 * k
        log(mb, (-R - 0.05, PLAT_Y + 0.12, z), (R + 0.05, PLAT_Y + 0.12, z), 0.09, 'log', n=6)
    for sx in (-1, 1):
        for dz in (-1.0, 0.0, 1.0):
            beam(mb, (sx * 1.1, PLAT_Y - 0.2, dz), (sx * (R + 0.55), PLAT_Y - 0.55, dz), 0.14, 0.14, 'bark')
    # parapeito: 4 faces de toras horizontais com estacas verticais e espinhos para fora
    for k in range(4):
        a = 90 * k
        x, z = O.polar(R + 0.02, a)
        T = M((x, PLAT_Y + 0.2, z), (0, a, 0))
        for row in range(3):
            mb.add(prim_box(2 * R + 0.2, 0.2, 0.18), 'log', T @ M((0, 0.15 + row * 0.38, 0)), bevel=0.02)
        for dx in (-1.4, -0.7, 0.0, 0.7, 1.4):
            mb.add(prim_box(0.16, 1.35, 0.16, base=True), 'bark', T @ M((dx, 0, 0)), bevel=0.015)
            mb.add(prim_cone(0.1, 0.4, 5), 'iron', T @ M((dx, 1.35, 0)))
        for dx in (-1.1, 0.0, 1.1):
            mb.add(prim_cone(0.07, 0.55, 4), 'iron', T @ M((dx, 0.5, 0.18), (70, 0, 0)))
    # suporte central do braseiro: tripé de ferro e bacia (chama animada em y = 8,4 pelo jogo)
    for k in range(3):
        a = 2 * math.pi * k / 3
        beam(mb, (math.cos(a) * 0.55, PLAT_Y + 0.15, math.sin(a) * 0.55), (math.cos(a) * 0.2, PLAT_Y + 0.85, math.sin(a) * 0.2), 0.09, 0.09, 'iron')
    mb.add(prim_sphere(0.38, 0.26, 0.38, 9, 3, y_max=0.0), 'iron', M((0, PLAT_Y + 0.98, 0)), smooth=45)
    mb.add(prim_cyl(0.4, 0.4, 0.06, 9), 'iron', M((0, PLAT_Y + 0.98, 0)), smooth=0)
    mb.add(prim_sphere(0.32, 0.08, 0.32, 8, 3, y_min=0.0), 'coal', M((0, PLAT_Y + 1.0, 0)), smooth=50)
    mb.add(prim_sphere(0.2, 0.1, 0.2, 6, 3, y_min=0.0), 'ember', M((0, PLAT_Y + 1.04, 0)), smooth=60)
    # caixas de machados de arremesso e barril
    for k in range(5):
        mb.add(prim_box(0.05, 0.5, 0.05), 'wood_light', M((-1.0 + 0.1 * k, PLAT_Y + 0.35, 0.9), (0, 0, 10 * (k - 2))))
        mb.add(prim_box(0.28, 0.2, 0.04, taper=(0.6, 1.0)), 'steel', M((-1.0 + 0.1 * k + 0.02 * (k - 2), PLAT_Y + 0.68, 0.9), (0, 90, 10 * (k - 2))))
    O.barrel_orc(mb, 1.0, PLAT_Y + 0.12, -0.9, r=0.25, h=0.5)
    # mastros de estandarte nos cantos (frente-esquerda e direita)
    for sx in (-1, 1):
        O.banner_pole(mb, sx * (R + 0.1), PLAT_Y, R + 0.1, 2.6, banners, ry=sx * 10, w=0.7, bh=1.0)
    # crânio-troféu sobre o parapeito frontal
    skull(mb, M((0, PLAT_Y + 1.85, R + 0.1)), 0.42, 'bone')
    return mb.build(mats, parent=root)


def build_banners(mats, root, mb):
    return mb.build(mats, parent=root)


def main():
    args = C.script_args()
    C.reset_scene()
    mats = C.make_paint_set(PALETTE)
    root = C.make_empty('OrcWatchtower')
    bmb = MeshBuilder('Anim_Banners')
    base = build_base(mats, root)
    tower = build_tower(mats, root, bmb)
    plat = build_platform(mats, root, bmb)
    banners = build_banners(mats, root, bmb)
    finish_building(root, 'orc_watchtower', 'orc_watchtower.glb', 'orc_watchtower_atlas', [base, tower, plat], banners,
                    {'Base': 0.5, 'Tower': 1.3, 'Platform': 1.0, 'Anim_Banners': 0.7},
                    TEAM_DEFAULT, args, spawn=(0, 0, 3.6), rally=(0, 0, 5.6), game_dist=110)


if __name__ == '__main__':
    main()
