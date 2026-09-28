"""
build_castle.py — Castelo humano (tipo interno `castle`) gerado 100% por script.

Uso:
  blender -b --factory-startup --python tools/blender/build_castle.py -- [--no-render]

Saída (public/models/castle.glb), coordenadas do jogo, origem no centro da base:
  Castle (raiz)
  ├─ Static_Mesh       tudo que é pedra/telhado/madeira/ferro (1 material: Atlas)
  ├─ Anim_Banners      estandartes e bandeiras (material TeamColor)
  ├─ Socket_UnitSpawn  saída das unidades (frente do portão)
  └─ Socket_Rally      ponto de reunião padrão
Pegada ~11.2 x 11.2 (raio de colisão 5.5), altura ~9.5.
"""
import os
import sys
import math

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
from mathutils import Matrix  # noqa: E402
import common as C  # noqa: E402
from common import (MeshBuilder, M, prim_box, prim_rings, ring_h, prim_cyl, prim_cone,  # noqa: E402
                    prim_sphere, prim_extrude)

TEAM_DEFAULT = '#3a66d6'
T = 4.3          # centro das torres de canto (±T, ±T)
TR = 1.28        # raio das torres
Y0 = 0.4         # topo do embasamento
WALL_TOP = 3.7
WALL_T = 0.95

STONE = dict(base='#a8a196', var='#8c867b', var_scale=0.35, var_amt=0.8, fine=0.06,
             pattern='bricks', mapping='box', pw=0.62, ph=0.3, mortar='#5a544b', mortar_size=0.03,
             brick_tint='#c2b193', brick_tint_amt=0.5, brick_dark=0.8, brick_lite=1.1,
             grad=(0.0, 6.0, 0.28), top=0.18, edge='#e2ddd0', edge_amt=0.45, edge_r=0.06, edge_gain=7.0,
             ao=(1.3, 0.75), ao_pow=1.3)
PALETTE = {
    'stone': STONE,
    'stone_round': dict(STONE, mapping='cyl', cyl_radius=TR),
    'stone_dark': dict(STONE, base='#86827a', var='#6f6b64', pw=1.3, ph=0.4, brick_tint='#9a907e',
                       grad=(0.0, 1.0, 0.25)),
    'stone_light': dict(STONE, base='#cfc8b8', var='#b9b1a0', pattern=None, edge_amt=0.6),
    'paving': dict(STONE, base='#a39d90', var='#8b857a', pw=0.9, ph=0.9, mortar='#6a655b',
                   brick_tint='#b3a892', grad=None, ao=(1.6, 0.85)),
    'roof_cone': dict(base='#3f6fc4', var='#2d5aa6', var_scale=0.5, var_amt=0.7, fine=0.05,
                      pattern='shingles', mapping='cyl', cyl_radius=1.1, pw=0.36, ph=0.26,
                      mortar='#1d3160', brick_tint='#6390de', brick_tint_amt=0.4, brick_dark=0.82,
                      brick_lite=1.12, top=0.2, edge='#a9c4f2', edge_amt=0.5, edge_r=0.05,
                      ao=(1.0, 0.6), grad=(5.0, 9.5, 0.2)),
    'roof': dict(base='#3f6fc4', var='#2d5aa6', var_scale=0.5, var_amt=0.7, fine=0.05,
                 pattern='shingles', mapping='box', pw=0.4, ph=0.28, mortar='#1d3160',
                 brick_tint='#6390de', brick_tint_amt=0.4, brick_dark=0.82, brick_lite=1.12, top=0.2,
                 edge='#a9c4f2', edge_amt=0.5, edge_r=0.05, ao=(1.0, 0.6)),
    'wood': dict(base='#80572f', var='#6a4526', var_scale=1.5, fine=0.08, pattern='planks', mapping='box',
                 pw=2.2, ph=0.22, mortar='#3a2615', top=0.15, edge='#b08050', edge_amt=0.4, edge_r=0.03,
                 ao=(0.8, 0.7)),
    'wood_door': dict(base='#6b4424', var='#58371c', var_scale=1.5, fine=0.08, pattern='planks_v', mapping='box',
                      pw=3.0, ph=0.26, mortar='#2c1c10', top=0.1, edge='#9a6d42', edge_amt=0.35, edge_r=0.03,
                      ao=(0.8, 0.8)),
    'iron': dict(base='#41444c', var='#34373e', var_scale=3.0, fine=0.08, top=0.3, edge='#aab0bb',
                 edge_amt=0.8, edge_r=0.02, ao=(0.5, 0.5)),
    'gold': dict(base='#d9a63a', var='#b98524', var_scale=4.0, fine=0.06, top=0.3, edge='#fff0b8',
                 edge_amt=0.8, edge_r=0.02, ao=(0.4, 0.4)),
    'dark': dict(base='#1c1e27', var='#15161d'),
    'glow': dict(base='#ffc86a', var='#ffab45', var_scale=3.0, emit_boost=1.3),
    'team': dict(base='#bab2a6', var='#a0988c', var_scale=2.0, fine=0.08, top=0.2, edge='#dcd6cc',
                 edge_amt=0.3, edge_r=0.03, ao=(0.8, 0.6), team=True),
}


