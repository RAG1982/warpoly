"""
build_hero_oren.py — Mestre Arcano Oren (hero_oren): mago humano gerado a partir do FBX do Tripo (M2-21).

Só constantes e ganchos do Oren; todo o resto vive em tools/blender/hero_common.py.

Entrada: FBX do Tripo (1 malha de 18,5 mil triângulos, UMA ilha só — cajado e mochila soldados —, rig Mixamo de 65 ossos sem
         ações, T-pose, textura 1024²; frente em -Y do Blender).
Saída:   public/models/hero_oren.glb (meshopt + WebP), prévias 512 px em tools/ui-captures/hero-oren/.

Uso:
  blender -b --factory-startup --python tools/blender/build_hero_oren.py -- [caminho.fbx] [--no-render] [--sem-avaliacao]
                                                                          [--glb=saida.glb] [--previas=pasta]
Rodar sempre via tools/safe-run.sh (ver CLAUDE.md).

Hierarquia (tipo-base `mage` do UnitAnimator: Weapon é FILHO de ArmR e o animador contra-gira x/z para o cajado ficar em
pé; Crystal pulsa no 'cast'):
  Mage (raiz, pés em y=0, frente +Z, origem entre os pés)
  ├─ Torso   pivô (0, 1.05, 0)   robe inteiro (saia até a barra), cinto, bolsas, rolos de mapas, gola e metade interna dos ombros
  ├─ Head    pivô no pescoço     capuz pontudo e rosto (só em +Z)
  ├─ ArmL / ArmR   pivô no ombro (±OMBRO_X*S)   manga + mão (ArmR segura o cajado, no lado +x)
  │   └─ Weapon  pivô na empunhadura   haste e garras de madeira do cajado
  │       └─ Crystal  pivô no centro do cristal ciano
  └─ LegL / LegR   pivô na costura da bota   só as botas (a saia longa cola as pernas e fica no Torso)
O FBX está em T-pose: os braços são REPOSADOS pelo rig (hero_common.reposar) antes de cortar: braços em A; o antebraço direito
dobra para a frente com a mão em guinada de 90° (o punho continua em torno do cajado vertical).
TeamColor: o pano azul-petróleo (faces cuja cor da textura é teal) vira cinza no atlas e multiplica a cor do time.
"""
import os
import sys
import colorsys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))

import hero_common as HC  # noqa: E402
from hero_common import log, cor_da_face, rot_eixo  # noqa: E402

NOME = 'hero_oren'
RAIZ = 'Mage'
PREFIXO = 'oren'
ATLAS_NOME = 'hero_oren_atlas'
FBX_PADRAO = ('/home/rafael/Downloads/Oren/tripo_convert_b335f53a-4a7e-4545-b7a6-58475793eb90.fbx')
OUT_GLB = os.path.join(REPO, 'public', 'models', 'hero_oren.glb')
OUT_PREVIAS = os.path.join(REPO, 'tools', 'ui-captures', 'hero-oren')

# --- constantes do FBX (metros; x direita do mundo, y cima, z frente; antes do espelho em x) ---
TOPO = 2.15            # altura final (ponta do capuz)
X0 = -0.029            # eixo de simetria (quadris)
Z0 = 0.033             # centro dos pés em z
ANGULO_BRACO = 50.0    # abdução do braço (graus abaixo da horizontal da T-pose)
OMBRO_X = 0.0875       # |x - X0| do ombro (cabeça do osso Arm): plano de corte do braço
PESCOCO_Y = 0.728      # plano horizontal cabeça/tronco (abaixo do queixo, acima da gola): emenda limpa e plana
OMBRO_Y = 0.56         # acima disso (no FBX) o plano x = ±OMBRO_X separa braço e tronco
BOTA_Y = 0.10          # botas: faces abaixo desta altura (FBX) com peso de pé ou couro escuro
BASTAO_X = -0.342      # cajado: x do FBX (T-pose) à esquerda deste valor, fora da faixa do punho
PUNHO_Y = (0.545, 0.665)
SUAVIZACAO = 5
ATLAS = 512
DILATACAO_TIME = 2         # atlas denso: o pano azul-petróleo e o acabamento claro dividem as ilhas UV
PROTECAO_TIME = 2
ZOOM_PREVIA = 0.85
TEAM_DEFAULT = '#2e5e63'   # azul-petróleo do robe (multiplica o cinza do atlas)
CABECA = (0.0, 1.72, 0.0)

