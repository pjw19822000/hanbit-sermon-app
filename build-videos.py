"""HanbitMethodistChurch_Videos.csv → data/videos.json"""
import csv, json, re, os
from datetime import datetime

ROOT = os.path.dirname(os.path.abspath(__file__))
CSV_PATH = os.path.join(ROOT, 'HanbitMethodistChurch_Videos.csv')
OUT_PATH = os.path.join(ROOT, 'data', 'videos.json')

BIBLE_BOOKS = [
  '창세기','출애굽기','레위기','민수기','신명기','여호수아','사사기','룻기',
  '사무엘상','사무엘하','열왕기상','열왕기하','역대상','역대하','에스라','느헤미야','에스더',
  '욥기','시편','잠언','전도서','아가','이사야','예레미야','예레미야애가','에스겔','다니엘',
  '호세아','요엘','아모스','오바댜','요나','미가','나훔','하박국','스바냐','학개','스가랴','말라기',
  '마태복음','마가복음','누가복음','요한복음','사도행전','로마서','고린도전서','고린도후서',
  '갈라디아서','에베소서','빌립보서','골로새서','데살로니가전서','데살로니가후서',
  '디모데전서','디모데후서','디도서','빌레몬서','히브리서','야고보서',
  '베드로전서','베드로후서','요한일서','요한이서','요한삼서','유다서','요한계시록'
]

ASSOCIATES = ['이진현','백길부','박정원','이진협','유영광','김은국','이동수','이다니엘','김대웅','문희정']

GUEST_REVIVAL = {
  '강원근','강근원','고신일','곽주환','국송근','권균한','김광영','김남석','김성문','김성수',
  '김인수','김정석','김정수','김주엽','남궁권','백승린','손경민','송계영','안정균','이상혁',
  '이선구','장경동','전광','진용식','최병호'
}

THEME_RULES = [
  ('기도', ['기도', '기도회', '기도하']),
  ('믿음', ['믿음', '신뢰']),
  ('성령', ['성령', '방언', '충만']),
  ('복음·은혜', ['복음', '은혜', '구원']),
  ('회개·거룩', ['회개', '거룩', '성화']),
  ('십자가', ['십자가', '부활']),
  ('사명·전도', ['사명', '전도', '아웃리치']),
  ('가정·다음세대', ['가정', '자녀', '다음세대', '젊은이']),
  ('고난·치유', ['고난', '치유', '회복', '위로']),
  ('말씀·순종', ['말씀', '순종', '깨달음']),
  ('교회·공동체', ['교회', '성도', '목장', '공동체']),
]

BOOKS_RE = '|'.join(re.escape(b) for b in sorted(BIBLE_BOOKS, key=len, reverse=True))
SPEAKER_ROLES = r'목사|전도사|집사|장로|감독|사모|원장|선교사|교수|총장|찬양사역자'

BOOK_ALIASES = [
  ('요나서', '요나'), ('요엘서', '요엘'), ('요엥ㄹ', '요엘'),
  ('예스겔', '에스겔'),
]

def normalize_title_text(t):
  for old, new in BOOK_ALIASES:
    t = t.replace(old, new)
  t = re.sub(r'(\d+)정\b', r'\1장', t)
  t = re.sub(r'(\d+)징\b', r'\1장', t)
  t = re.sub(rf'({BOOKS_RE})\s+(\d{{1,3}})절\s+(\d{{1,3}})절', r'\1 \2장 \3절', t)
  t = re.sub(rf'({BOOKS_RE})_\s*', r'\1 ', t)
  return t

def vid(url):
  m = re.search(r'(?:v=|youtu\.be/|embed/)([A-Za-z0-9_-]{11})', url)
  return m.group(1) if m else url

def parse_date(t):
  m = re.search(r'[\s_](\d{6})[_\s]', t)
  if not m: return ''
  s = m.group(1)
  return f"20{s[0:2]}-{s[2:4]}-{s[4:6]}"

