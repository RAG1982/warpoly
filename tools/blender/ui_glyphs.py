"""
ui_glyphs.py (F7-09) — glifos 3D procedurais para os ícones de comando, pesquisa e habilidade.

Os ícones de UNIDADES e CONSTRUÇÕES vêm dos .glb existentes; aqui ficam só os objetos que não existem em nenhum
modelo (espada solta, escudo, caveira, redemoinho…). Mesma linguagem visual do jogo: formas grossas de poucos
polígonos, bisel, cores chapadas do mesmo palette dos modelos e brilho (emissão) só nos efeitos mágicos.

Convenção (como common.py): coordenadas do JOGO — x direita, y cima, +z para a câmera. Cada glifo cabe, grosso modo,
em [-1, 1] x [-1, 1]; a câmera é ajustada pelo `fit_camera`, então a escala absoluta não importa, mas as proporções do
bisel (0,02–0,05) foram pensadas para esse tamanho. Polígonos 2D são extrudados em z (voltados para a câmera).

API: GLYPHS[nome](gb) constrói o glifo no `GB` recebido; `build_glyph(nome)` devolve (objetos, dica_de_camera).
"""
import math
import random
import bpy
from mathutils import Vector, Matrix

import common as C
from common import (MeshBuilder, M, prim_box, prim_cyl, prim_cone, prim_sphere, prim_extrude, prim_rings,
                    limb_rings, bezier, hex_lin)

# ---------------------------------------------------------------------------
# Materiais (Principled simples; as cores seguem os modelos do jogo)
# ---------------------------------------------------------------------------
# chave: (cor, rugosidade, metal, emissão). Emissivos: a cor-base é escurecida (a luz da cena não "lava" o brilho).
PALETTE = {
    'steel': ('#c5ceda', 0.36, 0.55, 0), 'steel_dark': ('#7e8a9c', 0.45, 0.5, 0), 'iron': ('#4c535f', 0.5, 0.5, 0),
    'black': ('#191a20', 0.6, 0.2, 0), 'gold': ('#f2c242', 0.32, 0.7, 0), 'gold_dark': ('#b98421', 0.4, 0.6, 0),
    'bronze': ('#b87a3d', 0.4, 0.5, 0),
    'wood': ('#9b6b3b', 0.72, 0, 0), 'wood_dark': ('#5e3c22', 0.78, 0, 0), 'wood_light': ('#d3a76c', 0.7, 0, 0),
    'leather': ('#7e4c2c', 0.82, 0, 0),
    'cloth_blue': ('#2d60b9', 0.85, 0, 0), 'cloth_red': ('#b9242c', 0.85, 0, 0), 'cloth_dark': ('#2b2433', 0.9, 0, 0),
    'white': ('#f5f2e9', 0.7, 0, 0), 'bone': ('#ebe0c0', 0.75, 0, 0), 'bone_dark': ('#bfae86', 0.8, 0, 0),
    'stone': ('#8f939c', 0.85, 0, 0), 'stone_dark': ('#5e6169', 0.9, 0, 0), 'brick': ('#a8553a', 0.85, 0, 0),
    'red': ('#d9372d', 0.5, 0, 0), 'red_dark': ('#8e1d1d', 0.55, 0, 0), 'green': ('#4faf4f', 0.6, 0, 0),
    'orc_skin': ('#63a649', 0.7, 0, 0), 'skin': ('#e4b590', 0.7, 0, 0), 'wool': ('#f3f0e8', 0.95, 0, 0),
    'blue': ('#3b7be0', 0.45, 0, 0), 'purple_dark': ('#4a2f6e', 0.6, 0, 0), 'ash': ('#6f7179', 0.95, 0, 0),
    'ash_dark': ('#42444b', 0.95, 0, 0),
    # emissivos (efeitos mágicos)
    'fire_o': ('#ff7312', 0.5, 0, 1.25), 'fire_y': ('#ffc61f', 0.5, 0, 1.5), 'fire_r': ('#ff3015', 0.5, 0, 1.2),
    'glow_green': ('#3df06a', 0.5, 0, 1.15), 'glow_blue': ('#35b4ff', 0.5, 0, 1.2), 'glow_ice': ('#aee4ff', 0.3, 0, 0.8),
    'glow_purple': ('#a45cff', 0.5, 0, 1.25), 'glow_gold': ('#ffd04a', 0.5, 0, 1.3), 'glow_red': ('#ff3a3a', 0.5, 0, 1.2),
    'ice': ('#9fd8ff', 0.15, 0, 0.3),
}


def glyph_material(key):
    """Material Principled da paleta (criado uma vez por cena)."""
    name = 'G_' + key
    m = bpy.data.materials.get(name)
    if m:
        return m
    col, rough, metal, emit = PALETTE[key]
    m = bpy.data.materials.new(name)
    try:
        m.use_nodes = True
    except Exception:
        pass
    bsdf = m.node_tree.nodes['Principled BSDF']
    base = hex_lin(col)
    if emit:
        base = (base[0] * 0.45, base[1] * 0.45, base[2] * 0.45, 1.0)
    bsdf.inputs['Base Color'].default_value = base
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    try:
        bsdf.inputs['Specular IOR Level'].default_value = 0.45
    except KeyError:
        pass
    if emit:
        bsdf.inputs['Emission Color'].default_value = hex_lin(col)
        bsdf.inputs['Emission Strength'].default_value = emit
    return m


def ghost_material(name='G_ghost', color='#9fd4ff', alpha=0.62, emit=0.55):
    """Material translúcido (fantasma) para a Invisibilidade: Principled com alfa + emissão azulada."""
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    try:
        m.use_nodes = True
    except Exception:
        pass
    bsdf = m.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = hex_lin('#6aa8e8')
    bsdf.inputs['Alpha'].default_value = alpha
    bsdf.inputs['Roughness'].default_value = 0.4
    bsdf.inputs['Emission Color'].default_value = hex_lin(color)
    bsdf.inputs['Emission Strength'].default_value = emit
    try:
        m.surface_render_method = 'BLENDED'
    except Exception:
        try:
            m.blend_method = 'BLEND'
        except Exception:
            pass
    return m


def ext(pts, depth, axis='z', center=True):
    """Polígono 2D (x, y) extrudado em z — voltado para a câmera (o padrão de common.prim_extrude é 'x')."""
    return prim_extrude(pts, depth, axis=axis, center=center)


# ---------------------------------------------------------------------------
# Construtor
# ---------------------------------------------------------------------------
class GB:
    """Acumula primitivas de um glifo num MeshBuilder (1 objeto por glifo)."""

    def __init__(self, name):
        self.name = name
        self.mb = MeshBuilder(name)
        self.extra = []       # objetos extras (brilho/billboards) — não entram no enquadramento
        self.hint = {}

    # -- primitivas -------------------------------------------------------
    def box(self, size, mat, t=(0, 0, 0), r=(0, 0, 0), s=1.0, taper=(1.0, 1.0), shift=(0.0, 0.0), bevel=0.02, smooth=0):
        sx, sy, sz = size
        return self.mb.add(prim_box(sx, sy, sz, taper=taper, shift=shift), mat, M(t, r, s), bevel=bevel, smooth=smooth)

    def cyl(self, r0, r1, h, mat, t=(0, 0, 0), r=(0, 0, 0), s=1.0, n=14, base=True, bevel=0.0, smooth=70, caps=(True, True)):
        return self.mb.add(prim_cyl(r0, r1, h, n, base=base, cap0=caps[0], cap1=caps[1]), mat, M(t, r, s), bevel=bevel, smooth=smooth)

    def cone(self, r, h, mat, t=(0, 0, 0), rot=(0, 0, 0), s=1.0, n=10, base=True, smooth=60):
        return self.mb.add(prim_cone(r, h, n, base=base), mat, M(t, rot, s), smooth=smooth)

    def sphere(self, rx, ry, rz, mat, t=(0, 0, 0), r=(0, 0, 0), nu=12, nv=7, smooth=80, y_min=-1.0, y_max=1.0):
        return self.mb.add(prim_sphere(rx, ry, rz, nu, nv, y_min, y_max), mat, M(t, r), smooth=smooth)

    def poly(self, pts, depth, mat, t=(0, 0, 0), r=(0, 0, 0), s=1.0, bevel=0.02, smooth=0):
        """Polígono 2D (x, y) extrudado em z (espessura `depth`, centrada)."""
        return self.mb.add(ext(pts, depth), mat, M(t, r, s), bevel=bevel, smooth=smooth)

    def tube(self, path, radii, mat, n=8, smooth=65, caps=True, bevel=0.0, up=(0, 0, 1)):
        rings = limb_rings(path, radii, n, up=up)
        return self.mb.add(prim_rings(rings, cap0=caps, cap1=caps), mat, smooth=smooth, bevel=bevel)

    def torus(self, R, r, mat, t=(0, 0, 0), rot=(0, 0, 0), nM=28, nm=8, smooth=70):
        return self.mb.add(prim_torus(R, r, nM, nm), mat, M(t, rot), smooth=smooth)

    # -- saída --------------------------------------------------------------
    def build(self):
        lookup = {k: (ghost_material() if k == 'ghost' else glyph_material(k)) for k in self.mb.mats}
        return self.mb.build(lookup)


