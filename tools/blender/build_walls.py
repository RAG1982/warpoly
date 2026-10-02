"""
build_walls.py — blocos de muralha (humana de pedra e orc de paliçada) gerados 100% por script (F7-00b lote 2).

Uso:
  blender -b --factory-startup --python tools/blender/build_walls.py -- [human|orc|all] [--no-render]

Saída: public/models/wall_human.glb e wall_orc.glb. Um bloco de ~2,2 × 2,4 × 2,2 (mesma pegada do procedural de
`src/models/buildings/WallModel.js`), origem no centro da base, uma malha só (`Static_Mesh`, material `Atlas` 512², 1 draw call).
O `WallBatch` extrai a geometria e o material do .glb e os desenha em `InstancedMesh` (1 draw call por facção, `scaleY`
da obra e ocultação por instância preservados). Sem rotação por instância: os blocos são simétricos em x/z.
"""
import os
import sys
import math

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('ATLAS', '512')
import bpy  # noqa: E402
from mathutils import Vector, Matrix  # noqa: E402
import common as C  # noqa: E402
from common import (MeshBuilder, M, prim_box, prim_rings, ring_h, prim_cyl, prim_cone, prim_sphere)  # noqa: E402
from bld_common import beam, tube, log, bbox_game, finish_building  # noqa: E402
import bld_orc as O  # noqa: E402
import build_ogre_den as D  # noqa: E402

TEAM_DEFAULT = '#808080'

PALETTE = dict(D.PALETTE)
PALETTE.update(O.ORC_EXTRAS)
STONE = dict(base='#b3b9bf', var='#8e959c', var_scale=2.0, var_amt=0.8, fine=0.1, pattern='bricks', mapping='box',
             pw=0.8, ph=0.4, mortar='#5d636a', mortar_size=0.04, brick_tint='#cdd2d7', brick_tint_amt=0.6,
             brick_dark=0.84, brick_lite=1.08, top=0.4, edge='#e8ecef', edge_amt=0.45, edge_r=0.04, edge_gain=6.0,
             ao=(0.7, 0.8), ao_pow=1.3)
PALETTE.update({
    'wstone': STONE,
    'wstone_dark': dict(STONE, base='#6f757c', var='#4f555c', brick_tint='#868c93', pw=1.0, ph=0.5),
    'wstone_light': dict(STONE, base='#d6dbe0', var='#b3b9bf', brick_tint='#e8ecef', pw=0.7, ph=0.3),
})


def human(mb):
    mb.add(prim_box(2.2, 0.5, 2.2, base=True), 'wstone_dark', bevel=0.04)
    mb.add(prim_box(2.0, 1.5, 2.0, base=True), 'wstone', M((0, 0.5, 0)), bevel=0.03)
    mb.add(prim_box(2.2, 0.25, 2.2, base=True), 'wstone_light', M((0, 1.88, 0)), bevel=0.03)
    for sx in (-1, 1):
        for sz in (-1, 1):
            mb.add(prim_box(0.6, 0.35, 0.6, base=True), 'wstone_light', M((sx * 0.7, 2.1, sz * 0.7)), bevel=0.03)
    # seteiras nas quatro faces (decoração rasa, escura)
    for (x, z, ry) in ((0, 1.01, 0), (0, -1.01, 0), (1.01, 0, 90), (-1.01, 0, 90)):
        mb.add(prim_box(0.14, 0.62, 0.08), 'dark', M((x, 0.95, z), (0, ry, 0)))


def orc(mb):
    # base de pedra bruta + anel de toras pontiagudas (3 por face) + cintas de ferro + espinhos de canto
    mb.add(prim_box(2.25, 0.35, 2.25, base=True), 'rock_plain', bevel=0.04)
    hs = (0.0, 0.25, 0.1, 0.3, 0.05)
    k = 0
    for i, x in enumerate((-0.7, 0.0, 0.7)):
        for z in (-0.85, 0.85):
            h = 1.45 + hs[k % 5]; k += 1
            log(mb, (x, 0.3, z), (x, 0.3 + h, z), 0.27, 'bark', n=6, tip=0.45)
    for z in (-0.4, 0.4):
        for x in (-0.85, 0.85):
            h = 1.45 + hs[k % 5]; k += 1
            log(mb, (x, 0.3, z), (x, 0.3 + h, z), 0.27, 'bark', n=6, tip=0.45)
    # miolo escuro para fechar os vãos
    mb.add(prim_box(1.6, 1.25, 1.6, base=True), 'dark', M((0, 0.3, 0)))
    for y in (0.75, 1.55):
        mb.add(prim_box(2.25, 0.14, 2.25), 'iron', M((0, y, 0)), bevel=0.01)
    for sx in (-1, 1):
        for sz in (-1, 1):
            mb.add(prim_cone(0.11, 0.55, 4), 'iron', M((sx * 0.85, 1.7, sz * 0.85)), smooth=0)


def build(kind):
    C.reset_scene()
    mats = C.make_paint_set(PALETTE)
    root = C.make_empty('WallHuman' if kind == 'human' else 'WallOrc')
    mb = MeshBuilder('Block')
    (human if kind == 'human' else orc)(mb)
    part = mb.build(mats, parent=root)
    out = f'wall_{kind}'
    finish_building(root, out, out + '.glb', out + '_atlas', [part], None, {'Block': 1.0}, TEAM_DEFAULT,
                    C.script_args(), spawn=(0, 0, 0), rally=(0, 0, 0), game_dist=40)
    print('BBOX', bbox_game(root))


def main():
    args = C.script_args()
    kinds = [a for a in args if a in ('human', 'orc')] or ['human', 'orc']
    for k in kinds:
        build(k)


if __name__ == '__main__':
    main()
