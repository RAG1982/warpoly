"""
build_gryphon_tripo.py — Cavaleiro Grifo (ART-GRIFO), a partir do FBX do Tripo (1 malha com DOIS grifos de anão-cavaleiro, SEM rig,
textura 512² JPEG).

Escolha do grifo: o FBX traz duas ilhas desconexas (x<0: 10,9 mil faces; x>0: 8,6 mil). Ficou o da ilha x<0 ("A"): é o mais completo e
detalhado (as duas asas inteiras com todas as penas e a cauda de leão visíveis) e o de frente mais limpa; o outro tem a asa de trás
parcialmente escondida e menos geometria. A pose do Tripo tem as asas assimétricas (uma levantada, outra caída), então a asa
mais bem acabada é espelhada para fazer o par simétrico que o `UnitAnimator.applyAir` precisa (`WingL.rotation.z = flap`,
`WingR.rotation.z = -flap`).

Saída (coordenadas do jogo: +Z frente, +Y cima, pés em y=0, origem no centro do corpo):
  public/models/gryphon_rider_v2.glb
  GryphonRider
  └─ Torso       corpo + patas + cavaleiro + sela (o animador balança/inclina o conjunto)
     ├─ Head     cabeça do grifo (pivô no pescoço)
     ├─ WingL    asa (x<0), pivô no ombro; filha `WingTipL` (pivô no cotovelo da asa) = ponta da asa
     ├─ WingR    asa (x>0), idem (`WingTipR`)
     └─ Tail     cauda de leão (pivô na garupa)
Otimização: Decimate (colapso) até ~TRIS_ALVO, textura 512² original (WebP embutida), poucos draw calls.

Uso:
  blender -b --factory-startup --python tools/blender/build_gryphon_tripo.py -- [--no-render] [--previas=pasta] [--stop=alinhar]
Rodar sempre via tools/safe-run.sh (ver CLAUDE.md).
"""
import os
import sys
import math

import colorsys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))

import bpy  # noqa: E402
import bmesh  # noqa: E402
import common as C  # noqa: E402
import hero_common as HC  # noqa: E402
from hero_common import log  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

FBX = '/home/rafael/Downloads/grifo/tripo_convert_b4093abb-25f5-4679-af53-2962e95474fa.fbx'
OUT_PREVIAS = os.path.join(REPO, 'tools', 'ui-captures', 'ART-GRIFO')
GLB = 'gryphon_rider_v2.glb'
TEAM_DEFAULT = '#3a66d6'
TRIS_ALVO = 7600
YAW = -45.0           # graus em torno de z (Blender): o grifo do Tripo olha para -45° (no plano x/y do Blender); queremos -y (= +z do jogo)
ENVERGADURA = 3.6     # envergadura alvo (unidades do jogo) com as asas no repouso


def ntris(me):
    return sum(len(p.vertices) - 2 for p in me.polygons)


def importar():
    C.reset_scene()
    bpy.ops.import_scene.fbx(filepath=FBX)
    obj = next(o for o in bpy.context.scene.objects if o.type == 'MESH')
    me = obj.data
    me.transform(obj.matrix_world)
    obj.parent = None
    obj.matrix_world.identity()
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.remove_doubles(threshold=1e-5, use_sharp_edge_from_normals=True)
    bpy.ops.mesh.separate(type='LOOSE')
    bpy.ops.object.mode_set(mode='OBJECT')
    ilhas = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    ilhas.sort(key=lambda o: np.mean([v.co.x for v in o.data.vertices]))
    log('ilhas (faces):', [(o.name, len(o.data.polygons)) for o in ilhas])
    for o in ilhas[1:]:           # fica a ilha de x menor ("A")
        bpy.data.objects.remove(o)
    obj = ilhas[0]
    obj.name = 'Grifo'
    return obj


def decimar(obj, alvo):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.delete_loose(use_verts=True, use_edges=True, use_faces=False)
    bpy.ops.mesh.dissolve_degenerate(threshold=1e-6)
    bpy.ops.object.mode_set(mode='OBJECT')
    n1 = ntris(obj.data)
    if n1 > alvo:
        mod = obj.modifiers.new('Dec', 'DECIMATE')
        mod.decimate_type = 'COLLAPSE'
        mod.ratio = alvo / float(n1)
        mod.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier='Dec')
    log('decimado: %d -> %d tris' % (n1, ntris(obj.data)))


def coords(me):
    co = np.empty(len(me.vertices) * 3, dtype=np.float64)
    me.vertices.foreach_get('co', co)
    return co.reshape(-1, 3)


