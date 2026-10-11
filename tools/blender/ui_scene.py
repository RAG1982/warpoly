"""
ui_scene.py (F7-09) — peças da cena das artes 2D (menu principal e tela de loading): céu de pôr do sol, terreno low-poly
com estrada, montanhas, vegetação e exércitos montados com os MESMOS .glb do jogo (nenhum modelo novo).

Coordenadas: as do BLENDER (x direita, y para o horizonte, z para cima). Um .glb importado fica voltado para -y (a frente
do modelo é +z no jogo = -y no Blender); `instance(..., yaw)` gira em torno de z (yaw +90° => olha para +x).
"""
import math
import os
import random
import bpy
import numpy as np
from mathutils import Vector, Matrix

import common as C
import ui_common as U
from common import hex_lin


# ---------------------------------------------------------------------------
# Ruído de valor (numpy) e terreno
# ---------------------------------------------------------------------------
def _hash(ix, iz, seed):
    n = (ix.astype(np.int64) * 374761393 + iz.astype(np.int64) * 668265263 + int(seed) * 144665) & 0xFFFFFFFF
    n = ((n ^ (n >> 13)) * 1274126177) & 0xFFFFFFFF
    n = n ^ (n >> 16)
    return (n & 0xFFFF).astype(np.float64) / 65535.0


def vnoise(x, z, seed=0):
    xi, zi = np.floor(x), np.floor(z)
    xf, zf = x - xi, z - zi
    sx, sz = xf * xf * (3 - 2 * xf), zf * zf * (3 - 2 * zf)
    a, b = _hash(xi, zi, seed), _hash(xi + 1, zi, seed)
    c, d = _hash(xi, zi + 1, seed), _hash(xi + 1, zi + 1, seed)
    return (a * (1 - sx) + b * sx) * (1 - sz) + (c * (1 - sx) + d * sx) * sz


def fbm(x, z, seed=0, octaves=4, lac=2.0, gain=0.5):
    amp, freq, tot, norm = 1.0, 1.0, 0.0, 0.0
    for o in range(octaves):
        tot += amp * (vnoise(x * freq, z * freq, seed + o * 17) - 0.5)
        norm += amp
        amp *= gain
        freq *= lac
    return tot / norm * 2.0          # aprox. [-1, 1]


def smooth(a, b, x):
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def catmull(points, per_seg=24):
    """Curva Catmull-Rom (x, y) por uma lista de pontos."""
    pts = [np.array(p, dtype=np.float64) for p in points]
    pts = [pts[0] * 2 - pts[1]] + pts + [pts[-1] * 2 - pts[-2]]
    out = []
    for i in range(1, len(pts) - 2):
        p0, p1, p2, p3 = pts[i - 1], pts[i], pts[i + 1], pts[i + 2]
        for k in range(per_seg):
            t = k / per_seg
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    out.append(pts[-2])
    return np.array(out)


def dist_to_polyline(px, py, poly):
    """Distância de cada ponto (px, py) até a poligonal `poly` (N x 2)."""
    best = np.full(px.shape, 1e9)
    for i in range(len(poly) - 1):
        a, b = poly[i], poly[i + 1]
        ab = b - a
        L2 = float(ab @ ab) or 1e-9
        t = np.clip(((px - a[0]) * ab[0] + (py - a[1]) * ab[1]) / L2, 0.0, 1.0)
        cx, cy = a[0] + t * ab[0], a[1] + t * ab[1]
        best = np.minimum(best, np.hypot(px - cx, py - cy))
    return best


