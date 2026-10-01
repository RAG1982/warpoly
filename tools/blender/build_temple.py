"""
build_temple.py — Templo da Luz humano (tipo interno `temple`) gerado 100% por script.

Uso:
  blender -b --factory-startup --python tools/blender/build_temple.py -- [--no-render]

Saída (public/models/temple.glb), coordenadas do jogo, origem no centro da base, frente = +Z:
  Temple (raiz)
  ├─ Static_Mesh       capela cruciforme de mármore claro: plinto, escadaria, pórtico de 4 colunas, nave e transepto
  │                    de telhado azul, vitrais coloridos, rosácea, tambor octogonal com janelas, cúpula dourada,
  │                    lanterna e flecha com sol de ouro (Atlas; luz dos vitrais pintada)
  ├─ Anim_Banners      estandartes (material TeamColor)
  ├─ Socket_UnitSpawn  saída das unidades (frente da escadaria)
  └─ Socket_Rally      ponto de reunião padrão
Pegada ~6,7 x 7 (raio de colisão 3,4), altura ~9. 2 draw calls.
"""
import os
import sys
import math

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402
import common as C  # noqa: E402
from common import (MeshBuilder, M, prim_box, prim_rings, ring_h, prim_cyl, prim_cone,  # noqa: E402
                    prim_sphere, prim_extrude, limb_rings, bezier)
from bld_common import tube, log, bbox_game  # noqa: E402

TEAM_DEFAULT = '#3a66d6'
_orig_add = MeshBuilder.add


def _lean_add(self, prim, mat, m=None, bevel=0.0, **kw):
    """Orçamento de triângulos: bisel só em peças grandes (o desgaste de borda é pintado no bake)."""
    if bevel and len(prim[1]) <= 14 and bevel < 0.035:
        bevel = 0.0
    return _orig_add(self, prim, mat, m, bevel=bevel, **kw)


MeshBuilder.add = _lean_add

Y0 = 0.5            # topo do plinto
WALL = 3.5          # topo das paredes da nave
RIDGE = 5.1         # cumeeira da nave
OCT = math.pi / 8   # fase do octógono: faces em múltiplos de 45°

MARB = dict(base='#ece6d6', var='#cfc7b2', var_scale=0.5, var_amt=0.7, fine=0.05, pattern='bricks', mapping='box',
            pw=0.8, ph=0.4, mortar='#b0a78f', mortar_size=0.03, brick_tint='#f6f1e4', brick_tint_amt=0.5,
            brick_dark=0.85, brick_lite=1.08, grad=(0.0, 5.0, 0.22), top=0.25, edge='#ffffff', edge_amt=0.45,
            edge_r=0.06, edge_gain=7.0, ao=(1.2, 0.7), ao_pow=1.3)