def alinhar(obj):
    """Gira o grifo para olhar -y (Blender), centraliza o corpo em (x, y) e põe as patas em z=0 (ainda na escala do Tripo)."""
    me = obj.data
    co = coords(me)
    a = math.radians(YAW)
    c, s = math.cos(a), math.sin(a)
    x, y = co[:, 0].copy(), co[:, 1].copy()
    co[:, 0], co[:, 1] = c * x - s * y, s * x + c * y
    co[:, 2] -= co[:, 2].min()
    patas = co[co[:, 2] < 0.05]
    cx, cy = patas[:, 0].mean(), patas[:, 1].mean()
    co[:, 0] -= cx
    co[:, 1] -= cy
    me.vertices.foreach_set('co', co.ravel())
    me.update()
    return co


def render_debug(obj, prefixo, res=800, escala=0.8, color='TEXTURE'):
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_WORKBENCH'
    scene.display.shading.light = 'FLAT'
    scene.display.shading.color_type = color
    scene.render.resolution_x = scene.render.resolution_y = res
    cam_d = bpy.data.cameras.new('dbg')
    cam_d.type = 'ORTHO'
    cam_d.ortho_scale = escala
    cam = bpy.data.objects.new('dbg', cam_d)
    scene.collection.objects.link(cam)
    scene.camera = cam
    co = coords(obj.data)
    ce = (co.min(0) + co.max(0)) / 2
    vistas = {'top': ((ce[0], ce[1], 9), (0, 0, 0)),
              'front': ((ce[0], -9, ce[2]), (math.radians(90), 0, 0)),
              'side': ((9, ce[1], ce[2]), (math.radians(90), 0, math.radians(90)))}
    os.makedirs(OUT_PREVIAS, exist_ok=True)
    for k, (loc, rot) in vistas.items():
        cam.location = loc
        cam.rotation_euler = rot
        scene.render.filepath = os.path.join(OUT_PREVIAS, '_dbg_%s_%s.png' % (prefixo, k))
        bpy.ops.render.render(write_still=True)


# --- segmentação em peças rígidas (coordenadas do Tripo já alinhadas: x direita, y = -frente, z cima; escala do Tripo) ---
X0 = 0.025            # linha de simetria (as asas ficam simétricas em torno dela)
CAUDA_Y = 0.215       # faces com y acima disto = cauda
CABECA_PLANO = (np.array([0.0, -0.80, 0.60]), 0.215)   # (normal, d): n . p > d  = cabeça (n aponta do pescoço para a cabeça)
ASA_XR = 0.075        # |x'| acima disto (e z alto) = asa
ASA_Z = 0.19
ASA_XL = 0.13         # além disto a asa vale em qualquer altura (as penas descem)
PONTA_X = 0.23        # |x'| acima disto = ponta da asa (filha da asa)
MARTELO = ((-0.19, -0.115), (0.0, 0.10), (0.28, 0.40))   # caixa (x', y, z) do martelo do cavaleiro: sempre no Torso


def rotular(obj):
    me = obj.data
    n = len(me.polygons)
    co = coords(me)
    lab = np.zeros(n, dtype=np.int8)   # 0 torso, 1 cabeça, 2 asaL, 3 asaR, 4 ponta L, 5 ponta R, 6 cauda
    for i, p in enumerate(me.polygons):
        c = co[list(p.vertices)].mean(axis=0)
        x = c[0] - X0
        y, z = c[1], c[2]
        if (MARTELO[0][0] <= x <= MARTELO[0][1] and MARTELO[1][0] <= y <= MARTELO[1][1] and MARTELO[2][0] <= z <= MARTELO[2][1]):
            continue
        if y > CAUDA_Y:
            lab[i] = 6
        elif CABECA_PLANO[0] @ c > CABECA_PLANO[1] and abs(x) < 0.12:
            lab[i] = 1
        elif abs(x) > ASA_XR and (z > ASA_Z or abs(x) > ASA_XL):
            if abs(x) > PONTA_X:
                lab[i] = 4 if x < 0 else 5
            else:
                lab[i] = 2 if x < 0 else 3
    return lab


CORES = ['#8a8a8a', '#e0c020', '#d03030', '#3050e0', '#e08030', '#30c0c0', '#30c030']


def render_partes(obj, lab, prefixo):
    me = obj.data
    me.materials.clear()
    for k, h in enumerate(CORES):
        m = bpy.data.materials.new('dbg%d' % k)
        m.diffuse_color = C.hex_lin(h)[:3] + (1.0,)
        me.materials.append(m)
    me.polygons.foreach_set('material_index', lab.tolist())
    bpy.context.scene.display.shading.color_type = 'MATERIAL'
    render_debug(obj, prefixo, color='MATERIAL')


