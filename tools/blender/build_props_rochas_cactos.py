"""
build_props_rochas_cactos.py — props de terreno P0 (ART-01 e ART-03 de docs/specs/MUNDO-TERRENO-MAPAS.md §6) gerados
100% por script: rochas de granito (grande, média e pequena), dois cactos e uma ossada.

Uso (sempre via tools/safe-run.sh; um Blender por vez):
  bash tools/safe-run.sh --timeout 600 -- /home/rafael/Downloads/blender-5.2.1-linux-x64/blender -b --factory-startup \
      --python tools/blender/build_props_rochas_cactos.py -- [rock_granite_large|rock_granite_medium|rock_granite_small|
                                                              cactus_1|cactus_2|bones|all] [--no-render] [--draft]

Saída (public/models/), coordenadas do jogo (x direita, y cima, +z frente), 1 unidade = 1 m, origem na base:
  rock_granite_large.glb   RockGraniteLarge   maciço de granito ~3,6 m (cinco blocos + cascalho), 1 draw call
  rock_granite_medium.glb  RockGraniteMedium  rocha de ~1,5 m, 1 draw call
  rock_granite_small.glb   RockGraniteSmall   rocha de ~0,6 m, 1 draw call
  cactus_1.glb             Cactus1            cacto colunar de dois braços (~3,1 m), 1 draw call
  cactus_2.glb             Cactus2            cacto colunar baixo de um braço (~1,6 m), 1 draw call
  bones.glb                Bones              ossada de fera: crânio com chifres, costelas, coluna e ossos soltos, 1 draw call
Cada raiz é um empty com UM nó `Static_Mesh` (material `Atlas`), o mesmo padrão das árvores: o jogo clona o nó ou extrai
geometria+material para `InstancedMesh` (como o `TreeManager`). Sem cor de vértice (o jogo tinge por instância). Sem frente
definida, exceto a ossada (crânio e focinho voltados para +Z).

Técnica: cada rocha é a união booleana de blocos convexos (casco de uma nuvem de pontos num elipsoide rugoso, com cortes
planos para facetas marcadas e topo achatado); a base é cortada abaixo de y = 0 (enterrada, esconde frestas em declive) e
fica aberta. Pintura procedural só para o bake (estratos, trincas, grão, topo claro/lados frios, poeira no pé, desgaste
de borda e AO) num atlas único; flat shading em todas as rochas e na ossada/cactos (facetas e nervuras marcadas).

`--draft` não assa nem exporta: renderiza a pintura (Emission) e um "clay" iluminado em `ART_P0_DRAFT_DIR` (padrão
tools/blender/build/art_p0_draft/) para iterar na forma. `--no-render` pula as pré-visualizações em
tools/ui-captures/art-p0/<nome>.png (512 px, fundo transparente, câmera fixa a 35° de azimute e 38° de elevação).
Variáveis: BAKE_SAMPLES (32), ATLAS_PX (força o lado do atlas), ART_P0_DRAFT_DIR.
"""
import os
import sys
import math
import json
import random
import itertools

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np  # noqa: E402
import bpy  # noqa: E402
import bmesh  # noqa: E402
from mathutils import Vector, Matrix, noise  # noqa: E402
import common as C  # noqa: E402
from common import (MeshBuilder, M, prim_box, prim_rings, ring_h, prim_cyl, prim_cone,  # noqa: E402
                    prim_sphere, limb_rings, g, hex_lin)
from bld_common import bbox_game  # noqa: E402

PREVIEW_DIR = os.path.join(C.REPO, 'tools', 'ui-captures', 'art-p0')
DRAFT_DIR = os.environ.get('ART_P0_DRAFT_DIR') or os.path.join(C.BUILD_DIR, 'art_p0_draft')
STATS_JSON = os.path.join(C.BUILD_DIR, 'art_p0_stats.json')
CAM_AZ, CAM_EL, CAM_FOV = 35.0, 38.0, 22.0       # câmera fixa das pré-visualizações

# Orçamentos pedidos (draw calls, triângulos): rocha ≤ 2 / ~3 mil; cacto ≤ 4 / ~2 mil; ossada ≤ 4
BUDGET = {
    'rock_granite_large': (2, 3000), 'rock_granite_medium': (2, 3000), 'rock_granite_small': (2, 3000),
    'cactus_1': (4, 2000), 'cactus_2': (4, 2000), 'bones': (4, 2000),
}


def log(*a):
    print('[props]', *a, flush=True)


# ---------------------------------------------------------------------------
# Utilidades de nós (sobre common.NB)
# ---------------------------------------------------------------------------
def smoothstep(nb, x, lo, hi):
    """smoothstep(x; lo, hi) com nós de matemática (hi < lo inverte o sentido)."""
    t = nb.math('MULTIPLY', nb.math('SUBTRACT', x, lo), 1.0 / (hi - lo), clamp=True)
    return nb.math('MULTIPLY', nb.math('MULTIPLY', t, t), nb.math('SUBTRACT', 3.0, nb.math('MULTIPLY', t, 2.0)))


def lerp_to(nb, col, f, hexcol, amt=1.0):
    """Mistura `col` em direção a `hexcol` com peso f*amt."""
    return nb.mix(nb.math('MULTIPLY', f, amt) if amt != 1.0 else f, col, nb.rgb(hexcol))


def bright(nb, col, f):
    return nb.scale(col, f)


def new_paint(name):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    return mat, nt, C.NB(nt)


def end_paint(mat, nt, nb, col):
    em = nb.node('ShaderNodeEmission')
    nb.link(col, em.inputs['Color'])
    out = nb.node('ShaderNodeOutputMaterial')
    nt.links.new(em.outputs[0], out.inputs['Surface'])
    mat['paint_key'] = mat.name
    mat['is_team'] = False
    return mat


def edge_wear(nb, geo, col, radius, amt, hexcol, gain=8.0):
    bev = nb.node('ShaderNodeBevel', samples=8)
    bev.inputs['Radius'].default_value = radius
    d = nb.vmath('DOT_PRODUCT', bev.outputs['Normal'], geo.outputs['Normal'])
    e = nb.math('MULTIPLY', nb.math('SUBTRACT', 1.0, d), gain, clamp=True)
    return nb.mix(nb.math('MULTIPLY', e, amt), col, nb.rgb(hexcol))


def ambient_occlusion(nb, col, dist, amt, power=1.0):
    ao = nb.node('ShaderNodeAmbientOcclusion', samples=16, only_local=False)
    ao.inputs['Distance'].default_value = dist
    a = ao.outputs['AO'] if power == 1.0 else nb.math('POWER', ao.outputs['AO'], power)
    return nb.scale(col, nb.math('ADD', 1.0 - amt, nb.math('MULTIPLY', a, amt))), ao.outputs['AO']


# ---------------------------------------------------------------------------
# Materiais de pintura (só existem para o bake)
# ---------------------------------------------------------------------------
def stretch(nb, fac, lo=0.3, hi=0.7):
    """Normaliza a saída de um ruído (concentrada em ~0,3..0,7) para 0..1."""
    return nb.math('MULTIPLY', nb.math('SUBTRACT', fac, lo), 1.0 / (hi - lo), clamp=True)


