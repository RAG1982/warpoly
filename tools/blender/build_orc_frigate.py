"""
build_orc_frigate.py — Fragata ORC (tipo interno `orc_frigate`, raiz `OrcFrigate`) gerada 100% por script.

Referência: docs/refs/naval/orc_ships_ref.png ("Orcish Battleship"): casco de tábuas com placas de ferro enferrujado,
rebites e espinhos de osso, proa em forma de cabeça de javali de ferro com presas, torres blindadas de canos triplos
(proa) e duplos (popa), torre central de madeira com cesto de espinhos, estandarte vertical com caveira, caveiras
decorativas, chaminé e tubos de escape, canhoneiras laterais.

Uso:
  blender -b --factory-startup --python tools/blender/build_orc_frigate.py -- [--no-render]

Hierarquia (igual à fragata humana; proa = +Z, y = 0 na linha d'água, casco ~7 u + focinho):
  OrcFrigate (raiz)
  ├─ Hull        casco, cabeça de javali, torre central, chaminé, mastro (Atlas + TeamColor: faixa e placas)
  ├─ Turret1     torre de proa (pivô (0, convés, +2,3), gira em Y)   └─ Cannon1  3 canos (recuo em z)
  ├─ Turret2     torre de popa (pivô (0, convés, −2,62), voltada para trás) └─ Cannon2  2 canos
  ├─ Sail        verga e panos rasgados no mastro (Atlas + TeamColor)
  ├─ Flag        estandarte de caveira no topo do mastro (TeamColor)
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
from ship_common import V, Hull, beam, tube, orient, rect_tube, stud, cask, rope_coil, barrel_gun  # noqa: E402
import orc_ship_common as OC  # noqa: E402

TEAM_DEFAULT = '#c0301f'
PALETTE = dict(OC.PALETTE)

L = 7.0
DECK = 0.92
HULL = dict(
    hw=[(0, 1.1), (0.06, 1.28), (0.2, 1.42), (0.5, 1.46), (0.72, 1.36), (0.86, 1.08), (0.95, 0.66), (1.0, 0.3)],
    yk=[(0, -0.28), (0.15, -0.38), (0.7, -0.38), (0.9, -0.2), (1.0, 0.3)],
    yg=[(0, 1.32), (0.3, 1.22), (0.68, 1.22), (0.78, 1.4), (0.9, 1.5), (1.0, 1.68)],
    bul=[(0, 0.3), (1, 0.3)],
)
PROF = [(1.0, 1.0), (1.015, 0.88), (0.995, 0.62), (0.92, 0.40), (0.9, 0.355), (0.72, 0.2), (0.42, 0.08), (0.0, 0.0)]
SEGS = ['plate_dark', 'owood', 'owood', 'team', 'plate', 'plate', 'plate_dark']
TUR1_Z, TUR2_Z = 2.3, -2.62
TOWER_Z = 0.05
FUN_Z = -1.2
FUN_H = 1.55
MAST_TOP = 4.45


def ngon(r, n=8, k=1.0, off=math.pi / 8):
    return [(r * math.cos(2 * math.pi * i / n + off), r * k * math.sin(2 * math.pi * i / n + off)) for i in range(n)]


def make_hull():
    return Hull(L, 0.0, HULL['hw'], HULL['yk'], HULL['yg'], HULL['bul'], PROF, SEGS, n=32, t=0.14,
                deck='odeck', inner='owood_dark', rail='plate_dark', cap='plate', bottom='plate_dark', flat_deck=DECK)


def boar_head(mb0, z1, s=1.5):
    """Cabeça de javali de ferro na proa, voltada para +Z, com presas de osso (escala s em torno da nuca)."""
    P = V((0.0, 0.5, z1 - 0.5))
    mb = SH.S.Xf(mb0, Matrix.Translation(P) @ Matrix.Scale(s, 4) @ Matrix.Translation(-P))
    cx, cy, cz = 0.0, 0.88, z1 - 0.3
    # crânio, bochechas e testa
    mb.add(prim_box(1.15, 0.85, 0.95, taper=(0.82, 0.8)), 'plate', M((cx, cy + 0.08, cz)), bevel=0.04)
    for sg in (-1, 1):
        mb.add(prim_box(0.34, 0.6, 0.7, taper=(0.8, 0.8)), 'plate_dark', M((sg * 0.52, cy - 0.02, cz + 0.12), (0, sg * -10, 0)), bevel=0.03)
        for dz in (-0.15, 0.1, 0.3):
            stud(mb, V((sg * 0.64, cy + 0.15, cz + 0.12 + dz)), (sg, 0, 0), 0.035, 'steel_hi')
    # focinho (tronco) + disco do nariz com narinas
    sn = V((cx, cy - 0.16, cz + 0.25))
    mb.add(prim_cyl(0.36, 0.27, 0.62, 10, base=True), 'plate', Matrix.Translation(sn) @ orient((0, 0, 1)), smooth=35, bevel=0.01)
    nose = sn + V((0, 0, 0.62))
    mb.add(prim_cyl(0.31, 0.3, 0.1, 10, base=True), 'plate_dark', Matrix.Translation(nose) @ orient((0, 0, 1)), smooth=35)
    for dx in (-0.1, 0.1):
        mb.add(prim_box(0.08, 0.13, 0.05), 'dark', M((dx, nose.y + 0.02, nose.z + 0.11)))
    # boca com dentes e mandíbula
    mb.add(prim_box(0.62, 0.1, 0.5), 'dark', M((cx, cy - 0.45, cz + 0.5)))
    mb.add(prim_box(0.58, 0.12, 0.5), 'plate_dark', M((cx, cy - 0.54, cz + 0.45)), bevel=0.02)
    for dx in (-0.2, -0.07, 0.07, 0.2):
        OC.spike(mb, (dx, cy - 0.41, cz + 0.72), (0, 1, 0.1), 0.03, 0.12, 'bone', k=4)
    # presas curvas de osso
    for sg in (-1, 1):
        pts = bezier((sg * 0.28, cy - 0.38, cz + 0.55), (sg * 0.46, cy - 0.5, cz + 0.8), (sg * 0.48, cy - 0.1, cz + 1.05), 5)
        pts += bezier((sg * 0.48, cy - 0.1, cz + 1.05), (sg * 0.5, cy + 0.08, cz + 1.12), (sg * 0.42, cy + 0.2, cz + 1.05), 3)[1:]
        tube(mb, pts, [0.075 * (1 - 0.88 * i / (len(pts) - 1)) for i in range(len(pts))], 'bone', n=6, smooth=55)
        mb.add(prim_cyl(0.095, 0.095, 0.05, 6, base=False), 'plate_dark', M(tuple(V(pts[0]) + V((0, 0, 0.03))), (90, 0, 0)))
    # olhos vermelhos com sobrancelha de ferro; orelhas; crista de espinhos
    for sg in (-1, 1):
        mb.add(prim_box(0.16, 0.1, 0.06), 'dark', M((sg * 0.3, cy + 0.24, cz + 0.5), (0, 0, sg * -10)))
        mb.add(prim_box(0.06, 0.06, 0.04), 'red', M((sg * 0.3, cy + 0.24, cz + 0.535)))
        beam(mb, (sg * 0.12, cy + 0.42, cz + 0.52), (sg * 0.5, cy + 0.3, cz + 0.45), 0.1, 0.12, 'plate_dark', bevel=0.012)
        mb.add(prim_extrude([(-0.14, 0), (0.14, 0), (0.0, 0.34)], 0.06, axis='z'), 'plate_dark',
               M((sg * 0.46, cy + 0.5, cz - 0.1), (0, 0, -sg * 25)), bevel=0.008)
    for i, dz in enumerate((0.35, 0.05, -0.25)):
        OC.spike_base(mb, (0, cy + 0.5, cz + dz), (0, 1, -0.2), 0.07, 0.34)
    for sg in (-1, 1):
        OC.spike_base(mb, (sg * 0.3, cy + 0.5, cz + 0.2), (sg * 0.35, 1, 0.0), 0.05, 0.26)
    # aro do nariz
    mb.add(SH.torus(0.1, 0.022, 10, 5), 'plate_dark', M((0, nose.y - 0.26, nose.z + 0.04)), smooth=60)


def build_hull(mats, root):
    mb = MeshBuilder('Hull')
    h = make_hull()
    h.build(mb)
    z0, z1 = h.z0, h.z1
    yd = DECK
    # amurada de ferro, cintas e rebites
    h.rail_cap(mb, 'plate_dark', 0.32, 0.09, za=z0 + 0.03, zb=z1 - 0.12, bevel=0.025, n=30)
    h.band(mb, 0.88, z0 + 0.02, z1 - 0.12, 0.07, 0.04, 'plate', n=28)
    h.band(mb, 0.3, z0 + 0.1, z1 - 0.3, 0.07, 0.045, 'plate_dark', n=22)
    h.studs(mb, 0.93, z0 + 0.3, z1 - 0.5, 0.36, 'steel_hi', r=0.036, off=0.02)
    h.studs(mb, 0.47, z0 + 0.3, z1 - 0.7, 0.46, 'steel_hi', r=0.032, off=0.02)
    # placas de ferro grandes aparafusadas (3 por bordo) com espinhos e caveiras
    for k, z in enumerate((2.0, -0.05, -2.0)):
        for sg in (-1, 1):
            p, n = h.P(z, 0.63, sg), h.N(z, 0.63, sg)
            m = SH.frame_at(p + n * 0.012, n)
            mb.add(prim_extrude([(-0.62, 0.45), (0.62, 0.45), (0.7, -0.05), (0.5, -0.45), (-0.5, -0.45), (-0.7, -0.05)], 0.06, axis='z'),
                   'plate', m @ M((0, 0.05, 0.0)), bevel=0.012)
            mb.add(prim_extrude([(-0.5, 0.33), (0.5, 0.33), (0.56, -0.04), (0.4, -0.34), (-0.4, -0.34), (-0.56, -0.04)], 0.07, axis='z'),
                   'plate_dark', m @ M((0, 0.05, 0.0)), bevel=0.01)
            for (dx, dy) in ((-0.55, 0.38), (0.55, 0.38), (-0.6, -0.2), (0.6, -0.2)):
                stud(mb, m @ V((dx, dy, 0.07)), n, 0.035, 'steel_hi')
            if k == 1:
                OC.skull(mb, m @ M((0, 0.04, 0.09)), 1.7)
            else:
                OC.spike_base(mb, m @ V((0, 0.05, 0.08)), n + V((0, 0.4, 0)), 0.08, 0.38)
    # costuras verticais de ferro
    for z in (-2.75, -1.4, 1.3, 2.6):
        for sg in (-1, 1):
            a, b = h.P(z, 0.87, sg), h.P(z, 0.41, sg)
            n = h.N(z, 0.65, sg)
            beam(mb, tuple(a + n * 0.02), tuple(b + n * 0.02), 0.09, 0.035, 'plate_dark', bevel=0.008)
    # fileira de espinhos de osso saindo da cinta superior, e canhoneiras
    for z in (-3.1, -2.45, -1.7, -1.05, -0.4, 0.55, 1.2, 1.7, 2.45, 3.0):
        for sg in (-1, 1):
            p, n = h.P(z, 0.87, sg), h.N(z, 0.87, sg)
            OC.spike_base(mb, p + n * 0.03, n + V((0, 0.75, 0)), 0.05, 0.3)
    for z in (1.0, -1.05, -3.0):
        for sg in (-1, 1):
            p, n = h.P(z, 0.57, sg), h.N(z, 0.57, sg)
            m = SH.frame_at(p + n * 0.004, n)
            SH.port_frame(mb, m, 0.26, 0.26, 'plate_dark', t=0.06, d=0.07)
            barrel_gun(mb, m @ M((0, 0, -0.05)), 0.4, 0.085, 'iron', 'plate_dark', n=8, flare=1.05)
    # cabeça de javali
    boar_head(mb, z1)
    # --- convés
    for (x, z) in ((0.95, 3.0), (-0.95, 3.0), (1.0, -3.0), (-1.0, -3.0)):
        mb.add(prim_cyl(0.08, 0.065, 0.22, 8, base=True), 'plate_dark', M((x, yd, z)), smooth=40, bevel=0.01)
    for (x, z, R) in ((-0.6, 1.4, 0.22), (0.75, 1.15, 0.2)):
        rope_coil(mb, M((x, yd + 0.02, z)), R, 0.045, 3)
    for (x, z) in ((0.95, -0.3), (0.75, -0.55), (-0.95, -0.3), (-0.7, -0.5), (0.9, 0.6)):
        cask(mb, M((x, yd, z)), 0.15, 0.3, 'owood', 'plate_dark', n=8)
    OC.crate(mb, M((-0.9, yd, 0.9), (0, 12, 0)), 0.34)
    OC.crate(mb, M((-0.88, yd + 0.34, 0.92), (0, -20, 0)), 0.26)
    # --- torre central: tambor de madeira com cintas de ferro, 2º andar de placas, cesto de espinhos
    tz = TOWER_Z
    mb.add(prim_extrude(ngon(1.12, 8), 0.72, axis='y', center=False), 'owood', M((0, yd, tz)), bevel=0.03)
    mb.add(prim_extrude([(x * 1.04, z * 1.04) for (x, z) in ngon(1.12, 8)], 0.12, axis='y', center=False), 'plate', M((0, yd + 0.04, tz)), bevel=0.012)
    mb.add(prim_extrude([(x * 1.04, z * 1.04) for (x, z) in ngon(1.12, 8)], 0.12, axis='y', center=False), 'plate', M((0, yd + 0.55, tz)), bevel=0.012)
    for (x, z) in ngon(1.16, 8):
        stud(mb, V((x, yd + 0.61, tz + z)), (x, 0, z), 0.035, 'steel_hi')
    # janelas/seteiras e porta
    for i in range(8):
        a = 2 * math.pi * i / 8 + math.pi / 8 + math.pi / 8
        x, z = 1.1 * math.cos(a), 1.1 * math.sin(a)
        if i % 2 == 0:
            mb.add(prim_box(0.16, 0.26, 0.05), 'dark', M((x * 1.0, yd + 0.36, tz + z), (0, -math.degrees(a) + 90, 0)))
    mb.add(prim_extrude(ngon(0.92, 8), 0.5, axis='y', center=False), 'plate', M((0, yd + 0.76, tz)), bevel=0.03)
    for dy in (0.0, 0.42):
        mb.add(prim_extrude([(x * 1.03, z * 1.03) for (x, z) in ngon(0.92, 8)], 0.07, axis='y', center=False), 'plate_dark', M((0, yd + 0.76 + dy, tz)), bevel=0.01)
    for (x, z) in ngon(0.95, 8):
        stud(mb, V((x, yd + 1.06, tz + z)), (x, 0, z), 0.03, 'steel_hi')
    # plataforma superior com cesto (aro de ferro + espinhos)
    ty = yd + 1.26
    mb.add(prim_extrude(ngon(1.02, 8), 0.1, axis='y', center=False), 'owood_dark', M((0, ty, tz)), bevel=0.02)
    mb.add(prim_extrude(ngon(1.08, 8), 0.06, axis='y', center=False), 'plate_dark', M((0, ty + 0.1, tz)), bevel=0.012)
    for i in range(8):
        a = 2 * math.pi * i / 8 + math.pi / 8
        x, z = 1.0 * math.cos(a), 1.0 * math.sin(a)
        OC.spike_base(mb, (x, ty + 0.14, tz + z), (x * 0.3, 1.0, z * 0.3), 0.07, 0.4)
        mb.add(prim_box(0.12, 0.22, 0.12), 'owood_dark', M((x * 0.97, ty + 0.2, tz + z * 0.97)), bevel=0.01)
        OC.skull(mb, M((x * 1.06, yd + 0.78, tz + z * 1.06), (0, -math.degrees(a) + 90, 0)), 0.9) if i in (0, 4) else None
    # --- chaminé: tronco enferrujado com faixa e boca preta + tubos de escape
    mb.add(prim_cyl(0.36, 0.3, 1.0, 12, base=True), 'plate', M((0.0, yd, FUN_Z)), smooth=60)
    mb.add(prim_cyl(0.37, 0.37, 0.12, 12, base=True), 'plate_dark', M((0.0, yd + 0.45, FUN_Z)), smooth=40)
    mb.add(prim_cyl(0.3, 0.27, FUN_H - 1.0, 12, base=True), 'plate_dark', M((0.0, yd + 1.0, FUN_Z)), smooth=60)
    mb.add(prim_cyl(0.34, 0.34, 0.07, 12, base=True), 'plate', M((0.0, yd + FUN_H - 0.05, FUN_Z)), smooth=40)
    mb.add(prim_cyl(0.26, 0.26, 0.01, 12, base=True), 'dark', M((0.0, yd + FUN_H + 0.03, FUN_Z)))
    for i in range(6):
        a = 2 * math.pi * i / 6
        OC.spike(mb, (0.3 * math.cos(a), yd + FUN_H + 0.0, FUN_Z + 0.3 * math.sin(a)), (math.cos(a) * 0.6, 1, math.sin(a) * 0.6), 0.035, 0.2)
    for sg in (-1, 1):
        beam(mb, (sg * 0.33, yd + 0.6, FUN_Z), (sg * 0.6, yd, FUN_Z - 0.1), 0.05, 0.05, 'plate_dark')
    for k, x in enumerate((0.55, 0.85, -0.6)):
        pts = SH.smooth_path([(x, yd, -0.45), (x, yd + 0.6, -0.5), (x, yd + 0.95 - 0.1 * k, -0.7), (x, yd + 0.8, -0.95), (x, yd + 0.5, -1.0)], 3)
        tube(mb, pts, [0.1] * len(pts), 'plate_dark', n=8, smooth=60)
        mb.add(prim_cyl(0.14, 0.14, 0.07, 8, base=False), 'plate', M((x, yd + 0.25, -0.45)), smooth=30)
    # --- mastro principal (do alto da torre ao estandarte)
    SH.mast(mb, V((0.0, ty, tz)), V((0.0, MAST_TOP, tz)), 0.11, 0.07, 'owood_dark', 'plate_dark', n=8, bands=(0.1, 0.4, 0.75))
    OC.spike_base(mb, (0.0, MAST_TOP - 0.02, tz), (0, 1, 0), 0.06, 0.25)
    for sg in (-1, 1):
        beam(mb, (sg * 0.06, ty + 1.6, tz), (sg * 0.95, ty + 0.15, tz + sg * 0.0), 0.025, 0.025, 'rope')
    return mb.build(mats, parent=root)


def build_turret(mats, root, name, pivot, rot_y, scale, nb):
    mb = MeshBuilder(name)
    ay, fz = SH.turret_housing(mb, r=0.95, h=0.78, shell='plate', top='plate_dark', plate='plate_dark', team='plate',
                               roof_mat='plate_dark', scale=scale)
    # mantelete de ferro escuro, rebites, espinhos de teto
    mb.add(prim_box(1.0 * scale, 0.46 * scale, 0.2 * scale), 'plate_dark', M((0, ay, fz + 0.02)), bevel=0.025)
    for i in range(nb):
        x = (i - (nb - 1) / 2) * (0.54 / max(nb - 1, 1) * 1.0 if nb > 1 else 0) * scale * (1.0 if nb == 3 else 1.0)
        mb.add(prim_cyl(0.14 * scale, 0.14 * scale, 0.1, 8, base=False), 'plate', M((x, ay, fz + 0.14 * scale), (90, 0, 0)), smooth=30)
    for sx in (-1, 1):
        for dy in (-0.15, 0.15):
            stud(mb, V((sx * 0.45 * scale, ay + dy * scale, fz + 0.13 * scale)), (0, 0, 1), 0.03, 'steel_hi')
        OC.spike_base(mb, (sx * 0.62 * scale, 0.3 * scale + 0.78 * scale * 0.97, 0.1), (sx * 0.4, 1, 0), 0.06, 0.34)
    OC.spike_base(mb, (0.0, 0.3 * scale + 0.78 * scale, -0.6 * scale), (0, 1, -0.3), 0.06, 0.34)
    t = mb.build(mats, parent=root, location=pivot)
    C.set_rot_game(t, (0.0, rot_y, 0.0))
    return t, ay, fz, scale


def build_cannon(mats, parent, name, ay, fz, scale, nb):
    mb = MeshBuilder(name)
    sp = 0.3 * scale if nb == 3 else 0.27 * scale
    rr = 0.105 if nb == 3 else 0.125
    for i in range(nb):
        x = (i - (nb - 1) / 2) * (sp if nb == 3 else sp * 2)
        barrel_gun(mb, M((x, 0, 0)), 1.6, rr, 'iron', 'plate_dark', n=8, flare=1.0)
        mb.add(prim_cyl(rr * 0.8, rr * 0.8, 0.03, 8, base=False), 'plate', M((x, 0, 1.6 - 0.015), (90, 0, 0)))
    mb.add(prim_box(0.82 * scale, 0.14, 0.12), 'plate', M((0, 0, 0.14)), bevel=0.012)
    return mb.build(mats, parent=parent, location=(0.0, ay, fz + 0.1 * scale))


def build_sail(mats, root):
    """Verga no mastro com pano rasgado (creme sujo + remendo de time) e tiras pendentes."""
    mb = MeshBuilder('Sail')
    mz = TOWER_Z
    ys = 3.35
    SH.yard(mb, V((0.0, ys, mz)), 2.0, 0.055, 'owood_dark', 'plate_dark', angle=10.0)
    for sg in (-1, 1):
        OC.spike(mb, (sg * 1.02, ys + 0.18 * sg, mz), (sg, 0.3, 0), 0.04, 0.22, 'spike')
    for k, sg in enumerate((-1, 1)):
        x0 = sg * 0.5
        y0 = ys + math.tan(math.radians(10)) * x0 - 0.04
        OC.tatter(mb, M((x0, y0, mz + 0.14), (0, 0, 10)), 0.82, 0.78, 'cloth', seed=11 + k, d=0.045, teeth=4)
        OC.tatter(mb, M((x0, y0 - 0.05, mz + 0.17), (0, 0, 10)), 0.5, 0.42, 'team', seed=21 + k, d=0.03, teeth=3)
        mb.add(prim_box(0.86, 0.04, 0.06), 'rope', M((x0, y0 - 0.01, mz + 0.14), (0, 0, 10)))
    mb.add(prim_cyl(0.18, 0.18, 0.08, 10, base=False), 'team', M((0.0, ys, mz)), smooth=30)
    return mb.build(mats, parent=root)


def build_flag(mats, root):
    """Estandarte vertical com caveira (pendurado de uma travessa) no topo do mastro."""
    mb = MeshBuilder('Flag')
    mb.add(prim_cyl(0.025, 0.02, 0.5, 6, base=True), 'plate_dark', M((0, 0, 0)))
    mb.add(prim_box(0.62, 0.05, 0.05), 'plate_dark', M((0, 0.38, 0)), bevel=0.006)
    OC.spike(mb, (0.31, 0.38, 0), (1, 0, 0), 0.03, 0.14)
    OC.spike(mb, (-0.31, 0.38, 0), (-1, 0, 0), 0.03, 0.14)
    ban = [(-0.27, 0.0), (0.27, 0.0), (0.27, -0.75), (0.0, -0.98), (-0.27, -0.75)]
    v, f = prim_extrude(ban, 0.03, axis='z')
    mb.add((SH.wave(v, 0.04, 5.0, 3.0, 0.3), f), 'plate_dark', M((0, 0.36, 0)), smooth=40)
    v, f = prim_extrude([(x * 0.84, y * 0.84 - 0.02) for (x, y) in ban], 0.045, axis='z')
    mb.add((SH.wave(v, 0.04, 5.0, 3.0, 0.3), f), 'team', M((0, 0.36, 0)), smooth=40)
    OC.skull(mb, M((0.0, 0.0, 0.05)), 2.0)
    OC.skull(mb, M((0.0, 0.62, 0.0)), 1.1)
    return mb.build(mats, parent=root, location=(0.0, MAST_TOP + 0.12, TOWER_Z))


def main():
    args = C.script_args()
    C.reset_scene()
    mats = C.make_paint_set(PALETTE)
    root = C.make_empty('OrcFrigate')
    hull_obj = build_hull(mats, root)
    t1, ay, fz, s1 = build_turret(mats, root, 'Turret1', (0.0, DECK, TUR1_Z), 0.0, 1.0, 3)
    c1 = build_cannon(mats, t1, 'Cannon1', ay, fz, s1, 3)
    t2, ay2, fz2, s2 = build_turret(mats, root, 'Turret2', (0.0, DECK, TUR2_Z), 180.0, 0.88, 2)
    c2 = build_cannon(mats, t2, 'Cannon2', ay2, fz2, s2, 2)
    sail = build_sail(mats, root)
    flag = build_flag(mats, root)
    C.make_empty('Anim_Smoke', (0.0, DECK + FUN_H + 0.05, FUN_Z), parent=root)
    parts = [hull_obj, t1, c1, t2, c2, sail, flag]
    SH.finish_ship('orc_frigate', 'orc_frigate.glb', 'orc_frigate_atlas', root, parts,
                   {'Hull': 1.0, 'Turret1': 0.8, 'Turret2': 0.8, 'Cannon1': 0.5, 'Cannon2': 0.5, 'Sail': 0.7, 'Flag': 0.5},
                   TEAM_DEFAULT, args, tex=int(os.environ.get('ATLAS', 512)), game_dist=19.0)


if __name__ == '__main__':
    main()