def prim_torus(R, r, nM=28, nm=8):
    """Toro no plano XY (eixo z), raio maior R, raio do tubo r, com costura soldada."""
    verts, faces = [], []
    for i in range(nM):
        th = 2 * math.pi * i / nM
        cx, cy = math.cos(th), math.sin(th)
        for j in range(nm):
            ph = 2 * math.pi * j / nm
            rr = R + r * math.cos(ph)
            verts.append((cx * rr, cy * rr, r * math.sin(ph)))
    for i in range(nM):
        i2 = (i + 1) % nM
        for j in range(nm):
            j2 = (j + 1) % nm
            faces.append((i * nm + j, i2 * nm + j, i2 * nm + j2, i * nm + j2))
    return verts, faces


def orient(d):
    """Rotação (Matrix 4x4, espaço do jogo) que leva +y para a direção d."""
    return Vector((0, 1, 0)).rotation_difference(Vector(d).normalized()).to_matrix().to_4x4()


def pivot(T, dy):
    """T com a origem deslocada ao longo do eixo da peça (centraliza ferramentas/espadas que giram em X)."""
    return (T or Matrix.Identity(4)) @ M((0, -dy, 0))


def add_glow(name, color, radius, strength=1.0, z=-0.4, center=(0.0, 0.0), alpha_peak=0.4):
    """Billboard de brilho (disco com degradê radial: emissivo no centro, transparente na borda), atrás do glifo.
    Fica no plano xy (coordenadas do jogo) em z; não entra no enquadramento (`obj['nofit']`). O raio deve caber no
    quadro (≈ 1,0 × meia-largura do glifo), senão o halo é cortado pela borda do ícone."""
    me = bpy.data.meshes.new('Glow_' + name)
    n = 48
    verts = [(0.0, 0.0, 0.0)] + [(math.cos(2 * math.pi * i / n) * radius, math.sin(2 * math.pi * i / n) * radius, 0.0) for i in range(n)]
    faces = [(0, 1 + i, 1 + (i + 1) % n) for i in range(n)]
    gv = [C.g(v[0] + center[0], v[1] + center[1], z) for v in verts]
    me.from_pydata([tuple(v) for v in gv], [], [tuple(reversed(f)) for f in faces])
    me.update()
    mat = bpy.data.materials.new('GlowMat_' + name)
    try:
        mat.use_nodes = True
    except Exception:
        pass
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    emi = nt.nodes.new('ShaderNodeEmission')
    emi.inputs['Color'].default_value = hex_lin(color)
    emi.inputs['Strength'].default_value = strength
    tr = nt.nodes.new('ShaderNodeBsdfTransparent')
    mix = nt.nodes.new('ShaderNodeMixShader')
    tc = nt.nodes.new('ShaderNodeTexCoord')
    grad = nt.nodes.new('ShaderNodeTexGradient')
    grad.gradient_type = 'SPHERICAL'
    mp = nt.nodes.new('ShaderNodeMapping')
    mp.inputs['Location'].default_value = (-0.5, -0.5, 0.0)
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    els = ramp.color_ramp.elements
    els[0].position = 0.0
    els[0].color = (alpha_peak, alpha_peak, alpha_peak, 1)
    els[1].position = 0.5
    els[1].color = (0, 0, 0, 1)
    mid = els.new(0.25)
    mid.color = (alpha_peak * 0.4, alpha_peak * 0.4, alpha_peak * 0.4, 1)
    nt.links.new(tc.outputs['Generated'], mp.inputs['Vector'])
    nt.links.new(mp.outputs['Vector'], grad.inputs['Vector'])
    nt.links.new(grad.outputs['Fac'], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], mix.inputs['Fac'])
    nt.links.new(tr.outputs['BSDF'], mix.inputs[1])
    nt.links.new(emi.outputs['Emission'], mix.inputs[2])
    nt.links.new(mix.outputs['Shader'], out.inputs['Surface'])
    try:
        mat.surface_render_method = 'BLENDED'
    except Exception:
        try:
            mat.blend_method = 'BLEND'
        except Exception:
            pass
    me.materials.append(mat)
    obj = bpy.data.objects.new('Glow_' + name, me)
    bpy.context.scene.collection.objects.link(obj)
    obj['nofit'] = True
    obj.visible_shadow = False
    return obj


# ---------------------------------------------------------------------------
# Peças reutilizáveis (todas no plano xy, frente = +z; T = matriz do jogo)
# ---------------------------------------------------------------------------
def p_sword(gb, T=None, blade='steel', guard='gold', grip='leather', s=1.0, center=True):
    T = pivot(T, 0.52 * s if center else 0.0)
    blade_pts = [(-0.115, 0.0), (0.115, 0.0), (0.115, 1.28), (0.0, 1.56), (-0.115, 1.28)]
    gb.mb.add(ext(blade_pts, 0.07), blade, T @ M((0, 0, 0), (0, 0, 0), s), bevel=0.012)
    gb.mb.add(prim_box(0.045, 1.2, 0.085), 'steel_dark', T @ M((0, 0.62, 0), (0, 0, 0), s), bevel=0.006)     # canal central
    gb.mb.add(prim_box(0.7, 0.11, 0.15), guard, T @ M((0, -0.04, 0), (0, 0, 0), s), bevel=0.02)
    gb.mb.add(prim_cyl(0.052, 0.052, 0.38, 10), grip, T @ M((0, -0.46, 0), (0, 0, 0), s), smooth=70)
    gb.mb.add(prim_sphere(0.09, 0.09, 0.09, 10, 6), guard, T @ M((0, -0.52, 0), (0, 0, 0), s), smooth=80)


def p_axe(gb, T=None, head='steel', handle='wood', s=1.0, spike=True, center=True):
    T = pivot(T, 0.3 * s if center else 0.0)
    gb.mb.add(prim_cyl(0.052, 0.045, 1.7, 10), handle, T @ M((0, -0.2, 0), (0, 0, 0), s), smooth=70)
    gb.mb.add(prim_sphere(0.06, 0.06, 0.06, 8, 5), 'gold_dark', T @ M((0, -0.22, 0), (0, 0, 0), s), smooth=80)
    blade_pts = [(0.04, 1.32), (0.34, 1.52), (0.62, 1.34), (0.56, 0.92), (0.34, 1.0), (0.04, 1.02)]
    gb.mb.add(ext(blade_pts, 0.1), head, T @ M((0, 0, 0), (0, 0, 0), s), bevel=0.014)
    if spike:
        gb.mb.add(prim_cone(0.06, 0.3, 8), 'steel_dark', T @ M((-0.05, 1.22, 0), (0, 0, 90), s))


def p_shield_kite(gb, T=None, field='cloth_blue', rim='gold', s=1.0):
    T = T or Matrix.Identity(4)
    outer = [(-0.62, 0.92), (0.62, 0.92), (0.62, 0.12), (0.0, -1.0), (-0.62, 0.12)]
    inner = [(-0.5, 0.8), (0.5, 0.8), (0.5, 0.14), (0.0, -0.86), (-0.5, 0.14)]
    gb.mb.add(ext(outer, 0.14), rim, T @ M((0, 0, 0), (0, 0, 0), s), bevel=0.025)
    gb.mb.add(ext(inner, 0.14), field, T @ M((0, 0, 0.03), (0, 0, 0), s), bevel=0.02)
    gb.mb.add(prim_box(0.16, 1.0, 0.04), rim, T @ M((0, 0.18, 0.115), (0, 0, 0), s), bevel=0.01)
    gb.mb.add(prim_box(0.7, 0.16, 0.04), rim, T @ M((0, 0.42, 0.115), (0, 0, 0), s), bevel=0.01)
    gb.mb.add(prim_sphere(0.15, 0.15, 0.09, 12, 6), 'steel', T @ M((0, 0.42, 0.13), (0, 0, 0), s), smooth=80)


def p_shield_round(gb, T=None, face='iron', rim='steel_dark', spikes='steel', s=1.0, mark='red', n_spikes=8):
    T = T or Matrix.Identity(4)
    gb.mb.add(prim_cyl(0.85, 0.85, 0.14, 24, base=False), face, T @ M((0, 0, 0), (90, 0, 0), s), smooth=60)
    gb.mb.add(prim_torus(0.82, 0.07, 28, 8), rim, T @ M((0, 0, 0.0), (0, 0, 0), s), smooth=70)
    if mark:
        gb.mb.add(prim_box(0.18, 1.1, 0.04), mark, T @ M((0, 0, 0.085), (0, 0, 20), s), bevel=0.008)
        gb.mb.add(prim_box(1.1, 0.18, 0.04), mark, T @ M((0, 0, 0.088), (0, 0, 20), s), bevel=0.008)
    gb.mb.add(prim_cone(0.2, 0.42, 12), spikes, T @ M((0, 0, 0.07), (90, 0, 0), s))
    for i in range(n_spikes):
        a = 2 * math.pi * i / n_spikes
        gb.mb.add(prim_cone(0.075, 0.26, 8), spikes, T @ M((math.cos(a) * 0.82, math.sin(a) * 0.82, 0.02), (0, 0, math.degrees(a) - 90), s))


