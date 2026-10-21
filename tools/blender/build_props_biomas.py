"""
build_props_biomas.py — props de bioma leves (ART-01 arenito, ART-06 vulcânico, ART-07 gelo, ART-10 sub-bosque/pântano de
docs/specs/MUNDO-TERRENO-MAPAS.md §6; fichas M2-12, M2-14, M2-15 e M2-17 de docs/PLANO_FINAL_TAREFAS.md).

Reaproveita o pipeline de build_props_rochas_cactos.py (união booleana de blocos facetados, pintura procedural assada num atlas
único, exportação meshopt+WebP, prévia em tools/ui-captures/art-p0/<nome>.png). Orçamento por prop: 1 draw call, <= 600 tris,
atlas <= 512². Coordenadas do jogo (x direita, y cima, +z frente), 1 u = 1 m, origem na base (y = 0 = chão).

Uso (sempre via tools/safe-run.sh; um Blender por vez):
  bash tools/safe-run.sh --timeout 600 -- /home/rafael/Downloads/blender-5.2.1-linux-x64/blender -b --factory-startup \
      --python tools/blender/build_props_biomas.py -- [<nome>...|arenito|vulcanico|gelo|subosque|all] [--no-render] [--draft]

Saída (public/models/), cada raiz = empty com UM nó `Static_Mesh` de UM material `Atlas` (o jogo extrai geometria+material para
`InstancedMesh`, como nas árvores):
  M2-12  rock_sandstone_a.glb RockSandstoneA   mesa de arenito em estratos (4 camadas e capa que sobra), ~2,2 m
         rock_sandstone_b.glb RockSandstoneB   pedra baixa de arenito em 3 camadas com um bloco caído, ~1,2 m
  M2-14  rock_basalt_a.glb    RockBasaltA      cluster de colunas hexagonais de basalto (tops inclinados)
         rock_basalt_b.glb    RockBasaltB      colunas baixas, uma tombada
         volcano_cone.glb     VolcanoCone      cone pequeno com cratera e brasa laranja
         tree_burnt.glb       TreeBurnt        árvore queimada: tronco carbonizado sem folhas, brasas na base
         fumarole.glb         Fumarole         respiradouro: monte com crosta de enxofre e boca escura (o vapor é da M2-18)
         obsidian.glb         Obsidian         cristais de obsidiana, quase pretos, com brilho nas arestas
  M2-15  ice_block_small.glb  IceBlockSmall    bloco de gelo
         ice_block_large.glb  IceBlockLarge    iceberg
         tree_pine_snow.glb   TreePineSnow     pinheiro nevado
         rock_snow.glb        RockSnow         rocha com capa de neve
  M2-17  fern.glb             Fern             samambaia
         log_fallen.glb       LogFallen        tronco caído
         log_drowned.glb      LogDrowned       tronco afogado (metade na água/lama)
         mangrove_root.glb    MangroveRoot     raiz de mangue em arcos
"""
import os
import sys
import math
import random

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
from mathutils import Vector, Matrix  # noqa: E402
import common as C  # noqa: E402
from common import (MeshBuilder, M, prim_box, prim_rings, ring_h, prim_cyl, prim_cone,  # noqa: E402
                    prim_sphere, limb_rings, g, hex_lin)
import build_props_rochas_cactos as P  # noqa: E402
from build_props_rochas_cactos import (new_paint, end_paint, smoothstep, lerp_to, bright, edge_wear,  # noqa: E402
                                       ambient_occlusion, stretch, flat_paint, union_blocks, rock_blocks)

log = P.log


