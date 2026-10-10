"""
render_art2d.py (F7-09) — arte do MENU PRINCIPAL e da TELA DE LOADING, renderizadas em Eevee a partir dos MESMOS .glb do
jogo (castelo, Grande Salão, unidades, árvores) numa cena de pôr do sol: céu em degradê com sol, montanhas, terreno low-poly
com estrada, névoa volumétrica, profundidade de campo leve e pós (bloom/contraste/vignette) em numpy.

Saída (1920x1080, WebP): public/ui/art/menu.webp e public/ui/art/loading.webp + seção `art` de public/ui/manifest.json.

    tools/safe-run.sh --timeout 1200 -- /home/rafael/Downloads/blender-5.2.1-linux-x64/blender -b --factory-startup \
        --python tools/blender/render_art2d.py [-- --only menu|loading] [--scale 0.5] [--samples 48] [--out /caminho/ui]

`--scale 0.5` renderiza em 960x540 (provas rápidas). Pré-requisito: node tools/dump-portrait-poses.mjs (poses das unidades).
"""
import bpy
import math
import os
import sys
import time
import random
import numpy as np
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C  # noqa: E402
import ui_common as U  # noqa: E402
import ui_scene as SC  # noqa: E402

W, H = 1920, 1080


def setup(scale, samples):
    sc = U.setup_scene(res=512, samples=samples, transparent=False)
    sc.render.resolution_x = int(W * scale)
    sc.render.resolution_y = int(H * scale)
    sc.render.resolution_percentage = 100
    ev = sc.eevee
    try:
        ev.use_raytracing = False
        ev.use_fast_gi = True
        ev.fast_gi_method = 'AMBIENT_OCCLUSION_ONLY'
        ev.fast_gi_distance = 4.0
        ev.shadow_ray_count = 3
        ev.shadow_step_count = 12
    except Exception:
        pass
    sc.view_settings.view_transform = 'Standard'
    return sc


def make_cam(loc, target, fov, focus=None, fstop=None):
    cd = bpy.data.cameras.new('ArtCam')
    cd.sensor_fit = 'HORIZONTAL'
    cd.angle = math.radians(fov)
    cd.clip_start = 0.1
    cd.clip_end = 4000.0
    cam = bpy.data.objects.new('ArtCam', cd)
    bpy.context.scene.collection.objects.link(cam)
    d = Vector(target) - Vector(loc)
    cam.location = loc
    cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    bpy.context.scene.camera = cam
    if focus and fstop:
        cd.dof.use_dof = True
        cd.dof.focus_distance = focus
        cd.dof.aperture_fstop = fstop
    return cam


def place_ground(lib, terrain, key, x, y, yaw, scale=1.0, pose=None, dz=0.0):
    z = SC.ground_z(terrain, x, y) + dz
    return lib.instance(key, (x, y, z), yaw, scale, pose)


def scatter_trees(lib, terrain, rng, n, region, keep_out, clear=None, kinds=('tree_pine', 'tree_oak', 'tree_autumn'), weights=(0.5, 0.35, 0.15)):
    """Árvores (.glb do jogo) espalhadas fora da estrada, das construções (`keep_out` = círculos) e do corredor livre `clear(x, y)`."""
    (x0, x1), (y0, y1) = region
    placed = 0
    tries = 0
    while placed < n and tries < n * 40:
        tries += 1
        x, y = rng.uniform(x0, x1), rng.uniform(y0, y1)
        if any(math.hypot(x - cx, y - cy) < r for (cx, cy, r) in keep_out):
            continue
        if clear and clear(x, y):
            continue
        if terrain.road_dist(np.array([x]), np.array([y]))[0] < 8.0:
            continue
        kind = rng.choices(kinds, weights)[0]
        s = rng.uniform(1.0, 1.7) * (1.5 if kind == 'tree_pine' else 1.15)
        place_ground(lib, terrain, kind, x, y, rng.uniform(0, 360), s)
        placed += 1


def mountains(x, y, seed=3):
    """Cordilheira distante: cristas (ruído 'ridged') que crescem com a distância."""
    r = np.abs(SC.fbm(x / 260.0, y / 260.0, seed, 4)) * -1.0 + 1.0           # 0..1, cristas em 1
    base = (r ** 2.4) * 190.0 + SC.fbm(x / 70.0, y / 70.0, seed + 5, 3) * 14.0
    ramp = SC.smooth(300.0, 600.0, y)
    sides = 0.55 + 0.45 * SC.smooth(0.0, 520.0, np.abs(x))                    # mais alto nas laterais, vale no centro
    return np.maximum(base * ramp * sides, 0.0) + SC.fbm(x / 120.0, y / 120.0, seed + 9, 3) * 6.0 * SC.smooth(220.0, 400.0, y)


