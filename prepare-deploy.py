#!/usr/bin/env python3
"""Cloudflare Pages 배포용 upload 폴더 생성"""
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
UPLOAD = ROOT / 'upload'

INCLUDE = ['index.html', 'manifest.json', 'css', 'js', 'icons', 'sw.js', '_redirects', '_headers']
DATA_FILES = ['index.json', 'config.json', 'videos.json']


def copy_item(src, dst):
    if src.is_dir():
        shutil.copytree(src, dst, dirs_exist_ok=True)
    else:
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)


def main():
    icons_script = ROOT / 'generate-icons.py'
    if icons_script.exists():
        subprocess.run([sys.executable, str(icons_script)], cwd=ROOT, check=False)

    if UPLOAD.exists():
        shutil.rmtree(UPLOAD, ignore_errors=True)
    UPLOAD.mkdir(parents=True, exist_ok=True)

    for name in INCLUDE:
        src = ROOT / name
        if not src.exists():
            continue
        copy_item(src, UPLOAD / name)

    data_out = UPLOAD / 'data'
    data_out.mkdir(exist_ok=True)
    for fname in DATA_FILES:
        src = ROOT / 'data' / fname
        if src.exists():
            shutil.copy2(src, data_out / fname)
        elif fname != 'videos.json':
            print(f'[WARN] data/{fname} missing — run: node scripts/build-shards.js')

    shards_src = ROOT / 'data' / 'shards'
    if shards_src.exists():
        copy_item(shards_src, data_out / 'shards')
    else:
        print('[WARN] data/shards/ missing — run: node scripts/build-shards.js')

    cfg_path = UPLOAD / 'js' / 'firebase-config.js'
    if cfg_path.exists() and 'enabled: false' in cfg_path.read_text(encoding='utf-8'):
        print('[WARN] firebase-config.js: set enabled true before production deploy')

    size = sum(f.stat().st_size for f in UPLOAD.rglob('*') if f.is_file())
    print(f'upload/ ready ({size // 1024} KB) - Cloudflare Pages에 이 폴더를 업로드하세요')


if __name__ == '__main__':
    main()
