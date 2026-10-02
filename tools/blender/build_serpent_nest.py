"""
build_serpent_nest.py — Ninho das Serpes orc (tipo interno `serpent_nest`) gerado 100% por script.

Uso:
  blender -b --factory-startup --python tools/blender/build_serpent_nest.py -- [--no-render]

Saída (public/models/serpent_nest.glb), coordenadas do jogo, origem no centro da base, frente = +Z:
  SerpentNest (raiz)
  ├─ Static_Mesh       montículo de basalto em anel de blocos, cratera de cinzas com leito de ossos e couro,
  │                    ovos verdes brilhantes, presas gigantes em anel, covil em arco de costelas (frente),
  │                    esqueleto de serpe, crânios-totem e peles (Atlas; ovos com brilho pintado)
  ├─ Anim_Banners      estandartes esfarrapados (material TeamColor)
  ├─ Socket_UnitSpawn  saída das unidades (frente do covil)
  └─ Socket_Rally      ponto de reunião padrão
Pegada ~7 (raio de colisão 3,4), altura ~5,5. 2 draw calls.
"""
import os
import sys
import math

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
from mathutils import Vector, Matrix  # noqa: E402
import common as C  # noqa: E402
from common import (MeshBuilder, M, prim_box, prim_rings, ring_h, prim_cyl, prim_cone,  # noqa: E402
                    prim_sphere, prim_extrude, limb_rings, bezier)
from bld_common import beam, tube, log, skull, finish_building  # noqa: E402
import build_ogre_den as D  # noqa: E402  (paleta de rocha, couro, osso, ferro)

TEAM_DEFAULT = '#b81d24'
Y0 = 0.30

PALETTE = dict(D.PALETTE)
PALETTE.update({
    'basalt': dict(D.ROCK, base='#3b3836', var='#262422', pw=1.4, ph=0.7, brick_tint='#4d4844'),
    'ash': dict(base='#5a524b', var='#3a342f', var_scale=2.5, var_amt=0.8, fine=0.16, top=0.2, ao=(1.2, 0.8)),
    'egg': dict(base='#3fc46e', var='#1f8a4a', var_scale=7.0, var_amt=0.8, fine=0.05, top=0.4, emit_boost=0.9,
                edge='#c8ffd8', edge_amt=0.4, edge_r=0.03, ao=(0.3, 0.4)),
    'egg_glow': dict(base='#9affb8', var='#4ae27a', var_scale=4.0, emit_boost=1.4),
    'scale': dict(base='#2a6a3a', var='#14452a', var_scale=3.0, var_amt=0.8, fine=0.1, top=0.35, ao=(0.5, 0.5)),
    'sinew': dict(base='#a68a58', var='#7e6638', var_scale=14.0, var_amt=0.9, fine=0.14, top=0.25, ao=(0.3, 0.5)),
    'tunnel': dict(base='#0c0a0a', var='#050404'),
    'moss': dict(base='#4a6a34', var='#2e4a1e', var_scale=6.0, var_amt=0.8, fine=0.14, top=0.3, ao=(0.3, 0.5)),
})


def polar(r, ang_deg):
    a = math.radians(ang_deg)
    return math.sin(a) * r, math.cos(a) * r   # ang 0 = +Z


def build_base(mats, root):
    mb = MeshBuilder('Base')
    mb.add(prim_cyl(3.55, 3.4, Y0, 14, base=True), 'basalt', bevel=0.07, smooth=0)
    mb.add(prim_cyl(3.3, 3.3, 0.06, 14, base=True), 'ash', M((0, Y0, 0)), smooth=0)
    return mb.build(mats, parent=root)


def build_mound(mats, root):
    """Anel de rochas (muralha da cratera) com abertura frontal para o covil."""
    mb = MeshBuilder('Mound')
    rocks = []
    n = 15
    for k in range(n):
        a = 360 * k / n + 8 * math.sin(k * 2.3)
        if abs(((a + 180) % 360) - 180) < 38:   # abertura do covil na frente
            continue
        r = 2.75 + 0.2 * math.sin(k * 1.7)
        h = 1.5 + 0.9 * (0.5 + 0.5 * math.sin(k * 2.1 + 1.0))
        if abs(((a + 180) % 360) - 180) > 140:   # atrás, mais alto
            h += 0.5
        x, z = polar(r, a)
        w = 0.9 + 0.25 * math.sin(k * 3.3)
        T = M((x, Y0, z), (0, a, 0))
        # bloco de basalto afunilado (pilar de rocha) + capuz irregular
        mb.add(prim_box(w * 1.1, h, w * 0.9, taper=(0.65, 0.6), shift=(0.1 * math.sin(k), 0.05), base=True), 'basalt', T, bevel=0.08)
        mb.add(prim_sphere(w * 0.45, 0.3, w * 0.4, 6, 3, y_min=0.0), 'rock_plain', T @ M((0.05, h - 0.02, 0.0)), smooth=0)
        rocks.append((x, z, a, h, w))
    # leito interno de rocha em rampa (cratera): disco côncavo
    mb.add(prim_cyl(2.7, 2.2, 0.5, 14, base=True), 'basalt', M((0, Y0, 0)), bevel=0.04, smooth=0)
    mb.add(prim_sphere(2.0, 0.28, 2.0, 12, 3, y_min=-1.0, y_max=0.0), 'ash', M((0, Y0 + 0.62, 0)), smooth=45)
    # musgo e fendas luminosas nas rochas (ovo-lava): pequenas lascas verdes
    for (x, z, a, h, w) in rocks[::3]:
        mb.add(prim_box(0.12, 0.5, 0.05), 'egg_glow', M((x - math.sin(math.radians(a)) * 0.2, Y0 + h * 0.4, z - math.cos(math.radians(a)) * 0.2), (0, a, 15)))
    return mb.build(mats, parent=root)


