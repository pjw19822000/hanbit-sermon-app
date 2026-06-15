/**
 * byBaekView 성경별 구약/신약·권별 카운트 회귀 테스트
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const storeSrc = fs.readFileSync(path.join(ROOT, 'js', 'store.js'), 'utf8');
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'config.json'), 'utf8'));
const db = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'videos.json'), 'utf8'));

const sandbox = {
  console,
  Firebase: { isEnabled: () => false },
  Admin: undefined,
  document: { querySelector: () => null },
  window: {},
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  fetch: async (url) => {
    const u = String(url);
    if (u.includes('config.json')) return { ok: true, json: async () => config };
    if (u.includes('index.json')) return { ok: false, status: 404 };
    if (u.includes('videos.json')) return { ok: true, json: async () => db };
    return { ok: false, status: 404 };
  }
};
vm.createContext(sandbox);
vm.runInContext(`${storeSrc}\nthis.Store = Store;`, sandbox);

const Store = sandbox.Store;

function dedupe(videos) {
  return Store.countUniqueSermons(videos);
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  sandbox.window.HANBIT_FIREBASE = { enabled: false };
  await Store.load();

  const otAll = Store.byBaekView('bible', '', '구약');
  const ntAll = Store.byBaekView('bible', '', '신약');
  const genesisBugPath = Store.byBaekView('bible', '창세기', '구약');
  const genesisDirect = Store.byBaekView('bible', '창세기');
  const matthewBugPath = Store.byBaekView('bible', '마태복음', '신약');

  assert(dedupe(otAll) > 0, '구약 데이터 없음');
  assert(dedupe(ntAll) > 0, '신약 데이터 없음');

  assert(
    genesisBugPath.every(v => v.book === '창세기'),
    '창세기+구약 testament 조합 시 창세기만 나와야 함'
  );
  assert(
    genesisDirect.every(v => v.book === '창세기'),
    '창세기 단독 조회 실패'
  );
  assert(
    matthewBugPath.every(v => v.book === '마태복음'),
    '마태복음+신약 testament 조합 시 마태복음만 나와야 함'
  );
  assert(
    dedupe(genesisBugPath) !== dedupe(otAll) || dedupe(genesisDirect) === 0,
    '창세기 카운트가 구약 전체와 같으면 버그'
  );

  const otBooks = Store.OT_BOOKS.filter(b => Store.byBaekView('bible', b).length);
  let perBookOk = true;
  for (const b of otBooks.slice(0, 5)) {
    const perBook = dedupe(Store.byBaekView('bible', b, '구약'));
    const expected = dedupe(Store.byBaekView('bible', b));
    if (perBook !== expected) {
      perBookOk = false;
      console.error(`권별 불일치: ${b} perBook=${perBook} expected=${expected}`);
    }
  }
  assert(perBookOk, '구약 권별 카운트 불일치');

  const otViaSub = Store.byBaekView('bible', '구약');
  assert(dedupe(otViaSub) === dedupe(otAll), 'sub=구약 과 testament=구약 결과 일치');

  console.log('OK — byBaekView 성경별 카운트/필터');
  console.log(`  구약: ${dedupe(otAll)}, 신약: ${dedupe(ntAll)}, 창세기: ${dedupe(genesisBugPath)}`);
}

main().catch(e => {
  console.error('FAIL:', e.message);
  process.exit(1);
});
