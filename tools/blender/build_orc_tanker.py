"""
build_orc_tanker.py — Coletor de Petróleo orc (raiz `OrcTanker`) gerado 100% por script; mesma hierarquia/pivôs do
`build_tanker.py` humano para o animador reaproveitar.

Referência: docs/refs/naval/orc_ships_ref.png ("Orcish Oil Tanker"): casco de chapas de ferro enferrujado com rebites
grossos e argolas de ferro, convés de tábuas, três tanques de cobre com cintas de ferro, cúpulas e volantes,
tubulação de cobre com flanges, caldeiras verticais, chaminé de cobre com faixa de time e boca fuliginosa, cabine de
ferro com seteiras e espetos, guindaste de proa com balde pendurado, mastro de crânio com bandeira.

Cor de time (`TeamColor`): faixa do casco, faixa da chaminé e bandeira.

Uso:
  blender -b --factory-startup --python tools/blender/build_orc_tanker.py -- [--no-render]

Hierarquia (proa = +Z, y = 0 na linha d'água, casco ~7,5 u):
  OrcTanker (raiz)
  ├─ Hull        casco, convés, tanques, tubulação, cabine, chaminé, antena (Atlas + TeamColor)
  ├─ Hose        mangueira de carga (pivô na válvula de proa; o jogo pode escondê-la/estendê-la)
  ├─ Flag        bandeirola da antena (TeamColor)
  └─ Anim_Smoke  empty no topo da chaminé
"""
import os
import sys
import math

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
from mathutils import Matrix  # noqa: E402
import common as C  # noqa: E402
from common import M, MeshBuilder, prim_box, prim_cyl, prim_cone, prim_sphere, prim_extrude, prim_rings, ring_h, bezier  # noqa: E402
import ship_common as SH  # noqa: E402
from ship_common import V, Hull, beam, tube, orient, rect_tube, stud, cask, rope_coil, capsule, smooth_path  # noqa: E402

TEAM_DEFAULT = '#b8261c'
PALETTE = dict(SH.PALETTE)
PALETTE.update(
    copper=dict(base='#8c4723', var='#3f7a62', var_scale=3.0, var_amt=0.55, fine=0.14, top=0.4, edge='#f2b27a',
                edge_amt=0.8, edge_r=0.025, edge_gain=10.0, ao=(0.35, 0.65), streaks=(1.2, 3.0, 0.2), grad=(-0.6, 1.9, 0.3)),
    rust=dict(base='#8a3a1b', var='#2a1913', var_scale=3.2, var_amt=0.8, fine=0.16, top=0.25, pattern='bricks',
              mapping='box', pw=1.5, ph=0.75, mortar='#241008', mortar_size=0.016, brick_dark=0.85, brick_lite=1.05,
              brick_tint_amt=0.5, brick_tint='#5a2210', edge='#c8703c', edge_amt=0.55, edge_r=0.02, edge_gain=10.0,
              ao=(0.35, 0.75), grad=(-0.6, 1.9, 0.35)),
    copper_dark=dict(base='#7d3f1f', var='#3a2a1c', var_scale=4.0, var_amt=0.6, fine=0.14, top=0.3, edge='#d58a55',
                     edge_amt=0.7, edge_r=0.02, edge_gain=10.0, ao=(0.35, 0.65)),
    bone=dict(base='#e9dfc2', var='#b8a982', var_scale=6.0, var_amt=0.7, fine=0.1, top=0.4, edge='#fffaf0',
              edge_amt=0.8, edge_r=0.02, edge_gain=10.0, ao=(0.3, 0.6)),
    hose=dict(base='#2a2420', var='#4b3a2c', var_scale=6.0, fine=0.12, top=0.3, edge='#7a6650', edge_amt=0.5,
              edge_r=0.02, ao=(0.3, 0.6)),
    wood_deck=dict(base='#8a5428', var='#4a2c15', var_scale=2.0, var_amt=0.8, fine=0.12, top=0.3, pattern='planks_v',
                   mapping='box', pw=1.5, ph=0.2, mortar='#1e1008', mortar_size=0.022, edge='#c99560', edge_amt=0.35,
                   edge_r=0.02, ao=(0.4, 0.6)),
)

