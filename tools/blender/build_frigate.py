"""
build_frigate.py — Fragata humana (tipo interno `frigate`, raiz `Frigate`) gerada 100% por script.

Referência: docs/refs/naval/human_ships_ref.png ("Human Battleship"): casco de aço azul rebitado com bordo
creme grosso, friso dourado, escudos heráldicos de aço e vigias, duas torres blindadas de canos gêmeos (proa e popa),
passadiço azul com cabine creme e janelas, chaminé azul com faixa creme, tubos de escape, barris, rolos de corda,
boia, mastro com cesto da gávea, vergas com velas pendentes e flâmula azul.

Uso:
  blender -b --factory-startup --python tools/blender/build_frigate.py -- [--no-render]

Hierarquia (proa = +Z, y = 0 na linha d'água, casco ~7 u):
  Frigate (raiz)
  ├─ Hull        casco + passadiço + chaminé + mastro + convés (Atlas + TeamColor: placas azuis)
  ├─ Turret1     torre de proa (pivô (0, convés, +2,3), gira em Y)   └─ Cannon1  canos gêmeos (recuo em z)
  ├─ Turret2     torre de popa (pivô (0, convés, −2,62), voltada para trás) └─ Cannon2
  ├─ Sail        vergas e velas pendentes (Atlas + TeamColor)
  ├─ Flag        flâmula no topo do mastro (TeamColor)
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

TEAM_DEFAULT = '#2d56c0'
PALETTE = dict(SH.PALETTE)

L = 7.0
DECK = 0.92
HULL = dict(
    hw=[(0, 1.12), (0.06, 1.3), (0.2, 1.45), (0.5, 1.5), (0.72, 1.4), (0.86, 1.1), (0.95, 0.62), (1.0, 0.12)],
    yk=[(0, -0.28), (0.15, -0.38), (0.7, -0.38), (0.9, -0.2), (1.0, 0.5)],
    yg=[(0, 1.32), (0.3, 1.22), (0.68, 1.22), (0.78, 1.42), (0.9, 1.5), (1.0, 1.68)],
    bul=[(0, 0.3), (1, 0.3)],
)
PROF = [(1.0, 1.0), (1.015, 0.88), (0.995, 0.62), (0.92, 0.40), (0.9, 0.355), (0.72, 0.2), (0.42, 0.08), (0.0, 0.0)]
SEGS = ['cream', 'team_plates', 'team_plates', 'gold', 'team_dark', 'team_dark', 'team_dark']
TUR1_Z, TUR2_Z = 2.3, -2.62
FUN_Z, MAST_Z = -0.95, -1.58


def make_hull():
    return Hull(L, 0.0, HULL['hw'], HULL['yk'], HULL['yg'], HULL['bul'], PROF, SEGS, n=32, t=0.14,
                deck='deck', inner='team_plates', rail='cream', cap='team_plates', bottom='team_dark', flat_deck=DECK)


def build_hull(mats, root):
    mb = MeshBuilder('Hull')
    h = make_hull()
    h.build(mb)
    z0, z1 = h.z0, h.z1
    yd = DECK
    # --- bordo creme grosso, cinta de aço e rebites
    h.rail_cap(mb, 'cream', 0.34, 0.09, za=z0 + 0.03, zb=z1 - 0.12, bevel=0.025, n=30)
    h.band(mb, 0.88, z0 + 0.02, z1 - 0.12, 0.07, 0.04, 'steel', n=28)
    h.band(mb, 0.3, z0 + 0.1, z1 - 0.3, 0.06, 0.045, 'gold', n=22)
    h.studs(mb, 0.93, z0 + 0.3, z1 - 0.5, 0.4, 'steel_hi', r=0.04)
    h.studs(mb, 0.47, z0 + 0.3, z1 - 0.7, 0.5, 'steel_hi', r=0.034)
    # costuras verticais de chapa (cintas de aço entre painéis)
    for z in (-2.75, -1.4, -0.05, 1.3, 2.6):
        for sg in (-1, 1):
            a, b = h.P(z, 0.87, sg), h.P(z, 0.41, sg)
            n = h.N(z, 0.65, sg)
            beam(mb, tuple(a + n * 0.02), tuple(b + n * 0.02), 0.09, 0.035, 'steel', bevel=0.008)
    # escudos heráldicos grandes (3 por bordo) e placas de vigia
    for z in (2.0, -0.05, -2.0):
        for sg in (-1, 1):
            p, n = h.P(z, 0.63, sg), h.N(z, 0.63, sg)
            SH.shield(mb, SH.frame_at(p + n * 0.01, n), 1.5, rim='steel', field='team', trim='gold', depth=0.07)
    for z in (1.0, -1.05):
        for sg in (-1, 1):
            p, n = h.P(z, 0.63, sg), h.N(z, 0.63, sg)
            m = SH.frame_at(p + n * 0.01, n)
            mb.add(prim_box(0.4, 0.42, 0.05), 'steel_dark', m @ M((0, 0, 0.02)), bevel=0.01)
            mb.add(prim_box(0.28, 0.3, 0.055), 'gold', m @ M((0, 0, 0.03)), bevel=0.008)
            mb.add(prim_box(0.2, 0.22, 0.06), 'team', m @ M((0, 0, 0.035)), bevel=0.006)
    # vigias na proa (dourados)
    for sg in (-1, 1):
        p, n = h.P(3.05, 0.7, sg), h.N(3.05, 0.7, sg)
        SH.porthole(mb, SH.frame_at(p + n * 0.01, n), 0.13)
    # esporão de proa dourado + escovém
    tube(mb, [(0, h.keel(z1) + 0.02, z1 - 0.02), (0, h.top(z1) * 0.55, z1 + 0.04), (0, h.top(z1) + 0.03, z1 - 0.1)], [0.07, 0.08, 0.07], 'gold', n=6, smooth=50)
    mb.add(prim_cone(0.09, 0.38, 6), 'gold', M((0, h.top(z1) + 0.0, z1 - 0.14), (-35, 0, 0)))
    # --- convés
    hz = -1.95
    mb.add(prim_box(0.8, 0.14, 0.8), 'wood_dark', M((0.0, yd + 0.07, hz + 0.2)), bevel=0.02)
    mb.add(prim_box(0.68, 0.06, 0.68), 'deck', M((0.0, yd + 0.16, hz + 0.2)), bevel=0.012)
    for dx in (-0.22, 0.0, 0.22):
        mb.add(prim_box(0.05, 0.03, 0.7), 'iron', M((dx, yd + 0.2, hz + 0.2)), bevel=0.006)
    for (x, z) in ((0.95, 3.0), (-0.95, 3.0), (1.0, -3.0), (-1.0, -3.0)):
        mb.add(prim_cyl(0.08, 0.065, 0.22, 8, base=True), 'iron', M((x, yd, z)), smooth=40, bevel=0.01)
        mb.add(prim_cyl(0.12, 0.12, 0.035, 8, base=True), 'iron', M((x, yd + 0.22, z)), smooth=40)
    # rolos de corda grandes e barris
    for (x, z, R) in ((-0.6, 1.3, 0.22), (0.7, 1.0, 0.2), (-0.75, 3.0, 0.2)):
        rope_coil(mb, M((x, yd + 0.02, z)), R, 0.045, 3)
    rope_coil(mb, M((-0.85, yd + 0.02, -0.55)), 0.2, 0.045, 2)
    barrels = [(0.95, -1.05), (0.7, -1.2), (1.05, -0.65), (0.78, -0.55), (-0.95, -1.2), (-0.72, -1.3), (0.15, 2.95)]
    for (x, z) in barrels:
        cask(mb, M((x, yd, z)), 0.15, 0.3, 'wood', 'iron', n=8)
    # tubos de escape grossos e curvos ao lado da chaminé (a boreste do passadiço)
    for k, x in enumerate((0.5, 0.78, 1.06)):
        pts = SH.smooth_path([(x, yd, -0.55), (x, yd + 0.6, -0.55), (x, yd + 0.92, -0.72), (x + 0.0, yd + 0.8, -0.95), (x, yd + 0.55, -1.02)], 3)
        tube(mb, pts, [0.11] * len(pts), 'steel_dark', n=8, smooth=60)
        mb.add(prim_cyl(0.15, 0.15, 0.07, 8, base=False), 'steel', M((x, yd + 0.25, -0.55)), smooth=30)
    # --- passadiço: base azul octogonal, cabine creme com janelas, teto azul com moldura dourada
    base = [(-0.95, -0.7), (0.95, -0.7), (1.12, -0.35), (1.12, 0.75), (0.7, 1.2), (-0.7, 1.2), (-1.12, 0.75), (-1.12, -0.35)]
    bz = 0.0
    mb.add(prim_extrude(base, 0.66, axis='y', center=False), 'team_plates', M((0, yd, bz)), bevel=0.03)
    mb.add(prim_extrude([(x * 1.025, z * 1.025) for (x, z) in base], 0.07, axis='y', center=False), 'gold', M((0, yd + 0.64, bz)), bevel=0.014)
    mb.add(prim_extrude([(x * 1.04, z * 1.04) for (x, z) in base], 0.05, axis='y', center=False), 'steel', M((0, yd + 0.02, bz)), bevel=0.01)
    for (x, z) in base:
        stud(mb, V((x * 1.02, yd + 0.45, z * 1.02 + bz)), (x, 0, z), 0.035, 'steel_hi')
    for sg in (-1, 1):
        SH.porthole(mb, M((sg * 1.125, yd + 0.35, 0.2), (0, sg * 90, 0)), 0.075)
    for dx in (-0.55, 0.55):
        SH.porthole(mb, M((dx, yd + 0.35, 1.215)), 0.07)
    cab = [(-0.8, -0.5), (0.8, -0.5), (0.86, -0.2), (0.86, 0.45), (0.5, 0.95), (-0.5, 0.95), (-0.86, 0.45), (-0.86, -0.2)]
    cy = yd + 0.72
    mb.add(prim_extrude(cab, 0.62, axis='y', center=False), 'cream', M((0, cy, bz)), bevel=0.03)
    for dx in (-0.3, 0.0, 0.3):
        SH.window(mb, M((dx, cy + 0.34, bz + 0.955)), 0.18, 0.24)
    for sg in (-1, 1):
        for dz in (-0.25, 0.1, 0.45):
            SH.window(mb, M((sg * 0.865, cy + 0.34, bz + dz), (0, sg * 90, 0)), 0.17, 0.24)
        SH.window(mb, M((sg * 0.68, cy + 0.34, bz + 0.7), (0, sg * 45, 0)), 0.17, 0.24)
    mb.add(prim_box(0.3, 0.46, 0.04), 'wood_dark', M((0.0, cy + 0.23, bz - 0.505)), bevel=0.01)
    mb.add(prim_box(0.36, 0.5, 0.03), 'gold', M((0.0, cy + 0.25, bz - 0.5)), bevel=0.008)
    mb.add(prim_extrude([(x * 1.08, z * 1.08) for (x, z) in cab], 0.08, axis='y', center=False), 'team', M((0, cy + 0.6, bz)), bevel=0.025)
    mb.add(prim_extrude([(x * 1.12, z * 1.12) for (x, z) in cab], 0.045, axis='y', center=False), 'gold', M((0, cy + 0.6, bz)), bevel=0.012)
    mb.add(prim_extrude([(x * 0.8, z * 0.8) for (x, z) in cab], 0.04, axis='y', center=False), 'steel_dark', M((0, cy + 0.68, bz)), bevel=0.008)
    cask(mb, M((-0.35, cy + 0.68, bz + 0.45)), 0.16, 0.26, 'wood', 'iron', n=8)
    mb.add(prim_cyl(0.09, 0.09, 0.025, 8, base=True), 'wood_light', M((-0.35, cy + 0.94, bz + 0.45)))
    mb.add(prim_box(0.2, 0.05, 0.16), 'steel', M((0.35, cy + 0.72, bz + 0.5)), bevel=0.01)
    beam(mb, (0.35, cy + 0.74, bz + 0.5), (0.35, cy + 1.15, bz + 0.5), 0.035, 0.035, 'steel_dark')
    for sg in (-1, 1):
        SH.life_ring(mb, M((sg * 0.885, cy + 0.2, bz + 0.62), (0, sg * 90, 0)), 0.18, 0.05)
    # --- chaminé: azul com faixa creme e boca preta
    SH.funnel(mb, V((0.0, yd, FUN_Z)), 0.38, 1.65, 'team_plates', 'cream', 'dark', 'iron', n=14, band=(0.5, 0.7))
    for sg in (-1, 1):
        beam(mb, (sg * 0.33, yd + 0.6, FUN_Z), (sg * 0.58, yd, FUN_Z - 0.12), 0.04, 0.04, 'iron')
    # --- mastro principal: tora com aros de ferro, cesto da gávea
    mtop = V((0.0, 4.25, MAST_Z))
    SH.mast(mb, V((0.0, yd, MAST_Z)), mtop, 0.13, 0.08, 'wood_dark', 'iron', n=8, bands=(0.1, 0.4, 0.7))
    mb.add(prim_cyl(0.22, 0.22, 0.14, 8, base=True), 'wood_dark', M((0, yd, MAST_Z)), bevel=0.01)
    SH.crow_nest(mb, V((0.0, 3.55, MAST_Z)), 0.36, 0.26)
    mb.add(prim_sphere(0.1, 0.1, 0.1, 7, 4), 'gold', M((0.0, 4.3, MAST_Z)), smooth=60)
    for sg in (-1, 1):
        for dz in (-0.12, 0.12):
            beam(mb, (sg * 0.07, 3.1, MAST_Z + dz * 0.5), (sg * 1.1, yd + 0.3, MAST_Z + dz * 2.2), 0.02, 0.02, 'rope')
    return mb.build(mats, parent=root)


def build_turret(mats, root, name, pivot, rot_y, scale):
    mb = MeshBuilder(name)
    ay, fz = SH.turret_housing(mb, r=0.95, h=0.78, shell='team_plates', top='gold', plate='steel_dark', team='team_plates',
                               roof_mat='team', scale=scale)
    # mantelete (bloco de aço) onde saem os canos + frisos e rebites
    mb.add(prim_box(1.0 * scale, 0.46 * scale, 0.2 * scale), 'steel', M((0, ay, fz + 0.02)), bevel=0.025)
    for sx in (-1, 1):
        mb.add(prim_cyl(0.14 * scale, 0.14 * scale, 0.1, 8, base=False), 'gold', M((sx * 0.27 * scale, ay, fz + 0.14 * scale), (90, 0, 0)), smooth=30)
        for dy in (-0.15, 0.15):
            stud(mb, V((sx * 0.45 * scale, ay + dy * scale, fz + 0.13 * scale)), (0, 0, 1), 0.03, 'steel_hi')
    t = mb.build(mats, parent=root, location=pivot)
    C.set_rot_game(t, (0.0, rot_y, 0.0))
    return t, ay, fz, scale


def build_cannon(mats, parent, name, ay, fz, scale):
    mb = MeshBuilder(name)
    for sx in (-1, 1):
        barrel_gun(mb, M((sx * 0.27 * scale, 0, 0)), 1.6, 0.125, 'steel_dark', 'gold', n=8, flare=1.0)
        mb.add(prim_cyl(0.1, 0.1, 0.03, 8, base=False), 'steel_hi', M((sx * 0.27 * scale, 0, 1.6 - 0.015), (90, 0, 0)))
    mb.add(prim_box(0.82 * scale, 0.14, 0.12), 'gold', M((0, 0, 0.14)), bevel=0.012)
    return mb.build(mats, parent=parent, location=(0.0, ay, fz + 0.1 * scale))


def build_sail(mats, root):
    """Verga principal com dois panos pendentes (creme + campo de time) e verga menor; no mastro principal."""
    mb = MeshBuilder('Sail')
    mz = MAST_Z
    SH.yard(mb, V((0.0, 3.1, mz)), 2.1, 0.06, 'wood_dark', 'gold', angle=14.0)
    SH.yard(mb, V((0.0, 2.4, mz)), 1.5, 0.05, 'wood_dark', 'gold', angle=-12.0)
    SH.furled_sail(mb, V((0.0, 3.1, mz + 0.09)), 2.0, 0.11, 'sail', 14.0, 'team')
    for k, sg in enumerate((-1, 1)):
        poly = [(-0.38, 0.0), (0.38, 0.0), (0.46, -0.7), (0.16, -0.56), (0.0, -0.88), (-0.16, -0.56), (-0.46, -0.7)]
        x0 = sg * 0.62
        y0 = 3.1 + math.tan(math.radians(14)) * x0 - 0.04
        v, f = prim_extrude(poly, 0.045, axis='z')
        v = SH.wave(v, 0.08, 6.0, 0.0, sg)
        mb.add((v, f), 'sail', M((x0, y0, mz + 0.2), (0, 0, 14)), smooth=45)
        v, f = prim_extrude([(x * 0.62, y * 0.6 - 0.05) for (x, y) in poly], 0.05, axis='z')
        v = SH.wave(v, 0.08, 6.0, 0.0, sg)
        mb.add((v, f), 'team', M((x0, y0, mz + 0.2), (0, 0, 14)), smooth=45)
    for sg in (-1, 1):
        poly = [(-0.28, 0.0), (0.28, 0.0), (0.33, -0.55), (0.0, -0.44), (-0.33, -0.55)]
        x0 = sg * 0.52
        v, f = prim_extrude(poly, 0.045, axis='z')
        v = SH.wave(v, 0.07, 7.0, 0.0, sg + 2)
        mb.add((v, f), 'sail', M((x0, 2.36, mz + 0.16)), smooth=45)
        v, f = prim_extrude([(x * 0.62, y * 0.62 - 0.04) for (x, y) in poly], 0.05, axis='z')
        v = SH.wave(v, 0.07, 7.0, 0.0, sg + 2)
        mb.add((v, f), 'team', M((x0, 2.36, mz + 0.16)), smooth=45)
    # anel azul de time no mastro
    mb.add(prim_cyl(0.2, 0.2, 0.1, 10, base=False), 'team', M((0.0, 3.1, mz)), smooth=30)
    return mb.build(mats, parent=root)


def build_flag(mats, root):
    mb = MeshBuilder('Flag')
    mb.add(prim_cyl(0.028, 0.022, 0.55, 6, base=True), 'iron', M((0, 0, 0)))
    X = SH.S.Xf(mb, M((0, 0.3, 0), (0, 90, 0)))
    SH.flag(X, 1.7, 0.62, 'team', 'gold', True, amp=0.08, fx=3.0, ph=0.4, tail=0.45)
    return mb.build(mats, parent=root, location=(0.0, 4.32, MAST_Z))


def main():
    args = C.script_args()
    C.reset_scene()
    mats = C.make_paint_set(PALETTE)
    root = C.make_empty('Frigate')
    hull_obj = build_hull(mats, root)
    t1, ay, fz, s1 = build_turret(mats, root, 'Turret1', (0.0, DECK, TUR1_Z), 0.0, 1.0)
    c1 = build_cannon(mats, t1, 'Cannon1', ay, fz, s1)
    t2, ay2, fz2, s2 = build_turret(mats, root, 'Turret2', (0.0, DECK, TUR2_Z), 180.0, 0.88)
    c2 = build_cannon(mats, t2, 'Cannon2', ay2, fz2, s2)
    sail = build_sail(mats, root)
    flag = build_flag(mats, root)
    C.make_empty('Anim_Smoke', (0.0, DECK + 1.65 + 0.05, FUN_Z), parent=root)
    parts = [hull_obj, t1, c1, t2, c2, sail, flag]
    SH.finish_ship('frigate', 'frigate.glb', 'frigate_atlas', root, parts,
                   {'Hull': 1.0, 'Turret1': 0.8, 'Turret2': 0.8, 'Cannon1': 0.5, 'Cannon2': 0.5, 'Sail': 0.7, 'Flag': 0.5},
                   TEAM_DEFAULT, args, tex=int(os.environ.get('ATLAS', 512)), game_dist=19.0)


if __name__ == '__main__':
    main()