PECAS = ['Torso', 'Head', 'ArmL', 'ArmR', 'LegL', 'LegR', 'Weapon', 'Crystal']
CORPO = ['Torso', 'Head', 'ArmL', 'ArmR', 'LegL', 'LegR']     # rótulos vindos dos pesos de pele
CAPAS = PECAS                                                 # todas têm costuras (tampas)
PAIS = {'Weapon': 'ArmR', 'Crystal': 'Weapon'}
PECAS_TIME = []
REGIOES_LIVRES = ('Weapon',)                                  # a haste é dividida pelo punho: duas regiões
POSES_PREVIA = ('caminhada', 'magia')

# repose por rig (rotações absolutas em coordenadas do jogo; o resto herda do pai)
POSE = {
    'RightArm': rot_eixo((0, 0, 1), ANGULO_BRACO),
    'RightForeArm': rot_eixo((0, 1, 0), 90.0),
    'RightHand': rot_eixo((0, 1, 0), 90.0),
    'LeftArm': rot_eixo((0, 0, 1), -ANGULO_BRACO),
}


def hsv(c):
    h, s, v = colorsys.rgb_to_hsv(float(c[0]), float(c[1]), float(c[2]))
    return h * 360.0, s, v


def eh_cristal(c):
    h, s, v = hsv(c)
    return 150 <= h <= 200 and s > 0.6 and v > 0.85


def eh_madeira(c):
    h, s, v = hsv(c)
    return 30 <= h <= 60 and 0.2 <= s <= 0.55 and v > 0.6


def eh_couro_escuro(c):
    h, s, v = hsv(c)
    return 10 <= h <= 40 and v < 0.33


def eh_teal(c):
    h, s, v = hsv(c)
    return 165 <= h <= 215 and s > 0.3 and v < 0.7


def avaliar_fonte_extra(f):
    lo, hi = f.co.min(axis=0), f.co.max(axis=0)
    log('--- AVALIAÇÃO: escala, eixo, origem ---')
    log('  bbox (x, y-cima, z) do FBX já reposado: x [%.3f, %.3f] y [%.4f, %.4f] z [%.3f, %.3f]' %
        (lo[0], hi[0], lo[1], hi[1], lo[2], hi[2]))
    for b in ('Hips', 'Head', 'LeftArm', 'RightArm', 'RightForeArm', 'RightHand'):
        log('  osso %-13s repouso %s  reposado %s' % (b, np.round(f.pos_ossos[b], 3), np.round(f.pos_pose[b], 3)))


def ajustar_fonte(ctx):
    """Pesos dos ossos do pé por vértice (botas) e posições de repouso (T-pose) para achar o cajado."""
    f = ctx.f
    idx = [i for i, b in enumerate(f.ossos) if b in ('LeftFoot', 'RightFoot', 'LeftToeBase', 'RightToeBase')]
    ctx.pe = f.W[:, idx].sum(axis=1)


def classificar(sopa, S):
    """Uma ilha só: tudo é 'corpo' (o cajado e as botas saem por regras de rótulo)."""
    vs = sorted({v for fv in sopa.fv for v in fv})
    P = np.array([sopa.P[v] for v in vs])
    return {0: 'corpo'}, {0: dict(faces=len(sopa.fv), lo=P.min(axis=0), hi=P.max(axis=0))}


def cortes(S):
    """Plano do pescoço (y = PESCOCO_Y) e planos verticais dos ombros (x = ±OMBRO_X, perpendiculares ao eixo de giro do braço),
    estes só acima de OMBRO_Y - 0,06."""
    return [(1, PESCOCO_Y * S, None), (0, OMBRO_X * S, (OMBRO_Y - 0.06) * S), (0, -OMBRO_X * S, (OMBRO_Y - 0.06) * S)]


