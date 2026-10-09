"""
build_bandit_camp.py — Acampamento Bandido (construção neutra hostil `bandit_camp`) gerado 100% por script.
Refeito na arte A (F7-00b): a paliçada deixou de ser um anel de estacas soltas e virou um muro contínuo de toras com perfil de
altura (baixo no quadrante voltado para a câmera do jogo, alto nos fundos), com portão de mourões-totem e batentes abertos,
torre de vigia sobre pernas, tenda de cumeeira, abrigo de peles, fogueira com caldeirão, saque, rack de armas e faixas.

Uso:
  blender -b --factory-startup --python tools/blender/build_bandit_camp.py -- [--no-render]

Saída (public/models/bandit_camp.glb), coordenadas do jogo, origem no centro da base, frente = +Z:
  BanditCamp (raiz)
  ├─ Static_Mesh       paliçada densa de toras pontiagudas com travessas, crânios e portão aberto, torre de vigia,
  │                    tenda de guerra carmesim com remendos, abrigo de peles, fogueira, baú de saque, rack de armas,
  │                    barris/caixas, totens do portão com crânios e chifres (Atlas)
  ├─ Anim_Banners      faixas esfarrapadas (material TeamColor; o jogo pinta com a cor dos neutros)
  └─ Socket_UnitSpawn / Socket_Rally
Pegada ~8,4 (raio de colisão 4,2), altura ~6,6 (torre). 2 draw calls.
"""
import os
import sys
import math

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
from mathutils import Vector, Matrix  # noqa: E402
import common as C  # noqa: E402
from common import (MeshBuilder, M, prim_box, prim_rings, ring_h, prim_cyl, prim_cone,  # noqa: E402
                    prim_sphere, prim_extrude, bezier, limb_rings)
from bld_common import beam, tube, log, skull, bbox_game, finish_building  # noqa: E402
from bld_house import polar, barrel, crate  # noqa: E402
import bld_orc as O  # noqa: E402
import build_ogre_den as D  # noqa: E402

Y0 = 0.25
R = 3.7                 # raio da linha de centro da paliçada
GATE = 17.0             # meia-abertura angular do portão (graus; 0 = +Z)
POST_A = 19.5           # ângulo dos mourões do portão
TEAM_DEFAULT = '#8a1f1a'

PALETTE = dict(D.PALETTE)
PALETTE.update(O.ORC_EXTRAS)
PALETTE['wood'] = dict(PALETTE['log_light'])
PALETTE.update({
    'canvas': dict(base='#9a2b22', var='#6e1a14', var_scale=3.0, var_amt=0.9, fine=0.16, top=0.35, edge='#cf6a56',
                   edge_amt=0.3, edge_r=0.03, ao=(0.7, 0.6)),
    'canvas_dark': dict(base='#5a1812', var='#3c0e0a', var_scale=3.0, var_amt=0.9, fine=0.16, top=0.3),
    'patch': dict(base='#6a6a3a', var='#4a4a26', var_scale=5.0, var_amt=0.9, fine=0.14, top=0.3, ao=(0.5, 0.5)),
    'gold': dict(base='#f0b41a', var='#c98a08', var_scale=6.0, var_amt=0.9, fine=0.1, top=0.55, edge='#fff0a0',
                 edge_amt=0.9, edge_r=0.02, ao=(0.3, 0.4), emit_boost=0.25),
    'earth': dict(base='#6b5238', var='#463420', var_scale=3.0, var_amt=0.9, fine=0.2, top=0.2, ao=(0.8, 0.8)),
    'path': dict(base='#8a7352', var='#6a553a', var_scale=2.0, var_amt=0.9, fine=0.2, top=0.25, ao=(0.6, 0.6)),
    'stone': dict(D.ROCK, pattern=None, base='#6a645a', var='#443f37', var_scale=1.2, fine=0.22),
    'ashes': dict(base='#2b2623', var='#14110f', var_scale=8.0, fine=0.2, top=0.2),
    # toras do muro: AO leve (toras encostadas com AO forte viram "frestas pretas" e as toras parecem finas)
    'stake': dict(base='#5e3f2a', var='#42291a', var_scale=2.0, fine=0.09, pattern='planks_v', mapping='box', pw=3.0,
                  ph=0.3, mortar='#25160c', mortar_size=0.012, top=0.25, edge='#94704c', edge_amt=0.3, edge_r=0.03,
                  ao=(0.3, 0.45), grad=(0.0, 3.5, 0.18)),
})
PALETTE['stake_b'] = dict(PALETTE['stake'], base='#7a5638', var='#58391f')                   # toras mais claras (recém-cortadas)
PALETTE['stake_c'] = dict(PALETTE['stake'], base='#5c4a38', var='#41342a', edge='#8c7860')   # toras acinzentadas pelo tempo
PALETTE['war_paint'] = dict(base='#b02a20', var='#7c1a12', var_scale=6.0, fine=0.12, top=0.25, ao=(0.3, 0.4))


