"""
build_war_serpent.py — Serpe de Guerra (orc, tipo interno `war_serpent`) gerada 100% por script.

Ataque aéreo orc: corpo sinuoso de escamas verde-escuras com ventre claro e anéis, crista dorsal de placas de
osso, couraça de ossos e ferro, sela de couro com manta em cor de time, cabeça de serpente com presas, chifres,
babados e olhos âmbar na face frontal (+Z), duas asas de morcego (dedos de osso, membrana em cor de time) e
cauda com ferrão de aço.

Uso:
  blender -b --factory-startup --python tools/blender/build_war_serpent.py -- [--no-render]

Hierarquia (nomes lidos por `ModelFactory.rebindUserData` / `UnitAnimator.applyAir`):
  WarSerpent (raiz)
  └─ Torso   corpo, cauda, sela, couraça (pivô na origem; base em y ~ 0,5)
     ├─ Head    cabeça de serpente (pivô (0; 1,32; 1,25))
     ├─ WingL   pivô (−0,36; 1,48; 0,1)  (bate em z)
     └─ WingR   pivô (+0,36; 1,48; 0,1)
Frente = +Z. Cor de time: membrana das asas, manta da sela, estandarte da cauda.
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
from bld_common import beam, tube, log, bbox_game  # noqa: E402
import air_common as A  # noqa: E402

TEAM_DEFAULT = '#b81d24'
HEAD_PIVOT = (0.0, 1.32, 1.25)
WING_PIVOT = (0.36, 1.48, 0.1)

PALETTE = A.base_palette()
PALETTE.update({
    'scale': dict(base='#2a6a3a', var='#14452a', var_scale=3.0, var_amt=0.8, fine=0.1, pattern='bricks', mapping='box',
                  pw=0.16, ph=0.12, mortar='#0f2e1c', mortar_size=0.012, brick_tint='#3f8a4c', brick_tint_amt=0.5,
                  brick_dark=0.85, brick_lite=1.1, top=0.4, ao=(0.5, 0.5)),
    'scale_dark': dict(base='#1d4a2c', var='#0e2c1a', var_scale=3.0, var_amt=0.8, fine=0.1, pattern='bricks',
                       mapping='box', pw=0.16, ph=0.12, mortar='#08180e', mortar_size=0.012, brick_tint='#2a6a3a',
                       brick_tint_amt=0.5, brick_dark=0.85, brick_lite=1.1, top=0.35, ao=(0.5, 0.5)),
    'belly': dict(base='#c9b97a', var='#a89858', var_scale=4.0, var_amt=0.7, fine=0.1, pattern='planks_v', mapping='box',
                  pw=3.0, ph=0.1, mortar='#6f6232', mortar_size=0.015, top=0.35, ao=(0.4, 0.5)),
    'bone': dict(base='#c8bd9c', var='#a09476', var_scale=4.0, var_amt=0.7, fine=0.06, top=0.35, edge='#fff7de',
                 edge_amt=0.6, edge_r=0.02, ao=(0.3, 0.55)),
    'amber': dict(base='#ffc23a', var='#ff9a1a', var_scale=10.0, emit_boost=1.3, top=0.3),
    'tongue': dict(base='#a8202a', var='#7a1420', var_scale=8.0, top=0.3),
    'horn': dict(base='#3c2a1c', var='#281a10', var_scale=4.0, fine=0.08, top=0.3, edge='#6b5038', edge_amt=0.5,
                 edge_r=0.02),
    'spike': dict(base='#cfc7a8', var='#a89e80', var_scale=5.0, top=0.4, edge='#fff7de', edge_amt=0.5, edge_r=0.015),
})

SPINE = [(0.0, 1.30, 1.12), (0.0, 1.26, 0.62), (0.0, 1.12, 0.0), (0.0, 1.0, -0.6), (0.0, 1.06, -1.2),
         (0.0, 1.22, -1.75), (0.0, 1.36, -2.15), (0.0, 1.30, -2.5)]
RADII = [(0.2, 0.2), (0.36, 0.34), (0.45, 0.42), (0.42, 0.38), (0.33, 0.31), (0.22, 0.21), (0.13, 0.13), (0.04, 0.04)]


def body_mat(c, n):
    """Ventre claro por baixo; anéis alternados de escama clara/escura ao longo do corpo."""
    if n[1] < -0.45:
        return 'belly'
    return 'scale' if int((c[2] + 4.0) / 0.22) % 2 else 'scale_dark'


def spine_at(t):
    """Ponto da espinha (Catmull-Rom simples por interpolação linear suavizada) e tangente."""
    n = len(SPINE) - 1
    f = max(0.0, min(0.9999, t)) * n
    i = int(f)
    u = f - i
    u = u * u * (3 - 2 * u)
    p = Vector(SPINE[i]).lerp(Vector(SPINE[i + 1]), u)
    d = (Vector(SPINE[i + 1]) - Vector(SPINE[i])).normalized()
    return p, d


def radius_at(t):
    n = len(RADII) - 1
    f = max(0.0, min(0.9999, t)) * n
    i = int(f)
    u = f - i
    return RADII[i][0] * (1 - u) + RADII[i + 1][0] * u


def build_torso(mats, root):
    mb = MeshBuilder('Torso')
    A.tube(mb, SPINE, RADII, 'scale', n=12, smooth=70, mat_fn=body_mat)
    # crista dorsal: placas triangulares de osso ao longo das costas (menores rumo à cauda)
    for k in range(15):
        t = 0.04 + k * 0.058
        p, d = spine_at(t)
        r = radius_at(t)
        h = 0.08 + 0.34 * r
        mb.add(prim_extrude([(-0.1 * r - 0.04, 0), (0.1 * r + 0.04, 0), (-0.05, h)], 0.04, axis='x'), 'spike',
               Matrix.Translation(p + Vector((0, r * 0.95, 0))) @ M(r=(0, 0, 0)), bevel=0.0)
    # couraça de ossos: 5 costelas arqueadas em volta do tronco (ossos + abraçadeira de ferro)
    for k, t in enumerate((0.2, 0.3, 0.4, 0.5)):
        p, d = spine_at(t)
        r = radius_at(t)
        mb.add(prim_rings([ring_h(-0.035, r * 1.02, r * 0.98, 12), ring_h(0.035, r * 1.02, r * 0.98, 12)], cap0=False, cap1=False),
               'bone' if k % 2 == 0 else 'iron', Matrix.Translation(p) @ A.orient(d) @ M(r=(0, 0, 0)), smooth=30)
    # sela de couro com manta de time e estribos de corda
    sp, sd = spine_at(0.33)
    mb.add(prim_box(0.62, 0.08, 0.7, taper=(0.9, 0.95)), 'team', M((0, sp.y + 0.43, sp.z)), bevel=0.015)
    for sx in (-1, 1):
        mb.add(prim_box(0.05, 0.42, 0.66), 'team', M((sx * 0.4, sp.y + 0.24, sp.z), (0, 0, -sx * 18)), bevel=0.01)
        beam(mb, (sx * 0.4, sp.y + 0.35, sp.z + 0.05), (sx * 0.52, sp.y - 0.15, sp.z + 0.05), 0.03, 0.03, 'rope')
        mb.add(prim_box(0.12, 0.03, 0.1), 'iron', M((sx * 0.52, sp.y - 0.17, sp.z + 0.05)))
    mb.add(prim_box(0.54, 0.16, 0.08), 'leather', M((0, sp.y + 0.52, sp.z + 0.3), (-20, 0, 0)), bevel=0.012)
    mb.add(prim_box(0.54, 0.24, 0.07), 'leather', M((0, sp.y + 0.55, sp.z - 0.34), (14, 0, 0)), bevel=0.012)
    # cauda: anéis de ferro com espinhos e ferrão de aço com farpa
    for t in (0.72, 0.82, 0.9):
        p, d = spine_at(t)
        r = radius_at(t)
        mb.add(prim_rings([ring_h(-0.03, r * 1.12, r * 1.12, 8), ring_h(0.03, r * 1.12, r * 1.12, 8)], cap0=False, cap1=False),
               'iron', Matrix.Translation(p) @ A.orient(d), smooth=30)
        for sx in (-1, 1):
            mb.add(prim_cone(0.03, 0.14, 4), 'iron', Matrix.Translation(p + Vector((sx * r * 1.1, 0.0, 0.0))) @ M(r=(0, 0, -sx * 90)))
    tp, td = spine_at(0.995)
    mb.add(prim_sphere(0.1, 0.1, 0.1, 7, 4), 'scale_dark', M(tuple(tp + Vector((0, 0, -0.02)))), smooth=70)
    stinger = bezier(tuple(tp + Vector((0, 0.0, -0.05))), tuple(tp + Vector((0, 0.2, -0.28))), tuple(tp + Vector((0, 0.42, -0.2))), 4)
    tube(mb, stinger, [0.07, 0.06, 0.048, 0.03, 0.006], 'steel', n=6, smooth=50)
    mb.add(prim_cone(0.03, 0.12, 4), 'steel', M(tuple(tp + Vector((0, 0.3, -0.3))), (0, 0, 0)), smooth=0)
    # estandarte esfarrapado de time na ponta da cauda
    pole = [(0.0, 0.0), (0.0, -0.55), (-0.2, -0.4), (-0.4, -0.55), (-0.4, 0.0)]
    verts, faces = prim_extrude(pole, 0.025, axis='x')
    verts = [(x + 0.04 * math.sin(y * 7.0), y, z) for (x, y, z) in verts]
    mb.add((verts, faces), 'team', M(tuple(tp + Vector((0, 0.0, 0.0))), (0, 0, 0)), smooth=40)
    mb.add(prim_cyl(0.02, 0.02, 0.5, 5), 'bone', M(tuple(tp + Vector((0, 0.05, 0.0)))))
    # garras na barriga (patas minúsculas de serpente-dragão), tuck para voo
    for sx in (-1, 1):
        p, d = spine_at(0.28)
        tube(mb, [(sx * 0.3, p.y - 0.28, p.z), (sx * 0.34, p.y - 0.52, p.z + 0.12), (sx * 0.34, p.y - 0.6, p.z + 0.28)], [0.09, 0.07, 0.05], 'scale_dark', n=6, smooth=55)
        for k in range(3):
            mb.add(prim_cone(0.022, 0.12, 4), 'horn', M((sx * 0.34 + (k - 1) * 0.04, p.y - 0.62, p.z + 0.34), (110, 0, 0)))
    return mb.build(mats, parent=root, location=(0, 0, 0))


def build_head(mats, torso):
    mb = MeshBuilder('Head')
    # crânio: bloco afunilado; focinho alongado (+Z); mandíbula inferior aberta; face só na frente
    A.tube(mb, [(0, 0.04, -0.25), (0, 0.04, 0.05), (0, 0.0, 0.4), (0, -0.04, 0.62)],
           [(0.2, 0.18), (0.22, 0.2), (0.17, 0.13), (0.1, 0.07)], 'scale', n=10, smooth=65,
           mat_fn=lambda c, n: 'belly' if n[1] < -0.55 else None)
    # mandíbula inferior com presas curvas, levemente aberta
    A.tube(mb, [(0, -0.12, -0.12), (0, -0.14, 0.25), (0, -0.14, 0.58)], [(0.18, 0.07), (0.14, 0.06), (0.07, 0.04)], 'scale_dark', n=8, smooth=60)
    mb.add(prim_box(0.14, 0.03, 0.4), 'tongue', M((0, -0.1, 0.3)))  # língua
    for sx in (-1, 1):
        tube(mb, [(sx * 0.07, -0.13, 0.54), (sx * 0.075, -0.02, 0.6)], [0.025, 0.006], 'bone', n=5, smooth=40)  # presa inferior
        mb.add(prim_cone(0.04, 0.2, 5), 'bone', M((sx * 0.09, -0.05, 0.5), (180, 0, 0)), smooth=40)  # presa superior
        # chifres curvos para trás
        hp = bezier((sx * 0.14, 0.17, -0.08), (sx * 0.26, 0.3, -0.3), (sx * 0.3, 0.2, -0.55), 4)
        tube(mb, hp, [0.06, 0.05, 0.04, 0.025, 0.006], 'horn', n=6, smooth=50)
        # olhos âmbar na face frontal, com pálpebra pesada e fenda vertical
        mb.add(prim_box(0.12, 0.035, 0.06), 'scale_dark', M((sx * 0.13, 0.17, 0.21), (0, 0, sx * -14)), bevel=0.006)
        mb.add(prim_sphere(0.055, 0.05, 0.035, 7, 4), 'amber', M((sx * 0.13, 0.12, 0.2)), smooth=70)
        mb.add(prim_box(0.012, 0.075, 0.02), 'pupil', M((sx * 0.13, 0.12, 0.24)))
        # narinas
        mb.add(prim_sphere(0.022, 0.022, 0.02, 5, 3), 'dark', M((sx * 0.04, 0.05, 0.64)), smooth=60)
        # babado de membrana (cor de time) atrás do olho
        frill = [(0.0, 0.1), (0.36, 0.3), (0.4, 0.02), (0.3, -0.2), (0.0, -0.08)]
        mb.add(prim_extrude(frill, 0.03, axis='y'), 'team', M((sx * 0.14, 0.1, -0.16), (0, 0, 0), (sx, 1, 1)), smooth=30)
    # crista de espinhos na nuca
    for k in range(5):
        mb.add(prim_cone(0.04, 0.2 - 0.02 * k, 4), 'spike', M((0, 0.2 - 0.02 * k, -0.15 - 0.09 * k), (-100 - 5 * k, 0, 0)), smooth=0)
    return mb.build(mats, parent=torso, location=HEAD_PIVOT)


def build_wing(mats, torso, side):
    s = side
    mb = MeshBuilder('WingL' if s < 0 else 'WingR')
    wrist = Vector((s * 1.0, 0.42, 0.28))
    elbow = Vector((s * 0.5, 0.2, 0.18))
    # braço de osso/escama até o pulso + garra do polegar
    tube(mb, [(0, 0, 0.12), tuple(elbow), tuple(wrist)], [0.13, 0.1, 0.075], 'scale', n=8, smooth=60)
    mb.add(prim_sphere(0.09, 0.09, 0.09, 7, 4), 'scale_dark', M(tuple(wrist)), smooth=70)
    mb.add(prim_cone(0.04, 0.2, 5), 'horn', M(tuple(wrist + Vector((s * 0.0, 0.05, 0.14))), (70, 0, 0)), smooth=0)
    # dedos: 4 hastes finas do pulso às pontas; membrana em leque (cor de time) entre eles
    tips = [Vector((s * 1.95, 0.02, 0.55)), Vector((s * 2.05, -0.12, -0.15)), Vector((s * 1.75, -0.2, -0.8)),
            Vector((s * 1.2, -0.22, -1.2))]
    for k, tp in enumerate(tips):
        mid = wrist.lerp(tp, 0.5) + Vector((0, 0.08, 0.0))
        tube(mb, [tuple(wrist), tuple(mid), tuple(tp)], [0.045, 0.035, 0.012], 'bone', n=5, smooth=45)
        mb.add(prim_cone(0.022, 0.1, 4), 'horn', M(tuple(tp), (0, 0, 0)) @ A.orient(tp - wrist), smooth=0)
    body_back = Vector((s * 0.05, -0.15, -0.95))
    body_front = Vector((0.0, 0.0, 0.3))
    pts = [tips[0], tips[0].lerp(tips[1], 0.5) + Vector((-s * 0.1, -0.04, 0.12)), tips[1],
           tips[1].lerp(tips[2], 0.5) + Vector((-s * 0.12, -0.05, 0.14)), tips[2],
           tips[2].lerp(tips[3], 0.5) + Vector((-s * 0.1, -0.06, 0.14)), tips[3], body_back, body_front]
    mb.add(A.fan_membrane(tuple(wrist), [tuple(p) for p in pts], thick=0.03), 'team', M((0, 0, 0)), smooth=0)
    # costuras de osso sobre a membrana (nervuras entre o corpo e os dedos)
    for tp in (tips[2], tips[3]):
        beam(mb, tuple(body_back.lerp(tp, 0.25)), tuple(body_back.lerp(tp, 0.9)), 0.03, 0.02, 'bone')
    return mb.build(mats, parent=torso, location=(s * WING_PIVOT[0], WING_PIVOT[1], WING_PIVOT[2]))


def main():
    args = C.script_args()
    C.reset_scene()
    mats = C.make_paint_set(PALETTE)
    root = C.make_empty('WarSerpent')
    torso = build_torso(mats, root)
    head = build_head(mats, torso)
    wl = build_wing(mats, torso, -1)
    wr = build_wing(mats, torso, 1)
    parts = [torso, head, wl, wr]
    A.finish_air('war_serpent', 'war_serpent.glb', 'war_serpent_atlas', root, parts,
                 {'Torso': 1.0, 'Head': 1.5, 'WingL': 1.0, 'WingR': 1.0}, TEAM_DEFAULT, args, game_dist=28.0)
    print('BBOX', bbox_game(root))


if __name__ == '__main__':
    main()