def arch_poly(w, h, y0=0.0, segs=8):
    """Polígono de arco (porta/janela) de largura w e altura total h."""
    r = w / 2
    spring = y0 + h - r
    pts = [(r, y0)]
    for i in range(segs + 1):
        a = math.pi * i / segs
        pts.append((r * math.cos(a), spring + r * math.sin(a)))
    pts.append((-r, y0))
    return pts


def wall_with_arch(w, top, a_w, a_h, y0=0.0, segs=8):
    """Retângulo w x (top-y0) com um arco vazado centralizado na base."""
    r = a_w / 2
    spring = y0 + a_h - r
    pts = [(-w / 2, y0), (-r, y0), (-r, spring)]
    for i in range(1, segs):
        a = math.pi - math.pi * i / segs
        pts.append((r * math.cos(a), spring + r * math.sin(a)))
    pts += [(r, spring), (r, y0), (w / 2, y0), (w / 2, top), (-w / 2, top)]
    return pts


def merlon_row(mb, x0, x1, z, y, count, size=(0.5, 0.5, 0.3), rot_y=0.0, mat='stone'):
    """Ameias ao longo de x (no espaço de um trecho), depois giradas por rot_y."""
    R = M(r=(0, rot_y, 0))
    for i in range(count):
        x = x0 + (x1 - x0) * (i + 0.5) / count
        mb.add(prim_box(*size, base=True), mat, R @ M((x, y, z)))


def window(mb, R, pos, w=0.5, h=0.9, glow=False):
    """Janela em arco (moldura clara + vão escuro/aceso). R = matriz da face
    (a janela é modelada olhando para +z)."""
    x, y, z = pos
    fr = prim_extrude(arch_poly(w + 0.24, h + 0.18), 0.1, axis='z')
    mb.add(fr, 'stone_light', R @ M((x, y - 0.09, z + 0.03)), bevel=0.02)
    gl = prim_extrude(arch_poly(w, h), 0.1, axis='z')
    mb.add(gl, 'glow' if glow else 'dark', R @ M((x, y, z + 0.06)))


def build_base(mats, root):
    mb = MeshBuilder('Base')
    mb.add(prim_box(11.2, Y0, 11.2, taper=(0.975, 0.975), base=True), 'stone_dark', bevel=0.08)
    mb.add(prim_box(9.4, 0.04, 9.4, base=True), 'paving', M((0, Y0, 0)))
    # escadaria na frente do portão
    for i, (w, d) in enumerate(((3.0, 0.9), (2.6, 0.55))):
        mb.add(prim_box(w, 0.2, d, base=True), 'stone_dark', M((0, i * 0.2, 5.45 + d / 2 - i * 0.2)), bevel=0.03)
    return mb.build(mats, parent=root)