def mountain_color(x, y, h, slope):
    n = SC.fbm(x / 40.0, y / 40.0, 4, 3)
    green = np.array(SC.hex_srgb('#4f7f45'))
    rock = np.array(SC.hex_srgb('#6d6a78'))
    snow = np.array(SC.hex_srgb('#eef2f8'))
    t = SC.smooth(20.0, 110.0, h + n * 25.0)[:, None]
    col = green * (1 - t) + rock * t
    s = SC.smooth(125.0, 165.0, h + n * 30.0)[:, None]
    col = col * (1 - s) + snow * s
    return np.clip(col, 0, 1)


def build_menu(lib, scale, samples):
    """Dois exércitos frente a frente no pôr do sol. A composição deixa o ~quarto esquerdo (menu de botões) tranquilo e põe
    os dois exércitos, o castelo e o Grande Salão na faixa 30–90 % da largura, para a arte sobreviver ao recorte `cover`
    em telas 4:3."""
    rng = random.Random(11)
    setup(scale, samples)
    sky_sun = (0.34, 1.0, 0.075)                                  # sol visível rente ao horizonte, à direita do centro
    SC.make_sky(sky_sun, strength=1.15)
    SC.add_sun((0.62, 0.74, 0.17), color='#ff9d55', energy=6.5, angle=1.8)      # luz-chave rasante (de trás e da direita)
    SC.add_sun((-0.25, -0.9, 0.5), color='#a9bdff', energy=1.9, angle=25.0, name='FillArt')
    road = SC.catmull([(2, -30), (-2, 8), (-1, 40), (3, 78), (-1, 118), (2, 170), (0, 260)])
    terrain = SC.Terrain(seed=21, road=road, bumps=[(-24, 120, 30, 8.0), (38, 136, 28, 6.0), (-80, 70, 36, 6.0), (86, 80, 40, 7.0)], amp=3.0)
    SC.build_grid_mesh('Near', -190, 190, -50, 300, 3.2, terrain.height, terrain.color)
    SC.build_grid_mesh('Far', -1400, 1400, 250, 1500, 26.0, mountains, mountain_color)

    # construções (os mesmos .glb do jogo)
    place_ground(lib, terrain, 'castle', -22, 120, 12, 1.5)
    place_ground(lib, terrain, 'watchtower', -44, 104, 20, 1.3)
    place_ground(lib, terrain, 'barracks', -36, 96, 30, 1.2)
    place_ground(lib, terrain, 'cottage', -6, 100, 10, 1.1)
    place_ground(lib, terrain, 'great_hall', 38, 136, -14, 1.5)
    place_ground(lib, terrain, 'orc_watchtower', 14, 110, -20, 1.4)
    place_ground(lib, terrain, 'orc_barracks', 62, 120, -30, 1.2)
    place_ground(lib, terrain, 'pig_farm', 66, 98, -40, 1.1)

    # exércitos: humanos à esquerda da estrada (olham +x), orcs à direita (olham -x)
    AY = -9.0                                                       # aproxima os exércitos da câmera (mais presença)
    S = 1.12

    def pa(key, x, y, yaw, sc_, pose):
        return place_ground(lib, terrain, key, x, y + AY, yaw, sc_, pose)
    for (x, y), pose, sc_ in [((-6.3, 30), 'fight_0.3', S), ((-5.0, 33.4), 'fight_0.45', S), ((-6.6, 36.8), 'idle', S),
                              ((-5.3, 40.2), 'fight_0.3', S), ((-8.2, 32), 'idle', 1.25)]:
        pa('knight', x, y, 90 + rng.uniform(-14, 14), sc_, pose)
    for i in range(4):
        pa('archer', -10.4 + rng.uniform(-0.6, 0.6), 29.5 + i * 3.6, 90 + rng.uniform(-10, 10), S, 'fight_0.6' if i % 2 else 'idle')
    pa('mage', -13.2, 35, 80, S, 'cast_0.5')
    pa('cavalier', -9.4, 26, 80, S, 'idle')
    pa('cavalier', -9.0, 44.5, 100, S, 'idle')
    pa('ballista', -16.0, 41, 85, S, 'idle')
    for (key, (x, y), pose, sc_) in [('grunt', (2.4, 30.5), 'fight_0.3', S), ('grunt', (1.4, 33.8), 'fight_0.45', S), ('grunt', (2.8, 37.2), 'idle', S),
                                    ('grunt', (1.7, 40.6), 'fight_0.3', S), ('ogre', (5.4, 34.0), 'fight_0.3', 1.22)]:
        pa(key, x, y, -90 + rng.uniform(-14, 14), sc_, pose)
    for i in range(4):
        pa('axethrower', 8.2 + rng.uniform(-0.6, 0.6), 29.0 + i * 3.7, -90 + rng.uniform(-10, 10), S, 'fight_0.3' if i % 2 else 'idle')
    pa('necromancer', 10.4, 36, -80, S, 'cast_0.5')
    pa('ogre', 6.4, 43.5, -100, 1.22, 'idle')
    pa('catapult', 12.8, 42, -85, S, 'idle')
    # aéreos
    lib.instance('gryphon_rider', (-4.0, 40.0, 10.0), 70, 1.35, 'idle')
    lib.instance('war_serpent', (10.0, 54.0, 13.0), -80, 1.35, 'idle')

    def clear(x, y):               # corredor livre (câmera -> exércitos -> estrada) e laterais próximas
        return (y < 80 and abs(x + 2) < 40) or y < 10
    scatter_trees(lib, terrain, rng, 300, ((-150, 150), (-20, 250)), [(-22, 120, 22), (38, 136, 22), (-6, 100, 8), (14, 110, 8)], clear)

    def prop_ok(x, y):             # primeiro plano: fora da estrada e dos exércitos
        return terrain.road_dist(np.array([x]), np.array([y]))[0] > 7.0 and not (14 < y < 46 and -22 < x < 24)
    SC.scatter_props(terrain, rng, 22, 700, prop_ok)
    SC.scatter_embers(rng, 150, ((-24, 20), (6, 56), (0.8, 9.0)), size=(0.05, 0.14))
    return make_cam((-9.0, -10.0, 2.8), (-2.0, 60.0, 8.6), 53.0, focus=40.0, fstop=7.0)


