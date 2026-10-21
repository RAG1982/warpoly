"""
build_knight_v2.py — Espadachim humano (Footman, tipo-base `knight`, chave `knight_v2`) gerado a partir do FBX do Tripo (M2-32).

Só constantes e ganchos do Espadachim; todo o resto vive em tools/blender/hero_common.py (biblioteca da M2-21).

Entrada: FBX do Tripo (1 malha de 19,2 mil triângulos, 2 ilhas: corpo + escudo; rig Mixamo de 65 ossos sem ações; textura 512²;
         frente em -Y do Blender; T-pose com a espada curta na mão DIREITA anatômica apontando para a frente/fora e o escudo
         azul na esquerda).
Saída:   public/models/knight_v2.glb (meshopt + WebP), prévias 512 px em tools/ui-captures/knight-v2/.

Uso:
  blender -b --factory-startup --python tools/blender/build_knight_v2.py -- [caminho.fbx] [--no-render] [--sem-avaliacao]
                                                                           [--glb=saida.glb] [--previas=pasta]
Rodar sempre via tools/safe-run.sh (ver CLAUDE.md).

Hierarquia (tipo-base `knight` do UnitAnimator; Sword e ShieldGroup são FILHOS dos braços, para a arma e o escudo acompanharem o
balanço do braço na caminhada e no golpe — o animador escreve rotações absolutas locais nos dois):
  Knight (raiz, pés em y=0, frente +Z, origem entre os pés)
  ├─ Torso   pivô (0, 1.05, 0)   tronco, cinto, tabardo (TeamColor), bainha, gorjal e metade interna dos ombros
  ├─ Head    pivô no pescoço     elmo com crista (TeamColor) e rosto (só em +Z)
  ├─ ArmL    pivô no ombro (-x)  ombreira + braço + manopla da esquerda
  │   └─ ShieldGroup  pivô na mão (rotação de repouso y = -0,3 rad, como o animador)   escudo (campo azul em TeamColor)
  ├─ ArmR    pivô no ombro (+x)  ombreira + braço + punho da espada
  │   └─ Sword        pivô na empunhadura (repouso x 0,5 rad / z -0,1 rad)             espada curta, gume voltado para +Z
  └─ LegL / LegR   pivô no quadril   coxas, joelheiras, botas
O FBX está em T-pose: os braços são REPOSADOS pelo rig (hero_common.reposar). A espada e o escudo são corpos RÍGIDOS: acompanham o osso
da mão (matriz de deformação) e são orientados pelo repouso do nó (a malha local sai com a rotação de repouso desfeita), de modo que
o gume (+Z local) e a lâmina (+Y local) batem com o que o UnitAnimator espera. O Tripo segura a espada com a mão direita anatômica,
em -x quando a figura olha para +Z; a convenção do jogo põe a arma em +x: a malha é ESPELHADA em x (ossos Left* -> ArmL/LegL em -x).
TeamColor: o azul do tabardo, da crista e das mangas vira cinza no atlas (o dourado e o aço ficam); o escudo mantém o azul heráldico.
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

NOME = 'knight_v2'
RAIZ = 'Knight'
PREFIXO = 'knight_v2'
ATLAS_NOME = 'knight_v2_atlas'
FBX_PADRAO = '/home/rafael/Downloads/footman (2)/tripo_convert_e204c41f-b34c-4bb3-951a-cf9f0014471d.fbx'
OUT_GLB = os.path.join(REPO, 'public', 'models', 'knight_v2.glb')
OUT_PREVIAS = os.path.join(REPO, 'tools', 'ui-captures', 'knight-v2')

# --- constantes do FBX (metros; x direita do mundo, y cima, z frente; antes do espelho em x) ---
TOPO = 2.074           # altura final (topo da crista): igual ao knight.glb (visualScale.js usa 2,074 como referência)
ESCALA = TOPO / 0.6923  # a crista do FBX vai a 0,6923 m (a ponta da espada reposada passa disso: não serve de referência)
X0 = -0.006            # eixo de simetria (quadris)
Z0 = -0.085            # centro dos pés em z
OMBRO_X = 0.103        # |x - X0| do ombro (osso Arm): plano de corte do braço
OMBRO_Y = 0.50         # acima disso (no FBX) o plano x = ±OMBRO_X separa braço e tronco
PESCOCO_Y = 0.535      # plano horizontal cabeça/tronco (abaixo do queixo)
PESCOCO_X = 0.075      # só a faixa central |x| < PESCOCO_X é cortada pelo plano do pescoço (as ombreiras passam por cima)
PERNA_Y = 0.30         # plano das pernas: logo abaixo do cinto
SUAVIZACAO = 5
ATLAS = 512
DILATACAO_TIME = 1
PROTECAO_TIME = 1
ZOOM_PREVIA = 0.85
TEAM_DEFAULT = '#1f4ac8'     # azul profundo, igual ao knight.glb
CABECA = (0.0, 1.75, 0.0)    # centro da cabeça no jogo (prévia do rosto)

# --- espada: eixos medidos no repouso (T-pose, antes do espelho) por PCA das faces da espada ---
LAMINA = np.array([-0.505, -0.029, 0.863])    # empunhadura -> ponta
GUME = np.array([0.197, 0.969, 0.147])        # direção do gume (a lâmina é chata na horizontal; os gumes ficam em cima e embaixo)
SW_REPOUSO = (0.5, 0.0, -0.1)                 # rad; slot de arma do UnitAnimator (rotation.x = 0,5; rotation.z = -0,1)
# --- escudo: normal da face (lado do leão) e direção da ponta, no repouso ---
ESC_NORMAL = np.array([0.598, 0.711, 0.371])
ESC_PONTA = np.array([0.787, -0.609, -0.101])
ESC_REPOUSO = (0.0, -0.3, 0.0)                # rad; o animador usa shieldGroup.rotation.y = -0.3 em repouso
# --- ossos (repouso, antes do espelho) ---
D_BRACO_R = np.array([-0.105, -0.07, -0.004])  # RightArm -> RightForeArm (direção do braço)
D_ANTEBRACO_R = np.array([-0.09, -0.046, 0.017])
D_ANTEBRACO_L = np.array([0.105, -0.045, 0.02])
D_BRACO_L = np.array([0.105, -0.07, -0.004])
# --- alvos do repose (coordenadas do jogo DEPOIS do espelho: x positivo = lado da espada) ---
BRACO_R_ALVO = np.array([0.33, -0.93, 0.15])         # braço da espada: pendente, um pouco para fora
BRACO_L_ALVO = np.array([-0.28, -0.92, 0.28])        # braço do escudo
ESC_NORMAL_ALVO = np.array([-0.45, 0.10, 0.89])      # face do escudo: para a frente e para fora (-x)
ESC_BAIXO_ALVO = np.array([-0.10, -1.0, 0.0])        # ponta do escudo para baixo

PECAS = ['Torso', 'Head', 'ArmL', 'ArmR', 'LegL', 'LegR', 'Sword', 'ShieldGroup']
CORPO = ['Torso', 'Head', 'ArmL', 'ArmR', 'LegL', 'LegR']     # rótulos vindos dos pesos de pele
CAPAS = CORPO + ['Sword']
PAIS = {'Sword': 'ArmR', 'ShieldGroup': 'ArmL'}
PECAS_TIME = []
REGIOES_LIVRES = ()
POSES_PREVIA = ('caminhada', 'golpe', 'golpe2')

M_ESP = np.diag([-1.0, 1.0, 1.0])
HC.CORES_PECAS['ShieldGroup'] = '#ff9a00'     # (só prévia) cor chapada da peça


def _unit(v):
    v = np.asarray(v, float)
    return v / np.linalg.norm(v)


def _rx(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[1, 0, 0], [0, c, -s], [0, s, c]])


def _ry(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])


def _rz(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])


def _euler_three(r):
    """Matriz do Euler XYZ do three.js (Rx·Ry·Rz)."""
    return _rx(r[0]) @ _ry(r[1]) @ _rz(r[2])


def _rot_min(a, b):
    a, b = _unit(a), _unit(b)
    v = np.cross(a, b)
    s = np.linalg.norm(v)
    c = float(a @ b)
    if s < 1e-9:
        return np.eye(3) if c > 0 else rot_eixo(np.cross(a, [1, 0, 0]), 180.0)
    return rot_eixo(v, float(np.degrees(np.arctan2(s, c))))


def _pre(R_pos):
    """Rotação própria no sistema DEPOIS do espelho -> o mesmo movimento no sistema do FBX (antes do espelho)."""
    return M_ESP @ R_pos @ M_ESP


R_SW = _euler_three(SW_REPOUSO)
R_ESC = _euler_three(ESC_REPOUSO)


def resolver_pose():
    """Rotações ABSOLUTAS (coordenadas do FBX, antes do espelho) de RightArm/RightForeArm e LeftArm/LeftForeArm.
    Braço da espada: o antebraço (e a mão, que herda) gira o necessário para a espada ficar exatamente com a orientação de repouso do
    nó Sword (lâmina para cima e 28° para a frente, gume em +Z). Braço do escudo: idem para a face do escudo."""
    # espada: quadro local (x = normal da lâmina, y = lâmina, z = gume), no sistema DEPOIS do espelho
    d = _unit(LAMINA)
    e = _unit(GUME - (GUME @ d) * d)
    dp, ep = M_ESP @ d, -(M_ESP @ e)        # gume invertido: dá a pegada com o antebraço para a frente (conferido no gerador)
    quadro = np.stack([np.cross(dp, ep), dp, ep], axis=1)
    Rh_pos = R_SW @ quadro.T
    # escudo
    n = _unit(ESC_NORMAL)
    p = _unit(ESC_PONTA - (ESC_PONTA @ n) * n)
    qe = np.stack([M_ESP @ n, M_ESP @ p, np.cross(M_ESP @ n, M_ESP @ p)], axis=1)
    nt = _unit(ESC_NORMAL_ALVO)
    pt = _unit(ESC_BAIXO_ALVO - (ESC_BAIXO_ALVO @ nt) * nt)
    qt = np.stack([nt, pt, np.cross(nt, pt)], axis=1)
    Re_pos = qt @ qe.T                                  # (o repouso do nó entra na malha local, não na pose)
    pose = {
        'RightArm': _pre(_rot_min(_unit(M_ESP @ D_BRACO_R), _unit(BRACO_R_ALVO))),
        'RightForeArm': _pre(Rh_pos),
        'LeftArm': _pre(_rot_min(_unit(M_ESP @ D_BRACO_L), _unit(BRACO_L_ALVO))),
        'LeftForeArm': _pre(Re_pos),
    }
    return pose


POSE = resolver_pose()
ESTADO = {}


# ---------------------------------------------------------------------------
# Cores da textura (HSV em graus)
# ---------------------------------------------------------------------------
def hsv(c):
    h, s, v = colorsys.rgb_to_hsv(float(c[0]), float(c[1]), float(c[2]))
    return h * 360.0, s, v


def eh_azul(c):
    """Azul do tabardo, da crista, das mangas e do campo do escudo (inclui as dobras escuras)."""
    h, s, v = hsv(c)
    return 190 <= h <= 255 and s > 0.28 and 0.12 < v < 0.95


def eh_estrutura(c):
    """Texel que NÃO vira TeamColor dentro de uma face de time: dourado/marrom (leão, frisos, couro) e branco/aço claro."""
    h, s, v = hsv(c)
    return (15 <= h <= 75 and s > 0.2) or (s < 0.10 and v > 0.55)


def eh_pele(c):
    h, s, v = hsv(c)
    return 8 <= h <= 30 and 0.3 <= s <= 0.75 and v > 0.45


def azul_numa_face(ctx, peca, i, minimo=0.6):
    cores = HC.cores_de_uv(ctx.pixels, ctx.dados[peca]['UV'][i])
    return sum(1 for c in cores if eh_azul(c)) >= minimo * len(cores)


# ---------------------------------------------------------------------------
# Separação da espada (por geometria, no repouso) e do escudo (ilha 1)
# ---------------------------------------------------------------------------
def faces_da_espada(f, comp_v):
    """Faces da ilha do corpo que formam a espada curta: depois do plano da empunhadura (ao longo da lâmina) e até 10 cm do eixo."""
    co = f.co_rest
    n = len(f.ls)
    tri = np.array([f.loop_v[f.ls[i]:f.ls[i] + 3] for i in range(n)])
    fc = co[tri].mean(axis=1)
    d = _unit(LAMINA)
    P0 = np.array([-0.355, 0.38, -0.02])
    rel = fc - P0
    t = rel @ d
    perp = np.linalg.norm(rel - np.outer(t, d), axis=1)
    sel = (t > -0.01) & (perp < 0.10) & (fc[:, 0] < -0.30) & (comp_v[tri[:, 0]] == 0)
    # só a maior região conexa
    idx = np.where(sel)[0]
    pai = list(range(len(co)))

    def find(x):
        while pai[x] != x:
            pai[x] = pai[pai[x]]
            x = pai[x]
        return x
    for fi in idx:
        a = find(tri[fi][0])
        for x in tri[fi][1:]:
            r = find(x)
            if r != a:
                pai[r] = a
    grupos = {}
    for fi in idx:
        grupos.setdefault(find(tri[fi][0]), []).append(fi)
    maior = max(grupos.values(), key=len)
    log('espada (repouso): %d faces em %d regiões (usando a maior: %d)' % (len(idx), len(grupos), len(maior)))
    return set(int(i) for i in maior)


def ajustar_fonte(ctx):
    """Espada e escudo viram corpos RÍGIDOS: posição e normais = matriz de deformação do osso da mão x repouso."""
    f = ctx.f
    n = len(f.ls)
    tri = np.array([f.loop_v[f.ls[i]:f.ls[i] + 3] for i in range(n)])
    faces = [list(f.loop_v[f.ls[i]:f.ls[i] + f.lt[i]]) for i in range(n)]
    comp_v, _, _ = HC.componentes(len(f.co), faces)
    ctx.comp_v_fonte = comp_v
    ctx.espada = faces_da_espada(f, comp_v)
    ESTADO['espada'] = ctx.espada
    f.co = f.co.copy()
    f.cn = f.cn.copy()
    for nome, osso, conjunto in (('espada', 'RightHand', ctx.espada),
                                 ('escudo', 'LeftHand', {i for i in range(n) if comp_v[tri[i][0]] == 1})):
        D = f.deformacao[osso]
        Rn = D[:3, :3]
        vs = sorted({int(v) for i in conjunto for v in tri[i]})
        f.co[vs] = f.co_rest[vs] @ Rn.T + D[:3, 3]
        for i in conjunto:
            l0 = f.ls[i]
            f.cn[l0:l0 + f.lt[i]] = f.cn_rest[l0:l0 + f.lt[i]] @ Rn.T
        ctx.__dict__['D_' + nome] = D
        log('%s rígido: %d vértices com o osso %s' % (nome, len(vs), osso))
    # faces esticadas pela troca (borda da espada com o punho): removidas
    def comp(co):
        a, b, c = co[tri[:, 0]], co[tri[:, 1]], co[tri[:, 2]]
        return np.stack([np.linalg.norm(a - b, axis=1), np.linalg.norm(b - c, axis=1), np.linalg.norm(c - a, axis=1)], axis=1)
    razao = (comp(f.co) / (comp(f.co_rest) + 1e-6)).max(axis=1)
    ctx.removidas = {int(i) for i in np.where(razao > 2.2)[0] if i not in ctx.espada}
    ESTADO['removidas'] = ctx.removidas
    log('faces esticadas removidas: %d' % len(ctx.removidas))
    ih = [i for i, b in enumerate(f.ossos) if b in ('Head', 'HeadTop_End')]
    wh = f.W[:, ih].sum(axis=1)
    for lim in (0.5, 0.9):
        P = f.co_rest[(wh > lim) & (ctx.comp_v_fonte == 0)]
        log('DEBUG cabeça (peso Head > %.1f): %d vértices x [%.3f, %.3f] y [%.3f, %.3f] z [%.3f, %.3f]' %
            (lim, len(P), P[:, 0].min(), P[:, 0].max(), P[:, 1].min(), P[:, 1].max(), P[:, 2].min(), P[:, 2].max()))
    # garante que a mão direita e o resto do corpo estão consistentes: relatório de pulso
    log('osso RightHand reposado em %s; LeftHand em %s' % (np.round(f.pos_pose['RightHand'], 3), np.round(f.pos_pose['LeftHand'], 3)))


def classificar(sopa, S):
    for fi in ESTADO['espada']:
        sopa.comp[fi] = 2
    for fi in ESTADO['removidas']:
        sopa.vivo[fi] = False
    info = {}
    for c in (0, 1, 2):
        idx = [f for f in range(len(sopa.fv)) if sopa.comp[f] == c and sopa.vivo[f]]
        vs = sorted({v for f in idx for v in sopa.fv[f]})
        P = np.array([sopa.P[v] for v in vs])
        info[c] = dict(faces=len(idx), lo=P.min(axis=0), hi=P.max(axis=0))
    return {0: 'corpo', 1: 'ShieldGroup', 2: 'Sword'}, info


def cortes(S):
    """Planos do pescoço (faixa central), dos ombros (x = ±OMBRO_X, perpendiculares ao eixo de giro do braço) e das pernas."""
    return [(1, PESCOCO_Y * S, None, lambda c: abs(c[0]) / S < 0.12),
            (0, OMBRO_X * S, (OMBRO_Y - 0.06) * S), (0, -OMBRO_X * S, (OMBRO_Y - 0.06) * S),
            (1, PERNA_Y * S, None)]


def regras(ctx, f, c, nome):
    S = ctx.S
    dx = abs(c[0]) / S
    yf = c[1] / S
    zq = c[2] / S                                   # z - Z0 em unidades do FBX
    # cabeça: elmo e crista = acima do plano do queixo, dentro da faixa do crânio (a gola e o encosto das costas ficam no Torso)
    if nome in ('Torso', 'Head') and yf >= PESCOCO_Y - 1e-6 and dx < PESCOCO_X and -0.14 < zq < 0.09:
        return 'Head'
    if nome == 'Head':
        return 'Torso'
    # braços: acima do plano do ombro só o que está fora de |x| = OMBRO_X
    if nome in ('Torso', 'ArmL', 'ArmR') and yf >= OMBRO_Y:
        return ('ArmR' if c[0] > 0 else 'ArmL') if dx >= OMBRO_X else 'Torso'
    # pernas: só abaixo do plano das pernas; tabardo (faixa central na frente) e bainha ficam no Torso
    if yf < PERNA_Y + 1e-6:
        if nome in ('Torso', 'LegL', 'LegR'):
            tabardo = dx < 0.06 and zq > 0.0
            return 'Torso' if tabardo else ('LegR' if c[0] > 0 else 'LegL')
        return nome
    if nome in ('LegL', 'LegR'):
        return 'Torso'
    return nome


def eh_time(ctx, peca, i):
    if peca in ('Sword', 'ShieldGroup'):
        return False                  # o escudo mantém o azul heráldico: o leão dourado dividiria cada face com o azul
    return azul_numa_face(ctx, peca, i)


def cor_time(rgb, peca):
    return peca not in ('Sword', 'ShieldGroup') and eh_azul(rgb)


def _atlas_so_azul():
    """O atlas do hero_common pinta de cinza TODOS os texels das faces de TeamColor. Aqui o dourado, o leão e o aço que dividem a
    face com o azul voltam à cor original: só os texels azuis ficam cinza (e multiplicam a cor do time)."""
    original = HC.construir_atlas

    def construir(f, dados, pecas, eh_time_fn, atlas=512, dilatacao=4, protecao=0):
        arr, info = original(f, dados, pecas, eh_time_fn, atlas, dilatacao, protecao)
        base = HC.reamostrar(f.pixels, atlas)
        mudou = np.any(np.abs(arr - base) > 1e-6, axis=2)
        restaurar = 0
        for y, x in zip(*np.where(mudou)):
            if eh_estrutura(base[y, x]):
                arr[y, x] = base[y, x]
                restaurar += 1
        info['texels_restaurados'] = restaurar
        return arr, info
    HC.construir_atlas = construir


_atlas_so_azul()


def finalizar(ctx):
    """Pivôs, espada e escudo em coordenadas locais (rotação de repouso desfeita). Devolve {peça: pivô}."""
    S, f, dados = ctx.S, ctx.f, ctx.dados

    def T(p):
        return np.array([-(p[0] - X0) * S, p[1] * S, (p[2] - Z0) * S])
    piv = {'Torso': np.array([0.0, 1.05, 0.0])}
    h = T(f.pos_pose['Head'])
    piv['Head'] = np.array([0.0, round(float(h[1]), 2), round(float(h[2]), 2)])
    px = OMBRO_X * S
    for p, sinal in (('ArmL', -1.0), ('ArmR', 1.0)):
        ombro = [t for t in dados[p]['tampas'] if abs(t['centro'][0] - sinal * px) < 0.12]
        if not ombro:
            raise RuntimeError('%s: sem seção de ombro (tampas: %s)' % (p, [np.round(t['centro'], 2) for t in dados[p]['tampas']]))
        t = max(ombro, key=lambda q: q['n_arestas'])
        piv[p] = np.array([sinal * round(px, 3), round(float(t['centro'][1]), 3), round(float(t['centro'][2]), 3)])
        log('ombro %s: seção de %d arestas, pivô %s (osso: %s)' % (p, t['n_arestas'], piv[p],
                                                            np.round(T(f.pos_pose['RightArm' if sinal > 0 else 'LeftArm']), 3)))
    # pernas: pivô no plano de corte (y = PERNA_Y), x e z da articulação do quadril (osso UpLeg), simétricos
    hl, hr = T(f.pos_ossos['LeftUpLeg']), T(f.pos_ossos['RightUpLeg'])
    xq = round(float((abs(hl[0]) + abs(hr[0])) / 2), 3)
    zq = round(float((hl[2] + hr[2]) / 2), 3)
    for p, sinal in (('LegL', -1.0), ('LegR', 1.0)):
        piv[p] = np.array([sinal * xq, round(PERNA_Y * S, 3), zq])
        log('quadril %s: %d tampas, pivô %s' % (p, len(dados[p]['tampas']), piv[p]))
    # espada: empunhadura = ponto do eixo da lâmina mais próximo do centro da mão, levado pela mão
    V = dados['Sword']['V']
    d = _unit(LAMINA)
    vs_esp = {int(v) for fi in ctx.espada for v in f.loop_v[f.ls[fi]:f.ls[fi] + 3]}
    punho = [v for v in range(len(f.co_rest)) if ctx.sopa.mao_r[v] > 0.5 and ctx.comp_v_fonte[v] == 0 and v not in vs_esp]
    cen_rep = np.mean([f.co_rest[v] for v in punho], axis=0)       # centro do punho (vértices pesados na mão, sem a espada)
    c_esp = f.co_rest[sorted(vs_esp)].mean(axis=0)
    G_rep = c_esp + d * float((cen_rep - c_esp) @ d)
    D = ctx.D_espada
    G = T(D[:3, :3] @ G_rep + D[:3, 3])
    Rinv = R_SW.T
    dados['Sword']['V'] = (V - G) @ Rinv.T
    dados['Sword']['N'] = [[Rinv @ n for n in nn] for nn in dados['Sword']['N']]
    piv['Sword'] = np.round(G, 3)
    log('espada: empunhadura %s (mão em %s)' % (piv['Sword'], np.round(T(f.pos_pose['RightHand']), 3)))
    # escudo: pivô na mão esquerda reposada
    Gs = T(f.pos_pose['LeftHand'])
    Vs = dados['ShieldGroup']['V']
    Ri = R_ESC.T
    dados['ShieldGroup']['V'] = (Vs - Gs) @ Ri.T
    dados['ShieldGroup']['N'] = [[Ri @ n for n in nn] for nn in dados['ShieldGroup']['N']]
    piv['ShieldGroup'] = np.round(Gs, 3)
    log('escudo: pivô %s' % piv['ShieldGroup'])
    for p in PECAS:
        if p in ('Sword', 'ShieldGroup'):
            continue
        dados[p]['V'] = dados[p]['V'] - piv[p]
    return piv


def _repouso_blender(R):
    """Graus do Euler 'XYZ' do Blender (Rz·Ry·Rx) que reproduzem a matriz de repouso do nó (a do three.js, Rx·Ry·Rz)."""
    from mathutils import Matrix
    e = Matrix(tuple(tuple(float(x) for x in l) for l in R)).to_euler('XYZ')
    return tuple(math.degrees(a) for a in e)


def _repouso():
    return {'Sword': _repouso_blender(R_SW), 'ShieldGroup': _repouso_blender(R_ESC)}


class _Repouso(dict):
    pass


def poses():
    """Poses do UnitAnimator para o tipo `knight` (rad): caminhada e golpe (applyKnightFight)."""
    sw = 0.55
    sr = SW_REPOUSO
    return {
        'repouso': {'Sword': sr, 'ShieldGroup': ESC_REPOUSO},
        'caminhada': {'LegL': (0.65, 0, 0), 'LegR': (-0.65, 0, 0), 'ArmL': (-sw, 0, -0.05), 'ArmR': (sw, 0, 0.05),
                      'Torso': (0.05, 0.08, 0.0), 'Sword': (sr[0] + sw * 0.4, 0, sr[2]), 'ShieldGroup': (0, -0.3 + sw * 0.3, 0)},
        'golpe': {'Torso': (0, -0.5, 0), 'ArmR': (1.15, -0.4, 0.0), 'Sword': (1 - (-0.3 + 1.6), 0, sr[2]), 'Head': (0, 0.2, 0),
                  'ShieldGroup': (0, -0.5, 0)},
        'golpe2': {'Torso': (0, 0.45, 0), 'ArmR': (-1.35, 0.3, 0.2), 'Sword': (1 - (0.5 - 0.8), 0, sr[2]), 'Head': (0, -0.2, 0),
                   'ShieldGroup': (0, 0.25, 0)},
    }


def previa_extra(ctx, rig, objs):
    """Conferência das emendas: cabeça e ombros com as peças coloridas (costas, lado, topo) e a espada de perto."""
    from mathutils import Vector
    antes = HC.colorir_pecas(objs)
    centro = rig.center.copy()
    rig.center = Vector((0.0, 0.0, 1.7))
    rig.render('cabeca_pecas_costas', (0.0, 0.5, -1.0), 20, dist=2.4)
    rig.render('cabeca_pecas_lado', (-1.0, 0.3, 0.0), 20, dist=2.4)
    rig.render('cabeca_pecas_topo', (0.0, 1.5, -0.3), 20, dist=2.4)
    rig.render('cabeca_pecas_frente', (0.0, 0.2, 1.0), 20, dist=2.4)
    HC.restaurar_materiais(objs, antes)
    rig.render('cabeca_costas', (0.0, 0.5, -1.0), 20, dist=2.4)
    rig.render('cabeca_topo', (0.0, 1.5, -0.3), 20, dist=2.4)
    rig.center = Vector((0.6, -0.25, 1.22))
    rig.render('mao_dir_frente', (0.2, 0.3, 1.0), 20, dist=2.0)
    rig.render('mao_dir_lado', (1.0, 0.3, 0.1), 20, dist=2.0)
    rig.render('mao_dir_topo', (0.3, 1.5, 0.3), 20, dist=2.0)
    rig.render('mao_dir_costas', (0.3, 0.3, -1.0), 20, dist=2.0)
    rig.center = Vector((-0.5, -0.15, 1.0))
    rig.render('mao_esq_frente', (-0.5, 0.3, 1.0), 20, dist=2.6)
    rig.render('mao_esq_costas', (-0.5, 0.3, -1.0), 20, dist=2.6)
    rig.center = centro


def main():
    # REPOUSO precisa do mathutils (só existe dentro do Blender): calculado aqui, antes do pipeline
    sys.modules[__name__].REPOUSO = _repouso()
    HC.executar(sys.modules[__name__])


if __name__ == '__main__':
    main()