def build_walls(mats, root):
    mb = MeshBuilder('Walls')
    h = WALL_TOP - Y0
    span = 2 * T
    # três muralhas lisas (trás, esquerda, direita) + dois trechos da frente
    for rot in (180, 90, -90):
        R = M(r=(0, rot, 0))
        mb.add(prim_box(span, h, WALL_T, taper=(1.0, 0.82), base=True), 'stone', R @ M((0, Y0, T)), bevel=0.05)
        # parapeito externo com ameias + adarve interno de madeira
        mb.add(prim_box(span - 2.2, 0.25, 0.3, base=True), 'stone', R @ M((0, WALL_TOP, T + 0.3)), bevel=0.03)
        merlon_row(mb, -T + 1.3, T - 1.3, T + 0.3, WALL_TOP + 0.25, 7, rot_y=rot)
        mb.add(prim_box(span - 2.6, 0.12, 0.5, base=True), 'wood', R @ M((0, WALL_TOP - 0.05, T - 0.62)))
        # contrafortes externos
        for x in (-1.9, 1.9):
            mb.add(prim_box(0.6, 2.2, 0.35, taper=(0.9, 0.3), base=True), 'stone', R @ M((x, Y0, T + 0.55)),
                   bevel=0.04)
    for sx in (-1, 1):
        mb.add(prim_box(2.4, h, WALL_T, taper=(1.0, 0.82), base=True), 'stone', M((sx * 3.1, Y0, T)), bevel=0.05)
        mb.add(prim_box(1.6, 0.25, 0.3, base=True), 'stone', M((sx * 2.9, WALL_TOP, T + 0.3)), bevel=0.03)
        merlon_row(mb, sx * 2.1, sx * 3.5, T + 0.3, WALL_TOP + 0.25, 2)
    return mb.build(mats, parent=root)


def build_gatehouse(mats, root):
    mb = MeshBuilder('Gatehouse')
    z = T + 0.15
    top = 5.0
    gw, gd = 4.2, 1.7
    poly = wall_with_arch(gw, top, 1.9, 2.7, y0=Y0, segs=10)
    mb.add(prim_extrude(poly, gd, axis='z'), 'stone', M((0, 0, z)), bevel=0.04)
    # arquivolta (aduelas claras) na frente
    r0, r1 = 0.95, 1.25
    spring = Y0 + 2.7 - 0.95
    ring = []
    n = 10
    for i in range(n + 1):
        a = math.pi * i / n
        ring.append((r1 * math.cos(a), spring + r1 * math.sin(a)))
    for i in range(n, -1, -1):
        a = math.pi * i / n
        ring.append((r0 * math.cos(a), spring + r0 * math.sin(a)))
    mb.add(prim_extrude(ring, 0.14, axis='z'), 'stone_light', M((0, 0, z + gd / 2 + 0.05)), bevel=0.02)
    mb.add(prim_box(0.36, 0.42, 0.2), 'stone_light', M((0, spring + r1 - 0.05, z + gd / 2 + 0.12)), bevel=0.03)
    # portão de madeira recuado + ferragens
    door = prim_extrude(arch_poly(1.9, 2.7, Y0, 10), 0.14, axis='z')
    mb.add(door, 'wood_door', M((0, 0, z + 0.1)))
    for y in (1.2, 2.1):
        mb.add(prim_box(1.8, 0.1, 0.06), 'iron', M((0, y, z + 0.2)), bevel=0.015)
    mb.add(prim_box(0.05, 2.0, 0.06), 'iron', M((0, Y0 + 1.0, z + 0.2)))
    # torreões do portão (quadrados, mais altos)
    for sx in (-1, 1):
        mb.add(prim_box(1.4, 5.6 - Y0, 1.4, taper=(0.92, 0.92), base=True), 'stone',
               M((sx * 2.3, Y0, z + 0.25)), bevel=0.05)
        mb.add(prim_box(1.6, 0.3, 1.6, base=True), 'stone_light', M((sx * 2.3, 5.4, z + 0.25)), bevel=0.04)
        for (dx, dz) in ((-0.55, -0.55), (0.55, -0.55), (-0.55, 0.55), (0.55, 0.55)):
            mb.add(prim_box(0.42, 0.5, 0.42, base=True), 'stone', M((sx * 2.3 + dx, 5.7, z + 0.25 + dz)))
        mb.add(prim_box(0.12, 0.6, 0.1), 'dark', M((sx * 2.3, 3.4, z + 0.93)))
    # ameias sobre o portão
    merlon_row(mb, -1.5, 1.5, z + gd / 2 - 0.15, top, 3)
    # suportes de madeira dos estandartes
    for sx in (-1, 1):
        mb.add(prim_cyl(0.05, 0.05, 1.0, 6, base=False), 'wood', M((sx * 1.1, 4.62, z + gd / 2 + 0.25), (0, 0, 90)))
        for dx in (-0.5, 0.5):
            mb.add(prim_sphere(0.06, 0.06, 0.06, 6, 3), 'gold', M((sx * 1.1 + dx, 4.62, z + gd / 2 + 0.25)))
    # tochas acesas
    for sx in (-1, 1):
        mb.add(prim_box(0.12, 0.3, 0.3), 'iron', M((sx * 1.55, 2.3, z + gd / 2 + 0.12)))
        mb.add(prim_cone(0.1, 0.3, 5), 'glow', M((sx * 1.55, 2.5, z + gd / 2 + 0.25)))
    return mb.build(mats, parent=root)


