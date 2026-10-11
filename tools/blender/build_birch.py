"""
build_birch.py — bétula do mapa gerada 100% por script (F7-00b, agente B). Mesmo padrão de `build_trees.py`.

Uso:
  blender -b --factory-startup --python tools/blender/build_birch.py -- [--no-render]

Saída: public/models/tree_birch.glb (raiz `TreeBirch`). Uma malha só (`Static_Mesh`, material `Atlas` 512², 1 draw call),
origem no pé do tronco, y para cima, ~6,9 u de altura (carvalho ~6,7; pinheiro ~7,5). Tronco esguio de curva suave em S com
base alargada em três lóbulos de raiz, casca branco-giz com lenticelas escuras horizontais (padrão procedural próprio, só
no bake), dez galhos finos e dez copas facetadas verde-limão em três andares (copa oval, mais clara que a do carvalho,
deixa ver o tronco). O `TreeManager` extrai geometria e material do .glb e a desenha em `InstancedMesh` (como
carvalho/pinheiro/outono).

Atlas: tronco e copas são objetos separados (o tronco recebe mais área de textura para as lenticelas aparecerem) com
margem de empacotamento maior que a do `finish_building` (as ilhas verdes vazavam para dentro da casca branca).
`BIRCH_DEBUG_DIR=<pasta>` salva closes do tronco fora do repositório.
"""
import os
import sys
import math

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('ATLAS', '512')
import bpy  # noqa: E402
import common as C  # noqa: E402
from common import (MeshBuilder, M, prim_rings, ring_h, prim_sphere, limb_rings)  # noqa: E402
from bld_common import bbox_game  # noqa: E402

TEAM_DEFAULT = '#808080'

PALETTE = {
    'bark_dark': dict(base='#6f6354', var='#463c31', var_scale=5.0, var_amt=0.9, fine=0.14, fine_scale=40.0, top=0.25,
                      edge='#a39581', edge_amt=0.3, edge_r=0.03, ao=(0.7, 0.8), coord='obj'),
    'leaf': dict(base='#98c845', var='#6aa536', var_scale=1.8, var_amt=1.0, fine=0.14, top=0.55, edge='#d0f080',
                 edge_amt=0.35, edge_r=0.05, ao=(1.0, 0.7)),
    'leaf_light': dict(base='#bcdc5e', var='#98c845', var_scale=2.0, var_amt=1.0, fine=0.12, top=0.6,
                       edge='#ecf8a8', edge_amt=0.35, edge_r=0.05, ao=(1.0, 0.65)),
    'leaf_gold': dict(base='#bfd04c', var='#9db83c', var_scale=1.7, var_amt=1.0, fine=0.14, top=0.6,
                      edge='#eef290', edge_amt=0.4, edge_r=0.05, ao=(1.0, 0.65)),
    'leaf_dark': dict(base='#74a83a', var='#4f8a2e', var_scale=1.8, var_amt=1.0, fine=0.14, top=0.5, edge='#b4e070',
                      edge_amt=0.3, edge_r=0.05, ao=(1.0, 0.75)),
}


