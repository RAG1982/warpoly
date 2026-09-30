"""
build_knight.py — soldado humano (Espadachim, tipo interno `knight`) gerado 100% por script.

Referência de arte: /home/rafael/Documentos/soldado.png (armadura de placas prateada com detalhes
dourados, elmo aberto de aço, capa e mangas azuis, cinto de couro, espada longa).

Uso:
  blender -b --factory-startup --python tools/blender/build_knight.py -- [--no-render]

Hierarquia PLANA (igual ao KnightModel.js procedural — o UnitAnimator anima Sword/Arm* com
rotações independentes e posições absolutas na raiz; não aninhe as peças):
  Knight (raiz)
  ├─ Torso   pivô (0, 1.05, 0)     (capa e saiote em cor de time)
  ├─ Head    pivô (0, 1.62, 0)
  ├─ ArmL / ArmR  pivô (∓0.38, 1.25, 0)  (ombreira incluída)
  ├─ LegL / LegR  pivô (∓0.16, 0.68, 0)
  └─ Sword   pivô (0.48, 0.75, 0.25), repouso rot x 0.5 rad / z −0.1 rad (gume para +Z)
Sem escudo (a referência não tem; o animador ignora ShieldGroup ausente).
"""
import os
import sys
import math

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C  # noqa: E402
from common import (MeshBuilder, M, prim_box, prim_rings, ring_h, prim_cyl, prim_cone,  # noqa: E402
                    prim_sphere, prim_extrude, limb_rings, bezier)

TORSO_PIVOT = (0.0, 1.05, 0.0)
HEAD_PIVOT = (0.0, 1.62, 0.0)
ARM_PIVOT = (0.38, 1.25, 0.0)
LEG_PIVOT = (0.16, 0.68, 0.0)
SWORD_PIVOT = (0.48, 0.75, 0.25)
SWORD_REST_DEG = (math.degrees(0.5), 0.0, math.degrees(-0.1))
TEAM_DEFAULT = '#2f63e0'  # azul da referência (multiplica a área cinza)

PALETTE = {
    'skin': dict(base='#d9a273', var='#c48857', var_scale=6.0, var_amt=0.5, fine=0.05,
                 top=0.2, ao=(0.2, 0.5)),
    'hair': dict(base='#5a3a20', var='#3f2714', var_scale=10.0, fine=0.15, top=0.2, ao=(0.2, 0.5)),
    'steel': dict(base='#a7b0bf', var='#8792a4', var_scale=8.0, var_amt=0.7, fine=0.08, top=0.35,
                  edge='#f4f8ff', edge_amt=1.0, edge_r=0.02, edge_gain=12.0, ao=(0.22, 0.5),
                  grad=(0.0, 2.0, 0.18)),
    'steel_dark': dict(base='#6d7686', var='#586170', var_scale=7.0, fine=0.1, top=0.3,
                       edge='#d9e0ea', edge_amt=0.9, edge_r=0.02, edge_gain=12.0, ao=(0.22, 0.55)),
    'gold': dict(base='#dba52a', var='#b98318', var_scale=9.0, var_amt=0.7, fine=0.06, top=0.4,
                 edge='#ffe9a0', edge_amt=1.0, edge_r=0.018, edge_gain=12.0, ao=(0.2, 0.45)),
    'leather': dict(base='#7a4a26', var='#5c3419', var_scale=6.0, fine=0.12, top=0.2,
                    edge='#b07a48', edge_amt=0.5, edge_r=0.02, ao=(0.25, 0.6)),
    'blade': dict(base='#c5cedb', var='#a3aebf', var_scale=6.0, fine=0.06, top=0.4,
                  edge='#ffffff', edge_amt=1.0, edge_r=0.02, edge_gain=14.0, ao=(0.2, 0.4)),
    'eye': dict(base='#2a4d7a', var='#1c3556', var_scale=20.0),
    'mouth': dict(base='#7a3b30', var='#5a2a22'),
    'brow': dict(base='#4a2d18', var='#33200f'),
    'team': dict(base='#b8b0a4', var='#9d9589', var_scale=5.0, fine=0.08, top=0.25,
                 edge='#d8d2c8', edge_amt=0.3, edge_r=0.03, ao=(0.3, 0.65), team=True),
}


