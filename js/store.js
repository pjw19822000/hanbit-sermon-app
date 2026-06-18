/* eslint-disable no-unused-vars */
const Store = (() => {
  let db = null;
  let config = null;
  let overrides = {};
  let customVideos = [];
  let baseVideos = [];
  const LS_CONFIG = 'hanbit-config';
  const LS_OVERRIDES = 'hanbit-overrides';
  const LS_CUSTOM = 'hanbit-custom-videos';
  const LS_FAV = 'hanbit-fav';
  const LS_RECENT = 'hanbit-recent';
  const LS_APP_BUILD = 'hanbit-app-build';
  const LS_UPLOAD_LOG = 'hanbit-upload-log';
  const UPLOAD_LOG_RETENTION_MS = 7 * 86400000;
  const SHARD_NAMES = ['baek', 'prayer', 'associate', 'events', 'praise', 'misc'];
  let shardLoadState = {};
  let allShardsReady = false;
  let indexHomeCounts = null;
  let listCache = null;
  let shardPrefetchPromise = null;

  /** 브라우저·CDN HTTP 캐시를 우회해 항상 최신 JSON을 받는다 */
  function freshFetch(url) {
    const bust = url + (url.includes('?') ? '&' : '?') + '_=' + Date.now();
    return fetch(bust, { cache: 'no-store' });
  }

  function syncAppBuildCache() {
    const build = document.querySelector('meta[name="hanbit-app-build"]')?.content || '';
    if (!build) return;
    const prev = localStorage.getItem(LS_APP_BUILD);
    if (prev && prev !== build) {
      try { localStorage.removeItem('hanbit-videos-cache'); } catch { /* ignore */ }
    }
    try { localStorage.setItem(LS_APP_BUILD, build); } catch { /* ignore */ }
  }

  const DEFAULT_MENUS = {
    baek: { visible: true, type: 'card', icon: '👤', title: '백용현 담임목사', sub: '성경별 · 주제별 · 정기 예배', view: 'baek-hub' },
    prayer: { visible: true, type: 'card', icon: '🙏', title: '기도사역말씀', sub: '기도컨퍼런스 · 50일 기도학교 · 24시간 기도회', view: 'prayer-hub' },
    associate: { visible: true, type: 'link', label: '👥 부사역자', view: 'associate-hub', sub: '교역자별 설교' },
    events: { visible: true, type: 'link', label: '📂 주제·행사', view: 'events-hub', sub: '부흥회 · 세미나 · 홍보' },
    testimony: { visible: true, type: 'link', label: '🎤 간증', view: 'testimony', sub: '간증 영상' },
    praise: { visible: true, type: 'link', label: '🎵 찬양', view: 'praise-hub', sub: '샤론 · 할렐루야 · 찬양제' },
    miscUnclassified: { visible: true, type: 'link', label: '📁 미분류 영상', view: 'misc-unclassified', sub: 'YouTube 업로드 연도별' },
    worshipRegular: { visible: false, type: 'link', label: '📅 정기 예배', view: 'worship-regular', sub: '새벽 · 저녁 · 주일 · 수요' },
    search: { visible: false, type: 'link', label: '🔍 검색', screen: 'search', sub: '제목 · 성경 · 목사' },
    settings: { visible: false, type: 'link', label: '⚙️ 설정', screen: 'settings' }
  };

  const HOME_CARD_ORDER = ['baek', 'prayer'];
  const HOME_LINK_ORDER = ['associate', 'events', 'testimony', 'praise', 'miscUnclassified'];

  const PRAYER_LABELS = {
    'prayer-conference': '기도 컨퍼런스',
    '50day-school': '50일 기도학교',
    '24h-prayer': '24시간 기도회 (영적돌파)',
    '100year-prayer': '100년 기도운동',
    'pastor-seminar': '목회자 세미나',
    'youth-camp': '청소년 기도캠프'
  };

  const SUB_MENU_REGISTRY = {
    baek: [
      { id: 'bible', label: '성경별' },
      { id: 'theme', label: '주제별' },
      { id: 'worship-dawn', label: '새벽기도회' },
      { id: 'worship-evening', label: '저녁기도회' },
      { id: 'worship-sunday', label: '주일예배' },
      { id: 'worship-wed', label: '수요저녁예배' }
    ],
    prayer: Object.entries(PRAYER_LABELS).map(([id, label]) => ({ id, label })),
    events: [
      { id: 'outreach-sendoff', label: '아웃리치 발대식' },
      { id: 'outreach-report', label: '아웃리치 보고예배' },
      { id: 'seminar', label: '세미나/수련회' },
      { id: 'revival', label: '초청설교·부흥회' },
      { id: 'pastor-conference', label: '목자 컨퍼런스' },
      { id: 'promo', label: '홍보' }
    ],
    praise: [
      { id: 'sharon', label: '샤론찬양대' },
      { id: 'hallelujah', label: '할렐루야찬양대' },
      { id: 'festival', label: '찬양제' }
    ],
    associate: [
      { id: '이진현', label: '이진현' },
      { id: '백길부', label: '백길부' },
      { id: '박정원', label: '박정원' },
      { id: '이진협', label: '이진협' },
      { id: '유영광', label: '유영광' },
      { id: '김은국', label: '김은국' },
      { id: '이동수', label: '이동수' },
      { id: '이다니엘', label: '이다니엘' },
      { id: '김대웅', label: '김대웅 전도사' },
      { id: '문희정', label: '문희정 전도사' },
      { id: '이임목사', label: '이임 목사' }
    ]
  };

  const SUB_MENU_GROUP_LABELS = {
    baek: '백용현 담임목사',
    prayer: '기도사역말씀',
    events: '주제·행사',
    praise: '찬양',
    associate: '부사역자'
  };

  const ASSOCIATES = ['이진현','백길부','박정원','이진협','유영광','김은국','이동수','이다니엘','김대웅','문희정','이임목사'];
  const KNOWN_ASSOCIATES = ASSOCIATES.slice(0, 10);
  const ASSOC_DISPLAY = { '김대웅': '김대웅 전도사', '문희정': '문희정 전도사', '이임목사': '이임 목사' };
  const PRAYER_YEAR_SERIES = ['prayer-conference', '50day-school', '24h-prayer', '100year-prayer', 'youth-camp', 'pastor-seminar'];
  const EVENT_BUCKET_MAP = {
    'outreach-sendoff': { bucket: 'events-outreach', eventBucket: 'outreach-sendoff' },
    'outreach-report': { bucket: 'events-outreach', eventBucket: 'outreach-report' },
    'seminar': { bucket: 'events-seminar', eventBucket: 'seminar' },
    'revival': { bucket: 'events-revival', eventBucket: 'revival' },
    'pastor-conference': { bucket: 'events-pastor-conference', eventBucket: 'pastor-conference' },
    'promo': { bucket: 'events-promo', eventBucket: 'promo' }
  };

  function mapEventSub(eventSub) {
    if (!eventSub) return { bucket: 'other' };
    return EVENT_BUCKET_MAP[eventSub] || { bucket: 'events-custom', eventBucket: eventSub };
  }
  const MOVE_CATEGORIES = [
    { id: 'baek-bible', label: '백용현 · 성경별' },
    { id: 'baek-theme', label: '백용현 · 주제별' },
    { id: 'baek-worship', label: '백용현 · 정기 예배' },
    { id: 'prayer', label: '기도사역말씀' },
    { id: 'associate', label: '부사역자' },
    { id: 'events', label: '주제·행사' },
    { id: 'praise', label: '찬양' },
    { id: 'testimony', label: '간증' },
    { id: 'misc-unclassified', label: '미분류 영상 (홈)' }
  ];
  const GUEST_REVIVAL_KEYS = new Set([
    '강원근','강근원','고신일','곽주환','국송근','권균한','김광영','김남석','김성문','김성수',
    '김인수','김정석','김정수','김주엽','남궁권','백승린','손경민','송계영','안정균','이상혁',
    '이선구','장경동','전광','진용식','최병호'
  ]);
  const BAEK_WORSHIPS = ['새벽기도회','저녁기도회','수요저녁예배','주일예배'];
  const MISC_UNCLASSIFIED_BUCKET = 'misc-unclassified';
  const FIELD_DELETE = '__field_delete__';

  function normSpeakerKey(sp) {
    return String(sp || '').replace(/\s+/g, '')
      .replace(/(담임)?(목사|전도사|집사|장로|감독|사모|원장|선교사|교수|총장|찬양사역자)/g, '');
  }

  function normalizeSpeakerRaw(sp, title) {
    const raw = String(sp || '').trim();
    const norm = normSpeakerKey(raw);
    if (norm.includes('아동수')) return '이동수 목사';
    if (norm.includes('백길부') || (norm.startsWith('백길') && norm.length <= 4)) return '백길부 목사';
    if (norm.includes('벡용현') || norm.includes('백용현')) return '백용현 담임목사';
    if (norm === '담임목사' || norm === '담임') return '백용현 담임목사';
    if (norm.includes('최유범')) return '최유범 전도사';
    if (norm.includes('김선룡')) return '김선룡 목사';
    if (norm.includes('문희정')) return '문희정 전도사';
    return raw;
  }

  function isGuestRevivalSpeaker(sp) {
    const norm = normSpeakerKey(normalizeSpeakerRaw(sp));
    return norm ? GUEST_REVIVAL_KEYS.has(norm) : false;
  }

  function resolveAssociateFromSpeaker(sp, title) {
    const normalized = normalizeSpeakerRaw(sp, title);
    const key = normSpeakerKey(normalized);
    if (!key) return '';
    if (key.includes('백용현')) return '__baek__';
    for (const a of getKnownAssociatesList()) {
      if (key.includes(a)) return a;
    }
    return '';
  }

  function canonicalSpeakerKey(sp, title) {
    const normalized = normalizeSpeakerRaw(sp, title);
    const resolved = resolveAssociateFromSpeaker(normalized, title);
    if (resolved && resolved !== '__baek__') return resolved;
    const key = normSpeakerKey(normalized);
    return key || normalized || 'unknown';
  }

  function canonicalSpeakerLabel(sp, title) {
    const normalized = normalizeSpeakerRaw(sp, title);
    const resolved = resolveAssociateFromSpeaker(normalized, title);
    if (resolved === '__baek__') return '백용현 담임목사';
    if (resolved === '김대웅') return '김대웅 전도사';
    if (resolved === '문희정') return '문희정 전도사';
    if (resolved) return `${resolved} 목사`;
    const key = normSpeakerKey(normalized);
    if (!key) return normalized || '이름 미상';
    const role = normalized.match(/(목사|전도사|감독|선교사|교수|총장)/);
    return role ? `${key} ${role[1]}` : normalized;
  }

  function speakerLabelFromKey(key) {
    if (key === '김대웅') return '김대웅 전도사';
    if (key === '문희정') return '문희정 전도사';
    if (KNOWN_ASSOCIATES.includes(key)) return `${key} 목사`;
    const role = String(key || '').match(/(목사|전도사|감독|선교사|교수|총장)$/);
    if (role) return key;
    return key ? `${key} 목사` : '이름 미상';
  }

  function effectiveAssociateId(v) {
    const sp = normalizeSpeakerRaw(v.speaker || '', v.title || '');
    if (isGuestRevivalSpeaker(sp)) return '';
    const resolved = resolveAssociateFromSpeaker(sp, v.title || '');
    if (resolved === '__baek__') return '';
    if (resolved) return resolved;
    return v.associateId || '';
  }

  function applySpeakerRouting(v, out) {
    const title = v.title || '';
    const sp = normalizeSpeakerRaw(out.speaker || v.speaker || '', title);
    out.speaker = sp;
    if (isGuestRevivalSpeaker(sp)) {
      out.bucket = 'events-revival';
      out.eventBucket = 'revival';
      out.associateId = '';
      return out;
    }
    const resolved = resolveAssociateFromSpeaker(sp, title);
    if (resolved === '__baek__') {
      out.isBaek = true;
      out.associateId = '';
      if (out.bucket === 'associate' || out.bucket === 'other') {
        out.bucket = 'baek-regular';
      }
      return out;
    }
    if (resolved && out.bucket === 'associate') {
      out.associateId = resolved;
    }
    return out;
  }

  const BUCKETS = [
    { id: 'baek-regular', label: '백용현 담임목사' },
    { id: 'prayer-ministry', label: '기도사역말씀' },
    { id: 'associate', label: '부사역자' },
    { id: 'praise', label: '찬양' },
    { id: 'events-outreach', label: '아웃리치·선교' },
    { id: 'events-seminar', label: '세미나/수련회' },
    { id: 'events-revival', label: '초청설교·부흥회' },
    { id: 'events-promo', label: '홍보' },
    { id: 'events-pastor-conference', label: '목자 컨퍼런스' },
    { id: 'events-testimony', label: '간증' },
    { id: 'misc-unclassified', label: '미분류 영상' },
    { id: 'other', label: '기타' }
  ];

  function lsGet(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }

  function inferPrayerYear(v) {
    if (v.prayerSeries === 'pastor-seminar') {
      const t = v.title || '';
      let m = t.match(/(20\d{2})[\s_]*(?:(?:목회\s*|전국\s*)*)?기도학교/);
      if (m) return m[1];
      m = t.match(/(20\d{2})\s*목회\s*기도/);
      if (m) return m[1];
      if (/목회자\s*세미나|목회자세미나/.test(t) && /홍보/.test(t)) return '2025';
    }
    if (v.prayerSeries === 'youth-camp' && /동계\s*수련회/.test(v.title || '')) return '2022';
    if (v.date && v.date.length >= 4) return v.date.slice(0, 4);
    if (v.uploadedAt && v.uploadedAt.length >= 4) return v.uploadedAt.slice(0, 4);
    return '';
  }

  function prayerYear(v) {
    if (v.seriesMeta?.year) return String(v.seriesMeta.year);
    return inferPrayerYear(v);
  }

  function worshipYear(v) {
    if (v.date && v.date.length >= 4) return v.date.slice(0, 4);
    if (v.uploadedAt && v.uploadedAt.length >= 4) return String(v.uploadedAt).slice(0, 4);
    return '';
  }

  /** YouTube 업로드 연도 (uploadedAt 우선) */
  function youtubeYear(v) {
    if (v.uploadedAt && v.uploadedAt.length >= 4) return String(v.uploadedAt).slice(0, 4);
    if (v.date && v.date.length >= 4) return v.date.slice(0, 4);
    return '';
  }

  function isWorshipYearHub(st) {
    if (st?.view !== 'baek-worship' && !(st?.view === 'worship-regular' && st.sub)) return false;
    const w = st.sub;
    if (!w || !BAEK_WORSHIPS.includes(w)) return false;
    return !st.year;
  }

  const BIBLE_BOOKS_LIST = [
    '창세기','출애굽기','레위기','민수기','신명기','여호수아','사사기','룻기',
    '사무엘상','사무엘하','열왕기상','열왕기하','역대상','역대하','에스라','느헤미야','에스더',
    '욥기','시편','잠언','전도서','아가','이사야','예레미야','예레미야애가','에스겔','다니엘',
    '호세아','요엘','아모스','오바댜','요나','미가','나훔','하박국','스바냐','학개','스가랴','말라기',
    '마태복음','마가복음','누가복음','요한복음','사도행전','로마서','고린도전서','고린도후서',
    '갈라디아서','에베소서','빌립보서','골로새서','데살로니가전서','데살로니가후서',
    '디모데전서','디모데후서','디도서','빌레몬서','히브리서','야고보서',
    '베드로전서','베드로후서','요한일서','요한이서','요한삼서','유다서','요한계시록'
  ];
  const OT_BOOKS = BIBLE_BOOKS_LIST.slice(0, 39);
  const NT_BOOKS = BIBLE_BOOKS_LIST.slice(39);
  const SPEAKER_ROLES = '목사|전도사|집사|장로|감독|사모|원장|선교사|교수|총장|찬양사역자';
  const BOOK_ALIASES = [['요나서', '요나'], ['요엘서', '요엘'], ['요엥ㄹ', '요엘'], ['예스겔', '에스겔']];

  function normalizeTitleText(t) {
    for (const [old, neu] of BOOK_ALIASES) t = t.split(old).join(neu);
    t = t.replace(/(\d+)정\b/g, '$1장').replace(/(\d+)징\b/g, '$1장');
    const books = BIBLE_BOOKS_LIST.join('|');
    t = t.replace(new RegExp(`(${books})\\s+(\\d{1,3})절\\s+(\\d{1,3})절`, 'g'), '$1 $2장 $3절');
    t = t.replace(new RegExp(`(${books})_\\s*`, 'g'), '$1 ');
    return t;
  }

  function extractSpeakerFromTitle(title) {
    const t = title || '';
    const tail = new RegExp(`_([^_]+(?:${SPEAKER_ROLES})(?:\\([^)]*\\))?(?:[^_]*)?)$`);
    const m = t.match(tail);
    if (m) {
      const inner = new RegExp(`([가-힣A-Za-z·]{2,12}\\s*(?:담임)?(?:${SPEAKER_ROLES}))`);
      const sm = m[1].match(inner);
      return (sm ? sm[1] : m[1]).trim();
    }
    const m2 = t.match(new RegExp(`(백용현\\s*담임목사|[가-힣]{2,6}\\s*(?:담임)?(?:${SPEAKER_ROLES}))`));
    return m2 ? m2[1].trim() : '';
  }

  function extractScriptureFromTitle(title) {
    let t = normalizeTitleText(title || '');
    const books = BIBLE_BOOKS_LIST.join('|');
    const hits = [];
    const re = new RegExp(`(${books})\\s*(\\d{1,3})\\s*[장편]\\s*(\\d{1,3}(?:-\\d{1,3})?)?\\s*절?`, 'g');
    let m;
    while ((m = re.exec(t)) !== null) hits.push({ kind: 'std', m, pos: m.index });
    if (!hits.length) {
      const re2 = new RegExp(`(${books})\\s*(\\d{1,3})\\s*[장편]`, 'g');
      while ((m = re2.exec(t)) !== null) hits.push({ kind: 'std_ch', m, pos: m.index });
    }
    const reC = new RegExp(`(${books})\\s*(\\d{1,3}):(\\d{1,3}(?:-\\d{1,3})?)\\s*절?`, 'g');
    while ((m = reC.exec(t)) !== null) hits.push({ kind: 'colon', m, pos: m.index });
    if (hits.length) {
      hits.sort((a, b) => a.pos - b.pos);
      const { kind, m: best } = hits[hits.length - 1];
      if (kind === 'colon') {
        const book = best[1];
        const chapter = parseInt(best[2], 10) || 0;
        const verse = best[3] || '';
        return {
          book, chapter,
          scripture: verse ? `${book} ${chapter}장 ${verse}절` : `${book} ${chapter}장`,
          bookOrder: BIBLE_BOOKS_LIST.indexOf(book)
        };
      }
      const book = best[1];
      const chapter = parseInt(best[2], 10) || 0;
      const verse = kind === 'std' ? (best[3] || '') : '';
      return {
        book, chapter,
        scripture: verse ? `${book} ${chapter}장 ${verse}절` : `${book} ${chapter}장`,
        bookOrder: BIBLE_BOOKS_LIST.indexOf(book)
      };
    }
    const dm = t.match(new RegExp(`(${books})\\s*(\\d{1,3})-(\\d{1,3})절`));
    if (dm) {
      return {
        book: dm[1], chapter: 0,
        scripture: `${dm[1]} ${dm[2]}-${dm[3]}절`,
        bookOrder: BIBLE_BOOKS_LIST.indexOf(dm[1])
      };
    }
    return { book: '', chapter: 0, scripture: '', bookOrder: 999 };
  }

  function detectPrayerSeries(title) {
    const t = title || '';
    if (/목회자\s*세미나|목회자세미나/i.test(t)) return 'pastor-seminar';
    if (/청소년\s*동계\s*수련회|동계\s*수련회/i.test(t)) return 'youth-camp';
    if (/24\s*시간\s*기도|영적\s*돌파|기도회\s*\d+부|기도\s*\(\d+부\)|신앙적인\s*체험과\s*기도|순례자의\s*삶과\s*기도/i.test(t)) return '24h-prayer';
    if (/기도\s*컨퍼런스|\[\d{4}\s*기도컨퍼런스\]/i.test(t)) return 'prayer-conference';
    if (/50일\s*기도학교/i.test(t)) return '50day-school';
    if (/100\s*년\s*기도/i.test(t)) return '100year-prayer';
    if (/청소년\s*기도\s*캠프|기도\s*캠프/i.test(t)) return 'youth-camp';
    return '';
  }

  function getOverrides() { return overrides; }

  function parseYoutubeId(url) {
    const m = String(url).match(/(?:v=|youtu\.be\/|embed\/)([a-zA-Z0-9_-]{11})/);
    return m ? m[1] : '';
  }

  async function persistCustomVideos() {
    if (Firebase.isEnabled()) await Firebase.saveCustomVideos(customVideos);
    else lsSet(LS_CUSTOM, customVideos);
  }

  function sanitizeOverridePatch(patch) {
    const out = {};
    Object.entries(patch || {}).forEach(([k, v]) => {
      if (v === undefined) return;
      out[k] = v;
    });
    return out;
  }

  function resolvePatchForMemory(prev, patch) {
    const next = { ...(prev || {}) };
    Object.entries(patch || {}).forEach(([k, v]) => {
      if (v === FIELD_DELETE) delete next[k];
      else if (k === 'seriesMeta' && v && typeof v === 'object') {
        next.seriesMeta = { ...(prev?.seriesMeta || {}), ...v };
      } else if (v !== undefined) next[k] = v;
    });
    return next;
  }

  function hasPrayerOverride(o) {
    if (!o || typeof o !== 'object') return false;
    return o.bucket === 'prayer-ministry'
      || o.prayerSeries !== undefined
      || o.seriesMeta !== undefined;
  }

  function overrideToFirestorePatch(prev, next) {
    const patch = {};
    const prevObj = prev || {};
    const nextObj = next || {};
    Object.keys(nextObj).forEach(k => { patch[k] = nextObj[k]; });
    Object.keys(prevObj).forEach(k => {
      if (!(k in nextObj)) patch[k] = FIELD_DELETE;
    });
    return sanitizeOverridePatch(patch);
  }

  function applyPrayerRouteMeta(route, patch, prev = {}) {
    const cat = route?.category;
    if (cat !== 'prayer' && patch.bucket !== 'prayer-ministry') return patch;
    const series = route?.prayerSeries || patch.prayerSeries || '';
    if (!series && !route?.year) return patch;
    const next = { ...patch };
    if (series) next.prayerSeries = series;
    if (route?.year || series) {
      next.seriesMeta = {
        ...(series ? { sub: series } : {}),
        ...(route?.year ? { year: String(route.year) } : {})
      };
    }
    return next;
  }

  function inferRouteFromPatch(patch) {
    if (!patch?.bucket) return null;
    if (patch.bucket === 'prayer-ministry') {
      return { category: 'prayer', prayerSeries: patch.prayerSeries || patch.seriesMeta?.sub || '' };
    }
    if (patch.bucket === 'baek-regular') {
      if (patch.book) return { category: 'baek-bible', book: patch.book };
      if (patch.themes?.length) return { category: 'baek-theme', theme: patch.themes[0] };
      return { category: 'baek-worship', worship: patch.worship || '새벽기도회' };
    }
    if (patch.bucket === 'associate') {
      return { category: 'associate', associateId: patch.associateId || '이임목사' };
    }
    if (patch.bucket === 'praise') {
      return { category: 'praise', praiseSub: patch.praiseSub || '' };
    }
    if (patch.bucket === 'events-testimony') return { category: 'testimony' };
    if (patch.bucket === MISC_UNCLASSIFIED_BUCKET) return { category: 'misc-unclassified' };
    if (String(patch.bucket).startsWith('events') || patch.eventBucket) {
      return { category: 'events', eventSub: patch.eventBucket || '' };
    }
    return null;
  }

  function resolveOverridePrayerSeries(v, o) {
    if (hasPrayerOverride(o)) {
      return o.seriesMeta?.sub || o.prayerSeries || '';
    }
    if (o.prayerSeries) return o.prayerSeries;
    if (o.seriesMeta?.sub) return o.seriesMeta.sub;
    return detectPrayerSeries(v.title) || v.prayerSeries || '';
  }

  function finalizeRoutePatch(route, patch, prev = {}) {
    let p = { ...patch };
    const bucket = p.bucket;
    const cat = route?.category;

    if (isBaekRouteCategory(cat) || bucket === 'baek-regular') {
      p.prayerSeries = FIELD_DELETE;
      p.seriesMeta = FIELD_DELETE;
      p.isBaek = true;
      p.isImPastor = false;
      p.associateId = FIELD_DELETE;
      p.eventBucket = FIELD_DELETE;
      p.praiseSub = FIELD_DELETE;
    } else if (cat === 'prayer' || bucket === 'prayer-ministry') {
      p.isBaek = false;
      p.worship = FIELD_DELETE;
      p.associateId = FIELD_DELETE;
      p.eventBucket = FIELD_DELETE;
      p.praiseSub = FIELD_DELETE;
      if (route?.prayerSeries) p.prayerSeries = route.prayerSeries;
      p = applyPrayerRouteMeta(route, p, prev);
    } else if (cat === 'associate' || bucket === 'associate') {
      p.prayerSeries = FIELD_DELETE;
      p.seriesMeta = FIELD_DELETE;
      p.eventBucket = FIELD_DELETE;
      p.praiseSub = FIELD_DELETE;
    } else if (cat === 'events' || (bucket && String(bucket).startsWith('events'))) {
      p.prayerSeries = FIELD_DELETE;
      p.seriesMeta = FIELD_DELETE;
      p.praiseSub = FIELD_DELETE;
    } else if (cat === 'praise' || bucket === 'praise') {
      p.prayerSeries = FIELD_DELETE;
      p.seriesMeta = FIELD_DELETE;
      p.eventBucket = FIELD_DELETE;
    } else if (cat === 'testimony' || bucket === 'events-testimony') {
      p.prayerSeries = FIELD_DELETE;
      p.seriesMeta = FIELD_DELETE;
      p.eventBucket = FIELD_DELETE;
      p.praiseSub = FIELD_DELETE;
    } else if (cat === 'misc-unclassified' || bucket === MISC_UNCLASSIFIED_BUCKET) {
      p.prayerSeries = FIELD_DELETE;
      p.seriesMeta = FIELD_DELETE;
      p.isBaek = false;
      p.worship = FIELD_DELETE;
      p.associateId = FIELD_DELETE;
      p.eventBucket = FIELD_DELETE;
      p.praiseSub = FIELD_DELETE;
      p.book = FIELD_DELETE;
      p.bookOrder = FIELD_DELETE;
      p.chapter = FIELD_DELETE;
      p.themes = FIELD_DELETE;
    } else if (bucket && bucket !== 'prayer-ministry' && prev.prayerSeries) {
      p.prayerSeries = FIELD_DELETE;
      p.seriesMeta = FIELD_DELETE;
    }
    return sanitizeOverridePatch(p);
  }

  async function setOverride(id, patch) {
    const prev = overrides[id] || {};
    const clean = sanitizeOverridePatch(patch);
    const next = resolvePatchForMemory(prev, clean);
    if (Firebase.isEnabled()) {
      await Firebase.saveOverride(id, overrideToFirestorePatch(prev, next));
    }
    overrides[id] = next;
    if (!Firebase.isEnabled()) lsSet(LS_OVERRIDES, overrides);
  }

  function mergedVideo(v) {
    const base = v.baseAssociateId ?? v.associateId;
    const o = getOverrides()[v.id] || {};
    const im = o.isImPastor;
    const bucket = o.bucket ?? v.bucket;
    let associateId = base;
    if (bucket === 'associate') {
      const sp = normalizeSpeakerRaw(o.speaker ?? v.speaker ?? '', v.title || '');
      const resolved = resolveAssociateFromSpeaker(sp, v.title || '');
      const isBaekSpeaker = !!(v.isBaek || resolved === '__baek__' || /백용현/.test(normSpeakerKey(sp)));
      if (resolved && resolved !== '__baek__') associateId = resolved;
      else if (isBaekSpeaker) associateId = '';
      else if (im === true) associateId = '이임목사';
      else if (im === false) associateId = base;
      else if (!getKnownAssociatesList().includes(base)) associateId = '이임목사';
      else associateId = base;
    }
    if (o.associateId !== undefined && bucket === 'associate') associateId = o.associateId;
    if (o.isImPastor === true) associateId = '이임목사';
    const out = {
      ...v,
      baseAssociateId: base,
      associateId,
      isCustom: !!v.isCustom,
      displayTitle: o.displayTitle ?? v.displayTitle,
      scripture: o.scripture ?? v.scripture,
      sermonTitle: o.sermonTitle ?? v.sermonTitle,
      speaker: o.speaker ?? v.speaker,
      bucket: o.bucket ?? v.bucket,
      book: o.book ?? v.book,
      bookOrder: o.bookOrder ?? v.bookOrder ?? 999,
      chapter: o.chapter ?? v.chapter ?? 0,
      worship: o.worship ?? v.worship,
      themes: o.themes ?? v.themes ?? [],
      isBaek: o.isBaek ?? v.isBaek,
      eventBucket: o.eventBucket ?? v.eventBucket,
      praiseSub: o.praiseSub ?? v.praiseSub,
      adminHidden: o.adminHidden === true
    };
    if (o.seriesMeta && typeof o.seriesMeta === 'object') {
      out.seriesMeta = { ...(v.seriesMeta || {}), ...o.seriesMeta };
    } else if (v.seriesMeta) {
      out.seriesMeta = { ...v.seriesMeta };
    }
    const mergedBucket = o.bucket ?? v.bucket;
    if (mergedBucket === 'prayer-ministry') {
      const ps = resolveOverridePrayerSeries(v, o);
      out.prayerSeries = ps;
      if (ps) {
        out.seriesMeta = { ...(out.seriesMeta || {}), sub: ps };
        if (!out.seriesMeta.year) {
          const inferred = inferPrayerYear({ ...out, seriesMeta: { ...out.seriesMeta, year: undefined } });
          if (inferred) out.seriesMeta.year = inferred;
        }
      } else if (hasPrayerOverride(o)) {
        out.seriesMeta = { ...(out.seriesMeta || {}), sub: '' };
      }
    }
    if (!out.speaker && v.title) {
      const sp = extractSpeakerFromTitle(v.title);
      if (sp) out.speaker = sp;
    }
    if (!out.scripture && v.title) {
      const scr = extractScriptureFromTitle(v.title);
      if (scr.scripture) {
        out.scripture = scr.scripture;
        if (!out.book) out.book = scr.book;
        if (!out.chapter) out.chapter = scr.chapter;
        if (out.bookOrder === 999 && scr.bookOrder < 999) out.bookOrder = scr.bookOrder;
      }
    }
    applySpeakerRouting(v, out);
    return out;
  }

  function rebuildVideoList() {
    if (!db) return;
    db.videos = [...baseVideos, ...customVideos].map(mergedVideo);
    if (!db.videos.length) {
      listCache = null;
      return;
    }
    const vis = db.videos.filter(visible);
    listCache = {
      baekRegular: vis.filter(v => v.bucket === 'baek-regular' && v.isBaek),
      prayer: vis.filter(v => v.bucket === 'prayer-ministry'),
      associate: vis.filter(v => v.bucket === 'associate'),
      events: vis.filter(v => v.bucket && String(v.bucket).startsWith('events-')),
      praise: vis.filter(v => v.bucket === 'praise'),
      miscUnclassified: vis.filter(isMiscFolderVideo)
    };
    syncHomeCountsFromListCache();
  }

  function syncHomeCountsFromListCache() {
    if (!listCache || !allShardsReady) return;
    indexHomeCounts = {
      'baek-hub': countVideos(listCache.baekRegular),
      'prayer-hub': countVideos(listCache.prayer),
      'associate-hub': countVideos(listCache.associate),
      'events-hub': countVideos(listCache.events),
      'testimony': countVideos(listCache.events.filter(v => v.bucket === 'events-testimony')),
      'praise-hub': countVideos(listCache.praise),
      'misc-unclassified': countVideos(listCache.miscUnclassified),
      'worship-regular': countVideos(listCache.baekRegular.filter(v => v.worship))
    };
  }

  function isBaekRouteCategory(cat) {
    return cat === 'baek-bible' || cat === 'baek-theme' || cat === 'baek-worship';
  }

  function getRawVideo(id) {
    return baseVideos.find(v => v.id === id) || customVideos.find(v => v.id === id);
  }

  function detectWorshipFromTitle(title) {
    const t = title || '';
    if (/수요\s*.*?예배|수요저녁/.test(t)) return '수요저녁예배';
    if (/주일\s*저녁|주일저녁/.test(t)) return '주일저녁예배';
    if (/주일\s*[123]부|주일[123]부|주일\s*.*?예배|주일예배/.test(t)) return '주일예배';
    if (/저녁\s*.*?기도|저녁기도회/.test(t)) return '저녁기도회';
    if (/새벽\s*.*?기도|새벽기도회/.test(t)) return '새벽기도회';
    for (const w of BAEK_WORSHIPS) {
      if (t.includes(w)) return w;
    }
    return '';
  }

  function inferBaekRouteFromPatch(patch) {
    if (patch.book) return { category: 'baek-bible', book: patch.book };
    if (patch.themes?.length) return { category: 'baek-theme', theme: patch.themes[0] };
    if (patch.worship) return { category: 'baek-worship', worship: patch.worship };
    return { category: 'baek-worship', worship: '새벽기도회' };
  }

  function enrichBaekPatchForVideo(id, route, basePatch) {
    const raw = getRawVideo(id);
    const v = db?.videos?.find(x => x.id === id) || raw;
    const patch = { ...basePatch };
    patch.bucket = 'baek-regular';
    patch.isBaek = true;
    patch.isImPastor = false;

    const title = raw?.title || v?.title || '';
    let book = patch.book || v?.book || '';
    let bookOrder = patch.bookOrder ?? v?.bookOrder ?? 999;
    let chapter = patch.chapter ?? v?.chapter ?? 0;
    if (route?.book) {
      book = route.book;
      bookOrder = BIBLE_BOOKS_LIST.indexOf(book);
    }
    if (!book && title) {
      const scr = extractScriptureFromTitle(title);
      if (scr.book) {
        book = scr.book;
        bookOrder = scr.bookOrder;
        chapter = scr.chapter || chapter;
        if (!patch.scripture && scr.scripture) patch.scripture = scr.scripture;
      }
    }
    if (book) {
      patch.book = book;
      patch.bookOrder = bookOrder >= 0 ? bookOrder : BIBLE_BOOKS_LIST.indexOf(book);
      if (patch.bookOrder < 0) patch.bookOrder = 999;
      if (chapter) patch.chapter = chapter;
    }

    let themes = Array.isArray(patch.themes) ? [...patch.themes] : (v?.themes ? [...v.themes] : []);
    if (route?.theme) themes = [route.theme];
    else if (!themes.length) themes = ['기타'];
    patch.themes = themes;

    let worship = patch.worship || v?.worship || detectWorshipFromTitle(title);
    if (route?.worship) worship = route.worship;
    if (worship) patch.worship = worship;

    const sp = patch.speaker || v?.speaker || extractSpeakerFromTitle(title);
    if (!sp || !/백용현/.test(normSpeakerKey(sp))) patch.speaker = '백용현 담임목사';
    else patch.speaker = sp;

    patch.prayerSeries = FIELD_DELETE;
    patch.seriesMeta = FIELD_DELETE;
    patch.associateId = FIELD_DELETE;
    patch.eventBucket = FIELD_DELETE;
    patch.praiseSub = FIELD_DELETE;

    return sanitizeOverridePatch(patch);
  }

  function enrichPrayerPatchForVideo(id, route, basePatch, prev = {}) {
    if (!route?.prayerSeries) return sanitizeOverridePatch(basePatch);
    const series = route.prayerSeries;
    const patch = {
      bucket: 'prayer-ministry',
      isBaek: false,
      isImPastor: false,
      prayerSeries: series,
      worship: FIELD_DELETE,
      associateId: FIELD_DELETE,
      eventBucket: FIELD_DELETE,
      praiseSub: FIELD_DELETE,
      book: FIELD_DELETE,
      themes: FIELD_DELETE,
      seriesMeta: {
        sub: series,
        ...(route.year ? { year: String(route.year) } : {})
      }
    };
    return sanitizeOverridePatch(patch);
  }

  function enrichAssociatePatchForVideo(route, basePatch) {
    const patch = { ...basePatch, bucket: 'associate' };
    if (route?.associateId === '이임목사') {
      patch.isImPastor = true;
      if (route.imSpeaker) patch.speaker = speakerLabelFromKey(route.imSpeaker);
    } else if (route?.associateId) {
      patch.isImPastor = false;
      patch.associateId = route.associateId;
      const lbl = associateDisplayLabel(route.associateId);
      patch.speaker = /목사|전도사/.test(lbl) ? lbl : `${route.associateId} 목사`;
    }
    return sanitizeOverridePatch(patch);
  }

  function enrichEventsPatchForVideo(route, basePatch) {
    const mapped = mapEventSub(route?.eventSub);
    return sanitizeOverridePatch({ ...basePatch, ...mapped, isImPastor: false });
  }

  function enrichPraisePatchForVideo(route, basePatch) {
    const patch = { ...basePatch, bucket: 'praise', isImPastor: false };
    if (route?.praiseSub) patch.praiseSub = route.praiseSub;
    return sanitizeOverridePatch(patch);
  }

  function enrichMiscPatchForVideo(basePatch) {
    return sanitizeOverridePatch({
      ...basePatch,
      bucket: MISC_UNCLASSIFIED_BUCKET,
      isImPastor: false,
      isBaek: FIELD_DELETE,
      prayerSeries: FIELD_DELETE,
      seriesMeta: FIELD_DELETE,
      worship: FIELD_DELETE,
      associateId: FIELD_DELETE,
      eventBucket: FIELD_DELETE,
      praiseSub: FIELD_DELETE,
      book: FIELD_DELETE,
      bookOrder: FIELD_DELETE,
      chapter: FIELD_DELETE,
      themes: FIELD_DELETE
    });
  }

  function applyRouteEnrichment(id, route, patch, prev = {}) {
    if (!route?.category) return patch;
    if (route.category === 'misc-unclassified') return enrichMiscPatchForVideo(patch);
    if (isBaekRouteCategory(route.category)) return enrichBaekPatchForVideo(id, route, patch);
    if (route.category === 'prayer') return enrichPrayerPatchForVideo(id, route, patch, prev);
    if (route.category === 'associate') return enrichAssociatePatchForVideo(route, patch);
    if (route.category === 'events') return enrichEventsPatchForVideo(route, patch);
    if (route.category === 'praise') return enrichPraisePatchForVideo(route, patch);
    if (route.category === 'testimony') {
      return sanitizeOverridePatch({ ...patch, bucket: 'events-testimony', isImPastor: false });
    }
    return patch;
  }

  function getListOrderKey(st) {
    if (!st?.view || isListHubState(st)) return '';
    const parts = [st.view];
    if (st.sub) parts.push(st.sub);
    if (st.year) parts.push(st.year);
    if (st.testament) parts.push(st.testament);
    if (st.imSpeaker) parts.push(st.imSpeaker);
    return parts.join('|');
  }

  function applyListOrder(videos, key) {
    if (!key || !videos?.length) return videos;
    const order = config?.listOrders?.[key];
    if (!Array.isArray(order) || !order.length) return videos;
    const rank = new Map(order.map((id, i) => [id, i]));
    const inOrder = [];
    const rest = [];
    videos.forEach(v => {
      if (rank.has(v.id)) inOrder.push(v);
      else rest.push(v);
    });
    inOrder.sort((a, b) => rank.get(a.id) - rank.get(b.id));
    return [...inOrder, ...rest];
  }

  function applyListOrderToGrouped(map, key) {
    if (!key || !map?.size) return map;
    const order = config?.listOrders?.[key];
    if (!Array.isArray(order) || !order.length) return map;
    const rank = new Map(order.map((id, i) => [id, i]));
    const minRank = items => Math.min(...items.map(v => (rank.has(v.id) ? rank.get(v.id) : 999999)));
    const entries = [...map.entries()].sort((a, b) => minRank(a[1]) - minRank(b[1]));
    const out = new Map();
    entries.forEach(([k, items]) => {
      const sorted = [...items].sort((a, b) => {
        const ra = rank.has(a.id) ? rank.get(a.id) : 999999;
        const rb = rank.has(b.id) ? rank.get(b.id) : 999999;
        return ra - rb;
      });
      out.set(k, sorted);
    });
    return out;
  }

  async function saveListOrder(key, ids) {
    if (!key) return;
    if (typeof Admin !== 'undefined' && !Admin.isIn()) throw new Error('관리자 로그인이 필요합니다');
    const listOrders = { ...(config?.listOrders || {}), [key]: [...ids] };
    await saveConfig({ listOrders });
  }

  async function clearListOrder(key) {
    if (!key || !config?.listOrders?.[key]) return;
    if (typeof Admin !== 'undefined' && !Admin.isIn()) throw new Error('관리자 로그인이 필요합니다');
    const listOrders = { ...(config.listOrders || {}) };
    delete listOrders[key];
    await saveConfig({ listOrders });
  }

  async function applyOverride(id, patch, route) {
    const prev = overrides[id] || {};
    const pseudoRoute = route || inferRouteFromPatch(patch);
    let finalPatch = finalizeRoutePatch(pseudoRoute, patch, prev);
    if (pseudoRoute?.category) {
      finalPatch = applyRouteEnrichment(id, pseudoRoute, finalPatch, prev);
    }
    await setOverride(id, finalPatch);
    rebuildVideoList();
  }

  async function toggleAdminHidden(id) {
    const v = db.videos.find(x => x.id === id);
    const next = !(getOverrides()[id]?.adminHidden);
    await applyOverride(id, { adminHidden: next });
    return next;
  }

  function describeUploadFolder(v) {
    const b = v.bucket || 'other';
    const bucketDef = BUCKETS.find(x => x.id === b);
    const parts = [bucketDef?.label || b];
    if (b === 'associate') {
      const aid = v.associateId || effectiveAssociateId(v);
      if (aid) parts.push(ASSOC_DISPLAY[aid] || aid);
    } else if (b === 'baek-regular' && v.worship) {
      parts.push(v.worship);
    } else if (b === 'prayer-ministry' && v.prayerSeries) {
      parts.push(PRAYER_LABELS[v.prayerSeries] || v.prayerSeries);
    } else if (b === 'praise' && v.praiseSub) {
      parts.push(v.praiseSub);
    } else if (v.scripture) {
      parts.push(v.scripture);
    }
    return parts.filter(Boolean).join(' · ');
  }

  function buildUploadLogEntry(v, source) {
    const issues = classifyIssue(v);
    return {
      id: `${source}_${v.id}_${Date.now()}`,
      videoId: v.id,
      title: v.title || v.displayTitle || '',
      url: v.url || `https://www.youtube.com/watch?v=${v.id}`,
      bucket: v.bucket || 'other',
      folderLabel: describeUploadFolder(v),
      status: issues.length ? 'needs_review' : 'classified',
      issues,
      source,
      syncedAt: new Date().toISOString()
    };
  }

  function purgeUploadLogEntries(entries) {
    const cutoff = Date.now() - UPLOAD_LOG_RETENTION_MS;
    return (entries || []).filter(e => {
      const t = Date.parse(e?.syncedAt || '');
      return !Number.isNaN(t) && t >= cutoff;
    });
  }

  async function fetchStaticUploadLogs() {
    try {
      const res = await freshFetch('data/upload-log.json');
      if (!res.ok) return [];
      const data = await res.json();
      return purgeUploadLogEntries(data.entries || []);
    } catch {
      return [];
    }
  }

  async function getLastRssSyncSummary() {
    const entries = (await fetchStaticUploadLogs()).filter((e) => e.source === 'rss' && e.syncedAt);
    if (!entries.length) return null;
    const batches = new Map();
    entries.forEach((e) => {
      const key = e.syncedAt;
      batches.set(key, (batches.get(key) || 0) + 1);
    });
    const [syncedAt, count] = [...batches.entries()].sort((a, b) => b[0].localeCompare(a[0]))[0];
    const d = new Date(syncedAt);
    if (Number.isNaN(d.getTime())) return null;
    const parts = {};
    new Intl.DateTimeFormat('ko-KR', {
      timeZone: 'Asia/Seoul',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      hour12: false
    }).formatToParts(d).forEach((p) => {
      if (p.type !== 'literal') parts[p.type] = p.value;
    });
    const dateLabel = `${parts.month}월 ${parts.day}일 ${parts.hour}시`;
    return { syncedAt, count, dateLabel };
  }

  async function getUploadHistory() {
    const staticEntries = await fetchStaticUploadLogs();
    let remote = [];
    if (Firebase.isEnabled() && Firebase.isAdmin()) {
      try {
        await Firebase.requireAuth();
        remote = await Firebase.getUploadLogs();
      } catch (e) {
        console.warn('uploadLogs fetch failed', e);
      }
    } else if (!Firebase.isEnabled()) {
      remote = purgeUploadLogEntries(lsGet(LS_UPLOAD_LOG, []));
    }
    const seen = new Set();
    const merged = [];
    [...staticEntries, ...remote]
      .sort((a, b) => (b.syncedAt || '').localeCompare(a.syncedAt || ''))
      .forEach(e => {
        const key = `${e.source}|${e.videoId}|${(e.syncedAt || '').slice(0, 19)}`;
        if (seen.has(key)) return;
        seen.add(key);
        merged.push(e);
      });
    return merged;
  }

  async function logUploadEvent(video, source) {
    const entry = buildUploadLogEntry(video, source);
    if (Firebase.isEnabled()) {
      await Firebase.addUploadLog(entry);
      await Firebase.purgeOldUploadLogs();
      return;
    }
    let list = purgeUploadLogEntries(lsGet(LS_UPLOAD_LOG, []));
    list.unshift(entry);
    lsSet(LS_UPLOAD_LOG, list);
  }

  async function addCustomVideo(raw) {
    const id = parseYoutubeId(raw.url);
    if (!id) throw new Error('YouTube URL을 확인하세요');
    if (baseVideos.some(v => v.id === id) || customVideos.some(v => v.id === id)) {
      throw new Error('이미 등록된 영상입니다');
    }
    const today = new Date().toISOString().slice(0, 10);
    const video = {
      id,
      url: `https://www.youtube.com/watch?v=${id}`,
      title: raw.title || raw.displayTitle || '수동 추가',
      displayTitle: raw.displayTitle || raw.title || '수동 추가',
      date: raw.date || today,
      speaker: raw.speaker || '',
      worship: raw.worship || '',
      sermonTitle: raw.sermonTitle || raw.displayTitle || '',
      scripture: raw.scripture || '',
      book: raw.book || '',
      bookOrder: raw.bookOrder ?? 999,
      chapter: raw.chapter ?? 0,
      themes: raw.themes ? (Array.isArray(raw.themes) ? raw.themes : [raw.themes]) : ['기타'],
      bucket: raw.bucket || 'other',
      prayerSeries: raw.prayerSeries || '',
      eventBucket: raw.eventBucket || '',
      praiseSub: raw.praiseSub || '',
      associateId: raw.associateId || '',
      isBaek: raw.bucket === 'baek-regular',
      hidden: false,
      isCustom: true,
      groupKey: `custom|${id}`
    };
    customVideos.push(video);
    await persistCustomVideos();
    rebuildVideoList();
    try {
      await logUploadEvent(video, 'manual');
    } catch (e) {
      console.warn('upload log failed', e);
    }
    return video;
  }

  async function removeCustomVideo(id) {
    customVideos = customVideos.filter(v => v.id !== id);
    await persistCustomVideos();
    rebuildVideoList();
  }

  function getMenus() {
    const saved = config?.menus || {};
    const out = {};
    Object.keys(DEFAULT_MENUS).forEach(k => {
      out[k] = { ...DEFAULT_MENUS[k], ...(saved[k] || {}) };
    });
    return out;
  }

  async function saveMenus(menus) {
    await saveConfig({ menus });
  }

  function shardsForView(view) {
    const map = {
      'baek-hub': ['baek'], 'baek-bible': ['baek'], 'baek-theme': ['baek'],
      'baek-worship': ['baek'], 'worship-regular': ['baek'],
      'prayer-hub': ['prayer'], 'prayer': ['prayer'],
      'associate-hub': ['associate'], 'associate': ['associate'],
      'events-hub': ['events'], 'events': ['events'], 'testimony': ['events'],
      'praise-hub': ['praise'], 'praise': ['praise'],
      'misc-unclassified': ['misc'],
      'unclassified': SHARD_NAMES,
      'search': SHARD_NAMES
    };
    return map[view] || SHARD_NAMES;
  }

  function initShardState(index) {
    shardLoadState = {};
    SHARD_NAMES.forEach(n => {
      shardLoadState[n] = { loaded: false, videos: [], loading: null };
    });
    indexHomeCounts = index.homeCounts || null;
    allShardsReady = false;
    listCache = null;
  }

  function notifyShardsReady() {
    if (typeof UI !== 'undefined' && UI.renderHomeMenus) {
      try { UI.renderHomeMenus(); } catch { /* ignore */ }
    }
    const app = typeof App !== 'undefined' ? App : (typeof window !== 'undefined' ? window.App : null);
    if (app?.onShardsReady) {
      try { app.onShardsReady(); } catch { /* ignore */ }
    }
    if (typeof document !== 'undefined') {
      try { document.dispatchEvent(new CustomEvent('hanbit-shards-ready')); } catch { /* ignore */ }
    }
  }

  function mergeShardVideosIntoBase() {
    baseVideos = SHARD_NAMES.flatMap(n => shardLoadState[n]?.videos || []);
    rebuildVideoList();
    if (SHARD_NAMES.every(n => shardLoadState[n]?.loaded)) {
      allShardsReady = true;
      syncHomeCountsFromListCache();
      notifyShardsReady();
    }
  }

  async function loadShard(name) {
    const state = shardLoadState[name];
    if (!state || state.loaded) return;
    if (state.loading) return state.loading;
    const path = db?.shards?.[name]?.path || `data/shards/${name}.json`;
    state.loading = fetch(path).then(async (res) => {
      if (!res.ok) throw new Error(`shard ${name} ${res.status}`);
      const data = await res.json();
      state.videos = data.videos || [];
      state.loaded = true;
      mergeShardVideosIntoBase();
      state.loading = null;
    }).catch((e) => {
      state.loading = null;
      throw e;
    });
    return state.loading;
  }

  async function ensureShards(names) {
    await Promise.all(names.map(loadShard));
  }

  function isViewReady(view) {
    if (!db?.shards) return baseVideos.length > 0;
    if (allShardsReady) return true;
    return shardsForView(view).every(n => shardLoadState[n]?.loaded);
  }

  async function ensureViewReady(view) {
    if (isViewReady(view)) return;
    await ensureShards(shardsForView(view));
  }

  function prefetchAllShards() {
    if (!db?.shards || allShardsReady) return Promise.resolve();
    if (!shardPrefetchPromise) {
      shardPrefetchPromise = (async () => {
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            await ensureShards(SHARD_NAMES);
            if (allShardsReady) return;
          } catch (e) {
            console.warn(`shard prefetch attempt ${attempt + 1} failed`, e);
            if (attempt < 2) {
              await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
            } else {
              throw e;
            }
          }
        }
      })().catch((e) => {
        console.warn('shard prefetch gave up', e);
        shardPrefetchPromise = null;
      });
    }
    return shardPrefetchPromise;
  }

  function applyDbFromFull(data) {
    db = data;
    baseVideos = data.videos || [];
    allShardsReady = true;
    shardLoadState = {};
    indexHomeCounts = null;
    rebuildVideoList();
  }

  function applyDbFromIndex(index) {
    db = {
      meta: index.meta,
      bibleBooks: index.bibleBooks,
      themes: index.themes,
      associates: index.associates,
      shards: index.shards,
      videos: []
    };
    baseVideos = [];
    initShardState(index);
    rebuildVideoList();
  }

  async function fetchDataBundle() {
    try {
      const res = await fetch('data/index.json');
      if (res.ok) {
        const index = await res.json();
        if (index.format === 'sharded-v1' && index.shards) {
          applyDbFromIndex(index);
          prefetchAllShards();
          return db;
        }
      }
    } catch (e) {
      console.warn('index.json load failed, fallback to monolithic', e);
    }
    const path = window.HANBIT_FIREBASE?.videosPath || 'data/videos.json';
    const cacheKey = 'hanbit-videos-cache';
    const ver = config?.videosVersion || '';
    const cached = (() => { try { return JSON.parse(localStorage.getItem(cacheKey)); } catch { return null; } })();
    try {
      const res = await fetch(path);
      if (!res.ok) throw new Error(`videos.json ${res.status} (${path})`);
      const data = await res.json();
      try {
        localStorage.setItem(cacheKey, JSON.stringify({ version: ver, data }));
      } catch { /* quota */ }
      applyDbFromFull(data);
      return db;
    } catch (e) {
      if (cached?.data) {
        console.warn('videos.json fetch failed, using cache', e);
        applyDbFromFull(cached.data);
        return db;
      }
      throw e;
    }
  }

  async function fetchLocalConfig() {
    return fetch('data/config.json').then(r => r.ok ? r.json() : {}).catch(() => ({}));
  }

  async function loadFirebase() {
    await Firebase.init();
    await Firebase.waitForAuthUser().catch(() => null);
    const local = await fetchLocalConfig();

    try {
      config = await Firebase.getConfig();
    } catch (e) {
      console.warn('Firestore config failed', e);
      config = {};
    }
    const localCached = lsGet(LS_CONFIG, {});
    config = {
      ...local,
      ...localCached,
      ...config,
      adminPassword: local.adminPassword || config?.adminPassword || '0000',
      listOrders: { ...(localCached.listOrders || {}), ...(config?.listOrders || {}) },
      subMenuOrders: { ...(localCached.subMenuOrders || {}), ...(config?.subMenuOrders || {}) },
      homeMenuOrder: (config?.homeMenuOrder?.length ? config.homeMenuOrder : localCached.homeMenuOrder) || config?.homeMenuOrder
    };

    try { overrides = await Firebase.getOverrides(); } catch (e) { console.warn(e); overrides = {}; }
    try { customVideos = await Firebase.getCustomVideos(); } catch (e) { console.warn(e); customVideos = []; }

    await fetchDataBundle();
    lsSet(LS_CONFIG, config);
    return db;
  }

  async function loadLocal() {
    const cfgRes = await fetch('data/config.json').then(r => r.json());
    config = { ...cfgRes, ...lsGet(LS_CONFIG, {}) };
    overrides = lsGet(LS_OVERRIDES, {});
    customVideos = lsGet(LS_CUSTOM, []);
    await fetchDataBundle();
    return db;
  }

  async function load() {
    syncAppBuildCache();
    if (Firebase.isEnabled()) return loadFirebase();
    return loadLocal();
  }

  function homeCountShardsReady(view) {
    if (!db?.shards) return baseVideos.length > 0;
    return shardsForView(view).every((n) => shardLoadState[n]?.loaded);
  }

  function getHomeMenuCount(view) {
    if (!db || !homeCountShardsReady(view)) return null;
    switch (view) {
      case 'baek-hub': return countVideos(baekRegular());
      case 'prayer-hub': return countVideos(prayerMinistry());
      case 'associate-hub': return countVideos(associates());
      case 'events-hub': return countVideos(events());
      case 'testimony': return countVideos(testimony());
      case 'praise-hub': return countVideos(praise());
      case 'misc-unclassified': return countVideos(miscUnclassifiedVideos());
      case 'worship-regular': return countVideos(baekRegular().filter((v) => v.worship));
      default: return null;
    }
  }

  function areHomeCountsReady() {
    if (!db?.shards) return baseVideos.length > 0;
    return allShardsReady;
  }

  function areAllShardsReady() { return allShardsReady; }

  function getConfig() { return config; }

  async function saveConfig(patch) {
    if (patch.listOrders != null || patch.homeMenuOrder != null || patch.subMenuOrders != null) {
      if (typeof Admin !== 'undefined' && !Admin.isIn()) throw new Error('관리자 로그인이 필요합니다');
      if (Firebase.isEnabled()) await Firebase.requireAuth();
    }
    if (Firebase.isEnabled()) await Firebase.saveConfig(patch);
    config = { ...config, ...patch };
    lsSet(LS_CONFIG, config);
  }

  function isSamoritreatPromo(v) {
    return /사모리트릿|사모세니마/i.test(v.title || v.displayTitle || '');
  }

  function visible(v) {
    const o = getOverrides()[v.id];
    if (o?.adminHidden === true || v.adminHidden) return false;
    if (o?.adminHidden === false) return true;
    if (v.hidden) return !!config?.showPromo;
    if (v.bucket === 'events-promo' && !config?.showPromo && !isSamoritreatPromo(v)) return false;
    return true;
  }

  function allVisible() { return db.videos.filter(visible); }

  function baekRegular() {
    if (listCache?.baekRegular) return listCache.baekRegular;
    return allVisible().filter(v => v.bucket === 'baek-regular' && v.isBaek);
  }

  function isMiscFolderVideo(v) {
    const b = v.bucket || '';
    return b === MISC_UNCLASSIFIED_BUCKET || b === 'other';
  }

  function miscUnclassifiedVideos() {
    return allVisible().filter(isMiscFolderVideo);
  }

  function prayerMinistry(series) {
    return allVisible().filter(v => v.bucket === 'prayer-ministry' && (!series || v.prayerSeries === series));
  }

  function associates(id, showHiddenImSpeakers = false) {
    return allVisible().filter(v => {
      const sp = normalizeSpeakerRaw(v.speaker || '', v.title || '');
      if (isGuestRevivalSpeaker(sp)) return false;
      if (resolveAssociateFromSpeaker(sp, v.title || '') === '__baek__') return false;
      const aid = effectiveAssociateId(v);
      if (!id) return v.bucket === 'associate';
      if (id === '이임목사') {
        if (aid !== '이임목사') return false;
        if (!showHiddenImSpeakers && isImSpeakerHidden(canonicalSpeakerKey(v.speaker, v.title))) return false;
        return true;
      }
      return v.bucket === 'associate' && aid === id;
    });
  }

  function getHiddenImSpeakers() {
    const list = config?.hiddenImSpeakers;
    return new Set(Array.isArray(list) ? list : []);
  }

  function isImSpeakerHidden(key) {
    return !!(key && getHiddenImSpeakers().has(key));
  }

  async function toggleHiddenImSpeaker(key) {
    const set = getHiddenImSpeakers();
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    await saveConfig({ hiddenImSpeakers: [...next].sort((a, b) => a.localeCompare(b, 'ko')) });
    return next.has(key);
  }

  function getHiddenSubMenus() {
    const list = config?.hiddenSubMenus;
    return new Set(Array.isArray(list) ? list : []);
  }

  function isSubMenuHidden(group, id) {
    if (getDeletedSubMenus().has(`${group}:${id}`)) return true;
    if (typeof Admin !== 'undefined' && Admin.isIn()) return false;
    return getHiddenSubMenus().has(`${group}:${id}`);
  }

  async function saveHiddenSubMenus(list) {
    await saveConfig({ hiddenSubMenus: [...list].sort() });
  }

  function eventsBySub(type) {
    return allVisible().filter(v => {
      if (!type) return v.bucket && String(v.bucket).startsWith('events-');
      if (type === 'outreach-sendoff') return v.eventBucket === 'outreach-sendoff';
      if (type === 'outreach-report') return v.eventBucket === 'outreach-report';
      if (type === 'outreach') return v.bucket === 'events-outreach';
      if (type === 'seminar') return v.bucket === 'events-seminar';
      if (type === 'revival') return v.bucket === 'events-revival';
      if (type === 'promo') return v.bucket === 'events-promo';
      if (type === 'pastor-conference') return v.bucket === 'events-pastor-conference';
      return v.eventBucket === type;
    });
  }

  function events(type) {
    return eventsBySub(type);
  }

  function praise(sub) {
    return allVisible().filter(v => v.bucket === 'praise' && (!sub || v.praiseSub === sub));
  }

  function testimony() {
    return allVisible().filter(v => v.bucket === 'events-testimony');
  }

  function isMiscUnclassifiedYearHub(st) {
    return st?.view === 'misc-unclassified' && !st.year;
  }

  function classifyIssue(v) {
    const issues = [];
    const bucket = v.bucket || '';
    if (!bucket || bucket === 'other') {
      issues.push('분류(bucket) 없음');
      return issues;
    }
    if (bucket === 'baek-regular') {
      if (!v.isBaek) issues.push('백용현 플래그 없음');
      else if (!v.book && !(v.themes?.length) && !v.worship) issues.push('성경·주제·예배 없음');
      else if (v.worship && !BAEK_WORSHIPS.includes(v.worship)) issues.push('예배 종류 불명');
    } else if (bucket === 'prayer-ministry') {
      if (!v.prayerSeries) issues.push('기도 시리즈 없음');
      else if (!PRAYER_LABELS[v.prayerSeries]) issues.push('알 수 없는 시리즈');
      else if (PRAYER_YEAR_SERIES.includes(v.prayerSeries) && !prayerYear(v)) issues.push('연도 없음');
    else {
      const o = getOverrides()[v.id] || {};
      if (o.prayerSeries && !o.seriesMeta?.year) issues.push('연도 미저장(재이동 필요)');
    }
    } else if (bucket === 'associate') {
      const aid = v.associateId || effectiveAssociateId(v);
      if (!aid) issues.push('교역자 없음');
    } else if (bucket === 'praise') {
      if (!v.praiseSub) issues.push('찬양 하위 없음');
    } else if (bucket === 'events-testimony') {
      /* ok */
    } else if (bucket === MISC_UNCLASSIFIED_BUCKET) {
      /* ok — 홈 미분류 보관함 */
    } else if (bucket.startsWith('events-') || v.eventBucket) {
      /* ok */
    } else {
      issues.push('미지원 분류');
    }
    return issues;
  }

  function isVideoClassified(v) {
    return classifyIssue(v).length === 0;
  }

  function needsAdminReview(v) {
    if (classifyIssue(v).length) return true;
    const o = getOverrides()[v.id] || {};
    if (v.bucket === 'prayer-ministry' && v.prayerSeries && PRAYER_YEAR_SERIES.includes(v.prayerSeries)) {
      if (o.prayerSeries && !o.seriesMeta?.year) return true;
    }
    return false;
  }

  function unclassifiedVideos() {
    return allVisible().filter(v => {
      if (v.bucket === MISC_UNCLASSIFIED_BUCKET) return false;
      if (!v.bucket || v.bucket === 'other') return true;
      return needsAdminReview(v);
    });
  }

  function adminVideoMeta(v) {
    const parts = [];
    if (v.bucket) parts.push(v.bucket);
    if (v.prayerSeries) parts.push(PRAYER_LABELS[v.prayerSeries] || v.prayerSeries);
    if (v.seriesMeta?.year || prayerYear(v)) parts.push(`${v.seriesMeta?.year || prayerYear(v)}년`);
    if (v.worship) parts.push(v.worship);
    if (v.associateId) parts.push(v.associateId);
    const o = getOverrides()[v.id];
    if (o?.prayerSeries && !o?.seriesMeta?.year && PRAYER_YEAR_SERIES.includes(o.prayerSeries || v.prayerSeries)) {
      parts.push('연도 미저장');
    }
    return parts.join(' · ');
  }

  function isBibleBookName(name) {
    return !!name && BIBLE_BOOKS_LIST.includes(name);
  }

  function byBaekView(view, sub, testament) {
    const list = baekRegular();
    if (view === 'bible') {
      if (isBibleBookName(sub)) {
        return list.filter(v => v.book === sub).sort((a, b) => (a.chapter - b.chapter) || b.date.localeCompare(a.date));
      }
      if (sub === '구약' || testament === '구약') return list.filter(v => OT_BOOKS.includes(v.book));
      if (sub === '신약' || testament === '신약') return list.filter(v => NT_BOOKS.includes(v.book));
      if (!sub) return list.filter(v => v.book);
      return list.filter(v => v.book === sub).sort((a, b) => (a.chapter - b.chapter) || b.date.localeCompare(a.date));
    }
    if (view === 'theme') return list.filter(v => v.themes.includes(sub));
    if (view === 'worship') return list.filter(v => v.worship === sub);
    return list;
  }

  function groupByKey(videos, keyFn) {
    const map = new Map();
    videos.forEach(v => {
      const k = keyFn(v);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(v);
    });
    return map;
  }

  function sermonDedupeKey(v) {
    const date = (v.date || v.uploadedAt || '').slice(0, 10);
    const title = (v.sermonTitle || v.displayTitle || '').trim();
    const scr = (v.scripture || '').trim();
    return `${date}|${title}|${scr}`;
  }

  function countUniqueSermons(videos) {
    if (!videos?.length) return 0;
    return new Set(videos.map(sermonDedupeKey)).size;
  }

  function countVideos(videos) {
    return videos?.length || 0;
  }

  function groupBaekWorship(videos) {
    return groupByKey(videos, sermonDedupeKey);
  }

  function groupAssociate(videos) {
    return groupByKey(videos, v => `${v.sermonTitle}|${v.scripture}|${v.associateId}`);
  }

  function thumb(id) { return `https://img.youtube.com/vi/${id}/mqdefault.jpg`; }

  const PRAISE_SEARCH_LABELS = {
    sharon: '샤론찬양대',
    hallelujah: '할렐루야찬양대',
    festival: '찬양제',
    other: '찬양'
  };

  function normalizeSearchText(s) {
    return String(s ?? '').normalize('NFC').toLowerCase();
  }

  function videoSearchHaystack(v) {
    const praiseLabel = v.praiseSub ? (PRAISE_SEARCH_LABELS[v.praiseSub] || v.praiseSub) : '';
    return [
      v.title, v.displayTitle, v.sermonTitle, v.speaker, v.book, v.scripture, praiseLabel
    ].map(normalizeSearchText).join(' ');
  }

  function matchVideoQuery(v, q) {
    const t = normalizeSearchText((q || '').trim());
    if (!t) return true;
    return videoSearchHaystack(v).includes(t);
  }

  function filterVideosByQuery(videos, q) {
    if (!(q || '').trim()) return videos;
    return (videos || []).filter(v => matchVideoQuery(v, q));
  }

  async function search(q, includeHidden) {
    await ensureShards(SHARD_NAMES);
    const pool = includeHidden ? db.videos : allVisible();
    return filterVideosByQuery(pool, q);
  }

  function getVideo(id) {
    return db.videos.find(v => v.id === id);
  }

  function toggleFav(id) {
    const f = lsGet(LS_FAV, {});
    f[id] = !f[id];
    if (!f[id]) delete f[id];
    lsSet(LS_FAV, f);
    return !!f[id];
  }
  function isFav(id) { return !!lsGet(LS_FAV, {})[id]; }

  function recordRecent(v) {
    let r = lsGet(LS_RECENT, []);
    r = r.filter(x => x.id !== v.id);
    r.unshift({ id: v.id, title: v.displayTitle, url: v.url, at: Date.now() });
    lsSet(LS_RECENT, r.slice(0, 30));
  }

  function getDeletedSubMenus() {
    return new Set(Array.isArray(config?.deletedSubMenus) ? config.deletedSubMenus : []);
  }

  function getDeletedAssociates() {
    return new Set(Array.isArray(config?.deletedAssociates) ? config.deletedAssociates : []);
  }

  function getKnownAssociatesList() {
    const custom = (config?.customAssociates || []).map(c => c.id).filter(Boolean);
    const deleted = getDeletedAssociates();
    const deletedSub = getDeletedSubMenus();
    const seen = new Set();
    const out = [];
    for (const a of [...KNOWN_ASSOCIATES, ...custom]) {
      if (deleted.has(a) || deletedSub.has(`associate:${a}`) || seen.has(a)) continue;
      seen.add(a);
      out.push(a);
    }
    return out;
  }

  function associateDisplayLabel(id) {
    return (config?.associateLabels || {})[id] || ASSOC_DISPLAY[id] || id;
  }

  function getSubMenuLabel(group, id, fallback) {
    return (config?.subMenuLabels || {})[`${group}:${id}`] || fallback;
  }

  /** 표시 이름·ID 키워드로 하위 메뉴 이모지 추천 (관리자 추가 폴더용) */
  const SUB_MENU_ICON_RULES = [
    { test: /수험생|수능|종일\s*기도|종일기도/, icon: '🎓' },
    { test: /목장/, icon: '🐑' },
    { test: /명절|설날|추석|인사/, icon: '🧧' },
    { test: /^기타|기타\s/, icon: '🎬' },
    { test: /아웃리치|발대/, icon: '🚀' },
    { test: /보고/, icon: '📋' },
    { test: /부흥|초청/, icon: '🔥' },
    { test: /세미나|수련회/, icon: '📚' },
    { test: /컨퍼런스|목자/, icon: '🎤' },
    { test: /홍보/, icon: '📢' },
    { test: /찬양제/, icon: '🎼' },
    { test: /찬양|샤론|할렐루야/, icon: '🎵' },
    { test: /기도/, icon: '🙏' },
    { test: /간증/, icon: '🎤' },
    { test: /성경/, icon: '📜' },
    { test: /주제/, icon: '🎯' },
    { test: /새벽/, icon: '🌅' },
    { test: /저녁/, icon: '🌙' },
    { test: /주일/, icon: '✝️' },
    { test: /수요/, icon: '📖' },
    { test: /예배/, icon: '✝️' }
  ];

  function suggestSubMenuIcon(label, id, fallback = '📂') {
    const text = `${label || ''} ${id || ''}`.trim();
    if (!text) return fallback;
    for (const rule of SUB_MENU_ICON_RULES) {
      if (rule.test.test(text)) return rule.icon;
    }
    return fallback;
  }

  function applyStoredOrder(items, orderIds, idFn) {
    if (!Array.isArray(orderIds) || !orderIds.length || !items?.length) return items;
    const rank = new Map(orderIds.map((id, i) => [id, i]));
    const inOrder = [];
    const rest = [];
    items.forEach(it => {
      const id = idFn(it);
      if (rank.has(id)) inOrder.push(it);
      else rest.push(it);
    });
    inOrder.sort((a, b) => rank.get(idFn(a)) - rank.get(idFn(b)));
    return [...inOrder, ...rest];
  }

  function getDefaultHomeMenuOrder() {
    return [...HOME_CARD_ORDER, ...HOME_LINK_ORDER];
  }

  function getHomeMenuOrder() {
    const defaultOrder = getDefaultHomeMenuOrder();
    const stored = config?.homeMenuOrder;
    if (!Array.isArray(stored) || !stored.length) return defaultOrder;
    const valid = new Set(defaultOrder);
    const seen = new Set();
    const out = [];
    stored.forEach(k => {
      if (valid.has(k) && !seen.has(k)) { out.push(k); seen.add(k); }
    });
    defaultOrder.forEach(k => { if (!seen.has(k)) out.push(k); });
    return out;
  }

  function getSubMenuItems(group) {
    const deleted = getDeletedSubMenus();
    const base = SUB_MENU_REGISTRY[group] || [];
    const custom = config?.customSubMenus?.[group] || [];
    const seen = new Set();
    const out = [];
    for (const item of [...base, ...custom]) {
      if (!item?.id || seen.has(item.id) || deleted.has(`${group}:${item.id}`)) continue;
      seen.add(item.id);
      out.push({ id: item.id, label: getSubMenuLabel(group, item.id, item.label || item.id) });
    }
    return applyStoredOrder(out, config?.subMenuOrders?.[group], x => x.id);
  }

  function getAllSubMenuItemsForAdmin(group) {
    const deleted = getDeletedSubMenus();
    const base = SUB_MENU_REGISTRY[group] || [];
    const custom = config?.customSubMenus?.[group] || [];
    const seen = new Set();
    const active = [];
    for (const item of [...base, ...custom]) {
      if (!item?.id || seen.has(item.id)) continue;
      seen.add(item.id);
      const key = `${group}:${item.id}`;
      active.push({
        id: item.id,
        label: getSubMenuLabel(group, item.id, item.label || item.id),
        isCustom: !base.some(b => b.id === item.id),
        isDeleted: deleted.has(key)
      });
    }
    const orderedActive = applyStoredOrder(
      active.filter(x => !x.isDeleted),
      config?.subMenuOrders?.[group],
      x => x.id
    );
    const deletedItems = active.filter(x => x.isDeleted);
    const out = [...orderedActive, ...deletedItems];
    for (const key of deleted) {
      if (!key.startsWith(`${group}:`)) continue;
      const id = key.slice(group.length + 1);
      if (seen.has(id)) continue;
      const baseItem = base.find(b => b.id === id);
      out.push({
        id,
        label: getSubMenuLabel(group, id, baseItem?.label || id),
        isCustom: false,
        isDeleted: true
      });
    }
    return out;
  }

  function getAssociatesList() {
    const deleted = getDeletedAssociates();
    const deletedSub = getDeletedSubMenus();
    const custom = config?.customAssociates || [];
    const seen = new Set();
    const out = [];
    for (const id of [...ASSOCIATES, ...custom.map(c => c.id)]) {
      if (!id || seen.has(id) || deleted.has(id) || deletedSub.has(`associate:${id}`)) continue;
      seen.add(id);
      out.push({ id, label: associateDisplayLabel(id) });
    }
    return applyStoredOrder(out, config?.subMenuOrders?.associate, x => x.id);
  }

  function getImSpeakerKeys() {
    const keys = new Set();
    db.videos.filter(v => v.bucket === 'associate' && effectiveAssociateId(v) === '이임목사').forEach(v => {
      keys.add(canonicalSpeakerKey(v.speaker, v.title));
    });
    return [...keys].sort((a, b) => speakerLabelFromKey(a).localeCompare(speakerLabelFromKey(b), 'ko'));
  }

  function filterByTestament(videos, testament) {
    const set = new Set(testament === '구약' ? OT_BOOKS : NT_BOOKS);
    return videos.filter(v => v.book && set.has(v.book));
  }

  function sortScriptureVideos(list) {
    list.sort((a, b) => {
      if (a.bookOrder !== b.bookOrder) return a.bookOrder - b.bookOrder;
      if ((a.chapter || 0) !== (b.chapter || 0)) return (a.chapter || 0) - (b.chapter || 0);
      return (a.date || a.uploadedAt || '').localeCompare(b.date || b.uploadedAt || '');
    });
    return list;
  }

  function isListHubState(st) {
    if (!st?.view) return true;
    if (['baek-hub', 'associate-hub', 'events-hub', 'praise-hub'].includes(st.view)) return true;
    if (st.view === 'baek-bible' && (!st.sub || st.sub === '구약' || st.sub === '신약')) return true;
    if (st.view === 'baek-theme' && !st.sub) return true;
    if (st.view === 'worship-regular' && !st.sub) return true;
    if (isWorshipYearHub(st)) return true;
    if (isMiscUnclassifiedYearHub(st)) return true;
    if (st.view === 'prayer-hub') return true;
    if (st.view === 'prayer' && PRAYER_YEAR_SERIES.includes(st.sub) && !st.year) return true;
    if (st.view === 'associate' && st.sub === '이임목사' && !st.imSpeaker) return true;
    if (st.view === 'associate' && !st.testament) return true;
    return false;
  }

  function videosForListState(st, opts = {}) {
    if (!st?.view || isListHubState(st)) return [];
    const showHiddenIm = !!opts.adminMode;
    let videos = [];

    if (st.view === 'baek-bible') {
      videos = byBaekView('bible', st.sub, st.testament);
    } else if (st.view === 'baek-theme') {
      videos = byBaekView('theme', st.sub);
    } else if (st.view === 'baek-worship' || (st.view === 'worship-regular' && st.sub)) {
      const all = byBaekView('worship', st.sub || '새벽기도회');
      videos = st.year ? all.filter(v => worshipYear(v) === st.year) : all;
    } else if (st.view === 'events') {
      videos = events(st.sub);
    } else if (st.view === 'praise') {
      videos = praise(st.sub);
    } else if (st.view === 'testimony') {
      videos = testimony();
    } else if (st.view === 'misc-unclassified') {
      const all = miscUnclassifiedVideos();
      videos = st.year ? all.filter(v => youtubeYear(v) === st.year) : all;
    } else if (st.view === 'prayer') {
      const all = prayerMinistry(st.sub);
      videos = PRAYER_YEAR_SERIES.includes(st.sub) && st.year
        ? all.filter(v => prayerYear(v) === st.year)
        : all;
    } else if (st.view === 'associate') {
      let pool = associates(st.sub, showHiddenIm);
      if (st.sub === '이임목사' && st.imSpeaker) {
        pool = pool.filter(v => canonicalSpeakerKey(v.speaker, v.title) === st.imSpeaker);
      }
      if (st.testament) videos = sortScriptureVideos(filterByTestament(pool, st.testament));
      else videos = pool;
    } else if (st.view === 'unclassified') {
      videos = unclassifiedVideos();
    }
    const key = getListOrderKey(st);
    return applyListOrder(videos, key);
  }

  function describeListState(st) {
    if (!st?.view) return '목록';
    if (isListHubState(st)) return '하위 메뉴(영상 목록 아님)';
    const parts = [VIEW_LABELS[st.view] || st.view];
    if (st.sub) parts.push(st.sub);
    if (st.year) parts.push(`${st.year}년`);
    if (st.testament) parts.push(st.testament);
    if (st.imSpeaker) parts.push(speakerLabelFromKey(st.imSpeaker));
    return parts.join(' · ');
  }

  const VIEW_LABELS = {
    'baek-bible': '백용현·성경별',
    'baek-theme': '백용현·주제별',
    'baek-worship': '백용현·예배',
    'worship-regular': '정기 예배',
    'prayer': '기도사역',
    'associate': '부사역자',
    'events': '주제·행사',
    'praise': '찬양',
    'misc-unclassified': '미분류 영상',
    'testimony': '간증',
    'unclassified': '분류되지 않은 영상',
    'search': '검색'
  };

  function buildRoutePatch(route) {
    if (!route?.category) return {};
    const patch = {};
    switch (route.category) {
      case 'baek-bible':
        patch.bucket = 'baek-regular';
        patch.isBaek = true;
        patch.isImPastor = false;
        if (route.book) {
          patch.book = route.book;
          patch.bookOrder = BIBLE_BOOKS_LIST.indexOf(route.book);
          if (patch.bookOrder < 0) patch.bookOrder = 999;
        }
        break;
      case 'baek-theme':
        patch.bucket = 'baek-regular';
        patch.isBaek = true;
        patch.isImPastor = false;
        if (route.theme) patch.themes = [route.theme];
        break;
      case 'baek-worship':
        patch.bucket = 'baek-regular';
        patch.isBaek = true;
        patch.isImPastor = false;
        patch.worship = route.worship || '새벽기도회';
        break;
      case 'prayer':
        patch.bucket = 'prayer-ministry';
        patch.isImPastor = false;
        if (route.prayerSeries) {
          patch.prayerSeries = route.prayerSeries;
          patch.seriesMeta = {
            sub: route.prayerSeries,
            ...(route.year ? { year: String(route.year) } : {})
          };
        }
        break;
      case 'associate':
        patch.bucket = 'associate';
        if (route.associateId === '이임목사') {
          patch.isImPastor = true;
          if (route.imSpeaker) patch.speaker = speakerLabelFromKey(route.imSpeaker);
        } else if (route.associateId) {
          patch.isImPastor = false;
          patch.associateId = route.associateId;
          const lbl = associateDisplayLabel(route.associateId);
          patch.speaker = /목사|전도사/.test(lbl) ? lbl : `${route.associateId} 목사`;
        }
        break;
      case 'events':
        Object.assign(patch, mapEventSub(route.eventSub));
        patch.isImPastor = false;
        break;
      case 'praise':
        patch.bucket = 'praise';
        patch.isImPastor = false;
        if (route.praiseSub) patch.praiseSub = route.praiseSub;
        break;
      case 'testimony':
        patch.bucket = 'events-testimony';
        patch.isImPastor = false;
        break;
      case 'misc-unclassified':
        patch.bucket = MISC_UNCLASSIFIED_BUCKET;
        patch.isImPastor = false;
        break;
      default:
        break;
    }
    return patch;
  }

  function describeRoute(route) {
    if (!route?.category) return '';
    const cat = MOVE_CATEGORIES.find(c => c.id === route.category);
    const parts = [cat?.label || route.category];
    if (route.book) parts.push(route.book);
    if (route.theme) parts.push(route.theme);
    if (route.worship) parts.push(route.worship);
    if (route.prayerSeries) parts.push(PRAYER_LABELS[route.prayerSeries] || route.prayerSeries);
    if (route.year) parts.push(`${route.year}년`);
    if (route.associateId) parts.push(associateDisplayLabel(route.associateId));
    if (route.imSpeaker) parts.push(speakerLabelFromKey(route.imSpeaker));
    if (route.testament) parts.push(route.testament);
    if (route.eventSub) parts.push(getSubMenuItems('events').find(e => e.id === route.eventSub)?.label || route.eventSub);
    if (route.praiseSub) parts.push(getSubMenuItems('praise').find(p => p.id === route.praiseSub)?.label || route.praiseSub);
    return parts.join(' · ');
  }

  function routeToListState(route) {
    if (!route?.category) return null;
    const st = { s: 'list' };
    switch (route.category) {
      case 'baek-bible':
        st.view = 'baek-bible';
        st.sub = route.book || '';
        if (route.testament) st.testament = route.testament;
        break;
      case 'baek-theme':
        st.view = 'baek-theme';
        st.sub = route.theme || '';
        break;
      case 'baek-worship':
        st.view = 'baek-worship';
        st.sub = route.worship || '새벽기도회';
        if (route.year) st.year = route.year;
        break;
      case 'prayer':
        st.view = 'prayer';
        st.sub = route.prayerSeries || '';
        if (route.year) st.year = route.year;
        break;
      case 'associate':
        st.view = 'associate';
        st.sub = route.associateId || '';
        if (route.imSpeaker) st.imSpeaker = route.imSpeaker;
        if (route.testament) st.testament = route.testament;
        break;
      case 'events':
        st.view = 'events';
        st.sub = route.eventSub || '';
        break;
      case 'praise':
        st.view = 'praise';
        st.sub = route.praiseSub || '';
        break;
      case 'testimony':
        st.view = 'testimony';
        break;
      case 'misc-unclassified':
        st.view = 'misc-unclassified';
        if (route.year) st.year = route.year;
        break;
      default:
        return null;
    }
    return st;
  }

  function getPrayerYears(series) {
    if (!series) return [];
    return [...new Set(prayerMinistry(series).map(v => prayerYear(v)).filter(Boolean))]
      .sort((a, b) => b.localeCompare(a));
  }

  function routeNeedsYear(series) {
    return PRAYER_YEAR_SERIES.includes(series);
  }

  async function bulkApplyOverride(ids, patch, route) {
    if (Firebase.isEnabled() && !Firebase.isAdmin()) {
      throw new Error('관리자 로그인이 필요합니다. 설정에서 다시 로그인해 주세요.');
    }
    const list = [...new Set((ids || []).filter(Boolean))];
    if (!list.length) return 0;
    const batch = {};
    const memoryUpdates = {};
    list.forEach(id => {
      const prev = overrides[id] || {};
      let p = finalizeRoutePatch(route, patch, prev);
      if (route?.category) p = applyRouteEnrichment(id, route, p, prev);
      p = sanitizeOverridePatch(p);
      const next = resolvePatchForMemory(prev, p);
      memoryUpdates[id] = next;
      batch[id] = overrideToFirestorePatch(prev, next);
    });
    if (Firebase.isEnabled()) {
      await Firebase.saveOverridesBatch(batch);
      await Firebase.verifyOverridesSaved(list, memoryUpdates);
      list.forEach(id => { overrides[id] = memoryUpdates[id]; });
    } else {
      list.forEach(id => { overrides[id] = memoryUpdates[id]; });
      lsSet(LS_OVERRIDES, overrides);
    }
    rebuildVideoList();
    return list.length;
  }

  async function saveMenuCustomization(patch) {
    await saveConfig(patch);
  }

  return {
    load, getConfig, saveConfig, getOverrides, setOverride,
    allVisible, baekRegular, miscUnclassifiedVideos, prayerMinistry, associates, events, praise, testimony,
    byBaekView, groupBaekWorship, groupAssociate, sermonDedupeKey, countUniqueSermons, countVideos, thumb, search, filterVideosByQuery, getVideo,
    filterByTestament, getHomeMenuCount, areHomeCountsReady, ensureViewReady, isViewReady, areAllShardsReady, prefetchAllShards,
    toggleFav, isFav, recordRecent, applyOverride, toggleAdminHidden,
    addCustomVideo, removeCustomVideo, getMenus, saveMenus, parseYoutubeId,
    getUploadHistory, getLastRssSyncSummary, describeUploadFolder, buildUploadLogEntry,
    rebuildVideoList, DEFAULT_MENUS, HOME_CARD_ORDER, HOME_LINK_ORDER, BUCKETS,
    PRAYER_LABELS, ASSOCIATES, OT_BOOKS, NT_BOOKS,
    canonicalSpeakerKey, canonicalSpeakerLabel, speakerLabelFromKey, effectiveAssociateId,
    normalizeSpeakerRaw, isGuestRevivalSpeaker,
    getHiddenImSpeakers, isImSpeakerHidden, toggleHiddenImSpeaker,
    SUB_MENU_REGISTRY, SUB_MENU_GROUP_LABELS, getHiddenSubMenus, isSubMenuHidden, saveHiddenSubMenus,
    getSubMenuItems, getAllSubMenuItemsForAdmin, getAssociatesList, getKnownAssociatesList,
    getHomeMenuOrder, getDefaultHomeMenuOrder, getSubMenuLabel, suggestSubMenuIcon, applyStoredOrder,
    associateDisplayLabel, getImSpeakerKeys, videosForListState, isListHubState, describeListState,
    buildRoutePatch, describeRoute, bulkApplyOverride, saveMenuCustomization,
    routeToListState, getPrayerYears, routeNeedsYear,
    isBaekRouteCategory, enrichBaekPatchForVideo, enrichPrayerPatchForVideo, applyRouteEnrichment,
    getListOrderKey, applyListOrder, applyListOrderToGrouped, saveListOrder, clearListOrder,
    classifyIssue, isVideoClassified, unclassifiedVideos, adminVideoMeta,
    inferPrayerYear,
    worshipYear, isWorshipYearHub, youtubeYear, isMiscUnclassifiedYearHub, MISC_UNCLASSIFIED_BUCKET,
    MOVE_CATEGORIES, PRAYER_YEAR_SERIES, EVENT_BUCKET_MAP, BAEK_WORSHIPS,
    db: () => db, prayerYear
  };
})();
