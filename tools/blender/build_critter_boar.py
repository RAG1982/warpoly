"""
build_critter_boar.py — Javali selvagem (critter neutro `boar`, ART-04) gerado 100% por script.

Substitui, no futuro, o modelo procedural de `src/models/units/CritterModel.js` (a integração no jogo NÃO faz parte
desta entrega; ver docs/reference/art-p0-javali.md). Saídas:
  public/models/critter_boar.glb             modelo em pose de repouso (patas no chão)
  tools/ui-captures/art-p0/critter_boar.png  preview 512 px, câmera fixa 3/4, fundo transparente
  public/icoJavali.png                       ícone 128x128, fundo transparente, contorno escuro (mesma linguagem dos
                                             ícones renderizados de public/ui/icons)

Uso (sempre via safe-run, um Blender por vez):
  bash tools/safe-run.sh --timeout 600 -- /home/rafael/Downloads/blender-5.2.1-linux-x64/blender -b \
      --factory-startup --python tools/blender/build_critter_boar.py -- [opções]

Opções (depois do `--`):
  --no-render         só gera o .glb (sem preview nem ícone)
  --dev-flat          geometria com materiais lisos (sem bake/export) + vistas de conferência (precisa de --dev-out)
  --dev-out <pasta>   onde gravar as vistas de conferência (fora do repositório)
  --views             depois do export, grava também vistas de conferência do .glb reimportado em --dev-out

Hierarquia (aninhada; L = -x, R = +x, como ArmL/ArmR do projeto; frente = +Z; todas as rotações de repouso = 0):
  CritterBoar (raiz, origem no chão no centro da pegada)
  └─ Body    pivô (0; 0,38; 0)           tronco, garupa, crina de cerdas, cauda (malha)
     ├─ Head    pivô (0; 0,44; 0,26)      crânio, focinho, mandíbula, presas, orelhas, olhos (malha)
     │  ├─ Snout    (0; 0,385; 0,47)      âncora (sem geometria): base do focinho
     │  ├─ Tusk_L   (-0,05; 0,305; 0,49)  âncora (sem geometria): raiz da presa esquerda
     │  └─ Tusk_R   (+0,05; 0,305; 0,49)  âncora (sem geometria): raiz da presa direita
     ├─ Leg_FL / Leg_FR   pivôs nos ombros (∓0,125; 0,38; 0,19)   (malhas)
     ├─ Leg_BL / Leg_BR   pivôs nos quadris (∓0,12; 0,38; -0,34)  (malhas)
     └─ Tail    (0; 0,415; -0,575)        âncora (sem geometria): raiz da cauda
Orçamento: 6 malhas (Body, Head, 4 pernas) = 6 draw calls (1 material `Atlas`), atlas 512². Snout/Tusk_*/Tail são
nós vazios porque as respectivas geometrias foram mescladas em Head/Body para caber no orçamento de draw calls.
"""
import os
import sys
import math
import json

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
import numpy as np  # noqa: E402
from mathutils import Vector, Matrix  # noqa: E402
import common as C  # noqa: E402
from common import (MeshBuilder, M, NB, prim_box, prim_rings, prim_cone, prim_sphere, limb_rings,  # noqa: E402
                    hex_lin)
from bld_common import orient  # noqa: E402

OUT_NAME = 'critter_boar'
ROOT_NAME = 'CritterBoar'
PREVIEW_PATH = os.path.join(C.REPO, 'tools', 'ui-captures', 'art-p0', 'critter_boar.png')
ICON_PATH = os.path.join(C.REPO, 'public', 'icoJavali.png')

# ---------------------------------------------------------------------------
# Medidas (m, coordenadas do jogo: x direita, y cima, +z frente; L = -x)
# ---------------------------------------------------------------------------
BODY_O = Vector((0.0, 0.36, 0.0))
HEAD_O = Vector((0.0, 0.43, 0.25))
SNOUT_O = Vector((0.0, 0.365, 0.47))
TUSK_O = {'Tusk_L': Vector((-0.056, 0.29, 0.488)), 'Tusk_R': Vector((0.056, 0.29, 0.488))}
TAIL_O = Vector((0.0, 0.405, -0.575))
LEG_Y = 0.34   # altura dos pivôs das pernas; os cascos ficam em y = 0
LEG_O = {
    'Leg_FL': Vector((-0.135, LEG_Y, 0.19)), 'Leg_FR': Vector((0.135, LEG_Y, 0.19)),
    'Leg_BL': Vector((-0.115, LEG_Y, -0.34)), 'Leg_BR': Vector((0.115, LEG_Y, -0.34)),
}

