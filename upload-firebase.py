#!/usr/bin/env python3
"""
Firebase Firestore에 설정·override만 업로드 (영상 링크 목록은 Cloudflare)

사용법:
  pip install firebase-admin
  # serviceAccountKey.json → 프로젝트 루트
  python upload-firebase.py
  python upload-firebase.py --create-admin admin@hanbit.kr 0000
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CONFIG_JSON = ROOT / 'data' / 'config.json'
CREDENTIALS = ROOT / 'serviceAccountKey.json'


def main():
    parser = argparse.ArgumentParser(description='Upload Hanbit settings to Firestore')
    parser.add_argument('--create-admin', nargs=2, metavar=('EMAIL', 'PASSWORD'),
                        help='Firebase Auth 관리자 계정 생성')
    args = parser.parse_args()

    if not CREDENTIALS.exists():
        print('serviceAccountKey.json 이 없습니다.')
        print('Firebase Console -> 프로젝트 설정 -> 서비스 계정 -> 새 비공개 키')
        sys.exit(1)

    try:
        import firebase_admin
        from firebase_admin import credentials, firestore, auth
    except ImportError:
        print('pip install firebase-admin')
        sys.exit(1)

    if not firebase_admin._apps:
        cred = credentials.Certificate(str(CREDENTIALS))
        firebase_admin.initialize_app(cred)

    db = firestore.client()

    if CONFIG_JSON.exists():
        cfg = json.loads(CONFIG_JSON.read_text(encoding='utf-8'))
    else:
        cfg = {}
    version = datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')
    cfg['videosVersion'] = version
    cfg['videosUpdatedAt'] = datetime.now(timezone.utc).isoformat()
    db.collection('config').document('app').set(cfg, merge=True)
    print(f'Firestore config/app OK (videosVersion={version})')

    ov_ref = db.collection('overrides').document('videos')
    if not ov_ref.get().exists:
        ov_ref.set({'items': {}})
        print('Firestore overrides/videos initialized')

    custom_ref = db.collection('custom').document('videos')
    if not custom_ref.get().exists:
        custom_ref.set({'list': []})
        print('Firestore custom/videos initialized')

    if args.create_admin:
        email, password = args.create_admin
        try:
            auth.create_user(email=email, password=password)
            print(f'Admin created: {email}')
        except auth.EmailAlreadyExistsError:
            auth.update_user(auth.get_user_by_email(email).uid, password=password)
            print(f'Admin password updated: {email}')

    print('\nDone. Set js/firebase-config.js enabled:true and deploy upload/ to Cloudflare.')


if __name__ == '__main__':
    main()
