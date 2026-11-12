"""
build_hq_orc.py — Centro orc em 3 níveis: Salão do Clã (cabana de madeira e ossos) → Bastião (casa-forte de pedra) → Cidadela de Ferro
(fortaleza de ferro), gerados a partir dos FBX do Tripo (1 malha cada, SEM rig, textura 1024² reamostrada para 512²).

Mesmo pipeline do Centro humano (build_hq_human.py). Diferenças: o Tripo não pintou panos de cor de time, então o script ACRESCENTA dois
mastros com bandeira de TeamColor ladeando a porta (texels livres do atlas: um de madeira, um cinza que multiplica a cor do time).

Saída (coordenadas do jogo, origem no centro da base, frente/porta em +Z, pés em y=0):
  public/models/hq_orc_1.glb | hq_orc_2.glb | hq_orc_3.glb
  HqOrcN (raiz) > Static_Mesh (Atlas + TeamColor), Socket_UnitSpawn, Socket_Rally

Uso:
  blender -b --factory-startup --python tools/blender/build_hq_orc.py -- [--nivel=1|2|3] [--no-render] [--previas=pasta]
Rodar sempre via tools/safe-run.sh (ver CLAUDE.md).
"""
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))

import bpy  # noqa: E402
import bmesh  # noqa: E402
import common as C  # noqa: E402
import hero_common as HC  # noqa: E402
from hero_common import log  # noqa: E402

DL = '/home/rafael/Downloads'
OUT_PREVIAS = os.path.join(REPO, 'tools', 'ui-captures', 'hq-orc')
TEAM_DEFAULT = '#c0392b'
ATLAS = 512
RAIO_COLISAO = 5.5
COR_MADEIRA = (0.30, 0.19, 0.11)
COR_PANO = (0.80, 0.80, 0.80)

#  altura / sxz: tamanho final em unidades do jogo (altura em y; sxz multiplica a pegada x/z do FBX normalizado)
LEVELS = {
    1: dict(fbx=DL + '/salao_orc_1/tripo_convert_af011ea6-8ce9-4bf2-9cdd-fcfee8274482.fbx', glb='hq_orc_1.glb', raiz='HqOrc1',
            atlas='hq_orc_1_atlas', altura=8.0, sxz=8.8, spawn=(0.0, 0.0, 4.9), rally=(0.0, 0.0, 6.9)),
    2: dict(fbx=DL + '/salao_orc_2/tripo_convert_54c9b881-6199-4eb0-bec0-b0cd8b724f4a.fbx', glb='hq_orc_2.glb', raiz='HqOrc2',
            atlas='hq_orc_2_atlas', altura=11.5, sxz=10.6, spawn=(0.0, 0.0, 5.2), rally=(0.0, 0.0, 7.2)),
    3: dict(fbx=DL + '/salao_orc_3/tripo_convert_1b18a224-ca00-457f-a558-180277c2ff4d.fbx', glb='hq_orc_3.glb', raiz='HqOrc3',
            atlas='hq_orc_3_atlas', altura=13.5, sxz=11.2, spawn=(0.0, 0.0, 5.4), rally=(0.0, 0.0, 7.4)),
}


