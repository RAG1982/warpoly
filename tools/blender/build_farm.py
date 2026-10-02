"""
build_farm.py — Fazenda de Trigo humana (tipo interno `farm`) gerada 100% por script.

Uso:
  blender -b --factory-startup --python tools/blender/build_farm.py -- [--no-render]

Saída (public/models/farm.glb), coordenadas do jogo, origem no centro da base, frente = +Z:
  Farm (raiz)
  ├─ Static_Mesh       celeiro-casa de enxaimel com telhado de palha/azul, talha do sótão e portões, galpão
  │                    lateral com lenha e roda de carroça, poço de pedra com roldana, campo sulcado de trigo
  │                    dourado, cerca de ripas com portão, fardos, sacos, forcado, rastelo e lanterna (Atlas)
  ├─ Anim_Banners      pendão do celeiro e fitas de time (material TeamColor)
  ├─ Socket_UnitSpawn  saída (portão do pátio)
  └─ Socket_Rally      ponto de reunião padrão
Pegada ~6 x 6 (raio de colisão 2,8), altura ~4,6. 2 draw calls.
"""
import os
import sys
import math

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
from mathutils import Vector, Matrix  # noqa: E402
import common as C  # noqa: E402
from common import (MeshBuilder, M, prim_box, prim_rings, ring_h, prim_cyl, prim_cone,  # noqa: E402
                    prim_sphere, prim_extrude, bezier)
from bld_common import beam, tube, log, finish_building  # noqa: E402
import bld_house as H  # noqa: E402
import build_stable as S  # noqa: E402

TEAM_DEFAULT = '#3a66d6'
Y0 = 0.25
FT = 0.6
WT = 2.35
RISE = 1.3
HX, HZ = 1.55, 1.15
BX0, BZ0 = -1.55, -2.35          # centro do celeiro (canto esquerdo-fundo)
CZ = -1.85
ZF = CZ + HZ

PALETTE = dict(S.PALETTE)
PALETTE.update(H.HUMAN_EXTRAS)
PALETTE['thatch'] = dict(base='#c8a24a', var='#9c7c2a', var_scale=3.0, var_amt=0.9, fine=0.2, pattern='planks_v',
                         mapping='box', pw=3.0, ph=0.12, mortar='#6a521c', mortar_size=0.02, top=0.3, ao=(0.6, 0.55))


def build_base(mats, root):
    mb = MeshBuilder('Base')
    mb.add(prim_box(6.0, Y0, 6.0, taper=(0.975, 0.975), base=True), 'stone_dark', bevel=0.06)
    mb.add(prim_box(5.7, 0.04, 5.7, base=True), 'soil', M((0, Y0, 0)))
    return mb.build(mats, parent=root)