PALETTE = {
    'marble': MARB,
    'marble_dark': dict(MARB, base='#c9c0aa', var='#a69d86', pw=1.2, ph=0.5, brick_tint='#d8cfba', mortar='#8c846e',
                        grad=(0.0, 1.0, 0.3)),
    'marble_light': dict(MARB, base='#f8f4ea', var='#e6dfcd', pattern=None, grad=None, edge_amt=0.6),
    'paving': dict(MARB, base='#d8d1bd', var='#bdb59f', pw=0.9, ph=0.9, mortar='#8f8770', brick_tint='#e8e1cf',
                   grad=None, ao=(1.4, 0.8)),
    'roof': dict(base='#3f6fc4', var='#2d5aa6', var_scale=0.5, var_amt=0.7, fine=0.05, pattern='shingles',
                 mapping='box', pw=0.3, ph=0.22, mortar='#1d3160', brick_tint='#6390de', brick_tint_amt=0.4,
                 brick_dark=0.82, brick_lite=1.12, top=0.3, edge='#a9c4f2', edge_amt=0.5, edge_r=0.04, ao=(0.8, 0.5)),
    'gold': dict(base='#f2b92c', var='#c48d1a', var_scale=4.0, fine=0.06, top=0.4, edge='#fff3c0', edge_amt=0.9,
                 edge_r=0.02, ao=(0.4, 0.4)),
    'dome': dict(base='#f6c235', var='#d39a1c', var_scale=0.5, var_amt=0.6, fine=0.05, pattern='shingles',
                 mapping='cyl', cyl_radius=1.2, pw=0.32, ph=0.24, mortar='#8e5f12', brick_tint='#ffe07a',
                 brick_tint_amt=0.5, brick_dark=0.8, brick_lite=1.12, top=0.5, edge='#fff6cc', edge_amt=0.7,
                 edge_r=0.04, ao=(0.7, 0.4)),
    'wood_door': dict(base='#7a4e28', var='#5e3a1c', var_scale=1.5, fine=0.08, pattern='planks_v', mapping='box', pw=3.0,
                      ph=0.26, mortar='#2c1c10', top=0.1, edge='#a67a48', edge_amt=0.35, edge_r=0.03, ao=(0.8, 0.8)),
    'lead': dict(base='#2c2e38', var='#1c1d26', var_scale=4.0, fine=0.05, top=0.2, ao=(0.3, 0.4)),
    'glass_b': dict(base='#3f86ff', var='#2a52d0', var_scale=10.0, var_amt=0.8, emit_boost=1.1),
    'glass_r': dict(base='#f0484a', var='#c42a3a', var_scale=10.0, var_amt=0.8, emit_boost=1.1),
    'glass_g': dict(base='#ffd44a', var='#ffaa20', var_scale=10.0, var_amt=0.8, emit_boost=1.2),
    'glass_c': dict(base='#46d8c0', var='#1fa8a0', var_scale=10.0, var_amt=0.8, emit_boost=1.1),
    'glow': dict(base='#fff4c0', var='#ffe080', var_scale=3.0, emit_boost=1.3),
    'moss': dict(base='#5f8a46', var='#3f6a2c', var_scale=6.0, var_amt=0.8, fine=0.14, top=0.3, ao=(0.3, 0.5)),
    'flower': dict(base='#fff0f4', var='#f4b3d0', var_scale=18.0, var_amt=0.9, top=0.3),
    'team': dict(base='#bab2a6', var='#a0988c', var_scale=2.0, fine=0.08, top=0.2, edge='#dcd6cc', edge_amt=0.3,
                 edge_r=0.03, ao=(0.8, 0.6), team=True),
}


def arch_poly(w, h, y0=0.0, segs=6):
    r = w / 2
    spring = y0 + h - r
    pts = [(r, y0)]
    for i in range(segs + 1):
        a = math.pi * i / segs
        pts.append((r * math.cos(a), spring + r * math.sin(a)))
    pts.append((-r, y0))
    return pts


def wall_T(x, z, yaw):
    """Origem no plano da parede; +z local aponta para fora da parede."""
    return M((x, 0, z), (0, yaw, 0))


def window(mb, T, y, w, h, pal=('glass_b', 'glass_r', 'glass_g')):
    """Vitral em arco: moldura de mármore claro, vidro azul, chumbo em cruz e losangos coloridos."""
    mb.add(prim_extrude(arch_poly(w + 0.26, h + 0.2, y - 0.1), 0.2, axis='z'), 'marble_light', T @ M((0, 0, 0.0)), bevel=0.015)
    mb.add(prim_extrude(arch_poly(w, h, y), 0.1, axis='z'), pal[0], T @ M((0, 0, 0.08)))
    cx = [(0, y + h * 0.3), (0, y + h * 0.58), (0, y + h * 0.8)]
    cols = (pal[1], pal[2], pal[1])
    for (dx, dy), c in zip(cx, cols):
        s = w * 0.2
        mb.add(prim_extrude([(0, s * 1.1), (s * 0.8, 0), (0, -s * 1.1), (-s * 0.8, 0)], 0.04, axis='z'), c,
               T @ M((dx, dy, 0.14)))
    mb.add(prim_box(0.045, h * 0.97, 0.05), 'lead', T @ M((0, y + h * 0.48, 0.15)))
    mb.add(prim_box(w, 0.045, 0.05), 'lead', T @ M((0, y + h * 0.5, 0.15)))
    mb.add(prim_box(w + 0.44, 0.1, 0.34), 'marble_light', T @ M((0, y - 0.1, 0.14)), bevel=0.01)