# ---------------------------------------------------------------------------
# Pintura genérica de rocha estratificada / lisa (só existe para o bake)
# ---------------------------------------------------------------------------
def strata_paint(name, seed=0.0, cols=('#9a5a30', '#c58c55', '#e6c58a'), band_scale=9.0, band_dist=0.35, band_amt=1.0,
                 blot_scale=1.2, blot_amt=0.5, top='#efdcae', top_amt=0.6, side='#6a5c60', side_amt=0.14,
                 dust='#b89a68', dust_h=0.3, dust_amt=0.45, grain=22.0, grain_amt=0.12, crack_amt=0.2, crack_col='#5a4026',
                 edge='#f2e4bd', edge_amt=0.4, edge_r=0.03, ao=(0.5, 0.6), facet_amt=0.12, vertical=False, top_lo=0.45, top_hi=0.95):
    """Rocha sedimentar/ígnea em faixas: três tons (`cols`: escuro, médio, claro) distribuídos por faixas de altura do mundo
    (`band_scale` faixas por unidade, distorcidas por ruído), ou faixas verticais (`vertical=True`, colunas de basalto), manchas
    largas, grão, trincas, topo claro (`top`), lados frios (`side`), poeira no pé, desgaste de borda e oclusão ambiente."""
    mat, nt, nb = new_paint(name)
    geo = nb.node('ShaderNodeNewGeometry')
    wpos = geo.outputs['Position']
    pos = nb.vmath('ADD', wpos, (seed * 3.1, seed * 1.7, seed * 2.3))
    px, py, pz = nb.sep(pos)
    _, _, gz = nb.sep(wpos)
    _, _, nz = nb.sep(geo.outputs['Normal'])

    # faixas: ruído esticado no eixo vertical (ou horizontal nas colunas) -> 0..1 -> escuro/médio/claro
    ax = nb.math('MULTIPLY', pz, band_scale)
    if vertical:
        sv = nb.comb(nb.math('MULTIPLY', px, band_scale), nb.math('MULTIPLY', py, band_scale), nb.math('MULTIPLY', pz, 0.35))
    else:
        sv = nb.comb(nb.math('MULTIPLY', px, 0.5), nb.math('MULTIPLY', py, 0.5), ax)
    band = nb.bw(nb.ramp(nb.noise(sv, scale=1.0, detail=1.5, rough=0.5, distortion=band_dist), [(0.30, 0.0), (0.70, 1.0)]))
    band = nb.math('MULTIPLY', band, band_amt)
    col = nb.mix(nb.math('MULTIPLY', band, 2.0, clamp=True), nb.rgb(cols[0]), nb.rgb(cols[1]))
    col = nb.mix(nb.math('SUBTRACT', nb.math('MULTIPLY', band, 2.0), 1.0, clamp=True), col, nb.rgb(cols[2]))
    # manchas largas
    blot = nb.bw(nb.ramp(nb.noise(pos, scale=blot_scale, detail=3.0, rough=0.6, distortion=0.35), [(0.36, 0.0), (0.64, 1.0)]))
    col = bright(nb, col, nb.math('ADD', 1.0 - blot_amt * 0.12, nb.math('MULTIPLY', blot, blot_amt * 0.24)))
    # grão
    gr = stretch(nb, nb.noise(pos, scale=grain, detail=2.0, rough=0.55))
    col = bright(nb, col, nb.math('ADD', 1.0 - grain_amt / 2, nb.math('MULTIPLY', gr, grain_amt)))
    # trincas finas
    if crack_amt > 0:
        cn = nb.math('ABSOLUTE', nb.math('SUBTRACT', nb.noise(pos, scale=2.2, detail=3.0, rough=0.55, distortion=0.4), 0.5))
        cr = nb.bw(nb.ramp(cn, [(0.0, 1.0), (0.011, 0.0)]))
        col = nb.mix(nb.math('MULTIPLY', cr, crack_amt), col, nb.rgb(crack_col))
    # tom por faceta (cada face plana ganha o seu próprio tom)
    nrm_s = nb.vmath('ADD', nb.scale(geo.outputs['Normal'], 2.6), (seed, seed * 0.6, seed * 0.3))
    fn = stretch(nb, nb.noise(nrm_s, scale=1.0, detail=0.0, rough=0.5))
    col = bright(nb, col, nb.math('ADD', 1.0 - facet_amt / 2, nb.math('MULTIPLY', fn, facet_amt)))
    # luz de topo pintada, lados frios, poeira no pé
    col = bright(nb, col, nb.math('ADD', 0.88, nb.math('MULTIPLY', nz, 0.22)))
    col = lerp_to(nb, col, smoothstep(nb, nz, top_lo, top_hi), top, top_amt)
    col = lerp_to(nb, col, smoothstep(nb, nz, 0.5, -0.15), side, side_amt)
    col = lerp_to(nb, col, smoothstep(nb, gz, dust_h, 0.0), dust, dust_amt)
    col = edge_wear(nb, geo, col, edge_r, edge_amt, edge)
    col, _ = ambient_occlusion(nb, col, ao[0], ao[1], 1.2)
    return end_paint(mat, nt, nb, col)


# ===========================================================================
# M2-12 · arenito
# ===========================================================================
def mats_sandstone(seed, **kw):
    return {'rock': strata_paint('P_sand', seed=seed, **kw)}


SLAB = dict(chamfer=0.9, cut=(0.74, 0.90), chamfer_top=0.6, cut_top=(0.86, 0.95), chips=3, jitter=0.10, ridge=0.04,
            taper=0.10, chip_cut=(0.86, 0.96))


def build_sandstone_a(mats, root):
    """Mesa de ~2,3 x 1,9 m e 1,7 m de altura: quatro camadas empilhadas, cada uma deslocada e de largura diferente (degraus
    de erosão), a de cima mais larga que a de baixo (capa que sobra); dois matacões no pé."""
    s = dict(SLAB)
    specs = [
        (0.00, 0.00, 0.62, 1.05, 0.88, 6, (0, 0), 'slab', dict(s, bottom=-0.30)),
        (0.12, -0.06, 1.10, 0.84, 0.70, -10, (0, 2), 'slab', dict(s, bottom=0.40)),
        (-0.10, 0.08, 1.48, 0.72, 0.62, 14, (1, 0), 'slab', dict(s, bottom=0.92)),
        (0.04, 0.00, 1.74, 0.86, 0.70, -4, (0, -1), 'slab', dict(s, bottom=1.34, chamfer=0.9, cut=(0.74, 0.88))),
        (1.12, 0.62, 0.34, 0.30, 0.26, 40, (0, 0), 'boulder', dict(k=9)),
        (-0.90, 0.78, 0.26, 0.24, 0.20, -20, (0, 0), 'boulder', dict(k=8)),
    ]
    return [union_blocks('Rock', rock_blocks(401, specs, -0.30), -0.28, mats['rock'])]