# --- TeamColor: texels azuis (ombreiras/panos do anão e manta) viram máscara em cinza, multiplicada pela cor do time ---
ATLAS = 512
COR_TIME = dict(hue=(0, 360), sat=0.0, smax=0.17, val=0.33)      # aço azulado das ombreiras/elmo do cavaleiro (a textura quase não tem azul puro)
FROUXO = dict(hue=(0, 360), sat=0.0, smax=0.26, val=0.25)
CAIXA_TIME = ((-0.11, 0.11), (-0.02, 0.13), (0.255, 0.40))   # (x', y, z): só o cavaleiro (martelo e arreios ficam de fora)
FRACAO_TIME = 0.5
CRESCER = 2
DILATACAO_TIME = 1
PROTECAO_TIME = 1
DENTRO = []


def hsv(c):
    h, s, v = colorsys.rgb_to_hsv(float(c[0]), float(c[1]), float(c[2]))
    return h * 360.0, s, v


def eh_time(c, p):
    h, s, v = hsv(c)
    return p['hue'][0] <= h <= p['hue'][1] and p['sat'] <= s <= p.get('smax', 1.0) and v >= p['val']


def amostra(pixels, uv):
    h, w, _ = pixels.shape
    x = min(max(int(uv[0] * w), 0), w - 1)
    y = min(max(int(uv[1] * h), 0), h - 1)
    return pixels[y, x]


def marcar_time(obj):
    """Devolve (lista de bool por face = TeamColor, imagem do atlas com a máscara em cinza). Mesma ideia do build_alliance_bld.py."""
    me = obj.data
    mat0 = me.materials[0]
    img0 = next(n.image for n in mat0.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image)
    pixels = HC.carregar_pixels(img0)
    if pixels.shape[0] != ATLAS:
        pixels = HC.reamostrar(pixels, ATLAS).astype(np.float32)
    uvd = me.uv_layers.active.data
    semente, frouxo, tris_uv, tri_face = [], [], [], []
    co3 = coords(me)
    dentro = []
    for poly in me.polygons:
        c = co3[list(poly.vertices)].mean(axis=0)
        x = c[0] - X0
        dentro.append(CAIXA_TIME[0][0] <= x <= CAIXA_TIME[0][1] and CAIXA_TIME[1][0] <= c[1] <= CAIXA_TIME[1][1]
                      and CAIXA_TIME[2][0] <= c[2] <= CAIXA_TIME[2][1])
    for fi, poly in enumerate(me.polygons):
        uvs = np.array([uvd[li].uv[:] for li in poly.loop_indices], dtype=np.float64)
        cen = uvs.mean(axis=0)
        amostras = [cen] + [(u + cen) / 2 for u in uvs]
        cores = [amostra(pixels, a) for a in amostras]
        semente.append(dentro[fi] and all(eh_time(c, COR_TIME) for c in cores))
        frouxo.append(dentro[fi] and sum(eh_time(c, FROUXO) for c in cores) >= FRACAO_TIME * len(cores))
        for k in range(1, len(uvs) - 1):
            tris_uv.append(np.array([uvs[0], uvs[k], uvs[k + 1]]))
            tri_face.append(fi)
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
    log('TeamColor: %d de %d faces' % (sum(time), len(time)))
    global DENTRO
    DENTRO = dentro
    vals = np.array([1 if time[fi] else 2 for fi in tri_face])
    tris_uv = np.array(tris_uv)
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
    log('atlas: %d texels de time, ganho %.2f' % (int(capa.sum()), ganho))
    img = bpy.data.images.new('gryphon_atlas', ATLAS, ATLAS, alpha=False)
    px = np.ones((ATLAS, ATLAS, 4), dtype=np.float32)
    px[..., :3] = arr
    img.pixels.foreach_set(px.ravel())
    return time, img


# pivôs (coordenadas do Tripo alinhadas, x' = x - X0) e hierarquia das peças
PIVOS = {
    'Torso': (0.0, 0.0, 0.0),
    'Head': (0.0, -0.09, 0.24),
    'WingL': (-0.075, 0.022, 0.215),
    'WingR': (0.075, 0.022, 0.215),
    'WingTipL': (-PONTA_X, 0.022, 0.31),
    'WingTipR': (PONTA_X, 0.022, 0.31),
    'Tail': (-0.02, CAUDA_Y, 0.177),
}
PAIS = {'Torso': None, 'Head': 'Torso', 'WingL': 'Torso', 'WingR': 'Torso', 'WingTipL': 'WingL', 'WingTipR': 'WingR', 'Tail': 'Torso'}
ROTULO = {'Torso': 0, 'Head': 1, 'WingL': 2, 'WingR': 3, 'WingTipL': 4, 'WingTipR': 5, 'Tail': 6}