L = 7.5
DECK = 0.86
HULL = dict(
    hw=[(0, 1.2), (0.05, 1.38), (0.18, 1.52), (0.55, 1.56), (0.78, 1.46), (0.9, 1.15), (0.965, 0.72), (1.0, 0.2)],
    yk=[(0, -0.38), (0.12, -0.5), (0.8, -0.5), (1.0, 0.05)],
    yg=[(0, 1.3), (0.2, 1.08), (0.6, 1.08), (0.85, 1.18), (1.0, 1.66)],
    bul=[(0, 0.3), (1, 0.3)],
)
PROF = [(1.0, 1.0), (1.01, 0.9), (1.03, 0.62), (1.02, 0.4), (1.0, 0.33), (0.9, 0.22), (0.62, 0.1), (0.0, 0.0)]
SEGS = ['rust_black', 'rust', 'rust', 'team', 'rust_black', 'rust_black', 'rust_black']

TANKS = [(-0.97, 0.45, 3.1), (0.0, -0.45, 3.4), (0.97, 0.3, 3.0)]   # (x, z do centro, comprimento)
TANK_R = 0.5
TANK_Y = DECK + 0.14 + TANK_R
HOSE_P = (0.55, DECK + 0.38, 2.75)


def make_hull():
    return Hull(L, 0.0, HULL['hw'], HULL['yk'], HULL['yg'], HULL['bul'], PROF, SEGS, n=26, t=0.14, deck='wood_deck',
                inner='wood_dark', rail='rust_black', cap='rust_black', bottom='rust_black', flat_deck=DECK)