def build_sandstone_b(mats, root):
    """Pedra baixa de ~1,3 m e 0,85 m de altura: três camadas e um bloco quebrado caído ao lado."""
    s = dict(SLAB, chips=2)
    specs = [
        (0.00, 0.00, 0.34, 0.62, 0.52, 18, (0, 0), 'slab', dict(s, bottom=-0.20)),
        (-0.04, 0.02, 0.62, 0.50, 0.42, -12, (0, 2), 'slab', dict(s, bottom=0.26)),
        (0.02, 0.00, 0.86, 0.58, 0.46, 8, (2, 0), 'slab', dict(s, bottom=0.54, chamfer=0.9)),
        (0.78, 0.30, 0.30, 0.26, 0.20, 28, (0, 8), 'slab', dict(s, bottom=-0.15, chips=1)),
        (-0.62, 0.40, 0.18, 0.18, 0.15, -30, (0, 0), 'boulder', dict(k=8)),
    ]
    return [union_blocks('Rock', rock_blocks(502, specs, -0.20), -0.18, mats['rock'])]


# ===========================================================================
# M2-14 · vulcânico (paleta de `vulcanico` em src/data/tilesets.js: basalto #2b2528/#3a3436, cinza, lava laranja)
# ===========================================================================
TAU = 2.0 * math.pi
BASALT = ('#262124', '#3a3336', '#52484b')


def polar_ring(y, r, n, phase=0.0, rng=None, jit=0.0, rj=0.0):
    """Anel horizontal de n pontos (raio r com sorteio de ±rj e deslocamento de ±jit): cones, montes e crateras facetados."""
    pts = []
    for i in range(n):
        a = phase + TAU * i / n
        rr = r * (1.0 + (rng.uniform(-rj, rj) if rng else 0.0))
        dx, dz = (rng.uniform(-jit, jit), rng.uniform(-jit, jit)) if rng else (0.0, 0.0)
        pts.append((math.cos(a) * rr + dx, y, math.sin(a) * rr + dz))
    return pts


def hex_col(rng, r, bottom, top, tilt=0.16, jit=0.03, flare=1.06, cap0=False, n=6):
    """Coluna hexagonal de basalto: prisma de 6 lados com cada vértice deslocado um pouco (a junta nunca é perfeita), topo plano
    inclinado (`tilt`) e base mais larga (`flare`). 16 tris sem a tampa de baixo."""
    ph = rng.uniform(0.0, TAU / n)
    tx, tz = rng.uniform(-tilt, tilt), rng.uniform(-tilt, tilt)
    lo, hi = [], []
    for i in range(n):
        a = ph + TAU * i / n
        x = math.cos(a) * r + rng.uniform(-jit, jit)
        z = math.sin(a) * r + rng.uniform(-jit, jit)
        lo.append((x * flare, bottom, z * flare))
        hi.append((x, top + tx * x + tz * z, z))
    return prim_rings([lo, hi], cap0=cap0, cap1=True)


def mats_basalt(seed):
    return {'rock': strata_paint('P_basalt', seed=seed, cols=BASALT, band_scale=3.0, band_dist=0.5, vertical=True, blot_scale=2.2,
                                 blot_amt=0.6, top='#6b6063', top_amt=0.5, side='#2e2f3a', side_amt=0.18, dust='#4f4648',
                                 dust_h=0.3, dust_amt=0.5, grain=34.0, grain_amt=0.14, crack_amt=0.3, crack_col='#141012',
                                 edge='#8a7b7d', edge_amt=0.35, edge_r=0.02, ao=(0.4, 0.7), facet_amt=0.18)}


def build_basalt_a(mats, root):
    """Cluster de 10 colunas hexagonais (~2,2 m de altura no centro), em empacotamento hexagonal: o centro é o mais alto e a
    altura cai para fora, com alturas e topos inclinados diferentes; uma coluna quebrada rente ao chão na borda."""
    rng = random.Random(611)
    mb = MeshBuilder('Basalt')
    r, d = 0.36, 0.66
    cells = [(0.0, 0.0, 2.15)]
    for k in range(6):
        a = TAU * k / 6 + 0.3
        cells.append((math.cos(a) * d, math.sin(a) * d, rng.uniform(1.15, 1.75)))
    for k in range(3):
        a = TAU * (k * 2 + 0.5) / 6 + 0.3
        cells.append((math.cos(a) * d * 1.9, math.sin(a) * d * 1.9, rng.uniform(0.45, 0.9)))
    for (x, z, h) in cells:
        mb.add(hex_col(rng, r * rng.uniform(0.93, 1.02), -0.30, h), 'rock', M((x, 0, z)), smooth=0)
    return [mb.build(mats, parent=root)]