def jit(k, b=0.0):
    """Ruído determinístico em [-1, 1]."""
    return 0.5 * math.sin(k * 12.9898 + b * 78.233) + 0.5 * math.sin(k * 3.17 + b * 1.3)


def wall_h(theta):
    """Altura-base do muro por ângulo (0 = +Z, + = +X): mais baixo para a câmera do jogo (+x, +z), alto nos fundos."""
    return 2.3 - 0.55 * math.cos(math.radians(theta - 50.0))


BROKEN = (40.0, 98.0)       # trecho "caído" (toras curtas e inclinadas, com vãos) voltado para a câmera do jogo


def build_base(mats, root):
    mb = MeshBuilder('Base')
    mb.add(prim_cyl(4.05, 3.95, Y0, 20, base=True), 'earth', bevel=0.06, smooth=0)
    # terra batida no pátio e trilha de tábuas do portão até a fogueira
    mb.add(prim_cyl(3.35, 3.35, 0.03, 20, base=True), 'path', M((0.0, Y0, 0.0)), smooth=0)
    for k in range(6):
        z = 3.3 - k * 0.5
        mb.add(prim_box(0.95 - 0.02 * k, 0.04, 0.4, taper=(0.98, 1.0), base=True), 'plank', M((0.15 * math.sin(k * 1.7), Y0 + 0.02, z), (0, 4 * math.sin(k * 2.3), 0)), bevel=0.01)
    mb.add(prim_cyl(1.05, 1.05, 0.05, 10, base=True), 'ashes', M((-0.2, Y0, 0.85)), smooth=0)
    # pedras e tocos no limite do chão (quebram o círculo perfeito e assentam o acampamento no terreno)
    for k, (a, rr, sz) in enumerate(((20, 4.0, 0.34), (68, 4.05, 0.28), (112, 4.0, 0.4), (150, 4.1, 0.3), (205, 4.05, 0.36),
                                      (248, 4.0, 0.3), (292, 4.1, 0.42), (336, 4.0, 0.3))):
        x, z = polar(rr, a)
        mb.add(prim_sphere(sz, sz * 0.62, sz * 0.9, 6, 3, y_min=-0.3), 'stone', M((x, Y0 - 0.02, z), (0, a * 1.7, 0)), smooth=0)
    return mb.build(mats, parent=root)


def stake_log(mb, T, h, r0=0.235, r1=0.2, tip=0.5, mat='stake'):
    """Tora de paliçada: fuste sem tampas escondidas + ponta cônica sem base."""
    mb.add(prim_cyl(r0, r1, h, 6, base=True, cap0=False, cap1=False), mat, T, smooth=0)
    v, f = prim_cone(r1, tip, 6)
    mb.add((v, f[1:]), 'log_end', T @ M((0, h, 0)), smooth=0)


