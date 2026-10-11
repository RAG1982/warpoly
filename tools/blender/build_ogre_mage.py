"""
build_ogre_mage.py — Ogro Feiticeiro (tipo interno `ogre_mage`, classe avançada da cavalaria orc) gerado por script.

Reaproveita `build_ogre.py` com a MESMA rig aninhada e os MESMOS nomes de nós (Torso > Head, ArmL, ArmR > Weapon;
LegL, LegR): pele cinza-azulada com tinta ritual de raio (as cicatrizes viram marcas luminosas), olhos azuis
elétricos, cabelo branco, colar de presas com cristal de tempestade no centro do peito (longe da barba e dos ombros),
cristal na testa, penacho de ossos e penas, bolsa de runas e, no lugar da clava, um cajado de xamã (`Weapon`) com cristal
de raio e garras de ferro.

Uso:
  blender -b --factory-startup --python tools/blender/build_ogre_mage.py -- [--no-render]
Saída: public/models/ogre_mage.glb (raiz `OgreMage`).
"""
import os
import sys
import math

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mathutils import Vector  # noqa: E402
import common as C  # noqa: E402
from common import (MeshBuilder, M, prim_box, prim_cyl, prim_cone, prim_sphere, prim_extrude, prim_rings,  # noqa: E402
                    ring_h, limb_rings, bezier)
import build_ogre as O  # noqa: E402

TEAM_DEFAULT = O.TEAM_DEFAULT

O.PALETTE.update({
    'skin': dict(base='#6f7f9c', var='#4d5b78', var_scale=3.5, var_amt=0.7, fine=0.07, grad=(0.0, 3.2, 0.30), top=0.25,
                 edge='#c3d0ea', edge_amt=0.35, edge_r=0.035, ao=(0.35, 0.7), coord='world'),
    'skin_dark': dict(base='#4a566f', var='#38425a', var_scale=4.0, fine=0.06, grad=(0.0, 3.2, 0.2), top=0.15, ao=(0.3, 0.6)),
    'scar': dict(base='#9ff4ff', var='#4fd2ff', var_scale=10.0, fine=0.05, emit_boost=1.2),
    'eye': dict(base='#bff6ff', var='#4fd2ff', var_scale=20.0, emit_boost=1.5),
    'hair': dict(base='#e8ecf4', var='#b8c0d2', var_scale=14.0, fine=0.18, top=0.3, ao=(0.2, 0.5)),
    'crystal': dict(base='#48c4ff', var='#1f8be0', var_scale=2.0, var_amt=0.9, top=0.5, emit_boost=1.2,
                    edge='#e6fbff', edge_amt=0.9, edge_r=0.05, edge_gain=7.0),
    'core': dict(base='#e4fbff', var='#9fe8ff', var_scale=3.0, emit_boost=1.3),
    'feather': dict(base='#2f5fb0', var='#1d3f80', var_scale=10.0, fine=0.1, top=0.3, edge='#9bc0ff', edge_amt=0.5,
                    edge_r=0.02, ao=(0.2, 0.5)),
})


def bolt_poly(w, h):
    """Zigue-zague de raio vertical (polígono 2D em x,y), topo em +y."""
    return [(0.15 * w, 0.5 * h), (-0.35 * w, 0.0), (-0.02 * w, 0.0), (-0.22 * w, -0.5 * h), (0.38 * w, 0.06 * h),
            (0.04 * w, 0.06 * h)]


