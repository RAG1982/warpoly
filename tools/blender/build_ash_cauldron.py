"""
build_ash_cauldron.py — Caldeirão de Cinzas orc (tipo `ash_cauldron`, M5-04) gerada 100% por script. Estilo:
build_ship_dock.py / build_orc_oil_platform.py (ferro, ossos, toras, couro).

Uso:
  blender -b --factory-startup --python tools/blender/build_ash_cauldron.py -- [--no-render]

Saída (public/models/ash_cauldron.glb), coordenadas do jogo, origem no centro da pegada (y = 0 = chão), mar = +Z:
  AshCauldron (raiz)
  ├─ Static_Mesh       plataforma de basalto, fogueira de pedras e toras com chamas, caldeirão enorme de ferro (bojo de placas
  │                    rebitadas, borda com espinhos, óleo borbulhando) sobre três pernas de ferro e osso, crânios pendurados,
  │                    escada de toras, calha de tábuas até o píer, totens de crânios, píer de toras com barris (Atlas 512²)
  ├─ Anim_Banners      faixa de guerra de time no bojo e estandarte esfarrapado do mastro (TeamColor)
  ├─ Anim_Crane        forca de ossos com corrente e balde sobre a borda (pivô no topo do poste; oscila em Y)
  ├─ Anim_Smoke        vapor/fumaça acima do óleo (pivô na borda)
  ├─ Socket_UnitSpawn  saída (mar, +Z)
  └─ Socket_Rally      ponto de reunião padrão
Pegada ~6,8 x 9, raio de colisão 3,4; altura ~6,8.
"""
import os
import sys
import math

os.environ.setdefault('ATLAS', '512')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402,F401
from mathutils import Vector  # noqa: E402,F401
import common as C  # noqa: E402
from common import (MeshBuilder, M, prim_box, prim_cyl, prim_cone, prim_sphere, prim_rings, ring_h)  # noqa: E402
from bld_common import beam, tube, log, skull, finish_building  # noqa: E402
import bld_orc as O  # noqa: E402
import build_orc_oil_platform as OP  # noqa: E402
import naval_common as N  # noqa: E402
import ind_common as I  # noqa: E402
from naval_common import Piv  # noqa: E402

TEAM_DEFAULT = '#b81d24'
DK = 0.35
CX, CZ = 0.0, -0.6             # centro do caldeirão
BY = DK + 1.45                 # fundo do bojo
PROFILE = [(0.0, 0.5), (0.25, 0.98), (0.6, 1.45), (1.0, 1.82), (1.5, 2.02), (2.0, 2.06), (2.35, 1.96)]
RIM_Y = BY + 2.35
LIQ_Y = BY + 2.05
PCP = (2.75, DK + 4.9, -0.6)   # pivô da forca

PALETTE = dict(OP.PALETTE)


def bowl_r(h):
    for (h0, r0), (h1, r1) in zip(PROFILE, PROFILE[1:]):
        if h0 <= h <= h1:
            return r0 + (r1 - r0) * (h - h0) / (h1 - h0)
    return PROFILE[-1][1]


def build_base(mats, root):
    mb = MeshBuilder('Base')
    mb.add(prim_cyl(3.5, 3.35, DK - 0.04, 16), 'rock', M((0, 0, CZ)), smooth=0, bevel=0.05)
    mb.add(prim_cyl(3.25, 3.25, 0.06, 16), 'plate_dark', M((0, DK - 0.06, CZ)))
    # anel de pedras da fogueira
    for k in range(9):
        a = 2 * math.pi * k / 9
        mb.add(prim_sphere(0.36, 0.28, 0.34, 7, 4, y_min=-0.3), 'rock_plain', M((CX + math.cos(a) * 1.45, DK - 0.04, CZ + math.sin(a) * 1.45), (0, 20 * k, 0)), smooth=0)
    mb.add(prim_cyl(1.4, 1.4, 0.04, 14), 'coal', M((CX, DK - 0.02, CZ)))
    # toras cruzadas e chamas sob o bojo
    for k in range(5):
        a = math.pi * k / 5 + 0.3
        log(mb, (CX + math.cos(a) * 1.0, DK + 0.12, CZ + math.sin(a) * 1.0), (CX - math.cos(a) * 1.0, DK + 0.2, CZ - math.sin(a) * 1.0), 0.13, 'log', n=6)
    for k in range(6):
        a = 2 * math.pi * k / 6
        r = 0.55 if k % 2 else 0.25
        I.flames(mb, CX + math.cos(a) * r, DK + 0.2, CZ + math.sin(a) * r, s=1.7 + 0.25 * (k % 2), n=2)
    I.flames(mb, CX, DK + 0.25, CZ, s=2.1, n=3)
    # píer de toras e totens
    I.pier(mb, 0.0, 2.3, 5.6, 2.4, DK, deck='plank', stringer='log', post='bone', cap='ivory')
    return mb.build(mats, parent=root)


