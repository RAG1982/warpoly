"""
build_naval_forge.py — Fornalha Naval orc (tipo `naval_forge`, M5-04) gerada 100% por script. Estilo: build_ship_dock.py /
build_orc_oil_platform.py (ferro negro, ossos, couro, toras).

Uso:
  blender -b --factory-startup --python tools/blender/build_naval_forge.py -- [--no-render]

Saída (public/models/naval_forge.glb), coordenadas do jogo, origem no centro da pegada (y = 0 = chão), mar = +Z:
  NavalForge (raiz)
  ├─ Static_Mesh       plataforma de basalto, forja de placas de ferro negro com telhado de lâminas e crista de chifres, boca
  │                    incandescente com presas e crânio, duas chaminés em brasa, estaleiro de ferro (casco em esqueleto de
  │                    costelas de ferro sobre cavaletes com esporão de osso), âncora e correntes, bigorna, tanque de
  │                    têmpera, píer de toras com mastro-guindaste de ossos (Atlas 512²)
  ├─ Anim_Banners      estandartes esfarrapados nos mastros e faixa de time do beiral (TeamColor)
  ├─ Anim_Crane        lança do guindaste do píer com corrente e âncora pendurada (pivô no topo do mastro; oscila em Y)
  ├─ Anim_Smoke        fumaça da chaminé esquerda (pivô no topo)
  ├─ Socket_UnitSpawn  saída (mar, +Z)
  └─ Socket_Rally      ponto de reunião padrão
Pegada ~6,6 x 9, raio de colisão 3,4; altura ~6,5.
"""
import os
import sys
import math

os.environ.setdefault('ATLAS', '512')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402,F401
from mathutils import Vector  # noqa: E402,F401
import common as C  # noqa: E402
from common import (MeshBuilder, M, prim_box, prim_cyl, prim_cone, prim_sphere, bezier)  # noqa: E402
from bld_common import beam, tube, log, skull, finish_building  # noqa: E402
import bld_house as H  # noqa: E402
import bld_orc as O  # noqa: E402
import build_orc_oil_platform as OP  # noqa: E402
import naval_common as N  # noqa: E402
import ind_common as I  # noqa: E402
from naval_common import Piv  # noqa: E402

TEAM_DEFAULT = '#b81d24'
DK = 0.35
HX, HZ = -0.55, -1.75          # centro da forja
HW, HD, HH = 4.2, 3.0, 2.3
PIER_X = 1.2
CPV = (2.0, DK + 3.5, 3.4)     # pivô da lança do guindaste
CH1 = (HX - 1.25, HZ - 0.85)   # chaminé esquerda
CH2 = (HX + 1.25, HZ - 0.85)   # chaminé direita
CH_TOP = DK + HH + 0.9 + 3.0

PALETTE = dict(OP.PALETTE)


def build_base(mats, root):
    mb = MeshBuilder('Base')
    mb.add(prim_box(6.6, DK - 0.04, 5.4, base=True), 'rock', M((0, 0, -0.8)), bevel=0.06)
    mb.add(prim_box(6.2, 0.06, 5.0, base=True), 'plate_dark', M((0, DK - 0.06, -0.8)))
    for k in range(5):      # chapas rebitadas no chão
        mb.add(prim_box(1.1, 0.03, 1.1, base=True), 'plate', M((-2.4 + k * 1.2, DK - 0.01, 1.2), (0, 3 * k, 0)))
    I.pier(mb, PIER_X, 1.9, 5.6, 2.4, DK, deck='plank', stringer='log', post='log', cap='iron')
    for (x, z) in ((-3.3, 1.9), (3.3, 1.9), (-3.3, -3.5), (3.3, -3.5)):
        mb.add(prim_cone(0.3, 0.6, 5), 'rock_plain', M((x, DK - 0.1, z)), smooth=0)
    # cerca de espinhos de ferro na borda da plataforma (frente-esquerda)
    O.spike_fence_line(mb, (-3.2, 1.85), (-0.2, 1.85), DK, 8, h=0.7, r=0.06)
    return mb.build(mats, parent=root)