def build_palisade(mats, root):
    """Muro contínuo de toras (encostadas) com perfil de altura, travessas, crânios e dois mourões de portão."""
    mb = MeshBuilder('Palisade')
    a0, a1 = POST_A + 6.2, 360.0 - POST_A - 6.2
    n = int(round(R * math.radians(a1 - a0) / 0.40))
    tops = []
    for k in range(n + 1):
        a = a0 + (a1 - a0) * k / n
        th = a if a <= 180 else a - 360
        x, z = polar(R, a)
        broken = BROKEN[0] <= th <= BROKEN[1]
        if broken and k % 4 == 2:
            tops.append((a, th, x, z, 0.0, None, True))
            continue                                   # vão no muro caído
        if broken:
            h = 0.9 + 0.5 * abs(jit(k, 3.0)) + (0.35 if k % 3 == 0 else 0.0)
            tilt = 17.0 + 5.0 * jit(k, 2.0)
        else:
            h = wall_h(th) + 0.32 * jit(k) + (0.22 if k % 7 == 3 else 0.0)
            front = max(0.0, math.cos(math.radians(th - 45.0)))
            tilt = 4.5 + 8.0 * front + 2.0 * jit(k, 2.0)
        T = M((x, Y0 - 0.05, z), (0, a, 0)) @ M((0, 0, 0), (tilt, 0, 0))
        mat = ('stake', 'stake_b', 'stake_c')[(k * 7 + int(abs(jit(k, 5.0)) * 9)) % 3]
        stake_log(mb, T, h + 0.05, mat=mat)
        if not broken and k % 5 == 1:     # faixa de tinta de guerra
            r = 0.235 - 0.035 * 0.6
            mb.add(prim_cyl(r + 0.012, r + 0.012, 0.15, 6, base=True, cap0=False, cap1=False), 'war_paint',
                   T @ M((0, 0.6 * h, 0)), smooth=0)
        tops.append((a, th, x, z, h, T, broken))
    # travessas (duas alturas, 3 toras por trecho) amarradas por fora; seguem o perfil do muro
    step = 3
    for lvl, frac in ((0, 0.30), (1, 0.62)):
        for k in range(0, n - 1, step):
            ka, kb = tops[k], tops[min(k + step, n)]
            if any(t[6] for t in tops[k:min(k + step, n) + 1]):
                continue   # sem travessas no trecho caído
            pa = polar(R + 0.24, ka[0])
            pb = polar(R + 0.24, kb[0])
            ya = Y0 + frac * wall_h(ka[1]) + 0.05
            yb = Y0 + frac * wall_h(kb[1]) + 0.05
            beam(mb, (pa[0], ya, pa[1]), (pb[0], yb, pb[1]), 0.11, 0.07, 'wood_dark')
    # crânios empalados em algumas toras e um osso atravessado
    for k in (5, 14, 24, 33, 42, 47):
        if k > n or tops[k][6]:
            continue
        a, th, x, z, h, T, _ = tops[k]
        skull(mb, T @ M((0, h + 0.18, 0.02), (-10, 0, 0)), 0.36, 'bone')
    # toras caídas e ossos no trecho aberto
    for (p0, p1, r) in (((2.35, Y0 + 0.19, 2.9), (3.25, Y0 + 0.19, 2.35), 0.2), ((3.4, Y0 + 0.17, 1.1), (3.0, Y0 + 0.17, 0.2), 0.17)):
        log(mb, p0, p1, r, 'stake_c', n=6, tip=0.45)
    mb.add(prim_box(0.7, 0.07, 0.07), 'bone', M((2.9, Y0 + 0.05, 1.7), (0, 40, 0)))
    skull(mb, M((2.7, Y0 + 0.14, 1.95), (0, 150, 0)), 0.3, 'bone')
    return mb.build(mats, parent=root)


def build_gate(mats, root):
    """Portão: dois mourões-totem com crânios, verga com dentes de osso e crânio de ogro com chifres, batentes abertos."""
    mb = MeshBuilder('Gate')
    for sx in (-1, 1):
        gx, gz = polar(R, sx * POST_A)
        log(mb, (gx, Y0 - 0.05, gz), (gx, Y0 + 4.35, gz), 0.3, 'bark', n=8)
        mb.add(prim_cone(0.3, 0.6, 8), 'iron', M((gx, Y0 + 4.35, gz)))
        for (yy, s, ry) in ((2.15, 0.46, 0), (3.1, 0.4, 18)):
            skull(mb, M((gx + sx * 0.1, Y0 + yy, gz + 0.3), (0, sx * 22 + ry, 0)), s, 'bone')
        for yy in (1.0, 2.6, 3.7):
            mb.add(prim_cyl(0.33, 0.33, 0.07, 8), 'rope', M((gx, Y0 + yy, gz)), smooth=0)
        # reforço: duas toras menores coladas ao mourão, pontiagudas
        for dz, hh in ((-0.28, 3.3), (0.28, 3.0)):
            gx2, gz2 = polar(R + dz, sx * (POST_A + 2.4))
            stake_log(mb, M((gx2, Y0 - 0.05, gz2), (0, sx * (POST_A + 2.4), 0)), hh, r0=0.25, r1=0.21, tip=0.55)
    # padrão: verga do portão com dentes de osso, crânio de ogro com chifres e correntes
    gx, gz = polar(R, POST_A)
    gx = abs(gx)
    mb.add(prim_box(2 * gx + 0.2, 0.3, 0.32), 'wood_dark', M((0, Y0 + 3.4, gz)), bevel=0.02)
    mb.add(prim_box(2 * gx + 0.6, 0.12, 0.2), 'iron', M((0, Y0 + 3.62, gz + 0.02)))
    for k in range(9):
        x = -gx + 0.18 + k * (2 * gx - 0.36) / 8
        mb.add(prim_cone(0.045, 0.34 + 0.08 * (k % 2), 4), 'bone', M((x, Y0 + 3.25, gz + 0.16), (180, 0, 0)))
    skull(mb, M((0, Y0 + 4.0, gz + 0.14)), 0.58, 'bone')
    for sx in (-1, 1):
        O.tusk(mb, (sx * 0.28, Y0 + 3.92, gz + 0.12), (sx * 0.95, Y0 + 4.55, gz + 0.1), (sx * 0.2, 0.34, 0.1), r0=0.075)
        beam(mb, (sx * 0.5, Y0 + 3.5, gz + 0.1), (sx * 0.28, Y0 + 3.95, gz + 0.12), 0.03, 0.03, 'iron')
    # portões abertos para dentro (folhas de tábuas com cintas de ferro)
    for sx in (-1, 1):
        hx, hz = polar(R - 0.15, sx * (POST_A - 3.0))
        T = M((hx, Y0, hz), (0, -78 * sx, 0))
        c = -sx * 0.58
        mb.add(prim_box(1.16, 2.55, 0.13, base=True), 'plank', T @ M((c, 0.0, 0.0)), bevel=0.012)
        for yy in (0.4, 1.25, 2.1):
            mb.add(prim_box(1.18, 0.1, 0.17), 'iron', T @ M((c, yy, 0.0)))
        mb.add(prim_box(0.12, 2.5, 0.17, base=True), 'wood_dark', T @ M((-sx * 1.12, 0.0, 0.0)), bevel=0.01)
        for yy in (0.9, 1.9):
            mb.add(prim_cyl(0.07, 0.07, 0.2, 6, base=False), 'iron', T @ M((0, yy, 0), (90, 0, 0)))
    return mb.build(mats, parent=root)


