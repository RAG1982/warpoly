"""
ship_common.py — helpers compartilhados pelos navios humanos (Fragata, Barcaça, Petroleiro, Couraçado).
Tudo em coordenadas do jogo (x direita, y cima, +z proa), como `common.py`. y = 0 é a linha d'água.

Contém: paleta comum, casco por loft de seções (`Hull`), perfis em fita sobre o casco, canhões, torres,
barris, rolos de corda, escudos, brasão, velas curvas, mastros, bandeiras, âncora, tubulações e o
acabamento (UV atlas -> bake -> materiais -> export -> renders sobre água).
"""
import os
import math
from mathutils import Vector, Matrix
import common as C
from common import (MeshBuilder, M, prim_box, prim_rings, ring_h, prim_cyl, prim_cone,  # noqa: F401
                    prim_sphere, prim_extrude, limb_rings, bezier)
from bld_common import beam, tube, log, orient, xf, bbox_game  # noqa: F401
import siege_common as S  # noqa: F401
from siege_common import chain, lash, tail_strip, wave  # noqa: F401

V = Vector
ZOOM = float(os.environ.get('ZOOM', 0.74))

# --------------------------------------------------------------------------------------------------------------
# Paleta comum (materiais de pintura para o bake)
# --------------------------------------------------------------------------------------------------------------
PALETTE = {
    'steel': dict(base='#8791a3', var='#4a5263', var_scale=7.0, var_amt=0.75, fine=0.08, top=0.35,
                  edge='#f4f8ff', edge_amt=1.0, edge_r=0.02, edge_gain=12.0, ao=(0.25, 0.6)),
    'steel_hi': dict(base='#c9d2df', var='#9da7b6', var_scale=8.0, fine=0.06, top=0.4,
                     edge='#ffffff', edge_amt=1.0, edge_r=0.015, edge_gain=12.0, ao=(0.2, 0.5)),
    'steel_dark': dict(base='#474e5d', var='#2f3540', var_scale=6.0, fine=0.1, top=0.3,
                       edge='#c4ccd9', edge_amt=0.9, edge_r=0.02, edge_gain=12.0, ao=(0.25, 0.65)),
    'iron': dict(base='#3a3d46', var='#25272e', var_scale=4.0, fine=0.1, top=0.3, edge='#a7aebb', edge_amt=0.8,
                 edge_r=0.015, edge_gain=12.0, ao=(0.25, 0.6)),
    'gold': dict(base='#e3a522', var='#b5780f', var_scale=9.0, var_amt=0.7, fine=0.06, top=0.4,
                 edge='#ffe9a0', edge_amt=1.0, edge_r=0.018, edge_gain=12.0, ao=(0.2, 0.5)),
    'leather': dict(base='#6d4022', var='#4c2912', var_scale=6.0, fine=0.12, top=0.2,
                    edge='#a8703c', edge_amt=0.5, edge_r=0.02, ao=(0.25, 0.6)),
    'wood': dict(base='#8b5a2d', var='#5f3c1d', var_scale=2.2, var_amt=0.8, fine=0.10, top=0.2, pattern='planks',
                 mapping='box', pw=1.9, ph=0.17, mortar='#2a190c', mortar_size=0.016, edge='#cfa56c', edge_amt=0.45,
                 edge_r=0.02, ao=(0.35, 0.55), streaks=(2.5, 0.5, 0.18)),
    'wood_dark': dict(base='#5b3a1f', var='#3d2813', var_scale=2.5, fine=0.1, top=0.2, edge='#a07a4c', edge_amt=0.5,
                      edge_r=0.02, ao=(0.3, 0.6), streaks=(2.5, 0.5, 0.16)),
    'wood_light': dict(base='#b98a4c', var='#8f6633', var_scale=2.4, fine=0.09, top=0.25, edge='#e8c48c',
                       edge_amt=0.5, edge_r=0.02, ao=(0.3, 0.5), streaks=(2.5, 0.5, 0.16)),
    'wood_pale': dict(base='#dccfae', var='#b4a27a', var_scale=2.4, var_amt=0.8, fine=0.10, top=0.25, pattern='planks',
                      mapping='box', pw=1.7, ph=0.2, mortar='#5a4528', mortar_size=0.018, edge='#fff4d8', edge_amt=0.4,
                      edge_r=0.02, ao=(0.35, 0.55), streaks=(2.5, 0.5, 0.12)),
    'deck': dict(base='#a3733d', var='#7a5129', var_scale=2.0, var_amt=0.8, fine=0.10, top=0.3, pattern='planks_v',
                 mapping='box', pw=1.5, ph=0.2, mortar='#2b1a0d', mortar_size=0.02, edge='#d8b078', edge_amt=0.35,
                 edge_r=0.02, ao=(0.4, 0.6)),
    'cream': dict(base='#e6dcc0', var='#c3b793', var_scale=3.5, fine=0.08, top=0.35, edge='#fffaf0', edge_amt=0.7,
                  edge_r=0.02, ao=(0.3, 0.55)),
    'sail': dict(base='#ebdfbd', var='#c9b98c', var_scale=3.0, var_amt=0.9, fine=0.12, fine_scale=40.0, top=0.25,
                 edge='#fff6dc', edge_amt=0.4, edge_r=0.03, ao=(0.35, 0.5)),
    'team': dict(base='#c4bdb1', var='#9d9589', var_scale=3.0, var_amt=0.8, fine=0.1, fine_scale=40.0, top=0.25,
                 edge='#e4ded4', edge_amt=0.4, edge_r=0.03, ao=(0.3, 0.55), team=True),
    'team_plates': dict(base='#c9c9d0', var='#a6a6b0', var_scale=5.0, var_amt=0.8, fine=0.1, top=0.3,
                        pattern='bricks', mapping='box', pw=1.25, ph=0.6, mortar='#6c6c78', mortar_size=0.014,
                        brick_dark=0.9, brick_lite=1.05, brick_tint_amt=0.3,
                        edge='#f0f0f6', edge_amt=0.7, edge_r=0.02, edge_gain=12.0, ao=(0.3, 0.6), team=True),
    'team_dark': dict(base='#8f8f9a', var='#6c6c78', var_scale=5.0, var_amt=0.8, fine=0.1, top=0.2,
                      pattern='bricks', mapping='box', pw=1.25, ph=0.6, mortar='#4a4a55', mortar_size=0.014,
                      edge='#cfcfd8', edge_amt=0.5, edge_r=0.02, ao=(0.3, 0.7), team=True),
    'rope': dict(base='#b49865', var='#8a7040', var_scale=12.0, fine=0.12, top=0.2),
    'glass': dict(base='#7fb0d4', var='#3f6f9a', var_scale=3.0, fine=0.05, top=0.3, edge='#e8f4ff', edge_amt=0.7,
                  edge_r=0.02),
    'dark': dict(base='#0b0a0d', var='#0b0a0d'),
    'stone': dict(base='#9a9a96', var='#6f6f6c', var_scale=3.0, var_amt=0.8, fine=0.1, top=0.3, pattern='bricks',
                  mapping='box', pw=0.5, ph=0.26, mortar='#4a4944', mortar_size=0.03, edge='#d6d3c8',
                  edge_amt=0.5, edge_r=0.025, ao=(0.3, 0.6)),
    'rust': dict(base='#c4501f', var='#2a1913', var_scale=3.2, var_amt=0.8, fine=0.14, top=0.25, pattern='bricks',
                 mapping='box', pw=1.5, ph=0.75, mortar='#34190e', mortar_size=0.016, brick_dark=0.88,
                 brick_lite=1.06, brick_tint_amt=0.5, brick_tint='#7d2d12', edge='#e9884f', edge_amt=0.55,
                 edge_r=0.02, edge_gain=10.0, ao=(0.35, 0.6)),
    'rust_black': dict(base='#2b1d17', var='#8a3d19', var_scale=4.5, var_amt=0.55, fine=0.16, top=0.15,
                       pattern='bricks', mapping='box', pw=1.5, ph=0.75, mortar='#120b08', mortar_size=0.016,
                       edge='#7a4a30', edge_amt=0.5, edge_r=0.02, ao=(0.35, 0.6)),
    'rust_red': dict(base='#9c2d17', var='#4a170c', var_scale=4.0, var_amt=0.7, fine=0.14, top=0.25, edge='#d97b4c',
                     edge_amt=0.6, edge_r=0.02, ao=(0.3, 0.6)),
    'tank': dict(base='#d4561f', var='#6e2210', var_scale=3.4, var_amt=0.75, fine=0.14, top=0.35, edge='#f5a06a',
                 edge_amt=0.5, edge_r=0.03, edge_gain=9.0, ao=(0.35, 0.6), streaks=(1.2, 3.0, 0.22)),
    'cabin': dict(base='#cdbfa4', var='#7e4a2c', var_scale=3.6, var_amt=0.65, fine=0.14, top=0.3, pattern='planks',
                  mapping='box', pw=1.6, ph=0.3, mortar='#86745a', mortar_size=0.01, edge='#f2e8d2', edge_amt=0.5,
                  edge_r=0.02, ao=(0.3, 0.6)),
    'hose': dict(base='#5d5a3a', var='#35341f', var_scale=6.0, fine=0.12, top=0.3, edge='#8b8a60', edge_amt=0.5,
                 edge_r=0.02, ao=(0.3, 0.6)),
    'red': dict(base='#c0301f', var='#7a1a10', var_scale=5.0, fine=0.08, top=0.3, edge='#f08a70', edge_amt=0.6,
                edge_r=0.02, ao=(0.3, 0.5)),
    'blue': dict(base='#2e55b0', var='#1c3a80', var_scale=5.0, fine=0.08, top=0.3, edge='#9bb8f0', edge_amt=0.6,
                 edge_r=0.02, ao=(0.3, 0.5)),
    'brass': dict(base='#b98a2c', var='#8a5f16', var_scale=6.0, var_amt=0.7, fine=0.08, top=0.4, edge='#f2cf72',
                  edge_amt=0.9, edge_r=0.02, edge_gain=12.0, ao=(0.25, 0.55)),
    'orange': dict(base='#e0562a', var='#a83214', var_scale=4.0, fine=0.08, top=0.3, edge='#ffb08a', edge_amt=0.6,
                   edge_r=0.02, ao=(0.3, 0.5)),
}


