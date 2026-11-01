"""
build_foundry.py — Fundição humana (tipo `foundry`, M5-04) gerada 100% por script. Estilo: build_shipyard.py.

Uso:
  blender -b --factory-startup --python tools/blender/build_foundry.py -- [--no-render]

Saída (public/models/foundry.glb), coordenadas do jogo, origem no centro da pegada (y = 0 = chão), mar = +Z:
  Foundry (raiz)
  ├─ Static_Mesh       plataforma de pedra, galpão de pedra com enxaimel e telhado de telhas azuis, forno de tijolo com boca
  │                    incandescente e chaminé alta, bigorna, tanque de resfriamento, lingotes, canhões e âncoras de reserva,
  │                    píer de tábuas com mastro do guindaste, barris (Atlas 512²)
  ├─ Anim_Banners      faixa de time do telhado, toldo do forno e bandeira da cumeeira (TeamColor)
  ├─ Anim_Crane        lança do guindaste do píer com corda e âncora pendurada (pivô no topo do mastro; oscila em Y)
  ├─ Anim_Smoke        fumaça da chaminé (pivô no topo)
  ├─ Socket_UnitSpawn  saída (mar, +Z)
  └─ Socket_Rally      ponto de reunião padrão
Pegada ~6,6 x 9, raio de colisão 3,4; altura ~7.
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
HX, HZ = -0.5, -1.7            # centro do galpão
HW, HD, HH = 4.2, 3.0, 2.2     # largura (x), profundidade (z), altura das paredes
KX, KZ = -2.2, 0.55            # forno de tijolo
CH_TOP = DK + 6.0              # topo da chaminé
PIER_X = 1.35
MAST = (2.25, DK, 3.45)        # mastro do guindaste
CPV = (2.25, DK + 3.3, 3.45)   # pivô da lança

PALETTE = dict(HP.PALETTE)
for _k, _v in SY.PALETTE.items():
    PALETTE.setdefault(_k, _v)


def build_base(mats, root):
    mb = MeshBuilder('Base')
    mb.add(prim_box(6.6, DK - 0.04, 5.4, base=True), 'stone_dark', M((0, 0, -0.8)), bevel=0.05)
    mb.add(prim_box(6.2, 0.06, 5.0, base=True), 'paving', M((0, DK - 0.06, -0.8)))
    I.pier(mb, PIER_X, 1.9, 5.6, 2.4, DK)
    for (x, z) in ((-3.3, 1.9), (3.3, 1.9), (-3.3, -3.5), (3.3, -3.5)):
        mb.add(prim_box(0.34, 0.16, 0.34, base=True), 'stone_light', M((x, DK - 0.08, z)), bevel=0.03)
    return mb.build(mats, parent=root)


def build_hall(mats, root, banners):
    mb = MeshBuilder('Hall')
    zf = HZ + HD / 2
    mb.add(prim_box(HW, HH, HD, base=True), 'stone', M((HX, DK, HZ)), bevel=0.04)
    mb.add(prim_box(HW + 0.16, 0.2, HD + 0.16, base=True), 'stone_light', M((HX, DK, HZ)), bevel=0.03)
    # enxaimel: pilares, cinta alta e esteios
    for sx in (-1, 1):
        for sz in (-1, 1):
            mb.add(prim_box(0.2, HH, 0.2, base=True), 'wood_beam', M((HX + sx * HW / 2, DK, HZ + sz * HD / 2)), bevel=0.01)
    for sz in (-1, 1):
        mb.add(prim_box(HW + 0.2, 0.16, 0.16), 'wood_beam', M((HX, DK + HH - 0.05, HZ + sz * HD / 2)))
    for sx in (-1, 1):
        mb.add(prim_box(0.16, 0.16, HD + 0.2), 'wood_beam', M((HX + sx * HW / 2, DK + HH - 0.05, HZ)))
    for x in (HX - 1.05, HX + 1.05):
        mb.add(prim_box(0.14, HH, 0.12, base=True), 'wood_beam', M((x, DK, zf)))
    H.roof_gabled(mb, HX, HZ, HW / 2, HD / 2, DK + HH, 1.15, 'roof_blue', ridge_mat='steel_dark', ov=0.4, ov_z=0.38)
    H.gable_frame(mb, HX, zf + 0.02, HW / 2, DK + HH, 1.1, 'wood_beam')
    # porta de entrada, janelas com brasa e respiro do telhado
    H.door_arched(mb, M((HX + 0.0, DK, zf)), 0.9, 1.45)
    for sx in (-1, 1):
        H.window(mb, M((HX + sx * 1.5, DK + 1.15, zf)), 0.34, 0.4, glass='glow', shutters=False)
    for z in (HZ - 0.65, HZ + 0.65):
        H.window(mb, M((HX + HW / 2, DK + 1.15, z), (0, 90, 0)), 0.34, 0.4, glass='glow', shutters=False)
    # janelas altas de ventilação no fundo
    mb.add(prim_box(0.7, 0.5, 0.5, base=True), 'stone_dark', M((HX + 0.9, DK + HH + 0.8, HZ - 0.4)), bevel=0.02)
    mb.add(prim_cone(0.5, 0.35, 4), 'roof_blue', M((HX + 0.9, DK + HH + 1.3, HZ - 0.4), (0, 45, 0)), smooth=0)
    # chaminé do galpão
    H.chimney(mb, HX - 1.3, HZ - 0.9, DK + HH + 0.4, DK + HH + 1.8, 0.5, mat='brick')
    H.flag(mb, HX + 0.0, HZ + 0.0, DK + HH + 1.2, 1.6, banner_mb=banners, side=1, w=0.95, hgt=0.55)
    return mb.build(mats, parent=root)


def build_furnace(mats, root, banners):
    mb = MeshBuilder('Furnace')
    # forno de tijolo: embasamento, corpo afunilado, boca em arco incandescente, grade de ferro
    mb.add(prim_box(2.0, 0.28, 1.9, base=True), 'stone_light', M((KX, DK, KZ)), bevel=0.03)
    mb.add(prim_box(1.8, 2.0, 1.7, taper=(0.85, 0.85), base=True), 'brick', M((KX, DK + 0.28, KZ)), bevel=0.03)
    zf = KZ + 0.85
    mb.add(prim_extrude_arch(0.8, 0.95), 'glow', M((KX, DK + 0.38, zf - 0.04)))
    H.door_arched(mb, M((KX, DK + 0.3, zf + 0.02)), 0.78, 0.9, mat='glow', frame='stone_light', iron='steel_dark')
    for sx in (-1, 1):
        mb.add(prim_box(0.14, 1.8, 0.14, base=True), 'stone_light', M((KX + sx * 0.98, DK + 0.28, zf - 0.02)), bevel=0.02)
    # chaminé alta de tijolo (afunilada), anéis de pedra e boca
    cx, cz = KX, KZ
    y0 = DK + 2.2
    mb.add(prim_box(1.0, CH_TOP - y0, 1.0, taper=(0.62, 0.62), base=True), 'brick', M((cx, y0, cz)), bevel=0.03)
    for t in (0.25, 0.55, 0.85):
        y = y0 + (CH_TOP - y0) * t
        w = 1.0 * (1 - 0.38 * t) + 0.12
        mb.add(prim_box(w, 0.14, w), 'stone_light', M((cx, y, cz)), bevel=0.02)
    wt = 0.62 + 0.2
    mb.add(prim_box(wt, 0.2, wt), 'stone_light', M((cx, CH_TOP, cz)), bevel=0.02)
    mb.add(prim_box(wt - 0.2, 0.06, wt - 0.2), 'dark', M((cx, CH_TOP + 0.1, cz)))
    # toldo e friso de time sobre a boca
    banners.add(prim_box(1.5, 0.06, 0.55), 'team', M((KX, DK + 1.55, zf + 0.25), (-22, 0, 0)), bevel=0.0)
    banners.add(prim_box(1.8, 0.1, 0.03), 'team', M((KX, DK + 2.15, zf - 0.07)), bevel=0.0)
    for sx in (-1, 1):
        beam(mb, (KX + sx * 0.7, DK + 1.2, zf + 0.5), (KX + sx * 0.7, DK + 1.62, zf + 0.5), 0.06, 0.06, 'wood_beam')
        mb.add(prim_box(0.1, 1.2, 0.1, base=True), 'wood_beam', M((KX + sx * 0.7, DK, zf + 0.5)))
    # carvão e brasas na frente
    mb.add(prim_sphere(0.3, 0.12, 0.2, 7, 3, y_min=0.0), 'coal', M((KX + 1.25, DK, KZ + 0.9)), smooth=50)
    return mb.build(mats, parent=root)


def prim_extrude_arch(w, h):
    from common import prim_extrude
    return prim_extrude(H.arch_poly(w, h), 0.06, axis='z')


def build_yard(mats, root):
    mb = MeshBuilder('Yard')
    # bigorna sobre toco
    ax, az = 0.45, 0.95
    mb.add(prim_cyl(0.3, 0.34, 0.5, 9), 'wood', M((ax, DK, az)), smooth=40)
    mb.add(prim_box(0.58, 0.12, 0.44, base=True), 'steel_dark', M((ax, DK + 0.5, az)), bevel=0.02)
    mb.add(prim_box(0.3, 0.2, 0.3, base=True), 'steel_dark', M((ax, DK + 0.62, az)), bevel=0.02)
    mb.add(prim_box(0.95, 0.2, 0.4, base=True), 'steel', M((ax, DK + 0.82, az)), bevel=0.02)
    mb.add(prim_cone(0.2, 0.45, 6), 'steel', M((ax - 0.62, DK + 0.92, az), (0, 0, 90)), smooth=0)
    # martelo e tenaz sobre a bigorna
    mb.add(prim_box(0.05, 0.4, 0.05), 'wood', M((ax + 0.18, DK + 1.22, az + 0.05), (0, 0, 65)))
    mb.add(prim_box(0.2, 0.1, 0.1), 'iron', M((ax + 0.02, DK + 1.12, az + 0.05)), bevel=0.01)
    # tanque de resfriamento (madeira com água)
    tx, tz = 1.75, 0.65
    mb.add(prim_box(1.1, 0.5, 0.6, base=True), 'wood_dark', M((tx, DK, tz), (0, 8, 0)), bevel=0.02)
    mb.add(prim_box(0.96, 0.04, 0.46), 'water', M((tx, DK + 0.45, tz), (0, 8, 0)))
    for sx in (-1, 1):
        mb.add(prim_box(0.06, 0.54, 0.64, base=True), 'iron', M((tx + sx * 0.4, DK, tz), (0, 8, 0)))
    # pilha de lingotes de aço
    for r, n in enumerate((4, 3, 2)):
        for k in range(n):
            mb.add(prim_box(0.46, 0.12, 0.2, base=True), 'steel', M((-0.95 + (k - (n - 1) / 2) * 0.5 + 0.0, DK + r * 0.13, 1.35), (0, 3 * k, 0)), bevel=0.012)
    # canhões de reserva (cano de ferro com munhões) sobre cavaletes de madeira
    for k, (x, z) in enumerate(((2.55, -0.5), (2.55, -1.15))):
        pts = [(x, DK + 0.5 + k * 0.0, z - 0.7), (x, DK + 0.52, z + 0.8)]
        tube(mb, pts, [0.3, 0.2], 'iron', n=10, smooth=55)
        mb.add(prim_cyl(0.3, 0.3, 0.14, 10, base=False), 'steel_dark', M((x, DK + 0.5, z + 0.1), (0, 0, 90)), smooth=30)
        mb.add(prim_sphere(0.2, 0.2, 0.2, 8, 4), 'iron', M((x, DK + 0.5, z - 0.78)), smooth=60)
        for dz in (-0.35, 0.45):
            mb.add(prim_box(0.7, 0.28, 0.12, base=True), 'wood_beam', M((x, DK, z + dz)))
    # âncora de reserva apoiada na parede do galpão e pilha de barris
    I.anchor(mb, -2.95, DK + 1.62, -0.1, s=0.9, yaw=70)
    H.barrel(mb, -0.35, DK, 1.55, r=0.26, h=0.6)
    H.barrel(mb, -0.7, DK, 1.8, r=0.24, h=0.56)
    H.barrel(mb, 0.05, DK, 1.8, r=0.24, h=0.56)
    H.crate(mb, 0.3, DK, 2.45, s=0.5, rot=-12)
    # barris e caixote no píer e rolos de corda
    H.barrel(mb, 0.55, DK, 4.9, r=0.26, h=0.6)
    H.crate(mb, 0.55, DK, 4.3, s=0.46, rot=8)
    N.rope_coil(mb, 1.9, DK, 5.1, R=0.26, r=0.06, turns=3, rot=10)
    return mb.build(mats, parent=root)


def build_mast(mats, root):
    mb = MeshBuilder('Mast')
    x, y, z = MAST
    # mastro de madeira com cintas de aço, base de pedra e escoras
    mb.add(prim_box(0.7, 0.3, 0.7, base=True), 'stone_light', M((x, y, z)), bevel=0.03)
    tube(mb, [(x, y + 0.3, z), (x, CPV[1] - 0.1, z)], [0.19, 0.15], 'wood_light', n=8, smooth=40)
    for yy in (0.8, 1.7, 2.6):
        mb.add(prim_cyl(0.2, 0.2, 0.1, 8), 'steel_dark', M((x, y + yy, z)), smooth=30)
    for sx, sz in ((1, 0), (0, 1), (0, -1)):
        beam(mb, (x + sx * 0.7, y + 0.2, z + sz * 0.7), (x + sx * 0.14, y + 1.9, z + sz * 0.14), 0.12, 0.12, 'wood_beam')
    mb.add(prim_cyl(0.28, 0.28, 0.14, 10), 'steel', M((x, CPV[1] - 0.12, z)), smooth=30)
    return mb.build(mats, parent=root)


def build_boom(mats, root):
    mb = MeshBuilder('Anim_Crane')
    pv = CPV
    an = Piv(mb, pv)
    x, y, z = pv
    tip = Vector((x - 1.8, y + 0.55, z + 0.05))
    base = Vector((x + 0.5, y - 0.1, z))
    beam(an, tuple(base), tuple(tip), 0.28, 0.24, 'wood_light', bevel=0.02)
    dv = (tip - base).normalized()
    for t in (0.25, 0.6, 0.92):
        p = base.lerp(tip, t)
        beam(an, tuple(p - dv * 0.07), tuple(p + dv * 0.07), 0.34, 0.3, 'steel_dark')
    an.add(prim_sphere(0.2, 0.18, 0.2, 8, 4), 'steel', M((x, y, z)), smooth=50)
    # contrapeso e tirante
    an.add(prim_box(0.5, 0.4, 0.4), 'stone_dark', M((x + 0.7, y - 0.2, z)), bevel=0.03)
    beam(an, tuple(tip), (x + 0.2, y + 1.2, z), 0.05, 0.05, 'rope')
    beam(an, (x + 0.2, y + 1.2, z), tuple(base + Vector((0.1, 0, 0))), 0.05, 0.05, 'rope')
    # corda e âncora pendurada
    hx, hy = tip.x, tip.y
    tube(an, [(hx, hy - 0.05, tip.z), (hx, hy - 0.9, tip.z)], [0.04, 0.04], 'rope', n=5, smooth=50)
    an.add(prim_box(0.2, 0.14, 0.14), 'steel', M((hx, hy - 0.95, tip.z)), bevel=0.015)
    I.anchor(an, hx, hy - 1.05, tip.z, s=0.75, yaw=90)
    return mb.build(mats, parent=root, location=pv)


def build_smoke(mats, root):
    mb = MeshBuilder('Anim_Smoke')
    pv = (KX, CH_TOP + 0.25, KZ)
    I.smoke_puffs(Piv(mb, pv), pv, top=1.3, r0=0.22, rmax=0.46)
    return mb.build(mats, parent=root, location=pv)


def build_trim(mats, root, bmb):
    # faixa de time sob o beiral frontal do galpão e friso lateral
    zf = HZ + HD / 2
    bmb.add(prim_box(HW + 0.1, 0.16, 0.05), 'team', M((HX, DK + HH - 0.2, zf + 0.04)), bevel=0.0)
    # bandeira vertical na parede de pedra ao lado da porta
    N.banner_cloth(bmb, M((HX - 1.0, DK + 1.75, zf + 0.12)), 0.5, 0.95, 'team', 'gold', wave=(0.03, 4.0, 2.5, 0.0), pointed=True)
    return bmb.build(mats, parent=root)


def main():
    args = C.script_args()
    C.reset_scene()
    N.patch_small_bevels(0.025)
    mats = C.make_paint_set(PALETTE)
    root = C.make_empty('Foundry')
    bmb = MeshBuilder('Anim_Banners')
    base = build_base(mats, root)
    hall = build_hall(mats, root, bmb)
    furnace = build_furnace(mats, root, bmb)
    yard = build_yard(mats, root)
    mast = build_mast(mats, root)
    boom = build_boom(mats, root)
    smoke = build_smoke(mats, root)
    banners = build_trim(mats, root, bmb)
    weights = {'Base': 0.7, 'Hall': 1.2, 'Furnace': 1.1, 'Yard': 1.2, 'Mast': 0.6, 'Anim_Banners': 0.9, 'Anim_Crane': 0.8, 'Anim_Smoke': 0.3}
    finish_building(root, 'foundry', 'foundry.glb', 'foundry_atlas', [base, hall, furnace, yard, mast], banners, weights, TEAM_DEFAULT, args,
                    spawn=(0, 0, 6.0), rally=(0, 0, 7.4), extra_anim=[boom, smoke], game_dist=72,
                    extra_views=[('ref', (-1.0, 0.95, 1.0)), ('ref2', (1.0, 0.95, 1.0)), ('low', (0.6, 0.12, 1.0))])


if __name__ == '__main__':
    main()
