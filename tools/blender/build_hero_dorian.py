"""
build_hero_dorian.py — Marechal Dorian Vasques (hero_dorian): comandante humano montado, gerado a partir do FBX do Tripo (M2-20).

Só constantes e ganchos do Dorian; todo o resto vive em tools/blender/hero_common.py.

Entrada: FBX do Tripo (1 malha de 19,2 mil triângulos, UMA ilha só: cavaleiro, cavalo com barda azul, estandarte nas costas, capa
         longa sobre a garupa, espada na cintura; SEM RIG; textura 1024²). O modelo olha para -X (a cabeça do cavalo está em -X) e fica
         em repouso (cavalo parado, patas no chão, rédeas nas duas mãos). Não há pesos de pele nem ossos: a segmentação é
         GEOMÉTRICA (planos de corte + regiões por cor/forma), ver `preparar_rotulos`, `cortes` e `regras`.
Saída:   public/models/hero_dorian.glb (meshopt + WebP), prévias 512 px em tools/ui-captures/hero-dorian/.

Uso:
  blender -b --factory-startup --python tools/blender/build_hero_dorian.py -- [caminho.fbx] [--no-render] [--sem-avaliacao]
                                                                            [--glb=saida.glb] [--previas=pasta]
Rodar sempre via tools/safe-run.sh (ver CLAUDE.md).

Hierarquia (tipo-base `cavalier` do UnitAnimator, igual à do cavalier.glb: nós planos; o animador trata `cavalier` como `knight` e
balança as quatro patas; o estandarte é filho do Torso e balança por seno, ver UnitAnimator.applyBanner):
  Cavalier (raiz, pés em y=0, frente +Z, origem entre as quatro patas)
  ├─ Horse          corpo, pescoço, cabeça, rabo, barda (TeamColor), arreios e as pernas do cavaleiro abaixo da cintura (estático)
  ├─ HorseLegFL/FR/BL/BR   pivô no corte logo abaixo da barda (as patas são colunas separadas abaixo da bainha)
  ├─ Torso   pivô na cintura   tronco, ombreiras, gola, CAPA longa (TeamColor) e, como filho, o nó `Banner`
  │   └─ Banner   pivô na base da haste   haste, ponta de lança e bandeira (pano em TeamColor)
  ├─ Head    pivô no pescoço   elmo com pluma e rosto (rosto só em +Z)
  ├─ ArmL / ArmR   pivô no corte logo abaixo da ombreira   braço + cotovelo + antebraço com a manopla nas rédeas
  └─ Sword   pivô no punho   a espada embainhada na cintura (+x), repouso x = 0,5 rad / z = -0,1 rad como o cavalier
O modelo não tem rig: cada peça é um corpo rígido cortado por PLANOS e por regiões por cor (capa, bandeira, lâmina). As aberturas de
corte ganham tampa; pescoço, ombros, quadril das patas e cintura ganham ainda um TUBO PROLONGADO para dentro da peça vizinha
(hero_common.prolongar_tampa) que esconde a fresta quando a peça gira ou sobe.
TeamColor: o pano azul-marinho (barda, capa e bandeira) vira cinza no atlas e multiplica a cor do time.
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

NOME = 'hero_dorian'
RAIZ = 'Cavalier'
PREFIXO = 'dorian'
ATLAS_NOME = 'hero_dorian_atlas'
FBX_PADRAO = '/home/rafael/Downloads/Dorian/tripo_convert_cc6904d9-52d9-4c34-bdcc-9af2e134cb30.fbx'
OUT_GLB = os.path.join(REPO, 'public', 'models', 'hero_dorian.glb')
OUT_PREVIAS = os.path.join(REPO, 'tools', 'ui-captures', 'hero-dorian')

# --- constantes do FBX, JÁ GIRADAS (o Tripo olha para -X: x' = z, z' = -x; frente +Z; metros; sem espelho) ---
ESCALA = 2.5           # ponta da lança em 2,50 (o cavalier tem a cabeça em 2,78 e o herói recebe scaleMul 1,3)
X0 = 0.0               # eixo de simetria
Z0 = -0.067            # centro das quatro patas em z (frente 0,155; trás -0,29)
ESPELHAR = False
YL = 0.183             # plano das patas: logo abaixo da bainha da barda
YN = 0.765             # plano do pescoço (abaixo da barba)
YA = 0.683             # plano dos braços (logo abaixo da ombreira)
YB = 0.578             # base do braço (acima da coxa)
YW = 0.575             # plano da cintura
ARM_X = 0.085          # |x| mínimo do braço (o tronco tem meia-largura ≤ 0,075)
SUAVIZACAO = 0
ATLAS = 512
DILATACAO_TIME = 2
PROTECAO_TIME = 2
ZOOM_PREVIA = 0.8
TEAM_DEFAULT = '#1f4ac8'
CABECA = (0.0, 2.07, 0.17)         # centro da cabeça no jogo (prévia do rosto)
SWORD_REST = (0.5, 0.0, -0.1)      # rad; o UnitAnimator força x = 0,5 e z = -0,1 no Sword do cavalier

PECAS = ['Horse', 'HorseLegFL', 'HorseLegFR', 'HorseLegBL', 'HorseLegBR', 'Torso', 'Head', 'ArmL', 'ArmR', 'Sword', 'Banner']
CORPO = PECAS
CAPAS = PECAS
PAIS = {'Banner': 'Torso'}
PECAS_TIME = []
REGIOES_LIVRES = tuple(PECAS)
REPOUSO = {'Sword': tuple(float(np.degrees(a)) for a in SWORD_REST)}
POSES_PREVIA = ('caminhada', 'golpe', 'magia')

# prolongamentos (tubos) das aberturas de corte: peça -> (seleção da tampa, comprimento em metros do FBX, encolhimento)
PROLONGAMENTOS = {
    'Head': ('neck', 0.035, 0.85),
    'ArmL': ('top', 0.04, 0.8), 'ArmR': ('top', 0.04, 0.8),
    'HorseLegFL': ('only', 0.05, 0.8), 'HorseLegFR': ('only', 0.05, 0.8),
    'HorseLegBL': ('only', 0.05, 0.8), 'HorseLegBR': ('only', 0.05, 0.8),
    'Torso': ('waist', 0.04, 0.9),
}

ESTADO = {}            # rótulos por face original (preenchido em ajustar_fonte)


# ---------------------------------------------------------------------------
# Cores da textura (HSV em graus)
# ---------------------------------------------------------------------------
def hsv(c):
    h, s, v = colorsys.rgb_to_hsv(float(c[0]), float(c[1]), float(c[2]))
    return h * 360.0, s, v


def eh_azul(c):
    """Pano azul-marinho (barda, capa, bandeira): saturado e escuro; o aço azulado da armadura é bem menos saturado."""
    h, s, v = hsv(c)
    return 200 <= h <= 235 and s > 0.38 and 0.18 < v < 0.6


def eh_ouro(c):
    h, s, v = hsv(c)
    return 25 <= h <= 52 and s > 0.28 and v > 0.45


def pano_numa_face(ctx, peca, i):
    cores = HC.cores_de_uv(ctx.pixels, ctx.dados[peca]['UV'][i])
    return sum(1 for c in cores if eh_azul(c)) >= 8


def eh_time(ctx, peca, i):
    return peca in ('Horse', 'Torso', 'Banner') and pano_numa_face(ctx, peca, i)


def cor_time(rgb, peca):
    return peca in ('Horse', 'Torso', 'Banner') and eh_azul(rgb)


# ---------------------------------------------------------------------------
# Rotação do FBX (frente -X -> +Z) e rótulos por região (capa, bandeira, espada)
# ---------------------------------------------------------------------------
def girar(a):
    return np.stack([a[:, 2], a[:, 1], -a[:, 0]], axis=1)


def preparar_rotulos(ctx):
    """Rótulos das faces ORIGINAIS que não são cortadas por planos: 1 = capa (vai para o Torso), 2 = Banner (haste, lança, bandeira),
    3 = Sword (lâmina). Regiões em coordenadas do FBX giradas; cor da textura no centro da face."""
    f = ctx.f
    n = len(f.ls)
    tri = f.loop_v[f.ls[:, None] + np.arange(3)]
    if not (f.lt == 3).all():
        raise RuntimeError('malha não é 100 % triangular')
    C = f.co[tri].mean(axis=1)
    uv = f.uv[f.ls[:, None] + np.arange(3)].mean(axis=1)
    h, w, _ = f.pixels.shape
    cor = f.pixels[np.clip((uv[:, 1] * h).astype(int), 0, h - 1), np.clip((uv[:, 0] * w).astype(int), 0, w - 1)]
    hh = np.array([hsv(c) for c in cor])
    H, S, V = hh[:, 0], hh[:, 1], hh[:, 2]
    x, y, z = C[:, 0], C[:, 1], C[:, 2]
    azul = (H > 195) & (H < 245) & (S > 0.35)
    ouro = (H > 28) & (H < 50) & (S > 0.3) & (V > 0.5)
    # estandarte: haste (tubo em torno da reta ponta-base) + bandeira (lâmina fina em x = -0,08 atrás da haste)
    ponta = np.array([-0.0751, 1.0026, -0.3122])
    base = np.array([-0.085, 0.60, -0.19])
    d = ponta - base
    L = float(np.linalg.norm(d))
    d = d / L
    r = C - base
    t = r @ d
    dl = np.linalg.norm(r - np.outer(t, d), axis=1)
    haste = (dl < 0.03) & (t > 0.0) & (t < L + 0.02)
    bandeira = (np.abs(x + 0.08) < 0.05) & (y > 0.69) & (z < -0.215)
    banner = haste | bandeira
    # capa: pano azul/dourado atrás do cavaleiro, dentro do "V" que a bainha dourada desenha de lado (plano z-y)
    def lado(p0, p1):
        return (p1[0] - p0[0]) * (y - p0[1]) - (p1[1] - p0[1]) * (z - p0[0])
    A, B, Cc = (-0.31, 0.51), (-0.20, 0.355), (-0.115, 0.63)
    capa = (azul | ouro) & (z < 0.02) & (y > 0.34) & (y < 0.80) & (lado(A, B) > 0) & (lado(B, Cc) > 0) & ~banner
    # lâmina da espada: aço azulado pouco saturado num tubo em torno do eixo punho-ponta, por fora da capa
    p0 = np.array([0.15, 0.55, -0.045])
    p1 = np.array([0.15, 0.358, -0.228])
    ds = p1 - p0
    Ls = float(np.linalg.norm(ds))
    ds = ds / Ls
    rs = C - p0
    ts = rs @ ds
    dls = np.linalg.norm(rs - np.outer(ts, ds), axis=1)
    espada = (dls < 0.034) & (ts > 0.0) & (ts < Ls + 0.02) & (S < 0.40) & (H > 195) & (H < 240) & ~capa & ~banner
    cod = np.zeros(n, dtype=np.int64)
    cod[capa] = 1
    cod[banner] = 2
    cod[espada] = 3
    ESTADO['cod'] = cod
    ESTADO['pole_t'] = (base, d, L)
    log('rótulos por região: capa %d, banner %d (haste %d), espada %d faces de %d' % (capa.sum(), banner.sum(), haste.sum(), espada.sum(), n))


def ajustar_fonte(ctx):
    """Gira o FBX para a frente ser +Z e calcula os rótulos por região."""
    f = ctx.f
    f.co = girar(f.co)
    f.co_rest = f.co
    f.cn = girar(f.cn)
    f.cn_rest = f.cn
    preparar_rotulos(ctx)


def classificar(sopa, S):
    """Ilha 0 = corpo (cortes planos e regras); 1 = capa -> Torso; 2 = Banner; 3 = Sword (nunca cortados por planos)."""
    cod = ESTADO['cod']
    for fi in range(len(cod)):
        sopa.comp[fi] = int(cod[fi])
    info = {}
    for c in (0, 1, 2, 3):
        idx = [fi for fi in range(len(sopa.fv)) if sopa.comp[fi] == c]
        vs = sorted({v for fi in idx for v in sopa.fv[fi]})
        P = np.array([sopa.P[v] for v in vs])
        info[c] = dict(faces=len(idx), lo=P.min(axis=0), hi=P.max(axis=0))
    return {0: 'corpo', 1: 'Torso', 2: 'Banner', 3: 'Sword'}, info


# ---------------------------------------------------------------------------
# Cortes planos e regras por posição (centroides em coordenadas escaladas -> FBX: x = c0/S, y = c1/S, z = c2/S + Z0)
# ---------------------------------------------------------------------------
def u(c, S):
    return c[0] / S + X0, c[1] / S, c[2] / S + Z0


def zona_pernas(c, S):
    x, y, z = u(c, S)
    return y < 0.30 and abs(x) < 0.16 and (0.04 < z < 0.27 or -0.38 < z < -0.17)


def zona_cabeca(c, S):
    x, y, z = u(c, S)
    return abs(x) < 0.13 and -0.25 < z < 0.12 and 0.70 < y < 0.84


def zona_braco(c, S):
    x, y, z = u(c, S)
    return ARM_X - 0.03 < abs(x) < 0.28 and -0.10 < z < 0.16 and YB - 0.03 < y < YA + 0.04


def zona_cintura(c, S):
    x, y, z = u(c, S)
    return abs(x) < 0.32 and -0.14 < z < 0.14 and YW - 0.03 < y < YW + 0.03


def cortes(S):
    return [
        (1, YL * S, None, lambda c: zona_pernas(c, S)),
        (1, YN * S, None, lambda c: zona_cabeca(c, S)),
        (1, YA * S, None, lambda c: zona_braco(c, S)),
        (1, YB * S, None, lambda c: zona_braco(c, S)),
        (1, YW * S, None, lambda c: zona_cintura(c, S)),
    ]


def regras(ctx, f, c, nome):
    S = ctx.S
    x, y, z = u(c, S)
    # 1. patas: colunas abaixo do plano (quadrantes em torno do centro)
    if y < YL and abs(x) < 0.16 and (0.04 < z < 0.27 or -0.38 < z < -0.17):
        frente = z > 0.0
        return 'HorseLeg' + ('F' if frente else 'B') + ('L' if x < 0 else 'R')
    # 2. cabeça: acima do plano do pescoço, caixa estreita (a pluma pende para trás); as abas douradas da ombreira ficam no Torso
    if y > YN and -0.24 < z < 0.11 and abs(x) < (0.058 if y < 0.83 else 0.09):
        return 'Head'
    # 3. braços: caixa em torno do cotovelo/antebraço, sob o plano da ombreira
    if ARM_X < abs(x) < 0.26 and YB < y < YA and -0.075 < z < 0.133:
        return 'ArmL' if x < 0 else 'ArmR'
    # 4. tronco do cavaleiro acima da cintura
    if y > YW and -0.13 < z < 0.133 and abs(x) < 0.31:
        return 'Torso'
    return 'Horse'


# ---------------------------------------------------------------------------
# Pivôs e prolongamentos
# ---------------------------------------------------------------------------
def _tampa(dados, peca, modo):
    ts = dados[peca]['tampas']
    if not ts:
        raise RuntimeError('%s: sem tampas' % peca)
    if modo == 'only':
        return max(ts, key=lambda t: t['n_arestas'])
    if modo == 'top':
        return max(ts, key=lambda t: t['centro'][1] + 0.001 * t['n_arestas'])
    if modo == 'waist':
        perto = [t for t in ts if abs(t['centro'][1] - YW * ESCALA) < 0.1]
        return max(perto or ts, key=lambda t: t['n_arestas'])
    if modo == 'neck':
        return max(ts, key=lambda t: t['n_arestas'])
    raise ValueError(modo)


def finalizar(ctx):
    S, f, dados = ctx.S, ctx.f, ctx.dados

    def T(p):
        return np.array([(p[0] - X0) * S, p[1] * S, (p[2] - Z0) * S])
    for p in PECAS:
        log('%-10s tampas (centro, nº de arestas, normal): %s' % (p, [(np.round(t['centro'], 2).tolist(), t['n_arestas']) for t in dados[p]['tampas']]))
    # prolongamentos (antes de tirar os pivôs: os vértices ainda estão em coordenadas globais)
    for p, (modo, comp, enc) in PROLONGAMENTOS.items():
        t = _tampa(dados, p, modo)
        n_f = HC.prolongar_tampa(dados[p], t, comp * S, enc)
        log('prolongamento de %s: tampa em %s (%d arestas), tubo de %.3f m, %d faces' % (p, np.round(t['centro'], 3), t['n_arestas'], comp * S, n_f))
    piv = {'Horse': np.zeros(3)}
    for p in ('HorseLegFL', 'HorseLegFR', 'HorseLegBL', 'HorseLegBR'):
        t = _tampa(dados, p, 'only')
        piv[p] = np.round(t['centro'], 3)
    piv['Head'] = np.round(_tampa(dados, 'Head', 'neck')['centro'], 3)
    for p in ('ArmL', 'ArmR'):
        piv[p] = np.round(_tampa(dados, p, 'top')['centro'], 3)
    piv['Torso'] = np.round(_tampa(dados, 'Torso', 'waist')['centro'] * np.array([0.0, 1.0, 1.0]), 3)
    log('pivô do Torso na cintura: %s' % piv['Torso'])
    # banner: pivô na base da haste
    base, d, L = ESTADO['pole_t']
    piv['Banner'] = np.round(T(base), 3)
    # espada: pivô no ponto mais alto da lâmina (perto do punho); geometria girada pelo INVERSO do repouso do nó, para que a pose de
    # repouso (nó com SWORD_REST) devolva a forma do FBX
    W = dados['Sword']
    topo = W['V'][np.argmax(W['V'][:, 1])]
    piv['Sword'] = np.round(topo, 3)
    rx = rot_eixo((1, 0, 0), np.degrees(SWORD_REST[0]))
    rz = rot_eixo((0, 0, 1), np.degrees(SWORD_REST[2]))
    R = rx @ rz                                          # Euler XYZ do three.js: Rx · Ry · Rz
    W['V'] = (W['V'] - piv['Sword']) @ R + piv['Sword']      # v' = R^T v
    W['N'] = [[R.T @ n for n in nn] for nn in W['N']]
    for p in PECAS:
        log('pivô %-10s %s' % (p, piv[p]))
    for p in PECAS:
        dados[p]['V'] = dados[p]['V'] - piv[p]
    return piv


def poses():
    """Poses do UnitAnimator para `cavalier` (rad): o animador usa o ramo do `knight`; galope das pernas do cavalo em applyWalk."""
    sw = 0.55
    g = 0.7
    sr = SWORD_REST
    return {
        'repouso': {'Sword': sr},
        'caminhada': {'HorseLegFL': (g, 0, 0), 'HorseLegBR': (g, 0, 0), 'HorseLegFR': (-g, 0, 0), 'HorseLegBL': (-g, 0, 0),
                      'ArmL': (-sw, 0, -0.05), 'ArmR': (sw, 0, 0.05), 'Torso': (0.05, 0.08, 0.0), 'Sword': (sr[0] + sw * 0.4, 0, sr[2])},
        'golpe': {'Torso': (0, -0.5, 0), 'ArmR': (-1.15, -0.4, 0.0), 'Sword': (-0.3, 0, -0.1), 'Head': (0, 0.2, 0)},
        'magia': {'ArmL': (-2.3, 0, -0.25), 'ArmR': (-2.3, 0, 0.25), 'Torso': (-0.12, 0, 0), 'Head': (-0.25, 0, 0), 'Sword': sr},
    }


def previa_extra(ctx, rig, objs):
    """Conferência: caminhada, golpe e magia vistos de lado e de trás; closeups de ombros, pescoço, cintura e patas (frestas)."""
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

    def foco(nome, direcao, alvo, dist, fov=20):
        centro = rig.center.copy()
        rig.center = Vector((alvo[0], -alvo[2], alvo[1]))
        rig.render(nome, direcao, fov, dist=dist)
        rig.center = centro
    for nome in ('caminhada', 'golpe', 'magia'):
        aplicar(nome)
        rig.render('pose_%s_lado' % nome, (1.0, 0.2, 0.0), 30, zoom=0.8)
        rig.render('pose_%s_costas' % nome, (-0.4, 0.3, -1.0), 30, zoom=0.8)
    # closeups (repouso e poses)
    aplicar(None)
    foco('cu_ombros_idle', (-0.8, 0.35, 1.0), (0.0, 1.7, 0.1), 3.2)
    foco('cu_ombro_lado_idle', (1.0, 0.25, 0.3), (0.3, 1.7, 0.05), 2.6)
    foco('cu_cintura_idle', (1.0, 0.15, 0.2), (0.0, 1.45, 0.0), 3.0)
    aplicar('caminhada')
    foco('cu_ombro_caminhada', (1.0, 0.25, 0.3), (0.3, 1.7, 0.05), 2.6)
    foco('cu_ombro_caminhada_f', (-0.8, 0.35, 1.0), (0.0, 1.7, 0.1), 3.2)
    foco('cu_cintura_caminhada', (1.0, 0.15, 0.2), (0.0, 1.45, 0.0), 3.0)
    foco('cu_patas_caminhada', (1.0, 0.15, 0.3), (0.0, 0.5, 0.0), 4.5)
    foco('cu_patas_caminhada_f', (-0.5, 0.2, 1.0), (0.0, 0.5, 0.5), 3.5)
    aplicar('golpe')
    foco('cu_ombro_golpe', (1.0, 0.25, 0.3), (0.3, 1.7, 0.05), 2.6)
    foco('cu_cintura_golpe', (1.0, 0.15, 0.2), (0.0, 1.45, 0.0), 3.0)
    foco('cu_ombro_golpe_f', (-0.8, 0.35, 1.0), (0.0, 1.7, 0.1), 3.2)
    aplicar('magia')
    foco('cu_ombro_magia', (-0.8, 0.35, 1.0), (0.0, 1.7, 0.1), 3.2)
    aplicar(None)
    antes = HC.colorir_pecas(objs)
    rig.render('pecas_costas', (1.0, 0.8, -1.0), 30, zoom=0.8)
    rig.render('pecas_lado', (1.0, 0.1, 0.0), 30, zoom=0.8)
    rig.render('pecas_frente', (-1.0, 0.5, 1.0), 30, zoom=0.8)
    foco('cu_pecas_tronco', (-1.0, 0.5, 1.0), (0.0, 1.7, 0.0), 4.0, 25)
    HC.restaurar_materiais(objs, antes)
    centro = rig.center.copy()
    rig.center = Vector((0.0, 0.0, 1.4))
    rig.render('cabeca_pecas', (0.0, 0.1, 1.0), 20, dist=2.4)
    rig.center = centro


def main():
    HC.executar(sys.modules[__name__])


if __name__ == '__main__':
    main()