def p_arrow(gb, T=None, length=1.8, head='steel', shaft='wood_light', fletch='cloth_red', s=1.0):
    T = T or Matrix.Identity(4)
    gb.mb.add(prim_cyl(0.028, 0.028, length, 8), shaft, T @ M((0, 0, 0), (0, 0, 0), s), smooth=70)
    gb.mb.add(prim_cone(0.085, 0.26, 8), head, T @ M((0, length, 0), (0, 0, 0), s))
    for k in range(3):
        gb.mb.add(ext([(0, 0), (0.12, 0.0), (0.12, 0.28), (0, 0.34)], 0.014), fletch, T @ M((0, 0.05, 0), (0, 120 * k, 0), s), bevel=0.0)


def p_hammer(gb, T=None, s=1.0, center=True):
    T = pivot(T, -0.2 * s if center else 0.0)
    gb.mb.add(prim_cyl(0.06, 0.05, 1.4, 10), 'wood', T @ M((0, -0.7, 0), (0, 0, 0), s), smooth=70)
    gb.mb.add(prim_box(0.62, 0.36, 0.34), 'steel', T @ M((0, 0.82, 0), (0, 0, 0), s), bevel=0.03)
    gb.mb.add(prim_box(0.14, 0.3, 0.3), 'steel_dark', T @ M((-0.38, 0.82, 0), (0, 0, 0), s), bevel=0.02)
    gb.mb.add(prim_box(0.7, 0.07, 0.38), 'gold_dark', T @ M((0, 0.6, 0), (0, 0, 0), s), bevel=0.01)


def p_wrench(gb, T=None, s=1.0, center=True):
    T = pivot(T, 0.3 * s if center else 0.0)
    pts = []
    n = 14
    for i in range(n + 1):
        a = math.radians(40 + (360 - 80) * i / n)
        pts.append((math.cos(a) * 0.36, math.sin(a) * 0.36 + 0.95))
    for i in range(n + 1):
        a = math.radians(320 - (360 - 80) * i / n)
        pts.append((math.cos(a) * 0.19, math.sin(a) * 0.19 + 0.95))
    gb.mb.add(ext(pts, 0.2), 'steel', T @ M((0, 0, 0), (0, 0, 0), s), bevel=0.02)
    gb.mb.add(prim_box(0.2, 1.5, 0.2), 'steel', T @ M((0, 0.1, 0), (0, 0, 0), s), bevel=0.03)
    gb.mb.add(prim_box(0.215, 0.5, 0.215), 'cloth_red', T @ M((0, -0.42, 0), (0, 0, 0), s), bevel=0.025)


def p_pickaxe(gb, T=None, s=1.0, center=True):
    T = pivot(T, -0.2 * s if center else 0.0)
    gb.mb.add(prim_cyl(0.055, 0.048, 1.7, 10), 'wood', T @ M((0, -0.7, 0), (0, 0, 0), s), smooth=70)
    head = bezier((-0.85, 0.74, 0), (0.0, 1.3, 0), (0.85, 0.74, 0), 10)
    rings = limb_rings(head, [0.05, 0.1, 0.12, 0.13, 0.13, 0.13, 0.13, 0.13, 0.12, 0.1, 0.05], 8)
    gb.mb.add(prim_rings(rings), 'steel', T @ M((0, 0, 0), (0, 0, 0), s), smooth=65)
    gb.mb.add(prim_cone(0.05, 0.16, 8), 'steel_dark', T @ M((-0.92, 0.7, 0), (0, 0, 70), s))
    gb.mb.add(prim_cone(0.05, 0.16, 8), 'steel_dark', T @ M((0.92, 0.7, 0), (0, 0, -70), s))


def p_cross(gb, mat, T=None, arm=0.34, length=1.5, thick=0.16, s=1.0, bevel=0.03):
    T = T or Matrix.Identity(4)
    gb.mb.add(prim_box(arm, length, thick), mat, T @ M((0, 0, 0), (0, 0, 0), s), bevel=bevel)
    gb.mb.add(prim_box(length, arm, thick), mat, T @ M((0, 0, 0), (0, 0, 0), s), bevel=bevel)


def p_star(gb, mat, T=None, spikes=4, r_out=0.5, r_in=0.14, thick=0.1, s=1.0):
    T = T or Matrix.Identity(4)
    pts = []
    for i in range(spikes * 2):
        a = math.pi / 2 + math.pi * i / spikes
        r = r_out if i % 2 == 0 else r_in
        pts.append((math.cos(a) * r, math.sin(a) * r))
    gb.mb.add(ext(pts, thick), mat, T @ M((0, 0, 0), (0, 0, 0), s), bevel=0.01)


FLAME = [(-0.30, 0.12), (-0.36, 0.40), (-0.22, 0.62), (-0.12, 0.90), (0.0, 1.28), (0.10, 0.94), (0.28, 0.72), (0.37, 0.42),
         (0.31, 0.14), (0.14, -0.02), (-0.12, -0.02)]


def p_flame(gb, T=None, s=1.0, outer='fire_o', inner='fire_y', lean=0.0):
    """Chama estilizada (silhueta em língua, 2 camadas), apontando para +y; `lean` inclina a ponta (em x)."""
    T = T or Matrix.Identity(4)
    pts = [(x + lean * max(0.0, y) * 0.5, y) for (x, y) in FLAME]
    gb.mb.add(ext(pts, 0.12), outer, T @ M((0, 0, 0), (0, 0, 0), s), bevel=0.02)
    pts2 = [(x * 0.55 + lean * max(0.0, y) * 0.35, y * 0.62 + 0.04) for (x, y) in FLAME]
    gb.mb.add(ext(pts2, 0.12), inner, T @ M((0, 0, 0.05), (0, 0, 0), s), bevel=0.015)


def p_skull(gb, T=None, s=1.0, bone='bone', glow=None):
    T = T or Matrix.Identity(4)
    gb.mb.add(prim_sphere(0.62, 0.58, 0.58, 14, 8), bone, T @ M((0, 0.12, 0), (0, 0, 0), s), smooth=75)
    gb.mb.add(prim_box(0.64, 0.34, 0.5, taper=(0.82, 0.9)), bone, T @ M((0, -0.5, -0.02), (0, 0, 0), s), bevel=0.04, smooth=40)
    eye = glow or 'black'
    gb.mb.add(prim_sphere(0.17, 0.2, 0.1, 10, 6), eye, T @ M((-0.25, 0.1, 0.5), (0, 0, 0), s), smooth=80)
    gb.mb.add(prim_sphere(0.17, 0.2, 0.1, 10, 6), eye, T @ M((0.25, 0.1, 0.5), (0, 0, 0), s), smooth=80)
    gb.mb.add(prim_cone(0.09, 0.2, 3), 'black', T @ M((0, -0.12, 0.54), (180, 0, 0), s))
    for k in range(4):
        gb.mb.add(prim_box(0.085, 0.2, 0.06), 'bone_dark', T @ M((-0.18 + 0.12 * k, -0.64, 0.24), (0, 0, 0), s), bevel=0.01)


def p_crate(gb, T=None, s=1.0):
    T = T or Matrix.Identity(4)
    gb.mb.add(prim_box(1.1, 0.9, 0.9), 'wood', T @ M((0, 0, 0), (0, 0, 0), s), bevel=0.04)
    for dx in (-0.45, 0.45):
        gb.mb.add(prim_box(0.12, 0.94, 0.94), 'wood_dark', T @ M((dx, 0, 0), (0, 0, 0), s), bevel=0.015)
    gb.mb.add(prim_box(1.14, 0.12, 0.94), 'wood_dark', T @ M((0, 0.3, 0), (0, 0, 0), s), bevel=0.015)
    gb.mb.add(prim_box(1.14, 0.12, 0.94), 'wood_dark', T @ M((0, -0.3, 0), (0, 0, 0), s), bevel=0.015)
    gb.mb.add(prim_box(0.34, 0.34, 0.04), 'gold', T @ M((0, 0, 0.47), (0, 0, 45), s), bevel=0.01)


def p_arrow_flat(gb, mat, T=None, length=1.8, w=0.4, head=0.7, thick=0.14, s=1.0, outline=None):
    """Seta chapada apontando para +x (extrusão em z)."""
    T = T or Matrix.Identity(4)
    L = length
    pts = [(-L / 2, -w / 2), (L / 2 - head, -w / 2), (L / 2 - head, -w), (L / 2, 0), (L / 2 - head, w), (L / 2 - head, w / 2), (-L / 2, w / 2)]
    if outline:
        big = [(x + (0.07 if x > 0 else -0.07), y * 1.2) for (x, y) in pts]
        gb.mb.add(ext(big, thick * 0.9), outline, T @ M((0, 0, -0.03), (0, 0, 0), s), bevel=0.02)
    gb.mb.add(ext(pts, thick), mat, T @ M((0, 0, 0.0), (0, 0, 0), s), bevel=0.025)


