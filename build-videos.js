/**
 * HanbitMethodistChurch_Videos.csv → data/videos.json
 * Run: node build-videos.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const CSV_PATH = path.join(ROOT, 'HanbitMethodistChurch_Videos.csv');
const OUT_PATH = path.join(ROOT, 'data', 'videos.json');

const BIBLE_BOOKS = [
  '창세기','출애굽기','레위기','민수기','신명기','여호수아','사사기','룻기',
  '사무엘상','사무엘하','열왕기상','열왕기하','역대상','역대하','에스라','느헤미야','에스더',
  '욥기','시편','잠언','전도서','아가','이사야','예레미야','예레미야애가','에스겔','다니엘',
  '호세아','요엘','아모스','오바댜','요나','미가','나훔','하박국','스바냐','학개','스가랴','말라기',
  '마태복음','마가복음','누가복음','요한복음','사도행전','로마서','고린도전서','고린도후서',
  '갈라디아서','에베소서','빌립보서','골로새서','데살로니가전서','데살로니가후서',
  '디모데전서','디모데후서','디도서','빌레몬서','히브리서','야고보서',
  '베드로전서','베드로후서','요한일서','요한이서','요한삼서','유다서','요한계시록'
];

const ASSOCIATES = [
  { id: '이진현', patterns: ['이진현'] },
  { id: '백길부', patterns: ['백길부'] },
  { id: '박정원', patterns: ['박정원'] },
  { id: '이진협', patterns: ['이진협'] },
  { id: '유영광', patterns: ['유영광'] },
  { id: '김은국', patterns: ['김은국'] },
  { id: '이동수', patterns: ['이동수'] },
  { id: '이다니엘', patterns: ['이다니엘'] },
  { id: '김대웅', patterns: ['김대웅'] }
];

const THEME_RULES = [
  { id: '기도', kw: ['기도', '기도회', '기도하'] },
  { id: '믿음', kw: ['믿음', '신뢰'] },
  { id: '성령', kw: ['성령', '방언', '충만'] },
  { id: '복음·은혜', kw: ['복음', '은혜', '구원'] },
  { id: '회개·거룩', kw: ['회개', '거룩', '성화'] },
  { id: '십자가', kw: ['십자가', '부활'] },
  { id: '사명·전도', kw: ['사명', '전도', '아웃리치'] },
  { id: '가정·다음세대', kw: ['가정', '자녀', '다음세대', '젊은이'] },
  { id: '고난·치유', kw: ['고난', '치유', '회복', '위로'] },
  { id: '말씀·순종', kw: ['말씀', '순종', '깨달음'] },
  { id: '교회·공동체', kw: ['교회', '성도', '목장', '공동체'] }
];

const PRAYER_MINISTRY = [
  { id: 'prayer-conference', test: t => /기도\s*컨퍼런스|\[\d{4}\s*기도컨퍼런스\]/i.test(t) },
  { id: '50day-school', test: t => /50일\s*기도학교/i.test(t) },
  { id: '100year-prayer', test: t => /100\s*년\s*기도/i.test(t) },
  { id: '24h-prayer', test: t => /24\s*시간\s*기도|영적\s*돌파|기도회\s*\d+부|기도\s*\(\d+부\)|신앙적인\s*체험과\s*기도|순례자의\s*삶과\s*기도/i.test(t) },
  { id: 'pastor-seminar', test: t => /목회자\s*세미나|목회자세미나/i.test(t) },
  { id: 'youth-camp', test: t => /청소년\s*기도\s*캠프|기도\s*캠프/i.test(t) }
];

function parseCSV(text) {
  const rows = [];
  let i = 0, field = '', row = [], inQ = false;
  while (i < text.length) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQ = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { inQ = true; i++; continue; }
    if (c === ',') { row.push(field); field = ''; i++; continue; }
    if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0]) rows.push(row);
      row = []; i++; continue;
    }
    field += c; i++;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function extractVideoId(url) {
  const m = url.match(/(?:v=|youtu\.be\/|embed\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : url;
}

function parseDateFromTitle(t) {
  const m = t.match(/[\s_](\d{6})[_\s]/);
  if (!m) return null;
  const s = m[1];
  const yy = parseInt(s.slice(0, 2), 10);
  const mm = s.slice(2, 4);
  const dd = s.slice(4, 6);
  return `20${String(yy).padStart(2, '0')}-${mm}-${dd}`;
}

const SPEAKER_ROLES = '목사|전도사|집사|장로|감독|사모|원장';
const BOOK_ALIASES = [['요나서', '요나'], ['요엘서', '요엘'], ['요엥ㄹ', '요엘'], ['예스겔', '에스겔']];

function normalizeTitleText(t) {
  for (const [old, neu] of BOOK_ALIASES) t = t.split(old).join(neu);
  t = t.replace(/(\d+)정\b/g, '$1장').replace(/(\d+)징\b/g, '$1장');
  const books = BIBLE_BOOKS.join('|');
  t = t.replace(new RegExp(`(${books})\\s+(\\d{1,3})절\\s+(\\d{1,3})절`, 'g'), '$1 $2장 $3절');
  t = t.replace(new RegExp(`(${books})_\\s*`, 'g'), '$1 ');
  return t;
}

function extractScripture(t) {
  t = normalizeTitleText(t);
  const books = BIBLE_BOOKS.join('|');
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
      return { book, chapter, scripture: verse ? `${book} ${chapter}장 ${verse}절` : `${book} ${chapter}장` };
    }
    const book = best[1];
    const chapter = parseInt(best[2], 10) || 0;
    const verse = kind === 'std' ? (best[3] || '') : '';
    return { book, chapter, scripture: verse ? `${book} ${chapter}장 ${verse}절` : `${book} ${chapter}장` };
  }

  const reDash = new RegExp(`(${books})\\s*(\\d{1,3})-(\\d{1,3})절`);
  const dm = t.match(reDash);
  if (dm) {
    return { book: dm[1], chapter: 0, scripture: `${dm[1]} ${dm[2]}-${dm[3]}절` };
  }
  return { book: '', scripture: '', chapter: 0 };
}

function extractSpeaker(t) {
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

function isBaek(speaker, title) {
  return /백용현/.test(speaker) || /백용현/.test(title);
}

function detectWorship(t) {
  if (/새벽\s*기도회|새벽기도회/.test(t)) return '새벽기도회';
  if (/저녁\s*기도회|저녁기도회/.test(t)) return '저녁기도회';
  if (/수요\s*저녁\s*예배|수요저녁예배/.test(t)) return '수요저녁예배';
  if (/주일\s*[123]부|주일[123]부|주일\s*저녁|주일저녁/.test(t)) return '주일예배';
  if (/젊은\s*이\s*예배|젊은이예배/.test(t)) return '젊은이예배';
  return '';
}

function detectPrayerSeries(t) {
  for (const p of PRAYER_MINISTRY) {
    if (p.test(t)) return p.id;
  }
  return '';
}

function detectEventBucket(t, prayerSeries) {
  if (prayerSeries) return '';
  if (/샤론_|샤론\s|할렐루야_|찬양제|연합찬양|찬양\s*세미나/.test(t)) return 'praise';
  if (/아웃리치|발대식|보고\s*예배|선교\s*대회|선교사/.test(t) && !/설교/.test(t.slice(0, 30))) {
    if (/발대식/.test(t)) return 'outreach-sendoff';
    if (/보고/.test(t)) return 'outreach-report';
    return 'outreach';
  }
  if (/특별\s*새벽\s*부흥|특별새벽부흥|특별\s*새벽\s*기도|특별새벽기도/.test(t)) return 'revival';
  if (/세미나|수련회|영성\s*수련|기도\s*세미나/.test(t) && !/목회자\s*세미나/.test(t)) return 'seminar';
  if (/홍보|스케치|광고|#/.test(t)) return 'promo';
  return '';
}

function detectPraiseSub(t) {
  if (/샤론/.test(t)) return 'sharon';
  if (/할렐루야/.test(t)) return 'hallelujah';
  if (/찬양제/.test(t)) return 'festival';
  return 'other';
}

function detectThemes(sermonTitle, title) {
  const text = `${sermonTitle} ${title}`;
  const themes = [];
  for (const r of THEME_RULES) {
    if (r.kw.some(k => text.includes(k))) themes.push(r.id);
  }
  return themes.length ? themes : ['기타'];
}

function parseStructuredTitle(title) {
  let t = title.replace(/^\[한빛감리교회\]\s*/, '').replace(/^\[?\d{4}\s*기도컨퍼런스\]\s*/, '');
  const dm = t.match(/^(\d{6})_/);
  const date = dm ? parseDateFromTitle(t) : parseDateFromTitle(' ' + t);
  let rest = dm ? t.slice(dm[0].length) : t;

  let worship = detectWorship(rest);
  if (worship) {
    rest = rest.replace(new RegExp(worship.replace(/([.*+?^${}()|[\]\\])/g, '\\$1') + '(\\([^)]*\\))?', 'i'), '');
    rest = rest.replace(/^(설교_?|새벽\s*기도회_?|저녁\s*기도회_?)/i, '');
  }

  const parts = rest.split('_').filter(Boolean);
  let sermonTitle = parts[0] || title;
  if (parts.length > 1 && BIBLE_BOOKS.some(b => parts[1].includes(b))) {
    sermonTitle = parts[0];
  } else if (parts.length >= 2 && !/목사|전도사/.test(parts[parts.length - 1])) {
    sermonTitle = parts.slice(0, -1).join(' ').replace(/설교$/, '').trim() || parts[0];
  }

  return { date, worship, sermonTitle: sermonTitle.replace(/\s*설교\s*$/, '').trim() };
}