def scripture(t):
  t = normalize_title_text(t)
  hits = []

  for m in re.finditer(rf'({BOOKS_RE})\s*(\d{{1,3}})\s*[장편]\s*(\d{{1,3}}(?:-\d{{1,3}})?)?\s*절?', t):
    hits.append(('std', m))
  if not hits:
    for m in re.finditer(rf'({BOOKS_RE})\s*(\d{{1,3}})\s*[장편]', t):
      hits.append(('std_ch', m))
  for m in re.finditer(rf'({BOOKS_RE})\s*(\d{{1,3}}):(\d{{1,3}}(?:-\d{{1,3}})?)\s*절?', t):
    hits.append(('colon', m))

  if hits:
    kind, m = max(hits, key=lambda x: x[1].start())
    if kind == 'colon':
      book, ch = m.group(1), int(m.group(2))
      verse = m.group(3) or ''
      scr = f"{book} {ch}장 {verse}절" if verse else f"{book} {ch}장"
      return book, scr.strip(), ch
    book, ch = m.group(1), int(m.group(2))
    verse = m.group(3) or '' if kind == 'std' else ''
    scr = f"{book} {ch}장 {verse}절" if verse else f"{book} {ch}장"
    return book, scr.strip(), ch

  m = re.search(rf'({BOOKS_RE})\s*(\d{{1,3}})-(\d{{1,3}})절', t)
  if m:
    book = m.group(1)
    return book, f"{book} {m.group(2)}-{m.group(3)}절", 0

  return '', '', 0

def speaker(t):
  roles = SPEAKER_ROLES
  m = re.search(rf'_([^_]+(?:{roles})(?:\([^)]+\))?(?:[^_]*)?)$', t)
  if m:
    seg = m.group(1).strip()
    sm = re.search(rf'([가-힣A-Za-z·]{{2,12}}\s*(?:담임)?(?:{roles}))', seg)
    if sm:
      return sm.group(1).strip()
    return seg
  m2 = re.search(rf'(백용현\s*담임목사|[가-힣]{{2,6}}\s*(?:담임)?(?:{roles}))', t)
  return m2.group(1).strip() if m2 else ''

def norm_sp_key(sp):
  s = re.sub(r'\s+', '', sp or '')
  s = re.sub(r'(담임)?(목사|전도사|집사|장로|감독|사모|원장|선교사|교수|총장|찬양사역자)', '', s)
  return s

def normalize_speaker(sp, title=''):
  raw = (sp or '').strip()
  norm = norm_sp_key(raw)
  if '아동수' in norm:
    return '이동수 목사'
  if '백길부' in norm or (norm.startswith('백길') and len(norm) <= 4):
    return '백길부 목사'
  if '벡용현' in norm or '백용현' in norm:
    return '백용현 담임목사'
  if norm in ('담임목사', '담임'):
    return '백용현 담임목사'
  if '최유범' in norm:
    return '최유범 전도사'
  if '김선룡' in norm:
    return '김선룡 목사'
  if '문희정' in norm:
    return '문희정 전도사'
  return raw

def is_guest_revival(sp):
  norm = norm_sp_key(normalize_speaker(sp))
  return norm in GUEST_REVIVAL if norm else False

def is_baek(sp, t):
  norm = norm_sp_key(normalize_speaker(sp, t))
  return '백용현' in norm or '벡용현' in norm or '백용현' in t or norm in ('담임목사', '담임')

def worship(t):
  if re.search(r'새벽\s*기도회|새벽기도회', t): return '새벽기도회'
  if re.search(r'저녁\s*기도회|저녁기도회', t): return '저녁기도회'
  if re.search(r'수요\s*저녁\s*예배|수요저녁예배', t): return '수요저녁예배'
  if re.search(r'주일\s*[123]부|주일[123]부', t): return '주일예배'
  if re.search(r'주일\s*저녁|주일저녁', t): return '주일저녁예배'
  if re.search(r'젊은\s*이\s*예배|젊은이예배', t): return '젊은이예배'
  return ''

