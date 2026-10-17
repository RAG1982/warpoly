"""
build_hero_brann.py — Capitão Brann (hero_brann): herói humano gerado a partir do cavaleiro modelado no Tripo.
(M2-21: a parte genérica do pipeline vive em tools/blender/hero_common.py; aqui ficam só as constantes e as regras do Brann.)

Entrada: FBX do Tripo (malha única de ~10 mil triângulos + rig Mixamo de 65 ossos + textura externa JPG 4096²).
Saída : public/models/hero_brann.glb (meshopt + WebP), prévias 512 px em tools/ui-captures/hero-brann/.

Uso:
  blender -b --factory-startup --python tools/blender/build_hero_brann.py -- [caminho.fbx] [--no-render] [--sem-avaliacao]
                                                                           [--glb=saida.glb] [--previas=pasta]

  caminho.fbx       opcional; padrão: ~/Downloads/medieval+knight+3d+model/tripo_convert_4dcab188-....fbx
  --no-render       não gera as prévias
  --sem-avaliacao   não imprime a avaliação do FBX (textura, UV, capa, martelo, rosto, escala)
  --glb=            outro caminho para o .glb (padrão public/models/hero_brann.glb)
  --previas=        outra pasta para as prévias (padrão tools/ui-captures/hero-brann/)
Rodar sempre via tools/safe-run.sh (ver CLAUDE.md). Textura: o Blender acha o JPG pela pasta *.fbm ao lado do FBX.

Hierarquia PLANA (igual ao knight.glb; o UnitAnimator anima cada nó com rotações absolutas — não aninhe as peças):
  Knight (raiz, sem transformação, pés em y=0, frente +Z, origem entre os pés)
  ├─ Torso   pivô (0, 1.05, 0)  tronco, cinto, tabardo, gorjal, arcos de gola, metade interna da ombreira, placas do peito,
  │          bolsas e correntes
  ├─ Head    pivô no pescoço (0, 1.65, -0.04)  elmo (rosto só na frente +Z) e penacho
  ├─ ArmL / ArmR   pivô no ombro (±0.268, 1.477, -0.078)  metade externa da ombreira + braço + manopla
  │          (ArmR é o braço do martelo, no lado +x)
  ├─ LegL / LegR   pivô no topo da joelheira (±0.201, 0.687, 0.053)  joelheira, canela e bota
  ├─ Sword   é o MARTELO (nome = slot de arma do animador). Pivô na empunhadura, cabeça no topo (+y), cabo para baixo,
  │          face de impacto para +Z, repouso rot x 0,5 rad / z −0,1 rad (igual ao Espadachim)
  └─ Cape    capa, irmã do Torso (não se move com o tronco); material TeamColor (cor do time)
Sem escudo (o modelo não tem; ShieldGroup ausente — o animador ignora).

Decisões (detalhes e números em docs/reference/heroi-brann-tripo.md):
  * O FBX segura o martelo com a mão DIREITA anatômica, que fica em −x quando a figura olha para +Z. A convenção do
    jogo (e o UnitAnimator) põe o braço da arma (ArmR / Sword) em +x; por isso a malha é ESPELHADA em x (enrolamento
    das faces e normais invertidos junto). Ossos "Left*" do rig viram ArmL/LegL (−x) e "Right*" viram ArmR/LegR (+x).
  * A capa e as duas peças do martelo (cabeça + cabo) já são ilhas de malha soltas no FBX (0 vértices compartilhados
    com o corpo): só viram objetos. O corpo (1 ilha de ~4 mil faces) é segmentado pelos pesos de pele do rig (Mixamo)
    + regras geométricas e cortado por dois tipos de plano: horizontal em y = 0,335 m (FBX) entre coxa e joelheira, e
    verticais em x = ±0,146 m nos ombros (perpendiculares ao eixo de giro do braço, então a caminhada não abre fresta).
  * Aberturas de corte entre peças recebem tampas (laço triangulado por orelhas) com a cor da textura vizinha.
  * Textura: 4096² -> 512² por média 8x8 em luz linear; as ilhas UV da capa viram cinza (material TeamColor).
"""
import os
import sys
import math

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))

