"""
bld_orc.py — blocos das construções orcs do lote 1 da F7-00b: paliçada de toras pontiagudas, parede de toras,
telhado de peles sobre costelas, presas, crânios, braseiros, estandartes esfarrapados.
Coordenadas do jogo (x direita, y cima, +z frente), como `common.py`. Paleta: `build_ogre_den.PALETTE` + `ORC_EXTRAS`.
"""
import math
from mathutils import Vector, Matrix
from common import (M, prim_box, prim_rings, ring_h, prim_cyl, prim_cone, prim_sphere, prim_extrude, bezier)
from bld_common import beam, tube, log, skull, orient  # noqa: F401
from bld_house import polar, arch_poly  # noqa: F401

ORC_EXTRAS = {
    'wood_light': dict(base='#8a6038', var='#6a4626', var_scale=2.2, fine=0.08, top=0.2, edge='#c09468', edge_amt=0.4, edge_r=0.02, ao=(0.4, 0.55)),
    'wood_dark': dict(base='#4a301c', var='#35210f', var_scale=2.5, fine=0.09, top=0.15, edge='#8a6a48', edge_amt=0.4, edge_r=0.02, ao=(0.4, 0.6)),
    'steel': dict(base='#7d8290', var='#5d6270', var_scale=4.0, fine=0.08, top=0.35, edge='#d0d6e2', edge_amt=0.8,
                  edge_r=0.014, ao=(0.25, 0.4)),
    'ember': dict(base='#ff7a1a', var='#ffb040', var_scale=5.0, emit_boost=1.4),
    'coal': dict(base='#26211e', var='#14100e', var_scale=6.0, fine=0.14, top=0.25, ao=(0.4, 0.5)),
    'leather': dict(base='#6a4326', var='#4a2c16', var_scale=6.0, fine=0.12, top=0.2, edge='#a0724a', edge_amt=0.4,
                    edge_r=0.02, ao=(0.25, 0.6)),
    'plank': dict(base='#6a4a2c', var='#4a321c', var_scale=2.0, fine=0.1, pattern='planks', mapping='box', pw=1.6,
                  ph=0.2, mortar='#1e130c', mortar_size=0.03, top=0.2, edge='#9a7650', edge_amt=0.3, edge_r=0.03,
                  ao=(0.6, 0.65)),
    'log_end': dict(base='#a07a4a', var='#6a4a2a', var_scale=14.0, var_amt=0.7, fine=0.05, top=0.3),
    'mud': dict(base='#6a5238', var='#46361f', var_scale=2.5, var_amt=0.9, fine=0.18, top=0.15, ao=(0.9, 0.8)),
    'straw': dict(base='#bfa24e', var='#8a7430', var_scale=6.0, var_amt=0.9, fine=0.18, top=0.3, ao=(0.5, 0.55)),
    'slop': dict(base='#5a4a2a', var='#3a2e18', var_scale=4.0, var_amt=0.8, fine=0.12, top=0.4),
    'pig': dict(base='#e0a0a0', var='#c07a7a', var_scale=8.0, var_amt=0.6, fine=0.05, top=0.4, ao=(0.3, 0.5)),
    'pig_dark': dict(base='#7a5a52', var='#4a3430', var_scale=8.0, var_amt=0.7, fine=0.06, top=0.35),
    'water': dict(base='#4a6a7a', var='#34505e', var_scale=3.0, top=0.3),
    'sawdust': dict(base='#cfa860', var='#a98238', var_scale=18.0, var_amt=0.9, fine=0.16, top=0.3, ao=(0.3, 0.5)),
    'eye': dict(base='#f0e8c8', var='#d8cfa8', var_scale=8.0, top=0.3),
    'pupil': dict(base='#15121a', var='#0c0a10'),
    'skin': dict(base='#5f8a3a', var='#456a2a', var_scale=8.0, fine=0.06, top=0.3, ao=(0.3, 0.5)),
    'window': dict(base='#ffb040', var='#ff8a1a', var_scale=6.0, emit_boost=1.3),
    'bark': dict(base='#56392a', var='#38261a', var_scale=2.0, fine=0.09, pattern='planks_v', mapping='box', pw=3.0,
                 ph=0.34, mortar='#1e130c', mortar_size=0.015, top=0.2, edge='#8a6446', edge_amt=0.35, edge_r=0.03,
                 ao=(0.7, 0.7)),
}


