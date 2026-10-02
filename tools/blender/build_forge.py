"""
build_forge.py — Forja Real humana (tipo interno `forge`) gerada 100% por script.

Uso:
  blender -b --factory-startup --python tools/blender/build_forge.py -- [--no-render]

Saída (public/models/forge.glb), coordenadas do jogo, origem no centro da base, frente = +Z:
  Forge (raiz)
  ├─ Static_Mesh       oficina de pedra com fornalha de arco aberta e brasas, chaminé afunilada com borda
  │                    alargada, galpão de telhado azul, bigorna sobre cepo com ferro em brasa, cocho de
  │                    têmpera, marreta, tenazes, rack de espadas e lingotes, carvão e lenha (Atlas)
  ├─ Anim_Banners      escudo heráldico e estandartes (material TeamColor)
  ├─ Socket_UnitSpawn  saída das unidades
  └─ Socket_Rally      ponto de reunião padrão
Pegada ~6,6 x 6,6 (raio de colisão 3,4), altura ~7,2. 2 draw calls.
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
Y0 = 0.30
FT = 0.8
WT = 3.1
RISE = 1.1
HX, HZ, CZ = 2.4, 1.6, -1.3
ZF = CZ + HZ

PALETTE = dict(S.PALETTE)
PALETTE.update(H.HUMAN_EXTRAS)


def build_base(mats, root):
    mb = MeshBuilder('Base')
    mb.add(prim_box(6.6, Y0, 6.6, taper=(0.975, 0.975), base=True), 'stone_dark', bevel=0.07)
    mb.add(prim_box(6.3, 0.04, 6.3, base=True), 'paving', M((0, Y0, 0)))
    # lajes de pedra escura sob a bigorna (chão de forja, chamuscado)
    mb.add(prim_box(2.6, 0.05, 2.0, base=True), 'coal', M((-1.5, Y0 + 0.04, 2.0), (0, 8, 0)))
    return mb.build(mats, parent=root)


def build_shop(mats, root, banners):
    mb = MeshBuilder('Shop')
    H_ = WT - FT
    mb.add(prim_box(2 * HX + 0.3, FT - Y0, 2 * HZ + 0.3, taper=(0.985, 0.985), base=True), 'stone', M((0, Y0, CZ)), bevel=0.05)
    mb.add(prim_box(2 * HX + 0.4, 0.1, 2 * HZ + 0.4, base=True), 'stone_light', M((0, FT - 0.1, CZ)), bevel=0.03)
    # paredes: pedra (forja = fogo, sem reboco) com vigas de carvalho
    mb.add(prim_box(2 * HX, H_, 2 * HZ, base=True), 'stone', M((0, FT, CZ)), bevel=0.02)
    for sz in (-1, 1):
        z = CZ + sz * (HZ + 0.03)
        beam(mb, (-HX, WT - 0.1, z), (HX, WT - 0.1, z), 0.16, 0.12, 'wood_beam')
        for x in (-HX + 0.1, 0.0 if sz < 0 else -0.95, HX - 0.1):
            beam(mb, (x, FT, z), (x, WT, z), 0.15, 0.12, 'wood_beam')
    for sx in (-1, 1):
        x = sx * (HX + 0.03)
        beam(mb, (x, WT - 0.1, CZ - HZ), (x, WT - 0.1, CZ + HZ), 0.16, 0.12, 'wood_beam')
        for z in (CZ - HZ + 0.1, CZ, CZ + HZ - 0.1):
            beam(mb, (x, FT, z), (x, WT, z), 0.15, 0.12, 'wood_beam')
        H.window(mb, M((x + sx * 0.02, 2.2, CZ + 0.8), (0, 90 * sx, 0)), 0.5, 0.7, shutters=True)
    # empena de reboco só na frente e atrás
    gable = [(-HX, 0.0), (HX, 0.0), (0.0, RISE)]
    for sz in (-1, 1):
        mb.add(prim_extrude(gable, 0.36, axis='z'), 'stone', M((0, WT, CZ + sz * (HZ - 0.18))), bevel=0.02)
        H.gable_frame(mb, 0.0, CZ + sz * (HZ + 0.02), HX, WT, RISE, 'wood_beam')
    # frente: abertura larga com viga mestra (galpão aberto à direita) e porta pequena à esquerda
    mb.add(prim_box(2.0, 1.75, 0.5, base=True), 'dark', M((0.95, FT + 0.01, ZF - 0.05)))   # interior escuro
    mb.add(prim_box(2.3, 0.22, 0.56), 'wood_beam', M((0.95, FT + 1.88, ZF - 0.02)), bevel=0.02)
    for x in (-0.25, 2.15):
        mb.add(prim_box(0.22, 1.95, 0.5, base=True), 'wood_beam', M((x, FT, ZF - 0.02)), bevel=0.02)
    H.door_arched(mb, M((-1.55, FT, ZF - 0.12)), 0.95, 1.8)
    H.lantern(mb, M((-0.7, FT + 1.9, ZF + 0.35)))
    # fornalha/lareira de pedra no fundo, voltada para a frente, com arco, brasas e capela afunilada
    FX, FZ = 0.95, CZ - HZ + 0.7
    mb.add(prim_box(1.7, 1.4, 1.0, base=True, taper=(0.95, 0.9)), 'stone_dark', M((FX, FT, FZ)), bevel=0.04)
    mb.add(prim_extrude(H.arch_poly(0.95, 0.9, FT + 0.1), 0.2, axis='z'), 'dark', M((FX, 0, FZ + 0.45)))
    mb.add(prim_box(0.75, 0.12, 0.45), 'ember', M((FX, FT + 0.2, FZ + 0.4)))
    mb.add(prim_sphere(0.35, 0.12, 0.2, 7, 3, y_min=0.0), 'ember', M((FX, FT + 0.2, FZ + 0.4)), smooth=60)
    for k in range(4):
        mb.add(prim_cone(0.1, 0.35 + 0.1 * (k % 2), 4), 'ember', M((FX - 0.26 + 0.17 * k, FT + 0.26, FZ + 0.42)), smooth=0)
    # capela afunilada + chaminé alta de pedra com borda alargada (sobe pela cumeeira)
    mb.add(prim_box(1.5, 1.2, 0.9, taper=(0.5, 0.55), base=True), 'stone', M((FX, FT + 1.4, FZ)), bevel=0.03)
    H.chimney(mb, FX, FZ, WT + 0.2, WT + RISE + 3.0, 0.78, mat='stone', cap='stone_light', taper=0.78)
    # painel de tijolo e janelinha no fundo
    return mb.build(mats, parent=root)


def build_roof(mats, root):
    mb = MeshBuilder('Roof')
    H.roof_gabled(mb, 0.0, CZ, HX, HZ, WT, RISE, 'roof', 'gold', ov=0.5, ov_z=0.5)
    # abre-fresta para a chaminé: tampa de pedra em volta
    mb.add(prim_box(1.3, 0.2, 1.1), 'stone', M((0.95, WT + RISE - 0.1, CZ - HZ + 0.7)), bevel=0.02)
    return mb.build(mats, parent=root)


def build_yard(mats, root, banners):
    mb = MeshBuilder('Yard')
    # bigorna sobre cepo de tronco (frente-esquerda) com ferro em brasa
    ax, az = -1.75, 2.1
    mb.add(prim_cyl(0.36, 0.4, 0.62, 10, base=True), 'bark', M((ax, Y0, az)), smooth=40)
    mb.add(prim_cyl(0.36, 0.36, 0.03, 10), 'log_end', M((ax, Y0 + 0.62, az)))
    T = M((ax, Y0 + 0.65, az), (0, 25, 0))
    mb.add(prim_box(0.34, 0.12, 0.84, taper=(0.9, 0.5)), 'iron', T @ M((0, 0.06, 0)), bevel=0.012)
    mb.add(prim_box(0.28, 0.14, 0.4, taper=(0.55, 0.9)), 'iron', T @ M((0, 0.19, 0.0)), bevel=0.012)
    mb.add(prim_box(0.36, 0.1, 0.56), 'iron', T @ M((0, 0.3, 0.0)), bevel=0.01)
    mb.add(prim_cone(0.075, 0.45, 6), 'iron', T @ M((0, 0.3, 0.5), (90, 0, 0)))          # ponta (bico)
    mb.add(prim_box(0.3, 0.05, 0.18), 'ember', T @ M((0, 0.36, 0.0)))                         # ferro em brasa
    mb.add(prim_box(0.12, 0.04, 0.34), 'ember', T @ M((0, 0.37, 0.28)))
    # marreta apoiada no cepo e tenazes pendurados
    log(mb, (ax + 0.75, Y0, az + 0.3), (ax + 0.55, Y0 + 1.25, az + 0.05), 0.04, 'wood_light', n=6)
    mb.add(prim_box(0.46, 0.22, 0.22), 'iron', M((ax + 0.52, Y0 + 1.3, az + 0.04), (0, 0, 14)), bevel=0.02)
    # cocho de têmpera com água
    mb.add(prim_box(1.3, 0.5, 0.6, taper=(0.95, 0.92), base=True), 'wood', M((0.6, Y0, 2.55), (0, -6, 0)), bevel=0.03)
    mb.add(prim_box(1.1, 0.04, 0.44), 'water', M((0.6, Y0 + 0.48, 2.55), (0, -6, 0)))
    for sx in (-1, 1):
        mb.add(prim_box(0.08, 0.28, 0.62), 'iron', M((0.6 + sx * 0.5, Y0 + 0.3, 2.55), (0, -6, 0)))
    # carvão, lenha e lingotes de ferro empilhados à direita
    mb.add(prim_sphere(0.6, 0.3, 0.5, 8, 4, y_min=0.0), 'coal', M((2.7, Y0, 1.4)), smooth=0)
    for k in range(7):
        a = k * 0.9
        mb.add(prim_box(0.16, 0.14, 0.12), 'coal', M((2.7 + math.cos(a) * 0.4, Y0 + 0.28, 1.4 + math.sin(a) * 0.3), (0, a * 40, 20)))
    for i in range(3):
        for j in range(3 - i):
            log(mb, (2.35 + i * 0.1 + j * 0.2, Y0 + 0.12 + i * 0.2, 2.45), (2.35 + i * 0.1 + j * 0.2, Y0 + 0.12 + i * 0.2, 3.3),
                0.1, 'bark', n=6)
    for i in range(4):
        mb.add(prim_box(0.5, 0.1, 0.16), 'steel', M((1.5, Y0 + 0.05 + 0.1 * (i // 2), 3.3 - 0.2 * (i % 2)), (0, 10 * i, 0)), bevel=0.01)
    # rack de espadas e escudos na parede lateral esquerda
    for k in range(4):
        z = CZ - 0.5 + 0.35 * k
        mb.add(prim_box(0.05, 1.0, 0.06), 'steel', M((-HX - 0.12, FT + 1.15, z), (0, 0, 4 * (k - 1.5))), bevel=0.004)
        mb.add(prim_box(0.06, 0.1, 0.18), 'gold', M((-HX - 0.12, FT + 0.62, z)))
    mb.add(prim_box(0.08, 0.1, 1.6), 'wood_beam', M((-HX - 0.1, FT + 0.55, CZ + 0.4)))
    # barris e tijolos de refratário
    H.barrel(mb, -2.95, Y0, 0.9)
    H.barrel(mb, -2.75, Y0, 1.4, r=0.24, h=0.5)
    H.crate(mb, 2.9, Y0, -0.5, 0.5, 10)
    # mastro de bandeira à frente
    H.flag(mb, 3.0, 3.0, Y0, 4.0, banners, side=-1, w=0.95, hgt=0.5)
    return mb.build(mats, parent=root)


def build_banners(mats, root, mb):
    shield = [(0.0, 0.34), (0.26, 0.27), (0.26, -0.05), (0.0, -0.34), (-0.26, -0.05), (-0.26, 0.27)]
    mb.add(prim_extrude(shield, 0.05, axis='z'), 'team', M((-0.45, FT + 2.65, ZF + 0.05)), bevel=0.005)
    sw = [(-0.4, 0.0), (0.4, 0.0), (0.4, -0.8), (0.0, -0.58), (-0.4, -0.8)]
    verts, faces = prim_extrude(sw, 0.04, axis='z')
    verts = [(x, y, z + 0.04 * math.sin(y * 6.0)) for (x, y, z) in verts]
    mb.add((verts, faces), 'team', M((0.95, FT + 3.1, ZF + 0.08)), smooth=40)
    return mb.build(mats, parent=root)


def main():
    args = C.script_args()
    C.reset_scene()
    mats = C.make_paint_set(PALETTE)
    root = C.make_empty('Forge')
    bmb = MeshBuilder('Anim_Banners')
    base = build_base(mats, root)
    shop = build_shop(mats, root, bmb)
    roof = build_roof(mats, root)
    yard = build_yard(mats, root, bmb)
    banners = build_banners(mats, root, bmb)
    finish_building(root, 'forge', 'forge.glb', 'forge_atlas', [base, shop, roof, yard], banners,
                    {'Base': 0.6, 'Shop': 1.1, 'Roof': 0.8, 'Yard': 1.0, 'Anim_Banners': 1.0},
                    TEAM_DEFAULT, args, spawn=(0, 0, 4.4), rally=(0, 0, 6.4))


if __name__ == '__main__':
    main()
