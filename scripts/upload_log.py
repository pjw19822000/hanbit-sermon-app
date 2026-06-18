"""Upload sync log (7-day retention) for admin panel."""
from __future__ import annotations

import json
import os
import uuid
from datetime import datetime, timedelta, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOG_PATH = os.path.join(ROOT, "data", "upload-log.json")
RETENTION_DAYS = 7

BUCKET_LABELS = {
    "baek-regular": "백용현 담임목사",
    "prayer-ministry": "기도사역말씀",
    "associate": "부사역자",
    "praise": "찬양",
    "events-outreach": "아웃리치·선교",
    "events-seminar": "세미나/수련회",
    "events-revival": "초청설교·부흥회",
    "events-promo": "홍보",
    "events-pastor-conference": "목자 컨퍼런스",
    "events-testimony": "간증",
    "misc-unclassified": "미분류 영상",
    "other": "관리자 · 분류되지 않음",
}

PRAYER_LABELS = {
    "prayer-conference": "기도 컨퍼런스",
    "50day-school": "50일 기도학교",
    "24h-prayer": "24시간 기도회 (영적돌파)",
    "100year-prayer": "100년 기도운동",
    "pastor-seminar": "목회자 세미나",
    "youth-camp": "청소년 기도캠프",
}

BAEK_WORSHIPS = ["새벽기도회", "저녁기도회", "수요저녁예배", "주일예배"]
PRAYER_YEAR_SERIES = {
    "prayer-conference", "50day-school", "24h-prayer",
    "100year-prayer", "youth-camp", "pastor-seminar",
}


def _utcnow_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _cutoff_iso() -> str:
    dt = datetime.now(timezone.utc) - timedelta(days=RETENTION_DAYS)
    return dt.replace(microsecond=0).isoformat().replace("+00:00", "Z")


def load_log() -> dict:
    if not os.path.isfile(LOG_PATH):
        return {"entries": []}
    with open(LOG_PATH, encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, dict):
        return {"entries": []}
    entries = data.get("entries") or []
    if not isinstance(entries, list):
        entries = []
    return {"entries": entries}


