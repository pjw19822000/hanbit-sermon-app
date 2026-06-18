#!/usr/bin/env python3
"""After build-videos.py: record sync-added videos in upload-log.json (7-day retention)."""
from __future__ import annotations

import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ADDED_IDS_PATH = os.path.join(ROOT, "data", ".rss-added-ids.json")
VIDEOS_PATH = os.path.join(ROOT, "data", "videos.json")

sys.path.insert(0, os.path.join(ROOT, "scripts"))
from upload_log import append_entries, append_from_videos, load_log, purge_old_entries, push_to_firestore, save_log  # noqa: E402


def read_added_payload() -> tuple[str, list[str]]:
    if not os.path.isfile(ADDED_IDS_PATH):
        return "rss", []
    try:
        with open(ADDED_IDS_PATH, encoding="utf-8") as f:
            payload = json.load(f)
    except (json.JSONDecodeError, OSError):
        return "rss", []
    try:
        os.remove(ADDED_IDS_PATH)
    except OSError:
        pass
    if isinstance(payload, list):
        return "rss", payload
    source = str(payload.get("source") or "rss")
    ids = payload.get("ids") if isinstance(payload.get("ids"), list) else []
    return source, ids


def main() -> int:
    source, added_ids = read_added_payload()

    if added_ids and os.path.isfile(VIDEOS_PATH):
        with open(VIDEOS_PATH, encoding="utf-8") as f:
            db = json.load(f)
        by_id = {v["id"]: v for v in db.get("videos") or [] if v.get("id")}
        videos = [by_id[i] for i in added_ids if i in by_id]
        entries = append_from_videos(videos, source)
        push_to_firestore(entries)
        print(f"upload-log: recorded {len(entries)} {source.upper()} entries")
    else:
        data = load_log()
        before = len(data["entries"])
        data["entries"] = purge_old_entries(data["entries"])
        save_log(data)
        purged = before - len(data["entries"])
        print(f"upload-log: purged {purged} old entries (no new sync videos)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