def build_hull(mats, root):
    mb = MeshBuilder('Hull')
    h = make_hull()
    h.build(mb)
    z0, z1 = h.z0, h.z1
    h.rail_cap(mb, 'rust_black', 0.26, 0.1, za=z0 + 0.03, zb=z1 - 0.05, bevel=0.02)
    # costelas verticais (reforços), faixa de cintas e remendos de chapa
    for z in [-3.3 + 0.82 * k for k in range(9)]:
        for sg in (-1, 1):
            a, b = h.P(z, 0.92, sg), h.P(z, 0.36, sg)
            n = h.N(z, 0.6, sg)
            beam(mb, tuple(a + n * 0.012), tuple(b + n * 0.012), 0.07, 0.025, 'rust_black', bevel=0.005)
    patches = [(-2.9, 0.78, 0.5, 0.3), (-1.7, 0.55, 0.42, 0.28), (-0.5, 0.8, 0.55, 0.3), (0.8, 0.6, 0.45, 0.3),
               (1.9, 0.75, 0.5, 0.32), (2.9, 0.62, 0.4, 0.26), (-2.2, 0.72, 0.4, 0.26), (0.2, 0.52, 0.5, 0.26)]
    for i, (z, tf, w, ht) in enumerate(patches):
        for sg in (-1, 1):
            zz = z + (0.35 if sg < 0 else 0.0)
            p, n = h.P(zz, tf, sg), h.N(zz, tf, sg)
            m = SH.frame_at(p + n * 0.01, n)
            mb.add(prim_box(w, ht, 0.06), 'rust' if (i + (sg > 0)) % 2 else 'rust_black', m, bevel=0.012)
            for dx in (-1, 1):
                for dy in (-1, 1):
                    stud(mb, p + n * 0.03 + m.to_3x3() @ V((dx * w * 0.42, dy * ht * 0.38, 0)), n, 0.032, 'iron')
    h.studs(mb, 0.9, z0 + 0.3, z1 - 0.4, 0.36, 'iron', r=0.034)
    h.studs(mb, 0.4, z0 + 0.3, z1 - 0.6, 0.45, 'iron', r=0.034)
    # anéis de amarração/defensa e tubo de bordo
    for z in (-2.5, -1.2, 0.1, 1.4, 2.6):
        for sg in (-1, 1):
            p, n = h.P(z, 0.62, sg), h.N(z, 0.62, sg)
            m = SH.frame_at(p + n * 0.02, n)
            mb.add(SH.torus(0.17, 0.05, 12, 5), 'iron', m @ M((0, 0, 0.06), (90, 0, 0)), smooth=60)
            mb.add(prim_box(0.2, 0.08, 0.08), 'iron', m @ M((0, 0.21, 0.0)), bevel=0.01)
            mb.add(prim_box(0.34, 0.34, 0.03), 'rust_black', m @ M((0, 0.0, 0.0)), bevel=0.008)
    # canos de cobre pendurados no costado de bombordo, com cotovelo e boca na água
    for z in (-1.9, -0.6):
        pp = []
        for tf in (1.02, 0.97, 0.85, 0.7, 0.5, 0.3, 0.14):
            q = h.P(z, tf, -1) + h.N(z, tf, -1) * 0.14
            pp.append(tuple(q))
        q = h.P(z, 0.12, -1) + h.N(z, 0.12, -1) * 0.3
        pp.append(tuple(q))
        pp = smooth_path(pp, 3)
        tube(mb, pp, [0.09] * len(pp), 'copper_dark', n=8, smooth=60)
        for q in (0.35, 0.7):
            i = int(q * (len(pp) - 1))
            mb.add(prim_cyl(0.13, 0.13, 0.07, 8, base=False), 'iron', Matrix.Translation(V(pp[i])) @ orient(V(pp[i + 1]) - V(pp[i])), smooth=30)
    # espetos de ferro e presas de marfim na amurada (toque orc)
    for z in (-3.1, -2.0, -0.9, 0.2, 1.3, 2.4):
        for sg in (-1, 1):
            p = V((sg * (h.hw(z) - 0.05), h.top(z) + 0.1, z))
            mb.add(prim_cone(0.07, 0.34, 5), 'iron', Matrix.Translation(p) @ orient((sg * 0.35, 1, 0)), smooth=30)
    for sg in (-1, 1):
        p = V((sg * 0.2, h.top(z1 - 0.1) + 0.05, z1 - 0.12))
        mb.add(prim_cone(0.09, 0.5, 5), 'bone', Matrix.Translation(p) @ orient((sg * 0.5, 1, 0.4)), smooth=30)

    for sg in (-1, 1):   # escúbios das âncoras
        p, n = h.P(3.1, 0.8, sg), h.N(3.1, 0.8, sg)
        m = SH.frame_at(p + n * 0.01, n)
        mb.add(prim_cyl(0.11, 0.11, 0.1, 10, base=False), 'steel_dark', m @ M(r=(90, 0, 0)), smooth=40)
        mb.add(prim_cyl(0.07, 0.07, 0.11, 10, base=False), 'dark', m @ M((0, 0, 0.01), (90, 0, 0)))
        mb.add(SH.torus(0.13, 0.03, 10, 4), 'steel', m @ M((0, 0, 0.05), (90, 0, 0)), smooth=60)
    # proa: cabrestante com corrente e bitas
    wz = 2.95
    SH.S.add_cyl_x(mb, 0.15, 0.7, 'steel_dark', (0, DECK + 0.3, wz), n=10, bevel=0.01)
    for sg in (-1, 1):
        mb.add(prim_box(0.12, 0.4, 0.3), 'iron', M((sg * 0.4, DECK + 0.2, wz)), bevel=0.012)
        SH.S.add_cyl_x(mb, 0.19, 0.06, 'steel', (sg * 0.35, DECK + 0.3, wz), n=10)
    SH.S.chain(mb, (0.0, DECK + 0.3, wz + 0.15), (0.0, DECK + 0.1, wz + 0.6), links=6, r=0.04)
    mb.add(prim_box(0.3, 0.05, 0.14), 'rust_black', M((0.0, DECK + 0.025, wz + 0.2)))
    for (x, z) in ((0.75, 3.3), (-0.75, 3.3), (1.15, -3.0), (-1.15, -3.0), (1.2, 0.5), (-1.2, 0.5)):
        mb.add(prim_cyl(0.085, 0.07, 0.22, 8, base=True), 'steel_dark', M((x, DECK, z)), smooth=40, bevel=0.01)
        mb.add(prim_cyl(0.13, 0.13, 0.04, 8, base=True), 'steel_dark', M((x, DECK + 0.22, z)), smooth=40)
    rope_coil(mb, M((-0.7, DECK + 0.02, 3.3)), 0.2, 0.045, 3, mat='rope')
    # --- guindaste de ferro (bombordo, proa) com lança e balde pendurado
    cx, cz_ = -0.78, 2.5
    mb.add(prim_box(0.46, 0.34, 0.5), 'rust_black', M((cx, DECK + 0.17, cz_)), bevel=0.02)
    mb.add(prim_cyl(0.2, 0.2, 0.9, 10, base=True), 'iron', M((cx, DECK + 0.3, cz_)), smooth=40, bevel=0.01)
    mb.add(prim_cyl(0.26, 0.26, 0.07, 10, base=True), 'copper_dark', M((cx, DECK + 0.3, cz_)), smooth=30)
    mb.add(prim_cyl(0.26, 0.26, 0.07, 10, base=True), 'copper_dark', M((cx, DECK + 1.15, cz_)), smooth=30)
    boom_a, boom_b = V((cx, DECK + 1.0, cz_)), V((cx - 1.5, DECK + 1.75, cz_))
    beam(mb, tuple(boom_a), tuple(boom_b), 0.12, 0.12, 'copper_dark', bevel=0.01)
    beam(mb, tuple(boom_a + V((0, 0.0, 0.17))), tuple(boom_b + V((0, 0, 0.0))), 0.05, 0.05, 'iron')
    beam(mb, tuple(boom_a + V((0, 0.0, -0.17))), tuple(boom_b + V((0, 0, 0.0))), 0.05, 0.05, 'iron')
    beam(mb, tuple(V((cx, DECK + 1.15, cz_))), tuple(boom_b + V((0, 0.05, 0))), 0.05, 0.05, 'iron')
    mb.add(prim_cyl(0.09, 0.09, 0.2, 8, base=False), 'iron', M(tuple(boom_b), (90, 0, 90)), smooth=30)
    SH.S.chain(mb, tuple(boom_b + V((0, -0.05, 0))), (boom_b.x, DECK + 0.62, cz_), links=6, r=0.04)
    bk = V((boom_b.x, DECK + 0.38, cz_))
    mb.add(prim_box(0.44, 0.3, 0.44, taper=(1.0, 0.75)), 'rust_black', Matrix.Translation(bk), bevel=0.02)
    for sg in (-1, 1):
        mb.add(prim_box(0.03, 0.04, 0.46), 'iron', Matrix.Translation(bk + V((sg * 0.2, 0.13, 0))))
        mb.add(prim_box(0.46, 0.04, 0.03), 'iron', Matrix.Translation(bk + V((0, 0.13, sg * 0.2))))
    mb.add(SH.torus(0.13, 0.025, 10, 4), 'iron', Matrix.Translation(bk + V((0, 0.3, 0))), smooth=60)
    # --- tanques: 3 cápsulas com cintas, selas, cúpulas com válvulas e portinholas
    domes = []
    for k, (x, zc, ln) in enumerate(TANKS):
        capsule(mb, (x, TANK_Y, zc), ln, TANK_R, 'copper', n=14, ends=4)
        for t in (-0.36, -0.1, 0.16, 0.42):
            z = zc + ln * t
            mb.add(prim_cyl(TANK_R * 1.05, TANK_R * 1.05, 0.12, 14, base=False), 'iron',
                   M((x, TANK_Y, z), (90, 0, 0)), smooth=30, bevel=0.01)
            for sg in (-1, 1):
                stud(mb, V((x + sg * TANK_R * 1.04, TANK_Y + 0.0, z)), (sg, 0, 0), 0.026, 'steel_hi')
        for t in (-0.3, 0.3):    # selas de aço
            z = zc + ln * t
            mb.add(prim_box(TANK_R * 1.3, 0.14, 0.2, taper=(1.0, 1.0)), 'steel_dark', M((x, DECK + 0.07, z)), bevel=0.012)
            for sg in (-1, 1):
                mb.add(prim_box(0.04, 0.2, 0.2), 'steel_dark', M((x + sg * TANK_R * 0.62, DECK + 0.22, z), (0, 0, sg * 20)), bevel=0.008)
        # cúpula (boca de visita) + volante de válvula
        dz = zc + ln * 0.05
        mb.add(prim_cyl(0.15, 0.15, 0.12, 10, base=True), 'steel', M((x, TANK_Y + TANK_R - 0.02, dz)), smooth=40, bevel=0.01)
        mb.add(prim_cyl(0.065, 0.065, 0.14, 8, base=True), 'steel_dark', M((x, TANK_Y + TANK_R + 0.1, dz)), smooth=40)
        wheel = 'red' if k != 1 else 'bone'
        mb.add(SH.torus(0.11, 0.025, 10, 5), wheel, M((x, TANK_Y + TANK_R + 0.27, dz)), smooth=60)
        mb.add(prim_box(0.22, 0.03, 0.03), wheel, M((x, TANK_Y + TANK_R + 0.27, dz)))
        mb.add(prim_box(0.03, 0.03, 0.22), wheel, M((x, TANK_Y + TANK_R + 0.27, dz)))
        domes.append((x, TANK_Y + TANK_R + 0.17, dz))
        # portinholas de inspeção na lateral
        for sg in (-1, 1):
            if (k == 0 and sg == -1) or (k == 2 and sg == 1) or k == 1:
                zz = zc - ln * 0.2
                p = V((x + sg * TANK_R * 0.96, TANK_Y + 0.18, zz))
                mb.add(prim_cyl(0.11, 0.11, 0.05, 10, base=False), 'steel', M(tuple(p), (0, 0, 90)), smooth=30)
    # rótulo de perigo (losango) no tanque de boreste
    mb.add(prim_extrude([(0, 0.19), (0.19, 0), (0, -0.19), (-0.19, 0)], 0.03, axis='x'), 'steel_dark',
           M((TANKS[2][0] + TANK_R * 0.99, TANK_Y + 0.05, TANKS[2][1] + 0.75)), bevel=0.005)
    mb.add(prim_extrude([(0, 0.15), (0.15, 0), (0, -0.15), (-0.15, 0)], 0.04, axis='x'), 'bone',
           M((TANKS[2][0] + TANK_R * 1.0, TANK_Y + 0.05, TANKS[2][1] + 0.75)), bevel=0.004)
    mb.add(prim_extrude([(0, 0.07), (0.05, 0), (0, -0.07), (-0.05, 0)], 0.045, axis='x'), 'dark',
           M((TANKS[2][0] + TANK_R * 1.0, TANK_Y + 0.05, TANKS[2][1] + 0.75)))
    # tubulação: coletor transversal sobre os tanques com subidas até as cúpulas, flanges e cotovelos
    hy = TANK_Y + TANK_R + 0.52
    hz = -0.2
    path = [(domes[0][0], domes[0][1], domes[0][2]), (domes[0][0], hy, domes[0][2]), (domes[0][0] + 0.25, hy, hz),
            (0.0, hy, hz), (0.0, hy, hz), (domes[2][0] - 0.25, hy, hz), (domes[2][0], hy, domes[2][2]),
            (domes[2][0], domes[2][1], domes[2][2])]
    tube(mb, smooth_path(path, 3), [0.075] * len(smooth_path(path, 3)), 'copper_dark', n=8, smooth=60)
    for (x, z) in ((-0.55, hz), (0.55, hz), (domes[0][0], hy - 0.15), (domes[2][0], hy - 0.15)):
        pass
    for x in (-0.6, -0.15, 0.15, 0.6):
        d = V((1, 0, 0))
        mb.add(prim_cyl(0.11, 0.11, 0.06, 8, base=False), 'iron', M((x, hy, hz), (0, 0, 90)), smooth=30)
    # subida do tanque central ligada ao coletor
    tube(mb, [(0.0, TANK_Y + TANK_R + 0.1, TANKS[1][1] + 0.1), (0.0, hy - 0.12, TANKS[1][1] + 0.1), (0.0, hy, hz)],
         [0.07] * 3, 'copper_dark', n=8, smooth=60)
    # tubo diagonal longo do coletor até a válvula de proa (tubulação de carga)
    pp = smooth_path([(0.0, hy, hz), (0.0, hy, 1.0), (0.4, hy - 0.6, 2.0), (HOSE_P[0], HOSE_P[1] + 0.25, HOSE_P[2] - 0.2),
                      (HOSE_P[0], HOSE_P[1], HOSE_P[2])], 3)
    tube(mb, pp, [0.09] * len(pp), 'copper_dark', n=8, smooth=60)
    for t in (0.3, 0.6, 0.85):
        i = int(t * (len(pp) - 1))
        d = V(pp[i + 1]) - V(pp[i])
        mb.add(prim_cyl(0.13, 0.13, 0.07, 8, base=False), 'iron', Matrix.Translation(V(pp[i])) @ orient(d), smooth=30)
    # válvula de proa (flange de ligação da mangueira)
    mb.add(prim_cyl(0.14, 0.14, 0.4, 10, base=True), 'steel', M((HOSE_P[0], DECK, HOSE_P[2])), smooth=40, bevel=0.01)
    mb.add(prim_cyl(0.19, 0.19, 0.05, 10, base=True), 'steel_dark', M((HOSE_P[0], DECK + 0.34, HOSE_P[2])), smooth=30)
    # --- cabine de popa: base creme-enferrujada, passadiço, janelas, porta, antena em cruz, chaminé
    cz0, cz1 = -3.4, -1.95
    base_h = 0.78
    mb.add(prim_box(1.95, base_h, cz1 - cz0, taper=(0.98, 0.98)), 'rust_black', M((0.0, DECK + base_h / 2, (cz0 + cz1) / 2)), bevel=0.03)
    mb.add(prim_box(2.04, 0.07, cz1 - cz0 + 0.08), 'rust', M((0.0, DECK + base_h + 0.03, (cz0 + cz1) / 2)), bevel=0.012)
    mb.add(prim_box(2.0, 0.06, cz1 - cz0 + 0.04), 'rust_black', M((0.0, DECK + 0.03, (cz0 + cz1) / 2)), bevel=0.008)
    for sg in (-1, 1):
        for z in (-3.1, -2.7, -2.3):
            SH.window(mb, M((sg * 0.98, DECK + 0.46, z), (0, sg * 90, 0)), 0.14, 0.16, frame='iron', glass='dark')
    for dx in (-0.55, 0.0, 0.55):
        SH.window(mb, M((dx, DECK + 0.46, cz1 + 0.005)), 0.2, 0.17, frame='iron', glass='dark')
    # porta lateral de ferro com escada
    mb.add(prim_box(0.06, 0.52, 0.3), 'rust', M((0.985, DECK + 0.26, -2.5)), bevel=0.01)
    mb.add(prim_box(0.06, 0.3, 0.1), 'steel_dark', M((0.99, DECK + 0.38, -2.5)))
    SH.stairs(mb, (1.05, DECK + 0.02, -2.0), (1.05, DECK + 0.62, -2.35), 0.3, 5, mat='steel_dark', stringer='steel_dark')
    # passadiço superior
    by = DECK + base_h + 0.07
    mb.add(prim_box(1.5, 0.62, 1.05, taper=(0.95, 0.9)), 'wood_dark', M((0.0, by + 0.31, -2.85)), bevel=0.03)
    mb.add(prim_box(1.62, 0.08, 1.17), 'rust', M((0.0, by + 0.66, -2.85)), bevel=0.015)
    mb.add(prim_box(1.4, 0.06, 0.95), 'steel_dark', M((0.0, by + 0.72, -2.85)), bevel=0.01)
    for dx in (-0.45, -0.15, 0.15, 0.45):
        SH.window(mb, M((dx, by + 0.34, -2.85 + 0.53)), 0.17, 0.2, frame='iron', glass='dark')
    for sg in (-1, 1):
        for dz in (-0.25, 0.1, 0.4):
            SH.window(mb, M((sg * 0.74, by + 0.34, -2.85 + dz), (0, sg * 90, 0)), 0.14, 0.2, frame='iron', glass='dark')
    # mastro de bandeira de ferro e madeira com crânio de presas e cordas
    ax = V((0.0, by + 0.74, -2.55))
    beam(mb, tuple(ax), tuple(ax + V((0, 1.7, 0))), 0.07, 0.07, 'wood_dark', bevel=0.01)
    for t in (0.2, 0.55, 0.85):
        mb.add(prim_cyl(0.075, 0.075, 0.08, 8, base=False), 'iron', M(tuple(ax + V((0, 1.7 * t, 0)))), smooth=30)
    mb.add(prim_cone(0.07, 0.3, 6), 'iron', M(tuple(ax + V((0, 1.7, 0)))), smooth=30)
    sk = ax + V((0, 1.5, 0.0))
    mb.add(prim_sphere(0.12, 0.1, 0.11, 8, 5), 'bone', M(tuple(sk + V((0, 0, 0.1)))), smooth=60)
    mb.add(prim_box(0.14, 0.06, 0.1), 'bone', M(tuple(sk + V((0, -0.1, 0.12)))), bevel=0.01)
    for dx in (-0.05, 0.05):
        mb.add(prim_sphere(0.032, 0.036, 0.03, 5, 3), 'dark', M(tuple(sk + V((dx, 0.01, 0.2)))))
    for sg in (-1, 1):
        mb.add(prim_cone(0.03, 0.2, 5), 'bone', Matrix.Translation(sk + V((sg * 0.07, -0.12, 0.15))) @ orient((sg * 0.2, -1, 0.5)), smooth=30)
    for (dx, dz) in ((-0.62, 0.3), (0.62, 0.3), (-0.62, -0.3), (0.62, -0.3)):
        beam(mb, tuple(ax + V((0, 1.2, 0))), tuple(ax + V((dx, 0.0, dz))), 0.014, 0.014, 'rope')
    mb.add(prim_box(0.34, 0.04, 0.1), 'iron', M(tuple(ax + V((0.0, 0.5, 0.0)))))
    # chaminé: vermelho-ferrugem com faixa de time, boca preta, escora
    fx, fz_ = 0.52, -3.0
    SH.funnel(mb, V((fx, DECK + base_h + 0.07 + 0.62, fz_)), 0.34, 1.0, 'copper', 'team', 'dark', 'iron', n=14,
              band=(0.42, 0.62), taper=0.9)
    mb.add(prim_cyl(0.37, 0.37, 0.08, 14, base=True), 'iron', M((fx, DECK + base_h + 0.07 + 0.62, fz_)), smooth=30)
    for sg in (-1, 1):
        beam(mb, (fx + sg * 0.25, by + 0.75, fz_), (fx + sg * 0.42, by + 0.66, fz_ - 0.2), 0.035, 0.035, 'steel_dark')
    # tubos de exaustão laterais (curvos) + tubo alto cinza à direita
    for k, dx in enumerate((-0.62, -0.38, -0.14)):
        pts = smooth_path([(dx, by + 0.6, -3.15), (dx, by + 0.9, -3.15), (dx - 0.0, by + 1.05, -2.98), (dx, by + 1.0, -2.8)], 3)
        tube(mb, pts, [0.06] * len(pts), 'steel_dark', n=7, smooth=60)
    ep = smooth_path([(1.3, DECK + 0.5, -3.3), (1.3, DECK + 1.5, -3.3), (1.15, DECK + 1.9, -3.3), (0.9, DECK + 1.95, -3.3)], 3)
    tube(mb, ep, [0.09] * len(ep), 'steel', n=8, smooth=60)
    mb.add(prim_cyl(0.13, 0.13, 0.05, 8, base=False), 'steel_dark', M((1.3, DECK + 1.0, -3.3), (0, 0, 0)), smooth=30)
    for sx in (-1, 1):
        for sz in (-1, 1):
            mb.add(prim_cone(0.07, 0.4, 5), 'iron', M((sx * 0.78, by + 0.7, -2.85 + sz * 0.5), (sz * 12, 0, -sx * 12)), smooth=30)
    # caldeiras verticais de cobre ao lado da cabine (bombordo, popa) com cúpula e válvula
    for (x, z, hh) in ((-0.62, -1.72, 0.9), (0.15, -1.72, 0.75)):
        mb.add(prim_cyl(0.26, 0.26, hh, 12, base=True), 'copper', M((x, DECK, z)), smooth=55, bevel=0.01)
        mb.add(prim_sphere(0.26, 0.2, 0.26, 10, 4, y_min=0.0), 'copper', M((x, DECK + hh, z)), smooth=60)
        for t in (0.15, 0.5, 0.85):
            mb.add(prim_cyl(0.285, 0.285, 0.07, 12, base=False), 'iron', M((x, DECK + hh * t, z)), smooth=30)
        mb.add(prim_cyl(0.06, 0.06, 0.2, 8, base=True), 'iron', M((x, DECK + hh + 0.16, z)), smooth=40)
        mb.add(SH.torus(0.08, 0.02, 8, 4), 'red', M((x, DECK + hh + 0.4, z)), smooth=60)
    # lanterna, balde, escada de mão no convés de popa
    mb.add(prim_box(0.7, 0.05, 0.05), 'steel_dark', M((0.0, DECK + 0.45, cz1 + 0.15)))
    for dx in (-0.35, 0.35):
        mb.add(prim_box(0.05, 0.45, 0.05), 'steel_dark', M((dx, DECK + 0.22, cz1 + 0.15)))
    return mb.build(mats, parent=root)


