"""
build_ogre_den.py — Covil dos Ogros (tipo interno `ogre_den`) gerado 100% por script.

Uso:
  blender -b --factory-startup --python tools/blender/build_ogre_den.py -- [--no-render]

Saída (public/models/ogre_den.glb), coordenadas do jogo, origem no centro da base, frente = +Z:
  OgreDen (raiz)
  ├─ Static_Mesh       toras, ossos, peles, ferro, pedra, braseiros (1 material: Atlas)
  ├─ Anim_Banners      estandartes rasgados (material TeamColor)
  ├─ Socket_UnitSpawn  saída das unidades (frente do portão)
  └─ Socket_Rally      ponto de reunião padrão
Pegada ~7.3 x 7.3 (raio de colisão 3.6), altura ~5.5.
Palanque-cabana de toras pontiagudas com teto de peles sobre costelas gigantes de osso, portão largo de
troncos pontiagudos aberto, crânio de ogro com chifres sobre o portão, dois braseiros acesos, totens com
crânios e estandartes rasgados em cor de time, peles esticadas em armações, ossadas e clavas.
"""
import os
import sys
import math

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
from mathutils import Vector, Matrix  # noqa: E402
import common as C  # noqa: E402
from common import (MeshBuilder, M, prim_box, prim_rings, ring_h, prim_cyl, prim_cone,  # noqa: E402
                    prim_sphere, prim_extrude, bezier)
from bld_common import beam, tube, log, skull, bbox_game  # noqa: E402

TEAM_DEFAULT = '#b81d24'
Y0 = 0.30
EAVE = 3.10
PROFILE = [(-3.35, EAVE), (-1.95, 4.15), (0.0, 4.85), (1.95, 4.15), (3.35, EAVE)]
BX = 3.0
BZ0, BZ1 = -3.2, 1.0

ROCK = dict(base='#4a4642', var='#2f2c2a', var_scale=0.5, var_amt=0.8, fine=0.08,
            pattern='bricks', mapping='box', pw=1.1, ph=0.55, mortar='#1d1b1a', mortar_size=0.05,
            brick_tint='#5e5852', brick_tint_amt=0.5, brick_dark=0.75, brick_lite=1.1,
            grad=(0.0, 3.0, 0.25), top=0.2, edge='#8a837a', edge_amt=0.4, edge_r=0.06, edge_gain=7.0,
            ao=(1.2, 0.75), ao_pow=1.3)
PALETTE = {
    'rock': ROCK,
    'rock_plain': dict(ROCK, pattern=None, base='#3d3a37', var='#2a2826'),
    'dirt': dict(base='#5d4832', var='#45341f', var_scale=2.0, var_amt=0.8, fine=0.12, top=0.1, ao=(1.4, 0.8)),
    'log': dict(base='#56392a', var='#38261a', var_scale=2.0, fine=0.09, pattern='planks_v', mapping='box',
                pw=3.0, ph=0.34, mortar='#1e130c', mortar_size=0.015, top=0.2, edge='#8a6446', edge_amt=0.35,
                edge_r=0.03, ao=(0.7, 0.7), grad=(0.0, 4.0, 0.2)),
    'log_light': dict(base='#7a5536', var='#5e4028', var_scale=2.0, fine=0.09, pattern='planks_v', mapping='box',
                      pw=3.0, ph=0.3, mortar='#2a1a0f', mortar_size=0.015, top=0.2, edge='#a88058', edge_amt=0.35,
                      edge_r=0.03, ao=(0.7, 0.7)),
    'hide': dict(base='#8a6848', var='#56402c', var_scale=1.6, var_amt=1.0, fine=0.1, pattern='bricks',
                 mapping='box', pw=0.8, ph=0.55, mortar='#2e1f14', mortar_size=0.04, brick_tint='#a8805a',
                 brick_tint_amt=0.6, brick_dark=0.86, brick_lite=1.04, top=0.25, edge='#c9ab82', edge_amt=0.25,
                 edge_r=0.04, ao=(0.9, 0.65)),
    'hide_dark': dict(base='#94704d', var='#5c4330', var_scale=1.4, var_amt=1.0, fine=0.12, top=0.25,
                      edge='#c9ab82', edge_amt=0.3, edge_r=0.03, ao=(0.7, 0.6)),
    'bone': dict(base='#c8bd9c', var='#a09476', var_scale=4.0, var_amt=0.7, fine=0.06, top=0.35,
                 edge='#fff7de', edge_amt=0.6, edge_r=0.02, ao=(0.3, 0.55)),
    'iron': dict(base='#46454c', var='#2d2c33', var_scale=3.0, fine=0.1, top=0.3, edge='#9b9a9f',
                 edge_amt=0.7, edge_r=0.02, ao=(0.5, 0.5)),
    'rust': dict(base='#7a4a30', var='#5a3220', var_scale=4.0, fine=0.12, top=0.25, ao=(0.4, 0.5)),
    'dark': dict(base='#1d1714', var='#120e0c'),
    'glow': dict(base='#ff8a30', var='#ffc04a', var_scale=3.0, emit_boost=1.3),
    'rope': dict(base='#8c7647', var='#6c5a34', var_scale=10.0, fine=0.1, top=0.2),
    'paint': dict(base='#8f2018', var='#6d150f', var_scale=6.0, fine=0.1, top=0.2),
    'team': dict(base='#bab2a6', var='#a0988c', var_scale=2.0, fine=0.08, top=0.2, edge='#dcd6cc',
                 edge_amt=0.3, edge_r=0.03, ao=(0.8, 0.6), team=True),
}