def build_basalt_b(mats, root):
    """Colunas baixas (0,35 a 1,2 m): cinco de pé em meia-lua, uma tombada de lado (comprida, sobre o chão) e um toco."""
    rng = random.Random(622)
    mb = MeshBuilder('Basalt')
    r = 0.34
    stand = [(-0.33, 0.0, 1.2), (0.33, 0.0, 0.95), (0.0, 0.58, 0.64), (0.66, 0.58, 0.46), (-0.66, 0.58, 0.38)]
    for (x, z, h) in stand:
        mb.add(hex_col(rng, r * rng.uniform(0.95, 1.0), -0.25, h), 'rock', M((x, 0, z)), smooth=0)
    # coluna tombada: eixo ao longo de x (y do prisma girado 90° em z), apoiada no chão, em frente das de pé
    mb.add(hex_col(rng, 0.30, 0.0, 1.45, tilt=0.12, cap0=True), 'rock', M((0.75, 0.29, 1.50), (0, 8, 90)), smooth=0)
    mb.add(hex_col(rng, 0.28, -0.2, 0.22, tilt=0.3), 'rock', M((1.32, 0, 0.25)), smooth=0)
    return [mb.build(mats, parent=root)]


def build_volcano_cone(mats, root):
    """Cone vulcânico pequeno (~3,8 m de diâmetro, 1,2 m de altura): 10 faces com raios sorteados, borda de cratera irregular
    (dois dentes mais baixos) e boca de lava laranja; três filetes de lava escorrem pela encosta."""
    rng = random.Random(633)
    n = 10
    prof = [(-0.30, 1.85), (0.32, 1.40), (0.90, 0.92), (1.32, 0.62)]
    rings = [polar_ring(y, r, n, rng=rng, rj=0.08, jit=0.05) for (y, r) in prof]
    # dentes na borda: dois vértices do anel de cima mais baixos
    for i in (2, 7):
        x, y, z = rings[-1][i]
        rings[-1][i] = (x, y - 0.22, z)
    mb = MeshBuilder('Cone')
    mb.add(prim_rings(rings, cap0=False, cap1=False), 'rock', smooth=0)
    # parede e boca da cratera (lava): da borda para dentro e para baixo
    inner = [polar_ring(1.24, 0.52, n, rng=rng, rj=0.06), polar_ring(0.90, 0.38, n, rng=rng, rj=0.06),
             polar_ring(0.62, 0.22, n, rng=rng, rj=0.06)]
    mb.add(prim_rings(inner, cap0=False, cap1=True), 'lava', smooth=0)
    # anel de ligação borda -> cratera (rocha escura)
    mb.add(prim_rings([rings[-1], inner[0]], cap0=False, cap1=False), 'rock', smooth=0)
    # filetes de lava escorrendo pela encosta: faixas que seguem os vértices dos anéis (u = índice + fração), um pouco acima da face
    def on_ring(j, u):
        i0 = int(math.floor(u)) % n
        f = u - math.floor(u)
        p0, p1 = Vector(rings[j][i0]), Vector(rings[j][(i0 + 1) % n])
        p = p0 + (p1 - p0) * f
        out = Vector((p.x, 0.0, p.z))
        out.normalize()
        return tuple(p + out * 0.05 + Vector((0.0, 0.03, 0.0)))
    for (u0, du) in ((0.40, 0.14), (3.35, 0.16), (6.55, 0.13)):
        left = [on_ring(j, u0 - du * (1.0 - 0.5 * j / 3.0)) for j in range(3, -1, -1)]
        right = [on_ring(j, u0 + du * (1.0 - 0.5 * j / 3.0)) for j in range(3, -1, -1)]
        mb.add(prim_rings([left, right], cap0=False, cap1=False, closed=False), 'lava_dark', smooth=0)
    return [mb.build(mats, parent=root)]


def mats_cone(seed):
    m = mats_basalt(seed)
    m['lava'] = flat_paint('P_lava', '#ff6a14', '#ffc23a', fine=0.12, top=0.0, emit=1.15)
    m['lava_dark'] = flat_paint('P_lava_d', '#e2530f', '#ff8a24', fine=0.12, top=0.0, emit=1.05)
    return m


