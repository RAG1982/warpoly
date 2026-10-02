"""
build_oil_platform.py — Plataforma de Petróleo humana (tipo `oil_platform`) gerada 100% por script (ART-naval-buildings).
Referência: docs/refs/naval/human_naval_buildings_ref.png (direita, "Poço de Petróleo Humano").

Uso:
  blender -b --factory-startup --python tools/blender/build_oil_platform.py -- [--no-render]

Saída (public/models/oil_platform.glb), coordenadas do jogo, y = 0 NO NÍVEL DA ÁGUA (os pilares descem até y = -1):
  OilPlatform (raiz)
  ├─ Static_Mesh       blocos de pedra, pilares de madeira com chapas de aço, convés, torre de perfuração em treliça,
  │                    3 tanques enferrujados com tubulações, casinha com chaminé, barris, bancada (Atlas)
  ├─ Anim_Banners      galhardete da antena, toldo e friso da casinha (TeamColor)
  ├─ Anim_Smoke        fumaça preta da chaminé (pivô no topo da chaminé)
  ├─ Anim_Crane        lança do guindaste com corda e gancho (pivô no topo da coluna)
  ├─ Anim_Drill        haste de perfuração (pivô no centro da torre; sobe/desce/gira)
  ├─ Socket_UnitSpawn  ponto de atracação (frente, +Z)
  └─ Socket_Rally      ponto de reunião padrão
Pegada ~5,0 x 5,0 (blocos de pedra), altura ~7,6.
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
from bld_common import beam, tube, log, finish_building  # noqa: E402
import bld_house as H  # noqa: E402
import build_stable as S  # noqa: E402
import naval_common as N  # noqa: E402
from naval_common import Piv  # noqa: E402

TEAM_DEFAULT = '#3a66d6'
DK = 2.5            # topo do convés
HS = 2.35           # meia-largura do convés
PX = 1.8            # centro dos pilares
DX, DZ = -1.3, -1.3  # centro da torre de perfuração
HX, HZ = 1.68, -1.52  # casinha
HK = 1.04            # escala da casinha
CRX, CRZ = -1.9, 0.9  # guindaste
CHY = DK + 2.47 * HK  # topo da chaminé

PALETTE = dict(S.PALETTE)
PALETTE.update(H.HUMAN_EXTRAS)


def _planks(base, var, pw=1.8, ph=0.19, mortar='#2b190b', tint=None, **kw):
    d = dict(base=base, var=var, var_scale=2.4, fine=0.09, pattern='planks', mapping='box', pw=pw, ph=ph, mortar=mortar,
             mortar_size=0.02, brick_tint=tint or base, brick_tint_amt=0.5, top=0.22, edge='#e0b27a', edge_amt=0.35,
             edge_r=0.02, ao=(0.5, 0.6))
    d.update(kw)
    return d


def _tank(base, var, rust):
    return dict(base=base, var=var, var_scale=1.15, var_amt=1.0, fine=0.2, fine_scale=9.0, top=0.38, edge=rust, edge_amt=0.7,
                edge_r=0.035, edge_gain=6.0, ao=(0.5, 0.6), streaks=(2.0, 0.35, 0.35), grad=(1.8, 4.0, -0.0))


PALETTE['parchment'] = dict(base='#dccb9c', var='#bba877', var_scale=3.0, var_amt=0.8, fine=0.08, top=0.25, edge='#f3e8c6',
                            edge_amt=0.4, edge_r=0.02)
PALETTE.update({
    'deck': _planks('#9a6a3a', '#7a5128', 1.8, 0.2, tint='#b38250', grad=(1.5, 3.5, 0.0)),
    'deck_dark': _planks('#6e4626', '#523219', 1.6, 0.17, tint='#80552e'),
    'stone_blk': dict(base='#aaa79f', var='#85817a', var_scale=0.7, var_amt=0.9, fine=0.08, pattern='bricks', mapping='box',
                      pw=1.1, ph=0.62, mortar='#4e4a43', mortar_size=0.04, brick_tint='#c4baa6', brick_tint_amt=0.55,
                      brick_dark=0.78, brick_lite=1.14, grad=(-1.0, 0.7, 0.45), top=0.25, edge='#e6e0d2', edge_amt=0.6,
                      edge_r=0.06, edge_gain=7.0, ao=(0.9, 0.8)),
    'steel': dict(base='#9aa1ad', var='#7b818d', var_scale=4.0, fine=0.06, top=0.4, edge='#eef2f8', edge_amt=0.8,
                  edge_r=0.012, ao=(0.25, 0.4)),
    'steel_dark': dict(base='#585d68', var='#40444e', var_scale=3.0, fine=0.09, top=0.3, edge='#a8afbb', edge_amt=0.7,
                       edge_r=0.015, ao=(0.3, 0.5)),
    'wood_post': dict(base='#7d4f2b', var='#5f3a1e', var_scale=1.6, fine=0.1, pattern='planks_v', mapping='box', pw=3.0, ph=0.3,
                      mortar='#2e1b0d', mortar_size=0.015, top=0.2, edge='#b88a58', edge_amt=0.4, edge_r=0.03,
                      grad=(-0.2, 1.3, 0.3), ao=(0.6, 0.6)),
    'tank_red': _tank('#c8431f', '#7d2512', '#e88a58'),
    'tank_brown': _tank('#86402a', '#4a2014', '#c57a52'),
    'tank_orange': _tank('#cf4c20', '#8a2c12', '#f09a62'),
    'plaster_rust': dict(base='#d2c9b8', var='#8f5e3e', var_scale=2.4, var_amt=0.7, fine=0.12, top=0.2, edge='#f0e8d8',
                         edge_amt=0.4, edge_r=0.03, ao=(0.7, 0.7), grad=(1.9, 3.7, 0.25)),
    'glass': dict(base='#4a82cc', var='#2f5fa6', var_scale=6.0, fine=0.05, top=0.4, edge='#cfe2ff', edge_amt=0.5, edge_r=0.015),
    'smoke': dict(base='#1f1e22', var='#0e0d10', var_scale=2.5, var_amt=0.8, fine=0.08, top=0.4),
    'smoke_light': dict(base='#47464c', var='#2c2b30', var_scale=2.5, var_amt=0.8, fine=0.08, top=0.4),
    'wood_gold': dict(base='#c79c4a', var='#a57a2c', var_scale=3.0, fine=0.08, pattern='planks_v', mapping='box', pw=3.0, ph=0.2,
                      mortar='#6a4a18', mortar_size=0.012, top=0.35, edge='#f0d38a', edge_amt=0.45, edge_r=0.02, ao=(0.4, 0.6)),
    'hose': dict(base='#6d6b3a', var='#4c4a24', var_scale=14.0, var_amt=0.9, fine=0.14, top=0.3, ao=(0.3, 0.5)),
    'chimney': dict(base='#a9442a', var='#7b2d19', var_scale=1.2, var_amt=0.8, fine=0.1, top=0.3, edge='#e08a60', edge_amt=0.4,
                    edge_r=0.03, ao=(0.5, 0.6)),
    'log_light': dict(base='#c8a56c', var='#9a7a44', var_scale=2.0, fine=0.08, top=0.35, edge='#ecd0a0', edge_amt=0.4, edge_r=0.03,
                      ao=(0.3, 0.5)),
    'paint_yellow': dict(base='#e4b72a', var='#c0921a', var_scale=6.0, top=0.3),
    'paint_red': dict(base='#b4271c', var='#8a190f', var_scale=6.0, top=0.3),
    'paint_blue': dict(base='#2f6ac0', var='#244f94', var_scale=6.0, top=0.3),
    'ceramic': dict(base='#a6a8ae', var='#7c7e86', var_scale=6.0, fine=0.08, top=0.4, edge='#e8eaf0', edge_amt=0.5, edge_r=0.01),
})


# ---------------------------------------------------------------------------
# Pilares, blocos de pedra, convés
# ---------------------------------------------------------------------------
def build_base(mats, root):
    mb = MeshBuilder('Base')
    for sx in (-1, 1):
        for sz in (-1, 1):
            x, z = sx * PX, sz * PX
            # bloco de pedra (da água para baixo até y = -1)
            mb.add(prim_box(1.4, 1.75, 1.4, taper=(0.95, 0.95), base=True), 'stone_blk', M((x, -1.05, z)), bevel=0.07)
            # chapa/colar de aço com parafusos
            mb.add(prim_box(1.0, 0.16, 1.0), 'steel_dark', M((x, 0.76, z)), bevel=0.0)
            N.rivets(mb, [(x + a * 0.4, 0.85, z + b * 0.4) for a in (-1, 1) for b in (-1, 1)], 0.04)
            N.rivets(mb, [(x + a * 0.5, 0.76, z) for a in (-1, 1)] + [(x, 0.76, z + b * 0.5) for b in (-1, 1)], 0.035)
            # pilar de madeira
            mb.add(prim_box(0.66, DK - 0.52 - 0.84, 0.66, base=True), 'wood_post', M((x, 0.84, z)), bevel=0.03)
            # cintas de aço no pé e na cabeça do pilar
            mb.add(prim_box(0.74, 0.1, 0.74), 'steel_dark', M((x, 0.93, z)))
            mb.add(prim_box(0.74, 0.1, 0.74), 'steel_dark', M((x, DK - 0.55 - 0.18, z)))
            N.rivets(mb, [(x + a * 0.36, DK - 0.55 - 0.18, z + b * 0.2) for a in (-1, 1) for b in (-1, 1)], 0.03)
    # vigas horizontais entre os pilares + escoras diagonais
    for sgn in (-1, 1):
        beam(mb, (-PX, 1.3, sgn * PX), (PX, 1.3, sgn * PX), 0.26, 0.24, 'wood_beam', bevel=0.02)
        beam(mb, (sgn * PX, 1.3, -PX), (sgn * PX, 1.3, PX), 0.24, 0.26, 'wood_beam', bevel=0.02)
        for sx in (-1, 1):
            beam(mb, (sx * (PX - 0.34), 1.15, sgn * (PX + 0.0)), (sx * (PX - 1.0), 1.65, sgn * (PX + 0.0)), 0.14, 0.12, 'wood_dark')
    # estrado: moldura de aço sob o convés, laje de tábuas
    mb.add(prim_box(2 * HS + 0.1, 0.2, 2 * HS + 0.1), 'steel_dark', M((0, DK - 0.44, 0)), bevel=0.0)

    def deck_mat(c, n):
        return 'deck' if n[1] > 0.6 else 'wood_dark'
    mb.add(prim_box(2 * HS, 0.34, 2 * HS, base=True), 'deck', M((0, DK - 0.34, 0)), bevel=0.0, mat_fn=deck_mat)
    # chapas de aço soltas no convés e bueiro
    for (x, z, w, d, rot) in ((-0.1, 2.05, 0.5, 0.22, 20), (1.8, 1.05, 0.4, 0.2, -30), (0.9, 0.3, 0.3, 0.16, 80)):
        mb.add(prim_box(w, 0.025, d), 'steel', M((x, DK + 0.012, z), (0, rot, 0)), bevel=0.0)
    # cabeças de pregos/parafusos do convés: braçadeiras de canto em aço
    for sx in (-1, 1):
        for sz in (-1, 1):
            mb.add(prim_box(0.5, 0.045, 0.5), 'steel_dark', M((sx * (HS - 0.27), DK + 0.02, sz * (HS - 0.27))))
            N.rivets(mb, [(sx * (HS - 0.27) + a * 0.18, DK + 0.05, sz * (HS - 0.27) + b * 0.18) for a in (-1, 1) for b in (-1, 1)], 0.025)
    return mb.build(mats, parent=root)


# ---------------------------------------------------------------------------
# Torre de perfuração
# ---------------------------------------------------------------------------
HD = 3.8     # altura da torre acima do convés
B0, B1 = 0.9, 0.38


def bh(h):
    return B0 + (B1 - B0) * h / HD


def build_derrick(mats, root):
    mb = MeshBuilder('Derrick')
    # pernas de aço (perfis) com sapatas
    for sx in (-1, 1):
        for sz in (-1, 1):
            beam(mb, (DX + sx * B0, DK, DZ + sz * B0), (DX + sx * B1, DK + HD, DZ + sz * B1), 0.2, 0.2, 'steel_dark', bevel=0.0)
            beam(mb, (DX + sx * (B0 + 0.015), DK + 0.05, DZ + sz * (B0 + 0.015)), (DX + sx * (B1 + 0.015), DK + HD, DZ + sz * (B1 + 0.015)), 0.075, 0.075, 'steel')
            mb.add(prim_box(0.44, 0.1, 0.44, base=True), 'steel', M((DX + sx * B0, DK, DZ + sz * B0)), bevel=0.0)
            N.rivets(mb, [(DX + sx * B0 + a * 0.15, DK + 0.12, DZ + sz * B0 + b * 0.15) for a in (-1, 1) for b in (-1, 1)], 0.03)
    # colares de aço (4 barras) com parafusos: base, meio (grosso) e topo
    for (h, th, wd) in ((0.85, 0.2, 0.22), (2.25, 0.42, 0.26), (3.65, 0.22, 0.22)):
        b = bh(h)
        for sgn in (-1, 1):
            mb.add(prim_box(2 * b + 0.26, th, wd), 'steel', M((DX, DK + h, DZ + sgn * (b + 0.0))), bevel=0.0)
            mb.add(prim_box(wd, th, 2 * b + 0.26), 'steel', M((DX + sgn * b, DK + h, DZ)), bevel=0.0)
        rr = []
        for sgn in (-1, 1):
            for a in (-0.55, -0.18, 0.18, 0.55):
                rr.append((DX + a * b * 1.2, DK + h, DZ + sgn * (b + wd / 2 + 0.005)))
                rr.append((DX + sgn * (b + wd / 2 + 0.005), DK + h, DZ + a * b * 1.2))
        N.rivets(mb, rr, 0.04, 'steel_dark')
    # diagonais de madeira em X em cada face e cada tramo
    segs = ((0.85, 2.25), (2.25, 3.65))
    for (h0, h1) in segs:
        for (ax, sgn) in ((0, 1), (0, -1), (1, 1), (1, -1)):
            b0, b1 = bh(h0), bh(h1)
            for flip in (-1, 1):
                if ax == 0:
                    pa = (DX - flip * b0, DK + h0, DZ + sgn * b0)
                    pb = (DX + flip * b1, DK + h1, DZ + sgn * b1)
                else:
                    pa = (DX + sgn * b0, DK + h0, DZ - flip * b0)
                    pb = (DX + sgn * b1, DK + h1, DZ + flip * b1)
                beam(mb, pa, pb, 0.13, 0.11, 'wood_beam', bevel=0.0)
    # tramo inferior: K simples
    for (ax, sgn) in ((0, 1), (0, -1), (1, 1), (1, -1)):
        b0, b1 = bh(0.0), bh(0.85)
        for flip in (-1, 1):
            if ax == 0:
                pa = (DX - flip * b0, DK + 0.05, DZ + sgn * b0)
                pb = (DX + flip * b1, DK + 0.85, DZ + sgn * b1)
            else:
                pa = (DX + sgn * b0, DK + 0.05, DZ - flip * b0)
                pb = (DX + sgn * b1, DK + 0.85, DZ + flip * b1)
            beam(mb, pa, pb, 0.13, 0.11, 'wood_beam', bevel=0.0)
    # quadro de madeira no topo (moldura quadrada com vão central) + pequenas escoras
    ty = DK + HD
    fw = 1.02
    for sgn in (-1, 1):
        mb.add(prim_box(fw, 0.3, 0.24), 'wood_dark', M((DX, ty + 0.15, DZ + sgn * (fw / 2 - 0.12))), bevel=0.02)
        mb.add(prim_box(0.24, 0.3, fw - 0.48), 'wood_dark', M((DX + sgn * (fw / 2 - 0.12), ty + 0.15, DZ)), bevel=0.02)
        mb.add(prim_box(fw - 0.06, 0.07, 0.3), 'wood_beam', M((DX, ty + 0.34, DZ + sgn * (fw / 2 - 0.12))))
        mb.add(prim_box(0.3, 0.07, fw - 0.5), 'wood_beam', M((DX + sgn * (fw / 2 - 0.12), ty + 0.34, DZ)))
    for sx in (-1, 1):
        for sz in (-1, 1):
            beam(mb, (DX + sx * B1, ty - 0.05, DZ + sz * B1), (DX + sx * 0.34, ty + 0.1, DZ + sz * 0.34), 0.14, 0.14, 'steel_dark')
    # roda dentada e polia (lado +x), com corda vinda do alto
    gy = DK + 3.1
    gx = DX + bh(3.1) + 0.2
    N.gear(mb, M((gx, gy, DZ + 0.28), (0, 90, 0)), 0.32, 10, 0.12, body='steel_dark', hub='steel', spokes=3)
    mb.add(prim_cyl(0.3, 0.3, 0.1, 14, base=False), 'steel_dark', M((gx - 0.02, gy + 0.08, DZ - 0.3), (0, 0, 90)), smooth=30)
    mb.add(prim_cyl(0.22, 0.22, 0.12, 12, base=False), 'steel', M((gx - 0.02, gy + 0.08, DZ - 0.3), (0, 0, 90)), smooth=30)
    mb.add(prim_cyl(0.07, 0.07, 0.26, 8, base=False), 'dark', M((gx, gy + 0.08, DZ - 0.3), (0, 0, 90)), smooth=30)
    rope = bezier((DX + 0.2, ty + 0.35, DZ + 0.2), (DX + 0.55, ty - 0.2, DZ + 0.0), (gx - 0.02, gy + 0.38, DZ - 0.3), 7)
    tube(mb, rope, [0.045] * len(rope), 'rope', n=5, smooth=50)
    # escada de aço encostada na perna da frente
    for sz in (1,):
        for dxl in (-0.1, 0.1):
            beam(mb, (DX + dxl + 0.35, DK, DZ + B0 + 0.28), (DX + dxl + 0.15, DK + 2.2, DZ + bh(2.2) + 0.2), 0.05, 0.05, 'steel') if False else None
    return mb.build(mats, parent=root)


def build_drill(mats, root):
    mb = MeshBuilder('Anim_Drill')
    pv = (DX, DK + HD, DZ)
    an = Piv(mb, pv)
    top = DK + HD + 1.15
    tube(an, [(DX, DK + 0.6, DZ), (DX, DK + HD + 0.2, DZ), (DX, top, DZ)], [0.24, 0.24, 0.24], 'log_light', n=10, smooth=45)
    an.add(prim_cyl(0.2, 0.2, 0.02, 10, base=True), 'log_end', M((DX, top, DZ)))
    for y in (DK + HD - 0.2, DK + HD + 0.45, DK + 1.3):
        an.add(prim_cyl(0.3, 0.3, 0.1, 10), 'steel_dark', M((DX, y, DZ)))
    N.rope_coil(an, DX, DK + HD + 0.58, DZ, R=0.27, r=0.04, turns=3, rot=0)
    return mb.build(mats, parent=root, location=pv)


# ---------------------------------------------------------------------------
# Tanques e tubulações
# ---------------------------------------------------------------------------
def tank(mb, cx, cz, L, R, mat, band_mat='steel'):
    """Tanque cilíndrico deitado com eixo em Z (centro cx, cz), calotas, cintas de aço, remaches e selas."""
    cy = DK + 0.14 + R
    z0, z1 = cz - L / 2, cz + L / 2
    prof = [(z0, 0.06), (z0 + 0.06, R * 0.62), (z0 + 0.17, R * 0.9), (z0 + 0.3, R), (cz, R * 1.0), (z1 - 0.3, R),
            (z1 - 0.17, R * 0.9), (z1 - 0.06, R * 0.62), (z1, 0.06)]
    pts = [(cx, cy, z) for (z, r) in prof]
    tube(mb, pts, [r for (z, r) in prof], mat, n=14, smooth=60)
    for fz in (-0.34, 0.0, 0.34):
        z = cz + fz * L
        w = 0.16 if fz else 0.07
        mb.add(prim_cyl(R + 0.035, R + 0.035, w, 14, base=False), band_mat if fz else 'steel_dark', M((cx, cy, z), (90, 0, 0)), smooth=30)
    for fz in (-0.34, 0.34):
        z = cz + fz * L
        for k in range(10):
            a = 2 * math.pi * k / 10
            N.rivets(mb, [(cx + math.cos(a) * (R + 0.045), cy + math.sin(a) * (R + 0.045), z)], 0.02, 'steel_dark')
    for fz in (-0.3, 0.3):
        z = cz + fz * L
        mb.add(prim_box(2 * R * 0.8, 0.24, 0.28, base=True), 'steel_dark', M((cx, DK, z)), bevel=0.0)
    mb.add(prim_cyl(0.17, 0.17, 0.06, 10, base=False), 'steel_dark', M((cx, cy + R, cz + L * 0.12)), smooth=30)
    return cy


def wheel_valve(mb, x, y, z, mat='paint_red', r=0.15):
    mb.add(prim_cyl(0.05, 0.05, 0.16, 8), 'steel_dark', M((x, y - 0.16, z)))
    mb.add(N.torus_prim(r, 0.025, 12, 4), mat, M((x, y, z)), smooth=60)
    for k in range(3):
        mb.add(prim_box(r * 2, 0.025, 0.035), mat, M((x, y, z), (0, 60 * k, 0)))
    mb.add(prim_cyl(0.045, 0.045, 0.06, 8, base=False), 'steel', M((x, y, z)))


def build_tanks(mats, root):
    mb = MeshBuilder('Tanks')
    XB, ZB = -0.85, 0.6         # marrom (esquerda)
    XF, ZF = 0.55, 0.8          # vermelho (frente)
    XO, ZO = 0.38, -1.3         # laranja (atrás do vermelho)
    LB, LF, LO = 2.0, 2.3, 1.65
    RB, RF, RO = 0.55, 0.62, 0.55
    cyB = tank(mb, XB, ZB, LB, RB, 'tank_brown')
    cyF = tank(mb, XF, ZF, LF, RF, 'tank_red')
    cyO = tank(mb, XO, ZO, LO, RO, 'tank_orange')
    tb, tf, to = cyB + RB, cyF + RF, cyO + RO
    # sinal de perigo (losango amarelo) no tanque laranja, voltado para +x
    xs = XO + RO + 0.02
    mb.add(prim_box(0.025, 0.3, 0.3), 'paint_yellow', M((xs, cyO + 0.04, ZO + 0.25), (45, 0, 0)), bevel=0.0)
    mb.add(prim_box(0.03, 0.2, 0.08), 'dark', M((xs + 0.004, cyO + 0.05, ZO + 0.25)))
    mb.add(prim_cone(0.045, 0.1, 3), 'dark', M((xs + 0.004, cyO + 0.19, ZO + 0.25), (0, 0, -90)))
    # placas de aviso e remendos
    mb.add(prim_box(0.02, 0.2, 0.26), 'steel', M((XF + RF - 0.01, cyF + 0.05, ZF + 0.3), (0, 0, 8)))
    mb.add(prim_box(0.02, 0.16, 0.22), 'steel', M((XB + RB - 0.01, cyB + 0.03, ZB - 0.3), (0, 0, 6)))
    # coletor sobre os tanques: marrom -> vermelho (cruza em x) e vermelho -> laranja (ao longo de z)
    zc = 0.35
    N.pipe(mb, [(XB, tb - 0.06, zc), (XB, tb + 0.55, zc), (XF, tb + 0.55, zc), (XF, tf - 0.06, zc)], 0.1, rr=0.2)
    N.pipe(mb, [(XF, tb + 0.55, zc), (XF, tb + 0.55, -0.55), (XO, tb + 0.55, -0.55), (XO, to - 0.06, -0.55)], 0.1, rr=0.2, flanges=(False, True))
    wheel_valve(mb, XB, tb + 0.7, zc, 'paint_red')
    wheel_valve(mb, XO, tb + 0.7, -0.55, 'paint_blue')
    wheel_valve(mb, XF + 0.0, tf + 0.3, ZF + 0.6, 'paint_red', r=0.13)
    N.pipe(mb, [(XF, tf - 0.06, ZF + 0.6), (XF, tf + 0.2, ZF + 0.6)], 0.07, rr=0.1, flanges=(False, True))
    # tubo de saída da ponta frontal do tanque vermelho e mangueira de corda enrolada pelo convés
    zend = ZF + LF / 2
    N.pipe(mb, [(XF, cyF, zend - 0.02), (XF, cyF, zend + 0.3), (XF - 0.3, cyF - 0.1, zend + 0.3), (XF - 0.3, DK + 0.28, zend + 0.3)], 0.11, rr=0.2, flanges=(False, False))
    hose = [(XF - 0.3, DK + 0.14, zend + 0.3), (-0.2, DK + 0.14, zend + 0.1), (-0.9, DK + 0.14, zend - 0.1), (-1.4, DK + 0.14, 1.9), (-1.35, DK + 0.14, 1.5)]
    hp = N.rounded_path(hose, 0.35, 4)
    tube(mb, hp, [0.1] * len(hp), 'hose', n=8, smooth=50)
    for i in range(0, len(hp) - 1, 2):
        mb.add(prim_cyl(0.115, 0.115, 0.03, 8, base=False), 'steel_dark', M(hp[i], (0, 0, 0)), smooth=30)
    # tubo de saída traseiro do tanque marrom ao convés (esquerda)
    N.pipe(mb, [(XB - 0.04, cyB, ZB - LB / 2 - 0.02), (XB - 0.04, cyB, ZB - LB / 2 - 0.3), (XB - 0.04, DK + 0.1, ZB - LB / 2 - 0.3)], 0.09, rr=0.16,
           flanges=(True, False))
    # caneca sobre o convés
    mb.add(prim_cyl(0.09, 0.09, 0.15, 10), 'ceramic', M((1.6, DK, 1.3)), smooth=30)
    mb.add(N.torus_prim(0.055, 0.015, 8, 4), 'ceramic', M((1.7, DK + 0.08, 1.3), (90, 0, 0)))
    return mb.build(mats, parent=root)


# ---------------------------------------------------------------------------
# Casinha e chaminé
# ---------------------------------------------------------------------------
def build_house(mats, root):
    real = MeshBuilder('House')
    mb = N.Sc(real, (HX, DK, HZ), HK)
    # soco e paredes
    mb.add(prim_box(1.42, 0.12, 1.36, base=True), 'steel_dark', M((HX, DK, HZ)))
    mb.add(prim_box(1.3, 0.85, 1.24, base=True), 'plaster_rust', M((HX, DK + 0.12, HZ)), bevel=0.02)
    mb.add(prim_box(1.0, 0.5, 0.94, base=True), 'plaster_rust', M((HX - 0.08, DK + 0.97, HZ + 0.02)), bevel=0.02)
    # soco de pedra à direita (degrau)
    mb.add(prim_box(0.34, 0.2, 0.6, base=True), 'stone_blk', M((HX + 0.78, DK, HZ + 0.32)), bevel=0.02)
    # porta, venezianas e janelas (+z e +x)
    zf = HZ + 0.62
    mb.add(prim_box(0.38, 0.62, 0.05), 'wood_door', M((HX - 0.28, DK + 0.12, zf + 0.01)))
    mb.add(prim_box(0.46, 0.06, 0.07), 'wood_beam', M((HX - 0.28, DK + 0.76, zf + 0.02)))
    for sx in (-1, 1):
        mb.add(prim_box(0.05, 0.64, 0.07), 'wood_beam', M((HX - 0.28 + sx * 0.21, DK + 0.12 + 0.32, zf + 0.02)))
    mb.add(prim_box(0.3, 0.26, 0.05), 'glass', M((HX + 0.28, DK + 0.58, zf + 0.01)))
    mb.add(prim_box(0.38, 0.05, 0.07), 'wood_beam', M((HX + 0.28, DK + 0.4, zf + 0.02)))
    mb.add(prim_box(0.05, 0.3, 0.05), 'wood_beam', M((HX + 0.28, DK + 0.58, zf + 0.03)))
    xf = HX + 0.65
    mb.add(prim_box(0.05, 0.28, 0.5), 'glass', M((xf + 0.01, DK + 0.58, HZ - 0.12)))
    mb.add(prim_box(0.07, 0.05, 0.58), 'wood_beam', M((xf + 0.02, DK + 0.4, HZ - 0.12)))
    mb.add(prim_box(0.06, 0.05, 0.05), 'wood_beam', M((xf + 0.03, DK + 0.58, HZ - 0.12)))
    # janelas azuis do andar superior (três em +z, duas em +x)
    uz = HZ + 0.02 + 0.47
    for k in (-1, 0, 1):
        mb.add(prim_box(0.2, 0.18, 0.04), 'glass', M((HX - 0.08 + k * 0.29, DK + 1.2, uz + 0.01)))
        mb.add(prim_box(0.25, 0.04, 0.06), 'steel_dark', M((HX - 0.08 + k * 0.29, DK + 1.09, uz + 0.015)))
    for k in (-1, 1):
        mb.add(prim_box(0.04, 0.18, 0.2), 'glass', M((HX - 0.08 + 0.51, DK + 1.2, HZ + 0.02 + k * 0.26)))
    # telhado plano com aro de aço, chaminé, tampa
    ry = DK + 1.47
    mb.add(prim_box(1.14, 0.07, 1.08), 'steel_dark', M((HX - 0.08, ry, HZ + 0.02)), bevel=0.0)
    for sgn in (-1, 1):
        mb.add(prim_box(1.14, 0.09, 0.07), 'steel', M((HX - 0.08, ry + 0.07, HZ + 0.02 + sgn * 0.5)), bevel=0.0)
        mb.add(prim_box(0.07, 0.09, 1.0), 'steel', M((HX - 0.08 + sgn * 0.54, ry + 0.07, HZ + 0.02)), bevel=0.0)
    mb.add(prim_box(0.95, 0.02, 0.9), 'dark', M((HX - 0.08, ry + 0.045, HZ + 0.02)))
    # chaminé de tijolo com faixa laranja e boca preta
    cx, cz = HX - 0.28, HZ - 0.25
    mb.add(prim_cyl(0.23, 0.2, 0.55, 12, base=True), 'chimney', M((cx, ry + 0.04, cz)), smooth=40)
    mb.add(prim_cyl(0.205, 0.205, 0.17, 12, base=True), 'paint_yellow', M((cx, ry + 0.52, cz)), smooth=40)
    mb.add(prim_cyl(0.2, 0.19, 0.28, 12, base=True), 'chimney', M((cx, ry + 0.68, cz)), smooth=40)
    mb.add(prim_cyl(0.25, 0.25, 0.06, 12, base=True), 'steel_dark', M((cx, ry + 0.95, cz)))
    mb.add(prim_cyl(0.17, 0.17, 0.02, 12, base=True), 'dark', M((cx, ry + 1.0, cz)))
    mb.add(prim_cyl(0.26, 0.26, 0.05, 12, base=True), 'steel_dark', M((cx, ry + 0.04, cz)))
    # antena em cruz
    ax, az = HX + 0.25, HZ + 0.15
    log(mb, (ax, ry + 0.05, az), (ax, ry + 1.35, az), 0.025, 'steel', n=6)
    mb.add(prim_box(0.5, 0.03, 0.03), 'steel', M((ax, ry + 1.15, az)))
    mb.add(prim_box(0.3, 0.03, 0.03), 'steel', M((ax, ry + 0.85, az)))
    for sx in (-1, 1):
        beam(mb, (ax, ry + 1.15, az), (ax + sx * 0.4, ry + 0.07, az + 0.0), 0.012, 0.012, 'steel')
    mb.add(prim_sphere(0.04, 0.04, 0.04, 6, 3), 'steel', M((ax, ry + 1.37, az)), smooth=60)
    # tubos: ventilação curva à direita e dois curtos em U
    N.pipe(mb, [(HX + 0.95, DK + 0.12, HZ + 0.3), (HX + 0.95, DK + 1.3, HZ + 0.3), (HX + 0.95, DK + 1.55, HZ + 0.1), (HX + 0.6, DK + 1.55, HZ + 0.1)],
           0.09, rr=0.22, flanges=(True, False))
    for k, zz in enumerate((-0.15, -0.38)):
        N.pipe(mb, [(HX + 0.65, DK + 0.38, HZ + zz), (HX + 0.98, DK + 0.38, HZ + zz), (HX + 0.98, DK + 0.12, HZ + zz)], 0.06, rr=0.12,
               flanges=(True, False))
    # tubo de descida do tanque até a parede e canos de parede
    N.pipe(mb, [(HX - 0.7, DK + 0.5, HZ - 0.2), (HX - 0.95, DK + 0.5, HZ - 0.2), (HX - 0.95, DK + 0.15, HZ - 0.2)], 0.06, rr=0.12, flanges=(True, False))
    # lâmpada na porta
    mb.add(prim_box(0.12, 0.14, 0.12), 'glow', M((HX - 0.28, DK + 0.95, zf + 0.12)), bevel=0.0)
    mb.add(prim_box(0.05, 0.05, 0.14), 'steel_dark', M((HX - 0.28, DK + 1.04, zf + 0.06)))
    return real.build(mats, parent=root)


def build_smoke(mats, root):
    mb = MeshBuilder('Anim_Smoke')
    cx, cz = HX - 0.28 * HK, HZ - 0.25 * HK
    py = CHY + 0.02
    pv = (cx, py, cz)
    an = Piv(mb, pv)
    puffs = [(0.0, 0.0, 0.2), (0.02, 0.3, 0.27), (0.08, 0.64, 0.34), (0.18, 1.0, 0.4), (0.34, 1.34, 0.42), (0.52, 1.64, 0.4),
             (0.72, 1.88, 0.32), (0.9, 2.06, 0.22)]
    for k, (dx, dy, r) in enumerate(puffs):
        mat = 'smoke' if k < 6 else 'smoke_light'
        an.add(prim_sphere(r, r * 0.92, r, 8, 5), mat, M((cx + dx, py + dy, cz + 0.04 * ((k % 2) * 2 - 1)), (0, 17 * k, 0)), smooth=70)
        if 1 <= k <= 5:
            an.add(prim_sphere(r * 0.7, r * 0.65, r * 0.7, 7, 4), mat, M((cx + dx + 0.18, py + dy - 0.07, cz + 0.14 - 0.12 * (k % 3))), smooth=70)
    return mb.build(mats, parent=root, location=pv)


# ---------------------------------------------------------------------------
# Guindaste de bordo (esquerda)
# ---------------------------------------------------------------------------
def build_crane(mats, root):
    mb = MeshBuilder('Crane')
    # base de aço com pernas, colar, bloco de madeira escalonado
    mb.add(prim_box(0.95, 0.1, 0.95, taper=(1, 1)), 'steel_dark', M((CRX, DK + 0.38, CRZ)), bevel=0.0)
    mb.add(prim_box(0.75, 0.08, 0.75), 'steel', M((CRX, DK + 0.47, CRZ)), bevel=0.0)
    for sx in (-1, 1):
        for sz in (-1, 1):
            mb.add(prim_box(0.12, 0.38, 0.12, base=True), 'steel_dark', M((CRX + sx * 0.38, DK, CRZ + sz * 0.38)))
    for sx in (-1, 1):
        beam(mb, (CRX + sx * 0.38, DK + 0.1, CRZ - 0.38), (CRX + sx * 0.38, DK + 0.1, CRZ + 0.38), 0.06, 0.06, 'steel')
    mb.add(prim_box(0.7, 0.28, 0.7, base=True), 'wood_gold', M((CRX, DK + 0.51, CRZ)), bevel=0.02)
    mb.add(prim_box(0.52, 0.3, 0.52, base=True), 'wood_gold', M((CRX, DK + 0.79, CRZ)), bevel=0.02)
    N.rivets(mb, [(CRX + sx * 0.37, DK + 0.65, CRZ + sz * 0.37) for sx in (-1, 1) for sz in (-1, 1)], 0.03)
    # cabrestante de ferro (engrenagem + tambor) ao lado
    N.gear(mb, M((CRX + 0.5, DK + 0.8, CRZ + 0.1), (0, 90, 0)), 0.3, 10, 0.1, body='steel_dark', hub='steel', spokes=3)
    mb.add(prim_cyl(0.1, 0.1, 0.4, 8, base=False), 'steel', M((CRX + 0.42, DK + 0.8, CRZ + 0.1), (0, 0, 90)), smooth=30)
    # placa de ferro no piso
    mb.add(prim_box(0.55, 0.03, 0.4), 'steel', M((CRX + 0.45, DK + 0.015, CRZ - 0.5), (0, 20, 0)))
    return mb.build(mats, parent=root)


def build_crane_boom(mats, root):
    mb = MeshBuilder('Anim_Crane')
    py = DK + 1.0
    pv = (CRX, py, CRZ)
    an = Piv(mb, pv)
    tip = Vector((CRX, py + 1.15, CRZ + 1.0))
    base = Vector((CRX, py - 0.12, CRZ - 0.18))
    # cabeça giratória: bloco de madeira + chapa
    an.add(prim_box(0.46, 0.34, 0.46), 'wood_gold', M((CRX, py - 0.02, CRZ)), bevel=0.02)
    # lança em treliça simples: duas longarinas + travessas
    for sx in (-1, 1):
        beam(an, (CRX + sx * 0.12, py - 0.1, CRZ - 0.12), (CRX + sx * 0.12, tip.y, tip.z), 0.1, 0.1, 'wood_gold', bevel=0.0)
    for t in (0.2, 0.4, 0.6, 0.8):
        p = base.lerp(tip, t)
        beam(an, (CRX - 0.12, p.y, p.z), (CRX + 0.12, p.y, p.z), 0.07, 0.07, 'wood_dark')
    dv = (tip - base).normalized()
    for sx in (-1, 1):
        for t in (0.1, 0.3, 0.5, 0.7):
            p0 = base.lerp(tip, t)
            p1 = base.lerp(tip, t + 0.2)
            beam(an, (CRX + sx * 0.12, p0.y, p0.z), (CRX + sx * 0.12, p1.y, p1.z) if False else (CRX + sx * 0.0, p1.y, p1.z), 0.04, 0.04, 'wood_dark')
    # capa de aço da ponta e polia
    an.add(prim_box(0.34, 0.22, 0.26), 'steel_dark', M(tuple(tip + Vector((0, 0.04, 0.02))), (28, 0, 0)), bevel=0.0)
    an.add(prim_cyl(0.13, 0.13, 0.28, 10, base=False), 'steel', M(tuple(tip + Vector((0, -0.05, 0.1))), (0, 0, 90)), smooth=30)
    # corda do gancho e gancho de aço (J)
    hz = tip.z + 0.1
    tube(an, [(CRX, tip.y - 0.1, hz), (CRX, DK + 0.62, hz)], [0.035, 0.035], 'rope', n=5, smooth=50)
    an.add(N.torus_prim(0.09, 0.025, 10, 4), 'steel_dark', M((CRX, DK + 0.6, hz), (0, 0, 90)), smooth=50)
    hk = bezier((CRX, DK + 0.52, hz), (CRX, DK + 0.1, hz), (CRX + 0.0, DK + 0.18, hz + 0.24), 6)
    tube(an, hk, [0.05, 0.055, 0.06, 0.06, 0.05, 0.03, 0.012], 'steel_dark', n=6, smooth=50)
    # cabo de apoio traseiro com contrapeso
    tube(an, [(CRX, tip.y - 0.05, tip.z - 0.08), (CRX, py + 0.3, CRZ - 0.4), (CRX, py - 0.05, CRZ - 0.4)], [0.025, 0.025, 0.025], 'rope', n=5, smooth=50)
    an.add(prim_box(0.2, 0.2, 0.2), 'steel_dark', M((CRX, py - 0.15, CRZ - 0.4)), bevel=0.0)
    return mb.build(mats, parent=root, location=pv)


# ---------------------------------------------------------------------------
# Adereços
# ---------------------------------------------------------------------------
def build_props(mats, root):
    mb = MeshBuilder('Props')
    # barris (direita, junto à casinha) e (atrás, à direita da torre)
    for (x, z, r, h) in ((2.0, -0.55, 0.25, 0.62), (2.02, -0.05, 0.24, 0.58), (-0.05, -1.95, 0.24, 0.6), (0.32, -2.02, 0.22, 0.56)):
        H.barrel(mb, x, DK, z, r=r, h=h)
    # bancada com ferramentas (frente-direita)
    bx, bz = 1.45, 1.75
    T = M((bx, DK, bz), (0, 62, 0))
    mb.add(prim_box(0.82, 0.06, 0.34, base=True), 'wood_light', T @ M((0, 0.3, 0)), bevel=0.0)
    for sx in (-1, 1):
        for sz in (-1, 1):
            mb.add(prim_box(0.06, 0.3, 0.06, base=True), 'wood_beam', T @ M((sx * 0.36, 0, sz * 0.13)))
    mb.add(prim_box(0.46, 0.025, 0.05), 'steel', T @ M((-0.12, 0.375, 0.04), (0, 20, 0)))
    mb.add(prim_box(0.1, 0.025, 0.09), 'steel', T @ M((-0.34, 0.375, 0.1), (0, 20, 0)))
    mb.add(prim_box(0.3, 0.035, 0.045), 'wood', T @ M((0.12, 0.375, -0.06), (0, -10, 0)))
    mb.add(prim_box(0.12, 0.07, 0.08), 'iron', T @ M((0.25, 0.4, -0.06), (0, -10, 0)))
    mb.add(prim_box(0.25, 0.02, 0.17), 'parchment', T @ M((0.25, 0.372, 0.06), (0, 10, 0)))
    # chaves e peças soltas no convés
    mb.add(prim_box(0.4, 0.025, 0.06), 'steel', M((1.05, DK + 0.012, 1.1), (0, 35, 0)))
    mb.add(prim_box(0.3, 0.025, 0.05), 'steel', M((-0.55, DK + 0.012, 2.1), (0, -20, 0)))
    # corda enrolada e cabeço de amarração (frente)
    N.rope_coil(mb, 1.95, DK, 0.9, R=0.22, r=0.05, turns=3, rot=15)
    for sx in (-1, 1):
        mb.add(prim_cyl(0.11, 0.09, 0.28, 8, base=True), 'iron', M((sx * 1.8, DK, 2.15)))
        mb.add(prim_box(0.38, 0.08, 0.16), 'iron', M((sx * 1.8, DK + 0.28, 2.15), (0, 0, 0)), bevel=0.0)
    # lanternas de sinalização nos cantos da frente (postes de aço)
    for sx in (-1, 1):
        x, z = sx * 2.15, 2.15
        log(mb, (x, DK, z), (x, DK + 1.0, z), 0.04, 'steel_dark', n=6)
        H.lantern(mb, M((x, DK + 0.9, z + 0.0)))
    # extintor (cilindro vermelho) junto à casinha
    mb.add(prim_cyl(0.07, 0.07, 0.3, 8, base=True), 'paint_red', M((HX - 0.7, DK, HZ + 0.62)), smooth=40)
    mb.add(prim_cyl(0.04, 0.04, 0.06, 6, base=True), 'steel', M((HX - 0.7, DK + 0.3, HZ + 0.62)))
    return mb.build(mats, parent=root)


def build_banners(mats, root):
    real = MeshBuilder('Anim_Banners')
    mb = N.Sc(real, (HX, DK, HZ), HK)
    ax, az = HX + 0.25, HZ + 0.15
    ry = DK + 1.47
    # galhardete no topo da antena (aponta +x) com brasão
    N.banner_cloth(mb, M((ax + 0.02, ry + 1.32, az)), 0.62, 0.34, 'team', 'gold', wave=(0.04, 5.0, 3.0, 0.5), tail=True)
    N.emblem(mb, ax + 0.3, ry + 1.15, az + 0.04, k=0.42, wave=(0.04, 5.0, 3.0, 0.5))
    # toldo sobre a porta (cor de time) e friso no beiral
    zf = HZ + 0.62
    mb.add(prim_box(0.62, 0.04, 0.38), 'team', M((HX - 0.28, DK + 0.94, zf + 0.17), (-24, 0, 0)), bevel=0.0)
    for k in range(4):
        mb.add(prim_box(0.62, 0.05, 0.04), 'gold', M((HX - 0.28, DK + 0.81 - 0.0, zf + 0.34), (-24, 0, 0))) if k == 0 else None
    mb.add(prim_box(1.34, 0.1, 0.03), 'team', M((HX, DK + 0.9, zf + 0.012)), bevel=0.0)
    mb.add(prim_box(0.03, 0.1, 1.28), 'team', M((HX + 0.655, DK + 0.9, HZ)), bevel=0.0)
    # faixa de time no tanque vermelho (cinta)
    return real.build(mats, parent=root)


def main():
    args = C.script_args()
    C.reset_scene()
    N.patch_small_bevels(0.025)
    mats = C.make_paint_set(PALETTE)
    root = C.make_empty('OilPlatform')
    base = build_base(mats, root)
    derrick = build_derrick(mats, root)
    tanks = build_tanks(mats, root)
    house = build_house(mats, root)
    crane = build_crane(mats, root)
    props = build_props(mats, root)
    drill = build_drill(mats, root)
    boom = build_crane_boom(mats, root)
    smoke = build_smoke(mats, root)
    banners = build_banners(mats, root)
    weights = {'Base': 1.0, 'Derrick': 1.0, 'Tanks': 1.2, 'House': 1.0, 'Crane': 0.9, 'Props': 0.9, 'Anim_Drill': 0.7,
               'Anim_Crane': 0.8, 'Anim_Smoke': 0.35, 'Anim_Banners': 1.0}
    finish_building(root, 'oil_platform', 'oil_platform.glb', 'oil_platform_atlas', [base, derrick, tanks, house, crane, props],
                    banners, weights, TEAM_DEFAULT, args, spawn=(0, 0, 3.6), rally=(0, 0, 5.2), extra_anim=[drill, boom, smoke],
                    game_dist=72, extra_views=[('ref', (-1.0, 0.95, 1.0)), ('ref2', (1.0, 0.95, 1.0)), ('low', (0.6, 0.12, 1.0))])


if __name__ == '__main__':
    main()
