"""
common.py — helpers do pipeline de arte WarPoly (Blender headless -> glTF).

Convenções
----------
* Toda a geometria é escrita em COORDENADAS DO JOGO (three.js): x = direita,
  y = cima, z = frente do modelo. O helper `g()` converte para o Blender
  (Z-up): (x, y, z)_jogo -> (x, -z, y)_blender. O exportador glTF (+Y up)
  desfaz a conversão, então o .glb sai exatamente nas coordenadas do jogo.
* Cada modelo é montado com `MeshBuilder` (bmesh): primitivas (caixa, cilindro,
  loft de anéis, esfera, polígono extrudado) com bisel opcional e sombreamento
  flat/smooth por primitiva (ângulo de suavização por grupo).
* Materiais de "pintura" (`paint`) são redes de nós procedurais estilizadas
  (variação por ruído, padrões de tijolo/telha/tábua, degradê de altura,
  luz de topo pintada, desgaste de borda via nó Bevel e AO). Eles só existem
  para o BAKE: o Cycles assa tudo (cor + AO + bordas) num único atlas.
* Depois do bake, as faces recebem o material final `Atlas` (Principled +
  textura) ou `TeamColor` (mesma textura em tons de cinza × cor do time).
"""
import bpy
import bmesh
import math
import os
import sys
import json
import struct
from mathutils import Vector, Matrix, Euler

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
OUT_MODELS = os.path.join(REPO, 'public', 'models')
RENDERS = os.path.join(HERE, 'renders')
BUILD_DIR = os.path.join(HERE, 'build')  # intermediários (ignorado no git)


def script_args():
    """Argumentos após '--' na linha de comando do Blender."""
    argv = sys.argv
    return argv[argv.index('--') + 1:] if '--' in argv else []


# ---------------------------------------------------------------------------
# Cena
# ---------------------------------------------------------------------------
def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.images, bpy.data.objects):
        for block in list(coll):
            coll.remove(block)


# ---------------------------------------------------------------------------
# Coordenadas
# ---------------------------------------------------------------------------
_C = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))  # jogo -> blender
_C_INV = _C.inverted()


def g(x, y=None, z=None):
    """Vetor do jogo -> vetor do Blender."""
    if y is None:
        x, y, z = x
    return Vector((x, -z, y))


def M(t=(0, 0, 0), r=(0, 0, 0), s=(1, 1, 1), order='XYZ'):
    """Matriz no espaço do jogo. r em graus."""
    if not hasattr(s, '__len__'):
        s = (s, s, s)
    mt = Matrix.Translation(Vector(t))
    mr = Euler([math.radians(a) for a in r], order).to_matrix().to_4x4()
    ms = Matrix.Diagonal(Vector((s[0], s[1], s[2], 1.0)))
    return mt @ mr @ ms


def game_to_blender_matrix(m_game):
    return _C @ m_game @ _C_INV


def hex_lin(h):
    """'#rrggbb' sRGB -> tupla RGBA linear."""
    h = h.lstrip('#')
    out = []
    for i in (0, 2, 4):
        c = int(h[i:i + 2], 16) / 255.0
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return (out[0], out[1], out[2], 1.0)


# ---------------------------------------------------------------------------
# Primitivas (listas de vértices no espaço local do jogo + faces)
# ---------------------------------------------------------------------------
def prim_box(sx, sy, sz, taper=(1.0, 1.0), shift=(0.0, 0.0), base=False):
    """Caixa centrada (ou com a base em y=0 se base=True). taper escala o topo
    em (x, z); shift desloca o topo em (x, z)."""
    hx, hy, hz = sx / 2, sy / 2, sz / 2
    y0, y1 = (0.0, sy) if base else (-hy, hy)
    tx, tz = hx * taper[0], hz * taper[1]
    v = [(-hx, y0, -hz), (hx, y0, -hz), (hx, y0, hz), (-hx, y0, hz),
         (-tx + shift[0], y1, -tz + shift[1]), (tx + shift[0], y1, -tz + shift[1]),
         (tx + shift[0], y1, tz + shift[1]), (-tx + shift[0], y1, tz + shift[1])]
    f = [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]
    return v, f


def prim_rings(rings, cap0=True, cap1=True, closed=True):
    """Loft entre anéis (listas de pontos com o mesmo nº de vértices)."""
    n = len(rings[0])
    verts = [p for ring in rings for p in ring]
    faces = []
    m = n if closed else n - 1
    for r in range(len(rings) - 1):
        a, b = r * n, (r + 1) * n
        for i in range(m):
            j = (i + 1) % n
            faces.append((a + i, a + j, b + j, b + i))
    if cap0:
        faces.append(tuple(reversed(range(0, n))))
    if cap1:
        k = (len(rings) - 1) * n
        faces.append(tuple(range(k, k + n)))
    return verts, faces


