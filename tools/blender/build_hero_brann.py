"""
build_hero_brann.py — Capitão Brann (hero_brann): herói humano gerado a partir do cavaleiro modelado no Tripo.

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
import json
import struct

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))

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

PECAS =['Torso', 'Head', 'ArmL', 'ArmR', 'LegL', 'LegR', 'Sword', 'Cape']
CORPO = ['Torso', 'Head', 'ArmL', 'ArmR', 'LegL', 'LegR']       # rótulos vindos dos pesos de pele


def log(*a):
    print('[hero_brann]', *a, flush=True)


# ---------------------------------------------------------------------------
# Utilidades numpy
# ---------------------------------------------------------------------------
def srgb_para_linear(c):
    c = np.asarray(c, dtype=np.float32)
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4).astype(np.float32)


def linear_para_srgb(c):
    c = np.clip(np.asarray(c, dtype=np.float32), 0.0, 1.0)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(c, 1 / 2.4) - 0.055).astype(np.float32)


def pca(P):
    c = P.mean(axis=0)
    Q = P - c
    w, V = np.linalg.eigh(Q.T @ Q / len(Q))
    idx = np.argsort(-w)
    V = V[:, idx]
    proj = Q @ V
    return c, V, proj.max(axis=0) - proj.min(axis=0)


class Fonte:
    """Dados crus do FBX (coordenadas do jogo antes do espelho)."""
    pass


# ---------------------------------------------------------------------------
# "Sopa" de polígonos: vértices com pontuações de peça, cantos com UV e normal
# ---------------------------------------------------------------------------
class Sopa:
    def __init__(self, P, PS):
        self.P = [np.asarray(p, float) for p in P]
        self.PS = [np.asarray(s, float) for s in PS]
        self.fv, self.fuv, self.fn, self.vivo, self.comp = [], [], [], [], []

    def add_face(self, v, uv, n, comp):
        self.fv.append(list(v))
        self.fuv.append([np.asarray(u, float) for u in uv])
        self.fn.append([np.asarray(x, float) for x in n])
        self.vivo.append(True)
        self.comp.append(comp)
        return len(self.fv) - 1

    def add_vert(self, p, ps):
        self.P.append(np.asarray(p, float))
        self.PS.append(np.asarray(ps, float))
        return len(self.P) - 1

    def centro(self, f):
        return np.mean([self.P[v] for v in self.fv[f]], axis=0)

    def cortar(self, ids, eixo, valor):
        """Corta as faces `ids` pelo plano coordenada[eixo] = valor (0 = x, 1 = y). As duas metades herdam UV e normais
        interpoladas e os vértices novos ficam exatamente no plano. Devolve {id: 'cima'|'baixo'} das faces resultantes."""
        y = valor
        lado = {}
        cache = {}      # aresta -> vértice novo

        def vert_na_aresta(a, b):
            k = (min(a, b), max(a, b))
            if k not in cache:
                pa, pb = self.P[k[0]], self.P[k[1]]
                t = (y - pa[eixo]) / (pb[eixo] - pa[eixo])
                p = pa + (pb - pa) * t
                p[eixo] = y
                cache[k] = self.add_vert(p, self.PS[k[0]] + (self.PS[k[1]] - self.PS[k[0]]) * t)
            return cache[k]

        for f in list(ids):
            v, uv, nn = self.fv[f], self.fuv[f], self.fn[f]
            d = [self.P[i][eixo] - y for i in v]
            if all(x >= -1e-9 for x in d) or all(x <= 1e-9 for x in d):
                lado[f] = 'cima' if sum(d) >= 0 else 'baixo'
                continue
            cima, baixo = [], []
            k = len(v)
            for i in range(k):
                j = (i + 1) % k
                a, b = v[i], v[j]
                da, db = d[i], d[j]
                canto = (a, uv[i], nn[i])
                if da > 1e-9:
                    cima.append(canto)
                elif da < -1e-9:
                    baixo.append(canto)
                else:
                    cima.append(canto)
                    baixo.append(canto)
                if (da > 1e-9 and db < -1e-9) or (da < -1e-9 and db > 1e-9):
                    t = da / (da - db)
                    nv = vert_na_aresta(a, b)
                    nu = uv[i] + (uv[j] - uv[i]) * t
                    nm = nn[i] + (nn[j] - nn[i]) * t
                    nm = nm / (np.linalg.norm(nm) + 1e-12)
                    novo = (nv, nu, nm)
                    cima.append(novo)
                    baixo.append(novo)
            self.vivo[f] = False
            for pol, nome in ((cima, 'cima'), (baixo, 'baixo')):
                if len(pol) >= 3:
                    nid = self.add_face([c[0] for c in pol], [c[1] for c in pol], [c[2] for c in pol], self.comp[f])
                    lado[nid] = nome
        return lado


def componentes(nverts, faces):
    """Ilhas de malha por vértices compartilhados: devolve (comp_do_vertice, ordem das ilhas por nº de faces)."""
    pai = list(range(nverts))

    def find(x):
        while pai[x] != x:
            pai[x] = pai[pai[x]]
            x = pai[x]
        return x
    for f in faces:
        r0 = find(f[0])
        for v in f[1:]:
            r = find(v)
            if r != r0:
                pai[r] = r0
    raiz = np.array([find(i) for i in range(nverts)])
    cont = {}
    for f in faces:
        r = raiz[f[0]]
        cont[r] = cont.get(r, 0) + 1
    ordem = sorted(cont, key=lambda r: -cont[r])
    rank = {r: i for i, r in enumerate(ordem)}
    return np.array([rank.get(r, -1) for r in raiz]), cont, ordem


# ---------------------------------------------------------------------------
# Leitura do FBX (Blender)
# ---------------------------------------------------------------------------
def rotulo_osso(b):
    """Osso Mixamo (sem o prefixo 'mixamorig:') -> rótulo de peça do jogo (Left* = ArmL/LegL, Right* = ArmR/LegR)."""
    if b in ('Head', 'HeadTop_End'):
        return 'Head'
    if b in ('Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'LeftShoulder', 'RightShoulder'):
        return 'Torso'
    lado = 'L' if b.startswith('Left') else ('R' if b.startswith('Right') else None)
    if lado and ('Arm' in b or 'Hand' in b):
        return 'Arm' + lado
    if lado and ('Leg' in b or 'Foot' in b or 'Toe' in b):
        return 'Leg' + lado
    raise ValueError('osso sem rótulo: ' + b)


def carregar_pixels(img):
    """Pixels da imagem do Blender como float32 (altura, largura, 3), valores sRGB 0..1, linha 0 = embaixo (como o v da UV)."""
    w, h = img.size
    buf = np.empty(w * h * 4, dtype=np.float32)          # o Blender sempre devolve RGBA
    img.pixels.foreach_get(buf)
    return buf.reshape(h, w, 4)[:, :, :3].copy()


def carregar_fbx(caminho):
    """Importa o FBX (use_image_search=True: o Blender acha a textura na pasta .fbm) e devolve os dados crus em coordenadas do jogo."""
    import bpy
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=caminho, use_image_search=True)
    objs = list(bpy.data.objects)
    malhas = [o for o in objs if o.type == 'MESH']
    if len(malhas) != 1:
        raise RuntimeError('esperava 1 malha no FBX, achei %d' % len(malhas))
    mo = malhas[0]
    me = mo.data
    f = Fonte()
    f.caminho = caminho
    f.objetos = [dict(nome=o.name, tipo=o.type, pai=o.parent.name if o.parent else None) for o in objs]
    f.n_ossos = sum(len(o.data.bones) for o in objs if o.type == 'ARMATURE')
    f.n_acoes = len(bpy.data.actions)
    f.n_modificadores = [m.type for m in mo.modifiers]
    mw = np.array(mo.matrix_world)
    nv, nl, npol = len(me.vertices), len(me.loops), len(me.polygons)
    co = np.empty(nv * 3)
    me.vertices.foreach_get('co', co)
    co = co.reshape(-1, 3)
    co = co @ mw[:3, :3].T + mw[:3, 3]
    f.co = np.stack([co[:, 0], co[:, 2], -co[:, 1]], axis=1)                  # Blender (x,y,z-cima) -> jogo (x,y-cima,z)
    f.loop_v = np.empty(nl, dtype=np.int64)
    me.loops.foreach_get('vertex_index', f.loop_v)
    f.ls = np.empty(npol, dtype=np.int64)
    f.lt = np.empty(npol, dtype=np.int64)
    me.polygons.foreach_get('loop_start', f.ls)
    me.polygons.foreach_get('loop_total', f.lt)
    uv = np.empty(nl * 2)
    me.uv_layers.active.data.foreach_get('uv', uv)
    f.uv = uv.reshape(-1, 2)
    cn = np.empty(nl * 3)
    me.corner_normals.foreach_get('vector', cn)
    cn = cn.reshape(-1, 3) @ mw[:3, :3].T
    f.cn = np.stack([cn[:, 0], cn[:, 2], -cn[:, 1]], axis=1)
    nomes = {g.index: g.name.replace('mixamorig:', '') for g in mo.vertex_groups}
    f.ossos = sorted(set(nomes.values()))
    idx = {n: i for i, n in enumerate(f.ossos)}
    W = np.zeros((nv, len(f.ossos)), dtype=np.float32)
    for v in me.vertices:
        for ge in v.groups:
            W[v.index, idx[nomes[ge.group]]] = ge.weight
    f.W = W
    f.pos_ossos = {}
    for o in objs:
        if o.type == 'ARMATURE':
            for b in o.data.bones:
                h = o.matrix_world @ b.head_local
                f.pos_ossos[b.name.replace('mixamorig:', '')] = np.array([h.x, h.z, -h.y])
    # material e imagem
    f.materiais = []
    f.imagem = None
    for m in me.materials:
        info = dict(nome=m.name, nos=[], base_color='?')
        if m.node_tree:
            for n in m.node_tree.nodes:
                info['nos'].append(n.bl_idname)
                if n.bl_idname == 'ShaderNodeBsdfPrincipled':
                    s = n.inputs['Base Color']
                    info['base_color'] = ('ligado a %s' % s.links[0].from_node.bl_idname) if s.is_linked else 'cor constante'
                    sn = n.inputs['Normal']
                    info['normal'] = ('ligado a %s' % sn.links[0].from_node.bl_idname) if sn.is_linked else 'não ligado'
                    info['metallic'] = round(n.inputs['Metallic'].default_value, 3)
                    info['roughness'] = round(n.inputs['Roughness'].default_value, 3)
                if n.bl_idname == 'ShaderNodeNormalMap':
                    info['normal_map_color_ligado'] = n.inputs['Color'].is_linked
                if n.bl_idname == 'ShaderNodeTexImage' and n.image is not None and f.imagem is None:
                    im = n.image
                    f.imagem = dict(nome=im.name, caminho=bpy.path.abspath(im.filepath), origem=im.source,
                                    empacotada=bool(im.packed_file), tamanho=list(im.size),
                                    carregada=bool(im.has_data), espaco=im.colorspace_settings.name)
                    if not im.has_data:
                        im.reload()
                    f.pixels = carregar_pixels(im)
        f.materiais.append(info)
    if f.imagem is None:
        raise RuntimeError('textura não encontrada (use_image_search): confira a pasta .fbm ao lado do FBX')
    # tudo já foi copiado para numpy: o modelo importado fica na cena só escondido (as prévias de avaliação o mostram)
    f.obj_malha = mo
    for o in objs:
        o.hide_render = True
        o.hide_viewport = True
    return f


def avaliar_fonte(f):
    """Passo 1 da avaliação (textura, UV): imprime a evidência medida no Blender."""
    log('--- AVALIAÇÃO: objetos / materiais / textura ---')
    for o in f.objetos:
        log('objeto', o)
    log('ossos do rig:', f.n_ossos, ' ações:', f.n_acoes, ' modificadores da malha:', f.n_modificadores)
    for m in f.materiais:
        log('material', json.dumps(m, ensure_ascii=False))
    log('imagem', json.dumps(f.imagem, ensure_ascii=False))
    nl = len(f.uv)
    fora = int(((f.uv < -1e-4) | (f.uv > 1 + 1e-4)).any(axis=1).sum())
    log('UV: u [%.4f, %.4f] v [%.4f, %.4f]  cantos fora de 0..1: %d de %d' %
        (f.uv[:, 0].min(), f.uv[:, 0].max(), f.uv[:, 1].min(), f.uv[:, 1].max(), fora, nl))
    tris = []
    for i in range(len(f.ls)):
        c = f.uv[f.ls[i]:f.ls[i] + f.lt[i]]
        for k in range(1, len(c) - 1):
            tris.append((c[0], c[k], c[k + 1]))
    tris = np.array(tris)
    uni, soma = cobertura_uv(tris, 1024)
    log('UV: área usada (união dos triângulos, grade 1024²) = %.1f %%; soma das áreas = %.1f %%' % (uni * 100, soma * 100))


# ---------------------------------------------------------------------------
# Espelho + escala + "sopa"
# ---------------------------------------------------------------------------
def construir_sopa(f):
    """Espelha em x, escala (topo = TOPO), centra (x0, z0) e cria a sopa de polígonos. Devolve (sopa, S)."""
    S = TOPO / float(f.co[:, 1].max())
    P = np.empty_like(f.co)
    P[:, 0] = -(f.co[:, 0] - X0) * S
    P[:, 1] = f.co[:, 1] * S
    P[:, 2] = (f.co[:, 2] - Z0) * S
    idx = {n: i for i, n in enumerate(CORPO)}
    PS = np.zeros((len(P), len(CORPO)))
    for bi, b in enumerate(f.ossos):
        PS[:, idx[rotulo_osso(b)]] += f.W[:, bi]
    sopa = Sopa(P, PS)
    sopa.n_orig = len(P)
    sopa.mao_r = f.W[:, [i for i, b in enumerate(f.ossos) if b.startswith('RightHand')]].sum(axis=1)
    for i in range(len(f.ls)):
        l0, n = f.ls[i], f.lt[i]
        vv = f.loop_v[l0:l0 + n]
        uvs = f.uv[l0:l0 + n]
        nn = f.cn[l0:l0 + n].copy()
        nn[:, 0] *= -1                        # normais espelhadas em x
        sopa.add_face(vv[::-1], uvs[::-1], nn[::-1], -1)   # o espelho inverte o enrolamento
    comp_v, cont, _ = componentes(len(P), sopa.fv)
    sopa.comp_v = comp_v
    for i in range(len(sopa.fv)):
        sopa.comp[i] = int(comp_v[sopa.fv[i][0]])
    return sopa, S


def conferir_enrolamento(sopa):
    """Fração das faces cujo enrolamento (normal geométrica) concorda com as normais de canto (já espelhadas)."""
    ok = tot = 0
    for f in range(len(sopa.fv)):
        if not sopa.vivo[f]:
            continue
        p = [sopa.P[v] for v in sopa.fv[f]]
        n = np.cross(p[1] - p[0], p[2] - p[0])
        if np.linalg.norm(n) < 1e-12:
            continue
        tot += 1
        if np.dot(n, np.mean(sopa.fn[f], axis=0)) > 0:
            ok += 1
    return ok, tot


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


def mapa_arestas(sopa, ids):
    em = {}
    for f in ids:
        v = sopa.fv[f]
        for i in range(len(v)):
            a, b = v[i], v[(i + 1) % len(v)]
            em.setdefault((min(a, b), max(a, b)), []).append(f)
    return em


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


def segmentar(sopa, S, avaliar=False):
    """Atribui cada face a uma peça. Devolve {peça: [ids das faces]}."""
    destino, info = classificar_ilhas(sopa, S)
    sopa.n_faces_orig = len(sopa.fv)
    for c in sorted(info):
        d = info[c]
        if c < 6 or destino[c] in ('Sword', 'Cape', 'bota'):
            log('ilha %2d: %4d faces  x[%.2f,%.2f] y[%.2f,%.2f] z[%.2f,%.2f] -> %s' %
                (c, d['faces'], d['lo'][0], d['hi'][0], d['lo'][1], d['hi'][1], d['lo'][2], d['hi'][2], destino[c]))
    log('ilhas de malha: %d (acessórios pequenos -> Torso: %d)' % (len(info), sum(1 for c in destino if destino[c] == 'Torso')))
    if avaliar:
        avaliar_ilhas(sopa, destino, S)
    # 1. corte plano das pernas
    ids0 = [f for f in range(len(sopa.fv)) if sopa.vivo[f] and destino[sopa.comp[f]] == 'corpo']
    sopa.cortar(ids0, 1, Y_PERNA * S)
    for sinal in (1, -1):                      # ombros: planos verticais x = ±OMBRO_X (só na altura em que braço e tronco se tocam)
        alvo = [f for f in range(len(sopa.fv)) if sopa.vivo[f] and destino[sopa.comp[f]] == 'corpo'
                and sopa.centro(f)[1] >= (OMBRO_Y - 0.1) * S]
        sopa.cortar(alvo, 0, sinal * OMBRO_X * S)
    ids = [f for f in range(len(sopa.fv)) if sopa.vivo[f] and destino[sopa.comp[f]] == 'corpo']
    log('corpo: %d faces (%d antes dos cortes planos: pernas y=%.3f, ombros x=±%.3f)' %
        (len(ids), len(ids0), Y_PERNA * S, OMBRO_X * S))
    # 2. rótulo inicial pelos pesos de pele
    rot = {f: CORPO[int(np.argmax(np.sum([sopa.PS[v] for v in sopa.fv[f]], axis=0)))] for f in ids}
    cen = {f: sopa.centro(f) for f in ids}
    em = mapa_arestas(sopa, ids)
    adj = {f: set() for f in ids}
    for fl in em.values():
        for a in fl:
            for b in fl:
                if a != b:
                    adj[a].add(b)
    # 3. suavização (voto da vizinhança) para tirar o serrilhado dos pesos
    for _ in range(SUAVIZACAO):
        novo = {}
        for f in ids:
            votos = {rot[f]: 1.5}
            for g in adj[f]:
                votos[rot[g]] = votos.get(rot[g], 0) + 1.0
            novo[f] = max(votos, key=votos.get)
        rot = novo
    # 4. regras geométricas (plano das pernas, tabardo, arcos da gola)
    for f in ids:
        rot[f] = regras_corpo(cen[f], rot[f], S)
    # 5. cada peça deve ser UMA região conexa: ilhas menores vão para o rótulo vizinho dominante
    for _ in range(6):
        mudou = False
        por = {}
        for f in ids:
            por.setdefault(rot[f], []).append(f)
        for r, fl in por.items():
            fs, vistos, comps = set(fl), set(), []
            for f in fl:
                if f in vistos:
                    continue
                pilha, comp = [f], [f]
                vistos.add(f)
                while pilha:
                    x = pilha.pop()
                    for y in adj[x]:
                        if y in fs and y not in vistos:
                            vistos.add(y)
                            pilha.append(y)
                            comp.append(y)
                comps.append(comp)
            comps.sort(key=len, reverse=True)
            for comp in comps[1:]:
                cont = {}
                for x in comp:
                    for y in adj[x]:
                        if rot[y] != r:
                            cont[rot[y]] = cont.get(rot[y], 0) + 1
                if cont:
                    novo = max(cont, key=cont.get)
                    for x in comp:
                        rot[x] = novo
                    mudou = True
        if not mudou:
            break
    partes = {p: [] for p in PECAS}
    for f in ids:
        partes[rot[f]].append(f)
    for f in range(len(sopa.fv)):
        if not sopa.vivo[f]:
            continue
        d = destino[sopa.comp[f]]
        if d == 'corpo':
            continue
        if d == 'bota':
            d = 'LegR' if sopa.centro(f)[0] > 0 else 'LegL'
        partes[d].append(f)
    for p in PECAS:
        log('peça %-6s %5d faces' % (p, len(partes[p])))
    return partes


# ---------------------------------------------------------------------------
# Peças: extração, tampas nas aberturas de corte, pivôs
# ---------------------------------------------------------------------------
def aberturas_de_corte(sopa, partes):
    """Para cada peça do corpo, as arestas de fronteira que a ligam a OUTRA peça (cortes), agrupadas em laços fechados.
    Fronteiras originais da malha (bainhas da capa, bocas das botas...) não entram. Devolve {peça: [laço]}, onde laço =
    lista de (a, b, face) com a aresta dirigida no enrolamento da face da peça."""
    dono = {}
    for p, ids in partes.items():
        for f in ids:
            dono[f] = p
    em = mapa_arestas(sopa, list(dono))
    saida = {}
    for p in CORPO:
        arestas = []
        for f in partes[p]:
            v = sopa.fv[f]
            for i in range(len(v)):
                a, b = v[i], v[(i + 1) % len(v)]
                viz = [g for g in em[(min(a, b), max(a, b))] if g != f]
                if not viz or any(dono.get(g) == p for g in viz):
                    continue
                arestas.append((a, b, f))
        saida[p] = montar_lacos(sopa, arestas, p)
    return saida


def montar_lacos(sopa, arestas, nome):
    """Encadeia arestas dirigidas em laços. Cadeias abertas (arestas não-manifold no corte) são fechadas por uma aresta
    virtual (face None) entre o fim de uma e o começo da mais próxima."""
    prox = {}
    for e in arestas:
        prox.setdefault(e[0], []).append(e)
    usados, cadeias = set(), []
    for e in arestas:
        if id(e) in usados:
            continue
        cad, atual = [e], e
        usados.add(id(e))
        while atual[1] != cad[0][0]:
            cand = [x for x in prox.get(atual[1], []) if id(x) not in usados]
            if not cand:
                break
            atual = cand[0]
            usados.add(id(atual))
            cad.append(atual)
        cadeias.append(cad)
    lacos, abertas = [], []
    for cad in cadeias:
        (lacos if cad[-1][1] == cad[0][0] else abertas).append(cad)
    while abertas:
        cad = abertas.pop(0)
        fim = sopa.P[cad[-1][1]]
        # mais próxima: a própria cadeia (fecha sozinha) ou o começo de outra
        melhor, dmin = None, np.linalg.norm(fim - sopa.P[cad[0][0]])
        for k, outra in enumerate(abertas):
            d = np.linalg.norm(fim - sopa.P[outra[0][0]])
            if d < dmin:
                melhor, dmin = k, d
        if dmin > 0.3:
            log('AVISO: %s: cadeia de corte aberta com folga de %.2f; ignorada' % (nome, dmin))
            continue
        if melhor is None:
            cad.append((cad[-1][1], cad[0][0], None))
            lacos.append(cad)
        else:
            outra = abertas.pop(melhor)
            abertas.insert(0, cad + [(cad[-1][1], outra[0][0], None)] + outra)
    return [l for l in lacos if len(l) >= 3]


def amostrar(pixels, u, v):
    """Cor bilinear (sRGB 0..1) em (u, v); pixels com linha 0 embaixo."""
    h, w, _ = pixels.shape
    x = min(max(u * w - 0.5, 0.0), w - 1.001)
    y = min(max(v * h - 0.5, 0.0), h - 1.001)
    x0, y0 = int(x), int(y)
    fx, fy = x - x0, y - y0
    return (pixels[y0, x0] * (1 - fx) * (1 - fy) + pixels[y0, x0 + 1] * fx * (1 - fy) +
            pixels[y0 + 1, x0] * (1 - fx) * fy + pixels[y0 + 1, x0 + 1] * fx * fy)


def cor_da_face(sopa, pixels, f):
    uv = np.array(sopa.fuv[f])
    c = uv.mean(axis=0)
    pts = [c] + [c * 0.5 + u * 0.5 for u in uv]
    return np.mean([amostrar(pixels, p[0], p[1]) for p in pts], axis=0)


def extrair_parte(sopa, ids, lacos, pixels=None):
    """Arrays da peça (V, F, UV por canto, normais por canto) + tampas nas aberturas de corte. As faces de tampa vêm
    depois das `n_orig` faces originais; 'tampas' = lista de dicts (faces da tampa, cor média da borda, faces vizinhas)."""
    usados = sorted({v for f in ids for v in sopa.fv[f]})
    remap = {v: i for i, v in enumerate(usados)}
    V = [sopa.P[v].copy() for v in usados]
    F = [[remap[v] for v in sopa.fv[f]] for f in ids]
    UV = [[u.copy() for u in sopa.fuv[f]] for f in ids]
    N = [[n.copy() for n in sopa.fn[f]] for f in ids]
    tampas = []
    existentes = {frozenset(f) for f in F}           # triângulo de tampa igual a uma face da peça = face duplicada (inválido)
    for laco in lacos:
        verts = [remap[e[0]] for e in laco]
        c = np.mean([V[i] for i in verts], axis=0)
        if pixels is not None:
            cor = linear_para_srgb(np.mean([srgb_para_linear(cor_da_face(sopa, pixels, e[2]))
                                            for e in laco if e[2] is not None], axis=0))
        else:
            cor = np.array([0.5, 0.5, 0.5], dtype=np.float32)
        tris = triangular_laco([V[i] for i in verts])
        imperfeitos = getattr(triangular_laco, 'imperfeitos', 0) if tris is not None else 0
        usou_leque = tris is None
        if usou_leque:                                # laço dobrado demais para a projeção: leque a partir do centro
            ci = len(V)
            V.append(c)
            tris = [(k, (k + 1) % len(verts), None) for k in range(len(verts))]
        faces_tampa = []
        for (i, j, k) in tris:
            # o laço segue o enrolamento da peça; a tampa precisa do sentido oposto para fechar a superfície
            tri = [verts[k] if k is not None else ci, verts[j], verts[i]]
            if frozenset(tri) in existentes:
                continue
            existentes.add(frozenset(tri))
            n = np.cross(V[tri[1]] - V[tri[0]], V[tri[2]] - V[tri[0]])
            if np.linalg.norm(n) < 1e-12:
                continue
            n = n / np.linalg.norm(n)
            F.append(tri)
            UV.append([np.zeros(2)] * 3)
            N.append([n, n, n])
            faces_tampa.append(len(F) - 1)
        tampas.append(dict(faces=faces_tampa, cor=cor, centro=c, n_arestas=len(laco), leque=usou_leque,
                           imperfeitos=imperfeitos, borda=[e[2] for e in laco if e[2] is not None]))
    return dict(V=np.array(V), F=F, UV=UV, N=N, tampas=tampas, n_orig=len(ids))


def triangular_laco(pts):
    """Triangula um laço 3D fechado (lista de pontos na ordem do laço) por 'orelhas' no plano de melhor ajuste.
    Devolve [(i, j, k)] em índices da lista, na mesma orientação do laço, ou None se a projeção se auto-intersecta."""
    P = np.array(pts, dtype=float)
    n = len(P)
    if n < 3:
        return None
    # normal de Newell (regra da mão direita no sentido do laço) e base do plano
    nv = np.zeros(3)
    for i in range(n):
        a, b = P[i], P[(i + 1) % n]
        nv += np.array([(a[1] - b[1]) * (a[2] + b[2]), (a[2] - b[2]) * (a[0] + b[0]), (a[0] - b[0]) * (a[1] + b[1])])
    if np.linalg.norm(nv) < 1e-12:
        return None
    nv /= np.linalg.norm(nv)
    aux = np.array([1.0, 0, 0]) if abs(nv[0]) < 0.9 else np.array([0, 1.0, 0])
    u = np.cross(nv, aux)
    u /= np.linalg.norm(u)
    v = np.cross(nv, u)
    Q = np.stack([P @ u, P @ v], axis=1)

    def area2(a, b, c):
        return (Q[b][0] - Q[a][0]) * (Q[c][1] - Q[a][1]) - (Q[b][1] - Q[a][1]) * (Q[c][0] - Q[a][0])

    def dentro(p, a, b, c):
        d1, d2, d3 = area2(a, b, p), area2(b, c, p), area2(c, a, p)
        return d1 > 1e-12 and d2 > 1e-12 and d3 > 1e-12

    idx = list(range(n))
    tris = []
    imperfeito = 0
    while len(idx) > 3:
        m = len(idx)
        for pos in range(m):
            a, b, c = idx[(pos - 1) % m], idx[pos], idx[(pos + 1) % m]
            ar = area2(a, b, c)
            if abs(ar) <= 1e-12:                     # vértice colinear: só some
                idx.pop(pos)
                break
            if ar < 0:
                continue                             # reflexo
            if any(dentro(j, a, b, c) for j in idx if j not in (a, b, c)):
                continue
            tris.append((a, b, c))
            idx.pop(pos)
            break
        else:
            # laço que se toca/auto-intersecta na projeção: corta a "orelha" com menos vértices dentro (cobertura aproximada)
            melhor, mp = None, None
            for pos in range(m):
                a, b, c = idx[(pos - 1) % m], idx[pos], idx[(pos + 1) % m]
                ar = area2(a, b, c)
                dentro_n = sum(1 for j in idx if j not in (a, b, c) and dentro(j, a, b, c))
                chave = (dentro_n, -ar)
                if melhor is None or chave < melhor:
                    melhor, mp = chave, pos
            a, b, c = idx[(mp - 1) % m], idx[mp], idx[(mp + 1) % m]
            tris.append((a, b, c))
            idx.pop(mp)
            imperfeito += 1
    if len(idx) == 3 and abs(area2(*idx)) > 1e-12:
        tris.append(tuple(idx))
    triangular_laco.imperfeitos = imperfeito
    return tris


def cobertura_uv(tris, res):
    """Fração do quadrado UV coberta por triângulos (rasterização) e soma das áreas."""
    g = np.zeros((res, res), dtype=bool)
    soma = 0.0
    for t in tris:
        pts = t * res
        (ax, ay), (bx, by), (cx, cy) = pts
        ar = ((bx - ax) * (cy - ay) - (cx - ax) * (by - ay)) / 2.0
        soma += abs(ar) / (res * res)
        if abs(ar) < 1e-12:
            continue
        x0, x1 = max(int(math.floor(min(ax, bx, cx))), 0), min(int(math.ceil(max(ax, bx, cx))), res - 1)
        y0, y1 = max(int(math.floor(min(ay, by, cy))), 0), min(int(math.ceil(max(ay, by, cy))), res - 1)
        X, Y = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
        w0 = ((bx - X) * (cy - Y) - (cx - X) * (by - Y)) / (2 * ar)
        w1 = ((cx - X) * (ay - Y) - (ax - X) * (cy - Y)) / (2 * ar)
        w2 = 1.0 - w0 - w1
        ins = (w0 >= -1e-6) & (w1 >= -1e-6) & (w2 >= -1e-6)
        if ins.any():
            g[y0:y1 + 1, x0:x1 + 1] |= ins
        else:
            px, py = int((ax + bx + cx) / 3), int((ay + by + cy) / 3)
            if 0 <= px < res and 0 <= py < res:
                g[py, px] = True
    return g.sum() / (res * res), soma


# ---------------------------------------------------------------------------
# Martelo: orientação (cabeça no topo, cabo para baixo, face de impacto para +Z) e empunhadura
# ---------------------------------------------------------------------------
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


# ---------------------------------------------------------------------------
# Atlas 512²: reamostragem da textura do Tripo, capa em cinza (TeamColor) e UV das tampas
# ---------------------------------------------------------------------------
def rasterizar(tris, valores, res):
    """Rasteriza triângulos UV (m,3,2 em 0..1) numa grade (res,res) int32 com o 'valor' do triângulo (0 = vazio).
    Linha 0 = embaixo (v = 0), como os pixels do Blender."""
    g = np.zeros((res, res), dtype=np.int32)
    for t, val in zip(tris, valores):
        pts = t * res
        (ax, ay), (bx, by), (cx, cy) = pts
        ar = ((bx - ax) * (cy - ay) - (cx - ax) * (by - ay)) / 2.0
        if abs(ar) < 1e-12:
            continue
        x0, x1 = max(int(math.floor(min(ax, bx, cx))), 0), min(int(math.ceil(max(ax, bx, cx))), res - 1)
        y0, y1 = max(int(math.floor(min(ay, by, cy))), 0), min(int(math.ceil(max(ay, by, cy))), res - 1)
        X, Y = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
        w0 = ((bx - X) * (cy - Y) - (cx - X) * (by - Y)) / (2 * ar)
        w1 = ((cx - X) * (ay - Y) - (ax - X) * (cy - Y)) / (2 * ar)
        w2 = 1.0 - w0 - w1
        ins = (w0 >= -0.02) & (w1 >= -0.02) & (w2 >= -0.02)
        if not ins.any():
            px, py = int((ax + bx + cx) / 3), int((ay + by + cy) / 3)
            if 0 <= px < res and 0 <= py < res:
                g[py, px] = val
            continue
        sub = g[y0:y1 + 1, x0:x1 + 1]
        sub[ins] = val
    return g


def dilatar_rotulos(g, n):
    """Expande os rótulos não nulos por n pixels (vizinhança de 4), sem sobrescrever."""
    g = g.copy()
    for _ in range(n):
        novo = g.copy()
        for eixo, passo in ((0, 1), (0, -1), (1, 1), (1, -1)):
            sh = np.roll(g, passo, axis=eixo)
            m = (novo == 0) & (sh != 0)
            novo[m] = sh[m]
        g = novo
    return g


def reamostrar(pixels, res=ATLAS):
    """Média 8x8 em luz linear (gama correta): 4096² -> 512²."""
    h, w, _ = pixels.shape
    if h % res or w % res:
        raise RuntimeError('textura %dx%d não é múltipla de %d' % (w, h, res))
    kh, kw = h // res, w // res
    lin = srgb_para_linear(pixels).reshape(res, kh, res, kw, 3).mean(axis=(1, 3))
    return linear_para_srgb(lin)


def uv_da_tampa(arr, sopa, borda, cor_alvo):
    """UV (um ponto só) para os cantos de uma tampa: o trecho mais liso e mais parecido com a cor média da borda
    entre as faces vizinhas do corte, na própria textura 512² (o atlas do Tripo é denso: não sobra bloco livre)."""
    res = arr.shape[0]
    melhor, pior = None, 1e9
    for f in borda:
        uv = np.mean(sopa.fuv[f], axis=0)
        x, y = int(uv[0] * res), int(uv[1] * res)
        x0, x1, y0, y1 = max(x - 3, 0), min(x + 4, res), max(y - 3, 0), min(y + 4, res)
        patch = arr[y0:y1, x0:x1].reshape(-1, 3)
        pontos = 2.0 * float(patch.std(axis=0).sum()) + float(np.abs(patch.mean(axis=0) - cor_alvo).sum())
        if pontos < pior:
            melhor, pior = ((x + 0.5) / res, (y + 0.5) / res), pontos
    return melhor


def construir_atlas(f, dados):
    """Devolve (imagem sRGB float (512,512,3), info): textura do Tripo reamostrada e capa em cinza (TeamColor)."""
    arr = reamostrar(f.pixels)
    res = arr.shape[0]
    # ocupação: triângulos UV das faces originais de cada peça
    tris, vals = [], []
    for p in PECAS:
        d = dados[p]
        for i in range(d['n_orig']):
            uv = np.array(d['UV'][i])
            for k in range(1, len(uv) - 1):
                tris.append(np.array([uv[0], uv[k], uv[k + 1]]))
                vals.append(1 if p == 'Cape' else 2)
    tris = np.array(tris)
    # peças que não são a capa primeiro, a capa por cima
    ordem = np.argsort(np.array(vals) == 1, kind='stable')
    g = rasterizar(tris[ordem], np.array(vals)[ordem], res)
    gd = dilatar_rotulos(g, 4)
    # capa em cinza: luma sRGB com ganho para o tecido ficar ~0.72 (multiplica a cor do time no jogo)
    luma = arr @ np.array([0.299, 0.587, 0.114], dtype=np.float32)
    nucleo = (g == 1)
    mediana = float(np.median(luma[nucleo])) if nucleo.any() else 0.2
    ganho = 0.72 / max(mediana, 1e-3)
    cinza = np.clip(luma * ganho, 0.0, 1.0)
    capa = (gd == 1)
    arr[capa] = cinza[capa][:, None]
    vals_a = np.array(vals)
    outros = rasterizar(tris[vals_a == 2], np.full(int((vals_a == 2).sum()), 2), res) != 0
    conflito = int((nucleo & outros).sum())
    info = dict(ganho_capa=round(ganho, 2), mediana_capa=round(mediana, 3), px_capa=int(capa.sum()),
                cobertura_512=round(float((g != 0).mean()), 3), texels_capa_compartilhados=conflito)
    return arr, info


# ---------------------------------------------------------------------------
# Cena do Blender: hierarquia, materiais, exportação
# ---------------------------------------------------------------------------
def criar_objeto(C, nome, d, pivo, raiz, material):
    """Malha da peça (vértices já relativos ao pivô, coordenadas do jogo) -> objeto filho de `raiz` em `pivo`."""
    import bpy
    verts = [tuple(C.g(*v)) for v in d['V']]
    faces, uvs, nrm = [], [], []
    for f, uv, nn in zip(d['F'], d['UV'], d['N']):
        if len(set(f)) != len(f):
            continue                                   # face degenerada (vértice repetido)
        faces.append(tuple(f))
        uvs.extend([tuple(u) for u in uv])
        nrm.extend([tuple(C.g(*(n / (np.linalg.norm(n) + 1e-12)))) for n in nn])
    me = bpy.data.meshes.new(nome)
    me.from_pydata(verts, [], faces, shade_flat=False)
    me.update()
    if len(me.polygons) != len(faces) or len(me.loops) != len(nrm):
        raise RuntimeError('%s: faces/cantos mudaram na criação da malha' % nome)
    uvl = me.uv_layers.new(name='UVMap')
    uvl.data.foreach_set('uv', np.array(uvs, dtype=np.float32).ravel())
    me.polygons.foreach_set('use_smooth', [True] * len(me.polygons))
    me.normals_split_custom_set(nrm)
    me.materials.append(material)
    obj = bpy.data.objects.new(nome, me)
    bpy.context.scene.collection.objects.link(obj)
    obj.parent = raiz
    obj.location = C.g(*pivo)
    return obj


def webp_dimensoes(dados):
    """Largura e altura de um WebP (VP8, VP8L ou VP8X) a partir dos bytes."""
    if dados[:4] != b'RIFF' or dados[8:12] != b'WEBP':
        return None
    tipo = dados[12:16]
    if tipo == b'VP8 ':
        w, h = struct.unpack_from('<HH', dados, 26)
        return w & 0x3fff, h & 0x3fff
    if tipo == b'VP8L':
        b = struct.unpack_from('<I', dados, 21)[0]
        return (b & 0x3fff) + 1, ((b >> 14) & 0x3fff) + 1
    if tipo == b'VP8X':
        w = 1 + (dados[24] | dados[25] << 8 | dados[26] << 16)
        h = 1 + (dados[27] | dados[28] << 8 | dados[29] << 16)
        return w, h
    return None


def verificar_glb(path):
    """Lê o JSON do GLB e imprime nós, materiais, imagens e contagens (evidência do passo G)."""
    with open(path, 'rb') as fh:
        data = fh.read()
    jl = struct.unpack_from('<I', data, 12)[0]
    j = json.loads(data[20:20 + jl].decode('utf-8'))
    bl = 20 + jl
    cl, ct = struct.unpack_from('<II', data, bl)
    binario = data[bl + 8:bl + 8 + cl]
    log('GLB: %.1f KB' % (len(data) / 1024.0), ' extensões:', j.get('extensionsUsed'))
    nos = j['nodes']
    for i, n in enumerate(nos):
        desc = {k: [round(x, 4) for x in n[k]] for k in ('translation', 'rotation', 'scale') if k in n}
        log('  nó %-8s mesh=%s filhos=%s %s' % (n.get('name'), n.get('mesh'), n.get('children'), json.dumps(desc)))
    log('  malhas: %d  materiais: %s' % (len(j['meshes']), [(m['name'], m.get('doubleSided')) for m in j['materials']]))
    draws = sum(len(m['primitives']) for m in j['meshes'])
    tris = 0
    for m in j['meshes']:
        for p in m['primitives']:
            tris += j['accessors'][p['indices']]['count'] // 3
    log('  draw calls (primitivas): %d  triângulos: %d' % (draws, tris))
    for im in j.get('images', []):
        bv = j['bufferViews'][im['bufferView']]
        dim = webp_dimensoes(binario[bv.get('byteOffset', 0):bv.get('byteOffset', 0) + bv['byteLength']])
        log('  imagem %s %s %s bytes=%d' % (im.get('name'), im.get('mimeType'), dim, bv['byteLength']))
    return j, draws, tris


def avaliar_rosto(sopa, ids, pixels):
    """Regra do projeto: textura de rosto só na face frontal (+Z) da cabeça. Conta faces cor-de-pele (matiz 8-21°,
    saturação 0,35-0,70, valor 0,28-0,65 na textura) por região da cabeça (coordenadas finais, frente = +z)."""
    import colorsys
    cen = np.array([sopa.centro(f) for f in ids])
    lo, hi = cen.min(axis=0), cen.max(axis=0)
    z_frente = lo[2] + 0.66 * (hi[2] - lo[2])

    def regiao(c):
        if c[1] > lo[1] + 0.8 * (hi[1] - lo[1]):
            return 'topo'
        if c[2] < lo[2] + 0.15 * (hi[2] - lo[2]):
            return 'nuca'
        if c[2] > z_frente - 0.06 and abs(c[0]) < 0.12:
            return 'frente'
        return 'laterais/interior'
    tot, pele, pele_xyz = {}, {}, []
    for f, c in zip(ids, cen):
        r, g, b = cor_da_face(sopa, pixels, f)
        h, s, v = colorsys.rgb_to_hsv(float(r), float(g), float(b))
        k = regiao(c)
        tot[k] = tot.get(k, 0) + 1
        if 8 <= h * 360 <= 21 and 0.35 <= s <= 0.70 and 0.28 <= v <= 0.65:
            pele[k] = pele.get(k, 0) + 1
            pele_xyz.append(c)
    pele_xyz = np.array(pele_xyz)
    log('--- AVALIAÇÃO: rosto (cabeça = %d faces; x [%.2f, %.2f] y [%.2f, %.2f] z [%.2f, %.2f]) ---' %
        (len(ids), lo[0], hi[0], lo[1], hi[1], lo[2], hi[2]))
    for k in tot:
        log('  região %-18s %4d faces, %3d com cor de pele' % (k, tot[k], pele.get(k, 0)))
    if len(pele_xyz):
        log('  faces de pele ocupam x [%.2f, %.2f] y [%.2f, %.2f] z [%.2f, %.2f] (só no miolo da cabeça, atrás da abertura do elmo)' %
            (pele_xyz[:, 0].min(), pele_xyz[:, 0].max(), pele_xyz[:, 1].min(), pele_xyz[:, 1].max(),
             pele_xyz[:, 2].min(), pele_xyz[:, 2].max()))
        log('  centroide da pele em z = %.3f, da cabeça em z = %.3f: a pele fica %.3f à frente -> o rosto olha para +Z' %
            (pele_xyz[:, 2].mean(), cen[:, 2].mean(), pele_xyz[:, 2].mean() - cen[:, 2].mean()))


def avaliar_partes(dados, piv):
    """Contagens e faixas locais de cada peça (para comparar com o knight.glb)."""
    log('--- peças (coordenadas locais ao pivô) ---')
    tris = 0
    for p in PECAS:
        d = dados[p]
        V = d['V']
        t = sum(len(f) - 2 for f in d['F'])
        tris += t
        log('  %-6s pivô (%.3f, %.3f, %.3f)  %5d tris  %d tampas (%d orelhas aproximadas, %d leques)  x [%.2f, %.2f] y [%.2f, %.2f] z [%.2f, %.2f]' %
            (p, piv[p][0], piv[p][1], piv[p][2], t, len(d['tampas']), sum(x['imperfeitos'] for x in d['tampas']),
             sum(1 for x in d['tampas'] if x['leque']),
             V[:, 0].min(), V[:, 0].max(), V[:, 1].min(), V[:, 1].max(), V[:, 2].min(), V[:, 2].max()))
    log('  total %d triângulos' % tris)


# ---------------------------------------------------------------------------
# Prévias e testes de pose (Blender, Eevee)
# ---------------------------------------------------------------------------
def rot_three(C, obj, rx, ry, rz):
    """Rotação Euler XYZ do three.js (matriz Rx·Ry·Rz, ângulos em rad) aplicada ao nó, como o UnitAnimator faz."""
    from mathutils import Matrix
    mx = Matrix.Rotation(rx, 4, 'X')
    my = Matrix.Rotation(ry, 4, 'Y')
    mz = Matrix.Rotation(rz, 4, 'Z')
    rb = C.game_to_blender_matrix(mx @ my @ mz)
    loc = obj.location.copy()
    obj.rotation_mode = 'XYZ'
    obj.rotation_euler = rb.to_euler('XYZ')
    obj.location = loc


def poses_unit_animator():
    """Poses do UnitAnimator (src/animation/UnitAnimator.js) em rad: {nó: (rx, ry, rz)}."""
    sw = 0.55
    return {
        'repouso': {'Sword': (0.5, 0, -0.1)},
        'caminhada': {'LegL': (0.65, 0, 0), 'LegR': (-0.65, 0, 0), 'ArmL': (-sw, 0, -0.05), 'ArmR': (sw, 0, 0.05),
                      'Torso': (0.05, 0.08, 0.0), 'Sword': (0.5 + sw * 0.4, 0, -0.1)},
        'golpe': {'Torso': (0, -0.5, 0), 'ArmR': (-1.15, -0.4, 0.0), 'Sword': (-0.3, 0, -0.1), 'Head': (0, 0.2, 0)},
        'magia': {'ArmL': (-2.3, 0, -0.25), 'ArmR': (-2.3, 0, 0.25), 'Torso': (-0.12, 0, 0), 'Head': (-0.25, 0, 0),
                  'Sword': (0.5, 0, -0.1)},
    }


def renderizar_poses(C, objs, rig, nomes=('caminhada', 'golpe', 'magia')):
    todas = poses_unit_animator()
    for nome in nomes:
        for p in PECAS:
            if p in objs:
                rot_three(C, objs[p], 0, 0, 0)
        for p, (rx, ry, rz) in todas['repouso'].items():
            rot_three(C, objs[p], rx, ry, rz)
        for p, (rx, ry, rz) in todas[nome].items():
            rot_three(C, objs[p], rx, ry, rz)
        rig.render('pose_' + nome, (-1.0, 0.6, 1.0), 30, zoom=ZOOM_PREVIA)
    for p in PECAS:
        rot_three(C, objs[p], 0, 0, 0)
    rot_three(C, objs['Sword'], 0.5, 0, -0.1)


def renderizar_rosto(C, rig, previas):
    """Quatro close-ups da cabeça (frente, lado, costas, topo) numa colagem 512x512: o rosto só aparece na frente (+Z)."""
    import bpy
    from mathutils import Vector
    esc = rig.scene.render
    antes = (esc.resolution_x, esc.resolution_y)
    centro_antes = rig.center.copy()
    esc.resolution_x = esc.resolution_y = 256
    rig.center = Vector((0.0, 0.03, 1.82))          # Blender (x, -z, y): cabeça em (0, 1.82, -0.03)
    vistas = [('f', (0.0, 0.1, 1.0)), ('l', (1.0, 0.1, 0.0)), ('c', (0.0, 0.1, -1.0)), ('t', (0.0, 1.0, 0.05))]
    caminhos = [rig.render('rosto_' + n, d, 20, dist=1.7) for n, d in vistas]
    esc.resolution_x, esc.resolution_y = antes
    rig.center = centro_antes
    ladrilhos = []
    for p in caminhos:
        im = bpy.data.images.load(p)
        buf = np.empty(256 * 256 * 4, dtype=np.float32)
        im.pixels.foreach_get(buf)
        ladrilhos.append(buf.reshape(256, 256, 4))
        bpy.data.images.remove(im)
        os.remove(p)
    # pixels do Blender começam embaixo: linha de baixo = costas | topo, linha de cima = frente | lado
    colagem = np.concatenate([np.concatenate([ladrilhos[2], ladrilhos[3]], axis=1),
                              np.concatenate([ladrilhos[0], ladrilhos[1]], axis=1)], axis=0)
    img = bpy.data.images.new('brann_rosto', 512, 512, alpha=False)
    img.pixels.foreach_set(colagem.ravel())
    img.filepath_raw = os.path.join(previas, 'brann_rosto.png')
    img.file_format = 'PNG'
    img.save()


def renderizar_fonte(C, rig, f, sopa, objs):
    """Prévias da avaliação: o FBX original texturizado (a textura aparece num render) e colorido por ilha de malha
    (capa e martelo separados do corpo). O enquadramento reaproveita a mesma câmera/luz das prévias do modelo final."""
    import bpy
    import colorsys
    from mathutils import Vector
    mo = f.obj_malha
    me = mo.data
    for o in objs.values():
        o.hide_render = True
    for o in [mo] + ([mo.parent] if mo.parent else []):
        o.hide_render = False
    rig.center = Vector((0.0, 0.0, 0.5))
    rig.radius = 0.8
    rig.render('fbx_frente', (0.0, 0.25, 1.0), 30, zoom=0.8)
    npol = len(me.polygons)
    ncomp = max(sopa.comp[:npol]) + 1
    fixas = {0: '#b0b8c8', 1: '#4a5cff', 2: '#00d0d0', 3: '#ff8800'}     # corpo, cabeça do martelo, cabo, capa
    me.materials.clear()
    for k in range(ncomp):
        if k in fixas:
            hexa = fixas[k]
        else:
            r, g, b = colorsys.hsv_to_rgb((k * 0.61803398875) % 1.0, 0.85 if k % 2 == 0 else 0.55, 0.95)
            hexa = '#%02x%02x%02x' % (int(r * 255), int(g * 255), int(b * 255))
        m = bpy.data.materials.new('ilha%d' % k)
        m.use_nodes = True
        b = m.node_tree.nodes['Principled BSDF']
        b.inputs['Base Color'].default_value = C.hex_lin(hexa)
        b.inputs['Roughness'].default_value = 0.85
        me.materials.append(m)
    for i, p in enumerate(me.polygons):
        p.material_index = sopa.comp[i]
    rig.render('fbx_ilhas', (0.0, 0.25, 1.0), 30, zoom=0.8)
    for o in [mo] + ([mo.parent] if mo.parent else []):
        o.hide_render = True
    for o in objs.values():
        o.hide_render = False


def colorir_pecas(objs):
    """(Só prévia) material de cor chapada por peça, para conferir os cortes."""
    import bpy
    import common as C
    cores = {'Torso': '#9a9a9a', 'Head': '#e6c800', 'ArmL': '#22cc22', 'ArmR': '#ee2222', 'LegL': '#00ccee',
             'LegR': '#dd00dd', 'Sword': '#4a5cff', 'Cape': '#ff8800'}
    antes = {}
    for p, o in objs.items():
        m = bpy.data.materials.new('dbg_' + p)
        m.use_nodes = True
        b = m.node_tree.nodes['Principled BSDF']
        b.inputs['Base Color'].default_value = C.hex_lin(cores[p])
        b.inputs['Roughness'].default_value = 0.85
        antes[p] = (list(o.data.materials), [q.material_index for q in o.data.polygons])
        o.data.materials.clear()
        o.data.materials.append(m)
        for q in o.data.polygons:
            q.material_index = 0
    return antes


def restaurar_materiais(objs, antes):
    for p, o in objs.items():
        mats, idx = antes[p]
        o.data.materials.clear()
        for m in mats:
            o.data.materials.append(m)
        for q, i in zip(o.data.polygons, idx):
            q.material_index = i


# ---------------------------------------------------------------------------
def main():
    import bpy
    import common as C
    args = C.script_args()
    caminho = next((a for a in args if not a.startswith('--')), FBX_PADRAO)
    avaliar = '--sem-avaliacao' not in args
    out = next((a.split('=', 1)[1] for a in args if a.startswith('--glb=')), OUT_GLB)
    previas = next((a.split('=', 1)[1] for a in args if a.startswith('--previas=')), OUT_PREVIAS)
    log('FBX:', caminho)
    f = carregar_fbx(caminho)
    if avaliar:
        avaliar_fonte(f)
        avaliar_escala(f)
    sopa, S = construir_sopa(f)
    ok, tot = conferir_enrolamento(sopa)
    log('escala S = %.4f (topo %.4f -> %.2f); espelho em x; enrolamento coerente com as normais: %d de %d faces' %
        (S, f.co[:, 1].max(), TOPO, ok, tot))
    partes = segmentar(sopa, S, avaliar)
    if avaliar:
        avaliar_rosto(sopa, partes['Head'], f.pixels)
    lacos = aberturas_de_corte(sopa, partes)
    dados = {p: extrair_parte(sopa, partes[p], lacos.get(p, []), f.pixels) for p in PECAS}
    for p in CORPO:
        log('tampas de %s: %s' % (p, [t['n_arestas'] for t in dados[p]['tampas']]))
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
    avaliar_partes(dados, piv)
    # atlas + UV das tampas
    arr, info_a = construir_atlas(f, dados)
    log('atlas %dx%d: %s' % (ATLAS, ATLAS, info_a))
    for p in CORPO:
        for t in dados[p]['tampas']:
            uv = np.array(uv_da_tampa(arr, sopa, t['borda'], t['cor']))
            for fi in t['faces']:
                dados[p]['UV'][fi] = [uv, uv, uv]
    # cena
    img = bpy.data.images.new('hero_brann_atlas', ATLAS, ATLAS, alpha=False)
    px = np.ones((ATLAS, ATLAS, 4), dtype=np.float32)
    px[..., :3] = arr
    img.pixels.foreach_set(px.ravel())      # (não mexer em colorspace_settings depois: regenera o buffer e apaga os pixels)
    m_plano = bpy.data.materials.new('P_plano')
    m_time = bpy.data.materials.new('P_time')
    m_time['is_team'] = True
    raiz = C.make_empty('Knight')
    objs = {p: criar_objeto(C, p, dados[p], piv[p], raiz, m_time if p == 'Cape' else m_plano) for p in PECAS}
    C.set_rot_game(objs['Sword'], SWORD_REST_DEG)
    bpy.context.view_layer.update()
    C.finalize_materials(list(objs.values()), img, team_default=TEAM_DEFAULT,
                         out_png=os.path.join(C.BUILD_DIR, 'hero_brann_atlas.png'))
    C.export_glb(raiz, out)
    st = C.stats(raiz, out)
    log('STATS hero_brann', st)
    verificar_glb(out)
    if '--no-render' not in args:
        C.RENDERS = previas
        rig = C.RenderRig(raiz, 'brann', res=512, samples=24)
        rig.render('frente', (0.0, 0.25, 1.0), 30, zoom=ZOOM_PREVIA)
        rig.render('lado', (1.0, 0.2, 0.0), 30, zoom=ZOOM_PREVIA)
        rig.render('costas', (0.0, 0.25, -1.0), 30, zoom=ZOOM_PREVIA)
        rig.render('3q', (1.0, 0.95, 1.0), 30, zoom=ZOOM_PREVIA)
        renderizar_poses(C, objs, rig)
        renderizar_rosto(C, rig, previas)
        antes = colorir_pecas(objs)
        rig.render('pecas', (-1.0, 0.8, 1.0), 30, zoom=ZOOM_PREVIA)
        restaurar_materiais(objs, antes)
        renderizar_fonte(C, rig, f, sopa, objs)
    log('FEITO')


if __name__ == '__main__':
    main()
