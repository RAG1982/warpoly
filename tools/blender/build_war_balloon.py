"""
build_war_balloon.py — Balão de Guerra (orc, tipo interno `war_balloon`) gerado 100% por script.

Batedor aéreo orc: envelope em gomos de couro remendado com faixa equatorial em cor de time, rede de cordas e
espinhos de osso na coroa, runa de guerra pintada na frente, boca com braseiro aceso, cesta de vime reforçada
com ferro e crânio, orc vigia debruçado na proa (cabeça `Head`), barris de sacos de lastro, estandarte esfarrapado
e hélice de popa de ossos e madeira (`Rotor`).

Uso:
  blender -b --factory-startup --python tools/blender/build_war_balloon.py -- [--no-render]

Hierarquia (nomes lidos por `ModelFactory.rebindUserData` / `UnitAnimator.applyAir`):
  WarBalloon (raiz)
  └─ Torso   envelope, cesta, cordas, braseiro, vigia (pivô na origem; base em y = 0)
     ├─ Head    cabeça do vigia (pivô (0; 1,14; 0,78))
     └─ Rotor   hélice de popa (pivô (0; 0,5; −1,3)); gira em z
Frente = +Z. Cor de time: faixa equatorial, estandarte, faixas da cesta, lenço do vigia.
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
import air_common as A  # noqa: E402

TEAM_DEFAULT = '#b81d24'
HEAD_PIVOT = (0.0, 1.14, 0.78)
ROTOR_PIVOT = (0.0, 0.5, -1.3)
ENV_PROFILE = [(2.1, 0.26), (2.35, 0.66), (2.8, 1.04), (3.35, 1.24), (3.95, 1.28), (4.5, 1.12), (4.95, 0.8),
               (5.25, 0.42), (5.37, 0.1)]

PALETTE = A.base_palette()
PALETTE.update({
    'hide': dict(base='#c08a4c', var='#9a6a38', var_scale=1.6, var_amt=0.9, fine=0.1, top=0.35, edge='#d3a875',
                 edge_amt=0.3, edge_r=0.04, ao=(0.6, 0.55)),
    'hide_dark': dict(base='#6e4a2a', var='#4a2f16', var_scale=1.4, var_amt=0.9, fine=0.12, top=0.35,
                      edge='#b98a58', edge_amt=0.3, edge_r=0.03, ao=(0.5, 0.55)),
    'patch': dict(base='#5f6a3a', var='#444d28', var_scale=5.0, var_amt=0.9, fine=0.12, top=0.3),
    'wicker': dict(base='#a0764a', var='#7a5530', var_scale=2.0, fine=0.1, pattern='planks_v', mapping='box',
                   pw=2.0, ph=0.08, mortar='#3a2616', mortar_size=0.04, top=0.25, edge='#c9a070', edge_amt=0.3,
                   edge_r=0.02, ao=(0.5, 0.6)),
    'bone': dict(base='#c8bd9c', var='#a09476', var_scale=4.0, var_amt=0.7, fine=0.06, top=0.35, edge='#fff7de',
                 edge_amt=0.6, edge_r=0.02, ao=(0.3, 0.55)),
    'ember': dict(base='#ff7a1a', var='#ffb040', var_scale=5.0, emit_boost=1.4),
    'coal': dict(base='#2a1d17', var='#1a110d', var_scale=6.0, fine=0.1, top=0.2),
    'skin': dict(base='#5f8a3a', var='#456a2a', var_scale=8.0, fine=0.06, top=0.3, ao=(0.3, 0.5)),
    'paint': dict(base='#a0231a', var='#781710', var_scale=6.0, fine=0.1, top=0.2),
    'sack': dict(base='#9a8a68', var='#74664a', var_scale=10.0, fine=0.14, top=0.25, ao=(0.3, 0.5)),
    'powder': dict(base='#2a2a30', var='#18181c', var_scale=6.0, fine=0.12, top=0.4, edge='#8a8a96', edge_amt=0.6,
                   edge_r=0.02, ao=(0.2, 0.5)),
})


def gore_mat(n_gores=10):
    """mat_fn: gomos alternados de couro claro/escuro; remendos em verde no meio de alguns gomos."""
    def fn(c, nrm):
        a = math.atan2(c[2], c[0]) % (2 * math.pi)
        k = int(a / (2 * math.pi) * n_gores)
        return 'hide' if k % 2 else 'hide_dark'
    return fn


def build_torso(mats, root):
    mb = MeshBuilder('Torso')
    # envelope: gomos de couro
    rings = [ring_h(y, r, r, 20, phase=math.pi / 20) for (y, r) in ENV_PROFILE]
    mb.add(prim_rings(rings, cap0=False, cap1=True), 'hide', smooth=50, mat_fn=gore_mat(10))
    # faixa equatorial em cor de time (levemente maior)
    band = [ring_h(3.2, 1.25, 1.25, 20, phase=math.pi / 20), ring_h(3.5, 1.3, 1.3, 20, phase=math.pi / 20),
            ring_h(3.8, 1.32, 1.32, 20, phase=math.pi / 20), ring_h(4.1, 1.29, 1.29, 20, phase=math.pi / 20)]
    mb.add(prim_rings(band, cap0=False, cap1=False), 'team', smooth=40)
    # boca do envelope: aro de ferro e saia de couro escura
    mb.add(prim_rings([ring_h(2.05, 0.38, 0.38, 12), ring_h(2.15, 0.33, 0.33, 12)], cap0=False, cap1=False), 'iron', smooth=30)
    # meridianos de corda (rede) com ancoragem na boca
    for k in range(10):
        a = 2 * math.pi * k / 10
        pts = []
        for (y, r) in ENV_PROFILE[1:-1]:
            pts.append((math.cos(a) * (r + 0.025), y, math.sin(a) * (r + 0.025)))
        A.tube(mb, pts, [0.022] * len(pts), 'rope', n=4, smooth=30)
    # coroa: ponteira de ferro e espinhos de osso em anel
    mb.add(prim_cone(0.2, 0.55, 8), 'iron', M((0, 5.33, 0)), smooth=40)
    mb.add(prim_sphere(0.14, 0.14, 0.14, 7, 4), 'bone', M((0, 5.3, 0)), smooth=70)
    for k in range(6):
        a = 2 * math.pi * k / 6 + 0.3
        px, pz = math.cos(a) * 0.45, math.sin(a) * 0.45
        mb.add(prim_cone(0.07, 0.42, 5), 'bone', M((px, 5.0, pz), (math.degrees(math.sin(a)) * 0.0 + 28 * math.sin(a), 0, -28 * math.cos(a))), smooth=40)
    # runa de guerra pintada (frente, +Z): crânio de tusk estilizado
    zf = 1.27
    mb.add(prim_box(0.16, 0.9, 0.12, taper=(1, 1)), 'paint', M((0, 3.5, zf), (0, 0, 0)), bevel=0.01)
    mb.add(prim_box(0.8, 0.14, 0.12), 'paint', M((0, 3.8, zf - 0.02)), bevel=0.01)
    for sx in (-1, 1):
        mb.add(prim_box(0.14, 0.62, 0.1), 'paint', M((sx * 0.34, 3.3, zf - 0.07), (0, sx * 22, sx * -18)), bevel=0.01)
    # cesta: vime sobre armação de madeira, borda e aros de ferro (maior que a v1: ~1,8 x 1,8)
    hw = 0.93
    t = 0.1
    mb.add(prim_box(1.76, 0.12, 1.76), 'wood_dark', M((0, 0.3, 0)), bevel=0.02)  # piso
    for sz in (-1, 1):   # paredes de vime (frente/trás e laterais) com borda aberta no topo
        mb.add(prim_box(1.8, 0.8, t, base=True), 'wicker', M((0, 0.14, sz * (hw - t / 2 + 0.01))), bevel=0.01)
        mb.add(prim_box(t, 0.8, 1.7, base=True), 'wicker', M((sz * (hw - t / 2 + 0.01), 0.14, 0)), bevel=0.01)
    mb.add(prim_box(1.92, 0.09, 1.92), 'wood_dark', M((0, 0.1, 0)), bevel=0.02)
    for sz in (-1, 1):   # corrimão
        mb.add(prim_box(2.0, 0.11, 0.13), 'wood', M((0, 0.9, sz * hw)), bevel=0.02)
        mb.add(prim_box(0.13, 0.11, 2.0), 'wood', M((sz * hw, 0.9, 0)), bevel=0.02)
    for sx in (-1, 1):
        for sz in (-1, 1):
            mb.add(prim_box(0.13, 1.0, 0.13, base=True), 'wood_dark', M((sx * hw, 0.08, sz * hw)), bevel=0.014)
            mb.add(prim_sphere(0.09, 0.09, 0.09, 6, 3), 'iron', M((sx * hw, 1.1, sz * hw)), smooth=60)
    for y in (0.3, 0.62):
        mb.add(prim_box(1.84, 0.05, 1.84), 'iron', M((0, y, 0)))
    # faixa de time na cesta (frente e lados) e crânio de ogro na proa
    mb.add(prim_box(1.66, 0.24, 0.04), 'team', M((0, 0.5, hw)), bevel=0.005)
    for sx in (-1, 1):
        mb.add(prim_box(0.04, 0.24, 1.6), 'team', M((sx * hw, 0.5, 0.0)), bevel=0.005)
    skull(mb, M((0, 0.42, hw + 0.04)), 0.42, 'bone')
    # presas de osso nos cantos da proa
    for sx in (-1, 1):
        mb.add(prim_cone(0.07, 0.55, 5), 'bone', M((sx * 0.85, 0.5, hw + 0.06), (-65, sx * 15, 0)), smooth=40)
    # cordas de suspensão: cantos da cesta -> boca do envelope
    for sx in (-1, 1):
        for sz in (-1, 1):
            beam(mb, (sx * hw, 1.1, sz * hw), (sx * 0.3, 2.12, sz * 0.3), 0.045, 0.045, 'rope')
    # braseiro suspenso na boca: bacia de ferro com brasas e chama
    mb.add(prim_sphere(0.34, 0.22, 0.34, 10, 4, y_max=0.0), 'iron', M((0, 1.72, 0)), smooth=45)
    mb.add(prim_cyl(0.36, 0.36, 0.04, 10), 'iron', M((0, 1.74, 0)), smooth=30)
    mb.add(prim_sphere(0.3, 0.08, 0.3, 8, 3, y_min=0.0), 'coal', M((0, 1.74, 0)), smooth=50)
    mb.add(prim_cone(0.22, 0.6, 7), 'ember', M((0, 1.76, 0)), smooth=40)
    mb.add(prim_cone(0.11, 0.42, 6), 'ember', M((0.12, 1.76, 0.06)), smooth=40)
    for k in range(3):
        a = 2 * math.pi * k / 3
        beam(mb, (math.cos(a) * 0.34, 1.8, math.sin(a) * 0.34), (math.cos(a) * 0.14, 2.14, math.sin(a) * 0.14), 0.028, 0.028, 'iron')
    # sacos de lastro e barril de pólvora pendurados nas laterais; sacos e rolo de corda no piso da cesta
    for (x, z, s) in ((-1.12, 0.35, 1.2), (-1.14, -0.2, 1.0), (1.14, -0.3, 1.1)):
        mb.add(prim_sphere(0.17 * s, 0.2 * s, 0.16 * s, 8, 4), 'sack', M((x, 0.55, z)), smooth=70)
        mb.add(prim_cyl(0.06, 0.06, 0.06, 6), 'rope', M((x, 0.73, z)))
        beam(mb, (x * 0.9, 0.95, z), (x, 0.74, z), 0.025, 0.025, 'rope')
    mb.add(prim_rings([ring_h(0.0, 0.17, 0.17, 8), ring_h(0.18, 0.21, 0.21, 8), ring_h(0.36, 0.17, 0.17, 8)]), 'powder',
           M((1.12, 0.62, 0.45)), smooth=50)
    beam(mb, (1.02, 1.0, 0.45), (1.12, 0.98, 0.45), 0.025, 0.025, 'rope')
    for (x, z, s) in ((-0.55, -0.4, 1.0), (0.1, -0.55, 0.85), (0.5, -0.35, 0.9)):
        mb.add(prim_sphere(0.2 * s, 0.17 * s, 0.2 * s, 7, 4, y_min=0.0), 'sack', M((x, 0.36, z)), smooth=70)
    mb.add(prim_cyl(0.2, 0.2, 0.1, 10), 'rope', M((0.55, 0.38, 0.45)), smooth=30)
    # estandarte esfarrapado de time pendurado na popa da cesta
    sw = [(-0.55, 0.0), (0.55, 0.0), (0.55, -1.2), (0.32, -0.9), (0.0, -1.3), (-0.32, -0.9), (-0.55, -1.15)]
    verts, faces = prim_extrude(sw, 0.03, axis='z')
    verts = [(x, y, z + 0.06 * math.sin(y * 7.0 + x * 3)) for (x, y, z) in verts]
    mb.add((verts, faces), 'team', M((0, 0.92, -hw - 0.07)), smooth=40)
    mb.add(prim_cyl(0.03, 0.03, 1.25, 5, base=False), 'bone', M((0, 0.95, -hw - 0.08), (0, 0, 90)))
    # suporte da hélice de popa: duas vigas e eixo
    for sx in (-1, 1):
        beam(mb, (sx * 0.45, 0.62, -0.85), (sx * 0.07, 0.5, -1.2), 0.08, 0.08, 'wood_dark', bevel=0.01)
    mb.add(prim_cyl(0.05, 0.05, 0.36, 6, base=False), 'iron', M((0, 0.5, -1.1), (90, 0, 0)))
    # vigia: tronco, braços apoiados na borda e lenço de time (a cabeça é o nó `Head`)
    sh = [ring_h(0.0, 0.2, 0.15, 10), ring_h(0.18, 0.26, 0.17, 10), ring_h(0.34, 0.27, 0.17, 10), ring_h(0.42, 0.14, 0.1, 10)]
    mb.add(prim_rings(sh), 'leather', M((0, 0.4, 0.5)), smooth=60)
    mb.add(prim_rings([ring_h(0.38, 0.17, 0.13, 10), ring_h(0.45, 0.2, 0.16, 10), ring_h(0.52, 0.12, 0.1, 10)]), 'team',
           M((0, 0.4, 0.51)), smooth=60)
    for sx in (-1, 1):
        tube(mb, [(sx * 0.27, 1.1, 0.52), (sx * 0.34, 1.04, 0.76), (sx * 0.22, 1.02, 0.95)], [0.07, 0.065, 0.06], 'skin', n=6, smooth=55)
        mb.add(prim_sphere(0.065, 0.055, 0.065, 6, 3), 'skin', M((sx * 0.22, 1.02, 0.97)), smooth=70)
        mb.add(prim_box(0.14, 0.06, 0.1), 'iron', M((sx * 0.27, 1.14, 0.52)), bevel=0.01)  # ombreira
    return mb.build(mats, parent=root, location=(0, 0, 0))


def build_head(mats, torso):
    mb = MeshBuilder('Head')
    # cabeça de orc: pele verde lisa; rosto (olhos, sobrancelha, nariz, boca, presas) só na face +Z
    mb.add(prim_sphere(0.19, 0.19, 0.19, 10, 5), 'skin', M((0, 0, 0)), smooth=70)
    mb.add(prim_box(0.34, 0.2, 0.2, taper=(0.9, 0.9)), 'skin', M((0, -0.12, 0.08)), bevel=0.02, smooth=50)  # mandíbula
    mb.add(prim_box(0.34, 0.06, 0.06), 'dark', M((0, 0.05, 0.17), (0, 0, 0)), bevel=0.008)  # sobrancelha
    for sx in (-1, 1):
        mb.add(prim_sphere(0.04, 0.035, 0.03, 6, 3), 'eye', M((sx * 0.08, 0.02, 0.18)), smooth=70)
        mb.add(prim_sphere(0.017, 0.02, 0.02, 5, 3), 'ember', M((sx * 0.08, 0.02, 0.208)), smooth=70)
        mb.add(prim_cone(0.035, 0.22, 5), 'bone', M((sx * 0.11, -0.13, 0.2), (-5, 0, 0)), smooth=40)  # presas
        mb.add(prim_cone(0.05, 0.14, 4), 'skin', M((sx * 0.2, 0.03, -0.02), (0, 0, -sx * 80)), smooth=40)  # orelhas
    mb.add(prim_box(0.08, 0.1, 0.06, taper=(0.8, 0.8)), 'skin', M((0, -0.03, 0.2)), bevel=0.01)  # nariz
    mb.add(prim_box(0.2, 0.03, 0.03), 'dark', M((0, -0.115, 0.2)))  # boca
    # capacete de couro com aba e crista de osso (cobre o topo e a nuca)
    mb.add(prim_sphere(0.205, 0.14, 0.205, 10, 4, y_min=0.0), 'leather_dark', M((0, 0.07, -0.01)), smooth=60)
    mb.add(prim_box(0.06, 0.1, 0.34), 'bone', M((0, 0.25, -0.02)), bevel=0.01)
    mb.add(prim_box(0.44, 0.045, 0.06), 'iron', M((0, 0.1, 0.14)))
    return mb.build(mats, parent=torso, location=HEAD_PIVOT)


def build_rotor(mats, torso):
    mb = MeshBuilder('Rotor')
    # cubo de ferro com ponta de crânio e 4 pás de madeira/osso em cruz (plano XY; eixo em z)
    mb.add(prim_cyl(0.07, 0.07, 0.12, 8, base=False), 'iron', M((0, 0, 0), (90, 0, 0)), smooth=30)
    mb.add(prim_cone(0.06, 0.1, 6), 'bone', M((0, 0, -0.1), (-90, 0, 0)))
    for k in range(4):
        ang = 90 * k
        mat = 'wood_light' if k % 2 == 0 else 'bone'
        mb.add(prim_box(0.14, 0.62, 0.03, taper=(0.55, 1.0), base=True), mat,
               M(r=(0, 0, ang)) @ M((0, 0.07, 0.0), (0, 12, 0)), bevel=0.006)
        mb.add(prim_box(0.15, 0.06, 0.04), 'iron', M(r=(0, 0, ang)) @ M((0, 0.62, 0.0)))
    return mb.build(mats, parent=torso, location=ROTOR_PIVOT)


def main():
    args = C.script_args()
    C.reset_scene()
    mats = C.make_paint_set(PALETTE)
    root = C.make_empty('WarBalloon')
    torso = build_torso(mats, root)
    head = build_head(mats, torso)
    rotor = build_rotor(mats, torso)
    parts = [torso, head, rotor]
    A.finish_air('war_balloon', 'war_balloon.glb', 'war_balloon_atlas', root, parts,
                 {'Torso': 1.0, 'Head': 1.3, 'Rotor': 0.6}, TEAM_DEFAULT, args, game_dist=26.0)
    print('BBOX', bbox_game(root))


if __name__ == '__main__':
    main()
