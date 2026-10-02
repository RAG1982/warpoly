"""
build_barracks.py — Quartel de Infantaria humano (tipo interno `barracks`) gerado 100% por script.

Uso:
  blender -b --factory-startup --python tools/blender/build_barracks.py -- [--no-render]

Saída (public/models/barracks.glb), coordenadas do jogo, origem no centro da base, frente = +Z:
  Barracks (raiz)
  ├─ Static_Mesh       plinto de pedra, salão de enxaimel com portão em arco, telhado azul, torreta de vigia
  │                    de canto, pátio de treino com bonecos, racks de armas e alvo, cerca e lanternas (Atlas)
  ├─ Anim_Banners      estandartes, escudos heráldicos e flâmulas (material TeamColor)
  ├─ Socket_UnitSpawn  saída das unidades (pátio, frente do portão)
  └─ Socket_Rally      ponto de reunião padrão
Pegada ~6,9 x 6,9 (raio de colisão 3,5), altura ~6. 2 draw calls.
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
FT = 0.85           # topo do pé de pedra
WT = 3.30           # topo das paredes
RISE = 1.35
HX, HZ, CZ = 2.55, 1.75, -1.1      # meia-largura, meia-profundidade e centro z do salão
ZF = CZ + HZ                       # fachada

PALETTE = dict(S.PALETTE)
PALETTE.update(H.HUMAN_EXTRAS)
PALETTE.update({
    'steel': dict(base='#9aa1ad', var='#7b818d', var_scale=4.0, fine=0.06, top=0.4, edge='#eef2f8', edge_amt=0.8,
                  edge_r=0.012, ao=(0.25, 0.4)),
    'canvas': dict(base='#d8c9a2', var='#b9a878', var_scale=6.0, fine=0.12, top=0.3, ao=(0.3, 0.5)),
    'target_red': dict(base='#b02a22', var='#821a14', var_scale=6.0, top=0.3),
    'leather_dark': dict(base='#4a2e18', var='#35210f', var_scale=6.0, fine=0.12, top=0.2, ao=(0.25, 0.6)),
})


def build_base(mats, root):
    mb = MeshBuilder('Base')
    mb.add(prim_box(6.9, Y0, 6.9, taper=(0.975, 0.975), base=True), 'stone_dark', bevel=0.07)
    mb.add(prim_box(6.6, 0.04, 6.6, base=True), 'paving', M((0, Y0, 0)))
    # pátio de terra batida/cascalho em frente e degraus no portão
    mb.add(prim_box(2.2, 0.14, 0.8, base=True), 'stone_dark', M((0, Y0, ZF + 0.5)), bevel=0.03)
    mb.add(prim_box(1.9, 0.12, 0.5, base=True), 'stone_light', M((0, Y0 + 0.14, ZF + 0.35)), bevel=0.03)
    return mb.build(mats, parent=root)


def build_hall(mats, root, banners):
    mb = MeshBuilder('Hall')
    H_ = WT - FT
    # pé de pedra e paredes de reboco
    mb.add(prim_box(2 * HX + 0.3, FT - Y0, 2 * HZ + 0.3, taper=(0.985, 0.985), base=True), 'stone', M((0, Y0, CZ)), bevel=0.05)
    mb.add(prim_box(2 * HX + 0.4, 0.1, 2 * HZ + 0.4, base=True), 'stone_light', M((0, FT - 0.1, CZ)), bevel=0.03)
    mb.add(prim_box(2 * HX, H_, 2 * HZ, base=True), 'plaster', M((0, FT, CZ)), bevel=0.02)
    # enxaimel: vigas, prumos e escoras em X em todas as faces
    for sz in (-1, 1):
        z = CZ + sz * (HZ + 0.03)
        beam(mb, (-HX, FT + 0.12, z), (HX, FT + 0.12, z), 0.12, 0.1, 'wood_beam')
        beam(mb, (-HX, WT - 0.1, z), (HX, WT - 0.1, z), 0.14, 0.1, 'wood_beam')
        for x in (-HX + 0.07, -1.45, 1.45, HX - 0.07):
            beam(mb, (x, FT, z), (x, WT, z), 0.14, 0.1, 'wood_beam')
        for sx in (-1, 1):
            beam(mb, (sx * 1.45, FT + 0.12, z), (sx * HX, WT - 0.1, z), 0.1, 0.09, 'wood_beam')
    for sx in (-1, 1):
        x = sx * (HX + 0.03)
        beam(mb, (x, FT + 0.12, CZ - HZ), (x, FT + 0.12, CZ + HZ), 0.12, 0.1, 'wood_beam')
        beam(mb, (x, WT - 0.1, CZ - HZ), (x, WT - 0.1, CZ + HZ), 0.14, 0.1, 'wood_beam')
        for z in (CZ - HZ + 0.07, CZ - 0.6, CZ + 0.6, CZ + HZ - 0.07):
            beam(mb, (x, FT, z), (x, WT, z), 0.14, 0.1, 'wood_beam')
        for (za, zb) in ((CZ - HZ + 0.07, CZ - 0.6), (CZ + 0.6, CZ + HZ - 0.07)):
            beam(mb, (x, FT + 0.12, za), (x, WT - 0.1, zb), 0.1, 0.09, 'wood_beam')
        H.window(mb, M((x + sx * 0.02, 2.2, CZ), (0, 90 * sx, 0)), 0.55, 0.85, shutters=True)
    # empenas frente e fundo
    gable = [(-HX, 0.0), (HX, 0.0), (0.0, RISE)]
    for sz in (-1, 1):
        zc = CZ + sz * (HZ - 0.18)
        mb.add(prim_extrude(gable, 0.36, axis='z'), 'plaster', M((0, WT, zc)), bevel=0.02)
        H.gable_frame(mb, 0.0, CZ + sz * (HZ + 0.02), HX, WT, RISE, 'wood_beam')
    # fachada: portão em arco, duas janelas com venezianas, lanternas
    H.door_arched(mb, M((0, FT, ZF - 0.12)), 1.4, 2.1)
    for sx in (-1, 1):
        H.window(mb, M((sx * 1.85, 2.15, ZF + 0.02)), 0.6, 0.85)
        H.lantern(mb, M((sx * 1.0, FT + 1.7, ZF + 0.42)))
    # janelinha do sótão (frontão)
    H.window(mb, M((0, WT + 0.62, ZF + 0.12)), 0.46, 0.55, shutters=False)
    # janelas do fundo
    for sx in (-1, 1):
        H.window(mb, M((sx * 1.2, 2.15, CZ - HZ - 0.0), (0, 180, 0)), 0.55, 0.8)
    # chaminé de pedra no fundo
    H.chimney(mb, 1.55, CZ - 0.9, WT - 0.4, WT + RISE + 1.05, 0.62)
    # escudos heráldicos no friso (cor de time vai no Anim_Banners): moldura de ferro
    shield = [(0.0, 0.3), (0.22, 0.24), (0.22, -0.04), (0.0, -0.3), (-0.22, -0.04), (-0.22, 0.24)]
    for sx in (-1, 1):
        mb.add(prim_extrude([(x * 1.1, y * 1.1) for x, y in shield], 0.04, axis='z'), 'iron',
               M((sx * 0.95, WT + 0.05, ZF + 0.5 - 0.38)), bevel=0.006)
    return mb.build(mats, parent=root)


def build_roof(mats, root):
    mb = MeshBuilder('Roof')
    H.roof_gabled(mb, 0.0, CZ, HX, HZ, WT, RISE, 'roof', 'gold', ov=0.5, ov_z=0.5)
    # ventilação no telhado
    mb.add(prim_box(0.7, 0.3, 0.7, taper=(0.9, 0.9), base=True), 'wood', M((-1.0, WT + RISE + 0.1, CZ - 0.2)), bevel=0.02)
    mb.add(prim_cone(0.6, 0.38, 4, base=True, phase=math.pi / 4), 'roof_cone', M((-1.0, WT + RISE + 0.4, CZ - 0.2)), smooth=0)
    mb.add(prim_sphere(0.06, 0.06, 0.06, 6, 3), 'gold', M((-1.0, WT + RISE + 0.8, CZ - 0.2)), smooth=60)
    return mb.build(mats, parent=root)


def build_turret(mats, root):
    """Torreta de vigia no canto de trás-esquerdo: fuste de pedra, galeria de madeira, telhado cônico azul."""
    mb = MeshBuilder('Turret')
    tx, tz, r = -2.95, -2.85, 0.95
    mb.add(prim_rings([ring_h(Y0, r, r, 12), ring_h(1.8, r * 0.92, r * 0.92, 12), ring_h(4.0, r * 0.82, r * 0.82, 12)], cap0=False, cap1=True),
           'stone', M((tx, 0, tz)), smooth=0)
    mb.add(prim_cyl(r * 1.1, r * 1.0, 0.18, 12), 'stone_light', M((tx, Y0, tz)), smooth=0)
    mb.add(prim_cyl(r * 0.98, r * 0.98, 0.14, 12), 'stone_light', M((tx, 2.6, tz)), smooth=0)
    mb.add(prim_cyl(r * 1.05, r * 0.88, 0.4, 12), 'stone_dark', M((tx, 3.9, tz)), smooth=0)
    for k in range(12):
        a = 360 * k / 12
        if k % 3 == 0:
            continue
        x, z = H.polar(r * 0.86, a)
        mb.add(prim_box(0.34, 0.4, 0.2), 'stone_light', M((tx + x, 4.3, tz + z), (0, a, 0)), bevel=0.015)
    for a in (35, 135, 235, 315):
        x, z = H.polar(r * 0.83, a)
        mb.add(prim_box(0.12, 0.5, 0.06), 'dark', M((tx + x, 2.1, tz + z), (0, a, 0)))
    mb.add(prim_cone(r * 1.15, 1.3, 12, base=True), 'roof_cone', M((tx, 4.3, tz)), smooth=0)
    mb.add(prim_sphere(0.09, 0.09, 0.09, 6, 3), 'gold', M((tx, 5.6, tz)), smooth=60)
    log(mb, (tx, 5.6, tz), (tx, 6.0, tz), 0.02, 'iron', n=5)
    return mb.build(mats, parent=root)


def build_yard(mats, root, banners):
    mb = MeshBuilder('Yard')
    # racks de armas (A-frame com lanças e espadas)
    for sx in (-1, 1):
        x = sx * 2.65
        z = 1.7
        for dx in (-0.55, 0.55):
            beam(mb, (x + dx, Y0, z - 0.2), (x + dx * 0.6, Y0 + 1.15, z), 0.1, 0.1, 'wood_beam')
            beam(mb, (x + dx, Y0, z + 0.2), (x + dx * 0.6, Y0 + 1.15, z), 0.1, 0.1, 'wood_beam')
        beam(mb, (x - 0.5, Y0 + 1.0, z), (x + 0.5, Y0 + 1.0, z), 0.1, 0.1, 'wood')
        beam(mb, (x - 0.5, Y0 + 0.45, z), (x + 0.5, Y0 + 0.45, z), 0.09, 0.09, 'wood')
        for k in range(5):
            xx = x - 0.4 + 0.2 * k
            log(mb, (xx, Y0 + 0.4, z + 0.05 * (k % 2)), (xx + 0.05, Y0 + 2.0, z + 0.05 * (k % 2)), 0.025, 'wood_light', n=5)
            mb.add(prim_cone(0.045, 0.22, 5), 'steel', M((xx + 0.05, Y0 + 2.0, z + 0.05 * (k % 2))))
    # bonecos de treino (poste, braço, saco de palha, elmo) e alvo de tiro
    for (x, z, rot) in ((-1.55, 2.55, 20), (0.1, 2.9, -10), (1.8, 2.5, 8)):
        T = M((x, Y0, z), (0, rot, 0))
        mb.add(prim_cyl(0.07, 0.08, 1.7, 6), 'wood_beam', T, smooth=40)
        mb.add(prim_box(0.9, 0.09, 0.09), 'wood', T @ M((0, 1.25, 0)))
        mb.add(prim_sphere(0.26, 0.38, 0.22, 8, 4), 'canvas', T @ M((0, 1.05, 0)), smooth=70)
        mb.add(prim_sphere(0.14, 0.14, 0.14, 7, 4), 'canvas', T @ M((0, 1.62, 0)), smooth=70)
        mb.add(prim_sphere(0.17, 0.1, 0.17, 7, 3, y_min=0.0), 'steel', T @ M((0, 1.65, 0)), smooth=60)
        mb.add(prim_box(0.5, 0.05, 0.3), 'leather', T @ M((0, 0.82, 0)))
        mb.add(prim_cyl(0.3, 0.3, 0.06, 10), 'leather', T @ M((0.0, 0.0, 0.0)))
    # alvo de tiro em tripé
    T = M((-0.4, Y0, 3.25), (0, -12, 0))
    mb.add(prim_cyl(0.5, 0.5, 0.08, 14, base=False), 'canvas', T @ M((0, 1.15, 0), (90, 0, 0)), smooth=0)
    mb.add(prim_cyl(0.33, 0.33, 0.09, 14, base=False), 'target_red', T @ M((0, 1.15, 0.01), (90, 0, 0)), smooth=0)
    mb.add(prim_cyl(0.16, 0.16, 0.1, 12, base=False), 'canvas', T @ M((0, 1.15, 0.02), (90, 0, 0)), smooth=0)
    for dx in (-0.35, 0.35):
        beam(mb, (dx, 0.0, -0.3), (0.0, 1.2, -0.04), 0.07, 0.07, 'wood_beam')
    # cerca baixa de estacas nas laterais do pátio e barris/caixotes
    for sx in (-1, 1):
        for k in range(5):
            z = 1.4 + 0.45 * k
            mb.add(prim_box(0.09, 0.62, 0.09, base=True), 'wood_beam', M((sx * 3.25, Y0, z)), bevel=0.01)
        beam(mb, (sx * 3.25, Y0 + 0.5, 1.35), (sx * 3.25, Y0 + 0.5, 3.4), 0.06, 0.06, 'wood')
    H.barrel(mb, 2.7, Y0, 0.55)
    H.barrel(mb, 3.0, Y0, 0.2, r=0.24, h=0.5)
    H.crate(mb, -3.0, Y0, 0.4, 0.55, 15)
    H.crate(mb, -2.85, Y0 + 0.55, 0.45, 0.4, -20)
    # mastros com flâmulas de time nos cantos da frente
    for sx in (-1, 1):
        H.flag(mb, sx * 3.35, 3.3, Y0, 4.4, banners, side=-sx, w=0.95, hgt=0.5)
    return mb.build(mats, parent=root)


def build_banners(mats, root, mb):
    # pendão sobre o portão + escudos em cor de time sobre os de ferro
    shield = [(0.0, 0.3), (0.22, 0.24), (0.22, -0.04), (0.0, -0.3), (-0.22, -0.04), (-0.22, 0.24)]
    for sx in (-1, 1):
        mb.add(prim_extrude([(x * 0.92, y * 0.92) for x, y in shield], 0.04, axis='z'), 'team',
               M((sx * 0.95, WT + 0.05, ZF + 0.5 - 0.35)), bevel=0.005)
    sw = [(-0.45, 0.0), (0.45, 0.0), (0.45, -0.85), (0.0, -0.62), (-0.45, -0.85)]
    verts, faces = prim_extrude(sw, 0.04, axis='z')
    verts = [(x, y, z + 0.04 * math.sin(y * 6.0)) for (x, y, z) in verts]
    mb.add((verts, faces), 'team', M((0, FT + 2.55, ZF + 0.1)), smooth=40)
    return mb.build(mats, parent=root)


def main():
    args = C.script_args()
    C.reset_scene()
    mats = C.make_paint_set(PALETTE)
    root = C.make_empty('Barracks')
    bmb = MeshBuilder('Anim_Banners')
    base = build_base(mats, root)
    hall = build_hall(mats, root, bmb)
    roof = build_roof(mats, root)
    turret = build_turret(mats, root)
    yard = build_yard(mats, root, bmb)
    banners = build_banners(mats, root, bmb)
    finish_building(root, 'barracks', 'barracks.glb', 'barracks_atlas', [base, hall, roof, turret, yard], banners,
                    {'Base': 0.6, 'Hall': 1.1, 'Roof': 0.9, 'Turret': 0.7, 'Yard': 1.0, 'Anim_Banners': 1.0},
                    TEAM_DEFAULT, args, spawn=(0, 0, 4.6), rally=(0, 0, 6.6))


if __name__ == '__main__':
    main()