function associateId(speaker) {
  for (const a of ASSOCIATES) {
    if (a.patterns.some(p => speaker.includes(p))) return a.id;
  }
  return '';
}

function isHidden(title) {
  return /실시간\s*영상\s*스트리밍|^Prayer\d+$|^Finding\s*Lost|^maranata|^Maranata/i.test(title)
    || /^[\d]{6}\s/.test(title) && title.length < 25;
}

function extractSeriesMeta(title, prayerSeries, date, uploadedAt) {
  const meta = { year: '', lecture: '', sub: prayerSeries };
  let ym = title.match(/(20\d{2})\s*년/);
  if (!ym) ym = title.match(/(?:^|\s|\[)(20\d{2})(?=\s|\]|년)/);
  if (ym) meta.year = ym[1];
  else if (date && date.length >= 4) meta.year = date.slice(0, 4);
  else if (uploadedAt && uploadedAt.length >= 4) meta.year = uploadedAt.slice(0, 4);
  const lm = title.match(/(\d{1,2})\s*강/);
  if (lm) meta.lecture = lm[1];
  return meta;
}

function main() {
  const raw = fs.readFileSync(CSV_PATH, 'utf8');
  const rows = parseCSV(raw);
  const header = rows[0];
  if (!header[0].includes('제목')) rows.shift();

  const videos = [];
  const stats = { total: 0, hidden: 0, baek: 0, prayer: 0, associate: 0 };

  for (const row of rows) {
    if (row.length < 2) continue;
    const title = row[0].trim();
    const url = row[1].trim();
    const uploadedAt = row[2] ? row[2].trim() : '';
    if (!title || !url) continue;

    stats.total++;
    const id = extractVideoId(url);
    const speaker = extractSpeaker(title);
    const { book, scripture, chapter } = extractScripture(title);
    const parsed = parseStructuredTitle(title);
    const prayerSeries = detectPrayerSeries(title);
    const eventBucket = detectEventBucket(title, prayerSeries);
    const hidden = isHidden(title);
    if (hidden) stats.hidden++;

    const baek = isBaek(speaker, title);
    const assoc = associateId(speaker);
    const themes = detectThemes(parsed.sermonTitle, title);
    const bookOrder = book ? BIBLE_BOOKS.indexOf(book) : 999;

    let bucket = 'other';
    if (prayerSeries) {
      bucket = 'prayer-ministry';
      stats.prayer++;
    } else if (eventBucket === 'praise') bucket = 'praise';
    else if (eventBucket.startsWith('outreach')) bucket = 'events-outreach';
    else if (eventBucket === 'revival') bucket = 'events-revival';
    else if (eventBucket === 'seminar') bucket = 'events-seminar';
    else if (eventBucket === 'promo') bucket = 'events-promo';
    else if (baek && parsed.worship && ['새벽기도회','저녁기도회','수요저녁예배','주일예배'].includes(parsed.worship)) {
      bucket = 'baek-regular';
      stats.baek++;
    } else if (assoc || (/목사|전도사/.test(speaker) && !baek)) {
      bucket = 'associate';
      stats.associate++;
    }

    const groupKey = `${parsed.date || ''}|${parsed.sermonTitle}|${scripture}|${speaker}`;

    videos.push({
      id,
      url,
      title,
      displayTitle: parsed.sermonTitle || title.slice(0, 80),
      uploadedAt,
      date: parsed.date || uploadedAt.slice(0, 10),
      speaker,
      worship: parsed.worship,
      sermonTitle: parsed.sermonTitle,
      scripture,
      book,
      bookOrder,
      chapter,
      themes,
      bucket,
      prayerSeries,
      eventBucket,
      praiseSub: eventBucket === 'praise' ? detectPraiseSub(title) : '',
      seriesMeta: extractSeriesMeta(title, prayerSeries, parsed.date || uploadedAt.slice(0, 10), uploadedAt),
      associateId: assoc || (bucket === 'associate' ? '이임목사' : ''),
      isBaek: baek,
      hidden,
      groupKey
    });
  }

  videos.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  const out = {
    meta: {
      generated: new Date().toISOString(),
      count: videos.length,
      stats
    },
    bibleBooks: BIBLE_BOOKS,
    themes: THEME_RULES.map(t => t.id).concat(['기타']),
    associates: ASSOCIATES.map(a => a.id).concat(['이임목사']),
    prayerSeries: PRAYER_MINISTRY.map(p => ({ id: p.id })),
    videos
  };

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(out));
  console.log(`Wrote ${videos.length} videos to ${OUT_PATH}`);
  console.log(JSON.stringify(stats, null, 2));
}

main();
