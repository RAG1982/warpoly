#!/usr/bin/env python3
"""Reduz os PNGs de tools/blender/renders/ (paleta de 256 cores) para manter
o repositório leve. Usa o Python do sistema com Pillow (opcional)."""
import os
import sys

try:
    from PIL import Image
except ImportError:
    print('Pillow ausente: renders mantidos sem compressão extra')
    sys.exit(0)

here = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'renders')
names = sys.argv[1:] or sorted(os.listdir(here))
for name in names:
    if not name.endswith('.png'):
        continue
    path = os.path.join(here, os.path.basename(name))
    before = os.path.getsize(path)
    img = Image.open(path).convert('RGB')
    img = img.quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    img.save(path, optimize=True)
    print(f'{name}: {before // 1024} KB -> {os.path.getsize(path) // 1024} KB')