def spiked_logs(mb, p0, p1, n, base_h, jitter, y0, r=0.22, mat='log', tip=0.5, skip=None):
    """Fila de toras verticais pontiagudas entre dois pontos do plano (x, z)."""
    a, b = Vector((p0[0], 0, p0[1])), Vector((p1[0], 0, p1[1]))
    for i in range(n):
        if skip and skip(i, n):
            continue
        t = (i + 0.5) / n
        p = a.lerp(b, t)
        h = base_h + jitter[i % len(jitter)]
        log(mb, (p.x, y0, p.z), (p.x, y0 + h, p.z), r, mat, n=6, tip=tip)


def log_wall(mb, p0, p1, y0, h, r=0.2, mat='log', end_mat='log_end', n=7):
    """Parede de toras horizontais empilhadas entre dois pontos (x, z); extremidades com anéis."""
    a, b = Vector((p0[0], 0, p0[1])), Vector((p1[0], 0, p1[1]))
    rows = max(1, int(h / (2 * r * 0.95)))
    for k in range(rows):
        y = y0 + r + k * 2 * r * 0.95
        log(mb, (a.x, y, a.z), (b.x, y, b.z), r, mat, n=n)
        for q in (a, b):
            mb.add(prim_cyl(r, r, 0.02, n, base=False), end_mat, orient_xz(q, a, b, y))


def orient_xz(q, a, b, y):
    d = (b - a).normalized()
    sgn = 1.0 if (q - a).length > 1e-6 else -1.0
    return Matrix.Translation((q.x + d.x * 0.012 * sgn, y, q.z + d.z * 0.012 * sgn)) @ orient(d)


def hide_roof(mb, cx, cz, hx, hz, y_wall, rise, hide='hide', ridge='log', rib='bone', ov=0.55, ov_z=0.5, thick=0.16,
              ribs=4):
    """Telhado de duas águas de peles esticadas, com costelas de osso e cumeeira de tora; devolve y da cumeeira."""
    run = hx + ov
    r = rise * run / hx
    zl = 2 * hz + 2 * ov_z
    ang = math.degrees(math.atan2(r, run))
    L = math.hypot(run, r)
    ridge_y = y_wall - ov * rise / hx + r
    for sx in (-1, 1):
        mid = Vector((cx + sx * run / 2, ridge_y - r / 2, cz))
        n = Vector((sx * math.sin(math.radians(ang)), math.cos(math.radians(ang)), 0)) * (thick / 2)
        mb.add(prim_box(L, thick, zl), hide, M(tuple(mid + n), (0, 0, -sx * ang)), bevel=0.03)
        # costelas de osso sobre a pele
        for k in range(ribs):
            z = cz - hz + (2 * hz) * (k + 0.5) / ribs
            nn = Vector((sx * math.sin(math.radians(ang)), math.cos(math.radians(ang)), 0)) * (thick + 0.04)
            mb.add(prim_box(L * 1.02, 0.09, 0.14), rib, M(tuple(mid + nn + Vector((0, 0, z - cz))), (0, 0, -sx * ang)), bevel=0.012)
    log(mb, (cx, ridge_y + 0.05, cz - hz - ov_z), (cx, ridge_y + 0.05, cz + hz + ov_z), 0.16, ridge, n=7)
    return ridge_y


def tusk(mb, base, tip, bulge, r0=0.18, mat='bone', n=7):
    """Presa curva (tubo) da base à ponta com abaulamento `bulge` (vetor) no meio."""
    p0, p1 = Vector(base), Vector(tip)
    mid = (p0 + p1) / 2 + Vector(bulge)
    pts = bezier(tuple(p0), tuple(mid), tuple(p1), 6)
    tube(mb, pts, [r0, r0 * 0.93, r0 * 0.8, r0 * 0.64, r0 * 0.46, r0 * 0.24, 0.015], mat, n=n, smooth=45)


