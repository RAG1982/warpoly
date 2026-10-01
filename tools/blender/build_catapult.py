"""
build_catapult.py — Catapulta orc (tipo interno `catapult`) gerada 100% por script.

Engenho de toras grosseiras sobre 2 rodas maciças de pranchas com espigões: dois cavaletes em A amarrados
com corda e ferro segurando o eixo do braço, peles esticadas, correntes, ossos e crânios, espigões de ferro na
frente, cabrestante de ossos atrás, braço longo com concha carregada (rocha + crânios) e contrapeso em gaiola
de toras cheia de pedras. Faixas vermelhas (cor de time) no braço, no contrapeso e no estandarte.
Sem operador.

Uso:
  blender -b --factory-startup --python tools/blender/build_catapult.py -- [--no-render]

Hierarquia PLANA (nomes lidos por `ModelFactory.rebindUserData` / `UnitAnimator`):
  Catapult (raiz)
  ├─ Body      chassi, cavaletes, peles, cabrestante, estandarte (Atlas + TeamColor)
  ├─ SiegeArm  pivô (0, 2.25, −0.1) no eixo do braço; gira em X (positivo = ponta desce/arma; negativo = lança)
  ├─ WheelL    pivô (−1.12, 0.72, 0)
  └─ WheelR    pivô (+1.12, 0.72, 0)
Frente (concha) = +Z. O braço repousa inclinado ~14° para cima (já na geometria; rotação do nó = 0).
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
from bld_common import beam, tube, log, skull, bbox_game  # noqa: E402
import siege_common as S  # noqa: E402
from siege_common import chain, rock, lash  # noqa: E402
from build_ogre_den import PALETTE as OD  # noqa: E402

SCALE = 0.85   # escala final (compatível com collisionRadius 1.3 e com os procedurais)
TEAM_DEFAULT = '#b81d24'
WHEEL_R = 0.72
AXLE = (0.0, WHEEL_R, 0.0)
ARM_PIVOT = (0.0, 2.25, -0.1)
ARM_TILT = math.radians(14)
ARM_DIR = Vector((0, math.sin(ARM_TILT), math.cos(ARM_TILT)))

PALETTE = {k: OD[k] for k in ('log', 'log_light', 'hide', 'hide_dark', 'bone', 'iron', 'rust', 'dark', 'rope', 'team')}
PALETTE['stone'] = dict(base='#6b6660', var='#4a4641', var_scale=1.5, var_amt=0.9, fine=0.1, top=0.3, edge='#a59e93',
                        edge_amt=0.5, edge_r=0.03, ao=(0.4, 0.55))
PALETTE['steel'] = dict(base='#7c8088', var='#595d66', var_scale=4.0, fine=0.08, top=0.35, edge='#d5d9e0', edge_amt=0.8,
                        edge_r=0.012, ao=(0.25, 0.4))
PALETTE['wood_dark'] = dict(OD['log'], pattern=None, base='#3c2819', var='#281a10')


def build_body(mats, root):
    mb = MeshBuilder('Body')
    # eixo de toras
    mb.add(prim_rings(limb_rings([(-1.05, AXLE[1], 0), (1.05, AXLE[1], 0)], [0.1, 0.1], 8, up=(0, 1, 0))), 'log', smooth=40)
    # corredores longitudinais (toras grossas com pontas) e travessas com pontas expostas
    for sx in (-1, 1):
        x = sx * 0.68
        log(mb, (x, 1.02, -1.5), (x, 1.05, 1.45), 0.17, 'log', n=8, tip=0.0)
        mb.add(prim_cone(0.17, 0.4, 8), 'log', M((x, 1.05, 1.45), (90, 0, 0)), smooth=40)
        mb.add(prim_cyl(0.19, 0.19, 0.09, 8, base=False), 'iron', M((x, 1.04, 1.43), (90, 0, 0)))
        mb.add(prim_cyl(0.19, 0.19, 0.09, 8, base=False), 'iron', M((x, 1.02, -1.45), (90, 0, 0)))
        lash(mb, (x, 1.03, 0.1), (0, 0, 1), 0.185)
        lash(mb, (x, 1.03, 0.8), (0, 0, 1), 0.185)
    for z, ln, r in ((-1.15, 1.9, 0.13), (0.05, 1.75, 0.14), (0.95, 1.85, 0.13)):
        log(mb, (-ln / 2, 0.92, z), (ln / 2, 0.92, z), r, 'log_light', n=7)
        for sx in (-1, 1):
            mb.add(prim_cone(r * 0.9, 0.22, 6), 'log_light', M((sx * ln / 2, 0.92, z), (0, 0, -sx * 90)), smooth=40)
    # espigões de ferro e presas de osso na frente
    for x in (-0.68, -0.34, 0.0, 0.34, 0.68):
        mb.add(prim_cone(0.07, 0.42, 5), 'iron', M((x, 0.92, 1.58), (80, 0, 0)))
    for sx in (-1, 1):
        pts = bezier((sx * 0.48, 1.05, 1.55), (sx * 0.62, 1.12, 1.9), (sx * 0.4, 1.3, 2.05), 3)
        tube(mb, S.xf(M(), pts), [0.07, 0.055, 0.04, 0.005], 'bone', n=6, smooth=50)
    # cavaletes em A (pernas de toras inclinadas) presos por amarras e cantoneiras de ferro
    top_y = 2.25
    for sx in (-1, 1):
        x = sx * 0.78
        top = (x, top_y - 0.07, -0.1)
        for zb in (-0.95, 0.75):
            base = (x, 1.0, zb)
            log(mb, base, top, 0.13, 'log', n=7)
            lash(mb, tuple(Vector(base).lerp(Vector(top), 0.35)), Vector(top) - Vector(base), 0.145)
        # braçadeira de ferro no topo + mancal do eixo do braço
        mb.add(prim_box(0.3, 0.42, 0.44), 'iron', M((x, top_y, -0.1)), bevel=0.02)
        mb.add(prim_box(0.12, 0.18, 0.52), 'rust', M((x + sx * 0.14, top_y + 0.02, -0.1)), bevel=0.015)
        # travessa de reforço entre as pernas e crânio no topo
        beam(mb, (x, 1.45, Vector(Vector((x, 1.0, -0.95)).lerp(Vector(top), 0.45)).z),
             (x, 1.45, Vector(Vector((x, 1.0, 0.75)).lerp(Vector(top), 0.45)).z), 0.09, 0.09, 'log_light')
        skull(mb, M((sx * 0.78, top_y + 0.33, -0.1), (0, sx * 25, 0)), 0.36)
        # pele esticada entre as pernas, com pregos
        mb.add(prim_box(0.05, 0.8, 1.0, taper=(1.0, 0.6)), 'hide', M((sx * 0.84, 1.7, -0.12)), bevel=0.01)
        for dz in (-0.3, 0.0, 0.3):
            mb.add(prim_cone(0.03, 0.08, 4), 'iron', M((sx * 0.88, 1.95 - abs(dz) * 0.4, -0.12 + dz), (0, 0, -sx * 90)))
    # eixo do braço: tora horizontal com tampas de ferro
    log(mb, (-1.0, top_y, -0.1), (1.0, top_y, -0.1), 0.11, 'wood_dark', n=8)
    for sx in (-1, 1):
        mb.add(prim_cyl(0.13, 0.13, 0.08, 8, base=False), 'iron', M((sx * 1.0, top_y, -0.1), (0, 0, 90)))
    # correntes penduradas da viga e ossos amarrados no chassi
    chain(mb, (-0.35, 1.1, 0.7), (-0.35, 0.55, 0.9), 5)
    chain(mb, (0.45, 1.05, 1.0), (0.4, 0.5, 1.15), 5)
    # cabrestante de ossos (traseira): tambor de tora + manivelas de fêmur + catraca de ferro
    zw = -1.32
    for sx in (-1, 1):
        beam(mb, (sx * 0.42, 1.08, zw), (sx * 0.42, 1.78, zw), 0.14, 0.14, 'log', bevel=0.012)
    S.add_cyl_x(mb, 0.2, 0.84, 'log_light', (0, 1.62, zw), n=8, bevel=0.01)
    S.add_cyl_x(mb, 0.23, 0.06, 'iron', (-0.46, 1.62, zw), n=8)
    S.add_cyl_x(mb, 0.23, 0.06, 'iron', (0.46, 1.62, zw), n=8)
    for k in range(3):
        a = math.radians(60 + 120 * k)
        d = Vector((0, math.cos(a), math.sin(a)))
        p0 = Vector((0.5, 1.62, zw))
        tube(mb, [tuple(p0 + d * 0.12 + Vector((0.0, 0, 0))), tuple(p0 + d * 0.45 + Vector((0.14, 0, 0))), tuple(p0 + d * 0.72 + Vector((0.28, 0, 0)))],
             [0.04, 0.045, 0.085], 'bone', n=5, smooth=50)
    lash(mb, (0, 1.62, zw), (1, 0, 0), 0.215)
    chain(mb, (0, 1.62, zw + 0.2), (0, 1.3, 0.3), 6)
    # pilha de pedras e crânios na traseira do chassi (munição)
    rock(mb, (-0.35, 1.18, -0.95), 0.27, 'stone', 30)
    rock(mb, (0.1, 1.15, -0.78), 0.22, 'stone', 70)
    rock(mb, (-0.05, 1.42, -0.95), 0.2, 'stone', 10)
    skull(mb, M((0.42, 1.12, -0.62), (0, -40, 0)), 0.3)
    # estandarte de guerra (mastro de tora + crânio + faixa de time) na traseira esquerda
    log(mb, (-0.68, 1.1, -1.42), (-0.68, 3.1, -1.42), 0.055, 'wood_dark', n=6)
    mb.add(prim_cone(0.07, 0.3, 5), 'iron', M((-0.68, 3.1, -1.42)))
    skull(mb, M((-0.68, 2.8, -1.3), (0, 0, 0)), 0.26)
    beam(mb, (-0.68 - 0.5, 2.8, -1.42), (-0.68 + 0.5, 2.8, -1.42), 0.07, 0.07, 'log')
    tp = S.tail_strip(0.78, 1.25, 4, 1.0)
    verts, faces = prim_extrude(tp, 0.035, axis='z')
    verts = S.wave(verts, 0.08, 4.0, 2.0, 0.4)
    mb.add((verts, faces), 'team', M((-0.68, 2.78, -1.47)), smooth=40)
    # faixas de time nos cavaletes
    for sx in (-1, 1):
        tp2 = S.tail_strip(0.22, 0.75, 2, 2.0 + sx)
        v2, f2 = prim_extrude(tp2, 0.03, axis='x')
        mb.add((v2, f2), 'team', M((sx * 0.92, 2.05, -0.55)), smooth=30)
    return mb.build(mats, parent=root)


def build_arm(mats, root):
    """Braço + contrapeso + concha, coordenadas locais ao pivô (0, 2.25, -0.1). Repouso com ponta 14° acima."""
    mb = MeshBuilder('SiegeArm')
    Rz = lambda s: ARM_DIR * s   # ponto ao longo do eixo do braço
    # viga principal: tora cônica (grossa atrás, fina na ponta) com amarras e cordas
    pts = [tuple(Rz(s)) for s in (-1.05, -0.3, 0.5, 1.2, 1.75, 2.0)]
    rad = [0.17, 0.165, 0.15, 0.125, 0.105, 0.095]
    tube(mb, pts, rad, 'log_light', n=8, smooth=55)
    # cubo de ferro no pivô, com tiras
    mb.add(prim_box(0.3, 0.36, 0.46), 'iron', Matrix.Translation(Rz(0.0)) @ M(r=(14, 0, 0)), bevel=0.02)
    for s in (-0.3, 0.3):
        lash(mb, tuple(Rz(s)), ARM_DIR, 0.18)
    # ossos longos e espigões de ferro ao longo do braço
    for sx in (-1, 1):
        a, b = Rz(0.5) + Vector((sx * 0.13, 0.06, 0)), Rz(1.6) + Vector((sx * 0.1, 0.06, 0))
        tube(mb, [tuple(a), tuple((a + b) / 2), tuple(b)], [0.05, 0.04, 0.03], 'bone', n=5, smooth=50)
        for s in (0.8, 1.2, 1.6):
            mb.add(prim_cone(0.045, 0.2, 4), 'iron', Matrix.Translation(Rz(s) + Vector((sx * 0.1, 0.12, 0))) @ M(r=(0, 0, -sx * 30)))
    # faixas vermelhas (time) amarradas no braço
    for s, w in ((0.85, 0.3), (1.45, 0.26)):
        tp = S.tail_strip(w, 0.6, 2, s)
        v, f = prim_extrude(tp, 0.025, axis='x')
        mb.add((v, f), 'team', Matrix.Translation(Rz(s) + Vector((0.14, -0.07, 0))), smooth=30)
        lash(mb, tuple(Rz(s)), ARM_DIR, 0.135, mat='team')
    # ---- contrapeso: gaiola de toras pendurada na ponta traseira, cheia de pedras -------------------
    cw = Rz(-1.05) + Vector((0, -0.52, 0))
    for sx in (-1, 1):
        for sz in (-1, 1):
            log(mb, (cw.x + sx * 0.42, cw.y - 0.42, cw.z + sz * 0.36), (cw.x + sx * 0.42, cw.y + 0.42, cw.z + sz * 0.36), 0.075, 'log', n=6)
    for y in (-0.3, 0.3):
        for sz in (-1, 1):
            beam(mb, (cw.x - 0.42, cw.y + y, cw.z + sz * 0.36), (cw.x + 0.42, cw.y + y, cw.z + sz * 0.36), 0.085, 0.085, 'iron')
        for sx in (-1, 1):
            beam(mb, (cw.x + sx * 0.42, cw.y + y, cw.z - 0.36), (cw.x + sx * 0.42, cw.y + y, cw.z + 0.36), 0.085, 0.085, 'iron')
    mb.add(prim_box(0.8, 0.85, 0.66), 'dark', M(tuple(cw)))
    for (dx, dy, dz, s) in ((-0.18, 0.4, -0.1, 0.27), (0.2, 0.44, 0.1, 0.25), (0.0, 0.52, -0.05, 0.22), (-0.22, 0.34, 0.18, 0.2)):
        rock(mb, (cw.x + dx, cw.y + dy, cw.z + dz), s, 'stone', 20 + 80 * dx)
    # suportes do contrapeso (placas de ferro ligando a gaiola à viga) e crânio-adorno
    for sx in (-1, 1):
        beam(mb, tuple(Rz(-0.95) + Vector((sx * 0.15, 0.0, 0.0))), (cw.x + sx * 0.36, cw.y + 0.45, cw.z), 0.06, 0.06, 'iron')
    skull(mb, Matrix.Translation(cw + Vector((0, 0.0, -0.4))) @ M(r=(0, 180, 0)), 0.3)
    tp = S.tail_strip(0.3, 0.55, 2, 5.0)
    v, f = prim_extrude(tp, 0.03, axis='x')
    mb.add((v, f), 'team', Matrix.Translation(cw + Vector((0.42, 0.5, 0.0))), smooth=30)
    # ---- ponta: suportes em Y + concha com a carga (rocha e crânios) --------------------------------
    tip = Rz(2.0)
    cup_c = tip + Vector((0, 0.05, 0.32))
    for sx in (-1, 1):
        beam(mb, tuple(Rz(1.7)), (cup_c.x + sx * 0.34, cup_c.y - 0.06, cup_c.z - 0.05), 0.085, 0.085, 'log', bevel=0.01)
    mb.add(prim_sphere(0.46, 0.36, 0.44, 10, 4, y_min=-1.0, y_max=0.1), 'hide_dark', Matrix.Translation(cup_c), smooth=40)
    mb.add(prim_rings([ring_h(0.0, 0.47, 0.45, 10), ring_h(0.07, 0.49, 0.47, 10)], cap0=False, cap1=False), 'iron',
           Matrix.Translation(cup_c + Vector((0, 0.03, 0))), smooth=30)
    for k in range(5):
        a = math.radians(72 * k + 10)
        mb.add(prim_cone(0.035, 0.13, 4), 'iron', M((cup_c.x + 0.49 * math.cos(a), cup_c.y + 0.09, cup_c.z + 0.47 * math.sin(a)), (0, 0, 0)))
    # carga: rocha grande + 2 crânios
    mb.add(prim_sphere(0.36, 0.3, 0.34, 8, 4), 'stone', M((cup_c.x + 0.02, cup_c.y + 0.22, cup_c.z + 0.02), (10, 30, 5)), smooth=0)
    skull(mb, M((cup_c.x - 0.25, cup_c.y + 0.2, cup_c.z + 0.26), (-15, -30, 0)), 0.3)
    skull(mb, M((cup_c.x + 0.28, cup_c.y + 0.18, cup_c.z - 0.16), (-10, 120, 10)), 0.27)
    return mb.build(mats, parent=root, location=ARM_PIVOT)


def build_wheel(mats, root, name, side):
    mb = MeshBuilder(name)
    S.plank_wheel(mb, WHEEL_R, side)
    return mb.build(mats, parent=root, location=(side * 1.12, AXLE[1], AXLE[2]))


def main():
    args = C.script_args()
    C.reset_scene()
    mats = C.make_paint_set(PALETTE)
    root = C.make_empty('Catapult')
    body = build_body(mats, root)
    arm = build_arm(mats, root)
    wl = build_wheel(mats, root, 'WheelL', -1)
    wr = build_wheel(mats, root, 'WheelR', 1)
    parts = [body, arm, wl, wr]
    C.scale_parts(parts, SCALE)
    bpy.context.view_layer.update()
    C.uv_atlas(parts, weights={'Body': 1.0, 'SiegeArm': 1.1, 'WheelL': 0.8, 'WheelR': 0.8}, margin=0.006)
    img = C.bake_atlas(parts, 'catapult_atlas', 512, samples=int(os.environ.get('BAKE_SAMPLES', 32)), margin=4)
    C.finalize_materials(parts, img, team_default=TEAM_DEFAULT, out_png=os.path.join(C.BUILD_DIR, 'catapult_atlas.png'))
    out = os.path.join(C.OUT_MODELS, 'catapult.glb')
    C.export_glb(root, out)
    print('STATS catapult', C.stats(root, out))
    print('BBOX', bbox_game(root))
    if '--no-render' not in args:
        rig = C.RenderRig(root, 'catapult', res=int(os.environ.get('RENDER_RES', 800)), samples=24)
        rig.render('34', (1.0, 0.95, 1.0), 30)
        rig.render('front', (0.0, 0.25, 1.0), 30)
        rig.render('back', (-0.6, 0.6, -1.0), 30)
        rig.render('side', (1.0, 0.2, 0.0), 30)
        rig.render('game', (45, 44, 45), 24, dist=18)
        C.set_team_color('#2f63e0')
        rig.render('34_azul', (1.0, 0.95, 1.0), 30)
        C.set_team_color(TEAM_DEFAULT)


if __name__ == '__main__':
    main()