class Terrain:
    """Terreno por função (altura/cor) amostrável e malha low-poly com cor por face."""

    def __init__(self, seed, road, bumps, flat_road=0.85, amp=3.2):
        self.seed = seed
        self.road = road                      # poligonal (N x 2) no plano xy
        self.bumps = bumps                    # [(cx, cy, raio, altura)]
        self.flat_road = flat_road
        self.amp = amp

    def road_dist(self, x, y):
        return dist_to_polyline(np.asarray(x, dtype=np.float64), np.asarray(y, dtype=np.float64), self.road)

    def height(self, x, y):
        x = np.asarray(x, dtype=np.float64)
        y = np.asarray(y, dtype=np.float64)
        h = self.amp * fbm(x / 55.0, y / 55.0, self.seed, 4) + 0.35 * fbm(x / 7.0, y / 7.0, self.seed + 5, 2)
        for (cx, cy, r, ht) in self.bumps:
            d = np.hypot(x - cx, y - cy) / r
            h = h + ht * np.exp(-d * d * 1.6)
        rd = self.road_dist(x, y)
        flat = smooth(14.0, 3.0, rd) * self.flat_road
        base = 0.0
        return base + h * (1 - flat) + 0.0 * flat

    def color(self, x, y, h, slope):
        """Cor sRGB (N x 3) por ponto: grama (claro/escuro), terra na estrada, rocha nas encostas."""
        n1 = fbm(x / 9.0, y / 9.0, self.seed + 2, 3)
        n2 = fbm(x / 33.0, y / 33.0, self.seed + 9, 2)
        grass_l, grass_d = np.array(hex_srgb('#7fb04a')), np.array(hex_srgb('#3f7c36'))
        t = np.clip(0.5 + 0.55 * n1 + 0.25 * n2, 0, 1)[:, None]
        col = grass_d * (1 - t) + grass_l * t
        # manchas de terra e flores secas
        dirt = np.array(hex_srgb('#a98a58'))
        patch = np.clip((fbm(x / 14.0, y / 14.0, self.seed + 31, 2) - 0.25) * 3.0, 0, 1)[:, None] * 0.55
        col = col * (1 - patch) + dirt * patch
        rd = self.road_dist(x, y)
        road_m = smooth(5.2, 3.0, rd)[:, None]
        road_edge = smooth(7.0, 5.0, rd)[:, None]
        road_c = np.array(hex_srgb('#c9a766')) * (0.85 + 0.15 * fbm(x / 2.5, y / 2.5, self.seed + 4, 2))[:, None]
        col = col * (1 - road_edge * 0.35) + np.array(hex_srgb('#8b6b3d')) * (road_edge * 0.35)
        col = col * (1 - road_m) + road_c * road_m
        rock = np.array(hex_srgb('#8c8579'))
        rm = smooth(0.55, 0.9, slope)[:, None]
        col = col * (1 - rm) + rock * rm
        return np.clip(col, 0, 1)


def hex_srgb(h):
    h = h.lstrip('#')
    return [int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)]