def bloco_livre(g, usados, tam=8):
    """Primeiro bloco tam x tam sem triângulo UV (g == 0) e fora de `usados`; devolve (linha, coluna)."""
    livre = (g == 0)
    for (r, c) in usados:
        livre[max(r - tam, 0):r + tam, max(c - tam, 0):c + tam] = False
    ii = np.pad(livre.astype(np.int32).cumsum(0).cumsum(1), ((1, 0), (1, 0)))
    soma = ii[tam:, tam:] - ii[:-tam, tam:] - ii[tam:, :-tam] + ii[:-tam, :-tam]
    ok = np.argwhere(soma == tam * tam)
    if not len(ok):
        raise RuntimeError('sem bloco livre no atlas')
    r, c = ok[len(ok) // 2]
    return int(r), int(c)


def construir(nivel, args):
    L = LEVELS[nivel]
    C.reset_scene()
    bpy.ops.import_scene.fbx(filepath=L['fbx'], use_image_search=True)
    obj = next(o for o in bpy.context.scene.objects if o.type == 'MESH')
    me = obj.data
    me.transform(obj.matrix_world)
    obj.parent = None
    obj.matrix_world.identity()
    co = np.empty(len(me.vertices) * 3, dtype=np.float64)
    me.vertices.foreach_get('co', co)
    co = co.reshape(-1, 3)
    lo, hi = co.min(axis=0), co.max(axis=0)
    log('nível %d FBX: %d polígonos, bbox x [%.3f, %.3f] y [%.3f, %.3f] z [%.3f, %.3f]' %
        (nivel, len(me.polygons), lo[0], hi[0], lo[1], hi[1], lo[2], hi[2]))
    co[:, 0] = (co[:, 0] - (lo[0] + hi[0]) / 2) * L['sxz']
    co[:, 1] = (co[:, 1] - (lo[1] + hi[1]) / 2) * L['sxz']
    co[:, 2] = (co[:, 2] - lo[2]) * (L['altura'] / (hi[2] - lo[2]))
    me.vertices.foreach_set('co', co.ravel())
    r = np.hypot(co[:, 0], co[:, 1])
    log('nível %d: raio máximo dos vértices %.2f (p99 %.2f; colisão da simulação = %.1f)' % (nivel, r.max(), np.percentile(r, 99), RAIO_COLISAO))
    me.update()
    mat0 = me.materials[0]
    img0 = next(n.image for n in mat0.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image)
    pixels = HC.carregar_pixels(img0)
    if pixels.shape[0] != ATLAS:
        pixels = HC.reamostrar(pixels, ATLAS)
    # texels livres para as bandeiras
    uvd = me.uv_layers.active.data
    tris_uv = []
    for poly in me.polygons:
        uvs = np.array([uvd[li].uv[:] for li in poly.loop_indices], dtype=np.float64)
        for k in range(1, len(uvs) - 1):
            tris_uv.append(np.array([uvs[0], uvs[k], uvs[k + 1]]))
    g = HC.rasterizar(np.array(tris_uv), np.ones(len(tris_uv), dtype=np.int32), ATLAS)
    g = HC.dilatar_rotulos(g, 2)
    rw, cw = bloco_livre(g, [])
    rp, cp = bloco_livre(g, [(rw, cw)])
    arr = pixels.copy()
    arr[rw:rw + 8, cw:cw + 8] = COR_MADEIRA
    arr[rp:rp + 8, cp:cp + 8] = COR_PANO
    uv_madeira = ((cw + 4) / ATLAS, (rw + 4) / ATLAS)
    uv_pano = ((cp + 4) / ATLAS, (rp + 4) / ATLAS)
    log('texels livres: madeira (linha %d, coluna %d), pano (linha %d, coluna %d)' % (rw, cw, rp, cp))
    # bandeiras: dois mastros ladeando a porta (frente = -Y do Blender)
    W = (co[:, 0].max() - co[:, 0].min())
    H = L['altura']
    ymin = co[:, 1].min()
    bm = bmesh.new()
    bm.from_mesh(me)
    uvl = bm.loops.layers.uv.active
    mats = {}

    def caixa(cx, cy, cz, sx, sy, sz, uv, mi):
        res = bmesh.ops.create_cube(bm, size=1.0)
        vs = res['verts']
        for v in vs:
            v.co.x = cx + v.co.x * sx
            v.co.y = cy + v.co.y * sy
            v.co.z = cz + v.co.z * sz
        fs = {f for v in vs for f in v.link_faces}
        for f in fs:
            f.material_index = mi
            for lp in f.loops:
                lp[uvl].uv = uv
    for lado in (-1, 1):
        x = lado * 0.30 * W
        y = ymin + 0.35
        alt = 0.62 * H
        caixa(x, y, alt / 2, 0.14, 0.14, alt, uv_madeira, 0)
        caixa(x, y, alt * 0.9 - 0.8, 1.05, 0.06, 1.6, uv_pano, 1)
        caixa(x, y, alt + 0.1, 0.2, 0.2, 0.2, uv_madeira, 0)
    # materiais: slot 0 = Atlas, slot 1 = TeamColor
    for p in bm.faces:
        if p.material_index not in (0, 1):
            p.material_index = 0
    indices = [f.material_index for f in bm.faces]
    bm.to_mesh(me)
    bm.free()
    m_plano = bpy.data.materials.new('P_plano')
    m_time = bpy.data.materials.new('P_time')
    m_time['is_team'] = True
    # as faces originais (material_index 0 do FBX) ficam em 0; só os panos novos usam 1
    me.materials.clear()
    me.materials.append(m_plano)
    me.materials.append(m_time)
    me.polygons.foreach_set('material_index', indices)
    img = bpy.data.images.new(L['atlas'], ATLAS, ATLAS, alpha=False)
    px = np.ones((ATLAS, ATLAS, 4), dtype=np.float32)
    px[..., :3] = arr
    img.pixels.foreach_set(px.ravel())
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
        rig = C.RenderRig(raiz, 'hq_orc%d' % nivel, res=640, samples=24)
        rig.render('frente', (0.0, 0.3, 1.0), 30)
        rig.render('lado', (1.0, 0.3, 0.0), 30)
        rig.render('34', (1.0, 0.95, 1.0), 30)
        rig.render('game', (45, 44, 45), 30, dist=78)
        C.set_team_color('#2f63e0')
        rig.render('34_azul', (1.0, 0.95, 1.0), 30)
        C.set_team_color(TEAM_DEFAULT)


def main():
    args = C.script_args()
    sel = next((a.split('=', 1)[1] for a in args if a.startswith('--nivel=')), 'all')
    for n in ([1, 2, 3] if sel == 'all' else [int(sel)]):
        construir(n, args)


main()
