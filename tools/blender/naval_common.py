"""
naval_common.py — helpers das construções navais humanas (Estaleiro e Plataforma de Petróleo, ART-naval-buildings).
Coordenadas do jogo (x direita, y cima, +z frente), como `common.py`.
"""
import math
from mathutils import Vector, Matrix
from common import (M, prim_box, prim_rings, ring_h, prim_cyl, prim_cone, prim_sphere, prim_extrude,  # noqa: F401
                    limb_rings, bezier)
import siege_common as S


class Piv:
    """Proxy de MeshBuilder para peças com pivô próprio (Anim_*): escreve-se em coordenadas do jogo (mundo) e a
    matriz é deslocada por -pivô; depois `mb.build(mats, parent=root, location=pivô)`."""

    def __init__(self, mb, pivot):
        self.mb = mb
        self.T = Matrix.Translation(-Vector(pivot))

    def add(self, prim, mat, m=None, **kw):
        return self.mb.add(prim, mat, self.T if m is None else self.T @ m, **kw)


class Sc:
    """Proxy que escala (em torno de `origin`, uniformemente por k) tudo o que é adicionado (coords do jogo)."""

    def __init__(self, mb, origin, k):
        self.mb = mb
        o = Vector(origin)
        self.T = Matrix.Translation(o) @ Matrix.Scale(k, 4) @ Matrix.Translation(-o)

    def add(self, prim, mat, m=None, **kw):
        return self.mb.add(prim, mat, self.T if m is None else self.T @ m, **kw)


def torus_prim(R, r, nu=14, nv=6):
    """Toro no plano XZ (eixo Y)."""
    rings = []
    for i in range(nu + 1):
        a = 2 * math.pi * (i % nu) / nu
        ring = []
        for k in range(nv):
            b = 2 * math.pi * k / nv + math.pi / nv
            rr = R + r * math.cos(b)
            ring.append((rr * math.cos(a), r * math.sin(b), rr * math.sin(a)))
        rings.append(ring)
    return prim_rings(rings, cap0=False, cap1=False)


def rope_coil(mb, x, y, z, R=0.28, r=0.06, turns=3, mat='rope', rot=0.0):
    for k in range(turns):
        mb.add(torus_prim(R * (1.0 - 0.04 * k), r, 12, 5), mat, M((x, y + r + k * r * 1.5, z), (0, rot + 25 * k, 0)), smooth=60)


def cog_prim(R, teeth, depth, tooth_h=None):
    th = tooth_h if tooth_h is not None else 0.17 * max(R, 0.6)
    return prim_extrude(S.cog(R, teeth, tooth_h=th), depth, axis='z')


def gear(mb, T, R, teeth, depth, body='iron', hub='steel', spokes=0):
    """Engrenagem de ferro com miolo, eixo em z local."""
    mb.add(cog_prim(R, teeth, depth), body, T, bevel=0.008)
    mb.add(prim_cyl(R * 0.62, R * 0.62, depth * 0.35, 12, base=False), hub, T @ M((0, 0, depth * 0.5), (90, 0, 0)), smooth=30)
    mb.add(prim_cyl(R * 0.2, R * 0.2, depth * 0.6, 8, base=False), 'dark', T @ M((0, 0, depth * 0.6), (90, 0, 0)), smooth=30)
    for k in range(spokes):
        a = 180.0 * k / max(spokes, 1)
        mb.add(prim_box(R * 1.7, R * 0.1, depth * 0.3), body, T @ M((0, 0, depth * 0.45), (0, 0, a)))


def rivets(mb, pts, r=0.03, mat='steel'):
    for p in pts:
        mb.add(prim_sphere(r, r, r, 5, 3), mat, M(tuple(p)), smooth=60)


def waved(prim, amp, fx, fy=0.0, ph=0.0):
    v, f = prim
    return S.wave(v, amp, fx, fy, ph), f


