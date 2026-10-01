"""
build_ash_sanctum.py — Santuário das Cinzas orc (tipo interno `ash_sanctum`) gerado 100% por script.

Uso:
  blender -b --factory-startup --python tools/blender/build_ash_sanctum.py -- [--no-render]

Saída (public/models/ash_sanctum.glb), coordenadas do jogo, origem no centro da base, frente = +Z:
  AshSanctum (raiz)
  ├─ Static_Mesh       zigurate de basalto em 3 níveis, totens de crânios, braseiro, costelas, obelisco, adereços (Atlas)
  ├─ Anim_Flame        chamas verde-ácido + fumaça em colunas (Atlas, brilho pintado)
  ├─ Anim_Banners      estandartes e faixas rasgadas (material TeamColor)
  ├─ Socket_UnitSpawn  saída das unidades (frente da escadaria)
  └─ Socket_Rally      ponto de reunião padrão
Pegada ~6,3 x 6,3 (raio de colisão 3,2), altura ~9 com a fumaça.
"""
import os
import sys
import math

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
from mathutils import Vector, Matrix  # noqa: E402
import common as C  # noqa: E402
from common import (MeshBuilder, M, prim_box, prim_rings, ring_h, prim_cyl, prim_cone,  # noqa: E402
                    prim_sphere, prim_extrude, limb_rings, bezier)
from bld_common import beam, tube, log, skull, bbox_game  # noqa: E402

TEAM_DEFAULT = '#d23a2c'
_orig_add = MeshBuilder.add


def _lean_add(self, prim, mat, m=None, bevel=0.0, **kw):
    """Orçamento de triângulos: bisel só em peças grandes (desgaste de borda é pintado no bake)."""
    if bevel and len(prim[1]) <= 14 and bevel < 0.035:
        bevel = 0.0
    return _orig_add(self, prim, mat, m, bevel=bevel, **kw)


MeshBuilder.add = _lean_add

T1, T2, T3 = 0.5, 0.95, 1.4     # topos dos três níveis do zigurate
PY = T3                          # piso do altar
HEX = 0.0                        # fase do hexágono: face plana voltada para +Z


def polar(a_deg, d, y):
    a = math.radians(a_deg)
    return M((d * math.sin(a), y, d * math.cos(a)), (0, a_deg, 0))


BAS = dict(base='#3a3a46', var='#26262e', var_scale=0.5, var_amt=0.9, fine=0.09, pattern='bricks', mapping='box',
           pw=1.1, ph=0.42, mortar='#14141a', mortar_size=0.035, brick_tint='#4c4c5a', brick_tint_amt=0.5,
           brick_dark=0.75, brick_lite=1.12, grad=(0.0, 4.0, 0.25), top=0.22, edge='#9a9aae', edge_amt=0.5,
           edge_r=0.06, edge_gain=7.0, ao=(1.2, 0.75), ao_pow=1.3)
