"""
build_ballista.py — Balista humana (tipo interno `ballista`) gerada 100% por script.

Besta gigante de cerco: carreta de madeira e ferro com 2 rodas raiadas de aro de ferro e trava traseira,
trilho central, braços de arco laminados (madeira + tendão) com extremidades de ferro e corda de tendão em V,
calha com virote enorme (cabeça de ferro, penas em cor de time), cabrestante/manivela com catraca, escudo
frontal com faixa heráldica azul e brasão dourado, estandarte e rack de virotes. Tripulação NÃO modelada.

Uso:
  blender -b --factory-startup --python tools/blender/build_ballista.py -- [--no-render]

Hierarquia PLANA (nomes lidos por `ModelFactory.rebindUserData` / `UnitAnimator`):
  Ballista (raiz)
  ├─ Body      carreta, trilho, cabrestante, escudo, estandarte (Atlas + TeamColor)
  ├─ SiegeArm  pivô (0, 1.84, 0.0): coronha + braços + corda + virote; RECUA em −Z ao disparar
  ├─ WheelL    pivô (−1.04, 0.72, 0.05): gira em X ao andar
  └─ WheelR    pivô (+1.04, 0.72, 0.05)
Frente (virote) = +Z. Cor de time: penas do virote, faixas nos braços, escudo, estandarte.
"""
import os
import sys
import math

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
from mathutils import Vector, Matrix  # noqa: E402
import common as C  # noqa: E402
from common import (MeshBuilder, M, prim_box, prim_rings, prim_cyl, prim_cone,  # noqa: E402
                    prim_sphere, prim_extrude, limb_rings, bezier)
from bld_common import beam, tube, log, bbox_game  # noqa: E402
import siege_common as S  # noqa: E402

SCALE = 0.8   # escala final (compatível com collisionRadius 1.3 e com os procedurais)
TEAM_DEFAULT = '#3a66d6'
WHEEL_R = 0.72
AXLE = (0.0, WHEEL_R, 0.05)
ARM_PIVOT = (0.0, 1.84, 0.0)

PALETTE = {
    'wood': dict(base='#85592f', var='#6a4526', var_scale=2.0, fine=0.08, pattern='planks', mapping='box',
                 pw=1.6, ph=0.2, mortar='#3a2615', top=0.15, edge='#b98a55', edge_amt=0.45, edge_r=0.02,
                 ao=(0.5, 0.65)),
    'wood_dark': dict(base='#5a3c22', var='#45301a', var_scale=2.5, fine=0.09, top=0.15, edge='#9a7a52',
                      edge_amt=0.45, edge_r=0.02, ao=(0.4, 0.6)),
    'wood_light': dict(base='#a87a44', var='#8a6030', var_scale=2.2, fine=0.08, top=0.2, edge='#d8b07a',
                       edge_amt=0.4, edge_r=0.02, ao=(0.4, 0.55)),
    'horn': dict(base='#3c2a1c', var='#281a10', var_scale=4.0, fine=0.08, top=0.3, edge='#6b5038', edge_amt=0.5,
                 edge_r=0.02, ao=(0.3, 0.5)),
    'sinew': dict(base='#c9b07a', var='#a58b55', var_scale=14.0, var_amt=0.9, fine=0.14, top=0.25,
                  ao=(0.3, 0.5)),
    'iron': dict(base='#4a4d55', var='#383b42', var_scale=3.0, fine=0.08, top=0.3, edge='#b9bfca', edge_amt=0.8,
                 edge_r=0.015, ao=(0.3, 0.5)),
    'steel': dict(base='#9aa1ad', var='#7b818d', var_scale=4.0, fine=0.06, top=0.4, edge='#eef2f8', edge_amt=0.8,
                  edge_r=0.012, ao=(0.25, 0.4)),
    'gold': dict(base='#d9a63a', var='#b98524', var_scale=4.0, fine=0.06, top=0.3, edge='#fff0b8', edge_amt=0.8,
                 edge_r=0.015, ao=(0.3, 0.4)),
    'rope': dict(base='#b49865', var='#8a7040', var_scale=12.0, fine=0.12, top=0.2),
    'leather': dict(base='#7a4a26', var='#5c3419', var_scale=6.0, fine=0.12, top=0.2, edge='#b07a48', edge_amt=0.5,
                    edge_r=0.02, ao=(0.25, 0.6)),
    'dark': dict(base='#1f1b22', var='#15131a'),
    'plume': dict(base='#e9e3d3', var='#cfc8b4', var_scale=9.0, fine=0.05, top=0.3),
    'team': dict(base='#bab2a6', var='#a0988c', var_scale=2.0, fine=0.08, top=0.2, edge='#dcd6cc', edge_amt=0.3,
                 edge_r=0.03, ao=(0.8, 0.6), team=True),
}


