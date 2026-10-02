"""
build_orc_dreadnought.py — Couraçado orc ("Juggernaut", raiz `OrcDreadnought`) gerado 100% por script; mesma
hierarquia e pivôs do `build_dreadnought.py` humano para o animador reaproveitar.

Referência: docs/refs/naval/orc_ships_ref.png ("Orcish Juggernaut"): fortaleza flutuante de madeira escura e ferro
enferrujado com espetos de ferro e presas de marfim, torre central alta tipo pagode de 4 andares com telhados de time
(vermelho) e chifres nos beirais, bandeiras esfarrapadas em mastros, torretas redondas de ferro com anéis e canos
grossos, canhões laterais em seteiras de ferro, caveiras, proa com esporão serrilhado e grandes presas curvas.

Uso:
  blender -b --factory-startup --python tools/blender/build_orc_dreadnought.py -- [--no-render]

Hierarquia (proa = +Z, y = 0 na linha d'água, casco ~10 u):
  OrcDreadnought (raiz)
  ├─ Hull      casco, convés, pagode, mastros, castelo de popa, canhões de bordo (Atlas + TeamColor)
  ├─ Turret1   torre de proa (pivô (0, convés, 3,75), gira em Y)     └─ Cannon1  canos gêmeos (recuo em z)
  ├─ Turret2   torre central (pivô (0, convés, 1,3), gira em Y)      └─ Cannon2
  ├─ Cannon3   canhão giratório de popa
  ├─ Sail1..3  bandeiras de guerra esfarrapadas (TeamColor) dos 3 mastros (o pagode faz o papel do mastro central)
  └─ Flag      bandeira do mastro de popa (TeamColor)
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
from ship_common import V, Hull, beam, tube, orient, rect_tube, stud, cask, rope_coil, barrel_gun, smooth_path  # noqa: E402
from build_orc_tanker import PALETTE as TANKER_PALETTE  # noqa: E402  (cobre, marfim, ferrugem, tábuas do convés)

TEAM_DEFAULT = '#b8261c'
PALETTE = dict(TANKER_PALETTE)
PALETTE['wood_dark'] = dict(base='#76431f', var='#3e2210', var_scale=2.5, var_amt=0.8, fine=0.12, top=0.2, pattern='planks',
                            mapping='box', pw=1.9, ph=0.17, mortar='#150b05', mortar_size=0.018, edge='#98683a',
                            edge_amt=0.45, edge_r=0.02, ao=(0.35, 0.7), streaks=(2.5, 0.5, 0.18), grad=(-0.6, 1.9, 0.35))
PALETTE['iron'] = dict(PALETTE['iron'], base='#4a4a50', var='#6a3a22', var_scale=4.0, var_amt=0.45)

L = 10.0
DECK = 1.5
HULL = dict(
    hw=[(0, 1.55), (0.05, 1.78), (0.2, 1.98), (0.5, 2.06), (0.75, 1.92), (0.88, 1.5), (0.95, 0.95), (0.985, 0.5), (1.0, 0.22)],
    yk=[(0, -0.5), (0.15, -0.62), (0.75, -0.62), (0.93, -0.3), (1.0, 0.35)],
    yg=[(0, 2.5), (0.08, 2.28), (0.25, 2.05), (0.7, 2.02), (0.9, 2.2), (1.0, 2.55)],
    bul=[(0, 0.5), (1, 0.5)],
)
PROF = [(1.0, 1.0), (1.03, 0.935), (1.05, 0.64), (1.05, 0.60), (1.035, 0.52), (1.0, 0.47), (0.9, 0.30), (0.6, 0.12), (0.0, 0.0)]
SEGS = ['rust_black', 'wood_dark', 'rust_black', 'team', 'iron', 'iron', 'rust_black', 'rust_black']
PORT_TF = 0.80
PORT_Z = [-3.55, -2.6, -1.65, -0.7, 0.25, 1.2, 2.15, 3.1]
QD_Y = 2.15            # convés do castelo de popa
QD_Z0, QD_Z1 = -4.9, -2.25
PAG_Z = -0.75          # pagode central
PAG_TIERS = [(1.9, 1.15), (1.5, 0.95), (1.15, 0.85), (0.8, 0.75)]   # (largura, altura do corpo)
SAIL_H = 1.9
# (z, topo, y da verga) dos 3 mastros de bandeira; o do meio fica no alto do pagode
MASTS = [(2.6, DECK + 4.1, DECK + 3.8), (PAG_Z, None, None), (-1.8, DECK + 4.1, DECK + 3.8)]
TUR1 = (0.0, DECK, 3.75)
TUR2 = (0.0, DECK, 1.3)


def spike(mb, p, d, r, h, mat='iron', n=5):
    mb.add(prim_cone(r, h, n), mat, Matrix.Translation(V(p)) @ orient(d), smooth=30)


def skull(mb, T, s=1.0):
    """Caveira de marfim (+z local = face)."""
    mb.add(prim_sphere(0.15 * s, 0.14 * s, 0.12 * s, 8, 5), 'bone', T @ M((0, 0.03 * s, 0)), smooth=60)
    mb.add(prim_box(0.18 * s, 0.1 * s, 0.1 * s), 'bone', T @ M((0, -0.1 * s, 0.03 * s)), bevel=0.008)
    for dx in (-0.06, 0.06):
        mb.add(prim_sphere(0.04 * s, 0.045 * s, 0.03 * s, 5, 3), 'dark', T @ M((dx * s, 0.04 * s, 0.1 * s)))
    mb.add(prim_box(0.03 * s, 0.05 * s, 0.03 * s), 'dark', T @ M((0, -0.03 * s, 0.115 * s)))
    for dx in (-0.045, 0.0, 0.045):
        mb.add(prim_box(0.02 * s, 0.05 * s, 0.02 * s), 'dark', T @ M((dx * s, -0.14 * s, 0.085 * s)))


def make_hull():
    return Hull(L, 0.0, HULL['hw'], HULL['yk'], HULL['yg'], HULL['bul'], PROF, SEGS, n=34, t=0.16, deck='wood_deck',
                inner='wood_dark', rail='iron', cap='wood_dark', bottom='rust_black', flat_deck=DECK)


def pagoda(mb):
    cz = PAG_Z
    y = DECK
    mb.add(prim_box(2.5, 0.36, 2.5, taper=(0.95, 0.95)), 'rust_black', M((0, y + 0.18, cz)), bevel=0.03)
    for sx in (-1, 1):
        for sz in (-1, 1):
            mb.add(prim_box(0.3, 0.4, 0.3), 'iron', M((sx * 1.18, y + 0.2, cz + sz * 1.18)), bevel=0.02)
            spike(mb, (sx * 1.18, y + 0.4, cz + sz * 1.18), (sx * 0.4, 1, sz * 0.4), 0.09, 0.32, 'bone')
    y += 0.36
    for i, (w, h) in enumerate(PAG_TIERS):
        hw = w / 2
        last = i == len(PAG_TIERS) - 1
        mb.add(prim_box(w, h, w, taper=(0.98, 0.98)), 'wood_dark', M((0, y + h / 2, cz)), bevel=0.03)
        mb.add(prim_box(w + 0.08, 0.12, w + 0.08), 'iron', M((0, y + 0.06, cz)), bevel=0.015)
        mb.add(prim_box(w + 0.08, 0.1, w + 0.08), 'iron', M((0, y + h - 0.05, cz)), bevel=0.015)
        for sx in (-1, 1):
            for sz in (-1, 1):
                mb.add(prim_box(0.14, h, 0.14), 'wood', M((sx * hw, y + h / 2, cz + sz * hw)), bevel=0.015)
        # seteiras escuras com moldura de ferro nas quatro faces
        for k in (-1, 1):
            for (px, pz, ry, ex, ez) in ((0, hw, 0, 1, 0), (0, -hw, 180, 1, 0), (hw, 0, 90, 0, 1), (-hw, 0, -90, 0, 1)):
                T = M((px + ex * k * w * 0.24, y + h * 0.55, cz + pz + ez * k * w * 0.24), (0, ry, 0))
                mb.add(prim_box(0.22, h * 0.55, 0.05), 'iron', T, bevel=0.008)
                mb.add(prim_box(0.12, h * 0.46, 0.06), 'dark', T @ M((0, 0, 0.012)))
        # beiral (laje larga) + pirâmide de telhado de time + chifres de marfim nos cantos
        ew = w + 0.55
        y += h
        mb.add(prim_box(ew, 0.1, ew), 'wood', M((0, y + 0.05, cz)), bevel=0.015)
        mb.add(prim_box(ew + 0.06, 0.07, ew + 0.06), 'iron', M((0, y + 0.1, cz)), bevel=0.012)
        rh = 0.7 if last else 0.42
        tp = 0.05 if last else 0.35
        mb.add(prim_box(ew - 0.05, rh, ew - 0.05, taper=(tp, tp)), 'team' if i >= 2 else 'rust', M((0, y + 0.1 + rh / 2, cz)), bevel=0.02)
        for sx in (-1, 1):
            for sz in (-1, 1):
                spike(mb, (sx * (ew / 2 - 0.02), y + 0.08, cz + sz * (ew / 2 - 0.02)), (sx * 0.8, 1.0, sz * 0.8), 0.08, 0.5, 'bone')
        # o próximo andar assenta sobre o topo do telhado truncado
        y += 0.1 + rh * (1.0 if last else 0.9)
    return y


def build_hull(mats, root):
    mb = MeshBuilder('Hull')
    h = make_hull()
    h.build(mb)
    z0, z1 = h.z0, h.z1
    # --- bordo de ferro grosso + cintas
    h.rail_cap(mb, 'iron', 0.34, 0.12, za=z0 + 0.03, zb=z1 - 0.1, bevel=0.025, n=30)
    h.band(mb, 0.62, z0 + 0.1, z1 - 0.7, 0.08, 0.05, 'iron', n=30)
    h.band(mb, 0.49, z0 + 0.1, z1 - 0.9, 0.07, 0.05, 'rust_black', n=26)
    h.studs(mb, 0.965, z0 + 0.3, z1 - 0.6, 0.34, 'iron', r=0.04)
    h.studs(mb, 0.56, z0 + 0.4, z1 - 1.2, 0.42, 'iron', r=0.035)
    # painéis de ferro do casco inferior com rebites
    for z in (-4.2, -3.0, -1.8, -0.6, 0.6, 1.8, 3.0):
        for sg in (-1, 1):
            a, b = h.P(z, 0.47, sg), h.P(z, 0.27, sg)
            n = h.N(z, 0.37, sg)
            beam(mb, tuple(a + n * 0.02), tuple(b + n * 0.02), 0.1, 0.05, 'iron', bevel=0.008)
    for z in (-3.6, -2.4, -1.2, 0.0, 1.2, 2.4):
        for sg in (-1, 1):
            p, n = h.P(z, 0.37, sg), h.N(z, 0.37, sg)
            m = SH.frame_at(p + n * 0.02, n)
            mb.add(prim_box(0.8, 0.34, 0.06), 'rust' if int(z * 10) % 2 else 'rust_black', m, bevel=0.012)
            for dx in (-1, 1):
                for dy in (-1, 1):
                    stud(mb, p + n * 0.05 + m.to_3x3() @ V((dx * 0.34, dy * 0.13, 0)), n, 0.03, 'iron')
    # cintas verticais de ferro entre as seteiras + espetos alternados de marfim/ferro
    for z in [(PORT_Z[i] + PORT_Z[i + 1]) / 2 for i in range(len(PORT_Z) - 1)]:
        for sg in (-1, 1):
            a, b = h.P(z, 0.95, sg), h.P(z, 0.66, sg)
            n = h.N(z, 0.8, sg)
            beam(mb, tuple(a + n * 0.02), tuple(b + n * 0.02), 0.1, 0.04, 'iron', bevel=0.008)
            q = h.P(z, 0.9, sg) + h.N(z, 0.9, sg) * 0.03
            spike(mb, q, h.N(z, 0.9, sg) + V((0, 0.35, 0)), 0.07, 0.4, 'bone' if int(z * 10) % 2 else 'iron')
    # --- canhões de bordo em seteiras de ferro
    for z in PORT_Z:
        for sg in (-1, 1):
            p, n = h.P(z, PORT_TF, sg), h.N(z, PORT_TF, sg)
            m = SH.frame_at(p + n * 0.003, n)
            SH.port_frame(mb, m, 0.36, 0.32, 'iron', t=0.08, d=0.1)
            barrel_gun(mb, m @ M((0, 0, -0.06)), 0.58, 0.12, 'iron', 'copper_dark', n=8, flare=1.05)
            mb.add(prim_box(0.34, 0.04, 0.06), 'rust_black', m @ M((0, 0.21, 0.0)))
    # --- escudos de ferro de proa com caveira de marfim
    for sg in (-1, 1):
        p, n = h.P(4.05, 0.5, sg), h.N(4.05, 0.5, sg)
        m = SH.frame_at(p + n * 0.015, n)
        SH.shield(mb, m, 1.55, rim='iron', field='team', trim='iron', depth=0.07)
        skull(mb, m @ M((0, 0.04, 0.12)), 1.5)
    # caveiras nos flancos
    for z in (-3.05, 0.7):
        for sg in (-1, 1):
            p, n = h.P(z, 0.58, sg), h.N(z, 0.58, sg)
            m = SH.frame_at(p + n * 0.02, n)
            skull(mb, m @ M((0, 0, 0.06)), 1.4)
    # --- esporão serrilhado de ferro no gurupés, com anéis e presas curvas de marfim
    ry = h.keel(z1) + 0.12
    mb.add(prim_cyl(0.34, 0.32, 0.36, 10, base=True), 'rust_black', M((0, ry, z1 - 0.22), (90, 0, 0)) @ M((0, -0.18, 0)), smooth=40, bevel=0.01)
    mb.add(prim_cone(0.32, 1.7, 8), 'iron', M((0, ry, z1 + 0.1), (90, 0, 0)), smooth=30)
    for k, zz in enumerate((0.0, 0.34, 0.66)):
        r0 = 0.36 - k * 0.09
        mb.add(prim_cyl(r0, r0, 0.07, 8, base=False), 'rust' if k % 2 else 'team', M((0, ry, z1 + zz - 0.25), (90, 0, 0)), smooth=30)
        for a in range(6):
            ang = a * math.pi / 3 + (0.26 if k % 2 else 0.0)
            c, s_ = math.cos(ang), math.sin(ang)
            spike(mb, (c * r0, ry + s_ * r0, z1 + zz - 0.25), (c, s_, 0.25), 0.055, 0.28, 'iron', n=4)
    for sg in (-1, 1):
        pts = smooth_path([(sg * 0.55, ry + 0.25, z1 - 0.55), (sg * 0.95, ry + 0.4, z1 - 0.35), (sg * 1.12, ry + 0.85, z1 - 0.15),
                           (sg * 0.95, ry + 1.35, z1 + 0.08), (sg * 0.6, ry + 1.6, z1 + 0.25)], 4)
        rad = [0.12 - 0.08 * i / (len(pts) - 1) for i in range(len(pts))]
        tube(mb, pts, rad, 'bone', n=7, smooth=60)
        mb.add(prim_cyl(0.16, 0.16, 0.1, 8, base=False), 'iron', M(tuple(pts[1])), smooth=30)
    # --- popa: galeria de seteiras com grades de ferro
    zt = z0 - 0.02
    mb.add(prim_box(3.1, 0.82, 0.06), 'wood_dark', M((0, 1.72, zt)), bevel=0.01)
    mb.add(prim_box(3.2, 0.08, 0.1), 'iron', M((0, 1.28, zt)), bevel=0.008)
    mb.add(prim_box(3.2, 0.08, 0.1), 'iron', M((0, 2.17, zt)), bevel=0.008)
    for x in (-0.95, 0.0, 0.95):
        mb.add(prim_box(0.5, 0.5, 0.05), 'iron', M((x, 1.7, zt - 0.02)), bevel=0.01)
        mb.add(prim_box(0.34, 0.36, 0.06), 'dark', M((x, 1.7, zt - 0.035)))
        for dx in (-0.1, 0.0, 0.1):
            mb.add(prim_box(0.025, 0.4, 0.06), 'iron', M((x + dx, 1.7, zt - 0.05)))
    for sx in (-1, 1):
        mb.add(prim_cyl(0.07, 0.07, 0.1, 8, base=False), 'iron', M((sx * 1.55, 2.2, zt - 0.02), (90, 0, 0)))
        spike(mb, (sx * 1.5, 2.3, zt - 0.08), (sx * 0.5, 0.8, -0.8), 0.07, 0.6, 'bone')
    # --- convés de proa: bitas, barris, cordas
    yd = DECK
    for (x, z) in ((0.85, 4.35), (-0.85, 4.35)):
        mb.add(prim_cyl(0.1, 0.085, 0.24, 8, base=True), 'iron', M((x, yd, z)), smooth=40, bevel=0.01)
        mb.add(prim_cyl(0.15, 0.15, 0.05, 8, base=True), 'iron', M((x, yd + 0.24, z)), smooth=40)
    rope_coil(mb, M((0.0, yd + 0.02, 4.55)), 0.22, 0.045, 3)
    for (x, z) in ((1.3, 2.35), (1.15, 2.1), (-1.3, 2.4), (-1.55, 0.35), (1.55, 0.2), (1.25, -0.2), (-1.4, -0.3)):
        cask(mb, M((x, yd, z)), 0.14, 0.3, 'wood', 'iron', n=8)
    rope_coil(mb, M((-1.15, yd + 0.02, 2.9)), 0.2, 0.04, 3)
    # escotilha gradeada (entre o pagode e a popa)
    mb.add(prim_box(1.1, 0.14, 0.8), 'wood_dark', M((0.0, yd + 0.07, -2.5)), bevel=0.02)
    for k in range(5):
        mb.add(prim_box(0.05, 0.04, 0.78), 'iron', M((-0.4 + 0.2 * k, yd + 0.16, -2.5)))
    for k in range(3):
        mb.add(prim_box(1.1, 0.04, 0.05), 'iron', M((0.0, yd + 0.17, -2.5 + (k - 1) * 0.3)))
    # --- pagode central
    ptop = pagoda(mb)
    # --- mastros de bandeira laterais (proa e popa) com vergas e estais
    for i in (0, 2):
        mz, top, yh = MASTS[i]
        SH.mast(mb, V((0.0, yd, mz)), V((0.0, top, mz)), 0.15, 0.09, 'wood_dark', 'iron', n=10, bands=(0.06, 0.3, 0.55, 0.8))
        mb.add(prim_cyl(0.26, 0.26, 0.18, 10, base=True), 'iron', M((0, yd, mz)), smooth=40, bevel=0.012)
        spike(mb, (0, top, mz), (0, 1, 0), 0.08, 0.5, 'iron', n=6)
        skull(mb, M((0, top - 0.55, mz + 0.0), (0, 0, 0)), 1.9)
        skull(mb, M((0, top - 0.55, mz), (0, 180, 0)), 1.9)
        X = SH.S.Xf(mb, M((0.0, yh, mz), (0, 90, 0)))
        SH.yard(X, V((0, 0, 0)), 1.9, 0.06, 'wood_dark', 'bone')
        for sg in (-1, 1):
            beam(mb, (sg * 0.04, yd + 2.4, mz), (sg * 1.5, yd + 0.45, mz), 0.022, 0.022, 'rope')
    # verga do pagode para a bandeira central
    X = SH.S.Xf(mb, M((0.0, ptop - 0.35, PAG_Z), (0, 90, 0)))
    SH.yard(X, V((0, 0, 0)), 1.9, 0.055, 'wood_dark', 'bone')
    mb.add(prim_cyl(0.07, 0.05, 0.9, 8, base=True), 'wood_dark', M((0, ptop - 0.4, PAG_Z)), smooth=40)
    spike(mb, (0, ptop + 0.5, PAG_Z), (0, 1, 0), 0.07, 0.55, 'iron', n=6)
    # --- castelo de popa: plataforma de tábuas, escada, cabana de ferro e madeira com espetos
    qh = QD_Y - DECK
    qz = (QD_Z0 + QD_Z1) / 2
    qw = 1.62
    SH.deck_box(mb, M((0.0, DECK + qh / 2, qz)), qw * 2, qh, QD_Z1 - QD_Z0, top='wood_deck', side='wood_dark', bevel=0.02)
    mb.add(prim_box(qw * 2 + 0.06, 0.08, 0.12), 'iron', M((0.0, QD_Y - 0.04, QD_Z1 + 0.03)), bevel=0.01)
    mb.add(prim_box(qw * 2 + 0.06, 0.08, 0.12), 'iron', M((0.0, DECK + 0.05, QD_Z1 + 0.03)), bevel=0.01)
    for sx in (-1, 1):
        mb.add(prim_box(0.8, qh * 0.72, 0.05), 'team', M((sx * 0.95, DECK + qh / 2, QD_Z1 + 0.04)), bevel=0.01)
        mb.add(prim_box(0.86, 0.05, 0.07), 'iron', M((sx * 0.95, DECK + qh * 0.9, QD_Z1 + 0.04)))
        mb.add(prim_box(0.86, 0.05, 0.07), 'iron', M((sx * 0.95, DECK + qh * 0.1, QD_Z1 + 0.04)))
        skull(mb, M((sx * 0.95, DECK + qh * 0.5, QD_Z1 + 0.07)), 1.2)
    SH.stairs(mb, (-1.05, DECK + 0.03, QD_Z1 + 1.05), (-1.05, QD_Y + 0.0, QD_Z1 + 0.05), 0.5, 8, mat='wood', stringer='iron')
    for sx in (-1.31, -0.79):
        beam(mb, (sx, DECK + 0.15, QD_Z1 + 1.05), (sx, QD_Y + 0.5, QD_Z1 + 0.05), 0.05, 0.05, 'iron')
        spike(mb, (sx, QD_Y + 0.5, QD_Z1 + 0.05), (0, 1, 0), 0.05, 0.25, 'bone')
    cw, cd, ch = 0.98, 0.88, 1.2
    cz = -3.75
    cy = QD_Y
    mb.add(prim_box(cw * 2, ch, cd * 2, taper=(0.99, 0.99)), 'wood_dark', M((0.0, cy + ch / 2, cz)), bevel=0.03)
    mb.add(prim_box(cw * 2 + 0.06, 0.2, cd * 2 + 0.06), 'rust_black', M((0.0, cy + 0.1, cz)), bevel=0.012)
    mb.add(prim_box(cw * 2 + 0.1, 0.1, cd * 2 + 0.1), 'iron', M((0.0, cy + ch - 0.05, cz)), bevel=0.012)
    mb.add(prim_box(cw * 2 + 0.4, 0.1, cd * 2 + 0.4), 'wood', M((0.0, cy + ch + 0.05, cz)), bevel=0.015)
    mb.add(prim_box(cw * 2 + 0.3, 0.45, cd * 2 + 0.3, taper=(0.55, 0.55)), 'team', M((0.0, cy + ch + 0.32, cz)), bevel=0.02)
    for sx in (-1, 1):
        for sz in (-1, 1):
            spike(mb, (sx * (cw + 0.18), cy + ch + 0.08, cz + sz * (cd + 0.18)), (sx * 0.8, 1, sz * 0.8), 0.08, 0.5, 'bone')
            mb.add(prim_box(0.14, ch * 0.9, 0.14), 'wood', M((sx * (cw - 0.01), cy + ch * 0.5, cz + sz * (cd - 0.01))), bevel=0.012)
    zf = cz + cd
    arch2 = [(-0.24, 0.0), (0.24, 0.0), (0.24, 0.52), (0.17, 0.72), (0.0, 0.8), (-0.17, 0.72), (-0.24, 0.52)]
    mb.add(prim_extrude([(x * 1.35, y * 1.15) for (x, y) in arch2], 0.05, axis='z'), 'iron', M((0.0, cy + 0.2, zf + 0.0)), bevel=0.01)
    mb.add(prim_extrude(arch2, 0.07, axis='z'), 'wood_dark', M((0.0, cy + 0.2, zf + 0.012)), bevel=0.008)
    for dx in (-0.12, 0.12):
        mb.add(prim_box(0.02, 0.7, 0.08), 'iron', M((dx, cy + 0.55, zf + 0.012)))
    for dy in (0.35, 0.7):
        mb.add(prim_box(0.46, 0.045, 0.08), 'iron', M((0.0, cy + dy, zf + 0.012)))
    for dx in (-0.6, 0.6):
        mb.add(prim_box(0.1, 0.34, 0.06), 'dark', M((dx, cy + 0.85, zf + 0.0)))
        mb.add(prim_box(0.16, 0.4, 0.04), 'iron', M((dx, cy + 0.85, zf - 0.01)), bevel=0.008)
    cask(mb, M((1.32, QD_Y, -3.15)), 0.14, 0.3, 'wood', 'iron', n=8)
    cask(mb, M((1.32, QD_Y, -3.5)), 0.14, 0.3, 'wood', 'iron', n=8)
    rope_coil(mb, M((-1.25, QD_Y + 0.02, -4.35)), 0.2, 0.04, 2)
    # mastro de bandeira de popa e cavalete do canhão giratório
    fp = V((-1.38, QD_Y, -4.6))
    SH.mast(mb, fp, fp + V((0, 3.4, 0)), 0.07, 0.055, 'wood_dark', 'iron', n=8, bands=(0.1, 0.5, 0.85))
    spike(mb, tuple(fp + V((0, 3.4, 0))), (0, 1, 0), 0.07, 0.4, 'iron', n=6)
    mb.add(prim_cyl(0.2, 0.2, 0.5, 8, base=True), 'wood_dark', M((1.25, QD_Y, -4.2)), smooth=40, bevel=0.015)
    mb.add(prim_cyl(0.26, 0.26, 0.06, 8, base=True), 'iron', M((1.25, QD_Y + 0.46, -4.2)), smooth=40)
    # braseiros de popa
    for sx in (-1, 1):
        mb.add(prim_box(0.24, 0.3, 0.24, taper=(0.8, 0.8)), 'iron', M((sx * 1.45, 2.8, z0 + 0.12)), bevel=0.02)
        mb.add(prim_box(0.12, 0.18, 0.12), 'orange', M((sx * 1.45, 2.8, z0 + 0.12)))
        mb.add(prim_cone(0.15, 0.2, 4), 'iron', M((sx * 1.45, 2.95, z0 + 0.12)))
    return mb.build(mats, parent=root), ptop


def build_turret(mats, root, name, pivot, scale, rot_y=0.0):
    mb = MeshBuilder(name)
    ay, fz = SH.turret_housing(mb, r=0.82 * scale, h=0.78, shell='rust_black', top='iron', plate='iron',
                               roof_mat='rust_black', scale=1.0)
    mb.add(prim_box(0.96 * scale, 0.46, 0.2), 'iron', M((0, ay, fz + 0.04)), bevel=0.025)
    mb.add(prim_box(1.0 * scale, 0.06, 0.22), 'rust_black', M((0, ay + 0.26, fz + 0.04)), bevel=0.008)
    mb.add(prim_box(1.0 * scale, 0.06, 0.22), 'rust_black', M((0, ay - 0.26, fz + 0.04)), bevel=0.008)
    for sx in (-1, 1):
        mb.add(prim_cyl(0.15, 0.15, 0.12, 8, base=False), 'copper_dark', M((sx * 0.27 * scale, ay, fz + 0.14), (90, 0, 0)), smooth=30)
        for dy in (-0.15, 0.15):
            stud(mb, V((sx * 0.43 * scale, ay + dy, fz + 0.15)), (0, 0, 1), 0.035, 'iron')
    for sg in (-1, 1):
        mb.add(prim_box(0.06, 0.42, 0.7 * scale), 'iron', M((sg * 0.72 * scale, ay - 0.05, -0.05), (0, 0, sg * 8)), bevel=0.01)
        spike(mb, (sg * 0.7 * scale, ay + 0.22, 0.1 * scale), (sg, 0.7, 0), 0.06, 0.34, 'bone')
    r = 0.82 * scale
    for a in range(8):
        ang = a * math.pi / 4 + math.pi / 8
        spike(mb, (math.sin(ang) * r * 0.62, ay + 0.46, math.cos(ang) * r * 0.62 - 0.05), (math.sin(ang) * 0.3, 1, math.cos(ang) * 0.3),
              0.055, 0.34, 'bone' if a % 2 else 'iron')
    skull(mb, M((0, ay + 0.04, -r * 0.84), (0, 180, 0)), 1.3)
    t = mb.build(mats, parent=root, location=pivot)
    C.set_rot_game(t, (0.0, rot_y, 0.0))
    return t, ay, fz, scale


def build_cannon(mats, parent, name, ay, fz, scale):
    mb = MeshBuilder(name)
    for sx in (-1, 1):
        barrel_gun(mb, M((sx * 0.3 * scale, 0, 0)), 1.9, 0.18, 'iron', 'copper_dark', n=8, flare=1.0)
        mb.add(prim_cyl(0.21, 0.21, 0.07, 8, base=False), 'copper_dark', M((sx * 0.3 * scale, 0, 0.9), (90, 0, 0)), smooth=30)
        mb.add(prim_cyl(0.2, 0.2, 0.06, 8, base=False), 'rust_black', M((sx * 0.3 * scale, 0, 1.4), (90, 0, 0)), smooth=30)
        mb.add(prim_cyl(0.13, 0.13, 0.03, 8, base=False), 'rust_black', M((sx * 0.3 * scale, 0, 1.9 - 0.015), (90, 0, 0)))
    mb.add(prim_box(0.8 * scale, 0.16, 0.12), 'rust_black', M((0, 0, 0.12)), bevel=0.012)
    return mb.build(mats, parent=parent, location=(0.0, ay, fz + 0.1))


def build_cannon3(mats, root):
    mb = MeshBuilder('Cannon3')
    mb.add(prim_cyl(0.16, 0.16, 0.18, 8, base=True), 'iron', M((0, 0, 0)), smooth=40, bevel=0.01)
    for sx in (-1, 1):
        mb.add(prim_box(0.06, 0.3, 0.3), 'wood_dark', M((sx * 0.17, 0.3, 0.0)), bevel=0.01)
    barrel_gun(mb, M((0, 0.45, -0.15)), 1.05, 0.12, 'iron', 'copper_dark', n=8)
    mb.add(prim_box(0.36, 0.05, 0.08), 'rust_black', M((0, 0.45, 0.0)))
    t = mb.build(mats, parent=root, location=(1.25, QD_Y + 0.52, -4.2))
    C.set_rot_game(t, (0.0, 150.0, 0.0))
    return t


def build_sail(mats, root, idx, ptop):
    """Bandeira de guerra esfarrapada (cauda recortada) pendurada na verga; plano ao longo do eixo do navio."""
    mz, top, yh = MASTS[idx]
    yy = yh if yh is not None else ptop - 0.35
    mb = MeshBuilder(f'Sail{idx + 1}')
    w, h = 1.7, SAIL_H
    poly = SH.S.tail_strip(w, h, teeth=4, seed=idx + 1.0)
    verts, faces = prim_extrude(poly, 0.035, axis='z')
    verts = SH.wave(verts, 0.08, 3.2, 1.1, 0.7 * idx)
    mb.add((verts, faces), 'team', M((0, -0.05, 0), (0, 90, 0)), smooth=40)
    return mb.build(mats, parent=root, location=(0.0, yy, mz))


def build_flag(mats, root):
    mb = MeshBuilder('Flag')
    X = SH.S.Xf(mb, M((0, 0, 0), (0, 90, 0)))
    SH.flag(X, 1.5, 0.78, 'team', 'iron', False, amp=0.09, fx=3.0, ph=0.4, tail=0.35)
    return mb.build(mats, parent=root, location=(-1.38, QD_Y + 3.0, -4.6))


def main():
    args = C.script_args()
    C.reset_scene()
    mats = C.make_paint_set(PALETTE)
    root = C.make_empty('OrcDreadnought')
    hull, ptop = build_hull(mats, root)
    t1, ay1, fz1, s1 = build_turret(mats, root, 'Turret1', TUR1, 1.0)
    c1 = build_cannon(mats, t1, 'Cannon1', ay1, fz1, s1)
    t2, ay2, fz2, s2 = build_turret(mats, root, 'Turret2', TUR2, 1.25)
    c2 = build_cannon(mats, t2, 'Cannon2', ay2, fz2, s2)
    c3 = build_cannon3(mats, root)
    sails = [build_sail(mats, root, i, ptop) for i in range(3)]
    flag = build_flag(mats, root)
    parts = [hull, t1, c1, t2, c2, c3] + sails + [flag]
    w = {'Hull': 1.0, 'Turret1': 0.8, 'Turret2': 0.9, 'Cannon1': 0.5, 'Cannon2': 0.5, 'Cannon3': 0.4, 'Flag': 0.5}
    for i in range(3):
        w[f'Sail{i + 1}'] = 0.5
    SH.finish_ship('orc_dreadnought', 'orc_dreadnought.glb', 'orc_dreadnought_atlas', root, parts, w, TEAM_DEFAULT, args,
                   tex=int(os.environ.get('ATLAS', 1024)), game_dist=26.0, ground_hex='#1c5f8f')


if __name__ == '__main__':
    main()