def build_loading(lib, scale, samples):
    """Duelo em primeiro plano (Espadachim x Talhador) diante dos dois reinos, num amanhecer dourado."""
    rng = random.Random(5)
    setup(scale, samples)
    sun_dir = (-0.52, 1.0, 0.16)
    SC.make_sky(sun_dir, zenith='#1b2347', mid='#6a4a80', low='#f08a52', horizon='#ffe0a0', strength=1.0, cloud_tint='#ffb072')
    SC.add_sun(sun_dir, color='#ffab62', energy=7.5, angle=1.6)
    SC.add_sun((0.4, -0.9, 0.5), color='#a8bcff', energy=1.1, angle=20.0, name='FillArt')
    road = SC.catmull([(0, -30), (1, 10), (-2, 50), (3, 100), (0, 160), (-1, 260)])
    terrain = SC.Terrain(seed=7, road=road, bumps=[(-44, 120, 30, 8.0), (46, 128, 28, 7.0), (0, 190, 60, 5.0)], amp=2.6)
    SC.build_grid_mesh('Near', -190, 190, -50, 300, 3.0, terrain.height, terrain.color)
    SC.build_grid_mesh('Far', -1400, 1400, 250, 1500, 26.0, mountains, mountain_color)
    place_ground(lib, terrain, 'castle', -44, 122, 20, 1.6)
    place_ground(lib, terrain, 'great_hall', 46, 130, -18, 1.6)
    place_ground(lib, terrain, 'watchtower', -66, 105, 20, 1.3)
    place_ground(lib, terrain, 'orc_watchtower', 24, 108, -20, 1.4)
    # duelo: heróis em primeiro plano, de perfil, um de cada lado
    kz = SC.ground_z(terrain, -2.7, 7.6)
    lib.instance('knight', (-2.7, 7.6, kz), 78, 1.0, 'fight_0.3')
    gz = SC.ground_z(terrain, 2.7, 8.0)
    lib.instance('grunt', (2.7, 8.0, gz), -80, 1.0, 'fight_0.3')
    # tropas ao fundo, em filas
    for i in range(5):
        place_ground(lib, terrain, 'knight', -9 - i * 2.2, 22 + i * 1.8 + rng.uniform(-0.5, 0.5), 80 + rng.uniform(-10, 10), 1.0, 'idle')
        place_ground(lib, terrain, 'archer', -14 - i * 2.0, 30 + i * 1.6 + rng.uniform(-0.5, 0.5), 80 + rng.uniform(-10, 10), 1.0, 'idle')
        place_ground(lib, terrain, 'grunt', 9 + i * 2.2, 22 + i * 1.8 + rng.uniform(-0.5, 0.5), -80 + rng.uniform(-10, 10), 1.0, 'idle')
        place_ground(lib, terrain, 'axethrower', 14 + i * 2.0, 30 + i * 1.6 + rng.uniform(-0.5, 0.5), -80 + rng.uniform(-10, 10), 1.0, 'idle')
    scatter_trees(lib, terrain, rng, 240, ((-150, 150), (-10, 250)), [(-44, 122, 24), (46, 130, 24)], lambda x, y: (y < 70 and abs(x) < 32) or y < 8)
    SC.scatter_embers(rng, 120, ((-9, 9), (2, 34), (0.5, 6.0)), size=(0.025, 0.07))
    return make_cam((0.3, -3.6, 1.3), (0.0, 12.0, 1.55), 44.0, focus=11.5, fstop=3.5)


