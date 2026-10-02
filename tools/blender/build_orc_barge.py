"""
build_orc_barge.py — Barcaça de transporte ORC (tipo interno `orc_barge`, raiz `OrcBarge`) gerada 100% por script.

Referência: docs/refs/naval/orc_ships_ref.png ("Orcish Transport Ship"): casco de tábuas escuras com cintas de ferro
enferrujado e remendos de pano/couro rasgado pendurados na amurada, rampa de proa de madeira com correntes e espinhos,
dois postes de proa com argolas e correntes, torre de vigia de madeira e ferro, caixotes, barris, rolos de corda,
canhão pequeno e espinhos.

Uso:
  blender -b --factory-startup --python tools/blender/build_orc_barge.py -- [--no-render]

Hierarquia (igual à barcaça humana; proa = +Z, y = 0 na linha d'água, casco ~6 u):
  OrcBarge (raiz)
  ├─ Hull   casco, convés, torre de vigia, postes de proa, caixotes, barris, canhão (Atlas + TeamColor: faixa e pano)
  ├─ Crane  derrick com braço de madeira (pivô no topo do pedestal, gira em Y)
  │   └─ Hook  corrente + gancho (pivô na ponta do braço)
  ├─ Ramp   rampa de proa (pivô na dobradiça de proa; repouso inclinada ~32° para baixo)
  └─ Flag   estandarte da torre de vigia (TeamColor)
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

L = 6.0
DECK = 0.82
HULL = dict(
    hw=[(0, 0.95), (0.05, 1.1), (0.2, 1.25), (0.55, 1.3), (0.8, 1.2), (0.93, 0.98), (0.98, 0.8), (1.0, 0.68)],
    yk=[(0, -0.30), (0.15, -0.42), (0.8, -0.42), (1.0, 0.15)],
    yg=[(0, 1.7), (0.1, 1.5), (0.3, 1.2), (0.7, 1.14), (0.9, 1.28), (1.0, 1.42)],
    bul=[(0, 0.3), (1, 0.3)],
)
PROF = [(1.0, 1.0), (1.0, 0.9), (1.04, 0.74), (1.05, 0.5), (1.03, 0.43), (0.9, 0.28), (0.6, 0.12), (0.0, 0.0)]
SEGS = ['owood_dark', 'owood', 'owood', 'team', 'owood_dark', 'owood_dark', 'owood_dark']

TOWER_Z = -1.55
CRANE_P = (-0.55, DECK + 1.2, 0.75)
POST_Z = 2.2
FLAG_P = (0.0, 0.0, 0.0)  # preenchido em build_flag


def make_hull():
    return Hull(L, 0.0, HULL['hw'], HULL['yk'], HULL['yg'], HULL['bul'], PROF, SEGS, n=26, t=0.14, deck='odeck',
                inner='owood_dark', rail='owood_dark', cap='owood_dark', bottom='owood_dark', flat_deck=DECK)


def build_hull(mats, root):
    mb = MeshBuilder('Hull')
    h = make_hull()
    h.build(mb)
    z0, z1 = h.z0, h.z1
    yd = DECK
    # capa da amurada e cintas de ferro enferrujado com rebites
    h.rail_cap(mb, 'plate_dark', 0.3, 0.09, za=z0 + 0.03, zb=z1 - 0.05, bevel=0.02)
    h.band(mb, 0.76, z0 + 0.1, z1 - 0.1, 0.07, 0.035, 'plate_dark', n=24)
    h.band(mb, 0.36, z0 + 0.1, z1 - 0.1, 0.07, 0.035, 'plate_dark', n=24)
    h.studs(mb, 0.76, z0 + 0.2, z1 - 0.3, 0.32, 'steel_hi', r=0.024, off=0.02)
    # costelas de ferro (arcos largos do casco) com espinhos no alto
    for z in (-2.35, -1.05, 0.25, 1.5):
        for sg in (-1, 1):
            a, b = h.P(z, 0.96, sg), h.P(z, 0.22, sg)
            n = h.N(z, 0.6, sg)
            beam(mb, tuple(a + n * 0.025), tuple(b + n * 0.025), 0.13, 0.05, 'plate', bevel=0.01)
            p = h.P(z, 0.99, sg)
            OC.spike_base(mb, p + h.N(z, 0.95, sg) * 0.01, (sg * 0.55, 1.0, 0.0), 0.05, 0.3)
    # remendos de pano e couro rasgado pendurados da amurada (TeamColor nos centrais)
    k = 0
    for z in (-2.5, -1.7, -0.75, 0.15, 0.95, 1.8, 2.4):
        for sg in (-1, 1):
            p, n = h.P(z, 0.97, sg), h.N(z, 0.8, sg)
            m = SH.frame_at(p + n * 0.035, n)
            mat = 'team' if (k % 3 == 0) else ('hide' if k % 3 == 1 else 'cloth')
            OC.tatter(mb, m, 0.62 + 0.1 * (k % 2), 0.62 + 0.12 * (k % 3), mat, seed=k, teeth=4)
            mb.add(prim_box(0.7, 0.05, 0.05), 'plate_dark', m @ M((0, -0.01, 0.015)), bevel=0.006)
            k += 1
    # âncora de ferro rústica não: argolas de atracação e canhoneira com tampa
    p, n = h.P(-0.4, 0.62, 1), h.N(-0.4, 0.62, 1)
    m = SH.frame_at(p + n * 0.004, n)
    SH.port_frame(mb, m, 0.3, 0.3, 'plate_dark', t=0.06, d=0.07)
    barrel_gun(mb, m @ M((0, 0, -0.05)), 0.4, 0.09, 'iron', 'plate_dark', n=8, flare=1.05)
    # caveira ao lado da canhoneira
    OC.skull(mb, SH.frame_at(h.P(-1.55, 0.7, 1) + h.N(-1.55, 0.7, 1) * 0.04, h.N(-1.55, 0.7, 1)), 1.0)
    # proa: focinho de ferro com espinhos na ponta do casco
    for sg in (-1, 1):
        beam(mb, (sg * 0.55, 0.8, z1 - 0.12), (sg * 0.45, 1.5, z1 - 0.2), 0.12, 0.08, 'plate_dark', bevel=0.01)
    # --- convés: caixotes, barris, cordas
    for (x, z, s, r) in ((0.55, -0.1, 0.34, 8), (0.9, 0.2, 0.3, 20), (0.5, 0.3, 0.3, -12), (0.78, -0.45, 0.28, 0)):
        OC.crate(mb, M((x, yd, z), (0, r, 0)), s)
    OC.crate(mb, M((0.58, yd + 0.34, 0.1), (0, 25, 0)), 0.28)
    OC.crate(mb, M((-0.9, yd, -0.35), (0, -15, 0)), 0.32)
    OC.crate(mb, M((-0.7, yd, -0.85), (0, 8, 0)), 0.28)
    for (x, z) in ((0.9, 0.75), (1.0, 1.1), (-0.95, 1.9), (0.1, -0.85)):
        cask(mb, M((x, yd, z)), 0.14, 0.3, 'owood', 'plate_dark', n=8)
    rope_coil(mb, M((0.7, yd + 0.02, 1.55)), 0.26, 0.05, 3)
    rope_coil(mb, M((-0.1, yd + 0.02, 0.1)), 0.2, 0.045, 2)
    # molinete (cabrestante) de ferro e madeira junto à proa
    mb.add(prim_cyl(0.16, 0.16, 0.3, 8, base=True), 'owood_dark', M((0.0, yd, 1.55)), smooth=40, bevel=0.01)
    for sg in (-1, 1):
        mb.add(prim_box(0.5, 0.06, 0.07), 'plate_dark', M((0.0, yd + 0.3, 1.55), (0, 90 * (sg > 0) + 20, 0)))
    # --- postes de proa (com colar de ferro, espinhos e corrente)
    for sg in (-1, 1):
        px = sg * 0.85
        mb.add(prim_box(0.3, 1.5, 0.3, taper=(0.8, 0.8)), 'owood', M((px, yd + 0.75, POST_Z)), bevel=0.02)
        mb.add(prim_box(0.38, 0.22, 0.38), 'plate', M((px, yd + 1.1, POST_Z)), bevel=0.015)
        mb.add(prim_box(0.34, 0.1, 0.34), 'plate_dark', M((px, yd + 0.45, POST_Z)), bevel=0.012)
        OC.spike_base(mb, (px, yd + 1.5, POST_Z), (0, 1, 0), 0.07, 0.3)
        for dx in (-1, 1):
            OC.spike_base(mb, (px + dx * 0.17, yd + 1.08, POST_Z), (dx, 0.3, 0), 0.04, 0.2)
        mb.add(SH.torus(0.07, 0.025, 10, 5), 'plate_dark', M((px, yd + 0.9, POST_Z + 0.17), (90, 0, 0)), smooth=60)
        OC.hang_chain(mb, (px, yd + 0.9, POST_Z + 0.2), (px * 0.5, yd + 1.5, POST_Z - 0.9), links=8, r=0.03, sag=0.2)
    # --- torre de vigia: pernas de madeira cruzadas, plataforma, cesto de ferro com blocos e dentes
    ty = yd
    tz = TOWER_Z
    tw = 0.55
    for (sx, sz) in ((-1, -1), (1, -1), (-1, 1), (1, 1)):
        beam(mb, (sx * 0.62, ty, tz + sz * 0.62), (sx * 0.5, ty + 1.65, tz + sz * 0.5), 0.17, 0.17, 'owood', bevel=0.015)
    for dy in (0.45, 1.1):
        for sx in (-1, 1):
            mb.add(prim_box(0.08, 0.1, 1.15), 'plate_dark', M((sx * 0.56, ty + dy, tz)), bevel=0.008)
        for sz in (-1, 1):
            mb.add(prim_box(1.15, 0.1, 0.08), 'plate_dark', M((0.0, ty + dy, tz + sz * 0.56)), bevel=0.008)
    for sx in (-1, 1):
        beam(mb, (sx * 0.6, ty + 0.1, tz - 0.6), (sx * 0.5, ty + 1.55, tz + 0.6), 0.06, 0.05, 'owood_dark')
    mb.add(prim_box(1.45, 0.14, 1.45), 'owood_dark', M((0.0, ty + 1.65, tz)), bevel=0.02)
    mb.add(prim_box(1.35, 0.06, 1.35), 'odeck', M((0.0, ty + 1.74, tz)), bevel=0.01)
    # cesto: quatro paredes de placa enferrujada com topo de blocos
    for (dx, dz, sx, sz) in ((0.62, 0.0, 0.1, 1.35), (-0.62, 0.0, 0.1, 1.35), (0.0, 0.62, 1.35, 0.1), (0.0, -0.62, 1.35, 0.1)):
        mb.add(prim_box(sx, 0.38, sz), 'plate', M((dx, ty + 1.97, tz + dz)), bevel=0.015)
        mb.add(prim_box(sx * (1.15 if sx < 0.5 else 1), 0.1, sz * (1.15 if sz < 0.5 else 1)), 'plate_dark', M((dx, ty + 2.2, tz + dz)), bevel=0.012)
    for (sx, sz) in ((-1, -1), (1, -1), (-1, 1), (1, 1)):
        mb.add(prim_box(0.2, 0.55, 0.2), 'plate_dark', M((sx * 0.62, ty + 2.0, tz + sz * 0.62)), bevel=0.015)
        OC.spike_base(mb, (sx * 0.62, ty + 2.27, tz + sz * 0.62), (sx * 0.15, 1, sz * 0.15), 0.07, 0.34)
    # escada de mão à vante da torre e engradado
    for dx in (-0.12, 0.12):
        beam(mb, (0.15 + dx, ty + 0.05, tz + 0.9), (0.15 + dx, ty + 1.7, tz + 0.65), 0.04, 0.04, 'owood_dark')
    for t in range(1, 8):
        y = ty + 0.05 + t * 0.2
        mb.add(prim_box(0.3, 0.03, 0.04), 'owood', M((0.15, y, tz + 0.9 - t * 0.035)))
    # bandeirola/caveira na frente da plataforma
    OC.skull(mb, M((0.0, ty + 1.97, tz + 0.7)), 1.5)
    # cabos amarrados a vante (estais) até os postes
    # canhão pequeno no convés de popa
    mb.add(prim_box(0.5, 0.18, 0.7), 'owood_dark', M((0.55, yd + 0.11, -2.55)), bevel=0.02)
    barrel_gun(mb, M((0.55, yd + 0.38, -2.7)), 0.8, 0.12, 'iron', 'plate_dark', n=8, flare=1.05)
    for dx in (-0.22, 0.22):
        mb.add(prim_cyl(0.14, 0.14, 0.07, 8, base=False), 'owood', M((0.55 + dx, yd + 0.14, -2.6), (0, 0, 90)), smooth=30)
    OC.crate(mb, M((0.5, yd, -2.1), (0, 10, 0)), 0.3)
    # espinhos no gunwale de popa e no timão
    for sg in (-1, 1):
        for z in (-2.9, -2.3):
            p = h.P(z, 1.0, sg)
            OC.spike_base(mb, p + V((0, 0.09, 0)), (sg * 0.25, 1, 0), 0.05, 0.3)
    build_crane_pedestal(mb)
    return mb.build(mats, parent=root)


def build_crane(mats, root):
    """Derrick: cabeçote de ferro (pivô no topo do pedestal) + braço de madeira com corrente; Hook é filho."""
    mb = MeshBuilder('Crane')
    mb.add(prim_cyl(0.18, 0.2, 0.14, 8, base=True), 'plate_dark', M((0, -0.05, 0)), bevel=0.01, smooth=40)
    mb.add(prim_box(0.3, 0.12, 0.3), 'plate', M((0, 0.1, 0)), bevel=0.015)
    tip = V((0.3, 0.85, 1.05))
    a = V((0.0, 0.1, -0.1))
    beam(mb, tuple(a), tuple(tip), 0.2, 0.18, 'owood', bevel=0.02)
    for t in (0.25, 0.6, 0.9):
        p = a.lerp(tip, t)
        mb.add(prim_box(0.25, 0.23, 0.05), 'plate_dark', Matrix.Translation(p) @ orient(tip - a), bevel=0.008)
    beam(mb, (0.0, 0.0, 0.25), tuple(a.lerp(tip, 0.6) + V((0, -0.08, 0))), 0.08, 0.08, 'owood_dark', bevel=0.01)
    OC.spike_base(mb, tuple(tip + V((0, 0.08, 0.06))), (0.2, 0.7, 0.7), 0.05, 0.22)
    OC.spike_base(mb, (0.0, 0.16, -0.12), (0, 0.4, -1), 0.045, 0.2)
    for sg in (-1, 1):
        mb.add(prim_box(0.04, 0.2, 0.18), 'plate_dark', M(tuple(tip + V((sg * 0.1, -0.05, 0.03)))), bevel=0.008)
    mb.add(prim_cyl(0.09, 0.09, 0.1, 8, base=False), 'plate', M(tuple(tip + V((0, -0.08, 0.04))), (0, 0, 90)), smooth=40)
    # tambor/manivela atrás
    mb.add(prim_cyl(0.1, 0.1, 0.3, 8, base=False), 'owood_dark', M((0.0, 0.05, -0.28), (0, 0, 90)), smooth=40)
    for sg in (-1, 1):
        mb.add(prim_cyl(0.14, 0.14, 0.04, 8, base=False), 'plate_dark', M((sg * 0.17, 0.05, -0.28), (0, 0, 90)), smooth=40)
    OC.hang_chain(mb, tuple(tip + V((0, -0.03, 0.06))), (0.0, 0.1, -0.2), links=9, r=0.025, sag=0.18)
    return mb.build(mats, parent=root, location=CRANE_P), tip


def build_crane_base(mb_h=None):
    pass


def build_hook(mats, parent, tip):
    mb = MeshBuilder('Hook')
    OC.hang_chain(mb, (0, -0.06, 0.04), (0, -1.0, 0.04), links=9, r=0.03)
    mb.add(prim_box(0.14, 0.16, 0.1), 'plate_dark', M((0, -1.1, 0.04)), bevel=0.012)
    mb.add(SH.torus(0.05, 0.018, 10, 5), 'plate_dark', M((0, -1.0, 0.04)), smooth=60)
    pts = bezier((0, -1.2, 0.04), (0, -1.5, 0.04), (0.2, -1.45, 0.04), 4) + bezier((0.2, -1.45, 0.04), (0.36, -1.4, 0.04), (0.3, -1.22, 0.04), 3)[1:]
    tube(mb, pts, [0.045, 0.045, 0.045, 0.045, 0.04, 0.032, 0.02, 0.012], 'plate_dark', n=6, smooth=60)
    return mb.build(mats, parent=parent, location=tuple(tip))


def build_ramp(mats, root):
    """Rampa de proa de tábuas escuras com cintas de ferro, espinhos e correntes; pivô na dobradiça."""
    mb = MeshBuilder('Ramp')
    X = SH.S.Xf(mb, M((0, 0, 0), (32, 0, 0)))
    Lr, W = 1.75, 1.0
    X.add(prim_box(W, 0.09, Lr), 'owood_dark', M((0, 0, Lr / 2)), bevel=0.012)
    X.add(prim_box(W - 0.06, 0.03, Lr - 0.04), 'odeck', M((0, 0.05, Lr / 2)), bevel=0.006)
    for sg in (-1, 1):
        X.add(prim_box(0.1, 0.12, Lr + 0.02), 'owood', M((sg * (W / 2 + 0.01), 0.04, Lr / 2)), bevel=0.012)
        X.add(prim_box(0.1, 0.05, Lr), 'plate_dark', M((sg * (W / 2 + 0.01), 0.11, Lr / 2)), bevel=0.01)
        for z in (0.3, 0.75, 1.2, 1.6):
            OC.spike_base(X, (sg * (W / 2 + 0.03), 0.13, z), (sg * 0.7, 0.5, 0.1), 0.045, 0.24)
    for z in (0.08, 0.5, 0.95, 1.4):
        X.add(prim_box(W, 0.045, 0.12), 'plate', M((0, 0.075, z)), bevel=0.008)
        for dx in (-0.4, -0.15, 0.15, 0.4):
            X.add(prim_cyl(0.024, 0.016, 0.03, 5, base=True), 'steel_hi', M((dx, 0.095, z)))
    # barra da ponta com espinhos voltados para fora (mordem a praia)
    X.add(prim_box(W + 0.1, 0.08, 0.12), 'plate_dark', M((0, 0.03, Lr - 0.06)), bevel=0.01)
    for dx in (-0.4, -0.2, 0.0, 0.2, 0.4):
        OC.spike_base(X, (dx, 0.04, Lr), (0, -0.25, 1), 0.05, 0.26)
    for z in (0.3, 0.72, 1.17):
        X.add(prim_box(W - 0.2, 0.03, 0.035), 'owood_dark', M((0, 0.07, z)))
    for sg in (-1, 1):
        OC.hang_chain(X, (sg * (W / 2 + 0.01), 0.12, Lr - 0.1), (sg * (W / 2 + 0.06), 0.62, -0.1), links=8, r=0.03, sag=0.0)
    return mb.build(mats, parent=root, location=(0.0, 1.0, 3.07))


def build_flag(mats, root):
    mb = MeshBuilder('Flag')
    mb.add(prim_cyl(0.035, 0.03, 0.9, 6, base=True), 'owood_dark', M((0, 0, 0)))
    OC.spike_base(mb, (0, 0.9, 0), (0, 1, 0), 0.05, 0.22)
    X = SH.S.Xf(mb, M((0, 0.62, 0), (0, 90, 0)))
    SH.flag(X, 1.0, 0.55, 'team', 'plate_dark', False, amp=0.07, fx=3.0, ph=0.2, tail=0.35)
    OC.skull(X, M((0.4, 0.0, 0.07)), 1.4)
    return mb.build(mats, parent=root, location=(0.0, DECK + 2.3, TOWER_Z))


def build_crane_pedestal(mb):
    cx, cy, cz = CRANE_P
    mb.add(prim_box(0.6, 0.1, 0.6), 'plate_dark', M((cx, DECK + 0.05, cz)), bevel=0.02)
    mb.add(prim_box(0.32, cy - DECK - 0.15, 0.34, taper=(0.85, 0.9)), 'owood', M((cx, (cy + DECK + 0.15) / 2 - 0.1, cz)), bevel=0.02)
    for dy in (0.35, 0.8):
        mb.add(prim_box(0.4, 0.07, 0.42), 'plate', M((cx, DECK + dy, cz)), bevel=0.01)
        for sx in (-1, 1):
            OC.spike_base(mb, (cx + sx * 0.2, DECK + dy, cz), (sx, 0.2, 0), 0.04, 0.2)


def main():
    args = C.script_args()
    C.reset_scene()
    mats = C.make_paint_set(PALETTE)
    root = C.make_empty('OrcBarge')
    hull = build_hull(mats, root)
    crane, tip = build_crane(mats, root)
    hook = build_hook(mats, crane, tip)
    ramp = build_ramp(mats, root)
    flag = build_flag(mats, root)
    parts = [hull, crane, hook, ramp, flag]
    SH.finish_ship('orc_barge', 'orc_barge.glb', 'orc_barge_atlas', root, parts,
                   {'Hull': 1.0, 'Crane': 0.8, 'Hook': 0.5, 'Ramp': 0.8, 'Flag': 0.5},
                   TEAM_DEFAULT, args, tex=int(os.environ.get('ATLAS', 512)), game_dist=17.0)


if __name__ == '__main__':
    main()
