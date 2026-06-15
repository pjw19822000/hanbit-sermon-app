#!/usr/bin/env node
/** Cloudflare Pages 배포용 upload/ 폴더 생성 (Node) */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const UPLOAD = path.join(ROOT, 'upload');
const INCLUDE = ['index.html', 'manifest.json', 'css', 'js', 'icons', 'sw.js', '_redirects', '_headers'];
const DATA_FILES = ['index.json', 'config.json'];
const OPTIONAL_DATA = ['videos.json'];

function copyItem(src, dst) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.cpSync(src, dst, { recursive: true });
  } else {
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
  }
}

function rmDir(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

function main() {
  fs.mkdirSync(UPLOAD, { recursive: true });

  for (const name of INCLUDE) {
    const src = path.join(ROOT, name);
    if (fs.existsSync(src)) copyItem(src, path.join(UPLOAD, name));
  }

  const dataOut = path.join(UPLOAD, 'data');
  fs.mkdirSync(dataOut, { recursive: true });
  for (const fname of DATA_FILES) {
    const src = path.join(ROOT, 'data', fname);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(dataOut, fname));
    } else {
      console.warn(`[WARN] data/${fname} missing — run: node scripts/build-shards.js`);
    }
  }
  for (const fname of OPTIONAL_DATA) {
    const src = path.join(ROOT, 'data', fname);
    if (fs.existsSync(src)) {
      try {
        fs.copyFileSync(src, path.join(dataOut, fname));
      } catch (e) {
        console.warn(`[WARN] data/${fname} copy skipped (${e.message})`);
      }
    }
  }

  const shardsSrc = path.join(ROOT, 'data', 'shards');
  if (fs.existsSync(shardsSrc)) {
    copyItem(shardsSrc, path.join(dataOut, 'shards'));
  } else {
    console.warn('[WARN] data/shards/ missing — run: node scripts/build-shards.js');
  }

  let size = 0;
  const walk = (dir) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(p);
      else size += fs.statSync(p).size;
    }
  };
  walk(UPLOAD);
  console.log(`upload/ ready (${Math.floor(size / 1024)} KB) - Cloudflare Pages에 이 폴더를 업로드하세요`);
}

main();
