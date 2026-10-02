"""
build_ship_dock.py — Doca do Clã (tipo orc `ship_dock`) gerada 100% por script (ART-naval-buildings, versão orc).
Baseado no Estaleiro humano (build_shipyard.py). Referência: docs/refs/naval/orc_naval_buildings_ref.png (esquerda).

Uso:
  blender -b --factory-startup --python tools/blender/build_ship_dock.py -- [--no-render]

Saída (public/models/ship_dock.glb), coordenadas do jogo, origem no centro da base (y=0 = chão), mar = +Z:
  ShipDock (raiz)
  ├─ Static_Mesh       plataforma de toras e terra batida, rampa de tábuas com estacas, casco de pele e ossos em construção
  │                    sobre cavaletes, portal de presas de marfim com viga de tora, torre de vigia de madeira com telhado
  │                    de peles pontudo e espinhos, pilhas de toras, couro esticado, barris, braseiro (Atlas)
  ├─ Anim_Banners      estandarte esfarrapado com caveira de lobo (TeamColor) no mastro da torre e faixa da viga
  ├─ Anim_Crane        guindaste esquerdo de toras e ossos (lança, cordas e gancho; pivô no topo da coluna)
  ├─ Anim_Crane_2      guindaste direito
  ├─ Socket_UnitSpawn  saída dos navios (para o mar, +Z)
  └─ Socket_Rally      ponto de reunião padrão
Pegada ~7,5 x 7,5, altura ~7,6.
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
from bld_common import beam, tube, log, skull, orient, finish_building  # noqa: E402
import bld_orc as O  # noqa: E402
import build_ogre_den as D  # noqa: E402
import naval_common as N  # noqa: E402
import siege_common as SC  # noqa: E402
import build_shipyard as SY  # noqa: E402  (apenas a geometria do casco)
from naval_common import Piv  # noqa: E402

TEAM_DEFAULT = '#b81d24'
DK = 0.85
BF = 0.10
BX = 1.55
BZ = -1.90
SYL = 0.50          # elevação do casco

PALETTE = dict(D.PALETTE)
PALETTE.update(O.ORC_EXTRAS)
PALETTE['hull_hide'] = dict(base='#b98550', var='#8a5a30', var_scale=1.8, var_amt=1.0, fine=0.12, top=0.3, edge='#e0b080',
                            edge_amt=0.45, edge_r=0.02, ao=(0.3, 0.55))
PALETTE['hull_hide_dark'] = dict(PALETTE['hull_hide'], base='#8c5d36', var='#684220')
PALETTE['plank'] = dict(PALETTE['plank'], base='#8a6338', var='#634226', edge='#c29a68')
PALETTE['mud'] = dict(PALETTE['mud'], base='#7d6240', var='#57432a')
PALETTE['ivory'] = dict(PALETTE['bone'], base='#e6dcb8', var='#c4b78e')


def tusk_big(mb, p0, tip, bulge, r0=0.3, mat='ivory', band_mat='leather', bands=(0.18, 0.45, 0.72), n=8, iron_band=True):
    """Presa grande de marfim (tubo afilado) com tiras de couro e ferro amarradas."""
    p0, tip = Vector(p0), Vector(tip)
    mid = (p0 + tip) / 2 + Vector(bulge)
    pts = bezier(tuple(p0), tuple(mid), tuple(tip), 12)
    rad = [max(0.03, r0 * (1.0 - 0.85 * (i / 12) ** 1.1)) for i in range(13)]
    tube(mb, pts, rad, mat, n=n, smooth=45)
    for k, t in enumerate(bands):
        i = max(1, min(11, int(round(t * 12))))
        d = Vector(pts[i + 1]) - Vector(pts[i - 1])
        mb.add(prim_cyl(rad[i] * 1.2, rad[i] * 1.2, 0.17, 8, base=False), band_mat, Matrix.Translation(pts[i]) @ orient(d), smooth=0)
        if iron_band and k % 2 == 0:
            mb.add(prim_cyl(rad[i] * 1.26, rad[i] * 1.26, 0.05, 8, base=False), 'iron', Matrix.Translation(Vector(pts[i]) + d.normalized() * 0.12) @ orient(d), smooth=0)


def spike(mb, x, y, z, h=0.5, r=0.07, tilt=(0, 0, 0), mat='bone'):
    mb.add(prim_cone(r, h, 5), mat, M((x, y, z), tilt), smooth=30)


# ---------------------------------------------------------------------------
# Plataforma de toras, terra batida e rampa
# ---------------------------------------------------------------------------
def build_base(mats, root):
    mb = MeshBuilder('Base')
    for sx in (-1, 1):
        mb.add(prim_box(2.2, DK - 0.12, 7.5, taper=(0.97, 1.0), base=True), 'rock', M((sx * 2.65, 0, 0)), bevel=0.06)
        mb.add(prim_box(1.98, 0.14, 7.2, base=True), 'mud', M((sx * 2.65, DK - 0.14, -0.02)), bevel=0.0)
    mb.add(prim_box(2 * BX + 0.1, DK - 0.12, 3.75 + BZ, base=True), 'rock', M((0, 0, (BZ - 3.75) / 2)), bevel=0.06)
    mb.add(prim_box(2 * BX - 0.1, 0.14, 1.4, base=True), 'mud', M((0, DK - 0.14, -2.85)))
    # tábuas do convés (inset) dos dois lados: ripas de plank sobre a terra
    for sx in (-1, 1):
        mb.add(prim_box(1.7, 0.06, 6.2, base=True), 'plank', M((sx * 2.65, DK - 0.04, 0.35)), bevel=0.008)
    mb.add(prim_box(2.4, 0.06, 1.0, base=True), 'plank', M((0, DK - 0.04, -2.85)), bevel=0.008)
    # cunhais de pedra bruta nos cantos
    for (x, z) in ((-3.44, 3.44), (3.44, 3.44), (-3.44, -3.44), (3.44, -3.44)):
        mb.add(prim_sphere(0.36, 0.28, 0.34, 7, 4, y_min=-0.3), 'rock_plain', M((x, DK - 0.06, z), (0, 20 * x, 0)), smooth=0)
    # rampa de tábuas (piso da doca seca) levemente inclinada para o mar + trilhos de tora
    mb.add(prim_box(2 * BX, BF, 3.75 - BZ, base=True), 'mud', M((0, 0, (3.75 + BZ) / 2)))
    for k in range(17):
        z = BZ + 0.15 + k * 0.335
        mb.add(prim_box(2 * BX - 0.15, 0.09, 0.3, base=True), 'plank', M((0, BF - 0.01, z), (-2.0, 0, 0)), bevel=0.01)
    for sx in (-1, 1):
        log(mb, (sx * 0.9, BF + 0.14, BZ + 0.15), (sx * 0.9, BF + 0.1, 3.75), 0.1, 'log', n=6)
        for z in (-1.3, 0.2, 1.7, 3.0):
            mb.add(prim_box(0.34, 0.06, 0.1), 'iron', M((sx * 0.9, BF + 0.2, z)))
    # estacas de espinhos nas bordas da rampa (apontando para o mar, em ângulo)
    for sx in (-1, 1):
        for z in (0.5, 1.4, 2.3, 3.2):
            x = sx * (BX + 0.12)
            log(mb, (x, DK - 0.1, z), (x + sx * 0.05, DK + 0.55, z + 0.1), 0.08, 'bark', n=5, tip=0.32)
        for z in (2.0, 2.8, 3.55):
            spike(mb, sx * (BX + 0.05), 0.2, z, h=0.5, r=0.07, tilt=(60, 0, -sx * 8))
    return mb.build(mats, parent=root)


def build_dock(mats, root):
    """Estacas de amarração, escadas de tora, lanternas-caveira."""
    mb = MeshBuilder('Dock')
    # mourões de tora com cinta de ferro ao longo da rampa e das bordas
    def post(x, z, h=0.65, r=0.15, y0=DK):
        log(mb, (x, y0, z), (x, y0 + h, z), r, 'bark', n=6)
        mb.add(prim_cyl(r * 1.25, r * 1.25, 0.07, 6), 'iron', M((x, y0 + h * 0.5, z)), smooth=0)
        mb.add(prim_cone(r * 0.95, 0.2, 6), 'bark', M((x, y0 + h, z)), smooth=0)
    for z in (-1.5, 0.15, 1.8, 3.35):
        post(-(BX + 0.14), z)
        post(BX + 0.14, z)
    for x in (-3.15, -2.5, -1.95, 1.95, 2.5, 3.15):
        post(x, 3.55, h=0.8, r=0.17)
    for z in (1.4, -0.4, -2.2):
        post(-3.6, z, h=0.75, r=0.17)
        post(3.6, z, h=0.75, r=0.17)
    # corda de amarração do casco aos mourões
    for sx in (-1, 1):
        for (z, zz, yy) in ((1.8, 2.2, 1.95), (0.15, -0.3, 1.9)):
            a = Vector((sx * (BX + 0.14), DK + 0.45, z))
            b = Vector((sx * 0.98, yy, zz))
            beam(mb, tuple(a), tuple(b), 0.045, 0.045, 'rope')
    # escada de mão (toras e travessas) na parede esquerda da doca seca
    lx, lz = -(BX - 0.04), -0.75
    for dz in (-0.17, 0.17):
        log(mb, (lx + 0.34, BF, lz + dz), (lx - 0.02, DK + 0.38, lz + dz), 0.05, 'log', n=5)
    for k in range(7):
        t = (k + 0.5) / 7
        p = Vector((lx + 0.34, BF, lz)).lerp(Vector((lx - 0.02, DK + 0.38, lz)), t)
        mb.add(prim_box(0.05, 0.05, 0.38), 'wood_light', M(tuple(p)))
    # postes altos com crânio e braseiro-lanterna na frente
    for sx in (-1, 1):
        x = sx * 3.55
        log(mb, (x, DK + 0.5, 3.0), (x, DK + 1.95, 3.0), 0.07, 'log', n=6)
        beam(mb, (x, DK + 1.95, 3.0), (x - sx * 0.3, DK + 1.95, 3.0), 0.06, 0.06, 'iron')
        skull(mb, M((x - sx * 0.3, DK + 2.1, 3.0), (0, 0, 0)), 0.42, 'bone')
        mb.add(prim_cone(0.07, 0.3, 5), 'iron', M((x, DK + 1.95, 3.0)))
        mb.add(prim_cone(0.09, 0.22, 5), 'glow', M((x - sx * 0.3, DK + 1.9, 3.0)))
    return mb.build(mats, parent=root)


# ---------------------------------------------------------------------------
# Casco de pele e ossos em construção, cavaletes
# ---------------------------------------------------------------------------
HZ0, HZ1 = SY.HZ0, SY.HZ1
hull_params, hull_pt, zt = SY.hull_params, SY.hull_pt, SY.zt


def build_ship(mats, root):
    real = MeshBuilder('Ship')
    mb = SC.Xf(real, M((0, SYL, 0)))
    ts = sorted(set([h[0] for h in SY.HULL] + [0.03, 0.14, 0.36, 0.62, 0.81, 0.92]))
    nU = 17
    rings = []
    for t in ts:
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
            return 'wood_dark'
        f = (y - SYL - kl) / max(dk - kl, 0.05)
        # a popa (t < 0.38) ainda sem pele: só tábuas/costelas
        return 'hull_hide_dark' if f < 0.3 else 'hull_hide'

    mb.add(prim_rings(rings), 'hull_hide', smooth=38, mat_fn=hull_mat)
    # quilha de tora, roda de proa de osso e cadaste
    kp = [(0, hull_params(t)[1] - 0.02, zt(t)) for t in (0.0, 0.08, 0.3, 0.5, 0.7, 0.88, 0.96)]
    tube(mb, kp, [(0.09, 0.11)] * len(kp), 'log', n=6, smooth=40)
    stem = bezier((0, 1.30, 3.12), (0, 1.9, 3.55), (0, 2.75, 3.15), 8)
    tube(mb, stem, [(0.1, 0.12), (0.095, 0.11), (0.09, 0.1), (0.085, 0.09), (0.075, 0.08), (0.065, 0.07), (0.05, 0.05), (0.035, 0.035), (0.014, 0.014)],
         'bone', n=6, smooth=40)
    skull(mb, M((0, 2.30, 3.42), (-12, 0, 0)), 0.38, 'bone')
    # amuradas (tubos de tora) com espinhos de osso e costelas à mostra
    for sx in (-1, 1):
        path = []
        for t in (0.02, 0.1, 0.22, 0.4, 0.58, 0.74, 0.86, 0.93):
            hw, kl, dk = hull_params(t)
            path.append((sx * (hw - 0.03), dk + 0.12, zt(t)))
        tube(mb, path, [(0.075, 0.09)] * len(path), 'log', n=5, smooth=0)
        for t in (0.1, 0.22, 0.34, 0.46, 0.58, 0.7, 0.82):
            hw, kl, dk = hull_params(t)
            mb.add(prim_cone(0.05, 0.38, 5), 'bone', M((sx * (hw + 0.02), dk + 0.1, zt(t)), (0, 0, -sx * 28)), smooth=30)
        # costelas do casco inacabado (popa/meio): arcos de osso acima da amurada
        for t in (0.12, 0.26, 0.4, 0.54):
            hw, kl, dk = hull_params(t)
            rib = bezier((sx * (hw - 0.02), dk + 0.1, zt(t)), (sx * (hw + 0.1), dk + 0.75, zt(t)), (sx * hw * 0.35, dk + 1.05, zt(t)), 6)
            tube(mb, rib, [0.05, 0.048, 0.045, 0.04, 0.034, 0.024, 0.012], 'bone', n=5, smooth=40)
    # viga de convés/cintas de ferro no costado e remendos de pele
    for sx in (-1, 1):
        for t in (0.3, 0.5, 0.7):
            px, py = hull_pt(t, 0.50 if sx < 0 else math.pi - 0.50)
            mb.add(prim_box(0.05, 0.3, 0.2), 'iron', M((px - sx * 0.0, py, zt(t)), (0, 0, -sx * 18)), bevel=0.0)
    # ré: painel de tábuas, totem de crânio em poste
    mb.add(prim_box(1.1, 0.5, 0.07), 'wood_dark', M((0, 1.25, HZ0 - 0.03)), bevel=0.01)
    log(mb, (0, 1.4, HZ0 + 0.1), (0, 2.6, HZ0 - 0.05), 0.07, 'log', n=6, tip=0.25)
    skull(mb, M((0, 2.55, HZ0 + 0.0), (0, 180, 0)), 0.34, 'bone')
    MZ = 0.25
    # carga: barris, tábuas de reserva, rolo de corda, caixote
    O.barrel_orc(mb, -0.35, 1.62, 1.2, r=0.22, h=0.5)
    O.barrel_orc(mb, 0.4, 1.62, 1.55, r=0.2, h=0.46)
    mb.add(prim_box(0.5, 0.3, 0.4, base=True), 'wood_light', M((0.35, 1.62, 0.7), (0, 18, 0)), bevel=0.02)
    N.rope_coil(mb, -0.3, 1.62, 0.55, R=0.18, r=0.045, turns=3, rot=10)
    for sx in (-1, 1):
        beam(mb, (sx * 0.78, 1.82, -0.9), (sx * 0.72, 1.82, 1.4), 0.08, 0.05, 'wood_light')
    return real.build(mats, parent=root)


def build_cradles(mats, root):
    mb = MeshBuilder('Cradles')
    for zc in (-1.15, 0.45, 1.95, 2.9):
        t = (zc - HZ0) / (HZ1 - HZ0)
        hw, kl, dk = hull_params(t)
        kl += SYL
        mb.add(prim_box(0.5, kl - BF - 0.02, 0.36, base=True), 'wood_dark', M((0, BF + 0.05, zc)), bevel=0.02)
        mb.add(prim_box(0.62, 0.08, 0.42), 'log', M((0, kl - 0.06, zc)), bevel=0.012)
        for sx in (-1, 1):
            px, py = hull_pt(t, 0.52 if sx < 0 else math.pi - 0.52)
            py += SYL
            log(mb, (sx * 1.42, BF + 0.05, zc), (px, py - 0.02, zc), 0.12, 'log', n=6)
            mb.add(prim_box(0.34, 0.12, 0.34, base=True), 'log', M((sx * 1.42, BF + 0.05, zc)), bevel=0.015)
            mb.add(prim_cyl(0.15, 0.15, 0.06, 6, base=False), 'iron', M(((sx * 1.42 + px) / 2, (BF + py) / 2, zc), (0, 0, -sx * 15)), smooth=0)
        beam(mb, (-1.3, BF + 0.45, zc), (1.3, BF + 0.45, zc), 0.12, 0.12, 'log', bevel=0.01)
        for sx in (-1, 1):
            mb.add(prim_box(0.17, 0.13, 0.17), 'iron', M((sx * 1.28, BF + 0.45, zc)), bevel=0.01)
    return mb.build(mats, parent=root)


# ---------------------------------------------------------------------------
# Portal de presas e viga de tora
# ---------------------------------------------------------------------------
GZ = -2.15    # z do portal (atrás da popa)


def build_gate(mats, root):
    mb = MeshBuilder('Gate')
    for sx in (-1, 1):
        # presa grande curva: sobe da base externa e se inclina para dentro
        tusk_big(mb, (sx * 1.85, DK - 0.1, GZ), (sx * 0.85, 3.7, GZ + 0.05), (sx * 0.55, 0.35, 0.0), r0=0.36, bands=(0.12, 0.38, 0.62))
        # base: toco de tora com cintas de ferro
        mb.add(prim_cyl(0.46, 0.5, 0.35, 8), 'log', M((sx * 1.85, DK - 0.05, GZ)), smooth=30)
        mb.add(prim_cyl(0.52, 0.52, 0.07, 8), 'iron', M((sx * 1.85, DK + 0.18, GZ)), smooth=0)
        mb.add(prim_cyl(0.52, 0.52, 0.07, 8), 'iron', M((sx * 1.85, DK + 0.02, GZ)), smooth=0)
        # presas menores de reforço
        tusk_big(mb, (sx * 2.4, DK - 0.05, GZ + 0.3), (sx * 1.9, 2.2, GZ + 0.3), (sx * 0.35, 0.15, 0.0), r0=0.2, bands=(0.3, 0.6))
    # viga de tora no alto com cintas de couro e ferro, pontas com anel de ferro e espinhos
    log(mb, (-2.5, 3.3, GZ - 0.02), (2.5, 3.3, GZ - 0.02), 0.24, 'log', n=8)
    for sx in (-1, 1):
        mb.add(prim_cyl(0.28, 0.28, 0.03, 8, base=False), 'log_end', Matrix.Translation((sx * 2.57, 3.3, GZ - 0.02)) @ orient((sx, 0, 0)))
    for x in (-1.9, -0.9, 0.95, 1.95):
        mb.add(prim_cyl(0.29, 0.29, 0.22, 8, base=False), 'leather', M((x, 3.3, GZ - 0.02), (0, 0, 90)), smooth=0)
    for x in (-2.35, 2.35):
        mb.add(prim_cyl(0.28, 0.28, 0.08, 8, base=False), 'iron', M((x, 3.3, GZ - 0.02), (0, 0, 90)), smooth=0)
        for a in (0, 90, 180, 270):
            spike(mb, x, 3.3, GZ - 0.02, h=0.3, r=0.05, tilt=(0, 0, 0)) if False else None
    # espinhos de ferro sobre a viga
    for x in (-2.0, -1.2, -0.4, 0.4, 1.2, 2.0):
        spike(mb, x, 3.56, GZ - 0.02, h=0.34, r=0.06, mat='iron')
    # crânio de lobo grande no centro, preso por corrente
    skull(mb, M((0, 2.86, GZ + 0.3), (0, 0, 0)), 0.5, 'bone')
    for sx in (-1, 1):
        beam(mb, (sx * 0.12, 3.05, GZ + 0.2), (sx * 0.1, 2.95, GZ + 0.25), 0.03, 0.03, 'iron')
    return mb.build(mats, parent=root)


# ---------------------------------------------------------------------------
# Torre de vigia de madeira com telhado de peles pontudo
# ---------------------------------------------------------------------------
TX, TZ = 2.8, -2.75
TK = 0.86


def build_tower(mats, root):
    real = MeshBuilder('Tower')
    mb = N.Sc(real, (TX, DK, TZ), TK)
    ph = DK + 2.35         # piso da plataforma
    # pernas de tora com sapata de rocha, travas em X, cintas de ferro
    for sx in (-1, 1):
        for sz in (-1, 1):
            x0, z0 = TX + sx * 0.86, TZ + sz * 0.86
            x1, z1 = TX + sx * 0.66, TZ + sz * 0.66
            mb.add(prim_box(0.5, 0.2, 0.5, base=True), 'rock', M((x0, DK, z0)), bevel=0.04)
            log(mb, (x0, DK + 0.1, z0), (x1, ph, z1), 0.13, 'bark', n=6)
            mb.add(prim_cyl(0.17, 0.17, 0.07, 6), 'iron', M((x0 * 0.9 + x1 * 0.1, DK + 0.5, z0 * 0.9 + z1 * 0.1)), smooth=0)
    for (yA, yB) in ((DK + 0.2, DK + 1.3), (DK + 1.3, ph - 0.1)):
        for flip in (-1, 1):
            for sz in (-1, 1):
                beam(mb, (TX - flip * 0.8, yA, TZ + sz * 0.84), (TX + flip * 0.7, yB, TZ + sz * 0.7), 0.1, 0.09, 'wood_light')
            for sx in (-1, 1):
                beam(mb, (TX + sx * 0.84, yA, TZ - flip * 0.8), (TX + sx * 0.7, yB, TZ + flip * 0.7), 0.1, 0.09, 'wood_light')
    # plataforma
    mb.add(prim_box(1.9, 0.14, 1.9), 'plank', M((TX, ph, TZ)), bevel=0.02)
    for sx in (-1, 1):
        log(mb, (TX + sx * 0.92, ph - 0.04, TZ - 0.95), (TX + sx * 0.92, ph - 0.04, TZ + 0.95), 0.07, 'log', n=5)
    # cabine: 4 postes, paredes de tábuas com seteira (costas e lados), frente aberta com parapeito
    cy0, ch = ph + 0.07, 1.25
    for sx in (-1, 1):
        for sz in (-1, 1):
            log(mb, (TX + sx * 0.78, cy0, TZ + sz * 0.78), (TX + sx * 0.78, cy0 + ch, TZ + sz * 0.78), 0.1, 'bark', n=5)
    mb.add(prim_box(1.6, 0.9, 0.08), 'plank', M((TX, cy0 + 0.04, TZ - 0.78)), bevel=0.01)
    for sx in (-1, 1):
        mb.add(prim_box(0.08, 0.9, 1.5), 'plank', M((TX + sx * 0.78, cy0 + 0.04, TZ)), bevel=0.01)
    mb.add(prim_box(1.5, 0.28, 0.08), 'plank', M((TX, cy0 + 0.04, TZ + 0.78)), bevel=0.01)
    # espinhos de osso/ferro nos postes e caveiras na parede frontal
    for sx in (-1, 1):
        for sz in (-1, 1):
            spike(mb, TX + sx * 0.84, cy0 + 0.9, TZ + sz * 0.84, h=0.5, r=0.06, tilt=(sz * 24, 0, -sx * 24), mat='iron')
    for sx in (-1, 1):
        skull(mb, M((TX + sx * 0.4, cy0 + 0.22, TZ + 0.86), (0, 0, 0)), 0.22, 'bone')
    # telhado de peles: pirâmide de 4 águas com costelas de osso, ponta de ferro, chifres nos cantos
    ry0 = cy0 + ch
    mb.add(prim_box(2.0, 0.12, 2.0), 'wood_dark', M((TX, ry0, TZ)), bevel=0.02)
    mb.add(prim_cone(1.5, 1.15, 4, phase=math.pi / 4), 'hull_hide', M((TX, ry0 + 0.06, TZ)), smooth=0)
    for k in range(4):
        a = math.radians(45 + 90 * k)
        cxo, czo = math.cos(a) * 1.04, math.sin(a) * 1.04
        beam(mb, (TX + cxo, ry0 + 0.08, TZ + czo), (TX, ry0 + 1.18, TZ), 0.11, 0.1, 'bone', bevel=0.01)
        spike(mb, TX + cxo * 1.0, ry0 + 0.1, TZ + czo * 1.0, h=0.55, r=0.075, tilt=(math.sin(a) * 38, 0, -math.cos(a) * 38))
        # tira de ferro no beiral
    for sgn, ax in ((1, 'x'), (-1, 'x')):
        pass
    mb.add(prim_cone(0.1, 0.5, 5), 'iron', M((TX, ry0 + 1.12, TZ)))
    # escada de tora até a plataforma (lado +x)
    lx = TX + 1.12
    for dz in (-0.2, 0.2):
        log(mb, (lx + 0.55, DK, TZ + dz), (lx - 0.06, ph, TZ + dz), 0.05, 'log', n=5)
    for k in range(9):
        t = (k + 0.5) / 9
        p = Vector((lx + 0.55, DK, TZ)).lerp(Vector((lx - 0.06, ph, TZ)), t)
        mb.add(prim_box(0.05, 0.05, 0.44), 'wood_light', M(tuple(p)))
    # poste do estandarte sobre o telhado
    top = ry0 + 1.5
    log(mb, (TX, top, TZ), (TX, top + 1.7, TZ), 0.06, 'log', n=5)
    mb.add(prim_cone(0.09, 0.45, 5), 'iron', M((TX, top + 1.7, TZ)))
    beam(mb, (TX - 0.62, top + 1.45, TZ), (TX + 0.62, top + 1.45, TZ), 0.07, 0.07, 'bone')
    for sx in (-1, 1):
        mb.add(prim_cone(0.045, 0.25, 5), 'iron', M((TX + sx * 0.62, top + 1.45, TZ), (0, 0, -sx * 90)))
    skull(mb, M((TX, top + 1.62, TZ + 0.02), (0, 0, 0)), 0.26, 'bone')
    return real.build(mats, parent=root)


def banner_wolf(mb, x, y, z, w=0.9, h=1.3):
    """Estandarte esfarrapado de time com caveira de lobo de osso (frente +z)."""
    O.tattered_banner(mb, x, y, z, 0.0, w, h, wave=0.05)
    sk = Matrix.Translation((x, y - h * 0.38, z + 0.06)) @ Matrix.Scale(1.0, 4)
    mb.add(prim_sphere(0.17, 0.15, 0.04, 7, 4), 'bone', sk, smooth=60)
    mb.add(prim_box(0.14, 0.12, 0.04, taper=(0.7, 1)), 'bone', sk @ M((0, -0.16, 0.005)), bevel=0.0)
    for sx in (-1, 1):
        mb.add(prim_sphere(0.045, 0.05, 0.03, 5, 3), 'dark', sk @ M((sx * 0.07, -0.01, 0.025)), smooth=60)
        mb.add(prim_cone(0.04, 0.16, 4), 'bone', sk @ M((sx * 0.14, 0.12, 0.0), (0, 0, -sx * 18)))
    mb.add(prim_box(0.04, 0.05, 0.03), 'dark', sk @ M((0, -0.1, 0.03)))


def build_banners(mats, root):
    real = MeshBuilder('Anim_Banners')
    mb = real
    tb = N.Sc(real, (TX, DK, TZ), TK)
    ry0 = DK + 2.35 + 0.07 + 1.25
    top = ry0 + 1.5
    banner_wolf(tb, TX, top + 1.42, TZ + 0.08, 1.0, 1.4)
    # faixas de time na viga do portal e galhardete nos postes frontais
    for k, x in enumerate((-1.5, 1.5)):
        O.tattered_banner(mb, x, 3.0, GZ + 0.32, 0.0, 0.5, 0.75, wave=0.04)
    for sx in (-1, 1):
        O.tattered_banner(mb, sx * 3.25, DK + 1.95, 3.05, 0.0, 0.34, 0.6, wave=0.04)
    # faixa de time sob o beiral do telhado da torre
    tb.add(prim_box(1.9, 0.14, 0.04), 'team', M((TX, ry0 - 0.45, TZ + 0.86)), bevel=0.01)
    return real.build(mats, parent=root)


# ---------------------------------------------------------------------------
# Guindastes de toras e ossos
# ---------------------------------------------------------------------------
CR_H = 2.0     # altura do pivô da lança acima do chão (não escalada)
K = 1.1
CZ = -0.7


def crane_static(mb, cx, cz, d):
    # tonel de base com aros de ferro e tábuas
    mb.add(prim_rings([ring_h(0, 0.5, 0.5, 10), ring_h(0.34, 0.6, 0.6, 10), ring_h(0.7, 0.5, 0.5, 10)]), 'plank', M((cx, DK, cz)), smooth=45)
    for yy in (0.1, 0.35, 0.6):
        r = 0.51 if yy != 0.35 else 0.62
        mb.add(prim_cyl(r, r, 0.06, 10), 'iron', M((cx, DK + yy, cz)), smooth=0)
    ty = DK + 0.7
    # duas toras do cavalete (A-frame) com amarras de couro e travessas
    for sx in (-1, 1):
        for sz in (-1, 1):
            log(mb, (cx + sx * 0.4, ty, cz + sz * 0.4), (cx + sx * 0.2, ty + 1.2, cz + sz * 0.2), 0.14, 'log', n=6)
    for yy, k in ((ty + 0.4, 0.33), (ty + 0.85, 0.26)):
        for sx in (-1, 1):
            beam(mb, (cx + sx * k, yy, cz - k), (cx + sx * k, yy, cz + k), 0.1, 0.09, 'log')
        for sz in (-1, 1):
            beam(mb, (cx - k, yy, cz + sz * k), (cx + k, yy, cz + sz * k), 0.1, 0.09, 'log')
        mb.add(prim_cyl(k * 1.55, k * 1.55, 0.07, 8, base=False), 'leather', M((cx, yy, cz)), smooth=0)
    # cabeça: bloco de tora com cintas de ferro, chifres de osso e roda de cabo traseira
    hy = ty + 1.2
    mb.add(prim_box(0.62, 0.5, 0.5, base=True), 'wood_dark', M((cx, hy, cz)), bevel=0.04)
    mb.add(prim_box(0.78, 0.1, 0.62), 'iron', M((cx, hy + 0.1, cz)), bevel=0.01)
    mb.add(prim_box(0.7, 0.1, 0.56), 'iron', M((cx, hy + 0.4, cz)), bevel=0.01)
    for sz in (-1, 1):
        mb.add(prim_cyl(0.22, 0.22, 0.09, 12, base=False), 'iron', M((cx, hy + 0.6, cz + sz * 0.3), (90, 0, 0)), smooth=30)
        N.rivets(mb, [(cx, hy + 0.6, cz + sz * 0.36)], 0.045, 'iron')
        tusk_big(mb, (cx + sz * 0.0 - d * 0.1, hy + 0.5, cz + sz * 0.3), (cx - d * 0.35, hy + 1.2, cz + sz * 0.38),
                 (-d * 0.12, 0.1, sz * 0.12), r0=0.07, bands=(0.3,), n=6, iron_band=False)
    wx, wy = cx - d * 0.62, hy + 0.55
    for sz in (-1, 1):
        mb.add(prim_cyl(0.36, 0.36, 0.06, 12, base=False), 'log', M((wx, wy, cz + sz * 0.16), (90, 0, 0)), smooth=30)
    mb.add(prim_cyl(0.32, 0.32, 0.26, 12, base=False), 'rope', M((wx, wy, cz), (90, 0, 0)), smooth=30)
    mb.add(prim_cyl(0.13, 0.13, 0.5, 8, base=False), 'iron', M((wx, wy, cz), (90, 0, 0)), smooth=30)
    # blocos de lastro (pedra) e caveira
    mb.add(prim_sphere(0.28, 0.2, 0.3, 7, 4, y_min=-0.2), 'rock_plain', M((cx - d * 0.2, DK, cz - 0.85), (0, 20, 0)), smooth=0)
    skull(mb, M((cx + d * 0.1, DK + 0.12, cz + 0.8), (0, d * 15, 0)), 0.28, 'bone')


def crane_anim(an, cx, cz, d, length=1.5, rise=1.0, hook_y=1.5):
    ty = DK + 0.7
    py = ty + 1.2 + 0.6          # eixo da cabeça (hy + 0.6)
    hub = Vector((cx, py, cz))
    tip = Vector((cx + d * length, py + rise, cz))
    base = Vector((cx - d * 0.25, py - 0.34, cz))
    # lança: tora afilada
    dv = (tip - base).normalized()
    tube(an, [tuple(base), tuple(base.lerp(tip, 0.5)), tuple(tip)], [0.2, 0.17, 0.13], 'log', n=7, smooth=40)
    for t in (0.2, 0.5, 0.78):
        p = base.lerp(tip, t)
        an.add(prim_cyl(0.22 - 0.07 * t, 0.22 - 0.07 * t, 0.12, 8, base=False), 'leather', Matrix.Translation(p) @ orient(dv), smooth=0)
        an.add(prim_cyl(0.23 - 0.07 * t, 0.23 - 0.07 * t, 0.04, 8, base=False), 'iron', Matrix.Translation(p + dv * 0.09) @ orient(dv), smooth=0)
    # osso na ponta (junta) e na traseira
    an.add(prim_sphere(0.16, 0.16, 0.16, 7, 4), 'bone', M(tuple(tip + dv * 0.04)), smooth=60)
    for sz in (-1, 1):
        an.add(prim_sphere(0.1, 0.1, 0.1, 6, 3), 'bone', M((tip.x, tip.y + 0.0, cz + sz * 0.17)), smooth=60)
    tb = base - dv * 0.1
    an.add(prim_sphere(0.15, 0.15, 0.15, 7, 4), 'bone', M(tuple(tb)), smooth=60)
    for sz in (-1, 1):
        an.add(prim_sphere(0.1, 0.1, 0.1, 6, 3), 'bone', M((tb.x, tb.y, cz + sz * 0.17)), smooth=60)
    # eixo da junta com chapas
    for sz in (-1, 1):
        an.add(prim_cyl(0.27, 0.27, 0.06, 10, base=False), 'iron', M((hub.x, hub.y - 0.15, cz + sz * 0.23), (90, 0, 0)), smooth=30)
        N.rivets(an, [(hub.x, hub.y - 0.15, cz + sz * 0.28)], 0.045, 'iron')
    # polia de ferro na ponta
    for sz in (-1, 1):
        an.add(prim_cyl(0.17, 0.17, 0.05, 10, base=False), 'iron', M((tip.x, tip.y - 0.14, cz + sz * 0.22), (90, 0, 0)), smooth=30)
    # corda em arco até a roda traseira
    wx, wy = cx - d * 0.62, DK + 0.7 + 1.2 + 0.55
    p0 = (tip.x - d * 0.05, tip.y + 0.16, cz)
    p2 = (wx, wy + 0.4, cz)
    mid = ((p0[0] + p2[0]) / 2, (p0[1] + p2[1]) / 2 - 0.3, cz)
    arc = bezier(p0, mid, p2, 7)
    tube(an, arc, [0.04] * len(arc), 'rope', n=5, smooth=50)
    # cabo vertical e gancho de ferro; polia dupla com crânio de peso
    hx = tip.x + d * 0.02
    tube(an, [(hx, tip.y - 0.16, cz), (hx, hook_y + 0.3, cz)], [0.05, 0.05], 'rope', n=5, smooth=50)
    an.add(N.torus_prim(0.1, 0.03, 10, 4), 'iron', M((hx, hook_y + 0.27, cz), (90, 0, 0)), smooth=50)
    hk = bezier((hx, hook_y + 0.2, cz), (hx, hook_y - 0.34, cz), (hx + d * 0.26, hook_y - 0.08, cz), 6)
    tube(an, hk, [0.055, 0.06, 0.065, 0.065, 0.055, 0.035, 0.012], 'iron', n=6, smooth=50)
    an.add(prim_box(0.14, 0.14, 0.14), 'iron', M((hx, hook_y + 0.12, cz)), bevel=0.015)
    # contrapeso de pedra e osso na traseira
    tube(an, [(tb.x, tb.y - 0.05, cz), (tb.x - d * 0.12, py - 0.9, cz)], [0.03, 0.03], 'rope', n=5, smooth=50)
    an.add(prim_sphere(0.2, 0.17, 0.2, 7, 4), 'rock_plain', M((tb.x - d * 0.12, py - 1.05, cz)), smooth=0)


def build_cranes(mats, root):
    st = MeshBuilder('Dock2')
    for cx, d in ((-2.75, +1), (2.75, -1)):
        crane_static(N.Sc(st, (cx, DK, CZ), K), cx, CZ, d)
    st_obj = st.build(mats, parent=root)
    out = [st_obj]
    for (name, cx, d, ln, rs, hy) in (('Anim_Crane', -2.75, +1, 1.5, 1.0, 1.5), ('Anim_Crane_2', 2.75, -1, 1.4, 1.12, 1.7)):
        mb = MeshBuilder(name)
        py = DK + (0.7 + 1.2 + 0.6) * K
        an = N.Sc(Piv(mb, (cx, py, CZ)), (cx, DK, CZ), K)
        crane_anim(an, cx, CZ, d, length=ln, rise=rs, hook_y=hy)
        out.append(mb.build(mats, parent=root, location=(cx, py, CZ)))
    return out


# ---------------------------------------------------------------------------
# Adereços
# ---------------------------------------------------------------------------
def log_pile(mb, x, y, z, rows=3, length=1.3, r=0.17, rot=0, band=True):
    """Pilha piramidal de toras horizontais (eixo z local), com extremidades de anel e cinta de couro."""
    T = M((x, y, z), (0, rot, 0))
    for k in range(rows):
        n_in = rows - k
        for i in range(n_in):
            lx = (i - (n_in - 1) / 2) * 2 * r * 0.98
            ly = r + k * 1.7 * r
            a, b = T @ Vector((lx, ly, -length / 2)), T @ Vector((lx, ly, length / 2))
            log(mb, tuple(a), tuple(b), r, 'log', n=7)
            for q, sg in ((b, 1), (a, -1)):
                mb.add(prim_cyl(r, r, 0.02, 7, base=False), 'log_end', Matrix.Translation(q + (b - a).normalized() * 0.012 * sg) @ orient((b - a) * sg))
    if band:
        w = rows * 2 * r * 0.98
        for zf in (-0.28, 0.28):
            mb.add(prim_box(w * 0.96, rows * 1.5 * r, 0.1, base=True), 'leather', T @ M((0, 0.1, zf * length)), bevel=0.02)
            mb.add(prim_box(w * 0.5, 0.07, 0.115), 'iron', T @ M((0, rows * 1.0 * r, zf * length)))


def hide_rack(mb, x, z, rot=0):
    """Couro esticado em armação de toras (quadro com cordas)."""
    T = M((x, DK, z), (0, rot, 0))
    for sx in (-1, 1):
        mb.add(prim_box(0.1, 1.5, 0.1, base=True), 'bark', T @ M((sx * 0.55, 0, 0)), bevel=0.01)
        spike_pt = T @ Vector((sx * 0.55, 1.5, 0))
        mb.add(prim_cone(0.07, 0.25, 5), 'bone', Matrix.Translation(spike_pt))
    beam(mb, tuple(T @ Vector((-0.55, 1.42, 0))), tuple(T @ Vector((0.55, 1.42, 0))), 0.1, 0.1, 'log')
    beam(mb, tuple(T @ Vector((-0.55, 0.28, 0))), tuple(T @ Vector((0.55, 0.28, 0))), 0.09, 0.09, 'log')
    mb.add(N.waved(prim_extrude([(-0.46, 0), (0.46, 0), (0.42, 1.0), (0.0, 1.06), (-0.44, 1.0)], 0.04, axis='z'), 0.03, 6.0, 4.0, 0.3),
           'hide', T @ M((0, 0.33, 0.0)), smooth=40)
    for sx in (-1, 1):
        for yy in (0.4, 0.8, 1.2):
            beam(mb, tuple(T @ Vector((sx * 0.46, yy, 0.0))), tuple(T @ Vector((sx * 0.56, yy + 0.04, 0.0))), 0.025, 0.025, 'rope')


def build_props(mats, root):
    mb = MeshBuilder('Props')
    # pilhas de toras (frente-direita, esquerda-fundo) e cavacos
    log_pile(mb, 3.0, DK, 2.6, rows=3, length=1.5, rot=-18)
    log_pile(mb, 3.2, DK, 0.55, rows=2, length=1.2, rot=10)
    log_pile(mb, -3.1, DK, -0.2, rows=3, length=1.5, rot=-6)
    for i in range(3):
        mb.add(prim_box(1.2, 0.1, 0.3, base=True), 'plank', M((-3.0, DK + 0.1 * i, -1.6), (0, 4 * (i % 2) - 2, 0)), bevel=0.01)
    # couro esticado em armações
    hide_rack(mb, -3.0, 1.6, rot=95)
    hide_rack(mb, 2.7, 1.4, rot=-80)
    # barris, tonéis e cordas
    O.barrel_orc(mb, 3.15, DK, -2.1, r=0.27, h=0.6)
    O.barrel_orc(mb, 2.55, DK, -2.55, r=0.24, h=0.56)
    O.barrel_orc(mb, -2.35, DK, 2.0, r=0.25, h=0.58)
    N.rope_coil(mb, -2.2, DK, 3.0, R=0.28, r=0.06, turns=4, rot=0)
    N.rope_coil(mb, 1.95, DK, 3.15, R=0.24, r=0.055, turns=3, rot=10)
    # bigorna/cepo de ferro com martelo e serra de osso
    mb.add(prim_box(0.34, 0.3, 0.34, base=True), 'log', M((2.45, DK, 0.2)), bevel=0.03)
    mb.add(prim_box(0.46, 0.14, 0.2, taper=(1.0, 0.7)), 'iron', M((2.45, DK + 0.3, 0.2), (0, 20, 0)), bevel=0.015)
    mb.add(prim_box(0.06, 0.04, 0.5), 'wood_light', M((2.3, DK + 0.02, 0.9), (0, 30, 0)))
    mb.add(prim_box(0.2, 0.12, 0.12), 'iron', M((2.18, DK + 0.1, 0.78), (0, 30, 0)))
    # braseiro de ferro
    O.brazier(mb, -2.45, DK, 0.7, s=0.8)
    # caveiras em estacas e ossos soltos
    for (x, z, h) in ((-3.6, 3.3, 1.2), (3.6, -3.3, 1.0), (-1.9, 3.5, 0.9)):
        log(mb, (x, DK, z), (x, DK + h, z), 0.05, 'bark', n=5, tip=0.2)
        skull(mb, M((x, DK + h + 0.18, z), (0, 0, 0)), 0.26, 'bone')
    mb.add(prim_cyl(0.05, 0.05, 0.6, 6, base=False), 'bone', M((-1.9, DK + 0.05, 2.3), (80, 30, 0)), smooth=0)
    # sacos de couro e corrente
    mb.add(prim_sphere(0.26, 0.3, 0.24, 7, 4, y_min=-0.3), 'leather', M((1.9, DK + 0.1, -0.3), (0, 20, 0)), smooth=60)
    mb.add(prim_sphere(0.22, 0.26, 0.22, 7, 4, y_min=-0.3), 'leather', M((2.3, DK + 0.1, -0.9), (0, -10, 0)), smooth=60)
    return mb.build(mats, parent=root)


def main():
    args = C.script_args()
    C.reset_scene()
    N.patch_small_bevels(0.025)
    mats = C.make_paint_set(PALETTE)
    root = C.make_empty('ShipDock')
    base = build_base(mats, root)
    dock = build_dock(mats, root)
    ship = build_ship(mats, root)
    cradles = build_cradles(mats, root)
    gate = build_gate(mats, root)
    tower = build_tower(mats, root)
    cranes = build_cranes(mats, root)
    props = build_props(mats, root)
    banners = build_banners(mats, root)
    static = [base, dock, ship, cradles, gate, tower, cranes[0], props]
    anim = cranes[1:]
    weights = {'Base': 0.7, 'Dock': 0.8, 'Ship': 1.3, 'Cradles': 0.6, 'Gate': 1.0, 'Tower': 1.1, 'Dock2': 0.9, 'Props': 1.0,
               'Anim_Banners': 0.8, 'Anim_Crane': 0.9, 'Anim_Crane_2': 0.9}
    finish_building(root, 'ship_dock', 'ship_dock.glb', 'ship_dock_atlas', static, banners, weights, TEAM_DEFAULT, args,
                    spawn=(0, 0, 4.6), rally=(0, 0, 6.6), extra_anim=anim, game_dist=82,
                    extra_views=[('ref', (-1.0, 0.95, 1.0)), ('ref2', (-0.2, 0.7, 1.0)), ('low', (0.8, 0.15, 1.0))])


if __name__ == '__main__':
    main()