# ---------------------------------------------------------------------------
# Glifos de COMANDO
# ---------------------------------------------------------------------------
def g_stop(gb):
    oct_pts = [(math.cos(math.radians(22.5 + 45 * i)), math.sin(math.radians(22.5 + 45 * i))) for i in range(8)]
    gb.poly(oct_pts, 0.22, 'red_dark', bevel=0.035)
    gb.poly([(x * 0.9, y * 0.9) for x, y in oct_pts], 0.24, 'red', bevel=0.03, t=(0, 0, 0.01))
    gb.poly([(x * 0.7, y * 0.7) for x, y in oct_pts], 0.26, 'white', bevel=0.02, t=(0, 0, 0.012))
    gb.box((0.62, 0.62, 0.1), 'red', t=(0, 0, 0.17), bevel=0.05)
    gb.hint = dict(az=0, el=4, fov=18)


def g_move(gb):
    gb.mb.add(ext([(-0.95, -0.28), (0.15, -0.28), (0.15, -0.62), (1.0, 0), (0.15, 0.62), (0.15, 0.28), (-0.95, 0.28)], 0.2),
              'gold_dark', M((0, 0, -0.02), (0, 0, 28)), bevel=0.04)
    gb.mb.add(ext([(-0.85, -0.2), (0.08, -0.2), (0.08, -0.5), (0.82, 0), (0.08, 0.5), (0.08, 0.2), (-0.85, 0.2)], 0.22),
              'blue', M((0, 0, 0.02), (0, 0, 28)), bevel=0.03)
    gb.hint = dict(az=0, el=6, fov=18)


def g_attack(gb):
    p_sword(gb, M((0, 0, 0.0), (0, 0, -42), 0.62))
    p_sword(gb, M((0, 0, 0.12), (0, 0, 42), 0.62))
    gb.hint = dict(az=0, el=4, fov=19)


def g_attack_move(gb):
    p_sword(gb, M((-0.05, 0.28, 0.0), (0, 0, -28), 0.8))
    p_arrow_flat(gb, 'blue', M((0.0, -1.05, 0.0), (0, 0, 0)), length=2.0, w=0.22, head=0.55, thick=0.14, outline='gold_dark')
    gb.hint = dict(az=0, el=4, fov=19)


def g_patrol(gb):
    for sgn in (1, -1):
        a0, a1 = (25, 155) if sgn == 1 else (205, 335)
        pts = [(math.cos(math.radians(a)) * 0.8, math.sin(math.radians(a)) * 0.8, 0.0) for a in [a0 + (a1 - a0) * i / 12 for i in range(13)]]
        gb.tube(pts, [0.12] * 13, 'blue', n=8)
        a = math.radians(a1)
        tang = Vector((-math.sin(a), math.cos(a), 0.0))
        gb.mb.add(prim_cone(0.3, 0.5, 10), 'gold', Matrix.Translation(Vector(pts[-1]) + tang * 0.06) @ orient(tang), smooth=40)
    gb.hint = dict(az=0, el=6, fov=19)


def g_hold(gb):
    p_shield_kite(gb, M((0, 0, 0), (0, 0, 0), 1.0))
    gb.hint = dict(az=0, el=4, fov=19)


def g_gather(gb):
    p_pickaxe(gb, M((0, 0, 0), (0, 0, -35), 0.8))
    p_axe(gb, M((0, 0, 0.18), (0, 0, 35), 0.8))
    gb.hint = dict(az=0, el=4, fov=19)


def g_build(gb):
    for (x, y) in [(-0.6, -0.78), (0.0, -0.78), (0.6, -0.78), (-0.3, -0.42), (0.3, -0.42)]:
        gb.box((0.56, 0.3, 0.4), 'brick', t=(x, y, -0.05), bevel=0.025)
    p_hammer(gb, M((0.5, 0.3, 0.2), (0, 0, -32), 0.78))
    gb.hint = dict(az=8, el=8, fov=19)


def g_repair(gb):
    p_wrench(gb, M((0, 0, 0.0), (0, 0, 35), 0.82))
    p_hammer(gb, M((0, 0, 0.14), (0, 0, -35), 0.78))
    gb.hint = dict(az=0, el=4, fov=19)


def g_cancel(gb):
    gb.box((0.34, 1.9, 0.22), 'red_dark', t=(0, 0, -0.01), r=(0, 0, 45), bevel=0.05)
    gb.box((0.34, 1.9, 0.22), 'red_dark', t=(0, 0, -0.01), r=(0, 0, -45), bevel=0.05)
    gb.box((0.22, 1.78, 0.26), 'red', t=(0, 0, 0.0), r=(0, 0, 45), bevel=0.04)
    gb.box((0.22, 1.78, 0.26), 'red', t=(0, 0, 0.0), r=(0, 0, -45), bevel=0.04)
    gb.hint = dict(az=0, el=4, fov=18)


def g_rally(gb):
    gb.cyl(0.055, 0.055, 2.1, 'wood_dark', t=(-0.5, -1.0, 0), n=10)
    gb.sphere(0.1, 0.1, 0.1, 'gold', t=(-0.5, 1.1, 0))
    gb.mb.add(ext([(0.0, 0.0), (1.25, -0.1), (0.95, -0.45), (1.25, -0.8), (0.0, -0.8)], 0.06), 'cloth_blue', M((-0.5, 1.0, 0.0)), bevel=0.012)
    gb.mb.add(ext([(0.0, 0.0), (1.25, -0.1), (1.25, -0.2), (0.0, -0.1)], 0.07), 'gold', M((-0.5, 1.0, 0.0)), bevel=0.008)
    gb.cone(0.5, 0.28, 'stone', t=(-0.5, -1.05, 0), s=1.0, n=14)
    gb.hint = dict(az=10, el=6, fov=19)


def g_train(gb):
    # grande elmo de cavaleiro (cúpula + corpo cilíndrico, viseira em T e crista)
    gb.sphere(0.72, 0.72, 0.72, 'steel', t=(0, 0.28, 0), y_min=-0.05, y_max=1.0)
    gb.cyl(0.72, 0.72, 0.95, 'steel', t=(0, -0.68, 0), n=20, smooth=70)
    gb.cyl(0.8, 0.74, 0.18, 'steel_dark', t=(0, -0.78, 0), n=20, smooth=60)
    gb.torus(0.73, 0.045, 'gold', t=(0, 0.26, 0), rot=(90, 0, 0), nM=30, nm=6)
    gb.box((0.92, 0.12, 0.1), 'black', t=(0, 0.02, 0.7), bevel=0.01)
    gb.box((0.12, 0.66, 0.1), 'black', t=(0, -0.3, 0.7), bevel=0.01)
    gb.box((1.02, 0.07, 0.07), 'gold', t=(0, 0.12, 0.72), bevel=0.01)
    gb.box((0.07, 0.8, 0.07), 'gold', t=(0, -0.38, 0.72), bevel=0.01)
    gb.mb.add(ext([(-0.3, 0.0), (0.3, 0.0), (0.22, 0.5), (0.0, 0.62), (-0.22, 0.5)], 0.12), 'red', M((0, 0.98, -0.1)), bevel=0.02)
    gb.hint = dict(az=14, el=8, fov=19)


def g_research(gb):
    # tomo azul com cantoneiras douradas e gema (conhecimento / evolução)
    gb.box((1.2, 1.55, 0.14), 'cloth_blue', t=(0.0, 0.0, 0.34), bevel=0.04)
    gb.box((1.2, 1.55, 0.14), 'cloth_blue', t=(0.0, 0.0, -0.34), bevel=0.04)
    gb.box((0.16, 1.55, 0.82), 'cloth_blue', t=(-0.6, 0.0, 0.0), bevel=0.03)
    gb.box((1.06, 1.42, 0.62), 'white', t=(0.06, 0.0, 0.0), bevel=0.02)
    for yy in (-0.5, 0.0, 0.5):
        gb.box((0.2, 0.1, 0.9), 'gold', t=(-0.6, yy, 0.0), bevel=0.01)
    for (cx, cy) in ((-0.5, 0.7), (0.5, 0.7), (-0.5, -0.7), (0.5, -0.7)):
        gb.box((0.26, 0.26, 0.18), 'gold', t=(cx, cy, 0.37), bevel=0.02)
    gb.torus(0.28, 0.05, 'gold', t=(0.06, 0.0, 0.43), nM=24, nm=6)
    gb.sphere(0.22, 0.22, 0.14, 'glow_blue', t=(0.06, 0.0, 0.45), nu=8, nv=5)
    gb.hint = dict(az=22, el=12, fov=19)


def g_unload(gb):
    p_crate(gb, M((-0.2, 0.35, 0), (0, 0, 0), 1.15))
    p_arrow_flat(gb, 'gold', M((0.2, -0.85, 0.3), (0, 0, -14)), length=1.6, w=0.22, head=0.5, thick=0.16, outline='gold_dark')
    gb.hint = dict(az=10, el=10, fov=19)


def g_load(gb):
    p_crate(gb, M((0.2, 0.35, 0), (0, 0, 0), 1.15))
    p_arrow_flat(gb, 'gold', M((-0.2, -0.85, 0.3), (0, 0, 14)), length=1.6, w=0.22, head=0.5, thick=0.16, outline='gold_dark')
    gb.hint = dict(az=10, el=10, fov=19)


# ---------------------------------------------------------------------------
# Glifos de PESQUISA (equipamento)
# ---------------------------------------------------------------------------
def g_sword(gb):
    p_sword(gb, M((0, 0, 0), (0, 0, -40), 1.0))
    gb.hint = dict(az=0, el=4, fov=19)