def build_base(mats, root):
    mb = MeshBuilder('Base')
    mb.add(prim_box(7.3, Y0, 7.3, taper=(0.97, 0.97), base=True), 'rock', bevel=0.09)
    mb.add(prim_box(6.9, 0.05, 6.9, base=True), 'dirt', M((0, Y0, 0)))
    # rochas nos cantos e degrau de pedra do portão
    for (x, z, s, r) in ((-3.3, -3.3, 0.6, 20), (3.3, -3.3, 0.7, -10), (3.4, 3.4, 0.5, 40), (-3.4, 3.4, 0.55, 5),
                         (3.45, 0.2, 0.45, 15)):
        mb.add(prim_sphere(s, s * 0.7, s * 0.9, 7, 4, y_min=-0.2), 'rock_plain', M((x, Y0, z), (0, r, 0)), smooth=0)
    mb.add(prim_box(3.0, 0.14, 0.9, taper=(0.95, 0.9), base=True), 'rock', M((0, Y0, BZ1 + 0.75)), bevel=0.04)
    return mb.build(mats, parent=root)


def build_lodge(mats, root):
    mb = MeshBuilder('Lodge')
    # piso de terra batida + interior escuro atrás do portão
    mb.add(prim_box(2 * BX - 0.5, 0.04, BZ1 - BZ0 - 0.5, base=True), 'dirt', M((0, Y0 + 0.04, (BZ0 + BZ1) / 2)))
    mb.add(prim_box(2 * BX - 0.6, 3.0, 0.15, base=True), 'dark', M((0, Y0, BZ1 - 0.4)))
    # paliçada: toras verticais pontiagudas nas laterais e no fundo
    def palisade(p0, p1, n, base_h, jitter):
        a, b = Vector(p0), Vector(p1)
        for i in range(n):
            t = (i + 0.5) / n
            p = a.lerp(b, t)
            h = base_h + jitter[i % len(jitter)]
            log(mb, (p.x, Y0, p.z), (p.x, Y0 + h, p.z), 0.23, 'log', n=6, tip=0.5)
    jit = [0.0, 0.35, 0.12, 0.5, 0.2, 0.42]
    palisade((-BX, 0, BZ0), (BX, 0, BZ0), 14, 2.45, jit)
    palisade((-BX, 0, BZ0), (-BX, 0, BZ1 - 0.2), 9, 2.45, jit[2:] + jit[:2])
    palisade((BX, 0, BZ0), (BX, 0, BZ1 - 0.2), 9, 2.45, jit[4:] + jit[:4])
    # travessas de ferro e cordas ao redor da paliçada
    for y in (Y0 + 0.9, Y0 + 1.85):
        mb.add(prim_box(2 * BX + 0.5, 0.08, 0.1), 'iron', M((0, y, BZ0 - 0.2)))
        for sx in (-1, 1):
            mb.add(prim_box(0.1, 0.08, BZ1 - BZ0 - 0.1), 'iron', M((sx * (BX + 0.22), y, (BZ0 + BZ1) / 2 - 0.1)))
    # parede frontal de toras ao lado do portão
    for sx in (-1, 1):
        for i in range(3):
            x = sx * (2.5 + i * 0.36)
            log(mb, (x, Y0, BZ1), (x, Y0 + 2.3 + (0.3 if i == 1 else 0.0), BZ1), 0.23, 'log', n=6, tip=0.5)
    # fachada: empena de pele sobre o portão + lintel
    poly = [(-3.35, EAVE), (-1.95, 4.15), (0.0, 4.85), (1.95, 4.15), (3.35, EAVE), (3.35, 2.8), (-3.35, 2.8)]
    mb.add(prim_extrude(poly, 0.16, axis='z'), 'hide', M((0, 0, BZ1 + 0.02)), bevel=0.01)
    # runas de guerra pintadas em vermelho na empena
    for i, (dx, rot) in enumerate(((-1.45, 12), (1.45, -12))):
        mb.add(prim_box(0.12, 0.8, 0.03), 'paint', M((dx, 3.55, BZ1 + 0.12), (0, 0, rot)))
        mb.add(prim_box(0.5, 0.11, 0.03), 'paint', M((dx, 3.75, BZ1 + 0.12), (0, 0, rot)))
        mb.add(prim_box(0.36, 0.11, 0.03), 'paint', M((dx, 3.4, BZ1 + 0.12), (0, 0, rot)))
    return mb.build(mats, parent=root)