def ring_h(cy, rx, rz, n=12, cx=0.0, cz=0.0, phase=0.0, squash=None):
    """Anel horizontal (plano XZ) na altura cy. squash(ang)->fator opcional."""
    pts = []
    for i in range(n):
        a = phase + 2 * math.pi * i / n
        k = squash(a) if squash else 1.0
        pts.append((cx + math.cos(a) * rx * k, cy, cz + math.sin(a) * rz * k))
    return pts


def prim_cyl(r0, r1, h, n=12, base=True, cap0=True, cap1=True, phase=None):
    ph = (math.pi / n) if phase is None else phase
    y0 = 0.0 if base else -h / 2
    return prim_rings([ring_h(y0, r0, r0, n, phase=ph), ring_h(y0 + h, r1, r1, n, phase=ph)], cap0, cap1)


def prim_cone(r, h, n=12, base=True, phase=None):
    ph = (math.pi / n) if phase is None else phase
    y0 = 0.0 if base else -h / 2
    ring = ring_h(y0, r, r, n, phase=ph)
    verts = ring + [(0.0, y0 + h, 0.0)]
    faces = [tuple(reversed(range(n)))]
    for i in range(n):
        faces.append((i, (i + 1) % n, n))
    return verts, faces


def prim_sphere(rx, ry, rz, nu=10, nv=6, y_min=-1.0, y_max=1.0):
    """Esfera (ou calota, via y_min/y_max em [-1,1]) com polos."""
    rings = []
    a0, a1 = math.asin(max(-1, y_min)), math.asin(min(1, y_max))
    closed_bottom = y_min <= -0.999
    closed_top = y_max >= 0.999
    steps = nv
    for k in range(steps + 1):
        a = a0 + (a1 - a0) * k / steps
        if (k == 0 and closed_bottom) or (k == steps and closed_top):
            continue
        y = math.sin(a) * ry
        r = math.cos(a)
        rings.append(ring_h(y, rx * r, rz * r, nu))
    verts = [p for ring in rings for p in ring]
    faces = []
    n = nu
    for r in range(len(rings) - 1):
        a, b = r * n, (r + 1) * n
        for i in range(n):
            j = (i + 1) % n
            faces.append((a + i, a + j, b + j, b + i))
    if closed_bottom:
        verts.append((0, -ry, 0))
        p = len(verts) - 1
        for i in range(n):
            faces.append(((i + 1) % n, i, p))
    else:
        faces.append(tuple(reversed(range(n))))
    last = (len(rings) - 1) * n
    if closed_top:
        verts.append((0, ry, 0))
        p = len(verts) - 1
        for i in range(n):
            faces.append((last + i, last + (i + 1) % n, p))
    else:
        faces.append(tuple(range(last, last + n)))
    return verts, faces


def prim_extrude(poly, depth, axis='x', center=True):
    """Extruda um polígono 2D. axis='x': polígono no plano (z, y) do jogo,
    espessura em x (lâminas de machado). axis='z': polígono em (x, y),
    espessura em z (paredes, portões, bandeiras). axis='y': polígono em (x, z)."""
    n = len(poly)
    d0, d1 = (-depth / 2, depth / 2) if center else (0.0, depth)
    verts = []
    for d in (d0, d1):
        for (a, b) in poly:
            if axis == 'x':
                verts.append((d, b, a))
            elif axis == 'z':
                verts.append((a, b, d))
            else:
                verts.append((a, d, b))
    faces = [tuple(reversed(range(n))), tuple(range(n, 2 * n))]
    for i in range(n):
        j = (i + 1) % n
        faces.append((i, j, n + j, n + i))
    return verts, faces


def limb_rings(path, radii, n=8, up=(0, 0, 1)):
    """Anéis perpendiculares a um caminho 3D (espaço do jogo). radii: lista de
    r ou (rx, rz). Usado para braços, pernas, chifres, presas, cabo."""
    pts = [Vector(p) for p in path]
    upv = Vector(up)
    rings = []
    for i, p in enumerate(pts):
        if i == 0:
            d = pts[1] - pts[0]
        elif i == len(pts) - 1:
            d = pts[-1] - pts[-2]
        else:
            d = pts[i + 1] - pts[i - 1]
        d.normalize()
        side = d.cross(upv)
        if side.length < 1e-4:
            side = d.cross(Vector((1, 0, 0)))
        side.normalize()
        fwd = side.cross(d).normalized()
        r = radii[i]
        rx, rz = (r, r) if not hasattr(r, '__len__') else r
        ring = []
        for k in range(n):
            a = 2 * math.pi * k / n + math.pi / n
            q = p + side * math.cos(a) * rx + fwd * math.sin(a) * rz
            ring.append(tuple(q))
        rings.append(ring)
    return rings


def bezier(p0, p1, p2, steps):
    out = []
    for i in range(steps + 1):
        t = i / steps
        a = [(1 - t) ** 2 * p0[k] + 2 * (1 - t) * t * p1[k] + t * t * p2[k] for k in range(3)]
        out.append(tuple(a))
    return out