def prayer_series(t):
  if re.search(r'목회자\s*세미나|목회자세미나', t): return 'pastor-seminar'
  if re.search(r'청소년\s*동계\s*수련회|동계\s*수련회', t): return 'youth-camp'
  if re.search(r'기도\s*컨퍼런스|\[\d{4}\s*기도컨퍼런스\]', t, re.I): return 'prayer-conference'
  if re.search(r'50일\s*기도학교', t): return '50day-school'
  if re.search(r'100\s*년\s*기도', t): return '100year-prayer'
  if re.search(r'24\s*시간\s*기도|영적\s*돌파', t): return '24h-prayer'
  if re.search(r'기도회\s*\d+부|기도\s*\(\d+부\)|신앙적인\s*체험과\s*기도|순례자의\s*삶과\s*기도', t): return '24h-prayer'
  if re.search(r'목회자\s*세미나|목회자세미나', t): return 'pastor-seminar'
  if re.search(r'청소년\s*기도\s*캠프|기도\s*캠프', t): return 'youth-camp'
  return ''

def is_samoritreat(t):
  return bool(re.search(r'사모리트릿|사모세니마', t, re.I))

def is_pastor_conference(t):
  return bool(re.search(r'목자\s*컨퍼런스', t))

def is_testimony(t):
  if is_pastor_conference(t):
    return False
  return '간증' in t

def is_praise_title(t):
  if re.search(r'할렐루야', t) and re.search(r'목사|전도사|집사|저녁기도회|새벽기도회|저녁\s*기도|새벽\s*기도', t):
    return False
  return bool(re.search(r'샤론_|샤론\s|찬양제|연합찬양|찬양\s*세미나|찬양대|경배와\s*찬양|할렐루야', t))

def guest_role_bucket(t, ps):
  if ps or not re.search(r'선교사|교수|총장|찬양사역자', t):
    return None, ps
  if re.search(r'100\s*년\s*기도', t):
    return 'prayer-ministry', '100year-prayer'
  if re.search(r'24\s*시간\s*기도|영적\s*돌파', t):
    return 'prayer-ministry', '24h-prayer'
  return 'events-revival', ps

def event_bucket(t, ps):
  if ps: return ''
  if is_samoritreat(t): return 'promo'
  if is_pastor_conference(t): return 'pastor-conference'
  if is_testimony(t): return 'testimony'
  if is_praise_title(t): return 'praise'
  if re.search(r'아웃리치|발대식|보고\s*예배|선교\s*대회', t):
    if '발대식' in t: return 'outreach-sendoff'
    if '보고' in t: return 'outreach-report'
    return 'outreach'
  if re.search(r'특별\s*새벽\s*부흥|특별새벽부흥|특별\s*새벽\s*기도|특별새벽기도', t): return 'revival'
  if re.search(r'세미나|수련회|영성\s*수련', t) and not re.search(r'목회자\s*세미나', t): return 'seminar'
  if re.search(r'홍보|스케치|광고|#', t): return 'promo'
  return ''

def praise_sub(t):
  if '샤론' in t: return 'sharon'
  if '할렐루야' in t: return 'hallelujah'
  if '찬양제' in t: return 'festival'
  return 'other'

def themes(st, title):
  text = st + ' ' + title
  out = [tid for tid, kws in THEME_RULES if any(k in text for k in kws)]
  return out or ['기타']

