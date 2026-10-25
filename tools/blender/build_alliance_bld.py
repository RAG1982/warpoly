"""
build_alliance_bld.py — Quartel, Casa e Serraria da Aliança (ART-ALI-3), a partir dos FBX do Tripo
(1 malha de ~9,5 mil triângulos, SEM rig, textura 1024² JPEG). Mesmo padrão do Centro humano (build_hq_human.py).

Saída (coordenadas do jogo, origem no centro da base, frente/porta em +Z, pés em y=0):
  public/models/barracks.glb | cottage.glb | lumber_camp.glb
  <Raiz> (Barracks | Cottage | LumberCamp)
  ├─ Static_Mesh       a malha inteira; 2 materiais: `Atlas` e `TeamColor` (faixas/flâmulas/telhas azuis marcadas na textura)
  ├─ Socket_UnitSpawn  saída das unidades (frente do edifício)
  └─ Socket_Rally      ponto de reunião padrão
Otimização: Decimate (colapso) até ~TRIS_ALVO, merge by distance, textura reamostrada 1024² -> 512² (WebP embutida), 2 draw calls.

Escala uniforme (`escala`): o Tripo normaliza o maior lado a 1,0; a pegada fica em torno do raio de colisão da simulação
(src/data/buildings.js), que não muda.

Uso:
  blender -b --factory-startup --python tools/blender/build_alliance_bld.py -- [--edificio=barracks|cottage|lumber_camp] [--no-render] [--previas=pasta]
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
OUT_PREVIAS = os.path.join(REPO, 'tools', 'ui-captures', 'ART-ALI-3')
TEAM_DEFAULT = '#3a66d6'
ATLAS = 512
DILATACAO_TIME = 1
PROTECAO_TIME = 1
CRESCER = 3
FROUXO = dict(hue=(205, 255), sat=0.18, val=0.24)
FRACAO_TIME = 0.5

# --- constantes por edifício ---------------------------------------------------------------------------------------------
#  fbx: FBX do Tripo; escala: uniforme sobre o FBX normalizado (o maior lado do FBX vale ~1,0); girar: graus em torno de y (jogo)
#  para a porta/frente ficar em +Z; tris: alvo do Decimate; cor_time: faixa de matiz (graus), saturação e valor mínimos dos texels de TeamColor
#  frente_extra: folga (unidades) entre a face frontal do modelo e o socket de saída; rally = spawn + 2
BLD = {
    'barracks': dict(fbx=DL + '/barracs/tripo_convert_6af3c7f9-0441-48eb-b4ac-759ac8cf2483.fbx', glb='barracks.glb',
                     raiz='Barracks', atlas='barracks_atlas', escala=7.4, girar=-90, tris=7200,
                     cor_time=dict(hue=(205, 250), sat=0.45, val=0.30), frente_extra=1.2),
    'cottage': dict(fbx=DL + '/casa-alianca/tripo_convert_0a2599f6-d2a5-4fb0-9f46-63723743fd58.fbx', glb='cottage.glb',
                    raiz='Cottage', atlas='cottage_atlas', escala=5.6, girar=0, tris=7200,
                    cor_time=dict(hue=(205, 250), sat=0.45, val=0.30), frente_extra=1.2),
    'lumber_camp': dict(fbx=DL + '/serraria/tripo_convert_afe019c6-ab73-4d0c-bc05-7f80883883f5.fbx', glb='lumber_camp.glb',
                        raiz='LumberCamp', atlas='lumber_camp_atlas', escala=6.6, girar='auto', girar_extra=-90, largo=7.8, tris=7200,
                        cor_time=dict(hue=(205, 250), sat=0.30, val=0.30), frente_extra=1.2),
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


def ntris(me):
    return sum(len(p.vertices) - 2 for p in me.polygons)


def construir(nome, args):
    L = BLD[nome]
    C.reset_scene()
    bpy.ops.import_scene.fbx(filepath=L['fbx'])
    obj = next(o for o in bpy.context.scene.objects if o.type == 'MESH')
    me = obj.data
    me.transform(obj.matrix_world)
    obj.parent = None
    obj.matrix_world.identity()
    n0 = ntris(me)
    # --- limpeza + decimação (antes de escalar: razão independe da escala) ---
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.remove_doubles(threshold=1e-5, use_sharp_edge_from_normals=True)
    bpy.ops.mesh.delete_loose(use_verts=True, use_edges=True, use_faces=False)
    bpy.ops.mesh.dissolve_degenerate(threshold=1e-6)
    bpy.ops.object.mode_set(mode='OBJECT')
    n1 = ntris(me)
    if n1 > L['tris']:
        mod = obj.modifiers.new('Dec', 'DECIMATE')
        mod.decimate_type = 'COLLAPSE'
        mod.ratio = L['tris'] / float(n1)
        mod.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier='Dec')
    me = obj.data
    n2 = ntris(me)
    log('%s: FBX %d tris -> limpeza %d -> decimado %d' % (nome, n0, n1, n2))
    # --- gira em torno de z (Blender) = y (jogo), centraliza (x, y), apoia a base em z=0 e escala uniforme ---
    co = np.empty(len(me.vertices) * 3, dtype=np.float64)
    me.vertices.foreach_get('co', co)
    co = co.reshape(-1, 3)
    if L['girar'] == 'auto':
        # alinha o edifício aos eixos: ângulo (0-90°) que minimiza a área da caixa x/z (o Tripo o entrega na diagonal)
        melhor = (1e18, 0.0)
        for g in np.arange(0.0, 90.0, 0.5):
            a = np.radians(g)
            u = np.cos(a) * co[:, 0] - np.sin(a) * co[:, 1]
            v = np.sin(a) * co[:, 0] + np.cos(a) * co[:, 1]
            area = (u.max() - u.min()) * (v.max() - v.min())
            if area < melhor[0]:
                melhor = (area, g)
        L = dict(L, girar=melhor[1] + L.get('girar_extra', 0))
        log('%s: giro automático %.1f°' % (nome, melhor[1]))
    if L['girar']:
        a = np.radians(L['girar'])
        c, s = np.cos(a), np.sin(a)
        x, y = co[:, 0].copy(), co[:, 1].copy()
        co[:, 0], co[:, 1] = c * x - s * y, s * x + c * y
    lo, hi = co.min(axis=0), co.max(axis=0)
    if L.get('largo'):   # escala pelo maior lado da pegada já alinhada
        L = dict(L, escala=L['largo'] / max(hi[0] - lo[0], hi[1] - lo[1]))
    co[:, 0] = (co[:, 0] - (lo[0] + hi[0]) / 2) * L['escala']
    co[:, 1] = (co[:, 1] - (lo[1] + hi[1]) / 2) * L['escala']
    co[:, 2] = (co[:, 2] - lo[2]) * L['escala']
    me.vertices.foreach_set('co', co.ravel())
    me.update()
    lo, hi = co.min(axis=0), co.max(axis=0)
    log('%s: bbox final (Blender x,y,z) %s %s ; frente do jogo (+z) = -y do Blender' % (nome, lo.round(2), hi.round(2)))
    top = co[co[:, 2] > 0.96 * hi[2]]
    log('%s: ponto mais alto (jogo x,y,z) = (%.2f, %.2f, %.2f)' % (nome, top[:, 0].mean(), hi[2], -top[:, 1].mean()))
    z_frente = -lo[1]          # +z do jogo = -y do Blender
    # --- textura 1024² -> 512² ---
    mat0 = me.materials[0]
    img0 = next(n.image for n in mat0.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image)
    pixels = HC.carregar_pixels(img0)
    if pixels.shape[0] != ATLAS:
        pixels = HC.reamostrar(pixels, ATLAS).astype(np.float32)
    # --- classificação por face: cor nos cantos (meio caminho do centro) e no centro ---
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
    for _ in range(L.get('crescer', CRESCER)):
        novo = {j for i in borda for j in adj[i] if not time[j] and frouxo[j]}
        for j in novo:
            time[j] = True
        borda = novo
    vals = [1 if time[fi] else 2 for fi in tri_face]
    log('%s: %d de %d faces em TeamColor' % (nome, sum(time), len(time)))
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
    log('%s atlas: %d texels de time, ganho %.2f' % (nome, int(capa.sum()), ganho))
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
    spawn_z = round(z_frente + L['frente_extra'], 1)
    raiz = C.make_empty(L['raiz'])
    obj.name = 'Static_Mesh'
    me.name = 'Static_Mesh'
    obj.parent = raiz
    C.make_empty('Socket_UnitSpawn', (0.0, 0.0, spawn_z), parent=raiz)
    C.make_empty('Socket_Rally', (0.0, 0.0, spawn_z + 2.0), parent=raiz)
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
        rig = C.RenderRig(raiz, nome, res=640, samples=24)
        rig.render('frente', (0.0, 0.3, 1.0), 30)
        rig.render('lado', (1.0, 0.3, 0.0), 30)
        rig.render('tras', (0.0, 0.3, -1.0), 30)
        rig.render('34', (1.0, 0.95, 1.0), 30)
        C.set_team_color('#d23a2c')
        rig.render('34_vermelho', (1.0, 0.95, 1.0), 30)
        C.set_team_color(TEAM_DEFAULT)


def main():
    args = C.script_args()
    sel = next((a.split('=', 1)[1] for a in args if a.startswith('--edificio=')), 'all')
    for n in (list(BLD) if sel == 'all' else [sel]):
        construir(n, args)


main()