def build_hose(mats, root):
    """Mangueira oliva grossa: da válvula de proa, por cima da borda de boreste, caindo até a água (anéis de reforço)."""
    mb = MeshBuilder('Hose')
    # pontos relativos ao pivô (válvula de proa)
    P0 = V(HOSE_P)
    abs_pts = [HOSE_P, (HOSE_P[0] + 0.25, DECK + 0.62, HOSE_P[2] - 0.05), (0.95, DECK + 0.55, 2.55), (1.45, 1.02, 2.3),
               (1.78, 0.95, 2.0), (1.92, 0.55, 1.8), (2.0, 0.12, 1.6), (2.1, 0.0, 1.2), (2.05, -0.02, 0.6), (1.85, -0.02, 0.2)]
    pts = [tuple(V(p) - P0) for p in smooth_path(abs_pts, 4)]
    tube(mb, pts, [0.105] * len(pts), 'hose', n=8, smooth=60, cap=True)
    # anéis de reforço ao longo da mangueira
    for i in range(2, len(pts) - 2, 3):
        d = V(pts[i + 1]) - V(pts[i - 1])
        mb.add(prim_cyl(0.125, 0.125, 0.045, 8, base=False), 'rust_black', Matrix.Translation(V(pts[i])) @ orient(d), smooth=30)
    # união/bocal na ponta (flange de aço) e na válvula
    d = V(pts[-1]) - V(pts[-2])
    mb.add(prim_cyl(0.15, 0.15, 0.1, 8, base=False), 'steel_dark', Matrix.Translation(V(pts[-1])) @ orient(d), smooth=30)
    mb.add(prim_cyl(0.12, 0.12, 0.2, 8, base=False), 'steel', Matrix.Translation(V(pts[0]) + V((0, 0.05, 0))) @ orient((0, 1, 0)), smooth=30)
    return mb.build(mats, parent=root, location=HOSE_P)


