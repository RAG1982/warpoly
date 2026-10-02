"""
build_lumber_camp.py — Serraria Florestal humana (tipo interno `lumber_camp`) gerada 100% por script.

Uso:
  blender -b --factory-startup --python tools/blender/build_lumber_camp.py -- [--no-render]

Saída (public/models/lumber_camp.glb), coordenadas do jogo, origem no centro da base, frente = +Z:
  LumberCamp (raiz)
  ├─ Static_Mesh       plataforma de toras, galpão aberto de vigas pesadas com telhado de ripas azuis, cavalete
  │                    com serra circular dentada cortando um tronco, pirâmide de toras com anéis de
  │                    crescimento, pilhas de tábuas ripadas, cepo com machado, serrote de dois homens, tina
  │                    de têmpera, serragem, lanterna e rampa de carga (Atlas)
  ├─ Anim_Banners      pendão do galpão e faixas (material TeamColor)
  ├─ Socket_UnitSpawn  saída (frente do galpão)
  └─ Socket_Rally      ponto de reunião padrão
Pegada ~6,4 x 6,4 (raio de colisão 3,2), altura ~5,6. 2 draw calls.
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
TOP = 3.3            # topo das vigas do galpão
RISE = 1.25
HX, HZ, CZ = 2.4, 1.7, -1.3

PALETTE = dict(S.PALETTE)
PALETTE.update(H.HUMAN_EXTRAS)


def build_base(mats, root):
    mb = MeshBuilder('Base')
    mb.add(prim_box(6.5, Y0, 6.5, taper=(0.975, 0.975), base=True), 'stone_dark', bevel=0.07)
    # plataforma de toras roliças (piso do galpão)
    for k in range(16):
        z = -2.95 + 0.37 * k
        log(mb, (-2.9, Y0 + 0.12, z), (2.9, Y0 + 0.12, z), 0.17, 'bark', n=7)
    mb.add(prim_box(5.9, 0.1, 5.8, base=True), 'soil', M((0, Y0, 0.0)))
    return mb.build(mats, parent=root)


def build_shed(mats, root, banners):
    mb = MeshBuilder('Shed')
    # prumos pesados de tronco quadrado, vigas, escoras e tesouras
    xs = (-HX, HX)
    zs = (CZ - HZ, CZ, CZ + HZ)
    for x in xs:
        for z in zs:
            mb.add(prim_box(0.3, TOP - Y0 - 0.1, 0.3, base=True), 'wood_beam', M((x, Y0 + 0.2, z)), bevel=0.03)
            mb.add(prim_box(0.4, 0.14, 0.4), 'stone_dark', M((x, Y0 + 0.2, z)), bevel=0.02)
            mb.add(prim_box(0.36, 0.1, 0.36), 'iron', M((x, TOP - 0.1, z)), bevel=0.01)
    for z in zs:
        beam(mb, (-HX - 0.2, TOP, z), (HX + 0.2, TOP, z), 0.3, 0.26, 'wood', bevel=0.02)
        for sx in (-1, 1):
            beam(mb, (sx * HX, TOP - 0.7, z), (sx * (HX - 0.9), TOP, z), 0.13, 0.13, 'wood_beam')
        # tesoura: viga + empenas em A
        beam(mb, (-HX, TOP + 0.1, z), (0, TOP + RISE, z), 0.16, 0.16, 'wood_beam')
        beam(mb, (HX, TOP + 0.1, z), (0, TOP + RISE, z), 0.16, 0.16, 'wood_beam')
        beam(mb, (-HX * 0.5, TOP + RISE * 0.5, z), (HX * 0.5, TOP + RISE * 0.5, z), 0.1, 0.1, 'wood_beam')
    for x in xs:
        beam(mb, (x, TOP, CZ - HZ), (x, TOP, CZ + HZ), 0.26, 0.24, 'wood', bevel=0.02)
        beam(mb, (x, TOP - 0.9, CZ - HZ), (x, TOP - 0.9, CZ + HZ), 0.14, 0.12, 'wood_beam')
    # parede dos fundos: tábuas verticais, com janelinha de ventilação
    mb.add(prim_box(2 * HX, TOP - Y0 - 0.9, 0.14, base=True), 'plank_new', M((0, Y0 + 0.2, CZ - HZ - 0.02)), bevel=0.01)
    for k in range(7):
        mb.add(prim_box(0.05, TOP - Y0 - 0.9, 0.04, base=True), 'wood_beam', M((-HX + 0.4 + k * 0.67, Y0 + 0.2, CZ - HZ + 0.07)))
    # fecho da empena de trás e da frente (ripado)
    gable = [(-HX, 0.0), (HX, 0.0), (0.0, RISE)]
    mb.add(prim_extrude(gable, 0.1, axis='z'), 'plank_new', M((0, TOP, CZ - HZ - 0.02)), bevel=0.01)
    # cumeeira
    beam(mb, (0, TOP + RISE, CZ - HZ - 0.2), (0, TOP + RISE, CZ + HZ + 0.4), 0.16, 0.16, 'wood_beam')
    # placa na frente: tábua com serra pintada
    mb.add(prim_box(1.3, 0.34, 0.06), 'wood_dark', M((0, TOP - 0.45, CZ + HZ + 0.06)), bevel=0.01)
    mb.add(prim_cyl(0.13, 0.13, 0.03, 10, base=False), 'steel', M((0, TOP - 0.45, CZ + HZ + 0.1), (90, 0, 0)), smooth=0)
    # lanternas nos prumos da frente
    for sx in (-1, 1):
        H.lantern(mb, M((sx * HX * 0.85, TOP - 0.9, CZ + HZ + 0.4)))
    return mb.build(mats, parent=root)


def build_roof(mats, root):
    mb = MeshBuilder('Roof')
    H.roof_gabled(mb, 0.0, CZ, HX, HZ, TOP + 0.1, RISE, 'shake', 'wood_beam', ov=0.55, ov_z=0.55, thick=0.18, ridge=True)
    # pontaletes entalhados nas pontas da cumeeira
    for z in (CZ - HZ - 0.55, CZ + HZ + 0.55):
        mb.add(prim_cone(0.07, 0.35, 5), 'wood_beam', M((0, TOP + RISE + 0.1, z)))
    return mb.build(mats, parent=root)


def build_saw(mats, root):
    mb = MeshBuilder('Saw')
    # cavalete de serra: base de vigas em X, tronco mestre e serra circular de dentes
    sx0, sz0 = -0.55, CZ + 0.15
    for dz in (-0.7, 0.7):
        for dx in (-0.35, 0.35):
            beam(mb, (sx0 + dx, Y0 + 0.12, sz0 + dz - 0.2 * dx), (sx0 + dx * 0.3, Y0 + 1.05, sz0 + dz), 0.14, 0.14, 'wood_beam')
        mb.add(prim_box(1.3, 0.14, 0.18), 'wood', M((sx0, Y0 + 1.0, sz0 + dz)), bevel=0.015)
    log(mb, (sx0 - 1.7, Y0 + 1.25, sz0), (sx0 + 1.7, Y0 + 1.25, sz0), 0.27, 'bark', n=9)
    mb.add(prim_cyl(0.27, 0.27, 0.03, 9, base=False), 'log_end', M((sx0 + 1.71, Y0 + 1.25, sz0), (0, 0, 90)), smooth=0)
    mb.add(prim_box(0.06, 0.52, 1.0), 'plank_new', M((sx0 + 0.0, Y0 + 1.25, sz0)))      # corte feito (tábua solta)
    # serra circular (disco de aço com dentes) em eixo transversal, com polia e correia
    R = 0.62
    T = M((sx0, Y0 + 1.7, sz0 - 0.55), (0, 90, 0))
    mb.add(prim_cyl(R, R, 0.035, 20, base=False), 'steel', T @ M((0, 0, 0), (90, 0, 0)), smooth=0)
    for k in range(18):
        a = 2 * math.pi * k / 18
        mb.add(prim_cone(0.06, 0.13, 3), 'steel', T @ M((math.cos(a) * (R + 0.01), math.sin(a) * (R + 0.01), 0), (0, 0, math.degrees(a) - 90)))
    mb.add(prim_cyl(0.12, 0.12, 0.12, 8, base=False), 'iron', T @ M((0, 0, 0), (90, 0, 0)))
    for dz in (-0.6, 0.6):   # armação da serra
        beam(mb, (sx0 + dz, Y0 + 1.7, sz0 - 0.55), (sx0 + dz, Y0 + 2.5, sz0 - 0.55), 0.1, 0.1, 'wood_beam')
    mb.add(prim_box(1.4, 0.12, 0.14), 'wood_beam', M((sx0, Y0 + 2.5, sz0 - 0.55)))
    # roda-d'água/volante de transmissão com correia
    mb.add(prim_cyl(0.4, 0.4, 0.06, 12, base=False), 'wood', M((sx0 + 1.0, Y0 + 1.7, sz0 - 0.55), (0, 90, 0)) @ M(r=(90, 0, 0)), smooth=0)
    for k in range(6):
        mb.add(prim_box(0.05, 0.8, 0.05), 'wood_beam', M((sx0 + 1.0, Y0 + 1.7, sz0 - 0.55), (60 * k, 0, 0)))
    beam(mb, (sx0 + 1.0, Y0 + 1.7 + 0.4, sz0 - 0.55), (sx0 + 0.0, Y0 + 1.7 + 0.12, sz0 - 0.55), 0.06, 0.04, 'leather_dark')
    beam(mb, (sx0 + 1.0, Y0 + 1.7 - 0.4, sz0 - 0.55), (sx0 + 0.0, Y0 + 1.7 - 0.12, sz0 - 0.55), 0.06, 0.04, 'leather_dark')
    # serragem no chão sob o cavalete
    mb.add(prim_sphere(1.1, 0.12, 0.8, 9, 3, y_min=0.0), 'sawdust', M((sx0, Y0 + 0.1, sz0)), smooth=60)
    return mb.build(mats, parent=root)


def build_yard(mats, root, banners):
    mb = MeshBuilder('Yard')
    # pirâmide de toras (pilha) à direita do galpão com anéis de crescimento nas pontas
    px, pz = 2.4, 1.2
    rows = [4, 3, 2, 1]
    for r, n in enumerate(rows):
        for k in range(n):
            x = px + (k - (n - 1) / 2) * 0.4
            y = Y0 + 0.22 + r * 0.34
            log(mb, (x, y, pz - 0.9), (x, y, pz + 0.9), 0.2, 'bark', n=8)
            mb.add(prim_cyl(0.2, 0.2, 0.02, 8, base=False), 'log_end', M((x, y, pz + 0.91), (90, 0, 0)), smooth=0)
    for z in (pz - 0.7, pz + 0.7):
        mb.add(prim_box(1.9, 0.07, 0.07), 'rope', M((px, Y0 + 0.9, z)))
    # tábuas ripadas (lumber) à frente-esquerda
    for r in range(5):
        mb.add(prim_box(2.0, 0.1, 0.5), 'plank_new', M((-2.1, Y0 + 0.28 + 0.15 * r, 2.2)), bevel=0.01)
        mb.add(prim_box(0.12, 0.06, 0.52), 'wood_beam', M((-2.1 + 0.65, Y0 + 0.2 + 0.15 * r, 2.2)))
        mb.add(prim_box(0.12, 0.06, 0.52), 'wood_beam', M((-2.1 - 0.65, Y0 + 0.2 + 0.15 * r, 2.2)))
    for dz in (-0.55, 0.55):
        mb.add(prim_box(2.1, 0.12, 0.12, base=True), 'wood_beam', M((-2.1, Y0, 2.2 + dz)))
    # cepo com machado e lascas
    mb.add(prim_cyl(0.34, 0.4, 0.58, 10, base=True), 'bark', M((0.5, Y0, 2.4)), smooth=40)
    mb.add(prim_cyl(0.34, 0.34, 0.02, 10), 'log_end', M((0.5, Y0 + 0.58, 2.4)))
    log(mb, (0.5, Y0 + 0.62, 2.35), (0.1, Y0 + 1.0, 2.5), 0.03, 'wood_light', n=5)
    mb.add(prim_box(0.28, 0.24, 0.05), 'steel', M((0.46, Y0 + 0.66, 2.38), (0, 0, -15)), bevel=0.007)
    for k in range(6):
        mb.add(prim_box(0.12, 0.06, 0.18), 'log_end', M((0.8 + 0.2 * math.cos(k * 1.7), Y0 + 0.03, 2.4 + 0.2 * math.sin(k * 1.7)), (0, k * 40, 0)))
    # serrote de dois homens apoiado no tronco; tina de têmpera; barris; serragem
    mb.add(prim_box(1.5, 0.12, 0.012), 'steel', M((-1.0, Y0 + 0.5, 1.1), (0, 12, 22)))
    for dx in (-0.7, 0.7):
        mb.add(prim_box(0.07, 0.3, 0.07), 'wood', M((-1.0 + dx * math.cos(math.radians(-12)), Y0 + 0.5, 1.1 + dx * 0.2), (0, 0, 0)))
    mb.add(prim_rings([ring_h(0, 0.38, 0.38, 10), ring_h(0.3, 0.44, 0.44, 10), ring_h(0.55, 0.4, 0.4, 10)]), 'wood',
           M((-2.9, Y0, 0.4)), smooth=50)
    mb.add(prim_cyl(0.37, 0.37, 0.02, 10), 'water', M((-2.9, Y0 + 0.5, 0.4)))
    H.barrel(mb, -2.85, Y0, -0.5, r=0.25, h=0.5)
    mb.add(prim_sphere(0.8, 0.14, 0.6, 8, 3, y_min=0.0), 'sawdust', M((0.9, Y0 + 0.05, 1.5)), smooth=60)
    H.flag(mb, -3.1, 2.9, Y0, 4.0, banners, side=1, w=0.95, hgt=0.5)
    return mb.build(mats, parent=root)


def build_banners(mats, root, mb):
    sw = [(-0.6, 0.0), (0.6, 0.0), (0.6, -0.5), (0.0, -0.8), (-0.6, -0.5)]
    verts, faces = prim_extrude(sw, 0.04, axis='z')
    verts = [(x, y, z + 0.04 * math.sin(x * 5.0)) for (x, y, z) in verts]
    mb.add((verts, faces), 'team', M((0, TOP - 0.7, CZ + HZ + 0.35)), smooth=40)
    return mb.build(mats, parent=root)


def main():
    args = C.script_args()
    C.reset_scene()
    mats = C.make_paint_set(PALETTE)
    root = C.make_empty('LumberCamp')
    bmb = MeshBuilder('Anim_Banners')
    base = build_base(mats, root)
    shed = build_shed(mats, root, bmb)
    roof = build_roof(mats, root)
    saw = build_saw(mats, root)
    yard = build_yard(mats, root, bmb)
    banners = build_banners(mats, root, bmb)
    finish_building(root, 'lumber_camp', 'lumber_camp.glb', 'lumber_camp_atlas', [base, shed, roof, saw, yard], banners,
                    {'Base': 0.6, 'Shed': 1.0, 'Roof': 0.8, 'Saw': 1.1, 'Yard': 1.1, 'Anim_Banners': 0.8},
                    TEAM_DEFAULT, args, spawn=(0, 0, 4.2), rally=(0, 0, 6.2))


if __name__ == '__main__':
    main()