def _srgb_to_lin(c):
    c = np.asarray(c, dtype=np.float64)
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def build_grid_mesh(name, x0, x1, y0, y1, cell, height_fn, color_fn, flat=True):
    """Malha em grade (quadrados -> 2 triângulos) com altura/cor por face (flat shading = estilo low-poly)."""
    nx = int(round((x1 - x0) / cell))
    ny = int(round((y1 - y0) / cell))
    xs = np.linspace(x0, x1, nx + 1)
    ys = np.linspace(y0, y1, ny + 1)
    gx, gy = np.meshgrid(xs, ys)                       # (ny+1, nx+1)
    # pequeno desalinhamento dos vértices para tirar o aspecto de grade (determinístico)
    rj = np.random.RandomState(5)
    jx = (rj.rand(*gx.shape) - 0.5) * cell * 0.55
    jy = (rj.rand(*gy.shape) - 0.5) * cell * 0.55
    gx = gx + jx
    gy = gy + jy
    gz = height_fn(gx.ravel(), gy.ravel()).reshape(gx.shape)
    verts = np.stack([gx, gy, gz], axis=-1).reshape(-1, 3)
    idx = np.arange((nx + 1) * (ny + 1)).reshape(ny + 1, nx + 1)
    a, b, c, d = idx[:-1, :-1].ravel(), idx[:-1, 1:].ravel(), idx[1:, 1:].ravel(), idx[1:, :-1].ravel()
    tris = np.concatenate([np.stack([a, b, c], 1), np.stack([a, c, d], 1)], axis=0)
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts.tolist(), [], tris.tolist())
    me.update()
    if flat:
        for p in me.polygons:
            p.use_smooth = False
    # cor por face = cor no centro da face (com a inclinação local)
    tv = verts[tris]                                    # (F, 3, 3)
    ctr = tv.mean(axis=1)
    n = np.cross(tv[:, 1] - tv[:, 0], tv[:, 2] - tv[:, 0])
    nn = np.linalg.norm(n, axis=1) + 1e-9
    slope = 1.0 - np.abs(n[:, 2]) / nn
    cols = color_fn(ctr[:, 0], ctr[:, 1], ctr[:, 2], slope)
    ca = me.color_attributes.new('Col', 'FLOAT_COLOR', 'FACE')
    rgba = np.concatenate([_srgb_to_lin(cols), np.ones((len(cols), 1))], axis=1).astype(np.float32)
    ca.data.foreach_set('color', rgba.ravel())
    mat = bpy.data.materials.new(name + '_mat')
    try:
        mat.use_nodes = True
    except Exception:
        pass
    nt = mat.node_tree
    bsdf = nt.nodes['Principled BSDF']
    attr = nt.nodes.new('ShaderNodeAttribute')
    attr.attribute_name = 'Col'
    nt.links.new(attr.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.92
    try:
        bsdf.inputs['Specular IOR Level'].default_value = 0.1
    except KeyError:
        pass
    me.materials.append(mat)
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    return obj


# ---------------------------------------------------------------------------
# Céu, sol e atmosfera
# ---------------------------------------------------------------------------
def make_sky(sun_dir, zenith='#161a3a', mid='#5a3f72', low='#e27d4a', horizon='#ffd08a', sun_color='#fff1c8', sun_size=0.9993,
             strength=1.0, cloud_amount=0.55, cloud_tint='#ff9a5a'):
    """Mundo com degradê de crepúsculo, disco de sol e nuvens em faixas (nós de shader, sem textura externa)."""
    world = bpy.data.worlds.new('ArtWorld')
    try:
        world.use_nodes = True
    except Exception:
        pass
    nt = world.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputWorld')
    bg = nt.nodes.new('ShaderNodeBackground')
    bg.inputs['Strength'].default_value = strength
    tc = nt.nodes.new('ShaderNodeTexCoord')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(tc.outputs['Generated'], sep.inputs[0])
    # elevação 0 (horizonte) .. 1 (zênite)
    clampz = nt.nodes.new('ShaderNodeMath')
    clampz.operation = 'MAXIMUM'
    clampz.inputs[1].default_value = 0.0
    nt.links.new(sep.outputs['Z'], clampz.inputs[0])
    powz = nt.nodes.new('ShaderNodeMath')
    powz.operation = 'POWER'
    powz.inputs[1].default_value = 0.55
    nt.links.new(clampz.outputs[0], powz.inputs[0])
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    els = ramp.color_ramp.elements
    els[0].position = 0.0
    els[0].color = hex_lin(horizon)
    els[1].position = 1.0
    els[1].color = hex_lin(zenith)
    e2 = els.new(0.22)
    e2.color = hex_lin(low)
    e3 = els.new(0.55)
    e3.color = hex_lin(mid)
    nt.links.new(powz.outputs[0], ramp.inputs['Fac'])
    # nuvens: ruído alongado na horizontal, limiar duro (faixas) com tinta quente embaixo
    noise = nt.nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 3.2
    noise.inputs['Detail'].default_value = 3.0
    noise.inputs['Roughness'].default_value = 0.55
    mapn = nt.nodes.new('ShaderNodeMapping')
    mapn.inputs['Scale'].default_value = (1.0, 1.0, 3.5)
    nt.links.new(tc.outputs['Generated'], mapn.inputs['Vector'])
    nt.links.new(mapn.outputs['Vector'], noise.inputs['Vector'])
    cr = nt.nodes.new('ShaderNodeValToRGB')
    ce = cr.color_ramp.elements
    ce[0].position = 1.0 - cloud_amount * 0.55
    ce[0].color = (0, 0, 0, 1)
    ce[1].position = 1.0 - cloud_amount * 0.55 + 0.12
    ce[1].color = (1, 1, 1, 1)
    nt.links.new(noise.outputs['Fac'], cr.inputs['Fac'])
    # só entre o horizonte e ~45° de altura
    band = nt.nodes.new('ShaderNodeMapRange')
    band.inputs['From Min'].default_value = 0.03
    band.inputs['From Max'].default_value = 0.18
    band.inputs['To Min'].default_value = 0.0
    band.inputs['To Max'].default_value = 1.0
    nt.links.new(sep.outputs['Z'], band.inputs['Value'])
    band2 = nt.nodes.new('ShaderNodeMapRange')
    band2.inputs['From Min'].default_value = 0.62
    band2.inputs['From Max'].default_value = 0.3
    band2.inputs['To Min'].default_value = 0.0
    band2.inputs['To Max'].default_value = 1.0
    nt.links.new(sep.outputs['Z'], band2.inputs['Value'])
    cmask = nt.nodes.new('ShaderNodeMath')
    cmask.operation = 'MULTIPLY'
    nt.links.new(cr.outputs['Color'], cmask.inputs[0])
    nt.links.new(band.outputs['Result'], cmask.inputs[1])
    cmask2 = nt.nodes.new('ShaderNodeMath')
    cmask2.operation = 'MULTIPLY'
    nt.links.new(cmask.outputs[0], cmask2.inputs[0])
    nt.links.new(band2.outputs['Result'], cmask2.inputs[1])
    mixc = nt.nodes.new('ShaderNodeMix')
    mixc.data_type = 'RGBA'
    nt.links.new(cmask2.outputs[0], mixc.inputs[0])
    nt.links.new(ramp.outputs['Color'], mixc.inputs[6])
    mixc.inputs[7].default_value = hex_lin(cloud_tint)
    # sol: disco + halo (produto escalar com a direção do sol)
    sd = Vector(sun_dir).normalized()
    dot = nt.nodes.new('ShaderNodeVectorMath')
    dot.operation = 'DOT_PRODUCT'
    dot.inputs[1].default_value = (sd.x, sd.y, sd.z)
    # Generated no mundo = direção normalizada
    nt.links.new(tc.outputs['Generated'], dot.inputs[0])
    sramp = nt.nodes.new('ShaderNodeMapRange')
    sramp.inputs['From Min'].default_value = 0.975
    sramp.inputs['From Max'].default_value = 1.0
    sramp.interpolation_type = 'SMOOTHERSTEP' if hasattr(sramp, 'interpolation_type') else 'LINEAR'
    nt.links.new(dot.outputs['Value'], sramp.inputs['Value'])
    halo = nt.nodes.new('ShaderNodeMath')
    halo.operation = 'POWER'
    halo.inputs[1].default_value = 2.2
    nt.links.new(sramp.outputs['Result'], halo.inputs[0])
    disc = nt.nodes.new('ShaderNodeMapRange')
    disc.inputs['From Min'].default_value = sun_size - 0.0003
    disc.inputs['From Max'].default_value = sun_size + 0.0003
    nt.links.new(dot.outputs['Value'], disc.inputs['Value'])
    comb = nt.nodes.new('ShaderNodeMath')
    comb.operation = 'ADD'
    nt.links.new(halo.outputs[0], comb.inputs[0])
    nt.links.new(disc.outputs['Result'], comb.inputs[1])
    suncol = nt.nodes.new('ShaderNodeRGB')
    suncol.outputs[0].default_value = hex_lin(sun_color)
    smul = nt.nodes.new('ShaderNodeMix')
    smul.data_type = 'RGBA'
    smul.blend_type = 'ADD'
    smul.inputs[0].default_value = 1.0
    nt.links.new(mixc.outputs[2], smul.inputs[6])
    scale_sun = nt.nodes.new('ShaderNodeVectorMath')
    scale_sun.operation = 'SCALE'
    nt.links.new(suncol.outputs[0], scale_sun.inputs[0])
    nt.links.new(comb.outputs[0], scale_sun.inputs['Scale'])
    nt.links.new(scale_sun.outputs['Vector'], smul.inputs[7])
    nt.links.new(smul.outputs[2], bg.inputs['Color'])
    nt.links.new(bg.outputs['Background'], out.inputs['Surface'])
    bpy.context.scene.world = world
    return world


def add_world_fog(density=0.004, color='#ffb27a', anisotropy=0.45):
    """Névoa volumétrica global (profundidade atmosférica): Principled Volume na saída Volume do mundo."""
    world = bpy.context.scene.world
    nt = world.node_tree
    out = [n for n in nt.nodes if n.type == 'OUTPUT_WORLD'][0]
    vol = nt.nodes.new('ShaderNodeVolumePrincipled')
    vol.inputs['Density'].default_value = density
    vol.inputs['Color'].default_value = hex_lin(color)
    try:
        vol.inputs['Anisotropy'].default_value = anisotropy
    except KeyError:
        pass
    nt.links.new(vol.outputs['Volume'], out.inputs['Volume'])
    ev = bpy.context.scene.eevee
    for attr, val in (('volumetric_start', 0.1), ('volumetric_end', 500.0), ('volumetric_tile_size', '2'),
                      ('volumetric_samples', 96), ('use_volumetric_shadows', True), ('volumetric_sample_distribution', 0.8)):
        try:
            setattr(ev, attr, val)
        except Exception as exc:
            U.log('aviso volumétrico', attr, exc)


def add_sun(direction_blender, color='#ffb066', energy=5.0, angle=2.0, name='SunArt'):
    sun = bpy.data.lights.new(name, 'SUN')
    sun.energy = energy
    sun.color = hex_lin(color)[:3]
    sun.angle = math.radians(angle)
    try:
        sun.volume_factor = 1.0
    except Exception:
        pass
    obj = bpy.data.objects.new(name, sun)
    bpy.context.scene.collection.objects.link(obj)
    d = Vector(direction_blender).normalized()
    obj.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()
    return obj


# ---------------------------------------------------------------------------
# Instâncias dos .glb
# ---------------------------------------------------------------------------
class Library:
    """Importa cada .glb uma vez e entrega cópias (malhas/materiais compartilhados) posicionadas e posadas."""

    def __init__(self, poses):
        self.poses = poses
        self.templates = {}
        self.counter = 0

    def _template(self, key):
        if key not in self.templates:
            root, objs = U.import_glb(key)
            for o in objs:
                o.hide_render = True
                o.hide_viewport = True
            self.templates[key] = (root, objs)
        return self.templates[key]

    def instance(self, key, loc, yaw_deg=0.0, scale=1.0, pose=None, team=None):
        """Cria uma cópia do modelo `key` em `loc` (x, y, z do Blender). Devolve (raiz, objetos, nodes)."""
        root, objs = self._template(key)
        mapping = {}
        coll = bpy.context.scene.collection
        for o in objs:
            c = o.copy()
            c.hide_render = False
            c.hide_viewport = False
            coll.objects.link(c)
            mapping[o] = c
        for o in objs:
            if o.parent in mapping:
                mapping[o].parent = mapping[o.parent]
        new_root = mapping[root]
        new_objs = [mapping[o] for o in objs]
        new_root.location = Vector(loc)
        new_root.rotation_mode = 'XYZ'
        new_root.rotation_euler = (0.0, 0.0, math.radians(yaw_deg))
        new_root.scale = (scale, scale, scale)
        nodes = U.node_map(new_objs)
        if pose and key in self.poses:
            U.apply_pose(nodes, self.poses[key]['poses'].get(pose))
        self.counter += 1
        return new_root, new_objs, nodes


def ground_z(terrain, x, y):
    return float(terrain.height(np.array([x]), np.array([y]))[0])


def scatter_embers(rng, n, box, size=(0.04, 0.12), color='#ff8a2a', strength=6.0):
    """Faíscas/poeira incandescente no ar (esferas emissivas minúsculas)."""
    me = bpy.data.meshes.new('EmberMesh')
    import bmesh
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=2, radius=1.0)
    bm.to_mesh(me)
    bm.free()
    mat = bpy.data.materials.new('EmberMat')
    try:
        mat.use_nodes = True
    except Exception:
        pass
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    em = nt.nodes.new('ShaderNodeEmission')
    em.inputs['Color'].default_value = hex_lin(color)
    em.inputs['Strength'].default_value = strength
    nt.links.new(em.outputs[0], out.inputs['Surface'])
    me.materials.append(mat)
    objs = []
    (x0, x1), (y0, y1), (z0, z1) = box
    for i in range(n):
        o = bpy.data.objects.new('Ember', me)
        bpy.context.scene.collection.objects.link(o)
        o.location = (rng.uniform(x0, x1), rng.uniform(y0, y1), rng.uniform(z0, z1))
        s = rng.uniform(*size)
        o.scale = (s, s, s)
        o.visible_shadow = False
        objs.append(o)
    return objs