def build_roof(mats, root):
    mb = MeshBuilder('Roof')
    zc = (BZ0 - 0.4 + BZ1 + 0.55) / 2
    zl = (BZ1 + 0.55) - (BZ0 - 0.4)
    segs = [((-3.35, EAVE), (-1.95, 4.15)), ((-1.95, 4.15), (0.0, 4.85)),
            ((3.35, EAVE), (1.95, 4.15)), ((1.95, 4.15), (0.0, 4.85))]
    for (p0, p1) in segs:
        d = Vector((p1[0] - p0[0], p1[1] - p0[1], 0))
        L = d.length
        ang = math.degrees(math.atan2(d.y, d.x))
        mid = Vector(((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, zc))
        mb.add(prim_box(L + 0.06, 0.14, zl), 'hide', M(tuple(mid + Vector((0, 0.07, 0))), (0, 0, ang)), bevel=0.02)
    # costelas gigantes de osso sobre o teto
    def rib(z, scale=1.0):
        pts = [(-3.42, 2.3), (-3.4, EAVE + 0.06), (-2.6, 3.72), (-1.95, 4.27), (-1.0, 4.72), (0.0, 4.97)]
        pts = pts + [(-x, y) for (x, y) in pts[-2::-1]]
        tube(mb, [(x, y, z) for (x, y) in pts], [0.12, 0.13, 0.12, 0.12, 0.11, 0.10, 0.11, 0.12, 0.12, 0.13, 0.12],
             'bone', n=6, smooth=45, cap=True)
    for z in (-2.7, -1.5, -0.3, 1.25):
        rib(z)
    # espinha dorsal: cumeeira de osso com vértebras/espinhos
    beam(mb, (0, 5.0, BZ0 - 0.4), (0, 5.0, BZ1 + 0.55), 0.16, 0.16, 'bone', bevel=0.03)
    for i in range(8):
        z = BZ0 - 0.2 + i * 0.68
        mb.add(prim_cone(0.09, 0.3, 5), 'bone', M((0, 5.06, z)))
    # amarras de corda sobre as costelas
    for z in (-2.7, -1.5, -0.3, 1.25):
        for sx in (-1, 1):
            mb.add(prim_box(0.2, 0.05, 0.2), 'rope', M((sx * 1.95, 4.3, z), (0, 0, sx * -28)))
    # chaminé de fumaça (buraco) e crânios menores nos beirais
    mb.add(prim_box(0.7, 0.3, 0.7, taper=(0.8, 0.8), base=True), 'log', M((0.0, 4.92, -1.9)))
    return mb.build(mats, parent=root)


def gate_leaf(mb, hinge, open_dir):
    """Folha de portão de toras pontiagudas presa por tiras de ferro, aberta para fora."""
    yaw = -70.0 if open_dir > 0 else -110.0
    T = M(hinge, (0, yaw, 0))
    heights = (3.15, 3.45, 3.25, 3.55)
    for i, h in enumerate(heights):
        x = 0.19 + i * 0.37
        p0 = T @ Vector((x, 0, 0))
        p1 = T @ Vector((x, h, 0))
        log(mb, tuple(p0), tuple(p1), 0.18, 'log_light', n=8, tip=0.45)
    for y in (0.7, 2.2):
        p0 = T @ Vector((0.0, y, 0.2))
        p1 = T @ Vector((1.5, y, 0.2))
        beam(mb, tuple(p0), tuple(p1), 0.12, 0.05, 'iron')
    # crânio pequeno pregado na folha
    skull(mb, T @ M((0.75, 1.5, 0.24), (0, 0, 0)), 0.28)


def build_gate(mats, root):
    mb = MeshBuilder('Gate')
    z = BZ1 + 0.1
    # colunas do portão: toras grossas com base alargada e topo em ponta
    for sx in (-1, 1):
        x = sx * 1.95
        log(mb, (x, Y0, z), (x, Y0 + 3.75, z), 0.42, 'log', n=8, tip=0.0)
        mb.add(prim_cone(0.36, 0.5, 8), 'log', M((x, Y0 + 3.75, z)), smooth=40)
        mb.add(prim_cyl(0.55, 0.5, 0.35, 8, base=True), 'rock_plain', M((x, Y0, z)), bevel=0.03)
        for y in (1.3, 2.4):
            mb.add(prim_cyl(0.46, 0.46, 0.12, 8), 'iron', M((x, y, z)))
        # crânio de ogro na coluna
        skull(mb, M((x, Y0 + 3.05, z + 0.42), (-8, 0, 0)), 0.5)
    # lintel de tora com crânios pendurados
    beam(mb, (-2.35, Y0 + 3.12, z), (2.35, Y0 + 3.12, z), 0.42, 0.42, 'log', bevel=0.05)
    for x in (-1.0, 0.0, 1.0):
        mb.add(prim_box(0.06, 0.25, 0.04), 'rope', M((x, Y0 + 2.9, z + 0.27)))
    for x, r in ((-1.0, 4), (1.0, -4)):
        skull(mb, M((x, Y0 + 2.6, z + 0.3), (8, r * 3, 0)), 0.32)
    # crânio gigante acima do portão
    skull(mb, M((0, 4.25, z + 0.35), (-6, 0, 0)), 1.25)
    # folhas do portão (abertas)
    gate_leaf(mb, (-1.52, Y0, z + 0.25), -1)
    gate_leaf(mb, (1.52, Y0, z + 0.25), 1)
    # brasa dentro do covil
    mb.add(prim_box(0.9, 0.4, 0.05), 'glow', M((0, Y0 + 0.4, BZ0 + 0.9)))
    mb.add(prim_cone(0.3, 0.5, 6), 'glow', M((0, Y0 + 0.05, BZ0 + 1.4)))
    return mb.build(mats, parent=root)


def brazier(mb, x, z):
    """Braseiro de ferro sobre tripé com chamas."""
    for k in range(3):
        a = math.radians(90 + 120 * k)
        base = (x + math.cos(a) * 0.36, Y0, z + math.sin(a) * 0.36)
        top = (x + math.cos(a) * 0.14, Y0 + 1.0, z + math.sin(a) * 0.14)
        log(mb, base, top, 0.055, 'iron', n=5)
    mb.add(prim_rings([ring_h(0.0, 0.16, 0.16, 8), ring_h(0.14, 0.4, 0.4, 8), ring_h(0.3, 0.46, 0.46, 8)]), 'iron',
           M((x, Y0 + 1.0, z)), smooth=40)
    mb.add(prim_cyl(0.4, 0.4, 0.05, 8), 'glow', M((x, Y0 + 1.27, z)))
    for (dx, dz, h) in ((0, 0, 0.75), (0.17, 0.06, 0.5), (-0.14, -0.1, 0.55), (0.03, -0.18, 0.4)):
        mb.add(prim_cone(0.14, h, 5), 'glow', M((x + dx, Y0 + 1.28, z + dz)))


def build_props(mats, root):
    mb = MeshBuilder('Props')
    # braseiros
    brazier(mb, -2.45, 2.35)
    brazier(mb, 2.45, 2.35)
    # totens com crânio e travessa para o estandarte (estandarte em Anim_Banners)
    for sx in (-1, 1):
        x = sx * 3.3
        log(mb, (x, Y0, 3.1), (x, 4.4, 3.1), 0.11, 'log', n=6, tip=0.0)
        mb.add(prim_cone(0.12, 0.45, 6), 'iron', M((x, 4.4, 3.1)))
        beam(mb, (x - 0.55, 3.9, 3.1), (x + 0.55, 3.9, 3.1), 0.08, 0.08, 'log')
        skull(mb, M((x, 4.05, 3.1 + 0.15)), 0.3)
        for y in (0.9, 1.6):
            mb.add(prim_cyl(0.15, 0.15, 0.07, 6), 'rope', M((x, Y0 + y, 3.1)))
    # armações de peles esticadas (encostadas nas laterais, paralelas às paredes)
    for sx, cz in ((-1, -0.7), (1, -0.7), (-1, -2.3), (1, -2.3)):
        T = M((sx * 3.72, 0, cz), (0, 90, 0))
        for k in (-1, 1):
            p = T @ Vector((k * 0.65, Y0, 0))
            q = T @ Vector((k * 0.65, Y0 + 1.75, 0))
            log(mb, tuple(p), tuple(q), 0.06, 'log', n=5)
        for y in (1.7, 0.5):
            beam(mb, tuple(T @ Vector((-0.65, Y0 + y, 0))), tuple(T @ Vector((0.65, Y0 + y, 0))), 0.07, 0.07, 'log')
        mb.add(prim_box(1.15, 1.05, 0.04), 'hide_dark', T @ M((0, Y0 + 1.1, -0.02 * sx)), bevel=0.01)
        for dx in (-0.52, 0.0, 0.52):
            for y in (0.64, 1.55):
                mb.add(prim_box(0.05, 0.1, 0.05), 'rope', T @ M((dx, Y0 + y, 0.03 * sx)))
    # ossada: pilha de ossos longos e crânio em estaca junto ao portão
    for i, (dx, dz, ry, rz) in enumerate(((0.0, 0.0, 20, 8), (0.12, 0.05, -25, 12), (-0.1, 0.1, 70, -6), (0.05, -0.12, 100, 14))):
        p = Vector((-1.15 + dx, Y0 + 0.08 + 0.06 * (i % 2), 2.85 + dz))
        mb.add(prim_cyl(0.045, 0.045, 0.75, 6, base=False), 'bone', M(tuple(p), (90, ry, rz)))
        mb.add(prim_sphere(0.07, 0.07, 0.07, 5, 3), 'bone', M(tuple(p + Vector((0.36 * math.sin(math.radians(ry)), 0, 0.36 * math.cos(math.radians(ry)))))))
    skull(mb, M((1.1, Y0 + 0.28, 3.0), (0, -25, 0)), 0.42)
    # estacas de ferro no perímetro da frente
    for (x, z) in ((-3.45, 1.8), (-3.45, 2.3), (3.45, 1.8), (3.45, 2.3), (-0.7, 3.5), (0.7, 3.5)):
        mb.add(prim_cone(0.08, 0.75, 5), 'iron', M((x, Y0, z)))
    # clavas de ogro apoiadas na parede lateral
    for k, (x, z, lean) in enumerate(((-3.3, 0.0, 12), (-3.3, -0.6, -8))):
        p0 = Vector((x, Y0 + 0.2, z))
        p1 = Vector((x + 0.25, Y0 + 2.05, z + 0.1 * lean / 10))
        tube(mb, [tuple(p0), tuple((p0 + p1) / 2), tuple(p1)], [0.07, 0.13, 0.2], 'log_light', n=7, smooth=50)
        for i in range(5):
            a = math.radians(72 * i)
            mb.add(prim_cone(0.045, 0.14, 4), 'iron', M((x + 0.25 + math.cos(a) * 0.2, Y0 + 1.9 + math.sin(a) * 0.04 * 0 + (i % 2) * 0.18,
                                                        z + math.sin(a) * 0.2), (0, 0, 0)))
    return mb.build(mats, parent=root)


def tattered(w, h, teeth=4, seed=0.0):
    """Estandarte rasgado: retângulo com barra em dentes e um rasgo."""
    pts = [(-w / 2, 0.0), (w / 2, 0.0), (w / 2, -h * 0.7)]
    for i in range(teeth):
        t = i / teeth
        x = w / 2 - w * (i + 0.5) / teeth
        pts.append((x + w / (2 * teeth) * 0.6, -h * (0.82 + 0.18 * ((i * 7 + int(seed * 10)) % 3) / 2)))
        pts.append((x - w / (2 * teeth) * 0.4, -h * 0.66))
    pts.append((-w / 2, -h * 0.85))
    return pts


def build_banners(mats, root):
    mb = MeshBuilder('Anim_Banners')
    for k, sx in enumerate((-1, 1)):
        x = sx * 3.3
        verts, faces = prim_extrude(tattered(0.85, 1.7, 4, k), 0.035, axis='z')
        verts = [(vx, vy, vz + 0.09 * math.sin(vy * 3.0 + vx * 2.0 + k)) for (vx, vy, vz) in verts]
        mb.add((verts, faces), 'team', M((x, 3.86, 3.1 + 0.08)), smooth=40)
    # faixas de pano rasgado nas colunas do portão
    for k, sx in enumerate((-1, 1)):
        verts, faces = prim_extrude(tattered(0.42, 1.25, 3, k + 3), 0.03, axis='z')
        verts = [(vx, vy, vz + 0.06 * math.sin(vy * 4.0 + k)) for (vx, vy, vz) in verts]
        mb.add((verts, faces), 'team', M((sx * 1.3, 3.72, BZ1 + 0.55)), smooth=40)
    return mb.build(mats, parent=root)


def main():
    args = C.script_args()
    C.reset_scene()
    mats = C.make_paint_set(PALETTE)
    root = C.make_empty('OgreDen')
    base = build_base(mats, root)
    lodge = build_lodge(mats, root)
    roof = build_roof(mats, root)
    gate = build_gate(mats, root)
    props = build_props(mats, root)
    banners = build_banners(mats, root)
    bake_set = [base, lodge, roof, gate, props, banners]
    bpy.context.view_layer.update()
    C.uv_atlas(bake_set, weights={'Base': 0.6, 'Lodge': 0.9, 'Roof': 0.9, 'Gate': 1.2, 'Props': 1.0, 'Anim_Banners': 1.0},
               margin=0.004, angle=50.0)
    img = C.bake_atlas(bake_set, 'ogre_den_atlas', int(os.environ.get('ATLAS', 1024)),
                       samples=int(os.environ.get('BAKE_SAMPLES', 32)), margin=6)
    C.finalize_materials(bake_set, img, team_default=TEAM_DEFAULT,
                         out_png=os.path.join(C.BUILD_DIR, 'ogre_den_atlas.png'))
    static = C.join_objects([base, lodge, roof, gate, props], 'Static_Mesh')
    static.parent = root
    C.make_empty('Socket_UnitSpawn', (0, 0, 4.6), parent=root)
    C.make_empty('Socket_Rally', (0, 0, 6.6), parent=root)
    bpy.context.view_layer.update()
    out = os.path.join(C.OUT_MODELS, 'ogre_den.glb')
    C.export_glb(root, out, quality=80)
    print('STATS ogre_den', C.stats(root, out))
    print('BBOX', bbox_game(root))
    if '--no-render' not in args:
        rig = C.RenderRig(root, 'ogre_den', res=int(os.environ.get('RENDER_RES', 800)), samples=24)
        rig.render('34', (1.0, 0.95, 1.0), 30)
        rig.render('front', (0.0, 0.35, 1.0), 30)
        rig.render('back', (-0.8, 0.8, -1.0), 30)
        rig.render('side', (1.0, 0.25, 0.0), 30)
        rig.render('game', (45, 44, 45), 30, dist=78)
        C.set_team_color('#2f63e0')
        rig.render('34_azul', (1.0, 0.95, 1.0), 30)


if __name__ == '__main__':
    main()
