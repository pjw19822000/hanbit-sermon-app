/**
 * 메뉴 순서 로직 단위 테스트 (store.js 미러)
 */
const HOME_CARD_ORDER = ['baek', 'prayer'];
const HOME_LINK_ORDER = ['associate', 'events', 'testimony', 'praise'];

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

function getHomeMenuOrder(config) {
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

let failed = 0;
function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); failed++; }
}

const defaultOrder = getDefaultHomeMenuOrder();
assert(defaultOrder.join(',') === 'baek,prayer,associate,events,testimony,praise', 'default home order');

const reordered = getHomeMenuOrder({ homeMenuOrder: ['praise', 'baek', 'testimony', 'prayer'] });
assert(reordered[0] === 'praise' && reordered[1] === 'baek', 'custom home order');
assert(reordered.length === 6, 'home order length preserved');
assert(new Set(reordered).size === 6, 'no duplicate home keys');

const partial = getHomeMenuOrder({ homeMenuOrder: ['events', 'associate'] });
assert(partial[0] === 'events' && partial[1] === 'associate', 'partial order prefix');
assert(partial.includes('baek') && partial.includes('praise'), 'missing keys appended');

const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
const sorted = applyStoredOrder(items, ['c', 'a'], x => x.id);
assert(sorted.map(x => x.id).join(',') === 'c,a,b', 'sub menu order with rest');

const empty = applyStoredOrder(items, [], x => x.id);
assert(empty.length === 3, 'empty order unchanged');

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log('All menu order tests passed');
