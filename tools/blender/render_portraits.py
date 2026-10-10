"""
render_portraits.py (F7-09) — retratos das unidades para o card de seleção, renderizados em Eevee a partir dos MESMOS
.glb de public/models/. Um quadro por estado (idle e ataque), 128x128, fundo em degradê da cor da facção.

Saída: public/ui/portraits/<tipo>_idle.webp e <tipo>_attack.webp (RGB, sem alfa) e a seção `portraits` do manifesto.

O estado "ataque" usa a pose REAL do UnitAnimator no instante do golpe (`fight`) ou do lançamento (`cast`), extraída por
`node tools/dump-portrait-poses.mjs` -> tools/blender/portrait_poses.json. A câmera é a mesma nos dois quadros (calculada
na pose idle), então a cabeça não "pula" quando a HUD troca de imagem; o quadro de ataque só aproxima um pouco (zoom
de 6 %), inclina 3° e esquenta o fundo.

    tools/safe-run.sh --timeout 1200 -- /home/rafael/Downloads/blender-5.2.1-linux-x64/blender -b --factory-startup \
        --python tools/blender/render_portraits.py [-- --only knight,grunt] [--out /caminho/ui] [--quality 88]
"""
import bpy
import math
import os
import sys
import time
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C  # noqa: E402
import ui_common as U  # noqa: E402
import ui_specs as S  # noqa: E402
import render_icons as RI  # noqa: E402  (build_subject / attach_badge)

SIZE = 128
K = U.SS // SIZE            # fator de redução do render de 512
OUTLINE_R = 3               # contorno fino (px do render de 512 => ~0,75 px no retrato)


def hex_srgb(h):
    h = h.lstrip('#')
    return np.array([int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)], dtype=np.float32)


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def make_bg(size, center_hex, edge_hex, attack=False):
    """Degradê radial da facção + névoa no chão + vignette; no ataque o centro esquenta e ganha um risco de luz."""
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32) / (size - 1)      # yy cresce para CIMA (origem embaixo)
    c, e = hex_srgb(center_hex), hex_srgb(edge_hex)
    if attack:
        c = c * 0.65 + hex_srgb('#ff9a4a') * 0.35
        c = np.clip(c * 1.1, 0, 1)
    d = np.hypot((xx - 0.5) * 1.0, (yy - 0.56) * 1.1)
    t = np.clip(1.0 - d / 0.9, 0.0, 1.0) ** 1.5
    bg = e[None, None, :] * (1 - t[..., None]) + c[None, None, :] * t[..., None]
    floor = smoothstep(0.30, 0.0, yy)[..., None]                       # chão: escurece a base
    bg = bg * (1 - 0.35 * floor)
    if attack:
        band = np.exp(-(((xx - 0.78 * yy - 0.08) / 0.07) ** 2))
        bg = bg + (band * 0.22)[..., None] * np.array([1.0, 0.85, 0.6], dtype=np.float32)
    vig = 1.0 - 0.38 * smoothstep(0.55, 1.0, np.hypot(xx - 0.5, yy - 0.5) * 1.45)
    bg = bg * vig[..., None]
    return np.clip(bg, 0.0, 1.0)


def blur(a, r):
    """Desfoque de caixa separável (r em px) de um array HxW."""
    if r < 1:
        return a
    k = 2 * r + 1
    out = a
    for axis in (0, 1):
        pad = [(0, 0), (0, 0)]
        pad[axis] = (r + 1, r)
        c = np.cumsum(np.pad(out, pad, mode='edge'), axis=axis, dtype=np.float64)
        n = out.shape[axis]
        sl_hi = [slice(None), slice(None)]
        sl_lo = [slice(None), slice(None)]
        sl_hi[axis] = slice(k, k + n)
        sl_lo[axis] = slice(0, n)
        out = ((c[tuple(sl_hi)] - c[tuple(sl_lo)]) / k).astype(np.float32)
    return out


def shade_portrait(pm, bg):
    """pm = render premultiplicado 512; devolve RGB 512 com sombra suave e contorno fino sobre `bg`."""
    a = pm[..., 3]
    shadow = np.roll(np.roll(blur(a, 7), -9, axis=0), 7, axis=1) * 0.38          # deslocada para baixo/direita
    base = bg * (1.0 - shadow[..., None])
    po = U.outline(pm, OUTLINE_R, (0.03, 0.035, 0.05), 0.55)
    return U.composite_over(po, base)


