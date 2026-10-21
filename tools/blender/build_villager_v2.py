"""
build_villager_v2.py — Aldeão humano v2 (tipo-base `villager`): camponês de barba ruiva gerado a partir do FBX do Tripo (M2-30).

Só constantes e ganchos do Aldeão; todo o resto vive em tools/blender/hero_common.py (mesmo pipeline dos heróis).

Entrada: FBX do Tripo (1 malha de 19,3 mil triângulos, UMA ilha só — picareta e bolsa de moedas soldadas —, rig Mixamo de 65 ossos
         sem ações, pose quase neutra, textura 512²; frente em -Y do Blender).
Saída:   public/models/villager_v2.glb (meshopt + WebP), prévias 512 px em tools/ui-captures/villager-v2/.

Uso:
  blender -b --factory-startup --python tools/blender/build_villager_v2.py -- [caminho.fbx] [--no-render] [--sem-avaliacao]
                                                                            [--glb=saida.glb] [--previas=pasta]
Rodar sempre via tools/safe-run.sh (ver CLAUDE.md).

Hierarquia (tipo-base `villager` do UnitAnimator; o antigo villager.glb é plano, aqui a picareta é FILHA de ArmR porque a mão
a empunha: o braço balança e a picareta vai junto, o `toolGroup.rotation.x` do animador vira só um "punho" extra):
  Villager (raiz, pés em y=0, frente +Z, origem entre os pés)
  ├─ Torso   pivô na cintura   túnica azul (TeamColor), colete, cinto, bolsas, bolsa de moedas, capuz caído nos ombros
  ├─ Head    pivô no pescoço   capuz e rosto com barba (só em +Z)
  ├─ ArmL / ArmR   pivô no ombro (cortado em y = ARM_Y)   manga + luva (ArmR segura a picareta, no lado +x)
  │   └─ ToolGroup (filho de ArmR)  pivô na empunhadura   haste e cabeça de aço da picareta (sempre visível)
  ├─ LegL / LegR   pivô na costura da calça   calça e botas
  └─ Pack  pivô (0, ·, atrás do dorso)  (oculta no jogo)  PackFrame + WoodBundle (lenha) + GoldSack (saco de ouro/pedra)
A picareta é a única ferramenta do modelo: ela NÃO se chama `Pickaxe`/`Axe`/`Hammer` para o `setVillagerTool` do inspetor
não escondê-la (o jogo usa o mesmo gesto de balançar para madeira, ouro e pedra).
TeamColor: o azul da túnica (faces cuja cor na textura é azul) vira cinza no atlas e multiplica a cor do time.
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
from hero_common import log, cor_da_face  # noqa: E402

NOME = 'villager_v2'
RAIZ = 'Villager'
PREFIXO = 'villager_v2'
ATLAS_NOME = 'villager_v2_atlas'
FBX_PADRAO = '/home/rafael/Downloads/peao+humano/tripo_convert_39c2e0e0-710d-406c-9a34-ab130883c82f.fbx'
OUT_GLB = os.path.join(REPO, 'public', 'models', 'villager_v2.glb')
OUT_PREVIAS = os.path.join(REPO, 'tools', 'ui-captures', 'villager-v2')

# --- constantes do FBX (metros; x direita do mundo, y cima, z frente; antes do espelho em x) ---
TOPO = 1.95            # altura final (ponta do capuz); o villager antigo mede 1,946
X0 = 0.092             # eixo de simetria (Hips/Spine)
Z0 = -0.115            # centro do corpo em z (Hips)
PESCOCO_Y = 0.775      # plano cabeça/tronco (abaixo do queixo, a barba desce para o tronco)
ARM_Y = 0.70           # plano horizontal do ombro: acima fica no Torso (manga/deltoide), abaixo é braço
PERNA_Y = 0.31         # plano da costura da calça (abaixo da barra da túnica)
# eixo da haste da picareta no FBX (reta ajustada nos vértices da ponta de baixo): x = AX0 + AX1*y, z = AZ0 + AZ1*y
AX0, AX1 = -0.2263, -0.0609
AZ0, AZ1 = 0.0471, 0.0931
R_HASTE = 0.032        # raio de captura da haste na altura da luva (a luva envolve a haste: o que está fora do raio é mão)
R_BAIXO = 0.065        # abaixo da luva a haste está livre (a ponta alarga um pouco)
R_CIMA = 0.05
Y_PUNHO_BAIXO = 0.47   # base da luva
Y_PUNHO = 0.58         # empunhadura (centro da mão)
Y_CABECA = 0.675       # acima disto, aço fora do corpo (x < X_CABECA) é a cabeça da picareta
X_CABECA = -0.20
TOOL_ESCALA = 0.8      # fator uniforme da picareta em torno da empunhadura
SUAVIZACAO = 5
ATLAS = 512
DILATACAO_TIME = 2
PROTECAO_TIME = 2
ZOOM_PREVIA = 0.9
TEAM_DEFAULT = '#2f63e0'   # azul do time (multiplica o cinza do atlas)
CABECA = (0.0, 1.78, 0.02)

PECAS = ['Torso', 'Head', 'ArmL', 'ArmR', 'LegL', 'LegR', 'ToolGroup']
CORPO = ['Torso', 'Head', 'ArmL', 'ArmR', 'LegL', 'LegR']     # rótulos vindos dos pesos de pele
CAPAS = PECAS
PAIS = {'ToolGroup': 'ArmR'}
PECAS_TIME = []
REGIOES_LIVRES = ('ToolGroup',)                              # haste de baixo e cabeça ficam separadas pela luva
POSES_PREVIA = ('caminhada', 'golpe', 'coleta_a', 'coleta_b', 'carregar')


def hsv(c):
    h, s, v = colorsys.rgb_to_hsv(float(c[0]), float(c[1]), float(c[2]))
    return h * 360.0, s, v


def eh_azul(c):
    h, s, v = hsv(c)
    return 190 <= h <= 255 and s > 0.28 and v > 0.2


def eh_pele(c):
    h, s, v = hsv(c)
    return (h <= 40 or h >= 350) and 0.2 <= s <= 0.75 and v > 0.45


def eixo_haste(y):
    return AX0 + AX1 * y, AZ0 + AZ1 * y


def avaliar_fonte_extra(f):
    lo, hi = f.co.min(axis=0), f.co.max(axis=0)
    log('--- AVALIAÇÃO: escala, eixo, origem ---')
    log('  bbox (x, y-cima, z) do FBX: x [%.3f, %.3f] y [%.4f, %.4f] z [%.3f, %.3f]' %
        (lo[0], hi[0], lo[1], hi[1], lo[2], hi[2]))
    for b in ('Hips', 'Head', 'LeftArm', 'RightArm', 'RightForeArm', 'RightHand'):
        log('  osso %-13s %s' % (b, np.round(f.pos_ossos[b], 3)))


def classificar(sopa, S):
    """Uma ilha só: tudo é 'corpo' (a picareta sai por regras geométricas)."""
    vs = sorted({v for fv in sopa.fv for v in fv})
    P = np.array([sopa.P[v] for v in vs])
    return {0: 'corpo'}, {0: dict(faces=len(sopa.fv), lo=P.min(axis=0), hi=P.max(axis=0))}


def cortes(S):
    """Planos horizontais: pescoço, ombros e costura da calça (cortam o corpo todo; o tronco só ganha vértices)."""
    return [(1, PESCOCO_Y * S, None), (1, ARM_Y * S, None), (1, PERNA_Y * S, None)]


def regras(ctx, f, c, nome):
    sopa, S = ctx.sopa, ctx.S
    vs = [v for v in sopa.fv[f] if v < sopa.n_orig]
    cor = cor_da_face(sopa, ctx.pixels, f)
    if len(vs) >= 2:
        r = ctx.f.co_rest[vs].mean(axis=0)               # posição de repouso no FBX
        xa, za = eixo_haste(r[1])
        d = math.hypot(r[0] - xa, r[2] - za)
        raio = R_BAIXO if r[1] < Y_PUNHO_BAIXO else (R_HASTE if r[1] < Y_CABECA else R_CIMA)
        if d < raio and r[1] < 0.95:
            return 'ToolGroup'                           # haste (inclusive o trecho dentro da luva) e topo de madeira
        if r[1] >= Y_CABECA and r[0] < X_CABECA and not eh_azul(cor) and not eh_pele(cor):
            return 'ToolGroup'                           # cabeça da picareta (aço, rebites, olho de madeira)
    yf = c[1] / S
    if yf < PERNA_Y:
        return 'LegR' if c[0] > 0 else 'LegL'
    if nome in ('LegL', 'LegR'):
        nome = 'Torso'                                    # a barra da túnica cola as pernas: fica no Torso
    if yf >= PESCOCO_Y - 1e-6 and nome in ('Torso', 'Head'):
        return 'Head'
    if nome == 'Head':
        return 'Torso'                                    # capuz caído nos ombros
    if nome in ('ArmL', 'ArmR') and yf >= ARM_Y:
        return 'Torso'
    return nome


def eh_time(ctx, peca, i):
    if peca == 'ToolGroup':
        return False
    # só a face INTEIRA em pano azul (faces de borda mantêm a cor original)
    return all(eh_azul(c) for c in HC.cores_de_uv(ctx.pixels, ctx.dados[peca]['UV'][i]))


def cor_time(rgb, peca):
    return peca != 'ToolGroup' and eh_azul(rgb)


def finalizar(ctx):
    """Pivôs e vértices em coordenadas locais. Devolve {peça: pivô}."""
    S, f, dados = ctx.S, ctx.f, ctx.dados

    def T(p):
        return np.array([-(p[0] - X0) * S, p[1] * S, (p[2] - Z0) * S])
    piv = {'Torso': np.array([0.0, 0.95, 0.0])}
    n = T(f.pos_ossos['Neck'])
    piv['Head'] = np.array([0.0, round(float(PESCOCO_Y * S - 0.02), 3), round(float(n[2]), 3)])
    for p in ('ArmL', 'ArmR'):
        V = dados[p]['V']
        no_plano = V[np.abs(V[:, 1] - ARM_Y * S) < 1e-3]          # vértices do corte do ombro (plano y = ARM_Y)
        piv[p] = np.round([no_plano[:, 0].mean(), ARM_Y * S, no_plano[:, 2].mean()], 3)
        log('ombro %s: %d vértices no plano do corte, pivô %s' % (p, len(no_plano), piv[p]))
    for p in ('LegL', 'LegR'):
        cos = [t for t in dados[p]['tampas'] if abs(t['centro'][1] - PERNA_Y * S) < 0.03]
        t = max(cos or dados[p]['tampas'], key=lambda t: t['n_arestas'])
        piv[p] = np.round(t['centro'], 3)
        log('costura da calça %s: %d tampas, pivô %s' % (p, len(dados[p]['tampas']), piv[p]))
    xa, za = eixo_haste(Y_PUNHO)
    piv['ToolGroup'] = np.round(T(np.array([xa, Y_PUNHO, za])), 3)
    log('empunhadura da picareta (ToolGroup) em', piv['ToolGroup'])
    for p in PECAS:
        dados[p]['V'] = dados[p]['V'] - piv[p]
    # a haste do Tripo (1,8 de altura) é maior que o homem: encolhe em torno da empunhadura (a ponta de baixo não varre o chão
    # nos golpes, o balanço de coleta/construção fica no alcance do corpo)
    dados['ToolGroup']['V'] = dados['ToolGroup']['V'] * TOOL_ESCALA
    log('picareta encolhida x%.2f em torno da empunhadura' % TOOL_ESCALA)
    ctx.piv = piv
    return piv


def poses():
    """Poses do UnitAnimator para o tipo `villager` (ToolGroup é filho de ArmR: gira em x além do braço)."""
    sw = 0.55
    gat = {}
    for nome, strike in (('coleta_a', 1.0), ('coleta_b', -1.0)):
        gat[nome] = {'Torso': (0.18 + strike * 0.12, 0, 0), 'Head': (0.18 + strike * 0.15, 0, 0),
                     'ArmR': (-strike * 0.85, 0, 0), 'ArmL': (-strike * 0.35, 0, 0), 'ToolGroup': (-strike * 0.9, 0, 0)}
    return {
        'repouso': {},
        'caminhada': {'LegL': (0.65, 0, 0), 'LegR': (-0.65, 0, 0), 'ArmL': (-sw, 0, -0.05), 'ArmR': (sw, 0, 0.05),
                      'Torso': (0.05, 0.08, 0.0), 'ToolGroup': (sw * 0.5, 0, 0)},
        'golpe': {'Torso': (0.4, 0, 0), 'Head': (0.3, 0, 0), 'ArmR': (-1.3, 0, 0), 'ArmL': (1.1, 0, 0), 'ToolGroup': (-1.0, 0, 0)},
        'carregar': {'Torso': (0.21, 0, 0), 'Head': (0.12, 0, 0), 'ArmL': (-sw * 0.45, 0, -0.05), 'ArmR': (sw * 0.45, 0, 0.05),
                     'LegL': (0.65, 0, 0), 'LegR': (-0.65, 0, 0)},
        **gat,
    }


def _material(nome, hexa, rugosidade=0.85):
    import bpy
    import common as C
    m = bpy.data.materials.new(nome)
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value = C.hex_lin(hexa)
    b.inputs['Roughness'].default_value = rugosidade
    return m


def _malha(nome, bm_fn, material, pai, local):
    import bpy
    import bmesh
    import common as C
    me = bpy.data.meshes.new(nome)
    bm = bmesh.new()
    bm_fn(bm)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    me.materials.append(material)
    o = bpy.data.objects.new(nome, me)
    bpy.context.scene.collection.objects.link(o)
    o.parent = pai
    o.location = C.g(*local)
    return o


def materiais_extra(ctx, objs):
    """Mochila de carga (Pack): armação de couro, feixe de lenha e saco de ouro/pedra, em materiais lisos. Ocultos no jogo
    (`ModelFactory._workerGlbDefaults`) e ligados por `UnitView._applyCarry`."""
    import bpy
    import bmesh
    import common as C
    from mathutils import Matrix
    raiz = objs['Torso'].parent
    V = ctx.dados['Torso']['V'] + ctx.piv['Torso']
    meio = V[(V[:, 1] > 0.95) & (V[:, 1] < 1.35)]
    costas = float(np.percentile(meio[:, 2], 5))
    pack_y, pack_z = 1.0, round(costas - 0.10, 3)
    log('costas do Torso z=%.3f -> Pack em (0, %.2f, %.3f)' % (costas, pack_y, pack_z))
    pack = C.make_empty('Pack', location=(0.0, pack_y, pack_z), parent=raiz)
    m_couro = _material('PackLeather', '#5a3a20')
    m_saco = _material('PackSack', '#b79a63', 0.95)
    m_lenha = _material('PackWood', '#7b5230')

    def armacao(bm):
        bmesh.ops.create_cube(bm, size=1.0, matrix=Matrix.Diagonal((0.5, 0.08, 0.5, 1.0)) @ Matrix.Translation((0, 0, 0)))
    _malha('PackFrame', armacao, m_couro, pack, (0.0, 0.0, 0.0))

    def saco(bm):
        bmesh.ops.create_uvsphere(bm, u_segments=14, v_segments=9, radius=1.0,
                                  matrix=Matrix.Diagonal((0.26, 0.22, 0.30, 1.0)))
        bmesh.ops.create_cone(bm, cap_ends=True, segments=10, radius1=0.10, radius2=0.06, depth=0.18,
                              matrix=Matrix.Translation((0, 0, 0.32)))
    _malha('GoldSack', saco, m_saco, pack, (0.0, 0.0, -0.20))

    def lenha(bm):
        for (y, z) in ((-0.085, -0.085), (0.085, -0.085), (0.0, 0.065)):
            bmesh.ops.create_cone(bm, cap_ends=True, segments=10, radius1=0.085, radius2=0.085, depth=0.85,
                                  matrix=Matrix.Translation((0, y, z)) @ Matrix.Rotation(math.radians(90), 4, 'Y'))
    _malha('WoodBundle', lenha, m_lenha, pack, (0.0, 0.0, -0.20))
    bpy.context.view_layer.update()


def previa_extra(ctx, rig, objs):
    """Conferência de emendas: poses de coleta/golpe vistas de frente e de lado, e cabeça/ombros com peças coloridas."""
    import common as C
    todas = poses()
    for nome in ('coleta_a', 'coleta_b', 'golpe', 'caminhada'):
        for p in PECAS:
            HC.rot_three(C, objs[p], 0, 0, 0)
        for p, (rx, ry, rz) in todas[nome].items():
            HC.rot_three(C, objs[p], rx, ry, rz)
        rig.render('pose_%s_lado' % nome, (1.0, 0.25, 0.2), 30, zoom=0.9)
        rig.render('pose_%s_costas' % nome, (0.0, 0.25, -1.0), 30, zoom=0.9)
    for p in PECAS:
        HC.rot_three(C, objs[p], 0, 0, 0)


def main():
    HC.executar(sys.modules[__name__])


if __name__ == '__main__':
    main()