def granite_paint(name, seed=0.0, k=1.0, grain=14.0, crack_scale=0.9, crack_amt=0.30, strata_amt=1.0, top_amt=1.0,
                  dark='#7a7368', light='#aea695', edge_r=0.035, edge_amt=0.45, ao=(0.9, 0.70), dust_h=0.5,
                  strata_scale=3.8, facet_amt=0.20, grain_amt=0.14, mica_amt=0.20):
    """Granito cinza-quente (#8a8378): manchas largas (escala `k` acompanha o tamanho da rocha), estratos sutis (faixas
    horizontais em coordenadas do mundo, o eixo Z do Blender = y do jogo), trincas sinuosas (curvas de nível de um ruído),
    grão e mica, tom por faceta (ruído da normal), topo mais claro e quente, lados e fundos mais frios, poeira no pé,
    desgaste de borda (nó Bevel) e oclusão ambiente."""
    mat, nt, nb = new_paint(name)
    geo = nb.node('ShaderNodeNewGeometry')
    wpos = geo.outputs['Position']
    pos = nb.vmath('ADD', wpos, (seed * 3.1, seed * 1.7, seed * 2.3))
    px, py, pz = nb.sep(pos)
    _, _, gz = nb.sep(wpos)
    _, _, nz = nb.sep(geo.outputs['Normal'])

    # manchas largas entre o tom escuro e o claro
    blot = nb.bw(nb.ramp(nb.noise(pos, scale=0.8 * k, detail=3.0, rough=0.6, distortion=0.35), [(0.36, 0.0), (0.64, 1.0)]))
    col = nb.mix(blot, nb.rgb(dark), nb.rgb(light))
    patch = nb.bw(nb.ramp(nb.noise(pos, scale=3.4 * k, detail=2.0, rough=0.5), [(0.42, 0.0), (0.62, 1.0)]))
    col = bright(nb, col, nb.math('ADD', 0.92, nb.math('MULTIPLY', patch, 0.16)))

    # estratos: faixas largas suaves + linhas finas (ruído esticado no eixo vertical)
    sv = nb.comb(nb.math('MULTIPLY', px, 0.45 * k), nb.math('MULTIPLY', py, 0.45 * k), nb.math('MULTIPLY', pz, strata_scale))
    sb = nb.bw(nb.ramp(nb.noise(sv, scale=1.0, detail=2.0, rough=0.5, distortion=0.16), [(0.38, 0.0), (0.62, 1.0)]))
    col = bright(nb, col, nb.math('ADD', 1.0 - 0.085 * strata_amt, nb.math('MULTIPLY', sb, 0.17 * strata_amt)))
    sv2 = nb.comb(nb.math('MULTIPLY', px, 0.30 * k), nb.math('MULTIPLY', py, 0.30 * k), nb.math('MULTIPLY', pz, strata_scale * 2.9))
    sl = nb.bw(nb.ramp(nb.noise(sv2, scale=1.0, detail=1.0, rough=0.5, distortion=0.10), [(0.56, 0.0), (0.64, 1.0)]))
    col = nb.mix(nb.math('MULTIPLY', sl, 0.24 * strata_amt), col, nb.rgb('#4c4841'))

    # trincas: curvas de nível do ruído (fraturas sinuosas e finas), grão e mica
    cn = nb.math('ABSOLUTE', nb.math('SUBTRACT', nb.noise(pos, scale=crack_scale * 1.4, detail=3.0, rough=0.55,
                                                          distortion=0.4), 0.5))
    cr = nb.bw(nb.ramp(cn, [(0.0, 1.0), (0.011, 0.0)]))
    col = nb.mix(nb.math('MULTIPLY', cr, crack_amt), col, nb.rgb('#3a3631'))
    gr = stretch(nb, nb.noise(pos, scale=grain, detail=2.0, rough=0.55))
    col = bright(nb, col, nb.math('ADD', 1.0 - grain_amt / 2, nb.math('MULTIPLY', gr, grain_amt)))
    mica = nb.bw(nb.ramp(nb.voronoi(pos, scale=grain * 1.6, out='Distance', feature='F1'),
                         [(0.0, 1.0), (0.11, 1.0), (0.19, 0.0)]))
    col = nb.mix(nb.math('MULTIPLY', mica, mica_amt), col, nb.rgb('#383530'))

    # tom por faceta: ruído da normal (cada face plana ganha o seu próprio tom)
    nrm_s = nb.vmath('ADD', nb.scale(geo.outputs['Normal'], 2.6), (seed, seed * 0.6, seed * 0.3))
    fn = stretch(nb, nb.noise(nrm_s, scale=1.0, detail=0.0, rough=0.5))
    col = bright(nb, col, nb.math('ADD', 1.0 - facet_amt / 2, nb.math('MULTIPLY', fn, facet_amt)))

    # luz de topo pintada (topo claro e quente) e lados/fundos frios
    col = bright(nb, col, nb.math('ADD', 0.80, nb.math('MULTIPLY', nz, 0.26 * top_amt)))
    top = smoothstep(nb, nz, 0.45, 0.95)
    col = lerp_to(nb, col, top, '#d4cab6', 0.40 * top_amt)
    side = smoothstep(nb, nz, 0.5, -0.15)
    col = lerp_to(nb, col, side, '#5f6270', 0.14)

    # poeira no pé da rocha (altura do mundo)
    dust = smoothstep(nb, gz, dust_h, 0.0)
    col = lerp_to(nb, col, dust, '#8a7a5e', 0.42)

    col = edge_wear(nb, geo, col, edge_r, edge_amt, '#e4decd')
    col, _ = ambient_occlusion(nb, col, ao[0], ao[1], 1.2)
    return end_paint(mat, nt, nb, col)


def cactus_paint(name, seed=0.0, base='#7b8b71', dark='#5d6c55', tip='#9cac84', edge='#bccaa4', spine='#eadfb2',
                 flat_tone=0.12):
    """Cacto verde-acinzentado: nervuras (AO escurece os vales, desgaste de borda clareia as cristas), espinhos em pontos
    claros sobre as cristas, verde mais novo para o alto, poeira de areia no pé."""
    mat, nt, nb = new_paint(name)
    geo = nb.node('ShaderNodeNewGeometry')
    wpos = geo.outputs['Position']
    pos = nb.vmath('ADD', wpos, (seed * 2.3, seed * 1.1, seed * 3.7))
    _, _, gz = nb.sep(wpos)
    _, _, nz = nb.sep(geo.outputs['Normal'])
    blot = nb.bw(nb.ramp(nb.noise(pos, scale=2.2, detail=3.0, rough=0.6, distortion=0.4), [(0.38, 0.0), (0.62, 1.0)]))
    col = nb.mix(blot, nb.rgb(dark), nb.rgb(base))
    fine = nb.noise(pos, scale=34.0, detail=2.0, rough=0.5)
    col = bright(nb, col, nb.math('ADD', 0.93, nb.math('MULTIPLY', fine, 0.14)))
    # tom por faceta (nervura) e luz de topo suave
    nrm_s = nb.vmath('ADD', nb.scale(geo.outputs['Normal'], 3.1), (seed, seed * 0.6, seed * 0.3))
    col = bright(nb, col, nb.math('ADD', 1.0 - flat_tone, nb.math('MULTIPLY', nb.noise(nrm_s, scale=1.0, detail=0.0), flat_tone * 2.0)))
    col = bright(nb, col, nb.math('ADD', 0.90, nb.math('MULTIPLY', nz, 0.14)))
    # verde mais novo e claro para o alto
    young = smoothstep(nb, gz, 1.2, 3.0)
    col = lerp_to(nb, col, young, tip, 0.45)
    # poeira de areia no pé
    dust = smoothstep(nb, gz, 0.45, 0.0)
    col = lerp_to(nb, col, dust, '#a48f66', 0.5)
    col = edge_wear(nb, geo, col, 0.02, 0.55, edge, gain=7.0)
    col, ao = ambient_occlusion(nb, col, 0.16, 0.7, 1.0)
    # espinhos: pontos claros nas cristas (máscara = AO elevado), só da base até o ápice
    dots = nb.bw(nb.ramp(nb.voronoi(pos, scale=13.0, out='Distance', feature='F1'), [(0.0, 1.0), (0.09, 1.0), (0.15, 0.0)]))
    crest = smoothstep(nb, ao, 0.55, 0.9)
    col = nb.mix(nb.math('MULTIPLY', nb.math('MULTIPLY', dots, crest), 0.8), col, nb.rgb(spine))
    return end_paint(mat, nt, nb, col)


