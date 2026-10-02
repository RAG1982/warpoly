"""
orc_ship_common.py — helpers dos navios ORCS (Barcaça e Fragata): paleta suja/enferrujada, espinhos, remendos de
pano rasgado, caveiras, caixotes, cabeça de javali de ferro. Reaproveita `ship_common` (casco, canhões, etc.).
"""
import math
from mathutils import Matrix
import common as C
from common import M, prim_box, prim_cyl, prim_cone, prim_sphere, prim_extrude, prim_rings, ring_h  # noqa: F401
import ship_common as SH
from ship_common import V, beam, tube, orient, stud  # noqa: F401

PALETTE = dict(SH.PALETTE)
PALETTE.update({
    # tábuas escuras e gastas (casco orc)
    'owood': dict(base='#a65c2a', var='#5c2f16', var_scale=2.4, var_amt=0.85, fine=0.12, top=0.2, pattern='planks',
                  mapping='box', pw=1.9, ph=0.17, mortar='#1e1008', mortar_size=0.02, edge='#b8794a', edge_amt=0.45,
                  edge_r=0.02, ao=(0.4, 0.7), streaks=(2.5, 0.5, 0.2), grad=(-0.6, 1.9, 0.35)),
    'owood_dark': dict(base='#3e2314', var='#26150a', var_scale=2.5, fine=0.12, top=0.2, edge='#8a6040', edge_amt=0.5,
                       edge_r=0.02, ao=(0.4, 0.7), streaks=(2.5, 0.5, 0.18), grad=(-0.6, 1.9, 0.3)),
    'odeck': dict(base='#8a5428', var='#53301a', var_scale=2.0, var_amt=0.85, fine=0.12, top=0.3, pattern='planks_v',
                  mapping='box', pw=1.5, ph=0.2, mortar='#1e1008', mortar_size=0.022, edge='#c68a54', edge_amt=0.35,
                  edge_r=0.02, ao=(0.4, 0.7)),
    # pano/couro rasgado
    'cloth': dict(base='#a48558', var='#6a4d2e', var_scale=3.0, var_amt=0.9, fine=0.16, fine_scale=30.0, top=0.25,
                  edge='#d4b886', edge_amt=0.5, edge_r=0.03, ao=(0.35, 0.65)),
    'hide': dict(base='#7a5030', var='#3e2614', var_scale=5.0, var_amt=0.8, fine=0.16, top=0.2, edge='#b08050',
                 edge_amt=0.5, edge_r=0.02, ao=(0.3, 0.65)),
    # ferro enferrujado (placas) — claro e escuro
    'plate': dict(base='#6a6a6e', var='#9a4e2a', var_scale=3.6, var_amt=0.45, fine=0.16, top=0.25, pattern='bricks',
                  mapping='box', pw=1.4, ph=0.7, mortar='#241410', mortar_size=0.016, brick_dark=0.85,
                  brick_lite=1.08, brick_tint_amt=0.25, brick_tint='#2a2a2e', edge='#c98a62', edge_amt=0.55,
                  edge_r=0.02, edge_gain=10.0, ao=(0.4, 0.7), grad=(-0.6, 1.9, 0.3)),
    'plate_dark': dict(base='#3a3a3e', var='#6a3a22', var_scale=4.0, var_amt=0.4, fine=0.16, top=0.2, edge='#9a6a50',
                       edge_amt=0.5, edge_r=0.02, edge_gain=10.0, ao=(0.4, 0.7)),
    'bone': dict(base='#dcd2b4', var='#a89c78', var_scale=6.0, fine=0.1, top=0.35, edge='#fff8e0', edge_amt=0.7,
                 edge_r=0.02, ao=(0.3, 0.6)),
    'spike': dict(base='#c3b8a4', var='#7a6a58', var_scale=6.0, fine=0.1, top=0.35, edge='#f4ecd8', edge_amt=0.8,
                  edge_r=0.015, edge_gain=12.0, ao=(0.25, 0.55)),
})
PALETTE['team']['base'] = '#cdbfb0'