def _prop_material(name, base_hex, rough=0.95):
    """Material Principled cuja cor vem da cor do objeto (Object Info > Color): uma malha, muitas variações de cor."""
    mat = bpy.data.materials.new(name)
    try:
        mat.use_nodes = True
    except Exception:
        pass
    nt = mat.node_tree
    bsdf = nt.nodes['Principled BSDF']
    oi = nt.nodes.new('ShaderNodeObjectInfo')
    nt.links.new(oi.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = rough
    try:
        bsdf.inputs['Specular IOR Level'].default_value = 0.1
    except KeyError:
        pass
    return mat


def scatter_props(terrain, rng, n_rocks, n_tufts, allowed, tuft_hex=('#2f6b2f', '#4f8f3a', '#6aa84a'), rock_hex=('#6e6a63', '#8a857a', '#5b5750')):
    """Pedras e tufos de grama low-poly (instâncias de UMA malha cada, cor por objeto) para dar profundidade ao primeiro plano.
    `allowed(x, y)` decide onde pode (fora da estrada e dos exércitos)."""
    import bmesh
    objs = []
    # pedra: icosfera achatada com vértices deslocados (flat shading)
    rme = bpy.data.meshes.new('RockMesh')
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=1, radius=1.0)
    r2 = random.Random(3)
    for v in bm.verts:
        v.co = (v.co.x * 1.25 * r2.uniform(0.8, 1.15), v.co.y * 1.0 * r2.uniform(0.8, 1.15), v.co.z * 0.7 * r2.uniform(0.75, 1.1))
    bm.to_mesh(rme)
    bm.free()
    for p in rme.polygons:
        p.use_smooth = False
    rme.materials.append(_prop_material('RockMat', '#777777'))
    # tufo: cone fino de 4 faces
    tme = bpy.data.meshes.new('TuftMesh')
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=False, cap_tris=False, segments=4, radius1=0.07, radius2=0.0, depth=0.45)
    bm.to_mesh(tme)
    bm.free()
    for p in tme.polygons:
        p.use_smooth = False
    tme.materials.append(_prop_material('TuftMat', '#4f8f3a'))
    coll = bpy.context.scene.collection

    def rnd_color(palette):
        h = rng.choice(palette)
        base = np.array(hex_srgb(h)) * rng.uniform(0.85, 1.12)
        lin = _srgb_to_lin(np.clip(base, 0, 1))
        return (float(lin[0]), float(lin[1]), float(lin[2]), 1.0)

    placed = 0
    tries = 0
    while placed < n_rocks and tries < n_rocks * 40:
        tries += 1
        x, y = rng.uniform(-140, 140), rng.uniform(-30, 70)
        if not allowed(x, y):
            continue
        z = float(terrain.height(np.array([x]), np.array([y]))[0])
        o = bpy.data.objects.new('Rock', rme)
        coll.objects.link(o)
        sc_ = rng.uniform(0.5, 1.8) * (2.0 if rng.random() < 0.15 else 1.0)
        o.location = (x, y, z + 0.1 * sc_)
        o.scale = (sc_, sc_ * rng.uniform(0.8, 1.2), sc_ * rng.uniform(0.7, 1.1))
        o.rotation_euler = (0.0, 0.0, rng.uniform(0, 6.28))
        o.color = rnd_color(rock_hex)
        objs.append(o)
        placed += 1
    placed = 0
    tries = 0
    while placed < n_tufts and tries < n_tufts * 20:
        tries += 1
        x, y = rng.uniform(-60, 60), rng.uniform(-30, 45)
        if not allowed(x, y):
            continue
        z = float(terrain.height(np.array([x]), np.array([y]))[0])
        o = bpy.data.objects.new('Tuft', tme)
        coll.objects.link(o)
        k = rng.uniform(0.7, 1.5)
        o.location = (x, y, z + 0.14 * k)
        o.scale = (k, k, k * rng.uniform(0.8, 1.4))
        o.rotation_euler = (rng.uniform(-0.25, 0.25), rng.uniform(-0.25, 0.25), rng.uniform(0, 6.28))
        o.color = rnd_color(tuft_hex)
        o.visible_shadow = False
        objs.append(o)
        placed += 1
    return objs


