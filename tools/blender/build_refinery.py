"""
build_refinery.py — Refinaria humana (tipo `refinery`, M5-04) gerada 100% por script. Estilo: build_shipyard.py /
build_oil_platform.py (mesma paleta de tanques enferrujados, aço e tijolo).

Uso:
  blender -b --factory-startup --python tools/blender/build_refinery.py -- [--no-render]

Saída (public/models/refinery.glb), coordenadas do jogo, origem no centro da pegada (y = 0 = chão), mar = +Z:
  Refinery (raiz)
  ├─ Static_Mesh       plataforma de pedra, torre de destilação com plataforma/escada, coluna reatora, três tanques verticais
  │                    com escada em espiral e cintas, tubulações com válvulas, casa de bombas de tijolo, chaminé de queima
  │                    com chama, píer de tábuas com tubo de carga, barris (Atlas 512²)
  ├─ Anim_Banners      cintas de time nos tanques, toldo e bandeira da casa de bombas (TeamColor)
  ├─ Anim_Crane        braço de carga do píer (mangueira e bico; pivô no giro do tubo — oscila em Y)
  ├─ Anim_Smoke        fumaça preta da chaminé de queima (pivô na ponta)
  ├─ Socket_UnitSpawn  saída (mar, +Z)
  └─ Socket_Rally      ponto de reunião padrão
Pegada ~6,6 x 9 (terra 5,4 + píer 3,7), raio de colisão 3,4; altura ~6,5 (torre de destilação 5,5; chaminé de queima + fumaça 6,5).
"""
import os
import sys
import math

os.environ.setdefault('ATLAS', '512')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402,F401
from mathutils import Vector  # noqa: E402,F401
import common as C  # noqa: E402
from common import (MeshBuilder, M, prim_box, prim_cyl, prim_cone, prim_sphere)  # noqa: E402
from bld_common import beam, tube, log, finish_building  # noqa: E402
import bld_house as H  # noqa: E402
import build_shipyard as SY  # noqa: E402
import build_oil_platform as HP  # noqa: E402
import naval_common as N  # noqa: E402
import ind_common as I  # noqa: E402
from naval_common import Piv  # noqa: E402

TEAM_DEFAULT = '#3a66d6'
DK = 0.35
TX, TZ = -1.55, -1.95          # torre de destilação
FX, FZ = -2.85, -2.75          # chaminé de queima
FH = 4.6                       # altura da chaminé de queima (acima de DK)
PX = 0.3                       # eixo do píer / tubo de carga
CPV = (0.95, DK + 1.55, 3.35)  # pivô do braço de carga

PALETTE = dict(HP.PALETTE)
for _k, _v in SY.PALETTE.items():
    PALETTE.setdefault(_k, _v)


def tr(y):
    """Raio da torre na altura y (acima de DK)."""
    return 0.62 - 0.12 * y / 5.0


def build_base(mats, root):
    mb = MeshBuilder('Base')
    mb.add(prim_box(6.6, DK - 0.04, 5.4, base=True), 'stone_dark', M((0, 0, -0.8)), bevel=0.05)
    mb.add(prim_box(6.2, 0.06, 5.0, base=True), 'paving', M((0, DK - 0.06, -0.8)))
    # mureta baixa de contenção em volta dos tanques (lado direito/fundo)
    for (x, z, w, d) in ((0.2, -3.2, 6.2, 0.22), (3.1, -0.6, 0.22, 5.2)):
        mb.add(prim_box(w, 0.28, d, base=True), 'stone_light', M((x, DK, z)), bevel=0.03)
    I.pier(mb, PX, 1.9, 5.6, 2.4, DK)
    # cintas de ferro e cunhais nos cantos da plataforma
    for (x, z) in ((-3.3, 1.9), (3.3, 1.9), (-3.3, -3.5), (3.3, -3.5)):
        mb.add(prim_box(0.34, 0.16, 0.34, base=True), 'stone_light', M((x, DK - 0.08, z)), bevel=0.03)
    return mb.build(mats, parent=root)


