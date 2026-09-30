"""
bld_common.py — helpers compartilhados pelos scripts de construção (build_stable.py, build_ogre_den.py).
Tudo em coordenadas do jogo (x direita, y cima, +z frente), como `common.py`.
"""
import math
from mathutils import Vector, Matrix
from common import (prim_box, prim_rings, prim_cone, prim_sphere, limb_rings, bezier, M)  # noqa: F401


def orient(d):
    """Matriz de rotação que leva +Y até a direção d."""
    return Vector((0, 1, 0)).rotation_difference(Vector(d).normalized()).to_matrix().to_4x4()


def beam(mb, p0, p1, w, t, mat, **kw):
    """Viga (caixa) entre dois pontos; w = largura, t = espessura."""
    p0, p1 = Vector(p0), Vector(p1)
    d = p1 - p0
    return mb.add(prim_box(w, d.length, t), mat, Matrix.Translation((p0 + p1) / 2) @ orient(d), **kw)


def tube(mb, pts, radii, mat, n=8, smooth=50, cap=True, **kw):
    """Tubo/loft ao longo de pontos com raios (r ou (rx, rz))."""
    return mb.add(prim_rings(limb_rings(pts, radii, n, up=(0, 1, 0)), cap0=cap, cap1=cap), mat, smooth=smooth, **kw)


def log(mb, p0, p1, r, mat='log', n=8, tip=0.0, smooth=40, **kw):
    """Tronco cilíndrico de p0 a p1; tip > 0 acrescenta ponta cônica (estaca) de comprimento tip."""
    p0, p1 = Vector(p0), Vector(p1)
    d = p1 - p0
    mb.add(prim_rings(limb_rings([tuple(p0), tuple(p1)], [r, r], n, up=(0, 1, 0))), mat, smooth=smooth, **kw)
    if tip > 0:
        mb.add(prim_cone(r, tip, n, base=True), mat,
               Matrix.Translation(p1) @ orient(d), smooth=smooth)


def xf(T, pts):
    return [tuple(T @ Vector(p)) for p in pts]


def horse_head(mb, T, scale=1.0):
    """Cabeça e pescoço de cavalo espiando por uma baia. T = matriz do jogo (origem na base do pescoço,
    +z para fora da baia). Materiais: coat, mane, muzzle, blaze, iris."""
    s = scale
    neck = bezier((0, 0, -0.5 * s), (0, 0.35 * s, 0.0), (0, 0.78 * s, 0.25 * s), 4)
    rad = [(0.21 * s, 0.26 * s), (0.19 * s, 0.22 * s), (0.17 * s, 0.19 * s), (0.15 * s, 0.17 * s), (0.13 * s, 0.15 * s)]
    tube(mb, xf(T, neck), rad, 'coat', n=10, smooth=70)
    head = [(0, 0.80 * s, 0.24 * s), (0, 0.72 * s, 0.36 * s), (0, 0.52 * s, 0.50 * s), (0, 0.40 * s, 0.60 * s)]
    hr = [(0.125 * s, 0.15 * s), (0.135 * s, 0.17 * s), (0.095 * s, 0.115 * s), (0.08 * s, 0.10 * s)]
    mb.add(prim_rings(limb_rings(xf(T, head), hr, 12, up=(0, 1, 0))), 'coat', smooth=65,
           mat_fn=None)
    mb.add(prim_rings(limb_rings(xf(T, [(0, 0.41 * s, 0.58 * s), (0, 0.31 * s, 0.68 * s)],), [(0.085 * s, 0.10 * s), (0.088 * s, 0.095 * s)], 12,
                                 up=(0, 1, 0))), 'muzzle', smooth=60)
    # blaze: faixa branca sobre o nariz
    beam(mb, tuple(T @ Vector((0, 0.815 * s, 0.27 * s))), tuple(T @ Vector((0, 0.47 * s, 0.6 * s))), 0.05 * s, 0.03 * s,
         'blaze')
    for sx in (-1, 1):
        mb.add(prim_sphere(0.034 * s, 0.04 * s, 0.035 * s, 6, 4), 'iris', T @ Matrix.Translation((sx * 0.135 * s, 0.73 * s, 0.33 * s)),
               smooth=80)
        mb.add(prim_cone(0.045 * s, 0.17 * s, 5), 'coat', T @ M((sx * 0.08 * s, 0.93 * s, 0.17 * s), (16, 0, sx * -9), (0.7, 1, 1.2)),
               smooth=40)
    for k in range(6):
        t = 0.05 + 0.17 * k
        p = Vector(neck[min(int(t * 4), 3)]).lerp(Vector(neck[min(int(t * 4) + 1, 4)]), t * 4 - int(t * 4))
        mb.add(prim_box(0.05 * s, 0.2 * s, 0.14 * s, taper=(0.5, 0.6)), 'mane',
               T @ M((0.04 * s, p.y + 0.19 * s, p.z - 0.02 * s), (25, 0, -16 + 6 * (k % 2))), smooth=30)


