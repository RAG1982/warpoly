"""
render_npc_portraits.py (M3-14) — retratos 128x128 dos NPCs com fala nas campanhas, em Eevee, a partir dos MESMOS .glb de
public/models/ (busto com cor de equipe e adereço próprios por NPC). Mesmo enquadramento/fundo dos retratos de unidade
(render_portraits.py). Heróis (Brann, Dorian, Oren, Drogath, Vozgul, Skarn) já têm retrato próprio e não são renderizados aqui.

Saída: public/ui/portraits/npc_<id>.webp (RGB, sem alfa) e a seção `npcPortraits` do manifesto.

    tools/safe-run.sh --timeout 300 -- /home/rafael/Downloads/blender-5.2.1-linux-x64/blender -b --factory-startup \
        --python tools/blender/render_npc_portraits.py [-- --only sevelin,lyra] [--quality 88]
"""
import bpy
import math
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C  # noqa: E402
import ui_common as U  # noqa: E402
import ui_specs as S  # noqa: E402
import render_portraits as RP  # noqa: E402

# id -> glb, cor de equipe (roupa/armadura), adereço, facção (fundo) e azimute da câmera
NPCS = {
    'sevelin': dict(glb='villager_v2', team='#d9b13b', acc='crown', az=18, crop=0.5),
    'orsolo': dict(glb='villager_v2', team='#8a6a3c', acc=None, az=24),
    'lyra': dict(glb='archer_v2', team='#4fa3d9', acc=None, az=16),
    'mervane': dict(glb='villager_v2', team='#6b2f7a', acc='tophat', az=20),
    'tomas_rocha': dict(glb='knight_v2', team='#3d5f9c', acc=None, az=22),
    'elara': dict(glb='archer_v2', team='#3f8f4a', acc=None, az=26),
    'brumar': dict(glb='villager_v2', team='#2f8f8f', acc='captain', az=22),
    'isolda': dict(glb='sapper', team='#1c2f5e', acc='captain', az=18),
    'aurora': dict(glb='templar', team='#e8d7e8', acc=None, az=20),
    'brakka': dict(glb='ogre', team='#6b3a2a', acc='tusks', faction='orc', crop=0.4, az=22),
    'grok': dict(glb='grunt', team='#5c6b2e', acc=None, faction='orc', az=24),
    'orvanna': dict(glb='necromancer', team='#1f6f7a', acc=None, faction='orc', az=18),
}