def bone_paint(name, seed=0.0, base='#dad1b6', var='#b8a77c', stain='#9c8660', crack_amt=0.13):
    """Osso branqueado ao sol: branco-creme com manchas amareladas e pardas, trincas finas, poeira no contato com o
    chão, bordas claras e AO forte nas juntas."""
    mat, nt, nb = new_paint(name)
    geo = nb.node('ShaderNodeNewGeometry')
    wpos = geo.outputs['Position']
    pos = nb.vmath('ADD', wpos, (seed * 1.9, seed * 2.9, seed * 0.7))
    _, _, gz = nb.sep(wpos)
    _, _, nz = nb.sep(geo.outputs['Normal'])
    blot = nb.bw(nb.ramp(nb.noise(pos, scale=3.0, detail=3.0, rough=0.6, distortion=0.3), [(0.36, 0.0), (0.64, 1.0)]))
    col = nb.mix(nb.math('MULTIPLY', blot, 0.85), nb.rgb(base), nb.rgb(var))
    stn = nb.bw(nb.ramp(nb.noise(pos, scale=7.0, detail=2.0, rough=0.5), [(0.55, 0.0), (0.72, 1.0)]))
    col = lerp_to(nb, col, stn, stain, 0.55)
    cr = nb.bw(nb.ramp(nb.voronoi(pos, scale=6.0, out='Distance', feature='DISTANCE_TO_EDGE'), [(0.0, 1.0), (0.03, 0.0)]))
    col = nb.mix(nb.math('MULTIPLY', cr, crack_amt), col, nb.rgb('#5d4f38'))
    fine = nb.noise(pos, scale=40.0, detail=2.0, rough=0.5)
    col = bright(nb, col, nb.math('ADD', 0.94, nb.math('MULTIPLY', fine, 0.12)))
    col = bright(nb, col, nb.math('ADD', 0.88, nb.math('MULTIPLY', nz, 0.18)))
    dust = smoothstep(nb, gz, 0.16, 0.0)
    col = lerp_to(nb, col, dust, '#8c7a58', 0.55)
    col = edge_wear(nb, geo, col, 0.012, 0.5, '#f6f0da', gain=9.0)
    col, _ = ambient_occlusion(nb, col, 0.25, 0.7, 1.0)
    return end_paint(mat, nt, nb, col)


def flat_paint(name, base, var=None, fine=0.08, top=0.25, edge=None, edge_amt=0.0, ao=None, emit=None):
    """Material simples (cavidades escuras, centros de flor...) pela pintura padrão do pipeline."""
    p = dict(base=base, var=var or base, var_scale=6.0, fine=fine, top=top)
    if edge:
        p.update(edge=edge, edge_amt=edge_amt, edge_r=0.015)
    if ao:
        p['ao'] = ao
    if emit:
        p['emit_boost'] = emit
    return C.paint_material(name, p)


# ---------------------------------------------------------------------------
# Rochas: blocos facetados (interseção de semi-espaços) + união booleana
# ---------------------------------------------------------------------------
def polytope_verts(planes):
    """Vértices da interseção de semi-espaços {n·x <= d}: resolve todas as trincas de planos e filtra os que cabem em todos."""
    N = np.array([tuple(p[0]) for p in planes], dtype=float)
    D = np.array([p[1] for p in planes], dtype=float)
    out = {}
    for i, j, k in itertools.combinations(range(len(planes)), 3):
        A = N[[i, j, k]]
        if abs(np.linalg.det(A)) < 1e-7:
            continue
        x = np.linalg.solve(A, D[[i, j, k]])
        if np.all(N @ x <= D + 1e-5):
            out[tuple(np.round(x, 4))] = x
    return [Vector(v) for v in out.values()]


def hull_prim(pts):
    """Casco convexo de pontos -> (verts, faces); faces coplanares (até 3°) fundidas em n-gons."""
    bm = bmesh.new()
    for p in pts:
        bm.verts.new(p)
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=2e-4)
    bmesh.ops.convex_hull(bm, input=bm.verts[:], use_existing_faces=False)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bmesh.ops.dissolve_limit(bm, angle_limit=math.radians(3.0), use_dissolve_boundaries=False,
                             verts=bm.verts[:], edges=bm.edges[:], delimit=set())
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bm.verts.ensure_lookup_table()
    bm.verts.index_update()
    verts = [tuple(v.co) for v in bm.verts]
    faces = [tuple(v.index for v in f.verts) for f in bm.faces]
    bm.free()
    return verts, faces


def facet_block(rng, half, chamfer=0.8, cut=(0.70, 0.90), chamfer_top=0.5, cut_top=(0.82, 0.95), jitter=0.10, taper=0.06,
                ridge=0.14, chips=3, chip_cut=(0.86, 0.95), fracs=0, frac_cut=(0.74, 0.90)):
    """Bloco de pedra facetado (monólito), centrado na origem: caixa de meias-medidas `half` cujas 6 faces são giradas
    (`jitter`) e inclinadas com a altura (`taper`, pode ser negativo: face em balanço), com telhado de duas águas no topo
    (`ridge`), chanfros nas arestas verticais (`chamfer`, a `cut` do suporte) e nas arestas/quinas do topo (`chamfer_top`,
    mais rasos, para o topo não virar ponta) e `chips` lascas planas aleatórias (fraturas). Faces grandes e arestas vivas,
    como os maciços da referência. Devolve (verts, faces) no espaço local do jogo."""
    hx, hy, hz = half
    U = rng.uniform

    def unit(x, y, z):
        return Vector((x, y, z)).normalized()

    def jit():
        return U(-jitter, jitter)

    planes = []
    for s in (-1, 1):
        planes.append((unit(s, taper * U(-0.5, 1.0), jit()), hx * U(0.92, 1.08)))
        planes.append((unit(jit(), taper * U(-0.5, 1.0), s), hz * U(0.92, 1.08)))
    planes.append((Vector((0.0, -1.0, 0.0)), hy))
    ph = U(0, 2 * math.pi)
    planes.append((unit(ridge * math.cos(ph), 1.0, ridge * math.sin(ph)), hy * U(0.96, 1.04)))
    planes.append((unit(-ridge * 0.8 * math.cos(ph), 1.0, -ridge * 0.8 * math.sin(ph)), hy * U(0.90, 1.0)))
    # chanfros: arestas verticais e do topo (sem as de baixo, enterradas); direções com pelo menos dois componentes
    for sx in (-1, 0, 1):
        for sy in (0, 1):
            for sz in (-1, 0, 1):
                if abs(sx) + abs(sy) + abs(sz) < 2:
                    continue
                p, rng_cut = (chamfer, cut) if sy == 0 else (chamfer_top, cut_top)
                if U(0, 1) > p:
                    continue
                nrm = unit(sx, sy, sz)
                h = abs(nrm.x) * hx + abs(nrm.y) * hy + abs(nrm.z) * hz
                planes.append((nrm, h * U(*rng_cut)))
    verts = polytope_verts(planes)
    # fraturas oblíquas profundas nas laterais (quebram as faces verticais longas)
    for _ in range(fracs):
        nrm = unit(U(-1, 1), U(-0.25, 0.35), U(-1, 1))
        planes.append((nrm, max(v.dot(nrm) for v in verts) * U(*frac_cut)))
    verts = polytope_verts(planes)
    # lascas planas extras em direções aleatórias (superfícies de fratura)
    for _ in range(chips):
        nrm = unit(U(-1, 1), U(-0.15, 0.85), U(-1, 1))
        planes.append((nrm, max(v.dot(nrm) for v in verts) * U(*chip_cut)))
    verts = polytope_verts(planes)
    return hull_prim(verts)


def boulder_block(rng, half, k=12, tight=(0.84, 0.99), top=(0.74, 0.88), tilt_top=0.18):
    """Matacão facetado: polítopo circunscrito a um elipsoide de meias-medidas `half` (k planos com normais espalhadas por
    Fibonacci + jitter, do topo até um pouco abaixo do equador, a `tight` do suporte do elipsoide), topo achatado e levemente
    inclinado. Facetas de tamanho variado e arestas obtusas, como as pedras médias e pequenas das referências."""
    hx, hy, hz = half
    U = rng.uniform
    golden = math.pi * (3.0 - math.sqrt(5.0))
    planes = []
    for i in range(k):
        yy = 0.95 - 1.20 * (i + 0.5) / k
        rr = math.sqrt(max(0.0, 1.0 - yy * yy))
        th = golden * i + U(-0.3, 0.3)
        n = Vector((math.cos(th) * rr, yy + U(-0.08, 0.08), math.sin(th) * rr)).normalized()
        h = math.sqrt((hx * n.x) ** 2 + (hy * n.y) ** 2 + (hz * n.z) ** 2)
        planes.append((n, h * U(*tight)))
    planes.append((Vector((U(-tilt_top, tilt_top), 1.0, U(-tilt_top, tilt_top))).normalized(), hy * U(*top)))
    planes.append((Vector((0.0, -1.0, 0.0)), hy))
    return hull_prim(polytope_verts(planes))


