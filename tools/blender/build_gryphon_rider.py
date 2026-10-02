"""
build_gryphon_rider.py — Cavaleiro Grifo (humano, tipo interno `gryphon_rider`) gerado 100% por script.

Ataque aéreo: grifo com corpo de leão (pelagem dourada, cauda com tufo), peito e pescoço emplumados de branco,
cabeça de águia com bico em gancho e crista de penas, patas dianteiras de ave com garras, duas asas de penas
(primárias em leque, secundárias, coberturas), sela com manta em cor de time e um cavaleiro de armadura de aço
com elmo fechado de crista, tabardo de time e lança com flâmula.

Uso:
  blender -b --factory-startup --python tools/blender/build_gryphon_rider.py -- [--no-render]

Hierarquia (nomes lidos por `ModelFactory.rebindUserData` / `UnitAnimator.applyAir`):
  GryphonRider (raiz)
  └─ Torso   corpo, patas, cauda, sela, cavaleiro, lança (pivô na origem; base em y ~ 0,1)
     ├─ Head    cabeça de águia (pivô (0; 1,42; 0,98))
     ├─ WingL   pivô (−0,36; 1,1; −0,1)  (bate em z)
     └─ WingR   pivô (+0,36; 1,1; −0,1)
Frente = +Z. Cor de time: tabardo, manta da sela, flâmula, faixas das asas.
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
HEAD_PIVOT = (0.0, 1.42, 0.98)
WING_PIVOT = (0.36, 1.1, -0.1)
BODY_Y = 0.98

PALETTE = A.base_palette()
PALETTE.update({
    'fur': dict(base='#c58b3c', var='#9a6624', var_scale=5.0, var_amt=0.9, fine=0.14, top=0.4, ao=(0.4, 0.5)),
    'fur_dark': dict(base='#9a6a2c', var='#6c4518', var_scale=6.0, var_amt=0.9, fine=0.14, top=0.3, ao=(0.4, 0.5)),
    'fur_light': dict(base='#e0b468', var='#c48e3e', var_scale=6.0, var_amt=0.9, fine=0.12, top=0.4, ao=(0.3, 0.5)),
    'feather': dict(base='#f2ede0', var='#cfc7b0', var_scale=12.0, var_amt=0.7, fine=0.08, top=0.45,
                    edge='#ffffff', edge_amt=0.5, edge_r=0.012, ao=(0.3, 0.5)),
    'feather_tip': dict(base='#b4a888', var='#8c7f60', var_scale=10.0, var_amt=0.8, fine=0.1, top=0.35,
                        ao=(0.3, 0.5)),
    'feather_gold': dict(base='#d4a248', var='#a8782a', var_scale=10.0, var_amt=0.8, fine=0.1, top=0.4,
                         ao=(0.3, 0.5)),
    'beak': dict(base='#f0c53a', var='#c89a1c', var_scale=10.0, fine=0.04, top=0.4, edge='#fff3b0', edge_amt=0.6,
                 edge_r=0.012, ao=(0.25, 0.4)),
    'talon': dict(base='#2c2a30', var='#1c1a20', var_scale=6.0, top=0.3, edge='#8a8a92', edge_amt=0.5, edge_r=0.01),
    'amber': dict(base='#ffcb3a', var='#ff9d1a', var_scale=10.0, emit_boost=1.1, top=0.3),
    'plume': dict(base='#f4f0e6', var='#d8d0bc', var_scale=9.0, fine=0.05, top=0.3),
    'tabard': dict(base='#bab2a6', var='#a0988c', var_scale=2.0, fine=0.08, top=0.2, edge='#dcd6cc', edge_amt=0.3,
                   edge_r=0.03, ao=(0.8, 0.6), team=True),
    'steel_hi': dict(base='#c4cad6', var='#9aa1ad', var_scale=4.0, fine=0.05, top=0.5, edge='#ffffff', edge_amt=0.9,
                     edge_r=0.012, edge_gain=12.0, ao=(0.25, 0.4)),
})


def put_feather(mb, side, pos, yaw, length, width, mat, droop=0.0, curl=0.12, pitch=0.0, bevel=0.0):
    """Pena ancorada em `pos` (espaço do pivô da asa), apontando para fora (+x · side) e girada `yaw` graus
    em torno de y (positivo = para trás, −z)."""
    T = M(s=(side, 1, 1)) @ M(pos, (pitch, yaw, droop))
    mb.add(A.feather(length, width, 0.025, curl=curl, taper=0.5, n=3), mat, T, smooth=0)


def build_torso(mats, root):
    mb = MeshBuilder('Torso')
    # tronco de leão: loft de rabadilha a peito
    body = [(0, BODY_Y - 0.02, -1.05), (0, BODY_Y, -0.65), (0, BODY_Y + 0.02, -0.2), (0, BODY_Y + 0.05, 0.3),
            (0, BODY_Y + 0.12, 0.72)]
    rad = [(0.2, 0.22), (0.33, 0.36), (0.38, 0.4), (0.4, 0.43), (0.3, 0.34)]
    A.tube(mb, body, rad, 'fur', n=12, smooth=70, mat_fn=lambda c, n: 'fur_light' if n[1] < -0.35 else None)
    # pescoço emplumado até a cabeça
    neck = bezier((0, 1.08, 0.62), (0, 1.3, 0.78), (0, 1.45, 0.98), 4)
    tube(mb, neck, [(0.27, 0.27), (0.22, 0.23), (0.19, 0.2), (0.16, 0.17), (0.14, 0.14)], 'feather', n=10, smooth=65)
    # gola de penas (anel de lâminas em volta do pescoço/peito)
    for k in range(14):
        a = 2 * math.pi * k / 14
        for (y, z, r, ln) in ((1.12, 0.66, 0.26, 0.3), (1.27, 0.76, 0.21, 0.24)):
            p = (math.cos(a) * r, y + math.sin(a) * r * 0.5, z)
            tilt = math.degrees(a)
            mb.add(prim_box(0.1, ln, 0.03, taper=(0.35, 1.0)), 'feather' if k % 2 else 'plume',
                   M(p, (-35 + 10 * math.sin(a), 0, -tilt + 90)) @ M((0, -ln * 0.4, 0)), bevel=0.0)
    # patas dianteiras: coxa emplumada, canela escamosa, garras (voo com as garras para a frente)
    for sx in (-1, 1):
        tube(mb, [(sx * 0.27, 1.0, 0.45), (sx * 0.26, 0.7, 0.52), (sx * 0.25, 0.42, 0.66)], [0.15, 0.1, 0.075], 'feather', n=8, smooth=60)
        tube(mb, [(sx * 0.25, 0.46, 0.64), (sx * 0.25, 0.28, 0.74), (sx * 0.25, 0.18, 0.84)], [0.075, 0.06, 0.055], 'beak', n=6, smooth=50)
        for k in range(3):  # dedos e garras
            fx = (k - 1) * 0.07
            tube(mb, [(sx * 0.25 + fx, 0.19, 0.84), (sx * 0.25 + fx * 1.6, 0.15, 0.96)], [0.032, 0.026], 'beak', n=5, smooth=40)
            mb.add(prim_cone(0.03, 0.14, 5), 'talon', M((sx * 0.25 + fx * 1.8, 0.15, 0.99), (115, 0, 0)), smooth=40)
        # pata traseira de leão: coxa potente dobrada para trás
        tube(mb, [(sx * 0.3, 1.04, -0.62), (sx * 0.34, 0.74, -0.78), (sx * 0.28, 0.46, -0.64)], [0.19, 0.14, 0.09], 'fur', n=8, smooth=65)
        tube(mb, [(sx * 0.28, 0.48, -0.66), (sx * 0.27, 0.25, -0.62)], [0.08, 0.065], 'fur_dark', n=6, smooth=55)
        mb.add(prim_sphere(0.1, 0.07, 0.15, 7, 4), 'fur_dark', M((sx * 0.27, 0.18, -0.56)), smooth=70)
        for k in range(3):
            mb.add(prim_cone(0.022, 0.1, 4), 'talon', M((sx * 0.27 + (k - 1) * 0.05, 0.14, -0.42), (100, 0, 0)), smooth=0)
    # cauda de leão com tufo
    tail = bezier((0, 0.98, -1.0), (0, 0.95, -1.5), (0, 1.2, -1.85), 4)
    tube(mb, tail, [0.1, 0.085, 0.07, 0.06, 0.05], 'fur_dark', n=7, smooth=60)
    mb.add(prim_sphere(0.14, 0.2, 0.16, 8, 4), 'fur', M((0, 1.24, -1.88)), smooth=70)
    for k in range(5):
        mb.add(prim_cone(0.045, 0.28, 4), 'fur_dark', M((0, 1.32, -1.9), (-135 + 18 * k - 36, 0, (k - 2) * 12)), smooth=0)
    # sela: assento de couro, manta de time, cilhas e estribos
    mb.add(prim_box(0.52, 0.06, 0.72, taper=(1.0, 0.85)), 'tabard', M((0, 1.36, -0.12)), bevel=0.012)
    for sx in (-1, 1):
        mb.add(prim_box(0.05, 0.4, 0.66), 'tabard', M((sx * 0.4, 1.12, -0.12), (0, 0, -sx * 12)), bevel=0.008)
        mb.add(prim_box(0.05, 0.4, 0.04), 'iron', M((sx * 0.44, 1.0, 0.3), (0, 0, -sx * 12)))
        beam(mb, (sx * 0.4, 1.28, 0.0), (sx * 0.47, 0.82, 0.0), 0.03, 0.03, 'leather_dark')
        mb.add(prim_box(0.14, 0.03, 0.12), 'steel', M((sx * 0.47, 0.8, 0.0)), bevel=0.006)
    mb.add(prim_box(0.5, 0.2, 0.08), 'leather', M((0, 1.43, 0.28), (-18, 0, 0)), bevel=0.012)  # pomo
    mb.add(prim_box(0.5, 0.26, 0.07), 'leather', M((0, 1.45, -0.54), (14, 0, 0)), bevel=0.012)  # encosto
    # rédeas (da sela até a cabeça)
    for sx in (-1, 1):
        beam(mb, (sx * 0.16, 1.55, 0.05), (sx * 0.1, 1.42, 0.95), 0.015, 0.015, 'leather_dark')
    # cavaleiro: pernas, tronco de couraça, tabardo, braços
    for sx in (-1, 1):
        tube(mb, [(sx * 0.27, 1.5, -0.05), (sx * 0.36, 1.33, 0.08), (sx * 0.42, 1.0, 0.1)], [0.1, 0.085, 0.07], 'steel', n=7, smooth=55)
        mb.add(prim_box(0.12, 0.08, 0.2), 'steel_hi', M((sx * 0.42, 0.86, 0.15)), bevel=0.01)
    ry = 1.66
    cuir = [ring_h(-0.2, 0.2, 0.15, 10), ring_h(0.0, 0.25, 0.17, 10), ring_h(0.22, 0.28, 0.17, 10), ring_h(0.34, 0.2, 0.14, 10)]
    mb.add(prim_rings(cuir), 'steel_hi', M((0, ry, -0.1)), smooth=60)
    mb.add(prim_box(0.34, 0.5, 0.04, taper=(1.0, 1.0)), 'tabard', M((0, ry - 0.05, 0.075)), bevel=0.006)  # tabardo frente
    mb.add(prim_box(0.34, 0.45, 0.04), 'tabard', M((0, ry - 0.06, -0.28)), bevel=0.006)
    mb.add(prim_box(0.06, 0.4, 0.045), 'gold', M((0, ry - 0.05, 0.1)), bevel=0.004)  # cruz do peito
    mb.add(prim_box(0.2, 0.06, 0.045), 'gold', M((0, ry + 0.06, 0.1)), bevel=0.004)
    mb.add(prim_rings([ring_h(-0.22, 0.22, 0.17, 10), ring_h(-0.15, 0.23, 0.18, 10)]), 'leather_dark', M((0, ry, -0.1)), smooth=30)
    for sx in (-1, 1):  # ombreiras, braços para a frente segurando a rédea
        mb.add(prim_sphere(0.14, 0.1, 0.14, 8, 4, y_min=0.0), 'steel_hi', M((sx * 0.32, ry + 0.32, -0.1)), smooth=60)
        tube(mb, [(sx * 0.32, ry + 0.26, -0.1), (sx * 0.34, ry + 0.06, 0.1), (sx * 0.16, ry - 0.02, 0.3)], [0.075, 0.065, 0.06], 'steel', n=6, smooth=55)
        mb.add(prim_sphere(0.06, 0.06, 0.06, 6, 3), 'leather_dark', M((sx * 0.14, ry - 0.02, 0.32)), smooth=70)
    # elmo fechado de aço com visor em T (fenda só em +Z), crista dourada e pluma
    hy = ry + 0.58
    mb.add(prim_sphere(0.17, 0.2, 0.17, 10, 5), 'steel_hi', M((0, hy, -0.1)), smooth=65)
    mb.add(prim_box(0.2, 0.025, 0.02), 'dark', M((0, hy + 0.02, 0.065)))
    mb.add(prim_box(0.025, 0.12, 0.02), 'dark', M((0, hy - 0.04, 0.065)))
    mb.add(prim_box(0.04, 0.1, 0.34, taper=(0.8, 1.0)), 'gold', M((0, hy + 0.22, -0.1)), bevel=0.006)
    tube(mb, bezier((0, hy + 0.3, -0.1), (0, hy + 0.55, -0.3), (0, hy + 0.2, -0.62), 4), [0.045, 0.06, 0.05, 0.035, 0.012], 'plume', n=5, smooth=60)
    # lança: haste de madeira, ponta de aço e flâmula de time
    lx = 0.5
    beam(mb, (lx, 1.3, -0.35), (lx + 0.1, 1.95, 0.85), 0.06, 0.06, 'wood_dark', bevel=0.008)
    mb.add(prim_cone(0.05, 0.4, 6), 'steel_hi', Matrix.Translation(Vector((lx + 0.1, 1.95, 0.85))) @ A.orient((0.1, 0.65, 1.2)),
           smooth=40)
    pole = [(0.0, 0.0), (-0.55, -0.12), (-0.38, -0.2), (-0.55, -0.3), (0.0, -0.3)]
    verts, faces = prim_extrude(pole, 0.025, axis='z')
    verts = [(x, y, z + 0.05 * math.sin(x * 8.0)) for (x, y, z) in verts]
    mb.add((verts, faces), 'tabard', M((lx + 0.08, 1.88, 0.62), (0, 90, 0)), smooth=40)
    # escudo pendurado na lateral da sela (esquerda)
    mb.add(prim_extrude([(0.0, 0.3), (0.2, 0.2), (0.2, -0.1), (0.0, -0.3), (-0.2, -0.1), (-0.2, 0.2)], 0.05, axis='x'),
           'steel', M((-0.52, 1.2, -0.25), (0, 0, 0)), bevel=0.01)
    mb.add(prim_extrude([(0.0, 0.2), (0.12, 0.12), (0.12, -0.06), (0.0, -0.2), (-0.12, -0.06), (-0.12, 0.12)], 0.06, axis='x'),
           'tabard', M((-0.55, 1.2, -0.25), (0, 0, 0)), bevel=0.005)
    return mb.build(mats, parent=root, location=(0, 0, 0))


def build_head(mats, torso):
    mb = MeshBuilder('Head')
    # crânio de águia (branco), brasão dourado na testa; olhos de predador na frente (+Z)
    mb.add(prim_sphere(0.24, 0.23, 0.26, 10, 5), 'feather', M((0, 0, -0.02)), smooth=65)
    mb.add(prim_sphere(0.19, 0.12, 0.14, 8, 4, y_min=0.0), 'feather_gold', M((0, 0.15, 0.1)), smooth=60)  # sobrancelha dourada
    # bico em gancho: maxila superior curva + mandíbula inferior
    up = bezier((0, 0.0, 0.2), (0, 0.08, 0.5), (0, -0.14, 0.54), 5)
    tube(mb, up, [(0.115, 0.13), (0.1, 0.11), (0.08, 0.085), (0.06, 0.06), (0.03, 0.03), (0.008, 0.008)], 'beak', n=8, smooth=60)
    low = [(0, -0.1, 0.18), (0, -0.14, 0.34), (0, -0.16, 0.46)]
    tube(mb, low, [(0.085, 0.07), (0.07, 0.055), (0.03, 0.03)], 'beak', n=6, smooth=55)
    mb.add(prim_box(0.045, 0.02, 0.18), 'talon', M((0, -0.07, 0.35)))  # linha da boca
    for sx in (-1, 1):
        mb.add(prim_sphere(0.045, 0.045, 0.03, 6, 4), 'amber', M((sx * 0.13, 0.07, 0.19)), smooth=70)
        mb.add(prim_sphere(0.022, 0.026, 0.02, 5, 3), 'pupil', M((sx * 0.135, 0.07, 0.215)), smooth=70)
        mb.add(prim_box(0.1, 0.03, 0.05), 'feather_gold', M((sx * 0.13, 0.135, 0.19), (0, 0, sx * -18)))  # supercílio
        # tufo de penas atrás da cabeça (crista)
        for k in range(3):
            mb.add(prim_box(0.06, 0.28, 0.025, taper=(0.3, 1.0)), 'feather', M((sx * (0.12 + 0.03 * k), 0.2 - 0.02 * k, -0.18 - 0.05 * k), (-28, 0, sx * (22 + 8 * k))) @ M((0, 0.1, 0)))
    for k in range(5):
        mb.add(prim_box(0.06, 0.34, 0.025, taper=(0.3, 1.0)), 'feather', M(((k - 2) * 0.06, 0.18, -0.2), (-35, 0, (k - 2) * 7)) @ M((0, 0.12, 0)))
    return mb.build(mats, parent=torso, location=HEAD_PIVOT)


def build_wing(mats, torso, side):
    s = side
    mb = MeshBuilder('WingL' if s < 0 else 'WingR')
    wrist = (s * 1.05, 0.14, 0.02)
    # braço (pelagem dourada) até o pulso + garra de pulso
    tube(mb, [(0, 0, 0.0), (s * 0.5, 0.1, 0.04), wrist], [0.11, 0.09, 0.07], 'fur', n=8, smooth=60)
    mb.add(prim_sphere(0.09, 0.09, 0.09, 7, 4), 'fur_dark', M(wrist), smooth=70)
    mb.add(prim_cone(0.03, 0.14, 4), 'talon', M((wrist[0] + s * 0.02, wrist[1], wrist[2] + 0.1), (90, 0, 0)))
    # primárias: leque de 9 penas saindo do pulso (mais longas na frente, curvas para baixo)
    for k in range(9):
        t = k / 8
        yaw = -6 + 62 * t
        ln = 1.18 - 0.22 * t
        mat = 'feather_tip' if k % 3 == 2 else ('feather_gold' if k % 3 == 1 else 'feather')
        put_feather(mb, s, (abs(wrist[0]) - 0.04, wrist[1] - 0.03 - 0.005 * k, wrist[2] - 0.03 * k), yaw, ln, 0.17, mat,
                    droop=-4 - 3 * t, curl=0.1 + 0.05 * t)
    # secundárias: ao longo do antebraço, apontando para trás
    for k in range(7):
        t = k / 6
        yaw = 72 + 10 * t
        x0 = 0.12 + 0.82 * (1 - t)
        put_feather(mb, s, (x0, 0.05 - 0.01 * k, -0.04 - 0.02 * k), yaw, 0.86 - 0.12 * (1 - t), 0.2, 'feather' if k % 2 else 'feather_gold',
                    droop=-3, curl=0.1)
    # coberturas: duas fileiras de penas curtas e largas por cima
    for k in range(8):
        t = k / 7
        put_feather(mb, s, (0.1 + 0.95 * t, 0.12 + 0.01 * k - 0.05 * t * 0, -0.02), 66 + 14 * (1 - t), 0.44, 0.18, 'feather', curl=0.04, droop=-1)
    for k in range(6):
        t = k / 5
        put_feather(mb, s, (0.18 + 0.78 * t, 0.17, 0.08), 58, 0.3, 0.15, 'plume', curl=0.03, droop=-1)
    # faixa de time na ponta (tira sobre as primárias)
    mb.add(A.mirror_x(prim_box(0.3, 0.02, 0.5), s), 'tabard', M((s * 1.25, 0.11, -0.1), (0, s * -12, 0)))
    return mb.build(mats, parent=torso, location=(s * WING_PIVOT[0], WING_PIVOT[1], WING_PIVOT[2]))


def main():
    args = C.script_args()
    C.reset_scene()
    mats = C.make_paint_set(PALETTE)
    root = C.make_empty('GryphonRider')
    torso = build_torso(mats, root)
    head = build_head(mats, torso)
    wl = build_wing(mats, torso, -1)
    wr = build_wing(mats, torso, 1)
    parts = [torso, head, wl, wr]
    A.finish_air('gryphon_rider', 'gryphon_rider.glb', 'gryphon_atlas', root, parts,
                 {'Torso': 1.0, 'Head': 1.5, 'WingL': 1.0, 'WingR': 1.0}, TEAM_DEFAULT, args, game_dist=26.0)
    print('BBOX', bbox_game(root))


if __name__ == '__main__':
    main()