PALETTE = {
    'basalt': BAS,
    'basalt_dark': dict(BAS, base='#26262e', var='#17171d', brick_tint='#34343f', pw=1.6, ph=0.5),
    'basalt_light': dict(BAS, base='#565664', var='#3e3e4a', pattern=None, edge_amt=0.7),
    'slab': dict(BAS, base='#30303a', var='#20202a', pw=0.9, ph=0.9, brick_tint='#42424e', grad=None, ao=(1.3, 0.85)),
    'bone': dict(base='#e6dab4', var='#bfae7e', var_scale=5.0, var_amt=0.85, fine=0.08, top=0.3, edge='#fff8de',
                 edge_amt=0.5, edge_r=0.03, ao=(0.3, 0.6)),
    'bone_dark': dict(base='#a39877', var='#76694a', var_scale=4.0, var_amt=0.8, fine=0.1, top=0.2, ao=(0.3, 0.6)),
    'iron': dict(base='#3d4048', var='#2a2d34', var_scale=4.0, var_amt=0.8, fine=0.12, top=0.3, edge='#a9b0be',
                 edge_amt=0.8, edge_r=0.02, ao=(0.4, 0.55)),
    'rust': dict(base='#6b4a38', var='#9a5a2c', var_scale=6.0, var_amt=0.9, fine=0.2, top=0.3, edge='#cfa87a',
                 edge_amt=0.6, edge_r=0.02, ao=(0.4, 0.6)),
    'wood': dict(base='#4f3420', var='#33210f', var_scale=2.0, fine=0.1, top=0.2, edge='#8a6a44', edge_amt=0.4,
                 edge_r=0.025, ao=(0.5, 0.6)),
    'leather': dict(base='#503018', var='#341e0e', var_scale=6.0, fine=0.14, top=0.2, edge='#8a5c36', edge_amt=0.5,
                    edge_r=0.02, ao=(0.3, 0.6)),
    'ash': dict(base='#8c8c96', var='#5a5a66', var_scale=3.0, var_amt=0.9, fine=0.16, top=0.45, ao=(0.5, 0.5)),
    'char': dict(base='#17151a', var='#0c0b0e', var_scale=5.0, fine=0.1, top=0.25, ao=(0.3, 0.5)),
    'ember': dict(base='#ff7a1a', var='#ff4a0a', var_scale=4.0, var_amt=0.9, emit_boost=1.2),
    'flame': dict(base='#b6ff44', var='#6fd01c', var_scale=2.5, var_amt=0.9, top=0.5, emit_boost=1.15,
                  edge='#efffc0', edge_amt=0.9, edge_r=0.04, edge_gain=7.0),
    'core': dict(base='#f2ffd0', var='#c9ff7a', var_scale=3.0, emit_boost=1.25),
    'rune': dict(base='#b8f84a', var='#7fda24', var_scale=6.0, emit_boost=1.15),
    'smoke': dict(base='#8f9690', var='#5c6460', var_scale=2.5, var_amt=0.9, fine=0.1, top=0.55, ao=(0.3, 0.35)),
    'dark': dict(base='#08070a', var='#08070a'),
    'cauldron': dict(base='#2c2b33', var='#1c1b22', var_scale=4.0, fine=0.12, top=0.3, edge='#9aa0b0', edge_amt=0.6,
                     edge_r=0.02, ao=(0.4, 0.55)),
    'brew': dict(base='#9aff3a', var='#58c61c', var_scale=3.0, emit_boost=1.0, top=0.4),
    'team': dict(base='#bab2a6', var='#a0988c', var_scale=2.0, fine=0.08, top=0.2, edge='#dcd6cc', edge_amt=0.3,
                 edge_r=0.03, ao=(0.8, 0.6), team=True),
}


def skull_lite(mb, T, s=1.0):
    """Crânio simplificado (calota + maxilar + órbitas), frente em +z: ~60 triângulos."""
    mb.add(prim_sphere(0.4 * s, 0.34 * s, 0.4 * s, 7, 3), 'bone', T @ M((0, 0.06 * s, 0)), smooth=65)
    mb.add(prim_box(0.36 * s, 0.2 * s, 0.3 * s, taper=(0.85, 0.9)), 'bone', T @ M((0, -0.22 * s, 0.14 * s)))
    for sx in (-1, 1):
        mb.add(prim_box(0.15 * s, 0.14 * s, 0.1 * s), 'dark', T @ M((sx * 0.15 * s, -0.02 * s, 0.33 * s)))
    mb.add(prim_box(0.07 * s, 0.1 * s, 0.07 * s), 'dark', T @ M((0, -0.14 * s, 0.4 * s)))


def hexcyl(r0, r1, h, mat, mb, T=None, bevel=0.0, smooth=0):
    mb.add(prim_cyl(r0, r1, h, 6, base=True, phase=HEX), mat, T, bevel=bevel, smooth=smooth)


