"""
build_cavalier.py — Cavaleiro montado humano (tipo interno `cavalier`) gerado 100% por script.

Cavalo de guerra low-poly anatômico (pescoço arqueado, crina, cauda, focinho, olhos, ferraduras,
arreios, rédeas, sela de couro, gualdrapa heráldica em cor de time) + o cavaleiro de placas do
Espadachim (`build_knight.py`: elmo aberto, capa e mangas azuis em cor de time, frisos dourados,
espada longa). Sem escudo: a espada erguida e a mão esquerda nas rédeas dão uma silhueta limpa
na câmera RTS e mantêm a mesma linguagem do `knight.glb` (o animador ignora ShieldGroup ausente).

Uso:
  blender -b --factory-startup --python tools/blender/build_cavalier.py -- [--no-render]

Hierarquia PLANA (o `UnitAnimator` trata `cavalier` como `knight` e balança as pernas do cavalo):
  Cavalier (raiz)
  ├─ Horse          corpo do cavalo + arreios + pernas do cavaleiro (estático)
  ├─ HorseLegFL/FR/BL/BR   pivô no ombro/quadril (±0,19; 0,95; 0,42 / −0,55); repouso rot 0
  ├─ Torso  pivô (0, 1.78, 0)   Head pivô (0, 2.35, 0)
  ├─ ArmL / ArmR  pivô (∓0,38; 1,98; 0)  (antebraços dobrados à frente: rédeas / espada)
  └─ Sword  pivô (0,50; 1,62; 0,40), repouso rot x 0,5 rad / z −0,1 rad (gume para +Z)
Rosto do cavaleiro só na face frontal (+Z); os olhos do cavalo ficam nas laterais da cabeça
(anatomia equina) e a estrela/blaze no focinho é só pintura.
"""
import os
import sys
import math

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
from mathutils import Vector, Matrix  # noqa: E402
import common as C  # noqa: E402
import build_knight as K  # noqa: E402
from common import (MeshBuilder, M, prim_box, prim_rings, ring_h, prim_cyl, prim_cone,  # noqa: E402
                    prim_sphere, prim_extrude, limb_rings, bezier)

TEAM_DEFAULT = K.TEAM_DEFAULT
SEAT_Y = 1.56                      # topo do assento da sela
TORSO_Y = 1.78                     # pivô do tronco do cavaleiro
DY = TORSO_Y - 1.05                # deslocamento em relação ao Espadachim a pé
LEG_PIVOT_Y = 0.95

PALETTE = dict(K.PALETTE)
PALETTE.update({
    'coat': dict(base='#94562f', var='#6b3a1e', var_scale=7.0, var_amt=0.65, fine=0.05, top=0.3,
                 ao=(0.3, 0.55), grad=(0.0, 1.7, 0.22)),
    'coat_dark': dict(base='#5d331b', var='#44240f', var_scale=8.0, var_amt=0.6, fine=0.05, top=0.25,
                      ao=(0.25, 0.5)),
    'sock': dict(base='#e8e0d2', var='#cfc5b2', var_scale=9.0, fine=0.04, top=0.3, ao=(0.25, 0.5)),
    'blaze': dict(base='#efe8da', var='#d8cfbd', var_scale=9.0, fine=0.03, top=0.3),
    'muzzle': dict(base='#3a2a22', var='#2a1d17', var_scale=10.0, fine=0.05, top=0.3),
    'mane': dict(base='#1f140d', var='#3a2516', var_scale=10.0, var_amt=0.8, fine=0.1, top=0.35,
                 ao=(0.2, 0.45)),
    'hoof': dict(base='#2b2622', var='#1d1a17', var_scale=9.0, fine=0.05, top=0.3, ao=(0.2, 0.5)),
    'iris': dict(base='#4a2c14', var='#2c190b', var_scale=25.0),
    'pupil': dict(base='#0b0806', var='#0b0806'),
    'nostril': dict(base='#120c09', var='#120c09'),
    'iron': dict(base='#56595f', var='#3f4248', var_scale=8.0, fine=0.08, top=0.3, edge='#c7ccd6',
                 edge_amt=0.8, edge_r=0.012, ao=(0.2, 0.5)),
})

