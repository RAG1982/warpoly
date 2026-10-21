"""
build_props_costa.py — props de costa e praia (M2-16 · ART-08/09) gerados 100% por script: concha de vieira, estrela-do-mar,
touceira de caniço e casco de barco naufragado.

Uso (sempre via tools/safe-run.sh; um Blender por vez; ~1 min para os quatro modelos):
  bash tools/safe-run.sh --timeout 600 -- /home/rafael/Downloads/blender-5.2.1-linux-x64/blender -b --factory-startup \
      --python tools/blender/build_props_costa.py -- [shell|starfish|reed|wreck|all]

Saída (public/models/), coordenadas do jogo (x direita, y cima, +z frente), 1 unidade = 1 m, origem na base (y = 0):
  coast_shell.glb     CoastShell     concha de vieira (leque de nervuras) com uma menor ao lado, ~0,5 m
  coast_starfish.glb  CoastStarfish  estrela-do-mar de cinco braços, ~0,38 m
  coast_reed.glb      CoastReed      touceira de caniço (lâminas curvas + 3 espigas), ~1,7 m de altura
  coast_wreck.glb     CoastWreck     casco de barco naufragado (quilha, cavernas, tábuas e mastro quebrado), ~4,6 m
Cada raiz é um empty com UM nó `Static_Mesh` (um material `Atlas`, 1 draw call, atlas <= 256²), o mesmo padrão das rochas
e cactos (`build_props_rochas_cactos.py`): o jogo extrai geometria+material para `InstancedMesh` (src/world/CoastProps.js).
Sem cor de vértice. Pintura procedural só para o bake; flat shading nas peças facetadas.
"""
import os
import sys
import math
import json
import random

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402
import common as C  # noqa: E402
from common import (MeshBuilder, M, prim_box, prim_cyl, prim_cone, prim_rings, ring_h, limb_rings, bezier)  # noqa: E402
from bld_common import bbox_game  # noqa: E402

STATS_JSON = os.path.join(C.BUILD_DIR, 'coast_stats.json')
BUDGET = {'shell': (4, 600), 'starfish': (4, 600), 'reed': (4, 600), 'wreck': (4, 600)}


def log(*a):
    print('[costa]', *a, flush=True)


# ---------------------------------------------------------------------------
# Materiais de pintura (só existem para o bake)
# ---------------------------------------------------------------------------
def mats_shell():
    return {
        'shell': C.paint_material('P_shell', dict(base='#e9d3c0', var='#cf9a86', var_scale=7.0, fine=0.07, top=0.22,
                                                  edge='#fff2e4', edge_amt=0.35, edge_r=0.01, ao=(0.12, 0.5))),
        'hinge': C.paint_material('P_hinge', dict(base='#b98a73', var='#98694f', fine=0.06, top=0.1)),
    }


def mats_starfish():
    return {
        'star': C.paint_material('P_star', dict(base='#e2663a', var='#f09a58', var_scale=9.0, fine=0.1, top=0.2,
                                                edge='#ffd0a0', edge_amt=0.3, edge_r=0.008, ao=(0.1, 0.45))),
        'dot': C.paint_material('P_dot', dict(base='#f6d9a6', var='#e9bd80', fine=0.05, top=0.1)),
    }


def mats_reed():
    return {
        'blade': C.paint_material('P_blade', dict(base='#6f9a3e', var='#a3b457', var_scale=5.0, fine=0.07, top=0.15,
                                                  grad=(0.0, 1.7, 0.4), ao=(0.2, 0.4))),
        'dry': C.paint_material('P_dry', dict(base='#b9a35c', var='#8d7a3d', var_scale=6.0, fine=0.06, top=0.1)),
        'head': C.paint_material('P_head', dict(base='#6b4528', var='#4f301b', var_scale=14.0, fine=0.1, top=0.12)),
    }


def mats_wreck():
    return {
        'wood': C.paint_material('P_wood', dict(base='#6e5b44', var='#8c7c64', var_scale=3.2, fine=0.09, top=0.2,
                                                 streaks=(1.4, 0.35, 0.18), edge='#b3a283', edge_amt=0.3, edge_r=0.03,
                                                 ao=(0.4, 0.55))),
        'dark': C.paint_material('P_dark', dict(base='#3f3326', var='#54442f', var_scale=4.0, fine=0.08, top=0.1,
                                                 ao=(0.4, 0.5))),
        'algae': C.paint_material('P_algae', dict(base='#48663a', var='#6d8442', var_scale=5.0, fine=0.1, top=0.1)),
    }


