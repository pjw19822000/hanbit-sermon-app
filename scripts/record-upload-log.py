#!/usr/bin/env python3
"""After build-videos.py: record sync-added/updated videos in upload-log.json (7-day retention)."""
from __future__ import annotations

import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ADDED_IDS_PATH = os.path.join(ROOT, "data", ".rss-added-ids.json")
VIDEOS_PATH = os.path.join(ROOT, "data", "videos.json")

sys.path.insert(0, os.path.join(ROOT, "scripts"))
from upload_log import (  # noqa: E402
    append_from_videos,
    load_log,
    purge_old_entries,
    push_to_firestore,
    save_log,
    upsert_from_videos,
)


def read_sync_payload() -> tuple[str, list[str], list[str]]:
    if not os.path.isfile(ADDED_IDS_PATH):
        return "rss", [], []
    try:
        with open(ADDED_IDS_PATH, encoding="utf-8") as f:
            payload = json.load(f)
    except (json.JSONDecodeError, OSError):
        return "rss", [], []
    try:
        os.remove(ADDED_IDS_PATH)
    except OSError:
        pass
    if isinstance(payload, list):
        return "rss", payload, []
    source = str(payload.get("source") or "rss")
    added = payload.get("added")
    updated = payload.get("updated")
    if isinstance(added, list):
        added_ids = added
    elif isinstance(payload.get("ids"), list):
        added_ids = payload["ids"]
    else:
        added_ids = []
    updated_ids = updated if isinstance(updated, list) else []
    return source, added_ids, updated_ids


def main() -> int:
    source, added_ids, updated_ids = read_sync_payload()
    sync_ids = [i for i in dict.fromkeys(added_ids + updated_ids) if i]

    if sync_ids and os.path.isfile(VIDEOS_PATH):
        with open(VIDEOS_PATH, encoding="utf-8") as f:
            db = json.load(f)
        by_id = {v["id"]: v for v in db.get("videos") or [] if v.get("id")}
        updated_set = set(updated_ids)
        added_videos = [by_id[i] for i in added_ids if i in by_id and i not in updated_set]
        updated_videos = [by_id[i] for i in updated_ids if i in by_id]
        added_entries = append_from_videos(added_videos, source) if added_videos else []
        updated_entries = upsert_from_videos(updated_videos, source) if updated_videos else []
        entries = added_entries + updated_entries
        push_to_firestore(entries)
        print(
            f"upload-log: recorded {len(added_entries)} added, "
            f"{len(updated_entries)} updated ({source.upper()})"
        )
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
