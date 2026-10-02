"""
build_tanker.py — Petroleiro (tipo interno `tanker`, raiz `Tanker`; compartilhado pelas duas facções) gerado 100%
por script.

Referência: docs/refs/naval/human_ships_ref.png ("Human Oil Tanker"): casco de chapas rebitadas laranja-ferrugem
com manchas de fuligem e linha d'água preta, proa alta com cabrestante e correntes, três tanques cilíndricos
laranja com cintas de aço, escotilhas, rótulo de perigo, válvulas (volantes vermelho/azul) e tubulação com flanges,
mangueira grossa oliva pendurada pela borda, cabine de popa com janelas, antena em cruz com estais, chaminé
vermelha com faixa e tubos de escape.

Cor de time (`TeamColor`): faixa do casco, faixa da chaminé e bandeirola da antena (padrão azul; recolorido por
jogador pelo jogo), então serve para Humanos e Orcs.

Uso:
  blender -b --factory-startup --python tools/blender/build_tanker.py -- [--no-render]

Hierarquia (proa = +Z, y = 0 na linha d'água, casco ~7,5 u):
  Tanker (raiz)
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

TEAM_DEFAULT = '#2d56c0'
PALETTE = dict(SH.PALETTE)

L = 7.5
DECK = 0.86
HULL = dict(
    hw=[(0, 1.2), (0.05, 1.38), (0.18, 1.52), (0.55, 1.56), (0.78, 1.46), (0.9, 1.15), (0.965, 0.72), (1.0, 0.2)],
    yk=[(0, -0.38), (0.12, -0.5), (0.8, -0.5), (1.0, 0.05)],
    yg=[(0, 1.3), (0.2, 1.08), (0.6, 1.08), (0.85, 1.18), (1.0, 1.66)],
    bul=[(0, 0.3), (1, 0.3)],
)
PROF = [(1.0, 1.0), (1.01, 0.9), (1.03, 0.62), (1.02, 0.4), (1.0, 0.33), (0.9, 0.22), (0.62, 0.1), (0.0, 0.0)]
SEGS = ['rust_red', 'rust', 'rust', 'team', 'rust_black', 'rust_black', 'rust_black']

TANKS = [(-0.97, 0.45, 3.1), (0.0, -0.45, 3.4), (0.97, 0.3, 3.0)]   # (x, z do centro, comprimento)
TANK_R = 0.5
TANK_Y = DECK + 0.14 + TANK_R
HOSE_P = (0.55, DECK + 0.38, 2.75)


def make_hull():
    return Hull(L, 0.0, HULL['hw'], HULL['yk'], HULL['yg'], HULL['bul'], PROF, SEGS, n=26, t=0.14, deck='deck',
                inner='rust', rail='rust_red', cap='rust_red', bottom='rust_black', flat_deck=DECK)


def build_hull(mats, root):
    mb = MeshBuilder('Hull')
    h = make_hull()
    h.build(mb)
    z0, z1 = h.z0, h.z1
    h.rail_cap(mb, 'rust_red', 0.24, 0.08, za=z0 + 0.03, zb=z1 - 0.05, bevel=0.02)
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
            mb.add(prim_box(w, ht, 0.03), 'rust_red' if (i + (sg > 0)) % 2 else 'rust', m, bevel=0.008)
            for dx in (-1, 1):
                for dy in (-1, 1):
                    stud(mb, p + n * 0.03 + m.to_3x3() @ V((dx * w * 0.42, dy * ht * 0.38, 0)), n, 0.02, 'steel')
    h.studs(mb, 0.9, z0 + 0.3, z1 - 0.4, 0.36, 'steel', r=0.026)
    h.studs(mb, 0.4, z0 + 0.3, z1 - 0.6, 0.45, 'steel', r=0.026)
    # anéis de amarração/defensa e tubo de bordo
    for z in (-0.1, 2.6):
        for sg in (-1, 1):
            p, n = h.P(z, 0.7, sg), h.N(z, 0.7, sg)
            m = SH.frame_at(p + n * 0.02, n)
            mb.add(SH.torus(0.13, 0.04, 12, 5), 'steel_dark', m @ M((0, 0, 0.04), (90, 0, 0)), smooth=60)
            mb.add(prim_box(0.16, 0.06, 0.06), 'steel_dark', m @ M((0, 0.17, 0.0)), bevel=0.008)
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
    # --- tanques: 3 cápsulas com cintas, selas, cúpulas com válvulas e portinholas
    domes = []
    for k, (x, zc, ln) in enumerate(TANKS):
        capsule(mb, (x, TANK_Y, zc), ln, TANK_R, 'tank', n=14, ends=4)
        for t in (-0.36, -0.1, 0.16, 0.42):
            z = zc + ln * t
            mb.add(prim_cyl(TANK_R * 1.045, TANK_R * 1.045, 0.1, 14, base=False), 'steel',
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
        wheel = 'red' if k != 1 else 'blue'
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
    mb.add(prim_extrude([(0, 0.15), (0.15, 0), (0, -0.15), (-0.15, 0)], 0.04, axis='x'), 'gold',
           M((TANKS[2][0] + TANK_R * 1.0, TANK_Y + 0.05, TANKS[2][1] + 0.75)), bevel=0.004)
    mb.add(prim_extrude([(0, 0.07), (0.05, 0), (0, -0.07), (-0.05, 0)], 0.045, axis='x'), 'dark',
           M((TANKS[2][0] + TANK_R * 1.0, TANK_Y + 0.05, TANKS[2][1] + 0.75)))
    # tubulação: coletor transversal sobre os tanques com subidas até as cúpulas, flanges e cotovelos
    hy = TANK_Y + TANK_R + 0.52
    hz = -0.2
    path = [(domes[0][0], domes[0][1], domes[0][2]), (domes[0][0], hy, domes[0][2]), (domes[0][0] + 0.25, hy, hz),
            (0.0, hy, hz), (0.0, hy, hz), (domes[2][0] - 0.25, hy, hz), (domes[2][0], hy, domes[2][2]),
            (domes[2][0], domes[2][1], domes[2][2])]
    tube(mb, smooth_path(path, 3), [0.075] * len(smooth_path(path, 3)), 'steel_dark', n=8, smooth=60)
    for (x, z) in ((-0.55, hz), (0.55, hz), (domes[0][0], hy - 0.15), (domes[2][0], hy - 0.15)):
        pass
    for x in (-0.6, -0.15, 0.15, 0.6):
        d = V((1, 0, 0))
        mb.add(prim_cyl(0.11, 0.11, 0.06, 8, base=False), 'steel', M((x, hy, hz), (0, 0, 90)), smooth=30)
    # subida do tanque central ligada ao coletor
    tube(mb, [(0.0, TANK_Y + TANK_R + 0.1, TANKS[1][1] + 0.1), (0.0, hy - 0.12, TANKS[1][1] + 0.1), (0.0, hy, hz)],
         [0.07] * 3, 'steel_dark', n=8, smooth=60)
    # tubo diagonal longo do coletor até a válvula de proa (tubulação de carga)
    pp = smooth_path([(0.0, hy, hz), (0.0, hy, 1.0), (0.4, hy - 0.6, 2.0), (HOSE_P[0], HOSE_P[1] + 0.25, HOSE_P[2] - 0.2),
                      (HOSE_P[0], HOSE_P[1], HOSE_P[2])], 3)
    tube(mb, pp, [0.09] * len(pp), 'steel_dark', n=8, smooth=60)
    for t in (0.3, 0.6, 0.85):
        i = int(t * (len(pp) - 1))
        d = V(pp[i + 1]) - V(pp[i])
        mb.add(prim_cyl(0.13, 0.13, 0.07, 8, base=False), 'steel', Matrix.Translation(V(pp[i])) @ orient(d), smooth=30)
    # válvula de proa (flange de ligação da mangueira)
    mb.add(prim_cyl(0.14, 0.14, 0.4, 10, base=True), 'steel', M((HOSE_P[0], DECK, HOSE_P[2])), smooth=40, bevel=0.01)
    mb.add(prim_cyl(0.19, 0.19, 0.05, 10, base=True), 'steel_dark', M((HOSE_P[0], DECK + 0.34, HOSE_P[2])), smooth=30)
    # --- cabine de popa: base creme-enferrujada, passadiço, janelas, porta, antena em cruz, chaminé
    cz0, cz1 = -3.4, -1.95
    base_h = 0.78
    mb.add(prim_box(1.95, base_h, cz1 - cz0, taper=(0.98, 0.98)), 'cabin', M((0.0, DECK + base_h / 2, (cz0 + cz1) / 2)), bevel=0.03)
    mb.add(prim_box(2.04, 0.07, cz1 - cz0 + 0.08), 'rust_red', M((0.0, DECK + base_h + 0.03, (cz0 + cz1) / 2)), bevel=0.012)
    mb.add(prim_box(2.0, 0.06, cz1 - cz0 + 0.04), 'rust_black', M((0.0, DECK + 0.03, (cz0 + cz1) / 2)), bevel=0.008)
    for sg in (-1, 1):
        for z in (-3.1, -2.7, -2.3):
            SH.window(mb, M((sg * 0.98, DECK + 0.46, z), (0, sg * 90, 0)), 0.14, 0.16, frame='rust_red', glass='glass')
    for dx in (-0.55, 0.0, 0.55):
        SH.window(mb, M((dx, DECK + 0.46, cz1 + 0.005)), 0.2, 0.17, frame='rust_red', glass='glass')
    # porta lateral de ferro com escada
    mb.add(prim_box(0.06, 0.52, 0.3), 'rust_red', M((0.985, DECK + 0.26, -2.5)), bevel=0.01)
    mb.add(prim_box(0.06, 0.3, 0.1), 'steel_dark', M((0.99, DECK + 0.38, -2.5)))
    SH.stairs(mb, (1.05, DECK + 0.02, -2.0), (1.05, DECK + 0.62, -2.35), 0.3, 5, mat='steel_dark', stringer='steel_dark')
    # passadiço superior
    by = DECK + base_h + 0.07
    mb.add(prim_box(1.5, 0.62, 1.05, taper=(0.95, 0.9)), 'cabin', M((0.0, by + 0.31, -2.85)), bevel=0.03)
    mb.add(prim_box(1.62, 0.08, 1.17), 'rust_red', M((0.0, by + 0.66, -2.85)), bevel=0.015)
    mb.add(prim_box(1.4, 0.06, 0.95), 'steel_dark', M((0.0, by + 0.72, -2.85)), bevel=0.01)
    for dx in (-0.45, -0.15, 0.15, 0.45):
        SH.window(mb, M((dx, by + 0.34, -2.85 + 0.53)), 0.17, 0.2, frame='steel', glass='glass')
    for sg in (-1, 1):
        for dz in (-0.25, 0.1, 0.4):
            SH.window(mb, M((sg * 0.74, by + 0.34, -2.85 + dz), (0, sg * 90, 0)), 0.14, 0.2, frame='steel', glass='glass')
    # antena em cruz com estais
    ax = V((0.0, by + 0.74, -2.55))
    beam(mb, tuple(ax), tuple(ax + V((0, 1.7, 0))), 0.05, 0.05, 'steel_dark')
    beam(mb, tuple(ax + V((-0.38, 1.35, 0))), tuple(ax + V((0.38, 1.35, 0))), 0.04, 0.04, 'steel_dark')
    beam(mb, tuple(ax + V((-0.22, 1.0, 0))), tuple(ax + V((0.22, 1.0, 0))), 0.035, 0.035, 'steel_dark')
    for (dx, dz) in ((-0.62, 0.3), (0.62, 0.3), (-0.62, -0.3), (0.62, -0.3)):
        beam(mb, tuple(ax + V((0, 1.5, 0))), tuple(ax + V((dx, 0.0, dz))), 0.012, 0.012, 'steel')
    # luz de mastro e radar
    mb.add(prim_sphere(0.06, 0.06, 0.06, 6, 3), 'red', M(tuple(ax + V((0, 1.72, 0)))), smooth=60)
    mb.add(prim_box(0.34, 0.04, 0.1), 'steel', M(tuple(ax + V((0.0, 0.5, 0.0)))))
    # chaminé: vermelho-ferrugem com faixa de time, boca preta, escora
    fx, fz_ = 0.52, -3.0
    SH.funnel(mb, V((fx, DECK + base_h + 0.07 + 0.62, fz_)), 0.34, 1.0, 'rust_red', 'team', 'dark', 'rust_black', n=14,
              band=(0.42, 0.62), taper=0.9)
    mb.add(prim_cyl(0.37, 0.37, 0.08, 14, base=True), 'steel_dark', M((fx, DECK + base_h + 0.07 + 0.62, fz_)), smooth=30)
    for sg in (-1, 1):
        beam(mb, (fx + sg * 0.25, by + 0.75, fz_), (fx + sg * 0.42, by + 0.66, fz_ - 0.2), 0.035, 0.035, 'steel_dark')
    # tubos de exaustão laterais (curvos) + tubo alto cinza à direita
    for k, dx in enumerate((-0.62, -0.38, -0.14)):
        pts = smooth_path([(dx, by + 0.6, -3.15), (dx, by + 0.9, -3.15), (dx - 0.0, by + 1.05, -2.98), (dx, by + 1.0, -2.8)], 3)
        tube(mb, pts, [0.06] * len(pts), 'steel_dark', n=7, smooth=60)
    ep = smooth_path([(1.3, DECK + 0.5, -3.3), (1.3, DECK + 1.5, -3.3), (1.15, DECK + 1.9, -3.3), (0.9, DECK + 1.95, -3.3)], 3)
    tube(mb, ep, [0.09] * len(ep), 'steel', n=8, smooth=60)
    mb.add(prim_cyl(0.13, 0.13, 0.05, 8, base=False), 'steel_dark', M((1.3, DECK + 1.0, -3.3), (0, 0, 0)), smooth=30)
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
    SH.flag(X, 0.95, 0.4, 'team', 'steel_dark', False, amp=0.06, fx=3.5, ph=0.8, tail=0.4)
    return mb.build(mats, parent=root, location=(0.0, DECK + 0.85 + 0.69 + 0.07 + 1.68 - 0.1, -2.55))


def main():
    args = C.script_args()
    C.reset_scene()
    mats = C.make_paint_set(PALETTE)
    root = C.make_empty('Tanker')
    hull = build_hull(mats, root)
    hose = build_hose(mats, root)
    flag = build_flag(mats, root)
    fy = DECK + 0.78 + 0.07 + 0.62 + 1.0
    C.make_empty('Anim_Smoke', (0.52, fy + 0.08, -3.0), parent=root)
    parts = [hull, hose, flag]
    SH.finish_ship('tanker', 'tanker.glb', 'tanker_atlas', root, parts,
                   {'Hull': 1.0, 'Hose': 0.5, 'Flag': 0.4},
                   TEAM_DEFAULT, args, tex=int(os.environ.get('ATLAS', 512)), ground_hex='#1c5f8f', game_dist=19.0)


if __name__ == '__main__':
    main()