# ---------------------------------------------------------------------------
# Construtores
# ---------------------------------------------------------------------------
def scallop_prim(radius, ribs, rows, span_deg, thick, lift):
    """Leque de vieira: `ribs` nervuras radiais, `rows` anéis, abertura de `span_deg`; sólido fechado (face de cima ondulada +
    fundo). Charneira na origem, o leque se abre para +z (frente)."""
    n_u = ribs * 2 + 1
    verts, faces = [], []
    top, bot = {}, {}
    for j in range(rows + 1):
        r = radius * (j / rows)
        for i in range(n_u):
            a = math.radians((i / (n_u - 1) - 0.5) * span_deg)
            wave = 0.5 + 0.5 * math.cos(i * math.pi)             # nervuras alternam crista e vale
            dome = math.sin(min(1.0, j / rows) * math.pi * 0.8)   # sobe do centro ao meio e baixa na borda
            y = lift * dome + (0.012 * wave * (j / rows) if j > 0 else 0.0)
            x, z = math.sin(a) * r, math.cos(a) * r
            top[(j, i)] = len(verts)
            verts.append((x, y + thick, z))
    for j in range(rows + 1):
        r = radius * (j / rows)
        for i in range(n_u):
            a = math.radians((i / (n_u - 1) - 0.5) * span_deg)
            dome = math.sin(min(1.0, j / rows) * math.pi * 0.8)
            x, z = math.sin(a) * r, math.cos(a) * r
            bot[(j, i)] = len(verts)
            verts.append((x, lift * dome * 0.75, z))
    for j in range(rows):
        for i in range(n_u - 1):
            faces.append((top[(j, i)], top[(j + 1, i)], top[(j + 1, i + 1)], top[(j, i + 1)]))
            faces.append((bot[(j, i)], bot[(j, i + 1)], bot[(j + 1, i + 1)], bot[(j + 1, i)]))
    for j in range(rows):                                       # laterais do leque
        faces.append((top[(j, 0)], bot[(j, 0)], bot[(j + 1, 0)], top[(j + 1, 0)]))
        faces.append((top[(j, n_u - 1)], top[(j + 1, n_u - 1)], bot[(j + 1, n_u - 1)], bot[(j, n_u - 1)]))
    for i in range(n_u - 1):                                    # borda externa
        faces.append((top[(rows, i)], top[(rows, i + 1)], bot[(rows, i + 1)], bot[(rows, i)]))
    return verts, faces


def build_shell(mats, root):
    mb = MeshBuilder('CoastShell')
    mb.add(scallop_prim(0.26, 6, 3, 118, 0.012, 0.075), 'shell', M(t=(-0.04, 0.0, -0.12), r=(0, 12, 0)), smooth=0.0)
    mb.add(scallop_prim(0.15, 5, 2, 112, 0.01, 0.05), 'shell', M(t=(0.19, 0.0, 0.05), r=(6, -38, 0)), smooth=0.0)
    # charneira das orelhas
    mb.add(prim_box(0.11, 0.035, 0.035, base=True), 'hinge', M(t=(-0.04, 0.0, -0.13), r=(0, 12, 0)))
    return [mb.build(mats, root)]


def star_squash(arms=5, depth=0.55):
    return lambda a: 1.0 - depth * (0.5 - 0.5 * math.cos(arms * a))


def build_starfish(mats, root):
    mb = MeshBuilder('CoastStarfish')
    scales = [1.0, 0.86, 0.66, 0.44, 0.24, 0.07]
    heights = [0.0, 0.032, 0.058, 0.078, 0.09, 0.096]
    sq = star_squash()
    rings = [ring_h(y, 0.19 * s, 0.19 * s, n=30, phase=math.radians(90), squash=sq) for s, y in zip(scales, heights)]
    mb.add(prim_rings(rings, cap0=True, cap1=True), 'star', None, smooth=0.0)
    # pontos claros ao longo dos braços
    for k in range(5):
        a = math.radians(90) + k * 2 * math.pi / 5
        for rr, hh in ((0.09, 0.083), (0.14, 0.062)):
            mb.add(prim_cone(0.011, 0.014, 4), 'dot', M(t=(math.cos(a) * rr, hh, math.sin(a) * rr)))
    return [mb.build(mats, root)]