def render_one(pid, spec, poses, cam, out_dir, quality):
    t0 = time.time()
    glb = spec['glb']
    bgc = S.PORTRAIT_BG[spec.get('faction', 'human')]
    sub = dict(glb=glb, pose='idle')
    # --- idle: monta, enquadra (câmera fixada nesta pose) e renderiza
    objs, _hint, nodes = RI.build_subject(sub, poses)
    pts = U.world_points(objs)
    zmax, zmin = pts[:, 2].max(), pts[:, 2].min()
    crop = spec.get('crop', 1.0)
    fit_pts = pts[pts[:, 2] >= zmax - crop * (zmax - zmin) - 1e-6] if crop < 1.0 else pts
    fov = spec.get('fov', 20.0)
    info = U.fit_camera(cam, fit_pts, U.dir_from_angles(spec.get('az', 22), spec.get('el', 6)), fov=fov,
                        margin=spec.get('margin', 0.05), target_shift=spec.get('shift', (0.0, 0.0)))
    extra = []
    if spec.get('badge'):
        extra = RI.attach_badge(spec['badge'], info, cam)
    sizes = {}
    # idle
    arr = U.render_rgba(pid + '_idle')
    rgb = shade_portrait(U.premultiply(arr), make_bg(U.SS, bgc[0], bgc[1], False))
    path = os.path.join(out_dir, 'portraits', f'{pid}_idle.webp')
    sizes['idle'] = U.save_webp(U.box_down(rgb, K), path, quality, alpha=False)
    # --- ataque: mesma câmera, pose do golpe/lançamento, zoom leve + inclinação
    kind, prog = spec.get('attack', ('fight', 0.45))
    pose = poses.get(glb, {}).get('poses', {}).get(f'{kind}_{prog}') or poses.get(glb, {}).get('poses', {}).get('fight_0.45')
    head = nodes.get('Head') if nodes else None
    bpy.context.view_layer.update()
    head0 = head.matrix_world.translation.copy() if head else None
    cam_loc0 = cam.location.copy()
    if pose is not None:
        U.apply_pose(nodes, pose)
    bpy.context.view_layer.update()
    if head is not None:                                          # a câmera acompanha a cabeça: ela não "pula" no quadro
        cam.location = cam_loc0 + (head.matrix_world.translation - head0)
    cam.data.angle = math.radians(fov * 0.94)
    q = cam.rotation_quaternion.copy()
    from mathutils import Quaternion, Vector
    roll = Quaternion(Vector((0, 0, 1)), math.radians(3.0))      # rolagem em torno do eixo ótico da câmera (eixo local z)
    cam.rotation_quaternion = q @ roll
    arr = U.render_rgba(pid + '_attack')
    rgb = shade_portrait(U.premultiply(arr), make_bg(U.SS, bgc[0], bgc[1], True))
    path = os.path.join(out_dir, 'portraits', f'{pid}_attack.webp')
    sizes['attack'] = U.save_webp(U.box_down(rgb, K), path, quality, alpha=False)
    cam.rotation_quaternion = q
    cam.location = cam_loc0
    cam.data.angle = math.radians(fov)
    U.purge(objs + extra)
    U.log(f'{pid:18s} idle {sizes["idle"]:5d} B  ataque {sizes["attack"]:5d} B  ({time.time() - t0:.1f}s)')
    return sizes


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
    t0 = time.time()
    failed = []
    for pid, spec in S.PORTRAITS.items():
        if only and pid not in only:
            continue
        try:
            render_one(pid, spec, poses, cam, out_dir, quality)
        except Exception as exc:
            import traceback
            traceback.print_exc()
            failed.append((pid, str(exc)))
            U.purge([o for o in bpy.data.objects if o.type in ('MESH', 'EMPTY')])
    pdir = os.path.join(out_dir, 'portraits')
    ids = sorted({f[:-len('_idle.webp')] for f in os.listdir(pdir) if f.endswith('_idle.webp')}) if os.path.isdir(pdir) else []
    b = U.update_manifest('portraits', {'size': SIZE, 'dir': 'portraits', 'ext': 'webp', 'states': ['idle', 'attack'], 'ids': ids})
    U.log(f'{len(ids)} retratos em {time.time() - t0:.0f}s; falhas: {failed or "nenhuma"}; bytes: {b}')
    if failed:
        sys.exit(1)


if __name__ == '__main__':
    main()