def spike(mb, p, n, r=0.05, h=0.28, mat='spike', k=5):
    """Espinho cônico em p apontando para n."""
    mb.add(prim_cone(r, h, k), mat, Matrix.Translation(V(p)) @ orient(n), smooth=0)


def spike_base(mb, p, n, r=0.05, h=0.28, mat='spike', plate='plate_dark'):
    """Espinho com base de placa de ferro."""
    m = Matrix.Translation(V(p)) @ orient(n)
    mb.add(prim_cyl(r * 1.7, r * 1.4, h * 0.14, 6, base=True), plate, m, smooth=0)
    mb.add(prim_cone(r, h, 5), mat, m @ M((0, h * 0.12, 0)), smooth=0)


def tatter(mb, T, w, h, mat='cloth', seed=0, d=0.03, teeth=4):
    """Remendo de pano rasgado pendurado: topo em y = 0, borda inferior serrilhada; +z local = para fora."""
    pts = [(-w / 2, 0.0), (w / 2, 0.0)]
    import random
    rnd = random.Random(seed)
    for i in range(teeth + 1):
        x = w / 2 - w * i / teeth
        pts.append((x * (0.97 if 0 < i < teeth else 1.0), -h * (0.62 + 0.38 * rnd.random())))
        if i < teeth:
            pts.append((x - w / teeth * 0.5, -h * (0.3 + 0.3 * rnd.random())))
    mb.add(prim_extrude(pts, d, axis='z'), mat, T, smooth=0)


def skull(mb, T, s=1.0, mat='bone', dark='dark'):
    """Caveira: calota + mandíbula + órbitas e nariz (face em +z local)."""
    mb.add(prim_sphere(0.11 * s, 0.12 * s, 0.1 * s, 8, 5), mat, T @ M((0, 0.03 * s, 0)), smooth=45)
    mb.add(prim_box(0.12 * s, 0.07 * s, 0.1 * s), mat, T @ M((0, -0.09 * s, 0.0)), bevel=0.008)
    for dx in (-0.045, 0.045):
        mb.add(prim_box(0.055 * s, 0.06 * s, 0.03 * s), dark, T @ M((dx * s, 0.03 * s, 0.085 * s)))
    mb.add(prim_box(0.025 * s, 0.04 * s, 0.03 * s), dark, T @ M((0, -0.03 * s, 0.09 * s)))
    for dx in (-0.03, 0.0, 0.03):
        mb.add(prim_box(0.012 * s, 0.045 * s, 0.02 * s), dark, T @ M((dx * s, -0.1 * s, 0.056 * s)))


def crate(mb, T, s=0.3, mat='owood', strap='plate_dark'):
    mb.add(prim_box(s, s, s), mat, T @ M((0, s / 2, 0)), bevel=0.012)
    mb.add(prim_box(s * 1.04, s * 0.12, s * 1.04), strap, T @ M((0, s * 0.18, 0)), bevel=0.006)
    mb.add(prim_box(s * 1.04, s * 0.12, s * 1.04), strap, T @ M((0, s * 0.82, 0)), bevel=0.006)
    mb.add(prim_box(s * 0.12, s * 1.04, s * 1.04), strap, T @ M((0, s / 2, 0)), bevel=0.006)


def hang_chain(mb, p0, p1, links=8, r=0.03, sag=0.0, mat='plate_dark'):
    """Corrente entre p0 e p1 com barriga para baixo (sag)."""
    p0, p1 = V(p0), V(p1)
    prev = p0
    for i in range(1, links + 1):
        t = i / links
        p = p0.lerp(p1, t) + V((0, -sag * 4 * t * (1 - t), 0))
        d = p - prev
        rot = 0 if i % 2 else 90
        mb.add(prim_box(r * 1.5, d.length * 1.15, r), mat, Matrix.Translation((p + prev) / 2) @ orient(d) @ M(r=(0, rot, 0)))
        prev = p
