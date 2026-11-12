"""
build_axethrower_v2.py — Lanceiro-Machado troll v2 (tipo-base `axethrower`, também usado pelo `berserker`): troll de pele azul-esverdeada,
crista laranja e ombreiras de espinhos, gerado a partir do FBX do Tripo.

Mesmo pipeline do Lacaio v2 (build_peon_v2.py) e do Drogath. Entrada: FBX do Tripo (corpo de 6,4 mil faces + machado de 416 faces como
ilha separada + 1 triângulo solto; rig Mixamo de 65 ossos sem ações; textura 1024² reamostrada para 512²; frente em -Y do Blender).
O troll está em T-POSE: os braços são REPOSADOS pelo rig (`hero_common.reposar`) antes de cortar.
Saída:   public/models/axethrower_v2.glb (meshopt + WebP), prévias 512 px em tools/ui-captures/axethrower-v2/.

Uso:
  blender -b --factory-startup --python tools/blender/build_axethrower_v2.py -- [caminho.fbx] [--no-render] [--sem-avaliacao]
                                                                               [--glb=saida.glb] [--previas=pasta]
Rodar sempre via tools/safe-run.sh (ver CLAUDE.md).

Lados: SEM espelho em x. O machado do Tripo está na mão esquerda do Mixamo (+x); no jogo o machado do Arremessador é o `WeaponR`
(filho de ArmR, +x), então os rótulos de osso são TROCADOS (Left* = ArmR/LegR). O gume do machado aponta para dentro (-x) no FBX; o
script gira o machado 180° em torno do cabo (que é um bastão redondo) para o gume ficar para a frente (+Z) com a mão fechada.

Hierarquia ANINHADA (igual ao axethrower.glb antigo e ao Grunt; nomes lidos pelo UnitAnimator e por ModelFactory.rebindUserData):
  Axethrower (raiz, pés em y=0, frente +Z)
  ├─ Torso   pivô no quadril    tronco, ombreiras, cintos, tanga (parte de cima; TeamColor nas faixas azuis)
  │   ├─ Head   pivô no pescoço     cabeça com a crista (só em +Z o rosto)
  │   ├─ ArmL   pivô no ombro       braço esquerdo pendente
  │   └─ ArmR   pivô no ombro       braço direito (empunha o machado)
  │       └─ WeaponR  pivô na empunhadura, repouso x = -45° (como o antigo)   machado inteiro, gume em +Z
  └─ LegL / LegR   pivô na costura da tanga
O antigo modelo tinha DOIS machados (WeaponL/WeaponR); o FBX só tem um: o animador só move o WeaponR e o braço esquerdo apenas mira.
"""
import os
import sys
import math
import colorsys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))

import hero_common as HC  # noqa: E402
from hero_common import log, cor_da_face, rot_eixo  # noqa: E402

NOME = 'axethrower_v2'
RAIZ = 'Axethrower'
PREFIXO = 'axethrower_v2'
ATLAS_NOME = 'axethrower_v2_atlas'
FBX_PADRAO = '/home/rafael/Downloads/axe_troller/tripo_convert_ebd5aa6f-7307-476f-8231-c57ca82ce870.fbx'
OUT_GLB = os.path.join(REPO, 'public', 'models', 'axethrower_v2.glb')
OUT_PREVIAS = os.path.join(REPO, 'tools', 'ui-captures', 'axethrower-v2')

# Sem espelho: ver o docstring (rótulos Left/Right trocados abaixo).
ESPELHAR = False
_rotulo_original = HC.rotulo_osso


def _rotulo_trocado(b):
    r = _rotulo_original(b)
    if r.endswith('L') and r != 'Head':
        return r[:-1] + 'R'
    if r.endswith('R'):
        return r[:-1] + 'L'
    return r


HC.rotulo_osso = _rotulo_trocado