def build_tower(mats, root, banners):
    """Torre de vigia sobre quatro pernas inclinadas (fundos-esquerda), com plataforma, parapeito, teto de peles e escada."""
    mb = MeshBuilder('Tower')
    tx, tz = polar(2.4, 222.0)
    legs = [(sx * 0.62, sz * 0.62) for sx in (-1, 1) for sz in (-1, 1)]
    ph = 3.3                                               # altura do piso
    for (lx, lz) in legs:
        log(mb, (tx + lx * 1.08, Y0 - 0.05, tz + lz * 1.08), (tx + lx * 0.78, Y0 + ph, tz + lz * 0.78), 0.17, 'bark', n=6)
    # contraventos em X nas quatro faces
    for (a, b) in (((-1, -1), (1, -1)), ((1, -1), (1, 1)), ((1, 1), (-1, 1)), ((-1, 1), (-1, -1))):
        p0 = (tx + a[0] * 0.93, Y0 + 0.4, tz + a[1] * 0.93)
        p1 = (tx + b[0] * 0.72, Y0 + ph - 0.55, tz + b[1] * 0.72)
        beam(mb, p0, p1, 0.1, 0.08, 'wood_dark')
        q0 = (tx + b[0] * 0.93, Y0 + 0.4, tz + b[1] * 0.93)
        q1 = (tx + a[0] * 0.72, Y0 + ph - 0.55, tz + a[1] * 0.72)
        beam(mb, q0, q1, 0.1, 0.08, 'wood_dark')
    for yy in (1.4, 2.5):
        k = 1.0 - (yy / ph) * 0.28
        for (a, b) in (((-1, -1), (1, -1)), ((1, -1), (1, 1)), ((1, 1), (-1, 1)), ((-1, 1), (-1, -1))):
            s = 0.62 * 1.08 - (0.62 * 0.3) * (yy / ph)
            beam(mb, (tx + a[0] * s, Y0 + yy, tz + a[1] * s), (tx + b[0] * s, Y0 + yy, tz + b[1] * s), 0.1, 0.08, 'wood')
    # piso e parapeito de tábuas com espinhos
    mb.add(prim_box(1.75, 0.14, 1.75), 'plank', M((tx, Y0 + ph, tz)), bevel=0.015)
    mb.add(prim_box(1.8, 0.1, 1.8), 'wood_dark', M((tx, Y0 + ph - 0.12, tz)))
    for k in range(4):
        a = 90 * k
        x, z = polar(0.84, a)
        if k == 1:      # lado da escada (voltado para o centro do acampamento: +x do giro): fica aberto
            continue
        mb.add(prim_box(1.7, 0.55, 0.07, base=True), 'log', M((tx + x, Y0 + ph + 0.07, tz + z), (0, a, 0)), bevel=0.01)
        mb.add(prim_box(1.76, 0.07, 0.1), 'wood_dark', M((tx + x, Y0 + ph + 0.62, tz + z), (0, a, 0)))
    for sx in (-1, 1):
        for sz in (-1, 1):
            log(mb, (tx + sx * 0.8, Y0 + ph, tz + sz * 0.8), (tx + sx * 0.8, Y0 + ph + 1.95, tz + sz * 0.8), 0.07, 'wood_dark', n=5)
    # teto de peles em pirâmide com costelas de osso e crânio no ápice
    mb.add(prim_cone(1.5, 0.9, 4, phase=math.radians(45)), 'canvas', M((tx, Y0 + ph + 1.92, tz)), smooth=0)
    mb.add(prim_cyl(1.3, 1.3, 0.1, 4, base=True, phase=math.radians(45)), 'canvas_dark', M((tx, Y0 + ph + 1.87, tz)), smooth=0)
    for k in range(4):
        a = 45 + 90 * k
        x, z = polar(1.5, a)
        beam(mb, (tx + x, Y0 + ph + 1.97, tz + z), (tx, Y0 + ph + 2.86, tz), 0.09, 0.07, 'bone')
    skull(mb, M((tx, Y0 + ph + 2.95, tz)), 0.32, 'bone')
    # escada de mão encostada na face voltada para o pátio (+x do giro 90°)
    lx = tx + 1.0
    for dz in (-0.28, 0.28):
        log(mb, (lx + 0.55, Y0 - 0.05, tz + dz), (lx - 0.18, Y0 + ph + 0.05, tz + dz), 0.05, 'wood_dark', n=5)
    for k in range(8):
        t = (k + 0.5) / 8
        px = lx + 0.55 + (-0.18 - 0.55) * t
        py = Y0 + 0.1 + (ph - 0.05) * t
        mb.add(prim_box(0.07, 0.07, 0.62), 'wood_light', M((px, py, tz)))
    # lanterna de osso pendurada e crânio no pé da torre
    skull(mb, M((tx + 0.6, Y0 + 0.08, tz + 1.15), (0, 40, 0)), 0.26, 'bone')
    # faixa de time pendurada no parapeito voltado para a câmera (fica em Anim_Banners)
    O.tattered_banner(banners, tx + 0.35, Y0 + ph + 0.5, tz + 0.98, 0, 0.7, 1.1)
    O.tattered_banner(banners, tx + 0.98, Y0 + ph + 0.5, tz - 0.3, 90, 0.7, 1.1)
    return mb.build(mats, parent=root)


