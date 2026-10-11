"""
ui_common.py — base da arte 2D do WarPoly (F7-09): ícones, retratos e artes de menu/loading renderizados no
Blender (Eevee) a partir dos MESMOS .glb de public/models/ (nenhuma geometria nova de unidade/construção).

Uso: importado por render_icons.py, render_portraits.py e render_art2d.py (rodar SEMPRE via tools/safe-run.sh,
um Blender por vez):

    tools/safe-run.sh --timeout 1200 -- /home/rafael/Downloads/blender-5.2.1-linux-x64/blender -b \
        --factory-startup --python tools/blender/render_icons.py [-- --only unit_knight,building_castle]

Peças:
  * `setup_scene` / `make_lights` / `make_world`  cena Eevee com fundo transparente e luz de 3 pontos (estilo do jogo).
  * `import_glb` / `node_map` / `apply_pose`        importa o .glb e aplica poses extraídas do UnitAnimator real
                                                      (tools/dump-portrait-poses.mjs -> portrait_poses.json).
  * `fit_camera`                                     enquadra um conjunto de pontos (ex.: só o busto) num quadro quadrado.
  * `render_rgba`                                    renderiza para PNG temporário e devolve um array float32 (straight alpha).
  * `outline`, `box_down`, `composite_over`          pós-processamento em numpy (contorno, downscale com média por bloco).
  * `save_webp`, `update_manifest`                   saída em public/ui/ e manifesto JSON.
Convenções de coordenadas: as mesmas de common.py (x direita, y cima, +z frente no JOGO; `C.g()` converte para o Blender).
"""
import bpy
import bmesh  # noqa: F401  (usado pelos módulos que importam este)
import math
import os
import re
import sys
import json
import time
import numpy as np
from mathutils import Vector, Matrix, Quaternion

import common as C
from common import g, hex_lin

OUT_UI = os.path.join(C.REPO, 'public', 'ui')
MANIFEST = os.path.join(OUT_UI, 'manifest.json')
POSES_JSON = os.path.join(C.HERE, 'portrait_poses.json')
TMP_DIR = os.path.join(C.BUILD_DIR, 'ui')


def set_out(path):
    """Troca a pasta de saída (padrão public/ui) — útil para provas sem sujar o repositório."""
    global OUT_UI, MANIFEST
    OUT_UI = os.path.abspath(path)
    MANIFEST = os.path.join(OUT_UI, 'manifest.json')

# Tamanho em pixels do render intermediário (supersampling: 4x o ícone de 128, 2x o de 256).
SS = 512


def log(*a):
    print('[ui]', *a, flush=True)


def script_flag(name, default=None):
    """Valor de `--name valor` nos argumentos depois de '--' (ou `default`)."""
    args = C.script_args()
    if name in args:
        i = args.index(name)
        if i + 1 < len(args) and not args[i + 1].startswith('--'):
            return args[i + 1]
        return True
    return default


# ---------------------------------------------------------------------------
# Cena
# ---------------------------------------------------------------------------
def setup_scene(res=SS, samples=48, transparent=True):
    """Cena vazia + Eevee configurado para ícones (sem composição de cor, sem filme)."""
    C.reset_scene()
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_EEVEE'
    ev = sc.eevee
    ev.taa_render_samples = samples
    ev.use_shadows = True
    try:
        ev.use_raytracing = False
        ev.use_fast_gi = True
        ev.fast_gi_method = 'AMBIENT_OCCLUSION_ONLY'
        ev.fast_gi_distance = 0.6
        ev.shadow_ray_count = 2
        ev.shadow_step_count = 8
    except Exception as exc:  # propriedades mudam entre versões do Blender
        log('aviso eevee:', exc)
    r = sc.render
    r.film_transparent = transparent
    r.resolution_x = r.resolution_y = res
    r.resolution_percentage = 100
    r.filter_size = 1.3
    r.image_settings.file_format = 'PNG'
    r.image_settings.color_mode = 'RGBA'
    r.image_settings.color_depth = '8'
    r.image_settings.compression = 15
    r.dither_intensity = 0.0
    sc.view_settings.view_transform = 'Standard'
    sc.view_settings.look = 'None'
    sc.view_settings.exposure = 0.0
    sc.view_settings.gamma = 1.0
    sc.display_settings.display_device = 'sRGB'
    os.makedirs(TMP_DIR, exist_ok=True)
    return sc


