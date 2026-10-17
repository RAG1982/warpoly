"""
build_orc_barracks.py — Quartel dos Clãs (tipo interno `orc_barracks`) gerado 100% por script.

Uso:
  blender -b --factory-startup --python tools/blender/build_orc_barracks.py -- [--no-render]

Saída (public/models/orc_barracks.glb), coordenadas do jogo, origem no centro da base, frente = +Z:
  OrcBarracks (raiz)
  ├─ Static_Mesh       arena de treino cercada por paliçada de toras pontiagudas com travessas de ferro, quatro
  │                    plataformas de guarda nos cantos, portão de presas com crânio, racks de armas, pedra de
  │                    afiar com pedal, cepo com cutelo, braseiro, forca do boneco e salão de toras ao fundo
  │                    com telhado de peles sobre costelas (Atlas)
  ├─ Anim_TrainingDummy boneco de treino suspenso (pivô (2,8; 3,8; 1,4); o `OrcBarracks.js` o balança em z/x)
  ├─ Anim_Banners      estandartes esfarrapados (material TeamColor)
  ├─ Socket_UnitSpawn  saída (portão)
  └─ Socket_Rally      ponto de reunião padrão
Pegada ~7,3 x 7,3 (raio de colisão 3,6), altura ~6,8. 3 draw calls.
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
from bld_common import beam, tube, log, skull, finish_building, squash_xz  # noqa: E402
import bld_orc as O  # noqa: E402
import build_ogre_den as D  # noqa: E402

TEAM_DEFAULT = '#b81d24'
Y0 = 0.30
DUMMY_PIVOT = (2.8, 3.8, 1.4)
FOOT = 0.88         # fator de encolhimento da pegada
PAL = 3.2           # meia-largura da paliçada

PALETTE = dict(D.PALETTE)
PALETTE.update(O.ORC_EXTRAS)


def build_base(mats, root):
    mb = MeshBuilder('Base')
    mb.add(prim_box(7.3, Y0, 7.3, taper=(0.975, 0.975), base=True), 'rock', bevel=0.07)
    mb.add(prim_box(6.9, 0.05, 6.9, base=True), 'mud', M((0, Y0, 0)))
    # círculo de areia batida no centro (arena)
    mb.add(prim_cyl(2.4, 2.4, 0.04, 16, base=True), 'dirt', M((0, Y0 + 0.04, 0.3)), smooth=0)
    return mb.build(mats, parent=root)


def build_walls(mats, root):
    mb = MeshBuilder('Walls')
    jit = [0.0, 0.3, 0.1, 0.45, 0.2, 0.38, 0.05]
    h = 2.5
    # paliçada: fundo, laterais e frente com portão central
    O.spiked_logs(mb, (-PAL, -PAL), (PAL, -PAL), 15, h, jit, Y0, r=0.22, tip=0.5)
    O.spiked_logs(mb, (-PAL, -PAL), (-PAL, PAL), 14, h, jit[2:] + jit[:2], Y0, r=0.22, tip=0.5)
    O.spiked_logs(mb, (PAL, -PAL), (PAL, PAL), 14, h, jit[4:] + jit[:4], Y0, r=0.22, tip=0.5)
    O.spiked_logs(mb, (-PAL, PAL), (-1.0, PAL), 6, h, jit[1:] + jit[:1], Y0, r=0.22, tip=0.5)
    O.spiked_logs(mb, (1.0, PAL), (PAL, PAL), 6, h, jit[3:] + jit[:3], Y0, r=0.22, tip=0.5)
    for y in (Y0 + 0.75, Y0 + 1.7):
        mb.add(prim_box(2 * PAL + 0.5, 0.08, 0.1), 'iron', M((0, y, -PAL - 0.2)))
        for sx in (-1, 1):
            mb.add(prim_box(0.1, 0.08, 2 * PAL + 0.4), 'iron', M((sx * (PAL + 0.2), y, 0.0)))
    # portão de presas: dois mourões, duas presas curvas cruzadas e crânio de ogro no topo
    for sx in (-1, 1):
        x = sx * 1.1
        mb.add(prim_box(0.34, 3.0, 0.34, base=True), 'bark', M((x, Y0, PAL)), bevel=0.03)
        mb.add(prim_cone(0.2, 0.5, 5), 'iron', M((x, Y0 + 3.0, PAL)))
        O.tusk(mb, (x, Y0 + 0.2, PAL + 0.05), (-sx * 0.1, Y0 + 3.1, PAL + 0.05), (sx * 0.9, 0.8, 0.3), r0=0.17)
    skull(mb, M((0, Y0 + 3.45, PAL + 0.1), (0, 0, 0)), 0.55, 'bone')
    # plataformas de guarda nos quatro cantos: 4 estacas altas, piso de toras, parapeito e espinhos
    for sx in (-1, 1):
        for sz in (-1, 1):
            cx, cz = sx * (PAL + 0.15), sz * (PAL + 0.15)
            for dx in (-0.35, 0.35):
                for dz in (-0.35, 0.35):
                    log(mb, (cx + dx, Y0, cz + dz), (cx + dx, Y0 + 3.4, cz + dz), 0.14, 'bark', n=6, tip=0.0)
            mb.add(prim_box(1.1, 0.16, 1.1), 'bark', M((cx, Y0 + 2.6, cz)), bevel=0.02)
            for k in range(4):
                a = 90 * k
                x, z = O.polar(0.52, a)
                mb.add(prim_box(0.9, 0.4, 0.08, base=True), 'log', M((cx + x, Y0 + 2.7, cz + z), (0, a, 0)), bevel=0.01)
                mb.add(prim_cone(0.07, 0.5, 4), 'iron', M((cx + x * 1.1, Y0 + 3.1, cz + z * 1.1), (0, 0, 0)))
            mb.add(prim_cone(0.1, 0.55, 4), 'iron', M((cx + sx * 0.5, Y0 + 3.4, cz + sz * 0.5), (0, 0, -sx * 28)))
    return mb.build(mats, parent=root)


def build_hall(mats, root, banners):
    """Salão de toras dos fundos (galpão do mestre de armas) com telhado de peles."""
    mb = MeshBuilder('Hall')
    cx, cz, hx, hz = 0.0, -2.05, 2.2, 0.85
    wt = Y0 + 2.2
    O.log_wall(mb, (cx - hx, cz - hz), (cx + hx, cz - hz), Y0, 2.1, r=0.2)
    O.log_wall(mb, (cx - hx, cz - hz), (cx - hx, cz + hz), Y0, 2.1, r=0.2)
    O.log_wall(mb, (cx + hx, cz - hz), (cx + hx, cz + hz), Y0, 2.1, r=0.2)
    O.log_wall(mb, (cx - hx, cz + hz), (cx - 0.6, cz + hz), Y0, 2.1, r=0.2)
    O.log_wall(mb, (cx + 0.6, cz + hz), (cx + hx, cz + hz), Y0, 2.1, r=0.2)
    # porta aberta (frente) com batente de osso e interior escuro
    mb.add(prim_box(1.1, 1.8, 0.1, base=True), 'dark', M((0, Y0, cz + hz - 0.12)))
    mb.add(prim_box(1.3, 0.14, 0.34), 'bone', M((0, Y0 + 1.85, cz + hz)), bevel=0.02)
    for sx in (-1, 1):
        mb.add(prim_box(0.14, 1.9, 0.34, base=True), 'bone', M((sx * 0.64, Y0, cz + hz)), bevel=0.02)
        mb.add(prim_box(0.1, 0.5, 0.06), 'window', M((sx * 1.55, Y0 + 1.3, cz + hz + 0.1)))
    O.hide_roof(mb, cx, cz, hx, hz, wt, 1.15, hide='hide', ridge='log', rib='bone', ov=0.55, ov_z=0.45)
    gable = [(-hx, 0.0), (hx, 0.0), (0.0, 1.15)]
    mb.add(prim_extrude(gable, 0.2, axis='z'), 'bark', M((cx, wt, cz + hz - 0.1)))
    mb.add(prim_extrude(gable, 0.2, axis='z'), 'bark', M((cx, wt, cz - hz + 0.1)))
    # chifres de osso na cumeeira
    O.horn_crest(mb, -1.7, 1.7, wt + 1.3, cz, n=5, h=0.7)
    # crânio de ogro sobre a porta
    skull(mb, M((0, wt + 0.55, cz + hz + 0.2)), 0.5, 'bone')
    return mb.build(mats, parent=root)


def build_yard(mats, root, banners):
    mb = MeshBuilder('Yard')
    # racks de armas (esquerda): quadro com lanças, alabardas e machados duplos
    rx, rz = -2.4, 0.8
    for dz in (-0.9, 0.9):
        mb.add(prim_box(0.18, 1.5, 0.18, base=True), 'bark', M((rx, Y0, rz + dz)), bevel=0.02)
    mb.add(prim_box(0.14, 0.14, 2.1), 'bark', M((rx, Y0 + 1.4, rz)))
    mb.add(prim_box(0.14, 0.14, 2.1), 'bark', M((rx, Y0 + 0.5, rz)))
    for k in range(6):
        z = rz - 0.8 + 0.32 * k
        log(mb, (rx + 0.05, Y0 + 0.3, z), (rx - 0.05, Y0 + 2.4, z), 0.03, 'wood_light', n=5)
        if k % 2 == 0:
            mb.add(prim_cone(0.06, 0.32, 4), 'steel', M((rx - 0.05, Y0 + 2.4, z)))
        else:
            mb.add(prim_box(0.5, 0.3, 0.04, taper=(0.5, 1.0)), 'steel', M((rx - 0.05, Y0 + 2.3, z), (0, 90, 0)), bevel=0.006)
    # pedra de afiar com pedal (direita-frente)
    gx, gz = 2.2, 2.0
    mb.add(prim_cyl(0.5, 0.5, 0.2, 14, base=False), 'rock_plain', M((gx, Y0 + 0.9, gz), (0, 0, 90)), smooth=0)
    for dz in (-0.35, 0.35):
        beam(mb, (gx - 0.3, Y0, gz + dz * 1.4), (gx - 0.1, Y0 + 0.9, gz + dz), 0.12, 0.12, 'bark')
        beam(mb, (gx + 0.3, Y0, gz + dz * 1.4), (gx + 0.1, Y0 + 0.9, gz + dz), 0.12, 0.12, 'bark')
    mb.add(prim_box(0.5, 0.06, 0.5), 'iron', M((gx, Y0 + 0.2, gz - 0.7), (0, 0, 8)))
    # cepo de treino com cutelo cravado
    mb.add(prim_cyl(0.36, 0.42, 0.65, 9, base=True), 'bark', M((-1.2, Y0, 2.0)), smooth=40)
    mb.add(prim_cyl(0.36, 0.36, 0.02, 9), 'log_end', M((-1.2, Y0 + 0.65, 2.0)))
    mb.add(prim_box(0.36, 0.5, 0.05, taper=(0.9, 1.0)), 'steel', M((-1.2, Y0 + 0.95, 2.0), (0, 20, 12)), bevel=0.007)
    log(mb, (-1.2, Y0 + 0.65, 2.0), (-1.2, Y0 + 1.0, 2.0), 0.035, 'log', n=5)
    # braseiro de ferro e barris
    O.brazier(mb, -2.65, Y0, -0.7, 1.0)
    O.barrel_orc(mb, 2.75, Y0, -0.9)
    O.barrel_orc(mb, 2.5, Y0, -1.4, r=0.24, h=0.5)
    # forca do boneco: poste + braço, com pivô em DUMMY_PIVOT
    log(mb, (3.2, Y0, DUMMY_PIVOT[2]), (3.2, DUMMY_PIVOT[1] + 0.55, DUMMY_PIVOT[2]), 0.14, 'bark', n=7)
    beam(mb, (3.2, DUMMY_PIVOT[1] + 0.4, DUMMY_PIVOT[2]), (1.9, DUMMY_PIVOT[1] + 0.3, DUMMY_PIVOT[2]), 0.14, 0.14, 'bark')
    beam(mb, (3.2, DUMMY_PIVOT[1] - 0.3, DUMMY_PIVOT[2]), (2.7, DUMMY_PIVOT[1] + 0.3, DUMMY_PIVOT[2]), 0.1, 0.1, 'bark')
    mb.add(prim_cone(0.12, 0.35, 5), 'iron', M((3.2, DUMMY_PIVOT[1] + 0.55, DUMMY_PIVOT[2])))
    mb.add(prim_cyl(0.1, 0.1, 0.16, 8, base=False), 'iron', M(DUMMY_PIVOT, (90, 0, 0)))
    # mastros de estandarte (frente-esquerda e direita-fundo)
    O.banner_pole(mb, -3.0, Y0, 3.0, 4.6, banners, ry=-10, w=0.85, bh=1.3)
    O.banner_pole(mb, 3.0, Y0, 3.0, 4.6, banners, ry=10, w=0.85, bh=1.3)
    # armas espalhadas e crânios
    skull(mb, M((-1.9, Y0 + 0.1, 2.6), (0, 30, 0)), 0.25, 'bone')
    mb.add(prim_box(0.8, 0.07, 0.07), 'wood_light', M((1.0, Y0 + 0.05, 2.5), (0, 35, 0)))
    mb.add(prim_box(0.3, 0.2, 0.05), 'steel', M((1.3, Y0 + 0.08, 2.35), (0, 35, 0)), bevel=0.005)
    return mb.build(mats, parent=root)


def build_dummy(mats, root):
    """Boneco de treino pendurado: corda, corpo de estopa, braços de madeira e elmo (pivô na forca)."""
    mb = MeshBuilder('Anim_TrainingDummy')
    log(mb, (0, 0, 0), (0, -1.0, 0), 0.03, 'rope', n=4)
    mb.add(prim_cyl(0.3, 0.25, 0.85, 8, base=False), 'straw', M((0, -1.45, 0)), smooth=60)
    mb.add(prim_box(1.0, 0.11, 0.11), 'bark', M((0, -1.2, 0)), bevel=0.01)
    mb.add(prim_box(0.46, 0.07, 0.3), 'leather', M((0, -1.62, 0)))
    mb.add(prim_sphere(0.16, 0.17, 0.16, 7, 4), 'straw', M((0, -0.98, 0)), smooth=70)
    mb.add(prim_cone(0.24, 0.32, 5), 'steel', M((0, -0.96, 0)), smooth=0)
    for sx in (-1, 1):
        mb.add(prim_cone(0.05, 0.3, 4), 'bone', M((sx * 0.2, -0.92, 0), (0, 0, -sx * 55)))
    mb.add(prim_box(0.5, 0.45, 0.04), 'iron', M((0, -1.35, 0.27)), bevel=0.005)    # chapa de peito amassada
    return mb.build(mats, parent=root, location=DUMMY_PIVOT)


def build_banners(mats, root, mb):
    # faixas penduradas no portão
    O.tattered_banner(mb, -0.75, Y0 + 2.7, PAL + 0.38, 0, 0.45, 1.1)
    O.tattered_banner(mb, 0.75, Y0 + 2.7, PAL + 0.38, 0, 0.45, 1.1)
    return mb.build(mats, parent=root)


def main():
    args = C.script_args()
    C.reset_scene()
    mats = C.make_paint_set(PALETTE)
    root = C.make_empty('OrcBarracks')
    bmb = MeshBuilder('Anim_Banners')
    base = build_base(mats, root)
    walls = build_walls(mats, root)
    hall = build_hall(mats, root, bmb)
    yard = build_yard(mats, root, bmb)
    dummy = build_dummy(mats, root)
    banners = build_banners(mats, root, bmb)
    squash_xz([base, walls, hall, yard, dummy, banners], FOOT)   # pegada 8,2 -> ~7,2 (raio de colisão 3,6)
    finish_building(root, 'orc_barracks', 'orc_barracks.glb', 'orc_barracks_atlas', [base, walls, hall, yard], banners,
                    {'Base': 0.6, 'Walls': 1.0, 'Hall': 1.0, 'Yard': 1.1, 'Anim_TrainingDummy': 0.7, 'Anim_Banners': 0.8},
                    TEAM_DEFAULT, args, spawn=(0, 0, 4.6), rally=(0, 0, 6.6), extra_anim=[dummy])


if __name__ == '__main__':
    main()