import hero_common as HC  # noqa: E402
from hero_common import log, pca, cor_da_face  # noqa: E402

NOME = 'hero_brann'
RAIZ = 'Knight'
PREFIXO = 'brann'
ATLAS_NOME = 'hero_brann_atlas'
FBX_PADRAO = ('/home/rafael/Downloads/medieval+knight+3d+model/'
              'tripo_convert_4dcab188-1731-4ebb-a8b6-af0b2ea98984.fbx')
OUT_GLB = os.path.join(REPO, 'public', 'models', 'hero_brann.glb')
OUT_PREVIAS = os.path.join(REPO, 'tools', 'ui-captures', 'hero-brann')

# ---------------------------------------------------------------------------
# Constantes do modelo-fonte (unidades do FBX = metros; coordenadas do jogo: x direita, y cima, z frente)
# ---------------------------------------------------------------------------
TOPO = 2.05            # altura final do modelo (topo do penacho), igual ao knight.glb
X0 = 0.151             # eixo de simetria do corpo no FBX (centro das botas)
Z0 = -0.12             # z do FBX que vira z = 0 (centro dos quadris e dos pés)
Y_PERNA = 0.335        # plano de corte das pernas: acima da joelheira, na altura em que as coxas se fundem
TABARDO_DX = 0.068     # tabardo (aba de pano à frente): |x - X0| < 0,068 e z > -0,045
TABARDO_Z = -0.045
OMBRO_Y = 0.66         # acima desta altura os braços se ligam ao tronco (ombreira); abaixo há vão de ar entre eles
OMBRO_X = 0.146        # plano de corte vertical x = ±0,146: perpendicular ao eixo de giro do braço (x), então
                       # o corte gira dentro de si mesmo e não abre fresta na caminhada/golpe; arcos de gola ficam no tronco
SUAVIZACAO = 5         # passadas de voto da vizinhança nos rótulos vindos dos pesos de pele
ESCALA_MARTELO = 1.0   # escala extra do martelo em torno da empunhadura (1.0 = tamanho do FBX; a cabeça tem 0,77 x 0,43 x 0,45 u)
TEAM_DEFAULT = '#1f4ac8'   # azul profundo (multiplica a textura cinza da capa), igual ao knight.glb
SWORD_REST_DEG = (math.degrees(0.5), 0.0, math.degrees(-0.1))   # repouso do slot de arma (UnitAnimator)
ATLAS = 512
ZOOM_PREVIA = 0.85     # enquadramento das prévias (menor = mais perto)

PECAS = ['Torso', 'Head', 'ArmL', 'ArmR', 'LegL', 'LegR', 'Sword', 'Cape']
CORPO = ['Torso', 'Head', 'ArmL', 'ArmR', 'LegL', 'LegR']       # rótulos vindos dos pesos de pele

CAPAS = CORPO                                                   # peças com aberturas de corte (tampas)
PECAS_TIME = ['Cape']                                           # peças inteiras em TeamColor
CABECA = (0.0, 1.82, -0.03)                                     # centro da cabeça (jogo), prévia do rosto
REPOUSO = {'Sword': SWORD_REST_DEG}


# ---------------------------------------------------------------------------
# Ganchos do hero_common
# ---------------------------------------------------------------------------
def classificar_ilhas(sopa, S):
    """Destino de cada ilha de malha: 'corpo' (a maior), 'Sword' (martelo), 'Cape', 'bota' ou 'Torso' (acessórios)."""
    info = {}
    for c in range(max(sopa.comp) + 1):
        fl = [f for f in range(len(sopa.fv)) if sopa.comp[f] == c and sopa.vivo[f]]
        vs = sorted({v for f in fl for v in sopa.fv[f]})
        P = np.array([sopa.P[v] for v in vs])
        info[c] = dict(faces=len(fl), lo=P.min(axis=0), hi=P.max(axis=0))
    destino = {}
    for c, d in info.items():
        lo, hi = d['lo'], d['hi']
        if c == 0:
            destino[c] = 'corpo'
        elif hi[0] > 0.30 * S:                                   # longe do corpo, do lado +x: martelo (cabeça e cabo)
            destino[c] = 'Sword'
        elif hi[2] < (-0.2 - Z0) * S and (hi[1] - lo[1]) > 0.5 * S:   # lâmina grande e alta atrás do corpo: capa
            destino[c] = 'Cape'
        elif hi[1] < 0.15 * S:                                   # rente ao chão: botas
            destino[c] = 'bota'
        else:                                                    # bolsas, correntes, fivela, placas do peito
            destino[c] = 'Torso'
    return destino, info