def build_tower(mats, root):
    """Torre de canto protótipo (frente-direita). Depois do bake ela é
    duplicada para os outros cantos compartilhando as mesmas UVs."""
    mb = MeshBuilder('Tower')
    n = 14
    rings = [ring_h(0.0, TR + 0.2, TR + 0.2, n), ring_h(0.7, TR + 0.02, TR + 0.02, n),
             ring_h(5.3 - Y0, TR - 0.06, TR - 0.06, n)]
    mb.add(prim_rings(rings, cap0=False), 'stone_round', M((0, Y0, 0)), smooth=35)
    # mata-cães (consolas) + parapeito + ameias
    top = 5.3
    for i in range(n):
        a = 2 * math.pi * (i + 0.5) / n
        mb.add(prim_box(0.26, 0.4, 0.34, taper=(1.0, 1.6)), 'stone',
               M((math.cos(a) * (TR + 0.02), top - 0.15, math.sin(a) * (TR + 0.02)), (0, -math.degrees(a) + 90, 0)))
    mb.add(prim_rings([ring_h(top, TR + 0.18, TR + 0.18, n), ring_h(top + 0.55, TR + 0.2, TR + 0.2, n)]),
           'stone_round', smooth=35)
    for i in range(7):
        a = 2 * math.pi * i / 7 + 0.2
        mb.add(prim_box(0.62, 0.48, 0.3, base=True), 'stone',
               M((math.cos(a) * (TR + 0.08), top + 0.55, math.sin(a) * (TR + 0.08)), (0, -math.degrees(a) + 90, 0)))
    # telhado cônico azul com beiral
    ry = top + 0.35
    mb.add(prim_rings([ring_h(ry, TR + 0.12, TR + 0.12, n), ring_h(ry + 0.35, TR - 0.05, TR - 0.05, n)],
                      cap0=True, cap1=False), 'roof_cone', smooth=30)
    cone_v, cone_f = prim_cone(TR - 0.05, 2.75, n)
    mb.add((cone_v, cone_f), 'roof_cone', M((0, ry + 0.35, 0)), smooth=30)
    tip = ry + 0.35 + 2.75
    mb.add(prim_sphere(0.13, 0.13, 0.13, 8, 4), 'gold', M((0, tip - 0.05, 0)), smooth=60)
    mb.add(prim_cyl(0.035, 0.03, 1.05, 6), 'wood', M((0, tip, 0)))
    mb.add(prim_cone(0.06, 0.16, 6), 'gold', M((0, tip + 1.05, 0)))
    # seteiras e uma janela
    for a_deg in (0, 45, 90):
        a = math.radians(a_deg)
        R = M(r=(0, -a_deg + 90, 0))
        mb.add(prim_box(0.13, 0.7, 0.2), 'dark', M((math.cos(a) * (TR - 0.02), 2.6, math.sin(a) * (TR - 0.02)),
                                                   (0, -a_deg + 90, 0)))
    window(mb, M((0, 0, 0), (0, 45, 0)), (0.0, 4.1, TR - 0.12), w=0.42, h=0.72, glow=True)
    return mb.build(mats, parent=root, location=(T, 0, T))


