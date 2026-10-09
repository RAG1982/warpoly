"""
build_war_balloon.py — Balão de Guerra (orc, tipo interno `war_balloon`) gerado 100% por script.
Refeito na arte A (F7-00b): envelope de gomos abaulados (alternando couro claro/ferrugem) com costuras de tiras de couro
rebitadas, faixa de guerra serrilhada em cor de time com o crânio de presas, coroa de ferro com espinhos de osso, saia de couro,
remendos; cesta de vime reforçada com escada de corda, bombas, leme em cor de time, dois tripulantes (o vigia com luneta,
nó `Head`), braseiro aceso na boca e hélice de popa de ossos e madeira (`Rotor`).

Uso:
  blender -b --factory-startup --python tools/blender/build_war_balloon.py -- [--no-render]

Hierarquia (nomes lidos por `ModelFactory.rebindUserData` / `UnitAnimator.applyAir`):
  WarBalloon (raiz)
  └─ Torso   envelope, cordas, braseiro (pivô na origem; base em y = 0)
     ├─ Basket  cesta, tripulação, bombas, escada de corda, leme (estático em relação ao Torso)
     ├─ Head    cabeça do vigia (pivô (0; 1,14; 0,78))
     └─ Rotor   hélice de popa (pivô (0; 0,5; −1,3)); gira em z
Frente = +Z. Cor de time: faixa de guerra, estandarte, faixas da cesta, lenço do vigia, listra do leme.
"""
import os
import sys
import math

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
from mathutils import Vector, Matrix  # noqa: E402
import common as C  # noqa: E402
from common import (MeshBuilder, M, prim_box, prim_rings, ring_h, prim_cyl, prim_cone,  # noqa: E402
                    prim_sphere, prim_extrude, limb_rings, bezier)
from bld_common import beam, tube, log, skull, bbox_game  # noqa: E402
import bld_orc as O  # noqa: E402
import air_common as A  # noqa: E402

TEAM_DEFAULT = '#b81d24'
HEAD_PIVOT = (0.0, 1.14, 0.78)
ROTOR_PIVOT = (0.0, 0.5, -1.3)
# (y, raio) do envelope — "cebola" com o ponto mais largo logo acima do meio
ENV_PROFILE = [(2.10, 0.26), (2.25, 0.50), (2.50, 0.82), (2.85, 1.08), (3.25, 1.24), (3.70, 1.31), (4.15, 1.28),
               (4.60, 1.14), (4.98, 0.88), (5.25, 0.52), (5.37, 0.12)]
N_GORES = 12
SEG = 4                            # segmentos por gomo (travesseiro: costura -> meio -> costura)
N_RING = N_GORES * SEG
PHASE = math.pi / N_GORES          # +Z (90°) cai no meio de um gomo (gomo g cobre 15° + 30°·g .. +30°)
SEAM_K = 0.94                      # raio da costura em relação ao meio do gomo (gomo abaulado)

