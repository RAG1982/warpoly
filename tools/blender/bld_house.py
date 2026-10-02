"""
bld_house.py — blocos de construção para casas/galpões/quartéis (lote 1 da F7-00b): paredes, enxaimel,
empenas, telhado de duas águas, janelas com venezianas, portas em arco, chaminé, mastro de bandeira.
Coordenadas do jogo (x direita, y cima, +z frente), como `common.py`. Todas as funções recebem o `MeshBuilder`.
"""
import math
from mathutils import Vector, Matrix
from common import (M, prim_box, prim_rings, ring_h, prim_cyl, prim_cone, prim_sphere, prim_extrude)
from bld_common import beam, tube, log  # noqa: F401


def arch_poly(w, h, y0=0.0, segs=6):
    r = w / 2
    spring = y0 + h - r
    pts = [(r, y0)]
    for i in range(segs + 1):
        a = math.pi * i / segs
        pts.append((r * math.cos(a), spring + r * math.sin(a)))
    pts.append((-r, y0))
    return pts


def polar(r, ang_deg):
    a = math.radians(ang_deg)
    return math.sin(a) * r, math.cos(a) * r   # ang 0 = +Z


def gable_frame(mb, cx, z, hx, y_wall, rise, mat, flip=1.0):
    """Vigas de enxaimel sobre uma empena (plano z). flip=+1 frente, -1 fundo."""
    zf = z + flip * 0.0
    beam(mb, (cx - hx - 0.1, y_wall, zf), (cx, y_wall + rise + 0.08, zf), 0.17, 0.12, mat)
    beam(mb, (cx + hx + 0.1, y_wall, zf), (cx, y_wall + rise + 0.08, zf), 0.17, 0.12, mat)
    beam(mb, (cx - hx * 0.52, y_wall + rise * 0.48, zf), (cx + hx * 0.52, y_wall + rise * 0.48, zf), 0.12, 0.1, mat)
    beam(mb, (cx, y_wall, zf), (cx, y_wall + rise * 0.9, zf), 0.12, 0.1, mat)


def roof_gabled(mb, cx, cz, hx, hz, y_wall, rise, mat, ridge_mat='gold', ov=0.5, ov_z=0.45, thick=0.16, ridge=True):
    """Telhado de duas águas sobre paredes de meia-largura hx e meia-profundidade hz; devolve a altura da cumeeira."""
    run = hx + ov
    r = rise * run / hx
    zl = 2 * hz + 2 * ov_z
    ang = math.degrees(math.atan2(r, run))
    L = math.hypot(run, r)
    ridge_y = y_wall - ov * rise / hx + r
    for sx in (-1, 1):
        mid = Vector((cx + sx * run / 2, ridge_y - r / 2, cz))
        n = Vector((sx * math.sin(math.radians(ang)), math.cos(math.radians(ang)), 0)) * (thick / 2)
        mb.add(prim_box(L, thick, zl), mat, M(tuple(mid + n), (0, 0, -sx * ang)), bevel=0.03)
    if ridge:
        mb.add(prim_box(0.28, 0.2, zl - 0.4), ridge_mat, M((cx, ridge_y + 0.1, cz), (0, 0, 45)), bevel=0.02)
    return ridge_y


def window(mb, T, w, h, frame='wood_beam', shutter='wood', glass='dark', shutters=True):
    """Janela retangular com moldura, peitoril e (opcional) venezianas; T = matriz da face (+z para fora)."""
    mb.add(prim_box(w, h, 0.06), glass, T @ M((0, 0, 0.0)))
    mb.add(prim_box(w + 0.14, 0.07, 0.1), frame, T @ M((0, h / 2 + 0.03, 0.03)))
    mb.add(prim_box(w + 0.2, 0.08, 0.18), frame, T @ M((0, -h / 2 - 0.03, 0.06)), bevel=0.01)
    for sx in (-1, 1):
        mb.add(prim_box(0.07, h, 0.1), frame, T @ M((sx * (w / 2 + 0.035), 0, 0.03)))
    mb.add(prim_box(0.04, h, 0.05), frame, T @ M((0, 0, 0.04)))
    mb.add(prim_box(w, 0.04, 0.05), frame, T @ M((0, 0, 0.04)))
    if shutters:
        for sx in (-1, 1):
            mb.add(prim_box(w * 0.42, h * 0.98, 0.04), shutter, T @ M((sx * (w / 2 + w * 0.26), 0, 0.05), (0, sx * 38, 0)), bevel=0.008)


