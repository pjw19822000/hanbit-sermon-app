#!/usr/bin/env python3
"""
YouTube channel RSS → HanbitMethodistChurch_Videos.csv.

Fetches the latest ~15 entries from the channel RSS feed. New video IDs are
appended; existing IDs with a different title or published date are updated in place.
Unclassified titles are handled by build-videos.py (bucket=other → admin review).
"""
from __future__ import annotations

import csv
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSV_PATH = os.path.join(ROOT, "HanbitMethodistChurch_Videos.csv")
CONFIG_PATH = os.path.join(ROOT, "data", "config.json")

NS = {
    "atom": "http://www.w3.org/2005/Atom",
    "yt": "http://www.youtube.com/xml/schemas/2015",
}

DEFAULT_CHANNEL_ID = "UC5rJi-E3aMkb46vVHJArvYg"
DEFAULT_LOOKBACK_HOURS = 72
BROWSER_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)
RSS_FETCH_ATTEMPTS = 5
RSS_RETRY_DELAYS_SEC = (15, 30, 45, 60, 90)


def load_config() -> dict:
    if not os.path.isfile(CONFIG_PATH):
        return {}
    with open(CONFIG_PATH, encoding="utf-8") as f:
        return json.load(f)


def channel_id(cfg: dict) -> str:
    return (
        os.environ.get("YOUTUBE_CHANNEL_ID")
        or cfg.get("youtubeChannelId")
        or DEFAULT_CHANNEL_ID
    ).strip()


def lookback_hours(cfg: dict) -> int:
    raw = os.environ.get("RSS_LOOKBACK_HOURS") or cfg.get("rssLookbackHours") or DEFAULT_LOOKBACK_HOURS
    try:
        return max(24, int(raw))
    except (TypeError, ValueError):
        return DEFAULT_LOOKBACK_HOURS


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
    elif text.endswith("Z"):
        pass
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


def browser_headers(channel: str) -> dict[str, str]:
    return {
        "User-Agent": BROWSER_UA,
        "Accept": "application/atom+xml, application/xml, text/xml, */*;q=0.8",
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
        "Referer": f"https://www.youtube.com/channel/{channel}",
        "Accept-Encoding": "identity",
    }


def rss_feed_urls(channel: str) -> list[str]:
    q = f"channel_id={channel}"
    return [
        f"https://www.youtube.com/feeds/videos.xml?{q}",
        f"http://www.youtube.com/feeds/videos.xml?{q}",
    ]


def _rss_fetch_retryable(exc: BaseException) -> bool:
    if isinstance(exc, urllib.error.HTTPError):
        return exc.code == 404 or exc.code >= 500
    if isinstance(exc, urllib.error.URLError):
        return True
    return False


def _fetch_rss_bytes(url: str, headers: dict[str, str]) -> bytes:
    last_err: BaseException | None = None
    for attempt in range(1, RSS_FETCH_ATTEMPTS + 1):
        req = urllib.request.Request(url, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                return resp.read()
        except urllib.error.HTTPError as e:
            last_err = e
            if attempt < RSS_FETCH_ATTEMPTS and _rss_fetch_retryable(e):
                delay = RSS_RETRY_DELAYS_SEC[min(attempt - 1, len(RSS_RETRY_DELAYS_SEC) - 1)]
                print(
                    f"RSS fetch {url} attempt {attempt}/{RSS_FETCH_ATTEMPTS} "
                    f"failed: HTTP {e.code}, retry in {delay}s",
                    file=sys.stderr,
                )
                time.sleep(delay)
                continue
            raise
        except urllib.error.URLError as e:
            last_err = e
            if attempt < RSS_FETCH_ATTEMPTS:
                delay = RSS_RETRY_DELAYS_SEC[min(attempt - 1, len(RSS_RETRY_DELAYS_SEC) - 1)]
                print(
                    f"RSS fetch {url} attempt {attempt}/{RSS_FETCH_ATTEMPTS} "
                    f"failed: {e}, retry in {delay}s",
                    file=sys.stderr,
                )
                time.sleep(delay)
                continue
            raise
    if last_err is not None:
        raise last_err
    raise RuntimeError("RSS fetch failed with no response")


def _parse_rss_xml(data: bytes) -> list[dict]:
    root = ET.fromstring(data)
    entries = []
    for entry in root.findall("atom:entry", NS):
        vid_el = entry.find("yt:videoId", NS)
        video_id = vid_el.text.strip() if vid_el is not None and vid_el.text else ""
        if not video_id:
            link = entry.find('atom:link[@rel="alternate"]', NS)
            if link is not None:
                video_id = extract_video_id(link.attrib.get("href", ""))
        title_el = entry.find("atom:title", NS)
        pub_el = entry.find("atom:published", NS)
        title = (title_el.text or "").strip() if title_el is not None else ""
        published = normalize_published(pub_el.text if pub_el is not None else "")
        if not video_id or not title:
            continue
        entries.append(
            {
                "id": video_id,
                "title": title,
                "published": published,
                "url": f"https://www.youtube.com/watch?v={video_id}",
            }
        )
    return entries


def fetch_rss_entries(channel: str) -> list[dict]:
    headers = browser_headers(channel)
    errors: list[str] = []
    for url in rss_feed_urls(channel):
        try:
            data = _fetch_rss_bytes(url, headers)
            print(f"RSS OK: {url}", file=sys.stderr)
            return _parse_rss_xml(data)
        except Exception as e:
            msg = f"{url}: {e}"
            errors.append(msg)
            print(f"RSS URL failed ({msg})", file=sys.stderr)
    raise SystemExit("RSS fetch failed for all URLs — " + "; ".join(errors))


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


def csv_row_matches_rss(row: list[str], item: dict) -> bool:
    title = row[0].strip() if row else ""
    pub = row[2].strip() if len(row) > 2 else ""
    return title == item["title"] and pub == item["published"]


def update_csv_rows_for_item(body: list[list[str]], item: dict) -> bool:
    """Update every CSV row with this video ID when title or published differs."""
    changed = False
    new_row = [item["title"], item["url"], item["published"]]
    for i, row in enumerate(body):
        if extract_video_id(row[1].strip()) != item["id"]:
            continue
        if csv_row_matches_rss(row, item):
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


def main() -> int:
    cfg = load_config()
    channel = channel_id(cfg)
    hours = lookback_hours(cfg)
    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)

    rss_entries = fetch_rss_entries(channel)
    header, body = read_csv_rows()
    known = existing_video_ids(body)

    in_window = 0
    to_add: list[dict] = []
    to_update: list[dict] = []
    skipped_unchanged = 0
    skipped_old = 0

    for item in rss_entries:
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
        touch_config_last_updated(cfg)
    if to_add:
        added_ids_path = os.path.join(ROOT, "data", ".rss-added-ids.json")
        os.makedirs(os.path.dirname(added_ids_path), exist_ok=True)
        with open(added_ids_path, "w", encoding="utf-8") as f:
            json.dump([v["id"] for v in to_add], f)

    print(f"channel={channel} lookback={hours}h rss={len(rss_entries)} in_window={in_window}")
    print(
        f"added={len(to_add)} updated={len(to_update)} "
        f"skipped_unchanged={skipped_unchanged} skipped_older_than_window={skipped_old}"
    )
    if to_add:
        for v in to_add:
            print(f"  + {v['id']} | {v['published'][:10]} | {v['title'][:80]}")
    if to_update:
        for v in to_update:
            print(f"  ~ {v['id']} | {v['published'][:10]} | {v['title'][:80]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
