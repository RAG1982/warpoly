"""
air_common.py — helpers das unidades aéreas (F4-06 -> F7-00b lote 1): Planador, Balão de Guerra,
Cavaleiro Grifo, Serpe de Guerra. Coordenadas do jogo (x direita, y cima, +z frente), como `common.py`.

Rig (nomes lidos por `ModelFactory.rebindUserData` / `UnitAnimator.applyAir`):
  Raiz (origem na base; a simulação aplica `flyHeight`)
  └─ Torso   corpo todo (balança em y e inclina em x); pivô na origem
     ├─ Head          pivô na cabeça
     ├─ WingL/WingR   pivôs na raiz das asas (batem em z)
     └─ Rotor         (balão) hélice, gira em z
"""
import math
from mathutils import Vector, Matrix
import common as C
from common import (MeshBuilder, M, prim_box, prim_rings, ring_h, prim_cyl, prim_cone,  # noqa: F401
                    prim_sphere, prim_extrude, limb_rings, bezier)
from bld_common import beam, tube, log, orient, xf  # noqa: F401


def fan_membrane(center, pts, thick=0.03):
    """Membrana em leque (triângulos a partir de `center`) com espessura: polígono fechado [center, p0..pn],
    todos pontos 3D do jogo (a membrana pode ter caimento em y)."""
    loop = [Vector(center)] + [Vector(p) for p in pts]
    n = len(loop)
    h = Vector((0, thick / 2, 0))
    top = [tuple(p + h) for p in loop]
    bot = [tuple(p - h) for p in loop]
    verts = top + bot
    faces = []
    for i in range(1, n - 1):
        faces.append((0, i, i + 1))
        faces.append((n, n + i + 1, n + i))
    for i in range(n):
        j = (i + 1) % n
        faces.append((i, j, n + j, n + i))
    return verts, faces


def cloth_wing(span, c0, c1, le0=0.0, le1=0.0, dih=0.12, camber=0.06, nu=6, nv=3, scallop=0.0, thick=0.03,
               bow=0.0):
    """Asa de pano (slab fino): +x para fora (espelhe com `sx`). Corda c0 (raiz) -> c1 (ponta), bordo de ataque
    em z = le(u); diedro `dih` (sobe com a envergadura), curvatura `camber`, bordo de fuga recortado em
    `scallop` entre as nervuras. Devolve (verts, faces)."""
    top, bot = [], []
    for j in range(nv + 1):
        v = j / nv
        for i in range(nu + 1):
            u = i / nu
            c = c0 + (c1 - c0) * u
            le = le0 + (le1 - le0) * u
            z = le - c * v
            if j == nv:  # recorte do bordo de fuga entre nervuras
                z += scallop * (1 if i % 2 else 0) * c
            y = dih * u * u + camber * math.sin(math.pi * v) * (1 - 0.4 * u) + bow * (1 - u) * 0
            x = span * u
            top.append((x, y + thick / 2, z))
            bot.append((x, y - thick / 2, z))
    nxt = nu + 1
    verts = top + bot
    n = len(top)
    faces = []
    for j in range(nv):
        for i in range(nu):
            a = j * nxt + i
            faces.append((a, a + 1, a + nxt + 1, a + nxt))
            faces.append((n + a, n + a + nxt, n + a + nxt + 1, n + a + 1))
    # bordas (anel externo do retângulo de índices)
    border = [i for i in range(nxt)] + [j * nxt + nu for j in range(1, nv + 1)] + \
             [nv * nxt + i for i in range(nu - 1, -1, -1)] + [j * nxt for j in range(nv - 1, 0, -1)]
    for k in range(len(border)):
        a, c = border[k], border[(k + 1) % len(border)]
        faces.append((a, n + a, n + c, c))
    return verts, faces


def mirror_x(prim, sx):
    v, f = prim
    return [(sx * x, y, z) for (x, y, z) in v], f


