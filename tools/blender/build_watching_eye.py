"""
build_watching_eye.py — Olho Vigia orc (tipo interno `watching_eye`) gerado 100% por script.

Uso:
  blender -b --factory-startup --python tools/blender/build_watching_eye.py -- [--no-render]

Saída (public/models/watching_eye.glb), coordenadas do jogo, origem no chão, frente = +Z:
  WatchingEye (raiz)
  └─ Torso                  nó vazio no centro do globo (0; 2,4; 0): o `UnitAnimator` balança/respira o conjunto por aqui
     ├─ Body                globo ocular violeta com veias, pálpebra/sobrancelha, espinhos de osso e íris dourada
     │                      com pupila em fenda NA FRENTE (+Z); nada de "rosto" nas outras faces
     ├─ Fin                 barbatana de cor de time no topo do globo (TeamColor)
     └─ Anim_Tentacle0..5   pivôs (nós vazios) na raiz de cada tentáculo, em volta da metade de baixo/trás do globo;
        └─ TentacleN        a malha do tentáculo, em coordenadas locais do pivô: girar o pivô articula o tentáculo
                            (o `UnitAnimator` ondula `rotation.x/z` de cada `Anim_Tentacle*`, defasado por índice)
"""
import os
import sys
import math

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
import common as C  # noqa: E402
from common import (MeshBuilder, M, prim_box, prim_rings, prim_cone, prim_sphere,  # noqa: E402
                    prim_extrude, limb_rings)
from bld_common import bbox_game  # noqa: E402

TEAM_DEFAULT = '#7c3aed'
EY = 2.4          # altura do centro do globo
R = 0.62          # raio do globo

PALETTE = {
    'flesh': dict(base='#7c3aed', var='#4c1d95', var_scale=4.0, var_amt=0.8, fine=0.1, top=0.35, edge='#c4a8ff',
                  edge_amt=0.4, edge_r=0.03, ao=(0.3, 0.6), coord='object'),
    'flesh_dark': dict(base='#4a2488', var='#2d1259', var_scale=5.0, var_amt=0.8, fine=0.1, top=0.25, ao=(0.3, 0.6),
                       coord='object'),
    'sclera': dict(base='#a578f0', var='#d0609f', var_scale=9.0, var_amt=0.5, fine=0.12, top=0.3, ao=(0.3, 0.55),
                   coord='object'),
    'iris': dict(base='#ffc93a', var='#ff9a1a', var_scale=14.0, var_amt=0.9, emit_boost=1.15, top=0.2),
    'pupil': dict(base='#0a0612', var='#0a0612'),
    'glint': dict(base='#fffbe0', var='#fffbe0', emit_boost=1.3),
    'horn': dict(base='#e6dcc0', var='#b3a47c', var_scale=6.0, fine=0.08, top=0.3, edge='#fff8e0', edge_amt=0.4,
                 edge_r=0.02, ao=(0.25, 0.55)),
    'gold': dict(base='#e4aa2c', var='#b98524', var_scale=4.0, fine=0.06, top=0.35, edge='#fff0b8', edge_amt=0.9,
                 edge_r=0.02, ao=(0.3, 0.5)),
    'sucker': dict(base='#d874b8', var='#a8408a', var_scale=8.0, fine=0.1, top=0.3, ao=(0.2, 0.5)),
    'team': dict(base='#bab2a6', var='#a0988c', var_scale=2.0, fine=0.08, top=0.2, edge='#dcd6cc', edge_amt=0.3,
                 edge_r=0.03, ao=(0.5, 0.6), team=True),
}