# --- constantes do FBX (metros; x direita, y cima, z frente) ---
ESCALA = 4.0           # ponta da crista (y = 0,687 no FBX) vai a ~2,75: a altura do antigo Arremessador (VISUAL_SCALE.axethrower)
X0 = -0.056            # eixo de simetria (Hips/Spine)
Z0 = 0.0             # centro dos pés em z
PESCOCO_Y = 0.480      # plano cabeça/tronco (abaixo do queixo)
ARM_Y = 0.44           # plano horizontal do ombro: acima fica no Torso (deltoide), abaixo é braço (após o repose)
PERNA_Y = 0.20         # plano da costura da tanga (abaixo da barra)
TOOL_ESCALA = 1.0      # fator uniforme do machado em torno da empunhadura
SUAVIZACAO = 4
ATLAS = 512
DILATACAO_TIME = 2
PROTECAO_TIME = 2
ZOOM_PREVIA = 0.9
TEAM_DEFAULT = '#c9382a'
CABECA = (0.0, 2.2, 0.2)

PECAS = ['Torso', 'Head', 'ArmL', 'ArmR', 'WeaponR', 'LegL', 'LegR']
CORPO = ['Torso', 'Head', 'ArmL', 'ArmR', 'LegL', 'LegR']
CAPAS = PECAS
PAIS = {'Head': 'Torso', 'ArmL': 'Torso', 'ArmR': 'Torso', 'WeaponR': 'ArmR'}
REPOUSO = {'WeaponR': (-45.0, 0.0, 0.0)}
PECAS_TIME = []
REGIOES_LIVRES = ('WeaponR',)
POSES_PREVIA = ('caminhada', 'arremesso_a', 'arremesso_b')

# ---------------------------------------------------------------------------
# Repose dos braços (coordenadas do jogo, antes de qualquer corte; sem espelho)
# ---------------------------------------------------------------------------
HASTE_REPOUSO = np.array([0.475, 0.390, 0.007])  # ponto do cabo do machado no Tripo (a ~0,1 do punho, não dentro dele)
GRIP_REPOUSO = np.array([0.319, 0.384, -0.003])   # eixo do cabo no repouso da mão: dentro do punho fechado (sob a palma, na curva dos dedos)
DESLOC_HASTE = GRIP_REPOUSO - HASTE_REPOUSO
R180 = np.diag([-1.0, 1.0, -1.0])     # 180° em torno do cabo (eixo y): o gume passa de -x para +x (frente, após a mão)
LAMBDA = 20.0     # inclinação da haste para a frente (graus a partir da vertical)


def _rot_min(a, b):
    a = np.asarray(a, float)
    b = np.asarray(b, float)
    a = a / np.linalg.norm(a)
    b = b / np.linalg.norm(b)
    v = np.cross(a, b)
    s = np.linalg.norm(v)
    c = float(a @ b)
    if s < 1e-9:
        return np.eye(3) if c > 0 else rot_eixo(np.cross(a, [0, 1, 0]), 180.0)
    return rot_eixo(v, float(np.degrees(np.arctan2(s, c))))


def _unit(v):
    v = np.asarray(v, float)
    return v / np.linalg.norm(v)