def column(mb, x, z, y_top, r=0.15):
    mb.add(prim_box(0.42, 0.14, 0.42, base=True), 'marble_dark', M((x, Y0, z)), bevel=0.02)
    mb.add(prim_cyl(r, r * 0.88, y_top - Y0 - 0.3, 8, base=True), 'marble', M((x, Y0 + 0.14, z)), smooth=40)
    mb.add(prim_box(0.4, 0.14, 0.4), 'gold', M((x, y_top - 0.08, z)))


def build_base(mats, root):
    mb = MeshBuilder('Base')
    mb.add(prim_box(6.7, 0.3, 6.5, base=True), 'marble_dark', M((0, 0, 0.1)), bevel=0.06)
    mb.add(prim_box(6.2, 0.2, 6.0, base=True), 'paving', M((0, 0.3, 0.05)), bevel=0.04)
    # escadaria larga e corrimãos de mármore com bolas de ouro
    mb.add(prim_box(3.0, 0.30, 0.42, base=True), 'marble_light', M((0, 0.0, 3.26)), bevel=0.02)
    mb.add(prim_box(3.0, 0.14, 0.40, base=True), 'marble_light', M((0, 0.0, 3.66)), bevel=0.02)
    for sx in (-1, 1):
        mb.add(prim_box(0.3, 0.55, 1.0, taper=(0.9, 0.5), base=True), 'marble', M((sx * 1.6, 0.17, 3.45)), bevel=0.02)
        mb.add(prim_sphere(0.14, 0.14, 0.14, 7, 4), 'gold', M((sx * 1.6, 0.8, 3.15)), smooth=60)
    # canteiros com arbustos floridos nos cantos da frente
    for sx in (-1, 1):
        mb.add(prim_box(1.1, 0.25, 0.8, base=True), 'marble_dark', M((sx * 2.65, Y0, 2.55)), bevel=0.03)
        mb.add(prim_sphere(0.52, 0.38, 0.38, 7, 3, y_min=0.0), 'moss', M((sx * 2.65, Y0 + 0.25, 2.55)), smooth=70)
        mb.add(prim_sphere(0.26, 0.2, 0.22, 6, 3, y_min=0.0), 'moss', M((sx * 2.4, Y0 + 0.25, 2.7)), smooth=70)
    return mb.build(mats, parent=root)