PALETTE = A.base_palette()
PALETTE.update({
    'hide': dict(base='#c08a4c', var='#a87a40', var_scale=2.4, var_amt=0.8, fine=0.1, top=0.3, edge='#d3a875',
                 edge_amt=0.25, edge_r=0.04, ao=(0.5, 0.45)),
    'hide_b': dict(base='#9a5f34', var='#7c4a26', var_scale=2.2, var_amt=0.8, fine=0.11, top=0.3, edge='#c08a5c',
                   edge_amt=0.25, edge_r=0.04, ao=(0.5, 0.45)),
    'hide_dark': dict(base='#6e4a2a', var='#4a2f16', var_scale=1.4, var_amt=0.9, fine=0.12, top=0.35,
                      edge='#b98a58', edge_amt=0.3, edge_r=0.03, ao=(0.5, 0.55)),
    'patch': dict(base='#5f6a3a', var='#444d28', var_scale=5.0, var_amt=0.9, fine=0.12, top=0.3, ao=(0.3, 0.4)),
    'patch_red': dict(base='#8a2a1c', var='#661c12', var_scale=5.0, var_amt=0.9, fine=0.12, top=0.3, ao=(0.3, 0.4)),
    'strap': dict(base='#3e2a1a', var='#2a1a0e', var_scale=6.0, fine=0.1, top=0.25, edge='#8a6a48', edge_amt=0.3,
                  edge_r=0.012, ao=(0.2, 0.4)),
    'wicker': dict(base='#a0764a', var='#7a5530', var_scale=2.0, fine=0.1, pattern='planks_v', mapping='box',
                   pw=2.0, ph=0.08, mortar='#3a2616', mortar_size=0.04, top=0.25, edge='#c9a070', edge_amt=0.3,
                   edge_r=0.02, ao=(0.5, 0.6)),
    'bone': dict(base='#c8bd9c', var='#a09476', var_scale=4.0, var_amt=0.7, fine=0.06, top=0.35, edge='#fff7de',
                 edge_amt=0.6, edge_r=0.02, ao=(0.3, 0.55)),
    'ember': dict(base='#ff7a1a', var='#ffb040', var_scale=5.0, emit_boost=1.4),
    'coal': dict(base='#2a1d17', var='#1a110d', var_scale=6.0, fine=0.1, top=0.2),
    'skin': dict(base='#5f8a3a', var='#456a2a', var_scale=8.0, fine=0.06, top=0.3, ao=(0.3, 0.5)),
    'paint': dict(base='#a0231a', var='#781710', var_scale=6.0, fine=0.1, top=0.2),
    'sack': dict(base='#9a8a68', var='#74664a', var_scale=10.0, fine=0.14, top=0.25, ao=(0.3, 0.5)),
    'powder': dict(base='#2a2a30', var='#18181c', var_scale=6.0, fine=0.12, top=0.4, edge='#8a8a96', edge_amt=0.6,
                   edge_r=0.02, ao=(0.2, 0.5)),
    'brass': dict(base='#b08a3a', var='#8a6a24', var_scale=4.0, fine=0.06, top=0.4, edge='#f0d080', edge_amt=0.7,
                  edge_r=0.012, ao=(0.2, 0.4)),
})


# ---------------------------------------------------------------- envelope
def env_r(y):
    """Raio do envelope (no meio do gomo) na altura y, por interpolação linear do perfil."""
    p = ENV_PROFILE
    if y <= p[0][0]:
        return p[0][1]
    for (y0, r0), (y1, r1) in zip(p, p[1:]):
        if y <= y1:
            return r0 + (r1 - r0) * (y - y0) / (y1 - y0)
    return p[-1][1]


def bulge_f(f):
    """Fator de raio dentro do gomo, f in [0, 1] (0 e 1 = costura, 0,5 = meio): travesseiro suave."""
    return SEAM_K + (1.0 - SEAM_K) * math.sin(math.pi * f) ** 0.8


def bulge(k):
    """Fator de raio do vértice k do anel."""
    return bulge_f((k % SEG) / SEG)


def env_ring(y, r, off=0.0, dy=None):
    """Anel de N_GORES·SEG vértices a partir de PHASE; `dy(k)` altera o y por vértice (serrilhado)."""
    pts = []
    for k in range(N_RING):
        a = PHASE + k * 2 * math.pi / N_RING
        rr = r * bulge(k) + off
        pts.append((math.cos(a) * rr, y + (dy(k) if dy else 0.0), math.sin(a) * rr))
    return pts


def gore_mat(c, nrm):
    """mat_fn do envelope: gomos alternados claro/ferrugem; a saia (abaixo de y = 2,95) em couro escuro."""
    a = (math.atan2(c[2], c[0]) - PHASE) % (2 * math.pi)
    g = int(a / (2 * math.pi / N_GORES))     # o centro da face cai a 1/8, 3/8, 5/8, 7/8 do gomo: nunca na fronteira
    if c[1] < 2.95:
        return 'hide_dark'
    return 'hide' if g % 2 == 0 else 'hide_b'


def surface_patch(mb, g, y0, y1, mat, off=0.016, spread=0.30, thick=0.014):
    """Remendo (laje fina fechada) sobre o gomo g, `spread` rad em torno do meio, do y0 ao y1, rente à superfície facetada."""
    a_mid = PHASE + (2 * g + 1) * math.pi / N_GORES
    cols = (-spread, 0.0, spread)
    ys = (y0, (y0 + y1) / 2, y1)
    top, bot = [], []
    for y in ys:
        for da in cols:
            # raio da superfície nessa coluna: meio do gomo = 1,0; a costura fica a ±π/N → interpolação linear
            f = bulge_f(0.5 + da / (2 * math.pi / N_GORES))
            r = env_r(y) * f + off
            a = a_mid + da
            top.append((math.cos(a) * (r + thick), y, math.sin(a) * (r + thick)))
            bot.append((math.cos(a) * (r - 0.004), y, math.sin(a) * (r - 0.004)))
    verts = top + bot
    faces = []
    for j in range(2):
        for i in range(2):
            q = j * 3 + i
            faces.append((q, q + 1, q + 4, q + 3))
            faces.append((9 + q + 3, 9 + q + 4, 9 + q + 1, 9 + q))
    loop = (0, 1, 2, 5, 8, 7, 6, 3)
    for a, b in zip(loop, loop[1:] + loop[:1]):
        faces.append((a, b, 9 + b, 9 + a))
    mb.add((verts, faces), mat, smooth=0)


