/**
 * matchVideoQuery 회귀 테스트 (store.js 로직 미러)
 */
const fs = require('fs');
const path = require('path');

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

function oldMatchVideoQuery(v, q) {
  const t = (q || '').trim().toLowerCase();
  if (!t) return true;
  return (v.title || '').toLowerCase().includes(t) ||
    (v.displayTitle || '').toLowerCase().includes(t) ||
    (v.speaker || '').toLowerCase().includes(t) ||
    (v.book || '').toLowerCase().includes(t) ||
    (v.scripture || '').toLowerCase().includes(t);
}

function needsAdminReview(v) {
  const bucket = v.bucket || '';
  if (!bucket || bucket === 'other') return true;
  if (bucket === 'praise' && !v.praiseSub) return true;
  return false;
}

const d = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/videos.json'), 'utf8'));
let failed = 0;

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    failed++;
  }
}

// 1) NFD 저장 영상 — 할렐루야/임마누엘/샤론 검색
const nfdHall = d.videos.filter(v => (v.displayTitle || '').normalize('NFC').includes('할렐'));
const nfdIm = d.videos.filter(v => (v.displayTitle || '').normalize('NFC').includes('임마누'));
const nfdSharonOther = d.videos.filter(v =>
  v.bucket === 'other' && (v.displayTitle || '').normalize('NFC').includes('샤론')
);

for (const v of nfdHall) assert(matchVideoQuery(v, '할렐루야'), `할렐루야: ${v.displayTitle}`);
for (const v of nfdIm) assert(matchVideoQuery(v, '임마누엘'), `임마누엘: ${v.displayTitle}`);
for (const v of nfdSharonOther) assert(matchVideoQuery(v, '샤론'), `샤론: ${v.displayTitle}`);

console.log(`NFD 할렐 ${nfdHall.length}편 — old 실패 ${nfdHall.filter(v => !oldMatchVideoQuery(v, '할렐루야')).length}, new 실패 ${nfdHall.filter(v => !matchVideoQuery(v, '할렐루야')).length}`);
console.log(`NFD 임마누엘 ${nfdIm.length}편 — old 실패 ${nfdIm.filter(v => !oldMatchVideoQuery(v, '임마누엘')).length}, new 실패 ${nfdIm.filter(v => !matchVideoQuery(v, '임마누엘')).length}`);
console.log(`other+샤론 ${nfdSharonOther.length}편 — old 실패 ${nfdSharonOther.filter(v => !oldMatchVideoQuery(v, '샤론')).length}, new 실패 ${nfdSharonOther.filter(v => !matchVideoQuery(v, '샤론')).length}`);

// 2) 분류되지 않은 영상 시뮬레이션
const unclass = d.videos.filter(needsAdminReview);
const unclassHall = unclass.filter(v => (v.displayTitle || '').normalize('NFC').includes('할렐'));
assert(unclassHall.every(v => matchVideoQuery(v, '할렐루야')), 'unclassified 할렐루야 전체');
console.log(`분류 미완+할렐 ${unclassHall.length}편 검색 OK`);

// 3) 기존 검색 회귀 — 백용현 설교 500편
const baek = d.videos.filter(v => v.bucket === 'baek-regular').slice(0, 500);
for (const v of baek) {
  for (const q of [v.book, v.speaker, v.displayTitle?.slice(0, 4)].filter(Boolean)) {
    const oldOk = oldMatchVideoQuery(v, q);
    const newOk = matchVideoQuery(v, q);
    if (oldOk && !newOk) assert(false, `regression lost: ${v.id} q=${q}`);
  }
}
console.log(`백용현 설교 회귀 검사 ${baek.length}편 — 기존 매치 유지`);

// 4) 빈 검색어
assert(matchVideoQuery(d.videos[0], ''), 'empty query');
assert(matchVideoQuery(d.videos[0], '   '), 'whitespace query');

// 5) praiseSub 라벨 검색
const praiseH = d.videos.filter(v => v.praiseSub === 'hallelujah').slice(0, 20);
for (const v of praiseH) {
  assert(matchVideoQuery(v, '할렐루야찬양대'), `praiseSub label: ${v.id}`);
}

if (failed) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log('\nAll tests passed');