def build_den(mats, root):
    """Covil na frente: arco de costelas gigantes sobre túnel negro, degraus de rocha, crânios-totem."""
    mb = MeshBuilder('Den')
    zf = 3.05
    # túnel escuro
    mb.add(prim_extrude([(-1.0, 0.0), (1.0, 0.0), (1.0, 1.5), (0.5, 2.0), (-0.5, 2.0), (-1.0, 1.5)], 0.6, axis='z'),
           'tunnel', M((0, Y0, zf - 0.4)))
    # costelas em arco (3 pares): tubos curvos de osso
    for k, z in enumerate((zf - 0.1, zf + 0.15, zf + 0.4)):
        for sx in (-1, 1):
            pts = bezier((sx * 1.15, Y0, z), (sx * 1.35, Y0 + 2.4 + 0.1 * k, z + 0.0), (sx * 0.0, Y0 + 2.7 + 0.15 * k, z), 6)
            tube(mb, pts, [0.16 - 0.015 * k, 0.15, 0.13, 0.12, 0.11, 0.1, 0.09], 'bone', n=6, smooth=45)
        mb.add(prim_sphere(0.14, 0.14, 0.14, 6, 3), 'bone', M((0, Y0 + 2.72 + 0.15 * k, z)), smooth=60)
    # crânio de ogro-totem no ápice
    skull(mb, M((0, Y0 + 3.2, zf + 0.5), (0, 0, 0)), 0.65, 'bone')
    # degraus de rocha e tapete de couro
    mb.add(prim_box(2.4, 0.16, 0.9, taper=(0.95, 0.9), base=True), 'basalt', M((0, Y0, zf + 0.7)), bevel=0.04)
    mb.add(prim_box(2.0, 0.12, 0.6, base=True), 'basalt', M((0, Y0 + 0.14, zf + 0.55)), bevel=0.04)
    mb.add(prim_box(1.1, 0.04, 1.4), 'hide', M((0, Y0 + 0.2, zf + 0.9)))
    # totens de crânio nos dois lados: poste de osso + crânios empilhados
    for sx in (-1, 1):
        x = sx * 1.95
        log(mb, (x, Y0, zf + 0.5), (x, Y0 + 2.5, zf + 0.5), 0.1, 'log', n=6)
        skull(mb, M((x, Y0 + 2.2, zf + 0.5), (0, sx * -20, 0)), 0.42, 'bone')
        skull(mb, M((x, Y0 + 1.5, zf + 0.5), (0, sx * -35, 0)), 0.3, 'bone')
        mb.add(prim_cone(0.1, 0.4, 5), 'iron', M((x, Y0 + 2.5, zf + 0.5)))
    return mb.build(mats, parent=root)


