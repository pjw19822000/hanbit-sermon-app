/**
 * index.json + shard 분할 로드 회귀 테스트
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const storeSrc = fs.readFileSync(path.join(ROOT, 'js', 'store.js'), 'utf8');
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'config.json'), 'utf8'));
const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'index.json'), 'utf8'));
const shards = {};
for (const name of Object.keys(index.shards || {})) {
  shards[name] = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'shards', `${name}.json`), 'utf8'));
}

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
    if (u.includes('index.json')) return { ok: true, json: async () => index };
    const m = u.match(/shards\/([a-z]+)\.json/);
    if (m && shards[m[1]]) return { ok: true, json: async () => shards[m[1]] };
    return { ok: false, status: 404 };
  }
};

vm.createContext(sandbox);
vm.runInContext(`${storeSrc}\nthis.Store = Store;`, sandbox);
const Store = sandbox.Store;

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  await Store.load();
  assert(Store.db().shards, 'shards meta missing');
  assert(Store.getHomeMenuCount('baek-hub') > 0, 'homeCounts baek-hub from index');

  await Store.ensureViewReady('baek-bible');
  assert(Store.isViewReady('baek-bible'), 'baek shard ready');
  assert(Store.baekRegular().length > 0, 'baekRegular after shard load');
  assert(
    Store.byBaekView('bible', '창세기', '구약').every(v => v.book === '창세기'),
    '창세기 필터'
  );

  await Store.prefetchAllShards();
  assert(Store.areAllShardsReady(), 'all shards loaded');
  assert(Store.db().videos.length > 1000, 'merged video count');

  const search = await Store.search('창세기');
  assert(search.length > 0, 'search after all shards');

  console.log('OK — sharded load');
  console.log(`  home baek-hub: ${Store.getHomeMenuCount('baek-hub')}, videos: ${Store.db().videos.length}`);
}

main().catch(e => {
  console.error('FAIL:', e.message);
  process.exit(1);
});
