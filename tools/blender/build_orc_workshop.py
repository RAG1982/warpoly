"""
build_orc_workshop.py — Oficina dos Engenhoqueiros (tipo interno `orc_workshop`) gerada 100% por script.

Uso:
  blender -b --factory-startup --python tools/blender/build_orc_workshop.py -- [--no-render]

Saída (public/models/orc_workshop.glb), coordenadas do jogo, origem no centro da base, frente = +Z:
  OrcWorkshop (raiz)
  ├─ Static_Mesh       basalto, toras, chapas de sucata, peles, ossos, engrenagens toscas, forja, catapulta em obras (Atlas)
  ├─ Anim_Banners      estandartes rasgados (TeamColor)
  ├─ Socket_UnitSpawn  saída das unidades
  └─ Socket_Rally      ponto de reunião padrão
Pegada ~7.3 x 7.3 (raio de colisão 3.6), altura ~6.4.
Galpão bruto de meia-água (toras, chapas remendadas de ferro enferrujado, peles e costelas), baia esquerda aberta
com forja ardente, fole e bigorna, chaminé torta de ferro com chama no topo, baia direita de chapas rebitadas com
portão de ferro e engrenagem tosca, catapulta inacabada no pátio, pilha de sucata (engrenagens, correntes, barris),
ossos, crânios, espigões e estandartes rasgados em cor de time.
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
import siege_common as S  # noqa: E402
from siege_common import chain, rock, lash  # noqa: E402
from build_ogre_den import PALETTE as OD, tattered  # noqa: E402

TEAM_DEFAULT = '#b81d24'
Y0 = 0.30
FT = 0.30
SX0, SX1 = -3.15, 3.15          # galpão
SZ0, SZ1 = -3.25, 0.95
BACK_Y, FRONT_Y = 5.6, 3.3    # meia-água: alta atrás, baixa na frente

PALETTE = {k: OD[k] for k in ('rock', 'rock_plain', 'dirt', 'log', 'log_light', 'hide', 'hide_dark', 'bone', 'iron',
                              'rust', 'dark', 'glow', 'rope', 'paint', 'team')}
PALETTE['plate'] = dict(base='#6d4a38', var='#4b3024', var_scale=1.2, var_amt=1.0, fine=0.12, pattern='bricks',
                        mapping='box', pw=1.15, ph=0.75, mortar='#1d1410', mortar_size=0.03, brick_tint='#8c5c44',
                        brick_tint_amt=0.6, brick_dark=0.8, brick_lite=1.1, top=0.25, edge='#b5866a', edge_amt=0.4,
                        edge_r=0.03, ao=(0.8, 0.7))
PALETTE['plate_dark'] = dict(PALETTE['plate'], base='#3d3f46', var='#2a2b31', brick_tint='#585b64', edge='#8e929c',
                             pw=0.9, ph=0.6)
PALETTE['steel'] = dict(base='#7c8088', var='#595d66', var_scale=4.0, fine=0.08, top=0.35, edge='#d5d9e0', edge_amt=0.8,
                        edge_r=0.012, ao=(0.25, 0.4))
PALETTE['coal'] = dict(base='#e0561f', var='#ffa040', var_scale=8.0, var_amt=0.9, fine=0.1, emit_boost=1.2)
PALETTE['stone'] = dict(base='#6b6660', var='#4a4641', var_scale=1.5, var_amt=0.9, fine=0.1, top=0.3, edge='#a59e93',
                        edge_amt=0.5, edge_r=0.03, ao=(0.4, 0.55))
PALETTE['wood_dark'] = dict(OD['log'], pattern=None, base='#3c2819', var='#281a10')


def build_base(mats, root):
    mb = MeshBuilder('Base')
    mb.add(prim_box(7.3, Y0, 7.3, taper=(0.97, 0.97), base=True), 'rock', bevel=0.09)
    mb.add(prim_box(6.9, 0.05, 6.9, base=True), 'dirt', M((0, Y0, 0)))
    for (x, z, s, r) in ((-3.3, -3.3, 0.6, 20), (3.3, -3.3, 0.7, -10), (3.4, 3.4, 0.5, 40), (-3.4, 3.4, 0.55, 5)):
        mb.add(prim_sphere(s, s * 0.7, s * 0.9, 7, 4, y_min=-0.2), 'rock_plain', M((x, Y0, z), (0, r, 0)), smooth=0)
    return mb.build(mats, parent=root)


def build_shed(mats, root):
    mb = MeshBuilder('Shed')
    cz = (SZ0 + SZ1) / 2
    # piso interno de pedra escura e fundo
    mb.add(prim_box(SX1 - SX0 - 0.4, 0.05, SZ1 - SZ0 - 0.3, base=True), 'rock_plain', M((0, Y0, cz)))
    mb.add(prim_box(SX1 - SX0 - 0.3, 3.4, 0.15, base=True), 'dark', M((0, Y0, SZ0 + 0.5)))
    # postes de canto (toras grossas pontiagudas) e vigas
    for (x, z, h) in ((SX0, SZ0, 5.35), (SX1, SZ0, 5.4), (SX1, SZ1, 3.5), (-0.4, SZ1, 3.45), (SX0, SZ1, 3.55)):
        log(mb, (x, Y0, z), (x, Y0 + h, z), 0.24, 'log', n=8, tip=0.0)
        mb.add(prim_cone(0.22, 0.4, 8), 'log', M((x, Y0 + h, z)), smooth=40)
        for y in (0.9, 2.1):
            mb.add(prim_cyl(0.27, 0.27, 0.12, 8, base=False), 'iron', M((x, Y0 + y, z)))
    # paliçada nos fundos e na lateral direita (toras verticais de alturas variadas)
    jit = [0.0, 0.3, 0.1, 0.45, 0.2, 0.38]
    for i in range(13):
        x = SX0 + 0.25 + i * (SX1 - SX0 - 0.5) / 12
        log(mb, (x, Y0, SZ0 + 0.2), (x, Y0 + 4.2 + jit[i % 6] * 0.5, SZ0 + 0.2), 0.2, 'log', n=6, tip=0.0)
    def roof_y(z):
        t = (z - (SZ0 - 0.3)) / ((SZ1 + 0.35) - (SZ0 - 0.3))
        return BACK_Y + t * (FRONT_Y - BACK_Y)
    for i in range(10):
        z = SZ0 + 0.35 + i * (SZ1 - SZ0 - 0.6) / 9
        log(mb, (SX1 - 0.1, Y0, z), (SX1 - 0.1, roof_y(z) - 0.2 - jit[(i + 2) % 6] * 0.12, z), 0.2, 'log_light', n=6, tip=0.0)
    # lateral esquerda: toras só no fundo (resto aberto para a forja)
    for i in range(4):
        z = SZ0 + 0.35 + i * 0.42
        log(mb, (SX0 + 0.1, Y0, z), (SX0 + 0.1, roof_y(z) - 0.2 - jit[i] * 0.1, z), 0.2, 'log', n=6, tip=0.0)
    for y in (1.0, 2.2):
        mb.add(prim_box(SX1 - SX0 + 0.3, 0.09, 0.1), 'iron', M((0, Y0 + y, SZ0 - 0.04)))
        mb.add(prim_box(0.1, 0.09, SZ1 - SZ0 - 0.3), 'iron', M((SX1 + 0.04, Y0 + y, cz - 0.1)))
    # fachada: baia direita de chapas remendadas com portão de ferro; viga sobre a baia aberta
    mb.add(prim_box(SX1 - 0.3 - 0.3, 3.05, 0.22, base=True), 'plate', M(((0.3 + SX1 - 0.3) / 2, Y0, SZ1 - 0.1)), bevel=0.02)
    for i in range(9):
        mb.add(prim_cone(0.05, 0.1, 4), 'iron', M((0.6 + i * 0.3, Y0 + 2.75, SZ1 + 0.03), (90, 0, 0)))
    for j in range(2):
        for i in range(5):
            mb.add(prim_cone(0.05, 0.1, 4), 'iron', M((2.2 + (i % 2) * 0.5, Y0 + 0.4 + j * 0.3 + i * 0.3, SZ1 + 0.03), (90, 0, 0)))
    mb.add(prim_box(1.2, 2.3, 0.14, base=True), 'plate_dark', M((1.1, Y0, SZ1 + 0.05)), bevel=0.02)
    for y in (0.5, 1.15, 1.8):
        mb.add(prim_box(1.3, 0.12, 0.17), 'iron', M((1.1, Y0 + y, SZ1 + 0.06)))
    mb.add(prim_cyl(0.11, 0.11, 0.1, 8, base=False), 'steel', M((1.5, Y0 + 1.2, SZ1 + 0.18), (90, 0, 0)))
    mb.add(prim_box(1.6, 0.26, 0.3), 'log', M((-1.4, Y0 + 3.2, SZ1)), bevel=0.03)
    # remendos de chapa e peles nas paredes (fundo/laterais), pregos
    mb.add(prim_box(0.06, 1.3, 1.6), 'plate', M((SX1 + 0.12, Y0 + 1.7, -1.5), (0, 0, 0)), bevel=0.01)
    mb.add(prim_box(0.06, 1.0, 1.1), 'hide_dark', M((SX1 + 0.12, Y0 + 2.5, -0.2)), bevel=0.01)
    mb.add(prim_box(0.06, 0.9, 0.9), 'plate_dark', M((SX1 + 0.12, Y0 + 1.0, -0.4), (0, 0, 0)), bevel=0.01)
    return mb.build(mats, parent=root)


def build_roof(mats, root):
    mb = MeshBuilder('Roof')
    run_z = SZ1 + 0.35 - (SZ0 - 0.3)
    ang = math.degrees(math.atan2(BACK_Y - FRONT_Y, run_z))
    L = math.hypot(run_z, BACK_Y - FRONT_Y)
    zc = ((SZ1 + 0.35) + (SZ0 - 0.3)) / 2
    yc = (BACK_Y + FRONT_Y) / 2 + 0.05
    W = SX1 - SX0 + 0.6
    T = M((0, yc, zc), (ang, 0, 0))
    mb.add(prim_box(W, 0.16, L), 'log_light', T, bevel=0.02)
    # chapas remendadas sobre as peles (desencontradas)
    patches = [(-2.1, -1.4, 1.9, 1.5, 'hide', 4), (-0.3, 0.6, 1.5, 1.7, 'plate_dark', -3), (1.7, -1.2, 2.0, 1.6, 'plate', 6),
               (2.0, 0.9, 1.4, 1.2, 'hide_dark', -5), (-2.0, 0.9, 1.5, 1.3, 'hide_dark', 7), (0.5, -1.9, 1.7, 1.2, 'plate_dark', -4),
               (-0.2, -0.6, 1.2, 1.0, 'hide', 9)]
    for (x, z, w, d, m, r) in patches:
        mb.add(prim_box(w, 0.06, d), m, T @ M((x, 0.1, z), (0, r, 0)), bevel=0.01)
        for (dx, dz) in ((-0.4, -0.4), (0.4, -0.4), (-0.4, 0.4), (0.4, 0.4)):
            mb.add(prim_cone(0.035, 0.06, 4), 'iron', T @ M((x + dx * w * 0.9, 0.16, z + dz * d * 0.9)))
    # costelas de osso e espigões no beiral dianteiro
    for x in (-2.6, -0.9, 0.9, 2.6):
        pts = [T @ Vector((x, 0.16, -L / 2 + 0.3 + t * (L - 0.5))) for t in (0.0, 0.3, 0.6, 1.0)]
        tube(mb, [tuple(p) for p in pts], [0.07, 0.09, 0.09, 0.07], 'bone', n=5, smooth=45)
        lash(mb, tuple(T @ Vector((x, 0.18, 0.4))), (0, 0.3, 1), 0.11)
        lash(mb, tuple(T @ Vector((x, 0.18, -1.0))), (0, 0.3, 1), 0.11)
    for i in range(9):
        x = -2.6 + i * 0.66
        mb.add(prim_cone(0.06, 0.32, 4), 'iron', T @ M((x, 0.05, L / 2 - 0.05), (-70, 0, 0)))
    # crânio grande no beiral frontal direito (troféu) e cordas
    skull(mb, T @ M((-2.5, 0.35, L / 2 - 0.1), (-20, 0, 0)), 0.7)
    return mb.build(mats, parent=root)


def build_forge(mats, root):
    """Baia esquerda: forja de pedra com brasas, fole, bigorna e chaminé de ferro torta com chama."""
    mb = MeshBuilder('Forge')
    fx, fz = -1.9, -2.35
    mb.add(prim_box(1.9, 1.1, 1.3, taper=(0.9, 0.9), base=True), 'rock', M((fx, Y0, fz)), bevel=0.04)
    mb.add(prim_box(1.3, 0.07, 0.8), 'coal', M((fx, Y0 + 1.13, fz + 0.05)))
    for (dx, dz, h) in ((0.0, 0.0, 0.42), (0.3, 0.12, 0.3), (-0.3, -0.1, 0.32), (0.05, -0.25, 0.25)):
        mb.add(prim_cone(0.16, h, 5), 'glow', M((fx + dx, Y0 + 1.16, fz + dz)))
    # boca da forja (arco escuro + brasa) na frente
    mb.add(prim_box(0.8, 0.5, 0.06), 'glow', M((fx, Y0 + 0.5, fz + 0.66)))
    mb.add(prim_box(0.95, 0.65, 0.05), 'dark', M((fx, Y0 + 0.5, fz + 0.64)))
    # capuz de ferro e chaminé torta
    mb.add(prim_cone(0.85, 0.7, 4, base=True, phase=math.pi / 4), 'plate_dark', M((fx, Y0 + 1.6, fz), (0, 0, 0)), smooth=0)
    path = [(fx, Y0 + 2.3, fz), (fx, Y0 + 3.4, fz), (fx + 0.45, Y0 + 4.2, fz - 0.15), (fx + 0.5, Y0 + 5.0, fz - 0.2), (fx + 0.35, Y0 + 5.6, fz - 0.15)]
    tube(mb, path, [0.26, 0.27, 0.27, 0.27, 0.34], 'plate_dark', n=8, smooth=40)
    for k in (1, 2, 3):
        p = Vector(path[k])
        mb.add(prim_cyl(0.33, 0.33, 0.1, 8, base=False), 'rust', M(tuple(p)))
    top = Vector(path[-1])
    mb.add(prim_cyl(0.3, 0.3, 0.06, 8), 'glow', M(tuple(top + Vector((0, 0.3, 0)))))
    for (dx, dz, h, r) in ((0, 0, 0.85, 0.2), (0.17, 0.05, 0.55, 0.14), (-0.15, -0.08, 0.6, 0.15)):
        mb.add(prim_cone(r, h, 6), 'coal', M(tuple(top + Vector((dx, 0.32, dz)))))
    for sx in (-1, 1):
        mb.add(prim_cone(0.06, 0.4, 4), 'iron', M(tuple(top + Vector((sx * 0.3, 0.2, 0))), (0, 0, -sx * 35)))
    # fole de pele com cabo de osso
    mb.add(prim_box(0.8, 0.5, 0.5, taper=(0.7, 0.7)), 'hide_dark', M((fx - 1.0, Y0 + 0.6, fz + 0.1), (0, 10, 0)), bevel=0.04)
    tube(mb, [(fx - 0.7, Y0 + 0.75, fz + 0.1), (fx - 0.2, Y0 + 0.9, fz + 0.1)], [0.07, 0.05], 'iron', n=5)
    tube(mb, [(fx - 1.3, Y0 + 0.75, fz + 0.15), (fx - 1.7, Y0 + 1.2, fz + 0.25), (fx - 1.8, Y0 + 1.7, fz + 0.3)], [0.04, 0.05, 0.08], 'bone', n=5)
    # bigorna sobre toco, água de têmpera (barril) e ferramentas
    mb.add(prim_cyl(0.4, 0.45, 0.6, 8, base=True), 'log', M((fx + 1.35, Y0, fz + 0.75)), smooth=40)
    mb.add(prim_box(0.6, 0.18, 0.3, taper=(0.8, 0.7)), 'iron', M((fx + 1.35, Y0 + 0.66, fz + 0.75)), bevel=0.012)
    mb.add(prim_cone(0.11, 0.3, 4), 'iron', M((fx + 1.72, Y0 + 0.72, fz + 0.75), (0, 0, -90)))
    mb.add(prim_box(0.34, 0.2, 0.26, taper=(0.7, 0.8)), 'iron', M((fx + 1.35, Y0 + 0.82, fz + 0.75)), bevel=0.012)
    mb.add(prim_rings([ring_h(0.0, 0.3, 0.3, 8), ring_h(0.35, 0.36, 0.36, 8), ring_h(0.7, 0.3, 0.3, 8)]), 'wood_dark',
           M((fx + 0.35, Y0, fz + 0.85)), smooth=50)
    mb.add(prim_cyl(0.3, 0.3, 0.03, 8), 'dark', M((fx + 0.35, Y0 + 0.68, fz + 0.85)))
    for y in (0.15, 0.55):
        mb.add(prim_cyl(0.37, 0.37, 0.05, 8), 'iron', M((fx + 0.35, Y0 + y, fz + 0.85)))
    # martelo, tenazes
    mb.add(prim_box(0.06, 0.06, 0.6), 'log_light', M((fx + 1.0, Y0 + 0.1, fz + 1.05), (0, 50, 0)))
    mb.add(prim_box(0.2, 0.14, 0.14), 'steel', M((fx + 1.2, Y0 + 0.1, fz + 0.8), (0, 50, 0)), bevel=0.01)
    return mb.build(mats, parent=root)


def cog_flat(mb, T, R, teeth, depth, mat='rust'):
    mb.add(prim_extrude(S.cog(R, teeth, tooth_h=0.16 * max(R, 0.5)), depth, axis='z'), mat, T)
    mb.add(prim_cyl(R * 0.25, R * 0.25, depth * 1.4, 6, base=False), 'iron', T @ M((0, 0, 0), (90, 0, 0)))
    for k in range(3):
        mb.add(prim_box(R * 1.35, R * 0.14, depth * 0.3), 'dark', T @ M((0, 0, depth * 0.52), (0, 0, 60 * k)))


def build_gears(mats, root):
    """Engrenagens toscas na fachada e na lateral direita, correntes e polia de sucata."""
    mb = MeshBuilder('Gears')
    zf = SZ1 + 0.2
    cog_flat(mb, M((2.45, Y0 + 1.75, zf + 0.04)), 0.62, 8, 0.2)
    cog_flat(mb, M((2.3, Y0 + 2.6, zf + 0.12)), 0.32, 6, 0.16, 'iron')
    # engrenagem gigante na lateral direita (eixo em +X)
    T = M((SX1 + 0.22, Y0 + 2.3, -1.6), (0, 90, 0))
    cog_flat(mb, T, 0.85, 10, 0.22)
    cog_flat(mb, M((SX1 + 0.3, Y0 + 3.4, -0.5), (0, 90, 0)), 0.4, 7, 0.16, 'iron')
    chain(mb, (SX1 + 0.4, Y0 + 3.05, -1.0), (SX1 + 0.4, Y0 + 2.5, -0.8), 4)
    # engrenagem-troféu gigante sobre o telhado, em cavalete de toras (silhueta)
    gx, gz = 1.5, -0.3
    gy = 4.55
    cog_flat(mb, M((gx, gy + 0.85, gz)), 0.95, 11, 0.24)
    for sx in (-1, 1):
        beam(mb, (gx + sx * 0.9, 4.0, gz + 0.45), (gx + sx * 0.12, gy + 0.85, gz + 0.1), 0.17, 0.17, 'log', bevel=0.01)
        beam(mb, (gx + sx * 0.9, 4.0, gz - 0.55), (gx + sx * 0.12, gy + 0.85, gz - 0.1), 0.17, 0.17, 'log', bevel=0.01)
    for k in range(6):
        a = math.radians(60 * k + 15)
        mb.add(prim_cone(0.05, 0.22, 4), 'iron', M((gx + 1.0 * math.cos(a), gy + 0.85 + 1.0 * math.sin(a), gz + 0.12), (0, 0, math.degrees(a) - 90)))
    # correntes pendendo do beiral da baia aberta
    for (x, l) in ((-2.9, 6), (-0.8, 5), (0.0, 7)):
        chain(mb, (x, Y0 + 3.15, SZ1 + 0.15), (x, Y0 + 3.15 - 0.11 * l - 0.35, SZ1 + 0.2), l)
    mb.add(prim_cone(0.05, 0.22, 4), 'iron', M((-0.8, Y0 + 2.3, SZ1 + 0.22), (180, 0, 0)))
    return mb.build(mats, parent=root)


def build_yard(mats, root):
    """Pátio: catapulta inacabada, pilha de sucata, pedras, barris, ossos, totens de crânio, espigões."""
    mb = MeshBuilder('Props')
    # --- catapulta em construção (esquerda-frente) ------------------------------------------------
    T = M((-1.75, Y0, 2.55), (0, -18, 0))
    for sx in (-1, 1):
        log(mb, tuple(T @ Vector((sx * 0.5, 0.62, -0.95))), tuple(T @ Vector((sx * 0.5, 0.62, 1.0))), 0.11, 'log', n=6, tip=0.0)
        wh = S.Xf(mb, T @ M((sx * 0.82, 0.48, 0.0)))
        S.plank_wheel(wh, 0.48, sx, hw=0.1)
    for z in (-0.7, 0.75):
        log(mb, tuple(T @ Vector((-0.65, 0.68, z))), tuple(T @ Vector((0.65, 0.68, z))), 0.09, 'log_light', n=6)
    log(mb, tuple(T @ Vector((-0.9, 0.48, 0.0))), tuple(T @ Vector((0.9, 0.48, 0.0))), 0.07, 'log', n=6)
    for sx in (-1, 1):
        for z in (-0.6, 0.5):
            log(mb, tuple(T @ Vector((sx * 0.5, 0.68, z))), tuple(T @ Vector((sx * 0.5, 1.75, -0.05))), 0.085, 'log_light', n=6)
    log(mb, tuple(T @ Vector((-0.6, 1.75, -0.05))), tuple(T @ Vector((0.6, 1.75, -0.05))), 0.075, 'wood_dark', n=6)
    # braço ainda sem concha, deitado no chão ao lado
    a, b = Vector((-0.2, Y0 + 0.14, 4.2)), Vector((-2.6, Y0 + 0.14, 3.7))
    tube(mb, [tuple(a), tuple((a + b) / 2), tuple(b)], [0.1, 0.12, 0.14], 'log_light', n=7, smooth=50)
    # --- sucata (direita-frente): engrenagens, barris, correntes, rodas quebradas ------------------
    for (x, z, y, R, n, rot) in ((2.3, 3.0, 0.0, 0.55, 8, 20), (2.75, 2.45, 0.11, 0.4, 7, -35), (1.85, 2.75, 0.22, 0.34, 6, 70)):
        cog_flat(mb, M((x, Y0 + 0.08 + y, z), (-90, rot, 0)), R, n, 0.16)
    for (x, z) in ((3.0, 3.3), (2.4, 3.55)):
        mb.add(prim_rings([ring_h(0.0, 0.28, 0.28, 8), ring_h(0.32, 0.33, 0.33, 8), ring_h(0.64, 0.28, 0.28, 8)]), 'wood_dark',
               M((x, Y0, z)), smooth=50)
        for y in (0.12, 0.52):
            mb.add(prim_cyl(0.34, 0.34, 0.05, 8), 'iron', M((x, Y0 + y, z)))
    chain(mb, (1.6, Y0 + 0.05, 3.3), (2.2, Y0 + 0.2, 3.4), 5)
    # pilha de pedras de munição e crânios
    for (x, z, s, r) in ((0.6, 3.25, 0.3, 10), (1.05, 3.4, 0.26, 40), (0.85, 3.15, 0.22, 70), (0.75, 3.38, 0.2, 20)):
        rock(mb, (x, Y0 + s * 0.6, z), s, 'stone', r)
    skull(mb, M((0.3, Y0 + 0.2, 3.2), (0, -30, 0)), 0.4)
    # ossos cruzados junto ao portão
    for i, (dx, dz, ry, rz) in enumerate(((0.0, 0.0, 30, 8), (0.1, 0.05, -35, 12))):
        p = Vector((0.7 + dx, Y0 + 0.08 + 0.06 * i, 1.75 + dz))
        mb.add(prim_cyl(0.045, 0.045, 0.8, 6, base=False), 'bone', M(tuple(p), (90, ry, rz)))
        mb.add(prim_sphere(0.075, 0.075, 0.075, 5, 3), 'bone', M(tuple(p + Vector((0.4 * math.sin(math.radians(ry)), 0, 0.4 * math.cos(math.radians(ry)))))))
    # totens com crânio e travessa para o estandarte (estandarte em Anim_Banners)
    for sx in (-1, 1):
        x = sx * 3.35
        log(mb, (x, Y0, 3.2), (x, 4.5, 3.2), 0.11, 'log', n=6, tip=0.0)
        mb.add(prim_cone(0.12, 0.45, 6), 'iron', M((x, 4.5, 3.2)))
        beam(mb, (x - 0.55, 4.0, 3.2), (x + 0.55, 4.0, 3.2), 0.08, 0.08, 'log')
        skull(mb, M((x, 4.15, 3.2 + 0.15)), 0.3)
    # espigões de ferro no perímetro da frente
    for (x, z) in ((-3.45, 1.5), (-3.45, 2.0), (3.45, 1.5), (3.45, 2.0), (-0.6, 3.6), (0.4, 3.6), (-2.6, 3.6)):
        mb.add(prim_cone(0.08, 0.75, 5), 'iron', M((x, Y0, z)))
    return mb.build(mats, parent=root)


def build_banners(mats, root):
    mb = MeshBuilder('Anim_Banners')
    for k, sx in enumerate((-1, 1)):
        x = sx * 3.35
        verts, faces = prim_extrude(tattered(0.85, 1.7, 4, k), 0.035, axis='z')
        verts = S.wave(verts, 0.09, 2.0, 3.0, k)
        mb.add((verts, faces), 'team', M((x, 4.0, 3.2 + 0.08)), smooth=40)
    # faixa rasgada pendurada na viga da baia
    verts, faces = prim_extrude(tattered(0.5, 1.2, 3, 4), 0.03, axis='z')
    verts = [(vx, vy, vz + 0.06 * math.sin(vy * 4.0)) for (vx, vy, vz) in verts]
    mb.add((verts, faces), 'team', M((-1.4, Y0 + 3.05, SZ1 + 0.2)), smooth=40)
    return mb.build(mats, parent=root)


def main():
    args = C.script_args()
    C.reset_scene()
    mats = C.make_paint_set(PALETTE)
    root = C.make_empty('OrcWorkshop')
    base = build_base(mats, root)
    shed = build_shed(mats, root)
    roof = build_roof(mats, root)
    forge = build_forge(mats, root)
    gears = build_gears(mats, root)
    yard = build_yard(mats, root)
    banners = build_banners(mats, root)
    bake_set = [base, shed, roof, forge, gears, yard, banners]
    bpy.context.view_layer.update()
    C.uv_atlas(bake_set, weights={'Base': 0.6, 'Shed': 0.9, 'Roof': 0.9, 'Forge': 1.0, 'Gears': 1.0, 'Props': 1.0, 'Anim_Banners': 1.0},
               margin=0.004, angle=50.0)
    img = C.bake_atlas(bake_set, 'orc_workshop_atlas', int(os.environ.get('ATLAS', 1024)),
                       samples=int(os.environ.get('BAKE_SAMPLES', 32)), margin=6)
    C.finalize_materials(bake_set, img, team_default=TEAM_DEFAULT,
                         out_png=os.path.join(C.BUILD_DIR, 'orc_workshop_atlas.png'))
    static = C.join_objects([base, shed, roof, forge, gears, yard], 'Static_Mesh')
    static.parent = root
    C.make_empty('Socket_UnitSpawn', (0, 0, 4.6), parent=root)
    C.make_empty('Socket_Rally', (0, 0, 6.6), parent=root)
    bpy.context.view_layer.update()
    out = os.path.join(C.OUT_MODELS, 'orc_workshop.glb')
    C.export_glb(root, out, quality=80)
    print('STATS orc_workshop', C.stats(root, out))
    print('BBOX', bbox_game(root))
    if '--no-render' not in args:
        rig = C.RenderRig(root, 'orc_workshop', res=int(os.environ.get('RENDER_RES', 800)), samples=24)
        rig.render('34', (1.0, 0.95, 1.0), 30)
        rig.render('front', (0.0, 0.35, 1.0), 30)
        rig.render('back', (-0.8, 0.8, -1.0), 30)
        rig.render('side', (1.0, 0.25, 0.0), 30)
        rig.render('game', (45, 44, 45), 30, dist=78)
        C.set_team_color('#2f63e0')
        rig.render('34_azul', (1.0, 0.95, 1.0), 30)


if __name__ == '__main__':
    main()