def build_tree_burnt(mats, root):
    """Árvore queimada (~4,2 m): tronco carbonizado que afina e entorta até uma ponta quebrada, três galhos secos (um alto à
    esquerda, um curto quebrado à direita e um caído) e um toco lateral; sem folhas. Brasas laranja nas trincas e na base
    (pintura)."""
    rng = random.Random(644)
    mb = MeshBuilder('Burnt')

    def limb(path, radii, n=7, cap=True):
        return prim_rings(limb_rings(path, radii, n=n, up=(0, 0, 1)), cap0=False, cap1=cap)

    trunk = [(0.0, -0.25, 0.0), (0.05, 0.55, 0.03), (0.14, 1.4, -0.02), (0.08, 2.3, -0.07), (0.20, 3.1, -0.10), (0.36, 3.85, -0.04)]
    mb.add(limb(trunk, [0.62, 0.50, 0.40, 0.32, 0.22, 0.10], n=8), 'char', smooth=0)
    # raízes expostas no pé: cunhas baixas
    for k in range(4):
        a = 0.8 + k * 1.6
        mb.add(prim_box(0.75, 0.34, 0.26, taper=(0.4, 0.6), base=True),
               'char', M((math.cos(a) * 0.50, -0.05, math.sin(a) * 0.50), (0, -math.degrees(a), 8)), smooth=0)
    branches = [
        [(0.10, 1.95, -0.05), (-0.45, 2.35, 0.02), (-1.05, 2.95, 0.10), (-1.55, 3.65, 0.12)],     # alto, para -x
        [(0.12, 1.45, 0.0), (0.58, 1.78, 0.10), (1.00, 2.10, 0.16)],                              # curto, quebrado, para +x
        [(0.20, 2.85, -0.08), (0.66, 3.25, -0.20), (1.00, 3.38, -0.55)],                          # fino alto, para +x/-z
        [(0.05, 2.35, 0.10), (-0.20, 2.75, 0.60), (-0.35, 3.25, 1.05)],                           # para a frente (+z)
        [(0.15, 2.6, -0.10), (0.40, 3.0, -0.60), (0.35, 3.55, -0.95)],                            # para trás
    ]
    radii = [[0.20, 0.15, 0.10, 0.04], [0.18, 0.13, 0.08], [0.12, 0.09, 0.035], [0.13, 0.10, 0.04], [0.11, 0.08, 0.03]]
    for p, rr in zip(branches, radii):
        mb.add(limb(p, rr, n=6), 'char', smooth=0)
    # galho caído no chão, encostado no pé
    fallen = [(0.55, 0.12, 0.55), (1.15, 0.15, 0.85), (1.85, 0.11, 1.05)]
    mb.add(limb(fallen, [0.15, 0.12, 0.05], n=6), 'char', smooth=0)
    return [mb.build(mats, parent=root)]


def mats_burnt(seed):
    return {'char': strata_paint('P_char', seed=seed, cols=('#0f0d0e', '#1d191a', '#322a29'), band_scale=2.0, band_dist=0.6, vertical=True,
                                 blot_scale=3.0, blot_amt=0.7, top='#3a3030', top_amt=0.3, side='#15151c', side_amt=0.1,
                                 dust='#c24e18', dust_h=0.40, dust_amt=0.45, grain=30.0, grain_amt=0.16, crack_amt=0.38,
                                 crack_col='#f0661c', edge='#4a3c38', edge_amt=0.3, edge_r=0.02, ao=(0.3, 0.7), facet_amt=0.12)}


def build_fumarole(mats, root):
    """Respiradouro (~2,8 m de diâmetro, 0,6 m de altura): monte baixo de basalto com anel de crosta de enxofre amarelo ao
    redor de uma boca escura, cinco cristais de enxofre em volta e três pedras soltas. O vapor é da M2-18."""
    rng = random.Random(655)
    n = 10
    prof = [(-0.25, 1.50), (0.12, 1.22), (0.40, 0.95), (0.60, 0.66), (0.62, 0.50), (0.46, 0.40), (0.16, 0.24)]
    band_mat = ['rock', 'rock', 'sulfur', 'sulfur', 'hole', 'hole']
    rings = [polar_ring(y, r, n, rng=rng, rj=0.07, jit=0.04) for (y, r) in prof]
    mb = MeshBuilder('Fumarole')
    for i in range(len(rings) - 1):
        mb.add(prim_rings([rings[i], rings[i + 1]], cap0=False, cap1=(i == len(rings) - 2)), band_mat[i], smooth=0)
    for k in range(5):
        a = TAU * k / 5 + 0.4
        rr = rng.uniform(0.70, 0.82)
        h = rng.uniform(0.18, 0.34)
        mb.add(prim_cone(0.07, h, n=4), 'crystal', M((math.cos(a) * rr, 0.52, math.sin(a) * rr), (rng.uniform(-18, 18), 0, rng.uniform(-18, 18))),
               smooth=0)
    for (x, z, s) in ((1.05, 0.55, 0.20), (-0.95, 0.85, 0.16), (0.2, -1.2, 0.18)):
        mb.add(prim_sphere(s, s * 0.75, s, 5, 3, y_min=-0.2), 'rock', M((x, 0.0, z)), smooth=0)
    return [mb.build(mats, parent=root)]