def cloth_panel(top_l, top_r, bot_l, bot_r, nx=5, ny=4, thick=0.03, bulge=(0, 0, 0),
                wave=0.03, jag=0.04):
    """Painel de tecido (slab fino) entre 4 cantos, com dobras e barra irregular."""
    import mathutils
    V = mathutils.Vector
    tl, tr, bl, br = V(top_l), V(top_r), V(bot_l), V(bot_r)
    b = V(bulge)
    front, back = [], []
    for j in range(ny + 1):
        v = j / ny
        for i in range(nx + 1):
            u = i / nx
            p = (tl.lerp(tr, u)).lerp(bl.lerp(br, u), v)
            p = p + b * math.sin(math.pi * u) * v
            p.z += math.sin(u * math.pi * 3.0) * wave * v
            if j == ny:
                p.y += jag * (1 if i % 2 else -1)
            front.append(tuple(p))
            back.append(tuple(p + V((0, 0, -thick))))
    verts = front + back
    n = (nx + 1) * (ny + 1)
    faces = []
    for j in range(ny):
        for i in range(nx):
            a = j * (nx + 1) + i
            faces.append((a, a + 1, a + nx + 2, a + nx + 1))
            faces.append((n + a, n + a + nx + 1, n + a + nx + 2, n + a + 1))

    def idx(i, j):
        return j * (nx + 1) + i
    border = [idx(i, 0) for i in range(nx + 1)] + [idx(nx, j) for j in range(1, ny + 1)] + \
             [idx(i, ny) for i in range(nx - 1, -1, -1)] + [idx(0, j) for j in range(ny - 1, 0, -1)]
    for k in range(len(border)):
        a, c = border[k], border[(k + 1) % len(border)]
        faces.append((a, c, n + c, n + a))
    return verts, faces


# ---------------------------------------------------------------------------
def build_torso(mats, root):
    mb = MeshBuilder('Torso')
    # gibão azul (mangas/saiote) sob a couraça: cilindro de tronco em cor de time
    tunic = [ring_h(-0.22, 0.25, 0.19, 12), ring_h(-0.05, 0.26, 0.20, 12), ring_h(0.15, 0.30, 0.21, 12),
             ring_h(0.33, 0.32, 0.20, 12)]
    mb.add(prim_rings(tunic), 'team', smooth=70)
    # couraça de placas: peitoral em quilha (afunilado na cintura) + placa das costas
    breast = [ring_h(-0.16, 0.245, 0.185, 14, cz=0.02), ring_h(0.02, 0.29, 0.215, 14, cz=0.03),
              ring_h(0.18, 0.335, 0.235, 14, cz=0.03), ring_h(0.33, 0.325, 0.20, 14, cz=0.01),
              ring_h(0.40, 0.25, 0.16, 14, cz=0.0)]
    mb.add(prim_rings(breast), 'steel', smooth=60, bevel=0.008)
    # quilha central e frisos dourados
    mb.add(prim_box(0.05, 0.50, 0.06, taper=(0.5, 0.6)), 'steel_dark', M((0, 0.14, 0.235)), bevel=0.01)
    # friso dourado da cintura (colado à couraça, sem passar da largura do peitoral)
    mb.add(prim_rings([ring_h(-0.135, 0.252, 0.192, 14, cz=0.02), ring_h(-0.105, 0.258, 0.196, 14, cz=0.02)],
                      cap0=False, cap1=False), 'gold', smooth=30)
    # bordas douradas do peitoral (gola) e das cavas dos braços
    mb.add(prim_rings([ring_h(0.385, 0.262, 0.168, 14), ring_h(0.405, 0.255, 0.163, 14)], cap0=False, cap1=False),
           'gold', smooth=30)
    # gorjal (colar de placas) com aro dourado
    mb.add(prim_rings([ring_h(0.36, 0.20, 0.17, 12), ring_h(0.43, 0.17, 0.15, 12)], cap0=False, cap1=False),
           'steel', smooth=40)
    mb.add(prim_rings([ring_h(0.425, 0.185, 0.16, 12), ring_h(0.445, 0.185, 0.16, 12)], cap0=False, cap1=False),
           'gold', smooth=30)
    # cinto de couro com fivela dourada + bolsa
    mb.add(prim_rings([ring_h(-0.24, 0.27, 0.205, 14), ring_h(-0.12, 0.275, 0.21, 14)]), 'leather', smooth=40)
    mb.add(prim_box(0.15, 0.13, 0.05), 'gold', M((0, -0.18, 0.215)), bevel=0.015)
    mb.add(prim_box(0.08, 0.07, 0.04), 'steel_dark', M((0, -0.18, 0.238)), bevel=0.01)
    mb.add(prim_box(0.13, 0.15, 0.10), 'leather', M((0.30, -0.2, 0.05), (0, 0, -6)), bevel=0.02, smooth=30)
    mb.add(prim_box(0.14, 0.05, 0.11), 'leather', M((0.30, -0.13, 0.05)), bevel=0.012)
    # tassetes (saiote de placas nas coxas) — 3 lâminas de aço com barra dourada
    for k, (w, y, z) in enumerate(((0.20, -0.32, 0.20), (0.17, -0.42, 0.205))):
        mb.add(prim_box(w, 0.10, 0.03, taper=(0.9, 1.0)), 'steel', M((0, y, z), (-6 - k * 3, 0, 0)), bevel=0.008)
    for sx in (-1, 1):
        mb.add(prim_box(0.16, 0.20, 0.03, taper=(0.85, 1.0)), 'steel',
               M((sx * 0.19, -0.34, 0.15), (-8, sx * -12, sx * -8)), bevel=0.008)
        mb.add(prim_box(0.16, 0.025, 0.036), 'gold', M((sx * 0.20, -0.435, 0.163), (-8, sx * -12, sx * -8)))
    # saiote azul (frente/atrás) em cor de time — sobra do gibão, com barra recortada
    mb.add(cloth_panel((-0.16, -0.30, 0.19), (0.16, -0.30, 0.19), (-0.19, -0.66, 0.2), (0.19, -0.66, 0.2),
                       nx=4, ny=3, bulge=(0, 0, 0.03), jag=0.03), 'team', smooth=50)
    mb.add(cloth_panel((0.2, -0.30, -0.17), (-0.2, -0.30, -0.17), (0.23, -0.68, -0.2), (-0.23, -0.68, -0.2),
                       nx=4, ny=3, bulge=(0, 0, -0.03), jag=0.03), 'team', smooth=50)
    # capa azul (cor de time) presa por dois grampos dourados nos ombros
    mb.add(cloth_panel((0.27, 0.38, -0.19), (-0.27, 0.38, -0.19), (0.36, -0.86, -0.40), (-0.36, -0.86, -0.40),
                       nx=6, ny=5, thick=0.035, bulge=(0, 0, -0.10), wave=0.05, jag=0.06), 'team', smooth=50)
    mb.add(prim_box(0.50, 0.04, 0.07, taper=(0.9, 1.0)), 'gold', M((0, 0.37, -0.18)), bevel=0.01)
    for sx in (-1, 1):
        mb.add(prim_sphere(0.045, 0.045, 0.04, 6, 4), 'gold', M((sx * 0.2, 0.36, 0.0)), smooth=60)
    return mb.build(mats, parent=root, location=TORSO_PIVOT)