def resolver_pose():
    """Rotações ABSOLUTAS dos ossos (T-pose -> braços pendentes).
    Lado do Mixamo `Left` (+x, segura a picareta): braço pendente, antebraço para a frente, mão com a haste vertical e inclinada
    LAMBDA graus para a frente. Lado `Right` (-x): braço pendente, antebraço levemente dobrado."""
    pose = {}
    # --- esquerdo (ferramenta) ---
    u0 = _unit([0.112, -0.039, -0.011])
    f0 = _unit([0.070, -0.015, 0.011])
    u1 = _unit([0.30, -0.93, 0.20])
    Ra = _rot_min(u0, u1)
    f1 = _unit([0.12, -0.35, 0.93])
    Rf = _rot_min(Ra @ f0, f1) @ Ra
    # mão: eixo da mão (x do repouso, f0) -> f1; haste (y) -> d (vertical inclinada para a frente)
    lam = math.radians(LAMBDA)
    d = np.array([0.0, math.cos(lam), math.sin(lam)])
    xt = f0
    yt = np.array([0.0, 1.0, 0.0])
    yt = _unit(yt - (yt @ xt) * xt)
    zt = np.cross(xt, yt)
    xn = f1
    yn = _unit(d - (d @ xn) * xn)
    zn = np.cross(xn, yn)
    # PUNHO FECHADO: o cabo (eixo y do repouso no Tripo, que atravessava a palma aberta) passa a correr ao longo da linha dos nós dos
    # dedos (z do repouso da mão); a palma fica voltada para dentro e os dedos dobram em torno do cabo.
    ztn = _unit(np.array([0.0, 0.0, 1.0]) - xt[2] * xt)
    ytn = np.cross(ztn, xt)
    xnn = xn
    znn = _unit(d - (d @ xnn) * xnn)
    ynn = np.cross(znn, xnn)
    Rh = np.stack([xnn, ynn, znn], axis=1) @ np.stack([xt, ytn, ztn], axis=1).T
    global RFIX
    RFIX = np.stack([xt, ztn, -ytn], axis=1) @ np.stack([xt, yt, zt], axis=1).T   # leva o cabo do Tripo (y) para a linha dos nós (z)
    pose.update(HC.pose_dedos(Rh, xt, ztn))
    pose['LeftArm'] = Ra
    pose['LeftForeArm'] = Rf
    pose['LeftHand'] = Rh
    # --- direito (livre) ---
    u0r = _unit([-0.109, -0.039, 0.0])
    f0r = _unit([-0.104, -0.024, 0.014])
    u1r = _unit([-0.22, -0.96, 0.15])
    Rar = _rot_min(u0r, u1r)
    f1r = _unit([-0.08, -0.86, 0.50])
    Rfr = _rot_min(Rar @ f0r, f1r) @ Rar
    pose['RightArm'] = Rar
    pose['RightForeArm'] = Rfr
    return pose


RFIX = np.eye(3)
POSE = resolver_pose()
ARMA_NO = 'WeaponR'     # nó cuja origem é a empunhadura (prévias de close-up da mão)
ESTADO = {}


def hsv(c):
    h, s, v = colorsys.rgb_to_hsv(float(c[0]), float(c[1]), float(c[2]))
    return h * 360.0, s, v


def eh_couro(c):
    """Couro/pano marrom (bandoleira, cinto, tanga): matiz laranja-amarronzado e saturado."""
    h, s, v = hsv(c)
    return 8 <= h <= 36 and s > 0.36 and v > 0.2


def avaliar_fonte_extra(f):
    lo, hi = f.co.min(axis=0), f.co.max(axis=0)
    log('--- AVALIAÇÃO: escala, eixo, origem ---')
    log('  bbox (x, y-cima, z) após o repose: x [%.3f, %.3f] y [%.4f, %.4f] z [%.3f, %.3f]' %
        (lo[0], hi[0], lo[1], hi[1], lo[2], hi[2]))
    for b in ('Hips', 'Head', 'LeftArm', 'LeftHand', 'RightArm', 'RightHand'):
        log('  osso %-10s repouso %s  pose %s' % (b, np.round(f.pos_ossos[b], 3), np.round(f.pos_pose[b], 3)))


def _ilhas(f):
    n = len(f.ls)
    tri = np.array([f.loop_v[f.ls[i]:f.ls[i] + 3] for i in range(n)])
    pai = list(range(len(f.co)))

    def achar(x):
        while pai[x] != x:
            pai[x] = pai[pai[x]]
            x = pai[x]
        return x
    for t in tri:
        a = achar(t[0])
        for x in t[1:]:
            r = achar(x)
            if r != a:
                pai[r] = a
    grupos = {}
    for i, t in enumerate(tri):
        grupos.setdefault(achar(t[0]), []).append(i)
    return tri, sorted(grupos.values(), key=len)