def place(prim, m):
    verts, faces = prim
    return [tuple(m @ Vector(v)) for v in verts], faces


def block_obj(name, verts, faces):
    """Objeto Blender (coordenadas do jogo convertidas) de um sólido fechado e com normais para fora."""
    bm = bmesh.new()
    bv = [bm.verts.new(g(*v)) for v in verts]
    for f in faces:
        try:
            bm.faces.new([bv[i] for i in f])
        except ValueError:
            pass
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    return o


def union_blocks(name, blocks, y_cut, mat):
    """União booleana (EXACT) dos blocos (listas (verts, faces) já posicionadas, coordenadas do jogo); corta tudo abaixo de
    y_cut (base enterrada e aberta), funde faces coplanares e devolve o objeto com o material `mat` (flat shading)."""
    objs = [block_obj(f'{name}_b{i}', v, f) for i, (v, f) in enumerate(blocks)]
    bpy.context.view_layer.update()
    base = objs[0]
    for other in objs[1:]:
        mod = base.modifiers.new('uni', 'BOOLEAN')
        mod.operation = 'UNION'
        mod.solver = 'EXACT'
        mod.object = other
        bpy.context.view_layer.update()
        dg = bpy.context.evaluated_depsgraph_get()
        new_me = bpy.data.meshes.new_from_object(base.evaluated_get(dg), depsgraph=dg)
        base.modifiers.remove(mod)
        old = base.data
        base.data = new_me
        bpy.data.meshes.remove(old)
        bpy.data.objects.remove(other, do_unlink=True)
    me = base.data
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=2e-4)
    bmesh.ops.dissolve_limit(bm, angle_limit=math.radians(2.5), use_dissolve_boundaries=False,
                             verts=bm.verts[:], edges=bm.edges[:], delimit=set())
    bmesh.ops.dissolve_degenerate(bm, dist=2e-4, edges=bm.edges[:])
    geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
    bmesh.ops.bisect_plane(bm, geom=geom, plane_co=(0.0, 0.0, y_cut), plane_no=(0.0, 0.0, 1.0), clear_inner=True)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    for f in bm.faces:
        f.smooth = False
        f.material_index = 0
    for e in bm.edges:
        e.smooth = False
    bm.to_mesh(me)
    bm.free()
    me.materials.clear()
    me.materials.append(mat)
    base.name = name
    me.name = name
    return base


def rock_blocks(seed, specs, bottom):
    """specs = [(cx, cz, topo, meia_x, meia_z, yaw, (tilt_x, tilt_z), tipo, extras)] -> blocos posicionados (tipo 'slab' =
    monólito de caixa chanfrada, 'boulder' = matacão facetado). A base de cada bloco fica em `bottom` (abaixo de y = 0,
    escalonada para não haver planos coplanares na união) e o topo em `topo`."""
    blocks = []
    for k, (cx, cz, top, hx, hz, yaw, tilt, kind, kw) in enumerate(specs):
        kw = dict(kw)
        rng = random.Random(kw.pop('seed', seed * 1000 + k))     # um sorteio por bloco: mexer num não muda os outros
        bot = kw.pop('bottom', bottom - 0.03 * k)
        hy = (top - bot) / 2.0
        cy = (top + bot) / 2.0
        make = facet_block if kind == 'slab' else boulder_block
        prim = make(rng, (hx, hy, hz), **kw)
        blocks.append(place(prim, M((cx, cy, cz), (tilt[0], yaw, tilt[1]))))
    return blocks


def build_rock_large(mats, root):
    """Maciço de ~3,8 m: três monólitos (laje alta à esquerda, pilar central, bloco largo à direita) com capitéis
    deslocados (beiral de pedra sobreposta), apoiados num bloco de trás e em dois matacões na frente, com cascalho no pé e
    lascas de fratura em cada monólito. Altura ~2,5."""
    slab = dict(chamfer=0.85, cut=(0.68, 0.90), chamfer_top=0.6, cut_top=(0.82, 0.95), chips=8, jitter=0.20, ridge=0.12,
                taper=0.12, chip_cut=(0.88, 0.97), fracs=2, frac_cut=(0.76, 0.90))
    specs = [
        (-0.55, -0.30, 2.05, 0.68, 0.80, 20, (0, 8), 'slab', slab),
        (0.25, 0.15, 1.75, 0.66, 0.66, -12, (-6, -7), 'slab', slab),
        (1.10, -0.35, 1.30, 0.64, 0.82, 10, (0, -6), 'slab', slab),
        (0.20, -1.00, 1.55, 0.82, 0.52, -4, (0, 0), 'slab', slab),
        (-1.05, 0.75, 1.05, 0.62, 0.52, 35, (3, 4), 'boulder', dict(k=15)),
        (0.85, 0.95, 0.85, 0.50, 0.46, -30, (0, -3), 'boulder', dict(k=14)),
        # capitéis: pedras achatadas pousadas sobre a laje alta e sobre o bloco largo, deslocadas (beiral)
        (-0.42, -0.38, 2.52, 0.60, 0.70, 35, (2, -6), 'boulder', dict(k=13, bottom=1.85, tight=(0.82, 0.98))),
        (1.22, -0.28, 1.66, 0.50, 0.62, -20, (0, 4), 'boulder', dict(k=12, bottom=1.18, tight=(0.82, 0.98))),
        # cascalho no pé
        (-1.55, 0.05, 0.50, 0.26, 0.24, 30, (0, 0), 'boulder', dict(k=10)),
        (1.65, 0.55, 0.42, 0.24, 0.22, -20, (0, 0), 'boulder', dict(k=10)),
        (-0.25, 1.35, 0.36, 0.22, 0.20, 50, (0, 0), 'boulder', dict(k=9)),
        (1.25, -1.10, 0.50, 0.26, 0.22, 10, (0, 0), 'boulder', dict(k=10)),
        (0.45, 1.50, 0.30, 0.18, 0.16, 15, (0, 0), 'boulder', dict(k=8)),
    ]
    return [union_blocks('Rock', rock_blocks(101, specs, -0.34), -0.30, mats['granite'])]


def build_rock_medium(mats, root):
    """Rocha de ~1,5 m: matacão principal baixo com um vizinho e duas lascas. Altura ~0,8."""
    specs = [
        (0.00, 0.00, 0.80, 0.62, 0.48, 20, (0, 3), 'boulder', dict(k=19, tight=(0.80, 0.97))),
        (0.52, 0.36, 0.44, 0.27, 0.25, -30, (0, 3), 'boulder', dict(k=13)),
        (-0.56, 0.34, 0.32, 0.20, 0.18, 35, (0, 0), 'boulder', dict(k=10)),
        (-0.26, -0.56, 0.34, 0.24, 0.20, 70, (0, 0), 'boulder', dict(k=10)),
    ]
    return [union_blocks('Rock', rock_blocks(202, specs, -0.20), -0.18, mats['granite'])]


def build_rock_small(mats, root):
    """Rocha de ~0,6 m: pedra principal e uma lasca encostada. Altura ~0,33."""
    specs = [
        (0.00, 0.00, 0.33, 0.24, 0.20, 25, (0, -2), 'boulder', dict(k=14, tight=(0.80, 0.97))),
        (0.25, 0.13, 0.16, 0.11, 0.09, -35, (0, 0), 'boulder', dict(k=9)),
    ]
    return [union_blocks('Rock', rock_blocks(303, specs, -0.10), -0.08, mats['granite'])]