def build_barn(mats, root, banners):
    mb = MeshBuilder('Barn')
    cx = -0.55
    H_ = WT - FT
    mb.add(prim_box(2 * HX + 0.25, FT - Y0, 2 * HZ + 0.25, taper=(0.985, 0.985), base=True), 'stone', M((cx, Y0, CZ)), bevel=0.05)
    mb.add(prim_box(2 * HX, H_, 2 * HZ, base=True), 'plaster', M((cx, FT, CZ)), bevel=0.02)
    for sz in (-1, 1):
        z = CZ + sz * (HZ + 0.03)
        beam(mb, (cx - HX, FT + 0.1, z), (cx + HX, FT + 0.1, z), 0.11, 0.1, 'wood_beam')
        beam(mb, (cx - HX, WT - 0.1, z), (cx + HX, WT - 0.1, z), 0.13, 0.1, 'wood_beam')
        for x in (-HX + 0.07, -0.5, 0.5, HX - 0.07):
            beam(mb, (cx + x, FT, z), (cx + x, WT, z), 0.13, 0.1, 'wood_beam')
        for sx in (-1, 1):
            beam(mb, (cx + sx * 0.5, FT + 0.1, z), (cx + sx * (HX - 0.07), WT - 0.1, z), 0.09, 0.08, 'wood_beam')
    for sx in (-1, 1):
        x = cx + sx * (HX + 0.03)
        beam(mb, (x, FT + 0.1, CZ - HZ), (x, FT + 0.1, CZ + HZ), 0.11, 0.1, 'wood_beam')
        beam(mb, (x, WT - 0.1, CZ - HZ), (x, WT - 0.1, CZ + HZ), 0.13, 0.1, 'wood_beam')
        for z in (CZ - HZ + 0.07, CZ, CZ + HZ - 0.07):
            beam(mb, (x, FT, z), (x, WT, z), 0.13, 0.1, 'wood_beam')
    H.window(mb, M((cx - HX - 0.01, 1.45, CZ), (0, -90, 0)), 0.45, 0.55)
    gable = [(-HX, 0.0), (HX, 0.0), (0.0, RISE)]
    for sz in (-1, 1):
        mb.add(prim_extrude(gable, 0.3, axis='z'), 'plaster', M((cx, WT, CZ + sz * (HZ - 0.15))), bevel=0.02)
        H.gable_frame(mb, cx, CZ + sz * (HZ + 0.02), HX, WT, RISE, 'wood_beam')
    # portões duplos de celeiro (frente), talha no sótão
    for sx in (-1, 1):
        mb.add(prim_box(0.62, 1.55, 0.09, base=True), 'wood_door', M((cx + sx * 0.33, FT + 0.01, ZF + 0.03)), bevel=0.015)
        beam(mb, (cx + sx * 0.05, FT + 0.2, ZF + 0.1), (cx + sx * 0.6, FT + 1.4, ZF + 0.1), 0.08, 0.04, 'wood_beam')
        beam(mb, (cx + sx * 0.6, FT + 0.2, ZF + 0.1), (cx + sx * 0.05, FT + 1.4, ZF + 0.1), 0.08, 0.04, 'wood_beam')
    mb.add(prim_box(1.5, 0.12, 0.14), 'wood_beam', M((cx, FT + 1.62, ZF + 0.07)))
    hl = WT + 0.2
    mb.add(prim_extrude(H.arch_poly(0.7, 0.8, hl), 0.14, axis='z'), 'wood_beam', M((cx, 0, ZF - 0.12)))
    mb.add(prim_extrude(H.arch_poly(0.55, 0.7, hl + 0.03), 0.12, axis='z'), 'dark', M((cx, 0, ZF - 0.1)))
    mb.add(prim_box(0.5, 0.2, 0.3), 'hay', M((cx, hl + 0.12, ZF - 0.05)), bevel=0.02)
    mb.add(prim_box(0.14, 0.14, 0.9), 'wood_beam', M((cx, WT + RISE - 0.1, ZF + 0.3)), bevel=0.02)       # talha
    mb.add(prim_cyl(0.09, 0.09, 0.05, 8, base=False), 'iron', M((cx, WT + RISE - 0.28, ZF + 0.62), (0, 0, 90)))
    log(mb, (cx, WT + RISE - 0.3, ZF + 0.62), (cx, WT + 0.4, ZF + 0.62), 0.015, 'rope', n=5)
    # galpão lateral aberto (lean-to) à direita com lenha e roda
    sx0 = cx + HX
    mb.add(prim_box(1.1, 0.12, 1.9), 'wood', M((sx0 + 0.6, FT + 1.15, CZ)), bevel=0.02)
    for z in (CZ - 0.85, CZ + 0.85):
        mb.add(prim_box(0.12, 1.2, 0.12, base=True), 'wood_beam', M((sx0 + 1.1, FT, z)), bevel=0.01)
    for k in range(3):
        for j in range(3 - k):
            log(mb, (sx0 + 0.3 + 0.2 * j + 0.1 * k, FT + 0.12 + 0.2 * k, CZ - 0.7), (sx0 + 0.3 + 0.2 * j + 0.1 * k, FT + 0.12 + 0.2 * k, CZ + 0.1), 0.1, 'bark', n=6)
    mb.add(prim_cyl(0.42, 0.42, 0.07, 14, base=False), 'wood', M((sx0 + 0.8, FT + 0.45, CZ + 0.55), (0, 0, 90)), smooth=0)
    for k in range(4):
        mb.add(prim_box(0.05, 0.84, 0.05), 'wood_beam', M((sx0 + 0.8, FT + 0.45, CZ + 0.55), (45 * k, 0, 0)))
    return mb.build(mats, parent=root)