# ---------------------------------------------------------------------------
# Corpo do cavalo: estações (z, y_centro, meia-largura, meia-altura)
# ---------------------------------------------------------------------------
BODY = [(-0.90, 1.22, 0.16, 0.21), (-0.76, 1.27, 0.26, 0.29), (-0.42, 1.21, 0.29, 0.33),
        (0.00, 1.17, 0.29, 0.34), (0.40, 1.14, 0.30, 0.36), (0.62, 1.15, 0.27, 0.34),
        (0.78, 1.17, 0.17, 0.26)]
NECK_BEZ = ((0, 1.30, 0.50), (0, 1.80, 0.60), (0, 1.94, 1.00))
NECK_R = [(0.19, 0.26), (0.17, 0.22), (0.145, 0.19), (0.125, 0.165), (0.108, 0.14)]
HEAD = [(0, 1.99, 0.95), (0, 1.90, 1.06), (0, 1.74, 1.21), (0, 1.63, 1.33)]
HEAD_R = [(0.10, 0.125), (0.115, 0.15), (0.08, 0.10), (0.068, 0.085)]


def body_at(z):
    if z <= BODY[0][0]:
        return BODY[0][1:]
    for a, b in zip(BODY, BODY[1:]):
        if a[0] <= z <= b[0]:
            t = (z - a[0]) / (b[0] - a[0])
            return tuple(a[i] + (b[i] - a[i]) * t for i in (1, 2, 3))
    return BODY[-1][1:]


def orient(d):
    d = Vector(d).normalized()
    return Vector((0, 1, 0)).rotation_difference(d).to_matrix().to_4x4()


def beam(mb, p0, p1, w, t, mat, **kw):
    p0, p1 = Vector(p0), Vector(p1)
    d = p1 - p0
    return mb.add(prim_box(w, d.length, t), mat, Matrix.Translation((p0 + p1) / 2) @ orient(d), **kw)


def tube(mb, pts, radii, mat, n=6, smooth=60, cap=True, **kw):
    return mb.add(prim_rings(limb_rings(pts, radii, n, up=(0, 1, 0)), cap0=cap, cap1=cap), mat, smooth=smooth, **kw)


def neck_frame(t):
    pts = bezier(*NECK_BEZ, 4)
    i = min(int(t * 4), 3)
    f = t * 4 - i
    p = Vector(pts[i]).lerp(Vector(pts[i + 1]), f)
    d = (Vector(pts[i + 1]) - Vector(pts[i])).normalized()
    n = Vector((0, d.z, -d.y)).normalized()
    r = NECK_R[i][1] + (NECK_R[i + 1][1] - NECK_R[i][1]) * f
    return p, d, n, r


# ---------------------------------------------------------------------------
def cloth_ring(z, hem_deg, off_out, off_in, flare, steps=10):
    """Anel em U (gualdrapa) sobre o dorso: arco externo → arco interno (espessura)."""
    yc, w, h = body_at(z)
    a0, a1 = -hem_deg, 180 + hem_deg
    out, inn = [], []
    for i in range(steps + 1):
        a = math.radians(a0 + (a1 - a0) * i / steps)
        edge = abs(math.cos(a))
        k = 1.0 + flare * max(0.0, -math.sin(a)) * 1.6
        out.append(((w + off_out) * math.cos(a) * k, yc + (h + off_out) * math.sin(a), z))
        inn.append(((w + off_in) * math.cos(a) * k, yc + (h + off_in) * math.sin(a), z))
    return out + inn[::-1]


def horse_hem_pt(z, hem_deg, off=0.035, flare=0.06):
    yc, w, h = body_at(z)
    a = math.radians(-hem_deg)
    k = 1.0 + flare * max(0.0, -math.sin(a)) * 1.6
    return ((w + off) * math.cos(a) * k, yc + (h + off) * math.sin(a))