def _head_box(nodes):
    """(cx, cy, topo z, largura) da cabeça em coordenadas do mundo (Blender, z para cima)."""
    from mathutils import Vector
    head = nodes.get('Head')
    pts = []
    if head is not None:
        stack = [head]
        while stack:
            o = stack.pop()
            stack.extend(o.children)
            if o.type == 'MESH':
                pts += [o.matrix_world @ Vector(c) for c in o.bound_box]
    if not pts:
        return None
    xs, ys, zs = [p.x for p in pts], [p.y for p in pts], [p.z for p in pts]
    return ((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2, max(zs), max(max(xs) - min(xs), max(ys) - min(ys)))


def _mat(name, hexcol):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    n = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    n.inputs['Base Color'].default_value = C.hex_lin(hexcol)
    n.inputs['Roughness'].default_value = 0.45
    return m


def add_accessory(kind, nodes):
    """Adereço simples (primitivas) sobre a cabeça. Devolve a lista de objetos criados."""
    box = _head_box(nodes)
    if not kind or box is None:
        return []
    cx, cy, top, w = box
    made = []

    def prim(op, loc, mat, **kw):
        op(location=loc, **kw)
        o = bpy.context.active_object
        o.data.materials.append(mat)
        made.append(o)
        return o

    gold, dark, white = _mat('npc_gold', '#e0b53a'), _mat('npc_dark', '#2a2430'), _mat('npc_white', '#f2ecd8')
    r = w * 0.52
    if kind == 'crown':
        prim(bpy.ops.mesh.primitive_cylinder_add, (cx, cy, top + r * 0.12), gold, vertices=8, radius=r * 0.6, depth=r * 0.3)
        for i in range(5):
            a = i * 2 * math.pi / 5
            prim(bpy.ops.mesh.primitive_cone_add, (cx + math.cos(a) * r * 0.5, cy + math.sin(a) * r * 0.5, top + r * 0.4), gold,
                 vertices=6, radius1=r * 0.12, depth=r * 0.4)
    elif kind == 'circlet':
        prim(bpy.ops.mesh.primitive_torus_add, (cx, cy, top - r * 0.35), gold, major_radius=r * 0.8, minor_radius=r * 0.07)
    elif kind == 'tophat':
        prim(bpy.ops.mesh.primitive_cylinder_add, (cx, cy, top + r * 0.02), dark, vertices=16, radius=r * 0.95, depth=r * 0.08)
        prim(bpy.ops.mesh.primitive_cylinder_add, (cx, cy, top + r * 0.45), dark, vertices=16, radius=r * 0.55, depth=r * 0.9)
        prim(bpy.ops.mesh.primitive_cylinder_add, (cx, cy, top + r * 0.12), gold, vertices=16, radius=r * 0.58, depth=r * 0.14)
    elif kind == 'cap':
        prim(bpy.ops.mesh.primitive_uv_sphere_add, (cx, cy, top - r * 0.08), dark, radius=r * 0.62, scale=(1, 1, 0.5))
    elif kind == 'captain':
        prim(bpy.ops.mesh.primitive_cylinder_add, (cx, cy, top + r * 0.05), dark, vertices=3, radius=r * 0.9, depth=r * 0.2)
        prim(bpy.ops.mesh.primitive_cylinder_add, (cx, cy, top + r * 0.2), white, vertices=3, radius=r * 0.35, depth=r * 0.1)
    elif kind == 'plume':
        prim(bpy.ops.mesh.primitive_cone_add, (cx, cy - r * 0.2, top + r * 0.7), white, vertices=8, radius1=r * 0.25, depth=r * 1.3)
    elif kind == 'hood':
        prim(bpy.ops.mesh.primitive_uv_sphere_add, (cx, cy - r * 0.15, top - r * 0.25), dark, radius=r * 1.1, scale=(1, 1, 0.7))
    elif kind == 'tusks':
        for sx in (-1, 1):
            prim(bpy.ops.mesh.primitive_cone_add, (cx + sx * r * 0.45, cy + r * 0.85, top - r * 1.15), white, vertices=8,
                 radius1=r * 0.14, depth=r * 0.6)
    return made


def render_one(pid, spec, cam, out_dir, quality, poses):
    t0 = time.time()
    root, objs = U.import_glb(spec['glb'])
    nodes = U.node_map(objs)
    if spec['glb'] in poses:
        U.apply_pose(nodes, poses[spec['glb']]['poses'].get('idle'))
    U.polish_materials()
    if spec.get('team'):
        U.set_team(spec['team'])
    bpy.context.view_layer.update()
    extra = add_accessory(spec.get('acc'), nodes)
    allobjs = objs + extra
    pts = U.world_points(allobjs)
    zmax, zmin = pts[:, 2].max(), pts[:, 2].min()
    crop = spec.get('crop', 0.5)
    fit = pts[pts[:, 2] >= zmax - crop * (zmax - zmin) - 1e-6]
    U.fit_camera(cam, fit, U.dir_from_angles(spec.get('az', 22), 6), fov=20.0, margin=0.05)
    bgc = S.PORTRAIT_BG[spec.get('faction', 'human')]
    arr = U.render_rgba('npc_' + pid)
    rgb = RP.shade_portrait(U.premultiply(arr), RP.make_bg(U.SS, bgc[0], bgc[1], False))
    path = os.path.join(out_dir, 'portraits', f'npc_{pid}.webp')
    n = U.save_webp(U.box_down(rgb, RP.K), path, quality, alpha=False)
    U.purge(allobjs)
    U.log(f'npc_{pid:14s} {n:5d} B ({time.time() - t0:.1f}s)')
    return n


def main():
    out_dir = U.script_flag('--out', None)
    if out_dir:
        U.set_out(out_dir)
    out_dir = U.OUT_UI
    only = U.script_flag('--only', None)
    only = set(only.split(',')) if isinstance(only, str) else None
    quality = int(U.script_flag('--quality', 88))
    poses = U.load_poses()
    U.setup_scene()
    U.make_world()
    U.make_lights(key=3.4, fill=1.0, rim=2.6)
    cam = U.make_camera(20)
    failed = []
    for pid, spec in NPCS.items():
        if only and pid not in only:
            continue
        try:
            render_one(pid, spec, cam, out_dir, quality, poses)
        except Exception as exc:
            import traceback
            traceback.print_exc()
            failed.append((pid, str(exc)))
            U.purge([o for o in bpy.data.objects if o.type in ('MESH', 'EMPTY')])
    pdir = os.path.join(out_dir, 'portraits')
    ids = sorted(f[len('npc_'):-len('.webp')] for f in os.listdir(pdir) if f.startswith('npc_') and f.endswith('.webp'))
    b = U.update_manifest('npcPortraits', {'size': RP.SIZE, 'dir': 'portraits', 'prefix': 'npc_', 'ext': 'webp', 'ids': ids})
    U.log(f'{len(ids)} retratos de NPC; falhas: {failed or "nenhuma"}; bytes: {b}')
    if failed:
        sys.exit(1)


if __name__ == '__main__':
    main()