# ---------------------------------------------------------------------------
# MeshBuilder
# ---------------------------------------------------------------------------
class MeshBuilder:
    """Acumula primitivas num bmesh, com material por nome, bisel e ângulo de
    suavização por primitiva."""

    def __init__(self, name):
        self.name = name
        self.bm = bmesh.new()
        self.mats = []
        self.part = self.bm.faces.layers.int.new('part')
        self.part_id = 0
        self.smooth_angles = {}

    def mat_index(self, key):
        if key not in self.mats:
            self.mats.append(key)
        return self.mats.index(key)

    def add(self, prim, mat, m=None, bevel=0.0, bevel_segments=1, smooth=0.0,
            mat_fn=None, flip=False, bevel_min_angle=50.0):
        """prim=(verts, faces) no espaço local do jogo; m = matriz do jogo;
        smooth = ângulo (graus) abaixo do qual as arestas ficam suaves
        (0 = flat); mat_fn(center_game, normal_game) -> chave de material
        para pintar faces diferentes da mesma primitiva."""
        verts, faces = prim
        m = m or Matrix.Identity(4)
        bm = self.bm
        bv = [bm.verts.new(g(m @ Vector(p))) for p in verts]
        mi = self.mat_index(mat)
        self.part_id += 1
        pid = self.part_id
        new_faces = []
        for f in faces:
            try:
                face = bm.faces.new([bv[i] for i in f])
            except ValueError:
                continue
            face.material_index = mi
            face[self.part] = pid
            new_faces.append(face)
        bmesh.ops.recalc_face_normals(bm, faces=new_faces)
        if flip:
            bmesh.ops.reverse_faces(bm, faces=new_faces)
        if bevel > 0:
            # só arestas "duras" (evita chanfrar as verticais de cilindros)
            edges = [e for e in {e for f in new_faces for e in f.edges}
                     if len(e.link_faces) != 2 or e.calc_face_angle(0.0) > math.radians(bevel_min_angle)]
            res = bmesh.ops.bevel(bm, geom=edges, offset=bevel, offset_type='OFFSET',
                                  segments=bevel_segments, profile=0.5, affect='EDGES',
                                  clamp_overlap=True)
            for f in res['faces']:
                f[self.part] = pid
                f.material_index = mi
        self.smooth_angles[pid] = smooth
        if mat_fn:
            bm.faces.ensure_lookup_table()
            for f in bm.faces:
                if f[self.part] == pid:
                    c = f.calc_center_median()
                    nrm = f.normal
                    key = mat_fn((c.x, c.z, -c.y), (nrm.x, nrm.z, -nrm.y))
                    if key:
                        f.material_index = self.mat_index(key)
        return pid

    def build(self, mat_lookup, parent=None, location=(0, 0, 0), collection=None):
        """Cria o objeto. location = pivô no espaço do PAI (coordenadas do jogo).
        Os vértices foram dados em coordenadas locais do objeto."""
        bm = self.bm
        # suavização por primitiva
        for f in bm.faces:
            f.smooth = self.smooth_angles.get(f[self.part], 0) > 0
        for e in bm.edges:
            if len(e.link_faces) != 2:
                e.smooth = True
                continue
            f0, f1 = e.link_faces
            p0, p1 = f0[self.part], f1[self.part]
            if p0 != p1 or f0.material_index != f1.material_index:
                e.smooth = False
                continue
            ang = math.degrees(f0.normal.angle(f1.normal, 0.0))
            e.smooth = ang < self.smooth_angles.get(p0, 0)
        if os.environ.get('DEBUG_TRIS'):
            cnt = {}
            for f in bm.faces:
                cnt[f[self.part]] = cnt.get(f[self.part], 0) + len(f.verts) - 2
            top = sorted(cnt.items(), key=lambda kv: -kv[1])[:8]
            print('  DEBUG', self.name, top)
        me = bpy.data.meshes.new(self.name)
        bm.to_mesh(me)
        bm.free()
        obj = bpy.data.objects.new(self.name, me)
        (collection or bpy.context.scene.collection).objects.link(obj)
        for key in self.mats:
            me.materials.append(mat_lookup[key])
        if parent is not None:
            obj.parent = parent
        obj.location = g(*location)
        return obj


def make_empty(name, location=(0, 0, 0), parent=None, rot_game=None):
    e = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(e)
    e.empty_display_size = 0.3
    if parent is not None:
        e.parent = parent
    e.location = g(*location)
    if rot_game:
        set_rot_game(e, rot_game)
    return e


def set_rot_game(obj, r_deg):
    """Rotação Euler (graus, espaço do jogo) -> rotação do objeto no Blender."""
    rm = Euler([math.radians(a) for a in r_deg], 'XYZ').to_matrix().to_4x4()
    rb = game_to_blender_matrix(rm)
    loc = obj.location.copy()
    obj.rotation_mode = 'XYZ'
    obj.rotation_euler = rb.to_euler('XYZ')
    obj.location = loc


