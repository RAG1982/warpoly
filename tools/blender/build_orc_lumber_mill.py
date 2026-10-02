"""
build_orc_lumber_mill.py — Serraria Mecânica orc (tipo interno `orc_lumber_mill`) gerada 100% por script.

Uso:
  blender -b --factory-startup --python tools/blender/build_orc_lumber_mill.py -- [--no-render]

Saída (public/models/orc_lumber_mill.glb), coordenadas do jogo, origem no centro da base, frente = +Z:
  OrcLumberMill (raiz)
  ├─ Static_Mesh       plataforma de toras sobre estacas com cantoneiras de ferro, galpão em A de toras partidas
  │                    com telhado de placas de ferro rebitadas e espinhos, cavalete com carro de corte e tronco
  │                    mestre, guindaste de lança com polia e gancho, pirâmide de toras, pilhas de tábuas, cepo
  │                    com machado, serragem e lanternas (Atlas)
  ├─ Anim_SawBlade     serra circular dentada de ferro (raio 1,2; pivô (0; 1,6; 0,4); gira em X no `OrcLumberMill.js`)
  ├─ Anim_Banners      estandartes esfarrapados (material TeamColor)
  ├─ Socket_UnitSpawn  saída (frente do galpão)
  └─ Socket_Rally      ponto de reunião padrão
Pegada ~6,4 x 6,4 (raio de colisão 3,2), altura ~6,2. 3 draw calls (estática + serra + estandartes).
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
from bld_common import beam, tube, log, skull, finish_building  # noqa: E402
import bld_orc as O  # noqa: E402
import build_ogre_den as D  # noqa: E402

TEAM_DEFAULT = '#b81d24'
Y0 = 0.30
SAW_PIVOT = (0.0, 1.6, 0.4)
SAW_R = 1.2

PALETTE = dict(D.PALETTE)
PALETTE.update(O.ORC_EXTRAS)
PALETTE['iron_plate'] = dict(base='#3d434f', var='#2a2e38', var_scale=1.2, var_amt=0.8, fine=0.08, pattern='bricks',
                             mapping='box', pw=0.9, ph=0.6, mortar='#14161b', mortar_size=0.04, brick_tint='#566070',
                             brick_tint_amt=0.5, brick_dark=0.85, brick_lite=1.1, top=0.3, edge='#9aa3b2', edge_amt=0.7,
                             edge_r=0.02, ao=(0.6, 0.55))


def build_base(mats, root):
    mb = MeshBuilder('Base')
    mb.add(prim_box(6.4, Y0, 6.4, taper=(0.975, 0.975), base=True), 'rock', bevel=0.07)
    # plataforma de toras roliças sobre estacas, com cantoneiras de ferro
    for k in range(15):
        z = -2.9 + 0.4 * k
        log(mb, (-3.0, Y0 + 0.14, z), (3.0, Y0 + 0.14, z), 0.18, 'bark', n=7)
    for x in (-2.8, 0.0, 2.8):
        mb.add(prim_box(0.18, 0.1, 6.0), 'iron', M((x, Y0 + 0.34, 0.0)))
    mb.add(prim_box(6.0, 0.06, 6.0, base=True), 'mud', M((0, Y0 + 0.02, 0.0)))
    return mb.build(mats, parent=root)


def build_shed(mats, root, banners):
    mb = MeshBuilder('Shed')
    cz = -1.55
    hz = 1.35
    hx = 2.35
    top = 3.0
    # pórticos em A: dois troncos inclinados por quadro, travessa e cintas de ferro
    for z in (cz - hz, cz - hz / 3, cz + hz / 3, cz + hz):
        for sx in (-1, 1):
            beam(mb, (sx * hx, Y0 + 0.2, z), (sx * 0.15, Y0 + 3.55, z), 0.26, 0.26, 'bark', bevel=0.02)
            mb.add(prim_box(0.34, 0.16, 0.34), 'iron', M((sx * hx, Y0 + 0.3, z)), bevel=0.01)
        beam(mb, (-hx * 0.62, Y0 + 1.4, z), (hx * 0.62, Y0 + 1.4, z), 0.2, 0.2, 'log')
        mb.add(prim_box(0.3, 0.12, 0.3), 'iron', M((0, Y0 + 3.55, z)))
    # cumeeira e terças
    log(mb, (0, Y0 + 3.65, cz - hz - 0.3), (0, Y0 + 3.65, cz + hz + 0.3), 0.17, 'bark', n=7)
    for sx in (-1, 1):
        for t in (0.3, 0.6):
            log(mb, (sx * hx * (1 - t) + sx * 0.15 * t, Y0 + 0.2 + 3.35 * t, cz - hz - 0.3),
                (sx * hx * (1 - t) + sx * 0.15 * t, Y0 + 0.2 + 3.35 * t, cz + hz + 0.3), 0.12, 'log', n=6)
    # parede dos fundos de tábuas e empena
    mb.add(prim_box(2 * hx * 0.85, 2.7, 0.14, taper=(0.55, 1.0), base=True), 'plank', M((0, Y0 + 0.2, cz - hz - 0.1)), bevel=0.01)
    return mb.build(mats, parent=root)


def build_roof(mats, root):
    mb = MeshBuilder('Roof')
    cz, hz, hx = -1.55, 1.35, 2.35
    # duas águas de placas de ferro rebitadas (cada água = prancha inclinada) e espinhos na cumeeira/beiral
    ang = math.degrees(math.atan2(3.35, hx - 0.15))
    L = math.hypot(3.35, hx - 0.15) + 0.6
    zl = 2 * hz + 0.9
    for sx in (-1, 1):
        mid = Vector((sx * (hx + 0.15) / 2 + sx * 0.02, Y0 + 0.2 + 3.35 / 2 + 0.2, cz))
        mb.add(prim_box(L, 0.14, zl), 'iron_plate', M(tuple(mid), (0, 0, -sx * ang)), bevel=0.025)
        for k in range(6):
            z = cz - hz + (2 * hz) * k / 5
            t = 0.85
            p = Vector((sx * (hx * (1 - t) + 0.15 * t), Y0 + 0.2 + 3.35 * t + 0.3, z))
            mb.add(prim_cone(0.07, 0.4, 4), 'iron', M(tuple(p), (0, 0, -sx * 25)))
    for k in range(7):
        z = cz - hz - 0.2 + (2 * hz + 0.4) * k / 6
        mb.add(prim_cone(0.09, 0.5, 4), 'iron', M((0, Y0 + 3.9, z)))
    return mb.build(mats, parent=root)


def build_saw(mats, root):
    """Serra circular dentada (eixo em X, raio 1,2) centrada no pivô; o jogo gira `rotation.x`."""
    mb = MeshBuilder('Anim_SawBlade')
    R = SAW_R
    mb.add(prim_cyl(R, R, 0.08, 20, base=False), 'steel', M(r=(0, 0, 90)), smooth=0)
    mb.add(prim_cyl(R * 0.55, R * 0.55, 0.12, 14, base=False), 'iron', M(r=(0, 0, 90)), smooth=0)
    mb.add(prim_cyl(0.22, 0.22, 0.5, 8, base=False), 'iron', M(r=(0, 0, 90)), smooth=30)
    for k in range(6):
        a = 60 * k
        mb.add(prim_box(0.12, 0.06, R * 0.7), 'iron', M(r=(a, 0, 0)) @ M((0, 0, 0.3)))   # raios do disco
    n = 18
    for k in range(n):
        a = 2 * math.pi * k / n
        y, z = math.cos(a), math.sin(a)
        mb.add(prim_cone(0.09, 0.2, 3), 'steel', M((0.0, y * (R + 0.02), z * (R + 0.02)), (math.degrees(a) - 20, 0, 0)) @ M(r=(0, 0, 0)))
    return mb.build(mats, parent=root, location=SAW_PIVOT)


def build_rig(mats, root, banners):
    mb = MeshBuilder('Rig')
    # quadro de sustentação da serra: dois prumos pesados e travessa superior, mancais de ferro
    sx0, sz0 = 0.0, SAW_PIVOT[2]
    for dx in (-0.55, 0.55):
        mb.add(prim_box(0.24, 2.9, 0.3, base=True), 'bark', M((dx, Y0, sz0 - 0.15)), bevel=0.03)
        mb.add(prim_box(0.3, 0.26, 0.36), 'iron', M((dx, SAW_PIVOT[1], sz0 - 0.15)), bevel=0.01)
    mb.add(prim_box(1.5, 0.22, 0.34), 'bark', M((0, Y0 + 2.95, sz0 - 0.15)), bevel=0.02)
    for dx in (-0.55, 0.55):
        beam(mb, (dx, Y0 + 2.9, sz0 - 0.15), (dx * 2.3, Y0 + 2.4, sz0 - 0.9), 0.14, 0.14, 'log')
    # volante/polia de transmissão com correia (ao lado do quadro)
    mb.add(prim_cyl(0.5, 0.5, 0.08, 12, base=False), 'bark', M((0.95, SAW_PIVOT[1], sz0 - 0.15), (0, 0, 90)), smooth=0)
    for k in range(6):
        mb.add(prim_box(0.06, 1.0, 0.06), 'iron', M((0.95, SAW_PIVOT[1], sz0 - 0.15), (60 * k, 0, 0)))
    # cavalete: trilhos, carro de corte e tronco mestre (eixo X) atravessando a lâmina
    for dz in (-0.45, 0.45):
        mb.add(prim_box(4.6, 0.14, 0.14), 'bark', M((0, Y0 + 0.75, sz0 + dz)), bevel=0.015)
    for x in (-2.0, 2.0):
        for dz in (-0.45, 0.45):
            beam(mb, (x, Y0, sz0 + dz * 1.3), (x, Y0 + 0.8, sz0 + dz), 0.14, 0.14, 'bark')
    log(mb, (-2.2, Y0 + 1.1, sz0), (2.2, Y0 + 1.1, sz0), 0.36, 'bark', n=9)
    for sx in (-1, 1):
        mb.add(prim_cyl(0.36, 0.36, 0.03, 9, base=False), 'log_end', M((sx * 2.21, Y0 + 1.1, sz0), (0, 0, 90)), smooth=0)
    mb.add(prim_box(0.09, 0.78, 0.8), 'sawdust', M((0.0, Y0 + 1.1, sz0)))     # fenda cortada com serragem
    # cavaletes de apoio e prendedores de ferro
    for x in (-1.2, 1.4):
        mb.add(prim_box(0.14, 0.2, 0.9), 'iron', M((x, Y0 + 1.5, sz0)))
    # guindaste de lança (direita): mastro, lança, polia, cabo e gancho
    gx, gz = 2.6, -0.2
    log(mb, (gx, Y0, gz), (gx, Y0 + 4.4, gz), 0.16, 'bark', n=8)
    beam(mb, (gx, Y0 + 4.2, gz), (gx - 2.1, Y0 + 3.7, gz + 0.3), 0.14, 0.14, 'log')
    beam(mb, (gx, Y0 + 1.2, gz), (gx - 0.9, Y0 + 3.95, gz + 0.1), 0.1, 0.1, 'log')
    mb.add(prim_cyl(0.22, 0.22, 0.08, 10, base=False), 'iron', M((gx - 2.1, Y0 + 3.7, gz + 0.3), (0, 0, 90)), smooth=0)
    log(mb, (gx - 2.1, Y0 + 3.55, gz + 0.3), (gx - 2.1, Y0 + 2.2, gz + 0.3), 0.025, 'rope', n=4)
    mb.add(prim_cone(0.14, 0.45, 5), 'iron', M((gx - 2.1, Y0 + 1.75, gz + 0.3), (180, 0, 0)))
    mb.add(prim_sphere(0.3, 0.3, 0.3, 7, 4), 'iron', M((gx, Y0 + 4.5, gz)), smooth=65)
    mb.add(prim_cone(0.1, 0.4, 4), 'iron', M((gx, Y0 + 4.75, gz)))
    return mb.build(mats, parent=root)


def build_yard(mats, root, banners):
    mb = MeshBuilder('Yard')
    # pirâmide de toras (esquerda) com anéis nas pontas
    px, pz = -2.35, 0.9
    for r, n in enumerate((4, 3, 2, 1)):
        for k in range(n):
            x = px + (k - (n - 1) / 2) * 0.42
            y = Y0 + 0.22 + r * 0.35
            log(mb, (x, y, pz - 0.9), (x, y, pz + 0.9), 0.2, 'bark', n=8)
            mb.add(prim_cyl(0.2, 0.2, 0.02, 8, base=False), 'log_end', M((x, y, pz + 0.91), (90, 0, 0)), smooth=0)
    for z in (pz - 0.6, pz + 0.6):
        mb.add(prim_box(1.9, 0.07, 0.07), 'iron', M((px, Y0 + 0.92, z)))
    # tábuas empilhadas (direita-frente) e cepo com machado
    for r in range(4):
        mb.add(prim_box(1.8, 0.12, 0.5), 'plank', M((2.0, Y0 + 0.25 + 0.16 * r, 1.9), (0, 8, 0)), bevel=0.01)
    for dz in (-0.55, 0.55):
        mb.add(prim_box(1.9, 0.12, 0.12, base=True), 'bark', M((2.0, Y0, 1.9 + dz), (0, 8, 0)))
    mb.add(prim_cyl(0.34, 0.4, 0.58, 9, base=True), 'bark', M((-0.9, Y0, 2.6)), smooth=40)
    mb.add(prim_cyl(0.34, 0.34, 0.02, 9), 'log_end', M((-0.9, Y0 + 0.58, 2.6)))
    log(mb, (-0.9, Y0 + 0.62, 2.55), (-1.2, Y0 + 1.0, 2.7), 0.03, 'log_end', n=5)
    mb.add(prim_box(0.3, 0.24, 0.05), 'steel', M((-0.95, Y0 + 0.68, 2.58), (0, 0, -15)), bevel=0.007)
    # serragem, lascas, tina de água, barris, crânios
    mb.add(prim_sphere(1.2, 0.14, 0.9, 9, 3, y_min=0.0), 'sawdust', M((0.0, Y0 + 0.08, 0.4)), smooth=60)
    for k in range(7):
        mb.add(prim_box(0.12, 0.05, 0.2), 'log_end', M((0.4 + 0.3 * math.cos(k * 1.9), Y0 + 0.06, 1.8 + 0.3 * math.sin(k * 1.9)), (0, k * 50, 0)))
    O.barrel_orc(mb, 2.9, Y0, 0.2)
    O.barrel_orc(mb, 2.7, Y0, -0.5, r=0.24, h=0.5)
    skull(mb, M((-2.9, Y0 + 0.1, 2.3), (0, 50, 0)), 0.22, 'bone')
    # lanternas de ferro nas colunas da frente do galpão
    for sx in (-1, 1):
        mb.add(prim_box(0.18, 0.24, 0.18), 'glow', M((sx * 1.5, Y0 + 2.3, 0.0)), bevel=0.01)
        mb.add(prim_box(0.05, 0.4, 0.05), 'iron', M((sx * 1.5, Y0 + 2.6, 0.0)))
    for sx in (-1, 1):
        O.banner_pole(mb, sx * 3.1, Y0, 3.0, 4.0, banners, ry=sx * 10, w=0.8, bh=1.15)
    return mb.build(mats, parent=root)


def build_banners(mats, root, mb):
    return mb.build(mats, parent=root)


def main():
    args = C.script_args()
    C.reset_scene()
    mats = C.make_paint_set(PALETTE)
    root = C.make_empty('OrcLumberMill')
    bmb = MeshBuilder('Anim_Banners')
    base = build_base(mats, root)
    shed = build_shed(mats, root, bmb)
    roof = build_roof(mats, root)
    rig = build_rig(mats, root, bmb)
    yard = build_yard(mats, root, bmb)
    saw = build_saw(mats, root)
    banners = build_banners(mats, root, bmb)
    finish_building(root, 'orc_lumber_mill', 'orc_lumber_mill.glb', 'orc_lumber_mill_atlas', [base, shed, roof, rig, yard], banners,
                    {'Base': 0.6, 'Shed': 0.9, 'Roof': 0.8, 'Rig': 1.2, 'Yard': 1.0, 'Anim_SawBlade': 1.0, 'Anim_Banners': 0.8},
                    TEAM_DEFAULT, args, spawn=(0, 0, 4.2), rally=(0, 0, 6.2), extra_anim=[saw])


if __name__ == '__main__':
    main()
