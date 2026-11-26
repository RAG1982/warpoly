"""
pose_gryphon_voo.py — pose de VOO do Cavaleiro Grifo v2 (gryphon_rider_v2.glb).

O FBX do Tripo trazia o grifo parado no chão: as quatro patas verticais, como se pisassem o solo. As patas fazem parte da malha do
`Torso` (não têm osso próprio), então a pose é cozida na geometria: cada pata é dobrada em torno de um pivô, com o ângulo
crescendo de cima para baixo (coxa/antebraço primeiro, pé depois):
  - patas dianteiras (águia, z > -0,1): recolhidas para trás, sob o peito, com as garras viradas para trás;
  - patas traseiras (leão, z < -0,55): estendidas para trás, como um felino em salto.
Idempotente por construção: parte sempre do .glb estático guardado em tools/blender/base/ (o resultado vai para public/models/).

Uso:
  tools/safe-run.sh -- blender -b --factory-startup --python tools/blender/pose_gryphon_voo.py -- [--src x.glb] [--out y.glb]
Convenção do jogo: x direita, y cima, z frente (Blender: y_blender = -z_jogo, z_blender = y_jogo).
"""
import os
import sys
import math

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))

import bpy  # noqa: E402
import common as C  # noqa: E402

SRC = os.path.join(HERE, 'base', 'gryphon_rider_v2_estatico.glb')
GLB = os.path.join(REPO, 'public', 'models', 'gryphon_rider_v2.glb')

# (zona em z do jogo, pivô y, [(y de início, y de fim, graus)...]); o ângulo de cada estágio entra suavemente entre y_início e y_fim
PERNAS = {
    'dianteiras': dict(z=(-0.10, 9.0), y_max=0.62, pivo_y=0.58, pivo_z=0.30, estagios=[(0.62, 0.50, -15.0), (0.46, 0.28, -40.0)]),
    'traseiras': dict(z=(-9.0, -0.55), y_max=0.62, pivo_y=0.60, pivo_z=-0.90, estagios=[(0.62, 0.50, 30.0), (0.46, 0.28, 30.0)]),
}


def suave(a, b, y):
    """0 em y >= a, 1 em y <= b (a > b), com ease."""
    t = np.clip((a - y) / (a - b), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def deformar(torso):
    me = torso.data
    assert all(abs(torso.matrix_world[i][j] - (1.0 if i == j else 0.0)) < 1e-4 for i in range(4) for j in range(4)), 'Torso com transformação'
    co = np.empty(len(me.vertices) * 3, dtype=np.float32)
    me.vertices.foreach_get('co', co)
    co = co.reshape(-1, 3)
    x, y, z = co[:, 0].copy(), co[:, 2].copy(), -co[:, 1].copy()       # espaço do jogo
    for nome, cfg in PERNAS.items():
        z0, z1 = cfg['z']
        sel = (z >= z0) & (z <= z1) & (y <= cfg['y_max'])
        ang = np.zeros_like(y)
        for (a, b, deg) in cfg['estagios']:
            ang += np.radians(deg) * suave(a, b, y)
        ang = np.where(sel, ang, 0.0)
        py = cfg['pivo_y']
        zp = cfg['pivo_z']                                               # eixo x que passa por (py, zp)
        dy, dz = y - py, z - zp
        c, s = np.cos(ang), np.sin(ang)
        # rotação do vetor (dy, dz) em torno do pivô; o pé (dy < 0) vai para trás (z-)
        nz = zp + dz * c + dy * s
        ny = py + dy * c - dz * s
        y = np.where(sel, ny, y)
        z = np.where(sel, nz, z)
        print(f'{nome}: {int(sel.sum())} vértices, ângulo máx {math.degrees(ang.max()):.0f}°')
    out = np.stack([x, -z, y], axis=1).astype(np.float32)
    me.vertices.foreach_set('co', out.reshape(-1))
    me.update()


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []

    def flag(name, default=None):
        return argv[argv.index(name) + 1] if name in argv else default
    src = flag('--src', SRC)
    out = flag('--out', GLB)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=src)
    torso = bpy.data.objects['Torso']
    deformar(torso)
    raiz = bpy.data.objects['GryphonRider']
    C.export_glb(raiz, out)
    print('gravado', out)


main()
