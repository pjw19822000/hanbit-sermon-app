"""Shared YouTube sync helpers (CSV merge, config, dates)."""
from __future__ import annotations

import csv
import json
import os
import re
from datetime import datetime, timedelta, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSV_PATH = os.path.join(ROOT, "HanbitMethodistChurch_Videos.csv")
CONFIG_PATH = os.path.join(ROOT, "data", "config.json")
ADDED_IDS_PATH = os.path.join(ROOT, "data", ".rss-added-ids.json")

DEFAULT_CHANNEL_ID = "UC5rJi-E3aMkb46vVHJArvYg"
DEFAULT_LOOKBACK_HOURS = 72
DEFAULT_API_MAX_RESULTS = 50
DEFAULT_API_MAX_PAGES = 2


def load_config() -> dict:
    if not os.path.isfile(CONFIG_PATH):
        return {}
    with open(CONFIG_PATH, encoding="utf-8") as f:
        return json.load(f)


def channel_id(cfg: dict | None = None) -> str:
    cfg = cfg or load_config()
    return (
        os.environ.get("YOUTUBE_CHANNEL_ID")
        or cfg.get("youtubeChannelId")
        or DEFAULT_CHANNEL_ID
    ).strip()


def api_key() -> str:
    return (os.environ.get("YOUTUBE_API_KEY") or "").strip()


def lookback_hours(cfg: dict | None = None) -> int:
    cfg = cfg or load_config()
    raw = os.environ.get("RSS_LOOKBACK_HOURS") or cfg.get("rssLookbackHours") or DEFAULT_LOOKBACK_HOURS
    try:
        return max(24, int(raw))
    except (TypeError, ValueError):
        return DEFAULT_LOOKBACK_HOURS


def api_sync_limits(cfg: dict | None = None) -> tuple[int, int]:
    cfg = cfg or load_config()
    try:
        per_page = max(1, min(50, int(cfg.get("youtubeApiMaxResults") or DEFAULT_API_MAX_RESULTS)))
    except (TypeError, ValueError):
        per_page = DEFAULT_API_MAX_RESULTS
    try:
        pages = max(1, min(4, int(cfg.get("youtubeApiMaxPages") or DEFAULT_API_MAX_PAGES)))
    except (TypeError, ValueError):
        pages = DEFAULT_API_MAX_PAGES
    return per_page, pages


def extract_video_id(url: str) -> str:
    m = re.search(r"(?:v=|youtu\.be/|embed/)([A-Za-z0-9_-]{11})", url or "")
    return m.group(1) if m else ""


def normalize_published(raw: str) -> str:
    if not raw:
        return ""
    text = raw.strip()
    if text.endswith("Z"):
        return text
    if "+" in text:
        text = text.replace("+00:00", "Z")
        if not text.endswith("Z"):
            text = text.split("+", 1)[0] + "Z"
    else:
        text += "Z"
    return text


def parse_published_dt(iso: str) -> datetime | None:
    if not iso:
        return None
    text = iso.replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(text).astimezone(timezone.utc)
    except ValueError:
        return None


def read_csv_rows() -> tuple[list[str], list[list[str]]]:
    if not os.path.isfile(CSV_PATH):
        return ["제목", "URL", "업로드일"], []
    with open(CSV_PATH, encoding="utf-8-sig", newline="") as f:
        rows = list(csv.reader(f))
    if not rows:
        return ["제목", "URL", "업로드일"], []
    header = rows[0]
    body = [r for r in rows[1:] if len(r) >= 2 and r[0].strip() and r[1].strip()]
    return header, body


def existing_video_ids(rows: list[list[str]]) -> set[str]:
    ids: set[str] = set()
    for row in rows:
        vid = extract_video_id(row[1].strip())
        if vid:
            ids.add(vid)
    return ids


def csv_row_matches_entry(row: list[str], item: dict) -> bool:
    title = row[0].strip() if row else ""
    pub = row[2].strip() if len(row) > 2 else ""
    return title == item["title"] and pub == item["published"]


def update_csv_rows_for_item(body: list[list[str]], item: dict) -> bool:
    changed = False
    new_row = [item["title"], item["url"], item["published"]]
    for i, row in enumerate(body):
        if extract_video_id(row[1].strip()) != item["id"]:
            continue
        if csv_row_matches_entry(row, item):
            continue
        body[i] = new_row
        changed = True
    return changed


def write_csv(header: list[str], body: list[list[str]]) -> None:
    with open(CSV_PATH, "w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(header)
        writer.writerows(body)


def touch_config_last_updated(cfg: dict) -> None:
    now = datetime.now(timezone.utc).astimezone()
    cfg["lastUpdated"] = now.strftime("%Y-%m")
    os.makedirs(os.path.dirname(CONFIG_PATH), exist_ok=True)
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(cfg, f, ensure_ascii=False, indent=2)
        f.write("\n")


def write_sync_ids(added: list[str], updated: list[str], source: str) -> None:
    """Write sync payload for record-upload-log (added + title/published updates)."""
    added = [i for i in added if i]
    updated = [i for i in updated if i]
    if not added and not updated:
        return
    os.makedirs(os.path.dirname(ADDED_IDS_PATH), exist_ok=True)
    with open(ADDED_IDS_PATH, "w", encoding="utf-8") as f:
        json.dump({"source": source, "added": added, "updated": updated}, f)


def write_added_ids(ids: list[str], source: str) -> None:
    write_sync_ids(ids, [], source)


def merge_entries_into_csv(entries: list[dict], hours: int) -> dict:
    """Append new IDs; update rows when title/published changed for same ID."""
    header, body = read_csv_rows()
    known = existing_video_ids(body)
    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)

    in_window = 0
    to_add: list[dict] = []
    to_update: list[dict] = []
    skipped_unchanged = 0
    skipped_old = 0

    for item in entries:
        pub_dt = parse_published_dt(item["published"])
        if pub_dt and pub_dt >= cutoff:
            in_window += 1
        else:
            skipped_old += 1
        if item["id"] in known:
            if update_csv_rows_for_item(body, item):
                to_update.append(item)
            else:
                skipped_unchanged += 1
            continue
        to_add.append(item)
        known.add(item["id"])

    csv_changed = bool(to_add or to_update)
    if to_add:
        new_rows = [[v["title"], v["url"], v["published"]] for v in to_add]
        body = new_rows + body
    if csv_changed:
        write_csv(header, body)
        touch_config_last_updated(load_config())

    return {
        "header": header,
        "body": body,
        "added": to_add,
        "updated": to_update,
        "skipped_unchanged": skipped_unchanged,
        "skipped_old": skipped_old,
        "in_window": in_window,
        "csv_changed": csv_changed,
    }


def print_merge_summary(
    source_label: str,
    channel: str,
    hours: int,
    entry_count: int,
    result: dict,
) -> None:
    print(f"channel={channel} source={source_label} lookback={hours}h entries={entry_count} in_window={result['in_window']}")
    print(
        f"added={len(result['added'])} updated={len(result['updated'])} "
        f"skipped_unchanged={result['skipped_unchanged']} skipped_older_than_window={result['skipped_old']}"
    )
    for v in result["added"]:
        print(f"  + {v['id']} | {v['published'][:10]} | {v['title'][:80]}")
    for v in result["updated"]:
        print(f"  ~ {v['id']} | {v['published'][:10]} | {v['title'][:80]}")