def slope_patch(mb, T, a, wh, H, side, t, z0, w, d, mat, rot=0.0):
    """Remendo/faixa sobre a água do telhado da tenda (side=+1 direita). t: 0 no beiral, 1 na cumeeira."""
    beta = math.degrees(math.atan2(H - wh, a))
    x = side * a * (1 - t)
    y = wh + (H - wh) * t
    n = Vector((side * (H - wh), a, 0)).normalized() * 0.012
    mb.add(prim_box(w, 0.025, d), mat, T @ M((x + n.x, y + n.y, z0), (0, 0, -side * beta)) @ M((0, 0, 0), (0, rot, 0)), bevel=0.004)


def build_tent(mats, root, banners):
    """Tenda de guerra de cumeeira (carmesim) com remendos de pele, aba de entrada, mastro com crânio e cordas."""
    mb = MeshBuilder('Tent')
    cx, cz, psi = 0.85, -1.2, -12.0
    T = M((cx, Y0, cz), (0, psi, 0))
    a, b, wh, H = 1.25, 1.35, 0.55, 2.35
    mb.add(prim_extrude([(-a, 0.0), (a, 0.0), (a, wh), (0.0, H), (-a, wh)], 2 * b, axis='z'), 'canvas', T, smooth=0)

    def P(x, y, z):
        return tuple(T @ Vector((x, y, z)))

    # remendos e faixas
    for side in (-1, 1):
        slope_patch(mb, T, a, wh, H, side, 0.12, 0.0, 0.3, 2 * b + 0.06, 'canvas_dark')       # barra do beiral
        slope_patch(mb, T, a, wh, H, side, 0.88, 0.0, 0.2, 2 * b + 0.06, 'canvas_dark')       # barra da cumeeira
    slope_patch(mb, T, a, wh, H, 1, 0.47, -0.62, 0.5, 0.42, 'hide', 14)
    slope_patch(mb, T, a, wh, H, 1, 0.66, 0.28, 0.34, 0.36, 'canvas_dark', -9)
    slope_patch(mb, T, a, wh, H, 1, 0.30, 0.72, 0.36, 0.3, 'hide_dark', 22)
    slope_patch(mb, T, a, wh, H, -1, 0.5, -0.4, 0.46, 0.38, 'hide_dark', -12)
    slope_patch(mb, T, a, wh, H, -1, 0.33, 0.55, 0.34, 0.32, 'canvas_dark', 18)
    # entrada: abertura escura, bandeira de pele nas bordas e viga de topo
    mb.add(prim_extrude([(-0.52, 0.0), (0.52, 0.0), (0.0, 1.45)], 0.06, axis='z'), 'dark', T @ M((0, 0, b + 0.02)))
    for sx in (-1, 1):
        beam(mb, P(sx * 0.6, 0.0, b + 0.05), P(0.0, 1.58, b + 0.05), 0.13, 0.08, 'hide_dark')
        # aba enrolada e amarrada ao lado da entrada
        mb.add(prim_cyl(0.07, 0.07, 1.25, 6, base=False), 'canvas_dark', T @ M((sx * 0.88, 0.75, b + 0.04), (0, 0, -sx * 28)), smooth=30)
    # mastro da cumeeira: sai pelos dois frontões com ponta de osso e crânio na frente
    log(mb, P(0, H - 0.02, -b - 0.45), P(0, H - 0.02, b + 0.5), 0.07, 'wood_dark', n=6)
    mb.add(prim_cone(0.09, 0.5, 5), 'bone', T @ M((0, H + 0.0, b + 0.5), (90, 0, 0)))
    mb.add(prim_cone(0.09, 0.45, 5), 'bone', T @ M((0, H + 0.0, -b - 0.45), (-90, 0, 0)))
    skull(mb, T @ M((0, H + 0.2, b + 0.2), (-10, 0, 0)), 0.32, 'bone')
    # cordas e estacas
    for sz in (-1, 1):
        for sx in (-1, 1):
            q = P(sx * 0.95, 0.0, sz * (b + 1.25))
            beam(mb, P(0, H - 0.05, sz * (b + 0.25)), q, 0.035, 0.035, 'rope')
            mb.add(prim_cone(0.06, 0.45, 4), 'wood_dark', T @ M((sx * 0.95, 0.0, sz * (b + 1.25)), (sz * -18, 0, 0)))
    for sz in (-1, 0, 1):
        for sx in (-1, 1):
            q = P(sx * (a + 0.9), 0.0, sz * 0.95)
            beam(mb, P(sx * a, wh, sz * 0.95), q, 0.035, 0.035, 'rope')
            mb.add(prim_cone(0.06, 0.45, 4), 'wood_dark', T @ M((sx * (a + 0.9), 0.0, sz * 0.95), (0, 0, sx * 18)))
    # peles estendidas no chão diante da entrada e saco de dormir
    mb.add(prim_box(1.3, 0.05, 0.9, taper=(0.9, 0.9)), 'hide_dark', M((cx + 1.1, Y0 + 0.02, cz + 2.0), (0, 20, 0)))
    return mb.build(mats, parent=root)