def build_reed(mats, root):
    mb = MeshBuilder('CoastReed')
    rng = random.Random(23)
    blades = 9
    for i in range(blades):
        a = i / blades * 2 * math.pi + rng.uniform(-0.3, 0.3)
        r0 = rng.uniform(0.02, 0.16)
        h = rng.uniform(1.1, 1.65)
        lean = rng.uniform(0.18, 0.42)
        p0 = (math.cos(a) * r0, 0.0, math.sin(a) * r0)
        p2 = (math.cos(a) * (r0 + lean * h), h * 0.93, math.sin(a) * (r0 + lean * h))
        p1 = (math.cos(a) * (r0 + lean * h * 0.2), h * 0.55, math.sin(a) * (r0 + lean * h * 0.2))
        path = bezier(p0, p1, p2, 4)
        radii = [(0.030, 0.010), (0.026, 0.009), (0.020, 0.007), (0.012, 0.005), (0.002, 0.002)]
        rings = limb_rings(path, radii, n=3)
        mb.add(prim_rings(rings, cap0=False, cap1=True), 'blade' if i % 3 else 'dry')
    # três espigas (rabo-de-gato) em hastes retas
    for k, (ang, rr, hh) in enumerate(((0.4, 0.07, 1.55), (2.3, 0.1, 1.38), (4.4, 0.05, 1.7))):
        px, pz = math.cos(ang) * rr, math.sin(ang) * rr
        mb.add(prim_cyl(0.010, 0.007, hh, n=4), 'dry', M(t=(px, 0.0, pz)))
        mb.add(prim_cyl(0.034, 0.030, 0.22, n=6), 'head', M(t=(px, hh - 0.2, pz)))
        mb.add(prim_cone(0.030, 0.07, 6), 'head', M(t=(px, hh + 0.02, pz)))
    return [mb.build(mats, root)]


def tube_pts(mb, pts, w, mat, bevel=0.0):
    rings = limb_rings(pts, [w] * len(pts), n=4, up=(0, 0, 1))
    mb.add(prim_rings(rings, cap0=True, cap1=True), mat)


def build_wreck(mats, root):
    mb = MeshBuilder('CoastWreck')
    L = 4.4                                           # comprimento (z de -L/2 a L/2); proa para +z
    # quilha inclinada: a popa enterrada, a proa levantada
    mb.add(prim_box(0.16, 0.20, L, base=False), 'dark', M(t=(0.0, 0.34, 0.0), r=(-7, 0, 0)))
    # cavernas (costelas em arco): pares simétricos; as da popa quebradas mais baixas
    stations = [(-1.7, 0.5), (-1.2, 0.8), (-0.7, 1.0), (-0.2, 1.05), (0.3, 1.0), (0.9, 0.84), (1.5, 0.6)]
    for zc, size in stations:
        zc2 = zc
        yb = 0.30 + zc * -0.12 * -1.0 * 0.0
        base_y = 0.32 + (zc / L) * 0.55                # acompanha a inclinação da quilha
        for sx in (-1, 1):
            top = size * (0.85 if zc > -1.4 else 0.55) * (0.65 if (zc, sx) in ((-0.2, 1), (0.8, -1)) else 1.0)
            pts = []
            for k in range(4):
                t = k / 3
                ang = t * math.radians(78)
                x = sx * (0.04 + size * 0.78 * math.sin(ang))
                y = base_y + top * (1 - math.cos(ang)) * 1.15
                pts.append((x, y, zc2 + 0.03 * t))
            tube_pts(mb, pts, (0.055, 0.045), 'wood')
    # tábuas do casco ainda presas no lado de boreste e algumas soltas
    for (zc, zl, side, hy) in ((0.2, 1.3, 1, 0.55), (-0.9, 0.9, 1, 0.8), (1.1, 1.0, -1, 0.5)):
        mb.add(prim_box(0.05, 0.16, zl, base=False), 'wood',
               M(t=(side * (0.62 + hy * 0.28), 0.34 + hy * 0.78 + (zc / L) * 0.55, zc), r=(-7 + zc * 1.5, 0, side * -34)))
    # tábua caída ao lado
    mb.add(prim_box(0.14, 0.04, 1.3, base=True), 'wood', M(t=(1.25, 0.04, -0.7), r=(0, 24, 4)))
    mb.add(prim_box(0.12, 0.04, 0.8, base=True), 'wood', M(t=(-1.15, 0.03, 0.9), r=(0, -35, -3)))
    # mastro quebrado, inclinado
    mb.add(prim_cyl(0.075, 0.052, 1.55, n=6), 'wood', M(t=(0.04, 0.5, 0.35), r=(-22, 0, 7)))
    mb.add(prim_box(0.04, 0.04, 0.55), 'dark', M(t=(0.1, 1.15, 0.14), r=(-22, 0, 68)))
    # limo/alga na quilha e pé do casco
    mb.add(prim_box(0.2, 0.05, 1.5, base=True), 'algae', M(t=(0.0, 0.27, -1.0), r=(-7, 0, 0)))
    return [mb.build(mats, root)]


