#!/usr/bin/env python3
"""
ui_sheet.py (F7-09) — folhas de contato para CONFERIR os sprites de public/ui/ (usa o Python do sistema com Pillow).

    python3 tools/blender/ui_sheet.py icons  <saida.png|jpg> [--dir public/ui/icons/128] [--prefix unit_] [--cols 8] [--cell 128]
    python3 tools/blender/ui_sheet.py files  <saida.png> <arquivo1> <arquivo2> ... [--cols 8] [--cell 128] [--bg tile|grass|none]
    python3 tools/blender/ui_sheet.py portraits <saida.png> [--cols 6] [--cell 128]   (idle em cima, ataque embaixo)

Cada ícone é composto sobre o "azulejo" escuro do botão da HUD (rgba(14,23,36,.85)) com a legenda embaixo.
"""
import os
import sys
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
UI = os.path.join(REPO, 'public', 'ui')
TILE = (14, 23, 36)
GRASS = (112, 150, 78)


def arg(name, default=None, cast=str):
    if name in sys.argv:
        return cast(sys.argv[sys.argv.index(name) + 1])
    return default


def font(size=11):
    for p in ('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf'):
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def sheet(items, out, cols=8, cell=128, bg='tile', label=True):
    """items = [(caminho, legenda)]"""
    pad = 6
    lh = 14 if label else 0
    rows = (len(items) + cols - 1) // cols
    W = cols * (cell + pad) + pad
    H = rows * (cell + lh + pad) + pad
    color = {'tile': TILE, 'grass': GRASS, 'none': (255, 255, 255)}[bg]
    img = Image.new('RGB', (W, H), (24, 28, 36))
    d = ImageDraw.Draw(img)
    f = font(10)
    for i, (path, cap) in enumerate(items):
        r, c = divmod(i, cols)
        x = pad + c * (cell + pad)
        y = pad + r * (cell + lh + pad)
        d.rounded_rectangle([x, y, x + cell, y + cell], radius=8, fill=color, outline=(212, 175, 55))
        try:
            im = Image.open(path).convert('RGBA')
            if im.size != (cell, cell):
                im = im.resize((cell, cell), Image.LANCZOS)
            img.paste(im, (x, y), im)
        except Exception as exc:  # arquivo ausente
            d.text((x + 4, y + 4), 'ERRO', fill=(255, 80, 80), font=f)
            print('falha', path, exc)
        if label:
            d.text((x + 2, y + cell + 1), cap[:int(cell / 6)], fill=(230, 220, 190), font=f)
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    if out.lower().endswith(('.jpg', '.jpeg')):
        img.save(out, quality=86, optimize=True)
    else:
        img.save(out)
    print('folha:', out, img.size, len(items), 'itens')


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        return 1
    mode, out = sys.argv[1], sys.argv[2]
    cols = arg('--cols', 8, int)
    cell = arg('--cell', 128, int)
    bg = arg('--bg', 'tile')
    if mode == 'icons':
        d = arg('--dir', os.path.join(UI, 'icons', '128'))
        prefix = arg('--prefix', '')
        names = sorted(f for f in os.listdir(d) if f.endswith('.webp') and f.startswith(prefix))
        sheet([(os.path.join(d, n), n[:-5]) for n in names], out, cols, cell, bg)
    elif mode == 'files':
        files = [a for a in sys.argv[3:] if not a.startswith('--') and os.path.exists(a)]
        sheet([(f, os.path.basename(f).rsplit('.', 1)[0]) for f in files], out, cols, cell, bg)
    elif mode == 'portraits':
        d = arg('--dir', os.path.join(UI, 'portraits'))
        names = sorted({f.rsplit('_', 1)[0] for f in os.listdir(d) if f.endswith('_idle.webp')})
        items = []
        for n in names:
            items.append((os.path.join(d, n + '_idle.webp'), n + ' idle'))
        for n in names:
            items.append((os.path.join(d, n + '_attack.webp'), n + ' atq'))
        # idle e ataque lado a lado: intercala em pares
        pairs = []
        for i in range(len(names)):
            pairs.append(items[i])
            pairs.append(items[len(names) + i])
        sheet(pairs, out, cols, cell, bg)
    else:
        print(__doc__)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