def build_shelter(mats, root):
    """Abrigo de peles do batedor (esquerda), encostado no muro: leito, tambor e estaca com pele secando."""
    mb = MeshBuilder('Shelter')
    sx_, sz_ = -2.45, 0.15
    for dz in (-0.85, 0.85):
        log(mb, (sx_ - 0.75, Y0, sz_ + dz), (sx_ - 0.75, Y0 + 1.0, sz_ + dz), 0.075, 'wood_dark', n=5)     # lado do muro (baixo)
        log(mb, (sx_ + 0.75, Y0, sz_ + dz), (sx_ + 0.75, Y0 + 1.65, sz_ + dz), 0.075, 'wood_dark', n=5)     # lado do pátio (alto)
    mb.add(prim_box(1.9, 0.07, 2.05), 'hide', M((sx_, Y0 + 1.35, sz_), (0, 0, 20)), bevel=0.012)
    mb.add(prim_box(1.9, 0.09, 0.09), 'wood_dark', M((sx_, Y0 + 1.31, sz_ + 1.02), (0, 0, 20)))
    mb.add(prim_box(1.9, 0.09, 0.09), 'wood_dark', M((sx_, Y0 + 1.31, sz_ - 1.02), (0, 0, 20)))
    mb.add(prim_box(1.25, 0.14, 0.58, base=True), 'hide_dark', M((sx_ - 0.1, Y0, sz_ - 0.25)), bevel=0.02)    # leito
    mb.add(prim_cyl(0.13, 0.13, 0.55, 6, base=False), 'leather', M((sx_ - 0.55, Y0 + 0.2, sz_ - 0.25), (0, 0, 90)), smooth=40)
    mb.add(prim_box(0.7, 0.04, 0.4), 'canvas', M((sx_ + 0.12, Y0 + 0.16, sz_ - 0.25), (0, 12, 0)))               # cobertor
    mb.add(prim_cyl(0.2, 0.22, 0.34, 8, base=True), 'wood', M((sx_ + 0.35, Y0, sz_ + 0.55)), smooth=40)         # tambor/banco
    mb.add(prim_cyl(0.2, 0.2, 0.02, 8), 'log_end', M((sx_ + 0.35, Y0 + 0.34, sz_ + 0.55)), smooth=0)
    return mb.build(mats, parent=root)