# anéis do tronco: (z, topo, base, meia-largura)  [garupa baixa e estreita -> costelas -> cernelha alta e larga -> peito]
TORSO = [
    (-0.60, 0.385, 0.312, 0.055),
    (-0.54, 0.430, 0.288, 0.098),
    (-0.42, 0.456, 0.268, 0.122),
    (-0.25, 0.468, 0.246, 0.138),
    (-0.08, 0.490, 0.220, 0.156),
    (0.06, 0.516, 0.200, 0.176),
    (0.18, 0.538, 0.192, 0.192),
    (0.27, 0.530, 0.212, 0.180),
    (0.33, 0.488, 0.266, 0.132),
]
# anéis do crânio/focinho: (z, centro y, meia-largura, meia-altura)
SKULL = [
    (0.18, 0.420, 0.120, 0.110),
    (0.28, 0.420, 0.135, 0.118),
    (0.39, 0.410, 0.128, 0.110),
    (0.47, 0.385, 0.100, 0.092),
    (0.54, 0.358, 0.070, 0.068),
    (0.575, 0.346, 0.060, 0.060),
]
# crina de cerdas: (z, altura, x) — pirâmides largas que se sobrepõem, duas fileiras alternadas
MANE = [
    (-0.36, 0.034, 0.014), (-0.30, 0.040, -0.014), (-0.24, 0.046, 0.014), (-0.18, 0.052, -0.014),
    (-0.12, 0.058, 0.014), (-0.06, 0.064, -0.014), (0.00, 0.070, 0.014), (0.06, 0.076, -0.014),
    (0.12, 0.080, 0.014), (0.18, 0.082, -0.014), (0.24, 0.080, 0.014), (0.30, 0.070, -0.012),
]

# ---------------------------------------------------------------------------
# Paleta (pintura só para o bake; depois vira o atlas `Atlas`)
# ---------------------------------------------------------------------------
PALETTE = {
    # pelagem principal: marrom quente com riscas de cerda mais claras e manchas claras maiores
    'fur': dict(fur=True, base='#4e3827', var='#34261a', var_scale=5.0, var_amt=0.9,
                grizzle='#957a58', grizzle_amt=0.36, streak=(80.0, 14.0), streak_lo=0.50, streak_hi=0.64,
                patch='#957b58', patch_scale=3.4, patch_amt=0.85, patch_lo=0.60, patch_hi=0.635, patch_seed=3.1,
                patch_side=1.7, grad=(0.16, 0.58, 0.18), top=0.28, edge='#b49a74', edge_amt=0.14, edge_r=0.02,
                ao=(0.22, 0.65)),
    # crina, pernas, focinho, orelhas: marrom quase preto
    'fur_dark': dict(fur=True, base='#33261b', var='#1f160f', var_scale=7.0, var_amt=0.9,
                     grizzle='#6e543b', grizzle_amt=0.5, streak=(70.0, 16.0), streak_lo=0.47, streak_hi=0.62,
                     top=0.28, edge='#85694a', edge_amt=0.18, edge_r=0.02, ao=(0.2, 0.65)),
    # crina de cerdas: tom areia que escurece na raiz (gradiente pela altura do mundo) e clareia nas pontas
    'mane': dict(fur=True, base='#8a6d47', var='#5a4430', var_scale=9.0, var_amt=0.8,
                 grizzle='#c8aa76', grizzle_amt=0.55, streak=(70.0, 16.0), streak_lo=0.47, streak_hi=0.62,
                 grad=(0.46, 0.62, 0.78), top=0.3, edge='#d2b886', edge_amt=0.2, edge_r=0.02, ao=(0.2, 0.7)),
    # bochechas, ponta das orelhas, penacho do rabo
    'fur_light': dict(fur=True, base='#a48c66', var='#7b6648', var_scale=8.0, var_amt=0.8,
                      grizzle='#d2bf94', grizzle_amt=0.55, streak=(70.0, 16.0), streak_lo=0.47, streak_hi=0.62,
                      top=0.3, edge='#e2d2aa', edge_amt=0.2, edge_r=0.02, ao=(0.2, 0.6)),
    # ventre e flancos baixos: um tom mais claro e quente
    'belly': dict(fur=True, base='#7f6346', var='#5e4730', var_scale=6.0, var_amt=0.8,
                  grizzle='#ad9068', grizzle_amt=0.5, streak=(70.0, 16.0), streak_lo=0.47, streak_hi=0.62,
                  top=0.2, ao=(0.22, 0.65)),
    'snout': dict(base='#7a5650', var='#4f3a36', var_scale=14.0, fine=0.1, top=0.3,
                  edge='#c0958c', edge_amt=0.4, edge_r=0.012, ao=(0.1, 0.5)),
    'lip': dict(base='#1d1210', var='#120b0a'),
    'tusk': dict(base='#ecdfb8', var='#c3af80', var_scale=9.0, fine=0.05, top=0.35,
                 edge='#fffbe8', edge_amt=0.6, edge_r=0.008, ao=(0.08, 0.4)),
    'hoof': dict(base='#2b2019', var='#16100c', var_scale=10.0, fine=0.08, top=0.3,
                 edge='#5c4a3a', edge_amt=0.5, edge_r=0.01, ao=(0.1, 0.5)),
    'eye': dict(base='#f2a82c', var='#c97d12', var_scale=30.0, emit_boost=1.15),
    'ear_in': dict(base='#85655a', var='#5f453d', var_scale=9.0, fine=0.08, top=0.3, ao=(0.06, 0.5)),
}


