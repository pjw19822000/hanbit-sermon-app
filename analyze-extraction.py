"""CSV vs videos.json: find speaker/scripture extraction gaps."""
import csv, json, re, os, sys
import importlib.util

ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, ROOT)

spec = importlib.util.spec_from_file_location("bv", os.path.join(ROOT, "build-videos.py"))
bv = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bv)

CSV_PATH = os.path.join(ROOT, "HanbitMethodistChurch_Videos.csv")
JSON_PATH = os.path.join(ROOT, "data", "videos.json")
OUT_PATH = os.path.join(ROOT, "extraction-gaps-report.txt")

BOOKS_RE = bv.BOOKS_RE

SPEAKER_IN_TITLE = re.compile(
    r"[가-힣A-Za-z·]{2,12}\s*(?:담임)?(?:목사|전도사|집사|장로|감독|원장|사모)"
)
SCRIPTURE_IN_TITLE = re.compile(rf"({BOOKS_RE})\s*\d{{1,3}}\s*[장편]")
SCRIPTURE_LOOSE = re.compile(rf"({BOOKS_RE})")


def vid(url):
    m = re.search(r"(?:v=|youtu\.be/|embed/)([A-Za-z0-9_-]{11})", url)
    return m.group(1) if m else url


def classify_speaker_fail(title, sp):
    if sp:
        return None
    if not SPEAKER_IN_TITLE.search(title):
        return None
    tail = title.split("_")[-1] if "_" in title else title
    if re.search(r"(감독|장로|사모|원장)", tail):
        return "role_not_supported"
    if re.search(r"(홍보|광고|스케치|#)", title):
        return "promo_like"
    if re.search(r"(특별|강의|LECTURE|체험|세미나|캠프|기도회\s*\d+부)", title) and "_" in title:
        parts = title.split("_")
        if parts[-1] and not re.search(r"(목사|전도사|집사)$", parts[-1].strip()):
            return "underscore_format"
    return "other"


def classify_scripture_fail(title, scr):
    if scr:
        return None
    if not SCRIPTURE_LOOSE.search(title):
        return None
    if SCRIPTURE_IN_TITLE.search(title):
        return "has_chapter_pattern_but_failed"
    if re.search(rf"({BOOKS_RE})\s*\d", title):
        return "nonstandard_format"
    return "book_only_no_chapter"


def main():
    with open(JSON_PATH, encoding="utf-8") as f:
        db = json.load(f)
    by_id = {v["id"]: v for v in db["videos"]}

    miss_sp = []
    miss_scr = []
    miss_both = []
    sp_wrong = []

    with open(CSV_PATH, encoding="utf-8-sig", newline="") as f:
        reader = csv.reader(f)
        next(reader, None)
        for row in reader:
            if len(row) < 2:
                continue
            title, url = row[0].strip(), row[1].strip()
            if not title or not url:
                continue
            i = vid(url)
            v = by_id.get(i)
            if not v:
                continue

            sp = (v.get("speaker") or "").strip()
            scr = (v.get("scripture") or "").strip()
            py_sp = bv.speaker(title)
            py_scr = bv.scripture(title)[1]

            if SPEAKER_IN_TITLE.search(title) and not sp:
                miss_sp.append({
                    "id": i, "url": url, "title": title,
                    "json_speaker": sp, "json_scripture": scr,
                    "py_speaker": py_sp, "reason": classify_speaker_fail(title, sp),
                })
            if SCRIPTURE_IN_TITLE.search(title) and not scr:
                miss_scr.append({
                    "id": i, "url": url, "title": title,
                    "json_speaker": sp, "json_scripture": scr,
                    "py_scripture": py_scr,
                    "reason": classify_scripture_fail(title, scr),
                })
            if SPEAKER_IN_TITLE.search(title) and SCRIPTURE_IN_TITLE.search(title):
                if not sp or not scr:
                    miss_both.append((i, title, sp, scr))

            if sp and py_sp and sp != py_sp:
                sp_wrong.append((i, title, sp, py_sp))

    lines = []
    w = lines.append
    w("=" * 72)
    w("CSV vs videos.json 추출 누락 분석")
    w("=" * 72)
    w(f"총 JSON 영상: {len(by_id)}")
    w(f"제목에 설교자 패턴 있으나 speaker 비어 있음: {len(miss_sp)}")
    w(f"제목에 본문(장/편) 패턴 있으나 scripture 비어 있음: {len(miss_scr)}")
    w(f"설교자+본문 둘 다 있는데 하나 이상 누락: {len(miss_both)}")
    w("")

    from collections import Counter
    w("--- 설교자 누락 원인 분류 ---")
    for reason, cnt in Counter(x["reason"] for x in miss_sp).most_common():
        w(f"  {reason}: {cnt}")
    w("")

    w("--- 본문 누락 원인 분류 ---")
    for reason, cnt in Counter(x["reason"] for x in miss_scr).most_common():
        w(f"  {reason}: {cnt}")
    w("")

    w("=" * 72)
    w("설교자(speaker) 미추출 목록 전체")
    w("=" * 72)
    for x in miss_sp:
        w(f"\n[{x['reason']}] ID: {x['id']}")
        w(f"URL: {x['url']}")
        w(f"제목: {x['title']}")
        w(f"JSON speaker: {x['json_speaker']!r} | scripture: {x['json_scripture']!r}")
        w(f"build-videos speaker(): {x['py_speaker']!r}")

    w("\n" + "=" * 72)
    w("본문(scripture) 미추출 목록 전체")
    w("=" * 72)
    for x in miss_scr:
        w(f"\n[{x['reason']}] ID: {x['id']}")
        w(f"URL: {x['url']}")
        w(f"제목: {x['title']}")
        w(f"JSON scripture: {x['json_scripture']!r} | speaker: {x['json_speaker']!r}")
        w(f"build-videos scripture(): {x['py_scripture']!r}")

    w("\n" + "=" * 72)
    w("본문 형식은 다르지만 성경책명은 있는 경우 (장/편 없음) — 참고")
    w("=" * 72)
    loose = []
    with open(CSV_PATH, encoding="utf-8-sig", newline="") as f:
        reader = csv.reader(f)
        next(reader, None)
        for row in reader:
            if len(row) < 2:
                continue
            title = row[0].strip()
            url = row[1].strip()
            i = vid(url)
            v = by_id.get(i)
            if not v:
                continue
            scr = (v.get("scripture") or "").strip()
            if scr:
                continue
            if SCRIPTURE_LOOSE.search(title) and not SCRIPTURE_IN_TITLE.search(title):
                loose.append((i, url, title))
    w(f"건수: {len(loose)}")
    for i, url, title in loose[:30]:
        w(f"\nID: {i}\n{title}\n{url}")
    if len(loose) > 30:
        w(f"\n... 외 {len(loose) - 30}건")

    with open(OUT_PATH, "w", encoding="utf-8") as out:
        out.write("\n".join(lines))
    print(f"Report written: {OUT_PATH}")
    print(f"Missing speaker: {len(miss_sp)}, Missing scripture: {len(miss_scr)}, Loose scripture: {len(loose)}")


if __name__ == "__main__":
    main()