def brazier(mb, x, y, z, s=1.0):
    """Braseiro de ferro com tripé, brasas e chamas."""
    for k in range(3):
        a = 2 * math.pi * k / 3
        beam(mb, (x + math.cos(a) * 0.3 * s, y, z + math.sin(a) * 0.3 * s), (x + math.cos(a) * 0.12 * s, y + 0.75 * s, z + math.sin(a) * 0.12 * s),
             0.06 * s, 0.06 * s, 'iron')
    mb.add(prim_sphere(0.3 * s, 0.2 * s, 0.3 * s, 8, 3, y_max=0.0), 'iron', M((x, y + 0.8 * s, z)), smooth=45)
    mb.add(prim_cyl(0.32 * s, 0.32 * s, 0.05 * s, 8), 'iron', M((x, y + 0.8 * s, z)), smooth=0)
    mb.add(prim_sphere(0.26 * s, 0.07 * s, 0.26 * s, 7, 3, y_min=0.0), 'coal', M((x, y + 0.82 * s, z)), smooth=50)
    mb.add(prim_cone(0.2 * s, 0.5 * s, 6), 'glow', M((x, y + 0.85 * s, z)), smooth=40)
    mb.add(prim_cone(0.1 * s, 0.35 * s, 5), 'glow', M((x + 0.1 * s, y + 0.85 * s, z + 0.05 * s)), smooth=40)


def tattered_banner(mb, x, y, z, ry=0.0, w=0.8, h=1.1, wave=0.07):
    """Estandarte esfarrapado de time (malha `Anim_Banners`)."""
    poly = [(-w / 2, 0.0), (w / 2, 0.0), (w / 2, -h * 0.9), (w * 0.25, -h * 0.7), (0.0, -h), (-w * 0.25, -h * 0.72), (-w / 2, -h * 0.95)]
    verts, faces = prim_extrude(poly, 0.03, axis='z')
    verts = [(px, py, pz + wave * math.sin(py * 6.0 + px * 3)) for (px, py, pz) in verts]
    mb.add((verts, faces), 'team', M((x, y, z), (0, ry, 0)), smooth=40)


def banner_pole(mb, x, y0, z, h, banners=None, ry=0.0, w=0.8, bh=1.1, top='iron'):
    log(mb, (x, y0, z), (x, y0 + h, z), 0.07, 'log', n=6)
    mb.add(prim_cone(0.1, 0.35, 5), top, M((x, y0 + h, z)))
    mb.add(prim_box(w + 0.1, 0.06, 0.06), 'bone', M((x, y0 + h - 0.15, z), (0, ry, 0)))
    if banners is not None:
        tattered_banner(banners, x, y0 + h - 0.18, z + 0.04, ry, w, bh)


def horn_crest(mb, x0, x1, y, z, n=5, h=0.7, mat='bone'):
    """Fileira de chifres curvos na cumeeira (crista de osso)."""
    for k in range(n):
        t = (k + 0.5) / n
        x = x0 + (x1 - x0) * t
        mb.add(prim_cone(0.1, h, 5), mat, M((x, y, z), (0, 0, 0)), smooth=40)


def spike_fence_line(mb, p0, p1, y0, n, h=0.9, r=0.07, mat='iron'):
    a, b = Vector((p0[0], 0, p0[1])), Vector((p1[0], 0, p1[1]))
    for i in range(n + 1):
        p = a.lerp(b, i / n)
        mb.add(prim_cone(r, h, 4), mat, M((p.x, y0, p.z)))


def barrel_orc(mb, x, y, z, r=0.28, h=0.6):
    mb.add(prim_rings([ring_h(0, r * 0.8, r * 0.8, 8), ring_h(h / 2, r, r, 8), ring_h(h, r * 0.8, r * 0.8, 8)]), 'plank',
           M((x, y, z)), smooth=50)
    for yy in (0.14, h - 0.14):
        mb.add(prim_cyl(r * 0.88, r * 0.88, 0.05, 8), 'iron', M((x, y + yy, z)))
