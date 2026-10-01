"""
build_workshop.py — Oficina de Engenharia (tipo interno `workshop`) gerada 100% por script.

Uso:
  blender -b --factory-startup --python tools/blender/build_workshop.py -- [--no-render]

Saída (public/models/workshop.glb), coordenadas do jogo, origem no centro da base, frente = +Z:
  Workshop (raiz)
  ├─ Static_Mesh       pedra, reboco, enxaimel, telhado, engrenagens, guindaste, bancada, balista em obras (Atlas)
  ├─ Anim_Banners      bandeirolas, placa e faixa da oficina (TeamColor)
  ├─ Socket_UnitSpawn  saída das unidades
  └─ Socket_Rally      ponto de reunião padrão
Pegada ~7.3 x 7.3 (raio de colisão 3.6), altura ~6.
Galpão de enxaimel sobre pé de pedra com telhado azul de duas águas (cumeeira dourada, cata-vento de engrenagem),
chaminé alta de tijolos, grande engrenagem de ferro e ouro na fachada, portão largo aberto com forja acesa ao
fundo, projetos de máquinas pendurados, guindaste de madeira com caixote, bancada com bigorna e uma balista
inacabada no pátio, pilhas de tábuas, barris, rodas sobressalentes e lanternas.
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
from bld_common import beam, tube, log, bbox_game  # noqa: E402
import siege_common as S  # noqa: E402
from build_stable import PALETTE as SP  # noqa: E402

TEAM_DEFAULT = '#3a66d6'
Y0 = 0.30
FT = 0.95                   # topo do pé de pedra
WT = 3.95                   # beiral
RISE = 1.9
HX0, HX1 = -3.30, 2.30      # galpão
HZ0, HZ1 = -3.30, 1.20

PALETTE = {k: SP[k] for k in ('stone', 'stone_dark', 'stone_light', 'paving', 'plaster', 'roof', 'wood', 'wood_beam',
                              'wood_door', 'iron', 'gold', 'dark', 'glow', 'rope', 'leather', 'hay', 'team')}
PALETTE['brick'] = dict(base='#a4573b', var='#7d3f2a', var_scale=0.6, var_amt=0.8, fine=0.07, pattern='bricks',
                        mapping='box', pw=0.32, ph=0.14, mortar='#c9b89a', mortar_size=0.02, brick_tint='#c2744d',
                        brick_tint_amt=0.5, brick_dark=0.82, brick_lite=1.1, grad=(0.0, 6.0, 0.25), top=0.2,
                        edge='#e3b48c', edge_amt=0.3, edge_r=0.03, ao=(0.8, 0.65))
PALETTE['blueprint'] = dict(base='#2f5d9f', var='#23487f', var_scale=2.0, fine=0.05, pattern='bricks', mapping='box',
                            pw=0.22, ph=0.22, mortar='#b9d3f5', mortar_size=0.05, brick_tint='#2f5d9f',
                            brick_tint_amt=0.0, brick_dark=1.0, brick_lite=1.0, top=0.2, ao=(0.3, 0.4))
PALETTE['parchment'] = dict(base='#dccb9c', var='#bba877', var_scale=3.0, var_amt=0.8, fine=0.08, top=0.25,
                            edge='#f3e8c6', edge_amt=0.4, edge_r=0.02)
PALETTE['steel'] = dict(base='#9aa1ad', var='#7b818d', var_scale=4.0, fine=0.06, top=0.4, edge='#eef2f8',
                        edge_amt=0.8, edge_r=0.012, ao=(0.25, 0.4))
PALETTE['crate'] = dict(base='#9a7040', var='#7a5530', var_scale=3.0, fine=0.08, pattern='planks', mapping='box', pw=1.2,
                        ph=0.18, mortar='#3a2615', top=0.2, edge='#c9a06a', edge_amt=0.4, edge_r=0.02, ao=(0.4, 0.6))
PALETTE['log'] = dict(base='#6b4a2a', var='#4a331c', var_scale=2.0, fine=0.09, top=0.2, edge='#a07a4e', edge_amt=0.4,
                      edge_r=0.03, ao=(0.5, 0.6))
PALETTE['wood_light'] = dict(base='#b08650', var='#8f6a3a', var_scale=2.5, fine=0.08, pattern='planks', mapping='box',
                             pw=1.4, ph=0.16, mortar='#4a3219', top=0.25, edge='#dcb884', edge_amt=0.4, edge_r=0.02,
                             ao=(0.4, 0.6))


def arch_poly(w, h, y0=0.0, segs=8):
    r = w / 2
    spring = y0 + h - r
    pts = [(r, y0)]
    for i in range(segs + 1):
        a = math.pi * i / segs
        pts.append((r * math.cos(a), spring + r * math.sin(a)))
    pts.append((-r, y0))
    return pts


def cog(mb, T, R, teeth, depth, body='iron', hub='gold', spokes=6):
    """Engrenagem de ferro com miolo dourado e raios em relevo. Eixo em z local (face em +z)."""
    mb.add(prim_extrude(S.cog(R, teeth, tooth_h=0.17 * max(R, 0.6) / 1.0), depth, axis='z'), body, T)
    mb.add(prim_cyl(R * 0.72, R * 0.72, depth * 0.3, 14, base=False), 'steel', T @ M((0, 0, depth * 0.55), (90, 0, 0)), smooth=30)
    for k in range(spokes):
        a = 180.0 * k / spokes
        mb.add(prim_box(R * 1.35, R * 0.11, depth * 0.3), 'dark', T @ M((0, 0, depth * 0.52), (0, 0, a)))
    mb.add(prim_cyl(R * 0.28, R * 0.28, depth * 0.5, 10, base=False), hub, T @ M((0, 0, depth * 0.65), (90, 0, 0)), smooth=30,
           bevel=0.01)


def build_base(mats, root):
    mb = MeshBuilder('Base')
    mb.add(prim_box(7.3, Y0, 7.3, taper=(0.975, 0.975), base=True), 'stone_dark', bevel=0.07)
    mb.add(prim_box(7.0, 0.04, 7.0, base=True), 'paving', M((0, Y0, 0)))
    mb.add(prim_box(2.4, 0.12, 0.6, base=True), 'stone_dark', M((-0.3, Y0, HZ1 + 0.4)), bevel=0.03)
    return mb.build(mats, parent=root)


def build_hall(mats, root):
    mb = MeshBuilder('Hall')
    cx, cz = (HX0 + HX1) / 2, (HZ0 + HZ1) / 2
    W, D = HX1 - HX0, HZ1 - HZ0
    H = WT - FT
    # pé de pedra
    mb.add(prim_box(W + 0.3, FT - Y0, D + 0.3, taper=(0.985, 0.985), base=True), 'stone', M((cx, Y0, cz)), bevel=0.05)
    mb.add(prim_box(W + 0.4, 0.1, D + 0.4, base=True), 'stone_light', M((cx, FT - 0.1, cz)), bevel=0.03)
    # paredes de reboco (fundo, laterais) + interior escuro
    mb.add(prim_box(W, H, 0.3, base=True), 'plaster', M((cx, FT, HZ0 + 0.15)), bevel=0.02)
    for x in (HX0 + 0.15, HX1 - 0.15):
        mb.add(prim_box(0.3, H, D - 0.1, base=True), 'plaster', M((x, FT, cz)), bevel=0.02)
    mb.add(prim_box(W - 0.7, H, 0.1, base=True), 'dark', M((cx, FT, HZ0 + 0.33)))
    mb.add(prim_box(W - 0.7, 0.05, D - 0.6, base=True), 'dark', M((cx, FT, cz)))
    # frente: painéis de reboco ao lado do vão do portão (x -1.4..0.8), padieira
    gx0, gx1 = -1.45, 0.85
    mb.add(prim_box(gx0 - HX0, H, 0.42, base=True), 'plaster', M(((gx0 + HX0) / 2, FT, HZ1 - 0.2)), bevel=0.02)
    mb.add(prim_box(HX1 - gx1, H, 0.42, base=True), 'plaster', M(((gx1 + HX1) / 2, FT, HZ1 - 0.2)), bevel=0.02)
    mb.add(prim_box(gx1 - gx0, WT - FT - 2.35, 0.42, base=True), 'plaster', M(((gx0 + gx1) / 2, FT + 2.35, HZ1 - 0.2)), bevel=0.02)
    # enxaimel: vigas verticais, peitoril, viga superior, escoras em X
    zf = HZ1 + 0.02
    for x in (HX0 + 0.1, gx0 - 0.1, gx1 + 0.1, HX1 - 0.1):
        beam(mb, (x, FT, zf), (x, WT, zf), 0.16, 0.12, 'wood_beam')
    beam(mb, (HX0, WT - 0.1, zf), (HX1, WT - 0.1, zf), 0.2, 0.14, 'wood_beam')
    beam(mb, (HX0, FT + 0.1, zf), (gx0, FT + 0.1, zf), 0.14, 0.11, 'wood_beam')
    beam(mb, (gx1, FT + 0.1, zf), (HX1, FT + 0.1, zf), 0.14, 0.11, 'wood_beam')
    beam(mb, (gx0 - 0.1, FT + 0.12, zf), (HX0 + 0.25, WT - 0.2, zf), 0.1, 0.1, 'wood_beam')
    beam(mb, (gx1 + 0.1, FT + 0.12, zf), (HX1 - 0.15, WT - 0.2, zf), 0.1, 0.1, 'wood_beam')
    mb.add(prim_box(gx1 - gx0 + 0.3, 0.26, 0.5), 'wood_beam', M(((gx0 + gx1) / 2, FT + 2.35 - 0.06, zf - 0.04)), bevel=0.03)
    # portão: moldura em arco de madeira + folhas abertas
    gw = gx1 - gx0
    mb.add(prim_extrude(arch_poly(gw, 2.45, FT), 0.1, axis='z'), 'wood_beam', M(((gx0 + gx1) / 2, 0, zf + 0.0)))
    mb.add(prim_extrude(arch_poly(gw - 0.3, 2.3, FT), 0.12, axis='z'), 'dark', M(((gx0 + gx1) / 2, 0, zf - 0.03)))
    for sx in (-1, 1):
        hx = (gx0 + gx1) / 2 + sx * (gw / 2 - 0.02)
        yaw = -90.0 - 25.0 * sx
        leaf = Vector((-sx * math.cos(math.radians(65)), 0, math.sin(math.radians(65)))) * 0.5
        mb.add(prim_box(1.0, 2.1, 0.09, base=True), 'wood_door', M((hx + leaf.x, FT + 0.02, zf + 0.05 + leaf.z), (0, yaw, 0)), bevel=0.02)
        for y in (0.5, 1.6):
            mb.add(prim_box(1.0, 0.08, 0.13), 'iron', M((hx + leaf.x, FT + y, zf + 0.05 + leaf.z), (0, yaw, 0)))
    # interior: brasa da forja ao fundo
    mb.add(prim_box(1.3, 0.9, 0.5, base=True), 'stone_dark', M((-0.3, FT, HZ0 + 0.6)), bevel=0.03)
    mb.add(prim_box(0.8, 0.45, 0.06), 'glow', M((-0.3, FT + 0.45, HZ0 + 0.88)))
    mb.add(prim_cone(0.22, 0.3, 6), 'glow', M((-0.3, FT + 0.02, HZ0 + 1.4)))
    # madeiramento aparente nas laterais e no fundo
    for sx in (-1, 1):
        x = HX0 - 0.03 if sx < 0 else HX1 + 0.03
        beam(mb, (x, FT + 0.12, HZ0 + 0.2), (x, FT + 0.12, HZ1 - 0.4), 0.12, 0.1, 'wood_beam')
        beam(mb, (x, WT - 0.1, HZ0 + 0.1), (x, WT - 0.1, HZ1 - 0.3), 0.14, 0.1, 'wood_beam')
        for z in (HZ0 + 0.2, cz - 0.6, cz + 0.6, HZ1 - 0.4):
            beam(mb, (x, FT, z), (x, WT, z), 0.14, 0.1, 'wood_beam')
        beam(mb, (x, FT + 0.12, HZ0 + 0.2), (x, WT - 0.1, cz - 0.6), 0.1, 0.09, 'wood_beam')
        beam(mb, (x, FT + 0.12, HZ1 - 0.4), (x, WT - 0.1, cz + 0.6), 0.1, 0.09, 'wood_beam')
    zb = HZ0 - 0.03
    beam(mb, (HX0, FT + 0.12, zb), (HX1, FT + 0.12, zb), 0.12, 0.1, 'wood_beam')
    beam(mb, (HX0, WT - 0.1, zb), (HX1, WT - 0.1, zb), 0.14, 0.1, 'wood_beam')
    for x in (HX0 + 0.1, -1.4, 0.3, HX1 - 0.1):
        beam(mb, (x, FT, zb), (x, WT, zb), 0.14, 0.1, 'wood_beam')
    # janela com venezianas na lateral esquerda
    wx = HX0 - 0.03
    mb.add(prim_box(0.06, 0.8, 0.7), 'dark', M((wx - 0.02, 2.15, cz)))
    mb.add(prim_box(0.08, 0.06, 0.84), 'wood_beam', M((wx - 0.03, 1.72, cz)))
    mb.add(prim_box(0.08, 0.06, 0.84), 'wood_beam', M((wx - 0.03, 2.58, cz)))
    for dz in (-0.4, 0.4):
        mb.add(prim_box(0.05, 0.86, 0.26), 'wood', M((wx - 0.06, 2.15, cz + dz)), bevel=0.01)
    # empenas laterais (triângulos de reboco com vigas)
    gable = [(-D / 2, 0.0), (D / 2, 0.0), (0.0, RISE)]
    for x in (HX0 + 0.22, HX1 - 0.22):
        mb.add(prim_extrude([(p[0], p[1]) for p in gable], 0.36, axis='x'), 'plaster', M((x, WT, cz)), bevel=0.02)
    for sx in (-1, 1):
        x = HX0 - 0.0 if sx < 0 else HX1 + 0.0
        xo = x - 0.02 if sx < 0 else x + 0.02
        beam(mb, (xo, WT, HZ0), (xo, WT + RISE + 0.06, cz), 0.16, 0.12, 'wood_beam')
        beam(mb, (xo, WT, HZ1), (xo, WT + RISE + 0.06, cz), 0.16, 0.12, 'wood_beam')
        beam(mb, (xo, WT + RISE * 0.45, cz - D * 0.23), (xo, WT + RISE * 0.45, cz + D * 0.23), 0.12, 0.1, 'wood_beam')
        beam(mb, (xo, WT, cz), (xo, WT + RISE * 0.9, cz), 0.11, 0.1, 'wood_beam')
    # janela redonda da empena esquerda com moldura dourada
    mb.add(prim_cyl(0.3, 0.3, 0.1, 10, base=False), 'gold', M((HX0 - 0.03, WT + 0.55, cz), (0, 0, 90)), smooth=30)
    mb.add(prim_cyl(0.22, 0.22, 0.12, 10, base=False), 'dark', M((HX0 - 0.05, WT + 0.55, cz), (0, 0, 90)), smooth=30)
    # projetos pendurados na parede da frente (direita do portão) e da lateral direita
    for (x, y, w, h, rot) in ((1.15, 2.35, 0.55, 0.75, 4), (1.72, 2.05, 0.5, 0.7, -5)):
        mb.add(prim_box(w, h, 0.03), 'blueprint', M((x, y, zf + 0.08), (0, 0, rot)), bevel=0.005)
        mb.add(prim_box(w + 0.08, 0.05, 0.05), 'wood_beam', M((x, y + h / 2 + 0.03, zf + 0.09), (0, 0, rot)))
        mb.add(prim_box(w + 0.08, 0.05, 0.05), 'wood_beam', M((x, y - h / 2 - 0.03, zf + 0.09), (0, 0, rot)))
    mb.add(prim_cyl(0.06, 0.06, 0.5, 8, base=False), 'parchment', M((1.45, 1.5, zf + 0.1), (0, 0, 90 - 12)), smooth=40)
    mb.add(prim_box(0.46, 0.5, 0.03), 'parchment', M((1.45, 1.78, zf + 0.085), (0, 0, 6)))
    return mb.build(mats, parent=root)


def build_gear_wall(mats, root):
    """Engrenagens de ferro e ouro na fachada esquerda + chaminé de tijolos."""
    mb = MeshBuilder('Gears')
    zf = HZ1 + 0.06
    cog(mb, M((-2.4, 2.2, zf)), 0.66, 10, 0.18)
    cog(mb, M((-2.45, 3.45, zf)), 0.36, 8, 0.15)
    # eixo e suportes
    for (x, y) in ((-2.4, 2.2), (-2.45, 3.45)):
        mb.add(prim_cyl(0.06, 0.06, 0.4, 6, base=False), 'iron', M((x, y, zf - 0.05), (90, 0, 0)))
    # chaminé de tijolos no canto traseiro direito
    cx, cz = 2.95, -2.45
    mb.add(prim_box(1.4, FT - Y0, 1.4, taper=(0.98, 0.98), base=True), 'stone_dark', M((cx, Y0, cz)), bevel=0.04)
    mb.add(prim_box(1.15, 5.0, 1.15, taper=(0.72, 0.72), base=True), 'brick', M((cx, FT - 0.05, cz)), bevel=0.03)
    for y in (2.2, 4.1, 5.2):
        mb.add(prim_box(1.3 - 0.11 * (y - 2.2) / 1.1, 0.12, 1.3 - 0.11 * (y - 2.2) / 1.1), 'iron', M((cx, y, cz)), bevel=0.01)
    mb.add(prim_box(1.0, 0.22, 1.0), 'stone_light', M((cx, 6.0, cz)), bevel=0.02)
    mb.add(prim_box(0.76, 0.14, 0.76), 'dark', M((cx, 6.12, cz)))
    mb.add(prim_cone(0.52, 0.3, 4, base=True, phase=math.pi / 4), 'iron', M((cx, 6.1, cz)))
    # tubo lateral de ferro ligando a forja
    tube(mb, [(cx - 0.6, 2.4, cz), (cx - 0.85, 2.4, cz - 0.3), (cx - 0.85, 1.6, cz - 0.3)], [0.09, 0.09, 0.09], 'iron', n=6)
    return mb.build(mats, parent=root)


def build_roof(mats, root):
    mb = MeshBuilder('Roof')
    cz = (HZ0 + HZ1) / 2
    ov = 0.4
    run = (HZ1 - HZ0) / 2 + ov
    rise = RISE * run / ((HZ1 - HZ0) / 2)
    L = math.hypot(run, rise)
    ang = math.degrees(math.atan2(rise, run))
    xc = (HX0 - 0.45 + HX1 + 0.35) / 2
    xl = (HX1 + 0.35) - (HX0 - 0.45)
    ridge_y = WT - ov * RISE / ((HZ1 - HZ0) / 2) + rise
    for sz in (-1, 1):
        mid = Vector((xc, ridge_y - rise / 2, cz + sz * run / 2))
        n = Vector((0, math.cos(math.radians(ang)), sz * math.sin(math.radians(ang)))) * 0.08
        mb.add(prim_box(xl, 0.16, L), 'roof', M(tuple(mid + n), (sz * ang, 0, 0)), bevel=0.03)
    mb.add(prim_box(xl + 0.1, 0.2, 0.3), 'gold', M((xc, ridge_y + 0.14, cz), (45, 0, 0)), bevel=0.02)
    for sx in (-1, 1):
        mb.add(prim_sphere(0.09, 0.09, 0.09, 6, 3), 'gold', M((xc + sx * (xl / 2 + 0.05), ridge_y + 0.14, cz)), smooth=60)
    # cata-vento de engrenagem sobre a cumeeira
    wx = -1.2
    log(mb, (wx, ridge_y + 0.2, cz), (wx, ridge_y + 1.0, cz), 0.03, 'iron', n=5)
    cog(mb, M((wx, ridge_y + 1.05, cz + 0.06), (0, 90, 0)), 0.3, 8, 0.1, body='gold', hub='iron', spokes=3)
    return mb.build(mats, parent=root)


def build_props(mats, root):
    mb = MeshBuilder('Props')
    Z = HZ1 + 0.9
    # guindaste na frente-direita: coluna, lança, escora, polia, corda e caixote
    px, pz = 3.0, 2.6
    mb.add(prim_box(0.7, 0.35, 0.7, taper=(0.9, 0.9), base=True), 'stone', M((px, Y0, pz)), bevel=0.04)
    beam(mb, (px, Y0 + 0.3, pz), (px, 4.6, pz), 0.24, 0.24, 'log', bevel=0.02)
    jib_end = (0.95, 4.35, pz - 0.15)
    beam(mb, (px, 4.35, pz), jib_end, 0.2, 0.2, 'wood_beam', bevel=0.02)
    beam(mb, (px, 2.9, pz), (1.95, 4.26, pz - 0.1), 0.12, 0.12, 'wood_beam')
    mb.add(prim_box(0.3, 0.34, 0.12), 'iron', M((px, 4.5, pz)), bevel=0.01)
    mb.add(prim_cyl(0.16, 0.16, 0.12, 10, base=False), 'iron', M((jib_end[0] - 0.05, jib_end[1] - 0.2, jib_end[2]), (0, 0, 90)), smooth=30)
    log(mb, (jib_end[0] - 0.05, jib_end[1] - 0.3, jib_end[2]), (jib_end[0] - 0.05, 1.55, jib_end[2]), 0.022, 'rope', n=5)
    mb.add(prim_box(0.06, 0.12, 0.06), 'iron', M((jib_end[0] - 0.05, 1.47, jib_end[2])))
    mb.add(prim_box(0.62, 0.52, 0.62), 'crate', M((jib_end[0] - 0.05, 0.95, jib_end[2])), bevel=0.02)
    for d in (-0.3, 0.3):
        mb.add(prim_box(0.66, 0.06, 0.08), 'wood_beam', M((jib_end[0] - 0.05, 0.95, jib_end[2] + d)))
    # bancada com bigorna, martelo e serra (frente-centro)
    bx, bz = 0.55, 2.85
    mb.add(prim_box(1.9, 0.14, 0.75), 'wood_light', M((bx, Y0 + 0.95, bz)), bevel=0.02)
    for sx in (-1, 1):
        for sz in (-1, 1):
            mb.add(prim_box(0.14, 0.95, 0.14, base=True), 'wood_beam', M((bx + sx * 0.8, Y0, bz + sz * 0.28)), bevel=0.012)
    beam(mb, (bx - 0.8, Y0 + 0.4, bz), (bx + 0.8, Y0 + 0.4, bz), 0.12, 0.08, 'wood_beam')
    mb.add(prim_box(0.46, 0.12, 0.26), 'iron', M((bx - 0.45, Y0 + 1.08, bz)), bevel=0.01)
    mb.add(prim_box(0.26, 0.14, 0.2, taper=(0.7, 0.8)), 'iron', M((bx - 0.45, Y0 + 1.2, bz)), bevel=0.01)
    mb.add(prim_cone(0.09, 0.22, 4), 'iron', M((bx - 0.75, Y0 + 1.14, bz), (0, 0, 90)))
    mb.add(prim_box(0.4, 0.16, 0.05), 'iron', M((bx + 0.4, Y0 + 1.06, bz - 0.1), (0, 25, 0)))   # serra
    mb.add(prim_box(0.05, 0.05, 0.4), 'wood', M((bx + 0.05, Y0 + 1.06, bz + 0.05)))               # cabo de martelo
    mb.add(prim_box(0.22, 0.12, 0.12), 'steel', M((bx + 0.05, Y0 + 1.1, bz + 0.22)), bevel=0.008)
    mb.add(prim_box(0.3, 0.05, 0.22), 'parchment', M((bx + 0.65, Y0 + 1.04, bz + 0.12), (0, -15, 0)))
    # balista inacabada no pátio (esquerda): chassi, eixo, 2 rodas, coronha e braço pela metade
    T = M((-1.95, Y0, 2.6), (0, 14, 0))
    for sx in (-1, 1):
        mb.add(prim_box(0.14, 0.14, 1.9), 'wood', T @ M((sx * 0.4, 0.62, 0)), bevel=0.015)
        wh = S.Xf(mb, T @ M((sx * 0.72, 0.5, 0.0)))
        S.spoked_wheel(wh, 0.5, sx, hw=0.07, spokes=8, felloe=0.08, wood='wood', dark='wood_beam', iron='iron', trim='gold', hub_out=0.16)
    mb.add(prim_box(1.3, 0.11, 0.11), 'wood_beam', T @ M((0, 0.5, 0.0)))
    for z in (-0.65, 0.65):
        mb.add(prim_box(0.9, 0.12, 0.14), 'wood_beam', T @ M((0, 0.62, z)))
    mb.add(prim_box(0.18, 0.15, 1.7), 'wood_light', T @ M((0, 0.88, 0.1)), bevel=0.015)
    tips = (-1.0, 0.62), (1.0, 0.62)
    for sx in (-1, 1):
        pts = bezier((sx * 0.1, 0.88, 0.62), (sx * 0.55, 0.88, 0.6), (sx * 0.95, 0.88, 0.85), 4)
        tube(mb, S.xf(T, pts), [(0.07, 0.09), (0.065, 0.085), (0.06, 0.08), (0.05, 0.07), (0.04, 0.06)], 'wood_light', n=6, smooth=50)
    mb.add(prim_box(0.36, 0.22, 0.26), 'iron', T @ M((0, 0.88, 0.62)), bevel=0.012)
    # virote ainda sem cabeça apoiado na bancada? -> cavalete com virote pronto
    mb.add(prim_box(0.06, 0.06, 1.2), 'wood', T @ M((0, 1.03, 0.3)))
    mb.add(prim_cone(0.05, 0.16, 4), 'steel', T @ M((0, 1.03, 0.98), (90, 0, 0)))
    # pilha de tábuas e toras (direita-frente) e barris (esquerda)
    for i in range(4):
        mb.add(prim_box(1.6, 0.13, 0.36), 'wood_light', M((2.0, Y0 + 0.07 + 0.14 * i, 3.3), (0, 6 * (i % 2) - 3, 0)), bevel=0.01)
    for (bx2, bz2) in ((-3.05, 1.85), (-2.6, 2.1)):
        mb.add(prim_rings([ring_h(0.0, 0.26, 0.26, 8), ring_h(0.3, 0.31, 0.31, 8), ring_h(0.6, 0.26, 0.26, 8)]),
               'wood', M((bx2, Y0, bz2)), smooth=50)
        for y in (0.12, 0.48):
            mb.add(prim_cyl(0.3, 0.3, 0.05, 8), 'iron', M((bx2, Y0 + y, bz2)))
    # roda sobressalente encostada na parede (esquerda da frente) e bobina de corda
    sw = S.Xf(mb, M((-3.3, Y0 + 0.62, 0.7), (0, 90, 18)))
    S.spoked_wheel(sw, 0.62, 1, hw=0.07, spokes=8, felloe=0.09, wood='wood', dark='wood_beam', iron='iron', trim='gold')
    mb.add(prim_cyl(0.3, 0.3, 0.24, 10, base=True), 'rope', M((-0.15, Y0, 3.3)), smooth=30)
    mb.add(prim_cyl(0.33, 0.33, 0.05, 10, base=True), 'wood_beam', M((-0.15, Y0, 3.3)))
    mb.add(prim_cyl(0.33, 0.33, 0.05, 10, base=True), 'wood_beam', M((-0.15, Y0 + 0.24, 3.3)))
    # lanternas nos pilares do portão e mastros de bandeira
    for x in (-1.6, 1.0):
        mb.add(prim_box(0.05, 0.05, 0.3), 'iron', M((x, FT + 1.75, HZ1 + 0.3)))
        mb.add(prim_box(0.16, 0.22, 0.16), 'glow', M((x, FT + 1.5, HZ1 + 0.42)), bevel=0.01)
        mb.add(prim_box(0.2, 0.05, 0.2), 'iron', M((x, FT + 1.64, HZ1 + 0.42)))
        mb.add(prim_box(0.2, 0.04, 0.2), 'iron', M((x, FT + 1.37, HZ1 + 0.42)))
    for sx in (-1, 1):
        log(mb, (sx * 3.4, Y0, 3.3), (sx * 3.4, 5.0, 3.3), 0.06, 'log', n=6)
        mb.add(prim_sphere(0.09, 0.09, 0.09, 6, 3), 'gold', M((sx * 3.4, 5.0, 3.3)), smooth=60)
        mb.add(prim_cone(0.07, 0.3, 5), 'gold', M((sx * 3.4, 5.06, 3.3)))
    return mb.build(mats, parent=root)


def build_banners(mats, root):
    mb = MeshBuilder('Anim_Banners')
    for sx in (-1, 1):
        pts = [(0.0, 0.0), (0.85, 0.0), (0.70, -0.22), (0.85, -0.44), (0.0, -0.44)]
        verts, faces = prim_extrude(pts, 0.04, axis='z')
        verts = S.wave(verts, 0.1, 4.0, 0.0, sx)
        verts = [(sx * x, y, z) for (x, y, z) in verts]
        mb.add((verts, faces), 'team', M((sx * 3.4 + sx * 0.03, 4.75, 3.3)), smooth=40)
    # placa da oficina sobre o portão: tábua de time com engrenagem dourada
    sy = FT + 2.85
    mb.add(prim_box(1.7, 0.66, 0.08), 'team', M((-0.3, sy, HZ1 + 0.32)), bevel=0.02)
    return mb.build(mats, parent=root)


def build_sign_gold(mats, root):
    mb = MeshBuilder('SignGear')
    cog(mb, M((-0.3, FT + 2.85, HZ1 + 0.4)), 0.27, 8, 0.09, body='gold', hub='iron', spokes=3)
    for sx in (-1, 1):
        mb.add(prim_box(0.05, 0.1, 0.05), 'iron', M((-0.3 + sx * 0.75, FT + 3.25, HZ1 + 0.36)))
    return mb.build(mats, parent=root)


def main():
    args = C.script_args()
    C.reset_scene()
    mats = C.make_paint_set(PALETTE)
    root = C.make_empty('Workshop')
    base = build_base(mats, root)
    hall = build_hall(mats, root)
    gears = build_gear_wall(mats, root)
    roof = build_roof(mats, root)
    props = build_props(mats, root)
    sign = build_sign_gold(mats, root)
    banners = build_banners(mats, root)
    bake_set = [base, hall, gears, roof, props, sign, banners]
    bpy.context.view_layer.update()
    C.uv_atlas(bake_set, weights={'Base': 0.6, 'Hall': 1.0, 'Gears': 1.0, 'Roof': 0.9, 'Props': 1.0, 'SignGear': 0.6, 'Anim_Banners': 1.0},
               margin=0.004, angle=50.0)
    img = C.bake_atlas(bake_set, 'workshop_atlas', int(os.environ.get('ATLAS', 1024)),
                       samples=int(os.environ.get('BAKE_SAMPLES', 32)), margin=6)
    C.finalize_materials(bake_set, img, team_default=TEAM_DEFAULT,
                         out_png=os.path.join(C.BUILD_DIR, 'workshop_atlas.png'))
    static = C.join_objects([base, hall, gears, roof, props, sign], 'Static_Mesh')
    static.parent = root
    C.make_empty('Socket_UnitSpawn', (0, 0, 4.6), parent=root)
    C.make_empty('Socket_Rally', (0, 0, 6.6), parent=root)
    bpy.context.view_layer.update()
    out = os.path.join(C.OUT_MODELS, 'workshop.glb')
    C.export_glb(root, out, quality=80)
    print('STATS workshop', C.stats(root, out))
    print('BBOX', bbox_game(root))
    if '--no-render' not in args:
        rig = C.RenderRig(root, 'workshop', res=int(os.environ.get('RENDER_RES', 800)), samples=24)
        rig.render('34', (1.0, 0.95, 1.0), 30)
        rig.render('front', (0.0, 0.35, 1.0), 30)
        rig.render('back', (-0.8, 0.8, -1.0), 30)
        rig.render('side', (1.0, 0.25, 0.0), 30)
        rig.render('game', (45, 44, 45), 30, dist=78)
        C.set_team_color('#d23a2c')
        rig.render('34_vermelho', (1.0, 0.95, 1.0), 30)


if __name__ == '__main__':
    main()