def regras_corpo(c, nome, S):
    """Regras geométricas sobre o rótulo vindo dos pesos. c = centroide da face (coordenadas finais)."""
    dxf = abs(c[0]) / S
    yf = c[1] / S
    zf = c[2] / S + Z0
    lado_r = c[0] > 0          # +x = ArmR/LegR (braço do martelo)
    tabardo = dxf < TABARDO_DX and zf > TABARDO_Z and 0.08 < yf < 0.60
    if yf >= Y_PERNA:
        if nome in ('LegL', 'LegR'):
            nome = 'Torso'
    elif nome in ('Torso', 'LegL', 'LegR'):
        nome = 'Torso' if tabardo else ('LegR' if lado_r else 'LegL')
    if nome != 'Head' and yf >= OMBRO_Y:                       # ombro: corte plano x = ±OMBRO_X
        nome = ('ArmR' if lado_r else 'ArmL') if dxf >= OMBRO_X else 'Torso'
    return nome


def avaliar_ilhas(sopa, destino, S):
    """Capa e martelo já são pedaços soltos da malha? Mede vértices compartilhados, distância mínima ao corpo e área."""
    log('--- AVALIAÇÃO: capa e martelo (unidades do FBX: metros) ---')
    corpo = np.array([sopa.P[v] for v in range(sopa.n_orig) if sopa.comp_v[v] == 0])
    for c in sorted(destino):
        if destino[c] not in ('Cape', 'Sword'):
            continue
        vs = [v for v in range(sopa.n_orig) if sopa.comp_v[v] == c]
        P = np.array([sopa.P[v] for v in vs])
        d = np.sqrt(((P[:, None, :] - corpo[None, :, :]) ** 2).sum(axis=2)).min()
        area = 0.0
        for f in range(sopa.n_faces_orig):
            if sopa.comp[f] == c:
                p = [sopa.P[v] for v in sopa.fv[f]]
                for k in range(1, len(p) - 1):
                    area += 0.5 * np.linalg.norm(np.cross(p[k] - p[0], p[k + 1] - p[0]))
        log('  ilha %d (%s): %d vértices, %d faces, área %.3f m², vértices compartilhados com o corpo: 0, distância mínima ao corpo: %.1f cm'
            % (c, 'CAPA' if destino[c] == 'Cape' else 'MARTELO', len(vs), sum(1 for f in range(sopa.n_faces_orig) if sopa.comp[f] == c),
               area / (S * S), d / S * 100))


def avaliar_escala(f):
    """Escala, eixo, origem e direção em que a figura olha (no FBX, antes de qualquer ajuste)."""
    lo, hi = f.co.min(axis=0), f.co.max(axis=0)
    log('--- AVALIAÇÃO: escala, eixo, origem ---')
    log('  bbox no jogo (x, y-cima, z): x [%.3f, %.3f]  y [%.4f, %.4f]  z [%.3f, %.3f]  -> altura %.3f m, base em y = %.4f' %
        (lo[0], hi[0], lo[1], hi[1], lo[2], hi[2], hi[1] - lo[1], lo[1]))
    log('  centro do bbox em x = %.3f (martelo à direita da figura puxa o bbox); eixo do corpo (centro das botas) x ≈ %.3f; '
        'z dos quadris ≈ %.3f -> a origem NÃO está entre os pés (z = 0 fica na ponta das botas)' % ((lo[0] + hi[0]) / 2, X0, Z0))
    if hasattr(f, 'pos_ossos') and f.pos_ossos:
        h = f.pos_ossos
        log('  ossos (x, y, z): Hips %s  Head %s  LeftArm %s  RightArm %s' % (np.round(h['Hips'], 3), np.round(h['Head'], 3),
                                                                           np.round(h['LeftArm'], 3), np.round(h['RightArm'], 3)))
    log('  eixo up: +Y do FBX (importado como +Z do Blender); a figura olha para +Z do jogo (-Y do Blender): '
        'o rosto fica em z maior que o resto da cabeça (ver avaliação do rosto); martelo na mão direita anatômica = lado -x')


