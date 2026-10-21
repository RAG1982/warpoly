"""
build_archer_v2.py — Arqueiro humano v2 (archer_v2): modelo do Tripo finalizado no Blender (M2-31).

Só constantes e ganchos do arqueiro; todo o resto vive em tools/blender/hero_common.py (como Oren/Drogath/Skarn).

Entrada: FBX do Tripo (1 malha de 19,6 mil triângulos, UMA ilha só — arco, corda e aljava soldados —, rig Mixamo de 65 ossos sem
         ações, T-pose, textura 512²; frente em -Y do Blender; arco na mão ESQUERDA anatômica).
Saída:   public/models/archer_v2.glb (meshopt + WebP), prévias 512 px em tools/ui-captures/archer-v2/.

Uso:
  blender -b --factory-startup --python tools/blender/build_archer_v2.py -- [caminho.fbx] [--no-render] [--sem-avaliacao]
                                                                          [--glb=saida.glb] [--previas=pasta]
Rodar sempre via tools/safe-run.sh (ver CLAUDE.md).

MÃO DO ARCO (decisão M2-31): o jogo põe o arco em `ArmL` (lado -x; o animador levanta o ArmL e puxa a corda com o ArmR, igual ao
archer.glb antigo). O hero_common ESPELHA a malha em x (como no Brann/Oren): o braço esquerdo do FBX (que segura o arco, em +x
antes do espelho) vira o `ArmL` em -x, sem trocar o código do animador nem as poses de disparo. Efeito colateral aceito: como em
todos os heróis, o emblema do tabardo fica espelhado.

Hierarquia (tipo-base `archer` do UnitAnimator; ForeArmL é novo: sem ele o antebraço sobe junto com o ArmL no disparo):
  Archer (raiz, pés em y=0, frente +Z)
  ├─ Torso   pivô (0, 1.05, 0)   gibão, tabardo (TeamColor), cinto, bolsas, aljava com flechas nas costas, ombros e gola
  ├─ Head    pivô no pescoço     capuz e rosto (só em +Z)
  ├─ ArmL    pivô no ombro (-x)  ombreira e braço do arco até o cotovelo
  │   └─ ForeArmL  pivô no cotovelo   antebraço, luva e mão (o UnitAnimator contra-gira o ForeArmL no disparo: braço do arco reto)
  │       └─ Bow   pivô no ENCAIXE (nock: centro da corda, logo acima do punho); arco em pé, barriga para +Z, corda no plano z=0
  │           ├─ BowTipTop / BowTipBottom (empties nas pontas: ModelFactory.rebindUserData usa como extremidades da corda)
  │           ├─ BowStringTop / BowStringBottom (cilindros de altura 1, centrados; o updateBowString os posiciona a cada quadro)
  │           └─ DrawnArrow  origem = encaixe da flecha; haste ao longo de +Z (aparece no disparo)
  ├─ ArmR    pivô no ombro (+x)  braço que puxa a corda (braço inteiro; mão aberta)
  └─ LegL / LegR  pivô sob a barra do gibão   botas e o trecho de calça
O FBX está em T-pose: os braços são REPOSADOS pelo rig (hero_common.reposar) antes de cortar: o braço esquerdo desce e o antebraço
vai para a frente com a mão em guinada (o punho continua em torno do arco vertical); o direito desce reto.
TeamColor: o tabardo azul (faces cuja cor da textura é azul, no tronco, abaixo do pescoço) vira cinza no atlas e multiplica a cor do time.
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

NOME = 'archer_v2'
RAIZ = 'Archer'
PREFIXO = 'archer_v2'
ATLAS_NOME = 'archer_v2_atlas'
FBX_PADRAO = ('/home/rafael/Downloads/medieval+archer+3d+model/'
              'tripo_convert_2e3c6f08-fce9-4121-baaf-2638322ee719.fbx')
OUT_GLB = os.path.join(REPO, 'public', 'models', 'archer_v2.glb')
OUT_PREVIAS = os.path.join(REPO, 'tools', 'ui-captures', 'archer-v2')

# --- constantes do FBX (metros; x direita do mundo, y cima, z frente; antes do espelho em x) ---
ESCALA = 2.35          # topo do capuz (0,745 no FBX) -> ~1,75 (o arco do FBX é mais alto que a cabeça: o bbox não serve para a escala)
X0 = 0.033             # eixo de simetria (quadris)
Z0 = 0.055             # centro dos pés em z
ANG_BRACO_L = 62.0     # abdução do braço do arco (graus abaixo da horizontal da T-pose)
ANG_BRACO_R = 70.0
GUINADA_L = 68.0       # guinada do antebraço esquerdo (graus; 90 = reto para a frente): mão à frente-fora, arco em pé
OMBRO_X = 0.12         # |x - X0| do ombro: plano de corte do braço (perpendicular ao eixo de giro x)
OMBRO_Y = 0.56         # acima disso (no FBX) o plano x = ±OMBRO_X separa braço e tronco
PESCOCO_Y = 0.633      # plano horizontal cabeça/tronco
Y_PERNA = 0.225        # plano das pernas: entre a barra do gibão (0,246) e o topo das botas (0,194)
TABARDO_DX = 0.075     # tabardo: |x - X0| < 0,075 e à frente
ARCO_X = 0.425         # arco: x do FBX (T-pose) acima deste valor, fora a pele da mão
CORDA_X = (0.358, 0.388)   # x (T-pose) da corda
QUIVER_Z = -0.075        # z (T-pose) atrás do qual, no lado direito do FBX, está a aljava
SUAVIZACAO = 5
ATLAS = 512
DILATACAO_TIME = 2
PROTECAO_TIME = 2
ZOOM_PREVIA = 0.85
TEAM_DEFAULT = '#2b5cb4'   # azul do tabardo (multiplica o cinza do atlas)
CABECA = (0.0, 1.60, 0.0)
OFFSET_FLECHA = 0.05       # a flecha passa ao lado do arco, para o lado do corpo (+x), como no archer.glb antigo

PECAS = ['Torso', 'Head', 'ArmL', 'ForeArmL', 'ArmR', 'ForeArmR', 'LegL', 'LegR', 'Bow', 'BowStringTop', 'BowStringBottom']
CORPO = ['Torso', 'Head', 'ArmL', 'ArmR', 'LegL', 'LegR']     # rótulos vindos dos pesos de pele
CAPAS = ['Torso', 'Head', 'ArmL', 'ForeArmL', 'ArmR', 'ForeArmR', 'LegL', 'LegR']
PAIS = {'ForeArmL': 'ArmL', 'ForeArmR': 'ArmR', 'Bow': 'ForeArmL', 'BowStringTop': 'Bow', 'BowStringBottom': 'Bow'}
PECAS_TIME = []
REGIOES_LIVRES = ()
POSES_PREVIA = ('caminhada', 'golpe')

HC.CORES_PECAS.update({'ForeArmL': '#88ee44', 'ForeArmR': '#ff9999', 'Bow': '#4a5cff', 'BowStringTop': '#ffffff', 'BowStringBottom': '#ffff00',
                       'DrawnArrow': '#ff8800'})

# repose por rig (rotações absolutas em coordenadas do jogo, antes do espelho; o resto herda do pai)
POSE = {
    'RightArm': rot_eixo((0, 0, 1), ANG_BRACO_R),
    'LeftArm': rot_eixo((0, 0, 1), -ANG_BRACO_L),
    'LeftForeArm': rot_eixo((0, 1, 0), -GUINADA_L),
    'LeftHand': rot_eixo((0, 1, 0), -GUINADA_L),
}

ESTADO = {}     # valores calculados em ajustar_fonte (coordenadas finais) para os cortes e as regras


def hsv(c):
    h, s, v = colorsys.rgb_to_hsv(float(c[0]), float(c[1]), float(c[2]))
    return h * 360.0, s, v


def eh_pele(c):
    h, s, v = hsv(c)
    return (h <= 35 or h >= 345) and 0.15 <= s <= 0.6 and v > 0.55


def eh_azul(c):
    h, s, v = hsv(c)
    return 205 <= h <= 250 and s > 0.45 and 0.25 < v < 0.85


def eh_corda(c):
    h, s, v = hsv(c)
    return s < 0.35 and 0.35 < v < 0.9


def T(p, S):
    """Ponto do FBX (jogo, antes do espelho) -> coordenadas finais."""
    return np.array([-(p[0] - X0) * S, p[1] * S, (p[2] - Z0) * S])


def avaliar_fonte_extra(f):
    lo, hi = f.co.min(axis=0), f.co.max(axis=0)
    log('--- AVALIAÇÃO: escala, eixo, origem ---')
    log('  bbox (x, y-cima, z) do FBX já reposado: x [%.3f, %.3f] y [%.4f, %.4f] z [%.3f, %.3f]' %
        (lo[0], hi[0], lo[1], hi[1], lo[2], hi[2]))
    pe = f.co_rest[f.co_rest[:, 1] < 0.04]
    log('  pés (T-pose): x [%.3f, %.3f] z [%.3f, %.3f] -> centro z = %.3f (Z0 = %.3f), centro x = %.3f (X0 = %.3f)' %
        (pe[:, 0].min(), pe[:, 0].max(), pe[:, 2].min(), pe[:, 2].max(), (pe[:, 2].min() + pe[:, 2].max()) / 2, Z0,
         (pe[:, 0].min() + pe[:, 0].max()) / 2, X0))
    for b in ('Hips', 'Head', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightArm', 'RightHand'):
        log('  osso %-12s repouso %s  reposado %s' % (b, np.round(f.pos_ossos[b], 3), np.round(f.pos_pose[b], 3)))


def ajustar_fonte(ctx):
    """Cotovelo (ponto e normal do plano oblíquo) e altura do punho no sistema final."""
    f, S = ctx.f, ESCALA
    ombro, cot, mao = (T(f.pos_pose[b], S) for b in ('LeftArm', 'LeftForeArm', 'LeftHand'))
    u = (cot - ombro) / np.linalg.norm(cot - ombro)
    a = (mao - cot) / np.linalg.norm(mao - cot)
    n = u + a
    n /= np.linalg.norm(n)
    cot_r = T(f.pos_pose['RightForeArm'], S)
    ESTADO.update(cotovelo=cot, normal=n, mao=mao, ombro=ombro, u=u, a=a, cotovelo_r=cot_r)
    log('cotovelo direito (final) %s' % np.round(cot_r, 3))
    log('cotovelo (final) %s, ombro %s, mão %s, ângulo do cotovelo %.1f°, normal do plano %s' %
        (np.round(cot, 3), np.round(ombro, 3), np.round(mao, 3), np.degrees(np.arccos(np.clip(u @ a, -1, 1))), np.round(n, 3)))


def classificar(sopa, S):
    """Uma ilha só: tudo é 'corpo' (arco, corda, aljava e botas saem por regras de rótulo)."""
    vs = sorted({v for fv in sopa.fv for v in fv})
    P = np.array([sopa.P[v] for v in vs])
    return {0: 'corpo'}, {0: dict(faces=len(sopa.fv), lo=P.min(axis=0), hi=P.max(axis=0))}


def cortes(S):
    """Plano do pescoço, planos verticais dos ombros, plano horizontal das pernas e plano oblíquo do cotovelo esquerdo."""
    cot, n = ESTADO['cotovelo'], ESTADO['normal']
    perto = (lambda c: float(np.linalg.norm(c - cot)) < 0.2 and c[0] < -0.1 * S)
    cot_r = ESTADO['cotovelo_r']
    perto_r = (lambda c: float(np.linalg.norm(c - cot_r)) < 0.2 and c[0] > 0.1 * S)
    return [(1, float(cot_r[1]), None, perto_r), (1, PESCOCO_Y * S, None), (0, OMBRO_X * S, (OMBRO_Y - 0.06) * S), (0, -OMBRO_X * S, (OMBRO_Y - 0.06) * S),
            (1, Y_PERNA * S, None), ((n, float(n @ cot)), 0.0, None, perto)]


def regras(ctx, f, c, nome):
    sopa, S = ctx.sopa, ctx.S
    vs = [v for v in sopa.fv[f] if v < sopa.n_orig]
    cor = cor_da_face(sopa, ctx.pixels, f)
    if len(vs) >= 2:
        r = ctx.f.co_rest[vs].mean(axis=0)               # posição de repouso (T-pose, FBX)
        # corda: faixa fina e clara no plano do arco
        if CORDA_X[0] <= r[0] <= CORDA_X[1] and r[1] > 0.30 and eh_corda(cor) and not eh_pele(cor):
            return 'BowStringTop' if c[1] > ESTADO['mao'][1] else 'BowStringBottom'
        if r[0] > ARCO_X and not eh_pele(cor):
            return 'Bow'
        # aljava (e as flechas) nas costas: parte do Torso (nada de ArmR/Head, embora fique sobre o ombro direito)
        if r[2] < QUIVER_Z and 0.45 < r[1] < 0.95 and r[0] < X0:
            return 'Torso'
    yf = c[1] / S
    dxf = abs(c[0]) / S
    zf = c[2] / S + Z0
    lado_r = c[0] > 0
    if nome in ('LegL', 'LegR'):
        if yf >= Y_PERNA:
            nome = 'Torso'
        else:
            tabardo = dxf < TABARDO_DX and zf > 0.0 and 0.1 < yf
            nome = 'Torso' if tabardo else ('LegR' if lado_r else 'LegL')
    elif nome == 'Torso' and yf < Y_PERNA and not (dxf < TABARDO_DX and zf > 0.0):
        nome = 'LegR' if lado_r else 'LegL'
    if yf >= PESCOCO_Y - 1e-6 and nome in ('Torso', 'Head'):
        return 'Head'
    if nome == 'Head':
        return 'Torso'                                    # pano do capuz que desce até os ombros
    if nome in ('Torso', 'ArmL', 'ArmR') and yf >= OMBRO_Y:
        nome = ('ArmR' if lado_r else 'ArmL') if dxf >= OMBRO_X else 'Torso'
    if nome == 'ArmL' and float(ESTADO['normal'] @ (c - ESTADO['cotovelo'])) > 0:
        return 'ForeArmL'
    if nome == 'ArmR' and c[1] < ESTADO['cotovelo_r'][1]:
        return 'ForeArmR'
    return nome


def eh_time(ctx, peca, i):
    if peca != 'Torso':
        return False
    # só a face INTEIRA em azul, no tronco, abaixo da gola (o capuz e a gola azul-escuros ficam com a cor original)
    d = ctx.dados[peca]
    if not all(eh_azul(c) for c in HC.cores_de_uv(ctx.pixels, d['UV'][i])):
        return False
    return float(d['V'][d['F'][i]][:, 1].mean()) < 0.585 * ESCALA


def cor_time(rgb, peca):
    return peca == 'Torso' and eh_azul(rgb)


def sintetizar_cilindro(raio, lados, uv):
    """Cilindro unitário (altura 1, centrado, eixo y) com todos os cantos no mesmo ponto da textura (cor da corda)."""
    V, F, UV, N = [], [], [], []
    for k in range(lados):
        a = 2 * np.pi * k / lados
        V += [np.array([raio * np.cos(a), -0.5, raio * np.sin(a)]), np.array([raio * np.cos(a), 0.5, raio * np.sin(a)])]
    for k in range(lados):
        k2 = (k + 1) % lados
        F.append([2 * k, 2 * k + 1, 2 * k2 + 1, 2 * k2])
        am = 2 * np.pi * (k + 0.5) / lados
        n = np.array([np.cos(am), 0.0, np.sin(am)])
        # enrolamento: (x,z) cresce com o ângulo; a normal geométrica de (v0,v1,v2) aponta para fora
        N.append([n, n, n, n])
        UV.append([np.array(uv)] * 4)
    return dict(V=np.array(V), F=F, UV=UV, N=N, tampas=[], n_orig=0, time=[False] * len(F))


def finalizar(ctx):
    """Pivôs, arco nivelado e virado (barriga para +z), cordas sintéticas e vértices em coordenadas locais. Devolve {peça: pivô}."""
    S, f, dados, sopa = ctx.S, ctx.f, ctx.dados, ctx.sopa
    px = OMBRO_X * S
    piv = {'Torso': np.array([0.0, 1.05, 0.0])}
    h = T(f.pos_pose['Head'], S)
    piv['Head'] = np.array([0.0, round(float(h[1]), 2), round(float(h[2]), 2)])
    for p, sinal in (('ArmL', -1.0), ('ArmR', 1.0)):
        t = max(dados[p]['tampas'], key=lambda t: t['n_arestas'])        # a maior abertura de corte é a do ombro
        c = t['centro']
        piv[p] = np.array([sinal * round(px, 3), round(float(c[1]), 3), round(float(c[2]), 3)])
        log('ombro %s: seção de %d arestas, pivô %s' % (p, t['n_arestas'], piv[p]))
    cot = ESTADO['cotovelo']
    tampas = [t for t in dados['ForeArmL']['tampas'] if np.linalg.norm(t['centro'] - cot) < 0.2]
    t = max(tampas, key=lambda t: t['n_arestas'])
    piv['ForeArmL'] = np.round(t['centro'], 3)
    log('cotovelo: %d tampas, seção de %d arestas, pivô %s (osso %s)' % (len(tampas), t['n_arestas'], piv['ForeArmL'], np.round(cot, 3)))
    cot_r = ESTADO['cotovelo_r']
    tampas = [t for t in dados['ForeArmR']['tampas'] if np.linalg.norm(t['centro'] - cot_r) < 0.2]
    t = max(tampas, key=lambda t: t['n_arestas'])
    piv['ForeArmR'] = np.round(t['centro'], 3)
    log('cotovelo direito: %d tampas, seção de %d arestas, pivô %s (osso %s)' % (len(tampas), t['n_arestas'], piv['ForeArmR'], np.round(cot_r, 3)))
    for p in ('LegL', 'LegR'):
        tp = sorted(dados[p]['tampas'], key=lambda t: -t['n_arestas'])
        piv[p] = np.round(tp[0]['centro'], 3)
        log('barra %s: %d tampas, pivô %s' % (p, len(tp), piv[p]))

    # --- arco: corda (extremidades e plano), nivelamento, guinada ---
    corda = np.concatenate([dados['BowStringTop']['V'], dados['BowStringBottom']['V']])
    topo = corda[np.argmax(corda[:, 1])]
    base = corda[np.argmin(corda[:, 1])]
    eixo = topo - base
    inclin = float(np.degrees(np.arccos(abs(eixo[1]) / np.linalg.norm(eixo))))
    log('corda: %d vértices, pontas y %.3f / %.3f, inclinação da corda %.2f°' % (len(corda), topo[1], base[1], inclin))
    V = dados['Bow']['V']
    G = np.array([ESTADO['mao'][0], ESTADO['mao'][1], ESTADO['mao'][2]])      # punho (osso da mão, no sistema final)
    # empunhadura = ponto do arco mais próximo do punho (eixo da haste)
    perto = V[np.linalg.norm(V - G, axis=1) < 0.12]
    if len(perto):
        G = perto.mean(axis=0)
    cm = corda.mean(axis=0)
    barriga = np.array([G[0] - cm[0], 0.0, G[2] - cm[2]])
    comp = float(np.linalg.norm(barriga))
    barriga /= comp
    ang = float(np.degrees(np.arctan2(barriga[0], barriga[2])))            # giro em y para barriga -> +z
    # nivelar (corda vertical) e girar em torno da vertical da empunhadura
    eixo_n = eixo / np.linalg.norm(eixo)
    nivel = rot_eixo(np.cross(eixo_n, [0.0, 1.0, 0.0]), inclin) if inclin > 1e-3 else np.eye(3)
    giro = rot_eixo((0, 1, 0), ang)                                         # Rodrigues: +graus gira x para -z; confira no log
    R = giro @ nivel
    if abs((R @ np.array([barriga[0], 0, barriga[2]]))[2] - 1.0) > 1e-3:
        R = rot_eixo((0, 1, 0), -ang) @ nivel
    log('arco: empunhadura %s, corda a %.3f atrás, barriga %s -> +z (giro %.1f°, nivelamento %.2f°)' %
        (np.round(G, 3), comp, np.round(barriga, 3), ang, inclin))
    for p in ('Bow', 'BowStringTop', 'BowStringBottom'):
        dados[p]['V'] = (dados[p]['V'] - G) @ R.T + G
        dados[p]['N'] = [[R @ n for n in nn] for nn in dados[p]['N']]
    corda2 = (corda - G) @ R.T + G
    z_corda = float(corda2[:, 2].mean())
    topo2 = (topo - G) @ R.T + G
    base2 = (base - G) @ R.T + G
    # encaixe (nock): sobre o punho (a flecha repousa logo acima do punho), no plano da corda
    VB = dados['Bow']['V']
    mao_alta = VB[np.linalg.norm(VB[:, [0, 2]] - G[[0, 2]], axis=1) < 0.1]
    y_nock = float(G[1] + 0.10)
    nock = np.array([G[0], y_nock, z_corda])
    piv['Bow'] = np.round(nock, 3)
    log('encaixe (nock) %s; pontas da corda: topo %s base %s (relativas: %.3f / %.3f)' %
        (piv['Bow'], np.round(topo2, 3), np.round(base2, 3), topo2[1] - y_nock, base2[1] - y_nock))
    ESTADO['pontas'] = (float(topo2[1] - y_nock), float(base2[1] - y_nock))
    # textura: ponto da cor da corda (média das UV das faces da corda) e da madeira/aço (para a flecha)
    uvs = [np.mean(sopa.fuv[fa], axis=0) for fa in ctx.partes['BowStringTop'] + ctx.partes['BowStringBottom']]
    ESTADO['uv_corda'] = tuple(np.mean(uvs, axis=0))
    mad, aco = [], []
    for fa in ctx.partes['Bow']:
        cor = cor_da_face(sopa, ctx.pixels, fa)
        h_, s_, v_ = hsv(cor)
        if 15 <= h_ <= 35 and 0.4 <= s_ <= 0.8 and 0.25 <= v_ <= 0.5:
            mad.append(np.mean(sopa.fuv[fa], axis=0))
        if s_ < 0.15 and v_ > 0.55:
            aco.append(np.mean(sopa.fuv[fa], axis=0))
    ESTADO['uv_madeira'] = tuple(np.median(mad, axis=0)) if mad else ESTADO['uv_corda']
    ESTADO['uv_aco'] = tuple(np.median(aco, axis=0)) if aco else ESTADO['uv_corda']
    log('UV: corda %s madeira %s (%d faces) aço %s (%d faces)' % (np.round(ESTADO['uv_corda'], 3), np.round(ESTADO['uv_madeira'], 3),
                                                                  len(mad), np.round(ESTADO['uv_aco'], 3), len(aco)))
    # cordas sintéticas (cilindros unitários): o updateBowString as posiciona, escala e gira a cada quadro
    for nome in ('BowStringTop', 'BowStringBottom'):
        dados[nome] = sintetizar_cilindro(0.007, 4, ESTADO['uv_corda'])
        sinal = 1.0 if nome == 'BowStringTop' else -1.0
        piv[nome] = np.array([nock[0], nock[1] + sinal * 0.25, nock[2]])
    for p in PECAS:
        if p in ('BowStringTop', 'BowStringBottom'):
            continue                                        # cilindros sintéticos já são locais (centrados na origem)
        dados[p]['V'] = dados[p]['V'] - piv[p]
    # dados para calibrar o disparo (UnitAnimator): mão da corda (ArmR) e encaixe, no sistema do jogo
    Vr = dados['ForeArmR']['V']
    ponta = Vr[Vr[:, 1] < np.percentile(Vr[:, 1], 3)].mean(axis=0)
    palma = Vr[(Vr[:, 1] < np.percentile(Vr[:, 1], 25)) & (Vr[:, 1] > np.percentile(Vr[:, 1], 5))].mean(axis=0)
    log('IK: ArmR pivô %s; ForeArmR pivô rel. %s, pontas dos dedos (locais ao ForeArmR) %s, palma %s; ArmL pivô %s; ForeArmL pivô rel. %s; Bow pivô rel. %s' %
        (np.round(piv['ArmR'], 3), np.round(piv['ForeArmR'] - piv['ArmR'], 3), np.round(ponta, 3), np.round(palma, 3),
         np.round(piv['ArmL'], 3), np.round(piv['ForeArmL'] - piv['ArmL'], 3), np.round(piv['Bow'] - piv['ForeArmL'], 3)))
    return piv


def poses():
    """Poses do UnitAnimator para o tipo `archer` (preview): o ForeArmL contra-gira o ArmL no disparo; a flecha só no 'golpe'."""
    sw = 0.55
    return {
        'repouso': {},
        'caminhada': {'LegL': (0.65, 0, 0), 'LegR': (-0.65, 0, 0), 'ArmL': (-sw, 0, -0.05), 'ArmR': (sw, 0, 0.05),
                      'Torso': (0.05, 0.08, 0.0)},
        'golpe': {'Torso': (0.05, 0.6, 0), 'Head': (0, -0.45, 0), 'ArmL': (-1.45, 0.18, -0.05), 'ForeArmL': (1.45, -0.18, 0.05),
                  'Bow': (0, 0, -0.1), 'ArmR': (-1.33, -0.22, -0.92), 'ForeArmR': (-1.7, 0, 0)},
        'magia': {},
    }


def materiais_extra(ctx, objs):
    """Flecha armada (DrawnArrow) e extremidades da corda (BowTipTop/Bottom): feitas aqui, com UV nos pontos de cor da textura."""
    import bpy
    import common as C
    bow = objs['Bow']
    mat = bow.data.materials[0]

    def malha(nome, verts, faces, uvs):
        me = bpy.data.meshes.new(nome)
        me.from_pydata([tuple(C.g(*v)) for v in verts], [], faces)
        me.update()
        uvl = me.uv_layers.new(name='UVMap')
        for poly in me.polygons:
            for li in poly.loop_indices:
                uvl.data[li].uv = uvs[poly.index]
        me.polygons.foreach_set('use_smooth', [False] * len(me.polygons))
        me.materials.append(mat)
        o = bpy.data.objects.new(nome, me)
        bpy.context.scene.collection.objects.link(o)
        o.parent = bow
        return o

    # flecha ao longo de +z a partir do encaixe, deslocada em x para passar ao lado do arco
    V, F, U = [], [], []
    ox = OFFSET_FLECHA
    r, comp, ponta = 0.011, 0.80, 0.10
    uv_m, uv_a = ESTADO['uv_madeira'], ESTADO['uv_aco']
    n = 6

    def anel(z, raio):
        base = len(V)
        for k in range(n):
            a = 2 * np.pi * k / n
            V.append((ox + raio * np.cos(a), raio * np.sin(a), z))
        return base
    a0, a1 = anel(0.0, r), anel(comp, r)
    for k in range(n):
        k2 = (k + 1) % n
        F.append([a0 + k, a0 + k2, a1 + k2, a1 + k])
        U.append(uv_m)
    cone = anel(comp, 0.028)
    pt = len(V)
    V.append((ox, 0.0, comp + ponta))
    for k in range(n):
        k2 = (k + 1) % n
        F.append([cone + k, cone + k2, pt])
        U.append(uv_a)
    for k in range(3):      # penas: 3 palhetas em triângulo na ponta traseira
        a = 2 * np.pi * k / 3
        dx, dy = np.cos(a), np.sin(a)
        b = len(V)
        V += [(ox, 0.0, 0.02), (ox + dx * 0.05, dy * 0.05, 0.02), (ox + dx * 0.05, dy * 0.05, 0.17), (ox, 0.0, 0.14)]
        F.append([b, b + 1, b + 2, b + 3])
        U.append(uv_a)
        F.append([b + 3, b + 2, b + 1, b])
        U.append(uv_a)
    seta = malha('DrawnArrow', V, F, U)
    seta.location = C.g(0, 0, 0)
    seta.hide_render = True                  # a flecha só aparece no disparo (o animador a esconde em repouso)
    topo, base = ESTADO['pontas']
    C.make_empty('BowTipTop', (0, topo, 0.0), parent=bow)
    C.make_empty('BowTipBottom', (0, base, 0.0), parent=bow)
    ctx.seta = seta


def previa_extra(ctx, rig, objs):
    """Conferência: o disparo visto de frente, do lado e de cima (com a flecha) e a mão do arco de perto."""
    import bpy
    import common as C
    from mathutils import Vector
    todas = poses()
    for p in PECAS:
        HC.rot_three(C, objs[p], 0, 0, 0)
    for p, (rx, ry, rz) in todas['golpe'].items():
        HC.rot_three(C, objs[p], rx, ry, rz)
    seta = bpy.data.objects['DrawnArrow']
    seta.hide_render = False
    seta.location = C.g(0, 0, -0.32)
    for nome, d in (('frente', (0.0, 0.25, 1.0)), ('lado', (1.0, 0.2, 0.0)), ('3q', (-1.0, 0.8, 1.0)), ('cima', (0.0, 1.0, 0.1))):
        rig.render('disparo_' + nome, d, 30, zoom=0.7)
    seta.location = C.g(0, 0, 0)
    seta.hide_render = True
    for p in PECAS:
        HC.rot_three(C, objs[p], 0, 0, 0)
    antes = HC.colorir_pecas(objs)
    rig.render('pecas_dir', (1.0, 0.3, 0.5), 30, zoom=0.7)
    rig.render('pecas_costas', (0.0, 0.3, -1.0), 30, zoom=0.7)
    rig.render('pecas_frente', (0.0, 0.3, 1.0), 30, zoom=0.7)
    centro = rig.center.copy()
    rig.center = Vector((-0.45, 0.0, 1.2))
    rig.render('arco_pecas', (-1.0, 0.3, 1.0), 20, dist=3.0)
    rig.center = centro
    HC.restaurar_materiais(objs, antes)
    rig.center = Vector((-0.45, 0.0, 1.2))
    rig.render('arco_mao', (-1.0, 0.3, 1.0), 20, dist=3.0)
    rig.center = centro


def main():
    HC.executar(sys.modules[__name__])


if __name__ == '__main__':
    main()