# ---------------------------------------------------------------------------
# Nós de shader
# ---------------------------------------------------------------------------
class NB:
    """Mini construtor de nós: aceita sockets, floats ou cores RGBA."""

    def __init__(self, nt):
        self.nt = nt
        self.x = 0

    def node(self, kind, **props):
        n = self.nt.nodes.new(kind)
        n.location = (self.x, 0)
        self.x += 40
        for k, v in props.items():
            setattr(n, k, v)
        return n

    def link(self, src, dst_socket):
        if hasattr(src, 'is_output'):
            self.nt.links.new(src, dst_socket)
        else:
            dst_socket.default_value = src

    def _sock(self, n, ident):
        for s in n.inputs:
            if s.identifier == ident:
                return s
        raise KeyError(ident)

    def _osock(self, n, ident):
        for s in n.outputs:
            if s.identifier == ident:
                return s
        raise KeyError(ident)

    def rgb(self, hexcol):
        n = self.node('ShaderNodeRGB')
        n.outputs[0].default_value = hex_lin(hexcol)
        return n.outputs[0]

    def math(self, op, a, b=0.0, clamp=False):
        n = self.node('ShaderNodeMath', operation=op, use_clamp=clamp)
        self.link(a, n.inputs[0])
        self.link(b, n.inputs[1])
        return n.outputs[0]

    def mix(self, fac, a, b, blend='MIX', clamp=False):
        n = self.node('ShaderNodeMix', data_type='RGBA', blend_type=blend, clamp_result=clamp)
        self.link(fac, self._sock(n, 'Factor_Float'))
        self.link(a, self._sock(n, 'A_Color'))
        self.link(b, self._sock(n, 'B_Color'))
        return self._osock(n, 'Result_Color')

    def scale(self, col, f):
        n = self.node('ShaderNodeVectorMath', operation='SCALE')
        self.link(col, n.inputs[0])
        self.link(f, n.inputs['Scale'])
        return n.outputs['Vector']

    def vmath(self, op, a, b=None):
        n = self.node('ShaderNodeVectorMath', operation=op)
        self.link(a, n.inputs[0])
        if b is not None:
            self.link(b, n.inputs[1])
        return n.outputs['Value'] if op in ('DOT_PRODUCT', 'LENGTH', 'DISTANCE') else n.outputs['Vector']

    def sep(self, v):
        n = self.node('ShaderNodeSeparateXYZ')
        self.link(v, n.inputs[0])
        return n.outputs['X'], n.outputs['Y'], n.outputs['Z']

    def comb(self, x, y, z=0.0):
        n = self.node('ShaderNodeCombineXYZ')
        self.link(x, n.inputs[0])
        self.link(y, n.inputs[1])
        self.link(z, n.inputs[2])
        return n.outputs[0]

    def noise(self, vec, scale=5.0, detail=2.0, rough=0.5, distortion=0.0, out='Fac'):
        n = self.node('ShaderNodeTexNoise')
        self.link(vec, n.inputs['Vector'])
        n.inputs['Scale'].default_value = scale
        n.inputs['Detail'].default_value = detail
        n.inputs['Roughness'].default_value = rough
        n.inputs['Distortion'].default_value = distortion
        return n.outputs[out]

    def voronoi(self, vec, scale=5.0, out='Distance', feature='F1', randomness=1.0):
        n = self.node('ShaderNodeTexVoronoi', feature=feature)
        self.link(vec, n.inputs['Vector'])
        n.inputs['Scale'].default_value = scale
        n.inputs['Randomness'].default_value = randomness
        return n.outputs[out]

    def ramp(self, fac, stops):
        """stops = [(pos, valor_float_ou_hex)]"""
        n = self.node('ShaderNodeValToRGB')
        self.link(fac, n.inputs['Fac'])
        els = n.color_ramp.elements
        while len(els) > len(stops):
            els.remove(els[-1])
        while len(els) < len(stops):
            els.new(0.5)
        for el, (pos, val) in zip(els, stops):
            el.position = pos
            el.color = hex_lin(val) if isinstance(val, str) else (val, val, val, 1.0)
        return n.outputs['Color']

    def bw(self, col):
        n = self.node('ShaderNodeRGBToBW')
        self.link(col, n.inputs[0])
        return n.outputs[0]

    def brick(self, vec, c1, c2, mortar, w, h, mortar_size=0.02, bias=0.0, offset=0.5,
              squash=1.0, smooth=0.1):
        n = self.node('ShaderNodeTexBrick', offset=offset, squash=squash)
        self.link(vec, n.inputs['Vector'])
        self.link(c1, n.inputs['Color1'])
        self.link(c2, n.inputs['Color2'])
        self.link(mortar, n.inputs['Mortar'])
        n.inputs['Scale'].default_value = 1.0
        n.inputs['Mortar Size'].default_value = mortar_size
        n.inputs['Mortar Smooth'].default_value = smooth
        n.inputs['Bias'].default_value = bias
        n.inputs['Brick Width'].default_value = w
        n.inputs['Row Height'].default_value = h
        return n.outputs['Color'], n.outputs['Fac']


