"""
build_vegetacao_seca_arvores.py — ART-02 (árvores) e ART-03 (vegetação seca) de MUNDO-TERRENO-MAPAS §6, 100% por script.

Uso:
  blender -b --factory-startup --python tools/blender/build_vegetacao_seca_arvores.py -- [broad|palm|acacia|grass_dry|tumbleweed|all] [--no-render]

Saídas (public/models/):
  tree_broad.glb    raiz `TreeBroad`    variante alta de copa larga (tronco de ~1,5 de diâmetro na base, copa de ~6,6, ~8,5 de altura)
  tree_palm.glb     raiz `TreePalm`     palmeira de tronco curvo com anéis de cicatriz pintados, 16 frondes largas e recortadas (+2 secas)
  tree_acacia.glb   raiz `TreeAcacia`   acácia: tronco torto que se abre em cinco braços, copa achatada em guarda-chuva (~6,7 de largura)
  grass_dry.glb     raiz `GrassDry`     tufo de capim seco: 12 lâminas em cone, ouro-palha #c9a24a, ~0,9 de altura
  tumbleweed.glb    raiz `Tumbleweed`   arbusto rolante: esfera de ~0,85 de galhos secos (centro de rotação em y = 0,42)

Árvores: o `TreeManager` (`getGlbTreeSource`) pega a PRIMEIRA malha do .glb e o material dela e desenha em `InstancedMesh`,
tingindo por tipo/região no shader (o índice da região viaja no `instanceColor`). Por isso cada árvore é UMA malha
(`Static_Mesh`), UM material (`Atlas`, atlas 512², 1 draw call) e SEM cor de vértice (a cor vive na textura). A hierarquia é
a de `tree_oak.glb`: raiz > `Static_Mesh`, `Socket_UnitSpawn`, `Socket_Rally`. Props: só `Static_Mesh`, atlas 256².

Convenções: coordenadas do jogo (x direita, y cima, +z frente; 1 unidade = 1 m), origem no pé (y = 0 no chão; o pé das árvores
afunda 0,16–0,32 para não aparecer fresta em terreno em desnível), faces facetadas (copas e fitas `smooth=0`, troncos `smooth`
50–60). Folhas e lâminas são superfícies abertas (material `doubleSided`, como nas outras árvores); `ribbon` já enrola as faces
voltadas para a frente (lado de cima nas frondes, lado de fora nas lâminas) para a luz de topo pintada e o AO saírem do lado certo.

Pós-produção de cada modelo: UV atlas (Smart UV + empacotamento) -> bake Cycles de emissão (cor + AO + desgaste de borda dos
materiais de pintura) -> material final `Atlas` -> `Static_Mesh` único -> export meshopt + WebP. No fim o script lê de volta o
.glb gravado (`glb_report`) e confere os orçamentos (árvores: 1 malha, 1 material, textura <= 512², <= 15 mil tris, sem
COLOR_0; props: <= 4 draw calls e <= 2 mil tris) e renderiza o preview a partir do próprio .glb exportado.

Variáveis: `BAKE_SAMPLES` (32), `RENDER_RES` (512). Preview: tools/ui-captures/art-p0/<nome>.png (fundo transparente); o relatório
numérico vai para tools/blender/build/art-p0-report.json (pasta ignorada pelo git).
"""
import os
import sys
import math
import json
import struct
import random

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('ATLAS', '512')
import bpy  # noqa: E402
from mathutils import Vector, Matrix  # noqa: E402
import common as C  # noqa: E402
from common import (MeshBuilder, M, prim_rings, prim_sphere, limb_rings)  # noqa: E402

TEAM_DEFAULT = '#808080'
PREVIEW_DIR = os.path.join(C.REPO, 'tools', 'ui-captures', 'art-p0')
TWO_PI = 2.0 * math.pi


# ---------------------------------------------------------------------------
# Paletas (materiais de pintura: só existem para o bake)
# ---------------------------------------------------------------------------
BARK_BROAD = dict(base='#6b4d36', var='#3f2a1c', var_scale=7.0, var_amt=0.8, fine=0.14, fine_scale=38.0, top=0.22,
                  streaks=(7.0, 0.5, 0.28), edge='#8a6a48', edge_amt=0.14, edge_r=0.04, ao=(0.9, 0.85), coord='obj')

PALETTE_BROAD = {
    'bark': BARK_BROAD,
    'leaf': dict(base='#3f8b34', var='#2a6a2a', var_scale=1.7, var_amt=1.0, fine=0.14, top=0.55, edge='#82bf52',
                 edge_amt=0.35, edge_r=0.05, ao=(1.4, 0.95)),
    'leaf_light': dict(base='#68a842', var='#4a9136', var_scale=2.0, var_amt=1.0, fine=0.12, top=0.62, edge='#b0dc72',
                       edge_amt=0.4, edge_r=0.05, ao=(1.2, 0.85)),
    'leaf_dark': dict(base='#2e6e2d', var='#1f5524', var_scale=1.8, var_amt=1.0, fine=0.14, top=0.5, edge='#5f9f45',
                      edge_amt=0.3, edge_r=0.05, ao=(1.6, 1.0)),
}

PALETTE_ACACIA = {
    'bark': dict(base='#6d5c49', var='#3d3126', var_scale=8.0, var_amt=0.75, fine=0.16, fine_scale=36.0, top=0.12,
                 streaks=(7.0, 0.4, 0.28), edge='#8a7a62', edge_amt=0.08, edge_r=0.035, ao=(0.8, 0.85), coord='obj'),
    # copas achatadas recebem luz de topo o tempo todo: `top` mais baixo que o das árvores redondas para não estourar
    'leaf': dict(base='#738a3a', var='#566c2c', var_scale=1.8, var_amt=1.0, fine=0.14, top=0.36, edge='#a6bb5a',
                 edge_amt=0.35, edge_r=0.05, ao=(1.4, 0.85)),
    'leaf_light': dict(base='#8ea044', var='#738a3a', var_scale=2.2, var_amt=1.0, fine=0.12, top=0.4, edge='#c5d377',
                       edge_amt=0.4, edge_r=0.05, ao=(1.2, 0.8)),
    'leaf_dark': dict(base='#4f6228', var='#3b4c1e', var_scale=1.9, var_amt=1.0, fine=0.14, top=0.3, edge='#7d9444',
                      edge_amt=0.3, edge_r=0.05, ao=(1.6, 0.9)),
}

