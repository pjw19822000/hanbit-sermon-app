/**
 * data/videos.json → data/index.json + data/shards/*.json
 * (build-videos.py 와 동일한 분할 로직)
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const VIDEOS_PATH = path.join(ROOT, 'data', 'videos.json');
const SHARDS_DIR = path.join(ROOT, 'data', 'shards');
const INDEX_PATH = path.join(ROOT, 'data', 'index.json');

function videoShard(v) {
  const b = v.bucket || '';
  if (b === 'baek-regular') return 'baek';
  if (b === 'prayer-ministry') return 'prayer';
  if (b === 'associate') return 'associate';
  if (b === 'praise') return 'praise';
  if (b === 'misc-unclassified' || b === 'other') return 'misc';
  if (b.startsWith('events-') || v.eventBucket) return 'events';
  return 'misc';
}

function sermonDedupeKey(v) {
  const date = (v.date || v.uploadedAt || '').slice(0, 10);
  const title = (v.sermonTitle || v.displayTitle || '').trim();
  const scr = (v.scripture || '').trim();
  return `${date}|${title}|${scr}`;
}

function countUnique(videos) {
  return new Set(videos.map(sermonDedupeKey)).size;
}

function isPublicVisible(v) {
  return !v.hidden;
}

function main() {
  if (!fs.existsSync(VIDEOS_PATH)) {
    console.error('Missing data/videos.json — run build-videos.py first');
    process.exit(1);
  }
  const out = JSON.parse(fs.readFileSync(VIDEOS_PATH, 'utf8'));
  const videos = out.videos || [];
  const grouped = { baek: [], prayer: [], associate: [], events: [], praise: [], misc: [] };
  videos.forEach(v => grouped[videoShard(v)].push(v));

  fs.mkdirSync(SHARDS_DIR, { recursive: true });
  const shardMeta = {};
  for (const [name, items] of Object.entries(grouped)) {
    const rel = `data/shards/${name}.json`;
    fs.writeFileSync(
      path.join(SHARDS_DIR, `${name}.json`),
      JSON.stringify({ videos: items }),
      'utf8'
    );
    shardMeta[name] = {
      path: rel,
      count: items.length,
      visibleCount: items.filter(isPublicVisible).length
    };
  }

  const baekReg = grouped.baek.filter(v => isPublicVisible(v) && v.isBaek && v.bucket === 'baek-regular');
  const homeCounts = {
    'baek-hub': baekReg.length,
    'prayer-hub': grouped.prayer.filter(isPublicVisible).length,
    'associate-hub': grouped.associate.filter(isPublicVisible).length,
    'events-hub': grouped.events.filter(v => isPublicVisible(v) && String(v.bucket || '').startsWith('events-')).length,
    testimony: grouped.events.filter(v => isPublicVisible(v) && v.bucket === 'events-testimony').length,
    'praise-hub': grouped.praise.filter(isPublicVisible).length,
    'misc-unclassified': grouped.misc.filter(v => isPublicVisible(v) && v.bucket === 'misc-unclassified').length,
    'worship-regular': baekReg.filter(v => v.worship).length
  };

  const index = {
    meta: out.meta,
    bibleBooks: out.bibleBooks,
    themes: out.themes,
    associates: out.associates,
    shards: shardMeta,
    homeCounts,
    format: 'sharded-v1'
  };
  fs.writeFileSync(INDEX_PATH, JSON.stringify(index), 'utf8');
  console.log(`index.json + ${Object.keys(grouped).length} shards OK (${countUnique(videos.filter(isPublicVisible))} visible unique)`);
}

main();
