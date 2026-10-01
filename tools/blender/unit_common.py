"""
unit_common.py — helpers dos humanoides de rig plana (Mago, Necromante, Esqueleto, Sapador, Incendiário).
Coordenadas do jogo (x direita, y cima, +z frente), como `common.py`.
"""
import os
import math
from mathutils import Vector, Matrix
import common as C
from common import (MeshBuilder, M, prim_box, prim_rings, ring_h, prim_cyl, prim_cone,  # noqa: F401
                    prim_sphere, prim_extrude, limb_rings, bezier)


def orient(d):
    return Vector((0, 1, 0)).rotation_difference(Vector(d).normalized()).to_matrix().to_4x4()


def cloth_panel(top_l, top_r, bot_l, bot_r, nx=5, ny=4, thick=0.03, bulge=(0, 0, 0),
                wave=0.03, jag=0.04, wave_k=3.0):
    """Painel de tecido (slab fino) entre 4 cantos, com dobras e barra irregular."""
    V = Vector
    tl, tr, bl, br = V(top_l), V(top_r), V(bot_l), V(bot_r)
    b = V(bulge)
    front, back = [], []
    for j in range(ny + 1):
        v = j / ny
        for i in range(nx + 1):
            u = i / nx
            p = (tl.lerp(tr, u)).lerp(bl.lerp(br, u), v)
            p = p + b * math.sin(math.pi * u) * v
            p.z += math.sin(u * math.pi * wave_k) * wave * v
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


def tube(mb, pts, radii, mat, n=8, smooth=60, bevel=0.0, cap=True, **kw):
    return mb.add(prim_rings(limb_rings(pts, radii, n), cap0=cap, cap1=cap), mat, smooth=smooth, bevel=bevel, **kw)


def ring_band(mb, p, d, r, h, mat, n=10, smooth=30):
    """Anel (cinta) de raio r e altura h centrado em p, eixo d."""
    mb.add(prim_cyl(r, r, h, n, base=False), mat, Matrix.Translation(Vector(p)) @ orient(d), smooth=smooth)


def fist(mb, T, s, skin, glove=None, knuckle=None):
    """Mão fechada forte. T = matriz do jogo (origem no pulso, +y = direção do antebraço→dedos,
    +z = frente da palma/dedos). s = escala (1 = mão humana grande)."""
    mb.add(prim_box(0.12 * s, 0.13 * s, 0.14 * s, taper=(0.92, 0.85)), glove or skin, T @ M((0, 0.075 * s, 0.0)), bevel=0.012 * s)
    for k in range(4):  # dedos dobrados (nós) na frente
        mb.add(prim_box(0.026 * s, 0.05 * s, 0.045 * s), knuckle or glove or skin, T @ M(((k - 1.5) * 0.03 * s, 0.075 * s, 0.085 * s)), bevel=0.005 * s)
    mb.add(prim_box(0.032 * s, 0.05 * s, 0.05 * s), glove or skin, T @ M((0.075 * s, 0.07 * s, 0.045 * s), (0, 0, -20)))  # polegar


def finish_unit(name, glb, atlas_name, root, parts, weights, team_default, args, tex=512, cam_h=1.9,
                focus=None, game_dist=None):
    """UV atlas -> bake -> materiais -> export -> renders. Devolve stats."""
    import bpy
    bpy.context.view_layer.update()
    C.uv_atlas(parts, weights=weights, margin=0.006)
    img = C.bake_atlas(parts, atlas_name, tex, samples=int(os.environ.get('BAKE_SAMPLES', 32)), margin=4)
    C.finalize_materials(parts, img, team_default=team_default,
                         out_png=os.path.join(C.BUILD_DIR, atlas_name + '.png'))
    out = os.path.join(C.OUT_MODELS, glb)
    C.export_glb(root, out)
    st = C.stats(root, out)
    print('STATS', name, st)
    if '--no-render' not in args:
        rig = C.RenderRig(root, name, res=int(os.environ.get('RENDER_RES', 800)), samples=24, focus_h=focus)
        rig.render('34', (1.0, 0.95, 1.0), 30)
        rig.render('front', (0.0, 0.25, 1.0), 30)
        rig.render('back', (-0.6, 0.6, -1.0), 30)
        rig.render('side', (1.0, 0.2, 0.0), 30)
        rig.render('game', (45, 44, 45), 24, dist=game_dist or 78 / cam_h)
        C.set_team_color('#c0392b')
        rig.render('34_vermelho', (1.0, 0.95, 1.0), 30)
        C.set_team_color(team_default)
    return st