# ---------------------------------------------------------------------------
# Cactos
# ---------------------------------------------------------------------------
def ribbed_loft(path, radii, ribs=10, valley=0.8, up=(0, 0, 1), dome=0.0, cap_start=False):
    """Tubo de nervuras: anéis de 2*ribs pontos (cristas pares, vales ímpares recuados por `valley`) ao longo de `path`;
    `dome` > 0 fecha a ponta com um polo deslocado `dome` ao longo da tangente final."""
    n = ribs * 2
    rings = limb_rings(path, radii, n, up=up)
    out = []
    for i, ring in enumerate(rings):
        c = Vector(path[i])
        out.append([tuple(c + (Vector(q) - c) * (valley if k % 2 else 1.0)) for k, q in enumerate(ring)])
    verts, faces = prim_rings(out, cap0=cap_start, cap1=False)
    if dome > 0:
        d = (Vector(path[-1]) - Vector(path[-2])).normalized()
        verts.append(tuple(Vector(path[-1]) + d * dome))
        pole = len(verts) - 1
        base = (len(out) - 1) * n
        for k in range(n):
            faces.append((base + k, base + (k + 1) % n, pole))
    return verts, faces


def arm_path(reach, lift, rise, elbow=0.34, arc_n=5, r0=0.17, r1=0.14):
    """Braço de cacto no plano local x-y (parte do eixo do tronco para +x): sai quase na horizontal, dobra num cotovelo de
    raio `elbow` e sobe `rise`. Devolve (pontos, raios)."""
    xa = reach - elbow
    pts = [(-0.10, 0.0, 0.0), (0.10, 0.0, 0.0), (xa * 0.5, lift * 0.45, 0.0), (xa, lift, 0.0)]
    for k in range(1, arc_n + 1):
        th = math.radians(90.0 * k / arc_n)
        pts.append((xa + elbow * math.sin(th), lift + elbow * (1.0 - math.cos(th)), 0.0))
    top = lift + elbow
    pts.append((reach, top + rise * 0.5, 0.0))
    pts.append((reach, top + rise, 0.0))
    nn = len(pts)
    radii = [r0 + (r1 - r0) * i / (nn - 1) for i in range(nn)]
    radii[0] = radii[1] = r0 * 0.95
    return pts, radii


def flower(mb, center, yaw=0.0, size=0.075, petals=6, tilt=38.0, mat_p='flower', mat_c='flower_c'):
    """Flor de cacto: coroa de pétalas afiladas inclinadas para fora + miolo amarelo."""
    L = size * 1.5
    for k in range(petals):
        a = yaw + 360.0 * k / petals
        mb.add(prim_box(size * 0.62, 0.012, L, taper=(0.35, 1.0)), mat_p,
               M(center, (0, a, 0)) @ M((0, 0, 0), (-tilt, 0, 0)) @ M((0, 0, L * 0.5 + size * 0.1)), smooth=0)
    mb.add(prim_sphere(size * 0.42, size * 0.30, size * 0.42, 6, 3), mat_c, M((center[0], center[1] + 0.012, center[2])), smooth=0)


def build_cactus_1(mats, root):
    """Cacto colunar (tipo candelabro) de ~3,2 m: tronco de 10 nervuras com leve curva em S e dois braços de alturas
    diferentes, abertos para lados opostos e girados em y para não ficarem num plano só; três flores no alto."""
    mb = MeshBuilder('Cactus')

    def axis(y):  # eixo do tronco (x, z)
        return 0.05 * math.sin(y * 1.7), 0.03 * math.cos(y * 1.3)

    ys = [-0.12, 0.12, 0.45, 1.0, 1.6, 2.2, 2.7, 2.96]
    rs = [0.345, 0.315, 0.295, 0.285, 0.28, 0.275, 0.26, 0.225]
    path = [(axis(y)[0], y, axis(y)[1]) for y in ys]
    mb.add(ribbed_loft(path, rs, ribs=10, valley=0.78, dome=0.19), 'cactus', smooth=0)
    tips = []
    # braços: (lado, y de saída, alcance, subida, yaw, raio)
    for (side, y0, reach, rise, yaw, r0) in ((-1, 1.05, 0.95, 0.95, 14.0, 0.20), (1, 1.55, 0.85, 0.78, -16.0, 0.19)):
        lift, elbow = 0.10, 0.36
        pts, radii = arm_path(reach, lift, rise, elbow=elbow, r0=r0, r1=r0 * 0.88)
        ax, az = axis(y0)
        m = M((ax, y0, az), (0, (0 if side > 0 else 180.0) + yaw, 0))
        mb.add(ribbed_loft(pts, radii, ribs=8, valley=0.78, dome=0.15), 'cactus', m, smooth=0)
        tips.append(m @ Vector((reach, lift + elbow + rise + 0.13, 0.0)))
    # flores: topo do tronco (duas) e topo do braço direito
    ax, az = axis(3.0)
    flower(mb, (ax + 0.02, 3.17, az), yaw=10.0, size=0.115)
    flower(mb, (ax - 0.12, 3.07, az + 0.09), yaw=40.0, size=0.08)
    flower(mb, tuple(tips[1]), yaw=20.0, size=0.09)
    return [mb.build(mats, parent=root)]


def build_cactus_2(mats, root):
    """Cacto colunar baixo de ~1,7 m: tronco largo de 12 nervuras (levemente abaulado) e um braço; uma flor no alto."""
    mb = MeshBuilder('Cactus')

    def axis(y):
        return 0.035 * math.sin(y * 2.3 + 0.8), 0.025 * math.cos(y * 1.9)

    ys = [-0.10, 0.10, 0.35, 0.75, 1.15, 1.42, 1.58]
    rs = [0.35, 0.345, 0.355, 0.355, 0.33, 0.265, 0.18]
    path = [(axis(y)[0], y, axis(y)[1]) for y in ys]
    mb.add(ribbed_loft(path, rs, ribs=12, valley=0.80, dome=0.14), 'cactus', smooth=0)
    reach, lift, elbow, rise, y0 = 0.74, 0.08, 0.30, 0.55, 0.62
    pts, radii = arm_path(reach, lift, rise, elbow=elbow, arc_n=4, r0=0.185, r1=0.16)
    ax, az = axis(y0)
    m = M((ax, y0, az), (0, -20.0, 0))
    mb.add(ribbed_loft(pts, radii, ribs=8, valley=0.80, dome=0.13), 'cactus', m, smooth=0)
    flower(mb, tuple(m @ Vector((reach, lift + elbow + rise + 0.12, 0.0))), yaw=30.0, size=0.085)
    return [mb.build(mats, parent=root)]


# ---------------------------------------------------------------------------
# Ossada
# ---------------------------------------------------------------------------
def ring_z(cz, rx, ry, cx=0.0, cy=0.0, n=6, phase=0.0):
    """Anel num plano perpendicular a z (loft ao longo de +z): crânio, focinho."""
    return [(cx + math.cos(phase + 2 * math.pi * i / n) * rx, cy + math.sin(phase + 2 * math.pi * i / n) * ry, cz) for i in range(n)]


def bone_tube(mb, pts, radii, mat='bone', n=5, up=(0, 0, 1), cap0=True, cap1=True):
    mb.add(prim_rings(limb_rings(pts, radii, n, up=up), cap0=cap0, cap1=cap1), mat, smooth=0)


def spine_y(z):
    """Altura da linha da coluna ao longo de z (cauda baixa, cernelha alta, pescoço descendo até o crânio no chão)."""
    cp = [(-0.95, 0.12), (-0.70, 0.34), (-0.42, 0.74), (-0.05, 0.88), (0.30, 0.90), (0.62, 0.72), (0.88, 0.40), (1.05, 0.14)]
    if z <= cp[0][0]:
        return cp[0][1]
    for (z0, y0), (z1, y1) in zip(cp, cp[1:]):
        if z <= z1:
            t = (z - z0) / (z1 - z0)
            t = t * t * (3 - 2 * t)
            return y0 + (y1 - y0) * t
    return cp[-1][1]