BUILDERS = {'menu': build_menu, 'loading': build_loading}


HAZE = {
    'menu': dict(density=0.0030, near=30.0, warm='#ffb07a', cool='#8e7bbd', amount=0.9, warm_x=0.66),
    'loading': dict(density=0.0032, near=24.0, warm='#ffc58a', cool='#a08ac4', amount=0.9, warm_x=0.30),
}


def render_art(name, scale, samples, out_dir, quality):
    t0 = time.time()
    poses = U.load_poses()
    lib = SC.Library(poses)
    BUILDERS[name](lib, scale, samples)
    bpy.context.view_layer.update()
    arr = U.render_rgba('art_' + name)                       # RGBA (fundo opaco)
    rgb = arr[..., :3]
    depth, alpha = SC.render_depth('depth_' + name)
    rgb = SC.apply_haze(rgb, depth, alpha, **HAZE[name])
    rgb = SC.grade(rgb, bloom=0.2, bloom_thr=0.84, bloom_r=int(16 * scale), contrast=1.12, vignette=0.36)
    if U.script_flag('--guides'):                              # só para projetar: marca a faixa ocupada pelo menu de botões
        g = rgb.copy()
        w_ = g.shape[1]
        g[:, : int(w_ * 0.26)] = g[:, : int(w_ * 0.26)] * 0.45 + np.array([0.35, 0.0, 0.0], dtype=np.float32)
        U.save_webp(g, os.path.join(out_dir, 'art', name + '_guides.webp'), 80, alpha=False)
    path = os.path.join(out_dir, 'art', name + '.webp')
    size = U.save_webp(rgb, path, quality, alpha=False)
    U.log(f'{name}: {rgb.shape[1]}x{rgb.shape[0]} -> {size / 1024:.0f} KB em {time.time() - t0:.0f}s')
    return {'file': f'art/{name}.webp', 'width': int(rgb.shape[1]), 'height': int(rgb.shape[0]), 'bytes': size}


def main():
    out_dir = U.script_flag('--out', None)
    if out_dir:
        U.set_out(out_dir)
    out_dir = U.OUT_UI
    only = U.script_flag('--only', None)
    scale = float(U.script_flag('--scale', 1.0))
    samples = int(U.script_flag('--samples', 64))
    quality = int(U.script_flag('--quality', 86))
    names = [only] if isinstance(only, str) else list(BUILDERS)
    info = {}
    for n in names:
        info[n] = render_art(n, scale, samples, out_dir, quality)
        if len(names) > 1:                                      # cada arte numa cena limpa
            C.reset_scene()
    # manifesto: preserva a outra arte já gravada
    import json
    cur = {}
    if os.path.exists(U.MANIFEST):
        with open(U.MANIFEST, 'r', encoding='utf-8') as f:
            cur = json.load(f).get('art', {})
    cur.update(info)
    b = U.update_manifest('art', cur)
    U.log('bytes:', b)


if __name__ == '__main__':
    main()
