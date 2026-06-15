#!/usr/bin/env python3
"""hanbit-prayer-ministry 에 잘못 업로드한 sermon 앱 데이터 정리"""
import firebase_admin
from firebase_admin import credentials, firestore, auth

CREDENTIALS = 'serviceAccountKey.json'
ADMIN_EMAIL = 'admin@hanbit.kr'


def main():
    cred = credentials.Certificate(CREDENTIALS)
    if not firebase_admin._apps:
        firebase_admin.initialize_app(cred)

    db = firestore.client()

    # Firestore: sermon 앱용 문서 삭제
    for coll, doc_id in [('config', 'app'), ('overrides', 'videos'), ('custom', 'videos')]:
        ref = db.collection(coll).document(doc_id)
        if ref.get().exists:
            ref.delete()
            print(f'Deleted Firestore {coll}/{doc_id}')
        else:
            print(f'Skip (missing): {coll}/{doc_id}')

    # Auth: 추가한 관리자만 삭제
    try:
        user = auth.get_user_by_email(ADMIN_EMAIL)
        auth.delete_user(user.uid)
        print(f'Deleted Auth user: {ADMIN_EMAIL}')
    except auth.UserNotFoundError:
        print(f'Auth user not found: {ADMIN_EMAIL}')

    print('\nDone. pjw19822000@gmail.com 등 기존 계정은 유지됩니다.')


if __name__ == '__main__':
    main()