def build_body(mats, parent):
    mb = MeshBuilder('Body')
    P = M()  # a malha fica em coordenadas locais do `Torso` (centro do globo)
    # globo ocular: esclera lilás com veias, calota de carne roxa atrás (nuca)
    mb.add(prim_sphere(R, R * 0.98, R, 14, 8), 'sclera', P, smooth=80)
    # córnea/íris dourada saliente voltada para +Z, com anel de ouro, pupila em fenda e brilho
    mb.add(prim_sphere(0.34, 0.34, 0.15, 14, 5), 'iris', P @ M((0, 0.0, R - 0.1)), smooth=80)
    mb.add(prim_rings([[(0.36 * math.cos(a * math.pi / 8), 0.36 * math.sin(a * math.pi / 8), R - 0.1) for a in range(16)],
                       [(0.40 * math.cos(a * math.pi / 8), 0.40 * math.sin(a * math.pi / 8), R - 0.15) for a in range(16)]],
                      cap0=False, cap1=False), 'gold', P, smooth=0)
    mb.add(prim_sphere(0.075, 0.24, 0.07, 8, 5), 'pupil', P @ M((0, 0.0, R + 0.03)), smooth=80)
    mb.add(prim_sphere(0.045, 0.045, 0.02, 6, 3), 'glint', P @ M((0.12, 0.14, R + 0.05)), smooth=80)
    # pálpebras pesadas e sobrancelha franzida (apenas na frente)
    for sx in (-1, 1):
        mb.add(prim_box(0.40, 0.11, 0.20, taper=(0.9, 0.8)), 'flesh_dark',
               P @ M((sx * 0.22, 0.38, 0.40), (-8, sx * -14, sx * -22)), bevel=0.0, smooth=40)
    mb.add(prim_box(0.62, 0.09, 0.2, taper=(0.9, 0.8)), 'flesh_dark', P @ M((0, -0.40, 0.40), (10, 0, 0)), smooth=40)
    # espinhos de osso em coroa na parte de trás e dos lados
    for k in range(8):
        a = math.radians(k * 45 + 22)
        d = (math.sin(a), math.cos(a) * 0.3 + 0.35, -abs(math.cos(a)) * 0.8 - 0.05)
        ln = math.sqrt(sum(v * v for v in d))
        d = tuple(v / ln for v in d)
        pos = tuple(v * (R * 0.92) for v in d)
        # cone orientado ao longo de d
        from mathutils import Vector
        q = Vector((0, 1, 0)).rotation_difference(Vector(d)).to_euler('XYZ')
        mb.add(prim_cone(0.075, 0.34, 5, base=True), 'horn',
               P @ M(pos, (math.degrees(q.x), math.degrees(q.y), math.degrees(q.z))), smooth=40)
    # coroa de ouro (anel de cravos) em volta da íris, sutil
    for k in range(6):
        a = math.radians(k * 60)
        mb.add(prim_sphere(0.028, 0.028, 0.028, 5, 3), 'gold',
               P @ M((0.43 * math.cos(a), 0.43 * math.sin(a), R - 0.22)), smooth=60)
    return mb.build(mats, parent=parent)


# Seis tentáculos pendurados em volta da metade de baixo/trás do globo (o centro da frente fica livre para a íris e a
# sobrancelha). (ângulo em graus a partir de +Z em torno de Y, comprimento relativo, enrolamento da ponta)
TENTACLES = [(72, 0.95, 1), (112, 1.1, -1), (152, 1.25, 1), (208, 1.2, -1), (248, 1.05, 1), (288, 0.9, -1)]


def cubic(p0, p1, p2, p3, steps):
    out = []
    for i in range(steps + 1):
        t = i / steps
        u = 1 - t
        out.append(tuple(u ** 3 * p0[j] + 3 * u * u * t * p1[j] + 3 * u * t * t * p2[j] + t ** 3 * p3[j] for j in range(3)))
    return out