def g_axe(gb):
    p_axe(gb, M((0, 0, 0), (0, 0, -30), 1.0), head='steel_dark', handle='wood_dark')
    gb.hint = dict(az=0, el=4, fov=19)


def g_shield_human(gb):
    p_shield_kite(gb, M((0, 0, 0), (0, 0, 0), 1.0))
    gb.hint = dict(az=12, el=6, fov=19)


def g_shield_orc(gb):
    p_shield_round(gb, M((0, 0, 0), (0, 0, 0), 1.0))
    gb.hint = dict(az=12, el=6, fov=19)


def g_bomb(gb):
    gb.sphere(0.8, 0.8, 0.8, 'iron', t=(0, -0.2, 0), nu=16, nv=10)
    gb.torus(0.8, 0.07, 'gold_dark', t=(0, -0.2, 0), rot=(90, 0, 0))
    gb.cyl(0.14, 0.14, 0.3, 'steel_dark', t=(0, 0.52, 0), n=10)
    fuse = bezier((0, 0.8, 0), (0.45, 1.2, 0), (0.7, 0.98, 0), 8)
    gb.tube(fuse, [0.05] * 9, 'leather', n=6)
    p_star(gb, 'fire_y', M((0.78, 1.0, 0.08)), spikes=4, r_out=0.3, r_in=0.09, thick=0.1)
    gb.hint = dict(az=8, el=8, fov=20)


def g_boulder_fire(gb):
    rnd = random.Random(7)
    verts, faces = prim_sphere(0.78, 0.7, 0.72, 8, 5)
    verts = [(x + rnd.uniform(-0.09, 0.09), y + rnd.uniform(-0.09, 0.09), z + rnd.uniform(-0.09, 0.09)) for (x, y, z) in verts]
    gb.mb.add((verts, faces), 'stone_dark', M((0.15, -0.35, 0)), smooth=0)
    for i, (x, y, s) in enumerate([(-0.55, 0.1, 0.9), (-0.05, 0.25, 1.15), (0.45, 0.15, 1.0), (0.85, -0.1, 0.7), (-0.95, -0.35, 0.65)]):
        p_flame(gb, M((x, y, 0.3), (0, 0, (i - 2) * -8), 0.75 * s), lean=(i - 2) * 0.1)
    gb.hint = dict(az=8, el=8, fov=20)


def g_cannon(gb):
    gb.cyl(0.28, 0.22, 1.5, 'iron', t=(-0.75, 0.0, 0), r=(0, 0, -90), n=16, smooth=70)
    gb.torus(0.26, 0.06, 'steel_dark', t=(0.65, 0.0, 0), rot=(0, 90, 0))
    gb.sphere(0.3, 0.3, 0.3, 'iron', t=(-0.82, 0.0, 0))
    gb.box((1.2, 0.2, 0.7), 'wood', t=(-0.1, -0.38, 0), bevel=0.03)
    for dz in (-0.42, 0.42):
        gb.cyl(0.38, 0.38, 0.12, 'wood_dark', t=(-0.2, -0.45, dz), r=(90, 0, 0), n=16, base=False, smooth=60)
        gb.cyl(0.1, 0.1, 0.18, 'steel_dark', t=(-0.2, -0.45, dz), r=(90, 0, 0), n=8, base=False)
    gb.sphere(0.18, 0.18, 0.18, 'iron', t=(1.05, -0.5, 0.0))
    gb.hint = dict(az=28, el=14, fov=20)


def g_hull(gb):
    secs = []
    for k in range(9):
        t = k / 8.0
        x = -1.2 + 2.4 * t
        w = 0.55 * math.sin(math.pi * (0.1 + 0.8 * t)) + 0.05
        pts = [(x, 0.28, -w), (x, 0.0, -w * 0.7), (x, -0.32, -w * 0.25), (x, -0.32, w * 0.25), (x, 0.0, w * 0.7), (x, 0.28, w)]
        secs.append(pts)
    gb.mb.add(prim_rings(secs, cap0=True, cap1=True), 'wood', smooth=45)
    gb.cyl(0.04, 0.04, 1.6, 'wood_dark', t=(0.0, 0.25, 0), n=8)
    gb.mb.add(ext([(0.0, 0.0), (0.85, -0.05), (0.85, -0.95), (0.0, -1.0)], 0.04), 'white', M((0.04, 1.8, 0.0)), bevel=0.01)
    gb.hint = dict(az=25, el=14, fov=20)


def g_arrows(gb):
    for (ang, dz) in [(-14, -0.12), (0, 0.0), (14, 0.12)]:
        p_arrow(gb, M((0, -0.95, dz), (0, 0, ang), 1.0), shaft='wood_light')
    gb.hint = dict(az=0, el=4, fov=19)


def g_axes_throw(gb):
    p_axe(gb, M((-0.5, 0.0, 0), (0, 0, 25), 0.85), head='steel', handle='wood_dark')
    p_axe(gb, M((0.5, 0.0, 0.12), (0, 0, -25), 0.85), head='steel', handle='wood_dark')
    gb.hint = dict(az=0, el=4, fov=19)


def g_axe_log(gb):
    gb.cyl(0.42, 0.42, 1.5, 'wood', t=(-0.75, -0.62, 0), r=(0, 0, -90), n=14, smooth=60)
    gb.cyl(0.36, 0.36, 0.02, 'wood_light', t=(0.75, -0.62, 0), r=(0, 0, -90), n=14, base=False)
    gb.torus(0.2, 0.025, 'wood_dark', t=(0.77, -0.62, 0), rot=(0, 90, 0))
    p_axe(gb, M((-0.15, 0.1, 0.35), (0, 0, 28), 0.9), head='steel', handle='wood_dark')
    gb.hint = dict(az=18, el=14, fov=20)


def g_longbow(gb):
    arc = [(0.5 * (1 - (y / 1.15) ** 2) - 0.1, y, 0.0) for y in [-1.15 + 2.3 * i / 14 for i in range(15)]]
    gb.tube(arc, [0.07] * 15, 'wood', n=8)
    gb.tube([(-0.1, -1.15, 0), (-0.1, 1.15, 0)], [0.016, 0.016], 'white', n=5, smooth=0)
    p_arrow(gb, M((-0.2, 0.0, 0.0), (0, 0, -90), 0.62), shaft='wood_light')
    gb.hint = dict(az=10, el=4, fov=19)


def g_target(gb):
    for r, m in ((0.95, 'white'), (0.74, 'red'), (0.52, 'white'), (0.3, 'red'), (0.12, 'gold')):
        gb.cyl(r, r, 0.1 + 0.03 * (1 - r), m, t=(0, 0, 0.0), r=(90, 0, 0), n=24, base=False, smooth=60)
    p_arrow(gb, M((0.12, 0.1, 0.05), (0, 0, -115), 0.78), shaft='wood_light')
    gb.hint = dict(az=14, el=8, fov=19)


def g_eye(gb, iris='gold'):
    top = []
    for i in range(13):
        t = i / 12
        top.append((-1.0 + 2.0 * t, 0.5 * math.sin(math.pi * t) ** 0.8))
    bot = []
    for i in range(1, 12):
        t = 1 - i / 12
        bot.append((-1.0 + 2.0 * t, -0.5 * math.sin(math.pi * t) ** 0.8))
    gb.poly(top + bot, 0.18, 'white', bevel=0.02)
    gb.sphere(0.34, 0.34, 0.1, iris, t=(0, 0, 0.12), nu=14, nv=8)
    gb.sphere(0.15, 0.15, 0.08, 'black', t=(0, 0, 0.2), nu=10, nv=6)
    gb.hint = dict(az=0, el=4, fov=19)


def g_eye_gold(gb):
    g_eye(gb)
    for i in range(9):
        a = math.radians(20 + 17.5 * i)
        gb.cone(0.07, 0.3, 'glow_gold', t=(math.cos(a) * 0.78, math.sin(a) * 0.86, 0.0), rot=(0, 0, math.degrees(a) - 90), n=6)
    gb.hint = dict(az=0, el=4, fov=19)
    gb.extra.append(add_glow('holyeye', '#ffd04a', 1.0, 0.8, z=-0.3, alpha_peak=0.35))


def g_axe_speed(gb):
    p_axe(gb, M((0.15, 0.0, 0), (0, 0, -35), 0.9), head='steel', handle='wood_dark')
    for i, y in enumerate((0.55, 0.0, -0.55)):
        gb.box((0.8 - 0.1 * i, 0.07, 0.07), 'white', t=(-0.85 - 0.08 * i, y, -0.1), bevel=0.01)
    gb.hint = dict(az=0, el=4, fov=19)


def g_heart(gb):
    pts = []
    for i in range(40):
        t = 2 * math.pi * i / 40
        x = 16 * math.sin(t) ** 3
        y = 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)
        pts.append((x / 17.0, y / 17.0 + 0.05))
    gb.poly(pts, 0.34, 'red', bevel=0.07, smooth=60)
    gb.mb.add(prim_box(0.6, 0.18, 0.1), 'white', M((0, 0.1, 0.2)), bevel=0.02)
    gb.mb.add(prim_box(0.18, 0.6, 0.1), 'white', M((0, 0.1, 0.2)), bevel=0.02)
    gb.hint = dict(az=8, el=6, fov=19)


