/**
 * 커스텀 행사 폴더 필터·일괄 이동 패치 회귀 테스트
 */
const fs = require('fs');
const path = require('path');

const EVENT_BUCKET_MAP = {
  'outreach-sendoff': { bucket: 'events-outreach', eventBucket: 'outreach-sendoff' },
  'outreach-report': { bucket: 'events-outreach', eventBucket: 'outreach-report' },
  seminar: { bucket: 'events-seminar', eventBucket: 'seminar' },
  revival: { bucket: 'events-revival', eventBucket: 'revival' },
  'pastor-conference': { bucket: 'events-pastor-conference', eventBucket: 'pastor-conference' },
  promo: { bucket: 'events-promo', eventBucket: 'promo' }
};

function mapEventSub(eventSub) {
  if (!eventSub) return { bucket: 'other' };
  return EVENT_BUCKET_MAP[eventSub] || { bucket: 'events-custom', eventBucket: eventSub };
}

function eventsFilter(videos, type) {
  return videos.filter(v => {
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

function oldEventsFilter(videos, type) {
  return videos.filter(v => {
    if (type === 'outreach-sendoff') return v.eventBucket === 'outreach-sendoff';
    if (type === 'outreach-report') return v.eventBucket === 'outreach-report';
    if (type === 'outreach') return v.bucket === 'events-outreach';
    if (type === 'seminar') return v.bucket === 'events-seminar';
    if (type === 'revival') return v.bucket === 'events-revival';
    if (type === 'promo') return v.bucket === 'events-promo';
    if (type === 'pastor-conference') return v.bucket === 'events-pastor-conference';
    return v.bucket && String(v.bucket).startsWith('events-');
  });
}

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    failed++;
  }
}

const customId = 'student-prayer-day';
const mapped = mapEventSub(customId);
assert(mapped.bucket === 'events-custom', 'mapEventSub bucket');
assert(mapped.eventBucket === customId, 'mapEventSub eventBucket');
assert(mapEventSub('seminar').bucket === 'events-seminar', 'known seminar map');

const sample = [
  { id: '1', bucket: 'events-promo', eventBucket: 'promo', title: '홍보' },
  { id: '2', bucket: 'events-seminar', eventBucket: 'seminar', title: '세미나' },
  { id: '3', bucket: 'events-revival', eventBucket: 'revival', title: '부흥회' },
  { id: '4', bucket: 'events-custom', eventBucket: customId, title: '수험생 종일기도' },
  { id: '5', bucket: 'events-custom', eventBucket: 'other-custom', title: '다른 커스텀' }
];

const customList = eventsFilter(sample, customId);
assert(customList.length === 1 && customList[0].id === '4', 'custom folder only matching eventBucket');
const oldCustomList = oldEventsFilter(sample, customId);
assert(oldCustomList.length >= 4, `old filter leaked ${oldCustomList.length} events-* into custom folder`);

for (const type of ['seminar', 'revival', 'promo', 'pastor-conference']) {
  const n = eventsFilter(sample, type).length;
  const o = oldEventsFilter(sample, type).length;
  assert(n === o, `${type} count unchanged (${n} vs ${o})`);
}

const d = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/videos.json'), 'utf8'));
const visible = d.videos.filter(v => !v.hidden);
const promoCount = eventsFilter(visible, 'promo').length;
const seminarCount = eventsFilter(visible, 'seminar').length;
console.log(`실데이터 — promo ${promoCount}편, seminar ${seminarCount}편`);

if (failed) {
  console.error(`\n${failed} test(s) failed`);
  process.exit(1);
}
console.log('All events custom tests passed');