def build_torso(mats, root):
    mb = MeshBuilder('Torso')
    # envelope: gomos abaulados (24 faces por anel), cores alternadas por gomo
    rings = [env_ring(y, r) for (y, r) in ENV_PROFILE]
    mb.add(prim_rings(rings, cap0=False, cap1=True), 'hide', smooth=45, mat_fn=gore_mat)
    # faixa de guerra serrilhada em cor de time (um pouco acima da superfície; dentes no meio de cada gomo)
    def teeth(k):
        return -0.18 * max(0.0, 1.0 - abs((k % SEG) - SEG / 2) / (SEG / 2)) ** 1.0
    def teeth_top(k):
        return 0.18 * max(0.0, 1.0 - abs((k % SEG) - SEG / 2) / (SEG / 2)) ** 1.0
    band = [env_ring(3.30, env_r(3.30), 0.03, teeth), env_ring(3.55, env_r(3.55), 0.03), env_ring(3.85, env_r(3.85), 0.03),
            env_ring(4.05, env_r(4.05), 0.03, teeth_top)]
    mb.add(prim_rings(band, cap0=False, cap1=False), 'team', smooth=45)
    # remendos (couro de outra cor) em alguns gomos
    surface_patch(mb, 0, 4.25, 4.78, 'patch', spread=0.22)
    surface_patch(mb, 5, 2.55, 3.05, 'patch_red', spread=0.2)
    surface_patch(mb, 8, 4.5, 5.0, 'patch_red', spread=0.18)
    surface_patch(mb, 9, 2.95, 3.2, 'patch', spread=0.2)
    surface_patch(mb, 3, 4.35, 4.85, 'patch', spread=0.2)
    # costuras: tiras largas de couro escuro por cima de cada costura, com rebites a cada anel
    ys = [y for (y, r) in ENV_PROFILE[:-1]]
    for s in range(N_GORES):
        a = PHASE + s * 2 * math.pi / N_GORES
        radial = Vector((math.cos(a), 0, math.sin(a)))
        pts = []
        for y in ys:
            rr = env_r(y) * SEAM_K + (0.062 if 3.25 <= y <= 4.1 else 0.038)
            pts.append((math.cos(a) * rr, y, math.sin(a) * rr))
        rad = [(0.05, 0.016)] * len(pts)
        mb.add(prim_rings(limb_rings(pts, rad, 4, up=tuple(radial))), 'strap', smooth=0)
        for y in ys[1:-1:2]:
            rr = env_r(y) * SEAM_K + (0.075 if 3.25 <= y <= 4.1 else 0.052)
            mb.add(prim_sphere(0.026, 0.026, 0.02, 4, 2), 'iron', M((math.cos(a) * rr, y, math.sin(a) * rr)), smooth=0)
    # boca do envelope: aro de ferro e saia de couro escura evasada
    mb.add(prim_rings([ring_h(2.17, 0.27, 0.27, 12), ring_h(2.02, 0.36, 0.36, 12)], cap0=False, cap1=False), 'hide_dark', smooth=0)
    mb.add(prim_rings([ring_h(2.04, 0.375, 0.375, 12), ring_h(1.95, 0.4, 0.4, 12)], cap0=False, cap1=False), 'iron', smooth=30)
    # coroa: colar de ferro, ponteira e anel de espinhos de osso
    mb.add(prim_cyl(0.62, 0.5, 0.2, 12, base=True, cap0=False, cap1=False), 'iron', M((0, 5.0, 0)), smooth=30)
    mb.add(prim_cone(0.26, 0.66, 8), 'iron', M((0, 5.24, 0)), smooth=40)
    mb.add(prim_sphere(0.15, 0.15, 0.15, 7, 4), 'bone', M((0, 5.2, 0)), smooth=70)
    for k in range(6):
        a = 2 * math.pi * k / 6 + 0.3
        px, pz = math.cos(a) * 0.55, math.sin(a) * 0.55
        mb.add(prim_cone(0.07, 0.42, 5), 'bone', M((px, 4.98, pz), (28 * math.sin(a), 0, -28 * math.cos(a))), smooth=40)
    # crânio de presas no meio da faixa (frente, +Z): emblema de guerra; só a face frontal tem o rosto
    zb = env_r(3.65) + 0.0
    skull(mb, M((0, 3.66, zb - 0.1)), 0.62, 'bone')
    for sx in (-1, 1):
        O.tusk(mb, (sx * 0.2, 3.46, zb + 0.05), (sx * 0.62, 3.98, zb - 0.1), (sx * 0.16, 0.18, 0.1), r0=0.06)
    # braseiro suspenso na boca: bacia de ferro com brasas e chama
    mb.add(prim_sphere(0.34, 0.22, 0.34, 10, 4, y_max=0.0), 'iron', M((0, 1.72, 0)), smooth=45)
    mb.add(prim_cyl(0.36, 0.36, 0.04, 10), 'iron', M((0, 1.74, 0)), smooth=30)
    mb.add(prim_sphere(0.3, 0.08, 0.3, 8, 3, y_min=0.0), 'coal', M((0, 1.74, 0)), smooth=50)
    mb.add(prim_cone(0.22, 0.6, 7), 'ember', M((0, 1.76, 0)), smooth=40)
    mb.add(prim_cone(0.11, 0.42, 6), 'ember', M((0.12, 1.76, 0.06)), smooth=40)
    for k in range(3):
        a = 2 * math.pi * k / 3
        beam(mb, (math.cos(a) * 0.34, 1.8, math.sin(a) * 0.34), (math.cos(a) * 0.14, 2.14, math.sin(a) * 0.14), 0.028, 0.028, 'iron')
    # cordas de suspensão: cantos da cesta -> boca do envelope (cabos grossos)
    hw = 0.93
    for sx in (-1, 1):
        for sz in (-1, 1):
            beam(mb, (sx * hw, 1.1, sz * hw), (sx * 0.3, 2.12, sz * 0.3), 0.05, 0.05, 'rope')
    return mb.build(mats, parent=root, location=(0, 0, 0))