# ---------------------------------------------------------------------------
def build_body(mats, root):
    mb = MeshBuilder('Body')
    # eixo + mancais de ferro
    mb.add(prim_box(1.9, 0.15, 0.15), 'wood_dark', M((0, AXLE[1], AXLE[2])), bevel=0.015)
    for sx in (-1, 1):
        mb.add(prim_box(0.12, 0.2, 0.22), 'iron', M((sx * 0.62, AXLE[1], AXLE[2])), bevel=0.012)
    # longarinas do chassi
    for sx in (-1, 1):
        x = sx * 0.52
        mb.add(prim_box(0.2, 0.22, 2.75, taper=(1.0, 0.9)), 'wood', M((x, 1.0, -0.05)), bevel=0.02)
        mb.add(prim_box(0.06, 0.06, 2.6), 'iron', M((sx * 0.62, 1.12, -0.05)))
        # cantoneira de ferro na ponta dianteira
        mb.add(prim_box(0.24, 0.26, 0.1), 'iron', M((x, 1.0, 1.3)), bevel=0.012)
    # travessas
    for z, w in ((-1.15, 1.3), (-0.3, 1.2), (0.85, 1.3)):
        mb.add(prim_box(w, 0.2, 0.22), 'wood_dark', M((0, 0.95, z)), bevel=0.02)
    # perna de apoio traseira (trail) inclinada, com sapata de ferro
    for sx in (-1, 1):
        beam(mb, (sx * 0.4, 0.95, -1.3), (sx * 0.4, 0.22, -1.78), 0.14, 0.14, 'wood_dark', bevel=0.015)
        mb.add(prim_box(0.22, 0.12, 0.3), 'iron', M((sx * 0.4, 0.17, -1.8)), bevel=0.015)
    # trilho central (calha da coronha) sobre cavaletes em A
    mb.add(prim_box(0.34, 0.22, 2.7, taper=(0.95, 1.0)), 'wood_dark', M((0, 1.46, 0.0)), bevel=0.02)
    mb.add(prim_box(0.06, 0.05, 2.6), 'iron', M((-0.14, 1.585, 0.0)))
    mb.add(prim_box(0.06, 0.05, 2.6), 'iron', M((0.14, 1.585, 0.0)))
    for z in (-0.65, 0.65):
        for sx in (-1, 1):
            beam(mb, (sx * 0.5, 1.1, z), (sx * 0.1, 1.37, z), 0.14, 0.14, 'wood', bevel=0.012)
        mb.add(prim_box(0.46, 0.08, 0.26), 'iron', M((0, 1.32, z)), bevel=0.01)
    # coluna frontal de sustentação do arco (travessa + cantoneiras de ferro)
    for sx in (-1, 1):
        beam(mb, (sx * 0.5, 1.1, 0.95), (sx * 0.22, 1.55, 0.95), 0.12, 0.16, 'wood', bevel=0.012)
    mb.add(prim_box(0.6, 0.12, 0.3), 'iron', M((0, 1.62, 0.95)), bevel=0.012)
    # cabrestante (tambor com 4 braços de manivela + catraca) na traseira do trilho
    zw = -1.18
    wy = 1.7
    for sx in (-1, 1):
        mb.add(prim_box(0.12, 0.6, 0.18), 'wood_dark', M((sx * 0.3, 1.55, zw)), bevel=0.012)
    S.add_cyl_x(mb, 0.16, 0.5, 'wood_light', (0, wy, zw), n=10, bevel=0.012)
    S.add_cyl_x(mb, 0.19, 0.06, 'iron', (-0.24, wy, zw), n=10)
    S.add_cyl_x(mb, 0.19, 0.06, 'iron', (0.24, wy, zw), n=10)
    # catraca com dentes
    for k in range(10):
        a = math.radians(36 * k)
        mb.add(prim_box(0.07, 0.08, 0.06), 'iron', M((0.33, wy + 0.22 * math.cos(a), zw + 0.22 * math.sin(a)), (math.degrees(a), 0, 0)))
    S.add_cyl_x(mb, 0.2, 0.05, 'iron', (0.33, wy, zw), n=10)
    mb.add(prim_box(0.05, 0.14, 0.1), 'iron', M((0.33, wy + 0.23, zw + 0.03), (25, 0, 0)))
    # manivelas
    for k in range(4):
        a = 45 + 90 * k
        ar = math.radians(a)
        d = Vector((0, math.cos(ar), math.sin(ar)))
        p0 = Vector((-0.30, wy, zw))
        beam(mb, tuple(p0 + d * 0.1), tuple(p0 + d * 0.52), 0.06, 0.06, 'wood', bevel=0.008)
        mb.add(prim_sphere(0.06, 0.06, 0.06, 6, 3), 'wood_light', M(tuple(p0 + d * 0.54)), smooth=60)
    # corda do cabrestante até a coronha (recua com o braço: fixa só o trecho visível do tambor)
    S.add_cyl_x(mb, 0.175, 0.3, 'rope', (0, wy, zw), n=10, smooth=30)
    # escudo frontal: prancha inclinada, tira heráldica em cor de time, brasão dourado
    T = M((0, 1.15, 1.25), (-18, 0, 0))
    mb.add(prim_box(1.2, 0.58, 0.09, taper=(0.97, 1.0)), 'wood', T, bevel=0.02)
    mb.add(prim_box(1.28, 0.07, 0.12), 'iron', T @ M((0, 0.31, 0.0)), bevel=0.008)
    mb.add(prim_box(1.28, 0.07, 0.12), 'iron', T @ M((0, -0.31, 0.0)), bevel=0.008)
    mb.add(prim_box(0.07, 0.64, 0.12), 'iron', T @ M((-0.62, 0, 0.0)), bevel=0.008)
    mb.add(prim_box(0.07, 0.64, 0.12), 'iron', T @ M((0.62, 0, 0.0)), bevel=0.008)
    mb.add(prim_box(0.28, 0.52, 0.03), 'team', T @ M((-0.33, 0, 0.065)), bevel=0.005)
    mb.add(prim_box(0.28, 0.52, 0.03), 'team', T @ M((0.33, 0, 0.065)), bevel=0.005)
    crest = [(0.0, 0.2), (0.15, 0.03), (0.0, -0.19), (-0.15, 0.03)]
    mb.add(prim_extrude(crest, 0.04, axis='z'), 'gold', T @ M((0, 0.0, 0.075)), bevel=0.008)
    mb.add(prim_extrude([(0, 0.09), (0.06, 0), (0, -0.09), (-0.06, 0)], 0.045, axis='z'), 'iron', T @ M((0, 0.01, 0.085)))
    for dx in (-0.55, 0.55):
        for dy in (-0.23, 0.23):
            mb.add(prim_sphere(0.028, 0.028, 0.028, 5, 3), 'gold', T @ M((dx, dy, 0.07)), smooth=60)
    # mastro do estandarte (traseira direita) — a bandeira é cor de time
    log(mb, (0.55, 1.05, -1.25), (0.55, 2.75, -1.25), 0.035, 'wood_dark', n=6)
    mb.add(prim_cone(0.05, 0.22, 5), 'gold', M((0.55, 2.75, -1.25)))
    mb.add(prim_sphere(0.05, 0.05, 0.05, 6, 3), 'gold', M((0.55, 2.74, -1.25)), smooth=60)
    pole_poly = [(0.0, 0.0), (0.72, -0.06), (0.52, -0.25), (0.72, -0.44), (0.0, -0.46)]
    verts, faces = prim_extrude(pole_poly, 0.035, axis='z')
    verts = S.wave(verts, 0.07, 6.0, 0.0, 0.5)
    mb.add((verts, faces), 'team', M((0.53, 2.62, -1.25), (0, 90, 0)), smooth=40)
    mb.add(prim_box(0.06, 0.05, 0.06), 'iron', M((0.55, 2.0, -1.25)))
    return mb.build(mats, parent=root)