def build_horse(mats, root):
    mb = MeshBuilder('Horse')
    # ---- tronco: loft em U ao longo de z -----------------------------------------------------
    path = [(0, s[1], s[0]) for s in BODY]
    mb.add(prim_rings(limb_rings(path, [(s[2], s[3]) for s in BODY], 12, up=(0, 1, 0))), 'coat', smooth=70)
    for sx in (-1, 1):   # massa muscular: garupa e ombro
        mb.add(prim_sphere(0.11, 0.18, 0.22, 6, 4), 'coat', M((sx * 0.21, 1.22, -0.58)), smooth=70)
        mb.add(prim_sphere(0.10, 0.19, 0.17, 6, 4), 'coat', M((sx * 0.23, 1.12, 0.42)), smooth=70)
    # ---- pescoço arqueado + cabeça -----------------------------------------------------------
    npts = bezier(*NECK_BEZ, 4)
    mb.add(prim_rings(limb_rings(npts, NECK_R, 10, up=(0, 1, 0))), 'coat', smooth=70)
    head = prim_rings(limb_rings(HEAD, HEAD_R, 12, up=(0, 1, 0)))
    mb.add(head, 'coat', smooth=65,
           mat_fn=lambda c, n: 'blaze' if (abs(c[0]) < 0.02 and n[1] > 0.35 and c[1] > 1.66 and c[2] > 0.98) else None)
    mb.add(prim_rings(limb_rings([(0, 1.64, 1.322), (0, 1.573, 1.402)], [(0.072, 0.09), (0.074, 0.08)], 12, up=(0, 1, 0))),
           'muzzle', smooth=60)
    for sx in (-1, 1):
        mb.add(prim_sphere(0.012, 0.016, 0.012, 5, 3), 'nostril', M((sx * 0.032, 1.578, 1.398), (-40, 0, 0)))
        # olhos nas laterais da cabeça (anatomia equina)
        mb.add(prim_sphere(0.028, 0.034, 0.03, 6, 4), 'iris', M((sx * 0.106, 1.895, 1.05)), smooth=80)
        mb.add(prim_sphere(0.013, 0.018, 0.016, 5, 3), 'pupil', M((sx * 0.128, 1.895, 1.055)), smooth=80)
        # sobrancelha / órbita e orelhas
        mb.add(prim_box(0.03, 0.05, 0.11, taper=(0.8, 0.8)), 'coat', M((sx * 0.09, 1.945, 1.03), (-30, 0, sx * -15)))
        mb.add(prim_cone(0.038, 0.16, 5), 'coat', M((sx * 0.065, 2.03, 0.93), (16, 0, sx * -9), (0.7, 1, 1.2)),
               smooth=40)
        mb.add(prim_cone(0.022, 0.10, 5), 'muzzle', M((sx * 0.065, 2.04, 0.945), (16, 0, sx * -9), (0.6, 1, 0.9)))
    # ---- crina, topete e cauda -----------------------------------------------------------------
    for k in range(9):
        t = 0.04 + 0.11 * k
        p, d, n, r = neck_frame(t)
        pos = p + n * (r * 0.92) + Vector((0.05, 0, 0))
        ang = math.degrees(math.atan2(d.z, d.y)) + 12
        mb.add(prim_box(0.05, 0.19, 0.13, taper=(0.5, 0.6)), 'mane',
               M(tuple(pos + Vector((0, 0.0, -0.02))), (ang, 0, -24 + 6 * (k % 2))), smooth=30)
    mb.add(prim_box(0.06, 0.15, 0.08, taper=(0.5, 0.5)), 'mane', M((0, 2.05, 1.0), (40, 0, 0)))
    tail_pts = bezier((0, 1.40, -0.86), (0, 1.36, -1.32), (0, 0.80, -1.22), 5)
    mb.add(prim_rings(limb_rings(tail_pts, [(0.05, 0.05), (0.085, 0.08), (0.11, 0.09), (0.10, 0.08), (0.07, 0.05),
                                            (0.03, 0.03)], 8, up=(0, 1, 0))), 'mane', smooth=60)
    for sx in (-1, 1):
        lock = bezier((sx * 0.03, 1.38, -0.88), (sx * 0.10, 1.25, -1.26), (sx * 0.12, 0.92, -1.12), 4)
        mb.add(prim_rings(limb_rings(lock, [(0.035, 0.035), (0.06, 0.05), (0.06, 0.05), (0.04, 0.03), (0.015, 0.015)],
                                     6, up=(0, 1, 0))), 'mane', smooth=60)
    # ---- gualdrapa heráldica (cor de time) com friso dourado ----------------------------------
    zs = (-0.40, -0.16, 0.10, 0.34)
    hems = (40, 60, 60, 40)
    rings = [cloth_ring(z, h, 0.03, 0.008, 0.06) for z, h in zip(zs, hems)]
    mb.add(prim_rings(rings), 'team', smooth=35)
    trim = []
    for z, h in zip(zs, hems):
        yc, w, hh = body_at(z)
        outer, inner = [], []
        for i in range(3):
            a = math.radians(-h + i * 7)
            k = 1.0 + 0.06 * max(0.0, -math.sin(a)) * 1.6
            outer.append(((w + 0.038) * math.cos(a) * k, yc + (hh + 0.038) * math.sin(a), z))
            inner.append(((w + 0.004) * math.cos(a) * k, yc + (hh + 0.004) * math.sin(a), z))
        outer2 = [(-x, y, z_) for (x, y, z_) in outer[::-1]]
        inner2 = [(-x, y, z_) for (x, y, z_) in inner[::-1]]
        trim.append(outer + inner[::-1])
    # frisos nas duas barras (esquerda/direita), lofts separados por lado
    for sx in (-1, 1):
        side = [[(sx * x, y, z) for (x, y, z) in r] for r in trim]
        mb.add(prim_rings(side, cap0=True, cap1=True), 'gold', smooth=30)
    # friso dourado nas bordas frontal/traseira (colados ao arco)
    for z in (-0.405, 0.345):
        mb.add(prim_rings([cloth_ring(z - 0.012, 40 if z < 0 else 40, 0.036, 0.006, 0.06),
                           cloth_ring(z + 0.012, 40, 0.036, 0.006, 0.06)]), 'gold', smooth=30)
    # brasão dourado nas laterais
    for sx in (-1, 1):
        hx, hy = horse_hem_pt(-0.03, 22, off=0.048)
        crest = [(0.0, 0.15), (0.11, 0.02), (0.0, -0.13), (-0.11, 0.02)]
        mb.add(prim_extrude(crest, 0.022, axis='x'), 'gold', M((sx * (hx + 0.012), hy + 0.05, -0.03)))
        mb.add(prim_extrude([(0, 0.07), (0.05, 0), (0, -0.07), (-0.05, 0)], 0.026, axis='x'), 'team',
               M((sx * (hx + 0.022), hy + 0.05, -0.03)))
    # ---- sela de couro, estribos, cilha, peitoral ---------------------------------------------
    mb.add(prim_box(0.34, 0.07, 0.56, taper=(0.9, 0.95), base=True), 'leather', M((0, SEAT_Y - 0.075, -0.05)), smooth=30)
    mb.add(prim_box(0.24, 0.15, 0.06, taper=(0.85, 1)), 'leather', M((0, SEAT_Y + 0.04, 0.22), (-8, 0, 0)))
    mb.add(prim_box(0.30, 0.17, 0.06, taper=(0.9, 1)), 'leather', M((0, SEAT_Y + 0.05, -0.30), (10, 0, 0)))
    mb.add(prim_sphere(0.04, 0.04, 0.04, 6, 3), 'gold', M((0, SEAT_Y + 0.13, 0.225)), smooth=60)
    for sx in (-1, 1):
        mb.add(prim_box(0.03, 0.22, 0.30, taper=(1.0, 0.9)), 'leather', M((sx * 0.31, SEAT_Y - 0.13, 0.0), (0, 0, sx * -8)))
        beam(mb, (sx * 0.31, SEAT_Y - 0.05, 0.12), (sx * 0.44, 1.03, 0.25), 0.035, 0.012, 'leather')
        # estribo de ferro
        mb.add(prim_box(0.12, 0.022, 0.10), 'iron', M((sx * 0.44, 0.89, 0.27)))
        for zz in (0.225, 0.315):
            mb.add(prim_box(0.12, 0.13, 0.016), 'iron', M((sx * 0.44, 0.96, zz)))
        mb.add(prim_box(0.05, 0.04, 0.05), 'iron', M((sx * 0.44, 1.03, 0.25)))
    # peitoral: tiras do arção ao peito + medalhão dourado
    for sx in (-1, 1):
        beam(mb, (sx * 0.27, 1.40, 0.36), (sx * 0.05, 1.06, 0.80), 0.045, 0.014, 'leather')
        beam(mb, (sx * 0.29, 1.30, -0.50), (sx * 0.28, 1.10, -0.80), 0.04, 0.012, 'leather')
    mb.add(prim_cyl(0.065, 0.065, 0.028, 10, base=False), 'gold', M((0, 1.06, 0.795), (90, 0, 0)), smooth=30)
    mb.add(prim_cyl(0.035, 0.035, 0.032, 6, base=False), 'team', M((0, 1.06, 0.80), (90, 0, 0)))
    # ---- arreios da cabeça, bridão e rédeas -------------------------------------------------------
    mb.add(prim_rings(limb_rings([(0, 1.625, 1.335), (0, 1.60, 1.36)], [(0.078, 0.096), (0.078, 0.096)], 12,
                                 up=(0, 1, 0)), cap0=False, cap1=False), 'leather', smooth=50)
    mb.add(prim_rings(limb_rings([(0, 1.955, 1.0), (0, 1.935, 1.02)], [(0.118, 0.14), (0.118, 0.14)], 12,
                                 up=(0, 1, 0)), cap0=False, cap1=False), 'leather', smooth=50)
    for sx in (-1, 1):
        beam(mb, (sx * 0.12, 1.91, 1.03), (sx * 0.085, 1.635, 1.33), 0.022, 0.012, 'leather')
        mb.add(prim_sphere(0.022, 0.022, 0.018, 6, 3), 'gold', M((sx * 0.121, 1.895, 1.03)), smooth=60)
        mb.add(prim_sphere(0.018, 0.018, 0.018, 6, 3), 'gold', M((sx * 0.085, 1.615, 1.355)), smooth=60)
        rein = bezier((sx * 0.085, 1.615, 1.355), (sx * 0.17, 1.86, 0.85), (sx * 0.12 if sx > 0 else -0.22, 1.68, 0.27), 5)
        tube(mb, rein, [0.011] * 6, 'leather', n=5)
    # penacho de time no topo da cabeça
    mb.add(prim_extrude([(0, 0), (0.05, 0.12), (0.03, 0.20), (-0.02, 0.12)], 0.02, axis='x'), 'team',
           M((0.0, 2.0, 0.95), (25, 0, 0)))
    # ---- pernas do cavaleiro (estáticas, presas ao flanco) -------------------------------------------
    for sx in (-1, 1):
        hip, mid, knee = (sx * 0.20, 1.60, -0.04), (sx * 0.31, 1.49, 0.11), (sx * 0.42, 1.36, 0.26)
        mb.add(prim_rings(limb_rings([hip, mid, knee], [(0.14, 0.145), (0.125, 0.13), (0.10, 0.105)], 8)),
               'steel', smooth=60)
        mb.add(prim_sphere(0.115, 0.105, 0.105, 8, 4), 'steel_hi', M((sx * 0.43, 1.35, 0.30)), smooth=50)
        mb.add(prim_cone(0.03, 0.06, 6), 'gold', M((sx * 0.43, 1.35, 0.405), (90, 0, 0)))
        mb.add(prim_cyl(0.10, 0.10, 0.02, 10), 'gold', M((sx * 0.30, 1.43, 0.17), (0, 0, sx * 58)), smooth=30)
        ank = (sx * 0.44, 0.99, 0.24)
        mb.add(prim_rings(limb_rings([(sx * 0.43, 1.33, 0.29), (sx * 0.44, 1.15, 0.265), ank],
                                     [(0.085, 0.09), (0.085, 0.09), (0.065, 0.07)], 8)), 'steel', smooth=60)
        mb.add(prim_cyl(0.092, 0.092, 0.02, 10), 'gold', M((sx * 0.44, 1.2, 0.27)), smooth=30)
        mb.add(prim_box(0.14, 0.09, 0.27, taper=(0.85, 0.7), base=True), 'leather', M((sx * 0.44, 0.88, 0.31)), smooth=35)
    return mb.build(mats, parent=root)