def birch_bark(name):
    """Casca da bétula (material de pintura só para o bake): branco-giz mosqueado, lenticelas escuras horizontais,
    cicatrizes de galho, base escurecida, luz de topo e oclusão ambiente. Coordenadas do OBJETO (o tronco corre ao
    longo de Z do Blender)."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    nb = C.NB(nt)
    geo = nb.node('ShaderNodeNewGeometry')
    tc = nb.node('ShaderNodeTexCoord')
    obj = tc.outputs['Object']
    ox, oy, oz = nb.sep(obj)
    # mosqueado de branco-giz e cinza-quente
    blot = nb.noise(obj, scale=2.4, detail=3.0, rough=0.6, distortion=0.4)
    blot = nb.ramp(blot, [(0.34, 0.0), (0.66, 1.0)])
    col = nb.mix(nb.math('MULTIPLY', nb.bw(blot), 0.6), nb.rgb('#f4f0e4'), nb.rgb('#b7b1a0'))
    fine = nb.noise(obj, scale=38.0, detail=2.0, rough=0.5)
    col = nb.scale(col, nb.math('ADD', 0.93, nb.math('MULTIPLY', fine, 0.14)))
    # lenticelas: faixas escuras curtas e horizontais (ruído esticado em Z: frequência alta na altura, baixa ao redor)
    squash = nb.comb(nb.math('MULTIPLY', ox, 5.5), nb.math('MULTIPLY', oy, 5.5), nb.math('MULTIPLY', oz, 24.0))
    bands = nb.noise(squash, scale=1.0, detail=1.0, rough=0.5, distortion=0.15)
    bands = nb.ramp(bands, [(0.585, 0.0), (0.64, 1.0)])
    col = nb.mix(nb.math('MULTIPLY', nb.bw(bands), 0.92), col, nb.rgb('#2b2723'))
    # grandes cicatrizes escuras esparsas (nós de galhos podados)
    scars = nb.voronoi(nb.comb(nb.math('MULTIPLY', ox, 3.0), nb.math('MULTIPLY', oy, 3.0), nb.math('MULTIPLY', oz, 1.1)),
                       scale=1.0, out='Distance', feature='F1', randomness=1.0)
    scars = nb.ramp(scars, [(0.0, 1.0), (0.09, 1.0), (0.2, 0.0)])
    col = nb.mix(nb.math('MULTIPLY', nb.bw(scars), 0.55), col, nb.rgb('#4a4239'))
    # pé do tronco: escuro e rugoso como a bétula real (altura em coordenadas do mundo)
    _, _, pz = nb.sep(geo.outputs['Position'])
    foot = nb.math('MINIMUM', nb.math('MAXIMUM', nb.math('SUBTRACT', 1.0, nb.math('DIVIDE', pz, 0.95)), 0.0), 1.0)
    foot = nb.math('POWER', foot, 0.8)
    col = nb.mix(nb.math('MULTIPLY', foot, 0.95), col, nb.rgb('#2a2520'))
    t = nb.math('MINIMUM', nb.math('MAXIMUM', nb.math('DIVIDE', pz, 1.8), 0.0), 1.0)
    col = nb.scale(col, nb.math('ADD', 0.72, nb.math('MULTIPLY', t, 0.28)))
    # luz de topo pintada + oclusão ambiente
    _, _, nz = nb.sep(geo.outputs['Normal'])
    col = nb.scale(col, nb.math('ADD', 1.0, nb.math('MULTIPLY', nz, 0.22)))
    ao = nb.node('ShaderNodeAmbientOcclusion', samples=16, only_local=False)
    ao.inputs['Distance'].default_value = 0.6
    col = nb.scale(col, nb.math('ADD', 0.3, nb.math('MULTIPLY', ao.outputs['AO'], 0.7)))
    em = nb.node('ShaderNodeEmission')
    nb.link(col, em.inputs['Color'])
    out = nb.node('ShaderNodeOutputMaterial')
    nt.links.new(em.outputs[0], out.inputs['Surface'])
    mat['paint_key'] = name
    mat['is_team'] = False
    return mat


# Tronco: estações (altura, raio, amplitude do lóbulo de raiz); o eixo faz uma curva suave em S (`axis`)
TRUNK = [(0.0, 0.50, 0.5), (0.2, 0.40, 0.3), (0.55, 0.33, 0.1), (1.4, 0.29, 0.0), (2.5, 0.245, 0.0), (3.5, 0.205, 0.0),
         (4.4, 0.165, 0.0), (5.1, 0.12, 0.0), (5.7, 0.06, 0.0)]


def axis(y):
    """(x, z) do eixo do tronco na altura y."""
    return 0.17 * math.sin(y * 0.62 - 0.2) + 0.03, 0.06 * math.sin(y * 0.9)


def branch(mb, y0, target, r0=0.075, r1=0.035):
    """Galho fino do tronco (altura y0) até o centro de uma copa."""
    ax, az = axis(y0)
    pts = [(ax, y0, az), target]
    mb.add(prim_rings(limb_rings(pts, [r0, r1], 5, up=(0, 0, 1))), 'bark', smooth=45)


# Copas em três andares: (x, y, z, rx, ry, rz, material). Oval; o tronco branco fica à vista abaixo e entre elas
CROWNS = [(0.05, 5.95, 0.0, 0.85, 0.90, 0.82, 'leaf_light'),                                   # topo
          (0.95, 5.25, 0.35, 0.95, 0.78, 0.88, 'leaf'), (-0.75, 5.30, 0.85, 0.90, 0.76, 0.85, 'leaf_gold'),
          (-0.85, 5.20, -0.65, 0.92, 0.78, 0.86, 'leaf_light'), (0.55, 5.10, -0.90, 0.85, 0.72, 0.82, 'leaf'),
          (1.15, 4.35, -0.35, 0.92, 0.70, 0.85, 'leaf_light'), (-1.15, 4.25, 0.00, 0.95, 0.72, 0.88, 'leaf'),
          (0.10, 4.20, 1.10, 0.90, 0.68, 0.84, 'leaf_gold'),
          (0.75, 3.60, 0.70, 0.70, 0.55, 0.66, 'leaf_dark'), (-0.70, 3.55, -0.60, 0.70, 0.55, 0.66, 'leaf')]


def build_trunk(mats, root):
    mb = MeshBuilder('Trunk')
    rings = []
    for (y, r, lobe) in TRUNK:
        cx, cz = axis(y)

        def sq(a, lobe=lobe):  # três lóbulos de raiz que afinam e somem com a altura
            return 1.0 + lobe * max(0.0, math.cos(3.0 * (a - 0.5))) ** 2
        rings.append(ring_h(y, r, r, 10, cx=cx, cz=cz, phase=math.pi / 10, squash=sq))
    mb.add(prim_rings(rings), 'bark', smooth=60)
    # galhos finos: (altura de saída, centro da copa que sustentam)
    for (y0, tgt) in ((3.3, (0.75, 3.6, 0.7)), (3.4, (-0.7, 3.55, -0.6)), (3.7, (1.15, 4.35, -0.35)),
                      (3.9, (-1.15, 4.25, 0.0)), (4.2, (0.1, 4.2, 1.1)), (4.7, (0.95, 5.25, 0.35)),
                      (4.8, (0.55, 5.1, -0.9)), (4.9, (-0.85, 5.2, -0.65)), (5.0, (-0.75, 5.3, 0.85)),
                      (5.3, (0.05, 5.95, 0.0))):
        branch(mb, y0, tgt)
    return mb.build(mats, parent=root)


def build_crown(mats, root):
    mb = MeshBuilder('Crown')
    for k, (x, y, z, rx, ry, rz, mat) in enumerate(CROWNS):
        mb.add(prim_sphere(rx, ry, rz, 8, 4), mat,
               M((x, y, z), (14 * math.sin(k * 2.3), k * 47, 16 * math.cos(k * 1.7))), smooth=0)
    return mb.build(mats, parent=root)


def finish(root, parts, name):
    """UV atlas -> bake -> materiais -> `Static_Mesh` -> sockets -> export. (Como `finish_building`, com margem maior.)"""
    bpy.context.view_layer.update()
    C.uv_atlas(parts, weights={'Trunk': 2.2, 'Crown': 1.0}, margin=0.014, angle=66.0)
    img = C.bake_atlas(parts, name + '_atlas', 512, samples=int(os.environ.get('BAKE_SAMPLES', 32)), margin=4)
    C.finalize_materials(parts, img, team_default=TEAM_DEFAULT, out_png=os.path.join(C.BUILD_DIR, name + '_atlas.png'))
    static = C.join_objects(list(parts), 'Static_Mesh')
    static.parent = root
    C.make_empty('Socket_UnitSpawn', (0, 0, 0), parent=root)
    C.make_empty('Socket_Rally', (0, 0, 0), parent=root)
    bpy.context.view_layer.update()
    out = os.path.join(C.OUT_MODELS, name + '.glb')
    C.export_glb(root, out, quality=80)
    print('STATS', name, C.stats(root, out))
    print('BBOX', bbox_game(root))


def main():
    args = C.script_args()
    C.reset_scene()
    mats = C.make_paint_set(PALETTE)
    mats['bark'] = birch_bark('P_bark')
    root = C.make_empty('TreeBirch')
    trunk = build_trunk(mats, root)
    crown = build_crown(mats, root)
    finish(root, [trunk, crown], 'tree_birch')
    if '--no-render' in args:
        return
    rig = C.RenderRig(root, 'tree_birch', res=int(os.environ.get('RENDER_RES', 800)), samples=24)
    rig.render('34', (1.0, 0.55, 1.0), 30)
    rig.render('front', (0.0, 0.2, 1.0), 30)
    rig.render('game', (45, 44, 45), 30, dist=40)
    # closes do tronco para revisar a casca e a base: fora do repositório
    scratch = os.environ.get('BIRCH_DEBUG_DIR')
    if scratch:
        C.RENDERS = scratch
        os.makedirs(scratch, exist_ok=True)
        rig.center.z = 1.6
        rig.render('trunkA', (0.5, 0.15, 1.0), 30, zoom=0.34)
        rig.render('trunkB', (-1.0, 0.15, 0.5), 30, zoom=0.34)
        rig.center.z = 0.5
        rig.render('base', (0.7, 0.4, 1.0), 30, zoom=0.2)


if __name__ == '__main__':
    main()
