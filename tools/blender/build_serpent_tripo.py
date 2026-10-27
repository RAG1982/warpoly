"""
build_serpent_tripo.py — Serpe de Guerra (ART-SERPE), a partir do FBX do Tripo (1 malha: UMA serpe alada/wyvern orc com cavaleiro orc
selado e rédeas de corrente, SEM rig, textura 512² JPEG). Mesma receita do build_gryphon_tripo.py.

Só há um modelo no arquivo (1 ilha de 19,3 mil faces), então não houve escolha. A pose do Tripo é quase simétrica (envergadura
espelhada em torno de y=0), por isso as asas não precisam ser espelhadas.

Saída (coordenadas do jogo: +Z frente, +Y cima, pés em y=0, origem no meio do corpo):
  public/models/war_serpent_v2.glb
  WarSerpent
  └─ Torso       corpo + patas + cavaleiro + sela
     ├─ Head     cabeça da serpe + pescoço curto (pivô no pescoço)
     ├─ WingL    asa (x<0), pivô no ombro; filha `WingTipL` (pivô no cotovelo) = ponta da asa
     ├─ WingR    asa (x>0), idem (`WingTipR`)
     └─ Tail     cauda (pivô na garupa); filha `TailTip` (pivô no meio da cauda) = ponta com o ferrão
Otimização: Decimate (colapso) até ~TRIS_ALVO, textura 512² (WebP embutida), poucos draw calls.

Uso:
  blender -b --factory-startup --python tools/blender/build_serpent_tripo.py -- [--no-render] [--previas=pasta] [--stop=alinhar|partes|time]
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

FBX = '/home/rafael/Downloads/serpe/tripo_convert_c3045be2-7335-4471-9a88-d8e6712df7a1.fbx'
OUT_PREVIAS = os.path.join(REPO, 'tools', 'ui-captures', 'ART-SERPE')
GLB = 'war_serpent_v2.glb'
TEAM_DEFAULT = '#d23a2c'
TRIS_ALVO = 6800
YAW = -90.0           # graus em torno de z (Blender): a serpe do Tripo olha para +x (Blender); queremos -y (= +z do jogo)
ENVERGADURA = 4.0     # envergadura alvo (unidades do jogo) com as asas no repouso


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
    ilhas.sort(key=lambda o: -len(o.data.polygons))
    log('ilhas (faces):', [(o.name, len(o.data.polygons)) for o in ilhas])
    for o in ilhas[1:]:           # só a maior ilha (a serpe); eventuais fragmentos soltos saem
        bpy.data.objects.remove(o)
    obj = ilhas[0]
    obj.name = 'Serpe'
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
    """Gira a serpe para olhar -y (Blender), centraliza o corpo em (x, y) e põe as patas em z=0 (ainda na escala do Tripo)."""
    me = obj.data
    co = coords(me)
    a = math.radians(YAW)
    c, s = math.cos(a), math.sin(a)
    x, y = co[:, 0].copy(), co[:, 1].copy()
    co[:, 0], co[:, 1] = c * x - s * y, s * x + c * y
    co[:, 2] -= co[:, 2].min()
    co[:, 1] += XC        # origem no meio do corpo (y' = -frente)
    me.vertices.foreach_set('co', co.ravel())
    me.update()
    return co


def render_debug(obj, prefixo, res=800, escala=1.3, color='TEXTURE'):
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
XC = 0.05             # x do Tripo que vira a origem (meio do corpo)
CABECA_F = 0.27       # frente (= -y') acima disto = cabeça/pescoço
CAUDA_F = -0.15       # frente abaixo disto = cauda
PONTA_CAUDA_F = -0.33
ASA_LAT = 0.075       # |x| acima disto (e z alto) = asa
ASA_Z = 0.20
PONTA_LAT = 0.30      # |x| acima disto = ponta da asa (filha da asa)


def rotular(obj):
    me = obj.data
    n = len(me.polygons)
    co = coords(me)
    lab = np.zeros(n, dtype=np.int8)   # 0 torso, 1 cabeça, 2 asaL, 3 asaR, 4 ponta L, 5 ponta R, 6 cauda, 7 ponta da cauda
    for i, p in enumerate(me.polygons):
        c = co[list(p.vertices)].mean(axis=0)
        x, f, z = c[0], -c[1], c[2]
        if abs(x) > ASA_LAT and z > ASA_Z:
            if abs(x) > PONTA_LAT:
                lab[i] = 4 if x < 0 else 5
            else:
                lab[i] = 2 if x < 0 else 3
        elif f > CABECA_F:
            lab[i] = 1
        elif f < PONTA_CAUDA_F:
            lab[i] = 7
        elif f < CAUDA_F:
            lab[i] = 6
    return lab


CORES = ['#8a8a8a', '#e0c020', '#d03030', '#3050e0', '#e08030', '#30c0c0', '#30c030', '#c030c0']


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


# --- TeamColor: texels azuis acinzentados (armadura do cavaleiro e placa da sela) viram máscara em cinza, multiplicada pela cor do clã ---
ATLAS = 512
COR_TIME = dict(hue=(170, 280), sat=0.05, smax=1.0, val=0.28)
FROUXO = dict(hue=(160, 290), sat=0.03, smax=1.0, val=0.22)
CAIXA_TIME = ((-0.13, 0.13), (-0.27, 0.02), (0.19, 0.45))   # (x', y', z): cavaleiro + sela (y' negativo = à frente do meio do corpo)
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
        x = c[0]
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
    img = bpy.data.images.new('serpent_atlas', ATLAS, ATLAS, alpha=False)
    px = np.ones((ATLAS, ATLAS, 4), dtype=np.float32)
    px[..., :3] = arr
    img.pixels.foreach_set(px.ravel())
    return time, img


# pivôs (coordenadas do Tripo alinhadas) e hierarquia das peças
PIVOS = {
    'Torso': (0.0, 0.0, 0.0),
    'Head': (0.0, -0.27, 0.20),
    'WingL': (-0.07, 0.0, 0.27),
    'WingR': (0.07, 0.0, 0.27),
    'WingTipL': (-PONTA_LAT, 0.0, 0.37),
    'WingTipR': (PONTA_LAT, 0.0, 0.37),
    'Tail': (0.0, 0.15, 0.13),
    'TailTip': (0.0, 0.33, 0.10),
}
PAIS = {'Torso': None, 'Head': 'Torso', 'WingL': 'Torso', 'WingR': 'Torso', 'WingTipL': 'WingL', 'WingTipR': 'WingR', 'Tail': 'Torso', 'TailTip': 'Tail'}
ROTULO = {'Torso': 0, 'Head': 1, 'WingL': 2, 'WingR': 3, 'WingTipL': 4, 'WingTipR': 5, 'Tail': 6, 'TailTip': 7}


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
    co *= esc
    me.vertices.foreach_set('co', co.ravel())
    me.update()
    raiz = C.make_empty('WarSerpent')
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
    log('faces por peça', np.bincount(lab, minlength=8).tolist())
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
    C.finalize_materials(partes, img, team_default=TEAM_DEFAULT, out_png=os.path.join(C.BUILD_DIR, 'serpent_atlas.png'))
    out = os.path.join(C.OUT_MODELS, GLB)
    C.export_glb(raiz, out)
    st = C.stats(raiz, out)
    log('STATS WarSerpent', st)
    HC.verificar_glb(out)
    from bld_common import bbox_game
    log('BBOX (x,y,z do jogo)', bbox_game(raiz))
    if '--no-render' not in args:
        previas = next((a.split('=', 1)[1] for a in args if a.startswith('--previas=')), OUT_PREVIAS)
        C.RENDERS = previas
        rig = C.RenderRig(raiz, 'war_serpent_v2', res=640, samples=24)
        rig.render('frente', (0.0, 0.3, 1.0), 30)
        rig.render('lado', (1.0, 0.3, 0.0), 30)
        rig.render('34', (1.0, 0.95, 1.0), 30)
        rig.render('cima', (0.01, 1.0, 0.01), 30)
        C.set_team_color('#3a66d6')
        rig.render('34_vermelho', (1.0, 0.95, 1.0), 30)


main()