def _proj_coords(nb, mapping):
    """Devolve lista [(vec2d, peso)] conforme o mapeamento do padrão."""
    geo = nb.node('ShaderNodeNewGeometry')
    tc = nb.node('ShaderNodeTexCoord')
    if mapping == 'cyl':  # coordenadas cilíndricas no espaço do objeto (torres, cones)
        ox, oy, oz = nb.sep(tc.outputs['Object'])
        ang = nb.math('ARCTAN2', oy, ox)
        u = nb.math('MULTIPLY', ang, 1.0)  # multiplicado pelo raio depois
        return [((u, oz), None)], geo
    # 'box': triplanar em espaço do mundo, com pesos quase binários
    px, py, pz = nb.sep(geo.outputs['Position'])
    ax = nb.vmath('ABSOLUTE', geo.outputs['Normal'])
    nx, ny, nz = nb.sep(ax)
    wx = nb.math('POWER', nx, 12.0)
    wy = nb.math('POWER', ny, 12.0)
    wz = nb.math('POWER', nz, 12.0)
    tot = nb.math('ADD', nb.math('ADD', wx, wy), wz)
    return [((py, pz), nb.math('DIVIDE', wx, tot)),
            ((px, pz), nb.math('DIVIDE', wy, tot)),
            ((px, py), nb.math('DIVIDE', wz, tot))], geo