def build_tentacle(mats, torso, idx, ang, ln, curl):
    """Pivô `Anim_Tentacle<idx>` (nó vazio no ponto de fixação, sob o globo) + malha `Tentacle<idx>` em coordenadas locais
    do pivô: curva em S que desce, abre para fora e enrola a ponta. Coordenadas relativas ao centro do globo."""
    a = math.radians(ang)
    sx, sz = math.sin(a), math.cos(a)
    p0 = (0.40 * sx, -0.40, 0.40 * sz)
    p1 = (0.62 * sx, -0.40 - 0.50 * ln, 0.62 * sz - 0.05)
    p2 = (0.92 * sx - 0.12 * curl * sz, -0.40 - 1.05 * ln, 0.92 * sz + 0.12 * curl * sx - 0.12)
    p3 = (0.62 * sx - 0.30 * curl * sz, -0.40 - 1.32 * ln, 0.62 * sz + 0.30 * curl * sx - 0.22)
    pts = [tuple(c - o for c, o in zip(q, p0)) for q in cubic(p0, p1, p2, p3, 7)]  # relativos ao pivô
    pivot = C.make_empty(f'Anim_Tentacle{idx}', p0, parent=torso)
    mb = MeshBuilder(f'Tentacle{idx}')
    radii = [0.15, 0.14, 0.125, 0.105, 0.085, 0.063, 0.04, 0.014]
    # up = +Z: o tentáculo pende na vertical e, com up = +Y, o anel torceria quando a curva troca de lado
    mb.add(prim_rings(limb_rings(pts, radii, 7, up=(0, 0, 1))), 'flesh', smooth=75)
    # ventosas rosadas na face externa (visíveis de fora)
    for t in (2, 4, 5):
        px, py, pz = pts[t]
        r = radii[t] * 0.9
        mb.add(prim_sphere(0.034, 0.034, 0.03, 5, 3), 'sucker', M((px + sx * r, py, pz + sz * r)), smooth=60)
    return mb.build(mats, parent=pivot)


def build_fin(mats, parent):
    mb = MeshBuilder('Fin')
    pts = [(-0.30, 0.0), (0.30, 0.0), (0.2, 0.42), (0.0, 0.62), (-0.2, 0.42)]
    verts, faces = prim_extrude(pts, 0.04, axis='x')
    mb.add((verts, faces), 'team', M((0, R - 0.08, -0.12), (-24, 0, 0)), smooth=30)
    return mb.build(mats, parent=parent)


def main():
    args = C.script_args()
    C.reset_scene()
    mats = C.make_paint_set(PALETTE)
    root = C.make_empty('WatchingEye')
    torso = C.make_empty('Torso', (0, EY, 0), parent=root)
    body = build_body(mats, torso)
    tents = [build_tentacle(mats, torso, i, *t) for i, t in enumerate(TENTACLES)]
    fin = build_fin(mats, torso)
    parts = [body] + tents + [fin]
    bpy.context.view_layer.update()
    C.uv_atlas(parts, weights={'Body': 2.0, 'Fin': 0.6}, margin=0.006)
    img = C.bake_atlas(parts, 'watching_eye_atlas', 512, samples=int(os.environ.get('BAKE_SAMPLES', 32)), margin=4,
                       ground=False)
    C.finalize_materials(parts, img, team_default=TEAM_DEFAULT,
                         out_png=os.path.join(C.BUILD_DIR, 'watching_eye_atlas.png'))
    out = os.path.join(C.OUT_MODELS, 'watching_eye.glb')
    C.export_glb(root, out)
    print('STATS watching_eye', C.stats(root, out))
    print('BBOX', bbox_game(root))
    if '--no-render' not in args:
        rig = C.RenderRig(root, 'watching_eye', res=int(os.environ.get('RENDER_RES', 800)), samples=24)
        rig.render('34', (1.0, 0.45, 1.0), 30)
        rig.render('front', (0.0, 0.1, 1.0), 30)
        rig.render('back', (-0.6, 0.3, -1.0), 30)
        rig.render('side', (1.0, 0.1, 0.0), 30)
        rig.render('game', (45, 44, 45), 24, dist=78 / 1.62)
        C.set_team_color('#2f63e0')
        rig.render('34_azul', (1.0, 0.45, 1.0), 30)
        C.set_team_color(TEAM_DEFAULT)
        # pose articulada (revisão dos pivôs, fora do repositório): cada Anim_Tentacle gira em x e z como no UnitAnimator
        scratch = os.environ.get('EYE_DEBUG_DIR')
        if scratch:
            C.RENDERS = scratch
            os.makedirs(scratch, exist_ok=True)
            for i, o in enumerate(c for c in torso.children if c.name.startswith('Anim_Tentacle')):
                C.set_rot_game(o, (26 * math.sin(i * 0.9), 0, 23 * math.cos(i * 1.3)))
            rig.render('pose_34', (1.0, 0.45, 1.0), 30)
            rig.render('pose_back', (-0.6, 0.3, -1.0), 30)


if __name__ == '__main__':
    main()
