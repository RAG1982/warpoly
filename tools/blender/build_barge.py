"""
build_barge.py — Barcaça de transporte humana (tipo interno `barge`, raiz `Barge`) gerada 100% por script.

Referência: docs/refs/naval/human_ships_ref.png ("Human Transport Ship"): casco bojudo de tábuas claras com
borda marrom e faixa azul, convés de tábuas com cintas de ferro e escotilha de carga, castelo de popa com torre de
reboco, porta em arco azul e escada, guindaste de ferro e madeira com corda e gancho, rampa de proa de tábuas com
cintas, âncora pendurada, 3 canhões por bordo em portinholas com tampa, mastro de popa com bandeira.

Uso:
  blender -b --factory-startup --python tools/blender/build_barge.py -- [--no-render]

Hierarquia (proa = +Z, y = 0 na linha d'água, casco ~6 u):
  Barge (raiz)
  ├─ Hull   casco, convés, castelo de popa, pedestal do guindaste, âncora, canhões de bordo (Atlas + TeamColor: faixa)
  ├─ Crane  braço + cabrestante (pivô no topo do pedestal, gira em Y)
  │   └─ Hook  corda + gancho (pivô na ponta do braço)
  ├─ Ramp   rampa de proa (pivô na dobradiça de proa; repouso inclinada ~32° para baixo)
  ├─ Flag   bandeira do mastro de popa (TeamColor)
  └─ (sem Anim_Smoke: não tem chaminé)
"""
import os
import sys
import math

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
from mathutils import Matrix  # noqa: E402
import common as C  # noqa: E402
from common import M, MeshBuilder, prim_box, prim_cyl, prim_cone, prim_sphere, prim_extrude, prim_rings, ring_h, bezier  # noqa: E402
import ship_common as SH  # noqa: E402
from ship_common import V, Hull, beam, tube, orient, rect_tube, stud, cask, rope_coil, barrel_gun  # noqa: E402

TEAM_DEFAULT = '#2d56c0'
PALETTE = dict(SH.PALETTE)

L = 6.0
DECK = 0.82
HULL = dict(
    hw=[(0, 1.0), (0.05, 1.12), (0.2, 1.25), (0.55, 1.29), (0.8, 1.17), (0.93, 0.93), (0.98, 0.74), (1.0, 0.62)],
    yk=[(0, -0.30), (0.15, -0.42), (0.8, -0.42), (1.0, 0.15)],
    yg=[(0, 1.78), (0.1, 1.5), (0.3, 1.18), (0.7, 1.12), (0.9, 1.3), (1.0, 1.48)],
    bul=[(0, 0.3), (1, 0.3)],
)
PROF = [(1.0, 1.0), (1.0, 0.9), (1.05, 0.76), (1.06, 0.5), (1.04, 0.43), (0.9, 0.28), (0.6, 0.12), (0.0, 0.0)]
SEGS = ['wood_dark', 'wood_pale', 'wood_pale', 'team', 'wood', 'wood', 'wood']

POOP_Z0, POOP_Z1 = -2.95, -1.45
POOP_Y = 1.62
CRANE_P = (-0.5, DECK + 1.3, 1.85)


def make_hull():
    return Hull(L, 0.0, HULL['hw'], HULL['yk'], HULL['yg'], HULL['bul'], PROF, SEGS, n=26, t=0.14, deck='deck',
                inner='wood_dark', rail='wood_dark', cap='wood_dark', bottom='wood', flat_deck=DECK)