def build_skull(mb, T):
    """Crânio de fera de chifres (bovídeo): calota, testa, focinho afilado, órbitas e narinas escuras, dentes e dois
    chifres curvos. Frente = +z local; T = matriz do jogo (inclui a escala)."""
    # calota craniana e testa
    mb.add(prim_sphere(0.17, 0.14, 0.19, 8, 4), 'bone', T @ M((0, 0.15, 0.0)), smooth=0)
    mb.add(prim_box(0.30, 0.09, 0.20, taper=(0.8, 0.7)), 'bone', T @ M((0, 0.23, 0.12), (-6, 0, 0)), smooth=0)
    # focinho: loft de anéis elípticos (afunila para a frente)
    rings = [ring_z(0.08, 0.125, 0.105, 0.0, 0.14), ring_z(0.28, 0.098, 0.082, 0.0, 0.115),
             ring_z(0.46, 0.075, 0.064, 0.0, 0.095), ring_z(0.56, 0.072, 0.060, 0.0, 0.088)]
    mb.add(prim_rings([[tuple(T @ Vector(q)) for q in ring] for ring in rings], cap0=False, cap1=True), 'bone', smooth=0)
    for sx in (-1, 1):
        # arcada de dentes sob o focinho
        for k in range(4):
            mb.add(prim_box(0.028, 0.045, 0.034, taper=(0.7, 0.7)), 'bone',
                   T @ M((sx * 0.062, 0.048, 0.20 + 0.09 * k)), smooth=0)
        # narina e órbita: esferas escuras meio enterradas
        mb.add(prim_sphere(0.026, 0.024, 0.02, 5, 3), 'dark', T @ M((sx * 0.032, 0.095, 0.555)), smooth=0)
        mb.add(prim_sphere(0.052, 0.05, 0.045, 6, 3), 'dark', T @ M((sx * 0.138, 0.205, 0.095)), smooth=0)
        # chifre curvo para fora, para cima e para a frente
        hp = [(sx * 0.13, 0.27, -0.01), (sx * 0.28, 0.31, -0.03), (sx * 0.44, 0.40, 0.02), (sx * 0.52, 0.55, 0.12),
              (sx * 0.50, 0.70, 0.26)]
        hr = [0.055, 0.046, 0.036, 0.024, 0.007]
        mb.add(prim_rings([[tuple(T @ Vector(q)) for q in ring] for ring in limb_rings(hp, hr, 5, up=(0, 0, 1))],
                          cap0=True, cap1=True), 'bone', smooth=0)


def build_jaw(mb, T):
    """Mandíbula solta: dois ramos robustos em V com dentes curtos, caída no chão ao lado do crânio. Frente = +z local."""
    for sx in (-1, 1):
        jp = [(sx * 0.10, 0.06, -0.04), (sx * 0.095, 0.045, 0.12), (sx * 0.07, 0.04, 0.29), (sx * 0.025, 0.04, 0.44)]
        jr = [(0.045, 0.028), (0.036, 0.024), (0.03, 0.022), (0.028, 0.02)]
        mb.add(prim_rings([[tuple(T @ Vector(q)) for q in ring] for ring in limb_rings(jp, jr, 5, up=(0, 1, 0))],
                          cap0=True, cap1=True), 'bone', smooth=0)
        for k in range(3):
            mb.add(prim_box(0.022, 0.03, 0.03, taper=(0.75, 0.75)), 'bone',
                   T @ M((sx * (0.085 - 0.022 * k), 0.082, 0.13 + 0.1 * k)), smooth=0)
    mb.add(prim_box(0.12, 0.06, 0.06, taper=(0.8, 0.8)), 'bone', T @ M((0, 0.045, 0.45)), smooth=0)


def build_bones(mats, root):
    """Ossada de fera: caixa torácica de costelas em arcos (algumas quebradas e caídas para fora), coluna de vértebras que
    desce até o crânio de chifres no chão, mandíbula solta, ossos longos e vértebras espalhados. Crânio e focinho para +z.
    ~2,6 m de comprimento, ~0,95 m de altura, ~2,4 m de largura (com os chifres e ossos soltos)."""
    mb = MeshBuilder('Bones')
    rng = random.Random(11)
    # costelas: pares de arcos de elipse (4 trechos, seção retangular achatada), maiores no meio da caixa torácica
    zs = [-0.50 + 0.17 * i for i in range(6)]
    scale = [0.70, 0.92, 1.0, 0.98, 0.88, 0.70]
    broken = {('L', 2): 0.62, ('R', 4): 0.50}                # (lado, índice) -> fração do arco que sobrou
    for i, z in enumerate(zs):
        ys = spine_y(z)
        for side, sx in (('L', -1), ('R', 1)):
            frac = broken.get((side, i), 1.0)
            width = 0.50 * scale[i] * rng.uniform(0.94, 1.06)
            lean = math.radians(rng.uniform(-3.0, 11.0))     # costela tombando para fora
            ca, sa = math.cos(lean), math.sin(lean)
            phi_max = 1.45 * frac
            steps = 4
            pts, radii = [], []
            for k in range(steps + 1):
                phi = phi_max * k / steps
                px = 0.02 + (width - 0.02) * math.sin(phi)
                dy = (ys - 0.03) * (math.cos(phi) - 1.0)     # desce a partir da coluna
                x2, y2 = px * ca - dy * sa, ys + px * sa + dy * ca
                zz = z + 0.05 * math.sin(phi * 1.3) * (1 if side == 'L' else -1)
                pts.append((sx * x2, max(y2, 0.02), zz))
                t = k / steps
                radii.append((0.044 - 0.016 * t, 0.078 - 0.028 * t))
            bone_tube(mb, pts, radii, 'bone', 4, up=(0, 0, 1))
    # costela caída no chão (lado direito)
    rp = [(0.58, 0.04, -0.12), (0.80, 0.035, 0.02), (0.94, 0.035, 0.24), (0.90, 0.03, 0.46), (0.76, 0.03, 0.62)]
    bone_tube(mb, rp, [(0.024, 0.045), (0.024, 0.045), (0.022, 0.04), (0.018, 0.034), (0.012, 0.024)], 'bone', 4, up=(0, 1, 0))
    # coluna: vértebras (corpo pentagonal + processo espinhoso) seguindo a curva em passos de comprimento de arco,
    # afinando para a cauda
    z = -0.95
    while z <= 1.02:
        y = spine_y(z)
        dz = 0.04
        slope = (spine_y(z + dz) - spine_y(z - dz)) / (2 * dz)
        ang = math.degrees(math.atan(slope))
        s = 1.0 if z > -0.55 else 0.62 + 0.38 * max(0.0, (z + 0.95) / 0.4)
        T = M((0, y, z), (-ang, 0, 0))
        mb.add(prim_cyl(0.070 * s, 0.074 * s, 0.15, 5, base=False), 'bone', T @ M((0, 0, 0), (90, 0, 0)), smooth=0)
        mb.add(prim_cone(0.045 * s, (0.15 if -0.6 < z < 0.8 else 0.07) * s, 4), 'bone', T @ M((0, 0.04, 0)), smooth=0)
        z += 0.118 / math.sqrt(1.0 + slope * slope)
    # crânio no chão (focinho para +z, levemente girado e com o nariz mais baixo) e mandíbula solta ao lado
    build_skull(mb, M((0.04, 0.02, 1.0), (6, 14, -2), 1.25))
    build_jaw(mb, M((0.62, 0.0, 1.30), (-2, -30, 0), 1.2))
    # ossos longos (haste + duas cabeças) e vértebras soltas
    for (pos, yaw, ln, r) in (((0.98, 0.05, -0.50), 28.0, 0.62, 0.034), ((-0.92, 0.045, 0.42), -64.0, 0.52, 0.030)):
        T = M(pos, (0, yaw, 0))
        mb.add(prim_cyl(r, r * 0.92, ln, 7, base=False), 'bone', T @ M((0, 0, 0), (90, 0, 0)), smooth=0)
        for sg in (-1, 1):
            mb.add(prim_sphere(r * 1.9, r * 1.6, r * 1.8, 6, 3), 'bone', T @ M((sg * 0.012, 0.0, sg * ln / 2)), smooth=0)
    for (pos, yaw) in (((0.45, 0.03, -0.95), 20.0), ((-0.55, 0.03, -0.80), -40.0), ((0.35, 0.03, 0.80), 70.0)):
        mb.add(prim_cyl(0.045, 0.047, 0.085, 5, base=False), 'bone', M(pos, (74, yaw, 0)), smooth=0)
        mb.add(prim_cone(0.028, 0.08, 4), 'bone', M((pos[0], pos[1] + 0.05, pos[2]), (0, yaw, 0)), smooth=0)
    return [mb.build(mats, parent=root)]