def regras(ctx, f, c, nome):
    sopa, S = ctx.sopa, ctx.S
    vs = [v for v in sopa.fv[f] if v < sopa.n_orig]
    cor = cor_da_face(sopa, ctx.pixels, f)
    if len(vs) >= 2:
        r = ctx.f.co_rest[vs].mean(axis=0)               # posição de repouso (T-pose, FBX)
        if r[0] < BASTAO_X and (r[1] > PUNHO_Y[1] or r[1] < PUNHO_Y[0]):
            if eh_cristal(cor):
                return 'Crystal'
            if eh_madeira(cor):
                return 'Weapon'
        if r[1] < BOTA_Y and (ctx.pe[vs].mean() > 0.5 or eh_couro_escuro(cor)):
            return 'LegR' if c[0] > 0 else 'LegL'
    if nome in ('LegL', 'LegR'):
        nome = 'Torso'                                    # a saia longa cola as pernas: fica no Torso
    yf = c[1] / S
    dxf = abs(c[0]) / S
    if yf >= PESCOCO_Y - 1e-6 and nome in ('Torso', 'Head'):
        return 'Head'
    if nome == 'Head':
        return 'Torso'                                    # pano do capuz que desce até os ombros
    if nome in ('Torso', 'ArmL', 'ArmR') and yf >= OMBRO_Y:
        nome = ('ArmR' if c[0] > 0 else 'ArmL') if dxf >= OMBRO_X else 'Torso'
    return nome


def eh_time(ctx, peca, i):
    if peca in ('Weapon', 'Crystal'):
        return False
    # só a face INTEIRA em pano: faces de borda (a pintura do acabamento claro atravessa a malha) ficam com a cor original
    return all(eh_teal(c) for c in HC.cores_de_uv(ctx.pixels, ctx.dados[peca]['UV'][i]))


def cor_time(rgb, peca):
    return peca not in ('Weapon', 'Crystal') and eh_teal(rgb)


def finalizar(ctx):
    """Pivôs, cajado nivelado (haste em pé) e vértices em coordenadas locais. Devolve {peça: pivô}."""
    S, f, dados = ctx.S, ctx.f, ctx.dados

    def T(p):
        return np.array([-(p[0] - X0) * S, p[1] * S, (p[2] - Z0) * S])
    px = OMBRO_X * S
    piv = {'Torso': np.array([0.0, 1.05, 0.0])}
    h = T(f.pos_pose['Head'])
    piv['Head'] = np.array([0.0, round(float(h[1]), 2), round(float(h[2]), 2)])
    # ombros: pivô no centro da seção cortada pelo plano x = ±px (a seção gira dentro de si mesma: sem fresta nos giros em torno de x)
    for p, sinal in (('ArmL', -1.0), ('ArmR', 1.0)):
        ombro = [t for t in dados[p]['tampas'] if abs(t['centro'][0] - sinal * px) < 0.02]
        c = max(ombro, key=lambda t: t['n_arestas'])['centro']
        piv[p] = np.array([sinal * round(px, 3), round(float(c[1]), 3), round(float(c[2]), 3)])
        log('ombro %s: seção de %d arestas, pivô %s (osso: %s)' % (p, max(ombro, key=lambda t: t['n_arestas'])['n_arestas'], piv[p],
                                                          np.round(T(f.pos_pose['RightArm' if sinal > 0 else 'LeftArm']), 3)))
    for p in ('LegL', 'LegR'):
        tampas = sorted(dados[p]['tampas'], key=lambda t: -t['n_arestas'])
        piv[p] = np.round(tampas[0]['centro'], 3)
        log('costura da bota %s: %d tampas, pivô %s' % (p, len(tampas), piv[p]))
    # cajado: eixo da haste (mínimos quadrados dos vértices abaixo do punho), empunhadura à altura da mão reposada
    V = dados['Weapon']['V']
    y_g = float(T(f.pos_pose['RightHand'])[1])
    baixo = V[V[:, 1] < y_g - 0.15]
    ax = np.polyfit(baixo[:, 1], baixo[:, 0], 1)
    az = np.polyfit(baixo[:, 1], baixo[:, 2], 1)
    G = np.array([np.polyval(ax, y_g), y_g, np.polyval(az, y_g)])
    d = np.array([ax[0], 1.0, az[0]])
    d /= np.linalg.norm(d)
    eixo = np.cross(d, [0.0, 1.0, 0.0])
    ang = float(np.degrees(np.arccos(np.clip(d[1], -1, 1))))
    R = rot_eixo(eixo, ang) if np.linalg.norm(eixo) > 1e-9 else np.eye(3)
    log('cajado: inclinação da haste %.2f° (nivelada), empunhadura em %s' % (ang, np.round(G, 3)))
    for p in ('Weapon', 'Crystal'):
        dados[p]['V'] = (dados[p]['V'] - G) @ R.T + G
        dados[p]['N'] = [[R @ n for n in nn] for nn in dados[p]['N']]
    piv['Weapon'] = np.round(G, 3)
    piv['Crystal'] = np.round(dados['Crystal']['V'].mean(axis=0), 3)
    for p in PECAS:
        dados[p]['V'] = dados[p]['V'] - piv[p]
    return piv


