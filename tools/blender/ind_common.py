"""
ind_common.py — helpers das construções industriais navais (M5-04): píer de tábuas sobre estacas, tanque vertical com
telhado cônico, cintas, rebites e escada em espiral, fumaça e línguas de fogo.
Coordenadas do jogo (x direita, y cima, +z frente = mar), como `common.py`.
"""
import math
from mathutils import Vector
from common import (M, prim_box, prim_cyl, prim_cone, prim_sphere)  # noqa: F401
from bld_common import beam, tube, log  # noqa: F401
import naval_common as N


def pier(mb, cx, z0, z1, w, dk, deck='deck', stringer='wood_beam', post='wood_dark', depth=1.0, post_r=0.13, cap=None, step=1.0):
    """Píer de tábuas (topo em `dk`) de z0 a z1 com longarinas e estacas que descem até y = -depth."""
    L = z1 - z0
    mb.add(prim_box(w, 0.16, L, base=True), deck, M((cx, dk - 0.16, (z0 + z1) / 2)), bevel=0.02)
    for sx in (-1, 1):
        mb.add(prim_box(0.16, 0.2, L + 0.1, base=True), stringer, M((cx + sx * (w / 2 - 0.05), dk - 0.34, (z0 + z1) / 2)))
    n = max(2, int(L / step) + 1)
    for k in range(n):
        z = z0 + L * k / (n - 1)
        for sx in (-1, 1):
            x = cx + sx * (w / 2 - 0.05)
            log(mb, (x, -depth, z), (x, dk + 0.28, z), post_r, post, n=6)
            mb.add(prim_cone(post_r * 1.1, 0.14, 6), cap or post, M((x, dk + 0.28, z)), smooth=0)
        if k % 2 == 1:
            mb.add(prim_box(w, 0.12, 0.14), stringer, M((cx, dk - 0.28, z)))


def vtank(mb, cx, cz, y0, R, H, mat, roof='steel_dark', band='steel', n=14, roof_h=0.45, stairs=True, stair_a0=200.0, rivets=True):
    """Tanque vertical de teto cônico: corpo, cintas, rebites, escada em espiral e respiro. Devolve o topo do corpo."""
    mb.add(prim_cyl(R, R, H, n), mat, M((cx, y0, cz)), smooth=60)
    mb.add(prim_cyl(R + 0.05, R + 0.05, 0.12, n), 'steel_dark', M((cx, y0, cz)), smooth=30)
    for f in (0.33, 0.66):
        mb.add(prim_cyl(R + 0.03, R + 0.03, 0.1, n), band, M((cx, y0 + H * f, cz)), smooth=30)
    mb.add(prim_cone(R * 1.06, roof_h, n), roof, M((cx, y0 + H, cz)), smooth=30)
    mb.add(prim_cyl(R * 1.04, R * 1.04, 0.1, n), band, M((cx, y0 + H - 0.05, cz)), smooth=30)
    mb.add(prim_cyl(0.1, 0.1, 0.28, 8), 'steel_dark', M((cx, y0 + H + roof_h - 0.04, cz)), smooth=30)
    mb.add(prim_sphere(0.14, 0.1, 0.14, 7, 3, y_min=0.0), 'steel', M((cx, y0 + H + roof_h + 0.22, cz)), smooth=60)
    if rivets:
        for f in (0.33, 0.66):
            for k in range(8):
                a = 2 * math.pi * k / 8
                N.rivets(mb, [(cx + math.cos(a) * (R + 0.04), y0 + H * f + 0.05, cz + math.sin(a) * (R + 0.04))], 0.025, 'steel_dark')
    if stairs:
        steps = 11
        for i in range(steps):
            a = math.radians(stair_a0) + i * math.radians(26)
            r = R + 0.2
            p = (cx + math.cos(a) * r, y0 + 0.2 + (H - 0.1) * i / (steps - 1), cz + math.sin(a) * r)
            mb.add(prim_box(0.3, 0.06, 0.34), 'steel_dark', M(p, (0, -math.degrees(a) + 90, 0)))
            if i % 2 == 0:
                mb.add(prim_box(0.04, 0.5, 0.04), 'steel', M((p[0], p[1] + 0.28, p[2])))
    return y0 + H


def smoke_puffs(mb, pv, top=1.9, r0=0.2, rmax=0.46, n=8, light_from=6):
    """Coluna de fumaça (esferas) com pivô `pv` (mundo); `mb` já embrulhado em Piv."""
    for k in range(n):
        t = k / (n - 1)
        dy = top * t
        r = r0 + (rmax - r0) * math.sin(min(1.0, t * 1.15) * math.pi * 0.75)
        dx = 0.5 * t * t
        mat = 'smoke' if k < light_from else 'smoke_light'
        mb.add(prim_sphere(r, r * 0.92, r, 8, 5), mat, M((pv[0] + dx, pv[1] + dy, pv[2] + 0.04 * ((k % 2) * 2 - 1)), (0, 17 * k, 0)), smooth=70)
        if 1 <= k <= n - 3:
            mb.add(prim_sphere(r * 0.7, r * 0.65, r * 0.7, 7, 4), mat, M((pv[0] + dx + 0.2, pv[1] + dy - 0.08, pv[2] + 0.14 - 0.12 * (k % 3))), smooth=70)


def flames(mb, x, y, z, s=1.0, n=3):
    """Língua de fogo (cones emissivos)."""
    mb.add(prim_cone(0.22 * s, 0.7 * s, 6), 'glow', M((x, y, z)), smooth=40)
    for k in range(1, n):
        a = 2.2 * k
        mb.add(prim_cone(0.13 * s, 0.5 * s, 5), 'ember', M((x + math.cos(a) * 0.14 * s, y + 0.02, z + math.sin(a) * 0.14 * s), (8 * k, 0, -10 * k)), smooth=40)


def anchor(mb, x, y, z, s=1.0, mat='steel_dark', yaw=0.0):
    """Âncora de ferro vertical (y = ponta do anel; as unhas ficam em y - 1,5 s)."""
    T = M((x, y, z), (0, yaw, 0))
    mb.add(prim_cyl(0.07 * s, 0.07 * s, 1.35 * s, 8), mat, T @ M((0, -1.4 * s, 0)), smooth=40)
    mb.add(N.torus_prim(0.13 * s, 0.035 * s, 10, 4), mat, T @ M((0, 0.0, 0), (90, 0, 0)), smooth=50)
    mb.add(prim_box(0.8 * s, 0.09 * s, 0.09 * s), 'wood_dark', T @ M((0, -0.2 * s, 0)), bevel=0.01)
    for sx in (-1, 1):
        pts = [(0, -1.4 * s, 0), (sx * 0.28 * s, -1.5 * s, 0), (sx * 0.5 * s, -1.28 * s, 0)]
        tube(mb, [tuple(T @ Vector(p)) for p in pts], [0.065 * s, 0.06 * s, 0.045 * s], mat, n=6, smooth=40)
        mb.add(prim_cone(0.1 * s, 0.22 * s, 4), mat, T @ M((sx * 0.5 * s, -1.28 * s, 0), (0, 0, -sx * 40)), smooth=0)