def build_keep(mats, root):
    mb = MeshBuilder('Keep')
    kw = 3.3
    h = 6.5
    mb.add(prim_box(kw + 0.4, 0.5, kw + 0.4, base=True), 'stone_dark', M((0, Y0, 0)), bevel=0.05)
    mb.add(prim_box(kw, h - Y0, kw, taper=(0.95, 0.95), base=True), 'stone', M((0, Y0, 0)), bevel=0.05)
    # cinta e consolas no topo
    mb.add(prim_box(kw + 0.35, 0.35, kw + 0.35, base=True), 'stone_light', M((0, h - 0.1, 0)), bevel=0.05)
    for rot in (0, 90, 180, 270):
        R = M(r=(0, rot, 0))
        merlon_row(mb, -kw / 2 - 0.05, kw / 2 + 0.05, kw / 2 + 0.05, h + 0.25, 4, size=(0.5, 0.5, 0.3), rot_y=rot)
    # telhado piramidal/cônico alto (8 lados)
    spire_v, spire_f = prim_cone(1.95, 2.7, 8, phase=math.pi / 8)
    mb.add((spire_v, spire_f), 'roof_cone', M((0, h + 0.2, 0)), smooth=0)
    tip = h + 0.2 + 2.7
    mb.add(prim_sphere(0.15, 0.15, 0.15, 8, 4), 'gold', M((0, tip - 0.05, 0)), smooth=60)
    mb.add(prim_cyl(0.04, 0.035, 1.1, 6), 'wood', M((0, tip, 0)))
    mb.add(prim_cone(0.07, 0.18, 6), 'gold', M((0, tip + 1.1, 0)))
    # lucarna (água-furtada) na frente do telhado
    mb.add(prim_box(0.6, 0.7, 0.9, base=True), 'stone_light', M((0, h + 0.3, 1.1)), bevel=0.03)
    mb.add(prim_box(0.72, 0.1, 1.0, base=True), 'roof', M((0, h + 1.0, 1.1)), bevel=0.02)
    window(mb, M(), (0, h + 0.4, 1.5), w=0.3, h=0.45, glow=True)
    # janelas (frente e lateral direita) e porta
    for rot in (0, 90):
        R = M(r=(0, rot, 0))
        for (x, y, glow) in ((-0.8, 4.6, True), (0.8, 4.6, False), (0.0, 3.0, True)):
            window(mb, R, (x, y, kw / 2 - 0.08), w=0.5, h=0.85, glow=glow)
    frame = prim_extrude(arch_poly(1.3, 2.0, Y0 + 0.5), 0.2, axis='z')
    mb.add(frame, 'stone_light', M((0, 0, kw / 2 + 0.02)), bevel=0.03)
    mb.add(prim_extrude(arch_poly(1.0, 1.8, Y0 + 0.5), 0.2, axis='z'), 'wood_door', M((0, 0, kw / 2 + 0.07)))
    # escada de acesso
    for i in range(3):
        mb.add(prim_box(1.6, 0.17, 0.4, base=True), 'stone_dark', M((0, Y0 + i * 0.17, kw / 2 + 0.95 - i * 0.3)),
               bevel=0.02)
    return mb.build(mats, parent=root, location=(0.9, 0, -1.4))


def build_hall(mats, root):
    """Salão com telhado de duas águas (cumeeira ao longo de z)."""
    mb = MeshBuilder('Hall')
    w, d, wh = 2.8, 3.8, 3.0
    mb.add(prim_box(w, wh - Y0, d, base=True), 'stone', M((0, Y0, 0)), bevel=0.04)
    rise = 1.7
    gable = [(-w / 2, 0.0), (w / 2, 0.0), (0.0, rise)]
    for sz in (1, -1):
        mb.add(prim_extrude(gable, 0.3, axis='z'), 'stone', M((0, wh, sz * (d / 2 - 0.15))), bevel=0.03)
    # águas do telhado (placas grossas com beiral)
    slope = math.degrees(math.atan2(rise, w / 2))
    L = math.hypot(w / 2, rise) + 0.35
    for sx in (-1, 1):
        mb.add(prim_box(L, 0.16, d + 0.5), 'roof',
               M((sx * (w / 4 + 0.08), wh + rise / 2 + 0.02, 0), (0, 0, -sx * slope)), bevel=0.03)
    mb.add(prim_box(0.18, 0.18, d + 0.6), 'stone_light', M((0, wh + rise + 0.07, 0), (0, 0, 45)))
    # chaminé
    mb.add(prim_box(0.55, 1.5, 0.55, base=True), 'stone', M((-0.6, wh + 0.5, -0.9)), bevel=0.04)
    mb.add(prim_box(0.7, 0.16, 0.7, base=True), 'stone_light', M((-0.6, wh + 2.0, -0.9)), bevel=0.03)
    # janelas: frente (empena) e lado de fora
    window(mb, M(), (0, wh + 0.25, d / 2 + 0.02), w=0.5, h=0.8, glow=True)
    window(mb, M(), (-0.7, 1.3, d / 2 - 0.06), w=0.45, h=0.9, glow=False)
    window(mb, M(), (0.7, 1.3, d / 2 - 0.06), w=0.45, h=0.9, glow=True)
    for zz in (-1.0, 0.8):
        window(mb, M(r=(0, 90, 0)), (zz * -1, 1.5, w / 2 - 0.06), w=0.45, h=0.9, glow=zz > 0)
    return mb.build(mats, parent=root, location=(-2.05, 0, -1.25))


