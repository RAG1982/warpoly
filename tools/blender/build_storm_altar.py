"""
build_storm_altar.py — Altar das Tempestades orc (tipo interno `storm_altar`) gerado 100% por script.

Uso:
  blender -b --factory-startup --python tools/blender/build_storm_altar.py -- [--no-render]

Saída (public/models/storm_altar.glb), coordenadas do jogo, origem no centro da base, frente = +Z:
  StormAltar (raiz)
  ├─ Static_Mesh       praça circular de basalto em 2 níveis, círculo de runas ciano, seis menires com crânios,
  │                    chifres e cristais, altar central com crânio de ogro, aglomerado de cristais de tempestade em
  │                    anel de ferro, pilão traseiro de basalto com chifres e cristal-mestre, raios congelados (tubos
  │                    luminosos) ligando os cristais, tambores de guerra, totens e ossadas (Atlas, brilho pintado)
  ├─ Anim_Banners      estandartes rasgados dos totens e do pilão (material TeamColor)
  ├─ Socket_UnitSpawn  saída das unidades (frente da escadaria)
  └─ Socket_Rally      ponto de reunião padrão
Pegada ~6,6 x 6,6 (raio de colisão 3,4), altura ~8,6. 2 draw calls, atlas 1024².
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
from bld_common import beam, tube, log, skull, bbox_game  # noqa: E402

TEAM_DEFAULT = '#d23a2c'
_orig_add = MeshBuilder.add


def _lean_add(self, prim, mat, m=None, bevel=0.0, **kw):
    """Orçamento de triângulos: bisel só em peças grandes (o desgaste de borda é pintado no bake)."""
    if bevel and len(prim[1]) <= 14 and bevel < 0.035:
        bevel = 0.0
    return _orig_add(self, prim, mat, m, bevel=bevel, **kw)


MeshBuilder.add = _lean_add

T1, T2 = 0.4, 0.75        # topos dos dois níveis da praça
SPIRE_Z = -1.9
ALT_Y = 1.6               # topo do pedestal do altar

BAS = dict(base='#3b4252', var='#262b38', var_scale=0.5, var_amt=0.9, fine=0.09, pattern='bricks', mapping='box',
           pw=1.1, ph=0.42, mortar='#14171f', mortar_size=0.035, brick_tint='#4e576a', brick_tint_amt=0.5,
           brick_dark=0.75, brick_lite=1.12, grad=(0.0, 4.0, 0.25), top=0.25, edge='#a3aec6', edge_amt=0.5,
           edge_r=0.06, edge_gain=7.0, ao=(1.2, 0.75), ao_pow=1.3)
PALETTE = {
    'basalt': BAS,
    'basalt_dark': dict(BAS, base='#272b37', var='#171a22', brick_tint='#353b4a', pw=1.6, ph=0.5),
    'basalt_light': dict(BAS, base='#59627a', var='#3f475b', pattern=None, edge_amt=0.7),
    'slab': dict(BAS, base='#30343f', var='#20232d', pw=0.9, ph=0.9, brick_tint='#434958', grad=None, ao=(1.3, 0.85)),
    'bone': dict(base='#e6dab4', var='#bfae7e', var_scale=5.0, var_amt=0.85, fine=0.08, top=0.3, edge='#fff8de',
                 edge_amt=0.5, edge_r=0.03, ao=(0.3, 0.6)),
    'bone_dark': dict(base='#a39877', var='#76694a', var_scale=4.0, var_amt=0.8, fine=0.1, top=0.2, ao=(0.3, 0.6)),
    'iron': dict(base='#454a55', var='#2d313a', var_scale=4.0, var_amt=0.8, fine=0.12, top=0.3, edge='#b4bccb',
                 edge_amt=0.8, edge_r=0.02, ao=(0.4, 0.55)),
    'rust': dict(base='#6b4a38', var='#9a5a2c', var_scale=6.0, var_amt=0.9, fine=0.2, top=0.3, edge='#cfa87a',
                 edge_amt=0.6, edge_r=0.02, ao=(0.4, 0.6)),
    'wood': dict(base='#5a3a22', var='#38220f', var_scale=2.0, fine=0.1, top=0.2, edge='#8f6a44', edge_amt=0.4,
                 edge_r=0.025, ao=(0.5, 0.6)),
    'hide': dict(base='#8a6a48', var='#5e4630', var_scale=5.0, var_amt=0.9, fine=0.16, top=0.3, edge='#c19a6c',
                 edge_amt=0.4, edge_r=0.03, ao=(0.3, 0.6)),
    'ash': dict(base='#8c8e9a', var='#5a5c68', var_scale=3.0, var_amt=0.9, fine=0.16, top=0.45, ao=(0.5, 0.5)),
    'dark': dict(base='#08070a', var='#08070a'),
    'storm': dict(base='#5ad8ff', var='#2a8fe8', var_scale=2.0, var_amt=0.9, top=0.5, emit_boost=1.2,
                  edge='#ecfcff', edge_amt=0.9, edge_r=0.05, edge_gain=7.0),
    'core': dict(base='#f2fdff', var='#b6f0ff', var_scale=3.0, emit_boost=1.3),
    'rune': dict(base='#7ae8ff', var='#3fc0f0', var_scale=6.0, emit_boost=1.2),
    'bolt': dict(base='#f4fdff', var='#a6ecff', var_scale=3.0, emit_boost=1.3),
    'team': dict(base='#bab2a6', var='#a0988c', var_scale=2.0, fine=0.08, top=0.2, edge='#dcd6cc', edge_amt=0.3,
                 edge_r=0.03, ao=(0.8, 0.6), team=True),
}


def polar(a_deg, d, y):
    a = math.radians(a_deg)
    return M((d * math.sin(a), y, d * math.cos(a)), (0, a_deg, 0))


def skull_lite(mb, T, s=1.0):
    """Crânio simplificado (calota + maxilar + órbitas), frente em +z: ~60 triângulos."""
    mb.add(prim_sphere(0.4 * s, 0.34 * s, 0.4 * s, 7, 3), 'bone', T @ M((0, 0.06 * s, 0)), smooth=65)
    mb.add(prim_box(0.36 * s, 0.2 * s, 0.3 * s, taper=(0.85, 0.9)), 'bone', T @ M((0, -0.22 * s, 0.14 * s)))
    for sx in (-1, 1):
        mb.add(prim_box(0.15 * s, 0.14 * s, 0.1 * s), 'dark', T @ M((sx * 0.15 * s, -0.02 * s, 0.33 * s)))
    mb.add(prim_box(0.07 * s, 0.1 * s, 0.07 * s), 'dark', T @ M((0, -0.14 * s, 0.4 * s)))


def crystal(mb, T, h, r, tilt=(0, 0, 0), core=True):
    """Cristal de tempestade (prisma pontudo) com núcleo luminoso."""
    mb.add(prim_sphere(r, h, r, 6, 3), 'storm', T @ M((0, h, 0), tilt), smooth=0)
    if core:
        mb.add(prim_sphere(r * 0.45, h * 0.6, r * 0.45, 5, 3), 'core', T @ M((0, h, 0), tilt), smooth=0)


def zigzag(a, b, n=9, amp=0.28, seed=0):
    """Pontos de um raio congelado de a até b (jitter lateral determinístico)."""
    a, b = Vector(a), Vector(b)
    d = (b - a).normalized()
    side = d.cross(Vector((0, 1, 0)))
    if side.length < 1e-3:
        side = Vector((1, 0, 0))
    side.normalize()
    up = side.cross(d).normalized()
    pts = []
    for i in range(n + 1):
        t = i / n
        p = a.lerp(b, t)
        if 0 < i < n:
            s = math.sin((i * 2.7 + seed * 1.9)) * amp
            u = math.cos((i * 1.9 + seed * 2.3)) * amp * 0.7
            p = p + side * s + up * u
        pts.append(tuple(p))
    return pts


def torus(mb, T, R, r, mat, n=16, seg=5):
    pts = [(math.cos(2 * math.pi * i / n) * R, 0.0, math.sin(2 * math.pi * i / n) * R) for i in range(n + 1)]
    pts = [tuple(T @ Vector(p)) for p in pts]
    mb.add(prim_rings(limb_rings(pts, [r] * len(pts), seg, up=(0, 1, 0)), cap0=False, cap1=False), mat, smooth=60)


MEN_ANG = (30, 90, 150, 210, 270, 330)
MEN_H = {30: 2.3, 90: 3.2, 150: 3.0, 210: 3.0, 270: 3.2, 330: 2.3}
SP_H = 4.7
MEN_R = 2.4


def menhir_top(a):
    return Vector((MEN_R * math.sin(math.radians(a)), T2 + MEN_H[a] + 0.6, MEN_R * math.cos(math.radians(a))))


def build_base(mats, root):
    mb = MeshBuilder('Base')
    mb.add(prim_cyl(3.3, 3.2, T1, 10, base=True), 'basalt_dark', bevel=0.07)
    mb.add(prim_cyl(2.75, 2.65, T2 - T1, 10, base=True), 'basalt', M((0, T1, 0)), bevel=0.06)
    mb.add(prim_cyl(2.3, 2.3, 0.05, 10, base=True), 'slab', M((0, T2, 0)))
    for (r0, r1) in ((1.95, 2.03), (1.45, 1.5)):
        mb.add(prim_rings([ring_h(T2 + 0.05, r0, r0, 24), ring_h(T2 + 0.068, r0, r0, 24), ring_h(T2 + 0.068, r1, r1, 24),
                           ring_h(T2 + 0.05, r1, r1, 24)], cap0=False, cap1=False), 'rune', smooth=0)
    for k in range(10):
        a = math.radians(k * 36 + 18)
        mb.add(prim_box(0.07, 0.02, 0.38), 'rune', M((math.sin(a) * 1.72, T2 + 0.06, math.cos(a) * 1.72), (0, math.degrees(a), 0)))
    # fendas de energia nas laterais
    for k in range(10):
        a = k * 36 + 18
        P = polar(a, 3.18, T1 - 0.07)
        mb.add(prim_box(0.5, 0.05, 0.03), 'rune', P @ M((0, 0, 0.0)))
    # escadaria frontal de pedra com degraus largos
    mb.add(prim_box(2.8, 0.20, 0.5, base=True), 'basalt_light', M((0, 0.0, 3.55)), bevel=0.02)
    mb.add(prim_box(2.3, 0.58, 0.42, base=True), 'basalt_light', M((0, 0.0, 2.92)), bevel=0.02)
    for sx in (-1, 1):
        mb.add(prim_box(0.35, 0.95, 1.1, taper=(1.0, 0.5), base=True), 'basalt_dark', M((sx * 1.4, 0.0, 3.0)))
    return mb.build(mats, parent=root)


def menhir(mb, a, h):
    P = polar(a, MEN_R, T2)
    mb.add(prim_box(0.8, h, 0.6, taper=(0.55, 0.6), base=True), 'basalt', P, bevel=0.04)
    mb.add(prim_box(0.95, 0.3, 0.75, taper=(0.85, 0.85), base=True), 'basalt_dark', P)
    # runas luminosas na face interna (voltada ao altar)
    for k in range(3):
        mb.add(prim_box(0.1, 0.42, 0.04), 'rune', P @ M((0, 0.9 + k * 0.65, -0.26)))
        mb.add(prim_box(0.34 - 0.07 * k, 0.06, 0.04), 'rune', P @ M((0, 1.05 + k * 0.65, -0.26)))
    # crânio frontal (para o centro), chifres curvos e cristal no topo
    skull_lite(mb, P @ M((0, h * 0.62, -0.30), (0, 180, 0)), 0.55)
    mb.add(prim_cyl(0.25, 0.18, 0.12, 6, base=True), 'iron', P @ M((0, h, 0)))
    for sx in (-1, 1):
        pts = bezier((sx * 0.16, h + 0.02, 0.0), (sx * 0.62, h + 0.18, 0.0), (sx * 0.52, h + 0.78, 0.05), 4)
        pts = [tuple(P @ Vector(p)) for p in pts]
        tube(mb, pts, [0.075, 0.062, 0.045, 0.024, 0.006], 'bone', n=6, smooth=60)
    crystal(mb, P @ M((0, h + 0.1, 0)), 0.46, 0.14)


def build_menhirs(mats, root):
    mb = MeshBuilder('Menhirs')
    for a in MEN_ANG:
        menhir(mb, a, MEN_H[a])
    return mb.build(mats, parent=root)


def build_altar(mats, root):
    mb = MeshBuilder('Altar')
    mb.add(prim_cyl(1.4, 1.1, ALT_Y - T2, 8, base=True), 'basalt_dark', M((0, T2, 0)), bevel=0.05)
    mb.add(prim_cyl(1.5, 1.45, 0.14, 8, base=True), 'iron', M((0, T2, 0)))
    mb.add(prim_box(2.5, 0.36, 1.6, taper=(0.95, 0.95), base=True), 'slab', M((0, ALT_Y, 0)), bevel=0.04)
    mb.add(prim_box(2.56, 0.07, 1.66), 'rune', M((0, ALT_Y + 0.05, 0)))
    mb.add(prim_box(2.4, 0.04, 1.5), 'slab', M((0, ALT_Y + 0.35, 0)))
    # crânio de ogro grande na frente do pedestal, com chifres e presas
    skull(mb, M((0, 1.25, 1.05), (-8, 0, 0)), 0.95)
    # pontas de osso em volta do pedestal
    for k in range(6):
        a = k * 60 + 30
        if abs(((a + 180) % 360) - 180) < 40:
            continue
        mb.add(prim_cone(0.09, 0.5, 5, base=True), 'bone', polar(a, 1.25, ALT_Y - 0.55) @ M(r=(-70, 0, 0)), smooth=40)
    # aglomerado de cristais de tempestade no topo do altar
    base_y = ALT_Y + 0.38
    crystal(mb, M((0, base_y, 0)), 1.05, 0.34, tilt=(4, 0, -3))
    for k in range(5):
        a = math.radians(k * 72 + 20)
        crystal(mb, M((math.sin(a) * 0.62, base_y - 0.06, math.cos(a) * 0.5), (0, 0, 0)), 0.55 + 0.1 * (k % 2), 0.17,
                tilt=(math.cos(a) * 22, 0, -math.sin(a) * 22))
    # anel de ferro com cravos flutuando em volta do cristal (preso por 4 escoras de osso)
    RY = base_y + 1.15
    torus(mb, M((0, RY, 0)), 0.95, 0.06, 'iron', n=16, seg=5)
    for k in range(8):
        a = math.radians(k * 45)
        mb.add(prim_cone(0.07, 0.3, 4, base=True), 'iron', M((math.sin(a) * 0.98, RY, math.cos(a) * 0.98), (math.cos(a) * 90, 0, -math.sin(a) * 90)), smooth=0)
    for sx in (-1, 1):
        for sz in (-1, 1):
            beam(mb, (sx * 1.0, ALT_Y + 0.36, sz * 0.55), (sx * 0.72, RY - 0.05, sz * 0.62), 0.09, 0.09, 'bone')
    return mb.build(mats, parent=root)


def build_spire(mats, root):
    mb = MeshBuilder('Spire')
    P = M((0, T2, SPIRE_Z))
    h = SP_H
    mb.add(prim_box(1.1, 0.5, 1.0, taper=(0.9, 0.9), base=True), 'basalt_dark', P)
    mb.add(prim_box(0.95, h, 0.85, taper=(0.42, 0.42), base=True), 'basalt_dark', P @ M((0, 0.45, 0)), bevel=0.04)
    for y in (1.2, 2.4, 3.6):
        w = 0.95 - (0.95 * 0.58) * ((y - 0.45) / h) + 0.1
        mb.add(prim_box(w, 0.14, w * 0.9), 'iron', P @ M((0, y, 0)))
    # crânio frontal e runas
    skull(mb, P @ M((0, 2.2, 0.42)), 0.95)
    for k in range(4):
        mb.add(prim_box(0.08, 0.34, 0.04), 'rune', P @ M((0, 2.95 + k * 0.42, 0.34 - 0.04 * k)))
    # coroa de chifres gigantes e cristal-mestre
    top = h + 0.45
    mb.add(prim_cyl(0.42, 0.32, 0.18, 8, base=True), 'iron', P @ M((0, top - 0.05, 0)))
    for sx in (-1, 1):
        pts = bezier((sx * 0.3, top, 0.0), (sx * 1.35, top + 0.3, 0.0), (sx * 1.0, top + 1.9, 0.0), 6)
        pts = [tuple(P @ Vector(p)) for p in pts]
        tube(mb, pts, [0.16, 0.14, 0.11, 0.08, 0.05, 0.02, 0.006], 'bone', n=6, smooth=60)
    crystal(mb, P @ M((0, top + 0.1, 0)), 0.9, 0.3, core=True)
    mb.add(prim_cone(0.06, 0.7, 5, base=True), 'iron', P @ M((0, top + 1.95, 0)), smooth=0)
    return mb.build(mats, parent=root)


def build_bolts(mats, root):
    mb = MeshBuilder('Bolts')
    spire_top = (0.0, T2 + SP_H + 0.45 + 1.0, SPIRE_Z)
    altar_top = (0.0, ALT_Y + 0.38 + 2.0, 0.0)
    arcs = [(spire_top, altar_top, 11, 0.34, 0)]
    for a in (150, 210):
        t = menhir_top(a)
        arcs.append(((0.0, spire_top[1] - 0.3, SPIRE_Z), (t.x, t.y + 0.2, t.z), 8, 0.26, a))
    for a in (90, 270):
        t = menhir_top(a)
        arcs.append(((t.x, t.y + 0.2, t.z), (0.0, altar_top[1] - 0.3, 0.0), 9, 0.3, a))
    for (p, q, n, amp, seed) in arcs:
        pts = zigzag(p, q, n=n, amp=amp, seed=seed)
        tube(mb, pts, [0.05] * len(pts), 'bolt', n=4, smooth=0)
    return mb.build(mats, parent=root)


def build_props(mats, root):
    mb = MeshBuilder('Props')
    # tambores de guerra de couro com cravos de osso e raio pintado
    for sx in (-1, 1):
        D = M((sx * 1.7, T2, 1.75))
        mb.add(prim_cyl(0.5, 0.42, 0.75, 10, base=True), 'wood', D, smooth=30)
        mb.add(prim_cyl(0.52, 0.52, 0.08, 10, base=True), 'iron', D @ M((0, 0.72, 0)))
        mb.add(prim_cyl(0.46, 0.46, 0.05, 10, base=True), 'hide', D @ M((0, 0.76, 0)))
        for k in range(10):
            a = math.radians(k * 36)
            mb.add(prim_cone(0.045, 0.14, 4, base=True), 'bone', D @ M((math.sin(a) * 0.5, 0.74, math.cos(a) * 0.5)), smooth=0)
        mb.add(prim_extrude([(0.03, 0.2), (-0.1, 0.0), (0.0, 0.0), (-0.04, -0.2), (0.1, 0.03), (0.0, 0.03)], 0.03, axis='z'), 'rune',
               D @ M((0, 0.38, 0.46), (0, sx * -30, 0)))
        # baquetas cruzadas
        mb.add(prim_cyl(0.025, 0.025, 0.5, 5, base=False), 'bone', D @ M((0.05, 0.82, 0.0), (0, 20, 80)))
    # totens de caveira com estandarte (haste, travessa, crânio, chifres)
    for sx in (-1, 1):
        x, z = sx * 2.6, 1.25
        log(mb, (x, T2, z), (x, T2 + 3.7, z), 0.1, 'wood', n=6, tip=0.0)
        mb.add(prim_box(1.0, 0.09, 0.09), 'bone', M((x, T2 + 3.5, z)))
        skull_lite(mb, M((x, T2 + 3.95, z), (0, sx * 20, 0)), 0.75)
        for k in range(2):
            mb.add(prim_cone(0.06, 0.4, 5, base=True), 'bone', M((x + (k - 0.5) * 0.4, T2 + 4.25, z)), smooth=0)
        mb.add(prim_cyl(0.2, 0.22, 0.25, 8, base=True), 'basalt_dark', M((x, T2, z)))
    # montes de crânios e ossadas, lanças e machados cravados
    for (bx, bz, k) in ((-2.7, -0.6, 1.0), (2.8, -0.3, 0.9), (0.9, -2.7, 0.8)):
        for j in range(5):
            skull_lite(mb, M((bx + 0.28 * math.sin(j * 1.9), T1 + 0.18 + 0.26 * (j // 3), bz + 0.28 * math.cos(j * 1.9)), (0, j * 70, 0)), 0.5 * k)
        mb.add(prim_sphere(0.6 * k, 0.15, 0.6 * k, 7, 3, y_min=0.0), 'bone_dark', M((bx, T1 + 0.05, bz)), smooth=60)
    for (a, d) in ((20, 3.05), (-20, 3.05), (160, 3.0), (-160, 3.0), (100, 3.1), (-100, 3.1)):
        P = polar(a, d, 0.0)
        log(mb, tuple(P @ Vector((0, 0, 0))), tuple(P @ Vector((0, 2.0, 0.0))), 0.05, 'wood', n=5)
        mb.add(prim_cone(0.09, 0.4, 4, base=True), 'iron', P @ M((0, 2.0, 0.0)))
    # braseiros de pedra com chama azul-cristal nos degraus laterais
    for sx in (-1, 1):
        B = M((sx * 2.45, T1, 2.35))
        mb.add(prim_cyl(0.3, 0.2, 0.45, 8, base=True), 'basalt_dark', B)
        mb.add(prim_cyl(0.4, 0.28, 0.25, 8, base=True), 'iron', B @ M((0, 0.45, 0)), smooth=30)
        mb.add(prim_cone(0.26, 0.6, 5, base=True), 'storm', B @ M((0, 0.7, 0)), smooth=0)
    return mb.build(mats, parent=root)


def build_banners(mats, root):
    mb = MeshBuilder('Anim_Banners')

    def strip(T, w, h, wave=0.05):
        pts = [(-w / 2, 0.0), (w / 2, 0.0), (w / 2, -h * 0.9), (w / 4, -h * 0.75), (0.0, -h), (-w / 4, -h * 0.8), (-w / 2, -h * 0.95)]
        verts, faces = prim_extrude(pts, 0.035, axis='z')
        verts = [(x, y, z + wave * math.sin(y * 4.0 + x * 3.0)) for (x, y, z) in verts]
        mb.add((verts, faces), 'team', T, smooth=40)
    for sx in (-1, 1):
        strip(M((sx * 2.6, T2 + 3.45, 1.32), (0, sx * 10, 0)), 0.75, 1.9, 0.07)
    # pano rasgado no pilão
    strip(M((0, T2 + 4.1, SPIRE_Z + 0.4)), 0.55, 1.3, 0.06)
    return mb.build(mats, parent=root)


def main():
    args = C.script_args()
    C.reset_scene()
    mats = C.make_paint_set(PALETTE)
    root = C.make_empty('StormAltar')
    parts = [build_base(mats, root), build_menhirs(mats, root), build_altar(mats, root), build_spire(mats, root),
             build_bolts(mats, root), build_props(mats, root)]
    banners = build_banners(mats, root)
    bake_set = parts + [banners]
    bpy.context.view_layer.update()
    C.uv_atlas(bake_set, weights={'Base': 0.6, 'Menhirs': 1.0, 'Altar': 1.0, 'Spire': 1.0, 'Bolts': 0.5, 'Props': 1.0,
                                  'Anim_Banners': 1.0}, margin=0.004, angle=50.0)
    img = C.bake_atlas(bake_set, 'storm_altar_atlas', int(os.environ.get('ATLAS', 1024)),
                       samples=int(os.environ.get('BAKE_SAMPLES', 32)), margin=6)
    C.finalize_materials(bake_set, img, team_default=TEAM_DEFAULT,
                         out_png=os.path.join(C.BUILD_DIR, 'storm_altar_atlas.png'))
    static = C.join_objects(parts, 'Static_Mesh')
    static.parent = root
    C.make_empty('Socket_UnitSpawn', (0, 0, 4.6), parent=root)
    C.make_empty('Socket_Rally', (0, 0, 6.6), parent=root)
    bpy.context.view_layer.update()
    out = os.path.join(C.OUT_MODELS, 'storm_altar.glb')
    C.export_glb(root, out, quality=80)
    print('STATS storm_altar', C.stats(root, out))
    print('BBOX', bbox_game(root))
    if '--no-render' not in args:
        rig = C.RenderRig(root, 'storm_altar', res=int(os.environ.get('RENDER_RES', 800)), samples=24)
        rig.render('34', (1.0, 0.95, 1.0), 30)
        rig.render('front', (0.0, 0.35, 1.0), 30)
        rig.render('back', (-0.8, 0.8, -1.0), 30)
        rig.render('side', (1.0, 0.25, 0.0), 30)
        rig.render('game', (45, 44, 45), 30, dist=78)
        C.set_team_color('#3a66d6')
        rig.render('34_azul', (1.0, 0.95, 1.0), 30)


if __name__ == '__main__':
    main()
