"""
build_stable.py — Estábulo Real (tipo interno `stable`) gerado 100% por script.

Uso:
  blender -b --factory-startup --python tools/blender/build_stable.py -- [--no-render]

Saída (public/models/stable.glb), coordenadas do jogo, origem no centro da base, frente = +Z:
  Stable (raiz)
  ├─ Static_Mesh       pedra, madeira, reboco, telhado, feno, cavalos (1 material: Atlas)
  ├─ Anim_Banners      bandeirolas e manta do celeiro (material TeamColor)
  ├─ Socket_UnitSpawn  saída das unidades (frente do portão central)
  └─ Socket_Rally      ponto de reunião padrão
Pegada ~7.3 x 7.3 (raio de colisão 3.6), altura ~5.9.
Celeiro de empena frontal: baias com meias-portas e cavalos espiando, portão central aberto, sótão de
feno com talha, telhado azul com cumeeira dourada e cúpula com cata-vento; pátio com cocho, cerca,
fardos, rack de sela, lanternas e mastros com bandeirolas em cor de time.
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
from bld_common import beam, tube, log, horse_head, bbox_game  # noqa: E402

TEAM_DEFAULT = '#3a66d6'
Y0 = 0.30          # topo do embasamento
FT = 0.80          # topo do pé de pedra das paredes
WT = 3.30          # topo das paredes (beiral)
RISE = 1.50        # altura da empena
BX = 3.10          # meia-largura do celeiro
BZ0, BZ1 = -3.20, 1.20   # fundo e frente do celeiro

STONE = dict(base='#a8a196', var='#8c867b', var_scale=0.35, var_amt=0.8, fine=0.06,
             pattern='bricks', mapping='box', pw=0.62, ph=0.3, mortar='#5a544b', mortar_size=0.03,
             brick_tint='#c2b193', brick_tint_amt=0.5, brick_dark=0.8, brick_lite=1.1,
             grad=(0.0, 5.0, 0.28), top=0.18, edge='#e2ddd0', edge_amt=0.45, edge_r=0.06, edge_gain=7.0,
             ao=(1.3, 0.75), ao_pow=1.3)
PALETTE = {
    'stone': STONE,
    'stone_dark': dict(STONE, base='#86827a', var='#6f6b64', pw=1.3, ph=0.4, brick_tint='#9a907e',
                       grad=(0.0, 1.0, 0.25)),
    'stone_light': dict(STONE, base='#cfc8b8', var='#b9b1a0', pattern=None, edge_amt=0.6),
    'paving': dict(STONE, base='#a39d90', var='#8b857a', pw=0.9, ph=0.9, mortar='#6a655b',
                   brick_tint='#b3a892', grad=None, ao=(1.6, 0.85)),
    'plaster': dict(base='#e0d5ba', var='#c9bc9d', var_scale=1.2, var_amt=0.7, fine=0.07, top=0.18,
                    edge='#f4ecd8', edge_amt=0.35, edge_r=0.04, ao=(0.9, 0.7), grad=(0.6, 3.6, 0.12)),
    'roof': dict(base='#3f6fc4', var='#2d5aa6', var_scale=0.5, var_amt=0.7, fine=0.05,
                 pattern='shingles', mapping='box', pw=0.4, ph=0.28, mortar='#1d3160',
                 brick_tint='#6390de', brick_tint_amt=0.4, brick_dark=0.82, brick_lite=1.12, top=0.2,
                 edge='#a9c4f2', edge_amt=0.5, edge_r=0.05, ao=(1.0, 0.6)),
    'roof_cone': dict(base='#3f6fc4', var='#2d5aa6', var_scale=0.5, var_amt=0.7, fine=0.05,
                      pattern='shingles', mapping='cyl', cyl_radius=0.5, pw=0.3, ph=0.22,
                      mortar='#1d3160', brick_tint='#6390de', brick_tint_amt=0.4, brick_dark=0.82,
                      brick_lite=1.12, top=0.2, edge='#a9c4f2', edge_amt=0.5, edge_r=0.04, ao=(0.8, 0.5)),
    'wood': dict(base='#80572f', var='#6a4526', var_scale=1.5, fine=0.08, pattern='planks', mapping='box',
                 pw=2.2, ph=0.22, mortar='#3a2615', top=0.15, edge='#b08050', edge_amt=0.4, edge_r=0.03,
                 ao=(0.8, 0.7)),
    'wood_beam': dict(base='#5a3c22', var='#45301a', var_scale=2.0, fine=0.09, top=0.15, edge='#8a6a44',
                      edge_amt=0.4, edge_r=0.025, ao=(0.6, 0.6)),
    'wood_door': dict(base='#6b4424', var='#58371c', var_scale=1.5, fine=0.08, pattern='planks_v', mapping='box',
                      pw=3.0, ph=0.26, mortar='#2c1c10', top=0.1, edge='#9a6d42', edge_amt=0.35, edge_r=0.03,
                      ao=(0.8, 0.8)),
    'iron': dict(base='#41444c', var='#34373e', var_scale=3.0, fine=0.08, top=0.3, edge='#aab0bb',
                 edge_amt=0.8, edge_r=0.02, ao=(0.5, 0.5)),
    'gold': dict(base='#d9a63a', var='#b98524', var_scale=4.0, fine=0.06, top=0.3, edge='#fff0b8',
                 edge_amt=0.8, edge_r=0.02, ao=(0.4, 0.4)),
    'dark': dict(base='#231f26', var='#17151b'),
    'glow': dict(base='#ffc86a', var='#ffab45', var_scale=3.0, emit_boost=1.3),
    'hay': dict(base='#dcb84e', var='#b8912f', var_scale=6.0, var_amt=0.8, fine=0.14, top=0.25,
                pattern='planks', mapping='box', pw=0.5, ph=0.05, mortar='#8a6a22', mortar_size=0.03,
                ao=(0.5, 0.6)),
    'rope': dict(base='#b49865', var='#8a7040', var_scale=10.0, fine=0.1, top=0.2),
    'leather': dict(base='#7a4a26', var='#5c3419', var_scale=6.0, fine=0.12, top=0.2, edge='#b07a48',
                    edge_amt=0.5, edge_r=0.02, ao=(0.25, 0.6)),
    'water': dict(base='#5d94c9', var='#3f78b0', var_scale=3.0, top=0.35),
    'coat': dict(base='#94562f', var='#6b3a1e', var_scale=7.0, var_amt=0.65, fine=0.05, top=0.3, ao=(0.3, 0.55)),
    'mane': dict(base='#1f140d', var='#3a2516', var_scale=10.0, var_amt=0.8, fine=0.1, top=0.35),
    'muzzle': dict(base='#3a2a22', var='#2a1d17', var_scale=10.0, fine=0.05, top=0.3),
    'blaze': dict(base='#efe8da', var='#d8cfbd', var_scale=9.0, fine=0.03, top=0.3),
    'iris': dict(base='#4a2c14', var='#2c190b', var_scale=25.0),
    'team': dict(base='#bab2a6', var='#a0988c', var_scale=2.0, fine=0.08, top=0.2, edge='#dcd6cc',
                 edge_amt=0.3, edge_r=0.03, ao=(0.8, 0.6), team=True),
}


def arch_poly(w, h, y0=0.0, segs=8):
    r = w / 2
    spring = y0 + h - r
    pts = [(r, y0)]
    for i in range(segs + 1):
        a = math.pi * i / segs
        pts.append((r * math.cos(a), spring + r * math.sin(a)))
    pts.append((-r, y0))
    return pts


def build_base(mats, root):
    mb = MeshBuilder('Base')
    mb.add(prim_box(7.3, Y0, 7.3, taper=(0.975, 0.975), base=True), 'stone_dark', bevel=0.07)
    mb.add(prim_box(7.0, 0.04, 7.0, base=True), 'paving', M((0, Y0, 0)))
    # rampa/degrau na frente do portão
    mb.add(prim_box(1.9, 0.12, 0.6, base=True), 'stone_dark', M((0, Y0, BZ1 + 0.8)), bevel=0.03)
    return mb.build(mats, parent=root)


def build_barn(mats, root):
    mb = MeshBuilder('Barn')
    cz = (BZ0 + BZ1) / 2
    depth = BZ1 - BZ0
    H = WT - FT
    # pé de pedra
    mb.add(prim_box(2 * BX + 0.3, FT - Y0, depth + 0.3, taper=(0.985, 0.985), base=True), 'stone', M((0, Y0, cz)), bevel=0.05)
    mb.add(prim_box(2 * BX + 0.4, 0.1, depth + 0.4, base=True), 'stone_light', M((0, FT - 0.1, cz)), bevel=0.03)
    # paredes de reboco: fundo, laterais; interior escuro atrás das baias
    mb.add(prim_box(2 * BX - 0.1, H, 0.3, base=True), 'plaster', M((0, FT, BZ0 + 0.15)), bevel=0.02)
    for sx in (-1, 1):
        mb.add(prim_box(0.3, H, depth - 0.1, base=True), 'plaster', M((sx * (BX - 0.15), FT, cz)), bevel=0.02)
    mb.add(prim_box(2 * BX - 0.6, H, 0.1, base=True), 'dark', M((0, FT, BZ1 - 0.45)))
    # frente: pilares com viga de madeira, padieira, meias-portas
    for x, w in ((-2.85, 0.65), (-1.0, 0.5), (1.0, 0.5), (2.85, 0.65)):
        mb.add(prim_box(w, H, 0.5, base=True), 'plaster', M((x, FT, BZ1 - 0.2)), bevel=0.02)
        mb.add(prim_box(w * 0.5, H, 0.56, base=True), 'wood_beam', M((x, FT, BZ1 - 0.2)), bevel=0.02)
    mb.add(prim_box(2 * BX + 0.2, 0.42, 0.56), 'wood_beam', M((0, WT - 0.21, BZ1 - 0.2)), bevel=0.03)
    mb.add(prim_box(2 * BX + 0.3, 0.12, 0.5), 'wood_beam', M((0, FT + 0.06, BZ1 - 0.2)), bevel=0.02)
    # madeiramento aparente nas laterais: peitoril, viga superior, prumos e escoras em X
    for sx in (-1, 1):
        x = sx * (BX + 0.03)
        beam(mb, (x, FT + 0.12, BZ0 + 0.2), (x, FT + 0.12, BZ1 - 0.5), 0.12, 0.10, 'wood_beam')
        beam(mb, (x, WT - 0.1, BZ0 + 0.1), (x, WT - 0.1, BZ1 - 0.4), 0.14, 0.10, 'wood_beam')
        for z in (BZ0 + 0.2, (BZ0 + BZ1) / 2 - 0.9, (BZ0 + BZ1) / 2 + 0.6, BZ1 - 0.5):
            beam(mb, (x, FT, z), (x, WT, z), 0.14, 0.10, 'wood_beam')
        for (za, zb) in ((BZ0 + 0.2, (BZ0 + BZ1) / 2 - 0.9), ((BZ0 + BZ1) / 2 + 0.6, BZ1 - 0.5)):
            beam(mb, (x, FT + 0.12, za), (x, WT - 0.1, zb), 0.1, 0.09, 'wood_beam')
        # janela com venezianas
        wz = (BZ0 + BZ1) / 2 - 0.15
        mb.add(prim_box(0.06, 0.8, 0.6), 'dark', M((x + sx * 0.02, 1.95, wz)))
        mb.add(prim_box(0.08, 0.06, 0.74), 'wood_beam', M((x + sx * 0.03, 1.55, wz)))
        mb.add(prim_box(0.08, 0.06, 0.74), 'wood_beam', M((x + sx * 0.03, 2.35, wz)))
        for dz in (-0.34, 0.34):
            mb.add(prim_box(0.05, 0.86, 0.22), 'wood', M((x + sx * 0.06, 1.95, wz + dz)), bevel=0.01)
    # empena frontal (triângulo de reboco com vigas) + sótão de feno
    gable = [(-BX, 0.0), (BX, 0.0), (0.0, RISE)]
    mb.add(prim_extrude(gable, 0.36, axis='z'), 'plaster', M((0, WT, BZ1 - 0.22)), bevel=0.02)
    zf = BZ1 - 0.02
    beam(mb, (-BX - 0.1, WT, zf), (0.0, WT + RISE + 0.08, zf), 0.17, 0.12, 'wood_beam')
    beam(mb, (BX + 0.1, WT, zf), (0.0, WT + RISE + 0.08, zf), 0.17, 0.12, 'wood_beam')
    beam(mb, (-BX * 0.52, WT + RISE * 0.48, zf), (BX * 0.52, WT + RISE * 0.48, zf), 0.12, 0.1, 'wood_beam')
    for sx in (-1, 1):
        beam(mb, (sx * 1.6, WT, zf), (sx * 0.42, WT + RISE * 0.62, zf), 0.1, 0.09, 'wood_beam')
    hl_y = WT + 0.32
    mb.add(prim_extrude(arch_poly(1.05, 1.15, hl_y), 0.14, axis='z'), 'wood_beam', M((0, 0, zf + 0.03)))
    mb.add(prim_extrude(arch_poly(0.85, 1.0, hl_y + 0.04), 0.12, axis='z'), 'dark', M((0, 0, zf + 0.08)))
    mb.add(prim_box(0.78, 0.22, 0.4), 'hay', M((0, hl_y + 0.15, zf + 0.15)), bevel=0.02)
    mb.add(prim_box(0.4, 0.22, 0.3), 'hay', M((-0.15, hl_y + 0.35, zf + 0.05), (0, 15, 0)))
    # empena traseira + madeiramento do fundo
    mb.add(prim_extrude(gable, 0.36, axis='z'), 'plaster', M((0, WT, BZ0 + 0.22)), bevel=0.02)
    zb = BZ0 - 0.03
    beam(mb, (-BX - 0.1, WT, zb), (0.0, WT + RISE + 0.08, zb), 0.17, 0.12, 'wood_beam')
    beam(mb, (BX + 0.1, WT, zb), (0.0, WT + RISE + 0.08, zb), 0.17, 0.12, 'wood_beam')
    beam(mb, (-BX * 0.52, WT + RISE * 0.48, zb), (BX * 0.52, WT + RISE * 0.48, zb), 0.12, 0.1, 'wood_beam')
    beam(mb, (0.0, WT, zb), (0.0, WT + RISE * 0.9, zb), 0.12, 0.1, 'wood_beam')
    beam(mb, (-BX, FT + 0.12, zb), (BX, FT + 0.12, zb), 0.12, 0.1, 'wood_beam')
    beam(mb, (-BX, WT - 0.1, zb), (BX, WT - 0.1, zb), 0.14, 0.1, 'wood_beam')
    for x in (-BX + 0.1, -1.6, 1.6, BX - 0.1):
        beam(mb, (x, FT, zb), (x, WT, zb), 0.14, 0.1, 'wood_beam')
    for sx in (-1, 1):
        beam(mb, (sx * 1.6, FT + 0.12, zb), (sx * BX, WT - 0.1, zb), 0.1, 0.09, 'wood_beam')
        mb.add(prim_box(0.6, 0.8, 0.06), 'dark', M((sx * 0.8, 1.95, zb - 0.0)))
        for dx in (-0.34, 0.34):
            mb.add(prim_box(0.22, 0.86, 0.05), 'wood', M((sx * 0.8 + dx, 1.95, zb - 0.06)), bevel=0.01)
    # talha (viga + polia + corda + gancho)
    mb.add(prim_box(0.16, 0.16, 1.15), 'wood_beam', M((0, WT + RISE - 0.15, zf + 0.35)), bevel=0.02)
    mb.add(prim_cyl(0.13, 0.13, 0.05, 10, base=False), 'iron', M((0, WT + RISE - 0.36, zf + 0.85), (0, 0, 90)))
    log(mb, (0, WT + RISE - 0.40, zf + 0.85), (0, WT + 0.75, zf + 0.85), 0.018, 'rope', n=5)
    mb.add(prim_box(0.05, 0.11, 0.05), 'iron', M((0, WT + 0.70, zf + 0.85)))
    # portas: meias-portas nas baias laterais, portão central aberto
    for sx in (-1, 1):
        x = sx * 1.95
        mb.add(prim_box(1.40, 1.05, 0.1, base=True), 'wood_door', M((x, FT + 0.1, BZ1 - 0.05)), bevel=0.02)
        mb.add(prim_box(1.42, 0.08, 0.14), 'wood_beam', M((x, FT + 1.17, BZ1 - 0.05)), bevel=0.015)
        mb.add(prim_box(0.12, 0.08, 0.1), 'iron', M((x - sx * 0.55, FT + 0.75, BZ1 + 0.03)))
        beam(mb, (x - 0.65, FT + 0.35, BZ1 + 0.02), (x + 0.65, FT + 0.95, BZ1 + 0.02), 0.07, 0.04, 'wood_beam')
    for sx in (-1, 1):   # folhas do portão central, abertas para fora
        hx = sx * 0.78
        yaw = -90.0 - 20.0 * sx
        leaf = Vector((-sx * math.cos(math.radians(70)), 0, math.sin(math.radians(70)))) * 0.38
        mb.add(prim_box(0.76, 2.25, 0.09, base=True), 'wood_door', M((hx + leaf.x, FT + 0.05, BZ1 - 0.1 + leaf.z), (0, yaw, 0)),
               bevel=0.02)
        for y in (0.45, 1.6):
            mb.add(prim_box(0.76, 0.07, 0.12), 'iron', M((hx + leaf.x, FT + y, BZ1 - 0.1 + leaf.z), (0, yaw, 0)))
    # piso/feno nos corredores e ferradura dourada sobre o portão
    mb.add(prim_box(1.4, 0.05, 1.0, base=True), 'hay', M((0, FT, BZ1 - 0.8)))
    hs = []
    for i in range(9):
        a = math.radians(-50 + 100 * i / 8)
        hs.append((0.22 * math.sin(a), 0.22 * math.cos(a) * 1.05))
    shoe_poly = [(x, y) for x, y in hs] + [(0.15 * math.sin(math.radians(-50 + 100 * (8 - i) / 8)),
                                            0.15 * math.cos(math.radians(-50 + 100 * (8 - i) / 8)) * 1.05) for i in range(9)]
    mb.add(prim_extrude(shoe_poly, 0.05, axis='z'), 'gold', M((0, WT - 0.56, BZ1 + 0.1), (0, 0, 180)), bevel=0.008)
    # lanternas nos pilares
    for sx in (-1, 1):
        x = sx * 1.0
        mb.add(prim_box(0.05, 0.05, 0.3), 'iron', M((x, FT + 1.75, BZ1 + 0.3)))
        mb.add(prim_box(0.16, 0.22, 0.16), 'glow', M((x, FT + 1.5, BZ1 + 0.42)), bevel=0.01)
        mb.add(prim_box(0.2, 0.05, 0.2), 'iron', M((x, FT + 1.64, BZ1 + 0.42)))
        mb.add(prim_box(0.2, 0.04, 0.2), 'iron', M((x, FT + 1.37, BZ1 + 0.42)))
    return mb.build(mats, parent=root)


def build_roof(mats, root):
    mb = MeshBuilder('Roof')
    ov = 0.5                         # beiral lateral
    run = BX + ov
    rise = RISE * run / BX
    zc = (BZ0 - 0.45 + BZ1 + 0.65) / 2
    zl = (BZ1 + 0.65) - (BZ0 - 0.45)
    ang = math.degrees(math.atan2(rise, run))
    L = math.hypot(run, rise)
    ridge_y = WT - ov * RISE / BX + rise
    for sx in (-1, 1):
        mid = Vector((sx * run / 2, ridge_y - rise / 2, zc))
        n = Vector((sx * math.sin(math.radians(ang)), math.cos(math.radians(ang)), 0)) * 0.08
        mb.add(prim_box(L, 0.16, zl), 'roof', M(tuple(mid + n), (0, 0, -sx * ang)), bevel=0.03)
    mb.add(prim_box(0.3, 0.2, zl - 0.7), 'gold', M((0, ridge_y + 0.14, zc - 0.35), (0, 0, 45)), bevel=0.02)
    # cúpula de ventilação com cata-vento
    cz = -1.2
    cy = ridge_y + 0.08
    mb.add(prim_box(0.85, 0.34, 0.85, taper=(0.9, 0.9), base=True), 'wood', M((0, cy, cz)), bevel=0.02)
    for a in (0, 90, 180, 270):
        R = M(r=(0, a, 0))
        mb.add(prim_box(0.3, 0.2, 0.04), 'dark', R @ M((0, cy + 0.07, 0.41)))
    mb.add(prim_box(1.0, 0.06, 1.0), 'wood_beam', M((0, cy + 0.34, cz)), bevel=0.01)
    mb.add(prim_cone(0.72, 0.42, 4, base=True, phase=math.pi / 4), 'roof_cone', M((0, cy + 0.37, cz)), smooth=0)
    mb.add(prim_sphere(0.07, 0.07, 0.07, 6, 3), 'gold', M((0, cy + 0.79, cz)), smooth=60)
    log(mb, (0, cy + 0.79, cz), (0, cy + 1.1, cz), 0.022, 'iron', n=5)
    horse = [(-0.3, -0.06), (-0.22, 0.02), (-0.06, 0.0), (0.02, 0.12), (0.12, 0.2), (0.22, 0.17), (0.3, 0.06), (0.22, 0.0),
             (0.15, -0.05), (0.14, -0.22), (0.09, -0.22), (0.07, -0.08), (-0.1, -0.08), (-0.14, -0.22), (-0.19, -0.22),
             (-0.2, -0.05)]
    mb.add(prim_extrude([(z * 0.85, y * 0.85) for z, y in horse], 0.03, axis='x'), 'gold', M((0, cy + 1.0, cz)))
    return mb.build(mats, parent=root)


def hay_bale(mb, x, y, z, rot=0.0, s=1.0):
    mb.add(prim_box(0.9 * s, 0.45 * s, 0.5 * s, base=True), 'hay', M((x, y, z), (0, rot, 0)), bevel=0.03)
    for dx in (-0.25, 0.25):
        mb.add(prim_box(0.045 * s, 0.47 * s, 0.52 * s, base=True), 'rope', M((x, y, z), (0, rot, 0)) @ M((dx * s, 0, 0)))


def build_props(mats, root):
    mb = MeshBuilder('Props')
    Z = BZ1 + 0.3
    # cocho com água (esquerda) e cerca do piquete
    mb.add(prim_box(1.9, 0.55, 0.65, taper=(0.95, 0.9), base=True), 'wood', M((-2.2, Y0, 2.85)), bevel=0.03)
    mb.add(prim_box(1.66, 0.04, 0.45), 'water', M((-2.2, Y0 + 0.5, 2.85)))
    for sx in (-1, 1):
        mb.add(prim_box(0.12, 0.42, 0.55, base=True), 'wood_beam', M((-2.2 + sx * 0.75, Y0, 2.85)))
    for x in (-3.4, -2.3, -1.2, -0.3):
        mb.add(prim_box(0.14, 1.15, 0.14, taper=(0.8, 0.8), base=True), 'wood_beam', M((x, Y0, 3.45)), bevel=0.02)
    beam(mb, (-3.4, Y0 + 0.95, 3.45), (-0.3, Y0 + 0.95, 3.45), 0.1, 0.07, 'wood')
    beam(mb, (-3.4, Y0 + 0.55, 3.45), (-0.3, Y0 + 0.55, 3.45), 0.1, 0.07, 'wood')
    for z in (2.0, 2.75):
        pass
    beam(mb, (-3.4, Y0 + 0.95, 3.45), (-3.4, Y0 + 0.95, 2.0), 0.1, 0.07, 'wood')
    beam(mb, (-3.4, Y0 + 0.55, 3.45), (-3.4, Y0 + 0.55, 2.0), 0.1, 0.07, 'wood')
    for z in (2.0, 2.7):
        mb.add(prim_box(0.14, 1.15, 0.14, taper=(0.8, 0.8), base=True), 'wood_beam', M((-3.4, Y0, z)), bevel=0.02)
    # fardos de feno e monte (direita)
    hay_bale(mb, 2.45, Y0, 2.15, 10)
    hay_bale(mb, 3.0, Y0, 2.35, -15)
    hay_bale(mb, 2.7, Y0 + 0.45, 2.2, 25, 0.95)
    hay_bale(mb, 2.2, Y0, 2.95, -8, 0.9)
    mb.add(prim_cone(0.55, 0.65, 8, base=True), 'hay', M((1.85, Y0, 3.05)), smooth=30)
    # rack de sela com sela de couro
    for sx in (-1, 1):
        mb.add(prim_box(0.1, 1.1, 0.1, base=True), 'wood_beam', M((0.55 + sx * 0.4, Y0, 3.0)), bevel=0.015)
    beam(mb, (0.15, Y0 + 1.0, 3.0), (0.95, Y0 + 1.0, 3.0), 0.09, 0.09, 'wood')
    mb.add(prim_box(0.32, 0.1, 0.5, taper=(0.8, 0.9)), 'leather', M((0.55, Y0 + 1.15, 3.0)), bevel=0.02)
    mb.add(prim_box(0.3, 0.14, 0.08), 'leather', M((0.55, Y0 + 1.25, 2.77)), bevel=0.01)
    mb.add(prim_box(0.3, 0.16, 0.08), 'leather', M((0.55, Y0 + 1.25, 3.24)), bevel=0.01)
    mb.add(prim_box(0.1, 0.4, 0.22), 'leather', M((0.36, Y0 + 0.88, 3.0)))
    mb.add(prim_box(0.1, 0.4, 0.22), 'leather', M((0.74, Y0 + 0.88, 3.0)))
    # barris e balde
    for (bx, bz) in ((-3.05, 1.55), (-2.55, 1.75)):
        mb.add(prim_rings([ring_h(0.0, 0.26, 0.26, 8), ring_h(0.3, 0.31, 0.31, 8), ring_h(0.6, 0.26, 0.26, 8)]),
               'wood', M((bx, Y0, bz)), smooth=50)
        for y in (0.12, 0.48):
            mb.add(prim_cyl(0.3, 0.3, 0.05, 8), 'iron', M((bx, Y0 + y, bz)))
    mb.add(prim_cyl(0.17, 0.14, 0.26, 8), 'wood', M((3.05, Y0, 1.6)), smooth=40)
    # mastros de bandeira nos cantos da frente (as bandeirolas ficam em Anim_Banners)
    for sx in (-1, 1):
        log(mb, (sx * 3.35, Y0, 3.25), (sx * 3.35, 5.0, 3.25), 0.06, 'wood', n=6)
        mb.add(prim_sphere(0.09, 0.09, 0.09, 6, 3), 'gold', M((sx * 3.35, 5.0, 3.25)), smooth=60)
        mb.add(prim_cone(0.07, 0.3, 5), 'gold', M((sx * 3.35, 5.06, 3.25)))
    # cavalos espiando nas baias laterais
    for sx in (-1, 1):
        T = M((sx * 1.95, FT + 0.95, BZ1 - 0.2), (0, sx * -16, 0))
        horse_head(mb, T, 1.15)
    return mb.build(mats, parent=root)


def build_banners(mats, root):
    mb = MeshBuilder('Anim_Banners')
    for sx in (-1, 1):
        pts = [(0.0, 0.0), (0.85, 0.0), (0.70, -0.22), (0.85, -0.44), (0.0, -0.44)]
        verts, faces = prim_extrude(pts, 0.04, axis='z')
        verts = [(sx * x, y, z + 0.1 * math.sin(x * 4.0 + sx)) for (x, y, z) in verts]
        mb.add((verts, faces), 'team', M((sx * 3.35 + sx * 0.03, 4.75, 3.25)), smooth=40)
    # manta azul pendurada sobre o peitoril da baia central (pendão sob a cumeeira)
    sw = [(-0.4, 0.0), (0.4, 0.0), (0.4, -1.0), (0.0, -0.75), (-0.4, -1.0)]
    verts, faces = prim_extrude(sw, 0.04, axis='z')
    verts = [(x, y, z + 0.04 * math.sin(y * 6.0)) for (x, y, z) in verts]
    mb.add((verts, faces), 'team', M((0, WT - 0.5, BZ1 + 0.1)), smooth=40)
    return mb.build(mats, parent=root)


def main():
    args = C.script_args()
    C.reset_scene()
    mats = C.make_paint_set(PALETTE)
    root = C.make_empty('Stable')
    base = build_base(mats, root)
    barn = build_barn(mats, root)
    roof = build_roof(mats, root)
    props = build_props(mats, root)
    banners = build_banners(mats, root)
    bake_set = [base, barn, roof, props, banners]
    bpy.context.view_layer.update()
    C.uv_atlas(bake_set, weights={'Base': 0.6, 'Barn': 1.0, 'Roof': 0.9, 'Props': 1.0, 'Anim_Banners': 1.0},
               margin=0.004, angle=50.0)
    img = C.bake_atlas(bake_set, 'stable_atlas', int(os.environ.get('ATLAS', 1024)),
                       samples=int(os.environ.get('BAKE_SAMPLES', 32)), margin=6)
    C.finalize_materials(bake_set, img, team_default=TEAM_DEFAULT,
                         out_png=os.path.join(C.BUILD_DIR, 'stable_atlas.png'))
    static = C.join_objects([base, barn, roof, props], 'Static_Mesh')
    static.parent = root
    C.make_empty('Socket_UnitSpawn', (0, 0, 4.6), parent=root)
    C.make_empty('Socket_Rally', (0, 0, 6.6), parent=root)
    bpy.context.view_layer.update()
    out = os.path.join(C.OUT_MODELS, 'stable.glb')
    C.export_glb(root, out)
    print('STATS stable', C.stats(root, out))
    print('BBOX', bbox_game(root))
    if '--no-render' not in args:
        rig = C.RenderRig(root, 'stable', res=int(os.environ.get('RENDER_RES', 800)), samples=24)
        rig.render('34', (1.0, 0.95, 1.0), 30)
        rig.render('front', (0.0, 0.35, 1.0), 30)
        rig.render('back', (-0.8, 0.8, -1.0), 30)
        rig.render('side', (1.0, 0.25, 0.0), 30)
        rig.render('game', (45, 44, 45), 30, dist=78)
        C.set_team_color('#d23a2c')
        rig.render('34_vermelho', (1.0, 0.95, 1.0), 30)


if __name__ == '__main__':
    main()