def build_props(mats, root):
    """Madeira e vida no pátio: telheiro, barris, caixotes."""
    mb = MeshBuilder('Props')
    # telheiro de madeira encostado na muralha direita
    x0, z0 = 2.6, 1.6
    for dz in (-1.1, 1.1):
        mb.add(prim_box(0.16, 1.9, 0.16, base=True), 'wood', M((x0 - 0.5, Y0, z0 + dz)), bevel=0.02)
    mb.add(prim_box(1.6, 0.1, 2.8), 'wood', M((x0 + 0.1, Y0 + 2.05, z0), (0, 0, -18)), bevel=0.02)
    # barris
    for (bx, bz) in ((x0 + 0.1, z0 - 0.6), (x0 + 0.2, z0 + 0.25), (x0 - 0.45, z0 - 0.2)):
        mb.add(prim_rings([ring_h(0.0, 0.26, 0.26, 8), ring_h(0.3, 0.31, 0.31, 8), ring_h(0.6, 0.26, 0.26, 8)]),
               'wood', M((bx, Y0, bz)), smooth=50)
        for y in (0.12, 0.48):
            mb.add(prim_cyl(0.3, 0.3, 0.05, 8), 'iron', M((bx, Y0 + y, bz)))
    # caixotes perto do salão
    for (cx, cz, s, r) in ((-1.9, 1.3, 0.55, 10), (-1.35, 1.45, 0.45, -15), (-1.7, 1.35, 0.4, 30)):
        y = Y0 if s > 0.41 else Y0 + 0.55
        mb.add(prim_box(s, s, s, base=True), 'wood', M((cx, y, cz), (0, r, 0)), bevel=0.03)
    # poço no pátio
    mb.add(prim_rings([ring_h(0.0, 0.55, 0.55, 10), ring_h(0.5, 0.55, 0.55, 10)], cap1=False), 'stone_round',
           M((-0.9, Y0, 2.6)), smooth=40)
    mb.add(prim_cyl(0.45, 0.45, 0.05, 10), 'dark', M((-0.9, Y0 + 0.4, 2.6)))
    for sx in (-1, 1):
        mb.add(prim_box(0.1, 1.0, 0.1, base=True), 'wood', M((-0.9 + sx * 0.5, Y0 + 0.5, 2.6)))
    mb.add(prim_box(1.25, 0.08, 0.9), 'roof', M((-0.9, Y0 + 1.55, 2.6), (0, 0, 0)), bevel=0.02)
    return mb.build(mats, parent=root)


def swallowtail(w, h, notch=0.35):
    return [(-w / 2, 0.0), (w / 2, 0.0), (w / 2, -h), (0.0, -h + notch), (-w / 2, -h)]


def pennant(length, h):
    return [(0.0, h / 2), (length, h * 0.15), (length * 0.8, 0.0), (length, -h * 0.15), (0.0, -h / 2)]


def build_banners(mats, root):
    mb = MeshBuilder('Anim_Banners')
    z = T + 0.15 + 1.7 / 2 + 0.3
    for sx in (-1, 1):
        verts, faces = prim_extrude(swallowtail(0.85, 2.3), 0.05, axis='z')
        verts = [(x, y, zz + 0.05 * math.sin(y * 2.5 + x)) for (x, y, zz) in verts]
        mb.add((verts, faces), 'team', M((sx * 1.1, 4.55, z)), smooth=30)
    # bandeiras nos mastros (todas ao vento para +x)
    tower_tips = []
    tip = 5.3 + 0.35 + 0.35 + 2.75
    for (sx, sz) in ((1, 1), (-1, 1), (1, -1), (-1, -1)):
        tower_tips.append((sx * T, tip + 0.75, sz * T, 0.9, 0.5))
    tower_tips.append((0.9, 6.5 + 0.2 + 2.7 + 0.8, -1.4, 1.3, 0.7))
    for (x, y, zz, L, H) in tower_tips:
        verts, faces = prim_extrude(pennant(L, H), 0.04, axis='z')
        verts = [(vx, vy, vz + 0.1 * math.sin(vx * 5.0)) for (vx, vy, vz) in verts]
        mb.add((verts, faces), 'team', M((x + 0.03, y, zz)), smooth=40)
    return mb.build(mats, parent=root)