def build_hull(mats, root):
    mb = MeshBuilder('Hull')
    h = make_hull()
    h.build(mb)
    z0, z1 = h.z0, h.z1
    h.rail_cap(mb, 'wood', 0.3, 0.09, za=z0 + 0.03, zb=z1 - 0.05, bevel=0.02)
    # cintas de ferro no costado e rebites
    h.band(mb, 0.755, z0 + 0.1, z1 - 0.1, 0.05, 0.03, 'iron', n=24)
    h.band(mb, 0.52, z0 + 0.1, z1 - 0.1, 0.045, 0.03, 'iron', n=24)
    for z in (-2.3, -1.2, -0.1, 1.0, 2.1):
        for sg in (-1, 1):
            a, b = h.P(z, 0.9, sg), h.P(z, 0.28, sg)
            n = h.N(z, 0.6, sg)
            beam(mb, tuple(a + n * 0.015), tuple(b + n * 0.015), 0.05, 0.03, 'wood_dark', bevel=0.006)
    h.studs(mb, 0.755, z0 + 0.2, z1 - 0.3, 0.38, 'steel', r=0.024)
    # canhões de bordo: portinhola de ferro, tampa de madeira levantada, cano
    for z in (1.15, 0.25, -0.65):
        for sg in (-1, 1):
            p, n = h.P(z, 0.69, sg), h.N(z, 0.69, sg)
            m = SH.frame_at(p + n * 0.004, n)
            SH.port_frame(mb, m, 0.3, 0.3, 'iron', t=0.06, d=0.07)
            barrel_gun(mb, m @ M((0, 0, -0.05)), 0.42, 0.095, 'steel_dark', 'iron', n=8, flare=1.05)
            # tampa de madeira presa por dobradiça acima do vão
            mb.add(prim_box(0.46, 0.04, 0.34), 'wood_dark', m @ M((0, 0.26, 0.15), (-62, 0, 0)), bevel=0.008)
            for dx in (-0.13, 0.13):
                mb.add(prim_box(0.03, 0.044, 0.35), 'iron', m @ M((dx, 0.26, 0.15), (-62, 0, 0)))
            mb.add(prim_box(0.34, 0.05, 0.05), 'iron', m @ M((0, 0.2, 0.0)))
    # janelas com venezianas no costado de popa
    for sg in (-1, 1):
        for z in (-2.45, -1.9):
            p, n = h.P(z, 0.78, sg), h.N(z, 0.78, sg)
            m = SH.frame_at(p + n * 0.004, n)
            mb.add(prim_box(0.3, 0.3, 0.05), 'wood_dark', m @ M((0, 0, 0.02)), bevel=0.01)
            mb.add(prim_box(0.2, 0.22, 0.06), 'dark', m @ M((0, 0, 0.03)))
            for dx in (-0.1, 0.1):
                mb.add(prim_box(0.09, 0.22, 0.04), 'wood', m @ M((dx * 1.3, 0.0, 0.06), (0, 0, 0)), bevel=0.006)
            mb.add(prim_box(0.34, 0.03, 0.06), 'iron', m @ M((0, -0.17, 0.02)))
    # âncora de almirantado pendurada na proa (bordo de boreste) com corda até a bita
    p, n = h.P(1.95, 0.8, 1), h.N(1.95, 0.8, 1)
    m = SH.frame_at(p + n * 0.12, n)
    SH.anchor(mb, m @ M((0, -0.05, 0.0)), 0.95, 'iron')
    mb.add(prim_cyl(0.16, 0.16, 0.12, 10, base=False), 'iron', M((p.x + 0.05, p.y + 0.3, p.z + 0.1), (0, 0, 90)), smooth=40)
    # roda da proa e cavilhas (bitas)
    for (x, z) in ((0.7, 2.45), (-0.7, 2.45)):
        mb.add(prim_cyl(0.09, 0.075, 0.22, 8, base=True), 'iron', M((x, DECK, z)), smooth=40, bevel=0.01)
        mb.add(prim_cyl(0.13, 0.13, 0.04, 8, base=True), 'iron', M((x, DECK + 0.22, z)), smooth=40)
    rope_coil(mb, M((0.7, DECK + 0.02, 2.45)), 0.2, 0.04, 3)
    # --- convés: porão de carga (coaming de ferro com tampas de tábua e cintas)
    hz0, hz1 = -1.2, 1.55
    hx = 0.6
    yb = DECK
    for sg in (-1, 1):
        mb.add(prim_box(0.1, 0.16, hz1 - hz0 + 0.1), 'wood_dark', M((sg * hx, yb + 0.08, (hz0 + hz1) / 2)), bevel=0.012)
        mb.add(prim_box(0.12, 0.05, hz1 - hz0 + 0.14), 'iron', M((sg * hx, yb + 0.17, (hz0 + hz1) / 2)), bevel=0.008)
    for z in (hz0, hz1):
        mb.add(prim_box(hx * 2 + 0.1, 0.16, 0.1), 'wood_dark', M((0.0, yb + 0.08, z)), bevel=0.012)
        mb.add(prim_box(hx * 2 + 0.12, 0.05, 0.12), 'iron', M((0.0, yb + 0.17, z)), bevel=0.008)
    mb.add(prim_box(hx * 2, 0.08, hz1 - hz0), 'deck', M((0.0, yb + 0.12, (hz0 + hz1) / 2)), bevel=0.008)
    for z in (-0.6, 0.35, 1.25):
        mb.add(prim_box(hx * 2 + 0.05, 0.03, 0.09), 'iron', M((0.0, yb + 0.18, z)), bevel=0.006)
    for sg in (-1, 1):
        mb.add(prim_box(0.08, 0.03, hz1 - hz0 - 0.08), 'iron', M((sg * 0.22, yb + 0.18, (hz0 + hz1) / 2)), bevel=0.006)
    for (dx, z) in ((-0.28, -0.6), (0.28, -0.6), (-0.28, 1.25), (0.28, 1.25), (0.28, 0.35), (-0.28, 0.35)):
        stud(mb, V((dx, yb + 0.2, z)), (0, 1, 0), 0.03, 'steel_hi')
    # cintas de ferro longitudinais no convés de proa e popa (reforço)
    for sg in (-1, 1):
        mb.add(prim_box(0.07, 0.03, 0.9), 'iron', M((sg * 0.95, yb + 0.015, 0.2)), bevel=0.006)
    # --- castelo de popa: plataforma elevada de madeira, torre de reboco com porta em arco, escada, claraboia
    pz0, pz1 = POOP_Z0, POOP_Z1
    pw = 1.0
    mb.add(prim_box(pw * 2, POOP_Y - DECK, pz1 - pz0), 'wood_dark', M((0.0, (POOP_Y + DECK) / 2, (pz0 + pz1) / 2)), bevel=0.02)
    mb.add(prim_box(pw * 2 + 0.06, 0.06, pz1 - pz0 + 0.06), 'wood', M((0.0, POOP_Y + 0.0, (pz0 + pz1) / 2)), bevel=0.012)
    mb.add(prim_box(pw * 2 + 0.1, 0.1, 0.1), 'wood', M((0.0, POOP_Y - 0.05, pz1 + 0.04)), bevel=0.012)
    # painéis de tábua com moldura na fachada frontal do castelo (lados da torre) e cintas de ferro
    for sg in (-1, 1):
        mb.add(prim_box(0.58, POOP_Y - DECK - 0.1, 0.04), 'wood', M((sg * 0.7, (POOP_Y + DECK) / 2, pz1 + 0.025)), bevel=0.01)
        mb.add(prim_box(0.06, POOP_Y - DECK - 0.04, 0.05), 'iron', M((sg * 0.7, (POOP_Y + DECK) / 2, pz1 + 0.04)), bevel=0.006)
    # torre de reboco (creme) com porta em arco azul
    tw, td, th = 0.56, 0.6, 1.05
    ty = POOP_Y + 0.02
    mb.add(prim_box(tw * 2, th, td, taper=(0.96, 0.96)), 'cream', M((0.0, ty + th / 2, pz1 - td / 2 - 0.02)), bevel=0.03)
    # moldura de pedra azul-acinzentada dos cantos da torre
    for sg in (-1, 1):
        mb.add(prim_box(0.1, th, 0.1), 'steel', M((sg * (tw - 0.02), ty + th / 2, pz1 - 0.07)), bevel=0.012)
    # porta em arco (frente da torre, voltada para proa)
    zf = pz1 - 0.02
    arch = [(-0.2, 0.0), (0.2, 0.0), (0.2, 0.42), (0.14, 0.58), (0.0, 0.64), (-0.14, 0.58), (-0.2, 0.42)]
    mb.add(prim_extrude([(x * 1.3, y * 1.2) for (x, y) in arch], 0.05, axis='z'), 'team', M((0.0, ty, zf + 0.01)), bevel=0.01)
    mb.add(prim_extrude(arch, 0.07, axis='z'), 'wood_dark', M((0.0, ty + 0.0, zf + 0.012)), bevel=0.008)
    for dx in (-0.1, 0.1):
        mb.add(prim_box(0.02, 0.5, 0.075), 'iron', M((dx, ty + 0.3, zf + 0.012)))
    mb.add(prim_sphere(0.025, 0.025, 0.025, 5, 3), 'gold', M((0.12, ty + 0.3, zf + 0.06)), smooth=50)
    # janelas pequenas no topo da torre (frente)
    for dx in (-0.35, 0.35):
        SH.window(mb, M((dx, ty + 0.78, zf + 0.025)), 0.1, 0.16, frame='steel', glass='dark')
    # telhado de madeira da torre (bisel) + claraboia de tábuas com cintas
    mb.add(prim_box(tw * 2 + 0.14, 0.1, td + 0.16), 'wood_dark', M((0.0, ty + th + 0.05, pz1 - td / 2 - 0.02)), bevel=0.02)
    mb.add(prim_box(tw * 2 - 0.1, 0.1, td - 0.1, taper=(0.9, 0.9)), 'wood', M((0.0, ty + th + 0.15, pz1 - td / 2 - 0.02)), bevel=0.015)
    mb.add(prim_box(tw * 2 - 0.45, 0.06, td - 0.45), 'wood_light', M((0.0, ty + th + 0.23, pz1 - td / 2 - 0.02)), bevel=0.01)
    # restante do castelo (lado de popa): parede com janelas e corrimão
    for sx in (-1, 1):
        mb.add(prim_box(0.08, 0.34, pz1 - pz0), 'wood', M((sx * pw * 0.96, POOP_Y + 0.17, (pz0 + pz1) / 2)), bevel=0.012)
    mb.add(prim_box(pw * 2, 0.34, 0.08), 'wood', M((0.0, POOP_Y + 0.17, pz0 + 0.04)), bevel=0.012)
    # escada lateral de madeira (boreste) do convés ao castelo
    SH.stairs(mb, (0.78, DECK + 0.05, pz1 + 0.75), (0.78, POOP_Y + 0.02, pz1 + 0.02), 0.34, 7)
    for sx in (0.6, 0.96):
        beam(mb, (sx, DECK + 0.12, pz1 + 0.78), (sx, POOP_Y + 0.5, pz1 + 0.02), 0.04, 0.04, 'wood_dark')
    # mastro de popa com bandeira + aro de ferro + topo dourado
    mp = V((-0.78, POOP_Y, pz0 + 0.3))
    SH.mast(mb, mp, mp + V((0, 1.6, 0)), 0.07, 0.055, 'wood_dark', 'iron', n=8, bands=(0.1, 0.45, 0.8))
    mb.add(prim_sphere(0.08, 0.08, 0.08, 7, 4), 'gold', M(tuple(mp + V((0, 1.65, 0)))), smooth=60)
    # base do guindaste: placa de ferro, coluna de madeira com cintas, engrenagem lateral
    cx, cy, cz = CRANE_P
    mb.add(prim_box(0.62, 0.1, 0.62), 'iron', M((cx, DECK + 0.05, cz)), bevel=0.02)
    mb.add(prim_box(0.46, 0.08, 0.46), 'steel_dark', M((cx, DECK + 0.14, cz)), bevel=0.015)
    mb.add(prim_box(0.3, cy - DECK - 0.15, 0.34, taper=(0.85, 0.9)), 'wood', M((cx, (cy + DECK + 0.15) / 2 - 0.1, cz)), bevel=0.02)
    for sg in (-1, 1):
        mb.add(prim_box(0.05, 0.9, 0.3), 'iron', M((cx + sg * 0.16, DECK + 0.65, cz)), bevel=0.008)
    for dy in (0.35, 0.8):
        mb.add(prim_box(0.38, 0.06, 0.4), 'iron', M((cx, DECK + dy, cz)), bevel=0.01)
    # engrenagem + catraca na lateral
    mb.add(prim_extrude(SH.S.cog(0.12, 8, tooth_h=0.04), 0.06, axis='x'), 'iron', M((cx + 0.2, DECK + 0.9, cz - 0.05)), bevel=0.006)
    mb.add(prim_cyl(0.05, 0.05, 0.08, 8, base=False), 'steel', M((cx + 0.25, DECK + 0.9, cz - 0.05), (0, 0, 90)))
    return mb.build(mats, parent=root)