def build_body(mats, root):
    mb = MeshBuilder('Body')
    NZ0, NZ1 = -2.5, 1.8                    # extensão z da nave
    ZC = (NZ0 + NZ1) / 2
    mb.add(prim_box(3.4, WALL - Y0, NZ1 - NZ0, base=True), 'marble', M((0, Y0, ZC)), bevel=0.04)
    mb.add(prim_box(3.5, 0.5, NZ1 - NZ0 + 0.1, base=True), 'marble_dark', M((0, Y0, ZC)))     # embasamento
    # transepto
    TZ0, TZ1 = -1.4, 0.6
    TC = (TZ0 + TZ1) / 2
    TW = 3.35
    mb.add(prim_box(6.0, TW - Y0, TZ1 - TZ0, base=True), 'marble', M((0, Y0, TC)), bevel=0.04)
    mb.add(prim_box(6.1, 0.5, TZ1 - TZ0 + 0.1, base=True), 'marble_dark', M((0, Y0, TC)))
    # cornijas douradas
    mb.add(prim_box(3.56, 0.1, NZ1 - NZ0 + 0.16), 'gold', M((0, WALL - 0.05, ZC)))
    mb.add(prim_box(6.06, 0.1, TZ1 - TZ0 + 0.16), 'gold', M((0, TW - 0.05, TC)))
    # pilastras nos cantos da fachada e do transepto
    for sx in (-1, 1):
        mb.add(prim_box(0.28, WALL - Y0, 0.28, base=True), 'marble_dark', M((sx * 1.75, Y0, NZ1 + 0.03)), bevel=0.02)
        mb.add(prim_box(0.28, WALL - Y0, 0.28, base=True), 'marble_dark', M((sx * 1.75, Y0, NZ0 - 0.03)), bevel=0.02)
        for tz in (TZ0, TZ1):
            mb.add(prim_box(0.28, TW - Y0, 0.28, base=True), 'marble_dark', M((sx * 3.02, Y0, tz)), bevel=0.02)
    # empenas (frontão triangular) da fachada e dos fundos
    gab = [(-1.7, WALL), (1.7, WALL), (0.0, RIDGE - 0.1)]
    mb.add(prim_extrude(gab, 0.2, axis='z'), 'marble', M((0, 0, NZ1 - 0.05)))
    mb.add(prim_extrude(gab, 0.2, axis='z'), 'marble', M((0, 0, NZ0 + 0.05)))
    tg = [(TZ0, TW), (TZ1, TW), (TC, TW + 1.0)]
    for sx in (-1, 1):
        mb.add(prim_extrude(tg, 0.2, axis='x'), 'marble', M((sx * 2.95, 0, 0)))
    # telhados: placas inclinadas azuis (nave: cumeeira no eixo z; transepto: no eixo x) + cumeeiras de ouro
    run, rise = 2.0, RIDGE + 0.05 - (WALL - 0.15)
    ang = math.degrees(math.atan2(rise, run))
    ln = math.hypot(run, rise) + 0.1
    for sx in (-1, 1):
        mb.add(prim_box(ln, 0.14, NZ1 - NZ0 + 0.5, taper=(1.0, 1.0)), 'roof',
               M((sx * run / 2, (WALL - 0.15 + RIDGE + 0.05) / 2, ZC), (0, 0, -sx * ang)), bevel=0.0)
    mb.add(prim_box(0.18, 0.14, NZ1 - NZ0 + 0.55), 'gold', M((0, RIDGE + 0.1, ZC)))
    trun, trise = 1.3, 1.25
    tang = math.degrees(math.atan2(trise, trun))
    tln = math.hypot(trun, trise) + 0.1
    for sz in (-1, 1):
        mb.add(prim_box(6.6, 0.14, tln), 'roof',
               M((0, TW - 0.1 + trise / 2, TC + sz * trun / 2), (sz * tang, 0, 0)), bevel=0.0)
    mb.add(prim_box(6.65, 0.14, 0.18), 'gold', M((0, TW - 0.1 + trise + 0.05, TC)))
    # --- fachada: porta em arco, portas de madeira, rosácea e sol de ouro ---------------------------
    zf = NZ1 + 0.04
    mb.add(prim_extrude(arch_poly(1.6, 2.35, Y0 + 0.15), 0.34, axis='z'), 'marble_light', M((0, 0, zf + 0.04)), bevel=0.02)
    mb.add(prim_extrude(arch_poly(1.3, 2.1, Y0 + 0.15), 0.16, axis='z'), 'wood_door', M((0, 0, zf + 0.16)), bevel=0.01)
    for y in (1.2, 2.1):
        mb.add(prim_box(1.28, 0.08, 0.05), 'gold', M((0, y, zf + 0.26)))
    mb.add(prim_box(0.05, 2.0, 0.05), 'gold', M((0, 1.65, zf + 0.26)))
    for sx in (-1, 1):
        mb.add(prim_sphere(0.06, 0.06, 0.05, 6, 3), 'gold', M((sx * 0.12, 1.5, zf + 0.29)), smooth=60)
    # rosácea (vidro azul/vermelho/dourado com raios de chumbo)
    RZ, RY = zf + 0.08, 4.28
    mb.add(prim_cyl(0.46, 0.46, 0.14, 12, base=False), 'gold', M((0, RY, RZ), (90, 0, 0)), smooth=30)
    mb.add(prim_cyl(0.38, 0.38, 0.12, 12, base=False), 'glass_b', M((0, RY, RZ + 0.03), (90, 0, 0)))
    for k in range(6):
        a = math.radians(k * 60)
        mb.add(prim_cone(0.07, 0.2, 4, base=True), 'glass_r' if k % 2 else 'glass_g',
               M((math.sin(a) * 0.2, RY + math.cos(a) * 0.2, RZ + 0.1), (90, 0, -k * 60)))
    mb.add(prim_cyl(0.09, 0.09, 0.05, 8, base=False), 'glow', M((0, RY, RZ + 0.1), (90, 0, 0)))
    for k in range(4):
        mb.add(prim_box(0.76, 0.04, 0.05), 'lead', M((0, RY, RZ + 0.12), (0, 0, k * 45)))
    # --- pórtico de 4 colunas com entablamento e frontão baixo com sol ----------------------------------
    pz = 2.7
    for x in (-1.35, -0.45, 0.45, 1.35):
        column(mb, x, pz, 3.1)
    mb.add(prim_box(3.7, 0.3, 1.5), 'marble_light', M((0, 3.25, 2.55)), bevel=0.02)
    mb.add(prim_box(3.84, 0.08, 0.1), 'gold', M((0, 3.43, 3.3)))
    mb.add(prim_box(3.8, 0.06, 1.6), 'marble_dark', M((0, 3.42, 2.55)))
    ped = [(-1.9, 3.45), (1.9, 3.45), (0.0, 4.05)]
    mb.add(prim_extrude(ped, 0.28, axis='z'), 'marble_light', M((0, 0, 3.2)), bevel=0.02)
    mb.add(prim_cyl(0.2, 0.2, 0.05, 12, base=False), 'gold', M((0, 3.7, 3.36), (90, 0, 0)), smooth=30)
    mb.add(prim_cyl(0.11, 0.11, 0.06, 8, base=False), 'glow', M((0, 3.7, 3.38), (90, 0, 0)))
    for k in range(12):
        a = k * 30
        mb.add(prim_box(0.035, 0.18, 0.03), 'gold', M((math.sin(math.radians(a)) * 0.33, 3.7 + math.cos(math.radians(a)) * 0.33, 3.37), (0, 0, -a)))
    # --- vitrais: nave (frente/fundo) e transepto -----------------------------------------------------------
    for sx in (-1, 1):
        T0 = M((sx * 1.7, 0, 0), (0, sx * 90, 0))
        for zc in (1.2, -1.95):
            window(mb, M((sx * 1.7, 0, zc), (0, sx * 90, 0)), Y0 + 0.9, 0.62, 1.7,
                   ('glass_b', 'glass_r', 'glass_g') if zc > 0 else ('glass_c', 'glass_g', 'glass_r'))
        # transepto: janela alta central e duas laterais
        T = M((sx * 3.02, 0, TC), (0, sx * 90, 0))
        window(mb, T, Y0 + 0.75, 0.9, 1.75, ('glass_b', 'glass_g', 'glass_r'))
    # fundos: janela alta
    window(mb, M((0, 0, NZ0 - 0.04), (0, 180, 0)), Y0 + 0.9, 0.8, 1.9, ('glass_b', 'glass_r', 'glass_g'))
    # --- pináculos de ouro nos cantos ------------------------------------------------------------------------
    for (px, pz_, h0) in ((-1.75, NZ1 + 0.03, WALL), (1.75, NZ1 + 0.03, WALL), (-1.75, NZ0 - 0.03, WALL), (1.75, NZ0 - 0.03, WALL),
                          (-3.02, TZ1, TW), (3.02, TZ1, TW), (-3.02, TZ0, TW), (3.02, TZ0, TW)):
        mb.add(prim_cyl(0.13, 0.11, 0.55, 6, base=True), 'marble_light', M((px, h0, pz_)), smooth=40)
        mb.add(prim_cone(0.17, 0.5, 6, base=True), 'gold', M((px, h0 + 0.55, pz_)), smooth=40)
        mb.add(prim_sphere(0.05, 0.05, 0.05, 5, 3), 'gold', M((px, h0 + 1.08, pz_)), smooth=60)
    return mb.build(mats, parent=root)


