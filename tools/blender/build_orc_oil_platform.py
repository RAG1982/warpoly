"""
build_orc_oil_platform.py — Plataforma de Petróleo orc (tipo `orc_oil_platform`) gerada 100% por script (ART-naval-buildings).
Baseado na Plataforma humana (build_oil_platform.py). Referência: docs/refs/naval/orc_naval_buildings_ref.png (direita).

Uso:
  blender -b --factory-startup --python tools/blender/build_orc_oil_platform.py -- [--no-render]

Saída (public/models/orc_oil_platform.glb), coordenadas do jogo, y = 0 NO NÍVEL DA ÁGUA (os pilares descem até y = -1):
  OrcOilPlatform (raiz)
  ├─ Static_Mesh       pilares de toras sobre blocos de rocha, convés de tábuas com placas de ferro rebitadas, torre de
  │                    perfuração em treliça de madeira com chifres e braseiro, bomba cavalo-de-pau, barris com corrente,
  │                    mangueira preta, torre de vigia com caveira e espinhos, escada, correntes (Atlas)
  ├─ Anim_Banners      estandarte esfarrapado e faixa de time da torre de vigia (TeamColor)
  ├─ Anim_Smoke        fumaça preta e chama do braseiro (pivô no topo da torre)
  ├─ Anim_Crane        guindaste de tora com corrente e gancho (pivô no topo da coluna)
  ├─ Anim_Drill        haste de perfuração (pivô no centro do topo da torre; sobe/desce/gira)
  ├─ Socket_UnitSpawn  ponto de atracação (frente, +Z)
  └─ Socket_Rally      ponto de reunião padrão
Pegada ~5,0 x 5,0, altura ~8.
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
from naval_common import Piv  # noqa: E402

TEAM_DEFAULT = '#b81d24'
DK = 2.5            # topo do convés
HS = 2.35           # meia-largura do convés
PX = 1.8            # centro dos pilares
DX, DZ = -1.2, -1.2  # centro da torre de perfuração
HD = 3.3            # altura da torre acima do convés
B0, B1 = 0.9, 0.4
TX, TZ = 1.6, -1.5   # torre de vigia
TK = 1.0
CRX, CRZ = -1.9, 1.0  # guindaste
FLY = DK + HD + 0.5   # base do braseiro

PALETTE = dict(D.PALETTE)
PALETTE.update(O.ORC_EXTRAS)
PALETTE.update({
    'plank': dict(PALETTE['plank'], base='#8a6338', var='#634226', edge='#c29a68'),
    'plate': dict(base='#74503c', var='#4c2f22', var_scale=1.6, var_amt=1.0, fine=0.16, top=0.3, edge='#c8956f', edge_amt=0.6,
                  edge_r=0.03, edge_gain=6.0, ao=(0.5, 0.6), streaks=(2.0, 0.35, 0.35)),
    'plate_dark': dict(base='#4f3a30', var='#33241d', var_scale=1.6, var_amt=1.0, fine=0.14, top=0.3, edge='#9a7660', edge_amt=0.5,
                       edge_r=0.03, ao=(0.5, 0.6)),
    'rock': dict(D.ROCK, base='#9a9488', var='#6e695f', brick_tint='#b4ac9c', brick_tint_amt=0.7, brick_dark=0.85, mortar='#4a453d'),
    'ivory': dict(PALETTE['bone'], base='#e6dcb8', var='#c4b78e'),
    'hose': dict(base='#262629', var='#131316', var_scale=14.0, var_amt=0.8, fine=0.1, top=0.35, ao=(0.3, 0.5)),
    'smoke': dict(base='#1b1a1e', var='#0b0a0d', var_scale=2.5, var_amt=0.8, fine=0.08, top=0.4),
    'smoke_light': dict(base='#47464c', var='#2c2b30', var_scale=2.5, var_amt=0.8, fine=0.08, top=0.4),
    'oil': dict(base='#17151a', var='#0a090c', var_scale=3.0, top=0.5),
    'drum_red': dict(base='#8a3a28', var='#5a2418', var_scale=1.2, var_amt=1.0, fine=0.2, fine_scale=9.0, top=0.35,
                     edge='#d28a60', edge_amt=0.6, edge_r=0.03, ao=(0.5, 0.6)),
    'paint_yellow': dict(base='#e4b72a', var='#c0921a', var_scale=6.0, top=0.3),
})


def spike(mb, x, y, z, h=0.5, r=0.07, tilt=(0, 0, 0), mat='ivory'):
    mb.add(prim_cone(r, h, 5), mat, M((x, y, z), tilt), smooth=30)


def chain(mb, p0, p1, sag=0.3, r=0.03, n=8):
    p0, p1 = Vector(p0), Vector(p1)
    mid = (p0 + p1) / 2 + Vector((0, -sag, 0))
    pts = bezier(tuple(p0), tuple(mid), tuple(p1), n)
    tube(mb, pts, [r] * len(pts), 'iron', n=5, smooth=0)
    for i in range(1, n, 2):
        d = Vector(pts[i + 1]) - Vector(pts[i - 1])
        mb.add(prim_box(r * 3.2, r * 2.6, r * 3.2), 'iron', Matrix.Translation(pts[i]) @ orient(d), bevel=0.0)


def horn(mb, base, tip, bulge, r0=0.12, mat='ivory'):
    p0, p1 = Vector(base), Vector(tip)
    mid = (p0 + p1) / 2 + Vector(bulge)
    pts = bezier(tuple(p0), tuple(mid), tuple(p1), 8)
    tube(mb, pts, [max(0.02, r0 * (1.0 - 0.85 * (i / 8) ** 1.2)) for i in range(9)], mat, n=6, smooth=45)


# ---------------------------------------------------------------------------
# Pilares, blocos de rocha, convés com placas de ferro
# ---------------------------------------------------------------------------
def build_base(mats, root):
    mb = MeshBuilder('Base')
    for sx in (-1, 1):
        for sz in (-1, 1):
            x, z = sx * PX, sz * PX
            mb.add(prim_box(1.4, 1.75, 1.4, taper=(0.95, 0.95), base=True), 'rock', M((x, -1.05, z), (0, 17 * sx * sz, 0)), bevel=0.07)
            # pilar de tora (grosso) com cintas de ferro e pregos
            mb.add(prim_rings([ring_h(0.65, 0.4, 0.4, 8), ring_h(1.4, 0.37, 0.37, 8), ring_h(DK - 0.5, 0.4, 0.4, 8)]), 'bark', M((x, 0, z)), smooth=0)
            for yy in (0.8, 1.55, DK - 0.7):
                mb.add(prim_cyl(0.43, 0.43, 0.12, 8), 'plate_dark', M((x, yy, z)), smooth=0)
                N.rivets(mb, [(x + math.cos(a) * 0.43, yy + 0.06, z + math.sin(a) * 0.43) for a in (0.4, 1.9, 3.5, 5.0)], 0.035, 'iron')
    # vigas de tora entre os pilares + escoras
    for sgn in (-1, 1):
        log(mb, (-PX, 1.35, sgn * PX), (PX, 1.35, sgn * PX), 0.14, 'log', n=6)
        log(mb, (sgn * PX, 1.35, -PX), (sgn * PX, 1.35, PX), 0.14, 'log', n=6)
        for sx in (-1, 1):
            beam(mb, (sx * (PX - 0.34), 1.1, sgn * PX), (sx * (PX - 1.1), 1.8, sgn * PX), 0.15, 0.12, 'wood_light')
            beam(mb, (sgn * PX, 1.1, sx * (PX - 0.34)), (sgn * PX, 1.8, sx * (PX - 1.1)), 0.12, 0.15, 'wood_light')
    # estrado: vigas de tora sob o convés e laje de tábuas
    for k in range(7):
        x = -HS + 0.3 + k * (2 * HS - 0.6) / 6
        log(mb, (x, DK - 0.75, -HS + 0.1), (x, DK - 0.75, HS - 0.1), 0.1, 'log', n=5)
    mb.add(prim_box(2 * HS, 0.5, 2 * HS, base=True), 'plank', M((0, DK - 0.5, 0)), bevel=0.0,
           mat_fn=lambda c, n: 'plank' if n[1] > 0.6 else 'wood_dark')
    # fáscia de placas de ferro enferrujadas e rebitadas nas 4 faces (ref: chapas pesadas na borda do convés)
    for (nx, nz) in ((0, 1), (0, -1), (1, 0), (-1, 0)):
        T = M((nx * (HS + 0.03), DK - 0.27, nz * (HS + 0.03)), (0, 90 if nx else 0, 0))
        for k in range(3):
            wpl = 1.52
            xl = (k - 1) * (wpl + 0.03)
            mb.add(prim_box(wpl, 0.62, 0.1), 'plate' if (k + nx + nz) % 2 == 0 else 'plate_dark', T @ M((xl, 0, 0)), bevel=0.0)
            N.rivets(mb, [tuple((T @ Vector((xl + a * (wpl / 2 - 0.12), b * 0.22, 0.065)))) for a in (-1, 0, 1) for b in (-1, 1)], 0.032, 'iron')
    # chapas soltas no convés e pregos nas bordas, espinhos de osso nos cantos
    for (x, z, w, d, rot) in ((-0.1, 2.05, 0.5, 0.22, 20), (1.8, 1.05, 0.4, 0.2, -30), (0.9, 0.3, 0.3, 0.16, 80)):
        mb.add(prim_box(w, 0.025, d), 'plate', M((x, DK + 0.012, z), (0, rot, 0)), bevel=0.0)
    for sx in (-1, 1):
        for sz in (-1, 1):
            cx, cz = sx * (HS - 0.15), sz * (HS - 0.15)
            mb.add(prim_box(0.46, 0.05, 0.46), 'plate_dark', M((cx, DK + 0.01, cz)), bevel=0.0)
            spike(mb, cx, DK + 0.04, cz, h=0.6, r=0.13, tilt=(sz * 14, 0, -sx * 14))
    # correntes pesadas penduradas entre os pilares
    for sgn in (-1, 1):
        chain(mb, (-PX, 1.05, sgn * (PX + 0.42)), (PX, 1.05, sgn * (PX + 0.42)), 0.45, 0.035, 10)
        chain(mb, (sgn * (PX + 0.42), 1.05, -PX), (sgn * (PX + 0.42), 1.05, PX), 0.45, 0.035, 10)
    return mb.build(mats, parent=root)


# ---------------------------------------------------------------------------
# Torre de perfuração em treliça de madeira
# ---------------------------------------------------------------------------
def bh(h):
    return B0 + (B1 - B0) * h / HD


def build_derrick(mats, root):
    mb = MeshBuilder('Derrick')
    for sx in (-1, 1):
        for sz in (-1, 1):
            mb.add(prim_box(0.5, 0.12, 0.5, base=True), 'plate_dark', M((DX + sx * B0, DK, DZ + sz * B0)), bevel=0.0)
            log(mb, (DX + sx * B0, DK + 0.05, DZ + sz * B0), (DX + sx * B1, DK + HD, DZ + sz * B1), 0.15, 'bark', n=6)
            N.rivets(mb, [(DX + sx * B0 + a * 0.17, DK + 0.13, DZ + sz * B0 + b * 0.17) for a in (-1, 1) for b in (-1, 1)], 0.03, 'iron')
    # anéis (cintas de ferro) e travessas horizontais de tora
    for h in (0.6, 1.65, 2.7):
        b = bh(h)
        for sgn in (-1, 1):
            beam(mb, (DX - b, DK + h, DZ + sgn * b), (DX + b, DK + h, DZ + sgn * b), 0.12, 0.12, 'wood_dark')
            beam(mb, (DX + sgn * b, DK + h, DZ - b), (DX + sgn * b, DK + h, DZ + b), 0.12, 0.12, 'wood_dark')
        for sx in (-1, 1):
            for sz in (-1, 1):
                mb.add(prim_box(0.26, 0.14, 0.26), 'plate_dark', M((DX + sx * b, DK + h, DZ + sz * b)), bevel=0.0)
    # diagonais em X (madeira clara) em cada face e tramo
    ys = (0.05, 0.6, 1.65, 2.7, HD)
    for (h0, h1) in zip(ys[:-1], ys[1:]):
        for (ax, sgn) in ((0, 1), (0, -1), (1, 1), (1, -1)):
            b0, b1 = bh(h0), bh(h1)
            for flip in (-1, 1):
                if ax == 0:
                    pa = (DX - flip * b0, DK + h0, DZ + sgn * b0)
                    pb = (DX + flip * b1, DK + h1, DZ + sgn * b1)
                else:
                    pa = (DX + sgn * b0, DK + h0, DZ - flip * b0)
                    pb = (DX + sgn * b1, DK + h1, DZ + flip * b1)
                beam(mb, pa, pb, 0.1, 0.09, 'wood_light', bevel=0.0)
    # quadro do topo com plataforma, 2 chifres curvos grandes nos lados e braseiro (chama animada em Anim_Smoke)
    ty = DK + HD
    fw = 1.0
    for sgn in (-1, 1):
        mb.add(prim_box(fw + 0.2, 0.2, 0.2), 'bark', M((DX, ty + 0.1, DZ + sgn * 0.45)), bevel=0.02)
        mb.add(prim_box(0.2, 0.2, fw), 'bark', M((DX + sgn * 0.45, ty + 0.1, DZ)), bevel=0.02)
    mb.add(prim_cyl(0.52, 0.42, 0.18, 8), 'plate_dark', M((DX, ty + 0.2, DZ)), smooth=0)
    for k in range(8):
        a = math.pi * 2 * k / 8
        spike(mb, DX + math.cos(a) * 0.5, ty + 0.34, DZ + math.sin(a) * 0.5, h=0.2, r=0.04, mat='iron')
    for sx in (-1, 1):
        horn(mb, (DX + sx * 0.5, ty + 0.2, DZ), (DX + sx * 0.5, ty + 1.3, DZ), (sx * 0.55, 0.05, 0.0), r0=0.17)
        for sz in (-1, 1):
            spike(mb, DX + sx * (B1 + 0.05), ty - 0.35, DZ + sz * (B1 + 0.05), h=0.4, r=0.06, tilt=(sz * 20, 0, -sx * 20))
    mb.add(prim_cyl(0.36, 0.24, 0.16, 8, base=True), 'plate_dark', M((DX, ty + 0.36, DZ)), smooth=0)
    mb.add(prim_cyl(0.26, 0.26, 0.04, 8, base=True), 'coal', M((DX, ty + 0.52, DZ)), smooth=0)
    # roda dentada de ferro e polia (lado +x) com corda do alto
    gy = DK + 2.4
    gx = DX + bh(2.4) + 0.2
    N.gear(mb, M((gx, gy, DZ + 0.28), (0, 90, 0)), 0.3, 9, 0.1, body='plate_dark', hub='iron', spokes=3)
    mb.add(prim_cyl(0.26, 0.26, 0.1, 12, base=False), 'log', M((gx - 0.02, gy + 0.08, DZ - 0.3), (0, 0, 90)), smooth=30)
    rope = bezier((DX + 0.2, ty + 0.3, DZ + 0.2), (DX + 0.55, ty - 0.3, DZ + 0.0), (gx - 0.02, gy + 0.34, DZ - 0.3), 7)
    tube(mb, rope, [0.045] * len(rope), 'rope', n=5, smooth=50)
    # escada de tora encostada na perna da frente (lado +x)
    for dxl in (-0.12, 0.12):
        log(mb, (DX + dxl + 0.5, DK, DZ + B0 + 0.4), (DX + dxl + 0.25, DK + 2.0, DZ + bh(2.0) + 0.2), 0.04, 'log', n=5)
    for k in range(7):
        t = (k + 0.5) / 7
        p = Vector((DX + 0.5, DK, DZ + B0 + 0.4)).lerp(Vector((DX + 0.25, DK + 2.0, DZ + bh(2.0) + 0.2)), t)
        mb.add(prim_box(0.34, 0.04, 0.05), 'wood_light', M(tuple(p)))
    return mb.build(mats, parent=root)


def build_drill(mats, root):
    mb = MeshBuilder('Anim_Drill')
    pv = (DX, DK + HD, DZ)
    an = Piv(mb, pv)
    top = DK + HD + 0.5
    tube(an, [(DX, DK + 0.6, DZ), (DX, DK + HD + 0.2, DZ), (DX, top, DZ)], [0.2, 0.2, 0.2], 'log_light', n=8, smooth=45)
    an.add(prim_cyl(0.17, 0.17, 0.02, 8, base=True), 'log_end', M((DX, top, DZ)))
    for y in (DK + HD - 0.2, DK + HD + 0.25, DK + 1.3):
        an.add(prim_cyl(0.26, 0.26, 0.1, 8), 'plate_dark', M((DX, y, DZ)))
    N.rope_coil(an, DX, DK + HD + 0.3, DZ, R=0.22, r=0.04, turns=2, rot=0)
    return mb.build(mats, parent=root, location=pv)


def build_smoke(mats, root):
    mb = MeshBuilder('Anim_Smoke')
    py = FLY + 0.06
    pv = (DX, py, DZ)
    an = Piv(mb, pv)
    # chama (laranja/brasa) e fumaça preta subindo e inclinando para +x
    an.add(prim_cone(0.32, 0.75, 7), 'glow', M((DX, py, DZ)), smooth=40)
    an.add(prim_cone(0.15, 0.5, 6), 'ember', M((DX + 0.05, py + 0.06, DZ + 0.04), (0, 0, -8)), smooth=40)
    an.add(prim_cone(0.1, 0.4, 5), 'glow', M((DX - 0.1, py + 0.02, DZ - 0.05), (0, 0, 8)), smooth=40)
    puffs = [(0.0, 0.62, 0.22), (0.06, 0.95, 0.3), (0.18, 1.3, 0.36), (0.36, 1.62, 0.4), (0.58, 1.9, 0.38),
             (0.82, 2.12, 0.3), (1.02, 2.3, 0.22)]
    for k, (dx, dy, r) in enumerate(puffs):
        mat = 'smoke' if k < 5 else 'smoke_light'
        an.add(prim_sphere(r, r * 0.92, r, 8, 5), mat, M((DX + dx, py + dy, DZ + 0.04 * ((k % 2) * 2 - 1)), (0, 17 * k, 0)), smooth=70)
        if 1 <= k <= 4:
            an.add(prim_sphere(r * 0.7, r * 0.65, r * 0.7, 7, 4), mat, M((DX + dx + 0.18, py + dy - 0.07, DZ + 0.14 - 0.12 * (k % 3))), smooth=70)
    return mb.build(mats, parent=root, location=pv)


# ---------------------------------------------------------------------------
# Bomba cavalo-de-pau, barris, mangueira
# ---------------------------------------------------------------------------
PJX, PJZ = 0.1, 0.55    # bomba


def build_pump(mats, root):
    mb = MeshBuilder('Pump')
    x, z = PJX, PJZ
    # skid de toras e base de ferro
    for dz in (-0.3, 0.3):
        beam(mb, (x - 0.9, DK + 0.06, z + dz), (x + 0.9, DK + 0.06, z + dz), 0.18, 0.12, 'log', bevel=0.01)
    mb.add(prim_box(1.2, 0.1, 0.8, base=True), 'plate_dark', M((x, DK + 0.12, z)), bevel=0.0)
    # cavalete em A (2 pares de pernas de tora) e eixo
    py = DK + 1.25
    for dz in (-0.28, 0.28):
        beam(mb, (x - 0.35, DK + 0.2, z + dz), (x, py, z + dz * 0.8), 0.13, 0.1, 'wood_dark')
        beam(mb, (x + 0.35, DK + 0.2, z + dz), (x, py, z + dz * 0.8), 0.13, 0.1, 'wood_dark')
    mb.add(prim_cyl(0.1, 0.1, 0.8, 8, base=False), 'iron', M((x, py, z), (90, 0, 0)), smooth=30)
    # engrenagem + manivela + biela
    N.gear(mb, M((x + 0.65, DK + 0.55, z - 0.45), (0, 0, 0)), 0.3, 10, 0.1, body='plate_dark', hub='iron', spokes=3)
    N.gear(mb, M((x + 0.65, DK + 0.55, z + 0.4), (0, 180, 0)), 0.26, 9, 0.08, body='plate', hub='iron', spokes=3)
    mb.add(prim_cyl(0.07, 0.07, 0.95, 8, base=False), 'iron', M((x + 0.65, DK + 0.55, z), (90, 0, 0)), smooth=30)
    # contra-peso curvo e viga (walking beam) com cabeça de cavalo (curva de ferro + presa)
    beam_pts_L = (x - 0.95, py + 0.0, z)
    beam_pts_R = (x + 1.0, py + 0.12, z)
    return mb.build(mats, parent=root)


def build_pump_beam(mats, root):
    """A viga basculante (walking beam) é estática: o jogo anima o resto pelo Anim_Drill."""
    mb = MeshBuilder('PumpBeam')
    x, z = PJX, PJZ
    py = DK + 1.25
    for dz in (-0.22, 0.22):
        # viga em arco com cabeça (esquerda, maior) e contrapeso (direita)
        pts = [(x - 0.95, py - 0.25, z + dz), (x - 0.5, py + 0.12, z + dz), (x, py + 0.1, z + dz), (x + 0.6, py + 0.05, z + dz),
               (x + 1.05, py + 0.1, z + dz)]
        tube(mb, pts, [(0.09, 0.14)] * len(pts), 'plate', n=4, smooth=0)
    # cabeça de cavalo: arco de ferro grande descendo na ponta esquerda
    hd = bezier((x - 0.5, py + 0.45, z), (x - 1.15, py + 0.45, z), (x - 1.15, py - 0.45, z), 8)
    for dz in (-0.22, 0.22):
        tube(mb, [(p[0], p[1], p[2] + dz) for p in hd], [(0.07, 0.1)] * len(hd), 'plate', n=4, smooth=0)
    mb.add(prim_box(0.2, 0.35, 0.58), 'plate_dark', M((x - 1.12, py - 0.4, z), (0, 0, 10)), bevel=0.01)
    # chifre de osso na cabeça e crânio
    spike(mb, x - 1.14, py + 0.0, z, h=0.45, r=0.07, tilt=(0, 0, 70))
    # contrapeso (disco de ferro enferrujado)
    for dz in (-0.3, 0.3):
        mb.add(prim_cyl(0.42, 0.42, 0.08, 12, base=False), 'plate', M((x + 1.05, py + 0.05, z + dz), (90, 0, 0)), smooth=30)
    # biela e cabo para o poço
    tube(mb, [(x - 1.12, py - 0.7, z), (x - 1.12, DK + 0.1, z)], [0.04, 0.04], 'rope', n=5, smooth=50)
    beam(mb, (x + 1.05, py, z), (x + 0.65, DK + 0.55, z), 0.07, 0.07, 'iron')
    return mb.build(mats, parent=root)


def build_drums(mats, root):
    mb = MeshBuilder('Drums')
    # barris de óleo (aros de ferro) agrupados com corrente em volta
    ps = [(1.2, 1.2), (1.65, 1.0), (1.55, 1.55), (1.05, 0.7)]
    for (x, z) in ps:
        mb.add(prim_rings([ring_h(0, 0.24, 0.24, 10), ring_h(0.3, 0.26, 0.26, 10), ring_h(0.62, 0.24, 0.24, 10)]), 'drum_red', M((x, DK, z)), smooth=45)
        for yy in (0.04, 0.3, 0.56):
            mb.add(prim_cyl(0.265 if yy == 0.3 else 0.25, 0.265 if yy == 0.3 else 0.25, 0.04, 10), 'plate_dark', M((x, DK + yy, z)), smooth=0)
        mb.add(prim_cyl(0.1, 0.1, 0.03, 8), 'paint_yellow', M((x, DK + 0.63, z)), smooth=0)
    chain(mb, (1.2, DK + 0.45, 1.2), (1.65, DK + 0.45, 1.0), 0.06, 0.025, 6)
    chain(mb, (1.65, DK + 0.45, 1.0), (1.55, DK + 0.45, 1.55), 0.06, 0.025, 6)
    # barris empilhados de lado e barril solitário atrás
    for (x, z) in ((-0.55, -2.0), (-0.2, -2.05)):
        O.barrel_orc(mb, x, DK, z, r=0.25, h=0.58)
    # mangueira preta: do barril da frente, por cima da borda do convés, até mergulhar na água
    hose = [(1.05, DK + 0.15, 0.7), (0.4, DK + 0.14, 1.25), (-0.4, DK + 0.14, 1.6), (-1.0, DK + 0.14, 2.0), (-1.0, DK + 0.18, HS + 0.05),
            (-1.02, DK - 0.5, HS + 0.4), (-1.0, 0.4, HS + 0.5), (-1.0, -0.4, HS + 0.55)]
    hp = N.rounded_path(hose, 0.4, 4)
    tube(mb, hp, [0.09] * len(hp), 'hose', n=8, smooth=50)
    for i in range(0, len(hp) - 1, 3):
        mb.add(prim_cyl(0.105, 0.105, 0.03, 8, base=False), 'plate_dark', M(hp[i], (0, 0, 0)), smooth=30)
    # válvula de ferro/volante
    mb.add(prim_cyl(0.07, 0.07, 0.4, 8), 'iron', M((1.05, DK + 0.1, 0.7)), smooth=0)
    mb.add(N.torus_prim(0.14, 0.03, 12, 4), 'iron', M((1.05, DK + 0.55, 0.7)), smooth=60)
    return mb.build(mats, parent=root)


# ---------------------------------------------------------------------------
# Torre de vigia com caveira e espinhos
# ---------------------------------------------------------------------------
def build_tower(mats, root):
    real = MeshBuilder('Tower')
    mb = N.Sc(real, (TX, DK, TZ), TK)
    ph = DK + 1.35
    for sx in (-1, 1):
        for sz in (-1, 1):
            x, z = TX + sx * 0.55, TZ + sz * 0.55
            mb.add(prim_box(0.3, 0.1, 0.3, base=True), 'plate_dark', M((x, DK, z)), bevel=0.0)
            log(mb, (x, DK + 0.05, z), (x, ph, z), 0.1, 'bark', n=6)
    # travessas e X
    for flip in (-1, 1):
        for sz in (-1, 1):
            beam(mb, (TX - flip * 0.55, DK + 0.2, TZ + sz * 0.55), (TX + flip * 0.55, ph - 0.1, TZ + sz * 0.55), 0.08, 0.07, 'wood_light')
        for sx in (-1, 1):
            beam(mb, (TX + sx * 0.55, DK + 0.2, TZ - flip * 0.55), (TX + sx * 0.55, ph - 0.1, TZ + flip * 0.55), 0.08, 0.07, 'wood_light')
    mb.add(prim_box(1.45, 0.12, 1.45), 'plank', M((TX, ph, TZ)), bevel=0.015)
    # parapeito de tábuas com caveiras (frente +z e lados), parede traseira alta com travessa de crânio e espinhos
    mb.add(prim_box(1.4, 0.5, 0.08), 'plank', M((TX, ph + 0.06, TZ + 0.68)), bevel=0.01)
    for sx in (-1, 1):
        mb.add(prim_box(0.08, 0.5, 1.4), 'plank', M((TX + sx * 0.68, ph + 0.06, TZ)), bevel=0.01)
        skull(mb, M((TX + sx * 0.74, ph + 0.35, TZ + 0.1), (0, sx * 90, 0)), 0.2, 'bone')
    skull(mb, M((TX, ph + 0.36, TZ + 0.74), (0, 0, 0)), 0.2, 'bone')
    for sx in (-1, 1):
        for sz in (-1, 1):
            spike(mb, TX + sx * 0.68, ph + 0.55, TZ + sz * 0.68, h=0.5, r=0.06, tilt=(sz * 12, 0, -sx * 12), mat='ivory')
    for sx in (-1, 1):
        log(mb, (TX + sx * 0.62, ph + 0.06, TZ - 0.66), (TX + sx * 0.62, ph + 1.55, TZ - 0.66), 0.09, 'bark', n=5)
        mb.add(prim_cone(0.1, 0.3, 5), 'iron', M((TX + sx * 0.62, ph + 1.55, TZ - 0.66)))
    mb.add(prim_box(1.6, 0.4, 0.1), 'plank', M((TX, ph + 1.1, TZ - 0.66)), bevel=0.01)
    mb.add(prim_box(1.7, 0.08, 0.14), 'log', M((TX, ph + 1.34, TZ - 0.66)), bevel=0.01)
    mb.add(prim_box(1.7, 0.08, 0.14), 'log', M((TX, ph + 0.86, TZ - 0.66)), bevel=0.01)
    skull(mb, M((TX, ph + 1.52, TZ - 0.58), (0, 0, 0)), 0.34, 'bone')
    for k in (-0.5, 0.5):
        spike(mb, TX + k * 1.4, ph + 1.34, TZ - 0.66, h=0.38, r=0.05, mat='iron')
    for k in (-0.25, 0.25):
        spike(mb, TX + k * 1.4, ph + 1.38, TZ - 0.66, h=0.3, r=0.05, mat='ivory')
    # escada de tora (lado +x)
    for dz in (-0.18, 0.18):
        log(mb, (TX + 0.95, DK, TZ + dz + 0.1), (TX + 0.72, ph + 0.15, TZ + dz + 0.1), 0.04, 'log', n=5)
    for k in range(8):
        t = (k + 0.5) / 8
        p = Vector((TX + 0.95, DK, TZ + 0.1)).lerp(Vector((TX + 0.72, ph + 0.15, TZ + 0.1)), t)
        mb.add(prim_box(0.05, 0.05, 0.4), 'wood_light', M(tuple(p)))
    return real.build(mats, parent=root)


def build_banners(mats, root):
    real = MeshBuilder('Anim_Banners')
    mb = N.Sc(real, (TX, DK, TZ), TK)
    ph = DK + 1.35
    # estandarte esfarrapado preso ao poste traseiro direito + faixa da barra
    O.tattered_banner(mb, TX + 0.62, ph + 1.45, TZ - 0.56, 0.0, 0.62, 1.0, wave=0.05)
    mb.add(prim_box(1.4, 0.12, 0.04), 'team', M((TX, ph + 0.5, TZ + 0.73)), bevel=0.01)
    # faixa de time no tanque de óleo: pano amarrado
    mb.add(prim_box(0.54, 0.1, 0.54), 'team', M((TX - 3.0, 0, 0))) if False else None
    O.tattered_banner(real, 1.65, DK + 0.7, 1.2, 0.0, 0.0001, 0.0001) if False else None
    return real.build(mats, parent=root)


# ---------------------------------------------------------------------------
# Guindaste de bordo de tora e osso
# ---------------------------------------------------------------------------
def build_crane(mats, root):
    mb = MeshBuilder('Crane')
    mb.add(prim_rings([ring_h(0, 0.38, 0.38, 8), ring_h(0.3, 0.44, 0.44, 8), ring_h(0.58, 0.36, 0.36, 8)]), 'plank', M((CRX, DK, CRZ)), smooth=45)
    for yy in (0.06, 0.3, 0.52):
        mb.add(prim_cyl(0.43, 0.43, 0.05, 8), 'iron', M((CRX, DK + yy, CRZ)), smooth=0)
    mb.add(prim_box(0.5, 0.45, 0.5, base=True), 'bark', M((CRX, DK + 0.58, CRZ)), bevel=0.03)
    mb.add(prim_box(0.6, 0.08, 0.6), 'plate_dark', M((CRX, DK + 0.62, CRZ)), bevel=0.0)
    for sx in (-1, 1):
        for sz in (-1, 1):
            beam(mb, (CRX + sx * 0.22, DK + 0.58, CRZ + sz * 0.22), (CRX + sx * 0.12, DK + 0.98, CRZ + sz * 0.12), 0.08, 0.08, 'log')
    # cabrestante de ferro + corrente enrolada no piso
    N.gear(mb, M((CRX + 0.52, DK + 0.7, CRZ + 0.1), (0, 90, 0)), 0.27, 9, 0.09, body='plate_dark', hub='iron', spokes=3)
    mb.add(prim_cyl(0.09, 0.09, 0.4, 8, base=False), 'iron', M((CRX + 0.42, DK + 0.7, CRZ + 0.1), (0, 0, 90)), smooth=30)
    skull(mb, M((CRX + 0.15, DK + 0.12, CRZ + 0.6), (0, 30, 0)), 0.22, 'bone')
    return mb.build(mats, parent=root)


def build_crane_boom(mats, root):
    mb = MeshBuilder('Anim_Crane')
    py = DK + 1.0
    pv = (CRX, py, CRZ)
    an = Piv(mb, pv)
    tip = Vector((CRX, py + 1.1, CRZ + 1.0))
    base = Vector((CRX, py - 0.12, CRZ - 0.2))
    an.add(prim_box(0.46, 0.34, 0.46), 'log', M((CRX, py - 0.02, CRZ)), bevel=0.03)
    an.add(prim_box(0.54, 0.08, 0.54), 'plate_dark', M((CRX, py + 0.17, CRZ)), bevel=0.0)
    tube(an, [tuple(base), tuple(base.lerp(tip, 0.5)), tuple(tip)], [(0.13, 0.13), (0.11, 0.11), (0.085, 0.085)], 'log', n=6, smooth=40)
    dv = (tip - base).normalized()
    for t in (0.2, 0.55, 0.85):
        p = base.lerp(tip, t)
        an.add(prim_cyl(0.15 - 0.05 * t, 0.15 - 0.05 * t, 0.09, 7, base=False), 'leather', Matrix.Translation(p) @ orient(dv), smooth=0)
    an.add(prim_sphere(0.12, 0.12, 0.12, 6, 4), 'bone', M(tuple(tip + dv * 0.02)), smooth=60)
    an.add(prim_cyl(0.11, 0.11, 0.24, 8, base=False), 'iron', M(tuple(tip + Vector((0, -0.06, 0.1))), (0, 0, 90)), smooth=30)
    # corrente do gancho e gancho de ferro
    hz = tip.z + 0.1
    chain(an, (CRX, tip.y - 0.12, hz), (CRX, DK + 0.62, hz), 0.0, 0.03, 8) if False else None
    tube(an, [(CRX, tip.y - 0.12, hz), (CRX, DK + 0.62, hz)], [0.03, 0.03], 'iron', n=5, smooth=0)
    for k in range(6):
        yy = tip.y - 0.22 - k * (tip.y - DK - 0.9) / 6
        an.add(prim_box(0.1, 0.12, 0.05), 'iron', M((CRX, yy, hz), (0, 90 * (k % 2), 0)))
    an.add(N.torus_prim(0.09, 0.025, 10, 4), 'iron', M((CRX, DK + 0.6, hz), (0, 0, 90)), smooth=50)
    hk = bezier((CRX, DK + 0.52, hz), (CRX, DK + 0.1, hz), (CRX, DK + 0.18, hz + 0.24), 6)
    tube(an, hk, [0.05, 0.055, 0.06, 0.06, 0.05, 0.03, 0.012], 'iron', n=6, smooth=50)
    # cabo traseiro com pedra de contrapeso
    tube(an, [(CRX, tip.y - 0.05, tip.z - 0.08), (CRX, py + 0.3, CRZ - 0.4), (CRX, py - 0.05, CRZ - 0.4)], [0.025] * 3, 'rope', n=5, smooth=50)
    an.add(prim_sphere(0.14, 0.12, 0.14, 6, 4), 'rock_plain', M((CRX, py - 0.15, CRZ - 0.4)), smooth=0)
    return mb.build(mats, parent=root, location=pv)


# ---------------------------------------------------------------------------
def build_props(mats, root):
    mb = MeshBuilder('Props')
    # pilha de toras e couro (tira de pele secando) e caveiras em estacas, ossos soltos, corda
    for k in range(3):
        log(mb, (-0.9 + k * 0.28, DK + 0.16, -2.1), (-0.9 + k * 0.28, DK + 0.16, -1.65), 0.14, 'log', n=6) if False else None
    N.rope_coil(mb, 1.95, DK, 0.2, R=0.22, r=0.05, turns=3, rot=15)
    for sx in (-1, 1):
        x, z = sx * 2.1, 2.1
        log(mb, (x, DK, z), (x, DK + 1.0, z), 0.05, 'bark', n=5, tip=0.22)
        skull(mb, M((x, DK + 1.2, z), (0, sx * 30, 0)), 0.24, 'bone')
        mb.add(prim_cyl(0.11, 0.09, 0.28, 8, base=True), 'iron', M((sx * 1.2, DK, 2.1)))
        mb.add(prim_box(0.38, 0.08, 0.16), 'iron', M((sx * 1.2, DK + 0.28, 2.1)), bevel=0.0)
    # tábua de ferro com tocos para cortar
    mb.add(prim_cyl(0.18, 0.18, 0.3, 8), 'log', M((-0.1, DK, -2.05)))
    mb.add(prim_box(0.2, 0.12, 0.06), 'iron', M((-0.1, DK + 0.38, -2.05), (0, 0, 35)))
    mb.add(prim_cyl(0.05, 0.05, 0.6, 6, base=False), 'bone', M((-0.6, DK + 0.05, 1.6), (80, 40, 0)), smooth=0)
    return mb.build(mats, parent=root)


def main():
    args = C.script_args()
    C.reset_scene()
    N.patch_small_bevels(0.025)
    mats = C.make_paint_set(PALETTE)
    root = C.make_empty('OrcOilPlatform')
    base = build_base(mats, root)
    derrick = build_derrick(mats, root)
    pump = build_pump(mats, root)
    pbeam = build_pump_beam(mats, root)
    drums = build_drums(mats, root)
    tower = build_tower(mats, root)
    crane = build_crane(mats, root)
    props = build_props(mats, root)
    drill = build_drill(mats, root)
    boom = build_crane_boom(mats, root)
    smoke = build_smoke(mats, root)
    banners = build_banners(mats, root)
    weights = {'Base': 1.1, 'Derrick': 1.0, 'Pump': 0.8, 'PumpBeam': 0.8, 'Drums': 1.0, 'Tower': 1.0, 'Crane': 0.8, 'Props': 0.6,
               'Anim_Drill': 0.6, 'Anim_Crane': 0.7, 'Anim_Smoke': 0.35, 'Anim_Banners': 0.7}
    finish_building(root, 'orc_oil_platform', 'orc_oil_platform.glb', 'orc_oil_platform_atlas',
                    [base, derrick, pump, pbeam, drums, tower, crane, props], banners, weights, TEAM_DEFAULT, args,
                    spawn=(0, 0, 3.6), rally=(0, 0, 5.2), extra_anim=[drill, boom, smoke], game_dist=72,
                    extra_views=[('ref', (-1.0, 0.95, 1.0)), ('ref2', (1.0, 0.95, 1.0)), ('low', (0.6, 0.12, 1.0))])


if __name__ == '__main__':
    main()
