#!/usr/bin/env python3
"""YouTube Data API v3 → HanbitMethodistChurch_Videos.csv (uploads playlist)."""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from youtube_common import (  # noqa: E402
    api_key,
    api_sync_limits,
    channel_id,
    load_config,
    lookback_hours,
    merge_entries_into_csv,
    normalize_published,
    print_merge_summary,
    write_added_ids,
)

API_BASE = "https://www.googleapis.com/youtube/v3"


def api_get(path: str, params: dict, key: str) -> dict:
    q = {**params, "key": key}
    url = f"{API_BASE}/{path}?{urllib.parse.urlencode(q)}"
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")[:500]
        raise SystemExit(f"YouTube API HTTP {e.code}: {body}") from e


def uploads_playlist_id(ch: str, key: str) -> str:
    data = api_get("channels", {"part": "contentDetails", "id": ch}, key)
    items = data.get("items") or []
    if not items:
        raise SystemExit(f"channel not found: {ch}")
    uploads = items[0].get("contentDetails", {}).get("relatedPlaylists", {}).get("uploads")
    if not uploads:
        raise SystemExit("uploads playlist id missing")
    return uploads


def fetch_upload_entries(playlist_id: str, key: str, per_page: int, max_pages: int) -> list[dict]:
    entries: list[dict] = []
    page_token = ""
    for _ in range(max_pages):
        params: dict = {
            "part": "snippet",
            "playlistId": playlist_id,
            "maxResults": str(per_page),
        }
        if page_token:
            params["pageToken"] = page_token
        data = api_get("playlistItems", params, key)
        for item in data.get("items") or []:
            snippet = item.get("snippet") or {}
            rid = snippet.get("resourceId") or {}
            video_id = (rid.get("videoId") or "").strip()
            title = (snippet.get("title") or "").strip()
            published = normalize_published(snippet.get("publishedAt") or "")
            if not video_id or not title or title == "Private video" or title == "Deleted video":
                continue
            entries.append(
                {
                    "id": video_id,
                    "title": title,
                    "published": published,
                    "url": f"https://www.youtube.com/watch?v={video_id}",
                }
            )
        page_token = data.get("nextPageToken") or ""
        if not page_token:
            break
    return entries


def main() -> int:
    key = api_key()
    if not key:
        raise SystemExit("YOUTUBE_API_KEY not set")

    cfg = load_config()
    ch = channel_id(cfg)
    hours = lookback_hours(cfg)
    per_page, max_pages = api_sync_limits(cfg)

    playlist_id = uploads_playlist_id(ch, key)
    print(f"API uploads playlist={playlist_id} maxResults={per_page} pages={max_pages}", file=sys.stderr)

    entries = fetch_upload_entries(playlist_id, key, per_page, max_pages)
    print(f"API OK: fetched {len(entries)} upload items", file=sys.stderr)

    result = merge_entries_into_csv(entries, hours)
    if result["added"]:
        write_added_ids([v["id"] for v in result["added"]], "api")

    print_merge_summary("api", ch, hours, len(entries), result)
    return 0


if __name__ == "__main__":
    sys.exit(main())