def build_emblems(mats, root):
    """Brasões dourados sobre os estandartes do portão (parte estática)."""
    mb = MeshBuilder('Emblems')
    z = T + 0.15 + 1.7 / 2 + 0.3 + 0.06
    for sx in (-1, 1):
        diamond = [(0, 0.28), (0.2, 0), (0, -0.28), (-0.2, 0)]
        mb.add(prim_extrude(diamond, 0.05, axis='z'), 'gold', M((sx * 1.1, 3.75, z)), bevel=0.015)
        crown = [(-0.2, 0), (0.2, 0), (0.22, 0.2), (0.1, 0.1), (0, 0.24), (-0.1, 0.1), (-0.22, 0.2)]
        mb.add(prim_extrude(crown, 0.05, axis='z'), 'gold', M((sx * 1.1, 4.12, z)), bevel=0.01)
    return mb.build(mats, parent=root)


def main():
    args = C.script_args()
    C.reset_scene()
    mats = C.make_paint_set(PALETTE)
    root = C.make_empty('Castle')
    base = build_base(mats, root)
    walls = build_walls(mats, root)
    gate = build_gatehouse(mats, root)
    tower = build_tower(mats, root)
    keep = build_keep(mats, root)
    hall = build_hall(mats, root)
    props = build_props(mats, root)
    emblems = build_emblems(mats, root)
    banners = build_banners(mats, root)
    bake_set = [base, walls, gate, tower, keep, hall, props, emblems, banners]
    bpy.context.view_layer.update()

    C.uv_atlas(bake_set, weights={'Tower': 1.35, 'Keep': 1.15, 'Gatehouse': 1.25, 'Hall': 1.0, 'Walls': 0.9,
                                  'Base': 0.55, 'Props': 0.8, 'Anim_Banners': 1.1, 'Emblems': 1.0},
               margin=0.004, angle=50.0)
    # torres "fantasma" nos outros cantos só para o AO do bake ficar correto
    ghosts = []
    for k in (1, 2, 3):
        g = tower.copy()
        g.data = tower.data
        bpy.context.scene.collection.objects.link(g)
        g.matrix_world = C.game_to_blender_matrix(M(r=(0, 90 * k, 0))) @ tower.matrix_world
        ghosts.append(g)
    img = C.bake_atlas(bake_set, 'castle_atlas', int(os.environ.get('ATLAS', 1024)),
                       samples=int(os.environ.get('BAKE_SAMPLES', 32)), margin=6)
    for g in ghosts:
        bpy.data.objects.remove(g)
    C.finalize_materials(bake_set, img, team_default=TEAM_DEFAULT,
                         out_png=os.path.join(C.BUILD_DIR, 'castle_atlas.png'))
    # instancia a torre nos 4 cantos (mesmas UVs) e junta tudo por material
    copies = []
    for k in (1, 2, 3):
        cp = tower.copy()
        cp.data = tower.data.copy()
        bpy.context.scene.collection.objects.link(cp)
        cp.matrix_world = C.game_to_blender_matrix(M(r=(0, 90 * k, 0))) @ tower.matrix_world
        copies.append(cp)
    static = C.join_objects([base, walls, gate, tower, keep, hall, props, emblems] + copies, 'Static_Mesh')
    static.parent = root
    C.make_empty('Socket_UnitSpawn', (0, 0, 6.4), parent=root)
    C.make_empty('Socket_Rally', (0, 0, 8.5), parent=root)
    bpy.context.view_layer.update()

    out = os.path.join(C.OUT_MODELS, 'castle.glb')
    C.export_glb(root, out)
    print('STATS castle', C.stats(root, out))
    if '--no-render' not in args:
        rig = C.RenderRig(root, 'castle', res=int(os.environ.get('RENDER_RES', 800)), samples=24)
        rig.render('34', (1.0, 0.95, 1.0), 30)
        rig.render('front', (0.0, 0.35, 1.0), 30)
        rig.render('game', (45, 44, 45), 30, dist=78)
        C.set_team_color('#d23a2c')
        rig.render('34_vermelho', (1.0, 0.95, 1.0), 30)


main()
