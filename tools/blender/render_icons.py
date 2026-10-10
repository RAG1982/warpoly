"""
render_icons.py (F7-09) — ícones do card de comando/produção/pesquisa/magia, renderizados em Eevee a partir dos MESMOS
.glb de public/models/ (unidades e construções) e de glifos procedurais (ui_glyphs.py) para o que não existe como modelo.

Saída: public/ui/icons/128/<id>.webp e public/ui/icons/256/<id>.webp (RGBA, fundo transparente, contorno escuro de 1,5–2 px)
e a seção `icons` + `aliases` de public/ui/manifest.json.

    tools/safe-run.sh --timeout 1200 -- /home/rafael/Downloads/blender-5.2.1-linux-x64/blender -b --factory-startup \
        --python tools/blender/render_icons.py [-- --only unit_knight,ability_fireball] [--out /caminho/ui] [--quality 82]

Antes (uma vez, ou quando o UnitAnimator mudar): `node tools/dump-portrait-poses.mjs` (poses idle/ataque do animador real).
"""
import bpy
import math
import os
import sys
import time
import numpy as np
from mathutils import Vector, Matrix

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C  # noqa: E402
import ui_common as U  # noqa: E402
import ui_glyphs as G  # noqa: E402
import ui_specs as S  # noqa: E402

SIZES = (256, 128)                      # tamanho final
OUTLINE_PX = {256: 4, 128: 6}           # raio do contorno, em pixels do render de 512
OUT_COLOR = (0.045, 0.055, 0.085)
FOV_DEFAULT = 22.0


def all_specs():
    """id -> especificação (glb ou glyph) de todos os ícones renderizados."""
    out = {}
    for k, v in S.UNITS.items():
        out['unit_' + k] = v
    for k, v in S.BUILDINGS.items():
        out['building_' + k] = v
    for k, v in S.COMMAND_ICONS.items():
        out['command_' + k] = v
    for k, v in S.COMMANDS_GLB.items():
        out['command_' + k] = v
    for k, v in S.RESEARCH_ICONS.items():
        out['research_' + k] = v
    for k, v in S.ABILITY_ICONS.items():
        out['ability_' + k] = v
    for k, v in S.STAT_ICONS.items():
        out['stat_' + k] = v
    return out


DARK_SWAP = {'steel': 'steel_dark', 'wood': 'wood_dark', 'gold': 'bronze', 'white': 'bone', 'cloth_blue': 'cloth_red', 'wood_light': 'wood'}


def build_subject(spec, poses):
    """Cria o assunto do ícone na cena. Devolve (objetos, dica de câmera, nodes ou None)."""
    if 'glyph' in spec:
        if spec.get('dark'):
            orig = G.glyph_material

            def swapped(key, _o=orig):
                return _o(DARK_SWAP.get(key, key))
            G.glyph_material = swapped
            try:
                objs, hint = G.build_glyph(spec['glyph'])
            finally:
                G.glyph_material = orig
        else:
            objs, hint = G.build_glyph(spec['glyph'])
        return objs, hint, None
    # .glb
    offsets = spec.get('copies') or [(0.0, 0.0)]
    all_objs = []
    nodes = None
    for (ox, oz) in offsets:
        root, objs = U.import_glb(spec['glb'])
        if (ox, oz) != (0.0, 0.0):
            root.location = root.location + C.g(ox, 0.0, oz)
        all_objs += objs
        if nodes is None:
            nodes = U.node_map(objs)
    pose_name = spec.get('pose')
    if pose_name and spec['glb'] in poses:
        U.apply_pose(nodes, poses[spec['glb']]['poses'].get(pose_name))
    U.polish_materials()
    if spec.get('team'):
        U.set_team(spec['team'])
    if spec.get('ghost'):
        gm = G.ghost_material()
        for o in all_objs:
            if o.type == 'MESH':
                o.data.materials.clear()
                o.data.materials.append(gm)
                o.visible_shadow = False
    return all_objs, {}, nodes


def attach_badge(kind, cam_info, cam):
    """Selo (patente/herói/evoluir) no canto inferior direito do quadro, voltado para a câmera."""
    objs, _hint = G.build_glyph('badge_' + kind)
    badge = objs[0]
    right, up = cam_info['right'], cam_info['up']
    d = (cam.location - Vector(cam_info['target'])).normalized()
    t = math.tan(cam.data.angle / 2.0)
    shift = 0.30 * cam_info['dist']                       # um pouco à frente do assunto
    depth = cam_info['dist'] - shift
    half = depth * t
    p = Vector(cam_info['target']) + d * shift + right * (0.60 * half) + up * (-0.62 * half)
    size = 0.30 * half / 0.8                              # o glifo tem ~0,8 de raio
    m = Matrix(((right.x, -d.x, up.x, p.x), (right.y, -d.y, up.y, p.y), (right.z, -d.z, up.z, p.z), (0, 0, 0, 1)))
    badge.matrix_world = m @ Matrix.Diagonal((size, size, size, 1.0))
    return objs