# ---------------------------------------------------------------------------
def build_leg(mats, root, name, sx, z, hind):
    mb = MeshBuilder(name)
    if not hind:
        up = [(0, 0.06, 0.0), (0, -0.20, 0.01), (0, -0.44, 0.02)]
        upr = [(0.125, 0.15), (0.11, 0.125), (0.08, 0.088)]
        low = [(0, -0.44, 0.02), (0, -0.58, 0.0), (0, -0.74, 0.02), (0, -0.80, 0.05)]
        lowr = [(0.065, 0.07), (0.055, 0.058), (0.068, 0.068), (0.058, 0.058)]
        knee = (0, -0.44, 0.03)
    else:
        up = [(0, 0.12, 0.0), (0, -0.14, -0.05), (0, -0.44, -0.17)]
        upr = [(0.135, 0.18), (0.11, 0.15), (0.078, 0.10)]
        low = [(0, -0.44, -0.17), (0, -0.62, -0.11), (0, -0.76, -0.07), (0, -0.82, -0.03)]
        lowr = [(0.065, 0.075), (0.055, 0.06), (0.068, 0.068), (0.058, 0.058)]
        knee = (0, -0.44, -0.19)
    mb.add(prim_rings(limb_rings(up, upr, 8)), 'coat', smooth=65)
    mb.add(prim_sphere(0.07, 0.072, 0.072, 6, 3), 'coat_dark', M(knee), smooth=60)
    mb.add(prim_rings(limb_rings(low, lowr, 8)), 'sock', smooth=60)
    end = low[-1]
    # casco + ferradura
    mb.add(prim_cyl(0.10, 0.072, 0.115, 10, base=True), 'hoof', M((0, -0.945, end[2] + 0.04 + (0.0 if not hind else 0.0))),
           smooth=40)
    mb.add(prim_cyl(0.105, 0.105, 0.022, 10, base=True), 'iron', M((0, -0.95, end[2] + 0.04)), smooth=30)
    return mb.build(mats, parent=root, location=(sx * 0.19, LEG_PIVOT_Y, z))