def ajustar_fonte(ctx):
    """A picareta (menor ilha) vira corpo RÍGIDO preso à mão: posições = matriz de deformação do osso LeftHand x repouso (os pesos de
    pele do Tripo foram feitos para a haste vertical em T-pose)."""
    f = ctx.f
    tri, grupos = _ilhas(f)
    pick = [g for g in grupos if 5 <= len(g) < 1500][0]
    ESTADO['pick'] = set(pick)
    D = f.deformacao['LeftHand']
    Rn = D[:3, :3]
    vs = sorted({int(v) for i in pick for v in tri[i]})
    f.co = f.co.copy()
    f.cn = f.cn.copy()
    pr = ((f.co_rest[vs] + DESLOC_HASTE - GRIP_REPOUSO) @ R180.T) @ RFIX.T + GRIP_REPOUSO   # desloca para o punho e gira 180° no cabo
    f.co[vs] = pr @ Rn.T + D[:3, 3]
    for i in pick:
        l0 = f.ls[i]
        f.cn[l0:l0 + 3] = ((f.cn_rest[l0:l0 + 3] @ R180.T) @ RFIX.T) @ Rn.T
    ESTADO['grip'] = Rn @ GRIP_REPOUSO + D[:3, 3]
    ESTADO['haste_dir'] = Rn @ RFIX @ np.array([0.0, 1.0, 0.0])
    ESTADO['pequenas'] = {i for g in grupos if len(g) < 5 for i in g}
    log('picareta: %d faces, %d vértices, rígida no osso LeftHand; empunhadura (jogo, antes da escala) %s; haste aponta %s' %
        (len(pick), len(vs), np.round(ESTADO['grip'], 3), np.round(ESTADO['haste_dir'], 3)))


def classificar(sopa, S):
    """Ilha maior = corpo (cortes planos); ilha média = machado (WeaponR); ilhas de < 5 faces (triângulo solto) são descartadas."""
    comps = {}
    for f in range(len(sopa.fv)):
        comps.setdefault(sopa.comp[f], []).append(f)
    destino = {}
    for c, idx in comps.items():
        if len(idx) < 5:
            destino[c] = 'corpo'
            for f in idx:
                sopa.vivo[f] = False
        elif len(idx) < 1500:
            destino[c] = 'WeaponR'
        else:
            destino[c] = 'corpo'
    info = {}
    for c, idx in comps.items():
        vs = sorted({v for f in idx for v in sopa.fv[f]})
        P = np.array([sopa.P[v] for v in vs])
        info[c] = dict(faces=len(idx), lo=P.min(axis=0), hi=P.max(axis=0))
    return destino, info


def cortes(S):
    """Planos horizontais: pescoço, ombros e costura da tanga."""
    return [(1, PESCOCO_Y * S, None), (1, ARM_Y * S, None), (1, PERNA_Y * S, None)]


def regras(ctx, f, c, nome):
    S = ctx.S
    yf = c[1] / S
    if yf < PERNA_Y:
        return 'LegR' if c[0] > 0 else 'LegL'
    if nome in ('LegL', 'LegR'):
        nome = 'Torso'                       # a barra da tanga cola as pernas: fica no Torso
    if yf >= PESCOCO_Y - 1e-6 and nome in ('Torso', 'Head'):
        return 'Head'
    if nome == 'Head':
        return 'Torso'
    if nome in ('ArmL', 'ArmR') and yf >= ARM_Y:
        return 'Torso'
    return nome


def eh_azul(c):
    """Faixas/tanga azul-marinho do troll."""
    h, sat, v = hsv(c)
    return 200 <= h <= 255 and sat > 0.30 and v > 0.18