def make_world(top='#c4d8ee', horizon='#efe6d6', ground='#7d6a4f', strength=0.62):
    """Ambiente em degradê vertical (céu frio em cima, chão quente embaixo): luz de preenchimento macia."""
    world = bpy.data.worlds.new('UIWorld')
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
    mr = nt.nodes.new('ShaderNodeMapRange')
    mr.inputs['From Min'].default_value = -1.0
    mr.inputs['From Max'].default_value = 1.0
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    els = ramp.color_ramp.elements
    els[0].position = 0.0
    els[0].color = hex_lin(ground)
    els[1].position = 1.0
    els[1].color = hex_lin(top)
    mid = els.new(0.5)
    mid.color = hex_lin(horizon)
    nt.links.new(tc.outputs['Generated'], sep.inputs[0])
    nt.links.new(sep.outputs['Z'], mr.inputs['Value'])
    nt.links.new(mr.outputs['Result'], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], bg.inputs['Color'])
    nt.links.new(bg.outputs['Background'], out.inputs['Surface'])
    bpy.context.scene.world = world
    return world


def _sun(name, energy, color, direction_game, angle_deg):
    """Sol (luz direcional). `direction_game` = vetor do objeto PARA a luz, em coordenadas do jogo."""
    sun = bpy.data.lights.new(name, 'SUN')
    sun.energy = energy
    sun.color = color
    sun.angle = math.radians(angle_deg)
    obj = bpy.data.objects.new(name, sun)
    bpy.context.scene.collection.objects.link(obj)
    d = g(*direction_game).normalized()
    obj.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()
    return obj


def make_lights(key=3.2, fill=0.9, rim=2.2, key_dir=(0.75, 1.0, 0.85), shadow_soft=5.0):
    """Luz de 3 pontos: chave quente (frente-esquerda-alto), preenchimento frio (direita) e contraluz."""
    lights = {
        'key': _sun('Key', key, (1.0, 0.91, 0.78), key_dir, shadow_soft),
        'fill': _sun('Fill', fill, (0.74, 0.84, 1.0), (-0.9, 0.35, 0.9), 12.0),
        'rim': _sun('Rim', rim, (0.9, 0.94, 1.0), (-0.55, 0.7, -1.0), 4.0),
    }
    lights['fill'].data.use_shadow = False
    return lights


def make_camera(fov=24.0):
    cam_d = bpy.data.cameras.new('UICam')
    cam_d.angle = math.radians(fov)
    cam_d.clip_start = 0.05
    cam_d.clip_end = 2000.0
    cam = bpy.data.objects.new('UICam', cam_d)
    bpy.context.scene.collection.objects.link(cam)
    bpy.context.scene.camera = cam
    return cam


# ---------------------------------------------------------------------------
# Modelos .glb
# ---------------------------------------------------------------------------
_SUFFIX = re.compile(r'\.\d{3}$')


def base_name(name):
    return _SUFFIX.sub('', name)


def import_glb(key):
    """Importa public/models/<key>.glb. Devolve (raiz, [objetos novos])."""
    path = os.path.join(C.OUT_MODELS, key + '.glb')
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    roots = [o for o in new if o.parent is None]
    if not roots:
        raise RuntimeError('glb sem raiz: ' + key)
    return roots[0], new


def node_map(objs):
    """nome do nó glTF -> objeto (sem o sufixo .001 que o Blender acrescenta em nomes repetidos)."""
    m = {}
    for o in objs:
        m.setdefault(base_name(o.name), o)
    return m


def purge(objs=None):
    """Remove objetos importados (e dados órfãos) para o próximo modelo não herdar nomes `.001`."""
    for o in list(objs if objs is not None else []):
        try:
            bpy.data.objects.remove(o, do_unlink=True)
        except Exception:
            pass
    try:
        bpy.data.orphans_purge(do_local_ids=True, do_linked_ids=True, do_recursive=True)
    except Exception:
        pass


def load_poses():
    with open(POSES_JSON, 'r', encoding='utf-8') as f:
        return json.load(f)


def apply_pose(nodes, pose):
    """Aplica uma pose (dict nó -> {p, q, s, v}, espaço do JOGO/three.js) aos objetos importados.

    O importador glTF do Blender converte cada nó como M_blender = C·(T·R·S)·C⁻¹ (verificado: erro 0 contra o
    matrix_basis importado), então a mesma conversão vale para a pose. Escala: o eixo Y do jogo vira Z no Blender."""
    for name, st in (pose or {}).items():
        o = nodes.get(name)
        if o is None:
            continue
        p, q, s = st['p'], st['q'], st['s']
        o.location = g(p[0], p[1], p[2])
        rm = Quaternion((q[3], q[0], q[1], q[2])).to_matrix().to_4x4()
        o.rotation_mode = 'QUATERNION'
        o.rotation_quaternion = C.game_to_blender_matrix(rm).to_quaternion()
        o.scale = Vector((s[0], s[2], s[1]))
        hidden = not st.get('v', 1)
        o.hide_render = hidden
        o.hide_viewport = hidden