def door_arched(mb, T, w, h, mat='wood_door', frame='stone_light', iron='iron', gold='gold'):
    """Porta em arco com moldura, tábuas, tiras de ferro e aldrava; T = matriz da face (+z para fora, y=0 no piso)."""
    mb.add(prim_extrude(arch_poly(w + 0.4, h + 0.2), 0.24, axis='z'), frame, T @ M((0, 0, 0.0)), bevel=0.02)
    mb.add(prim_extrude(arch_poly(w, h), 0.14, axis='z'), mat, T @ M((0, 0, 0.1)))
    mb.add(prim_box(0.05, h * 0.92, 0.05), iron, T @ M((0, h * 0.46, 0.2)))
    for dy in (0.3, h * 0.62):
        mb.add(prim_box(w * 0.9, 0.07, 0.04), iron, T @ M((0, dy, 0.2)))
    for sx in (-1, 1):
        mb.add(prim_sphere(0.05, 0.05, 0.04, 5, 3), gold, T @ M((sx * 0.12, h * 0.42, 0.22)), smooth=60)


def chimney(mb, x, z, y0, y1, w, mat='stone', cap='stone_light', flue='dark', taper=0.82):
    mb.add(prim_box(w, y1 - y0, w, taper=(taper, taper), base=True), mat, M((x, y0, z)), bevel=0.03)
    mb.add(prim_box(w * taper + 0.14, 0.14, w * taper + 0.14), cap, M((x, y1, z)), bevel=0.02)
    mb.add(prim_box(w * taper - 0.1, 0.05, w * taper - 0.1), flue, M((x, y1 + 0.1, z)))


def flag(mb, x, z, y0, h, banner_mb=None, pole_mat='wood_beam', top='gold', side=1, w=0.9, hgt=0.5, wave=0.1):
    """Mastro com esfera dourada; a bandeira (cor de time) vai para `banner_mb`."""
    log(mb, (x, y0, z), (x, y0 + h, z), 0.06, pole_mat, n=6)
    mb.add(prim_sphere(0.09, 0.09, 0.09, 6, 3), top, M((x, y0 + h, z)), smooth=60)
    mb.add(prim_cone(0.07, 0.3, 5), top, M((x, y0 + h + 0.02, z)))
    if banner_mb is not None:
        pts = [(0.0, 0.0), (w, 0.0), (w * 0.82, -hgt * 0.5), (w, -hgt), (0.0, -hgt)]
        verts, faces = prim_extrude(pts, 0.04, axis='z')
        verts = [(side * px, py, pz + wave * math.sin(px * 4.0 + side)) for (px, py, pz) in verts]
        banner_mb.add((verts, faces), 'team', M((x + side * 0.03, y0 + h - 0.25, z)), smooth=40)


def barrel(mb, x, y, z, r=0.28, h=0.6, mat='wood', band='iron', n=8):
    mb.add(prim_rings([ring_h(0, r * 0.8, r * 0.8, n), ring_h(h / 2, r, r, n), ring_h(h, r * 0.8, r * 0.8, n)]), mat,
           M((x, y, z)), smooth=50)
    for yy, k in ((0.14, 0.86), (h - 0.14, 0.86)):
        mb.add(prim_cyl(r * k * 1.08, r * k * 1.08, 0.05, n), band, M((x, y + yy, z)))


def crate(mb, x, y, z, s=0.5, rot=0.0, mat='wood', band='wood_beam'):
    mb.add(prim_box(s, s, s, base=True), mat, M((x, y, z), (0, rot, 0)), bevel=0.02)
    mb.add(prim_box(s + 0.03, 0.06, s + 0.03), band, M((x, y + s * 0.5, z), (0, rot, 0)))


def hay_bale(mb, x, y, z, rot=0.0, s=1.0, mat='hay', rope='rope'):
    mb.add(prim_box(0.9 * s, 0.45 * s, 0.5 * s, base=True), mat, M((x, y, z), (0, rot, 0)), bevel=0.03)
    for dx in (-0.25, 0.25):
        mb.add(prim_box(0.045 * s, 0.47 * s, 0.52 * s, base=True), rope, M((x, y, z), (0, rot, 0)) @ M((dx * s, 0, 0)))


def lantern(mb, T, mat_glow='glow', iron='iron'):
    mb.add(prim_box(0.05, 0.05, 0.3), iron, T @ M((0, 0.2, -0.15)))
    mb.add(prim_box(0.16, 0.22, 0.16), mat_glow, T @ M((0, 0.0, 0.0)), bevel=0.01)
    mb.add(prim_box(0.2, 0.05, 0.2), iron, T @ M((0, 0.14, 0.0)))
    mb.add(prim_box(0.2, 0.04, 0.2), iron, T @ M((0, -0.13, 0.0)))


