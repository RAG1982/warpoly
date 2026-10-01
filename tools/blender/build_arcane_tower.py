"""
build_arcane_tower.py — Torre Arcana humana (tipo interno `arcane_tower`) gerada 100% por script.

Uso:
  blender -b --factory-startup --python tools/blender/build_arcane_tower.py -- [--no-render]

Saída (public/models/arcane_tower.glb), coordenadas do jogo, origem no centro da base, frente = +Z:
  ArcaneTower (raiz)
  ├─ Static_Mesh       plinto, torre octogonal de pedra, escada em espiral, balcão, pavilhão, adereços (Atlas)
  ├─ Anim_Crystal      cristal azul flutuante + anéis dourados de astrolábio + estilhaços (Atlas, brilho pintado)
  ├─ Anim_Banners      estandartes e flâmulas (material TeamColor)
  ├─ Socket_UnitSpawn  saída das unidades (frente da porta)
  └─ Socket_Rally      ponto de reunião padrão
Pegada ~6,3 x 6,3 (raio de colisão 3,2), altura ~9. Janelas e runas luminosas pintadas no atlas.
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
from bld_common import beam, tube, log, bbox_game  # noqa: E402

TEAM_DEFAULT = '#3a66d6'

_orig_add = MeshBuilder.add


def _lean_add(self, prim, mat, m=None, bevel=0.0, **kw):
    """Orçamento de triângulos: bisel só em peças grandes (o desgaste de borda é pintado no bake pelo nó Bevel)."""
    if bevel and len(prim[1]) <= 14 and bevel < 0.035:
        bevel = 0.0
    return _orig_add(self, prim, mat, m, bevel=bevel, **kw)


MeshBuilder.add = _lean_add
Y0 = 0.38                       # topo do plinto
PROFILE = [(0.38, 1.9), (1.5, 1.8), (3.5, 1.6), (4.9, 1.5), (6.7, 1.38)]   # (y, raio) do fuste octogonal
FACE = math.cos(math.radians(22.5))


def Rt(y):
    for (y0, r0), (y1, r1) in zip(PROFILE, PROFILE[1:]):
        if y0 <= y <= y1:
            return r0 + (r1 - r0) * (y - y0) / (y1 - y0)
    return PROFILE[-1][1]


def face_d(y):
    return Rt(y) * FACE


def polar(a_deg, d, y):
    a = math.radians(a_deg)
    return M((d * math.sin(a), y, d * math.cos(a)), (0, a_deg, 0))


STONE = dict(base='#a9aeb8', var='#8a909e', var_scale=0.5, var_amt=0.8, fine=0.06, pattern='bricks', mapping='cyl',
             cyl_radius=1.8, pw=0.6, ph=0.3, mortar='#4a505c', mortar_size=0.03, brick_tint='#c2c6d2', brick_tint_amt=0.5,
             brick_dark=0.8, brick_lite=1.1, grad=(0.0, 6.0, 0.28), top=0.2, edge='#e6e9f2', edge_amt=0.45,
             edge_r=0.06, edge_gain=7.0, ao=(1.2, 0.7), ao_pow=1.3)
PALETTE = {
    'stone': STONE,
    'stone_box': dict(STONE, mapping='box', pw=0.62, ph=0.3),
    'stone_dark': dict(STONE, mapping='box', base='#80858f', var='#666b76', pw=1.2, ph=0.4, brick_tint='#9a9fac',
                       grad=(0.0, 1.0, 0.25)),
    'stone_light': dict(STONE, mapping='box', base='#d4d8e2', var='#bcc1ce', pattern=None, edge_amt=0.6, grad=None),
    'paving': dict(STONE, mapping='box', base='#9ea3ae', var='#848994', pw=0.9, ph=0.9, mortar='#5c616c',
                   brick_tint='#b4b9c6', grad=None, ao=(1.4, 0.8)),
    'wood': dict(base='#7c5530', var='#5e3e22', var_scale=1.5, fine=0.08, pattern='planks', mapping='box', pw=2.2, ph=0.22,
                 mortar='#3a2615', top=0.15, edge='#b08050', edge_amt=0.4, edge_r=0.03, ao=(0.8, 0.7)),
    'wood_beam': dict(base='#5a3c22', var='#45301a', var_scale=2.0, fine=0.09, top=0.15, edge='#8a6a44',
                      edge_amt=0.4, edge_r=0.025, ao=(0.6, 0.6)),
    'wood_door': dict(base='#6b4424', var='#58371c', var_scale=1.5, fine=0.08, pattern='planks_v', mapping='box', pw=3.0,
                      ph=0.26, mortar='#2c1c10', top=0.1, edge='#9a6d42', edge_amt=0.35, edge_r=0.03, ao=(0.8, 0.8)),
    'iron': dict(base='#41444c', var='#34373e', var_scale=3.0, fine=0.08, top=0.3, edge='#aab0bb', edge_amt=0.8,
                 edge_r=0.02, ao=(0.5, 0.5)),
    'gold': dict(base='#e4aa2c', var='#b98524', var_scale=4.0, fine=0.06, top=0.35, edge='#fff0b8', edge_amt=0.9,
                 edge_r=0.02, ao=(0.4, 0.4)),
    'dark': dict(base='#17161e', var='#0d0c12'),
    'glow': dict(base='#cfeeff', var='#8fd2ff', var_scale=3.0, emit_boost=1.25),
    'rune': dict(base='#9be8ff', var='#5fcfff', var_scale=6.0, emit_boost=1.2),
    'roof_cone': dict(base='#3f6fc4', var='#2d5aa6', var_scale=0.5, var_amt=0.7, fine=0.05, pattern='shingles',
                      mapping='cyl', cyl_radius=0.5, pw=0.3, ph=0.22, mortar='#1d3160', brick_tint='#6390de',
                      brick_tint_amt=0.4, brick_dark=0.82, brick_lite=1.12, top=0.2, edge='#a9c4f2', edge_amt=0.5,
                      edge_r=0.04, ao=(0.8, 0.5)),
    'leather': dict(base='#7a4a26', var='#5c3419', var_scale=6.0, fine=0.12, top=0.2, edge='#b07a48', edge_amt=0.5,
                    edge_r=0.02, ao=(0.25, 0.6)),
    'crystal': dict(base='#48c4ff', var='#1f8be0', var_scale=2.0, var_amt=0.9, top=0.5, emit_boost=1.2,
                    edge='#e6fbff', edge_amt=0.9, edge_r=0.05, edge_gain=7.0),
    'core': dict(base='#e4fbff', var='#9fe8ff', var_scale=3.0, emit_boost=1.3),
    'paper': dict(base='#eadfbd', var='#cdbf93', var_scale=6.0, fine=0.1, top=0.3, ao=(0.2, 0.5)),
    'book_r': dict(base='#a02828', var='#6e1a1a', var_scale=8.0, top=0.3, ao=(0.2, 0.5)),
    'book_g': dict(base='#2e7a44', var='#1e5230', var_scale=8.0, top=0.3, ao=(0.2, 0.5)),
    'book_b': dict(base='#2d4fa0', var='#1d3470', var_scale=8.0, top=0.3, ao=(0.2, 0.5)),
    'potion': dict(base='#7a5bff', var='#4a32c8', var_scale=5.0, emit_boost=1.1, top=0.4),
    'moss': dict(base='#5f8a46', var='#3f6a2c', var_scale=6.0, var_amt=0.8, fine=0.14, top=0.3, ao=(0.3, 0.5)),
    'team': dict(base='#bab2a6', var='#a0988c', var_scale=2.0, fine=0.08, top=0.2, edge='#dcd6cc', edge_amt=0.3,
                 edge_r=0.03, ao=(0.8, 0.6), team=True),
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


def torus(mb, T, R, r, mat, n=16, seg=5):
    """Anel (toro low-poly) de raio R e raio de seção r, no plano XZ local, transformado por T."""
    pts = [(math.cos(2 * math.pi * i / n) * R, 0.0, math.sin(2 * math.pi * i / n) * R) for i in range(n + 1)]
    pts = [tuple(T @ Vector(p)) for p in pts]
    mb.add(prim_rings(limb_rings(pts, [r] * len(pts), seg, up=(0, 1, 0)), cap0=False, cap1=False), mat, smooth=60)


def build_base(mats, root):
    mb = MeshBuilder('Base')
    mb.add(prim_cyl(3.18, 3.08, Y0, 8, base=True), 'stone_dark', bevel=0.07, smooth=0)
    mb.add(prim_cyl(2.98, 2.98, 0.04, 8, base=True), 'paving', M((0, Y0, 0)))
    # círculo rúnico incrustado no piso (anéis de brilho azul + marcas)
    for (r0, r1) in ((2.30, 2.42), (1.72, 1.78)):
        mb.add(prim_rings([ring_h(Y0 + 0.04, r0, r0, 24), ring_h(Y0 + 0.058, r0, r0, 24), ring_h(Y0 + 0.058, r1, r1, 24),
                           ring_h(Y0 + 0.04, r1, r1, 24)], cap0=False, cap1=False), 'rune', smooth=0)
    for k in range(8):
        a = math.radians(k * 45 + 22.5)
        mb.add(prim_box(0.10, 0.02, 0.2), 'rune', M((math.sin(a) * 2.06, Y0 + 0.05, math.cos(a) * 2.06), (0, math.degrees(a), 0)))
    # escadinha frontal até a porta
    for k in range(3):
        mb.add(prim_box(2.0 - 0.2 * k, 0.12, 0.5, base=True), 'stone_light', M((0, Y0 + k * 0.12, 2.0 + 0.7 - 0.25 * k)), bevel=0.02)
    return mb.build(mats, parent=root)


def build_tower(mats, root):
    mb = MeshBuilder('Tower')
    rings = [ring_h(y, r, r, 8, phase=math.pi / 8) for (y, r) in PROFILE]
    mb.add(prim_rings(rings, cap0=False, cap1=True), 'stone', smooth=0)
    # contrafortes inclinados nos quatro cantos + pés de pedra
    for k in range(4):
        a = 45 + k * 90
        mb.add(prim_box(0.95, 1.9, 0.75, taper=(0.7, 0.3), base=True), 'stone_dark',
               M((math.sin(math.radians(a)) * 1.95, Y0, math.cos(math.radians(a)) * 1.95), (0, a, 0)) @ M(r=(-8, 0, 0)), bevel=0.04)
    # cintas de ouro rúnico
    for y in (2.0, 4.0, 6.4):
        r = Rt(y) + 0.045
        mb.add(prim_rings([ring_h(y - 0.07, r, r, 8, phase=math.pi / 8), ring_h(y + 0.07, r, r, 8, phase=math.pi / 8)],
                          cap0=False, cap1=False), 'gold', smooth=0, bevel=0.0)
    # porta em arco com batente de pedra clara, portas de madeira e ferragens
    zf = face_d(1.2) + 0.02
    mb.add(prim_extrude(arch_poly(1.55, 2.25, Y0 + 0.2), 0.34, axis='z'), 'stone_light', M((0, 0, zf + 0.05)), bevel=0.02)
    mb.add(prim_extrude(arch_poly(1.2, 2.0, Y0 + 0.2), 0.14, axis='z'), 'wood_door', M((0, 0, zf + 0.17)), bevel=0.01)
    for y in (0.8, 1.55):
        mb.add(prim_box(1.18, 0.07, 0.05), 'iron', M((0, y, zf + 0.26)))
    mb.add(prim_cyl(0.1, 0.1, 0.05, 10, base=False), 'gold', M((0.0, 1.4, zf + 0.27), (90, 0, 0)))
    mb.add(prim_sphere(0.05, 0.05, 0.05, 6, 3), 'gold', M((0.3, 1.2, zf + 0.28)), smooth=60)
    mb.add(prim_sphere(0.05, 0.05, 0.05, 6, 3), 'gold', M((-0.3, 1.2, zf + 0.28)), smooth=60)
    mb.add(prim_box(0.22, 0.22, 0.12), 'stone_light', M((0, Y0 + 2.5, zf + 0.12), (0, 0, 45)), bevel=0.02)   # fecho do arco
    mb.add(prim_sphere(0.07, 0.09, 0.05, 6, 3), 'crystal', M((0, Y0 + 2.5, zf + 0.2)), smooth=60)
    # janelas luminosas em arco (4 faces, 2 alturas defasadas) e placas de runa
    def window(a, y, w=0.5, h=1.0):
        d = face_d(y) + 0.02
        T = polar(a, d, 0)
        mb.add(prim_extrude(arch_poly(w + 0.24, h + 0.18, y - 0.09), 0.2, axis='z'), 'stone_light', T @ M((0, 0, 0.0)), bevel=0.015)
        mb.add(prim_extrude(arch_poly(w, h, y), 0.1, axis='z'), 'glow', T @ M((0, 0, 0.08)))
        mb.add(prim_box(0.06, h * 0.95, 0.06), 'stone_light', T @ M((0, y + h * 0.5, 0.15)))
        mb.add(prim_box(w, 0.06, 0.06), 'stone_light', T @ M((0, y + h * 0.55, 0.15)))
        mb.add(prim_box(w + 0.36, 0.09, 0.3), 'stone_light', T @ M((0, y - 0.13, 0.12)), bevel=0.01)
    for a in (90, 180, 270):
        window(a, 2.6)
    for a in (45, 135, 225, 315):
        window(a, 3.6, 0.42, 0.85)
    window(0, 3.55, 0.55, 1.05)
    window(90, 5.5, 0.4, 0.7)
    window(270, 5.5, 0.4, 0.7)
    window(180, 5.5, 0.4, 0.7)
    # placas de runa luminosas
    for (a, y) in ((22.5, 2.2), (-22.5, 2.2), (157.5, 2.2), (202.5, 4.6), (-67.5, 4.6)):
        T = polar(a, face_d(y) + 0.03, y)
        mb.add(prim_extrude([(0, 0.17), (0.11, 0), (0, -0.17), (-0.11, 0)], 0.05, axis='z'), 'rune', T, bevel=0.004)
    # escada em espiral externa: degraus em cunha de pedra, apoiados na torre, até o balcão
    N, a0, da, y_a, y_b = 26, 52.0, 13.5, Y0 + 0.14, 4.84
    Rm = 2.12
    pts_rail = []
    for k in range(N):
        a = a0 + k * da
        y = y_a + (y_b - y_a) * k / (N - 1)
        T = M((Rm * math.sin(math.radians(a)), y - 0.17, Rm * math.cos(math.radians(a))), (0, a, 0))
        mb.add(prim_box(0.56, 0.4, 1.12, taper=(1.0, 1.0)), 'stone_light' if k % 2 else 'stone_box', T, bevel=0.02)
        pts_rail.append(a)
        if k % 3 == 0:
            Ro = 2.72
            mb.add(prim_box(0.07, 0.8, 0.07, base=True),
                   'wood_beam', M((Ro * math.sin(math.radians(a)), y + 0.04, Ro * math.cos(math.radians(a))), (0, a, 0)), bevel=0.01)
    hr = []
    for k in range(N):
        a = math.radians(a0 + k * da)
        y = y_a + (y_b - y_a) * k / (N - 1)
        hr.append((2.72 * math.sin(a), y + 0.84, 2.72 * math.cos(a)))
    tube(mb, hr, [0.04] * N, 'wood', n=5, smooth=40)
    hr2 = [(p[0], p[1] - 0.4, p[2]) for p in hr]
    tube(mb, hr2, [0.025] * N, 'wood_beam', n=4, smooth=40)
    # balcão circular (laje de pedra clara + corbéis + balaustrada)
    BY = 4.92
    mb.add(prim_cyl(2.38, 2.3, 0.2, 8, base=True), 'stone_light', M((0, BY, 0)), bevel=0.03)
    mb.add(prim_cyl(2.1, 1.7, 0.22, 8, base=True), 'stone_dark', M((0, BY - 0.22, 0)), bevel=0.03)
    for k in range(8):
        a = k * 45 + 22.5
        mb.add(prim_box(0.34, 0.3, 0.4, taper=(0.6, 0.5), base=True), 'stone_dark',
               polar(a, 1.7, BY - 0.5) @ M(r=(180, 0, 0)) @ M((0, -0.3, 0)))
    for k in range(16):
        a = math.radians(k * 22.5)
        if 40 < k * 22.5 < 100:   # abertura da escada
            continue
        mb.add(prim_box(0.08, 0.7, 0.08, base=True), 'stone_light',
               M((2.22 * math.sin(a), BY + 0.2, 2.22 * math.cos(a)), (0, math.degrees(a), 0)), bevel=0.01)
    mb.add(prim_rings([ring_h(BY + 0.88, 2.26, 2.26, 16), ring_h(BY + 0.96, 2.26, 2.26, 16)], cap0=False, cap1=False), 'stone_light', smooth=0)
    mb.add(prim_rings([ring_h(BY + 0.9, 2.31, 2.31, 16), ring_h(BY + 0.94, 2.31, 2.31, 16)], cap0=False, cap1=False), 'gold', smooth=0)
    return mb.build(mats, parent=root)


def build_crown(mats, root):
    mb = MeshBuilder('Crown')
    CY = 6.7
    # laje de coroamento (prato largo) + moldura e dentes de pedra
    mb.add(prim_cyl(2.15, 1.55, 0.3, 8, base=True), 'stone_light', M((0, CY - 0.05, 0)), bevel=0.04)
    mb.add(prim_rings([ring_h(CY + 0.22, 2.19, 2.19, 8, phase=math.pi / 8), ring_h(CY + 0.28, 2.19, 2.19, 8, phase=math.pi / 8)], cap0=False, cap1=False), 'gold', smooth=0)
    for k in range(8):
        a = k * 45 + 22.5
        mb.add(prim_box(0.38, 0.5, 0.34, taper=(0.8, 0.7), base=True), 'stone_dark', polar(a, 1.85, CY + 0.28), bevel=0.02)
    for k in range(8):   # mísulas sob a laje
        a = k * 45
        mb.add(prim_box(0.3, 0.5, 0.4, taper=(0.5, 0.4), base=True), 'stone_dark',
               polar(a, 1.6, CY - 0.5) @ M(r=(180, 0, 0)) @ M((0, -0.5, 0)))
    # pavilhão aberto: 8 colunas finas com capitéis de ouro + anel superior
    PY0, PY1 = CY + 0.3, CY + 1.45
    for k in range(8):
        a = k * 45
        mb.add(prim_cyl(0.13, 0.11, PY1 - PY0, 8, base=True), 'stone_light', polar(a, 1.2, PY0), smooth=40)
        mb.add(prim_cyl(0.2, 0.2, 0.09, 8, base=True), 'gold', polar(a, 1.2, PY0))
        mb.add(prim_cyl(0.18, 0.18, 0.1, 8, base=True), 'gold', polar(a, 1.2, PY1 - 0.1))
    for k in range(8):   # arquinhos entre colunas
        a0, a1 = math.radians(k * 45), math.radians((k + 1) * 45)
        p0 = (1.2 * math.sin(a0), PY1 - 0.05, 1.2 * math.cos(a0))
        p1 = (1.2 * math.sin(a1), PY1 - 0.05, 1.2 * math.cos(a1))
        pm = ((p0[0] + p1[0]) / 2, PY1 - 0.35, (p0[2] + p1[2]) / 2)
        tube(mb, [p0, pm, p1], [0.07, 0.065, 0.07], 'stone_light', n=5, smooth=40)
    mb.add(prim_rings([ring_h(PY1, 1.38, 1.38, 8, phase=0), ring_h(PY1 + 0.14, 1.38, 1.38, 8, phase=0),
                       ring_h(PY1 + 0.14, 1.12, 1.12, 8, phase=0), ring_h(PY1, 1.12, 1.12, 8, phase=0)], cap0=False, cap1=False), 'gold', smooth=0)
    # pináculos azuis nas diagonais da laje
    for a in (45, 135, 225, 315):
        P = polar(a, 1.95, CY + 0.78)
        mb.add(prim_cyl(0.14, 0.12, 0.5, 8, base=True), 'stone_light', P, smooth=40)
        mb.add(prim_cone(0.2, 0.7, 8, base=True), 'roof_cone', P @ M((0, 0.5, 0)), smooth=0)
        mb.add(prim_sphere(0.06, 0.06, 0.06, 6, 3), 'gold', P @ M((0, 1.2, 0)), smooth=60)
    # pedestal central e copa que sustenta o cristal
    mb.add(prim_cyl(0.42, 0.3, 0.55, 8, base=True), 'stone_light', M((0, CY + 0.25, 0)), bevel=0.02)
    mb.add(prim_cyl(0.5, 0.3, 0.2, 8, base=True), 'gold', M((0, CY + 0.8, 0)), bevel=0.015)
    mb.add(prim_cyl(0.28, 0.06, 0.15, 8, base=True), 'rune', M((0, CY + 0.98, 0)))
    return mb.build(mats, parent=root)


def build_props(mats, root):
    mb = MeshBuilder('Props')
    # obeliscos rúnicos nos cantos do plinto
    for a in (30, -30, 150, -150):
        P = polar(a, 2.78, Y0)
        mb.add(prim_box(0.38, 1.3, 0.38, taper=(0.5, 0.5), base=True), 'stone_light', P, bevel=0.02)
        mb.add(prim_cone(0.28, 0.35, 4, base=True, phase=math.pi / 4), 'stone_light', P @ M((0, 1.3, 0)))
        mb.add(prim_box(0.12, 0.36, 0.05), 'rune', P @ M((0, 0.62, 0.17)))
        mb.add(prim_sphere(0.1, 0.1, 0.1, 6, 3), 'crystal', P @ M((0, 1.8, 0)), smooth=0)
    # postes de lanterna ao lado da porta
    for sx in (-1, 1):
        x, z = sx * 1.7, 2.65
        mb.add(prim_box(0.1, 1.2, 0.1, base=True), 'iron', M((x, Y0, z)), bevel=0.01)
        mb.add(prim_box(0.26, 0.3, 0.26), 'glow', M((x, Y0 + 1.35, z)), bevel=0.02)
        mb.add(prim_cone(0.22, 0.22, 4, base=True, phase=math.pi / 4), 'iron', M((x, Y0 + 1.5, z)))
        mb.add(prim_box(0.3, 0.05, 0.3), 'iron', M((x, Y0 + 1.19, z)))
    # mesa de estudo: livros empilhados, pergaminho, vela e poções (canto frontal esquerdo)
    mb.add(prim_box(1.1, 0.07, 0.62, base=True), 'wood', M((-2.0, Y0 + 0.62, 1.3), (0, 18, 0)), bevel=0.015)
    for dx, dz in ((-0.45, -0.22), (0.45, -0.22), (-0.45, 0.22), (0.45, 0.22)):
        mb.add(prim_box(0.07, 0.62, 0.07, base=True), 'wood_beam', M((-2.0, Y0, 1.3), (0, 18, 0)) @ M((dx, 0, dz)))
    T = M((-2.0, Y0 + 0.69, 1.3), (0, 18, 0))
    for k, m in enumerate(('book_r', 'book_g', 'book_b')):
        mb.add(prim_box(0.34 - 0.03 * k, 0.07, 0.24), m, T @ M((-0.3, 0.035 + 0.07 * k, 0.0), (0, 8 * k, 0)), bevel=0.008)
        mb.add(prim_box(0.31 - 0.03 * k, 0.045, 0.22), 'paper', T @ M((-0.3 + 0.01, 0.035 + 0.07 * k, 0.01), (0, 8 * k, 0)))
    mb.add(prim_cyl(0.05, 0.05, 0.22, 8, base=True), 'paper', T @ M((0.05, 0.0, 0.05), (0, 0, 88)))
    mb.add(prim_cyl(0.03, 0.03, 0.12, 6, base=True), 'paper', T @ M((0.3, 0.0, -0.1)))
    mb.add(prim_cone(0.025, 0.06, 5, base=True), 'glow', T @ M((0.3, 0.12, -0.1)))
    for k in range(2):
        mb.add(prim_sphere(0.06, 0.07, 0.06, 6, 3), 'potion', T @ M((0.12 + k * 0.14, 0.09, -0.15)), smooth=70)
        mb.add(prim_cyl(0.02, 0.02, 0.06, 6, base=True), 'wood', T @ M((0.12 + k * 0.14, 0.15, -0.15)))
    # caixotes e barris de reagentes (canto frontal direito)
    mb.add(prim_box(0.7, 0.55, 0.7, base=True), 'wood', M((2.05, Y0, 1.35), (0, -12, 0)), bevel=0.03)
    mb.add(prim_box(0.72, 0.06, 0.72), 'iron', M((2.05, Y0 + 0.5, 1.35), (0, -12, 0)))
    mb.add(prim_box(0.5, 0.4, 0.5, base=True), 'wood', M((2.2, Y0 + 0.55, 1.38), (0, 20, 0)), bevel=0.03)
    for (bx, bz) in ((1.7, 2.1), (2.3, 2.0)):
        mb.add(prim_rings([ring_h(0.0, 0.24, 0.24, 8), ring_h(0.28, 0.29, 0.29, 8), ring_h(0.56, 0.24, 0.24, 8)]), 'wood',
               M((bx, Y0, bz)), smooth=50)
        for y in (0.12, 0.44):
            mb.add(prim_cyl(0.285, 0.285, 0.05, 8), 'iron', M((bx, Y0 + y, bz)))
    mb.add(prim_sphere(0.2, 0.12, 0.2, 7, 3), 'potion', M((1.7, Y0 + 0.56, 2.1)), smooth=70)
    # aglomerados de cristal azul brotando do chão (parte de trás do plinto)
    for (cx, cz, k) in ((-1.9, -2.2, 1.0), (2.2, -1.8, 0.85), (0.3, -2.75, 0.7)):
        for j in range(4):
            a = j * 1.57 + k
            h = (0.55 + 0.35 * ((j * 7) % 3) / 2) * k
            mb.add(prim_cone(0.12 * k, h, 5, base=True), 'crystal',
                   M((cx + math.sin(a) * 0.16 * k, Y0, cz + math.cos(a) * 0.16 * k), (14 * math.cos(a), 0, -14 * math.sin(a))), smooth=0)
        mb.add(prim_sphere(0.34 * k, 0.1 * k, 0.3 * k, 6, 3), 'stone_dark', M((cx, Y0 + 0.02, cz)), smooth=40)
    # faixa de runas luminosas sob a coroa e lanternas penduradas no balcão
    for k in range(8):
        T = polar(k * 45 + 22.5, face_d(6.3) + 0.03, 6.3)
        mb.add(prim_extrude([(0, 0.11), (0.07, 0), (0, -0.11), (-0.07, 0)], 0.04, axis='z'), 'rune', T)
    for k in range(4):
        a = 20 + k * 90
        P = polar(a, 2.34, 4.92 + 0.62)
        mb.add(prim_box(0.05, 0.3, 0.05), 'iron', P @ M((0, 0.0, 0.0)))
        mb.add(prim_box(0.16, 0.2, 0.16), 'glow', P @ M((0, -0.12, 0.0)))
        mb.add(prim_cone(0.14, 0.12, 4, base=True, phase=math.pi / 4), 'iron', P @ M((0, 0.0, 0.0)))
    # heras e musgo na base
    for (mx, mz, ms) in ((-2.6, -1.2, 1.0), (2.7, -0.4, 0.9), (0.6, -2.7, 1.1), (-1.5, -2.5, 0.8)):
        mb.add(prim_sphere(0.35 * ms, 0.16 * ms, 0.3 * ms, 6, 3), 'moss', M((mx, Y0 + 0.02, mz)), smooth=70)
    return mb.build(mats, parent=root)


def build_crystal(mats, root):
    mb = MeshBuilder('Anim_Crystal')
    cy = 8.4
    # cristal principal facetado (bipirâmide alongada) + núcleo claro
    mb.add(prim_cone(0.52, 1.0, 6, base=True), 'crystal', M((0, cy, 0)), smooth=0, bevel=0.005)
    mb.add(prim_cone(0.52, 0.8, 6, base=True), 'crystal', M((0, cy, 0), (180, 0, 0)), smooth=0, bevel=0.005)
    mb.add(prim_cone(0.22, 0.55, 6, base=True), 'core', M((0, cy, 0)), smooth=0)
    mb.add(prim_cone(0.22, 0.45, 6, base=True), 'core', M((0, cy, 0), (180, 0, 0)), smooth=0)
    # anéis dourados de astrolábio inclinados + marcas rúnicas
    torus(mb, M((0, cy + 0.05, 0), (0, 0, 0)), 1.05, 0.04, 'gold')
    torus(mb, M((0, cy + 0.05, 0), (62, 0, 0)), 1.18, 0.035, 'gold')
    torus(mb, M((0, cy + 0.05, 0), (-62, 55, 0)), 1.3, 0.035, 'gold')
    for k in range(6):
        a = 2 * math.pi * k / 6
        mb.add(prim_box(0.1, 0.1, 0.1), 'rune', M((math.sin(a) * 1.05, cy + 0.05, math.cos(a) * 1.05), (0, math.degrees(a), 45)), bevel=0.01)
    # estilhaços orbitando
    for k in range(5):
        a = 2 * math.pi * k / 5 + 0.3
        h = 0.5 * math.sin(k * 2.1)
        mb.add(prim_cone(0.1, 0.22, 4, base=True), 'crystal', M((math.sin(a) * 0.8, cy + h, math.cos(a) * 0.8), (20 * k, 30 * k, 0)), smooth=0)
        mb.add(prim_cone(0.1, 0.16, 4, base=True), 'crystal', M((math.sin(a) * 0.8, cy + h, math.cos(a) * 0.8), (180 + 20 * k, 30 * k, 0)), smooth=0)
    # feixe de energia ligando a copa ao cristal
    mb.add(prim_cyl(0.07, 0.05, 0.9, 6, base=True), 'rune', M((0, 6.7 + 1.1, 0)), smooth=60)
    return mb.build(mats, parent=root)


def build_banners(mats, root):
    mb = MeshBuilder('Anim_Banners')
    BY = 4.92

    def pennant(T, w, h, wave, tail=True):
        pts = [(-w / 2, 0.0), (w / 2, 0.0), (w / 2, -h), (0.0, -h * 0.82) if tail else (0.0, -h), (-w / 2, -h)]
        verts, faces = prim_extrude(pts, 0.035, axis='z')
        verts = [(x, y, z + wave * math.sin(y * 5.0 + x * 2.0)) for (x, y, z) in verts]
        mb.add((verts, faces), 'team', T, smooth=40)
    # estandartes longos pendurados do balcão
    for a in (0, 180, 270):
        T = polar(a, 2.32, BY + 0.05)
        pennant(T @ M((0, -0.05, 0.02)), 0.62, 1.9, 0.05)
        mb.add(prim_box(0.8, 0.07, 0.07), 'gold', T @ M((0, 0.0, 0.0)))
        mb.add(prim_box(0.22, 0.22, 0.02), 'gold', T @ M((0, -1.0, 0.07), (0, 0, 45)), bevel=0.004)
    # flâmulas nos mastros do pavilhão
    for a in (45, 135, 225, 315):   # bandeirolas nos pináculos
        P = polar(a, 1.95, 6.7 + 1.9)
        pennant(P @ M((0, 0.1, 0.0), (0, 90, 0)) @ M((0.28, 0, 0)), 0.55, 0.36, 0.04, tail=True)
    # panos laterais sobre a porta
    mb.add(prim_extrude([(-0.45, 0.0), (0.45, 0.0), (0.45, -1.0), (0.0, -0.75), (-0.45, -1.0)], 0.04, axis='z'), 'team',
           M((0, 3.25 + 0.15, face_d(2.5) + 0.2)), smooth=40)
    return mb.build(mats, parent=root)


def main():
    args = C.script_args()
    C.reset_scene()
    mats = C.make_paint_set(PALETTE)
    root = C.make_empty('ArcaneTower')
    base = build_base(mats, root)
    tower = build_tower(mats, root)
    crown = build_crown(mats, root)
    props = build_props(mats, root)
    crystal = build_crystal(mats, root)
    banners = build_banners(mats, root)
    bake_set = [base, tower, crown, props, crystal, banners]
    bpy.context.view_layer.update()
    C.uv_atlas(bake_set, weights={'Base': 0.6, 'Tower': 1.0, 'Crown': 1.0, 'Props': 1.0, 'Anim_Crystal': 1.0, 'Anim_Banners': 1.0},
               margin=0.004, angle=50.0)
    img = C.bake_atlas(bake_set, 'arcane_tower_atlas', int(os.environ.get('ATLAS', 1024)),
                       samples=int(os.environ.get('BAKE_SAMPLES', 32)), margin=6)
    C.finalize_materials(bake_set, img, team_default=TEAM_DEFAULT,
                         out_png=os.path.join(C.BUILD_DIR, 'arcane_tower_atlas.png'))
    static = C.join_objects([base, tower, crown, props], 'Static_Mesh')
    static.parent = root
    C.make_empty('Socket_UnitSpawn', (0, 0, 4.4), parent=root)
    C.make_empty('Socket_Rally', (0, 0, 6.4), parent=root)
    bpy.context.view_layer.update()
    out = os.path.join(C.OUT_MODELS, 'arcane_tower.glb')
    C.export_glb(root, out, quality=80)
    print('STATS arcane_tower', C.stats(root, out))
    print('BBOX', bbox_game(root))
    if '--no-render' not in args:
        rig = C.RenderRig(root, 'arcane_tower', res=int(os.environ.get('RENDER_RES', 800)), samples=24)
        rig.render('34', (1.0, 0.95, 1.0), 30)
        rig.render('front', (0.0, 0.35, 1.0), 30)
        rig.render('back', (-0.8, 0.8, -1.0), 30)
        rig.render('side', (1.0, 0.25, 0.0), 30)
        rig.render('game', (45, 44, 45), 30, dist=78)
        C.set_team_color('#d23a2c')
        rig.render('34_vermelho', (1.0, 0.95, 1.0), 30)


if __name__ == '__main__':
    main()