def fur_paint(name, p):
    """Pelagem (Emission, só para o bake): tom base com variação em manchas, riscas de cerda alongadas ao longo do
    corpo (+Z do jogo = eixo Y do Blender), manchas claras opcionais, degradê de altura, luz de topo, desgaste de
    borda (nó Bevel) e AO. Mesma assinatura de uso do `paint_material` de common.py."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    nb = NB(nt)
    geo = nb.node('ShaderNodeNewGeometry')
    pos = geo.outputs['Position']
    px, py, pz = nb.sep(pos)

    base = nb.rgb(p['base'])
    var = nb.rgb(p.get('var', p['base']))
    blot = nb.noise(pos, scale=p.get('var_scale', 6.0), detail=3.0, rough=0.6, distortion=0.3)
    blot = nb.ramp(blot, [(0.36, 0.0), (0.64, 1.0)])
    col = nb.mix(nb.math('MULTIPLY', nb.bw(blot), p.get('var_amt', 0.9)), base, var)

    # riscas de cerda: ruído muito esticado ao longo do corpo (eixo Y do Blender = +Z do jogo)
    ks = p.get('streak')
    if ks and p.get('grizzle'):
        vec = nb.comb(nb.math('MULTIPLY', px, ks[0]), nb.math('MULTIPLY', py, ks[1]), nb.math('MULTIPLY', pz, ks[0]))
        st = nb.noise(vec, scale=1.0, detail=2.0, rough=0.55)
        st = nb.ramp(st, [(p.get('streak_lo', 0.5), 0.0), (p.get('streak_hi', 0.7), 1.0)])
        col = nb.mix(nb.math('MULTIPLY', nb.bw(st), p.get('grizzle_amt', 0.4)), col, nb.rgb(p['grizzle']))

    # manchas claras maiores (bordas nítidas)
    if p.get('patch'):
        off = p.get('patch_seed', 0.0)
        pv = nb.comb(nb.math('ADD', px, off), nb.math('ADD', py, off * 0.7), nb.math('ADD', pz, off * 1.3))
        pt = nb.noise(pv, scale=p.get('patch_scale', 2.6), detail=2.0, rough=0.5, distortion=0.35)
        pt = nb.ramp(pt, [(p.get('patch_lo', 0.58), 0.0), (p.get('patch_hi', 0.62), 1.0)])
        pm = nb.bw(pt)
        if p.get('patch_side'):  # só em superfícies de lado: o dorso (normal para cima) fica escuro
            _, _, nzp = nb.sep(geo.outputs['Normal'])
            up = nb.math('MINIMUM', nb.math('MAXIMUM', nb.math('MULTIPLY', nzp, p['patch_side']), 0.0), 1.0)
            pm = nb.math('MULTIPLY', pm, nb.math('SUBTRACT', 1.0, up))
        col = nb.mix(nb.math('MULTIPLY', pm, p.get('patch_amt', 0.9)), col, nb.rgb(p['patch']))

    if p.get('fine', 0.0):
        fine = nb.noise(pos, scale=p.get('fine_scale', 24.0), detail=2.0, rough=0.5)
        col = nb.scale(col, nb.math('ADD', 1.0 - p['fine'], nb.math('MULTIPLY', fine, 2 * p['fine'])))

    if p.get('grad'):
        z0, z1, amt = p['grad']
        t = nb.math('DIVIDE', nb.math('SUBTRACT', pz, z0), z1 - z0)
        t = nb.math('MINIMUM', nb.math('MAXIMUM', t, 0.0), 1.0)
        col = nb.scale(col, nb.math('ADD', 1.0 - amt, nb.math('MULTIPLY', t, amt)))

    if p.get('top', 0.0):
        _, _, nz = nb.sep(geo.outputs['Normal'])
        col = nb.scale(col, nb.math('ADD', 1.0, nb.math('MULTIPLY', nz, p['top'])))

    if p.get('edge_amt', 0.0):
        bev = nb.node('ShaderNodeBevel', samples=8)
        bev.inputs['Radius'].default_value = p.get('edge_r', 0.02)
        d = nb.vmath('DOT_PRODUCT', bev.outputs['Normal'], geo.outputs['Normal'])
        e = nb.math('MULTIPLY', nb.math('SUBTRACT', 1.0, d), p.get('edge_gain', 9.0), clamp=True)
        col = nb.mix(nb.math('MULTIPLY', e, p['edge_amt']), col, nb.rgb(p.get('edge', '#ffffff')))

    if p.get('ao'):
        dist, amt = p['ao']
        ao = nb.node('ShaderNodeAmbientOcclusion', samples=16, only_local=False)
        ao.inputs['Distance'].default_value = dist
        a = nb.math('POWER', ao.outputs['AO'], 1.0)
        col = nb.scale(col, nb.math('ADD', 1.0 - amt, nb.math('MULTIPLY', a, amt)))

    em = nb.node('ShaderNodeEmission')
    nb.link(col, em.inputs['Color'])
    out = nb.node('ShaderNodeOutputMaterial')
    nt.links.new(em.outputs[0], out.inputs['Surface'])
    mat['paint_key'] = name
    mat['is_team'] = False
    return mat


def make_materials():
    out = {}
    for k, p in PALETTE.items():
        out[k] = fur_paint('P_' + k, p) if p.get('fur') else C.paint_material('P_' + k, p)
    return out


def dev_materials():
    """Materiais lisos (Principled) só para conferir a forma sem bake."""
    out = {}
    for k, p in PALETTE.items():
        m = bpy.data.materials.new('D_' + k)
        m.use_nodes = True
        b = m.node_tree.nodes['Principled BSDF']
        b.inputs['Base Color'].default_value = hex_lin(p['base'])
        b.inputs['Roughness'].default_value = 0.85
        m['is_team'] = False
        out[k] = m
    return out


# ---------------------------------------------------------------------------
# Peças (coordenadas ABSOLUTAS, relativas à raiz; cada peça converte para o seu pivô)
# ---------------------------------------------------------------------------
class Part:
    def __init__(self, name, origin):
        self.name = name
        self.origin = Vector(origin)
        self.mb = MeshBuilder(name)
        self.obj = None

    def _fn(self, f):
        o = self.origin
        return None if f is None else (lambda c, n: f((c[0] + o.x, c[1] + o.y, c[2] + o.z), n))

    def add(self, prim, mat, pos=(0, 0, 0), rot=(0, 0, 0), s=1.0, **kw):
        """Primitiva com origem local em `pos` (absoluto), rotação `rot` (graus XYZ) e escala `s`."""
        if kw.get('mat_fn'):
            kw['mat_fn'] = self._fn(kw['mat_fn'])
        return self.mb.add(prim, mat, M(tuple(Vector(pos) - self.origin), rot, s), **kw)

    def add_m(self, prim, mat, matrix_abs, **kw):
        """Primitiva com matriz absoluta (ex.: Translation @ orient(d))."""
        if kw.get('mat_fn'):
            kw['mat_fn'] = self._fn(kw['mat_fn'])
        return self.mb.add(prim, mat, Matrix.Translation(-self.origin) @ matrix_abs, **kw)

    def add_abs(self, prim, mat, **kw):
        """Primitiva cujos vértices já estão em coordenadas absolutas (lofts, tubos)."""
        if kw.get('mat_fn'):
            kw['mat_fn'] = self._fn(kw['mat_fn'])
        return self.mb.add(prim, mat, Matrix.Translation(-self.origin), **kw)

    def tube(self, pts, radii, mat, n=6, up=(0, 0, 1), smooth=0, **kw):
        return self.add_abs(prim_rings(limb_rings(pts, radii, n, up=up)), mat, smooth=smooth, **kw)

    def build(self, mats, parent_obj, parent_origin):
        loc = tuple(self.origin - Vector(parent_origin))
        self.obj = self.mb.build(mats, parent=parent_obj, location=loc)
        return self.obj


def ring_z(z, cy, rx, ry, n=10, cx=0.0):
    """Anel no plano XY na posição z (vértice exatamente no topo e na base: cume da crina)."""
    ph = math.pi / n
    return [(cx + math.cos(ph + 2 * math.pi * i / n) * rx, cy + math.sin(ph + 2 * math.pi * i / n) * ry, z)
            for i in range(n)]


def torso_top(z):
    zs = [r[0] for r in TORSO]
    for i in range(len(zs) - 1):
        if zs[i] <= z <= zs[i + 1]:
            t = (z - zs[i]) / (zs[i + 1] - zs[i])
            return TORSO[i][1] + (TORSO[i + 1][1] - TORSO[i][1]) * t
    return TORSO[-1][1] if z > zs[-1] else TORSO[0][1]


def cone_dir(P, base, direction, r, h, mat, n=4, smooth=0, **kw):
    """Cone/pirâmide de base `base` apontando para `direction` (absolutos)."""
    P.add_m(prim_cone(r, h, n), mat, Matrix.Translation(Vector(base)) @ orient(direction), smooth=smooth, **kw)


# ---------------------------------------------------------------------------
def build_body(mats, root):
    P = Part('Body', BODY_O)
    rings = [ring_z(z, (top + base) / 2, w, (top - base) / 2) for (z, top, base, w) in TORSO]
    P.add_abs(prim_rings(rings), 'fur', smooth=0, mat_fn=lambda c, n: 'belly' if n[1] < -0.45 else None)
    # volumes: peito e coxas (garupa)
    P.add(prim_sphere(0.150, 0.125, 0.105, 10, 4), 'fur', pos=(0.0, 0.375, 0.255), smooth=0)
    for sx in (-1, 1):
        P.add(prim_sphere(0.066, 0.092, 0.118, 8, 4), 'fur', pos=(sx * 0.108, 0.352, -0.37), smooth=0)
    # crina de cerdas eriçada: pirâmides largas inclinadas para trás (gradiente claro nas pontas pelo material `mane`)
    for i, (z, h, x) in enumerate(MANE):
        P.add(prim_cone(0.034, h, 4), 'mane', pos=(x, torso_top(z) - 0.014, z), rot=(-22, 10 * (1 if i % 2 else -1), 0),
              smooth=0)
    # cauda fina com penacho (raiz = nó Tail)
    path = [tuple(TAIL_O), (0.0, 0.442, -0.625), (0.0, 0.435, -0.675), (0.0, 0.390, -0.703)]
    P.tube(path, [0.021, 0.015, 0.012, 0.009], 'fur_dark', n=5, up=(0, 1, 0))
    cone_dir(P, (0.0, 0.397, -0.700), (0.0, -0.75, -0.55), 0.030, 0.072, 'fur_light', n=5)
    return P


def build_head(mats, body):
    P = Part('Head', HEAD_O)
    sk = [ring_z(z, cy, rx, ry) for (z, cy, rx, ry) in SKULL]
    def skull_mat(c, n):  # focinho e queixo escuros; mancha clara na bochecha (lados, abaixo do olho)
        if c[2] > 0.5 or n[1] < -0.5:
            return 'fur_dark'
        if abs(c[0]) > 0.085 and 0.34 < c[2] < 0.47 and c[1] < 0.425:
            return 'fur_light'
        return None
    P.add_abs(prim_rings(sk), 'fur', smooth=0, mat_fn=skull_mat)
    # focinho: disco do nariz com narinas (só na face frontal +Z) e mandíbula inferior curta por baixo
    P.add(prim_sphere(0.062, 0.052, 0.024, 8, 4), 'snout', pos=(0.0, 0.342, 0.576), smooth=0)
    for sx in (-1, 1):
        P.add(prim_box(0.014, 0.016, 0.012), 'lip', pos=(sx * 0.024, 0.344, 0.596), smooth=0)
    P.add(prim_box(0.066, 0.040, 0.17, taper=(0.66, 0.85)), 'fur_dark', pos=(0.0, 0.282, 0.475), smooth=0)
    for sx in (-1, 1):
        # presas curtas, curvas para cima, nascendo da mandíbula e passando por fora do focinho
        tp = [(sx * 0.056, 0.290, 0.488), (sx * 0.080, 0.314, 0.503), (sx * 0.095, 0.348, 0.508),
              (sx * 0.095, 0.384, 0.498), (sx * 0.089, 0.400, 0.486)]
        P.tube(tp, [0.017, 0.015, 0.012, 0.007, 0.002], 'tusk', n=5)
        # olhos pequenos (âmbar) com sobrancelha pesada
        P.add(prim_sphere(0.014, 0.014, 0.011, 6, 4), 'eye', pos=(sx * 0.121, 0.443, 0.385), smooth=0)
        P.add(prim_box(0.038, 0.011, 0.034), 'fur_dark', pos=(sx * 0.106, 0.468, 0.394), rot=(0, 0, sx * -26), smooth=0)
        # orelhas eretas (pirâmides achatadas), parte da frente rosada
        P.add(prim_cone(0.044, 0.100, 4), 'fur_dark', pos=(sx * 0.090, 0.500, 0.292), rot=(-14, 0, sx * -22),
              s=(1.0, 1.0, 0.5), smooth=0, mat_fn=lambda c, n: 'ear_in' if n[2] > 0.45 else None)
        # cerdas claras das bochechas, para trás
        for (dz, dy) in ((0.0, 0.0), (0.026, -0.016)):
            cone_dir(P, (sx * 0.126, 0.384 + dy, 0.405 + dz), (sx * 0.8, -0.2, -0.55), 0.016, 0.055, 'fur_light', n=4)
    # tufo na testa (continua a crina)
    for (z, h) in ((0.33, 0.060), (0.385, 0.052), (0.435, 0.042)):
        P.add(prim_cone(0.026, h, 4), 'mane', pos=(0.0, 0.530 - (z - 0.33) * 0.42, z), rot=(-30, 0, 0), smooth=0)
    return P


def build_leg(mats, name, front):
    o = LEG_O[name]
    P = Part(name, o)
    if front:
        rel = [(0, 0.03, 0.0), (0, -0.07, 0.008), (0, -0.17, -0.004), (0, -0.26, 0.012), (0, -0.295, 0.014)]
        rad = [(0.064, 0.062), (0.053, 0.051), (0.046, 0.046), (0.032, 0.032), (0.035, 0.035)]
    else:  # perna de trás: coxa para trás, jarrete angulado, canela para a frente
        rel = [(0, 0.04, 0.0), (0, -0.06, -0.030), (0, -0.16, -0.062), (0, -0.25, -0.012), (0, -0.295, 0.004)]
        rad = [(0.072, 0.070), (0.060, 0.058), (0.046, 0.046), (0.032, 0.032), (0.035, 0.035)]
    pts = [(o.x + p[0], o.y + p[1], o.z + p[2]) for p in rel]
    P.tube(pts, rad, 'fur_dark', n=6, mat_fn=lambda c, n: 'fur' if c[1] > o.y - 0.12 else None)
    hz = o.z + rel[-1][2] + 0.012
    P.add(prim_box(0.066, 0.046, 0.084, taper=(0.74, 0.70), base=True), 'hoof', pos=(o.x, 0.0, hz), smooth=0)
    return P


# ---------------------------------------------------------------------------
# Verificação do .glb exportado e renders (preview + ícone)
# ---------------------------------------------------------------------------
def glb_report(path):
    j = C.glb_json(path)
    nodes = j.get('nodes', [])
    parent = {}
    for i, n in enumerate(nodes):
        for c in n.get('children', []):
            parent[c] = i
    acc = j.get('accessors', [])
    meshes = j.get('meshes', [])
    tris = 0
    prims = 0
    attrs = set()
    for m in meshes:
        for pr in m['primitives']:
            prims += 1
            attrs.update(pr['attributes'].keys())
            if 'indices' in pr:
                tris += acc[pr['indices']]['count'] // 3
    mesh_nodes = [n['name'] for n in nodes if 'mesh' in n]
    draw = sum(len(meshes[n['mesh']]['primitives']) for n in nodes if 'mesh' in n)
    rows = []
    for i, n in enumerate(nodes):
        rows.append((n['name'], nodes[parent[i]]['name'] if i in parent else None, n.get('translation'), 'mesh' in n))
    return dict(tris=tris, primitives=prims, draw_calls=draw, attributes=sorted(attrs), mesh_nodes=mesh_nodes,
                nodes=rows, materials=[m.get('name') for m in j.get('materials', [])],
                extensions=j.get('extensionsUsed', []), kb=round(os.path.getsize(path) / 1024, 1))


def save_png(arr, path):
    """Grava `arr` (H, W, 4) float32 sRGB straight em PNG 8 bits RGBA. Devolve o tamanho em bytes."""
    h, w = arr.shape[:2]
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img = bpy.data.images.new('save_tmp', w, h, alpha=True)
    img.alpha_mode = 'STRAIGHT'
    data = np.ascontiguousarray(np.clip(arr, 0.0, 1.0), dtype=np.float32)
    if arr.shape[2] == 3:
        data = np.concatenate([data, np.ones((h, w, 1), dtype=np.float32)], axis=2)
    img.pixels.foreach_set(data.ravel())
    sc = bpy.context.scene
    st = sc.render.image_settings
    old = (st.file_format, st.color_mode, st.color_depth, st.compression)
    st.file_format, st.color_mode, st.color_depth, st.compression = 'PNG', 'RGBA', '8', 15
    img.save_render(path, scene=sc)
    st.file_format, st.color_mode, st.color_depth, st.compression = old
    bpy.data.images.remove(img)
    return os.path.getsize(path)


def scene_for_render(reset=True):
    """Cena Eevee de ícone/preview (mesma de ui_common: fundo transparente, luz de 3 pontos)."""
    import ui_common as U
    if reset:
        U.setup_scene()
    else:  # conferência da geometria sem apagar o modelo recém-construído
        keep = C.reset_scene
        C.reset_scene = lambda: None
        try:
            U.setup_scene()
        finally:
            C.reset_scene = keep
    U.make_world()
    U.make_lights()
    cam = U.make_camera(22.0)
    return U, cam


def game_bbox(pts):
    """Caixa em coordenadas do jogo (x, y, z) a partir de pontos do Blender (x, y, z)."""
    lo = (float(pts[:, 0].min()), float(pts[:, 2].min()), float((-pts[:, 1]).min()))
    hi = (float(pts[:, 0].max()), float(pts[:, 2].max()), float((-pts[:, 1]).max()))
    return tuple(round(v, 3) for v in lo), tuple(round(v, 3) for v in hi)


VIEWS = {  # nome: (azimute, elevação, fov): az 0 = de frente (+z), positivo = lado +x; negativo = lado -x
    'f34': (-38.0, 16.0, 22.0), 'side': (-90.0, 4.0, 18.0), 'front': (0.0, 8.0, 22.0), 'back': (180.0, 14.0, 22.0),
    'top': (0.0, 80.0, 22.0), 'game': (-30.0, 48.0, 24.0), 'right34': (40.0, 18.0, 22.0),
}


def render_views(U, cam, objs, out_dir, names, bg_hex='#d9c28e', size=None):
    """Vistas de conferência sobre fundo de areia (arquivos fora do repositório)."""
    pts = U.world_points(objs)
    bg = np.array(hex_lin(bg_hex)[:3], dtype=np.float32)
    # o fundo é opaco em sRGB: converte hex -> sRGB direto
    bgs = np.array([int(bg_hex[i:i + 2], 16) / 255.0 for i in (1, 3, 5)], dtype=np.float32)
    done = []
    for nm in names:
        az, el, fov = VIEWS[nm]
        U.fit_camera(cam, pts, U.dir_from_angles(az, el), fov=fov, margin=0.07)
        arr = U.render_rgba('dev_' + nm)
        rgb = U.composite_over(U.premultiply(arr), bgs)
        out = np.concatenate([rgb, np.ones(rgb.shape[:2] + (1,), dtype=np.float32)], axis=2)
        save_png(out, os.path.join(out_dir, f'{OUT_NAME}_{nm}.png'))
        done.append(nm)
    return done


def main():
    args = C.script_args()
    dev = '--dev-flat' in args
    dev_out = args[args.index('--dev-out') + 1] if '--dev-out' in args else None
    C.reset_scene()
    mats = dev_materials() if dev else make_materials()

    root = C.make_empty(ROOT_NAME)
    body = build_body(mats, root)
    head = build_head(mats, body)
    legs = [build_leg(mats, n, n.startswith('Leg_F')) for n in ('Leg_FL', 'Leg_FR', 'Leg_BL', 'Leg_BR')]

    body_obj = body.build(mats, root, (0, 0, 0))
    head_obj = head.build(mats, body_obj, BODY_O)
    leg_objs = [lg.build(mats, body_obj, BODY_O) for lg in legs]
    # âncoras (nós vazios): geometria mesclada em Head/Body para caber em 6 draw calls
    C.make_empty('Snout', tuple(SNOUT_O - HEAD_O), parent=head_obj)
    for nm, o in TUSK_O.items():
        C.make_empty(nm, tuple(o - HEAD_O), parent=head_obj)
    C.make_empty('Tail', tuple(TAIL_O - BODY_O), parent=body_obj)
    parts = [body_obj, head_obj] + leg_objs
    bpy.context.view_layer.update()

    if dev:
        U, cam = scene_for_render(reset=False)
        objs = [o for o in bpy.data.objects if o.type == 'MESH']
        names = ('f34', 'side', 'front', 'back', 'top', 'game')
        render_views(U, cam, objs, dev_out, names)
        pts = U.world_points(objs)
        print('BBOX', game_bbox(pts))
        print('STATS', C.stats(root))
        return

    C.uv_atlas(parts, weights={'Head': 1.5, 'Body': 1.0, 'Leg_FL': 0.9, 'Leg_FR': 0.9, 'Leg_BL': 0.9, 'Leg_BR': 0.9},
               margin=0.006, angle=66.0)
    img = C.bake_atlas(parts, f'{OUT_NAME}_atlas', 512, samples=int(os.environ.get('BAKE_SAMPLES', 48)), margin=4)
    C.finalize_materials(parts, img, team_default='#ffffff', roughness=0.82,
                         out_png=os.path.join(C.BUILD_DIR, f'{OUT_NAME}_atlas.png'))
    out = os.path.join(C.OUT_MODELS, f'{OUT_NAME}.glb')
    C.export_glb(root, out)
    st = C.stats(root, out)
    print('STATS', OUT_NAME, st)
    rep = glb_report(out)
    print('GLB', json.dumps(rep, ensure_ascii=False))

    if '--no-render' in args and not dev_out:
        return
    # reimporta o .glb exportado (valida o artefato de verdade) e renderiza
    U, cam = scene_for_render(reset=True)
    imp_root, objs = U.import_glb(OUT_NAME)
    U.polish_materials(rough=0.88, spec=0.12)
    meshes = [o for o in objs if o.type == 'MESH']
    pts = U.world_points(meshes)
    print('BBOX', game_bbox(pts))
    if dev_out and '--views' in args:
        render_views(U, cam, meshes, dev_out, ('f34', 'side', 'front', 'back', 'top', 'game', 'right34'))
    if '--no-render' in args:
        return
    # preview 512 px: câmera fixa 3/4, fundo transparente
    az, el, fov = VIEWS['f34']
    U.fit_camera(cam, pts, U.dir_from_angles(az, el), fov=fov, margin=0.08)
    arr = U.render_rgba('critter_boar_preview')
    print('PREVIEW', save_png(arr, PREVIEW_PATH), 'B')
    # ícone 128 px: 3/4, contorno escuro (mesmo OUTLINE/OUT_COLOR de render_icons.py)
    U.fit_camera(cam, pts, U.dir_from_angles(-40.0, 14.0), fov=22.0, margin=0.07)
    arr = U.render_rgba('critter_boar_icon')
    pm = U.premultiply(arr)
    po = U.outline(pm, 6, (0.045, 0.055, 0.085))
    res = U.unpremultiply(U.box_down(po, U.SS // 128))
    print('ICON', save_png(res, ICON_PATH), 'B')


if __name__ == '__main__':
    main()