def parse_title(title):
  t = re.sub(r'^\[한빛감리교회\]\s*', '', title)
  t = re.sub(r'^\[?(20\d{2})\s*기도컨퍼런스\]\s*', r'[\1 기도컨퍼런스] ', t)
  dt = parse_date(t)
  m = re.match(r'^(\d{6})_', t)
  rest = t[m.end():] if m else t
  w = worship(rest)
  if w:
    rest = re.sub(re.escape(w) + r'(\([^)]*\))?', '', rest, count=1, flags=re.I)
    rest = re.sub(r'^(설교_?)', '', rest, flags=re.I)
  parts = [p for p in rest.split('_') if p]
  st = parts[0] if parts else title
  st = re.sub(r'\s*설교\s*$', '', st).strip()
  return dt, w, st

def assoc_id(sp):
  norm = re.sub(r'\s+', '', sp or '')
  if '백용현' in norm:
    return ''
  for a in ASSOCIATES:
    if a == '이임목사':
      continue
    if a in norm or a in sp:
      return a
  return ''

def hidden(title):
  if re.search(r'실시간\s*영상\s*스트리밍', title): return True
  if re.match(r'^Prayer\d+$|^Finding\s*Lost|^maranata|^Maranata', title, re.I): return True
  return False

def series_meta(title, ps, dt='', uploaded=''):
  meta = {'year': '', 'lecture': '', 'sub': ps}
  if ps == 'pastor-seminar':
    ym = re.search(r'(20\d{2})[\s_]*(?:(?:목회\s*|전국\s*)*)?기도학교', title)
    if not ym:
      ym = re.search(r'(20\d{2})\s*목회\s*기도', title) or re.search(r'(20\d{2})\s*년?\s*목회', title)
    if ym:
      meta['year'] = ym.group(1)
    elif re.search(r'목회자\s*세미나|목회자세미나', title) and '홍보' in title:
      meta['year'] = '2025'
  if ps == 'youth-camp' and re.search(r'동계\s*수련회', title):
    meta['year'] = '2022'
  if not meta['year']:
    ym = re.search(r'(20\d{2})\s*년', title)
    if not ym:
      ym = re.search(r'(?:^|\s|\[)(20\d{2})(?=\s|\]|년)', title)
    if ym:
      meta['year'] = ym.group(1)
    elif dt and len(dt) >= 4:
      meta['year'] = dt[:4]
    elif uploaded and len(uploaded) >= 4:
      meta['year'] = uploaded[:4]
  lm = re.search(r'(\d{1,2})\s*강', title)
  if lm: meta['lecture'] = lm.group(1)
  return meta