# ---------------------------------------------------------------- basket
def crewman(mb, x, z, y0, ry=0.0):
    """Tripulante de fundo (cabeça + ombros acima da borda): tronco de couro, cabeça verde, elmo com chifres de osso."""
    T = M((x, y0, z), (0, ry, 0))
    mb.add(prim_rings([ring_h(0.0, 0.22, 0.16, 10), ring_h(0.2, 0.28, 0.18, 10), ring_h(0.42, 0.28, 0.18, 10), ring_h(0.52, 0.15, 0.11, 10)]),
           'leather', T, smooth=60)
    mb.add(prim_sphere(0.17, 0.17, 0.17, 9, 5), 'skin', T @ M((0, 0.72, 0.03)), smooth=70)
    mb.add(prim_box(0.3, 0.05, 0.05), 'dark', T @ M((0, 0.76, 0.17)))
    for sx in (-1, 1):
        mb.add(prim_sphere(0.035, 0.03, 0.025, 6, 3), 'eye', T @ M((sx * 0.075, 0.72, 0.18)), smooth=70)
        mb.add(prim_cone(0.03, 0.2, 5), 'bone', T @ M((sx * 0.1, 0.55, 0.16), (-5, 0, 0)), smooth=40)
        mb.add(prim_cone(0.045, 0.3, 5), 'bone', T @ M((sx * 0.2, 0.87, 0.0), (0, 0, -sx * 55)), smooth=40)   # chifres do elmo
    mb.add(prim_sphere(0.185, 0.12, 0.185, 9, 4, y_min=0.0), 'iron', T @ M((0, 0.77, 0.0)), smooth=60)