def set_team(hexcol):
    """Recolore os materiais `TeamColor` importados (o glTF guarda a cor no `baseColorFactor` = nó Mix, entrada B)."""
    col = hex_lin(hexcol)
    for m in bpy.data.materials:
        if not m.name.startswith('TeamColor') or not m.node_tree:
            continue
        for n in m.node_tree.nodes:
            if n.type == 'MIX':
                n.inputs[7].default_value = col


def polish_materials(rough=0.62, spec=0.35):
    """Ajuste fino dos materiais importados para o render de ícone: um pouco menos fosco, brilho discreto."""
    for m in bpy.data.materials:
        if not m.node_tree:
            continue
        for n in m.node_tree.nodes:
            if n.type == 'BSDF_PRINCIPLED':
                n.inputs['Roughness'].default_value = rough
                try:
                    n.inputs['Specular IOR Level'].default_value = spec
                except KeyError:
                    pass


def visible_meshes(objs):
    return [o for o in objs if o.type == 'MESH' and not o.hide_render]


def world_points(objs):
    """Vértices em coordenadas de mundo (Blender) de todas as malhas visíveis, na pose atual (array Nx3)."""
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    pts = []
    for o in visible_meshes(objs):
        ev = o.evaluated_get(dg)
        me = ev.to_mesh()
        n = len(me.vertices)
        if n:
            co = np.empty(n * 3, dtype=np.float64)
            me.vertices.foreach_get('co', co)
            co = co.reshape(n, 3)
            mw = np.array(ev.matrix_world, dtype=np.float64)
            pts.append(co @ mw[:3, :3].T + mw[:3, 3])
        ev.to_mesh_clear()
    return np.concatenate(pts) if pts else np.zeros((0, 3))


# ---------------------------------------------------------------------------
# Câmera
# ---------------------------------------------------------------------------
def dir_from_angles(az_deg, el_deg):
    """Direção (do alvo PARA a câmera) no espaço do JOGO: az 0 = de frente (+z), positivo = para o lado +x."""
    az, el = math.radians(az_deg), math.radians(el_deg)
    return (math.sin(az) * math.cos(el), math.sin(el), math.cos(az) * math.cos(el))


def fit_camera(cam, pts, dir_game, fov=24.0, margin=0.07, roll_deg=0.0, target_shift=(0.0, 0.0), min_dist=0.0):
    """Posiciona `cam` olhando para `pts` (Nx3, Blender) a partir de `dir_game`, de modo que todos os pontos caibam
    no quadro (com `margin` de cada lado) e o conjunto fique centralizado. Perspectiva: resolve a distância em forma
    fechada (D = max_i(z_i + max(|x_i|,|y_i|)/(t·(1-m)))) e recentra em 3 iterações.
    `target_shift` desloca o centro, em fração da meia-largura do quadro (x direita, y cima)."""
    d = g(*dir_game).normalized()                      # alvo -> câmera (Blender)
    up_w = Vector((0, 0, 1))
    if abs(d.dot(up_w)) > 0.995:
        up_w = Vector((0, 1, 0))
    right = up_w.cross(d).normalized()
    up_c = d.cross(right).normalized()
    if roll_deg:
        rq = Quaternion(d, math.radians(roll_deg))
        right, up_c = rq @ right, rq @ up_c
    t = math.tan(math.radians(fov) / 2.0)
    lo, hi = pts.min(axis=0), pts.max(axis=0)
    target = Vector(((lo + hi) / 2.0).tolist())
    dn = np.array(d)
    rn, un = np.array(right), np.array(up_c)
    dist = 1.0
    for _ in range(4):
        rel = pts - np.array(target)
        x, y, z = rel @ rn, rel @ un, rel @ dn
        dist = float(np.max(z + np.maximum(np.abs(x), np.abs(y)) / (t * (1.0 - margin))))
        dist = max(dist, min_dist, 0.1)
        depth = np.maximum(dist - z, 1e-3)
        nx, ny = x / (depth * t), y / (depth * t)
        cx, cy = (nx.max() + nx.min()) / 2.0, (ny.max() + ny.min()) / 2.0
        mean_depth = float(np.mean(depth))
        target = target + right * (cx * mean_depth * t) + up_c * (cy * mean_depth * t)
    sx, sy = target_shift
    target = target + right * (sx * dist * t) + up_c * (sy * dist * t)
    cam.location = target + d * dist
    rot = Matrix((right, up_c, d)).transposed()          # colunas = eixos x, y, z da câmera
    cam.rotation_mode = 'QUATERNION'
    cam.rotation_quaternion = rot.to_quaternion()
    cam.data.angle = math.radians(fov)
    return {'dist': dist, 'target': tuple(target), 'right': right, 'up': up_c}