def build_dome(mats, root):
    mb = MeshBuilder('Dome')
    CZ = -0.4                                   # centro do cruzeiro
    DR = 1.3
    BASE_Y, TOP_Y = 3.4, 6.0
    rings = [ring_h(BASE_Y, DR + 0.1, DR + 0.1, 8, phase=OCT, cz=CZ), ring_h(4.9, DR, DR, 8, phase=OCT, cz=CZ),
             ring_h(TOP_Y, DR, DR, 8, phase=OCT, cz=CZ)]
    mb.add(prim_rings(rings, cap0=False, cap1=True), 'marble', smooth=0)
    face = DR * math.cos(math.radians(22.5)) + 0.02
    for k in range(8):
        a = k * 45
        T = M((face * math.sin(math.radians(a)), 0, CZ + face * math.cos(math.radians(a))), (0, a, 0))
        window(mb, T, 5.2, 0.5, 0.95, ('glass_b', 'glass_g', 'glass_r') if k % 2 else ('glass_c', 'glass_r', 'glass_g'))
        # colunetas nos cantos do octógono
    for k in range(8):
        a = math.radians(k * 45 + 22.5)
        px, pz = (DR + 0.03) * math.sin(a), CZ + (DR + 0.03) * math.cos(a)
        mb.add(prim_cyl(0.1, 0.1, TOP_Y - 4.7, 6, base=True), 'marble_light', M((px, 4.7, pz)), smooth=40)
        mb.add(prim_cone(0.12, 0.34, 6, base=True), 'gold', M((px, TOP_Y, pz)), smooth=40)
    # cornija dourada, tambor superior e cúpula dourada
    mb.add(prim_rings([ring_h(TOP_Y - 0.12, DR + 0.14, DR + 0.14, 8, phase=OCT, cz=CZ), ring_h(TOP_Y + 0.08, DR + 0.14, DR + 0.14, 8, phase=OCT, cz=CZ)],
                      cap0=False, cap1=False), 'gold', smooth=0)
    mb.add(prim_sphere(DR * 1.02, 1.0, DR * 1.02, 16, 6, y_min=0.0), 'dome', M((0, TOP_Y + 0.05, CZ)), smooth=70)
    for k in range(8):   # nervuras douradas
        a = math.radians(k * 45)
        pts = [(math.sin(a) * DR * 1.03 * math.cos(t), TOP_Y + 0.05 + 1.0 * math.sin(t) + 0.01, CZ + math.cos(a) * DR * 1.03 * math.cos(t))
               for t in (0.0, 0.3, 0.6, 0.9, 1.2)]
        tube(mb, pts, [0.035] * 5, 'gold', n=4, smooth=0)
    # lanterna luminosa, capelete e flecha com sol de ouro
    LY = TOP_Y + 1.05
    mb.add(prim_cyl(0.4, 0.4, 0.62, 8, base=True), 'glow', M((0, LY, CZ)), smooth=0)
    for k in range(8):
        a = math.radians(k * 45 + 22.5)
        mb.add(prim_box(0.06, 0.62, 0.06, base=True), 'gold', M((0.42 * math.sin(a), LY, CZ + 0.42 * math.cos(a))))
    mb.add(prim_cyl(0.5, 0.45, 0.1, 8, base=True), 'gold', M((0, LY + 0.6, CZ)))
    mb.add(prim_sphere(0.46, 0.5, 0.46, 10, 4, y_min=0.0), 'dome', M((0, LY + 0.7, CZ)), smooth=70)
    mb.add(prim_cone(0.07, 0.6, 6, base=True), 'gold', M((0, LY + 1.18, CZ)), smooth=40)
    SY = LY + 1.42
    mb.add(prim_cyl(0.3, 0.3, 0.07, 14, base=False), 'gold', M((0, SY + 0.28, CZ), (90, 0, 0)), smooth=30)
    mb.add(prim_cyl(0.16, 0.16, 0.09, 10, base=False), 'glow', M((0, SY + 0.28, CZ), (90, 0, 0)))
    for k in range(12):
        a = k * 30
        mb.add(prim_cone(0.04, 0.2 if k % 2 else 0.28, 4, base=True), 'gold',
               M((math.sin(math.radians(a)) * 0.34, SY + 0.28 + math.cos(math.radians(a)) * 0.34, CZ), (0, 0, -a)))
    return mb.build(mats, parent=root)