def build_tower(mats, root):
    mb = MeshBuilder('Tower')
    H5 = 5.2
    mb.add(prim_cyl(tr(0) + 0.14, tr(0) + 0.14, 0.3, 14), 'steel_dark', M((TX, DK, TZ)), smooth=30)
    tube(mb, [(TX, DK, TZ), (TX, DK + H5, TZ)], [tr(0), tr(H5)], 'steel', n=14, smooth=55)
    mb.add(prim_sphere(tr(H5), 0.5, tr(H5), 12, 4, y_min=0.0), 'steel', M((TX, DK + H5, TZ)), smooth=60)
    mb.add(prim_cone(0.07, 0.5, 6), 'steel_dark', M((TX, DK + H5 + 0.45, TZ)))
    for y in (0.9, 1.8, 2.7, 3.6, 4.5):
        mb.add(prim_cyl(tr(y) + 0.06, tr(y) + 0.06, 0.14, 14), 'steel_dark', M((TX, DK + y - 0.07, TZ)), smooth=30)
        for k in range(8):
            a = 2 * math.pi * k / 8
            N.rivets(mb, [(TX + math.cos(a) * (tr(y) + 0.07), DK + y, TZ + math.sin(a) * (tr(y) + 0.07))], 0.028, 'steel')
    # plataforma de serviço com guarda-corpo
    py, pr = DK + 3.0, 1.0
    mb.add(prim_cyl(pr, pr, 0.08, 14), 'steel_dark', M((TX, py, TZ)), smooth=30)
    mb.add(N.torus_prim(pr - 0.04, 0.025, 20, 4), 'steel', M((TX, py + 0.5, TZ)), smooth=50)
    for k in range(14):
        a = 2 * math.pi * k / 14
        mb.add(prim_box(0.035, 0.5, 0.035, base=True), 'steel', M((TX + math.cos(a) * (pr - 0.04), py + 0.04, TZ + math.sin(a) * (pr - 0.04))))
    # escada vertical (lado do mar) até a plataforma
    lx, lz = TX + 0.35, TZ + tr(1.5) + 0.07
    for sx in (-1, 1):
        mb.add(prim_box(0.04, 3.0, 0.05, base=True), 'steel', M((lx + sx * 0.13, DK, lz)))
    for k in range(10):
        mb.add(prim_box(0.3, 0.035, 0.04), 'steel', M((lx, DK + 0.25 + k * 0.28, lz)))
    # coluna reatora menor
    rx, rz = -0.2, -2.55
    tube(mb, [(rx, DK, rz), (rx, DK + 3.2, rz)], [0.42, 0.36], 'steel_dark', n=12, smooth=55)
    mb.add(prim_cone(0.42, 0.7, 12), 'steel', M((rx, DK + 3.2, rz)), smooth=40)
    for y in (0.7, 1.5, 2.3):
        mb.add(prim_cyl(0.46, 0.46, 0.1, 12), 'steel', M((rx, DK + y, rz)), smooth=30)
    # chaminé de queima com chama
    tube(mb, [(FX, DK, FZ), (FX, DK + FH, FZ)], [0.2, 0.12], 'steel_dark', n=10, smooth=55)
    mb.add(prim_cyl(0.32, 0.32, 0.4, 10), 'steel', M((FX, DK, FZ)), smooth=30)
    for y in (1.2, 2.4, 3.6):
        mb.add(prim_cyl(0.19 - 0.012 * y, 0.19 - 0.012 * y, 0.1, 10), 'steel', M((FX, DK + y, FZ)), smooth=30)
    mb.add(prim_cyl(0.19, 0.19, 0.12, 10), 'steel', M((FX, DK + FH - 0.05, FZ)), smooth=30)
    I.flames(mb, FX, DK + FH + 0.04, FZ, s=1.3, n=3)
    for ang in (200, 280):
        a = math.radians(ang)
        beam(mb, (FX, DK + FH * 0.72, FZ), (FX + math.cos(a) * 1.15, DK, FZ + math.sin(a) * 1.15), 0.04, 0.04, 'steel')
    return mb.build(mats, parent=root)