def feather(length, width, thick=0.025, curl=0.0, taper=0.55, n=3):
    """Pena: lâmina estreita (+x do pivô até a ponta), levemente curva para baixo; ponta afilada."""
    verts, faces = [], []
    for i in range(n + 1):
        t = i / n
        w = width * (1 - taper * t * t)
        x = length * t
        y = -curl * t * t
        for (dy, dz) in ((thick / 2, -w / 2), (thick / 2, w / 2), (-thick / 2, w / 2), (-thick / 2, -w / 2)):
            verts.append((x, y + dy, dz))
    for i in range(n):
        a, b = i * 4, (i + 1) * 4
        for k in range(4):
            k2 = (k + 1) % 4
            faces.append((a + k, a + k2, b + k2, b + k))
    faces.append((3, 2, 1, 0))
    last = n * 4
    faces.append((last, last + 1, last + 2, last + 3))
    return verts, faces


def eyes(mb, T, sx_off, y, z, r, mat='eye', pupil='pupil'):
    for sx in (-1, 1):
        mb.add(prim_sphere(r, r, r * 0.6, 6, 4), mat, T @ M((sx * sx_off, y, z)), smooth=70)
        mb.add(prim_sphere(r * 0.5, r * 0.55, r * 0.4, 5, 3), pupil, T @ M((sx * sx_off, y, z + r * 0.3)), smooth=70)


def finish_air(name, glb, atlas_name, root, parts, weights, team_default, args, tex=512, game_dist=24.0, focus=None):
    """UV atlas -> bake -> materiais -> export -> renders (aéreos: câmera de jogo mais próxima)."""
    import unit_common as U
    return U.finish_unit(name, glb, atlas_name, root, parts, weights, team_default, args, tex=tex,
                         focus=focus, game_dist=game_dist)


# paleta base (cada script soma as suas cores)
def base_palette():
    return {
        'wood': dict(base='#85592f', var='#6a4526', var_scale=2.0, fine=0.08, pattern='planks', mapping='box',
                     pw=1.6, ph=0.2, mortar='#3a2615', top=0.15, edge='#b98a55', edge_amt=0.45, edge_r=0.02,
                     ao=(0.5, 0.65)),
        'wood_dark': dict(base='#5a3c22', var='#45301a', var_scale=2.5, fine=0.09, top=0.15, edge='#9a7a52',
                          edge_amt=0.45, edge_r=0.02, ao=(0.4, 0.6)),
        'wood_light': dict(base='#a87a44', var='#8a6030', var_scale=2.2, fine=0.08, top=0.2, edge='#d8b07a',
                           edge_amt=0.4, edge_r=0.02, ao=(0.4, 0.55)),
        'iron': dict(base='#4a4d55', var='#383b42', var_scale=3.0, fine=0.08, top=0.3, edge='#b9bfca', edge_amt=0.8,
                     edge_r=0.015, ao=(0.3, 0.5)),
        'steel': dict(base='#9aa1ad', var='#7b818d', var_scale=4.0, fine=0.06, top=0.4, edge='#eef2f8', edge_amt=0.8,
                      edge_r=0.012, ao=(0.25, 0.4)),
        'gold': dict(base='#d9a63a', var='#b98524', var_scale=4.0, fine=0.06, top=0.3, edge='#fff0b8', edge_amt=0.8,
                     edge_r=0.015, ao=(0.3, 0.4)),
        'rope': dict(base='#b49865', var='#8a7040', var_scale=12.0, fine=0.12, top=0.2),
        'leather': dict(base='#7a4a26', var='#5c3419', var_scale=6.0, fine=0.12, top=0.2, edge='#b07a48',
                        edge_amt=0.5, edge_r=0.02, ao=(0.25, 0.6)),
        'leather_dark': dict(base='#4a2e18', var='#35210f', var_scale=6.0, fine=0.12, top=0.2, edge='#8a5e36',
                             edge_amt=0.4, edge_r=0.02, ao=(0.25, 0.6)),
        'dark': dict(base='#1f1b22', var='#15131a'),
        'pupil': dict(base='#15121a', var='#0c0a10'),
        'eye': dict(base='#f0e8c8', var='#d8cfa8', var_scale=8.0, top=0.3),
        'team': dict(base='#bab2a6', var='#a0988c', var_scale=2.0, fine=0.08, top=0.2, edge='#dcd6cc',
                     edge_amt=0.3, edge_r=0.03, ao=(0.8, 0.6), team=True),
    }
