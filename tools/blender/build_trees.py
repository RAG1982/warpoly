"""
build_trees.py — árvores do mapa (carvalho, pinheiro, carvalho de outono) geradas 100% por script (F7-00b lote 2).

Uso:
  blender -b --factory-startup --python tools/blender/build_trees.py -- [oak|pine|autumn|all] [--no-render]

Saída: public/models/tree_oak.glb, tree_pine.glb, tree_autumn.glb. Uma malha por árvore (`Static_Mesh`, material
`Atlas` 512², 1 draw call), origem no pé do tronco, y para cima, ~470 tris o carvalho e ~250 o pinheiro: o mesmo
orçamento das malhas procedurais do `TreeManager` (que as usa em `InstancedMesh`, uma por tipo). Copas facetadas
com luz/sombra pintadas no bake. O `birch` continua procedural (não é instanciado).
"""
import os
import sys
import math

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('ATLAS', '512')
import bpy  # noqa: E402
from mathutils import Vector, Matrix  # noqa: E402
import common as C  # noqa: E402
from common import (MeshBuilder, M, prim_box, prim_rings, ring_h, prim_cyl, prim_cone,  # noqa: E402
                    prim_sphere)
from bld_common import beam, tube, log, bbox_game, finish_building  # noqa: E402

TEAM_DEFAULT = '#808080'

PALETTE = {
    'bark': dict(base='#5a4030', var='#3a291d', var_scale=5.0, var_amt=0.9, fine=0.14, fine_scale=40.0, top=0.25,
                 edge='#8a6a4a', edge_amt=0.3, edge_r=0.03, ao=(0.8, 0.8), coord='obj'),
    'bark_pine': dict(base='#4e3626', var='#2e2016', var_scale=6.0, var_amt=0.9, fine=0.16, fine_scale=40.0, top=0.25,
                      ao=(0.8, 0.8)),
    'leaf': dict(base='#4f8f3a', var='#2f6a26', var_scale=1.6, var_amt=1.0, fine=0.14, top=0.55, edge='#8fc45a',
                 edge_amt=0.35, edge_r=0.05, ao=(1.3, 0.95)),
    'leaf_light': dict(base='#7ab04a', var='#4f8f3a', var_scale=2.0, var_amt=1.0, fine=0.12, top=0.6,
                       edge='#b7e07a', edge_amt=0.35, edge_r=0.05, ao=(1.2, 0.9)),
    'needle': dict(base='#2f6a44', var='#1c4a30', var_scale=1.4, var_amt=1.0, fine=0.14, top=0.55, edge='#6ab07a',
                   edge_amt=0.3, edge_r=0.05, ao=(1.4, 1.0)),
    'needle_light': dict(base='#3f8556', var='#2a6444', var_scale=1.8, var_amt=1.0, fine=0.12, top=0.6, ao=(1.2, 0.9)),
    'autumn': dict(base='#d9791c', var='#b0401a', var_scale=1.6, var_amt=1.0, fine=0.14, top=0.6, edge='#ffc070',
                   edge_amt=0.4, edge_r=0.05, ao=(1.3, 0.95)),
    'autumn_light': dict(base='#f0a428', var='#d9791c', var_scale=2.0, var_amt=1.0, fine=0.12, top=0.65,
                         edge='#ffe090', edge_amt=0.4, edge_r=0.05, ao=(1.2, 0.9)),
}


def oak(mb, autumn=False):
    # tronco em duas partes + nó + raízes + galhos
    mb.add(prim_cyl(0.76, 0.52, 1.8, 7, base=True), 'bark', smooth=40)
    mb.add(prim_cyl(0.52, 0.40, 1.7, 7, base=True), 'bark', M((0.04, 1.8, 0.02), (-3, 8, 4)), smooth=40)
    for (sx, sz, ex, ez) in ((0.35, 0.0, 1.15, 0.1), (-0.32, 0.15, -1.15, 0.35), (0.0, -0.32, 0.0, -1.15)):
        beam(mb, (sx, 0.65, sz), (ex, 0.05, ez), 0.28, 0.2, 'bark', smooth=40)
    for (ex, ey, ez) in ((0.95, 3.85, 0.65), (-1.05, 3.8, 0.55), (0.1, 3.9, -0.9)):
        beam(mb, (0.0, 2.9, 0.0), (ex, ey, ez), 0.24, 0.15, 'bark', smooth=40)
    cl = [(0.05, 4.85, 0.05, 1.85, 0.95), (-1.25, 3.55, 0.85, 1.5, 0.92), (1.2, 3.65, 0.7, 1.55, 0.95),
          (-1.1, 3.75, -0.95, 1.42, 0.9), (1.05, 3.45, -1.05, 1.48, 0.93), (-0.65, 4.45, -0.35, 1.25, 1.0),
          (0.75, 4.55, 0.3, 1.3, 0.96)]
    for k, (x, y, z, r, sy) in enumerate(cl):
        mat = ('autumn_light' if k % 2 else 'autumn') if autumn else ('leaf_light' if k % 2 else 'leaf')
        mb.add(prim_sphere(r, r * sy, r, 8, 5), mat, M((x, y, z), (12 * math.sin(k * 2.3), k * 53, 14 * math.cos(k * 1.7))), smooth=0)


def pine(mb):
    mb.add(prim_cyl(0.54, 0.36, 2.2, 7, base=True), 'bark_pine', smooth=40)
    mb.add(prim_cyl(0.36, 0.24, 2.4, 6, base=True), 'bark_pine', M((0, 2.2, 0)), smooth=40)
    mb.add(prim_cyl(0.24, 0.12, 2.0, 5, base=True), 'bark_pine', M((0, 4.6, 0)), smooth=40)
    for (sx, sz, ex, ez) in ((0.24, 0.0, 0.95, 0.0), (-0.2, 0.15, -0.85, 0.45), (-0.1, -0.22, -0.45, -0.9)):
        beam(mb, (sx, 0.45, sz), (ex, 0.05, ez), 0.2, 0.12, 'bark_pine', smooth=40)
    for k, (r, h, y, seg) in enumerate(((2.35, 2.0, 1.4, 8), (1.95, 1.8, 2.75, 8), (1.5, 1.65, 3.95, 7),
                                        (1.05, 1.45, 5.1, 6), (0.58, 1.25, 6.15, 5))):
        mb.add(prim_cone(r, h, seg), 'needle_light' if k % 2 else 'needle', M((0, y, 0), (0, k * 37, 0)), smooth=0)
    mb.add(prim_cone(0.18, 0.6, 4), 'needle_light', M((0, 6.85, 0)), smooth=0)


def build(kind):
    C.reset_scene()
    mats = C.make_paint_set(PALETTE)
    name = {'oak': 'TreeOak', 'pine': 'TreePine', 'autumn': 'TreeAutumn'}[kind]
    root = C.make_empty(name)
    mb = MeshBuilder('Tree')
    if kind == 'pine':
        pine(mb)
    else:
        oak(mb, autumn=(kind == 'autumn'))
    part = mb.build(mats, parent=root)
    out = f'tree_{kind}'
    finish_building(root, out, out + '.glb', out + '_atlas', [part], None, {'Tree': 1.0}, TEAM_DEFAULT,
                    C.script_args(), spawn=(0, 0, 0), rally=(0, 0, 0), game_dist=40)


def main():
    args = C.script_args()
    kinds = [a for a in args if a in ('oak', 'pine', 'autumn')] or ['oak', 'pine', 'autumn']
    if 'all' in args:
        kinds = ['oak', 'pine', 'autumn']
    for k in kinds:
        build(k)


if __name__ == '__main__':
    main()
