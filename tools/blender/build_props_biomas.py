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
                 edge='#f2e4bd', edge_amt=0.4, edge_r=0.03, ao=(0.5, 0.6), facet_amt=0.12, vertical=False):
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
    col = lerp_to(nb, col, smoothstep(nb, nz, 0.45, 0.95), top, top_amt)
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
# Registro dos modelos
# ===========================================================================
SPECS = {
    'rock_sandstone_a': dict(root='RockSandstoneA', atlas=512, build=build_sandstone_a,
                             mats=lambda: mats_sandstone(1.3, band_scale=8.0),
                             margin=0.007, angle=66.0, rough=0.92),
    'rock_sandstone_b': dict(root='RockSandstoneB', atlas=512, build=build_sandstone_b,
                             mats=lambda: mats_sandstone(4.6, band_scale=11.0, grain=30.0, edge_r=0.022, dust_h=0.2),
                             margin=0.007, angle=66.0, rough=0.92),
}
GROUPS = {
    'arenito': ['rock_sandstone_a', 'rock_sandstone_b'],
    'vulcanico': [],
    'gelo': [],
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