def direcao_gema(sopa, ids, pixels):
    """Normal média das faces azul-gema (matiz 200-240°, saturação > 0.6) da cabeça do martelo; None se não achar."""
    import colorsys
    if pixels is None:
        return None
    ns = []
    for f in ids:
        r, g, b = cor_da_face(sopa, pixels, f)
        h, s, v = colorsys.rgb_to_hsv(float(r), float(g), float(b))
        if 200 <= h * 360 <= 240 and s > 0.6 and v > 0.45:
            ns.append(np.mean(sopa.fn[f], axis=0))
    if len(ns) < 5:
        return None
    n = np.mean(ns, axis=0)
    return n / (np.linalg.norm(n) + 1e-12)


def orientar_martelo(sopa, partes, pixels=None):
    """Rotação R (linhas = eixos locais no mundo) e empunhadura G0 do martelo.
    Y local = do pomo para a cabeça; Z local = eixo de golpe (maior dimensão da cabeça); X = Y x Z, com o lado da gema
    (placa dourada) voltado para fora (+x). Empunhadura = ponto do cabo mais próximo do centro da mão direita."""
    ids = partes['Sword']
    dados = []
    for c in sorted({sopa.comp[f] for f in ids}):
        fl = [f for f in ids if sopa.comp[f] == c]
        P = np.array([sopa.P[v] for v in sorted({v for f in fl for v in sopa.fv[f]})])
        cen, V, ext = pca(P)
        dados.append(dict(fl=fl, P=P, cen=cen, V=V, ext=ext))
    if len(dados) != 2:
        raise RuntimeError('martelo: esperava 2 ilhas (cabeça e cabo), achei %d' % len(dados))
    dados.sort(key=lambda d: d['ext'][0] / d['ext'][1], reverse=True)
    cabo, cabeca = dados
    y = cabo['V'][:, 0]
    if np.dot(y, cabeca['cen'] - cabo['cen']) < 0:
        y = -y
    alin = [abs(np.dot(cabeca['V'][:, k], y)) for k in range(3)]
    k_esp = int(np.argmax(alin))
    resto = [k for k in range(3) if k != k_esp]
    k_golpe = resto[0] if cabeca['ext'][resto[0]] >= cabeca['ext'][resto[1]] else resto[1]
    z = cabeca['V'][:, k_golpe]
    z = z - np.dot(z, y) * y
    z /= np.linalg.norm(z)
    gema = direcao_gema(sopa, cabeca['fl'], pixels)
    for tentativa in range(2):
        x = np.cross(y, z)
        if gema is None or np.dot(gema, x) > 0 or tentativa == 1:
            break
        z = -z                      # gema para dentro: inverte o sentido de golpe (a cabeça é simétrica no golpe)
    R = np.stack([x, y, z])
    # empunhadura: centro da mão direita (pesos RightHand* > 0,5 nos vértices do corpo) projetado no eixo do cabo
    sel = [v for v in range(sopa.n_orig) if sopa.mao_r[v] > 0.5 and sopa.comp_v[v] == 0]
    mao = np.mean([sopa.P[v] for v in sel], axis=0) if sel else cabo['cen']
    G0 = cabo['cen'] + y * np.dot(mao - cabo['cen'], y)
    info = dict(comprimento_cabo=float(cabo['ext'][0]), cabeca_ext=[float(cabeca['ext'][k_golpe]), float(cabeca['ext'][resto[0] if resto[1] == k_golpe else resto[1]]), float(cabeca['ext'][k_esp])],
                mao=mao, gema=gema, n_mao=len(sel))
    return R, G0, info