def necklace(mb):
    """Colar de tempestade (NEW-40 fechamento, agente B): o cordão antigo nascia sob a mandíbula e sumia atrás do queixo/gola
    de pele, e se somava ao colar de presas do Ogro base. Agora o do Ogro base é desligado (`O.NECKLACE = False`) e este é o
    único: cordão de couro em V que desce da gola de pele por dentro das tintas de raio das peitorais, passa bem abaixo da
    mandíbula e sustenta, no centro do peito (+Z), um cristal de tempestade grande preso por tampa de ferro, com seis presas
    de osso penduradas dos dois lados."""
    pts = [(-0.30, 0.99, 0.12), (-0.38, 0.88, 0.38), (-0.38, 0.76, 0.62), (-0.28, 0.67, 0.77), (-0.14, 0.62, 0.84),
           (0.0, 0.60, 0.86), (0.14, 0.62, 0.84), (0.28, 0.67, 0.77), (0.38, 0.76, 0.62), (0.38, 0.88, 0.38),
           (0.30, 0.99, 0.12)]
    mb.add(prim_rings(limb_rings(pts, [0.03] * len(pts), 5), cap0=True, cap1=True), 'leather', smooth=40)
    for k in (2, 3, 4, 6, 7, 8):
        px, py, pz = pts[k]
        mb.add(prim_cone(0.05, 0.2 if k in (3, 7) else 0.17, 4), 'bone', M((px, py - 0.02, pz + 0.01), (172, 0, 0)), smooth=40)
    mb.add(prim_cyl(0.058, 0.048, 0.06, 6, base=False), 'iron', M((0, 0.585, 0.86)), smooth=30)
    mb.add(prim_sphere(0.095, 0.20, 0.095, 6, 4), 'crystal', M((0, 0.40, 0.87)), smooth=0)
    mb.add(prim_sphere(0.045, 0.11, 0.045, 5, 3), 'core', M((0, 0.40, 0.87)), smooth=0)


def torso_extras(mb):
    # tinta ritual de raio na barriga e no peito (luminosa), só na frente
    mb.add(prim_extrude(bolt_poly(0.30, 0.62), 0.07, axis='z'), 'scar', M((0.0, -0.30, 0.86), (-6, 0, 0)))
    for sx in (-1, 1):
        mb.add(prim_extrude(bolt_poly(0.16, 0.34), 0.05, axis='z'), 'scar', M((sx * 0.50, 0.60, 0.69), (0, sx * 18, 0)))
    necklace(mb)
    # bolsa de runas presa ao cinto
    mb.add(prim_box(0.22, 0.26, 0.12, taper=(0.9, 0.8)), 'leather', M((0.62, -0.62, 0.34), (0, 20, 0)), bevel=0.02)
    mb.add(prim_box(0.14, 0.1, 0.03), 'scar', M((0.66, -0.58, 0.41), (0, 20, 0)))


def head_extras(mb):
    # cristal de tempestade na testa, sobre o chifre (frente, +Z)
    mb.add(prim_sphere(0.07, 0.15, 0.07, 5, 3), 'crystal', M((0, 0.30, 0.40), (-20, 0, 0)), smooth=0)
    # penacho de ossos e penas azuis atrás do chifre
    for k, dx in enumerate((-0.22, -0.11, 0.0, 0.11, 0.22)):
        h = 0.55 - abs(dx) * 0.9
        mb.add(prim_box(0.07, h, 0.02, taper=(0.5, 1.0)), 'feather' if k % 2 else 'bone',
               M((dx, 0.60 + h / 2 - 0.05, -0.30), (-24, 0, dx * -120)), smooth=0)
    # anéis de ouro/ferro nas orelhas
    mb.add(prim_cyl(0.05, 0.05, 0.02, 8), 'iron', M((0.50, 0.24, -0.02), (0, 0, 90)), smooth=30)
    # riscos de tinta nas bochechas (só frente)
    for sx in (-1, 1):
        mb.add(prim_box(0.18, 0.025, 0.02), 'scar', M((sx * 0.26, 0.25, 0.37), (0, sx * 38, sx * -14)))
        mb.add(prim_box(0.14, 0.025, 0.02), 'scar', M((sx * 0.27, 0.19, 0.37), (0, sx * 40, sx * -22)))


