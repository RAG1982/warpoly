"""
build_cottage.py — Casa Residencial humana (tipo interno `cottage`) gerada 100% por script.

Uso:
  blender -b --factory-startup --python tools/blender/build_cottage.py -- [--no-render]

Saída (public/models/cottage.glb), coordenadas do jogo, origem no centro da base, frente = +Z:
  Cottage (raiz)
  ├─ Static_Mesh       embasamento de pedra de rio, paredes de reboco ocre com enxaimel de carvalho, telhado azul
  │                    de águas íngremes com mansarda, chaminé de tijolo, porta em arco com alpendre e lanterna,
  │                    jardineira de flores, lenha, cepo com machado, barril d'água e canteiro (Atlas)
  ├─ Anim_Banners      pendão do alpendre e cortinas/faixa em cor de time
  ├─ Socket_UnitSpawn  saída (frente da porta)
  └─ Socket_Rally      ponto de reunião padrão
Pegada ~5,4 x 5,4 (raio de colisão 2,8), altura ~5,4. 2 draw calls.
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
FT = 0.65
WT = 2.55
RISE = 1.7           # águas íngremes
HX, HZ, CZ = 1.75, 1.45, -0.35
ZF = CZ + HZ

PALETTE = dict(S.PALETTE)
PALETTE.update(H.HUMAN_EXTRAS)
PALETTE['plaster'] = dict(S.PALETTE['plaster'], base='#e8cf94', var='#d1b574')   # reboco ocre quente


def build_base(mats, root):
    mb = MeshBuilder('Base')
    mb.add(prim_box(5.4, Y0, 5.4, taper=(0.97, 0.97), base=True), 'stone_dark', bevel=0.06)
    mb.add(prim_box(5.1, 0.04, 5.1, base=True), 'soil', M((0, Y0, 0)))
    # lajes de pedra do caminho até a porta
    for k in range(4):
        mb.add(prim_box(0.9 - 0.08 * k, 0.05, 0.5, base=True), 'stone_light', M((0.05 * (k % 2), Y0, ZF + 0.35 + 0.5 * k)), bevel=0.015)
    return mb.build(mats, parent=root)


def build_house(mats, root, banners):
    mb = MeshBuilder('House')
    H_ = WT - FT
    mb.add(prim_box(2 * HX + 0.25, FT - Y0, 2 * HZ + 0.25, taper=(0.985, 0.985), base=True), 'stone', M((0, Y0, CZ)), bevel=0.05)
    mb.add(prim_box(2 * HX + 0.35, 0.09, 2 * HZ + 0.35, base=True), 'stone_light', M((0, FT - 0.09, CZ)), bevel=0.03)
    mb.add(prim_box(2 * HX, H_, 2 * HZ, base=True), 'plaster', M((0, FT, CZ)), bevel=0.02)
    # enxaimel em todas as faces
    for sz in (-1, 1):
        z = CZ + sz * (HZ + 0.03)
        beam(mb, (-HX, FT + 0.1, z), (HX, FT + 0.1, z), 0.11, 0.1, 'wood_beam')
        beam(mb, (-HX, WT - 0.1, z), (HX, WT - 0.1, z), 0.13, 0.1, 'wood_beam')
        beam(mb, (-HX, FT + H_ * 0.52, z), (HX, FT + H_ * 0.52, z), 0.09, 0.08, 'wood_beam')
        for x in (-HX + 0.07, 0.0, HX - 0.07):
            beam(mb, (x, FT, z), (x, WT, z), 0.13, 0.1, 'wood_beam')
        for sx in (-1, 1):
            beam(mb, (sx * 0.1, FT + 0.1, z), (sx * (HX - 0.07), FT + H_ * 0.52, z), 0.09, 0.08, 'wood_beam')
    for sx in (-1, 1):
        x = sx * (HX + 0.03)
        beam(mb, (x, FT + 0.1, CZ - HZ), (x, FT + 0.1, CZ + HZ), 0.11, 0.1, 'wood_beam')
        beam(mb, (x, WT - 0.1, CZ - HZ), (x, WT - 0.1, CZ + HZ), 0.13, 0.1, 'wood_beam')
        for z in (CZ - HZ + 0.07, CZ, CZ + HZ - 0.07):
            beam(mb, (x, FT, z), (x, WT, z), 0.13, 0.1, 'wood_beam')
        H.window(mb, M((x + sx * 0.02, 1.6, CZ - 0.7), (0, 90 * sx, 0)), 0.45, 0.6)
        H.window(mb, M((x + sx * 0.02, 1.6, CZ + 0.7), (0, 90 * sx, 0)), 0.45, 0.6)
    # empenas íngremes (frente e fundo)
    gable = [(-HX, 0.0), (HX, 0.0), (0.0, RISE)]
    for sz in (-1, 1):
        mb.add(prim_extrude(gable, 0.3, axis='z'), 'plaster', M((0, WT, CZ + sz * (HZ - 0.15))), bevel=0.02)
        H.gable_frame(mb, 0.0, CZ + sz * (HZ + 0.02), HX, WT, RISE, 'wood_beam')
    # fachada: porta em arco com alpendre, janela e lanterna
    H.door_arched(mb, M((0.35, FT, ZF - 0.12)), 0.85, 1.75)
    H.window(mb, M((-0.95, 1.65, ZF + 0.02)), 0.5, 0.65)
    mb.add(prim_box(1.4, 0.1, 0.7), 'wood', M((0.35, FT + 2.0, ZF + 0.35), (-10, 0, 0)), bevel=0.02)  # alpendre
    for sx in (-1, 1):
        mb.add(prim_box(0.1, 1.95, 0.1, base=True), 'wood_beam', M((0.35 + sx * 0.62, FT, ZF + 0.62)), bevel=0.01)
    H.lantern(mb, M((1.12, FT + 1.55, ZF + 0.3)))
    # jardineira de flores sob a janela
    mb.add(prim_box(0.7, 0.18, 0.22), 'wood', M((-0.95, 1.2, ZF + 0.18)), bevel=0.015)
    for k in range(6):
        mb.add(prim_sphere(0.09, 0.09, 0.09, 6, 3), 'leaf' if k % 2 else 'flower', M((-1.25 + 0.1 * k, 1.34 + 0.02 * (k % 2), ZF + 0.18)), smooth=70)
    # chaminé de tijolo e pedra (lateral direita)
    H.chimney(mb, HX - 0.05, CZ - 0.5, FT + 1.5, WT + RISE + 0.6, 0.55, mat='brick', cap='stone_light', taper=0.85)
    mb.add(prim_box(0.7, 0.9, 0.7, taper=(0.8, 0.8), base=True), 'stone', M((HX - 0.05, FT, CZ - 0.5)), bevel=0.03)
    return mb.build(mats, parent=root)


def build_roof(mats, root):
    mb = MeshBuilder('Roof')
    H.roof_gabled(mb, 0.0, CZ, HX, HZ, WT, RISE, 'roof', 'gold', ov=0.5, ov_z=0.45, thick=0.14)
    # mansarda (água-furtada) na face frontal-esquerda: caixa com telhadinho e janela
    dx, dz = -0.8, ZF - 0.55
    mb.add(prim_box(0.95, 0.9, 0.7, base=True), 'plaster', M((dx, WT + 0.35, dz)), bevel=0.02)
    H.roof_gabled(mb, dx, dz, 0.48, 0.38, WT + 1.25, 0.45, 'roof', 'gold', ov=0.12, ov_z=0.14, thick=0.1)
    H.window(mb, M((dx, WT + 0.8, dz + 0.37)), 0.38, 0.5, shutters=False, glass='glow')
    return mb.build(mats, parent=root)


def build_props(mats, root, banners):
    mb = MeshBuilder('Props')
    # pilha de lenha encostada na lateral esquerda
    for row in range(3):
        for k in range(4 - row):
            z = CZ - 0.8 + 0.22 * k + 0.11 * row
            log(mb, (-HX - 0.65, Y0 + 0.12 + 0.2 * row, z), (-HX - 0.1, Y0 + 0.12 + 0.2 * row, z), 0.1, 'bark', n=6)
    for row in range(3):
        for k in range(4 - row):
            z = CZ - 0.8 + 0.22 * k + 0.11 * row
            mb.add(prim_cyl(0.095, 0.095, 0.02, 6, base=False), 'log_end', M((-HX - 0.66, Y0 + 0.12 + 0.2 * row, z), (0, 0, 90)))
    # cepo com machado cravado e lascas
    mb.add(prim_cyl(0.26, 0.3, 0.45, 9, base=True), 'bark', M((1.9, Y0, 1.3)), smooth=40)
    mb.add(prim_cyl(0.26, 0.26, 0.02, 9), 'log_end', M((1.9, Y0 + 0.45, 1.3)))
    log(mb, (1.85, Y0 + 0.5, 1.28), (1.55, Y0 + 0.85, 1.35), 0.025, 'wood_light', n=5)
    mb.add(prim_box(0.18, 0.2, 0.04), 'steel', M((1.88, Y0 + 0.55, 1.3), (0, 0, -20)), bevel=0.006)
    # barril d'água sob a bica e balde
    H.barrel(mb, 1.7, Y0, -1.55)
    mb.add(prim_cyl(0.22, 0.18, 0.2, 8), 'wood', M((1.2, Y0, 0.4)), smooth=40)
    mb.add(prim_cyl(0.18, 0.18, 0.02, 8), 'water', M((1.2, Y0 + 0.19, 0.4)))
    # canteiro de hortaliça: leira + folhagem
    for k in range(3):
        mb.add(prim_box(1.3, 0.12, 0.28, base=True), 'soil', M((-1.2, Y0, 2.15 + 0.4 * k)), bevel=0.02)
        for j in range(5):
            mb.add(prim_sphere(0.1, 0.09, 0.1, 6, 3), 'leaf', M((-1.7 + 0.25 * j, Y0 + 0.15, 2.15 + 0.4 * k)), smooth=70)
    # trepadeira de flores na quina da fachada
    for k in range(5):
        mb.add(prim_sphere(0.1, 0.1, 0.1, 6, 3), 'leaf', M((HX - 0.05, FT + 0.3 + 0.35 * k, ZF + 0.06)), smooth=70)
        if k % 2:
            mb.add(prim_sphere(0.05, 0.05, 0.05, 5, 3), 'flower', M((HX - 0.0, FT + 0.35 + 0.35 * k, ZF + 0.14)), smooth=70)
    # banco de madeira ao lado da porta
    mb.add(prim_box(0.9, 0.07, 0.28), 'wood', M((-0.2, Y0 + 0.4, ZF + 0.2)), bevel=0.01)
    for sx in (-1, 1):
        mb.add(prim_box(0.08, 0.4, 0.24, base=True), 'wood_beam', M((-0.2 + sx * 0.38, Y0, ZF + 0.2)))
    # mastro curto com pendão de time (frente-direita)
    H.flag(mb, 2.35, 2.25, Y0, 2.9, banners, side=-1, w=0.7, hgt=0.38)
    return mb.build(mats, parent=root)


def build_banners(mats, root, mb):
    # cortinas na janela e pendão pendurado no alpendre
    sw = [(-0.18, 0.0), (0.18, 0.0), (0.18, -0.5), (0.0, -0.4), (-0.18, -0.5)]
    verts, faces = prim_extrude(sw, 0.03, axis='z')
    mb.add((verts, faces), 'team', M((0.35, FT + 2.0, ZF + 0.74)), smooth=40)
    for sx in (-1, 1):
        mb.add(prim_box(0.12, 0.5, 0.03), 'team', M((-0.95 + sx * 0.3, 1.65, ZF + 0.08)), bevel=0.004)
    return mb.build(mats, parent=root)


def main():
    args = C.script_args()
    C.reset_scene()
    mats = C.make_paint_set(PALETTE)
    root = C.make_empty('Cottage')
    bmb = MeshBuilder('Anim_Banners')
    base = build_base(mats, root)
    house = build_house(mats, root, bmb)
    roof = build_roof(mats, root)
    props = build_props(mats, root, bmb)
    banners = build_banners(mats, root, bmb)
    finish_building(root, 'cottage', 'cottage.glb', 'cottage_atlas', [base, house, roof, props], banners,
                    {'Base': 0.5, 'House': 1.1, 'Roof': 0.9, 'Props': 0.9, 'Anim_Banners': 0.8},
                    TEAM_DEFAULT, args, spawn=(0, 0, 3.8), rally=(0, 0, 5.8))


if __name__ == '__main__':
    main()