def mats_fumarole(seed):
    m = mats_basalt(seed)
    m['sulfur'] = flat_paint('P_sulfur', '#d8bb2c', '#a89520', fine=0.14, top=0.25, edge='#f5e46a', edge_amt=0.3, ao=(0.3, 0.5))
    m['hole'] = flat_paint('P_hole', '#120d0e', '#241a18', fine=0.1, top=0.0)
    m['crystal'] = flat_paint('P_crystal', '#f0d93a', '#d9b422', fine=0.08, top=0.4, edge='#fff6a0', edge_amt=0.4)
    return m


def build_obsidian(mats, root):
    """Aglomerado de cristais de obsidiana (~1,5 m de altura): nove prismas hexagonais pontiagudos inclinados para fora (o
    maior no centro), de base larga e topo em ponta, mais duas lascas pequenas. Arestas vivas com brilho pintado."""
    rng = random.Random(666)
    mb = MeshBuilder('Obsidian')
    # (x, z, altura, raio, inclinação x, inclinação z)
    shards = [(0.0, 0.0, 1.55, 0.26, 4, -6), (0.42, 0.18, 1.05, 0.20, 16, -20), (-0.40, 0.10, 0.95, 0.19, -8, 18),
              (0.12, -0.42, 0.85, 0.18, -22, 5), (-0.18, 0.46, 0.70, 0.16, 20, 8), (0.64, -0.30, 0.55, 0.14, -14, -26),
              (-0.66, -0.22, 0.48, 0.13, 6, 28), (0.40, 0.58, 0.42, 0.12, 24, -10), (-0.46, 0.62, 0.36, 0.11, 18, 20)]
    for (x, z, h, r, tx, tz) in shards:
        ph = rng.uniform(0.0, 1.0)
        rings = [ring_h(-0.15, r, r, 6, phase=ph), ring_h(h * 0.70, r * 0.92, r * 0.92, 6, phase=ph + 0.1),
                 ring_h(h, r * 0.22, r * 0.22, 6, phase=ph + 0.2)]
        mb.add(prim_rings(rings, cap0=False, cap1=True), 'glass', M((x, 0.0, z), (tx, rng.uniform(0, 60), tz)), smooth=0)
    return [mb.build(mats, parent=root)]


def mats_obsidian(seed):
    return {'glass': strata_paint('P_obsidian', seed=seed, cols=('#07050a', '#120e18', '#251d33'), band_scale=2.5, band_dist=0.6,
                                  blot_scale=2.0, blot_amt=0.8, top='#7c6cae', top_amt=0.7, side='#1c1a2c', side_amt=0.2,
                                  dust='#2a2326', dust_h=0.12, dust_amt=0.4, grain=14.0, grain_amt=0.08, crack_amt=0.0,
                                  edge='#a698d8', edge_amt=0.85, edge_r=0.03, ao=(0.35, 0.65), facet_amt=0.5)}


# ===========================================================================
# M2-15 · gelo (paleta de `inverno:gelo`: gelo azulado #bcdef0, neve, rocha fria #7b8798)
# ===========================================================================
def mats_ice(seed, **kw):
    p = dict(cols=('#5b97c4', '#8cc2e2', '#cfeaf8'), band_scale=3.0, band_dist=0.55, band_amt=1.0, blot_scale=1.6, blot_amt=0.9,
             top='#f4fbff', top_amt=0.75, side='#4d78a8', side_amt=0.22, dust='#dff1fb', dust_h=0.25, dust_amt=0.45,
             grain=10.0, grain_amt=0.06, crack_amt=0.55, crack_col='#f0fbff', edge='#ffffff', edge_amt=0.7, edge_r=0.04,
             ao=(0.5, 0.45), facet_amt=0.28, top_lo=0.35, top_hi=0.85)
    p.update(kw)
    return {'ice': strata_paint('P_ice', seed=seed, **p)}


ICE_SLAB = dict(chamfer=0.95, cut=(0.70, 0.88), chamfer_top=0.8, cut_top=(0.74, 0.90), chips=4, jitter=0.12, ridge=0.12,
                taper=0.22, chip_cut=(0.80, 0.93))


def build_ice_small(mats, root):
    """Bloco de gelo de ~1,4 m: dois cristais facetados encostados (o maior inclinado), mais uma lasca; 1,1 m de altura."""
    specs = [
        (0.00, 0.00, 1.05, 0.50, 0.42, 20, (0, 6), 'slab', dict(ICE_SLAB, bottom=-0.20)),
        (0.46, 0.20, 0.62, 0.30, 0.26, -35, (4, -10), 'slab', dict(ICE_SLAB, bottom=-0.18, chips=2)),
        (-0.42, 0.34, 0.42, 0.20, 0.18, 50, (0, 8), 'slab', dict(ICE_SLAB, bottom=-0.15, chips=1, taper=0.15)),
    ]
    return [union_blocks('Ice', rock_blocks(701, specs, -0.20), -0.18, mats['ice'])]