def extrair(obj, lab, k, nome):
    """Cópia de `obj` só com as faces rotuladas `k` (uma malha por peça; nenhum vértice é movido: sem buracos no repouso)."""
    o = obj.copy()
    o.data = obj.data.copy()
    o.name = nome
    o.data.name = nome
    bpy.context.scene.collection.objects.link(o)
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bm.faces.ensure_lookup_table()
    fora = [f for f in bm.faces if lab[f.index] != k]
    bmesh.ops.delete(bm, geom=fora, context='FACES')
    bm.to_mesh(o.data)
    bm.free()
    o.data.update()
    return o


def montar(obj, lab, time, esc):
    """Escala para o jogo, divide em peças com pivô nas articulações e monta a hierarquia (Tripo (x', y, z) -> Blender: só escala)."""
    me = obj.data
    me.materials.clear()
    m_plano = bpy.data.materials.new('P_plano')
    m_time = bpy.data.materials.new('P_time')
    m_time['is_team'] = True
    me.materials.append(m_plano)
    me.materials.append(m_time)
    me.polygons.foreach_set('material_index', [1 if t else 0 for t in time])
    me.polygons.foreach_set('use_smooth', [True] * len(me.polygons))
    co = coords(me)
    co[:, 0] -= X0
    co *= esc
    me.vertices.foreach_set('co', co.ravel())
    me.update()
    raiz = C.make_empty('GryphonRider')
    objs = {}
    for nome, k in ROTULO.items():
        o = extrair(obj, lab, k, nome)
        pv = Vector(PIVOS[nome]) * esc
        o.data.transform(Matrix.Translation(-pv))
        objs[nome] = (o, pv)
    for nome, (o, pv) in objs.items():
        pai = PAIS[nome]
        if pai is None:
            o.parent = raiz
            o.location = pv
        else:
            o.parent = objs[pai][0]
            o.location = pv - objs[pai][1]
    bpy.data.objects.remove(obj)
    return raiz, [o for o, _ in objs.values()]


def main():
    args = C.script_args()
    obj = importar()
    decimar(obj, TRIS_ALVO)
    co = alinhar(obj)
    log('após alinhar: min', co.min(0).round(3), 'max', co.max(0).round(3))
    if '--stop=alinhar' in args:
        render_debug(obj, 'alinhar')
        return
    lab = rotular(obj)
    log('faces por peça', np.bincount(lab, minlength=7).tolist())
    if '--stop=partes' in args:
        render_partes(obj, lab, 'partes')
        return
    time, img = marcar_time(obj)
    if '--stop=time' in args:
        render_partes(obj, np.array([5 if t else (2 if d else 0) for t, d in zip(time, DENTRO)], dtype=np.int8), 'time')
        return
    esc = ENVERGADURA / float(co[:, 0].max() - co[:, 0].min())
    log('escala Tripo -> jogo: %.3f' % esc)
    raiz, partes = montar(obj, lab, time, esc)
    bpy.context.view_layer.update()
    C.finalize_materials(partes, img, team_default=TEAM_DEFAULT, out_png=os.path.join(C.BUILD_DIR, 'gryphon_atlas.png'))
    out = os.path.join(C.OUT_MODELS, GLB)
    C.export_glb(raiz, out)
    st = C.stats(raiz, out)
    log('STATS GryphonRider', st)
    HC.verificar_glb(out)
    from bld_common import bbox_game
    log('BBOX (x,y,z do jogo)', bbox_game(raiz))
    if '--no-render' not in args:
        previas = next((a.split('=', 1)[1] for a in args if a.startswith('--previas=')), OUT_PREVIAS)
        C.RENDERS = previas
        rig = C.RenderRig(raiz, 'gryphon_rider_v2', res=640, samples=24)
        rig.render('frente', (0.0, 0.3, 1.0), 30)
        rig.render('lado', (1.0, 0.3, 0.0), 30)
        rig.render('34', (1.0, 0.95, 1.0), 30)
        rig.render('cima', (0.01, 1.0, 0.01), 30)
        C.set_team_color('#d23a2c')
        rig.render('34_vermelho', (1.0, 0.95, 1.0), 30)


main()