def build_nest(mats, root):
    """Leito de ossos, couro e tendão com 5 ovos verdes brilhantes; esqueleto de serpe; presas em anel."""
    mb = MeshBuilder('Nest')
    yb = Y0 + 0.5
    # leito: cúpula achatada de couro/tendão com ossos e galhos
    mb.add(prim_sphere(1.75, 0.45, 1.75, 12, 4, y_min=0.0), 'hide_dark', M((0, yb, 0)), smooth=50)
    for k in range(26):
        a = 2 * math.pi * k / 26
        r = 1.45 + 0.35 * math.sin(k * 2.7)
        p0 = Vector((math.cos(a) * r, yb + 0.28 + 0.12 * (k % 3), math.sin(a) * r))
        p1 = Vector((math.cos(a + 0.6) * (r - 0.1), yb + 0.34 + 0.1 * ((k + 1) % 3), math.sin(a + 0.6) * (r - 0.1)))
        beam(mb, tuple(p0), tuple(p1), 0.09, 0.08, 'bone' if k % 3 else 'sinew')
    # ovos: ellipsoides verdes com manchas e halos de brilho
    eggs = [(-0.55, 0.15, 1.0, 0), (0.45, 0.3, 1.1, 20), (0.0, -0.55, 0.95, -15), (-0.2, 0.7, 0.75, 10), (0.7, -0.4, 0.8, 30)]
    for (x, z, s, rz) in eggs:
        mb.add(prim_sphere(0.34 * s, 0.46 * s, 0.34 * s, 10, 6), 'egg', M((x, yb + 0.5 * s, z), (6, 0, rz)), smooth=80)
        for k in range(5):
            a = 2 * math.pi * k / 5
            mb.add(prim_sphere(0.06 * s, 0.05 * s, 0.03 * s, 5, 3), 'egg_glow',
                   M((x + math.cos(a) * 0.3 * s, yb + 0.6 * s + 0.14 * math.sin(k * 2.0) * s, z + math.sin(a) * 0.3 * s), (0, -math.degrees(a), 0)), smooth=60)
    # ovo quebrado de onde sai uma cauda
    mb.add(prim_sphere(0.3, 0.2, 0.3, 8, 3, y_min=0.0), 'egg', M((-1.0, yb + 0.2, -0.6), (0, 0, 14)), smooth=70)
    # presas gigantes em anel (borda interna da cratera)
    for k in range(7):
        a = 360 * k / 7 + 20
        if abs(((a + 180) % 360) - 180) < 40:
            continue
        x, z = polar(2.05, a)
        mb.add(prim_cone(0.2, 1.7 + 0.3 * math.sin(k * 2.0), 6), 'bone', M((x, Y0 + 0.45, z), (-math.sin(math.radians(a)) * 0.0 + 14 * math.cos(math.radians(a)) * 0.0 + 18 * math.cos(math.radians(a)), 0, -18 * math.sin(math.radians(a)))), smooth=40)
    # esqueleto de serpe estirado ao lado esquerdo do pátio: espinha de vértebras e costelas
    pts = bezier((-3.0, Y0 + 0.1, 1.7), (-2.4, Y0 + 0.1, 2.4), (-1.3, Y0 + 0.1, 2.5), 8)
    for i, p in enumerate(pts):
        mb.add(prim_sphere(0.1, 0.09, 0.1, 6, 3), 'bone', M(p), smooth=60)
        if i % 2 == 0 and 0 < i < 8:
            for sz in (-1, 1):
                mb.add(prim_cone(0.03, 0.5, 4), 'bone', M((p[0], p[1] + 0.15, p[2] + sz * 0.1), (sz * 55, 0, 0)))
    skull(mb, M((-3.1, Y0 + 0.28, 1.55), (0, 120, 0)), 0.5, 'bone')
    # peles de escama penduradas e barris de ovos de reserva
    for sx in (-1, 1):
        mb.add(prim_box(0.7, 0.9, 0.05, taper=(0.8, 1.0)), 'scale', M((sx * 3.15, Y0 + 1.6, -0.8), (0, sx * 80, 0)), bevel=0.0)
    return mb.build(mats, parent=root)


def build_banners(mats, root):
    mb = MeshBuilder('Anim_Banners')
    # estandartes esfarrapados em hastes de osso/madeira nas rochas dos flancos e do fundo
    for (x, z, ry) in ((-3.0, 0.9, 90), (3.0, 0.9, -90), (0.0, -3.2, 180)):
        T = M((x, Y0 + 3.9, z), (0, ry, 0))
        poly = [(-0.38, 0.0), (0.38, 0.0), (0.38, -0.95), (0.22, -0.7), (0.0, -1.1), (-0.22, -0.72), (-0.38, -1.0)]
        verts, faces = prim_extrude(poly, 0.03, axis='z')
        verts = [(px, py, pz + 0.06 * math.sin(py * 6.0 + px * 3)) for (px, py, pz) in verts]
        mb.add((verts, faces), 'team', T, smooth=40)
    return mb.build(mats, parent=root)


def build_poles(mats, root):
    mb = MeshBuilder('Poles')
    for (x, z) in ((-3.0, 0.9), (3.0, 0.9), (0.0, -3.2)):
        log(mb, (x, Y0 + 0.4, z), (x, Y0 + 4.2, z), 0.07, 'log', n=6)
        mb.add(prim_cone(0.09, 0.3, 5), 'iron', M((x, Y0 + 4.2, z)))
        mb.add(prim_box(0.9, 0.06, 0.06), 'bone', M((x, Y0 + 3.92, z), (0, 0, 0)) @ M(r=(0, 0, 0)))
    return mb.build(mats, parent=root)


def main():
    args = C.script_args()
    C.reset_scene()
    mats = C.make_paint_set(PALETTE)
    root = C.make_empty('SerpentNest')
    base = build_base(mats, root)
    mound = build_mound(mats, root)
    den = build_den(mats, root)
    nest = build_nest(mats, root)
    poles = build_poles(mats, root)
    banners = build_banners(mats, root)
    finish_building(root, 'serpent_nest', 'serpent_nest.glb', 'serpent_nest_atlas', [base, mound, den, nest, poles], banners,
                    {'Base': 0.6, 'Mound': 1.0, 'Den': 1.1, 'Nest': 1.2, 'Poles': 0.5, 'Anim_Banners': 1.0},
                    TEAM_DEFAULT, args, spawn=(0, 0, 5.2), rally=(0, 0, 7.0), game_dist=78)


if __name__ == '__main__':
    main()