def build_tanks(mats, root):
    mb = MeshBuilder('Tanks')
    I.vtank(mb, 1.55, -2.1, DK, 1.0, 2.3, 'tank_brown', stair_a0=120.0)
    I.vtank(mb, 2.25, 0.05, DK, 0.85, 1.9, 'tank_red', stair_a0=250.0)
    I.vtank(mb, -0.9, 0.45, DK, 0.75, 1.7, 'tank_orange', stair_a0=60.0)
    # sinal de perigo no tanque laranja
    mb.add(prim_box(0.3, 0.3, 0.025), 'paint_yellow', M((-0.9 + 0.3, DK + 1.0, 0.45 + 0.7), (0, 25, 45)), bevel=0.0)
    mb.add(prim_box(0.08, 0.2, 0.03), 'dark', M((-0.9 + 0.3, DK + 1.0, 0.45 + 0.72), (0, 25, 0)))
    # tubulação alta: torre -> tanque marrom e torre -> reator
    N.pipe(mb, [(TX + 0.58, DK + 4.4, TZ), (1.55, DK + 4.4, -2.05), (1.55, DK + 2.85, -2.05)], 0.1, rr=0.3, flanges=(True, True))
    N.pipe(mb, [(TX + 0.55, DK + 3.7, TZ - 0.2), (-0.2, DK + 3.7, -2.55), (-0.2, DK + 3.35, -2.55)], 0.08, rr=0.3, flanges=(True, False))
    # coletor ao nível do chão: torre -> tanques -> píer (tubo de carga)
    N.pipe(mb, [(TX + 0.62, DK + 0.55, TZ + 0.1), (PX, DK + 0.55, TZ + 0.1), (PX, DK + 0.4, 1.0), (PX, DK + 0.26, 4.5)], 0.12, rr=0.4,
           flanges=(True, True))
    N.pipe(mb, [(PX, DK + 0.55, TZ + 0.1), (1.55, DK + 0.55, TZ + 0.1), (1.55, DK + 0.5, -2.1 + 1.0)], 0.09, rr=0.3, flanges=(False, True))
    N.pipe(mb, [(PX, DK + 0.4, 0.2), (2.0, DK + 0.4, 0.2)], 0.09, rr=0.2, flanges=(False, True))
    N.pipe(mb, [(PX, DK + 0.4, 0.5), (-0.9, DK + 0.4, 0.5)], 0.09, rr=0.2, flanges=(False, True))
    # válvulas de volante
    HP.wheel_valve(mb, PX, DK + 0.85, TZ + 0.1, 'paint_red')
    HP.wheel_valve(mb, PX, DK + 0.62, 1.55, 'paint_blue', r=0.14)
    HP.wheel_valve(mb, 1.55, DK + 0.85, -1.2, 'paint_red', r=0.13)
    # braço de carga (parte fixa): sobe do tubo até o pivô
    N.pipe(mb, [(PX, DK + 0.26, 3.35), (CPV[0], DK + 0.26, CPV[2]), (CPV[0], CPV[1] - 0.12, CPV[2])], 0.1, rr=0.25, flanges=(False, False))
    mb.add(prim_cyl(0.2, 0.2, 0.12, 10), 'steel_dark', M((CPV[0], CPV[1] - 0.12, CPV[2])), smooth=30)
    # barris e caixotes no píer
    H.barrel(mb, -0.55, DK, 2.5, r=0.26, h=0.6, mat='paint_red')
    H.barrel(mb, -0.8, DK, 2.95, r=0.24, h=0.56, mat='paint_yellow')
    H.barrel(mb, -0.45, DK, 3.3, r=0.24, h=0.56, mat='paint_red')
    H.crate(mb, 0.95, DK, 4.9, s=0.5, rot=10)
    H.crate(mb, 0.55, DK, 5.1, s=0.42, rot=-18)
    return mb.build(mats, parent=root)


def build_pump_house(mats, root, banners):
    mb = MeshBuilder('PumpHouse')
    cx, cz = -2.4, 0.75
    mb.add(prim_box(1.6, 1.15, 1.5, base=True), 'brick', M((cx, DK, cz)), bevel=0.03)
    mb.add(prim_box(1.7, 0.1, 1.6, base=True), 'stone_light', M((cx, DK, cz)), bevel=0.02)
    H.roof_gabled(mb, cx, cz, 0.8, 0.75, DK + 1.15, 0.55, 'roof_red', ridge_mat='steel_dark', ov=0.3, ov_z=0.28)
    H.door_arched(mb, M((cx + 0.1, DK, cz + 0.75)), 0.5, 0.85)
    H.window(mb, M((cx - 0.5, DK + 0.7, cz + 0.75)), 0.28, 0.3, shutters=False)
    H.chimney(mb, cx - 0.5, cz - 0.35, DK + 1.2, DK + 2.2, 0.32)
    # tubos que entram na parede e bomba externa
    N.pipe(mb, [(cx + 0.8, DK + 0.55, cz - 0.1), (cx + 1.05, DK + 0.55, cz - 0.1), (cx + 1.05, DK + 0.3, cz + 0.2)], 0.07, rr=0.1, flanges=(False, True))
    mb.add(prim_cyl(0.2, 0.2, 0.28, 10), 'steel_dark', M((cx + 0.95, DK, cz + 0.55)), smooth=30)
    mb.add(prim_sphere(0.17, 0.14, 0.17, 8, 4, y_min=0.0), 'steel', M((cx + 0.95, DK + 0.28, cz + 0.55)), smooth=50)
    H.flag(mb, cx + 0.62, cz - 0.55, DK + 1.2, 1.7, banner_mb=banners, side=1, w=0.9, hgt=0.5)
    return mb.build(mats, parent=root)