def build_pot(mats, root, banners):
    mb = MeshBuilder('Pot')
    rings = [ring_h(BY + h, r, r, 18) for (h, r) in PROFILE]
    rings = [[(CX + x, y, CZ + (z)) for (x, y, z) in ring] for ring in rings]
    mb.add(prim_rings(rings, cap0=True, cap1=False), 'plate_dark', smooth=55)
    # placas rebitadas (cintas horizontais) e rebites
    for (h, w) in ((0.55, 0.14), (1.1, 0.16), (1.65, 0.16)):
        r = bowl_r(h) + 0.04
        mb.add(prim_cyl(r, r, w, 18), 'plate', M((CX, BY + h, CZ)), smooth=30)
        for k in range(16):
            a = 2 * math.pi * k / 16
            N.rivets(mb, [(CX + math.cos(a) * (r + 0.03), BY + h + w / 2, CZ + math.sin(a) * (r + 0.03))], 0.035, 'steel')
    # borda grossa de ferro com espinhos de osso
    mb.add(N.torus_prim(2.0, 0.19, 24, 5), 'iron', M((CX, RIM_Y, CZ)), smooth=40)
    for k in range(10):
        a = 2 * math.pi * k / 10 + 0.15
        mb.add(prim_cone(0.09, 0.55, 5), 'ivory', M((CX + math.cos(a) * 2.12, RIM_Y + 0.05, CZ + math.sin(a) * 2.12), (math.sin(a) * 25, 0, -math.cos(a) * 25)), smooth=30)
    # óleo fervente e bolhas
    mb.add(prim_cyl(1.9, 1.9, 0.05, 18), 'oil', M((CX, LIQ_Y, CZ)))
    for k, (dx, dz, r) in enumerate(((0.5, 0.3, 0.22), (-0.7, 0.5, 0.17), (0.2, -0.8, 0.26), (-0.4, -0.3, 0.13), (1.0, -0.4, 0.15), (-0.9, -0.9, 0.2))):
        mb.add(prim_sphere(r, r * 0.55, r, 7, 3, y_min=0.0), 'smoke_light' if k % 2 else 'slop', M((CX + dx, LIQ_Y + 0.02, CZ + dz)), smooth=60)
    # bico/calha de despejo na frente
    mb.add(prim_box(0.7, 0.18, 0.55), 'iron', M((CX, RIM_Y - 0.05, CZ + 2.1), (-18, 0, 0)), bevel=0.02)
    # pernas: três suportes de ferro com presas de osso
    for k in range(3):
        a = 2 * math.pi * k / 3 + math.radians(90)
        p0 = Vector((CX + math.cos(a) * 1.85, DK, CZ + math.sin(a) * 1.85))
        p1 = Vector((CX + math.cos(a) * 1.05, BY + 0.55, CZ + math.sin(a) * 1.05))
        beam(mb, tuple(p0), tuple(p1), 0.36, 0.36, 'plate', bevel=0.03)
        mb.add(prim_cyl(0.26, 0.26, 0.2, 8), 'iron', M(tuple(p0 + Vector((0, 0.08, 0)))), smooth=30)
        mb.add(prim_cone(0.2, 0.6, 5), 'ivory', M((p0.x + math.cos(a) * 0.1, DK + 0.2, p0.z + math.sin(a) * 0.1), (math.sin(a) * 60, 0, -math.cos(a) * 60)), smooth=30)
    # crânios pendurados na borda, com correntes
    for k, a in enumerate((20, 80, 140, 200, 260, 320)):
        ar = math.radians(a)
        x, z = CX + math.cos(ar) * (bowl_r(2.15) + 0.2), CZ + math.sin(ar) * (bowl_r(2.15) + 0.2)
        mb.add(prim_cyl(0.015, 0.015, 0.4, 5), 'iron', M((x, RIM_Y - 0.62, z)))
        skull(mb, M((x, RIM_Y - 0.95, z), (0, -a + 90 + 180, 0)), 0.5, 'bone')
    # escada de toras encostada na borda (frente-direita) com degraus
    lx, lz = 1.7, 0.7
    top = (CX + 1.55, RIM_Y + 0.1, CZ + 1.05)
    for dz in (-0.2, 0.2):
        log(mb, (lx + 0.55 + dz * 0.2, DK, lz + 0.9 + dz), (top[0], top[1], top[2] + dz), 0.07, 'log', n=5)
    for k in range(9):
        t = (k + 0.5) / 9
        a = Vector((lx + 0.55, DK, lz + 0.9)).lerp(Vector(top), t)
        mb.add(prim_box(0.05, 0.05, 0.5), 'wood_light', M(tuple(a)))
    # faixa de guerra de time e rebite do bojo
    banners.add(prim_cyl(bowl_r(1.0) + 0.09, bowl_r(1.0) + 0.09, 0.3, 18), 'team', M((CX, BY + 0.82, CZ)), smooth=30)
    banners.add(prim_cyl(bowl_r(1.9) + 0.07, bowl_r(1.9) + 0.07, 0.16, 18), 'team', M((CX, BY + 1.85, CZ)), smooth=30)
    return mb.build(mats, parent=root)