def save_log(data: dict) -> None:
    os.makedirs(os.path.dirname(LOG_PATH), exist_ok=True)
    with open(LOG_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")


def purge_old_entries(entries: list) -> list:
    cutoff = _cutoff_iso()
    return [e for e in entries if isinstance(e, dict) and (e.get("syncedAt") or "") >= cutoff]


def classify_issues(v: dict) -> list[str]:
    issues: list[str] = []
    bucket = v.get("bucket") or ""
    if not bucket or bucket == "other":
        issues.append("분류(bucket) 없음")
        return issues
    if bucket == "baek-regular":
        if not v.get("isBaek"):
            issues.append("백용현 플래그 없음")
        elif not v.get("book") and not v.get("themes") and not v.get("worship"):
            issues.append("성경·주제·예배 없음")
        elif v.get("worship") and v["worship"] not in BAEK_WORSHIPS:
            issues.append("예배 종류 불명")
    elif bucket == "prayer-ministry":
        ps = v.get("prayerSeries") or ""
        if not ps:
            issues.append("기도 시리즈 없음")
        elif ps in PRAYER_YEAR_SERIES and not _prayer_year(v):
            issues.append("연도 없음")
    elif bucket == "associate":
        if not v.get("associateId"):
            issues.append("교역자 없음")
    elif bucket == "praise":
        if not v.get("praiseSub"):
            issues.append("찬양 하위 없음")
    return issues


def _prayer_year(v: dict) -> str:
    sm = v.get("seriesMeta") or {}
    if sm.get("year"):
        return str(sm["year"])
    if v.get("date") and len(v["date"]) >= 4:
        return v["date"][:4]
    if v.get("uploadedAt") and len(v["uploadedAt"]) >= 4:
        return str(v["uploadedAt"])[:4]
    return ""


def folder_label(v: dict) -> str:
    bucket = v.get("bucket") or "other"
    parts = [BUCKET_LABELS.get(bucket, bucket)]
    if bucket == "associate" and v.get("associateId"):
        parts.append(str(v["associateId"]))
    elif bucket == "baek-regular" and v.get("worship"):
        parts.append(str(v["worship"]))
    elif bucket == "prayer-ministry" and v.get("prayerSeries"):
        parts.append(PRAYER_LABELS.get(v["prayerSeries"], v["prayerSeries"]))
    elif bucket == "praise" and v.get("praiseSub"):
        parts.append(str(v["praiseSub"]))
    elif v.get("scripture"):
        parts.append(str(v["scripture"]))
    return " · ".join(p for p in parts if p)


def entry_from_video(v: dict, source: str, synced_at: str | None = None, action: str = "added") -> dict:
    issues = classify_issues(v)
    return {
        "id": str(uuid.uuid4()),
        "videoId": v.get("id") or "",
        "title": v.get("title") or v.get("displayTitle") or "",
        "url": v.get("url") or "",
        "bucket": v.get("bucket") or "other",
        "folderLabel": folder_label(v),
        "status": "needs_review" if issues else "classified",
        "issues": issues,
        "source": source,
        "action": action,
        "syncedAt": synced_at or _utcnow_iso(),
    }


def append_entries(new_entries: list[dict]) -> int:
    if not new_entries:
        data = load_log()
        data["entries"] = purge_old_entries(data["entries"])
        save_log(data)
        return 0
    data = load_log()
    merged = purge_old_entries(data["entries"]) + new_entries
    merged.sort(key=lambda e: e.get("syncedAt") or "", reverse=True)
    save_log({"entries": merged})
    return len(new_entries)


def append_from_videos(videos: list[dict], source: str) -> list[dict]:
    synced = _utcnow_iso()
    entries = [entry_from_video(v, source, synced, "added") for v in videos if v.get("id")]
    append_entries(entries)
    return entries


def upsert_from_videos(videos: list[dict], source: str) -> list[dict]:
    """Update existing log row by videoId when title/classification changed."""
    if not videos:
        return []
    synced = _utcnow_iso()
    data = load_log()
    entries = purge_old_entries(data["entries"])
    index_by_vid: dict[str, int] = {}
    for i, e in enumerate(entries):
        vid = e.get("videoId") if isinstance(e, dict) else ""
        if vid and vid not in index_by_vid:
            index_by_vid[vid] = i

    touched: list[dict] = []
    for v in videos:
        if not v.get("id"):
            continue
        entry = entry_from_video(v, source, synced, "updated")
        vid = v["id"]
        if vid in index_by_vid:
            prev = entries[index_by_vid[vid]]
            entry["id"] = prev.get("id") or entry["id"]
            entries[index_by_vid[vid]] = entry
        else:
            entry["action"] = "added"
            index_by_vid[vid] = len(entries)
            entries.append(entry)
        touched.append(entry)

    entries.sort(key=lambda e: e.get("syncedAt") or "", reverse=True)
    save_log({"entries": entries})
    return touched


def push_to_firestore(entries: list[dict]) -> int:
    """Optional: FIREBASE_SERVICE_ACCOUNT_JSON env → Firestore uploadLogs collection."""
    cred_json = os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON", "").strip()
    if not cred_json or not entries:
        return 0
    try:
        import firebase_admin
        from firebase_admin import credentials, firestore
    except ImportError:
        return 0
    if not firebase_admin._apps:
        cred = credentials.Certificate(json.loads(cred_json))
        firebase_admin.initialize_app(cred)
    db = firestore.client()
    col = db.collection("uploadLogs")
    cutoff = _cutoff_iso()
    for doc in col.stream():
        synced = (doc.to_dict() or {}).get("syncedAt") or ""
        if synced and synced < cutoff:
            doc.reference.delete()
    for entry in entries:
        doc_id = entry.get("id") or str(uuid.uuid4())
        col.document(doc_id).set(entry)
    return len(entries)