def build_basket(mats, torso):
    mb = MeshBuilder('Basket')
    hw = 0.93
    t = 0.1
    # cesta de vime sobre armação de madeira (borda aberta no topo), piso, cintas de ferro e corrimão
    mb.add(prim_box(1.76, 0.12, 1.76), 'wood_dark', M((0, 0.3, 0)), bevel=0.02)
    for sz in (-1, 1):
        mb.add(prim_box(1.8, 0.8, t, base=True), 'wicker', M((0, 0.14, sz * (hw - t / 2 + 0.01))), bevel=0.01)
        mb.add(prim_box(t, 0.8, 1.7, base=True), 'wicker', M((sz * (hw - t / 2 + 0.01), 0.14, 0)), bevel=0.01)
    mb.add(prim_box(1.92, 0.09, 1.92), 'wood_dark', M((0, 0.1, 0)), bevel=0.02)
    for sz in (-1, 1):
        mb.add(prim_box(2.0, 0.11, 0.13), 'wood', M((0, 0.9, sz * hw)), bevel=0.02)
        mb.add(prim_box(0.13, 0.11, 2.0), 'wood', M((sz * hw, 0.9, 0)), bevel=0.02)
    for sx in (-1, 1):
        for sz in (-1, 1):
            mb.add(prim_box(0.13, 1.0, 0.13, base=True), 'wood_dark', M((sx * hw, 0.08, sz * hw)), bevel=0.014)
            mb.add(prim_sphere(0.09, 0.09, 0.09, 6, 3), 'iron', M((sx * hw, 1.1, sz * hw)), smooth=60)
    for y in (0.3, 0.62):
        mb.add(prim_box(1.84, 0.05, 1.84), 'iron', M((0, y, 0)))
    # faixa de time na cesta (frente e lados) e crânio de ogro na proa com presas
    mb.add(prim_box(1.66, 0.24, 0.04), 'team', M((0, 0.5, hw)), bevel=0.005)
    for sx in (-1, 1):
        mb.add(prim_box(0.04, 0.24, 1.6), 'team', M((sx * hw, 0.5, 0.0)), bevel=0.005)
    skull(mb, M((0, 0.42, hw + 0.04)), 0.42, 'bone')
    for sx in (-1, 1):
        mb.add(prim_cone(0.07, 0.55, 5), 'bone', M((sx * 0.85, 0.5, hw + 0.06), (-65, sx * 15, 0)), smooth=40)
    # sacos de lastro e barril de pólvora pendurados nas laterais; sacos e rolo de corda no piso
    for (x, z, s) in ((-1.12, 0.35, 1.2), (-1.14, -0.2, 1.0), (1.14, -0.3, 1.1)):
        mb.add(prim_sphere(0.17 * s, 0.2 * s, 0.16 * s, 8, 4), 'sack', M((x, 0.55, z)), smooth=70)
        mb.add(prim_cyl(0.06, 0.06, 0.06, 6), 'rope', M((x, 0.73, z)))
        beam(mb, (x * 0.9, 0.95, z), (x, 0.74, z), 0.025, 0.025, 'rope')
    mb.add(prim_rings([ring_h(0.0, 0.17, 0.17, 8), ring_h(0.18, 0.21, 0.21, 8), ring_h(0.36, 0.17, 0.17, 8)]), 'powder',
           M((1.12, 0.62, 0.45)), smooth=50)
    beam(mb, (1.02, 1.0, 0.45), (1.12, 0.98, 0.45), 0.025, 0.025, 'rope')
    mb.add(prim_cyl(0.2, 0.2, 0.1, 10), 'rope', M((0.55, 0.38, 0.45)), smooth=30)
    # bombas de pólvora com pavio, empilhadas no piso (à esquerda do vigia)
    for (x, y, z, s) in ((-0.55, 0.36, 0.42, 1.0), (-0.38, 0.35, 0.12, 0.9), (-0.62, 0.34, -0.05, 0.85), (-0.5, 0.52, 0.22, 0.8)):
        mb.add(prim_sphere(0.17 * s, 0.17 * s, 0.17 * s, 8, 4), 'powder', M((x, y + 0.17 * s, z)), smooth=70)
        beam(mb, (x, y + 0.34 * s, z), (x + 0.05, y + 0.46 * s, z + 0.02), 0.025, 0.025, 'rope')
        mb.add(prim_sphere(0.03, 0.03, 0.03, 4, 2), 'ember', M((x + 0.05, y + 0.48 * s, z + 0.02)), smooth=0)
    # segundo tripulante (atendente do braseiro) à popa, voltado para o centro
    crewman(mb, -0.45, -0.55, 0.38, 20)
    # estandarte esfarrapado de time pendurado na popa e leme em cor de time
    sw = [(-0.55, 0.0), (0.55, 0.0), (0.55, -1.2), (0.32, -0.9), (0.0, -1.3), (-0.32, -0.9), (-0.55, -1.15)]
    verts, faces = prim_extrude(sw, 0.03, axis='z')
    verts = [(x, y, z + 0.06 * math.sin(y * 7.0 + x * 3)) for (x, y, z) in verts]
    mb.add((verts, faces), 'team', M((0, 0.92, -hw - 0.07)), smooth=40)
    mb.add(prim_cyl(0.03, 0.03, 1.25, 5, base=False), 'bone', M((0, 0.95, -hw - 0.08), (0, 0, 90)))
    # suporte da hélice de popa: duas vigas e eixo; leme atrás da hélice
    for sx in (-1, 1):
        beam(mb, (sx * 0.45, 0.62, -0.85), (sx * 0.07, 0.5, -1.2), 0.08, 0.08, 'wood_dark', bevel=0.01)
    mb.add(prim_cyl(0.05, 0.05, 0.36, 6, base=False), 'iron', M((0, 0.5, -1.1), (90, 0, 0)))
    mb.add(prim_box(0.06, 0.72, 0.5, taper=(1.0, 0.5), base=True), 'wood_dark', M((0, 0.22, -1.62)), bevel=0.01)
    mb.add(prim_box(0.075, 0.24, 0.42, taper=(1.0, 0.55)), 'team', M((0, 0.62, -1.62)), bevel=0.005)
    beam(mb, (0, 0.4, -0.96), (0, 0.45, -1.5), 0.06, 0.06, 'wood_dark')
    beam(mb, (0, 0.3, -1.0), (0, 0.32, -1.5), 0.06, 0.06, 'wood_dark')
    # escada de corda pendurada no lado direito (+x)
    for dz in (-0.17, 0.17):
        beam(mb, (hw + 0.06, 0.95, 0.15 + dz), (hw + 0.1, -0.5, 0.15 + dz), 0.03, 0.03, 'rope')
    for k in range(5):
        y = 0.7 - k * 0.27
        mb.add(prim_box(0.05, 0.05, 0.4), 'wood_light', M((hw + 0.08 + 0.004 * (0.95 - y), y, 0.15)))
    # vigia: tronco, braços apoiados na borda, lenço de time e luneta de latão (a cabeça é o nó `Head`)
    sh = [ring_h(0.0, 0.2, 0.15, 10), ring_h(0.18, 0.26, 0.17, 10), ring_h(0.34, 0.27, 0.17, 10), ring_h(0.42, 0.14, 0.1, 10)]
    mb.add(prim_rings(sh), 'leather', M((0, 0.4, 0.5)), smooth=60)
    mb.add(prim_rings([ring_h(0.38, 0.17, 0.13, 10), ring_h(0.45, 0.2, 0.16, 10), ring_h(0.52, 0.12, 0.1, 10)]), 'team',
           M((0, 0.4, 0.51)), smooth=60)
    for sx in (-1, 1):
        tube(mb, [(sx * 0.27, 1.1, 0.52), (sx * 0.34, 1.04, 0.76), (sx * 0.22, 1.02, 0.95)], [0.07, 0.065, 0.06], 'skin', n=6, smooth=55)
        mb.add(prim_sphere(0.065, 0.055, 0.065, 6, 3), 'skin', M((sx * 0.22, 1.02, 0.97)), smooth=70)
        mb.add(prim_box(0.14, 0.06, 0.1), 'iron', M((sx * 0.27, 1.14, 0.52)), bevel=0.01)  # ombreira
    # luneta apoiada na mão direita do vigia, apontando para a frente e levemente para cima
    log(mb, (0.22, 1.05, 0.97), (0.26, 1.16, 1.62), 0.04, 'brass', n=6)
    log(mb, (0.255, 1.15, 1.5), (0.27, 1.18, 1.72), 0.055, 'iron', n=6)
    mb.add(prim_cyl(0.058, 0.058, 0.03, 6), 'brass', M((0.275, 1.19, 1.74), (80, 0, 0)))
    return mb.build(mats, parent=torso, location=(0, 0, 0))