# ---------------------------------------------------------------------------
# Pós-processamento da arte (numpy): bloom falso, curva de contraste, vignette e grão leve
# ---------------------------------------------------------------------------
def box_blur(a, r):
    if r < 1:
        return a
    k = 2 * r + 1
    out = a
    for axis in (0, 1):
        pad = [(0, 0)] * a.ndim
        pad[axis] = (r + 1, r)
        c = np.cumsum(np.pad(out, pad, mode='edge'), axis=axis, dtype=np.float64)
        n = out.shape[axis]
        hi = [slice(None)] * a.ndim
        lo = [slice(None)] * a.ndim
        hi[axis] = slice(k, k + n)
        lo[axis] = slice(0, n)
        out = ((c[tuple(hi)] - c[tuple(lo)]) / k).astype(np.float32)
    return out


def grade(rgb, bloom=0.35, bloom_thr=0.72, bloom_r=14, contrast=1.08, vignette=0.32, warm=(1.02, 1.0, 0.96), seed=1):
    """rgb: HxWx3 float [0,1] (sRGB). Devolve o mesmo, com bloom, contraste, vignette e leve grão."""
    h, w, _ = rgb.shape
    lum = rgb @ np.array([0.299, 0.587, 0.114], dtype=np.float32)
    bright = np.clip((lum - bloom_thr) / (1.0 - bloom_thr), 0.0, 1.0)[..., None] * rgb
    sm = bright[::2, ::2]                                  # meia resolução: borra mais barato
    glow = np.stack([box_blur(box_blur(sm[..., c], bloom_r), bloom_r) for c in range(3)], axis=-1)
    glow = np.repeat(np.repeat(glow, 2, axis=0), 2, axis=1)[:h, :w]
    out = rgb + glow * bloom
    out = (out - 0.5) * contrast + 0.5
    lum2 = np.clip(out @ np.array([0.299, 0.587, 0.114], dtype=np.float32), 0, 1)[..., None]
    out = out + (1.0 - lum2) * 0.045 * np.array([-0.35, -0.05, 0.6], dtype=np.float32)   # sombras levemente azuladas
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    d = np.hypot((xx / (w - 1) - 0.5) * 1.15, (yy / (h - 1) - 0.5) * 1.0)
    vig = 1.0 - vignette * np.clip((d - 0.35) / 0.55, 0, 1) ** 1.6
    out = out * vig[..., None] * np.array(warm, dtype=np.float32)
    rs = np.random.RandomState(seed)
    out = out + (rs.rand(h, w, 1).astype(np.float32) - 0.5) * 0.012
    return np.clip(out, 0.0, 1.0)


