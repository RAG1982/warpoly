"""
build_glider.py — Planador de Engenho (humano, tipo interno `glider`) gerado 100% por script.

Batedor aéreo: casco de madeira em forma de barco com quilha/esqui, bico de latão com hélice de brinquedo,
mastro central com cordame até as asas, duas asas de pano em cor de time com nervuras de madeira, longarina e
borda de fuga recortada, cauda com leme e estabilizador, piloto de capacete de aço e óculos.

Uso:
  blender -b --factory-startup --python tools/blender/build_glider.py -- [--no-render]

Hierarquia (nomes lidos por `ModelFactory.rebindUserData` / `UnitAnimator.applyAir`):
  Glider (raiz)
  └─ Torso   casco, mastro, cauda, piloto (pivô na origem; base em y = 0)
     ├─ Head     capacete + rosto do piloto (pivô (0; 1,16; 0,25))
     ├─ WingL    pivô (−0,2; 0,95; 0,1)   (bate em z)
     └─ WingR    pivô (+0,2; 0,95; 0,1)
Frente = +Z. Cor de time: pano das asas, leme, estabilizador, flâmula e faixa do piloto.
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

TEAM_DEFAULT = '#3a66d6'
HULL_Y = 0.56
WING_PIVOT = (0.2, 0.95, 0.1)
HEAD_PIVOT = (0.0, 1.16, 0.25)
MAST_TOP = (0.0, 1.62, 0.1)

PALETTE = A.base_palette()
PALETTE.update({
    'brass': dict(base='#d0a040', var='#9a6e1e', var_scale=9.0, var_amt=0.7, fine=0.06, top=0.4, edge='#ffeaa0',
                  edge_amt=1.0, edge_r=0.016, edge_gain=12.0, ao=(0.2, 0.5)),
    'hull': dict(base='#9a6a38', var='#76502a', var_scale=2.0, fine=0.08, pattern='planks', mapping='box',
                 pw=3.0, ph=0.12, mortar='#3a2615', mortar_size=0.02, top=0.3, edge='#d0a070', edge_amt=0.45,
                 edge_r=0.02, ao=(0.5, 0.65)),
    'canvas': dict(base='#e6dcc0', var='#cdbf9c', var_scale=3.0, fine=0.1, top=0.25, ao=(0.3, 0.5)),
    'skin': dict(base='#e0a47e', var='#c98a66', var_scale=8.0, fine=0.04, top=0.3),
    'tunic': dict(base='#4f7a45', var='#3b5f33', var_scale=6.0, fine=0.1, top=0.25, ao=(0.25, 0.5)),
    'lens': dict(base='#9fd8e8', var='#6fb4cc', var_scale=10.0, emit_boost=1.1, top=0.4),
    'cloth_dark': dict(base='#6d655a', var='#544d44', var_scale=6.0, fine=0.1, top=0.2, team=True),
})


def build_torso(mats, root):
    mb = MeshBuilder('Torso')
    # casco em forma de barco: loft ao longo de z, mais largo no meio
    hull_pts = [(0, HULL_Y, -1.25), (0, HULL_Y + 0.04, -0.8), (0, HULL_Y + 0.03, -0.2), (0, HULL_Y, 0.5),
                (0, HULL_Y - 0.02, 1.0), (0, HULL_Y - 0.04, 1.2)]
    hull_r = [(0.05, 0.05), (0.17, 0.15), (0.26, 0.22), (0.23, 0.2), (0.14, 0.12), (0.05, 0.05)]
    A.tube(mb, hull_pts, hull_r, 'hull', n=10, smooth=60)
    # cabine aberta: borda de madeira clara em volta do assento + interior escuro
    mb.add(prim_box(0.34, 0.07, 0.62, taper=(1.0, 1.0)), 'wood_light', M((0, HULL_Y + 0.2, 0.2)), bevel=0.015)
    mb.add(prim_box(0.26, 0.05, 0.5), 'dark', M((0, HULL_Y + 0.215, 0.2)))
    # cintas de ferro no casco
    for z in (-0.65, 0.0, 0.62):
        r = 0.2 if abs(z) < 0.1 else 0.17
        mb.add(prim_box(2 * r + 0.04, 0.04, 0.05, taper=(1, 1)), 'iron', M((0, HULL_Y + 0.18, z)))
        mb.add(prim_box(0.04, 0.32, 0.05), 'iron', M((r + 0.01, HULL_Y, z)))
        mb.add(prim_box(0.04, 0.32, 0.05), 'iron', M((-r - 0.01, HULL_Y, z)))
    # quilha e esqui (base y = 0)
    mb.add(prim_box(0.1, 0.12, 2.2, taper=(1.0, 0.8)), 'wood_dark', M((0, 0.42, 0.0)), bevel=0.012)
    mb.add(prim_box(0.12, 0.07, 1.6, taper=(1.0, 0.7)), 'wood_dark', M((0, 0.08, 0.1)), bevel=0.012)
    mb.add(prim_cone(0.06, 0.4, 6), 'wood_dark', M((0, 0.08, 0.95), (90, 0, 0)))
    for z in (-0.4, 0.55):
        beam(mb, (0.0, 0.42, z), (0.0, 0.1, z), 0.07, 0.07, 'wood', bevel=0.01)
        mb.add(prim_box(0.28, 0.04, 0.05), 'iron', M((0, 0.1, z)))
    # bico de latão + hélice de brinquedo (estática)
    mb.add(prim_cone(0.15, 0.4, 8, base=True), 'brass', M((0, HULL_Y - 0.02, 1.2), (90, 0, 0)), smooth=50)
    mb.add(prim_sphere(0.08, 0.08, 0.08, 7, 4), 'brass', M((0, HULL_Y - 0.02, 1.62)), smooth=70)
    for k in range(2):
        mb.add(prim_box(0.06, 0.62, 0.015, taper=(0.5, 1.0)), 'wood_light', M((0, HULL_Y - 0.02, 1.58), (0, 0, 90 * k + 25)),
               bevel=0.004)
    # gerador de engrenagens na cabine (decoração de engenho): engrenagem de latão atrás do assento
    mb.add(prim_cyl(0.13, 0.13, 0.04, 10, base=False), 'brass', M((0.0, HULL_Y + 0.37, -0.28), (90, 0, 0)), smooth=0)
    for k in range(8):
        a = math.radians(45 * k)
        mb.add(prim_box(0.05, 0.05, 0.045), 'brass', M((0.15 * math.cos(a), HULL_Y + 0.37 + 0.15 * math.sin(a), -0.28),
                                                       (0, 0, math.degrees(a))))
    # mastro central (madeira) + cabeça de latão
    mb.add(prim_cyl(0.045, 0.06, 0.9, 6, base=True), 'wood_dark', M((0, 0.8, 0.1)), smooth=30)
    mb.add(prim_cyl(0.07, 0.07, 0.07, 8), 'brass', M((0, 1.7, 0.1)), smooth=30)
    mb.add(prim_sphere(0.06, 0.06, 0.06, 6, 3), 'brass', M((0, 1.8, 0.1)), smooth=70)
    # flâmula de time no topo do mastro
    pole = [(0.0, 0.0), (0.0, -0.17), (-0.52, -0.1), (-0.4, -0.06), (-0.52, -0.02)]
    verts, faces = prim_extrude(pole, 0.025, axis='z')
    verts = [(x, y, z + 0.04 * math.sin(x * 9.0)) for (x, y, z) in verts]
    mb.add((verts, faces), 'team', M((-0.0, 1.76, 0.1), (0, 0, 0)), smooth=40)
    # cauda: boom de duas vigas, leme vertical, estabilizador em cor de time
    for sx in (-1, 1):
        beam(mb, (sx * 0.06, HULL_Y + 0.05, -1.1), (sx * 0.04, HULL_Y + 0.12, -1.78), 0.06, 0.06, 'wood', bevel=0.008)
    mb.add(prim_box(0.06, 0.52, 0.5, taper=(1.0, 0.7)), 'team', M((0, HULL_Y + 0.4, -1.72), (0, 0, 0)), bevel=0.008)
    mb.add(prim_box(0.05, 0.62, 0.05), 'wood_dark', M((0, HULL_Y + 0.38, -1.5)))
    mb.add(prim_extrude([(-0.5, -0.1), (0.5, -0.1), (0.38, -0.45), (-0.38, -0.45)], 0.035, axis='y'), 'team',
           M((0, HULL_Y + 0.14, -1.45)), bevel=0.005)
    mb.add(prim_box(1.0, 0.045, 0.05), 'wood_dark', M((0, HULL_Y + 0.14, -1.45)))
    mb.add(prim_box(0.76, 0.045, 0.04), 'wood_dark', M((0, HULL_Y + 0.14, -1.9)))
    mb.add(prim_cone(0.03, 0.12, 5), 'brass', M((0, HULL_Y + 0.4, -1.98), (-90, 0, 0)))
    # piloto: tronco com colete (time), braços na barra de comando, cinto
    shirt = [ring_h(-0.1, 0.13, 0.1, 10, cz=0.0), ring_h(0.08, 0.16, 0.11, 10), ring_h(0.22, 0.17, 0.11, 10),
             ring_h(0.3, 0.11, 0.09, 10)]
    mb.add(prim_rings(shirt), 'tunic', M((0, HULL_Y + 0.24, 0.25)), smooth=60)
    vest = [ring_h(-0.08, 0.14, 0.108, 10), ring_h(0.08, 0.172, 0.12, 10), ring_h(0.22, 0.18, 0.12, 10)]
    mb.add(prim_rings(vest, cap0=False, cap1=False), 'team', M((0, HULL_Y + 0.24, 0.25)), smooth=55)
    mb.add(prim_box(0.3, 0.04, 0.26), 'leather', M((0, HULL_Y + 0.17, 0.25)))
    for sx in (-1, 1):
        tube(mb, [(sx * 0.19, HULL_Y + 0.48, 0.25), (sx * 0.2, HULL_Y + 0.45, 0.42), (sx * 0.16, HULL_Y + 0.4, 0.58)],
             [0.045, 0.04, 0.04], 'tunic', n=6, smooth=50)
        mb.add(prim_sphere(0.045, 0.04, 0.045, 6, 3), 'leather_dark', M((sx * 0.16, HULL_Y + 0.4, 0.6)), smooth=70)
    # barra de comando e painel de instrumentos
    mb.add(prim_cyl(0.025, 0.025, 0.46, 6, base=False), 'wood_dark', M((0, HULL_Y + 0.4, 0.6), (0, 0, 90)), smooth=30)
    mb.add(prim_box(0.34, 0.1, 0.05, taper=(1.0, 1.0)), 'wood_dark', M((0, HULL_Y + 0.26, 0.74), (-20, 0, 0)), bevel=0.008)
    mb.add(prim_cyl(0.04, 0.04, 0.02, 8, base=False), 'brass', M((0, HULL_Y + 0.29, 0.77), (70, 0, 0)))
    return mb.build(mats, parent=root, location=(0, 0, 0))


def build_head(mats, torso):
    mb = MeshBuilder('Head')
    # cabeça pequena (pele lisa) + capacete de aço aberto com óculos; rosto só na face +Z
    mb.add(prim_sphere(0.115, 0.13, 0.115, 9, 5), 'skin', M((0, 0, 0)), smooth=70)
    mb.add(prim_sphere(0.15, 0.115, 0.15, 10, 4, y_min=0.0), 'steel', M((0, 0.03, -0.01)), smooth=60)
    mb.add(prim_cyl(0.155, 0.155, 0.04, 10), 'iron', M((0, 0.035, -0.01)), smooth=30)
    mb.add(prim_box(0.05, 0.08, 0.25), 'brass', M((0, 0.17, -0.01)), bevel=0.01)  # crista
    for sx in (-1, 1):  # abas laterais
        mb.add(prim_box(0.05, 0.14, 0.13, taper=(0.8, 0.9)), 'steel', M((sx * 0.13, -0.04, -0.01)), bevel=0.01)
    # óculos: faixa de couro e duas lentes (face +Z)
    mb.add(prim_box(0.25, 0.045, 0.02), 'leather_dark', M((0, 0.015, 0.108)))
    for sx in (-1, 1):
        mb.add(prim_sphere(0.045, 0.045, 0.03, 7, 3), 'brass', M((sx * 0.055, 0.015, 0.115)), smooth=60)
        mb.add(prim_sphere(0.034, 0.034, 0.02, 7, 3), 'lens', M((sx * 0.055, 0.015, 0.14)), smooth=70)
    mb.add(prim_box(0.035, 0.05, 0.04), 'skin', M((0, -0.03, 0.12)))  # nariz
    mb.add(prim_box(0.08, 0.018, 0.02), 'dark', M((0, -0.085, 0.108)))  # boca
    return mb.build(mats, parent=torso, location=HEAD_PIVOT)


def build_wing(mats, torso, side):
    s = side
    mb = MeshBuilder('WingL' if s < 0 else 'WingR')
    span, c0, c1 = 2.05, 0.95, 0.62
    # pano (cor de time): bordo de fuga recortado
    cloth = A.cloth_wing(span, c0, c1, le0=0.42, le1=0.34, dih=0.14, camber=0.07, nu=6, nv=3, scallop=0.07, thick=0.03)
    mb.add(A.mirror_x(cloth, s), 'team', M((0, 0, 0)), smooth=40)
    # longarina dianteira (tubo) + longarina traseira + nervuras
    lead = [(s * 0.0, 0.0, 0.43), (s * 0.7, 0.03, 0.4), (s * 1.4, 0.07, 0.37), (s * span, 0.15, 0.34)]
    tube(mb, lead, [0.04, 0.036, 0.03, 0.022], 'wood_dark', n=6, smooth=50)
    rear = [(0.0, 0.01, 0.42 - c0 * 0.96), (s * 0.7, 0.04, 0.4 - c0 * 0.9), (s * 1.4, 0.075, 0.37 - c0 * 0.78), (s * span, 0.15, 0.34 - c1 * 0.95)]
    tube(mb, rear, [0.022, 0.02, 0.018, 0.014], 'wood', n=5, smooth=50)
    for k in range(1, 6):
        u = k / 6
        c = c0 + (c1 - c0) * u
        le = 0.42 + (0.34 - 0.42) * u
        y = 0.14 * u * u
        mb.add(prim_box(0.035, 0.04, c * 0.98), 'wood', M((s * span * u, y + 0.035, le - c * 0.5)), bevel=0.005)
    # tirantes de cordame até a cabeça do mastro (pivô → mastro: x = −s·0,2; y = +0,67)
    mast = (-s * WING_PIVOT[0], MAST_TOP[1] - WING_PIVOT[1], MAST_TOP[2] - WING_PIVOT[2])
    for u in (0.4, 0.8):
        p = (s * span * u, 0.14 * u * u, 0.4 - 0.06 * u)
        beam(mb, mast, p, 0.022, 0.022, 'rope')
    # ponteira de latão e luz lateral na ponta
    mb.add(prim_sphere(0.045, 0.045, 0.05, 6, 3), 'brass', M((s * span, 0.15, 0.34)), smooth=70)
    mb.add(prim_box(0.05, 0.05, 0.4), 'wood_dark', M((s * (span - 0.03), 0.13, -0.05)), bevel=0.008)
    # ferragem da raiz (dobradiça)
    mb.add(prim_box(0.12, 0.08, 0.2), 'iron', M((s * 0.02, 0.0, 0.3)), bevel=0.01)
    return mb.build(mats, parent=torso, location=(s * WING_PIVOT[0], WING_PIVOT[1], WING_PIVOT[2]))


def main():
    args = C.script_args()
    C.reset_scene()
    mats = C.make_paint_set(PALETTE)
    root = C.make_empty('Glider')
    torso = build_torso(mats, root)
    head = build_head(mats, torso)
    wl = build_wing(mats, torso, -1)
    wr = build_wing(mats, torso, 1)
    parts = [torso, head, wl, wr]
    st = A.finish_air('glider', 'glider.glb', 'glider_atlas', root, parts,
                      {'Torso': 1.0, 'Head': 1.4, 'WingL': 1.0, 'WingR': 1.0}, TEAM_DEFAULT, args, game_dist=20.0)
    print('BBOX', bbox_game(root))
    return st


if __name__ == '__main__':
    main()