def paint_material(name, p):
    """Material procedural estilizado usado apenas para o bake (Emission).

    Parâmetros (dict p):
      base, var            cores hex (principal e variação em manchas)
      var_scale, var_amt   escala/força das manchas
      fine                 força do ruído fino
      pattern              None | 'bricks' | 'shingles' | 'planks' | 'grain' | 'paving' | 'streaks'
      mapping              'box' | 'cyl' (padrões)
      cyl_radius           raio para o mapeamento cilíndrico
      pw, ph, mortar       tamanho do tijolo/telha/tábua e cor da junta
      grad                 (z0, z1, força) escurece embaixo (coords do mundo Blender Z)
      top                  força da luz de topo pintada
      edge, edge_amt, edge_r  cor/força/raio do desgaste de borda (nó Bevel)
      ao                   (distância, força)
      gray                 True -> saída em cinza (área de cor de time)
      emit_boost           multiplicador final
    """
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    nb = NB(nt)
    geo = nb.node('ShaderNodeNewGeometry')
    tc = nb.node('ShaderNodeTexCoord')
    coord = geo.outputs['Position'] if p.get('coord', 'world') == 'world' else tc.outputs['Object']

    base = nb.rgb(p['base'])
    var = nb.rgb(p.get('var', p['base']))
    blot = nb.noise(coord, scale=p.get('var_scale', 3.0), detail=3.0, rough=0.6, distortion=0.3)
    blot = nb.ramp(blot, [(0.38, 0.0), (0.62, 1.0)])
    col = nb.mix(nb.math('MULTIPLY', nb.bw(blot), p.get('var_amt', 1.0)), base, var)
    fine = nb.noise(coord, scale=p.get('fine_scale', 22.0), detail=2.0, rough=0.5)
    col = nb.scale(col, nb.math('ADD', 1.0 - p.get('fine', 0.08), nb.math('MULTIPLY', fine, 2 * p.get('fine', 0.08))))

    pat = p.get('pattern')
    if pat:
        projs, _ = _proj_coords(nb, p.get('mapping', 'box'))
        acc = None
        for (uv, w) in projs:
            u, v = uv
            if p.get('mapping') == 'cyl':
                u = nb.math('MULTIPLY', u, p.get('cyl_radius', 1.0))
            if pat == 'planks_v':  # tábuas verticais: troca eixos
                u, v = v, u
            vec = nb.comb(u, v, 0.0)
            c_dark = nb.scale(col, p.get('brick_dark', 0.82))
            c_lite = nb.mix(p.get('brick_tint_amt', 0.35), col, nb.rgb(p.get('brick_tint', p.get('var', p['base']))))
            c_lite = nb.scale(c_lite, p.get('brick_lite', 1.12))
            mortar = nb.rgb(p.get('mortar', '#3a3833'))
            if pat in ('bricks', 'paving'):
                c, fac = nb.brick(vec, c_dark, c_lite, mortar, p.get('pw', 0.6), p.get('ph', 0.3),
                                  mortar_size=p.get('mortar_size', 0.025), bias=0.0, smooth=0.25)
                # sombreamento interno de cada pedra (borda inferior mais escura)
                row = nb.math('FRACT', nb.math('DIVIDE', v, p.get('ph', 0.3)))
                bev = nb.math('ADD', 0.86, nb.math('MULTIPLY', nb.math('SQRT', row), 0.2))
                c = nb.scale(c, bev)
            elif pat == 'shingles':
                c, fac = nb.brick(vec, c_dark, c_lite, mortar, p.get('pw', 0.35), p.get('ph', 0.22),
                                  mortar_size=p.get('mortar_size', 0.012), smooth=0.1)
                row = nb.math('FRACT', nb.math('DIVIDE', v, p.get('ph', 0.22)))
                c = nb.scale(c, nb.math('ADD', 0.62, nb.math('MULTIPLY', row, 0.55)))
            elif pat in ('planks', 'planks_v'):
                c, fac = nb.brick(vec, c_dark, c_lite, mortar, p.get('pw', 2.5), p.get('ph', 0.2),
                                  mortar_size=p.get('mortar_size', 0.012), offset=0.37, smooth=0.05)
                grain = nb.noise(nb.comb(nb.math('MULTIPLY', u, 1.0), nb.math('MULTIPLY', v, 14.0), 0.0),
                                 scale=3.0, detail=4.0, rough=0.6)
                c = nb.scale(c, nb.math('ADD', 0.85, nb.math('MULTIPLY', grain, 0.3)))
            else:
                c = col
            acc = c if w is None else (nb.scale(c, w) if acc is None else nb.vmath('ADD', acc, nb.scale(c, w)))
        col = acc

    if p.get('streaks'):  # veios (madeira/pelo) ao longo do eixo Y do objeto
        ox, oy, oz = nb.sep(tc.outputs['Object'])
        s = p['streaks']
        vec = nb.comb(nb.math('MULTIPLY', ox, s[0]), nb.math('MULTIPLY', oy, s[0]), nb.math('MULTIPLY', oz, s[1]))
        st = nb.noise(vec, scale=1.0, detail=3.0, rough=0.6)
        col = nb.scale(col, nb.math('ADD', 1.0 - s[2], nb.math('MULTIPLY', st, 2 * s[2])))

    # degradê de altura (mundo, eixo Z do Blender)
    if p.get('grad'):
        z0, z1, amt = p['grad']
        _, _, pz = nb.sep(geo.outputs['Position'])
        t = nb.math('DIVIDE', nb.math('SUBTRACT', pz, z0), z1 - z0)
        t = nb.math('MINIMUM', nb.math('MAXIMUM', t, 0.0), 1.0)
        col = nb.scale(col, nb.math('ADD', 1.0 - amt, nb.math('MULTIPLY', t, amt)))

    # luz de topo pintada (hand-painted)
    if p.get('top', 0.0):
        _, _, nz = nb.sep(geo.outputs['Normal'])
        col = nb.scale(col, nb.math('ADD', 1.0, nb.math('MULTIPLY', nz, p['top'])))

    # desgaste de borda (nó Bevel)
    if p.get('edge_amt', 0.0):
        bev = nb.node('ShaderNodeBevel', samples=8)
        bev.inputs['Radius'].default_value = p.get('edge_r', 0.03)
        d = nb.vmath('DOT_PRODUCT', bev.outputs['Normal'], geo.outputs['Normal'])
        e = nb.math('MULTIPLY', nb.math('SUBTRACT', 1.0, d), p.get('edge_gain', 9.0), clamp=True)
        col = nb.mix(nb.math('MULTIPLY', e, p['edge_amt']), col, nb.rgb(p.get('edge', '#ffffff')))

    # oclusão ambiente
    if p.get('ao'):
        dist, amt = p['ao']
        ao = nb.node('ShaderNodeAmbientOcclusion', samples=16, only_local=False)
        ao.inputs['Distance'].default_value = dist
        a = nb.math('POWER', ao.outputs['AO'], p.get('ao_pow', 1.0))
        col = nb.scale(col, nb.math('ADD', 1.0 - amt, nb.math('MULTIPLY', a, amt)))

    if p.get('gray'):
        l = nb.bw(col)
        col = nb.comb(l, l, l)
    if p.get('emit_boost'):
        col = nb.scale(col, p['emit_boost'])

    em = nb.node('ShaderNodeEmission')
    nb.link(col, em.inputs['Color'])
    out = nb.node('ShaderNodeOutputMaterial')
    nt.links.new(em.outputs[0], out.inputs['Surface'])
    mat['paint_key'] = name
    mat['is_team'] = bool(p.get('gray') or p.get('team'))
    return mat


def make_paint_set(palette):
    return {k: paint_material('P_' + k, v) for k, v in palette.items()}


# ---------------------------------------------------------------------------
# UV + bake
# ---------------------------------------------------------------------------
def select_only(objs, active=None):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = active or objs[0]


