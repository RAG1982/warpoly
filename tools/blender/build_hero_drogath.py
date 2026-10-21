"""
build_hero_drogath.py — Drogath Punho-de-Brasa (hero_drogath): capitão orc gerado a partir do FBX do Tripo (M2-22).

Só constantes e ganchos do Drogath; todo o resto vive em tools/blender/hero_common.py (biblioteca da M2-21).

Entrada: FBX do Tripo (1 malha de 18,8 mil triângulos, 2 ilhas: corpo + braseiro da cintura; rig Mixamo de 65 ossos sem ações;
         textura 512²; frente em -Y do Blender). NÃO está em T-pose: machado de duas mãos sobre o ombro, braço direito (anatômico)
         levantado segurando o cabo, braço esquerdo caído com o punho fechado.
Saída:   public/models/hero_drogath.glb (meshopt + WebP), prévias 512 px em tools/ui-captures/hero-drogath/.

Uso:
  blender -b --factory-startup --python tools/blender/build_hero_drogath.py -- [caminho.fbx] [--no-render] [--sem-avaliacao]
                                                                              [--glb=saida.glb] [--previas=pasta]
Rodar sempre via tools/safe-run.sh (ver CLAUDE.md).

Hierarquia (tipo-base `grunt` do UnitAnimator, igual à do grunt.glb: o golpe torce o Torso e leva braços e cabeça junto):
  Grunt (raiz, pés em y=0, frente +Z, origem entre os pés)
  ├─ Torso   pivô no quadril    tronco, manto de pele, ombreira, cinto, placas/espetos do quadril, tanga (parte de cima), corrente
  │   ├─ Head   pivô no pescoço     cabeça (rosto só em +Z)
  │   ├─ ArmL   pivô no ombro       braço esquerdo (pendente) com bracelete, corrente e punho fechado
  │   └─ ArmR   pivô no ombro       braço direito REPOSADO + punho que segura o machado
  │       └─ Weapon   pivô na empunhadura, repouso x = -45° (como o grunt)   machado inteiro (cabo, cabeçote e lâmina), gume em +Z
  ├─ LegL / LegR   pivô no quadril    perna inteira (coxa, tanga em duas abas, enfaixadas, pé); braseiro da cintura vai na LegL
O FBX NÃO está em T-pose: o braço direito é REPOSADO pelo rig (hero_common.reposar) antes de cortar. Os ângulos saem de um
resolvedor (resolver_pose): braço pendente, antebraço dobrado `BETA` graus para a frente e o machado empunhado em pé, inclinado
`LAMBDA` graus para a frente, gume voltado para a frente (+Z), com o pulso quase neutro (a pegada original já tem ~102° entre o
cabo e o antebraço). O machado é um corpo RÍGIDO: ele (cabo, cabeçote, lâmina) é separado por geometria no repouso e acompanha o
osso da mão (matriz de deformação), em vez de herdar os pesos de pele soltos do Tripo; vira o nó `Weapon`.
TeamColor: os panos vermelho-ferrugem (faixas, tanga, cinto de pano, atadura do cabo) viram cinza no atlas e multiplicam a cor do time.
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

NOME = 'hero_drogath'
RAIZ = 'Grunt'
PREFIXO = 'drogath'
ATLAS_NOME = 'hero_drogath_atlas'
FBX_PADRAO = '/home/rafael/Downloads/Drogath/tripo_convert_74187011-c89e-4200-aa8c-a7c36d1882d5.fbx'
OUT_GLB = os.path.join(REPO, 'public', 'models', 'hero_drogath.glb')
OUT_PREVIAS = os.path.join(REPO, 'tools', 'ui-captures', 'hero-drogath')

# --- constantes do FBX (metros; x direita do mundo, y cima, z frente; antes do espelho em x) ---
ESCALA = 3.2           # topo da cabeça (y = 0,82 no FBX) vai a 2,62: o Talhador tem a cabeça em 2,83 e o herói recebe scaleMul 1,2
X0 = 0.031             # eixo de simetria (ponto médio dos pés)
Z0 = -0.045            # centro dos pés em z
HIP_Y = 0.42           # plano das pernas (altura da articulação do quadril)
CORTE_Y = 0.64         # plano do pescoço (queixo) e dos ombros (abaixo da ombreira)
CABECA_C = (0.0, 0.735, 0.07)     # centro da cabeça (x - X0 espelhado, y, z - Z0)
CABECA_R = (0.09, 0.105, 0.105)
PLACAS_Y = (0.26, 0.50)            # placas, correntes e espetos do quadril: ficam no Torso (não atravessam as pernas)
SUAVIZACAO = 3
ATLAS = 512
DILATACAO_TIME = 2
PROTECAO_TIME = 2
ZOOM_PREVIA = 0.85
TEAM_DEFAULT = '#b0482c'           # vermelho-ferrugem (multiplica o cinza do atlas)
CABECA = (0.0, 2.35, 0.14)         # centro da cabeça no jogo (prévia do rosto)
WEAPON_REST_X = -45.0              # o UnitAnimator assume ~-0,78 rad de repouso no `Weapon` do grunt

PECAS = ['Torso', 'Head', 'ArmL', 'ArmR', 'Weapon', 'LegL', 'LegR']
CORPO = ['Torso', 'Head', 'ArmL', 'ArmR', 'LegL', 'LegR']     # rótulos vindos dos pesos de pele
CAPAS = PECAS
PAIS = {'Head': 'Torso', 'ArmL': 'Torso', 'ArmR': 'Torso', 'Weapon': 'ArmR'}
PECAS_TIME = []
REGIOES_LIVRES = ('Weapon',)
REPOUSO = {'Weapon': (WEAPON_REST_X, 0.0, 0.0)}
POSES_PREVIA = ('caminhada', 'golpe_a', 'golpe_b', 'grito')

# ---------------------------------------------------------------------------
# Machado (medido no FBX em repouso) e repose do braço direito
# ---------------------------------------------------------------------------
HASTE_A = np.array([-0.4058, 0.6403, 0.2492])      # ponta do pomo (frente)
HASTE_B = np.array([0.1258, 0.8246, -0.2435])      # ponta de trás do cabo
GUME = np.array([-0.059, 0.954, 0.293])            # direção da lâmina (do cabo para o gume), repouso
EMPUNHADURA_T = 0.169                              # posição do punho ao longo do cabo (m a partir do pomo)
OSSO_OMBRO = np.array([-0.1501, 0.7428, -0.1033])
OSSO_COTOVELO = np.array([-0.2359, 0.5595, -0.0175])
OSSO_MAO = np.array([-0.2660, 0.7021, 0.0522])
LAMBDA = 25.0        # inclinação do cabo para a frente, em repouso (graus a partir da vertical)
BETA = 53.0          # dobra do cotovelo (graus a partir do antebraço pendente), para a frente


def _rot_min(a, b):
    a = a / np.linalg.norm(a)
    b = b / np.linalg.norm(b)
    v = np.cross(a, b)
    s = np.linalg.norm(v)
    c = float(a @ b)
    if s < 1e-9:
        return np.eye(3) if c > 0 else rot_eixo(np.cross(a, [1, 0, 0]), 180.0)
    return rot_eixo(v, float(np.degrees(np.arctan2(s, c))))


def _angulo(R):
    return float(np.degrees(np.arccos(np.clip((np.trace(R) - 1) / 2, -1, 1))))


def resolver_pose():
    """Rotações ABSOLUTAS (coordenadas do jogo, antes do espelho) de RightArm, RightForeArm e RightHand para: braço pendente,
    antebraço dobrado BETA graus para a frente e machado em pé (cabo inclinado LAMBDA graus para a frente, gume +Z).
    A torção do antebraço é a que deixa o pulso mais próximo do neutro. Devolve (POSE, ângulo do pulso em graus)."""
    d = HASTE_B - HASTE_A
    d = d / np.linalg.norm(d)
    zr = GUME - (GUME @ d) * d
    zr = zr / np.linalg.norm(zr)
    xr = np.cross(d, zr)
    lam = np.radians(LAMBDA)
    hd = np.array([0.0, np.cos(lam), np.sin(lam)])
    ed = np.array([0.0, -np.sin(lam), np.cos(lam)])
    Rh = np.stack([np.cross(hd, ed), hd, ed], axis=1) @ np.stack([xr, d, zr], axis=1).T      # quadro do machado: repouso -> alvo
    u0 = (OSSO_COTOVELO - OSSO_OMBRO)
    u0 = u0 / np.linalg.norm(u0)
    f0 = (OSSO_MAO - OSSO_COTOVELO)
    f0 = f0 / np.linalg.norm(f0)
    u1 = np.array([-0.36, -0.92, 0.12])
    u1 = u1 / np.linalg.norm(u1)
    Ra = _rot_min(u0, u1)
    b = np.radians(BETA)
    f1 = np.array([-0.10, -np.cos(b), np.sin(b)])
    f1 = f1 / np.linalg.norm(f1)
    Rmin = _rot_min(Ra @ f0, f1) @ Ra
    melhor = None
    for phi in np.arange(-120, 121, 5):
        Rf = rot_eixo(f1, float(phi)) @ Rmin
        a = _angulo(Rh @ Rf.T)
        if melhor is None or a < melhor[0]:
            melhor = (a, Rf)
    pose = {'RightArm': Ra, 'RightForeArm': melhor[1], 'RightHand': Rh}
    return pose, melhor[0]


POSE, ANGULO_PULSO = resolver_pose()
ESTADO = {}            # faces do machado (preenchido em ajustar_fonte, lido em classificar)


# ---------------------------------------------------------------------------
# Cores da textura (HSV em graus)
# ---------------------------------------------------------------------------
def hsv(c):
    h, s, v = colorsys.rgb_to_hsv(float(c[0]), float(c[1]), float(c[2]))
    return h * 360.0, s, v


def eh_pele(c):
    h, s, v = hsv(c)
    return 50 <= h <= 110 and s > 0.3


def eh_pano(c):
    """Pano vermelho-ferrugem (faixas, tanga, cinto de pano, atadura do cabo), incluindo as dobras mais escuras."""
    h, s, v = hsv(c)
    return (h <= 19 or h >= 340) and s > 0.38 and 0.09 < v < 0.8


def eh_pelo(c):
    h, s, v = hsv(c)
    return 12 < h < 40 and v > 0.38


def pano_numa_face(ctx, peca, i):
    cores = HC.cores_de_uv(ctx.pixels, ctx.dados[peca]['UV'][i])
    return sum(1 for c in cores if eh_pano(c)) >= 8


# ---------------------------------------------------------------------------
# Separação do machado por geometria (repouso)
# ---------------------------------------------------------------------------
def faces_do_machado(f):
    """Índices das faces originais do machado, medidas no repouso (f.co_rest): cabo (tubo em torno do eixo HASTE_A-HASTE_B, sem pele
    nem pelo), cabeçote/lâmina (acima do cabo, na metade de trás) e as duas maiores regiões conexas (o pomo e o resto: o punho
    esconde o trecho do meio)."""
    co = f.co_rest
    n = len(f.ls)
    tri = np.array([f.loop_v[f.ls[i]:f.ls[i] + f.lt[i]] for i in range(n)])        # malha 100 % triangular (checado na avaliação)
    uvc = np.array([f.uv[f.ls[i]:f.ls[i] + 3].mean(axis=0) for i in range(n)])
    h, w, _ = f.pixels.shape
    cor = f.pixels[np.clip((uvc[:, 1] * h).astype(int), 0, h - 1), np.clip((uvc[:, 0] * w).astype(int), 0, w - 1)]
    hh = np.array([hsv(c) for c in cor])
    fcen = co[tri].mean(axis=1)
    d = HASTE_B - HASTE_A
    L = float(np.linalg.norm(d))
    d = d / L
    up = np.array([0.0, 1.0, 0.0])
    b = up - (up @ d) * d
    b = b / np.linalg.norm(b)
    nn = np.cross(d, b)
    rel = fcen - HASTE_A
    t, pb, pn = rel @ d, rel @ b, rel @ nn
    perp = np.sqrt(pb ** 2 + pn ** 2)
    relv = co - HASTE_A
    tv = relv @ d
    pv = np.linalg.norm(relv - np.outer(tv, d), axis=1)
    pmax = pv[tri].max(axis=1)
    pele = (hh[:, 0] > 50) & (hh[:, 0] < 110) & (hh[:, 1] > 0.3)
    pelo = (hh[:, 0] > 12) & (hh[:, 0] < 40) & (hh[:, 2] > 0.38)
    cabo = (pmax < 0.052) & (t > -0.03) & (t < L + 0.03) & ~pele & ~pelo
    cabeca = ((((pb > 0.05) & (t > 0.55 * L) & (t < L + 0.12) & (np.abs(pn) < 0.12)) |
               ((pmax < 0.09) & (perp < 0.085) & (t > 0.78 * L) & (t < L + 0.05))) & ~pelo & ~pele)
    sel = cabo | cabeca
    nv = len(co)
    pai = list(range(nv))

    def find(x):
        while pai[x] != x:
            pai[x] = pai[pai[x]]
            x = pai[x]
        return x
    idx = np.where(sel)[0]
    for fi in idx:
        a = find(tri[fi][0])
        for x in tri[fi][1:]:
            r = find(x)
            if r != a:
                pai[r] = a
    grupos = {}
    for fi in idx:
        grupos.setdefault(find(tri[fi][0]), []).append(fi)
    maiores = sorted(grupos.values(), key=len, reverse=True)[:2]
    faces = sorted(fi for g in maiores for fi in g)
    log('machado (repouso): %d faces em %d regiões %s' % (len(faces), len(maiores), [len(g) for g in maiores]))
    return set(faces)


def ajustar_fonte(ctx):
    """Corrige a malha reposada antes de cortar:
    1. o machado vira corpo RÍGIDO: posições (e normais) dos vértices = matriz de deformação do osso da mão x repouso (os pesos de pele
       do Tripo para o cabeçote vinham de pescoço/ombro e o deformariam);
    2. o pelo do manto (marrom claro, acima de y = 0,55) que tinha pesos de braço/mão (descansava junto ao cabo erguido) volta ao
       repouso: o braço desce e o pelo fica no ombro;
    3. faces fora do machado que ficaram esticadas (> 2x) entre o pelo e o cabo são removidas (eram a costura cabo-pelo)."""
    f = ctx.f
    ctx.axe = faces_do_machado(f)
    ESTADO['axe'] = ctx.axe
    D = f.deformacao['RightHand']
    Rn = D[:3, :3]
    n = len(f.ls)
    tri = np.array([f.loop_v[f.ls[i]:f.ls[i] + 3] for i in range(n)])
    vs = sorted({int(v) for i in ctx.axe for v in tri[i]})
    f.co = f.co.copy()
    f.cn = f.cn.copy()
    f.co[vs] = f.co_rest[vs] @ Rn.T + D[:3, 3]
    for i in ctx.axe:
        l0 = f.ls[i]
        f.cn[l0:l0 + 3] = f.cn_rest[l0:l0 + 3] @ Rn.T
    # pelo do manto com pesos de braço: volta ao repouso
    nv = len(f.co)
    cor_v = np.zeros((nv, 3))
    cont = np.zeros(nv)
    for l in range(len(f.loop_v)):
        v = f.loop_v[l]
        cor_v[v] += HC.amostrar(f.pixels, f.uv[l][0], f.uv[l][1])
        cont[v] += 1
    cor_v /= np.maximum(cont, 1)[:, None]
    arm = [i for i, b in enumerate(f.ossos) if b.startswith(('RightArm', 'RightForeArm', 'RightHand'))]
    warm = f.W[:, arm].sum(axis=1)
    eixo_machado = np.zeros(nv, bool)
    eixo_machado[vs] = True
    fix = np.array([eh_pelo(c) for c in cor_v]) & (f.co_rest[:, 1] > 0.55) & (warm < 0.97) & ~eixo_machado
    f.co[fix] = f.co_rest[fix]
    for l in range(len(f.loop_v)):
        if fix[f.loop_v[l]]:
            f.cn[l] = f.cn_rest[l]
    # faces esticadas (costura cabo-pelo)
    def comp(co):
        a, b, c = co[tri[:, 0]], co[tri[:, 1]], co[tri[:, 2]]
        return np.stack([np.linalg.norm(a - b, axis=1), np.linalg.norm(b - c, axis=1), np.linalg.norm(c - a, axis=1)], axis=1)
    razao = (comp(f.co) / (comp(f.co_rest) + 1e-6)).max(axis=1)
    ctx.removidas = {int(i) for i in np.where(razao > 2.0)[0] if i not in ctx.axe}
    # estilhaços: pedaços pequenos (< 60 faces) que sobram soltos depois da remoção
    resto = [i for i in range(n) if i not in ctx.axe and i not in ctx.removidas]
    pai = list(range(nv))

    def achar(x):
        while pai[x] != x:
            pai[x] = pai[pai[x]]
            x = pai[x]
        return x
    for i in resto:
        a = achar(tri[i][0])
        for x in tri[i][1:]:
            r = achar(x)
            if r != a:
                pai[r] = a
    grupos = {}
    for i in resto:
        grupos.setdefault(achar(tri[i][0]), []).append(i)
    estilhacos = [i for g in grupos.values() if len(g) < 60 for i in g]
    ctx.removidas |= set(estilhacos)
    ESTADO['removidas'] = ctx.removidas
    ctx.D_mao = D
    dbg = os.environ.get('DROGATH_DEBUG_NPY')
    if dbg:
        np.save(dbg, f.co)
    log('machado rígido: %d vértices com o osso RightHand (pulso %.1f° do neutro); pelo restaurado: %d vértices; faces removidas (esticadas + %d de estilhaços): %d' %
        (len(vs), ANGULO_PULSO, int(fix.sum()), len(estilhacos), len(ctx.removidas)))


def classificar(sopa, S):
    """Ilha 0 = corpo (com cortes planos); ilha 1 = braseiro da cintura (vai com a perna esquerda); o machado vira uma 'ilha' à parte
    (nunca é cortado por planos) mesmo estando soldado ao corpo."""
    for f in ESTADO['axe']:
        sopa.comp[f] = 2
    for f in ESTADO['removidas']:
        sopa.vivo[f] = False
    info = {}
    for c in (0, 1, 2):
        idx = [f for f in range(len(sopa.fv)) if sopa.comp[f] == c]
        vs = sorted({v for f in idx for v in sopa.fv[f]})
        P = np.array([sopa.P[v] for v in vs])
        info[c] = dict(faces=len(idx), lo=P.min(axis=0), hi=P.max(axis=0))
    return {0: 'corpo', 1: 'LegL', 2: 'Weapon'}, info


def cortes(S):
    """Plano do pescoço/ombros (y = CORTE_Y) e plano do quadril (y = HIP_Y)."""
    return [(1, CORTE_Y * S, None), (1, HIP_Y * S, None)]


def regras(ctx, f, c, nome):
    sopa, S = ctx.sopa, ctx.S
    xc, yc, zq = c[0] / S, c[1] / S, c[2] / S          # x espelhado e z - Z0, em unidades do FBX
    cor = cor_da_face(sopa, ctx.pixels, f)
    pele, pano = eh_pele(cor), eh_pano(cor)
    # 1. placas, correntes e espetos do quadril (ferro, couro escuro): ficam no Torso, não atravessam as pernas
    if PLACAS_Y[0] < yc < PLACAS_Y[1] and not pele and not pano and nome in ('Torso', 'LegL', 'LegR'):
        return 'Torso'
    # 2. cabeça: elipsoide em torno do crânio, acima do plano do pescoço
    ex = ((xc - CABECA_C[0]) / CABECA_R[0]) ** 2 + ((yc - CABECA_C[1]) / CABECA_R[1]) ** 2 + ((zq - CABECA_C[2]) / CABECA_R[2]) ** 2
    if yc >= CORTE_Y - 1e-6 and ex < 1.0 and nome in ('Torso', 'Head'):
        return 'Head'
    if nome == 'Head':
        return 'Torso'
    # 3. braços: o que está acima do plano do ombro fica no Torso (ombreira, pelo e deltoide embaixo da ombreira)
    if nome in ('ArmL', 'ArmR'):
        return 'Torso' if yc >= CORTE_Y - 1e-6 else nome
    # 4. pernas: só abaixo do plano do quadril; tanga e virilha repartidas pelo lado
    if yc < HIP_Y + 1e-6:
        if nome in ('Torso', 'LegL', 'LegR'):
            return 'LegR' if xc > 0 else 'LegL'
        return nome
    if nome in ('LegL', 'LegR'):
        return 'Torso'
    return nome


def eh_time(ctx, peca, i):
    return pano_numa_face(ctx, peca, i)


def cor_time(rgb, peca):
    return eh_pano(rgb)


def finalizar(ctx):
    """Pivôs, machado nivelado ao repouso do nó (-45° em x) e vértices em coordenadas locais. Devolve {peça: pivô}."""
    S, f, dados = ctx.S, ctx.f, ctx.dados

    def T(p):
        return np.array([-(p[0] - X0) * S, p[1] * S, (p[2] - Z0) * S])
    piv = {}
    # cabeça: um bloco quase fechado (o queixo fica acima do plano do pescoço, então não há seção plana): pivô sob o crânio, atrás do queixo
    piv['Head'] = np.array([0.0, round(0.655 * S, 3), round(0.03 * S, 3)])
    for p, sinal in (('ArmL', -1.0), ('ArmR', 1.0)):
        ombro = [t for t in dados[p]['tampas'] if t['centro'][0] * sinal > 0.1 * S and t['centro'][1] > 1.6]
        if not ombro:
            raise RuntimeError('%s: sem seção de ombro (tampas: %s)' % (p, [np.round(t['centro'], 2) for t in dados[p]['tampas']]))
        t = max(ombro, key=lambda q: q['n_arestas'])
        piv[p] = np.round(t['centro'], 3)
        log('ombro %s: seção de %d arestas, pivô %s' % (p, t['n_arestas'], piv[p]))
    # pernas: o pivô é a articulação do quadril (osso UpLeg); a borda de cima da perna não é plana (as placas do quadril ficam no Torso)
    for p, osso in (('LegL', 'LeftUpLeg'), ('LegR', 'RightUpLeg')):
        h = T(f.pos_ossos[osso])
        piv[p] = np.array([round(float(h[0]), 3), round(float(h[1]), 3), round(float(h[2]), 3)])
        log('quadril %s: osso %s, pivô %s (%d seções)' % (p, osso, piv[p], len(dados[p]['tampas'])))
    piv['Torso'] = np.array([0.0, piv['LegL'][1], 0.0])
    # machado: empunhadura = ponto do cabo sob o punho, levado pela mão; geometria girada +45° em x em torno dele, para que o nó em
    # repouso (-45° em x) a devolva à pose do punho
    d = (HASTE_B - HASTE_A)
    d = d / np.linalg.norm(d)
    G_rep = HASTE_A + d * EMPUNHADURA_T
    D = ctx.D_mao
    G = T(D[:3, :3] @ G_rep + D[:3, 3])
    R = rot_eixo((1, 0, 0), -WEAPON_REST_X)
    W = dados['Weapon']
    W['V'] = (W['V'] - G) @ R.T + G
    W['N'] = [[R @ n for n in nn] for nn in W['N']]
    piv['Weapon'] = np.round(G, 3)
    log('machado: empunhadura %s; cabeça do cabo (local) %s' % (piv['Weapon'], np.round(R @ (T(D[:3, :3] @ HASTE_B + D[:3, 3]) - G), 3)))
    for p in PECAS:
        dados[p]['V'] = dados[p]['V'] - piv[p]
    return piv


def poses():
    """Poses do UnitAnimator para o tipo `grunt` (rad). `repouso` = Weapon a -45° em x. O golpe usa os valores de applyGruntFight
    (aquecimento no fim de p < 0,35 e fim do talho em p = 0,60); o grito de guerra usa a `cast` (braços a -2,3 rad)."""
    wr = np.radians(WEAPON_REST_X)
    sw = 0.55
    return {
        'repouso': {'Weapon': (wr, 0, 0)},
        'caminhada': {'LegL': (0.65, 0, 0), 'LegR': (-0.65, 0, 0), 'ArmL': (-sw, 0, -0.05), 'ArmR': (sw, 0, 0.05),
                      'Torso': (0.05, 0.08, 0.0)},
        'golpe_a': {'Torso': (-0.15, 0.65, 0), 'ArmR': (1.55, 0.4, 0), 'ArmL': (-1.25, 0.3, 0), 'Weapon': (-0.78 + 0.6, 0, 0),
                    'Head': (0, -0.25, 0)},
        'golpe_b': {'Torso': (0.3, -0.6, 0), 'ArmR': (-1.3, -0.3, 0), 'ArmL': (1.1, 0, 0), 'Weapon': (-0.18 - 2.5, 0, 0),
                    'Head': (0, 0.2, 0)},
        'grito': {'ArmL': (-2.3, 0, -0.25), 'ArmR': (-2.3, 0, 0.25), 'Torso': (-0.12, 0, 0), 'Head': (-0.25, 0, 0),
                  'Weapon': (wr, 0, 0)},
    }


def previa_extra(ctx, rig, objs):
    """Conferência: o idle de frente/lado/costas/3q com zoom no machado e no braço; poses de caminhada e golpe vistas de costas."""
    import common as C
    from mathutils import Vector
    todas = poses()
    for nome in ('caminhada', 'golpe_a', 'golpe_b'):
        for p in PECAS:
            HC.rot_three(C, objs[p], 0, 0, 0)
        for p, (rx, ry, rz) in todas['repouso'].items():
            HC.rot_three(C, objs[p], rx, ry, rz)
        for p, (rx, ry, rz) in todas[nome].items():
            HC.rot_three(C, objs[p], rx, ry, rz)
        rig.render('pose_%s_costas' % nome, (0.0, 0.25, -1.0), 30, zoom=0.7)
        rig.render('pose_%s_lado' % nome, (1.0, 0.2, 0.0), 30, zoom=0.7)
    for p in PECAS:
        HC.rot_three(C, objs[p], 0, 0, 0)
    for p, (rx, ry, rz) in todas['repouso'].items():
        HC.rot_three(C, objs[p], rx, ry, rz)
    antes = HC.colorir_pecas(objs)
    rig.render('pecas_costas', (1.0, 0.8, -1.0), 30, zoom=ZOOM_PREVIA)
    rig.render('pecas_frente', (-1.0, 0.5, 1.0), 30, zoom=ZOOM_PREVIA)
    HC.restaurar_materiais(objs, antes)
    centro = rig.center.copy()
    rig.center = Vector((0.0, 0.0, 1.5))
    rig.render('cabeca_pecas', (0.0, 0.1, 1.0), 20, dist=2.4)
    rig.center = centro


def main():
    HC.executar(sys.modules[__name__])


if __name__ == '__main__':
    main()