def emblem(mb, x, y, z, k=1.0, wave=None, gold='gold', dark='steel_dark', yaw=0.0):
    """Brasão do tabardo do Espadachim (build_knight.py): haste vertical, travessa, 2 travessas curtas, 2 hastes curtas
    e losango central. (x, y, z) = centro da travessa; k = escala; face em +z (ou girada por yaw)."""
    T = M((x, y, z), (0, yaw, 0))

    def add(prim, mat, m, **kw):
        if wave:
            amp, fx, fy, ph = wave
            # aplica a ondulação nos vértices em coordenadas do painel (x, y)
            v, f = prim
            pp = []
            for (vx, vy, vz) in v:
                p = m @ Vector((vx, vy, vz))
                pp.append((p.x, p.y, p.z + amp * math.sin((x + p.x * k) * fx + (y + p.y * k) * fy + ph)))
            mb.add((pp, f), mat, T, **kw)
        else:
            mb.add(prim, mat, T @ m, **kw)

    s = k
    bz = 0.0
    add(prim_box(0.075 * s, 0.36 * s, 0.022 * s), gold, M((0, -0.06 * s, bz)))
    add(prim_box(0.26 * s, 0.075 * s, 0.022 * s), gold, M((0, 0, bz)))
    for dy in (0.20, -0.20):
        add(prim_box(0.14 * s, 0.05 * s, 0.022 * s), gold, M((0, (-0.06 + dy) * s, bz)))
    for dx in (-0.16, 0.16):
        add(prim_box(0.05 * s, 0.14 * s, 0.022 * s), gold, M((dx * s, 0, bz)))
    add(prim_extrude([(0, 0.06 * s), (0.05 * s, 0), (0, -0.06 * s), (-0.05 * s, 0)], 0.022 * s, axis='z'), dark,
        M((0, 0, bz + 0.013 * s)))


def banner_cloth(mb, T, w, h, mat='team', trim='gold', wave=(0.03, 4.0, 2.5, 0.0), pointed=True, tail=False,
                 t_cloth=0.035):
    """Painel de pano (cor de time) com borda dourada atrás. Origem no centro do topo; pende em -y."""
    amp, fx, fy, ph = wave
    if tail:       # galhardete com cauda de andorinha (pende para +x)
        pts = [(0, 0), (w, 0), (w * 0.78, -h / 2), (w, -h), (0, -h)]
        tpts = [(-0.04, 0.04), (w + 0.05, 0.05), (w * 0.78 + 0.02, -h / 2), (w + 0.05, -h - 0.05), (-0.04, -h - 0.04)]
    elif pointed:
        pts = [(-w / 2, 0), (w / 2, 0), (w / 2, -h * 0.78), (0, -h), (-w / 2, -h * 0.78)]
        tpts = [(-w / 2 - 0.05, 0.04), (w / 2 + 0.05, 0.04), (w / 2 + 0.05, -h * 0.78 - 0.02), (0, -h - 0.07), (-w / 2 - 0.05, -h * 0.78 - 0.02)]
    else:
        pts = [(-w / 2, 0), (w / 2, 0), (w / 2, -h), (-w / 2, -h)]
        tpts = [(-w / 2 - 0.05, 0.04), (w / 2 + 0.05, 0.04), (w / 2 + 0.05, -h - 0.05), (-w / 2 - 0.05, -h - 0.05)]

    def wv(prim, dz=0.0):
        v, f = prim
        return [(x, y, z + dz + amp * math.sin(x * fx + y * fy + ph)) for (x, y, z) in v], f

    mb.add(wv(prim_extrude(tpts, t_cloth * 0.8, axis='z'), -0.012), trim, T, smooth=40)
    mb.add(wv(prim_extrude(pts, t_cloth, axis='z'), 0.006), mat, T, smooth=40)


def hash_pick(i, j, seed, table):
    h = ((i * 73856093) ^ (j * 19349663) ^ (seed * 83492791)) & 0xFFFF
    r = (h % 1000) / 10.0
    acc = 0.0
    for p, m in table:
        acc += p
        if r < acc:
            return m
    return table[-1][1]


ROOF_TABLE = [(46, 'roof_blue'), (24, 'roof_red'), (18, 'roof_lblue'), (12, 'roof_navy')]