def build_forge(mats, root, banners):
    mb = MeshBuilder('Forge')
    zf = HZ + HD / 2
    mb.add(prim_box(HW, HH, HD, base=True, taper=(0.97, 0.97)), 'plate_dark', M((HX, DK, HZ)), bevel=0.04)
    mb.add(prim_box(HW + 0.2, 0.22, HD + 0.2, base=True), 'plate', M((HX, DK, HZ)), bevel=0.03)
    # cintas verticais de ferro e rebites
    for dx in (-1.9, -0.95, 0.95, 1.9):
        mb.add(prim_box(0.16, HH, 0.07, base=True), 'plate', M((HX + dx, DK, zf + 0.02)), bevel=0.01)
        for dy in (0.5, 1.2, 1.9):
            N.rivets(mb, [(HX + dx, DK + dy, zf + 0.07)], 0.03, 'steel')
    for sx in (-1, 1):
        for dz in (-0.8, 0.8):
            mb.add(prim_box(0.07, HH, 0.16, base=True), 'plate', M((HX + sx * (HW / 2 + 0.02), DK, HZ + dz)), bevel=0.01)
    # telhado de placas de ferro (duas águas) com viga de cumeeira e espinhos de osso
    ridge_y = H.roof_gabled(mb, HX, HZ, HW / 2, HD / 2, DK + HH, 1.0, 'plate', ridge_mat='iron', ov=0.4, ov_z=0.4)
    for k in range(6):
        z = HZ - 1.35 + k * 0.54
        mb.add(prim_cone(0.1, 0.65, 5), 'ivory', M((HX, ridge_y + 0.15, z)), smooth=30)
    # boca da forja: arco incandescente com grade, presas e crânio
    mb.add(prim_extrude_arch(1.5, 1.55), 'glow', M((HX, DK + 0.1, zf + 0.02)))
    H.door_arched(mb, M((HX, DK + 0.1, zf + 0.04)), 1.5, 1.55, mat='glow', frame='plate', iron='iron', gold='steel')
    for sx in (-1, 1):
        O.tusk(mb, (HX + sx * 1.05, DK + 0.1, zf + 0.2), (HX + sx * 0.5, DK + 2.1, zf + 0.45), (sx * 0.28, 0.1, 0.18), r0=0.17, mat='ivory')
    skull(mb, M((HX, DK + HH - 0.35, zf + 0.12), (0, 0, 0)), 0.85, 'bone')
    # janelas incandescentes laterais
    for dz in (-0.6, 0.6):
        mb.add(prim_box(0.05, 0.45, 0.4), 'window', M((HX + HW / 2 + 0.06, DK + 1.35, HZ + dz)))
    # chaminés de ferro com aro e brasa
    for (cx, cz) in (CH1, CH2):
        y0 = DK + HH + 0.55
        tube(mb, [(cx, y0, cz), (cx, CH_TOP, cz)], [0.5, 0.32], 'plate_dark', n=10, smooth=40)
        for t in (0.3, 0.65):
            mb.add(prim_cyl(0.47 - 0.15 * t, 0.47 - 0.15 * t, 0.1, 10), 'plate', M((cx, y0 + (CH_TOP - y0) * t, cz)), smooth=30)
        mb.add(prim_cyl(0.48, 0.34, 0.25, 10), 'iron', M((cx, CH_TOP - 0.05, cz)), smooth=30)
        mb.add(prim_cyl(0.28, 0.28, 0.06, 10), 'ember', M((cx, CH_TOP + 0.18, cz)), smooth=30)
        I.flames(mb, cx, CH_TOP + 0.2, cz, s=0.9, n=2)
        for k in range(4):
            a = math.pi / 2 * k + 0.4
            mb.add(prim_cone(0.06, 0.4, 4), 'iron', M((cx + math.cos(a) * 0.4, CH_TOP + 0.1, cz + math.sin(a) * 0.4), (0, 0, 0)), smooth=0)
    # faixa de time sob o beiral e estandarte dependurado ao lado da boca
    banners.add(prim_box(HW + 0.1, 0.18, 0.05), 'team', M((HX, DK + HH - 0.12, zf + 0.06)), bevel=0.0)
    O.tattered_banner(banners, HX - 1.65, DK + 2.0, zf + 0.18, 0, w=0.7, h=1.25)
    O.tattered_banner(banners, HX + 1.65, DK + 2.0, zf + 0.18, 0, w=0.7, h=1.25)
    return mb.build(mats, parent=root)


def prim_extrude_arch(w, h):
    from common import prim_extrude
    return prim_extrude(H.arch_poly(w, h), 0.06, axis='z')


