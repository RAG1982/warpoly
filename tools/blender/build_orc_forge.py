"""
build_orc_forge.py — Forja de Guerra orc (tipo interno `orc_forge`) gerada 100% por script.

Uso:
  blender -b --factory-startup --python tools/blender/build_orc_forge.py -- [--no-render]

Saída (public/models/orc_forge.glb), coordenadas do jogo, origem no centro da base, frente = +Z:
  OrcForge (raiz)
  ├─ Static_Mesh       alto-forno monumental de basalto escurecido com cintas de ferro, boca em arco com leito de
  │                    brasas (o `OrcForge.js` soma as chamas animadas em (−1,4; 1,6; 0,6)), chaminé quadrada
  │                    escalonada até y ≈ 9,2 em (−1,8; −1,4) com coifa de ferro, galpão de toras com telhado de
  │                    placas de ferro e espinhos, bigorna sobre cepo em (1,6; 1,35; 1,8), cocho de têmpera,
  │                    lingotes, lâminas e cabeças de machado em bruto (Atlas)
  ├─ Anim_Banners      estandartes esfarrapados (material TeamColor)
  ├─ Socket_UnitSpawn  saída
  └─ Socket_Rally      ponto de reunião padrão
Pegada ~6,6 x 6,6 (raio de colisão 3,4), altura ~9,4. 2 draw calls.
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
FX, FZ0, FZ1 = -1.4, -2.0, 0.85      # centro x do forno e z do fundo/frente

PALETTE = dict(D.PALETTE)
PALETTE.update(O.ORC_EXTRAS)
PALETTE['soot'] = dict(D.ROCK, base='#2a2826', var='#1a1816', pattern='bricks', pw=1.1, ph=0.55, brick_tint='#3a3633',
                       grad=(0.0, 6.0, 0.35))
PALETTE['iron_plate'] = dict(base='#3d434f', var='#2a2e38', var_scale=1.2, var_amt=0.8, fine=0.08, pattern='bricks',
                             mapping='box', pw=0.9, ph=0.6, mortar='#14161b', mortar_size=0.04, brick_tint='#566070',
                             brick_tint_amt=0.5, brick_dark=0.85, brick_lite=1.1, top=0.3, edge='#9aa3b2', edge_amt=0.7,
                             edge_r=0.02, ao=(0.6, 0.55))


def build_base(mats, root):
    mb = MeshBuilder('Base')
    mb.add(prim_box(6.6, Y0, 6.6, taper=(0.975, 0.975), base=True), 'rock', bevel=0.07)
    mb.add(prim_box(6.3, 0.05, 6.3, base=True), 'coal', M((0, Y0, 0)))
    return mb.build(mats, parent=root)


def build_furnace(mats, root, banners):
    mb = MeshBuilder('Furnace')
    cx = FX
    w = 2.5
    d = FZ1 - FZ0
    zc = (FZ0 + FZ1) / 2
    # corpo escalonado de basalto escurecido (3 degraus afunilando)
    mb.add(prim_box(w, 1.5, d, taper=(0.97, 0.97), base=True), 'soot', M((cx, Y0, zc)), bevel=0.06)
    mb.add(prim_box(w * 0.88, 1.5, d * 0.9, taper=(0.9, 0.9), base=True), 'soot', M((cx, Y0 + 1.5, zc - 0.1)), bevel=0.05)
    mb.add(prim_box(w * 0.7, 1.4, d * 0.75, taper=(0.75, 0.75), base=True), 'soot', M((cx, Y0 + 3.0, zc - 0.25)), bevel=0.05)
    # cintas de ferro rebitadas
    for y in (Y0 + 0.5, Y0 + 1.3, Y0 + 2.2, Y0 + 3.4):
        s = 1.0 if y < Y0 + 1.5 else (0.9 if y < Y0 + 3.0 else 0.72)
        mb.add(prim_box(w * s + 0.12, 0.11, d * (0.97 if s == 1.0 else 0.9 if s == 0.9 else 0.75) + 0.12), 'iron', M((cx, y, zc - (0 if s == 1.0 else 0.1 if s == 0.9 else 0.25))), bevel=0.01)
    # boca do forno em arco com batente de ferro e leito de brasas
    zf = FZ1
    mb.add(prim_extrude(O.arch_poly(1.6, 1.8, Y0 + 0.35), 0.4, axis='z'), 'iron', M((cx, 0, zf - 0.12)), bevel=0.02)
    mb.add(prim_extrude(O.arch_poly(1.3, 1.6, Y0 + 0.4), 0.3, axis='z'), 'dark', M((cx, 0, zf - 0.05)))
    mb.add(prim_box(1.2, 0.2, 0.75), 'ember', M((cx, Y0 + 0.9, zf - 0.25)))
    for k in range(5):
        mb.add(prim_cone(0.1, 0.4 + 0.1 * (k % 2), 4), 'ember', M((cx - 0.45 + 0.22 * k, Y0 + 1.0, zf - 0.25)), smooth=0)
    # fornalha inferior: cinzeiro com grade de ferro
    mb.add(prim_extrude(O.arch_poly(0.9, 0.6, Y0 + 0.02), 0.3, axis='z'), 'dark', M((cx, 0, zf - 0.05)))
    for dx in (-0.25, 0.0, 0.25):
        mb.add(prim_box(0.05, 0.5, 0.06), 'iron', M((cx + dx, Y0 + 0.32, zf + 0.1)))
    # chaminé quadrada escalonada e afunilada até ~9,2 em (−1,8; −1,4)
    chx, chz = -1.8, -1.4
    mb.add(prim_box(1.3, 2.4, 1.3, taper=(0.8, 0.8), base=True), 'soot', M((chx, Y0 + 4.4, chz)), bevel=0.04)
    mb.add(prim_box(1.0, 2.6, 1.0, taper=(0.8, 0.8), base=True), 'soot', M((chx, Y0 + 6.8, chz)), bevel=0.04)
    for y in (Y0 + 5.2, Y0 + 7.4, Y0 + 8.6):
        mb.add(prim_box(1.2 if y < Y0 + 7 else 0.95, 0.12, 1.2 if y < Y0 + 7 else 0.95), 'iron', M((chx, y, chz)), bevel=0.01)
    # coifa de ferro com espinhos
    mb.add(prim_cone(0.85, 0.5, 4, base=True, phase=math.pi / 4), 'iron', M((chx, Y0 + 8.85, chz)), smooth=0)
    mb.add(prim_box(0.9, 0.12, 0.9), 'iron', M((chx, Y0 + 8.82, chz)), bevel=0.01)
    for k in range(4):
        a = 90 * k + 45
        x, z = O.polar(0.58, a)
        mb.add(prim_cone(0.07, 0.4, 4), 'iron', M((chx + x, Y0 + 9.0, chz + z), (0, 0, 0)))
    # crânio de ogro no frontão do forno e presas
    skull(mb, M((cx, Y0 + 2.75, zf + 0.0), (0, 0, 0)), 0.6, 'bone')
    for sx in (-1, 1):
        O.tusk(mb, (cx + sx * 1.1, Y0 + 0.4, zf - 0.1), (cx + sx * 0.3, Y0 + 2.6, zf - 0.1), (sx * 0.5, 0.2, 0.3), r0=0.13)
    return mb.build(mats, parent=root)


def build_shed(mats, root, banners):
    """Galpão de toras à direita-atrás com telhado de placas de ferro (apoio da bigorna e dos lingotes)."""
    mb = MeshBuilder('Shed')
    cx, cz, hx, hz = 1.9, -1.55, 1.3, 1.25
    wt = Y0 + 2.5
    for sx in (-1, 1):
        for sz in (-1, 1):
            mb.add(prim_box(0.28, 2.6, 0.28, base=True), 'bark', M((cx + sx * hx, Y0, cz + sz * hz)), bevel=0.03)
            mb.add(prim_box(0.34, 0.12, 0.34), 'iron', M((cx + sx * hx, Y0 + 0.2, cz + sz * hz)))
    O.log_wall(mb, (cx - hx, cz - hz), (cx + hx, cz - hz), Y0, 2.3, r=0.2)
    O.log_wall(mb, (cx + hx, cz - hz), (cx + hx, cz + hz), Y0, 2.3, r=0.2)
    for sx in (-1, 1):
        beam(mb, (cx + sx * hx, wt, cz - hz), (cx + sx * hx, wt, cz + hz), 0.22, 0.22, 'bark')
    beam(mb, (cx - hx, wt, cz + hz), (cx + hx, wt, cz + hz), 0.22, 0.22, 'bark')
    # telhado de meia-água de placas de ferro (cai para a frente), com espinhos
    rise = 0.8
    ang = math.degrees(math.atan2(rise, 2 * hz + 0.5))
    L = math.hypot(2 * hz + 0.7, rise)
    mb.add(prim_box(2 * hx + 0.7, 0.14, L), 'iron_plate', M((cx, wt + rise / 2 + 0.05, cz), (ang, 0, 0)), bevel=0.025)
    for k in range(6):
        x = cx - hx + (2 * hx) * k / 5
        mb.add(prim_cone(0.07, 0.4, 4), 'iron', M((x, wt + rise + 0.2, cz - hz - 0.2)))
    # bancada de ferreiro com tenazes e ferramentas
    mb.add(prim_box(1.9, 0.12, 0.7), 'plank', M((cx, Y0 + 0.95, cz - 0.7)), bevel=0.01)
    for sx in (-1, 1):
        mb.add(prim_box(0.14, 0.95, 0.6, base=True), 'bark', M((cx + sx * 0.8, Y0, cz - 0.7)))
    for k in range(4):   # lâminas e cabeças de machado em bruto
        mb.add(prim_box(0.7, 0.04, 0.12, taper=(1.0, 0.6)), 'steel', M((cx - 0.6 + 0.04 * k, Y0 + 1.03 + 0.04 * k, cz - 0.7 + 0.03 * k), (0, 8 * k, 0)))
    mb.add(prim_extrude([(0, 0.3), (0.28, 0.12), (0.28, -0.12), (0, -0.3), (-0.08, 0)], 0.05, axis='z'), 'steel',
           M((cx + 0.55, Y0 + 1.35, cz - 1.1), (0, 0, 0)), bevel=0.005)
    # lanterna
    mb.add(prim_box(0.18, 0.24, 0.18), 'glow', M((cx, wt - 0.5, cz + hz)), bevel=0.01)
    return mb.build(mats, parent=root)


def build_yard(mats, root, banners):
    mb = MeshBuilder('Yard')
    # bigorna sobre cepo de tronco entalhado em (1,6; topo 1,35; 1,8)
    ax, az = 1.6, 1.8
    mb.add(prim_cyl(0.42, 0.48, 0.62, 9, base=True), 'bark', M((ax, Y0, az)), smooth=40)
    mb.add(prim_cyl(0.42, 0.42, 0.03, 9), 'log_end', M((ax, Y0 + 0.62, az)))
    T = M((ax, Y0 + 0.65, az), (0, -20, 0))
    mb.add(prim_box(0.46, 0.2, 1.0, taper=(0.9, 0.55)), 'iron', T @ M((0, 0.1, 0)), bevel=0.012)
    mb.add(prim_box(0.34, 0.2, 0.46, taper=(0.6, 0.9)), 'iron', T @ M((0, 0.3, 0)), bevel=0.012)
    mb.add(prim_box(0.5, 0.14, 0.7), 'iron', T @ M((0, 0.47, 0)), bevel=0.012)
    mb.add(prim_cone(0.1, 0.55, 6), 'iron', T @ M((0, 0.47, 0.6), (90, 0, 0)))
    mb.add(prim_box(0.36, 0.05, 0.22), 'ember', T @ M((0, 0.56, 0.05)))        # lingote em brasa
    mb.add(prim_box(0.14, 0.05, 0.4), 'ember', T @ M((0, 0.57, 0.34)))
    # marreta gigante e tenazes
    log(mb, (ax + 0.9, Y0, az + 0.3), (ax + 0.7, Y0 + 1.5, az), 0.045, 'wood_light', n=6)
    mb.add(prim_box(0.6, 0.3, 0.3), 'iron', M((ax + 0.66, Y0 + 1.58, az - 0.02), (0, 0, 14)), bevel=0.02)
    # tina de têmpera (barril de madeira com aros)
    O.barrel_orc(mb, 0.2, Y0, 2.5, r=0.4, h=0.8)
    mb.add(prim_cyl(0.33, 0.33, 0.02, 9), 'water', M((0.2, Y0 + 0.78, 2.5)))
    # lingotes empilhados, lâminas e cabeças de machado em bruto
    for i in range(3):
        for j in range(3 - i):
            mb.add(prim_box(0.5, 0.14, 0.22), 'steel', M((-0.4 + 0.55 * j + 0.27 * i, Y0 + 0.07 + 0.15 * i, 3.0)), bevel=0.012)
    for k in range(3):
        mb.add(prim_extrude([(0, 0.35), (0.3, 0.15), (0.3, -0.15), (0, -0.35), (-0.1, 0)], 0.05, axis='y'), 'steel',
               M((-2.4 + 0.5 * k, Y0 + 0.05, 2.5), (0, 20 * k, 0)), bevel=0.005)
    # carvão e pilha de minério
    mb.add(prim_sphere(0.7, 0.35, 0.55, 8, 4, y_min=0.0), 'coal', M((-2.9, Y0, 1.6)), smooth=0)
    for k in range(6):
        a = k * 1.1
        mb.add(prim_sphere(0.1, 0.08, 0.1, 5, 3), 'rust', M((-2.9 + 0.5 * math.cos(a), Y0 + 0.05, 1.6 + 0.4 * math.sin(a))), smooth=0)
    # ossos e crânios decorativos; espinhos nos cantos
    skull(mb, M((2.8, Y0 + 0.1, 3.0), (0, -30, 0)), 0.3, 'bone')
    for sx in (-1, 1):
        O.banner_pole(mb, sx * 3.15, Y0, 3.05, 4.3, banners, ry=sx * 8, w=0.8, bh=1.2)
    return mb.build(mats, parent=root)


def build_banners(mats, root, mb):
    return mb.build(mats, parent=root)


def main():
    args = C.script_args()
    C.reset_scene()
    mats = C.make_paint_set(PALETTE)
    root = C.make_empty('OrcForge')
    bmb = MeshBuilder('Anim_Banners')
    base = build_base(mats, root)
    furnace = build_furnace(mats, root, bmb)
    shed = build_shed(mats, root, bmb)
    yard = build_yard(mats, root, bmb)
    banners = build_banners(mats, root, bmb)
    finish_building(root, 'orc_forge', 'orc_forge.glb', 'orc_forge_atlas', [base, furnace, shed, yard], banners,
                    {'Base': 0.5, 'Furnace': 1.3, 'Shed': 0.9, 'Yard': 1.0, 'Anim_Banners': 0.8},
                    TEAM_DEFAULT, args, spawn=(0, 0, 4.4), rally=(0, 0, 6.4), game_dist=90)


if __name__ == '__main__':
    main()
