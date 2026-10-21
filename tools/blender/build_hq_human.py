"""
build_hq_human.py — Centro humano em 3 níveis (M2-33): Paço Real (casa de enxaimel) → Fortaleza → Castelo de Aldária,
gerados a partir dos FBX do Tripo (1 malha, ~18-19 mil triângulos, SEM rig, textura 512²).

Todas as constantes por nível ficam em LEVELS; a função `construir(nivel)` é comum.

Saída (coordenadas do jogo, origem no centro da base, frente/porta em +Z, pés em y=0):
  public/models/hq_human_1.glb | hq_human_2.glb | hq_human_3.glb
  HqHumanN (raiz)
  ├─ Static_Mesh       a malha inteira; 2 materiais: `Atlas` (pedra/madeira/telhado) e `TeamColor` (bandeiras e estandartes)
  ├─ Socket_UnitSpawn  saída das unidades (frente da porta)
  └─ Socket_Rally      ponto de reunião padrão
Orçamento: 2 draw calls, ~18-19 mil triângulos, textura 512² (a do Tripo, com os texels de TeamColor em cinza).

Escala (o Tripo normaliza todos à altura 1,0): ALTURA multiplica o eixo y do jogo; SXZ multiplica x e z (pegada). Pegada e altura
crescem do nível 1 ao 3; o raio de colisão do Centro (`collisionRadius` 5,5 em src/data/buildings.js) vale para os três.

Uso:
  blender -b --factory-startup --python tools/blender/build_hq_human.py -- [--nivel=1|2|3] [--no-render] [--previas=pasta]
Rodar sempre via tools/safe-run.sh (ver CLAUDE.md).
"""
import os
import sys
import colorsys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))

import bpy  # noqa: E402
import common as C  # noqa: E402
import hero_common as HC  # noqa: E402
from hero_common import log  # noqa: E402

DL = '/home/rafael/Downloads'
OUT_PREVIAS = os.path.join(REPO, 'tools', 'ui-captures', 'hq-human')
TEAM_DEFAULT = '#3a66d6'
ATLAS = 512
DILATACAO_TIME = 1
PROTECAO_TIME = 1
CRESCER = 4           # anéis de crescimento das sementes
FROUXO = dict(hue=(212, 250), sat=0.18, val=0.24)
FRACAO_TIME = 0.5      # fração das amostras (centro + cantos recuados) da face que precisa ter a cor de time

# --- constantes por nível -----------------------------------------------------------------------------------------------
#  ALTURA / SXZ: tamanho final em unidades do jogo (altura em y; SXZ multiplica a pegada x/z do FBX normalizado)
#  COR_TIME: faixa de matiz (graus), saturação mínima e valor mínimo das faces que viram TeamColor (bandeiras/estandartes)
LEVELS = {
    1: dict(fbx=DL + '/Centro1/tripo_convert_9627a66a-3732-4a93-ad72-20103b5f6cea.fbx', glb='hq_human_1.glb', raiz='HqHuman1',
            atlas='hq_human_1_atlas', altura=9.0, sxz=10.0,
            cor_time=dict(hue=(208, 250), sat=0.30, val=0.30), spawn=(0.0, 0.0, 4.9), rally=(0.0, 0.0, 6.9)),
    2: dict(fbx=DL + '/centro1-2/tripo_convert_6aa35e7d-d787-44ec-8238-2e39adeee0ba.fbx', glb='hq_human_2.glb', raiz='HqHuman2',
            atlas='hq_human_2_atlas', altura=12.5, sxz=14.5,
            cor_time=dict(hue=(222, 250), sat=0.30, val=0.28), z_bandeira=0.84, spawn=(0.0, 0.0, 5.2), rally=(0.0, 0.0, 7.2)),
    3: dict(fbx=DL + '/centro1-3/tripo_convert_82042048-7b13-4749-9f5f-79e92d9f7587.fbx', glb='hq_human_3.glb', raiz='HqHuman3',
            atlas='hq_human_3_atlas', altura=15.5, sxz=18.0,
            cor_time=dict(hue=(217, 250), sat=0.22, val=0.28), spawn=(0.0, 0.0, 5.4), rally=(0.0, 0.0, 7.4)),
}