def g_rage(gb):
    p_axe(gb, M((-0.2, 0.0, 0), (0, 0, -25), 0.85), head='steel_dark', handle='wood_dark')
    for i, (x, y, s) in enumerate([(0.55, -0.7, 0.95), (0.15, -0.65, 1.2), (0.95, -0.55, 0.75)]):
        p_flame(gb, M((x, y, 0.25), (0, 0, (i - 1) * -10), 0.8 * s), outer='fire_r', inner='fire_o', lean=(i - 1) * 0.1)
    gb.hint = dict(az=0, el=4, fov=19)


# ---------------------------------------------------------------------------
# Glifos de HABILIDADE (magias)
# ---------------------------------------------------------------------------
def g_fireball(gb):
    gb.sphere(0.62, 0.62, 0.62, 'fire_o', t=(0.4, -0.1, 0), nu=18, nv=11)
    gb.sphere(0.4, 0.4, 0.4, 'fire_y', t=(0.46, -0.04, 0.22), nu=14, nv=9)
    for i, (x, y, s, lean) in enumerate([(-0.15, 0.1, 1.0, 0.0), (-0.45, -0.25, 0.85, 0.1), (-0.5, 0.45, 0.75, -0.1), (-0.8, 0.05, 0.7, 0.1)]):
        p_flame(gb, M((x, y, -0.05), (0, 0, 90 + (i - 1.5) * 12), 0.95 * s), lean=lean)
    gb.hint = dict(az=0, el=4, fov=19)
    gb.extra.append(add_glow('fireball', '#ff7312', 0.85, 0.9, z=-0.6, center=(0.2, 0.0), alpha_peak=0.35))


def g_slow(gb):
    gb.cyl(0.62, 0.62, 0.14, 'gold', t=(0, 1.05, 0), n=6, base=False, bevel=0.02, smooth=0)
    gb.cyl(0.62, 0.62, 0.14, 'gold', t=(0, -1.05, 0), n=6, base=False, bevel=0.02, smooth=0)
    for dx in (-0.5, 0.5):
        gb.cyl(0.05, 0.05, 2.0, 'gold_dark', t=(dx, -1.0, 0), n=8)
    gb.mb.add(prim_cone(0.5, 0.9, 12, base=True), 'ice', M((0, 1.0, 0), (180, 0, 0)), smooth=40)
    gb.mb.add(prim_cone(0.5, 0.85, 12, base=True), 'glow_blue', M((0, -0.98, 0), (0, 0, 0)), smooth=40)
    gb.mb.add(prim_cone(0.08, 0.5, 8, base=True), 'glow_blue', M((0, 0.0, 0), (180, 0, 0)), smooth=40)
    gb.hint = dict(az=14, el=8, fov=19)
    gb.extra.append(add_glow('slow', '#35b4ff', 1.0, 0.8, z=-0.4, alpha_peak=0.3))


def g_flameshield(gb):
    p_shield_round(gb, M((0, 0, 0.1), (0, 0, 0), 0.7), face='steel', rim='gold', spikes='gold', mark=None, n_spikes=0)
    for i in range(10):
        a = 2 * math.pi * i / 10 + 0.1
        p_flame(gb, M((math.cos(a) * 0.74, math.sin(a) * 0.74, 0.0), (0, 0, math.degrees(a) - 90), 0.58), lean=0.15)
    gb.hint = dict(az=0, el=4, fov=19)
    gb.extra.append(add_glow('flameshield', '#ff7312', 1.05, 0.8, z=-0.4, alpha_peak=0.3))


def g_polymorph(gb):
    gb.sphere(0.78, 0.6, 0.6, 'wool', t=(0, 0.05, 0), nu=12, nv=7, smooth=0)
    rnd = random.Random(3)
    for k in range(8):
        a = rnd.uniform(0, 6.28)
        gb.sphere(0.28, 0.28, 0.28, 'wool', t=(math.cos(a) * 0.5, 0.05 + math.sin(a) * 0.34, rnd.uniform(-0.2, 0.3)), nu=8, nv=5, smooth=0)
    gb.sphere(0.3, 0.34, 0.3, 'ash_dark', t=(0.82, 0.12, 0.05), nu=10, nv=6)
    for dz in (-0.2, 0.2):
        gb.sphere(0.16, 0.08, 0.1, 'ash_dark', t=(0.8, 0.45, dz), r=(0, 0, 25), nu=8, nv=5)
    for dx in (-0.4, 0.45):
        for dz in (-0.22, 0.22):
            gb.cyl(0.07, 0.06, 0.62, 'ash_dark', t=(dx, -0.95, dz), n=8)
    gb.sphere(0.04, 0.04, 0.04, 'white', t=(1.05, 0.2, 0.2))
    for (x, y, s) in [(-0.85, 0.85, 0.22), (0.1, 1.1, 0.16), (0.95, 0.85, 0.2)]:
        p_star(gb, 'glow_purple', M((x, y, 0.35)), spikes=4, r_out=s, r_in=s * 0.3, thick=0.06)
    gb.hint = dict(az=18, el=8, fov=20)


def g_blizzard(gb):
    for i in range(3):
        gb.box((0.12, 2.0, 0.1), 'glow_ice', t=(0, 0, 0), r=(0, 0, 60 * i), bevel=0.02)
    for i in range(6):
        a = math.radians(90 + 60 * i)
        dirv = Vector((math.cos(a), math.sin(a), 0))
        perp = Vector((-math.sin(a), math.cos(a), 0))
        for (rad, ln) in ((0.52, 0.4), (0.82, 0.26)):
            c = dirv * rad
            for sgn in (1, -1):
                tip = c + (dirv * 0.5 + perp * sgn * 0.85).normalized() * ln
                gb.tube([tuple(c), tuple(tip)], [0.045, 0.035], 'glow_ice', n=5, smooth=0)
    gb.sphere(0.2, 0.2, 0.2, 'glow_blue', t=(0, 0, 0.04), nu=6, nv=4, smooth=0)
    gb.hint = dict(az=0, el=4, fov=19)
    gb.extra.append(add_glow('blizzard', '#35b4ff', 1.0, 0.8, z=-0.4, alpha_peak=0.3))


def g_death_touch(gb):
    p_skull(gb, M((0, 0.05, 0), (0, 0, 0), 1.0), glow='glow_green')
    gb.hint = dict(az=14, el=6, fov=19)
    gb.extra.append(add_glow('death', '#3df06a', 1.0, 1.0, z=-0.4, center=(0, 0.05), alpha_peak=0.4))


def g_haste(gb):
    for off in (-0.55, 0.15):
        pts = [(-0.55 + off, 0.78), (0.1 + off, 0.0), (-0.55 + off, -0.78), (-0.2 + off, -0.78), (0.45 + off, 0.0), (-0.2 + off, 0.78)]
        gb.poly(pts, 0.2, 'glow_green', t=(0.25, 0, 0), bevel=0.03)
    for (y, ln) in ((0.65, 0.9), (0.0, 1.2), (-0.65, 0.9)):
        gb.box((ln, 0.07, 0.07), 'white', t=(-0.5 - ln / 2, y, -0.1), bevel=0.01)
    gb.hint = dict(az=0, el=4, fov=19)
    gb.extra.append(add_glow('haste', '#3df06a', 0.85, 0.8, z=-0.4, center=(0.05, 0.0), alpha_peak=0.3))


def g_armor_unholy(gb):
    p_shield_round(gb, M((0, 0, 0), (0, 0, 0), 1.0), face='cloth_dark', rim='iron', spikes='steel_dark', mark='glow_green', n_spikes=8)
    gb.hint = dict(az=10, el=6, fov=19)
    gb.extra.append(add_glow('unholy', '#3df06a', 1.0, 0.8, z=-0.4, alpha_peak=0.3))


def g_ash_cloud(gb):
    rnd = random.Random(11)
    for (x, y, s, m) in ((-0.6, -0.1, 0.55, 'ash'), (0.0, 0.2, 0.75, 'ash'), (0.6, -0.1, 0.55, 'ash'), (-0.15, -0.4, 0.5, 'ash'),
                         (0.4, 0.45, 0.45, 'ash'), (-0.5, 0.35, 0.4, 'ash'), (0.85, 0.2, 0.35, 'ash_dark')):
        gb.sphere(s, s * 0.85, s, m, t=(x, y, rnd.uniform(-0.1, 0.1)), nu=10, nv=6, smooth=0)
    for (x, y) in ((-0.8, -0.95), (0.0, -1.05), (0.7, -0.85), (-0.35, -0.8), (0.35, -1.1)):
        gb.sphere(0.07, 0.07, 0.07, 'fire_o', t=(x, y, 0.1), nu=6, nv=4, smooth=0)
    gb.hint = dict(az=8, el=10, fov=20)