def build_base(mats, root):
    mb = MeshBuilder('Base')
    hexcyl(3.18, 3.1, T1, 'basalt_dark', mb, bevel=0.07)
    hexcyl(2.78, 2.7, T2 - T1, 'basalt', mb, M((0, T1, 0)), bevel=0.06)
    hexcyl(2.38, 2.3, T3 - T2, 'basalt', mb, M((0, T2, 0)), bevel=0.06)
    # piso do altar em lajes escuras com círculo ritual de runas verdes
    mb.add(prim_cyl(2.28, 2.28, 0.05, 6, base=True, phase=HEX), 'slab', M((0, T3, 0)))
    for (r0, r1) in ((1.95, 2.05), (1.5, 1.56)):
        mb.add(prim_rings([ring_h(T3 + 0.05, r0, r0, 24), ring_h(T3 + 0.068, r0, r0, 24), ring_h(T3 + 0.068, r1, r1, 24),
                           ring_h(T3 + 0.05, r1, r1, 24)], cap0=False, cap1=False), 'rune', smooth=0)
    for k in range(12):
        a = math.radians(k * 30 + 15)
        mb.add(prim_box(0.07, 0.02, 0.4), 'rune', M((math.sin(a) * 1.78, T3 + 0.06, math.cos(a) * 1.78), (0, math.degrees(a), 0)))
    # fendas incandescentes nas laterais dos níveis
    for (y, r) in ((T1 - 0.06, 3.12), (T2 - 0.05, 2.74)):
        for k in range(6):
            a = k * 60 + 30
            P = polar(a, r * 0.866, y)
            mb.add(prim_box(0.5, 0.05, 0.03), 'ember', P @ M((0.2, 0, 0.0), (0, 0, 12 * ((k % 3) - 1))))
    # escadaria frontal larga com corrimãos de osso
    zs = [2.95, 2.55, 2.2, 1.85]
    for z, h in zip(zs, (0.35, 0.7, 1.05, 1.4)):
        mb.add(prim_box(1.9, h, 0.5, base=True), 'basalt_light', M((0, 0.0, z)))
    # muretas laterais da escada
    for sx in (-1, 1):
        mb.add(prim_box(0.28, 1.2, 1.4, taper=(1.0, 0.5), base=True), 'basalt_dark', M((sx * 1.1, 0.0, 2.4)) @ M(r=(0, 0, 0)))
    return mb.build(mats, parent=root)


def totem(mb, a, r, base_y, h, face=True):
    """Pilar de basalto em lances de hexágono com crânio esculpido, runas e ponta de ferro."""
    P = polar(a, r, base_y)
    rings = [ring_h(0.0, 0.55, 0.55, 6, phase=HEX), ring_h(0.25, 0.48, 0.48, 6, phase=HEX), ring_h(h * 0.55, 0.42, 0.42, 6, phase=HEX),
             ring_h(h * 0.8, 0.46, 0.46, 6, phase=HEX), ring_h(h, 0.36, 0.36, 6, phase=HEX)]
    mb.add(prim_rings([[tuple(P @ Vector(p)) for p in ring] for ring in rings], cap0=False, cap1=True), 'basalt', smooth=0)
    # capitel de osso, crânio chifrudo frontal, runas verdes
    mb.add(prim_cyl(0.5, 0.5, 0.08, 6, base=True, phase=HEX), 'iron', P @ M((0, h * 0.8, 0)))
    skull(mb, P @ M((0, h * 0.55, 0.42)), 0.62)
    mb.add(prim_box(0.16, 0.55, 0.05), 'rune', P @ M((0, h * 0.28, 0.4)))
    mb.add(prim_box(0.4, 0.06, 0.05), 'rune', P @ M((0, h * 0.3, 0.4)))
    # ponta de ferro e chifres de osso curvos
    mb.add(prim_cone(0.2, 0.9, 6, base=True), 'iron', P @ M((0, h, 0)), smooth=0)
    for sx in (-1, 1):
        pts = bezier((sx * 0.3, h * 0.88, 0.0), (sx * 0.7, h * 0.95, 0.0), (sx * 0.62, h + 0.55, 0.1), 4)
        pts = [tuple(P @ Vector(p)) for p in pts]
        tube(mb, pts, [0.09, 0.075, 0.055, 0.03, 0.008], 'bone', n=6, smooth=60)
    return P