def build_head(mats, root):
    mb = MeshBuilder('Head')
    # rosto (só a face frontal +Z tem traços; laterais/nuca ficam lisas)
    mb.add(prim_sphere(0.145, 0.175, 0.155, 12, 6), 'skin', M((0, -0.02, 0.01)), smooth=75)
    mb.add(prim_cyl(0.075, 0.09, 0.12, 8), 'skin', M((0, -0.25, 0.0)), smooth=60)   # pescoço
    # traços frontais
    for sx in (-1, 1):
        mb.add(prim_sphere(0.026, 0.02, 0.014, 6, 3), 'eye', M((sx * 0.062, 0.005, 0.148)), smooth=80)
        mb.add(prim_box(0.075, 0.02, 0.02), 'brow', M((sx * 0.062, 0.042, 0.148), (0, 0, sx * -8)), bevel=0.005)
    mb.add(prim_box(0.035, 0.07, 0.04, taper=(0.7, 0.8)), 'skin', M((0, -0.04, 0.155), (-8, 0, 0)), bevel=0.008)
    mb.add(prim_box(0.075, 0.014, 0.014), 'mouth', M((0, -0.115, 0.147)), bevel=0.003)
    # cabelo castanho aparecendo sob o elmo (nuca)
    mb.add(prim_sphere(0.15, 0.115, 0.15, 10, 4, y_max=0.2), 'hair', M((0, -0.07, -0.035)), smooth=70)
    # elmo aberto: calota + aba + protetor nasal + bochechas + cobre-nuca + crista dourada
    mb.add(prim_sphere(0.195, 0.195, 0.215, 12, 5, y_min=-0.05), 'steel', M((0, 0.06, 0.0)), smooth=60)
    mb.add(prim_rings([ring_h(0.045, 0.2, 0.22, 14), ring_h(0.075, 0.195, 0.215, 14)]), 'gold', smooth=30)
    mb.add(prim_box(0.045, 0.16, 0.035, taper=(0.75, 1.0)), 'steel', M((0, -0.01, 0.205), (4, 0, 0)), bevel=0.008)
    for sx in (-1, 1):
        mb.add(prim_box(0.035, 0.15, 0.17, taper=(0.9, 0.8)), 'steel', M((sx * 0.155, -0.05, 0.0)), bevel=0.01)
        mb.add(prim_box(0.012, 0.15, 0.012), 'gold', M((sx * 0.176, -0.05, 0.095)))
    mb.add(prim_box(0.30, 0.12, 0.04, taper=(0.85, 1.0)), 'steel', M((0, -0.05, -0.185), (12, 0, 0)), bevel=0.01)
    mb.add(prim_box(0.03, 0.04, 0.34, taper=(0.5, 0.9)), 'gold', M((0, 0.235, 0.0)), bevel=0.008)
    return mb.build(mats, parent=root, location=HEAD_PIVOT)