def g_whirlwind(gb):
    for i in range(7):
        t = i / 6.0
        r = 0.95 - 0.7 * t
        y = 0.95 - 1.9 * t
        x = 0.18 * math.sin(t * 5.0)
        gb.torus(r, 0.1, 'glow_ice' if i % 2 == 0 else 'steel', t=(x, y, 0), rot=(72, 0, 0), nM=22, nm=6, smooth=0)
    for (x, y, s) in ((-0.95, 0.9, 0.12), (0.95, 0.4, 0.1), (-0.6, -0.5, 0.09)):
        gb.box((s * 2, s, s), 'wood', t=(x, y, 0.1), r=(0, 0, 30), bevel=0.01)
    gb.hint = dict(az=0, el=4, fov=19)


def g_heal(gb):
    p_cross(gb, 'gold_dark', None, arm=0.62, length=1.9, thick=0.26, bevel=0.06)
    p_cross(gb, 'glow_green', M((0, 0, 0.05)), arm=0.46, length=1.78, thick=0.3, bevel=0.05)
    for (x, y, s) in ((-0.95, 0.9, 0.22), (0.95, 0.8, 0.16), (0.9, -0.9, 0.2)):
        p_star(gb, 'glow_gold', M((x, y, 0.2)), spikes=4, r_out=s, r_in=s * 0.3, thick=0.06)
    gb.hint = dict(az=10, el=6, fov=19)


def g_exorcism(gb):
    gb.cyl(0.55, 0.55, 0.16, 'glow_gold', t=(0, 0, 0.0), r=(90, 0, 0), n=20, base=False)
    for i in range(12):
        a = 2 * math.pi * i / 12
        long = i % 2 == 0
        gb.cone(0.12 if long else 0.09, 0.55 if long else 0.38, 'glow_gold', t=(math.cos(a) * 0.62, math.sin(a) * 0.62, 0.0), rot=(0, 0, math.degrees(a) - 90), n=6)
    p_cross(gb, 'white', M((0, 0, 0.12)), arm=0.14, length=0.7, thick=0.08, bevel=0.015)
    gb.hint = dict(az=0, el=4, fov=19)
    gb.extra.append(add_glow('exorcism', '#ffd04a', 1.05, 0.9, z=-0.4, alpha_peak=0.3))


def g_bloodlust(gb):
    # gota de sangue: ponta em cima + círculo embaixo (tangentes a ±61° da vertical)
    cy, r = -0.3, 0.64
    pts = [(0.0, 1.05)]
    for k in range(0, 31):
        a = math.radians(29 - (360 - 58) * k / 30)
        pts.append((math.cos(a) * r, cy + math.sin(a) * r))
    gb.poly(pts, 0.5, 'red', bevel=0.09, smooth=60)
    gb.sphere(0.1, 0.2, 0.07, 'white', t=(-0.28, -0.35, 0.3), r=(0, 0, 20), nu=8, nv=5)
    gb.hint = dict(az=10, el=6, fov=19)
    gb.extra.append(add_glow('blood', '#ff3a3a', 1.0, 0.7, z=-0.4, alpha_peak=0.3))


def g_war_cry(gb):
    path = bezier((-0.9, -0.55, 0), (0.0, -0.95, 0), (0.55, 0.15, 0), 10) + bezier((0.55, 0.15, 0), (0.7, 0.45, 0), (0.95, 0.85, 0), 6)[1:]
    radii = [0.06 + 0.2 * (i / (len(path) - 1)) ** 2 + 0.03 * (i / (len(path) - 1)) for i in range(len(path))]
    gb.tube(path, radii, 'bone', n=12, smooth=70)
    for k in (3, 8, 13):
        if k < len(path):
            gb.tube([path[k], tuple(Vector(path[k]) + (Vector(path[min(k + 1, len(path) - 1)]) - Vector(path[k])) * 0.6)], [radii[k] + 0.03, radii[k] + 0.03], 'gold', n=12, smooth=60)
    gb.cyl(0.11, 0.13, 0.22, 'gold_dark', t=(-0.95, -0.52, 0), r=(0, 0, 100), n=10)
    for rr in (0.55, 0.85):
        pts = [(1.0 + math.cos(math.radians(a)) * rr * 0.5, 0.75 + math.sin(math.radians(a)) * rr, 0.0) for a in range(-50, 51, 10)]
        gb.tube(pts, [0.04] * len(pts), 'glow_gold', n=5, smooth=0)
    gb.hint = dict(az=10, el=8, fov=20)


def g_arcane_bolt(gb):
    gb.sphere(0.5, 0.5, 0.5, 'glow_purple', t=(0.3, -0.1, 0), nu=14, nv=9)
    gb.sphere(0.26, 0.26, 0.26, 'glow_ice', t=(0.34, -0.06, 0.22), nu=10, nv=6)
    zig = [(-0.15, 0.2, 0), (-0.5, 0.05, 0), (-0.42, -0.2, 0), (-0.85, -0.35, 0), (-0.75, -0.6, 0), (-1.1, -0.75, 0)]
    gb.tube(zig, [0.07, 0.06, 0.06, 0.05, 0.05, 0.03], 'glow_purple', n=5, smooth=0)
    zig2 = [(0.55, 0.28, 0), (0.85, 0.55, 0), (0.78, 0.82, 0), (1.05, 1.0, 0)]
    gb.tube(zig2, [0.06, 0.05, 0.05, 0.03], 'glow_blue', n=5, smooth=0)
    gb.hint = dict(az=0, el=4, fov=19)
    gb.extra.append(add_glow('bolt', '#a45cff', 1.05, 1.0, z=-0.4, center=(0.1, 0.0), alpha_peak=0.4))


def g_mend(gb):
    gb.torus(0.9, 0.12, 'gold', rot=(0, 0, 0), nM=32, nm=8)
    p_cross(gb, 'glow_green', M((0, 0, 0.02)), arm=0.34, length=1.15, thick=0.2, bevel=0.04)
    for (x, y, s) in ((-0.95, 0.85, 0.18), (0.98, -0.75, 0.16)):
        p_star(gb, 'glow_gold', M((x, y, 0.2)), spikes=4, r_out=s, r_in=s * 0.3, thick=0.06)
    gb.hint = dict(az=0, el=6, fov=19)
    gb.extra.append(add_glow('mend', '#3df06a', 1.0, 0.7, z=-0.4, alpha_peak=0.3))


def g_runes(gb):
    gb.box((1.5, 1.8, 0.4), 'stone', t=(0, 0, 0), bevel=0.07, taper=(0.92, 0.9))
    gb.box((1.2, 1.5, 0.1), 'stone_dark', t=(0, 0, 0.2), bevel=0.04)
    gb.box((0.13, 1.1, 0.1), 'fire_o', t=(0, 0, 0.27), bevel=0.02)
    gb.box((0.13, 0.7, 0.1), 'fire_o', t=(-0.22, 0.28, 0.27), r=(0, 0, -45), bevel=0.02)
    gb.box((0.13, 0.7, 0.1), 'fire_o', t=(0.22, 0.28, 0.27), r=(0, 0, 45), bevel=0.02)
    gb.box((0.5, 0.12, 0.1), 'fire_o', t=(0, -0.2, 0.27), bevel=0.02)
    gb.hint = dict(az=12, el=8, fov=19)
    gb.extra.append(add_glow('runes', '#ff7312', 1.05, 0.9, z=-0.3, alpha_peak=0.3))


# ---------------------------------------------------------------------------
# Glifos de ATRIBUTO (linha de atributos do card; exibidos pequenos, ~18 px: silhuetas grossas e simples)
# ---------------------------------------------------------------------------
def g_boot(gb):
    # bota de couro de perfil (ponta para +x) com punho dourado e linhas de velocidade
    gb.box((0.75, 1.35, 0.62), 'leather', t=(-0.2, 0.42, 0), bevel=0.08)
    gb.box((1.3, 0.62, 0.62), 'leather', t=(0.12, -0.52, 0), bevel=0.09)
    gb.sphere(0.36, 0.32, 0.31, 'leather', t=(0.66, -0.55, 0), nu=10, nv=6)
    gb.box((1.55, 0.17, 0.66), 'wood_dark', t=(0.1, -0.88, 0), bevel=0.04)
    gb.box((0.4, 0.2, 0.66), 'wood_dark', t=(-0.5, -0.88, 0), bevel=0.03)
    gb.box((0.84, 0.2, 0.68), 'gold', t=(-0.2, 1.1, 0), bevel=0.04)
    for (y, ln) in ((0.5, 0.65), (-0.1, 0.85), (-0.7, 0.55)):
        gb.box((ln, 0.07, 0.07), 'white', t=(-0.95 - ln / 2, y, -0.12), bevel=0.01)
    gb.hint = dict(az=0, el=4, fov=19)


def g_sack(gb):
    # saco de carga: corpo bojudo, pescoço amarrado com corda, moeda de ouro na boca
    gb.sphere(0.85, 0.82, 0.72, 'leather', t=(0, -0.2, 0), nu=12, nv=8, smooth=70)
    gb.cyl(0.4, 0.3, 0.55, 'leather', t=(0, 0.6, 0), n=10, smooth=60)
    gb.torus(0.36, 0.07, 'wood_light', t=(0, 0.74, 0), rot=(90, 0, 0), nM=20, nm=6)
    gb.mb.add(ext([(-0.45, 0.0), (-0.2, 0.45), (0.0, 0.2), (0.25, 0.5), (0.5, 0.0)], 0.12), 'leather', M((0, 1.0, 0)), bevel=0.02)
    gb.cyl(0.26, 0.26, 0.09, 'gold', t=(0.28, 0.0, 0.7), r=(90, 0, 0), n=14, base=False, smooth=60)
    gb.cyl(0.17, 0.17, 0.1, 'gold_dark', t=(0.28, 0.0, 0.72), r=(90, 0, 0), n=14, base=False, smooth=60)
    gb.hint = dict(az=10, el=8, fov=19)