# cores extras comuns às construções humanas (somadas à paleta do Estábulo `build_stable.PALETTE`)
HUMAN_EXTRAS = {
    'wood_light': dict(base='#a87a44', var='#8a6030', var_scale=2.2, fine=0.08, top=0.2, edge='#d8b07a', edge_amt=0.4, edge_r=0.02, ao=(0.4, 0.55)),
    'wood_dark': dict(base='#5a3c22', var='#45301a', var_scale=2.5, fine=0.09, top=0.15, edge='#9a7a52', edge_amt=0.45, edge_r=0.02, ao=(0.4, 0.6)),
    'steel': dict(base='#9aa1ad', var='#7b818d', var_scale=4.0, fine=0.06, top=0.4, edge='#eef2f8', edge_amt=0.8,
                  edge_r=0.012, ao=(0.25, 0.4)),
    'canvas': dict(base='#d8c9a2', var='#b9a878', var_scale=6.0, fine=0.12, top=0.3, ao=(0.3, 0.5)),
    'leather_dark': dict(base='#4a2e18', var='#35210f', var_scale=6.0, fine=0.12, top=0.2, ao=(0.25, 0.6)),
    'coal': dict(base='#26211e', var='#14100e', var_scale=6.0, fine=0.14, top=0.25, ao=(0.4, 0.5)),
    'ember': dict(base='#ff7a1a', var='#ffb040', var_scale=5.0, emit_boost=1.4),
    'brick': dict(base='#a4573a', var='#7c3a24', var_scale=0.4, var_amt=0.8, fine=0.08, pattern='bricks', mapping='box',
                  pw=0.34, ph=0.14, mortar='#4a2e22', mortar_size=0.02, brick_tint='#c26e48', brick_tint_amt=0.5,
                  brick_dark=0.8, brick_lite=1.12, top=0.25, ao=(0.6, 0.6)),
    'bark': dict(base='#6a4a2e', var='#48301c', var_scale=3.0, fine=0.12, pattern='planks_v', mapping='box', pw=3.0,
                 ph=0.12, mortar='#2a1a0e', mortar_size=0.02, top=0.2, edge='#a07c52', edge_amt=0.3, edge_r=0.03,
                 ao=(0.5, 0.6)),
    'log_end': dict(base='#caa16a', var='#8e6a3a', var_scale=14.0, var_amt=0.7, fine=0.05, top=0.3),
    'plank_new': dict(base='#d8b070', var='#b88c48', var_scale=3.0, fine=0.08, pattern='planks', mapping='box', pw=1.4,
                      ph=0.16, mortar='#7a5a2a', mortar_size=0.015, top=0.3, edge='#f0d098', edge_amt=0.4, edge_r=0.02,
                      ao=(0.4, 0.55)),
    'shake': dict(base='#5a6a8a', var='#3d4c6e', var_scale=0.5, var_amt=0.7, fine=0.05, pattern='shingles',
                  mapping='box', pw=0.26, ph=0.2, mortar='#1d2540', brick_tint='#7a8cb0', brick_tint_amt=0.4,
                  brick_dark=0.82, brick_lite=1.12, top=0.3, edge='#a9b9d8', edge_amt=0.4, edge_r=0.04, ao=(0.8, 0.5)),
    'sawdust': dict(base='#e0c078', var='#c09a48', var_scale=18.0, var_amt=0.9, fine=0.16, top=0.3, ao=(0.3, 0.5)),
    'leaf': dict(base='#5f9a46', var='#3f7a2c', var_scale=8.0, var_amt=0.8, fine=0.14, top=0.3, ao=(0.3, 0.5)),
    'flower': dict(base='#f06a8a', var='#f4c43a', var_scale=20.0, var_amt=1.0, top=0.3),
    'wheat': dict(base='#e0b440', var='#b88a20', var_scale=14.0, var_amt=0.9, fine=0.2, top=0.4, ao=(0.3, 0.5)),
    'soil': dict(base='#6a4a2e', var='#4a321c', var_scale=3.0, var_amt=0.8, fine=0.18, top=0.15, ao=(0.8, 0.8)),
    'target_red': dict(base='#b02a22', var='#821a14', var_scale=6.0, top=0.3),
    'paint_red': dict(base='#a0231a', var='#781710', var_scale=6.0, fine=0.1, top=0.2),
}
