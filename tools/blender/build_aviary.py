"""
build_aviary.py — Aviário de Grifos humano (tipo interno `aviary`) gerado 100% por script.

Uso:
  blender -b --factory-startup --python tools/blender/build_aviary.py -- [--no-render]

Saída (public/models/aviary.glb), coordenadas do jogo, origem no centro da base, frente = +Z:
  Aviary (raiz)
  ├─ Static_Mesh       plinto circular, torre de pedra com janelas em arco e portão, escada externa em espiral,
  │                    plataforma de pouso de madeira com parapeito, ninho de gravetos com ovos, dossel azul,
  │                    poleiros, grifo de pedra no portão, cochos e fardos (Atlas)
  ├─ Anim_Banners      estandartes e flâmulas (material TeamColor)
  ├─ Socket_UnitSpawn  saída das unidades (frente do portão)
  └─ Socket_Rally      ponto de reunião padrão
Pegada ~7 (raio de colisão 3,4), altura ~8. 2 draw calls.
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
from bld_common import beam, tube, log, finish_building, orient  # noqa: E402
import build_stable as S  # noqa: E402  (reaproveita as paletas de pedra, madeira e telhado azul)

TEAM_DEFAULT = '#3a66d6'
Y0 = 0.30
TR0, TR1 = 1.95, 1.6      # raio da torre (base, topo)
TOWER_TOP = 5.0
DECK_Y = 5.0
DECK_R = 2.85

PALETTE = dict(S.PALETTE)
PALETTE.update({
    'stone_cyl': dict(S.STONE, mapping='cyl', cyl_radius=1.8, pw=0.55, ph=0.3),
    'straw': dict(base='#d8b452', var='#a8872a', var_scale=10.0, var_amt=0.9, fine=0.16, top=0.3, ao=(0.5, 0.6)),
    'twig': dict(base='#6d5030', var='#4a351e', var_scale=8.0, var_amt=0.8, fine=0.12, top=0.3, ao=(0.4, 0.6)),
    'egg': dict(base='#f0e8d0', var='#b8d4b0', var_scale=6.0, var_amt=0.5, top=0.4, ao=(0.3, 0.5)),
    'feather': dict(base='#f2ede0', var='#cfc7b0', var_scale=12.0, var_amt=0.7, fine=0.08, top=0.45),
    'gold_stone': dict(base='#cdb77a', var='#a89150', var_scale=3.0, fine=0.08, top=0.35, edge='#f4e6b0', edge_amt=0.6,
                       edge_r=0.03, ao=(0.5, 0.5)),
    'leather_dark': dict(base='#4a2e18', var='#35210f', var_scale=6.0, fine=0.12, top=0.2, ao=(0.25, 0.6)),
    'paint_red': dict(base='#a0231a', var='#781710', var_scale=6.0, fine=0.1, top=0.2),
    'glass': dict(base='#7fb4e0', var='#4f86c0', var_scale=10.0, emit_boost=1.1, top=0.3),
})


def arch_poly(w, h, y0=0.0, segs=6):
    r = w / 2
    spring = y0 + h - r
    pts = [(r, y0)]
    for i in range(segs + 1):
        a = math.pi * i / segs
        pts.append((r * math.cos(a), spring + r * math.sin(a)))
    pts.append((-r, y0))
    return pts


def radius_at(y):
    t = (y - Y0) / (TOWER_TOP - Y0)
    return TR0 + (TR1 - TR0) * max(0.0, min(1.0, t))


def polar(r, ang_deg):
    a = math.radians(ang_deg)
    return math.sin(a) * r, math.cos(a) * r   # ang 0 = +Z (frente)


def half_shell(profile, a0, a1, thick, nseg=12):
    """Casca (com espessura) que cobre o arco a0..a1 (graus, 0 = +Z) com perfil [(y, r)] de baixo para cima."""
    outer, inner = [], []
    for (y, r) in profile:
        o, i = [], []
        for j in range(nseg + 1):
            a = a0 + (a1 - a0) * j / nseg
            x, z = polar(r, a)
            xi, zi = polar(max(0.02, r - thick), a)
            o.append((x, y, z))
            i.append((xi, y - thick * 0.6, zi))
        outer.append(o)
        inner.append(i)
    nr, n = len(profile), nseg + 1
    verts = [p for ring in outer for p in ring] + [p for ring in inner for p in ring]
    off = nr * n
    faces = []
    for r in range(nr - 1):
        for j in range(nseg):
            a, b = r * n + j, (r + 1) * n + j
            faces.append((a, a + 1, b + 1, b))
            faces.append((off + a, off + b, off + b + 1, off + a + 1))
    for r in range(nr - 1):          # bordas laterais
        for j in (0, n - 1):
            a, b = r * n + j, (r + 1) * n + j
            faces.append((a, b, off + b, off + a))
    for j in range(nseg):            # borda inferior e topo
        a = j
        faces.append((a, off + a, off + a + 1, a + 1))
        t = (nr - 1) * n + j
        faces.append((t, t + 1, off + t + 1, off + t))
    return verts, faces


def build_base(mats, root):
    mb = MeshBuilder('Base')
    mb.add(prim_cyl(3.55, 3.4, Y0, 16, base=True), 'stone_dark', bevel=0.05, smooth=0)
    mb.add(prim_cyl(3.3, 3.3, 0.05, 16, base=True), 'paving', M((0, Y0, 0)))
    # rampa/degraus na frente do portão
    mb.add(prim_box(2.4, 0.14, 0.7, base=True), 'stone_dark', M((0, Y0, 2.6)), bevel=0.025)
    mb.add(prim_box(2.1, 0.12, 0.5, base=True), 'stone_light', M((0, Y0 + 0.14, 2.4)), bevel=0.025)
    return mb.build(mats, parent=root)


def build_tower(mats, root):
    mb = MeshBuilder('Tower')
    # corpo de pedra: tronco de cone, 16 faces, com cintas de pedra clara
    rings = [ring_h(Y0, TR0, TR0, 16), ring_h(2.6, 1.78, 1.78, 16), ring_h(TOWER_TOP - 0.1, TR1, TR1, 16)]
    mb.add(prim_rings(rings, cap0=False, cap1=True), 'stone_cyl', smooth=0)
    for y in (1.6, 3.4):
        r = radius_at(y) + 0.05
        mb.add(prim_cyl(r, r, 0.16, 16, base=True), 'stone_light', M((0, y, 0)), bevel=0.02, smooth=0)
    # portão em arco (frente +Z): moldura de pedra clara, folhas de madeira, ferragens
    zf = radius_at(1.3) - 0.02
    mb.add(prim_extrude(arch_poly(1.7, 2.3, Y0), 0.3, axis='z'), 'stone_light', M((0, 0, zf + 0.0)), bevel=0.02)
    mb.add(prim_extrude(arch_poly(1.4, 2.12, Y0), 0.16, axis='z'), 'wood_door', M((0, 0, zf + 0.16)))
    mb.add(prim_box(0.05, 2.0, 0.05), 'iron', M((0, Y0 + 1.0, zf + 0.26)))
    for dy in (0.6, 1.3):
        mb.add(prim_box(1.3, 0.07, 0.04), 'iron', M((0, Y0 + dy, zf + 0.26)))
    for sx in (-1, 1):
        mb.add(prim_sphere(0.05, 0.05, 0.04, 5, 3), 'gold', M((sx * 0.14, Y0 + 0.95, zf + 0.28)), smooth=60)
    # janelas em arco com vitral azul em volta da torre (3 níveis, defasadas)
    for (y, angs) in ((2.4, (-70, 70, 180)), (4.0, (-35, 35, 145, -145))):
        for a in angs:
            r = radius_at(y)
            x, z = polar(r, a)
            T = M((x, 0, z), (0, a, 0))
            mb.add(prim_extrude(arch_poly(0.62, 1.0, y - 0.3), 0.2, axis='z'), 'stone_light', T @ M((0, 0, -0.02)), bevel=0.012)
            mb.add(prim_extrude(arch_poly(0.42, 0.82, y - 0.25), 0.1, axis='z'), 'glass', T @ M((0, 0, 0.1)))
            mb.add(prim_box(0.04, 0.8, 0.04), 'iron', T @ M((0, y + 0.15, 0.17)))
    # mísulas (corbels) sob a plataforma e friso de pedra
    for k in range(16):
        a = 360 * k / 16
        x, z = polar(TR1 + 0.15, a)
        mb.add(prim_box(0.3, 0.5, 0.5, taper=(0.5, 0.8)), 'stone_dark', M((x, TOWER_TOP - 0.45, z), (0, a, 0)) @ M((0, 0, 0.1), (0, 0, 0)), bevel=0.012)
    mb.add(prim_cyl(2.45, 1.9, 0.38, 16, base=True), 'stone_dark', M((0, TOWER_TOP - 0.38, 0)), bevel=0.02, smooth=0)
    return mb.build(mats, parent=root)


def build_stairs(mats, root):
    """Escada externa em espiral colada à torre, do portão até a plataforma."""
    mb = MeshBuilder('Stairs')
    steps = 22
    a0 = 40.0
    for k in range(steps):
        t = k / (steps - 1)
        a = a0 + 300 * t
        y = Y0 + 0.2 + t * (DECK_Y - Y0 - 0.45)
        r = radius_at(y) + 0.5
        x, z = polar(r, a)
        mb.add(prim_box(0.8, 0.14, 0.42), 'stone_light', M((x, y, z), (0, a + 90, 0)) @ M((0, 0, 0)), bevel=0.02)
        # coluna de apoio: bloco de pedra sob cada lance a cada 3 degraus
        if k % 3 == 0:
            mb.add(prim_box(0.4, y - Y0, 0.4, base=True), 'stone_dark', M((x, Y0, z), (0, a + 90, 0)), bevel=0.02)
        # corrimão: balaustre fino na borda externa
        xo, zo = polar(r + 0.36, a)
        mb.add(prim_box(0.05, 0.5, 0.05), 'wood_beam', M((xo, y + 0.28, zo)))
    # corrimão de madeira ao longo da escada
    pts = []
    for k in range(steps):
        t = k / (steps - 1)
        a = a0 + 300 * t
        y = Y0 + 0.2 + t * (DECK_Y - Y0 - 0.45)
        pts.append(polar(radius_at(y) + 0.86, a) + (y + 0.52,))
    pts = [(p[0], p[2], p[1]) for p in pts]
    A_pts = pts
    tube(mb, A_pts, [0.035] * len(A_pts), 'wood_beam', n=4, smooth=0)
    return mb.build(mats, parent=root)


def build_deck(mats, root):
    mb = MeshBuilder('Deck')
    # plataforma de pouso de madeira com aro de ferro, parapeito de merlões na parte de trás e nos lados
    mb.add(prim_cyl(DECK_R, DECK_R, 0.22, 16, base=True), 'wood', M((0, DECK_Y, 0)), bevel=0.03, smooth=0)
    mb.add(prim_cyl(DECK_R + 0.05, DECK_R + 0.05, 0.07, 16, base=True), 'iron', M((0, DECK_Y + 0.05, 0)), smooth=0)
    for k in range(18):
        a = 360 * k / 18
        if -55 < ((a + 180) % 360 - 180) < 55:   # frente aberta para o pouso
            continue
        x, z = polar(DECK_R - 0.12, a)
        mb.add(prim_box(0.46, 0.55, 0.28), 'stone_light', M((x, DECK_Y + 0.22, z), (0, a, 0)), bevel=0.02)
    # coluna de pedra dos cantos do dossel
    for a in (-120, 120, 180):
        x, z = polar(DECK_R - 0.5, a)
        mb.add(prim_cyl(0.16, 0.14, 1.9, 8, base=True), 'stone_light', M((x, DECK_Y + 0.22, z)), bevel=0.0, smooth=40)
        mb.add(prim_box(0.38, 0.14, 0.38), 'gold_stone', M((x, DECK_Y + 2.05, z)), bevel=0.02)
    # dossel azul em meia-cúpula cobrindo o fundo (arco traseiro)
    mb.add(half_shell([(2.12, 2.3), (2.5, 2.0), (2.95, 1.4), (3.3, 0.6), (3.45, 0.08)], 100, 260, 0.09), 'roof_cone',
           M((0, DECK_Y, 0)), smooth=35)
    mb.add(prim_sphere(0.1, 0.1, 0.1, 6, 3), 'gold', M((-0.0, DECK_Y + 3.52, 0.0)), smooth=60)
    # ninho de gravetos: anel de galhos e leito de palha, com 2 ovos grandes
    nr = 1.15
    for k in range(34):
        a = 2 * math.pi * k / 34
        r = nr + 0.15 * math.sin(k * 3.1)
        p0 = Vector((math.cos(a) * r, DECK_Y + 0.22 + 0.1 * (k % 3), math.sin(a) * r))
        p1 = Vector((math.cos(a + 0.55) * (r + 0.1), DECK_Y + 0.4 + 0.1 * ((k + 1) % 3), math.sin(a + 0.55) * (r + 0.1)))
        beam(mb, tuple(p0), tuple(p1), 0.07, 0.06, 'twig')
    mb.add(prim_sphere(1.0, 0.28, 1.0, 12, 4, y_min=0.0), 'straw', M((0, DECK_Y + 0.22, 0)), smooth=60)
    for (x, z, s) in ((-0.28, 0.1, 1.0), (0.34, -0.15, 0.9)):
        mb.add(prim_sphere(0.24 * s, 0.32 * s, 0.24 * s, 9, 5), 'egg', M((x, DECK_Y + 0.62, z), (8, 0, 6)), smooth=75)
    # penas soltas e ossada de presa no ninho
    for k in range(6):
        a = 60 * k
        mb.add(prim_box(0.06, 0.34, 0.015, taper=(0.3, 1.0)), 'feather', M((math.cos(math.radians(a)) * 0.75, DECK_Y + 0.5, math.sin(math.radians(a)) * 0.75), (70, a, 10)))
    return mb.build(mats, parent=root)


def build_props(mats, root):
    mb = MeshBuilder('Props')
    # poleiros de madeira no pátio (postes com travessa e capuz de couro) e cochos de pedra
    for sx in (-1, 1):
        x = sx * 2.55
        mb.add(prim_cyl(0.13, 0.15, 1.9, 7, base=True), 'wood_beam', M((x, Y0, 1.6)), smooth=40)
        beam(mb, (x - 0.65, Y0 + 1.75, 1.6), (x + 0.65, Y0 + 1.75, 1.6), 0.13, 0.13, 'wood', bevel=0.012)
        mb.add(prim_box(0.34, 0.1, 0.3), 'leather', M((x, Y0 + 1.82, 1.6)), bevel=0.02)
        mb.add(prim_cone(0.1, 0.22, 5), 'gold', M((x, Y0 + 1.9, 1.6)))
        # cocho de pedra com carne
        mb.add(prim_box(0.9, 0.28, 0.45, taper=(0.9, 0.9), base=True), 'stone_dark', M((sx * 1.6, Y0, 2.6), (0, 8 * sx, 0)), bevel=0.03)
        mb.add(prim_box(0.7, 0.05, 0.28), 'leather_dark', M((sx * 1.6, Y0 + 0.28, 2.6), (0, 8 * sx, 0)))
        mb.add(prim_sphere(0.12, 0.08, 0.1, 6, 3), 'paint_red', M((sx * 1.45, Y0 + 0.32, 2.6)), smooth=70)
    # fardos de feno e barris junto à torre
    for (x, z, r) in ((-2.4, -0.4, 10), (-2.35, -1.1, -5), (2.5, -0.6, 0)):
        mb.add(prim_box(0.6, 0.42, 0.42, taper=(0.98, 0.95), base=True), 'straw', M((x, Y0, z), (0, r, 0)), bevel=0.04)
        mb.add(prim_box(0.05, 0.44, 0.44), 'rope', M((x - 0.14, Y0 + 0.21, z), (0, r, 0)))
        mb.add(prim_box(0.05, 0.44, 0.44), 'rope', M((x + 0.14, Y0 + 0.21, z), (0, r, 0)))
    mb.add(prim_rings([ring_h(0, 0.24, 0.24, 8), ring_h(0.3, 0.3, 0.3, 8), ring_h(0.6, 0.24, 0.24, 8)]), 'wood', M((2.3, Y0, 1.2)), smooth=50)
    for y in (0.12, 0.48):
        mb.add(prim_cyl(0.3, 0.3, 0.05, 8), 'iron', M((2.3, Y0 + y, 1.2)))
    # grifo de pedra sobre o pilar direito do portão (corpo de leão, cabeça de águia)
    for sx in (-1, 1):
        px = sx * 1.25
        mb.add(prim_box(0.6, 1.1, 0.6, base=True, taper=(0.9, 0.9)), 'stone_light', M((px, Y0, 2.0)), bevel=0.03)
        mb.add(prim_box(0.7, 0.12, 0.7), 'stone_dark', M((px, Y0 + 1.1, 2.0)), bevel=0.02)
        T = M((px, Y0 + 1.22, 2.0), (0, sx * -22, 0))
        mb.add(prim_sphere(0.2, 0.17, 0.3, 8, 4), 'gold_stone', T @ M((0, 0.17, -0.05)), smooth=65)
        mb.add(prim_sphere(0.1, 0.1, 0.1, 6, 4), 'gold_stone', T @ M((0, 0.4, 0.22)), smooth=65)
        mb.add(prim_cone(0.045, 0.16, 5), 'gold', T @ M((0, 0.37, 0.34), (95, 0, 0)))
        for ws in (-1, 1):
            mb.add(prim_box(0.04, 0.34, 0.3, taper=(0.4, 1.0)), 'gold_stone', T @ M((ws * 0.2, 0.3, -0.12), (0, 0, ws * -50)), bevel=0.0)
    # lanternas de latão ao lado do portão
    for sx in (-1, 1):
        mb.add(prim_cyl(0.025, 0.025, 0.5, 5), 'iron', M((sx * 0.95, Y0 + 2.0, zf_gate() + 0.2)))
        mb.add(prim_box(0.14, 0.2, 0.14, taper=(0.8, 0.8)), 'glow', M((sx * 0.95, Y0 + 2.05, zf_gate() + 0.3)))
    return mb.build(mats, parent=root)


def zf_gate():
    return radius_at(1.3) - 0.02 + 0.1


def build_banners(mats, root):
    mb = MeshBuilder('Anim_Banners')
    # estandartes nos postes do portão (pendões longos) e flâmulas no dossel
    poly = [(0.0, 0.0), (0.0, -1.5), (0.4, -1.15), (0.8, -1.5), (0.8, 0.0)]
    for sx in (-1, 1):
        verts, faces = prim_extrude(poly, 0.04, axis='z')
        verts = [(x + sx * 0.0, y, z + 0.06 * math.sin(y * 4.0 + sx)) for (x, y, z) in verts]
        mb.add((verts, faces), 'team', M((sx * 1.25 - 0.4, 4.1, 2.0 + 0.36), (0, 0, 0)), smooth=40)
    # flâmulas compridas nos topos das colunas do dossel
    for a in (-120, 120):
        x, z = polar(DECK_R - 0.5, a)
        pole = [(0.0, 0.0), (0.0, -0.18), (-0.75, -0.1), (-0.58, -0.05), (-0.75, 0.0)]
        verts, faces = prim_extrude(pole, 0.03, axis='z')
        verts = [(px * (1 if a < 0 else -1), py, pz + 0.05 * math.sin(px * 8)) for (px, py, pz) in verts]
        mb.add((verts, faces), 'team', M((x, DECK_Y + 2.3, z)), smooth=40)
    # faixa pendurada sobre o portão
    sw = [(-0.7, 0.0), (0.7, 0.0), (0.7, -0.5), (0.0, -0.9), (-0.7, -0.5)]
    verts, faces = prim_extrude(sw, 0.04, axis='z')
    verts = [(x, y, z + 0.04 * math.sin(x * 5.0)) for (x, y, z) in verts]
    mb.add((verts, faces), 'team', M((0, Y0 + 3.15, radius_at(3.0) + 0.1)), smooth=40)
    return mb.build(mats, parent=root)


def main():
    args = C.script_args()
    C.reset_scene()
    mats = C.make_paint_set(PALETTE)
    root = C.make_empty('Aviary')
    base = build_base(mats, root)
    tower = build_tower(mats, root)
    stairs = build_stairs(mats, root)
    deck = build_deck(mats, root)
    props = build_props(mats, root)
    banners = build_banners(mats, root)
    finish_building(root, 'aviary', 'aviary.glb', 'aviary_atlas', [base, tower, stairs, deck, props], banners,
                    {'Base': 0.6, 'Tower': 1.2, 'Stairs': 0.7, 'Deck': 1.0, 'Props': 0.8, 'Anim_Banners': 1.0},
                    TEAM_DEFAULT, args, spawn=(0, 0, 4.0), rally=(0, 0, 6.2), game_dist=78)


if __name__ == '__main__':
    main()