def build_ice_large(mats, root):
    """Iceberg de ~3,4 x 2,8 m e 3 m de altura: quatro monólitos de pontas diferentes (o central alto e estreito, um baixo e
    largo à direita, um inclinado à esquerda), com lascas no pé."""
    specs = [
        (0.00, 0.00, 3.00, 0.80, 0.70, 15, (2, 4), 'slab', dict(ICE_SLAB, bottom=-0.30, taper=0.30)),
        (-0.95, 0.30, 2.05, 0.62, 0.55, -28, (-4, 12), 'slab', dict(ICE_SLAB, bottom=-0.28, taper=0.26)),
        (1.05, -0.10, 1.55, 0.70, 0.62, 30, (3, -8), 'slab', dict(ICE_SLAB, bottom=-0.26, taper=0.20)),
        (0.15, 0.85, 1.05, 0.55, 0.42, -10, (0, 0), 'slab', dict(ICE_SLAB, bottom=-0.24, taper=0.14, chips=3)),
        (-0.30, -0.80, 1.45, 0.52, 0.45, 50, (6, 3), 'slab', dict(ICE_SLAB, bottom=-0.22, taper=0.24)),
        (1.30, 0.80, 0.55, 0.30, 0.26, 20, (0, 0), 'boulder', dict(k=9, bottom=-0.18)),
        (-1.55, -0.40, 0.45, 0.26, 0.22, -40, (0, 0), 'boulder', dict(k=9, bottom=-0.18)),
    ]
    return [union_blocks('Ice', rock_blocks(702, specs, -0.30), -0.28, mats['ice'])]


def mats_snow_rock(seed):
    return {'rock': strata_paint('P_snowrock', seed=seed, cols=('#5a626f', '#7a8391', '#9aa3b0'), band_scale=6.0, band_dist=0.4,
                                 blot_scale=1.8, blot_amt=0.7, top='#ffffff', top_amt=0.96, side='#4b5668', side_amt=0.22,
                                 dust='#d6e4ee', dust_h=0.22, dust_amt=0.5, grain=24.0, grain_amt=0.12, crack_amt=0.25,
                                 crack_col='#2c323c', edge='#e9f2fa', edge_amt=0.35, edge_r=0.03, ao=(0.5, 0.6),
                                 top_lo=0.18, top_hi=0.55)}


def build_rock_snow(mats, root):
    """Rocha com capa de neve de ~1,8 x 1,5 m e 1,05 m de altura: matacão principal com dois vizinhos; a neve cobre tudo que
    olha para cima (pintura, limiar baixo) e deixa a rocha fria à mostra nas faces íngremes."""
    specs = [
        (0.00, 0.00, 1.05, 0.80, 0.66, 20, (0, 3), 'boulder', dict(k=18, tight=(0.82, 0.97))),
        (0.80, 0.46, 0.58, 0.40, 0.34, -30, (0, 3), 'boulder', dict(k=13)),
        (-0.72, 0.50, 0.40, 0.28, 0.24, 35, (0, 0), 'boulder', dict(k=10)),
        (-0.30, -0.78, 0.36, 0.26, 0.22, 70, (0, 0), 'boulder', dict(k=10)),
    ]
    return [union_blocks('Rock', rock_blocks(703, specs, -0.22), -0.20, mats['rock'])]


PINE_PAL = {
    'bark_pine': dict(base='#4e3626', var='#2e2016', var_scale=6.0, var_amt=0.9, fine=0.16, fine_scale=40.0, top=0.25, ao=(0.8, 0.8)),
    'needle': dict(base='#2a5a46', var='#183c32', var_scale=1.4, var_amt=1.0, fine=0.14, top=0.55, edge='#6ab0a0', edge_amt=0.3,
                   edge_r=0.05, ao=(1.4, 1.0)),
    'needle_light': dict(base='#356e58', var='#25503f', var_scale=1.8, var_amt=1.0, fine=0.12, top=0.6, ao=(1.2, 0.9)),
    'snow': dict(base='#f6faff', var='#d4e4f2', var_scale=2.2, var_amt=1.0, fine=0.06, top=0.45, edge='#ffffff', edge_amt=0.3,
                 edge_r=0.04, ao=(0.9, 0.5)),
}