def build_head(mats, torso):
    mb = MeshBuilder('Head')
    # cabeça de orc: pele verde lisa; rosto (olhos, sobrancelha, nariz, boca, presas) só na face +Z
    mb.add(prim_sphere(0.19, 0.19, 0.19, 10, 5), 'skin', M((0, 0, 0)), smooth=70)
    mb.add(prim_box(0.34, 0.2, 0.2, taper=(0.9, 0.9)), 'skin', M((0, -0.12, 0.08)), bevel=0.02, smooth=50)  # mandíbula
    mb.add(prim_box(0.34, 0.06, 0.06), 'dark', M((0, 0.05, 0.17), (0, 0, 0)), bevel=0.008)  # sobrancelha
    for sx in (-1, 1):
        mb.add(prim_sphere(0.04, 0.035, 0.03, 6, 3), 'eye', M((sx * 0.08, 0.02, 0.18)), smooth=70)
        mb.add(prim_sphere(0.017, 0.02, 0.02, 5, 3), 'ember', M((sx * 0.08, 0.02, 0.208)), smooth=70)
        mb.add(prim_cone(0.035, 0.22, 5), 'bone', M((sx * 0.11, -0.13, 0.2), (-5, 0, 0)), smooth=40)  # presas
        mb.add(prim_cone(0.05, 0.14, 4), 'skin', M((sx * 0.2, 0.03, -0.02), (0, 0, -sx * 80)), smooth=40)  # orelhas
    mb.add(prim_box(0.08, 0.1, 0.06, taper=(0.8, 0.8)), 'skin', M((0, -0.03, 0.2)), bevel=0.01)  # nariz
    mb.add(prim_box(0.2, 0.03, 0.03), 'dark', M((0, -0.115, 0.2)))  # boca
    # capacete de couro com aba, crista de osso e dois chifres curtos (cobre o topo e a nuca)
    mb.add(prim_sphere(0.205, 0.14, 0.205, 10, 4, y_min=0.0), 'leather_dark', M((0, 0.07, -0.01)), smooth=60)
    mb.add(prim_box(0.06, 0.1, 0.34), 'bone', M((0, 0.25, -0.02)), bevel=0.01)
    mb.add(prim_box(0.44, 0.045, 0.06), 'iron', M((0, 0.1, 0.14)))
    for sx in (-1, 1):
        mb.add(prim_cone(0.045, 0.28, 5), 'bone', M((sx * 0.2, 0.2, -0.02), (0, 0, -sx * 50)), smooth=40)
    return mb.build(mats, parent=torso, location=HEAD_PIVOT)