PALETTE_PALM = {
    'frond': dict(base='#4a9a3a', var='#2c7a2e', var_scale=2.4, var_amt=1.0, fine=0.12, top=0.6, edge='#9fd45a',
                  edge_amt=0.3, edge_r=0.03, ao=(0.9, 0.8)),
    'frond_light': dict(base='#7dc04c', var='#52a53a', var_scale=2.4, var_amt=1.0, fine=0.12, top=0.62, edge='#c4ea78',
                        edge_amt=0.3, edge_r=0.03, ao=(0.9, 0.7)),
    'frond_dry': dict(base='#9a7440', var='#6f5128', var_scale=2.2, var_amt=1.0, fine=0.14, top=0.5, ao=(0.9, 0.7)),
    'rachis': dict(base='#b4a85c', var='#948a46', var_scale=3.0, var_amt=1.0, fine=0.1, top=0.5, ao=(0.7, 0.5)),
    'shaft': dict(base='#6c8438', var='#4c6428', var_scale=3.0, var_amt=1.0, fine=0.14, top=0.5, ao=(0.8, 0.9)),
    'coconut': dict(base='#6a4524', var='#432a14', var_scale=4.0, var_amt=1.0, fine=0.14, top=0.5, edge='#a07a48',
                    edge_amt=0.3, edge_r=0.02, ao=(0.5, 0.8)),
}

PALETTE_GRASS = {
    'straw': dict(base='#c9a24a', var='#b38a3a', var_scale=6.0, var_amt=0.9, fine=0.10, fine_scale=40.0, top=0.35,
                  grad=(0.0, 1.0, 0.5), ao=(0.5, 0.6)),
    'straw_pale': dict(base='#e0c374', var='#c9a24a', var_scale=6.0, var_amt=0.9, fine=0.10, fine_scale=40.0, top=0.35,
                       grad=(0.0, 1.0, 0.45), ao=(0.5, 0.6)),
    'straw_dark': dict(base='#a98532', var='#8a6a28', var_scale=6.0, var_amt=0.9, fine=0.10, fine_scale=40.0, top=0.3,
                       grad=(0.0, 1.0, 0.5), ao=(0.5, 0.7)),
}

PALETTE_TUMBLE = {
    'twig': dict(base='#8e7944', var='#6e5a30', var_scale=7.0, var_amt=1.0, fine=0.14, fine_scale=45.0, top=0.45,
                 ao=(0.45, 1.0), coord='obj'),
    'twig_light': dict(base='#ac965c', var='#8e7944', var_scale=7.0, var_amt=1.0, fine=0.12, fine_scale=45.0, top=0.5,
                       ao=(0.45, 0.9), coord='obj'),
    'twig_dark': dict(base='#6a5732', var='#4c3d22', var_scale=7.0, var_amt=1.0, fine=0.14, fine_scale=45.0, top=0.4,
                      ao=(0.45, 1.0), coord='obj'),
}