def build_yard(mats, root, banners):
    mb = MeshBuilder('Yard')
    # calha de tábuas da bica até o píer (Hose do procedural), sobre estacas, com barril no fim
    p0 = Vector((CX, RIM_Y - 0.06, CZ + 2.35))
    p1 = Vector((CX, DK + 0.7, 3.4))
    beam(mb, tuple(p0), tuple(p1), 0.38, 0.1, 'plank', bevel=0.01)
    for sx in (-1, 1):
        beam(mb, tuple(p0 + Vector((sx * 0.19, 0.06, 0))), tuple(p1 + Vector((sx * 0.19, 0.06, 0))), 0.06, 0.1, 'log')
    for t in (0.4, 0.8):
        q = p0.lerp(p1, t)
        for sx in (-1, 1):
            log(mb, (q.x + sx * 0.2, DK, q.z), (q.x + sx * 0.2, q.y - 0.05, q.z), 0.07, 'log', n=5)
    O.barrel_orc(mb, 0.0, DK, 3.75, r=0.3, h=0.65)
    O.barrel_orc(mb, -0.75, DK, 3.3, r=0.26, h=0.58)
    O.barrel_orc(mb, -0.85, DK, 4.1, r=0.26, h=0.58)
    O.barrel_orc(mb, 0.8, DK, 4.4, r=0.26, h=0.58)
    O.barrel_orc(mb, 0.75, DK, 5.1, r=0.24, h=0.55)
    N.rope_coil(mb, -0.7, DK, 5.0, R=0.26, r=0.06, turns=3, rot=10)
    # totens de crânios nos lados
    for sx in (-1, 1):
        x = sx * 3.0
        log(mb, (x, DK, -1.6), (x, DK + 3.0, -1.6), 0.13, 'log', n=6)
        skull(mb, M((x, DK + 3.2, -1.6), (0, 0, 0)), 0.65, 'bone')
        for dz in (-0.35, 0.35):
            mb.add(prim_cone(0.07, 0.6, 5), 'ivory', M((x + sx * 0.05, DK + 2.4, -1.6 + dz), (sx * 20, 0, -sx * 55)), smooth=30)
        mb.add(prim_cyl(0.18, 0.18, 0.08, 8), 'iron', M((x, DK + 1.5, -1.6)), smooth=30)
    # pilha de lenha e ossos na lateral
    for k in range(6):
        log(mb, (-2.6, DK + 0.12 + 0.22 * (k // 3), 1.0 + 0.26 * (k % 3)), (-1.5, DK + 0.12 + 0.22 * (k // 3), 1.0 + 0.26 * (k % 3)), 0.11, 'log', n=6)
    # mastro do estandarte
    O.banner_pole(mb, 2.9, DK, 1.4, 3.4, banners=banners, w=0.8, bh=1.15)
    return mb.build(mats, parent=root)


def build_gallows(mats, root):
    mb = MeshBuilder('Gallows')
    x, y, z = PCP
    mb.add(prim_box(0.8, 0.3, 0.8, base=True), 'rock_plain', M((x, DK, z)), bevel=0.04)
    tube(mb, [(x, DK + 0.3, z), (x, y - 0.12, z)], [0.2, 0.15], 'log', n=7, smooth=40)
    for yy in (0.9, 2.0, 3.1):
        mb.add(prim_cyl(0.21, 0.21, 0.1, 8), 'iron', M((x, DK + yy, z)), smooth=30)
    for sx, sz in ((1, 0), (0, 1), (0, -1)):
        O.tusk(mb, (x + sx * 0.8, DK + 0.2, z + sz * 0.8), (x + sx * 0.15, DK + 2.6, z + sz * 0.15), (sx * 0.12, 0.0, sz * 0.12), r0=0.15, mat='ivory')
    mb.add(prim_cyl(0.28, 0.28, 0.14, 10), 'iron', M((x, y - 0.12, z)), smooth=30)
    return mb.build(mats, parent=root)


def build_arm(mats, root):
    """Forca de ossos (Anim_Crane): braço de tora com corrente e balde; fica sobre a borda do caldeirão."""
    mb = MeshBuilder('Anim_Crane')
    an = Piv(mb, PCP)
    x, y, z = PCP
    tip = Vector((x - 2.35, y + 0.15, z))
    base = Vector((x + 0.45, y - 0.05, z))
    beam(an, tuple(base), tuple(tip), 0.26, 0.22, 'log', bevel=0.02)
    for t in (0.3, 0.7):
        p = base.lerp(tip, t)
        an.add(prim_box(0.12, 0.34, 0.3), 'iron', M(tuple(p)), bevel=0.01)
    an.add(prim_sphere(0.19, 0.17, 0.19, 8, 4), 'iron', M((x, y, z)), smooth=50)
    an.add(prim_sphere(0.28, 0.26, 0.28, 7, 4), 'bone', M((x + 0.55, y - 0.25, z)), smooth=50)
    O.tusk(an, tuple(tip), (tip.x - 0.4, tip.y + 0.35, tip.z), (0.0, 0.1, 0.0), r0=0.1, mat='ivory')
    # corrente e balde de ferro
    for k in range(7):
        an.add(N.torus_prim(0.07, 0.02, 8, 4), 'iron', M((tip.x, tip.y - 0.1 - 0.13 * k, tip.z), (0, 90 * (k % 2), 0)), smooth=0)
    by = tip.y - 1.2
    an.add(prim_cyl(0.3, 0.24, 0.42, 10), 'plate_dark', M((tip.x, by - 0.42, tip.z)), smooth=30)
    an.add(N.torus_prim(0.3, 0.03, 10, 4), 'iron', M((tip.x, by, tip.z)), smooth=40)
    an.add(prim_cyl(0.26, 0.26, 0.03, 10), 'oil', M((tip.x, by - 0.05, tip.z)))
    return mb.build(mats, parent=root, location=PCP)


def build_smoke(mats, root):
    mb = MeshBuilder('Anim_Smoke')
    pv = (CX, RIM_Y + 0.35, CZ)
    I.smoke_puffs(Piv(mb, pv), pv, top=1.6, r0=0.3, rmax=0.62, light_from=3)
    return mb.build(mats, parent=root, location=pv)


def main():
    args = C.script_args()
    C.reset_scene()
    N.patch_small_bevels(0.025)
    mats = C.make_paint_set(PALETTE)
    root = C.make_empty('AshCauldron')
    bmb = MeshBuilder('Anim_Banners')
    base = build_base(mats, root)
    pot = build_pot(mats, root, bmb)
    yard = build_yard(mats, root, bmb)
    gallows = build_gallows(mats, root)
    arm = build_arm(mats, root)
    smoke = build_smoke(mats, root)
    banners = bmb.build(mats, parent=root)
    weights = {'Base': 0.8, 'Pot': 1.6, 'Yard': 1.0, 'Gallows': 0.5, 'Anim_Banners': 0.9, 'Anim_Crane': 0.6, 'Anim_Smoke': 0.3}
    finish_building(root, 'ash_cauldron', 'ash_cauldron.glb', 'ash_cauldron_atlas', [base, pot, yard, gallows], banners, weights, TEAM_DEFAULT, args,
                    spawn=(0, 0, 6.0), rally=(0, 0, 7.4), extra_anim=[arm, smoke], game_dist=72,
                    extra_views=[('ref', (-1.0, 0.95, 1.0)), ('ref2', (1.0, 0.95, 1.0)), ('low', (0.6, 0.12, 1.0))])


if __name__ == '__main__':
    main()