# ---------------------------------------------------------------------------
def main():
    args = C.script_args()
    C.reset_scene()
    mats = C.make_paint_set(PALETTE)
    root = C.make_empty('Cavalier')
    horse = build_horse(mats, root)
    legs = [build_leg(mats, root, 'HorseLegFL', -1, 0.42, False), build_leg(mats, root, 'HorseLegFR', 1, 0.42, False),
            build_leg(mats, root, 'HorseLegBL', -1, -0.55, True), build_leg(mats, root, 'HorseLegBR', 1, -0.55, True)]
    # cavaleiro: tronco/cabeça/espada do Espadachim deslocados para a sela
    K.TORSO_PIVOT = (0.0, TORSO_Y, 0.0)
    K.HEAD_PIVOT = (0.0, 1.62 + DY, 0.0)
    K.ARM_PIVOT = (0.50, 1.27 + DY, 0.0)
    K.SWORD_PIVOT = (0.62, 1.64, 0.42)
    K.TAB = dict(top=0.30, bot=-0.22, topz=0.31, botz=0.31, emb=0.04, back=False)
    K.CAPE_FOLD = ((0, 0.04, -0.24), 0.09)
    K.CAPE = ((0.34, 0.40, -0.22), (-0.34, 0.40, -0.22), (0.54, -0.22, -0.66), (-0.54, -0.22, -0.66))
    torso = K.build_torso(mats, root)
    head = K.build_head(mats, root)
    arm_l = K.build_arm(mats, root, -1, elbow=(-0.06, -0.32, 0.02), wrist=(0.26, -0.30, 0.24))
    arm_r = K.build_arm(mats, root, 1, elbow=(0.14, -0.32, 0.04), wrist=(0.12, -0.36, 0.36))
    sword = K.build_sword(mats, root)
    shield = K.build_shield(mats, root, scale=0.62, pivot=(-0.68, 1.74, 0.16))
    parts = [horse] + legs + [torso, head, arm_l, arm_r, sword, shield]
    bpy.context.view_layer.update()

    C.uv_atlas(parts, weights={'Head': 1.6, 'Torso': 1.0, 'Sword': 0.8, 'Horse': 0.9, 'ArmL': 0.8, 'ArmR': 0.8, 'ShieldGroup': 0.7,
                               'HorseLegFL': 0.8, 'HorseLegFR': 0.8, 'HorseLegBL': 0.8, 'HorseLegBR': 0.8},
               margin=0.006)
    img = C.bake_atlas(parts, 'cavalier_atlas', 512, samples=int(os.environ.get('BAKE_SAMPLES', 32)), margin=4)
    C.finalize_materials(parts, img, team_default=TEAM_DEFAULT, out_png=os.path.join(C.BUILD_DIR, 'cavalier_atlas.png'))
    out = os.path.join(C.OUT_MODELS, 'cavalier.glb')
    C.export_glb(root, out)
    print('STATS cavalier', C.stats(root, out))
    if '--no-render' not in args:
        rig = C.RenderRig(root, 'cavalier', res=int(os.environ.get('RENDER_RES', 800)), samples=24)
        rig.render('34', (1.0, 0.95, 1.0), 30)
        rig.render('front', (0.0, 0.25, 1.0), 30)
        rig.render('back', (-0.6, 0.6, -1.0), 30)
        rig.render('side', (1.0, 0.2, 0.0), 30)
        rig.render('game', (45, 44, 45), 24, dist=78 / 1.62)
        C.set_team_color('#c0392b')
        rig.render('34_vermelho', (1.0, 0.95, 1.0), 30)
        C.set_team_color(TEAM_DEFAULT)


if __name__ == '__main__':
    main()