def build_staff(mats, arm_r):
    """Cajado de xamã: haste de madeira, cristal de raio entre garras de ferro, fitas e crânio pequeno."""
    mb = MeshBuilder('Weapon')
    P = O.CLUB_PRE
    mb.add(prim_cyl(0.085, 0.07, 2.35, 8, base=False), 'wood', P @ M((0, 0.95, 0)), smooth=50)
    mb.add(prim_cyl(0.115, 0.115, 0.46, 8, base=False), 'leather', P @ M((0, 0.0, 0)), smooth=45)
    for y in (-0.16, -0.05, 0.06, 0.17):
        mb.add(prim_cyl(0.122, 0.122, 0.03, 8, base=False), 'hide', P @ M((0, y, 0)), smooth=30)
    mb.add(prim_sphere(0.14, 0.12, 0.14, 7, 4), 'bone', P @ M((0, -0.30, 0)), smooth=60)
    # coroa de garras de ferro segurando o cristal
    top = 2.05
    mb.add(prim_cyl(0.16, 0.12, 0.14, 8), 'iron', P @ M((0, top, 0)), smooth=30)
    for k in range(5):
        a = math.radians(k * 72 + 10)
        pts = bezier((math.sin(a) * 0.12, top + 0.05, math.cos(a) * 0.12), (math.sin(a) * 0.38, top + 0.40, math.cos(a) * 0.38),
                     (math.sin(a) * 0.16, top + 0.82, math.cos(a) * 0.16), 5)
        mb.add(prim_rings(limb_rings([tuple(P @ Vector(p)) for p in pts], [0.05, 0.045, 0.036, 0.026, 0.012, 0.004], 5,
                                     up=(0, 1, 0)), cap0=True, cap1=True), 'iron', smooth=50)
    mb.add(prim_sphere(0.20, 0.40, 0.20, 6, 4), 'crystal', P @ M((0, top + 0.50, 0)), smooth=0)
    mb.add(prim_sphere(0.09, 0.22, 0.09, 5, 3), 'core', P @ M((0, top + 0.50, 0)), smooth=0)
    # raio de ferro/cristal atravessando a haste mais abaixo e fitas de time
    mb.add(prim_extrude(bolt_poly(0.26, 0.55), 0.05, axis='z'), 'crystal', P @ M((0, 1.45, 0.12)), smooth=0)
    mb.add(prim_rings([ring_h(1.30, 0.11, 0.11, 10), ring_h(1.38, 0.105, 0.105, 10)], cap0=False, cap1=False), 'team', P,
           smooth=30)
    mb.add(O.cloth_panel((-0.08, 1.34, 0.10), (0.08, 1.34, 0.10), (-0.12, 0.80, 0.16), (0.10, 0.80, 0.16),
                         nx=3, ny=3, thick=0.03, bulge=(0, 0, 0.05), wave=0.03, jag=0.05), 'team', P, smooth=50)
    # tufos de penas e osso pendurados abaixo do cristal
    for k, (dx, c) in enumerate(((-0.16, 'feather'), (0.16, 'bone'), (0.0, 'feather'))):
        mb.add(prim_box(0.06, 0.34, 0.02, taper=(0.5, 1.0)), c, P @ M((dx, 1.80, 0.12), (10, 0, dx * -90)), smooth=0)
    w = mb.build(mats, parent=arm_r, location=O.WEAPON_PIVOT)
    C.set_rot_game(w, (O.WEAPON_REST_X, 0, 0))
    return w


EXTRAS = {'Head': head_extras, 'Torso': torso_extras}
O.NECKLACE = False  # só o colar de tempestade deste modelo (ver `necklace`)
_orig_build = MeshBuilder.build


def _build(self, mat_lookup, parent=None, location=(0, 0, 0), collection=None):
    fn = EXTRAS.get(self.name)
    if fn:
        fn(self)
    return _orig_build(self, mat_lookup, parent, location, collection)


MeshBuilder.build = _build
O.build_club = build_staff

if __name__ == '__main__':
    O.main('OgreMage', 'ogre_mage')
