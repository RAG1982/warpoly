"""
build_pig_farm.py — Pocilga/Chiqueiro de Porcos orc (tipo interno `pig_farm`) gerada 100% por script.

Uso:
  blender -b --factory-startup --python tools/blender/build_pig_farm.py -- [--no-render]

Saída (public/models/pig_farm.glb), coordenadas do jogo, origem no centro da base, frente = +Z:
  PigFarm (raiz)
  ├─ Static_Mesh       curral de paliçada de toras pontiagudas com porteira, atoleiro de lama, galpão de toras
  │                    com telhado de peles e palha, cochos com lavagem, fardos de palha, ossos, poste de abate com ganchos e barris (Atlas)
  ├─ Anim_Banners      estandartes esfarrapados (material TeamColor)
  ├─ Socket_UnitSpawn  saída (porteira)
  └─ Socket_Rally      ponto de reunião padrão
Pegada ~6 x 6 (raio de colisão 2,8), altura ~4,4. 2 draw calls.
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
Y0 = 0.26

PALETTE = dict(D.PALETTE)
PALETTE.update(O.ORC_EXTRAS)


def build_base(mats, root):
    mb = MeshBuilder('Base')
    mb.add(prim_box(6.0, Y0, 6.0, taper=(0.975, 0.975), base=True), 'rock', bevel=0.07)
    mb.add(prim_box(5.8, 0.05, 5.8, base=True), 'mud', M((0, Y0, 0)))
    # atoleiro de lama escura no curral
    mb.add(prim_sphere(1.7, 0.1, 1.2, 10, 3, y_min=0.0), 'slop', M((-0.3, Y0 + 0.04, 0.6)), smooth=60)
    return mb.build(mats, parent=root)


def build_fence(mats, root):
    mb = MeshBuilder('Fence')
    jit = [0.0, 0.3, 0.1, 0.4, 0.15, 0.35]
    # curral: lados esquerdo, direito e fundo em paliçada; frente com porteira central
    O.spiked_logs(mb, (-2.85, -2.85), (2.85, -2.85), 12, 1.6, jit, Y0, r=0.2, tip=0.45)
    O.spiked_logs(mb, (-2.85, -2.85), (-2.85, 2.85), 12, 1.6, jit[1:] + jit[:1], Y0, r=0.2, tip=0.45)
    O.spiked_logs(mb, (2.85, -2.85), (2.85, 2.85), 12, 1.6, jit[2:] + jit[:2], Y0, r=0.2, tip=0.45)
    O.spiked_logs(mb, (-2.85, 2.85), (-0.75, 2.85), 4, 1.5, jit, Y0, r=0.2, tip=0.45)
    O.spiked_logs(mb, (0.75, 2.85), (2.85, 2.85), 4, 1.5, jit[3:] + jit[:3], Y0, r=0.2, tip=0.45)
    # travessas de ferro e cordas
    for y in (Y0 + 0.6, Y0 + 1.15):
        mb.add(prim_box(5.9, 0.07, 0.09), 'iron', M((0, y, -2.98)))
        for sx in (-1, 1):
            mb.add(prim_box(0.09, 0.07, 5.8), 'iron', M((sx * 2.98, y, 0.0)))
    # porteira de tábuas aberta + mourões com crânios
    for sx in (-1, 1):
        x = sx * 0.78
        mb.add(prim_box(0.3, 2.0, 0.3, base=True), 'bark', M((x, Y0, 2.85)), bevel=0.03)
        skull(mb, M((x, Y0 + 2.18, 2.85), (0, sx * -10, 0)), 0.3, 'bone')
    mb.add(prim_box(0.9, 0.9, 0.08, base=True), 'plank', M((-0.35, Y0 + 0.05, 3.25), (0, 65, 0)), bevel=0.01)
    mb.add(prim_box(0.9, 0.06, 0.12), 'iron', M((-0.35, Y0 + 0.55, 3.25), (0, 65, 0)))
    return mb.build(mats, parent=root)


def build_shed(mats, root, banners):
    mb = MeshBuilder('Shed')
    cx, cz, hx, hz = -0.6, -2.15, 1.7, 0.6
    wt = Y0 + 2.0
    # galpão de toras com frente aberta (para dentro do curral) e telhado de peles/palha
    O.log_wall(mb, (cx - hx, cz - hz), (cx + hx, cz - hz), Y0, 1.9, r=0.19)
    O.log_wall(mb, (cx - hx, cz - hz), (cx - hx, cz + hz), Y0, 1.9, r=0.19)
    O.log_wall(mb, (cx + hx, cz - hz), (cx + hx, cz + hz), Y0, 1.9, r=0.19)
    for x in (cx - hx, cx + hx):
        for z in (cz + hz,):
            mb.add(prim_box(0.3, 2.1, 0.3, base=True), 'bark', M((x, Y0, z)), bevel=0.03)
    mb.add(prim_box(2 * hx + 0.5, 0.2, 0.3), 'log', M((cx, wt - 0.05, cz + hz)), bevel=0.02)
    O.hide_roof(mb, cx, cz, hx, hz, wt, 0.95, hide='straw', ridge='log', rib='bone', ov=0.5, ov_z=0.5)
    # frontão de peles esticadas atrás/na frente
    gable = [(-hx, 0.0), (hx, 0.0), (0.0, 0.95)]
    mb.add(prim_extrude(gable, 0.12, axis='z'), 'hide', M((cx, wt, cz - hz + 0.06)))
    # palha no chão e fardos
    mb.add(prim_box(2 * hx - 0.3, 0.06, 2 * hz - 0.3, base=True), 'straw', M((cx, Y0, cz)))
    for (x, z, r) in ((cx - 0.9, cz - 0.1, 10), (cx + 0.9, cz - 0.15, -15)):
        mb.add(prim_box(0.8, 0.45, 0.5, base=True), 'straw', M((x, Y0 + 0.04, z), (0, r, 0)), bevel=0.04)
        mb.add(prim_box(0.05, 0.47, 0.52, base=True), 'rope', M((x, Y0 + 0.04, z), (0, r, 0)))
    return mb.build(mats, parent=root)


def build_props(mats, root, banners):
    mb = MeshBuilder('Props')
    # cochos de madeira com lavagem (esquerda e direita)
    for (x, z, rot) in ((2.3, -0.2, 90), (-2.3, 0.9, 90)):
        mb.add(prim_box(1.4, 0.4, 0.5, taper=(0.95, 0.92), base=True), 'log', M((x, Y0, z), (0, rot, 0)), bevel=0.03)
        mb.add(prim_box(1.2, 0.04, 0.34), 'slop', M((x, Y0 + 0.38, z), (0, rot, 0)))
        for sx in (-1, 1):
            mb.add(prim_box(0.08, 0.3, 0.52), 'iron', M((x + sx * 0.6 * math.cos(math.radians(rot)), Y0 + 0.22, z - sx * 0.6 * math.sin(math.radians(rot))), (0, rot, 0)))
    # (os porcos são autônomos, criados por `PigFarm.js`; o .glb deixa x −1,7..2,1 / z −1,7..1,9 livre)
    # poste de abate com ganchos (direita-fundo), ossos e crânios, barris
    log(mb, (2.55, Y0, -2.3), (2.55, Y0 + 2.3, -2.3), 0.09, 'bark', n=6)
    mb.add(prim_box(1.1, 0.1, 0.1), 'bark', M((2.15, Y0 + 2.2, -2.3)), bevel=0.01)
    for dx in (1.85, 2.25, 2.55):
        mb.add(prim_cone(0.03, 0.3, 4), 'iron', M((dx, Y0 + 1.8, -2.3), (180, 0, 0)))
        beam(mb, (dx, Y0 + 2.2, -2.3), (dx, Y0 + 1.95, -2.3), 0.03, 0.03, 'iron')
    for k in range(4):
        mb.add(prim_sphere(0.1, 0.05, 0.07, 6, 3), 'bone', M((2.1 + 0.2 * math.cos(k * 2.0), Y0 + 0.03, -1.0 + 0.2 * math.sin(k * 2.0)), (0, k * 40, 0)), smooth=60)
    skull(mb, M((2.5, Y0 + 0.08, -0.7), (0, 40, 0)), 0.22, 'bone')
    O.barrel_orc(mb, 2.45, Y0, 0.4)
    O.barrel_orc(mb, 2.6, Y0, 0.95, r=0.22, h=0.5)
    # mastros de estandarte nos cantos da frente
    for sx in (-1, 1):
        O.banner_pole(mb, sx * 3.15, Y0, 3.1, 3.7, banners, ry=sx * 8, w=0.75, bh=1.1)
    return mb.build(mats, parent=root)


def build_banners(mats, root, mb):
    return mb.build(mats, parent=root)


def main():
    args = C.script_args()
    C.reset_scene()
    mats = C.make_paint_set(PALETTE)
    root = C.make_empty('PigFarm')
    bmb = MeshBuilder('Anim_Banners')
    base = build_base(mats, root)
    fence = build_fence(mats, root)
    shed = build_shed(mats, root, bmb)
    props = build_props(mats, root, bmb)
    banners = build_banners(mats, root, bmb)
    finish_building(root, 'pig_farm', 'pig_farm.glb', 'pig_farm_atlas', [base, fence, shed, props], banners,
                    {'Base': 0.5, 'Fence': 1.0, 'Shed': 1.0, 'Props': 1.2, 'Anim_Banners': 0.8},
                    TEAM_DEFAULT, args, spawn=(0, 0, 4.4), rally=(0, 0, 6.4))


if __name__ == '__main__':
    main()
