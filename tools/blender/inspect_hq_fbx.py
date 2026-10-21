"""inspect_hq_fbx.py — M2-33: importa os FBX do Tripo (Centro humano níveis 1-3), imprime bbox/tris/materiais e renderiza
frente/lado/3-4/topo em tools/ui-captures/novos-modelos/. Uso (via safe-run):
  blender -b --factory-startup --python tools/blender/inspect_hq_fbx.py"""
import os
import math
import bpy
from mathutils import Vector

REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
OUT = os.path.join(REPO, 'tools', 'ui-captures', 'novos-modelos')
D = '/home/rafael/Downloads'
FONTES = {
    'hq1': D + '/Centro1/tripo_convert_9627a66a-3732-4a93-ad72-20103b5f6cea.fbx',
    'hq2': D + '/centro1-2/tripo_convert_6aa35e7d-d787-44ec-8238-2e39adeee0ba.fbx',
    'hq3': D + '/centro1-3/tripo_convert_82042048-7b13-4749-9f5f-79e92d9f7587.fbx',
}
os.makedirs(OUT, exist_ok=True)
for nome, fbx in FONTES.items():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=fbx)
    ms = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    pts = []
    tris = 0
    for o in ms:
        pts += [o.matrix_world @ Vector(c) for c in o.bound_box]
        o.data.calc_loop_triangles()
        tris += len(o.data.loop_triangles)
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    print('INFO', nome, 'malhas', len(ms), 'tris', tris, 'bbox', tuple(round(v, 3) for v in lo), tuple(round(v, 3) for v in hi),
          'objs', [(o.name, o.type, tuple(round(s, 3) for s in o.scale), tuple(round(r, 3) for r in o.rotation_euler)) for o in bpy.context.scene.objects])
    for o in ms:
        for m in o.data.materials:
            for n in m.node_tree.nodes:
                if n.type == 'TEX_IMAGE' and n.image:
                    print('INFO img', n.image.name, n.image.size[:])
    c = (lo + hi) / 2
    size = max(hi.x - lo.x, hi.y - lo.y, hi.z - lo.z)
    sc = bpy.context.scene
    for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items:
        if 'EEVEE' in e.identifier:
            sc.render.engine = e.identifier
    sc.render.resolution_x = sc.render.resolution_y = 700
    w = bpy.data.worlds.new('w')
    sc.world = w
    w.use_nodes = True
    bg = next(n for n in w.node_tree.nodes if n.type == 'BACKGROUND')
    bg.inputs[0].default_value = (0.75, 0.8, 0.85, 1)
    bg.inputs[1].default_value = 1.2
    sun = bpy.data.lights.new('s', 'SUN')
    sun.energy = 3
    so = bpy.data.objects.new('s', sun)
    sc.collection.objects.link(so)
    so.rotation_euler = (math.radians(50), 0, math.radians(30))
    cam = bpy.data.cameras.new('c')
    cam.type = 'ORTHO'
    cam.ortho_scale = size * 1.3
    co = bpy.data.objects.new('c', cam)
    sc.collection.objects.link(co)
    sc.camera = co
    for tag, d in (('frente', (0, -1, 0.15)), ('lado', (1, 0, 0.15)), ('34', (1, -1, 0.5)), ('topo', (0, -0.01, 1))):
        v = Vector(d).normalized()
        co.location = c + v * size * 3
        co.rotation_euler = (-v).to_track_quat('-Z', 'Y').to_euler()
        sc.render.filepath = os.path.join(OUT, f'{nome}_{tag}.png')
        bpy.ops.render.render(write_still=True)
