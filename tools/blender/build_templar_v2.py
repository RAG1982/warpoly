"""
build_templar_v2.py — Paladino (Templário, tipo-base `cavalier`, chave `templar_v2`) gerado a partir do GLB do TRELLIS/ComfyUI.

Só constantes e ganchos do Paladino; todo o resto vive em tools/blender/hero_common.py (carregador de FBX/GLB, segmentação por
planos e regiões, tampas, atlas, exportação).

Entrada: ~/ai/ComfyUI/output/3d/paladino_00001.glb (1 malha de ~50 mil triângulos, sem rig, 3 texturas 2048² — só a cor base vira o atlas).
         Cavaleiro de placas azul/dourado sobre cavalo de guerra com gualdrapa e borlas; os braços estão em T-pose, as mãos abertas e
         não há arma. A frente do modelo já é +Z (a cabeça do cavalo está em +Z no sistema do jogo).
Saída:   public/models/templar_v2.glb (meshopt + WebP), prévias 512 px em tools/ui-captures/templar-v2/.

Uso:
  blender -b --factory-startup --python tools/blender/build_templar_v2.py -- [caminho.glb] [--no-render] [--sem-avaliacao]
                                                                            [--glb=saida.glb] [--previas=pasta]
Rodar sempre via tools/safe-run.sh (ver CLAUDE.md).

Hierarquia (tipo-base `cavalier` do UnitAnimator; Torso, Head, ArmL e ArmR ANINHADOS para a cintura levar o ombro junto):
  Templar (raiz, pés em y=0, frente +Z, origem entre as quatro patas)
  ├─ Horse          corpo, garupa, gualdrapa, borlas, arreios e as pernas do cavaleiro abaixo da cintura (estático)
  ├─ HorseLegFL/FR/BL/BR   pivô no corte logo abaixo da gualdrapa
  ├─ HorseHead      pescoço, crina e cabeça do cavalo (pivô na base do pescoço)
  ├─ HorseTail      cauda (pivô na raiz)
  └─ Torso          pivô na cintura   peito, ombreiras, tabardo
      ├─ Head       elmo (pivô no pescoço)
      │   └─ Plume  pluma azul (TeamColor)
      ├─ Cape       capa que cai pelas costas até a garupa (TeamColor)
      ├─ ArmL       braço + punho fechado (repouso: braço reposado da T-pose, baked na malha)
      └─ ArmR       braço + punho fechado
          └─ Sword  espada longa (pivô na empunhadura; repouso x 0,5 rad / z -0,1 rad, como o UnitAnimator)
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
from hero_common import log, rot_eixo  # noqa: E402

NOME = 'templar_v2'
RAIZ = 'Templar'
PREFIXO = 'templar_v2'
ATLAS_NOME = 'templar_v2_atlas'
FBX_PADRAO = os.path.expanduser('~/ai/ComfyUI/output/3d/paladino_00001.glb')
OUT_GLB = os.path.join(REPO, 'public', 'models', 'templar_v2.glb')
OUT_PREVIAS = os.path.join(REPO, 'tools', 'ui-captures', 'templar-v2')

DECIMAR = 0.62         # 50 mil -> ~38 mil triângulos (o corte e o atlas trabalham em Python)
SH = 0.4703            # desloca y para os cascos ficarem em y = 0 (o GLB vai de y = -0,4703 a 0,5009)

# --- constantes do GLB, JÁ deslocadas (y = 0 no chão; frente +Z; metros do GLB; sem espelho) ---
ESCALA = 3.3           # comprimento do cavalo 0,77 -> 2,55 m; altura com pluma 0,97 -> 3,2 m (cavalier 2,9; templar antigo 3,06)
X0 = 0.0
Z0 = -0.086            # centro das quatro patas em z (frente 0,09..0,165; trás -0,376..-0,223)
ESPELHAR = False
YL = -0.29 + SH        # plano das patas: abaixo da gualdrapa e das borlas
YW = 0.12 + SH         # plano da cintura do cavaleiro (acima do saiote de placas)
YN = 0.335 + SH        # plano do pescoço do cavaleiro (abaixo do elmo)
XA = 0.175             # |x| do plano do ombro (depois da ombreira)
XW = 0.285             # |x| do plano do pulso (a mão aberta fica além; é trocada por um punho fechado)
SUAVIZACAO = 0
ATLAS = 512
DILATACAO_TIME = 2
PROTECAO_TIME = 2
ZOOM_PREVIA = 0.8
TEAM_DEFAULT = '#1f4ac8'
CABECA = (0.0, 2.75, 0.0)         # centro da cabeça do cavaleiro no jogo (prévia do rosto)
SWORD_REST = (0.5, 0.0, -0.1)     # rad; o UnitAnimator força x = 0,5 e z = -0,1 no Sword

PECAS = ['Horse', 'HorseLegFL', 'HorseLegFR', 'HorseLegBL', 'HorseLegBR', 'HorseHead', 'HorseTail',
         'Torso', 'Head', 'Plume', 'Cape', 'ArmL', 'ArmR', 'Sword', 'HandL', 'HandR']
CORPO = PECAS
CAPAS = [p for p in PECAS if p not in ('Cape', 'Plume')]   # (Sword: sem faces de malha; entra para receber o UV liso das faces geradas)
PAIS = {'Head': 'Torso', 'Plume': 'Head', 'Cape': 'Torso', 'ArmL': 'Torso', 'ArmR': 'Torso', 'Sword': 'ArmR'}
PECAS_TIME = []
REGIOES_LIVRES = tuple(PECAS)
REPOUSO = {'Sword': tuple(float(np.degrees(a)) for a in SWORD_REST)}
POSES_PREVIA = ('caminhada', 'golpe', 'magia')

PROLONGAMENTOS = {
    'Head': ('neck', 0.035, 0.85),
    'ArmL': ('top', 0.012, 0.8), 'ArmR': ('top', 0.012, 0.8),
    'HorseLegFL': ('only', 0.05, 0.8), 'HorseLegFR': ('only', 0.05, 0.8),
    'HorseLegBL': ('only', 0.05, 0.8), 'HorseLegBR': ('only', 0.05, 0.8),
    'HorseHead': ('only', 0.05, 0.85),
    'Torso': ('waist', 0.04, 0.9),
}

ESTADO = {}


# ---------------------------------------------------------------------------
# Cores da textura (HSV em graus)
# ---------------------------------------------------------------------------
def hsv(c):
    h, s, v = colorsys.rgb_to_hsv(float(c[0]), float(c[1]), float(c[2]))
    return h * 360.0, s, v


def eh_azul(c):
    h, s, v = hsv(c)
    return 190 <= h <= 245 and s > 0.40 and v > 0.18


def eh_ouro(c):
    h, s, v = hsv(c)
    return 25 <= h <= 55 and s > 0.30 and v > 0.45


def pano_numa_face(ctx, peca, i):
    cores = HC.cores_de_uv(ctx.pixels, ctx.dados[peca]['UV'][i])
    return sum(1 for c in cores if eh_azul(c)) >= 8


def eh_time(ctx, peca, i):
    return peca in ('Plume', 'Cape', 'Torso', 'Horse') and pano_numa_face(ctx, peca, i)


def cor_time(rgb, peca):
    return peca in ('Plume', 'Cape', 'Torso', 'Horse') and eh_azul(rgb)


# ---------------------------------------------------------------------------
# Fonte: desloca o chão para y = 0 e rotula as regiões que não são cortadas por planos (capa, pluma, cauda)
# ---------------------------------------------------------------------------
def ajustar_fonte(ctx):
    f = ctx.f
    f.co = f.co + np.array([0.0, SH, 0.0])
    f.co_rest = f.co
    preparar_rotulos(ctx)


def preparar_rotulos(ctx):
    """1 = Cape (pano azul/dourado atrás do cavaleiro), 2 = Plume (pano azul acima do elmo), 3 = HorseTail (crina escura da garupa)."""
    f = ctx.f
    n = len(f.ls)
    if not (f.lt == 3).all():
        raise RuntimeError('malha não é 100 %% triangular (%d faces não-triângulo)' % int((f.lt != 3).sum()))
    tri = f.loop_v[f.ls[:, None] + np.arange(3)]
    C = f.co[tri].mean(axis=1)
    uv = f.uv[f.ls[:, None] + np.arange(3)].mean(axis=1)
    h, w, _ = f.pixels.shape
    cor = f.pixels[np.clip((uv[:, 1] * h).astype(int), 0, h - 1), np.clip((uv[:, 0] * w).astype(int), 0, w - 1)]
    hh = np.array([hsv(c) for c in cor])
    H, S, V = hh[:, 0], hh[:, 1], hh[:, 2]
    x, y, z = C[:, 0], C[:, 1], C[:, 2]
    azul = (H > 190) & (H < 245) & (S > 0.40)
    ouro = (H > 25) & (H < 55) & (S > 0.30) & (V > 0.45)
    # pluma: o azul acima do elmo
    pluma = azul & (y > 0.385 + SH)
    # capa: azul/dourado atrás do cavaleiro (z < -0,105) e acima da gualdrapa (y > 0,04)
    zona_capa = (z < -0.105) & (y > 0.04 + SH) & (np.abs(x) < 0.24) & (y < 0.34 + SH) & ~pluma
    semente = azul & zona_capa
    capa = semente.copy()
    # o friso dourado da capa: faces douradas da zona que tocam a capa (2 passos, por vértice compartilhado)
    for _ in range(2):
        vc = np.zeros(len(f.co), dtype=bool)
        vc[tri[capa].ravel()] = True
        toca = vc[tri].any(axis=1)
        capa |= ouro & zona_capa & toca
    # a ombreira dourada e o gorjal ficam no Torso: a capa começa abaixo do plano do pescoço e atrás da ombreira
    capa &= ~((y > 0.30 + SH) & (np.abs(x) > 0.10))
    # cauda: pelo escuro (V baixo) atrás da garupa, entre as patas traseiras
    escuro = (V < 0.30) & (H > 5) & (H < 45)
    cauda = escuro & (z < -0.33) & (np.abs(x) < 0.085) & (y > -0.33 + SH) & (y < 0.07 + SH)
    cod = np.zeros(n, dtype=np.int64)
    cod[capa] = 1
    cod[pluma] = 2
    cod[cauda & ~capa] = 3
    ESTADO['cod'] = cod
    log('rótulos por região: capa %d, pluma %d, cauda %d faces de %d' % (capa.sum(), pluma.sum(), (cod == 3).sum(), n))


def classificar(sopa, S):
    cod = ESTADO['cod']
    for fi in range(len(cod)):
        sopa.comp[fi] = int(cod[fi])
    info = {}
    for c in (0, 1, 2, 3):
        idx = [fi for fi in range(len(sopa.fv)) if sopa.comp[fi] == c]
        if not idx:
            info[c] = dict(faces=0, lo=np.zeros(3), hi=np.zeros(3))
            continue
        vs = sorted({v for fi in idx for v in sopa.fv[fi]})
        P = np.array([sopa.P[v] for v in vs])
        info[c] = dict(faces=len(idx), lo=P.min(axis=0), hi=P.max(axis=0))
    return {0: 'corpo', 1: 'Cape', 2: 'Plume', 3: 'HorseTail'}, info


# ---------------------------------------------------------------------------
# Cortes planos e regras por posição (centroides escalados -> GLB deslocado: x = c0/S + X0, y = c1/S, z = c2/S + Z0)
# ---------------------------------------------------------------------------
def u(c, S):
    return c[0] / S + X0, c[1] / S, c[2] / S + Z0


# plano oblíquo da base do pescoço do cavalo (normal no plano y-z: aponta para a frente e para cima), em coordenadas do GLB:
# passa pela cernelha (z 0,06; y 0,17) e pelo peito (z 0,22; y -0,10)
PESC_N = np.array([0.0, 0.51, 0.86])


def zona_pernas(c, S):
    x, y, z = u(c, S)
    return y < YL + 0.03 and abs(x) < 0.20 and (0.02 < z < 0.26 or -0.46 < z < -0.15)


def zona_pescoco_cavalo(c, S):
    x, y, z = u(c, S)
    return abs(x) < 0.16 and z > 0.0 and y > SH - 0.4703 + 0.0 and (z > 0.05 or y < YW + 0.0)


def zona_pescoco_cav(c, S):
    x, y, z = u(c, S)
    return abs(x) < 0.075 and -0.20 < z < 0.04 and YN - 0.03 < y < YN + 0.03


def zona_ombro(c, S):
    x, y, z = u(c, S)
    return XA - 0.03 < abs(x) < XA + 0.03 and -0.17 < z < 0.02 and 0.19 + SH < y < 0.34 + SH


def zona_pulso(c, S):
    x, y, z = u(c, S)
    return XW - 0.03 < abs(x) < XW + 0.03 and -0.17 < z < 0.02 and 0.19 + SH < y < 0.34 + SH


def zona_cintura(c, S):
    x, y, z = u(c, S)
    return abs(x) < 0.2 and -0.19 < z < 0.04 and YW - 0.03 < y < YW + 0.03


def cortes(S):
    # corta TODAS as faces de cada zona (pernas: abaixo do plano; arco do pescoço do cavalo: plano oblíquo na zona)
    return [
        (1, YL * S, None, lambda c: zona_pernas(c, S)),
        # plano oblíquo do pescoço do cavalo: n . p = k, com p em coordenadas escaladas e deslocadas
        ((PESC_N, S * (0.138 + 0.51 * SH - 0.86 * Z0)), 0.0, None, lambda c: zona_pescoco_cavalo(c, S)),
        (1, YN * S, None, lambda c: zona_pescoco_cav(c, S)),
        (0, XA * S, None, lambda c: zona_ombro(c, S) and c[0] > 0),
        (0, -XA * S, None, lambda c: zona_ombro(c, S) and c[0] < 0),
        (0, XW * S, None, lambda c: zona_pulso(c, S) and c[0] > 0),
        (0, -XW * S, None, lambda c: zona_pulso(c, S) and c[0] < 0),
        (1, YW * S, None, lambda c: zona_cintura(c, S)),
    ]


def regras(ctx, f, c, nome):
    S = ctx.S
    x, y, z = u(c, S)
    # 1. patas: colunas abaixo do plano
    if y < YL and abs(x) < 0.20 and (0.02 < z < 0.26 or -0.46 < z < -0.15):
        return 'HorseLeg' + ('F' if z > -0.07 else 'B') + ('L' if x < 0 else 'R')
    # 2. pescoço + cabeça do cavalo: à frente do plano oblíquo
    if z > 0.0 and (z > 0.05 or y < YW) and PESC_N[1] * (y - SH) + PESC_N[2] * z > 0.138:
        return 'HorseHead'
    # 3. mãos (além do pulso) e braços (entre o ombro e o pulso)
    if abs(x) > XA and 0.19 + SH < y < 0.34 + SH and -0.17 < z < 0.02:
        lado = 'L' if x < 0 else 'R'
        return ('Hand' if abs(x) > XW else 'Arm') + lado
    # 4. elmo (acima do plano do pescoço)
    if y > YN and abs(x) < 0.10 and -0.22 < z < 0.06:
        return 'Head'
    # 5. tronco do cavaleiro acima da cintura
    if y > YW and z < 0.05 and abs(x) < XA + 0.01:
        return 'Torso'
    return 'Horse'


# ---------------------------------------------------------------------------
# Pivôs e prolongamentos
# ---------------------------------------------------------------------------
def _tampa(dados, peca, modo):
    ts = dados[peca]['tampas']
    if not ts:
        raise RuntimeError('%s: sem tampas' % peca)
    if modo == 'only' or modo == 'neck':
        return max(ts, key=lambda t: t['n_arestas'])
    if modo == 'top':
        return min(ts, key=lambda t: abs(t['centro'][0]) + 0.0001 * t['n_arestas'] * 0)
    if modo == 'waist':
        perto = [t for t in ts if abs(t['centro'][1] - YW * ESCALA) < 0.1]
        return max(perto or ts, key=lambda t: t['n_arestas'])
    raise ValueError(modo)


# ---------------------------------------------------------------------------
# Geometria gerada: punhos fechados e espada
# ---------------------------------------------------------------------------
# pose de repouso do braço (baked na malha: o UnitAnimator escreve rotações absolutas no ArmL/ArmR, então o repouso é o zero do nó)
BRACO_U = np.array([0.32, -0.88, 0.36])      # braço: para baixo, um pouco para fora e para a frente (lado direito; o esquerdo espelha x)
BRACO_F = np.array([0.06, -0.30, 0.95])      # antebraço: para a frente, o punho à altura da sela
COTOVELO_X = (0.215, 0.255)                   # |x| do GLB: faixa de mistura entre o braço e o antebraço


def _unit(v):
    v = np.asarray(v, float)
    return v / np.linalg.norm(v)


def _rot_de_para(a, b):
    """Rotação mínima (3x3) que leva o vetor unitário a no vetor unitário b."""
    a, b = _unit(a), _unit(b)
    v = np.cross(a, b)
    c = float(a @ b)
    if np.linalg.norm(v) < 1e-9:
        return np.eye(3) if c > 0 else -np.eye(3)
    K = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]])
    return np.eye(3) + K + K @ K * (1.0 / (1.0 + c))


def _suave(t):
    t = np.clip(t, 0.0, 1.0)
    return t * t * (3 - 2 * t)


def repousar_braco(ctx, peca, pivo, lado):
    """Reposa o braço da T-pose: braço para baixo/frente e antebraço para a frente (mistura suave no cotovelo). Devolve o ponto do
    pulso e a direção do antebraço, no repouso (coordenadas globais escaladas)."""
    S, d = ctx.S, ctx.dados[peca]
    u1 = BRACO_U * np.array([lado, 1, 1])
    f1 = BRACO_F * np.array([lado, 1, 1])
    u0 = np.array([lado, 0.0, 0.0])
    R1 = _rot_de_para(u0, u1)
    R2 = _rot_de_para(u1, f1)
    V = d['V']
    w = _suave((np.abs(V[:, 0] / S + X0) - COTOVELO_X[0]) / (COTOVELO_X[1] - COTOVELO_X[0]))
    cot = pivo + u0 * ((0.235 - XA) * S)
    cot1 = pivo + R1 @ (cot - pivo)
    A = pivo + (V - pivo) @ R1.T
    B = cot1 + (A - cot1) @ R2.T
    d['V'] = (1 - w)[:, None] * A + w[:, None] * B
    R12 = R2 @ R1
    for k in range(len(d['N'])):
        nn = []
        for n in d['N'][k]:
            m = (1 - w[d['F'][k][0]]) * (R1 @ n) + w[d['F'][k][0]] * (R12 @ n)
            nn.append(m / (np.linalg.norm(m) + 1e-12))
        d['N'][k] = nn
    # pulso: o centro do anel de corte do pulso, levado pela mesma deformação
    tw = max(d['tampas'], key=lambda t: abs(t['centro'][0] - pivo[0]))
    c0 = tw['centro']
    A0 = pivo + R1 @ (c0 - pivo)
    B0 = cot1 + R2 @ (A0 - cot1)
    return B0, f1 / np.linalg.norm(f1)


def elipsoide(centro, eixos, raios, n_lat=9, n_lon=14, expo=0.75):
    """Superelipsoide (quase uma caixa arredondada): devolve V, F (triângulos) e normais por vértice."""
    V, N = [], []
    for i in range(n_lat + 1):
        th = math.pi * i / n_lat
        for j in range(n_lon if 0 < i < n_lat else 1):
            ph = 2 * math.pi * j / n_lon
            s = np.array([math.sin(th) * math.cos(ph), math.cos(th), math.sin(th) * math.sin(ph)])
            c = np.sign(s) * np.abs(s) ** expo
            V.append(centro + sum(eixos[k] * raios[k] * c[k] for k in range(3)))
            g = np.sign(s) * np.abs(s) ** (2 - expo)
            nn = sum(eixos[k] * g[k] / raios[k] for k in range(3))
            N.append(nn / (np.linalg.norm(nn) + 1e-12))
    F = []

    def ix(i, j):
        if i == 0:
            return 0
        if i == n_lat:
            return len(V) - 1
        return 1 + (i - 1) * n_lon + (j % n_lon)
    for i in range(n_lat):
        for j in range(n_lon):
            a, b, c, d = ix(i, j), ix(i, j + 1), ix(i + 1, j + 1), ix(i + 1, j)
            if i == 0:
                F.append([a, d, c])
            elif i == n_lat - 1:
                F.append([a, d, b])
            else:
                F.append([a, d, c])
                F.append([a, c, b])
    # orienta cada triângulo para fora (pela normal média dos vértices)
    for f in F:
        p = [V[k] for k in f]
        nf = np.cross(p[1] - p[0], p[2] - p[0])
        if nf @ (N[f[0]] + N[f[1]] + N[f[2]]) < 0:
            f[1], f[2] = f[2], f[1]
    return V, F, N


def caixa(centro, eixos, meios, topo=1.0, base=1.0):
    """Caixa orientada (eixos unitários; `meios` = meias-medidas). `topo`/`base` encolhem as extremidades no eixo 1 (ponta da lâmina)."""
    V, F, N = [], [], []
    quads = []
    for sx in (-1, 1):
        for sy in (-1, 1):
            for sz in (-1, 1):
                esc = topo if sy > 0 else base
                V.append(centro + eixos[0] * meios[0] * sx * esc + eixos[1] * meios[1] * sy + eixos[2] * meios[2] * sz * esc)
    idx = lambda sx, sy, sz: ((sx > 0) * 4 + (sy > 0) * 2 + (sz > 0))
    faces = [((1, 1, 1), (1, 1, -1), (1, -1, -1), (1, -1, 1)), ((-1, 1, 1), (-1, -1, 1), (-1, -1, -1), (-1, 1, -1)),
             ((1, 1, 1), (-1, 1, 1), (-1, 1, -1), (1, 1, -1)), ((1, -1, 1), (1, -1, -1), (-1, -1, -1), (-1, -1, 1)),
             ((1, 1, 1), (1, -1, 1), (-1, -1, 1), (-1, 1, 1)), ((1, 1, -1), (-1, 1, -1), (-1, -1, -1), (1, -1, -1))]
    cc = np.mean(V, axis=0)
    Vo, Fo, No = [], [], []
    for q in faces:
        ids = [idx(*c) for c in q]
        p = [V[k] for k in ids]
        nf = _unit(np.cross(p[1] - p[0], p[2] - p[0]))
        if nf @ (np.mean(p, axis=0) - cc) < 0:
            ids = ids[::-1]
            nf = -nf
        base_i = len(Vo)
        for k in ids:
            Vo.append(V[k])
            No.append(nf)
        Fo.append([base_i, base_i + 1, base_i + 2])
        Fo.append([base_i, base_i + 2, base_i + 3])
    return Vo, Fo, No


def anexar(d, geom, cor, borda):
    """Anexa geometria gerada (V, F, N por vértice) à peça `d` com um UV liso da cor `cor` (tampa falsa: o driver acha o texel)."""
    V, F, N = geom
    base = len(d['V']) if len(d['V']) else 0
    d['V'] = np.array(list(d['V']) + [np.asarray(v) for v in V]) if base else np.array([np.asarray(v) for v in V])
    ids = []
    for f in F:
        d['F'].append([base + k for k in f])
        d['UV'].append([np.zeros(2)] * 3)
        d['N'].append([np.asarray(N[k]) for k in f])
        if 'time' in d:
            d['time'].append(False)
        ids.append(len(d['F']) - 1)
    d['tampas'].append(dict(faces=ids, cor=np.asarray(cor, float), centro=np.mean(V, axis=0), n_arestas=0, leque=False,
                            imperfeitos=0, borda=list(borda), laco_verts=[], time=False))


def faces_por_cor(ctx, pred, quais, maximo=300):
    """Faces ORIGINAIS (índices da sopa) de `quais` cuja cor média na textura satisfaz `pred` (para escolher o texel de cada material)."""
    sopa, f = ctx.sopa, ctx.f
    achadas = []
    for fi in quais:
        c = HC.cor_da_face(sopa, f.pixels, fi)
        if pred(c):
            achadas.append((fi, c))
        if len(achadas) >= maximo:
            break
    cor = np.mean([c for _, c in achadas], axis=0) if achadas else np.array([0.5, 0.5, 0.5])
    return [fi for fi, _ in achadas], cor


def aco_claro(c):
    h, s, v = hsv(c)
    return s < 0.16 and v > 0.55


def aco_cinza(c):
    h, s, v = hsv(c)
    return s < 0.20 and 0.30 < v < 0.75


def construir_punho(ctx, d, pulso, f1, lado, g, borda, cor):
    """Punho fechado em torno da empunhadura (eixo g): bloco dos dedos + polegar + 4 dobras, orientados pelo antebraço f1."""
    S = ctx.S
    a = _unit(f1 - (f1 @ g) * g)                  # do pulso para os nós dos dedos
    n = _unit(np.cross(a, g))                     # profundidade
    c0 = pulso + a * (0.035 * S)
    geoms = []
    # bloco da mão (palma + dedos enrolados): mais alto em g (4 dedos empilhados na empunhadura)
    geoms.append(elipsoide(c0, (a, g, n), (0.030 * S, 0.034 * S, 0.026 * S), expo=0.6))
    # dobras dos dedos: quatro nós salientes na frente do punho
    for k in range(4):
        off = (k - 1.5) * 0.0165 * S
        geoms.append(elipsoide(c0 + a * 0.024 * S + g * off, (a, g, n), (0.012 * S, 0.0085 * S, 0.020 * S), n_lat=6, n_lon=8, expo=0.7))
    # polegar apoiado sobre os dedos (lado de dentro)
    geoms.append(elipsoide(c0 + n * lado * 0.018 * S + a * 0.006 * S + g * 0.012 * S, (a, g, n), (0.020 * S, 0.0095 * S, 0.0095 * S), n_lat=6, n_lon=8, expo=0.8))
    for gm in geoms:
        anexar(d, gm, cor, borda)
    return c0


def construir_espada(ctx, centro):
    """Espada longa em coordenadas locais do nó (pivô na empunhadura; lâmina em +Y, gume em +Z; plano da lâmina normal a x).
    Medidas em metros do GLB (o cavaleiro tem ~0,35 de altura sentado): lâmina de 0,20, guarda de 0,10, empunhadura de 0,055."""
    S = ctx.S
    ex, ey, ez = np.array([1.0, 0, 0]), np.array([0, 1.0, 0]), np.array([0, 0, 1.0])
    o = np.zeros(3)
    k = S
    b0 = 0.030                                            # a lâmina começa acima da guarda
    aco = [caixa(o + ey * (b0 + 0.085) * k, (ex, ey, ez), (0.0050 * k, 0.085 * k, 0.0175 * k)),
           caixa(o + ey * (b0 + 0.170 + 0.025) * k, (ex, ey, ez), (0.0050 * k, 0.025 * k, 0.0175 * k), topo=0.10, base=1.0),
           caixa(o + ey * (b0 + 0.095) * k, (ex, ey, ez), (0.0062 * k, 0.080 * k, 0.0045 * k))]       # friso central
    ouro = [caixa(o + ey * 0.022 * k, (ex, ey, ez), (0.052 * k, 0.0045 * k, 0.009 * k)),
            caixa(o + ex * 0.052 * k + ey * 0.030 * k, (ex, ey, ez), (0.0055 * k, 0.012 * k, 0.009 * k)),
            caixa(o - ex * 0.052 * k + ey * 0.030 * k, (ex, ey, ez), (0.0055 * k, 0.012 * k, 0.009 * k)),
            elipsoide(o - ey * 0.040 * k, (ex, ey, ez), (0.0105 * k, 0.0105 * k, 0.0105 * k), n_lat=7, n_lon=10, expo=0.9)]
    couro = [caixa(o - ey * 0.008 * k, (ex, ey, ez), (0.0062 * k, 0.034 * k, 0.0062 * k))]
    return aco, ouro, couro


def finalizar(ctx):
    S, f, dados = ctx.S, ctx.f, ctx.dados
    for p in PECAS:
        log('%-10s tampas (centro, nº de arestas): %s' % (p, [(np.round(t['centro'], 2).tolist(), t['n_arestas']) for t in dados[p]['tampas']]))
    # prolongamentos (tubos para dentro da peça vizinha) antes de reposar e de tirar os pivôs
    for p, (modo, comp, enc) in PROLONGAMENTOS.items():
        if not dados[p]['tampas']:
            continue
        t = _tampa(dados, p, modo)
        n_f = HC.prolongar_tampa(dados[p], t, comp * S, enc)
        log('prolongamento de %s: tampa em %s (%d arestas), %d faces' % (p, np.round(t['centro'], 3), t['n_arestas'], n_f))
    V = dados['Horse']['V']
    abaixo = V[V[:, 1] < YL * S - 0.02]
    log('Horse: %d vértices abaixo do plano das patas (x %s..%s, z %s..%s)' % (len(abaixo), *(np.round([abaixo[:, 0].min(), abaixo[:, 0].max(), abaixo[:, 2].min(), abaixo[:, 2].max()], 2) if len(abaixo) else ['-'] * 4)))
    piv = {'Horse': np.zeros(3)}
    for p in ('HorseLegFL', 'HorseLegFR', 'HorseLegBL', 'HorseLegBR', 'HorseHead', 'HorseTail'):
        piv[p] = np.round(_tampa(dados, p, 'only')['centro'], 3)
    piv['Head'] = np.round(_tampa(dados, 'Head', 'neck')['centro'], 3)
    for p in ('ArmL', 'ArmR'):
        t = min(dados[p]['tampas'], key=lambda t: abs(t['centro'][0]))      # o ombro é a abertura de menor |x|
        piv[p] = np.round(t['centro'], 3)
    piv['Torso'] = np.round(_tampa(dados, 'Torso', 'waist')['centro'] * np.array([0.0, 1.0, 1.0]), 3)
    piv['Plume'] = np.array([0.0, 0.39 + SH, -0.07 - Z0]) * S
    piv['Cape'] = np.array([0.0, 0.30 + SH, -0.12 - Z0]) * S
    piv['HandL'] = piv['ArmL'].copy()
    piv['HandR'] = piv['ArmR'].copy()
    # materiais dos punhos e da espada (texels lisos da própria textura)
    partes = ctx.partes
    f_mao, cor_mao = faces_por_cor(ctx, aco_cinza, partes['HandR'] + partes['HandL'])
    tudo = [i for i in range(ctx.sopa.n_faces_orig) if ctx.sopa.vivo[i]]
    f_aco, cor_aco = faces_por_cor(ctx, aco_claro, partes['Torso'] + partes['Head'])
    f_ouro, cor_ouro = faces_por_cor(ctx, eh_ouro, partes['Torso'])
    f_couro, cor_couro = faces_por_cor(ctx, lambda c: 15 <= hsv(c)[0] <= 40 and 0.3 < hsv(c)[1] < 0.8 and hsv(c)[2] < 0.5, partes['Horse'])
    log('texels: mão %d, aço %d, ouro %d, couro %d' % (len(f_mao), len(f_aco), len(f_ouro), len(f_couro)))
    # braços: reposo + punhos
    g = np.array(rot_eixo((1, 0, 0), np.degrees(SWORD_REST[0])) @ rot_eixo((0, 0, 1), np.degrees(SWORD_REST[2])) @ np.array([0.0, 1.0, 0.0]))
    centros = {}
    for p, lado in (('ArmL', -1), ('ArmR', 1)):
        pulso, f1 = repousar_braco(ctx, p, piv[p], lado)
        centros[p] = construir_punho(ctx, dados[p], pulso, f1, lado, g, f_mao, cor_mao)
        log('%s: pulso em %s, punho em %s' % (p, np.round(pulso, 3), np.round(centros[p], 3)))
    # espada na mão direita
    sw = dict(V=np.zeros((0, 3)), F=[], UV=[], N=[], tampas=[], n_orig=0, time=[])
    aco, ouro, couro = construir_espada(ctx, centros['ArmR'])
    for gm in aco:
        anexar(sw, gm, cor_aco, f_aco)
    for gm in ouro:
        anexar(sw, gm, cor_ouro, f_ouro)
    for gm in couro:
        anexar(sw, gm, cor_couro, f_couro)
    dados['Sword'] = sw
    piv['Sword'] = centros['ArmR'].copy()
    for p in PECAS:
        if p != 'Sword':
            dados[p]['V'] = dados[p]['V'] - piv[p]
    sw['V'] = sw['V']          # já em coordenadas locais do nó (pivô na empunhadura)
    for p in PECAS:
        log('pivô %-10s %s' % (p, piv[p]))
    return piv


def poses():
    sw = 0.55
    g = 0.7
    sr = SWORD_REST
    return {
        'repouso': {},
        'caminhada': {'HorseLegFL': (g, 0, 0), 'HorseLegBR': (g, 0, 0), 'HorseLegFR': (-g, 0, 0), 'HorseLegBL': (-g, 0, 0),
                      'ArmL': (-sw, 0, -0.05), 'ArmR': (sw, 0, 0.05), 'Torso': (0.05, 0.08, 0.0)},
        'golpe': {'Torso': (0, -0.5, 0), 'ArmR': (-1.15, -0.4, 0.0), 'Head': (0, 0.2, 0)},
        'magia': {'ArmL': (-2.3, 0, -0.25), 'ArmR': (-2.3, 0, 0.25), 'Torso': (-0.12, 0, 0), 'Head': (-0.25, 0, 0)},
    }


def previa_extra(ctx, rig, objs):
    """Conferência de frestas: cintura, ombros, pescoço do cavalo, patas e cauda em repouso e em pose."""
    import common as C
    from mathutils import Vector
    todas = poses()

    def aplicar(nome):
        for p in PECAS:
            HC.rot_three(C, objs[p], 0, 0, 0)
        for p, (rx, ry, rz) in todas['repouso'].items():
            HC.rot_three(C, objs[p], rx, ry, rz)
        if nome:
            for p, (rx, ry, rz) in todas[nome].items():
                HC.rot_three(C, objs[p], rx, ry, rz)
        HC.rot_three(C, objs['Sword'], *SWORD_REST)

    def foco(nome, direcao, alvo, dist, fov=20):
        centro = rig.center.copy()
        rig.center = Vector((alvo[0], -alvo[2], alvo[1]))
        rig.render(nome, direcao, fov, dist=dist)
        rig.center = centro
    for nome in ('caminhada', 'golpe', 'magia', 'galope', 'empina'):
        if nome not in todas:
            continue
        aplicar(nome)
        rig.render('pose_%s_lado' % nome, (1.0, 0.2, 0.0), 30, zoom=0.8)
        foco('cu_cintura_%s' % nome, (1.0, 0.15, 0.4), (0.0, 1.95, 0.1), 3.5)
        foco('cu_ombro_%s' % nome, (-0.8, 0.35, 1.0), (0.4, 2.35, 0.1), 3.5)
        foco('cu_pescoco_%s' % nome, (1.0, 0.1, 0.4), (0.0, 1.6, 0.7), 4.0)
        foco('cu_patas_%s' % nome, (1.0, 0.15, 0.3), (0.0, 0.6, 0.0), 5.0)
    aplicar(None)
    foco('cu_ombros_idle', (-0.8, 0.35, 1.0), (0.0, 2.3, 0.2), 4.0)
    foco('cu_punho_dir', (0.9, 0.3, 1.0), (0.62, 2.2, 0.36), 2.2)
    foco('cu_punho_esq', (-0.9, 0.3, 1.0), (-0.62, 2.2, 0.36), 2.2)
    foco('cu_cauda', (0.5, 0.2, -1.0), (0.0, 1.2, -0.8), 4.0)


def materiais_extra(ctx, objs):
    """As mãos abertas (HandL/HandR) só existem para o corte do pulso: saem da hierarquia exportada e ficam ocultas."""
    for p in ('HandL', 'HandR'):
        o = objs[p]
        o.parent = None
        o.hide_render = True
        o.hide_viewport = True


def main():
    HC.executar(sys.modules[__name__])


if __name__ == '__main__':
    main()