def build_roof(mats, root):
    mb = MeshBuilder('Roof')
    cx = -0.55
    H.roof_gabled(mb, cx, CZ, HX, HZ, WT, RISE, 'thatch', 'wood_beam', ov=0.45, ov_z=0.4, thick=0.22, ridge=True)
    # telhadinho do galpão: prancha inclinada de palha
    sx0 = cx + HX
    mb.add(prim_box(1.4, 0.12, 2.3), 'thatch', M((sx0 + 0.65, FT + 1.55, CZ), (0, 0, -22)), bevel=0.02)
    return mb.build(mats, parent=root)


def build_yard(mats, root, banners):
    mb = MeshBuilder('Yard')
    # campo de trigo sulcado (frente-direita): leiras de terra e touceiras douradas
    FX0, FZ0 = 0.0, 0.2
    for r in range(5):
        z = FZ0 + 0.5 * r
        mb.add(prim_box(2.6, 0.1, 0.26, base=True), 'soil', M((FX0 + 1.5, Y0, z + 0.3)), bevel=0.02)
        for k in range(11):
            x = FX0 + 0.3 + 0.24 * k + (0.04 if r % 2 else 0)
            mb.add(prim_cone(0.07, 0.5, 5), 'wheat', M((x + 0.0, Y0 + 0.05, z + 0.3)), smooth=0)
            mb.add(prim_sphere(0.045, 0.1, 0.045, 5, 3), 'wheat', M((x, Y0 + 0.5, z + 0.3), (0, 0, 8)), smooth=60)
    # poço de pedra com roldana e balde (frente-esquerda)
    wx, wz = -2.0, 1.6
    mb.add(prim_cyl(0.55, 0.6, 0.7, 10, base=True), 'stone', M((wx, Y0, wz)), bevel=0.0, smooth=0)
    mb.add(prim_cyl(0.62, 0.62, 0.1, 10), 'stone_light', M((wx, Y0 + 0.7, wz)), smooth=0)
    mb.add(prim_cyl(0.45, 0.45, 0.02, 10), 'water', M((wx, Y0 + 0.66, wz)))
    for sx in (-1, 1):
        mb.add(prim_box(0.1, 1.3, 0.1, base=True), 'wood_beam', M((wx + sx * 0.5, Y0 + 0.7, wz)), bevel=0.01)
    mb.add(prim_box(1.2, 0.1, 0.1), 'wood_beam', M((wx, Y0 + 2.0, wz)), bevel=0.01)
    mb.add(prim_cone(0.7, 0.4, 4, base=True, phase=math.pi / 4), 'thatch', M((wx, Y0 + 2.05, wz)))
    mb.add(prim_cyl(0.1, 0.1, 0.5, 8, base=False), 'wood', M((wx, Y0 + 1.5, wz), (0, 0, 90)))
    log(mb, (wx + 0.15, Y0 + 1.5, wz), (wx + 0.15, Y0 + 1.0, wz), 0.012, 'rope', n=4)
    mb.add(prim_cyl(0.1, 0.08, 0.16, 7), 'wood', M((wx + 0.15, Y0 + 0.88, wz)), smooth=40)
    # cerca de ripas com portão aberto no pátio
    pts = [(-2.9, 0.4, -2.9, 2.9), (2.9, 0.4, 2.9, 2.9), (-2.9, 2.9, -0.6, 2.9), (0.6, 2.9, 2.9, 2.9)]
    for (x0, z0, x1, z1) in pts:
        L = math.hypot(x1 - x0, z1 - z0)
        n = max(2, int(L / 0.55))
        for k in range(n + 1):
            t = k / n
            mb.add(prim_box(0.09, 0.7, 0.09, base=True), 'wood_beam', M((x0 + (x1 - x0) * t, Y0, z0 + (z1 - z0) * t)), bevel=0.01)
        for y in (0.28, 0.55):
            beam(mb, (x0, Y0 + y, z0), (x1, Y0 + y, z1), 0.07, 0.05, 'wood')
    # portão aberto (folha encostada)
    mb.add(prim_box(0.9, 0.6, 0.06, base=True), 'wood', M((-0.6, Y0 + 0.05, 3.15), (0, 70, 0)), bevel=0.01)
    # fardos, sacos, forcado, rastelo, lanterna
    H.hay_bale(mb, 0.1, Y0, 0.0, 12, 0.9)
    H.hay_bale(mb, 0.1, Y0 + 0.4, 0.05, -8, 0.8)
    H.hay_bale(mb, -0.9, Y0, 0.15, 5, 0.8)
    for k in range(3):
        mb.add(prim_sphere(0.17, 0.2, 0.15, 7, 4), 'canvas', M((2.55 + 0.08 * k, Y0 + 0.2, 0.55 + 0.3 * k)), smooth=70)
        mb.add(prim_box(0.14, 0.05, 0.02), 'paint_red', M((2.55 + 0.08 * k, Y0 + 0.25, 0.72 + 0.3 * k)))
    log(mb, (0.8, Y0, 2.6), (0.65, Y0 + 1.4, 2.7), 0.025, 'wood_light', n=5)
    for dx in (-0.1, 0.0, 0.1):
        mb.add(prim_cone(0.012, 0.28, 4), 'iron', M((0.65 + dx, Y0 + 1.5, 2.7)))
    mb.add(prim_box(0.3, 0.025, 0.025), 'iron', M((0.65, Y0 + 1.4, 2.7)))
    # mastro de bandeira à frente do portão
    H.flag(mb, 2.75, 3.05, Y0, 3.2, banners, side=-1, w=0.75, hgt=0.4)
    H.lantern(mb, M((-0.5, FT + 1.45, ZF + 0.45)))
    return mb.build(mats, parent=root)