def build_crane(mats, root):
    """Braço do guindaste (pivô no topo da coluna), cabrestante e talha; Hook é filho."""
    mb = MeshBuilder('Crane')
    # cabeçote giratório de ferro
    mb.add(prim_cyl(0.2, 0.2, 0.14, 10, base=True), 'iron', M((0, -0.05, 0)), bevel=0.01, smooth=40)
    mb.add(prim_box(0.34, 0.12, 0.34), 'steel_dark', M((0, 0.1, 0)), bevel=0.015)
    # braço de madeira inclinado (de trás para frente/para cima) com cintas e reforços
    tip = V((0.32, 0.9, 1.15))
    a = V((0.0, 0.12, -0.1))
    beam(mb, tuple(a), tuple(tip), 0.24, 0.2, 'wood', bevel=0.02)
    for t in (0.2, 0.5, 0.85):
        p = a.lerp(tip, t)
        mb.add(prim_box(0.28, 0.26, 0.05), 'iron', Matrix.Translation(p) @ orient(tip - a), bevel=0.008)
    # escora (diagonal) do braço
    beam(mb, (0.0, 0.02, 0.2), tuple(a.lerp(tip, 0.62) + V((0, -0.08, 0))), 0.09, 0.09, 'wood_dark', bevel=0.01)
    # polia da ponta (roda de ferro entre duas placas)
    for sg in (-1, 1):
        mb.add(prim_box(0.04, 0.22, 0.2), 'iron', M(tuple(tip + V((sg * 0.12, -0.05, 0.03)))), bevel=0.008)
    mb.add(prim_cyl(0.11, 0.11, 0.1, 10, base=False), 'steel', M(tuple(tip + V((0, -0.08, 0.04))), (0, 0, 90)), smooth=40)
    mb.add(prim_cyl(0.04, 0.04, 0.3, 6, base=False), 'steel_dark', M(tuple(tip + V((0, -0.08, 0.04))), (0, 0, 90)))
    # corda do braço até o cabrestante (tambor atrás)
    mb.add(prim_cyl(0.11, 0.11, 0.3, 10, base=False), 'rope', M((0.0, 0.05, -0.28), (0, 0, 90)), smooth=40)
    for sg in (-1, 1):
        mb.add(prim_cyl(0.15, 0.15, 0.04, 10, base=False), 'iron', M((sg * 0.17, 0.05, -0.28), (0, 0, 90)), smooth=40)
    tube(mb, [tuple(tip + V((0, -0.03, 0.07))), tuple(a.lerp(tip, 0.5) + V((0, 0.14, 0.0))), (0.0, 0.1, -0.2)], [0.025] * 3, 'rope', n=5, smooth=60)
    # manivela
    beam(mb, (0.2, 0.05, -0.28), (0.45, 0.25, -0.28), 0.05, 0.05, 'wood_dark')
    mb.add(prim_sphere(0.05, 0.05, 0.05, 6, 3), 'wood_light', M((0.45, 0.27, -0.28)), smooth=60)
    return mb.build(mats, parent=root, location=CRANE_P), tip