def render_one(icon_id, spec, poses, cam, out_dir, quality):
    t0 = time.time()
    objs, hint, _nodes = build_subject(spec, poses)
    pts = U.world_points([o for o in objs if not o.get('nofit')])
    if len(pts) == 0:
        raise RuntimeError('sem geometria: ' + icon_id)
    az = spec.get('az', hint.get('az', 26))
    el = spec.get('el', hint.get('el', 10))
    fov = spec.get('fov', hint.get('fov', FOV_DEFAULT))
    margin = spec.get('margin', 0.06)
    crop = spec.get('crop', 1.0)
    zmax, zmin = pts[:, 2].max(), pts[:, 2].min()
    fit_pts = pts[pts[:, 2] >= zmax - crop * (zmax - zmin) - 1e-6] if crop < 1.0 else pts
    # brilho atrás do assunto (efeitos mágicos feitos com modelo)
    if spec.get('glow'):
        lo, hi = fit_pts.min(axis=0), fit_pts.max(axis=0)
        ctr = (lo + hi) / 2.0
        rad = 0.5 * float(max(hi[0] - lo[0], hi[2] - lo[2])) * 0.8    # cabe no quadro (o halo não pode ser cortado)
        # coordenadas do JOGO: x, y(=z do Blender), z(= -y do Blender)
        glow = G.add_glow(icon_id, spec['glow'], rad, 0.9, z=-float(ctr[1]) - rad * 0.3, center=(float(ctr[0]), float(ctr[2])), alpha_peak=0.4)
        objs.append(glow)
    info = U.fit_camera(cam, fit_pts, U.dir_from_angles(az, el), fov=fov, margin=margin, target_shift=spec.get('shift', (0.0, 0.0)))
    if spec.get('badge'):
        objs += attach_badge(spec['badge'], info, cam)
    arr = U.render_rgba(icon_id)
    pm = U.premultiply(arr)
    sizes = {}
    for size in SIZES:
        k = U.SS // size
        po = U.outline(pm, OUTLINE_PX[size] * spec.get('outline', 1.0), OUT_COLOR)
        res = U.unpremultiply(U.box_down(po, k))
        path = os.path.join(out_dir, 'icons', str(size), icon_id + '.webp')
        sizes[size] = U.save_webp(res, path, quality)
    U.purge(objs)
    U.log(f'{icon_id:34s} {sizes[128]:6d} B / {sizes[256]:6d} B  ({time.time() - t0:.1f}s)')
    return sizes


def main():
    out_dir = U.script_flag('--out', None)
    if out_dir:
        U.set_out(out_dir)
    out_dir = U.OUT_UI
    only = U.script_flag('--only', None)
    only = set(only.split(',')) if isinstance(only, str) else None
    quality = int(U.script_flag('--quality', 84))
    poses = U.load_poses()
    sc = U.setup_scene()
    U.make_world()
    U.make_lights()
    cam = U.make_camera(FOV_DEFAULT)
    specs = all_specs()
    t0 = time.time()
    done = []
    failed = []
    for icon_id, spec in specs.items():
        if only and icon_id not in only:
            continue
        try:
            render_one(icon_id, spec, poses, cam, out_dir, quality)
            done.append(icon_id)
        except Exception as exc:  # um ícone ruim não derruba o lote
            import traceback
            traceback.print_exc()
            failed.append((icon_id, str(exc)))
            U.purge([o for o in bpy.data.objects if o.type in ('MESH', 'EMPTY') or o.name.startswith('Glow')])
    # manifesto: ids existentes em disco (um lote parcial com --only não apaga os demais)
    existing = sorted(f[:-5] for f in os.listdir(os.path.join(out_dir, 'icons', '128')) if f.endswith('.webp')) \
        if os.path.isdir(os.path.join(out_dir, 'icons', '128')) else []
    U.update_manifest('icons', {'sizes': sorted(SIZES), 'dir': 'icons', 'ext': 'webp', 'ids': existing})
    b = U.update_manifest('aliases', dict(sorted(S.ALIASES.items())))
    U.log(f'{len(done)} ícones em {time.time() - t0:.0f}s; falhas: {failed or "nenhuma"}; bytes: {b}')
    if failed:
        sys.exit(1)


if __name__ == '__main__':
    main()
