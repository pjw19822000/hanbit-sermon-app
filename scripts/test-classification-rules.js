/**
 * 분류 규칙 매칭 회귀 테스트 (store.js DEFAULT 미러)
 */
const DEFAULT_CLASSIFICATION_RULES = [
  { id: 'prayer-pastor-seminar', enabled: true, keywords: ['목회자 세미나', '목회자세미나'], excludeKeywords: [], category: 'prayer', prayerSeries: 'pastor-seminar', priority: 95 },
  { id: 'praise-sharon', enabled: true, keywords: ['샤론'], excludeKeywords: [], category: 'praise', praiseSub: 'sharon', priority: 75 },
  { id: 'praise-hallelujah', enabled: true, keywords: ['할렐루야'], excludeKeywords: ['목사', '전도사', '집사', '저녁기도회', '새벽기도회', '저녁 기도', '새벽 기도'], category: 'praise', praiseSub: 'hallelujah', priority: 74 },
  { id: 'praise-festival', enabled: true, keywords: ['찬양제'], excludeKeywords: [], category: 'praise', praiseSub: 'festival', priority: 73 },
  { id: 'praise-gideon', enabled: true, keywords: ['기드온'], excludeKeywords: [], category: 'praise', praiseSub: 'gideon', priority: 76 },
  { id: 'events-seminar', enabled: true, keywords: ['세미나', '수련회'], excludeKeywords: ['목회자 세미나', '목회자세미나'], category: 'events', eventSub: 'seminar', priority: 51 },
  { id: 'testimony', enabled: true, keywords: ['간증'], excludeKeywords: ['목자 컨퍼런스'], category: 'testimony', priority: 83 }
];

function match(title, rules = DEFAULT_CLASSIFICATION_RULES) {
  const sorted = [...rules].filter(r => r.enabled !== false).sort((a, b) => (b.priority || 0) - (a.priority || 0));
  for (const rule of sorted) {
    const t = String(title || '').normalize('NFC');
    if ((rule.excludeKeywords || []).some(k => k && t.includes(k))) continue;
    const kws = (rule.keywords || []).filter(Boolean);
    if (kws.some(k => t.includes(k))) return rule;
  }
  return null;
}

let failed = 0;
function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); failed++; }
}

assert(match('260712 기드온 앙상블')?.praiseSub === 'gideon', '기드온 → gideon');
assert(match('샤론_찬양')?.praiseSub === 'sharon', '샤론 → sharon');
assert(match('할렐루야찬양대')?.praiseSub === 'hallelujah', '할렐루야 → hallelujah');
assert(match('할렐루야_저녁기도회_백용현') == null || match('할렐루야_저녁기도회_백용현').category !== 'praise', '할렐루야+기도회 제외');
assert(match('목회자 세미나 2024')?.prayerSeries === 'pastor-seminar', '목회자 세미나 → prayer');
assert(match('청년 수련회')?.eventSub === 'seminar', '수련회 → seminar');
assert(match('간증예배')?.category === 'testimony', '간증 → testimony');

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log('All classification rule tests passed');