def build_altar(mats, root):
    mb = MeshBuilder('Altar')
    # pedestal e braseiro de ferro com cinzas e brasas
    hexcyl(1.15, 0.95, 0.5, 'basalt_dark', mb, M((0, PY, 0)), bevel=0.0)
    hexcyl(0.8, 0.65, 0.5, 'basalt', mb, M((0, PY + 0.5, 0)))
    bowl = [ring_h(PY + 1.0, 0.62, 0.62, 12), ring_h(PY + 1.2, 1.0, 1.0, 12), ring_h(PY + 1.5, 1.28, 1.28, 12), ring_h(PY + 1.58, 1.3, 1.3, 12)]
    mb.add(prim_rings(bowl, cap0=True, cap1=False), 'iron', smooth=55)
    mb.add(prim_rings([ring_h(PY + 1.5, 1.28, 1.28, 12), ring_h(PY + 1.62, 1.3, 1.3, 12), ring_h(PY + 1.62, 1.12, 1.12, 12),
                       ring_h(PY + 1.5, 1.12, 1.12, 12)], cap0=False, cap1=False), 'rust', smooth=0)
    mb.add(prim_sphere(1.12, 0.3, 1.12, 12, 3, y_min=0.0), 'ash', M((0, PY + 1.5, 0)), smooth=70)
    for k in range(10):
        a = k * 0.63
        mb.add(prim_sphere(0.1, 0.05, 0.1, 5, 2), 'ember', M((math.sin(a) * 0.7 * (0.4 + (k % 3) * 0.25), PY + 1.8, math.cos(a) * 0.7 * (0.4 + (k % 3) * 0.25))), smooth=60)
    for k in range(6):  # pregos de cravos no bojo
        a = k * 60
        mb.add(prim_cone(0.07, 0.3, 4, base=True), 'iron', polar(a, 1.3, PY + 1.4) @ M(r=(0, 0, 0)) @ M((0, 0, 0.0), (90, 0, 0)))
    # costelas gigantes de osso formando uma gaiola sobre o fogo
    N = 5
    for k in range(N):
        a = math.radians(k * 360 / N + 18)
        c, s_ = math.sin(a), math.cos(a)
        p0 = (c * 1.2, PY + 1.55, s_ * 1.2)
        p1 = (c * 2.1, PY + 2.8, s_ * 2.1)
        p2 = (c * 0.12, PY + 3.7, s_ * 0.12)
        pts = bezier(p0, p1, p2, 8)
        tube(mb, pts, [0.11, 0.1, 0.09, 0.085, 0.075, 0.06, 0.045, 0.03, 0.02], 'bone', n=6, smooth=60)
        for dy in (0.35, 0.8):   # anéis de ferro sobre as costelas
            pass
    mb.add(prim_sphere(0.12, 0.12, 0.12, 6, 3), 'bone', M((0, PY + 3.72, 0)), smooth=60)
    # crânio no topo da gaiola
    skull(mb, M((0, PY + 3.95, 0.12)), 0.95)
    mb.add(prim_box(0.24, 0.22, 0.2), 'rune', M((0, PY + 3.85, 0.0)))
    return mb.build(mats, parent=root)