# ---------------------------------------------------------------------------
# Perspectiva atmosférica (neblina por profundidade), aplicada em pós com um passe de profundidade
# ---------------------------------------------------------------------------
def render_depth(tag='depth'):
    """Renderiza só a profundidade (distância Z da câmera, em metros) via material de substituição emissivo + EXR float.
    Devolve (profundidade HxW, alfa HxW); o céu tem alfa 0. A profundidade de campo é desligada durante o passe."""
    sc = bpy.context.scene
    vl = sc.view_layers[0]
    mat = bpy.data.materials.new('DepthOverride')
    try:
        mat.use_nodes = True
    except Exception:
        pass
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    em = nt.nodes.new('ShaderNodeEmission')
    cd = nt.nodes.new('ShaderNodeCameraData')
    nt.links.new(cd.outputs['View Z Depth'], em.inputs['Color'])
    em.inputs['Strength'].default_value = 1.0
    nt.links.new(em.outputs[0], out.inputs['Surface'])
    saved = dict(film=sc.render.film_transparent, fmt=sc.render.image_settings.file_format, mode=sc.render.image_settings.color_mode,
                 depth=sc.render.image_settings.color_depth, vt=sc.view_settings.view_transform, taa=sc.eevee.taa_render_samples)
    cam = sc.camera.data
    dof = cam.dof.use_dof
    cam.dof.use_dof = False
    vl.material_override = mat
    sc.render.film_transparent = True
    sc.render.image_settings.file_format = 'OPEN_EXR'
    sc.render.image_settings.color_mode = 'RGBA'
    sc.render.image_settings.color_depth = '32'
    sc.eevee.taa_render_samples = 4
    path = os.path.join(U.TMP_DIR, tag + '.exr')
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    vl.material_override = None
    cam.dof.use_dof = dof
    sc.render.film_transparent = saved['film']
    sc.render.image_settings.file_format = saved['fmt']
    sc.render.image_settings.color_mode = saved['mode']
    sc.render.image_settings.color_depth = saved['depth']
    sc.eevee.taa_render_samples = saved['taa']
    img = bpy.data.images.load(path, check_existing=False)
    img.colorspace_settings.name = 'Non-Color'
    w, h = img.size
    arr = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(arr)
    bpy.data.images.remove(img)
    arr = arr.reshape(h, w, 4)
    return arr[..., 0].copy(), arr[..., 3].copy()