def calcular_pivos(S, pos_ossos, dados, G0):
    """Pivô (no sistema da raiz Knight) de cada nó. Torso/Head/ombros vêm do rig (Hips, Head, Left/RightArm);
    pernas = centro do corte em y = Y_PERNA; Sword = empunhadura; Cape = centro da borda superior."""
    def T(p):
        return np.array([-(p[0] - X0) * S, p[1] * S, (p[2] - Z0) * S])
    piv = {'Torso': np.array([0.0, 1.05, 0.0])}
    h = T(pos_ossos['Head'])
    piv['Head'] = np.array([0.0, round(float(h[1]), 2), round(float(h[2]), 2)])
    ar, al = T(pos_ossos['RightArm']), T(pos_ossos['LeftArm'])
    om = np.array([(abs(ar[0]) + abs(al[0])) / 2, (ar[1] + al[1]) / 2, (ar[2] + al[2]) / 2])
    piv['ArmR'] = np.round(om * np.array([1, 1, 1]), 3)
    piv['ArmL'] = np.round(om * np.array([-1, 1, 1]), 3)
    for p in ('LegL', 'LegR'):
        V = dados[p]['V']
        corte = V[np.abs(V[:, 1] - Y_PERNA * S) < 1e-4]
        c = corte.mean(axis=0)
        piv[p] = np.array([round(float(c[0]), 3), round(Y_PERNA * S, 3), round(float(c[2]), 3)])
    piv['Sword'] = G0
    V = dados['Cape']['V']
    topo = V[V[:, 1] > V[:, 1].max() - 0.05]
    piv['Cape'] = np.array([0.0, round(float(V[:, 1].max()), 3), round(float(topo[:, 2].mean()), 3)])
    return piv


classificar = classificar_ilhas
avaliar_fonte_extra = avaliar_escala


def cortes(S):
    """Plano horizontal das pernas (y = Y_PERNA) e planos verticais dos ombros (x = +-OMBRO_X, só acima de OMBRO_Y - 0,1)."""
    return [(1, Y_PERNA * S, None), (0, OMBRO_X * S, (OMBRO_Y - 0.1) * S), (0, -OMBRO_X * S, (OMBRO_Y - 0.1) * S)]


def regras(ctx, f, c, nome):
    return regras_corpo(c, nome, ctx.S)


def eh_time(ctx, peca, i):
    return peca == 'Cape'


def cor_time(rgb, peca):
    return False


def finalizar(ctx):
    """Martelo (eixos por PCA, empunhadura na mão), pivôs e vértices em coordenadas locais. Devolve {peça: pivô}."""
    sopa, S, f, dados, partes = ctx.sopa, ctx.S, ctx.f, ctx.dados, ctx.partes
    R, G0, info_m = orientar_martelo(sopa, partes, f.pixels)
    log('martelo: cabo %.2f, cabeça (golpe, largura, espessura) %s, mão (%d vértices) em %s, gema %s' %
        (info_m['comprimento_cabo'], np.round(info_m['cabeca_ext'], 2), info_m['n_mao'], np.round(info_m['mao'], 3),
         None if info_m['gema'] is None else np.round(info_m['gema'], 2)))
    piv = calcular_pivos(S, f.pos_ossos, dados, G0)
    for p in PECAS:
        if p == 'Sword':
            dados[p]['V'] = ((dados[p]['V'] - G0) @ R.T) * ESCALA_MARTELO
            dados[p]['N'] = [[R @ n for n in nn] for nn in dados[p]['N']]
        else:
            dados[p]['V'] = dados[p]['V'] - piv[p]
    return piv


def poses():
    return HC.poses_unit_animator('Sword', (0.5, 0, -0.1))


def main():
    HC.executar(sys.modules[__name__])


if __name__ == '__main__':
    main()