def build_hook(mats, parent, tip):
    mb = MeshBuilder('Hook')
    # corda caindo da polia
    tube(mb, [(0, -0.06, 0.04), (0, -0.7, 0.04), (0, -1.05, 0.04)], [0.028] * 3, 'rope', n=6, smooth=60)
    mb.add(prim_box(0.12, 0.16, 0.1), 'iron', M((0, -1.12, 0.04)), bevel=0.012)
    mb.add(torus_ring(0.05), 'iron', M((0, -1.0, 0.04), (0, 0, 0)), smooth=60)
    # gancho curvo de ferro
    pts = bezier((0, -1.2, 0.04), (0, -1.5, 0.04), (0.2, -1.45, 0.04), 4) + bezier((0.2, -1.45, 0.04), (0.36, -1.4, 0.04), (0.3, -1.22, 0.04), 3)[1:]
    tube(mb, pts, [0.04, 0.04, 0.04, 0.04, 0.035, 0.03, 0.02, 0.012], 'iron', n=6, smooth=60)
    return mb.build(mats, parent=parent, location=tuple(tip))


def torus_ring(r):
    from ship_common import torus
    return torus(r, r * 0.35, 10, 5)


def build_ramp(mats, root):
    """Rampa de proa de tábuas com cintas de ferro, correntes e bordas; pivô na dobradiça."""
    mb = MeshBuilder('Ramp')
    X = SH.S.Xf(mb, M((0, 0, 0), (32, 0, 0)))
    Lr, W = 1.75, 1.0
    X.add(prim_box(W, 0.09, Lr), 'wood', M((0, 0, Lr / 2)), bevel=0.012)
    X.add(prim_box(W - 0.06, 0.03, Lr - 0.04), 'deck', M((0, 0.05, Lr / 2)), bevel=0.006)
    for sg in (-1, 1):
        X.add(prim_box(0.08, 0.1, Lr + 0.02), 'wood_dark', M((sg * (W / 2 + 0.01), 0.04, Lr / 2)), bevel=0.012)
        X.add(prim_box(0.1, 0.06, Lr), 'iron', M((sg * (W / 2 + 0.01), 0.1, Lr / 2)), bevel=0.01)
    for z in (0.08, 0.5, 0.95, 1.4, Lr - 0.07):
        X.add(prim_box(W, 0.045, 0.12), 'iron', M((0, 0.075, z)), bevel=0.008)
        for dx in (-0.4, -0.15, 0.15, 0.4):
            X.add(prim_cyl(0.024, 0.016, 0.03, 5, base=True), 'steel_hi', M((dx, 0.095, z)))
    # travessas (degraus antiderrapantes) entre as cintas
    for z in (0.3, 0.72, 1.17, 1.6):
        X.add(prim_box(W - 0.2, 0.03, 0.035), 'wood_dark', M((0, 0.07, z)))
    # correntes de içar (do bordo da rampa à proa do casco)
    for sg in (-1, 1):
        SH.chain(X, (sg * (W / 2 + 0.01), 0.1, Lr - 0.1), (sg * (W / 2 + 0.06), 0.62, -0.1), links=7, r=0.03)
    return mb.build(mats, parent=root, location=(0.0, 1.0, 3.07))


def build_flag(mats, root):
    mb = MeshBuilder('Flag')
    X = SH.S.Xf(mb, M((0, 0, 0), (0, 90, 0)))
    SH.flag(X, 1.3, 0.62, 'team', 'gold', True, amp=0.07, fx=3.0, ph=0.2, tail=0.35)
    return mb.build(mats, parent=root, location=(-0.78, POOP_Y + 1.28, POOP_Z0 + 0.3))


def main():
    args = C.script_args()
    C.reset_scene()
    mats = C.make_paint_set(PALETTE)
    root = C.make_empty('Barge')
    hull = build_hull(mats, root)
    crane, tip = build_crane(mats, root)
    hook = build_hook(mats, crane, tip)
    ramp = build_ramp(mats, root)
    flag = build_flag(mats, root)
    parts = [hull, crane, hook, ramp, flag]
    SH.finish_ship('barge', 'barge.glb', 'barge_atlas', root, parts,
                   {'Hull': 1.0, 'Crane': 0.8, 'Hook': 0.5, 'Ramp': 0.8, 'Flag': 0.5},
                   TEAM_DEFAULT, args, tex=int(os.environ.get('ATLAS', 512)), game_dist=17.0)


if __name__ == '__main__':
    main()