def g_mana(gb):
    # gota de mana (azul brilhante)
    cy, r = -0.3, 0.64
    pts = [(0.0, 1.05)]
    for k in range(0, 31):
        a = math.radians(29 - (360 - 58) * k / 30)
        pts.append((math.cos(a) * r, cy + math.sin(a) * r))
    gb.poly(pts, 0.5, 'glow_blue', bevel=0.09, smooth=60)
    gb.sphere(0.1, 0.22, 0.07, 'white', t=(-0.28, -0.3, 0.3), r=(0, 0, 20), nu=8, nv=5)
    p_star(gb, 'glow_ice', M((0.55, 0.6, 0.3)), spikes=4, r_out=0.22, r_in=0.07, thick=0.06)
    gb.hint = dict(az=10, el=6, fov=19)


def g_wing(gb):
    # asa de penas (unidade aérea): três camadas de penas
    wing = [(-0.95, -0.55), (-0.7, 0.1), (-0.3, 0.6), (0.3, 0.92), (1.0, 1.0), (0.78, 0.55), (0.98, 0.5), (0.62, 0.12),
            (0.82, -0.02), (0.45, -0.28), (0.6, -0.52), (0.05, -0.5), (-0.4, -0.78)]
    gb.poly(wing, 0.16, 'ash', bevel=0.03, t=(0, 0, -0.04))
    inner = [(-0.75, -0.45), (-0.45, 0.12), (-0.05, 0.5), (0.45, 0.72), (0.82, 0.8), (0.55, 0.42), (0.72, 0.36), (0.38, 0.06), (0.52, -0.1), (0.2, -0.32), (-0.2, -0.45)]
    gb.poly(inner, 0.18, 'white', bevel=0.025, t=(0, 0, 0.02))
    gb.hint = dict(az=0, el=4, fov=19)


def g_anchor(gb):
    gb.torus(0.22, 0.07, 'steel_dark', t=(0, 1.0, 0), nM=20, nm=6)
    gb.box((0.15, 1.9, 0.15), 'steel_dark', t=(0, 0.1, 0), bevel=0.03)
    gb.box((0.95, 0.13, 0.13), 'steel_dark', t=(0, 0.62, 0), bevel=0.03)
    arc = bezier((-0.85, -0.2, 0), (0.0, -1.2, 0), (0.85, -0.2, 0), 10)
    gb.tube(arc, [0.085] * 11, 'steel_dark', n=8)
    gb.mb.add(prim_cone(0.2, 0.42, 6), 'steel', M((-0.9, -0.12, 0), (0, 0, 28)))
    gb.mb.add(prim_cone(0.2, 0.42, 6), 'steel', M((0.9, -0.12, 0), (0, 0, -28)))
    gb.hint = dict(az=0, el=4, fov=19)


def g_blast(gb):
    # explosão em área: estrela de 9 pontas, laranja com miolo amarelo e centro branco
    p_star(gb, 'fire_r', None, spikes=9, r_out=1.0, r_in=0.52, thick=0.14)
    p_star(gb, 'fire_o', M((0, 0, 0.05)), spikes=9, r_out=0.82, r_in=0.42, thick=0.14)
    p_star(gb, 'fire_y', M((0, 0, 0.1)), spikes=9, r_out=0.56, r_in=0.3, thick=0.14)
    gb.sphere(0.24, 0.24, 0.1, 'white', t=(0, 0, 0.2), nu=10, nv=6)
    gb.hint = dict(az=0, el=4, fov=19)


def g_bubbles(gb):
    for (x, y, rr) in ((-0.35, -0.4, 0.48), (0.4, 0.1, 0.36), (-0.12, 0.62, 0.24)):
        gb.sphere(rr, rr, rr * 0.6, 'glow_ice', t=(x, y, 0), nu=14, nv=9)
        gb.sphere(rr * 0.25, rr * 0.35, rr * 0.2, 'white', t=(x - rr * 0.4, y + rr * 0.35, rr * 0.5), r=(0, 0, 30), nu=8, nv=5)
    gb.hint = dict(az=0, el=4, fov=19)


def g_people(gb):
    # dois bustos (população): o da frente azul, o de trás vermelho
    for (hx, bx, body, s) in ((0.5, 0.5, 'cloth_red', 0.85), (-0.25, -0.25, 'cloth_blue', 1.0)):
        gb.sphere(0.3 * s, 0.33 * s, 0.3 * s, 'skin', t=(hx, 0.55 * s + (0.0 if s == 1.0 else -0.1), 0.05), nu=12, nv=8)
        gb.box((0.9 * s, 0.85 * s, 0.4 * s), body, t=(bx, -0.18 * s + (0.0 if s == 1.0 else -0.1), 0), taper=(0.78, 0.8), bevel=0.07)
    gb.hint = dict(az=0, el=6, fov=19)


def g_hammer(gb):
    p_hammer(gb, M((0, 0, 0), (0, 0, -38), 1.1))
    gb.hint = dict(az=0, el=4, fov=19)


# ---------------------------------------------------------------------------
# Selos (badges)
# ---------------------------------------------------------------------------
def b_rank(gb):
    for y in (0.0, -0.42):
        gb.poly([(-0.7, y + 0.35), (0.0, y + 0.0), (0.7, y + 0.35), (0.7, y + 0.0), (0.0, y - 0.35), (-0.7, y + 0.0)], 0.2, 'gold', bevel=0.03)
    gb.hint = dict(az=0, el=0, fov=18)


def b_hero(gb):
    p_star(gb, 'gold_dark', None, spikes=5, r_out=0.82, r_in=0.36, thick=0.2)
    p_star(gb, 'gold', M((0, 0, 0.04)), spikes=5, r_out=0.7, r_in=0.3, thick=0.2)
    gb.hint = dict(az=0, el=0, fov=18)


def b_up(gb):
    gb.poly([(-0.65, -0.14), (0.0, 0.66), (0.65, -0.14), (0.31, -0.14), (0.31, -0.8), (-0.31, -0.8), (-0.31, -0.14)], 0.2, 'green', bevel=0.05, t=(0, 0, -0.03))
    gb.poly([(-0.55, -0.1), (0.0, 0.55), (0.55, -0.1), (0.25, -0.1), (0.25, -0.7), (-0.25, -0.7), (-0.25, -0.1)], 0.22, 'glow_green', bevel=0.04)
    gb.hint = dict(az=0, el=0, fov=18)


# ---------------------------------------------------------------------------
# Tabela
# ---------------------------------------------------------------------------
GLYPHS = {
    # comandos
    'stop': g_stop, 'move': g_move, 'attack': g_attack, 'attack_move': g_attack_move, 'patrol': g_patrol, 'hold': g_hold,
    'gather': g_gather, 'build': g_build, 'repair': g_repair, 'cancel': g_cancel, 'rally': g_rally, 'train': g_train,
    'research': g_research, 'unload': g_unload, 'load': g_load,
    # pesquisa
    'sword': g_sword, 'axe': g_axe, 'shield_human': g_shield_human, 'shield_orc': g_shield_orc, 'bomb': g_bomb,
    'boulder_fire': g_boulder_fire, 'cannon': g_cannon, 'hull': g_hull, 'arrows': g_arrows, 'axes_throw': g_axes_throw,
    'axe_log': g_axe_log, 'longbow': g_longbow, 'target': g_target, 'eye_gold': g_eye_gold, 'axe_speed': g_axe_speed,
    'heart': g_heart, 'rage': g_rage,
    # atributos
    'boot': g_boot, 'sack': g_sack, 'mana': g_mana, 'wing': g_wing, 'anchor': g_anchor, 'blast': g_blast, 'bubbles': g_bubbles,
    'people': g_people, 'hammer': g_hammer,
    # magias
    'fireball': g_fireball, 'slow': g_slow, 'flameshield': g_flameshield, 'polymorph': g_polymorph, 'blizzard': g_blizzard,
    'death_touch': g_death_touch, 'haste': g_haste, 'unholy_armor': g_armor_unholy, 'ash_cloud': g_ash_cloud,
    'whirlwind': g_whirlwind, 'heal': g_heal, 'exorcism': g_exorcism, 'bloodlust': g_bloodlust, 'war_cry': g_war_cry,
    'arcane_bolt': g_arcane_bolt, 'mend': g_mend, 'runes': g_runes,
    # selos
    'badge_rank': b_rank, 'badge_hero': b_hero, 'badge_up': b_up,
}

DEFAULT_HINT = dict(az=8, el=6, fov=19)


def build_glyph(name):
    """Constrói o glifo `name` na cena. Devolve (lista de objetos, dica de câmera)."""
    gb = GB(name)
    GLYPHS[name](gb)
    obj = gb.build()
    hint = dict(DEFAULT_HINT)
    hint.update(gb.hint)
    return [obj] + gb.extra, hint
