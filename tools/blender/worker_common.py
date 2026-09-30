"""
worker_common.py — helpers compartilhados por build_villager.py e build_peon.py
(trabalhadores humano e orc). Só geometria/pintura; nada de nós do jogo.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C  # noqa: E402
from common import (prim_rings, limb_rings, prim_box, prim_sphere, prim_cyl, prim_cone,  # noqa: E402
                    M, ring_h)
import mathutils  # noqa: E402
from mathutils import Vector, Matrix  # noqa: E402


def basis(c, d, hint=(0, 1, 0)):
    """Matriz do jogo: eixo x = d, origem c (para orientar tijolinhas, pontos de costura, etc.)."""
    x = Vector(d).normalized()
    h = Vector(hint)
    z = x.cross(h)
    if z.length < 1e-4:
        z = x.cross(Vector((1, 0, 0)))
    z.normalize()
    y = z.cross(x)
    return Matrix(((x.x, y.x, z.x, c[0]), (x.y, y.y, z.y, c[1]), (x.z, y.z, z.z, c[2]), (0, 0, 0, 1)))


def tube(mb, path, radii, mat, n=8, smooth=70, cap0=True, cap1=True, up=(0, 0, 1), bevel=0.0, m=None):
    mb.add(prim_rings(limb_rings(path, radii, n, up), cap0, cap1), mat, m, smooth=smooth, bevel=bevel)


def lerp3(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


def stitches(mb, a, b, n, mat='thread', size=(0.034, 0.011, 0.011), hint=(0, 0, 1)):
    """Pontos de costura: quadrinhos (2 tris) voltados para `hint`, ao longo de a->b."""
    d = Vector(b) - Vector(a)
    dn = d.normalized()
    nrm = Vector(hint) - dn * dn.dot(Vector(hint))
    nrm.normalize()
    yax = nrm.cross(dn)
    hx, hy = size[0] / 2, size[1] * 0.6
    quad = ([(-hx, -hy, 0), (hx, -hy, 0), (hx, hy, 0), (-hx, hy, 0)], [(0, 1, 2, 3)])
    for i in range(n):
        t = (i + 0.5) / n
        c = Vector(lerp3(a, b, t)) + nrm * 0.004
        m = Matrix(((dn.x, yax.x, nrm.x, c.x), (dn.y, yax.y, nrm.y, c.y), (dn.z, yax.z, nrm.z, c.z), (0, 0, 0, 1)))
        pid = mb.add(quad, mat, m)
        want = C.g(nrm)  # normal desejada (espaço Blender): garante a face voltada para `hint`
        for f in mb.bm.faces:
            if f[mb.part] == pid and f.normal.dot(want) < 0:
                f.normal_flip()


def rivets(mb, pts, mat='brass', r=0.018, hint=None):
    for p in pts:
        mb.add(prim_sphere(r, r, r * 0.8, 5, 2), mat, M(p), smooth=60)


def cloth_panel(top_l, top_r, bot_l, bot_r, nx=5, ny=4, thick=0.03, bulge=(0, 0, 0),
                wave=0.03, jag=0.04):
    """Painel de tecido (slab fino) entre 4 cantos, com dobras e barra irregular."""
    V = mathutils.Vector
    tl, tr, bl, br = V(top_l), V(top_r), V(bot_l), V(bot_r)
    b = V(bulge)
    front, back = [], []
    for j in range(ny + 1):
        v = j / ny
        for i in range(nx + 1):
            u = i / nx
            p = (tl.lerp(tr, u)).lerp(bl.lerp(br, u), v)
            p = p + b * math.sin(math.pi * u) * v
            p.z += math.sin(u * math.pi * 3.0) * wave * v
            if j == ny:
                p.y += jag * (1 if i % 2 else -1)
            front.append(tuple(p))
            back.append(tuple(p + V((0, 0, -thick))))
    verts = front + back
    n = (nx + 1) * (ny + 1)
    faces = []
    for j in range(ny):
        for i in range(nx):
            a = j * (nx + 1) + i
            faces.append((a, a + 1, a + nx + 2, a + nx + 1))
            faces.append((n + a, n + a + nx + 1, n + a + nx + 2, n + a + 1))

    def idx(i, j):
        return j * (nx + 1) + i
    border = [idx(i, 0) for i in range(nx + 1)] + [idx(nx, j) for j in range(1, ny + 1)] + \
             [idx(i, ny) for i in range(nx - 1, -1, -1)] + [idx(0, j) for j in range(ny - 1, 0, -1)]
    for k in range(len(border)):
        a, c = border[k], border[(k + 1) % len(border)]
        faces.append((a, c, n + c, n + a))
    return verts, faces


def extrude_tapered(poly, depth, edge_fn, axis='x'):
    """Extruda um polígono e afina a espessura conforme edge_fn(a, b)->fator (0..1) — gumes."""
    verts, faces = C.prim_extrude(poly, depth, axis=axis)
    out = []
    for (x, y, z) in verts:
        if axis == 'x':
            k = edge_fn(z, y)
            out.append((x * k, y, z))
        else:
            k = edge_fn(x, y)
            out.append((x, y, z * k))
    return out, faces


def hide_for_render(objs, hidden):
    for o in objs:
        o.hide_render = hidden


def install_bevel_budget(min_side=0.06):
    """Não chanfra primitivas com o menor lado < min_side (economiza triângulos em peças pequenas)."""
    orig = C.MeshBuilder.add

    def add(self, prim, mat, m=None, bevel=0.0, **kw):
        if bevel > 0:
            vs = prim[0]
            ext = sorted(max(v[k] for v in vs) - min(v[k] for v in vs) for k in range(3))
            if ext[0] < min_side or bevel > ext[0] * 0.4:
                bevel = 0.0
        return orig(self, prim, mat, m, bevel=bevel, **kw)
    C.MeshBuilder.add = add
