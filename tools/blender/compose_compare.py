#!/usr/bin/env python3
"""Monta imagens lado a lado (antigo × novo) a partir das capturas do inspetor
(tools/blender/renders/insp_*.png). Usa o Python do sistema com Pillow."""
import os
from PIL import Image, ImageDraw

R = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'renders')
PAIRS = [
    ('compare_grunt', 'insp_grunt_old', 'insp_grunt_new'),
    ('compare_grunt_side', 'insp_grunt_old_side', 'insp_grunt_new_side'),
    ('compare_grunt_fight', 'insp_grunt_old_fight', 'insp_grunt_new_fight'),
    ('compare_grunt_strike', 'insp_grunt_old_strike', 'insp_grunt_new_strike'),
    ('compare_castle', 'insp_castle_old', 'insp_castle_new'),
]


def load(name):
    im = Image.open(os.path.join(R, name + '.png')).convert('RGB')
    w, h = im.size
    return im.crop((int(w * 0.12), 110, int(w * 0.88), h - 50))


for out, a, b in PAIRS:
    if not (os.path.exists(os.path.join(R, a + '.png')) and os.path.exists(os.path.join(R, b + '.png'))):
        continue
    ia, ib = load(a), load(b)
    W = ia.width + ib.width + 12
    canvas = Image.new('RGB', (W, ia.height + 44), (24, 26, 33))
    canvas.paste(ia, (0, 44))
    canvas.paste(ib, (ia.width + 12, 44))
    d = ImageDraw.Draw(canvas)
    d.text((16, 14), 'ANTIGO (procedural three.js)', fill=(230, 230, 230))
    d.text((ia.width + 28, 14), 'NOVO (pipeline Blender .glb)', fill=(255, 214, 110))
    canvas = canvas.resize((W * 3 // 4, (ia.height + 44) * 3 // 4), Image.LANCZOS)
    canvas = canvas.quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    canvas.save(os.path.join(R, out + '.png'), optimize=True)
    print('ok', out)