def roof_face(mb, e0, e1, t0, t1, rows, tw, center, seed=0, thick=0.045, bow=0.1, table=None):
    """Telhas individuais (caixas finas sobrepostas) numa água trapezoidal: beiral e0-e1 e topo t0-t1 (3D do jogo).
    `center` = ponto interno do telhado (decide o lado externo da normal). Cores por hash (azul/vermelho)."""
    table = table or ROOF_TABLE
    e0, e1, t0, t1, cen = (Vector(p) for p in (e0, e1, t0, t1, center))

    def pt(a, b, s):
        return a.lerp(b, s)

    for j in range(rows):
        s0, s1 = j / rows, (j + 1) / rows
        a0, b0 = pt(e0, t0, s0), pt(e1, t1, s0)
        a1, b1 = pt(e0, t0, s1), pt(e1, t1, s1)
        for p, s in ((a0, s0), (b0, s0), (a1, s1), (b1, s1)):
            p.y -= bow * math.sin(math.pi * s)
        m0, m1 = (a0 + b0) / 2, (a1 + b1) / 2
        wmid = ((b0 - a0).length + (b1 - a1).length) / 2
        k = max(1, int(round(wmid / tw)))
        ez = (m1 - m0)
        rowlen = ez.length
        ez.normalize()
        ex = (b0 - a0).normalized() if (b0 - a0).length > 1e-4 else (b1 - a1).normalized()
        n = ez.cross(ex).normalized()
        face_mid = (m0 + m1) / 2
        if n.dot(face_mid - cen) < 0:
            ex = -ex
            n = ez.cross(ex).normalized()
        R3 = Matrix((ex, n, ez)).transposed()
        R4 = R3.to_4x4()
        tl = rowlen * 1.42
        for i in range(k):
            f = (i + 0.5) / k
            ctr = (a0 + (b0 - a0) * f)
            ctr = ctr + ez * (tl / 2 - 0.02) + n * (0.012 * (rows - j) + thick / 2)
            wk = (wmid / k)
            mat = 'roof_red' if (i + 2 * j + seed) % 4 == 0 else hash_pick(i, j, seed, [(22, 'roof_lblue'), (10, 'roof_navy'), (68, 'roof_blue')])
            # inclinação extra (sobreposição): borda de baixo levantada
            mb.add(prim_box(wk * 0.96, thick, tl), mat, Matrix.Translation(ctr) @ R4)


def roof_solid(mb, eave_pts, ridge_pts, y_e, y_r, mat='wood_beam'):
    """Casca interna (cinza-escuro) sob as telhas: prisma de beiral retangular e cumeeira (2 pontos)."""
    (x0, z0), (x1, z1) = eave_pts
    r0, r1 = ridge_pts
    v = [(x0, y_e, z0), (x1, y_e, z0), (x1, y_e, z1), (x0, y_e, z1), (r0[0], y_r, r0[1]), (r1[0], y_r, r1[1])]
    f = [(3, 2, 1, 0), (0, 1, 5, 4), (2, 3, 4, 5), (1, 2, 5), (3, 0, 4)]
    mb.add((v, f), mat)


def patch_small_bevels(min_bevel=0.02):
    """Orçamento de triângulos: biséis menores que `min_bevel` são descartados (o desgaste de borda do shader
    de bake já destaca as arestas); biséis grandes (pedras, cunhais) ficam."""
    from common import MeshBuilder
    if getattr(MeshBuilder, '_naval_patched', False):
        return
    orig = MeshBuilder.add

    def add(self, prim, mat, m=None, bevel=0.0, **kw):
        if 0 < bevel < min_bevel:
            bevel = 0.0
        return orig(self, prim, mat, m, bevel=bevel, **kw)

    MeshBuilder.add = add
    MeshBuilder._naval_patched = True


def rounded_path(pts, rr=0.15, steps=3):
    """Polilinha com cantos arredondados (tubulação): cada canto vira uma curva de Bézier quadrática."""
    pts = [Vector(p) for p in pts]
    out = [pts[0]]
    for i in range(1, len(pts) - 1):
        a, b, c = pts[i - 1], pts[i], pts[i + 1]
        d0 = (b - a)
        d1 = (c - b)
        r0 = min(rr, d0.length * 0.45)
        r1 = min(rr, d1.length * 0.45)
        p0 = b - d0.normalized() * r0
        p2 = b + d1.normalized() * r1
        for t in range(steps + 1):
            u = t / steps
            q = (1 - u) ** 2 * p0 + 2 * (1 - u) * u * b + u * u * p2
            out.append(q)
    out.append(pts[-1])
    return [tuple(p) for p in out]


def pipe(mb, pts, r, mat='steel', rr=0.16, n=8, flanges=(True, True), flange_mat='steel_dark'):
    """Cano com cantos arredondados e flanges nas pontas."""
    path = rounded_path(pts, rr)
    from bld_common import tube
    tube(mb, path, [r] * len(path), mat, n=n, smooth=55)
    for flag, idx in ((flanges[0], 0), (flanges[1], -1)):
        if not flag:
            continue
        p = Vector(path[idx])
        q = Vector(path[1 if idx == 0 else -2])
        d = (q - p).normalized() if idx == 0 else (p - q).normalized()
        from bld_common import orient
        mb.add(prim_cyl(r * 1.55, r * 1.55, 0.07, 10, base=False), flange_mat, Matrix.Translation(p + d * (0.06 if idx == 0 else -0.06)) @ orient(d), smooth=30)