def uv_atlas(objs, weights=None, margin=0.006, angle=60.0):
    """Smart UV project em todos os objetos juntos, pesos de densidade por
    objeto (ex.: cabeça maior) e empacotamento num único atlas 0..1."""
    meshes = [o for o in objs if o.type == 'MESH']
    select_only(meshes)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(angle), island_margin=0.0,
                             area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    weights = weights or {}
    # smart_project normaliza por objeto; reescala pela área 3D real + peso
    for o in meshes:
        me = o.data
        uvl = me.uv_layers.active.data
        a3 = sum(p.area for p in me.polygons)
        a2 = 0.0
        for p in me.polygons:
            pts = [uvl[i].uv for i in p.loop_indices]
            s = 0.0
            for i in range(len(pts)):
                x0, y0 = pts[i]
                x1, y1 = pts[(i + 1) % len(pts)]
                s += x0 * y1 - x1 * y0
            a2 += abs(s) / 2
        k = math.sqrt(a3 / max(a2, 1e-9)) * weights.get(o.name, 1.0)
        for l in uvl:
            l.uv = l.uv * k
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.select_all(action='SELECT')
    bpy.ops.uv.pack_islands(rotate=True, margin=margin, shape_method='CONCAVE', scale=True)
    bpy.ops.object.mode_set(mode='OBJECT')


def bake_atlas(objs, image_name, size, samples=24, margin=6, ground=True):
    """Assa a emissão dos materiais de pintura num único atlas."""
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = samples
    scene.cycles.use_denoising = False
    img = bpy.data.images.new(image_name, size, size, alpha=False)
    img.colorspace_settings.name = 'sRGB'
    ground_obj = None
    if ground:  # chão só para o AO de contato
        me = bpy.data.meshes.new('BakeGround')
        bm = bmesh.new()
        s = 60
        vs = [bm.verts.new((x, y, 0.0)) for (x, y) in ((-s, -s), (s, -s), (s, s), (-s, s))]
        bm.faces.new(vs)
        bm.to_mesh(me)
        bm.free()
        ground_obj = bpy.data.objects.new('BakeGround', me)
        scene.collection.objects.link(ground_obj)
    mats = set()
    meshes = [o for o in objs if o.type == 'MESH']
    for o in meshes:
        for m in o.data.materials:
            mats.add(m)
    for m in mats:
        nt = m.node_tree
        n = nt.nodes.new('ShaderNodeTexImage')
        n.image = img
        n.name = 'BAKE_TARGET'
        for other in nt.nodes:
            other.select = False
        n.select = True
        nt.nodes.active = n
    select_only(meshes)
    bpy.ops.object.bake(type='EMIT', margin=margin, use_clear=True)
    if ground_obj:
        bpy.data.objects.remove(ground_obj)
    return img


def finalize_materials(objs, img, team_default='#b81d24', roughness=0.78, out_png=None):
    """Troca os materiais de pintura por Atlas / TeamColor (mesma textura)."""
    if out_png:
        os.makedirs(os.path.dirname(out_png), exist_ok=True)
        img.filepath_raw = out_png
        img.file_format = 'PNG'
        img.save()

    def principled(name, team):
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        nt = m.node_tree
        bsdf = nt.nodes.get('Principled BSDF')
        tex = nt.nodes.new('ShaderNodeTexImage')
        tex.image = img
        bsdf.inputs['Roughness'].default_value = roughness
        bsdf.inputs['Metallic'].default_value = 0.0
        if 'Specular IOR Level' in bsdf.inputs:
            bsdf.inputs['Specular IOR Level'].default_value = 0.35
        if team:
            mix = nt.nodes.new('ShaderNodeMix')
            mix.data_type = 'RGBA'
            mix.blend_type = 'MULTIPLY'
            mix.inputs['Factor'].default_value = 1.0
            nt.links.new(tex.outputs['Color'], mix.inputs[6])
            mix.inputs[7].default_value = hex_lin(team_default)
            nt.links.new(mix.outputs[2], bsdf.inputs['Base Color'])
        else:
            nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
        return m

    atlas = principled('Atlas', False)
    team = principled('TeamColor', True)
    for o in objs:
        if o.type != 'MESH':
            continue
        me = o.data
        is_team = [bool(m.get('is_team')) for m in me.materials]
        old_idx = [p.material_index for p in me.polygons]
        me.materials.clear()
        me.materials.append(atlas)
        if any(is_team):
            me.materials.append(team)
        for p, oi in zip(me.polygons, old_idx):
            p.material_index = 1 if is_team[oi] else 0
    return atlas, team


def join_objects(objs, name):
    select_only(objs, active=objs[0])
    bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active
    o.name = name
    o.data.name = name
    return o


# ---------------------------------------------------------------------------
# Export + pós-processamento
# ---------------------------------------------------------------------------
def export_glb(root, path, meshopt=True, image_format='WEBP', quality=90):
    objs = [root] + list(root.children_recursive)
    select_only(objs, active=root)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', use_selection=True, export_yup=True,
        export_apply=True, export_image_format=image_format, export_image_quality=quality,
        export_meshopt_compression_enable=meshopt, export_animations=False,
        export_extras=False, export_vertex_color='NONE', export_texcoords=True,
        export_normals=True, export_tangents=False, export_materials='EXPORT',
        export_cameras=False, export_lights=False)
    return path