# ---------------------------------------------------------------------------
def build_arm(mats, root):
    """Coronha + braços laminados + corda + virote. Coordenadas locais ao pivô (0, 1.84, 0)."""
    mb = MeshBuilder('SiegeArm')
    # coronha (madeira clara) com calha escura e cintas de ferro
    mb.add(prim_box(0.22, 0.2, 2.35, taper=(1.0, 0.85)), 'wood_light', M((0, 0, -0.05)), bevel=0.02)
    mb.add(prim_box(0.08, 0.03, 2.2), 'dark', M((0, 0.105, -0.05)))
    for z in (-0.95, -0.35, 0.3, 0.95):
        mb.add(prim_box(0.27, 0.25, 0.06), 'iron', M((0, 0, z)), bevel=0.008)
        mb.add(prim_sphere(0.022, 0.022, 0.022, 5, 3), 'gold', M((0.0, 0.14, z)), smooth=60)
    # coronha traseira alargada (apoio) e gatilho/noz de ferro
    mb.add(prim_box(0.3, 0.22, 0.3, taper=(0.9, 1.0)), 'wood_light', M((0, -0.01, -1.3)), bevel=0.02)
    mb.add(prim_box(0.14, 0.12, 0.22), 'iron', M((0, 0.1, -0.6)), bevel=0.01)
    mb.add(prim_box(0.05, 0.3, 0.06), 'iron', M((0, -0.2, -0.78), (15, 0, 0)))
    mb.add(prim_box(0.06, 0.05, 0.22), 'iron', M((0, -0.3, -0.72)))
    # cubo central do arco (estribo de ferro na frente da coronha)
    mb.add(prim_box(0.55, 0.3, 0.36), 'iron', M((0, 0, 0.82)), bevel=0.02)
    mb.add(prim_box(0.3, 0.12, 0.4), 'gold', M((0, 0.17, 0.82)), bevel=0.012)
    # braços: madeira (dorso, frente) e tendão (ventre, atrás), curvando para a frente nas pontas
    tips = []
    for sx in (-1, 1):
        back = bezier((sx * 0.28, 0.0, 0.82), (sx * 1.05, 0.0, 0.78), (sx * 1.6, 0.0, 1.38), 6)
        rad = [(0.12, 0.15), (0.115, 0.15), (0.10, 0.135), (0.09, 0.12), (0.078, 0.108), (0.066, 0.095), (0.055, 0.085)]
        tube(mb, back, rad, 'wood_light', n=6, smooth=55, cap=True)
        belly = [(x, y, z - 0.10) for (x, y, z) in back[1:]]
        brad = [(0.05, 0.10), (0.05, 0.10), (0.045, 0.09), (0.04, 0.08), (0.035, 0.065), (0.03, 0.055)]
        tube(mb, belly, brad, 'sinew', n=6, smooth=55, cap=True)
        # chifre escuro no dorso (lâmina de topo) e faixas de cor de time + ferro
        top = [(x, y + 0.11, z + 0.0) for (x, y, z) in back[1:]]
        trad = [(0.06, 0.035), (0.055, 0.032), (0.05, 0.03), (0.045, 0.03), (0.04, 0.028), (0.035, 0.025)]
        tube(mb, top, trad, 'horn', n=5, smooth=50, cap=True)
        for t in (0.34, 0.62):
            i = int(t * 6)
            f = t * 6 - i
            p = Vector(back[i]).lerp(Vector(back[i + 1]), f)
            d = (Vector(back[i + 1]) - Vector(back[i])).normalized()
            w = 0.085 - 0.03 * t
            mb.add(prim_box(0.25 - 0.06 * t, 0.085, 0.25 - 0.05 * t), 'team', Matrix.Translation(p) @ S.orient(d), bevel=0.012)
        p = Vector(back[2]).lerp(Vector(back[3]), 0.5)
        mb.add(prim_box(0.27, 0.1, 0.27), 'iron', Matrix.Translation(p) @ S.orient((Vector(back[3]) - Vector(back[2]))), bevel=0.01)
        tip = Vector(back[-1])
        mb.add(prim_cone(0.07, 0.18, 6), 'iron', Matrix.Translation(tip) @ S.orient((sx * 0.6, 0, 0.8)))
        mb.add(prim_sphere(0.05, 0.05, 0.05, 6, 3), 'steel', M((tip.x, tip.y, tip.z + 0.02)), smooth=60)
        tips.append(Vector((tip.x, 0.0, tip.z - 0.04)))
    # corda de tendão em V até a noz
    nut = Vector((0, 0.08, -0.62))
    for tp in tips:
        beam(mb, tuple(tp), tuple(nut), 0.055, 0.055, 'rope')
    mb.add(prim_box(0.12, 0.09, 0.09), 'rope', M(tuple(nut)), bevel=0.01)
    # virote gigante: haste, cabeça de ferro em folha, penas em cor de time, amarras
    by = 0.165
    mb.add(prim_box(0.1, 0.1, 2.0, taper=(0.9, 0.95)), 'wood', M((0, by + 0.01, 0.5)), bevel=0.008)
    mb.add(prim_extrude([(0.0, 0.7), (0.2, 0.05), (0.0, -0.04), (-0.2, 0.05)], 0.07, axis='y'), 'steel',
           M((0, by + 0.01, 1.4)), bevel=0.006)
    mb.add(prim_box(0.15, 0.04, 0.1), 'iron', M((0, by, 1.4)))
    for ang in (0, 120, 240):
        mb.add(prim_box(0.014, 0.26, 0.44, taper=(1.0, 1.0)), 'team', M((0, by, -0.45), (0, 0, 0)) @ M(r=(0, 0, ang)) @ M((0, 0.1, 0)))
    mb.add(prim_box(0.09, 0.09, 0.05), 'iron', M((0, by, -0.2)))
    mb.add(prim_box(0.085, 0.085, 0.05), 'iron', M((0, by, 0.4)))
    return mb.build(mats, parent=root, location=ARM_PIVOT)


