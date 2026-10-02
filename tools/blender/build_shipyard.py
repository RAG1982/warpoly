"""
build_shipyard.py — Estaleiro humano (tipo `shipyard`) gerado 100% por script (ART-naval-buildings).
Referência: docs/refs/naval/human_naval_buildings_ref.png (esquerda, "Porto Humano").

Uso:
  blender -b --factory-startup --python tools/blender/build_shipyard.py -- [--no-render]

Saída (public/models/shipyard.glb), coordenadas do jogo, origem no centro da base (y=0 = chão), costa: lado do mar = +Z:
  Shipyard (raiz)
  ├─ Static_Mesh       doca de pedra e madeira, doca seca com casco em construção sobre cavaletes, torre de pedra com
  │                    telhado de telhas azul/vermelho, mastro com gávea e vergas, caixotes, barris, fardos, bancada (Atlas)
  ├─ Anim_Banners      estandarte do mastro, galhardete da torre e fitas (TeamColor; brasão de ouro no mesmo nó)
  ├─ Anim_Crane        guindaste esquerdo (lança, cordas e gancho; pivô no topo da coluna)
  ├─ Anim_Crane_2      guindaste direito
  ├─ Socket_UnitSpawn  saída dos navios (para o mar, +Z)
  └─ Socket_Rally      ponto de reunião padrão
Pegada ~7,5 x 7,5 (raio de colisão 3,6), altura ~8,2 (mastro).
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
import siege_common as SC  # noqa: E402
from naval_common import Piv  # noqa: E402

TEAM_DEFAULT = '#3a66d6'
DK = 0.85           # topo do convés da doca
BF = 0.10           # piso da doca seca
BX = 1.55           # meia-largura da doca seca
BZ = -1.90          # fundo da doca seca
SY = 0.50           # elevação do casco sobre os cavaletes
MZ = 0.20           # z do mastro

PALETTE = dict(S.PALETTE)
PALETTE.update(H.HUMAN_EXTRAS)
PALETTE['stone'] = dict(base='#97938b', var='#77736b', var_scale=0.5, var_amt=0.9, fine=0.07, pattern='bricks', mapping='box',
                        pw=0.55, ph=0.27, mortar='#403c35', mortar_size=0.035, brick_tint='#b5ab97', brick_tint_amt=0.55,
                        brick_dark=0.74, brick_lite=1.14, grad=(0.0, 3.0, 0.3), top=0.2, edge='#dcd6c8', edge_amt=0.55,
                        edge_r=0.04, edge_gain=8.0, ao=(0.9, 0.85), ao_pow=1.3)
PALETTE['stone_dark'] = dict(PALETTE['stone'], base='#7d7a74', var='#625f59', pw=0.8, ph=0.36)
PALETTE['crate'] = dict(base='#9a7040', var='#7a5530', var_scale=3.0, fine=0.08, pattern='planks', mapping='box', pw=1.2,
                        ph=0.18, mortar='#3a2615', top=0.2, edge='#c9a06a', edge_amt=0.4, edge_r=0.02, ao=(0.4, 0.6))
PALETTE['parchment'] = dict(base='#dccb9c', var='#bba877', var_scale=3.0, var_amt=0.8, fine=0.08, top=0.25, edge='#f3e8c6',
                            edge_amt=0.4, edge_r=0.02)


def _planks(base, var, pw=1.8, ph=0.19, mortar='#2b190b', tint=None, **kw):
    d = dict(base=base, var=var, var_scale=2.4, fine=0.09, pattern='planks', mapping='box', pw=pw, ph=ph, mortar=mortar,
             mortar_size=0.02, brick_tint=tint or base, brick_tint_amt=0.5, top=0.22, edge='#e0b27a', edge_amt=0.35,
             edge_r=0.02, ao=(0.5, 0.6))
    d.update(kw)
    return d


def _tile(base, var, edge):
    return dict(base=base, var=var, var_scale=5.0, var_amt=0.7, fine=0.05, top=0.28, edge=edge, edge_amt=0.6, edge_r=0.016,
                edge_gain=10.0, ao=(0.22, 0.55))


PALETTE['steel'] = dict(base='#868c98', var='#6a707c', var_scale=4.0, fine=0.07, top=0.35, edge='#e2e7f0', edge_amt=0.8, edge_r=0.012,
                        ao=(0.3, 0.5))
PALETTE.update({
    'deck': _planks('#a5753f', '#80562a', 1.8, 0.2, tint='#bd8b52'),
    'deck_dark': _planks('#7c5430', '#5e3f22', 1.6, 0.17, tint='#8d6038'),
    'hull_white': _planks('#eadfc3', '#cbbf9f', 2.6, 0.16, mortar='#74603f', tint='#f6edd4', top=0.2, edge='#fffaf0'),
    'hull_blue': _planks('#2f58b0', '#234584', 2.6, 0.16, mortar='#142a5a', tint='#4a74cc', edge='#9fbbf0'),
    'hull_navy': _planks('#1f3470', '#162652', 2.6, 0.2, mortar='#0c1737', tint='#2c4690', edge='#6b84c8'),
    'roof_blue': _tile('#3763b8', '#2a4f9c', '#9fbbf0'),
    'roof_red': _tile('#b8332b', '#8e231c', '#f09a8a'),
    'roof_lblue': _tile('#6c8fe0', '#5476c6', '#cfdcfb'),
    'roof_navy': _tile('#27408a', '#1b2f6a', '#7f97d6'),
    'cloth_purple': dict(base='#6d3f93', var='#533070', var_scale=4.0, fine=0.1, top=0.3, ao=(0.3, 0.5)),
    'paint_red': dict(base='#b4271c', var='#8a190f', var_scale=6.0, top=0.3),
    'paint_green': dict(base='#3f9a3f', var='#2c742c', var_scale=6.0, top=0.3),
    'paint_yellow': dict(base='#e4b72a', var='#c0921a', var_scale=6.0, top=0.3),
    'paint_blue': dict(base='#2f6ac0', var='#244f94', var_scale=6.0, top=0.3),
    'paint_white': dict(base='#efe8da', var='#d6cdb9', var_scale=6.0, top=0.3),
    'steel_dark': dict(base='#5a5f69', var='#464a53', var_scale=3.0, fine=0.08, top=0.3, edge='#aab0bb', edge_amt=0.7,
                       edge_r=0.015, ao=(0.3, 0.5)),
})


# ---------------------------------------------------------------------------
# Doca de pedra e doca seca
# ---------------------------------------------------------------------------
def build_base(mats, root):
    mb = MeshBuilder('Base')
    # massa de pedra: blocos laterais e do fundo
    mb.add(prim_box(2.2, DK - 0.04, 7.5, taper=(0.97, 1.0), base=True), 'stone', M((-2.65, 0, 0)), bevel=0.05)
    mb.add(prim_box(2.2, DK - 0.04, 7.5, taper=(0.97, 1.0), base=True), 'stone', M((2.65, 0, 0)), bevel=0.05)
    mb.add(prim_box(2 * BX + 0.1, DK - 0.04, 3.75 + BZ, base=True), 'stone', M((0, 0, (BZ - 3.75) / 2)), bevel=0.05)
    # convés de tábuas (inset, deixa o aro de pedra à vista)
    mb.add(prim_box(1.95, 0.1, 7.15, base=True), 'deck', M((-2.62, DK - 0.1, -0.02)), bevel=0.012)
    mb.add(prim_box(1.95, 0.1, 7.15, base=True), 'deck', M((2.62, DK - 0.1, -0.02)), bevel=0.012)
    mb.add(prim_box(2 * BX - 0.1, 0.1, 1.45, base=True), 'deck', M((0, DK - 0.1, -2.85)), bevel=0.012)
    # copings de pedra clara ao longo da borda da doca seca e do mar
    for sx in (-1, 1):
        mb.add(prim_box(0.24, 0.1, 3.75 - BZ + 0.05, base=True), 'stone_light', M((sx * (BX + 0.08), DK - 0.1, (3.75 + BZ) / 2)), bevel=0.025)
        mb.add(prim_box(0.3, 0.12, 0.3, base=True), 'stone_light', M((sx * 3.5, DK - 0.04, 3.5)), bevel=0.03)
    mb.add(prim_box(2 * BX + 0.34, 0.1, 0.24, base=True), 'stone_light', M((0, DK - 0.1, BZ - 0.12)), bevel=0.025)
    # blocos de canto grandes (referência: cunhais de pedra clara nos cantos)
    for (x, z) in ((-3.44, 3.44), (3.44, 3.44), (-3.44, -3.44), (3.44, -3.44)):
        mb.add(prim_box(0.62, 0.34, 0.62, base=True), 'stone_light', M((x, DK - 0.04, z)), bevel=0.04)
        mb.add(prim_box(0.5, 0.2, 0.5, base=True), 'stone', M((x, DK - 0.04 + 0.34, z)), bevel=0.03)
    # piso da doca seca (lajes) e canaleta central
    mb.add(prim_box(2 * BX, BF, 3.75 - BZ, base=True), 'paving', M((0, 0, (3.75 + BZ) / 2)), bevel=0.02)
    mb.add(prim_box(0.34, 0.05, 3.75 - BZ - 0.1, base=True), 'stone_dark', M((0, BF, (3.75 + BZ) / 2 - 0.05)), bevel=0.012)
    # trilhos de ferro no piso (guias do casco) e degraus de acesso na frente
    for sx in (-1, 1):
        beam(mb, (sx * 0.9, BF, BZ + 0.2), (sx * 0.9, BF, 3.7), 0.1, 0.07, 'iron', bevel=0.01)
    # faixa de ferro na borda do convés ao longo do mar (guarda-corpo baixo)
    for sx in (-1, 1):
        mb.add(prim_box(2.05, 0.1, 0.12, base=True), 'iron', M((sx * 2.65, DK, 3.66)), bevel=0.012)
    return mb.build(mats, parent=root)


def post(mb, x, z, y0=DK, h=0.55, w=0.26, strap=True):
    mb.add(prim_box(w, h, w, base=True), 'wood_dark', M((x, y0, z)), bevel=0.025)
    mb.add(prim_box(w + 0.06, 0.07, w + 0.06), 'wood_beam', M((x, y0 + h, z)), bevel=0.012)
    if strap:
        mb.add(prim_box(w + 0.05, 0.07, w + 0.05), 'steel_dark', M((x, y0 + h * 0.45, z)), bevel=0.008)
        mb.add(prim_box(w + 0.05, 0.07, w + 0.05), 'steel_dark', M((x, y0 + 0.08, z)), bevel=0.008)


def build_dock(mats, root):
    """Postes, escada, cabrestante de amarração, cordas, lanternas."""
    mb = MeshBuilder('Dock')
    # postes de madeira com cintas de ferro ao longo da doca seca e da borda frontal
    for z in (-1.5, 0.15, 1.8, 3.35):
        post(mb, -(BX + 0.12), z)
        post(mb, BX + 0.12, z)
    for x in (-3.15, -2.5, -1.95):
        post(mb, x, 3.55, h=0.8, w=0.3)
    for x in (1.95, 2.5, 3.15):
        post(mb, x, 3.55, h=0.8, w=0.3)
    for z in (1.4, -0.4, -2.2):
        post(mb, -3.6, z, h=0.75, w=0.3)
        post(mb, 3.6, z, h=0.75, w=0.3)
    # escada de mão encostada na parede esquerda da doca seca
    lx, lz = -(BX - 0.04), -0.75
    for dz in (-0.16, 0.16):
        beam(mb, (lx + 0.34, BF, lz + dz), (lx - 0.02, DK + 0.38, lz + dz), 0.07, 0.05, 'wood_beam')
    for k in range(7):
        t = (k + 0.5) / 7
        p = Vector((lx + 0.34, BF, lz)).lerp(Vector((lx - 0.02, DK + 0.38, lz)), t)
        mb.add(prim_box(0.05, 0.05, 0.36), 'wood', M(tuple(p)))
    # escada lateral esquerda (como na referência: apoia no convés) - segunda, do lado externo da doca
    for dz in (-0.16, 0.16):
        beam(mb, (-3.6, DK + 0.0, 0.85 + dz), (-3.35, DK + 1.1, 0.85 + dz), 0.06, 0.05, 'wood_beam')
    for k in range(5):
        t = (k + 0.5) / 5
        p = Vector((-3.6, DK, 0.85)).lerp(Vector((-3.35, DK + 1.1, 0.85)), t)
        mb.add(prim_box(0.05, 0.05, 0.36), 'wood', M(tuple(p)))
    # cordas de amarração do casco aos postes
    for sx in (-1, 1):
        for (z, zz, yy) in ((1.8, 2.2, 1.95), (0.15, -0.3, 1.9)):
            a = Vector((sx * (BX + 0.12), DK + 0.5, z))
            b = Vector((sx * 0.98, yy, zz))
            beam(mb, tuple(a), tuple(b), 0.04, 0.04, 'rope')
    # lanternas em postes altos na frente
    for sx in (-1, 1):
        x = sx * 3.55
        log(mb, (x, DK + 0.5, 3.0), (x, DK + 1.9, 3.0), 0.05, 'wood_beam', n=6)
        beam(mb, (x, DK + 1.9, 3.0), (x - sx * 0.3, DK + 1.9, 3.0), 0.05, 0.05, 'iron')
        H.lantern(mb, M((x - sx * 0.3, DK + 1.78, 3.0)))
    return mb.build(mats, parent=root)


# ---------------------------------------------------------------------------
# Casco em construção, cavaletes, convés, mastro
# ---------------------------------------------------------------------------
HZ0, HZ1 = -1.62, 3.25
# (t, meia-largura no convés, quilha y, convés y)
HULL = [(0.00, 0.62, 1.00, 1.62), (0.06, 0.84, 0.80, 1.62), (0.22, 1.00, 0.66, 1.60), (0.50, 1.08, 0.62, 1.58),
        (0.74, 1.00, 0.70, 1.64), (0.88, 0.70, 0.90, 1.76), (0.96, 0.36, 1.20, 1.98), (1.00, 0.07, 1.58, 2.28)]


def hull_params(t):
    t = max(0.0, min(1.0, t))
    for a, b in zip(HULL[:-1], HULL[1:]):
        if a[0] <= t <= b[0]:
            u = (t - a[0]) / (b[0] - a[0]) if b[0] > a[0] else 0.0
            u = u * u * (3 - 2 * u) * 0.35 + u * 0.65
            return tuple(a[k] + (b[k] - a[k]) * u for k in (1, 2, 3))
    return HULL[-1][1:]


def hull_pt(t, phi):
    """Ponto (x, y) da seção em t, ângulo phi (0 = bordo esquerdo no convés, pi = bordo direito)."""
    hw, kl, dk = hull_params(t)
    return (-hw * math.cos(phi), dk - (dk - kl) * (math.sin(phi) ** 0.72))


def zt(t):
    return HZ0 + t * (HZ1 - HZ0)


def build_ship(mats, root):
    real = MeshBuilder('Ship')
    mb = SC.Xf(real, M((0, SY, 0)))
    ts = sorted(set([h[0] for h in HULL] + [0.03, 0.14, 0.36, 0.62, 0.81, 0.92]))
    nU = 17
    rings = []
    for t in ts:
        hw, kl, dk = hull_params(t)
        ring = []
        for i in range(nU):
            phi = math.pi * i / (nU - 1)
            x, y = hull_pt(t, phi)
            ring.append((x, y, zt(t)))
        rings.append(ring)

    def hull_mat(c, n):
        x, y, z = c
        t = (z - HZ0) / (HZ1 - HZ0)
        hw, kl, dk = hull_params(t)
        if n[1] > 0.6:
            return 'deck'
        f = (y - SY - kl) / max(dk - kl, 0.05)
        if f < 0.36:
            return 'hull_navy'
        if f < 0.56:
            return 'hull_blue'
        if f > 0.86:
            return 'wood_dark'
        return 'hull_white'

    mb.add(prim_rings(rings), 'hull_white', smooth=38, mat_fn=hull_mat)
    # quilha, roda de proa e cadaste
    kp = [(0, hull_params(t)[1] - 0.02, zt(t)) for t in (0.0, 0.08, 0.3, 0.5, 0.7, 0.88, 0.96)]
    tube(mb, kp, [(0.08, 0.1)] * len(kp), 'wood_dark', n=6, smooth=40)
    stem = bezier((0, 1.30, 3.12), (0, 1.9, 3.50), (0, 2.5, 3.40), 6)
    tube(mb, stem, [(0.07, 0.1), (0.07, 0.1), (0.065, 0.09), (0.06, 0.08), (0.055, 0.07), (0.05, 0.06), (0.045, 0.05)],
         'wood_dark', n=6, smooth=40)
    mb.add(prim_sphere(0.1, 0.1, 0.1, 6, 4), 'gold', M((0, 2.58, 3.38)), smooth=60)
    # bulworks (amuradas) e corrimão
    for sx in (-1, 1):
        path, path2 = [], []
        for t in (0.02, 0.1, 0.22, 0.4, 0.58, 0.74, 0.86, 0.93):
            hw, kl, dk = hull_params(t)
            path.append((sx * (hw - 0.05), dk + 0.15, zt(t)))
            path2.append((sx * (hw - 0.02), dk + 0.31, zt(t)))
        tube(mb, path, [(0.05, 0.14)] * len(path), 'wood', n=4, smooth=0)
        tube(mb, path2, [(0.075, 0.04)] * len(path2), 'wood_beam', n=4, smooth=0)
        # balaústres a cada ~0.5
        for t in (0.1, 0.26, 0.42, 0.58, 0.74, 0.86):
            hw, kl, dk = hull_params(t)
            mb.add(prim_box(0.07, 0.34, 0.07, base=True), 'wood_beam', M((sx * (hw - 0.05), dk, zt(t))))
    # portinholas redondas no costado (referência: 3 círculos de aço azul-escuro)
    for sx in (-1, 1):
        for t in (0.34, 0.5, 0.66):
            px, py = hull_pt(t, 0.50 if sx < 0 else math.pi - 0.50)
            mb.add(prim_cyl(0.125, 0.125, 0.07, 10, base=False), 'steel_dark', M((px, py, zt(t)), (0, 0, 90 - sx * 18)), smooth=30)
            mb.add(prim_cyl(0.075, 0.075, 0.08, 10, base=False), 'dark', M((px + sx * 0.012, py, zt(t)), (0, 0, 90 - sx * 18)), smooth=30)
    # ré (cadaste): painel traseiro com janela, friso dourado
    hw, kl, dk = hull_params(0.0)
    mb.add(prim_box(1.1, 0.4, 0.05), 'wood_beam', M((0, 1.28, HZ0 - 0.03)), bevel=0.015)
    for sx in (-1, 1):
        mb.add(prim_box(0.26, 0.18, 0.06), 'dark', M((sx * 0.3, 1.3, HZ0 - 0.06)))
        mb.add(prim_box(0.32, 0.04, 0.07), 'gold', M((sx * 0.3, 1.43, HZ0 - 0.06)))
    mb.add(prim_box(1.15, 0.05, 0.07), 'gold', M((0, 1.5, HZ0 - 0.04)))
    # superestrutura de ré: cabine com telhado de tábuas
    cz0, cz1 = -1.45, -0.62
    cy = 1.62
    mb.add(prim_box(1.5, 0.86, cz1 - cz0, base=True), 'plaster', M((0, cy, (cz0 + cz1) / 2)), bevel=0.02)
    mb.add(prim_box(1.58, 0.07, cz1 - cz0 + 0.08), 'wood_beam', M((0, cy + 0.04, (cz0 + cz1) / 2)))
    for sx in (-1, 1):
        for zz in (cz0 + 0.04, cz1 - 0.04):
            beam(mb, (sx * 0.75, cy, zz), (sx * 0.75, cy + 0.86, zz), 0.09, 0.09, 'wood_beam')
    for zz in (cz0, cz1):
        beam(mb, (-0.75, cy + 0.86, zz), (0.75, cy + 0.86, zz), 0.1, 0.1, 'wood_beam')
    # cobertura de duas águas
    for sx in (-1, 1):
        mb.add(prim_box(0.98, 0.07, cz1 - cz0 + 0.24), 'deck_dark', M((sx * 0.47, cy + 1.07, (cz0 + cz1) / 2), (0, 0, -sx * 16)), bevel=0.015)
    mb.add(prim_box(0.12, 0.1, cz1 - cz0 + 0.3), 'wood_beam', M((0, cy + 1.2, (cz0 + cz1) / 2)), bevel=0.012)
    # porta de frente (+z) e janelas laterais
    mb.add(prim_box(0.5, 0.62, 0.05), 'wood_door', M((-0.3, cy + 0.01, cz1 + 0.02)), bevel=0.01, mat_fn=None)
    mb.add(prim_box(0.54, 0.05, 0.07), 'wood_beam', M((-0.3, cy + 0.65, cz1 + 0.03)))
    mb.add(prim_box(0.34, 0.34, 0.05), 'dark', M((0.42, cy + 0.5, cz1 + 0.02)))
    mb.add(prim_box(0.4, 0.05, 0.07), 'wood_beam', M((0.42, cy + 0.33, cz1 + 0.03)))
    for sx in (-1, 1):
        mb.add(prim_box(0.05, 0.3, 0.44), 'dark', M((sx * 0.76, cy + 0.5, (cz0 + cz1) / 2)))
        mb.add(prim_box(0.07, 0.04, 0.5), 'wood_beam', M((sx * 0.77, cy + 0.33, (cz0 + cz1) / 2)))
    # mastro com cintas de ferro, gávea (cesto), vergas cruzadas, estai
    mast = [(0, 1.60, MZ), (0, 3.0, MZ), (0, 4.8, MZ), (0, 6.6, MZ), (0, 7.4, MZ)]
    tube(mb, mast, [0.19, 0.165, 0.14, 0.115, 0.075], 'wood_dark', n=8, smooth=50)
    for y, r in ((2.0, 0.185), (3.4, 0.16), (4.6, 0.145), (5.8, 0.125), (6.3, 0.115)):
        mb.add(prim_cyl(r + 0.045, r + 0.045, 0.14, 10), 'steel_dark', M((0, y, MZ)), bevel=0.0)
        mb.add(prim_cyl(r + 0.05, r + 0.05, 0.03, 10), 'steel', M((0, y + 0.14, MZ)))
    for y in (3.78 - 0.1, 5.2 - 0.1):          # colares onde as vergas cruzam o mastro
        mb.add(prim_cyl(0.23, 0.23, 0.26, 10), 'steel_dark', M((0, y, MZ)))
    # cesto da gávea (tonel aberto) com aro e viga
    mb.add(prim_rings([ring_h(6.3, 0.34, 0.34, 12, cz=MZ), ring_h(6.5, 0.42, 0.42, 12, cz=MZ), ring_h(6.75, 0.44, 0.44, 12, cz=MZ)],
                      cap0=True, cap1=False), 'wood', smooth=40)
    mb.add(prim_rings([ring_h(6.75, 0.46, 0.46, 12, cz=MZ), ring_h(6.75, 0.37, 0.37, 12, cz=MZ)], cap0=False, cap1=False), 'wood_beam', smooth=0)
    mb.add(prim_rings([ring_h(6.72, 0.44, 0.44, 12, cz=MZ), ring_h(6.82, 0.45, 0.45, 12, cz=MZ)], cap0=False, cap1=False), 'steel_dark', smooth=0)
    for yy in (6.45, 6.65):
        mb.add(prim_cyl(0.47, 0.47, 0.05, 12, base=True), 'steel_dark', M((0, yy, MZ)))
    mb.add(prim_sphere(0.09, 0.09, 0.09, 6, 4), 'gold', M((0, 7.5, MZ)), smooth=60)
    # vergas
    for (y, x0, x1, y0, y1, w) in ((5.3, -1.55, 1.5, 5.4, 5.0, 0.16), (3.8, -1.2, 1.3, 3.6, 3.95, 0.14)):
        beam(mb, (x0, y0, MZ + 0.14), (x1, y1, MZ + 0.14), w, w, 'wood_beam', bevel=0.012)
        for (xx, yy) in ((x0, y0), (x1, y1)):
            mb.add(prim_sphere(0.1, 0.1, 0.1, 6, 3), 'steel_dark', M((xx, yy, MZ + 0.14)), smooth=60)
    # cordame: ovéns do mastro aos bordos e estai à proa
    for sx in (-1, 1):
        for (zz, ty) in ((MZ - 0.05, 5.0), (MZ + 0.35, 5.0)):
            hw, kl, dk = hull_params((zz - HZ0) / (HZ1 - HZ0))
            beam(mb, (0, ty, MZ), (sx * (hw - 0.08), dk + 0.28, zz), 0.035, 0.035, 'rope')
    beam(mb, (0, 6.6, MZ), (0, 2.35, 3.25), 0.035, 0.035, 'rope')
    beam(mb, (0, 6.6, MZ), (0, 1.9, HZ0 + 0.1), 0.035, 0.035, 'rope')
    # bocas de escotilha, fardos de feno, caixotes e barris no convés
    mb.add(prim_box(0.8, 0.1, 0.8, base=True), 'wood_dark', M((0, 1.6, 1.55), (0, 6, 0)), bevel=0.02)
    mb.add(prim_box(0.7, 0.04, 0.7, base=True), 'deck', M((0, 1.7, 1.55), (0, 6, 0)))
    for k in range(3):
        mb.add(prim_box(0.72, 0.03, 0.08, base=True), 'wood_beam', M((0, 1.74, 1.4 + 0.15 * k), (0, 6, 0)))
    H.hay_bale(mb, -0.45, 1.62, 1.15, rot=100, s=0.72)
    H.hay_bale(mb, -0.42, 1.62 + 0.45 * 0.72, 1.18, rot=80, s=0.72)
    H.hay_bale(mb, 0.4, 1.62, 1.35, rot=92, s=0.7)
    H.crate(mb, 0.45, 1.62, 0.55, s=0.36, rot=18)
    H.crate(mb, -0.45, 1.62, 0.5, s=0.32, rot=-10)
    H.barrel(mb, -0.2, 1.62, -0.55, r=0.2, h=0.46)
    # rolos de corda e remos sobressalentes
    N.rope_coil(mb, 0.35, 1.62, -0.55, R=0.18, r=0.045, turns=3, rot=10)
    for sx in (-1, 1):
        beam(mb, (sx * 0.78, 1.82, -0.9), (sx * 0.72, 1.82, 1.4), 0.07, 0.04, 'wood_light')
    return real.build(mats, parent=root)


def build_cradles(mats, root):
    """Cavaletes (calços) sob o casco: mesas de apoio laterais + calços da quilha."""
    mb = MeshBuilder('Cradles')
    for zc in (-1.15, 0.45, 1.95, 2.9):
        t = (zc - HZ0) / (HZ1 - HZ0)
        hw, kl, dk = hull_params(t)
        kl += SY
        # calço sob a quilha
        mb.add(prim_box(0.5, kl - BF - 0.02, 0.36, base=True), 'wood_dark', M((0, BF + 0.05, zc)), bevel=0.02)
        mb.add(prim_box(0.62, 0.08, 0.42), 'wood_beam', M((0, kl - 0.06, zc)), bevel=0.012)
        for sx in (-1, 1):
            # escora inclinada do piso ao costado
            px, py = hull_pt(t, 0.52 if sx < 0 else math.pi - 0.52)
            py += SY
            beam(mb, (sx * 1.42, BF + 0.05, zc), (px * 1.0, py - 0.02, zc), 0.2, 0.2, 'wood_dark', bevel=0.02)
            mb.add(prim_box(0.3, 0.12, 0.3), 'wood_beam', M((px, py - 0.04, zc), (0, 0, -sx * 28)), bevel=0.012)
            # apoio horizontal e calços
            mb.add(prim_box(0.34, 0.12, 0.34, base=True), 'wood_beam', M((sx * 1.42, BF + 0.05, zc)), bevel=0.015)
        # travessa entre as escoras
        beam(mb, (-1.3, BF + 0.45, zc), (1.3, BF + 0.45, zc), 0.12, 0.12, 'wood_beam', bevel=0.01)
        for sx in (-1, 1):
            mb.add(prim_box(0.17, 0.13, 0.17), 'steel_dark', M((sx * 1.28, BF + 0.45, zc)), bevel=0.01)
    return mb.build(mats, parent=root)


# ---------------------------------------------------------------------------
# Torre de pedra com telhado de telhas
# ---------------------------------------------------------------------------
TX, TZ = 0.0, -2.75


def build_tower(mats, root):
    mb = MeshBuilder('Tower')
    h1 = 2.6
    hw0 = 0.82
    tp = 0.93
    mb.add(prim_box(2 * hw0, h1, 2 * hw0, taper=(tp, tp), base=True), 'stone', M((TX, DK, TZ)), bevel=0.03)
    # quoins (cunhais) nos cantos
    for k in range(7):
        y = DK + 0.2 + k * 0.36
        hw = hw0 * (1 - (1 - tp) * (y - DK) / h1)
        for sx in (-1, 1):
            for sz in (-1, 1):
                off = 0.07 if k % 2 == 0 else 0.0
                mb.add(prim_box(0.34 + off, 0.21, 0.34 - off + 0.08), 'stone_light',
                       M((TX + sx * (hw - 0.14), y, TZ + sz * (hw - 0.14))), bevel=0.015)
    # cinta de pedra saliente + cachorros
    y_s = DK + h1
    mb.add(prim_box(2.0, 0.15, 2.0), 'stone_light', M((TX, y_s, TZ)), bevel=0.02)
    mb.add(prim_box(1.9, 0.12, 1.9), 'stone_dark', M((TX, y_s - 0.12, TZ)), bevel=0.02)
    # porta em arco (frente +z) e seteiras
    zf = TZ + hw0 * (1 - (1 - tp) * 0.02)
    H.door_arched(mb, M((TX + 0.0, DK, zf - 0.02)), 0.62, 1.15)
    for sx in (-1, 1):
        mb.add(prim_extrude(H.arch_poly(0.34, 0.7), 0.1, axis='z'), 'stone_light', M((TX + sx * 0.5, DK + 1.35, zf - 0.03)), bevel=0.0)
        mb.add(prim_extrude(H.arch_poly(0.22, 0.58), 0.12, axis='z'), 'dark', M((TX + sx * 0.5, DK + 1.4, zf - 0.02)))
    for sx in (-1, 1):
        xs = TX + sx * (hw0 * 0.97)
        for zz in (-0.25, 0.3):
            mb.add(prim_extrude(H.arch_poly(0.3, 0.64), 0.1, axis='x'), 'stone_light', M((xs, DK + 1.5, TZ + zz)))
            mb.add(prim_extrude(H.arch_poly(0.2, 0.5), 0.12, axis='x'), 'dark', M((xs + sx * 0.01, DK + 1.55, TZ + zz)))
    # pavimento de madeira do mirante (beirais) e andar superior de enxaimel
    ub = y_s + 0.07
    uh = 1.25
    uw = 0.82
    mb.add(prim_box(2 * uw, uh, 2 * uw, base=True), 'plaster', M((TX, ub, TZ)), bevel=0.02)
    for sx in (-1, 1):
        for sz in (-1, 1):
            beam(mb, (TX + sx * uw, ub, TZ + sz * uw), (TX + sx * uw, ub + uh, TZ + sz * uw), 0.14, 0.14, 'wood_beam')
    for yy in (ub + 0.03, ub + uh * 0.5, ub + uh - 0.05):
        for sz in (-1, 1):
            beam(mb, (TX - uw, yy, TZ + sz * (uw + 0.02)), (TX + uw, yy, TZ + sz * (uw + 0.02)), 0.12, 0.08, 'wood_beam')
        for sx in (-1, 1):
            beam(mb, (TX + sx * (uw + 0.02), yy, TZ - uw), (TX + sx * (uw + 0.02), yy, TZ + uw), 0.12, 0.08, 'wood_beam')
    # janelas com venezianas nas quatro faces
    for (yaw, off) in ((0, (0, uw + 0.04)), (90, (uw + 0.04, 0)), (-90, (-(uw + 0.04), 0)), (180, (0, -(uw + 0.04)))):
        T = M((TX + off[0], ub + uh * 0.5 + 0.02, TZ + off[1]), (0, yaw, 0))
        H.window(mb, T, 0.38, 0.5, shutters=True)
    # beirais do telhado (placa de madeira) e consolos
    eave_y = ub + uh
    mb.add(prim_box(2 * uw + 0.5, 0.1, 2 * uw + 0.5), 'wood_beam', M((TX, eave_y, TZ)), bevel=0.015)
    # lanterna/rosa de vento: coroa dourada
    return mb.build(mats, parent=root)


def build_roofs(mats, root):
    mb = MeshBuilder('Roof')
    eave_y = DK + 2.6 + 0.07 + 1.25 + 0.05
    ov = 1.0
    ry = eave_y + 1.65
    rx = 0.45
    up = 0.22      # beirais levantados nas pontas
    # casca interna
    N.roof_solid(mb, ((TX - ov + 0.12, TZ - ov + 0.12), (TX + ov - 0.12, TZ + ov - 0.12)),
                 ((TX - rx, TZ), (TX + rx, TZ)), eave_y + 0.04, ry - 0.06, 'wood_dark')
    cen = (TX, eave_y + 0.8, TZ)
    E = [(TX - ov, eave_y + up, TZ - ov), (TX + ov, eave_y + up, TZ - ov), (TX + ov, eave_y + up, TZ + ov), (TX - ov, eave_y + up, TZ + ov)]
    Rg = [(TX - rx, ry, TZ), (TX + rx, ry, TZ)]
    # frente (+z), fundo (-z): trapézios; lados: triângulos
    N.roof_face(mb, E[3], E[2], Rg[0], Rg[1], 11, 0.24, cen, seed=1, bow=0.22)
    N.roof_face(mb, E[1], E[0], Rg[1], Rg[0], 11, 0.24, cen, seed=2, bow=0.22)
    N.roof_face(mb, E[2], E[1], Rg[1], Rg[1], 11, 0.24, cen, seed=3, bow=0.18)
    N.roof_face(mb, E[0], E[3], Rg[0], Rg[0], 11, 0.24, cen, seed=4, bow=0.18)
    # guarnição de madeira: aba do beiral e espigões (arestas das águas)
    for a, b in zip(E, E[1:] + E[:1]):
        beam(mb, a, b, 0.14, 0.1, 'wood_beam')
    for a, rp in ((E[0], Rg[0]), (E[3], Rg[0]), (E[1], Rg[1]), (E[2], Rg[1])):
        beam(mb, (a[0], a[1] + 0.02, a[2]), (rp[0], rp[1] + 0.03, rp[2]), 0.11, 0.09, 'wood_beam')
    # fitas roxas penduradas nos beirais da frente
    for sx in (-1, 1):
        for k, (dx, dz) in enumerate(((0.12, 0.0), (0.0, -0.18))):
            pp = [(0, 0), (0.14, 0), (0.14, -0.7 + 0.12 * k), (0.07, -0.58 + 0.12 * k), (0, -0.78 + 0.12 * k)]
            mb.add(N.waved(prim_extrude(pp, 0.025, axis='z'), 0.03, 7.0, 4.0, sx + k), 'cloth_purple',
                   M((TX + sx * (ov - 0.12 - 0.2 * k), eave_y + up - 0.04, TZ + ov + 0.02 - 0.1 * k)), smooth=40)
    # cumeeira com ponteiras douradas e cata-vento
    mb.add(prim_box(2 * rx + 0.16, 0.1, 0.16), 'wood_beam', M((TX, ry + 0.02, TZ)), bevel=0.01)
    for sx in (-1, 1):
        mb.add(prim_sphere(0.1, 0.1, 0.1, 6, 3), 'gold', M((TX + sx * (rx + 0.08), ry + 0.04, TZ)), smooth=60)
        mb.add(prim_cone(0.08, 0.3, 5), 'gold', M((TX + sx * (rx + 0.08), ry + 0.1, TZ)))
    # anexo baixo à esquerda com telhado de quatro águas
    ax, az = -1.42, -3.05
    ah = 1.45
    mb.add(prim_box(1.1, ah, 1.3, taper=(0.95, 0.95), base=True), 'stone', M((ax, DK, az)), bevel=0.03)
    for sz in (-1, 1):
        mb.add(prim_box(0.2, 0.2, 0.2), 'stone_light', M((ax - 0.5, DK + 0.25 + 0.5 * (sz > 0), az + sz * 0.6)), bevel=0.012)
        mb.add(prim_box(0.2, 0.2, 0.2), 'stone_light', M((ax + 0.5, DK + 0.25 + 0.5 * (sz > 0), az + sz * 0.6)), bevel=0.012)
    H.door_arched(mb, M((ax + 0.0, DK, az + 0.62)), 0.5, 0.95)
    mb.add(prim_box(0.08, 0.34, 0.06), 'dark', M((ax - 0.34, DK + 0.85, az + 0.64)))
    ay = DK + ah + 0.02
    aov = 0.78
    ary = ay + 0.95
    arx = 0.18
    N.roof_solid(mb, ((ax - aov + 0.1, az - aov + 0.1), (ax + aov - 0.1, az + aov - 0.1)),
                 ((ax - arx, az), (ax + arx, az)), ay + 0.03, ary - 0.05, 'wood_dark')
    cen2 = (ax, ay + 0.5, az)
    E2 = [(ax - aov, ay + 0.12, az - aov), (ax + aov, ay + 0.12, az - aov), (ax + aov, ay + 0.12, az + aov), (ax - aov, ay + 0.12, az + aov)]
    R2 = [(ax - arx, ary, az), (ax + arx, ary, az)]
    N.roof_face(mb, E2[3], E2[2], R2[0], R2[1], 6, 0.26, cen2, seed=11, bow=0.1)
    N.roof_face(mb, E2[1], E2[0], R2[1], R2[0], 6, 0.26, cen2, seed=12, bow=0.1)
    N.roof_face(mb, E2[2], E2[1], R2[1], R2[1], 6, 0.26, cen2, seed=13, bow=0.08)
    N.roof_face(mb, E2[0], E2[3], R2[0], R2[0], 6, 0.26, cen2, seed=14, bow=0.08)
    for a, b in zip(E2, E2[1:] + E2[:1]):
        beam(mb, a, b, 0.12, 0.09, 'wood_beam')
    for a, rp in ((E2[0], R2[0]), (E2[3], R2[0]), (E2[1], R2[1]), (E2[2], R2[1])):
        beam(mb, (a[0], a[1] + 0.02, a[2]), (rp[0], rp[1] + 0.03, rp[2]), 0.09, 0.08, 'wood_beam')
    mb.add(prim_box(0.18 * 2 + 0.1, 0.07, 0.12), 'wood_beam', M((ax, ary + 0.02, az)))
    mb.add(prim_sphere(0.07, 0.07, 0.07, 6, 3), 'gold', M((ax, ary + 0.1, az)), smooth=60)
    return mb.build(mats, parent=root)


# ---------------------------------------------------------------------------
# Guindastes (parte estática + parte giratória Anim_Crane*)
# ---------------------------------------------------------------------------
def crane_static(mb, cx, cz, d):
    """Base de pedra, cavalete de madeira com colar de aço, bloco de cabeça com chapas e roda de cabo (ref. guindastes)."""
    mb.add(prim_box(1.15, 0.7, 1.15, taper=(0.9, 0.9), base=True), 'stone', M((cx, DK, cz)), bevel=0.03)
    # pernas do cavalete (A-frame) e travessas
    ty = DK + 0.7
    for sx in (-1, 1):
        for sz in (-1, 1):
            beam(mb, (cx + sx * 0.42, ty, cz + sz * 0.42), (cx + sx * 0.24, ty + 0.85, cz + sz * 0.24), 0.17, 0.17, 'wood_dark')
    for yy, k in ((ty + 0.3, 0.36), (ty + 0.62, 0.29)):
        for sx in (-1, 1):
            beam(mb, (cx + sx * k, yy, cz - k), (cx + sx * k, yy, cz + k), 0.1, 0.08, 'wood_beam')
        for sz in (-1, 1):
            beam(mb, (cx - k, yy, cz + sz * k), (cx + k, yy, cz + sz * k), 0.1, 0.08, 'wood_beam')
    mb.add(prim_box(1.0, 0.1, 1.0), 'wood_beam', M((cx, ty + 0.9, cz)), bevel=0.02)
    # colar de aço aparafusado
    mb.add(prim_box(0.88, 0.2, 0.88), 'steel_dark', M((cx, ty + 1.05, cz)), bevel=0.03)
    N.rivets(mb, [(cx + sx * 0.38, ty + 1.15, cz + sz * 0.38) for sx in (-1, 1) for sz in (-1, 1)], 0.04)
    N.rivets(mb, [(cx + sx * 0.46, ty + 1.05, cz) for sx in (-1, 1)] + [(cx, ty + 1.05, cz + sz * 0.46) for sz in (-1, 1)], 0.035)
    # cabeça: bloco de madeira + chapas de aço arredondadas nas duas faces (z)
    hy = ty + 1.15
    mb.add(prim_box(0.6, 1.0, 0.46, base=True), 'wood_dark', M((cx, hy, cz)), bevel=0.03)
    for sz in (-1, 1):
        mb.add(prim_box(0.72, 0.8, 0.07), 'steel', M((cx, hy + 0.5, cz + sz * 0.27)), bevel=0.02)
        mb.add(prim_cyl(0.36, 0.36, 0.07, 14, base=False), 'steel', M((cx, hy + 0.9, cz + sz * 0.27), (90, 0, 0)), smooth=30)
        N.rivets(mb, [(cx + dx, hy + dy, cz + sz * 0.32) for dx, dy in ((-0.28, 0.25), (0.28, 0.25), (0.0, 0.95), (-0.28, 0.65), (0.28, 0.65))], 0.045)
        mb.add(prim_cyl(0.14, 0.14, 0.09, 10, base=False), 'steel_dark', M((cx, hy + 0.9, cz + sz * 0.3), (90, 0, 0)), smooth=30)
    # roda de cabo traseira (disco de ferro com aro e cabo enrolado) e engrenagem
    wx, wy = cx - d * 0.62, hy + 0.55
    for sz in (-1, 1):
        mb.add(prim_cyl(0.4, 0.4, 0.06, 16, base=False), 'steel_dark', M((wx, wy, cz + sz * 0.16), (90, 0, 0)), smooth=30)
    mb.add(prim_cyl(0.36, 0.36, 0.26, 16, base=False), 'rope', M((wx, wy, cz), (90, 0, 0)), smooth=30)
    mb.add(prim_cyl(0.16, 0.16, 0.5, 8, base=False), 'steel', M((wx, wy, cz), (90, 0, 0)), smooth=30)
    N.gear(mb, M((wx, wy, cz - 0.3), (0, 180, 0)), 0.3, 10, 0.08, body='steel_dark', hub='steel', spokes=3)
    # degrau de pedra e sacos
    mb.add(prim_box(0.5, 0.3, 0.4, base=True), 'stone_dark', M((cx - d * 0.2, DK, cz - 0.82)), bevel=0.03)
    mb.add(prim_box(0.42, 0.22, 0.34, base=True), 'stone', M((cx + d * 0.05, DK, cz + 0.85), (0, 12, 0)), bevel=0.03)


def crane_anim(an, cx, cz, d, length=1.5, rise=1.0, hook_y=1.5):
    """Lança giratória: viga de madeira com capas de aço, polia e corda em arco até a roda, cabo e gancho."""
    ty = DK + 0.7
    py = ty + 1.15 + 0.9          # eixo da cabeça
    hub = Vector((cx, py, cz))
    tip = Vector((cx + d * length, py + rise, cz))
    base = Vector((cx - d * 0.2, py - 0.32, cz))
    beam(an, tuple(base), tuple(tip), 0.34, 0.3, 'wood_light', bevel=0.03)
    # cinta de ferro e chapas aparafusadas na lança
    dv = (tip - base).normalized()
    for t in (0.22, 0.55, 0.85):
        p = base.lerp(tip, t)
        beam(an, tuple(p - dv * 0.07), tuple(p + dv * 0.07), 0.4, 0.37, 'steel_dark')
        N.rivets(an, [tuple(p + Vector((0, 0, 0.2)) + dv * 0.0), tuple(p + Vector((0, 0, -0.2)))], 0.04)
    # chapas laterais da junta (dois discos aparafusados)
    for sz in (-1, 1):
        an.add(prim_cyl(0.3, 0.3, 0.06, 12, base=False), 'steel', M((hub.x, hub.y - 0.18, cz + sz * 0.2), (90, 0, 0)), smooth=30)
        N.rivets(an, [(hub.x, hub.y - 0.18, cz + sz * 0.25)], 0.045)
    # tampa de aço na ponta da lança + polia
    cap = base.lerp(tip, 0.97)
    an.add(prim_box(0.32, 0.42, 0.42), 'steel', M(tuple(cap), (0, 0, d * math.degrees(math.atan2(dv.y, abs(dv.x))))), bevel=0.02)
    for sz in (-1, 1):
        an.add(prim_cyl(0.2, 0.2, 0.05, 12, base=False), 'steel_dark', M((tip.x, tip.y - 0.02, cz + sz * 0.24), (90, 0, 0)), smooth=30)
        N.rivets(an, [(tip.x, tip.y - 0.02, cz + sz * 0.28)], 0.04)
    # corda em arco da ponta até o topo da roda traseira
    wx, wy = cx - d * 0.62, DK + 0.7 + 1.15 + 0.55
    p0 = (tip.x - d * 0.05, tip.y + 0.14, cz)
    p2 = (wx, wy + 0.46, cz)
    mid = ((p0[0] + p2[0]) / 2, (p0[1] + p2[1]) / 2 - 0.3, cz)
    arc = bezier(p0, mid, p2, 7)
    tube(an, arc, [0.04] * len(arc), 'rope', n=5, smooth=50)
    # cabo vertical até o gancho (corda grossa) e gancho de aço
    hx = tip.x + d * 0.02
    tube(an, [(hx, tip.y - 0.05, cz), (hx, hook_y + 0.3, cz)], [0.05, 0.05], 'rope', n=5, smooth=50)
    an.add(torus_ring((0, 0), 0.1, 0.03), 'steel_dark', M((hx, hook_y + 0.27, cz), (90, 0, 0)), smooth=50)
    hk = bezier((hx, hook_y + 0.2, cz), (hx, hook_y - 0.34, cz), (hx + d * 0.26, hook_y - 0.08, cz), 6)
    tube(an, hk, [0.055, 0.06, 0.065, 0.065, 0.055, 0.035, 0.012], 'steel_dark', n=6, smooth=50)
    an.add(prim_box(0.14, 0.14, 0.14), 'steel', M((hx, hook_y + 0.12, cz)), bevel=0.015)


def torus_ring(c, R, r=0.025):
    return N.torus_prim(R, r, 10, 4)


def build_cranes(mats, root):
    st = MeshBuilder('Dock2')
    K = 1.1
    CZ = -1.5
    for cx, d in ((-2.7, +1), (2.7, -1)):
        crane_static(N.Sc(st, (cx, DK, CZ), K), cx, CZ, d)
    st_obj = st.build(mats, parent=root)
    out = [st_obj]
    for (name, cx, d, ln, rs, hy) in (('Anim_Crane', -2.7, +1, 1.5, 1.0, 1.5), ('Anim_Crane_2', 2.7, -1, 1.4, 1.12, 1.7)):
        mb = MeshBuilder(name)
        py = DK + (DK + 0.7 + 1.15 + 0.9 - DK) * K
        an = N.Sc(Piv(mb, (cx, py, CZ)), (cx, DK, CZ), K)
        crane_anim(an, cx, CZ, d, length=ln, rise=rs, hook_y=hy)
        out.append(mb.build(mats, parent=root, location=(cx, py, CZ)))
    return out


# ---------------------------------------------------------------------------
# Adereços do convés
# ---------------------------------------------------------------------------
def build_props(mats, root):
    mb = MeshBuilder('Props')
    # bancada de ferramentas (frente-direita)
    bx, bz = 2.55, 2.6
    T = M((bx, DK, bz), (0, -18, 0))
    mb.add(prim_box(1.35, 0.1, 0.62, base=True), 'wood_light', T @ M((0, 0.72, 0)), bevel=0.015)
    for sx in (-1, 1):
        for sz in (-1, 1):
            mb.add(prim_box(0.1, 0.72, 0.1, base=True), 'wood_beam', T @ M((sx * 0.58, 0, sz * 0.24)), bevel=0.01)
    beam(mb, (bx, DK + 0.3, bz), (bx, DK + 0.3, bz), 0.1, 0.1, 'wood_beam') if False else None
    mb.add(prim_box(1.15, 0.07, 0.08), 'wood_beam', T @ M((0, 0.3, 0.24)))
    mb.add(prim_box(1.15, 0.07, 0.08), 'wood_beam', T @ M((0, 0.3, -0.24)))
    # chaves inglesas, martelo, serra e plano
    mb.add(prim_box(0.46, 0.035, 0.07), 'steel', T @ M((-0.35, 0.8, 0.12), (0, 28, 0)), bevel=0.006)
    mb.add(prim_box(0.12, 0.035, 0.14), 'steel', T @ M((-0.55, 0.8, 0.2), (0, 28, 0)), bevel=0.006)
    mb.add(prim_box(0.5, 0.035, 0.07), 'steel', T @ M((-0.2, 0.8, -0.1), (0, -35, 0)), bevel=0.006)
    mb.add(prim_box(0.12, 0.035, 0.12), 'steel', T @ M((-0.05, 0.8, -0.2), (0, -35, 0)), bevel=0.006)
    mb.add(prim_box(0.34, 0.04, 0.05), 'wood', T @ M((0.25, 0.8, 0.0), (0, 8, 0)))
    mb.add(prim_box(0.16, 0.1, 0.12), 'iron', T @ M((0.4, 0.84, 0.0), (0, 8, 0)), bevel=0.01)
    mb.add(prim_box(0.5, 0.03, 0.12, taper=(1.0, 0.7)), 'steel', T @ M((0.12, 0.8, -0.18), (0, -4, 0)), bevel=0.005)
    mb.add(prim_box(0.34, 0.12, 0.08), 'wood', T @ M((0.5, 0.84, -0.18)), bevel=0.01)
    mb.add(prim_box(0.3, 0.03, 0.22), 'parchment', T @ M((0.52, 0.8, 0.18), (0, 14, 0)))
    # tornos de bancada
    mb.add(prim_box(0.16, 0.2, 0.2), 'iron', T @ M((-0.58, 0.88, 0.0)), bevel=0.012)
    # rack de ferramentas (esquerda): quadro com chaves, martelo e serra
    rx, rz = -3.35, 1.75
    TR = M((rx, DK, rz), (0, 90, 0))
    for sx in (-1, 1):
        mb.add(prim_box(0.14, 1.5, 0.14, base=True), 'wood_beam', TR @ M((sx * 0.56, 0, 0)), bevel=0.015)
        beam(mb, (rx, DK, rz + sx * 0.56 + 0.0), (rx - 0.35, DK + 0.5, rz + sx * 0.56), 0.1, 0.1, 'wood_beam') if False else None
        mb.add(prim_box(0.14, 0.14, 0.7, base=True), 'wood_beam', M((rx - 0.25, DK, rz + sx * 0.56)))
    mb.add(prim_box(1.3, 0.14, 0.14), 'wood_beam', TR @ M((0, 1.42, 0)), bevel=0.012)
    mb.add(prim_box(1.1, 0.1, 0.1), 'wood', TR @ M((0, 0.72, 0)))
    # ferramentas penduradas
    for k, off in enumerate((-0.38, -0.12, 0.14, 0.4)):
        P = TR @ M((off, 0.0, 0.08))
        if k == 0:    # chave de boca
            mb.add(prim_box(0.06, 0.55, 0.035), 'steel', P @ M((0, 0.95, 0), (0, 0, 8)), bevel=0.006)
            mb.add(prim_box(0.14, 0.12, 0.035), 'steel', P @ M((0.0, 1.28, 0)), bevel=0.006)
            mb.add(prim_box(0.05, 0.08, 0.04), 'dark', P @ M((0.0, 1.3, 0)))
        elif k == 1:  # martelo
            mb.add(prim_box(0.05, 0.6, 0.04), 'wood', P @ M((0, 0.88, 0)))
            mb.add(prim_box(0.26, 0.12, 0.08), 'iron', P @ M((0, 1.22, 0)), bevel=0.01)
        elif k == 2:  # chave inglesa
            mb.add(prim_box(0.06, 0.6, 0.035), 'steel', P @ M((0, 0.9, 0), (0, 0, -6)), bevel=0.006)
            mb.add(prim_box(0.15, 0.1, 0.04), 'steel', P @ M((0.0, 1.22, 0)), bevel=0.006)
            mb.add(prim_box(0.05, 0.1, 0.04), 'dark', P @ M((0.0, 1.26, 0)))
        else:         # serra
            mb.add(prim_box(0.14, 0.5, 0.025, taper=(0.5, 1.0)), 'steel', P @ M((0, 0.95, 0)), bevel=0.004)
            mb.add(prim_box(0.06, 0.18, 0.05), 'wood', P @ M((0, 1.28, 0)))
    # fardos de feno (frente-esquerda e frente-direita)
    H.hay_bale(mb, -3.0, DK, 2.75, rot=14, s=1.05)
    H.hay_bale(mb, -3.05, DK + 0.47, 2.78, rot=-8, s=1.05)
    H.hay_bale(mb, -2.45, DK, 3.2, rot=-20, s=0.95)
    H.hay_bale(mb, 3.2, DK, 0.7, rot=8, s=1.0)
    H.hay_bale(mb, 3.15, DK + 0.45, 0.72, rot=-10, s=1.0)
    # rolos de corda (esquerda, junto ao rack) e sobre a bancada
    N.rope_coil(mb, -3.05, DK, 0.55, R=0.3, r=0.065, turns=4, rot=0)
    N.rope_coil(mb, -2.6, DK, 0.2, R=0.24, r=0.055, turns=3, rot=30)
    N.rope_coil(mb, 1.95, DK, 3.15, R=0.26, r=0.06, turns=3, rot=10)
    # caixotes empilhados (direita, meio) + caixa aberta com tintas (frente-direita)
    H.crate(mb, 3.05, DK, -0.55, s=0.62, rot=8, mat='crate')
    H.crate(mb, 3.2, DK, 0.08, s=0.52, rot=-14, mat='crate')
    H.crate(mb, 3.0, DK + 0.62, -0.5, s=0.5, rot=-10, mat='crate')
    H.crate(mb, 2.45, DK, -0.2, s=0.45, rot=24, mat='crate')
    # caixa aberta com potes de tinta coloridos
    mb.add(prim_box(0.9, 0.34, 0.5, base=True), 'wood_light', M((2.75, DK, 1.25), (0, -12, 0)), bevel=0.015)
    mb.add(prim_box(0.8, 0.04, 0.4), 'dark', M((2.75, DK + 0.3, 1.25), (0, -12, 0)))
    for k, (mt, dx, dz) in enumerate((('paint_red', -0.27, -0.08), ('paint_green', -0.09, 0.08), ('paint_yellow', 0.09, -0.08),
                                      ('paint_blue', 0.27, 0.08), ('paint_white', 0.0, 0.0))):
        Tp = M((2.75, DK + 0.3, 1.25), (0, -12, 0)) @ M((dx, 0.0, dz))
        mb.add(prim_cyl(0.075, 0.075, 0.2 + 0.03 * (k % 2), 8, base=True), mt, Tp, smooth=30)
        mb.add(prim_cyl(0.08, 0.08, 0.025, 8, base=True), 'iron', Tp @ M((0, 0.17, 0)), smooth=30)
    # barris (direita)
    H.barrel(mb, 3.2, DK, 1.95, r=0.26, h=0.6)
    H.barrel(mb, 2.85, DK, 2.05, r=0.24, h=0.56)
    H.barrel(mb, 3.25, DK, -2.2, r=0.26, h=0.6)
    H.barrel(mb, -2.2, DK, 1.0, r=0.24, h=0.56)
    # âncora de reserva (tubos e ferro) apoiada na frente-esquerda
    ax, az = -1.95, 3.1
    for sx in (-1, 1):
        pts = bezier((ax, DK + 0.12, az), (ax + sx * 0.3, DK + 0.12, az - 0.05), (ax + sx * 0.36, DK + 0.5, az), 4)
        tube(mb, pts, [0.035] * len(pts), 'iron', n=6, smooth=50)
        mb.add(prim_cone(0.07, 0.16, 4), 'iron', M((ax + sx * 0.36, DK + 0.5, az)))
    beam(mb, (ax, DK + 0.12, az), (ax, DK + 0.92, az), 0.07, 0.07, 'iron')
    mb.add(prim_box(0.5, 0.06, 0.06), 'wood_dark', M((ax, DK + 0.84, az)))
    mb.add(torus_ring((0, 0), 0.08, 0.025), 'iron', M((ax, DK + 0.98, az), (90, 0, 0)), smooth=50)
    # pilha de tábuas e aparas (esquerda, fundo)
    for i in range(4):
        mb.add(prim_box(1.3, 0.1, 0.34, base=True), 'plank_new', M((-3.0, DK + 0.11 * i, -0.85), (0, 5 * (i % 2) - 2, 0)), bevel=0.01)
    # lanterna no pé do rack e latas
    return mb.build(mats, parent=root)


def build_banners(mats, root):
    mb = MeshBuilder('Anim_Banners')
    # estandarte pendurado na verga baixa do mastro (frente +z) com brasão
    bw, bh = 0.9, 1.45
    by = 4.1
    N.banner_cloth(mb, M((0.0, by, MZ + 0.2)), bw, bh, 'team', 'gold', wave=(0.035, 4.0, 2.5, 0.0), pointed=True)
    N.emblem(mb, 0.0, by - 0.55, MZ + 0.2 + 0.04, k=1.25, wave=(0.035, 4.0, 2.5, 0.0))
    for sx in (-1, 1):
        mb.add(prim_box(0.05, 0.12, 0.05), 'gold', M((sx * 0.4, by + 0.02, MZ + 0.2)))
    # galhardete (cauda de andorinha) no lado direito da torre
    px = 0.92 + (TX)
    log(mb, (px, DK + 2.3, TZ + 0.45), (px + 0.1, DK + 2.3, TZ + 0.45), 0.03, 'wood_beam', n=5) if False else None
    mb.add(prim_box(0.8, 0.05, 0.05), 'gold', M((TX + 1.25, DK + 2.35, TZ + 0.45)))
    mb.add(prim_sphere(0.06, 0.06, 0.06, 5, 3), 'gold', M((TX + 1.68, DK + 2.35, TZ + 0.45)), smooth=60)
    N.banner_cloth(mb, M((TX + 0.88, DK + 2.33, TZ + 0.45)), 0.75, 0.52, 'team', 'gold', wave=(0.05, 3.0, 4.0, 1.0), tail=True)
    N.emblem(mb, TX + 1.2, DK + 2.07, TZ + 0.45 + 0.04, k=0.62, wave=(0.05, 3.0, 4.0, 1.0))
    # fitas roxas no beiral esquerdo do telhado (decoração) e faixa de time sob o beiral
    mb.add(prim_box(2.0, 0.14, 0.04), 'team', M((TX, DK + 2.6 + 0.07 + 0.2, TZ + 0.86)), bevel=0.01)
    for sx in (-1, 1):
        mb.add(prim_box(0.05, 0.14, 0.7, ), 'team', M((TX + sx * 0.86 * 0, DK, 0))) if False else None
    # banderolas nos postes da frente
    for sx in (-1, 1):
        x = sx * 3.55
        N.banner_cloth(mb, M((x - sx * 0.3, DK + 1.55, 3.0)), 0.3, 0.55, 'team', 'gold', wave=(0.03, 6.0, 3.0, sx), pointed=True)
    return mb.build(mats, parent=root)


def main():
    args = C.script_args()
    C.reset_scene()
    N.patch_small_bevels(0.025)
    mats = C.make_paint_set(PALETTE)
    root = C.make_empty('Shipyard')
    base = build_base(mats, root)
    dock = build_dock(mats, root)
    ship = build_ship(mats, root)
    cradles = build_cradles(mats, root)
    tower = build_tower(mats, root)
    roofs = build_roofs(mats, root)
    cranes = build_cranes(mats, root)
    props = build_props(mats, root)
    banners = build_banners(mats, root)
    static = [base, dock, ship, cradles, tower, roofs, cranes[0], props]
    anim = cranes[1:]
    weights = {'Base': 0.7, 'Dock': 0.8, 'Ship': 1.3, 'Cradles': 0.7, 'Tower': 1.0, 'Roof': 1.0, 'Dock2': 0.9, 'Props': 1.0,
               'Anim_Banners': 1.0, 'Anim_Crane': 0.9, 'Anim_Crane_2': 0.9}
    finish_building(root, 'shipyard', 'shipyard.glb', 'shipyard_atlas', static, banners, weights, TEAM_DEFAULT, args,
                    spawn=(0, 0, 4.6), rally=(0, 0, 6.6), extra_anim=anim, game_dist=82,
                    extra_views=[('ref', (-1.0, 0.95, 1.0)), ('ref2', (-0.2, 0.7, 1.0)), ('low', (0.8, 0.15, 1.0))])


if __name__ == '__main__':
    main()