def build_fire(mats, root):
    """Fogueira em anel de pedras com toras, troncos de assento, espeto de ferro e caldeirão."""
    mb = MeshBuilder('Fire')
    fx, fz = -0.2, 0.85
    for k in range(9):
        a = 40 * k
        x, z = polar(0.72, a)
        mb.add(prim_sphere(0.17, 0.12, 0.15, 5, 3), 'stone', M((fx + x, Y0 + 0.08, fz + z), (0, a, 0)), smooth=0)
    for k in range(5):
        a = 72 * k + 10
        pa = math.radians(a)
        beam(mb, (fx + math.sin(pa) * 0.55, Y0 + 0.14, fz + math.cos(pa) * 0.55), (fx, Y0 + 0.5, fz), 0.07, 0.07, 'wood_dark')
    mb.add(prim_cyl(0.45, 0.45, 0.12, 9), 'coal', M((fx, Y0 + 0.06, fz)), smooth=0)
    mb.add(prim_cone(0.3, 0.8, 6), 'ember', M((fx, Y0 + 0.2, fz)), smooth=30)
    mb.add(prim_cone(0.16, 0.55, 5), 'glow', M((fx + 0.1, Y0 + 0.2, fz + 0.05)), smooth=30)
    for sx in (-1, 1):
        beam(mb, (fx + sx * 0.98, Y0, fz), (fx + sx * 0.98, Y0 + 1.3, fz), 0.055, 0.055, 'iron')
        mb.add(prim_cone(0.07, 0.25, 4), 'iron', M((fx + sx * 0.98, Y0 + 1.3, fz)))
    beam(mb, (fx - 1.03, Y0 + 1.2, fz), (fx + 1.03, Y0 + 1.2, fz), 0.045, 0.045, 'iron')
    mb.add(prim_sphere(0.37, 0.3, 0.37, 9, 4, y_max=0.0), 'iron', M((fx, Y0 + 0.8, fz)), smooth=45)
    mb.add(prim_cyl(0.38, 0.38, 0.05, 9), 'iron', M((fx, Y0 + 0.8, fz)), smooth=0)
    mb.add(prim_cyl(0.31, 0.31, 0.03, 9), 'slop', M((fx, Y0 + 0.78, fz)), smooth=0)
    for sx in (-1, 1):
        beam(mb, (fx + sx * 0.3, Y0 + 0.84, fz), (fx + sx * 0.05, Y0 + 1.16, fz), 0.016, 0.016, 'iron')
    # troncos de assento ao redor
    for (a, s) in ((200, 1.0), (125, 0.9), (275, 0.85)):
        x, z = polar(1.6, a)
        mb.add(prim_cyl(0.17, 0.17, 0.85 * s, 7, base=False), 'bark', M((fx + x, Y0 + 0.17, fz + z), (90, a + 90, 0)), smooth=40)
    return mb.build(mats, parent=root)