def build_rotor(mats, torso):
    mb = MeshBuilder('Rotor')
    # cubo de ferro com ponta de crânio e 4 pás de madeira/osso em cruz (plano XY; eixo em z)
    mb.add(prim_cyl(0.07, 0.07, 0.12, 8, base=False), 'iron', M((0, 0, 0), (90, 0, 0)), smooth=30)
    mb.add(prim_cone(0.06, 0.1, 6), 'bone', M((0, 0, -0.1), (-90, 0, 0)))
    for k in range(4):
        ang = 90 * k
        mat = 'wood_light' if k % 2 == 0 else 'bone'
        mb.add(prim_box(0.14, 0.62, 0.03, taper=(0.55, 1.0), base=True), mat,
               M(r=(0, 0, ang)) @ M((0, 0.07, 0.0), (0, 12, 0)), bevel=0.006)
        mb.add(prim_box(0.15, 0.06, 0.04), 'iron', M(r=(0, 0, ang)) @ M((0, 0.62, 0.0)))
    return mb.build(mats, parent=torso, location=ROTOR_PIVOT)


def main():
    args = C.script_args()
    C.reset_scene()
    mats = C.make_paint_set(PALETTE)
    root = C.make_empty('WarBalloon')
    torso = build_torso(mats, root)
    basket = build_basket(mats, torso)
    head = build_head(mats, torso)
    rotor = build_rotor(mats, torso)
    parts = [torso, basket, head, rotor]
    # Smart UV a 66°: o envelope (gomos com diedro pequeno) vira poucas ilhas grandes em vez de dezenas de pedaços
    _uv = C.uv_atlas
    C.uv_atlas = lambda objs, weights=None, margin=0.006, angle=60.0: _uv(objs, weights, margin, 66.0)
    A.finish_air('war_balloon', 'war_balloon.glb', 'war_balloon_atlas', root, parts,
                 {'Torso': 0.9, 'Basket': 1.45, 'Head': 1.4, 'Rotor': 0.7}, TEAM_DEFAULT, args, game_dist=26.0)
    print('BBOX', bbox_game(root))


if __name__ == '__main__':
    main()