def palm_bark(name):
    """Casca da palmeira (material de pintura só para o bake): cinza-palha mosqueado com anéis de cicatriz horizontais
    (sulcos escuros de ~0,19 de período, deformados por ruído para não ficarem régua), veios verticais, pé mais escuro,
    luz de topo pintada e oclusão ambiente. Coordenadas do OBJETO (o tronco corre ao longo de Z do Blender)."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    nb = C.NB(nt)
    geo = nb.node('ShaderNodeNewGeometry')
    tc = nb.node('ShaderNodeTexCoord')
    obj = tc.outputs['Object']
    ox, oy, oz = nb.sep(obj)
    blot = nb.noise(obj, scale=3.2, detail=3.0, rough=0.6, distortion=0.3)
    blot = nb.ramp(blot, [(0.34, 0.0), (0.66, 1.0)])
    col = nb.mix(nb.math('MULTIPLY', nb.bw(blot), 0.9), nb.rgb('#a08a64'), nb.rgb('#745f40'))
    # veios verticais finos
    vec = nb.comb(nb.math('MULTIPLY', ox, 14.0), nb.math('MULTIPLY', oy, 14.0), nb.math('MULTIPLY', oz, 1.4))
    veins = nb.noise(vec, scale=1.0, detail=2.0, rough=0.5)
    col = nb.scale(col, nb.math('ADD', 0.86, nb.math('MULTIPLY', veins, 0.28)))
    # anéis: seno da altura (z) deformado por ruído; sulco = vale do seno
    warp = nb.noise(obj, scale=5.0, detail=1.0, rough=0.5)
    zz = nb.math('ADD', oz, nb.math('MULTIPLY', warp, 0.09))
    wave = nb.math('SINE', nb.math('MULTIPLY', zz, TWO_PI / 0.19))
    fac = nb.math('ADD', nb.math('MULTIPLY', wave, 0.5), 0.5)
    groove = nb.ramp(fac, [(0.0, 1.0), (0.34, 0.0)])
    col = nb.mix(nb.math('MULTIPLY', nb.bw(groove), 0.85), col, nb.rgb('#3d2e1d'))
    # pé do tronco escuro
    _, _, pz = nb.sep(geo.outputs['Position'])
    foot = nb.math('MINIMUM', nb.math('MAXIMUM', nb.math('SUBTRACT', 1.0, nb.math('DIVIDE', pz, 0.9)), 0.0), 1.0)
    col = nb.mix(nb.math('MULTIPLY', foot, 0.8), col, nb.rgb('#3a2c1c'))
    # luz de topo + AO
    _, _, nz = nb.sep(geo.outputs['Normal'])
    col = nb.scale(col, nb.math('ADD', 1.0, nb.math('MULTIPLY', nz, 0.25)))
    ao = nb.node('ShaderNodeAmbientOcclusion', samples=16, only_local=False)
    ao.inputs['Distance'].default_value = 0.5
    col = nb.scale(col, nb.math('ADD', 0.35, nb.math('MULTIPLY', ao.outputs['AO'], 0.65)))
    em = nb.node('ShaderNodeEmission')
    nb.link(col, em.inputs['Color'])
    out = nb.node('ShaderNodeOutputMaterial')
    nt.links.new(em.outputs[0], out.inputs['Surface'])
    mat['paint_key'] = name
    mat['is_team'] = False
    return mat


# ---------------------------------------------------------------------------
# Geometria: helpers
# ---------------------------------------------------------------------------
def add_sheet(mb, verts, faces, mat, face_mats=None, m=None, smooth=0.0):
    """Superfície aberta (folha, lâmina, fronde) no `MeshBuilder`. Como `MeshBuilder.add`, mas SEM `recalc_face_normals`
    (em malha aberta ele escolhe o lado ao acaso): o enrolamento dos polígonos já vem certo de `ribbon`.
    `face_mats` = chave de material por face (senão `mat` em todas)."""
    m = m or Matrix.Identity(4)
    bm = mb.bm
    bv = [bm.verts.new(C.g(m @ Vector(p))) for p in verts]
    mb.part_id += 1
    pid = mb.part_id
    for k, f in enumerate(faces):
        try:
            face = bm.faces.new([bv[i] for i in f])
        except ValueError:
            continue
        face.material_index = mb.mat_index(face_mats[k] if face_mats else mat)
        face[mb.part] = pid
    mb.smooth_angles[pid] = smooth
    bm.normal_update()
    return pid


def ribbon(pts, wl, wr, side, fold, mid=0.0, lead=None, mats=('a', 'b')):
    """Fita larga e articulada ao longo de um caminho: fronde de palmeira, lâmina de capim.
    pts: estações (a última é a ponta, sem largura); wl/wr: meia-largura esquerda/direita por estação (len = len(pts)-1);
    side: vetor lateral unitário (constante); fold: quanto a borda cai atrás do eixo central (fração da largura: perfil em
    telhado de duas águas, o eixo é a quilha); mid > 0 acrescenta uma nervura central de meia-largura `mid`; lead: par de
    listas (esquerda, direita) com o avanço (m, ao longo do caminho) de cada estação de borda (dentes de serra inclinados).
    A frente é `side × d`. Devolve (verts, faces, face_mats) com o enrolamento voltado para a frente."""
    pts = [Vector(p) for p in pts]
    n = len(pts) - 1
    side = Vector(side).normalized()
    tang = []
    for i in range(n + 1):
        a = pts[max(i - 1, 0)]
        b = pts[min(i + 1, n)]
        tang.append((b - a).normalized())
    verts, faces, fm = [], [], []
    ids = []
    for i in range(n):
        p, t = pts[i], tang[i]
        front = side.cross(t).normalized()
        w_l, w_r = wl[i], wr[i]
        adv_l = t * (lead[0][i] if lead else 0.0)
        adv_r = t * (lead[1][i] if lead else 0.0)
        L = p + side * w_l - front * (fold * w_l) + adv_l
        R = p - side * w_r - front * (fold * w_r) + adv_r
        if mid > 0:
            ML, MR = p + side * mid, p - side * mid
            row = [L, ML, MR, R]
        else:
            row = [L, p, R]
        ids.append(list(range(len(verts), len(verts) + len(row))))
        verts += [tuple(v) for v in row]
    tip = len(verts)
    verts.append(tuple(pts[n]))
    for i in range(n):
        a = ids[i]
        if i + 1 < n:
            b = ids[i + 1]
            if mid > 0:
                faces += [(a[0], b[0], b[1], a[1]), (a[1], b[1], b[2], a[2]), (a[2], b[2], b[3], a[3])]
                fm += [mats[0], mats[1], mats[0]]
            else:
                faces += [(a[0], b[0], b[1], a[1]), (a[1], b[1], b[2], a[2])]
                fm += [mats[0], mats[0]]
        else:
            if mid > 0:
                faces += [(a[0], tip, a[1]), (a[1], tip, a[2]), (a[2], tip, a[3])]
                fm += [mats[0], mats[1], mats[0]]
            else:
                faces += [(a[0], tip, a[1]), (a[1], tip, a[2])]
                fm += [mats[0], mats[0]]
    return verts, faces, fm


def trunk_rings(path, radii, n=10, up=(0, 0, 1), lobes=None, k=4, phase=0.4):
    """Anéis perpendiculares ao eixo (`limb_rings`) com lóbulos de raiz: `lobes[i]` (amplitude por estação) alarga o anel nos
    k lóbulos (cos² do ângulo do índice), que somem com a altura."""
    rings = limb_rings(path, radii, n, up=up)
    if not lobes:
        return rings
    out = []
    for ring, p, amp in zip(rings, path, lobes):
        if not amp:
            out.append(ring)
            continue
        c = Vector(p)
        nr = []
        for j, q in enumerate(ring):
            a = TWO_PI * j / n + math.pi / n
            f = 1.0 + amp * max(0.0, math.cos(k * (a - phase))) ** 2
            nr.append(tuple(c + (Vector(q) - c) * f))
        out.append(nr)
    return out


def lump(mb, x, y, z, rx, ry, rz, mat, rot=(0.0, 0.0, 0.0), nu=8, nv=5, rg=None, jit=0.0):
    """Massa de folhas facetada (esfera achatada) com rotação própria. `rg` + `jit`: cada vértice é afastado/aproximado do
    centro em até `jit` (fração do raio), o que tira a cara de balão de uma elipsoide perfeita."""
    verts, faces = prim_sphere(rx, ry, rz, nu, nv)
    if rg is not None and jit > 0:
        verts = [tuple(c * (1.0 + rg.uniform(-jit, jit)) for c in v) for v in verts]
    return mb.add((verts, faces), mat, M((x, y, z), rot), smooth=0)


def jitter_rot(rg, tilt=14.0):
    return (rg.uniform(-tilt, tilt), rg.uniform(0.0, 360.0), rg.uniform(-tilt, tilt))


# ---------------------------------------------------------------------------
# Pós-produção comum: UV atlas -> bake -> material final -> Static_Mesh -> export
# ---------------------------------------------------------------------------
def finish(root, parts, name, weights, atlas, margin=0.012, angle=66.0, quality=80, sockets=True):
    bpy.context.view_layer.update()
    C.uv_atlas(parts, weights=weights, margin=margin, angle=angle)
    # Margem de bake de 4 px, MENOR que o espaço entre ilhas do empacotamento (0,014 × 512 = ~7 px nas árvores). Testado: com 16 px
    # (para a cor das ilhas cobrir o fundo preto do atlas e a mip não escurecer folhas de árvore pequena na tela) o Blender
    # estende a margem de uma ilha por cima da borda das ilhas finas vizinhas e pinta verde no tronco (7 faces do tronco da árvore
    # larga contra 0 com 4 px; conferido amostrando o atlas no centro UV de cada face). Não aumente sem aumentar o espaço entre ilhas.
    img = C.bake_atlas(parts, name + '_atlas', atlas, samples=int(os.environ.get('BAKE_SAMPLES', 32)), margin=4)
    C.finalize_materials(parts, img, team_default=TEAM_DEFAULT, out_png=os.path.join(C.BUILD_DIR, name + '_atlas.png'))
    static = C.join_objects(list(parts), 'Static_Mesh')
    static.parent = root
    if sockets:  # mesmo padrão de tree_oak.glb (raiz > Socket_Rally, Socket_UnitSpawn, Static_Mesh)
        C.make_empty('Socket_UnitSpawn', (0, 0, 0), parent=root)
        C.make_empty('Socket_Rally', (0, 0, 0), parent=root)
    bpy.context.view_layer.update()
    out = os.path.join(C.OUT_MODELS, name + '.glb')
    C.export_glb(root, out, quality=quality)
    print('STATS', name, C.stats(root, out), flush=True)
    return out


# ---------------------------------------------------------------------------
# ART-02: árvore alta de copa larga
# ---------------------------------------------------------------------------
def build_broad():
    """Tronco grosso (~1,5 de diâmetro na base, com quatro contrafortes), bifurcação a ~3,5 m e cinco braços que sustentam
    uma copa larga (~6,6) em quatro andares de massas facetadas (saia escura embaixo, miolo, andar superior e topo claro) com
    vértices levemente deslocados para tirar a cara de balão; ~8,5 de altura."""
    C.reset_scene()
    rg = random.Random(21)
    mats = C.make_paint_set(PALETTE_BROAD)
    root = C.make_empty('TreeBroad')

    tr = MeshBuilder('Trunk')
    path = [(0.0, -0.16, 0.0), (0.03, 0.25, 0.0), (0.06, 0.95, 0.02), (0.13, 1.85, 0.05), (0.10, 2.8, 0.0), (0.05, 3.6, -0.02)]
    radii = [0.74, 0.60, 0.50, 0.45, 0.42, 0.38]
    lobes = [0.5, 0.42, 0.16, 0.0, 0.0, 0.0]
    tr.add(prim_rings(trunk_rings(path, radii, n=12, lobes=lobes, k=4, phase=0.35), cap0=False), 'bark', smooth=55)
    fork = (0.05, 3.55, -0.02)
    for tgt, mid in (((1.55, 5.15, 0.55), (0.75, 4.05, 0.1)), ((-1.35, 5.05, 0.9), (-0.6, 4.0, 0.45)),
                     ((-0.7, 5.2, -1.4), (-0.3, 4.1, -0.7)), ((1.0, 5.0, -1.2), (0.6, 4.0, -0.6)),
                     ((0.1, 6.2, 0.1), (0.05, 4.7, 0.0))):
        pts = C.bezier(fork, mid, tgt, 3)
        tr.add(prim_rings(limb_rings(pts, [0.27, 0.21, 0.15, 0.10], 6, up=(0, 0, 1)), cap0=False, cap1=False), 'bark', smooth=50)
    trunk = tr.build(mats, parent=root)

    cr = MeshBuilder('Crown')
    jt = 0.09
    # saia escura (andar de baixo), mais larga que alta
    for k in range(5):
        a = math.radians(30 + 72 * k + rg.uniform(-10, 10))
        r = 2.0 + rg.uniform(-0.2, 0.15)
        s = 1.2 + rg.uniform(-0.15, 0.15)
        lump(cr, r * math.cos(a), 4.55 + rg.uniform(-0.15, 0.15), r * math.sin(a), s, 0.82, s, 'leaf_dark', jitter_rot(rg), 8, 4, rg, jt)
    # miolo: o andar mais largo
    for k in range(6):
        a = math.radians(60 * k + 8 + rg.uniform(-10, 10))
        r = 1.95 + rg.uniform(-0.2, 0.15)
        s = 1.5 + rg.uniform(-0.15, 0.15)
        lump(cr, r * math.cos(a), 5.5 + rg.uniform(-0.22, 0.22), r * math.sin(a), s, 1.1, s * 0.98,
             'leaf_light' if k % 3 == 0 else ('leaf_dark' if k % 3 == 2 else 'leaf'), jitter_rot(rg), 8, 5, rg, jt)
    # andar superior
    for k in range(5):
        a = math.radians(14 + 72 * k + rg.uniform(-12, 12))
        r = 1.25 + rg.uniform(-0.15, 0.15)
        s = 1.38 + rg.uniform(-0.12, 0.12)
        lump(cr, r * math.cos(a), 6.55 + rg.uniform(-0.2, 0.22), r * math.sin(a), s, 1.05, s,
             'leaf_light' if k % 2 == 0 else 'leaf', jitter_rot(rg), 8, 5, rg, jt)
    lump(cr, 0.1, 7.4, 0.05, 1.5, 1.15, 1.45, 'leaf_light', jitter_rot(rg), 8, 5, rg, jt)   # topo
    lump(cr, 0.0, 5.8, 0.0, 1.25, 1.0, 1.25, 'leaf', jitter_rot(rg), 7, 4, rg, jt)          # enchimento do miolo
    for (x, y, z, r, mat) in ((2.45, 6.15, 0.6, 0.95, 'leaf'), (-2.2, 6.0, -0.9, 0.9, 'leaf_light'), (0.3, 4.1, 2.35, 0.9, 'leaf_dark')):
        lump(cr, x, y, z, r, r * 0.8, r, mat, jitter_rot(rg), 7, 4, rg, jt)           # tufos soltos: quebram a silhueta redonda
    crown = cr.build(mats, parent=root)
    finish(root, [trunk, crown], 'tree_broad', {'Trunk': 2.0, 'Crown': 1.0}, 512, margin=0.014)
    return root


# ---------------------------------------------------------------------------
# ART-02: palmeira
# ---------------------------------------------------------------------------
def frond(phi_deg, th0_deg, th1_deg, length, wmax, n=8, fold=0.4, zig=0.5, mid=0.035, drift=0.0, curve=1.4):
    """Fronde de folha larga e recortada. phi = azimute (graus, em torno de Y; 0 = +X); th0/th1 = elevação na base/ponta
    (graus; a folha cai em arco, `curve` > 1 concentra a queda perto da ponta); `drift` = quanto o azimute gira ao longo do
    comprimento (graus, a folha faz uma curva em planta). Largura máxima perto de 40 % do comprimento, margem em dentes de
    serra (as estações de borda alternam entre largas e estreitas, defasadas entre os lados e inclinadas para a ponta) e
    nervura central clara."""
    phi = math.radians(phi_deg)
    ds = length / n
    p = Vector((0.0, 0.0, 0.0))
    pts = [tuple(p)]
    for i in range(n):
        u = (i + 0.5) / n
        th = math.radians(th0_deg + (th1_deg - th0_deg) * u ** curve)
        ph = phi + math.radians(drift) * u
        p = p + Vector((math.cos(th) * math.cos(ph), math.sin(th), math.cos(th) * math.sin(ph))) * ds
        pts.append(tuple(p))
    wl, wr, ll, lr = [], [], [], []
    for i in range(n):
        u = i / n
        w = wmax * (0.25 + 0.75 * math.sin(math.pi * min(1.0, u) ** 0.75))
        fl = 1.0 if (i % 2 == 0 or i == 0) else zig
        fr = zig if (i % 2 == 0 and i > 0) else 1.0
        wl.append(w * fl)
        wr.append(w * fr)
        ll.append(0.5 * ds if fl == 1.0 else 0.0)
        lr.append(0.5 * ds if fr == 1.0 else 0.0)
    side = (-math.sin(phi), 0.0, math.cos(phi))
    return ribbon(pts, wl, wr, side, fold, mid=mid, lead=(ll, lr), mats=('a', 'b'))


def build_palm():
    """Tronco curvo (inclina ~14° e volta a subir; a copa fica ~1,6 m ao lado do pé), anéis de cicatriz pintados, 'pescoço' verde,
    cacho de cocos e 16 frondes vivas (3 jovens quase de pé, 7 maduras em arco, 6 baixas caindo) mais 2 secas penduradas;
    ~7,6 de altura. As frondes são fitas largas com margem em dentes de serra e nervura central clara."""
    C.reset_scene()
    rg = random.Random(5)
    mats = C.make_paint_set(PALETTE_PALM)
    mats['bark'] = palm_bark('P_bark')
    root = C.make_empty('TreePalm')

    tr = MeshBuilder('Trunk')
    pts = [(0.0, -0.12, 0.0), (0.02, 0.6, 0.05), (0.08, 1.3, 0.10), (0.2, 2.0, 0.10), (0.4, 2.7, 0.05), (0.66, 3.4, -0.05),
           (0.96, 4.1, -0.12), (1.25, 4.8, -0.15), (1.48, 5.4, -0.14), (1.6, 6.0, -0.12)]
    radii = [0.5, 0.36, 0.29, 0.27, 0.26, 0.25, 0.24, 0.235, 0.235, 0.25]
    lobes = [0.3, 0.12, 0, 0, 0, 0, 0, 0, 0, 0]
    tr.add(prim_rings(trunk_rings(pts, radii, n=8, lobes=lobes, k=4, phase=0.2), cap0=False, cap1=False), 'bark', smooth=60)
    cx, cy, cz = pts[-1][0], pts[-1][1] + 0.06, pts[-1][2]
    tr.add(prim_sphere(0.34, 0.42, 0.34, 7, 4), 'shaft', M((cx, cy - 0.06, cz)), smooth=40)
    for k in range(5):   # cacho de cocos sob a copa
        a = math.radians(30 + 72 * k + rg.uniform(-14, 14))
        tr.add(prim_sphere(0.2, 0.23, 0.2, 6, 3), 'coconut',
               M((cx + 0.3 * math.cos(a), cy - 0.4 + rg.uniform(-0.05, 0.05), cz + 0.3 * math.sin(a)), jitter_rot(rg, 20)),
               smooth=0)
    trunk = tr.build(mats, parent=root)

    fr = MeshBuilder('Fronds')
    live = []
    for k in range(16):
        phi = (137.5 * k + 20.0) % 360.0
        if k < 3:        # jovens: estreitas e quase de pé
            live.append((phi, rg.uniform(60, 72), rg.uniform(18, 34), rg.uniform(1.7, 2.0), 0.36, rg.uniform(-8, 8)))
        elif k < 10:     # maduras: grandes arcos
            live.append((phi, rg.uniform(30, 42), rg.uniform(-62, -48), rg.uniform(3.2, 3.6), 0.66, rg.uniform(-14, 14)))
        else:            # baixas: caem quase retas
            live.append((phi, rg.uniform(4, 14), rg.uniform(-82, -68), rg.uniform(3.0, 3.4), 0.6, rg.uniform(-14, 14)))
    for k, (phi, th0, th1, length, w, drift) in enumerate(live):
        v, f, fm = frond(phi, th0, th1, length, w, drift=drift)
        fm = ['frond_light' if (m == 'a' and k % 3 == 1) else ('frond' if m == 'a' else 'rachis') for m in fm]
        add_sheet(fr, v, f, None, fm, M((cx, cy + 0.02, cz)))
    for phi, th0, th1, length, w in ((75.0, -18.0, -86.0, 2.3, 0.3), (255.0, -22.0, -88.0, 2.1, 0.28)):   # secas, penduradas
        v, f, fm = frond(phi, th0, th1, length, w, zig=0.5, curve=1.2)
        add_sheet(fr, v, f, None, ['frond_dry'] * len(f), M((cx, cy - 0.1, cz)))
    fronds = fr.build(mats, parent=root)
    finish(root, [trunk, fronds], 'tree_palm', {'Trunk': 1.3, 'Fronds': 1.0}, 512, margin=0.014)
    return root


# ---------------------------------------------------------------------------
# ART-02: acácia
# ---------------------------------------------------------------------------
def build_acacia():
    """Tronco torto em S que se abre em cinco braços (quatro para os lados, um curto para cima) e copa achatada em
    guarda-chuva: 22 massas de folhagem bem mais largas que altas, em três andares (aba escura na borda, miolo, dossel claro);
    ~6,7 de largura e ~6,3 de altura."""
    C.reset_scene()
    rg = random.Random(33)
    mats = C.make_paint_set(PALETTE_ACACIA)
    root = C.make_empty('TreeAcacia')

    tr = MeshBuilder('Trunk')
    path = [(0.0, -0.12, 0.0), (-0.1, 0.22, 0.04), (-0.25, 0.7, 0.08), (-0.42, 1.45, 0.2), (-0.15, 2.25, 0.3), (0.3, 2.95, 0.2)]
    radii = [0.56, 0.45, 0.39, 0.33, 0.29, 0.26]
    lobes = [0.3, 0.16, 0.05, 0.0, 0.0, 0.0]
    tr.add(prim_rings(trunk_rings(path, radii, n=10, lobes=lobes, k=3, phase=0.5), cap0=False), 'bark', smooth=55)
    fork = (0.3, 2.95, 0.2)
    for tgt, mid, r in (((1.95, 4.7, 0.8), (1.2, 3.6, 0.6), 0.24), ((-1.65, 4.65, -1.0), (-0.5, 3.7, -0.3), 0.23),
                        ((0.85, 4.8, -1.85), (0.9, 3.8, -0.9), 0.22), ((-0.85, 4.8, 1.75), (0.3, 4.0, 0.3), 0.2),
                        ((0.15, 5.15, 0.0), (0.25, 3.9, 0.2), 0.2)):
        pts = C.bezier(fork, mid, tgt, 3)
        tr.add(prim_rings(limb_rings(pts, [r, r * 0.76, r * 0.56, r * 0.4], 6, up=(0, 0, 1)), cap0=False, cap1=False),
               'bark', smooth=50)
    trunk = tr.build(mats, parent=root)

    cr = MeshBuilder('Crown')
    flat = (6.0, 360.0, 6.0)

    def tilt():
        return (rg.uniform(-flat[0], flat[0]), rg.uniform(0.0, flat[1]), rg.uniform(-flat[2], flat[2]))

    # três andares de massas achatadas (mais largas que altas, mas com volume): aba escura na borda, miolo e dossel claro por
    # cima; o centro do dossel é o ponto mais alto, a copa tem ~7 de largura e ~2 de espessura, de borda recortada
    for k in range(9):
        a = math.radians(20 + 40 * k + rg.uniform(-9, 9))
        r = 2.35 + rg.uniform(-0.2, 0.15)
        s = 1.15 + rg.uniform(-0.12, 0.12)
        lump(cr, r * math.cos(a), 4.5 + rg.uniform(-0.15, 0.15), r * math.sin(a), s, 0.58, s * 0.95,
             'leaf_dark' if k % 3 else 'leaf', tilt(), 8, 4, rg, 0.1)
    for k in range(7):
        a = math.radians(10 + 51.4 * k + rg.uniform(-9, 9))
        r = 1.35 + rg.uniform(-0.15, 0.15)
        s = 1.3 + rg.uniform(-0.12, 0.12)
        lump(cr, r * math.cos(a), 5.0 + rg.uniform(-0.15, 0.15), r * math.sin(a), s, 0.6, s * 0.95,
             'leaf_light' if k % 3 == 0 else 'leaf', tilt(), 8, 4, rg, 0.1)
    for k in range(5):
        a = math.radians(30 + 72 * k + rg.uniform(-12, 12))
        r = 0.75 + rg.uniform(-0.1, 0.1)
        s = 1.1 + rg.uniform(-0.1, 0.1)
        lump(cr, r * math.cos(a), 5.45 + rg.uniform(-0.1, 0.12), r * math.sin(a), s, 0.55, s * 0.95, 'leaf_light', tilt(), 8, 4, rg, 0.1)
    lump(cr, 0.1, 5.8, 0.0, 1.2, 0.55, 1.15, 'leaf_light', tilt(), 8, 4, rg, 0.1)
    crown = cr.build(mats, parent=root)
    finish(root, [trunk, crown], 'tree_acacia', {'Trunk': 2.0, 'Crown': 1.0}, 512, margin=0.014)
    return root


# ---------------------------------------------------------------------------
# ART-03: tufo de capim seco
# ---------------------------------------------------------------------------
def blade(phi_deg, h, w0, psi0, psi1, r0, n=4, fold=0.4, drift=0.0):
    """Lâmina de capim: fita afilada até a ponta que nasce a `r0` do eixo e arqueia para fora (psi = inclinação em relação à
    vertical, de psi0 na base a psi1 na ponta; `drift` gira o azimute ao longo do comprimento, em graus). A face de fora é a
    convexa (a quilha); as bordas caem para dentro."""
    phi = math.radians(phi_deg)
    ds = h / n
    p = Vector((math.cos(phi) * r0, 0.0, math.sin(phi) * r0))
    pts = [tuple(p)]
    for i in range(n):
        u = (i + 0.5) / n
        psi = math.radians(psi0 + (psi1 - psi0) * u ** 1.4)
        ph = phi + math.radians(drift) * u
        p = p + Vector((math.sin(psi) * math.cos(ph), math.cos(psi), math.sin(psi) * math.sin(ph))) * ds
        pts.append(tuple(p))
    ws = [w0 * f for f in (0.42, 1.0, 0.82, 0.48, 0.3)][:n]   # estreita na base, mais larga no 1/3 e afilando até a ponta
    side = (math.sin(phi), 0.0, -math.cos(phi))
    return ribbon(pts, ws, ws, side, fold, mid=0.0, mats=('a', 'b'))


def build_grass_dry():
    """12 lâminas em cone (fonte): sete longas e arqueadas no anel de fora, cinco mais eretas no anel de dentro; ouro-palha
    (#c9a24a) com a base escurecida, algumas pálidas e algumas mais escuras. ~0,9 de altura e ~1,8 de largura nas pontas."""
    C.reset_scene()
    rg = random.Random(11)
    mats = C.make_paint_set(PALETTE_GRASS)
    root = C.make_empty('GrassDry')
    mb = MeshBuilder('Tuft')
    plan = []
    for k in range(7):       # anel de fora: longas, abrem logo na base e arqueiam até a ponta quase caída
        plan.append((k * 51.4 + rg.uniform(-8, 8), rg.uniform(1.05, 1.2), rg.uniform(0.072, 0.084), rg.uniform(24, 30),
                     rg.uniform(62, 74), rg.uniform(0.11, 0.16), rg.uniform(-14, 14), 'straw_pale' if k % 3 == 1 else 'straw'))
    for k in range(5):       # anel de dentro, entre as de fora: mais eretas e ainda abertas
        plan.append((k * 72.0 + 26.0 + rg.uniform(-9, 9), rg.uniform(0.95, 1.1), rg.uniform(0.066, 0.076), rg.uniform(14, 20),
                     rg.uniform(46, 58), rg.uniform(0.07, 0.1), rg.uniform(-10, 10), 'straw_dark' if k % 2 == 0 else 'straw'))
    for (phi, h, w0, p0, p1, r0, drift, mat) in plan:
        v, f, fm = blade(phi, h, w0, p0, p1, r0, drift=drift, fold=0.3)
        add_sheet(mb, v, f, mat, None)
    tuft = mb.build(mats, parent=root)
    finish(root, [tuft], 'grass_dry', {'Tuft': 1.0}, 256, margin=0.01, angle=70.0, quality=85, sockets=False)
    return root


# ---------------------------------------------------------------------------
# ART-03: arbusto rolante
# ---------------------------------------------------------------------------
def twig(mb, pts, radii, mat, n=3):
    """Galho fino: anéis de n lados por transporte paralelo do quadro (sem torções, ao contrário do `limb_rings` com `up` fixo)
    afunilando até a ponta (tampa de um triângulo)."""
    P = [Vector(p) for p in pts]
    tans = [((P[min(i + 1, len(P) - 1)] - P[max(i - 1, 0)]).normalized()) for i in range(len(P))]
    ref = Vector((0, 1, 0)) if abs(tans[0].y) < 0.9 else Vector((1, 0, 0))
    nrm = (ref - tans[0] * ref.dot(tans[0])).normalized()
    rings = []
    for i, p in enumerate(P):
        t = tans[i]
        nrm = (nrm - t * nrm.dot(t)).normalized()
        bin_ = t.cross(nrm)
        ring = []
        for k in range(n):
            a = TWO_PI * k / n
            ring.append(tuple(p + (nrm * math.cos(a) + bin_ * math.sin(a)) * radii[i]))
        rings.append(ring)
    return mb.add(prim_rings(rings, cap0=False, cap1=True), mat, smooth=0)


def build_tumbleweed():
    """Esfera emaranhada de galhos secos de ~0,85 de diâmetro, encostada no chão (centro de rotação em y = 0,42): ~74 arcos de
    círculo máximo (4 estações; 60 % na casca e o resto no miolo), 22 galhos radiais (alguns furam a casca e arrepiam a
    silhueta) e 20 folhinhas secas coladas. Tom palha-escuro; o interior fica mais escuro pelo AO assado."""
    C.reset_scene()
    rg = random.Random(17)
    mats = C.make_paint_set(PALETTE_TUMBLE)
    root = C.make_empty('Tumbleweed')
    R = 0.42
    cen = Vector((0.0, R, 0.0))
    mb = MeshBuilder('Bush')
    keys = ['twig', 'twig_light', 'twig_dark']

    def rand_dir():
        while True:
            v = Vector((rg.uniform(-1, 1), rg.uniform(-1, 1), rg.uniform(-1, 1)))
            if 0.05 < v.length_squared <= 1.0:
                return v.normalized()

    def jit(s):
        return Vector((rg.uniform(-s, s), rg.uniform(-s, s), rg.uniform(-s, s)))

    # miolo escuro: preenche o interior (visto pelas frestas da casca) por 24 triângulos
    # M2-12 (ART-03, enxuto): ~510 tris (era ~1700). 28 arcos de 3 pontos (60 % na casca, o resto no miolo), 9 galhos radiais
    # que furam a casca e arrepiam a silhueta e 14 folhinhas secas; galhos mais grossos para a silhueta continuar cheia.
    for k in range(28):
        a = rand_dir()
        ax = a.cross(rand_dir())
        if ax.length < 0.2:
            continue
        ax.normalize()
        ang = math.radians(rg.uniform(70, 130))
        shell = rg.random() < 0.6
        pts = []
        for i in range(3):
            q = Matrix.Rotation(ang * i / 2.0, 3, ax) @ a
            rad = R * ((0.92 + 0.10 * rg.random()) if shell else (0.4 + 0.4 * rg.random()))
            pts.append(tuple(cen + q * rad + jit(0.02)))
        twig(mb, pts, [0.020, 0.017, 0.008], keys[k % 3])
    for k in range(9):
        d = rand_dir()
        r0, r1 = R * rg.uniform(0.15, 0.4), R * rg.uniform(0.98, 1.16)
        twig(mb, [tuple(cen + d * r0), tuple(cen + d * (r0 + r1) * 0.5 + jit(0.02)), tuple(cen + d * r1)], [0.020, 0.016, 0.007],
             keys[(k + 1) % 3])
    for k in range(14):
        n = rand_dir()
        pos = cen + n * (R * rg.uniform(0.9, 1.02))
        t1 = n.cross(rand_dir())
        if t1.length < 0.2:
            continue
        t1.normalize()
        t2 = n.cross(t1)
        a, b = rg.uniform(0.04, 0.06), rg.uniform(0.02, 0.03)
        verts = [tuple(pos + t1 * a), tuple(pos + t2 * b), tuple(pos - t1 * a), tuple(pos - t2 * b)]
        add_sheet(mb, verts, [(0, 1, 2, 3)], 'twig_light')
    bush = mb.build(mats, parent=root)
    finish(root, [bush], 'tumbleweed', {'Bush': 1.0}, 256, margin=0.01, angle=70.0, quality=85, sockets=False)
    return root


# ---------------------------------------------------------------------------
# Verificação do .glb exportado
# ---------------------------------------------------------------------------
def webp_size(b):
    """(largura, altura) de um WebP (VP8, VP8L ou VP8X) a partir dos bytes."""
    if b[:4] != b'RIFF' or b[8:12] != b'WEBP':
        return None
    fmt = b[12:16]
    if fmt == b'VP8X':
        return 1 + int.from_bytes(b[24:27], 'little'), 1 + int.from_bytes(b[27:30], 'little')
    if fmt == b'VP8 ':
        return int.from_bytes(b[26:28], 'little') & 0x3FFF, int.from_bytes(b[28:30], 'little') & 0x3FFF
    if fmt == b'VP8L':
        bits = int.from_bytes(b[21:25], 'little')
        return (bits & 0x3FFF) + 1, ((bits >> 14) & 0x3FFF) + 1
    return None


def glb_report(path):
    """Números do .glb como o jogo o vê: triângulos, draw calls (primitivas), atributos, materiais, textura, bbox, tamanho."""
    with open(path, 'rb') as f:
        data = f.read()
    jl = struct.unpack_from('<I', data, 12)[0]
    j = json.loads(data[20:20 + jl].decode('utf-8'))
    bin_off = 20 + jl + 8
    acc = j['accessors']
    tris, draws, attrs, bb_lo, bb_hi = 0, 0, set(), None, None
    for m in j['meshes']:
        for pr in m['primitives']:
            draws += 1
            attrs |= set(pr['attributes'].keys())
            tris += acc[pr['indices']]['count'] // 3 if 'indices' in pr else acc[pr['attributes']['POSITION']]['count'] // 3
            pa = acc[pr['attributes']['POSITION']]
            lo, hi = pa['min'], pa['max']
            bb_lo = lo if bb_lo is None else [min(a, b) for a, b in zip(bb_lo, lo)]
            bb_hi = hi if bb_hi is None else [max(a, b) for a, b in zip(bb_hi, hi)]
    tex = []
    for im in j.get('images', []):
        bv = j['bufferViews'][im['bufferView']]
        off = bin_off + bv.get('byteOffset', 0)
        tex.append(webp_size(data[off:off + bv['byteLength']]))
    names = {i: n.get('name') for i, n in enumerate(j['nodes'])}
    root = next(n for n in j['nodes'] if n.get('children') and n.get('name') not in ('Static_Mesh',))
    return {
        'root': root.get('name'), 'children': [names[c] for c in root['children']], 'meshes': len(j['meshes']),
        'tris': tris, 'draw_calls': draws, 'attributes': sorted(attrs), 'materials': [m.get('name') for m in j.get('materials', [])],
        'double_sided': [bool(m.get('doubleSided')) for m in j.get('materials', [])], 'textures': tex,
        'bbox_min': [round(v, 2) for v in bb_lo], 'bbox_max': [round(v, 2) for v in bb_hi],
        'size': [round(h - l, 2) for l, h in zip(bb_lo, bb_hi)], 'kb': round(os.path.getsize(path) / 1024.0, 1),
        'extensions': j.get('extensionsUsed', []),
    }


def check_report(name, rep, tree):
    """Orçamentos da tarefa: árvores ≤ 20 draw calls (preferência ≤ 6), ≤ 15 mil tris, textura ≤ 512², sem COLOR_0;
    props ≤ 4 draw calls e ≤ 2 mil tris."""
    problems = []
    if 'COLOR_0' in rep['attributes']:
        problems.append('tem COLOR_0')
    if rep['draw_calls'] > (20 if tree else 4):
        problems.append('draw calls demais')
    if rep['tris'] > (15000 if tree else 2000):
        problems.append('triângulos demais')
    if rep['meshes'] != 1 or len(rep['materials']) != 1:
        problems.append('o TreeManager exige 1 malha e 1 material')
    if any(t is None or t[0] > 512 or t[1] > 512 for t in rep['textures']):
        problems.append('textura > 512² (ou ilegível)')
    for p in problems:
        print('FALHA ORÇAMENTO', name, p, flush=True)
    return not problems


# ---------------------------------------------------------------------------
# Preview: câmera fixa (azimute -28°, elevação 24°), fundo transparente, 512 px, a partir do próprio .glb exportado
# ---------------------------------------------------------------------------
def render_preview(name, res=None, az=-28.0, el=24.0, fov=24.0):
    import ui_common as U
    res = res or int(os.environ.get('RENDER_RES', 512))
    U.setup_scene(res=res, samples=64, transparent=True)
    U.make_world()
    U.make_lights()
    cam = U.make_camera(fov)
    _, objs = U.import_glb(name)
    pts = U.world_points(objs)
    U.fit_camera(cam, pts, U.dir_from_angles(az, el), fov=fov, margin=0.06)
    os.makedirs(PREVIEW_DIR, exist_ok=True)
    out = os.path.join(PREVIEW_DIR, name + '.png')
    bpy.context.scene.render.filepath = out
    bpy.ops.render.render(write_still=True)
    print('PREVIEW', out, flush=True)
    return out


BUILDERS = {
    'broad': (build_broad, 'tree_broad', True),
    'palm': (build_palm, 'tree_palm', True),
    'acacia': (build_acacia, 'tree_acacia', True),
    'grass_dry': (build_grass_dry, 'grass_dry', False),
    'tumbleweed': (build_tumbleweed, 'tumbleweed', False),
}


def main():
    args = C.script_args()
    kinds = [a for a in args if a in BUILDERS]
    if not kinds or 'all' in args:
        kinds = list(BUILDERS)
    ok = True
    reports = {}
    for k in kinds:
        fn, name, tree = BUILDERS[k]
        fn()
        rep = glb_report(os.path.join(C.OUT_MODELS, name + '.glb'))
        reports[name] = rep
        print('REPORT', name, json.dumps(rep, ensure_ascii=False), flush=True)
        ok = check_report(name, rep, tree) and ok
    os.makedirs(C.BUILD_DIR, exist_ok=True)
    with open(os.path.join(C.BUILD_DIR, 'art-p0-report.json'), 'w', encoding='utf-8') as f:
        json.dump(reports, f, ensure_ascii=False, indent=1)
    if '--no-render' not in args:
        for k in kinds:
            render_preview(BUILDERS[k][1])
    print('RESULTADO', 'ok' if ok else 'COM FALHAS DE ORÇAMENTO', flush=True)


if __name__ == '__main__':
    main()
