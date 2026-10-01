"""
siege_common.py — helpers compartilhados pelos scripts de cerco e oficinas (NEW-36):
build_ballista.py, build_catapult.py, build_workshop.py, build_orc_workshop.py.
Tudo em coordenadas do jogo (x direita, y cima, +z frente), como `common.py`.
"""
import math
from mathutils import Vector, Matrix
from common import (MeshBuilder, M, prim_box, prim_rings, prim_cyl, prim_cone, prim_sphere,  # noqa: F401
                    prim_extrude, limb_rings, bezier)
from bld_common import beam, tube, log, orient, xf  # noqa: F401


def band(r0, r1, hw, n, x0=0.0):
    """Aro oco (seção retangular) com eixo em X: raio interno r0, externo r1, meia-largura hw."""
    verts, faces = [], []
    for i in range(n):
        a = 2 * math.pi * i / n
        c, s = math.cos(a), math.sin(a)
        for (r, w) in ((r1, hw), (r1, -hw), (r0, -hw), (r0, hw)):
            verts.append((x0 + w, r * c, r * s))
    for i in range(n):
        j = (i + 1) % n
        for k in range(4):
            k2 = (k + 1) % 4
            faces.append((i * 4 + k, i * 4 + k2, j * 4 + k2, j * 4 + k))
    return verts, faces


def cyl_x(r, length, n=10, base=False):
    """Cilindro com eixo em X (centrado)."""
    return prim_cyl(r, r, length, n, base=base), M(r=(0, 0, 90))


def add_cyl_x(mb, r, length, mat, pos, n=10, smooth=40, bevel=0.0, r1=None):
    v, f = prim_cyl(r, r if r1 is None else r1, length, n, base=False)
    mb.add((v, f), mat, Matrix.Translation(Vector(pos)) @ M(r=(0, 0, 90)), smooth=smooth, bevel=bevel)


def spoked_wheel(mb, R, side, hw=0.10, spokes=10, felloe=0.10, wood='wood', dark='wood_dark', iron='iron',
                 trim='gold', hub_out=0.22):
    """Roda raiada de carreta (eixo em X, origem no centro do eixo). side = +1/-1 (face externa)."""
    n = 16
    mb.add(band(R - felloe, R, hw, n), wood, smooth=0)
    mb.add(band(R, R + 0.022, hw * 0.98, n), iron, smooth=0)
    # pregos/rebites do aro
    for i in range(8):
        a = 2 * math.pi * (i + 0.5) / 8
        mb.add(prim_box(0.05, 0.05, 0.05), trim, M((side * hw * 1.14, (R + 0.03) * math.cos(a), (R + 0.03) * math.sin(a))))
    for i in range(spokes):
        ang = 360.0 * i / spokes
        mb.add(prim_box(0.085, R - felloe - 0.08, 0.09, base=True, taper=(0.75, 0.85)), dark,
               M(r=(ang, 0, 0)) @ M((0, 0.14, 0)))
    add_cyl_x(mb, 0.17, hw * 2.6, dark, (0, 0, 0), n=10, bevel=0.012)
    add_cyl_x(mb, 0.10, hub_out * 2, iron, (side * hub_out * 0.4, 0, 0), n=8)
    mb.add(prim_sphere(0.06, 0.06, 0.06, 6, 3), trim, M((side * (hub_out * 1.4), 0, 0)), smooth=60)
    # cubo: 4 pinos dourados em volta da tampa (marcam a rotação)
    for k in range(4):
        a = math.pi / 2 * k
        mb.add(prim_box(0.05, 0.05, 0.05), trim, M((side * hub_out * 1.05, 0.13 * math.cos(a), 0.13 * math.sin(a))))