# ---------------------------------------------------------------------------
# Render + pós-processamento
# ---------------------------------------------------------------------------
def render_rgba(tag='frame'):
    """Renderiza a cena para um PNG temporário e devolve (H, W, 4) float32 sRGB, alfa straight (origem embaixo)."""
    sc = bpy.context.scene
    path = os.path.join(TMP_DIR, f'{tag}.png')
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    img = bpy.data.images.load(path, check_existing=False)
    w, h = img.size
    arr = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(arr)
    bpy.data.images.remove(img)
    return arr.reshape(h, w, 4)


def premultiply(a):
    out = a.copy()
    out[..., :3] *= out[..., 3:4]
    return out


def unpremultiply(p):
    out = p.copy()
    al = out[..., 3:4]
    out[..., :3] = np.where(al > 1e-5, out[..., :3] / np.maximum(al, 1e-5), 0.0)
    return np.clip(out, 0.0, 1.0)


def box_down(p, k):
    """Média por blocos kxk (p premultiplicado, H x W x 4)."""
    if k == 1:
        return p
    h, w, c = p.shape
    return p.reshape(h // k, k, w // k, k, c).mean(axis=(1, 3))


def dilate_alpha(alpha, r):
    """Dilatação do alfa por um disco de raio r (px), pelo máximo de deslocamentos (alfa suave nas bordas)."""
    out = alpha.copy()
    ri = int(math.ceil(r))
    h, w = alpha.shape
    pad = np.pad(alpha, ri, mode='constant')
    for dy in range(-ri, ri + 1):
        for dx in range(-ri, ri + 1):
            dist = math.hypot(dx, dy)
            if dist > r + 0.5 or (dx == 0 and dy == 0):
                continue
            wgt = 1.0 if dist <= r - 0.5 else max(0.0, r + 0.5 - dist)
            sh = pad[ri + dy:ri + dy + h, ri + dx:ri + dx + w] * wgt
            np.maximum(out, sh, out=out)
    return out


def outline(p, radius, color=(0.05, 0.06, 0.09), opacity=0.92, soft=0.0):
    """Contorno externo: copia do alfa dilatado por `radius` px, na cor `color`, por trás da imagem (p premultiplicado)."""
    if radius <= 0:
        return p
    d = dilate_alpha(p[..., 3], radius) * opacity
    ring = np.zeros_like(p)
    ring[..., :3] = np.array(color, dtype=np.float32) * d[..., None]
    ring[..., 3] = d
    a = p[..., 3:4]
    return p + (1.0 - a) * ring


def composite_over(fg_p, bg_rgb):
    """fg premultiplicado sobre um fundo opaco RGB (H, W, 3) -> RGB."""
    return fg_p[..., :3] + (1.0 - fg_p[..., 3:4]) * bg_rgb


# ---------------------------------------------------------------------------
# Saída
# ---------------------------------------------------------------------------
def save_webp(arr, path, quality=82, alpha=True):
    """Grava `arr` (H, W, 4) float32 sRGB straight em WebP (qualidade 0-100). Devolve o tamanho em bytes."""
    h, w = arr.shape[:2]
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img = bpy.data.images.new('save_tmp', w, h, alpha=True)
    img.alpha_mode = 'STRAIGHT'
    data = np.ascontiguousarray(np.clip(arr, 0.0, 1.0), dtype=np.float32)
    if arr.shape[2] == 3:
        data = np.concatenate([data, np.ones((h, w, 1), dtype=np.float32)], axis=2)
    img.pixels.foreach_set(data.ravel())
    sc = bpy.context.scene
    old = (sc.render.image_settings.file_format, sc.render.image_settings.color_mode, sc.render.image_settings.quality)
    sc.render.image_settings.file_format = 'WEBP'
    sc.render.image_settings.color_mode = 'RGBA' if alpha else 'RGB'
    sc.render.image_settings.quality = int(quality)
    img.save_render(path, scene=sc, quality=int(quality))
    sc.render.image_settings.file_format, sc.render.image_settings.color_mode, sc.render.image_settings.quality = old
    bpy.data.images.remove(img)
    return os.path.getsize(path)


def update_manifest(section, payload):
    """Mescla `payload` na seção `section` de public/ui/manifest.json e recalcula os totais de bytes."""
    data = {}
    if os.path.exists(MANIFEST):
        with open(MANIFEST, 'r', encoding='utf-8') as f:
            data = json.load(f)
    data['version'] = 1
    data[section] = payload
    total = 0
    sizes = {}
    for root, _dirs, files in os.walk(OUT_UI):
        for fn in files:
            if fn.endswith('.webp') or fn.endswith('.png'):
                sub = os.path.relpath(os.path.join(root, fn), OUT_UI).split(os.sep)[0]
                n = os.path.getsize(os.path.join(root, fn))
                sizes[sub] = sizes.get(sub, 0) + n
                total += n
    data['bytes'] = {'total': total, **dict(sorted(sizes.items()))}
    with open(MANIFEST, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=1, sort_keys=False)
        f.write('\n')
    return data['bytes']
