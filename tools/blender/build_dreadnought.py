"""
build_dreadnought.py — Couraçado humano (tipo interno `dreadnought`, raiz `Dreadnought`) gerado 100% por script.

Referência: docs/refs/naval/human_ships_ref.png ("Human Juggernaut"): galeão blindado dourado e azul de 3 mastros
com velas azuis e creme (brasão do Espadachim no lugar do leão), casco de madeira com cintas e chapas de aço
rebitadas, friso dourado grosso no bordo, fileira de canhões em portinholas de moldura dourada, escudos heráldicos de
proa, esporão de aço com anel azul e dourado, duas torres dourado-azuis de canos gêmeos no convés, castelo de popa
de pedra com ameias e porta em arco, galeria de popa com janelas em arco, escada, barris, canhão giratório de popa
e mastro de bandeira.

Uso:
  blender -b --factory-startup --python tools/blender/build_dreadnought.py -- [--no-render]
  (ATLAS=1024 por padrão: ver justificativa no README)

Hierarquia (proa = +Z, y = 0 na linha d'água, casco ~10 u):
  Dreadnought (raiz)
  ├─ Hull      casco, convés, mastros, castelo de popa, canhões de bordo (Atlas + TeamColor: faixa e painéis azuis)
  ├─ Turret1   torre de proa (pivô (0, convés, 3,7), gira em Y)      └─ Cannon1  canos gêmeos (recuo em z)
  ├─ Turret2   torre central (pivô (0, convés, 1,3), gira em Y)      └─ Cannon2
  ├─ Cannon3   canhão giratório de popa (pivô no cavalete)
  ├─ Sail1..3  velas dos 3 mastros (Atlas + TeamColor)
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
from ship_common import V, Hull, beam, tube, orient, rect_tube, stud, cask, rope_coil, barrel_gun  # noqa: E402

TEAM_DEFAULT = '#2d56c0'
PALETTE = dict(SH.PALETTE)

L = 10.0
DECK = 1.5
HULL = dict(
    hw=[(0, 1.55), (0.05, 1.78), (0.2, 1.98), (0.5, 2.06), (0.75, 1.92), (0.88, 1.5), (0.95, 0.95), (0.985, 0.5), (1.0, 0.22)],
    yk=[(0, -0.5), (0.15, -0.62), (0.75, -0.62), (0.93, -0.3), (1.0, 0.35)],
    yg=[(0, 2.5), (0.08, 2.28), (0.25, 2.05), (0.7, 2.02), (0.9, 2.2), (1.0, 2.55)],
    bul=[(0, 0.5), (1, 0.5)],
)
PROF = [(1.0, 1.0), (1.03, 0.935), (1.05, 0.64), (1.05, 0.60), (1.035, 0.52), (1.0, 0.47), (0.9, 0.30), (0.6, 0.12), (0.0, 0.0)]
SEGS = ['gold', 'wood', 'gold', 'team', 'steel', 'steel', 'steel_dark', 'steel_dark']
PORT_TF = 0.80
PORT_Z = [-3.55, -2.6, -1.65, -0.7, 0.25, 1.2, 2.15, 3.1]
QD_Y = 2.15            # convés do castelo de popa
QD_Z0, QD_Z1 = -4.9, -2.25
MASTS = [(2.6, 7.2, 2.35), (0.25, 8.3, 2.5), (-1.55, 7.3, 2.35)]   # (z, topo, altura da verga acima do convés)
TUR1 = (0.0, DECK, 3.75)
TUR2 = (0.0, DECK, 1.3)


def make_hull():
    return Hull(L, 0.0, HULL['hw'], HULL['yk'], HULL['yg'], HULL['bul'], PROF, SEGS, n=34, t=0.16, deck='deck',
                inner='wood_dark', rail='gold', cap='wood', bottom='steel_dark', flat_deck=DECK)


def build_hull(mats, root):
    mb = MeshBuilder('Hull')
    h = make_hull()
    h.build(mb)
    z0, z1 = h.z0, h.z1
    # --- bordo dourado grosso + friso e cintas
    h.rail_cap(mb, 'gold', 0.34, 0.1, za=z0 + 0.03, zb=z1 - 0.1, bevel=0.025, n=30)
    h.band(mb, 0.62, z0 + 0.1, z1 - 0.7, 0.07, 0.045, 'gold', n=30)
    h.band(mb, 0.49, z0 + 0.1, z1 - 0.9, 0.05, 0.04, 'steel_hi', n=26)
    # rebites ao longo do friso superior e da faixa azul
    h.studs(mb, 0.965, z0 + 0.3, z1 - 0.6, 0.36, 'steel_hi', r=0.034)
    h.studs(mb, 0.56, z0 + 0.4, z1 - 1.2, 0.44, 'gold', r=0.03)
    # painéis do casco inferior: longarinas douradas verticais com placas de aço
    for z in (-4.2, -3.0, -1.8, -0.6, 0.6, 1.8, 3.0):
        for sg in (-1, 1):
            a, b = h.P(z, 0.47, sg), h.P(z, 0.27, sg)
            n = h.N(z, 0.37, sg)
            beam(mb, tuple(a + n * 0.02), tuple(b + n * 0.02), 0.09, 0.04, 'gold', bevel=0.008)
    for z in (-3.6, -2.4, -1.2, 0.0, 1.2, 2.4):
        for sg in (-1, 1):
            p, n = h.P(z, 0.37, sg), h.N(z, 0.37, sg)
            m = SH.frame_at(p + n * 0.015, n)
            mb.add(prim_box(0.7, 0.3, 0.035), 'steel_hi' if int(z * 10) % 2 else 'steel', m, bevel=0.01)
            for dx in (-1, 1):
                for dy in (-1, 1):
                    stud(mb, p + n * 0.035 + m.to_3x3() @ V((dx * 0.3, dy * 0.12, 0)), n, 0.022, 'steel_dark')
    # cintas de ferro verticais sobre as tábuas (entre as portinholas)
    for z in [(PORT_Z[i] + PORT_Z[i + 1]) / 2 for i in range(len(PORT_Z) - 1)]:
        for sg in (-1, 1):
            a, b = h.P(z, 0.92, sg), h.P(z, 0.66, sg)
            n = h.N(z, 0.8, sg)
            beam(mb, tuple(a + n * 0.015), tuple(b + n * 0.015), 0.07, 0.03, 'iron', bevel=0.006)
    # --- canhões de bordo em portinholas de moldura dourada
    for z in PORT_Z:
        for sg in (-1, 1):
            p, n = h.P(z, PORT_TF, sg), h.N(z, PORT_TF, sg)
            m = SH.frame_at(p + n * 0.003, n)
            SH.port_frame(mb, m, 0.36, 0.32, 'gold', t=0.07, d=0.08)
            barrel_gun(mb, m @ M((0, 0, -0.06)), 0.55, 0.115, 'steel_dark', 'gold', n=8, flare=1.05)
            mb.add(prim_box(0.34, 0.035, 0.06), 'iron', m @ M((0, 0.2, 0.0)))
    # --- escudos heráldicos de proa (campo azul de time + brasão) e placa de proa
    for sg in (-1, 1):
        p, n = h.P(4.05, 0.5, sg), h.N(4.05, 0.5, sg)
        m = SH.frame_at(p + n * 0.015, n)
        SH.shield(mb, m, 1.55, rim='gold', field='team', trim='gold', depth=0.06)
        SH.emblem(mb, m @ M((0, 0.0, 0.11)), 0.78, 'gold', 'steel_dark')
    # --- esporão de aço no gurupés (proa) com anéis azul e dourado
    ry = h.keel(z1) + 0.12
    mb.add(prim_cyl(0.32, 0.30, 0.34, 10, base=True), 'gold', M((0, ry, z1 - 0.22), (90, 0, 0)) @ M((0, -0.17, 0)), smooth=40, bevel=0.01)
    mb.add(prim_cone(0.3, 1.5, 10), 'steel_hi', M((0, ry, z1 + 0.1), (90, 0, 0)), smooth=30)
    for k, zz in enumerate((0.05, 0.38)):
        mb.add(prim_cyl(0.325 - k * 0.07, 0.325 - k * 0.07, 0.07, 10, base=False), 'team' if k == 0 else 'gold', M((0, ry, z1 + zz - 0.3), (90, 0, 0)), smooth=30)
    # --- popa: galeria de janelas em arco com moldura dourada
    zt = z0 - 0.02
    mb.add(prim_box(3.1, 0.82, 0.06), 'team', M((0, 1.72, zt)), bevel=0.01)
    mb.add(prim_box(3.2, 0.06, 0.08), 'gold', M((0, 1.28, zt)), bevel=0.008)
    mb.add(prim_box(3.2, 0.06, 0.08), 'gold', M((0, 2.17, zt)), bevel=0.008)
    arch = [(-0.2, 0.0), (0.2, 0.0), (0.2, 0.36), (0.14, 0.52), (0.0, 0.58), (-0.14, 0.52), (-0.2, 0.36)]
    for x in (-0.95, 0.0, 0.95):
        mb.add(prim_extrude([(a * 1.18, b * 1.12 - 0.03) for (a, b) in arch], 0.05, axis='z'), 'gold', M((x, 1.45, zt - 0.03)), bevel=0.006)
        mb.add(prim_extrude(arch, 0.07, axis='z'), 'glass', M((x, 1.47, zt - 0.045)))
        mb.add(prim_box(0.04, 0.5, 0.075), 'gold', M((x, 1.7, zt - 0.05)))
    for sx in (-1, 1):
        mb.add(prim_cyl(0.07, 0.07, 0.1, 8, base=False), 'gold', M((sx * 1.55, 2.2, zt - 0.02), (90, 0, 0)))
    # --- convés de proa: bitas, correntes, barris, escotilha
    yd = DECK
    for (x, z) in ((0.9, 4.1), (-0.9, 4.1), (1.0, 2.2), (-1.0, 2.2)):
        pass
    for (x, z) in ((0.85, 4.35), (-0.85, 4.35)):
        mb.add(prim_cyl(0.09, 0.075, 0.22, 8, base=True), 'iron', M((x, yd, z)), smooth=40, bevel=0.01)
        mb.add(prim_cyl(0.13, 0.13, 0.04, 8, base=True), 'iron', M((x, yd + 0.22, z)), smooth=40)
    rope_coil(mb, M((0.0, yd + 0.02, 4.55)), 0.22, 0.045, 3)
    for (x, z) in ((1.3, 2.35), (1.15, 2.1), (-1.3, 2.4), (-1.55, 0.35), (1.55, 0.2), (1.25, -0.55), (-1.3, -0.5)):
        cask(mb, M((x, yd, z)), 0.14, 0.3, 'wood', 'iron', n=8)
    rope_coil(mb, M((-1.15, yd + 0.02, 2.9)), 0.2, 0.04, 3)
    rope_coil(mb, M((1.2, yd + 0.02, -0.15)), 0.2, 0.04, 2)
    # escotilha de carga gradeada no convés (entre os mastros)
    mb.add(prim_box(1.1, 0.14, 0.8), 'wood_dark', M((0.0, yd + 0.07, -0.65)), bevel=0.02)
    for k in range(5):
        mb.add(prim_box(0.05, 0.04, 0.78), 'iron', M((-0.4 + 0.2 * k, yd + 0.16, -0.65)))
    for k in range(3):
        mb.add(prim_box(1.1, 0.04, 0.05), 'iron', M((0.0, yd + 0.17, -0.65 + (k - 1) * 0.3)))
    # --- mastros com aros de ferro, vergas ao longo do eixo e estais
    for i, (mz, top, yh) in enumerate(MASTS):
        base = V((0.0, yd, mz))
        SH.mast(mb, base, V((0.0, top, mz)), 0.17, 0.09, 'wood', 'iron', n=10, bands=(0.06, 0.28, 0.5, 0.78))
        mb.add(prim_cyl(0.28, 0.28, 0.18, 10, base=True), 'iron', M((0, yd, mz)), smooth=40, bevel=0.012)
        mb.add(prim_cyl(0.33, 0.33, 0.08, 10, base=True), 'gold', M((0, yd + 0.18, mz)), smooth=40)
        mb.add(prim_sphere(0.12, 0.12, 0.12, 8, 4), 'gold', M((0, top + 0.05, mz)), smooth=60)
        yy = yd + yh + 2.55
        X = SH.S.Xf(mb, M((0.0, yy, mz), (0, 90, 0)))
        SH.yard(X, V((0, 0, 0)), 2.7, 0.07, 'wood_dark', 'gold')
        # lais para a verga
        for sz in (-1, 1):
            mb.add(prim_box(0.05, 0.05, 0.2), 'iron', M((0.0, yy, mz + sz * 0.5)))
        # ovéns (cabos) do mastro ao bordo
        for sg in (-1, 1):
            for dz in (-0.18, 0.0, 0.18):
                p0 = V((sg * 0.04, yd + 3.2, mz + dz * 0.4))
                p1 = V((sg * 1.55, yd + 0.45, mz + dz * 2.2))
                beam(mb, tuple(p0), tuple(p1), 0.022, 0.022, 'rope')
    # cesto da gávea no mastro principal
    SH.crow_nest(mb, V((0.0, 7.45, MASTS[1][0])), 0.36, 0.26, 'wood_dark', 'gold')
    # --- castelo de popa: plataforma, escada, torre de pedra com ameias
    qh = QD_Y - DECK
    qz = (QD_Z0 + QD_Z1) / 2
    qw = 1.62
    SH.deck_box(mb, M((0.0, DECK + qh / 2, qz)), qw * 2, qh, QD_Z1 - QD_Z0 - 0.0, top='deck', side='wood', bevel=0.02)
    mb.add(prim_box(qw * 2 + 0.06, 0.07, 0.1), 'gold', M((0.0, QD_Y - 0.04, QD_Z1 + 0.03)), bevel=0.01)
    mb.add(prim_box(qw * 2 + 0.06, 0.06, 0.1), 'gold', M((0.0, DECK + 0.05, QD_Z1 + 0.03)), bevel=0.01)
    # painéis frontais do castelo de popa: moldura dourada com campo azul + portinhola
    for sx in (-1, 1):
        mb.add(prim_box(0.8, qh * 0.72, 0.04), 'team', M((sx * 0.95, DECK + qh / 2, QD_Z1 + 0.04)), bevel=0.01)
        mb.add(prim_box(0.86, 0.045, 0.06), 'gold', M((sx * 0.95, DECK + qh * 0.9, QD_Z1 + 0.04)))
        mb.add(prim_box(0.86, 0.045, 0.06), 'gold', M((sx * 0.95, DECK + qh * 0.1, QD_Z1 + 0.04)))
    # escada de madeira (bombordo) do convés ao castelo
    SH.stairs(mb, (-1.05, DECK + 0.03, QD_Z1 + 1.05), (-1.05, QD_Y + 0.0, QD_Z1 + 0.05), 0.5, 8)
    for sx in (-1.31, -0.79):
        beam(mb, (sx, DECK + 0.15, QD_Z1 + 1.05), (sx, QD_Y + 0.5, QD_Z1 + 0.05), 0.05, 0.05, 'gold')
        mb.add(prim_cyl(0.05, 0.05, 0.5, 6, base=True), 'wood_dark', M((sx, QD_Y, QD_Z1 + 0.05)))
    # torre de pedra
    cw, cd, ch = 0.98, 0.88, 1.35
    cz = -3.75
    cy = QD_Y
    mb.add(prim_box(cw * 2, ch, cd * 2, taper=(0.99, 0.99)), 'stone', M((0.0, cy + ch / 2, cz)), bevel=0.03)
    mb.add(prim_box(cw * 2 + 0.06, 0.2, cd * 2 + 0.06), 'team', M((0.0, cy + 0.1, cz)), bevel=0.012)
    mb.add(prim_box(cw * 2 + 0.1, 0.05, cd * 2 + 0.1), 'gold', M((0.0, cy + 0.215, cz)), bevel=0.008)
    mb.add(prim_box(cw * 2 + 0.16, 0.12, cd * 2 + 0.16), 'stone', M((0.0, cy + ch + 0.06, cz)), bevel=0.015)
    # ameias
    for sx in range(-3, 4):
        for sz in (-1, 1):
            mb.add(prim_box(0.22, 0.3, 0.2), 'stone', M((sx * 0.31, cy + ch + 0.27, cz + sz * (cd + 0.03))), bevel=0.012)
    for sz in range(-2, 3):
        for sx in (-1, 1):
            if sz in (-2, 2):
                continue
            mb.add(prim_box(0.2, 0.3, 0.22), 'stone', M((sx * (cw + 0.03), cy + ch + 0.27, cz + sz * 0.32)), bevel=0.012)
    # porta em arco azul (frente da torre) com tábuas e ferragens
    zf = cz + cd
    arch2 = [(-0.24, 0.0), (0.24, 0.0), (0.24, 0.52), (0.17, 0.72), (0.0, 0.8), (-0.17, 0.72), (-0.24, 0.52)]
    mb.add(prim_extrude([(x * 1.35, y * 1.15) for (x, y) in arch2], 0.05, axis='z'), 'team', M((0.0, cy + 0.2, zf + 0.0)), bevel=0.01)
    mb.add(prim_extrude(arch2, 0.07, axis='z'), 'wood_dark', M((0.0, cy + 0.2, zf + 0.012)), bevel=0.008)
    for dx in (-0.12, 0.12):
        mb.add(prim_box(0.02, 0.7, 0.08), 'iron', M((dx, cy + 0.55, zf + 0.012)))
    for dy in (0.35, 0.7):
        mb.add(prim_box(0.46, 0.045, 0.08), 'iron', M((0.0, cy + dy, zf + 0.012)))
    # janelas-seteira e escudos na torre
    for dx in (-0.6, 0.6):
        mb.add(prim_box(0.1, 0.34, 0.06), 'dark', M((dx, cy + 0.85, zf + 0.0)))
        mb.add(prim_box(0.16, 0.4, 0.04), 'steel', M((dx, cy + 0.85, zf - 0.01)), bevel=0.008)
    for sx in (-1, 1):
        mb.add(prim_box(0.06, 0.34, 0.1), 'dark', M((sx * (cw + 0.0), cy + 0.85, cz + 0.2)))
    # cantoneiras azuis nas arestas da torre
    for sx in (-1, 1):
        for sz in (-1, 1):
            mb.add(prim_box(0.12, ch * 0.9, 0.12), 'steel', M((sx * (cw - 0.01), cy + ch * 0.5, cz + sz * (cd - 0.01))), bevel=0.012)
    # barris e corda sobre o castelo
    cask(mb, M((1.32, QD_Y, -3.15)), 0.14, 0.3, 'wood', 'iron', n=8)
    cask(mb, M((1.32, QD_Y, -3.5)), 0.14, 0.3, 'wood', 'iron', n=8)
    rope_coil(mb, M((-1.25, QD_Y + 0.02, -4.35)), 0.2, 0.04, 2)
    # mastro de bandeira de popa (haste dourada) e cavalete do canhão giratório
    fp = V((-1.38, QD_Y, -4.6))
    SH.mast(mb, fp, fp + V((0, 3.4, 0)), 0.07, 0.055, 'wood_dark', 'gold', n=8, bands=(0.1, 0.5, 0.85))
    mb.add(prim_sphere(0.08, 0.08, 0.08, 7, 4), 'gold', M(tuple(fp + V((0, 3.46, 0)))), smooth=60)
    mb.add(prim_cyl(0.2, 0.2, 0.5, 8, base=True), 'wood_dark', M((1.25, QD_Y, -4.2)), smooth=40, bevel=0.015)
    mb.add(prim_cyl(0.26, 0.26, 0.06, 8, base=True), 'iron', M((1.25, QD_Y + 0.46, -4.2)), smooth=40)
    # lanternas de popa
    for sx in (-1, 1):
        mb.add(prim_box(0.22, 0.34, 0.22, taper=(0.8, 0.8)), 'brass', M((sx * 1.45, 2.8, z0 + 0.12)), bevel=0.02)
        mb.add(prim_box(0.12, 0.2, 0.12), 'glass', M((sx * 1.45, 2.8, z0 + 0.12)))
        mb.add(prim_cone(0.14, 0.14, 4), 'gold', M((sx * 1.45, 2.97, z0 + 0.12)))
    return mb.build(mats, parent=root)


def build_turret(mats, root, name, pivot, scale, rot_y=0.0):
    mb = MeshBuilder(name)
    ay, fz = SH.turret_housing(mb, r=0.82 * scale, h=0.78, shell='brass', top='steel_hi', plate='steel_dark',
                               roof_mat='team', scale=1.0)
    # frente em aço (mantelete) com friso dourado e rebites
    mb.add(prim_box(0.96 * scale, 0.46, 0.2), 'steel', M((0, ay, fz + 0.04)), bevel=0.025)
    mb.add(prim_box(1.0 * scale, 0.05, 0.22), 'gold', M((0, ay + 0.26, fz + 0.04)), bevel=0.008)
    mb.add(prim_box(1.0 * scale, 0.05, 0.22), 'gold', M((0, ay - 0.26, fz + 0.04)), bevel=0.008)
    for sx in (-1, 1):
        mb.add(prim_cyl(0.14, 0.14, 0.12, 8, base=False), 'gold', M((sx * 0.27 * scale, ay, fz + 0.14), (90, 0, 0)), smooth=30)
        for dy in (-0.15, 0.15):
            stud(mb, V((sx * 0.43 * scale, ay + dy, fz + 0.15)), (0, 0, 1), 0.024, 'steel_hi')
    # painéis laterais de aço e brasão
    for sg in (-1, 1):
        mb.add(prim_box(0.05, 0.4, 0.7 * scale), 'steel', M((sg * 0.72 * scale, ay - 0.05, -0.05), (0, 0, sg * 8)), bevel=0.01)
    t = mb.build(mats, parent=root, location=pivot)
    C.set_rot_game(t, (0.0, rot_y, 0.0))
    return t, ay, fz, scale


def build_cannon(mats, parent, name, ay, fz, scale):
    mb = MeshBuilder(name)
    for sx in (-1, 1):
        barrel_gun(mb, M((sx * 0.27 * scale, 0, 0)), 1.55, 0.12, 'steel_dark', 'gold', n=8, flare=1.0)
        mb.add(prim_cyl(0.095, 0.095, 0.03, 8, base=False), 'steel_hi', M((sx * 0.27 * scale, 0, 1.55 - 0.015), (90, 0, 0)))
    mb.add(prim_box(0.8 * scale, 0.14, 0.12), 'gold', M((0, 0, 0.12)), bevel=0.012)
    return mb.build(mats, parent=parent, location=(0.0, ay, fz + 0.1))


def build_cannon3(mats, root):
    """Canhão giratório de popa (cano em +z local; o nó gira em y e tem um berço de ferro)."""
    mb = MeshBuilder('Cannon3')
    mb.add(prim_cyl(0.16, 0.16, 0.18, 8, base=True), 'iron', M((0, 0, 0)), smooth=40, bevel=0.01)
    for sx in (-1, 1):
        mb.add(prim_box(0.06, 0.3, 0.3), 'wood_dark', M((sx * 0.17, 0.3, 0.0)), bevel=0.01)
    barrel_gun(mb, M((0, 0.45, -0.15)), 1.05, 0.12, 'steel_dark', 'gold', n=8)
    mb.add(prim_box(0.36, 0.05, 0.08), 'gold', M((0, 0.45, 0.0)))
    t = mb.build(mats, parent=root, location=(1.25, QD_Y + 0.52, -4.2))
    C.set_rot_game(t, (0.0, 150.0, 0.0))
    return t


def build_sail(mats, root, idx):
    mz, top, yh = MASTS[idx]
    mb = MeshBuilder(f'Sail{idx + 1}')
    yy = DECK + yh + 2.55
    # velas voltadas para os bordos (plano ao longo do eixo do navio), pano creme, campo azul de time e brasão
    T = M((0.0, 0.0, 0.0), (0, 90, 0))
    SH.sail(mb, T, 2.35, 2.75, 0.55, 'team', 'sail', 'gold', both=True, flare=0.1, sway=0.02, tilt=0.12)
    return mb.build(mats, parent=root, location=(0.0, yy - 0.06, mz))


def build_flag(mats, root):
    mb = MeshBuilder('Flag')
    X = SH.S.Xf(mb, M((0, 0, 0), (0, 90, 0)))
    SH.flag(X, 1.5, 0.78, 'team', 'gold', True, amp=0.09, fx=3.0, ph=0.4, tail=0.35)
    return mb.build(mats, parent=root, location=(-1.38, QD_Y + 3.0, -4.6))


def main():
    args = C.script_args()
    C.reset_scene()
    mats = C.make_paint_set(PALETTE)
    root = C.make_empty('Dreadnought')
    hull = build_hull(mats, root)
    t1, ay1, fz1, s1 = build_turret(mats, root, 'Turret1', TUR1, 0.9)
    c1 = build_cannon(mats, t1, 'Cannon1', ay1, fz1, s1)
    t2, ay2, fz2, s2 = build_turret(mats, root, 'Turret2', TUR2, 1.12)
    c2 = build_cannon(mats, t2, 'Cannon2', ay2, fz2, s2)
    c3 = build_cannon3(mats, root)
    sails = [build_sail(mats, root, i) for i in range(3)]
    flag = build_flag(mats, root)
    parts = [hull, t1, c1, t2, c2, c3] + sails + [flag]
    w = {'Hull': 1.0, 'Turret1': 0.8, 'Turret2': 0.9, 'Cannon1': 0.5, 'Cannon2': 0.5, 'Cannon3': 0.4, 'Flag': 0.5}
    for i in range(3):
        w[f'Sail{i + 1}'] = 0.6
    SH.finish_ship('dreadnought', 'dreadnought.glb', 'dreadnought_atlas', root, parts, w, TEAM_DEFAULT, args,
                   tex=int(os.environ.get('ATLAS', 1024)), game_dist=26.0)


if __name__ == '__main__':
    main()
