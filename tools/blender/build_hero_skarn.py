"""
build_hero_skarn.py — Skarn, chefe-de-brasa (hero_skarn): Comandante ogro dos Clãs, gerado a partir de DOIS FBX do Tripo (M2-24).

Só constantes e ganchos do Skarn; todo o resto vive em tools/blender/hero_common.py (biblioteca da M2-21).

Entradas: 1) Skarn: 1 malha de 19,4 mil triângulos (1 ilha), rig Mixamo de 65 ossos sem ações, T-pose, textura 1024², frente em -Y
             do Blender (vira +Z), altura 0,76 (lanternas de brasa sobre os ombros), SEM arma.
          2) Martelo: malha avulsa sem rig (9,9 mil triângulos, textura 512²), cabo ao longo de x (cabeça em -x, pomo em +x),
             cabeça retangular com 0,28 x 0,27 x 0,42 (faces de impacto nas tampas de ±z do FBX), comprimento total 1,0.
Saída:    public/models/hero_skarn.glb (meshopt + WebP), prévias 512 px em tools/ui-captures/hero-skarn/.

Uso:
  blender -b --factory-startup --python tools/blender/build_hero_skarn.py -- [caminho.fbx] [--no-render] [--sem-avaliacao]
                                                                           [--glb=saida.glb] [--previas=pasta]
Rodar sempre via tools/safe-run.sh (ver CLAUDE.md).

Hierarquia (tipo-base `ogre` do UnitAnimator, igual à do ogre.glb):
  Ogre (raiz, pés em y=0, frente +Z, origem entre os pés)
  ├─ Torso   pivô no quadril    tronco, manto de pele, lanternas de brasa, ombreiras, cinto com crânios, saiote de correntes
  │   ├─ Head   pivô no pescoço     cabeça com a coroa de espetos (rosto só em +Z)
  │   ├─ ArmL   pivô no ombro       braço esquerdo (pendente, mão aberta)
  │   └─ ArmR   pivô no ombro       braço direito REPOSADO (antebraço dobrado) + punho
  │       └─ Weapon   pivô na empunhadura, repouso x = -45° (como o ogre)   martelo de guerra, cabo em pé, faces de impacto em ±Z
  └─ LegL / LegR   pivô no quadril    perna inteira (coxa, grevas, bota)
O FBX está em T-pose: os dois braços são REPOSADOS pelo rig (hero_common.reposar) antes de cortar (braços em A; o antebraço direito
dobra para a frente e a mão, aberta, fica com a palma na vertical em torno do cabo do martelo).
O MARTELO é um corpo RÍGIDO lido do 2º FBX (decimado), girado para a cabeça ficar em cima e as faces de impacto em ±Z, escalado
(MARTELO_ESCALA) em proporção ao Skarn e encaixado na mão direita reposada; seus triângulos entram na "sopa" como uma ilha à parte
(destino `Weapon`) e a textura dele (512²) é encaixada numa faixa do canvas de 1024² junto com a do Skarn (1024² -> 1024x768).
TeamColor: os panos vermelho-ferrugem viram cinza no atlas e multiplicam a cor do time (nenhum pano, nenhuma face de time: cai no Atlas).
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

NOME = 'hero_skarn'
RAIZ = 'Ogre'
PREFIXO = 'skarn'
ATLAS_NOME = 'hero_skarn_atlas'
FBX_PADRAO = '/home/rafael/Downloads/Skarn/tripo_convert_6fe2476e-c00e-49e7-89b0-3b8a8081c260.fbx'
FBX_MARTELO = '/home/rafael/Downloads/martelo/tripo_convert_97811126-0271-4a7b-b9d0-201129e0c5b0.fbx'
OUT_GLB = os.path.join(REPO, 'public', 'models', 'hero_skarn.glb')
OUT_PREVIAS = os.path.join(REPO, 'tools', 'ui-captures', 'hero-skarn')

# --- constantes do FBX do Skarn (metros; x direita do mundo, y cima, z frente; antes do espelho em x) ---
ESCALA = 4.1           # lanternas (y = 0,76 no FBX) vão a 3,1: o Ogro comum tem a cabeça em 3,2 e o herói recebe scaleMul 1,35
X0 = 0.004             # eixo de simetria (ponto médio dos pés)
Z0 = 0.035             # centro dos pés em z
NECK_Y = 0.52          # plano do pescoço (queixo) e dos ombros (topo da articulação do braço)
HIP_Y = 0.30           # plano das pernas (articulação do quadril)
CABECA_C = (0.0, 0.60, 0.07)       # centro da cabeça (x - X0 espelhado, y, z - Z0)
CABECA_R = (0.10, 0.12, 0.11)
PLACAS_Y = (0.16, 0.46)            # saiote, cinto e crânios: ficam no Torso (não atravessam as pernas)
SUAVIZACAO = 3
ATLAS = 512
DILATACAO_TIME = 2
PROTECAO_TIME = 2
ZOOM_PREVIA = 0.85
TEAM_DEFAULT = os.environ.get('SKARN_TEAM', '#b0482c')   # vermelho-ferrugem (multiplica o cinza do atlas)
CABECA = (0.0, 2.45, 0.35)         # centro da cabeça no jogo (prévia do rosto)
WEAPON_REST_X = -45.0              # o UnitAnimator assume ~-0,78 rad de repouso no `Weapon` do ogre

PECAS = ['Torso', 'Head', 'ArmL', 'ArmR', 'Weapon', 'LegL', 'LegR']
CORPO = ['Torso', 'Head', 'ArmL', 'ArmR', 'LegL', 'LegR']     # rótulos vindos dos pesos de pele
CAPAS = PECAS
PAIS = {'Head': 'Torso', 'ArmL': 'Torso', 'ArmR': 'Torso', 'Weapon': 'ArmR'}
PECAS_TIME = []
REGIOES_LIVRES = ('Weapon',)
REPOUSO = {'Weapon': (WEAPON_REST_X, 0.0, 0.0)}
POSES_PREVIA = ('caminhada', 'golpe_a', 'golpe_b', 'grito')

# ---------------------------------------------------------------------------
# Martelo (FBX avulso) e repose dos braços
# ---------------------------------------------------------------------------
MARTELO_RAZAO = 0.4                # fração dos triângulos mantida pelo Decimate (9,9 mil -> ~4 mil)
MARTELO_ESCALA = 0.62              # FBX do martelo (1,0 de comprimento) -> unidades do FBX do Skarn (0,62: martelo gigante, cabeça à altura dos olhos do Skarn)
MARTELO_PUNHO_XJ = 0.26            # ponto do cabo (x do FBX do martelo) que fica na palma da mão
MARTELO_CENTRO_YJ = 0.209          # meio da altura da cabeça no FBX do martelo (o cabo passa por aqui)
CANVAS = 1024
V_SKARN = 0.25                     # faixa de baixo do canvas (v < 0,25) é do martelo; o Skarn fica em v in [0,25, 1]
OMBRO_D = np.array([-0.123, 0.524, -0.006])      # cabeças dos ossos (jogo, T-pose, lado direito = -x)
COTOVELO_D = np.array([-0.244, 0.473, -0.014])
MAO_D = np.array([-0.362, 0.454, -0.001])
PONTA_MAO_D = np.array([-0.432, 0.439, 0.006])
GAMA_D = 26.0        # abdução do braço direito (graus a partir da vertical)
BETA_D = 52.0        # dobra do cotovelo direito para a frente (graus a partir do antebraço pendente)
GAMA_E = 24.0
BETA_E = 14.0


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


def _unit(v):
    v = np.asarray(v, float)
    return v / np.linalg.norm(v)


def resolver_pose():
    """Rotações ABSOLUTAS (coordenadas do jogo, antes do espelho) para: braços pendentes em A (sem tocar o tronco), antebraço
    direito dobrado BETA_D graus para a frente com a mão em posição de empunhar (dedos para a frente, palma na vertical virada para
    o corpo, polegar para cima: o cabo vertical atravessa a palma) e antebraço esquerdo quase reto. Devolve (POSE, ângulo do pulso)."""
    pose = {}
    # --- braço direito (lado -x) ---
    u0 = _unit(COTOVELO_D - OMBRO_D)
    f0 = _unit(MAO_D - COTOVELO_D)
    h0 = _unit(PONTA_MAO_D - MAO_D)
    g = np.radians(GAMA_D)
    u1 = _unit([-np.sin(g), -np.cos(g), 0.05])
    Ra = _rot_min(u0, u1)
    b = np.radians(BETA_D)
    f1 = _unit([-0.18, -np.cos(b), np.sin(b)])
    Rmin = _rot_min(Ra @ f0, f1) @ Ra
    # mão-alvo: dedos para a frente (um pouco para o corpo), palma para o corpo (+x antes do espelho), polegar para cima
    fa = _unit([0.2, -0.02, 1.0])
    na = _unit(np.array([1.0, 0.0, 0.0]) - fa * fa[0])
    ta = np.cross(fa, na)
    B = np.stack([fa, ta, na], axis=1)
    # mão da T-pose: dedos ao longo do osso, palma para baixo, polegar para a frente
    fh = h0
    nh = _unit(np.array([0.0, -1.0, 0.0]) - fh * fh[1])
    th = np.cross(fh, nh)
    A = np.stack([fh, th, nh], axis=1)
    Rh = B @ A.T
    melhor = None
    for phi in np.arange(-150, 151, 5):
        Rf = rot_eixo(f1, float(phi)) @ Rmin
        ang = _angulo(Rh @ Rf.T)
        if melhor is None or ang < melhor[0]:
            melhor = (ang, Rf)
    pose['RightArm'] = Ra
    pose['RightForeArm'] = melhor[1]
    pose['RightHand'] = Rh
    # --- braço esquerdo (lado +x), mão aberta pendente ---
    oe, ce, me_ = np.array([0.131, 0.524, -0.006]), np.array([0.252, 0.473, -0.014]), np.array([0.362, 0.454, -0.001])
    u0l = _unit(ce - oe)
    f0l = _unit(me_ - ce)
    g = np.radians(GAMA_E)
    u1l = _unit([np.sin(g), -np.cos(g), 0.04])
    Rl = _rot_min(u0l, u1l)
    bl = np.radians(BETA_E)
    f1l = _unit([0.10, -np.cos(bl), np.sin(bl)])
    pose['LeftArm'] = Rl
    pose['LeftForeArm'] = _rot_min(Rl @ f0l, f1l) @ Rl
    return pose, melhor[0], fa


POSE, ANGULO_PULSO, DEDOS_DIR = resolver_pose()
ESTADO = {}            # faces do martelo e punho (preenchido em ajustar_fonte, lido em classificar/finalizar)


# ---------------------------------------------------------------------------
# Cores da textura (HSV em graus)
# ---------------------------------------------------------------------------
def hsv(c):
    h, s, v = colorsys.rgb_to_hsv(float(c[0]), float(c[1]), float(c[2]))
    return h * 360.0, s, v


def eh_pele(c):
    h, s, v = hsv(c)
    return 60 <= h <= 120 and s > 0.28


def eh_pano(c):
    """Couro/pano marrom-ferrugem (tassets, correias, faixas): matiz laranja-marrom, saturação média, escuro. A brasa (laranja
    claro e vivo), a pele verde, o ferro cinza e o osso (claro, pouco saturado) ficam de fora."""
    h, s, v = hsv(c)
    return (15 <= h <= 62) and s > 0.2 and 0.08 < v < 0.5


def eh_brasa(c):
    h, s, v = hsv(c)
    return 8 <= h <= 40 and s > 0.7 and v > 0.7


TIME_REGIAO_Y = (0.14, 0.31)       # onde ficam os tassets e a correia de couro (FBX): saiote em torno dos quadris
TIME_REGIAO_X = (0.05, 0.24)       # |x|: fora do painel de correntes do meio


def pano_numa_face(ctx, peca, i):
    d = ctx.dados[peca]
    if peca not in ('Torso', 'LegL', 'LegR'):
        return False
    ctr = np.mean([d['V'][k] for k in d['F'][i]], axis=0) / ctx.S
    if not (TIME_REGIAO_Y[0] <= ctr[1] <= TIME_REGIAO_Y[1] and TIME_REGIAO_X[0] <= abs(ctr[0]) <= TIME_REGIAO_X[1]):
        return False
    cores = HC.cores_de_uv(ctx.pixels, d['UV'][i])
    if os.environ.get('SKARN_DEBUG_COR'):
        ESTADO.setdefault('dbg', []).append(hsv(np.mean(cores, axis=0)) + (ctr[0], ctr[1]))
    return eh_pano(np.mean(cores, axis=0))


# ---------------------------------------------------------------------------
# Leitura e encaixe do martelo
# ---------------------------------------------------------------------------
def ler_martelo():
    """Importa o FBX do martelo SEM limpar a cena (o Skarn já está lido), decima, lê geometria e textura em numpy e apaga os objetos.
    Devolve dict com co (jogo, antes de girar), cn (por canto), loop_v, ls, lt, uv, pixels."""
    import bpy
    antes = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=FBX_MARTELO, use_image_search=True)
    novos = [o for o in bpy.data.objects if o not in antes]
    mo = next(o for o in novos if o.type == 'MESH')
    n0 = len(mo.data.polygons)
    mod = mo.modifiers.new('dec', 'DECIMATE')
    mod.decimate_type = 'COLLAPSE'
    mod.ratio = MARTELO_RAZAO
    mod.use_collapse_triangulate = True
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    ev = mo.evaluated_get(dg)
    me = ev.to_mesh()
    nv, nl, npol = len(me.vertices), len(me.loops), len(me.polygons)
    mw = np.array(ev.matrix_world)
    co = np.empty(nv * 3)
    me.vertices.foreach_get('co', co)
    co = co.reshape(-1, 3) @ mw[:3, :3].T + mw[:3, 3]
    cn = np.empty(nl * 3)
    me.corner_normals.foreach_get('vector', cn)
    cn = cn.reshape(-1, 3) @ mw[:3, :3].T
    loop_v = np.empty(nl, dtype=np.int64)
    me.loops.foreach_get('vertex_index', loop_v)
    ls = np.empty(npol, dtype=np.int64)
    lt = np.empty(npol, dtype=np.int64)
    me.polygons.foreach_get('loop_start', ls)
    me.polygons.foreach_get('loop_total', lt)
    uv = np.empty(nl * 2)
    me.uv_layers.active.data.foreach_get('uv', uv)
    img = None
    for m in mo.data.materials:
        for n in m.node_tree.nodes:
            if n.bl_idname == 'ShaderNodeTexImage' and n.image is not None and img is None:
                img = n.image
    if not img.has_data:
        img.reload()
    px = HC.carregar_pixels(img)
    ev.to_mesh_clear()
    for o in novos:
        bpy.data.objects.remove(o, do_unlink=True)
    log('martelo: %d -> %d triângulos (Decimate %.2f), textura %dx%d' % (n0, int((lt - 2).sum()), MARTELO_RAZAO, px.shape[1], px.shape[0]))
    assert (lt == 3).all(), 'o martelo decimado deveria ser todo triangular'
    # Blender (x, y, z-cima) -> jogo (x, z, -y)
    jg = np.stack([co[:, 0], co[:, 2], -co[:, 1]], axis=1)
    jn = np.stack([cn[:, 0], cn[:, 2], -cn[:, 1]], axis=1)
    return dict(co=jg, cn=jn, loop_v=loop_v, ls=ls, lt=lt, uv=uv.reshape(-1, 2), pixels=px)


# Martelo do FBX (jogo): cabo ao longo de x (cabeça em -x, pomo em +x), cabeça longa ao longo de y, fina em z.
# Alvo: cabeça em cima (+Y), faces de impacto (as tampas de ±y do FBX, "comprimento" da cabeça) em ±Z, lado fino em ±X.
M_MARTELO = np.array([[0.0, 0.0, -1.0],      # X = -zj
                      [-1.0, 0.0, 0.0],      # Y = -xj
                      [0.0, 1.0, 0.0]])      # Z = +yj   (det = +1: rotação própria)


def _reamostrar_vertical(lin, linhas_novas):
    """Média por área (luz linear) para mudar o número de linhas de (h, w, 3) para `linhas_novas`."""
    h = lin.shape[0]
    W = np.zeros((linhas_novas, h))
    k = h / linhas_novas
    for i in range(linhas_novas):
        a, b = i * k, (i + 1) * k
        for j in range(int(np.floor(a)), int(np.ceil(b))):
            W[i, j] = max(0.0, min(b, j + 1) - max(a, j)) / k
    return np.tensordot(W, lin, axes=(1, 0))


def montar_canvas(px_skarn, px_martelo):
    """Canvas 1024²: Skarn (1024² -> 1024x768) em cima (v in [0,25, 1]); martelo (512² -> 512x256) embaixo à esquerda; o resto
    é ferro escuro neutro (nada usa esses texels: só os cantos da faixa, que ficam como sangria de mip)."""
    lin_s = HC.srgb_para_linear(px_skarn)
    s = _reamostrar_vertical(lin_s, int(CANVAS * (1 - V_SKARN)))
    lin_m = HC.srgb_para_linear(px_martelo)
    m = _reamostrar_vertical(lin_m, 256)
    cv = np.empty((CANVAS, CANVAS, 3), dtype=np.float32)
    cv[:] = HC.srgb_para_linear(np.array([0.14, 0.13, 0.13], dtype=np.float32))
    cv[:256, :512] = m
    cv[:256, 512:] = m[:, ::-1][:, :512 * 1]            # espelho do martelo (sangria suave na emenda)
    cv[256:, :] = s
    return HC.linear_para_srgb(cv).astype(np.float32)


def ajustar_fonte(ctx):
    """Acrescenta o martelo à malha já reposada (corpo rígido na mão direita) e junta as duas texturas num canvas único."""
    f = ctx.f
    mt = ler_martelo()
    # 1. posição da empunhadura (palma) depois do repose: cabeça do osso da mão + um pouco ao longo dos dedos
    P = f.pos_pose['RightHand'] + DEDOS_DIR * 0.03
    log('empunhadura (jogo, antes do espelho): %s; pulso %.1f° do neutro; dedos %s' % (np.round(P, 3), ANGULO_PULSO, np.round(DEDOS_DIR, 2)))
    r = mt['co'] - np.array([MARTELO_PUNHO_XJ, MARTELO_CENTRO_YJ, 0.0])
    co_m = P + (r @ M_MARTELO.T) * MARTELO_ESCALA
    cn_m = mt['cn'] @ M_MARTELO.T
    cn_m /= np.linalg.norm(cn_m, axis=1)[:, None] + 1e-12
    ESTADO['P'] = P
    # 2. UV: Skarn comprimido em v (faixa de cima), martelo na faixa de baixo à esquerda
    uv_s = f.uv.copy()
    uv_s[:, 1] = V_SKARN + (1.0 - V_SKARN) * uv_s[:, 1]
    uv_m = mt['uv'].copy()
    uv_m[:, 0] *= 0.5
    uv_m[:, 1] *= V_SKARN
    f.pixels = montar_canvas(f.pixels, mt['pixels'])
    # 3. concatena geometria
    nv0, nl0, np0 = len(f.co), len(f.loop_v), len(f.ls)
    ESTADO['n_faces_skarn'] = np0
    f.co = np.concatenate([f.co, co_m])
    f.co_rest = np.concatenate([f.co_rest, co_m])
    f.cn = np.concatenate([f.cn, cn_m])
    f.cn_rest = np.concatenate([f.cn_rest, cn_m])
    f.loop_v = np.concatenate([f.loop_v, mt['loop_v'] + nv0])
    f.ls = np.concatenate([f.ls, mt['ls'] + nl0])
    f.lt = np.concatenate([f.lt, mt['lt']])
    f.uv = np.concatenate([uv_s, uv_m])
    f.W = np.concatenate([f.W, np.zeros((len(co_m), f.W.shape[1]), dtype=f.W.dtype)])
    log('martelo anexado: %d vértices, %d faces; canvas %dx%d' % (len(co_m), len(mt['ls']), f.pixels.shape[1], f.pixels.shape[0]))


def avaliar_fonte_extra(f):
    """Medições da avaliação: bbox, ossos de referência, cores quentes (couro) por região."""
    lo, hi = f.co.min(axis=0), f.co.max(axis=0)
    log('--- AVALIAÇÃO: escala, eixo, origem (já reposado) ---')
    log('  bbox (x, y-cima, z) do FBX: x [%.3f, %.3f] y [%.4f, %.4f] z [%.3f, %.3f]' % (lo[0], hi[0], lo[1], hi[1], lo[2], hi[2]))
    for b in ('Hips', 'Head', 'LeftArm', 'RightArm', 'RightForeArm', 'RightHand', 'RightUpLeg'):
        log('  osso %-13s repouso %s  reposado %s' % (b, np.round(f.pos_ossos[b], 3), np.round(f.pos_pose[b], 3)))
    if os.environ.get('SKARN_DEBUG_COR'):
        tri = [(f.loop_v[f.ls[i]:f.ls[i] + 3], f.uv[f.ls[i]:f.ls[i] + 3]) for i in range(len(f.ls))]
        quentes = 0
        hs = []
        for vv, uu in tri:
            cen = f.co[vv].mean(axis=0)
            c = np.mean([HC.amostrar(f.pixels, p[0], p[1]) for p in uu.mean(axis=0, keepdims=True)], axis=0)
            h, s_, v = hsv(c)
            hs.append((cen[0], cen[1], h, s_, v))
        hs = np.array(hs)
        for nome, m in (('couro? h10-45 s>.15', (hs[:, 2] > 10) & (hs[:, 2] < 45) & (hs[:, 3] > 0.15)),):
            log('  %s: %d faces (de %d); v médio %.2f; s médio %.2f' % (nome, int(m.sum()), len(hs), hs[m, 4].mean(), hs[m, 3].mean()))
            for y0 in (0.1, 0.2, 0.3, 0.4, 0.5, 0.6):
                mm = m & (hs[:, 1] >= y0) & (hs[:, 1] < y0 + 0.1)
                log('     y %.1f-%.1f: %d faces' % (y0, y0 + 0.1, int(mm.sum())))


def classificar(sopa, S):
    """Ilha do martelo (faces a partir de n_faces_skarn) -> `Weapon`; o resto -> corpo (cortes planos e pesos)."""
    n0 = ESTADO['n_faces_skarn']
    for i in range(n0, len(sopa.fv)):
        sopa.comp[i] = 1000
    info, destino = {}, {}
    for c in sorted(set(sopa.comp)):
        idx = [i for i in range(len(sopa.fv)) if sopa.comp[i] == c]
        vs = sorted({v for i in idx for v in sopa.fv[i]})
        Pm = np.array([sopa.P[v] for v in vs])
        info[c] = dict(faces=len(idx), lo=Pm.min(axis=0), hi=Pm.max(axis=0))
        destino[c] = 'Weapon' if c == 1000 else 'corpo'
    return destino, info


def cortes(S):
    """Plano do pescoço/ombros (y = NECK_Y) e plano do quadril (y = HIP_Y)."""
    return [(1, NECK_Y * S, None), (1, HIP_Y * S, None)]


def regras(ctx, f, c, nome):
    sopa, S = ctx.sopa, ctx.S
    xc, yc, zq = c[0] / S, c[1] / S, c[2] / S          # x espelhado e z - Z0, em unidades do FBX
    cor = cor_da_face(sopa, ctx.pixels, f)
    pele, pano = eh_pele(cor), eh_pano(cor)
    # 1. saiote de correntes, cinto e crânios (ferro, couro escuro): ficam no Torso, não atravessam as pernas
    if PLACAS_Y[0] < yc < PLACAS_Y[1] and not pele and not pano and abs(xc) < 0.19 and nome in ('Torso', 'LegL', 'LegR'):
        return 'Torso'
    # 2. cabeça: elipsoide em torno do crânio (coroa, presas), acima do plano do pescoço
    ex = ((xc - CABECA_C[0]) / CABECA_R[0]) ** 2 + ((yc - CABECA_C[1]) / CABECA_R[1]) ** 2 + ((zq - CABECA_C[2]) / CABECA_R[2]) ** 2
    if yc >= NECK_Y - 1e-6 and ex < 1.0 and nome in ('Torso', 'Head'):
        return 'Head'
    if nome == 'Head':
        return 'Torso'
    # 3. braços: o que está acima do plano do ombro fica no Torso (manto de pele, ombreira, lanternas)
    if nome in ('ArmL', 'ArmR'):
        return 'Torso' if yc >= NECK_Y - 1e-6 else nome
    # 4. pernas: só abaixo do plano do quadril
    if yc < HIP_Y + 1e-6:
        if nome in ('Torso', 'LegL', 'LegR'):
            return 'LegR' if xc > 0 else 'LegL'
        return nome
    if nome in ('LegL', 'LegR'):
        return 'Torso'
    return nome


def eh_time(ctx, peca, i):
    return peca != 'Weapon' and pano_numa_face(ctx, peca, i)


def cor_time(rgb, peca):
    return False        # tampas ficam na cor original (o couro é só o que está nas faces de verdade)


def finalizar(ctx):
    """Pivôs, martelo nivelado ao repouso do nó (-45° em x) e vértices em coordenadas locais. Devolve {peça: pivô}."""
    S, f, dados = ctx.S, ctx.f, ctx.dados

    def T(p):
        return np.array([-(p[0] - X0) * S, p[1] * S, (p[2] - Z0) * S])
    piv = {}
    log('faces de TeamColor por peça: %s' % {p: int(sum(dados[p]['time'])) for p in PECAS})
    if ESTADO.get('dbg'):
        dd = np.array(ESTADO['dbg'])
        log('DBG regiao do saiote: %d faces; h pct %s s pct %s v pct %s' % (len(dd), np.percentile(dd[:, 0], [10, 50, 90]).round(0), np.percentile(dd[:, 1], [10, 50, 90]).round(2), np.percentile(dd[:, 2], [10, 50, 90]).round(2)))
    # cabeça: pivô sob o crânio, atrás do queixo
    h = T(f.pos_pose['Head'])
    piv['Head'] = np.array([0.0, round(float(h[1]) - 0.02 * S, 3), round(float(h[2]) - 0.02 * S, 3)])
    for p, sinal, osso in (('ArmL', -1.0, 'LeftArm'), ('ArmR', 1.0, 'RightArm')):
        alvo = T(f.pos_pose[osso])
        ombro = [t for t in dados[p]['tampas'] if np.linalg.norm(t['centro'] - alvo) < 0.45 * S]
        if not ombro:
            raise RuntimeError('%s: sem seção de ombro perto de %s (tampas: %s)' % (p, np.round(alvo, 2), [np.round(t['centro'], 2) for t in dados[p]['tampas']]))
        t = max(ombro, key=lambda q: q['n_arestas'])
        piv[p] = np.round(t['centro'], 3)
        log('ombro %s: seção de %d arestas, pivô %s (osso em %s)' % (p, t['n_arestas'], piv[p], np.round(alvo, 3)))
    for p, osso in (('LegL', 'LeftUpLeg'), ('LegR', 'RightUpLeg')):
        hq = T(f.pos_ossos[osso])
        piv[p] = np.array([round(float(hq[0]), 3), round(float(hq[1]), 3), round(float(hq[2]), 3)])
        log('quadril %s: osso %s, pivô %s (%d seções)' % (p, osso, piv[p], len(dados[p]['tampas'])))
    piv['Torso'] = np.array([0.0, piv['LegL'][1], 0.0])
    # martelo: empunhadura = palma; geometria girada +45° em x em torno dela, para que o nó em repouso (-45° em x) a devolva ao cabo em pé
    G = T(ESTADO['P'])
    R = rot_eixo((1, 0, 0), -WEAPON_REST_X)
    W = dados['Weapon']
    W['V'] = (W['V'] - G) @ R.T + G
    W['N'] = [[R @ n for n in nn] for nn in W['N']]
    piv['Weapon'] = np.round(G, 3)
    log('martelo: empunhadura %s' % piv['Weapon'])
    for p in PECAS:
        dados[p]['V'] = dados[p]['V'] - piv[p]
    return piv


def poses():
    """Poses do UnitAnimator para o tipo `ogre` (rad): applyOgreFight (içar em p = 0,42; golpe em p = 0,65), `cast` (braços a -2,3 rad)
    e caminhada. `repouso` = Weapon a -45° em x."""
    wr = np.radians(WEAPON_REST_X)
    sw = 0.55
    return {
        'repouso': {'Weapon': (wr, 0, 0)},
        'caminhada': {'LegL': (0.65, 0, 0), 'LegR': (-0.65, 0, 0), 'ArmL': (-sw, 0, -0.05), 'ArmR': (sw, 0, 0.05),
                      'Torso': (0.05, 0.08, 0.0)},
        'golpe_a': {'Torso': (-0.32, 0, 0), 'Head': (-0.25, 0, 0), 'ArmR': (1.75, 0, -0.3), 'ArmL': (-1.55, 0, 0.3),
                    'Weapon': (0.02, 0, 0)},
        'golpe_b': {'Torso': (0.5, 0, 0), 'Head': (0.4, 0, 0), 'ArmR': (-1.5, 0, -0.3), 'ArmL': (1.3, 0, 0.3),
                    'Weapon': (-2.88, 0, 0)},
        'grito': {'ArmL': (-2.3, 0, -0.25), 'ArmR': (-2.3, 0, 0.25), 'Torso': (-0.12, 0, 0), 'Head': (-0.25, 0, 0),
                  'Weapon': (wr, 0, 0)},
    }


def previa_extra(ctx, rig, objs):
    """Conferência: poses de caminhada e golpe vistas de costas e de lado; peças coloridas; close da cabeça."""
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
    rig.center = Vector((0.0, 0.0, 2.2))
    rig.render('cabeca_pecas', (0.0, 0.1, 1.0), 20, dist=3.2)
    rig.center = centro


def main():
    HC.executar(sys.modules[__name__])


if __name__ == '__main__':
    main()