def build_arm(mats, root):
    """Braço de carga giratório (Anim_Crane): tubo articulado, mangueira e bico sobre a água."""
    mb = MeshBuilder('Anim_Crane')
    pv = Vector(CPV)
    an = Piv(mb, tuple(pv))
    x, y, z = CPV
    an.add(prim_sphere(0.17, 0.15, 0.17, 8, 4), 'steel_dark', M((x, y, z)), smooth=50)
    N.pipe(an, [(x, y, z), (x - 0.05, y + 0.38, z + 0.7), (x - 0.35, y + 0.2, z + 1.5)], 0.085, rr=0.3, flanges=(False, True))
    # mangueira pendurada e bico
    hose = N.rounded_path([(x - 0.35, y + 0.2, z + 1.5), (x - 0.35, y - 0.35, z + 1.55), (x - 0.35, y - 0.9, z + 1.55)], 0.2, 3)
    tube(an, hose, [0.07] * len(hose), 'hose', n=8, smooth=50)
    an.add(prim_cyl(0.11, 0.07, 0.3, 8), 'steel_dark', M((x - 0.35, y - 1.2, z + 1.55)), smooth=30)
    an.add(prim_cyl(0.13, 0.13, 0.06, 8), 'paint_red', M((x - 0.35, y - 0.92, z + 1.55)), smooth=30)
    beam(an, (x, y, z), (x + 0.35, y + 0.55, z - 0.2), 0.05, 0.05, 'steel')    # contrapeso
    an.add(prim_sphere(0.17, 0.17, 0.17, 7, 4), 'steel_dark', M((x + 0.38, y + 0.58, z - 0.22)), smooth=50)
    return mb.build(mats, parent=root, location=tuple(pv))


def build_smoke(mats, root):
    mb = MeshBuilder('Anim_Smoke')
    pv = (FX, DK + FH + 0.75, FZ)
    I.smoke_puffs(Piv(mb, pv), pv, top=1.3, r0=0.18, rmax=0.42)
    return mb.build(mats, parent=root, location=pv)


def build_banners(mats, root, extra):
    mb = extra
    # cintas de time nos tanques
    for (x, z, R, H_) in ((1.55, -2.1, 1.0, 2.3), (2.25, 0.05, 0.85, 1.9)):
        mb.add(prim_cyl(R + 0.045, R + 0.045, 0.24, 14), 'team', M((x, DK + H_ * 0.5, z)), smooth=30)
    # faixa de time na torre e toldo da casa de bombas
    mb.add(prim_cyl(tr(4.0) + 0.07, tr(4.0) + 0.07, 0.3, 14), 'team', M((TX, DK + 3.85, TZ)), smooth=30)
    cx, cz = -2.4, 0.75
    mb.add(prim_box(0.75, 0.04, 0.45), 'team', M((cx + 0.1, DK + 1.12, cz + 0.98), (-22, 0, 0)), bevel=0.0)
    mb.add(prim_box(1.64, 0.1, 0.03), 'team', M((cx, DK + 1.08, cz + 0.76)), bevel=0.0)
    return mb.build(mats, parent=root)


def main():
    args = C.script_args()
    C.reset_scene()
    N.patch_small_bevels(0.025)
    mats = C.make_paint_set(PALETTE)
    root = C.make_empty('Refinery')
    base = build_base(mats, root)
    tower = build_tower(mats, root)
    tanks = build_tanks(mats, root)
    bmb = MeshBuilder('Anim_Banners')
    pump = build_pump_house(mats, root, bmb)
    arm = build_arm(mats, root)
    smoke = build_smoke(mats, root)
    banners = build_banners(mats, root, bmb)
    weights = {'Base': 0.8, 'Tower': 1.2, 'Tanks': 1.3, 'PumpHouse': 0.9, 'Anim_Banners': 0.9, 'Anim_Crane': 0.5, 'Anim_Smoke': 0.3}
    finish_building(root, 'refinery', 'refinery.glb', 'refinery_atlas', [base, tower, tanks, pump], banners, weights, TEAM_DEFAULT, args,
                    spawn=(0, 0, 6.0), rally=(0, 0, 7.4), extra_anim=[arm, smoke], game_dist=72,
                    extra_views=[('ref', (-1.0, 0.95, 1.0)), ('ref2', (1.0, 0.95, 1.0)), ('low', (0.6, 0.12, 1.0))])


if __name__ == '__main__':
    main()
