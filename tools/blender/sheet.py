#!/usr/bin/env python3
"""Folha de contato: sheet.py <saida.png> <img1> <img2> ... (lado a lado, altura 480)."""
import os
import sys
from PIL import Image

here = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'renders')
out, names = sys.argv[1], sys.argv[2:]
ims = []
for n in names:
    im = Image.open(os.path.join(here, n)).convert('RGB')
    h = 480
    ims.append(im.resize((int(im.width * h / im.height), h)))
W = sum(i.width for i in ims)
sheet = Image.new('RGB', (W, 480))
x = 0
for i in ims:
    sheet.paste(i, (x, 0))
    x += i.width
sheet.save(os.path.join(here, out))
