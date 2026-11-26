"""
build_peon_v2.py — Peão orc v2 (tipo-base `peon`): trabalhador orc gerado a partir do FBX do Tripo.

Só constantes e ganchos do Peão; todo o resto vive em tools/blender/hero_common.py (mesmo pipeline do Aldeão v2 e dos heróis).

Entrada: FBX do Tripo (corpo de 6,6 mil faces + picareta de 218 faces como ilha separada; rig Mixamo de 65 ossos sem ações;
         textura 1024² em JPEG; frente em -Y do Blender). O orc está em T-POSE: os braços são REPOSADOS pelo rig
         (`hero_common.reposar`) antes de cortar: o braço esquerdo do Mixamo (+x, o lado que já segura a picareta) fica pendente com o
         antebraço dobrado para a frente e a picareta de pé na mão; o direito fica pendente, com o antebraço levemente dobrado.
Saída:   public/models/peon_v2.glb (meshopt + WebP), prévias 512 px em tools/ui-captures/peon-v2/.

Uso:
  blender -b --factory-startup --python tools/blender/build_peon_v2.py -- [caminho.fbx] [--no-render] [--sem-avaliacao]
                                                                          [--glb=saida.glb] [--previas=pasta]
Rodar sempre via tools/safe-run.sh (ver CLAUDE.md).

Lados: SEM espelho em x (a picareta do Tripo está na mão esquerda do Mixamo, em +x). Para o jogo, a ferramenta vai em ArmR (+x, como
no Aldeão v2), então os rótulos de osso são TROCADOS: ossos Left* = ArmR/LegR, Right* = ArmL/LegL.

Hierarquia (tipo-base `peon`, plana como a do villager_v2; a picareta é FILHA de ArmR porque a mão a empunha):
  Peon (raiz, pés em y=0, frente +Z, origem entre os pés)
  ├─ Torso   pivô na cintura   tronco, manto/bandoleira (TeamColor), cinto, tanga (parte de cima)
  ├─ Head    pivô no pescoço   cabeça (rosto só em +Z)
  ├─ ArmL / ArmR   pivô no ombro (cortado em y = ARM_Y)   braço, bracelete e punho (ArmR segura a picareta)
  │   └─ ToolGroup (filho de ArmR)  pivô na empunhadura   haste e cabeça da picareta (sempre visível)
  ├─ LegL / LegR   pivô na costura da tanga   perna, bota
  └─ Pack  pivô atrás do dorso  (oculta no jogo)  PackFrame + WoodBundle (lenha) + GoldSack (saco de ouro/pedra)
A picareta NÃO se chama `Pickaxe`/`Axe`/`Hammer` para o `setVillagerTool` do inspetor não escondê-la (mesmo gesto para madeira,
ouro e pedra).
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
import build_villager_v2 as V2  # noqa: E402  (Pack/mochila e poses de trabalho)

NOME = 'peon_v2'
RAIZ = 'Peon'
PREFIXO = 'peon_v2'
ATLAS_NOME = 'peon_v2_atlas'
FBX_PADRAO = '/home/rafael/Downloads/peao_orc/tripo_convert_5b38ca52-60ab-4206-9da6-27ecbe9db96e.fbx'
OUT_GLB = os.path.join(REPO, 'public', 'models', 'peon_v2.glb')
OUT_PREVIAS = os.path.join(REPO, 'tools', 'ui-captures', 'peon-v2')

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
ESCALA = 4.2           # topo da cabeça (y = 0,544 no FBX) vai a ~2,285: a altura visual do antigo Lacaio (VISUAL_SCALE.peon = 0,8516)
X0 = -0.08             # eixo de simetria (Hips/Spine)
Z0 = 0.005             # centro dos pés em z
PESCOCO_Y = 0.462      # plano cabeça/tronco (abaixo do queixo)
ARM_Y = 0.43           # plano horizontal do ombro: acima fica no Torso (deltoide), abaixo é braço (após o repose)
PERNA_Y = 0.20         # plano da costura da tanga (abaixo da barra)
TOOL_ESCALA = 0.9      # fator uniforme da picareta em torno da empunhadura
SUAVIZACAO = 4
ATLAS = 512
DILATACAO_TIME = 2
PROTECAO_TIME = 2
ZOOM_PREVIA = 0.9
TEAM_DEFAULT = '#b0482c'
CABECA = (0.0, 1.95, 0.5)

PECAS = ['Torso', 'Head', 'ArmL', 'ArmR', 'LegL', 'LegR', 'ToolGroup']
CORPO = ['Torso', 'Head', 'ArmL', 'ArmR', 'LegL', 'LegR']
CAPAS = PECAS
PAIS = {'ToolGroup': 'ArmR'}
PECAS_TIME = []
REGIOES_LIVRES = ('ToolGroup',)
POSES_PREVIA = ('caminhada', 'golpe', 'coleta_a', 'coleta_b', 'carregar')
poses = V2.poses


def materiais_extra(ctx, objs):
    """Mochila de carga na ALTURA DAS COSTAS do Lacaio (corcunda, tronco alto): o Aldeão a põe em y = 1,0; aqui o dorso fica mais alto."""
    V2.materiais_extra(ctx, objs, pack_y=PACK_Y, banda=(PACK_Y - 0.25, PACK_Y + 0.25), escala=PACK_ESCALA, armacao_esp=0.08, armacao_y=0.0)


# ---------------------------------------------------------------------------
# Repose dos braços (coordenadas do jogo, antes de qualquer corte; sem espelho)
# ---------------------------------------------------------------------------
HAND0_MID = np.array([0.293, 0.347, -0.002])      # RightHandMiddle1... (LeftHandMiddle1 no FBX): centro da palma esquerda
HASTE_REPOUSO = np.array([0.367, 0.347, -0.030])  # ponto da haste da picareta no Tripo (ao lado do punho, não dentro dele)
GRIP_REPOUSO = np.array([0.281, 0.325, -0.002])   # eixo do cabo no repouso da mão: dentro do punho fechado (sob a palma, na curva dos dedos)
DESLOC_HASTE = GRIP_REPOUSO - HASTE_REPOUSO
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
    u0 = _unit([0.098, -0.055, -0.016])
    f0 = _unit([0.084, -0.04, 0.021])
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
    u0r = _unit([-0.101, -0.055, -0.016])
    f0r = _unit([-0.083, -0.047, 0.021])
    u1r = _unit([-0.22, -0.96, 0.15])
    Rar = _rot_min(u0r, u1r)
    f1r = _unit([-0.08, -0.86, 0.50])
    Rfr = _rot_min(Rar @ f0r, f1r) @ Rar
    pose['RightArm'] = Rar
    pose['RightForeArm'] = Rfr
    return pose


RFIX = np.eye(3)
POSE = resolver_pose()
PACK_Y = 1.85          # altura da mochila (costas, entre a cintura e os ombros); o Aldeão usa 1,0
PACK_ESCALA = 1.15
ARMA_NO = 'ToolGroup'     # nó cuja origem é a empunhadura (prévias de close-up da mão)
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
    pick = grupos[0]
    ESTADO['pick'] = set(pick)
    D = f.deformacao['LeftHand']
    Rn = D[:3, :3]
    vs = sorted({int(v) for i in pick for v in tri[i]})
    f.co = f.co.copy()
    f.cn = f.cn.copy()
    f.co[vs] = ((f.co_rest[vs] + DESLOC_HASTE - GRIP_REPOUSO) @ RFIX.T + GRIP_REPOUSO) @ Rn.T + D[:3, 3]
    for i in pick:
        l0 = f.ls[i]
        f.cn[l0:l0 + 3] = (f.cn_rest[l0:l0 + 3] @ RFIX.T) @ Rn.T
    ESTADO['grip'] = Rn @ GRIP_REPOUSO + D[:3, 3]
    ESTADO['haste_dir'] = Rn @ RFIX @ np.array([0.0, 1.0, 0.0])
    log('picareta: %d faces, %d vértices, rígida no osso LeftHand; empunhadura (jogo, antes da escala) %s; haste aponta %s' %
        (len(pick), len(vs), np.round(ESTADO['grip'], 3), np.round(ESTADO['haste_dir'], 3)))


def classificar(sopa, S):
    """Ilha maior = corpo (cortes planos); menor = picareta (ToolGroup)."""
    comps = {}
    for f in range(len(sopa.fv)):
        comps.setdefault(sopa.comp[f], []).append(f)
    ordem = sorted(comps, key=lambda c: len(comps[c]))
    destino = {c: 'corpo' for c in comps}
    destino[ordem[0]] = 'ToolGroup'
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


def eh_time(ctx, peca, i):
    if peca == 'ToolGroup':
        return False
    if peca in ('Head', 'ArmL', 'ArmR'):
        return False
    return all(eh_couro(c) for c in HC.cores_de_uv(ctx.pixels, ctx.dados[peca]['UV'][i]))


def cor_time(rgb, peca):
    return peca not in ('ToolGroup', 'Head', 'ArmL', 'ArmR') and eh_couro(rgb)


def finalizar(ctx):
    """Pivôs e vértices em coordenadas locais. Devolve {peça: pivô}."""
    S, f, dados = ctx.S, ctx.f, ctx.dados

    def T(p):
        return np.array([(p[0] - X0) * S, p[1] * S, (p[2] - Z0) * S])
    piv = {'Torso': np.array([0.0, round(float(0.30 * S), 3), 0.0])}
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
    piv['ToolGroup'] = np.round(T(ESTADO['grip']), 3)
    log('empunhadura da picareta (ToolGroup) em', piv['ToolGroup'])
    for p in PECAS:
        dados[p]['V'] = dados[p]['V'] - piv[p]
    dados['ToolGroup']['V'] = dados['ToolGroup']['V'] * TOOL_ESCALA
    log('picareta escalada x%.2f em torno da empunhadura' % TOOL_ESCALA)
    ctx.piv = piv
    return piv


def main():
    HC.executar(sys.modules[__name__])


if __name__ == '__main__':
    main()