def build_banners(mats, root):
    mb = MeshBuilder('Anim_Banners')

    def strip(T, w, h, wave=0.05):
        pts = [(-w / 2, 0.0), (w / 2, 0.0), (w / 2, -h * 0.9), (w / 4, -h * 0.78), (0.0, -h), (-w / 4, -h * 0.8), (-w / 2, -h * 0.92)]
        verts, faces = prim_extrude(pts, 0.035, axis='z')
        verts = [(x, y, z + wave * math.sin(y * 4.0 + x * 3.0)) for (x, y, z) in verts]
        mb.add((verts, faces), 'team', T, smooth=40)
    # estandartes nos postes ao lado da escadaria
    for sx in (-1, 1):
        strip(M((sx * 2.55, 4.35, 3.0)), 0.7, 2.3, 0.07)
    # faixas penduradas nas colunas externas do pórtico
    for sx in (-1, 1):
        strip(M((sx * 1.35, 3.0, 3.1)), 0.34, 1.3, 0.03)
    # flâmulas nas pontas do transepto
    for sx in (-1, 1):
        strip(M((sx * 3.08, 3.25, -0.4), (0, sx * 90, 0)), 0.7, 1.2, 0.04)
    return mb.build(mats, parent=root)


def build_props(mats, root):
    mb = MeshBuilder('Props')
    # postes dos estandartes: haste de ouro com braço e esfera
    for sx in (-1, 1):
        x = sx * 2.55
        mb.add(prim_cyl(0.07, 0.06, 4.0, 8, base=True), 'gold', M((x, Y0, 3.0)), smooth=40)
        mb.add(prim_box(0.9, 0.06, 0.06), 'gold', M((x, 4.38, 3.0)))
        mb.add(prim_sphere(0.1, 0.1, 0.1, 6, 4), 'gold', M((x, 4.62, 3.0)), smooth=60)
        mb.add(prim_cyl(0.18, 0.2, 0.2, 8, base=True), 'marble_dark', M((x, Y0, 3.0)))
    for sx in (-1, 1):
        mb.add(prim_cyl(0.025, 0.025, 0.55, 4, base=False), 'gold', M((sx * 1.35, 2.75, 3.1)))
        mb.add(prim_box(0.4, 0.04, 0.04), 'gold', M((sx * 1.35, 3.05, 3.1)))
        mb.add(prim_box(0.04, 0.04, 0.5), 'gold', M((sx * 3.1, 3.3, -0.4)))
    return mb.build(mats, parent=root)