def build_arm(mats, root, side):
    """side = +1 (ArmR) ou −1 (ArmL); pivô no ombro, repouso pendendo em −Y."""
    s = side
    mb = MeshBuilder('ArmR' if s > 0 else 'ArmL')
    # ombreira: domo de aço com lâminas sobrepostas e friso dourado
    mb.add(prim_sphere(0.16, 0.13, 0.17, 10, 4, y_min=0.0), 'steel', M((s * 0.02, 0.05, 0.0), (0, 0, -s * 18)),
           smooth=50, bevel=0.006)
    mb.add(prim_sphere(0.15, 0.10, 0.16, 10, 3, y_min=0.0), 'steel', M((s * 0.05, -0.04, 0.0), (0, 0, -s * 30)),
           smooth=50)
    mb.add(prim_cyl(0.16, 0.155, 0.03, 10), 'gold', M((s * 0.02, 0.045, 0.0), (0, 0, -s * 18)), smooth=30)
    # manga azul (cor de time) + braçal de aço no antebraço
    up = [(s * 0.01, -0.06, 0.0), (s * 0.015, -0.20, 0.0), (s * 0.02, -0.32, 0.0)]
    mb.add(prim_rings(limb_rings(up, [0.085, 0.09, 0.08], 8)), 'team', smooth=70)
    mb.add(prim_sphere(0.075, 0.075, 0.075, 8, 4), 'steel', M((s * 0.02, -0.33, 0.0)), smooth=50)    # cotovelo
    fa = [(s * 0.02, -0.34, 0.0), (s * 0.025, -0.46, 0.015), (s * 0.03, -0.58, 0.03)]
    mb.add(prim_rings(limb_rings(fa, [0.07, 0.075, 0.06], 8)), 'steel', smooth=60, bevel=0.005)
    mb.add(prim_cyl(0.078, 0.078, 0.02, 8), 'gold', M((s * 0.024, -0.42, 0.01), (-12, 0, 0)), smooth=30)
    # manopla
    mb.add(prim_box(0.09, 0.11, 0.10, taper=(0.9, 0.85)), 'steel_dark', M((s * 0.03, -0.64, 0.04)), bevel=0.014)
    mb.add(prim_box(0.08, 0.05, 0.06), 'steel_dark', M((s * 0.03, -0.71, 0.07)), bevel=0.01)
    return mb.build(mats, parent=root, location=(s * ARM_PIVOT[0], ARM_PIVOT[1], ARM_PIVOT[2]))


def build_leg(mats, root, side):
    s = side
    mb = MeshBuilder('LegR' if s > 0 else 'LegL')
    # coxote de aço, joelheira com espigão, grevas e bota de couro com peito do pé articulado
    th = [(0, -0.02, 0), (s * 0.005, -0.18, 0.01), (s * 0.01, -0.34, 0.01)]
    mb.add(prim_rings(limb_rings(th, [(0.115, 0.12), (0.12, 0.125), (0.095, 0.10)], 8)), 'steel', smooth=60, bevel=0.005)
    mb.add(prim_cyl(0.118, 0.118, 0.02, 10), 'gold', M((0, -0.07, 0.0)), smooth=30)
    mb.add(prim_sphere(0.10, 0.09, 0.09, 8, 4), 'steel', M((s * 0.01, -0.36, 0.05)), smooth=50)
    mb.add(prim_cone(0.03, 0.06, 6), 'gold', M((s * 0.01, -0.36, 0.13), (90, 0, 0)))
    sh = [(s * 0.01, -0.38, 0.02), (s * 0.015, -0.50, 0.01), (s * 0.02, -0.62, 0.0)]
    mb.add(prim_rings(limb_rings(sh, [0.09, 0.095, 0.075], 8)), 'steel', smooth=60, bevel=0.005)
    mb.add(prim_cyl(0.098, 0.098, 0.02, 10), 'gold', M((s * 0.013, -0.47, 0.01)), smooth=30)
    mb.add(prim_box(0.17, 0.09, 0.30, taper=(0.85, 0.7), base=True), 'leather', M((s * 0.02, -0.68, 0.06)),
           bevel=0.02, smooth=35)
    mb.add(prim_box(0.15, 0.05, 0.13, base=True), 'steel_dark', M((s * 0.02, -0.62, 0.17)), bevel=0.015)
    return mb.build(mats, parent=root, location=(s * LEG_PIVOT[0], LEG_PIVOT[1], LEG_PIVOT[2]))