def skyline_colors(rgb, alpha, depth, min_depth=100.0):
    """Cor do céu logo acima da crista DISTANTE de cada coluna (só geometria a mais de `min_depth` m: brasas, aéreos e
    árvores próximas não contam). A neblina usa essa cor para o terreno distante se fundir ao céu, sem borda dura.
    rgb/alpha/depth em HxW(x3) com a origem embaixo."""
    h, w, _ = rgb.shape
    sky = alpha < 0.5
    far = (~sky) & (depth > min_depth)
    out = np.zeros((w, 3), dtype=np.float32)
    ok = np.zeros(w, dtype=bool)
    for x in range(w):
        rows = np.nonzero(far[:, x])[0]
        if len(rows) == 0:
            continue
        top = int(rows.max())
        if top + 10 >= h:
            continue
        win = slice(top + 3, top + 10)
        m = sky[win, x]
        if m.sum() < 5:                       # algo mais próximo tapa o céu nesta coluna
            continue
        out[x] = np.median(rgb[win, x, :][m], axis=0)
        ok[x] = True
    idx = np.arange(w)
    if ok.sum() >= 2:
        for c in range(3):
            out[:, c] = np.interp(idx, idx[ok], out[ok, c])
        k = max(3, w // 60) | 1                # suaviza a cor ao longo de x (tira degraus)
        pad = k // 2
        for c in range(3):
            padded = np.pad(out[:, c], pad, mode='edge')
            out[:, c] = np.convolve(padded, np.ones(k, dtype=np.float32) / k, mode='valid')
    else:
        out[:] = np.array(hex_srgb('#e09a70'), dtype=np.float32)
    return out


def apply_haze(rgb, depth, alpha, density=0.0035, near=12.0, warm='#ffb27a', cool='#9c86c4', amount=0.9, warm_x=0.62, sky_match=0.85):
    """Mistura a cor da neblina com peso 1-exp(-density*(d-near)); a cor vem do céu do horizonte (`sky_match`) e do par
    quente/frio por posição na tela. O céu (alfa 0) fica intacto."""
    h, w, _ = rgb.shape
    xx = (np.mgrid[0:h, 0:w][1].astype(np.float32) / (w - 1))
    f = 1.0 - np.exp(-density * np.maximum(depth - near, 0.0))
    f = np.clip(f * amount, 0.0, 1.0) * (alpha > 0.5)
    t = np.clip(0.5 + (xx - warm_x) * 1.3, 0.0, 1.0)[..., None]
    wc, cc = np.array(hex_srgb(warm), dtype=np.float32), np.array(hex_srgb(cool), dtype=np.float32)
    hazec = cc[None, None, :] * (1 - t) + wc[None, None, :] * t
    sk = skyline_colors(rgb, alpha, depth)[None, :, :]
    hazec = hazec * (1 - sky_match) + sk * sky_match
    return rgb * (1 - f[..., None]) + hazec * f[..., None]