def build_columns(mats, root):
    mb = MeshBuilder('Columns')
    tops = []
    for a in (45, 135, 225, 315):
        P = totem(mb, a, 2.0, PY, 3.3)
        tops.append((a, P))
    # correntes entre os totens (catenária) com crânios pendurados
    for a0, a1 in ((45, 135), (135, 225), (225, 315), (315, 405)):
        p0 = Vector((2.0 * math.sin(math.radians(a0)), PY + 2.8, 2.0 * math.cos(math.radians(a0))))
        p1 = Vector((2.0 * math.sin(math.radians(a1)), PY + 2.8, 2.0 * math.cos(math.radians(a1))))
        mid = (p0 + p1) / 2
        mid.y -= 0.7
        # empurra o meio para fora do círculo para não cruzar a gaiola
        mid.x *= 1.12
        mid.z *= 1.12
        pts = bezier(tuple(p0), tuple(mid), tuple(p1), 8)
        tube(mb, pts, [0.035] * 9, 'iron', n=4, smooth=0)
        sk = Vector(pts[4])
        skull_lite(mb, M((sk.x, sk.y - 0.25, sk.z)), 0.5)
        mb.add(prim_box(0.04, 0.22, 0.04), 'iron', M((sk.x, sk.y - 0.1, sk.z)))
    return mb.build(mats, parent=root)