def poses():
    """Poses do UnitAnimator para o tipo `mage` (o Weapon contra-gira x e z do ArmR para o cajado ficar em pé)."""
    sw = 0.55
    return {
        'repouso': {},
        'caminhada': {'LegL': (0.65, 0, 0), 'LegR': (-0.65, 0, 0), 'ArmL': (-sw, 0, -0.05), 'ArmR': (sw, 0, 0.05),
                      'Torso': (0.05, 0.08, 0.0), 'Weapon': (-sw, 0, -0.05)},
        'golpe': {},
        'magia': {'ArmL': (-2.3, 0, -0.25), 'ArmR': (-2.3, 0, 0.25), 'Torso': (-0.12, 0, 0), 'Head': (-0.25, 0, 0),
                  'Weapon': (2.3, 0, -0.25)},
    }


def previa_extra(ctx, rig, objs):
    """Conferência de emendas: a pose de magia (braços a -2,3 rad) e a de caminhada vistas de frente e de costas."""
    import bpy
    import common as C
    todas = poses()
    for nome in ('magia', 'caminhada'):
        for p in PECAS:
            HC.rot_three(C, objs[p], 0, 0, 0)
        for p, (rx, ry, rz) in todas[nome].items():
            HC.rot_three(C, objs[p], rx, ry, rz)
        rig.render('pose_%s_frente' % nome, (0.0, 0.25, 1.0), 30, zoom=0.7)
        rig.render('pose_%s_costas' % nome, (0.0, 0.25, -1.0), 30, zoom=0.7)
    for p in PECAS:
        HC.rot_three(C, objs[p], 0, 0, 0)
    # costura pescoço/ombros: cabeça em close com as peças coloridas (frente e lado)
    from mathutils import Vector
    antes = HC.colorir_pecas(objs)
    centro = rig.center.copy()
    rig.center = Vector((0.0, 0.0, 1.62))
    rig.render('cabeca_pecas_f', (0.0, 0.1, 1.0), 20, dist=2.4)
    rig.render('cabeca_pecas_l', (1.0, 0.1, 0.3), 20, dist=2.4)
    HC.restaurar_materiais(objs, antes)
    rig.scene.render.resolution_x = rig.scene.render.resolution_y = 900
    rig.center = Vector((0.0, 0.0, 1.62))
    rig.render('cabeca_lado', (1.0, 0.1, 0.3), 14, dist=1.9)
    rig.render('cabeca_frente', (0.0, 0.1, 1.0), 14, dist=1.9)
    rig.scene.render.resolution_x = rig.scene.render.resolution_y = 512
    rig.center = centro


def main():
    HC.executar(sys.modules[__name__])


if __name__ == '__main__':
    main()