def main():
  videos = []
  stats = {'total': 0, 'hidden': 0, 'baek': 0, 'prayer': 0, 'associate': 0}
  with open(CSV_PATH, encoding='utf-8-sig', newline='') as f:
    reader = csv.reader(f)
    next(reader, None)
    for row in reader:
      if len(row) < 2: continue
      title, url = row[0].strip(), row[1].strip()
      up = row[2].strip() if len(row) > 2 else ''
      if not title or not url: continue
      stats['total'] += 1
      sp = normalize_speaker(speaker(title), title)
      book, scr, ch = scripture(title)
      dt, w, st = parse_title(title)
      ps = prayer_series(title)
      eb = event_bucket(title, ps)
      hid = hidden(title)
      if hid: stats['hidden'] += 1
      baek = is_baek(sp, title)
      aid = assoc_id(sp)
      th = themes(st, title)
      bo = BIBLE_BOOKS.index(book) if book in BIBLE_BOOKS else 999

      bucket = 'other'
      praise_eb = ''
      if is_samoritreat(title):
        bucket = 'events-promo'
        eb = 'promo'
      elif is_pastor_conference(title):
        bucket = 'events-pastor-conference'
        eb = 'pastor-conference'
      elif is_testimony(title):
        bucket = 'events-testimony'
        eb = 'testimony'
      elif is_guest_revival(sp):
        bucket = 'events-revival'
        eb = 'revival'
      elif ps:
        bucket = 'prayer-ministry'; stats['prayer'] += 1
      elif is_praise_title(title):
        bucket = 'praise'
        praise_eb = 'praise'
      else:
        gb, gps = guest_role_bucket(title, ps)
        if gb:
          bucket = gb
          if gps:
            ps = gps
            if bucket == 'prayer-ministry':
              stats['prayer'] += 1
        elif eb == 'praise':
          bucket = 'praise'
          praise_eb = eb
        elif eb.startswith('outreach'): bucket = 'events-outreach'
        elif eb == 'pastor-conference': bucket = 'events-pastor-conference'
        elif eb == 'revival': bucket = 'events-revival'
        elif eb == 'seminar': bucket = 'events-seminar'
        elif eb == 'promo': bucket = 'events-promo'
        elif eb == 'testimony': bucket = 'events-testimony'
        elif baek and w in ('새벽기도회','저녁기도회','수요저녁예배','주일예배'):
          bucket = 'baek-regular'; stats['baek'] += 1
        elif baek:
          bucket = 'baek-regular'; stats['baek'] += 1
        elif aid or (re.search(r'목사|전도사', sp) and not baek):
          bucket = 'associate'; stats['associate'] += 1

      im_aid = ''
      if bucket == 'associate':
        if aid:
          im_aid = aid
        elif baek or '백용현' in norm_sp_key(sp):
          im_aid = ''
        else:
          im_aid = '이임목사'

      videos.append({
        'id': vid(url), 'url': url, 'title': title,
        'displayTitle': st or title[:80], 'uploadedAt': up,
        'date': dt or up[:10], 'speaker': sp, 'worship': w,
        'sermonTitle': st, 'scripture': scr, 'book': book, 'bookOrder': bo,
        'chapter': ch, 'themes': th, 'bucket': bucket, 'prayerSeries': ps,
        'eventBucket': eb, 'praiseSub': praise_sub(title) if praise_eb == 'praise' or eb == 'praise' else '',
        'seriesMeta': series_meta(title, ps, dt, up),
        'associateId': im_aid,
        'isBaek': baek, 'hidden': hid,
        'groupKey': f"{dt}|{st}|{scr}|{sp}"
      })

  videos.sort(key=lambda v: v.get('date') or '', reverse=True)
  os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
  out = {
    'meta': {'generated': datetime.utcnow().isoformat() + 'Z', 'count': len(videos), 'stats': stats},
    'bibleBooks': BIBLE_BOOKS,
    'themes': [t[0] for t in THEME_RULES] + ['기타'],
    'associates': ASSOCIATES + ['이임목사'],
    'videos': videos
  }
  with open(OUT_PATH, 'w', encoding='utf-8') as f:
    json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
  print(f"Wrote {len(videos)} videos")
  print(stats)
  write_shards_and_index(videos, out)


def video_shard(v):
  b = v.get('bucket') or ''
  if b == 'baek-regular':
    return 'baek'
  if b == 'prayer-ministry':
    return 'prayer'
  if b == 'associate':
    return 'associate'
  if b == 'praise':
    return 'praise'
  if b in ('misc-unclassified', 'other'):
    return 'misc'
  if b.startswith('events-') or v.get('eventBucket'):
    return 'events'
  return 'misc'


def sermon_dedupe_key(v):
  date = (v.get('date') or v.get('uploadedAt') or '')[:10]
  title = (v.get('sermonTitle') or v.get('displayTitle') or '').strip()
  scr = (v.get('scripture') or '').strip()
  return f"{date}|{title}|{scr}"


def count_unique(videos):
  return len({sermon_dedupe_key(v) for v in videos})


def is_public_visible(v):
  return not v.get('hidden')


def resolve_associate_from_speaker(sp, title=''):
  normalized = normalize_speaker(sp, title)
  key = norm_sp_key(normalized)
  if not key:
    return ''
  if '백용현' in key or '벡용현' in key:
    return '__baek__'
  for a in ASSOCIATES:
    if a in key:
      return a
  return ''