def build_yard(mats, root, banners):
    mb = MeshBuilder('Yard')
    # estaleiro de ferro: casco em esqueleto (quilha + costelas curvas) sobre cavaletes de toras
    cx, y0 = 2.35, DK + 0.55
    z0, z1 = -2.0, 1.55
    log(mb, (cx, y0, z0), (cx, y0, z1), 0.11, 'iron', n=6)
    nr = 6
    for k in range(nr):
        t = k / (nr - 1)
        z = z0 + (z1 - z0) * (0.08 + 0.84 * t)
        w = 0.78 * math.sin(math.pi * (0.1 + 0.8 * t)) ** 0.8 + 0.12
        pts = []
        for j in range(9):
            th = -math.pi / 2 + math.pi * j / 8
            pts.append((cx + w * math.sin(th), y0 + 0.2 + 0.95 * w * (1 - math.cos(th)) + 0.0, z))
        tube(mb, pts, [0.06] * len(pts), 'plate' if k % 2 else 'plate_dark', n=5, smooth=30)
        mb.add(prim_cone(0.05, 0.28, 4), 'ivory', M(pts[0]), smooth=0)
        mb.add(prim_cone(0.05, 0.28, 4), 'ivory', M(pts[-1]), smooth=0)
    # chapas do casco parcialmente fixadas (revestimento) e bordas
    for sx in (-1, 1):
        beam(mb, (cx + sx * 0.5, y0 + 0.55, z0 + 0.5), (cx + sx * 0.55, y0 + 0.75, z1 - 0.5), 0.08, 0.06, 'iron')
    mb.add(prim_box(0.7, 0.5, 1.2, taper=(0.9, 0.9), base=True), 'plate', M((cx - 0.55, y0 + 0.28, z0 + 1.0), (0, 8, 0)), bevel=0.02)
    # esporão de osso na proa e cavaletes
    O.tusk(mb, (cx, y0 + 0.28, z1 + 0.05), (cx, y0 + 0.6, z1 + 0.95), (0.0, 0.12, 0.0), r0=0.15, mat='ivory')
    for z in (z0 + 0.5, z1 - 0.7):
        for sx in (-1, 1):
            beam(mb, (cx + sx * 0.95, DK, z), (cx + sx * 0.18, y0 - 0.1, z), 0.14, 0.14, 'log')
    # bigorna grande sobre toco
    ax, az = -0.25, 0.85
    mb.add(prim_cyl(0.32, 0.36, 0.5, 9), 'log', M((ax, DK, az)), smooth=40)
    mb.add(prim_box(0.62, 0.12, 0.46, base=True), 'iron', M((ax, DK + 0.5, az)), bevel=0.02)
    mb.add(prim_box(0.32, 0.22, 0.32, base=True), 'iron', M((ax, DK + 0.62, az)), bevel=0.02)
    mb.add(prim_box(1.05, 0.22, 0.44, base=True), 'steel', M((ax, DK + 0.84, az)), bevel=0.02)
    mb.add(prim_cone(0.22, 0.5, 6), 'steel', M((ax - 0.68, DK + 0.95, az), (0, 0, 90)), smooth=0)
    mb.add(prim_cone(0.12, 0.2, 5), 'ember', M((ax + 0.15, DK + 1.06, az)), smooth=0)
    # tanque de têmpera de toras com óleo
    tx, tz = -2.1, 0.7
    mb.add(prim_box(1.2, 0.5, 0.7, base=True), 'log', M((tx, DK, tz), (0, 10, 0)), bevel=0.03)
    mb.add(prim_box(1.04, 0.04, 0.54), 'oil', M((tx, DK + 0.46, tz), (0, 10, 0)))
    for sx in (-1, 1):
        mb.add(prim_box(0.07, 0.55, 0.74, base=True), 'iron', M((tx + sx * 0.45, DK, tz), (0, 10, 0)))
    # âncora de ferro de exibição e correntes
    I.anchor(mb, -3.0, DK + 1.7, -0.3, s=0.95, mat='iron', yaw=75)
    for z in (-2.3, 0.3):
        for k in range(3):
            mb.add(N.torus_prim(0.11, 0.03, 8, 4), 'iron', M((-3.0, DK + 0.1 + 0.12 * k, z + 0.1 * k), (0, 40 * k, 0)), smooth=0)
    # pilha de lingotes / chapas e carvão
    for r in range(3):
        mb.add(prim_box(0.7, 0.1, 0.5, base=True), 'plate', M((0.9, DK + r * 0.11, 1.35), (0, 8 * r, 0)), bevel=0.01)
    mb.add(prim_sphere(0.35, 0.14, 0.25, 7, 3, y_min=0.0), 'coal', M((1.35, DK, 0.55)), smooth=50)
    # barris e totem de crânio na quina esquerda do fundo
    O.barrel_orc(mb, 0.55, DK, 1.55, r=0.26, h=0.58)
    O.barrel_orc(mb, 0.95, DK, 1.7, r=0.24, h=0.55)
    O.barrel_orc(mb, 0.2, DK + 0.0, 5.0, r=0.26, h=0.58)
    O.barrel_orc(mb, 0.65, DK, 5.1, r=0.24, h=0.55)
    N.rope_coil(mb, 1.9, DK, 5.0, R=0.26, r=0.06, turns=3, rot=10)
    log(mb, (-3.05, DK, -3.1), (-3.05, DK + 3.2, -3.1), 0.09, 'log', n=6)
    skull(mb, M((-3.05, DK + 3.35, -3.1)), 0.55, 'bone')
    O.banner_pole(mb, 3.0, DK, -3.1, 3.2, banners=banners, w=0.75, bh=1.1)
    return mb.build(mats, parent=root)