def main():
    args = C.script_args()
    C.reset_scene()
    mats = C.make_paint_set(PALETTE)
    root = C.make_empty('Temple')
    base = build_base(mats, root)
    body = build_body(mats, root)
    dome = build_dome(mats, root)
    props = build_props(mats, root)
    banners = build_banners(mats, root)
    bake_set = [base, body, dome, props, banners]
    bpy.context.view_layer.update()
    C.uv_atlas(bake_set, weights={'Base': 0.6, 'Body': 1.1, 'Dome': 1.0, 'Props': 0.8, 'Anim_Banners': 1.0},
               margin=0.004, angle=50.0)
    img = C.bake_atlas(bake_set, 'temple_atlas', int(os.environ.get('ATLAS', 1024)),
                       samples=int(os.environ.get('BAKE_SAMPLES', 32)), margin=6)
    C.finalize_materials(bake_set, img, team_default=TEAM_DEFAULT,
                         out_png=os.path.join(C.BUILD_DIR, 'temple_atlas.png'))
    static = C.join_objects([base, body, dome, props], 'Static_Mesh')
    static.parent = root
    C.make_empty('Socket_UnitSpawn', (0, 0, 4.6), parent=root)
    C.make_empty('Socket_Rally', (0, 0, 6.6), parent=root)
    bpy.context.view_layer.update()
    out = os.path.join(C.OUT_MODELS, 'temple.glb')
    C.export_glb(root, out, quality=80)
    print('STATS temple', C.stats(root, out))
    print('BBOX', bbox_game(root))
    if '--no-render' not in args:
        rig = C.RenderRig(root, 'temple', res=int(os.environ.get('RENDER_RES', 800)), samples=24)
        rig.render('34', (1.0, 0.95, 1.0), 30)
        rig.render('front', (0.0, 0.35, 1.0), 30)
        rig.render('back', (-0.8, 0.8, -1.0), 30)
        rig.render('side', (1.0, 0.25, 0.0), 30)
        rig.render('game', (45, 44, 45), 30, dist=78)
        C.set_team_color('#d23a2c')
        rig.render('34_vermelho', (1.0, 0.95, 1.0), 30)


if __name__ == '__main__':
    main()
