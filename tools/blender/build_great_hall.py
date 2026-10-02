"""
build_great_hall.py — Grande Salão Orc (tipo interno `great_hall`, QG da Horda) gerado 100% por script.

Uso:
  blender -b --factory-startup --python tools/blender/build_great_hall.py -- [--no-render]

Saída (public/models/great_hall.glb), coordenadas do jogo, origem no centro da base, frente = +Z:
  GreatHall (raiz)
  ├─ Static_Mesh       salão monumental de toras sobre pé de basalto, telhado em dois níveis de placas de ferro
  │                    rebitadas com espinhos e crista de chifres de osso, janelas âmbar com grade, chaminé de
  │                    basalto (topo em (−2,4; 9,8; −2,0), onde o `GreatHall.js` solta fumaça), pátio de
  │                    paliçada com quatro bastiões de canto, portão de presas gigantes com crânio de ogro,
  │                    braseiro em (2,4; ~3; 3,6), racks de armas, barricadas de estacas e ossadas (Atlas)
  ├─ Anim_WarBanner_*  4 estandartes de guerra em cor de time, cada um um nó com pivô no mastro (o
  │                    `GreatHall.js` balança o `rotation.y` de todo nó com "Banner" no nome)
  ├─ Socket_UnitSpawn  saída (frente do portão)
  └─ Socket_Rally      ponto de reunião padrão
Pegada ~11 x 11 (raio de colisão 5,5), altura ~10,6. 6 draw calls.
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
Y0 = 0.40
PAL = 5.2                       # meia-largura da paliçada
HX, HZ, CZ = 3.5, 2.7, -1.9     # salão
FT = Y0 + 0.9                   # topo do pé de basalto
WT = FT + 3.0                   # topo das paredes
BANNERS = [(-2.2, 3.2), (2.2, 3.2), (-4.4, 3.9), (4.4, 3.9)]   # (x, z) dos mastros; pivô em y = 6,6
POLE_H = 3.4

PALETTE = dict(D.PALETTE)
PALETTE.update(O.ORC_EXTRAS)
PALETTE['soot'] = dict(D.ROCK, base='#33302d', var='#201e1c', pattern='bricks', pw=1.1, ph=0.55, brick_tint='#44403c')
PALETTE['iron_plate'] = dict(base='#3d434f', var='#2a2e38', var_scale=1.2, var_amt=0.8, fine=0.08, pattern='bricks',
                             mapping='box', pw=0.9, ph=0.6, mortar='#14161b', mortar_size=0.04, brick_tint='#566070',
                             brick_tint_amt=0.5, brick_dark=0.85, brick_lite=1.1, top=0.3, edge='#9aa3b2', edge_amt=0.7,
                             edge_r=0.02, ao=(0.6, 0.55))


def build_base(mats, root):
    mb = MeshBuilder('Base')
    mb.add(prim_box(11.2, Y0, 11.2, taper=(0.98, 0.98), base=True), 'rock', bevel=0.09)
    mb.add(prim_box(10.8, 0.06, 10.8, base=True), 'mud', M((0, Y0, 0)))
    # rochas nos cantos
    for (x, z, s, r) in ((-5.0, -5.0, 0.7, 20), (5.0, -5.0, 0.8, -10), (-5.2, 5.0, 0.6, 40), (5.2, 4.9, 0.7, 5)):
        mb.add(prim_sphere(s, s * 0.7, s * 0.9, 7, 4, y_min=-0.2), 'rock_plain', M((x, Y0, z), (0, r, 0)), smooth=0)
    # trilha de pedra do portão ao salão
    for k in range(5):
        mb.add(prim_box(1.5 - 0.07 * k, 0.06, 0.8, base=True), 'rock', M((0.12 * (k % 2), Y0 + 0.06, 5.0 - 1.1 * k)), bevel=0.02)
    return mb.build(mats, parent=root)


def build_hall(mats, root):
    mb = MeshBuilder('Hall')
    # pé de basalto + parede de toras horizontais
    mb.add(prim_box(2 * HX + 0.5, FT - Y0, 2 * HZ + 0.5, taper=(0.985, 0.985), base=True), 'rock', M((0, Y0, CZ)), bevel=0.06)
    O.log_wall(mb, (-HX, CZ - HZ), (HX, CZ - HZ), FT, WT - FT, r=0.24)
    O.log_wall(mb, (-HX, CZ - HZ), (-HX, CZ + HZ), FT, WT - FT, r=0.24)
    O.log_wall(mb, (HX, CZ - HZ), (HX, CZ + HZ), FT, WT - FT, r=0.24)
    O.log_wall(mb, (-HX, CZ + HZ), (-0.95, CZ + HZ), FT, WT - FT, r=0.24)
    O.log_wall(mb, (0.95, CZ + HZ), (HX, CZ + HZ), FT, WT - FT, r=0.24)
    # prumos de canto e cintas de ferro
    for sx in (-1, 1):
        for sz in (-1, 1):
            mb.add(prim_box(0.5, WT - Y0 + 0.2, 0.5, base=True), 'bark', M((sx * (HX + 0.08), Y0, CZ + sz * (HZ + 0.08))), bevel=0.04)
            mb.add(prim_cone(0.26, 0.6, 5), 'iron', M((sx * (HX + 0.08), WT + 0.2, CZ + sz * (HZ + 0.08))))
    for y in (FT + 1.0, FT + 2.2):
        mb.add(prim_box(2 * HX + 0.6, 0.12, 0.14), 'iron', M((0, y, CZ - HZ - 0.2)))
        for sx in (-1, 1):
            mb.add(prim_box(0.14, 0.12, 2 * HZ + 0.4), 'iron', M((sx * (HX + 0.2), y, CZ)))
    # portão cerimonial do salão (frente): moldura de osso, porta de tábuas entreaberta, interior escuro
    zf = CZ + HZ
    mb.add(prim_box(1.7, 2.7, 0.2, base=True), 'dark', M((0, FT, zf - 0.1)))
    mb.add(prim_box(2.2, 0.28, 0.5), 'bone', M((0, FT + 2.8, zf)), bevel=0.03)
    for sx in (-1, 1):
        mb.add(prim_box(0.24, 2.9, 0.5, base=True), 'bone', M((sx * 1.0, FT, zf)), bevel=0.03)
        mb.add(prim_box(0.8, 2.5, 0.12, base=True), 'plank', M((sx * 1.35, FT, zf + 0.15), (0, -sx * 55, 0)), bevel=0.015)
    skull(mb, M((0, FT + 3.45, zf + 0.25)), 0.9, 'bone')
    # janelas âmbar com grade e batente de osso
    for x in (-2.6, -1.7, 1.7, 2.6):
        T = M((x, FT + 1.8, zf + 0.02))
        mb.add(prim_box(0.6, 0.8, 0.08), 'window', T)
        mb.add(prim_box(0.76, 0.1, 0.16), 'bone', T @ M((0, 0.45, 0.04)))
        mb.add(prim_box(0.76, 0.1, 0.16), 'bone', T @ M((0, -0.45, 0.04)))
        for dx in (-0.15, 0.15):
            mb.add(prim_box(0.04, 0.8, 0.05), 'iron', T @ M((dx, 0, 0.07)))
    for sx in (-1, 1):
        for dz in (-1.2, 0.9):
            T = M((sx * (HX + 0.02), FT + 1.8, CZ + dz), (0, 90 * sx, 0))
            mb.add(prim_box(0.6, 0.8, 0.08), 'window', T)
            mb.add(prim_box(0.76, 0.1, 0.16), 'bone', T @ M((0, 0.45, 0.04)))
            mb.add(prim_box(0.76, 0.1, 0.16), 'bone', T @ M((0, -0.45, 0.04)))
    # chaminé de basalto: topo em (−2,4; 9,8; −2,0) com coifa de ferro
    chx, chz = -2.4, -2.0
    mb.add(prim_box(1.5, 3.2, 1.5, taper=(0.82, 0.82), base=True), 'soot', M((chx, WT - 0.4, chz)), bevel=0.05)
    mb.add(prim_box(1.15, 3.1, 1.15, taper=(0.85, 0.85), base=True), 'soot', M((chx, WT + 2.8, chz)), bevel=0.05)
    mb.add(prim_box(1.3, 0.14, 1.3), 'iron', M((chx, WT + 3.6, chz)), bevel=0.01)
    mb.add(prim_box(1.15, 0.14, 1.15), 'iron', M((chx, 9.5, chz)), bevel=0.01)
    mb.add(prim_cone(0.85, 0.55, 4, base=True, phase=math.pi / 4), 'iron', M((chx, 9.5, chz)), smooth=0)
    return mb.build(mats, parent=root)


def build_roof(mats, root):
    mb = MeshBuilder('Roof')
    # nível 1: telhado largo de placas de ferro com espinhos; nível 2: sobrelevação central
    def plates(cx, cz, hx, hz, y_wall, rise, ov, ov_z, thick=0.18):
        run = hx + ov
        r = rise * run / hx
        zl = 2 * hz + 2 * ov_z
        ang = math.degrees(math.atan2(r, run))
        L = math.hypot(run, r)
        ridge_y = y_wall - ov * rise / hx + r
        for sx in (-1, 1):
            mid = Vector((cx + sx * run / 2, ridge_y - r / 2, cz))
            n = Vector((sx * math.sin(math.radians(ang)), math.cos(math.radians(ang)), 0)) * (thick / 2)
            mb.add(prim_box(L, thick, zl), 'iron_plate', M(tuple(mid + n), (0, 0, -sx * ang)), bevel=0.03)
            for k in range(7):
                z = cz - hz + (2 * hz) * k / 6
                t = 0.15
                p = Vector((cx + sx * (hx * (1 - t) + 0.2 * t) + sx * ov * 0.6, y_wall + rise * t, z))
                mb.add(prim_cone(0.08, 0.45, 4), 'iron', M(tuple(p), (0, 0, -sx * 40)))
        log(mb, (cx, ridge_y + 0.05, cz - hz - ov_z), (cx, ridge_y + 0.05, cz + hz + ov_z), 0.2, 'bark', n=7)
        return ridge_y
    r1 = plates(0.0, CZ, HX, HZ, WT, 1.8, 0.75, 0.7)
    # empenas de tábuas (frente e fundo) sob o telhado
    gable = [(-HX, 0.0), (HX, 0.0), (0.0, 1.8)]
    for sz in (-1, 1):
        mb.add(prim_extrude(gable, 0.25, axis='z'), 'plank', M((0, WT, CZ + sz * (HZ - 0.12))), bevel=0.01)
    # lanternim (nível superior) com janelas âmbar
    cz2 = CZ - 0.2
    mb.add(prim_box(2.4, 0.9, 3.2, base=True), 'bark', M((0, r1 - 0.5, cz2)), bevel=0.03)
    for sx in (-1, 1):
        mb.add(prim_box(0.06, 0.45, 2.4), 'window', M((sx * 1.22, r1 + 0.15, cz2)))
    r2 = plates(0.0, cz2, 1.2, 1.6, r1 + 0.4, 0.95, 0.45, 0.4, thick=0.14)
    # crista de chifres de osso ao longo da cumeeira e chifres nas pontas
    O.horn_crest(mb, -1.4, 1.4, r2 + 0.15, cz2 - 1.6, n=1, h=0.9)
    for k in range(7):
        z = cz2 - 1.6 + 3.2 * k / 6
        mb.add(prim_cone(0.11, 0.8 + 0.1 * (k % 2), 5), 'bone', M((0, r2 + 0.15, z), (0, 0, 0)), smooth=40)
    for sx in (-1, 1):
        O.tusk(mb, (sx * 0.3, r1 + 0.1, CZ + HZ + 0.7), (sx * 0.5, r1 + 1.1, CZ + HZ + 1.2), (sx * 0.1, 0.5, 0.2), r0=0.12)
    return mb.build(mats, parent=root)


def build_courtyard(mats, root):
    mb = MeshBuilder('Courtyard')
    jit = [0.0, 0.3, 0.12, 0.45, 0.2, 0.38, 0.05]
    h = 2.7
    O.spiked_logs(mb, (-PAL, -PAL), (PAL, -PAL), 22, h, jit, Y0, r=0.24, tip=0.55)
    O.spiked_logs(mb, (-PAL, -PAL), (-PAL, PAL), 22, h, jit[2:] + jit[:2], Y0, r=0.24, tip=0.55)
    O.spiked_logs(mb, (PAL, -PAL), (PAL, PAL), 22, h, jit[4:] + jit[:4], Y0, r=0.24, tip=0.55)
    O.spiked_logs(mb, (-PAL, PAL), (-1.4, PAL), 8, h, jit[1:] + jit[:1], Y0, r=0.24, tip=0.55)
    O.spiked_logs(mb, (1.4, PAL), (PAL, PAL), 8, h, jit[3:] + jit[:3], Y0, r=0.24, tip=0.55)
    for y in (Y0 + 0.8, Y0 + 1.8):
        mb.add(prim_box(2 * PAL + 0.5, 0.09, 0.11), 'iron', M((0, y, -PAL - 0.22)))
        for sx in (-1, 1):
            mb.add(prim_box(0.11, 0.09, 2 * PAL + 0.4), 'iron', M((sx * (PAL + 0.22), y, 0)))
    # bastiões de canto: torre redonda de toras, plataforma, espinhos para fora
    for sx in (-1, 1):
        for sz in (-1, 1):
            cx, cz = sx * PAL, sz * PAL
            n = 9
            for k in range(n):
                a = 2 * math.pi * k / n
                x, z = cx + math.cos(a) * 0.75, cz + math.sin(a) * 0.75
                log(mb, (x, Y0, z), (x, Y0 + 3.6 + 0.2 * (k % 2), z), 0.2, 'bark', n=6, tip=0.0)
            mb.add(prim_cyl(0.98, 0.98, 0.18, 10), 'bark', M((cx, Y0 + 3.0, cz)), smooth=0)
            mb.add(prim_cyl(0.78, 0.78, 3.0, 10, base=True), 'dark', M((cx, Y0, cz)), smooth=0)
            for k in range(8):
                a = 360 * k / 8
                x, z = O.polar(0.9, a)
                mb.add(prim_cone(0.08, 0.7, 4), 'iron', M((cx + x, Y0 + 3.7, cz + z), (0, 0, 0)))
                mb.add(prim_cone(0.07, 0.6, 4), 'iron', M((cx + x * 1.05, Y0 + 2.4, cz + z * 1.05), (math.cos(math.radians(a)) * -70, 0, math.sin(math.radians(a)) * 70)))
            mb.add(prim_cone(0.9, 0.9, 10, base=True), 'hide', M((cx, Y0 + 3.7, cz)), smooth=30)
            skull(mb, M((cx + sx * 0.0, Y0 + 4.8, cz)), 0.35, 'bone')
    # portão de presas gigantes: mourões, presas curvas cruzadas e crânio de ogro chifrudo
    for sx in (-1, 1):
        x = sx * 1.6
        mb.add(prim_box(0.5, 4.0, 0.5, base=True), 'bark', M((x, Y0, PAL)), bevel=0.04)
        mb.add(prim_cone(0.3, 0.7, 5), 'iron', M((x, Y0 + 4.0, PAL)))
        O.tusk(mb, (x, Y0 + 0.3, PAL + 0.05), (-sx * 0.15, Y0 + 4.4, PAL + 0.05), (sx * 1.4, 1.0, 0.4), r0=0.26)
    skull(mb, M((0, Y0 + 4.9, PAL + 0.15)), 0.9, 'bone')
    # lanterna de ferro pendurada sob o crânio (luz âmbar)
    mb.add(prim_box(0.3, 0.4, 0.3), 'window', M((0, Y0 + 3.4, PAL + 0.1)), bevel=0.02)
    mb.add(prim_box(0.06, 1.0, 0.06), 'iron', M((0, Y0 + 3.95, PAL + 0.1)))
    return mb.build(mats, parent=root)


def build_props(mats, root):
    mb = MeshBuilder('Props')
    # braseiro ardente em (2,4; ~2,4; 3,6) — a luz dinâmica do jogo fica em y = 3,2
    O.brazier(mb, 2.4, Y0, 3.6, 1.35)
    O.brazier(mb, -2.4, Y0, 3.6, 1.1)
    # racks de armas encostados na paliçada esquerda e direita
    for sx in (-1, 1):
        x, z = sx * 4.5, 0.6
        for dz in (-1.1, 1.1):
            mb.add(prim_box(0.2, 1.7, 0.2, base=True), 'bark', M((x, Y0, z + dz)), bevel=0.02)
        mb.add(prim_box(0.16, 0.16, 2.4), 'bark', M((x, Y0 + 1.5, z)))
        mb.add(prim_box(0.16, 0.16, 2.4), 'bark', M((x, Y0 + 0.6, z)))
        for k in range(7):
            zz = z - 1.0 + 0.33 * k
            log(mb, (x + sx * 0.05, Y0 + 0.4, zz), (x + sx * 0.12, Y0 + 2.7, zz), 0.035, 'wood_light', n=5)
            if k % 2:
                mb.add(prim_box(0.55, 0.34, 0.05, taper=(0.5, 1.0)), 'steel', M((x + sx * 0.12, Y0 + 2.6, zz), (0, 90, 0)), bevel=0.006)
            else:
                mb.add(prim_cone(0.07, 0.35, 4), 'steel', M((x + sx * 0.12, Y0 + 2.7, zz)))
    # barricadas de estacas cruzadas (frente, dos dois lados do caminho)
    for sx in (-1, 1):
        for k in range(3):
            x = sx * (2.2 + 0.9 * k)
            for dz in (-0.2, 0.2):
                beam(mb, (x - 0.35, Y0, 4.2 + dz), (x + 0.35, Y0 + 1.0, 4.2 + dz), 0.1, 0.1, 'bark')
                beam(mb, (x + 0.35, Y0, 4.2 + dz), (x - 0.35, Y0 + 1.0, 4.2 + dz), 0.1, 0.1, 'bark')
            mb.add(prim_cone(0.08, 0.4, 4), 'iron', M((x, Y0 + 1.1, 4.2)))
    # barris, ossadas, crânios e lenha
    O.barrel_orc(mb, 3.3, Y0, -4.4)
    O.barrel_orc(mb, 3.9, Y0, -4.3, r=0.25, h=0.5)
    for k in range(4):
        mb.add(prim_sphere(0.14, 0.07, 0.1, 6, 3), 'bone', M((-3.6 + 0.3 * k, Y0 + 0.04, 3.3 + 0.12 * math.sin(k * 2.0)), (0, k * 40, 0)), smooth=60)
    skull(mb, M((-3.4, Y0 + 0.12, 3.6), (0, 25, 0)), 0.3, 'bone')
    for r in range(3):
        for k in range(4 - r):
            log(mb, (-4.6 + 0.0, Y0 + 0.12 + 0.2 * r, -3.0 + 0.23 * k + 0.11 * r), (-3.9, Y0 + 0.12 + 0.2 * r, -3.0 + 0.23 * k + 0.11 * r), 0.1, 'bark', n=6)
    # postes dos estandartes de guerra (os panos são nós `Anim_WarBanner_*`)
    for (x, z) in BANNERS:
        log(mb, (x, Y0, z), (x, Y0 + POLE_H + 3.0, z), 0.085, 'bark', n=6)
        mb.add(prim_cone(0.14, 0.5, 5), 'iron', M((x, Y0 + POLE_H + 3.0, z)))
        mb.add(prim_box(1.1, 0.07, 0.07), 'bone', M((x, Y0 + POLE_H + 2.75, z)))
    return mb.build(mats, parent=root)


def build_banner_nodes(mats, root):
    out = []
    top = Y0 + POLE_H + 2.75
    for i, (x, z) in enumerate(BANNERS):
        mb = MeshBuilder(f'Anim_WarBanner_{i}')
        w, h = 1.0, 1.9
        poly = [(-w / 2, 0.0), (w / 2, 0.0), (w / 2, -h * 0.9), (w * 0.25, -h * 0.7), (0.0, -h), (-w * 0.25, -h * 0.72), (-w / 2, -h * 0.95)]
        verts, faces = prim_extrude(poly, 0.03, axis='z')
        verts = [(px, py, pz + 0.07 * math.sin(py * 5.0 + px * 3)) for (px, py, pz) in verts]
        mb.add((verts, faces), 'team', M((0, -0.03, 0)), smooth=40)
        out.append(mb.build(mats, parent=root, location=(x, top, z + 0.06)))
    return out


def main():
    args = C.script_args()
    C.reset_scene()
    mats = C.make_paint_set(PALETTE)
    root = C.make_empty('GreatHall')
    base = build_base(mats, root)
    hall = build_hall(mats, root)
    roof = build_roof(mats, root)
    court = build_courtyard(mats, root)
    props = build_props(mats, root)
    banners = build_banner_nodes(mats, root)
    weights = {'Base': 0.6, 'Hall': 1.2, 'Roof': 1.0, 'Courtyard': 1.0, 'Props': 0.9}
    weights.update({b.name: 0.4 for b in banners})
    finish_building(root, 'great_hall', 'great_hall.glb', 'great_hall_atlas', [base, hall, roof, court, props], banners,
                    weights, TEAM_DEFAULT, args, spawn=(0, 0, 7.2), rally=(0, 0, 9.4), game_dist=105)


if __name__ == '__main__':
    main()