SPECS = {
    'shell': dict(root='CoastShell', out='coast_shell', atlas=128, build=build_shell, mats=mats_shell, rough=0.55),
    'starfish': dict(root='CoastStarfish', out='coast_starfish', atlas=128, build=build_starfish, mats=mats_starfish, rough=0.8),
    'reed': dict(root='CoastReed', out='coast_reed', atlas=256, build=build_reed, mats=mats_reed, rough=0.8),
    'wreck': dict(root='CoastWreck', out='coast_wreck', atlas=256, build=build_wreck, mats=mats_wreck, rough=0.9),
}
ORDER = ['shell', 'starfish', 'reed', 'wreck']


def measure(root):
    lo, hi = bbox_game(root)
    return {'min': lo, 'max': hi, 'size': tuple(round(hi[i] - lo[i], 2) for i in range(3))}


def build_one(key):
    spec = SPECS[key]
    C.reset_scene()
    mats = spec['mats']()
    root = C.make_empty(spec['root'])
    parts = spec['build'](mats, root)
    for o in parts:
        if o.parent is None:
            o.parent = root
    bpy.context.view_layer.update()
    C.uv_atlas(parts, margin=0.012, angle=66.0)
    img = C.bake_atlas(parts, spec['out'] + '_atlas', spec['atlas'], samples=int(os.environ.get('BAKE_SAMPLES', 24)), margin=3)
    C.finalize_materials(parts, img, roughness=spec['rough'], out_png=os.path.join(C.BUILD_DIR, spec['out'] + '_atlas.png'))
    static = C.join_objects(list(parts), 'Static_Mesh')
    static.parent = root
    bpy.context.view_layer.update()
    out = os.path.join(C.OUT_MODELS, spec['out'] + '.glb')
    C.export_glb(root, out, quality=80)
    st = C.stats(root, out)
    st['atlas_px'] = spec['atlas']
    st['bbox'] = measure(root)
    j = C.glb_json(out)
    st['attrs'] = sorted({k for m in j.get('meshes', []) for p in m['primitives'] for k in p['attributes']})
    problems = []
    if 'COLOR_0' in st['attrs']:
        problems.append('tem COLOR_0')
    if len(j.get('meshes', [])) != 1 or len(j.get('materials', [])) != 1:
        problems.append('não tem exatamente uma malha e um material')
    draws, tris = BUDGET[key]
    if st['draw_calls'] > draws or st['tris'] > tris:
        problems.append(f'fora do orçamento ({st["draw_calls"]} draw calls, {st["tris"]} tris)')
    log('STATS', key, st)
    if problems:
        raise SystemExit(f'{key}: ' + '; '.join(problems))
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


def main():
    args = C.script_args()
    names = [a for a in args if a in SPECS]
    if not names or 'all' in args:
        names = list(ORDER)
    for key in names:
        build_one(key)


if __name__ == '__main__':
    main()