def build_flag(mats, root):
    mb = MeshBuilder('Flag')
    X = SH.S.Xf(mb, M((0, 0, 0), (0, 90, 0)))
    SH.flag(X, 0.95, 0.4, 'team', 'iron', False, amp=0.06, fx=3.5, ph=0.8, tail=0.4)
    return mb.build(mats, parent=root, location=(0.0, DECK + 0.85 + 0.69 + 0.07 + 1.68 - 0.1, -2.55))


def main():
    args = C.script_args()
    C.reset_scene()
    mats = C.make_paint_set(PALETTE)
    root = C.make_empty('OrcTanker')
    hull = build_hull(mats, root)
    hose = build_hose(mats, root)
    flag = build_flag(mats, root)
    fy = DECK + 0.78 + 0.07 + 0.62 + 1.0
    C.make_empty('Anim_Smoke', (0.52, fy + 0.08, -3.0), parent=root)
    parts = [hull, hose, flag]
    SH.finish_ship('orc_tanker', 'orc_tanker.glb', 'orc_tanker_atlas', root, parts,
                   {'Hull': 1.0, 'Hose': 0.5, 'Flag': 0.4},
                   TEAM_DEFAULT, args, tex=int(os.environ.get('ATLAS', 512)), ground_hex='#1a3a4a', game_dist=19.0)


if __name__ == '__main__':
    main()
