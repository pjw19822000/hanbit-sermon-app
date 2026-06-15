#!/usr/bin/env python3
"""icon-source.png → favicon + PWA icons"""
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    raise SystemExit('pip install Pillow')

ROOT = Path(__file__).resolve().parent
SRC = ROOT / 'icons' / 'icon-source.png'
OUT = ROOT / 'icons'
SIZES = {
    'favicon-32.png': 32,
    'apple-touch-icon.png': 180,
    'icon-192.png': 192,
    'icon-512.png': 512,
}


def main():
    if not SRC.exists():
        print(f'[WARN] {SRC.name} missing — skip icon generation')
        return
    img = Image.open(SRC).convert('RGBA')
    OUT.mkdir(exist_ok=True)
    for name, size in SIZES.items():
        resized = img.resize((size, size), Image.Resampling.LANCZOS)
        resized.save(OUT / name, optimize=True)
        print(f'icons/{name} ({size}px)')


if __name__ == '__main__':
    main()