# contraste pintado à mão: AO mais forte e degradê de sujeira/umidade perto da água (coordenadas mundo: y do jogo)
for _k, _p in PALETTE.items():
    if 'ao' in _p:
        _p['ao'] = (max(_p['ao'][0], 0.35), min(_p['ao'][1] + 0.15, 0.85))
for _k in ('wood', 'wood_dark', 'wood_light', 'wood_pale', 'team_plates', 'team_dark', 'steel', 'steel_dark', 'rust',
           'rust_red', 'rust_black', 'cream', 'cabin', 'stone', 'tank', 'gold', 'brass'):
    if _k in PALETTE:
        PALETTE[_k].setdefault('grad', (-0.6, 1.9, 0.30))


# --------------------------------------------------------------------------------------------------------------
# Curvas e utilitários
# --------------------------------------------------------------------------------------------------------------
def curve(tab):
    """Interpolação cúbica de Hermite (tangentes de Catmull-Rom) sobre [(x, y)...]."""
    xs = [p[0] for p in tab]
    ys = [p[1] for p in tab]
    n = len(xs)
    ms = []
    for k in range(n):
        a, b = max(k - 1, 0), min(k + 1, n - 1)
        ms.append((ys[b] - ys[a]) / (xs[b] - xs[a]) if xs[b] != xs[a] else 0.0)

    def f(x):
        x = min(max(x, xs[0]), xs[-1])
        i = 0
        while i < n - 2 and x > xs[i + 1]:
            i += 1
        h = xs[i + 1] - xs[i]
        t = (x - xs[i]) / h
        t2, t3 = t * t, t * t * t
        return ((2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * ms[i]
                + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * ms[i + 1])
    return f


def lerp(a, b, t):
    return a + (b - a) * t


def rect_tube(mb, pts, w, h, mat, normals=None, up=(0, 1, 0), smooth=0, bevel=0.0, cap=True, hs=None, ws=None):
    """Fita retangular ao longo de pts. Em cada ponto: eixo da fita (direção), normal n (up ou normals[i]);
    largura w ao longo de d × n, espessura h ao longo de n (fita assentada sobre a superfície: centro em pts)."""
    pts = [V(p) for p in pts]
    rings = []
    for i, p in enumerate(pts):
        if i == 0:
            d = pts[1] - pts[0]
        elif i == len(pts) - 1:
            d = pts[-1] - pts[-2]
        else:
            d = pts[i + 1] - pts[i - 1]
        d.normalize()
        n = V(normals[i]) if normals is not None else V(up)
        side = d.cross(n)
        if side.length < 1e-5:
            side = d.cross(V((1, 0, 0)))
        side.normalize()
        n = side.cross(d).normalized()
        hw = (ws[i] if ws else w) / 2
        hh = (hs[i] if hs else h) / 2
        rings.append([tuple(p - side * hw - n * hh), tuple(p + side * hw - n * hh),
                      tuple(p + side * hw + n * hh), tuple(p - side * hw + n * hh)])
    return mb.add(prim_rings(rings, cap0=cap, cap1=cap), mat, smooth=smooth, bevel=bevel)


def torus(R, r, m=14, n=6):
    """Toro no plano XZ (eixo Y)."""
    verts, faces = [], []
    for i in range(m):
        a = 2 * math.pi * i / m
        c, s = math.cos(a), math.sin(a)
        for k in range(n):
            b = 2 * math.pi * k / n
            rr = R + r * math.cos(b)
            verts.append((rr * c, r * math.sin(b), rr * s))
    for i in range(m):
        j = (i + 1) % m
        for k in range(n):
            k2 = (k + 1) % n
            faces.append((i * n + k, i * n + k2, j * n + k2, j * n + k))
    return verts, faces


def grid_slab(fn, nu, nv, u0=0.0, u1=1.0, v0=0.0, v1=1.0, thick=0.03, off=0.0):
    """Painel curvo grosso: fn(u, v) -> (x, y, z); espessura ao longo de -z; off desloca em +z."""
    front, back = [], []
    for j in range(nv + 1):
        v = lerp(v0, v1, j / nv)
        for i in range(nu + 1):
            u = lerp(u0, u1, i / nu)
            x, y, z = fn(u, v)
            front.append((x, y, z + off))
            back.append((x, y, z + off - thick))
    n = (nu + 1) * (nv + 1)
    faces = []
    for j in range(nv):
        for i in range(nu):
            a = j * (nu + 1) + i
            faces.append((a, a + 1, a + nu + 2, a + nu + 1))
            faces.append((n + a, n + a + nu + 1, n + a + nu + 2, n + a + 1))

    def idx(i, j):
        return j * (nu + 1) + i
    border = [idx(i, 0) for i in range(nu + 1)] + [idx(nu, j) for j in range(1, nv + 1)] + \
             [idx(i, nv) for i in range(nu - 1, -1, -1)] + [idx(0, j) for j in range(nv - 1, 0, -1)]
    for k in range(len(border)):
        a, c = border[k], border[(k + 1) % len(border)]
        faces.append((a, c, n + c, n + a))
    return front + back, faces


# --------------------------------------------------------------------------------------------------------------
# Casco
# --------------------------------------------------------------------------------------------------------------
class Hull:
    """Casco por loft de seções transversais (anel fechado: casco externo + parede interna + convés).

    hw, yk, yg, bul = tabelas [(s, valor)] com s em [0 (popa), 1 (proa)]: meia-boca, quilha, borda (gunwale) e
    altura da amurada. prof = [(xf, tf)] do topo (tf = 1) até a quilha (0, 0); seg_mats = material de cada
    segmento do perfil (len(prof) - 1)."""

    def __init__(self, L, zc, hw, yk, yg, bul, prof, seg_mats, n=28, t=0.12, deck='deck', inner='wood_dark',
                 rail='wood_dark', cap='wood', bottom=None, flat_deck=None, jitter=None):
        self.L, self.z0, self.z1 = L, zc - L / 2, zc + L / 2
        self.fhw, self.fyk, self.fyg, self.fbul = curve(hw), curve(yk), curve(yg), curve(bul)
        self.prof, self.seg_mats = prof, seg_mats
        self.t, self.n = t, n
        self.deck_m, self.inner_m, self.rail_m, self.cap_m = deck, inner, rail, cap
        self.bottom = bottom
        self.tfs = [p[1] for p in prof]
        self.flat_deck = flat_deck   # y fixo do convés (None = yg - bul)
        self.jitter = jitter         # f(z) -> deslocamento de tf (bordas irregulares entre bandas de material)

    # --- geometria paramétrica
    def s(self, z):
        return min(max((z - self.z0) / self.L, 0.0), 1.0)

    def hw(self, z):
        return max(self.fhw(self.s(z)), 0.02)

    def top(self, z):
        return self.fyg(self.s(z))

    def keel(self, z):
        return self.fyk(self.s(z))

    def deck(self, z):
        return self.flat_deck if self.flat_deck is not None else self.top(z) - self.fbul(self.s(z))

    def xf(self, tf):
        pr = self.prof
        for k in range(len(pr) - 1):
            if pr[k + 1][1] <= tf <= pr[k][1]:
                a, b = pr[k], pr[k + 1]
                u = (tf - b[1]) / (a[1] - b[1]) if a[1] != b[1] else 0.0
                return lerp(b[0], a[0], u)
        return pr[0][0] if tf > 1 else pr[-1][0]

    def P(self, z, tf, sign=1):
        """Ponto da superfície externa na altura relativa tf (0 quilha, 1 borda)."""
        yk, yg = self.keel(z), self.top(z)
        return V((sign * self.xf(tf) * self.hw(z), yk + tf * (yg - yk), z))

    def N(self, z, tf, sign=1):
        e = 0.01
        t0, t1 = max(tf - e, 0.0), min(tf + e, 1.0)
        dtf = self.P(z, t1, sign) - self.P(z, t0, sign)
        dz = self.P(z + e, tf, sign) - self.P(z - e, tf, sign)
        n = dz.cross(dtf)
        if n.x * sign < 0:
            n = -n
        return n.normalized()

    def ring(self, z):
        hw, yk, yg = self.hw(z), self.keel(z), self.top(z)
        yd = self.deck(z)
        te = min(self.t, hw * 0.45)
        pts = []
        for (xf, tf) in self.prof:
            pts.append((-xf * hw, yk + tf * (yg - yk), z))
        for (xf, tf) in reversed(self.prof[:-1]):
            pts.append((xf * hw, yk + tf * (yg - yk), z))
        tfd = (yd - yk) / (yg - yk)
        xd = self.xf(min(max(tfd, 0.0), 1.0)) * hw - te
        xt = hw - te
        pts.append((xt, yg, z))
        pts.append((xd, yd, z))
        pts.append((-xd, yd, z))
        pts.append((-xt, yg, z))
        return pts

    def stations(self):
        n = self.n
        out = []
        for i in range(n + 1):
            u = i / n
            s = 0.5 * (1 - math.cos(math.pi * u)) * 0.6 + u * 0.4
            out.append(self.z0 + s * self.L)
        return out

    def _matfn(self, c, nrm):
        cx, cy, cz = c
        nx, ny, nz = nrm
        yg = self.top(cz)
        if abs(nz) > 0.8:
            return self.cap_m
        if ny > 0.7:
            return self.rail_m if cy > yg - 0.02 else self.deck_m
        if ny < -0.6 and self.bottom:
            return self.bottom
        outer = nx * (1 if cx >= 0 else -1) > 0 or ny < -0.3
        if not outer:
            return self.inner_m
        yk = self.keel(cz)
        tf = (cy - yk) / max(yg - yk, 1e-4)
        if self.jitter:
            tf = min(max(tf + self.jitter(cz, tf), 0.0), 1.0)
        for k in range(len(self.prof) - 1):
            if self.tfs[k + 1] - 1e-6 <= tf <= self.tfs[k] + 1e-6:
                return self.seg_mats[k]
        return self.seg_mats[-1]

    def build(self, mb, smooth=38, mat_fn=None):
        rings = [self.ring(z) for z in self.stations()]
        return mb.add(prim_rings(rings, cap0=True, cap1=True), self.cap_m, smooth=smooth, mat_fn=mat_fn or self._matfn)

    # --- fitas sobre o casco
    def line(self, tf, za, zb, n=16, off=0.0, sign=1, zs=None):
        """Pontos e normais de uma linha de nível sobre a superfície externa (deslocada `off` para fora)."""
        pts, nrm = [], []
        zl = zs or [lerp(za, zb, i / n) for i in range(n + 1)]
        for z in zl:
            p, nn = self.P(z, tf, sign), self.N(z, tf, sign)
            pts.append(p + nn * off)
            nrm.append(nn)
        return pts, nrm

    def band(self, mb, tf, za, zb, w, h, mat, n=16, sign=None, bevel=0.0, smooth=0):
        """Fita de material sobre a superfície, nos dois bordos (sign=None) ou um deles."""
        for sg in ((-1, 1) if sign is None else (sign,)):
            pts, nrm = self.line(tf, za, zb, n, off=h * 0.45, sign=sg)
            rect_tube(mb, pts, w, h, mat, normals=nrm, bevel=bevel, smooth=smooth)

    def rail_cap(self, mb, mat, w, h, za=None, zb=None, lift=0.0, n=24, bevel=0.01):
        """Capa do gunwale sobre a amurada (fita contínua nos dois bordos)."""
        za = self.z0 + 0.02 if za is None else za
        zb = self.z1 - 0.02 if zb is None else zb
        for sg in (-1, 1):
            pts = []
            for i in range(n + 1):
                z = lerp(za, zb, i / n)
                hw = self.hw(z)
                te = min(self.t, hw * 0.45)
                pts.append(V((sg * (hw - te / 2), self.top(z) + h / 2 + lift, z)))
            rect_tube(mb, pts, w, h, mat, bevel=bevel)

    def studs(self, mb, tf, za, zb, step, mat, r=0.028, off=0.0, sign=None, jitter=0.0):
        count = max(int((zb - za) / step), 1)
        for sg in ((-1, 1) if sign is None else (sign,)):
            for i in range(count + 1):
                z = lerp(za, zb, i / count)
                if z < self.z0 + 0.1 or z > self.z1 - 0.1:
                    continue
                p, nn = self.P(z, tf, sg), self.N(z, tf, sg)
                stud(mb, p + nn * off, nn, r, mat)


def frame_at(p, n, up=(0, 1, 0)):
    """Matriz com origem em p, +z local = n e +y local o mais próximo possível de `up` (peças coladas ao casco)."""
    z = V(n).normalized()
    y = V(up) - z * V(up).dot(z)
    if y.length < 1e-4:
        y = V((0, 0, 1)) - z * z.z
    y.normalize()
    x = y.cross(z).normalized()
    m = Matrix.Identity(4)
    for i in range(3):
        m[i][0], m[i][1], m[i][2], m[i][3] = x[i], y[i], z[i], V(p)[i]
    return m


def deck_box(mb, T, w, h, d, top='deck', side='wood', bevel=0.02, **kw):
    """Caixa com material de convés no topo e de costado nos lados (origem no centro)."""
    def fn(c, n):
        return top if n[1] > 0.7 else side
    return mb.add(prim_box(w, h, d, **kw), side, T, bevel=bevel, mat_fn=fn)


def stud(mb, p, n, r, mat, h=None):
    """Rebite/prego: cilindro curto de 5 lados apontado para n."""
    h = h or r * 0.9
    mb.add(prim_cone(r, h, 4), mat, Matrix.Translation(V(p)) @ orient(n))


def stud_line(mb, pts, nrm, mat, r=0.028, step=1):
    for i in range(0, len(pts), step):
        stud(mb, pts[i], nrm[i], r, mat)


# --------------------------------------------------------------------------------------------------------------
# Armamento e peças de convés
# --------------------------------------------------------------------------------------------------------------
def barrel_gun(mb, T, length=0.7, r=0.105, mat='steel_dark', ring_mat='gold', n=8, flare=1.0):
    """Cano de canhão: eixo em +z local (origem na culatra); cascavel, reforços, boca alargada com aro."""
    pts = [(0, 0, -0.07 * length), (0, 0, 0.0), (0, 0, 0.18 * length), (0, 0, 0.62 * length), (0, 0, 0.86 * length),
           (0, 0, 0.93 * length), (0, 0, length)]
    rad = [r * 0.45, r * 1.0, r * 1.02, r * 0.86, r * 0.84, r * 1.05 * flare, r * 1.12 * flare]
    rings = limb_rings([tuple(T @ V(p)) for p in pts], rad, n, up=tuple((T.to_3x3() @ V((0, 1, 0)))))
    mb.add(prim_rings(rings, cap0=True, cap1=False), mat, smooth=55)
    # reforço (aro) perto da culatra e boca escura
    mb.add(prim_cyl(r * 1.1, r * 1.1, 0.05 * length, n, base=False), ring_mat, T @ M((0, 0, 0.16 * length), (90, 0, 0)), smooth=30)
    mb.add(prim_cyl(r * 0.62, r * 0.62, 0.02, n, base=False), 'dark', T @ M((0, 0, length - 0.005), (90, 0, 0)))


def port_frame(mb, T, w, h, mat='gold', t=0.05, d=0.06, inner='dark', iron=None, bevel=0.0):
    """Moldura de porta de canhão (4 vigas) com fundo escuro; +z local = para fora do casco."""
    for (dx, dy, sx, sy) in ((0, h / 2, w + t, t), (0, -h / 2, w + t, t), (-w / 2, 0, t, h), (w / 2, 0, t, h)):
        mb.add(prim_box(sx, sy, d), mat, T @ M((dx, dy, 0.0)), bevel=bevel)
    mb.add(prim_box(w, h, 0.02), inner, T @ M((0, 0, -0.012)))


def cask(mb, T, r=0.11, h=0.2, mat='wood_dark', hoop='iron', n=8, lid=True):
    rings = []
    for (y, k) in ((0.0, 0.84), (h * 0.5, 1.0), (h, 0.84)):
        rings.append([tuple(T @ V(p)) for p in ring_h(y, r * k, r * k, n)])
    mb.add(prim_rings(rings, cap0=True, cap1=True), mat, smooth=60)
    for (y, k) in ((h * 0.2, 0.93), (h * 0.8, 0.93)):
        mb.add(prim_cyl(r * k * 1.06, r * k * 1.06, 0.022, n, base=False), hoop, T @ M((0, y + 0.0, 0)), smooth=30)


def rope_coil(mb, T, R=0.16, r=0.035, turns=2, mat='rope'):
    for k in range(turns):
        mb.add(torus(R - 0.012 * k, r, 12, 5), mat, T @ M((0, r * 1.4 * k, 0)), smooth=60)


def life_ring(mb, T, R=0.15, r=0.045):
    """Boia salva-vidas laranja com 4 faixas brancas (eixo +z local = frente do anel)."""
    mb.add(torus(R, r, 12, 5), 'orange', T @ M(r=(90, 0, 0)), smooth=60)
    for k in range(4):
        a = math.pi / 2 * k + math.pi / 4
        mb.add(prim_box(r * 2.2, r * 2.3, r * 2.3), 'cream', T @ M((R * math.cos(a), R * math.sin(a), 0), (0, 0, math.degrees(a))))


def heater_poly(w, h, notch=0.0):
    """Escudo em coração: lista de pontos (x, y), centro em (0, 0)."""
    return [(-w, h * 0.55), (-w * 0.45, h * 0.62), (w * 0.45, h * 0.62), (w, h * 0.55), (w * 1.0, h * 0.05),
            (w * 0.7, -h * 0.28), (0, -h * 0.62), (-w * 0.7, -h * 0.28), (-w * 1.0, h * 0.05)]


def shield(mb, T, s, rim='steel', field='steel', trim='gold', depth=0.05):
    """Escudo heráldico de aço com friso e losango dourado (+z local = face)."""
    base = heater_poly(0.27 * s, 0.62 * s)
    mb.add(prim_extrude(base, depth, axis='z'), rim, T @ M((0, 0, depth / 2)), bevel=0.008, smooth=0)
    inner = [(x * 0.84, y * 0.86) for (x, y) in base]
    mb.add(prim_extrude(inner, depth + 0.02, axis='z'), field, T @ M((0, 0, depth / 2 + 0.005)), bevel=0.006)
    dm = [(0, 0.26 * s), (0.11 * s, 0.0), (0, -0.30 * s), (-0.11 * s, 0.0)]
    mb.add(prim_extrude(dm, 0.03, axis='z'), trim, T @ M((0, 0.03 * s, depth + 0.012)), bevel=0.004)
    mb.add(prim_extrude([(0, 0.15 * s), (0.055 * s, 0.0), (0, -0.2 * s), (-0.055 * s, 0.0)], 0.03, axis='z'), 'steel_dark',
           T @ M((0, 0.03 * s, depth + 0.03)), bevel=0.003)


def emblem(mb, T, s=1.0, mat='gold', dark='steel_dark', z=0.0, d=0.022):
    """Brasão do Espadachim (cruz com braços ornados e losango central), vira no plano local XY, +z = face."""
    mb.add(prim_box(0.075 * s, 0.36 * s, d), mat, T @ M((0, -0.06 * s, z)))
    mb.add(prim_box(0.26 * s, 0.075 * s, d), mat, T @ M((0, 0.0, z)))
    for dy in (0.20, -0.20):
        mb.add(prim_box(0.14 * s, 0.05 * s, d), mat, T @ M((0, -0.06 * s + dy * s, z)))
    for dx in (-0.16, 0.16):
        mb.add(prim_box(0.05 * s, 0.14 * s, d), mat, T @ M((dx * s, 0.0, z)))
    mb.add(prim_extrude([(0, 0.06 * s), (0.05 * s, 0), (0, -0.06 * s), (-0.05 * s, 0)], d, axis='z'), dark,
           T @ M((0, 0.0, z + d * 0.6)), bevel=0.004)


def window(mb, T, w, h, frame='cream', glass='glass', t=0.035):
    mb.add(prim_box(w + t * 2, h + t * 2, 0.03), frame, T @ M((0, 0, 0.0)), bevel=0.006)
    mb.add(prim_box(w, h, 0.03), glass, T @ M((0, 0, 0.012)))
    mb.add(prim_box(t * 0.8, h, 0.034), frame, T @ M((0, 0, 0.014)))


def porthole(mb, T, R=0.1, rim='gold'):
    mb.add(prim_cyl(R * 1.28, R * 1.28, 0.05, 10, base=False), rim, T @ M(r=(90, 0, 0)), smooth=40)
    mb.add(prim_cyl(R, R, 0.06, 10, base=False), 'dark', T @ M((0, 0, 0.004), (90, 0, 0)))
    mb.add(prim_cyl(R * 0.8, R * 0.8, 0.065, 10, base=False), 'glass', T @ M((0, 0, 0.01), (90, 0, 0)))


def stairs(mb, p0, p1, w, steps, mat='wood_light', stringer='wood_dark'):
    """Escada de degraus de p0 (baixo) a p1 (alto), largura w ao longo de x."""
    p0, p1 = V(p0), V(p1)
    for k in range(steps):
        t = (k + 0.5) / steps
        p = p0.lerp(p1, t)
        run = (p1 - p0)
        mb.add(prim_box(w, 0.04, abs(run.z) / steps * 1.1 + 0.02), mat, M((p.x, p.y, p.z)), bevel=0.006)
    for sx in (-1, 1):
        beam(mb, (p0.x + sx * w / 2, p0.y - 0.04, p0.z), (p1.x + sx * w / 2, p1.y - 0.04, p1.z), 0.05, 0.08, stringer, bevel=0.006)


def pipe(mb, pts, r, mat='steel_dark', band_mat='steel', n=8, collars=(), r_coll=None):
    """Tubulação ao longo de pts (suavizada em loft) com colares opcionais (índices ou t em [0, 1])."""
    tube(mb, pts, [r] * len(pts), mat, n=n, smooth=60)
    for t in collars:
        i = min(int(t * (len(pts) - 1)), len(pts) - 2)
        f = t * (len(pts) - 1) - i
        p = V(pts[i]).lerp(V(pts[i + 1]), f)
        d = V(pts[i + 1]) - V(pts[i])
        mb.add(prim_cyl(r * 1.35, r * 1.35, r * 0.7, n, base=False), band_mat, Matrix.Translation(p) @ orient(d), smooth=30)


def capsule(mb, c, length, r, mat, n=14, ends=4, smooth=55, cap_len=None, hr=0.0):
    """Tanque cilíndrico (eixo z) com calotas arredondadas; c = centro; length = comprimento total."""
    c = V(c)
    cl = cap_len if cap_len is not None else r * 0.7
    half = length / 2
    prof = []   # (z, raio) da popa para a proa
    for k in range(ends):       # calota de popa: do polo (raio ~0) até o corpo
        a = (math.pi / 2) * (k / ends)
        prof.append((-half + cl * (1 - math.cos(a)), max(r * math.sin(a), r * 0.12)))
    prof.append((-half + cl, r))
    prof.append((half - cl, r))
    for k in range(ends, 0, -1):  # calota de proa
        a = (math.pi / 2) * (k / ends)
        prof.append((half - cl * (1 - math.cos(a)), max(r * math.sin(a), r * 0.12)))
    rings = []
    for (z, rr) in prof:
        ring = []
        for i in range(n):
            ang = 2 * math.pi * (i + 0.5) / n
            ring.append(tuple(c + V((math.cos(ang) * rr, math.sin(ang) * rr, z))))
        rings.append(ring)
    return mb.add(prim_rings(rings, cap0=True, cap1=True), mat, smooth=smooth)


def smooth_path(pts, steps=4):
    """Suaviza uma poli-linha com Catmull-Rom (para tubulações/mangueiras)."""
    pts = [V(p) for p in pts]
    out = []
    n = len(pts)
    for i in range(n - 1):
        p0, p1, p2, p3 = pts[max(i - 1, 0)], pts[i], pts[i + 1], pts[min(i + 2, n - 1)]
        for k in range(steps):
            t = k / steps
            t2, t3 = t * t, t * t * t
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    out.append(pts[-1])
    return [tuple(p) for p in out]


# --------------------------------------------------------------------------------------------------------------
# Mastros, velas, bandeiras
# --------------------------------------------------------------------------------------------------------------
def mast(mb, base, top, r0, r1, mat='wood_dark', band=None, n=8, bands=(0.15, 0.55)):
    base, top = V(base), V(top)
    tube(mb, [tuple(base), tuple(base.lerp(top, 0.5)), tuple(top)], [r0, (r0 + r1) / 2, r1], mat, n=n, smooth=55)
    if band:
        for t in bands:
            p = base.lerp(top, t)
            mb.add(prim_cyl(lerp(r0, r1, t) * 1.3, lerp(r0, r1, t) * 1.3, 0.12, n, base=False), band, Matrix.Translation(p), smooth=30)


def yard(mb, c, length, r=0.06, mat='wood_dark', tip_mat='gold', angle=0.0, n=7):
    """Verga horizontal (eixo x) com ponteiras douradas."""
    c = V(c)
    d = V((math.cos(math.radians(angle)), math.sin(math.radians(angle)), 0))
    a, b = c - d * length / 2, c + d * length / 2
    tube(mb, [tuple(a), tuple(c), tuple(b)], [r * 0.7, r, r * 0.7], mat, n=n, smooth=55)
    for p in (a, b):
        mb.add(prim_cyl(r * 1.15, r * 1.15, 0.1, n, base=False), tip_mat, Matrix.Translation(p) @ orient(d), smooth=30)


def sail_fn(w, h, bulge, flare=0.08, twist=0.0, sway=0.0, tilt=0.0):
    """Superfície paramétrica da vela: u horizontal [0, 1], v vertical [0 (base), 1 (topo)]. Origem no meio da verga
    (topo), a vela pende para baixo (y de 0 a -h)."""
    def fn(u, v):
        x = (u - 0.5) * w * (1.0 + flare * (1 - v))
        y = -(1 - v) * h
        belly = bulge * math.sin(math.pi * u) ** 0.9 * (0.35 + 0.65 * math.sin(math.pi * (0.1 + 0.8 * (1 - v))))
        z = belly + tilt * (1 - v) + sway * math.sin(u * math.pi * 2 + 0.5) * (1 - v)
        return (x, y, z)
    return fn


def sail(mb, T, w, h, bulge, field_mat='team', cloth_mat='sail', trim_mat='gold', border=0.125, emb=True, both=False, es=3.4, **fkw):
    """Vela de pano creme com campo azul de time e brasão dourado. T posiciona a origem no meio da verga."""
    fn = sail_fn(w, h, bulge, **fkw)

    def Tfn(u, v):
        return tuple(T @ V(fn(u, v)))
    # pano creme (8 x 8 células) e campo azul de time alinhado à grade do pano (sem z-fighting)
    mb.add(grid_slab(Tfn, 8, 8, thick=0.035), cloth_mat, smooth=50)
    b0, b1 = border, 1.0 - border
    nb = int(round((b1 - b0) * 8))
    mb.add(grid_slab(Tfn, nb, nb, b0, b1, b0, b1, thick=0.02, off=0.024), field_mat, smooth=50)
    if both:
        mb.add(grid_slab(Tfn, nb, nb, b0, b1, b0, b1, thick=0.02, off=-0.035), field_mat, smooth=50)
    if emb:
        # brasão dourado sobre o campo (cruz com braços ornados e losango); both = também no verso
        for (off, mat_d, back) in ((0.036, 'steel_dark', False), (-0.055, 'steel_dark', True)) if both else ((0.036, 'steel_dark', False),):
            def patch(u0, u1, v0, v1, o=off, mat=trim_mat, back=back):
                mb.add(grid_slab(Tfn, 2, 2, u0, u1, v0, v1, thick=0.012, off=o), mat, smooth=0)
            def emb_patch(cx, cy, pw, ph, o=off, mat=trim_mat):
                patch((0.5 + (cx - pw / 2) * es / w), (0.5 + (cx + pw / 2) * es / w),
                      (0.5 + (cy - ph / 2) * es / h), (0.5 + (cy + ph / 2) * es / h), o=o, mat=mat)
            emb_patch(0.0, -0.06, 0.075, 0.36)
            emb_patch(0.0, 0.0, 0.26, 0.075)
            emb_patch(0.0, 0.14, 0.14, 0.05)
            emb_patch(0.0, -0.26, 0.14, 0.05)
            emb_patch(-0.16, 0.0, 0.05, 0.14)
            emb_patch(0.16, 0.0, 0.05, 0.14)
            emb_patch(0.0, 0.0, 0.1, 0.12, o=off + (0.012 if not back else -0.012), mat=mat_d)


def furled_sail(mb, c, length, r=0.1, mat='sail', angle=0.0, strap='rope'):
    """Vela enrolada sobre a verga."""
    c = V(c)
    d = V((math.cos(math.radians(angle)), math.sin(math.radians(angle)), 0))
    a, b = c - d * length / 2, c + d * length / 2
    tube(mb, [tuple(a), tuple(c), tuple(b)], [r * 0.7, r, r * 0.7], mat, n=8, smooth=55)
    for t in (0.2, 0.5, 0.8):
        p = a.lerp(b, t)
        mb.add(prim_cyl(r * 1.15, r * 1.15, 0.035, 8, base=False), strap, Matrix.Translation(p) @ orient(d), smooth=30)


def pennant(w, h, tail=0.4):
    """Bandeira com cauda em andorinha: polígono (x, y), haste em x = 0."""
    return [(0, h / 2), (w * 0.55, h / 2 + 0.01), (w, h / 2 - 0.04), (w - tail * w * 0.7, 0.0), (w, -h / 2 + 0.04),
            (w * 0.55, -h / 2 - 0.01), (0, -h / 2)]


def flag(mb, w, h, mat='team', border='gold', emb=True, amp=0.07, fx=3.2, ph=0.0, tail=0.35, z0=0.0, flip=False):
    """Bandeira ondulada no plano XY com friso dourado e brasão; haste em x = 0; vai para +x (ou -x com flip)."""
    sgn = -1 if flip else 1
    poly = pennant(w, h, tail)
    verts, faces = prim_extrude([(sgn * x, y) for (x, y) in poly], 0.03, axis='z')
    mb.add((wave(verts, amp, fx, 0.0, ph), faces), border, M((0, 0, z0)), smooth=40)
    inner = [(sgn * (x * 0.9 + 0.02), y * 0.8) for (x, y) in poly]
    verts, faces = prim_extrude(inner, 0.046, axis='z')
    mb.add((wave(verts, amp, fx, 0.0, ph), faces), mat, M((0, 0, z0)), smooth=40)
    if emb:
        zz = amp * math.sin(sgn * w * 0.3 * fx + ph)
        emblem(mb, M((sgn * w * 0.3, 0, z0 + zz + 0.025), (0, 0, 0)), min(w, h * 1.6) * 1.05, z=0.0)


def crow_nest(mb, c, r=0.28, h=0.2, mat='wood_dark', rim='iron'):
    """Cesto da gávea: balde de barril com aros, aberto em cima."""
    c = V(c)
    rings = [ring_h(0.0, r * 0.82, r * 0.82, 10), ring_h(h * 0.5, r * 0.95, r * 0.95, 10), ring_h(h, r, r, 10)]
    rings = [[tuple(c + V(p)) for p in ring] for ring in rings]
    mb.add(prim_rings(rings, cap0=True, cap1=False), mat, smooth=50)
    mb.add(prim_rings([[tuple(c + V((0, h, 0)) + V(p)) for p in ring_h(0, r, r, 10)],
                       [tuple(c + V((0, h + 0.04, 0)) + V(p)) for p in ring_h(0, r * 1.08, r * 1.08, 10)]],
                      cap0=False, cap1=True), rim, smooth=30)
    for k in range(3):
        mb.add(prim_cyl(r * (0.9 + 0.05 * k), r * (0.9 + 0.05 * k), 0.03, 10, base=False), rim, Matrix.Translation(c + V((0, 0.05 + 0.07 * k, 0))), smooth=30)


def funnel(mb, c, r, h, mat, band_mat='cream', cap_mat='dark', rim_mat='iron', n=12, band=(0.45, 0.65), taper=0.88):
    c = V(c)
    mb.add(prim_cyl(r, r * taper, h * band[0], n, base=True), mat, Matrix.Translation(c), smooth=60)
    r1 = lerp(r, r * taper, band[0])
    r2 = lerp(r, r * taper, band[1])
    mb.add(prim_cyl(r1 * 1.01, r2 * 1.01, h * (band[1] - band[0]), n, base=True), band_mat, Matrix.Translation(c + V((0, h * band[0], 0))), smooth=60)
    mb.add(prim_cyl(r2, r * taper, h * (1 - band[1]), n, base=True), mat, Matrix.Translation(c + V((0, h * band[1], 0))), smooth=60)
    mb.add(prim_cyl(r * taper * 1.12, r * taper * 1.12, 0.06, n, base=True), rim_mat, Matrix.Translation(c + V((0, h - 0.02, 0))), smooth=40)
    mb.add(prim_cyl(r * taper * 0.9, r * taper * 0.9, 0.01, n, base=True), cap_mat, Matrix.Translation(c + V((0, h + 0.035, 0))))


def anchor(mb, T, s=1.0, mat='iron', rope='rope'):
    """Âncora de almirantado no plano XY local (haste em y), +z = face."""
    d = 0.065 * s
    mb.add(prim_box(d, 1.0 * s, d), mat, T @ M((0, 0, 0)), bevel=0.012)                         # haste
    mb.add(prim_box(0.62 * s, d * 0.9, d * 0.9), mat, T @ M((0, 0.3 * s, 0.0)), bevel=0.01)       # cepo
    mb.add(torus(0.1 * s, d * 0.55, 10, 5), mat, T @ M((0, 0.52 * s, 0.0), (90, 0, 0)), smooth=60)  # argola
    pts = bezier((-0.46 * s, -0.22 * s, 0), (-0.3 * s, -0.54 * s, 0), (0.0, -0.5 * s, 0), 4) + \
        bezier((0.0, -0.5 * s, 0), (0.3 * s, -0.54 * s, 0), (0.46 * s, -0.22 * s, 0), 4)[1:]
    tube(mb, [tuple(T @ V(p)) for p in pts], [d * 0.8] * len(pts), mat, n=6, smooth=60)
    for sx in (-1, 1):
        mb.add(prim_extrude([(0, 0.12 * s), (0.1 * s, -0.04 * s), (0, -0.12 * s), (-0.1 * s, -0.04 * s)], d * 0.9, axis='z'), mat,
               T @ M((sx * 0.48 * s, -0.22 * s, 0), (0, 0, -sx * 40)), bevel=0.008)


# --------------------------------------------------------------------------------------------------------------
# Torres de canhão
# --------------------------------------------------------------------------------------------------------------
def turret_poly(r, front=0.86, back=0.92, sides=12, p=0.8):
    """Planta arredondada (superelipse) da torre: x = largura, z = comprimento (frente = +z menor para afunilar)."""
    pts = []
    for i in range(sides):
        a = 2 * math.pi * (i + 0.5) / sides
        sa, ca = math.sin(a), math.cos(a)
        x = r * 0.95 * math.copysign(abs(sa) ** p, sa)
        z = r * (front if ca > 0 else back) * math.copysign(abs(ca) ** p, ca)
        pts.append((x, z))
    return pts


def turret_housing(mb, r=0.6, h=0.7, shell='steel', top='gold', plate='steel_dark', team=None, scale=1.0, roof_mat=None,
                   sides=12):
    """Torre blindada arredondada sobre tambor: origem no centro da base do tambor, frente +z. Devolve (altura do eixo
    dos canos, z da frente da carapaça)."""
    k = scale
    r = r * k
    hh = h * k
    # tambor giratório + cinta de rolamento
    mb.add(prim_cyl(r * 1.02, r * 1.02, 0.12 * k, 16, base=True), 'steel_dark', M(), bevel=0.012, smooth=40)
    mb.add(prim_cyl(r * 1.06, r * 1.06, 0.05 * k, 16, base=True), plate, M((0, 0.07 * k, 0)), smooth=30)
    mb.add(prim_cyl(r * 0.86, r * 0.86, 0.22 * k, 16, base=True), 'steel_dark', M((0, 0.12 * k, 0)), smooth=40)
    y0 = 0.30 * k
    poly = turret_poly(r, sides=sides)
    mb.add(prim_extrude(poly, hh * 0.96, axis='y', center=False), team or shell, M((0, y0, 0)), bevel=0.035, bevel_segments=2, smooth=50)
    # cintas douradas (base e topo) e chapa do teto
    mb.add(prim_extrude([(x * 1.015, z * 1.015) for (x, z) in poly], 0.07 * k, axis='y', center=False), top, M((0, y0 - 0.005, 0)), bevel=0.012)
    mb.add(prim_extrude([(x * 1.015, z * 1.015) for (x, z) in poly], 0.06 * k, axis='y', center=False), top, M((0, y0 + hh * 0.9, 0)), bevel=0.012)
    roof = [(x * 0.78, z * 0.78) for (x, z) in poly]
    mb.add(prim_extrude(roof, 0.05 * k, axis='y', center=False), roof_mat or team or shell, M((0, y0 + hh * 0.95, 0)), bevel=0.02, bevel_segments=2)
    mb.add(prim_extrude([(x * 0.86, z * 0.86) for (x, z) in poly], 0.025 * k, axis='y', center=False), top, M((0, y0 + hh * 0.97, 0)), bevel=0.008)
    # rebites em volta do teto e das cintas
    for i, (x, z) in enumerate(poly):
        stud(mb, V((x * 0.95, y0 + hh * 0.9 + 0.07 * k, z * 0.95)), (0, 1, 0), 0.03 * k, 'steel_hi')
    # escotilha circular e olho de boi
    mb.add(prim_cyl(0.15 * k, 0.15 * k, 0.05 * k, 10, base=True), plate, M((0, y0 + hh * 0.99, -0.22 * r)), bevel=0.008, smooth=30)
    mb.add(prim_cyl(0.07 * k, 0.07 * k, 0.07 * k, 8, base=True), top, M((0, y0 + hh * 0.99 + 0.04 * k, -0.22 * r)), smooth=30)
    return y0 + hh * 0.5, r * 0.86


# --------------------------------------------------------------------------------------------------------------
# Acabamento
# --------------------------------------------------------------------------------------------------------------
def finish_ship(name, glb, atlas_name, root, parts, weights, team_default, args, tex=512, ground_hex='#1f6ea6',
                game_dist=24.0, cam_dirs=None, margin=0.004, angle=55.0, quality=88):
    """UV atlas -> bake -> materiais -> export -> renders sobre água. Devolve stats."""
    import bpy
    bpy.context.view_layer.update()
    C.uv_atlas(parts, weights=weights, margin=margin, angle=angle)
    img = C.bake_atlas(parts, atlas_name, tex, samples=int(os.environ.get('BAKE_SAMPLES', 32)), margin=4, ground=False)
    C.finalize_materials(parts, img, team_default=team_default,
                         out_png=os.path.join(C.BUILD_DIR, atlas_name + '.png'))
    out = os.path.join(C.OUT_MODELS, glb)
    C.export_glb(root, out, quality=quality)
    st = C.stats(root, out)
    print('STATS', name, st)
    print('BBOX', bbox_game(root))
    if '--no-render' not in args:
        rig = C.RenderRig(root, name, res=int(os.environ.get('RENDER_RES', 800)), samples=24, ground_hex=ground_hex)
        bg = rig.scene.world.node_tree.nodes['Background']
        bg.inputs['Color'].default_value = C.hex_lin('#e9e4da')
        bg.inputs['Strength'].default_value = 0.95
        for o in rig.scene.objects:
            if o.type == 'LIGHT':
                o.data.energy = 3.6
        rig.render('34', (1.0, 0.78, 1.0), 28, zoom=ZOOM)
        rig.render('34b', (-1.0, 0.78, 1.0), 28, zoom=ZOOM)
        rig.render('side', (1.0, 0.25, 0.0), 28, zoom=ZOOM)
        rig.render('front', (0.0, 0.5, 1.0), 28, zoom=ZOOM)
        rig.render('back', (-0.5, 0.7, -1.0), 28, zoom=ZOOM)
        rig.render('top', (0.05, 1.0, 0.05), 28, zoom=ZOOM)
        rig.render('game', (45, 44, 45), 24, dist=game_dist)
        alt = '#c0392b'
        C.set_team_color(alt)
        rig.render('34_vermelho', (1.0, 0.78, 1.0), 28, zoom=ZOOM)
        C.set_team_color(team_default)
    return st
