"""
build_bandit_camp.py — Acampamento Bandido (construção neutra hostil `bandit_camp`) gerado 100% por script.

Uso:
  blender -b --factory-startup --python tools/blender/build_bandit_camp.py -- [--no-render]

Saída (public/models/bandit_camp.glb), coordenadas do jogo, origem no centro da base, frente = +Z:
  BanditCamp (raiz)
  ├─ Static_Mesh       paliçada circular de toras pontiagudas inclinadas para fora com abertura frontal, tenda de
  │                    guerra carmesim com finial de osso, abrigo de peles, fogueira de pedras com espeto e caldeirão,
  │                    totens de crânios com chifres no portão, baú aberto de saque, rack de armas, barris (Atlas)
  ├─ Anim_Banners     faixas esfarrapadas (material TeamColor; o jogo pinta com a cor dos neutros)
  └─ Socket_UnitSpawn / Socket_Rally
Pegada ~8,4 (raio de colisão 4,2), altura ~7 (totens). 2 draw calls.
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
from bld_common import beam, tube, log, skull, bbox_game, finish_building  # noqa: E402
from bld_house import polar, barrel, crate  # noqa: E402
import bld_orc as O  # noqa: E402
import build_ogre_den as D  # noqa: E402

Y0 = 0.25
R = 3.7
TEAM_DEFAULT = '#8a1f1a'

PALETTE = dict(D.PALETTE)
PALETTE.update(O.ORC_EXTRAS)
PALETTE['wood'] = dict(PALETTE['log_light'])
PALETTE.update({
    'canvas': dict(base='#9a2b22', var='#6e1a14', var_scale=3.0, var_amt=0.9, fine=0.16, top=0.35, edge='#cf6a56',
                   edge_amt=0.3, edge_r=0.03, ao=(0.7, 0.6)),
    'canvas_dark': dict(base='#5a1812', var='#3c0e0a', var_scale=3.0, var_amt=0.9, fine=0.16, top=0.3),
    'gold': dict(base='#f0b41a', var='#c98a08', var_scale=6.0, var_amt=0.9, fine=0.1, top=0.55, edge='#fff0a0',
                 edge_amt=0.9, edge_r=0.02, ao=(0.3, 0.4), emit_boost=0.25),
    'earth': dict(base='#6b5238', var='#463420', var_scale=3.0, var_amt=0.9, fine=0.2, top=0.2, ao=(0.8, 0.8)),
    'stone': dict(D.ROCK, pattern=None, base='#6a645a', var='#443f37', var_scale=1.2, fine=0.22),
    'ashes': dict(base='#2b2623', var='#14110f', var_scale=8.0, fine=0.2, top=0.2),
})


def build_base(mats, root):
    mb = MeshBuilder('Base')
    mb.add(prim_cyl(4.05, 3.95, Y0, 18, base=True), 'earth', bevel=0.06, smooth=0)
    mb.add(prim_cyl(1.0, 1.0, 0.04, 10, base=True), 'ashes', M((0.0, Y0, 0.8)), smooth=0)
    return mb.build(mats, parent=root)


def build_palisade(mats, root):
    """Anel de toras pontiagudas inclinadas para fora, com abertura no portão (frente), amarras de corda e ossos."""
    mb = MeshBuilder('Palisade')
    n = 30
    for k in range(n):
        a = 360 * k / n
        d = abs(((a + 180) % 360) - 180)
        if d < 24:
            continue
        x, z = polar(R, a)
        h = 2.5 + 0.55 * math.sin(k * 2.3) + 0.4 * math.cos(k * 1.1)
        tilt = 9 + 4 * math.sin(k * 1.7)
        T = M((x, Y0, z), (0, a, 0))
        mb.add(prim_cyl(0.2, 0.16, h, 6, base=True), 'bark', T @ M((0, 0, 0), (tilt, 0, 0)), smooth=0)
        mb.add(prim_cone(0.17, 0.5, 6), 'log_end', T @ M((0, 0, 0), (tilt, 0, 0)) @ M((0, h, 0)), smooth=0)
        if k % 4 == 0:
            mb.add(prim_cone(0.05, 0.4, 4), 'bone', T @ M((0, h * 0.6, 0.18), (60, 0, 0)))
    # amarras
    for yy in (0.8, 1.7):
        for k in range(n):
            a0, a1 = 360 * k / n, 360 * (k + 1) / n
            if min(abs(((a0 + 180) % 360) - 180), abs(((a1 + 180) % 360) - 180)) < 25:
                continue
            x0, z0 = polar(R + 0.23, a0)
            x1, z1 = polar(R + 0.23, a1)
            beam(mb, (x0, Y0 + yy, z0), (x1, Y0 + yy, z1), 0.05, 0.05, 'rope')
    # postes do portão com cordas e lanternas de osso
    for sx in (-1, 1):
        gx, gz = polar(R, sx * 24)
        log(mb, (gx, Y0, gz), (gx, Y0 + 3.2, gz), 0.2, 'bark', n=6)
        mb.add(prim_cone(0.2, 0.55, 6), 'iron', M((gx, Y0 + 3.2, gz)))
    return mb.build(mats, parent=root)


def build_totems(mats, root):
    """Totens de crânios com chifres de boi flanqueando o portão."""
    mb = MeshBuilder('Totems')
    for sx in (-1, 1):
        x, z = polar(R + 0.9, sx * 38)
        log(mb, (x, Y0, z), (x, Y0 + 6.0, z), 0.16, 'wood_dark', n=7)
        for (yy, s, ry) in ((2.6, 0.5, 0), (3.9, 0.42, 20), (5.0, 0.55, -10)):
            skull(mb, M((x, Y0 + yy, z + 0.1), (0, sx * 25 + ry, 0)), s, 'bone')
        # chifres curvos no topo
        for hx in (-1, 1):
            pts = bezier((x + hx * 0.1, Y0 + 5.4, z), (x + hx * 0.9, Y0 + 5.5, z), (x + hx * 0.9, Y0 + 6.3, z), 6)
            tube(mb, pts, [0.11, 0.1, 0.085, 0.07, 0.05, 0.03, 0.015], 'bone', n=5, smooth=40)
        mb.add(prim_cone(0.12, 0.5, 5), 'iron', M((x, Y0 + 6.0, z)))
        for k in range(3):
            mb.add(prim_box(0.07, 0.5, 0.05), 'canvas_dark', M((x + (k - 1) * 0.1, Y0 + 4.5 - 0.1 * k, z - 0.2)))
    return mb.build(mats, parent=root)


def build_tent(mats, root):
    """Tenda de guerra carmesim (fundo) com finial de osso, aba de entrada, estacas e peles."""
    mb = MeshBuilder('Tent')
    cx, cz = -0.2, -1.55
    mb.add(prim_cone(1.9, 2.9, 7, base=True), 'canvas', M((cx, Y0, cz), (0, 15, 0)), smooth=20)
    mb.add(prim_cyl(1.95, 1.95, 0.5, 7, base=True), 'canvas_dark', M((cx, Y0, cz), (0, 15, 0)), smooth=0)
    # abertura de entrada (frente): triângulo escuro com batentes
    mb.add(prim_extrude([(-0.55, 0.0), (0.55, 0.0), (0.0, 1.55)], 0.1, axis='z'), 'dark', M((cx, Y0, cz + 1.62)))
    for sx in (-1, 1):
        beam(mb, (cx + sx * 0.62, Y0, cz + 1.6), (cx + sx * 0.04, Y0 + 1.8, cz + 1.55), 0.07, 0.07, 'wood_dark')
    # varas cruzadas e finial de osso com crânio
    beam(mb, (cx - 0.4, Y0 + 3.2, cz), (cx + 0.4, Y0 + 3.2, cz), 0.04, 0.04, 'bone')
    mb.add(prim_cone(0.08, 1.0, 5), 'bone', M((cx, Y0 + 2.8, cz)), smooth=30)
    skull(mb, M((cx, Y0 + 3.15, cz + 0.05)), 0.32, 'bone')
    # estacas e cordas
    for k in range(7):
        a = 15 + 360 * k / 7 + 25
        x, z = polar(2.15, a)
        mb.add(prim_cone(0.05, 0.4, 4), 'wood_dark', M((cx + x, Y0, cz + z), (-20 * math.cos(math.radians(a)), 0, 20 * math.sin(math.radians(a)))))
        beam(mb, (cx + x, Y0 + 0.2, cz + z), (cx + x * 0.6, Y0 + 0.9, cz + z * 0.6), 0.02, 0.02, 'rope')
    # peles estendidas
    mb.add(prim_box(1.3, 0.05, 0.8, taper=(0.9, 0.9)), 'hide_dark', M((cx + 1.5, Y0 + 0.02, cz + 2.0), (0, 20, 0)))
    return mb.build(mats, parent=root)


def build_shelter(mats, root):
    """Abrigo de peles do batedor (esquerda-frente) e leito."""
    mb = MeshBuilder('Shelter')
    sx_, sz_ = 2.1, -0.6
    for dz in (-0.8, 0.8):
        log(mb, (sx_ - 0.7, Y0, sz_ + dz), (sx_ - 0.7, Y0 + 1.5, sz_ + dz), 0.07, 'wood_dark', n=5)
        log(mb, (sx_ + 0.7, Y0, sz_ + dz), (sx_ + 0.7, Y0 + 0.9, sz_ + dz), 0.07, 'wood_dark', n=5)
    mb.add(prim_box(1.9, 0.07, 1.9), 'hide', M((sx_, Y0 + 1.2, sz_), (0, 0, -14)), bevel=0.01)
    mb.add(prim_box(1.1, 0.12, 0.5, base=True), 'hide_dark', M((sx_ + 0.1, Y0, sz_ - 0.1)), bevel=0.02)   # leito
    mb.add(prim_cyl(0.12, 0.12, 0.5, 6, base=False), 'hide_dark', M((sx_ - 0.4, Y0 + 0.12, sz_ - 0.1), (0, 0, 90)))
    return mb.build(mats, parent=root)


def build_fire(mats, root):
    """Fogueira em anel de pedras com toras, espeto de ferro e caldeirão."""
    mb = MeshBuilder('Fire')
    fx, fz = 0.0, 0.8
    for k in range(9):
        a = 40 * k
        x, z = polar(0.7, a)
        mb.add(prim_sphere(0.17, 0.12, 0.15, 5, 3), 'stone', M((fx + x, Y0 + 0.08, fz + z), (0, a, 0)), smooth=0)
    for k in range(5):
        a = 72 * k + 10
        pa = math.radians(a)
        beam(mb, (fx + math.sin(pa) * 0.55, Y0 + 0.14, fz + math.cos(pa) * 0.55), (fx, Y0 + 0.5, fz), 0.07, 0.07, 'wood_dark')
    mb.add(prim_cyl(0.45, 0.45, 0.12, 9), 'coal', M((fx, Y0 + 0.06, fz)), smooth=0)
    mb.add(prim_cone(0.3, 0.8, 6), 'ember', M((fx, Y0 + 0.2, fz)), smooth=30)
    mb.add(prim_cone(0.16, 0.55, 5), 'glow', M((fx + 0.1, Y0 + 0.2, fz + 0.05)), smooth=30)
    # espeto: dois forcados e barra com caldeirão
    for sx in (-1, 1):
        beam(mb, (fx + sx * 0.95, Y0, fz), (fx + sx * 0.95, Y0 + 1.25, fz), 0.05, 0.05, 'iron')
        mb.add(prim_cone(0.07, 0.25, 4), 'iron', M((fx + sx * 0.95, Y0 + 1.25, fz)))
    beam(mb, (fx - 1.0, Y0 + 1.15, fz), (fx + 1.0, Y0 + 1.15, fz), 0.04, 0.04, 'iron')
    mb.add(prim_sphere(0.36, 0.28, 0.36, 9, 4, y_max=0.0), 'iron', M((fx, Y0 + 0.78, fz)), smooth=45)
    mb.add(prim_cyl(0.37, 0.37, 0.05, 9), 'iron', M((fx, Y0 + 0.78, fz)), smooth=0)
    mb.add(prim_cyl(0.3, 0.3, 0.03, 9), 'slop', M((fx, Y0 + 0.76, fz)), smooth=0)
    for sx in (-1, 1):
        beam(mb, (fx + sx * 0.3, Y0 + 0.82, fz), (fx + sx * 0.05, Y0 + 1.12, fz), 0.015, 0.015, 'iron')
    return mb.build(mats, parent=root)


def build_loot(mats, root):
    """Baú aberto com ouro, rack de armas, barris e sacos."""
    mb = MeshBuilder('Loot')
    cx, cz = -1.8, 1.4
    T = M((cx, Y0, cz), (0, 30, 0))
    mb.add(prim_box(0.9, 0.45, 0.55, base=True), 'wood', T, bevel=0.02)
    mb.add(prim_box(0.94, 0.06, 0.58), 'iron', T @ M((0, 0.4, 0)))
    mb.add(prim_box(0.9, 0.34, 0.06, base=True), 'wood', T @ M((0, 0.45, -0.3), (-100, 0, 0)), bevel=0.01)   # tampa aberta
    mb.add(prim_sphere(0.4, 0.14, 0.24, 7, 3, y_min=0.0), 'gold', T @ M((0, 0.42, 0)), smooth=0)
    for k in range(8):
        mb.add(prim_cyl(0.06, 0.06, 0.015, 6), 'gold', M((cx + 0.7 * math.cos(k * 2.1), Y0 + 0.01, cz + 0.55 + 0.4 * math.sin(k * 2.1))))
    # rack de armas (direita-frente)
    rx, rz = 2.2, 1.35
    for dz in (-0.5, 0.5):
        mb.add(prim_box(0.12, 1.3, 0.12, base=True), 'wood_dark', M((rx, Y0, rz + dz)), bevel=0.01)
    mb.add(prim_box(0.1, 0.1, 1.2), 'wood_dark', M((rx, Y0 + 1.0, rz)))
    mb.add(prim_box(0.1, 0.1, 1.2), 'wood_dark', M((rx, Y0 + 0.4, rz)))
    for k in range(4):
        z = rz - 0.4 + 0.27 * k
        log(mb, (rx, Y0 + 0.3, z), (rx - 0.04, Y0 + 1.9, z), 0.025, 'wood_light', n=5)
        mb.add(prim_cone(0.05, 0.28, 4), 'steel', M((rx - 0.04, Y0 + 1.9, z)))
    mb.add(prim_cyl(0.32, 0.32, 0.05, 10), 'wood', M((rx + 0.3, Y0 + 0.4, rz + 0.1), (0, 0, 80)), smooth=20)   # escudo
    # barris e sacos
    barrel(mb, -2.3, Y0, -0.2, 0.3, 0.65, 'wood_dark', 'iron')
    barrel(mb, -2.75, Y0, 0.25, 0.26, 0.55, 'wood', 'iron')
    for (x, z, s) in ((2.6, -1.9, 1.0), (2.2, -2.2, 0.8)):
        mb.add(prim_sphere(0.28 * s, 0.32 * s, 0.26 * s, 7, 4, y_min=-0.2), 'leather', M((x, Y0 + 0.2, z)), smooth=60)
    return mb.build(mats, parent=root)


def build_banners(mats, root):
    mb = MeshBuilder('Anim_Banners')
    # faixas esfarrapadas penduradas na paliçada (laterais e fundo) e no mastro da tenda
    for (ang, hh) in ((90, 2.4), (270, 2.4), (180, 2.7), (140, 2.4), (220, 2.4)):
        x, z = polar(R + 0.3, ang)
        T = M((x, Y0 + hh, z), (0, ang + 180, 0))
        poly = [(-0.4, 0.0), (0.4, 0.0), (0.4, -1.0), (0.22, -0.78), (0.0, -1.15), (-0.22, -0.8), (-0.4, -1.05)]
        verts, faces = prim_extrude(poly, 0.03, axis='z')
        verts = [(px, py, pz + 0.05 * math.sin(py * 6.0 + px * 3)) for (px, py, pz) in verts]
        mb.add((verts, faces), 'team', T, smooth=40)
    return mb.build(mats, parent=root)


def main():
    args = C.script_args()
    C.reset_scene()
    mats = C.make_paint_set(PALETTE)
    root = C.make_empty('BanditCamp')
    parts = [build_base(mats, root), build_palisade(mats, root), build_totems(mats, root), build_tent(mats, root),
             build_shelter(mats, root), build_fire(mats, root), build_loot(mats, root)]
    banners = build_banners(mats, root)
    finish_building(root, 'bandit_camp', 'bandit_camp.glb', 'bandit_camp_atlas', parts, banners,
                    {'Base': 0.5, 'Palisade': 1.0, 'Totems': 1.0, 'Tent': 1.2, 'Shelter': 0.8, 'Fire': 0.8, 'Loot': 1.0,
                     'Anim_Banners': 0.8},
                    TEAM_DEFAULT, args, spawn=(0, 0, 5.4), rally=(0, 0, 7.0), game_dist=80)


if __name__ == '__main__':
    main()