def apply_client_routing(v):
  """store.js mergedVideo + applySpeakerRouting 과 동일한 bucket 보정"""
  out = dict(v)
  sp = (out.get('speaker') or '').strip()
  if not sp:
    sp = speaker(out.get('title') or '')
  sp = normalize_speaker(sp, out.get('title') or '')
  out['speaker'] = sp
  bucket = out.get('bucket') or 'other'
  if is_guest_revival(sp):
    out['bucket'] = 'events-revival'
    out['eventBucket'] = 'revival'
    out['associateId'] = ''
    return out
  resolved = resolve_associate_from_speaker(sp, out.get('title') or '')
  if resolved == '__baek__':
    out['isBaek'] = True
    out['associateId'] = ''
    if bucket in ('associate', 'other'):
      out['bucket'] = 'baek-regular'
  return out


def client_visible(v, show_promo=False):
  """store.js visible() — showPromo 기본 false"""
  if v.get('hidden'):
    return bool(show_promo)
  bucket = v.get('bucket') or ''
  if bucket == 'events-promo' and not show_promo and not is_samoritreat(v.get('title') or ''):
    return False
  return True


def is_misc_folder_video(v):
  bucket = v.get('bucket') or ''
  return bucket in ('other', 'misc-unclassified')


def compute_home_counts(videos, show_promo=False):
  """홈 메뉴 숫자 — 앱 listCache 와 동일 기준"""
  routed = [apply_client_routing(v) for v in videos]
  vis = [v for v in routed if client_visible(v, show_promo)]
  baek_reg = [v for v in vis if v.get('bucket') == 'baek-regular' and v.get('isBaek')]
  events = [v for v in vis if str(v.get('bucket', '')).startswith('events-')]
  return {
    'baek-hub': len(baek_reg),
    'prayer-hub': len([v for v in vis if v.get('bucket') == 'prayer-ministry']),
    'associate-hub': len([v for v in vis if v.get('bucket') == 'associate']),
    'events-hub': len(events),
    'testimony': len([v for v in vis if v.get('bucket') == 'events-testimony']),
    'praise-hub': len([v for v in vis if v.get('bucket') == 'praise']),
    'misc-unclassified': len([v for v in vis if is_misc_folder_video(v)]),
    'worship-regular': len([v for v in baek_reg if v.get('worship')]),
  }


def write_shards_and_index(videos, out):
  shards_dir = os.path.join(ROOT, 'data', 'shards')
  os.makedirs(shards_dir, exist_ok=True)
  grouped = {name: [] for name in ('baek', 'prayer', 'associate', 'events', 'praise', 'misc')}
  for v in videos:
    grouped[video_shard(v)].append(v)

  shard_meta = {}
  for name, items in grouped.items():
    path = f'data/shards/{name}.json'
    with open(os.path.join(ROOT, path.replace('/', os.sep)), 'w', encoding='utf-8') as f:
      json.dump({'videos': items}, f, ensure_ascii=False, separators=(',', ':'))
    vis = [v for v in items if is_public_visible(v)]
    shard_meta[name] = {'path': path, 'count': len(items), 'visibleCount': len(vis)}

  vis_all = [v for v in videos if is_public_visible(v)]
  home_counts = compute_home_counts(videos)

  index = {
    'meta': out['meta'],
    'bibleBooks': out['bibleBooks'],
    'themes': out['themes'],
    'associates': out['associates'],
    'shards': shard_meta,
    'homeCounts': home_counts,
    'format': 'sharded-v1'
  }
  index_path = os.path.join(ROOT, 'data', 'index.json')
  with open(index_path, 'w', encoding='utf-8') as f:
    json.dump(index, f, ensure_ascii=False, separators=(',', ':'))
  print(f"Wrote index.json + {len(grouped)} shards ({count_unique(vis_all)} visible unique sermons)")

if __name__ == '__main__':
  main()