def skull(mb, T, s=1.0, mat='bone'):
    """Crânio de ogro (cranium + testa + órbitas + mandíbula com presas). Frente = +z local.
    Crânios pequenos (s < 0.6) usam versão simplificada (sem chifres/presas, menos dentes)."""
    small = s < 0.6
    mb.add(prim_sphere(0.40 * s, 0.34 * s, 0.42 * s, 8 if small else 10, 4 if small else 5), mat, T @ M((0, 0.06 * s, -0.02 * s)), smooth=65)
    mb.add(prim_box(0.62 * s, 0.10 * s, 0.22 * s, taper=(0.95, 0.8)), mat, T @ M((0, 0.03 * s, 0.30 * s)), bevel=0.012 * s)
    for sx in (-1, 1):
        mb.add(prim_sphere(0.115 * s, 0.11 * s, 0.09 * s, 7, 4), 'dark', T @ M((sx * 0.19 * s, -0.04 * s, 0.33 * s)), smooth=80)
    mb.add(prim_box(0.10 * s, 0.14 * s, 0.10 * s, taper=(0.6, 0.6)), 'dark', T @ M((0, -0.16 * s, 0.40 * s)))
    # focinho/maxilar + dentes
    mb.add(prim_box(0.40 * s, 0.17 * s, 0.30 * s, taper=(0.85, 0.9)), mat, T @ M((0, -0.21 * s, 0.26 * s)), bevel=0.012 * s)
    for i in range(4 if small else 6):
        x = (i - (1.5 if small else 2.5)) * (0.09 if small else 0.065) * s
        mb.add(prim_box(0.04 * s, 0.07 * s, 0.035 * s, taper=(0.7, 0.7)), mat, T @ M((x, -0.33 * s, 0.39 * s)))
    # mandíbula
    mb.add(prim_box(0.42 * s, 0.11 * s, 0.34 * s, taper=(0.9, 0.85)), mat, T @ M((0, -0.42 * s, 0.22 * s)), bevel=0.012 * s)
    if small:
        return
    for sx in (-1, 1):
        # presas curvas para cima
        pts = bezier((sx * 0.15 * s, -0.42 * s, 0.38 * s), (sx * 0.22 * s, -0.25 * s, 0.56 * s), (sx * 0.19 * s, -0.05 * s, 0.50 * s), 3)
        tube(mb, xf(T, pts), [0.035 * s, 0.03 * s, 0.022 * s, 0.006 * s], mat, n=6, smooth=50)
        # chifres
        hp = bezier((sx * 0.32 * s, 0.22 * s, 0.0), (sx * 0.52 * s, 0.30 * s, -0.02 * s), (sx * 0.56 * s, 0.56 * s, 0.05 * s), 3)
        tube(mb, xf(T, hp), [0.07 * s, 0.05 * s, 0.032 * s, 0.006 * s], mat, n=6, smooth=50)


def bbox_game(root):
    """Extensão (min, max) em coordenadas do jogo de todas as malhas sob root."""
    import bpy
    pts = []
    for o in [root] + list(root.children_recursive):
        if o.type == 'MESH':
            pts += [o.matrix_world @ Vector(c) for c in o.bound_box]
    lo = (min(p.x for p in pts), min(p.z for p in pts), min(-p.y for p in pts))
    hi = (max(p.x for p in pts), max(p.z for p in pts), max(-p.y for p in pts))
    return tuple(round(v, 2) for v in lo), tuple(round(v, 2) for v in hi)
