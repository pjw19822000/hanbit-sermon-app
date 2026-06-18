#!/usr/bin/env python3
"""Detect live YouTube broadcast → data/live-status.json for home embed."""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from youtube_common import (  # noqa: E402
    LIVE_STATUS_PATH,
    api_key,
    channel_id,
    load_config,
)

API_BASE = "https://www.googleapis.com/youtube/v3"
LIVE_SCAN_COUNT = 20


def api_get(path: str, params: dict, key: str) -> dict:
    q = {**params, "key": key}
    url = f"{API_BASE}/{path}?{urllib.parse.urlencode(q)}"
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))


def uploads_playlist_id(ch: str, key: str) -> str:
    data = api_get("channels", {"part": "contentDetails", "id": ch}, key)
    items = data.get("items") or []
    if not items:
        raise SystemExit(f"channel not found: {ch}")
    return items[0]["contentDetails"]["relatedPlaylists"]["uploads"]


def recent_video_ids(playlist_id: str, key: str, limit: int) -> list[str]:
    data = api_get(
        "playlistItems",
        {"part": "snippet", "playlistId": playlist_id, "maxResults": str(min(50, limit))},
        key,
    )
    ids: list[str] = []
    for item in data.get("items") or []:
        vid = (item.get("snippet", {}).get("resourceId") or {}).get("videoId")
        if vid:
            ids.append(vid)
        if len(ids) >= limit:
            break
    return ids


def find_live_video(ch: str, key: str) -> dict | None:
    playlist_id = uploads_playlist_id(ch, key)
    video_ids = recent_video_ids(playlist_id, key, LIVE_SCAN_COUNT)
    if not video_ids:
        return None

    data = api_get(
        "videos",
        {"part": "snippet,liveStreamingDetails", "id": ",".join(video_ids)},
        key,
    )
    by_id = {v["id"]: v for v in data.get("items") or [] if v.get("id")}

    for vid in video_ids:
        item = by_id.get(vid)
        if not item:
            continue
        snippet = item.get("snippet") or {}
        if snippet.get("liveBroadcastContent") != "live":
            continue
        title = (snippet.get("title") or "").strip()
        return {
            "videoId": vid,
            "title": title,
            "url": f"https://www.youtube.com/watch?v={vid}",
        }
    return None


def write_live_status(payload: dict) -> None:
    os.makedirs(os.path.dirname(LIVE_STATUS_PATH), exist_ok=True)
    with open(LIVE_STATUS_PATH, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
        f.write("\n")


def main() -> int:
    key = api_key()
    if not key:
        raise SystemExit("YOUTUBE_API_KEY not set")

    cfg = load_config()
    ch = channel_id(cfg)
    checked_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")

    live = find_live_video(ch, key)
    if live:
        payload = {
            "isLive": True,
            "videoId": live["videoId"],
            "title": live["title"],
            "url": live["url"],
            "checkedAt": checked_at,
        }
        print(f"live=ON {live['videoId']} | {live['title'][:60]}")
    else:
        payload = {"isLive": False, "checkedAt": checked_at}
        print("live=OFF")

    write_live_status(payload)
    return 0


if __name__ == "__main__":
    sys.exit(main())