def build_loot(mats, root):
    """Baú aberto com ouro, sacos, caixas e barris (esquerda-frente), rack de armas e escudo (direita-frente)."""
    mb = MeshBuilder('Loot')
    cx, cz = 2.15, 1.15
    T = M((cx, Y0, cz), (0, -125, 0))
    mb.add(prim_box(0.95, 0.46, 0.58, base=True), 'wood', T, bevel=0.02)
    mb.add(prim_box(0.99, 0.07, 0.62), 'iron', T @ M((0, 0.4, 0)))
    mb.add(prim_box(0.95, 0.34, 0.06, base=True), 'wood', T @ M((0, 0.46, -0.3), (-105, 0, 0)), bevel=0.01)     # tampa aberta
    mb.add(prim_sphere(0.42, 0.15, 0.25, 7, 3, y_min=0.0), 'gold', T @ M((0, 0.43, 0)), smooth=0)
    for k in range(9):
        mb.add(prim_cyl(0.06, 0.06, 0.015, 6), 'gold', M((cx + 0.75 * math.cos(k * 2.1), Y0 + 0.01, cz + 0.6 + 0.4 * math.sin(k * 2.1))))
    # taça/coroa de ouro
    mb.add(prim_cyl(0.07, 0.11, 0.2, 7), 'gold', M((cx - 0.15, Y0 + 0.55, cz + 0.05)), smooth=30)
    # sacos, caixas empilhadas e barris
    for (x, z, s) in ((2.85, 0.55, 1.0), (2.55, 0.2, 0.8), (1.55, 2.25, 0.9)):
        mb.add(prim_sphere(0.28 * s, 0.32 * s, 0.26 * s, 7, 4, y_min=-0.2), 'leather', M((x, Y0 + 0.2, z)), smooth=60)
        mb.add(prim_cyl(0.07 * s, 0.07 * s, 0.07, 6), 'rope', M((x, Y0 + 0.42 * s + 0.05, z)))
    crate(mb, 2.55, Y0, 1.95, 0.55, 12, 'wood', 'wood_dark')
    crate(mb, 2.5, Y0 + 0.55, 1.9, 0.45, 40, 'wood', 'wood_dark')
    crate(mb, 1.9, Y0, 2.55, 0.5, -8, 'wood', 'wood_dark')
    barrel(mb, 2.4, Y0, -1.95, 0.3, 0.65, 'wood_dark', 'iron')
    barrel(mb, 2.0, Y0, -2.35, 0.26, 0.55, 'wood', 'iron')
    barrel(mb, 2.8, Y0, -1.45, 0.24, 0.5, 'wood', 'iron')
    # rack de armas: quadro com lanças, machado e escudo redondo pintado
    rx, rz = -2.3, 1.55
    for dz in (-0.55, 0.55):
        mb.add(prim_box(0.12, 1.4, 0.12, base=True), 'wood_dark', M((rx, Y0, rz + dz)), bevel=0.01)
    mb.add(prim_box(0.1, 0.1, 1.3), 'wood_dark', M((rx, Y0 + 1.05, rz)))
    mb.add(prim_box(0.1, 0.1, 1.3), 'wood_dark', M((rx, Y0 + 0.4, rz)))
    for k in range(4):
        z = rz - 0.42 + 0.28 * k
        log(mb, (rx, Y0 + 0.3, z), (rx - 0.04, Y0 + 2.0, z), 0.026, 'wood_light', n=5)
        if k % 2 == 0:
            mb.add(prim_cone(0.055, 0.3, 4), 'steel', M((rx - 0.04, Y0 + 2.0, z)))
        else:
            mb.add(prim_box(0.34, 0.26, 0.04, taper=(0.5, 1.0)), 'steel', M((rx - 0.04, Y0 + 1.9, z), (0, 90, 0)), bevel=0.006)
    mb.add(prim_cyl(0.34, 0.34, 0.06, 10), 'wood', M((rx + 0.34, Y0 + 0.42, rz + 0.15), (0, 0, 78)), smooth=20)
    mb.add(prim_cyl(0.22, 0.22, 0.07, 10), 'canvas', M((rx + 0.37, Y0 + 0.42, rz + 0.15), (0, 0, 78)), smooth=20)
    mb.add(prim_sphere(0.07, 0.07, 0.07, 5, 3), 'iron', M((rx + 0.42, Y0 + 0.42, rz + 0.15)), smooth=60)
    return mb.build(mats, parent=root)


def build_banners(mats, root, mb):
    # faixas esfarrapadas penduradas na verga do portão e nas toras do muro (laterais e fundo)
    gx, gz = polar(R, POST_A)
    gx = abs(gx)
    for sx in (-1, 1):
        O.tattered_banner(mb, sx * 0.62, Y0 + 3.2, gz + 0.22, 0, 0.5, 1.15)
    for (ang, hh) in ((115, 2.2), (255, 2.6), (180, 2.9)):
        x, z = polar(R + 0.3, ang)
        O.tattered_banner(mb, x, Y0 + hh, z, ang + 180, 0.7, 1.0)
    return mb.build(mats, parent=root)


def main():
    args = C.script_args()
    C.reset_scene()
    mats = C.make_paint_set(PALETTE)
    root = C.make_empty('BanditCamp')
    bmb = MeshBuilder('Anim_Banners')
    parts = [build_base(mats, root), build_palisade(mats, root), build_gate(mats, root), build_tower(mats, root, bmb),
             build_tent(mats, root, bmb), build_shelter(mats, root), build_fire(mats, root), build_loot(mats, root)]
    banners = build_banners(mats, root, bmb)
    # Smart UV com 70° (finish_building usa 50°): cada tora (prisma hexagonal, diedro 60°) vira UMA ilha em vez de seis,
    # o que reduz as ilhas de ~600 para ~150 e devolve área útil do atlas aos adereços
    _uv = C.uv_atlas
    C.uv_atlas = lambda objs, weights=None, margin=0.006, angle=60.0: _uv(objs, weights, margin, 70.0)
    finish_building(root, 'bandit_camp', 'bandit_camp.glb', 'bandit_camp_atlas', parts, banners,
                    {'Base': 0.45, 'Palisade': 0.85, 'Gate': 1.3, 'Tower': 1.0, 'Tent': 1.25, 'Shelter': 0.9, 'Fire': 1.0,
                     'Loot': 1.25, 'Anim_Banners': 0.8},
                    TEAM_DEFAULT, args, spawn=(0, 0, 5.4), rally=(0, 0, 7.0), game_dist=80)


if __name__ == '__main__':
    main()