def build_wheel(mats, root, name, side):
    mb = MeshBuilder(name)
    S.spoked_wheel(mb, WHEEL_R, side)
    return mb.build(mats, parent=root, location=(side * 1.04, AXLE[1], AXLE[2]))


def main():
    args = C.script_args()
    C.reset_scene()
    mats = C.make_paint_set(PALETTE)
    root = C.make_empty('Ballista')
    body = build_body(mats, root)
    arm = build_arm(mats, root)
    wl = build_wheel(mats, root, 'WheelL', -1)
    wr = build_wheel(mats, root, 'WheelR', 1)
    parts = [body, arm, wl, wr]
    C.scale_parts(parts, SCALE)
    bpy.context.view_layer.update()
    C.uv_atlas(parts, weights={'Body': 1.0, 'SiegeArm': 1.1, 'WheelL': 0.8, 'WheelR': 0.8}, margin=0.006)
    img = C.bake_atlas(parts, 'ballista_atlas', 512, samples=int(os.environ.get('BAKE_SAMPLES', 32)), margin=4)
    C.finalize_materials(parts, img, team_default=TEAM_DEFAULT, out_png=os.path.join(C.BUILD_DIR, 'ballista_atlas.png'))
    out = os.path.join(C.OUT_MODELS, 'ballista.glb')
    C.export_glb(root, out)
    print('STATS ballista', C.stats(root, out))
    print('BBOX', bbox_game(root))
    if '--no-render' not in args:
        rig = C.RenderRig(root, 'ballista', res=int(os.environ.get('RENDER_RES', 800)), samples=24)
        rig.render('34', (1.0, 0.95, 1.0), 30)
        rig.render('front', (0.0, 0.25, 1.0), 30)
        rig.render('back', (-0.6, 0.6, -1.0), 30)
        rig.render('side', (1.0, 0.2, 0.0), 30)
        rig.render('game', (45, 44, 45), 24, dist=17)
        C.set_team_color('#c0392b')
        rig.render('34_vermelho', (1.0, 0.95, 1.0), 30)
        C.set_team_color(TEAM_DEFAULT)


if __name__ == '__main__':
    main()