def build_props(mats, root):
    mb = MeshBuilder('Props')
    # obelisco de runas atrás do altar
    O = M((0, PY, -1.95))
    mb.add(prim_box(0.9, 4.6, 0.9, taper=(0.45, 0.45), base=True), 'basalt_dark', O, bevel=0.0)
    mb.add(prim_cone(0.42, 0.9, 4, base=True, phase=math.pi / 4), 'iron', O @ M((0, 4.6, 0)))
    for k in range(5):
        y = 0.7 + k * 0.7
        w = 0.62 - 0.1 * k
        mb.add(prim_box(0.1, 0.34, 0.05), 'rune', O @ M((0, y, 0.43 - 0.045 * k)))
        mb.add(prim_box(0.34 * (1 - 0.14 * k), 0.06, 0.05), 'rune', O @ M((0, y + 0.1, 0.43 - 0.045 * k)))
    # postes de crânio na escadaria (estacas com crânio e chifres) + chamas pequenas
    for sx in (-1, 1):
        P = M((sx * 1.2, 0.0, 3.0))
        log(mb, (sx * 1.2, 0.0, 3.0), (sx * 1.2, 1.9, 3.0), 0.1, 'wood', n=6, tip=0.0)
        skull_lite(mb, P @ M((0, 2.0, 0.0), (0, sx * 12, 0)), 0.8)
        mb.add(prim_cone(0.1, 0.4, 5, base=True), 'iron', P @ M((0, 2.35, 0.0)))
    # braseiros pequenos nos degraus de baixo
    for sx in (-1, 1):
        P = M((sx * 2.55, 0.0, 1.6))
        mb.add(prim_cyl(0.3, 0.2, 0.5, 8, base=True), 'basalt_dark', P)
        mb.add(prim_cyl(0.42, 0.28, 0.3, 8, base=True), 'iron', P @ M((0, 0.5, 0)), smooth=30)
        mb.add(prim_sphere(0.36, 0.12, 0.36, 7, 3, y_min=0.0), 'ember', P @ M((0, 0.8, 0)), smooth=60)
    # montes de crânios e ossadas, caldeirão com poção, barris, lanças
    for (bx, bz, k) in ((-2.0, 1.9, 1.0), (2.2, -1.7, 0.9)):
        for j in range(5):
            skull_lite(mb, M((bx + 0.3 * math.sin(j * 1.9), 0.5 + 0.28 * (j // 3), bz + 0.3 * math.cos(j * 1.9)), (0, j * 70, 0)), 0.5 * k)
        mb.add(prim_sphere(0.6 * k, 0.15, 0.6 * k, 7, 3, y_min=0.0), 'bone_dark', M((bx, 0.45, bz)), smooth=60)
    CZ = M((-2.45, 0.0, -0.6))
    mb.add(prim_sphere(0.55, 0.5, 0.55, 9, 4), 'cauldron', CZ @ M((0, 0.75, 0)), smooth=65)
    mb.add(prim_cyl(0.56, 0.56, 0.06, 9), 'iron', CZ @ M((0, 1.0, 0)))
    mb.add(prim_cyl(0.46, 0.46, 0.03, 9), 'brew', CZ @ M((0, 1.02, 0)))
    for k in range(3):
        a = k * 120 + 20
        mb.add(prim_box(0.08, 0.4, 0.08), 'iron', CZ @ polar(a, 0.4, 0.0))
    # montes de cinza
    for (ax, az, s) in ((2.4, 1.0, 1.0), (-1.2, -2.6, 0.9), (1.4, -2.4, 0.8)):
        mb.add(prim_sphere(0.5 * s, 0.22 * s, 0.45 * s, 7, 3, y_min=0.0), 'ash', M((ax, 0.5 if abs(ax) > 2 else T3, az)), smooth=70)
    # lanças e machados cravados ao redor do plinto
    for (a, d) in ((20, 3.05), (-20, 3.05), (160, 3.0), (-160, 3.0)):
        P = polar(a, d, 0.0)
        log(mb, tuple(P @ Vector((0, 0, 0))), tuple(P @ Vector((0, 2.2, 0.0))), 0.05, 'wood', n=5)
        mb.add(prim_cone(0.1, 0.4, 4, base=True), 'iron', P @ M((0, 2.2, 0.0)))
    return mb.build(mats, parent=root)


def build_flame(mats, root):
    mb = MeshBuilder('Anim_Flame')
    fy = T3 + 1.7
    # chama central + línguas laterais
    mb.add(prim_cone(0.62, 2.1, 6, base=True), 'flame', M((0, fy, 0)), smooth=0)
    mb.add(prim_cone(0.3, 1.5, 6, base=True), 'core', M((0, fy, 0)), smooth=0)
    for k in range(5):
        a = k * 72 + 10
        r = 0.55
        mb.add(prim_cone(0.3, 1.1 + 0.25 * (k % 2), 5, base=True), 'flame',
               M((math.sin(math.radians(a)) * r, fy - 0.05, math.cos(math.radians(a)) * r), (math.cos(math.radians(a)) * 16, 0, -math.sin(math.radians(a)) * 16)), smooth=0)
    for k in range(6):   # fagulhas
        a = k * 1.1
        mb.add(prim_cone(0.05, 0.14, 4, base=True), 'core', M((math.sin(a) * 0.9, fy + 1.4 + 0.45 * (k % 3), math.cos(a) * 0.9)), smooth=0)
    # fumaça: bolhas subindo da gaiola (cinza claro), crescendo
    sy = [(T3 + 4.9, 0.3, 0.0, 0.0), (T3 + 5.5, 0.38, 0.12, 0.05), (T3 + 6.1, 0.46, -0.05, 0.2), (T3 + 6.7, 0.54, -0.25, 0.3),
          (T3 + 7.3, 0.6, -0.1, 0.45)]
    return_pts = sy
    for (y, r, dx, dz) in sy:
        mb.add(prim_sphere(r, r * 0.8, r, 7, 3), 'smoke', M((dx, y, dz)), smooth=70)
        mb.add(prim_sphere(r * 0.6, r * 0.5, r * 0.6, 6, 3), 'smoke', M((dx + r * 0.9, y - 0.25, dz - 0.1)), smooth=70)
    # fiapos de fumaça saindo dos braseiros baixos e do caldeirão
    for (x, z, y) in ((2.55, 1.6, 1.2), (-2.55, 1.6, 1.2), (-2.45, -0.6, 1.6)):
        mb.add(prim_sphere(0.2, 0.17, 0.2, 6, 3), 'smoke', M((x, y, z)), smooth=70)
        mb.add(prim_sphere(0.28, 0.22, 0.28, 6, 3), 'smoke', M((x + 0.05, y + 0.4, z)), smooth=70)
    for sx in (-1, 1):   # chama nos braseiros de entrada
        mb.add(prim_cone(0.26, 0.7, 5, base=True), 'flame', M((sx * 2.55, 0.8, 1.6)), smooth=0)
    return mb.build(mats, parent=root)


def build_banners(mats, root):
    mb = MeshBuilder('Anim_Banners')

    def strip(T, w, h, wave=0.05):
        pts = [(-w / 2, 0.0), (w / 2, 0.0), (w / 2, -h * 0.9), (w / 4, -h * 0.75), (0.0, -h), (-w / 4, -h * 0.8), (-w / 2, -h * 0.95)]
        verts, faces = prim_extrude(pts, 0.035, axis='z')
        verts = [(x, y, z + wave * math.sin(y * 4.0 + x * 3.0)) for (x, y, z) in verts]
        mb.add((verts, faces), 'team', T, smooth=40)
    # faixas penduradas nos 4 totens, voltadas para fora
    for a in (45, 135, 225, 315):
        P = polar(a, 2.0 + 0.62, PY + 2.7)
        strip(P @ M((0, 0, 0.0)), 0.55, 1.5)
        mb.add(prim_box(0.7, 0.07, 0.07), 'bone', P @ M((0, 0.04, 0.0)))
    # estandarte grande no obelisco (poste com bandeira rasgada)
    mb.add(prim_box(1.3, 0.09, 0.09), 'bone', M((0.65, PY + 5.0, -1.75)))
    strip(M((1.0, PY + 4.96, -1.75)), 0.85, 2.0, 0.08)
    # pano rasgado sobre a escadaria
    strip(M((0, T1 + 1.9, 3.2)), 0.7, 1.0, 0.05)
    return mb.build(mats, parent=root)


def main():
    args = C.script_args()
    C.reset_scene()
    mats = C.make_paint_set(PALETTE)
    root = C.make_empty('AshSanctum')
    base = build_base(mats, root)
    altar = build_altar(mats, root)
    cols = build_columns(mats, root)
    props = build_props(mats, root)
    flame = build_flame(mats, root)
    banners = build_banners(mats, root)
    bake_set = [base, altar, cols, props, flame, banners]
    bpy.context.view_layer.update()
    C.uv_atlas(bake_set, weights={'Base': 0.6, 'Altar': 1.0, 'Columns': 1.0, 'Props': 1.0, 'Anim_Flame': 0.9, 'Anim_Banners': 1.0},
               margin=0.004, angle=50.0)
    img = C.bake_atlas(bake_set, 'ash_sanctum_atlas', int(os.environ.get('ATLAS', 1024)),
                       samples=int(os.environ.get('BAKE_SAMPLES', 32)), margin=6)
    C.finalize_materials(bake_set, img, team_default=TEAM_DEFAULT,
                         out_png=os.path.join(C.BUILD_DIR, 'ash_sanctum_atlas.png'))
    static = C.join_objects([base, altar, cols, props], 'Static_Mesh')
    static.parent = root
    C.make_empty('Socket_UnitSpawn', (0, 0, 4.4), parent=root)
    C.make_empty('Socket_Rally', (0, 0, 6.4), parent=root)
    bpy.context.view_layer.update()
    out = os.path.join(C.OUT_MODELS, 'ash_sanctum.glb')
    C.export_glb(root, out, quality=80)
    print('STATS ash_sanctum', C.stats(root, out))
    print('BBOX', bbox_game(root))
    if '--no-render' not in args:
        rig = C.RenderRig(root, 'ash_sanctum', res=int(os.environ.get('RENDER_RES', 800)), samples=24)
        rig.render('34', (1.0, 0.95, 1.0), 30)
        rig.render('front', (0.0, 0.35, 1.0), 30)
        rig.render('back', (-0.8, 0.8, -1.0), 30)
        rig.render('side', (1.0, 0.25, 0.0), 30)
        rig.render('game', (45, 44, 45), 30, dist=78)
        C.set_team_color('#3a66d6')
        rig.render('34_azul', (1.0, 0.95, 1.0), 30)


if __name__ == '__main__':
    main()