def hsv(c):
    h, s, v = colorsys.rgb_to_hsv(float(c[0]), float(c[1]), float(c[2]))
    return h * 360.0, s, v


def eh_time(c, p):
    h, s, v = hsv(c)
    return p['hue'][0] <= h <= p['hue'][1] and s >= p['sat'] and v >= p['val']


def amostra(pixels, uv):
    h, w, _ = pixels.shape
    x = min(max(int(uv[0] * w), 0), w - 1)
    y = min(max(int(uv[1] * h), 0), h - 1)
    return pixels[y, x]


def construir(nivel, args):
    L = LEVELS[nivel]
    C.reset_scene()
    bpy.ops.import_scene.fbx(filepath=L['fbx'])
    obj = next(o for o in bpy.context.scene.objects if o.type == 'MESH')
    me = obj.data
    me.transform(obj.matrix_world)
    obj.parent = None
    obj.matrix_world.identity()
    # centraliza (x, y) no centro da caixa e apoia a base em z=0 (Blender); depois escala pegada (x,y) e altura (z)
    co = np.empty(len(me.vertices) * 3, dtype=np.float64)
    me.vertices.foreach_get('co', co)
    co = co.reshape(-1, 3)
    lo, hi = co.min(axis=0), co.max(axis=0)
    log('nível %d FBX: %d tris, bbox x [%.3f, %.3f] y [%.3f, %.3f] z [%.3f, %.3f]' %
        (nivel, len(me.loop_triangles) if me.loop_triangles else sum(len(p.vertices) - 2 for p in me.polygons),
         lo[0], hi[0], lo[1], hi[1], lo[2], hi[2]))
    co[:, 0] = (co[:, 0] - (lo[0] + hi[0]) / 2) * L['sxz']
    co[:, 1] = (co[:, 1] - (lo[1] + hi[1]) / 2) * L['sxz']
    co[:, 2] = (co[:, 2] - lo[2]) * (L['altura'] / (hi[2] - lo[2]))
    me.vertices.foreach_set('co', co.ravel())
    me.update()
    # textura original (512²)
    mat0 = me.materials[0]
    img0 = next(n.image for n in mat0.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image)
    if img0.size[0] != ATLAS or img0.size[1] != ATLAS:
        raise RuntimeError('textura %s não é %d²' % (img0.size[:], ATLAS))
    pixels = HC.carregar_pixels(img0)
    # classificação por face: cor da textura nos cantos (meio caminho do centro) e no centro
    uvd = me.uv_layers.active.data
    p = L['cor_time']
    semente, frouxo = [], []
    tris_uv, tri_face = [], []
    for fi, poly in enumerate(me.polygons):
        uvs = np.array([uvd[li].uv[:] for li in poly.loop_indices], dtype=np.float64)
        cen = uvs.mean(axis=0)
        amostras = [cen] + [(u + cen) / 2 for u in uvs]
        cores = [amostra(pixels, a) for a in amostras]
        semente.append(all(eh_time(c, p) for c in cores))
        frouxo.append(sum(eh_time(c, FROUXO) for c in cores) >= FRACAO_TIME * len(cores))
        # bandeira do topo (acima da ponta dos telhados): qualquer face azulada nessa faixa de altura é semente
        if L.get('z_bandeira') and poly.center.z >= L['z_bandeira'] * L['altura'] and frouxo[-1]:
            semente[-1] = True
        for k in range(1, len(uvs) - 1):
            tris_uv.append(np.array([uvs[0], uvs[k], uvs[k + 1]]))
            tri_face.append(fi)
    # as sementes (cor estrita) crescem até CRESCER anéis de faces vizinhas de cor frouxa: completa bandeiras e estandartes sem
    # pintar as manchas azuladas do telhado de ardósia (que não encostam nas sementes)
    viz = {}
    for fi, poly in enumerate(me.polygons):
        for ek in poly.edge_keys:
            viz.setdefault(ek, []).append(fi)
    adj = [set() for _ in me.polygons]
    for fs in viz.values():
        for x in fs:
            adj[x].update(y for y in fs if y != x)
    time = list(semente)
    borda = {i for i, t in enumerate(time) if t}
    for _ in range(CRESCER):
        novo = {j for i in borda for j in adj[i] if not time[j] and frouxo[j]}
        for j in novo:
            time[j] = True
        borda = novo
    vals = [1 if time[fi] else 2 for fi in tri_face]
    n_time = sum(time)
    log('nível %d: %d de %d faces em TeamColor' % (nivel, n_time, len(time)))
    # atlas: texels de TeamColor em cinza (luma com ganho; multiplicam a cor do time no jogo)
    tris_uv = np.array(tris_uv)
    vals = np.array(vals)
    ordem = np.argsort(vals == 2, kind='stable')
    g = HC.rasterizar(tris_uv[ordem], vals[ordem], ATLAS)
    gd = HC.dilatar_rotulos(g, DILATACAO_TIME)
    luma = pixels @ np.array([0.299, 0.587, 0.114], dtype=np.float32)
    nucleo = (g == 1)
    mediana = float(np.median(luma[nucleo])) if nucleo.any() else 0.5
    ganho = 0.72 / max(mediana, 1e-3)
    cinza = np.clip(luma * ganho, 0.0, 1.0)
    capa = (gd == 1) & ~(HC.dilatar_rotulos(np.where(g == 2, 2, 0).astype(np.int32), PROTECAO_TIME) != 0)
    arr = pixels.copy()
    arr[capa] = cinza[capa][:, None]
    log('nível %d atlas: %d texels de time, ganho %.2f' % (nivel, int(capa.sum()), ganho))
    img = bpy.data.images.new(L['atlas'], ATLAS, ATLAS, alpha=False)
    px = np.ones((ATLAS, ATLAS, 4), dtype=np.float32)
    px[..., :3] = arr
    img.pixels.foreach_set(px.ravel())
    # materiais: slot 0 = Atlas, slot 1 = TeamColor (finalize_materials troca os dois)
    m_plano = bpy.data.materials.new('P_plano')
    m_time = bpy.data.materials.new('P_time')
    m_time['is_team'] = True
    me.materials.clear()
    me.materials.append(m_plano)
    me.materials.append(m_time)
    me.polygons.foreach_set('material_index', [1 if t else 0 for t in time])
    raiz = C.make_empty(L['raiz'])
    obj.name = 'Static_Mesh'
    me.name = 'Static_Mesh'
    obj.parent = raiz
    C.make_empty('Socket_UnitSpawn', L['spawn'], parent=raiz)
    C.make_empty('Socket_Rally', L['rally'], parent=raiz)
    bpy.context.view_layer.update()
    C.finalize_materials([obj], img, team_default=TEAM_DEFAULT,
                         out_png=os.path.join(C.BUILD_DIR, L['atlas'] + '.png'))
    out = os.path.join(C.OUT_MODELS, L['glb'])
    C.export_glb(raiz, out)
    st = C.stats(raiz, out)
    log('STATS %s' % L['raiz'], st)
    HC.verificar_glb(out)
    from bld_common import bbox_game
    log('BBOX (x,y,z do jogo)', bbox_game(raiz))
    if '--no-render' not in args:
        previas = next((a.split('=', 1)[1] for a in args if a.startswith('--previas=')), OUT_PREVIAS)
        C.RENDERS = previas
        rig = C.RenderRig(raiz, 'hq%d' % nivel, res=640, samples=24)
        rig.render('frente', (0.0, 0.3, 1.0), 30)
        rig.render('lado', (1.0, 0.3, 0.0), 30)
        rig.render('34', (1.0, 0.95, 1.0), 30)
        rig.render('game', (45, 44, 45), 30, dist=78)
        C.set_team_color('#d23a2c')
        rig.render('34_vermelho', (1.0, 0.95, 1.0), 30)
        C.set_team_color(TEAM_DEFAULT)


def main():
    args = C.script_args()
    sel = next((a.split('=', 1)[1] for a in args if a.startswith('--nivel=')), 'all')
    for n in ([1, 2, 3] if sel == 'all' else [int(sel)]):
        construir(n, args)


main()