def build_mast(mats, root):
    mb = MeshBuilder('Mast')
    x, y, z = CPV[0], DK, CPV[2]
    mb.add(prim_box(0.8, 0.3, 0.8, base=True), 'rock_plain', M((x, y, z)), bevel=0.04)
    tube(mb, [(x, y + 0.3, z), (x, CPV[1] - 0.12, z)], [0.2, 0.15], 'log', n=7, smooth=40)
    for yy in (0.8, 1.7, 2.6):
        mb.add(prim_cyl(0.21, 0.21, 0.1, 8), 'iron', M((x, y + yy, z)), smooth=30)
    for sx, sz in ((1, 0), (0, 1), (0, -1)):
        O.tusk(mb, (x + sx * 0.8, y + 0.2, z + sz * 0.8), (x + sx * 0.15, y + 2.2, z + sz * 0.15), (sx * 0.12, 0.0, sz * 0.12), r0=0.15, mat='ivory')
    mb.add(prim_cyl(0.28, 0.28, 0.14, 10), 'iron', M((x, CPV[1] - 0.12, z)), smooth=30)
    return mb.build(mats, parent=root)


def build_boom(mats, root):
    mb = MeshBuilder('Anim_Crane')
    pv = CPV
    an = Piv(mb, pv)
    x, y, z = pv
    tip = Vector((x - 1.85, y + 0.5, z + 0.05))
    base = Vector((x + 0.5, y - 0.1, z))
    beam(an, tuple(base), tuple(tip), 0.26, 0.22, 'log', bevel=0.02)
    dv = (tip - base).normalized()
    for t in (0.25, 0.6, 0.92):
        p = base.lerp(tip, t)
        beam(an, tuple(p - dv * 0.07), tuple(p + dv * 0.07), 0.32, 0.28, 'iron')
    an.add(prim_sphere(0.2, 0.18, 0.2, 8, 4), 'iron', M((x, y, z)), smooth=50)
    an.add(prim_sphere(0.3, 0.28, 0.3, 7, 4), 'bone', M((x + 0.6, y - 0.25, z)), smooth=50)       # contrapeso de crânio
    O.tusk(an, (tip.x, tip.y, tip.z), (tip.x - 0.5, tip.y + 0.3, tip.z), (0.0, 0.1, 0.0), r0=0.1, mat='ivory')
    # corrente e âncora pendurada
    hx, hy = tip.x, tip.y
    for k in range(6):
        an.add(N.torus_prim(0.07, 0.02, 8, 4), 'iron', M((hx, hy - 0.1 - 0.13 * k, tip.z), (0, 90 * (k % 2), 0)), smooth=0)
    an.add(prim_box(0.2, 0.14, 0.14), 'iron', M((hx, hy - 0.98, tip.z)), bevel=0.015)
    I.anchor(an, hx, hy - 1.08, tip.z, s=0.75, mat='iron', yaw=90)
    return mb.build(mats, parent=root, location=pv)


def build_smoke(mats, root):
    mb = MeshBuilder('Anim_Smoke')
    pv = (CH1[0], CH_TOP + 0.6, CH1[1])
    I.smoke_puffs(Piv(mb, pv), pv, top=1.4, r0=0.22, rmax=0.48)
    return mb.build(mats, parent=root, location=pv)


def main():
    args = C.script_args()
    C.reset_scene()
    N.patch_small_bevels(0.025)
    mats = C.make_paint_set(PALETTE)
    root = C.make_empty('NavalForge')
    bmb = MeshBuilder('Anim_Banners')
    base = build_base(mats, root)
    forge = build_forge(mats, root, bmb)
    yard = build_yard(mats, root, bmb)
    mast = build_mast(mats, root)
    boom = build_boom(mats, root)
    smoke = build_smoke(mats, root)
    banners = bmb.build(mats, parent=root)
    weights = {'Base': 0.7, 'Forge': 1.3, 'Yard': 1.3, 'Mast': 0.6, 'Anim_Banners': 0.9, 'Anim_Crane': 0.8, 'Anim_Smoke': 0.3}
    finish_building(root, 'naval_forge', 'naval_forge.glb', 'naval_forge_atlas', [base, forge, yard, mast], banners, weights, TEAM_DEFAULT, args,
                    spawn=(0, 0, 6.0), rally=(0, 0, 7.4), extra_anim=[boom, smoke], game_dist=72,
                    extra_views=[('ref', (-1.0, 0.95, 1.0)), ('ref2', (1.0, 0.95, 1.0)), ('low', (0.6, 0.12, 1.0))])


if __name__ == '__main__':
    main()