def build_banners(mats, root, mb):
    sw = [(-0.3, 0.0), (0.3, 0.0), (0.3, -0.7), (0.0, -0.5), (-0.3, -0.7)]
    verts, faces = prim_extrude(sw, 0.03, axis='z')
    verts = [(x, y, z + 0.03 * math.sin(y * 6.0)) for (x, y, z) in verts]
    mb.add((verts, faces), 'team', M((-0.55, FT + 1.95, ZF + 0.17)), smooth=40)
    return mb.build(mats, parent=root)


def main():
    args = C.script_args()
    C.reset_scene()
    mats = C.make_paint_set(PALETTE)
    root = C.make_empty('Farm')
    bmb = MeshBuilder('Anim_Banners')
    base = build_base(mats, root)
    barn = build_barn(mats, root, bmb)
    roof = build_roof(mats, root)
    yard = build_yard(mats, root, bmb)
    banners = build_banners(mats, root, bmb)
    finish_building(root, 'farm', 'farm.glb', 'farm_atlas', [base, barn, roof, yard], banners,
                    {'Base': 0.5, 'Barn': 1.0, 'Roof': 0.8, 'Yard': 1.2, 'Anim_Banners': 0.8},
                    TEAM_DEFAULT, args, spawn=(0, 0, 4.0), rally=(0, 0, 6.0))


if __name__ == '__main__':
    main()