# ---------------------------------------------------------------------------
# Especificações dos modelos
# ---------------------------------------------------------------------------
def mats_granite(seed, **kw):
    return {'granite': granite_paint('P_granite', seed=seed, **kw)}


def mats_cactus(seed):
    return {
        'cactus': cactus_paint('P_cactus', seed=seed),
        'flower': flat_paint('P_flower', '#f1ead8', '#e4d9bf', top=0.35, edge='#ffffff', edge_amt=0.3, ao=(0.1, 0.4)),
        'flower_c': flat_paint('P_flower_c', '#e9b52c', '#c98f18', top=0.3),
    }


def mats_bones():
    return {
        'bone': bone_paint('P_bone', seed=2.0),
        'dark': flat_paint('P_dark', '#2a221a', '#1a140f', fine=0.1, top=0.1),
    }


SPECS = {
    'rock_granite_large': dict(root='RockGraniteLarge', atlas=512, build=build_rock_large,
                               mats=lambda: mats_granite(1.7, k=1.0, grain=13.0, crack_scale=0.95, strata_amt=0.9),
                               margin=0.007, angle=66.0, rough=0.92),
    'rock_granite_medium': dict(root='RockGraniteMedium', atlas=512, build=build_rock_medium,
                                mats=lambda: mats_granite(3.1, k=1.9, grain=24.0, crack_scale=1.8, strata_scale=7.0, edge_r=0.022,
                                                          ao=(0.45, 0.72), dust_h=0.3),
                                margin=0.007, angle=66.0, rough=0.92),
    'rock_granite_small': dict(root='RockGraniteSmall', atlas=256, build=build_rock_small,
                               mats=lambda: mats_granite(5.3, k=3.6, grain=52.0, crack_scale=3.6, strata_scale=14.0, edge_r=0.012,
                                                         ao=(0.2, 0.7), dust_h=0.12, crack_amt=0.25),
                               margin=0.010, angle=66.0, rough=0.92),
    'cactus_1': dict(root='Cactus1', atlas=512, build=build_cactus_1, mats=lambda: mats_cactus(0.6),
                     margin=0.008, angle=66.0, rough=0.85),
    'cactus_2': dict(root='Cactus2', atlas=512, build=build_cactus_2, mats=lambda: mats_cactus(2.4),
                     margin=0.008, angle=66.0, rough=0.85),
    'bones': dict(root='Bones', atlas=512, build=build_bones, mats=mats_bones,
                  margin=0.008, angle=66.0, rough=0.9),
}
ORDER = ['rock_granite_large', 'rock_granite_medium', 'rock_granite_small', 'cactus_1', 'cactus_2', 'bones']


# ---------------------------------------------------------------------------
# Render (pré-visualizações e rascunhos)
# ---------------------------------------------------------------------------
def configure_render(res=512, samples=64):
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_EEVEE'
    ev = sc.eevee
    ev.taa_render_samples = samples
    ev.use_shadows = True
    try:
        ev.use_raytracing = False
        ev.use_fast_gi = True
        ev.fast_gi_method = 'AMBIENT_OCCLUSION_ONLY'
        ev.fast_gi_distance = 0.6
        ev.shadow_ray_count = 2
        ev.shadow_step_count = 8
    except Exception as exc:
        log('aviso eevee:', exc)
    r = sc.render
    r.film_transparent = True
    r.resolution_x = r.resolution_y = res
    r.resolution_percentage = 100
    r.filter_size = 1.3
    r.image_settings.file_format = 'PNG'
    r.image_settings.color_mode = 'RGBA'
    r.image_settings.color_depth = '8'
    r.image_settings.compression = 15
    r.dither_intensity = 0.0
    sc.view_settings.view_transform = 'Standard'
    sc.view_settings.look = 'None'
    sc.display_settings.display_device = 'sRGB'


def add_shadow_ground(size=40.0):
    me = bpy.data.meshes.new('ShadowGround')
    bm = bmesh.new()
    vs = [bm.verts.new((x, y, 0.0)) for (x, y) in ((-size, -size), (size, -size), (size, size), (-size, size))]
    bm.faces.new(vs)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new('ShadowGround', me)
    bpy.context.scene.collection.objects.link(o)
    try:
        o.is_shadow_catcher = True
    except Exception as exc:
        log('sem shadow catcher:', exc)
    return o