def build_pine_snow(mats, root):
    """Pinheiro nevado (~7,4 m, a silhueta de `tree_pine`): mesmo tronco e mesmos cinco andares de cone, em agulhas mais frias, com
    uma capa de neve em cada andar (cone mais curto sobre a metade de cima, ligeiramente maior) e na ponta."""
    mb = MeshBuilder('Tree')
    mb.add(prim_cyl(0.54, 0.36, 2.2, 7, base=True), 'bark_pine', smooth=40)
    mb.add(prim_cyl(0.36, 0.24, 2.4, 6, base=True), 'bark_pine', M((0, 2.2, 0)), smooth=40)
    mb.add(prim_cyl(0.24, 0.12, 2.0, 5, base=True), 'bark_pine', M((0, 4.6, 0)), smooth=40)
    for k, (r, h, y, seg) in enumerate(((2.35, 2.0, 1.4, 8), (1.95, 1.8, 2.75, 8), (1.5, 1.65, 3.95, 7),
                                        (1.05, 1.45, 5.1, 6), (0.58, 1.25, 6.15, 5))):
        rot = (0, k * 37, 0)
        mb.add(prim_cone(r, h, seg), 'needle_light' if k % 2 else 'needle', M((0, y, 0), rot), smooth=0)
        f = 0.50                                    # fração da altura coberta de neve (de cima para baixo)
        mb.add(prim_cone(r * f * 1.10, h * f * 1.02, seg), 'snow', M((0, y + h * (1.0 - f) - 0.02, 0), rot), smooth=0)
    mb.add(prim_cone(0.18, 0.6, 4), 'snow', M((0, 6.85, 0)), smooth=0)
    return [mb.build(mats, parent=root)]


# ===========================================================================
# Registro dos modelos
# ===========================================================================
SPECS = {
    'rock_sandstone_a': dict(root='RockSandstoneA', atlas=512, build=build_sandstone_a,
                             mats=lambda: mats_sandstone(1.3, band_scale=8.0),
                             margin=0.007, angle=66.0, rough=0.92),
    'rock_sandstone_b': dict(root='RockSandstoneB', atlas=512, build=build_sandstone_b,
                             mats=lambda: mats_sandstone(4.6, band_scale=11.0, grain=30.0, edge_r=0.022, dust_h=0.2),
                             margin=0.007, angle=66.0, rough=0.92),
    # M2-14
    'rock_basalt_a': dict(root='RockBasaltA', atlas=512, build=build_basalt_a, mats=lambda: mats_basalt(2.1),
                          margin=0.007, angle=66.0, rough=0.9),
    'rock_basalt_b': dict(root='RockBasaltB', atlas=512, build=build_basalt_b, mats=lambda: mats_basalt(6.4),
                          margin=0.007, angle=66.0, rough=0.9),
    'volcano_cone': dict(root='VolcanoCone', atlas=512, build=build_volcano_cone, mats=lambda: mats_cone(3.3),
                         margin=0.008, angle=66.0, rough=0.9),
    'tree_burnt': dict(root='TreeBurnt', atlas=512, build=build_tree_burnt, mats=lambda: mats_burnt(1.8),
                       margin=0.008, angle=66.0, rough=0.95),
    'fumarole': dict(root='Fumarole', atlas=512, build=build_fumarole, mats=lambda: mats_fumarole(4.2),
                     margin=0.008, angle=66.0, rough=0.9),
    'obsidian': dict(root='Obsidian', atlas=512, build=build_obsidian, mats=lambda: mats_obsidian(2.7),
                     margin=0.008, angle=66.0, rough=0.28),
    # M2-15
    'ice_block_small': dict(root='IceBlockSmall', atlas=512, build=build_ice_small, mats=lambda: mats_ice(1.2),
                            margin=0.008, angle=66.0, rough=0.25),
    'ice_block_large': dict(root='IceBlockLarge', atlas=512, build=build_ice_large, mats=lambda: mats_ice(5.2, blot_scale=0.9),
                            margin=0.007, angle=66.0, rough=0.25),
    'tree_pine_snow': dict(root='TreePineSnow', atlas=512, build=build_pine_snow, mats=lambda: C.make_paint_set(PINE_PAL),
                           margin=0.01, angle=66.0, rough=0.85),
    'rock_snow': dict(root='RockSnow', atlas=512, build=build_rock_snow, mats=lambda: mats_snow_rock(2.6),
                      margin=0.007, angle=66.0, rough=0.88),
}
GROUPS = {
    'arenito': ['rock_sandstone_a', 'rock_sandstone_b'],
    'vulcanico': ['rock_basalt_a', 'rock_basalt_b', 'volcano_cone', 'tree_burnt', 'fumarole', 'obsidian'],
    'gelo': ['ice_block_small', 'ice_block_large', 'tree_pine_snow', 'rock_snow'],
    'subosque': [],
}
BUDGET_TRIS = 600


def main():
    args = C.script_args()
    names = []
    for a in args:
        if a in SPECS:
            names.append(a)
        elif a in GROUPS:
            names += GROUPS[a]
        elif a == 'all':
            names += [k for grp in GROUPS.values() for k in grp]
    for key in names:
        P.SPECS[key] = SPECS[key]
        P.BUDGET[key] = (1, BUDGET_TRIS)
        P.build_one(key, args)
        if '--draft' not in args and '--no-render' not in args:
            P.render_final_preview(key)


if __name__ == '__main__':
    main()
