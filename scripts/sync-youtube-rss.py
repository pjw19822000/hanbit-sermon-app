#!/usr/bin/env python3
"""
YouTube channel RSS → HanbitMethodistChurch_Videos.csv (fallback when API unavailable).

Fetches the latest ~15 entries from the channel RSS feed. New video IDs are
appended; existing IDs with a different title or published date are updated in place.
"""
from __future__ import annotations

import os
import re
import sys
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from youtube_common import (  # noqa: E402
    channel_id,
    extract_video_id,
    load_config,
    lookback_hours,
    merge_entries_into_csv,
    normalize_published,
    print_merge_summary,
    write_added_ids,
)

NS = {
    "atom": "http://www.w3.org/2005/Atom",
    "yt": "http://www.youtube.com/xml/schemas/2015",
}

BROWSER_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)
RSS_FETCH_ATTEMPTS = 5
RSS_RETRY_DELAYS_SEC = (15, 30, 45, 60, 90)


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


def main() -> int:
    cfg = load_config()
    ch = channel_id(cfg)
    hours = lookback_hours(cfg)

    rss_entries = fetch_rss_entries(ch)
    result = merge_entries_into_csv(rss_entries, hours)
    if result["added"]:
        write_added_ids([v["id"] for v in result["added"]], "rss")

    print_merge_summary("rss", ch, hours, len(rss_entries), result)
    return 0


if __name__ == "__main__":
    sys.exit(main())