def eh_time(ctx, peca, i):
    if peca in ('WeaponR', 'Head'):
        return False
    return all(eh_azul(c) for c in HC.cores_de_uv(ctx.pixels, ctx.dados[peca]['UV'][i]))


def cor_time(rgb, peca):
    return peca not in ('WeaponR', 'Head') and eh_azul(rgb)


def finalizar(ctx):
    """Pivôs, machado nivelado ao repouso do nó (-45° em x) e vértices em coordenadas locais. Devolve {peça: pivô}."""
    S, f, dados = ctx.S, ctx.f, ctx.dados

    def T(p):
        return np.array([(p[0] - X0) * S, p[1] * S, (p[2] - Z0) * S])
    hip = T(f.pos_pose['Hips'])
    piv = {'Torso': np.array([0.0, round(float(hip[1]), 3), 0.0])}
    n = T(f.pos_pose['Neck'])
    piv['Head'] = np.array([0.0, round(float(PESCOCO_Y * S - 0.02), 3), round(float(n[2]), 3)])
    for p in ('ArmL', 'ArmR'):
        V = dados[p]['V']
        no_plano = V[np.abs(V[:, 1] - ARM_Y * S) < 1e-3]
        piv[p] = np.round([no_plano[:, 0].mean(), ARM_Y * S, no_plano[:, 2].mean()], 3)
        log('ombro %s: %d vértices no plano do corte, pivô %s' % (p, len(no_plano), piv[p]))
    for p in ('LegL', 'LegR'):
        cos = [t for t in dados[p]['tampas'] if abs(t['centro'][1] - PERNA_Y * S) < 0.03]
        t = max(cos or dados[p]['tampas'], key=lambda t: t['n_arestas'])
        piv[p] = np.round(t['centro'], 3)
        log('costura da tanga %s: %d tampas, pivô %s' % (p, len(dados[p]['tampas']), piv[p]))
    G = T(ESTADO['grip'])
    rx = rot_eixo((1, 0, 0), 45.0)       # geometria girada +45° em x em torno da empunhadura: o nó em repouso (-45°) a devolve à pose do punho
    W = dados['WeaponR']
    W['V'] = ((W['V'] - G) * TOOL_ESCALA) @ rx.T + G
    W['N'] = [[rx @ nv for nv in nn] for nn in W['N']]
    piv['WeaponR'] = np.round(G, 3)
    log('machado (WeaponR): empunhadura', piv['WeaponR'])
    for p in PECAS:
        dados[p]['V'] = dados[p]['V'] - piv[p]
    ctx.piv = piv
    return piv


def poses():
    """Poses do UnitAnimator para o tipo `axethrower` (rad): repouso = WeaponR a -45° em x; arremesso = applyAxethrowerFight."""
    wr = math.radians(-45.0)
    sw = 0.55
    return {
        'repouso': {'WeaponR': (wr, 0, 0)},
        'caminhada': {'LegL': (0.65, 0, 0), 'LegR': (-0.65, 0, 0), 'ArmL': (-sw, 0, -0.05), 'ArmR': (sw, 0, 0.05),
                      'Torso': (0.05, 0.08, 0.0), 'WeaponR': (wr, 0, 0)},
        'arremesso_a': {'Torso': (-0.18, 0.45, 0), 'Head': (0, -0.35, 0), 'ArmR': (-1.85, 0, 0.35), 'ArmL': (0.75, 0, -0.25),
                        'WeaponR': (-0.78 - 0.5, 0, 0)},
        'arremesso_b': {'Torso': (0.27, -0.4, 0), 'Head': (0, 0.1, 0), 'ArmR': (1.4, 0, -0.1), 'ArmL': (-0.5, 0, 0),
                        'WeaponR': (1.52, 0, 0)},
    }


def main():
    HC.executar(sys.modules[__name__])


if __name__ == '__main__':
    main()