def glb_json(path):
    with open(path, 'rb') as f:
        data = f.read()
    ln = struct.unpack_from('<I', data, 12)[0]
    return json.loads(data[20:20 + ln].decode('utf-8'))


def stats(root, glb_path=None):
    objs = [root] + list(root.children_recursive)
    tris = 0
    draws = 0
    for o in objs:
        if o.type != 'MESH':
            continue
        me = o.data
        me.calc_loop_triangles()
        tris += len(me.loop_triangles)
        print('  tris', o.name, len(me.loop_triangles))
        used = {p.material_index for p in me.polygons}
        draws += len(used)
    out = {'meshes': sum(1 for o in objs if o.type == 'MESH'), 'draw_calls': draws, 'tris': tris}
    if glb_path and os.path.exists(glb_path):
        out['glb_kb'] = round(os.path.getsize(glb_path) / 1024, 1)
        j = glb_json(glb_path)
        out['materials'] = [m.get('name') for m in j.get('materials', [])]
        out['images'] = [i.get('mimeType') for i in j.get('images', [])]
        out['extensions'] = j.get('extensionsUsed', [])
    return out


# ---------------------------------------------------------------------------
# Render de pré-visualização (Eevee)
# ---------------------------------------------------------------------------
class RenderRig:
    """Cena de pré-visualização Eevee: chão, céu, sol frente-esquerda-alto e
    câmera que enquadra o modelo. render(sufixo, direção_jogo, fov, zoom)."""

    def __init__(self, root, prefix, res=900, samples=24, ground_hex='#6c8f48', focus_h=None):
        scene = bpy.context.scene
        self.scene, self.prefix, self.root = scene, prefix, root
        scene.render.engine = 'BLENDER_EEVEE'
        try:
            scene.eevee.taa_render_samples = samples
        except Exception:
            pass
        scene.render.resolution_x = res
        scene.render.resolution_y = res
        scene.view_settings.view_transform = 'Standard'
        scene.view_settings.look = 'None'
        world = bpy.data.worlds.new('W')
        world.use_nodes = True
        bg = world.node_tree.nodes['Background']
        bg.inputs['Color'].default_value = hex_lin('#9fb6c9')
        bg.inputs['Strength'].default_value = 0.9
        scene.world = world
        me = bpy.data.meshes.new('RGround')
        bm = bmesh.new()
        s = 200
        vs = [bm.verts.new((x, y, 0.0)) for (x, y) in ((-s, -s), (s, -s), (s, s), (-s, s))]
        bm.faces.new(vs)
        bm.to_mesh(me)
        bm.free()
        gm = bpy.data.materials.new('RGroundMat')
        gm.use_nodes = True
        gm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = hex_lin(ground_hex)
        gm.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 1.0
        me.materials.append(gm)
        gobj = bpy.data.objects.new('RGround', me)
        scene.collection.objects.link(gobj)
        sun = bpy.data.lights.new('Sun', 'SUN')
        sun.energy = 4.0
        sun.angle = math.radians(3)
        sun_o = bpy.data.objects.new('Sun', sun)
        scene.collection.objects.link(sun_o)
        d = g(-0.55, 1.0, 0.45).normalized()
        sun_o.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()
        objs = [root] + list(root.children_recursive)
        pts = []
        for o in objs:
            if o.type == 'MESH':
                pts += [o.matrix_world @ Vector(c) for c in o.bound_box]
        lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
        hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
        self.center = (lo + hi) / 2
        if focus_h is not None:
            self.center.z = focus_h
        self.radius = (hi - lo).length / 2
        self.cam_data = bpy.data.cameras.new('Cam')
        self.cam = bpy.data.objects.new('Cam', self.cam_data)
        scene.collection.objects.link(self.cam)
        scene.camera = self.cam
        os.makedirs(RENDERS, exist_ok=True)

    def render(self, suffix, dir_game, fov=30, zoom=1.0, dist=None):
        self.cam_data.angle = math.radians(fov)
        if dist is None:
            dist = self.radius / math.sin(math.radians(fov) / 2) * 1.02 * zoom
        dvec = g(*dir_game).normalized()
        self.cam.location = self.center + dvec * dist
        self.cam.rotation_euler = (-dvec).to_track_quat('-Z', 'Y').to_euler()
        path = os.path.join(RENDERS, f'{self.prefix}_{suffix}.png')
        self.scene.render.filepath = path
        bpy.ops.render.render(write_still=True)
        return path


def set_team_color(hexcol):
    m = bpy.data.materials.get('TeamColor')
    if not m:
        return
    for n in m.node_tree.nodes:
        if n.type == 'MIX':
            n.inputs[7].default_value = hex_lin(hexcol)