def clip_below_ground():
    """Nas prévias, esconde a parte enterrada (y < 0 do jogo = z < 0 do Blender): mistura o shader com Transparent onde a
    posição de mundo está abaixo do chão e liga o backface culling (senão o interior oco apareceria pelo corte)."""
    for mat in bpy.data.materials:
        if not mat.use_nodes or not mat.node_tree or mat.get('clip_ground'):
            continue
        nt = mat.node_tree
        outs = [n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL' and n.inputs['Surface'].links]
        if not outs:
            continue
        out = outs[0]
        surf = out.inputs['Surface'].links[0].from_socket
        geo = nt.nodes.new('ShaderNodeNewGeometry')
        sep = nt.nodes.new('ShaderNodeSeparateXYZ')
        nt.links.new(geo.outputs['Position'], sep.inputs[0])
        lt = nt.nodes.new('ShaderNodeMath')
        lt.operation = 'LESS_THAN'
        nt.links.new(sep.outputs['Z'], lt.inputs[0])
        lt.inputs[1].default_value = -0.001
        tr = nt.nodes.new('ShaderNodeBsdfTransparent')
        mix = nt.nodes.new('ShaderNodeMixShader')
        nt.links.new(lt.outputs[0], mix.inputs[0])
        nt.links.new(surf, mix.inputs[1])
        nt.links.new(tr.outputs[0], mix.inputs[2])
        nt.links.new(mix.outputs[0], out.inputs['Surface'])
        mat.use_backface_culling = True
        mat['clip_ground'] = True


def load_rgba(path):
    """PNG -> array float32 (H, W, 4), valores crus (sRGB, alfa direto), origem embaixo."""
    img = bpy.data.images.load(path, check_existing=False)
    w, h = img.size
    arr = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(arr)
    bpy.data.images.remove(img)
    return arr.reshape(h, w, 4)


def save_rgba(arr, path):
    h, w = arr.shape[:2]
    oi = bpy.data.images.new('out_rgba', w, h, alpha=True)
    oi.alpha_mode = 'STRAIGHT'
    oi.pixels.foreach_set(np.ascontiguousarray(arr, dtype=np.float32).ravel())
    oi.filepath_raw = path
    oi.file_format = 'PNG'
    oi.save()
    bpy.data.images.remove(oi)


def shadow_pass(mesh_objs, lights, world, out_path, strength=0.5):
    """Sombra de contato suave sob o modelo, para a prévia transparente não parecer flutuar: segundo render com chão branco,
    modelo invisível para a câmera (continua projetando sombra) e só a luz principal acesa; a sombra (1 - luminância/luz plena)
    vira alfa preto composto POR BAIXO do render do modelo (já salvo em out_path)."""
    obj_layer = load_rgba(out_path)
    ground = add_shadow_ground(60.0)
    gm = bpy.data.materials.new('ShadowGroundMat')
    gm.use_nodes = True
    bsdf = gm.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (1.0, 1.0, 1.0, 1.0)
    bsdf.inputs['Roughness'].default_value = 1.0
    try:
        bsdf.inputs['Specular IOR Level'].default_value = 0.0
    except KeyError:
        pass
    ground.data.materials.append(gm)
    ground.is_shadow_catcher = False
    for o in mesh_objs:
        o.visible_camera = False
    for k, lt in lights.items():
        if k != 'key':
            lt.hide_render = True
    for n in world.node_tree.nodes:
        if n.type == 'BACKGROUND':
            n.inputs['Strength'].default_value = 0.0
    tmp = os.path.join(C.BUILD_DIR, 'art_p0_shadow.png')
    bpy.context.scene.render.filepath = tmp
    bpy.ops.render.render(write_still=True)
    sh = load_rgba(tmp)
    lum = sh[..., 0] * 0.2126 + sh[..., 1] * 0.7152 + sh[..., 2] * 0.0722
    lit = float(np.percentile(lum, 97))
    dark = np.clip(1.0 - lum / max(lit, 1e-4), 0.0, 1.0)
    dark = np.clip((dark - 0.04) / 0.96, 0.0, 1.0) * strength
    ao, ro = obj_layer[..., 3], obj_layer[..., :3]
    out_a = ao + (1.0 - ao) * dark
    out_rgb = np.where(out_a[..., None] > 1e-5, ro * ao[..., None] / np.maximum(out_a[..., None], 1e-5), 0.0)
    save_rgba(np.concatenate([np.clip(out_rgb, 0, 1), out_a[..., None]], axis=-1), out_path)
    for o in mesh_objs:
        o.visible_camera = True


def preview_rig(mesh_objs, out_path, res=512, az=CAM_AZ, el=CAM_EL, fov=CAM_FOV, margin=0.07, samples=64, ground=False, shadow=False):
    """Luz de 3 pontos + mundo + câmera enquadrando `mesh_objs` e render PNG RGBA (fundo transparente) em out_path."""
    import ui_common as U
    for o in list(bpy.data.objects):
        if o.type in ('LIGHT', 'CAMERA'):
            bpy.data.objects.remove(o, do_unlink=True)
    configure_render(res, samples)
    world = U.make_world()
    lights = {
        # como no jogo (SceneManager): sol quente atrás-à-esquerda (sombras caem para a direita-frente) e preenchimento
        # frio à direita-frente; o ambiente do mundo faz o papel da luz hemisférica
        'key': U._sun('Key', 3.4, (1.0, 0.98, 0.93), (-52.0, 68.0, -22.0), 4.0),
        'fill': U._sun('Fill', 1.2, (0.56, 0.70, 0.83), (40.0, 30.0, 45.0), 12.0),
    }
    lights['fill'].data.use_shadow = False
    cam = U.make_camera(fov)
    if ground:
        add_shadow_ground()
    clip_below_ground()
    pts = U.world_points(mesh_objs)
    pts[:, 2] = np.maximum(pts[:, 2], 0.0)          # enquadra só o que fica acima do chão
    U.fit_camera(cam, pts, U.dir_from_angles(az, el), fov=fov, margin=margin)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    bpy.context.scene.render.filepath = out_path
    bpy.ops.render.render(write_still=True)
    if shadow:
        shadow_pass(mesh_objs, lights, world, out_path)
    return out_path


def render_final_preview(key):
    """Importa o .glb exportado (verifica o arquivo de verdade) e renderiza public/… -> tools/ui-captures/art-p0/<key>.png."""
    import ui_common as U
    glb = os.path.join(C.OUT_MODELS, key + '.glb')
    C.reset_scene()
    root, objs = U.import_glb(key)
    U.polish_materials(rough=SPECS[key]['rough'], spec=0.2)
    meshes = [o for o in objs if o.type == 'MESH']
    out = os.path.join(PREVIEW_DIR, key + '.png')
    preview_rig(meshes, out, samples=96, shadow='--no-shadow' not in C.script_args())
    log('preview', os.path.relpath(out, C.REPO), f'({os.path.getsize(out) // 1024} KB)')
    return out


# ---------------------------------------------------------------------------
# Pipeline por modelo
# ---------------------------------------------------------------------------
def measure(root):
    lo, hi = bbox_game(root)
    return {'min': lo, 'max': hi, 'size': tuple(round(hi[i] - lo[i], 2) for i in range(3))}


def compose_row(paths, out):
    """Junta PNGs RGBA lado a lado (numpy) num só arquivo."""
    arrs = []
    for p in paths:
        img = bpy.data.images.load(p, check_existing=False)
        w, h = img.size
        a = np.empty(w * h * 4, dtype=np.float32)
        img.pixels.foreach_get(a)
        arrs.append(a.reshape(h, w, 4))
        bpy.data.images.remove(img)
    row = np.concatenate(arrs, axis=1)
    h, w = row.shape[:2]
    oi = bpy.data.images.new('row', w, h, alpha=True)
    oi.pixels.foreach_set(np.ascontiguousarray(row).ravel())
    oi.filepath_raw = out
    oi.file_format = 'PNG'
    oi.save()
    bpy.data.images.remove(oi)


def draft(key, parts, root):
    """Rascunho sem bake: pintura (Emission) num ângulo e clay iluminado em três azimutes (um só PNG) em DRAFT_DIR."""
    os.makedirs(DRAFT_DIR, exist_ok=True)
    meshes = [o for o in parts if o.type == 'MESH']
    n_tris = 0
    for o in meshes:
        o.data.calc_loop_triangles()
        n_tris += len(o.data.loop_triangles)
    log(key, 'tris', n_tris, 'bbox', measure(root))
    preview_rig(meshes, os.path.join(DRAFT_DIR, key + '_paint.png'))
    clay = bpy.data.materials.new('Clay')
    clay.use_nodes = True
    clay.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = hex_lin('#b9b4ab')
    clay.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.9
    for o in meshes:
        o.data.materials.clear()
        o.data.materials.append(clay)
        for p in o.data.polygons:
            p.material_index = 0
    paths = []
    for az in (35.0, 155.0, 275.0):
        p = os.path.join(DRAFT_DIR, f'{key}_clay_{int(az)}.png')
        preview_rig(meshes, p, az=az, res=420)
        paths.append(p)
    compose_row(paths, os.path.join(DRAFT_DIR, key + '_clay.png'))


def build_one(key, args):
    spec = SPECS[key]
    C.reset_scene()
    mats = spec['mats']()
    root = C.make_empty(spec['root'])
    parts = spec['build'](mats, root)
    for o in parts:
        if o.parent is None:
            o.parent = root
    bpy.context.view_layer.update()
    if '--draft' in args:
        draft(key, parts, root)
        return None
    atlas_px = int(os.environ.get('ATLAS_PX', spec['atlas']))
    C.uv_atlas(parts, margin=spec['margin'], angle=spec['angle'])
    img = C.bake_atlas(parts, key + '_atlas', atlas_px, samples=int(os.environ.get('BAKE_SAMPLES', 32)), margin=4)
    C.finalize_materials(parts, img, roughness=spec['rough'], out_png=os.path.join(C.BUILD_DIR, key + '_atlas.png'))
    static = C.join_objects(list(parts), 'Static_Mesh')
    static.parent = root
    bpy.context.view_layer.update()
    out = os.path.join(C.OUT_MODELS, key + '.glb')
    C.export_glb(root, out, quality=80)
    st = C.stats(root, out)
    st['atlas_px'] = atlas_px
    st['bbox'] = measure(root)
    draws, tris = BUDGET[key]
    ok = st['draw_calls'] <= draws and st['tris'] <= tris
    log('STATS', key, st, 'OK' if ok else 'FORA DO ORCAMENTO')
    if not ok:
        raise SystemExit(f'{key}: fora do orçamento ({st["draw_calls"]} draw calls, {st["tris"]} tris)')
    os.makedirs(C.BUILD_DIR, exist_ok=True)
    db = {}
    if os.path.exists(STATS_JSON):
        try:
            with open(STATS_JSON, 'r', encoding='utf-8') as f:
                db = json.load(f)
        except Exception:
            db = {}
    db[key] = st
    with open(STATS_JSON, 'w', encoding='utf-8') as f:
        json.dump(db, f, indent=1, ensure_ascii=False)
    return st


def main():
    args = C.script_args()
    names = [a for a in args if a in SPECS]
    if not names or 'all' in args:
        names = list(ORDER)
    for key in names:
        build_one(key, args)
        if '--draft' not in args and '--no-render' not in args:
            render_final_preview(key)


if __name__ == '__main__':
    main()