def plank_wheel(mb, R, side, hw=0.15, wood='log', plank='log_light', iron='iron', spike='iron', bone='bone'):
    """Roda maciça de pranchas grossas (catapulta): disco poligonal, tala cruzada, aro de ferro e espigões."""
    n = 12
    poly = [(R * math.cos(2 * math.pi * i / n), R * math.sin(2 * math.pi * i / n)) for i in range(n)]
    # extrude axis='x': polígono em (z, y): poly[(z, y)]
    mb.add(prim_extrude([(p[1], p[0]) for p in poly], hw * 2, axis='x'), plank, smooth=0, bevel=0.015)
    mb.add(band(R - 0.02, R + 0.06, hw * 1.05, n), iron, smooth=0, bevel=0.008)
    # talas cruzadas (tábuas presas por pregos) na face externa
    for k in range(3):
        ang = 60.0 * k + 18
        mb.add(prim_box(0.07, R * 1.9, 0.2), 'wood_dark', M((side * (hw + 0.03), 0, 0), (ang, 0, 0)), bevel=0.012)
    # cubo, tampa e espigões radiais no aro
    add_cyl_x(mb, 0.2, hw * 2.8, 'log', (0, 0, 0), n=8, bevel=0.01)
    add_cyl_x(mb, 0.11, 0.2, iron, (side * (hw + 0.1), 0, 0), n=6)
    mb.add(prim_cone(0.09, 0.26, 5), spike, M((side * (hw + 0.24), 0, 0), (0, 0, -side * 90)))
    for i in range(n):
        a = 2 * math.pi * (i + 0.5) / n
        c, s = math.cos(a), math.sin(a)
        ang = math.degrees(a)
        if i % 2 == 0:
            mb.add(prim_cone(0.06, 0.15, 5), spike, M((side * hw * 0.5, R * c, R * s), (ang, 0, 0)))
        else:
            mb.add(prim_box(0.07, 0.07, 0.07), bone, M((side * hw * 1.2, (R - 0.12) * c, (R - 0.12) * s), (ang, 0, 0)))


def tail_strip(w, h, teeth=3, seed=0.0):
    """Faixa de pano com barra recortada em dentes (polígono em x, y com topo em y = 0)."""
    pts = [(-w / 2, 0.0), (w / 2, 0.0), (w / 2, -h * 0.75)]
    for i in range(teeth):
        x = w / 2 - w * (i + 0.5) / teeth
        pts.append((x + w / (2 * teeth) * 0.6, -h * (0.88 + 0.12 * (((i * 5) + int(seed * 10)) % 3) / 2)))
        pts.append((x - w / (2 * teeth) * 0.4, -h * 0.7))
    pts.append((-w / 2, -h * 0.85))
    return pts


def wave(verts, amp, fx, fy=0.0, ph=0.0):
    """Ondula uma extrusão em z (bandeira ao vento)."""
    return [(x, y, z + amp * math.sin(x * fx + y * fy + ph)) for (x, y, z) in verts]


class Xf:
    """Proxy de MeshBuilder que aplica uma matriz T (jogo) a tudo o que é adicionado (peças reutilizáveis)."""

    def __init__(self, mb, T):
        self.mb, self.T = mb, T

    def add(self, prim, mat, m=None, **kw):
        return self.mb.add(prim, mat, self.T if m is None else self.T @ m, **kw)


def cog(poly_r, teeth, hub=0.0, tooth_h=0.18, ratio=0.5):
    """Polígono (x, y) de uma engrenagem: raio do corpo poly_r, dentes de altura tooth_h."""
    pts = []
    n = teeth * 4
    for i in range(n):
        a = 2 * math.pi * i / n
        k = i % 4
        r = poly_r + tooth_h if k in (1, 2) else poly_r
        pts.append((r * math.cos(a), r * math.sin(a)))
    return pts


def chain(mb, p0, p1, links=7, r=0.045, mat='iron'):
    p0, p1 = Vector(p0), Vector(p1)
    d = p1 - p0
    for i in range(links):
        t = (i + 0.5) / links
        p = p0 + d * t
        rot = 0 if i % 2 == 0 else 90
        mb.add(prim_box(r * 1.5, d.length / links * 1.15, r), mat, Matrix.Translation(p) @ orient(d) @ M(r=(0, rot, 0)))


def rock(mb, pos, s, mat='stone', rot=0.0):
    mb.add(prim_sphere(s, s * 0.8, s * 0.9, 7, 4), mat, M(tuple(pos), (rot * 0.5, rot, rot * 0.3)), smooth=0)


def lash(mb, p, axis_dir, r, n=8, mat='rope'):
    """Amarra de corda: anel achatado em torno de uma tora."""
    d = Vector(axis_dir).normalized()
    mb.add(prim_cyl(r, r, 0.07, n, base=False), mat, Matrix.Translation(Vector(p)) @ orient(d), smooth=30)