def build_sword(mats, root):
    """Espada longa: empunhadura em y≈0, lâmina em +Y com o gume voltado para ±Z (frente = +Z),
    plano da lâmina em X (fino)."""
    mb = MeshBuilder('Sword')
    mb.add(prim_cyl(0.026, 0.026, 0.22, 8, base=False), 'leather', M((0, -0.10, 0)), smooth=50)
    for y in (-0.16, -0.10, -0.04):
        mb.add(prim_cyl(0.03, 0.03, 0.012, 8, base=False), 'gold', M((0, y, 0)))
    mb.add(prim_sphere(0.05, 0.05, 0.05, 8, 4), 'gold', M((0, -0.25, 0)), smooth=60)
    mb.add(prim_box(0.36, 0.05, 0.06), 'gold', M((0, 0.04, 0)), bevel=0.012)
    for sx in (-1, 1):
        mb.add(prim_sphere(0.028, 0.028, 0.03, 6, 3), 'gold', M((sx * 0.19, 0.04, 0)), smooth=60)
        mb.add(prim_box(0.08, 0.04, 0.045), 'gold', M((sx * 0.13, 0.075, 0), (0, 0, sx * -25)), bevel=0.008)
    mb.add(prim_box(0.036, 0.82, 0.115, taper=(0.9, 0.85), base=True), 'blade', M((0, 0.065, 0)), bevel=0.006)
    mb.add(prim_box(0.02, 0.56, 0.03, taper=(0.6, 0.6), base=True), 'steel_dark', M((0.014, 0.12, 0)))
    mb.add(prim_cone(0.058, 0.16, 4, base=True), 'blade', M((0, 0.885, 0), (0, 45, 0), (0.30, 1.0, 1.0)))
    sw = mb.build(mats, parent=root, location=SWORD_PIVOT)
    C.set_rot_game(sw, SWORD_REST_DEG)
    return sw


def main():
    args = C.script_args()
    C.reset_scene()
    mats = C.make_paint_set(PALETTE)
    root = C.make_empty('Knight')
    torso = build_torso(mats, root)
    head = build_head(mats, root)
    arm_l = build_arm(mats, root, -1)
    arm_r = build_arm(mats, root, 1)
    leg_l = build_leg(mats, root, -1)
    leg_r = build_leg(mats, root, 1)
    sword = build_sword(mats, root)
    parts = [torso, head, arm_l, arm_r, leg_l, leg_r, sword]
    import bpy
    bpy.context.view_layer.update()

    C.uv_atlas(parts, weights={'Head': 1.5, 'Torso': 1.2, 'Sword': 0.8, 'LegL': 0.8, 'LegR': 0.8,
                               'ArmL': 0.8, 'ArmR': 0.8}, margin=0.008)
    img = C.bake_atlas(parts, 'knight_atlas', 512, samples=int(os.environ.get('BAKE_SAMPLES', 32)), margin=4)
    C.finalize_materials(parts, img, team_default=TEAM_DEFAULT,
                         out_png=os.path.join(C.BUILD_DIR, 'knight_atlas.png'))
    out = os.path.join(C.OUT_MODELS, 'knight.glb')
    C.export_glb(root, out)
    st = C.stats(root, out)
    print('STATS knight', st)
    if '--no-render' not in args:
        rig = C.RenderRig(root, 'knight', res=int(os.environ.get('RENDER_RES', 800)), samples=24)
        rig.render('34', (1.0, 0.95, 1.0), 30)
        rig.render('front', (0.0, 0.25, 1.0), 30)
        rig.render('back', (-0.6, 0.6, -1.0), 30)
        rig.render('side', (1.0, 0.2, 0.0), 30)
        rig.render('game', (45, 44, 45), 24, dist=78 / 1.62)
        C.set_team_color('#c0392b')
        rig.render('34_vermelho', (1.0, 0.95, 1.0), 30)
        C.set_team_color(TEAM_DEFAULT)


main()
